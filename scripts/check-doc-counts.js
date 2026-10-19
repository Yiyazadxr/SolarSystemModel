/* 文档与代码一致性校验：README 里那几个"小数"全是手写的，新增/删除模块、
   新增贴图、增删文件时极易漏改，读者会按过期数字理解工程规模。这里把数字钉死：
     1) 模块数：README（中 / 英）每一处「N 个模块」/「N modules」== assets/js 下 .js 文件数
                == index.html 里 assets/js script 条数
     2) 贴图张数：README「N 张」/「N textures」== assets/textures 下文件数
     3) 文件总数：README「当前 N 个文件」/「N files」== git ls-files --cached --others
                （已跟踪 + 未忽略的新增文件；等价于 git add -A 会纳入的集合。用 git 而非
                磁盘遍历，忽略列表里的临时文件不参与；新增文件在提交前也能校验）
     4) 双 README 互链：README.md 链到 README.en.md，README.en.md 链回 README.md
   另校验 AGENTS.md 内部的「见已知坑 N」交叉引用：新增/重编号「已知坑」后
   引用极易失效（例：「见已知坑 9」在重编号后指向错误条目），这里补上。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.argv[2] || path.join(__dirname, '..');
const README = path.join(ROOT, 'README.md');
const README_EN = path.join(ROOT, 'README.en.md');
const AGENTS = path.join(ROOT, 'AGENTS.md');
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
  let files = -1;
  try {
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(function (l) { return l.trim() !== ''; }).length;
  } catch (e) {
    files = -1;                                // 不在 git 环境里就跳过该项
  }
  return { moduleCount: moduleCount, htmlModules: htmlModules, texCount: texCount, files: files };
}

/* 把 text 里所有匹配到的数字与 want 对比；缺描述 / 数字写错都记 problem */
function checkDigits(problems, label, text, re, want, what) {
  if (want <= 0) return;
  const nums = [];
  let m;
  while ((m = re.exec(text)) !== null) nums.push(m[1]);
  if (nums.length === 0) {
    problems.push(label + ' 里找不到' + what + '的描述');
    return;
  }
  const wrong = nums.filter(function (n) { return Number(n) !== want; });
  if (wrong.length) {
    problems.push(label + '的' + what + '写的是 ' + wrong.join(' / ') + '，实际为 ' + want + '（改动后请同步）');
  }
}

function main() {
  const want = expected();
  const problems = [];

  /* 1) 模块数（中英各校验一轮，并与 index.html 脚本条数对齐） */
  const readme = fs.readFileSync(README, 'utf8');
  checkDigits(problems, 'README.md', readme, /(\d+)\s*个模块/g, want.moduleCount, '模块数');
  if (want.htmlModules !== want.moduleCount) {
    problems.push('index.html 加载了 ' + want.htmlModules + ' 个 assets/js 脚本，磁盘上有 ' +
      want.moduleCount + ' 个模块（有模块没被引用或引用了不存在的文件）');
  }

  /* 2) 贴图张数 */
  checkDigits(problems, 'README.md', readme, /(\d+)\s*张/g, want.texCount, '贴图数');

  /* 3) 仓库文件总数 */
  checkDigits(problems, 'README.md', readme, /当前\s*(\d+)\s*个文件/g, want.files, '文件总数');

  /* 4) 英文版同口径 + 双 README 互链 */
  const hasEn = fs.existsSync(README_EN);
  if (!hasEn) {
    problems.push('README.en.md 不存在（中英双版需同时维护）');
  } else {
    const readmeEn = fs.readFileSync(README_EN, 'utf8');
    checkDigits(problems, 'README.en.md', readmeEn, /(\d+)\s+modules\b/g, want.moduleCount, 'module count');
    checkDigits(problems, 'README.en.md', readmeEn, /(\d+)\s+textures\b/g, want.texCount, 'texture count');
    checkDigits(problems, 'README.en.md', readmeEn, /(\d+)\s+files\b/g, want.files, 'file count');
    if (readmeEn.indexOf('./README.md') < 0) {
      problems.push('README.en.md 缺少指回 README.md 的语言链接');
    }
  }
  if (readme.indexOf('./README.en.md') < 0) {
    problems.push('README.md 缺少指向 README.en.md 的语言链接');
  }

  /* 5) AGENTS.md「见已知坑 N」引用校验：编号必须存在，且引用行与被引坑条目
        至少共享一个反引号标识符（重编号后「9」仍然存在、只是指向了错误条
        目——只验编号存在性拦不住，必须做内容关联）。引用行没有标识符时
        退化为只验编号。 */
  if (fs.existsSync(AGENTS)) {
    const agents = fs.readFileSync(AGENTS, 'utf8');
    const section = agents.match(/## 已知坑([\s\S]*?)(?=\n## |$)/);
    const sectionText = section ? section[1] : '';
    const pitNums = [];
    const pitStarts = [];
    const rePit = /^(\d+)\.\s+\*\*/gm;
    let pm;
    while ((pm = rePit.exec(sectionText)) !== null) { pitNums.push(Number(pm[1])); pitStarts.push(pm.index); }
    function pitEntry(n) {
      const i = pitNums.indexOf(n);
      if (i < 0) return '';
      const from = pitStarts[i];
      const to = i + 1 < pitStarts.length ? pitStarts[i + 1] : sectionText.length;
      return sectionText.slice(from, to);
    }
    const reRefLine = /^.*见已知坑\s*(\d+).*$/gm;
    let rl;
    while ((rl = reRefLine.exec(agents)) !== null) {
      const line = rl[0];
      const n = Number(rl[1]);
      if (pitNums.indexOf(n) < 0) {
        problems.push('AGENTS.md「见已知坑 ' + n + '」指向不存在的编号（现有 [' + pitNums.join('/') + ']）');
        continue;
      }
      const tokens = (line.match(/`[^`]+`/g) || [])
        .map(function (t) { return t.slice(1, -1); })
        .filter(function (t) { return t.length >= 4; });
      if (!tokens.length) continue;
      const entry = pitEntry(n);
      const hit = tokens.some(function (t) { return entry.indexOf(t) !== -1; });
      if (!hit) {
        problems.push('AGENTS.md 引用行「…见已知坑 ' + n + '…」与该坑条目无共同标识符（' +
          tokens.join(' / ') + '），引用可能指向错误条目（重编号后请同步）');
      }
    }
  }

  if (problems.length) {
    problems.forEach(function (p) { console.log('ERR ' + p); });
    process.exit(1);
  }
  console.log('OK  文档数字与代码一致（模块 ' + want.moduleCount + ' / 贴图 ' +
    want.texCount + ' / 文件 ' + want.files + '，中英 README 互链正常）');
}

main();
