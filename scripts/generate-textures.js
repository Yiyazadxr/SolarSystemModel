#!/usr/bin/env node
/**
 * 生成 assets/js/textures/ 分块贴图 + assets/js/textures-manifest.js ——
 * 把 assets/textures/ 下的原始贴图编码为内嵌 base64，按优先级分组，
 * 以便 index.html 在 file:// 协议下直接双击运行（不请求磁盘文件，避免 CORS），
 * 并由 textures-loader.js 在加载层可见后逐块注入，避免 11 MB 整包
 * 在首屏同步解析时长时间阻塞主线程（进度条压在 0% 不动）。
 *
 * 用法：
 *   node scripts/generate-textures.js            # 重新生成
 *   node scripts/generate-textures.js --check    # 只校验是否与现有文件一致（CI 用）
 *
 * 键名规则：文件名去扩展名（earth.jpg -> "earth"），与 data.js 中的 texture 字段对应。
 * 分组规则：GROUPS 定义加载优先级（首页可见的在前）。新增贴图必须归组——
 *           未归组 / 组内键在磁盘上不存在都会直接报错，不会静默丢贴图。
 * 依赖：仅 Node 内置模块。
 */

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC_DIR = path.join(ROOT, 'assets', 'textures');
var OUT_DIR = path.join(ROOT, 'assets', 'js', 'textures');
var MANIFEST_FILE = path.join(ROOT, 'assets', 'js', 'textures-manifest.js');
var LEGACY_FILE = path.join(ROOT, 'assets', 'js', 'textures.js');   // 旧单文件，生成时清理

var MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

/* 加载优先级分组：顺序即注入顺序。core 放「一进首页就能看到的」——
   太阳 / 银河天穹 / 内行星 / 地月系；巨行星卫星要放大才可见，排后面。
   sun.webp 场景里走程序化着色、未直接使用，仍随目录全量内嵌。 */
var GROUPS = [
  { name: 'core', note: '首页可见：太阳 / 银河 / 内行星 / 地月系', keys: [
    'sun', 'milkyway', 'mercury', 'venus', 'earth', 'earth_night', 'earth_clouds', 'earth_specular', 'mars', 'moon'
  ] },
  { name: 'outer', note: '外行星与行星环', keys: [
    'jupiter', 'saturn', 'saturn_ring', 'uranus', 'uranus_ring', 'neptune'
  ] },
  { name: 'moons', note: '巨行星卫星（需放大才可见）', keys: [
    'io', 'europa', 'ganymede', 'enceladus', 'titan', 'rhea', 'triton'
  ] },
  { name: 'far', note: '矮行星与小天体', keys: [
    'pluto', 'vesta'
  ] }
];

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

/* 目录 -> { key: dataUrl }，并校验分组覆盖情况 */
function collect() {
  var files = listTextures(SRC_DIR);
  if (!files.length) {
    console.error('[textures] 源目录内没有可用贴图');
    process.exit(1);
  }

  var map = {};
  var i;
  for (i = 0; i < files.length; i++) {
    var ext = path.extname(files[i]).toLowerCase();
    var key = path.basename(files[i], ext);
    if (map[key]) {
      console.error('[textures] 键名冲突：' + key);
      process.exit(1);
    }
    var buf = fs.readFileSync(path.join(SRC_DIR, files[i]));
    map[key] = 'data:' + MIME[ext] + ';base64,' + buf.toString('base64');
  }

  /* 分组校验：磁盘上的贴图必须全部归组，组里的键必须全部存在 */
  var assigned = {};
  var problems = [];
  GROUPS.forEach(function (g) {
    g.keys.forEach(function (k) {
      if (assigned[k]) problems.push('键 ' + k + ' 被重复归组（' + assigned[k] + ' / ' + g.name + '）');
      assigned[k] = g.name;
      if (!map[k]) problems.push('组 ' + g.name + ' 的键 ' + k + ' 在 assets/textures/ 中不存在');
    });
  });
  Object.keys(map).forEach(function (k) {
    if (!assigned[k]) problems.push('贴图 ' + k + '.webp 未归组：请在 GROUPS 中登记（决定加载优先级）');
  });
  if (problems.length) {
    console.error('[textures] 分组配置与源目录不一致：');
    problems.forEach(function (p) { console.error('  - ' + p); });
    process.exit(1);
  }
  return map;
}

/* 单块文件：逐键赋值合并进 SOLAR.TEXTURES，块与块之间互不依赖 */
function chunkSource(name, note, index, keys, map) {
  var lines = [];
  lines.push('/* 本文件由 scripts/generate-textures.js 自动生成，请勿手动编辑。 */');
  lines.push('/* 分组 ' + name + '：' + note + '（第 ' + (index + 1) + ' / ' + GROUPS.length + ' 组，由 textures-loader.js 按序注入） */');
  lines.push('window.SOLAR = window.SOLAR || {};');
  lines.push('SOLAR.TEXTURES = SOLAR.TEXTURES || {};');
  keys.forEach(function (k) {
    lines.push('SOLAR.TEXTURES.' + k + ' = "' + map[k] + '";');
  });
  lines.push('');
  return lines.join('\n');
}

/* 清单：chunks 顺序即加载优先级，bytes 为 base64 字符数（进度权重） */
function manifestSource(chunks) {
  var total = 0;
  var i;
  for (i = 0; i < chunks.length; i++) total += chunks[i].bytes;
  var lines = [];
  lines.push('/* 本文件由 scripts/generate-textures.js 自动生成，请勿手动编辑。 */');
  lines.push('/* 贴图分块清单：chunks 顺序即加载优先级，bytes 为 base64 字符数（textures-loader.js 的进度权重）。');
  lines.push('   块文件位于 assets/js/textures/<file>.js，由加载器动态注入，不进 index.html 的静态脚本表。 */');
  lines.push('window.SOLAR = window.SOLAR || {};');
  lines.push('SOLAR.TEXTURE_MANIFEST = {');
  lines.push('  "chunks": [');
  chunks.forEach(function (c, i) {
    var tail = (i === chunks.length - 1) ? '' : ',';
    lines.push('    { "file": "' + c.file + '", "bytes": ' + c.bytes + ' }' + tail);
  });
  lines.push('  ],');
  lines.push('  "totalBytes": ' + total);
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function build() {
  var map = collect();
  var chunks = [];
  GROUPS.forEach(function (g, i) {
    var keys = g.keys.slice();
    var bytes = 0;
    keys.forEach(function (k) { bytes += map[k].length; });
    chunks.push({ file: g.name, bytes: bytes });
    var src = chunkSource(g.name, g.note, i, keys, map);
    var out = path.join(OUT_DIR, g.name + '.js');
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(out, src, 'utf8');
    console.log('  + textures/' + g.name + '.js  ' + keys.length + ' 张  ' +
      (bytes / 1024 / 1024).toFixed(2) + ' MB(base64)  [' + g.note + ']');
  });

  fs.writeFileSync(MANIFEST_FILE, manifestSource(chunks), 'utf8');
  console.log('  + textures-manifest.js  (' + chunks.length + ' 块, 合计 ' +
    (chunks.reduce(function (s, c) { return s + c.bytes; }, 0) / 1024 / 1024).toFixed(2) + ' MB base64)');

  /* 清理旧单文件：留着会同时被 check-doc-counts 计成模块，也会让人误以为还在用 */
  if (fs.existsSync(LEGACY_FILE)) {
    fs.unlinkSync(LEGACY_FILE);
    console.log('  - 已删除旧单文件 assets/js/textures.js');
  }
}

/* ---------- 校验 ---------- */

function parse(text) {
  var out = {};
  var re = /SOLAR\.TEXTURES\.([A-Za-z0-9_-]+)\s*=\s*"(data:[^"]*)"/g;
  var m;
  while ((m = re.exec(text)) !== null) out[m[1]] = m[2];
  return out;
}

function parseManifest(text) {
  var out = { chunks: [], totalBytes: 0 };
  var re = /\{\s*"file":\s*"([A-Za-z0-9_-]+)",\s*"bytes":\s*(\d+)\s*\}/g;
  var m;
  while ((m = re.exec(text)) !== null) out.chunks.push({ file: m[1], bytes: Number(m[2]) });
  var tot = /"totalBytes":\s*(\d+)/.exec(text);
  if (tot) out.totalBytes = Number(tot[1]);
  return out;
}

function check() {
  var map = collect();
  var bad = [];

  /* 旧单文件必须已经删掉 */
  if (fs.existsSync(LEGACY_FILE)) {
    bad.push('旧单文件 assets/js/textures.js 仍存在（重新运行生成脚本会自动删除）');
  }

  /* 逐块语义比对：键 -> dataURL，不受键顺序、空格、注释影响 */
  var totalBytes = 0;
  GROUPS.forEach(function (g) {
    var file = path.join(OUT_DIR, g.name + '.js');
    if (!fs.existsSync(file)) { bad.push('缺少分块 textures/' + g.name + '.js'); return; }
    var have = parse(fs.readFileSync(file, 'utf8'));
    var bytes = 0;
    g.keys.forEach(function (k) {
      if (!have[k]) bad.push(g.name + '.js 缺少键 ' + k);
      else if (have[k] !== map[k]) bad.push(g.name + '.js 内容不一致 ' + k);
      bytes += map[k].length;
    });
    Object.keys(have).forEach(function (k) {
      if (g.keys.indexOf(k) < 0) bad.push(g.name + '.js 存在多余键 ' + k);
    });
    totalBytes += bytes;
  });

  /* 磁盘上多出不该有的块文件（组被删改名后的残留） */
  if (fs.existsSync(OUT_DIR)) {
    fs.readdirSync(OUT_DIR).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
      var name = path.basename(f, '.js');
      if (!GROUPS.some(function (g) { return g.name === name; })) bad.push('多余的分块文件 textures/' + f);
    });
  }

  /* 清单：块顺序、字节权重、总数 */
  if (!fs.existsSync(MANIFEST_FILE)) {
    bad.push('缺少 assets/js/textures-manifest.js');
  } else {
    var man = parseManifest(fs.readFileSync(MANIFEST_FILE, 'utf8'));
    if (man.chunks.length !== GROUPS.length) {
      bad.push('清单块数 ' + man.chunks.length + ' != GROUPS ' + GROUPS.length);
    } else {
      GROUPS.forEach(function (g, i) {
        var bytes = 0;
        g.keys.forEach(function (k) { bytes += map[k].length; });
        if (man.chunks[i].file !== g.name) bad.push('清单第 ' + (i + 1) + ' 块应为 ' + g.name + '，实际 ' + man.chunks[i].file);
        else if (man.chunks[i].bytes !== bytes) bad.push('清单块 ' + g.name + ' 字节权重 ' + man.chunks[i].bytes + ' != ' + bytes);
      });
    }
    if (man.totalBytes !== totalBytes) bad.push('清单 totalBytes ' + man.totalBytes + ' != ' + totalBytes);
  }

  if (!bad.length) {
    console.log('[textures] 分块贴图与清单一致 ✓（' + GROUPS.length + ' 块 / ' +
      Object.keys(map).length + ' 张贴图 / ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB base64）');
  } else {
    console.error('[textures] 与仓库内生成物不一致：');
    bad.forEach(function (b) { console.error('  - ' + b); });
    console.error('请运行 node scripts/generate-textures.js 后再提交');
    process.exit(1);
  }
}

if (process.argv.indexOf('--check') !== -1) check();
else build();
