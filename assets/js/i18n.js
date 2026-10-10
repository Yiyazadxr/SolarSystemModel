/**
 * 中英双语词包（默认英文）
 * 结构：ui（界面文案）/ bodies（天体名称与简介）/ atm（大气成分）/ moons / comet / views / fields
 */
window.SOLAR = window.SOLAR || {};

SOLAR.I18N = {
  /* ============================== 英文 ============================== */
  en: {
    ui: {
      title: 'SOLAR SYSTEM',
      subtitle: 'REAL-TIME 3D ORRERY · VSOP87 / J2000',
      navTitle: 'BODIES',
      navToggle: 'Collapse / Expand',
      viewTitle: 'Preset views',
      panelTitle: 'DATA',
      loading: 'INITIALIZING',
      loadingTip: 'Building the solar system…',

      timeTitle: 'TIME',
      utc: 'UTC',
      speed: 'SPEED',
      effective: 'effective',
      play: 'PLAY',
      pause: 'PAUSE',
      reverse: 'REVERSE',
      now: 'NOW',
      jump: 'JUMP',
      datePlaceholder: 'YYYY-MM-DD',

      viewTitle: 'VIEW',
      align: 'ORBIT ALIGN',
      alignOn: 'ALIGNED',
      galaxy: 'GALAXY',
      galaxyOn: 'GALACTIC',
      cruise: 'CRUISE',
      cruiseOn: 'CRUISING',
      reset: 'RESET VIEW',
      resetLabel: 'RESET',
      immersive: 'IMMERSIVE',
      immersiveLabel: 'IMMERSE',
      immersiveHint: 'Press H to toggle HUD',
      follow: 'FOLLOWING',
      unfollow: 'EXIT FOLLOW',

      quality: 'QUALITY',
      fps: 'FPS',
      triangles: 'TRIS',
      debug: 'DEBUG',
      bodies: 'BODIES',
      sunPhotosphere: 'Photosphere',
      sunChromosphere: 'Chromosphere',
      sunCorona: 'Corona',

      descTitle: 'OVERVIEW',
      factTitle: 'DID YOU KNOW',
      compareTitle: 'RELATIVE TO EARTH',
      compareEmpty: 'No comparable data',

      selectHint: 'Click a body to lock camera',
      emptyHint: 'Click empty space to deselect',
      lang: '中文',

      shortcuts: 'SHORTCUTS',
      scPause: 'Space — Play / Pause',
      scReset: 'R — Reset view',
      scHud: 'H — Immersive mode',
      scSpeedUp: '↑ / ↓ — Time speed',
      scEsc: 'Esc — Deselect',

      /* ---------- 设置面板 ---------- */
      settings: 'SETTINGS',
      scaleTitle: 'SCALE', scaleCompact: 'COMPACT', scaleFaithful: 'FAITHFUL',
      scaleReal: 'REAL', scaleIconic: 'SCHEMATIC',
      scaleNote: 'Distances and sizes are compressed for visibility (true scale would make planets invisible). The faithful tier brings outer-planet distances and relative body sizes closer to reality; per-body info cards list the actual factor.',
      modeTitle: 'CHOOSE MODE', modeDemo: 'DEMO MODE', modeDemoHint: 'Explore the solar system freely',
      modeTeach: 'TEACHING MODE', modeTeachHint: 'Guided lessons, chapter by chapter',
      groupScene: 'SCENE',
      groupEffects: 'EFFECTS',
      groupPrefs: 'PREFERENCES',
      orbits: 'ORBIT LINES',
      labels: 'LABELS',
      trails: 'TRAILS',
      stars: 'STARFIELD',
      belts: 'ASTEROID BELT',
      bloom: 'BLOOM',
      scanline: 'SCANLINES',
      vignette: 'VIGNETTE',
      gasFx: 'GAS EFFECTS',
      unitTitle: 'DISTANCE UNIT',
      unitAu: 'AU',
      unitKm: 'KM',
      langTitle: 'LANGUAGE',
      needApi: 'Greyed switches still need a scene API',

      /* ---------- 搜索 ---------- */
      searchPlaceholder: 'SEARCH BODY…',
      searchClear: 'Clear search',
      searchEmpty: 'NO MATCH',

      /* ---------- 时间条 ---------- */
      jdLabel: 'JD',
      perSec: '/s',
      dateFormatErr: 'USE FORMAT YYYY-MM-DD',
      dateInvalidErr: 'INVALID DATE',
      dateJumped: 'JUMPED',
      ephemerisShort: 'EPHEMERIS · 1800–2050',
      ephemerisVsop: 'VSOP87 (TRUNCATED) · EARTH: EMB',
      ephemerisVsopOutside: 'VSOP87 (TRUNCATED) · BEYOND FULL-SERIES ±2000Y',
      ephemerisLong: 'APPROXIMATE · LONG-TERM',
      ephemerisExtrapolated: 'EXTRAPOLATED · OUT OF RANGE',
      reverseOn: 'REVERSED',

      /* ---------- 信息卡分区 ---------- */
      orbitTitle: 'ORBIT',
      physicalTitle: 'PHYSICAL',
      atmosphereTitle: 'ATMOSPHERE',
      moonsTitle: 'MOONS',
      membersTitle: 'MEMBERS',
      discoveryTitle: 'DISCOVERY',
      modeled: 'MODELLED',
      close: 'CLOSE',
      locked: 'TIDALLY LOCKED',
      eraPrehistoric: 'Known since prehistory',
      eraHistorical: 'Discovered in modern era',
      eraNotApplicable: 'Not applicable',
      alignPrev: 'INNER ◀',
      alignNext: 'OUTER ▶',

      /* ---------- 快捷键补充 ---------- */
      scSearch: '/ — Search bodies',
      scSettings: 'S — Settings',
      scStep: '← / → — Prev / next body',

      /* ---------- 加载阶段 ---------- */
      loadStage1: 'BUILDING STAR',
      loadStage2: 'BUILDING PLANETS',
      loadStage3: 'BUILDING ORBITS',
      loadStage4: 'COMPILING SHADERS',
      loadStage5: 'READY'
    },

    fields: {
      distance: 'Distance from Sun',
      diameter: 'Diameter',
      radiusScale: 'Size vs Earth',
      distScale: 'Distance vs Earth',
      mass: 'Mass',
      density: 'Density',
      gravity: 'Surface gravity',
      escape: 'Escape velocity',
      temp: 'Mean temperature',
      rotation: 'Rotation period',
      orbitalPeriod: 'Orbital period',
      moons: 'Moons',
      atmosphere: 'Atmosphere',
      semiMajor: 'Semi-major axis',
      orbitSource: 'Orbit source',
      source_vsop: 'VSOP87 · truncated J2000 elements',
      source_vsopEmb: 'VSOP87 · truncated Earth-Moon barycenter (EMB)',
      source_jpl: 'JPL / SBDB · approximate elements',
      eccentricity: 'Eccentricity',
      inclination: 'Orbital inclination',
      axialTilt: 'Axial tilt',
      phaseAngle: 'True anomaly',
      radius: 'Radius',
      orbitalSpeed: 'Mean orbital speed',
      synodic: 'Synodic period',
      perihelion: 'Perihelion',
      aphelion: 'Aphelion',
      perihelionDate: 'Perihelion date',
      pressure: 'Surface pressure',
      albedo: 'Albedo',
      magnitude: 'Apparent magnitude',
      discoverer: 'Discoverer',
      discoveryYear: 'Discovered',
      orbitRadius: 'Orbital radius',
      ringSpan: 'Ring span',
      solarDay: 'Solar day length',
      discoveryEra: 'Discovery era',
      barycenter: 'Barycentre',
      barycenterOutside: 'Barycentre outside primary'
    },

    units: {
      km: 'km', kg: 'kg', c: '°C', days: 'd', hours: 'h', years: 'yr',
      gravity: 'm/s²', vel: 'km/s', au: 'AU', density: 'g/cm³', deg: '°', moons: '',
      seconds: 's', minutes: 'min', bar: 'bar'
    },

    type: { star: 'Star', planet: 'Planet', dwarf: 'Dwarf planet', moon: 'Moon', comet: 'Comet' },

    views: {
      home: 'HOME VIEW', ecliptic: 'ECLIPTIC VIEW', inner: 'INNER VIEW', outer: 'OUTER VIEW', top: 'TOP-DOWN VIEW'
    },

    atm: {
      atm_sun: 'Hydrogen 73.5%, Helium 24.9%, Oxygen 0.8%, Carbon 0.3%',
      atm_mercury: 'Trace exosphere: O, Na, H, He, K',
      atm_venus: 'CO₂ 96.5%, N₂ 3.5%, traces of SO₂',
      atm_earth: 'N₂ 78.1%, O₂ 20.9%, Ar 0.93%, CO₂ 0.04%',
      atm_mars: 'CO₂ 95.3%, N₂ 2.7%, Ar 1.6%, O₂ 0.13%',
      atm_jupiter: 'H₂ 89.8%, He 10.2%, CH₄ 0.3%',
      atm_saturn: 'H₂ 96.3%, He 3.25%, CH₄ 0.45%',
      atm_uranus: 'H₂ 82.5%, He 15.2%, CH₄ 2.3%',
      atm_neptune: 'H₂ 80%, He 19%, CH₄ 1.5%',
      atm_pluto: 'Thin N₂ with CH₄ and CO (freezes when far from Sun)'
    },

    galaxy: {
      speed: 'SPEED', distance: 'TO CENTER', year: 'GALACTIC YEAR',
      progress: 'PROGRESS', travelled: 'TRAVELLED', plane: 'ABOVE PLANE'
    },

    bodies: {
      sun: {
        name: 'Sun',
        desc: 'The G2V star at the heart of the system, holding 99.86% of its total mass. Its core fuses 600 million tonnes of hydrogen every second, and the energy released takes roughly 100,000 years to reach the surface.',
        fact: 'The Sun rotates faster at its equator (25 days) than at its poles (35 days) — it is a ball of plasma, not a solid body.'
      },
      mercury: {
        name: 'Mercury',
        desc: 'The smallest planet and the closest to the Sun. With almost no atmosphere, it swings between 430°C in daylight and −180°C at night, and its cratered surface looks much like the Moon.',
        fact: 'A single day on Mercury (one solar day) lasts two Mercury years — it spins three times for every two orbits.'
      },
      venus: {
        name: 'Venus',
        desc: 'Earth\'s twin in size but a runaway greenhouse world. A dense CO₂ atmosphere and sulfuric-acid clouds trap heat, making its surface hotter than Mercury at a steady 464°C under 92 bar of pressure.',
        fact: 'Venus spins backwards — on Venus the Sun rises in the west, and one rotation takes 243 Earth days.'
      },
      earth: {
        name: 'Earth',
        desc: 'The only world known to host life, and the only one with liquid water oceans covering 71% of its surface. Its magnetic field and ozone layer shield the biosphere from solar and cosmic radiation.',
        fact: 'Earth is not a perfect sphere: its rotation bulges the equator, making it 43 km wider than it is tall.'
      },
      mars: {
        name: 'Mars',
        desc: 'The rusty world of iron-oxide dust, home to Olympus Mons (the tallest volcano in the Solar System, 22 km) and Valles Marineris, a canyon 4,000 km long.',
        fact: 'Mars has seasons like Earth because its axis is tilted 25°, but each season lasts about twice as long.'
      },
      jupiter: {
        name: 'Jupiter',
        desc: 'The gas giant that outweighs all other planets combined. Its Great Red Spot is a storm wider than Earth that has raged for at least 190 years, and its magnetosphere is the largest structure in the system.',
        fact: 'Jupiter\'s moon count keeps climbing — it now has 95 confirmed moons, more than any other planet.'
      },
      saturn: {
        name: 'Saturn',
        desc: 'Famous for its icy ring system, which spans 280,000 km yet is often less than 100 m thick. Its mean density is lower than water — the only planet that would float.',
        fact: 'The rings are young and vanishing: Cassini data suggests they may disappear within 100 million years.'
      },
      uranus: {
        name: 'Uranus',
        desc: 'An ice giant tipped almost completely onto its side, probably by an ancient collision. Each pole gets 42 years of continuous sunlight followed by 42 years of darkness.',
        fact: 'Uranus is the coldest planet — despite Neptune being farther out, Uranus holds the record at −224°C.'
      },
      neptune: {
        name: 'Neptune',
        desc: 'The windiest world: supersonic storms reach 2,100 km/h in its methane-rich atmosphere, which gives the planet its deep blue colour. It was found by mathematics before it was ever seen.',
        fact: 'Neptune has completed only one orbit since its discovery in 1846 — it returns to that point in 2011.'
      },
      pluto: {
        name: 'Pluto',
        desc: 'A dwarf planet in the Kuiper Belt with a heart-shaped nitrogen-ice plain, Sputnik Planitia. Its moon Charon is so large that the pair orbit a common point in empty space.',
        fact: 'Pluto\'s orbit is so tilted and stretched that it spends 20 of its 248-year orbit closer to the Sun than Neptune.'
      },
      ceres: { name: 'Ceres', desc: 'The largest object in the asteroid belt and the first dwarf planet found; Dawn revealed bright salt deposits left by briny water.', fact: 'Ceres holds about a quarter of the entire asteroid belt\'s mass.' },
      vesta: { name: 'Vesta', desc: 'A dry, differentiated protoplanet with a giant impact basin at its south pole; fragments of it fall to Earth as HED meteorites.', fact: 'Vesta is the only asteroid ever visible to the unaided eye.' },
      eris: { name: 'Eris', desc: 'The most massive known dwarf planet — slightly smaller than Pluto but about 27% heavier — orbiting far beyond Neptune on a steeply tilted path.', fact: 'Eris reflects ~96% of the light it receives, which is why it was briefly thought to be larger than Pluto.' },
      haumea: { name: 'Haumea', desc: 'An elongated, fast-spinning dwarf planet shaped like a rugby ball, with a ring and two moons; its surface is nearly pure water ice.', fact: 'Haumea spins once every 3.9 hours — so fast that it is stretched into a triaxial ellipsoid.' },
      makemake: { name: 'Makemake', desc: 'A large Kuiper Belt body covered in methane and nitrogen ices that give it a reddish tint; it has one known moon.', fact: 'Makemake\'s orbit is inclined 29° — very steep for a body of its size.' }
    },

    moons: {
      luna: { name: 'Moon', desc: 'Earth\'s only natural satellite, tidally locked so one face always points at us.' },
      phobos: { name: 'Phobos', desc: 'A lumpy 11 km moon circling Mars three times a day, slowly falling toward the planet.' },
      deimos: { name: 'Deimos', desc: 'The smaller and farther Martian moon, likely a captured asteroid.' },
      io: { name: 'Io', desc: 'The most volcanically active body in the Solar System, squeezed by Jupiter\'s tides.' },
      europa: { name: 'Europa', desc: 'A cracked ice shell over a salt-water ocean containing more water than Earth\'s seas.' },
      ganymede: { name: 'Ganymede', desc: 'The largest moon in the Solar System — bigger than Mercury.' },
      callisto: { name: 'Callisto', desc: 'The most heavily cratered object known, a dead world of ice and rock.' },
      enceladus: { name: 'Enceladus', desc: 'A tiny moon firing plumes of water vapour from a subsurface ocean.' },
      titan: { name: 'Titan', desc: 'The only moon with a thick atmosphere and rivers, lakes and rain of liquid methane.' },
      triton: { name: 'Triton', desc: 'A captured Kuiper Belt object orbiting Neptune backwards, with nitrogen geysers.' },
      charon: { name: 'Charon', desc: 'Pluto\'s mutually tidally locked companion; their barycenter lies outside Pluto, so the pair behaves as a binary system.' },
      rhea: { name: 'Rhea', desc: 'Saturn\'s second-largest moon — a heavily cratered ice world with a thin oxygen-bearing exosphere.' },
      titania: { name: 'Titania', desc: 'Uranus\'s largest moon, cut by enormous canyons that suggest its crust once stretched and split.' }
    },

    comet: {
      halley: { name: 'Halley\'s Comet', desc: 'A 75-year comet on a highly eccentric retrograde orbit, visible from Earth since 240 BC.' },
      encke: { name: 'Comet Encke (2P)', desc: 'The shortest-period bright comet known, returning every 3.3 years; it is the likely parent of the Taurid meteor stream.' },
      churyumov: { name: 'Comet 67P/Churyumov–Gerasimenko', desc: 'A Jupiter-family comet visited by ESA\'s Rosetta, which mapped its rubber-duck-shaped nucleus and landed the Philae probe on it.' }
    }
  },

  /* ============================== 中文 ============================== */
  zh: {
    ui: {
      title: '太阳系',
      subtitle: '实时三维星象仪 · VSOP87 / J2000',
      navTitle: '天体',
      navToggle: '收起 / 展开',
      viewTitle: '预设视角',
      panelTitle: '数据',
      loading: '正在初始化',
      loadingTip: '正在构建太阳系…',

      timeTitle: '时间',
      utc: '协调世界时',
      speed: '倍速',
      effective: '有效',
      play: '播放',
      pause: '暂停',
      reverse: '倒流',
      now: '此刻',
      jump: '跳转',
      datePlaceholder: '年-月-日',

      viewTitle: '视角',
      galaxy: '银河视角',
      galaxyOn: '银河中',
      cruise: '自动巡航',
      cruiseOn: '巡航中',
      align: '行星连珠',
      alignOn: '连珠中',
      reset: '重置视角',
      resetLabel: '重置',
      immersive: '沉浸模式',
      immersiveLabel: '沉浸',
      immersiveHint: '按 H 切换界面显示',
      follow: '跟随中',
      unfollow: '退出跟随',

      quality: '画质',
      fps: '帧率',
      triangles: '三角面',
      debug: '调试',
      bodies: '天体数',
      sunPhotosphere: '光球层',
      sunChromosphere: '色球层',
      sunCorona: '日冕',

      descTitle: '简介',
      factTitle: '冷知识',
      compareTitle: '与地球对比',
      compareEmpty: '暂无对比数据',

      selectHint: '点击天体以锁定相机',
      emptyHint: '点击空白处取消选择',
      lang: 'English',

      shortcuts: '快捷键',
      scPause: '空格 — 播放 / 暂停',
      scReset: 'R — 重置视角',
      scHud: 'H — 沉浸模式',
      scSpeedUp: '↑ / ↓ — 调节倍速',
      scEsc: 'Esc — 取消选择',

      /* ---------- 设置面板 ---------- */
      settings: '设置',
      scaleTitle: '显示比例', scaleCompact: '压缩示意', scaleFaithful: '弱压缩示意',
      scaleReal: '真实比例', scaleIconic: '示意比例',
      scaleNote: '距离与天体尺寸均为示意压缩——真实比例下行星会小到不可见（需对数深度缓冲才能实现）。弱压缩档让外行星距离与天体之间的相对大小更接近真实，同时放大天体便于观察；每个天体被压缩的倍数见其信息卡。',
      modeTitle: '选择模式', modeDemo: '进入演示模式', modeDemoHint: '自由探索太阳系全景',
      modeTeach: '进入教学模式', modeTeachHint: '按教材章节逐步演示',
      groupScene: '场景',
      groupEffects: '特效',
      groupPrefs: '偏好',
      orbits: '轨道线',
      labels: '天体标签',
      trails: '运动拖尾',
      stars: '星空背景',
      belts: '小行星带',
      bloom: '泛光',
      scanline: '扫描线',
      vignette: '暗角',
      gasFx: '气态动效',
      unitTitle: '距离单位',
      unitAu: '天文单位',
      unitKm: '千米',
      langTitle: '语言',
      needApi: '置灰的开关尚需场景接口支持',

      /* ---------- 搜索 ---------- */
      searchPlaceholder: '搜索天体…',
      searchClear: '清除搜索',
      searchEmpty: '无匹配天体',

      /* ---------- 时间条 ---------- */
      jdLabel: '儒略日',
      perSec: '/秒',
      dateFormatErr: '格式应为 年-月-日',
      dateInvalidErr: '日期无效',
      dateJumped: '已跳转',
      ephemerisShort: '星历 · 1800–2050',
      ephemerisVsop: 'VSOP87 截断版 · 地球轨道为地月质心',
      ephemerisVsopOutside: 'VSOP87 截断版 · 超出原始级数共同 ±2000 年参考跨度',
      ephemerisLong: '长期近似 · 星历范围内',
      ephemerisExtrapolated: '外推 · 超出星历范围',
      reverseOn: '倒流中',

      /* ---------- 信息卡分区 ---------- */
      orbitTitle: '轨道参数',
      physicalTitle: '物理特性',
      atmosphereTitle: '大气',
      moonsTitle: '卫星',
      membersTitle: '系统成员',
      discoveryTitle: '发现与观测',
      modeled: '已建模',
      close: '关闭',
      locked: '潮汐锁定',
      eraPrehistoric: '史前已知',
      eraHistorical: '近代观测发现',
      eraNotApplicable: '不适用',
      alignPrev: '内侧 ◀',
      alignNext: '外侧 ▶',

      /* ---------- 快捷键补充 ---------- */
      scSearch: '/ — 搜索天体',
      scSettings: 'S — 打开设置',
      scStep: '← / → — 切换天体',

      /* ---------- 加载阶段 ---------- */
      loadStage1: '构建恒星',
      loadStage2: '构建行星与卫星',
      loadStage3: '生成轨道与带',
      loadStage4: '编译着色器',
      loadStage5: '就绪'
    },

    fields: {
      distance: '距日距离',
      diameter: '直径',
      radiusScale: '相对地球大小',
      distScale: '相对地球距离',
      mass: '质量',
      density: '密度',
      gravity: '表面重力',
      escape: '逃逸速度',
      temp: '平均温度',
      rotation: '自转周期',
      orbitalPeriod: '公转周期',
      moons: '卫星数量',
      atmosphere: '大气成分',
      semiMajor: '轨道半长轴',
      orbitSource: '轨道来源',
      source_vsop: 'VSOP87 · 截断 J2000 要素',
      source_vsopEmb: 'VSOP87 · 截断地月质心（EMB）近似',
      source_jpl: 'JPL / SBDB · 近似根数',
      eccentricity: '轨道偏心率',
      inclination: '轨道倾角',
      axialTilt: '自转轴倾角',
      phaseAngle: '真近点角',
      radius: '半径',
      orbitalSpeed: '平均轨道速度',
      synodic: '会合周期',
      perihelion: '近日点',
      aphelion: '远日点',
      perihelionDate: '近日点日期',
      pressure: '表面气压',
      albedo: '反照率',
      magnitude: '视星等',
      discoverer: '发现者',
      discoveryYear: '发现年份',
      orbitRadius: '轨道半径',
      ringSpan: '环系跨度',
      solarDay: '太阳日长度',
      discoveryEra: '发现时代',
      barycenter: '共同质心',
      barycenterOutside: '质心位于主星之外'
    },

    units: {
      km: '千米', kg: '千克', c: '℃', days: '天', hours: '小时', years: '年',
      gravity: '米/秒²', vel: '千米/秒', au: '天文单位', density: '克/立方厘米', deg: '°', moons: '颗',
      seconds: '秒', minutes: '分钟', bar: '巴'
    },

    type: { star: '恒星', planet: '行星', dwarf: '矮行星', moon: '卫星', comet: '彗星' },

    views: {
      home: '默认视角', ecliptic: '黄道视角', inner: '内太阳系视角', outer: '外太阳系视角', top: '正俯视视角'
    },

    atm: {
      atm_sun: '氢 73.5%、氦 24.9%、氧 0.8%、碳 0.3%',
      atm_mercury: '极稀薄外逸层：氧、钠、氢、氦、钾',
      atm_venus: '二氧化碳 96.5%、氮 3.5%，含微量二氧化硫',
      atm_earth: '氮 78.1%、氧 20.9%、氩 0.93%、二氧化碳 0.04%',
      atm_mars: '二氧化碳 95.3%、氮 2.7%、氩 1.6%、氧 0.13%',
      atm_jupiter: '氢 89.8%、氦 10.2%、甲烷 0.3%',
      atm_saturn: '氢 96.3%、氦 3.25%、甲烷 0.45%',
      atm_uranus: '氢 82.5%、氦 15.2%、甲烷 2.3%',
      atm_neptune: '氢 80%、氦 19%、甲烷 1.5%',
      atm_pluto: '稀薄氮气，含甲烷与一氧化碳（远离太阳时冻结）'
    },

    galaxy: {
      speed: '绕银心速度', distance: '距银心', year: '银河年',
      progress: '已完成', travelled: '已行进', plane: '距银道面'
    },

    bodies: {
      sun: {
        name: '太阳',
        desc: '位于系统中心的 G2V 型恒星，占据太阳系总质量的 99.86%。核心每秒将 6 亿吨氢聚变为氦，产生的能量要花约 10 万年才能抵达表面。',
        fact: '太阳赤道自转一周约 25 天，两极约 35 天——它是等离子球，并非固体。'
      },
      mercury: {
        name: '水星',
        desc: '体积最小、离太阳最近的行星。几乎没有大气，白天可达 430℃，夜晚降至 −180℃，布满撞击坑的地表酷似月球。',
        fact: '水星上一个太阳日等于两个水星年——它每公转两圈正好自转三圈。'
      },
      venus: {
        name: '金星',
        desc: '体积与地球相仿，却是失控温室的世界。浓厚的二氧化碳大气与硫酸云锁住热量，表面在 92 个大气压下稳定保持 464℃，比水星更热。',
        fact: '金星逆向自转：在那里太阳从西边升起，自转一周需 243 个地球日。'
      },
      earth: {
        name: '地球',
        desc: '目前已知唯一存在生命的星球，也是唯一表面 71% 被液态水海洋覆盖的世界。磁场与臭氧层共同庇护着生物圈免受辐射侵袭。',
        fact: '地球并非正球体：自转让赤道鼓起，赤道直径比极直径长 43 千米。'
      },
      mars: {
        name: '火星',
        desc: '氧化铁尘埃造就的红色世界，拥有太阳系最高的火山奥林帕斯山（22 千米）与长达 4000 千米的水手号峡谷。',
        fact: '火星自转轴倾斜 25°，因此同样有四季，但每个季节的长度约为地球的两倍。'
      },
      jupiter: {
        name: '木星',
        desc: '质量超过其余七颗行星总和的气态巨行星。大红斑是比地球还宽的巨型风暴，已持续至少 190 年；其磁层是太阳系中最大的结构。',
        fact: '木星已确认拥有 95 颗卫星，是太阳系卫星最多的行星，且数量仍在增加。'
      },
      saturn: {
        name: '土星',
        desc: '以冰质环系闻名，环带横跨 28 万千米，厚度却常不足 100 米。它的平均密度小于水，是唯一能"浮起来"的行星。',
        fact: '土星环很年轻且正在消失：卡西尼号的数据显示它可能在 1 亿年内消散。'
      },
      uranus: {
        name: '天王星',
        desc: '几乎是"躺着"公转的冰质巨行星，可能源于远古的一次猛烈撞击。两极各有长达 42 年的极昼与 42 年的极夜。',
        fact: '天王星才是最冷的行星——尽管海王星更远，最低温纪录 −224℃ 属于天王星。'
      },
      neptune: {
        name: '海王星',
        desc: '太阳系风速之王：富含甲烷的大气中超声速风暴可达 2100 千米/小时，也正因甲烷而呈现深蓝。它先被数学算出，后被人眼看见。',
        fact: '自 1846 年发现以来，海王星才刚绕太阳走完一圈（2011 年回到发现时的位置）。'
      },
      pluto: {
        name: '冥王星',
        desc: '柯伊伯带中的矮行星，拥有心形氮冰平原斯普特尼克平原。卫星卡戎体积巨大，二者绕着空间中共同的质心旋转。',
        fact: '冥王星轨道又斜又扁，在 248 年的公转周期中有 20 年比海王星离太阳更近。'
      },
      ceres: { name: '谷神星', desc: '小行星带中最大的天体，也是第一颗被发现的矮行星；“黎明号”在其表面发现了由含盐水体留下的明亮盐类沉积。', fact: '谷神星的质量约占整个小行星带的四分之一。' },
      vesta: { name: '灶神星', desc: '一颗已经分异的干燥原行星，南极留有巨型撞击盆地；它破碎的碎块落到地球成为 HED 族陨石。', fact: '灶神星是唯一能用肉眼直接看到的小行星。' },
      eris: { name: '阋神星', desc: '已知质量最大的矮行星，体积略小于冥王星但质量约大 27%，在陡峭倾斜的轨道上远行于海王星之外。', fact: '阋神星反照率高达约 0.96，一度被误认为比冥王星更大。' },
      haumea: { name: '妊神星', desc: '一颗被拉长成橄榄球形的快速自转矮行星，拥有环与两颗小卫星，表面近乎纯水冰。', fact: '妊神星每 3.9 小时自转一周，自转之快使它成为三轴椭球体。' },
      makemake: { name: '鸟神星', desc: '柯伊伯带中较大的天体，表面覆盖甲烷与氮冰而呈红褐色，已知有一颗卫星。', fact: '鸟神星轨道倾角 29°，对如此大的天体而言相当陡峭。' }
    },

    moons: {
      luna: { name: '月球', desc: '地球唯一的天然卫星，被潮汐锁定，永远以同一面朝向我们。' },
      phobos: { name: '火卫一', desc: '直径仅 11 千米的不规则卫星，每天绕火星三圈，并正缓慢坠向火星。' },
      deimos: { name: '火卫二', desc: '火星更小更远的那颗卫星，很可能是一颗被捕获的小行星。' },
      io: { name: '木卫一', desc: '太阳系火山活动最剧烈的天体，被木星潮汐反复挤压加热。' },
      europa: { name: '木卫二', desc: '冰壳之下藏着咸水海洋，水量超过地球全部海洋。' },
      ganymede: { name: '木卫三', desc: '太阳系最大的卫星，比水星还大。' },
      callisto: { name: '木卫四', desc: '已知撞击坑最密集的天体，一个由冰与岩石组成的死寂世界。' },
      enceladus: { name: '土卫二', desc: '从地下海洋喷出水汽羽流的小小卫星。' },
      titan: { name: '土卫六', desc: '唯一拥有浓厚大气的卫星，有液态甲烷的河流、湖泊与降雨。' },
      triton: { name: '海卫一', desc: '被捕获的柯伊伯带天体，逆向绕海王星运行，有氮气喷泉。' },
      charon: { name: '卡戎', desc: '与冥王星相互潮汐锁定；二者共同质心位于冥王星之外，因此常被视作双星系统。' },
      rhea: { name: '土卫五', desc: '土星第二大卫星，冰壳上遍布撞击坑，并拥有一层含氧的极稀薄外逸层。' },
      titania: { name: '天卫三', desc: '天王星最大的卫星，表面被巨大峡谷切割，说明其冰壳曾经被拉伸并裂开。' }
    },

    comet: {
      halley: { name: '哈雷彗星', desc: '周期约 75 年的彗星，轨道极度偏心且逆行，自公元前 240 年起就有观测记录。' },
      encke: { name: '恩克彗星 (2P)', desc: '已知周期最短的亮彗星，每 3.3 年回归一次；很可能是金牛座流星雨的母体。' },
      churyumov: { name: '丘留莫夫–格拉西缅科彗星 (67P)', desc: '木星族彗星，欧空局“罗塞塔”号曾环绕探测并绘制其“橡皮鸭”状彗核，还释放了“菲莱”着陆器。' }
    }
  }
};

/* 当前语言（默认中文） */
SOLAR.lang = 'zh';

/* 取词：t('ui.title') / t('bodies.earth.desc') */
SOLAR.t = function (path) {
  var parts = path.split('.');
  var dict = SOLAR.I18N[SOLAR.lang] || SOLAR.I18N.en;
  var v = dict, i;
  for (i = 0; i < parts.length; i++) {
    if (v == null) break;
    v = v[parts[i]];
  }
  /* 当前语言缺键时回落到英文，仍没有才返回原始路径 */
  if (v == null && dict !== SOLAR.I18N.en) {
    v = SOLAR.I18N.en;
    for (i = 0; i < parts.length; i++) {
      if (v == null) break;
      v = v[parts[i]];
    }
  }
  return v == null ? path : v;
};

/* 切换语言 */
SOLAR.setLang = function (lang) {
  SOLAR.lang = (lang === 'zh' || lang === 'en') ? lang : 'en';
  document.documentElement.setAttribute('lang', SOLAR.lang === 'zh' ? 'zh-CN' : 'en');
  if (SOLAR.UI && typeof SOLAR.UI.applyLanguage === 'function') SOLAR.UI.applyLanguage();
};
