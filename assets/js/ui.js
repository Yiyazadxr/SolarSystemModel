/**
 * 界面层门面：装配 SOLAR.UIShared / UIUtil / UIDom / UINav / UIInfo /
 * UISettings / UITime / UIShell，并转发为对外的 SOLAR.UI 公开 API。
 * 逐帧更新与跨子模块的横切逻辑留在此文件中。
 * 依赖：SOLAR.UIShared、SOLAR.UIUtil、SOLAR.UIDom、SOLAR.UINav、SOLAR.UIInfo、
 *       SOLAR.UISettings、SOLAR.UITime、SOLAR.UIShell
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UI = (function () {
  'use strict';

  var U = SOLAR.UIShared;
  var els = U.dom;

  /* 与外部（自动降级 / 其它模块）保持同步的缓存 */
  var lastCruise = null;
  var lastAlign = null;

  /* ============ 初始化与逐帧更新 ============ */

  function init() {
    SOLAR.UIDom.cacheDom();
    SOLAR.UISettings.detectApi();
    if (!U.state.initialized) {
      U.state.initialized = true;
      SOLAR.UIShell.bindEvents();
      SOLAR.UIShell.bindSections();
      SOLAR.UINav.buildSearchIndex();
    }
    SOLAR.UITime.setSpeedIndex(SOLAR.UITime.speedIndex());
    if (els.dbgBodies) els.dbgBodies.textContent = SOLAR.UIUtil.formatDecimal(SOLAR.UIUtil.bodyCount(), 0);
    SOLAR.UIInfo.showEmptyPanel();
    SOLAR.UIShell.applyLanguage();
    SOLAR.UISettings.refreshSwitches();
    SOLAR.UISettings.applyAllSettings();
    SOLAR.UIShell.applyResponsive();
  }

  /* 外部（自动画质降级等）改动状态时的同步 */
  function syncExternalState() {
    if (els.qualitySelect && els.qualitySelect.value !== U.state.lastQuality) {
      U.state.lastQuality = els.qualitySelect.value;
      SOLAR.UISettings.setSegActive(els.segQuality, U.state.lastQuality);
    }
    var cruising = (SOLAR.Controls && SOLAR.Controls.isCruising) ? SOLAR.Controls.isCruising() : null;
    if (cruising !== lastCruise) {
      lastCruise = cruising;
      SOLAR.UITime.refreshCruiseButton();
    }
    var aligned = (SOLAR.Scene && SOLAR.Scene.isAligned) ? SOLAR.Scene.isAligned() : null;
    if (aligned !== lastAlign) {
      lastAlign = aligned;
      SOLAR.UITime.refreshAlignButton();
      SOLAR.UITime.refreshAlignArrows();
    }
  }

  function tick(fps, tris) {
    if (!U.state.initialized) return;
    SOLAR.UITime.updateClock();

    /* 倍速可能被外部或时间跳转逻辑直接改写 SOLAR.time.speed，
       这里用变化检测兜底同步读数与滑块，避免显示与实际不一致（只在变化时写 DOM）。 */
    if (SOLAR.time && (SOLAR.time.speed !== U.state.lastSpeedShown ||
        SOLAR.time.effectiveSpeed !== U.state.lastEffectiveSpeedShown)) SOLAR.UITime.refreshSpeed();

    if (els.dbgFps) els.dbgFps.textContent = typeof fps === 'number' && isFinite(fps) ? fps.toFixed(1) : '0';
    if (els.dbgTris) els.dbgTris.textContent = SOLAR.UIUtil.formatDecimal(typeof tris === 'number' ? tris : 0, 0);
    if (els.dbgBodies) els.dbgBodies.textContent = SOLAR.UIUtil.formatDecimal(SOLAR.UIUtil.bodyCount(), 0);

    SOLAR.UIInfo.updateLiveCells();
    syncExternalState();
    SOLAR.UITime.refreshFollowState(false);
    SOLAR.UIShell.updateTooltipPosition();

    /* 银河公转读数 */
    if (SOLAR.Galaxy && els.gxProgress) {
      var gi = SOLAR.Galaxy.getInfo();
      els.gxSpeed.textContent = SOLAR.UIUtil.formatDecimal(gi.speedKms, 0) + ' km/s';
      els.gxDist.textContent = SOLAR.UIUtil.formatDecimal(gi.distanceLy, 0) + ' ly';
      els.gxYear.textContent = SOLAR.UIUtil.formatDecimal(gi.yearMyr, 0) + ' Myr';
      els.gxProgress.textContent = gi.progress.toFixed(1) + '%';
      if (els.gxHeight) {
        var h = typeof gi.planeHeightLy === 'number' ? gi.planeHeightLy : 0;
        els.gxHeight.textContent = (h >= 0 ? '+' : '−') + SOLAR.UIUtil.formatDecimal(Math.abs(h), 0) + ' ly';
      }
      els.gxTravel.textContent = SOLAR.UIUtil.formatDecimal(gi.travelledLy, 0) + ' ly';
    }
  }

  /* 主循环自动调整画质时同步下拉框显示 */
  function setQuality(name) {
    if (els.qualitySelect && els.qualitySelect.value !== name) els.qualitySelect.value = name;
  }

  /* 主循环下发的额外运行指标（可选） */
  function setStats(stats) {
    if (!stats) return;
    if (els.dbgFps && typeof stats.instant === 'number' && isFinite(stats.instant)) {
      els.dbgFps.textContent = stats.instant.toFixed(0);
    }
    if (els.dbgTris && typeof stats.triangles === 'number') {
      els.dbgTris.textContent = SOLAR.UIUtil.formatDecimal(stats.triangles, 0);
    }
  }

  /* 调用时读取子模块方法，替换实现后门面不会继续持有旧函数。 */
  return {
    init: init,
    tick: tick,
    select: function (id) { return SOLAR.UIInfo.select(id); },
    onSelectId: function (id) { return SOLAR.UIInfo.onSelectId(id); },
    onCruiseId: function (id) { return SOLAR.UIInfo.onCruiseId(id); },
    applyLanguage: function (lang) { return SOLAR.UIShell.applyLanguage(lang); },
    showTooltip: function (id, x, y) { return SOLAR.UIShell.showTooltip(id, x, y); },
    hideTooltip: function () { return SOLAR.UIShell.hideTooltip(); },
    setProgress: function (value) { return SOLAR.UIShell.setProgress(value); },
    hideLoading: function () { return SOLAR.UIShell.hideLoading(); },
    setQuality: setQuality,
    setScale: function (name) { return SOLAR.UISettings.setScale(name); },
    showModeChoice: function () { return SOLAR.UISettings.showModeChoice(); },
    setStats: setStats
  };
})();
