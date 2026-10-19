/* DOM 引用体检：JS 里 getElementById / byId / querySelector('#x') 查的 id，
   必须要么在 index.html 里静态存在，要么由 JS 自己创建（el.id = 'x'）。
   典型事故：画质控件从 <select> 换成分段按钮 #seg-quality、语言切换从顶栏按钮
   换成 #seg-lang 后，遗留引用全是 if(x) 空转的死路径——看得见、跑得到、
   但永远不执行。本脚本把这类漂移变成构建期报错。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const HTML = path.join(ROOT, 'index.html');

/* 只看静态 id 属性；模板串（'body-' + id）不在正则射程内，天然不会被误报 */
const HTML_ID = /\bid="([^"]+)"/g;
const CONSUMED = /(?:getElementById|byId)\(\s*['"]([^'"]+)['"]\s*\)|querySelector(?:All)?\(\s*['"]#([A-Za-z][\w-]*)['"]/g;
/* JS 动态创建：el.xxx.id = 'x' / node.id = 'x' */
const DEFINED = /\.id\s*=\s*['"]([^'"]+)['"]/g;

function main() {
  if (!fs.existsSync(HTML)) {
    console.error('ERR index.html 不存在');
    process.exit(1);
  }
  const html = fs.readFileSync(HTML, 'utf8');
  const htmlIds = new Set();
  let m;
  while ((m = HTML_ID.exec(html)) !== null) htmlIds.add(m[1]);

  const defined = new Set();
  const consumed = new Map();                 // id -> 引用位置列表
  let scanned = 0;
  for (const name of fs.readdirSync(JS_DIR).filter(function (f) { return f.endsWith('.js'); })) {
    scanned++;
    const lines = fs.readFileSync(path.join(JS_DIR, name), 'utf8').split('\n');
    for (let ln = 0; ln < lines.length; ln++) {
      CONSUMED.lastIndex = 0;
      let hit;
      while ((hit = CONSUMED.exec(lines[ln])) !== null) {
        const id = hit[1] || hit[2];
        if (!consumed.has(id)) consumed.set(id, []);
        consumed.get(id).push(name + ':' + (ln + 1));
      }
      DEFINED.lastIndex = 0;
      while ((hit = DEFINED.exec(lines[ln])) !== null) defined.add(hit[1]);
    }
  }

  const missing = [];
  consumed.forEach(function (where, id) {
    if (!htmlIds.has(id) && !defined.has(id)) missing.push(id + '  <- ' + where.join(', '));
  });
  missing.sort();

  console.log('扫描 ' + scanned + ' 个 JS 模块：index.html 静态 id ' + htmlIds.size +
    '，JS 动态创建 id ' + defined.size + '，JS 查询 id ' + consumed.size);
  if (missing.length) {
    missing.forEach(function (line) { console.log('ERR 查无此元素: ' + line); });
    console.log('\nDOM 引用漂移 ' + missing.length + ' 处（删除该引用，或把 id 补回 index.html）');
    process.exit(1);
  }
  console.log('OK  所有 JS 查询的 id 都存在于 index.html 或由 JS 创建');
}

main();
