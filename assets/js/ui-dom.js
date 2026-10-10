/**
 * 界面层 DOM 缓存：一次性取回信息卡 / 顶栏 / 设置面板 / 时间条等节点，
 * 写入 SOLAR.UIShared.dom 供其余界面模块共用；同时注册太阳观测视图条点击监听。
 * 依赖：config.js、SOLAR.UIShared、SOLAR.UIUtil（byId / hasOwn）
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UIDom = (function () {
  'use strict';

  var C = SOLAR.CONFIG;
  var U = SOLAR.UIShared;

  /* ============ DOM 缓存 ============ */

  function cacheDom() {
    var els = U.dom;

    els.bodyList = SOLAR.UIUtil.byId('body-list');
    els.infoPanel = SOLAR.UIUtil.byId('info-panel');
    els.panelEmpty = SOLAR.UIUtil.byId('panel-empty');
    els.panelBody = SOLAR.UIUtil.byId('panel-body');
    els.infoType = SOLAR.UIUtil.byId('info-type');
    els.infoName = SOLAR.UIUtil.byId('info-name');
    els.infoTags = SOLAR.UIUtil.byId('info-tags');
    els.infoDesc = SOLAR.UIUtil.byId('info-desc');
    els.infoFact = SOLAR.UIUtil.byId('info-fact');
    els.infoCompare = SOLAR.UIUtil.byId('info-compare');
    els.infoTable = SOLAR.UIUtil.byId('info-table');
    els.infoFollow = SOLAR.UIUtil.byId('info-follow');
    els.btnInfoClose = SOLAR.UIUtil.byId('btn-info-close');
    els.btnUnfollow = SOLAR.UIUtil.byId('btn-unfollow');

    /* 信息卡分区 */
    els.secOverview = SOLAR.UIUtil.byId('sec-overview');
    els.secCompare = SOLAR.UIUtil.byId('sec-compare');
    els.secOrbit = SOLAR.UIUtil.byId('sec-orbit');
    els.secPhysical = SOLAR.UIUtil.byId('sec-physical');
    els.secAtmosphere = SOLAR.UIUtil.byId('sec-atmosphere');
    els.secMoons = SOLAR.UIUtil.byId('sec-moons');
    els.secDiscovery = SOLAR.UIUtil.byId('sec-discovery');
    els.secFact = SOLAR.UIUtil.byId('sec-fact');
    els.secData = SOLAR.UIUtil.byId('sec-data');
    els.secMoonsTitle = SOLAR.UIUtil.byId('sec-title-moons');
    els.infoOrbit = SOLAR.UIUtil.byId('info-orbit');
    els.infoPhysical = SOLAR.UIUtil.byId('info-physical');
    els.infoAtmosphere = SOLAR.UIUtil.byId('info-atmosphere');
    els.infoMoons = SOLAR.UIUtil.byId('info-moons');
    els.infoMoonsNote = SOLAR.UIUtil.byId('info-moons-note');
    els.infoDiscovery = SOLAR.UIUtil.byId('info-discovery');

    /* 顶栏 */
    els.btnAlign = SOLAR.UIUtil.byId('btn-align');
    els.btnCruise = SOLAR.UIUtil.byId('btn-cruise');
    els.btnReset = SOLAR.UIUtil.byId('btn-reset');
    els.btnImmersive = SOLAR.UIUtil.byId('btn-immersive');
    els.btnSettings = SOLAR.UIUtil.byId('btn-settings');
    els.viewSelect = SOLAR.UIUtil.byId('view-select');
    els.qualitySelect = SOLAR.UIUtil.byId('quality-select');
    els.btnLang = SOLAR.UIUtil.byId('btn-lang');
    els.segScale = SOLAR.UIUtil.byId('seg-scale');
    els.modeLayer = SOLAR.UIUtil.byId('mode-layer');
    els.btnModeDemo = SOLAR.UIUtil.byId('btn-mode-demo');
    els.btnModeTeach = SOLAR.UIUtil.byId('btn-mode-teach');

    /* 设置面板 */
    els.settingsPanel = SOLAR.UIUtil.byId('settings-panel');
    els.btnSettingsClose = SOLAR.UIUtil.byId('btn-settings-close');
    els.settingsNote = SOLAR.UIUtil.byId('settings-note');
    els.segUnit = SOLAR.UIUtil.byId('seg-unit');
    els.segLang = SOLAR.UIUtil.byId('seg-lang');
    els.segQuality = SOLAR.UIUtil.byId('seg-quality');
    els.sw = {};
    for (var key in U.state.switchIds) {
      if (SOLAR.UIUtil.hasOwn(U.state.switchIds, key)) els.sw[key] = SOLAR.UIUtil.byId(U.state.switchIds[key]);
    }

    /* 左侧导航与搜索 */
    els.bodyNav = SOLAR.UIUtil.byId('body-nav');
    els.btnNavToggle = SOLAR.UIUtil.byId('btn-nav-toggle');
    els.bodySearch = SOLAR.UIUtil.byId('body-search');
    els.btnSearchClear = SOLAR.UIUtil.byId('btn-search-clear');
    els.searchEmpty = SOLAR.UIUtil.byId('search-empty');

    /* 快捷键弹层 */
    els.btnHelp = SOLAR.UIUtil.byId('btn-help');
    els.shortcuts = SOLAR.UIUtil.byId('shortcuts');

    /* 银河数据条 */
    els.gxSpeed = SOLAR.UIUtil.byId('gx-speed');
    els.gxDist = SOLAR.UIUtil.byId('gx-dist');
    els.gxYear = SOLAR.UIUtil.byId('gx-year');
    els.gxProgress = SOLAR.UIUtil.byId('gx-progress');
    els.gxHeight = SOLAR.UIUtil.byId('gx-height');
    els.gxTravel = SOLAR.UIUtil.byId('gx-travel');

    /* 时间条 */
    els.timeBar = SOLAR.UIUtil.byId('time-bar');
    els.timeDate = SOLAR.UIUtil.byId('time-date');
    els.timeClock = SOLAR.UIUtil.byId('time-clock');
    els.timeUtc = SOLAR.UIUtil.byId('time-utc');
    els.timeJd = SOLAR.UIUtil.byId('time-jd');
    els.btnReverse = SOLAR.UIUtil.byId('btn-reverse');
    els.btnPlay = SOLAR.UIUtil.byId('btn-play');
    els.btnNow = SOLAR.UIUtil.byId('btn-now');
    els.speedRange = SOLAR.UIUtil.byId('speed-range');
    els.speedValue = SOLAR.UIUtil.byId('speed-value');
    els.speedHint = SOLAR.UIUtil.byId('speed-hint');
    /* 倍速滑块的档位数跟着 config.time.speeds 走：以后加档不必再改 HTML 里的 max */
    if (els.speedRange && C.time && C.time.speeds && C.time.speeds.length) {
      els.speedRange.max = String(C.time.speeds.length - 1);
    }
    els.dateInput = SOLAR.UIUtil.byId('date-input');
    els.dateHint = SOLAR.UIUtil.byId('date-hint');
    els.btnJump = SOLAR.UIUtil.byId('btn-jump');

    /* 连珠箭头 / 浮标 / 调试 / 沉浸提示 / 加载屏 */
    els.alignPrev = SOLAR.UIUtil.byId('align-prev');
    els.alignNext = SOLAR.UIUtil.byId('align-next');
    els.tooltip = SOLAR.UIUtil.byId('tooltip');
    els.dbgFps = SOLAR.UIUtil.byId('dbg-fps');
    els.dbgTris = SOLAR.UIUtil.byId('dbg-tris');
    els.dbgBodies = SOLAR.UIUtil.byId('dbg-bodies');
    els.hud = SOLAR.UIUtil.byId('hud');
    els.immersiveHint = SOLAR.UIUtil.byId('immersive-hint');
    els.sunViewBar = SOLAR.UIUtil.byId('sun-view-bar');
    if (els.sunViewBar) {
      var sbs = els.sunViewBar.querySelectorAll('.sun-view-btn');
      for (var sb = 0; sb < sbs.length; sb++) {
        (function (b) {
          b.addEventListener('click', function () {
            var mode = b.getAttribute('data-mode');
            if (SOLAR.Scene && SOLAR.Scene.setSunView) SOLAR.Scene.setSunView(mode);
            var all = els.sunViewBar.querySelectorAll('.sun-view-btn');
            for (var x = 0; x < all.length; x++) {
              all[x].classList.toggle('is-active', all[x] === b);
            }
          });
        })(sbs[sb]);
      }
    }
    els.loadingScreen = SOLAR.UIUtil.byId('loading-screen');
    els.loaderFill = SOLAR.UIUtil.byId('loader-fill');
    els.loaderPct = SOLAR.UIUtil.byId('loader-pct');
    els.loaderStage = SOLAR.UIUtil.byId('loader-stage');
    els.loaderTicks = SOLAR.UIUtil.byId('loader-ticks');
  }

  return {
    cacheDom: cacheDom
  };
})();
