/**
 * 场景构建：太阳、行星、卫星、轨道、小行星带、星空、彗星
 * 依赖：three.min.js（全局 THREE，r128）、config.js、data.js、astro.js、textures.js
 * 可选：effects.js / galaxy.js / i18n.js（分别提供后期、银河、双语标签，缺失时各有兜底）
 *
 * 渲染质感策略（全部程序化 / 内嵌 base64，file:// 下零网络请求）：
 *   1. 太阳：程序化噪声表面 + 米粒组织 + 临边昏暗 + 日冕外壳 + 自适应光晕
 *   2. 行星/卫星：统一程序化着色器（纬向条纹、极区色差、凹凸、柔化终结线、
 *      菲涅尔大气边缘、环影、卫星投影、月食本影、夜面城市灯、云层、海面高光）
 *   3. 星空：按星等分布 + B-V 色温 + 银道面增密（与 galaxy.js 的 60.2° 一致）+ 亮星十字星芒
 *   4. 小行星带/柯伊伯带：幂律尺寸分布 + Kirkwood 空隙 + 偏心/倾角抖动
 *   5. 拖尾：顶点透明度沿长度衰减；彗尾分叉为离子尾 / 尘埃尾
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Scene = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA, A = SOLAR.Astro;
  var DEG = C.astro.DEG;

  var scene, camera, renderer, canvas;
  var systemRoot = null;       // 太阳系整体（随银河系公转平移）
  var sunGroup, sunMesh, sunGlow, sunLight;
  var sunProminences = [], sunFlares = [], sunSpots = [];   // 太阳表面与色球层配件
  var sunPromRadius = 1;                     // 太阳显示半径（日珥放置用），buildSun 时烘焙
  var UPY = new THREE.Vector3(0, 1, 0);      // 世界 up（日珥切向基构造用）
  var sunUniforms = null, coronaShells = [];
  var planets = [];            // { id, data, group, mesh, glowMesh, orbitLine, moons[], trail..., rAu }
  var cometObj = null;
  var starfield = null, starSpikes = null;
  var skyDome = null;              // 阶段5：真实全天银河背景天球（内表面贴全景图）
  var beltObjects = [];
  var pickables = [];
  var bodyIndex = {};

  var labelGroup = null;       // 天体标签层
  var labels = [];
  var labelsVisible = false;

  var align = { amount: 0, target: 0 };
  var qualityName = 'high';
  var quality = C.quality.high;
  var qv = null;               // 画质细节档（见 QUAL 表）
  var sphereGeos = {};
  var manager, texLoader;
  var simDays = 0;
  var showTrails = true;
  var beltsVisible = true;
  var elapsed = 0;             // 累计真实秒（着色器动画用）
  var labelUpdateAccum = 0;
  var adaptiveUpdateAccum = 0;
  var secondaryUpdateAccum = 0;
  var qualityJob = null;
  var qualityJobVersion = 0;

  /* 复用的临时对象：避免每帧 new */
  var tmpV1 = null, tmpV2 = null, tmpV3 = null;
  var labelWorldPos = null;
  var sunScreenFraction = 0;
  var effectivePixelRatio = 1;
  var orbitEpochJd = null;
  /* 轨道线重采样的真实时间节流：避免连续播放时每帧重建几何 */
  var ORBIT_REBUILD_MIN_MS = 200;
  /* 拖尾按 30Hz 采样：够平滑，又能限制顶点写入频率 */
  var TRAIL_SAMPLE_INTERVAL = 1 / 30;

  /* 主星场与两条粒子带使用固定种子：切画质、切比例、刷新页面都生成同一批
     粒子，便于截图回归；URL `#seed=...` 可显式换一批（仅影响程序化随机）。 */
  var proceduralSeed = (C.procedural && typeof C.procedural.seed !== 'undefined')
    ? C.procedural.seed : 20261006;
  var randomState = 1;

  /* ============ 纹理工具 ============ */

  function fallbackTexture(r, g, b) {
    var data = new Uint8Array([r, g, b, 255]);
    var t = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  }

  /* 贴图键名 -> 实际 URL：优先内嵌 base64（file:// 可用）；
     file:// 下不再请求磁盘文件（会被 CORS 拦截），直接走纯色兜底 */
  var TEX_EXT = { earth_night: 'png', earth_clouds: 'png', saturn_ring: 'png', uranus_ring: 'png' };
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
    texLoader.load(url,
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

  /* ============ 画质细节档（不改动 config.js，仅本模块内部） ============ */

  var QUAL = {
    ultra: { seg: 'xh', bump: 1, moonShadow: 2, ringShadow: 1, corona: 2, spikes: true,  beltDetail: 2, starSpikes: 1.6 },
    high:   { seg: 'h', bump: 1, moonShadow: 2, ringShadow: 1, corona: 2, spikes: true,  beltDetail: 1, starSpikes: 1.0 },
    medium: { seg: 'm', bump: 1, moonShadow: 1, ringShadow: 1, corona: 1, spikes: true,  beltDetail: 1, starSpikes: 0.8 },
    low:    { seg: 'l', bump: 0, moonShadow: 0, ringShadow: 0, corona: 1, spikes: false, beltDetail: 0, starSpikes: 0.0 }
  };
  var SEGMENTS = { xh: [128, 96], h: [64, 48], m: [48, 32], l: [32, 24] };
  var SUN_SEGMENTS = { xh: [192, 128], h: [96, 64], m: [64, 48], l: [48, 32] };

  /* ============ 共享 uniform（多个材质共用同一对象，更新一次即全部生效） ============ */

  var U = {
    sunPos: { value: null },      // 太阳世界坐标
    time: { value: 0 },
    pixelRatio: { value: 1 },
    heightScale: { value: 1000 }  // 用于点尺寸的世界单位 -> 像素换算
  };

  /* ============ 着色器 ============ */

  /* --- 通用噪声：3D 值噪声 + fbm（GLSL ES 1.0 兼容） --- */
  var GLSL_NOISE = [
    'float hash31(vec3 p){',
    '  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));',
    '  p *= 17.0;',
    '  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));',
    '}',
    'float vnoise(vec3 x){',
    '  vec3 i = floor(x); vec3 f = fract(x);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x);',
    '  float b = mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x);',
    '  float c = mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x);',
    '  float d = mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x);',
    '  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);',
    '}',
    'float fbm3(vec3 p){',
    '  return 0.5333 * (vnoise(p) + 0.5 * vnoise(p * 2.03 + 11.7) + 0.25 * vnoise(p * 4.01 + 3.1));',
    '}'
  ].join('\n');

  /* --- 太阳本体 --- */
  var SUN_VERT = [
    'varying vec3 vLP; varying vec3 vN; varying vec3 vWP;',
    'void main(){',
    '  vLP = normalize(position);',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var SUN_FRAG = [
    'uniform float uTime; uniform float uIntensity; uniform float uSpot; uniform float uDetail;',
    'uniform vec3 uColorA; uniform vec3 uColorB;',
    'varying vec3 vLP; varying vec3 vN; varying vec3 vWP;',
    GLSL_NOISE,
    'void main(){',
    '  vec3 p = vLP;',
    '  float lat = asin(clamp(p.y, -1.0, 1.0));',
    '  float rot = uTime * 0.045 * (1.0 - 0.42 * abs(sin(lat)));',      // 较差自转：赤道快、极区慢
    '  float cs = cos(rot), sn = sin(rot);',
    '  vec3 q = vec3(p.x * cs - p.z * sn, p.y, p.x * sn + p.z * cs);',
    '  float n1 = fbm3(q * 3.1 + vec3(0.0, uTime * 0.015, 0.0));',
    '  float n2 = fbm3(q * 9.4 + vec3(uTime * 0.03, 0.0, 0.0));',
    '  float gran = fbm3(q * 26.0 + vec3(0.0, uTime * 0.10, 0.0)) - 0.45;',
    '  float t = clamp(n1 * 0.66 + n2 * 0.30 + gran * 0.55 * uDetail + 0.02, 0.0, 1.0);',
    '  vec3 col = mix(uColorA, uColorB, smoothstep(0.16, 0.88, t));',
    /* 太阳黑子：离散小黑点群。真实黑子只在「活动区」成群出现，且本影极黑、半影环绕。
       低频活动区掩码限制分布范围，高频噪声取高阈值产生离散黑点核；低频大面积
       压暗会糊成一团灰斑，不成其为黑子。 */
    /* 黑子的关键是先把 fbm 拉伸到全动态范围：它的输出集中在 0.3~0.7，
       直接抬阈值会什么都没有。act 只保留少数几片「活动区」，
       hn 的高值区就是离散的黑点核；阈值由此都在 0..1 域上真正可控。 */
    '  float act = clamp((fbm3(q * 2.3 + vec3(31.7, 0.0, 0.0)) - 0.32) / 0.34, 0.0, 1.0);',
    '  float actMask = smoothstep(0.62, 0.86, act) * uSpot;',
    '  float hn = clamp((fbm3(q * 12.0 + vec3(0.0, uTime * 0.006, 0.0)) - 0.34) / 0.32, 0.0, 1.0);',
    '  float pen = smoothstep(0.48, 0.62, hn) * actMask;',
    '  float core = smoothstep(0.62, 0.78, hn) * actMask;',
    '  col *= 1.0 - 0.30 * clamp(pen, 0.0, 1.0);',
    '  col = mix(col, vec3(0.11, 0.030, 0.010), clamp(pen, 0.0, 1.0) * 0.82);',
    /* 本影混到纯黑：后面 uIntensity(2.15) 再乘、临边昏暗再压，都还是 0 */
    '  col = mix(col, vec3(0.0, 0.0, 0.0), clamp(core, 0.0, 1.0));',
    '  vec3 v = normalize(cameraPosition - vWP);',
    '  float mu = max(dot(normalize(vN), v), 0.0);',
    '  col *= 0.34 + 0.66 * pow(mu, 0.55);',                            // 临边昏暗
    '  col = mix(col, col * vec3(1.24, 0.64, 0.34), pow(1.0 - mu, 2.4) * 0.9);', // 边缘偏红
    '  gl_FragColor = vec4(col * uIntensity, 1.0);',
    '}'
  ].join('\n');

  /* --- 日冕壳（单层紧致内壳） --- */
  var CORONA_FRAG = [
    'uniform vec3 uColor; uniform float uStrength; uniform float uPower; uniform float uTime;',
    'varying vec3 vLP; varying vec3 vN; varying vec3 vWP;',
    GLSL_NOISE,
    'void main(){',
    '  vec3 v = normalize(cameraPosition - vWP);',
    '  float f = pow(1.0 - abs(dot(normalize(vN), v)), uPower);',
    '  float s = fbm3(vLP * 3.6 + vec3(0.0, uTime * 0.02, uTime * 0.012));',
    '  f *= 0.5 + 0.9 * s;',                                            // 冕流起伏
    '  float a = clamp(f * uStrength, 0.0, 1.0);',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  /* --- 地球夜光材质变体（分层 Bloom 专用） --- */
  /* 地球的城市灯光烘焙在与表面同一张材质里，无法靠阈值从受光面中分离出来。
     这里给 bloom 层单独准备一套「只输出夜面灯光」的材质：白天侧纯黑、夜侧保留灯光。
     它同时写深度，因此地球依然能正确遮挡太阳。
     uniform 直接复用地球主材质的同一批对象，贴图异步就绪后自动生效。 */
  var NIGHT_VERT = [
    'varying vec2 vUv; varying vec3 vN; varying vec3 vWP;',
    'void main(){',
    '  vUv = uv;',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var NIGHT_FRAG = [
    'uniform sampler2D uNightMap;',
    'uniform float uNightStrength;',
    'uniform vec3 uSunPos;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vWP;',
    'void main(){',
    '  vec3 L = normalize(uSunPos - vWP);',
    '  float d = dot(normalize(vN), L);',
    /* 与主材质同一条终结线：-0.28 → 0.30，保证灯光只在夜侧出现 */
    '  float night = 1.0 - smoothstep(-0.28, 0.30, d);',
    '  vec3 col = texture2D(uNightMap, vUv).rgb * uNightStrength * night;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* --- 分层 Bloom 的图层划分 --- */
  /* 主画面仍走 layer 0；bloom 层只渲染下面两层：
       LAYER_BLOOM_OCC  ：不透明的行星 / 卫星球体，bloom 层里临时换成纯黑材质，
                          只为写深度——否则行星挡住太阳时辉光会穿透行星。
       LAYER_BLOOM_EMIT ：自发光物体（太阳本体 / 日冕 / 光晕 / 大气辉光 / 地球夜面灯光 / 亮星星芒）。 */
  var LAYER_BLOOM_OCC = 1;
  var LAYER_BLOOM_EMIT = 2;
  var BLOOM_LAYER_MASK = (1 << LAYER_BLOOM_OCC) | (1 << LAYER_BLOOM_EMIT);
  var bloomLayerItems = [];   // { obj, mat, saved }  mat 为 null 表示沿用原材质
  var bloomOccMat = null;     // 遮挡体专用纯黑材质
  var bloomNightMat = null;   // 地球夜光材质变体

  /* --- 行星 / 卫星：统一表面着色器 --- */
  var PLANET_VERT = [
    'varying vec2 vUv; varying vec3 vN; varying vec3 vWP; varying vec3 vLP; varying vec3 vT;',
    'void main(){',
    '  vUv = uv;',
    '  vec3 nl = normalize(position);',
    '  vLP = nl;',
    '  vec3 t = cross(vec3(0.0, 1.0, 0.0), nl);',
    '  t = (length(t) < 1e-4) ? vec3(1.0, 0.0, 0.0) : normalize(t);',
    '  vT = normalize(mat3(modelMatrix) * t);',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var PLANET_FRAG = [
    'uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uBase;',
    'uniform sampler2D uSpecMap; uniform float uHasSpec;',
    'uniform sampler2D uNightMap; uniform float uHasNight; uniform float uNightStrength;',
    'uniform sampler2D uCloudMap; uniform float uHasCloud; uniform float uCloudAmount; uniform float uCloudShift;',
    'uniform vec3 uSunPos; uniform float uTime;',
    'uniform vec3 uCenter; uniform float uRadius;',
    'uniform float uBands; uniform float uBandFreq;',
    'uniform float uPolar; uniform vec3 uPolarColor;',
    'uniform float uBump;',
    'uniform float uSpot; uniform vec2 uSpotPos;',
    'uniform float uTermSoft;',
    'uniform vec3 uAtmo; uniform float uAtmoStrength; uniform float uAtmoPower; uniform vec3 uSunset;',
    'uniform float uSpec; uniform vec3 uSpecColor;',
    'uniform float uAmbient;',
    'uniform float uRingInner; uniform float uRingOuter; uniform vec3 uRingNormal; uniform float uRingShadow;',
    'uniform vec3 uOcc0; uniform float uOcc0R; uniform vec3 uOcc1; uniform float uOcc1R; uniform float uOccSoft;',
    'varying vec2 vUv; varying vec3 vN; varying vec3 vWP; varying vec3 vLP; varying vec3 vT;',
    GLSL_NOISE,
    /* 圆柱本影测试：返回 1 = 完全被遮挡 */
    'float occShadow(vec3 P, vec3 L, vec3 c, float r, float soft){',
    '  if (r <= 0.0) return 0.0;',
    '  vec3 v = c - P;',
    '  float t = dot(v, L);',
    '  if (t <= 0.0) return 0.0;',
    '  float perp = length(v - L * t);',
    '  return 1.0 - smoothstep(r * (1.0 - soft), r * (1.0 + soft), perp);',
    '}',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 L = normalize(uSunPos - vWP);',
    '  vec3 V = normalize(cameraPosition - vWP);',
    '  float hgt = 0.0;',
    /* 程序化凹凸（岩质星球） */
    '  if (uBump > 0.001) {',
    '    vec3 nl = vLP;',
    '    vec3 tl = cross(vec3(0.0, 1.0, 0.0), nl);',
    '    tl = (length(tl) < 1e-4) ? vec3(1.0, 0.0, 0.0) : normalize(tl);',
    '    vec3 bl = cross(nl, tl);',
    '    float e = 0.045;',
    '    float n0 = fbm3(nl * 4.2);',
    '    float na = fbm3(normalize(nl + tl * e) * 4.2);',
    '    float nb = fbm3(normalize(nl + bl * e) * 4.2);',
    '    float ga = (na - n0) / e;',
    '    float gb = (nb - n0) / e;',
    '    vec3 tw = normalize(vT);',
    '    vec3 bw = cross(n, tw);',
    '    n = normalize(n - uBump * (tw * ga + bw * gb));',
    '    hgt = n0 - 0.45;',
    '  }',
    /* 基础色 */
    '  vec3 base = (uHasMap > 0.5) ? texture2D(uMap, vUv).rgb : uBase;',
    '  float lat = clamp(vLP.y, -1.0, 1.0);',
    /* 气态巨行星：纬向条纹 + 湍流 */
    '  if (uBands > 0.001) {',
    '    float w = fbm3(vec3(vLP.x * 2.4, vLP.y * 7.0, vLP.z * 2.4)) - 0.45;',
    '    float band = sin(lat * uBandFreq * 3.14159265 + w * 2.8);',
    '    float turb = fbm3(vLP * 6.5 + vec3(0.0, uTime * 0.008, 0.0)) - 0.45;',
    '    base *= 1.0 + uBands * (band * 0.42 + turb * 0.5);',
    '  }',
    /* 极区色差 */
    '  if (uPolar > 0.001) {',
    '    base = mix(base, uPolarColor, smoothstep(0.56, 0.98, abs(lat)) * uPolar);',
    '  }',
    /* 大红斑（木星） */
    '  if (uSpot > 0.001) {',
    '    float lon = atan(vLP.z, vLP.x) * 0.1591549 + 0.5;',
    '    float dd = length((vec2(lon, lat) - uSpotPos) * vec2(1.0, 3.4));',
    '    base = mix(base, vec3(0.74, 0.29, 0.17), (1.0 - smoothstep(0.028, 0.078, dd)) * uSpot * 0.8);',
    '  }',
    '  base *= 1.0 + hgt * 0.25;',
    /* 柔化终结线 */
    '  float d = dot(n, L);',
    '  float lit = smoothstep(-uTermSoft, uTermSoft, d);',
    /* 阴影：卫星投影 / 月食本影 / 环影 */
    '  float sh = 1.0;',
    '  sh *= 1.0 - 0.93 * occShadow(vWP, L, uOcc0, uOcc0R, uOccSoft);',
    '  sh *= 1.0 - 0.93 * occShadow(vWP, L, uOcc1, uOcc1R, uOccSoft);',
    '  if (uRingShadow > 0.001) {',
    '    float dn = dot(L, uRingNormal);',
    '    if (abs(dn) > 1e-4) {',
    '      float t = dot(uCenter - vWP, uRingNormal) / dn;',
    '      if (t > 0.0) {',
    '        vec3 q = vWP + L * t;',
    '        float rr = length(q - uCenter);',
    '        float w = uRadius * 0.05;',
    '        float inA = smoothstep(uRingInner - w, uRingInner + w, rr);',
    '        float inB = 1.0 - smoothstep(uRingOuter - w, uRingOuter + w, rr);',
    '        float tt = clamp((rr - uRingInner) / max(uRingOuter - uRingInner, 1e-4), 0.0, 1.0);',
    '        float gd = (tt - 0.62) / 0.05;',
    '        float dens = (1.0 - 0.62 * exp(-gd * gd)) * (0.84 + 0.16 * sin(tt * 46.0));',
    '        sh *= 1.0 - uRingShadow * inA * inB * clamp(dens, 0.0, 1.0);',
    '      }',
    '    }',
    '  }',
    '  vec3 col = base * lit * sh + base * uAmbient;',
    /* 海面 / 冰面高光 */
    '  if (uSpec > 0.001) {',
    '    float amt = uSpec;',
    '    if (uHasSpec > 0.5) amt *= texture2D(uSpecMap, vUv).r;',
    '    vec3 hv = normalize(L + V);',
    '    col += uSpecColor * (pow(max(dot(n, hv), 0.0), 46.0) * amt * lit * sh);',
    '  }',
    /* 夜面城市灯光（注意：smoothstep 的 edge0 必须小于 edge1，故取反实现） */
    '  if (uHasNight > 0.5) {',
    '    col += texture2D(uNightMap, vUv).rgb * uNightStrength * (1.0 - smoothstep(-0.28, 0.30, d));',
    '  }',
    /* 云层（漂移） */
    '  if (uHasCloud > 0.5) {',
    '    vec4 ct = texture2D(uCloudMap, vec2(fract(vUv.x + uCloudShift), vUv.y));',
    '    float cloud = clamp(ct.a * ct.r * uCloudAmount, 0.0, 1.0);',
    '    col = mix(col, vec3(1.0) * (lit * sh + uAmbient), cloud * smoothstep(-0.08, 0.26, d) * 0.88);',
    '  }',
    /* 大气边缘：菲涅尔 + 随太阳角度由蓝转橙（瑞利散射近似） */
    '  if (uAtmoStrength > 0.001) {',
    '    float fres = pow(1.0 - max(dot(n, V), 0.0), uAtmoPower);',
    '    vec3 rimCol = mix(uSunset, uAtmo, smoothstep(-0.06, 0.44, d));',
    '    col += rimCol * fres * uAtmoStrength * smoothstep(-0.5, 0.12, d) * sh;',
    '  }',
    /* 直接输出最终颜色；受光面超过 1 的亮部由 8 位渲染目标截断。 */
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* --- 环（土星 / 天王星）：受掠射光照 + 行星本影 --- */
  var RING_VERT = [
    'varying vec2 vUv; varying vec3 vWP;',
    'void main(){',
    '  vUv = uv;',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var RING_FRAG = [
    'uniform sampler2D uMap; uniform float uHasMap;',
    'uniform vec3 uColor; uniform float uOpacity;',
    'uniform vec3 uSunPos; uniform vec3 uCenter; uniform float uPlanetRadius; uniform vec3 uNormal;',
    'uniform float uInner; uniform float uOuter;',
    'varying vec2 vUv; varying vec3 vWP;',
    'void main(){',
    '  vec3 L = normalize(uSunPos - vWP);',
    '  vec3 V = normalize(cameraPosition - vWP);',
    '  vec3 nrm = normalize(uNormal);',
    '  float t = clamp(vUv.x, 0.0, 1.0);',
    '  vec3 col = uColor; float alpha = uOpacity;',
    '  if (uHasMap > 0.5) {',
    '    vec4 tex = texture2D(uMap, vec2(t, 0.5));',
    '    col = mix(uColor, tex.rgb, smoothstep(0.06, 0.40, tex.a));',
    '    alpha *= tex.a;',
    '  } else {',
    '    float dens = 0.62 + 0.38 * sin(t * 38.0);',
    '    float gd = (t - 0.62) / 0.055;',
    '    dens *= 1.0 - 0.72 * exp(-gd * gd);',
    '    dens *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.93, 1.0, t));',
    '    alpha *= clamp(dens, 0.0, 1.0);',
    '  }',
    /* 掠射光：环面越接近侧向、受光越少 */
    '  float graze = abs(dot(nrm, L));',
    '  float light = 0.26 + 0.74 * pow(graze, 0.72);',
    /* 看到的是受光面还是背光面 */
    '  float facing = dot(nrm, V) * dot(nrm, L);',
    '  light *= mix(0.40, 1.0, smoothstep(-0.35, 0.35, facing));',
    /* 行星在环上的影子 */
    '  vec3 w = normalize(vWP - uSunPos);',
    '  vec3 oc = vWP - uCenter;',
    '  float tt = dot(oc, w);',
    '  if (tt > 0.0) {',
    '    float perp = length(oc - w * tt);',
    '    light *= 0.14 + 0.86 * smoothstep(uPlanetRadius * 0.93, uPlanetRadius * 1.07, perp);',
    '  }',
    '  col *= light;',
    '  if (alpha <= 0.002) discard;',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  /* --- 大气壳（菲涅尔辉光 + 只在受光侧） --- */
  var ATMO_VERT = [
    'varying vec3 vN; varying vec3 vWP;',
    'void main(){',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWP = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  var ATMO_FRAG = [
    'uniform vec3 uColor; uniform float uStrength; uniform float uPower; uniform vec3 uSunPos;',
    'varying vec3 vN; varying vec3 vWP;',
    'void main(){',
    '  vec3 v = normalize(cameraPosition - vWP);',
    '  vec3 n = normalize(vN);',
    '  float f = pow(1.0 - abs(dot(n, v)), uPower);',
    '  vec3 L = normalize(uSunPos - vWP);',
    '  float lit = smoothstep(-0.55, 0.22, dot(n, L));',
    '  float a = clamp(f * uStrength * lit, 0.0, 1.0);',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  /* --- 恒星点（恒定像素尺寸） --- */
  var STAR_VERT = [
    'attribute float aSize; attribute vec3 aColor;',
    'uniform float uPixelRatio;',
    'varying vec3 vColor;',
    'void main(){',
    '  vColor = aColor;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = max(aSize * uPixelRatio, 1.0);',
    '}'
  ].join('\n');

  var STAR_FRAG = [
    'varying vec3 vColor;',
    'void main(){',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float a = exp(-dot(p, p) * 15.0);',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(vColor * a, a);',
    '}'
  ].join('\n');

  /* --- 亮星十字星芒 --- */
  var SPIKE_FRAG = [
    'varying vec3 vColor;',
    'void main(){',
    '  vec2 p = gl_PointCoord * 2.0 - 1.0;',
    '  float r = dot(p, p);',
    '  float core = exp(-r * 7.0);',
    '  float ax = min(abs(p.x), abs(p.y));',
    '  float spike = exp(-ax * ax * 85.0) * exp(-r * 1.15);',
    '  float a = clamp(core * 0.85 + spike * 0.45, 0.0, 1.0);',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(vColor * a, a);',
    '}'
  ].join('\n');

  /* --- 小行星带 / 柯伊伯带点（随距离衰减） --- */
  var BELT_VERT = [
    'attribute float aSize; attribute vec3 aColor;',
    'uniform float uHeightScale; uniform float uSizeScale;',
    'varying vec3 vColor;',
    'void main(){',
    '  vColor = aColor;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float dist = max(-mv.z, 0.001);',
    '  gl_PointSize = clamp(aSize * uSizeScale * uHeightScale / dist, 1.0, 14.0);',
    '}'
  ].join('\n');

  var BELT_FRAG = [
    'uniform float uOpacity;',
    'varying vec3 vColor;',
    'void main(){',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float a = exp(-dot(p, p) * 13.0) * uOpacity;',
    '  if (a < 0.01) discard;',
    '  gl_FragColor = vec4(vColor * a, a);',
    '}'
  ].join('\n');

  /* --- 拖尾 / 彗尾（顶点透明度沿长度衰减） --- */
  var TRAIL_VERT = [
    'attribute float aFade;',
    'varying float vFade;',
    'void main(){',
    '  vFade = aFade;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var TRAIL_FRAG = [
    'uniform vec3 uColor; uniform float uOpacity;',
    'varying float vFade;',
    'void main(){',
    '  float a = uOpacity * vFade;',
    '  if (a <= 0.003) discard;',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  /* --- 彗尾粒子：沿尾轴分布，靠头部小而亮、往尾端渐大渐淡 --- */
  var TAIL_VERT = [
    'uniform float uPixelRatio;',
    'attribute float aFade; attribute float aSize;',
    'varying float vFade;',
    'void main(){',
    '  vFade = aFade;',
    '  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);',
    '  gl_PointSize = aSize * uPixelRatio * (300.0 / max(-mv.z, 0.001));',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var TAIL_FRAG = [
    'uniform vec3 uColor; uniform float uOpacity;',
    'varying float vFade;',
    'void main(){',
    '  float r = length(gl_PointCoord - vec2(0.5));',
    '  float a = (1.0 - smoothstep(0.0, 0.5, r)) * vFade * uOpacity;',
    '  if (a <= 0.003) discard;',
    '  gl_FragColor = vec4(uColor * a, a);',
    '}'
  ].join('\n');

  /* ============ 天体表面参数表 ============ */

  function surfaceParams(id) {
    var P = {
      mercury: { base: 0x9c8f84, bump: 0.085, term: 0.10, atmo: 0x000000, atmoS: 0.00, amb: 0.030 },
      venus:   { base: 0xd9b98a, bump: 0.020, term: 0.26, atmo: 0xe8d7a0, atmoS: 0.55, atmoPow: 3.0, sunset: 0xd8a05a, bands: 0.16, bandFreq: 5.0, spec: 0.03, specColor: 0xffe9c0, amb: 0.030 },
      earth:   { base: 0x3a6ea5, bump: 0.018, term: 0.16, atmo: 0x4a90d9, atmoS: 0.95, atmoPow: 2.8, sunset: 0xff7a3c, spec: 0.38, specColor: 0xcfe4ff, amb: 0.028 },
      mars:    { base: 0xc1440e, bump: 0.075, term: 0.13, atmo: 0xd08a52, atmoS: 0.32, atmoPow: 3.2, sunset: 0xd06a30, polar: 0.38, polarColor: 0xeceae4, amb: 0.030 },
      jupiter: { base: 0xd8b48c, bump: 0.000, term: 0.18, atmo: 0xd8b48c, atmoS: 0.50, atmoPow: 3.0, sunset: 0xc98f60, bands: 0.50, bandFreq: 9.0, polar: 0.42, polarColor: 0x8d7f6e, spot: 1.0, spotPos: [0.62, -0.22], amb: 0.032 },
      saturn:  { base: 0xe3d9a6, bump: 0.000, term: 0.18, atmo: 0xe3d9a6, atmoS: 0.45, atmoPow: 3.0, sunset: 0xc79a62, bands: 0.40, bandFreq: 7.5, polar: 0.36, polarColor: 0x9c9280, amb: 0.032 },
      uranus:  { base: 0x9fd8e0, bump: 0.000, term: 0.22, atmo: 0x9fd8e0, atmoS: 0.50, atmoPow: 2.9, sunset: 0x7fb0c0, bands: 0.24, bandFreq: 4.0, polar: 0.22, polarColor: 0xc4ecf0, amb: 0.034 },
      neptune: { base: 0x3f66d8, bump: 0.000, term: 0.22, atmo: 0x4f7ce0, atmoS: 0.60, atmoPow: 2.8, sunset: 0x3a5aa8, bands: 0.30, bandFreq: 5.0, polar: 0.20, polarColor: 0x86a4ec, amb: 0.034 },
      pluto:   { base: 0xbfa78a, bump: 0.065, term: 0.10, atmo: 0xbfa78a, atmoS: 0.12, atmoPow: 3.4, sunset: 0xa08870, polar: 0.30, polarColor: 0xdcd2c2, amb: 0.030 },
      /* 卫星 */
      luna:      { base: 0xbfbfbf, bump: 0.095, term: 0.08, atmoS: 0, amb: 0.026 },
      io:        { base: 0xd8c56a, bump: 0.050, term: 0.08, atmoS: 0, amb: 0.026 },
      europa:    { base: 0xd9cfae, bump: 0.045, term: 0.08, atmoS: 0, amb: 0.026 },
      ganymede:  { base: 0x9c8b7a, bump: 0.060, term: 0.08, atmoS: 0, amb: 0.026 },
      callisto:  { base: 0x6f6257, bump: 0.075, term: 0.08, atmoS: 0, amb: 0.026 },
      enceladus: { base: 0xf0f0f0, bump: 0.040, term: 0.10, atmoS: 0, amb: 0.028 },
      titan:     { base: 0xd8a15c, bump: 0.025, term: 0.20, atmoS: 0.30, atmo: 0xe0b070, atmoPow: 3.2, sunset: 0xc08040, amb: 0.030 },
      triton:    { base: 0xc9c1b8, bump: 0.055, term: 0.10, atmoS: 0, amb: 0.028 },
      charon:    { base: 0xa9a39e, bump: 0.075, term: 0.08, atmoS: 0, amb: 0.026 },
      phobos:    { base: 0x8c7d72, bump: 0.110, term: 0.06, atmoS: 0, amb: 0.024 },
      deimos:    { base: 0x8c7d72, bump: 0.110, term: 0.06, atmoS: 0, amb: 0.024 }
    };
    return P[id] || { base: 0x9a9a9a, bump: 0.06, term: 0.10, atmoS: 0, amb: 0.028 };
  }

  /* ============ 初始化 ============ */

  /* 画质档给出的是「希望的 DPR」，并非无条件承诺。EffectComposer 和分层 bloom
     会额外持有全/半分辨率 RenderTarget；仅在 4K 面板上使用 4× DPR 就可能超过
     数亿像素，context lost 发生时自适应降档已经来不及补救。
     这里同时受配置像素预算、MAX_TEXTURE_SIZE 和 MAX_RENDERBUFFER_SIZE 约束。 */
  function renderWidth() { return Math.max(1, window.innerWidth || (canvas && canvas.clientWidth) || 1); }
  function renderHeight() { return Math.max(1, window.innerHeight || (canvas && canvas.clientHeight) || 1); }

  function hardwarePixelRatioLimit(width, height) {
    var limit = Infinity;
    var maxTexture = renderer && renderer.capabilities ? renderer.capabilities.maxTextureSize : 0;
    var maxRenderbuffer = 0;
    if (renderer && renderer.getContext) {
      try {
        var gl = renderer.getContext();
        if (gl && gl.getParameter) maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0;
      } catch (ignore) { /* 能力查询失败时仍由像素预算保护 */ }
    }
    if (maxTexture > 0) limit = Math.min(limit, maxTexture / width, maxTexture / height);
    if (maxRenderbuffer > 0) limit = Math.min(limit, maxRenderbuffer / width, maxRenderbuffer / height);
    return limit;
  }

  function pixelRatioFor(requested) {
    var width = renderWidth(), height = renderHeight();
    var device = window.devicePixelRatio || 1;
    var cap = C.render.pixelRatioCap > 0 ? C.render.pixelRatioCap : device;
    var ratio = Math.min(device, requested > 0 ? requested : 1, cap);
    var maxPixels = C.render.maxRenderPixels;
    if (maxPixels > 0) ratio = Math.min(ratio, Math.sqrt(maxPixels / (width * height)));
    ratio = Math.min(ratio, hardwarePixelRatioLimit(width, height));
    /* 极端尺寸下宁可继续降分辨率，也不能为满足最低值超出硬件纹理尺寸。 */
    if (!(ratio > 0) || !isFinite(ratio)) ratio = 1;
    return ratio;
  }

  function applyPixelRatio(requested) {
    if (!renderer) return 1;
    effectivePixelRatio = pixelRatioFor(requested);
    renderer.setPixelRatio(effectivePixelRatio);
    return effectivePixelRatio;
  }

  function init(canvasEl, onProgress) {
    canvas = canvasEl;

    /* URL `#seed=...` 优先于 config.procedural.seed：方便截图时换一批粒子而不改文件。 */
    var hashSeed = seedFromHash();
    if (hashSeed !== null) proceduralSeed = hashSeed;

    tmpV1 = new THREE.Vector3();
    tmpV2 = new THREE.Vector3();
    tmpV3 = new THREE.Vector3();
    U.sunPos.value = new THREE.Vector3();

    manager = new THREE.LoadingManager();
    manager.onProgress = function (url, loaded, total) { if (onProgress) onProgress(loaded / total); };
    manager.onLoad = function () { if (onProgress) onProgress(1); };
    texLoader = new THREE.TextureLoader(manager);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: C.render.antialias, powerPreference: 'high-performance' });
    /* 统计跨后期通道累计：three.js 默认在每次 render() 前清零 info，
       经 EffectComposer 后只剩最后一个全屏通道的 2 个三角形。改为手动清零。 */
    if (renderer.info) renderer.info.autoReset = false;
    qualityName = 'high';
    quality = C.quality.high;
    qv = QUAL.high;
    applyPixelRatio(quality.pixelRatio);
    renderer.setSize(renderWidth(), renderHeight());
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(C.colors.background);

    camera = new THREE.PerspectiveCamera(C.render.fov, window.innerWidth / window.innerHeight, C.render.near, C.render.far);
    var home = C.views.home;
    camera.position.set(home.pos[0], home.pos[1], home.pos[2]);
    camera.lookAt(0, 0, 0);

    /* 太阳系根节点：整体随银河系公转平移 */
    systemRoot = new THREE.Group();
    scene.add(systemRoot);

    buildLights();
    buildSun();
    buildPlanets();
    buildComet();
    buildStarfield();
    buildSkyDome();
    buildBelts();
    orbitEpochJd = currentOrbitEpoch();
    updateProjectionScale();
    applyScaleProfile();      // 先应用比例档的映射参数
    applyScaleMode();         // 再应用天体额外放大倍率
    registerBloomLayer();   // 场景结构就绪后登记 bloom 层成员

    return { scene: scene, camera: camera, renderer: renderer };
  }

  function buildLights() {
    sunLight = new THREE.PointLight(0xffffff, 2.4, 0, 1);
    systemRoot.add(sunLight);
    systemRoot.add(new THREE.AmbientLight(0xffffff, 0.07));
  }

  /* 球体几何体按画质缓存 */
  function sphereGeo(level) {
    if (!sphereGeos[level]) {
      var s = SEGMENTS[level] || SEGMENTS.m;
      sphereGeos[level] = new THREE.SphereGeometry(1, s[0], s[1]);
    }
    return sphereGeos[level];
  }

  /* 大气壳：菲涅尔辉光无需高精度球面，固定低细分以省三角面 */
  function atmoGeo() {
    if (!sphereGeos.atmo) sphereGeos.atmo = new THREE.SphereGeometry(1, 32, 24);
    return sphereGeos.atmo;
  }

  /* 卫星：尺寸小，最多用到中档细分 */
  function moonSegLevel() { return (qv.seg === 'l') ? 'l' : 'm'; }

  /* ---------- 太阳 ---------- */
  function buildSun() {
    var sd = D.sun;
    var radius = SOLAR.kmToScene(sd.radiusKm) * C.scale.sunSizeFactor;
    var seg = SUN_SEGMENTS[qv.seg] || SUN_SEGMENTS.m;

    sunGroup = new THREE.Group();
    systemRoot.add(sunGroup);

    sunUniforms = {
      uTime: U.time,
      /* 恒星表面亮度物理上远高于行星。取 2.15 让盘面核心过曝成白热；若只给到约 1.4，
         峰值尚不足 0.80，在全局阈值方案里反而亮不过土星受光面（P90≈0.93）。
         改分层 Bloom 后阈值不再承担「排除行星」的职责，太阳可直接提到白热核心。 */
      uIntensity: { value: 2.15 },
      uSpot: { value: 1.0 },
      uDetail: { value: 1.0 },
      uColorA: { value: new THREE.Color(0x8a2b06) },
      uColorB: { value: new THREE.Color(0xfff0c0) }
    };

    sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, seg[0], seg[1]),
      new THREE.ShaderMaterial({
        uniforms: sunUniforms, vertexShader: SUN_VERT, fragmentShader: SUN_FRAG
      })
    );
    sunMesh.userData.bodyId = 'sun';
    sunMesh.userData.sunRadius = radius;
    sunMesh.userData.sunBaseRadius = radius;   // 建模时的烘焙半径，切档以此为基准，避免逐次累乘放大
    sunGroup.add(sunMesh);
    pickables.push(sunMesh);

    /* 黑子用少量固定的贴面圆片叠加在光球表面，远处和其他观测层自动隐藏。
       使用平面而不是小球，避免黑子在太阳边缘形成不自然的 3D 凸起。 */
    sunSpots = [];
    var spotNormals = [
      [1.38, 0.28], [1.62, -0.46], [1.86, 0.78],
      [1.12, -1.02], [2.08, -0.12], [1.48, 1.18]
    ];
    var spotSizes = [0.026, 0.018, 0.022, 0.014, 0.019, 0.012];
    for (pi = 0; pi < spotNormals.length; pi++) {
      var spotNormal = new THREE.Vector3().setFromSphericalCoords(1, spotNormals[pi][0], spotNormals[pi][1]);
      var spot = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({
          color: 0x020202, transparent: true, opacity: 0.98,
          depthTest: false, depthWrite: false, side: THREE.FrontSide
        })
      );
      /* CircleGeometry 默认朝 +Z，旋到黑子所在的球面法线后就能贴合表面。 */
      spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spotNormal);
      /* 日冕与光晕是透明物体，黑子最后绘制才能保持深色；FrontSide 仍会
         自动裁掉背向相机的黑子，不会穿透整颗太阳显示到背面。 */
      spot.renderOrder = 20;
      sunGroup.add(spot);
      sunSpots.push({
        mesh: spot,
        normal: spotNormal,
        size: spotSizes[pi]
      });
    }
    updateSunSpots();

    /* 日冕只保留一层紧致外壳（1.20 倍太阳半径）：两层叠加会把示意比例的
       太阳撑成发光大环，也会让压缩档与弱压缩档的边缘观感不一致。 */
    coronaShells = [];
    addCoronaShell(radius * 1.20, 0xffcf80, 1.7, 0.62, 1);

    /* 光晕 Sprite：sizeAttenuation=false -> 恒定屏幕尺寸，远处也不会消失 */
    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('255,220,150', 2.6), color: 0xffffff,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: false
    }));
    sunGlow.scale.set(0.06, 0.06, 1);
    sunGroup.add(sunGlow);

    /* ---- 色球层配件（默认隐藏，setSunView('chromosphere') 时显示）----
       日珥：贴边的半环形火焰（两端埋入球内、拱起在轮廓外），教材图 3.1-9；
       耀斑：贴在光球上方的亮斑，对应教材图 3.1-8 的增亮区。 */
    sunProminences = [];
    sunPromRadius = radius;
    var pi;
    /* 真实日珥不是规则半圆环，而是多股扭曲的火焰喷流：
       每处用 2-3 根控制点加扰动的曲管叠成一束，粗细走向各有出入；
       全程只放两处，随机定相的 wobble 让股线来回扭动。整体略放大，
       保持日珥在色球层近景中有足够的轮廓辨识度。 */
    var PROM_SPOTS = [[1.05, 1.2], [-0.55, 2.9]];
    for (pi = 0; pi < PROM_SPOTS.length; pi++) {
      var grp = new THREE.Group();
      var n = new THREE.Vector3().setFromSphericalCoords(1, PROM_SPOTS[pi][0], PROM_SPOTS[pi][1]);
      var t = new THREE.Vector3().crossVectors(UPY, n);
      if (t.lengthSq() < 1e-4) t.set(1, 0, 0); else t.normalize();
      var strands = [
        { r: 0.015, w: 1.00, dx: 0, dy: 0, col: 0xff5535, op: 0.70 },
        { r: 0.010, w: 0.86, dx: 0.030, dy: 0.012, col: 0xff7a3d, op: 0.55 },
        { r: 0.008, w: 0.72, dx: -0.027, dy: -0.014, col: 0xe8452e, op: 0.50 }
      ];
      for (var si = 0; si < strands.length; si++) {
        var st = strands[si];
        var pts = [];
        var seg = 7, sj;
        for (sj = 0; sj <= seg; sj++) {
          var tt = sj / seg;
          var ang = tt * Math.PI;
          var wob = Math.sin(tt * 6.2 + pi * 2.1 + si * 1.7) * 0.020 +
            Math.sin(tt * 11.0 + si * 0.9) * 0.010;
          pts.push(new THREE.Vector3(
            Math.cos(ang) * 0.22 * st.w + st.dx + wob * 0.6,
            Math.sin(ang) * (0.24 + 0.05 * st.w) + st.dy + wob,
            Math.sin(tt * 9.0 + pi * 3.3 + si * 2.2) * 0.03
          ));
        }
        var tube = new THREE.Mesh(
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, radius * st.r, 6, false),
          new THREE.MeshBasicMaterial({
            color: st.col, transparent: true, opacity: st.op,
            blending: THREE.AdditiveBlending, depthWrite: false, fog: false
          })
        );
        grp.add(tube);
      }
      var b2 = new THREE.Vector3().crossVectors(t, n);
      var m4 = new THREE.Matrix4().makeBasis(t, n, b2);
      grp.quaternion.setFromRotationMatrix(m4);
      grp.position.copy(n).multiplyScalar(radius * 0.98);
      grp.scale.setScalar(1.60);
      grp.userData.promNormal = n.clone();
      grp.userData.promBaseRadius = radius;
      grp.userData.promBaseScale = 1.60;
      grp.visible = false;
      sunGroup.add(grp);
      sunProminences.push(grp);
    }

    sunFlares = [];
    var flareTex = radialTexture('255,236,170', 2.4);
    for (pi = 0; pi < 2; pi++) {
      var fl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flareTex, color: 0xffffff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      var fn = new THREE.Vector3().setFromSphericalCoords(1, 1.05 + pi * 0.85, 1.2 + pi * 2.6);
      fl.position.copy(fn).multiplyScalar(radius * 1.01);
      fl.scale.set(radius * 0.55, radius * 0.55, 1);
      fl.userData.flareNormal = fn.clone();
      fl.userData.flareBaseRadius = radius;
      fl.visible = false;
      sunGroup.add(fl);
      sunFlares.push(fl);
    }

    /* 重建后恢复当前观测视图（切画质会重跑 buildSun） */
    setSunView(sunViewMode);
  }

  function addCoronaShell(radius, color, power, strength, layer) {
    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: U.time,
          uColor: { value: new THREE.Color(color) },
          uStrength: { value: strength },
          uPower: { value: power }
        },
        vertexShader: SUN_VERT, fragmentShader: CORONA_FRAG,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
      })
    );
    shell.userData.coronaLayer = layer;
    shell.userData.coronaBase = strength;
    shell.userData.viewScale = 1;
    sunGroup.add(shell);
    coronaShells.push(shell);
  }

  /* ---------- 太阳观测视图（跟随太阳时由底部按钮切换） ----------
     photosphere  光球层：默认视图，黑子加可见（教材图 3.1-7 太阳黑子）
     chromosphere 色球层：暗红球面 + 日珥环 + 耀斑亮斑（教材图 3.1-8/9）
     corona       日冕：盘面近黑（日全食月影），冕壳放大提亮变白（教材图 3.1-10） */
  var sunViewMode = 'photosphere';
  var SUN_VIEW_STATES = {
    photosphere: { cA: 0x8a2b06, cB: 0xfff0c0, inten: 2.15, spot: 0.0, detail: 1.0,
      s0: { c: 0xffcf80, s: 0.62, k: 1.0 },
      glow: 0.06, prom: false, flare: false },
    chromosphere: { cA: 0x7a1502, cB: 0xff7a45, inten: 1.15, spot: 0.0, detail: 0.55,
      s0: { c: 0xff6a50, s: 0.42, k: 1.0 },
      glow: 0.05, prom: true, flare: true },
    corona: { cA: 0x0d0a08, cB: 0x241a12, inten: 0.02, spot: 0.0, detail: 0.0,
      s0: { c: 0xffffff, s: 2.4, k: 1.08 },
      glow: 0.30, prom: false, flare: false }
  };

  function setSunView(mode) {
    if (!sunUniforms || !SUN_VIEW_STATES[mode]) return null;
    var st = SUN_VIEW_STATES[mode];
    sunViewMode = mode;
    sunUniforms.uColorA.value.setHex(st.cA);
    sunUniforms.uColorB.value.setHex(st.cB);
    sunUniforms.uIntensity.value = st.inten;
    sunUniforms.uSpot.value = st.spot;
    sunUniforms.uDetail.value = st.detail;
    updateSunSpots();
    if (coronaShells[0]) {
      coronaShells[0].material.uniforms.uColor.value.setHex(st.s0.c);
      coronaShells[0].material.uniforms.uStrength.value = st.s0.s;
      coronaShells[0].userData.coronaBase = st.s0.s;
      coronaShells[0].userData.viewScale = st.s0.k;
      /* 观测层切换不能抹掉当前压缩档的太阳倍率；否则 faithful 档切到
         色球层/日冕层时，外壳会突然缩回 compact 的半径。 */
      var profileSunScale = sunMesh && sunMesh.userData ? (sunMesh.userData.sunScale || 1) : 1;
      var profileSunFactor = (SCALE_FACTOR[scaleMode] || SCALE_FACTOR.compact).sun;
      coronaShells[0].scale.setScalar(profileSunScale * profileSunFactor * st.s0.k);
    }
    if (sunGlow) sunGlow.scale.set(st.glow, st.glow, 1);
    /* 日珥/耀斑的显隐由 updateSunProminences 每帧控制；位置不逐帧重算 */
    for (var j = 0; j < sunFlares.length; j++) sunFlares[j].visible = !!st.flare;
    return mode;
  }

  function getSunView() { return sunViewMode; }

  function updateSunSpots() {
    var visible = sunViewMode === 'photosphere' && sunScreenFraction > 0.025;
    var radius = sunMesh && sunMesh.userData ? (sunMesh.userData.sunRadius || sunPromRadius) : sunPromRadius;
    for (var i = 0; i < sunSpots.length; i++) {
      var item = sunSpots[i];
      item.mesh.visible = visible;
      /* 稍微离开光球表面，避免深度缓冲把贴面黑子吃掉；偏移仍远小于斑点直径，
         视觉上保持贴面效果，不会变成悬浮球体。 */
      item.mesh.position.copy(item.normal).multiplyScalar(radius * 1.012);
      item.mesh.scale.setScalar(radius * item.size);
    }
  }

  /* 日珥/耀斑只在色球层视图可见，此处仅逐帧切换显隐。
     位置与缩放不逐帧更新——它们在 buildSun 建好、切档时由 applyScaleMode
     按烘焙法线与半径重算，因此固定贴在球面同一处。 */
  var _promTmp = null;
  function updateSunProminences() {
    if (!sunGroup || !sunProminences.length) return;
    var vis = sunViewMode === 'chromosphere';
    for (var i = 0; i < sunProminences.length; i++) {
      var g = sunProminences[i];
      g.visible = vis;
    }
  }

  /* ---------- 分层 Bloom：发光体 / 遮挡体注册 ---------- */
  /* 每次场景结构变化（初始化、切画质重建星空）都要重新收集一次：
     对象会被销毁重建，而 bloom 层持有的是对象引用。 */

  function occluderMaterial() {
    if (!bloomOccMat) bloomOccMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    return bloomOccMat;
  }

  function nightMaterial(uniforms) {
    if (bloomNightMat || !uniforms) return bloomNightMat;
    bloomNightMat = new THREE.ShaderMaterial({
      uniforms: {
        uNightMap: uniforms.uNightMap,
        uNightStrength: uniforms.uNightStrength,
        uSunPos: U.sunPos
      },
      vertexShader: NIGHT_VERT, fragmentShader: NIGHT_FRAG
    });
    return bloomNightMat;
  }

  function registerBloomLayer() {
    bloomLayerItems.length = 0;

    function add(obj, mat, layer) {
      if (!obj) return;
      /* 关键：three.js 的 projectObject 在 Group 上就会用 layers 做剪枝——
         祖先 Group 不通过 layers.test，整棵子树都不会被遍历，bloom 层会一片空白。
         所以必须沿 parent 链一路 enable；叶子对象最终仍各自再判定一次，
         因此同层的兄弟对象（轨道线 / 拖尾 / 小行星带 / 标签）不会被误渲染。 */
      var o = obj;
      while (o) { o.layers.enable(layer); o = o.parent; }
      bloomLayerItems.push({ obj: obj, mat: mat || null, saved: null });
    }

    /* 太阳本体 / 日冕 / 光晕 */
    add(sunMesh, null, LAYER_BLOOM_EMIT);
    for (var i = 0; i < coronaShells.length; i++) add(coronaShells[i], null, LAYER_BLOOM_EMIT);
    add(sunGlow, null, LAYER_BLOOM_EMIT);
    /* 黑子不发光，但必须在 Bloom RT 中作为黑色遮挡体存在，
       否则后处理泛光会在主画面之后把黑子重新冲淡。 */
    for (var si = 0; si < sunSpots.length; si++) {
      add(sunSpots[si].mesh, occluderMaterial(), LAYER_BLOOM_OCC);
    }

    /* 行星：大气辉光发光；球体本身只做遮挡；地球换成夜光材质变体（既发光又遮挡） */
    for (var j = 0; j < planets.length; j++) {
      var p = planets[j];
      if (p.glowMesh) add(p.glowMesh, null, LAYER_BLOOM_EMIT);
      if (p.id === 'earth') add(p.mesh, nightMaterial(p.uniforms), LAYER_BLOOM_EMIT);
      else add(p.mesh, occluderMaterial(), LAYER_BLOOM_OCC);
      for (var k = 0; k < p.moons.length; k++) add(p.moons[k].mesh, occluderMaterial(), LAYER_BLOOM_OCC);
    }

    /* 亮星十字星芒：加入发光层（其材质 depthWrite=false，贴着相机也不会遮挡太阳） */
    add(starSpikes, null, LAYER_BLOOM_EMIT);
  }

  /* 进入 bloom 层：临时换上该层专用材质，返回相机应使用的 layers 掩码 */
  function beginBloomLayer() {
    for (var i = 0; i < bloomLayerItems.length; i++) {
      var it = bloomLayerItems[i];
      if (!it.obj) continue;
      it.saved = it.obj.material;
      if (it.mat && it.mat !== it.saved) it.obj.material = it.mat;
    }
    return BLOOM_LAYER_MASK;
  }

  /* 退出 bloom 层：还原主画面材质 */
  function endBloomLayer() {
    for (var i = 0; i < bloomLayerItems.length; i++) {
      var it = bloomLayerItems[i];
      if (it.saved && it.obj) it.obj.material = it.saved;
      it.saved = null;
    }
  }

  /* ---------- 行星 ---------- */
  function buildPlanets() {
    D.bodies.forEach(function (data) {
      var radius = SOLAR.kmToScene(data.radiusKm);
      var sp = surfaceParams(data.id);

      var group = new THREE.Group();
      systemRoot.add(group);

      var tilt = new THREE.Group();
      tilt.rotation.z = data.axialTilt * DEG;
      group.add(tilt);

      var uniforms = makeBodyUniforms(sp, data.color);
      var mesh = new THREE.Mesh(sphereGeo(qv.seg), new THREE.ShaderMaterial({
        uniforms: uniforms, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG
      }));
      var flattening = bodyFlattening(data.id);
      mesh.scale.set(radius, radius * (1 - flattening), radius);
      mesh.userData.bodyId = data.id;
      tilt.add(mesh);
      pickables.push(mesh);

      /* 贴图：优先内嵌 base64；缺失时增强程序化细节 */
      safeTexture(data.texture, function (t) {
        if (t) { uniforms.uMap.value = t; uniforms.uHasMap.value = 1; }
        else { uniforms.uBands.value *= 1.9; uniforms.uBump.value = Math.max(uniforms.uBump.value, 0.07); }
      });
      if (data.id === 'earth') {
        safeTexture(data.textureNight, function (t) {
          if (t) { uniforms.uNightMap.value = t; uniforms.uHasNight.value = 1; }
        });
        safeTexture(data.textureClouds, function (t) {
          if (t) { uniforms.uCloudMap.value = t; uniforms.uHasCloud.value = 1; }
        });
        safeTexture(data.textureSpecular, function (t) {
          if (t) { uniforms.uSpecMap.value = t; uniforms.uHasSpec.value = 1; }
        });
      }

      /* 大气壳（无大气者不创建） */
      var glowMesh = null;
      if (sp.atmoS > 0.001) {
        glowMesh = new THREE.Mesh(
          atmoGeo(),
          new THREE.ShaderMaterial({
            uniforms: {
              uColor: { value: new THREE.Color(sp.atmo || data.color) },
              uStrength: { value: sp.atmoS * 0.62 },
              uPower: { value: sp.atmoPow || 3.0 },
              uSunPos: U.sunPos
            },
            vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
          })
        );
        glowMesh.userData.glowRatio = 1.09 + 0.11 * sp.atmoS;             // 供比例档切换时重算
        glowMesh.userData.glowScaleBase = radius * (1.09 + 0.11 * sp.atmoS);   // 供真实/示意两档重算
        glowMesh.scale.setScalar(glowMesh.userData.glowScaleBase);
        group.add(glowMesh);
      }

      /* 环（土星 / 天王星）：同时把环的几何参数写进行星材质，用于环影投射 */
      var ringRec = null;
      if (data.ring) {
        ringRec = buildRing(data, radius, tilt);
        if (ringRec) {
          /* 记下建几何时的烘焙半径与内外缘：切档一律以它为基准，
             避免把「上一次档位值」当成基准、来回切换后环越放越大。 */
          ringRec.baseRadius = radius;
          ringRec.baseInner = ringRec.uniforms.uInner.value;
          ringRec.baseOuter = ringRec.uniforms.uOuter.value;
        }
        uniforms.uRingInner.value = ringRec.uniforms.uInner.value;
        uniforms.uRingOuter.value = ringRec.uniforms.uOuter.value;
        uniforms.uRingNormal.value.copy(ringRec.uniforms.uNormal.value);
      }

      var orbitLine = makeOrbitLine(data.orbital, data.color);
      var trail = makeTrail(data.color, 160, 0.62);

      var moons = [];
      D.moons.filter(function (m) { return m.parent === data.id; }).forEach(function (m) {
        var mr = Math.max(SOLAR.kmToScene(m.radiusKm) * C.scale.moonSizeFactor, radius * 0.055);
        var msp = surfaceParams(m.id);
        var mu = makeBodyUniforms(msp, m.color);
        var mm = new THREE.Mesh(sphereGeo(moonSegLevel()), new THREE.ShaderMaterial({
          uniforms: mu, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG
        }));
        mm.scale.setScalar(mr);
        mm.userData.bodyId = m.id;
        mm.userData.isMoon = true;
        if (m.texture) safeTexture(m.texture, function (t) {
          if (t) { mu.uMap.value = t; mu.uHasMap.value = 1; }
          else { mu.uBump.value = Math.max(mu.uBump.value, 0.08); }
        });
        pickables.push(mm);

        var ratio = Math.max(m.orbitKm / data.radiusKm, 1.01);
        var dist = moonDistFor({ radius: radius, data: data }, { data: m });
        /* 朝向四根数（JPL 历元 2000-01-01.5 TDB = J2000，simDays=0 精确对齐）：
           Ω 升交点 → nodeGroup 绕参考面极轴；i 倾角 → orbitGroup.rotation.x；
           ω 近心点幅角 → periGroup 轨道面内绕法线；M₀ 平近点角 → 并入逐帧 mean。
           三者嵌套成 R(Ω)·R(i)·R(ω) 层级，轨道线与卫星挂在同一链路末端，
           逐帧位置共用该框架，线与卫星永不脱节。
           Laplace 面卫星的 Ω 落在母星赤道系内是近似（JPL Tilt 仅 0.0~0.9°，见 data.js 注释）。 */
        var nodeGroup = new THREE.Group();
        if (typeof m.ascendingNodeDeg === 'number') nodeGroup.rotation.y = m.ascendingNodeDeg * DEG;
        var orbitGroup = new THREE.Group();
        var inclination = typeof m.orbitInclinationDeg === 'number' ? m.orbitInclinationDeg * DEG : 0;
        orbitGroup.rotation.x = inclination;
        var periGroup = new THREE.Group();
        if (typeof m.argPeriapsisDeg === 'number') periGroup.rotation.y = m.argPeriapsisDeg * DEG;
        if (m.inclinationReference === 'parentEquator' || m.inclinationReference === 'plutoEquator') tilt.add(nodeGroup);
        else group.add(nodeGroup);
        nodeGroup.add(orbitGroup);
        orbitGroup.add(periGroup);
        periGroup.add(mm);
        var mo = {
          data: m, mesh: mm, orbitGroup: orbitGroup, periGroup: periGroup,
          dist: dist, radius: mr, uniforms: mu, host: null,
          offset: new THREE.Vector3(), worldPos: new THREE.Vector3(), parentRadius: radius,
          eccentricity: Math.max(0, Math.min(0.95, typeof m.eccentricity === 'number' ? m.eccentricity : 0)),
          periodAbs: Math.max(1e-6, Math.abs(typeof m.periodDays === 'number' ? m.periodDays : 1)),
          direction: (typeof m.periodDays === 'number' && m.periodDays < 0) ? -1 : 1,
          m0: typeof m.meanAnomalyDeg === 'number' ? m.meanAnomalyDeg * DEG : 0
        };
        periGroup.add(makeMoonOrbitLine(mo, data.color));
        moons.push(mo);
      });

      /* 卫星投影：取渲染半径最大的若干颗 */
      var occMoons = moons.slice(0).sort(function (a, b) { return b.radius - a.radius; }).slice(0, 2);

      var rec = {
        id: data.id, data: data, group: group, tilt: tilt, mesh: mesh, glowMesh: glowMesh,
        orbitLine: orbitLine, moons: moons, occMoons: occMoons,
        trail: trail.line, trailPts: trail.pos, trailFade: trail.fade, trailMax: trail.max,
        trailMat: trail.mat, trailCount: 0, trailWrite: 0, trailTimer: TRAIL_SAMPLE_INTERVAL,
        trailRing: new Float32Array(trail.max * 3), flattening: flattening,
        radius: radius, rAu: 0, scenePos: new THREE.Vector3(),
        uniforms: uniforms, ring: ringRec
      };
      planets.push(rec);
      bodyIndex[data.id] = rec;

      /* 让卫星记录宿主（用于逐帧写入月食本影） */
      for (var k = 0; k < moons.length; k++) moons[k].host = rec;
    });
  }

  /* 扁率只作用于自转轴方向（mesh 在 tilt 子树内），保持环和卫星的参考面不变。 */
  function bodyFlattening(id) {
    var values = {
      sun: 0.000009,
      earth: 0.0033528,
      jupiter: 0.06487,
      saturn: 0.09796,
      uranus: 0.02293,
      neptune: 0.01708,
      pluto: 0.0000
    };
    return values[id] || 0;
  }

  function setPlanetScale(p, factor) {
    var r = p.radius * factor;
    var flat = p.flattening || 0;
    p.mesh.scale.set(r, r * (1 - flat), r);
  }

  /* 统一的天体 uniform 集合 */
  function makeBodyUniforms(sp, color) {
    var spot = sp.spotPos || [0.5, 0.0];
    return {
      uMap: { value: fallbackTexture(255, 255, 255) }, uHasMap: { value: 0 },
      uSpecMap: { value: fallbackTexture(255, 255, 255) }, uHasSpec: { value: 0 },
      uNightMap: { value: fallbackTexture(0, 0, 0) }, uHasNight: { value: 0 }, uNightStrength: { value: 1.15 },
      uCloudMap: { value: fallbackTexture(0, 0, 0) }, uHasCloud: { value: 0 },
      uCloudAmount: { value: 1.25 }, uCloudShift: { value: 0 },
      uBase: { value: new THREE.Color(sp.base !== undefined ? sp.base : color) },
      uSunPos: U.sunPos, uTime: U.time,
      uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
      uBands: { value: sp.bands || 0 }, uBandFreq: { value: sp.bandFreq || 6 },
      uPolar: { value: sp.polar || 0 }, uPolarColor: { value: new THREE.Color(sp.polarColor || 0xffffff) },
      uBump: { value: (sp.bump || 0) * (qv.bump ? 1 : 0) },
      uSpot: { value: sp.spot || 0 }, uSpotPos: { value: new THREE.Vector2(spot[0], spot[1]) },
      uTermSoft: { value: sp.term || 0.12 },
      uAtmo: { value: new THREE.Color(sp.atmo || 0x88aaff) },
      uAtmoStrength: { value: sp.atmoS || 0 }, uAtmoPower: { value: sp.atmoPow || 3.0 },
      uSunset: { value: new THREE.Color(sp.sunset || 0xff8a4a) },
      uSpec: { value: sp.spec || 0 }, uSpecColor: { value: new THREE.Color(sp.specColor || 0xffffff) },
      uAmbient: { value: sp.amb !== undefined ? sp.amb : 0.03 },
      uRingInner: { value: 0 }, uRingOuter: { value: 0 },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) }, uRingShadow: { value: 0 },
      uOcc0: { value: new THREE.Vector3() }, uOcc0R: { value: 0 },
      uOcc1: { value: new THREE.Vector3() }, uOcc1R: { value: 0 }, uOccSoft: { value: 0.18 }
    };
  }

  /* ---------- 环 ---------- */
  function buildRing(data, radius, tilt) {
    var inner = radius * (data.ring.innerKm / data.radiusKm);
    var outer = radius * (data.ring.outerKm / data.radiusKm);
    var segments = qv.seg === 'l' ? 96 : (qv.seg === 'xh' ? 384 : 160);
    var ringGeo = new THREE.RingGeometry(inner, outer, segments, 1);
    var pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v3 = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
    }
    ringGeo.rotateX(-Math.PI / 2);

    var uniforms = {
      uMap: { value: fallbackTexture(255, 255, 255) }, uHasMap: { value: 0 },
      uColor: { value: new THREE.Color(data.id === 'saturn' ? 0xd9cfae : 0x8fb0b8) },
      uOpacity: { value: 0.92 },
      uSunPos: U.sunPos,
      uCenter: { value: new THREE.Vector3() },
      uPlanetRadius: { value: radius },
      /* 环面法线：tilt 只有绕 Z 的倾角，世界法线 = (-sin a, cos a, 0) */
      uNormal: { value: new THREE.Vector3(-Math.sin(data.axialTilt * DEG), Math.cos(data.axialTilt * DEG), 0) },
      uInner: { value: inner }, uOuter: { value: outer }
    };

    var ringMat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      side: THREE.DoubleSide, transparent: true, depthWrite: false
    });
    safeTexture(data.ring.texture, function (t) {
      if (t) { uniforms.uMap.value = t; uniforms.uHasMap.value = 1; }
      else { uniforms.uOpacity.value = 0.55; }
    });
    var mesh = new THREE.Mesh(ringGeo, ringMat);
    tilt.add(mesh);
    return { mesh: mesh, uniforms: uniforms };
  }

  function currentOrbitEpoch() {
    return (SOLAR.time && isFinite(SOLAR.time.jd)) ? SOLAR.time.jd : A.toJulian(new Date());
  }

  function orbitEpochStepDays() {
    var value = C.scale.orbitEpochStepDays;
    return (typeof value === 'number' && isFinite(value) && value > 0) ? value : 365.25;
  }

  function makeOrbitGeometry(orb, jd) {
    var pts = A.orbitPath(orb, jd, adaptiveOrbitSegments(orb));
    var geo = new THREE.BufferGeometry();
    var arr = new Float32Array(pts.length * 3);
    pts.forEach(function (p, i) { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  /* 轨道采样按几何难度分配：高偏心轨道的近日点需要更多点，
     小轨道减少无意义顶点，外行星和高画质保留足够的远景圆滑度。 */
  function adaptiveOrbitSegments(orb) {
    var base = (C.scale && typeof C.scale.orbitSegments === 'number') ? C.scale.orbitSegments : 512;
    var a = orb && typeof orb.a === 'number' ? Math.abs(orb.a) : 1;
    var e = orb && typeof orb.e === 'number' ? Math.abs(orb.e) : 0;
    var scaleFactor = a < 1 ? 0.55 : (a < 5 ? 0.72 : (a > 30 ? 1.15 : 1));
    var eccentricFactor = 1 + Math.min(5, e * e * 8);
    var qualityFactor = qv && qv.seg === 'l' ? 0.72 : (qv && qv.seg === 'xh' ? 1.25 : 1);
    var n = Math.round(base * scaleFactor * eccentricFactor * qualityFactor);
    if (n < 64) n = 64;
    if (n > 2048) n = 2048;
    return n;
  }

  /* 卫星轨道线：卫星逐帧位置是 x = dist·(cosE − e)、z = dist·√(1−e²)·sinE 的开普勒椭圆，
     这里用同一公式采样，几何与卫星真实轨迹严格一致（而不是画个正圆示意）；
     线挂在 periGroup 下，与卫星共用 nodeGroup>orbitGroup>periGroup 朝向链路
     （Ω 升交点、i 倾角、ω 近心点幅角一并继承，如月球 5.145°+Ω125.08° 相对黄道）。
     dist 随显示档位变化，由 refreshMoonOrbitLine 原地重写顶点。 */
  /* 160 段足以让近看时的月轨平滑，又不至于让每次切档重写过多顶点。 */
  var MOON_ORBIT_SEGMENTS = 160;
  function makeMoonOrbitLine(mo, bodyColor) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOON_ORBIT_SEGMENTS * 3), 3));
    var col = new THREE.Color(C.colors.orbit);
    if (bodyColor !== undefined && bodyColor !== null) col.lerp(new THREE.Color(bodyColor), 0.38);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: C.scale.orbitOpacity * 0.7
    }));
    mo.orbitLine = line;
    refreshMoonOrbitLine(mo);
    return line;
  }

  function refreshMoonOrbitLine(mo) {
    if (!mo || !mo.orbitLine) return;
    var pos = mo.orbitLine.geometry.attributes.position;
    var arr = pos.array;
    var e = mo.eccentricity || 0;
    var b = mo.dist * Math.sqrt(Math.max(0, 1 - e * e));
    var n = arr.length / 3;
    for (var i = 0; i < n; i++) {
      var u = (i / (n - 1)) * Math.PI * 2;
      arr[i * 3] = mo.dist * (Math.cos(u) - e);
      arr[i * 3 + 1] = 0;
      arr[i * 3 + 2] = b * Math.sin(u);
    }
    pos.needsUpdate = true;
    /* 顶点原地改写后必须重算包围球，否则旧包围球会让线在视锥边缘被误剔除 */
    mo.orbitLine.geometry.computeBoundingSphere();
  }

  function makeOrbitLine(orb, bodyColor, jd) {
    var geo = makeOrbitGeometry(orb, isFinite(jd) ? jd : currentOrbitEpoch());
    /* 基础轨道灰混入天体本色，既统一又有辨识度 */
    var col = new THREE.Color(C.colors.orbit);
    if (bodyColor !== undefined && bodyColor !== null) {
      col.lerp(new THREE.Color(bodyColor), 0.38);
    }
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: C.scale.orbitOpacity
    }));
    systemRoot.add(line);
    return line;
  }

  /* 仅替换 geometry，保留 material 和显隐状态，避免每次 epoch 刷新泄漏材质。 */
  function refreshOrbitLine(line, orb, bodyColor, jd) {
    if (!line) return makeOrbitLine(orb, bodyColor, jd);
    var old = line.geometry;
    line.geometry = makeOrbitGeometry(orb, jd);
    if (old && old.dispose) old.dispose();
    return line;
  }

  /* 轨道线必须与行星「同源」：行星按当前 jd 求根数定位，若轨道线停留在旧 epoch
     的椭圆上，两者会随时间逐渐分离 —— 放到最大时表现为行星偏离轨道线。
     弱压缩示意档轨道半径可达数千单位，同样的根数漂移会被成倍放大，因此这里
     「日期一变就重采样」，并额外用真实时间节流把重建频率压到 5Hz 以内。 */
  var orbitLastRebuildMs = 0;
  function refreshOrbitLines(jd, force) {
    jd = isFinite(jd) ? jd : currentOrbitEpoch();
    var changed = orbitEpochJd === null || Math.abs(jd - orbitEpochJd) >= 1e-6;
    var stamp = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!force && (!changed || stamp - orbitLastRebuildMs < ORBIT_REBUILD_MIN_MS)) return false;
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      p.orbitLine = refreshOrbitLine(p.orbitLine, p.data.orbital, p.data.color, jd);
    }
    if (cometObj) cometObj.orbitLine = refreshOrbitLine(cometObj.orbitLine, cometObj.data.orbital, 0x9fe8ff, jd);
    orbitEpochJd = jd;
    orbitLastRebuildMs = stamp;
    return true;
  }

  /* ---------- 拖尾 ---------- */
  function makeTrail(color, max, opacity) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(max * 3);
    var fade = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    geo.setDrawRange(0, 0);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    systemRoot.add(line);
    return { line: line, pos: pos, fade: fade, max: max, mat: mat };
  }

  /* 静态渐隐曲线：index 0 = 尾端（最暗），末点 = 头部（最亮） */
  function makeFadeArray(n, power) {
    var f = new Float32Array(n);
    for (var i = 0; i < n; i++) f[i] = Math.pow(i / (n - 1), power || 1.35);
    return f;
  }

  /* ---------- 彗星 ---------- */
  function buildComet() {
    var cd = D.comets[0];
    /* 彗核真实外观是暗灰、不规则、坑坑洼洼的岩质体，不该像气态行星那样呈彩色条纹。
       这里强制暗灰基色 + 更强的程序化凹凸（不改变任何轨道与光照关系）。 */
    var sp = { base: 0x7d746a, bump: 0.16, term: 0.10, atmoS: 0, amb: 0.05 };
    var uniforms = makeBodyUniforms(sp, cd.color);
    uniforms.uBump.value = 0.18;

    var mesh = new THREE.Mesh(sphereGeo(moonSegLevel()), new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG
    }));
    /* 彗核真实半径仅 5.5 km，映射后过小，固定放大到 0.35 场景单位才可见。 */
    mesh.scale.setScalar(0.35);
    mesh.userData.bodyId = 'halley';
    systemRoot.add(mesh);
    /* 彗核不参与拾取 */

    var headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('180,225,255', 2.4), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    }));
    headGlow.scale.set(0.03, 0.03, 1);
    mesh.add(headGlow);

    /* 外层彗发：比内核大而淡，近日点被太阳加热后显著膨胀 */
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('150,210,255', 3.2), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    }));
    halo.scale.set(0.05, 0.05, 1);
    mesh.add(halo);

    /* 彗尾：WebGL 线宽恒为 1，画出来只能是一根细丝，缺少「拖尾」的体量感。
       改用加性粒子沿尾轴分布：靠近彗核小而亮，越往尾端越大越淡（尘埃向外扩散）。
       离子尾 ×3（不同波幅相位，蓝色等离子体束）+ 尘埃尾 ×3（不同弯曲度，扇形暖白尾）。 */
    function cometTail(color, count) {
      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(count * 3);
      var fade = new Float32Array(count);
      var size = new Float32Array(count);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: 1 },
          uPixelRatio: U.pixelRatio
        },
        vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      });
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      systemRoot.add(pts);
      return { points: pts, pos: pos, fade: fade, size: size, max: count, mat: mat };
    }
    var ions = [cometTail(0x9fdcff, 150), cometTail(0x7fc4ff, 130), cometTail(0xbfe6ff, 110)];
    var dusts = [cometTail(0xffe6bd, 130), cometTail(0xffdca0, 110), cometTail(0xfff2d8, 90)];

    var orbitLine = makeOrbitLine(cd.orbital, 0x9fe8ff);
    orbitLine.material.opacity = 0.18;

    cometObj = {
      data: cd, mesh: mesh, uniforms: uniforms, glow: headGlow, halo: halo,
      ions: ions, dusts: dusts, orbitLine: orbitLine,
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), hasPrev: false,
      side: new THREE.Vector3(), dir: new THREE.Vector3(), vel: new THREE.Vector3()
    };
  }

  /* ---------- 星空 ---------- */

  /* B-V 色指数 -> RGB（简化色温 ramp） */
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
    randomState = ((normalizeSeed(proceduralSeed) ^ (salt >>> 0)) >>> 0) || 1;
  }

  function random() {
    randomState = (mul32(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  function randn() {
    return (random() + random() + random() + random() - 2) * 0.7;
  }

  /* 银道面法线（与 galaxy.js 的 60.2° 倾角保持一致） */
  function galacticPole() {
    var a = C.galaxy.tiltDeg * DEG;
    return new THREE.Vector3(0, Math.cos(a), Math.sin(a));
  }

  /* 阶段5 B3：真实全天银河背景（ESO/S. Brunier，CC BY 4.0，见 NOTICE）
     用一颗内表面贴 equirect 全景图的天球取代纯色天空：天球每帧跟随相机，
     等效无限远背景；程序化星点保留（近景仍需），两者叠加。
     全景图为 2:1 等距圆柱，球面默认 UV 与之对应，无需改 mapping。
     低画质档不显示（见 update 中的可见性同步），避免额外显存与带宽。 */
  function buildSkyDome() {
    if (skyDome) return;
    var r = (camera && camera.far) ? camera.far * 0.9 : 1e6;
    /* ESO 全景实测只含「地平线以上」天区：图像下半 50% 平均亮度 0、
       非黑像素 0%（未拍摄区域）。因此天球只建上半球（北极→赤道 =
       天顶→地平线）；下半球无数据，沿用场景背景色 + 程序化星点，不编造。 */
    var geo = new THREE.SphereGeometry(r, 64, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    /* 顶点 alpha：赤道（地平线）处 0 → 向天顶 15% 高度内平滑升到 1。
       银河带最亮的部分贴近赤道，直接硬切会与下方深空形成一条割裂的
       水平分界线；渐隐让它像真实地平线一样柔和沉入背景。
       r128 支持 4 分量顶点色（含 alpha），配合 transparent 生效。 */
    var posAttr = geo.attributes.position;
    var vc = new Float32Array(posAttr.count * 4);
    for (var vi = 0; vi < posAttr.count; vi++) {
      var ny = posAttr.getY(vi) / r;                     /* 赤道 0 → 天顶 1 */
      var a = Math.min(1, ny / 0.15);
      a = a * a * (3 - 2 * a);                           /* smoothstep */
      vc[vi * 4] = 1; vc[vi * 4 + 1] = 1; vc[vi * 4 + 2] = 1; vc[vi * 4 + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(vc, 4));
    var mat = new THREE.MeshBasicMaterial({
      color: 0x0a0f18, side: THREE.BackSide, depthWrite: false, fog: false,
      transparent: true, vertexColors: true
    });
    skyDome = new THREE.Mesh(geo, mat);
    skyDome.frustumCulled = false;
    skyDome.renderOrder = -1;        // 最先绘制（背景层）
    scene.add(skyDome);
    safeTexture('milkyway', function (t) {
      if (!t || !skyDome) return;
      if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      /* 只采样图像上半（v ∈ [0.5,1] = 地平线→天顶）：下半是未拍摄的黑区 */
      t.repeat.set(1, 0.5);
      t.offset.set(0, 0.5);
      skyDome.material.map = t;
      skyDome.material.color.set(0xffffff);
      skyDome.material.needsUpdate = true;
    });
  }

  function buildStarfield() {
    disposePoints(starfield);
    disposePoints(starSpikes);

    /* 固定随机流：与画质档无关，低/高画质的前 n 颗星保持同一批粒子。 */
    setRandomStream(0x53544152);

    var n = quality.starCount;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var size = new Float32Array(n);

    var spikeIdx = [];
    var pole = galacticPole();
    /* 与银道面垂直的两个基向量 */
    var e1 = new THREE.Vector3(1, 0, 0);
    var e2 = new THREE.Vector3(0, pole.z, -pole.y);

    var mMin = 1.15, mMax = 6.60;
    var k = 0.6 * Math.LN10;
    var e0 = Math.exp(k * mMin), e1v = Math.exp(k * mMax);
    var rgb = [0, 0, 0];

    for (var i = 0; i < n; i++) {
      var ux, uy, uz;
      if (random() < 0.56) {
        /* 银道带：纬度压向银道面 */
        var lat = Math.asin(random() * 2 - 1) * 0.30;
        var lon = random() * Math.PI * 2;
        var cl = Math.cos(lat), sl = Math.sin(lat);
        var cl2 = Math.cos(lon), sl2 = Math.sin(lon);
        ux = cl * (cl2 * e1.x + sl2 * e2.x) + sl * pole.x;
        uy = cl * (cl2 * e1.y + sl2 * e2.y) + sl * pole.y;
        uz = cl * (cl2 * e1.z + sl2 * e2.z) + sl * pole.z;
      } else {
        var u = random() * 2 - 1, th = random() * Math.PI * 2;
        var s = Math.sqrt(1 - u * u);
        ux = s * Math.cos(th); uy = u; uz = s * Math.sin(th);
      }

      var r = 5200 + random() * 2200;
      pos[i * 3] = r * ux; pos[i * 3 + 1] = r * uy; pos[i * 3 + 2] = r * uz;

      /* 星等分布：N(m) ∝ 10^(0.6m)，暗星远多于亮星 */
      var m = Math.log(random() * (e1v - e0) + e0) / k;
      var flux = Math.pow(10, -0.4 * (m - mMin));
      var bright = Math.pow(flux, 0.42) * 0.92 + 0.08;

      /* B-V 色温分布：红矮星居多，带蓝白尾 */
      var bv = 0.62 + randn() * 0.42;
      if (bv < -0.33) bv = -0.33; else if (bv > 1.70) bv = 1.70;
      bvToRgb(bv, rgb);

      var sc = bright * (0.82 + 0.18 * random());
      col[i * 3] = rgb[0] * sc; col[i * 3 + 1] = rgb[1] * sc; col[i * 3 + 2] = rgb[2] * sc;

      var px = 0.85 + 2.45 * Math.pow(bright, 2.2);
      size[i] = px;

      /* 亮星阈值按星等分布标定：约取最亮的 1%~2%（高画质下约 150~200 颗） */
      if (bright > 0.45) spikeIdx.push(i);
    }

    starfield = makePoints(pos, col, size, n, STAR_VERT, STAR_FRAG, false);
    scene.add(starfield);

    /* 亮星十字星芒：单独一批点，尺寸更大 */
    if (qv.spikes && spikeIdx.length) {
      var cap = Math.min(spikeIdx.length, Math.max(40, Math.round(n * 0.03)));
      var sp = new Float32Array(cap * 3), sc2 = new Float32Array(cap * 3), ss = new Float32Array(cap);
      for (var j = 0; j < cap; j++) {
        var src = spikeIdx[j];
        sp[j * 3] = pos[src * 3]; sp[j * 3 + 1] = pos[src * 3 + 1]; sp[j * 3 + 2] = pos[src * 3 + 2];
        var f = 0.55 * qv.starSpikes;
        sc2[j * 3] = col[src * 3] * f; sc2[j * 3 + 1] = col[src * 3 + 1] * f; sc2[j * 3 + 2] = col[src * 3 + 2] * f;
        ss[j] = 7 + 19 * (size[src] / 3.3);
      }
      starSpikes = makePoints(sp, sc2, ss, cap, STAR_VERT, SPIKE_FRAG, false);
      scene.add(starSpikes);
    } else {
      starSpikes = null;
    }
  }

  function makePoints(pos, col, size, count, vs, fs, attenuate) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    var uniforms = { uPixelRatio: U.pixelRatio, uHeightScale: U.heightScale, uSizeScale: { value: 1 }, uOpacity: { value: 1 } };
    /* 注意：ShaderMaterial 不支持 sizeAttenuation 属性，透视衰减在顶点着色器内自行处理 */
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: vs, fragmentShader: fs,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = true;
    geo.computeBoundingSphere();
    return pts;
  }

  function disposePoints(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  /* ---------- 小行星带 / 柯伊伯带 ---------- */
  function buildBelts() {
    beltObjects.forEach(function (b) { disposePoints(b); });
    beltObjects = [];
    addBelt(D.belts.asteroid, quality.asteroidCount, true, 0x41535452);
    addBelt(D.belts.kuiper, quality.kuiperCount, false, 0x4b554950);
  }

  /* Kirkwood 空隙等径向结构（简化） */
  function gapFactor(au, c, w) {
    return 1 - 0.92 * Math.exp(-Math.pow((au - c) / w, 2));
  }

  function beltDensity(au, cfg, isAsteroid) {
    if (isAsteroid) {
      var d = Math.exp(-Math.pow((au - 2.72) / 0.62, 2)) * 0.55 + 0.45;
      d *= gapFactor(au, 2.06, 0.035);
      d *= gapFactor(au, 2.50, 0.055);
      d *= gapFactor(au, 2.82, 0.045);
      d *= gapFactor(au, 3.27, 0.050);
      return d;
    }
    var k = 0.35 + 0.65 * Math.exp(-Math.pow((au - 44.5) / 9.5, 2));
    k *= 1 - 0.42 * Math.exp(-Math.pow((au - 39.4) / 1.1, 2));   // 3:2 共振群略稀疏
    return k;
  }

  function sampleAu(cfg, isAsteroid) {
    var au = cfg.innerAu + random() * (cfg.outerAu - cfg.innerAu);
    for (var i = 0; i < 10; i++) {
      if (random() < beltDensity(au, cfg, isAsteroid)) break;
      au = cfg.innerAu + random() * (cfg.outerAu - cfg.innerAu);
    }
    return au;
  }

  function addBelt(cfg, count, isAsteroid, salt) {
    setRandomStream(salt === undefined ? (isAsteroid ? 0x41535452 : 0x4b554950) : salt);
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var size = new Float32Array(count);
    var base = new THREE.Color(cfg.color);

    for (var i = 0; i < count; i++) {
      var au = sampleAu(cfg, isAsteroid);
      var rScene = SOLAR.auToScene(au);
      var ang = random() * Math.PI * 2;
      /* 偏心率造成径向抖动 + 倾角造成垂向散布，避免整齐圆环；
         抖动幅度需小于 Kirkwood 空隙宽度，否则径向结构会被抹平 */
      var ecc = (random() - 0.5) * 0.024;
      var rr = rScene * (1 + ecc * Math.cos(ang));
      var inc = randn() * cfg.inclinationDeg * 0.34 * DEG;
      var h = rr * Math.sin(inc) + (random() - 0.5) * cfg.thicknessAu * rScene * 0.02;

      pos[i * 3] = rr * Math.cos(ang);
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = rr * Math.sin(ang);

      /* 尺寸幂律分布：小颗粒远多于大块；亮度随尺寸与反照率变化 */
      var s = isAsteroid ? (0.17 + Math.pow(random(), 3.0) * 0.92)
                         : (0.28 + Math.pow(random(), 3.0) * 1.55);
      size[i] = s;

      var albedo = 0.45 + random() * 0.75;
      var warm = random();
      var tint = isAsteroid ? (warm < 0.35 ? 1.16 : (warm > 0.82 ? 0.80 : 1.0)) : 0.88 + warm * 0.30;
      var b = Math.min(1.15, (0.32 + 0.55 * Math.min(s, 1.1)) * albedo);
      col[i * 3] = base.r * tint * b;
      col[i * 3 + 1] = base.g * tint * b;
      col[i * 3 + 2] = base.b * tint * b;
    }

    var pts = makePoints(pos, col, size, count, BELT_VERT, BELT_FRAG, true);
    /* 太阳系根节点会整体随银河系平移；环带是近景核心对象，使用固定显示避免
       画质重建后包围球与相机相对位置短暂失配而被错误裁掉。 */
    pts.frustumCulled = false;
    pts.material.uniforms.uOpacity.value = isAsteroid ? 0.62 : 0.52;
    pts.material.uniforms.uSizeScale.value = 1.0;
    systemRoot.add(pts);
    pts.visible = beltsVisible;
    beltObjects.push(pts);
  }

  /* ============ 每帧更新 ============ */

  function update(jd, simDaysValue, dt) {
    /* 每帧手动清零渲染统计（autoReset 已关闭），保证本帧结束时读到的是整帧总量 */
    if (renderer && renderer.info) renderer.info.reset();

    simDays = simDaysValue;
    elapsed += dt;
    U.time.value = elapsed;

    updateSunProminences();

    if (Math.abs(align.amount - align.target) > 0.001) {
      align.amount += (align.target - align.amount) * Math.min(1, dt * 3.2);
    } else {
      align.amount = align.target;
    }

    /* main.js 已先推进银河公转；此处读取的是本帧最终 systemRoot 世界坐标。 */
    U.sunPos.value.copy(systemRoot.position);

    var i, p;
    for (i = 0; i < planets.length; i++) updatePlanet(planets[i], jd, dt);
    updateComet(jd);
    /* 卫星可挂在母星赤道 tilt 子树内，阴影 uniform 必须读取最终世界矩阵。 */
    systemRoot.updateMatrixWorld(true);
    updateShadowUniforms();
    adaptiveUpdateAccum += dt;
    secondaryUpdateAccum += dt;
    labelUpdateAccum += dt;
    if (adaptiveUpdateAccum >= 1 / 20) {
      adaptiveUpdateAccum = 0;
      updateSunAdaptive();
    }

    /* 地球云层缓慢漂移 */
    var earth = bodyIndex.earth;
    if (earth && secondaryUpdateAccum >= 1 / 30) {
      secondaryUpdateAccum = 0;
      var cu = earth.uniforms.uCloudShift;
      cu.value = (cu.value + dt * 0.0016) % 1;
      for (i = 0; i < beltObjects.length; i++) {
        beltObjects[i].rotation.y += (1 / 30) * (i === 0 ? 0.000035 : 0.000012);
      }
    }

    if (sunMesh) sunMesh.rotation.y = (simDays * 24 / D.sun.rotationH) * Math.PI * 2 % (Math.PI * 2);
    /* 星空保持静止：银道带方向需与 galaxy.js 的倾角一致；
       但整体跟随相机平移（恒星在无穷远，避免拉远时星穹出现空洞） */
    if (starfield) starfield.position.copy(camera.position);
    if (starSpikes) starSpikes.position.copy(camera.position);
    /* 天球随相机移动（等效无限远），可见性跟随星点开关；低画质档不显示 */
    if (skyDome) {
      skyDome.position.copy(camera.position);
      skyDome.visible = (!starfield || starfield.visible) && qualityName !== 'low';
    }
    /* 日期跳转后的下一帧会立即刷新；连续播放时按 epoch 阈值节流。 */
    refreshOrbitLines(jd, false);
    if (labelUpdateAccum >= 1 / 20) {
      labelUpdateAccum = 0;
      updateLabels();
    }
  }

  function updatePlanet(p, jd, dt) {
    var pos = A.heliocentric(p.data.orbital, jd);
    var sp = A.toScene(pos);
    p.rAu = pos.r;

    var x = sp.x, y = sp.y, z = sp.z;
    if (align.amount > 0) {
      var ar = SOLAR.auToScene(pos.r);
      x = x * (1 - align.amount) + ar * align.amount;
      y = y * (1 - align.amount);
      z = z * (1 - align.amount);
    }

    /* Pluto 与 Charon 绕共同质心运动：主星沿当前连线反向偏移。 */
    var bary = p.data.barycenter;
    var baryMoon = null;
    var primaryOffset = 0;
    if (bary && bary.companionId) {
      for (var bi = 0; bi < p.moons.length; bi++) {
        if (p.moons[bi].data.id === bary.companionId) { baryMoon = p.moons[bi]; break; }
      }
      if (baryMoon && typeof bary.fromPrimaryCenterKm === 'number') {
        primaryOffset = SOLAR.kmToScene(bary.fromPrimaryCenterKm);
      }
    }

    var revPerDay = 24 / p.data.rotationH;
    p.mesh.rotation.y = (simDays * revPerDay) * Math.PI * 2 % (Math.PI * 2);

    for (var i = 0; i < p.moons.length; i++) {
      var m = p.moons[i];
      /* 带符号周期决定顺逆行；偏心近点角保留轨道长短轴比例。
         升交点 Ω、倾角 i、近心点幅角 ω 已由 nodeGroup>orbitGroup>periGroup 层级承担，
         这里只叠加 J2000 平近点角初值 M₀；整体乘 direction，
         逆行体（Triton/Charon）的初相与运行方向一致。 */
      var mean = (m.m0 + (simDays / m.periodAbs) * Math.PI * 2) * m.direction;
      var E = A.solveKepler(mean, m.eccentricity);
      var root = Math.sqrt(Math.max(0, 1 - m.eccentricity * m.eccentricity));
      var lx = m.dist * (Math.cos(E) - m.eccentricity);
      var lz = m.dist * root * Math.sin(E);
      m.mesh.position.set(lx, 0, lz);
      if (m === baryMoon && primaryOffset > 0) {
        var sep = Math.sqrt(lx * lx + lz * lz);
        if (sep > 1e-6) {
          x -= lx / sep * primaryOffset;
          z -= lz / sep * primaryOffset;
        }
      }

      /* 潮汐锁定体始终让同一经线朝向母星；未锁定体才按自转周期旋转。 */
      if (m.data.tidallyLocked) {
        m.mesh.rotation.y = -Math.atan2(lz, lx);
      } else if (typeof m.data.rotationH === 'number' && Math.abs(m.data.rotationH) > 1e-6) {
        m.mesh.rotation.y = (simDays * 24 / m.data.rotationH) * Math.PI * 2 % (Math.PI * 2);
      }
    }

    p.group.position.set(x, y, z);
    p.scenePos.set(x, y, z);

    if (showTrails) pushTrail(p, x, y, z, dt);
    else if (p.trailCount > 0) {
      p.trailCount = 0; p.trailWrite = 0; p.trailTimer = TRAIL_SAMPLE_INTERVAL;
      p.trail.geometry.setDrawRange(0, 0);
    }
  }

  /* 逐帧写入自阴影所需的世界坐标（避免每帧 new） */
  function updateShadowUniforms() {
    var sys = systemRoot.position;
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      var cx = p.scenePos.x + sys.x, cy = p.scenePos.y + sys.y, cz = p.scenePos.z + sys.z;

      p.uniforms.uCenter.value.set(cx, cy, cz);
      p.uniforms.uRadius.value = p.radius;

      /* 先统一刷新所有卫星相对母星的最终局部坐标；日食遮挡与月食本影
         都读取这一份数据，不能让 occMoons 在本帧继续使用上一帧偏移。 */
      for (var j = 0; j < p.moons.length; j++) {
        var moon = p.moons[j];
        moon.mesh.getWorldPosition(moon.worldPos);
        moon.offset.copy(moon.worldPos);
        p.group.worldToLocal(moon.offset);
      }

      /* 卫星投影（日食） */
      var o0 = p.occMoons[0], o1 = p.occMoons[1];
      if (qv.moonShadow > 0 && o0) {
        p.uniforms.uOcc0.value.set(cx + o0.offset.x, cy + o0.offset.y, cz + o0.offset.z);
        p.uniforms.uOcc0R.value = o0.radius;
      } else {
        p.uniforms.uOcc0R.value = 0;
      }
      if (qv.moonShadow > 1 && o1) {
        p.uniforms.uOcc1.value.set(cx + o1.offset.x, cy + o1.offset.y, cz + o1.offset.z);
        p.uniforms.uOcc1R.value = o1.radius;
      } else {
        p.uniforms.uOcc1R.value = 0;
      }

      /* 环影 + 环上的行星本影 */
      if (p.ring) {
        p.ring.uniforms.uCenter.value.set(cx, cy, cz);
        p.uniforms.uRingShadow.value = qv.ringShadow ? 0.88 : 0;
      }

      /* 卫星：行星本影（月食） */
      for (var k = 0; k < p.moons.length; k++) {
        var m = p.moons[k];
        m.uniforms.uOcc0.value.set(cx, cy, cz);
        m.uniforms.uOcc0R.value = qv.moonShadow > 0 ? p.radius : 0;
        m.uniforms.uCenter.value.set(cx + m.offset.x, cy + m.offset.y, cz + m.offset.z);
        m.uniforms.uRadius.value = m.radius;
      }
    }

    if (cometObj) {
      cometObj.uniforms.uCenter.value.copy(cometObj.pos).add(sys);
      cometObj.uniforms.uRadius.value = 0.35;
    }
  }

  /* 太阳辉光随相机距离自适应：近处抑制过曝，远处保持可见 */
  function updateSunAdaptive() {
    if (!sunMesh || !camera) return;
    var radius = sunMesh.userData.sunRadius || 1;
    var dist = tmpV1.copy(camera.position).sub(systemRoot.position).length();
    if (!(dist > 1e-3)) dist = 1e-3;

    var halfTan = Math.tan(camera.fov * DEG * 0.5);
    var angFrac = (radius / dist) / halfTan;          // 太阳半径占半屏高的比例
    sunScreenFraction = angFrac < 0 ? 0 : (angFrac > 3 ? 3 : angFrac);
    updateSunSpots();

    var near = angFrac / 0.55;                        // 0=远 1=极近
    near = near < 0 ? 0 : (near > 1 ? 1 : near);

    /* 日冕：贴近时压低强度，避免糊成一片白 */
    for (var i = 0; i < coronaShells.length; i++) {
      var shell = coronaShells[i];
      var base = shell.userData.coronaBase || 0.3;
      var vis = qv.corona >= shell.userData.coronaLayer;
      shell.visible = vis;
      shell.material.uniforms.uStrength.value = base * (1 - 0.35 * near);
    }

    /* 光晕 Sprite：恒定屏幕尺寸 + 近距离降透明度 */
    var frac = radius / dist / halfTan * 3.0;         // 期望直径（占屏高比例）
    frac = frac < 0.055 ? 0.055 : (frac > 0.85 ? 0.85 : frac);
    var s = frac * 2 * halfTan;
    sunGlow.scale.set(s, s, 1);
    sunGlow.material.opacity = 0.95 - 0.72 * smoothstep(0.02, 0.45, angFrac);

    /* 表面强度：贴近时略降，避免整屏过曝。基值 2.15 让盘面核心过曝成白热，
       near=1 时降到 1.70，避免近景全屏死白。 */
    sunUniforms.uIntensity.value = 2.15 - 0.45 * near;
    /* 米粒组织只在太阳足够大时开启，远处关闭高频细节以避免闪烁 */
    sunUniforms.uDetail.value = smoothstep(0.02, 0.16, angFrac);
  }

  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    return t * t * (3 - 2 * t);
  }

  function pushTrail(p, x, y, z, dt) {
    p.trailTimer += dt || 0;
    if (p.trailTimer < TRAIL_SAMPLE_INTERVAL) return;
    p.trailTimer = 0;
    var max = p.trailMax;
    var write = p.trailWrite * 3;
    p.trailRing[write] = x; p.trailRing[write + 1] = y; p.trailRing[write + 2] = z;
    p.trailWrite = (p.trailWrite + 1) % max;
    if (p.trailCount < max) p.trailCount++;

    /* 线段几何必须按时间顺序连续，环形存储避免每次追加搬移整段历史。 */
    var start = p.trailCount === max ? p.trailWrite : 0;
    for (var j = 0; j < p.trailCount; j++) {
      var src = ((start + j) % max) * 3;
      var dst = j * 3;
      p.trailPts[dst] = p.trailRing[src];
      p.trailPts[dst + 1] = p.trailRing[src + 1];
      p.trailPts[dst + 2] = p.trailRing[src + 2];
    }
    p.trail.geometry.attributes.position.needsUpdate = true;
    p.trail.geometry.setDrawRange(0, p.trailCount);

    /* 渐隐：序号越大越新、越亮 */
    var n = p.trailCount - 1;
    if (n > 0) {
      for (var i = 0; i <= n; i++) p.trailFade[i] = Math.pow(i / n, 1.5);
      if (n < max - 1) p.trailFade[n + 1] = 0;
    }
    p.trail.geometry.attributes.aFade.needsUpdate = true;
  }

  function updateComet(jd) {
    if (!cometObj) return;
    var pos = A.heliocentric(cometObj.data.orbital, jd);
    var sp = A.toScene(pos);

    cometObj.mesh.position.set(sp.x, sp.y, sp.z);
    cometObj.pos.set(sp.x, sp.y, sp.z);

    /* 速度方向（用于尘埃尾滞后） */
    if (cometObj.hasPrev) cometObj.vel.copy(cometObj.pos).sub(cometObj.prev);
    else cometObj.vel.set(0, 0, 0);
    cometObj.prev.copy(cometObj.pos);
    cometObj.hasPrev = true;

    /* 活动强度随日心距衰减：近日点长尾、远日点几乎无尾。
       act 同时决定尾长与亮度；远日点（哈雷 2026 年约 34 AU）物理上应无尾，
       但那样课堂上完全看不到尾部结构，故保留 0.10 的演示下限（界面上应视为示意）。 */
    var r = Math.max(pos.r, 0.4);

    /* 尾长与亮度都按真实天文量给出：
         - 尾长 ≈ 0.9 / r^1.2 AU，上限 1.6 AU（真实哈雷在 0.6 AU 附近的可见尾
           即 1 AU 量级，1986 年那次尘埃尾超过 1 AU），随日心距快速缩短；
         - 活动度在约 10 AU 内衰减，远日点只保留演示下限（真实早已无尾）。
       尾长必须经与轨道一致的距离映射换算成场景单位——距离是幂律压缩
       （distanceBase × AU^distanceExp，档位不同参数不同），直接当作场景单位
       会让近日点的尾横向拉长近十倍。 */
    var tailAU = 0.9 / Math.pow(r, 1.2);
    tailAU = tailAU < 0.02 ? 0.02 : (tailAU > 1.6 ? 1.6 : tailAU);
    var len = SOLAR.auToScene(r + tailAU) - SOLAR.auToScene(r);
    if (len < 0.6) len = 0.6;

    var act = 1 - (r - 0.8) / 10;
    act = act < 0.10 ? 0.10 : (act > 1 ? 1 : act);
    var lenNorm = len / 36;                                       // 摆动/张开的归一化基准（近日点尾长≈36 单位）

    /* 拖尾线段是 systemRoot 的子对象，统一使用 systemRoot 局部坐标
       （太阳位于该局部原点，故尾向 = normalize(彗星局部坐标)） */
    var dir = cometObj.dir.set(sp.x, sp.y, sp.z);
    if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
    dir.normalize();
    var side = cometObj.side.set(0, 1, 0).cross(dir);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0).cross(dir);
    side.normalize();
    if (cometObj.vel.lengthSq() > 1e-10) {
      side.copy(cometObj.vel).normalize().cross(dir);
      if (side.lengthSq() < 1e-10) side.set(0, 1, 0).cross(dir);
      side.normalize();
    }

    var t = elapsed;
    /* 尾的起点从彗核表面之外开始：特写距离下彗核会挡住中心处的粒子，
       视觉上像「尾巴和彗核分了家」。 */
    var head = tmpV2.set(sp.x, sp.y, sp.z).addScaledVector(dir, cometObj.mesh.scale.x * 0.55);

    /* 离子尾：笔直背离太阳，三条叠加形成发散的等离子体束（波幅/相位/横向张开各不相同） */
    var ION = [
      { wob: 1.70, ph: 0.0, spread: -1.0, gain: 1.00, size: 2.6 },
      { wob: 1.05, ph: 2.1, spread: 0.15, gain: 0.72, size: 2.2 },
      { wob: 0.55, ph: 4.4, spread: 1.0, gain: 0.50, size: 1.8 }
    ];
    for (var k = 0; k < cometObj.ions.length; k++) {
      var ion = cometObj.ions[k], cfgI = ION[k] || ION[2];
      var n = ion.max, arr = ion.pos;
      for (var i = 0; i < n; i++) {
        /* f = 1 处是彗核（最亮最小），f = 0 处是尾端（最淡最大） */
        var f = 1 - i / (n - 1);
        var wob = Math.sin(t * 1.15 + cfgI.ph + f * 5.2) * cfgI.wob * f * lenNorm;
        var off = wob + cfgI.spread * f * lenNorm * 1.8;
        arr[i * 3] = head.x + dir.x * len * f + side.x * off;
        arr[i * 3 + 1] = head.y + dir.y * len * f + side.y * off;
        arr[i * 3 + 2] = head.z + dir.z * len * f + side.z * off;
        ion.fade[i] = Math.pow(f, 1.3);                       // 头部最亮
        ion.size[i] = cfgI.size * (0.5 + 1.7 * (1 - f));      // 尾端粒子更大（扩散）
      }
      ion.points.geometry.attributes.position.needsUpdate = true;
      ion.points.geometry.attributes.aFade.needsUpdate = true;
      ion.points.geometry.attributes.aSize.needsUpdate = true;
      ion.mat.uniforms.uOpacity.value = (0.10 + 0.50 * act) * cfgI.gain;
    }

    /* 尘埃尾：滞后于运动方向并弯曲，三条不同弯曲度叠成扇形。
       混合系数 0.75：越偏向 -velocity，「拖在飞行后方」的感觉越强。 */
    var back = tmpV3.copy(cometObj.vel);
    if (back.lengthSq() > 1e-10) back.normalize(); else back.set(0, 0, 0);
    var dx = dir.x - back.x * 0.75, dy = dir.y - back.y * 0.75, dz = dir.z - back.z * 0.75;
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;

    var DUST = [
      { bend: 0.30, dlen: 0.56, gain: 1.00, size: 2.2 },
      { bend: 0.16, dlen: 0.44, gain: 0.80, size: 2.0 },
      { bend: 0.48, dlen: 0.66, gain: 0.62, size: 1.7 }
    ];
    for (var q = 0; q < cometObj.dusts.length; q++) {
      var dust = cometObj.dusts[q], cfgD = DUST[q] || DUST[2];
      var m = dust.max, darr = dust.pos, dlen = len * cfgD.dlen;
      for (var j = 0; j < m; j++) {
        var g = 1 - j / (m - 1);          // 与离子尾同因：j = m-1 是彗核（最亮）
        var bend = g * g * dlen * cfgD.bend;
        darr[j * 3] = head.x + dx * dlen * g + side.x * bend;
        darr[j * 3 + 1] = head.y + dy * dlen * g + side.y * bend;
        darr[j * 3 + 2] = head.z + dz * dlen * g + side.z * bend;
        dust.fade[j] = Math.pow(g, 1.6);
        dust.size[j] = cfgD.size * (0.5 + 2.0 * (1 - g));
      }
      dust.points.geometry.attributes.position.needsUpdate = true;
      dust.points.geometry.attributes.aFade.needsUpdate = true;
      dust.points.geometry.attributes.aSize.needsUpdate = true;
      dust.mat.uniforms.uOpacity.value = (0.08 + 0.32 * act) * cfgD.gain;
    }

    /* 彗核亮度 / 彗发随日心距变化：近日点彗发明显膨胀 */
    cometObj.mesh.visible = true;
    cometObj.glow.material.opacity = 0.25 + 0.65 * act;
    var gs = 0.030 + 0.085 * act;
    cometObj.glow.scale.set(gs, gs, 1);
    cometObj.halo.material.opacity = 0.10 + 0.38 * act;
    var hs = 0.06 + 0.30 * act;
    cometObj.halo.scale.set(hs, hs, 1);
  }

  /* ============ 对外接口 ============ */

  function setAlign(on) { align.target = on ? 1 : 0; }
  function isAligned() { return align.target > 0.5; }

  /* 点尺寸换算：drawingBuffer 高度 / (2·tan(fov/2)) */
  function updateProjectionScale() {
    if (!renderer || !camera) return;
    var pr = renderer.getPixelRatio ? renderer.getPixelRatio() : effectivePixelRatio;
    U.pixelRatio.value = pr;
    U.heightScale.value = (renderHeight() * pr) / (2 * Math.tan(camera.fov * DEG * 0.5));
  }

  function applyQualityDetail() {
    var i, geo = sphereGeo(qv.seg);
    for (i = 0; i < planets.length; i++) {
      var p = planets[i];
      p.mesh.geometry = geo;
      p.uniforms.uBump.value = (surfaceParams(p.id).bump || 0) * (qv.bump ? 1 : 0);
      for (var j = 0; j < p.moons.length; j++) {
        p.moons[j].mesh.geometry = sphereGeo(moonSegLevel());
        p.moons[j].uniforms.uBump.value = (surfaceParams(p.moons[j].data.id).bump || 0) * (qv.bump ? 1 : 0);
      }
    }
    if (cometObj) cometObj.mesh.geometry = sphereGeo(moonSegLevel());

    /* 太阳网格细分 */
    if (sunMesh) {
      var seg = SUN_SEGMENTS[qv.seg] || SUN_SEGMENTS.m;
      var r = sunMesh.userData.sunRadius || 1;
      sunMesh.geometry.dispose();
      sunMesh.geometry = new THREE.SphereGeometry(r, seg[0], seg[1]);
    }
  }

  function setQuality(name) {
    qualityName = C.quality[name] ? name : 'high';
    quality = C.quality[qualityName];
    qv = QUAL[qualityName] || QUAL.high;

    applyPixelRatio(quality.pixelRatio);
    renderer.setSize(renderWidth(), renderHeight());
    showTrails = quality.trails;

    if (SOLAR.Effects) SOLAR.Effects.setBloom(quality.bloom);
    if (SOLAR.Galaxy) SOLAR.Galaxy.setQuality(qualityName);
    qualityJobVersion += 1;
    qualityJob = { version: qualityJobVersion, step: 0 };
    scheduleQualityJob();
    return qualityName;
  }

  /* 画质切换拆成多个渲染帧，避免一次性销毁/创建星场、带和球体几何造成长任务。 */
  function scheduleQualityJob() {
    if (!qualityJob || qualityJob.queued) return;
    qualityJob.queued = true;
    window.requestAnimationFrame(runQualityJob);
  }

  function runQualityJob() {
    if (!qualityJob) return;
    var job = qualityJob;
    job.queued = false;
    if (job.version !== qualityJobVersion) return;
    if (job.step === 0) {
      applyQualityDetail();
      job.step++;
    } else if (job.step === 1) {
      buildStarfield();
      job.step++;
    } else if (job.step === 2) {
      buildBelts();
      job.step++;
    } else {
      updateProjectionScale();
      applyScaleMode();
      registerBloomLayer();
      qualityJob = null;
      return;
    }
    scheduleQualityJob();
  }

  function resize() {
    var width = renderWidth(), height = renderHeight();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    applyPixelRatio(quality.pixelRatio);
    renderer.setSize(width, height);
    updateProjectionScale();
    if (SOLAR.Effects) SOLAR.Effects.resize();
  }

  function get(id) { return bodyIndex[id]; }
  function getPlanets() { return planets; }
  function getPickables() { return pickables; }
  function getSunMesh() { return sunMesh; }
  function getTriangleCount() { return renderer.info ? renderer.info.render.triangles : 0; }
  function getQuality() { return qualityName; }

  /* ---------- 显示比例：压缩示意 / 弱压缩示意 ---------- */
  /* 两档的映射参数在 config.profiles 里（distanceExp / sizeExp / sunSizeFactor / 卫星距离），
     这里只管「天体额外放大倍率」——它独立于映射，用来在弱压缩档之上进一步放大天体细节。
     轨道半径、周期、光照关系在两档下都不变。 */
  var SCALE_FACTOR = {
    compact: { planet: 1.0, moon: 1.0, sun: 1.0, comet: 1.0 },
    faithful: { planet: 1.0, moon: 1.0, sun: 1.0, comet: 1.0 }
  };
  var scaleMode = 'compact';

  /* 卫星轨道距离：弱压缩档用幂律 ratio^pow，压缩档用对数公式 */
  function moonDistFor(p, m) {
    var ratio = Math.max(m.data.orbitKm / p.data.radiusKm, 1.01);
    if (C.scale.moonDistPow > 0) return p.radius * Math.pow(ratio, C.scale.moonDistPow);
    return p.radius * (C.scale.moonDistBase + C.scale.moonDistLog * Math.log10(ratio));
  }

  /* 应用映射档案：把 config.profiles 的值写回生效字段，并重算已建对象的尺寸 */
  function applyScaleProfile() {
    var pf = (C.profiles && C.profiles[scaleMode]) || null;
    if (!pf) return;
    if (typeof pf.distanceBase === 'number') C.scale.distanceBase = pf.distanceBase;
    C.scale.distanceExp = pf.distanceExp;
    if (typeof pf.sizeBase === 'number') C.scale.sizeBase = pf.sizeBase;
    C.scale.sizeExp = pf.sizeExp;
    C.scale.sunSizeFactor = pf.sunSizeFactor;
    C.scale.moonDistBase = pf.moonDistBase;
    C.scale.moonDistLog = pf.moonDistLog;
    C.scale.moonDistPow = pf.moonDistPow;
    if (typeof pf.moonSizeFactor === 'number') C.scale.moonSizeFactor = pf.moonSizeFactor;
    /* 轨道采样密度跟随档位：faithful 把轨道推远约 47 倍（2000/42），采样必须同步加密，
       否则折线弧长超过行星半径，近看会出现「行星不在轨道上」的锯齿。 */
    C.scale.orbitSegments = (typeof pf.orbitSegments === 'number') ? pf.orbitSegments : 512;

    var i, j;

    /* 太阳：几何不变，用 scale 换算（真实比例下太阳直径是地球轨道的 1/10） */
    if (sunMesh) {
      var sunBase = sunMesh.userData.sunBaseRadius || sunMesh.userData.sunRadius || 1;
      var sunNew = SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor;
      var kSun = sunNew / sunBase;   // 相对烘焙半径，可反复切档不累积
      sunMesh.userData.sunScale = kSun;
      sunMesh.scale.setScalar(kSun);
      sunMesh.userData.sunRadius = sunNew;
      for (i = 0; i < coronaShells.length; i++) coronaShells[i].scale.setScalar(kSun);
    }

    for (i = 0; i < planets.length; i++) {
      var p = planets[i];
      p.radius = SOLAR.kmToScene(p.data.radiusKm);
      if (p.glowMesh && p.glowMesh.userData.glowRatio) {
        p.glowMesh.userData.glowScaleBase = p.radius * p.glowMesh.userData.glowRatio;
      }
      if (p.ring) {
        /* 环半径与行星半径成正比（inner = 行星半径 × 环内缘 km / 行星半径 km）。
           基准永远是建几何时的烘焙值，用乘法反推，绝不用「上次档位值」当基准，
           否则 faithful→compact 会叠乘成天文数字。 */
        var ringBase = p.ring.baseRadius || p.radius;
        var k = p.radius / ringBase;
        p.ring.mesh.scale.setScalar(k);
        p.ring.uniforms.uInner.value = (p.ring.baseInner !== undefined ? p.ring.baseInner : p.ring.uniforms.uInner.value) * k;
        p.ring.uniforms.uOuter.value = (p.ring.baseOuter !== undefined ? p.ring.baseOuter : p.ring.uniforms.uOuter.value) * k;
        p.uniforms.uRingInner.value = p.ring.uniforms.uInner.value;
        p.uniforms.uRingOuter.value = p.ring.uniforms.uOuter.value;
        /* 行星本影半径必须跟着新行星半径走，否则切档后会留下一圈过大的假影
           （表现为星环「按一条直线分阴阳」、甚至看起来比真实环还大）。 */
        if (p.ring.uniforms.uPlanetRadius) p.ring.uniforms.uPlanetRadius.value = p.radius;
      }
      for (j = 0; j < p.moons.length; j++) {
        var m = p.moons[j];
        /* 与建卫星时保持一致的下限，避免弱压缩档下卫星缩到不可见 */
        m.radius = Math.max(SOLAR.kmToScene(m.data.radiusKm) * C.scale.moonSizeFactor, p.radius * 0.055);
        m.dist = moonDistFor(p, m);
        refreshMoonOrbitLine(m);   /* 轨道线半径跟着档位重算（原地改写顶点，不重建几何） */
      }
      p.orbitLine = refreshOrbitLine(p.orbitLine, p.data.orbital, p.data.color, orbitEpochJd || currentOrbitEpoch());
    }

    /* 彗星轨道线与小行星带 / 柯伊伯带同样依赖距离映射 */
    if (cometObj) cometObj.orbitLine = refreshOrbitLine(cometObj.orbitLine, cometObj.data.orbital, 0x9fe8ff, orbitEpochJd || currentOrbitEpoch());
    buildBelts();
  }

  /* 当前档位下某天体的「示意压缩倍数」（相对地球），用于信息卡如实标注 */
  function getScaleCompress(id) {
    var earth = D.bodies[0];
    for (var i = 0; i < D.bodies.length; i++) { if (D.bodies[i].id === 'earth') earth = D.bodies[i]; }
    if (!earth) return null;
    if (id === 'sun') {
      return {
        radius: +(D.sun.radiusKm / earth.radiusKm / ((SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor) / SOLAR.kmToScene(earth.radiusKm))).toFixed(2),
        distance: null
      };
    }
    for (var k = 0; k < D.bodies.length; k++) {
      var b = D.bodies[k];
      if (b.id !== id) continue;
      var rCompress = (b.radiusKm / earth.radiusKm) / (SOLAR.kmToScene(b.radiusKm) / SOLAR.kmToScene(earth.radiusKm));
      var dCompress = (b.orbital.a / earth.orbital.a) / (SOLAR.auToScene(b.orbital.a) / SOLAR.auToScene(earth.orbital.a));
      return { radius: +rCompress.toFixed(2), distance: +dCompress.toFixed(2) };
    }
    return null;
  }

  function applyScaleMode() {
    var f = SCALE_FACTOR[scaleMode] || SCALE_FACTOR.compact;
    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      setPlanetScale(p, f.planet);
      if (p.glowMesh) {
        var base = p.glowMesh.userData.glowScaleBase || (p.radius * 1.1);
        p.glowMesh.scale.setScalar(base * f.planet);
      }
      for (var j = 0; j < p.moons.length; j++) {
        p.moons[j].mesh.scale.setScalar(p.moons[j].radius * f.moon);
      }
    }
    /* 太阳的缩放由 applyScaleProfile 按烘焙半径算出并存进 sunScale，
       这里只叠加档位额外系数 f.sun，不能无条件写成 f.sun 把 profile 结果抹掉。 */
    var sunScale = sunMesh ? (sunMesh.userData.sunScale || 1) : 1;
    if (sunMesh) sunMesh.scale.setScalar(sunScale * f.sun);
    if (sunMesh && sunMesh.userData) {
      /* userData 半径代表最终世界尺寸，供光晕、黑子和近景亮度统一使用。 */
      sunMesh.userData.sunRadius = SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor * f.sun;
    }
    for (var k = 0; k < coronaShells.length; k++) {
      coronaShells[k].scale.setScalar(sunScale * f.sun * (coronaShells[k].userData.viewScale || 1));
    }
    /* 弱压缩档会把太阳本体放大约两倍，色球层配件也必须同步移动和缩放。
       日珥/耀斑各自保存建模时的法线与半径，切档后据此重算，避免位置漂移。 */
    var attachedSunScale = sunScale * f.sun;
    for (k = 0; k < sunProminences.length; k++) {
      var prom = sunProminences[k];
      if (prom.userData.promNormal && prom.userData.promBaseRadius) {
        prom.position.copy(prom.userData.promNormal)
          .multiplyScalar(prom.userData.promBaseRadius * attachedSunScale * 0.98);
        prom.scale.setScalar((prom.userData.promBaseScale || 1.60) * attachedSunScale);
      }
    }
    for (k = 0; k < sunFlares.length; k++) {
      var flare = sunFlares[k];
      if (flare.userData.flareNormal && flare.userData.flareBaseRadius) {
        flare.position.copy(flare.userData.flareNormal)
          .multiplyScalar(flare.userData.flareBaseRadius * attachedSunScale * 1.01);
        var flareSize = flare.userData.flareBaseRadius * attachedSunScale * 0.55;
        flare.scale.set(flareSize, flareSize, 1);
      }
    }
    if (cometObj) cometObj.mesh.scale.setScalar(0.35 * f.comet);
  }

  function setScaleMode(mode) {
    scaleMode = (mode === 'faithful') ? 'faithful' : 'compact';
    applyScaleProfile();
    applyScaleMode();
    return scaleMode;
  }

  /* ---------- 显示开关（供设置面板调用） ---------- */

  function setOrbitsVisible(on) {
    for (var i = 0; i < planets.length; i++) {
      if (planets[i].orbitLine) planets[i].orbitLine.visible = !!on;
      var ms = planets[i].moons;
      for (var j = 0; j < ms.length; j++) {
        if (ms[j].orbitLine) ms[j].orbitLine.visible = !!on;
      }
    }
    if (cometObj && cometObj.orbitLine) cometObj.orbitLine.visible = !!on;
  }

  function setTrailsVisible(on) {
    showTrails = !!on;
    if (!showTrails) {
      for (var i = 0; i < planets.length; i++) {
        planets[i].trailCount = 0;
        planets[i].trailWrite = 0;
        planets[i].trailTimer = TRAIL_SAMPLE_INTERVAL;
        if (planets[i].trail) {
          planets[i].trail.geometry.setDrawRange(0, 0);
          planets[i].trail.visible = false;
        }
      }
    } else {
      for (var j = 0; j < planets.length; j++) {
        if (planets[j].trail) planets[j].trail.visible = true;
      }
    }
  }

  function setStarfieldVisible(on) {
    if (starfield) starfield.visible = !!on;
  }

  function setBeltsVisible(on) {
    beltsVisible = !!on;
    for (var i = 0; i < beltObjects.length; i++) beltObjects[i].visible = beltsVisible;
  }

  /* ---------- 天体标签（Canvas 文字精灵，屏幕恒定尺寸） ---------- */

  function makeLabelTexture(text) {
    var cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 128;
    var ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = '500 52px ui-monospace, Consolas, Menlo, "Microsoft YaHei", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = Math.min(ctx.measureText(text).width, 440);
    /* 半透明圆角底衬：远处更易读，近处不突兀 */
    var bw = tw + 64, bh = 74, bx = 256 - bw / 2, by = 64 - bh / 2, r = 37;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(2,10,9,.42)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,252,216,.30)';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 左侧强调点 */
    ctx.beginPath();
    ctx.arc(bx + 26, 64, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#7ffcd8';
    ctx.shadowColor = 'rgba(127,252,216,.8)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    /* 文字 */
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#d8fff1';
    ctx.fillText(text, 266, 66);
    ctx.shadowBlur = 0;
    return new THREE.CanvasTexture(cvs);
  }

  function labelName(id) {
    if (id === 'sun') return SOLAR.t('bodies.sun.name');
    var d = SOLAR.I18N[SOLAR.lang] || SOLAR.I18N.en;
    if (d.bodies && d.bodies[id]) return d.bodies[id].name;
    if (d.moons && d.moons[id]) return d.moons[id].name;
    if (d.comet && d.comet[id]) return d.comet[id].name;
    return id;
  }

  function buildLabels() {
    if (labelGroup) scene.remove(labelGroup);
    labelGroup = new THREE.Group();
    labels = [];

    var ids = ['sun'];
    for (var i = 0; i < planets.length; i++) ids.push(planets[i].id);

    for (var k = 0; k < ids.length; k++) {
      var id = ids[k];
      var tex = makeLabelTexture(labelName(id));
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.92
      }));
      spr.scale.set(0.09, 0.0225, 1);
      spr.renderOrder = 10;
      spr.userData.bodyId = id;
      labelGroup.add(spr);
      labels.push({ id: id, sprite: spr });
    }
    labelGroup.visible = labelsVisible;
    scene.add(labelGroup);
  }

  function setLabelsVisible(on) {
    labelsVisible = !!on;
    if (!labelGroup) buildLabels();
    labelGroup.visible = labelsVisible;
  }

  /* 语言切换后重建标签文字 */
  function refreshLabels() {
    if (!labelGroup) return;
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      if (L.sprite.material.map) L.sprite.material.map.dispose();
      L.sprite.material.map = makeLabelTexture(labelName(L.id));
      L.sprite.material.needsUpdate = true;
    }
  }

  function updateLabels() {
    if (!labelGroup || !labelsVisible) return;
    if (!labelWorldPos) labelWorldPos = new THREE.Vector3();
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      if (!labelPositionOf(L.id, labelWorldPos)) continue;
      var r = radiusOf(L.id);
      L.sprite.position.copy(labelWorldPos);
      L.sprite.position.y += r * 1.9 + 0.4;
      var d = camera.position.distanceTo(L.sprite.position);
      L.sprite.material.opacity = d > 6000 ? 0 : 0.92;
    }
  }

  function labelPositionOf(id, target) {
    if (!systemRoot) return false;
    if (id === 'sun') { target.copy(systemRoot.position); return true; }
    var p = bodyIndex[id];
    if (p) { target.copy(p.scenePos).add(systemRoot.position); return true; }
    for (var i = 0; i < planets.length; i++) {
      for (var j = 0; j < planets[i].moons.length; j++) {
        if (planets[i].moons[j].data.id === id) {
          planets[i].moons[j].mesh.getWorldPosition(target); return true;
        }
      }
    }
    if (cometObj && id === 'halley') { target.copy(cometObj.pos).add(systemRoot.position); return true; }
    return false;
  }

  /* 太阳在屏幕上的占比（供后期特效抑制近距离过曝）：1 = 太阳半径占半屏高 */
  function getSunScreenFraction() { return sunScreenFraction; }

  function worldPositionOf(id) {
    var off = systemRoot ? systemRoot.position : new THREE.Vector3();
    if (id === 'sun') return off.clone();
    var p = bodyIndex[id];
    if (p) return p.scenePos.clone().add(off);
    for (var i = 0; i < planets.length; i++) {
      for (var j = 0; j < planets[i].moons.length; j++) {
        var m = planets[i].moons[j];
        if (m.data.id === id) return m.mesh.getWorldPosition(new THREE.Vector3());
      }
    }
    if (cometObj && id === 'halley') return cometObj.pos.clone().add(off);
    return null;
  }

  function getSystemRoot() { return systemRoot; }

  /* 太阳系基准查询：太阳系整体（systemRoot）随银河系公转而平移，
     其世界坐标会随时间变化，且默认已偏离原点（2026 年实测约 [4199, -60, 34]）。
     注意：这里返回的 position 是世界坐标，不等于「以太阳为原点的坐标」；
     任何绝对定位都必须先减去这个 position，或改用相对太阳系的局部坐标。 */
  function getSolarBasis() {
    if (!systemRoot) return null;
    return {
      position: systemRoot.getWorldPosition(new THREE.Vector3()),  // 世界位置（含父级变换）
      visible: systemRoot.visible
    };
  }

  /* 教学模式专用：隐藏真实比例的太阳系、改显示教学装置时调用。
     只管 systemRoot 这一棵子树；星空 / 小行星带 / 标签不在此列
     （它们由 setStarfieldVisible / setBeltsVisible / setLabelsVisible 各自负责）。 */
  function setSolarSystemVisible(on) {
    if (systemRoot) systemRoot.visible = !!on;
    return !!(systemRoot && systemRoot.visible);
  }

  function isSolarSystemVisible() {
    return !!(systemRoot && systemRoot.visible);
  }

  function radiusOf(id) {
    if (id === 'sun') return SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor;
    /* 哈雷彗核不在 planets 里；返回「观赏半径」（显示半径 ×2），
       让点击彗星时的取景距离能同时容纳彗核、彗发与彗尾起点，
       否则会落到 0.35 的默认值，相机怼到彗核上什么结构都看不见。 */
    if (id === 'halley' && cometObj) return cometObj.mesh.scale.x * 2;
    var p = bodyIndex[id];
    if (p) return p.radius;
    for (var i = 0; i < planets.length; i++) {
      for (var j = 0; j < planets[i].moons.length; j++) {
        if (planets[i].moons[j].data.id === id) return planets[i].moons[j].radius;
      }
    }
    return 0.35;
  }

  function distanceAuOf(id) {
    var p = bodyIndex[id];
    return p ? p.rAu : 0;
  }

  /* 固定随机种子入口：控制台或 URL `#seed=...` 换一批主星场与两条粒子带。 */
  function setProceduralSeed(seed) {
    proceduralSeed = normalizeSeed(seed);
    if (C.procedural) C.procedural.seed = proceduralSeed;
    if (scene) {
      buildStarfield();
      buildBelts();
      registerBloomLayer();
    }
    return proceduralSeed;
  }

  function getProceduralSeed() { return proceduralSeed; }

  return {
    init: init, update: update, resize: resize, setAlign: setAlign, isAligned: isAligned,
    setQuality: setQuality, get: get, getPlanets: getPlanets, getPickables: getPickables,
    getSunMesh: getSunMesh, getTriangleCount: getTriangleCount, getQuality: getQuality,
    getCamera: function () { return camera; },
    setSunView: setSunView, getSunView: getSunView,
    getEffectivePixelRatio: function () { return effectivePixelRatio; },
    getSunScreenFraction: getSunScreenFraction,
    setOrbitsVisible: setOrbitsVisible, setTrailsVisible: setTrailsVisible,
    setStarfieldVisible: setStarfieldVisible, setBeltsVisible: setBeltsVisible,
    setLabelsVisible: setLabelsVisible, refreshLabels: refreshLabels,
    worldPositionOf: worldPositionOf, radiusOf: radiusOf, distanceAuOf: distanceAuOf,
    getSolarBasis: getSolarBasis, setSolarSystemVisible: setSolarSystemVisible,
    isSolarSystemVisible: isSolarSystemVisible,
    /* 供 SOLAR.Effects 渲染分层 bloom：临时换材质 + 取相机 layers 掩码 */
    beginBloomLayer: beginBloomLayer, endBloomLayer: endBloomLayer,
    getBloomLayerMask: function () { return BLOOM_LAYER_MASK; },
    /* 显示比例：压缩示意 / 弱压缩示意（映射参数见 config.profiles）
       与教学装置的「真实比例 / 示意比例」是两套独立语义，互不影响。 */
    setScaleMode: setScaleMode, getScaleMode: function () { return scaleMode; },
    getScaleCompress: getScaleCompress,
    refreshOrbitLines: function () { return refreshOrbitLines(currentOrbitEpoch(), true); },
    getSystemRoot: getSystemRoot,
    setProceduralSeed: setProceduralSeed, getProceduralSeed: getProceduralSeed
  };
})();
