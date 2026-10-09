/**
 * 界面层：天体导航与搜索、设置面板、分组信息卡、时间控制、语言切换与加载状态
 * 依赖：config.js、data.js、i18n.js、astro.js、scene.js、controls.js、effects.js
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

SOLAR.UI = (function () {
  var C = SOLAR.CONFIG, D = SOLAR.DATA, A = SOLAR.Astro;

  var els = {};
  var initialized = false;
  var selectedId = null;
  var selectedRecord = null;

  /* 逐帧刷新的单元格（距日距离 / 真近点角），可能同时存在于多个分区 */
  var liveCells = { distance: [], phase: [] };

  /* 悬停浮标：目标位置 + 平滑插值位置 */
  var tooltipId = null;
  var tip = { id: null, x: 0, y: 0, tx: 0, ty: 0, shown: false };

  var lastClockSecond = null;
  var lastJdText = '';
  var loadingTimer = null;
  var dateHintTimer = null;
  var dateHintTransient = false;

  /* 加载进度：main.js 推送目标值，界面平滑逼近并显示阶段文案 */
  var load = { target: 0, shown: 0, stage: -1, timer: null };

  /* 信息卡分区折叠状态（按 data-sec 记忆，切换天体时保持） */
  var sectionState = {};
  var DEFAULT_OPEN = {
    overview: true, compare: true, orbit: true, physical: true,
    atmosphere: true, moons: true, discovery: true, fact: true, data: true
  };

  /* 左侧搜索 */
  var searchQuery = '';
  var searchIndex = {};

  /* 设置项：各开关的当前值与"场景是否提供对应接口"的探测结果 */
  var settings = {
    orbits: true, labels: true, trails: true, stars: true, belts: true,
    bloom: true, scanline: true, vignette: true
  };
  var api = {};
  var unitSystem = 'au';
  var switchIds = {
    orbits: 'sw-orbits', labels: 'sw-labels', trails: 'sw-trails', stars: 'sw-stars', belts: 'sw-belts',
    bloom: 'sw-bloom', scanline: 'sw-scanline', vignette: 'sw-vignette'
  };

  /* 与外部（自动降级 / 其它模块）保持同步的缓存 */
  var lastQuality = null;
  var lastCruise = null;
  var lastAlign = null;
  var lastFollowId = null;
  var lastSpeedShown = null;
  var lastEffectiveSpeedShown = null;
  var infoCollapsedBySettings = false;

  /* 响应式：窄窗口自动收起左侧导航 */
  var navAutoCollapsed = false;
  var navUserToggled = false;

  /* 行星连珠：由内向外排列，左右箭头在此序列上切换（太阳为内界，冥王星为外界） */
  var alignOrder = ['sun'].concat(D.bodies.map(function (b) { return b.id; }));
  var alignIndex = 0;

  /* ============ 基础工具 ============ */

  function byId(id) {
    return document.getElementById(id);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function setClass(el, name, on) {
    if (!el) return;
    if (on) el.classList.add(name);
    else el.classList.remove(name);
  }

  /* 判断节点是否在指定容器内（用于点击外部关闭弹层） */
  function inside(parent, node) {
    while (node) {
      if (node === parent) return true;
      node = node.parentNode;
    }
    return false;
  }

  function pad(value, size) {
    var text = String(Math.abs(value));
    while (text.length < size) text = '0' + text;
    return (value < 0 ? '−' : '') + text;
  }

  function colorCss(color) {
    var value = typeof color === 'number' ? color : C.colors.accent;
    return '#' + ('000000' + value.toString(16)).slice(-6);
  }

  function trimZeros(text) {
    return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  }

  function formatDecimal(value, decimals) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var negative = value < 0;
    var fixed = Math.abs(value).toFixed(decimals == null ? 2 : decimals);
    fixed = trimZeros(fixed);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '−' : '') + parts.join('.');
  }

  function superscript(value) {
    var map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    var text = String(value), out = '';
    for (var i = 0; i < text.length; i++) out += map[text.charAt(i)] || text.charAt(i);
    return out;
  }

  function formatScientific(value, significant) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    if (value === 0) return '0';
    var pieces = Math.abs(value).toExponential((significant || 4) - 1).split('e');
    var mantissa = trimZeros(pieces[0]);
    var exponent = parseInt(pieces[1], 10);
    return (value < 0 ? '−' : '') + mantissa + '×10' + superscript(exponent);
  }

  function formatSmart(value, decimals) {
    var abs = Math.abs(value);
    if ((abs >= 1e12) || (abs > 0 && abs < 0.0001)) return formatScientific(value, 4);
    return formatDecimal(value, decimals == null ? 2 : decimals);
  }

  function unitValue(value, unit, decimals) {
    return formatSmart(value, decimals) + (unit ? ' ' + unit : '');
  }

  function formatPeriod(days) {
    if (typeof days !== 'number') return '—';
    if (Math.abs(days) >= 730) {
      return formatDecimal(days / 365.256, 2) + ' ' + SOLAR.t('units.years');
    }
    return formatDecimal(days, Math.abs(days) < 10 ? 3 : 2) + ' ' + SOLAR.t('units.days');
  }

  function formatRotation(hours) {
    if (typeof hours !== 'number') return '—';
    if (Math.abs(hours) >= 48) {
      return formatDecimal(hours / 24, 2) + ' ' + SOLAR.t('units.days');
    }
    return formatDecimal(hours, 2) + ' ' + SOLAR.t('units.hours');
  }

  /* 距离：受设置面板中的单位偏好（AU / km）控制 */
  function formatAu(au) {
    if (unitSystem === 'km') return unitValue(au * C.astro.AU_KM, SOLAR.t('units.km'), 0);
    return unitValue(au, SOLAR.t('units.au'), 6);
  }

  function formatAuShort(au) {
    if (unitSystem === 'km') return formatDecimal(au * C.astro.AU_KM, 0) + ' ' + SOLAR.t('units.km');
    return formatDecimal(au, 2) + ' ' + SOLAR.t('units.au');
  }

  /* 固定小数位（不裁剪末尾 0），用于视星等等需要统一位数的数值 */
  function formatFixed(value, decimals) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var text = Math.abs(value).toFixed(decimals == null ? 2 : decimals);
    return (value < 0 ? '−' : '') + text;
  }

  /* 角度统一用小数显示，避免极小倾角被格式化成科学计数法 */
  function formatAngle(value, decimals) {
    return formatDecimal(value, decimals == null ? 4 : decimals) + ' ' + SOLAR.t('units.deg');
  }

  function formatDistance(au) {
    var km = au * C.astro.AU_KM;
    if (unitSystem === 'km') return formatDecimal(km, 0) + ' ' + SOLAR.t('units.km');
    var precision = Math.abs(au) < 0.01 ? 6 : 3;
    return formatDecimal(au, precision) + ' ' + SOLAR.t('units.au') + ' · ' +
      formatDecimal(km, 0) + ' ' + SOLAR.t('units.km');
  }

  function bodyCount() {
    return (D.bodies ? D.bodies.length : 0) + 1 + (D.moons ? D.moons.length : 0) + 1;
  }

  /* 数据字段可能由数据同事补充：按候选键名逐个探测，缺失返回 null */
  function pick(data, keys) {
    if (!data) return null;
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] != null) return data[keys[i]];
    }
    return null;
  }

  function numOrNull(value) {
    return (typeof value === 'number' && isFinite(value)) ? value : null;
  }

  function findRecord(id) {
    var i;
    if (id === 'sun') return { id: id, data: D.sun, type: 'star', section: 'bodies' };
    for (i = 0; i < D.bodies.length; i++) {
      if (D.bodies[i].id === id) {
        return { id: id, data: D.bodies[i], type: D.bodies[i].type, section: 'bodies' };
      }
    }
    for (i = 0; i < D.moons.length; i++) {
      if (D.moons[i].id === id) return { id: id, data: D.moons[i], type: 'moon', section: 'moons' };
    }
    for (i = 0; i < D.comets.length; i++) {
      if (D.comets[i].id === id) return { id: id, data: D.comets[i], type: 'comet', section: 'comet' };
    }
    return null;
  }

  function localizedRecord(record) {
    var dict = SOLAR.I18N[SOLAR.lang] || SOLAR.I18N.en;
    var section = dict[record.section] || {};
    var entry = section[record.id];
    if (entry) return entry;
    /* 词包缺失时退化为首字母大写的 id，避免出现原始 key */
    var id = String(record.id || '');
    return { name: id.charAt(0).toUpperCase() + id.slice(1), desc: '', fact: '' };
  }

  /* 取词：缺键时返回空串（用于 summaryKey 之类的可选文案） */
  function tOrEmpty(path) {
    var value = SOLAR.t(path);
    return (value === path) ? '' : value;
  }

  function localizedName(id) {
    var record = findRecord(id);
    return record ? localizedRecord(record).name : id;
  }

  function nameIn(id, lang) {
    var record = findRecord(id);
    if (!record) return '';
    var dict = SOLAR.I18N[lang] || {};
    var section = dict[record.section] || {};
    var entry = section[id];
    return (entry && entry.name) ? entry.name : '';
  }

  /* ============ DOM 缓存 ============ */

  function cacheDom() {
    els.bodyList = byId('body-list');
    els.infoPanel = byId('info-panel');
    els.panelEmpty = byId('panel-empty');
    els.panelBody = byId('panel-body');
    els.infoType = byId('info-type');
    els.infoName = byId('info-name');
    els.infoTags = byId('info-tags');
    els.infoDesc = byId('info-desc');
    els.infoFact = byId('info-fact');
    els.infoCompare = byId('info-compare');
    els.infoTable = byId('info-table');
    els.infoFollow = byId('info-follow');
    els.btnInfoClose = byId('btn-info-close');
    els.btnUnfollow = byId('btn-unfollow');

    /* 信息卡分区 */
    els.secOverview = byId('sec-overview');
    els.secCompare = byId('sec-compare');
    els.secOrbit = byId('sec-orbit');
    els.secPhysical = byId('sec-physical');
    els.secAtmosphere = byId('sec-atmosphere');
    els.secMoons = byId('sec-moons');
    els.secDiscovery = byId('sec-discovery');
    els.secFact = byId('sec-fact');
    els.secData = byId('sec-data');
    els.secMoonsTitle = byId('sec-title-moons');
    els.infoOrbit = byId('info-orbit');
    els.infoPhysical = byId('info-physical');
    els.infoAtmosphere = byId('info-atmosphere');
    els.infoMoons = byId('info-moons');
    els.infoMoonsNote = byId('info-moons-note');
    els.infoDiscovery = byId('info-discovery');

    /* 顶栏 */
    els.btnAlign = byId('btn-align');
    els.btnCruise = byId('btn-cruise');
    els.btnReset = byId('btn-reset');
    els.btnImmersive = byId('btn-immersive');
    els.btnSettings = byId('btn-settings');
    els.viewSelect = byId('view-select');
    els.qualitySelect = byId('quality-select');
    els.btnLang = byId('btn-lang');
    els.segScale = byId('seg-scale');
    els.modeLayer = byId('mode-layer');
    els.btnModeDemo = byId('btn-mode-demo');
    els.btnModeTeach = byId('btn-mode-teach');

    /* 设置面板 */
    els.settingsPanel = byId('settings-panel');
    els.btnSettingsClose = byId('btn-settings-close');
    els.settingsNote = byId('settings-note');
    els.segUnit = byId('seg-unit');
    els.segLang = byId('seg-lang');
    els.segQuality = byId('seg-quality');
    els.sw = {};
    for (var key in switchIds) {
      if (hasOwn(switchIds, key)) els.sw[key] = byId(switchIds[key]);
    }

    /* 左侧导航与搜索 */
    els.bodyNav = byId('body-nav');
    els.btnNavToggle = byId('btn-nav-toggle');
    els.bodySearch = byId('body-search');
    els.btnSearchClear = byId('btn-search-clear');
    els.searchEmpty = byId('search-empty');

    /* 快捷键弹层 */
    els.btnHelp = byId('btn-help');
    els.shortcuts = byId('shortcuts');

    /* 银河数据条 */
    els.gxSpeed = byId('gx-speed');
    els.gxDist = byId('gx-dist');
    els.gxYear = byId('gx-year');
    els.gxProgress = byId('gx-progress');
    els.gxHeight = byId('gx-height');
    els.gxTravel = byId('gx-travel');

    /* 时间条 */
    els.timeBar = byId('time-bar');
    els.timeDate = byId('time-date');
    els.timeClock = byId('time-clock');
    els.timeUtc = byId('time-utc');
    els.timeJd = byId('time-jd');
    els.btnReverse = byId('btn-reverse');
    els.btnPlay = byId('btn-play');
    els.btnNow = byId('btn-now');
    els.speedRange = byId('speed-range');
    els.speedValue = byId('speed-value');
    els.speedHint = byId('speed-hint');
    /* 倍速滑块的档位数跟着 config.time.speeds 走：以后加档不必再改 HTML 里的 max */
    if (els.speedRange && C.time && C.time.speeds && C.time.speeds.length) {
      els.speedRange.max = String(C.time.speeds.length - 1);
    }
    els.dateInput = byId('date-input');
    els.dateHint = byId('date-hint');
    els.btnJump = byId('btn-jump');

    /* 连珠箭头 / 浮标 / 调试 / 沉浸提示 / 加载屏 */
    els.alignPrev = byId('align-prev');
    els.alignNext = byId('align-next');
    els.tooltip = byId('tooltip');
    els.dbgFps = byId('dbg-fps');
    els.dbgTris = byId('dbg-tris');
    els.dbgBodies = byId('dbg-bodies');
    els.hud = byId('hud');
    els.immersiveHint = byId('immersive-hint');
    els.sunViewBar = byId('sun-view-bar');
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
    els.loadingScreen = byId('loading-screen');
    els.loaderFill = byId('loader-fill');
    els.loaderPct = byId('loader-pct');
    els.loaderStage = byId('loader-stage');
    els.loaderTicks = byId('loader-ticks');
  }

  /* ============ 左侧天体导航 ============ */

  function groupName(type) {
    if (SOLAR.lang === 'zh') {
      if (type === 'star') return '恒星';
      if (type === 'planet') return '行星';
      if (type === 'dwarf') return '矮行星';
      if (type === 'moon') return '卫星';
      return '彗星';
    }
    if (type === 'star') return 'STAR';
    if (type === 'planet') return 'PLANETS';
    if (type === 'dwarf') return 'DWARF';
    if (type === 'moon') return 'MOONS';
    return 'COMET';
  }

  function allBodyIds() {
    var ids = ['sun'], i;
    for (i = 0; i < D.bodies.length; i++) ids.push(D.bodies[i].id);
    for (i = 0; i < D.moons.length; i++) ids.push(D.moons[i].id);
    for (i = 0; i < D.comets.length; i++) ids.push(D.comets[i].id);
    return ids;
  }

  /* 搜索索引：id + 中英文名，全部小写，便于即时过滤 */
  function buildSearchIndex() {
    var ids = allBodyIds();
    searchIndex = {};
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      searchIndex[id] = (id + ' ' + nameIn(id, 'en') + ' ' + nameIn(id, 'zh')).toLowerCase();
    }
  }

  function buildBodyList() {
    if (!els.bodyList) return;
    els.bodyList.textContent = '';

    var planets = [], dwarfs = [];
    var i;
    for (i = 0; i < D.bodies.length; i++) {
      if (D.bodies[i].type === 'dwarf') dwarfs.push(D.bodies[i]);
      else planets.push(D.bodies[i]);
    }

    var groups = [
      { type: 'star', items: [D.sun] },
      { type: 'planet', items: planets },
      { type: 'dwarf', items: dwarfs },
      { type: 'comet', items: D.comets },
      { type: 'moon', items: D.moons }
    ];
    var number = 1;

    for (i = 0; i < groups.length; i++) {
      var group = groups[i];
      if (!group.items || !group.items.length) continue;

      var heading = document.createElement('li');
      heading.className = 'group-head';
      heading.textContent = groupName(group.type);
      els.bodyList.appendChild(heading);

      for (var j = 0; j < group.items.length; j++) {
        var data = group.items[j];
        var li = document.createElement('li');
        var dot = document.createElement('span');
        var name = document.createElement('span');
        var index = document.createElement('span');

        li.setAttribute('data-id', data.id);
        li.setAttribute('tabindex', '0');
        li.setAttribute('role', 'button');
        if (data.id === selectedId) li.className = 'active';
        dot.className = 'dot';
        dot.style.backgroundColor = colorCss(data.color);
        dot.style.color = colorCss(data.color);
        name.textContent = localizedName(data.id);
        index.className = 'idx';
        index.textContent = pad(number, 2);
        number++;

        li.appendChild(dot);
        li.appendChild(name);
        li.appendChild(index);
        bindBodyItem(li, data.id);
        els.bodyList.appendChild(li);
      }
    }

    applySearchFilter();
  }

  /* 列表项：鼠标点击 + 键盘 Enter / Space 均可触发 */
  function bindBodyItem(li, id) {
    li.addEventListener('click', function () { select(id); });
    li.addEventListener('keydown', function (event) {
      var code = event.keyCode || event.which;
      if (code === 13 || code === 32) {
        event.preventDefault();
        select(id);
      }
    });
  }

  function updateActiveItem() {
    if (!els.bodyList) return;
    var items = els.bodyList.querySelectorAll('li[data-id]');
    for (var i = 0; i < items.length; i++) {
      setClass(items[i], 'active', items[i].getAttribute('data-id') === selectedId);
    }
  }

  /* 搜索过滤：隐藏不匹配项，并隐藏空分组标题 */
  function applySearchFilter() {
    if (!els.bodyList) return null;
    var query = searchQuery.toLowerCase();
    var items = els.bodyList.querySelectorAll('li[data-id]');
    var firstId = null;
    var visible = 0;
    var i;

    for (i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-id');
      var text = searchIndex[id] || id.toLowerCase();
      var hit = !query || text.indexOf(query) >= 0;
      items[i].hidden = !hit;
      if (hit) {
        visible++;
        if (!firstId) firstId = id;
      }
    }

    var kids = els.bodyList.children;
    for (i = 0; i < kids.length; i++) {
      if (kids[i].className.indexOf('group-head') < 0) continue;
      var any = false;
      for (var m = i + 1; m < kids.length; m++) {
        if (kids[m].className.indexOf('group-head') >= 0) break;
        if (!kids[m].hidden) { any = true; break; }
      }
      kids[i].hidden = !any;
    }

    if (els.searchEmpty) els.searchEmpty.hidden = !(query && visible === 0);
    if (els.btnSearchClear) els.btnSearchClear.hidden = !query;
    return firstId;
  }

  function setSearch(query) {
    searchQuery = query || '';
    applySearchFilter();
  }

  function focusSearch() {
    if (els.bodyNav) els.bodyNav.classList.remove('collapsed');
    if (els.bodySearch) {
      els.bodySearch.focus();
      if (els.bodySearch.select) els.bodySearch.select();
    }
  }

  /* ============ 信息卡：分区折叠 ============ */

  function sectionKey(sec) {
    return sec.getAttribute('data-sec') || '';
  }

  function isOpen(sec) {
    var key = sectionKey(sec);
    if (!key) return true;
    return hasOwn(sectionState, key) ? !!sectionState[key] : DEFAULT_OPEN[key] !== false;
  }

  function applySectionState(sec) {
    if (!sec) return;
    var open = isOpen(sec);
    setClass(sec, 'open', open);
    var head = sec.querySelector('.sec-head');
    if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function applySectionStates() {
    var secs = document.querySelectorAll('.info-sec');
    for (var i = 0; i < secs.length; i++) applySectionState(secs[i]);
  }

  function toggleSection(sec) {
    var key = sectionKey(sec);
    if (!key) return;
    sectionState[key] = !isOpen(sec);
    applySectionState(sec);
  }

  function bindSections() {
    var secs = document.querySelectorAll('.info-sec');
    for (var i = 0; i < secs.length; i++) {
      bindSection(secs[i]);
    }
  }

  function bindSection(sec) {
    var head = sec.querySelector('.sec-head');
    if (!head) return;
    head.addEventListener('click', function () { toggleSection(sec); });
  }

  function setSectionHidden(section, hidden) {
    if (section) section.hidden = !!hidden;
  }

  /* ============ 信息卡：表格与分区渲染 ============ */

  function addTag(text) {
    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = text;
    els.infoTags.appendChild(tag);
  }

  /* 向指定表格追加一行；liveName 用于登记逐帧刷新单元格 */
  function addRow(table, fieldKey, value, liveName) {
    if (!table) return null;
    var row = document.createElement('tr');
    var key = document.createElement('td');
    var val = document.createElement('td');
    key.className = 'k';
    val.className = 'v';
    key.textContent = SOLAR.t('fields.' + fieldKey);
    val.textContent = value;
    if (liveName) {
      val.setAttribute('data-live', liveName);
      if (liveCells[liveName]) liveCells[liveName].push(val);
    }
    row.appendChild(key);
    row.appendChild(val);
    table.appendChild(row);
    return val;
  }

  function comparisonWidth(ratio) {
    if (!(ratio > 0)) return 0;
    return Math.max(2, Math.min(100, 50 + (Math.log(ratio) / Math.LN10) * 18));
  }

  function renderComparison(data) {
    els.infoCompare.textContent = '';
    var earth = null;
    for (var i = 0; i < D.bodies.length; i++) {
      if (D.bodies[i].id === 'earth') earth = D.bodies[i];
    }
    if (!earth) {
      setSectionHidden(els.secCompare, true);
      return;
    }

    var comparisons = [
      { key: 'diameter', value: data.radiusKm, earth: earth.radiusKm },
      { key: 'mass', value: data.massKg, earth: earth.massKg },
      { key: 'gravity', value: data.gravity, earth: earth.gravity }
    ];
    var count = 0;

    for (i = 0; i < comparisons.length; i++) {
      var item = comparisons[i];
      if (typeof item.value !== 'number' || typeof item.earth !== 'number' || item.earth === 0) continue;
      var ratio = item.value / item.earth;
      var row = document.createElement('div');
      var label = document.createElement('div');
      var title = document.createElement('span');
      var number = document.createElement('span');
      var bar = document.createElement('div');
      var fill = document.createElement('i');

      row.className = 'compare-row';
      label.className = 'label';
      title.textContent = SOLAR.t('fields.' + item.key);
      number.className = 'num';
      number.textContent = formatDecimal(ratio, ratio < 0.1 ? 3 : 2) + '×';
      bar.className = 'compare-bar';
      fill.style.width = comparisonWidth(ratio) + '%';

      label.appendChild(title);
      label.appendChild(number);
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      els.infoCompare.appendChild(row);
      count++;
    }

    setSectionHidden(els.secCompare, count === 0);
  }

  function currentDistance(record) {
    if (!record || !record.data.orbital || !SOLAR.Scene || !SOLAR.Scene.distanceAuOf) return 0;
    return SOLAR.Scene.distanceAuOf(record.id);
  }

  function currentPhase(record) {
    if (!record || !record.data.orbital) return 0;
    var angle = A.trueAnomaly(record.data.orbital, SOLAR.time.jd) * 180 / Math.PI;
    angle = ((angle % 360) + 360) % 360;
    return angle;
  }

  /* 平均轨道速度：优先读数据字段，缺失时用 2πa/P 的偏心修正近似 */
  function orbitalSpeed(data) {
    var value = numOrNull(pick(data, ['meanOrbitVelocityKms', 'orbitalSpeed', 'meanOrbitalSpeed', 'orbitalVelocity']));
    if (value != null) return value;
    if (!data.orbital) return null;
    var a = data.orbital.a;
    if (typeof a !== 'number' || !(a > 0)) return null;
    var period = (typeof data.periodDays === 'number' && data.periodDays > 0)
      ? data.periodDays
      : 365.256 * Math.pow(a, 1.5);
    var e = (typeof data.orbital.e === 'number') ? data.orbital.e : 0;
    return (2 * Math.PI * a * C.astro.AU_KM / (period * 86400)) * (1 - e * e / 4);
  }

  /* 会合周期（相对地球）：优先读数据字段，缺失时由公转周期推算 */
  function synodicDays(data, id) {
    var value = numOrNull(pick(data, ['synodicDays', 'synodicPeriod']));
    if (value != null && value > 0) return value;
    if (!data.orbital || id === 'earth') return null;
    var p = Math.abs(data.periodDays);
    if (!(p > 0)) return null;
    var diff = Math.abs(1 / p - 1 / 365.256);
    if (!(diff > 1e-9)) return null;
    return 1 / diff;
  }

  /* 轨道分区 */
  function renderOrbitSection(record) {
    var table = els.infoOrbit;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (data.orbital) {
      addRow(table, 'distance', formatDistance(currentDistance(record)), 'distance');
      rows++;
    }
    if (typeof data.periodDays === 'number') {
      addRow(table, 'orbitalPeriod', formatPeriod(data.periodDays));
      rows++;
    }
    if (typeof data.perihelionJd === 'number') {
      addRow(table, 'perihelionDate', formatUtcDateFromJd(data.perihelionJd));
      rows++;
    }
    var speed = orbitalSpeed(data);
    if (speed != null) {
      addRow(table, 'orbitalSpeed', unitValue(speed, SOLAR.t('units.vel'), 2));
      rows++;
    }
    var syn = synodicDays(data, record.id);
    if (syn != null) {
      addRow(table, 'synodic', formatPeriod(syn));
      rows++;
    }

    if (data.orbital) {
      var el = A.planetElements ? A.planetElements(data.orbital, SOLAR.time.jd) : data.orbital;
      var a = el.a, e = el.e;
      var source = A.orbitSource ? A.orbitSource(data.orbital) : 'jpl';
      addRow(table, 'orbitSource', SOLAR.t('fields.source_' + source));
      rows++;
      addRow(table, 'semiMajor', formatAu(a));
      addRow(table, 'eccentricity', formatDecimal(e, 6));
      addRow(table, 'inclination', formatAngle(el.i, 6));

      var peri = numOrNull(pick(data, ['perihelionAu', 'perihelion', 'qAu']));
      var aph = numOrNull(pick(data, ['aphelionAu', 'aphelion', 'QAu']));
      if (peri == null && typeof a === 'number' && typeof e === 'number') peri = a * (1 - e);
      if (aph == null && typeof a === 'number' && typeof e === 'number') aph = a * (1 + e);
      if (peri != null) addRow(table, 'perihelion', formatAu(peri));
      if (aph != null) addRow(table, 'aphelion', formatAu(aph));

      addRow(table, 'phaseAngle', formatAngle(currentPhase(record), 2), 'phase');
      rows += 5;
    } else if (typeof data.orbitKm === 'number') {
      /* 卫星：以宿主为中心，补充偏心与轨道倾角 */
      addRow(table, 'semiMajor', unitValue(data.orbitKm, SOLAR.t('units.km'), 0));
      if (typeof data.eccentricity === 'number') addRow(table, 'eccentricity', formatDecimal(data.eccentricity, 6));
      if (typeof data.orbitInclinationDeg === 'number') {
        addRow(table, 'inclination', formatAngle(data.orbitInclinationDeg, 3));
      }
      rows++;
    }

    if (data.barycenter && data.barycenter.outsidePrimary) {
      addRow(table, 'barycenter', SOLAR.t('fields.barycenterOutside'));
      rows++;
    }

    if (typeof data.axialTilt === 'number') {
      addRow(table, 'axialTilt', formatAngle(data.axialTilt, 4));
      rows++;
    }
    setSectionHidden(els.secOrbit, rows === 0);
  }

  /* 物理分区 */
  function renderPhysicalSection(record) {
    var table = els.infoPhysical;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (typeof data.radiusKm === 'number') {
      addRow(table, 'diameter', unitValue(data.radiusKm * 2, SOLAR.t('units.km'), 1));
      rows++;
    }
    if (typeof data.massKg === 'number') {
      addRow(table, 'mass', formatScientific(data.massKg, 4) + ' ' + SOLAR.t('units.kg'));
      rows++;
    }
    if (typeof data.density === 'number') {
      addRow(table, 'density', unitValue(data.density, SOLAR.t('units.density'), 3));
      rows++;
    }
    if (typeof data.gravity === 'number') {
      addRow(table, 'gravity', unitValue(data.gravity, SOLAR.t('units.gravity'), 3));
      rows++;
    }
    if (typeof data.escapeVel === 'number') {
      addRow(table, 'escape', unitValue(data.escapeVel, SOLAR.t('units.vel'), 2));
      rows++;
    }
    if (typeof data.tempC === 'number') {
      addRow(table, 'temp', unitValue(data.tempC, SOLAR.t('units.c'), 1));
      rows++;
    }
    if (typeof data.rotationH === 'number') {
      addRow(table, 'rotation', formatRotation(data.rotationH));
      rows++;
    }
    if (typeof data.solarDayH === 'number' && data.solarDayH > 0) {
      addRow(table, 'solarDay', formatRotation(data.solarDayH));
      rows++;
    }
    if (typeof data.moonsCount === 'number') {
      addRow(table, 'moons', formatDecimal(data.moonsCount, 0) + (SOLAR.t('units.moons') ? ' ' + SOLAR.t('units.moons') : ''));
      rows++;
    }
    if (data.ring && typeof data.ring.innerKm === 'number' && typeof data.ring.outerKm === 'number') {
      addRow(table, 'ringSpan', formatDecimal(data.ring.innerKm, 0) + ' – ' +
        formatDecimal(data.ring.outerKm, 0) + ' ' + SOLAR.t('units.km'));
      rows++;
    }
    setSectionHidden(els.secPhysical, rows === 0);
  }

  /* 大气分区 */
  function renderAtmosphereSection(record) {
    var table = els.infoAtmosphere;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (data.atmosphereKey) {
      addRow(table, 'atmosphere', SOLAR.t('atm.' + data.atmosphereKey));
      rows++;
    } else if (typeof data.atmosphere === 'string' && data.atmosphere) {
      addRow(table, 'atmosphere', data.atmosphere);
      rows++;
    }

    var pressure = numOrNull(pick(data, ['surfacePressureBar', 'surfacePressure', 'pressure', 'atmPressure']));
    if (pressure != null) {
      var unit = pick(data, ['pressureUnit', 'surfacePressureUnit']);
      if (typeof unit !== 'string' || !unit) unit = SOLAR.t('units.bar');
      addRow(table, 'pressure', unitValue(pressure, unit, pressure < 0.001 ? 6 : 3));
      rows++;
    }
    setSectionHidden(els.secAtmosphere, rows === 0);
  }

  /* 发现与观测分区（字段缺失时整块跳过） */
  function renderDiscoverySection(record) {
    var table = els.infoDiscovery;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    var albedo = numOrNull(pick(data, ['bondAlbedo', 'albedo', 'geometricAlbedo']));
    if (albedo != null) { addRow(table, 'albedo', formatDecimal(albedo, 3)); rows++; }

    /* 视星等：既支持单一数值，也支持 { brightest, faintest } 区间 */
    var magnitude = pick(data, ['apparentMagnitude', 'magnitude', 'apparentMag']);
    var magText = '';
    if (typeof magnitude === 'number' && isFinite(magnitude)) {
      magText = formatFixed(magnitude, 2);
    } else if (magnitude && typeof magnitude === 'object') {
      var bright = numOrNull(magnitude.brightest);
      var faint = numOrNull(magnitude.faintest);
      if (bright != null && faint != null && bright !== faint) {
        magText = formatFixed(bright, 2) + ' … ' + formatFixed(faint, 2);
      } else if (bright != null) {
        magText = formatFixed(bright, 2);
      } else if (faint != null) {
        magText = formatFixed(faint, 2);
      }
    }
    if (magText) { addRow(table, 'magnitude', magText); rows++; }

    var discoverer = pick(data, ['discoverer', 'discoveredBy']);
    if (typeof discoverer === 'string' && discoverer) { addRow(table, 'discoverer', discoverer); rows++; }

    var year = pick(data, ['discoveryYear', 'discoveredYear', 'discovered']);
    if (typeof year === 'number' && isFinite(year)) {
      addRow(table, 'discoveryYear', String(Math.round(year)));
      rows++;
    } else if (typeof year === 'string' && year) {
      addRow(table, 'discoveryYear', year);
      rows++;
    }

    /* 发现时代：史前已知 / 历史时期 / 不适用 */
    var era = pick(data, ['discoveryEra']);
    if (typeof era === 'string' && era) {
      addRow(table, 'discoveryEra', SOLAR.t('ui.era' + era.charAt(0).toUpperCase() + era.slice(1)));
      rows++;
    }
    setSectionHidden(els.secDiscovery, rows === 0);
  }

  /* 卫星 / 成员列表（可点击飞行） */
  function moonItemsFor(record) {
    var items = [], i;
    if (record.id === 'sun') {
      for (i = 0; i < D.bodies.length; i++) {
        var body = D.bodies[i];
        var sub = '';
        if (body.orbital && typeof body.orbital.a === 'number') sub = formatAuShort(body.orbital.a);
        if (typeof body.periodDays === 'number') {
          sub += (sub ? ' · ' : '') + formatPeriod(body.periodDays);
        }
        items.push({ id: body.id, sub: sub });
      }
      return items;
    }
    for (i = 0; i < D.moons.length; i++) {
      var moon = D.moons[i];
      if (moon.parent !== record.id) continue;
      var text = '';
      if (typeof moon.orbitKm === 'number') text = unitValue(moon.orbitKm, SOLAR.t('units.km'), 0);
      if (typeof moon.periodDays === 'number') {
        text += (text ? ' · ' : '') + formatPeriod(moon.periodDays);
      }
      items.push({ id: moon.id, sub: text });
    }
    return items;
  }

  function renderMoonsSection(record) {
    var items = moonItemsFor(record);
    if (els.secMoonsTitle) {
      els.secMoonsTitle.textContent = SOLAR.t(record.id === 'sun' ? 'ui.membersTitle' : 'ui.moonsTitle');
    }
    setSectionHidden(els.secMoons, items.length === 0);
    if (!els.infoMoons) return;
    els.infoMoons.textContent = '';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var li = document.createElement('li');
      var button = document.createElement('button');
      var name = document.createElement('span');
      var sub = document.createElement('span');

      button.type = 'button';
      button.className = 'moon-item';
      name.textContent = localizedName(item.id);
      sub.className = 'moon-sub';
      sub.textContent = item.sub;
      button.appendChild(name);
      button.appendChild(sub);
      bindMoonButton(button, item.id);

      li.appendChild(button);
      els.infoMoons.appendChild(li);
    }

    /* 已建模数量与真实数量的差异提示 */
    var note = '';
    if (record.id !== 'sun' && typeof record.data.moonsCount === 'number') {
      if (record.data.moonsCount > items.length) {
        note = SOLAR.t('ui.moonsTitle') + ' ' + formatDecimal(record.data.moonsCount, 0) +
          (SOLAR.t('units.moons') ? ' ' + SOLAR.t('units.moons') : '') +
          ' · ' + SOLAR.t('ui.modeled') + ' ' + items.length;
      }
    }
    if (els.infoMoonsNote) {
      els.infoMoonsNote.textContent = note;
      els.infoMoonsNote.hidden = !note;
    }
  }

  /* 点击卫星：选中该天体（内部会调用 Controls.flyTo 飞向它） */
  function bindMoonButton(button, id) {
    button.addEventListener('click', function () { select(id); });
  }

  /* 全部数据（兜底分区，保持原有的扁平列表） */
  function renderDataSection(record) {
    var table = els.infoTable;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (data.orbital) {
      addRow(table, 'distance', formatDistance(currentDistance(record)), 'distance');
      rows++;
    }
    if (typeof data.radiusKm === 'number') {
      addRow(table, 'diameter', unitValue(data.radiusKm * 2, SOLAR.t('units.km'), 1));
      rows++;
    }
    if (typeof data.massKg === 'number') {
      addRow(table, 'mass', formatScientific(data.massKg, 4) + ' ' + SOLAR.t('units.kg'));
      rows++;
    }
    if (typeof data.density === 'number') {
      addRow(table, 'density', unitValue(data.density, SOLAR.t('units.density'), 3));
      rows++;
    }
    if (typeof data.gravity === 'number') {
      addRow(table, 'gravity', unitValue(data.gravity, SOLAR.t('units.gravity'), 3));
      rows++;
    }
    if (typeof data.escapeVel === 'number') {
      addRow(table, 'escape', unitValue(data.escapeVel, SOLAR.t('units.vel'), 2));
      rows++;
    }
    if (typeof data.tempC === 'number') {
      addRow(table, 'temp', unitValue(data.tempC, SOLAR.t('units.c'), 1));
      rows++;
    }
    if (typeof data.rotationH === 'number') { addRow(table, 'rotation', formatRotation(data.rotationH)); rows++; }
    if (typeof data.periodDays === 'number') { addRow(table, 'orbitalPeriod', formatPeriod(data.periodDays)); rows++; }
    if (typeof data.moonsCount === 'number') {
      addRow(table, 'moons', formatDecimal(data.moonsCount, 0) + (SOLAR.t('units.moons') ? ' ' + SOLAR.t('units.moons') : ''));
      rows++;
    }
    if (data.atmosphereKey) { addRow(table, 'atmosphere', SOLAR.t('atm.' + data.atmosphereKey)); rows++; }

    if (typeof data.solarDayH === 'number' && data.solarDayH > 0) {
      addRow(table, 'solarDay', formatRotation(data.solarDayH));
      rows++;
    }
    if (data.orbital) {
      addRow(table, 'semiMajor', unitValue(data.orbital.a, SOLAR.t('units.au'), 6));
      addRow(table, 'eccentricity', formatDecimal(data.orbital.e, 6));
      addRow(table, 'inclination', formatAngle(data.orbital.i, 6));
      rows += 3;
    } else if (typeof data.orbitKm === 'number') {
      addRow(table, 'semiMajor', unitValue(data.orbitKm, SOLAR.t('units.km'), 0));
      rows++;
    }
    if (typeof data.axialTilt === 'number') {
      addRow(table, 'axialTilt', formatAngle(data.axialTilt, 4));
      rows++;
    }
    if (data.orbital) {
      addRow(table, 'phaseAngle', formatAngle(currentPhase(record), 2), 'phase');
      rows++;
    }
    setSectionHidden(els.secData, rows === 0);
  }

  function renderInfo(record) {
    if (!record || !els.panelBody) return;
    var data = record.data;
    var text = localizedRecord(record);

    els.panelEmpty.hidden = true;
    els.panelBody.hidden = false;
    if (els.infoPanel) {
      els.infoPanel.classList.remove('collapsed');
      /* 设置面板打开期间，跟随对象的信息栏保持收起，避免被重新渲染时闪回。 */
      if (infoCollapsedBySettings && els.settingsPanel && !els.settingsPanel.hidden) {
        els.infoPanel.classList.add('collapsed');
      }
    }
    els.infoType.textContent = SOLAR.t('type.' + record.type);
    els.infoName.textContent = text.name || record.id;
    /* 简介 / 冷知识：优先词包，缺失时回退到数据里的 summaryKey / factKey */
    var descText = text.desc || (data.summaryKey ? tOrEmpty(data.summaryKey) : '');
    var factText = text.fact || (data.factKey ? tOrEmpty(data.factKey) : '');
    els.infoDesc.textContent = descText;
    els.infoFact.textContent = factText;
    setSectionHidden(els.secFact, !factText);

    els.infoTags.textContent = '';
    if (typeof data.periodDays === 'number') {
      addTag(SOLAR.t('fields.orbitalPeriod') + ' ' + formatPeriod(data.periodDays));
    }
    if (typeof data.moonsCount === 'number') {
      addTag(SOLAR.t('fields.moons') + ' ' + formatDecimal(data.moonsCount, 0) + SOLAR.t('units.moons'));
    }
    if (typeof data.rotationH === 'number') {
      addTag(SOLAR.t('fields.rotation') + ' ' + formatRotation(data.rotationH));
    }
    if (data.tidallyLocked) addTag(SOLAR.t('ui.locked'));
    if (!els.infoTags.children.length && typeof data.radiusKm === 'number') {
      addTag(SOLAR.t('fields.diameter') + ' ' + unitValue(data.radiusKm * 2, SOLAR.t('units.km'), 1));
    }

    /* 示意压缩标注：如实告知"图上看到的"被压缩了多少（倍数以地球为基准，1 = 未压缩）。
       演示模式无法使用真实比例（见 config.profiles），不标注就等于误导。 */
    try {
      if (SOLAR.Scene && typeof SOLAR.Scene.getScaleCompress === 'function') {
        var comp = SOLAR.Scene.getScaleCompress(record.id);
        if (comp) {
          var parts = [];
          if (typeof comp.radius === 'number' && isFinite(comp.radius)) {
            parts.push(SOLAR.t('fields.radiusScale') + ' ×' + comp.radius);
          }
          if (typeof comp.distance === 'number' && isFinite(comp.distance)) {
            parts.push(SOLAR.t('fields.distScale') + ' ×' + comp.distance);
          }
          if (parts.length) addTag(parts.join(' · '));
        }
      }
    } catch (e2) { /* 压缩比查询失败不影响信息卡 */ }

    /* 逐帧刷新单元格登记：每次重绘前清空 */
    liveCells.distance.length = 0;
    liveCells.phase.length = 0;

    renderComparison(data);
    renderOrbitSection(record);
    renderPhysicalSection(record);
    renderAtmosphereSection(record);
    renderMoonsSection(record);
    renderDiscoverySection(record);
    renderDataSection(record);

    applySectionStates();
    refreshFollowState(true);
  }

  function showEmptyPanel() {
    selectedRecord = null;
    liveCells.distance.length = 0;
    liveCells.phase.length = 0;
    if (els.panelEmpty) els.panelEmpty.hidden = false;
    if (els.panelBody) els.panelBody.hidden = true;
    /* 未选中任何天体时整块右侧面板收起，避免遮挡画面 */
    if (els.infoPanel) els.infoPanel.classList.add('collapsed');
    if (els.infoFollow) els.infoFollow.hidden = true;
    if (els.btnUnfollow) els.btnUnfollow.hidden = true;
  }

  /* 只更新选中态与信息面板，不发起飞行（飞行由调用方自己安排） */
  function applySelection(id) {
    if (id == null) {
      selectedId = null;
      selectedRecord = null;
      if (SOLAR.Controls && SOLAR.Controls.setFollow) SOLAR.Controls.setFollow(null);
      showEmptyPanel();
      updateActiveItem();
      lastFollowId = null;
      return;
    }

    var record = findRecord(id);
    if (!record) {
      applySelection(null);
      return;
    }

    selectedId = id;
    selectedRecord = record;
    renderInfo(record);
    updateActiveItem();
  }

  function select(id) {
    if (id == null) {
      applySelection(null);
      return;
    }
    if (!findRecord(id)) {
      applySelection(null);
      return;
    }
    /* 交互选中的语义是“点击即飞”：飞行完成前先更新面板 */
    if (SOLAR.Controls && SOLAR.Controls.flyTo) {
      var demoMode = !SOLAR.Teach || !SOLAR.Teach.isActive || !SOLAR.Teach.isActive();
      SOLAR.Controls.flyTo(id,
        !!(SOLAR.Scene && SOLAR.Scene.isAligned && SOLAR.Scene.isAligned()), demoMode);
    }
    applySelection(id);
  }

  function onSelectId(id) {
    select(id);
  }

  /* 巡航切到新天体：controls 已经安排好飞行，这里只同步信息面板，
     避免走 select() 再触发一次 flyTo 把当前飞行打断重来。 */
  function onCruiseId(id) {
    applySelection(id);
  }

  /* ============ 设置面板 ============ */

  /* 能力探测：场景 / 特效是否提供了对应开关（缺失时开关置灰并在面板底部提示） */
  function detectApi() {
    var S = SOLAR.Scene || {};
    var E = SOLAR.Effects || {};
    api.orbits = (typeof S.setOrbitsVisible === 'function') || (typeof S.getPlanets === 'function');
    api.trails = (typeof S.setTrailsVisible === 'function') || (typeof S.getPlanets === 'function');
    api.labels = (typeof S.setLabelsVisible === 'function') || (typeof S.setLabels === 'function');
    api.stars = (typeof S.setStarfieldVisible === 'function') || (typeof S.getSystemRoot === 'function');
    api.belts = (typeof S.setBeltsVisible === 'function') || (typeof S.getSystemRoot === 'function');
    api.bloom = (typeof E.setBloom === 'function');
    api.scanline = (typeof E.setOverlay === 'function') || !!byId('fx-scanline');
    api.vignette = (typeof E.setOverlay === 'function') || !!byId('fx-vignette');
  }

  function hasUnavailable() {
    for (var key in switchIds) {
      if (hasOwn(switchIds, key) && api[key] === false) return true;
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
    var el = byId(kind === 'scanline' ? 'fx-scanline' : 'fx-vignette');
    if (!el) return;
    if (on) {
      el.style.display = '';
      el.style.opacity = '';
    } else {
      el.style.display = 'none';
    }
  }

  function applySetting(name) {
    var value = !!settings[name];
    if (name === 'orbits') applyOrbits(value);
    else if (name === 'trails') applyTrails(value);
    else if (name === 'belts') applyBelts(value);
    else if (name === 'stars') applyStars(value);
    else if (name === 'labels') applyLabels(value);
    else if (name === 'bloom') { if (SOLAR.Effects && SOLAR.Effects.setBloom) SOLAR.Effects.setBloom(value); }
    else if (name === 'scanline') applyOverlay('scanline', value);
    else if (name === 'vignette') applyOverlay('vignette', value);
  }

  function applyAllSettings() {
    for (var key in switchIds) {
      if (hasOwn(switchIds, key)) applySetting(key);
    }
    setUnitSystem(unitSystem);
  }

  function refreshSwitches() {
    for (var key in switchIds) {
      if (!hasOwn(switchIds, key)) continue;
      var el = els.sw[key];
      if (!el) continue;
      el.setAttribute('aria-checked', settings[key] ? 'true' : 'false');
      var available = api[key] !== false;
      if (available) el.removeAttribute('disabled');
      else el.setAttribute('disabled', 'disabled');
      if (el.parentNode) setClass(el.parentNode, 'unavailable', !available);
    }
    if (els.settingsNote) els.settingsNote.hidden = !hasUnavailable();
  }

  function toggleSettings(force) {
    if (!els.settingsPanel) return;
    var wasOn = !els.settingsPanel.hidden;
    var on = (typeof force === 'boolean') ? force : els.settingsPanel.hidden;

    if (on && !wasOn) {
      /* 跟随时打开设置：若右侧信息栏当前可见，先记住并收起它。关闭设置时恢复。 */
      infoCollapsedBySettings = false;
      var followId = (SOLAR.Controls && typeof SOLAR.Controls.getFollow === 'function')
        ? SOLAR.Controls.getFollow() : null;
      if (followId && els.infoPanel && !els.infoPanel.classList.contains('collapsed')) {
        els.infoPanel.classList.add('collapsed');
        infoCollapsedBySettings = true;
      }
    } else if (!on && wasOn) {
      /* 只有由本次打开设置自动收起的栏才恢复，用户手动收起的状态不被覆盖。 */
      var stillFollowing = (SOLAR.Controls && typeof SOLAR.Controls.getFollow === 'function')
        ? SOLAR.Controls.getFollow() : null;
      if (infoCollapsedBySettings && stillFollowing && els.infoPanel) {
        els.infoPanel.classList.remove('collapsed');
      }
      infoCollapsedBySettings = false;
    }
    els.settingsPanel.hidden = !on;
    setClass(els.btnSettings, 'active', on);
    /* 面板打开时右信息卡左移，避免相互遮挡 */
    if (els.infoPanel) setClass(els.infoPanel, 'shifted', on);
    if (on && els.shortcuts) {
      els.shortcuts.hidden = true;
      setClass(els.btnHelp, 'active', false);
    }
  }

  function closeShortcuts() {
    if (!els.shortcuts) return;
    els.shortcuts.hidden = true;
    setClass(els.btnHelp, 'active', false);
  }

  /* 分段控件的选中态 */
  function setSegActive(group, value) {
    if (!group) return;
    var buttons = group.getElementsByTagName('button');
    for (var i = 0; i < buttons.length; i++) {
      setClass(buttons[i], 'active', buttons[i].getAttribute('data-value') === value);
    }
  }

  function setUnitSystem(unit) {
    unitSystem = (unit === 'km') ? 'km' : 'au';
    setSegActive(els.segUnit, unitSystem);
    /* 单位切换后重绘信息卡中的距离字段 */
    if (selectedId) {
      selectedRecord = findRecord(selectedId);
      if (selectedRecord) renderInfo(selectedRecord);
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
  var modeChosen = false;
  function showModeChoice() {
    if (modeChosen) return;
    var layer = els.modeLayer || byId('mode-layer');
    if (!layer) return;
    els.modeLayer = layer;
    layer.hidden = false;
    layer.style.display = 'flex';
  }

  function chooseMode(kind) {
    modeChosen = true;
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
    lastQuality = name;
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
    return (SOLAR.time.reverse ? '−' : '') + formatDecimal(value, 2) +
      ' ' + unit + SOLAR.t('ui.perSec');
  }

  function refreshSpeed() {
    var speed = Math.abs(SOLAR.time.speed);
    var effective = Math.abs(typeof SOLAR.time.effectiveSpeed === 'number' ? SOLAR.time.effectiveSpeed : speed);
    if (els.speedValue) {
      els.speedValue.textContent = (SOLAR.time.reverse ? '−' : '') + formatDecimal(speed, 0) + '×';
    }
    if (els.speedHint) {
      var requested = speedHuman(SOLAR.time.speed);
      var actual = speedHuman(effective);
      els.speedHint.textContent = requested + ' · ' + SOLAR.t('ui.effective') + ' ' + actual;
    }
    setClass(els.timeBar, 'reverse', !!SOLAR.time.reverse);
    setClass(document.body, 'time-reverse', !!SOLAR.time.reverse);
    lastSpeedShown = SOLAR.time.speed;
    lastEffectiveSpeedShown = SOLAR.time.effectiveSpeed;
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
    setClass(els.btnPlay, 'active', !SOLAR.time.playing);
  }

  function togglePlay() {
    SOLAR.time.playing = !SOLAR.time.playing;
    refreshPlayButton();
  }

  function refreshAlignButton() {
    if (!els.btnAlign || !SOLAR.Scene || !SOLAR.Scene.isAligned) return;
    var on = SOLAR.Scene.isAligned();
    els.btnAlign.textContent = SOLAR.t(on ? 'ui.alignOn' : 'ui.align');
    setClass(els.btnAlign, 'active', on);
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
      var cur = alignIndexOf(selectedId);
      alignIndex = cur >= 0 ? cur : 0;
      select(alignOrder[alignIndex]);       // 相机飞向该天体的贴黄道侧视图
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
    select(alignOrder[idx]);
    refreshAlignArrows();
  }

  function refreshAlignArrows() {
    var on = SOLAR.Scene && SOLAR.Scene.isAligned && SOLAR.Scene.isAligned();
    setClass(els.alignPrev, 'disabled', !on || alignIndex <= 0);
    setClass(els.alignNext, 'disabled', !on || alignIndex >= alignOrder.length - 1);
  }

  function refreshCruiseButton() {
    if (!els.btnCruise || !SOLAR.Controls || !SOLAR.Controls.isCruising) return;
    var on = SOLAR.Controls.isCruising();
    els.btnCruise.textContent = SOLAR.t(on ? 'ui.cruiseOn' : 'ui.cruise');
    setClass(els.btnCruise, 'active', on);
  }

  function toggleCruise() {
    SOLAR.Controls.toggleCruise();
    refreshCruiseButton();
  }

  function toggleImmersive() {
    if (!els.hud) return;
    var on = !els.hud.classList.contains('immersive');
    setClass(els.hud, 'immersive', on);
    setClass(els.btnImmersive, 'active', on);
    if (els.immersiveHint) els.immersiveHint.hidden = !on;
  }

  function setNow() {
    SOLAR.time.jd = A.toJulian(new Date());
    SOLAR.time.simDays = SOLAR.time.jd - C.time.j2000;
    lastClockSecond = null;
    updateClock();
  }

  function showDateHint(key, tone) {
    if (!els.dateHint) return;
    els.dateHint.textContent = SOLAR.t(key);
    setClass(els.dateHint, 'error', tone === 'error');
    setClass(els.dateHint, 'ok', tone === 'ok');
    setClass(els.dateHint, 'warn', false);
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
    setClass(els.dateHint, 'error', status.level === 'extrapolated');
    setClass(els.dateHint, 'warn', status.level === 'long' || status.level === 'vsopOutside');
    setClass(els.dateHint, 'ok', status.level === 'short' || status.level === 'vsop');
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
    lastClockSecond = null;
    updateClock();
    showDateHint('ui.dateJumped', 'ok');
  }

  function formatJd(jd) {
    if (typeof jd !== 'number' || !isFinite(jd)) return '—';
    return jd.toFixed(4);
  }

  function formatUtcDateFromJd(jd) {
    if (typeof jd !== 'number' || !isFinite(jd)) return '—';
    var date = A.fromJulian(jd);
    if (!date || !isFinite(date.getTime())) return '—';
    return pad(date.getUTCFullYear(), 4) + '-' + pad(date.getUTCMonth() + 1, 2) + '-' +
      pad(date.getUTCDate(), 2);
  }

  function updateJd() {
    if (!els.timeJd) return;
    var text = formatJd(SOLAR.time.jd);
    if (text === lastJdText) return;
    lastJdText = text;
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
    if (second === lastClockSecond) return;
    lastClockSecond = second;
    els.timeDate.textContent = pad(date.getUTCFullYear(), 4) + '-' + pad(date.getUTCMonth() + 1, 2) + '-' +
      pad(date.getUTCDate(), 2);
    if (els.timeClock) {
      els.timeClock.textContent = pad(date.getUTCHours(), 2) + ':' +
        pad(date.getUTCMinutes(), 2) + ':' + pad(date.getUTCSeconds(), 2);
    }
  }

  /* ============ 跟随状态 ============ */

  function refreshFollowState(force) {
    var id = (SOLAR.Controls && SOLAR.Controls.getFollow) ? SOLAR.Controls.getFollow() : null;
    if (id !== lastFollowId || force) {
      lastFollowId = id;
      var on = !!id && id === selectedId;
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
      togglePlay();
    } else if (code === 38) {
      event.preventDefault();
      setSpeedIndex(speedIndex() + 1);
    } else if (code === 40) {
      event.preventDefault();
      setSpeedIndex(speedIndex() - 1);
    } else if (code === 82) {
      SOLAR.Controls.resetView();
    } else if (code === 72) {
      toggleImmersive();
    } else if (code === 83) {
      toggleSettings();
    } else if (code === 191) {
      event.preventDefault();
      focusSearch();
    } else if (code === 37) {
      if (SOLAR.Scene.isAligned()) { event.preventDefault(); alignStep(-1); }
    } else if (code === 39) {
      if (SOLAR.Scene.isAligned()) { event.preventDefault(); alignStep(1); }
    } else if (code === 27) {
      /* 先关闭弹层，再取消选择 */
      if (els.settingsPanel && !els.settingsPanel.hidden) { toggleSettings(false); return; }
      if (els.shortcuts && !els.shortcuts.hidden) { closeShortcuts(); return; }
      if (searchQuery) { setSearch(''); if (els.bodySearch) els.bodySearch.value = ''; return; }
      select(null);
    }
  }

  /* 点击弹层外部时自动收起 */
  function onDocumentPointerDown(event) {
    var target = event.target;
    if (els.settingsPanel && !els.settingsPanel.hidden &&
      !inside(els.settingsPanel, target) && target !== els.btnSettings) {
      toggleSettings(false);
    }
    if (els.shortcuts && !els.shortcuts.hidden &&
      !inside(els.shortcuts, target) && target !== els.btnHelp) {
      closeShortcuts();
    }
  }

  function bindSwitch(key, el) {
    if (!el) return;
    el.addEventListener('click', function () {
      if (api[key] === false) return;      // 场景缺少对应开关：保持置灰，不生效
      settings[key] = !settings[key];
      applySetting(key);
      refreshSwitches();
    });
  }

  function bindSegButton(el, handler) {
    if (!el) return;
    var value = el.getAttribute('data-value');
    el.addEventListener('click', function () { handler(value); });
  }

  function bindEvents() {
    if (els.btnUnfollow) els.btnUnfollow.addEventListener('click', function () { select(null); });
    if (els.btnInfoClose) els.btnInfoClose.addEventListener('click', function () { select(null); });
    if (els.btnAlign) els.btnAlign.addEventListener('click', toggleAlign);
    if (els.btnCruise) els.btnCruise.addEventListener('click', toggleCruise);
    if (els.btnReset) els.btnReset.addEventListener('click', function () { SOLAR.Controls.resetView(); });
    if (els.btnImmersive) els.btnImmersive.addEventListener('click', toggleImmersive);

    /* 行星连珠左右切换 */
    if (els.alignPrev) els.alignPrev.addEventListener('click', function () { alignStep(-1); });
    if (els.alignNext) els.alignNext.addEventListener('click', function () { alignStep(1); });

    if (els.viewSelect) {
      els.viewSelect.addEventListener('change', function () {
        SOLAR.Controls.goToPreset(els.viewSelect.value);
      });
    }

    /* 显示比例：真实 / 示意——两套模式之下都可以切换，状态全局一致 */
    if (els.segScale) {
      var scaleBtns = els.segScale.querySelectorAll('.seg-btn');
      for (var si = 0; si < scaleBtns.length; si++) bindSegButton(scaleBtns[si], applyScaleMode);
    }
    if (els.btnModeDemo) {
      els.btnModeDemo.addEventListener('click', function () { chooseMode('demo'); });
    }
    if (els.btnModeTeach) {
      els.btnModeTeach.addEventListener('click', function () { chooseMode('teach'); });
    }

    /* 左侧天体面板收起 / 展开 */
    if (els.btnNavToggle && els.bodyNav) {
      els.btnNavToggle.addEventListener('click', function () {
        navUserToggled = true;
        navAutoCollapsed = false;
        els.bodyNav.classList.toggle('collapsed');
      });
    }

    /* 搜索框：即时过滤 + 回车飞向第一个匹配项 */
    if (els.bodySearch) {
      els.bodySearch.addEventListener('input', function () { setSearch(els.bodySearch.value); });
      els.bodySearch.addEventListener('keydown', function (event) {
        var code = event.keyCode || event.which;
        if (code === 13) {
          event.preventDefault();
          var first = applySearchFilter();
          if (first) select(first);
        } else if (code === 27) {
          event.preventDefault();
          els.bodySearch.value = '';
          setSearch('');
        }
      });
    }
    if (els.btnSearchClear) {
      els.btnSearchClear.addEventListener('click', function () {
        if (els.bodySearch) { els.bodySearch.value = ''; els.bodySearch.focus(); }
        setSearch('');
      });
    }

    /* 设置面板 */
    if (els.btnSettings) els.btnSettings.addEventListener('click', function () { toggleSettings(); });
    if (els.btnSettingsClose) els.btnSettingsClose.addEventListener('click', function () { toggleSettings(false); });
    for (var key in switchIds) {
      if (hasOwn(switchIds, key)) bindSwitch(key, els.sw[key]);
    }
    bindSegButton(byId('seg-unit-au'), setUnitSystem);
    bindSegButton(byId('seg-unit-km'), setUnitSystem);
    bindSegButton(byId('seg-lang-en'), setLangFromSeg);
    bindSegButton(byId('seg-lang-zh'), setLangFromSeg);
    bindSegButton(byId('seg-q-ultra'), applyQuality);
    bindSegButton(byId('seg-q-high'), applyQuality);
    bindSegButton(byId('seg-q-medium'), applyQuality);
    bindSegButton(byId('seg-q-low'), applyQuality);

    /* 快捷键弹层 */
    if (els.btnHelp && els.shortcuts) {
      els.btnHelp.addEventListener('click', function () {
        var on = els.shortcuts.hidden;
        els.shortcuts.hidden = !on;
        setClass(els.btnHelp, 'active', on);
        if (on) toggleSettings(false);
      });
    }

    if (els.qualitySelect) {
      els.qualitySelect.addEventListener('change', function () {
        applyQuality(els.qualitySelect.value);
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
        setClass(els.btnReverse, 'active', SOLAR.time.reverse);
        refreshSpeed();
      });
    }
    if (els.btnPlay) els.btnPlay.addEventListener('click', togglePlay);
    if (els.btnNow) els.btnNow.addEventListener('click', setNow);
    if (els.speedRange) els.speedRange.addEventListener('input', function () { setSpeedIndex(els.speedRange.value); });
    if (els.btnJump) els.btnJump.addEventListener('click', jumpToDate);
    if (els.dateInput) {
      els.dateInput.addEventListener('keydown', function (event) {
        if ((event.keyCode || event.which) === 13) jumpToDate();
      });
      els.dateInput.addEventListener('input', function () {
        if (els.dateHint && els.dateHint.textContent) {
          els.dateHint.textContent = '';
          setClass(els.dateHint, 'error', false);
          setClass(els.dateHint, 'ok', false);
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
      if (!navUserToggled && !navAutoCollapsed && els.bodyNav && !els.bodyNav.classList.contains('collapsed')) {
        els.bodyNav.classList.add('collapsed');
        navAutoCollapsed = true;
      }
    } else if (navAutoCollapsed && els.bodyNav) {
      els.bodyNav.classList.remove('collapsed');
      navAutoCollapsed = false;
    }
    /* 高度不足时压缩面板上下留白（配合 CSS 媒体查询） */
    setClass(document.body, 'short', h < 720);
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
      var seg = byId(segIds[i]);
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
    setSegActive(els.segLang, SOLAR.lang);
    buildSearchIndex();
    buildBodyList();

    if (selectedId) {
      selectedRecord = findRecord(selectedId);
      if (selectedRecord) renderInfo(selectedRecord);
      else showEmptyPanel();
    } else {
      showEmptyPanel();
    }

    /* 场景内的天体标签文字随语言重建 */
    if (SOLAR.Scene && typeof SOLAR.Scene.refreshLabels === 'function') {
      try { SOLAR.Scene.refreshLabels(); } catch (e) { }
    }

    refreshPlayButton();
    refreshAlignButton();
    refreshCruiseButton();
    if (els.btnReverse) setClass(els.btnReverse, 'active', SOLAR.time.reverse);
    if (els.btnImmersive && els.hud) setClass(els.btnImmersive, 'active', els.hud.classList.contains('immersive'));
    setSpeedIndex(speedIndex());
    refreshSpeed();
    refreshSwitches();
    lastClockSecond = null;
    lastJdText = '';
    updateClock();
    updateEphemerisHint();

    if (tooltipId && els.tooltip && els.tooltip.classList.contains('show')) {
      els.tooltip.textContent = localizedName(tooltipId);
    }
  }

  function paintTooltip() {
    if (!els.tooltip) return;
    els.tooltip.style.transform = 'translate3d(' + Math.round(tip.x) + 'px,' + Math.round(tip.y) + 'px,0) ' +
      'translate(-50%,-140%)';
  }

  function showTooltip(id, x, y) {
    var record = findRecord(id);
    if (!record) {
      hideTooltip();
      return;
    }
    if (!els.tooltip) els.tooltip = byId('tooltip');
    if (!els.tooltip) return;
    tooltipId = id;
    tip.id = id;
    els.tooltip.textContent = localizedRecord(record).name;
    tip.tx = x;
    tip.ty = y;
    if (!tip.shown) {
      tip.x = x;
      tip.y = y;
      tip.shown = true;
    }
    setClass(els.tooltip, 'show', true);
    paintTooltip();
  }

  function hideTooltip() {
    tooltipId = null;
    tip.shown = false;
    if (!els.tooltip) els.tooltip = byId('tooltip');
    setClass(els.tooltip, 'show', false);
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
    if (els.loaderStage) els.loaderStage.textContent = '· ' + SOLAR.t('ui.loadStage' + stage);
    if (els.loaderTicks && els.loaderTicks.children) {
      for (var i = 0; i < els.loaderTicks.children.length; i++) {
        setClass(els.loaderTicks.children[i], 'on', i < stage);
      }
    }
  }

  function progressStep() {
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
    var screen = els.loadingScreen || byId('loading-screen');
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
        showModeChoice();
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

  /* ============ 初始化与逐帧更新 ============ */

  function init() {
    cacheDom();
    detectApi();
    if (!initialized) {
      initialized = true;
      bindEvents();
      bindSections();
      buildSearchIndex();
    }
    setSpeedIndex(speedIndex());
    if (els.dbgBodies) els.dbgBodies.textContent = formatDecimal(bodyCount(), 0);
    showEmptyPanel();
    applyLanguage();
    refreshSwitches();
    applyAllSettings();
    applyResponsive();
  }

  /* 外部（自动画质降级等）改动状态时的同步 */
  function syncExternalState() {
    if (els.qualitySelect && els.qualitySelect.value !== lastQuality) {
      lastQuality = els.qualitySelect.value;
      setSegActive(els.segQuality, lastQuality);
    }
    var cruising = (SOLAR.Controls && SOLAR.Controls.isCruising) ? SOLAR.Controls.isCruising() : null;
    if (cruising !== lastCruise) {
      lastCruise = cruising;
      refreshCruiseButton();
    }
    var aligned = (SOLAR.Scene && SOLAR.Scene.isAligned) ? SOLAR.Scene.isAligned() : null;
    if (aligned !== lastAlign) {
      lastAlign = aligned;
      refreshAlignButton();
      refreshAlignArrows();
    }
  }

  function updateLiveCells() {
    if (!selectedRecord || !selectedRecord.data.orbital) return;
    var i;
    for (i = 0; i < liveCells.distance.length; i++) {
      liveCells.distance[i].textContent = formatDistance(currentDistance(selectedRecord));
    }
    for (i = 0; i < liveCells.phase.length; i++) {
      liveCells.phase[i].textContent = formatAngle(currentPhase(selectedRecord), 2);
    }
  }

  function tick(fps, tris) {
    if (!initialized) return;
    updateClock();

    /* 倍速可能被外部或时间跳转逻辑直接改写 SOLAR.time.speed，
       这里用变化检测兜底同步读数与滑块，避免显示与实际不一致（只在变化时写 DOM）。 */
    if (SOLAR.time && (SOLAR.time.speed !== lastSpeedShown ||
        SOLAR.time.effectiveSpeed !== lastEffectiveSpeedShown)) refreshSpeed();

    if (els.dbgFps) els.dbgFps.textContent = typeof fps === 'number' && isFinite(fps) ? fps.toFixed(1) : '0';
    if (els.dbgTris) els.dbgTris.textContent = formatDecimal(typeof tris === 'number' ? tris : 0, 0);
    if (els.dbgBodies) els.dbgBodies.textContent = formatDecimal(bodyCount(), 0);

    updateLiveCells();
    syncExternalState();
    refreshFollowState(false);
    updateTooltipPosition();

    /* 银河公转读数 */
    if (SOLAR.Galaxy && els.gxProgress) {
      var gi = SOLAR.Galaxy.getInfo();
      els.gxSpeed.textContent = formatDecimal(gi.speedKms, 0) + ' km/s';
      els.gxDist.textContent = formatDecimal(gi.distanceLy, 0) + ' ly';
      els.gxYear.textContent = formatDecimal(gi.yearMyr, 0) + ' Myr';
      els.gxProgress.textContent = gi.progress.toFixed(1) + '%';
      if (els.gxHeight) {
        var h = typeof gi.planeHeightLy === 'number' ? gi.planeHeightLy : 0;
        els.gxHeight.textContent = (h >= 0 ? '+' : '−') + formatDecimal(Math.abs(h), 0) + ' ly';
      }
      els.gxTravel.textContent = formatDecimal(gi.travelledLy, 0) + ' ly';
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
      els.dbgTris.textContent = formatDecimal(stats.triangles, 0);
    }
  }

  return {
    init: init,
    tick: tick,
    select: select,
    onSelectId: onSelectId,
    onCruiseId: onCruiseId,
    applyLanguage: applyLanguage,
    showTooltip: showTooltip,
    hideTooltip: hideTooltip,
    setProgress: setProgress,
    hideLoading: hideLoading,
    setQuality: setQuality,
    setScale: setScale,
    showModeChoice: showModeChoice,
    setStats: setStats
  };
})();
