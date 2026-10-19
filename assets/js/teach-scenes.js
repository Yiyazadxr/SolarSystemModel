/**
 * 教学装置调度层：把 teach-data.js 的 step.state 分发给具体装置。
 * 装置：SOLAR.TeachGlobe（地球仪）、SOLAR.TeachOrrery（三球仪，'moon' 复用之）、
 * SOLAR.TeachGround（平地观日，太阳高度与杆影）、
 * SOLAR.TeachMoonSync（简易地月模型，地球自转 + 月球同步自转公转）。
 * rig：'globe' | 'orrery' | 'moon' | 'ground' | 'moonsync' | null（全部隐藏）。
 * scale：'real' | 'iconic'，只改显示尺寸与距离，不改变任何物理规律
 * （方向、周期、相位成因、直射点纬度算法均一致）；ground 装置为固定示意尺度，忽略 scale。
 * 依赖：THREE、SOLAR.TeachGlobe、SOLAR.TeachOrrery、SOLAR.TeachGround、SOLAR.TeachMoonSync。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TeachScenes = (function () {
  'use strict';

  var ready = false;
  /* 默认示意比例档：与教学步骤 state.scale 的多数取值 'iconic' 同值，
     否则进入教学时按钮显示档位与画面实际档位不一致。 */
  var scale = 'iconic';
  var curRig = null;

  function init(scn) {
    var a = (SOLAR.TeachGlobe && typeof SOLAR.TeachGlobe.init === 'function') ? SOLAR.TeachGlobe.init(scn) : false;
    var b = (SOLAR.TeachOrrery && typeof SOLAR.TeachOrrery.init === 'function') ? SOLAR.TeachOrrery.init(scn) : false;
    var g = (SOLAR.TeachGround && typeof SOLAR.TeachGround.init === 'function') ? SOLAR.TeachGround.init(scn) : false;
    var m = (SOLAR.TeachMoonSync && typeof SOLAR.TeachMoonSync.init === 'function') ? SOLAR.TeachMoonSync.init(scn) : false;
    ready = !!(a || b || g || m);     // 缺一个装置也要能用，避免整套教学模式打不开
    if (ready) hide();
    return ready;
  }

  function setScale(mode) {
    scale = (mode === 'iconic') ? 'iconic' : 'real';
    return scale;
  }

  function applyState(state) {
    if (!ready) return;
    state = state || {};
    var rig = state.rig || null;
    setScale(state.scale || scale);

    var params = state.params || {};
    var anim = state.anim || { spin: false, revolve: false, speed: 1 };

    if (SOLAR.TeachGlobe) {
      SOLAR.TeachGlobe.setVisible(rig === 'globe');
      SOLAR.TeachGlobe.setAnim(anim);
      SOLAR.TeachGlobe.apply(params, scale);
    }
    if (SOLAR.TeachOrrery) {
      SOLAR.TeachOrrery.setVisible(rig === 'orrery' || rig === 'moon');
      SOLAR.TeachOrrery.setAnim(anim);
      SOLAR.TeachOrrery.apply(params, scale);
    }
    if (SOLAR.TeachGround) {
      SOLAR.TeachGround.setVisible(rig === 'ground');
      SOLAR.TeachGround.setAnim(anim);
      SOLAR.TeachGround.apply(params);
    }
    if (SOLAR.TeachMoonSync) {
      SOLAR.TeachMoonSync.setVisible(rig === 'moonsync');
      SOLAR.TeachMoonSync.setAnim(anim);
      SOLAR.TeachMoonSync.apply(params, scale);
    }
    curRig = rig;
  }

  function update(dtSec) {
    if (!ready) return;
    if (SOLAR.TeachGlobe) SOLAR.TeachGlobe.update(dtSec);
    if (SOLAR.TeachOrrery) SOLAR.TeachOrrery.update(dtSec);
    if (SOLAR.TeachGround) SOLAR.TeachGround.update(dtSec);
    if (SOLAR.TeachMoonSync) SOLAR.TeachMoonSync.update(dtSec);
  }

  function hide() {
    if (SOLAR.TeachGlobe) SOLAR.TeachGlobe.setVisible(false);
    if (SOLAR.TeachOrrery) SOLAR.TeachOrrery.setVisible(false);
    if (SOLAR.TeachGround) SOLAR.TeachGround.setVisible(false);
    if (SOLAR.TeachMoonSync) SOLAR.TeachMoonSync.setVisible(false);
    curRig = null;
  }

  function resetMotion() {
    if (curRig === 'globe' && SOLAR.TeachGlobe && SOLAR.TeachGlobe.resetMotion) SOLAR.TeachGlobe.resetMotion();
    if ((curRig === 'moon' || curRig === 'orrery') && SOLAR.TeachOrrery && SOLAR.TeachOrrery.resetMotion) SOLAR.TeachOrrery.resetMotion();
    if (curRig === 'ground' && SOLAR.TeachGround && SOLAR.TeachGround.resetMotion) SOLAR.TeachGround.resetMotion();
    if (curRig === 'moonsync' && SOLAR.TeachMoonSync && SOLAR.TeachMoonSync.resetMotion) SOLAR.TeachMoonSync.resetMotion();
  }

  /* 取景用：返回当前装置里某个天体的世界坐标 */
  function getRigWorldPosition(bodyId) {
    if (!ready) return null;
    if (curRig === 'globe' && SOLAR.TeachGlobe) return SOLAR.TeachGlobe.getWorldPosition(bodyId);
    if ((curRig === 'orrery' || curRig === 'moon') && SOLAR.TeachOrrery) return SOLAR.TeachOrrery.getWorldPosition(bodyId);
    if (curRig === 'moonsync' && SOLAR.TeachMoonSync) return SOLAR.TeachMoonSync.getWorldPosition(bodyId);
    if (curRig === 'ground' && SOLAR.TeachGround) return SOLAR.TeachGround.getWorldPosition(bodyId);
    return null;
  }

  /* 界面显示用：当前直射点纬度（度） */
  function getSubSolarLatitude() {
    if (curRig === 'globe' && SOLAR.TeachGlobe) return SOLAR.TeachGlobe.getSubSolarLatitude();
    if (SOLAR.TeachOrrery) return SOLAR.TeachOrrery.getSubSolarLatitude();
    return 0;
  }

  return {
    init: init,
    applyState: applyState,
    update: update,
    setScale: setScale,
    getScale: function () { return scale; },
    hide: hide,
    resetMotion: resetMotion,
    isReady: function () { return ready; },
    getRig: function () { return curRig; },
    getRigWorldPosition: getRigWorldPosition,
    getSubSolarLatitude: getSubSolarLatitude,
    /* 刻意常驻复用：退出教学只 hide()（见 teach.js exitMode），不调用本 dispose。
       四套装置的场景图 / 几何 / 材质 / canvas 标签在页面生命周期内只建一次，
       重进教学零重建成本；资源有界、不随进出增长。track/disposeAll 注册表
       是显式销毁入口（整页 teardown 等场合再用），当前策略下刻意不走——
       改策略时须同时改 exitMode 注释。 */
    dispose: function () {
      if (SOLAR.TeachGlobe) SOLAR.TeachGlobe.dispose();
      if (SOLAR.TeachOrrery) SOLAR.TeachOrrery.dispose();
      if (SOLAR.TeachGround) SOLAR.TeachGround.dispose();
      if (SOLAR.TeachMoonSync) SOLAR.TeachMoonSync.dispose();
      ready = false;
      curRig = null;
    }
  };
})();
