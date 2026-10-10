/**
 * 教学装置：地球仪（globe）—— 地球仪本体
 * 用途：teach-globe 拆分后的"构建 + 埃拉托色尼"层。负责地球球体与地表/云层着色、
 *       经纬网、地轴、重要经纬线高亮、直射点、极昼极夜球冠、城市标记，以及
 *       埃拉托色尼 7.2° 示意叠加层（平行太阳光 + 地心延长线 + 夹角圆环）。
 *       scene-shaders.js 提供 GLSL 源码；所有 THREE 资源过 SOLAR.TeachGlobeShared.track；
 *       场景图节点 / 临时对象写进 SOLAR.TeachGlobeShared.S（别名 G）。
 *
 * 坐标约定（务必看懂再改）：
 *   - 场景里 Y 轴向上，**黄道面 = XZ 平面（水平）**，太阳全年在这个平面内绕行；
 *   - 地轴（指向北极）相对黄道面倾斜 tiltDeg（教材口径 66.5°），由 tiltGroup 的 X 轴旋转实现；
 *   - 太阳方向 sunDir = (cos λ, 0, sin λ)，λ 为太阳黄经（春分=0，夏至=90°，秋分=180°，冬至=270°）；
 *   - 由此推出太阳赤纬（= 直射点纬度）δ = asin(sin ε · sin λ)，其中黄赤交角 ε = 90° − tiltDeg。
 *
 * 依赖：THREE、SOLAR.TeachGlobeShared（共享注册表）、SOLAR.GlobeShaders（GLSL 源码）、
 *       SOLAR.GlobeScenes.tinyLabel（标签，运行时限定名调用，避免与本模块 makeLabel 形成加载期依赖）。
 *       零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.GlobeBody = (function () {
  'use strict';

  var SH = SOLAR.GlobeShaders;
  var G = SOLAR.TeachGlobeShared.S;

  /* 常量随共享注册表走：本模块内引用只读，不在函数体里改（改请改 shared）。 */
  var DEG = G.DEG;
  var EARTH_R = G.EARTH_R;
  var NIGHT_FACTOR = G.NIGHT_FACTOR;

  /* 仅本模块读写的量：earthMat（其实只喂给 earthMesh 构造）、axis 三兄弟（变量只写不读）、
     eratoRays/eratoRadials/eratoArc/eratoLabel/eratoRayLabel（原 module 级"写没人读"的遗留表），
     照搬保留，删除属行为变更，不发生在纯搬运中。 */
  var earthMat = null;
  var axisNode = null, axisTop = null, axisBottom = null;
  var eratoRays = [], eratoRadials = [];
  var eratoArc = null, eratoLabel = null, eratoRayLabel = null;

  /* 预置城市：真实经纬度（纬度北纬为正，经度东经为正） */
  var CITIES = {
    beijing: { name: '北京', lat: 39.9, lon: 116.4 },
    shanghai: { name: '上海', lat: 31.2, lon: 121.5, labelOffset: [0, 0.02, -0.20], labelSize: 24, labelScale: 0.10 },
    hangzhou: { name: '杭州', lat: 30.3, lon: 120.2 },
    tianjin: { name: '天津', lat: 39.1, lon: 117.2 },
    hongkong: { name: '香港', lat: 22.3, lon: 114.2 },
    sydney: { name: '悉尼', lat: -33.9, lon: 151.2 },
    paris: { name: '巴黎', lat: 48.9, lon: 2.4 },
    london: { name: '伦敦', lat: 51.5, lon: -0.1 },
    newyork: { name: '纽约', lat: 40.7, lon: -74.0 },
    alexandria: { name: '亚历山大', lat: 31.2, lon: 29.9, labelOffset: [0, 0.15, -0.20], labelSize: 24, labelScale: 0.10 },
    syene: { name: '塞尼城', lat: 24.1, lon: 32.9, labelOffset: [0, -0.15, -0.20], labelSize: 24, labelScale: 0.10 }
  };

  /* ============ 工具 ============ */

  /* 加载项目里已有的真实贴图（assets/textures/*.jpg 已内嵌在 textures.js 的 base64 里，
     零额外体积、file:// 直开可用）。key 取自 textures.js 的键名（去扩展名）。
     失败时回退到程序化贴图，保证任何环境下都有画面。 */
  function loadRealTexture(key, fileName, apply) {
    var url = (SOLAR.TEXTURES && SOLAR.TEXTURES[key]) || null;
    if (!url && typeof location !== 'undefined' && location.protocol !== 'file:') {
      url = 'assets/textures/' + fileName;
    }
    if (!url) { apply(null); return; }
    try {
      new THREE.TextureLoader().load(url, function (t) {
        if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        apply(t);
      }, undefined, function () { apply(null); });
    } catch (e) { apply(null); }
  }

  /* 生成一张简化的地表贴图：海洋渐变 + 几块示意性陆地。
     课堂投影只看得出海陆分布即可，不追求地理精度。 */
  function makeEarthTexture() {
    var w = 1024, h = 512;
    var cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    var ctx = cvs.getContext('2d');

    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0d2c4a');
    g.addColorStop(0.5, '#12456e');
    g.addColorStop(1, '#0d2c4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    /* 陆地：几块椭圆，位置大致对应亚欧 / 非洲 / 美洲 / 大洋洲 / 南极 */
    var lands = [
      { x: 0.62, y: 0.30, rx: 0.20, ry: 0.14 },
      { x: 0.52, y: 0.52, rx: 0.10, ry: 0.16 },
      { x: 0.24, y: 0.36, rx: 0.11, ry: 0.16 },
      { x: 0.31, y: 0.62, rx: 0.07, ry: 0.12 },
      { x: 0.78, y: 0.66, rx: 0.06, ry: 0.05 },
      { x: 0.50, y: 0.92, rx: 0.42, ry: 0.07 }
    ];
    ctx.fillStyle = '#4a6b3c';
    for (var i = 0; i < lands.length; i++) {
      var L = lands[i];
      ctx.beginPath();
      ctx.ellipse(L.x * w, L.y * h, L.rx * w, L.ry * h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 沙漠色带，增加层次 */
    ctx.fillStyle = 'rgba(150,130,80,0.35)';
    ctx.fillRect(0, h * 0.36, w, h * 0.06);

    var tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = THREE.RepeatWrapping;
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* 文字标签：CanvasTexture + Sprite（不依赖任何外部字体文件）
     scale 为精灵世界高度；投影场景里标签需要单独调小，否则近距离会糊满半屏。 */
  /* occluded=true 时标签参与深度测试（可被地球本体遮挡）——度数标注需要它，
     否则地球背面的「60°W」会浮在球前面，看着像是贴在屏幕上的。 */
  function makeLabel(text, size, scale, occluded) {
    var pad = 12, fs = size || 44, sc = scale || 0.22;
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
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#eaffff';
    ctx.fillText(text, w / 2, h / 2);

    var tex = new THREE.CanvasTexture(cvs);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({
      map: tex, transparent: true,
      depthTest: !!occluded, depthWrite: false
    });
    var spr = new THREE.Sprite(mat);
    spr.scale.set(w / h * sc, sc, 1);
    return { sprite: spr, texture: tex };
  }

  /* BASIC_VERT / BASIC_FRAG 是地球仪最早版本留下的通用模板，当前没有任何构造点引用，
     已随 GLSL 源码搬迁到 SOLAR.GlobeShaders（SH.BASIC_VERT / SH.BASIC_FRAG），
     在此仅备注去向，不再重复定义。 */

  function basicMat(color, opacity, isLine) {
    if (isLine) return new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity });
    return new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity, depthWrite: false
    });
  }

  /* ============ 构建 ============ */

  function buildEarth() {
    /* 先用程序化贴图兜底（同步可用），真实贴图加载完成后替换 —— 课堂第一眼就能看到
       真实的大陆轮廓，而不是几块示意色块。 */
    G.nodes.sampleTexture = SOLAR.TeachGlobeShared.track(makeEarthTexture());
    G.nodes.earthUniforms = {
      uMap: { value: G.nodes.sampleTexture },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uNight: { value: NIGHT_FACTOR },
      uTermSoft: { value: 0.06 }
    };
    earthMat = SOLAR.TeachGlobeShared.track(new THREE.ShaderMaterial({
      uniforms: G.nodes.earthUniforms, vertexShader: SH.GLOBE_VERT, fragmentShader: SH.GLOBE_FRAG
    }));
    var geo = new THREE.SphereGeometry(EARTH_R, 96, 64);
    SOLAR.TeachGlobeShared.track(geo);
    G.nodes.earthMesh = new THREE.Mesh(geo, earthMat);
    G.nodes.earthMesh.renderOrder = 0;
    G.nodes.spinGroup.add(G.nodes.earthMesh);

    loadRealTexture('earth', 'earth.webp', function (t) {
      if (!t || !G.built) { if (t) t.dispose(); return; }
      var old = G.nodes.sampleTexture;
      G.nodes.sampleTexture = t;
      G.nodes.earthUniforms.uMap.value = t;
      if (old) old.dispose();
    });

    buildClouds();
  }
  /* 云层：地球仪上最有辨识度的一层，缺了它一眼就看出是占位图。
     用内嵌的 earth_clouds.png（白色云 + alpha 遮罩），略大于地表球。 */
  function buildClouds() {
    var geo = new THREE.SphereGeometry(EARTH_R * 1.012, 72, 48);
    SOLAR.TeachGlobeShared.track(geo);
    var mat = SOLAR.TeachGlobeShared.track(new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uSunDir: G.nodes.earthUniforms.uSunDir,        // 共享引用：地表昼夜变化时云层自动跟随
        uNight: { value: 0.9 }
      },
      vertexShader: SH.GLOBE_VERT, fragmentShader: SH.CLOUD_FRAG,
      transparent: true, depthWrite: false
    }));
    G.nodes.cloudMesh = new THREE.Mesh(geo, mat);
    G.nodes.cloudMesh.renderOrder = 1;
    G.nodes.spinGroup.add(G.nodes.cloudMesh);

    loadRealTexture('earth_clouds', 'earth_clouds.webp', function (t) {
      if (!t || !G.built) { if (t) t.dispose(); return; }
      G.nodes.cloudTexture = t;
      mat.uniforms.uMap.value = t;
    });
  }

  /* 经纬网（细线）。经线每 step 度一条（半圆弧），纬线同理。 */
  function buildGrid(step) {
    G.nodes.gridStep = step || 15;
    var V = [], i, j, lat, lon;
    var segments = 64;

    /* 纬线 */
    for (lat = -90 + step; lat < 90; lat += step) {
      var rl = EARTH_R * Math.cos(lat * DEG);
      var yl = EARTH_R * Math.sin(lat * DEG);
      for (i = 0; i < segments; i++) {
        for (j = 0; j < 2; j++) {
          var a = (i + j) / segments * Math.PI * 2;
          V.push(rl * Math.cos(a), yl, rl * Math.sin(a));
        }
      }
    }
    /* 经线：半圆弧，longitude 每 step 度一条 */
    for (lon = 0; lon < 180; lon += step) {
      var cl = Math.cos(lon * DEG), sl = Math.sin(lon * DEG);
      for (i = 0; i < segments; i++) {
        for (j = 0; j < 2; j++) {
          var t = (i + j) / segments * Math.PI;     // 0..π：从北极到南极
          var yy = EARTH_R * Math.cos(t);
          var rr = EARTH_R * Math.sin(t);
          V.push(rr * cl, yy, rr * sl);
        }
      }
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V), 3));
    SOLAR.TeachGlobeShared.track(geo);
    var mat = SOLAR.TeachGlobeShared.track(basicMat(0x9fd8ff, 0.30, true));
    var lines = new THREE.LineSegments(geo, mat);
    G.nodes.gridGroup.add(lines);
    G.nodes.gridLines.push(lines);
  }

  /* 重要经纬线的材质：受光（Lambert）+ 低强度自发光保底。
     纯自发光的基本材质在亮面与暗面同样亮度、且管径均匀，看着像荧光棒；
     受光后线条随球面光照产生明暗过渡，与地球是一体的；暗面仍有
     emissive 保底，不至于整段消失。外圈再叠一层更粗的加性淡晕，
     让线有辉光层次，而不是一根实心塑料棒。 */
  function hlMat(color) {
    return SOLAR.TeachGlobeShared.track(new THREE.MeshLambertMaterial({
      color: color, emissive: color, emissiveIntensity: 0.30,
      transparent: true, opacity: 0.95, depthWrite: false, fog: false
    }));
  }

  function hlGlowMat(color) {
    return SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.15,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
  }

  /* 重要经纬线：单独一份，每条都可开关，用 Torus（有粗度）绘制以便在投影上看得清。
     配色走低饱和的制图色（暖白 / 琥珀 / 淡青 / 陶土橙），替代原来的高饱和荧光色。 */
  function buildHighlights() {
    addHlCircle('equator', 0, 0xffe3b0);
    addHlCircle('tropic_n', 23.5, 0xf0b95c);
    addHlCircle('tropic_s', -23.5, 0xf0b95c);
    addHlCircle('polar_n', 66.5, 0x9fd0ff);
    addHlCircle('polar_s', -66.5, 0x9fd0ff);
    /* 30°、60°：与 0°/23.5°/66.5° 一起构成教材图 3.1-9 的「主要纬线」 */
    addHlCircle('lat30_n', 30, 0x9fd0ff);
    addHlCircle('lat30_s', -30, 0x9fd0ff);
    addHlCircle('lat60_n', 60, 0x9fd0ff);
    addHlCircle('lat60_s', -60, 0x9fd0ff);
    /* 本初子午线整根用薄荷青（与陶土橙的其余经线形成冷暖对比），
       不加粗——加粗后看着像一条描边轮廓，不像经线本身。 */
    addHlMeridian('meridian0', 0, 0x4fe0b8);
    addHlMeridian('meridian180', 180, 0xe0907f);
    /* 其余主要经线每 20° 一条（教材图 3.1-10 的经度间隔），东经与西经对称 */
    var MER = [20, 40, 60, 80, 100, 120, 140, 160, -20, -40, -60, -80, -100, -120, -140, -160];
    for (var mi = 0; mi < MER.length; mi++) {
      addHlMeridian('meridian' + MER[mi], MER[mi], 0xe0907f);
    }
    addHlMeridian('ew_boundary_a', -20, 0xb9a8e8);
    addHlMeridian('ew_boundary_b', 160, 0xb9a8e8);
  }

  function addHlCircle(key, latDeg, color) {
    var rl = EARTH_R * Math.cos(latDeg * DEG) * 1.004;
    var grp = new THREE.Group();
    var core = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(rl, EARTH_R * 0.0055, 8, 128)), hlMat(color));
    var glow = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(rl, EARTH_R * 0.016, 8, 128)), hlGlowMat(color));
    core.renderOrder = 2;
    glow.renderOrder = 1;
    grp.add(core);
    grp.add(glow);
    grp.rotation.x = -Math.PI / 2;
    grp.position.y = EARTH_R * Math.sin(latDeg * DEG) * 1.004;
    grp.visible = false;
    G.nodes.hlGroup.add(grp);
    G.nodes.hlNodes[key] = grp;
  }

  function addHlMeridian(key, lonDeg, color, thick) {
    var t = thick || 0.0055;
    var grp = new THREE.Group();
    var core = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(EARTH_R * 1.004, EARTH_R * t, 8, 96, Math.PI * 2)), hlMat(color));
    var glow = new THREE.Mesh(SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(EARTH_R * 1.004, EARTH_R * t * 2.9, 8, 96, Math.PI * 2)), hlGlowMat(color));
    core.renderOrder = 2;
    glow.renderOrder = 1;
    grp.add(core);
    grp.add(glow);
    /* Torus 默认在 XY 平面；绕 Y 轴转到该经度所在平面 */
    grp.rotation.y = lonDeg * DEG;
    grp.visible = false;
    G.nodes.hlGroup.add(grp);
    G.nodes.hlNodes[key] = grp;
  }

  function buildAxis() {
    var len = EARTH_R * 2.7;
    var geo = new THREE.CylinderGeometry(EARTH_R * 0.012, EARTH_R * 0.012, len, 12);
    SOLAR.TeachGlobeShared.track(geo);
    var mat = SOLAR.TeachGlobeShared.track(basicMat(0xffffff, 0.85, false));
    axisNode = new THREE.Mesh(geo, mat);
    G.nodes.axisGroup.add(axisNode);

    var top = makeLabel('N', 40); SOLAR.TeachGlobeShared.track(top.texture);
    top.sprite.position.set(0, len * 0.5 + EARTH_R * 0.12, 0);
    G.nodes.axisGroup.add(top.sprite);
    axisTop = top.sprite;

    var bot = makeLabel('S', 40); SOLAR.TeachGlobeShared.track(bot.texture);
    bot.sprite.position.set(0, -len * 0.5 - EARTH_R * 0.12, 0);
    G.nodes.axisGroup.add(bot.sprite);
    axisBottom = bot.sprite;
  }

  /* 直射点标记：整组绕 OKgroup 旋转，使 +Y 对准太阳方向。
     构造约定：小球在 y=R，连杆中心在 y=R/2，标签在 y=1.15R，组原点在球心。 */
  function buildSunPoint() {
    G.nodes.pointGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.pointGroup);

    var dotGeo = new THREE.SphereGeometry(EARTH_R * 0.055, 16, 12);
    SOLAR.TeachGlobeShared.track(dotGeo);
    var dotMat = SOLAR.TeachGlobeShared.track(basicMat(0xffe066, 1.0, false));
    var dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.y = EARTH_R * 1.02;
    dot.renderOrder = 3;
    G.nodes.pointGroup.add(dot);

    var rodGeo = new THREE.CylinderGeometry(EARTH_R * 0.008, EARTH_R * 0.008, EARTH_R, 8);
    SOLAR.TeachGlobeShared.track(rodGeo);
    var rodMat = SOLAR.TeachGlobeShared.track(basicMat(0xffe066, 0.8, false));
    var rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.y = EARTH_R * 0.5;
    G.nodes.pointGroup.add(rod);

    var lb = makeLabel('直射点', 36); SOLAR.TeachGlobeShared.track(lb.texture);
    lb.sprite.position.set(0, EARTH_R * 1.18, 0);
    G.nodes.pointGroup.add(lb.sprite);

    G.nodes.sunPointNode = G.nodes.pointGroup;
    G.nodes.pointGroup.visible = false;
  }

  /* 极昼/极夜：球冠（thetaStart=0 即从北极开始的一顶帽子） */
  function buildPolarCaps() {
    G.nodes.polarDayNode = makeCap(0xffe9a8, 0.42);
    G.nodes.polarNightNode = makeCap(0x2a3a8a, 0.45);
    G.nodes.polarGroup.add(G.nodes.polarDayNode);
    G.nodes.polarGroup.add(G.nodes.polarNightNode);
    G.nodes.polarDayNode.visible = false;
    G.nodes.polarNightNode.visible = false;
  }

  function makeCap(color, opacity) {
    var geo = new THREE.SphereGeometry(EARTH_R * 1.012, 64, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    SOLAR.TeachGlobeShared.track(geo);
    var mat = SOLAR.TeachGlobeShared.track(basicMat(color, opacity, false));
    var m = new THREE.Mesh(geo, mat);
    m.renderOrder = 1;
    return m;
  }

  function buildCities() {
    for (var id in CITIES) {
      if (!Object.prototype.hasOwnProperty.call(CITIES, id)) continue;
      var c = CITIES[id];
      var g = new THREE.Group();
      computeCityPosition(g.position, c.lat, c.lon);

      var dotGeo = new THREE.SphereGeometry(EARTH_R * 0.020, 12, 10);
      SOLAR.TeachGlobeShared.track(dotGeo);
      var dotMat = SOLAR.TeachGlobeShared.track(basicMat(0xff6b6b, 1.0, false));
      var dot = new THREE.Mesh(dotGeo, dotMat);
      dot.renderOrder = 4;
      g.add(dot);

      var lb = makeLabel(c.name, c.labelSize || 30, c.labelScale || 0.13); SOLAR.TeachGlobeShared.track(lb.texture);
      var lo = c.labelOffset || [0, 0, 0];
      lb.sprite.position.set(lo[0], EARTH_R * 0.13 + lo[1], lo[2]);
      g.add(lb.sprite);

      g.visible = false;
      G.nodes.cityGroup.add(g);
      G.nodes.cityNodes[id] = { group: g, label: lb.sprite };
    }
  }

  /* 经纬度 -> 单位球面上的点。
     约定必须与 buildGrid / addHlMeridian / SphereGeometry 的 UV 完全一致：
       - 经度 0° 落在 +X 轴（与 buildGrid 的 x=cos(lon), z=sin(lon) 同源）
       - 东经为正，绕 Y 轴朝 -Z 方向增大
     之前这里写成 x=sin(lon), z=cos(lon)（经度 0 落在 +Z），
     与等距柱状贴图的 u=0.5（经度 0）差了 90°，导致所有城市标记偏离实际海岸线。 */
  function computeCityPosition(out, latDeg, lonDeg) {
    var phi = latDeg * DEG, theta = lonDeg * DEG;
    var r = EARTH_R * 1.02;
    out.set(r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi), -r * Math.cos(phi) * Math.sin(theta));
    return out;
  }
  function eratoBeamGeo() {
    if (!G.tmp.ERATO_UP) G.tmp.ERATO_UP = new THREE.Vector3(0, 1, 0);
    if (!G.tmp.eratoQuat) { G.tmp.eratoQuat = new THREE.Quaternion(); G.tmp.eratoMat = new THREE.Matrix4(); }
    if (!G.tmp.eratoMid) { G.tmp.eratoMid = new THREE.Vector3(); G.tmp.eratoDir = new THREE.Vector3(); }
    if (!G.tmp.eratoX) { G.tmp.eratoX = new THREE.Vector3(); G.tmp.eratoY = new THREE.Vector3(); G.tmp.eratoZ = new THREE.Vector3(); }
    return new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  }

  function eratoBeam(color) {
    var geo = SOLAR.TeachGlobeShared.track(eratoBeamGeo());
    var mat = SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.62, depthWrite: false, fog: false
    }));
    var m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  /* 把单位圆柱摆到 a→b 上 */
  function setEratoBeam(mesh, a, b, radius) {
    G.tmp.eratoMid.copy(a).add(b).multiplyScalar(0.5);
    G.tmp.eratoDir.copy(b).sub(a);
    var len = G.tmp.eratoDir.length();
    if (len < 1e-6) { mesh.visible = false; return; }
    G.tmp.eratoDir.multiplyScalar(1 / len);
    mesh.visible = true;
    mesh.position.copy(G.tmp.eratoMid);
    mesh.quaternion.setFromUnitVectors(G.tmp.ERATO_UP, G.tmp.eratoDir);
    mesh.scale.set(radius, len, radius);
  }

  function eratoDashed(color) {
    var geo = SOLAR.TeachGlobeShared.track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    /* depthTest=false：半径线画在球体之上，等效教材里的剖面图，
       否则从地心到球面这一段会被不透明地球完全挡住，看不出“延长线”。 */
    var mat = SOLAR.TeachGlobeShared.track(new THREE.LineDashedMaterial({
      color: color, dashSize: EARTH_R * 0.075, gapSize: EARTH_R * 0.05,
      transparent: true, opacity: 1.0, depthTest: false, depthWrite: false
    }));
    var line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.renderOrder = 6;
    return line;
  }

  function setEratoLine(line, a, b) {
    var pos = line.geometry.getAttribute('position');
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    if (line.geometry.computeBoundingSphere) line.geometry.computeBoundingSphere();
  }

  function buildEratosthenes() {
    G.nodes.eratoGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.eratoGroup);
    G.nodes.radialGroup = new THREE.Group();
    G.nodes.spinGroup.add(G.nodes.radialGroup);

    /* ---- 地心标记：两条地心半径线的交点（教材图「地球的中心」）---- */
    var coreDot = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.SphereGeometry(EARTH_R * 0.045, 14, 12)),
      SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({ color: 0xff6b6b, fog: false }))
    );
    coreDot.renderOrder = 5;
    G.nodes.radialGroup.add(coreDot);
    var lbCore = SOLAR.GlobeScenes.tinyLabel('地心');
    lbCore.position.set(0, -EARTH_R * 0.20, 0);
    G.nodes.radialGroup.add(lbCore);

    /* ---- 竖井与直杆：固定在 spinGroup（与城市同一局部系，随地球转动）----
       教材图 3.1-6：塞尼城的竖井（阳光直射井底）与亚历山大的直杆。
       两者都沿当地法线方向：圆柱默认沿 +Y，用 setFromUnitVectors 对齐。 */
    var Y_AXIS = new THREE.Vector3(0, 1, 0);
    function surfaceAlign(latDeg, lonDeg) {
      var pos = new THREE.Vector3();
      computeCityPosition(pos, latDeg, lonDeg);
      var normal = pos.clone().normalize();
      var q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, normal);
      return { pos: pos, normal: normal, q: q };
    }

    var sy = surfaceAlign(CITIES.syene.lat, CITIES.syene.lon);
    /* 竖井：暗色圆管嵌入地表以下，井底向地心方向 */
    var well = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(EARTH_R * 0.014, EARTH_R * 0.014, EARTH_R * 0.20, 10)),
      SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({ color: 0x0a1c26, fog: false }))
    );
    well.quaternion.copy(sy.q);
    well.position.copy(sy.normal).multiplyScalar(EARTH_R * (1.0 - 0.10));
    G.nodes.radialGroup.add(well);
    /* 井中阳光：亮黄细柱沿法线从井口向外伸出，示意「阳光直射井底」 */
    var wellLight = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(EARTH_R * 0.007, EARTH_R * 0.007, EARTH_R * 0.26, 8)),
      SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({ color: 0xf2d9a4, transparent: true, opacity: 0.62, depthWrite: false, fog: false }))
    );
    wellLight.quaternion.copy(sy.q);
    wellLight.position.copy(sy.normal).multiplyScalar(EARTH_R * 1.13);
    G.nodes.radialGroup.add(wellLight);

    var al = surfaceAlign(CITIES.alexandria.lat, CITIES.alexandria.lon);
    /* 直杆：竖立在亚历山大地表的米色细杆 */
    var gnomon = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.CylinderGeometry(EARTH_R * 0.008, EARTH_R * 0.010, EARTH_R * 0.17, 8)),
      SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({ color: 0xf4e6c8, fog: false }))
    );
    gnomon.quaternion.copy(al.q);
    gnomon.position.copy(al.normal).multiplyScalar(EARTH_R * 1.085);
    G.nodes.radialGroup.add(gnomon);

    /* ---- 平行太阳光：方向锁定为塞尼城法线（竖井向外延长）----
       教材图 3.1-6：一条光线沿竖井直射井底，另一条与它平行、擦过亚历山大
       直杆的最高顶点；两条光线与两城竖直方向的夹角差 = 地心角 7.2°（同位角）。
       光线与竖井/直杆同挂 spinGroup（radialGroup），随地球转动，构建时静态摆好——
       方向由史实条件（夏至正午阳光直射塞尼）给定，不由场景太阳方向决定。 */
    var sunDir = sy.normal.clone();
    var beamR = EARTH_R * 0.008;     /* 教材里是细红线：只求看得清，不抢主体 */
    var rayA = new THREE.Vector3(), rayB = new THREE.Vector3();

    /* 光线 1：沿竖井向外延长（太空 → 井口），长度约 1.1R */
    var beamSy = eratoBeam(0xe08070);
    G.nodes.radialGroup.add(beamSy);
    rayA.copy(sy.normal).multiplyScalar(EARTH_R * 2.10);
    rayB.copy(sy.normal).multiplyScalar(EARTH_R * 1.02);
    setEratoBeam(beamSy, rayA, rayB, beamR);
    eratoRays.push({ mesh: beamSy, id: 'syene' });

    /* 光线 2：与光线 1 平行，经过亚历山大直杆的最高顶点 */
    var gnomonTip = al.normal.clone().multiplyScalar(EARTH_R * 1.17);
    var beamAl = eratoBeam(0xe08070);
    G.nodes.radialGroup.add(beamAl);
    rayA.copy(gnomonTip).addScaledVector(sunDir, EARTH_R * 1.40);
    rayB.copy(gnomonTip).addScaledVector(sunDir, -EARTH_R * 0.10);
    setEratoBeam(beamAl, rayA, rayB, beamR);
    eratoRays.push({ mesh: beamAl, id: 'alexandria' });

    /* 阳光传播方向箭头（尖朝地球 = -sunDir，同教材红色箭头） */
    var arrowGeo = SOLAR.TeachGlobeShared.track(new THREE.ConeGeometry(EARTH_R * 0.026, EARTH_R * 0.070, 10));
    var arrowMat = SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({ color: 0xe08070, fog: false }));
    var arrowQ = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, sunDir.clone().negate());
    var arrow1 = new THREE.Mesh(arrowGeo, arrowMat);
    arrow1.position.copy(sy.normal).multiplyScalar(EARTH_R * 1.85);
    arrow1.quaternion.copy(arrowQ);
    G.nodes.radialGroup.add(arrow1);
    var arrow2 = new THREE.Mesh(arrowGeo, arrowMat);
    arrow2.position.copy(gnomonTip).addScaledVector(sunDir, EARTH_R * 0.95);
    arrow2.quaternion.copy(arrowQ);
    G.nodes.radialGroup.add(arrow2);

    /* 地心延长虚线：地心 → 两城方向 ×1.70R（depthTest 关闭，等效教材剖面图） */
    var ids = ['alexandria', 'syene'];
    for (var i = 0; i < ids.length; i++) {
      var radial = eratoDashed(0xbfe9ff);
      G.nodes.radialGroup.add(radial);
      eratoRadials.push({ line: radial, id: ids[i] });
      var rNode = G.nodes.cityNodes[ids[i]];
      var eB = rNode
        ? rNode.group.position.clone().normalize().multiplyScalar(EARTH_R * 1.70)
        : new THREE.Vector3(0, EARTH_R * 1.70, 0);
      setEratoLine(radial, new THREE.Vector3(0, 0, 0), eB);
      radial.computeLineDistances();
    }

    /* 夹角圆环与 7.2° 标签：静态（两城在 spin 局部系位置固定） */
    var na = G.nodes.cityNodes.alexandria ? G.nodes.cityNodes.alexandria.group.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
    var nb = G.nodes.cityNodes.syene ? G.nodes.cityNodes.syene.group.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
    /* 弧半径 0.40R：靠近地心，让 7.2° 夹角看起来是「从中心张开的角度」 */
    eratoArc = new THREE.Mesh(
      SOLAR.TeachGlobeShared.track(new THREE.TorusGeometry(EARTH_R * 0.40, EARTH_R * 0.014, 8, 28, na.angleTo(nb))),
      SOLAR.TeachGlobeShared.track(new THREE.MeshBasicMaterial({
        color: 0xf2d9a4, transparent: true, opacity: 0.75,
        depthTest: false, depthWrite: false, fog: false
      }))
    );
    eratoArc.frustumCulled = false;
    eratoArc.renderOrder = 7;
    G.nodes.radialGroup.add(eratoArc);

    /* 圆环平面：+X 对准亚历山大方向，法线对齐两城方向张成的平面法向 */
    G.tmp.eratoX.copy(na);
    G.tmp.eratoZ.copy(na).cross(nb);
    if (G.tmp.eratoZ.lengthSq() < 1e-8) G.tmp.eratoZ.set(0, 0, 1); else G.tmp.eratoZ.normalize();
    G.tmp.eratoY.copy(G.tmp.eratoZ).cross(G.tmp.eratoX).normalize();
    G.tmp.eratoMat.makeBasis(G.tmp.eratoX, G.tmp.eratoY, G.tmp.eratoZ);
    eratoArc.quaternion.setFromRotationMatrix(G.tmp.eratoMat);

    var lb = makeLabel('圆的 1/50（7.2°）', 26, 0.12); SOLAR.TeachGlobeShared.track(lb.texture);
    eratoLabel = lb.sprite;
    eratoLabel.position.copy(na).add(nb).normalize().multiplyScalar(EARTH_R * 0.52);
    G.nodes.radialGroup.add(eratoLabel);

    /* 「平行太阳光」标签：放在亚历山大光线的太空段旁 */
    var lbRay = makeLabel('平行太阳光', 24, 0.11); SOLAR.TeachGlobeShared.track(lbRay.texture);
    eratoRayLabel = lbRay.sprite;
    eratoRayLabel.position.copy(gnomonTip)
      .addScaledVector(sunDir, EARTH_R * 1.12)
      .add(new THREE.Vector3(0, EARTH_R * 0.09, 0));
    G.nodes.radialGroup.add(eratoRayLabel);

    var lbWell = SOLAR.GlobeScenes.tinyLabel('塞尼城的竖井');
    lbWell.position.copy(sy.normal).multiplyScalar(EARTH_R * 1.34);
    G.nodes.radialGroup.add(lbWell);

    var lbRod = SOLAR.GlobeScenes.tinyLabel('亚历山大的直杆');
    lbRod.position.copy(al.normal).multiplyScalar(EARTH_R * 1.34);
    G.nodes.radialGroup.add(lbRod);

    G.nodes.eratoGroup.visible = false;
    G.nodes.radialGroup.visible = false;
  }

  /* 埃拉托色尼叠加层已全部静态化（光线方向锁定塞尼法线、与竖井/直杆同挂
     spinGroup），无需随太阳方向或自转逐帧更新——build 时一次摆好。 */

  /* ============ 对外（内部装配用，不对外承诺） ============ */

  return {
    buildEarth: buildEarth,
    buildClouds: buildClouds,
    buildGrid: buildGrid,
    hlMat: hlMat,
    hlGlowMat: hlGlowMat,
    buildHighlights: buildHighlights,
    addHlCircle: addHlCircle,
    addHlMeridian: addHlMeridian,
    buildAxis: buildAxis,
    buildSunPoint: buildSunPoint,
    buildPolarCaps: buildPolarCaps,
    makeCap: makeCap,
    buildCities: buildCities,
    computeCityPosition: computeCityPosition,
    eratoBeamGeo: eratoBeamGeo,
    eratoBeam: eratoBeam,
    setEratoBeam: setEratoBeam,
    eratoDashed: eratoDashed,
    setEratoLine: setEratoLine,
    buildEratosthenes: buildEratosthenes,
    loadRealTexture: loadRealTexture,
    makeLabel: makeLabel,
    basicMat: basicMat
  };
})();
