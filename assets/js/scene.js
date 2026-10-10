/**
 * 场景门面：渲染器 / 相机 / systemRoot 装配、画质档调度、显示比例档、分层 Bloom、天体标签、对外接口
 * 依赖：three.min.js（全局 THREE，r128）、config.js、data.js、i18n.js
 *       scene-shared.js（SOLAR.SceneShared：S 场景节点表与临时向量 / U 共享 uniform）
 *       scene-shaders.js（SOLAR.Shaders）、scene-gfx.js（SOLAR.Gfx）
 *       scene-sun.js（SOLAR.Sun）、scene-bodies.js（SOLAR.Bodies）、scene-backdrop.js（SOLAR.Backdrop）
 *       （astro.js 不再由本文件直接调用，经 SOLAR.Bodies.* 间接使用）
 * 可选：effects.js（后期）/ galaxy.js（银河公转，缺失时各有兜底）
 *
 * 为什么只剩门面：太阳、行星/卫星/彗星、星空与两条粒子带已分别拆到 scene-sun /
 * scene-bodies / scene-backdrop，纹理与随机流等共用工具在 scene-gfx，GLSL 源码在
 * scene-shaders，共享节点表在 scene-shared。本文件只留四类东西：
 *   1. 渲染器 / 相机 / 太阳系根节点的生命周期与 init 装配顺序；
 *   2. 画质档（QUAL/SEGMENTS）与切档分帧调度——一次切档要穿过多个子模块；
 *   3. 共享显示倍率（S.scaleFactors）与 config.profiles 的映射应用，同样是横切关注点；
 *   4. 分层 Bloom 图层登记（要遍历太阳、行星、卫星、星芒三处的对象）、天体标签，
 *      以及 controls / main / galaxy / effects 在用的对外查询接口。
 * 横切的逐帧 update 也留在此处。
 *
 * 跨模块调用一律用运行时限定名（SOLAR.Sun.* / SOLAR.Bodies.* / SOLAR.Backdrop.* / SOLAR.Gfx.*）：
 * 不得在 IIFE 顶层缓存别的模块的函数引用——拆分后各文件可独立演进，
 * 顶层缓存会让「只改一边、漏另一边」。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Scene = (function () {
  'use strict';

  /* 门面不再直接调 astro.js：开普勒解算与轨道采样都走 SOLAR.Bodies.* / 子模块 */
  var C = SOLAR.CONFIG, D = SOLAR.DATA;
  var DEG = C.astro.DEG;

  /* 共享状态注册表：scene-shared.js 先于本文件加载，S 只改字段、从不整体替换 */
  var S = SOLAR.SceneShared.S;
  /* 共享 uniform（多个材质共用同一对象，更新一次即全部生效） */
  var U = SOLAR.SceneShared.U;

  /* ============ 画质细节档（不改动 config.js，仅本模块内部） ============ */

  var QUAL = {
    ultra: { seg: 'xh', bump: 1, moonShadow: 2, ringShadow: 1, corona: 2, spikes: true,  beltDetail: 2, starSpikes: 1.6 },
    high:   { seg: 'h', bump: 1, moonShadow: 2, ringShadow: 1, corona: 2, spikes: true,  beltDetail: 1, starSpikes: 1.0 },
    medium: { seg: 'm', bump: 1, moonShadow: 1, ringShadow: 1, corona: 1, spikes: true,  beltDetail: 1, starSpikes: 0.8 },
    low:    { seg: 'l', bump: 0, moonShadow: 0, ringShadow: 0, corona: 1, spikes: false, beltDetail: 0, starSpikes: 0.0 }
  };
  var SEGMENTS = { xh: [128, 96], h: [64, 48], m: [48, 32], l: [32, 24] };
  /* 太阳分段表由 scene-sun.js 持有并导出：buildSun 建几何与 applyQualityDetail
      切画质重建查同一张表，避免两处各存一份、改一边漏一边。 */

  /* ============ 初始化 ============ */

  /* 画质档给出的是「希望的 DPR」，并非无条件承诺。EffectComposer 和分层 bloom
      会额外持有全/半分辨率 RenderTarget；仅在 4K 面板上使用 4× DPR 就可能超过
      数亿像素，context lost 发生时自适应降档已经来不及补救。
      这里同时受配置像素预算、MAX_TEXTURE_SIZE 和 MAX_RENDERBUFFER_SIZE 约束。 */
  function renderWidth() { return Math.max(1, window.innerWidth || (S.nodes.canvas && S.nodes.canvas.clientWidth) || 1); }
  function renderHeight() { return Math.max(1, window.innerHeight || (S.nodes.canvas && S.nodes.canvas.clientHeight) || 1); }

  function hardwarePixelRatioLimit(width, height) {
    var limit = Infinity;
    var maxTexture = S.nodes.renderer && S.nodes.renderer.capabilities ? S.nodes.renderer.capabilities.maxTextureSize : 0;
    var maxRenderbuffer = 0;
    if (S.nodes.renderer && S.nodes.renderer.getContext) {
      try {
        var gl = S.nodes.renderer.getContext();
        if (gl && gl.getParameter) maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0;
      } catch (ignore) { /* 能力查询失败时仍由像素预算保护 */ }
    }
    if (maxTexture > 0) limit = Math.min(limit, maxTexture / width, maxTexture / height);
    if (maxRenderbuffer > 0) limit = Math.min(limit, maxRenderbuffer / width, maxRenderbuffer / height);
    return limit;
  }

  function pixelRatioFor(requested) {
    var width = renderWidth(), height = renderHeight();
    var device = window.devicePixelRatio || 1;
    var cap = C.render.pixelRatioCap > 0 ? C.render.pixelRatioCap : device;
    var ratio = Math.min(device, requested > 0 ? requested : 1, cap);
    var maxPixels = C.render.maxRenderPixels;
    if (maxPixels > 0) ratio = Math.min(ratio, Math.sqrt(maxPixels / (width * height)));
    ratio = Math.min(ratio, hardwarePixelRatioLimit(width, height));
    /* 极端尺寸下宁可继续降分辨率，也不能为满足最低值超出硬件纹理尺寸。 */
    if (!(ratio > 0) || !isFinite(ratio)) ratio = 1;
    return ratio;
  }

  function applyPixelRatio(requested) {
    if (!S.nodes.renderer) return 1;
    S.effectivePixelRatio = pixelRatioFor(requested);
    S.nodes.renderer.setPixelRatio(S.effectivePixelRatio);
    return S.effectivePixelRatio;
  }

  function init(canvasEl, onProgress) {
    S.nodes.canvas = canvasEl;

    /* URL `#seed=...` 优先于 config.procedural.seed：方便截图时换一批粒子而不改文件。 */
    var hashSeed = SOLAR.Gfx.seedFromHash();
    if (hashSeed !== null) S.proceduralSeed = hashSeed;

    S.tmpV1 = new THREE.Vector3();
    S.tmpV2 = new THREE.Vector3();
    S.tmpV3 = new THREE.Vector3();
    S.baryLocal = new THREE.Vector3();
    U.sunPos.value = new THREE.Vector3();

    S.manager = new THREE.LoadingManager();
    S.manager.onProgress = function (url, loaded, total) { if (onProgress) onProgress(loaded / total); };
    S.manager.onLoad = function () { if (onProgress) onProgress(1); };
    S.texLoader = new THREE.TextureLoader(S.manager);

    S.nodes.renderer = new THREE.WebGLRenderer({ canvas: S.nodes.canvas, antialias: C.render.antialias, powerPreference: 'high-performance' });
    /* 统计跨后期通道累计：three.js 默认在每次 render() 前清零 info，
       经 EffectComposer 后只剩最后一个全屏通道的 2 个三角形。改为手动清零。 */
    if (S.nodes.renderer.info) S.nodes.renderer.info.autoReset = false;
    S.qualityName = 'high';
    S.quality = C.quality.high;
    S.qv = QUAL.high;
    applyPixelRatio(S.quality.pixelRatio);
    S.nodes.renderer.setSize(renderWidth(), renderHeight());
    if (THREE.sRGBEncoding) S.nodes.renderer.outputEncoding = THREE.sRGBEncoding;

    S.nodes.scene = new THREE.Scene();
    S.nodes.scene.background = new THREE.Color(C.colors.background);

    S.nodes.camera = new THREE.PerspectiveCamera(C.render.fov, window.innerWidth / window.innerHeight, C.render.near, C.render.far);
    var home = C.views.home;
    S.nodes.camera.position.set(home.pos[0], home.pos[1], home.pos[2]);
    S.nodes.camera.lookAt(0, 0, 0);

    /* 太阳系根节点：整体随银河系公转平移 */
    S.nodes.systemRoot = new THREE.Group();
    S.nodes.scene.add(S.nodes.systemRoot);

    buildLights();
    SOLAR.Sun.buildSun();
    SOLAR.Bodies.buildPlanets();
    SOLAR.Bodies.buildComets();
    SOLAR.Backdrop.buildStarfield();
    SOLAR.Backdrop.buildSkyDome();
    SOLAR.Backdrop.buildBelts();
    S.orbitEpochJd = SOLAR.Bodies.currentOrbitEpoch();
    updateProjectionScale();
    applyScaleProfile();      // 先应用比例档的映射参数
    applyScaleMode();         // 再应用天体额外放大倍率
    registerBloomLayer();   // 场景结构就绪后登记 bloom 层成员

    return { scene: S.nodes.scene, camera: S.nodes.camera, renderer: S.nodes.renderer };
  }

  function buildLights() {
    S.nodes.sunLight = new THREE.PointLight(0xffffff, 2.4, 0, 1);
    S.nodes.systemRoot.add(S.nodes.sunLight);
    S.nodes.systemRoot.add(new THREE.AmbientLight(0xffffff, 0.07));
  }

  /* 球体几何体按画质缓存 */
  function sphereGeo(level) {
    if (!S.sphereGeos[level]) {
      var s = SEGMENTS[level] || SEGMENTS.m;
      S.sphereGeos[level] = new THREE.SphereGeometry(1, s[0], s[1]);
    }
    return S.sphereGeos[level];
  }

  /* 大气壳：菲涅尔辉光无需高精度球面，固定低细分以省三角面 */
  function atmoGeo() {
    if (!S.sphereGeos.atmo) S.sphereGeos.atmo = new THREE.SphereGeometry(1, 32, 24);
    return S.sphereGeos.atmo;
  }

  /* 卫星：尺寸小，最多用到中档细分 */
  function moonSegLevel() { return (S.qv.seg === 'l') ? 'l' : 'm'; }

  /* ---------- 分层 Bloom：发光体 / 遮挡体注册 ---------- */
  /* 每次场景结构变化（初始化、切画质重建星空）都要重新收集一次：
      对象会被销毁重建，而 bloom 层持有的是对象引用。 */

  /* --- 分层 Bloom 的图层划分 --- */
  /* 主画面仍走 layer 0；bloom 层只渲染下面两层：
        LAYER_BLOOM_OCC  ：不透明的行星 / 卫星球体，bloom 层里临时换成纯黑材质，
                          只为写深度——否则行星挡住太阳时辉光会穿透行星。
        LAYER_BLOOM_EMIT ：自发光物体（太阳本体 / 日冕 / 光晕 / 大气辉光 / 地球夜面灯光 / 亮星星芒）。 */
  var LAYER_BLOOM_OCC = 1;
  var LAYER_BLOOM_EMIT = 2;
  var BLOOM_LAYER_MASK = (1 << LAYER_BLOOM_OCC) | (1 << LAYER_BLOOM_EMIT);

  function occluderMaterial() {
    if (!S.bloomOccMat) S.bloomOccMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    return S.bloomOccMat;
  }

  /* --- 地球夜光材质变体（分层 Bloom 专用） --- */
  /* 地球的城市灯光烘焙在与表面同一张材质里，无法靠阈值从受光面中分离出来。
     这里给 bloom 层单独准备一套「只输出夜面灯光」的材质：白天侧纯黑、夜侧保留灯光。
     它同时写深度，因此地球依然能正确遮挡太阳。
     uniform 直接复用地球主材质的同一批对象，贴图异步就绪后自动生效。 */
  function nightMaterial(uniforms) {
    if (S.bloomNightMat || !uniforms) return S.bloomNightMat;
    S.bloomNightMat = new THREE.ShaderMaterial({
      uniforms: {
        uNightMap: uniforms.uNightMap,
        uNightStrength: uniforms.uNightStrength,
        uSunPos: U.sunPos
      },
      vertexShader: SOLAR.Shaders.NIGHT_VERT, fragmentShader: SOLAR.Shaders.NIGHT_FRAG
    });
    return S.bloomNightMat;
  }

  function registerBloomLayer() {
    S.bloomLayerItems.length = 0;

    function add(obj, mat, layer) {
      if (!obj) return;
      /* 关键：three.js 的 projectObject 在 Group 上就会用 layers 做剪枝——
         祖先 Group 不通过 layers.test，整棵子树都不会被遍历，bloom 层会一片空白。
         所以必须沿 parent 链一路 enable；叶子对象最终仍各自再判定一次，
         因此同层的兄弟对象（轨道线 / 拖尾 / 小行星带 / 标签）不会被误渲染。 */
      var o = obj;
      while (o) { o.layers.enable(layer); o = o.parent; }
      S.bloomLayerItems.push({ obj: obj, mat: mat || null, saved: null });
    }

    /* 太阳本体 / 日冕 / 光晕 */
    add(S.nodes.sunMesh, null, LAYER_BLOOM_EMIT);
    for (var i = 0; i < S.nodes.coronaShells.length; i++) add(S.nodes.coronaShells[i], null, LAYER_BLOOM_EMIT);
    add(S.nodes.sunGlow, null, LAYER_BLOOM_EMIT);
    /* 黑子不发光，但必须在 Bloom RT 中作为黑色遮挡体存在，
       否则后处理泛光会在主画面之后把黑子重新冲淡。 */
    for (var si = 0; si < S.nodes.sunSpots.length; si++) {
      add(S.nodes.sunSpots[si].mesh, occluderMaterial(), LAYER_BLOOM_OCC);
    }

    /* 行星：大气辉光发光；球体本身只做遮挡；地球换成夜光材质变体（既发光又遮挡） */
    for (var j = 0; j < S.nodes.planets.length; j++) {
      var p = S.nodes.planets[j];
      if (p.glowMesh) add(p.glowMesh, null, LAYER_BLOOM_EMIT);
      if (p.id === 'earth') add(p.mesh, nightMaterial(p.uniforms), LAYER_BLOOM_EMIT);
      else add(p.mesh, occluderMaterial(), LAYER_BLOOM_OCC);
      for (var k = 0; k < p.moons.length; k++) add(p.moons[k].mesh, occluderMaterial(), LAYER_BLOOM_OCC);
    }

    /* 亮星十字星芒：加入发光层（其材质 depthWrite=false，贴着相机也不会遮挡太阳） */
    add(S.nodes.starSpikes, null, LAYER_BLOOM_EMIT);
  }

  /* 进入 bloom 层：临时换上该层专用材质，返回相机应使用的 layers 掩码 */
  function beginBloomLayer() {
    for (var i = 0; i < S.bloomLayerItems.length; i++) {
      var it = S.bloomLayerItems[i];
      if (!it.obj) continue;
      it.saved = it.obj.material;
      if (it.mat && it.mat !== it.saved) it.obj.material = it.mat;
    }
    return BLOOM_LAYER_MASK;
  }

  /* 退出 bloom 层：还原主画面材质 */
  function endBloomLayer() {
    for (var i = 0; i < S.bloomLayerItems.length; i++) {
      var it = S.bloomLayerItems[i];
      if (it.saved && it.obj) it.obj.material = it.saved;
      it.saved = null;
    }
  }

  /* ============ 每帧更新 ============ */

  function update(jd, simDaysValue, dt) {
    /* 每帧手动清零渲染统计（autoReset 已关闭），保证本帧结束时读到的是整帧总量 */
    if (S.nodes.renderer && S.nodes.renderer.info) S.nodes.renderer.info.reset();

    S.simDays = simDaysValue;
    S.elapsed += dt;
    U.time.value = S.elapsed;

    /* 气态动效相位只在开关开启时累积：淡入时流速由 0 渐增，
       关闭时相位冻结，反复切换都不跳变 */
    S.gasAmt += (S.gasTarget - S.gasAmt) * Math.min(1, dt * 2.5);
    if (S.gasAmt < 0.001) S.gasAmt = 0;
    else U.gasT.value += dt * S.gasAmt;

    SOLAR.Sun.updateSunFlares();

    if (Math.abs(S.align.amount - S.align.target) > 0.001) {
      S.align.amount += (S.align.target - S.align.amount) * Math.min(1, dt * 3.2);
    } else {
      S.align.amount = S.align.target;
    }

    /* main.js 已先推进银河公转；此处读取的是本帧最终 systemRoot 世界坐标。 */
    U.sunPos.value.copy(S.nodes.systemRoot.position);

    var i, p;

    /* 辉带按仰角淡入淡出：正俯视与远观时点云亮度不足，靠辉带补；
       侧视时粒子沿视线重叠已够亮，且贴近盘面会让辉带糊屏 */
    if (S.nodes.bandObjects.length) {
      var camY = S.nodes.camera.position.y - S.nodes.systemRoot.position.y;
      var camX = S.nodes.camera.position.x - S.nodes.systemRoot.position.x;
      var camZ = S.nodes.camera.position.z - S.nodes.systemRoot.position.z;
      var elev = Math.abs(camY) / Math.max(Math.sqrt(camX * camX + camY * camY + camZ * camZ), 1e-3);
      var ft = (elev - 0.05) / 0.45;
      ft = ft < 0 ? 0 : (ft > 1 ? 1 : ft);
      var bandFade = ft * ft * (3 - 2 * ft);
      for (i = 0; i < S.nodes.bandObjects.length; i++) {
        S.nodes.bandObjects[i].material.uniforms.uFade.value = bandFade;
      }
    }
    for (i = 0; i < S.nodes.planets.length; i++) SOLAR.Bodies.updatePlanet(S.nodes.planets[i], jd);
    SOLAR.Bodies.updateComets(jd);
    /* 卫星可挂在母星赤道 tilt 子树内，阴影 uniform 必须读取最终世界矩阵。 */
    S.nodes.systemRoot.updateMatrixWorld(true);
    SOLAR.Bodies.updateShadowUniforms();
    S.adaptiveUpdateAccum += dt;
    S.secondaryUpdateAccum += dt;
    S.labelUpdateAccum += dt;
    if (S.adaptiveUpdateAccum >= 1 / 20) {
      S.adaptiveUpdateAccum = 0;
      SOLAR.Sun.updateSunAdaptive();
    }

    /* 地球云层缓慢漂移 */
    var earth = S.nodes.bodyIndex.earth;
    if (earth && S.secondaryUpdateAccum >= 1 / 30) {
      S.secondaryUpdateAccum = 0;
      var cu = earth.uniforms.uCloudShift;
      cu.value = (cu.value + dt * 0.0016) % 1;
      for (i = 0; i < S.nodes.beltObjects.length; i++) {
        S.nodes.beltObjects[i].rotation.y += (1 / 30) * (i === 0 ? 0.000035 : 0.000012);
      }
    }

    if (S.nodes.sunMesh) S.nodes.sunMesh.rotation.y = (S.simDays * 24 / D.sun.rotationH) * Math.PI * 2 % (Math.PI * 2);
    /* 星空保持静止：银道带方向需与 galaxy.js 的倾角一致；
       但整体跟随相机平移（恒星在无穷远，避免拉远时星穹出现空洞） */
    if (S.nodes.starfield) S.nodes.starfield.position.copy(S.nodes.camera.position);
    if (S.nodes.starSpikes) S.nodes.starSpikes.position.copy(S.nodes.camera.position);
    /* 天球随相机移动（等效无限远），可见性跟随星点开关；低画质档不显示 */
    if (S.nodes.skyDome) {
      S.nodes.skyDome.position.copy(S.nodes.camera.position);
      S.nodes.skyDome.visible = (!S.nodes.starfield || S.nodes.starfield.visible) && S.qualityName !== 'low';
    }
    /* 日期跳转后的下一帧会立即刷新；连续播放时按 epoch 阈值节流。 */
    SOLAR.Bodies.refreshOrbitLines(jd, false);
    if (S.labelUpdateAccum >= 1 / 20) {
      S.labelUpdateAccum = 0;
      updateLabels();
    }
  }

  /* 拖尾环形缓冲写入：存的是 SOLAR.Bodies.makeTrail 建出来的 rec.trail* 一套字段，
     因此与 SOLAR.Bodies.updatePlanet 同侧调用。采样节奏（按模拟日、每圈 trailMax 点）
     由 SOLAR.Bodies.sampleTrail 决定，这里每被调一次就无条件写一点。 */
  function pushTrail(p, x, y, z) {
    var max = p.trailMax;
    var write = p.trailWrite * 3;
    p.trailRing[write] = x; p.trailRing[write + 1] = y; p.trailRing[write + 2] = z;
    p.trailWrite = (p.trailWrite + 1) % max;
    if (p.trailCount < max) p.trailCount++;

    /* 线段几何必须按时间顺序连续，环形存储避免每次追加搬移整段历史。 */
    var start = p.trailCount === max ? p.trailWrite : 0;
    for (var j = 0; j < p.trailCount; j++) {
      var src = ((start + j) % max) * 3;
      var dst = j * 3;
      p.trailPts[dst] = p.trailRing[src];
      p.trailPts[dst + 1] = p.trailRing[src + 1];
      p.trailPts[dst + 2] = p.trailRing[src + 2];
    }
    p.trail.geometry.attributes.position.needsUpdate = true;
    p.trail.geometry.setDrawRange(0, p.trailCount);

    /* 渐隐：序号越大越新、越亮 */
    var n = p.trailCount - 1;
    if (n > 0) {
      for (var i = 0; i <= n; i++) p.trailFade[i] = Math.pow(i / n, 1.5);
      if (n < max - 1) p.trailFade[n + 1] = 0;
    }
    p.trail.geometry.attributes.aFade.needsUpdate = true;
  }

  /* ============ 对外接口 ============ */

  function setAlign(on) { S.align.target = on ? 1 : 0; }
  function isAligned() { return S.align.target > 0.5; }

  /* 点尺寸换算：drawingBuffer 高度 / (2·tan(fov/2)) */
  function updateProjectionScale() {
    if (!S.nodes.renderer || !S.nodes.camera) return;
    var pr = S.nodes.renderer.getPixelRatio ? S.nodes.renderer.getPixelRatio() : S.effectivePixelRatio;
    U.pixelRatio.value = pr;
    U.heightScale.value = (renderHeight() * pr) / (2 * Math.tan(S.nodes.camera.fov * DEG * 0.5));
  }

  function applyQualityDetail() {
    var i, geo = sphereGeo(S.qv.seg);
    for (i = 0; i < S.nodes.planets.length; i++) {
      var p = S.nodes.planets[i];
      p.mesh.geometry = geo;
      p.uniforms.uBump.value = (SOLAR.Bodies.surfaceParams(p.id).bump || 0) * (S.qv.bump ? 1 : 0);
      for (var j = 0; j < p.moons.length; j++) {
        p.moons[j].mesh.geometry = sphereGeo(moonSegLevel());
        p.moons[j].uniforms.uBump.value = (SOLAR.Bodies.surfaceParams(p.moons[j].data.id).bump || 0) * (S.qv.bump ? 1 : 0);
      }
    }
    for (var ci5 = 0; ci5 < S.nodes.cometObjs.length; ci5++) S.nodes.cometObjs[ci5].mesh.geometry = sphereGeo(moonSegLevel());

    /* 太阳网格细分：几何半径必须用「建模时的烘焙基准半径」，不能用当前世界半径。
       sunMesh.scale 是相对烘焙基准的倍率（建几何=基准、scale=倍率）；若把已经
       放大的世界半径再烘进几何，切档/切画质会把它乘第二遍，每次画质重建再乘一次，
       太阳会滚雪球式变大，黑子与日珥被埋进球体内部。 */
    if (S.nodes.sunMesh) {
      var seg = SOLAR.Sun.SUN_SEGMENTS[S.qv.seg] || SOLAR.Sun.SUN_SEGMENTS.m;
      var r = S.nodes.sunMesh.userData.sunBaseRadius || S.nodes.sunMesh.userData.sunRadius || 1;
      S.nodes.sunMesh.geometry.dispose();
      S.nodes.sunMesh.geometry = new THREE.SphereGeometry(r, seg[0], seg[1]);
    }
  }

  function setQuality(name) {
    S.qualityName = C.quality[name] ? name : 'high';
    S.quality = C.quality[S.qualityName];
    S.qv = QUAL[S.qualityName] || QUAL.high;

    applyPixelRatio(S.quality.pixelRatio);
    S.nodes.renderer.setSize(renderWidth(), renderHeight());
    S.showTrails = S.quality.trails;

    if (SOLAR.Effects) SOLAR.Effects.setBloom(S.quality.bloom);
    if (SOLAR.Galaxy) SOLAR.Galaxy.setQuality(S.qualityName);
    S.qualityJobVersion += 1;
    S.qualityJob = { version: S.qualityJobVersion, step: 0 };
    scheduleQualityJob();
    return S.qualityName;
  }

  /* 画质切换拆成多个渲染帧，避免一次性销毁/创建星场、带和球体几何造成长任务。 */
  function scheduleQualityJob() {
    if (!S.qualityJob || S.qualityJob.queued) return;
    S.qualityJob.queued = true;
    window.requestAnimationFrame(runQualityJob);
  }

  function runQualityJob() {
    if (!S.qualityJob) return;
    var job = S.qualityJob;
    job.queued = false;
    if (job.version !== S.qualityJobVersion) return;
    if (job.step === 0) {
      applyQualityDetail();
      job.step++;
    } else if (job.step === 1) {
      SOLAR.Backdrop.buildStarfield();
      job.step++;
    } else if (job.step === 2) {
      SOLAR.Backdrop.buildBelts();
      job.step++;
    } else {
      updateProjectionScale();
      applyScaleMode();
      registerBloomLayer();
      S.qualityJob = null;
      return;
    }
    scheduleQualityJob();
  }

  function resize() {
    var width = renderWidth(), height = renderHeight();
    S.nodes.camera.aspect = width / height;
    S.nodes.camera.updateProjectionMatrix();
    applyPixelRatio(S.quality.pixelRatio);
    S.nodes.renderer.setSize(width, height);
    updateProjectionScale();
    if (SOLAR.Effects) SOLAR.Effects.resize();
  }

  function get(id) { return S.nodes.bodyIndex[id]; }
  function getPlanets() { return S.nodes.planets; }
  function getPickables() { return S.nodes.pickables; }
  function getSunMesh() { return S.nodes.sunMesh; }
  function getTriangleCount() { return S.nodes.renderer.info ? S.nodes.renderer.info.render.triangles : 0; }
  function getQuality() { return S.qualityName; }

  /* ---------- 显示比例：压缩示意 / 弱压缩示意 ---------- */
  /* 两档的映射参数在 config.profiles 里（distanceExp / sizeExp / sunSizeFactor / 卫星距离），
     共享注册表 S.scaleFactors 保存「天体额外放大倍率」，本门面负责应用；
     它独立于映射，用来在弱压缩档之上进一步放大天体细节。
     轨道半径、周期、光照关系在两档下都不变。 */
  /* 卫星轨道距离：弱压缩档用幂律 ratio^pow，压缩档用对数公式 */
  function moonDistFor(p, m) {
    var ratio = Math.max(m.data.orbitKm / p.data.radiusKm, 1.01);
    if (C.scale.moonDistPow > 0) return p.radius * Math.pow(ratio, C.scale.moonDistPow);
    return p.radius * (C.scale.moonDistBase + C.scale.moonDistLog * Math.log10(ratio));
  }

  /* 应用映射档案：把 config.profiles 的值写回生效字段，并重算已建对象的尺寸 */
  function applyScaleProfile() {
    var pf = (C.profiles && C.profiles[S.scaleMode]) || null;
    if (!pf) return;
    if (typeof pf.distanceBase === 'number') C.scale.distanceBase = pf.distanceBase;
    C.scale.distanceExp = pf.distanceExp;
    if (typeof pf.sizeBase === 'number') C.scale.sizeBase = pf.sizeBase;
    C.scale.sizeExp = pf.sizeExp;
    C.scale.sunSizeFactor = pf.sunSizeFactor;
    C.scale.moonDistBase = pf.moonDistBase;
    C.scale.moonDistLog = pf.moonDistLog;
    C.scale.moonDistPow = pf.moonDistPow;
    if (typeof pf.moonSizeFactor === 'number') C.scale.moonSizeFactor = pf.moonSizeFactor;
    /* 轨道采样密度跟随档位：faithful 把轨道推远约 47 倍（2000/42），采样必须同步加密，
       否则折线弧长超过行星半径，近看会出现「行星不在轨道上」的锯齿。 */
    C.scale.orbitSegments = (typeof pf.orbitSegments === 'number') ? pf.orbitSegments : 512;

    var i, j;

    /* 太阳：几何不变，用 scale 换算（真实比例下太阳直径是地球轨道的 1/10） */
    if (S.nodes.sunMesh) {
      var sunBase = S.nodes.sunMesh.userData.sunBaseRadius || S.nodes.sunMesh.userData.sunRadius || 1;
      var sunNew = SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor;
      var kSun = sunNew / sunBase;   // 相对烘焙半径，可反复切档不累积
      S.nodes.sunMesh.userData.sunScale = kSun;
      S.nodes.sunMesh.scale.setScalar(kSun);
      S.nodes.sunMesh.userData.sunRadius = sunNew;
      for (i = 0; i < S.nodes.coronaShells.length; i++) S.nodes.coronaShells[i].scale.setScalar(kSun);
    }

    for (i = 0; i < S.nodes.planets.length; i++) {
      var p = S.nodes.planets[i];
      p.radius = SOLAR.kmToScene(p.data.radiusKm);
      if (p.glowMesh && p.glowMesh.userData.glowRatio) {
        p.glowMesh.userData.glowScaleBase = p.radius * p.glowMesh.userData.glowRatio;
      }
      if (p.ring) {
        /* 环半径与行星半径成正比（inner = 行星半径 × 环内缘 km / 行星半径 km）。
           基准永远是建几何时的烘焙值，用乘法反推，绝不用「上次档位值」当基准，
           否则 faithful→compact 会叠乘成天文数字。 */
        var ringBase = p.ring.baseRadius || p.radius;
        var k = p.radius / ringBase;
        p.ring.mesh.scale.setScalar(k);
        p.ring.uniforms.uInner.value = (p.ring.baseInner !== undefined ? p.ring.baseInner : p.ring.uniforms.uInner.value) * k;
        p.ring.uniforms.uOuter.value = (p.ring.baseOuter !== undefined ? p.ring.baseOuter : p.ring.uniforms.uOuter.value) * k;
        p.uniforms.uRingInner.value = p.ring.uniforms.uInner.value;
        p.uniforms.uRingOuter.value = p.ring.uniforms.uOuter.value;
        /* 行星本影半径必须跟着新行星半径走，否则切档后会留下一圈过大的假影
           （表现为星环「按一条直线分阴阳」、甚至看起来比真实环还大）。 */
        if (p.ring.uniforms.uPlanetRadius) p.ring.uniforms.uPlanetRadius.value = p.radius;
      }
      for (j = 0; j < p.moons.length; j++) {
        var m = p.moons[j];
        /* 与建卫星时保持一致的下限，避免弱压缩档下卫星缩到不可见 */
        m.radius = Math.max(SOLAR.kmToScene(m.data.radiusKm) * C.scale.moonSizeFactor, p.radius * 0.055);
        m.dist = moonDistFor(p, m);
        SOLAR.Bodies.refreshMoonOrbitLine(m);   /* 轨道线半径跟着档位重算（原地改写顶点，不重建几何） */
      }
      p.orbitLine = SOLAR.Bodies.refreshOrbitLine(p.orbitLine, p.data.orbital, p.data.color, S.orbitEpochJd || SOLAR.Bodies.currentOrbitEpoch());
    }

    /* 彗星轨道线与小行星带 / 柯伊伯带同样依赖距离映射 */
    for (var ci6 = 0; ci6 < S.nodes.cometObjs.length; ci6++) {
      S.nodes.cometObjs[ci6].orbitLine = SOLAR.Bodies.refreshOrbitLine(S.nodes.cometObjs[ci6].orbitLine, S.nodes.cometObjs[ci6].data.orbital, 0x9fe8ff, S.orbitEpochJd || SOLAR.Bodies.currentOrbitEpoch());
    }
    SOLAR.Backdrop.buildBelts();
  }

  /* 当前档位下某天体的「示意压缩倍数」（相对地球），用于信息卡如实标注 */
  function getScaleCompress(id) {
    var earth = D.bodies[0];
    for (var i = 0; i < D.bodies.length; i++) { if (D.bodies[i].id === 'earth') earth = D.bodies[i]; }
    if (!earth) return null;
    if (id === 'sun') {
      return {
        radius: +(D.sun.radiusKm / earth.radiusKm / ((SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor) / SOLAR.kmToScene(earth.radiusKm))).toFixed(2),
        distance: null
      };
    }
    for (var k = 0; k < D.bodies.length; k++) {
      var b = D.bodies[k];
      if (b.id !== id) continue;
      var rCompress = (b.radiusKm / earth.radiusKm) / (SOLAR.kmToScene(b.radiusKm) / SOLAR.kmToScene(earth.radiusKm));
      var dCompress = (b.orbital.a / earth.orbital.a) / (SOLAR.auToScene(b.orbital.a) / SOLAR.auToScene(earth.orbital.a));
      return { radius: +rCompress.toFixed(2), distance: +dCompress.toFixed(2) };
    }
    return null;
  }

  function applyScaleMode() {
    var f = S.scaleFactors[S.scaleMode] || S.scaleFactors.compact;
    for (var i = 0; i < S.nodes.planets.length; i++) {
      var p = S.nodes.planets[i];
      SOLAR.Bodies.setPlanetScale(p, f.planet);
      if (p.ring) {
        /* 环必须与本体同步放大：只放大球体不放大环，环会陷进球内，
           贴图环在球面上呈现为一圈同心圆弧。每次都从烘焙基准反推，
           与 applyScaleProfile 的口径一致，不叠乘。 */
        p.ring.mesh.scale.setScalar((p.radius / (p.ring.baseRadius || p.radius)) * f.planet);
      }
      if (p.glowMesh) {
        var base = p.glowMesh.userData.glowScaleBase || (p.radius * 1.1);
        p.glowMesh.scale.setScalar(base * f.planet);
      }
      for (var j = 0; j < p.moons.length; j++) {
        p.moons[j].mesh.scale.setScalar(p.moons[j].radius * f.moon);
      }
    }
    /* 太阳的缩放由 applyScaleProfile 按烘焙半径算出并存进 sunScale，
       这里只叠加档位额外系数 f.sun，不能无条件写成 f.sun 把 profile 结果抹掉。 */
    var sunScale = S.nodes.sunMesh ? (S.nodes.sunMesh.userData.sunScale || 1) : 1;
    if (S.nodes.sunMesh) S.nodes.sunMesh.scale.setScalar(sunScale * f.sun);
    if (S.nodes.sunMesh && S.nodes.sunMesh.userData) {
      /* userData 半径代表最终世界尺寸，供光晕、黑子和近景亮度统一使用。 */
      S.nodes.sunMesh.userData.sunRadius = SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor * f.sun;
    }
    for (var k = 0; k < S.nodes.coronaShells.length; k++) {
      S.nodes.coronaShells[k].scale.setScalar(sunScale * f.sun * (S.nodes.coronaShells[k].userData.viewScale || 1));
    }
    /* 弱压缩档会把太阳本体放大约两倍。日珥 / 耀斑挂在 sunMesh 下，尺寸与
       位置随 sunMesh.scale 自动跟随（与太阳黑子同一套换算），此处不再单独
       缩放，否则会与父级缩放叠乘。喷流粒子的 size 是材质属性、不随父级
       scale 变化，仍须按倍率单独换算，否则弱压缩档下喷流显得过细。 */
    var attachedSunScale = sunScale * f.sun;
    for (k = 0; k < S.nodes.sunFlares.length; k++) {
      var chromo = S.nodes.sunFlares[k];
      if (chromo.userData.jetMat && chromo.userData.jetBaseSize) {
        chromo.userData.jetMat.size = chromo.userData.jetBaseSize * attachedSunScale;
      }
    }
    for (var ci7 = 0; ci7 < S.nodes.cometObjs.length; ci7++) S.nodes.cometObjs[ci7].mesh.scale.setScalar(0.35 * f.comet);
  }

  function setScaleMode(mode) {
    S.scaleMode = (mode === 'faithful') ? 'faithful' : 'compact';
    applyScaleProfile();
    applyScaleMode();
    return S.scaleMode;
  }

  /* ---------- 显示开关（供设置面板调用） ---------- */

  function setOrbitsVisible(on) {
    for (var i = 0; i < S.nodes.planets.length; i++) {
      if (S.nodes.planets[i].orbitLine) S.nodes.planets[i].orbitLine.visible = !!on;
      var ms = S.nodes.planets[i].moons;
      for (var j = 0; j < ms.length; j++) {
        if (ms[j].orbitLine) ms[j].orbitLine.visible = !!on;
      }
    }
    for (var ci8 = 0; ci8 < S.nodes.cometObjs.length; ci8++) {
      if (S.nodes.cometObjs[ci8].orbitLine) S.nodes.cometObjs[ci8].orbitLine.visible = !!on;
    }
  }

  function setTrailsVisible(on) {
    S.showTrails = !!on;
    if (!S.showTrails) {
      for (var i = 0; i < S.nodes.planets.length; i++) {
        S.nodes.planets[i].trailCount = 0;
        S.nodes.planets[i].trailWrite = 0;
        S.nodes.planets[i].trailTimer = SOLAR.Bodies.TRAIL_SAMPLE_INTERVAL;
        if (S.nodes.planets[i].trail) {
          S.nodes.planets[i].trail.geometry.setDrawRange(0, 0);
          S.nodes.planets[i].trail.visible = false;
        }
      }
    } else {
      for (var j = 0; j < S.nodes.planets.length; j++) {
        if (S.nodes.planets[j].trail) S.nodes.planets[j].trail.visible = true;
      }
    }
  }

  function setStarfieldVisible(on) {
    if (S.nodes.starfield) S.nodes.starfield.visible = !!on;
  }

  function setBeltsVisible(on) {
    S.beltsVisible = !!on;
    for (var i = 0; i < S.nodes.beltObjects.length; i++) S.nodes.beltObjects[i].visible = S.beltsVisible;
    for (var j = 0; j < S.nodes.bandObjects.length; j++) S.nodes.bandObjects[j].visible = S.beltsVisible;
  }

  /* ---------- 天体标签（Canvas 文字精灵，屏幕恒定尺寸） ---------- */

  function makeLabelTexture(text) {
    var cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 128;
    var ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.font = '500 52px ui-monospace, Consolas, Menlo, "Microsoft YaHei", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = Math.min(ctx.measureText(text).width, 440);
    /* 半透明圆角底衬：远处更易读，近处不突兀 */
    var bw = tw + 64, bh = 74, bx = 256 - bw / 2, by = 64 - bh / 2, r = 37;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(2,10,9,.42)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,252,216,.30)';
    ctx.lineWidth = 2;
    ctx.stroke();
    /* 左侧强调点 */
    ctx.beginPath();
    ctx.arc(bx + 26, 64, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#7ffcd8';
    ctx.shadowColor = 'rgba(127,252,216,.8)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    /* 文字 */
    ctx.shadowColor = 'rgba(0,0,0,.85)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#d8fff1';
    ctx.fillText(text, 266, 66);
    ctx.shadowBlur = 0;
    return new THREE.CanvasTexture(cvs);
  }

  function labelName(id) {
    if (id === 'sun') return SOLAR.t('bodies.sun.name');
    var d = SOLAR.I18N[SOLAR.lang] || SOLAR.I18N.en;
    if (d.bodies && d.bodies[id]) return d.bodies[id].name;
    if (d.moons && d.moons[id]) return d.moons[id].name;
    if (d.comet && d.comet[id]) return d.comet[id].name;
    return id;
  }

  function buildLabels() {
    if (S.nodes.labelGroup) S.nodes.scene.remove(S.nodes.labelGroup);
    S.nodes.labelGroup = new THREE.Group();
    S.nodes.labels = [];

    var ids = ['sun'];
    for (var i = 0; i < S.nodes.planets.length; i++) ids.push(S.nodes.planets[i].id);

    for (var k = 0; k < ids.length; k++) {
      var id = ids[k];
      var tex = makeLabelTexture(labelName(id));
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.92
      }));
      spr.scale.set(0.09, 0.0225, 1);
      spr.renderOrder = 10;
      spr.userData.bodyId = id;
      S.nodes.labelGroup.add(spr);
      S.nodes.labels.push({ id: id, sprite: spr });
    }
    S.nodes.labelGroup.visible = S.labelsVisible;
    S.nodes.scene.add(S.nodes.labelGroup);
  }

  function setLabelsVisible(on) {
    S.labelsVisible = !!on;
    if (!S.nodes.labelGroup) buildLabels();
    S.nodes.labelGroup.visible = S.labelsVisible;
  }

  /* 语言切换后重建标签文字 */
  function refreshLabels() {
    if (!S.nodes.labelGroup) return;
    for (var i = 0; i < S.nodes.labels.length; i++) {
      var L = S.nodes.labels[i];
      if (L.sprite.material.map) L.sprite.material.map.dispose();
      L.sprite.material.map = makeLabelTexture(labelName(L.id));
      L.sprite.material.needsUpdate = true;
    }
  }

  function updateLabels() {
    if (!S.nodes.labelGroup || !S.labelsVisible) return;
    if (!S.labelWorldPos) S.labelWorldPos = new THREE.Vector3();
    for (var i = 0; i < S.nodes.labels.length; i++) {
      var L = S.nodes.labels[i];
      if (!labelPositionOf(L.id, S.labelWorldPos)) continue;
      var r = radiusOf(L.id);
      L.sprite.position.copy(S.labelWorldPos);
      L.sprite.position.y += r * 1.9 + 0.4;
      var d = S.nodes.camera.position.distanceTo(L.sprite.position);
      L.sprite.material.opacity = d > 6000 ? 0 : 0.92;
    }
  }

  function labelPositionOf(id, target) {
    if (!S.nodes.systemRoot) return false;
    if (id === 'sun') { target.copy(S.nodes.systemRoot.position); return true; }
    var p = S.nodes.bodyIndex[id];
    if (p) { target.copy(p.scenePos).add(S.nodes.systemRoot.position); return true; }
    for (var i = 0; i < S.nodes.planets.length; i++) {
      for (var j = 0; j < S.nodes.planets[i].moons.length; j++) {
        if (S.nodes.planets[i].moons[j].data.id === id) {
          S.nodes.planets[i].moons[j].mesh.getWorldPosition(target); return true;
        }
      }
    }
    var co1 = SOLAR.Bodies.cometById(id);
    if (co1) { target.copy(co1.pos).add(S.nodes.systemRoot.position); return true; }
    return false;
  }

  /* 太阳在屏幕上的占比（供后期特效抑制近距离过曝）：1 = 太阳半径占半屏高 */
  function getSunScreenFraction() { return S.sunScreenFraction; }

  function worldPositionOf(id) {
    var off = S.nodes.systemRoot ? S.nodes.systemRoot.position : new THREE.Vector3();
    if (id === 'sun') return off.clone();
    var p = S.nodes.bodyIndex[id];
    if (p) return p.scenePos.clone().add(off);
    for (var i = 0; i < S.nodes.planets.length; i++) {
      for (var j = 0; j < S.nodes.planets[i].moons.length; j++) {
        var m = S.nodes.planets[i].moons[j];
        if (m.data.id === id) return m.mesh.getWorldPosition(new THREE.Vector3());
      }
    }
    var co2 = SOLAR.Bodies.cometById(id);
    if (co2) return co2.pos.clone().add(off);
    return null;
  }

  function getSystemRoot() { return S.nodes.systemRoot; }

  /* 太阳系基准查询：太阳系整体（systemRoot）随银河系公转而平移，
     其世界坐标会随时间变化，且默认已偏离原点（2026 年实测约 [4199, -60, 34]）。
     注意：这里返回的 position 是世界坐标，不等于「以太阳为原点的坐标」；
     任何绝对定位都必须先减去这个 position，或改用相对太阳系的局部坐标。 */
  function getSolarBasis() {
    if (!S.nodes.systemRoot) return null;
    return {
      position: S.nodes.systemRoot.getWorldPosition(new THREE.Vector3()),  // 世界位置（含父级变换）
      visible: S.nodes.systemRoot.visible
    };
  }

  /* 教学模式专用：隐藏真实比例的太阳系、改显示教学装置时调用。
     只管 systemRoot 这一棵子树；星空 / 小行星带 / 标签不在此列
     （它们由 setStarfieldVisible / setBeltsVisible / setLabelsVisible 各自负责）。 */
  function setSolarSystemVisible(on) {
    if (S.nodes.systemRoot) S.nodes.systemRoot.visible = !!on;
    return !!(S.nodes.systemRoot && S.nodes.systemRoot.visible);
  }

  function isSolarSystemVisible() {
    return !!(S.nodes.systemRoot && S.nodes.systemRoot.visible);
  }

  function radiusOf(id) {
    if (id === 'sun') return SOLAR.kmToScene(D.sun.radiusKm) * C.scale.sunSizeFactor;
    /* 彗核不在 planets 里；返回「观赏半径」（显示半径 ×2），
       让点击彗星时的取景距离能同时容纳彗核、彗发与彗尾起点，
       否则会落到 0.35 的默认值，相机怼到彗核上什么结构都看不见。 */
    var co3 = SOLAR.Bodies.cometById(id);
    if (co3) return co3.mesh.scale.x * 2;
    var p = S.nodes.bodyIndex[id];
    if (p) return p.radius;
    for (var i = 0; i < S.nodes.planets.length; i++) {
      for (var j = 0; j < S.nodes.planets[i].moons.length; j++) {
        if (S.nodes.planets[i].moons[j].data.id === id) return S.nodes.planets[i].moons[j].radius;
      }
    }
    return 0.35;
  }

  function distanceAuOf(id) {
    var p = S.nodes.bodyIndex[id];
    return p ? p.rAu : 0;
  }

  /* 固定随机种子入口：控制台或 URL `#seed=...` 换一批主星场与两条粒子带。 */
  function setProceduralSeed(seed) {
    S.proceduralSeed = SOLAR.Gfx.normalizeSeed(seed);
    if (C.procedural) C.procedural.seed = S.proceduralSeed;
    if (S.nodes.scene) {
      SOLAR.Backdrop.buildStarfield();
      SOLAR.Backdrop.buildBelts();
      registerBloomLayer();
    }
    return S.proceduralSeed;
  }

  function getProceduralSeed() { return S.proceduralSeed; }

  return {
    init: init, update: update, resize: resize, setAlign: setAlign, isAligned: isAligned,
    setQuality: setQuality, get: get, getPlanets: getPlanets, getPickables: getPickables,
    getSunMesh: getSunMesh, getTriangleCount: getTriangleCount, getQuality: getQuality,
    getCamera: function () { return S.nodes.camera; },
    setSunView: function (mode) { return SOLAR.Sun.setSunView(mode); },
    getSunView: function () { return SOLAR.Sun.getSunView(); },
    getEffectivePixelRatio: function () { return S.effectivePixelRatio; },
    getSunScreenFraction: getSunScreenFraction,
    setOrbitsVisible: setOrbitsVisible, setTrailsVisible: setTrailsVisible,
    setGasFx: function (on) { S.gasTarget = on ? 1 : 0; return S.gasTarget; },
    setStarfieldVisible: setStarfieldVisible, setBeltsVisible: setBeltsVisible,
    setLabelsVisible: setLabelsVisible, refreshLabels: refreshLabels,
    worldPositionOf: worldPositionOf, radiusOf: radiusOf, distanceAuOf: distanceAuOf,
    getSolarBasis: getSolarBasis, setSolarSystemVisible: setSolarSystemVisible,
    isSolarSystemVisible: isSolarSystemVisible,
    /* 供 SOLAR.Effects 渲染分层 bloom：临时换材质 + 取相机 layers 掩码 */
    beginBloomLayer: beginBloomLayer, endBloomLayer: endBloomLayer,
    getBloomLayerMask: function () { return BLOOM_LAYER_MASK; },
    /* 显示比例：压缩示意 / 弱压缩示意（映射参数见 config.profiles）
       与教学装置的「真实比例 / 示意比例」是两套独立语义，互不影响。 */
    setScaleMode: setScaleMode, getScaleMode: function () { return S.scaleMode; },
    getScaleCompress: getScaleCompress,
    refreshOrbitLines: function () { return SOLAR.Bodies.refreshOrbitLines(SOLAR.Bodies.currentOrbitEpoch(), true); },
    getSystemRoot: getSystemRoot,
    setProceduralSeed: setProceduralSeed, getProceduralSeed: getProceduralSeed,
    /* 以下六个是子模块按运行时限定名回挑的门面能力（见各文件顶部注释），
       不属于对外承诺的公开 API：几何缓存与细分档、卫星距离映射、拖尾写入。 */
    sphereGeo: sphereGeo, atmoGeo: atmoGeo, moonSegLevel: moonSegLevel,
    moonDistFor: moonDistFor, pushTrail: pushTrail
  };
})();
