/**
 * 界面层：时间控制与跟随状态。
 * SOLAR.time 定义在本文件 IIFE 之外：main.js / controls.js / galaxy.js / scene.js
 * 都直接读写它，必须早于这些模块被引用（由 index.html 的加载顺序保证）。
 * 依赖：config.js、data.js、i18n.js、astro.js、SOLAR.UIShared、SOLAR.UIUtil、SOLAR.UIInfo
 */
window.SOLAR = window.SOLAR || {};

/* 全局模拟时间；main.js 在主循环中读取并推进。 */
SOLAR.time = {
  jd: SOLAR.Astro.toJulian(new Date()),
  simDays: 0,
  playing: true,
  speed: 1,
  reverse: false
};
SOLAR.time.simDays = SOLAR.time.jd - SOLAR.CONFIG.time.j2000;

SOLAR.UITime = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA, A = SOLAR.Astro;
  var U = SOLAR.UIShared;
  var els = U.dom;

  var dateHintTimer = null;
  var dateHintTransient = false;

  /* 行星连珠：由内向外排列，左右箭头在此序列上切换（太阳为内界，冥王星为外界） */
  var alignOrder = ['sun'].concat(D.bodies.map(function (b) { return b.id; }));
  var alignIndex = 0;

  /* ============ 时间控制 ============ */

  function speedIndex() {
    var speeds = C.time.speeds;
    var nearest = 0, distance = Infinity;
    for (var i = 0; i < speeds.length; i++) {
      var d = Math.abs(speeds[i] - SOLAR.time.speed);
      if (d < distance) { distance = d; nearest = i; }
    }
    return nearest;
  }

  /* 倍速换算提示：把"×"档位翻译成"每现实秒推进多少模拟时间" */
  function speedHuman(speed) {
    var s = Math.abs(speed);
    var value = s;
    var unit = SOLAR.t('units.seconds');
    if (s >= 31557600) { value = s / 31557600; unit = SOLAR.t('units.years'); }
    else if (s >= 86400) { value = s / 86400; unit = SOLAR.t('units.days'); }
    else if (s >= 3600) { value = s / 3600; unit = SOLAR.t('units.hours'); }
    else if (s >= 60) { value = s / 60; unit = SOLAR.t('units.minutes'); }
    /* 固定两位小数，避免有效倍速在临界值附近改变文本宽度造成底栏抖动。 */
    return (SOLAR.time.reverse ? '−' : '') + SOLAR.UIUtil.formatDecimal(value, 2) +
      ' ' + unit + SOLAR.t('ui.perSec');
  }

  function refreshSpeed() {
    var speed = Math.abs(SOLAR.time.speed);
    var effective = Math.abs(typeof SOLAR.time.effectiveSpeed === 'number' ? SOLAR.time.effectiveSpeed : speed);
    if (els.speedValue) {
      els.speedValue.textContent = (SOLAR.time.reverse ? '−' : '') + SOLAR.UIUtil.formatDecimal(speed, 0) + '×';
    }
    if (els.speedHint) {
      var requested = speedHuman(SOLAR.time.speed);
      var actual = speedHuman(effective);
      els.speedHint.textContent = requested + ' · ' + SOLAR.t('ui.effective') + ' ' + actual;
    }
    SOLAR.UIUtil.setClass(els.timeBar, 'reverse', !!SOLAR.time.reverse);
    SOLAR.UIUtil.setClass(document.body, 'time-reverse', !!SOLAR.time.reverse);
    U.state.lastSpeedShown = SOLAR.time.speed;
    U.state.lastEffectiveSpeedShown = SOLAR.time.effectiveSpeed;
  }

  function setSpeedIndex(index) {
    var speeds = C.time.speeds;
    index = Math.max(0, Math.min(speeds.length - 1, parseInt(index, 10) || 0));
    SOLAR.time.speed = speeds[index];
    if (els.speedRange) els.speedRange.value = index;
    refreshSpeed();
  }

  function refreshPlayButton() {
    if (!els.btnPlay) return;
    els.btnPlay.textContent = SOLAR.t(SOLAR.time.playing ? 'ui.pause' : 'ui.play');
    SOLAR.UIUtil.setClass(els.btnPlay, 'active', !SOLAR.time.playing);
  }

  function togglePlay() {
    SOLAR.time.playing = !SOLAR.time.playing;
    refreshPlayButton();
  }

  function refreshAlignButton() {
    if (!els.btnAlign || !SOLAR.Scene || !SOLAR.Scene.isAligned) return;
    var on = SOLAR.Scene.isAligned();
    els.btnAlign.textContent = SOLAR.t(on ? 'ui.alignOn' : 'ui.align');
    SOLAR.UIUtil.setClass(els.btnAlign, 'active', on);
  }

  function toggleAlign() {
    var on = !SOLAR.Scene.isAligned();
    SOLAR.Scene.setAlign(on);
    refreshAlignButton();
    setAlignMode(on);
  }

  /* 连珠模式的放大横向黄道视角 + 左右切换 */
  function setAlignMode(on) {
    document.body.classList.toggle('align-mode', on);
    if (on) {
      var cur = alignIndexOf(U.state.selectedId);
      alignIndex = cur >= 0 ? cur : 0;
      SOLAR.UIInfo.select(alignOrder[alignIndex]);       // 相机飞向该天体的贴黄道侧视图
    }
    refreshAlignArrows();
  }

  function alignIndexOf(id) {
    if (!id) return -1;
    for (var i = 0; i < alignOrder.length; i++) {
      if (alignOrder[i] === id) return i;
    }
    return -1;
  }

  /* 左右切换：dir=-1 向内侧（太阳方向），dir=1 向外侧（冥王星方向），越界即停 */
  function alignStep(dir) {
    if (!SOLAR.Scene || !SOLAR.Scene.isAligned || !SOLAR.Scene.isAligned()) return;
    var idx = alignIndex + dir;
    if (idx < 0 || idx >= alignOrder.length) return;
    alignIndex = idx;
    SOLAR.UIInfo.select(alignOrder[idx]);
    refreshAlignArrows();
  }

  function refreshAlignArrows() {
    var on = SOLAR.Scene && SOLAR.Scene.isAligned && SOLAR.Scene.isAligned();
    SOLAR.UIUtil.setClass(els.alignPrev, 'disabled', !on || alignIndex <= 0);
    SOLAR.UIUtil.setClass(els.alignNext, 'disabled', !on || alignIndex >= alignOrder.length - 1);
  }

  function refreshCruiseButton() {
    if (!els.btnCruise || !SOLAR.Controls || !SOLAR.Controls.isCruising) return;
    var on = SOLAR.Controls.isCruising();
    els.btnCruise.textContent = SOLAR.t(on ? 'ui.cruiseOn' : 'ui.cruise');
    SOLAR.UIUtil.setClass(els.btnCruise, 'active', on);
  }

  function toggleCruise() {
    SOLAR.Controls.toggleCruise();
    refreshCruiseButton();
  }

  function toggleImmersive() {
    if (!els.hud) return;
    var on = !els.hud.classList.contains('immersive');
    SOLAR.UIUtil.setClass(els.hud, 'immersive', on);
    SOLAR.UIUtil.setClass(els.btnImmersive, 'active', on);
    if (els.immersiveHint) els.immersiveHint.hidden = !on;
  }

  function setNow() {
    SOLAR.time.jd = A.toJulian(new Date());
    SOLAR.time.simDays = SOLAR.time.jd - C.time.j2000;
    U.state.lastClockSecond = null;
    updateClock();
  }

  function showDateHint(key, tone) {
    if (!els.dateHint) return;
    els.dateHint.textContent = SOLAR.t(key);
    SOLAR.UIUtil.setClass(els.dateHint, 'error', tone === 'error');
    SOLAR.UIUtil.setClass(els.dateHint, 'ok', tone === 'ok');
    SOLAR.UIUtil.setClass(els.dateHint, 'warn', false);
    dateHintTransient = true;
    if (dateHintTimer) window.clearTimeout(dateHintTimer);
    dateHintTimer = window.setTimeout(function () {
      dateHintTransient = false;
      updateEphemerisHint();
    }, 3200);
  }

  /* 当前日期必须持续标明模型口径，避免长期表与线性外推被误读为精确星历。 */
  function updateEphemerisHint() {
    if (!els.dateHint || dateHintTransient) return;
    var status = A.ephemerisStatus ? A.ephemerisStatus(SOLAR.time.jd) : { level: 'short' };
    var key = status.level === 'vsop' ? 'ui.ephemerisVsop' :
      (status.level === 'vsopOutside' ? 'ui.ephemerisVsopOutside' :
      (status.level === 'long' ? 'ui.ephemerisLong' :
      (status.level === 'extrapolated' ? 'ui.ephemerisExtrapolated' : 'ui.ephemerisShort')));
    els.dateHint.textContent = SOLAR.t(key);
    SOLAR.UIUtil.setClass(els.dateHint, 'error', status.level === 'extrapolated');
    SOLAR.UIUtil.setClass(els.dateHint, 'warn', status.level === 'long' || status.level === 'vsopOutside');
    SOLAR.UIUtil.setClass(els.dateHint, 'ok', status.level === 'short' || status.level === 'vsop');
  }

  function jumpToDate() {
    if (!els.dateInput) return;
    var raw = els.dateInput.value.replace(/^\s+|\s+$/g, '');
    if (!raw) { showDateHint('ui.dateFormatErr', 'error'); return; }

    var match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(raw);
    if (!match) { showDateHint('ui.dateFormatErr', 'error'); return; }

    var year = parseInt(match[1], 10);
    var month = parseInt(match[2], 10);
    var day = parseInt(match[3], 10);
    var date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      showDateHint('ui.dateInvalidErr', 'error');
      return;
    }

    SOLAR.time.jd = A.toJulian(date);
    SOLAR.time.simDays = SOLAR.time.jd - C.time.j2000;
    if (SOLAR.Scene && typeof SOLAR.Scene.refreshOrbitLines === 'function') SOLAR.Scene.refreshOrbitLines();
    U.state.lastClockSecond = null;
    updateClock();
    showDateHint('ui.dateJumped', 'ok');
  }

  function formatJd(jd) {
    if (typeof jd !== 'number' || !isFinite(jd)) return '—';
    return jd.toFixed(4);
  }

  function updateJd() {
    if (!els.timeJd) return;
    var text = formatJd(SOLAR.time.jd);
    if (text === U.state.lastJdText) return;
    U.state.lastJdText = text;
    els.timeJd.textContent = SOLAR.t('ui.jdLabel') + ' ' + text;
  }

  function updateClock() {
    if (!els.timeDate) return;
    var date = A.fromJulian(SOLAR.time.jd);
    var stamp = date.getTime();
    if (!isFinite(stamp)) {
      els.timeDate.textContent = '—';
      return;
    }

    updateJd();
    updateEphemerisHint();
    var second = Math.floor(stamp / 1000);
    if (second === U.state.lastClockSecond) return;
    U.state.lastClockSecond = second;
    els.timeDate.textContent = SOLAR.UIUtil.pad(date.getUTCFullYear(), 4) + '-' + SOLAR.UIUtil.pad(date.getUTCMonth() + 1, 2) + '-' +
      SOLAR.UIUtil.pad(date.getUTCDate(), 2);
    if (els.timeClock) {
      els.timeClock.textContent = SOLAR.UIUtil.pad(date.getUTCHours(), 2) + ':' +
        SOLAR.UIUtil.pad(date.getUTCMinutes(), 2) + ':' + SOLAR.UIUtil.pad(date.getUTCSeconds(), 2);
    }
  }

  /* ============ 跟随状态 ============ */

  function refreshFollowState(force) {
    var id = (SOLAR.Controls && SOLAR.Controls.getFollow) ? SOLAR.Controls.getFollow() : null;
    if (id !== U.state.lastFollowId || force) {
      U.state.lastFollowId = id;
      var on = !!id && id === U.state.selectedId;
      if (els.infoFollow) els.infoFollow.hidden = !on;
      if (els.btnUnfollow) els.btnUnfollow.hidden = !on;

      /* 太阳观测视图条：仅在跟随太阳时出现；离开时自动恢复普通太阳 */
      if (els.sunViewBar) {
        var sunView = id === 'sun';
        els.sunViewBar.classList.toggle('is-hidden', !sunView);
        if (!sunView && SOLAR.Scene && SOLAR.Scene.setSunView) {
          SOLAR.Scene.setSunView('photosphere');
          var sbs = els.sunViewBar.querySelectorAll('.sun-view-btn');
          for (var x = 0; x < sbs.length; x++) {
            sbs[x].classList.toggle('is-active', sbs[x].getAttribute('data-mode') === 'photosphere');
          }
        }
      }
    }
  }

  return {
    speedIndex: speedIndex,
    speedHuman: speedHuman,
    refreshSpeed: refreshSpeed,
    setSpeedIndex: setSpeedIndex,
    refreshPlayButton: refreshPlayButton,
    togglePlay: togglePlay,
    refreshAlignButton: refreshAlignButton,
    toggleAlign: toggleAlign,
    setAlignMode: setAlignMode,
    alignIndexOf: alignIndexOf,
    alignStep: alignStep,
    refreshAlignArrows: refreshAlignArrows,
    refreshCruiseButton: refreshCruiseButton,
    toggleCruise: toggleCruise,
    toggleImmersive: toggleImmersive,
    setNow: setNow,
    showDateHint: showDateHint,
    updateEphemerisHint: updateEphemerisHint,
    jumpToDate: jumpToDate,
    formatJd: formatJd,
    updateJd: updateJd,
    updateClock: updateClock,
    refreshFollowState: refreshFollowState
  };
})();
