#!/usr/bin/env node
/**
 * 生成 assets/js/textures.js —— 把 assets/textures/ 下的原始贴图编码为内嵌 base64，
 * 以便 index.html 在 file:// 协议下直接双击运行（不请求磁盘文件，避免 CORS）。
 *
 * 用法：
 *   node scripts/generate-textures.js            # 重新生成
 *   node scripts/generate-textures.js --check    # 只校验是否与现有文件一致（CI 用）
 *
 * 键名规则：文件名去扩展名（earth.jpg -> "earth"），与 data.js 中的 texture 字段对应。
 * 依赖：仅 Node 内置模块。
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC_DIR = path.join(ROOT, 'assets', 'textures');
var OUT_FILE = path.join(ROOT, 'assets', 'js', 'textures.js');

var MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

function listTextures(dir) {
  if (!fs.existsSync(dir)) {
    console.error('[textures] 找不到源目录：' + dir);
    process.exit(1);
  }
  return fs.readdirSync(dir)
    .filter(function (name) {
      return MIME[path.extname(name).toLowerCase()] && !/^\./.test(name);
    })
    .sort();
}

function build() {
  var files = listTextures(SRC_DIR);
  if (!files.length) {
    console.error('[textures] 源目录内没有可用贴图');
    process.exit(1);
  }

  var lines = [];
  lines.push('/* 本文件由 scripts/generate-textures.js 自动生成，请勿手动编辑。 */');
  lines.push('/* 源目录：assets/textures/  —— 修改贴图后请运行：node scripts/generate-textures.js */');
  lines.push('window.SOLAR = window.SOLAR || {};');
  lines.push('');
  lines.push('SOLAR.TEXTURES = {');
  lines.push('  "sun": "",');

  files.forEach(function (name, i) {
    var ext = path.extname(name).toLowerCase();
    var key = path.basename(name, ext);
    var buf = fs.readFileSync(path.join(SRC_DIR, name));
    var dataUrl = 'data:' + MIME[ext] + ';base64,' + buf.toString('base64');
    // 保持与历史版本一致：单行一条，逗号分隔，最后一项不带逗号
    var tail = (i === files.length - 1) ? '' : ',';
    lines.push('  "' + key + '": "' + dataUrl + '"' + tail);
    console.log('  + ' + key + '  (' + (buf.length / 1024).toFixed(0) + ' KB)');
  });

  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

var output = build();

function parse(text) {
  var map = {};
  var re = /"([A-Za-z0-9_\-]+)"\s*:\s*"(data:[^"]*)"/g;
  var m;
  while ((m = re.exec(text)) !== null) map[m[1]] = m[2];
  return map;
}

if (process.argv.indexOf('--check') !== -1) {
  if (!fs.existsSync(OUT_FILE)) {
    console.error('[textures] 缺少 ' + path.relative(ROOT, OUT_FILE) + '，请运行 node scripts/generate-textures.js');
    process.exit(1);
  }
  // 语义比较：只比对 键 -> dataURL，不受键顺序、空格、注释影响
  var want = parse(output);
  var have = parse(fs.readFileSync(OUT_FILE, 'utf8'));
  var bad = [];
  Object.keys(want).forEach(function (k) {
    if (!have[k]) bad.push('缺少键 ' + k);
    else if (have[k] !== want[k]) bad.push('内容不一致 ' + k);
  });
  Object.keys(have).forEach(function (k) {
    if (k !== 'sun' && !want[k]) bad.push('仓库内存在多余键 ' + k);
  });

  if (!bad.length) {
    console.log('[textures] 与仓库内 textures.js 一致 ✓（' + Object.keys(want).length + ' 张贴图）');
  } else {
    console.error('[textures] 与仓库内 textures.js 不一致：');
    bad.forEach(function (b) { console.error('  - ' + b); });
    console.error('请运行 node scripts/generate-textures.js 后再提交');
    process.exit(1);
  }
} else {
  fs.writeFileSync(OUT_FILE, output, 'utf8');
  var size = (fs.statSync(OUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log('[textures] 已生成 ' + path.relative(ROOT, OUT_FILE) + '（' + size + ' MB，共 ' +
    listTextures(SRC_DIR).length + ' 张）');
}
