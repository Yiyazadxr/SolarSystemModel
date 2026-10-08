#!/usr/bin/env node
/* check-es5.js — 零依赖：禁用 ES6+ 特性
 * 输入：assets/js/*.js 白名单（排除 textures.js）
 * 输出：违规行号 + 类型
 * 边界：先剥注释与字符串，避免误报
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const EXCLUDE = new Set(['textures.js']);

// 剥注释与字符串（沿用 check-syntax.js 逻辑）
function strip(src) {
  let out = '';
  let i = 0;
  let state = 'code';
  const lineBreaks = [0];
  while (i < src.length) {
    const c = src[i];
    const c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        out += ' ';
        continue;
      }
      if (c === '/' && c2 === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
          if (src[i] === '\n') { out += '\n'; }
          i++;
        }
        i += 2;
        out += ' ';
        continue;
      }
      if (c === '"' || c === "'") {
        state = c;
        i++;
        out += ' ';
        continue;
      }
      if (c === '`') {
        i++;
        while (i < src.length && src[i] !== '`') {
          if (src[i] === '\\') i++;
          if (src[i] === '\n') out += '\n';
          i++;
        }
        i++;
        out += ' ';
        continue;
      }
      if (c === '\n') out += '\n';
      out += c;
      i++;
    } else {
      if (c === '\\') { i += 2; continue; }
      if (c === state) { state = 'code'; i++; out += ' '; continue; }
      if (c === '\n') { out += '\n'; i++; continue; }
      i++;
    }
  }
  return out;
}

const RULES = [
  { name: 'let',       re: /\blet\b/ },
  { name: 'const',     re: /\bconst\b/ },
  { name: 'arrow',     re: /=>/ },
  { name: 'class',     re: /\bclass\s+/ },
  { name: 'await',     re: /\bawait\b/ },
  { name: 'async',     re: /\basync\b/ },
  { name: 'yield',     re: /\byield\b/ },
  { name: 'import',    re: /\bimport\s+/ },
  { name: 'export',    re: /\bexport\s+/ },
  { name: 'forOf',     re: /\bfor\s*\([^;)]*\bof\b/ },
  { name: 'optionalChain', re: /\?\./ },
  { name: 'nullish',   re: /\?\?/ },
  { name: 'destruct',  re: /(\bvar\b|\blet\b|\bconst\b)\s*\[[^\]]*\]\s*=/ },
  { name: 'spread',    re: /\.\.\./ },
];

function scanLine(line, rules) {
  const hits = [];
  for (const r of rules) {
    const m = r.re.exec(line);
    if (m) hits.push(r.name);
  }
  return hits;
}

function checkOne(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const src = strip(fs.readFileSync(file, 'utf8'));
  const lines = src.split('\n');
  const issues = [];
  for (let ln = 0; ln < lines.length; ln++) {
    const hits = scanLine(lines[ln], RULES);
    for (const h of hits) {
      issues.push({ line: ln + 1, kind: h, text: lines[ln].trim().slice(0, 80) });
    }
  }
  return { file: rel, issues };
}

function main() {
  const files = fs.readdirSync(JS_DIR)
    .filter(f => f.endsWith('.js') && !EXCLUDE.has(f))
    .map(f => path.join(JS_DIR, f))
    .sort();

  let total = 0;
  for (const f of files) {
    const r = checkOne(f);
    if (r.issues.length === 0) {
      console.log('OK  ' + r.file);
    } else {
      for (const iss of r.issues) {
        console.log('ERR ' + r.file + ':' + iss.line + ' [' + iss.kind + '] ' + iss.text);
        total++;
      }
    }
  }
  console.log('\nTotal violations: ' + total);
  process.exit(total > 0 ? 1 : 0);
}

main();
