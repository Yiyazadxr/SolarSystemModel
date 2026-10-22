# 贡献指南 · Contributing

## 中文

本仓库是一个零构建、可离线的单页 3D 太阳系演示。没有 npm 依赖，贡献流程很轻。开始之前请先读 [AGENTS.md](./AGENTS.md)——它记录了文件职责与「硬约束」。

### 开始之前

- 直接双击 `index.html` 即可运行；也可 `python -m http.server 8080` 后用浏览器打开
- 提交前请读一遍 [AGENTS.md](./AGENTS.md) 的「硬约束」与「命令与验证」两节
- 不需要安装任何依赖，也不需要构建

### 硬约束（改动不得违反）

- **只写 ES5**：不用 `let` / `const` / 箭头函数 / 模板字符串 / `class` / `async`；逐帧代码零分配，复用临时对象
- **零构建、零依赖**：不引入 npm 包、打包器、框架，不新增 `package.json`
- **运行时不联网**：不用 `fetch` / `XHR` / `WebSocket` / 外部字体与图片，资源全部本地化
- **`file://` 直开必须可用**：不得依赖服务端行为
- **WebGL1 为主路径**；不支持时给出双语提示，不白屏
- **生成物与第三方文件不要手改**：`assets/js/textures/`、`assets/js/textures-manifest.js`、`assets/js/vsop87.js` 由脚本生成；`assets/vendor/` 是官方原件

### 提交前检查

```bash
node scripts/check-syntax.js   # 至少跑这一个；完整清单见 AGENTS.md「命令与验证」
```

全部 14 项门禁都是零依赖脚本，直接 `node` 运行即可。改动教学数据时 `scripts/check-teach-data.js` 会校验契约；改动资源或目录结构时再跑 `scripts/check-assets.js` 与 `scripts/check-doc-counts.js`。

### 报告问题

用 [Issue 表单](https://github.com/Yiyazadxr/SolarSystem-Model/issues/new/choose) 提交。Bug 请附浏览器与版本、打开方式（`file://` 或本地服务器）、画质档与复现步骤；视觉问题请附截图，并写明 URL 中的 `#seed=` 种子，否则无法复现。

### 安全漏洞

发现安全问题请**不要**开公开 Issue——按 [SECURITY.md](./SECURITY.md) 的渠道私下报告。

### 提交 Pull Request

- 小而聚焦：一个 PR 只做一件事，正文说明「为什么」
- 视觉改动附前后截图（含种子、浏览器、画质档）；不要夸大验证范围，没验过的环境就写没验过
- 教学内容改动须注明来源（教材范围或公开资料），`scripts/check-teach-data.js` 会校验契约
- 生成物通过脚本重新生成后一并提交，不要手改生成结果

### 许可

代码按 [MIT](./LICENSE) 授权。提交即表示你同意自己的贡献以同一许可发布；纹理、天文数据与第三方组件的来源见 [NOTICE](./NOTICE)。参与即表示同意 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

## English

This repository is a zero-build, offline-capable single-page 3D solar-system demo with no npm dependencies, so contributing is lightweight. Read [AGENTS.md](./AGENTS.md) first — it maps the files and lists the hard constraints.

### Before you start

- Double-click `index.html` to run it, or serve the folder with `python -m http.server 8080`
- Read the "hard constraints" and "commands and checks" sections of [AGENTS.md](./AGENTS.md) before your first commit
- Nothing to install and nothing to build

### Hard constraints

- **ES5 only**: no `let` / `const` / arrow functions / template strings / `class` / `async`. Per-frame code must not allocate; reuse temporary objects
- **No build, no dependencies**: no npm package, bundler or framework; do not add a `package.json`
- **No network at runtime**: no `fetch` / `XHR` / `WebSocket`, no external fonts or images; all assets are local
- **`file://` must keep working**: never rely on server behaviour
- **WebGL1 is the primary path**; show a bilingual notice instead of a blank page when it is unavailable
- **Do not hand-edit generated or third-party files**: `assets/js/textures/`, `assets/js/textures-manifest.js` and `assets/js/vsop87.js` are generated; `assets/vendor/` holds the official builds

### Checks

```bash
node scripts/check-syntax.js   # the minimum; the full list is in AGENTS.md
```

All 14 checks are zero-dependency Node scripts. `scripts/check-teach-data.js` validates the teaching-data contract, and `scripts/check-assets.js` / `scripts/check-doc-counts.js` should be run when you touch assets or the directory layout.

### Reporting issues

Use the [issue forms](https://github.com/Yiyazadxr/SolarSystem-Model/issues/new/choose). For bugs include the browser and version, how the page was opened (`file://` or a local server), the quality tier and repro steps. For visual issues add screenshots plus the `#seed=` value from the URL, otherwise they cannot be reproduced.

### Security

**Do not** open a public issue for a security problem — report it privately as described in [SECURITY.md](./SECURITY.md).

### Pull requests

- Keep them small and single-purpose; explain **why** in the description
- Visual changes: before/after screenshots with the seed, browser and quality tier. Do not overstate validation — say so if an environment was not tested
- Teaching content changes must cite their sources; `scripts/check-teach-data.js` enforces the contract
- Regenerate generated files with the scripts and commit the output; never hand-edit it

### License

Code is released under the [MIT](./LICENSE) licence. By submitting a contribution you agree to license it under the same terms; sources for textures, astronomical data and third-party components are listed in [NOTICE](./NOTICE). Participation implies agreement with [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
