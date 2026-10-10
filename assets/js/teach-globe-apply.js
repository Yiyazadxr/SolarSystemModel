/**
 * 教学装置：地球仪（globe）—— 参数应用（场景套用）
 * 用途：teach-globe 拆分后的"套用"层。sunState 由教学参数推导太阳方向与太阳赤纬；
 *       apply 是编排入口，把 teach-data 的 step.params 一次性套到地球仪各图层上
 *       （真实 / 示意双档、取景、显隐、网格密度切换、极昼极夜球冠张角等）；
 *       setCapAngle 通过重建 thetaLength 让极昼极夜球冠随 δ 变化。
 *
 * 坐标约定：与 teach-globe-shared.js 同一套（Y 轴向上、黄道面 = XZ 平面、
 *       sunDir = (cos λ, 0, sin λ)、tiltGroup 绕 X 轴转 ε = 90 − tiltDeg）。
 *
 * 依赖：THREE、SOLAR.TeachGlobeShared（共享注册表，别名 G）、
 *       SOLAR.GlobeBody.buildGrid（网格密度切换时按需重建，运行时限定名调用）。
 *       零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.GlobeApply = (function () {
  'use strict';

  var G = SOLAR.TeachGlobeShared.S;

  /* 常量随共享注册表走：本模块内引用只读，不在函数体里改（改请改 shared）。 */
  var DEG = G.DEG;
  var EARTH_R = G.EARTH_R;
  var NIGHT_FACTOR = G.NIGHT_FACTOR;

  /* ============ 参数应用 ============ */

  /* 由参数推导太阳方向（世界空间，单位向量）与太阳赤纬 δ */
  function sunState(params) {
    var lambda = (params.sunLonDeg || 0) * DEG;
    var dir = new THREE.Vector3(Math.cos(lambda), 0, Math.sin(lambda));
    /* 地轴方向：tiltGroup 把 +Y 转到 (0, sin tilt, cos tilt) */
    var tilt = (params.tiltDeg === undefined ? 66.5 : params.tiltDeg);
    var axis = new THREE.Vector3(0, Math.sin(tilt * DEG), Math.cos(tilt * DEG));
    var sinDelta = dir.dot(axis);          // = sin δ
    if (sinDelta > 1) sinDelta = 1; else if (sinDelta < -1) sinDelta = -1;
    return { dir: dir, delta: Math.asin(sinDelta), axis: axis };
  }

  function apply(params, scale) {
    if (!G.built) return;
    params = params || {};
    var p = {};
    for (var k in G.cur) { if (Object.prototype.hasOwnProperty.call(G.cur, k)) p[k] = G.cur[k]; }
    for (var k2 in params) { if (Object.prototype.hasOwnProperty.call(params, k2)) p[k2] = params[k2]; }
    /* eratosthenes 是一次性示意叠加层，不做跨步骤粘滞：未显式打开即隐藏 */
    p.eratosthenes = !!params.eratosthenes;
    /* highlight / cities 同理不做粘滞：否则上一步的北极圈高亮、城市红点
       会残留在下一步（如「地球的尺寸」里冒出北极圈和亚历山大/塞尼红点）。 */
    p.highlight = params.highlight || [];
    p.cities = params.cities || [];
    /* 场景镜头同样是一次性状态，避免第一步的地面视角把后续地球模型永久隐藏。 */
    p.shapeScene = params.shapeScene || null;
    if (p.shapeScene === 'eclipse' && G.cur.shapeScene !== 'eclipse') {
      G.eclipseTime = 0;
      G.nodes.eclipseShadowMaterial.uniforms.uCenter.value = 1.5;
    }
    p.satelliteMode = params.satelliteMode || null;
    /* voyage / satellites / sizeRings / degreeLabels 同理：按步骤显式开关 */
    p.voyage = !!params.voyage;
    p.satellites = !!params.satellites;
    p.sizeRings = !!params.sizeRings;
    /* degreeLabels: true 两组都显示；'lat' / 'lon' 只显示对应的一组
       （教材图 3.1-9 讲纬线、3.1-10 讲经线，分开看更清楚） */
    p.degreeLabels = params.degreeLabels || false;
    G.cur = p;

    if (p.gridStep !== undefined && Number(p.gridStep) > 0 && Number(p.gridStep) !== G.nodes.gridStep) {
      for (var gi = 0; gi < G.nodes.gridLines.length; gi++) {
        G.nodes.gridGroup.remove(G.nodes.gridLines[gi]);
        if (G.nodes.gridLines[gi].geometry) G.nodes.gridLines[gi].geometry.dispose();
        if (G.nodes.gridLines[gi].material && G.nodes.gridLines[gi].material.dispose) G.nodes.gridLines[gi].material.dispose();
      }
      G.nodes.gridLines.length = 0;
      SOLAR.GlobeBody.buildGrid(Number(p.gridStep));
    }

    /* 显示尺寸：只影响观感，不影响任何物理关系 */
    G.curScale = scale || 'real';
    G.nodes.root.scale.setScalar(G.curScale === 'iconic' ? 1.6 : 1.0);
    /* 第一场景切到地面观察镜头时，隐藏地球仪本体，只保留地平线装置。 */
    if (G.nodes.tiltGroup) G.nodes.tiltGroup.visible = p.shapeScene !== 'horizon' && p.shapeScene !== 'eclipse';

    /* 地轴倾角：tiltGroup 绕 X 轴旋转 ε = 90 − tiltDeg */
    var tilt = (p.tiltDeg === undefined ? 66.5 : p.tiltDeg);
    G.nodes.tiltGroup.rotation.x = (90 - tilt) * DEG;
    G.tmp.tmpEuler.set(-(90 - tilt) * DEG, 0, 0);
    G.tmp.tiltInverse.setFromEuler(G.tmp.tmpEuler);

    /* 自转 */
    G.nodes.spinGroup.rotation.y = (p.spinDeg || 0) * DEG;

    /* 太阳方向 -> 着色 / 晨昏 / 直射点 / 极昼极夜 */
    var st = sunState(p);
    G.nodes.earthUniforms.uSunDir.value.copy(st.dir);
    if (G.nodes.shipLight) G.nodes.shipLight.position.copy(G.nodes.earthUniforms.uSunDir.value).multiplyScalar(200);
    G.nodes.earthUniforms.uNight.value = p.terminator === false ? 0.0 : NIGHT_FACTOR;

    /* 直射点：把世界方向的太阳搬到 tiltGroup 局部坐标，再让整组的 +Y 对准它。
       这样"直射点落在哪条纬线上"完全由 δ = asin(sunDir · 地轴) 决定，物理正确。 */
    if (G.nodes.sunPointNode) {
      G.nodes.sunPointNode.visible = !!p.sunPoint;
      var localDir = st.dir.clone().applyQuaternion(G.tmp.tiltInverse.clone());
      var q = new THREE.Quaternion().setFromUnitVectors(G.tmp.UP_Y, localDir);
      G.nodes.sunPointNode.position.set(0, 0, 0);
      G.nodes.sunPointNode.quaternion.copy(q);
    }

    /* 极昼 / 极夜：纬度高于 90−|δ| 的极区 */
    var absDelta = Math.abs(st.delta);
    var capAngle = Math.PI / 2 - absDelta;          // 极区边界的余纬
    if (G.nodes.polarDayNode && G.nodes.polarNightNode) {
      var show = !!p.polarDayNight && absDelta > 0.001;
      G.nodes.polarDayNode.visible = show;
      G.nodes.polarNightNode.visible = show;
      /* 南北极冠共用同一顶帽子：用 rotation.x 翻转 180° 切到对应半球 */
      G.nodes.polarDayNode.rotation.x = st.delta >= 0 ? 0 : Math.PI;
      G.nodes.polarNightNode.rotation.x = st.delta >= 0 ? Math.PI : 0;
      setCapAngle(G.nodes.polarDayNode, capAngle);
      setCapAngle(G.nodes.polarNightNode, capAngle);
    }

    /* 经纬网 */
    G.nodes.gridGroup.visible = !!p.grid;

    /* 重要经纬线高亮 */
    var list = p.highlight || [];
    for (var key in G.nodes.hlNodes) {
      if (!Object.prototype.hasOwnProperty.call(G.nodes.hlNodes, key)) continue;
      G.nodes.hlNodes[key].visible = list.indexOf(key) >= 0 ||
        (key === 'ew_boundary_a' && list.indexOf('ew_boundary') >= 0) ||
        (key === 'ew_boundary_b' && list.indexOf('ew_boundary') >= 0);
    }

    /* 地轴 */
    G.nodes.axisGroup.visible = !!p.axis;

    /* 城市 */
    var want = p.cities || [];
    for (var id in G.nodes.cityNodes) {
      if (!Object.prototype.hasOwnProperty.call(G.nodes.cityNodes, id)) continue;
      var on = want.indexOf(id) >= 0;
      G.nodes.cityNodes[id].group.visible = on;
      G.nodes.cityNodes[id].label.visible = on && !!p.cityLabels;
    }

    /* 埃拉托色尼示意叠加层：平行太阳光 + 地心延长线 + 7.2° 弧 */
    var eratoOn = !!p.eratosthenes;
    if (G.nodes.eratoGroup) G.nodes.eratoGroup.visible = eratoOn;
    if (G.nodes.radialGroup) G.nodes.radialGroup.visible = eratoOn;

    /* 教学附加图层 */
    if (G.nodes.voyageGroup) G.nodes.voyageGroup.visible = !!p.voyage;
    if (G.nodes.horizonGroup) G.nodes.horizonGroup.visible = p.shapeScene === 'horizon';
    if (G.nodes.eclipseGroup) G.nodes.eclipseGroup.visible = p.shapeScene === 'eclipse';
    if (G.nodes.satGroup) G.nodes.satGroup.visible = !!p.satellites;
    if (G.nodes.satGroup && G.nodes.satGroup.visible) {
      for (var si = 0; si < G.nodes.satNodes.length; si++) {
        G.nodes.satNodes[si].visible = p.satelliteMode !== 'dongfang1' || si === 0;
        G.nodes.satNodes[si].scale.setScalar(p.satelliteMode === 'dongfang1' && si === 0 ? 2.8 : 1.25);
      }
    }
    if (G.nodes.sizeGroup) G.nodes.sizeGroup.visible = !!p.sizeRings;
    if (G.nodes.degreeGroup) {
      var degMode = p.degreeLabels;
      G.nodes.degreeGroup.visible = !!degMode;
      if (G.nodes.degreeLatGroup) G.nodes.degreeLatGroup.visible = (degMode === true || degMode === 'lat');
      if (G.nodes.degreeLonGroup) G.nodes.degreeLonGroup.visible = (degMode === true || degMode === 'lon');
    }
  }

  /* 球冠张角随 δ 变化：重建几何代价大，改用缩放近似会导致变形，
     这里改为直接调整 thetaLength —— 用几何重建但保留足够低的细分以控制开销。 */
  function setCapAngle(mesh, thetaLength) {
    if (!mesh) return;
    if (mesh.userData.lastTheta === thetaLength) return;
    mesh.userData.lastTheta = thetaLength;
    var geo = SOLAR.TeachGlobeShared.track(new THREE.SphereGeometry(EARTH_R * 1.012, 64, 16, 0, Math.PI * 2, 0, Math.max(0.0001, thetaLength)));
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;
  }

  /* ============ 对外（内部装配用，不对外承诺） ============ */

  return {
    sunState: sunState,
    apply: apply,
    setCapAngle: setCapAngle
  };
})();
