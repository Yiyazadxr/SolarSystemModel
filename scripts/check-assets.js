#!/usr/bin/env node
/* check-assets.js — 零依赖：资产完整性检查
 * 规则：
 *  1. assets/js/textures/ 分块贴图 + textures-manifest.js + textures-loader.js 存在，
 *     旧单文件 textures.js 已删除
 *  2. assets/vendor/ 下所有文件被 index.html 引用
 *  3. index.html 中 <script src> 全部存在
 *  4. assets/textures/ 中的源贴图在各分块中有对应键
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const VENDOR_DIR = path.join(ROOT, 'assets', 'vendor');
const TEX_DIR = path.join(ROOT, 'assets', 'textures');
const CHUNK_DIR = path.join(JS_DIR, 'textures');
const MANIFEST_JS = path.join(JS_DIR, 'textures-manifest.js');
const LOADER_JS = path.join(JS_DIR, 'textures-loader.js');
const LEGACY_TEX_JS = path.join(JS_DIR, 'textures.js');

/* 分块贴图键抽取：块文件形态为 SOLAR.TEXTURES.<key> = "data:..." */
function embeddedKeys(files) {
  const embedded = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const keyRe = /SOLAR\.TEXTURES\.([A-Za-z0-9_-]+)\s*=\s*"(data:[^"]*)"/g;
    let key;
    while ((key = keyRe.exec(text)) !== null) embedded.add(key[1]);
  }
  return embedded;
}

function chunkFiles() {
  if (!exists(CHUNK_DIR)) return [];
  return fs.readdirSync(CHUNK_DIR)
    .filter(f => /\.js$/.test(f))
    .map(f => path.join(CHUNK_DIR, f))
    .sort();
}

function exists(p) {
  try { fs.statSync(p); return true; } catch (e) { return false; }
}

function main() {
  let fail = 0;

  // 1. 分块贴图 / 清单 / 加载器存在性，旧单文件已清理
  const chunks = chunkFiles();
  if (chunks.length) {
    let kb = 0;
    for (const c of chunks) kb += fs.statSync(c).size / 1024;
    console.log('OK  assets/js/textures/ (' + chunks.length + ' 块, ' + kb.toFixed(2) + ' KB)');
  } else {
    console.log('ERR 缺失 assets/js/textures/ 分块贴图（运行 node scripts/generate-textures.js 生成）');
    fail++;
  }
  if (exists(MANIFEST_JS)) console.log('OK  assets/js/textures-manifest.js');
  else { console.log('ERR 缺失 assets/js/textures-manifest.js（运行 node scripts/generate-textures.js 生成）'); fail++; }
  if (exists(LOADER_JS)) console.log('OK  assets/js/textures-loader.js');
  else { console.log('ERR 缺失 assets/js/textures-loader.js'); fail++; }
  if (exists(LEGACY_TEX_JS)) {
    console.log('ERR 旧单文件 assets/js/textures.js 仍存在（贴图已改分块，重新运行生成脚本会自动删除）');
    fail++;
  }

  // 1b. 清单列出的块文件必须都存在
  if (exists(MANIFEST_JS) && chunks.length) {
    const man = fs.readFileSync(MANIFEST_JS, 'utf8');
    const re = /"file":\s*"([A-Za-z0-9_-]+)"/g;
    let m;
    while ((m = re.exec(man)) !== null) {
      if (!exists(path.join(CHUNK_DIR, m[1] + '.js'))) {
        console.log('ERR 清单引用的分块不存在：textures/' + m[1] + '.js');
        fail++;
      }
    }
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

  // 5. 生成器枚举目录，核对内嵌键而不是在生成器源码中搜索文件名
  console.log('\n=== textures 资产引用情况 ===');
  if (!exists(TEX_DIR)) { console.log('ERR 缺失 assets/textures/'); fail++; }
  else if (chunks.length) {
    const embedded = embeddedKeys(chunks);
    const texFiles = fs.readdirSync(TEX_DIR).filter(name => /\.(?:jpe?g|png|webp)$/i.test(name));
    for (const tf of texFiles) {
      const stem = path.basename(tf, path.extname(tf));
      if (!embedded.has(stem)) { console.log('ERR 未内嵌 ' + tf); fail++; }
    }
    if (!texFiles.length) { console.log('ERR 源目录无贴图'); fail++; }
    else if (!fail) console.log('OK  ' + texFiles.length + ' 张源贴图均有内嵌键（内容一致性另用 generate-textures.js --check）');
  }

  // 6. data.js 贴图路径 -> 分块内嵌键的可解析性（回归门禁）
  //    46f51fc 贴图转 WebP 时漏改 scene-gfx 的键名剥离正则，导致全量贴图
  //    静默走纯色兜底（行星只剩程序化条纹、卫星变灰球）。这里直接复用
  //    scene-gfx.js 的正则源码做断言：正则必须覆盖 webp，且 data.js 每条
  //    贴图路径剥离扩展名后都能在分块贴图里找到内嵌键。
  console.log('\n=== data.js 贴图路径解析 ===');
  const dataJs = path.join(JS_DIR, 'data.js');
  const gfxJs = path.join(JS_DIR, 'scene-gfx.js');
  if (exists(dataJs) && exists(gfxJs) && chunks.length) {
    const gfxText = fs.readFileSync(gfxJs, 'utf8');
    const gfxRe = /replace\(\/\\\.\(([^)]+)\)\$\/i/.exec(gfxText);
    const gfxExts = gfxRe ? gfxRe[1].split('|') : [];
    const needExt = ['jpg', 'jpeg', 'png', 'webp'];
    const missingExt = needExt.filter(e => gfxExts.indexOf(e) < 0);
    if (missingExt.length) {
      console.log('ERR scene-gfx.js 键名剥离正则缺少扩展名: ' + missingExt.join(', ') +
        '（会导致对应路径的内嵌查找落空、静默退化为纯色兜底）');
      fail++;
    } else if (gfxExts.length) {
      console.log('OK  scene-gfx.js 键名剥离正则覆盖 ' + gfxExts.join('/'));
    }

    const embedded2 = embeddedKeys(chunks);

    const dataText = fs.readFileSync(dataJs, 'utf8');
    const pathRe = /texture(?:Night|Clouds|Specular)?\s*:\s*'(assets\/textures\/[^']+)'/g;
    let pm;
    let resolved = 0;
    while ((pm = pathRe.exec(dataText)) !== null) {
      const key = pm[1].replace(/^.*\//, '').replace(/\.[a-z]+$/i, '');
      if (embedded2.has(key)) resolved++;
      else { console.log('ERR 贴图路径无法解析为内嵌键: ' + pm[1] + ' -> "' + key + '"'); fail++; }
    }
    if (resolved > 0) console.log('OK  data.js ' + resolved + ' 条贴图路径均可解析为内嵌键');
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
