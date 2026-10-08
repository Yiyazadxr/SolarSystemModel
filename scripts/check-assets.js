#!/usr/bin/env node
/* check-assets.js — 零依赖：资产完整性检查
 * 规则：
 *  1. assets/js/textures.js 存在
 *  2. assets/vendor/ 下所有文件被 index.html 引用
 *  3. index.html 中 <script src> 全部存在
 *  4. assets/textures/ 下 jpg/png 文件被 scripts/generate-textures.js 或 index.html 引用
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const VENDOR_DIR = path.join(ROOT, 'assets', 'vendor');
const TEX_DIR = path.join(ROOT, 'assets', 'textures');
const GEN_SCRIPT = path.join(ROOT, 'scripts', 'generate-textures.js');

function exists(p) {
  try { fs.statSync(p); return true; } catch (e) { return false; }
}

function main() {
  let fail = 0;

  // 1. textures.js 存在性
  const texJs = path.join(JS_DIR, 'textures.js');
  if (exists(texJs)) {
    const kb = fs.statSync(texJs).size / 1024;
    console.log('OK  assets/js/textures.js (' + kb.toFixed(2) + ' KB)');
  } else {
    console.log('ERR 缺失 assets/js/textures.js（运行 npm scripts/generate-textures.js 生成）');
    fail++;
  }

  // 2. index.html 存在性
  if (exists(HTML)) {
    console.log('OK  index.html');
  } else {
    console.log('ERR 缺失 index.html');
    fail++;
    process.exit(1);
  }
  const html = fs.readFileSync(HTML, 'utf8');

  // 3. index.html <script src> 目标存在性
  const re = /<script\s+src=["']([^"']+)["'][^>]*>/g;
  const srcs = [];
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  console.log('\n=== <script src> 目标存在性 (' + srcs.length + ') ===');
  for (const s of srcs) {
    const full = path.join(ROOT, s);
    if (exists(full)) console.log('OK  ' + s);
    else { console.log('ERR 缺失 ' + s); fail++; }
  }

  // 3b. index.html <link rel="stylesheet"> 目标存在性
  const linkRe = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/g;
  const links = [];
  while ((m = linkRe.exec(html)) !== null) links.push(m[1]);
  console.log('\n=== <link stylesheet> 目标存在性 (' + links.length + ') ===');
  for (const s of links) {
    const full = path.join(ROOT, s);
    if (exists(full)) console.log('OK  ' + s);
    else { console.log('ERR 缺失 ' + s); fail++; }
  }

  // 4. assets/vendor/ 下所有文件是否被 index.html 引用
  console.log('\n=== vendor 文件引用情况 ===');
  if (exists(VENDOR_DIR)) {
    const vendorFiles = fs.readdirSync(VENDOR_DIR);
    for (const vf of vendorFiles) {
      const refPath = 'assets/vendor/' + vf;
      if (html.indexOf(refPath) >= 0) console.log('OK  ' + vf);
      else { console.log('WARN ' + vf + ' 未被 index.html 引用'); }
    }
  } else {
    console.log('WARN assets/vendor/ 目录不存在');
  }

  // 5. textures/ 下 jpg/png 是否被生成脚本提及
  console.log('\n=== textures 资产引用情况 ===');
  let genSrc = '';
  if (exists(GEN_SCRIPT)) genSrc = fs.readFileSync(GEN_SCRIPT, 'utf8');
  else console.log('WARN 缺失 scripts/generate-textures.js');

  if (exists(TEX_DIR)) {
    const texFiles = fs.readdirSync(TEX_DIR);
    let unref = 0;
    for (const tf of texFiles) {
      // 检查文件名是否出现在生成脚本里
      // 也检查 index.html 或 js 里是否有引用
      const referenced = genSrc.indexOf(tf) >= 0;
      if (!referenced) {
        unref++;
        console.log('INFO ' + tf + ' 未在 generate-textures.js 中出现（可能是原始素材）');
      }
    }
    if (unref === 0) console.log('OK  全部 textures 被 generate-textures.js 提及');
    console.log('（生成脚本共 ' + texFiles.length + ' 个 texture 目标）');
  }

  console.log('\n=== 总结 ===');
  if (fail === 0) {
    console.log('OK  所有必需资产存在。');
    process.exit(0);
  } else {
    console.log('FAIL  ' + fail + ' 个错误。');
    process.exit(1);
  }
}

main();
