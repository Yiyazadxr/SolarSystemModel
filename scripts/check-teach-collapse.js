#!/usr/bin/env node
/* 回归验证：左侧目录面板收起后，画面上只允许存在一层控件。
   要防的两种错误形态：
     1. 面板容器还在（透明或玻璃底），按钮嵌在里面 → 两层盒子；
     2. 收起后没有独立的恢复入口，用户再也打不开目录。
   约定（与右下角信息窗收成 —/+ 同构）：
     折叠 → 面板整体隐藏 + 一枚独立浮动钮 #teach-panel-open 显示；
     展开 → 反之。二者同一时刻只能有一个在画面上。 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || __dirname + '/..';

/* ---------- 最小 DOM 桩：只实现 teach.js 真正用到的子集 ---------- */
function makeNode(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    id: '',
    textContent: '',
    title: '',
    type: '',
    value: '',
    style: {},
    children: [],
    attrs: {},
    listeners: {},
    hidden: false
  };
  node.classList = {
    add: function (c) { node.className = node.className.split(/\s+/).filter(Boolean).concat([c]).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' '); },
    remove: function (c) { node.className = node.className.split(/\s+/).filter(function (v) { return v && v !== c; }).join(' '); },
    contains: function (c) { return node.className.split(/\s+/).indexOf(c) >= 0; },
    toggle: function (c, force) {
      var on = force === undefined ? !node.classList.contains(c) : !!force;
      if (on) node.classList.add(c); else node.classList.remove(c);
      return on;
    }
  };
  node.appendChild = function (child) { node.children.push(child); return child; };
  node.addEventListener = function (type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn); };
  node.removeEventListener = function () { };
  node.setAttribute = function (k, v) { node.attrs[k] = String(v); };
  node.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null; };
  node.querySelectorAll = function (selector) {
    const cls = selector.replace(/^\./, '');
    const out = [];
    (function walk(n) {
      for (let i = 0; i < n.children.length; i++) {
        const c = n.children[i];
        if (c.classList && c.classList.contains(cls)) out.push(c);
        walk(c);
      }
    })(node);
    return out;
  };
  /* 测试专用：触发某类事件 */
  node.fire = function (type, event) {
    const list = node.listeners[type] || [];
    for (let i = 0; i < list.length; i++) list[i](event || { preventDefault: function () { }, stopPropagation: function () { } });
  };
  return node;
}

function boot() {
  const byId = {};
  const body = makeNode('body');
  const documentStub = {
    hidden: false,
    body: body,
    createElement: function (tag) {
      const node = makeNode(tag);
      /* id 多数是后赋的（node.id = '...'）：拦住写入以便 getElementById 反查 */
      let id = '';
      Object.defineProperty(node, 'id', {
        get: function () { return id; },
        set: function (v) { id = v; byId[v] = node; },
        enumerable: true,
        configurable: true
      });
      return node;
    },
    getElementById: function (id) {
      return Object.prototype.hasOwnProperty.call(byId, id) ? byId[id] : null;
    },
    /* teach.js 的 icon() 用 createElementNS 建内联 SVG */
    createElementNS: function (ns, tag) { return makeNode(tag); },
    addEventListener: function () { },
    removeEventListener: function () { }
  };
  /* 浏览器里 window 即全局对象：bare SOLAR / THREE 都靠它解析 */
  const sandbox = { console: console };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = documentStub;
  sandbox.requestAnimationFrame = function () { return 1; };
  sandbox.cancelAnimationFrame = function () { };
  sandbox.addEventListener = function () { };
  sandbox.removeEventListener = function () { };
  sandbox.innerWidth = 1280;
  sandbox.innerHeight = 800;
  vm.createContext(sandbox);

  const run = function (rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  };
  /* 用真 three：moveCamera 会 new THREE.Vector3 取景。
     i18n 也要真加载：teach.js 的 DOM 文案走 SOLAR.t，沙箱里没有它就是
     "SOLAR.t is not a function"（不模拟词包的话，构建 DOM 直接抛在教学 init 上）。 */
  run('assets/vendor/three.min.js');
  run('assets/js/i18n.js');
  run('assets/js/teach-data.js');
  run('assets/js/teach.js');

  sandbox.SOLAR.Scene = {
    /* 返回带 parent 的桩：init/enter 会走 getSystemRoot().parent 取场景根 */
    getSystemRoot: function () { return { parent: { add: function () { } } }; },
    getCamera: function () { return null; },
    setSolarSystemVisible: function () { },
    isSolarSystemVisible: function () { return true; },
    getQuality: function () { return 'high'; },
    getScaleMode: function () { return 'compact'; }
  };
  sandbox.SOLAR.TeachScenes = {
    init: function () { return true; },
    isReady: function () { return true; },
    applyState: function () { },
    apply: function () { },
    hide: function () { },
    update: function () { },
    getScale: function () { return 'real'; }
  };
  sandbox.SOLAR.Controls = {
    getControls: function () { return null; },
    goToView: function () { },
    goToPreset: function () { },
    setFollow: function () { },
    setCruise: function () { },
    cancelFlight: function () { },
    resetView: function () { }
  };
  sandbox.SOLAR.Galaxy = { setVisible: function () { }, isVisible: function () { return true; } };
  sandbox.SOLAR.Audio = { play: function () { } };
  sandbox.SOLAR.time = { playing: true, jd: 0, simDays: 0, speed: 1 };
  sandbox.SOLAR.setAutoDegrade = function () { };
  sandbox.SOLAR.setManualQuality = function () { };
  sandbox.SOLAR.isAutoDegrade = function () { return true; };
  return { SOLAR: sandbox.SOLAR, byId: byId };
}

const app = boot();
const T = app.SOLAR.Teach;
assert.strictEqual(T.init(), true, 'Teach.init 失败');
assert.ok(app.SOLAR.TEACH_DATA, 'TEACH_DATA 未加载');

const panel = app.byId['teach-panel'];
const panelOpen = app.byId['teach-panel-open'];
const toggle = app.byId['teach-panel-toggle'];

/* ---- 结构：必须有一枚独立浮动恢复钮，且与信息窗 —/+ 同款类名 ---- */
assert.ok(panel, '#teach-panel 不存在');
assert.ok(panelOpen, '缺少 #teach-panel-open（收起态会只剩一个打不开的面板）');
assert.ok(toggle, '缺少 #teach-panel-toggle');
['teach-btn', 'teach-icon'].forEach(function (c) {
  assert.ok(panelOpen.classList.contains(c), '#teach-panel-open 缺少类 ' + c + '（拿不到 44px 玻璃方块样式）');
});
assert.ok(panelOpen.classList.contains('is-hidden'), '初始态 #teach-panel-open 应隐藏');
assert.ok(panel.classList.contains('is-hidden'), '初始态 #teach-panel 应隐藏');
console.log('OK  结构：面板 + 独立恢复钮均在，类名与 —/+ 同源');

/* ---- 图标按钮内部必须是 SVG，不能是文字字形 ---- */
/* 字形（‹ › — +）随字体度量漂移，按钮里普遍不居中；SVG 走 viewBox + 对称坐标。 */
['teach-panel-toggle', 'teach-panel-open', 'teach-info-toggle', 'teach-info-open'].forEach(function (id) {
  const btn = app.byId[id];
  assert.ok(btn, '#' + id + ' 不存在');
  assert.strictEqual(btn.textContent, '', '#' + id + ' 仍留着文字字形（各字体度量不一，按钮内不居中）');
  assert.strictEqual(btn.children.length, 1, '#' + id + ' 内部应恰有一枚 SVG');
  assert.strictEqual(btn.children[0].tagName.toUpperCase(), 'SVG', '#' + id + ' 内部不是 SVG');
  assert.strictEqual(btn.children[0].getAttribute('viewBox'), '0 0 24 24', '#' + id + ' 的 SVG 缺少 viewBox');
  assert.strictEqual(btn.children[0].children.length, 1, '#' + id + ' 的 SVG 应只有一个 path');
});
console.log('OK  四枚图标按钮内部均为内联 SVG（无文字字形）');

/* ---- 进入教学：面板显示、恢复钮隐藏 ---- */
T.enter();
assert.ok(!panel.classList.contains('is-hidden'), '进入教学后面板应显示');
assert.ok(panelOpen.classList.contains('is-hidden'), '进入教学后恢复钮应隐藏');
console.log('OK  进入教学：面板展开');

/* ---- 点折叠：面板整体隐藏，只剩恢复钮 ---- */
toggle.fire('click');
assert.ok(panel.classList.contains('is-hidden'), '折叠后面板必须整体隐藏（不允许透明容器留着）');
assert.ok(!panelOpen.classList.contains('is-hidden'), '折叠后必须留下独立恢复钮');
assert.strictEqual(
  panel.classList.contains('is-hidden') === panelOpen.classList.contains('is-hidden'),
  false,
  '折叠态出现两层控件：面板与恢复钮同时显示或同时隐藏'
);
console.log('OK  折叠：只剩一枚浮动按钮');

/* ---- 点恢复钮：回到展开态 ---- */
panelOpen.fire('click');
assert.ok(!panel.classList.contains('is-hidden'), '点恢复钮后面板应展开');
assert.ok(panelOpen.classList.contains('is-hidden'), '展开后恢复钮应隐藏');
console.log('OK  展开：面板回来，恢复钮收起');

/* ---- 退出教学：两个都不留 ---- */
T.exit();
assert.ok(panel.classList.contains('is-hidden'), '退出教学后面板应隐藏');
assert.ok(panelOpen.classList.contains('is-hidden'), '退出教学后恢复钮应隐藏');
console.log('OK  退出教学：两个控件都收起');

console.log('PASS: 目录面板折叠回归（收起后只留一枚独立按钮）');
