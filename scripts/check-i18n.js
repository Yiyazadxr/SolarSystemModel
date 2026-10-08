#!/usr/bin/env node
/* check-i18n.js — 零依赖：i18n 键对齐检查
 * 规则：
 *  1. 从 i18n.js 抽取 en / zh 键集合（扁平化 dot 路径）
 *  2. 全项目 grep SOLAR.t('xxx') 得到消费集合
 *  3. 报告：孤儿键（有键无消费）、缺失键（消费无键）
 * 边界：仅检测字面量字符串，动态拼接键不检测
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const I18N_FILE = path.join(ROOT, 'assets', 'js', 'i18n.js');
const HTML_FILE = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const EXCLUDE = new Set(['textures.js']);

/* 屏蔽字符串和注释后再扫描对象结构，避免英文正文里的 "world:"、
   "sphere:" 被误判成国际化键。保持换行，方便后续索引仍对应原文。 */
function maskStringsAndComments(src) {
  let out = '';
  let mode = 'code';
  let quote = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') {
        out += '  ';
        i++;
        mode = 'line';
      } else if (ch === '/' && next === '*') {
        out += '  ';
        i++;
        mode = 'block';
      } else if (ch === '"' || ch === "'" || ch === '`') {
        out += ' ';
        quote = ch;
        mode = 'string';
      } else {
        out += ch;
      }
    } else if (mode === 'string') {
      if (ch === '\\') {
        out += '  ';
        i++;
      } else if (ch === quote) {
        out += ' ';
        mode = 'code';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
    } else if (mode === 'line') {
      if (ch === '\n') {
        out += '\n';
        mode = 'code';
      } else {
        out += ' ';
      }
    } else {
      if (ch === '*' && next === '/') {
        out += '  ';
        i++;
        mode = 'code';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
    }
  }
  return out;
}

// 按括号配对从 openIdx 找到 closeIdx
function matchBrace(src, openIdx) {
  const scan = maskStringsAndComments(src);
  let depth = 0;
  for (let i = openIdx; i < scan.length; i++) {
    if (scan[i] === '{') depth++;
    else if (scan[i] === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// 定位 `lang: { ... }` 块
function langBlock(src, lang) {
  const idx = src.indexOf(lang + ':');
  if (idx < 0) return null;
  const openIdx = src.indexOf('{', idx);
  if (openIdx < 0) return null;
  const closeIdx = matchBrace(src, openIdx);
  if (closeIdx < 0) return null;
  return src.slice(openIdx, closeIdx + 1);
}

// 递归展平键。仅处理 `key: { ... }` 和 `key: 'literal'` 两种形态
function flatten(text, prefix, keys) {
  // 扫描所有 `key:` 出现位置（在缩进位置）
  const scan = maskStringsAndComments(text);
  const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g;
  let m;
  while ((m = re.exec(scan)) !== null) {
    const key = m[1];
    const colonIdx = m.index + m[0].length - 1;
    // 跳过冒号后的空白
    let i = colonIdx + 1;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) continue;
    const ch = text[i];
    const childPrefix = prefix ? prefix + '.' + key : key;
    if (ch === '{') {
      // 子对象：提取子块，递归
      const closeIdx = matchBrace(text, i);
      if (closeIdx < 0) { re.lastIndex = i + 1; continue; }
      keys.add(childPrefix);
      flatten(text.slice(i, closeIdx + 1), childPrefix, keys);
      re.lastIndex = closeIdx + 1;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      // 字符串值：终端键
      keys.add(childPrefix);
      re.lastIndex = i;
    } else {
      // 数字 / 布尔 / null：也视为终端
      keys.add(childPrefix);
      re.lastIndex = i;
    }
  }
}

// 找容器键（其下还有子键），从 allKeys 中剔除
function terminalKeys(allKeys) {
  const term = new Set();
  const arr = Array.from(allKeys);
  for (let i = 0; i < arr.length; i++) {
    const k = arr[i];
    let isContainer = false;
    for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      if (arr[j].indexOf(k + '.') === 0) { isContainer = true; break; }
    }
    if (!isContainer) term.add(k);
  }
  return term;
}

function collectConsumedKeys(files) {
  const keys = new Set();
  const re = /SOLAR\.t\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src)) !== null) keys.add(m[1]);
  }
  return keys;
}

/* index.html 的 data-i18n / data-i18n-title 由 ui.js 统一消费，
   它们不是 SOLAR.t('literal') 形态，单独收集后一并校验。 */
function collectHtmlKeys() {
  const keys = new Set();
  if (!fs.existsSync(HTML_FILE)) return keys;
  const src = fs.readFileSync(HTML_FILE, 'utf8');
  const re = /data-i18n(?:-title)?=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) keys.add(m[1]);
  return keys;
}

function main() {
  const src = fs.readFileSync(I18N_FILE, 'utf8');

  const enBody = langBlock(src, 'en');
  const zhBody = langBlock(src, 'zh');
  if (!enBody || !zhBody) {
    console.log('ERR: 无法定位 en / zh 语言块');
    process.exit(1);
  }

  const enKeys = new Set();
  const zhKeys = new Set();
  flatten(enBody, '', enKeys);
  flatten(zhBody, '', zhKeys);

  const enTerm = terminalKeys(enKeys);
  const zhTerm = terminalKeys(zhKeys);

  console.log('=== i18n 键数量 ===');
  console.log('  en total: ' + enKeys.size + '  terminal: ' + enTerm.size);
  console.log('  zh total: ' + zhKeys.size + '  terminal: ' + zhTerm.size);

  // zh / en 不对称
  const enOnly = [];
  for (const k of enTerm) if (!zhTerm.has(k)) enOnly.push(k);
  const zhOnly = [];
  for (const k of zhTerm) if (!enTerm.has(k)) zhOnly.push(k);

  if (enOnly.length) {
    console.log('\nERR: 仅 en 有的键 (' + enOnly.length + '):');
    enOnly.slice(0, 30).forEach(k => console.log('  ' + k));
    if (enOnly.length > 30) console.log('  ... +' + (enOnly.length - 30) + ' more');
  } else {
    console.log('\nOK: en/zh 键完全对称。');
  }
  if (zhOnly.length) {
    console.log('\nERR: 仅 zh 有的键 (' + zhOnly.length + '):');
    zhOnly.slice(0, 30).forEach(k => console.log('  ' + k));
  }

  // 消费集合
  const files = fs.readdirSync(JS_DIR)
    .filter(f => f.endsWith('.js') && !EXCLUDE.has(f))
    .map(f => path.join(JS_DIR, f));
  const literalKeys = collectConsumedKeys(files);
  const htmlKeys = collectHtmlKeys();
  const consumed = new Set(literalKeys);
  for (const k of htmlKeys) consumed.add(k);

  console.log('\n=== 消费键（SOLAR.t + data-i18n） ===');
  console.log('  SOLAR.t literal: ' + literalKeys.size + '  data-i18n: ' + htmlKeys.size + '  合计: ' + consumed.size);

  // 缺失键：消费了但未定义
  const missing = [];
  for (const k of consumed) {
    if (!enTerm.has(k) && !zhTerm.has(k)) missing.push(k);
  }
  if (missing.length) {
    console.log('\nERR: 消费了但未定义的键 (' + missing.length + '):');
    missing.forEach(k => console.log('  ' + k));
  } else {
    console.log('OK: 所有消费键都有定义。');
  }

  // 未消费键（可能通过 SOLAR.I18N[lang] 直接读，不算孤儿但列出参考）
  const unconsumed = [];
  for (const k of enTerm) if (!consumed.has(k)) unconsumed.push(k);
  if (unconsumed.length) {
    console.log('\nINFO: 未被消费的键 (' + unconsumed.length + '，可能通过 SOLAR.I18N[lang] 直接访问):');
    unconsumed.slice(0, 30).forEach(k => console.log('  ' + k));
    if (unconsumed.length > 30) console.log('  ... +' + (unconsumed.length - 30) + ' more');
  }

  const fail = enOnly.length > 0 || zhOnly.length > 0 || missing.length > 0;
  process.exit(fail ? 1 : 0);
}

main();
