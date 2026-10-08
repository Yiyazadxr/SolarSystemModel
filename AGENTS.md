# AGENTS.md

## 项目定位

单页 3D 太阳系可视化：真实 J2000 轨道根数、太阳系整体绕银心公转、科幻黑白 HUD、中英双语。
**零构建、零运行时依赖、运行时不联网**，双击 `index.html` 即可运行。

- 语言：ES5 + IIFE，无模块化 / 无转译 / 无框架
- 引擎：Three.js **r128 UMD**，已本地化到 `assets/vendor/`
- 命名空间：`window.SOLAR.<Module>`（如 `SOLAR.Scene`、`SOLAR.UI`）
- 装配：`index.html` 按固定顺序引入 `assets/js/*.js`，**顺序即依赖顺序，不可打乱**

## 硬约束（违反即破坏项目）

1. **只能写 ES5**。禁用 `let` / `const` / 箭头函数 / 模板字符串 / `class` / 解构 / 展开运算符 / 默认参数 / `async`-`await` / 原生 `Promise`（运行时代码）。一律 `var` + IIFE。
2. **零构建、零依赖**。不引入 npm 包、打包器、TypeScript、ESM；没有也不应新增 `package.json`。
3. **运行时不发任何外部请求**。贴图以 base64 内嵌在 `assets/js/textures.js`。
4. **必须支持 `file://` 直开**。不得依赖 `fetch` / `XHR` 读取本地文件。
5. **WebGL1 为主路径**。探测顺序 `webgl` → `experimental-webgl` → `webgl2`；不支持时在加载层给中英双语提示，不白屏。
6. **`assets/js/textures.js` 是生成物，勿手改**（8.5 MB base64）。改贴图请跑生成脚本。

## 命令与验证

本仓库**没有**测试框架、linter、构建脚本，也没有 `package.json`。`scripts/` 下是零依赖的 Node 自检脚本，直接 `node` 运行：

```bash
node scripts/check-syntax.js         # 逐文件语法校验（自动跳过 textures.js）
node scripts/check-es5.js            # 禁用 ES6+ 运行时语法
node scripts/check-offline.js        # 禁止 fetch / XHR / WebSocket 等联网 API
node scripts/check-script-order.js   # index.html 加载顺序与依赖表一致
node scripts/check-i18n.js           # en/zh 键对称 + SOLAR.t / data-i18n 消费键存在
node scripts/check-data.js           # data.js 字段消费率（默认只报告，--strict 才失败）
node scripts/check-assets.js         # 脚本 / 样式 / 贴图等资产存在性
```

- 若是手动逐文件语法检查（**必须跳过 `textures.js`**——8.5 MB base64，检查无意义且极慢）：

  ```bash
  node --check assets/js/config.js   # 其余模块同理
  ```

- 贴图重新内嵌 / 校验：

  ```bash
  node scripts/generate-textures.js          # 重新生成 assets/js/textures.js
  node scripts/generate-textures.js --check  # 校验与 assets/textures/ 是否一致
  ```

- 手动运行：直接开 `index.html`，或 `python -m http.server 8080`。

## 架构地图

`index.html` 的加载顺序即依赖顺序：

| 文件 | 职责 |
| --- | --- |
| `config.js` | 全局可调参数：缩放 / 时间 / 画质四档 / 相机 / 银河 / 配色 |
| `data.js` | 天体数据：J2000 根数 + 物理参数 + 卫星（含 JPL 朝向三根数 Ω/ω/M₀）+ 彗星 + 环带 |
| `i18n.js` | 中英双语词包（`SOLAR.I18N`），缺键回落英文 |
| `astro.js` | 开普勒方程求解、行星位置、轨道采样、儒略日换算 |
| `textures.js` | 内嵌 base64 贴图（生成物） |
| `effects.js` | 后期：分层 Bloom + 收尾 shader（暗角 / 扫描线 / 色散 / 颗粒 / 高光压缩） |
| `scene.js` | 太阳 / 行星 / 卫星 / 轨道 / 星空 / 带 / 彗星 的构建与逐帧更新 |
| `galaxy.js` | 银河模型 + 太阳系绕银心公转 + 太阳公转拖尾（始终显示 + 距离提亮） |
| `controls.js` | 相机控制、拾取、飞行、跟随、巡航、连珠切换 |
| `ui.js` | 导航、信息卡 9 分区、时间控制、设置、快捷键、语言应用 |
| `main.js` | 启动引导、加载进度、主循环、自适应画质 |
| `teach-data.js` | 教学内容数据（第3章第1节《认识地球》，4 个场景 + 来源索引） |
| `teach-globe.js` | 教学装置：地球仪与四个地球形状观察场景 |
| `teach-orrery.js` | 教学装置兼容层（旧三球仪代码，当前不启用） |
| `teach-scenes.js` | 教学装置调度层 |
| `teach.js` | 教学模式主控与自建 UI（右下角入口，与演示模式隔离） |

## 关键 API（脚本化 / 自动化验证用）

- `SOLAR.setManualQuality(name)` — 手动选档。**只阻止自动"回升"，不阻止自动"降级"**。
- `SOLAR.CONFIG.autoDegrade.enabled = false` — 彻底关掉自适应画质。
- `SOLAR.Scene.worldPositionOf(id)` — 天体世界坐标（**重要，见"已知坑"第 1 条**）。
- `SOLAR.Scene.getTriangleCount()` / `getSunScreenFraction()` / `radiusOf(id)`
- `SOLAR.Controls.getControls()` — 返回 OrbitControls（`.object` 是相机，`.target` 是注视点）
- `SOLAR.Controls.goToPreset(name)` / `isFlying()` / `pick` / `hover`
- `SOLAR.UI.select(id)` / `applyLanguage(lang)`
- 预设视角名：`home` / `ecliptic` / `inner` / `outer` / `top` / `align`

## 已知坑（实测，勿重踩）

1. **太阳系世界坐标不在原点**。整个系统绕银心公转，`worldPositionOf('sun')` ≈ `[4190,-260,150]` 且随公转缓慢漂移。任何"把相机设到某个绝对坐标"的操作都必须**相对 `worldPositionOf(id)` 定位**，否则会拍到银心空域——满屏星点、没有太阳系。
2. **有东西每帧在改写 `controls.target`**（公转带动整套相机机位）。设完相机后不要假设 `target` 仍是 `(0,0,0)`。
3. **`setManualQuality` 之后的画质仍可能被静默降档**（低帧触发自适应）。截图 / 做基准前务必先 `SOLAR.CONFIG.autoDegrade.enabled = false`。
4. **`SOLAR.UI.applyLanguage('zh')` 静默无效**：返回 `'zh'` 不抛错，但界面语言不变（**已知遗留问题，未修**）。
5. **银河盘面 = XZ 平面绕 X 轴转 60.2°**（`config.galaxy.tiltDeg`）。正侧视（相机落在盘面内）会把盘面压成**贯穿全屏的 1px 直线**，形似渲染接缝；需抬离盘面约 6° 才能得到可读的"银河带"。
6. **无头环境只有 SwiftShader 软件渲染**，FPS 数值无参考意义（1–20）。只可用于相对比较，**禁止写入任何性能结论**。

## 代码风格

- 注释用**中文**，解释"为什么这么做"而非"做了什么"（沿用本仓库既有风格）。
- 2 空格缩进，`var`，函数声明优先。
- 新特性一律"探测 + 兜底"（如 OrbitControls 缺失时回落到自研控制器）。
- **逐帧零分配**：循环内复用临时向量 / 对象，不要 `new`。
- 画质相关数值集中在 `config.js` 的 `quality` 段与 `effects.js` 的 `BLOOM_BASE` / `GRAIN_BASE` 表。

## 协作约定

- **未经明确要求，不要 commit / push / 建分支 / 发 PR。**
- 不改 `assets/vendor/` 下的第三方文件。
- 不要删除 README 中的"验证状态""已知限制"等诚实披露段落，也不要夸大验证范围（Firefox / Safari / 真实 GPU 均未实测）。
- 视觉或渲染结论必须附证据（截图或像素统计），且**断言不等于验证**——自动化断言之后仍要目视复核。

## "完成"的定义

1. 改 JS → 至少跑过 `node --check`（跳过 `textures.js`）。
2. 改视觉 / 画质 → 无头 Chrome 出图 + **目视复核**，不能只看断言或数值。
3. 任何"修好了"的结论，必须写明**证据**与**所依赖的前提**。
