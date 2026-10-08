/**
 * 教学装置调度层：把 teach-data.js 的 step.state 分发给具体装置。
 * 装置：SOLAR.TeachGlobe（地球仪）、SOLAR.TeachOrrery（三球仪，'moon' 复用之）。
 * rig：'globe' | 'orrery' | 'moon' | null（全部隐藏）。
 * scale：'real' | 'iconic'，只改显示尺寸与距离，不改变任何物理规律
 * （方向、周期、相位成因、直射点纬度算法均一致）。
 * 依赖：THREE、SOLAR.TeachGlobe、SOLAR.TeachOrrery。
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
    ready = !!(a || b);     // 缺一个装置也要能用，避免整套教学模式打不开
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
    curRig = rig;
  }

  function update(dtSec) {
    if (!ready) return;
    if (SOLAR.TeachGlobe) SOLAR.TeachGlobe.update(dtSec);
    if (SOLAR.TeachOrrery) SOLAR.TeachOrrery.update(dtSec);
  }

  function hide() {
    if (SOLAR.TeachGlobe) SOLAR.TeachGlobe.setVisible(false);
    if (SOLAR.TeachOrrery) SOLAR.TeachOrrery.setVisible(false);
    curRig = null;
  }

  function resetMotion() {
    if (curRig === 'globe' && SOLAR.TeachGlobe && SOLAR.TeachGlobe.resetMotion) SOLAR.TeachGlobe.resetMotion();
    if ((curRig === 'moon' || curRig === 'orrery') && SOLAR.TeachOrrery && SOLAR.TeachOrrery.resetMotion) SOLAR.TeachOrrery.resetMotion();
  }

  /* 取景用：返回当前装置里某个天体的世界坐标 */
  function getRigWorldPosition(bodyId) {
    if (!ready) return null;
    if (curRig === 'globe' && SOLAR.TeachGlobe) return SOLAR.TeachGlobe.getWorldPosition(bodyId);
    if ((curRig === 'orrery' || curRig === 'moon') && SOLAR.TeachOrrery) return SOLAR.TeachOrrery.getWorldPosition(bodyId);
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
    dispose: function () {
      if (SOLAR.TeachGlobe) SOLAR.TeachGlobe.dispose();
      if (SOLAR.TeachOrrery) SOLAR.TeachOrrery.dispose();
      ready = false;
      curRig = null;
    }
  };
})();
