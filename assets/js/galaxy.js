/**
 * 银河系运动与结构模型（默认常驻）
 *
 * 比例基准：太阳到银心约 26,000 光年（约 8 kpc）映射为 radiusUnits；银河系其余结构
 * 统一按 kpc 比例映射。模型包含盒状/棒状核球、薄盘/厚盘、两条主旋臂、Sagittarius
 * 次臂、太阳所在的 Local/Orion Spur、旋臂内侧尘埃带以及分层差动自转。
 *
 * 演示模式用 orbitSeconds 将一个约 2.3 亿年的银河年压缩到数十分钟；恒星盘的可见自转
 * 另乘较小显示系数，既保留平坦旋转曲线（v≈常数，omega∝1/R）的关系，也避免旋臂迅速卷散。
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Galaxy = (function () {
  var C = SOLAR.CONFIG;
  var TAU = Math.PI * 2;
  var LY_PER_KPC = 3261.56;

  /* 观测约束与模型参数。角度均在未倾斜的银道面 XZ 内定义。 */
  var MODEL = {
    diskScaleKpc: 2.6,        // 薄盘径向指数标长（观测常见范围约 2.5–3 kpc）
    thickScaleKpc: 2.0,       // 厚盘径向标长
    thinHeightKpc: 0.30,      // 薄盘指数标高
    thickHeightKpc: 0.90,     // 厚盘指数标高
    diskEdgeKpc: 16.0,        // 可见恒星盘截断半径
    barLengthKpc: 4.6,        // 棒状核球长轴全长
    barAngleDeg: 27,          // 棒相对“银心—太阳”线的近端夹角
    spiralB: 0.235,           // 对数螺旋 r=r0*exp(b*theta)，pitch=atan(b)≈13.2°
    spiralR0Kpc: 3.2,
    armOuterKpc: 15.5,
    kinematicVisualScale: 0.026,
    patternVisualScale: 0.018
  };

  var counts = { ultra: 90000, high: 26000, medium: 14000, low: 7000 };
  var ringBoundsKpc = [0, 3.2, 6.0, 10.0, 100];
  var ringRadiusKpc = [1.8, 4.6, 8.0, 13.0];

  var scene = null;
  var frame = null;             // 银河系坐标系；其 XZ 面为银道面
  var group = null;
  var coreGlow = null;
  var solarIndicator = null;
  var sunTrail = null;              // 太阳公转拖尾（挂在银河 group 下的局部坐标采样点）
  var velocityVectors = null;
  var armPatternGroup = null;
  var starLayers = [];

  var geometries = [];
  var materials = [];
  var textures = [];

  var theta = 0;
  var totalOrbitAngle = 0;
  var layerPhases = [0, 0, 0, 0];
  var patternPhase = 0;
  var built = false;
  var qualityName = 'high';
  var lastPos = null;
  var tempPosition = null;
  var trailPosition = null;
  var camera = null;           // 用于标注层按距离淡出（相机贴近太阳时必须隐藏）
  var annotationVec = null;
  var lodOrigin = null;
  var randomState = 1;

  /* 标注层淡出区间（单位：frame 局部单位，即场景单位）。
     太阳位置标记是"远观银河"用的示意图：相机贴近太阳时它会
     罩住整个视野，必须在这段距离内淡出，恢复远观时再淡入。
     （太阳公转拖尾不在此列——它始终显示，见 TRAIL_BOOST_*。） */
  var ANNOTATION_NEAR_UNITS = 220;
  var ANNOTATION_FAR_UNITS = 1400;

  /* 拖尾随相机拉远的提亮区间：近处保持基础亮度，拉远到银河全景尺度时
     整体最多再亮 50%（0.70 → 1.05）。只做补偿性提亮，封顶不夸张，
     避免压过拖尾头部相对尾部的层次。 */
  var TRAIL_BOOST_NEAR = 6000;     // 离太阳 6000 单位内：基础亮度
  var TRAIL_BOOST_FAR = 60000;     // 拉远到 60000 单位：提亮封顶
  var TRAIL_BOOST_MAX = 0.5;       // 封顶幅度（乘数增量 1.0 → 1.5）

  function solarRadiusKpc() {
    return C.galaxy.distanceLy / LY_PER_KPC;
  }

  function unitsPerKpc() {
    return C.galaxy.radiusUnits / solarRadiusKpc();
  }

  function kpcToUnits(kpc) {
    return kpc * unitsPerKpc();
  }

  function normalizeQuality(name) {
    return counts[name] ? name : 'high';
  }

  function normalizeAngle(angle) {
    angle %= TAU;
    return angle < 0 ? angle + TAU : angle;
  }

  function normalizeRotation(angle) {
    angle %= TAU;
    if (angle > Math.PI) angle -= TAU;
    if (angle < -Math.PI) angle += TAU;
    return angle;
  }

  /* 固定种子使不同机器与 file:// 运行得到可复现的银河结构。 */
  function resetRandom(seed) {
    randomState = (seed >>> 0) || 1;
  }

  function random() {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  }

  /* 六个均匀变量之和的中心极限定理近似，足以生成盘厚和臂宽。 */
  function randn() {
    return random() + random() + random() + random() + random() + random() - 3;
  }

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function signedExponential(scale, limit) {
    var value = -scale * Math.log(Math.max(1e-6, 1 - random()));
    value = Math.min(value, limit);
    return random() < 0.5 ? -value : value;
  }

  /* 面密度 Sigma∝exp(-R/h) 对应的半径分布 p(R)∝R*exp(-R/h)。 */
  function diskRadius(scale, min, max) {
    var radius = min;
    for (var i = 0; i < 16; i++) {
      radius = -scale * Math.log(Math.max(1e-8, random() * random()));
      if (radius >= min && radius <= max) return radius;
    }
    return clamp(radius, min, max);
  }

  function ownGeometry(geometry) {
    geometries.push(geometry);
    return geometry;
  }

  function ownMaterial(material) {
    materials.push(material);
    return material;
  }

  function ownTexture(texture) {
    if (texture) textures.push(texture);
    return texture;
  }

  function radialTexture(rgb, power, size) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var cvs = document.createElement('canvas');
    cvs.width = cvs.height = size || 128;
    var ctx = cvs.getContext && cvs.getContext('2d');
    if (!ctx || !ctx.createRadialGradient) return null;

    var half = cvs.width / 2;
    var gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    for (var i = 0; i <= 10; i++) {
      var t = i / 10;
      gradient.addColorStop(t, 'rgba(' + rgb + ',' + Math.pow(1 - t, power || 2.4) + ')');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    return new THREE.CanvasTexture(cvs);
  }

  function init(sceneRef, quality, cameraRef) {
    scene = sceneRef;
    if (cameraRef) camera = cameraRef;
    var requestedQuality = normalizeQuality(quality || 'high');
    if (frame) {
      if (requestedQuality !== qualityName) setQuality(requestedQuality);
      refreshAnnotationFade();
      return;
    }
    qualityName = requestedQuality;

    frame = new THREE.Group();
    frame.rotation.x = C.galaxy.tiltDeg * C.astro.DEG;
    scene.add(frame);

    group = new THREE.Group();
    frame.add(group);

    tempPosition = new THREE.Vector3();
    buildGalaxy();
    built = true;
    applyPosition();

    var systemRoot = getSystemRoot();
    lastPos = systemRoot ? new THREE.Vector3().copy(systemRoot.position) : null;
    refreshAnnotationFade();
  }

  function makeBuckets() {
    var buckets = [];
    for (var i = 0; i < ringRadiusKpc.length; i++) {
      buckets.push({ positions: [], colors: [], haloPositions: [], haloColors: [] });
    }
    return buckets;
  }

  function ringIndex(radiusKpc) {
    for (var i = 0; i < ringBoundsKpc.length - 1; i++) {
      if (radiusKpc >= ringBoundsKpc[i] && radiusKpc < ringBoundsKpc[i + 1]) return i;
    }
    return ringRadiusKpc.length - 1;
  }

  /* 星等采用陡峭分布：约 93% 暗星、6% 中亮星、不到 1% 高亮星。 */
  function appendStar(buckets, xKpc, yKpc, zKpc, population) {
    var radius = Math.sqrt(xKpc * xKpc + zKpc * zKpc);
    var bucket = buckets[ringIndex(radius)];
    var scale = unitsPerKpc();
    var roll = random();
    var intensity;
    var bright = false;

    if (roll < 0.009) {
      intensity = 0.88 + random() * 0.12;
      bright = true;
    } else if (roll < 0.07) {
      intensity = 0.48 + random() * 0.32;
    } else {
      intensity = 0.16 + Math.pow(random(), 2.2) * 0.30;
    }

    var red;
    var green;
    var blue;
    if (population === 'bulge') {
      red = 1.00;
      green = 0.61 + random() * 0.17;
      blue = 0.35 + random() * 0.16;
    } else if (population === 'thick') {
      red = 1.00;
      green = 0.73 + random() * 0.14;
      blue = 0.49 + random() * 0.17;
    } else if (population === 'arm') {
      var young = random();
      if (young < 0.30) {
        red = 0.54 + random() * 0.12;
        green = 0.72 + random() * 0.16;
        blue = 1.00;
        if (young < 0.045) bright = true;
      } else {
        red = 0.88 + random() * 0.12;
        green = 0.88 + random() * 0.11;
        blue = 0.90 + random() * 0.10;
      }
    } else {
      red = 0.88 + random() * 0.12;
      green = 0.89 + random() * 0.11;
      blue = 0.91 + random() * 0.09;
    }

    bucket.positions.push(xKpc * scale, yKpc * scale, zKpc * scale);
    bucket.colors.push(red * intensity, green * intensity, blue * intensity);

    if (bright) {
      bucket.haloPositions.push(xKpc * scale, yKpc * scale, zKpc * scale);
      bucket.haloColors.push(red * Math.max(0.58, intensity), green * Math.max(0.58, intensity), blue * Math.max(0.58, intensity));
    }
  }

  function generateBulge(buckets, count) {
    var barHalf = MODEL.barLengthKpc * 0.5;
    var angle = MODEL.barAngleDeg * C.astro.DEG;
    var cosAngle = Math.cos(angle);
    var sinAngle = Math.sin(angle);

    for (var i = 0; i < count; i++) {
      var bx;
      var by;
      var bz;

      if (random() < 0.78) {
        /* 超椭圆式盒状棒；标高在棒的中段变大，形成轻微 box/peanut 轮廓。 */
        var raw = random() * 2 - 1;
        bx = (raw < 0 ? -1 : 1) * Math.pow(Math.abs(raw), 1.45) * barHalf;
        var axial = Math.abs(bx) / barHalf;
        var minorScale = 0.22 + 0.48 * (1 - axial * 0.55);
        bz = clamp(randn() * minorScale, -0.82, 0.82);
        var peanut = Math.exp(-Math.pow((axial - 0.52) / 0.28, 2));
        by = clamp(randn() * (0.16 + 0.27 * peanut), -0.72, 0.72);
      } else {
        /* 中央经典核球分量。 */
        var rr = Math.min(1.25, -0.38 * Math.log(Math.max(1e-6, 1 - random())));
        var az = random() * TAU;
        bx = rr * Math.cos(az);
        bz = rr * Math.sin(az) * 0.82;
        by = randn() * rr * 0.34;
      }

      var x = bx * cosAngle - bz * sinAngle;
      var z = bx * sinAngle + bz * cosAngle;
      appendStar(buckets, x, by, z, 'bulge');
    }
  }

  function generateDisk(buckets, count, thick) {
    var radialScale = thick ? MODEL.thickScaleKpc : MODEL.diskScaleKpc;
    var heightScale = thick ? MODEL.thickHeightKpc : MODEL.thinHeightKpc;
    var population = thick ? 'thick' : 'disk';

    for (var i = 0; i < count; i++) {
      var radius = diskRadius(radialScale, 0.45, MODEL.diskEdgeKpc);
      var angle = random() * TAU;
      var height = signedExponential(heightScale, heightScale * 3.4);
      appendStar(buckets, radius * Math.cos(angle), height, radius * Math.sin(angle), population);
    }
  }

  function spiralAngle(radius, phase) {
    return phase + Math.log(radius / MODEL.spiralR0Kpc) / MODEL.spiralB;
  }

  function generateLogArm(buckets, count, phase, widthFactor) {
    for (var i = 0; i < count; i++) {
      var baseRadius = MODEL.spiralR0Kpc + (MODEL.armOuterKpc - MODEL.spiralR0Kpc) * Math.pow(random(), 0.82);
      var width = (0.12 + baseRadius * 0.025) * widthFactor;
      var radius = clamp(baseRadius + randn() * width, 2.8, MODEL.armOuterKpc + 0.45);
      var angle = spiralAngle(baseRadius, phase) + randn() * width / Math.max(baseRadius, 1) * 0.72;
      var height = clamp(randn() * 0.105, -0.34, 0.34);
      appendStar(buckets, radius * Math.cos(angle), height, radius * Math.sin(angle), 'arm');
    }
  }

  function generateLocalSpur(buckets, count) {
    var solarKpc = solarRadiusKpc();
    for (var i = 0; i < count; i++) {
      var angle = -0.56 + random() * 1.10;
      /* 在太阳方位处臂脊约比 R0 外移 0.28 kpc，因此太阳位于 Orion Spur 内侧。 */
      var centerRadius = (solarKpc + 0.28) * Math.exp(MODEL.spiralB * angle);
      var radius = centerRadius + randn() * 0.18;
      angle += randn() * 0.022;
      var height = clamp(randn() * 0.075, -0.24, 0.24);
      appendStar(buckets, radius * Math.cos(angle), height, radius * Math.sin(angle), 'arm');
    }
  }

  function buildStarPopulation(count) {
    var buckets = makeBuckets();
    var bulgeCount = Math.floor(count * 0.18);
    var thinCount = Math.floor(count * 0.31);
    var thickCount = Math.floor(count * 0.12);
    var mainCount = Math.floor(count * 0.25);
    var sagittariusCount = Math.floor(count * 0.08);
    var localCount = count - bulgeCount - thinCount - thickCount - mainCount - sagittariusCount;
    var scutumCount = Math.floor(mainCount * 0.5);

    generateBulge(buckets, bulgeCount);
    generateDisk(buckets, thinCount, false);
    generateDisk(buckets, thickCount, true);

    /* 两条主臂：Scutum–Centaurus 与 Perseus，相位相差 180°。 */
    generateLogArm(buckets, scutumCount, 0.35, 1.0);
    generateLogArm(buckets, mainCount - scutumCount, 0.35 + Math.PI, 1.0);

    /* 次臂：Sagittarius；Local/Orion Spur 单独使用短弧生成。 */
    generateLogArm(buckets, sagittariusCount, 1.85, 0.78);
    generateLocalSpur(buckets, localCount);
    return buckets;
  }

  function geometryFromArrays(positions, colors) {
    var geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    if (colors && colors.length) {
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    }
    return geometry;
  }

  function buildStarLayers(buckets, starTexture, haloTexture) {
    var qualitySize = qualityName === 'high' ? 0.88 : (qualityName === 'medium' ? 0.96 : 1.08);
    var pointSize = C.galaxy.pointSize * qualitySize;
    var starMaterial = ownMaterial(new THREE.PointsMaterial({
      size: pointSize,
      sizeAttenuation: true,
      map: starTexture,
      alphaTest: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    var haloMaterial = ownMaterial(new THREE.PointsMaterial({
      size: pointSize * 2.65,
      sizeAttenuation: true,
      map: haloTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));

    starLayers = [];
    for (var i = 0; i < buckets.length; i++) {
      var layerGroup = new THREE.Group();
      layerGroup.rotation.y = layerPhases[i];
      group.add(layerGroup);

      var stars = new THREE.Points(geometryFromArrays(buckets[i].positions, buckets[i].colors), starMaterial);
      stars.frustumCulled = true;
      stars.geometry.computeBoundingSphere();
      layerGroup.add(stars);

      if (buckets[i].haloPositions.length) {
        var halos = new THREE.Points(geometryFromArrays(buckets[i].haloPositions, buckets[i].haloColors), haloMaterial);
        halos.frustumCulled = true;
        halos.geometry.computeBoundingSphere();
        layerGroup.add(halos);
      }

      starLayers.push({ group: layerGroup, radiusKpc: ringRadiusKpc[i] });
    }
  }

  function appendPosition(array, radius, angle, height) {
    var scale = unitsPerKpc();
    array.push(radius * Math.cos(angle) * scale, height * scale, radius * Math.sin(angle) * scale);
  }

  function buildArmFeatures(haloTexture, dustTexture) {
    armPatternGroup = new THREE.Group();
    armPatternGroup.rotation.y = patternPhase;
    group.add(armPatternGroup);

    var starCount = counts[qualityName];
    var dustCount = qualityName === 'high' ? 2800 : (qualityName === 'medium' ? 1550 : 760);
    var hiiCount = qualityName === 'high' ? 180 : (qualityName === 'medium' ? 100 : 52);
    var dustPositions = [];
    var hiiPositions = [];
    var hiiColors = [];
    var solarKpc = solarRadiusKpc();

    for (var i = 0; i < dustCount; i++) {
      var choice = random();
      var radius;
      var angle;
      if (choice > 0.94) {
        angle = -0.56 + random() * 1.10;
        radius = (solarKpc + 0.28) * Math.exp(MODEL.spiralB * angle);
      } else {
        var phase = choice < 0.40 ? 0.35 : (choice < 0.80 ? 0.35 + Math.PI : 1.85);
        radius = MODEL.spiralR0Kpc + (MODEL.armOuterKpc - MODEL.spiralR0Kpc) * Math.pow(random(), 0.84);
        angle = spiralAngle(radius, phase);
      }
      /* 尘埃冲击面位于臂脊内侧，软黑点通过正常 alpha 混合压暗恒星。 */
      radius -= 0.15 + radius * 0.020;
      radius += randn() * 0.105;
      angle += randn() * 0.014;
      appendPosition(dustPositions, radius, angle, randn() * 0.055);
    }

    var dustGeometry = geometryFromArrays(dustPositions, null);
    var dustMaterial = ownMaterial(new THREE.PointsMaterial({
      color: 0x09040b,
      size: C.galaxy.pointSize * (qualityName === 'low' ? 3.0 : 3.45),
      sizeAttenuation: true,
      map: dustTexture,
      transparent: true,
      opacity: 0.58,
      depthTest: false,
      depthWrite: false
    }));
    var dustPoints = new THREE.Points(dustGeometry, dustMaterial);
    dustPoints.renderOrder = 4;
    dustPoints.frustumCulled = true;
    dustPoints.geometry.computeBoundingSphere();
    armPatternGroup.add(dustPoints);

    for (var j = 0; j < hiiCount; j++) {
      var armChoice = random();
      var armPhase = armChoice < 0.43 ? 0.35 : (armChoice < 0.86 ? 0.35 + Math.PI : 1.85);
      var armRadius = 4.0 + (13.8 - 4.0) * Math.pow(random(), 0.82);
      var armAngle = spiralAngle(armRadius, armPhase) + randn() * 0.018;
      appendPosition(hiiPositions, armRadius + randn() * 0.10, armAngle, randn() * 0.045);
      var luminosity = 0.70 + random() * 0.30;
      hiiColors.push(luminosity, luminosity * (0.25 + random() * 0.18), luminosity * (0.50 + random() * 0.22));
    }

    var hiiGeometry = geometryFromArrays(hiiPositions, hiiColors);
    var hiiMaterial = ownMaterial(new THREE.PointsMaterial({
      size: C.galaxy.pointSize * 2.45,
      sizeAttenuation: true,
      map: haloTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    }));
    var hiiPoints = new THREE.Points(hiiGeometry, hiiMaterial);
    hiiPoints.renderOrder = 5;
    hiiPoints.frustumCulled = true;
    hiiPoints.geometry.computeBoundingSphere();
    hiiPoints.userData.population = 'HII regions';
    hiiPoints.userData.parentStarCount = starCount;
    armPatternGroup.add(hiiPoints);
  }

  function buildCore(coreTexture) {
    coreGlow = new THREE.Sprite(ownMaterial(new THREE.SpriteMaterial({
      map: coreTexture,
      color: 0xffd4a3,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })));
    coreGlow.scale.set(kpcToUnits(3.0), kpcToUnits(2.15), 1);
    coreGlow.renderOrder = 2;
    coreGlow.userData.structure = 'boxy/peanut bulge and bar';
    /* 银心光团默认不显示：径向渐变 sprite 在近处会糊成一片、
       掩盖核球与旋臂结构；需要柔光时把下面一行改成 true。 */
    coreGlow.visible = false;
    group.add(coreGlow);
  }

  /* ---------- 太阳公转拖尾 ----------
     真实的太阳轨道并不闭合：银河势不是开普勒势，椭圆会缓慢进动（形成玫瑰线），
     并且太阳还在银道面上下做准正弦振荡。画一个理想闭合圆等于宣称我们知道整个
     轨道形状，属于对模型的过度承诺；这里改为绘制太阳**实际走过**的轨迹拖尾：
     近端（当前位置）清晰，尾端只在末段 30% 内渐隐收细（TRAIL_FADE_RAMP），
     主体全程可读，与演示模式的行星拖尾同为加性混合 + 尾部渐隐的视觉语言。
     拖尾本身**始终显示**（不按相机位置淡出，任何机位都可见），仅随相机拉远
     整体轻微提亮（TRAIL_BOOST_*，封顶 ×1.5 不夸张）。 */
  var TRAIL_MAX = 2880;             // 采样点数：约为原来的 3.3 倍，延长可见历史
  var TRAIL_STEP = TAU / 2880;     // 每累计公转 0.125° 采样一次，避免长尾变成折线
  var TRAIL_FADE_RAMP = 0.3;        // 渐隐段只占尾部前 30%，其余 70% 保持全亮

  /* 拖尾着色器：与演示模式行星拖尾同源 —— 加性混合 + 沿轨迹渐隐，
     头部（太阳当前位置）最亮，尾部仅末段 30% 渐隐收细。 */
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

  function buildSunTrail() {
    if (!scene) return null;
    var geo = ownGeometry(new THREE.BufferGeometry());
    var pos = new Float32Array(TRAIL_MAX * 3);
    var fade = new Float32Array(TRAIL_MAX);
    /* index 0 = 尾端（最暗），末点 = 头部（最亮，即太阳当前位置）；
       渐隐压缩在尾部前 TRAIL_FADE_RAMP（30%）段内完成，其余保持全亮，
       拖尾主体清楚可读，只在末梢自然收细。 */
    for (var i = 0; i < TRAIL_MAX; i++) {
      var t = i / (TRAIL_MAX - 1);
      fade[i] = t >= TRAIL_FADE_RAMP ? 1 : Math.pow(t / TRAIL_FADE_RAMP, 1.4);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    geo.setDrawRange(0, 0);
    var mat = ownMaterial(new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(C.colors.accent) },
        uOpacity: { value: 0.70 }
      },
      vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    var line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.userData.label = 'Solar orbit (trail)';       // 标注层说明
    line.userData.baseOpacity = 0.70;                    // 基础不透明度（距离提亮的基准）
    group.add(line);
    sunTrail = { line: line, pos: pos, max: TRAIL_MAX, count: 0 };
    return line;
  }

  function pushSunTrail(x, y, z) {
    if (!sunTrail) return;
    if (sunTrail.count < sunTrail.max) {
      var w = sunTrail.count * 3;
      sunTrail.pos[w] = x; sunTrail.pos[w + 1] = y; sunTrail.pos[w + 2] = z;
      sunTrail.count += 1;
    } else {
      /* 满了：整体前移一格（与行星拖尾同一做法），再写入末点 */
      sunTrail.pos.copyWithin(0, 3);
      var last = (sunTrail.max - 1) * 3;
      sunTrail.pos[last] = x; sunTrail.pos[last + 1] = y; sunTrail.pos[last + 2] = z;
    }
    sunTrail.line.geometry.setDrawRange(0, sunTrail.count);
    sunTrail.line.geometry.attributes.position.needsUpdate = true;
  }

  function pushSegment(positions, colors, ax, ay, az, bx, by, bz, color) {
    positions.push(ax, ay, az, bx, by, bz);
    colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
  }

  function buildSolarIndicator(haloTexture) {
    solarIndicator = new THREE.Group();
    solarIndicator.name = 'Solar position at R0';
    solarIndicator.userData.galactocentricDistanceKpc = solarRadiusKpc();
    group.add(solarIndicator);

    var marker = new THREE.Sprite(ownMaterial(new THREE.SpriteMaterial({
      map: haloTexture,
      color: C.colors.accent,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false
    })));
    marker.scale.set(C.galaxy.pointSize * 7.0, C.galaxy.pointSize * 7.0, 1);
    marker.userData.label = 'Sun / Orion Spur inner edge';
    marker.userData.baseOpacity = 0.92;       // 标注层淡出用
    solarIndicator.add(marker);

    var positions = [];
    var colors = [];
    var velocityLength = C.galaxy.radiusUnits * 0.13;
    var head = velocityLength * 0.16;
    var cyan = [0.50, 0.99, 0.85];
    var gold = [1.00, 0.68, 0.30];

    /* 局部 +Z 是圆周切向；箭头随太阳方位一起旋转。 */
    pushSegment(positions, colors, 0, 0, 0, 0, 0, velocityLength, cyan);
    pushSegment(positions, colors, 0, 0, velocityLength, -head, 0, velocityLength - head, cyan);
    pushSegment(positions, colors, 0, 0, velocityLength, head, 0, velocityLength - head, cyan);

    /* Schönrich 等常用太阳本动 (U,V,W)≈(11.1,12.24,7.25) km/s；U 指向银心。 */
    var u = 11.1;
    var v = 12.24;
    var w = 7.25;
    var norm = Math.sqrt(u * u + v * v + w * w);
    var peculiarLength = C.galaxy.radiusUnits * 0.062;
    pushSegment(positions, colors, 0, 0, 0,
      -u / norm * peculiarLength,
      w / norm * peculiarLength,
      v / norm * peculiarLength,
      gold);

    var geometry = geometryFromArrays(positions, colors);
    velocityVectors = new THREE.LineSegments(geometry, ownMaterial(new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthTest: false,
      depthWrite: false
    })));
    velocityVectors.userData.label = 'LSR velocity and solar peculiar motion';
    velocityVectors.userData.baseOpacity = 0.72;   // 标注层淡出用
    /* 默认不显示这段速度箭头。它画在 4200 单位外（银心方向）指向太阳系，
       而相机在太阳系内时它会横穿整个画面——用户实测反馈"像场景里一个绿色大箭头"，
       视觉干扰远大于信息价值。银河系全景与该标注的取舍由这里控制，需要时改回 true。 */
    velocityVectors.visible = false;
    velocityVectors.frustumCulled = false;
    /* 保留对象以兼容旧调试引用，但不挂入场景，彻底移除远景速度箭头和本动线。 */
    updateSolarIndicator();
  }

  function buildGalaxy() {
    disposeGalaxy();
    resetRandom(0x5f3759df);

    var starTexture = ownTexture(radialTexture('255,255,255', 6.2, 64));
    var haloTexture = ownTexture(radialTexture('255,255,255', 2.5, 128));
    var dustTexture = ownTexture(radialTexture('255,255,255', 1.7, 96));
    var coreTexture = ownTexture(radialTexture('255,224,184', 2.7, 192));

    var buckets = buildStarPopulation(counts[qualityName]);
    buildStarLayers(buckets, starTexture, haloTexture);
    buildArmFeatures(haloTexture, dustTexture);
    buildCore(coreTexture);
    buildSunTrail();
    buildSolarIndicator(haloTexture);
  }

  function disposeGalaxy() {
    if (group && group.children) {
      while (group.children.length) group.remove(group.children[group.children.length - 1]);
    }

    for (var i = 0; i < geometries.length; i++) {
      if (geometries[i] && geometries[i].dispose) geometries[i].dispose();
    }
    for (var j = 0; j < materials.length; j++) {
      if (materials[j] && materials[j].dispose) materials[j].dispose();
    }
    for (var k = 0; k < textures.length; k++) {
      if (textures[k] && textures[k].dispose) textures[k].dispose();
    }

    geometries.length = 0;
    materials.length = 0;
    textures.length = 0;
    starLayers.length = 0;
    coreGlow = null;
    /* 拖尾挂在 group 下；group 子树已整体摘除，这里兜底再摘一次（防御性）。 */
    if (sunTrail && sunTrail.line && sunTrail.line.parent) {
      sunTrail.line.parent.remove(sunTrail.line);
    }
    solarIndicator = null;
    velocityVectors = null;
    armPatternGroup = null;
  }

  function getSystemRoot() {
    return SOLAR.Scene && SOLAR.Scene.getSystemRoot ? SOLAR.Scene.getSystemRoot() : null;
  }

  /* 太阳相对银道面的垂直振荡：现实中的太阳不在银道面上做平面圆周运动，
     而是在银道面上下准正弦振荡（周期约 6500 万年、振幅约 250 光年），
     J2000 时刻位于银道面以北约 65 光年。相位用 totalOrbitAngle（不取模的
     累计角）计算，保证跨银河年时垂直位置连续无跳变。 */
  function verticalUnits() {
    return kpcToUnits(C.galaxy.verticalAmpLy / LY_PER_KPC);
  }
  function verticalPhase() {
    var phase0 = Math.asin(Math.min(1, C.galaxy.verticalOffsetLy / C.galaxy.verticalAmpLy));
    return totalOrbitAngle * (C.galaxy.yearMyr / C.galaxy.verticalPeriodMyr) + phase0;
  }
  function planeHeightLy() {
    return C.galaxy.verticalAmpLy * Math.sin(verticalPhase());
  }

  function updateSolarIndicator() {
    if (!solarIndicator) return;
    var radius = C.galaxy.radiusUnits;
    solarIndicator.position.set(
      radius * Math.cos(theta),
      verticalUnits() * Math.sin(verticalPhase()),
      radius * Math.sin(theta)
    );
    solarIndicator.rotation.y = -theta;
  }

  function smoothstep01(t) {
    if (!(t > 0)) return 0;
    if (t >= 1) return 1;
    return t * t * (3 - 2 * t);
  }

  /* 按基准不透明度缩放一组对象（含直接子对象）的透明度，并整体显隐。 */
  function applyFade(object, fade) {
    if (!object) return;
    var ud = object.userData || {};
    if (typeof ud.baseOpacity === 'number' && object.material) {
      object.material.opacity = ud.baseOpacity * fade;
    }
    if (object.children) {
      for (var i = 0; i < object.children.length; i++) {
        var child = object.children[i];
        var cud = child.userData || {};
        if (typeof cud.baseOpacity === 'number' && child.material) {
          child.material.opacity = cud.baseOpacity * fade;
        }
      }
    }
    object.visible = fade > 0.004;
  }

  /**
   * 标注层按相机距离淡出 + 太阳拖尾的距离提亮。
   * 太阳位置标记（薄荷绿加色 sprite，depthTest:false）与速度矢量都是
   * 「从远处看银河」的示意图：相机贴近太阳时标记正好落在视点位置，
   * 会以加色混合罩住整个视野，把太阳染成蓝绿色，故在此距离内淡出。
   * 太阳公转拖尾则相反——任何机位始终显示（旧实现按相机径向位置淡出，
   * 太阳系近景/俯视机位会整条消失），只随相机拉远做封顶的轻微提亮。
   */
  function refreshAnnotationFade() {
    if (!frame) return;
    var sunFade = 1;
    var trailBoost = 1;
    var span = ANNOTATION_FAR_UNITS - ANNOTATION_NEAR_UNITS;
    if (span <= 0) span = 1;

    if (camera && camera.position) {
      if (!annotationVec) annotationVec = new THREE.Vector3();
      if (!lodOrigin) lodOrigin = new THREE.Vector3();
      frame.updateMatrixWorld();
      frame.getWorldPosition(lodOrigin);
      var galaxyDistance = camera.position.distanceTo(lodOrigin);
      var galaxyNear = galaxyDistance < ANNOTATION_NEAR_UNITS * 2.2;
      for (var li = 0; li < starLayers.length; li++) starLayers[li].group.visible = !galaxyNear;
      if (armPatternGroup) armPatternGroup.visible = !galaxyNear;

      /* 相机到太阳位置标记的距离（标记与太阳同处，故等于相机到太阳的距离） */
      annotationVec.set(
        C.galaxy.radiusUnits * Math.cos(theta),
        verticalUnits() * Math.sin(verticalPhase()),
        C.galaxy.radiusUnits * Math.sin(theta)
      );
      frame.localToWorld(annotationVec);
      var sunDistance = camera.position.distanceTo(annotationVec);
      sunFade = smoothstep01((sunDistance - ANNOTATION_NEAR_UNITS) / span);

      /* 拖尾提亮只看相机离太阳多远：近处 1.0，拉远封顶 1+TRAIL_BOOST_MAX。
         注意：uOpacity 是拖尾着色器真正读取的 uniform，material.opacity
         对自定义 ShaderMaterial 无效，必须写 uniforms.uOpacity。 */
      trailBoost = 1 + TRAIL_BOOST_MAX *
        smoothstep01((sunDistance - TRAIL_BOOST_NEAR) / (TRAIL_BOOST_FAR - TRAIL_BOOST_NEAR));
    }

    applyFade(solarIndicator, sunFade);
    /* 速度矢量属于远景说明层，在 build 处默认永久关闭。 */
    if (sunTrail && sunTrail.line && sunTrail.line.material && sunTrail.line.material.uniforms) {
      sunTrail.line.visible = true;
      sunTrail.line.material.uniforms.uOpacity.value =
        sunTrail.line.userData.baseOpacity * trailBoost;
    }
  }

  /* 把整个太阳系放到绕银心轨道上的当前位置；不在这里改 lastPos，以便 consumeDelta 得到真实增量。 */
  function applyPosition() {
    updateSolarIndicator();
    var systemRoot = getSystemRoot();
    if (!systemRoot || !frame) return;
    if (!tempPosition) tempPosition = new THREE.Vector3();
    if (!trailPosition) trailPosition = new THREE.Vector3();

    tempPosition.set(
      C.galaxy.radiusUnits * Math.cos(theta),
      verticalUnits() * Math.sin(verticalPhase()),
      C.galaxy.radiusUnits * Math.sin(theta)
    );
    frame.localToWorld(tempPosition);
    systemRoot.position.copy(tempPosition);
    /* 拖尾挂在银河 group 下，必须写入 group 局部坐标；直接写世界坐标会被
       frame/group 变换再次叠加，视觉上就会从太阳中心偏出去。 */
    trailPosition.copy(tempPosition);
    group.worldToLocal(trailPosition);
    pushSunTrail(trailPosition.x, trailPosition.y, trailPosition.z);
  }

  function updateDifferentialRotation(orbitStep) {
    var solarKpc = solarRadiusKpc();
    for (var i = 0; i < layerPhases.length; i++) {
      /* 平坦旋转曲线 v≈常数，因此 omega=v/R，归一到太阳角速度即 R0/R。 */
      var omegaRatio = solarKpc / ringRadiusKpc[i];
      layerPhases[i] = normalizeRotation(layerPhases[i] - orbitStep * omegaRatio * MODEL.kinematicVisualScale);
      if (starLayers[i]) starLayers[i].group.rotation.y = layerPhases[i];
    }

    /* 旋臂/HII/尘埃作为密度波图样较慢转动，不逐顶点更新。 */
    patternPhase = normalizeRotation(patternPhase - orbitStep * MODEL.patternVisualScale);
    if (armPatternGroup) armPatternGroup.rotation.y = patternPhase;
  }

  /**
   * 每帧推进：dt 为真实秒。
   * 基础太阳轨道速率 = 一圈 / orbitSeconds，倍速仍按原 API 的 1+log10(speed) 加成。
   */
  function update(dt) {
    refreshAnnotationFade();
    if (!built || !SOLAR.time || !SOLAR.time.playing) return;
    if (!(dt > 0) || !isFinite(dt)) return;

    var speed = Math.max(1, SOLAR.time.speed || 1);
    var boost = 1 + Math.log(speed) / Math.LN10;
    var direction = SOLAR.time.reverse ? -1 : 1;
    var orbitStep = direction * (TAU / C.galaxy.orbitSeconds) * boost * dt;

    theta = normalizeAngle(theta + orbitStep);
    totalOrbitAngle += orbitStep;
    updateDifferentialRotation(orbitStep);
    applyPosition();
  }

  /* 返回自上次调用以来太阳系的世界坐标位移，供相机同步平移。 */
  function consumeDelta(out) {
    var systemRoot = getSystemRoot();
    if (!systemRoot) {
      if (out) out.set(0, 0, 0);
      return out;
    }

    if (!lastPos) {
      lastPos = new THREE.Vector3().copy(systemRoot.position);
      if (out) out.set(0, 0, 0);
      return out;
    }

    if (out) out.copy(systemRoot.position).sub(lastPos);
    lastPos.copy(systemRoot.position);
    return out;
  }

  function getInfo() {
    var progress = normalizeAngle(theta) / TAU;
    var orbitCount = totalOrbitAngle / TAU;
    var completedOrbits = orbitCount < 0 ? Math.ceil(orbitCount) : Math.floor(orbitCount);
    var longitude = progress * 360;
    var bDeg = Math.asin(Math.max(-1, Math.min(1, planeHeightLy() / C.galaxy.distanceLy))) / C.astro.DEG;

    return {
      progress: progress * 100,
      travelledLy: progress * TAU * C.galaxy.distanceLy,
      speedKms: C.galaxy.speedKms,
      distanceLy: C.galaxy.distanceLy,
      yearMyr: C.galaxy.yearMyr,
      orbitSeconds: C.galaxy.orbitSeconds,

      /* l 为银心方位角；b 由垂直振荡实时给出——现实太阳在银道面上下振荡，
         当前（J2000）约 +65 ly，而不是理想的平面圆轨道 b=0。 */
      galacticLongitudeDeg: longitude,
      galacticLatitudeDeg: bDeg,
      planeHeightLy: planeHeightLy(),
      l: longitude,
      b: bDeg * C.astro.DEG,
      lDeg: longitude,
      bDeg: bDeg,
      distanceKpc: solarRadiusKpc(),
      galactocentricDistanceKpc: solarRadiusKpc(),
      galactocentricDistanceLy: C.galaxy.distanceLy,
      orbitCount: orbitCount,
      completedOrbits: completedOrbits,
      totalTravelledLy: Math.abs(totalOrbitAngle) * C.galaxy.distanceLy,
      pitchAngleDeg: Math.atan(MODEL.spiralB) / C.astro.DEG,
      barAngleDeg: MODEL.barAngleDeg
    };
  }

  function setQuality(name) {
    var next = normalizeQuality(name);
    if (next === qualityName) return;
    qualityName = next;
    if (built) buildGalaxy();
    refreshAnnotationFade();
  }

  /* 教学模式等场景需要干净的背景时隐藏整个银河系（含银盘、核球、标注、太阳指示器）。
     只影响 frame 这棵子树；systemRoot 独立于 frame，不受影响。 */
  function setVisible(on) {
    if (!frame) return false;
    frame.visible = !!on;
    return frame.visible;
  }

  function isVisible() {
    return !!(frame && frame.visible);
  }

  return {
    init: init,
    update: update,
    consumeDelta: consumeDelta,
    getInfo: getInfo,
    setQuality: setQuality,
    setVisible: setVisible,
    isVisible: isVisible
  };
})();
