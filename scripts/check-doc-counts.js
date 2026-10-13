/* 文档与代码一致性校验：README 里那几个"小数"全是手写的，新增/删除模块、
   新增贴图时极易漏改，读者会按过期数字理解工程规模。这里把三组数字钉死：
     1) 模块数：README 每一处「N 个模块」== assets/js 下 .js 文件数
                == index.html 里 assets/js script 条数
     2) 贴图张数：README「N 张」== assets/textures 下文件数
     3) 仓库文件数：README「当前 N 个文件」== git ls-files 条数（用受版本控制
                的文件数而非磁盘遍历，未跟踪的临时文件不参与） */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const TEX_DIR = path.join(ROOT, 'assets', 'textures');
const HTML = path.join(ROOT, 'index.html');

function expected() {
  const moduleCount = fs.readdirSync(JS_DIR).filter(function (f) { return f.endsWith('.js'); }).length;
  const html = fs.readFileSync(HTML, 'utf8');
  const htmlModules = (html.match(/<script src="assets\/js\/[^"]+"><\/script>/g) || []).length;
  const texCount = fs.existsSync(TEX_DIR)
    ? fs.readdirSync(TEX_DIR).filter(function (f) { return /\.(png|jpe?g|webp)$/i.test(f); }).length
    : 0;
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(function (l) { return l.trim() !== ''; }).length;
  } catch (e) {
    tracked = -1;                              // 不在 git 环境里就跳过该项
  }
  return { moduleCount: moduleCount, htmlModules: htmlModules, texCount: texCount, tracked: tracked };
}

function allNumbers(text, re) {
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function main() {
  const want = expected();
  const readme = fs.readFileSync(README, 'utf8');
  const problems = [];

  /* 1) 模块数：README 每处「N 个模块」都必须等于真实值 */
  const docModules = allNumbers(readme, /(\d+)\s*个模块/g);
  if (docModules.length === 0) {
    problems.push('README 里找不到「N 个模块」的模块数描述');
  } else {
    const wrong = docModules.filter(function (n) { return Number(n) !== want.moduleCount; });
    if (wrong.length) {
      problems.push('README 模块数写的是 ' + wrong.join('/') + '，实际 assets/js 有 ' +
        want.moduleCount + ' 个模块');
    }
  }
  if (want.htmlModules !== want.moduleCount) {
    problems.push('index.html 加载了 ' + want.htmlModules + ' 个 assets/js 脚本，磁盘上有 ' +
      want.moduleCount + ' 个模块（有模块没被引用或引用了不存在的文件）');
  }

  /* 2) 贴图张数 */
  if (want.texCount > 0) {
    const docTex = allNumbers(readme, /(\d+)\s*张/g);
    const wrong = docTex.filter(function (n) { return Number(n) !== want.texCount; });
    if (docTex.length === 0) problems.push('README 里找不到「N 张」贴图数描述');
    else if (wrong.length) {
      problems.push('README 贴图数写的是 ' + wrong.join('/') + '，实际 assets/textures 有 ' +
        want.texCount + ' 张');
    }
  }

  /* 3) 仓库文件总数 */
  if (want.tracked > 0) {
    const docFiles = allNumbers(readme, /当前\s*(\d+)\s*个文件/g);
    if (docFiles.length === 0) problems.push('README 里找不到「当前 N 个文件」描述');
    else if (Number(docFiles[0]) !== want.tracked) {
      problems.push('README 写"当前 ' + docFiles[0] + ' 个文件"，git ls-files 实际 ' +
        want.tracked + ' 个（新增文件后请同步）');
    }
  }

  if (problems.length) {
    problems.forEach(function (p) { console.log('ERR ' + p); });
    process.exit(1);
  }
  console.log('OK  文档数字与代码一致（模块 ' + want.moduleCount + ' / 贴图 ' +
    want.texCount + ' / 文件 ' + want.tracked + '）');
}

main();
