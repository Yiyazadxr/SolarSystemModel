/**
 * 界面层：HUD 微动效驱动（SOLAR.UIFx）
 * 为什么独立成文件：列表错峰、信息卡切换、数字滚动分别发生在 ui-nav /
 * ui-info / ui-time 三个子模块，驱动逻辑收在一处，子模块只发指令、不养状态
 * （与 scene-shaders / scene-gfx 的拆分思路相同：跨模块共用件单独成文件）。
 *
 * 职责边界：
 *   - 只做「播完即弃」的一次性动效与文本补间；长期氛围动画（选中脉冲等）
 *     一律走 CSS keyframes，不占 JS 主循环。
 *   - 性能契约：单个 rAF 循环 + 固定容量实例池，逐帧零分配；补间直接写
 *     textContent，不建中间 DOM。
 *   - 画质门控：setEnabled(false)（LOW 档或「界面动效」总开关关闭）时补间
 *     直接落终值；CSS 侧装饰动画由 body.quality-low / body.no-hud-fx 关闭
 *     （见 style.css 末尾「动效总门控」），刻意不跟随系统 prefers-reduced-motion。
 *
 * 依赖：无（纯 DOM + rAF）。语法：ES5 + IIFE。
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UIFx = (function () {
  'use strict';

  var POOL_SIZE = 16;        // 并发补间上限：读数类场景最多几个同时在跑，池满丢弃（装饰不堆积）
  var MAX_FRAME_MS = 50;     // 单帧 dt 钳制：切回标签页的大尖峰不参与插值

  var pool = [];             // 固定池：{ el, from, to, dur, t, fmt, active }
  var rafId = 0;
  var lastAt = 0;
  var enabled = true;

  /* 与相机飞行一致的减速度曲线：HUD 读数补间用同一套缓动语言 */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function acquire() {
    var i;
    for (i = 0; i < pool.length; i++) {
      if (!pool[i].active) return pool[i];
    }
    if (pool.length >= POOL_SIZE) return null;
    var slot = { el: null, from: 0, to: 0, dur: 0, t: 0, fmt: null, active: false };
    pool.push(slot);
    return slot;
  }

  /* 注意：不在此处重置 lastAt。曾在 schedule 里重置基准，而 frame 结尾又会
     调 schedule——等于每帧 dt 都被打成 0，补间永远停在起点值，读数出现
     "即时落值 ↔ 冻结起点"的振荡（倍速 10x↔1x 跳动即此根因）。
     基准改在循环停止（frame 末尾无在跑补间）时重置，下次启动重新建立原点。 */
  function schedule() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(frame);
  }

  function frame(at) {
    rafId = 0;
    var dt = lastAt ? Math.min(at - lastAt, MAX_FRAME_MS) : 0;
    lastAt = at;
    var running = 0;
    for (var i = 0; i < pool.length; i++) {
      var s = pool[i];
      if (!s.active) continue;
      s.t += dt;
      var k = s.dur > 0 ? s.t / s.dur : 1;
      if (k >= 1 || !isFinite(k)) {
        s.el.textContent = s.fmt(s.to);
        s.active = false;
        continue;
      }
      s.el.textContent = s.fmt(s.from + (s.to - s.from) * easeOut(k));
      running++;
    }
    if (running > 0) schedule();
    else lastAt = 0;   // 循环停止：下次启动时首帧 dt 记 0，重新建立时间原点
  }

  /**
   * 数字补间：from → to，dur 毫秒，fmt 负责把数值渲染成文本。
   * - enabled=false（LOW 档 / 减弱动效）时直接落终值，不占帧；
   * - 同一元素上的新补间顶掉旧补间（读数只关心最新目标值），
   *   重定向保留已播时长：连续拖动滑块时读数平滑追赶，不会每步从头重播；
   * - 即时落值路径必须先作废在跑的补间：否则"直接写终值"与"补间插值"
   *   会交替抢写 textContent，读数出现跳到终值又被拉回重播的跳动
   *   （倍速 / JD 读数每帧都被 tick 刷新，这条路径必然被走到）。
   */
  function tweenText(el, from, to, dur, fmt) {
    if (!el || typeof fmt !== 'function') return;
    var running = null;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].active && pool[i].el === el) { running = pool[i]; break; }
    }
    if (!enabled || !isFinite(from) || !isFinite(to) || !(dur > 0) || from === to) {
      if (running) running.active = false;
      el.textContent = fmt(to);
      return;
    }
    var slot = running;
    if (!slot) {
      slot = acquire();
      if (!slot) { el.textContent = fmt(to); return; }
      /* 池中槽位是上一次补间用完的：t 停在 >= dur 的位置。不清零的话新补间
         一上来 k 就 >= 1，直接落终值——表现为"只有第一次变化有滚动，
         之后全部瞬跳"（倍速读数就是这样坏的）。 */
      slot.t = 0;
    }
    slot.el = el;
    slot.from = from;
    slot.to = to;
    slot.dur = dur;
    slot.fmt = fmt;
    slot.active = true;   // 重定向（同元素已在播）才保留已播时长，见上方 slot.t = 0
    schedule();
  }

  /* 该元素当前是否有补间在播（调用方据此决定不打断读数滚动） */
  function isTweening(el) {
    if (!el) return false;
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].active && pool[i].el === el) return true;
    }
    return false;
  }

  /**
   * 重启动画：移除 cls → 强制 reflow → 加回。
   * 用于「同状态再次触发」（信息卡连续切换、读数变化高亮）——比依赖
   * display:none→block 的动画重启行为确定（浏览器之间有差异）。
   * 这里的 offsetWidth 读取是故意的一次性强制布局，不构成循环内读写交替。
   */
  function restart(el, cls) {
    if (!el || !cls) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /* 关闭时把在跑补间立刻落到终值，避免读数停在中间值 */
  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) {
      for (var i = 0; i < pool.length; i++) {
        var s = pool[i];
        if (s.active && s.fmt) s.el.textContent = s.fmt(s.to);
        s.active = false;
      }
    }
  }

  return {
    tweenText: tweenText,
    isTweening: isTweening,
    restart: restart,
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; }
  };
})();
