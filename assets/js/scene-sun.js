/**
 * 太阳与日冕：程序化光球表面（米粒组织 / 临边昏暗 / 黑子）+ 单层日冕壳 +
 * 色球层配件（日珥 / 耀斑）+ 三档观测视图（光球层 / 色球层 / 日冕）。
 * 依赖：three.min.js（全局 THREE，r128）、config.js、data.js、scene-shared.js
 *       （SOLAR.SceneShared：节点表 + 共享状态）、scene-shaders.js（SOLAR.Shaders）、
 *       scene-gfx.js（SOLAR.Gfx：radialTexture / smoothstep）
 *
 * 为什么单独拆出来：太阳的可见结构（光球 shader、黑子、日冕壳、色球层配件）
 * 全部挂在 sunGroup 这一棵子树下，且只有太阳自己有「观测层」概念
 * （切到色球层 / 日冕层时要改 uniform、日冕倍率与光晕大小）。
 * 这些状态原先与 3000 行的行星 / 星空 / 标签逻辑混在一个 IIFE 里，
 * 改一处要通读全文；拆出后「太阳怎么显示」集中在这一个文件。
 *
 * 太阳系的根节点 systemRoot 不归本模块（门面 init 时创建），
 * 本模块只通过 S.nodes.systemRoot 引用，从而支持随时整体替换。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Sun = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA;
  var DEG = C.astro.DEG;

  /* 共享状态注册表：scene-shared.js 先于本文件加载，S 只改字段、从不整体替换 */
  var S = SOLAR.SceneShared.S;
  /* 共享 uniform（多个材质共用同一对象，更新一次即全部生效） */
  var U = SOLAR.SceneShared.U;

  /* ---------- 太阳 ---------- */
  /* 太阳网格分段按画质档查表。表在本模块持有并导出：buildSun 建几何与门面
     applyQualityDetail 的切画质重建查同一张表，只有一份。 */
  var SUN_SEGMENTS = { xh: [192, 128], h: [96, 64], m: [64, 48], l: [48, 32] };

  function buildSun() {
    var sd = D.sun;
    var radius = SOLAR.kmToScene(sd.radiusKm) * C.scale.sunSizeFactor;
    var seg = SUN_SEGMENTS[S.qv.seg] || SUN_SEGMENTS.m;

    S.nodes.sunGroup = new THREE.Group();
    S.nodes.systemRoot.add(S.nodes.sunGroup);

    S.sunUniforms = {
      uTime: U.time,
      uGasT: U.gasT,
      /* 恒星表面亮度物理上远高于行星。取 2.15 让盘面核心过曝成白热；若只给到约 1.4，
         峰值尚不足 0.80，在全局阈值方案里反而亮不过土星受光面（P90≈0.93）。
         改分层 Bloom 后阈值不再承担「排除行星」的职责，太阳可直接提到白热核心。 */
      uIntensity: { value: 2.15 },
      uSpot: { value: 1.0 },
      uDetail: { value: 1.0 },
      uColorA: { value: new THREE.Color(0x8a2b06) },
      uColorB: { value: new THREE.Color(0xfff0c0) }
    };

    S.nodes.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, seg[0], seg[1]),
      new THREE.ShaderMaterial({
        uniforms: S.sunUniforms,
        vertexShader: SOLAR.Shaders.SUN_VERT, fragmentShader: SOLAR.Shaders.SUN_FRAG
      })
    );
    S.nodes.sunMesh.userData.bodyId = 'sun';
    S.nodes.sunMesh.userData.sunRadius = radius;
    S.nodes.sunMesh.userData.sunBaseRadius = radius;   // 建模时的烘焙半径，切档以此为基准，避免逐次累乘放大
    S.nodes.sunGroup.add(S.nodes.sunMesh);
    S.nodes.pickables.push(S.nodes.sunMesh);

    /* 黑子用少量固定的贴面圆片叠加在光球表面，远处和其他观测层自动隐藏。
       使用平面而不是小球，避免黑子在太阳边缘形成不自然的 3D 凸起。 */
    S.nodes.sunSpots = [];
    var spotNormals = [
      [1.38, 0.28], [1.62, -0.46], [1.86, 0.78],
      [1.12, -1.02], [2.08, -0.12], [1.48, 1.18]
    ];
    var spotSizes = [0.026, 0.018, 0.022, 0.014, 0.019, 0.012];
    for (var pi = 0; pi < spotNormals.length; pi++) {
      var spotNormal = new THREE.Vector3().setFromSphericalCoords(1, spotNormals[pi][0], spotNormals[pi][1]);
      var spot = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({
          color: 0x020202, transparent: true, opacity: 0.98,
          depthTest: false, depthWrite: false, side: THREE.FrontSide
        })
      );
      /* CircleGeometry 默认朝 +Z，旋到黑子所在的球面法线后就能贴合表面。 */
      spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spotNormal);
      /* 日冕与光晕是透明物体，黑子最后绘制才能保持深色；FrontSide 仍会
         自动裁掉背向相机的黑子，不会穿透整颗太阳显示到背面。
         黑子挂在 sunMesh（而非 sunGroup）下，随太阳几何自转整体转动。 */
      spot.renderOrder = 20;
      S.nodes.sunMesh.add(spot);
      S.nodes.sunSpots.push({
        mesh: spot,
        normal: spotNormal,
        size: spotSizes[pi]
      });
    }
    updateSunSpots();

    /* 日冕只保留一层紧致外壳（1.20 倍太阳半径）：两层叠加会把示意比例的
       太阳撑成发光大环，也会让压缩档与弱压缩档的边缘观感不一致。 */
    S.nodes.coronaShells = [];
    addCoronaShell(radius * 1.20, 0xffcf80, 1.7, 0.62, 1);

    /* 光晕 Sprite：sizeAttenuation=false -> 恒定屏幕尺寸，远处也不会消失 */
    S.nodes.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SOLAR.Gfx.radialTexture('255,220,150', 2.6), color: 0xffffff,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: false
    }));
    S.nodes.sunGlow.scale.set(0.06, 0.06, 1);
    S.nodes.sunGroup.add(S.nodes.sunGlow);

    /* ---- 色球层配件（默认隐藏，setSunView('chromosphere') 时显示）----
       日珥：贴边的半环形火焰（两端埋入球内、拱起在轮廓外），教材图 3.1-9；
       耀斑：贴在光球上方的亮斑，对应教材图 3.1-8 的增亮区。
       两者固定在日面的固定经纬度上、挂在 sunMesh 下：随太阳自转一起转、
       随档位倍率一起缩放，转到背面时会被球体挡住（真实日珥与耀斑也是
       随日面转出视野）。此前每帧贴向相机，相机一转它们就跟着跑，看着
       像悬在日面上飘；且位置用烘焙半径，弱压缩档太阳放大后配件陷进
       球体，整档都看不见。 */
    S.nodes.sunProminences = [];
    S.sunPromRadius = radius;
    var pi2;

    /* 把配件固定到日面某点：局部 +Y 对准该点径向（法线），位置落在光球面。
       挂在 sunMesh 下后，世界尺寸 = 半径基准 × sunMesh.scale。 */
    function placeChromo(grp, n, surfaceFactor) {
      var t = new THREE.Vector3().crossVectors(S.UPY, n);
      if (t.lengthSq() < 1e-4) t.set(1, 0, 0); else t.normalize();
      var b = new THREE.Vector3().crossVectors(t, n);
      grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, n, b));
      grp.position.copy(n).multiplyScalar(radius * surfaceFactor);
    }

    S.nodes.sunFlares = [];
    var pi3, sj2;
    function chromoTube(pts, rad, col, op) {
      return new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 26, radius * rad, 6, false),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: op,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false
        })
      );
    }

    /* 日珥 */
    var promGrp = new THREE.Group();
    var PROM_STRANDS = [
      { r: 0.017, w: 1.00, dx: 0, dy: 0, col: 0xffb04a, op: 0.74 },
      { r: 0.012, w: 0.86, dx: 0.030, dy: 0.014, col: 0xffc46a, op: 0.60 },
      { r: 0.010, w: 0.72, dx: -0.027, dy: -0.015, col: 0xff7a45, op: 0.54 }
    ];
    for (pi3 = 0; pi3 < PROM_STRANDS.length; pi3++) {
      var pst = PROM_STRANDS[pi3];
      var ppts = [];
      for (sj2 = 0; sj2 <= 7; sj2++) {
        var t2 = sj2 / 7, ang2 = t2 * Math.PI;
        var wob2 = Math.sin(t2 * 6.2 + pi3 * 2.1) * 0.020 + Math.sin(t2 * 11.0 + pi3 * 0.9) * 0.010;
        ppts.push(new THREE.Vector3(
          Math.cos(ang2) * 0.27 * pst.w + pst.dx + wob2 * 0.6,
          Math.sin(ang2) * (0.31 + 0.06 * pst.w) + pst.dy + wob2,
          Math.sin(t2 * 9.0 + pi3 * 3.3) * 0.03
        ));
      }
      promGrp.add(chromoTube(ppts, pst.r, pst.col, pst.op));
    }
    promGrp.visible = false;
    /* 固定在北纬约 22° 的一处（局部 +Y 沿该点径向，拱顶伸到轮廓外） */
    placeChromo(promGrp, new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - 0.38, 0.7), 0.97);
    S.nodes.sunMesh.add(promGrp);
    S.nodes.sunProminences.push(promGrp);

    /* 耀斑 */
    var fGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SOLAR.Gfx.radialTexture('255,236,170', 2.6), color: 0xffe9a0, transparent: true,
      opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    fGlow.scale.set(radius * 0.26, radius * 0.26, 1);
    var FN = 30;
    var fpos = new Float32Array(FN * 3);
    var fcol = new Float32Array(FN * 3);
    for (var fi = 0; fi < FN; fi++) {
      var fh = Math.pow(Math.random(), 0.8) * 0.18;      /* 高度 0~0.26R，底部更密 */
      var fr2 = fh * 0.55 + 0.012;                        /* 锥形张开 */
      var fa = Math.random() * Math.PI * 2;
      fpos[fi * 3] = Math.cos(fa) * fr2;
      fpos[fi * 3 + 1] = fh + 0.012;
      fpos[fi * 3 + 2] = Math.sin(fa) * fr2;
      var ft3 = fh / 0.26;
      fcol[fi * 3] = 1.0;
      fcol[fi * 3 + 1] = 0.92 - ft3 * 0.35;
      fcol[fi * 3 + 2] = 0.62 - ft3 * 0.40;
    }
    var fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    var flareGrp = new THREE.Group();
    flareGrp.add(fGlow);
    var jetMat = new THREE.PointsMaterial({
      size: radius * 0.05, map: SOLAR.Gfx.radialTexture('255,236,170', 2.4),
      vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      sizeAttenuation: true
    });
    flareGrp.add(new THREE.Points(fgeo, jetMat));
    /* 点材质的 size 是材质属性、不随父级 scale 变化，档位倍率需单独换算 */
    flareGrp.userData.jetMat = jetMat;
    flareGrp.userData.jetBaseSize = radius * 0.05;
    flareGrp.visible = false;
    /* 固定在南纬约 18° 的另一处，与日珥错开 */
    placeChromo(flareGrp, new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 + 0.31, 2.6), 1.0);
    S.nodes.sunMesh.add(flareGrp);
    S.nodes.sunFlares.push(flareGrp);

    /* 重建后恢复当前观测视图（切画质会重跑 buildSun） */
    setSunView(S.sunViewMode);
  }

  function addCoronaShell(radius, color, power, strength, layer) {
    var shell = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: U.time,
          uColor: { value: new THREE.Color(color) },
          uStrength: { value: strength },
          uPower: { value: power }
        },
        vertexShader: SOLAR.Shaders.SUN_VERT,
        fragmentShader: SOLAR.Shaders.CORONA_FRAG,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
      })
    );
    shell.userData.coronaLayer = layer;
    shell.userData.coronaBase = strength;
    shell.userData.viewScale = 1;
    S.nodes.sunGroup.add(shell);
    S.nodes.coronaShells.push(shell);
  }

  /* ---------- 太阳观测视图（跟随太阳时由底部按钮切换） ----------
     photosphere  光球层：默认视图，黑子加可见（教材图 3.1-7 太阳黑子）
     chromosphere 色球层：暗红球面 + 日珥环 + 耀斑亮斑（教材图 3.1-8/9）
     corona       日冕：盘面近黑（日全食月影），冕壳放大提亮变白（教材图 3.1-10） */
  var SUN_VIEW_STATES = {
    photosphere: { cA: 0x8a2b06, cB: 0xfff0c0, inten: 2.15, spot: 0.0, detail: 1.0,
      s0: { c: 0xffcf80, s: 0.62, k: 1.0 },
      glow: 0.06, prom: false, flare: false },
    chromosphere: { cA: 0x7a1502, cB: 0xff7a45, inten: 1.15, spot: 0.0, detail: 0.55,
      s0: { c: 0xff6a50, s: 0.42, k: 1.0 },
      glow: 0.05, prom: true, flare: true },
    corona: { cA: 0x0d0a08, cB: 0x241a12, inten: 0.02, spot: 0.0, detail: 0.0,
      s0: { c: 0xffffff, s: 2.4, k: 1.08 },
      glow: 0.30, prom: false, flare: false }
  };

  function setSunView(mode) {
    if (!S.sunUniforms || !SUN_VIEW_STATES[mode]) return null;
    var st = SUN_VIEW_STATES[mode];
    S.sunViewMode = mode;
    S.sunUniforms.uColorA.value.setHex(st.cA);
    S.sunUniforms.uColorB.value.setHex(st.cB);
    S.sunUniforms.uIntensity.value = st.inten;
    S.sunUniforms.uSpot.value = st.spot;
    S.sunUniforms.uDetail.value = st.detail;
    updateSunSpots();
    if (S.nodes.coronaShells[0]) {
      S.nodes.coronaShells[0].material.uniforms.uColor.value.setHex(st.s0.c);
      S.nodes.coronaShells[0].material.uniforms.uStrength.value = st.s0.s;
      S.nodes.coronaShells[0].userData.coronaBase = st.s0.s;
      S.nodes.coronaShells[0].userData.viewScale = st.s0.k;
      /* 观测层切换不能抹掉当前压缩档的太阳倍率；否则 faithful 档切到
         色球层/日冕层时，外壳会突然缩回 compact 的半径。 */
      var profileSunScale = S.nodes.sunMesh && S.nodes.sunMesh.userData ? (S.nodes.sunMesh.userData.sunScale || 1) : 1;
      var profileSunFactor = (S.scaleFactors[S.scaleMode] || S.scaleFactors.compact).sun;
      S.nodes.coronaShells[0].scale.setScalar(profileSunScale * profileSunFactor * st.s0.k);
    }
    if (S.nodes.sunGlow) S.nodes.sunGlow.scale.set(st.glow, st.glow, 1);
    /* 耀斑的显隐与位置由 updateSunFlares 每帧控制（贴可见盘面） */
    return mode;
  }

  function getSunView() { return S.sunViewMode; }

  function updateSunSpots() {
    var visible = S.sunViewMode === 'photosphere' && S.sunScreenFraction > 0.025;
    /* 黑子在 sunMesh 局部系中摆放：位置与尺寸用烘焙基准半径，
       世界尺寸 = 基准 × mesh.scale（与日冕、光晕的换算一致） */
    var radius = S.nodes.sunMesh && S.nodes.sunMesh.userData ? (S.nodes.sunMesh.userData.sunBaseRadius || S.sunPromRadius) : S.sunPromRadius;
    for (var i = 0; i < S.nodes.sunSpots.length; i++) {
      var item = S.nodes.sunSpots[i];
      item.mesh.visible = visible;
      /* 稍微离开光球表面，避免深度缓冲把贴面黑子吃掉；偏移仍远小于斑点直径，
         视觉上保持贴面效果，不会变成悬浮球体。 */
      item.mesh.position.copy(item.normal).multiplyScalar(radius * 1.012);
      item.mesh.scale.setScalar(radius * item.size);
    }
  }

  /* 日珥与耀斑只在色球层视图可见。两者固定在日面（挂在 sunMesh 下），
     位置、朝向与尺寸随太阳自转和档位倍率自动跟随，这里只逐帧切换显隐。
     转到背面的配件由球体挡住，与真实日珥随日面转出视野一致。 */
  function updateSunFlares() {
    var vis = S.sunViewMode === 'chromosphere';
    var i;
    for (i = 0; i < S.nodes.sunProminences.length; i++) S.nodes.sunProminences[i].visible = vis;
    for (i = 0; i < S.nodes.sunFlares.length; i++) S.nodes.sunFlares[i].visible = vis;
  }

  /* 太阳辉光随相机距离自适应：近处抑制过曝，远处保持可见 */
  function updateSunAdaptive() {
    if (!S.nodes.sunMesh || !S.nodes.camera) return;
    var radius = S.nodes.sunMesh.userData.sunRadius || 1;
    var dist = S.tmpV1.copy(S.nodes.camera.position).sub(S.nodes.systemRoot.position).length();
    if (!(dist > 1e-3)) dist = 1e-3;

    var halfTan = Math.tan(S.nodes.camera.fov * DEG * 0.5);
    var angFrac = (radius / dist) / halfTan;          // 太阳半径占半屏高的比例
    S.sunScreenFraction = angFrac < 0 ? 0 : (angFrac > 3 ? 3 : angFrac);
    updateSunSpots();

    var near = angFrac / 0.55;                        // 0=远 1=极近
    near = near < 0 ? 0 : (near > 1 ? 1 : near);

    /* 日冕：贴近时压低强度，避免糊成一片白 */
    for (var i = 0; i < S.nodes.coronaShells.length; i++) {
      var shell = S.nodes.coronaShells[i];
      var base = shell.userData.coronaBase || 0.3;
      var vis = S.qv.corona >= shell.userData.coronaLayer;
      shell.visible = vis;
      shell.material.uniforms.uStrength.value = base * (1 - 0.35 * near);
    }

    /* 光晕 Sprite：恒定屏幕尺寸 + 近距离降透明度 */
    var frac = radius / dist / halfTan * 3.0;         // 期望直径（占屏高比例）
    frac = frac < 0.055 ? 0.055 : (frac > 0.85 ? 0.85 : frac);
    var s = frac * 2 * halfTan;
    S.nodes.sunGlow.scale.set(s, s, 1);
    S.nodes.sunGlow.material.opacity = 0.95 - 0.72 * SOLAR.Gfx.smoothstep(0.02, 0.45, angFrac);

    /* 自适应只调整当前观测层的基值；不能把色球层 / 日冕层每帧改回光球参数，
       否则切换后约 20Hz 就会重新出现光球纹理和亮度。 */
    var sunState = SUN_VIEW_STATES[S.sunViewMode] || SUN_VIEW_STATES.photosphere;
    /* 光球层原有的近景降幅约为 0.45 / 2.15；其它观测层沿用同一比例。 */
    S.sunUniforms.uIntensity.value = sunState.inten * (1 - 0.21 * near);
    /* 米粒组织只在当前观测层允许时随屏幕占比开启，日冕层保持无纹理盘面。 */
    S.sunUniforms.uDetail.value = sunState.detail * SOLAR.Gfx.smoothstep(0.02, 0.16, angFrac);
  }

  return {
    buildSun: buildSun, addCoronaShell: addCoronaShell,
    setSunView: setSunView, getSunView: getSunView,
    updateSunSpots: updateSunSpots, updateSunFlares: updateSunFlares,
    updateSunAdaptive: updateSunAdaptive,
    SUN_SEGMENTS: SUN_SEGMENTS
  };
})();
