/**
 * 界面层：HUD 外壳——事件绑定、响应式、语言应用、悬停浮标与加载进度。
 * 跨模块一律运行时限定名：设置在 SOLAR.UISettings、时间在 SOLAR.UITime、
 * 导航在 SOLAR.UINav、信息卡在 SOLAR.UIInfo、格式化在 SOLAR.UIUtil。
 * 依赖：SOLAR.UIShared、SOLAR.UIUtil、SOLAR.UINav、SOLAR.UIInfo、
 *       SOLAR.UISettings、SOLAR.UITime
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UIShell = (function () {
  'use strict';

  var U = SOLAR.UIShared;
  var els = U.dom;

  /* 悬停浮标：目标位置 + 平滑插值位置 */
  var tooltipId = null;
  var tip = { id: null, x: 0, y: 0, tx: 0, ty: 0, shown: false };

  var loadingTimer = null;

  /* 加载进度：main.js 推送目标值，界面平滑逼近并显示阶段文案 */
  var load = { target: 0, shown: 0, stage: -1, timer: null, stageHoldUntil: 0 };

  /* ============ 事件绑定 ============ */

  function isEditing(target) {
    if (!target) return false;
    var tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  /* 焦点在按钮上时，空格应交给按钮自身而不是播放/暂停 */
  function isInteractive(target) {
    if (!target) return false;
    var tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'button' || tag === 'a' || tag === 'select' || tag === 'input' ||
      tag === 'textarea' || tag === 'li';
  }

  function onKeyDown(event) {
    if (isEditing(event.target)) return;
    var code = event.keyCode || event.which;

    if (code === 32) {
      if (isInteractive(event.target)) return;   // 让按钮自己响应空格
      event.preventDefault();
      SOLAR.UITime.togglePlay();
    } else if (code === 38) {
      event.preventDefault();
      SOLAR.UITime.setSpeedIndex(SOLAR.UITime.speedIndex() + 1);
    } else if (code === 40) {
      event.preventDefault();
      SOLAR.UITime.setSpeedIndex(SOLAR.UITime.speedIndex() - 1);
    } else if (code === 82) {
      SOLAR.Controls.resetView();
    } else if (code === 72) {
      SOLAR.UITime.toggleImmersive();
    } else if (code === 83) {
      SOLAR.UISettings.toggleSettings();
    } else if (code === 191) {
      event.preventDefault();
      SOLAR.UINav.focusSearch();
    } else if (code === 37) {
      if (SOLAR.Scene.isAligned()) { event.preventDefault(); SOLAR.UITime.alignStep(-1); }
    } else if (code === 39) {
      if (SOLAR.Scene.isAligned()) { event.preventDefault(); SOLAR.UITime.alignStep(1); }
    } else if (code === 27) {
      /* 先关闭弹层，再取消选择 */
      if (els.settingsPanel && !els.settingsPanel.hidden) { SOLAR.UISettings.toggleSettings(false); return; }
      if (els.shortcuts && !els.shortcuts.hidden) { SOLAR.UISettings.closeShortcuts(); return; }
      if (U.state.searchQuery) { SOLAR.UINav.setSearch(''); if (els.bodySearch) els.bodySearch.value = ''; return; }
      SOLAR.UIInfo.select(null);
    }
  }

  /* 点击弹层外部时自动收起 */
  function onDocumentPointerDown(event) {
    var target = event.target;
    if (els.settingsPanel && !els.settingsPanel.hidden &&
      !SOLAR.UIUtil.inside(els.settingsPanel, target) && target !== els.btnSettings) {
      SOLAR.UISettings.toggleSettings(false);
    }
    if (els.shortcuts && !els.shortcuts.hidden &&
      !SOLAR.UIUtil.inside(els.shortcuts, target) && target !== els.btnHelp) {
      SOLAR.UISettings.closeShortcuts();
    }
  }

  function bindSwitch(key, el) {
    if (!el) return;
    el.addEventListener('click', function () {
      if (U.state.api[key] === false) return;      // 场景缺少对应开关：保持置灰，不生效
      U.state.settings[key] = !U.state.settings[key];
      SOLAR.UISettings.applySetting(key);
      SOLAR.UISettings.refreshSwitches();
    });
  }

  function bindSegButton(el, handler) {
    if (!el) return;
    var value = el.getAttribute('data-value');
    el.addEventListener('click', function () { handler(value); });
  }

  function bindEvents() {
    if (els.btnUnfollow) els.btnUnfollow.addEventListener('click', function () { SOLAR.UIInfo.select(null); });
    if (els.btnInfoClose) els.btnInfoClose.addEventListener('click', function () { SOLAR.UIInfo.select(null); });
    if (els.btnAlign) els.btnAlign.addEventListener('click', SOLAR.UITime.toggleAlign);
    if (els.btnCruise) els.btnCruise.addEventListener('click', SOLAR.UITime.toggleCruise);
    if (els.btnReset) els.btnReset.addEventListener('click', function () { SOLAR.Controls.resetView(); });
    if (els.btnImmersive) els.btnImmersive.addEventListener('click', SOLAR.UITime.toggleImmersive);

    /* 行星连珠左右切换 */
    if (els.alignPrev) els.alignPrev.addEventListener('click', function () { SOLAR.UITime.alignStep(-1); });
    if (els.alignNext) els.alignNext.addEventListener('click', function () { SOLAR.UITime.alignStep(1); });

    if (els.viewSelect) {
      els.viewSelect.addEventListener('change', function () {
        SOLAR.Controls.goToPreset(els.viewSelect.value);
      });
    }

    /* 显示比例：真实 / 示意——两套模式之下都可以切换，状态全局一致 */
    if (els.segScale) {
      var scaleBtns = els.segScale.querySelectorAll('.seg-btn');
      for (var si = 0; si < scaleBtns.length; si++) bindSegButton(scaleBtns[si], SOLAR.UISettings.applyScaleMode);
    }
    if (els.btnModeDemo) {
      els.btnModeDemo.addEventListener('click', function () { SOLAR.UISettings.chooseMode('demo'); });
    }
    if (els.btnModeTeach) {
      els.btnModeTeach.addEventListener('click', function () { SOLAR.UISettings.chooseMode('teach'); });
    }

    /* 左侧天体面板收起 / 展开 */
    if (els.btnNavToggle && els.bodyNav) {
      els.btnNavToggle.addEventListener('click', function () {
        U.state.navUserToggled = true;
        U.state.navAutoCollapsed = false;
        els.bodyNav.classList.toggle('collapsed');
      });
    }

    /* 搜索框：即时过滤 + 回车飞向第一个匹配项 */
    if (els.bodySearch) {
      els.bodySearch.addEventListener('input', function () { SOLAR.UINav.setSearch(els.bodySearch.value); });
      els.bodySearch.addEventListener('keydown', function (event) {
        var code = event.keyCode || event.which;
        if (code === 13) {
          event.preventDefault();
          var first = SOLAR.UINav.applySearchFilter();
          if (first) SOLAR.UIInfo.select(first);
        } else if (code === 27) {
          event.preventDefault();
          els.bodySearch.value = '';
          SOLAR.UINav.setSearch('');
        }
      });
    }
    if (els.btnSearchClear) {
      els.btnSearchClear.addEventListener('click', function () {
        if (els.bodySearch) { els.bodySearch.value = ''; els.bodySearch.focus(); }
        SOLAR.UINav.setSearch('');
      });
    }

    /* 设置面板 */
    if (els.btnSettings) els.btnSettings.addEventListener('click', function () { SOLAR.UISettings.toggleSettings(); });
    if (els.btnSettingsClose) els.btnSettingsClose.addEventListener('click', function () { SOLAR.UISettings.toggleSettings(false); });
    for (var key in U.state.switchIds) {
      if (SOLAR.UIUtil.hasOwn(U.state.switchIds, key)) bindSwitch(key, els.sw[key]);
    }
    bindSegButton(SOLAR.UIUtil.byId('seg-unit-au'), SOLAR.UISettings.setUnitSystem);
    bindSegButton(SOLAR.UIUtil.byId('seg-unit-km'), SOLAR.UISettings.setUnitSystem);
    bindSegButton(SOLAR.UIUtil.byId('seg-lang-en'), SOLAR.UISettings.setLangFromSeg);
    bindSegButton(SOLAR.UIUtil.byId('seg-lang-zh'), SOLAR.UISettings.setLangFromSeg);
    bindSegButton(SOLAR.UIUtil.byId('seg-q-ultra'), SOLAR.UISettings.applyQuality);
    bindSegButton(SOLAR.UIUtil.byId('seg-q-high'), SOLAR.UISettings.applyQuality);
    bindSegButton(SOLAR.UIUtil.byId('seg-q-medium'), SOLAR.UISettings.applyQuality);
    bindSegButton(SOLAR.UIUtil.byId('seg-q-low'), SOLAR.UISettings.applyQuality);

    /* 快捷键弹层 */
    if (els.btnHelp && els.shortcuts) {
      els.btnHelp.addEventListener('click', function () {
        var on = els.shortcuts.hidden;
        els.shortcuts.hidden = !on;
        SOLAR.UIUtil.setClass(els.btnHelp, 'active', on);
        if (on) SOLAR.UISettings.toggleSettings(false);
      });
    }

    if (els.qualitySelect) {
      els.qualitySelect.addEventListener('change', function () {
        SOLAR.UISettings.applyQuality(els.qualitySelect.value);
      });
    }

    if (els.btnLang) {
      els.btnLang.addEventListener('click', function () {
        SOLAR.setLang(SOLAR.lang === 'en' ? 'zh' : 'en');
      });
    }

    if (els.btnReverse) {
      els.btnReverse.addEventListener('click', function () {
        SOLAR.time.reverse = !SOLAR.time.reverse;
        SOLAR.UIUtil.setClass(els.btnReverse, 'active', SOLAR.time.reverse);
        SOLAR.UITime.refreshSpeed();
      });
    }
    if (els.btnPlay) els.btnPlay.addEventListener('click', SOLAR.UITime.togglePlay);
    if (els.btnNow) els.btnNow.addEventListener('click', SOLAR.UITime.setNow);
    if (els.speedRange) els.speedRange.addEventListener('input', function () { SOLAR.UITime.setSpeedIndex(els.speedRange.value); });
    if (els.btnJump) els.btnJump.addEventListener('click', SOLAR.UITime.jumpToDate);
    if (els.dateInput) {
      els.dateInput.addEventListener('keydown', function (event) {
        if ((event.keyCode || event.which) === 13) SOLAR.UITime.jumpToDate();
      });
      els.dateInput.addEventListener('input', function () {
        if (els.dateHint && els.dateHint.textContent) {
          els.dateHint.textContent = '';
          SOLAR.UIUtil.setClass(els.dateHint, 'error', false);
          SOLAR.UIUtil.setClass(els.dateHint, 'ok', false);
        }
      });
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onDocumentPointerDown, false);
    window.addEventListener('resize', applyResponsive, false);
  }

  /* ============ 响应式 ============ */

  function applyResponsive() {
    var w = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 1280;
    var h = window.innerHeight || 0;

    /* 窄窗口自动收起左侧导航；用户手动操作后不再自动干预 */
    if (w < 940) {
      if (!U.state.navUserToggled && !U.state.navAutoCollapsed && els.bodyNav && !els.bodyNav.classList.contains('collapsed')) {
        els.bodyNav.classList.add('collapsed');
        U.state.navAutoCollapsed = true;
      }
    } else if (U.state.navAutoCollapsed && els.bodyNav) {
      els.bodyNav.classList.remove('collapsed');
      U.state.navAutoCollapsed = false;
    }
    /* 高度不足时压缩面板上下留白（配合 CSS 媒体查询） */
    SOLAR.UIUtil.setClass(document.body, 'short', h < 720);
  }

  /* ============ 语言、浮标、加载状态 ============ */

  function updateQualityLabels() {
    if (!els.qualitySelect) return;
    var labels = SOLAR.lang === 'zh'
      ? ['超极限', '高', '中', '低']
      : ['ULTRA', 'HIGH', 'MEDIUM', 'LOW'];
    var segIds = ['seg-q-ultra', 'seg-q-high', 'seg-q-medium', 'seg-q-low'];
    for (var i = 0; i < labels.length; i++) {
      if (els.qualitySelect.options[i]) els.qualitySelect.options[i].textContent = labels[i];
      var seg = SOLAR.UIUtil.byId(segIds[i]);
      if (seg) seg.textContent = labels[i];
    }
  }

  function applyLanguage() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = SOLAR.t(nodes[i].getAttribute('data-i18n'));
    }
    var titleNodes = document.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < titleNodes.length; j++) {
      titleNodes[j].setAttribute('title', SOLAR.t(titleNodes[j].getAttribute('data-i18n-title')));
    }

    document.title = SOLAR.t('ui.title') + ' · SOLAR SYSTEM';
    if (els.dateInput) els.dateInput.placeholder = SOLAR.t('ui.datePlaceholder');
    if (els.bodySearch) els.bodySearch.placeholder = SOLAR.t('ui.searchPlaceholder');
    updateQualityLabels();
    SOLAR.UISettings.setSegActive(els.segLang, SOLAR.lang);
    SOLAR.UINav.buildSearchIndex();
    SOLAR.UINav.buildBodyList();

    if (U.state.selectedId) {
      U.state.selectedRecord = SOLAR.UIUtil.findRecord(U.state.selectedId);
      if (U.state.selectedRecord) SOLAR.UIInfo.renderInfo(U.state.selectedRecord);
      else SOLAR.UIInfo.showEmptyPanel();
    } else {
      SOLAR.UIInfo.showEmptyPanel();
    }

    /* 场景内的天体标签文字随语言重建 */
    if (SOLAR.Scene && typeof SOLAR.Scene.refreshLabels === 'function') {
      try { SOLAR.Scene.refreshLabels(); } catch (e) { }
    }

    SOLAR.UITime.refreshPlayButton();
    SOLAR.UITime.refreshAlignButton();
    SOLAR.UITime.refreshCruiseButton();
    if (els.btnReverse) SOLAR.UIUtil.setClass(els.btnReverse, 'active', SOLAR.time.reverse);
    if (els.btnImmersive && els.hud) SOLAR.UIUtil.setClass(els.btnImmersive, 'active', els.hud.classList.contains('immersive'));
    SOLAR.UITime.setSpeedIndex(SOLAR.UITime.speedIndex());
    SOLAR.UITime.refreshSpeed();
    SOLAR.UISettings.refreshSwitches();
    U.state.lastClockSecond = null;
    U.state.lastJdText = '';
    SOLAR.UITime.updateClock();
    SOLAR.UITime.updateEphemerisHint();

    if (tooltipId && els.tooltip && els.tooltip.classList.contains('show')) {
      els.tooltip.textContent = SOLAR.UIUtil.localizedName(tooltipId);
    }
  }

  function paintTooltip() {
    if (!els.tooltip) return;
    els.tooltip.style.transform = 'translate3d(' + Math.round(tip.x) + 'px,' + Math.round(tip.y) + 'px,0) ' +
      'translate(-50%,-140%)';
  }

  function showTooltip(id, x, y) {
    var record = SOLAR.UIUtil.findRecord(id);
    if (!record) {
      hideTooltip();
      return;
    }
    if (!els.tooltip) els.tooltip = SOLAR.UIUtil.byId('tooltip');
    if (!els.tooltip) return;
    tooltipId = id;
    tip.id = id;
    els.tooltip.textContent = SOLAR.UIUtil.localizedRecord(record).name;
    tip.tx = x;
    tip.ty = y;
    if (!tip.shown) {
      tip.x = x;
      tip.y = y;
      tip.shown = true;
    }
    SOLAR.UIUtil.setClass(els.tooltip, 'show', true);
    paintTooltip();
  }

  function hideTooltip() {
    tooltipId = null;
    tip.shown = false;
    if (!els.tooltip) els.tooltip = SOLAR.UIUtil.byId('tooltip');
    SOLAR.UIUtil.setClass(els.tooltip, 'show', false);
  }

  /* 浮标跟随：每帧向目标位置插值，避免抖动 */
  function updateTooltipPosition() {
    if (!els.tooltip || !tip.shown) return;
    var dx = tip.tx - tip.x;
    var dy = tip.ty - tip.y;
    if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) return;
    tip.x += dx * 0.35;
    tip.y += dy * 0.35;
    paintTooltip();
  }

  /* ---------- 加载进度 ---------- */

  function paintProgress() {
    var value = load.shown;
    if (els.loaderFill) els.loaderFill.style.width = (value * 100).toFixed(1) + '%';
    if (els.loaderPct) els.loaderPct.textContent = Math.round(value * 100) + '%';

    var stage = value < 0.18 ? 1 : (value < 0.45 ? 2 : (value < 0.72 ? 3 : (value < 0.97 ? 4 : 5)));
    if (stage === load.stage) return;
    load.stage = stage;
    /* 每个环节切换后冻结进度 20ms：阶段文案不至于一闪而过 */
    load.stageHoldUntil = Date.now() + 20;
    if (els.loaderStage) els.loaderStage.textContent = '· ' + SOLAR.t('ui.loadStage' + stage);
    if (els.loaderTicks && els.loaderTicks.children) {
      for (var i = 0; i < els.loaderTicks.children.length; i++) {
        SOLAR.UIUtil.setClass(els.loaderTicks.children[i], 'on', i < stage);
      }
    }
  }

  function progressStep() {
    if (Date.now() < load.stageHoldUntil) return;     /* 环节切换的短暂停顿 */
    var diff = load.target - load.shown;
    /* 常态缓慢逼近；目标已满时快速收尾，保证进度条走到 100% */
    var step = Math.max(diff * 0.18, load.target >= 1 ? 0.05 : 0.0018);
    load.shown += step;
    if (load.shown > load.target) load.shown = load.target;
    paintProgress();
  }

  function startProgressTicker() {
    if (load.timer) return;
    load.timer = window.setInterval(progressStep, 60);
  }

  function setProgress(value) {
    value = typeof value === 'number' && isFinite(value) ? value : 0;
    value = Math.max(0, Math.min(1, value));
    load.target = value;
    paintProgress();
    startProgressTicker();
  }

  function hideLoading() {
    var screen = els.loadingScreen || SOLAR.UIUtil.byId('loading-screen');
    if (screen && !screen.classList.contains('hidden')) {
      /* 模式选择层必须等进度条真正走到 100% 再出现：先把目标强制推满，
         轮询等 shown 追上后才开始淡出加载屏 —— 否则用户会看到
         「进度还在 29% 就弹出选择窗」的突兀衔接。 */
      setProgress(1);
      var finishHide = function () {
        screen.classList.add('hidden');
        if (loadingTimer) window.clearTimeout(loadingTimer);
        loadingTimer = window.setTimeout(function () {
          screen.style.display = 'none';
          if (load.timer) { window.clearInterval(load.timer); load.timer = null; }
        }, 800);
        SOLAR.UISettings.showModeChoice();
      };
      var waitProgress = function () {
        if (load.shown < 0.995) { loadingTimer = window.setTimeout(waitProgress, 60); return; }
        finishHide();
      };
      waitProgress();
    } else if (load.timer) {
      window.clearInterval(load.timer);
      load.timer = null;
    }
  }

  return {
    bindEvents: bindEvents,
    bindSections: function () { return SOLAR.UINav.bindSections(); },
    applyResponsive: applyResponsive,
    applyLanguage: applyLanguage,
    updateQualityLabels: updateQualityLabels,
    showTooltip: showTooltip,
    hideTooltip: hideTooltip,
    updateTooltipPosition: updateTooltipPosition,
    setProgress: setProgress,
    hideLoading: hideLoading
  };
})();
