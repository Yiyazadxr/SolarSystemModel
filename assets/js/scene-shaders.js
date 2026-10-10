/**
 * 场景层 GLSL 源码：太阳 / 日冕 / 行星 / 卫星 / 大气 / 环 / 星空 / 辉带 / 拖尾 / 彗尾
 * 依赖：无业务依赖（纯字符串常量）；由 scene-sun / scene-bodies / scene-backdrop / scene 引用
 *
 * 为什么单独拆出来：这些源码只做「字符串拼装」、不含任何逻辑，与构建代码分开后，
 * 调色 / 光照 / 密度类改动不必在几千行实现里翻找。
 * GLSL_NOISE 是公共噪声段，被 SUN_FRAG / CORONA_FRAG / PLANET_FRAG 以字符串插值复用，
 * 保持单一出处，避免同一段 GLSL 在三个文件里各自漂移。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Shaders = (function () {
  'use strict';

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
    'uniform float uTime; uniform float uGasT; uniform float uIntensity; uniform float uSpot; uniform float uDetail;',
    'uniform vec3 uColorA; uniform vec3 uColorB;',
    'varying vec3 vLP; varying vec3 vN; varying vec3 vWP;',
    GLSL_NOISE,
    'void main(){',
    '  vec3 p = vLP;',
    '  float lat = asin(clamp(p.y, -1.0, 1.0));',
    /* 表面图案（含米粒与黑子）固定在光球局部坐标上，随 sunMesh 的几何
       自转整体转动；流动感只来自米粒组织与黑子群的相位演化（uGasT），
       不另做图案旋转——否则米粒会相对几何黑子漂移。 */
    '  vec3 q = p;',
    '  float n1 = fbm3(q * 3.1 + vec3(0.0, uGasT * 0.015, 0.0));',
    '  float n2 = fbm3(q * 9.4 + vec3(uGasT * 0.03, 0.0, 0.0));',
    '  float gran = fbm3(q * 26.0 + vec3(0.0, uGasT * 0.10, 0.0)) - 0.45;',
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
    '  float hn = clamp((fbm3(q * 12.0 + vec3(0.0, uGasT * 0.006, 0.0)) - 0.34) / 0.32, 0.0, 1.0);',
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
    'uniform float uGasT; uniform float uGasSpin; uniform float uGasDiff; uniform float uGasJet; uniform float uGasBands; uniform float uGasHaze; uniform vec3 uGasColor;',
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
    '  float lat = clamp(vLP.y, -1.0, 1.0);',
    '  vec3 base = (uHasMap > 0.5) ? texture2D(uMap, vUv).rgb : uBase;',
    /* 气态动效：底图不动，在其上叠一层沿急流方向流动的程序化云霾。
       云丝用环向坐标 (cos / sin lon) 采样 fbm，经度方向天然无接缝；
       相位取 uGasT，开关关闭时相位冻结、云停在当前位置。 */
    '  if (uGasHaze > 0.001) {',
    '    float latR = asin(lat);',
    '    float flow = uGasSpin + uGasDiff * (cos(latR) * cos(latR) - 0.5) + uGasJet * sin(latR * uGasBands);',
    '    float lonPh = atan(vLP.z, vLP.x) + uGasT * flow * 6.2831853;',
    '    float wisp = fbm3(vec3(cos(lonPh) * 1.4, vLP.y * 6.5, sin(lonPh) * 1.4) + vec3(0.0, uGasT * 0.03, 0.0)) - 0.5;',
    '    float haze = smoothstep(0.04, 0.46, wisp) * uGasHaze;',
    '    base = mix(base, uGasColor, haze);',
    '  }',
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
    /* 基础光照下限取 0.55：侧向环（天王星轴 97.8°，环面几乎垂直于阳光）
       的 graze 趋近 0，物理上受光极少，但那样环只剩下「不透明却全黑」——
       在黑背景上完全不可见，只有横跨亮盘面的部分看得出，观感像涂在表面。
       提高下限与背光面下限，让环在任何几何下都有可读亮度（NASA 发布的
       天王星环影像同样是增强处理的）。 */
    '  float light = 0.72 + 0.28 * pow(graze, 0.72);',
    /* 看到的是受光面还是背光面 */
    '  float facing = dot(nrm, V) * dot(nrm, L);',
    '  light *= mix(0.78, 1.0, smoothstep(-0.35, 0.35, facing));',
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

  /* --- 小行星带 / 柯伊伯带辉带 ---
      点云在正俯视与远观时彼此分离、每点被 clamp 到 1px，亮度不足；侧视时粒子沿视线
      重叠积分，反而亮。辉带用与粒子相同的密度曲线（高斯主体 + Kirkwood 空隙）补上这段
      积分亮度，并按摄像机仰角淡入淡出：侧视让位点云，也避免贴近盘面时糊屏。
      密度之上叠无接缝团块（细尘埃 + 大尺度「族」状浓淡），弱压缩档放大后仍有质感。 */
  var BAND_VERT = [
    'varying vec2 vP;',
    'void main(){',
    /* 插值位置而非半径：position 是仿射量，在片元里反算才准；
       角度若在顶点插值，跨 ±π 的三角形会烧出接缝 */
    '  vP = position.xz;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var BAND_FRAG = [
    'uniform float uOpacity; uniform float uFade; uniform float uSeed;',
    'uniform float uDistBase; uniform float uDistExp;',
    'uniform float uInnerAu; uniform float uOuterAu;',
    'uniform float uKind;',
    'uniform vec3 uColor;',
    'varying vec2 vP;',
    'float gapAt(float au, float c, float w){',
    '  float t = (au - c) / w;',
    '  return 1.0 - 0.92 * exp(-t * t);',
    '}',
    /* 周期哈希噪声：角度坐标乘整数频率后对 2π 取模，环带无接缝 */
    'float hashA(float i, float j){ return fract(sin(i * 127.1 + j * 311.7) * 43758.5453123); }',
    'float noiseRing(float ang, float rad, float fa, float fr){',
    '  float pa = floor(6.2831853 * fa + 0.5);',
    '  vec2 q = vec2(ang * fa, rad * fr);',
    '  vec2 i = floor(q);',
    '  vec2 f = q - i;',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float i0 = mod(i.x, pa);',
    '  float i1 = mod(i.x + 1.0, pa);',
    '  float a = hashA(i0, i.y);',
    '  float b = hashA(i1, i.y);',
    '  float c = hashA(i0, i.y + 1.0);',
    '  float d = hashA(i1, i.y + 1.0);',
    '  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);',
    '}',
    'void main(){',
    '  float r = length(vP);',
    '  float ang = atan(vP.y, vP.x) + uSeed;',
    '  float au = pow(max(r / uDistBase, 1e-6), 1.0 / uDistExp);',
    '  float d;',
    '  if (uKind > 0.5) {',
    '    float t1 = (au - 2.72) / 0.62;',
    '    d = exp(-t1 * t1) * 0.55 + 0.45;',
    '    d *= gapAt(au, 2.06, 0.035);',
    '    d *= gapAt(au, 2.50, 0.055);',
    '    d *= gapAt(au, 2.82, 0.045);',
    '    d *= gapAt(au, 3.27, 0.050);',
    '  } else {',
    '    float t2 = (au - 44.5) / 9.5;',
    '    d = 0.35 + 0.65 * exp(-t2 * t2);',
    '    float t3 = (au - 39.4) / 1.1;',
    '    d *= 1.0 - 0.42 * exp(-t3 * t3);',
    '  }',
    /* 柯伊伯带密度函数外缘不收窄（0.35 + 0.65×高斯），需显式柔化；
       否则辉带会是硬边的「甜甜圈」 */
    '  float span = uOuterAu - uInnerAu;',
    '  float edge = smoothstep(uInnerAu, uInnerAu + 0.10 * span, au)',
    '             * (1.0 - smoothstep(uOuterAu - 0.10 * span, uOuterAu, au));',
    '  float n1 = noiseRing(ang, au, 24.0, 16.0);',
    '  float n2 = noiseRing(ang, au, 61.0, 44.0);',
    '  float n3 = noiseRing(ang, au, 7.0, 5.0);',
    '  float clump = 0.30 + 0.60 * n1 + 0.40 * n2 + 0.55 * n3;',
    '  float a = d * edge * clump * uOpacity * uFade;',
    '  if (a < 0.004) discard;',
    '  gl_FragColor = vec4(uColor * a, a);',
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

  return {
    GLSL_NOISE: GLSL_NOISE,
    SUN_VERT: SUN_VERT, SUN_FRAG: SUN_FRAG,
    CORONA_FRAG: CORONA_FRAG,
    NIGHT_VERT: NIGHT_VERT, NIGHT_FRAG: NIGHT_FRAG,
    PLANET_VERT: PLANET_VERT, PLANET_FRAG: PLANET_FRAG,
    RING_VERT: RING_VERT, RING_FRAG: RING_FRAG,
    ATMO_VERT: ATMO_VERT, ATMO_FRAG: ATMO_FRAG,
    STAR_VERT: STAR_VERT, STAR_FRAG: STAR_FRAG,
    SPIKE_FRAG: SPIKE_FRAG,
    BELT_VERT: BELT_VERT, BELT_FRAG: BELT_FRAG,
    BAND_VERT: BAND_VERT, BAND_FRAG: BAND_FRAG,
    TRAIL_VERT: TRAIL_VERT, TRAIL_FRAG: TRAIL_FRAG,
    TAIL_VERT: TAIL_VERT, TAIL_FRAG: TAIL_FRAG
  };
})();
