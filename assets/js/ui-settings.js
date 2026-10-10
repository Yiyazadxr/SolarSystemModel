/**
 * 界面层：设置面板（开关 / 单位 / 语言 / 显示比例 / 画质）与「演示 / 教学」二选一。
 * 开关值与能力探测结果存放在 SOLAR.UIShared.state，供其他模块读取。
 * 依赖：config.js、SOLAR.UIShared、SOLAR.UIUtil、SOLAR.Scene、SOLAR.Effects、
 *       SOLAR.Controls、SOLAR.Teach
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UISettings = (function () {
  'use strict';

  var C = SOLAR.CONFIG;
  var U = SOLAR.UIShared;
  var els = U.dom;

  /* ============ 设置面板 ============ */

  /* 能力探测：场景 / 特效是否提供了对应开关（缺失时开关置灰并在面板底部提示） */
  function detectApi() {
    var S = SOLAR.Scene || {};
    var E = SOLAR.Effects || {};
    U.state.api.orbits = (typeof S.setOrbitsVisible === 'function') || (typeof S.getPlanets === 'function');
    U.state.api.trails = (typeof S.setTrailsVisible === 'function') || (typeof S.getPlanets === 'function');
    U.state.api.labels = (typeof S.setLabelsVisible === 'function') || (typeof S.setLabels === 'function');
    U.state.api.stars = (typeof S.setStarfieldVisible === 'function') || (typeof S.getSystemRoot === 'function');
    U.state.api.belts = (typeof S.setBeltsVisible === 'function') || (typeof S.getSystemRoot === 'function');
    U.state.api.bloom = (typeof E.setBloom === 'function');
    U.state.api.scanline = (typeof E.setOverlay === 'function') || !!SOLAR.UIUtil.byId('fx-scanline');
    U.state.api.vignette = (typeof E.setOverlay === 'function') || !!SOLAR.UIUtil.byId('fx-vignette');
    U.state.api.gasFx = (typeof S.setGasFx === 'function');
  }

  function hasUnavailable() {
    for (var key in U.state.switchIds) {
      if (SOLAR.UIUtil.hasOwn(U.state.switchIds, key) && U.state.api[key] === false) return true;
    }
    return false;
  }

  function planetRecords() {
    if (!SOLAR.Scene || typeof SOLAR.Scene.getPlanets !== 'function') return null;
    try { return SOLAR.Scene.getPlanets() || null; } catch (e) { return null; }
  }

  function systemRoot() {
    if (!SOLAR.Scene || typeof SOLAR.Scene.getSystemRoot !== 'function') return null;
    try { return SOLAR.Scene.getSystemRoot() || null; } catch (e) { return null; }
  }

  function setVisible(object, on) {
    if (object) object.visible = !!on;
  }

  /* 轨道线：优先调用场景接口，缺失时直接遍历行星记录 */
  function applyOrbits(on) {
    var S = SOLAR.Scene;
    if (!S) return;
    if (typeof S.setOrbitsVisible === 'function') { S.setOrbitsVisible(on); return; }
    var list = planetRecords();
    if (!list) return;
    for (var i = 0; i < list.length; i++) setVisible(list[i].orbitLine, on);
  }

  /* 拖尾：同上 */
  function applyTrails(on) {
    var S = SOLAR.Scene;
    if (!S) return;
    if (typeof S.setTrailsVisible === 'function') { S.setTrailsVisible(on); return; }
    var list = planetRecords();
    if (!list) return;
    for (var i = 0; i < list.length; i++) setVisible(list[i].trail, on);
  }

  /* 小行星带 / 柯伊伯带：场景根节点下的点云 */
  function applyBelts(on) {
    var S = SOLAR.Scene;
    if (!S) return;
    if (typeof S.setBeltsVisible === 'function') { S.setBeltsVisible(on); return; }
    var root = systemRoot();
    if (!root || !root.children) return;
    for (var i = 0; i < root.children.length; i++) {
      var child = root.children[i];
      if (child && child.isPoints === true) setVisible(child, on);
    }
  }

  /* 星空：场景根节点父级（即 scene）下的点云 */
  function applyStars(on) {
    var S = SOLAR.Scene;
    if (!S) return;
    if (typeof S.setStarfieldVisible === 'function') { S.setStarfieldVisible(on); return; }
    var root = systemRoot();
    var scene = root && root.parent ? root.parent : null;
    if (!scene || !scene.children) return;
    for (var i = 0; i < scene.children.length; i++) {
      var child = scene.children[i];
      if (child && child.isPoints === true) setVisible(child, on);
    }
  }

  function applyLabels(on) {
    var S = SOLAR.Scene;
    if (!S) return;
    if (typeof S.setLabelsVisible === 'function') { S.setLabelsVisible(on); return; }
    if (typeof S.setLabels === 'function') S.setLabels(on);
  }

  /* 扫描线 / 暗角：优先后期管线，缺失时退化为 CSS 覆盖层 */
  function applyOverlay(kind, on) {
    if (SOLAR.Effects && typeof SOLAR.Effects.setOverlay === 'function') {
      var patch = {};
      patch[kind] = !!on;
      SOLAR.Effects.setOverlay(patch);
      return;
    }
    var el = SOLAR.UIUtil.byId(kind === 'scanline' ? 'fx-scanline' : 'fx-vignette');
    if (!el) return;
    if (on) {
      el.style.display = '';
      el.style.opacity = '';
    } else {
      el.style.display = 'none';
    }
  }

  function applySetting(name) {
    var value = !!U.state.settings[name];
    if (name === 'orbits') applyOrbits(value);
    else if (name === 'trails') applyTrails(value);
    else if (name === 'belts') applyBelts(value);
    else if (name === 'stars') applyStars(value);
    else if (name === 'labels') applyLabels(value);
    else if (name === 'bloom') { if (SOLAR.Effects && SOLAR.Effects.setBloom) SOLAR.Effects.setBloom(value); }
    else if (name === 'scanline') applyOverlay('scanline', value);
    else if (name === 'vignette') applyOverlay('vignette', value);
    else if (name === 'gasFx') {
      /* 气态动效：作用待定，状态先存于 settings；场景侧接口就绪后在此接线 */
      if (SOLAR.Scene && typeof SOLAR.Scene.setGasFx === 'function') SOLAR.Scene.setGasFx(value);
    }
  }

  function applyAllSettings() {
    for (var key in U.state.switchIds) {
      if (SOLAR.UIUtil.hasOwn(U.state.switchIds, key)) applySetting(key);
    }
    setUnitSystem(U.state.unitSystem);
  }

  function refreshSwitches() {
    for (var key in U.state.switchIds) {
      if (!SOLAR.UIUtil.hasOwn(U.state.switchIds, key)) continue;
      var el = els.sw[key];
      if (!el) continue;
      el.setAttribute('aria-checked', U.state.settings[key] ? 'true' : 'false');
      var available = U.state.api[key] !== false;
      if (available) el.removeAttribute('disabled');
      else el.setAttribute('disabled', 'disabled');
      if (el.parentNode) SOLAR.UIUtil.setClass(el.parentNode, 'unavailable', !available);
    }
    if (els.settingsNote) els.settingsNote.hidden = !hasUnavailable();
  }

  function toggleSettings(force) {
    if (!els.settingsPanel) return;
    var wasOn = !els.settingsPanel.hidden;
    var on = (typeof force === 'boolean') ? force : els.settingsPanel.hidden;

    if (on && !wasOn) {
      /* 打开设置：若右侧信息栏当前可见，先记住并收起它，关闭设置时恢复。
         判定依据是「面板可见」本身而不是「正在跟随」——从列表选中但尚未
         开始跟随时（跟随徽标未出现），面板同样展开着，只按跟随判定会漏收。 */
      U.state.infoCollapsedBySettings = false;
      if (els.infoPanel && !els.infoPanel.classList.contains('collapsed')) {
        els.infoPanel.classList.add('collapsed');
        U.state.infoCollapsedBySettings = true;
      }
    } else if (!on && wasOn) {
      /* 只有由本次打开设置自动收起的栏才恢复，用户手动收起的状态不被覆盖。
         恢复前确认选中仍存在——设置打开期间取消选中时，面板已由
         showEmptyPanel 收起，这里不应再展开。 */
      if (U.state.infoCollapsedBySettings && U.state.selectedId && els.infoPanel) {
        els.infoPanel.classList.remove('collapsed');
      }
      U.state.infoCollapsedBySettings = false;
    }
    els.settingsPanel.hidden = !on;
    SOLAR.UIUtil.setClass(els.btnSettings, 'active', on);
    /* 面板打开时右信息卡左移，避免相互遮挡 */
    if (els.infoPanel) SOLAR.UIUtil.setClass(els.infoPanel, 'shifted', on);
    if (on && els.shortcuts) {
      els.shortcuts.hidden = true;
      SOLAR.UIUtil.setClass(els.btnHelp, 'active', false);
    }
  }

  function closeShortcuts() {
    if (!els.shortcuts) return;
    els.shortcuts.hidden = true;
    SOLAR.UIUtil.setClass(els.btnHelp, 'active', false);
  }

  /* 分段控件的选中态 */
  function setSegActive(group, value) {
    if (!group) return;
    var buttons = group.getElementsByTagName('button');
    for (var i = 0; i < buttons.length; i++) {
      SOLAR.UIUtil.setClass(buttons[i], 'active', buttons[i].getAttribute('data-value') === value);
    }
  }

  function setUnitSystem(unit) {
    U.state.unitSystem = (unit === 'km') ? 'km' : 'au';
    setSegActive(els.segUnit, U.state.unitSystem);
    /* 单位切换后重绘信息卡中的距离字段 */
    if (U.state.selectedId) {
      U.state.selectedRecord = SOLAR.UIUtil.findRecord(U.state.selectedId);
      if (U.state.selectedRecord) SOLAR.UIInfo.renderInfo(U.state.selectedRecord);
    }
  }

  function setLangFromSeg(lang) {
    if (lang === SOLAR.lang) {
      setSegActive(els.segLang, lang);
      return;
    }
    SOLAR.setLang(lang);
  }

  /* 显示比例：压缩示意 / 弱压缩示意（演示模式专用）。
     与教学装置的「真实比例 / 示意比例」是两套独立语义 —— 演示模式因深度缓冲精度
     限制无法使用真实比例（见 config.profiles 注释），教学装置则用真实比例，
     两者互不影响，也不再互相同步。 */
  function applyScaleMode(name) {
    if (name !== 'compact' && name !== 'faithful') return;
    setSegActive(els.segScale, name);
    try {
      var previous = (SOLAR.Scene && typeof SOLAR.Scene.getScaleMode === 'function')
        ? SOLAR.Scene.getScaleMode() : null;
      if (SOLAR.Scene && typeof SOLAR.Scene.setScaleMode === 'function') SOLAR.Scene.setScaleMode(name);
      /* 比例档改变后旧相机坐标仍属于上一套映射；沿用当前预设重新取景，
         避免切档瞬间只剩太阳或把外行星留在视野外。 */
      if (previous !== name && SOLAR.Controls && typeof SOLAR.Controls.goToPreset === 'function') {
        SOLAR.Controls.goToPreset(
          els.viewSelect && els.viewSelect.value ? els.viewSelect.value : 'home', true);
      }
    } catch (e) { }
  }

  /* 教学模式内部切换比例时回调（教学装置用自己的真实/示意两档，与演示模式解耦） */
  function setScale(name) {
    if (name !== 'real' && name !== 'iconic') return;
    setSegActive(els.segScale, name === 'real' ? 'faithful' : 'compact');
  }

  /* 加载完成后弹出「演示 / 教学」二选一；只弹一次（context restore 等路径不重复弹） */
  function showModeChoice() {
    if (U.state.modeChosen) return;
    var layer = els.modeLayer || SOLAR.UIUtil.byId('mode-layer');
    if (!layer) return;
    els.modeLayer = layer;
    layer.hidden = false;
    layer.style.display = 'flex';
  }

  function chooseMode(kind) {
    U.state.modeChosen = true;
    if (els.modeLayer) els.modeLayer.hidden = true;
    if (kind === 'teach' && SOLAR.Teach && typeof SOLAR.Teach.enter === 'function') {
      try { SOLAR.Teach.enter(); } catch (e) { }
    } else if (kind === 'demo' && SOLAR.Teach && typeof SOLAR.Teach.showEntry === 'function') {
      /* 演示模式常驻右下角"教学模式"入口 */
      try { SOLAR.Teach.showEntry(); } catch (e) { }
    }
  }

  /* 画质：顶栏下拉与设置面板分段控件双向同步 */
  function applyQuality(name) {
    if (!C.quality[name]) return;
    U.state.lastQuality = name;
    if (els.qualitySelect) els.qualitySelect.value = name;
    setSegActive(els.segQuality, name);
    /* 交给主循环统一应用：手动选档会置manualQuality，
       否则自动降级会在下一采样窗口把用户的选择（例如ULTRA）改回去。 */
    if (typeof SOLAR.setManualQuality === 'function') {
      SOLAR.setManualQuality(name);
      return;
    }
    if (SOLAR.Scene && SOLAR.Scene.setQuality) SOLAR.Scene.setQuality(name);
    if (SOLAR.Effects && SOLAR.Effects.setQuality) SOLAR.Effects.setQuality(name);
  }

  return {
    detectApi: detectApi,
    hasUnavailable: hasUnavailable,
    planetRecords: planetRecords,
    systemRoot: systemRoot,
    setVisible: setVisible,
    applyOrbits: applyOrbits,
    applyTrails: applyTrails,
    applyBelts: applyBelts,
    applyStars: applyStars,
    applyLabels: applyLabels,
    applyOverlay: applyOverlay,
    applySetting: applySetting,
    applyAllSettings: applyAllSettings,
    refreshSwitches: refreshSwitches,
    toggleSettings: toggleSettings,
    closeShortcuts: closeShortcuts,
    setSegActive: setSegActive,
    setUnitSystem: setUnitSystem,
    setLangFromSeg: setLangFromSeg,
    applyScaleMode: applyScaleMode,
    setScale: setScale,
    showModeChoice: showModeChoice,
    chooseMode: chooseMode,
    applyQuality: applyQuality
  };
})();
