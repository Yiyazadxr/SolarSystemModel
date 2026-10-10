/**
 * 天穹与远景：ESO 银河全景 sky dome、程序化星点（星等分布 + B-V 色温 + 银道带增密
 * + 亮星星芒）、小行星带与柯伊伯带（幂律尺寸分布 + Kirkwood 空隙 + 偏心/倾角抖动
 * + 辉带补正）。
 * 依赖：three.min.js（全局 THREE，r128）、config.js（C.galaxy / C.scale）、
 *       data.js（D.belts）、scene-shared.js（SOLAR.SceneShared：S.nodes / S / U）
 *       scene-shaders.js（SOLAR.Shaders：STAR / SPIKE / BELT / BAND 四组着色器）
 *       scene-gfx.js（SOLAR.Gfx：safeTexture / bvToRgb / disposePoints / 程序化随机流）
 *
 * 为什么单独拆出来：星空、天穹、两条粒子带都是「与行星 / 彗星无关的背景层」——
 * 远景的显隐规则与行星完全不同：星点要跟随相机（恒星在无穷远）、天球只在非低
 * 画质档显示、辉带要按相机仰角补正点云的亮度缺口。这些逻辑原先与行星、标签、
 * 时间控制混在同一个 3000 行的 IIFE 里，改一处星空分布要通读全文；拆出后
 * 「远景长什么样、按什么规则显隐」集中在这一个文件。
 *
 * 本模块不持有 scene / camera / systemRoot：三者均由门面 init 时创建并写入
 * S.nodes，这里只引用（不创建、不替换），从而支持随时整体重建。
 * 共享状态归属：
 *   S.nodes.starfield / starSpikes / skyDome / beltObjects / bandObjects
 *      —— 切画质走原地重建，字段会被整体替换，因此必须是共享字段而非模块私有变量；
 *   S.beltsVisible
 *      —— 跨模块可见性开关：addBand / addBelt 构建时读取，门面 setBeltsVisible
 *         写入并回放给已建对象，语义与原模块级变量一致；
 *   S.quality / S.qv / S.qualityName
 *      —— 画质档（星点数、带粒子数、星芒开关与倍率）由门面 setQuality 写入。
 * 注：轨道线（makeOrbitLine）尚未纳入本模块，仍在门面；后续按同一批搬运范围迁入。
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Backdrop = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA;
  var DEG = C.astro.DEG;

  /* 共享状态注册表：scene-shared.js 先于本文件加载，S 只改字段、从不整体替换 */
  var S = SOLAR.SceneShared.S;
  /* 共享 uniform（多个材质共用同一对象，更新一次即全部生效） */
  var U = SOLAR.SceneShared.U;

  /* ---------- 星空 ---------- */

  /* 银道面法线（与 galaxy.js 的 60.2° 倾角保持一致） */
  function galacticPole() {
    var a = C.galaxy.tiltDeg * DEG;
    return new THREE.Vector3(0, Math.cos(a), Math.sin(a));
  }

  /* 阶段5 B3：真实全天银河背景（ESO/S. Brunier，CC BY 4.0，见 NOTICE）
     用一颗内表面贴 equirect 全景图的天球取代纯色天空：天球每帧跟随相机，
     等效无限远背景；程序化星点保留（近景仍需），两者叠加。
     全景图为 2:1 等距圆柱，球面默认 UV 与之对应，无需改 mapping。
     低画质档不显示（见 update 中的可见性同步），避免额外显存与带宽。 */
  function buildSkyDome() {
    if (S.nodes.skyDome) return;
    var r = (S.nodes.camera && S.nodes.camera.far) ? S.nodes.camera.far * 0.9 : 1e6;
    /* ESO 全景实测只含「地平线以上」天区：图像下半 50% 平均亮度 0、
       非黑像素 0%（未拍摄区域）。因此天球只建上半球（北极→赤道 =
       天顶→地平线）；下半球无数据，沿用场景背景色 + 程序化星点，不编造。 */
    var geo = new THREE.SphereGeometry(r, 64, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    /* 顶点 alpha：赤道（地平线）处 0 → 向天顶 15% 高度内平滑升到 1。
       银河带最亮的部分贴近赤道，直接硬切会与下方深空形成一条割裂的
       水平分界线；渐隐让它像真实地平线一样柔和沉入背景。
       r128 支持 4 分量顶点色（含 alpha），配合 transparent 生效。 */
    var posAttr = geo.attributes.position;
    var vc = new Float32Array(posAttr.count * 4);
    for (var vi = 0; vi < posAttr.count; vi++) {
      var ny = posAttr.getY(vi) / r;                     /* 赤道 0 → 天顶 1 */
      var a = Math.min(1, ny / 0.15);
      a = a * a * (3 - 2 * a);                           /* smoothstep */
      vc[vi * 4] = 1; vc[vi * 4 + 1] = 1; vc[vi * 4 + 2] = 1; vc[vi * 4 + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(vc, 4));
    var mat = new THREE.MeshBasicMaterial({
      color: 0x0a0f18, side: THREE.BackSide, depthWrite: false, fog: false,
      transparent: true, vertexColors: true
    });
    S.nodes.skyDome = new THREE.Mesh(geo, mat);
    S.nodes.skyDome.frustumCulled = false;
    S.nodes.skyDome.renderOrder = -1;        // 最先绘制（背景层）
    S.nodes.scene.add(S.nodes.skyDome);
    SOLAR.Gfx.safeTexture('milkyway', function (t) {
      if (!t || !S.nodes.skyDome) return;
      if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
      /* 只采样图像上半（v ∈ [0.5,1] = 地平线→天顶）：下半是未拍摄的黑区 */
      t.repeat.set(1, 0.5);
      t.offset.set(0, 0.5);
      S.nodes.skyDome.material.map = t;
      S.nodes.skyDome.material.color.set(0xffffff);
      S.nodes.skyDome.material.needsUpdate = true;
    });
  }

  function buildStarfield() {
    SOLAR.Gfx.disposePoints(S.nodes.starfield);
    SOLAR.Gfx.disposePoints(S.nodes.starSpikes);

    /* 固定随机流：与画质档无关，低/高画质的前 n 颗星保持同一批粒子。 */
    SOLAR.Gfx.setRandomStream(0x53544152);

    var n = S.quality.starCount;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var size = new Float32Array(n);

    var spikeIdx = [];
    var pole = galacticPole();
    /* 与银道面垂直的两个基向量 */
    var e1 = new THREE.Vector3(1, 0, 0);
    var e2 = new THREE.Vector3(0, pole.z, -pole.y);

    var mMin = 1.15, mMax = 6.60;
    var k = 0.6 * Math.LN10;
    var e0 = Math.exp(k * mMin), e1v = Math.exp(k * mMax);
    var rgb = [0, 0, 0];

    for (var i = 0; i < n; i++) {
      var ux, uy, uz;
      if (SOLAR.Gfx.random() < 0.56) {
        /* 银道带：纬度压向银道面 */
        var lat = Math.asin(SOLAR.Gfx.random() * 2 - 1) * 0.30;
        var lon = SOLAR.Gfx.random() * Math.PI * 2;
        var cl = Math.cos(lat), sl = Math.sin(lat);
        var cl2 = Math.cos(lon), sl2 = Math.sin(lon);
        ux = cl * (cl2 * e1.x + sl2 * e2.x) + sl * pole.x;
        uy = cl * (cl2 * e1.y + sl2 * e2.y) + sl * pole.y;
        uz = cl * (cl2 * e1.z + sl2 * e2.z) + sl * pole.z;
      } else {
        var u = SOLAR.Gfx.random() * 2 - 1, th = SOLAR.Gfx.random() * Math.PI * 2;
        var s = Math.sqrt(1 - u * u);
        ux = s * Math.cos(th); uy = u; uz = s * Math.sin(th);
      }

      var r = 5200 + SOLAR.Gfx.random() * 2200;
      pos[i * 3] = r * ux; pos[i * 3 + 1] = r * uy; pos[i * 3 + 2] = r * uz;

      /* 星等分布：N(m) ∝ 10^(0.6m)，暗星远多于亮星 */
      var m = Math.log(SOLAR.Gfx.random() * (e1v - e0) + e0) / k;
      var flux = Math.pow(10, -0.4 * (m - mMin));
      var bright = Math.pow(flux, 0.42) * 0.92 + 0.08;

      /* B-V 色温分布：红矮星居多，带蓝白尾 */
      var bv = 0.62 + SOLAR.Gfx.randn() * 0.42;
      if (bv < -0.33) bv = -0.33; else if (bv > 1.70) bv = 1.70;
      SOLAR.Gfx.bvToRgb(bv, rgb);

      var sc = bright * (0.82 + 0.18 * SOLAR.Gfx.random());
      col[i * 3] = rgb[0] * sc; col[i * 3 + 1] = rgb[1] * sc; col[i * 3 + 2] = rgb[2] * sc;

      var px = 0.85 + 2.45 * Math.pow(bright, 2.2);
      size[i] = px;

      /* 亮星阈值按星等分布标定：约取最亮的 1%~2%（高画质下约 150~200 颗） */
      if (bright > 0.45) spikeIdx.push(i);
    }

    S.nodes.starfield = makePoints(pos, col, size, n, SOLAR.Shaders.STAR_VERT, SOLAR.Shaders.STAR_FRAG, false);
    S.nodes.scene.add(S.nodes.starfield);

    /* 亮星十字星芒：单独一批点，尺寸更大 */
    if (S.qv.spikes && spikeIdx.length) {
      var cap = Math.min(spikeIdx.length, Math.max(40, Math.round(n * 0.03)));
      var sp = new Float32Array(cap * 3), sc2 = new Float32Array(cap * 3), ss = new Float32Array(cap);
      for (var j = 0; j < cap; j++) {
        var src = spikeIdx[j];
        sp[j * 3] = pos[src * 3]; sp[j * 3 + 1] = pos[src * 3 + 1]; sp[j * 3 + 2] = pos[src * 3 + 2];
        var f = 0.55 * S.qv.starSpikes;
        sc2[j * 3] = col[src * 3] * f; sc2[j * 3 + 1] = col[src * 3 + 1] * f; sc2[j * 3 + 2] = col[src * 3 + 2] * f;
        ss[j] = 7 + 19 * (size[src] / 3.3);
      }
      S.nodes.starSpikes = makePoints(sp, sc2, ss, cap, SOLAR.Shaders.STAR_VERT, SOLAR.Shaders.SPIKE_FRAG, false);
      S.nodes.scene.add(S.nodes.starSpikes);
    } else {
      S.nodes.starSpikes = null;
    }
  }

  function makePoints(pos, col, size, count, vs, fs, attenuate) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    var uniforms = { uPixelRatio: U.pixelRatio, uHeightScale: U.heightScale, uSizeScale: { value: 1 }, uOpacity: { value: 1 } };
    /* 注意：ShaderMaterial 不支持 sizeAttenuation 属性，透视衰减在顶点着色器内自行处理 */
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: vs, fragmentShader: fs,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = true;
    geo.computeBoundingSphere();
    return pts;
  }

  /* ---------- 小行星带 / 柯伊伯带 ---------- */
  function buildBelts() {
    S.nodes.beltObjects.forEach(function (b) { SOLAR.Gfx.disposePoints(b); });
    S.nodes.beltObjects = [];
    S.nodes.bandObjects.forEach(function (b) { SOLAR.Gfx.disposePoints(b); });   /* disposePoints 只管 geometry/material 与摘除父节点，网格同样适用 */
    S.nodes.bandObjects = [];
    addBelt(D.belts.asteroid, S.quality.asteroidCount, true, 0x41535452);
    addBelt(D.belts.kuiper, S.quality.kuiperCount, false, 0x4b554950);
    addBand(D.belts.asteroid, true);
    addBand(D.belts.kuiper, false);
  }

  /* 辉带半径按当前档位的距离映射现算；轴对称，不必随粒子自转 */
  function addBand(cfg, isAsteroid) {
    var rIn = SOLAR.auToScene(cfg.innerAu);
    var rOut = SOLAR.auToScene(cfg.outerAu);
    var pad = 0.05 * (rOut - rIn);
    /* 几何在 XZ 平面烘焙，着色器由 position.xz 反算半径，故不能用 scale 缩放
       （会把半径一起缩掉），档位变化只能整体重建 */
    var geo = new THREE.RingGeometry(rIn - pad, rOut + pad, 192, 1);
    geo.rotateX(-Math.PI / 2);
    var col = new THREE.Color(cfg.color);
    col.multiplyScalar(1.12);
    var mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: col },
        uOpacity: { value: cfg.bandOpacity !== undefined ? cfg.bandOpacity : 0.22 },
        uFade: { value: 0 },
        uDistBase: { value: C.scale.distanceBase },
        uDistExp: { value: C.scale.distanceExp },
        uInnerAu: { value: cfg.innerAu },
        uOuterAu: { value: cfg.outerAu },
        uKind: { value: isAsteroid ? 1 : 0 },
        uSeed: { value: isAsteroid ? 0.0 : 1.73 }
      },
      vertexShader: SOLAR.Shaders.BAND_VERT, fragmentShader: SOLAR.Shaders.BAND_FRAG,
      transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide
    }));
    mesh.frustumCulled = false;
    S.nodes.systemRoot.add(mesh);
    mesh.visible = S.beltsVisible;
    S.nodes.bandObjects.push(mesh);
  }

  /* Kirkwood 空隙等径向结构（简化） */
  function gapFactor(au, c, w) {
    return 1 - 0.92 * Math.exp(-Math.pow((au - c) / w, 2));
  }

  function beltDensity(au, cfg, isAsteroid) {
    if (isAsteroid) {
      var d = Math.exp(-Math.pow((au - 2.72) / 0.62, 2)) * 0.55 + 0.45;
      d *= gapFactor(au, 2.06, 0.035);
      d *= gapFactor(au, 2.50, 0.055);
      d *= gapFactor(au, 2.82, 0.045);
      d *= gapFactor(au, 3.27, 0.050);
      return d;
    }
    var k = 0.35 + 0.65 * Math.exp(-Math.pow((au - 44.5) / 9.5, 2));
    k *= 1 - 0.42 * Math.exp(-Math.pow((au - 39.4) / 1.1, 2));   // 3:2 共振群略稀疏
    return k;
  }

  function sampleAu(cfg, isAsteroid) {
    var au = cfg.innerAu + SOLAR.Gfx.random() * (cfg.outerAu - cfg.innerAu);
    for (var i = 0; i < 10; i++) {
      if (SOLAR.Gfx.random() < beltDensity(au, cfg, isAsteroid)) break;
      au = cfg.innerAu + SOLAR.Gfx.random() * (cfg.outerAu - cfg.innerAu);
    }
    return au;
  }

  function addBelt(cfg, count, isAsteroid, salt) {
    SOLAR.Gfx.setRandomStream(salt === undefined ? (isAsteroid ? 0x41535452 : 0x4b554950) : salt);
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    var size = new Float32Array(count);
    var base = new THREE.Color(cfg.color);

    for (var i = 0; i < count; i++) {
      var au = sampleAu(cfg, isAsteroid);
      var rScene = SOLAR.auToScene(au);
      var ang = SOLAR.Gfx.random() * Math.PI * 2;
      /* 偏心率造成径向抖动 + 倾角造成垂向散布，避免整齐圆环；
         抖动幅度需小于 Kirkwood 空隙宽度，否则径向结构会被抹平 */
      var ecc = (SOLAR.Gfx.random() - 0.5) * 0.024;
      var rr = rScene * (1 + ecc * Math.cos(ang));
      var inc = SOLAR.Gfx.randn() * cfg.inclinationDeg * 0.34 * DEG;
      var h = rr * Math.sin(inc) + (SOLAR.Gfx.random() - 0.5) * cfg.thicknessAu * rScene * 0.02;

      pos[i * 3] = rr * Math.cos(ang);
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = rr * Math.sin(ang);

      /* 尺寸幂律分布：小颗粒远多于大块；亮度随尺寸与反照率变化 */
      var s = isAsteroid ? (0.17 + Math.pow(SOLAR.Gfx.random(), 3.0) * 0.92)
                         : (0.28 + Math.pow(SOLAR.Gfx.random(), 3.0) * 1.55);
      size[i] = s;

      var albedo = 0.45 + SOLAR.Gfx.random() * 0.75;
      var warm = SOLAR.Gfx.random();
      var tint = isAsteroid ? (warm < 0.35 ? 1.16 : (warm > 0.82 ? 0.80 : 1.0)) : 0.88 + warm * 0.30;
      var b = Math.min(1.15, (0.32 + 0.55 * Math.min(s, 1.1)) * albedo);
      col[i * 3] = base.r * tint * b;
      col[i * 3 + 1] = base.g * tint * b;
      col[i * 3 + 2] = base.b * tint * b;
    }

    var pts = makePoints(pos, col, size, count, SOLAR.Shaders.BELT_VERT, SOLAR.Shaders.BELT_FRAG, true);
    /* 太阳系根节点会整体随银河系平移；环带是近景核心对象，使用固定显示避免
       画质重建后包围球与相机相对位置短暂失配而被错误裁掉。 */
    pts.frustumCulled = false;
    pts.material.uniforms.uOpacity.value = isAsteroid ? 0.62 : 0.52;
    pts.material.uniforms.uSizeScale.value = 1.0;
    S.nodes.systemRoot.add(pts);
    pts.visible = S.beltsVisible;
    S.nodes.beltObjects.push(pts);
  }

  return {
    buildSkyDome: buildSkyDome, buildStarfield: buildStarfield,
    buildBelts: buildBelts
  };
})();
