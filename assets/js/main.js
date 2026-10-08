/**
 * 应用启动与主循环：串联场景、后期效果、交互控制和界面层
 * 依赖：Three.js r128 UMD 及全部 SOLAR 模块
 *
 * 设计要点（性能 / 稳定性）：
 *   1. 帧时间累加器：dt 做上限钳制；累加器按帧间隔"扣减取余"而非清零，避免长时间漂移；
 *      标签页隐藏时暂停渲染与计时，恢复时重置基准，杜绝切回瞬间的大 dt 尖峰。
 *   2. FPS 统计：滑动窗口 + 异常值剔除 + 截尾平均（去掉一个最高 / 最低），读数更稳。
 *   3. 自适应画质：连续多个采样窗口低帧才降级、连续多个窗口高帧才回升一级，
 *      带滞回区间与冷却时间，避免档位抖动；降级时同步 UI 画质下拉框。
 *   4. 时间推进：固定步长积分 + 单步最大推进天数 + 欠账结转平滑，
 *      高速倍速（最高 1e9）下不出现轨道跳变；暂停 / 倒流 / 跳转后状态一致。
 *   5. 错误与兼容：WebGL 不可用给出双语提示；主循环单帧 try/catch，
 *      连续失败才停止并提示；加载进度有最短动画时长，纹理少时也不会"闪一下就消失"。
 *   6. 可观测性：FPS / 三角面 / 天体数 / 内存（如可用）一并通过 UI 可选接口上报。
 *
 * 语法：ES5 + IIFE，不引入任何外部资源
 */
window.SOLAR = window.SOLAR || {};

(function () {
  'use strict';

  var C = SOLAR.CONFIG;

  /* ================= 常量 ================= */

  var FPS_CAP = (C.render && C.render.fpsCap > 0) ? C.render.fpsCap : 180;  // 帧率上限
  var FRAME_INTERVAL = 1000 / FPS_CAP;      // 帧间隔（ms）
  var MAX_FRAME_MS = 100;                   // 单帧 elapsed 上限（ms）：钳制长任务 / 切回标签页的尖峰
  var MAX_ACCUM_MS = MAX_FRAME_MS;          // 累加器上限：仅作兜底，正常不会触发（避免时间被"吃掉"）
  var FPS_WINDOW = 60;                      // FPS 滑动窗口帧数
  var FPS_MIN_VALID = 1;                    // 低于 1 FPS（dt > 1s）视为异常样本
  var FPS_MAX_VALID = FPS_CAP * 1.5;        // 高于 1.5 倍上限视为异常样本（理论上不可能出现）
  var TRIM_MIN_SAMPLES = 8;                 // 样本数达到该值后启用截尾平均

  var HOVER_INTERVAL_MS = 70;               // 悬停拾取节流（射线 + 屏幕空间兜底较贵）
  var MIN_LOADING_MS = 900;                 // 加载动画最短展示时长，避免一闪而过
  var LOADING_FALLBACK_MS = 6000;           // 兜底：超时无条件进入场景
  var LOADING_IDLE_MS = 400;                // 该时间内没有加载回调（纹理数为 0）则直接补满进度
  var MAX_FRAME_ERRORS = 8;                 // 连续异常帧上限，超过则停止主循环
  var MAX_LOGGED_ERRORS = 3;                // 控制台最多打印的帧异常条数，避免刷屏

  var QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'];  // 由低到高，便于升降级
  var QUALITY_COOLDOWN_MS = 4000;           // 两次自动画质调整的最小间隔
  var DEGRADE_WINDOWS = 2;                  // 连续多少个采样窗口低帧才降级
  var UPGRADE_WINDOWS = 3;                  // 连续多少个采样窗口高帧才回升
  var HYSTERESIS_FPS = 25;                  // 回升阈值 = 降级阈值 + 滞回区间

  /* 时间推进（固定步长 + 限流 + 结转） */
  var TIME_STEP = 1 / 120;                  // 固定积分步长（真实秒）
  var MAX_TIME_STEPS = 8;                   // 单帧最多积分步数
  var MAX_DAYS_PER_STEP = 4;                // 单步最大推进天数：高速倍速下防止轨道跳变
  var CARRY_CAP_DAYS = 60;                  // 欠账上限，超出丢弃（防止长时间欠账后暴走）
  var CARRY_DIGEST_RATE = 0.15;             // 每帧消化欠账的比例
  var CARRY_MAX_PER_FRAME = MAX_DAYS_PER_STEP; // 每帧最多补推进的天数

  var MEMORY_SAMPLE_MS = 1000;              // 内存读数采样间隔（避免每帧读 performance.memory）
  var RESIZE_DEBOUNCE_MS = 120;             // 窗口尺寸变化防抖

  /* ================= 运行时状态 ================= */

  var context = null;
  var previousRafTime = 0;
  var frameAccumulator = 0;

  var fpsSamples = [];
  var fpsSum = 0;
  var fpsWindow = FPS_WINDOW;
  var lastFps = 0;

  var degradeSamples = [];
  var degradeSum = 0;
  var badWindows = 0;
  var goodWindows = 0;

  var currentQuality = 'high';
  var manualQuality = false;                // 用户手动选过画质后，不再自动回升
  var autoDegradeAllowed = !!(C.autoDegrade && C.autoDegrade.enabled);   // 运行期是否允许自动降/升画质
  var lastQualityChange = 0;

  var pointer = { x: 0, y: 0, inside: false, dirty: false };
  var lastHoverAt = 0;

  var galaxyDelta = null;

  var uiReady = false;
  var loadingPending = false;
  var loadingComplete = false;
  var loadingFallback = null;
  var loadingStart = 0;
  var progressValue = 0;
  var progressTarget = 0;
  var progressRaf = 0;

  var running = false;
  var paused = false;
  var rafId = 0;
  var frameErrors = 0;
  var loggedErrors = 0;

  var simAccum = 0;                         // 待积分的真实秒
  var carryDays = 0;                        // 被限流结转的模拟天数（带符号）
  var expectedJd = null;                    // 本模块上次推进后的 JD，用于识别外部改写
  var effectiveSpeed = 0;                   // 实际吞吐（模拟倍速），用 EMA 抑制单帧抖动

  var memoryMb = 0;
  var lastMemoryAt = 0;
  var resizeTimer = null;
  var contextLost = false;
  var resumeAfterContextRestore = false;
  var controlsEnabledBeforeContextLoss = true;
  var contextRestoreTimer = null;

  /* ================= 小工具 ================= */

  function nowMs() {
    if (window.performance && typeof window.performance.now === 'function') return window.performance.now();
    return new Date().getTime();
  }

  function clamp01(value) {
    if (typeof value !== 'number' || !isFinite(value)) return 0;
    return value < 0 ? 0 : (value > 1 ? 1 : value);
  }

  function logError(tag, error) {
    if (window.console && console.warn) console.warn('[SOLAR.main] ' + tag + ' 异常：', error);
  }

  function qualityIndex(name) {
    var index = QUALITY_ORDER.indexOf(name);
    return index < 0 ? QUALITY_ORDER.length - 1 : index;
  }

  /* 天体总数（用于运行状态上报） */
  function countBodies() {
    var D = SOLAR.DATA;
    var total = 1;                          // 太阳
    if (D) {
      if (D.bodies && D.bodies.length) total += D.bodies.length;
      if (D.moons && D.moons.length) total += D.moons.length;
      if (D.comets && D.comets.length) total += D.comets.length;
    }
    return total;
  }

  /* ================= WebGL / 启动错误 ================= */

  /* WebGL 可用性探测：只在临时 canvas 上取上下文，失败即给出双语提示 */
  function detectWebGL() {
    try {
      var probe = document.createElement('canvas');
      if (!probe.getContext) return false;
      var gl = probe.getContext('webgl') || probe.getContext('experimental-webgl') || probe.getContext('webgl2');
      if (!gl) return false;
      /* 主动释放探测上下文，避免占用浏览器的 WebGL 上下文配额 */
      try {
        var lose = gl.getExtension('WEBGL_lose_context');
        if (lose && lose.loseContext) lose.loseContext();
      } catch (e) { /* 释放失败无影响 */ }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 在加载层显示不可恢复的启动错误（双语） */
  function showStartupError(message) {
    var screen = document.getElementById('loading-screen');
    var tip = screen ? screen.querySelector('.loader-tip') : null;
    var pct = document.getElementById('loader-pct');
    if (screen) {
      screen.classList.remove('hidden');
      screen.style.display = 'flex';
    }
    if (tip) tip.textContent = message;
    if (pct) pct.textContent = 'ERROR';
    if (window.console && console.error) console.error('[SOLAR.main] ' + message);
  }

  /* WebGL context lost 并非普通渲染帧异常：浏览器会停止该上下文的所有 GPU 命令。
     单独展示恢复状态，避免误报成应用初始化失败，并让 restored 后重建后期 RenderTarget。 */
  function showContextNotice(message, status) {
    var screen = document.getElementById('loading-screen');
    var tip = screen ? screen.querySelector('.loader-tip') : null;
    var pct = document.getElementById('loader-pct');
    if (screen) {
      screen.classList.remove('hidden');
      screen.style.display = 'flex';
    }
    if (tip) tip.textContent = message;
    if (pct) pct.textContent = status || 'RECOVERING';
  }

  /* ================= 加载进度 ================= */

  /* 以 rAF 把显示进度平滑推向目标值，并保证最短展示时长（纹理少时不会一闪而过） */
  function scheduleProgressFrame() {
    if (!progressRaf) progressRaf = window.requestAnimationFrame(tickProgress);
  }

  function tickProgress() {
    progressRaf = 0;
    var step = 16 / MIN_LOADING_MS;         // 约 16ms 一帧时的最小步长 → 0→100% 至少 MIN_LOADING_MS
    if (progressValue < progressTarget) {
      progressValue = Math.min(progressTarget, progressValue + step);
      SOLAR.UI.setProgress(progressValue);
    }
    if (progressValue >= progressTarget) {
      if (progressValue >= 1) requestComplete();
      return;
    }
    scheduleProgressFrame();
  }

  function onLoadProgress(progress) {
    progressTarget = Math.max(progressTarget, clamp01(progress));
    if (!loadingComplete) scheduleProgressFrame();
  }

  /* 进度到 100%（或兜底计时）：满足最短动画时长且 UI 就绪后进入场景 */
  function requestComplete() {
    if (loadingComplete) return;
    if (!uiReady) {
      loadingPending = true;                // UI 尚未初始化，bootstrap 末尾会补一次
      return;
    }
    var remaining = MIN_LOADING_MS - (nowMs() - loadingStart);
    if (remaining > 0) {
      if (loadingFallback) window.clearTimeout(loadingFallback);
      loadingFallback = window.setTimeout(completeLoading, remaining);
      return;
    }
    completeLoading();
  }

  /* 纹理加载结束，或兜底计时到达后进入场景 */
  function completeLoading() {
    if (loadingComplete) return;
    if (!uiReady) {
      loadingPending = true;
      return;
    }
    loadingComplete = true;
    if (loadingFallback) {
      window.clearTimeout(loadingFallback);
      loadingFallback = null;
    }
    if (progressRaf) {
      window.cancelAnimationFrame(progressRaf);
      progressRaf = 0;
    }
    progressValue = 1;
    progressTarget = 1;
    SOLAR.UI.setProgress(1);
    SOLAR.UI.hideLoading();
    /* 模式选择层由 hideLoading 在进度条走满 100% 后自行触发（ui.js），
       这里不再直接调用，避免进度未走完就弹窗。 */
  }

  /* ================= FPS 统计 ================= */

  /* 维护滑动窗口 FPS：剔除异常值后做截尾平均，读数更稳 */
  function updateFps(dt) {
    var instant = dt > 0 ? 1 / dt : 0;

    /* 异常样本（超长帧 / 不可能的高帧）不入窗口，避免污染均值 */
    if (instant < FPS_MIN_VALID || instant > FPS_MAX_VALID) {
      return { instant: lastFps, average: lastFps };
    }

    fpsSamples.push(instant);
    fpsSum += instant;
    if (fpsSamples.length > fpsWindow) fpsSum -= fpsSamples.shift();

    var average;
    if (fpsSamples.length >= TRIM_MIN_SAMPLES) {
      /* 截尾平均：去掉一个最高与一个最低，抑制抖动 */
      var min = Infinity, max = -Infinity, i, v;
      for (i = 0; i < fpsSamples.length; i++) {
        v = fpsSamples[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      average = (fpsSum - min - max) / (fpsSamples.length - 2);
    } else {
      average = fpsSum / fpsSamples.length;
    }

    lastFps = average;
    return { instant: instant, average: average };
  }

  function resetFpsStats() {
    fpsSamples.length = 0;
    fpsSum = 0;
    degradeSamples.length = 0;
    degradeSum = 0;
  }

  /* ================= 自适应画质 ================= */

  function syncQualitySelect(name) {
    var select = document.getElementById('quality-select');
    if (select && select.value !== name) select.value = name;   // 程序化赋值不会触发 change，安全
    /* 可选扩展：若 UI 提供了同步接口则一并调用 */
    if (SOLAR.UI && typeof SOLAR.UI.setQuality === 'function') {
      try { SOLAR.UI.setQuality(name); } catch (e) { logError('UI.setQuality', e); }
    }
  }

  /* 应用画质：同步场景 / 后期 / 下拉框，并重置自适应计数器 */
  function applyQuality(name, auto) {
    if (!C.quality[name]) return;
    currentQuality = name;
    try { SOLAR.Scene.setQuality(name); } catch (e) { logError('Scene.setQuality', e); }
    try { SOLAR.Effects.setQuality(name); } catch (e) { logError('Effects.setQuality', e); }
    syncQualitySelect(name);
    lastQualityChange = nowMs();
    badWindows = 0;
    goodWindows = 0;
    if (!auto) manualQuality = true;
  }

  /* 用户手动选定画质（顶部下拉框与设置面板分段按钮都走这里）：
     置 manualQuality 后不再自动回升；但默认设置下持续低帧仍可能自动降级（兜底设计，会同步改下拉框）。
     要完全禁止自动升降，调用 SOLAR.setAutoDegrade(false)。UI 侧经 SOLAR.setManualQuality 调用，缺失时各自降级处理。 */
  function setManualQuality(name) {
    if (!name || !C.quality[name]) return currentQuality;
    applyQuality(name, false);
    return currentQuality;
  }
  SOLAR.setManualQuality = setManualQuality;

  /* 教学模式等需要稳定画质的场景可关闭自动升降画质；
     关闭后既不自动降级也不自动回升，但仍可手动选档。返回当前状态。 */
  function setAutoDegrade(on) { autoDegradeAllowed = !!on; return autoDegradeAllowed; }
  SOLAR.setAutoDegrade = setAutoDegrade;
  SOLAR.isAutoDegrade = function () { return autoDegradeAllowed; };

  /* 按配置窗口连续采样：连续低帧降级、连续高帧回升一级（滞回 + 冷却，避免抖动） */
  function sampleAutoQuality(fps) {
    var config = C.autoDegrade;
    if (!config || !config.enabled || !(config.sampleWindow > 0)) return;
    if (!autoDegradeAllowed) return;          // 教学模式等场景会临时关闭自动降/升画质
    if (!(fps > 0)) return;

    degradeSamples.push(fps);
    degradeSum += fps;
    if (degradeSamples.length < config.sampleWindow) return;

    var average = degradeSum / degradeSamples.length;
    degradeSamples.length = 0;
    degradeSum = 0;

    var threshold = config.fpsThreshold;
    var upgradeThreshold = Math.min(FPS_CAP, threshold + HYSTERESIS_FPS);

    if (average < threshold) {
      badWindows++;
      goodWindows = 0;
    } else if (average > upgradeThreshold) {
      goodWindows++;
      badWindows = 0;
    } else {
      /* 滞回区间内保持不变 */
      badWindows = 0;
      goodWindows = 0;
    }

    if (nowMs() - lastQualityChange < QUALITY_COOLDOWN_MS) return;

    var index = qualityIndex(currentQuality);
    if (badWindows >= DEGRADE_WINDOWS && index > 0) {
      applyQuality(QUALITY_ORDER[index - 1], true);
    } else if (!manualQuality && goodWindows >= UPGRADE_WINDOWS && index < QUALITY_ORDER.length - 1) {
      applyQuality(QUALITY_ORDER[index + 1], true);
    }
  }

  /* ================= 时间推进 ================= */

  /* 把被限流的推进量记为欠账（带符号），并限制欠账规模 */
  function addCarry(days) {
    carryDays += days;
    if (carryDays > CARRY_CAP_DAYS) carryDays = CARRY_CAP_DAYS;
    else if (carryDays < -CARRY_CAP_DAYS) carryDays = -CARRY_CAP_DAYS;
  }

  /* 单步推进：超过单步上限的部分转入欠账，避免高速倍速下轨道跳变 */
  function stepTime(step) {
    var time = SOLAR.time;
    var dir = time.reverse ? -1 : 1;
    var days = step * Math.abs(time.speed || 0) * C.time.simDaysPerSecond;
    if (days > MAX_DAYS_PER_STEP) {
      addCarry((days - MAX_DAYS_PER_STEP) * dir);
      days = MAX_DAYS_PER_STEP;
    }
    time.jd += days * dir;
  }

  /* 消化欠账：每帧按比例补回，长时间高倍速下平均速度仍贴近设定值（平滑处理） */
  function digestCarry() {
    if (!carryDays) return;
    var sign = carryDays > 0 ? 1 : -1;
    var amount = Math.min(Math.abs(carryDays) * CARRY_DIGEST_RATE, CARRY_MAX_PER_FRAME);
    if (!(amount > 0)) return;
    SOLAR.time.jd += amount * sign;
    carryDays -= amount * sign;
    if (Math.abs(carryDays) < 1e-6) carryDays = 0;
  }

  /**
   * 时间推进：固定步长积分 + 单步上限 + 欠账结转
   * 暂停 / 倒流 / 日期跳转（UI 直接改写 jd）后自动重新同步，不残留推进量
   */
  function advanceTime(dt) {
    var time = SOLAR.time;
    if (!time) return;
    var beforeJd = time.jd;

    /* 识别外部改写（"回到现在" / 日期跳转 / 暂停期间的手工调整） */
    if (expectedJd === null || typeof expectedJd !== 'number') {
      expectedJd = time.jd;
    } else if (Math.abs(time.jd - expectedJd) > 1e-6) {
      simAccum = 0;
      carryDays = 0;
      expectedJd = time.jd;
    }

    if (!time.playing) {
      /* 暂停：清空待推进量与欠账，恢复播放时从当前 JD 平滑起步 */
      simAccum = 0;
      carryDays = 0;
    } else {
      simAccum += dt;
      var steps = 0;
      while (simAccum >= TIME_STEP && steps < MAX_TIME_STEPS) {
        simAccum -= TIME_STEP;
        stepTime(TIME_STEP);
        steps++;
      }
      /* 追不上就丢弃余量，避免越积越多（dt 已被钳制，正常不会走到这里） */
      if (simAccum >= TIME_STEP) simAccum = 0;
      digestCarry();
    }

    time.simDays = time.jd - C.time.j2000;
    expectedJd = time.jd;
    if (time.playing && dt > 0) {
      var measured = Math.abs(time.jd - beforeJd) / dt / C.time.simDaysPerSecond;
      if (!(effectiveSpeed > 0)) effectiveSpeed = measured;
      else effectiveSpeed = effectiveSpeed * 0.9 + measured * 0.1;
    } else {
      effectiveSpeed = 0;
    }
    time.effectiveSpeed = effectiveSpeed;
  }

  /* ================= 每帧逻辑 ================= */

  /* 鼠标悬停浮标：拾取屏幕坐标下的天体（按时间节流，射线检测较贵） */
  function updateHoverTooltip() {
    if (!pointer.inside) return;
    var t = nowMs();
    if (t - lastHoverAt < HOVER_INTERVAL_MS) return;
    lastHoverAt = t;
    pointer.dirty = false;
    var hit = SOLAR.Controls.hover(pointer.x, pointer.y);
    if (hit && hit.id) SOLAR.UI.showTooltip(hit.id, hit.x, hit.y);
    else SOLAR.UI.hideTooltip();
  }

  /* 内存读数（仅部分浏览器支持 performance.memory），按采样间隔读取 */
  function sampleMemory() {
    var t = nowMs();
    if (t - lastMemoryAt < MEMORY_SAMPLE_MS) return memoryMb;
    lastMemoryAt = t;
    var perf = window.performance;
    if (perf && perf.memory && typeof perf.memory.usedJSHeapSize === 'number') {
      memoryMb = perf.memory.usedJSHeapSize / (1024 * 1024);
    } else {
      memoryMb = 0;                        // 不支持时返回 0，UI 可据此显示占位
    }
    return memoryMb;
  }

  /* 运行状态上报：保持 UI.tick(fps, tris) 签名不变，额外指标走可选接口 */
  function reportStats(dt) {
    var fps = updateFps(dt);
    var triangles = 0;
    try { triangles = SOLAR.Scene.getTriangleCount(); } catch (e) { triangles = 0; }

    SOLAR.UI.tick(fps.average, triangles);

    /* 可选扩展：ui.js 未实现 setStats 时静默跳过 */
    if (SOLAR.UI && typeof SOLAR.UI.setStats === 'function') {
      try {
        SOLAR.UI.setStats({
          fps: fps.average,
          instant: fps.instant,
          triangles: triangles,
          bodies: countBodies(),
          memoryMb: sampleMemory(),
          quality: currentQuality,
          dt: dt
        });
      } catch (e) {
        logError('UI.setStats', e);
      }
    }

    sampleAutoQuality(fps.average);
  }

  /* 单帧异常：计数并在连续失败时停止循环，避免刷屏与无意义的持续报错 */
  function onFrameError(error) {
    frameErrors++;
    if (loggedErrors < MAX_LOGGED_ERRORS && window.console && console.error) {
      loggedErrors++;
      console.error('[SOLAR.main] 渲染帧异常：', error);
    }
    if (frameErrors >= MAX_FRAME_ERRORS) {
      stopLoop();
      showStartupError('渲染连续异常，已停止主循环 / Rendering stopped after repeated errors');
    }
  }

  /* 渲染一帧：必须先移动太阳系根节点，再让 Scene 写世界坐标 uniform。
     若 Scene 先跑，太阳位置、明暗面、环影与食影会使用上一帧的银河位置。 */
  function renderFrame(dt) {
    try {
      advanceTime(dt);

      /* 银河公转：推进太阳系整体位置，并让自由视角相机随之平移 */
      SOLAR.Galaxy.update(dt);
      SOLAR.Galaxy.consumeDelta(galaxyDelta);
      SOLAR.Controls.panBy(galaxyDelta);

      SOLAR.Controls.update(dt);
      SOLAR.Scene.update(SOLAR.time.jd, SOLAR.time.simDays, dt);
      SOLAR.Effects.render();

      updateHoverTooltip();
      reportStats(dt);

      frameErrors = 0;                     // 任一帧成功即重置连续失败计数
    } catch (error) {
      onFrameError(error);
    }
  }

  /* ================= 主循环 ================= */

  /* 受 FPS_CAP 上限约束的动画主循环 */
  function loop(timestamp) {
    if (!running || paused) {
      rafId = 0;
      return;
    }
    rafId = window.requestAnimationFrame(loop);

    if (!previousRafTime) {
      previousRafTime = timestamp;         // 首帧只建立基准，不渲染
      return;
    }

    var elapsed = timestamp - previousRafTime;
    previousRafTime = timestamp;
    if (!(elapsed >= 0)) elapsed = 0;
    if (elapsed > MAX_FRAME_MS) elapsed = MAX_FRAME_MS;   // 钳制大 dt 尖峰

    frameAccumulator += elapsed;
    if (frameAccumulator > MAX_ACCUM_MS) frameAccumulator = MAX_ACCUM_MS;  // 防漂移/追帧雪崩
    if (frameAccumulator < FRAME_INTERVAL) return;        // 未到帧间隔，跳过渲染

    /* 扣减取余而不是清零：保留余数，dt 长期平均精确，帧率更稳 */
    var dt = 0;
    while (frameAccumulator >= FRAME_INTERVAL) {
      frameAccumulator -= FRAME_INTERVAL;
      dt += FRAME_INTERVAL / 1000;
    }
    if (dt <= 0) return;

    renderFrame(dt);
  }

  function startLoop() {
    if (running) return;
    running = true;
    paused = false;
    previousRafTime = 0;
    frameAccumulator = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop() {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /* ================= 页面可见性 ================= */

  /* 隐藏时暂停渲染与计时，恢复时重置基准，杜绝"切回来跳一大步" */
  function pauseLoop() {
    if (paused) return;
    paused = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    pointer.inside = false;
    if (SOLAR.UI && typeof SOLAR.UI.hideTooltip === 'function') SOLAR.UI.hideTooltip();
  }

  function resumeLoop() {
    if (!running || !paused) return;
    paused = false;
    previousRafTime = 0;
    frameAccumulator = 0;
    simAccum = 0;
    carryDays = 0;
    expectedJd = SOLAR.time ? SOLAR.time.jd : null;
    resetFpsStats();
    rafId = window.requestAnimationFrame(loop);
  }

  function onVisibilityChange() {
    var hidden = (typeof document.hidden === 'boolean') ? document.hidden : !!document.webkitHidden;
    if (hidden) pauseLoop();
    else resumeLoop();
  }

  /* 上下文丢失时停止循环，保留 CPU 侧场景和用户状态；浏览器触发 restored 后，
     Three.js 会重新建立 GPU 内部资源，应用只需重建 composer / bloom RenderTarget。 */
  function onContextLost(event) {
    if (event && event.preventDefault) event.preventDefault();
    if (contextLost) return;
    contextLost = true;
    resumeAfterContextRestore = running && !paused;

    try {
      var orbit = SOLAR.Controls && SOLAR.Controls.getControls ? SOLAR.Controls.getControls() : null;
      controlsEnabledBeforeContextLoss = !orbit || orbit.enabled !== false;
      if (SOLAR.Controls && SOLAR.Controls.setEnabled) SOLAR.Controls.setEnabled(false);
    } catch (ignore) { controlsEnabledBeforeContextLoss = true; }

    stopLoop();
    showContextNotice('WebGL 上下文丢失，正在等待浏览器恢复 / WebGL context lost, waiting for recovery');
  }

  function finishContextRestore() {
    contextRestoreTimer = null;
    if (!contextLost || !context) return;

    try {
      /* Effects 持有独立 RenderTarget；context 恢复后必须明确销毁并重建。
         Scene 的几何/纹理仍保留 CPU 侧对象，renderer 在下一帧会重新上传。 */
      if (SOLAR.Effects && SOLAR.Effects.dispose) SOLAR.Effects.dispose();
      SOLAR.Scene.resize();
      SOLAR.Effects.init(context.scene, context.camera, context.renderer, currentQuality);
      SOLAR.Effects.setQuality(currentQuality);

      contextLost = false;
      previousRafTime = 0;
      frameAccumulator = 0;
      simAccum = 0;
      carryDays = 0;
      expectedJd = SOLAR.time ? SOLAR.time.jd : null;
      resetFpsStats();
      if (SOLAR.Controls && SOLAR.Controls.setEnabled) SOLAR.Controls.setEnabled(controlsEnabledBeforeContextLoss);
      if (SOLAR.UI && SOLAR.UI.hideLoading) SOLAR.UI.hideLoading();

      if (resumeAfterContextRestore) {
        var hidden = (typeof document.hidden === 'boolean') ? document.hidden : !!document.webkitHidden;
        if (hidden) {
          running = true;
          paused = true;
        } else {
          startLoop();
        }
      }
    } catch (error) {
      contextLost = true;
      stopLoop();
      showStartupError('WebGL 恢复失败，请刷新页面 / WebGL recovery failed; please refresh the page');
      if (window.console && console.error) console.error('[SOLAR.main] WebGL context recovery failed:', error);
    }
  }

  function onContextRestored() {
    if (!contextLost) return;
    /* 让 WebGLRenderer 自己的 restored 监听器先完成内部状态重建。 */
    if (contextRestoreTimer) window.clearTimeout(contextRestoreTimer);
    contextRestoreTimer = window.setTimeout(finishContextRestore, 0);
  }

  /* ================= 事件绑定 ================= */

  function bindPointer(canvas) {
    canvas.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
      pointer.dirty = true;
    });
    canvas.addEventListener('pointerleave', function () {
      pointer.inside = false;
      pointer.dirty = false;
      if (SOLAR.UI && typeof SOLAR.UI.hideTooltip === 'function') SOLAR.UI.hideTooltip();
    });
  }

  /* 窗口尺寸变化：防抖后统一 resize，避免拖拽窗口时反复重建后期缓冲 */
  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resizeTimer = null;
      try { SOLAR.Scene.resize(); } catch (e) { logError('Scene.resize', e); }
    }, RESIZE_DEBOUNCE_MS);
  }

  /* 用户在下拉框里手动选画质：记录为手动档，后续不再自动回升 */
  function bindQualitySelect() {
    var select = document.getElementById('quality-select');
    if (!select || !select.addEventListener) return;
    select.addEventListener('change', function () {
      var name = select.value;
      if (!C.quality[name]) return;
      currentQuality = name;
      manualQuality = true;
      lastQualityChange = nowMs();
      badWindows = 0;
      goodWindows = 0;
    });
  }

  /* ================= 启动 ================= */

  function bootstrap() {
    if (!window.THREE) {
      showStartupError('无法加载 Three.js / Failed to load Three.js');
      return;
    }
    if (!detectWebGL()) {
      showStartupError('当前浏览器或显卡不支持 WebGL，无法渲染 3D 场景 / WebGL unavailable: cannot render the 3D scene');
      return;
    }

    var canvas = document.getElementById('scene-canvas');
    if (!canvas) {
      showStartupError('找不到画布元素 #scene-canvas / Canvas element not found');
      return;
    }

    loadingStart = nowMs();
    loadingFallback = window.setTimeout(completeLoading, LOADING_FALLBACK_MS);

    try {
      context = SOLAR.Scene.init(canvas, onLoadProgress);
      SOLAR.Effects.init(context.scene, context.camera, context.renderer, 'high');
      SOLAR.Controls.init(context.scene, context.camera, context.renderer, canvas);
      SOLAR.Galaxy.init(context.scene, 'high', context.camera);
      galaxyDelta = new THREE.Vector3();
      currentQuality = 'high';
      SOLAR.UI.init();
      uiReady = true;
      expectedJd = SOLAR.time ? SOLAR.time.jd : null;
      syncQualitySelect(currentQuality);

      SOLAR.Controls.goToPreset('home');

      bindPointer(canvas);
      bindQualitySelect();
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);
      window.addEventListener('resize', onResize);
      document.addEventListener('visibilitychange', onVisibilityChange);

      /* 纹理数为 0 时 LoadingManager 不会回调：短延时后直接补满进度（仍有最短动画时长） */
      window.setTimeout(function () {
        if (progressTarget <= 0) onLoadProgress(1);
      }, LOADING_IDLE_MS);

      if (loadingPending) requestComplete();
      startLoop();
    } catch (error) {
      stopLoop();
      if (loadingFallback) {
        window.clearTimeout(loadingFallback);
        loadingFallback = null;
      }
      showStartupError('太阳系初始化失败 / Solar System initialization failed');
      if (window.console && console.error) console.error(error);
    }
  }

  if (document.readyState === 'complete') bootstrap();
  else window.addEventListener('load', bootstrap);
})();
