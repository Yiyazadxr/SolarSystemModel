/**
 * 贴图分块加载器：按 SOLAR.TEXTURE_MANIFEST（textures-manifest.js）的优先级，
 * 把 assets/js/textures/ 下的 base64 贴图逐块注入页面，每块就绪后立即预热解码。
 *
 * 分块加载的动机：单文件方案（11 MB 的同步 <script>）在首屏把整包 base64
 * 交给 JS 解析器，主线程被一个长任务占住——加载层虽然已经画出来，进度条却
 * 好几秒停在 0%，体感就是"卡了一下才动"。分块后：
 *   1. 每个 <script> 注入后浏览器才去读盘 + 解析，块与块之间主线程空闲，
 *      加载层动画与进度补间不被长任务打断；
 *   2. 每块注入完成立刻并行预热解码，第 N 块的解码与第 N+1 块的读盘 / 解析重叠；
 *   3. 进度按 base64 字节数加权（manifest.bytes），每张贴图解码完推进一步，
 *      与逐张加载的进度粒度一致，不会突兀跳变。
 *
 * 预热只让浏览器先解码一遍：场景里的 THREE.Texture 仍由 scene-gfx.safeTexture
 * 经 texLoader 创建，data URL 相同会命中浏览器图片内存缓存，不会二次解码；
 * 预热失败也不影响正确性（texLoader 侧照旧走程序化兜底）。
 *
 * 失败策略：单块失败记入 failed 并继续加载后续块（该组天体退程序化配色）；
 * 全部失败由 main.js 在加载层给双语错误。注入与预热共用全局预算 9s，低于 index.html
 * 启动看门狗的 15s——真出现"注入了却没回调"的怪癖浏览器，也不会变成假死。留出的
 * ~6s 余量同时罩住场景构建、首帧 shader 编译与加载层收起动画。
 *
 * 依赖：textures-manifest.js（先于本文件静态加载），SOLAR_BOOT（启动兜底，可选）。
 * 语法：ES5 + IIFE。
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TEXTURES = SOLAR.TEXTURES || {};

SOLAR.TextureLoader = (function () {
  'use strict';

  var CHUNK_BASE = 'assets/js/textures/';
  var CHUNK_TIMEOUT_MS = 4000;      // 单块超时：file:// 读盘 + 解析 5MB 远小于此值，纯兜底；不放太宽，避免单块挂起吞掉全局预算、连累后续块集体超时
  var TOTAL_BUDGET_MS = 9000;       // 全局预算：小于 index.html 启动看门狗的 15s，留 ~6s 给场景构建 + 首帧 shader 编译 + 加载层收起动画

  function bootFailed() {
    return !!(window.SOLAR_BOOT && window.SOLAR_BOOT.isFailed());
  }

  function warn(message) {
    if (window.console && console.error) console.error('[SOLAR.textures] ' + message);
  }

  /* 块文件执行前后对比 SOLAR.TEXTURES 的键集合，取出本块新增的键 */
  function snapshotKeys() {
    var out = {};
    if (!SOLAR.TEXTURES) return out;
    var keys = Object.keys(SOLAR.TEXTURES);
    for (var i = 0; i < keys.length; i++) out[keys[i]] = true;
    return out;
  }

  function newKeys(before) {
    var out = [];
    if (!SOLAR.TEXTURES) return out;
    var keys = Object.keys(SOLAR.TEXTURES);
    for (var i = 0; i < keys.length; i++) {
      if (!before[keys[i]]) out.push(keys[i]);
    }
    return out;
  }

  /* 预热：块内贴图全部并行交浏览器解码（与 texLoader 的并发行为一致）。
     每张完成回调一次 onStep(bytes)，全部完成回调 onDone()。 */
  function prewarm(keys, onStep, onDone) {
    var remaining = keys.length;
    if (!remaining) { onDone(); return; }
    function step(bytes) {
      remaining--;
      onStep(bytes);
      if (remaining <= 0) onDone();
    }
    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        var url = SOLAR.TEXTURES[key];
        if (!url) { step(0); return; }
        var img = new Image();
        img.onload = function () { step(url.length); };
        /* 解码失败也计步：texLoader 会再失败一次并走程序化兜底，进度不能卡死 */
        img.onerror = function () { step(url.length); };
        img.src = url;
      })(keys[i]);
    }
  }

  /**
   * 逐块加载全部贴图。块注入与块之间并行：第 N 块注入完成后立刻注入第 N+1 块，
   * 同时第 N 块进入预热解码——读盘 / 解析与解码互相重叠，不等彼此。
   * @param onProgress(p)  0~1，按 base64 字节加权的总进度（单调递增）
  * @param onDone(result) { ok: 至少一块成功, failed: [块名...] }；
  *                       所有块都注入且预热完结（或超时判失败）后才回调
   */
  function loadAll(onProgress, onDone) {
    var manifest = SOLAR.TEXTURE_MANIFEST;
    var chunks = (manifest && manifest.chunks) || [];
    if (!chunks.length) {
      warn('贴图清单缺失或为空（textures-manifest.js）');
      if (onDone) onDone({ ok: false, failed: [], reason: 'manifest-missing' });
      return;
    }

    var totalBytes = 0;
    var i;
    for (i = 0; i < chunks.length; i++) totalBytes += chunks[i].bytes || 0;
    if (!(totalBytes > 0)) totalBytes = 1;    // 防御：权重全 0 时退化为按块计

    var readyBytes = 0;                       // 已注入且预热完的块字节数
    var activeBytes = 0;                      // 在途块已预热的字节数（与 readyBytes 不重叠）
    var failed = [];
    var settledCount = 0;                     // 已完结（注入 + 预热完 / 判失败）的块数
    var deadline = Date.now() + TOTAL_BUDGET_MS;

    function report() {
      if (!onProgress) return;
      var p = (readyBytes + activeBytes) / totalBytes;
      onProgress(p > 1 ? 1 : p);
    }

    function settleChunk(chunk, ok) {
      settledCount++;
      if (!ok) failed.push(chunk.file);
      if (settledCount >= chunks.length && onDone) {
        onDone({ ok: failed.length < chunks.length, failed: failed });
      }
    }

    function nextChunk(index) {
      if (bootFailed()) return;
      if (index >= chunks.length) return;     // 收尾由 settleChunk 负责
      var chunk = chunks[index];
      var before = snapshotKeys();
      var settled = false;

      /* 单块超时取「剩余全局预算」与「单块上限」的较小值：
         预算耗尽时后续块立即判超时，总耗时被压在启动看门狗之内。 */
      var wait = Math.max(0, Math.min(CHUNK_TIMEOUT_MS, deadline - Date.now()));
      var timer = window.setTimeout(function () {
        if (settled) return;
        settled = true;
        warn('贴图分块超时：' + chunk.file);
        nextChunk(index + 1);
        settleChunk(chunk, false);
      }, wait);

      var script = document.createElement('script');
      script.setAttribute('data-solar-texture-chunk', '');
      script.onload = function () {
        if (settled || bootFailed()) return;
        settled = true;
        window.clearTimeout(timer);
        var keys = newKeys(before);
        var prewarmSettled = false;
        /* 脚本 onload 只表示 base64 已注册；图片解码也必须在剩余预算内结算。
           超时后仍可能收到迟到的 Image 回调，忽略它以免二次结算或重复启动。 */
        var prewarmTimer = window.setTimeout(function () {
          if (prewarmSettled || bootFailed()) return;
          prewarmSettled = true;
          warn('贴图预热超时：' + chunk.file);
          settleChunk(chunk, false);
        }, Math.max(0, deadline - Date.now()));
        /* 先注入下一块，再开始本块预热：下一块的读盘 / 解析（主线程任务）
           与本块的解码（浏览器侧异步）互相重叠，不互相等待。 */
        nextChunk(index + 1);
        prewarm(keys,
          function (bytes) { if (!prewarmSettled) { activeBytes += bytes; report(); } },
          function () {
            if (prewarmSettled || bootFailed()) return;
            prewarmSettled = true;
            window.clearTimeout(prewarmTimer);
            readyBytes += chunk.bytes || 0;
            activeBytes -= chunk.bytes || 0;
            report();
            settleChunk(chunk, true);
          }
        );
      };
      script.onerror = function () {
        if (settled || bootFailed()) return;
        settled = true;
        window.clearTimeout(timer);
        warn('贴图分块加载失败：' + chunk.file);
        nextChunk(index + 1);
        settleChunk(chunk, false);
      };
      script.src = CHUNK_BASE + chunk.file + '.js';
      (document.head || document.body).appendChild(script);
    }

    nextChunk(0);
  }

  return {
    loadAll: loadAll,
    chunkBase: CHUNK_BASE
  };
})();
