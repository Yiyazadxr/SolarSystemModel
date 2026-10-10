/**
 * 场景共享状态注册表：场景节点表 / 临时对象池 / 跨模块 uniform
 * 依赖：three.min.js（全局 THREE，r128）、config.js（C.quality 初值）；无业务逻辑
 *
 * 为什么单独拆出来：scene-gfx / scene-sun / scene-bodies / scene-backdrop / scene
 * 五个模块要共享同一批场景节点（planets / cometObjs / systemRoot …）与临时向量。
 * 共享状态必须只有一个权威去处：否则同一条数据在两边各存一份，
 * "只改一边、漏另一边" 就会静默产生两个太阳系。
 *
 * 这里只做宿主（表 / 池 / 注册），不写业务逻辑：
 *   S.nodes  场景对象表（构建期写入、逐帧读取；cometObjs / beltObjects 等会被整体重建，
 *            所以必须是可重新赋值的字段而不是各模块私有变量）
 *   S        标量与跨模块共享值（画质档、时间累积、公转纪元、随机种子 …）
 *            临时向量也只存于 S（tmpV1 / tmpV2 / tmpV3 / baryLocal / labelWorldPos），
 *            避免另建一份未同步的池；模块内一律按 S.字段 读写
 *   U        多材质共用的 uniform 对象（更新一次即全部生效）
 *
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.SceneShared = {
  S: {
    nodes: {
      scene: null, camera: null, renderer: null, canvas: null,
      systemRoot: null,       // 太阳系整体（随银河系公转平移）
      sunLight: null,         // 场景主光源（门面 buildLights 创建）
      sunGroup: null, sunMesh: null, sunGlow: null,
      sunProminences: [], sunFlares: [], sunSpots: [],   // 太阳表面与色球层配件
      coronaShells: [],
      planets: [],            // { id, data, group, mesh, glowMesh, orbitLine, moons[], trail..., rAu }
      cometObjs: [],          // 彗星：数据驱动，D.comets 全量构建（支持多颗）
      starfield: null, starSpikes: null,
      skyDome: null,          // 真实全天银河背景天球（内表面贴全景图）
      beltObjects: [],
      bandObjects: [],       // 辉带：补正俯视与远观时点云的亮度缺口
      pickables: [],
      bodyIndex: {},
      labelGroup: null,      // 天体标签层
      labels: []
    },
    sunPromRadius: 1,                     // 太阳显示半径（日珥放置用），buildSun 时烘焙
    sunUniforms: null,
    UPY: new THREE.Vector3(0, 1, 0),      // 世界 up（日珥切向基构造用）
    sunViewMode: 'photosphere',
    sunScreenFraction: 0,
    qualityName: 'high',
    quality: SOLAR.CONFIG.quality.high,
    qv: null,               // 画质细节档（见门面 QUAL 表）
    sphereGeos: {},
    manager: null, texLoader: null,
    simDays: 0,
    showTrails: true,
    beltsVisible: true,
    elapsed: 0,             // 累计真实秒（着色器动画用）
    labelUpdateAccum: 0,
    adaptiveUpdateAccum: 0,
    secondaryUpdateAccum: 0,
    qualityJob: null,
    qualityJobVersion: 0,
    tmpV1: null, tmpV2: null, tmpV3: null, baryLocal: null,
    labelWorldPos: null,
    effectivePixelRatio: 1,
    orbitEpochJd: null,
    /* 轨道线重采样的真实时间节流：避免连续播放时每帧重建几何 */
    orbitLastRebuildMs: 0,
    align: { amount: 0, target: 0 },
    gasTarget: 1, gasAmt: 1,  // 气态动效开关目标值与平滑值（默认开启）
    /* 主星场与两条粒子带使用固定种子：切画质、切比例、刷新页面都生成同一批
       粒子，便于截图回归；URL `#seed=...` 可显式换一批（仅影响程序化随机）。 */
    proceduralSeed: (SOLAR.CONFIG.procedural && typeof SOLAR.CONFIG.procedural.seed !== 'undefined')
      ? SOLAR.CONFIG.procedural.seed : 20261006,
    randomState: 1,
    scaleMode: 'compact',
    /* 门面与太阳观测层共用同一份额外倍率，避免切观测层时读到旧副本。 */
    scaleFactors: {
      compact: { planet: 1.0, moon: 1.0, sun: 1.0, comet: 1.0 },
      faithful: { planet: 1.0, moon: 1.0, sun: 1.0, comet: 1.0 }
    },
    labelsVisible: false,
    bloomLayerItems: [],   // { obj, mat, saved }  mat 为 null 表示沿用原材质
    bloomOccMat: null,     // 遮挡体专用纯黑材质
    bloomNightMat: null    // 地球夜光材质变体
  },

  /* 共享 uniform（多个材质共用同一对象，更新一次即全部生效） */
  U: {
    sunPos: { value: null },      // 太阳世界坐标
    time: { value: 0 },
    gasT: { value: 0 },           // 气态动效积分相位：仅在开关开启（含淡入）时累积
    pixelRatio: { value: 1 },
    heightScale: { value: 1000 }  // 用于点尺寸的世界单位 -> 像素换算
  },

  /* 场景销毁钩子：原 scene.js 没有销毁流程（切画质走原地重建、刷新页面即整体重置），
     仅登记一个空实现占位，调用方按 typeof 判定即可。 */
  onDispose: function () { /* 预留：当前无对应逻辑 */ }
};
