/**
 * 简易地月模型装置（教材图 4.3-8 风格）：地球静止居中并自转，月球沿圆轨道公转、
 * 同时绕自身极轴自转，且自转周期与公转周期相同——月面同一位置始终朝向地球，
 * 直观解释「为什么月球总以同一面朝着我们」。
 *
 * 为什么单独一个装置、不复用三球仪（TeachOrrery）：
 *   'orrery' 的日—地—月几何里带太阳与地球公转轨道，讲「月球运动」时画面与
 *   四季、节气两步完全相同，学生分不清这是新课。本装置只保留地月关系，
 *   没有太阳也没有地球公转轨道，一眼可辨。
 *
 * 场景内容（刻意从简——按课堂反馈，标记 / 文字 / 转轴会在地月之间形成视觉噪音，
 * 全部去掉；保留的只有两天体、轨道环与地球经纬网）：
 *   1. 中心地球：真实贴图 + 昼/夜半球（太阳光方向世界固定，明暗在 bodyMat 的
 *      uSunDir 里算，不占用场景灯光），绕极轴自转、位置固定在原地不公转；
 *   2. 月球：同一套昼/夜着色，沿圆轨道公转，自转角 = -公转相位（潮汐锁定）；
 *   3. 轨道圆环（params.orbit 控制显隐）；
 *   4. 地球经纬网：与地球仪（teach-globe-body.buildGrid）同款的 30° 细线网格，
 *      挂在自转组上随地球一同旋转，params.grid 控制显隐。
 *
 * 物理约定：
 *   - 自转角与公转相位同角速度（MOON_RATE），故自转周期 = 公转周期；
 *   - 公转 / 自转方向与三球仪、地球仪同一套约定（自西向东）；
 *   - 太阳光方向世界固定，故月球明暗面随轨道位置变化，而同一面始终朝地。
 *
 * 依赖：THREE、SOLAR.TEXTURES（可选，缺失时回退纯色）。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachMoonSync = (function () {
  'use strict';

  var DEG = Math.PI / 180;

  /* 示意比例：两种档位只改显示尺寸与距离，不改变任何物理关系 */
  var PROFILE = {
    real: { earth: 1.0, moon: 0.273, orbit: 60.3 },
    iconic: { earth: 2.0, moon: 0.55, orbit: 9.0 }
  };

  /* 月球自转与公转同角速度——潮汐锁定就体现在这一个等式上；
     地球自转单独取一个更快的值，否则月球还没走完一圈看不出地球在转。 */
  var MOON_RATE = 0.35;
  var EARTH_RATE = 0.55;

  var built = false;
  var scene = null;
  var root = null;
  var orbitGroup = null, orbitLine = null;
  var earthSpin = null, earthMesh = null;
  var gridGroup = null;                 /* 地球经纬网（与地球仪同款细线） */
  var moonGroup = null, moonBall = null;
  var earthMat = null, moonMat = null;
  var disposeList = [];

  var anim = { spin: false, revolve: false, speed: 1 };
  var cur = {};
  var curScale = 'iconic';
  var phase = 0;      /* 月球公转相位（弧度） */
  var spinDeg = 0;    /* 地球自转角（弧度） */

  function track(o) { disposeList.push(o); return o; }

  /* ============ 复用资产 ============ */

  /* 与 TeachOrrery 同款的"只被太阳照亮一半"着色：真实贴图 + uSunDir 明暗。
     不用场景灯光（DirLight 会照亮同一场景里的所有物体，故弃用）。 */
  var BODY_VERT = [
    'varying vec3 vN; varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  vN = normalize(mat3(modelMatrix) * normal);',
    '  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

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

  function bodyMat(color, night) {
    return track(new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uSunDir: { value: new THREE.Vector3(-1, 0, 0) },   /* 太阳固定在 -X 侧 */
        uNight: { value: night }
      },
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG
    }));
  }

  /* 复用项目内嵌的真实贴图（SOLAR.TEXTURES，由 textures-loader.js 分块注入）；缺失时回退纯色 */
  function loadRealTexture(key, fileName, mat) {
    var url = (SOLAR.TEXTURES && SOLAR.TEXTURES[key]) || null;
    if (!url && typeof location !== 'undefined' && location.protocol !== 'file:') {
      url = 'assets/textures/' + fileName;
    }
    if (!url) return;
    try {
      new THREE.TextureLoader().load(url, function (t) {
        /* LinearEncoding：贴图进自定义 shader（mat.uniforms.uMap），r150 起
           sRGB 解码挪到上传阶段，标 sRGB 会让地球/月球表面暗一半。 */
        if (THREE.LinearEncoding) t.encoding = THREE.LinearEncoding;
        if (mat.uniforms && mat.uniforms.uMap) {
          mat.uniforms.uMap.value = t;
          mat.uniforms.uHasMap.value = 1;
        } else if (mat) {
          mat.map = t;
          mat.needsUpdate = true;
        }
      }, undefined, function () { /* 回退纯色 */ });
    } catch (e) { /* 回退纯色 */ }
  }

  /* 经纬网：与地球仪（teach-globe-body.buildGrid）同款的单位半径细线网格，
     挂在 earthSpin 下随自转一同旋转（earthSpin 整体按 p.earth 缩放，故无需再缩放）。
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

  /* ============ 构建 ============ */

  function buildEarth() {
    /* 自转挂在 spin 上：球体转，父级 earthGroup 只负责演示比例缩放 */
    earthSpin = new THREE.Group();
    root.add(earthSpin);

    earthMat = bodyMat(0x4a90d9, 0.85);          /* 与三球仪地球同款材质 */
    earthMesh = new THREE.Mesh(track(new THREE.SphereGeometry(1, 48, 32)), earthMat);
    earthSpin.add(earthMesh);

    loadRealTexture('earth', 'earth.jpg', earthMat);

    buildGrid();
  }

  function buildMoon() {
    moonGroup = new THREE.Group();
    root.add(moonGroup);

    moonMat = bodyMat(0xc9c4bb, 0.92);
    moonBall = new THREE.Mesh(track(new THREE.SphereGeometry(1, 32, 24)), moonMat);
    moonGroup.add(moonBall);

    loadRealTexture('moon', 'moon.jpg', moonMat);
  }

  function buildOrbit() {
    orbitGroup = new THREE.Group();
    root.add(orbitGroup);

    /* 单位圆 LineLoop：缩放即可得到实际轨道半径（线宽不随缩放变化） */
    var pts = [], n = 192;
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    var geo = track(new THREE.BufferGeometry().setFromPoints(pts));
    var mat = track(new THREE.LineBasicMaterial({
      color: 0x7fa8d8, transparent: true, opacity: 0.5
    }));
    orbitLine = new THREE.LineLoop(geo, mat);
    orbitGroup.add(orbitLine);
  }

  function build() {
    root = new THREE.Group();
    scene.add(root);
    buildOrbit();
    buildEarth();
    buildMoon();
    built = true;
  }

  /* ============ 摆放 ============ */

  function placeMoon(p) {
    /* 月球位置与自转角同相位：绕一圈正好自转一圈（潮汐锁定）。
       自转角取 -phase：rotation.y = φ 把局部角 α 映到世界角 α-φ，
       旋转后的月面任一点始终与「月心指向地心」保持同一相对方位。 */
    moonGroup.position.set(Math.cos(phase), 0, Math.sin(phase)).multiplyScalar(p.orbit);
    moonBall.rotation.y = -phase;
  }

  function placeByProfile(p) {
    earthSpin.scale.setScalar(p.earth);
    orbitGroup.scale.setScalar(p.orbit);
    moonGroup.scale.setScalar(p.moon);
    placeMoon(p);
  }

  /* ============ 参数应用 ============ */

  function apply(params, scale) {
    if (!built) return;
    params = params || {};
    /* 合并成私有副本：不直接别名课程数据对象（cur = params），
       否则后续任何写入都会污染 data.js 的 step.params。 */
    var p = {}, k;
    for (k in cur) { if (Object.prototype.hasOwnProperty.call(cur, k)) p[k] = cur[k]; }
    for (k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k]; }
    cur = p;

    curScale = (scale === 'iconic') ? 'iconic' : 'real';
    placeByProfile(PROFILE[curScale]);

    orbitLine.visible = p.orbit !== false;
    /* 经纬网：默认画上，步骤可用 params.grid:false 关掉 */
    gridGroup.visible = p.grid !== false;
    /* 太阳固定在 -X 侧：明暗由 bodyMat 的 uSunDir 计算，无场景灯光 */
    if (earthMat && earthMat.uniforms && earthMat.uniforms.uSunDir) earthMat.uniforms.uSunDir.value.set(-1, 0, 0);
    if (moonMat && moonMat.uniforms && moonMat.uniforms.uSunDir) moonMat.uniforms.uSunDir.value.set(-1, 0, 0);
  }

  /* ============ 每帧 ============ */

  function update(dtSec) {
    if (!built) return;
    var sp = anim.speed || 1;
    if (anim.spin) {
      spinDeg += dtSec * EARTH_RATE * sp;
      if (spinDeg > Math.PI * 2) spinDeg -= Math.PI * 2;
    }
    if (anim.revolve) {
      phase += dtSec * MOON_RATE * sp;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
    earthSpin.rotation.y = spinDeg;
    placeMoon(PROFILE[curScale]);
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

    apply: function (params, scale) { apply(params, scale); },

    setAnim: function (a) {
      anim.spin = !!(a && a.spin);
      anim.revolve = !!(a && a.revolve);
      anim.speed = (a && a.speed) || 1;
      apply(cur, curScale);
    },

    setVisible: function (on) {
      if (!built) return;
      root.visible = !!on;
    },

    update: function (dtSec) { update(dtSec); },

    /* 取景用坐标。每次返回新向量：teach.js 会连续取多个天体（如先 target 后
       focus），共享临时向量会让先取到的值被后一次覆盖。 */
    getWorldPosition: function (bodyId) {
      if (!built) return null;
      if (bodyId === 'earth' || bodyId === 'globe') {
        return new THREE.Vector3().copy(root.position);
      }
      if (bodyId === 'moon') {
        return new THREE.Vector3().copy(moonGroup.position);
      }
      return null;
    },

    getScale: function () { return curScale; },

    resetMotion: function () {
      phase = 0;
      spinDeg = 0;
      if (built) {
        earthSpin.rotation.y = 0;
        placeMoon(PROFILE[curScale]);
      }
    },

    dispose: function () {
      if (!built) return;
      if (root && root.parent) root.parent.remove(root);
      for (var i = 0; i < disposeList.length; i++) {
        try { if (disposeList[i] && typeof disposeList[i].dispose === 'function') disposeList[i].dispose(); } catch (e) { /* 忽略 */ }
      }
      disposeList.length = 0;
      /* 置空节点引用：二次 init 时不能让旧网格被重新挂回场景 */
      root = scene = null;
      orbitGroup = orbitLine = null;
      earthSpin = earthMesh = gridGroup = null;
      moonGroup = moonBall = null;
      earthMat = moonMat = null;
      built = false;
    }
  };
})();
