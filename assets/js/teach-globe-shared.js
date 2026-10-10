/**
 * 教学装置：地球仪（globe）—— 共享注册表
 * 用途：teach-globe 拆成 shared / shaders / body / scenes / apply / 门面 六个模块后，
 *       跨模块共享的状态集中在此登记：nodes（场景对象引用）、tmp（逐帧复用的临时对象）、
 *       以及 built / cur / anim 等标量。resource 登记口 track 与回收口 disposeAll 也在此。
 *       本模块必须第一个加载（teach-data 之后、其余 teach-globe-* 之前）。
 *
 * 坐标约定（务必看懂再改，与其余 teach-globe-* 模块同一套）：
 *   - 场景里 Y 轴向上，**黄道面 = XZ 平面（水平）**，太阳全年在这个平面内绕行；
 *   - 地轴（指向北极）相对黄道面倾斜 tiltDeg（教材口径 66.5°），由 tiltGroup 的 X 轴旋转实现；
 *   - 太阳方向 sunDir = (cos λ, 0, sin λ)，λ 为太阳黄经（春分=0，夏至=90°，秋分=180°，冬至=270°）；
 *   - 由此推出太阳赤纬（= 直射点纬度）δ = asin(sin ε · sin λ)，其中黄赤交角 ε = 90° − tiltDeg。
 *
 * 依赖：无（只登记状态，不持有 THREE 对象）。零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachGlobeShared = (function () {
  'use strict';

  var DEG = Math.PI / 180;
  var EARTH_R = 1;            // 基准显示半径（real 档），iconic 档会放大
  var NIGHT_FACTOR = 0.82;    // 夜半球压暗程度

  /* 共享注册表：
     nodes 放场景对象引用（初始 null，由各 builder 填充）；
     tmp   放逐帧复用的临时对象（沿用原"懒创建"写法：先置 null，用时再 new，
          匹配项目整体"逐帧零 new"的约束）。 */
  var S = {
    nodes: {
      scene: null, root: null,
      tiltGroup: null, spinGroup: null, extraGroup: null,
      gridGroup: null, hlGroup: null, axisGroup: null,
      pointGroup: null, cityGroup: null, polarGroup: null,
      eratoGroup: null, radialGroup: null,
      voyageGroup: null, horizonGroup: null, eclipseGroup: null,
      satGroup: null, sizeGroup: null,
      degreeGroup: null, degreeLatGroup: null, degreeLonGroup: null,
      earthMesh: null, earthUniforms: null, cloudMesh: null, cloudTexture: null,
      sampleTexture: null,
      sunPointNode: null, polarDayNode: null, polarNightNode: null,
      shipLight: null, eclipseShadowMaterial: null,
      hlNodes: {},            // 重要经纬线（加粗）key -> Object3D
      cityNodes: {},          // id -> { group, label }
      satNodes: [],
      gridLines: [],          // 普通经纬网（细线）
      gridStep: 15
    },
    tmp: {
      UP_Y: null, tiltInverse: null, tmpEuler: null,
      ERATO_UP: null, eratoQuat: null, eratoMat: null,
      eratoMid: null, eratoDir: null,
      eratoX: null, eratoY: null, eratoZ: null,
      voyFwd: null, voyUp: null, voyRight: null, voyZ: null, voyMat: null, voyPan: null,
      eclipseTmpA: null, eclipseTmpT: null, eclipseTmpE: null
    },
    built: false,
    cur: {},                // 上一次生效的 params（缺省字段沿用）
    curScale: 'real',
    anim: { spin: false, revolve: false, playing: false, speed: 1 },
    voyageProgress: 0,
    horizonShipPhase: 0,    // 远去船只的球面相位（0→1 循环）
    eclipseTime: 0,
    satSpin: 0,
    DEG: DEG,
    EARTH_R: EARTH_R,
    NIGHT_FACTOR: NIGHT_FACTOR
  };

  /* ============ 资源登记与回收 ============ */

  var disposeList = [];

  /* track 是地球仪装置唯一的构造登记入口（约 85 处构造点）：
     所有 THREE 几何体 / 材质 / 贴图都过它，否则 dispose 时会漏掉一批 GPU 资源。 */
  function track(obj) { disposeList.push(obj); return obj; }

  function isBuilt() { return S.built; }

  /* disposeAll 照搬原 dispose 的函数体：注意 built 的复位在这里做，
     否则二次 init 会被"已构建"短路。 */
  function disposeAll() {
    if (S.nodes.root && S.nodes.root.parent) S.nodes.root.parent.remove(S.nodes.root);
    for (var i = 0; i < disposeList.length; i++) {
      var o = disposeList[i];
      try { if (o && typeof o.dispose === 'function') o.dispose(); } catch (e) { /* 忽略 */ }
    }
    disposeList.length = 0;
    S.built = false;
  }

  return {
    S: S,
    track: track,
    disposeAll: disposeAll,
    isBuilt: isBuilt
  };
})();
