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
      bloom: true, scanline: true, vignette: true, gasFx: true,
      hudFx: true,                     /* 界面动效总开关：默认开启，不随系统减弱动效偏好 */
      sound: true                        /* 音效默认开启，可随时在设置面板关掉 */
    },
    api: {},
    unitSystem: 'au',
    switchIds: {
      orbits: 'sw-orbits', labels: 'sw-labels', trails: 'sw-trails', stars: 'sw-stars', belts: 'sw-belts',
      bloom: 'sw-bloom', scanline: 'sw-scanline', vignette: 'sw-vignette', gasFx: 'sw-gasfx',
      hudFx: 'sw-hudfx',
      sound: 'sw-sound'
    },
    infoCollapsedBySettings: false,
    lastFollowId: null,
    lastSpeedShown: null,
    /* 倍速读数的补间目标（含倒流符号）：目标没变就不重启滚动——tick 因
       effectiveSpeed 每帧变化都会调 refreshSpeed，无脑重开补间会让读数
       永远停在起点、还和即时落值抢写 textContent */
    lastSpeedTarget: null,
    lastEffectiveSpeedShown: null,
    /* 倍速提示串（含 effective 文案）的变化检测缓存：ui-time 写入，applyLanguage 清零 */
    lastSpeedHintShown: null,
    /* 时钟 / JD 文本的变化检测缓存：ui-time 写入，ui-shell 的 applyLanguage 清零 */
    lastClockSecond: null,
    lastJdText: '',
    /* 星历提示的变化检测缓存：level 不变就不重写 DOM（applyLanguage 时清零换语言文案） */
    lastEphemerisKey: null,
    /* 左侧搜索关键词：ui-nav 维护，ui-shell 的快捷键 Esc 需要读取 */
    searchQuery: '',
    initialized: false,
    navAutoCollapsed: false,
    navUserToggled: false,
    modeChosen: false
  }
};
