/**
 * 图形构建工具：贴图解析 / 程序化随机流 / B-V 色温 ramp / 通用小函数
 * 依赖：three.min.js（全局 THREE，r128）、scene-shared.js（SOLAR.SceneShared.S：texLoader / proceduralSeed / randomState）、textures.js（可选，SOLAR.TEXTURES 内嵌 base64）
 *
 * 为什么单独拆出来：这些是与"建什么天体"无关的纯工具——太阳、行星、星空、小行星带
 * 都要用同一套随机流与同一张色温表。集中一处才能保证"同一个种子永远生成同一批粒子"，
 * 也不会出现 safeTexture 的 file:// 兜底在两处写法不一致。
 *
 * 随机流状态（proceduralSeed / randomState）是共享状态：setProceduralSeed 入口在门面，
 * 因此这里读写 SOLAR.SceneShared.S 的字段，而不是模块私有变量。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Gfx = (function () {
  'use strict';

  /* 共享状态注册表：scene-shared.js 先于本文件加载，S 只改字段、从不整体替换 */
  var S = SOLAR.SceneShared.S;

  /* ============ 纹理工具 ============ */

  function fallbackTexture(r, g, b) {
    var data = new Uint8Array([r, g, b, 255]);
    var t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }

  /* 贴图键名 -> 实际 URL：优先内嵌 base64（file:// 可用）；
     file:// 下不再请求磁盘文件（会被 CORS 拦截），直接走纯色兜底 */
  /* 源贴图已统一为 WebP；保留按键映射，避免内嵌贴图不可用时在线回退仍请求
     已删除的 jpg/png 文件。 */
  var TEX_EXT = {
    sun: 'webp', earth: 'webp', earth_night: 'webp', earth_clouds: 'webp', earth_specular: 'webp',
    enceladus: 'webp', europa: 'webp', ganymede: 'webp', io: 'webp', jupiter: 'webp', mars: 'webp', mercury: 'webp',
    moon: 'webp', neptune: 'webp', pluto: 'webp', rhea: 'webp', saturn: 'webp', saturn_ring: 'webp', titan: 'webp',
    triton: 'webp', uranus: 'webp', uranus_ring: 'webp', venus: 'webp', vesta: 'webp'
  };
  var isFileProtocol = typeof location !== 'undefined' && location.protocol === 'file:';

  function resolveTexture(path) {
    if (typeof path !== 'string' || !path) return null;
    var key = path.replace(/^.*\//, '').replace(/\.(jpg|jpeg|png)$/i, '');
    if (!key) return null;
    if (SOLAR.TEXTURES && SOLAR.TEXTURES[key]) return SOLAR.TEXTURES[key];
    if (isFileProtocol) return null;
    return 'assets/textures/' + key + '.' + (TEX_EXT[key] || 'jpg');
  }

  function safeTexture(path, apply) {
    var url = resolveTexture(path);
    if (typeof url !== 'string' || !url) { apply(null); return null; }
    S.texLoader.load(url,
      function (t) {
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        apply(t);
      },
      undefined,
      function () { apply(null); }
    );
  }

  function radialTexture(rgb, power) {
    var size = 256, cvs = document.createElement('canvas');
    cvs.width = cvs.height = size;
    var ctx = cvs.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i <= 10; i++) {
      var t = i / 10;
      g.addColorStop(t, 'rgba(' + rgb + ',' + Math.pow(1 - t, power || 2.2) + ')');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cvs);
  }

  /* ============ 程序化随机流 ============ */

  function mul32(a, b) {
    return ((((a & 0xffff) * b) + (((((a >>> 16) & 0xffff) * b) & 0xffff) << 16)) >>> 0);
  }

  /* 数字与字符串 seed 都归一化成 32 位整数；字符串用 FNV-1a，保证同一字符串
     在任何浏览器里得到同一批粒子（不依赖浏览器自带 Math.random）。 */
  function normalizeSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (seed >>> 0) || 1;
    var text = String(seed === undefined || seed === null ? '' : seed);
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = mul32(h, 16777619) >>> 0;
    }
    return h || 1;
  }

  function seedFromHash() {
    if (typeof location === 'undefined' || !location.hash) return null;
    var m = /(?:^|[#&])seed=([^&]+)/.exec(location.hash);
    if (!m) return null;
    try { return normalizeSeed(decodeURIComponent(m[1])); }
    catch (e) { return normalizeSeed(m[1]); }
  }

  function setRandomStream(salt) {
    S.randomState = ((normalizeSeed(S.proceduralSeed) ^ (salt >>> 0)) >>> 0) || 1;
  }

  function random() {
    S.randomState = (mul32(S.randomState, 1664525) + 1013904223) >>> 0;
    return S.randomState / 4294967296;
  }

  function randn() {
    return (random() + random() + random() + random() - 2) * 0.7;
  }

  /* ============ B-V 色指数 -> RGB ============ */

  var BV_RAMP = [
    [-0.40, 0.62, 0.72, 1.00], [-0.10, 0.72, 0.81, 1.00], [0.10, 0.86, 0.90, 1.00],
    [0.30, 1.00, 0.96, 0.90], [0.50, 1.00, 0.90, 0.76], [0.70, 1.00, 0.82, 0.62],
    [0.95, 1.00, 0.73, 0.50], [1.25, 1.00, 0.62, 0.40], [1.70, 1.00, 0.52, 0.32]
  ];

  function bvToRgb(bv, out) {
    var i;
    for (i = 0; i < BV_RAMP.length - 1; i++) {
      if (bv <= BV_RAMP[i + 1][0]) break;
    }
    var a = BV_RAMP[i], b = BV_RAMP[Math.min(i + 1, BV_RAMP.length - 1)];
    var t = (bv - a[0]) / Math.max(b[0] - a[0], 1e-6);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    out[0] = a[1] + (b[1] - a[1]) * t;
    out[1] = a[2] + (b[2] - a[2]) * t;
    out[2] = a[3] + (b[3] - a[3]) * t;
    return out;
  }

  /* ============ 通用数学 ============ */

  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  function disposePoints(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  return {
    fallbackTexture: fallbackTexture, resolveTexture: resolveTexture,
    safeTexture: safeTexture, radialTexture: radialTexture,
    setRandomStream: setRandomStream, random: random, randn: randn,
    bvToRgb: bvToRgb, smoothstep: smoothstep, disposePoints: disposePoints,
    /* 供门面读取 URL #seed 与规范化种子（随机流状态在 SceneShared.S 中） */
    seedFromHash: seedFromHash, normalizeSeed: normalizeSeed
  };
})();
