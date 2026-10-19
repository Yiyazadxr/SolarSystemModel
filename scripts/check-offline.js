#!/usr/bin/env node
/* check-offline.js — 零依赖：禁止联网 API 与远端运行时资源
 * 禁用：fetch / XMLHttpRequest / WebSocket / EventSource / import() / document.write
 * 允许：localStorage / sessionStorage / history（离线可用）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const HTML = path.join(ROOT, 'index.html');
const CSS_DIR = path.join(ROOT, 'assets', 'css');
/* base64 贴图生成物在 assets/js/textures/ 子目录：readdirSync 非递归天然跳过
   （11MB 字符串逐字符剥注释太慢） */

function strip(src) {
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
  { name: 'fetch',        re: /\bfetch\s*\(/ },
  { name: 'XHR',          re: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket',    re: /\bWebSocket\b/ },
  { name: 'EventSource',  re: /\bEventSource\b/ },
  { name: 'dynamicImport',re: /\bimport\s*\(/ },
  { name: 'docWrite',     re: /\bdocument\.write\s*\(/ },
];

function checkOne(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = strip(fs.readFileSync(file, 'utf8')).split('\n');
  const issues = [];
  for (let ln = 0; ln < lines.length; ln++) {
    for (const r of RULES) {
      if (r.re.test(lines[ln])) {
        issues.push({ line: ln + 1, kind: r.name, text: lines[ln].trim().slice(0, 80) });
      }
    }
  }
  return { file: rel, issues };
}

function main() {
  const files = fs.readdirSync(JS_DIR)
    .filter(f => f.endsWith('.js'))
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

  /* JS 资源 URL 可以由 Image.src 等 API 消费，单查联网 API 会漏掉它们。 */
  /* 例外：SVG / XHTML 命名空间是常量标识符，浏览器不会因它发请求——
     内联 SVG（createElementNS）必须带这个 URI，否则本项目用不了 SVG 图标。 */
  const NAMESPACE_URL = /['"]https?:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xhtml)['"]/i;
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      if (/['"]https?:\/\//i.test(lines[ln]) && !NAMESPACE_URL.test(lines[ln])) {
        console.log('ERR ' + path.relative(ROOT, f).replace(/\\/g, '/') + ':' + (ln + 1) + ' [remoteURL]');
        total++;
      }
    }
  }

  for (const name of fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'))) {
    const lines = fs.readFileSync(path.join(CSS_DIR, name), 'utf8').split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      if (/(?:url\(\s*['"]?|@import\s+['"]?)https?:\/\//i.test(lines[ln])) {
        console.log('ERR assets/css/' + name + ':' + (ln + 1) + ' [remoteURL]');
        total++;
      }
    }
  }

  /* index.html 只含一段内联启动代码，但仍扫一遍，防止将来把联网调用写进内联脚本。 */
  if (fs.existsSync(HTML)) {
    const raw = fs.readFileSync(HTML, 'utf8');
    const lines = strip(raw).split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      for (const r of RULES) {
        if (r.re.test(lines[ln])) {
          console.log('ERR index.html:' + (ln + 1) + ' [' + r.name + '] ' + lines[ln].trim().slice(0, 80));
          total++;
        }
      }
    }
    const remoteResource = /<(?:script|link|img|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*['"]https?:\/\//gi;
    let match;
    while ((match = remoteResource.exec(raw)) !== null) {
      console.log('ERR index.html:' + raw.slice(0, match.index).split('\n').length + ' [remoteURL]');
      total++;
    }
    if (total === 0) console.log('OK  index.html');
  }

  console.log('\nTotal violations: ' + total);
  process.exit(total > 0 ? 1 : 0);
}

main();
