/**
 * 后期特效管线：Bloom 泛光 + 自定义收尾 Shader（暗角 / 扫描线 / 轻微色散 / 胶片颗粒 / 高光压缩）
 * 依赖：assets/vendor 下的 CopyShader / LuminosityHighPassShader / EffectComposer / RenderPass /
 *       ShaderPass / MaskPass / UnrealBloomPass；任一缺失或初始化异常都降级为 renderer.render，不抛错。
 *
 * 分层 Bloom：先把自发光物体单独渲到半分辨率 RT（bloomRT），行星 / 卫星临时涂黑只当遮挡体，
 * 因此行星受光面不在图里，阈值可稳定取 0.10，不必靠抬高阈值排除行星；纯 bloom 由收尾 shader 加性合成。
 * 靠近太阳时（SOLAR.Scene.getSunScreenFraction）只压低强度并加强高光压缩，阈值恒定，
 * 避免大面积死白，也避免抬高阈值把太阳辉光掐死。
 * 暗角 / 扫描线 / 颗粒强度随画质档位与沉浸模式（#hud.immersive）变化，并做平滑过渡。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Effects = (function () {
  'use strict';

  var C = SOLAR.CONFIG;

  /* ================= 内部状态 ================= */
  var scene = null;
  var camera = null;
  var renderer = null;

  var composer = null;
  var renderPass = null;
  var bloomPass = null;              // 自己持有、手动 render，不入 composer
  var bloomRT = null;                // 分层 bloom：只渲自发光物体的半分辨率 RT
  var bloomRTSize = { w: 0, h: 0 };  // bloomRT 当前尺寸（像素）
  var finalPass = null;
  var fxaaPass = null;               // FXAA：最后一道抗锯齿（在 FinalShader 之后）

  var available = false;      // 后期管线是否可用
  var bloomOn = true;         // 泛光开关
  var qualityName = 'high';
  var quality = C.quality.high;
  var startTime = 0;
  var lastTime = 0;
  var immersive = false;      // 沉浸模式（隐藏 HUD）
  var immersiveChecked = -1;  // 上次检测时间（秒）
  /* 界面开关（扫描线 / 暗角）：与画质档位取「与」关系 */
  var overlayPrefs = { scanline: true, vignette: true };

  /* 当前值与目标值：平滑过渡，避免切换画质/靠近太阳时突变。
     mix 为分层 bloom 加性合成的权重，用于开关的淡入淡出（0=关，1=开）。 */
  var cur = { strength: 0.85, threshold: 0.20, radius: 0.55, highlight: 0.35, vig: 1, scan: 1, ab: 1, grain: 0.03, mix: 1 };
  var dst = { strength: 0.85, threshold: 0.20, radius: 0.55, highlight: 0.35, vig: 1, scan: 1, ab: 1, grain: 0.03, mix: 1 };

  /* 各档位基础参数 */
  /* 分层 Bloom：bloomRT 里只有自发光物体与涂黑的遮挡体，行星受光面不在画面内
     （实测土星受光面 P90≈0.93、太阳盘面 P90≈0.62，分布重叠，单一阈值无法同时「含太阳、排土星」）。
     故阈值统一取 0.10，档位差异只交给 strength / radius。 */
  var BLOOM_BASE = {
    ultra:  { strength: 1.15, radius: 0.80, threshold: 0.10 },
    high:   { strength: 0.95, radius: 0.62, threshold: 0.10 },
    medium: { strength: 0.78, radius: 0.54, threshold: 0.10 },
    low:    { strength: 0.65, radius: 0.45, threshold: 0.10 }
  };
  var GRAIN_BASE = { ultra: 0.045, high: 0.030, medium: 0.018, low: 0.0 };

  /* ================= 自定义收尾 Shader ================= */
  /* uniforms: tDiffuse(输入画面) / uBloomMap(分层 bloom 图) / uBloomStrength(合成权重) /
                uTime(时间) / uVignette(暗角) / uScanline(扫描线) /
                uAberration(色散) / uGrain(颗粒) / uHighlight(高光压缩) / uAspect(画面宽高比) /
                uScanDensity(扫描线密度) */
  var FinalShader = {
    uniforms: {
      tDiffuse: { value: null },
      uBloomMap: { value: null },
      uBloomStrength: { value: 1 },
      uTime: { value: 0 },
      uVignette: { value: 1 },
      uScanline: { value: 1 },
      uAberration: { value: 1 },
      uGrain: { value: 0.03 },
      uHighlight: { value: 0.35 },
      uAspect: { value: 1.777 },
      uScanDensity: { value: 800 }
    },

    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),

    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform sampler2D uBloomMap;',
      'uniform float uBloomStrength;',
      'uniform float uTime;',
      'uniform float uVignette;',
      'uniform float uScanline;',
      'uniform float uAberration;',
      'uniform float uGrain;',
      'uniform float uHighlight;',
      'uniform float uAspect;',
      'uniform float uScanDensity;',
      'varying vec2 vUv;',
      '',
      'float hash21(vec2 p){',
      '  p = fract(p * vec2(123.34, 456.21));',
      '  p += dot(p, p + 45.32);',
      '  return fract(p.x * p.y);',
      '}',
      '',
      'void main() {',
      '  vec2 uv = vUv;',
      '  vec2 dir = (uv - vec2(0.5)) * vec2(uAspect, 1.0);',
      '  float dist = length(dir);',
      '',
      '  /* 极轻微色散：越靠画面边缘越明显 */',
      '  float amount = uAberration * 0.0024 * (0.35 + dist * 1.75);',
      '  vec2 off = dir * amount;',
      '  vec3 col;',
      '  col.r = texture2D(tDiffuse, uv + off).r;',
      '  col.g = texture2D(tDiffuse, uv).g;',
      '  col.b = texture2D(tDiffuse, uv - off).b;',
      '',
      '  /* 分层 bloom：把只含自发光物体的泛光加性合成回来。',
      '     放在高光压缩之前，靠近太阳时新增的泛光会一起被压缩，保留防过曝行为。 */',
      '  if (uBloomStrength > 0.0001) {',
      '    col += texture2D(uBloomMap, uv).rgb * uBloomStrength;',
      '  }',
      '',
      '  /* 高光柔和压缩：靠近太阳时抑制死白过曝 */',
      '  float lm = max(max(col.r, col.g), col.b);',
      '  if (lm > 0.72) {',
      '    float over = lm - 0.72;',
      '    float comp = (0.72 + over / (1.0 + over * 1.8)) / lm;',
      '    col *= mix(1.0, comp, uHighlight);',
      '  }',
      '',
      '  /* 扫描线：屏幕空间细横纹，随时间极缓慢流动 */',
      '  float scan = 0.5 + 0.5 * sin(vUv.y * uScanDensity - uTime * 1.6);',
      '  col *= 1.0 - uScanline * 0.12 * scan;',
      '',
      '  /* 暗角（按宽高比校正，避免宽屏上被拉成椭圆） */',
      '  float vig = smoothstep(0.34, 0.94, dist);',
      '  col *= 1.0 - uVignette * 0.8 * vig;',
      '',
      '  /* 极轻微胶片颗粒 */',
      '  if (uGrain > 0.0001) {',
      '    float g = hash21(gl_FragCoord.xy + vec2(uTime * 61.7, uTime * 27.3));',
      '    col += (g - 0.5) * uGrain;',
      '  }',
      '',
      '  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);',
      '}'
    ].join('\n')
  };

  /* ================= 工具 ================= */

  function now() {
    return (window.performance && typeof performance.now === 'function') ? performance.now() : Date.now();
  }

  function viewWidth() {
    if (renderer && renderer.domElement && renderer.domElement.clientWidth) return renderer.domElement.clientWidth;
    return window.innerWidth || 1;
  }

  function viewHeight() {
    if (renderer && renderer.domElement && renderer.domElement.clientHeight) return renderer.domElement.clientHeight;
    return window.innerHeight || 1;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /* 分层 bloom 用的半分辨率尺寸（像素） */
  function bloomSize() {
    var pr = (renderer && typeof renderer.getPixelRatio === 'function') ? renderer.getPixelRatio() : 1;
    if (!(pr > 0)) pr = 1;
    var w = Math.max(2, Math.round(viewWidth() * pr * 0.5));
    var h = Math.max(2, Math.round(viewHeight() * pr * 0.5));
    return { w: w, h: h };
  }

  /* 同步 CSS 覆盖层，避免与 shader 效果重复叠加；
     后期管线不可用时，CSS 覆盖层成为唯一实现，需完整响应界面开关 */
  function syncOverlay() {
    try {
      var vig = document.getElementById('fx-vignette');
      var scan = document.getElementById('fx-scanline');
      if (available) {
        if (vig) vig.style.display = 'none';                                   // 暗角交给 shader
        if (scan) {
          if (overlayPrefs.scanline) { scan.style.display = ''; scan.style.opacity = '0.25'; }
          else { scan.style.display = 'none'; }
        }
      } else {
        if (vig) { vig.style.display = overlayPrefs.vignette ? '' : 'none'; }  // 保持 CSS 覆盖层原样生效
        if (scan) { scan.style.display = overlayPrefs.scanline ? '' : 'none'; scan.style.opacity = ''; }
      }
    } catch (e) { /* DOM 操作失败不影响渲染 */ }
  }

  /* 界面开关：{ scanline: bool, vignette: bool } */
  function setOverlay(patch) {
    if (!patch) return overlayPrefs;
    if (typeof patch.scanline === 'boolean') overlayPrefs.scanline = patch.scanline;
    if (typeof patch.vignette === 'boolean') overlayPrefs.vignette = patch.vignette;
    refreshTargets();
    syncOverlay();
    return overlayPrefs;
  }

  /* 沉浸模式（HUD 隐藏）检测：低频轮询，避免每帧 DOM 查询 */
  function detectImmersive(tSec) {
    if (immersiveChecked >= 0 && tSec - immersiveChecked < 0.5) return;
    immersiveChecked = tSec;
    try {
      var hud = document.getElementById('hud');
      immersive = !!(hud && hud.classList && hud.classList.contains('immersive'));
    } catch (e) { immersive = false; }
  }

  /* 依据画质档位 / 沉浸模式刷新目标开关量 */
  function refreshTargets() {
    var base = BLOOM_BASE[qualityName] || BLOOM_BASE.high;
    dst.strength = base.strength;
    dst.radius = base.radius;
    dst.threshold = base.threshold;
    dst.vig = (quality.vignette && overlayPrefs.vignette) ? (immersive ? 1.35 : 1.0) : 0.0;
    dst.scan = (quality.scanline && overlayPrefs.scanline) ? (immersive ? 0.45 : 1.0) : 0.0;
    dst.ab = (qualityName === 'low') ? 0.5 : (immersive ? 0.7 : 1.0);
    dst.grain = (GRAIN_BASE[qualityName] || 0) * (immersive ? 1.2 : 1.0);
    dst.highlight = 0.35;
  }

  /* 靠近太阳时抑制泛光（0=远离，1=太阳占满半屏高） */
  function sunProximity() {
    var frac = 0;
    try {
      if (SOLAR.Scene && typeof SOLAR.Scene.getSunScreenFraction === 'function') {
        frac = SOLAR.Scene.getSunScreenFraction() || 0;
      }
    } catch (e) { frac = 0; }
    return clamp01(frac / 0.30);
  }

  /* 平滑逼近目标值 */
  function approach(key, target, k) {
    cur[key] += (target - cur[key]) * k;
  }

  /* 每帧自适应：写入 bloom 与收尾 shader */
  function updateAdaptive(dt, tSec) {
    detectImmersive(tSec);
    refreshTargets();

    var k = sunProximity();
    /* 分层之后阈值不再随 k 抬升：bloom 层画面里没有行星受光面，阈值恒定 0.10
       就已经把行星排除在外，再抬只会越过亮度上限、把太阳辉光掐死。
       近景防溢出交给强度衰减与高光压缩。 */
    var sTarget = dst.strength * (1 - 0.55 * k);
    var tTarget = dst.threshold;
    var hTarget = 0.30 + 0.70 * k;

    /* bloom 开关的淡入淡出：关闭时残留的上一帧 bloomRT 会被乘 0，无影响 */
    dst.mix = bloomOn ? 1 : 0;

    var f = dt > 0 ? Math.min(1, dt * 4.5) : 1;
    approach('strength', sTarget, f);
    approach('threshold', tTarget, f);
    approach('radius', dst.radius, f);
    approach('highlight', hTarget, f);
    approach('vig', dst.vig, f);
    approach('scan', dst.scan, f);
    approach('ab', dst.ab, f);
    approach('grain', dst.grain, f);
    approach('mix', dst.mix, f);

    if (bloomPass) {
      bloomPass.strength = cur.strength;
      bloomPass.radius = cur.radius;
      bloomPass.threshold = cur.threshold;
    }
    if (finalPass && finalPass.uniforms) {
      var u = finalPass.uniforms;
      if (u.uVignette) u.uVignette.value = cur.vig;
      if (u.uScanline) u.uScanline.value = cur.scan;
      if (u.uAberration) u.uAberration.value = cur.ab;
      if (u.uGrain) u.uGrain.value = cur.grain;
      if (u.uHighlight) u.uHighlight.value = cur.highlight;
      if (u.uBloomStrength) u.uBloomStrength.value = cur.mix;
      if (u.uAspect) u.uAspect.value = (viewHeight() > 0) ? (viewWidth() / viewHeight()) : 1.777;
      if (u.uScanDensity) u.uScanDensity.value = Math.max(240, viewHeight() * 0.75);
    }
  }

  /* ================= 生命周期 ================= */

  /**
   * 构建后期管线
   * @param {THREE.Scene} scn
   * @param {THREE.Camera} cam
   * @param {THREE.WebGLRenderer} rnd
   * @param {string} qName ultra / high / medium / low
   * @returns {boolean} 是否启用了后期管线
   */
  function init(scn, cam, rnd, qName) {
    scene = scn || null;
    camera = cam || null;
    renderer = rnd || null;

    qualityName = (qName && C.quality[qName]) ? qName : 'high';
    quality = C.quality[qualityName];
    bloomOn = !!quality.bloom;
    startTime = now();
    lastTime = startTime;
    immersiveChecked = -1;

    composer = null;
    renderPass = null;
    bloomPass = null;
    bloomRT = null;
    bloomRTSize.w = 0;
    bloomRTSize.h = 0;
    finalPass = null;
    fxaaPass = null;
    available = false;

    try {
      var T = window.THREE;
      var ok = !!(scene && camera && renderer && T &&
        T.EffectComposer && T.RenderPass && T.UnrealBloomPass && T.ShaderPass && T.Vector2);
      if (!ok) throw new Error('vendor 后期脚本缺失');

      var w = viewWidth(), h = viewHeight();

      composer = new T.EffectComposer(renderer);
      if (typeof composer.setPixelRatio === 'function') {
        composer.setPixelRatio(renderer.getPixelRatio ? renderer.getPixelRatio() : 1);
      }
      composer.setSize(w, h);

      renderPass = new T.RenderPass(scene, camera);
      composer.addPass(renderPass);

      // 泛光（分层）：自己持有 bloomPass，不入 composer；composer 里只有 RenderPass + 收尾
      var base = BLOOM_BASE[qualityName] || BLOOM_BASE.high;
      var bs = bloomSize();
      bloomRT = new T.WebGLRenderTarget(bs.w, bs.h, {
        minFilter: T.LinearFilter,
        magFilter: T.LinearFilter,
        format: T.RGBAFormat
      });
      bloomRT.texture.generateMipmaps = false;
      bloomRTSize.w = bs.w;
      bloomRTSize.h = bs.h;

      bloomPass = new T.UnrealBloomPass(new T.Vector2(bs.w, bs.h), base.strength, base.radius, base.threshold);
      /* vendor 默认用 AdditiveBlending 把结果叠回 readBuffer；我们要 RT 里只剩纯 bloom，
         改成 NoBlending 覆盖写入（输入已被高通滤波读走，覆盖安全）。 */
      if (bloomPass.materialCopy) {
        bloomPass.materialCopy.blending = T.NoBlending;
        bloomPass.materialCopy.transparent = false;
        bloomPass.materialCopy.needsUpdate = true;
      }
      if (typeof bloomPass.setSize === 'function') bloomPass.setSize(bs.w, bs.h);

      finalPass = new T.ShaderPass(FinalShader);
      /* FXAA 必须是最后一道：FinalShader 先渲到 RT，再由 FXAA 输出到屏幕，
         否则抗锯齿会把暗角/颗粒/色散等收尾效果一起抹平。 */
      finalPass.renderToScreen = false;
      composer.addPass(finalPass);

      if (T.FXAAShader) {
        fxaaPass = new T.ShaderPass(T.FXAAShader);
        fxaaPass.renderToScreen = true;
        composer.addPass(fxaaPass);
        updateFxaaResolution();
      } else {
        finalPass.renderToScreen = true;   // 未加载 FXAA 时回退：FinalShader 直接出屏
      }

      if (finalPass.uniforms && finalPass.uniforms.uBloomMap) {
        finalPass.uniforms.uBloomMap.value = bloomRT.texture;
      }

      refreshTargets();
      cur.strength = base.strength; cur.radius = base.radius; cur.threshold = base.threshold;
      cur.vig = dst.vig; cur.scan = dst.scan; cur.ab = dst.ab; cur.grain = dst.grain;
      cur.highlight = 0.35;
      cur.mix = bloomOn ? 1 : 0;
      applyUniforms();
      available = true;
    } catch (e) {
      // 任何异常都降级为直接渲染
      available = false;
      composer = null;
      renderPass = null;
      bloomPass = null;
      bloomRT = null;
      bloomRTSize.w = 0;
      bloomRTSize.h = 0;
      finalPass = null;
      fxaaPass = null;
      if (window.console && console.warn) console.warn('[SOLAR.Effects] 后期管线不可用，已降级为直接渲染：', e);
    }

    syncOverlay();
    return available;
  }

  /* 立即写入一次收尾 shader（不平滑），用于初始化与档位切换 */
  function applyUniforms() {
    if (!finalPass || !finalPass.uniforms) return;
    var u = finalPass.uniforms;
    if (u.uVignette) u.uVignette.value = cur.vig;
    if (u.uScanline) u.uScanline.value = cur.scan;
    if (u.uAberration) u.uAberration.value = cur.ab;
    if (u.uGrain) u.uGrain.value = cur.grain;
    if (u.uHighlight) u.uHighlight.value = cur.highlight;
    if (u.uBloomStrength) u.uBloomStrength.value = cur.mix;
    if (u.uAspect) u.uAspect.value = (viewHeight() > 0) ? (viewWidth() / viewHeight()) : 1.777;
    if (u.uScanDensity) u.uScanDensity.value = Math.max(240, viewHeight() * 0.75);
  }

  /* 渲染分层 bloom：只把自发光物体渲到 bloomRT，再跑 UnrealBloomPass 得到纯 bloom。
     返回 false 表示本帧没有可用的 bloom 图（此时收尾 shader 会被 uBloomStrength 兜住）。 */
  function renderBloomLayer(dt) {
    if (!bloomRT || !bloomPass || !renderer || !scene || !camera) return false;
    if (!SOLAR.Scene || typeof SOLAR.Scene.beginBloomLayer !== 'function') return false;

    var mask = 0;
    try {
      mask = SOLAR.Scene.beginBloomLayer();
    } catch (e) { return false; }
    if (!mask) return false;

    var oldMask = camera.layers.mask;
    var oldTarget = renderer.getRenderTarget();
    /* 渲染统计由 Scene.update 每帧手动清零（autoReset 已关），这里多出来的一次
       渲染会把 bloom 层的几何也算进去，让调试面板的三角面数虚高、与画质档位表格
       对不上。渲染前后存取档，面板读数仍只反映主画面。 */
    var inf = (renderer.info && renderer.info.render) ? renderer.info.render : null;
    var savedTri = 0, savedCalls = 0, savedPts = 0, savedLines = 0;
    if (inf) { savedTri = inf.triangles; savedCalls = inf.calls; savedPts = inf.points; savedLines = inf.lines; }
    try {
      camera.layers.mask = mask;
      renderer.setRenderTarget(bloomRT);
      renderer.render(scene, camera);
      bloomPass.render(renderer, null, bloomRT, dt, false);
    } catch (e) {
      if (window.console && console.warn) console.warn('[SOLAR.Effects] 分层 bloom 渲染异常：', e);
      return false;
    } finally {
      camera.layers.mask = oldMask;
      if (inf) { inf.triangles = savedTri; inf.calls = savedCalls; inf.points = savedPts; inf.lines = savedLines; }
      try {
        if (SOLAR.Scene && typeof SOLAR.Scene.endBloomLayer === 'function') SOLAR.Scene.endBloomLayer();
      } catch (e2) { /* 还原失败不中断渲染 */ }
      renderer.setRenderTarget(oldTarget);
    }
    return true;
  }

  /* 渲染一帧 */
  function render() {
    if (!renderer || !scene || !camera) return;

    var t = now();
    var dt = (t - lastTime) / 1000;
    lastTime = t;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;

    if (available && composer) {
      try {
        var tSec = (t - startTime) / 1000;
        if (finalPass && finalPass.uniforms && finalPass.uniforms.uTime) {
          finalPass.uniforms.uTime.value = tSec;
        }
        updateAdaptive(dt, tSec);
        if (bloomOn) renderBloomLayer(dt);
        composer.render();
        return;
      } catch (e) {
        // 运行期异常：永久降级，保证后续帧仍可出图
        available = false;
        composer = null;
        if (window.console && console.warn) console.warn('[SOLAR.Effects] 后期渲染异常，已降级为直接渲染：', e);
        syncOverlay();
      }
    }

    renderer.render(scene, camera);
  }

  /* FXAA 的 resolution = 绘制缓冲像素尺寸的倒数（含 pixelRatio）。
     步长不对会让抗锯齿失效或过度模糊，故每次尺寸变化都要同步。 */
  function updateFxaaResolution() {
    if (!fxaaPass || !fxaaPass.uniforms || !fxaaPass.uniforms.resolution) return;
    var pw = 1, ph = 1;
    if (renderer && renderer.getDrawingBufferSize) {
      /* 本函数在模块作用域，而 T 只在 init 的 try 块内声明，这里取不到，
         所以直接引用全局 THREE（同一个 r128 UMD 实例）。 */
      var dsz = renderer.getDrawingBufferSize(new window.THREE.Vector2());
      pw = dsz.x; ph = dsz.y;
    }
    if (!(pw > 0)) pw = 1;
    if (!(ph > 0)) ph = 1;
    fxaaPass.uniforms.resolution.value.set(1 / pw, 1 / ph);
  }

  /* 窗口尺寸变化 */
  function resize() {
    if (!available || !composer) return;
    try {
      var w = viewWidth(), h = viewHeight();
      if (renderer && typeof composer.setPixelRatio === 'function') {
        composer.setPixelRatio(renderer.getPixelRatio ? renderer.getPixelRatio() : 1);
      }
      composer.setSize(w, h);
      updateFxaaResolution();
      /* 分层 bloom 走半分辨率，尺寸与 composer 的全分辨率无关，单独维护 */
      var bs = bloomSize();
      if (bloomRT && (bs.w !== bloomRTSize.w || bs.h !== bloomRTSize.h)) {
        bloomRT.setSize(bs.w, bs.h);
        bloomRTSize.w = bs.w;
        bloomRTSize.h = bs.h;
      }
      if (bloomPass && typeof bloomPass.setSize === 'function') bloomPass.setSize(bs.w, bs.h);
      applyUniforms();
    } catch (e) {
      available = false;
      composer = null;
      syncOverlay();
    }
  }

  /* 开关泛光 */
  function setBloom(on) {
    bloomOn = !!on;
    return bloomOn;
  }

  /* 切换画质档位 */
  function setQuality(name) {
    if (!name || !C.quality[name]) return qualityName;
    qualityName = name;
    quality = C.quality[name];
    bloomOn = !!quality.bloom;
    immersiveChecked = -1;
    refreshTargets();
    resize();
    return qualityName;
  }

  /* ================= 对外 ================= */
  return {
    init: init,
    render: render,
    resize: resize,
    setBloom: setBloom,
    setQuality: setQuality,
    /* 以下为附加查询接口，便于调试与其它模块判断能力 */
    isAvailable: function () { return available; },
    isBloomOn: function () { return bloomOn && available; },
    getQuality: function () { return qualityName; },
    getComposer: function () { return composer; },
    isImmersive: function () { return immersive; },
    setOverlay: setOverlay,
    getOverlay: function () { return { scanline: overlayPrefs.scanline, vignette: overlayPrefs.vignette }; },
    setImmersive: function (on) { immersive = !!on; immersiveChecked = now() / 1000; refreshTargets(); return immersive; },
    getBloom: function () { return { strength: cur.strength, radius: cur.radius, threshold: cur.threshold }; },
    dispose: function () {
      try {
        if (bloomRT) bloomRT.dispose();
      } catch (e) { /* 忽略 */ }
      try {
        if (bloomPass && typeof bloomPass.dispose === 'function') bloomPass.dispose();
      } catch (e) { /* 忽略 */ }
      try {
        if (composer && typeof composer.dispose === 'function') composer.dispose();
      } catch (e) { /* 忽略 */ }
      composer = null; renderPass = null; bloomPass = null; finalPass = null; fxaaPass = null;
      bloomRT = null; bloomRTSize.w = 0; bloomRTSize.h = 0;
      available = false;
      syncOverlay();
    }
  };
})();
