# AGENTS.md

## 项目定位

单页 3D 太阳系可视化：八行星 VSOP87 J2000 要素星历、太阳系整体绕银心公转、科幻黑白 HUD、中英双语。
**零构建、零运行时依赖、运行时不联网**，双击 `index.html` 即可运行。

- 语言：ES5 + IIFE，无模块化 / 无转译 / 无框架
- 引擎：Three.js **r128 UMD**，已本地化到 `assets/vendor/`
- 命名空间：`window.SOLAR.<Module>`（如 `SOLAR.Scene`、`SOLAR.UI`、`SOLAR.SceneShared`、`SOLAR.UIShared`）
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

`index.html` 的加载顺序即依赖顺序。`scene` / `ui` / `teach-globe` 三大件已按层拆分，**门面仍是 `scene.js` / `ui.js` / `teach-globe.js`，对外 API 不变**：

| 文件 | 职责 |
| --- | --- |
| `config.js` | 全局可调参数：缩放 / 时间 / 画质四档 / 相机 / 银河 / 配色 |
| `data.js` | 天体数据：J2000 根数 + 物理参数 + 卫星（含 JPL 朝向三根数 Ω/ω/M₀）+ 彗星 + 环带 |
| `i18n.js` | 中英双语词包（`SOLAR.I18N`），缺键回落英文 |
| `vsop87.js` | IMCCE VSOP87 主版本八行星要素级数（生成物；地球项为 EMB） |
| `astro.js` | 开普勒方程求解、行星位置、轨道采样、儒略日换算 |
| `textures.js` | 内嵌 base64 贴图（生成物） |
| `effects.js` | 后期：分层 Bloom + 收尾 shader（暗角 / 扫描线 / 色散 / 颗粒 / 高光压缩） |
| `scene-shaders.js` | 场景层 GLSL 源码：太阳 / 行星 / 大气 / 环 / 星点 等 shader 字符串（`SOLAR.Shaders`） |
| `scene-shared.js` | 场景共享状态注册表：节点表 / 临时向量池 / disposal（`SOLAR.SceneShared`） |
| `scene-gfx.js` | 图形构建工具：几何 / 材质 / 纹理 的构造与复用、渲染共用件（`SOLAR.Gfx`） |
| `scene-sun.js` | 太阳与日冕：米粒组织 / 临边昏暗 / 黑子 / 日冕辉光、场景主光源（`SOLAR.Sun`） |
| `scene-bodies.js` | 行星 / 卫星 / 矮行星 / 彗星 的构建与外观绑定（含环与拖尾）（`SOLAR.Bodies`） |
| `scene-backdrop.js` | 天穹与远景：ESO 银河全景 sky dome、程序化星点、小行星带与柯伊伯带、轨道线（`SOLAR.Backdrop`） |
| `scene.js` | `SOLAR.Scene` 门面：装配上述子模块并转发；横切的逐帧 `update` 留在此 |
| `galaxy.js` | 银河模型 + 太阳系绕银心公转 + 太阳公转拖尾（始终显示 + 距离提亮） |
| `controls.js` | 相机控制、拾取、飞行、跟随、巡航、连珠切换 |
| `ui-shared.js` | UI 共享宿主：dom 缓存 + 跨模块状态（`SOLAR.UIShared`） |
| `ui-util.js` | 界面层基础工具：DOM 查询 / 数字与单位格式化 / 天体记录检索等纯函数，不持有 dom 缓存与跨模块状态（`SOLAR.UIUtil`） |
| `ui-dom.js` | 界面层 DOM 缓存：一次性取回信息卡 / 顶栏 / 设置面板 / 时间条等节点写入 `SOLAR.UIShared.dom`，并注册视图条点击监听（`SOLAR.UIDom`） |
| `ui-nav.js` | 左侧天体导航：搜索、列表与选中联动；信息卡分区折叠（`SOLAR.UINav`） |
| `ui-info.js` | 信息卡分区渲染（仪表盘与文字）与刷新、选中 / 高亮的跨模块转发（`SOLAR.UIInfo`） |
| `ui-settings.js` | 设置面板：画质 / 倍速 / 后期开关 / 语言等（`SOLAR.UISettings`） |
| `ui-time.js` | 时间控制：倍速 / 播放暂停 / 日期跳转；`SOLAR.time` 定义在此（`SOLAR.UITime`） |
| `ui-shell.js` | HUD 外壳：面板开关、快捷键弹层、沉浸模式与提示条（`SOLAR.UIShell`） |
| `ui.js` | `SOLAR.UI` 门面：装配上述子模块并转发；横切的 `applyLanguage` 留在此 |
| `main.js` | 启动引导、加载进度、主循环、自适应画质 |
| `teach-data.js` | 教学内容数据（第3章第1节《认识地球》，4 个场景 + 来源索引） |
| `teach-globe-shared.js` | 教学地球仪共享宿主：场景图节点表 + disposal 注册表 + 临时对象池（`SOLAR.TeachGlobeShared`） |
| `teach-globe-shaders.js` | 教学装置 GLSL 源码：地球表面 / 云层 / 地影 等 shader 字符串（原内联字符串集中于此，只放源码、不含逻辑） |
| `teach-globe-body.js` | 地球仪本体：球体、材质、自转与昼夜、朝向附件 |
| `teach-globe-scenes.js` | 四个观察场景装置：远去的船只 / 月食 / 麦哲伦环球航线 / 从太空看见地球 |
| `teach-globe-apply.js` | 场景套用：真实 / 示意双档参数与取景的应用 |
| `teach-globe.js` | `SOLAR.TeachGlobe` 门面：装配上述子模块并转发；横切的逐帧 `update` 留在此 |
| `teach-orrery.js` | 教学装置兼容层（旧三球仪代码，当前不启用） |
| `teach-scenes.js` | 教学装置调度层 |
| `teach.js` | 教学模式主控与自建 UI（右下角入口，与演示模式隔离） |

> 新文件的内部边界以各自的顶部注释为准；门面 `scene.js` / `ui.js` / `teach-globe.js` 的对外 API（`SOLAR.Scene.*` / `SOLAR.UI.*` / `SOLAR.TeachGlobe.*`）与调用方式保持原样。

## 模块拆分约定（scene / ui / teach-globe 已拆分，再拆时必读）

为什么要拆：三个文件分别 2–3 千行，改一处要在几千行里跳转，命名空间只有一个，任何小改动都要重读整个文件。按层拆开后，单个改动的影响面收敛到一个文件，门面保持对外契约，老调用点不用动。代价是文件数增多、装配顺序变敏感，因此固定以下约定：

1. **跨模块调用必须运行时限定名**（`SOLAR.Xxx.fn()`）。不得在 IIFE 顶层缓存别的模块暴露的函数引用——拆分后各文件可独立演进，顶层缓存会让"只改一边、漏另一边"。
2. **共享状态只放各自的 `*Shared` 模块**（`SOLAR.SceneShared` / `SOLAR.UIShared` / `SOLAR.TeachGlobeShared`），私有状态留在归属模块。`*Shared` 只做宿主（表 / 池 / 注册），不写业务逻辑。
3. **新增文件必须同步两处装配**：`index.html` 的 `<script src>` 顺序，与 `scripts/check-script-order.js` 的 `EXPECTED_ORDER`；漏一处 `check-script-order` 直接失败。
4. **拆分时"只搬运不改逻辑"**。行为变更单独提交，否则回归无法定位是哪一步引入的。
5. **横切函数留在门面**：`SOLAR.Scene.update`、`SOLAR.TeachGlobe.update`、`SOLAR.UI.applyLanguage` 这类一次要穿过多个子模块的逻辑，在门面里调度，不下沉到某个子模块。
6. **对外契约不变**：拆分后 `SOLAR.Scene` / `SOLAR.UI` / `SOLAR.TeachGlobe` 的方法签名与调用方式保持原样；新的 `SOLAR.Xxx` 子命名空间是内部实现细节，不对外承诺。

## 关键 API（脚本化 / 自动化验证用）

- `SOLAR.setManualQuality(name)` — 手动选档。**只阻止自动"回升"，不阻止自动"降级"**。
- `SOLAR.CONFIG.autoDegrade.enabled = false` — 彻底关掉自适应画质。
- `SOLAR.Scene.worldPositionOf(id)` — 天体世界坐标（**重要，见"已知坑"第 1 条**）。
- `SOLAR.Scene.getTriangleCount()` / `getSunScreenFraction()` / `radiusOf(id)`
- `SOLAR.Controls.getControls()` — 返回 OrbitControls（`.object` 是相机，`.target` 是注视点）
- `SOLAR.Controls.goToPreset(name)` / `isFlying()` / `pick` / `hover`
- `SOLAR.UI.select(id)` / `applyLanguage(lang)`
- `SOLAR.time` — 时间状态（`jd` / `simDays` / `speed` / `playing` / `reverse`）。**拆分后定义在 `ui-time.js`，契约不变**，直接 `SOLAR.time.xxx` 读写即可
- 预设视角名：`home` / `ecliptic` / `inner` / `outer` / `top` / `align`

## 已知坑（实测，勿重踩）

1. **太阳系世界坐标不在原点**。整个系统绕银心公转，`worldPositionOf('sun')` ≈ `[4190,-260,150]` 且随公转缓慢漂移。任何"把相机设到某个绝对坐标"的操作都必须**相对 `worldPositionOf(id)` 定位**，否则会拍到银心空域——满屏星点、没有太阳系。
2. **有东西每帧在改写 `controls.target`**（公转带动整套相机机位）。设完相机后不要假设 `target` 仍是 `(0,0,0)`。
3. **`setManualQuality` 之后的画质仍可能被静默降档**（低帧触发自适应）。截图 / 做基准前务必先 `SOLAR.CONFIG.autoDegrade.enabled = false`。
4. **`SOLAR.UI.applyLanguage('zh')` 静默无效**：返回 `'zh'` 不抛错，但界面语言不变（**已知遗留问题，未修**）。
5. **银河盘面 = XZ 平面绕 X 轴转 60.2°**（`config.galaxy.tiltDeg`）。正侧视（相机落在盘面内）会把盘面压成**贯穿全屏的 1px 直线**，形似渲染接缝；需抬离盘面约 6° 才能得到可读的"银河带"。
6. **无头环境只有 SwiftShader 软件渲染**，FPS 数值无参考意义（1–20）。只可用于相对比较，**禁止写入任何性能结论**。
7. **`SOLAR.time` 已从 `ui.js` 迁到 `ui-time.js`**。外部契约不变（照旧 `SOLAR.time.xxx` 读写，`galaxy.js` / `main.js` / `teach.js` 的读法都不用改），但改时间控制逻辑请直接去 `ui-time.js` 找，`ui.js` 只是门面转发。
8. **拆分文件的职责边界要看各自的顶部注释**，不要凭文件名猜。文档表格是导航用的，改了内部边界要同步改「架构地图」。

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
- 视觉或渲染结论必须附证据（截图或像素统计），且**断言不等于验证**——自动化断言之后请用户帮忙目视确认。

## "完成"的定义

1. 改 JS → 至少跑过 `node --check`（跳过 `textures.js`）。
2. 改视觉 / 画质 → 跑断言或数值即可；**目视复核只在用户明确要求时执行**，一般做法是改完后请求用户帮忙查看。
3. 任何"修好了"的结论，必须写明**证据**与**所依赖的前提**。
