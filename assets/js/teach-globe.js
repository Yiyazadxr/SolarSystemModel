/**
 * 教学装置之一：地球仪（globe）
 * 用途：七年级「地球与地球仪」「时差与节气」两节的课堂演示。
 *       一个大地球 + 经纬网 + 地轴 + 重要经纬线高亮 + 晨昏线 + 太阳直射点 + 城市标记 + 极昼极夜区域。
 *
 * 坐标约定（务必看懂再改）：
 *   - 场景里 Y 轴向上，**黄道面 = XZ 平面（水平）**，太阳全年在这个平面内绕行；
 *   - 地轴（指向北极）相对黄道面倾斜 tiltDeg（教材口径 66.5°），由 tiltGroup 的 X 轴旋转实现；
 *   - 太阳方向 sunDir = (cos λ, 0, sin λ)，λ 为太阳黄经（春分=0，夏至=90°，秋分=180°，冬至=270°）；
 *   - 由此推出太阳赤纬（= 直射点纬度）δ = asin(sin ε · sin λ)，其中黄赤交角 ε = 90° − tiltDeg；
 *     本文件实际用 dot(sunDir, 地轴) 求 δ，两者等价，且天然支持 tiltDeg=90 的"假设地轴不倾斜"反事实演示。
 *
 * 依赖：仅 THREE 与 SOLAR.CONFIG。零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachGlobe = (function () {
  'use strict';

  var DEG = Math.PI / 180;
  var EARTH_R = 1;            // 基准显示半径（real 档），iconic 档会放大
  var NIGHT_FACTOR = 0.82;    // 夜半球压暗程度

  var built = false;
  var scene = null;
  var root = null, tiltGroup = null, spinGroup = null;
  var earthMesh = null, earthMat = null;
  var earthUniforms = null;
  var gridGroup = null, hlGroup = null, axisGroup = null;
  var pointGroup = null, cityGroup = null, polarGroup = null;
  var sampleTexture = null, cloudMesh = null, cloudTexture = null;

  var gridLines = [];          // 普通经纬网（细线）
  var gridStep = 15;
  var hlNodes = {};            // 重要经纬线（加粗）key -> Object3D
  var cityNodes = {};          // id -> { marker, label }
  var axisNode = null, axisTop = null, axisBottom = null;
  var sunPointNode = null;
  var polarDayNode = null, polarNightNode = null;

  /* 埃拉托色尼示意叠加层：平行太阳光 + 地心延长线 + 7.2° 弧 */
  var eratoGroup = null, radialGroup = null;
  var eratoRays = [], eratoRadials = [];
  var eratoArc = null, eratoLabel = null, eratoRayLabel = null;

  var anim = { spin: false, revolve: false, playing: false, speed: 1 };
  var cur = {};                // 上一次生效的 params（缺省字段沿用）
  var curScale = 'real';
  var disposeList = [];
  /* 复用的临时对象：避免逐个构造（项目整体遵循"逐帧零 new"） */
  var UP_Y = null, tiltInverse = null, tmpEuler = null;

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

  function track(obj) { disposeList.push(obj); return obj; }

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

  var BASIC_VERT = [
    'void main(){',
    '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var BASIC_FRAG = [
    'uniform vec3 uColor; uniform float uOpacity;',
    'void main(){ gl_FragColor = vec4(uColor, uOpacity); }'
  ].join('\n');

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
    sampleTexture = track(makeEarthTexture());
    earthUniforms = {
      uMap: { value: sampleTexture },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uNight: { value: NIGHT_FACTOR },
      uTermSoft: { value: 0.06 }
    };
    earthMat = track(new THREE.ShaderMaterial({
      uniforms: earthUniforms, vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG
    }));
    var geo = new THREE.SphereGeometry(EARTH_R, 96, 64);
    track(geo);
    earthMesh = new THREE.Mesh(geo, earthMat);
    earthMesh.renderOrder = 0;
    spinGroup.add(earthMesh);

    loadRealTexture('earth', 'earth.jpg', function (t) {
      if (!t || !built) { if (t) t.dispose(); return; }
      var old = sampleTexture;
      sampleTexture = t;
      earthUniforms.uMap.value = t;
      if (old) old.dispose();
    });

    buildClouds();
  }

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

  /* 云层：地球仪上最有辨识度的一层，缺了它一眼就看出是占位图。
     用内嵌的 earth_clouds.png（白色云 + alpha 遮罩），略大于地表球。 */
  function buildClouds() {
    var geo = new THREE.SphereGeometry(EARTH_R * 1.012, 72, 48);
    track(geo);
    var mat = track(new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uSunDir: earthUniforms.uSunDir,        // 共享引用：地表昼夜变化时云层自动跟随
        uNight: { value: 0.9 }
      },
      vertexShader: GLOBE_VERT, fragmentShader: CLOUD_FRAG,
      transparent: true, depthWrite: false
    }));
    cloudMesh = new THREE.Mesh(geo, mat);
    cloudMesh.renderOrder = 1;
    spinGroup.add(cloudMesh);

    loadRealTexture('earth_clouds', 'earth_clouds.png', function (t) {
      if (!t || !built) { if (t) t.dispose(); return; }
      cloudTexture = t;
      mat.uniforms.uMap.value = t;
    });
  }

  /* 经纬网（细线）。经线每 step 度一条（半圆弧），纬线同理。 */
  function buildGrid(step) {
    gridStep = step || 15;
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
    track(geo);
    var mat = track(basicMat(0x9fd8ff, 0.30, true));
    var lines = new THREE.LineSegments(geo, mat);
    gridGroup.add(lines);
    gridLines.push(lines);
  }

  /* 重要经纬线：单独一份，每条都可开关，用 Torus（有粗度）绘制以便在投影上看得清 */
  function buildHighlights() {
    addHlCircle('equator', 0, 0x7ffcd8);
    addHlCircle('tropic_n', 23.5, 0xffd479);
    addHlCircle('tropic_s', -23.5, 0xffd479);
    addHlCircle('polar_n', 66.5, 0x9fb8ff);
    addHlCircle('polar_s', -66.5, 0x9fb8ff);
    /* 30°、60°：与 0°/23.5°/66.5° 一起构成教材图 3.1-9 的「主要纬线」 */
    addHlCircle('lat30_n', 30, 0x9fb8ff);
    addHlCircle('lat30_s', -30, 0x9fb8ff);
    addHlCircle('lat60_n', 60, 0x9fb8ff);
    addHlCircle('lat60_s', -60, 0x9fb8ff);
    /* 本初子午线：换颜色 + 加粗，一眼能从其余经线里认出来 */
    addHlMeridian('meridian0', 0, 0x7ffcd8, 0.013);
    addHlMeridian('meridian180', 180, 0xff8f8f);
    /* 其余主要经线每 20° 一条（教材图 3.1-10 的经度间隔），东经与西经对称 */
    var MER = [20, 40, 60, 80, 100, 120, 140, 160, -20, -40, -60, -80, -100, -120, -140, -160];
    for (var mi = 0; mi < MER.length; mi++) {
      addHlMeridian('meridian' + MER[mi], MER[mi], 0xff8f8f);
    }
    addHlMeridian('ew_boundary_a', -20, 0xd0a0ff);
    addHlMeridian('ew_boundary_b', 160, 0xd0a0ff);
  }

  function addHlCircle(key, latDeg, color) {
    var rl = EARTH_R * Math.cos(latDeg * DEG) * 1.004;
    var geo = new THREE.TorusGeometry(rl, EARTH_R * 0.006, 8, 128);
    track(geo);
    var mat = track(basicMat(color, 0.95, false));
    var m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = EARTH_R * Math.sin(latDeg * DEG) * 1.004;
    m.visible = false;
    m.renderOrder = 2;
    hlGroup.add(m);
    hlNodes[key] = m;
  }

  function addHlMeridian(key, lonDeg, color, thick) {
    var geo = new THREE.TorusGeometry(EARTH_R * 1.004, EARTH_R * (thick || 0.006), 8, 96, Math.PI * 2);
    track(geo);
    var mat = track(basicMat(color, 0.95, false));
    var m = new THREE.Mesh(geo, mat);
    /* Torus 默认在 XY 平面；绕 Y 轴转到该经度所在平面 */
    m.rotation.y = lonDeg * DEG;
    m.visible = false;
    m.renderOrder = 2;
    hlGroup.add(m);
    hlNodes[key] = m;
  }

  function buildAxis() {
    var len = EARTH_R * 2.7;
    var geo = new THREE.CylinderGeometry(EARTH_R * 0.012, EARTH_R * 0.012, len, 12);
    track(geo);
    var mat = track(basicMat(0xffffff, 0.85, false));
    axisNode = new THREE.Mesh(geo, mat);
    axisGroup.add(axisNode);

    var top = makeLabel('N', 40); track(top.texture);
    top.sprite.position.set(0, len * 0.5 + EARTH_R * 0.12, 0);
    axisGroup.add(top.sprite);
    axisTop = top.sprite;

    var bot = makeLabel('S', 40); track(bot.texture);
    bot.sprite.position.set(0, -len * 0.5 - EARTH_R * 0.12, 0);
    axisGroup.add(bot.sprite);
    axisBottom = bot.sprite;
  }

  /* 直射点标记：整组绕 OKgroup 旋转，使 +Y 对准太阳方向。
     构造约定：小球在 y=R，连杆中心在 y=R/2，标签在 y=1.15R，组原点在球心。 */
  function buildSunPoint() {
    pointGroup = new THREE.Group();
    tiltGroup.add(pointGroup);

    var dotGeo = new THREE.SphereGeometry(EARTH_R * 0.055, 16, 12);
    track(dotGeo);
    var dotMat = track(basicMat(0xffe066, 1.0, false));
    var dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.y = EARTH_R * 1.02;
    dot.renderOrder = 3;
    pointGroup.add(dot);

    var rodGeo = new THREE.CylinderGeometry(EARTH_R * 0.008, EARTH_R * 0.008, EARTH_R, 8);
    track(rodGeo);
    var rodMat = track(basicMat(0xffe066, 0.8, false));
    var rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.y = EARTH_R * 0.5;
    pointGroup.add(rod);

    var lb = makeLabel('直射点', 36); track(lb.texture);
    lb.sprite.position.set(0, EARTH_R * 1.18, 0);
    pointGroup.add(lb.sprite);

    sunPointNode = pointGroup;
    pointGroup.visible = false;
  }

  /* 极昼/极夜：球冠（thetaStart=0 即从北极开始的一顶帽子） */
  function buildPolarCaps() {
    polarDayNode = makeCap(0xffe9a8, 0.42);
    polarNightNode = makeCap(0x2a3a8a, 0.45);
    polarGroup.add(polarDayNode);
    polarGroup.add(polarNightNode);
    polarDayNode.visible = false;
    polarNightNode.visible = false;
  }

  function makeCap(color, opacity) {
    var geo = new THREE.SphereGeometry(EARTH_R * 1.012, 64, 24, 0, Math.PI * 2, 0, Math.PI * 0.5);
    track(geo);
    var mat = track(basicMat(color, opacity, false));
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
      track(dotGeo);
      var dotMat = track(basicMat(0xff6b6b, 1.0, false));
      var dot = new THREE.Mesh(dotGeo, dotMat);
      dot.renderOrder = 4;
      g.add(dot);

      var lb = makeLabel(c.name, c.labelSize || 30, c.labelScale || 0.13); track(lb.texture);
      var lo = c.labelOffset || [0, 0, 0];
      lb.sprite.position.set(lo[0], EARTH_R * 0.13 + lo[1], lo[2]);
      g.add(lb.sprite);

      g.visible = false;
      cityGroup.add(g);
      cityNodes[id] = { group: g, label: lb.sprite };
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

  /* ============ 埃拉托色尼示意叠加层 ============
     教材图 3.1-6 的关键几何：太阳光是平行光，亚历山大与塞尼城各有一条
     平行光线；从地心延长两条半径线穿过两城，交于平行光线，夹角即 7.2°。
     平行光用圆柱光束（WebGL1 下 Line 只有 1px，投影上几乎看不见），
     地心延长线用虚线，夹角用一段圆环。 */
  var ERATO_UP = null, eratoQuat = null, eratoMat = null, eratoMid = null, eratoDir = null, eratoX = null, eratoY = null, eratoZ = null;

  function eratoBeamGeo() {
    if (!ERATO_UP) ERATO_UP = new THREE.Vector3(0, 1, 0);
    if (!eratoQuat) { eratoQuat = new THREE.Quaternion(); eratoMat = new THREE.Matrix4(); }
    if (!eratoMid) { eratoMid = new THREE.Vector3(); eratoDir = new THREE.Vector3(); }
    if (!eratoX) { eratoX = new THREE.Vector3(); eratoY = new THREE.Vector3(); eratoZ = new THREE.Vector3(); }
    return new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  }

  function eratoBeam(color) {
    var geo = track(eratoBeamGeo());
    var mat = track(new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.92, depthWrite: false, fog: false
    }));
    var m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  /* 把单位圆柱摆到 a→b 上 */
  function setEratoBeam(mesh, a, b, radius) {
    eratoMid.copy(a).add(b).multiplyScalar(0.5);
    eratoDir.copy(b).sub(a);
    var len = eratoDir.length();
    if (len < 1e-6) { mesh.visible = false; return; }
    eratoDir.multiplyScalar(1 / len);
    mesh.visible = true;
    mesh.position.copy(eratoMid);
    mesh.quaternion.setFromUnitVectors(ERATO_UP, eratoDir);
    mesh.scale.set(radius, len, radius);
  }

  function eratoDashed(color) {
    var geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    /* depthTest=false：半径线画在球体之上，等效教材里的剖面图，
       否则从地心到球面这一段会被不透明地球完全挡住，看不出“延长线”。 */
    var mat = track(new THREE.LineDashedMaterial({
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
    eratoGroup = new THREE.Group();
    tiltGroup.add(eratoGroup);
    radialGroup = new THREE.Group();
    spinGroup.add(radialGroup);

    /* ---- 地心标记：两条地心半径线的交点（教材图「地球的中心」）---- */
    var coreDot = new THREE.Mesh(
      track(new THREE.SphereGeometry(EARTH_R * 0.045, 14, 12)),
      track(new THREE.MeshBasicMaterial({ color: 0xff6b6b, fog: false }))
    );
    coreDot.renderOrder = 5;
    radialGroup.add(coreDot);
    var lbCore = tinyLabel('地心');
    lbCore.position.set(0, -EARTH_R * 0.20, 0);
    radialGroup.add(lbCore);

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
      track(new THREE.CylinderGeometry(EARTH_R * 0.014, EARTH_R * 0.014, EARTH_R * 0.20, 10)),
      track(new THREE.MeshBasicMaterial({ color: 0x0a1c26, fog: false }))
    );
    well.quaternion.copy(sy.q);
    well.position.copy(sy.normal).multiplyScalar(EARTH_R * (1.0 - 0.10));
    radialGroup.add(well);
    /* 井中阳光：亮黄细柱沿法线从井口向外伸出，示意「阳光直射井底」 */
    var wellLight = new THREE.Mesh(
      track(new THREE.CylinderGeometry(EARTH_R * 0.007, EARTH_R * 0.007, EARTH_R * 0.26, 8)),
      track(new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.92, depthWrite: false, fog: false }))
    );
    wellLight.quaternion.copy(sy.q);
    wellLight.position.copy(sy.normal).multiplyScalar(EARTH_R * 1.13);
    radialGroup.add(wellLight);

    var al = surfaceAlign(CITIES.alexandria.lat, CITIES.alexandria.lon);
    /* 直杆：竖立在亚历山大地表的米色细杆 */
    var gnomon = new THREE.Mesh(
      track(new THREE.CylinderGeometry(EARTH_R * 0.008, EARTH_R * 0.010, EARTH_R * 0.17, 8)),
      track(new THREE.MeshBasicMaterial({ color: 0xf4e6c8, fog: false }))
    );
    gnomon.quaternion.copy(al.q);
    gnomon.position.copy(al.normal).multiplyScalar(EARTH_R * 1.085);
    radialGroup.add(gnomon);

    /* ---- 平行太阳光：方向锁定为塞尼城法线（竖井向外延长）----
       教材图 3.1-6：一条光线沿竖井直射井底，另一条与它平行、擦过亚历山大
       直杆的最高顶点；两条光线与两城竖直方向的夹角差 = 地心角 7.2°（同位角）。
       光线与竖井/直杆同挂 spinGroup（radialGroup），随地球转动，构建时静态摆好——
       方向由史实条件（夏至正午阳光直射塞尼）给定，不由场景太阳方向决定。 */
    var sunDir = sy.normal.clone();
    var beamR = EARTH_R * 0.008;     /* 教材里是细红线：只求看得清，不抢主体 */
    var rayA = new THREE.Vector3(), rayB = new THREE.Vector3();

    /* 光线 1：沿竖井向外延长（太空 → 井口），长度约 1.1R */
    var beamSy = eratoBeam(0xff5a5a);
    radialGroup.add(beamSy);
    rayA.copy(sy.normal).multiplyScalar(EARTH_R * 2.10);
    rayB.copy(sy.normal).multiplyScalar(EARTH_R * 1.02);
    setEratoBeam(beamSy, rayA, rayB, beamR);
    eratoRays.push({ mesh: beamSy, id: 'syene' });

    /* 光线 2：与光线 1 平行，经过亚历山大直杆的最高顶点 */
    var gnomonTip = al.normal.clone().multiplyScalar(EARTH_R * 1.17);
    var beamAl = eratoBeam(0xff5a5a);
    radialGroup.add(beamAl);
    rayA.copy(gnomonTip).addScaledVector(sunDir, EARTH_R * 1.40);
    rayB.copy(gnomonTip).addScaledVector(sunDir, -EARTH_R * 0.10);
    setEratoBeam(beamAl, rayA, rayB, beamR);
    eratoRays.push({ mesh: beamAl, id: 'alexandria' });

    /* 阳光传播方向箭头（尖朝地球 = -sunDir，同教材红色箭头） */
    var arrowGeo = track(new THREE.ConeGeometry(EARTH_R * 0.026, EARTH_R * 0.070, 10));
    var arrowMat = track(new THREE.MeshBasicMaterial({ color: 0xff5a5a, fog: false }));
    var arrowQ = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, sunDir.clone().negate());
    var arrow1 = new THREE.Mesh(arrowGeo, arrowMat);
    arrow1.position.copy(sy.normal).multiplyScalar(EARTH_R * 1.85);
    arrow1.quaternion.copy(arrowQ);
    radialGroup.add(arrow1);
    var arrow2 = new THREE.Mesh(arrowGeo, arrowMat);
    arrow2.position.copy(gnomonTip).addScaledVector(sunDir, EARTH_R * 0.95);
    arrow2.quaternion.copy(arrowQ);
    radialGroup.add(arrow2);

    /* 地心延长虚线：地心 → 两城方向 ×1.70R（depthTest 关闭，等效教材剖面图） */
    var ids = ['alexandria', 'syene'];
    for (var i = 0; i < ids.length; i++) {
      var radial = eratoDashed(0xbfe9ff);
      radialGroup.add(radial);
      eratoRadials.push({ line: radial, id: ids[i] });
      var rNode = cityNodes[ids[i]];
      var eB = rNode
        ? rNode.group.position.clone().normalize().multiplyScalar(EARTH_R * 1.70)
        : new THREE.Vector3(0, EARTH_R * 1.70, 0);
      setEratoLine(radial, new THREE.Vector3(0, 0, 0), eB);
      radial.computeLineDistances();
    }

    /* 夹角圆环与 7.2° 标签：静态（两城在 spin 局部系位置固定） */
    var na = cityNodes.alexandria ? cityNodes.alexandria.group.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
    var nb = cityNodes.syene ? cityNodes.syene.group.position.clone().normalize() : new THREE.Vector3(0, 1, 0);
    /* 弧半径 0.40R：靠近地心，让 7.2° 夹角看起来是「从中心张开的角度」 */
    eratoArc = new THREE.Mesh(
      track(new THREE.TorusGeometry(EARTH_R * 0.40, EARTH_R * 0.014, 8, 28, na.angleTo(nb))),
      track(new THREE.MeshBasicMaterial({
        color: 0xffe066, transparent: true, opacity: 0.98,
        depthTest: false, depthWrite: false, fog: false
      }))
    );
    eratoArc.frustumCulled = false;
    eratoArc.renderOrder = 7;
    radialGroup.add(eratoArc);

    /* 圆环平面：+X 对准亚历山大方向，法线对齐两城方向张成的平面法向 */
    eratoX.copy(na);
    eratoZ.copy(na).cross(nb);
    if (eratoZ.lengthSq() < 1e-8) eratoZ.set(0, 0, 1); else eratoZ.normalize();
    eratoY.copy(eratoZ).cross(eratoX).normalize();
    eratoMat.makeBasis(eratoX, eratoY, eratoZ);
    eratoArc.quaternion.setFromRotationMatrix(eratoMat);

    var lb = makeLabel('圆的 1/50（7.2°）', 26, 0.12); track(lb.texture);
    eratoLabel = lb.sprite;
    eratoLabel.position.copy(na).add(nb).normalize().multiplyScalar(EARTH_R * 0.52);
    radialGroup.add(eratoLabel);

    /* 「平行太阳光」标签：放在亚历山大光线的太空段旁 */
    var lbRay = makeLabel('平行太阳光', 24, 0.11); track(lbRay.texture);
    eratoRayLabel = lbRay.sprite;
    eratoRayLabel.position.copy(gnomonTip)
      .addScaledVector(sunDir, EARTH_R * 1.12)
      .add(new THREE.Vector3(0, EARTH_R * 0.09, 0));
    radialGroup.add(eratoRayLabel);

    var lbWell = tinyLabel('塞尼城的竖井');
    lbWell.position.copy(sy.normal).multiplyScalar(EARTH_R * 1.34);
    radialGroup.add(lbWell);

    var lbRod = tinyLabel('亚历山大的直杆');
    lbRod.position.copy(al.normal).multiplyScalar(EARTH_R * 1.34);
    radialGroup.add(lbRod);

    eratoGroup.visible = false;
    radialGroup.visible = false;
  }

  /* 埃拉托色尼叠加层已全部静态化（光线方向锁定塞尼法线、与竖井/直杆同挂
     spinGroup），无需随太阳方向或自转逐帧更新——build 时一次摆好。 */

  /* ============ 教学用附加图层 ============
     voyage        3.1.1 环球航行航线（倾斜大圆 + 起终点）
     satellites    3.1.3 人造地球卫星（逐帧公转）
     sizeRings     3.1.4 / 3.1.6 赤道周长环 + 表面积标注
     degreeLabels  3.1.8 / 3.1.9 经纬度度数标注（字号小，专门给后排看） */
  var extraGroup = null, voyageGroup = null, satGroup = null, sizeGroup = null, degreeGroup = null, degreeLatGroup = null, degreeLonGroup = null, horizonGroup = null, eclipseGroup = null;
  var satNodes = [];
  var satSpin = 0;
  var voyageProgress = 0;
  var voyFwd = null, voyUp = null, voyRight = null, voyZ = null, voyMat = null;   // 航线船朝向临时量
  var horizonShipPhase = 0;    // 远去船只的球面相位（0→1 循环）
  var shipLight = null;        // 帆船受光（Lambert）用的方向光，方向跟随太阳
  var eclipseTime = 0;
  var eclipseShadowMaterial = null;

  /* 3.1.1 远去船只：海面球半径越大，地平线越远，但曲率越小、船下沉越不明显。
     这里取 6R 让地平线更近、弧面更弯，桅杆的「下沉」过程更清楚；
     相位上限 0.60 远大于完全遮挡所需角度，保证船一直开到船身与桅杆都被挡住，
     并在被挡住后才复位，避免复位瞬间在近处弹出来。 */
  var HORIZON_SEA_R = EARTH_R * 6;    // 原 7：曲率略强，桅杆下沉更明显
  var HORIZON_SHIP_SCALE = 1.6;       // 原 1：船相对海面更大，遮挡过程看得更清
  var HORIZON_SHIP_MAX_TH = 0.60;     // 原 0.30：开到完全没入地平线之后才循环
  var HORIZON_SHIP_SPEED = 0.15;      // 原 0.11：略快但仍能看清船身先没、桅杆后没

  function placeLatLon(out, latDeg, lonDeg, radius) {
    var phi = latDeg * DEG, theta = lonDeg * DEG;
    out.set(radius * Math.cos(phi) * Math.cos(theta), radius * Math.sin(phi), -radius * Math.cos(phi) * Math.sin(theta));
    return out;
  }

  function tinyLabel(text) {
    var lb = makeLabel(text, 20, 0.075);
    track(lb.texture);
    return lb.sprite;
  }

  /* ---- 环球航行航线（麦哲伦段 + 埃尔卡诺段，两种颜色）----
     按史实航迹关键节点 [纬度, 经度] 绘制；经度用连续值西行为负
     （跨日界线后关岛 144.75E = -215.25、好望角 18.5E = -341.5），
     sin/cos 转换模 360 自动归一，CatmullRom 插值不在日界线上跳变。 */
  function buildVoyage() {
    voyageGroup = new THREE.Group();
    /* 航迹画在地球表面，必须挂 spinGroup 随地球一起转：此前挂在 extraGroup
       （不随自转），步骤的 spinDeg 让地球转过任意角度时航线就会整体偏离
       大陆（表现为航线穿过南美、贴错澳洲）。 */
    spinGroup.add(voyageGroup);

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
      var geo = track(new THREE.BufferGeometry().setFromPoints(smooth));
      var line = new THREE.Line(geo, track(new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.96, depthWrite: false, fog: false
      })));
      voyageGroup.add(line);
      var lb = tinyLabel(label);
      lb.position.copy(pts[labelIdx]).multiplyScalar(1.07);
      voyageGroup.add(lb);
      return smooth;
    }

    var magellanSm = buildSegment(magellanRoute, 0xffb45c, '麦哲伦航线', 9);
    var elcanoSm = buildSegment(elcanoRoute, 0xff9fb5, '埃尔卡诺返航', 8);

    /* 行进指示改用小帆船（与远去船只同源模型，亮船体色便于在球面上辨认），
       替代原来的红色小球；0.7 倍 → 船长 0.13R，够示意又不喧宾夺主 */
    var dot = buildShipModel(0.7, 0xffc98a);
    dot.traverse(function (o) { if (o.isMesh) o.renderOrder = 4; });
    voyageGroup.add(dot);

    /* 行进指示点沿「麦哲伦 → 埃尔卡诺」两段连续播放（两段在麦克坦衔接） */
    voyageGroup.userData.route = magellanSm.concat(elcanoSm);
    voyageGroup.userData.dot = dot;

    voyageGroup.visible = false;
  }

  /* ---- 帆船模型（远去船只场景与环球航线行进指示共用）----
     船头朝 -Z、长轴沿 Z、船底贴 y=0；scale 以 EARTH_R 为基准，
     hullColor 可覆盖船体色（航线上用亮色以便在球面上看清）。 */
  function buildShipModel(scale, hullColor) {
    var g = new THREE.Group();
    var s = EARTH_R * scale;
    /* 受光材质（Lambert）：航线上船只有二十几像素，无光照的六面同色会糊成
       二维贴纸——体积感要靠明暗面表达，不能靠尺寸。 */
    var mk = function (color) {
      return track(new THREE.MeshLambertMaterial({ color: color, fog: false }));
    };
    var wood = mk(hullColor || 0x9a6640);
    var woodDark = mk(0x6d4526);
    var canvasMat = mk(0xf7f2e6);
    var mastMat = mk(0x53371c);

    var hull = new THREE.Mesh(track(new THREE.BoxGeometry(s * 0.050, s * 0.042, s * 0.170)), wood);
    hull.position.y = s * 0.021;
    var stern = new THREE.Mesh(track(new THREE.BoxGeometry(s * 0.040, s * 0.032, s * 0.048)), woodDark);
    stern.position.set(0, s * 0.058, s * 0.052);      // 尾楼（+z 船尾）
    var bow = new THREE.Mesh(track(new THREE.BoxGeometry(s * 0.030, s * 0.026, s * 0.040)), woodDark);
    bow.position.set(0, s * 0.052, -s * 0.075);        // 船头前甲板
    var mast = new THREE.Mesh(track(new THREE.CylinderGeometry(s * 0.0045, s * 0.0055, s * 0.12, 6)), mastMat);
    mast.position.set(0, s * 0.102, -s * 0.005);
    var yard = new THREE.Mesh(track(new THREE.BoxGeometry(s * 0.095, s * 0.006, s * 0.006)), woodDark);
    yard.position.set(0, s * 0.138, -s * 0.005);       // 帆桁
    var sail = new THREE.Mesh(track(new THREE.BoxGeometry(s * 0.088, s * 0.048, s * 0.002)), canvasMat);
    sail.position.set(0, s * 0.112, -s * 0.008);       // 横帆
    g.add(hull); g.add(stern); g.add(bow);
    g.add(mast); g.add(yard); g.add(sail);
    return g;
  }

  /* ---- 地面观察远去船只：船沿真实球面海面向远方航行 ---- */
  function buildHorizon() {
    horizonGroup = new THREE.Group();
    extraGroup.add(horizonGroup);
    /* 海面用真实球面（半径由 HORIZON_SEA_R 决定，球心在 y=-Rs）：地平线由球体
       曲率自然形成，船的「下沉」是被球面遮挡的物理结果——船身先没、桅杆后没
       不再是人为下压曲线。旧抛物面网格边界可见（湖面感）且下沉量失真，已替换。
       整组放大 4 倍：相机走 globe rig（dist≥3），放大后等效眼高贴近海面。 */
    horizonGroup.scale.setScalar(4);

    var Rs = HORIZON_SEA_R;
    var seaGeo = track(new THREE.SphereGeometry(Rs, 96, 64));
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
    var sea = new THREE.Mesh(seaGeo, track(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    sea.position.y = -Rs;
    horizonGroup.add(sea);

    var ship = buildShipModel(HORIZON_SHIP_SCALE);
    horizonGroup.add(ship);
    horizonGroup.userData.ship = ship;
    horizonGroup.visible = false;
  }

  /* ---- 地面观察月食：地球本影投影到观察者正对的月盘 ---- */
  function buildEclipse() {
    eclipseGroup = new THREE.Group();
    extraGroup.add(eclipseGroup);
    var moonMat2 = track(basicMat(0xd2d2d2, 1.0, false));
    var moon = new THREE.Mesh(track(new THREE.SphereGeometry(EARTH_R * 0.55, 32, 20)), moonMat2);
    moon.position.set(0, EARTH_R * 0.55, -EARTH_R * 0.35);
    loadRealTexture('moon', 'moon.jpg', function (t) { if (t) { moonMat2.map = t; moonMat2.needsUpdate = true; } });
    eclipseGroup.add(moon);
    eclipseShadowMaterial = track(new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uCenter: { value: 1.5 } },
      /* 视空间的 XY 就是观察者看到的月盘；除去模型缩放后，两档比例使用相同影子尺寸。 */
      vertexShader: 'varying vec2 vMoonDisk; void main(){ vec4 viewPosition = modelViewMatrix * vec4(position, 1.0); vec4 viewCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); float scale = length(modelViewMatrix[0].xyz); vMoonDisk = (viewPosition.xy - viewCenter.xy) / scale; gl_Position = projectionMatrix * viewPosition; }',
      fragmentShader: 'varying vec2 vMoonDisk; uniform float uCenter; void main(){ float d = length(vMoonDisk - vec2(uCenter, 0.0)); float pen = 1.0 - smoothstep(0.76, 0.90, d); float umb = 1.0 - smoothstep(0.65, 0.73, d); if (pen < 0.01) discard; vec3 color = mix(vec3(0.22, 0.10, 0.08), vec3(0.045, 0.012, 0.008), umb); float alpha = mix(0.45, 0.94, umb) * pen; gl_FragColor = vec4(color, alpha); }',
      side: THREE.FrontSide
    }));
    var shadowShell = new THREE.Mesh(track(new THREE.SphereGeometry(EARTH_R * 0.555, 48, 32)), eclipseShadowMaterial);
    shadowShell.renderOrder = 5;
    moon.add(shadowShell);
    eclipseGroup.userData.moon = moon;
    eclipseGroup.userData.shadowMaterial = eclipseShadowMaterial;
    eclipseGroup.visible = false;
  }

  /* ---- 人造地球卫星 ---- */
  function buildSatellites() {
    satGroup = new THREE.Group();
    extraGroup.add(satGroup);

    var bodyMatA = track(basicMat(0xd8e2e8, 1.0, false));
    var bodyMatB = track(basicMat(0xb9c4cc, 1.0, false));
    var bodyMatC = track(basicMat(0xe8eef2, 1.0, false));
    var panelMatA = track(basicMat(0x3f6fd8, 1.0, false));
    var panelMatB = track(basicMat(0x274e9e, 1.0, false));
    var dishMat = track(basicMat(0xf2f5f7, 1.0, false));

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
        var body = new THREE.Mesh(track(new THREE.BoxGeometry(EARTH_R * 0.026 * k, EARTH_R * 0.020 * k, EARTH_R * 0.020 * k)), bodyMatA);
        g.add(body);
        var pw = EARTH_R * 0.045 * k, ph = EARTH_R * 0.0022, pd = EARTH_R * 0.016 * k;
        var p1 = new THREE.Mesh(track(new THREE.BoxGeometry(pw, ph, pd)), panelMatA);
        p1.position.x = -EARTH_R * 0.034 * k;
        var p2 = p1.clone(); p2.position.x = EARTH_R * 0.034 * k;
        g.add(p1); g.add(p2);
      } else if (c.type === 1) {
        /* 圆柱星体 + 抛物面天线 */
        var cyl = new THREE.Mesh(track(new THREE.CylinderGeometry(EARTH_R * 0.011 * k, EARTH_R * 0.011 * k, EARTH_R * 0.030 * k, 10)), bodyMatB);
        cyl.rotation.z = Math.PI / 2;
        g.add(cyl);
        var dish = new THREE.Mesh(track(new THREE.ConeGeometry(EARTH_R * 0.014 * k, EARTH_R * 0.008 * k, 12, 1, true)), dishMat);
        dish.position.x = EARTH_R * 0.022 * k;
        dish.rotation.z = -Math.PI / 2;
        g.add(dish);
        var pw1 = EARTH_R * 0.038 * k, pd1 = EARTH_R * 0.013 * k;
        var q1 = new THREE.Mesh(track(new THREE.BoxGeometry(pw1, EARTH_R * 0.002, pd1)), panelMatB);
        q1.position.y = -EARTH_R * 0.018 * k;
        var q2 = q1.clone(); q2.position.y = EARTH_R * 0.018 * k;
        g.add(q1); g.add(q2);
      } else {
        /* 球体星体 + 四瓣太阳翼 */
        var sph = new THREE.Mesh(track(new THREE.SphereGeometry(EARTH_R * 0.013 * k, 10, 8)), bodyMatC);
        g.add(sph);
        var pw2 = EARTH_R * 0.036 * k, pd2 = EARTH_R * 0.012 * k;
        var r1 = new THREE.Mesh(track(new THREE.BoxGeometry(pw2, EARTH_R * 0.002, pd2)), panelMatA); r1.position.x = -EARTH_R * 0.030 * k;
        var r2 = r1.clone(); r2.position.x = EARTH_R * 0.030 * k;
        var r3 = new THREE.Mesh(track(new THREE.BoxGeometry(pd2, EARTH_R * 0.002, pw2)), panelMatB); r3.position.z = -EARTH_R * 0.030 * k;
        var r4 = r3.clone(); r4.position.z = EARTH_R * 0.030 * k;
        g.add(r1); g.add(r2); g.add(r3); g.add(r4);
      }
      g.userData.cfg = c;
      g.rotation.set(c.phase * 0.7, c.phase, c.phase * 0.3);
      g.scale.setScalar(1.25);
      satGroup.add(g);
      satNodes.push(g);
    }
    satGroup.visible = false;
  }

  function updateSatellites(dtSec) {
    if (!satGroup || !satGroup.visible) return;
    satSpin += dtSec;
    for (var i = 0; i < satNodes.length; i++) {
      var g = satNodes[i];
      var c = g.userData.cfg;
      var a = c.phase + satSpin * c.speed;
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

  /* ---- 地球大小：赤道周长 + 表面积 ---- */
  /* ---- 地球的尺寸（教材图 3.1-5）：赤道半径、极半径、赤道周长 ---- */
  function buildSizeRings() {
    sizeGroup = new THREE.Group();
    extraGroup.add(sizeGroup);

    /* 赤道周长环（贴地表一圈，颜色与薄荷绿主题一致） */
    var ring = new THREE.Mesh(
      track(new THREE.TorusGeometry(EARTH_R * 1.005, EARTH_R * 0.014, 8, 128)),
      track(new THREE.MeshBasicMaterial({ color: 0x7ffcd8, transparent: true, opacity: 0.95, depthWrite: false, fog: false }))
    );
    ring.rotation.x = Math.PI / 2;                 /* 赤道面 = XZ */
    sizeGroup.add(ring);

    /* 半径标尺（教材图 3.1-5 的画法）：线从球心画到表面，两端带箭头。
       depthTest 关闭 → 线像 X 光一样透出球体（教材的示意画法，不是真实遮挡），
       renderOrder 压在球面之上；axisChar 'x' 表示沿赤道方向的半径。 */
    function radiusPointer(len, color, axisChar) {
      var grp = new THREE.Group();
      var mat = function () {
        return track(new THREE.MeshBasicMaterial({
          color: color, transparent: true, opacity: 0.98, depthTest: false, fog: false
        }));
      };
      var shaft = new THREE.Mesh(
        track(new THREE.CylinderGeometry(EARTH_R * 0.010, EARTH_R * 0.010, len, 8)), mat());
      shaft.position.y = len * 0.5;                       /* 覆盖 0 → len */
      grp.add(shaft);

      var tipGeo = track(new THREE.ConeGeometry(EARTH_R * 0.030, EARTH_R * 0.080, 10));
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
    sizeGroup.add(radiusPointer(EARTH_R * 1.0, 0xffd479, 'y'));
    /* 赤道半径：球心 → 赤道面（6378 km，双向箭头） */
    sizeGroup.add(radiusPointer(EARTH_R * 1.0, 0xff9fb5, 'x'));

    var lbPolar = tinyLabel('极半径 6357 km');
    lbPolar.position.set(0, EARTH_R * 1.30, 0);
    sizeGroup.add(lbPolar);

    var lbEq = tinyLabel('赤道半径 6378 km');
    lbEq.position.set(EARTH_R * 1.46, EARTH_R * 0.10, 0);
    sizeGroup.add(lbEq);

    var lbCirc = tinyLabel('赤道周长约 4×10⁴ km');
    lbCirc.position.set(-EARTH_R * 0.55, -EARTH_R * 0.34, EARTH_R * 1.14);
    sizeGroup.add(lbCirc);

    sizeGroup.visible = false;
  }

  /* ---- 经纬度度数标注 ----
     分「纬度组 / 经度组」，可单独显示（教材图 3.1-9 纬线、3.1-10 经线）。
     挂 tiltGroup：与经纬网同一坐标系，地轴倾斜时标记跟着倾斜；
     depthTest 打开：转到地球背面的度数会被球体遮住。 */
  function buildDegreeLabels() {
    degreeGroup = new THREE.Group();
    tiltGroup.add(degreeGroup);
    degreeLatGroup = new THREE.Group();
    degreeLonGroup = new THREE.Group();
    degreeGroup.add(degreeLatGroup);
    degreeGroup.add(degreeLonGroup);

    var r = EARTH_R * 1.06;
    var tmp = new THREE.Vector3();
    var i;

    function tag(text) {
      var lb = makeLabel(text, 22, 0.085, true);   // occluded: 可被地球遮挡
      track(lb.texture);
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
      degreeLatGroup.add(sp);
    }
    /* 两极：地轴端点（教材图标 90°N / 90°S） */
    var poleN = tag('90°N');
    poleN.position.set(0, EARTH_R * 1.14, 0);
    degreeLatGroup.add(poleN);
    var poleS = tag('90°S');
    poleS.position.set(0, -EARTH_R * 1.14, 0);
    degreeLatGroup.add(poleS);

    /* 主要经线的度数：本初子午线起，每 20° 一条（与教材图 3.1-10 一致） */
    var lons = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, -160, -140, -120, -100, -80, -60, -40, -20];
    for (i = 0; i < lons.length; i++) {
      var deg = lons[i];
      var text = deg === 0 ? '0°' : (deg === 180 ? '180°' : Math.abs(deg) + '°' + (deg > 0 ? 'E' : 'W'));
      placeLatLon(tmp, 0, deg, r);
      var sp2 = tag(text);
      sp2.position.copy(tmp).multiplyScalar(1.02);
      sp2.position.y += EARTH_R * 0.08;
      degreeLonGroup.add(sp2);
    }

    degreeGroup.visible = false;
  }

  function buildExtras() {
    extraGroup = new THREE.Group();
    root.add(extraGroup);
    buildVoyage();
    buildHorizon();
    buildEclipse();
    buildSatellites();
    buildSizeRings();
    buildDegreeLabels();
  }

  function build() {
    UP_Y = new THREE.Vector3(0, 1, 0);
    tiltInverse = new THREE.Quaternion();
    tmpEuler = new THREE.Euler();

    root = new THREE.Group();
    root.visible = false;

    tiltGroup = new THREE.Group();
    root.add(tiltGroup);

    spinGroup = new THREE.Group();
    tiltGroup.add(spinGroup);

    gridGroup = new THREE.Group();
    spinGroup.add(gridGroup);

    cityGroup = new THREE.Group();
    spinGroup.add(cityGroup);

    hlGroup = new THREE.Group();
    tiltGroup.add(hlGroup);

    polarGroup = new THREE.Group();
    tiltGroup.add(polarGroup);

    axisGroup = new THREE.Group();
    tiltGroup.add(axisGroup);

    buildEarth();
    buildGrid(15);
    buildHighlights();
    buildAxis();
    buildSunPoint();
    buildPolarCaps();
    buildCities();
    buildEratosthenes();
    buildExtras();

    scene.add(root);

    /* 帆船用 Lambert 材质，必须有灯才有明暗；无光照时六面同色会糊成贴纸。
       方向光跟随太阳（与地表昼夜一致），环境光保证背光面不死黑。
       两者只影响 Lambert 材质，球体等 MeshBasic/Shader 对象不受影响。 */
    shipLight = new THREE.DirectionalLight(0xffffff, 0.85);
    shipLight.position.set(1, 0.35, 0.6);
    scene.add(shipLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    built = true;
  }

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
    if (!built) return;
    params = params || {};
    var p = {};
    for (var k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) p[k] = cur[k]; }
    for (var k2 in params) { if (Object.prototype.hasOwnProperty.call(params, k2)) p[k2] = params[k2]; }
  /* eratosthenes 是一次性示意叠加层，不做跨步骤粘滞：未显式打开即隐藏 */
    p.eratosthenes = !!params.eratosthenes;
    /* highlight / cities 同理不做粘滞：否则上一步的北极圈高亮、城市红点
       会残留在下一步（如「地球的尺寸」里冒出北极圈和亚历山大/塞尼红点）。 */
    p.highlight = params.highlight || [];
    p.cities = params.cities || [];
    /* 场景镜头同样是一次性状态，避免第一步的地面视角把后续地球模型永久隐藏。 */
    p.shapeScene = params.shapeScene || null;
    if (p.shapeScene === 'eclipse' && cur.shapeScene !== 'eclipse') {
      eclipseTime = 0;
      eclipseShadowMaterial.uniforms.uCenter.value = 1.5;
    }
    p.satelliteMode = params.satelliteMode || null;
    /* voyage / satellites / sizeRings / degreeLabels 同理：按步骤显式开关 */
    p.voyage = !!params.voyage;
    p.satellites = !!params.satellites;
    p.sizeRings = !!params.sizeRings;
    /* degreeLabels: true 两组都显示；'lat' / 'lon' 只显示对应的一组
       （教材图 3.1-9 讲纬线、3.1-10 讲经线，分开看更清楚） */
    p.degreeLabels = params.degreeLabels || false;
    cur = p;

    if (p.gridStep !== undefined && Number(p.gridStep) > 0 && Number(p.gridStep) !== gridStep) {
      for (var gi = 0; gi < gridLines.length; gi++) {
        gridGroup.remove(gridLines[gi]);
        if (gridLines[gi].geometry) gridLines[gi].geometry.dispose();
        if (gridLines[gi].material && gridLines[gi].material.dispose) gridLines[gi].material.dispose();
      }
      gridLines.length = 0;
      buildGrid(Number(p.gridStep));
    }

    /* 显示尺寸：只影响观感，不影响任何物理关系 */
    curScale = scale || 'real';
    root.scale.setScalar(curScale === 'iconic' ? 1.6 : 1.0);
    /* 第一场景切到地面观察镜头时，隐藏地球仪本体，只保留地平线装置。 */
    if (tiltGroup) tiltGroup.visible = p.shapeScene !== 'horizon' && p.shapeScene !== 'eclipse';

    /* 地轴倾角：tiltGroup 绕 X 轴旋转 ε = 90 − tiltDeg */
    var tilt = (p.tiltDeg === undefined ? 66.5 : p.tiltDeg);
    tiltGroup.rotation.x = (90 - tilt) * DEG;
    tmpEuler.set(-(90 - tilt) * DEG, 0, 0);
    tiltInverse.setFromEuler(tmpEuler);

    /* 自转 */
    spinGroup.rotation.y = (p.spinDeg || 0) * DEG;

    /* 太阳方向 -> 着色 / 晨昏 / 直射点 / 极昼极夜 */
    var st = sunState(p);
    earthUniforms.uSunDir.value.copy(st.dir);
    if (shipLight) shipLight.position.copy(earthUniforms.uSunDir.value).multiplyScalar(200);
    earthUniforms.uNight.value = p.terminator === false ? 0.0 : NIGHT_FACTOR;

    /* 直射点：把世界方向的太阳搬到 tiltGroup 局部坐标，再让整组的 +Y 对准它。
       这样"直射点落在哪条纬线上"完全由 δ = asin(sunDir · 地轴) 决定，物理正确。 */
    if (sunPointNode) {
      sunPointNode.visible = !!p.sunPoint;
      var localDir = st.dir.clone().applyQuaternion(tiltInverse.clone());
      var q = new THREE.Quaternion().setFromUnitVectors(UP_Y, localDir);
      sunPointNode.position.set(0, 0, 0);
      sunPointNode.quaternion.copy(q);
    }

    /* 极昼 / 极夜：纬度高于 90−|δ| 的极区 */
    var absDelta = Math.abs(st.delta);
    var capAngle = Math.PI / 2 - absDelta;          // 极区边界的余纬
    if (polarDayNode && polarNightNode) {
      var show = !!p.polarDayNight && absDelta > 0.001;
      polarDayNode.visible = show;
      polarNightNode.visible = show;
      /* 忽略显示 ulcers：用 rotation 把同一顶帽子翻转到对应半球 */
      polarDayNode.rotation.x = st.delta >= 0 ? 0 : Math.PI;
      polarNightNode.rotation.x = st.delta >= 0 ? Math.PI : 0;
      setCapAngle(polarDayNode, capAngle);
      setCapAngle(polarNightNode, capAngle);
    }

    /* 经纬网 */
    gridGroup.visible = !!p.grid;

    /* 重要经纬线高亮 */
    var list = p.highlight || [];
    for (var key in hlNodes) {
      if (!Object.prototype.hasOwnProperty.call(hlNodes, key)) continue;
      hlNodes[key].visible = list.indexOf(key) >= 0 ||
        (key === 'ew_boundary_a' && list.indexOf('ew_boundary') >= 0) ||
        (key === 'ew_boundary_b' && list.indexOf('ew_boundary') >= 0);
    }

    /* 地轴 */
    axisGroup.visible = !!p.axis;

    /* 城市 */
    var want = p.cities || [];
    for (var id in cityNodes) {
      if (!Object.prototype.hasOwnProperty.call(cityNodes, id)) continue;
      var on = want.indexOf(id) >= 0;
      cityNodes[id].group.visible = on;
      cityNodes[id].label.visible = on && !!p.cityLabels;
    }

    /* 埃拉托色尼示意叠加层：平行太阳光 + 地心延长线 + 7.2° 弧 */
    var eratoOn = !!p.eratosthenes;
    if (eratoGroup) eratoGroup.visible = eratoOn;
    if (radialGroup) radialGroup.visible = eratoOn;

    /* 教学附加图层 */
    if (voyageGroup) voyageGroup.visible = !!p.voyage;
    if (horizonGroup) horizonGroup.visible = p.shapeScene === 'horizon';
    if (eclipseGroup) eclipseGroup.visible = p.shapeScene === 'eclipse';
    if (satGroup) satGroup.visible = !!p.satellites;
    if (satGroup && satGroup.visible) {
      for (var si = 0; si < satNodes.length; si++) {
        satNodes[si].visible = p.satelliteMode !== 'dongfang1' || si === 0;
        satNodes[si].scale.setScalar(p.satelliteMode === 'dongfang1' && si === 0 ? 2.8 : 1.25);
      }
    }
    if (sizeGroup) sizeGroup.visible = !!p.sizeRings;
    if (degreeGroup) {
      var degMode = p.degreeLabels;
      degreeGroup.visible = !!degMode;
      if (degreeLatGroup) degreeLatGroup.visible = (degMode === true || degMode === 'lat');
      if (degreeLonGroup) degreeLonGroup.visible = (degMode === true || degMode === 'lon');
    }
  }

  /* 球冠张角随 δ 变化：重建几何代价大，改用缩放近似会导致变形，
     这里改为直接调整 thetaLength —— 用几何重建但保留足够低的细分以控制开销。 */
  function setCapAngle(mesh, thetaLength) {
    if (!mesh) return;
    if (mesh.userData.lastTheta === thetaLength) return;
    mesh.userData.lastTheta = thetaLength;
    var geo = track(new THREE.SphereGeometry(EARTH_R * 1.012, 64, 16, 0, Math.PI * 2, 0, Math.max(0.0001, thetaLength)));
    if (mesh.geometry) mesh.geometry.dispose();
    mesh.geometry = geo;
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

    resetMotion: function () {
      voyageProgress = 0;
      horizonShipPhase = 0;
      eclipseTime = 0;
      cur.spinDeg = 0;
      if (spinGroup) spinGroup.rotation.y = 0;
      this.update(0);
    },

    update: function (dtSec) {
      if (!built || !root.visible) return;
      updateSatellites(dtSec);
      if (voyageGroup && voyageGroup.visible && voyageGroup.userData.route && voyageGroup.userData.dot) {
        /* 麦哲伦环球航线小船：0.08 → 0.06，航速稍慢，便于课堂沿线讲解 */
        if (anim.playing) voyageProgress = (voyageProgress + dtSec * 0.06 * anim.speed) % 1;
        var route = voyageGroup.userData.route;
        var fi = Math.floor(voyageProgress * (route.length - 1));
        var ni = Math.min(route.length - 1, fi + 1);
        var vship = voyageGroup.userData.dot;
        vship.position.copy(route[fi]).lerp(route[ni], voyageProgress * (route.length - 1) - fi);
        /* 船底必须落到球面上：航线本身画在 1.045R，若船底放在航线点上，
           船会悬浮在地表上方约 0.045R（≈290km），侧看就是一张浮空纸片。
           投影到 1.005R（球面略上方防 z-fighting），船才真正「贴着地球行驶」。 */
        vship.position.setLength(EARTH_R * 1.005);
        /* 船头朝行进方向、船底贴球面法线。这里用 makeBasis 直接构造局部旋转
           （不能用 lookAt：它按世界坐标解释参数，而航线点是 spinGroup 局部坐标）。 */
        if (!voyFwd) { voyFwd = new THREE.Vector3(); voyUp = new THREE.Vector3(); voyRight = new THREE.Vector3(); voyZ = new THREE.Vector3(); voyMat = new THREE.Matrix4(); }
        voyFwd.copy(route[ni]).sub(route[fi]).normalize();
        voyUp.copy(route[fi]).normalize();          // 球面法线 = 船的「上」
        /* right = forward × up（不是 up × forward！后者会凑成左手系，
           行列式 -1 使船被镜像渲染，某些角度看着就成了纸片） */
        voyRight.crossVectors(voyFwd, voyUp).normalize();
        voyZ.copy(voyFwd).negate();                 // 模型船头在 -Z，故局部 +Z = -前进方向
        voyMat.makeBasis(voyRight, voyUp, voyZ);
        vship.quaternion.setFromRotationMatrix(voyMat);
      }
      if (horizonGroup && horizonGroup.visible && horizonGroup.userData.ship) {
        /* 船沿球面大圆向画面深处（-z）驶去：船身先被球面遮住，桅杆最后消失。
           相位一直推进到 HORIZON_SHIP_MAX_TH 才复位，确保船身与桅杆都已完全
           没入地平线，复位发生在不可见状态，不会在近处突然弹出。 */
        var ship = horizonGroup.userData.ship;
        if (anim.playing) horizonShipPhase = (horizonShipPhase + dtSec * HORIZON_SHIP_SPEED * anim.speed) % 1;
        var th = horizonShipPhase * HORIZON_SHIP_MAX_TH;
        var Rs = HORIZON_SEA_R;
        ship.position.set(0, -Rs + Rs * Math.cos(th), -Rs * Math.sin(th));
        ship.rotation.x = -th;
      }
      if (eclipseGroup && eclipseGroup.visible && eclipseGroup.userData.moon) {
        if (anim.playing && anim.revolve) eclipseTime += dtSec * anim.speed;
        var phase = (eclipseTime % 14) / 14;
        var sweep = Math.max(0, Math.min(1, (phase - 0.08) / 0.84));
        /* 本影从月盘外进入、覆盖全月，再退出；循环边界两端均为完整满月。 */
        eclipseGroup.userData.shadowMaterial.uniforms.uCenter.value = (1.5 - sweep * 3.0) * EARTH_R;
      }
      if (anim.spin) {
        var deg = (cur.spinDeg || 0) + dtSec * 5 * (anim.speed || 1);
        cur.spinDeg = deg % 360;
        spinGroup.rotation.y = cur.spinDeg * DEG;
      }
    },

    setVisible: function (on) {
      if (!built) return;
      root.visible = !!on;
    },

    setAnim: function (a) {
      if (!a) return;
      if (typeof a.spin === 'boolean') anim.spin = a.spin;
      if (typeof a.revolve === 'boolean') anim.revolve = a.revolve;
      if (typeof a.playing === 'boolean') anim.playing = a.playing;
      if (typeof a.speed === 'number') anim.speed = a.speed;
    },

    getRoot: function () { return root; },

    getWorldPosition: function (bodyId) {
      if (!built) return null;
      if (bodyId === 'moon' && eclipseGroup) {
        return eclipseGroup.userData.moon.getWorldPosition(new THREE.Vector3());
      }
      if (bodyId !== 'earth') return null;
      var v = new THREE.Vector3();
      earthMesh.getWorldPosition(v);
      return v;
    },

    /* 供主控做标注/取景用：当前太阳黄经对应的直射点纬度（度） */
    getSubSolarLatitude: function () {
      if (!built) return 0;
      return sunState(cur).delta / DEG;
    },

    dispose: function () {
      if (!built) return;
      if (root && root.parent) root.parent.remove(root);
      for (var i = 0; i < disposeList.length; i++) {
        var o = disposeList[i];
        try { if (o && typeof o.dispose === 'function') o.dispose(); } catch (e) { /* 忽略 */ }
      }
      disposeList.length = 0;
      built = false;
    }
  };
})();
