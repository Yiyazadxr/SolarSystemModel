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

console.log('OK: 启动兜底与主应用握手');
