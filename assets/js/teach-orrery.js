/**
 * 教学装置：三球仪（日—地—月）+ 地月系，面向「四季成因 / 节气 / 月相 / 日月食」的课堂演示。
 * 在用步骤：3.6.1 地球的公转与四季、3.9.1 二十四节气（teach-data.js 的 rig: 'orrery'）。
 *
 * 坐标与天文约定（与 teach-globe.js 保持同一套哲学，务必看懂再改）：
 *   - Y 轴向上，**黄道面 = XZ 平面**，太阳位于原点，地球沿该平面内的圆轨道运行（自西向东）；
 *   - 太阳方向 = (cos λ, 0, sin λ)，λ 为太阳**视黄经**；地球的日心黄经 = λ + 180°，
 *     于是春分（λ=0）时地球位于 (−R, 0, 0)。
 *   - 由 (dayOfYear − 80) / 365 × 360° 得到 λ，**dayOfYear = 80 对应春分**（3 月 21 日为一年第 80 天）。
 *     这是"二十四节气 = 轨道 24 等分"的教学模型：真实节气间隔因轨道椭圆而略不均匀（开普勒），
 *     教材按等分处理，本装置也按等分处理，误差约 1°，对教学无影响。
 *   - 节气刻度：第 n 个节气（n=0 起，立春为首）对应 λ = −45° + n × 15°，故春分(n=3)=0°、
 *     夏至(n=9)=90°、秋分(n=15)=180°、冬至(n=21)=270°。
 *   - 地轴与黄道面夹角 tiltDeg（教材 66.5°），**公转中方向锁定不变**——这是四季成因的关键。
 *   - 月相：月球相对地球的方位角 = λ + 180° + (moonPhaseDay / 29.53) × 360°，
 *     moonPhaseDay=0 时月球位于日地之间（朔），14.77 时位于地球背阳侧（望）。
 *     明暗不作假，一律由 uSunDir 着色器实时算出。
 *
 * 尺度说明（诚实写法）：**天体半径尽量真实（太阳:地球:月球 ≈ 109:1:0.273），但距离必须压缩**——
 * 真实日地距离约等于 11700 个地球直径、真实月地距离约 30 个地球直径，照搬将无法同屏观察。
 * 因此本装置的日地 / 月地距离均为压缩值，界面应标注「距离已压缩」。
 * 两档差别只在显示尺寸与显示距离，**物理规律、方向、相位成因完全一致**。
 *
 * 依赖：仅 THREE 与 SOLAR.CONFIG。零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachOrrery = (function () {
  'use strict';

  var DEG = Math.PI / 180;
  var SYNODIC = 29.5306;        // 朔望月（天）
  var YEAR_DAYS = 365.2422;     // 回归年（天）
  var SPRING_DAY = 80;          // 春分 = 一年中的第 80 天

  /* 二十四节气：以立春为首，第 n 个对应 λ = -45° + n*15°。
     刻度与标签必须标在【地球所在的轨道位置】，即日心黄经 λ+180° 方向——
     此前标在 λ 方向（太阳侧），点「冬至」地球却停在「夏至」标签旁。 */
  var TERMS = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
    '立夏', '小满', '芒种', '夏至', '小暑', '大暑',
    '立秋', '处暑', '白露', '秋分', '寒露', '霜降',
    '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];

  /* 二分二至 -> λ（度） */
  var TERM_LAMBDA = { '春分': 0, '夏至': 90, '秋分': 180, '冬至': 270 };

  /* 四季配色：TERMS 序列每 6 个为一季（春：立春…谷雨，夏：立夏…大暑，
     秋：立秋…霜降，冬：立冬…大寒），用于节气名称的季节示意。 */
  var SEASON_COLORS = ['#9be7a0', '#ff9d7a', '#ffd76e', '#8fd0ff'];

  /* 显示尺度档案 —— 单位：地球半径（1 个场景单位）
     real   ：半径与距离全部按真实数据
              太阳半径 696000/6371   = 109.2
              月球半径 1737.4/6371    = 0.273
              日地距离 1.496e8/6371   = 23481
              地月距离 384400/6371    = 60.3
      iconic：便于同屏观察的示意比例（比例写在注释里，界面同步说明压缩倍数）
               太阳半径 5（示意，避免占据整个画面）
               地球半径 1.6（全景机位下仍需可辨，较真实值放大）
               月球半径 0.44（保持与地球的真实半径比 1:0.273）
               日地距离 28（压缩 23481/28 ≈ 839 倍；太阳 + 轨道同框不显太空旷）
               地月距离 8（压缩 60.3/8 ≈ 7.5 倍）
               halo 1.2：日面外贴边橙黄半透明光晕，与演示模式日冕同比例（1.20 倍太阳半径）
     两档都不改变任何物理关系：自转公转方向、地轴锁定 23.5°、月相与食的成因完全一致。 */
  var PROFILE = {
    real: { earth: 1.0, moon: 0.273, sun: 109.2, moonDist: 60.3, orbit: 23481, halo: 1.2 },
    iconic: { earth: 1.6, moon: 0.44, sun: 5.0, moonDist: 8.0, orbit: 28, halo: 1.2 }
  };

  var built = false;
  var scene = null;
  var root = null;
  var sunGroup = null, sunMesh = null, sunHalo = null;
  var orbitGroup = null, orbitLine = null, markGroup = null;
  var tickSeg = null, tickMajor = null;
  var termLabels = [];
  var earthRoot = null, earthTilt = null, earthSpin = null, earthMesh = null, earthMat = null;
  var gridGroup = null;                 /* 地球经纬网（与地球仪同款细线） */
  var earthAxis = null, sunLatRing = null, latLabel = null;
  /* 直射光线箭头（sunPoint 驱动）：细圆柱光束 + 小圆锥头，水平射向直射纬线圈 */
  var sunArrow = null;
  var ARROW_UP = null;               /* 常驻量：圆柱/圆锥的局部 +Y 轴 */
  var sunArrowDir = null;
  var arrowMid = null;
  var arrowQuat = null;
  var moonRoot = null, moonMesh = null, moonMat = null;
  var moonOrbitLine = null, moonNodeLine = null;
  var moonTiltDeg = 5.145;
  var raysGroup = null;
  var disposeList = [];
  /* 复用临时量：apply 在动画期间每帧都会被调用，避免逐个 new */
  var tmpSunDir = null;
  var tmpLat = null;               /* 度数标签朝向相机用 */
  var latCosD = 1, latSinD = 0;    /* 直射纬线的 cosδ / sinδ，由 apply 写入 */
  var cam = null;              // 延迟获取，用于维持节气标签的屏幕占比

  var anim = { spin: false, revolve: false, speed: 1 };
var cur = {};
var curScale = 'real';
var profile = PROFILE.real;
/* resetMotion 的复位基线：只认教学步骤下发的参数。
   update() 的逐帧推进与 goToTerm() 的定点跳转都算"之后的偏移"，不进基线，
   否则"复位"会退化成"复位到当前时刻"，公转位置依旧回不到步骤开头。 */
var base = {};
var skipBase = false;

  /* ============ 复用资产 ============ */

  var UNIT_SPHERE = null;

  function unitSphere() {
    if (!UNIT_SPHERE) UNIT_SPHERE = new THREE.SphereGeometry(1, 64, 48);
    return UNIT_SPHERE;
  }

  function track(o) { disposeList.push(o); return o; }

  var BODY_VERT = [
    'varying vec3 vN; varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  /* 通用的"只被太阳照亮一半"着色：月球/地球共用，明暗不作假；
     有贴图时用真实贴图（assets/textures 已内嵌进 textures.js，零额外体积），
     贴图尚未到位或缺失时回退到纯色。 */
  var BODY_FRAG = [
    'uniform sampler2D uMap;',
    'uniform float uHasMap;',
    'uniform vec3 uColor;',
    'uniform vec3 uSunDir;',
    'uniform float uNight;',
    'varying vec3 vN; varying vec2 vUv;',
    'void main(){',
    '  vec3 base = (uHasMap > 0.5) ? texture2D(uMap, vUv).rgb : uColor;',
    '  float d = dot(normalize(vN), normalize(uSunDir));',
    '  float lit = smoothstep(-0.05, 0.12, d);',
    '  float shade = mix(1.0 - uNight, 1.0, lit);',
    '  gl_FragColor = vec4(base * shade, 1.0);',
    '}'
  ].join('\n');

  /* 日面外贴边光晕（BackSide 加法混合壳）：只在边缘亮起的一圈橙黄色半透明环，
     参照演示模式日冕质感；半径小（1.5×日面），不会糊住公转轨道。 */
  var HALO_VERT = [
    'varying vec3 vN;',
    'void main(){',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var HALO_FRAG = [
    'uniform vec3 uColor; uniform float uPower;',
    'varying vec3 vN;',
    'void main(){',
    '  vec3 v = normalize(cameraPosition - vec3(0.0));',
    '  float f = pow(1.0 - abs(dot(normalize(vN), v)), uPower);',
    '  gl_FragColor = vec4(uColor * f, f * 0.55);',
    '}'
  ].join('\n');

  function makeLabel(text, size, color) {
    var fs = size || 40, pad = 12;
    var cvs = document.createElement('canvas');
    var ctx = cvs.getContext('2d');
    ctx.font = fs + 'px sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    var h = Math.ceil(fs * 1.5);
    cvs.width = w; cvs.height = h;
    ctx = cvs.getContext('2d');
    ctx.font = fs + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color || '#eaffff';
    ctx.fillText(text, w / 2, h / 2);
    var tex = new THREE.CanvasTexture(cvs);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    var spr = new THREE.Sprite(mat);
    spr.scale.set(w / h * 0.30, 0.30, 1);
    return { sprite: spr, texture: tex };
  }

  function bodyMat(color, night) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uNight: { value: night }
      },
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG
    });
  }

  /* 复用项目内嵌的真实贴图（键名见 textures.js）；缺失时回退纯色 */
  function loadRealTexture(key, fileName, mat, done) {
    var url = (SOLAR.TEXTURES && SOLAR.TEXTURES[key]) || null;
    if (!url && typeof location !== 'undefined' && location.protocol !== 'file:') {
      url = 'assets/textures/' + fileName;
    }
    if (!url) { if (done) done(); return; }
    try {
      new THREE.TextureLoader().load(url, function (t) {
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        mat.uniforms.uMap.value = t;
        mat.uniforms.uHasMap.value = 1;
        if (done) done();
      }, undefined, function () { if (done) done(); });
    } catch (e) { if (done) done(); }
  }

  /* ============ 构建 ============ */

  function buildSun() {
    sunGroup = new THREE.Group();
    sunMesh = new THREE.Mesh(unitSphere(), track(bodyMat(0xffd27a, 0.0)));
    sunGroup.add(sunMesh);

    /* 贴边光晕壳：uPower 越大环越窄、越贴日面边缘 */
    var haloMat = track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffb347) }, uPower: { value: 3.4 } },
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide
    }));
    sunHalo = new THREE.Mesh(unitSphere(), haloMat);
    sunGroup.add(sunHalo);
    root.add(sunGroup);

    /* 真实太阳表面贴图（米粒组织），加载不到时保留纯色 */
    loadRealTexture('sun', 'sun.png', sunMesh.material);
  }

  /* 公转轨道：单位圆上的 LineLoop，缩放即可得到实际半径（线宽不受缩放影响） */
  function buildOrbit() {
    var pts = [], n = 256;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    track(geo);
    var mat = track(new THREE.LineBasicMaterial({ color: 0x6f8fbf, transparent: true, opacity: 0.55 }));
    orbitLine = new THREE.LineLoop(geo, mat);
    orbitGroup.add(orbitLine);

    /* 24 等分刻度：二分二至处的刻度加粗（用两圈短线叠加近似加粗）。
       角度取 (135 + k*15)° = λ + 180°：标在地球所在的轨道位置，与定点按钮一致 */
    var seg = [], major = [];
    for (var k = 0; k < 24; k++) {
      var lam = (135 + k * 15) * DEG;
      var r0 = 1.0, r1 = 1.045;
      var isMajor = (k === 3 || k === 9 || k === 15 || k === 21);
      var target = isMajor ? major : seg;
      target.push(new THREE.Vector3(Math.cos(lam) * r0, 0, Math.sin(lam) * r0));
      target.push(new THREE.Vector3(Math.cos(lam) * r1, 0, Math.sin(lam) * r1));
    }
    var g1 = new THREE.BufferGeometry().setFromPoints(seg); track(g1);
    var m1 = track(new THREE.LineBasicMaterial({ color: 0x8fa8c8, transparent: true, opacity: 0.7 }));
    tickSeg = new THREE.LineSegments(g1, m1);
    orbitGroup.add(tickSeg);

    var g2 = new THREE.BufferGeometry().setFromPoints(major); track(g2);
    var m2 = track(new THREE.LineBasicMaterial({ color: 0x7ffcd8, transparent: true, opacity: 0.95 }));
    tickMajor = new THREE.LineSegments(g2, m2);
    orbitGroup.add(tickMajor);

    /* 节气名称：与刻度同侧（地球所在的轨道位置）；显隐档位在 apply() 里按 orbitMarks 过滤。
       名称按四季配色（TERMS 每 6 个为一季：立春起春、立夏起夏、立秋起秋、立冬起冬），
       只是季节归属的示意，不代表任何物理量。 */
    for (var t = 0; t < TERMS.length; t++) {
      var lb = makeLabel(TERMS[t], 44, SEASON_COLORS[Math.floor(t / 6)]);
      track(lb.texture);
      var big = (TERMS[t] === '春分' || TERMS[t] === '夏至' || TERMS[t] === '秋分' || TERMS[t] === '冬至');
      var lamF = (135 + t * 15) * DEG;
      lb.sprite.position.set(Math.cos(lamF) * 1.12, 0.06, Math.sin(lamF) * 1.12);
      lb.sprite.userData.isMajor = big;
      markGroup.add(lb.sprite);
      termLabels.push(lb.sprite);
    }
  }

  /* 经纬网：与地球仪（teach-globe-body.buildGrid）同款的单位半径细线网格。
     挂在 earthSpin 下随自转一同旋转，缩放跟随 earthMesh（applyProfile 里同步）。
     步长固定 30°，与「地方时与北京时间」步骤的观感一致；不需要运行时重建。 */
  function buildGrid() {
    var step = 30, i, j, lat, lon;
    var V = [];
    var segments = 64;

    /* 纬线：每 step 一条水平圆 */
    for (lat = -90 + step; lat < 90; lat += step) {
      var rl = Math.cos(lat * DEG);
      var yl = Math.sin(lat * DEG);
      for (i = 0; i < segments; i++) {
        for (j = 0; j < 2; j++) {
          var a = (i + j) / segments * Math.PI * 2;
          V.push(rl * Math.cos(a), yl, rl * Math.sin(a));
        }
      }
    }
    /* 经线：半个大圆，跨南北极 */
    for (lon = 0; lon < 180; lon += step) {
      var cl = Math.cos(lon * DEG), sl = Math.sin(lon * DEG);
      for (i = 0; i < segments; i++) {
        for (j = 0; j < 2; j++) {
          var t = (i + j) / segments * Math.PI;
          var yy = Math.cos(t);
          var rr = Math.sin(t);
          V.push(rr * cl, yy, rr * sl);
        }
      }
    }

    var geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V), 3));
    var mat = track(new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.30 }));
    gridGroup = new THREE.LineSegments(geo, mat);
    earthSpin.add(gridGroup);
  }

  function buildEarth() {
    earthRoot = new THREE.Group();
    earthTilt = new THREE.Group();
    earthSpin = new THREE.Group();
    earthRoot.add(earthTilt);
    earthTilt.add(earthSpin);

    earthMat = track(bodyMat(0x4a90d9, 0.85));
    earthMesh = new THREE.Mesh(unitSphere(), earthMat);
    earthSpin.add(earthMesh);
    loadRealTexture('earth', 'earth.jpg', earthMat);

    /* 地轴 */
    var geo = new THREE.CylinderGeometry(0.02, 0.02, 3.0, 10); track(geo);
    var mat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    earthAxis = new THREE.Mesh(geo, mat);
    earthTilt.add(earthAxis);

    /* 直射纬线圈：贴在地球表面纬度 δ 处的圆环。挂在 earthTilt 而非 earthSpin 下——
        纬度圈与自转无关，不随自转滑动；缩放/抬升在 apply() 里按 δ 精确设置。 */
    var latPts = [], ln = 96;
    for (var li = 0; li < ln; li++) {
      var la = li / ln * Math.PI * 2;
      latPts.push(new THREE.Vector3(Math.cos(la), 0, Math.sin(la)));
    }
    var latGeo = new THREE.BufferGeometry().setFromPoints(latPts); track(latGeo);
    var latMat = track(new THREE.LineBasicMaterial({ color: 0x7ffcd8, transparent: true, opacity: 0.95 }));
    sunLatRing = new THREE.LineLoop(latGeo, latMat);
    sunLatRing.visible = false;
    earthTilt.add(sunLatRing);

    /* 直射纬线圈的度数标注：挂在 earthTilt、跟圈走；文字按 0.5° 量化刷新 */
    latLabel = makeLabel('0°', 40).sprite;
    latLabel.visible = false;
    latLabel.userData.text = '0°';
    earthTilt.add(latLabel);

    root.add(earthRoot);

    /* 经纬网必须在 earthSpin 已入树之后建：它挂在 earthSpin 下随自转旋转 */
    buildGrid();

    buildSunArrow();
  }

  /* 度数标签换字：canvas 文字只在跨 0.5° 时重画，避免每帧上传纹理。
     播放中 δ 连续变化时每秒最多重画几次，定点后完全静止。 */
  function setLatLabel(text) {
    if (!latLabel || latLabel.userData.text === text) return;
    latLabel.userData.text = text;
    var fresh = makeLabel(text, 40).sprite;
    var old = latLabel;
    var parent = old.parent;
    /* 继承摆放参数（层级 / 显隐由 apply 每帧设定，这里先同步 scale/position） */
    fresh.position.copy(old.position);
    fresh.scale.copy(old.scale);
    fresh.visible = old.visible;
    latLabel = fresh;
    if (parent) parent.add(latLabel);
    if (parent) parent.remove(old);
    if (old.material && old.material.map && typeof old.material.map.dispose === 'function') old.material.map.dispose();
    if (old.material && typeof old.material.dispose === 'function') old.material.dispose();
  }

  /* 度数文本：0.5° 量化，±0.25° 内显示 0°（二分日即赤道） */
  function latDegText(sinD) {
    var deg = Math.asin(sinD > 1 ? 1 : (sinD < -1 ? -1 : sinD)) / DEG;
    var q = Math.round(deg * 2) / 2;
    if (Math.abs(q) < 0.25) return '0°';
    var v = (Math.abs(q)).toFixed(1).replace(/\.0$/, '');
    return v + '°' + (q > 0 ? 'N' : 'S');
  }

  /* 直射光线箭头：细圆柱光束 + 小圆锥头。尺寸与配色参照埃拉托色尼场景的教材红箭头
     （teach-globe-body.js：半径/长度按地球半径取比例、半透明 + fog:false，
     “只求看得清、不抢主体”）；orrery 地球偏小，比例整体放大约 1.8 倍。 */
  function buildSunArrow() {
    ARROW_UP = new THREE.Vector3(0, 1, 0);
    sunArrowDir = new THREE.Vector3();
    arrowMid = new THREE.Vector3();
    arrowQuat = new THREE.Quaternion();

    var grp = new THREE.Group();
    grp.visible = false;

    /* 单位圆柱（沿 Y），半径/长度在 apply 里按地球半径缩放 */
    var beamGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); track(beamGeo);
    var beamMat = track(new THREE.MeshBasicMaterial({
      color: 0xe08070, transparent: true, opacity: 0.62, depthWrite: false, fog: false
    }));
    var beam = new THREE.Mesh(beamGeo, beamMat);
    beam.frustumCulled = false;
    grp.add(beam);

    /* 圆锥头：尖朝 +Y；半径 0.035R、长 0.10R（单位几何，apply 里统一乘 R） */
    var headGeo = new THREE.ConeGeometry(0.035, 0.10, 12); track(headGeo);
    var headMat = track(new THREE.MeshBasicMaterial({ color: 0xe08070, fog: false }));
    var head = new THREE.Mesh(headGeo, headMat);
    head.frustumCulled = false;
    grp.add(head);

    root.add(grp);
    sunArrow = grp;
  }

  function buildMoon() {
    moonRoot = new THREE.Group();
    moonMat = track(bodyMat(0xc9c4bb, 0.92));
    moonMesh = new THREE.Mesh(unitSphere(), moonMat);
    moonRoot.add(moonMesh);
    loadRealTexture('moon', 'moon.jpg', moonMat);
    root.add(moonRoot);

    /* 月球轨道（相对地球，画在 earthRoot 下） */
    var pts = [], n = 128;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    var geo = new THREE.BufferGeometry().setFromPoints(pts); track(geo);
    var mat = track(new THREE.LineBasicMaterial({ color: 0x8fa8c8, transparent: true, opacity: 0.4 }));
    moonOrbitLine = new THREE.LineLoop(geo, mat);
    moonOrbitLine.visible = false;
    earthRoot.add(moonOrbitLine);

    /* 白道面与黄道面的交线就是升交点到降交点的节点线；
       与轨道同属 earthRoot，旋转轨道时节点线仍留在黄道面内。 */
    var nodeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.12, 0, 0), new THREE.Vector3(1.12, 0, 0)
    ]); track(nodeGeo);
    var nodeMat = track(new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 }));
    moonNodeLine = new THREE.Line(nodeGeo, nodeMat);
    moonNodeLine.visible = false;
    earthRoot.add(moonNodeLine);
  }

  /* 太阳平行光线：沿日->地方向的几条平行短线 */
  function buildRays() {
    raysGroup = new THREE.Group();
    var mat = track(new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.75 }));
    for (var i = 0; i < 5; i++) {
      var off = (i - 2) * 0.42;
      var geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(off, 0, 0), new THREE.Vector3(off, 0, 1)
      ]);
      track(geo);
      raysGroup.add(new THREE.Line(geo, mat));
    }
    raysGroup.visible = false;
    root.add(raysGroup);
  }

  function build() {
    tmpSunDir = new THREE.Vector3(1, 0, 0);
    tmpLat = new THREE.Vector3();

    root = new THREE.Group();
    root.visible = false;
    scene.add(root);

    orbitGroup = new THREE.Group();
    markGroup = new THREE.Group();
    root.add(orbitGroup);
    root.add(markGroup);

    buildSun();
    buildOrbit();
    buildEarth();
    buildMoon();
    buildRays();

    built = true;
  }

  /* ============ 位置推算 ============ */

  function lambdaOf(day) { return ((day - SPRING_DAY) / YEAR_DAYS) * 360; }
  function dayOfLambda(lam) { return (lam / 360) * YEAR_DAYS + SPRING_DAY; }

  function applyProfile(p) {
    profile = p;
    sunMesh.scale.setScalar(p.sun);
    sunHalo.scale.setScalar(p.sun * p.halo);
    earthMesh.scale.setScalar(p.earth);
    if (gridGroup) gridGroup.scale.setScalar(p.earth);   /* 经纬网与地球同尺度 */
    moonMesh.scale.setScalar(p.moon);
    earthAxis.scale.setScalar(p.earth * 1.6);
    orbitGroup.scale.setScalar(p.orbit);
    /* 节气标签不放在被缩放的 group 里（否则字号会跟着轨道半径一起放大/缩小到不可见），
       位置按实际轨道半径摆放，屏幕上的大小由 update() 依据相机距离维持。 */
    markGroup.scale.setScalar(1);
    for (var i = 0; i < termLabels.length; i++) {
      var lamF = (135 + i * 15) * DEG;
      termLabels[i].position.set(Math.cos(lamF) * 1.06 * p.orbit, 0, Math.sin(lamF) * 1.06 * p.orbit);
      termLabels[i].userData.aspect = termLabels[i].scale.x / Math.max(termLabels[i].scale.y, 1e-6);
    }
  }

  /* 节气标签按相机距离维持恒定的屏幕占比：真实档下轨道半径是 23481，
     固定世界尺寸会大到糊屏 / 小到看不见，因此必须随相机距离变化。 */
  function updateLabelScale() {
    if (!cam || !markGroup.visible) return;
    var d = cam.position.length();                  // 装置原点即太阳位置
    /* 屏幕占比系数（0.016 → 0.020，约放大 25%）：24 个标签摆在半径 1.06×orbit 的
       圆上，iconic 档相邻间距约 7.8 单位，标签最宽约 2.6（两字），仍有充足余量。 */
    var s = d * 0.020;                              // 目标屏幕占比
    for (var i = 0; i < termLabels.length; i++) {
      var lb = termLabels[i];
      var asp = lb.userData.aspect || 1;
      lb.scale.set(s * asp, s, 1);
    }
  }

  /* ============ 参数应用 ============ */

  function apply(params, scale) {
    if (!built) return;
    params = params || {};
    var p = {}, k;
    /* 外部（步骤 / UI）下发参数时记录复位基线；供 resetMotion 套回 */
    if (!skipBase) {
      base = {};
      for (k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) base[k] = params[k];
      }
    }
    for (k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) p[k] = cur[k]; }
    for (k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k]; }

    /* 节气预设优先：给定 term 就换算出对应的 dayOfYear（保证与轨道刻度严格对齐） */
    if (p.term && TERM_LAMBDA[p.term] !== undefined) {
      p.dayOfYear = dayOfLambda(TERM_LAMBDA[p.term]);
    }
    cur = p;

    curScale = scale || 'real';
    applyProfile(PROFILE[curScale] || PROFILE.real);

    var lamRad = lambdaOf(p.dayOfYear === undefined ? 80 : p.dayOfYear) * DEG;

    /* 太阳方向（世界空间）：与 teach-globe 完全一致 */
    tmpSunDir.set(Math.cos(lamRad), 0, Math.sin(lamRad));
    earthMat.uniforms.uSunDir.value.copy(tmpSunDir);
    moonMat.uniforms.uSunDir.value.copy(tmpSunDir);

    /* 地球：日心黄经 = λ + 180°，位置 = R_orbit * (−cos λ, 0, −sin λ) */
    earthRoot.position.set(-Math.cos(lamRad) * profile.orbit, 0, -Math.sin(lamRad) * profile.orbit);

    /* 地轴倾斜 + 锁定：tiltLocked 为真时朝向不随公转变化（四季成因的关键） */
    var tilt = (p.tiltDeg === undefined ? 66.5 : p.tiltDeg);
    earthTilt.rotation.set(0, 0, 0);
    earthTilt.rotation.x = (90 - tilt) * DEG;
    if (!p.tiltLocked) earthTilt.rotation.y = lamRad;     // 反事实演示：地轴不锁定

    earthSpin.rotation.y = (p.spinDeg || 0) * DEG;

    /* 经纬网显隐：默认画上（与地球仪的 grid 默认值一致），步骤可用 params.grid:false 关掉 */
    if (gridGroup) gridGroup.visible = p.grid !== false;

    /* 直射纬线圈（sunPoint）：δ = asin(sin λ · cos tilt)，与 getSubSolarLatitude 同公式。
       环半径 = R·cosδ、高度 = R·sinδ；春分秋分 δ=0 时就是赤道圈。 */
    var R = profile.earth;
    if (sunLatRing) {
      sunLatRing.visible = !!p.sunPoint;
      var sinD = Math.sin(lamRad) * Math.cos(tilt * DEG);
      var cosD = Math.sqrt(Math.max(0, 1 - sinD * sinD));
      sunLatRing.scale.set(cosD * R * 1.01, 1, cosD * R * 1.01);
      sunLatRing.position.y = sinD * R * 1.01;
    }
    /* 度数标注：文字随圈更新；摆放位置在 update() 里每帧转向相机一侧 */
    if (latLabel) {
      latCosD = cosD; latSinD = sinD;
      setLatLabel(latDegText(sinD));
      latLabel.visible = !!p.sunPoint;
      latLabel.scale.setScalar(R * 0.38);
    }

    /* 月球：方位角 = λ + 180° + (月龄/朔望月)×360°；朔时在日地之间 */
    var phase = p.moonPhaseDay || 0;
    moonTiltDeg = p.moonTiltDeg === undefined ? 5.145 : p.moonTiltDeg;
    var theta = lamRad + Math.PI + (phase / SYNODIC) * Math.PI * 2;
    var moonTilt = moonTiltDeg * DEG;
    moonRoot.position.set(
      earthRoot.position.x + Math.cos(theta) * profile.moonDist,
      Math.sin(theta) * Math.sin(moonTilt) * profile.moonDist,
      earthRoot.position.z + Math.sin(theta) * Math.cos(moonTilt) * profile.moonDist
    );
    /* 潮汐锁定：月球自转周期 = 公转周期，始终同一面朝向地球 */
    moonMesh.rotation.y = theta + Math.PI;

    if (moonOrbitLine) {
      moonOrbitLine.visible = !!p.moonOrbit;
      moonOrbitLine.scale.setScalar(profile.moonDist);
      moonOrbitLine.rotation.x = -moonTilt;
    }
    /* 交点线（白道面与黄道面的交线）单独由 moonNodeLine 控制，不再跟随
       moonOrbit：否则开「月球轨道」会平白多出一根横穿地球的长线，
       容易被误认成太阳光线或地轴。 */
    if (moonNodeLine) {
      moonNodeLine.visible = !!p.moonNodeLine;
      moonNodeLine.scale.setScalar(profile.moonDist);
    }

    /* 平行光线：从太阳侧平行射向地球 */
    raysGroup.visible = !!p.sunRays;
    raysGroup.position.copy(earthRoot.position);
    raysGroup.lookAt(0, 0, 0);
    raysGroup.scale.setScalar(profile.earth * 3.2);

    /* 直射光线箭头（sunPoint）：从地球外 3R 沿日→地方向水平射入，末端落在
       正对太阳的直射纬线圈上；细圆柱光束 + 圆锥头，比例参照教材红箭头。 */
    if (sunArrow) {
      sunArrow.visible = !!p.sunPoint;
      if (p.sunPoint) {
        sunArrowDir.set(Math.cos(lamRad), 0, Math.sin(lamRad));
        var ex = earthRoot.position.x, ey = earthRoot.position.y, ez = earthRoot.position.z;
        var rOut = R * 3.0, rIn = R * 1.02, beamLen = rOut - rIn;
        arrowMid.set(
          ex + sunArrowDir.x * (rOut + rIn) * 0.5,
          ey + sunArrowDir.y * (rOut + rIn) * 0.5,
          ez + sunArrowDir.z * (rOut + rIn) * 0.5
        );
        arrowQuat.setFromUnitVectors(ARROW_UP, sunArrowDir);   /* 尖朝地心 */
        var beam = sunArrow.children[0], head = sunArrow.children[1];
        beam.position.copy(arrowMid);
        beam.quaternion.copy(arrowQuat);
        beam.scale.set(R * 0.015, beamLen, R * 0.015);
        head.position.set(ex + sunArrowDir.x * rIn, ey + sunArrowDir.y * rIn, ez + sunArrowDir.z * rIn);
        head.quaternion.copy(arrowQuat);
        head.scale.setScalar(R);
      }
    }

    /* 节气标注三档：true=24 个全显（二十四节气课）；'major'=仅二分二至（四季成因课）；
       缺省=全隐藏。刻度同步过滤：minor 只在 true 档出现，二分二至刻度在 'major' 档仍显示。 */
    var om = p.orbitMarks;
    markGroup.visible = !!om;
    if (tickSeg) tickSeg.visible = (om === true);
    if (tickMajor) tickMajor.visible = !!om;
    for (var tli = 0; tli < termLabels.length; tli++) {
      termLabels[tli].visible = (om === true) || !!termLabels[tli].userData.isMajor;
    }

    /* 昼夜（不显示晨昏时不压暗夜面） */
    earthMat.uniforms.uNight.value = p.terminator === false ? 0.0 : 0.85;
  }

  /* ============ 对外 ============ */

  return {
    init: function (scn) {
      if (built) return true;
      if (!scn || !window.THREE) return false;
      scene = scn;
      build();
      return true;
    },

    apply: apply,

    update: function (dtSec) {
      if (!built || !root.visible) return;
      if (!cam && SOLAR.Controls && typeof SOLAR.Controls.getControls === 'function') {
        var c0 = SOLAR.Controls.getControls();
        cam = c0 ? c0.object : null;
      }
      updateLabelScale();
      /* 度数标签每帧转到朝向相机的一侧：把相机位置逆变换到 earthTilt 局部系，
         取 XZ 方位角后把标签放在圈上同方位的位置（正对观察者，不再固定 +X 端）。 */
      if (latLabel && latLabel.visible && cam) {
        tmpLat.copy(cam.position);
        earthTilt.worldToLocal(tmpLat);
        var az = Math.atan2(tmpLat.z, tmpLat.x);
        var Rl = profile.earth;
        latLabel.position.set(Math.cos(az) * latCosD * Rl * 1.12, latSinD * Rl * 1.12, Math.sin(az) * latCosD * Rl * 1.12);
      }
      if (!anim.revolve) return;
      var day = (cur.dayOfYear === undefined ? 80 : cur.dayOfYear) + dtSec * 6 * (anim.speed || 1);
      if (day > YEAR_DAYS) day -= YEAR_DAYS;
      /* 月相按同一套教学时间推进：1 个模拟日就推进 1 个月相日，
         因而一年自然经过 YEAR_DAYS / SYNODIC ≈ 12.37 个朔望月。 */
      var phase = (cur.moonPhaseDay || 0) + dtSec * 6 * (anim.speed || 1);
      if (phase > SYNODIC) phase -= SYNODIC;
      if (anim.spin) {
        var spinDeg = ((cur.spinDeg || 0) + dtSec * 5 * (anim.speed || 1)) % 360;
        cur.spinDeg = spinDeg;
      }
      cur.term = null;
      skipBase = true;
      apply({ dayOfYear: day, moonPhaseDay: phase }, curScale);
      skipBase = false;
    },

    setVisible: function (on) {
      if (!built) return;
      root.visible = !!on;
      orbitGroup.visible = !!on;
    },

    setAnim: function (a) {
      if (!a) return;
      if (typeof a.revolve === 'boolean') anim.revolve = a.revolve;
      if (typeof a.spin === 'boolean') anim.spin = a.spin;
      if (typeof a.speed === 'number') anim.speed = a.speed;
    },

    getRoot: function () { return root; },

    getWorldPosition: function (bodyId) {
      if (!built) return null;
      var v = new THREE.Vector3();
      if (bodyId === 'sun') sunMesh.getWorldPosition(v);
      else if (bodyId === 'earth') earthRoot.getWorldPosition(v);
      else if (bodyId === 'moon') moonRoot.getWorldPosition(v);
      else return null;
      return v;
    },

    /* 供界面显示：当前 dayOfYear 对应的太阳直射点纬度（度） */
    getSubSolarLatitude: function () {
      if (!built) return 0;
      var lam = lambdaOf(cur.dayOfYear === undefined ? 80 : cur.dayOfYear) * DEG;
      var tilt = (cur.tiltDeg === undefined ? 66.5 : cur.tiltDeg);
      var s = Math.sin(lam) * Math.cos(tilt * DEG);
      return Math.asin(s > 1 ? 1 : (s < -1 ? -1 : s)) / DEG;
    },

    getTermName: function () {
      if (!built) return '';
      var lam = lambdaOf(cur.dayOfYear === undefined ? 80 : cur.dayOfYear);
      var n = Math.round((lam + 45) / 15);
      n = ((n % 24) + 24) % 24;
      return TERMS[n];
    },

    /* 供教学 UI 定点：把地球移到二分二至位置（春分/夏至/秋分/冬至）。
       只改位置，不动动画开关——是否停住由调用方（teach.js）决定。 */
    goToTerm: function (name) {
      if (!built) return false;
      if (TERM_LAMBDA[name] === undefined) return false;
      cur.term = null;
      skipBase = true;
      apply({ dayOfYear: dayOfLambda(TERM_LAMBDA[name]) }, curScale);
      skipBase = false;
      return true;
    },

    /* 复位教学动画：把 update() 逐帧推进的公转、月相、自转清回步骤基线。
       dayOfYear / moonPhaseDay / spinDeg 都写在 cur 上并被 update() 持续覆盖，
       而步骤数据通常不声明它们，所以必须先清回模块默认，再套回 base；
       否则"复位"只是把当前时刻重画一遍，公转位置回不去。 */
    resetMotion: function () {
      if (!built) return;
      cur.dayOfYear = SPRING_DAY;
      cur.moonPhaseDay = 0;
      cur.spinDeg = 0;
      cur.term = null;
      skipBase = true;
      apply(base, curScale);
      skipBase = false;
    },

    dispose: function () {
      if (!built) return;
      if (root && root.parent) root.parent.remove(root);
      for (var i = 0; i < disposeList.length; i++) {
        try { if (disposeList[i] && typeof disposeList[i].dispose === 'function') disposeList[i].dispose(); } catch (e) { /* 忽略 */ }
      }
      disposeList.length = 0;
      termLabels.length = 0;
      /* latLabel 的 canvas 贴图每次换字都会重建，停在当前引用上 disposal */
      if (latLabel && latLabel.material && latLabel.material.map && typeof latLabel.material.map.dispose === 'function') {
        try { latLabel.material.map.dispose(); } catch (e2) { /* 忽略 */ }
      }
      latLabel = null;
      built = false;
    }
  };
})();
