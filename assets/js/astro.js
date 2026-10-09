/**
 * 天文计算：行星优先使用 VSOP87 要素，其他天体使用 JPL 近似根数
 * 输出：日心黄道直角坐标（AU），再映射为 Three.js 场景坐标（Y 轴向上）
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Astro = (function () {
  var DEG = Math.PI / 180;
  var TWO_PI = Math.PI * 2;
  var planetOrbits = null;

  function vsopId(orb) {
    if (!orb || !SOLAR.DATA || !SOLAR.DATA.bodies) return null;
    if (!planetOrbits) {
      planetOrbits = [];
      for (var n = 0; n < SOLAR.DATA.bodies.length; n++) {
        var body = SOLAR.DATA.bodies[n];
        if (body.type === 'planet') planetOrbits.push(body);
      }
    }
    for (var i = 0; i < planetOrbits.length; i++) {
      if (planetOrbits[i].orbital === orb) return planetOrbits[i].id;
    }
    return null;
  }

  function vsopElements(orb, jd) {
    var id = vsopId(orb);
    if (!id || !SOLAR.VSOP87 || typeof SOLAR.VSOP87.elements !== 'function') return null;
    /* 界面日期来自 UTC；这里近似 TT，跨历史日期不引入未校准的 ΔT。 */
    var values = SOLAR.VSOP87.elements(id, (jd - SOLAR.CONFIG.time.j2000) / 365250);
    if (!values || !(values[0] > 0) || !isFinite(values[0] + values[1] + values[2] + values[3] + values[4] + values[5])) return null;
    var peri = Math.atan2(values[3], values[2]);
    var node = Math.atan2(values[5], values[4]);
    return {
      a: values[0], L: values[1] / DEG, e: Math.sqrt(values[2] * values[2] + values[3] * values[3]),
      i: 2 * Math.asin(Math.min(1, Math.sqrt(values[4] * values[4] + values[5] * values[5]))) / DEG,
      peri: peri / DEG, node: node / DEG, useAdditionalTerms: false
    };
  }

  function planetElements(orb, jd) {
    return vsopElements(orb, jd) || elementsAt(orb, (jd - SOLAR.CONFIG.time.j2000) / 36525);
  }

  function orbitSource(orb) {
    var id = vsopId(orb);
    return id && SOLAR.VSOP87 && typeof SOLAR.VSOP87.elements === 'function' ?
      (id === 'earth' ? 'vsopEmb' : 'vsop') : 'jpl';
  }

  /* 日期 -> 儒略日 */
  function toJulian(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }

  /* 儒略日 -> Date */
  function fromJulian(jd) {
    return new Date((jd - 2440587.5) * 86400000);
  }

  /* 归一化到 [0, 360) */
  function norm360(d) {
    var v = d % 360;
    return v < 0 ? v + 360 : v;
  }

  /* 归一化弧度到 [-π, π)，同时保留原输入的整周数。 */
  function normalizeRadians(radians) {
    var turns = Math.floor((radians + Math.PI) / TWO_PI);
    return { angle: radians - turns * TWO_PI, turns: turns };
  }

  /**
   * 开普勒方程求解：M = E - e·sin(E)。
   * 高偏心率时采用受区间约束的牛顿迭代；若牛顿步越界则自动二分，
   * 对哈雷彗星 e≈0.967 仍能稳定收敛，并保留 M 中的整周数。
   */
  function solveKepler(M, e) {
    if (!isFinite(M)) return 0;
    e = isFinite(e) ? Math.max(0, Math.min(0.999999999, e)) : 0;

    var normalized = normalizeRadians(M);
    var m = normalized.angle;
    var lo = -Math.PI;
    var hi = Math.PI;
    var E;

    if (e < 0.8) E = m;
    else if (Math.abs(m) < 1e-14) E = 0;
    else E = m < 0 ? -Math.PI : Math.PI;

    for (var i = 0; i < 32; i++) {
      var f = E - e * Math.sin(E) - m;
      if (Math.abs(f) < 1e-14) break;
      if (f > 0) hi = E;
      else lo = E;

      var fp = 1 - e * Math.cos(E);
      var next = E - f / fp;
      if (!isFinite(next) || next <= lo || next >= hi) next = (lo + hi) * 0.5;

      if (Math.abs(next - E) < 1e-13) {
        E = next;
        break;
      }
      E = next;
    }

    return E + normalized.turns * TWO_PI;
  }

  function numberOr(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  /**
   * 选择 JPL 根数模型：
   * - 1800–2050 使用误差更小的短期表（orb 顶层）；
   * - 其余长期表有效区间使用与 b/c/s/f 配套的 longTerm 表；
   * - 超出长期表范围退化为顶层线性平均根数，避免外推周期项。
   * JPL 明确要求 b/c/s/f 只能与长期表配套，不能直接叠加到短期表。
   */
  function sourceAt(orb, T) {
    var cfg = SOLAR.CONFIG && SOLAR.CONFIG.astro ? SOLAR.CONFIG.astro : {};
    var shortMin = numberOr(cfg.EPHEMERIS_SHORT_MIN_T, -2.0);
    var shortMax = numberOr(cfg.EPHEMERIS_SHORT_MAX_T, 0.5);
    var longTerm = orb && orb.longTerm;

    if (longTerm && (!orb.additionalTermsFor || orb.additionalTermsFor === 'longTerm') &&
        (T < shortMin || T > shortMax)) {
      var longMin = numberOr(longTerm.validTMin, -50.0);
      var longMax = numberOr(longTerm.validTMax, 10.0);
      if (T >= longMin && T <= longMax) return longTerm;
    }
    return orb;
  }

  /** T 为自 J2000 起的儒略世纪数。 */
  function elementsAt(orb, T) {
    orb = orb || {};
    T = isFinite(T) ? T : 0;
    var source = sourceAt(orb, T) || orb;
    var a = numberOr(source.a, numberOr(orb.a, 1)) + numberOr(source.aRate, 0) * T;
    var e = numberOr(source.e, numberOr(orb.e, 0)) + numberOr(source.eRate, 0) * T;

    /* 极端日期下线性外推可能失真；钳制只为保证椭圆求解不产生 NaN。 */
    if (!(a > 0) || !isFinite(a)) a = Math.max(Math.abs(numberOr(orb.a, 1)), 1e-9);
    e = Math.max(0, Math.min(0.999999999, e));

    return {
      a: a,
      e: e,
      i: numberOr(source.i, numberOr(orb.i, 0)) + numberOr(source.iRate, 0) * T,
      L: numberOr(source.L, numberOr(orb.L, 0)) + numberOr(source.LRate, 0) * T,
      peri: numberOr(source.peri, numberOr(orb.peri, 0)) + numberOr(source.periRate, 0) * T,
      node: numberOr(source.node, numberOr(orb.node, 0)) + numberOr(source.nodeRate, 0) * T,
      b: numberOr(orb.b, numberOr(source.b, 0)),
      c: numberOr(orb.c, numberOr(source.c, 0)),
      s: numberOr(orb.s, numberOr(source.s, 0)),
      f: numberOr(orb.f, numberOr(source.f, 0)),
      useAdditionalTerms: source !== orb && (longTermTermsPresent(orb) || longTermTermsPresent(source))
    };
  }

  function longTermTermsPresent(source) {
    return source && (typeof source.b === 'number' || typeof source.c === 'number' ||
      typeof source.s === 'number' || typeof source.f === 'number');
  }

  /* JPL 长期表的外行星平近点角附加项，所有角度均为度。 */
  function meanAnomaly(el, T) {
    var degrees = el.L - el.peri;
    if (el.useAdditionalTerms) {
      var phase = el.f * T * DEG;
      degrees += el.b * T * T + el.c * Math.cos(phase) + el.s * Math.sin(phase);
    }
    return norm360(degrees) * DEG;
  }

  function positionFromE(el, E) {
    var root = Math.sqrt(Math.max(0, 1 - el.e * el.e));
    var xv = el.a * (Math.cos(E) - el.e);
    var yv = el.a * root * Math.sin(E);

    var w = (el.peri - el.node) * DEG;
    var O = el.node * DEG;
    var I = el.i * DEG;
    var cw = Math.cos(w), sw = Math.sin(w);
    var cO = Math.cos(O), sO = Math.sin(O);
    var cI = Math.cos(I), sI = Math.sin(I);

    var x = (cw * cO - sw * sO * cI) * xv + (-sw * cO - cw * sO * cI) * yv;
    var y = (cw * sO + sw * cO * cI) * xv + (-sw * sO + cw * cO * cI) * yv;
    var z = (sw * sI) * xv + (cw * sI) * yv;
    return { x: x, y: y, z: z, r: Math.sqrt(x * x + y * y + z * z) };
  }

  /**
   * 日心黄道直角坐标（AU），X 轴指向春分点。
   * @returns {{x:number,y:number,z:number,r:number}}
   */
  function heliocentric(orb, jd) {
    jd = isFinite(jd) ? jd : SOLAR.CONFIG.time.j2000;
    var T = (jd - SOLAR.CONFIG.time.j2000) / 36525;
    var el = planetElements(orb, jd);
    var M = meanAnomaly(el, T);
    return positionFromE(el, solveKepler(M, el.e));
  }

  /* 便捷日期接口；也接受已经换算好的儒略日数值。 */
  function heliocentricAt(orb, date) {
    var jd;
    if (typeof date === 'number') jd = date;
    else if (date && typeof date.getTime === 'function') jd = toJulian(date);
    else jd = toJulian(new Date(date));
    return heliocentric(orb, jd);
  }

  /* 官方 ±2000 年 1″ 口径属于原始级数，截断版仅用该跨度作超范围提示。 */
  function ephemerisStatus(jd) {
    jd = isFinite(jd) ? jd : SOLAR.CONFIG.time.j2000;
    var cfg = SOLAR.CONFIG && SOLAR.CONFIG.astro ? SOLAR.CONFIG.astro : {};
    var T = (jd - SOLAR.CONFIG.time.j2000) / 36525;
    var shortMin = numberOr(cfg.EPHEMERIS_SHORT_MIN_T, -2.0);
    var shortMax = numberOr(cfg.EPHEMERIS_SHORT_MAX_T, 0.5);
    var longMin = numberOr(cfg.EPHEMERIS_LONG_MIN_T, -50.0);
    var longMax = numberOr(cfg.EPHEMERIS_LONG_MAX_T, 10.0);
    if (SOLAR.VSOP87 && typeof SOLAR.VSOP87.elements === 'function') {
      return { level: Math.abs(T) <= 20 ? 'vsop' : 'vsopOutside', centuries: T };
    }
    var level = (T >= shortMin && T <= shortMax) ? 'short' :
      ((T >= longMin && T <= longMax) ? 'long' : 'extrapolated');
    return { level: level, centuries: T, shortMin: shortMin, shortMax: shortMax, longMin: longMin, longMax: longMax };
  }

  /**
   * 日心黄道坐标 -> 场景坐标（Y 轴向上，黄道面 = XZ 平面）
   * 距离按幂律压缩：方向保持真实，半径做观感压缩。
   */
  function toScene(pos) {
    var rAu = numberOr(pos && pos.r, 0);
    var s = SOLAR.auToScene(rAu) / (rAu || 1e-9);
    return { x: pos.x * s, y: pos.z * s, z: -pos.y * s, rAu: rAu };
  }

  /**
   * 生成完整椭圆轨道。高偏心率轨道自动增加采样数；均匀偏近点角采样
   * 本身也会在几何曲率最大的近日点附近形成更密的空间点。
   */
  function orbitPath(orb, jd, segments) {
    jd = isFinite(jd) ? jd : SOLAR.CONFIG.time.j2000;
    var el = planetElements(orb, jd);
    var pts = [];
    var base = Math.max(32, Math.floor(numberOr(segments, SOLAR.CONFIG.scale.orbitSegments)));
    var factor = 1 + Math.min(6, 6 * el.e * el.e);
    var n = Math.min(8192, Math.ceil(base * factor));

    for (var k = 0; k <= n; k++) {
      var E = (k / n) * TWO_PI;
      var pos = positionFromE(el, E);
      var scenePos = toScene(pos);
      pts.push({ x: scenePos.x, y: scenePos.y, z: scenePos.z });
    }
    return pts;
  }

  /* 真近点角（用于自转/相位显示）。 */
  function trueAnomaly(orb, jd) {
    jd = isFinite(jd) ? jd : SOLAR.CONFIG.time.j2000;
    var T = (jd - SOLAR.CONFIG.time.j2000) / 36525;
    var el = planetElements(orb, jd);
    var E = solveKepler(meanAnomaly(el, T), el.e);
    return Math.atan2(Math.sqrt(Math.max(0, 1 - el.e * el.e)) * Math.sin(E), Math.cos(E) - el.e);
  }

  return {
    toJulian: toJulian,
    fromJulian: fromJulian,
    solveKepler: solveKepler,
    heliocentric: heliocentric,
    heliocentricAt: heliocentricAt,
    ephemerisStatus: ephemerisStatus,
    orbitSource: orbitSource,
    planetElements: planetElements,
    orbitPath: orbitPath,
    toScene: toScene,
    trueAnomaly: trueAnomaly,
    norm360: norm360
  };
})();
