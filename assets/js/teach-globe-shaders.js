/**
 * 教学装置：地球仪（globe）—— 场景层 GLSL 源码
 * 用途：从 teach-globe.js 拆出的着色器字符串集中地，只放源码、不放构造逻辑。
 *       GLOBE_VERT/GLOBE_FRAG 地表与云层共用；CLOUD_FRAG 云层遮罩；
 *       ECLIPSE_VERT/ECLIPSE_FRAG 原先是 buildEclipse 里的 inline 字符串，
 *       拆模块时提升为命名变量（字符串内容一字未改）。
 *
 * 坐标约定：与 teach-globe-shared.js 同一套（Y 轴向上、黄道面 = XZ 平面、
 *       sunDir = (cos λ, 0, sin λ)）。shader 里一律用世界空间法线与太阳方向求点积，
 *       不依赖挂点层级。
 *
 * 依赖：无（纯字符串表）。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.GlobeShaders = (function () {
  'use strict';

  /* ============ 着色器 ============ */

  var GLOBE_VERT = [
    'varying vec3 vN; varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  /* uSunDir：世界空间的太阳方向；夜半球压暗而非涂黑，保留海陆轮廓便于讲解 */
  var GLOBE_FRAG = [
    'uniform sampler2D uMap;',
    'uniform vec3 uSunDir;',
    'uniform float uNight;',
    'uniform float uTermSoft;',
    'varying vec3 vN; varying vec2 vUv;',
    'void main(){',
    '  vec3 col = texture2D(uMap, vUv).rgb;',
    '  float d = dot(normalize(vN), normalize(uSunDir));',
    '  float lit = smoothstep(-uTermSoft, uTermSoft, d);',
    '  float shade = mix(1.0 - uNight, 1.0, lit);',
    '  gl_FragColor = vec4(col * shade, 1.0);',
    '}'
  ].join('\n');

  /* 以下两个是地球仪最早版本留下的通用模板，当前没有任何构造点引用；
     拆分时照搬保留（删除属于行为变更，不发生在纯搬运中）。 */
  var BASIC_VERT = [
    'void main(){',
    '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var BASIC_FRAG = [
    'uniform vec3 uColor; uniform float uOpacity;',
    'void main(){ gl_FragColor = vec4(uColor, uOpacity); }'
  ].join('\n');

  /* 云层专用着色：与地表共用太阳方向（uniform 直接共享，昼夜自动同步），
     夜面不发光；遮罩算法与主场景一致（alpha × 红通道）。 */
  var CLOUD_FRAG = [
    'uniform sampler2D uMap;',
    'uniform vec3 uSunDir;',
    'varying vec2 vUv; varying vec3 vN;',
    'void main(){',
    '  vec4 c = texture2D(uMap, vUv);',
    '  float a = c.a * c.r;',
    '  float d = dot(normalize(vN), normalize(uSunDir));',
    '  float lit = smoothstep(-0.06, 0.14, d);',
    '  float shade = mix(0.10, 1.0, lit);',
    '  a *= shade * 0.92;',
    '  if (a <= 0.004) discard;',
    '  gl_FragColor = vec4(vec3(shade), a);',
    '}'
  ].join('\n');

  /* 月食地影：本影 / 半影的圆柱距离场 + 半球因子。
     由 teach-globe-scenes.js 的 buildEclipse 以 SH.ECLIPSE_VERT / SH.ECLIPSE_FRAG 引用。 */
  var ECLIPSE_VERT = 'varying vec3 vWorldN; void main(){ vWorldN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

  var ECLIPSE_FRAG = 'varying vec3 vWorldN; uniform vec3 uAxis; uniform vec3 uTangent; uniform float uCenter; uniform float uMoonR; void main(){ float hemi = smoothstep(-0.06, 0.26, dot(vWorldN, -uAxis)); vec3 p = vWorldN * uMoonR + uTangent * uCenter; float d = length(p - uAxis * dot(p, uAxis)) / uMoonR; float pen = 1.0 - smoothstep(1.10, 1.35, d); float umb = 1.0 - smoothstep(0.92, 1.02, d); if (pen * hemi < 0.01) discard; vec3 color = mix(vec3(0.22, 0.10, 0.08), vec3(0.045, 0.012, 0.008), umb); float alpha = mix(0.45, 0.94, umb) * pen * hemi; gl_FragColor = vec4(color, alpha); }';

  return {
    GLOBE_VERT: GLOBE_VERT,
    GLOBE_FRAG: GLOBE_FRAG,
    BASIC_VERT: BASIC_VERT,
    BASIC_FRAG: BASIC_FRAG,
    CLOUD_FRAG: CLOUD_FRAG,
    ECLIPSE_VERT: ECLIPSE_VERT,
    ECLIPSE_FRAG: ECLIPSE_FRAG
  };
})();
