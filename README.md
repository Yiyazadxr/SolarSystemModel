<div align="center">

# SOLAR SYSTEM · 太阳系 3D 展示

一个开箱即用的单页 3D 太阳系：真实 J2000 轨道根数驱动、太阳系整体绕银心公转、科幻黑白 HUD、中英双语，全部资源本地化（**运行时不访问外网**）。

[![Stars](https://img.shields.io/github/stars/Yiyazadxr/SolarSystem?style=flat-square)](https://github.com/Yiyazadxr/SolarSystem/stargazers)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](./LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-r128-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org)
[![Build: none](https://img.shields.io/badge/build-none%20(零构建)-brightgreen?style=flat-square)](#运行)
[![Offline 100%](https://img.shields.io/badge/offline-100%25-2ea44f?style=flat-square)](#运行)
[![Zero runtime deps](https://img.shields.io/badge/runtime_deps-0-blueviolet?style=flat-square)](#目录结构)

[提交 Issue](https://github.com/Yiyazadxr/SolarSystem/issues) · [许可](#许可)

<p align="center">
  <img src="./docs/screenshots/home-overview.png" alt="太阳系 3D 展示主界面" width="920">
</p>

</div>

---

## 功能特性

- **真实天体** 🪐 — 太阳、八大行星、冥王星、11 颗主要卫星（含卡戎）、小行星带、柯伊伯带、1P/Halley 彗星；行星 J2000 六根数 + 每世纪变化率（外行星叠加 JPL 附加摄动项），卫星朝向三根数取自 JPL 行星卫星平根数（升交点 Ω / 近心点幅角 ω / 平近点角 M₀），轨道线与卫星共用同一条开普勒朝向链路
- **程序化渲染** ☀️ — 太阳米粒组织 / 临边昏暗 / 较差自转 / 黑子，分层日冕；行星程序化凹凸、纬向条纹、大红斑、菲涅尔大气辉光、日落色、环影与日月食投影
- **银河系公转** 🌌 — 默认常驻：太阳系整体沿**真实倾角 60.2°** 的银道面绕银心公转（220 km/s / 26,000 ly / 230 Myr），拉远即可看到它正在银河系中绕行。演示节奏 `orbitSeconds = 900`（一个银河年约 15 分钟转一圈，可按需调）；日心距在场景中为 `radiusUnits = 25000`，配合 `maxDistance 80000` / `far 160000` 可拉远到银河尺度观察太阳系绕行
- **太阳公转拖尾** 🌠 — 太阳**实际走过**的银心轨道轨迹（非理想闭合圆：含进动与银道面准正弦振荡）：任何机位**始终显示**，不随机位/距离淡出；随相机拉远整体轻微提亮（封顶 ×1.5），渐隐只占尾部 30%、主体全程可读；独立于画质档与设置里的「运动拖尾」开关
- **显示比例两档** 📏 — 设置面板「显示比例」可在 **压缩示意（compact）** 与 **弱压缩示意（faithful）** 间切换，只改距离与尺寸映射，**轨道、周期、光照关系不变**：
  - **压缩示意**：默认档。`distanceExp 0.62 / sizeExp 0.50 / sunSizeFactor 0.45`，距离用对数压缩，内行星舒展、便于整体观察
  - **弱压缩示意**：更接近真实。`distanceBase 2000`、`distanceExp 0.85`（轨道比接近真实，AU 幂律压缩）、`sizeExp 0.62`（天体半径比接近真实）、`sunSizeFactor 1.0`、卫星距离锚定母星半径 `moonDistPow 0.7`、月/地大小比还原真实 0.273。因深度缓冲限制，真实比例仍无法实现（`config.js` 有说明），所以天体半径 ∶ 轨道半径仍被压缩——以地球计：真实轨道/半径 23,481，显示 585（约 40 倍）。轨道外推的上限与取舍（全览极限 1340 / far 硬顶 2877，取 2000、放弃银河视角保真）的完整推导见 `config.js` → `profiles.faithful` 注释块
  - 每个天体被压缩的倍数会在**信息卡**里如实标注，两档数值均由 `config.js` 的 `profiles` 段集中管理，切档时距离、尺寸、太阳、卫星、环、彗星、小行星带**整体同步重算**
- **科学化银河模型** ✨ — 棒状核球 + 对数螺旋主臂（Scutum–Centaurus / Perseus / Sagittarius / Orion Spur）+ 尘埃暗带 + HII 区 + 差动自转
- **时间控制** ⏱️ — 1× 实时 → 1e9 倍速共 10 档、时间倒流、日期跳转；固定步长积分 + 欠账结转，高速下不跳轨
- **相机与视角** 🎥 — 滚轮对准光标缩放、电影化飞行（可打断）、软跟随、自动巡航、5 组预设视角、行星连珠 + `←` `→` 切换
- **界面** 🖥️ — 左侧天体导航（可搜索 / 可收起）、9 分区可折叠信息卡、设置面板、显示比例分段（压缩示意 / 弱压缩示意）、Bloom / 扫描线 / 暗角 / 颗粒后期、自适应画质（中英双语全覆盖）。玻璃拟态 + 统一圆角语言：渐变标题字、发光胶囊开关、胶囊银河数据条、悬浮式时间控制条、斑马纹数据表、渐变对比条、面板入场动画
- **轨道着色** 🎨 — 轨道线以中性灰为底、混入各天体本色约 38%，远观统一、近看可辨；天体标签为圆角半透明底衬 + 强调点样式
- **教学模式** 🎓 — 课堂讲解模式：右下角入口，按教材章节逐步演示。当前只保留第 3 章第 1 节《认识地球》的四个场景，与演示模式完全隔离，详见 [教学模式](#教学模式)
- **画质四档** 🎚️ — `ULTRA / HIGH / MEDIUM / LOW`。ULTRA 为「超极限」档：球体细分 128×96（太阳 192×128）、环 384 段、小行星 40,000 / 柯伊伯 24,000 / 星空 60,000 点、银河 90,000 颗、像素比上限 4、Bloom 强度 1.15（半径 0.80 / 阈值 0.10）、颗粒 0.045，全效果开启（约 293k 三角面 / 218k 点，是 HIGH 的 2.7 倍与 4.2 倍）。默认仍为 `HIGH`；手动选档后不再自动**回升**，但帧率过低时自动**降级**仍会生效（ULTRA 撑不住会退到 HIGH）

## 教学模式

面向课堂的讲解模式，**与演示模式互相隔离**：画面右下角「教学模式」进入，`Esc` 或「退出教学」返回。

- **导览**：章 → 节 → 步骤三级目录，当前为第 3 章第 1 节「认识地球」共 4 个场景：远去的船只、月食、麦哲伦环球航线、从太空看见地球。每步骤 = 讲解正文 + 知识要点 + 相机自动飞行 + 场景状态切换；`←` `→` `空格` 翻页，`Esc` 退出
- **场景装置**：四个场景统一使用地球仪渲染层，航线、船只、月食地影和太空地球均为程序化图形，运行时不请求外部资源
- **示意比例**：教学底部控制条保留真实 / 示意双档，只改教学装置的显示尺寸与取景距离；四个场景的观察关系和动画方向保持一致
- **教材范围**：只讲地球形状的四项观察证据，暂不包含地球大小、经纬网、地图、电子地图、北斗或人造卫星专题
- **模式隔离**：进入时锁定 HIGH 画质、关闭自动升降画质、冻结演示模式时间系统（含银河公转）、隐藏真实太阳系与银河系背景、隐藏主 HUD，退出时逐项还原；教学内的时间流速由控制条独立控制
- **内容范围**：当前仅保留《科学》教材第 3 章第 1 节《认识地球》的地球形状四场景。其余章节和旧练习已移除
- **UI**：正文 ≥20px、按钮 ≥44px 触摸尺寸、高对比毛玻璃，面向希沃白板与投影设计；相机走 `SOLAR.Controls.goToView`，不随银河位移漂移

## 运行

**方式一：直接双击 `index.html`**（推荐）。贴图已内嵌为 base64，`file://` 协议下也能正常加载，无需任何服务器。

**方式二：本地服务器**（若浏览器策略限制了 `file://` 下的某些行为，或想用 http 调试）：

```bash
cd d:/SolarSystem
python -m http.server 8080        # 然后访问 http://localhost:8080
# 或者：npx serve -l 8080 .
```

> [!NOTE]
> 最低要求：支持 WebGL 的桌面浏览器（Chrome / Edge / Firefox / Safari 均可）。
> WebGL 不可用时，加载页会直接给出**中英双语提示**，不会白屏。

> [!TIP]
> `assets/js/textures.js` 是生成物。改了 `assets/textures/` 下的贴图后，执行
> `node scripts/generate-textures.js` 重新内嵌（`--check` 可校验是否一致）。

## 快捷键

| 键 | 功能 |
| --- | --- |
| `空格` | 播放 / 暂停 |
| `↑` / `↓` | 提高 / 降低倍速（1 → 1e9） |
| `←` / `→` | 连珠模式下向内 / 向外切换天体（也可点屏幕两侧箭头）。切换为**纯水平平移**：连珠视角会把飞行弧线压到 8%、横摆归零（`alignFlyArcFactor` / `alignFlySideFactor`），因此不会抛物线上跳 |
| `R` | 重置视角 |
| `H` | 沉浸模式（隐藏 HUD） |
| `/` | 聚焦天体搜索框 |
| `Esc` | 依次关闭：设置面板 → 快捷键弹层 → 搜索 → 取消选中 / 解除跟随 |
| `?` | 打开 / 关闭快捷键弹层（也可点右下角 `?` 按钮） |

## 技术栈

- **渲染**：Three.js r128（`assets/vendor/` 本地化 UMD）+ WebGL2 / WebGL1
- **材质**：全部 `ShaderMaterial` 手写 GLSL（行星表面、大气、日冕、星点、拖尾、彗尾、环）
- **后期**：`EffectComposer` + `RenderPass` + 分层 `UnrealBloomPass`（自发光物体单独渲到半分辨率 RT，不入 composer）+ 自定义收尾 `ShaderPass`（暗角 / 扫描线 / 色散 / 胶片颗粒 / 高光压缩 / Bloom 加性合成）
- **天文算法**：开普勒方程（区间约束牛顿迭代 + 二分回退）、JPL 近似星历（含 b/c/s/f 附加项）、儒略日换算
- **交互**：OrbitControls + 自研兜底控制器（OrbitControls 缺失时自动降级）、射线 + 屏幕空间双通道拾取
- **工程**：零构建、ES5、IIFE 模块、`window.SOLAR` 命名空间、base64 内嵌资源

## 功能地图

<details>
<summary><b>场景与天体</b></summary>

- 太阳：程序化米粒组织、临边昏暗、较差自转、黑子、两层日冕壳 + 恒定屏幕尺寸光晕
- 行星：程序化凹凸（岩质）/ 纬向条纹 + 湍流 + 极区色差（气态）/ 大红斑（木星）
- 大气：菲涅尔边缘辉光，颜色随太阳角由日落橙过渡到天顶蓝；地球另有夜面灯光、漂移云层、海面高光
- 投影：土星环影投到行星 + 行星本影投到环；主要卫星的日食/月食本影（解析式，无 shadowMap 开销）
- 星空：按星等分布亮度、B-V 色温着色、亮星星芒、银道带增密（与 60.2° 银道倾角一致）
- 带与彗星：小行星带含 Kirkwood 空隙、柯伊勒带 3:2 共振稀疏；彗尾分叉为离子尾（蓝）与尘埃尾（暖白）
- 标签：Canvas 文字精灵，屏幕恒定尺寸，语言切换自动重建

</details>

<details>
<summary><b>界面</b></summary>

- 顶部：视角预设下拉、连珠、巡航、重置 / 沉浸图标按钮、画质下拉、语言、设置齿轮
- 左侧：BODIES 导航（分组含卫星）、搜索框、可收起为窄条
- 右侧：信息卡 9 分区（概览 / 相对地球 / 轨道 / 物理 / 大气 / 卫星 / 发现与观测 / 冷知识 / 全部数据）
- 底部：日期、时钟、儒略日、倍速滑杆与换算提示、播放 / 倒流 / 此刻 / 跳转
- 角落：银河公转读数条（顶部居中）、FPS 面板 + 快捷键弹层（右下）

</details>

<details>
<summary><b>设置项</b></summary>

| 分组 | 项目 |
| --- | --- |
| SCENE | 轨道线、标签、拖尾、星空、小行星带 |
| SCALE | 显示比例（压缩示意 / 弱压缩示意） |
| EFFECTS | Bloom、扫描线、暗角 |
| PREFERENCES | 距离单位（AU / KM）、语言、画质（与顶栏双向同步） |

</details>

## 目录结构

```
.
├── index.html               单页入口（HUD 结构 + 加载动画 + 脚本装配）
├── assets/
│   ├── css/style.css        黑白科幻 HUD 样式（可折叠面板、设置面板、银河读数条）
│   ├── css/teach.css        教学模式 UI 样式（希沃白板 / 投影友好）
│   ├── js/
│   │   ├── config.js        缩放 / 时间 / 画质 / 相机 / 银河 / 配色 全局配置
│   │   ├── data.js          天体数据（J2000 根数 + 物理参数 + 卫星 + 彗星 + 环带；卫星含 JPL 朝向三根数）
│   │   ├── astro.js         开普勒求解、行星位置、轨道采样、儒略日换算
│   │   ├── i18n.js          中英双语词包
│   │   ├── textures.js      内嵌 base64 贴图（自动生成，勿手改）
│   │   ├── effects.js       后期处理：分层 Bloom + 收尾 shader（暗角 / 扫描线 / 色散 / 颗粒）
│   │   ├── scene.js         太阳 / 行星 / 卫星 / 轨道 / 星空 / 带 / 彗星 的构建与更新
│   │   ├── galaxy.js        银河系模型 + 太阳系绕银心公转 + 太阳公转拖尾
│   │   ├── controls.js      相机控制、拾取、飞行、跟随、巡航
│   │   ├── ui.js            导航、信息卡、时间控制、设置、快捷键
│   │   ├── main.js          启动引导、加载进度、主循环、自适应画质
│   │   ├── teach-data.js    教学内容数据（当前：第3章第1节《认识地球》，4 个场景 + 来源索引）
│   │   ├── teach-globe.js   教学装置：地球仪与四个地球形状观察场景
│   │   ├── teach-orrery.js  教学装置兼容层（旧三球仪代码，当前四场景不启用）
│   │   ├── teach-scenes.js  教学装置调度层
│   │   └── teach.js         教学模式主控与自建 UI
│   ├── textures/            原始贴图（textures.js 的来源，运行时不直接依赖）
│   └── vendor/              Three.js r128 + OrbitControls + 后期处理（本地化）
├── scripts/
│   ├── generate-textures.js 贴图 → base64 内嵌生成脚本（--check 校验一致性）
│   ├── check-syntax.js      逐文件语法校验（自动跳过 textures.js）
│   ├── check-es5.js         禁用 ES6+ 运行时语法门禁
│   ├── check-offline.js     禁止 fetch / XHR / WebSocket 等联网 API
│   ├── check-script-order.js index.html 加载顺序与依赖表一致
│   ├── check-i18n.js        中英键对称 + 消费键存在性
│   ├── check-data.js        data.js 字段消费率（--strict 才失败）
│   └── check-assets.js      脚本 / 样式 / 贴图等资产存在性
├── docs/                    README 截图（1 张，1600×900）
├── .gitignore               忽略 node_modules / 构建产物 / 编辑器与临时文件
├── AGENTS.md                工程约束与协作说明（AI 助手工作规范）
├── CLAUDE.md                AGENTS.md 引用入口（@AGENTS.md）
├── LICENSE                  MIT
├── NOTICE                   许可范围、第三方组件、贴图与天文数据来源
└── README.md                项目说明
```

## 数据来源

| 内容 | 来源 |
| --- | --- |
| 行星轨道根数与附加摄动项 | JPL / NASA *Keplerian Elements for Approximate Positions of the Major Planets* |
| 卫星轨道朝向根数（Ω / ω / M₀） | JPL *Planetary Satellite Mean Elements*（历元 2000-01-01.5 TDB，与 J2000 精确对齐） |
| 物理参数 | NASA Planetary Fact Sheets |
| 矮行星 / 彗星根数 | IAU、IAU Minor Planet Center |
| 行星与卫星贴图 | NASA / USGS Astrogeology（公有领域）、Solar System Scope（CC BY 4.0） |
| 银河系结构参数 | 公开综述值（R₀ ≈ 8 kpc、棒长 ≈ 4.6 kpc、螺距角 ≈ 13°、平坦旋转曲线 v ≈ 220 km/s） |

逐项说明见 [NOTICE](./NOTICE)。数值为科普级精度，非测量级。

## 性能

- 180 FPS 上限；帧时间累加器扣减取余不漂移，dt 钳制，切标签页自动暂停渲染与计时
- 自适应画质：连续低帧降级、长时间高帧回升（带滞回与冷却），并与画质下拉框 / 设置面板分段按钮双向同步
- 手动选档（顶部下拉框或设置面板）统一经 `SOLAR.setManualQuality` 进入主循环，置「手动档」后不再自动回升；自动降级始终保留作为兜底
- 太阳辉光与 Bloom 按太阳屏幕占比自适应，近距离不糊成一片白：Bloom 走**分层（选择性）**方案——自发光物体（太阳本体 / 日冕 / 光晕 / 行星大气辉光 / 地球夜面城市灯光 / 亮星十字星芒）单独渲到一张**半分辨率 RT**，行星与卫星球体临时换成纯黑材质只当遮挡体（行星挡住太阳时辉光不穿透），再用阈值 0.10 跑 `UnrealBloomPass`，最后由收尾 shader 加性合成回主画面；靠近太阳时只压低强度并加强高光压缩，**不再抬升阈值**（原 `threshold + 0.06k`），避免越过亮度上限把太阳辉光掐死。代价是每帧多一次半分辨率渲染 pass（ULTRA / HIGH / MEDIUM 三档生效，LOW 仍整体关闭）
- 逐帧零 `new`（复用临时向量）、悬停拾取节流 ~70ms、拖尾按 `drawRange` 增量更新

四档画质的几何开销（拉远至全场景可见时实测；相机拉近时受视锥剔除，实际渲染量低于此值）：

| 档位 | 三角面 | 点顶点数 | 球体细分 | 像素比 | Bloom（强度/半径/阈值） | 颗粒 |
| --- | --- | --- | --- | --- | --- | --- |
| ULTRA | 292,998 | 218,132 | 128×96（太阳 192×128） | 4 | 1.15 / 0.80 / 0.10 | 0.045 |
| HIGH（默认） | 109,894 | 51,883 | 64×48（太阳 96×64） | 2 | 0.95 / 0.62 / 0.10 | 0.030 |
| MEDIUM | 76,518 | 29,133 | 48×32（太阳 64×48） | 1.5 | 0.78 / 0.54 / 0.10 | 0.018 |
| LOW | 44,889 | 14,005 | 32×24（太阳 48×32） | 1 | 整体关闭（参数 0.65 / 0.45 / 0.10） | 0 |

LOW 档同时关闭 Bloom、扫描线、暗角与运动拖尾；粒子规模也逐档递减（小行星带 40,000 / 6,000 / 3,000 / 1,200，柯伊伯带 24,000 / 4,000 / 2,000 / 800，星空 60,000 / 12,000 / 8,000 / 4,000）。

自适应画质参数（`config.js` → `autoDegrade`，`main.js`）：每 90 帧取一个采样窗口，均值低于 **40 FPS** 记一次低帧窗口，连续 **2** 次降一档；均值高于 **65 FPS**（40 + 25 滞回）连续 **3** 次升一档；两档之间有 **4 s** 冷却，且仅在低帧方向强制生效——手动选档后不再自动回升，但自动降级始终作为兜底保留。帧率上限 180 FPS。

**建议**：卡顿优先手动切到「中 / 低」；4K / 高 DPI 下 Bloom 是多 pass 全屏开销，且分层 Bloom 还会多一次半分辨率 pass，建议降一档。ULTRA 在 4K 高 DPI 屏上负载很重，弱显卡会被自动降级到 HIGH。

## 兼容性

| 项目 | 要求 / 说明 |
| --- | --- |
| 图形接口 | **WebGL 1**（启动时按 `webgl` → `experimental-webgl` → `webgl2` 顺序探测，并在探测后主动释放测试上下文；Three.js r128 走 WebGL1 路径）。不支持时在加载层给出双语错误提示并停止启动 |
| 脚本语法 | ES5 + IIFE，无模块化、无转译、无框架，任意支持 WebGL 1 的浏览器均可直接打开 |
| 指针事件 | 使用 Pointer Events（`pointerdown`）。主流浏览器 2018 年后版本均支持 |
| 毛玻璃 | CSS `backdrop-filter`，已同时提供 `-webkit-` 前缀以兼容 Safari |
| 内存读数 | 依赖 `performance.memory`，**仅 Chromium 系**可用；其它浏览器显示占位，不影响功能 |
| 网络 | **运行时不发起任何外部请求**，贴图以 base64 内嵌、依赖全部本地化，`file://` 直开可用 |
| 存储 | 不使用 localStorage / Cookie，不留任何本地状态 |
| 分辨率 | 已适配至约 1100×700 及以上；更窄或移动端未做布局适配 |

验证状态：本项目当前的自动化验证均在 **Chromium 无头环境**（SwiftShader 软件渲染）下完成，覆盖脚本门禁与主要演示路径。faithful 档的 home / outer / top 预设曾在更早参数下复核；2026-10-07 的 `distanceBase 2000` 尺度重构与太阳公转拖尾改动**尚未**经无头截图复核，正在人工验证中。四个教学场景的完整逐步回归仍待单独执行。**Firefox / Safari 与真实 GPU 环境尚未做过实测**。

自测帧率方法：页面右下角的调试面板实时显示 FPS 与三角面数；切换画质档后静置约 10 秒（自适应画质需要 90 帧才完成一个采样窗口）读数即为该档稳态值。若高档位持续低于 40 FPS，会在一个采样窗口后自动降级。

## 已知限制

- `callisto.jpg`（木卫四）、`uranus_ring.png`（天王星环）无可靠公开源，回退纯色 / 程序化渲染
- `file://` 下不请求磁盘贴图（会被 CORS 拦截），全部走内嵌 base64；缺图兜底且控制台无报错
- 最高倍速（1e9）下单步推进限制在 4 个模拟日，余量按帧结转，外行星仍有轻微步进感（刻意的平滑策略）
- 内存读数依赖 `performance.memory`，仅 Chromium 系可用，其它浏览器显示占位
- 银河系为**有观测依据的程序化统计模型**，非真实巡天目录重建；差动自转用四个径向层近似
- 演示模式**无法实现严格 1:1 真实比例**（需对数深度缓冲，见 `config.js` 说明），因此「压缩示意 / 弱压缩示意」均为示意；弱压缩档已尽量接近真实（`distanceExp 0.85` / `sizeExp 0.62`，轨道推到相机远览极限与 far 硬顶之间的 `distanceBase 2000`），但天体半径 ∶ 轨道半径仍被压缩（地球约 40 倍），且太阳系外缘已超出银河模型的银心距标注——这是为"轨道尽量远"付出的、已明确接受的银河视角代价（推导见 `config.js` 的 `profiles.faithful` 注释块）
- 不做移动端 / 触屏适配、不做音效、不做截图导出、不把视角状态写入 URL

## 规模

62 个文件，约 **16.7 MB**：

| 部分 | 体积 | 说明 |
| --- | --- | --- |
| `assets/js/` | 9.0 MB | 其中 `textures.js` 约 8.5 MB（base64 内嵌，保证双击可用） |
| `assets/textures/` | 6.3 MB | 原始贴图 19 张（运行时不直接依赖） |
| `assets/vendor/` | 0.6 MB | Three.js r128 + OrbitControls + 后期处理 |
| `assets/css/` + `index.html` | < 0.1 MB | 样式与入口 |
| `scripts/` + `docs/` + 根目录文档 | < 0.8 MB | 贴图生成 + 7 个自检门禁脚本、README 截图、README / AGENTS / NOTICE 等 |

## 许可

本项目对代码与资源采用不同的授权方式，完整说明见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。

- **源代码**：[MIT](./LICENSE) © 2026-present Yiyazadxr。可使用、修改、商用和再分发；须保留版权与许可声明。
- **贴图资源**：`assets/textures/` 及 `assets/js/textures.js` 中的行星 / 卫星贴图来自 NASA、USGS 等机构的公有领域影像，以及 Solar System Scope（CC BY 4.0）；分发时请遵守来源机构的媒体使用政策，署名见 [NOTICE](./NOTICE)。
- **第三方组件**：Three.js r128、OrbitControls、后期处理（均为 MIT，© three.js authors），见 [NOTICE](./NOTICE) 第 2 节。
- **品牌名称与标识**：不在开源许可范围内，**不得用作品牌名称或暗示背书**。

## 致谢

- [three.js](https://threejs.org) —— WebGL 3D 引擎
- [NASA / JPL](https://www.nasa.gov)、[USGS Astrogeology](https://astroweb.usgs.gov/) —— 天文数据与公有领域影像
- [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) —— 物理参数
- [Solar System Scope](https://www.solarsystemscope.com/textures/) —— 部分行星贴图（CC BY 4.0）

## 联系

授权事宜或其他问题请联系：412110785@qq.com · [GitHub](https://github.com/Yiyazadxr)
