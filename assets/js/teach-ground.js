/**
 * 平地观日装置（教材图 4.2-14 风格）：观察者站在平地上看太阳的周日视运动。
 * 场景内容：圆形地面、东南西北方位标注、竖直立杆（圭表）、
 * 冬至 / 春秋分 / 夏至三条太阳周日视运动轨迹弧、沿弧运动的太阳、
 * 随太阳方位与高度实时变化的杆影、太阳高度角读数。
 * 物理约定：
 *   纬度 φ 默认 23.5°N（北回归线，与教材图 4.2-14 一致，可用 params.latDeg 覆盖）；
 *   太阳赤纬 δ = asin(sin λ · sin 23.5°)，λ 为太阳黄经（与三球仪同一套公式）；
 *   时角 H = 0 为正午，日出日落 H0 = acos(-tan φ · tan δ)；
 *   地平坐标：x = 东，z = 南，y = 天顶；太阳方向
 *     E = -cosδ·sinH，U = sinδ·sinφ + cosδ·cosφ·cosH，S = cosδ·cosH·sinφ - sinδ·cosφ。
 *   杆影长度 = 杆高 / tan(太阳高度角)，方向与太阳方位相反。太阳落到地平线下时
 *   隐藏太阳、光晕、杆影与高度读数。
 * 依赖：THREE、SOLAR.Gfx（程序化径向纹理）、SOLAR.Controls（取相机）。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachGround = (function () {
  'use strict';

  var DEG = Math.PI / 180;
  var GROUND_R = 10;              /* 地面圆盘半径，轨迹弧与天地线同半径 */
  var POLE_H = 1.6;               /* 立杆高度 */
  var OBLIQUITY = 23.5;           /* 黄赤交角 */
  var YEAR_DAYS = 365.2422;
  var SPRING_DAY = 80;            /* 春分 ≈ 一年中的第 80 天 */
  /* 二分二至 -> λ（度）。键用内部 id（spring/summer/autumn/winter），
     与 teach.js 的 TERM_INFO、teach-orrery 的 TERM_LAMBDA 一致；
     节气名原先直接用中文当键，双语后必须拆成 id + 显示文案。 */
  var TERM_LAMBDA = { spring: 0, summer: 90, autumn: 180, winter: 270 };

  /* 三条轨迹弧：赤纬、颜色、id（春秋分共用一条弧）。
     id 对应 teach.term.* 的 i18n 键，弧名标签由 buildArcs 按当前语言生成。 */
  var ARCS = [
    { id: 'summer', delta: 23.5, color: 0xffd166 },
    { id: 'equinox', delta: 0, color: 0x7ffcd8 },
    { id: 'winter', delta: -23.5, color: 0x8fb0d8 }
  ];
  /* 轨迹弧显示名：逐分支写字面量（理由同 teach.js 的 termLabel ——
     字符串拼接会让 check-i18n 扫不到真实键名）。 */
  function arcName(id) {
    if (id === 'summer') return SOLAR.t('teach.term.summer');
    if (id === 'equinox') return SOLAR.t('teach.term.equinox');
    if (id === 'winter') return SOLAR.t('teach.term.winter');
    return '';
  }

  /* 方位标签：name 改存 i18n 子键（东/南/西/北 → E/S/W/N），显示由 SOLAR.t 取 */
  var CARDINALS = [
    { id: 'e', x: 1, z: 0 },
    { id: 's', x: 0, z: 1 },
    { id: 'w', x: -1, z: 0 },
    { id: 'n', x: 0, z: -1 }
  ];

  var built = false;
  var scene = null;
  var root = null;
  var groundMesh = null;
  var poleMesh = null;
  var shadowGroup = null, shadowMesh = null;   /* 杆影：绕杆底旋转到太阳反方位 */
  var sunMesh = null, sunGlow = null;
  var altLabel = null;                          /* 太阳高度角读数 */
  var arcLines = [];                            /* { line, label } */
  var cardinalLabels = [];                      /* 方位标签精灵，切语言时重贴 */
  var disposeList = [];
  var cam = null;

  var anim = { spin: false, revolve: false, speed: 1 };
  var cur = {};
  /* 轨迹弧当前画的纬度。放进 cur 会把内部键混进参数合并链，改为独立的模块状态；
     只用于跳过重复的 rebuildArcs，不参与渲染。 */
  var arcLat = null;
  var tmpSun = null;               /* 常驻临时向量：apply 在播放期间每帧调用，禁止 new */

  function track(o) { disposeList.push(o); return o; }

  /* ============ 复用资产 ============ */

  function makeLabel(text, size) {
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
    ctx.fillStyle = '#eaffff';
    ctx.fillText(text, w / 2, h / 2);
    var tex = new THREE.CanvasTexture(cvs);
    if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
    var spr = new THREE.Sprite(mat);
    spr.scale.set(w / h * 0.30, 0.30, 1);
    return { sprite: spr, texture: tex };
  }

  /* ============ 天文推算 ============ */

  function lambdaOf(day) { return ((day - SPRING_DAY) / YEAR_DAYS) * 360; }
  function dayOfLambda(lam) { return (lam / 360) * YEAR_DAYS + SPRING_DAY; }
  /* 太阳赤纬 δ：与三球仪直射点纬度同公式（δ = asin(sinλ·sinε)） */
  function declination(day) { return Math.asin(Math.sin(lambdaOf(day) * DEG) * Math.sin(OBLIQUITY * DEG)) / DEG; }
  /* 日出日落时角；|tanφ·tanδ| ≥ 1 时为极昼/极夜，返回 null */
  function hourAngleRange(phi, delta) {
    var c = -Math.tan(phi * DEG) * Math.tan(delta * DEG);
    if (c >= 1) return null;                    /* 极夜（φδ 异号且足够大） */
    if (c <= -1) return null;                   /* 极昼：本装置只画有升落的弧 */
    return Math.acos(c) / DEG;
  }
  /* 太阳在地平坐标系中的位置（未乘弧半径）；H 单位为度 */
  function sunPos(phi, delta, hourDeg, out) {
    var d = delta * DEG, p = phi * DEG, H = hourDeg * DEG;
    out.set(
      -Math.cos(d) * Math.sin(H),
      Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H),
      Math.cos(d) * Math.cos(H) * Math.sin(p) - Math.sin(d) * Math.cos(p)
    );
    return out;
  }

  /* ============ 场景构建 ============ */

  function buildGround() {
    var geo = track(new THREE.CircleGeometry(GROUND_R, 72));
    var mat = track(new THREE.MeshBasicMaterial({ color: 0x2e4a34 }));
    groundMesh = new THREE.Mesh(geo, mat);
    groundMesh.rotation.x = -Math.PI / 2;
    root.add(groundMesh);

    /* 天地线（地平线圈） */
    var pts = [], n = 96;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * GROUND_R, 0, Math.sin(a) * GROUND_R));
    }
    var hgeo = track(new THREE.BufferGeometry().setFromPoints(pts));
    var hmat = track(new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.5 }));
    root.add(new THREE.LineLoop(hgeo, hmat));

    /* 方位标注：贴地平圈外侧 */
    for (var c = 0; c < CARDINALS.length; c++) {
      var lb = makeLabel(SOLAR.t('teach.dir.' + CARDINALS[c].id), 44);
      track(lb.texture);
      lb.sprite.position.set(CARDINALS[c].x * (GROUND_R + 1.2), 0.4, CARDINALS[c].z * (GROUND_R + 1.2));
      lb.sprite.scale.multiplyScalar(2.6);
      root.add(lb.sprite);
      cardinalLabels.push(lb.sprite);
    }
  }

  function buildPole() {
    var geo = track(new THREE.CylinderGeometry(0.045, 0.045, POLE_H, 10));
    var mat = track(new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    poleMesh = new THREE.Mesh(geo, mat);
    poleMesh.position.y = POLE_H / 2;
    root.add(poleMesh);

    /* 杆影：单位长薄板，锚点在杆底，apply 里按太阳方位旋转、按高度角拉长 */
    shadowGroup = new THREE.Group();
    var sgeo = track(new THREE.PlaneGeometry(1, 0.10));
    /* 几何沿 +X 伸出，原点端即杆底 */
    sgeo.translate(0.5, 0, 0);
    var smat = track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }));
    shadowMesh = new THREE.Mesh(sgeo, smat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.012;              /* 略高于地面避免深度冲突 */
    shadowGroup.add(shadowMesh);
    root.add(shadowGroup);
  }

  function buildArcs() {
    for (var i = 0; i < ARCS.length; i++) {
      var line = new THREE.Line(
        track(new THREE.BufferGeometry()),
        track(new THREE.LineBasicMaterial({ color: ARCS[i].color, transparent: true, opacity: 0.75 }))
      );
      line.frustumCulled = false;
      root.add(line);
      var lb = makeLabel(arcName(ARCS[i].id), 40);
      track(lb.texture);
      lb.sprite.scale.multiplyScalar(2.2);
      root.add(lb.sprite);
      arcLines.push({ line: line, label: lb.sprite, delta: ARCS[i].delta });
    }
  }

  /* 语言切换后重贴 3D 标签（方位 + 轨迹弧）。标签是 init 时烘焙的 canvas 贴图，
     不重建就跟不上语言；这里只换 map，并按新文字的宽高比重设缩放（沿用
     构建时各自的放大倍数：方位 2.6、轨迹弧 2.2）。不进逐帧路径。 */
  function relabel() {
    var i, sp, lb, old, img;
    for (i = 0; i < cardinalLabels.length; i++) {
      sp = cardinalLabels[i];
      if (!sp || !sp.material) continue;
      lb = makeLabel(SOLAR.t('teach.dir.' + CARDINALS[i].id), 44);
      track(lb.texture);
      old = sp.material.map;
      if (old && old.dispose) old.dispose();
      sp.material.map = lb.texture;
      sp.material.needsUpdate = true;
      img = lb.texture.image;
      if (img && img.width && img.height) sp.scale.set(img.width / img.height * 0.30 * 2.6, 0.30 * 2.6, 1);
    }
    for (i = 0; i < arcLines.length; i++) {
      sp = arcLines[i] && arcLines[i].label;
      if (!sp || !sp.material) continue;
      lb = makeLabel(arcName(ARCS[i].id), 40);
      track(lb.texture);
      old = sp.material.map;
      if (old && old.dispose) old.dispose();
      sp.material.map = lb.texture;
      sp.material.needsUpdate = true;
      img = lb.texture.image;
      if (img && img.width && img.height) sp.scale.set(img.width / img.height * 0.30 * 2.2, 0.30 * 2.2, 1);
    }
  }

  function buildSun() {
    var geo = track(new THREE.SphereGeometry(0.42, 24, 16));
    var mat = track(new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }));
    sunMesh = new THREE.Mesh(geo, mat);
    root.add(sunMesh);

    var glowMat = track(new THREE.SpriteMaterial({
      map: SOLAR.Gfx && SOLAR.Gfx.radialTexture ? SOLAR.Gfx.radialTexture('255,190,90', 2.2) : null,
      color: 0xffb347, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.85
    }));
    sunGlow = new THREE.Sprite(glowMat);
    sunGlow.scale.set(2.4, 2.4, 1);
    root.add(sunGlow);

    altLabel = makeLabel('高度 0°', 36).sprite;
    altLabel.scale.multiplyScalar(2.0);
    altLabel.visible = false;
    root.add(altLabel);
  }

  function build() {
    tmpSun = new THREE.Vector3();
    root = new THREE.Group();
    root.visible = false;
    scene.add(root);
    buildGround();
    buildPole();
    buildArcs();
    buildSun();
    /* buildArcs 只建空几何，采样点在 rebuildArcs 里填；
       重建（dispose 后 init）必须让下一次 apply 重画一次，否则弧是空的 */
    arcLat = null;
    built = true;
  }

  /* 纬度变化时重画三条轨迹弧（采样日出→日落；极昼极夜时弧线隐藏） */
  function rebuildArcs(phi) {
    var tmp = new THREE.Vector3();
    for (var i = 0; i < arcLines.length; i++) {
      var a = arcLines[i];
      var H0 = hourAngleRange(phi, a.delta);
      if (H0 === null) {
        a.line.visible = false;
        a.label.visible = false;
        continue;
      }
      a.line.visible = true;
      var pts = [], segs = 96;
      for (var s = 0; s <= segs; s++) {
        var H = -H0 + (s / segs) * 2 * H0;
        sunPos(phi, a.delta, H, tmp).multiplyScalar(GROUND_R);
        tmp.y = Math.max(tmp.y, 0.02);
        pts.push(tmp.clone());
      }
      a.line.geometry.dispose();
      a.line.geometry = track(new THREE.BufferGeometry().setFromPoints(pts));
      /* 名称标签放在正午（弧顶）位置 */
      sunPos(phi, a.delta, 0, tmp).multiplyScalar(GROUND_R);
      a.label.position.set(tmp.x, tmp.y + 0.9, tmp.z);
      a.label.visible = true;
    }
  }

  /* ============ 参数应用 ============ */

  function apply(params) {
    if (!built) return;
    params = params || {};
    var p = {}, k;
    for (k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) p[k] = cur[k]; }
    for (k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k]; }
    if (p.term && TERM_LAMBDA[p.term] !== undefined) p.dayOfYear = dayOfLambda(TERM_LAMBDA[p.term]);
    cur = p;

    var phi = (p.latDeg === undefined ? 23.5 : p.latDeg);
    if (arcLat !== phi) {
      rebuildArcs(phi);
      arcLat = phi;
    }

    var delta = declination(p.dayOfYear === undefined ? dayOfLambda(90) : p.dayOfYear);
    var H0 = hourAngleRange(phi, delta);
    var H = (p.hourAngle === undefined ? 0 : p.hourAngle);
    if (H0 !== null) {
      if (H < -H0) H = -H0;
      if (H > H0) H = H0;
    }

    var pos = sunPos(phi, delta, H, tmpSun).multiplyScalar(GROUND_R);
    var above = pos.y > 0.05 && H0 !== null;
    sunMesh.visible = above;
    sunGlow.visible = above;
    shadowGroup.visible = above;
    altLabel.visible = above;
    if (!above) return;

    sunMesh.position.copy(pos);
    sunGlow.position.copy(pos);

    /* 杆影：长度 = 杆高 / tan(高度角)，方向与太阳方位相反。
       影条几何沿 +X 伸出，rotation.y=θ 把 +X 映到 (cosθ,0,−sinθ)，
       要指向 (−x,−z) 需 θ = atan2(z, −x)。太阳越低影子越长（封顶到地面边缘）。 */
    var alt = Math.asin(pos.y / GROUND_R);
    var len = POLE_H / Math.tan(alt);
    if (len > GROUND_R * 0.98) len = GROUND_R * 0.98;
    shadowMesh.scale.x = len;
    shadowGroup.rotation.y = Math.atan2(pos.z, -pos.x);
    /* 太阳接近地平时影子变淡（晨昏蒙影），正午最浓 */
    shadowMesh.material.opacity = 0.20 + 0.28 * (pos.y / GROUND_R);

    /* 太阳高度角读数：贴在太阳上方，跨 1° 才换字 */
    var altDeg = Math.round(alt / DEG);
    var txt = SOLAR.t('teach.sunAlt') + ' ' + altDeg + '°';
    if (altLabel.userData.text !== txt) {
      altLabel.userData.text = txt;
      var fresh = makeLabel(txt, 36).sprite;
      fresh.scale.multiplyScalar(2.0);
      var old = altLabel;
      altLabel = fresh;
      root.add(altLabel);
      root.remove(old);
      if (old.material && old.material.map && typeof old.material.map.dispose === 'function') old.material.map.dispose();
      if (old.material && typeof old.material.dispose === 'function') old.material.dispose();
    }
    altLabel.position.set(pos.x, pos.y + 1.0, pos.z);
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

    apply: function (params) { apply(params); },

    update: function (dtSec) {
      if (!built || !root.visible) return;
      if (!cam && SOLAR.Controls && typeof SOLAR.Controls.getControls === 'function') {
        var c0 = SOLAR.Controls.getControls();
        cam = c0 ? c0.object : null;
      }
      if (!anim.revolve) return;
      /* 播放 = 时间流动：太阳沿当日轨迹从日出走向日落，循环演示 */
      var phi = (cur.latDeg === undefined ? 23.5 : cur.latDeg);
      var delta = declination(cur.dayOfYear === undefined ? dayOfLambda(90) : cur.dayOfYear);
      var H0 = hourAngleRange(phi, delta);
      if (H0 === null) return;
      var H = (cur.hourAngle === undefined ? 0 : cur.hourAngle) + dtSec * 18 * (anim.speed || 1);
      if (H > H0) H = -H0;                      /* 日落后回到日出重新演示 */
      cur.term = null;
      apply({ hourAngle: H });
    },

    /* 节气条「选轨迹」：只换当天赤纬（轨迹弧），保持当前时角继续播放，
       不暂停、不归零——太阳沿新选的弧接着走。 */
    relabel: relabel,
    goToTerm: function (name) {
      if (!built || TERM_LAMBDA[name] === undefined) return false;
      cur.term = name;
      apply({ dayOfYear: dayOfLambda(TERM_LAMBDA[name]) });
      return true;
    },

    resetMotion: function () {
      if (!built) return;
      var phi = (cur.latDeg === undefined ? 23.5 : cur.latDeg);
      var delta = declination(cur.dayOfYear === undefined ? dayOfLambda(90) : cur.dayOfYear);
      var H0 = hourAngleRange(phi, delta);
      apply({ hourAngle: H0 === null ? 0 : -H0 });
    },

    setAnim: function (a) {
      if (!a) return;
      if (typeof a.revolve === 'boolean') anim.revolve = a.revolve;
      if (typeof a.spin === 'boolean') anim.spin = a.spin;
      if (typeof a.speed === 'number') anim.speed = a.speed;
    },

    setVisible: function (on) {
      if (!built) return;
      root.visible = !!on;
    },

    getWorldPosition: function (bodyId) {
      if (!built) return null;
      var v = new THREE.Vector3();
      if (bodyId === 'sun' && sunMesh.visible) { v.copy(sunMesh.position); return v; }
      if (bodyId === 'pole' || bodyId === 'earth') { return v; }   /* 装置原点即观察点 */
      return null;
    },

    dispose: function () {
      if (!built) return;
      if (root && root.parent) root.parent.remove(root);
      for (var i = 0; i < disposeList.length; i++) {
        try { if (disposeList[i] && typeof disposeList[i].dispose === 'function') disposeList[i].dispose(); } catch (e) { /* 忽略 */ }
      }
        disposeList.length = 0;
        arcLines.length = 0;
        /* 方位标签也要清：漏这一句的话，二次 init 后数组里新旧各 4 个，
           relabel 会按索引给已离场景的旧精灵重贴贴图（泄漏且白干）。 */
        cardinalLabels.length = 0;
        built = false;
    }
  };
})();
