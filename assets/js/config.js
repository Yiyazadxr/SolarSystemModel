/**
 * 全局配置：缩放、渲染、时间、性能、配色
 * 说明：真实数据（km / AU / 天）在此统一映射为场景单位，兼顾真实比例与观感
 */
window.SOLAR = window.SOLAR || {};

SOLAR.CONFIG = {
  /* ---------- 渲染 ---------- */
  render: {
    fpsCap: 180,          // 帧率上限
    pixelRatioCap: 4,     // 设备像素比上限
    /* 绘制缓冲总像素硬上限：composer 至少持有主画面与中间 RT，
       因此不能让 4K/5K 屏直接以 4× DPR 分配数亿像素的纹理。
       16M 像素约等于 4096×4096，在高 DPI 屏上会自动下调有效 DPR。 */
    maxRenderPixels: 16777216,
    antialias: true,
    near: 0.1,
    far: 160000,   // 相机 maxDistance 80000；远端还要容纳银河盘面（可见盘缘约 50200 单位）
    fov: 50
  },

  /* ---------- 尺度映射 ---------- */
  scale: {
    // 距离：真实 AU -> 场景单位（幂律压缩，保留次序与量级感）
    distanceBase: 42,     // 1 AU 对应基准
    distanceExp: 0.62,    // 压缩指数（1 = 完全真实，越小内行星越舒展）

    // 半径：真实 km -> 场景单位（幂律压缩）
    sizeBase: 0.015,      // sqrt(6371) * 0.015 ≈ 1.2 场景单位 = 地球
    sizeExp: 0.5,

    // 观感修正
    sunSizeFactor: 0.45,  // 压缩太阳半径（真实比例下日径约为地球轨道半径的 1/100，不压缩会吞掉内行星）
    moonSizeFactor: 0.75, // 卫星额外缩小，避免比行星还显眼
    // 卫星轨道：以宿主行星半径为单位的对数压缩距离
    moonDistBase: 1.6,
    moonDistLog: 1.1,
    moonDistPow: 0,       // >0 时改用幂律：dist = 行星半径 × ratio^pow（弱压缩档用）

    // 轨道线
    orbitSegments: 512,
    orbitOpacity: 0.28,
    /* 根数随 epoch 缓慢变化；跨越该跨度才重采样，日期跳转则立即刷新。 */
    orbitEpochStepDays: 365.25,

    // 土星环：真实 km -> 场景单位
    ringScale: 0.010
  },

  /* ---------- 显示比例档案（演示模式） ----------
     演示模式无法使用真实比例：真实比例下 1 AU = 23481 个地球半径，海王星在约 70 万单位外，
     按 near=0.1 / far=160000 根本装不下；把 far 提到 1e6 量级后，24 位深度缓冲又会满屏 z-fighting。
     真要做必须引入 logarithmic depth buffer（需改写所有材质的深度输出）。
     因此提供两档「示意压缩」，faithful 更接近真实：
        compact  : 压缩更强，内行星舒展、便于整体观察（默认）
        faithful : 压缩更弱，外行星更远、半径更接近真实、卫星距离按幂律适度还原
     压缩倍数随天体不同（幂律映射的结果），逐项标注在天体信息卡里。 */
  profiles: {
    compact: {
      distanceBase: 42, distanceExp: 0.62, sizeBase: 0.015, sizeExp: 0.50,
      sunSizeFactor: 0.45,
      moonDistBase: 1.6, moonDistLog: 1.1, moonDistPow: 0,
      moonSizeFactor: 0.75
    },
    /* faithful：distanceBase=2000 把轨道整体推远，给日面留出空间。
       太阳 sunSizeFactor=1.0（半径≈63 单位），取"轨道优先、日面让步"：
         水星轨道 = 2000×0.387^0.85 ≈ 893 ≈ 14.2 倍太阳半径（compact 基准下限 4.1）；
         地球 2000、木星 ≈8126、海王星 ≈36095、柯伊伯带外缘 50AU ≈55610。
       distanceBase 取 2000 的依据：
         下限 1214~1340 = FOV50°/maxDistance80000 下最远机位仍能全览太阳系；
         上限 2877 = maxDistance80000 + 柯伊伯外缘 ≤ far160000 的硬顶；
         取 2000：极限拉远近端 135610，far 余量 15%；海王星 36095 仍可一屏全览，
         柯伊伯带需平移查看。银河视角已放弃——柯伊伯外缘 55610 超过日心距银心 25000
         与可见盘缘（diskEdgeKpc16 ≈50200），拉远时轨道会横穿银心标注方向、伸出星盘。
       轨道比例只由 distanceExp 决定：base 是统一乘数，行星间比例（木星/地球 = 5.203^0.85 ≈4.06）恒定。
       太阳/地球尺寸比 = 63/3.4 ≈ 18（真实 109、compact 4.7）。
       orbitSegments 1024：海王星弧垂 = 36095×(2π/1024)²/8 ≈ 0.17 < 行星半径 7.9，
         不出现"行星不在轨道上"的折线锯齿（早年 distanceBase=200 的教训）。
       地月关系：moonDistFor 锚定母星半径、与 distanceBase 无关（base 越大越安全）；
         最紧个例 Callisto 月轨 809 单位，包络 7317~8935，距土星轨道 13601 余量 4666，11 颗均不碰邻轨。
         moonDistPow=0.7：月距 = 17.6× 地球半径（占地球轨道 3.0%）；pow=1.0 在本档也安全
           （包络介于金星/火星之间），但未授权切换，保守保留 0.7；
         moonSizeFactor=0.61 把月/地大小比正好还原到真实的 0.273。 */
    faithful: {
      distanceBase: 2000, distanceExp: 0.85, sizeBase: 0.015, sizeExp: 0.62,
      sunSizeFactor: 1.0, orbitSegments: 1024,
      moonDistBase: 0, moonDistLog: 0, moonDistPow: 0.7,
      moonSizeFactor: 0.61
    }
  },

  /* ---------- 时间系统 ---------- */
  time: {
    j2000: 2451545.0,                       // J2000.0 儒略日
    speeds: [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000, 1000000000],
    defaultSpeed: 1,                        // 1 = 实时（1 真实秒 = 1 模拟秒）
    minSpeed: -1000000000,                  // 支持时间倒流
    maxSpeed: 1000000000,                   // 10 亿倍速 ≈ 31.7 模拟年 / 真实秒
    simDaysPerSecond: 1 / 86400             // 1 倍速 = 实时；10× = 1 真实秒 = 10 模拟秒，以此类推
  },

  /* ---------- 相机预设 ---------- */
  /* !! 坐标陷阱：pos / target 是「相对太阳系（systemRoot）的局部坐标」，不是世界坐标 !!
     太阳系整体随银河系公转平移，世界坐标随时间变化，默认已偏离原点约 25000 单位
     （量级由 galaxy.radiusUnits 决定）。任何绝对定位（相机摆放、自动测试断言、预设视角换算）
     都必须先经 SOLAR.Scene.getSolarBasis() 取基准 position 再换算；直接当世界坐标用会整体偏移约 25000 单位。 */
  views: {
    home: { pos: [0, 220, 520], target: [0, 0, 0] },        // 俯视 45° 全览
    ecliptic: { pos: [0, 8, 700], target: [0, 0, 0] },      // 黄道侧视
    inner: { pos: [0, 60, 150], target: [0, 0, 0] },        // 内太阳系
    outer: { pos: [0, 480, 900], target: [0, 0, 0] },       // 外太阳系俯瞰
    top: { pos: [0, 780, 0.001], target: [0, 0, 0] },       // 正俯视
    // 行星连珠专用：相机转到连珠线的侧方，让整排行星横向铺开
    align: { pos: [200, 150, 640], target: [200, 0, 0] }
  },
  /* faithful 的距离指数从 compact 的 0.62 提高到 0.85，
     所以不能把 compact 视角只乘 distanceBase/42：越靠外的轨道放大得越多。
     这里给出按 50° FOV 重新留出外行星余量的取景点；inner / align 保持
     以内太阳系为主，避免每次切档都把近景推到视野外。 */
  viewProfiles: {
    faithful: {
      home: { pos: [0, 33000, 72000], target: [0, 0, 0] },
      ecliptic: { pos: [0, 900, 78000], target: [0, 0, 0] },
      inner: { pos: [0, 2850, 7140], target: [0, 0, 0] },
      outer: { pos: [0, 44000, 66000], target: [0, 0, 0] },
      top: { pos: [0, 80000, 0.001], target: [0, 0, 0] },
      align: { pos: [9520, 7140, 30480], target: [9520, 0, 0] }
    }
  },
  camera: {
    minDistance: 3,
    maxDistance: 80000,  // 拉远可见太阳系在银河系中的位置（太阳的银心轨道半径为 25000 单位）
    flyDuration: 1600,    // 飞行基础时长（ms），远距离会在此基础上适度延长
    followLerp: 0.08,

    // 轨道手感：均按真实时间计算，不依赖渲染帧率
    dampingLambda: 5.0,
    rotateSpeed: 0.55,
    panSpeed: 0.72,
    zoomSensitivity: 0.003,
    zoomResponse: 14,
    zoomMaxStep: 0.18,

    // 天体尺度联动：小目标可贴近，大目标不穿入表面
    minDistanceFloor: 0.08,
    surfacePadding: 1.35,
    focusPadding: 2,
    focusDistanceScale: 6,
    sunDistanceScale: 8,
    alignDistanceScale: 10,

    // 电影化飞行
    flyMinDuration: 1100,
    flyMaxDuration: 3800,
    flyDistanceDuration: 360,
    flyArcRatio: 0.09,
    flyArcMax: 260,
    flyArcSideRatio: 0.16,
    flyRoll: 0.028,
    /* 连珠模式左右切换：抑制弧线抬升与横摆，纯水平平移，避免抛物线上跳 */
    alignFlyArcFactor: 0.08,
    alignFlySideFactor: 0,

    // 软跟随与巡航
    followManualStrength: 0.12,
    followResumeDelay: 1.2,
    followRecoverRate: 1.8,
    cruiseInterval: 9,
    cruiseResumeDelay: 5,
    cruiseOrbitSpeed: 0.035,

    // 点击与 hover 容错（秒 / CSS 像素）
    dragThreshold: 5,
    pickMinPixels: 11,
    pickMaxPixels: 34,
    hoverInterval: 0.035,
    hoverDelay: 0.065,
    hoverReleaseDelay: 0.1
  },

  /* ---------- 银河系运动（太阳系绕银心公转） ---------- */
  galaxy: {
    radiusUnits: 25000,    // 日心距银心的场景单位（演示尺度）
    tiltDeg: 60.2,         // 银道面与黄道面夹角（真实值）
    orbitSeconds: 3000,    // 演示加速：多少真实秒转完一个银河年；默认保持缓慢运动，加速档可快速观察
    speedKms: 233,         // 绕银心速度（Gaia 测得的本地静止标准 ≈233 km/s，旧教科书用 220）
    distanceLy: 26000,     // 日心距银心（光年）
    yearMyr: 230,          // 一个银河年（百万年）
    /* 太阳相对银道面的垂直振荡：现实中的太阳并不在银道面上做平面圆周运动，
       而是在银道面上下做准正弦振荡（周期约 6500 万年、振幅约 250 光年），
       当前（J2000）位于银道面以北约 65 光年。缺失这项时"银河视角"看起来
       像理想化的平面圆轨道，与真实运动不符。 */
    verticalAmpLy: 250,
    verticalPeriodMyr: 65,
    verticalOffsetLy: 65,
    pointSize: 9
  },

  /* ---------- 画质档位 ---------- */
  quality: {
    ultra:  { bloom: true,  pixelRatio: 4,   asteroidCount: 40000, kuiperCount: 24000, starCount: 60000, trails: true,  vignette: true,  scanline: true },
    high:   { bloom: true,  pixelRatio: 2,   asteroidCount: 6000,  kuiperCount: 4000,  starCount: 12000, trails: true,  vignette: true,  scanline: true },
    medium: { bloom: true,  pixelRatio: 1.5, asteroidCount: 3000,  kuiperCount: 2000,  starCount: 8000,  trails: true,  vignette: true,  scanline: false },
    low:    { bloom: false, pixelRatio: 1,   asteroidCount: 1200,  kuiperCount: 800,   starCount: 4000,  trails: false, vignette: false, scanline: false }
  },
  autoDegrade: {
    enabled: true,
    sampleWindow: 90,   // 采样帧数
    fpsThreshold: 40    // 低于该帧率触发降级
  },

  /* ---------- 配色（黑白科幻 + 单一强调色） ---------- */
  colors: {
    background: 0x000000,
    accent: 0x7ffcd8,        // 强调色（HUD / 轨道高亮 / 选中）
    accentCss: '#7ffcd8',
    dim: 0x8a8a8a,
    orbit: 0x9aa0a6,
    sun: 0xfff2cc,
    halo: 0xffd9a0
  },

  /* ---------- 程序化生成 ---------- */
  procedural: {
    /* 主星场 / 小行星带 / 柯伊伯带的固定随机种子；也可用 URL `#seed=...` 或
       `SOLAR.Scene.setProceduralSeed(seed)` 显式覆盖。 */
    seed: 20261006
  },

  /* ---------- 天文常数 ---------- */
  astro: {
    AU_KM: 149597870.7,                    // IAU 2012 精确定义
    DEG: Math.PI / 180,
    AU_M: 1.495978707e11,
    DAY_S: 86400,
    JULIAN_YEAR_D: 365.25,
    JULIAN_CENTURY_D: 36525,
    C_KM_S: 299792.458,                    // 真空光速（精确值）
    G_M3_KG_S2: 6.67430e-11,               // CODATA 2018
    SOLAR_GM_KM3_S2: 1.32712440018e11,
    EPHEMERIS_SHORT_MIN_T: -2.0,           // JPL 短期表：1800–2050
    EPHEMERIS_SHORT_MAX_T: 0.5,
    EPHEMERIS_LONG_MIN_T: -50.0,           // JPL 长期表：约公元前 3000–公元 3000
    EPHEMERIS_LONG_MAX_T: 10.0,
    GM_KM3_S2: {
      sun: 1.32712440018e11,
      mercury: 2.203186855e4,
      venus: 3.24858592e5,
      earth: 3.98600435507e5,
      moon: 4.902800118e3,
      mars: 4.2828375816e4,
      jupiter: 1.26686534196e8,
      saturn: 3.793120768e7,
      uranus: 5.7939513e6,
      neptune: 6.83509997e6,
      pluto: 8.696138e2
    }
  }
};

/* 便捷换算：真实距离(AU) -> 场景单位 */
SOLAR.auToScene = function (au) {
  var s = SOLAR.CONFIG.scale;
  return s.distanceBase * Math.pow(au, s.distanceExp);
};

/* 便捷换算：真实半径(km) -> 场景单位 */
SOLAR.kmToScene = function (km) {
  var s = SOLAR.CONFIG.scale;
  return s.sizeBase * Math.pow(km, s.sizeExp);
};
