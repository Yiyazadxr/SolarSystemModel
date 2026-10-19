/**
 * 程序化音效：Web Audio 实时合成，零音频文件、零联网请求。
 *   - 默认开启（无历史记录时）：设置面板「音效」可关，状态写 localStorage
 *     （file:// 下部分浏览器禁用 localStorage，读写都包 try，失败只退化为
 *     "本次会话不记忆"；音频本身仍可用，不受影响）。
 *   - AudioContext 延迟创建：只在第一次 play() 时建，那次调用必来自用户手势，
 *     规避浏览器自动播放策略；没有 Web Audio 的环境整体静默。
 *   - 音极短、增益极低（≤0.07）：选中 / 模式切换 / 开关各一枚，不加背景音乐。
 *
 * 依赖：无（只用 window.AudioContext 与 localStorage）
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Audio = (function () {
  'use strict';

  var STORE_KEY = 'solar.audio.enabled';
  var MASTER_GAIN = 0.5;             // 总音量：单音增益已压到 0.03~0.07，这里再留余量

  var ctx = null;
  var master = null;
  var enabled = false;

  /* 没有历史记录时默认开启；localStorage 不可用（隐私模式 / file:// 限制）同样默认开启，
     只是这次选择不会被记住。 */
  function readPref() {
    try {
      var v = window.localStorage.getItem(STORE_KEY);
      return v === null ? true : v === '1';
    }
    catch (e) { return true; }
  }

  function writePref(on) {
    try { window.localStorage.setItem(STORE_KEY, on ? '1' : '0'); }
    catch (e) { /* file:// 或隐私模式下禁用存储：不记忆，不影响本次播放 */ }
  }

  /* 延迟建上下文：浏览器要求 AudioContext 在用户手势内创建/恢复才允许发声 */
  function ensureCtx() {
    if (ctx) return ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch (e) { ctx = null; }
    if (!ctx) return null;
    try {
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    } catch (e2) { master = null; }
    return ctx;
  }

  /* 播放一枚"频率包络"音：从 freq 滑到 endFreq，时长 dur 秒，音量峰值 gain */
  function tone(freq, endFreq, dur, gain, type, delay) {
    var c = ctx;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var env = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    /* 指数包络：起振 8ms、收尾自然衰减，避免方波 click 的爆音 */
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(master || c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function resumeIfSuspended() {
    /* Safari 在电话/闹钟中断后会把 AudioContext 置为 WebKit 特有的 'interrupted'，
       只判 'suspended' 会永远跳过 resume → 整页会话静音。凡非 running 都尝试恢复。 */
    if (!ctx || ctx.state === 'running' || !ctx.resume) return;
    try {
      var r = ctx.resume();
      /* resume() 返回 Promise：这里只做"不产生未处理拒绝"的兜底，不构成控制流 */
      if (r && typeof r.then === 'function') r.then(null, function () { });
    } catch (e) { /* 忽略：恢复失败时本次播放静默 */ }
  }

  /**
   * 触发一枚音效。name：
   *   select  选中天体：轻微上滑音（信息卡 / 列表 / 巡航选中都走这里）
   *   mode    演示 ↔ 教学模式切换：双音上扬
   *   toggle  开关拨动：极短 tick（含音效开关自身的反馈）
   * 关闭状态或环境不支持时静默返回，调用方无需判断。
   */
  function play(name) {
    if (!enabled) return;
    var c = ensureCtx();
    if (!c) return;
    resumeIfSuspended();
    if (name === 'select') {
      tone(620, 940, 0.11, 0.05, 'sine', 0);
    } else if (name === 'mode') {
      tone(392, 392, 0.16, 0.05, 'sine', 0);
      tone(587, 587, 0.20, 0.045, 'sine', 0.13);
    } else if (name === 'toggle') {
      /* 极短 tick：三角波 + 微上扬 + 0.05s；方波在这档增益下几乎听不见 */
      tone(880, 1560, 0.05, 0.06, 'triangle', 0);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    writePref(enabled);
    if (enabled) ensureCtx();     // 开启瞬间就在手势内建好上下文，随后播放不再延迟
    return enabled;
  }

  enabled = readPref();

  return {
    play: play,
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; },
    /* 供能力探测：有 Web Audio 才在设置面板放行开关 */
    isSupported: function () { return !!(window.AudioContext || window.webkitAudioContext); }
  };
})();
