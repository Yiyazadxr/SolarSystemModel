#!/usr/bin/env node
/* check-syntax.js — 零依赖：node --check 语法校验
 * 输入：assets/js/*.js 白名单（排除 textures.js）
 * 输出：OK: file.js 或 ERR: file.js:line:col - msg
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const EXCLUDE = new Set(['textures.js']);

function stripCommentsAndStrings(src) {
  // 极简剥注释与字符串，仅用于粗略判断
  let out = '';
  let i = 0;
  let state = 'code';
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
          if (src[i] === '\n') out += '\n';
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
        // 模板字符串：粗略跳过直到下一个反引号
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
      // in string
      if (c === '\\') { i += 2; continue; }
      if (c === state) { state = 'code'; i++; out += ' '; continue; }
      if (c === '\n') { out += '\n'; i++; continue; }
      i++;
    }
  }
  return out;
}

function checkOne(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { file: rel, ok: false, err: 'read fail: ' + e.message };
  }
  // 语法检查：用 vm.Script 编译即可，不执行
  try {
    new vm.Script(src, { filename: rel });
    return { file: rel, ok: true };
  } catch (e) {
    return { file: rel, ok: false, err: e.message };
  }
}

function main() {
  const files = fs.readdirSync(JS_DIR)
    .filter(f => f.endsWith('.js') && !EXCLUDE.has(f))
    .map(f => path.join(JS_DIR, f))
    .sort();

  let fail = 0;
  for (const f of files) {
    const r = checkOne(f);
    if (r.ok) {
      console.log('OK  ' + r.file);
    } else {
      fail++;
      console.log('ERR ' + r.file + ' - ' + r.err);
    }
  }
  console.log('\nTotal: ' + files.length + ' | Fail: ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}

main();
