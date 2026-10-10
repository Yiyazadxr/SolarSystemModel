/**
 * 教学装置：地球仪（globe）—— 教学观察场景装置
 * 用途：teach-globe 拆分后的"附加图层"层。四个观察场景装置：
 *       - 3.1.1 远去船只（buildHorizon，真实球面海面）
 *       - 3.1.2 月食（buildEclipse，地球本影投影到月盘）
 *       - 3.1.3 麦哲伦环球航线（buildVoyage，大圆航线 + 行进帆船）
 *       - 3.2.1 地球尺寸（buildSizeRings，赤道半径 / 极半径 / 赤道周长）
 *       - 3.3.1 / 3.3.2 经纬度度数标注（buildDegreeLabels）
 *       外加人造地球卫星（buildSatellites + updateSatellites，逐帧公转）。
 *       GLSL 源码取 SOLAR.GlobeShaders；通用图形构造（makeLabel / basicMat /
 *       loadRealTexture / hlMat / hlGlowMat）与共享注册表同 SOLAR.GlobeBody /
 *       SOLAR.TeachGlobeShared，跨模块一律运行时限定名调用。
 *
 * 坐标约定：与 teach-globe-shared.js 同一套（Y 轴向上、黄道面 = XZ 平面、
 *       sunDir = (cos λ, 0, sin λ)）。
 *
 * 依赖：THREE、SOLAR.TeachGlobeShared、SOLAR.GlobeShaders、SOLAR.GlobeBody。
 *       零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.GlobeScenes = (function () {
  'use strict';

  var SH = SOLAR.GlobeShaders;
  var G = SOLAR.TeachGlobeShared.S;

  /* 常量随共享注册表走：本模块内引用只读，不在函数体里改（改请改 shared）。 */
  var DEG = G.DEG;
  var EARTH_R = G.EARTH_R;

  /* 3.1.1 远去船只：海面球半径越大，地平线越远，但曲率越小、船下沉越不明显。
     这里取 6R 让地平线更近、弧面更弯，桅杆的「下沉」过程更清楚；
     相位上限 0.60 远大于完全遮挡所需角度，保证船一直开到船身与桅杆都被挡住，
     并在被挡住后才复位，避免复位瞬间在近处弹出来。 */
  var HORIZON_SEA_R = EARTH_R * 6;    // 曲率较强，桅杆下沉更明显
  var HORIZON_SHIP_SCALE = 1.6;       // 船相对海面更大，遮挡过程看得更清
  var HORIZON_SHIP_MAX_TH = 0.60;     // 相位上限：完全没入地平线之后才循环
  var HORIZON_SHIP_SPEED = 0.15;      // 略快，但仍能看清船身先没、桅杆后没

  function placeLatLon(out, latDeg, lonDeg, radius) {
    var phi = latDeg * DEG, theta = lonDeg * DEG;
    out.set(radius * Math.cos(phi) * Math.cos(theta), radius * Math.sin(phi), -radius * Math.cos(phi) * Math.sin(theta));
    return out;
  }

  function tinyLabel(text) {
    var lb = SOLAR.GlobeBody.makeLabel(text, 20, 0.075);
    SOLAR.TeachGlobeShared.track(lb.texture);
    return lb.sprite;
  }

  /* ---- 环球航行航线（麦哲伦段 + 埃尔卡诺段，两种颜色）----
     按史实航迹关键节点 [纬度, 经度] 绘制；经度用连续值西行为负
     （跨日界线后关岛 144.75E = -215.25、好望角 18.5E = -341.5），
     sin/cos 转换模 360 自动归一，CatmullRom 插值不在日界线上跳变。 */
  function buildVoyage() {
    G.nodes.voyageGroup = new THREE.Group();
    /* 航迹画在地球表面，必须挂 spinGroup 随地球一起转：此前挂在 extraGroup
       （不随自转），步骤的 spinDeg 让地球转过任意角度时航线就会整体偏离
       大陆（表现为航线穿过南美、贴错澳洲）。 */
    G.nodes.spinGroup.add(G.nodes.voyageGroup);

    /* 麦哲伦段：塞维利亚 → 大西洋 → 麦哲伦海峡 → 南太平洋 → 麦克坦岛 */
    var magellanRoute = [
      [37.4, -6.0],      // 塞维利亚（1519.9.20 出发）
      [28.0, -15.5],     // 加那利群岛（1519.9.26 补给）
      [14.5, -22.5],     // 佛得角（1519.11.29）
      [-8.0, -34.9],     // 巴西东端外海
      [-22.9, -43.2],    // 里约热内卢（1519.12.13）
      [-35.0, -56.0],    // 拉普拉塔河口（1520.1）
      [-45.0, -65.7],    // 圣胡利安港（1520.3–10 避冬）
      [-52.5, -68.3],    // 麦哲伦海峡东口（1520.10.21）
      [-54.0, -75.0],    // 海峡西口（1520.11.28 进入太平洋）
      [-38.0, -120.0],   // 南太平洋
      [-25.0, -150.0],   // 南太平洋西北
      [13.4, -215.25],   // 关岛（1521.3.6，=144.75E）
      [10.3, -236.1]     // 麦克坦岛（=124E，1521.4.27 麦哲伦之死）
    ];
    /* 埃尔卡诺段：麦克坦 → 摩鹿加 → 帝汶 → 横渡印度洋（绕澳洲以南）
       → 好望角 → 佛得角 → 塞维利亚（1522.9.6，首次环球航行完成） */
    var elcanoRoute = [
      [10.3, -236.1],    // 麦克坦岛（1521.5.1 埃尔卡诺接管）
      [8.5, -237.5],     // 巴拉望（=122.5E）
      [4.9, -241.1],     // 文莱（=118.9E，1521.7.9）
      [0.5, -232.5],     // 蒂多雷（=127.5E，1521.11.8，向东回摩鹿加）
      [-3.7, -231.8],    // 安汶（=128.2E，1521.12.29）
      [-9.5, -234.4],    // 帝汶岛（=125.6E，1522.1.25）
      [-17.0, -235.5],   // 帝汶以南外海（澳洲西北）
      [-30.0, -270.0],   // 东印度洋（=95E，澳洲以南）
      [-37.0, -325.0],   // 南印度洋（=35E）
      [-34.8, -341.5],   // 好望角（=18.5E，1522.5.19）
      [5.0, -352.0],    // 西非外海北上（=8E）
      [4.0, -371.0],
      [16.0, -383.6],    // 佛得角群岛（=-23.6W，1522.9.6）
      [37.4, -366.0]     // 塞维利亚（=-6.0，1522.9.6 返航）
    ];

    var r = EARTH_R * 1.045;
    var i;

    /* 两单位方向向量间的球面插值（slerp） */
    function slerpDir(a, b, t, out) {
      var d = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
      if (d < 1e-6) return out.copy(a);
      var s = Math.sin(d);
      return out.copy(a).multiplyScalar(Math.sin((1 - t) * d) / s)
        .addScaledVector(b, Math.sin(t * d) / s).normalize();
    }

    function buildSegment(route, color, label, labelIdx) {
      var pts = [];
      for (i = 0; i < route.length; i++) {
        placeLatLon(pts[i] = new THREE.Vector3(), route[i][0], route[i][1], r);
      }
      /* 球面细分：CatmullRom 的 3D 弦在相邻控制点角距大时会沉入球体
         （南太平洋段相距 44°、好望角→西非段 41°，弦沉入达 7% 半径），
         被地球遮挡后表现为「航线断开 / 穿模进大陆」。先沿球面每 ≤4°
         细分一次（弦深仅 0.06% 半径），再做 CatmullRom 平滑。 */
      var dense = [];
      var va = new THREE.Vector3(), vb = new THREE.Vector3(), vs = new THREE.Vector3();
      for (i = 0; i < pts.length - 1; i++) {
        va.copy(pts[i]).normalize();
        vb.copy(pts[i + 1]).normalize();
        var ang = Math.acos(Math.max(-1, Math.min(1, va.dot(vb))));
        var n = Math.max(1, Math.ceil(ang / (4 * DEG)));
        for (var j = 0; j < n; j++) {
          dense.push(slerpDir(va, vb, j / n, vs).clone().multiplyScalar(r));
        }
      }
      dense.push(pts[pts.length - 1].clone());
      var curve = new THREE.CatmullRomCurve3(dense, false, 'centripetal');
      var smooth = curve.getPoints(dense.length * 2);
      var geo = SOLAR.TeachGlobeShared.track(new THREE.BufferGeometry().setFromPoints(smooth));
      var line = new THREE.Line(geo, SOLAR.TeachGlobeShared.track(new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.96, depthWrite: false, fog: false
      })));
      G.nodes.voyageGroup.add(line);
      var lb = tinyLabel(label);
      lb.position.copy(pts[labelIdx]).multiplyScalar(1.07);
      G.nodes.voyageGroup.add(lb);
      return smooth;
    }

    var magellanSm = buildSegment(magellanRoute, 0xffb45c, '麦哲伦航线', 9);
    var elcanoSm = buildSegment(elcanoRoute, 0xff9fb5, '埃尔卡诺返航', 8);

    /* 行进指示改用小帆船（与远去船只同源模型，亮船体色便于在球面上辨认），
       替代原来的红色小球；0.55 倍 → 船长 0.10R，够示意又不喧宾夺主 */
    var dot = buildShipModel(0.55, 0xffc98a);
    dot.traverse(function (o) { if (o.isMesh) o.renderOrder = 4; });
    G.nodes.voyageGroup.add(dot);

    /* 行进指示点沿「麦哲伦 → 埃尔卡诺」两段连续播放（两段在麦克坦衔接）。
       同时预计算累计弧长：CatmullRom 的均匀 t 采样在弦长不均处会让匀速 t
       变成忽快忽慢（小船顿挫的根源），运行时按弧长插值保证船速恒定。 */
    var routeAll = magellanSm.concat(elcanoSm);
    var cum = [0];
    for (i = 1; i < routeAll.length; i++) {
      cum.push(cum[i - 1] + routeAll[i].distanceTo(routeAll[i - 1]));
    }
    G.nodes.voyageGroup.userData.route = routeAll;
    G.nodes.voyageGroup.userData.cum = cum;
    G.nodes.voyageGroup.userData.dot = dot;

    G.nodes.voyageGroup.visible = false;
  }
  /* ---- 帆船模型（远去船只场景与环球航线行进指示共用）----
     船头朝 -Z、长轴沿 Z、船底贴 y=0；scale 以 EARTH_R 为基准，
     hullColor 可覆盖船体色（航线上用亮色以便在球面上看清）。 */
  function buildShipModel(scale, hullColor) {
    var g = new THREE.Group();
    var s = EARTH_R * scale;
    /* 受光材质（Lambert）：航线上船只有二十几像素，无光照的六面同色会糊成
       二维贴纸——体积感要靠明暗面表达，不能靠尺寸。 */
    var mk = function (color, doubleSide) {
      return SOLAR.TeachGlobeShared.track(new THREE.MeshLambertMaterial({
        color: color, fog: false, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
      }));
    };
    var wood = mk(hullColor || 0x9a6640);
    var woodDark = mk(0x6d4526);
    var canvasMat = mk(0xf7f2e6, true);
    var mastMat = mk(0x53371c);

    /* 船体：俯视轮廓挤出——船头收尖、船尾平直、舷侧微外飘。
       Shape 的 +y 为船头方向，rotateX(-π/2) 后映射到局部 -z（模型约定
       船头朝 -z），挤出厚度变为船体高度。 */
    var L = s * 0.085;                                  /* 半长 */
    var hullShape = new THREE.Shape();
    hullShape.moveTo(-s * 0.024, -L);
    hullShape.quadraticCurveTo(-s * 0.027, -L * 0.2, -s * 0.021, L * 0.35);
    hullShape.quadraticCurveTo(-s * 0.012, L * 0.82, 0, L);
    hullShape.quadraticCurveTo(s * 0.012, L * 0.82, s * 0.021, L * 0.35);
    hullShape.quadraticCurveTo(s * 0.027, -L * 0.2, s * 0.024, -L);
    hullShape.closePath();
    var hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: s * 0.030, bevelEnabled: false });
    hullGeo.rotateX(-Math.PI / 2);
    hullGeo.translate(0, s * 0.008, 0);                 /* 船底略沉过 y=0 水线 */
    var hull = new THREE.Mesh(SOLAR.TeachGlobeShared.track(hullGeo), wood);

    /* 艏楼与艉楼：压扁贴在甲板上，舱顶略窄于船宽 */
    var fore = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(s * 0.030, s * 0.020, s * 0.050)), woodDark);
    fore.position.set(0, s * 0.048, -s * 0.052);
    var aft = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(s * 0.038, s * 0.026, s * 0.046)), woodDark);
    aft.position.set(0, s * 0.051, s * 0.050);

    /* 主桅 + 横桁 + 横帆（帆面顶点做余弦鼓风，鼓向船头） */
    var mastMain = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(s * 0.0042, s * 0.0055, s * 0.125, 6)), mastMat);
    mastMain.position.set(0, s * 0.100, -s * 0.004);
    var yardMain = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(s * 0.0045, s * 0.0045, s * 0.105, 6)), mastMat);
    yardMain.rotation.z = Math.PI / 2;
    yardMain.position.set(0, s * 0.148, -s * 0.004);
    var sailMain = new THREE.Mesh(SOLAR.TeachGlobeShared.track(bentSailGeo(s, 0.096, 0.052)), canvasMat);
    sailMain.position.set(0, s * 0.119, -s * 0.004);

    /* 前桅 + 小横帆 */
    var mastFore = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(s * 0.0032, s * 0.0040, s * 0.088, 6)), mastMat);
    mastFore.position.set(0, s * 0.082, -s * 0.050);
    var yardFore = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(s * 0.0035, s * 0.0035, s * 0.070, 6)), mastMat);
    yardFore.rotation.z = Math.PI / 2;
    yardFore.position.set(0, s * 0.116, -s * 0.050);
    var sailFore = new THREE.Mesh(SOLAR.TeachGlobeShared.track(bentSailGeo(s, 0.062, 0.036)), canvasMat);
    sailFore.position.set(0, s * 0.096, -s * 0.050);

    g.add(hull); g.add(fore); g.add(aft);
    g.add(mastMain); g.add(yardMain); g.add(sailMain);
    g.add(mastFore); g.add(yardFore); g.add(sailFore);
    return g;
  }

  /* 横帆几何：矩形平面，顶点沿宽度做余弦鼓风（中部向 -z 鼓起，受风面） */
  function bentSailGeo(s, w, h) {
    var geo = new THREE.PlaneGeometry(s * w, s * h, 6, 1);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var u = pos.getX(i) / (s * w * 0.5);              /* -1..1 */
      pos.setZ(i, -Math.cos(u * Math.PI * 0.5) * s * 0.011);
    }
    pos.needsUpdate = true;
    return geo;
  }

  /* ---- 地面观察远去船只：船沿真实球面海面向远方航行 ---- */
  function buildHorizon() {
    G.nodes.horizonGroup = new THREE.Group();
    G.nodes.extraGroup.add(G.nodes.horizonGroup);
    /* 海面用真实球面（半径由 HORIZON_SEA_R 决定，球心在 y=-Rs）：地平线由球体
       曲率自然形成，船的「下沉」是被球面遮挡的物理结果——船身先没、桅杆后没
       不再是人为下压曲线。旧抛物面网格边界可见（湖面感）且下沉量失真，已替换。
       整组放大 4 倍：相机走 globe rig（dist≥3），放大后等效眼高贴近海面。 */
    G.nodes.horizonGroup.scale.setScalar(4);

    var Rs = HORIZON_SEA_R;
    var seaGeo = SOLAR.TeachGlobeShared.track(new THREE.SphereGeometry(Rs, 96, 64));
    /* 顶点色：球顶（观察者一带）稍亮，向地平线渐暗，强化距离感 */
    var sp = seaGeo.attributes.position;
    var colors = new Float32Array(sp.count * 3);
    for (var s = 0; s < sp.count; s++) {
      var t = (sp.getY(s) / Rs + 1) / 2;
      var f = Math.pow(Math.max(0, t - 0.62) / 0.38, 1.3);
      colors[s * 3] = 0.08 + 0.11 * f;
      colors[s * 3 + 1] = 0.22 + 0.20 * f;
      colors[s * 3 + 2] = 0.30 + 0.22 * f;
    }
    seaGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var sea = new THREE.Mesh(seaGeo, SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    sea.position.y = -Rs;
    G.nodes.horizonGroup.add(sea);

    var ship = buildShipModel(HORIZON_SHIP_SCALE);
    G.nodes.horizonGroup.add(ship);
    G.nodes.horizonGroup.userData.ship = ship;
    G.nodes.horizonGroup.visible = false;
  }

  /* ---- 地面观察月食：地球本影投影到观察者正对的月盘 ---- */
  function buildEclipse() {
    G.nodes.eclipseGroup = new THREE.Group();
    G.nodes.extraGroup.add(G.nodes.eclipseGroup);
    var moonMat2 = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0xd2d2d2, 1.0, false));
    var moon = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.SphereGeometry(EARTH_R * 0.55, 32, 20)), moonMat2);
    moon.position.set(0, EARTH_R * 0.55, -EARTH_R * 0.35);
    SOLAR.GlobeBody.loadRealTexture('moon', 'moon.jpg', function (t) { if (t) { moonMat2.map = t; moonMat2.needsUpdate = true; } });
    G.nodes.eclipseGroup.add(moon);
    /* 地影锚定「世界几何」而非视空间：轴 = 地心→月球方向（地影从地球伸向
       月球，阴影永远落在月面朝地球的一面）；扫动方向 = 世界 UP × 轴
       （近似黄道面内的东西向）。此前阴影沿视空间 X 扫动，本步骤相机
       target 就是月球，一拖拽月面视角在转、阴影却焊在屏幕右侧，几何脱钩。 */
    G.nodes.eclipseShadowMaterial = SOLAR.TeachGlobeShared.track(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uCenter: { value: 1.5 },
        uAxis: { value: new THREE.Vector3(0, 0, 1) },
        uTangent: { value: new THREE.Vector3(1, 0, 0) },
        uMoonR: { value: EARTH_R * 0.55 }
      },
      vertexShader: SH.ECLIPSE_VERT,
      /* 地影尺寸取真实比例：月球距离处地球本影直径 ≈ 2.6 倍月球直径，
         即本影半径 ≈ 1.0、半影外缘 ≈ 1.35 个月盘半径——
         全食阶段本影恰好盖满月盘（边缘 d=1.0 < 1.02），且边界弧的
         曲率明显（弦高 ≈ 0.45 个月盘半径），「地影呈弧形 → 地球是球体」
         的教学论点在画面上直接可读；旧阈值（0.65~0.90）弧太平、近似直线。 */
      /* 只在「朝向地球的半个球面」着色，且边界平滑渐隐：地影从地球一侧
         投来，月球背对地球的一面照不到地影（相机绕到那一侧应看到全亮的
         月面）。「到地影轴的距离」是贯穿整个球的圆柱，正反两面都满足，
         因此需要半球因子；但硬 discard 会在半球边界（月盘中的一条大圆）
         留下一条无过渡的直线硬边——改为 smoothstep 渐隐（约 12° 余弦带），
         阴影朝半球边缘柔和淡出。真实全食照片里月面边缘也因地球大气折射
         的红光而略亮，柔和渐变反而更贴近真实观感。 */
      fragmentShader: SH.ECLIPSE_FRAG,
      side: THREE.FrontSide
    }));
    var shadowShell = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.SphereGeometry(EARTH_R * 0.555, 48, 32)), G.nodes.eclipseShadowMaterial);
    shadowShell.renderOrder = 5;
    moon.add(shadowShell);
    G.nodes.eclipseGroup.userData.moon = moon;
    G.nodes.eclipseGroup.userData.shadowMaterial = G.nodes.eclipseShadowMaterial;
    G.nodes.eclipseGroup.visible = false;
  }
  /* ---- 人造地球卫星 ---- */
  function buildSatellites() {
    G.nodes.satGroup = new THREE.Group();
    G.nodes.extraGroup.add(G.nodes.satGroup);

    var bodyMatA = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0xd8e2e8, 1.0, false));
    var bodyMatB = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0xb9c4cc, 1.0, false));
    var bodyMatC = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0xe8eef2, 1.0, false));
    var panelMatA = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0x3f6fd8, 1.0, false));
    var panelMatB = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0x274e9e, 1.0, false));
    var dishMat = SOLAR.TeachGlobeShared.track(SOLAR.GlobeBody.basicMat(0xf2f5f7, 1.0, false));

    /* 9 颗：不同轨道高度 / 倾角 / 相位 / 速度，并按类型变换外观，避免单调 */
    var cfg = [
      { r: 1.28, inc: 12, phase: 0.0, speed: 0.55, type: 0, s: 0.85 },
      { r: 1.34, inc: 63, phase: 2.3, speed: 0.48, type: 1, s: 0.70 },
      { r: 1.42, inc: 28, phase: 4.4, speed: 0.42, type: 2, s: 0.75 },
      { r: 1.50, inc: 80, phase: 1.2, speed: 0.38, type: 0, s: 0.65 },
      { r: 1.58, inc: 45, phase: 5.6, speed: 0.33, type: 1, s: 0.80 },
      { r: 1.66, inc: 5,  phase: 3.4, speed: 0.29, type: 2, s: 0.60 },
      { r: 1.74, inc: 38, phase: 0.8, speed: 0.26, type: 0, s: 0.70 },
      { r: 1.82, inc: 70, phase: 4.9, speed: 0.23, type: 1, s: 0.65 },
      { r: 1.92, inc: 18, phase: 2.9, speed: 0.20, type: 2, s: 0.75 }
    ];
    for (var i = 0; i < cfg.length; i++) {
      var c = cfg[i];
      var g = new THREE.Group();
      var k = c.s;
      if (c.type === 0) {
        /* 长方体卫星 + 双侧太阳翼 */
        var body = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(EARTH_R * 0.026 * k, EARTH_R * 0.020 * k, EARTH_R * 0.020 * k)), bodyMatA);
        g.add(body);
        var pw = EARTH_R * 0.045 * k, ph = EARTH_R * 0.0022, pd = EARTH_R * 0.016 * k;
        var p1 = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(pw, ph, pd)), panelMatA);
        p1.position.x = -EARTH_R * 0.034 * k;
        var p2 = p1.clone(); p2.position.x = EARTH_R * 0.034 * k;
        g.add(p1); g.add(p2);
      } else if (c.type === 1) {
        /* 圆柱星体 + 抛物面天线 */
        var cyl = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(EARTH_R * 0.011 * k, EARTH_R * 0.011 * k, EARTH_R * 0.030 * k, 10)), bodyMatB);
        cyl.rotation.z = Math.PI / 2;
        g.add(cyl);
        var dish = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.ConeGeometry(EARTH_R * 0.014 * k, EARTH_R * 0.008 * k, 12, 1, true)), dishMat);
        dish.position.x = EARTH_R * 0.022 * k;
        dish.rotation.z = -Math.PI / 2;
        g.add(dish);
        var pw1 = EARTH_R * 0.038 * k, pd1 = EARTH_R * 0.013 * k;
        var q1 = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(pw1, EARTH_R * 0.002, pd1)), panelMatB);
        q1.position.y = -EARTH_R * 0.018 * k;
        var q2 = q1.clone(); q2.position.y = EARTH_R * 0.018 * k;
        g.add(q1); g.add(q2);
      } else {
        /* 球体星体 + 四瓣太阳翼 */
        var sph = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.SphereGeometry(EARTH_R * 0.013 * k, 10, 8)), bodyMatC);
        g.add(sph);
        var pw2 = EARTH_R * 0.036 * k, pd2 = EARTH_R * 0.012 * k;
        var r1 = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(pw2, EARTH_R * 0.002, pd2)), panelMatA); r1.position.x = -EARTH_R * 0.030 * k;
        var r2 = r1.clone(); r2.position.x = EARTH_R * 0.030 * k;
        var r3 = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.BoxGeometry(pd2, EARTH_R * 0.002, pw2)), panelMatB); r3.position.z = -EARTH_R * 0.030 * k;
        var r4 = r3.clone(); r4.position.z = EARTH_R * 0.030 * k;
        g.add(r1); g.add(r2); g.add(r3); g.add(r4);
      }
      g.userData.cfg = c;
      g.rotation.set(c.phase * 0.7, c.phase, c.phase * 0.3);
      g.scale.setScalar(1.25);
      G.nodes.satGroup.add(g);
      G.nodes.satNodes.push(g);
    }
    G.nodes.satGroup.visible = false;
  }

  function updateSatellites(dtSec) {
    if (!G.nodes.satGroup || !G.nodes.satGroup.visible) return;
    G.satSpin += dtSec;
    for (var i = 0; i < G.nodes.satNodes.length; i++) {
      var g = G.nodes.satNodes[i];
      var c = g.userData.cfg;
      var a = c.phase + G.satSpin * c.speed;
      var inc = c.inc * DEG;
      var x = Math.cos(a) * c.r;
      var z = Math.sin(a) * c.r;
      /* 先在 XZ 平面展开，再绕 X 轴按倾角抬起 */
      var y = -z * Math.sin(inc);
      var z2 = z * Math.cos(inc);
      g.position.set(x, y, z2);
      g.rotation.y = -a;
    }
  }
  /* ---- 地球的尺寸（教材图 3.1-5）：赤道半径、极半径、赤道周长 ---- */
  function buildSizeRings() {
    G.nodes.sizeGroup = new THREE.Group();
    G.nodes.extraGroup.add(G.nodes.sizeGroup);

    /* 赤道周长环（贴地表一圈）：受光核心 + 外圈淡晕，配色走低饱和制图色 */
    var ringGrp = new THREE.Group();
    var ringCore = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(EARTH_R * 1.005, EARTH_R * 0.010, 8, 128)), SOLAR.GlobeBody.hlMat(0xffe3b0));
    var ringGlow = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(EARTH_R * 1.005, EARTH_R * 0.024, 8, 128)), SOLAR.GlobeBody.hlGlowMat(0xffe3b0));
    ringCore.renderOrder = 2;
    ringGlow.renderOrder = 1;
    ringGrp.add(ringCore);
    ringGrp.add(ringGlow);
    ringGrp.rotation.x = Math.PI / 2;              /* 赤道面 = XZ */
    G.nodes.sizeGroup.add(ringGrp);

    /* 半径标尺（教材图 3.1-5 的画法）：线从球心画到表面，两端带箭头。
       depthTest 关闭 → 线像 X 光一样透出球体（教材的示意画法，不是真实遮挡），
       renderOrder 压在球面之上；axisChar 'x' 表示沿赤道方向的半径。 */
    function radiusPointer(len, color, axisChar) {
      var grp = new THREE.Group();
      var mat = function () {
        return SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({
          color: color, transparent: true, opacity: 0.98, depthTest: false, fog: false
        }));
      };
      var shaft = new THREE.Mesh(
        SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(EARTH_R * 0.010, EARTH_R * 0.010, len, 8)), mat());
      shaft.position.y = len * 0.5;                       /* 覆盖 0 → len */
      grp.add(shaft);

      var tipGeo = SOLAR.TeachGlobeShared.track(new THREE.ConeGeometry(EARTH_R * 0.030, EARTH_R * 0.080, 10));
      var tipOut = new THREE.Mesh(tipGeo, mat());          /* 表面端，尖朝外 */
      tipOut.position.y = len + EARTH_R * 0.040;
      grp.add(tipOut);
      var tipIn = new THREE.Mesh(tipGeo, mat());           /* 球心端，尖朝球心 */
      tipIn.position.y = -EARTH_R * 0.040;
      tipIn.rotation.x = Math.PI;
      grp.add(tipIn);

      grp.traverse(function (o) { if (o.isMesh) o.renderOrder = 6; });
      if (axisChar === 'x') grp.rotation.z = -Math.PI / 2;
      return grp;
    }

    /* 极半径：球心 → 北极（6357 km，双向箭头） */
    G.nodes.sizeGroup.add(radiusPointer(EARTH_R * 1.0, 0xf0c98a, 'y'));
    /* 赤道半径：球心 → 赤道面（6378 km，双向箭头） */
    G.nodes.sizeGroup.add(radiusPointer(EARTH_R * 1.0, 0xe8b4a0, 'x'));

    var lbPolar = tinyLabel('极半径 6357 km');
    lbPolar.position.set(0, EARTH_R * 1.30, 0);
    G.nodes.sizeGroup.add(lbPolar);

    var lbEq = tinyLabel('赤道半径 6378 km');
    lbEq.position.set(EARTH_R * 1.46, EARTH_R * 0.10, 0);
    G.nodes.sizeGroup.add(lbEq);

    var lbCirc = tinyLabel('赤道周长约 4×10⁴ km');
    lbCirc.position.set(-EARTH_R * 0.55, -EARTH_R * 0.34, EARTH_R * 1.14);
    G.nodes.sizeGroup.add(lbCirc);

    G.nodes.sizeGroup.visible = false;
  }

  /* ---- 经纬度度数标注 ----
     分「纬度组 / 经度组」，可单独显示（教材图 3.1-9 纬线、3.1-10 经线）。
     挂 tiltGroup：与经纬网同一坐标系，地轴倾斜时标记跟着倾斜；
     depthTest 打开：转到地球背面的度数会被球体遮住。 */
  function buildDegreeLabels() {
    G.nodes.degreeGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.degreeGroup);
    G.nodes.degreeLatGroup = new THREE.Group();
    G.nodes.degreeLonGroup = new THREE.Group();
    G.nodes.degreeGroup.add(G.nodes.degreeLatGroup);
    G.nodes.degreeGroup.add(G.nodes.degreeLonGroup);

    var r = EARTH_R * 1.06;
    var tmp = new THREE.Vector3();
    var i;

    function tag(text) {
      var lb = SOLAR.GlobeBody.makeLabel(text, 22, 0.085, true);   // occluded: 可被地球遮挡
      SOLAR.TeachGlobeShared.track(lb.texture);
      return lb.sprite;
    }

    /* 主要纬线的度数：赤道、南北回归线、30°、60°、极圈、极点 */
    var lats = [
      [66.5, '66.5°N'], [60, '60°N'], [30, '30°N'], [23.5, '23.5°N'],
      [0, '0°'],
      [-23.5, '23.5°S'], [-30, '30°S'], [-60, '60°S'], [-66.5, '66.5°S']
    ];
    for (i = 0; i < lats.length; i++) {
      placeLatLon(tmp, lats[i][0], 0, r);
      var sp = tag(lats[i][1]);
      sp.position.copy(tmp).multiplyScalar(1.02);
      sp.position.z -= EARTH_R * 0.10;
      G.nodes.degreeLatGroup.add(sp);
    }
    /* 两极：地轴端点（教材图标 90°N / 90°S） */
    var poleN = tag('90°N');
    poleN.position.set(0, EARTH_R * 1.14, 0);
    G.nodes.degreeLatGroup.add(poleN);
    var poleS = tag('90°S');
    poleS.position.set(0, -EARTH_R * 1.14, 0);
    G.nodes.degreeLatGroup.add(poleS);

    /* 本初子午线文字标注：挂在 0° 经线赤道点外侧上方，与「0°」度数标签
       （在 y+0.08R 处）错开，避免叠字；depthTest 打开，转到背面会被地球挡住。 */
    placeLatLon(tmp, 0, 0, r);
    var lbMer0 = SOLAR.GlobeBody.makeLabel('本初子午线', 24, 0.10, true);
    SOLAR.TeachGlobeShared.track(lbMer0.texture);
    lbMer0.sprite.position.copy(tmp).multiplyScalar(1.02);
    lbMer0.sprite.position.y += EARTH_R * 0.22;
    G.nodes.degreeLonGroup.add(lbMer0.sprite);

    /* 主要经线的度数：本初子午线起，每 20° 一条（与教材图 3.1-10 一致） */
    var lons = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, -160, -140, -120, -100, -80, -60, -40, -20];
    for (i = 0; i < lons.length; i++) {
      var deg = lons[i];
      var text = deg === 0 ? '0°' : (deg === 180 ? '180°' : Math.abs(deg) + '°' + (deg > 0 ? 'E' : 'W'));
      placeLatLon(tmp, 0, deg, r);
      var sp2 = tag(text);
      sp2.position.copy(tmp).multiplyScalar(1.02);
      sp2.position.y += EARTH_R * 0.08;
      G.nodes.degreeLonGroup.add(sp2);
    }

    G.nodes.degreeGroup.visible = false;
  }

  /* ============ 对外（内部装配用，不对外承诺） ============ */

  return {
    placeLatLon: placeLatLon,
    tinyLabel: tinyLabel,
    buildVoyage: buildVoyage,
    buildShipModel: buildShipModel,
    bentSailGeo: bentSailGeo,
    buildHorizon: buildHorizon,
    buildEclipse: buildEclipse,
    buildSatellites: buildSatellites,
    updateSatellites: updateSatellites,
    buildSizeRings: buildSizeRings,
    buildDegreeLabels: buildDegreeLabels,
    HORIZON_SEA_R: HORIZON_SEA_R,
    HORIZON_SHIP_SCALE: HORIZON_SHIP_SCALE,
    HORIZON_SHIP_MAX_TH: HORIZON_SHIP_MAX_TH,
    HORIZON_SHIP_SPEED: HORIZON_SHIP_SPEED
  };
})();
