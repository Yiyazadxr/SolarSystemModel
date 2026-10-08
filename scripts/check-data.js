#!/usr/bin/env node
/* check-data.js — 零依赖：data.js 字段消费率检查
 * 规则：
 *  1. 从 data.js 抽取所有天体/结构字段名
 *  2. 全项目 grep 消费
 *  3. 输出零消费字段（潜在死字段）
 * 边界：仅检测直接属性访问 `data.xxx` 或 `.xxx` 匹配
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'assets', 'js', 'data.js');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const EXCLUDE = new Set(['textures.js']);
/* 这些字段是数据版本/适用范围说明，不属于运行时天体属性；
   明确登记后，strict 只拦截真正意外出现的零消费字段。 */
const INTENTIONAL_ZERO_FIELDS = new Set([
  'scienceMeta', 'orbitalModel', 'shortTermRange', 'longTermRange', 'moonCountSnapshot'
]);
/* 默认只报告零消费字段（其中包含大量仅供阅读/文档意义的元数据），
   加 --strict 才把"存在零消费字段"当作失败，便于 CI 门禁。 */
const STRICT = process.argv.indexOf('--strict') >= 0;

// 从 data.js 抽取形如 `  key: ...` 的字段（在缩进 >= 2 的地方）
function extractFields(src) {
  const fields = new Map(); // field -> Set<file:line> 出现位置
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 匹配缩进后紧跟 key:
    const m = /^\s{2,}([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*/.exec(line);
    if (m) {
      const k = m[1];
      if (!fields.has(k)) fields.set(k, []);
      fields.get(k).push(i + 1);
    }
  }
  return fields;
}

// 检查某个字段是否在其他文件里被消费（`data.xxx` 或 `body.xxx` 或 `.xxx`）
function findConsumers(fields, files) {
  const result = new Map(); // field -> [{file, line, text}]
  for (const [k] of fields) {
    result.set(k, []);
  }
  for (const f of files) {
    if (f === DATA_FILE) continue;
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    // 用正则 `data\.xxx` 或 `.xxx` 精确匹配
    for (const [k] of fields) {
      // 精确匹配 `.` + k，或 pick(data, ['k']) 这类动态字段读取。
      const re = new RegExp('\\.' + k + '(?![\\w$])', 'g');
      const literalRe = new RegExp("['\"]" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]", 'g');
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]) || literalRe.test(lines[i])) {
          result.get(k).push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), line: i + 1, text: lines[i].trim().slice(0, 60) });
        }
        re.lastIndex = 0;
        literalRe.lastIndex = 0;
      }
    }
  }
  return result;
}

function main() {
  const src = fs.readFileSync(DATA_FILE, 'utf8');
  const fields = extractFields(src);

  console.log('=== data.js 抽取字段 (' + fields.size + ') ===');

  const files = fs.readdirSync(JS_DIR)
    .filter(f => f.endsWith('.js') && !EXCLUDE.has(f))
    .map(f => path.join(JS_DIR, f));
  const consumers = findConsumers(fields, files);

  const zeroUse = [];
  const intentionalZero = [];
  const actionableZero = [];
  const lowUse = [];
  const normalUse = [];
  for (const [k, consumersArr] of consumers) {
    if (consumersArr.length === 0) {
      zeroUse.push(k);
      if (INTENTIONAL_ZERO_FIELDS.has(k)) intentionalZero.push(k);
      else actionableZero.push(k);
    }
    else if (consumersArr.length <= 2) lowUse.push([k, consumersArr]);
    else normalUse.push([k, consumersArr.length]);
  }

  console.log('\n零消费字段 (' + zeroUse.length + '):');
  zeroUse.forEach(k => console.log('  - ' + k));
  if (intentionalZero.length) {
    console.log('\n已登记的说明字段 (' + intentionalZero.length + '):');
    intentionalZero.forEach(k => console.log('  - ' + k));
  }

  console.log('\n低消费字段（<=2 处）(' + lowUse.length + '):');
  lowUse.forEach(([k, arr]) => {
    console.log('  - ' + k + ' (' + arr.length + ' 处):');
    arr.slice(0, 3).forEach(c => console.log('      ' + c.file + ':' + c.line + '  ' + c.text));
  });

  console.log('\n正常消费字段 (' + normalUse.length + '):');
  normalUse.forEach(([k, n]) => console.log('  - ' + k + ' (' + n + ' 处)'));

  if (zeroUse.length > 0) {
    console.log('\nINFO: 零消费字段中，已登记的说明字段不参与 strict 门禁；');
    console.log('      其余零消费字段属于待处理数据契约。');
  }
  process.exit(STRICT && actionableZero.length > 0 ? 1 : 0);
}

main();
