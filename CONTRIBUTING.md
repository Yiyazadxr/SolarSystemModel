# 贡献指南 · Contributing

## 中文

本仓库没有构建步骤，也没有 npm 依赖，贡献流程很轻。

### 开始之前

- 直接双击 `index.html` 即可运行；也可 `python -m http.server 8080` 后用浏览器打开。
- 仓库约束较多，提交前请先读 [AGENTS.md](./AGENTS.md) 的「硬约束」一节。

### 硬约束（改动不得违反）

- **只写 ES5**：不用 `let` / `const` / 箭头函数 / 模板字符串 / `class` / `async`；逐帧代码零分配，复用临时对象。
- **零构建、零依赖**：不引入 npm 包、打包器、框架，不新增 `package.json`。
- **运行时不联网**：不用 `fetch` / `XHR` / `WebSocket` / 外部字体与图片，资源全部本地化。
- **`file://` 直开必须可用**：不得依赖服务端行为。
- **WebGL1 为主路径**；不支持时给出双语提示，不白屏。
- **生成物与第三方文件不要手改**：`assets/js/textures/`、`assets/js/textures-manifest.js`、`assets/js/vsop87.js` 由脚本生成；`assets/vendor/` 是官方原件。

### 提交前检查

```bash
node scripts/check-syntax.js   # 至少跑这一个；完整清单见 AGENTS.md「命令与验证」
```

全部 14 项门禁都是零依赖脚本，直接 `node` 运行即可。

### 报告问题

用 [Issue 表单](https://github.com/Yiyazadxr/SolarSystemModel/issues/new/choose) 提交。Bug 请附浏览器与版本、打开方式（`file://` 或本地服务器）、画质档与复现步骤；视觉问题请附截图，并写明 URL 中的 `#seed=` 种子，否则无法复现。

### 提交 Pull Request

- 小而聚焦：一个 PR 只做一件事，正文说明「为什么」。
- 视觉改动附前后截图（含种子、浏览器、画质档）；不要夸大验证范围，没验过的环境就写没验过。
- 教学内容改动须注明来源（教材范围或公开资料），`scripts/check-teach-data.js` 会校验契约。
- 提交即表示同意源代码部分按 [MIT](./LICENSE) 授权。

## English

No build step, no npm dependencies — contributing is lightweight.

### Before you start

- Double-click `index.html` to run; or serve the folder with `python -m http.server 8080`.
- Read the "hard constraints" section in [AGENTS.md](./AGENTS.md) first.

### Hard constraints

- **ES5 only**: no `let` / `const` / arrow functions / template strings / `class` / `async`. Per-frame code must not allocate; reuse temp objects.
- **No build, no dependencies**: no npm packages, bundlers or frameworks; do not add a `package.json`.
- **No network at runtime**: no `fetch` / `XHR` / `WebSocket` / external fonts or images.
- **`file://` must keep working**: never rely on server behaviour.
- **WebGL1 is the primary path**; show a bilingual notice instead of a blank page.
- **Do not hand-edit generated or third-party files**: `assets/js/textures/`, `assets/js/textures-manifest.js`, `assets/js/vsop87.js` are generated; `assets/vendor/` holds the official builds.

### Checks

```bash
node scripts/check-syntax.js   # the minimum; see AGENTS.md for the full list
```

All 14 checks are zero-dependency Node scripts.

### Reporting issues

Use the [issue forms](https://github.com/Yiyazadxr/SolarSystemModel/issues/new/choose). For bugs include browser and version, how you opened the page, quality tier and repro steps; for visual issues add screenshots and the `#seed=` value from the URL, otherwise they cannot be reproduced.

### Pull requests

- Keep them small and single-purpose; explain **why** in the description.
- Visual changes: before/after screenshots with seed, browser and quality tier. Do not overstate validation — say so if an environment was not tested.
- Teaching content changes must cite their sources; `scripts/check-teach-data.js` enforces the contract.
- By submitting you agree to license your source-code contribution under [MIT](./LICENSE).
