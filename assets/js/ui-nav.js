/**
 * 界面层：左侧天体导航与搜索、信息卡分区折叠。
 * 选中与飞行通过 SOLAR.UIInfo.select 触发；格式化取自 SOLAR.UIUtil。
 * 依赖：data.js、SOLAR.UIShared、SOLAR.UIUtil、SOLAR.UIInfo
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UINav = (function () {
  'use strict';

  var D = SOLAR.DATA;
  var U = SOLAR.UIShared;
  var els = U.dom;

  /* 左侧搜索（关键词 searchQuery 存放在 SOLAR.UIShared.state：快捷键 Esc 也要读它） */
  var searchIndex = {};

  /* 信息卡分区折叠状态（按 data-sec 记忆，切换天体时保持） */
  var sectionState = {};
  var DEFAULT_OPEN = {
    overview: true, compare: true, orbit: true, physical: true,
    atmosphere: true, moons: true, discovery: true, fact: true, data: true
  };

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
      searchIndex[id] = (id + ' ' + SOLAR.UIUtil.nameIn(id, 'en') + ' ' + SOLAR.UIUtil.nameIn(id, 'zh')).toLowerCase();
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
        if (data.id === U.state.selectedId) li.className = 'active';
        dot.className = 'dot';
        dot.style.backgroundColor = SOLAR.UIUtil.colorCss(data.color);
        dot.style.color = SOLAR.UIUtil.colorCss(data.color);
        name.textContent = SOLAR.UIUtil.localizedName(data.id);
        index.className = 'idx';
        index.textContent = SOLAR.UIUtil.pad(number, 2);
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
    li.addEventListener('click', function () { SOLAR.UIInfo.select(id); });
    li.addEventListener('keydown', function (event) {
      var code = event.keyCode || event.which;
      if (code === 13 || code === 32) {
        event.preventDefault();
        SOLAR.UIInfo.select(id);
      }
    });
  }

  function updateActiveItem() {
    if (!els.bodyList) return;
    var items = els.bodyList.querySelectorAll('li[data-id]');
    for (var i = 0; i < items.length; i++) {
      SOLAR.UIUtil.setClass(items[i], 'active', items[i].getAttribute('data-id') === U.state.selectedId);
    }
  }

  /* 搜索过滤：隐藏不匹配项，并隐藏空分组标题 */
  function applySearchFilter() {
    if (!els.bodyList) return null;
    var query = U.state.searchQuery.toLowerCase();
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
    U.state.searchQuery = query || '';
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
    return SOLAR.UIUtil.hasOwn(sectionState, key) ? !!sectionState[key] : DEFAULT_OPEN[key] !== false;
  }

  function applySectionState(sec) {
    if (!sec) return;
    var open = isOpen(sec);
    SOLAR.UIUtil.setClass(sec, 'open', open);
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

  return {
    groupName: groupName,
    allBodyIds: allBodyIds,
    buildSearchIndex: buildSearchIndex,
    buildBodyList: buildBodyList,
    bindBodyItem: bindBodyItem,
    updateActiveItem: updateActiveItem,
    applySearchFilter: applySearchFilter,
    setSearch: setSearch,
    focusSearch: focusSearch,
    sectionKey: sectionKey,
    isOpen: isOpen,
    applySectionState: applySectionState,
    applySectionStates: applySectionStates,
    toggleSection: toggleSection,
    bindSections: bindSections,
    bindSection: bindSection,
    setSectionHidden: setSectionHidden
  };
})();
