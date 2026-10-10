/**
 * 教学装置：地球仪（globe）—— SOLAR.TeachGlobe 门面
 * 用途：第 3 章第 1 节《认识地球》的课堂演示——地球形状、大小与地球仪。
 *       一个大地球 + 经纬网 + 地轴 + 重要经纬线高亮 + 晨昏线 + 太阳直射点 + 城市标记 + 极昼极夜。
 *
 * 本文件是拆分后的门面：装配 shared / shaders / body / scenes / apply 五个子模块并转发调用，
 * 横切的逐帧 update 留在此处。对外 API（SOLAR.TeachGlobe.*）与拆分前完全一致。
 *
 * 坐标约定（务必看懂再改）：
 *   - 场景里 Y 轴向上，**黄道面 = XZ 平面（水平）**，太阳全年在这个平面内绕行；
 *   - 地轴（指向北极）相对黄道面倾斜 tiltDeg（教材口径 66.5°），由 tiltGroup 的 X 轴旋转实现；
 *   - 太阳方向 sunDir = (cos λ, 0, sin λ)，λ 为太阳黄经（春分=0，夏至=90°，秋分=180°，冬至=270°）；
 *   - 由此推出太阳赤纬（= 直射点纬度）δ = asin(sin ε · sin λ)，其中黄赤交角 ε = 90° − tiltDeg；
 *     本装置实际用 dot(sunDir, 地轴) 求 δ，两者等价，且天然支持 tiltDeg=90 的"假设地轴不倾斜"反事实演示。
 *
 * 依赖：THREE、SOLAR.CONFIG、SOLAR.TeachGlobeShared / GlobeShaders / GlobeBody / GlobeScenes /
 *       GlobeApply、SOLAR.Scene（取景用相机）、SOLAR.Controls（取景用 target）。零外部资源，file:// 可用。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachGlobe = (function () {
  'use strict';

  var G = SOLAR.TeachGlobeShared.S;

  /* 自转角步进用的弧度换算常量随共享注册表走：只读，不在函数体里改。 */
  var DEG = G.DEG;

  function buildExtras() {
    G.nodes.extraGroup = new THREE.Group();
    G.nodes.root.add(G.nodes.extraGroup);
    SOLAR.GlobeScenes.buildVoyage();
    SOLAR.GlobeScenes.buildHorizon();
    SOLAR.GlobeScenes.buildEclipse();
    SOLAR.GlobeScenes.buildSatellites();
    SOLAR.GlobeScenes.buildSizeRings();
    SOLAR.GlobeScenes.buildDegreeLabels();
  }

  function build() {
    G.tmp.UP_Y = new THREE.Vector3(0, 1, 0);
    G.tmp.tiltInverse = new THREE.Quaternion();
    G.tmp.tmpEuler = new THREE.Euler();

    G.nodes.root = new THREE.Group();
    G.nodes.root.visible = false;

    G.nodes.tiltGroup = new THREE.Group();
    G.nodes.root.add(G.nodes.tiltGroup);

    G.nodes.spinGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.spinGroup);

    G.nodes.gridGroup = new THREE.Group();
    G.nodes.spinGroup.add(G.nodes.gridGroup);

    G.nodes.cityGroup = new THREE.Group();
    G.nodes.spinGroup.add(G.nodes.cityGroup);

    G.nodes.hlGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.hlGroup);

    G.nodes.polarGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.polarGroup);

    G.nodes.axisGroup = new THREE.Group();
    G.nodes.tiltGroup.add(G.nodes.axisGroup);

    /* 顺序是承重的：buildCities 必须在 buildEratosthenes 之前——
       后者要读前者写入的城市节点位置来摆地心延长线与 7.2° 夹角。 */
    SOLAR.GlobeBody.buildEarth();
    SOLAR.GlobeBody.buildGrid(15);
    SOLAR.GlobeBody.buildHighlights();
    SOLAR.GlobeBody.buildAxis();
    SOLAR.GlobeBody.buildSunPoint();
    SOLAR.GlobeBody.buildPolarCaps();
    SOLAR.GlobeBody.buildCities();
    SOLAR.GlobeBody.buildEratosthenes();
    buildExtras();

    G.nodes.scene.add(G.nodes.root);

    /* 帆船用 Lambert 材质，必须有灯才有明暗；无光照时六面同色会糊成贴纸。
       方向光跟随太阳（与地表昼夜一致），环境光保证背光面不死黑。
       两者只影响 Lambert 材质，球体等 MeshBasic/Shader 对象不受影响。 */
    G.nodes.shipLight = new THREE.DirectionalLight(0xffffff, 0.85);
    G.nodes.shipLight.position.set(1, 0.35, 0.6);
    G.nodes.scene.add(G.nodes.shipLight);
    G.nodes.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    G.built = true;
  }

  /* ============ 对外 ============ */

  return {
    init: function (scn) {
      if (G.built) return true;
      if (!scn || !window.THREE) return false;
      G.nodes.scene = scn;
      build();
      return true;
    },

    apply: function (params, scale) { SOLAR.GlobeApply.apply(params, scale); },

    resetMotion: function () {
      G.voyageProgress = 0;
      G.horizonShipPhase = 0;
      G.eclipseTime = 0;
      G.cur.spinDeg = 0;
      if (G.nodes.spinGroup) G.nodes.spinGroup.rotation.y = 0;
      SOLAR.TeachGlobe.update(0);
    },

    update: function (dtSec) {
      if (!G.built || !G.nodes.root.visible) return;
      SOLAR.GlobeScenes.updateSatellites(dtSec);
      if (G.nodes.voyageGroup && G.nodes.voyageGroup.visible && G.nodes.voyageGroup.userData.route && G.nodes.voyageGroup.userData.dot) {
        /* 麦哲伦环球航线小船：按累计弧长匀速推进（消除采样弦长不均的顿挫） */
        if (G.anim.playing) G.voyageProgress = (G.voyageProgress + dtSec * 0.035 * G.anim.speed) % 1;
        var route = G.nodes.voyageGroup.userData.route;
        var cum = G.nodes.voyageGroup.userData.cum;
        var vship = G.nodes.voyageGroup.userData.dot;
        var voyDist = G.voyageProgress * cum[cum.length - 1];
        var voyLo = 0, voyHi = cum.length - 1, voyMid;
        while (voyHi - voyLo > 1) {
          voyMid = (voyLo + voyHi) >> 1;
          if (cum[voyMid] <= voyDist) voyLo = voyMid; else voyHi = voyMid;
        }
        var voySeg = (cum[voyHi] - cum[voyLo]) || 1e-6;
        var voyFrac = (voyDist - cum[voyLo]) / voySeg;
        /* 让地球配合小船：把 spinGroup 绕 Y 转到小船始终位于面向相机的一侧。
           世界方位关系：局部方位 angS 经 rotation.y=θ 后的世界方位为 angS-θ，
           令其等于相机世界方位 angCam → θ目标 = angS - angCam。
           用帧率无关的指数平滑逼近（而非逐帧硬对齐），把 CatmullRom 采样
           弦长不均带来的角速度波动滤成连续转动，消除顿挫；
           本步骤 spin=false，不会与自转打架。 */
        var vcam = (SOLAR.Scene && SOLAR.Scene.getCamera) ? SOLAR.Scene.getCamera() : null;
        var kSmooth = 1 - Math.pow(0.002, dtSec);          /* ≈10%/帧 @60fps */
        if (vcam && !(G.anim && G.anim.spin)) {
          var cw = vcam.getWorldPosition(new THREE.Vector3());
          var angCam = Math.atan2(cw.z, cw.x);
          var dirShip = route[voyLo].clone().normalize();
          var angS = Math.atan2(dirShip.z, dirShip.x);
          var dTh = (angS - angCam) - G.nodes.spinGroup.rotation.y;
          while (dTh > Math.PI) dTh -= 2 * Math.PI;
          while (dTh < -Math.PI) dTh += 2 * Math.PI;
          G.nodes.spinGroup.rotation.y += dTh * kSmooth;
          G.nodes.spinGroup.updateWorldMatrix(true, false);        /* 下一句 localToWorld 需要本帧矩阵 */
        }
        var voyNext = Math.min(route.length - 1, voyLo + 1);
        vship.position.copy(route[voyLo]).lerp(route[voyNext], voyFrac);
        /* 船底必须落到球面上：航线本身画在 1.045R，若船底放在航线点上，
           船会悬浮在地表上方约 0.045R（≈290km），侧看就是一张浮空纸片。
           投影到 1.005R（球面略上方防 z-fighting），船才真正「贴着地球行驶」。 */
        vship.position.setLength(G.EARTH_R * 1.005);
        /* 船头朝行进方向、船底贴球面法线。这里用 makeBasis 直接构造局部旋转
           （不能用 lookAt：它按世界坐标解释参数，而航线点是 spinGroup 局部坐标）。 */
        if (!G.tmp.voyFwd) { G.tmp.voyFwd = new THREE.Vector3(); G.tmp.voyUp = new THREE.Vector3(); G.tmp.voyRight = new THREE.Vector3(); G.tmp.voyZ = new THREE.Vector3(); G.tmp.voyMat = new THREE.Matrix4(); }
        G.tmp.voyFwd.copy(route[voyNext]).sub(route[voyLo]).normalize();
        G.tmp.voyUp.copy(route[voyLo]).normalize();          // 球面法线 = 船的「上」
        /* right = forward × up（不是 up × forward！后者会凑成左手系，
           行列式 -1 使船被镜像渲染，某些角度看着就成了纸片） */
        G.tmp.voyRight.crossVectors(G.tmp.voyFwd, G.tmp.voyUp).normalize();
        G.tmp.voyZ.copy(G.tmp.voyFwd).negate();                 // 模型船头在 -Z，故局部 +Z = -前进方向
        G.tmp.voyMat.makeBasis(G.tmp.voyRight, G.tmp.voyUp, G.tmp.voyZ);
        vship.quaternion.setFromRotationMatrix(G.tmp.voyMat);
        /* 垂直居中：相机绕地心升/降到小船所在纬度——只改仰角，水平方位
           保留用户拖拽的结果；target 始终锁在地心。
           此前把 target 与相机一起平移到小船处（pan），target 一旦离开地心，
           相机就绕着偏离地心的点转，画面里地球又平移又翻滚（所见"地球
           上下旋转"）；现在地球只保留绕地轴的 yaw（上面的方位对齐），
           地轴稳定，小船仍落在画面中部。 */
        var vct = (SOLAR.Controls && SOLAR.Controls.getTarget) ? SOLAR.Controls.getTarget() : null;
        if (vcam && vct) {
          if (!G.tmp.voyPan) {
            G.tmp.voyPan = {
              goal: new THREE.Vector3(), earth: new THREE.Vector3(),
              want: new THREE.Vector3(), off: new THREE.Vector3()
            };
          }
          G.nodes.spinGroup.updateWorldMatrix(true, false);
          G.tmp.voyPan.goal.copy(vship.position);
          G.nodes.spinGroup.localToWorld(G.tmp.voyPan.goal);
          G.nodes.root.getWorldPosition(G.tmp.voyPan.earth);
          G.tmp.voyPan.goal.sub(G.tmp.voyPan.earth);
          if (G.tmp.voyPan.goal.lengthSq() > 1e-8) {
            var latRad = Math.asin(Math.max(-1, Math.min(1, G.tmp.voyPan.goal.normalize().y)));
            G.tmp.voyPan.off.copy(vcam.position).sub(G.tmp.voyPan.earth);
            var horiz = Math.sqrt(G.tmp.voyPan.off.x * G.tmp.voyPan.off.x + G.tmp.voyPan.off.z * G.tmp.voyPan.off.z);
            if (horiz > 1e-6) {
              var distC = vcam.position.distanceTo(G.tmp.voyPan.earth) || 1;
              var cu = G.tmp.voyPan.off.x / horiz, su2 = G.tmp.voyPan.off.z / horiz;
              var cy2 = Math.cos(latRad), sy2 = Math.sin(latRad);
              G.tmp.voyPan.want.set(
                G.tmp.voyPan.earth.x + distC * cy2 * cu,
                G.tmp.voyPan.earth.y + distC * sy2,
                G.tmp.voyPan.earth.z + distC * cy2 * su2
              );
              var kPan = 1 - Math.pow(0.02, dtSec);    /* ≈6%/帧 @60fps，约 0.7s 收敛 */
              vcam.position.lerp(G.tmp.voyPan.want, Math.min(1, kPan));
            }
            vct.copy(G.tmp.voyPan.earth);                    /* target 锁回地心 */
          }
        }
      }
      if (G.nodes.horizonGroup && G.nodes.horizonGroup.visible && G.nodes.horizonGroup.userData.ship) {
        /* 船沿球面大圆向画面深处（-z）驶去：船身先被球面遮住，桅杆最后消失。
           相位一直推进到 HORIZON_SHIP_MAX_TH 才复位，确保船身与桅杆都已完全
           没入地平线，复位发生在不可见状态，不会在近处突然弹出。 */
        var ship = G.nodes.horizonGroup.userData.ship;
        if (G.anim.playing) G.horizonShipPhase = (G.horizonShipPhase + dtSec * SOLAR.GlobeScenes.HORIZON_SHIP_SPEED * G.anim.speed) % 1;
        var th = G.horizonShipPhase * SOLAR.GlobeScenes.HORIZON_SHIP_MAX_TH;
        var Rs = SOLAR.GlobeScenes.HORIZON_SEA_R;
        ship.position.set(0, -Rs + Rs * Math.cos(th), -Rs * Math.sin(th));
        ship.rotation.x = -th;
      }
      if (G.nodes.eclipseGroup && G.nodes.eclipseGroup.visible && G.nodes.eclipseGroup.userData.moon) {
        if (G.anim.playing && G.anim.revolve) G.eclipseTime += dtSec * G.anim.speed;
        var phase = (G.eclipseTime % 14) / 14;
        var sweep = Math.max(0, Math.min(1, (phase - 0.08) / 0.84));
        /* 本影从月盘外进入、覆盖全月，再退出；循环边界两端均为完整满月。 */
        G.nodes.eclipseGroup.userData.shadowMaterial.uniforms.uCenter.value = (1.5 - sweep * 3.0) * G.EARTH_R;
        /* 每帧重算地影轴与扫动方向（世界空间）：轴 = 地心→月球，切向 =
            世界 UP × 轴。保持世界几何锚定，阴影才会随月球（及任何相机
            变化）留在月面朝地的同一处——"阴影在正面"由 moveCamera 把相机
            放到朝地一侧来实现，不能改锚定（改锚定会让阴影脱离月球）。 */
        if (!G.tmp.eclipseTmpA) { G.tmp.eclipseTmpA = new THREE.Vector3(); G.tmp.eclipseTmpT = new THREE.Vector3(); G.tmp.eclipseTmpE = new THREE.Vector3(); }
        G.nodes.eclipseGroup.userData.moon.getWorldPosition(G.tmp.eclipseTmpA);
        G.nodes.root.getWorldPosition(G.tmp.eclipseTmpE);
        G.tmp.eclipseTmpA.sub(G.tmp.eclipseTmpE).normalize();          // 地心 → 月球
        G.nodes.eclipseShadowMaterial.uniforms.uAxis.value.copy(G.tmp.eclipseTmpA);
        G.tmp.eclipseTmpT.crossVectors(G.tmp.UP_Y, G.tmp.eclipseTmpA);
        if (G.tmp.eclipseTmpT.lengthSq() < 1e-6) G.tmp.eclipseTmpT.set(1, 0, 0); else G.tmp.eclipseTmpT.normalize();
        G.nodes.eclipseShadowMaterial.uniforms.uTangent.value.copy(G.tmp.eclipseTmpT);
      }
      if (G.anim.spin) {
        var deg = (G.cur.spinDeg || 0) + dtSec * 5 * (G.anim.speed || 1);
        G.cur.spinDeg = deg % 360;
        G.nodes.spinGroup.rotation.y = G.cur.spinDeg * DEG;
      }
    },

    setVisible: function (on) {
      if (!G.built) return;
      G.nodes.root.visible = !!on;
    },

    setAnim: function (a) {
      if (!a) return;
      if (typeof a.spin === 'boolean') G.anim.spin = a.spin;
      if (typeof a.revolve === 'boolean') G.anim.revolve = a.revolve;
      if (typeof a.playing === 'boolean') G.anim.playing = a.playing;
      if (typeof a.speed === 'number') G.anim.speed = a.speed;
    },

    getRoot: function () { return G.nodes.root; },

    getWorldPosition: function (bodyId) {
      if (!G.built) return null;
      if (bodyId === 'moon' && G.nodes.eclipseGroup) {
        return G.nodes.eclipseGroup.userData.moon.getWorldPosition(new THREE.Vector3());
      }
      if (bodyId !== 'earth') return null;
      var v = new THREE.Vector3();
      G.nodes.earthMesh.getWorldPosition(v);
      return v;
    },

    /* 供主控做标注/取景用：当前太阳黄经对应的直射点纬度（度） */
    getSubSolarLatitude: function () {
      if (!G.built) return 0;
      return SOLAR.GlobeApply.sunState(G.cur).delta / DEG;
    },

    dispose: function () {
      if (!G.built) return;
      SOLAR.TeachGlobeShared.disposeAll();
    }
  };
})();
