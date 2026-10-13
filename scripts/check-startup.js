#!/usr/bin/env node
/* 加载页兜底契约：早期异常、资源失败、超时和主应用握手。 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const marker = '<!-- ============ 依赖（全部本地化） ============ -->';
const start = html.indexOf('<script>', html.indexOf(marker));
const end = html.indexOf('</script>', start);
assert(start >= 0 && end > start, '缺少依赖前的启动兜底脚本');
const source = html.slice(start + '<script>'.length, end);

function boot() {
  let timer = null;
  let onResourceError = null;
  let onVisibilityChange = null;
  const tip = { textContent: '' };
  const pct = { textContent: '0%' };
  const screen = {
    style: { display: '' },
    classList: { remove: function (name) { this.removed = name; } },
    querySelector: function () { return tip; }
  };
  const mode = { hidden: false, style: { display: '' } };
  const elements = { 'loading-screen': screen, 'loader-pct': pct, 'mode-layer': mode };
  const window = {
    setTimeout: function (fn, delay) { timer = { fn: fn, delay: delay, active: true }; return timer; },
    clearTimeout: function (id) { id.active = false; },
    addEventListener: function (type, fn) { if (type === 'error') onResourceError = fn; },
    console: { error: function () {} }
  };
  const document = {
    hidden: false,
    getElementById: function (id) { return elements[id]; },
    addEventListener: function (type, fn) { if (type === 'visibilitychange') onVisibilityChange = fn; }
  };
  vm.runInNewContext(source, { window: window, document: document });
  return { window: window, document: document, getTimer: function () { return timer; }, visibilityChange: function () { onVisibilityChange(); }, resourceError: onResourceError, tip: tip, pct: pct, screen: screen, mode: mode };
}

let app = boot();
assert.strictEqual(app.getTimer().delay, 15000);
app.window.onerror('early IIFE failed');
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), true);
assert.strictEqual(app.pct.textContent, 'ERROR');
assert.strictEqual(app.screen.style.display, 'flex');
assert.strictEqual(app.mode.hidden, true);
const firstMessage = app.tip.textContent;
app.window.SOLAR_BOOT.fail('second failure');
assert.strictEqual(app.tip.textContent, firstMessage, '首个故障提示应保持稳定');

app = boot();
app.resourceError({ target: { tagName: 'SCRIPT' } });
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), true);

app = boot();
app.resourceError({ target: { tagName: 'SCRIPT', hasAttribute: function (name) {
  return name === 'data-solar-texture-chunk';
} } });
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), false, '分块脚本加载失败应由贴图加载器处理');

app = boot();
app.getTimer().fn();
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), true);
assert(app.tip.textContent.indexOf('超时') >= 0);

app = boot();
app.document.hidden = true;
app.visibilityChange();
assert.strictEqual(app.getTimer().active, false, '隐藏标签页应暂停超时');
app.document.hidden = false;
app.visibilityChange();
assert.strictEqual(app.getTimer().active, true, '恢复前台应重新计时');
assert.strictEqual(app.getTimer().delay, 15000);
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), false);
app.getTimer().fn();
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), true);

app = boot();
app.document.hidden = true;
app.getTimer().fn();
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), false);
app.document.hidden = false;
app.visibilityChange();
app.getTimer().fn();
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), true);

app = boot();
app.window.SOLAR_BOOT.ready();
assert.strictEqual(app.getTimer().active, false);
app.window.onerror('late error');
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), false);
app.window.SOLAR_BOOT.fail('explicit fatal error');
assert.strictEqual(app.window.SOLAR_BOOT.isFailed(), true);

const main = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'main.js'), 'utf8');
assert(/hideLoading\(function\s*\(\)\s*\{\s*loadingHidden\s*=\s*true;\s*confirmReady\(\)/.test(main), '加载层隐藏后需握手');
assert(/firstFrameRendered\s*=\s*true;\s*confirmReady\(\)/.test(main), '首帧渲染后需握手');
assert(/loadingHidden\s*&&\s*firstFrameRendered\s*&&\s*window\.SOLAR_BOOT/.test(main), '握手需同时满足加载层与首帧');

function textureLoader(chunks) {
  const scripts = [];
  const images = [];
  const timers = [];
  const solar = { TEXTURES: {}, TEXTURE_MANIFEST: {
    chunks: chunks, totalBytes: chunks.reduce(function (sum, chunk) { return sum + chunk.bytes; }, 0)
  } };
  const window = {
    SOLAR: solar,
    setTimeout: function (fn, ms) { const timer = { fn: fn, ms: ms, active: true }; timers.push(timer); return timer; },
    clearTimeout: function (timer) { timer.active = false; },
    console: { error: function () {} }
  };
  const document = {
    createElement: function () { return {
      tagName: 'SCRIPT',
      setAttribute: function (key) { this.marker = key; },
      hasAttribute: function (key) { return this.marker === key; }
    }; },
    head: { appendChild: function (script) { scripts.push(script); } }
  };
  function Image() { images.push(this); }
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'textures-loader.js'), 'utf8');
  vm.runInNewContext(source, { window: window, document: document, Image: Image, SOLAR: solar, console: window.console });
  return { solar: solar, scripts: scripts, images: images, timers: timers };
}

let loader = textureLoader([{ file: 'core', bytes: 4 }, { file: 'outer', bytes: 4 }]);
let results = [];
loader.solar.TextureLoader.loadAll(null, function (result) { results.push(result); });
assert.strictEqual(loader.scripts[0].hasAttribute('data-solar-texture-chunk'), true);
loader.scripts[0].onerror();
assert.strictEqual(loader.scripts.length, 2, '首块失败后仍须请求下一块');
loader.solar.TEXTURES.earth = 'data';
loader.scripts[1].onload();
loader.images[0].onload();
assert.strictEqual(results.length, 1);
assert.strictEqual(results[0].ok, true);
assert.strictEqual(results[0].failed.join(','), 'core');

loader = textureLoader([{ file: 'core', bytes: 4 }]);
results = [];
loader.solar.TextureLoader.loadAll(null, function (result) { results.push(result); });
loader.solar.TEXTURES.earth = 'data';
loader.scripts[0].onload();
assert.strictEqual(results.length, 0, '预热未完成时不能报告加载成功');
const prewarmTimer = loader.timers.filter(function (timer) { return timer.active; })[0];
prewarmTimer.fn();
assert.strictEqual(results.length, 1, '预热超时应结算');
assert.strictEqual(results[0].ok, false);
loader.images[0].onload();
assert.strictEqual(results.length, 1, '迟到的图片回调不能重复结算');

console.log('OK: 启动兜底与主应用握手');
