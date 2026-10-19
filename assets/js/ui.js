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
  /* 银河公转读数缓存：这些量变化周期是分钟/小时级，逐帧 formatDecimal + textContent 纯浪费 */
  var lastGalaxyCells = null;

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

    /* 银河公转读数：先 format 再比缓存，串没变就不碰 DOM（这些量分钟级才动一位） */
    if (SOLAR.Galaxy && els.gxProgress) {
      var gi = SOLAR.Galaxy.getInfo();
      var gxSpeed = SOLAR.UIUtil.formatDecimal(gi.speedKms, 0) + ' km/s';
      var gxDist = SOLAR.UIUtil.formatDecimal(gi.distanceLy, 0) + ' ly';
      var gxYear = SOLAR.UIUtil.formatDecimal(gi.yearMyr, 0) + ' Myr';
      var gxProgress = gi.progress.toFixed(1) + '%';
      var gxHeight = '';
      if (els.gxHeight) {
        var h = typeof gi.planeHeightLy === 'number' ? gi.planeHeightLy : 0;
        gxHeight = (h >= 0 ? '+' : '−') + SOLAR.UIUtil.formatDecimal(Math.abs(h), 0) + ' ly';
      }
      var gxTravel = SOLAR.UIUtil.formatDecimal(gi.travelledLy, 0) + ' ly';
      var gxNow = lastGalaxyCells;
      if (!gxNow || gxNow.speed !== gxSpeed || gxNow.dist !== gxDist ||
          gxNow.year !== gxYear || gxNow.progress !== gxProgress ||
          gxNow.height !== gxHeight || gxNow.travel !== gxTravel) {
        lastGalaxyCells = {
          speed: gxSpeed, dist: gxDist, year: gxYear,
          progress: gxProgress, height: gxHeight, travel: gxTravel
        };
        els.gxSpeed.textContent = gxSpeed;
        els.gxDist.textContent = gxDist;
        els.gxYear.textContent = gxYear;
        els.gxProgress.textContent = gxProgress;
        if (els.gxHeight) els.gxHeight.textContent = gxHeight;
        els.gxTravel.textContent = gxTravel;
      }
    }
  }

  /* 主循环自动调整画质时同步分段控件显示。
     画质同时是 HUD 动效的门控之一：手动选档（ui-settings → setManualQuality）
     与自动降级（main.js → syncQualityUi）都最终经此处。
     顶栏画质控件为 seg 分段按钮；自动降级只走本函数，必须补 seg 高亮，
     否则面板显示与实际画质脱节。
     LOW 档关掉 JS 数字补间；CSS 侧无限循环装饰动画由 body.quality-low 关闭
     （style.css 末尾「动效总门控」），一次性入场动画保留。
     注意与「界面动效」总开关合并判定：用户关掉界面动效后，即使切回高画质
     也不自动恢复——总开关的优先级高于画质档。 */
  function setQuality(name) {
    if (document.body && document.body.classList) {
      document.body.classList.toggle('quality-low', name === 'low');
    }
    if (els.segQuality && SOLAR.UISettings && typeof SOLAR.UISettings.setSegActive === 'function') {
      SOLAR.UISettings.setSegActive(els.segQuality, name);
    }
    if (SOLAR.UIFx && typeof SOLAR.UIFx.setEnabled === 'function') {
      SOLAR.UIFx.setEnabled(U.state.settings.hudFx !== false && name !== 'low');
    }
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
    /* 带 lang 参数时必须走 SOLAR.setLang 真正切换 SOLAR.lang，再由 setLang
       回调无参 applyLanguage 重绘；直接转发给无参的 UIShell.applyLanguage
       会把参数静默丢掉（返回 zh 但界面不变）。 */
    applyLanguage: function (lang) {
      if (lang && typeof SOLAR.setLang === 'function') return SOLAR.setLang(lang);
      return SOLAR.UIShell.applyLanguage();
    },
    showTooltip: function (id, x, y) { return SOLAR.UIShell.showTooltip(id, x, y); },
    hideTooltip: function () { return SOLAR.UIShell.hideTooltip(); },
    setProgress: function (value) { return SOLAR.UIShell.setProgress(value); },
    hideLoading: function (done) { return SOLAR.UIShell.hideLoading(done); },
    setQuality: setQuality,
    setScale: function (name) { return SOLAR.UISettings.setScale(name); },
    showModeChoice: function () { return SOLAR.UISettings.showModeChoice(); },
    setStats: setStats
  };
})();
