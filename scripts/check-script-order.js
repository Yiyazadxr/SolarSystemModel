#!/usr/bin/env node
/* check-script-order.js — 零依赖：校验 index.html 中 <script src> 加载顺序
 * 规则：
 *  1. vendor 脚本必须在前（three.min.js 是根依赖）
 *  2. 自定义脚本顺序需与 EXPECTED_ORDER 一致
 *  3. 依赖方向：config → data → i18n → audio（叶子，无依赖）
 *     → vsop87 → astro → textures → effects
 *     → scene-* → galaxy → controls → ui-* → main
 *     → teach-data → teach-globe-* → teach-orrery → teach-scenes → teach
 *     同一层内（scene / ui / teach-globe）先共享与叶子模块，门面（无前缀的那个）最后。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const EXPECTED_VENDOR = [
  'three.min.js', 'OrbitControls.js', 'CopyShader.js', 'LuminosityHighPassShader.js',
  'EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'MaskPass.js',
  'UnrealBloomPass.js', 'FXAAShader.js'
];

const EXPECTED_ORDER = [
  'config.js',
  'data.js',
  'i18n.js',
  'audio.js',
  'vsop87.js',
  'astro.js',
  'textures.js',
  'effects.js',
  'scene-shaders.js',
  'scene-shared.js',
  'scene-gfx.js',
  'scene-sun.js',
  'scene-bodies.js',
  'scene-backdrop.js',
  'scene.js',
  'galaxy.js',
  'controls.js',
  'ui-shared.js',
  'ui-util.js',
  'ui-dom.js',
  'ui-nav.js',
  'ui-info.js',
  'ui-settings.js',
  'ui-time.js',
  'ui-shell.js',
  'ui.js',
  'main.js',
  'teach-data.js',
  'teach-globe-shared.js',
  'teach-globe-shaders.js',
  'teach-globe-body.js',
  'teach-globe-scenes.js',
  'teach-globe-apply.js',
  'teach-globe.js',
  'teach-orrery.js',
  'teach-ground.js',
  'teach-moonsync.js',
  'teach-scenes.js',
  'teach.js',
];

function extractScripts(html) {
  const out = [];
  const re = /<script\s+src=["']([^"']+)["'][^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function main() {
  const html = fs.readFileSync(HTML, 'utf8');
  const srcs = extractScripts(html);
  const vendorSrcs = srcs.filter(s => s.indexOf('assets/vendor/') === 0);
  const appSrcs = srcs.filter(s => s.indexOf('assets/js/') === 0).map(s => s.split('/').pop());

  console.log('=== Vendor scripts (' + vendorSrcs.length + ') ===');
  vendorSrcs.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s));

  console.log('\n=== App scripts (' + appSrcs.length + ') ===');
  appSrcs.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s));

  const threeOk = vendorSrcs[0] && vendorSrcs[0].indexOf('three.min.js') >= 0;
  if (!threeOk) {
    console.log('\nERR: three.min.js 未在 vendor 首位，OrbitControls 等插件依赖它。');
  }

  const issues = [];
  const expectedSrcs = EXPECTED_VENDOR.map(f => 'assets/vendor/' + f)
    .concat(EXPECTED_ORDER.map(f => 'assets/js/' + f));
  if (srcs.length !== expectedSrcs.length) issues.push('  count: 期望 ' + expectedSrcs.length + ' 个脚本，实际 ' + srcs.length + ' 个');
  for (let i = 0; i < Math.max(srcs.length, expectedSrcs.length); i++) {
    if (srcs[i] !== expectedSrcs[i]) {
      issues.push('  full slot ' + (i + 1) + ': 期望 ' + (expectedSrcs[i] || '(无)') + '，实际 ' + (srcs[i] || '(无)'));
    }
  }
  /* 数量必须一致：少一个槽位会让下面的逐项对比退化成"前缀匹配"，
     多一个则多出的脚本完全不参与对比，两种情况都会静默放过错序
     （html 少引一个脚本时连 WARN 都不打，直接 OK 通过）。 */
  if (appSrcs.length !== EXPECTED_ORDER.length) {
    issues.push('  count: 期望 ' + EXPECTED_ORDER.length + ' 个 app 脚本，实际 ' + appSrcs.length + ' 个');
  }
  const slots = Math.max(appSrcs.length, EXPECTED_ORDER.length);
  for (let i = 0; i < slots; i++) {
    if (EXPECTED_ORDER[i] !== appSrcs[i]) {
      issues.push('  slot ' + (i + 1) + ': 期望 ' + (EXPECTED_ORDER[i] || '(无)') + '，实际 ' + (appSrcs[i] || '(无)'));
    }
  }
  if (issues.length) {
    console.log('\nERR: 脚本加载顺序错乱：');
    issues.forEach(l => console.log(l));
  }

  const existing = new Set(fs.readdirSync(JS_DIR));
  const missing = EXPECTED_ORDER.filter(f => !existing.has(f));
  if (missing.length) {
    console.log('\nERR: 缺失脚本文件：');
    missing.forEach(f => console.log('  ' + f));
  }

  if (threeOk && issues.length === 0 && missing.length === 0) {
    console.log('\nOK: 脚本加载顺序正确。');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
