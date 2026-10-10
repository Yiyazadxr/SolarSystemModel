/**
 * 界面层共享宿主：跨模块的 DOM 缓存表与可变状态。
 * 必须第一个加载：后续 ui-util / ui-dom / ui-nav / ui-info / ui-settings /
 * ui-time / ui-shell 都从这里取共享对象，ui.js 门面最后往里挂公开 API。
 * 依赖：无
 */
window.SOLAR = window.SOLAR || {};

/* 门面先建空对象：controls.js / i18n.js / main.js 在 ui.js 执行前就可能探测 SOLAR.UI，
   这里先占位，ui.js 再往同一对象上挂键（键名与原 ui.js 的公开 API 完全一致）。 */
SOLAR.UI = {};

/* dom 由 ui-dom.js 的 cacheDom() 填充；state 里的字段是被多个界面子模块
   读写的可变状态（选中天体、设置值、单位、各类缓存与开关）。 */
SOLAR.UIShared = {
  dom: {},
  state: {
    selectedId: null,
    selectedRecord: null,

    /* 逐帧刷新的单元格（距日距离 / 真近点角），可能同时存在于多个分区 */
    liveCells: { distance: [], phase: [] },

    /* 设置项：各开关的当前值与"场景是否提供对应接口"的探测结果 */
    settings: {
      orbits: true, labels: true, trails: true, stars: true, belts: true,
      bloom: true, scanline: true, vignette: true, gasFx: true
    },
    api: {},
    unitSystem: 'au',
    switchIds: {
      orbits: 'sw-orbits', labels: 'sw-labels', trails: 'sw-trails', stars: 'sw-stars', belts: 'sw-belts',
      bloom: 'sw-bloom', scanline: 'sw-scanline', vignette: 'sw-vignette', gasFx: 'sw-gasfx'
    },
    infoCollapsedBySettings: false,
    lastFollowId: null,
    lastSpeedShown: null,
    lastEffectiveSpeedShown: null,
    /* 时钟 / JD 文本的变化检测缓存：ui-time 写入，ui-shell 的 applyLanguage 清零 */
    lastClockSecond: null,
    lastJdText: '',
    /* 画质下拉与设置面板分段控件的同步缓存：ui-settings 与门面 syncExternalState 共用 */
    lastQuality: null,
    /* 左侧搜索关键词：ui-nav 维护，ui-shell 的快捷键 Esc 需要读取 */
    searchQuery: '',
    initialized: false,
    navAutoCollapsed: false,
    navUserToggled: false,
    modeChosen: false
  }
};
