/**
 * 行星、卫星、矮行星与彗星：构建、外观绑定与逐帧更新
 *   - 行星 / 卫星：表面参数表、大气壳、行星环、轨道线、拖尾；
 *   - 彗星：彗核 + 彗发 + 离子尾 / 尘埃尾（数据驱动，D.comets 全量构建）；
 *   - 逐帧：自转、开普勒公转、潮汐锁定、Pluto-Charon 质心偏移、
 *     日食投影与月食本影（uniform 写入）、尾形随日心距演化。
 * 依赖：three.min.js（全局 THREE，r128）、config.js（C.scale / C.colors）、
 *       data.js（D.bodies / D.moons / D.comets）、astro.js（A.heliocentric / A.toScene /
 *       A.solveKepler / A.orbitPath / A.toJulian）、
 *       scene-shared.js（SOLAR.SceneShared：S.nodes.planets / cometObjs / ...、U 共享 uniform）
 *       scene-shaders.js（SOLAR.Shaders：PLANET / ATMO / RING / TRAIL / TAIL 五组着色器）
 *       scene-gfx.js（SOLAR.Gfx：safeTexture / radialTexture / fallbackTexture）
 *
 * 为什么单独拆出来：行星、卫星、彗星的「外观 + 运动」是同一套数据驱动的构建流程
 * （表面参数 → uniform → 几何 → 贴图 → 环 / 大气 / 轨道线 / 拖尾 → 逐帧更新），
 * 原先与太阳、星空、标签、时间控制混在同一个 3000 行的 IIFE 里；拆出后
 * 「一个天体怎么被画出来、怎么动」集中在这一个文件。
 *
 * 共享状态归属（权威处只在 scene-shared.js，本模块只读写字段、从不整体替换）：
 *   S.nodes.planets / cometObjs / pickables / bodyIndex / systemRoot
 *      —— 切画质 / 切比例档会整体重建或原地重写，必须是共享字段；
 *   S.qv / S.simDays / S.showTrails / S.align / S.scaleMode / S.elapsed
 *      —— 画质细节档、时间累积、显隐与对齐开关、显示比例档、着色器动画相位；
 *   S.orbitEpochJd / S.orbitLastRebuildMs
 *      —— 轨道线重采样的纪元与真实时间节流：门面按日期跳转强制刷新时也要读同一份；
 *   S.baryLocal / S.tmpV2 / S.tmpV3
 *      —— 逐帧复用临时向量（AGENTS.md「逐帧零分配」）；
 *   U.sunPos / U.gasT / U.pixelRatio
 *      —— 多材质共用的 uniform 对象。
 *
 * 仍留在门面（SOLAR.Scene）的能力，本模块按运行时限定名调用，避免复制第二份实现：
 *   sphereGeo / atmoGeo / moonSegLevel（球体几何缓存与卫星细分档）、
 *   moonDistFor（卫星轨道距离映射，依赖 config.profiles 的生效字段）、
 *   pushTrail（拖尾环形缓冲写入，与 rec.trail* 字段同属一套存储）。
 * 这两类的责任边界：几何缓存与拖尾写入仍归门面，本模块只负责「要不要建、建什么、何时刷新」。
 * TRAIL_MAX_SUBSTEPS / ORBIT_REBUILD_MIN_MS 两个节流常量在本模块定义并导出，
 * 门面应改读 SOLAR.Bodies.* 而不是各自再抄一份数值。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Bodies = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA, A = SOLAR.Astro;
  var DEG = C.astro.DEG;

  /* 共享状态注册表：scene-shared.js 先于本文件加载，S 只改字段、从不整体替换 */
  var S = SOLAR.SceneShared.S;
  /* 共享 uniform（多个材质共用同一对象，更新一次即全部生效） */
  var U = SOLAR.SceneShared.U;

/* 拖尾按「模拟日」采样：步长 = 公转周期 / 缓冲点数，恰好铺满约一圈轨道。
   与真实帧率、倍速解耦——高倍速下一帧跨多个步长时按星历逐 jd 补点，
   拖尾始终贴合轨道曲线，不会像真实时间采样那样在外行星上退化成稀疏折线。
   TRAIL_MAX_SUBSTEPS 限制单帧补点数量，防止极端倍速下星历求解开销失控。 */
var TRAIL_MAX_SUBSTEPS = 8;
  /* 轨道线重采样的真实时间节流：避免连续播放时每帧重建几何 */
  var ORBIT_REBUILD_MIN_MS = 200;

  /* ============ 天体表面参数表 ============ */

  function surfaceParams(id) {
    var P = {
      mercury: { base: 0x9c8f84, bump: 0.085, term: 0.10, atmo: 0x000000, atmoS: 0.00, amb: 0.030 },
      venus:   { base: 0xd9b98a, bump: 0.020, term: 0.26, atmo: 0xe8d7a0, atmoS: 0.55, atmoPow: 3.0, sunset: 0xd8a05a, bands: 0.16, bandFreq: 5.0, spec: 0.03, specColor: 0xffe9c0, amb: 0.030 },
      earth:   { base: 0x3a6ea5, bump: 0.018, term: 0.16, atmo: 0x4a90d9, atmoS: 0.95, atmoPow: 2.8, sunset: 0xff7a3c, spec: 0.38, specColor: 0xcfe4ff, amb: 0.028 },
      mars:    { base: 0xc1440e, bump: 0.075, term: 0.13, atmo: 0xd08a52, atmoS: 0.32, atmoPow: 3.2, sunset: 0xd06a30, polar: 0.38, polarColor: 0xeceae4, amb: 0.030 },
      jupiter: { base: 0xd8b48c, bump: 0.000, term: 0.18, atmo: 0xd8b48c, atmoS: 0.50, atmoPow: 3.0, sunset: 0xc98f60, bands: 0.50, bandFreq: 9.0, polar: 0.42, polarColor: 0x8d7f6e, spot: 0, amb: 0.032 },
      saturn:  { base: 0xe3d9a6, bump: 0.000, term: 0.18, atmo: 0xe3d9a6, atmoS: 0.45, atmoPow: 3.0, sunset: 0xc79a62, bands: 0.40, bandFreq: 7.5, polar: 0.36, polarColor: 0x9c9280, amb: 0.032 },
      uranus:  { base: 0x9fd8e0, bump: 0.000, term: 0.22, atmo: 0x9fd8e0, atmoS: 0.50, atmoPow: 2.9, sunset: 0x7fb0c0, bands: 0.24, bandFreq: 4.0, polar: 0.22, polarColor: 0xc4ecf0, amb: 0.034 },
      neptune: { base: 0x3f66d8, bump: 0.000, term: 0.22, atmo: 0x4f7ce0, atmoS: 0.60, atmoPow: 2.8, sunset: 0x3a5aa8, bands: 0.30, bandFreq: 5.0, polar: 0.20, polarColor: 0x86a4ec, amb: 0.034 },
      pluto:   { base: 0xbfa78a, bump: 0.065, term: 0.10, atmo: 0xbfa78a, atmoS: 0.12, atmoPow: 3.4, sunset: 0xa08870, polar: 0.30, polarColor: 0xdcd2c2, amb: 0.030 },
      ceres:   { base: 0x9c8f7f, bump: 0.080, term: 0.10, atmoS: 0, polar: 0.18, polarColor: 0xb8ab99, amb: 0.028 },
      /* 卫星 */
      luna:      { base: 0xbfbfbf, bump: 0.095, term: 0.08, atmoS: 0, amb: 0.026 },
      io:        { base: 0xd8c56a, bump: 0.050, term: 0.08, atmoS: 0, amb: 0.026 },
      europa:    { base: 0xd9cfae, bump: 0.045, term: 0.08, atmoS: 0, amb: 0.026 },
      ganymede:  { base: 0x9c8b7a, bump: 0.060, term: 0.08, atmoS: 0, amb: 0.026 },
      callisto:  { base: 0x6f6257, bump: 0.075, term: 0.08, atmoS: 0, amb: 0.026 },
      enceladus: { base: 0xf0f0f0, bump: 0.040, term: 0.10, atmoS: 0, amb: 0.028 },
      titan:     { base: 0xd8a15c, bump: 0.025, term: 0.20, atmoS: 0.30, atmo: 0xe0b070, atmoPow: 3.2, sunset: 0xc08040, amb: 0.030 },
      triton:    { base: 0xc9c1b8, bump: 0.055, term: 0.10, atmoS: 0, amb: 0.028 },
      charon:    { base: 0xa9a39e, bump: 0.075, term: 0.08, atmoS: 0, amb: 0.026 },
      phobos:    { base: 0x8c7d72, bump: 0.110, term: 0.06, atmoS: 0, amb: 0.024 },
      deimos:    { base: 0x8c7d72, bump: 0.110, term: 0.06, atmoS: 0, amb: 0.024 }
    };
    return P[id] || { base: 0x9a9a9a, bump: 0.06, term: 0.10, atmoS: 0, amb: 0.028 };
  }

  /* ---------- 行星 ---------- */
  /* 扁率只作用于自转轴方向（mesh 在 tilt 子树内），保持环和卫星的参考面不变。 */
  function bodyFlattening(id) {
    var values = {
      sun: 0.000009,
      earth: 0.0033528,
      jupiter: 0.06487,
      saturn: 0.09796,
      uranus: 0.02293,
      neptune: 0.01708,
      pluto: 0.0000
    };
    return values[id] || 0;
  }

  function setPlanetScale(p, factor) {
    var r = p.radius * factor;
    var flat = p.flattening || 0;
    p.mesh.scale.set(r, r * (1 - flat), r);
  }

  function buildPlanets() {
    D.bodies.forEach(function (data) {
      var radius = SOLAR.kmToScene(data.radiusKm);
      var sp = surfaceParams(data.id);

      var group = new THREE.Group();
      S.nodes.systemRoot.add(group);

      var tilt = new THREE.Group();
      tilt.rotation.z = data.axialTilt * DEG;
      group.add(tilt);

      var uniforms = makeBodyUniforms(sp, data.color);
      applyGasFx(uniforms, data.id);   /* 按 GAS_FX 表启用；卫星、彗星与未列名的天体无气态动效 */
      var mesh = new THREE.Mesh(SOLAR.Scene.sphereGeo(S.qv.seg), new THREE.ShaderMaterial({
        uniforms: uniforms, vertexShader: SOLAR.Shaders.PLANET_VERT, fragmentShader: SOLAR.Shaders.PLANET_FRAG
      }));
      var flattening = bodyFlattening(data.id);
      mesh.scale.set(radius, radius * (1 - flattening), radius);
      mesh.userData.bodyId = data.id;
      tilt.add(mesh);
      S.nodes.pickables.push(mesh);

      /* 贴图：优先内嵌 base64；缺失时增强程序化细节 */
      SOLAR.Gfx.safeTexture(data.texture, function (t) {
        if (t) { uniforms.uMap.value = t; uniforms.uHasMap.value = 1; }
        else { uniforms.uBands.value *= 1.9; uniforms.uBump.value = Math.max(uniforms.uBump.value, 0.07); }
      });
      if (data.id === 'earth') {
        SOLAR.Gfx.safeTexture(data.textureNight, function (t) {
          if (t) { uniforms.uNightMap.value = t; uniforms.uHasNight.value = 1; }
        });
        SOLAR.Gfx.safeTexture(data.textureClouds, function (t) {
          if (t) { uniforms.uCloudMap.value = t; uniforms.uHasCloud.value = 1; }
        });
        SOLAR.Gfx.safeTexture(data.textureSpecular, function (t) {
          if (t) { uniforms.uSpecMap.value = t; uniforms.uHasSpec.value = 1; }
        });
      }

      /* 大气壳（无大气者不创建） */
      var glowMesh = null;
      if (sp.atmoS > 0.001) {
        glowMesh = new THREE.Mesh(
          SOLAR.Scene.atmoGeo(),
          new THREE.ShaderMaterial({
            uniforms: {
              uColor: { value: new THREE.Color(sp.atmo || data.color) },
              uStrength: { value: sp.atmoS * 0.62 },
              uPower: { value: sp.atmoPow || 3.0 },
              uSunPos: U.sunPos
            },
            vertexShader: SOLAR.Shaders.ATMO_VERT, fragmentShader: SOLAR.Shaders.ATMO_FRAG,
            side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
          })
        );
        glowMesh.userData.glowRatio = 1.09 + 0.11 * sp.atmoS;             // 供比例档切换时重算
        glowMesh.userData.glowScaleBase = radius * (1.09 + 0.11 * sp.atmoS);   // 供真实/示意两档重算
        glowMesh.scale.setScalar(glowMesh.userData.glowScaleBase);
        group.add(glowMesh);
      }

      /* 环（土星 / 天王星）：同时把环的几何参数写进行星材质，用于环影投射 */
      var ringRec = null;
      if (data.ring) {
        ringRec = buildRing(data, radius, tilt);
        if (ringRec) {
          /* 记下建几何时的烘焙半径与内外缘：切档一律以它为基准，
             避免把「上一次档位值」当成基准、来回切换后环越放越大。 */
          ringRec.baseRadius = radius;
          ringRec.baseInner = ringRec.uniforms.uInner.value;
          ringRec.baseOuter = ringRec.uniforms.uOuter.value;
        }
        uniforms.uRingInner.value = ringRec.uniforms.uInner.value;
        uniforms.uRingOuter.value = ringRec.uniforms.uOuter.value;
        uniforms.uRingNormal.value.copy(ringRec.uniforms.uNormal.value);
      }

      var orbitLine = makeOrbitLine(data.orbital, data.color);
      var trail = makeTrail(data.color, 160, 0.62);

      var moons = [];
      D.moons.filter(function (m) { return m.parent === data.id; }).forEach(function (m) {
        var mr = Math.max(SOLAR.kmToScene(m.radiusKm) * C.scale.moonSizeFactor, radius * 0.055);
        var msp = surfaceParams(m.id);
        var mu = makeBodyUniforms(msp, m.color);
        var mm = new THREE.Mesh(SOLAR.Scene.sphereGeo(SOLAR.Scene.moonSegLevel()), new THREE.ShaderMaterial({
          uniforms: mu, vertexShader: SOLAR.Shaders.PLANET_VERT, fragmentShader: SOLAR.Shaders.PLANET_FRAG
        }));
        mm.scale.setScalar(mr);
        mm.userData.bodyId = m.id;
        mm.userData.isMoon = true;
        if (m.texture) SOLAR.Gfx.safeTexture(m.texture, function (t) {
          if (t) { mu.uMap.value = t; mu.uHasMap.value = 1; }
          else { mu.uBump.value = Math.max(mu.uBump.value, 0.08); }
        });
        S.nodes.pickables.push(mm);

        var ratio = Math.max(m.orbitKm / data.radiusKm, 1.01);
        var dist = SOLAR.Scene.moonDistFor({ radius: radius, data: data }, { data: m });
        /* 朝向四根数（JPL 历元 2000-01-01.5 TDB = J2000，simDays=0 精确对齐）：
           Ω 升交点 → nodeGroup 绕参考面极轴；i 倾角 → orbitGroup.rotation.x；
           ω 近心点幅角 → periGroup 轨道面内绕法线；M₀ 平近点角 → 并入逐帧 mean。
           三者嵌套成 R(Ω)·R(i)·R(ω) 层级，轨道线与卫星挂在同一链路末端，
           逐帧位置共用该框架，线与卫星永不脱节。
           Laplace 面卫星的 Ω 落在母星赤道系内是近似（JPL Tilt 仅 0.0~0.9°，见 data.js 注释）。 */
        var nodeGroup = new THREE.Group();
        if (typeof m.ascendingNodeDeg === 'number') nodeGroup.rotation.y = m.ascendingNodeDeg * DEG;
        var orbitGroup = new THREE.Group();
        var inclination = typeof m.orbitInclinationDeg === 'number' ? m.orbitInclinationDeg * DEG : 0;
        orbitGroup.rotation.x = inclination;
        var periGroup = new THREE.Group();
        if (typeof m.argPeriapsisDeg === 'number') periGroup.rotation.y = m.argPeriapsisDeg * DEG;
        if (m.inclinationReference === 'parentEquator' || m.inclinationReference === 'plutoEquator') tilt.add(nodeGroup);
        else group.add(nodeGroup);
        nodeGroup.add(orbitGroup);
        orbitGroup.add(periGroup);
        periGroup.add(mm);
        var mo = {
          data: m, mesh: mm, orbitGroup: orbitGroup, periGroup: periGroup,
          dist: dist, radius: mr, uniforms: mu, host: null,
          offset: new THREE.Vector3(), worldPos: new THREE.Vector3(), parentRadius: radius,
          eccentricity: Math.max(0, Math.min(0.95, typeof m.eccentricity === 'number' ? m.eccentricity : 0)),
          periodAbs: Math.max(1e-6, Math.abs(typeof m.periodDays === 'number' ? m.periodDays : 1)),
          direction: (typeof m.periodDays === 'number' && m.periodDays < 0) ? -1 : 1,
          m0: typeof m.meanAnomalyDeg === 'number' ? m.meanAnomalyDeg * DEG : 0
        };
        periGroup.add(makeMoonOrbitLine(mo, data.color));
        moons.push(mo);
      });

      /* 卫星投影：取渲染半径最大的若干颗 */
      var occMoons = moons.slice(0).sort(function (a, b) { return b.radius - a.radius; }).slice(0, 2);

      var rec = {
        id: data.id, data: data, group: group, tilt: tilt, mesh: mesh, glowMesh: glowMesh,
        orbitLine: orbitLine, moons: moons, occMoons: occMoons,
        trail: trail.line, trailPts: trail.pos, trailFade: trail.fade, trailMax: trail.max,
        trailMat: trail.mat, trailCount: 0, trailWrite: 0, trailLastJd: null,
        trailStepDays: (data.periodDays || 365.256) / trail.max,
        trailRing: new Float32Array(trail.max * 3), flattening: flattening,
        radius: radius, rAu: 0, scenePos: new THREE.Vector3(),
        uniforms: uniforms, ring: ringRec
      };
      S.nodes.planets.push(rec);
      S.nodes.bodyIndex[data.id] = rec;

      /* 让卫星记录宿主（用于逐帧写入月食本影） */
      for (var k = 0; k < moons.length; k++) moons[k].host = rec;
    });
  }

  /* ---- 气态动效（设置面板开关，默认开启）----
     大气流动不改动底图：贴图整体沿经度漂移会把固态地貌与木星大红斑沿
     带间剪切变形，因此只在表面之上叠一层程序化云霾，流动感由云层承担。
     流速场 = sin 型交替急流（木星约 8 条带）+ cos² 较差自转（赤道快）
     + 整体超旋转（金星大气约 4 天绕行，自转却要 243 天）；风速按观测
     量级定性标定（木星约 ±150 m/s、土星赤道约 400 m/s、海王星约
     600 m/s），时间整体加速到数十秒量级才肉眼可见。 */
  var GAS_FX = {
    /* haze 为云霾浓度、col 为云色、jet 为该行星带状急流的相对速度 */
    venus:   { spin: 0.012, bands: 1, jet: 0.002, haze: 0.55, col: 0xe8d9a8 },
    jupiter: { bands: 8, jet: 0.010, haze: 0.32, col: 0xf0e2c8 },
    saturn:  { bands: 6, jet: 0.012, haze: 0.22, col: 0xf2e6c0 },
    uranus:  { bands: 2, jet: 0.004, haze: 0.18, col: 0xd8f0f4 },
    neptune: { bands: 4, jet: 0.014, haze: 0.26, col: 0xbcd8f5 },
    mars:    { bands: 1, jet: 0.001, haze: 0.12, col: 0xd8a878 }
  };
  /* 地球地表为固态地貌、云层另有独立漂移，太阳走自身 shader，
     三者都不在此表 */

  function applyGasFx(uniforms, id) {
    var p = GAS_FX[id];
    if (!p) return;
    uniforms.uGasSpin.value = p.spin || 0;
    uniforms.uGasDiff.value = p.diff || 0;
    uniforms.uGasJet.value = p.jet || 0;
    uniforms.uGasBands.value = p.bands || 0;
    uniforms.uGasHaze.value = p.haze || 0;
    uniforms.uGasColor.value = new THREE.Color(p.col || 0xffffff);
  }

  /* 统一的天体 uniform 集合 */
  function makeBodyUniforms(sp, color) {
    var spot = sp.spotPos || [0.5, 0.0];
    return {
      uMap: { value: SOLAR.Gfx.fallbackTexture(255, 255, 255) }, uHasMap: { value: 0 },
      uSpecMap: { value: SOLAR.Gfx.fallbackTexture(255, 255, 255) }, uHasSpec: { value: 0 },
      uNightMap: { value: SOLAR.Gfx.fallbackTexture(0, 0, 0) }, uHasNight: { value: 0 }, uNightStrength: { value: 1.15 },
      uCloudMap: { value: SOLAR.Gfx.fallbackTexture(0, 0, 0) }, uHasCloud: { value: 0 },
      uGasT: U.gasT,
      uGasSpin: { value: 0 }, uGasDiff: { value: 0 },
      uGasJet: { value: 0 }, uGasBands: { value: 2 },
      uGasHaze: { value: 0 }, uGasColor: { value: new THREE.Color(0xffffff) },
      uCloudAmount: { value: 1.25 }, uCloudShift: { value: 0 },
      uBase: { value: new THREE.Color(sp.base !== undefined ? sp.base : color) },
      uSunPos: U.sunPos, uTime: U.time,
      uCenter: { value: new THREE.Vector3() }, uRadius: { value: 1 },
      uBands: { value: sp.bands || 0 }, uBandFreq: { value: sp.bandFreq || 6 },
      uPolar: { value: sp.polar || 0 }, uPolarColor: { value: new THREE.Color(sp.polarColor || 0xffffff) },
      uBump: { value: (sp.bump || 0) * (S.qv.bump ? 1 : 0) },
      uSpot: { value: sp.spot || 0 }, uSpotPos: { value: new THREE.Vector2(spot[0], spot[1]) },
      uTermSoft: { value: sp.term || 0.12 },
      uAtmo: { value: new THREE.Color(sp.atmo || 0x88aaff) },
      uAtmoStrength: { value: sp.atmoS || 0 }, uAtmoPower: { value: sp.atmoPow || 3.0 },
      uSunset: { value: new THREE.Color(sp.sunset || 0xff8a4a) },
      uSpec: { value: sp.spec || 0 }, uSpecColor: { value: new THREE.Color(sp.specColor || 0xffffff) },
      uAmbient: { value: sp.amb !== undefined ? sp.amb : 0.03 },
      uRingInner: { value: 0 }, uRingOuter: { value: 0 },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) }, uRingShadow: { value: 0 },
      uOcc0: { value: new THREE.Vector3() }, uOcc0R: { value: 0 },
      uOcc1: { value: new THREE.Vector3() }, uOcc1R: { value: 0 }, uOccSoft: { value: 0.18 }
    };
  }

  /* ---------- 环 ---------- */
  function buildRing(data, radius, tilt) {
    var inner = radius * (data.ring.innerKm / data.radiusKm);
    var outer = radius * (data.ring.outerKm / data.radiusKm);
    var segments = S.qv.seg === 'l' ? 96 : (S.qv.seg === 'xh' ? 384 : 160);
    var ringGeo = new THREE.RingGeometry(inner, outer, segments, 1);
    var pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv, v3 = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v3.fromBufferAttribute(pos, i);
      uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
    }
    ringGeo.rotateX(-Math.PI / 2);

    var uniforms = {
      uMap: { value: SOLAR.Gfx.fallbackTexture(255, 255, 255) }, uHasMap: { value: 0 },
      /* 环粒子基色：土星环偏米金；天王星环粒子反照率仅约 0.03，
         用暗蓝灰——无贴图回退与贴图弱环的混合色都保持暗调 */
      uColor: { value: new THREE.Color(data.id === 'saturn' ? 0xd9cfae : 0x46545c) },
      uOpacity: { value: 0.92 },
      uSunPos: U.sunPos,
      uCenter: { value: new THREE.Vector3() },
      uPlanetRadius: { value: radius },
      /* 环面法线：tilt 只有绕 Z 的倾角，世界法线 = (-sin a, cos a, 0) */
      uNormal: { value: new THREE.Vector3(-Math.sin(data.axialTilt * DEG), Math.cos(data.axialTilt * DEG), 0) },
      uInner: { value: inner }, uOuter: { value: outer }
    };

    var ringMat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: SOLAR.Shaders.RING_VERT, fragmentShader: SOLAR.Shaders.RING_FRAG,
      side: THREE.DoubleSide, transparent: true, depthWrite: false
    });
    SOLAR.Gfx.safeTexture(data.ring.texture, function (t) {
      if (t) { uniforms.uMap.value = t; uniforms.uHasMap.value = 1; }
      else { uniforms.uOpacity.value = 0.55; }
    });
    var mesh = new THREE.Mesh(ringGeo, ringMat);
    tilt.add(mesh);
    return { mesh: mesh, uniforms: uniforms };
  }

  function currentOrbitEpoch() {
    return (SOLAR.time && isFinite(SOLAR.time.jd)) ? SOLAR.time.jd : A.toJulian(new Date());
  }

  function orbitEpochStepDays() {
    var value = C.scale.orbitEpochStepDays;
    return (typeof value === 'number' && isFinite(value) && value > 0) ? value : 365.25;
  }

  function makeOrbitGeometry(orb, jd) {
    var pts = A.orbitPath(orb, jd, adaptiveOrbitSegments(orb));
    var geo = new THREE.BufferGeometry();
    var arr = new Float32Array(pts.length * 3);
    pts.forEach(function (p, i) { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return geo;
  }

  /* 轨道采样按几何难度分配：高偏心轨道的近日点需要更多点，
     小轨道减少无意义顶点，外行星和高画质保留足够的远景圆滑度。 */
  function adaptiveOrbitSegments(orb) {
    var base = (C.scale && typeof C.scale.orbitSegments === 'number') ? C.scale.orbitSegments : 512;
    var a = orb && typeof orb.a === 'number' ? Math.abs(orb.a) : 1;
    var e = orb && typeof orb.e === 'number' ? Math.abs(orb.e) : 0;
    var scaleFactor = a < 1 ? 0.55 : (a < 5 ? 0.72 : (a > 30 ? 1.15 : 1));
    var eccentricFactor = 1 + Math.min(5, e * e * 8);
    var qualityFactor = S.qv && S.qv.seg === 'l' ? 0.72 : (S.qv && S.qv.seg === 'xh' ? 1.25 : 1);
    var n = Math.round(base * scaleFactor * eccentricFactor * qualityFactor);
    if (n < 64) n = 64;
    if (n > 2048) n = 2048;
    return n;
  }

  /* 卫星轨道线：卫星逐帧位置是 x = dist·(cosE − e)、z = dist·√(1−e²)·sinE 的开普勒椭圆，
     这里用同一公式采样，几何与卫星真实轨迹严格一致（而不是画个正圆示意）；
     线挂在 periGroup 下，与卫星共用 nodeGroup>orbitGroup>periGroup 朝向链路
     （Ω 升交点、i 倾角、ω 近心点幅角一并继承，如月球 5.145°+Ω125.08° 相对黄道）。
     dist 随显示档位变化，由 refreshMoonOrbitLine 原地重写顶点。 */
  /* 160 段足以让近看时的月轨平滑，又不至于让每次切档重写过多顶点。 */
  var MOON_ORBIT_SEGMENTS = 160;
  function makeMoonOrbitLine(mo, bodyColor) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOON_ORBIT_SEGMENTS * 3), 3));
    var col = new THREE.Color(C.colors.orbit);
    if (bodyColor !== undefined && bodyColor !== null) col.lerp(new THREE.Color(bodyColor), 0.38);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: C.scale.orbitOpacity * 0.7
    }));
    mo.orbitLine = line;
    refreshMoonOrbitLine(mo);
    return line;
  }

  function refreshMoonOrbitLine(mo) {
    if (!mo || !mo.orbitLine) return;
    var pos = mo.orbitLine.geometry.attributes.position;
    var arr = pos.array;
    var e = mo.eccentricity || 0;
    var b = mo.dist * Math.sqrt(Math.max(0, 1 - e * e));
    var n = arr.length / 3;
    for (var i = 0; i < n; i++) {
      var u = (i / (n - 1)) * Math.PI * 2;
      arr[i * 3] = mo.dist * (Math.cos(u) - e);
      arr[i * 3 + 1] = 0;
      arr[i * 3 + 2] = b * Math.sin(u);
    }
    pos.needsUpdate = true;
    /* 顶点原地改写后必须重算包围球，否则旧包围球会让线在视锥边缘被误剔除 */
    mo.orbitLine.geometry.computeBoundingSphere();
  }

  function makeOrbitLine(orb, bodyColor, jd) {
    var geo = makeOrbitGeometry(orb, isFinite(jd) ? jd : currentOrbitEpoch());
    /* 基础轨道灰混入天体本色，既统一又有辨识度 */
    var col = new THREE.Color(C.colors.orbit);
    if (bodyColor !== undefined && bodyColor !== null) {
      col.lerp(new THREE.Color(bodyColor), 0.38);
    }
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: C.scale.orbitOpacity
    }));
    S.nodes.systemRoot.add(line);
    return line;
  }

  /* 仅替换 geometry，保留 material 和显隐状态，避免每次 epoch 刷新泄漏材质。 */
  function refreshOrbitLine(line, orb, bodyColor, jd) {
    if (!line) return makeOrbitLine(orb, bodyColor, jd);
    var old = line.geometry;
    line.geometry = makeOrbitGeometry(orb, jd);
    if (old && old.dispose) old.dispose();
    return line;
  }

  /* 轨道线必须与行星「同源」：行星按当前 jd 求根数定位，若轨道线停留在旧 epoch
     的椭圆上，两者会随时间逐渐分离 —— 放到最大时表现为行星偏离轨道线。
     弱压缩示意档轨道半径可达数千单位，同样的根数漂移会被成倍放大，因此这里
     「日期一变就重采样」，并额外用真实时间节流把重建频率压到 5Hz 以内。 */
  /* 时间戳与纪元都存在 SceneShared.S：门面按日期跳转强制刷新时与这里读同一份。 */
  function refreshOrbitLines(jd, force) {
    jd = isFinite(jd) ? jd : currentOrbitEpoch();
    var changed = S.orbitEpochJd === null || Math.abs(jd - S.orbitEpochJd) >= 1e-6;
    var stamp = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (!force && (!changed || stamp - S.orbitLastRebuildMs < ORBIT_REBUILD_MIN_MS)) return false;
    for (var i = 0; i < S.nodes.planets.length; i++) {
      var p = S.nodes.planets[i];
      p.orbitLine = refreshOrbitLine(p.orbitLine, p.data.orbital, p.data.color, jd);
    }
    for (var ci2 = 0; ci2 < S.nodes.cometObjs.length; ci2++) {
      S.nodes.cometObjs[ci2].orbitLine = refreshOrbitLine(S.nodes.cometObjs[ci2].orbitLine, S.nodes.cometObjs[ci2].data.orbital, 0x9fe8ff, jd);
    }
    S.orbitEpochJd = jd;
    S.orbitLastRebuildMs = stamp;
    return true;
  }

  /* ---------- 拖尾 ---------- */
  function makeTrail(color, max, opacity) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(max * 3);
    var fade = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    geo.setDrawRange(0, 0);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: SOLAR.Shaders.TRAIL_VERT, fragmentShader: SOLAR.Shaders.TRAIL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    S.nodes.systemRoot.add(line);
    return { line: line, pos: pos, fade: fade, max: max, mat: mat };
  }

  /* ---------- 彗星 ---------- */
  /* 多颗彗星：D.comets 里的每一条数据都构建一套独立对象
     （彗核 + 彗发 + 离子尾/尘埃尾 + 轨道线），互不共享状态。 */
  function buildComets() {
    S.nodes.cometObjs = [];
    for (var bi = 0; bi < D.comets.length; bi++) buildOneComet(D.comets[bi]);
  }

  function buildOneComet(cd) {
    /* 彗核真实外观是暗灰、不规则、坑坑洼洼的岩质体，不该像气态行星那样呈彩色条纹。
       这里强制暗灰基色 + 更强的程序化凹凸（不改变任何轨道与光照关系）。 */
    var sp = { base: 0x7d746a, bump: 0.16, term: 0.10, atmoS: 0, amb: 0.05 };
    var uniforms = makeBodyUniforms(sp, cd.color);
    uniforms.uBump.value = 0.18;

    var mesh = new THREE.Mesh(SOLAR.Scene.sphereGeo(SOLAR.Scene.moonSegLevel()), new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: SOLAR.Shaders.PLANET_VERT, fragmentShader: SOLAR.Shaders.PLANET_FRAG
    }));
    /* 彗核真实半径仅 5.5 km，映射后过小，固定放大到 0.35 场景单位才可见。 */
    mesh.scale.setScalar(0.35);
    mesh.userData.bodyId = cd.id;
    S.nodes.systemRoot.add(mesh);
    /* 彗核不参与拾取 */

    var headGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SOLAR.Gfx.radialTexture('180,225,255', 2.4), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    }));
    headGlow.scale.set(0.03, 0.03, 1);
    mesh.add(headGlow);

    /* 外层彗发：比内核大而淡，近日点被太阳加热后显著膨胀 */
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SOLAR.Gfx.radialTexture('150,210,255', 3.2), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    }));
    halo.scale.set(0.05, 0.05, 1);
    mesh.add(halo);

    /* 彗尾：WebGL 线宽恒为 1，画出来只能是一根细丝，缺少「拖尾」的体量感。
       改用加性粒子沿尾轴分布：靠近彗核小而亮，越往尾端越大越淡（尘埃向外扩散）。
       离子尾 ×3（不同波幅相位，蓝色等离子体束）+ 尘埃尾 ×3（不同弯曲度，扇形暖白尾）。 */
    function cometTail(color, count) {
      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(count * 3);
      var fade = new Float32Array(count);
      var size = new Float32Array(count);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      var mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: 1 },
          uPixelRatio: U.pixelRatio
        },
        vertexShader: SOLAR.Shaders.TAIL_VERT, fragmentShader: SOLAR.Shaders.TAIL_FRAG,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      });
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      S.nodes.systemRoot.add(pts);
      return { points: pts, pos: pos, fade: fade, size: size, max: count, mat: mat };
    }
    var ions = [cometTail(0x9fdcff, 150), cometTail(0x7fc4ff, 130), cometTail(0xbfe6ff, 110)];
    var dusts = [cometTail(0xffe6bd, 130), cometTail(0xffdca0, 110), cometTail(0xfff2d8, 90)];

    var orbitLine = makeOrbitLine(cd.orbital, 0x9fe8ff);
    orbitLine.material.opacity = 0.18;

    S.nodes.cometObjs.push({
      data: cd, mesh: mesh, uniforms: uniforms, glow: headGlow, halo: halo,
      ions: ions, dusts: dusts, orbitLine: orbitLine,
      pos: new THREE.Vector3(), prev: new THREE.Vector3(), hasPrev: false,
      side: new THREE.Vector3(), dir: new THREE.Vector3(), vel: new THREE.Vector3()
    });
  }

  /* 每帧：行星公转定位、自转、卫星轨道、Pluto-Charon 质心偏移、拖尾采样 */
  function updatePlanet(p, jd) {
    var pos = A.heliocentric(p.data.orbital, jd);
    var sp = A.toScene(pos);
    p.rAu = pos.r;

    var x = sp.x, y = sp.y, z = sp.z;
    if (S.align.amount > 0) {
      var ar = SOLAR.auToScene(pos.r);
      x = x * (1 - S.align.amount) + ar * S.align.amount;
      y = y * (1 - S.align.amount);
      z = z * (1 - S.align.amount);
    }

    /* Pluto 与 Charon 绕共同质心运动：主星沿当前连线反向偏移。 */
    var bary = p.data.barycenter;
    var baryMoon = null;
    var primaryOffset = 0;
    if (bary && bary.companionId) {
      for (var bi = 0; bi < p.moons.length; bi++) {
        if (p.moons[bi].data.id === bary.companionId) { baryMoon = p.moons[bi]; break; }
      }
      if (baryMoon && typeof bary.fromPrimaryCenterKm === 'number') {
        /* 月距会随显示档位压缩，偏移必须按当前绘制的月距同比例换算；
           直接 kmToScene 会让两个档位的质心比例不一致。 */
        if (typeof bary.meanSeparationKm === 'number' && bary.meanSeparationKm > 0) {
          primaryOffset = baryMoon.dist * bary.fromPrimaryCenterKm / bary.meanSeparationKm;
        } else {
          primaryOffset = SOLAR.kmToScene(bary.fromPrimaryCenterKm);
        }
      }
    }

    var revPerDay = 24 / p.data.rotationH;
    p.mesh.rotation.y = (S.simDays * revPerDay) * Math.PI * 2 % (Math.PI * 2);

    for (var i = 0; i < p.moons.length; i++) {
      var m = p.moons[i];
      /* 带符号周期决定顺逆行；偏心近点角保留轨道长短轴比例。
         升交点 Ω、倾角 i、近心点幅角 ω 已由 nodeGroup>orbitGroup>periGroup 层级承担，
         这里只叠加 J2000 平近点角初值 M₀；整体乘 direction，
         逆行体（Triton/Charon）的初相与运行方向一致。 */
      var mean = (m.m0 + (S.simDays / m.periodAbs) * Math.PI * 2) * m.direction;
      var E = A.solveKepler(mean, m.eccentricity);
      var root = Math.sqrt(Math.max(0, 1 - m.eccentricity * m.eccentricity));
      var lx = m.dist * (Math.cos(E) - m.eccentricity);
      var lz = m.dist * root * Math.sin(E);
      m.mesh.position.set(lx, 0, lz);
      if (m === baryMoon && primaryOffset > 0) {
        var sep = Math.sqrt(lx * lx + lz * lz);
        if (sep > 1e-6) {
          /* Ω / i / ω 可能把卫星从未旋转的 XZ 平面转走；
             用层级变换后的实际连线，避免质心偏移方向与 Charon 脱节。 */
          p.group.updateMatrixWorld(true);
          baryMoon.mesh.getWorldPosition(S.baryLocal);
          p.group.worldToLocal(S.baryLocal);
          var baryLen = S.baryLocal.length();
          if (baryLen > 1e-6) {
            x -= S.baryLocal.x / baryLen * primaryOffset;
            y -= S.baryLocal.y / baryLen * primaryOffset;
            z -= S.baryLocal.z / baryLen * primaryOffset;
          }
        }
      }

      /* 潮汐锁定体始终让同一经线朝向母星；未锁定体才按自转周期旋转。 */
      if (m.data.tidallyLocked) {
        m.mesh.rotation.y = -Math.atan2(lz, lx);
      } else if (typeof m.data.rotationH === 'number' && Math.abs(m.data.rotationH) > 1e-6) {
        m.mesh.rotation.y = (S.simDays * 24 / m.data.rotationH) * Math.PI * 2 % (Math.PI * 2);
      }
    }

    p.group.position.set(x, y, z);
    p.scenePos.set(x, y, z);

    if (S.showTrails) sampleTrail(p, jd, x, y, z);
    else if (p.trailCount > 0) {
      p.trailCount = 0; p.trailWrite = 0; p.trailLastJd = null;
      p.trail.geometry.setDrawRange(0, 0);
    }
  }

  /* 拖尾按「模拟日」采样：每公转周期铺 trailMax 个点，任何倍速下拖尾都是
     贴合轨道的均匀曲线。一帧跨过多个步长时按中间 jd 逐点补采星历；所需
     步数超过 TRAIL_MAX_SUBSTEPS 时把整段跨度等分给上限数量的点（抽稀，
     但仍铺满整段弧、末端落在当前帧），避免钳位后末端直接接当前帧位置而
     拉出一条跨几十天的直弦（折线 / 长刺）。
     补点跳过 Pluto-Charon 质心微偏移：量级远小于轨道半径，曲线上不可分辨。 */
  function sampleTrail(p, jd, x, y, z) {
    var step = p.trailStepDays;
    var lastJd = p.trailLastJd;
    if (lastJd === null || Math.abs(jd - lastJd) > step * p.trailMax * 4) {
      /* 首帧或日期跳变：清掉旧轨迹重新起笔，避免跨跳变拉出一条直线 */
      if (p.trailCount > 0) {
        p.trailCount = 0; p.trailWrite = 0;
        p.trail.geometry.setDrawRange(0, 0);
      }
      p.trailLastJd = jd;
      SOLAR.Scene.pushTrail(p, x, y, z);
      return;
    }
    var dir = jd > lastJd ? 1 : -1;
    var spanDays = Math.abs(jd - lastJd);
    var nReal = Math.floor(spanDays / step);
    if (nReal < 1) return;
    /* 所需步数超过上限时，放大步长把 n 个点铺满整段跨度（而不是把步数
       钳到上限、让补点挤在开头）：这样 jdK 的末值正好等于当前帧 jd，
       下面 k === n 直接复用本帧位置的捷径成立，不会跨几十个 step 连弦。 */
    var n = nReal, stepK = step;
    if (nReal > TRAIL_MAX_SUBSTEPS) {
      n = TRAIL_MAX_SUBSTEPS;
      stepK = spanDays / n;
    }
    for (var k = 1; k <= n; k++) {
      var jdK = lastJd + dir * stepK * k;
      if (k === n) {
        /* 最后一个点直接用本帧已算好的位置，省一次星历求解 */
        SOLAR.Scene.pushTrail(p, x, y, z);
      } else {
        var posK = A.heliocentric(p.data.orbital, jdK);
        var spK = A.toScene(posK);
        if (S.align.amount > 0) {
          var ar = SOLAR.auToScene(posK.r);
          spK.x = spK.x * (1 - S.align.amount) + ar * S.align.amount;
          spK.y = spK.y * (1 - S.align.amount);
          spK.z = spK.z * (1 - S.align.amount);
        }
        SOLAR.Scene.pushTrail(p, spK.x, spK.y, spK.z);
      }
    }
    /* 未触顶时末端与网格点相差不足一个 step，按网格推进即可（欠账由
       下一帧的 n 自然补回）；触顶时写入缓冲的最后一点就是当前帧位置，
       必须以 jd 记账才与拖尾缓冲自洽。 */
    p.trailLastJd = (nReal > TRAIL_MAX_SUBSTEPS) ? jd : (lastJd + dir * step * n);
  }

  /* 逐帧写入自阴影所需的世界坐标（避免每帧 new） */
  function updateShadowUniforms() {
    var sys = S.nodes.systemRoot.position;
    for (var i = 0; i < S.nodes.planets.length; i++) {
      var p = S.nodes.planets[i];
      var cx = p.scenePos.x + sys.x, cy = p.scenePos.y + sys.y, cz = p.scenePos.z + sys.z;

      p.uniforms.uCenter.value.set(cx, cy, cz);
      p.uniforms.uRadius.value = p.radius;

      /* 先统一刷新所有卫星相对母星的最终局部坐标；日食遮挡与月食本影
         都读取这一份数据，不能让 occMoons 在本帧继续使用上一帧偏移。 */
      for (var j = 0; j < p.moons.length; j++) {
        var moon = p.moons[j];
        moon.mesh.getWorldPosition(moon.worldPos);
        moon.offset.copy(moon.worldPos);
        p.group.worldToLocal(moon.offset);
      }

      /* 卫星投影（日食） */
      var o0 = p.occMoons[0], o1 = p.occMoons[1];
      if (S.qv.moonShadow > 0 && o0) {
        p.uniforms.uOcc0.value.set(cx + o0.offset.x, cy + o0.offset.y, cz + o0.offset.z);
        p.uniforms.uOcc0R.value = o0.radius;
      } else {
        p.uniforms.uOcc0R.value = 0;
      }
      if (S.qv.moonShadow > 1 && o1) {
        p.uniforms.uOcc1.value.set(cx + o1.offset.x, cy + o1.offset.y, cz + o1.offset.z);
        p.uniforms.uOcc1R.value = o1.radius;
      } else {
        p.uniforms.uOcc1R.value = 0;
      }

      /* 环影 + 环上的行星本影。弱压缩示意（faithful）档下不启用环影：
         该档追求真实比例与光影，真实土星环在土星上投出的阴影带极窄，
         按示意尺度放大后反而失真。 */
      if (p.ring) {
        p.ring.uniforms.uCenter.value.set(cx, cy, cz);
        p.uniforms.uRingShadow.value = (S.qv.ringShadow && S.scaleMode !== 'faithful') ? 0.88 : 0;
      }

      /* 卫星：行星本影（月食） */
      for (var k = 0; k < p.moons.length; k++) {
        var m = p.moons[k];
        m.uniforms.uOcc0.value.set(cx, cy, cz);
        m.uniforms.uOcc0R.value = S.qv.moonShadow > 0 ? p.radius : 0;
        m.uniforms.uCenter.value.set(cx + m.offset.x, cy + m.offset.y, cz + m.offset.z);
        m.uniforms.uRadius.value = m.radius;
      }
    }

    for (var ci3 = 0; ci3 < S.nodes.cometObjs.length; ci3++) {
      S.nodes.cometObjs[ci3].uniforms.uCenter.value.copy(S.nodes.cometObjs[ci3].pos).add(sys);
      S.nodes.cometObjs[ci3].uniforms.uRadius.value = 0.35;
    }
  }

  /* 按 id 取彗星对象（供取景 / 世界坐标 / 半径等接口使用，支持多颗彗星） */
  function cometById(id) {
    for (var ci = 0; ci < S.nodes.cometObjs.length; ci++) {
      if (S.nodes.cometObjs[ci].data.id === id) return S.nodes.cometObjs[ci];
    }
    return null;
  }

  function updateComets(jd) {
    for (var ci4 = 0; ci4 < S.nodes.cometObjs.length; ci4++) updateOneComet(S.nodes.cometObjs[ci4], jd);
  }

  /* 形参命名为 cometObj：下面整段函数体原样复用，逐颗调用即可（无需改动内部逻辑）。 */
  function updateOneComet(cometObj, jd) {
    var pos = A.heliocentric(cometObj.data.orbital, jd);
    var sp = A.toScene(pos);

    cometObj.mesh.position.set(sp.x, sp.y, sp.z);
    cometObj.pos.set(sp.x, sp.y, sp.z);

    /* 速度方向（用于尘埃尾滞后） */
    if (cometObj.hasPrev) cometObj.vel.copy(cometObj.pos).sub(cometObj.prev);
    else cometObj.vel.set(0, 0, 0);
    cometObj.prev.copy(cometObj.pos);
    cometObj.hasPrev = true;

    /* 活动强度随日心距衰减：近日点长尾、远日点几乎无尾。
       act 同时决定尾长与亮度；远日点（哈雷 2026 年约 34 AU）物理上应无尾，
       但那样课堂上完全看不到尾部结构，故保留 0.10 的演示下限（界面上应视为示意）。 */
    var r = Math.max(pos.r, 0.4);

    /* 尾长与亮度都按真实天文量给出：
         - 尾长 ≈ 0.9 / r^1.2 AU，上限 1.6 AU（真实哈雷在 0.6 AU 附近的可见尾
           即 1 AU 量级，1986 年那次尘埃尾超过 1 AU），随日心距快速缩短；
         - 活动度在约 10 AU 内衰减，远日点只保留演示下限（真实早已无尾）。
       尾长必须经与轨道一致的距离映射换算成场景单位——距离是幂律压缩
       （distanceBase × AU^distanceExp，档位不同参数不同），直接当作场景单位
       会让近日点的尾横向拉长近十倍。 */
    var tailAU = 0.9 / Math.pow(r, 1.2);
    tailAU = tailAU < 0.02 ? 0.02 : (tailAU > 1.6 ? 1.6 : tailAU);
    var len = SOLAR.auToScene(r + tailAU) - SOLAR.auToScene(r);
    if (len < 0.6) len = 0.6;

    var act = 1 - (r - 0.8) / 10;
    act = act < 0.10 ? 0.10 : (act > 1 ? 1 : act);
    var lenNorm = len / 36;                                       // 摆动/张开的归一化基准（近日点尾长≈36 单位）

    /* 拖尾线段是 systemRoot 的子对象，统一使用 systemRoot 局部坐标
       （太阳位于该局部原点，故尾向 = normalize(彗星局部坐标)） */
    var dir = cometObj.dir.set(sp.x, sp.y, sp.z);
    if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
    dir.normalize();
    var side = cometObj.side.set(0, 1, 0).cross(dir);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0).cross(dir);
    side.normalize();
    if (cometObj.vel.lengthSq() > 1e-10) {
      side.copy(cometObj.vel).normalize().cross(dir);
      if (side.lengthSq() < 1e-10) side.set(0, 1, 0).cross(dir);
      side.normalize();
    }

    var t = S.elapsed;
    /* 尾的起点从彗核表面之外开始：特写距离下彗核会挡住中心处的粒子，
       视觉上像「尾巴和彗核分了家」。 */
    var head = S.tmpV2.set(sp.x, sp.y, sp.z).addScaledVector(dir, cometObj.mesh.scale.x * 0.55);

    /* 离子尾：笔直背离太阳，三条叠加形成发散的等离子体束（波幅/相位/横向张开各不相同） */
    var ION = [
      { wob: 1.70, ph: 0.0, spread: -1.0, gain: 1.00, size: 2.6 },
      { wob: 1.05, ph: 2.1, spread: 0.15, gain: 0.72, size: 2.2 },
      { wob: 0.55, ph: 4.4, spread: 1.0, gain: 0.50, size: 1.8 }
    ];
    for (var k = 0; k < cometObj.ions.length; k++) {
      var ion = cometObj.ions[k], cfgI = ION[k] || ION[2];
      var n = ion.max, arr = ion.pos;
      for (var i = 0; i < n; i++) {
        /* f = 1 处是彗核（最亮最小），f = 0 处是尾端（最淡最大） */
        var f = 1 - i / (n - 1);
        var wob = Math.sin(t * 1.15 + cfgI.ph + f * 5.2) * cfgI.wob * f * lenNorm;
        var off = wob + cfgI.spread * f * lenNorm * 1.8;
        arr[i * 3] = head.x + dir.x * len * f + side.x * off;
        arr[i * 3 + 1] = head.y + dir.y * len * f + side.y * off;
        arr[i * 3 + 2] = head.z + dir.z * len * f + side.z * off;
        ion.fade[i] = Math.pow(f, 1.3);                       // 头部最亮
        ion.size[i] = cfgI.size * (0.5 + 1.7 * (1 - f));      // 尾端粒子更大（扩散）
      }
      ion.points.geometry.attributes.position.needsUpdate = true;
      ion.points.geometry.attributes.aFade.needsUpdate = true;
      ion.points.geometry.attributes.aSize.needsUpdate = true;
      ion.mat.uniforms.uOpacity.value = (0.10 + 0.50 * act) * cfgI.gain;
    }

    /* 尘埃尾：滞后于运动方向并弯曲，三条不同弯曲度叠成扇形。
       混合系数 0.75：越偏向 -velocity，「拖在飞行后方」的感觉越强。 */
    var back = S.tmpV3.copy(cometObj.vel);
    if (back.lengthSq() > 1e-10) back.normalize(); else back.set(0, 0, 0);
    var dx = dir.x - back.x * 0.75, dy = dir.y - back.y * 0.75, dz = dir.z - back.z * 0.75;
    var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;

    var DUST = [
      { bend: 0.30, dlen: 0.56, gain: 1.00, size: 2.2 },
      { bend: 0.16, dlen: 0.44, gain: 0.80, size: 2.0 },
      { bend: 0.48, dlen: 0.66, gain: 0.62, size: 1.7 }
    ];
    for (var q = 0; q < cometObj.dusts.length; q++) {
      var dust = cometObj.dusts[q], cfgD = DUST[q] || DUST[2];
      var m = dust.max, darr = dust.pos, dlen = len * cfgD.dlen;
      for (var j = 0; j < m; j++) {
        var g = 1 - j / (m - 1);          // 与离子尾同因：j = m-1 是彗核（最亮）
        var bend = g * g * dlen * cfgD.bend;
        darr[j * 3] = head.x + dx * dlen * g + side.x * bend;
        darr[j * 3 + 1] = head.y + dy * dlen * g + side.y * bend;
        darr[j * 3 + 2] = head.z + dz * dlen * g + side.z * bend;
        dust.fade[j] = Math.pow(g, 1.6);
        dust.size[j] = cfgD.size * (0.5 + 2.0 * (1 - g));
      }
      dust.points.geometry.attributes.position.needsUpdate = true;
      dust.points.geometry.attributes.aFade.needsUpdate = true;
      dust.points.geometry.attributes.aSize.needsUpdate = true;
      dust.mat.uniforms.uOpacity.value = (0.08 + 0.32 * act) * cfgD.gain;
    }

    /* 彗核亮度 / 彗发随日心距变化：近日点彗发明显膨胀 */
    cometObj.mesh.visible = true;
    cometObj.glow.material.opacity = 0.25 + 0.65 * act;
    var gs = 0.030 + 0.085 * act;
    cometObj.glow.scale.set(gs, gs, 1);
    cometObj.halo.material.opacity = 0.10 + 0.38 * act;
    var hs = 0.06 + 0.30 * act;
    cometObj.halo.scale.set(hs, hs, 1);
  }

  return {
    /* 构建 */
    buildPlanets: buildPlanets, surfaceParams: surfaceParams,
    bodyFlattening: bodyFlattening, setPlanetScale: setPlanetScale,
    applyGasFx: applyGasFx, makeBodyUniforms: makeBodyUniforms,
    buildRing: buildRing,
    /* 轨道与拖尾 */
    currentOrbitEpoch: currentOrbitEpoch, orbitEpochStepDays: orbitEpochStepDays,
    makeOrbitGeometry: makeOrbitGeometry, adaptiveOrbitSegments: adaptiveOrbitSegments,
    makeMoonOrbitLine: makeMoonOrbitLine, refreshMoonOrbitLine: refreshMoonOrbitLine,
    makeOrbitLine: makeOrbitLine, refreshOrbitLine: refreshOrbitLine,
    refreshOrbitLines: refreshOrbitLines,
    makeTrail: makeTrail,
    /* 彗星 */
    buildComets: buildComets, buildOneComet: buildOneComet,
    cometById: cometById, updateComets: updateComets, updateOneComet: updateOneComet,
    /* 逐帧 */
    updatePlanet: updatePlanet, updateShadowUniforms: updateShadowUniforms,
  /* 节流常量：单帧拖尾补点上限 / 轨道重建节流，改这里即可，门面与日期跳转路径都读这份 */
  TRAIL_MAX_SUBSTEPS: TRAIL_MAX_SUBSTEPS, ORBIT_REBUILD_MIN_MS: ORBIT_REBUILD_MIN_MS
  };
})();
