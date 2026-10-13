/**
 * 教学模式 · 教学内容数据（纯数据模块，供 teach.js 主控读取）
 *
 * 当前范围：科学教材第3章《广袤浩瀚的宇宙》第1节《认识地球》、第2节《太阳系的组成与结构》，
 *          以及第3节地球的转动（3.5 自转 / 3.6 公转 / 3.7 正午太阳高度 / 3.8 昼夜长短 /
 *          3.9 二十四节气）与第4节日地月的相对运动（3.10 月球运动 / 3.11 日食 / 3.12 月食）。
 *
 * 使用说明：
 *   1. 层级为 chapters → sections → lessons → steps，steps 顺序即课堂讲解顺序。
 *   2. 每个 step 的 state 传给 SOLAR.TeachScenes.applyState，字段名与 teach-scenes.js 严格一致。
 *   3. src 引用 meta.sources 中的 key，界面据此显示数值来源。
 *   4. 数值口径：正文用教材常用近似值，src 保存权威值与教材依据。
 *   5. 需要定点机位时在该 step 加 camera：{ polar: 度, azim: 度, dist: 地球半径倍数 }，
 *      未写的值取装置默认机位；加 focus: 'sun' 可让 orrery 装置注视太阳（全景机位）。
 *   6. step.termBar: true 时，画面底部显示二分二至定位按钮（teach.js 读取）：
 *      点击把地球移到对应轨道位置、暂停公转、视角移近地球向阳侧，
 *      并弹出「节气 · 日期 · 直射纬线」小浮窗；按播放可从该位置继续公转。
 *      termBar: 'tracks' 为平地装置的三按钮档（夏至/春秋分/冬至）：
 *      只切换太阳周日视运动轨迹，不暂停、不弹浮窗、不移相机。
 *   7. rig: 'ground' 为平地观日装置（teach-ground.js，教材图 4.2-14）：
 *      地面 + 三条太阳轨迹弧 + 立杆杆影；params.latDeg 可改观察纬度（默认 23.5°N）。
 *   8. rig: 'moonsync' 为简易地月模型（teach-moonsync.js，教材图 4.3-8）：
 *      地球静止居中、只自转不公转；月球公转且自转周期与公转周期相同。
 *      画面从简：不画标记 / 文字 / 转轴，只留两天体 + 轨道环 + 地球经纬网。
 *      params.grid 控制地球经纬网（与三球仪同款 30° 细线，默认显示），params.orbit 控制轨道环。
 *
 * state 字段含义：
 *   rig          当前演示装置：'globe' 地球仪 / 'orrery' 三球仪（公转·节气）/ 'ground' 平地观日 / 'moonsync' 简易地月模型 / 'none' 不出装置 / null 不切换
 *   scale        尺度：'real' 尽量真实比例 / 'iconic' 示意比例
 *   anim         动画：spin 自转、revolve 公转（月相中为月球绕地）、speed 倍速
 *   params.grid            是否显示经纬网
 *   params.gridStep        经纬网间隔（度）
 *   params.highlight       高亮特殊线：equator/tropic_n/tropic_s/polar_n/polar_s/meridian0/meridian180/ew_boundary
 *   params.axis            是否显示地轴
 *   params.spinMark        是否显示自转方向箭头与周期标注（教材图4.2-1）
 *   params.tiltDeg         地轴与黄道面夹角（度），教材口径 66.5
 *   params.tiltLocked      地轴倾斜方向是否保持不变
 *   params.spinDeg         地球自转角（度）
 *   params.sunLonDeg       太阳直射点所在经度（度）
 *   params.terminator      是否显示晨昏线
 *   params.sunPoint        三球仪：是否显示直射纬线圈 + 度数标签（地球仪的直射点标记已退役，一律不显示）
 *   params.cities          标注点：beijing/shanghai/hangzhou/tianjin/hongkong/sydney/paris/london/newyork/alexandria/syene
 *   params.cityLabels      是否显示城市名称
 *   params.polarDayNight   极昼极夜球冠开关（已停用：改由极圈昼夜分色表达，无步骤再设）
 *   params.moonPhaseDay    月相日（0~29.53），0 为朔
 *   params.moonOrbit       是否显示月球轨道（白道）
 *   params.moonNodeLine    是否显示白道与黄道的交点线（默认关，避免与光线/地轴混淆）
 *   params.moonTiltDeg     白道相对黄道倾角（度）
 *   params.dayOfYear       演示日期在一年中的序号（1~365）
 *   params.term            节气定位
 *   params.orbitMarks      公转轨道上的节气标注：true=24 个全显 / 'major'=仅二分二至 / 缺省=不显示
 *   params.sunRays         是否画出太阳光线
 *   params.eratosthenes    是否显示埃拉托色尼测量示意（平行太阳光 + 地心延长线 + 7.2° 弧）
 *   params.voyage          是否显示环球航行航线示意
 *   params.satellites      是否显示人造地球卫星
 *   params.sizeRings       是否显示赤道周长 / 赤道半径 / 表面积标注
 *   params.degreeLabels    是否显示经纬度度数标注
 *   params.shapeScene      地球形状 / 日食专题镜头：horizon（远去船只）/ eclipse（月食）/ solareclipse（日食影锥）
 *   params.satelliteMode   人造卫星专题样式（预留：dongfang1，当前无步骤启用）
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TEACH_DATA = {
  /* ============================ 元信息 ============================ */
  meta: {
    version: '2.0',
    updated: '2026-10-06',
    note: 'teach.meta.note',
    sources: [
      { key: 'textbook_3_1', text: 'teach.d.src.textbook_3_1' },
      { key: 'earth_size', text: 'teach.d.src.earth_size' },
      { key: 'earth_surface', text: 'teach.d.src.earth_surface' },
      { key: 'eratosthenes', text: 'teach.d.src.eratosthenes' },
      { key: 'magellan', text: 'teach.d.src.magellan' },
      { key: 'space_earth', text: 'teach.d.src.space_earth' },
      { key: 'globe_model', text: 'teach.d.src.globe_model' },
      { key: 'latlon_grid', text: 'teach.d.src.latlon_grid' },
      { key: 'solar_system', text: 'teach.d.src.solar_system' },
      { key: 'prime_meridian', text: 'teach.d.src.prime_meridian' },
      { key: 'map_basic', text: 'teach.d.src.map_basic' },
      { key: 'bds', text: 'teach.d.src.bds' },
      { key: 'earth_rotation', text: 'teach.d.src.earth_rotation' },
      { key: 'earth_revolution', text: 'teach.d.src.earth_revolution' },
      { key: 'solar_height', text: 'teach.d.src.solar_height' },
      { key: 'day_night_length', text: 'teach.d.src.day_night_length' },
      { key: 'solar_terms', text: 'teach.d.src.solar_terms' },
      { key: 'moon_motion', text: 'teach.d.src.moon_motion' },
      { key: 'solar_eclipse', text: 'teach.d.src.solar_eclipse' },
      { key: 'lunar_eclipse', text: 'teach.d.src.lunar_eclipse' }
    ]
  },

  /* ============================ 章节 ============================ */
  chapters: [
    {
      id: 'ch3',
      title: 'teach.lesson.ch1.title',
      /* 三层结构：section（教材的"节"）→ lesson（小节）→ step（界面）。
         教材：第 1 节 认识地球（含形状/大小/地球仪三个小节）、第 2 节 太阳系的组成与结构。 */
      sections: [
        {
          id: 'sec-3-1',
          title: 'teach.d.s1.title',
          lessons: [
        {
          id: '3.1',
          title: 'teach.d.s1.l1.title',
          summary: 'teach.lesson.s1l1.summary',
          points: [
            'teach.lesson.s1l1.p0',
            'teach.lesson.s1l1.p1',
            'teach.lesson.s1l1.p2',
            'teach.lesson.s1l1.p3'
          ],
          steps: [
            {
              id: '3.1.1',
              title: 'teach.d.s1.l1.step1.title',
              text: 'teach.d.s1.l1.step1.text',
              ask: 'teach.d.s1.l1.step1.ask',
              src: 'textbook_3_1',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1 },
                params: { shapeScene: 'horizon', grid: false, gridStep: 30, axis: false, terminator: false, voyage: false, satellites: false }
              },
              /* 相机贴海面（等效眼高 0.35R）、朝船行方向（-z）：azim=90 使船
                 驶向画面深处，而不是从左到右横移。 */
              camera: { polar: 21, azim: 90, dist: 3.86 }
            },
            {
              id: '3.1.2',
              title: 'teach.d.s1.l1.step2.title',
              text: 'teach.d.s1.l1.step2.text',
              ask: 'teach.d.s1.l1.step2.ask',
              src: 'textbook_3_1',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: true, speed: 0.35 },
                params: { shapeScene: 'eclipse', grid: false, gridStep: 30, axis: false, moonPhaseDay: 14.77, moonOrbit: false, moonTiltDeg: 5.145, sunRays: false, voyage: false, satellites: false }
              },
              camera: { polar: 0, azim: 90, dist: 3.6 }
            },
            {
              id: '3.1.3',
              title: 'teach.d.s1.l1.step3.title',
              text: 'teach.d.s1.l1.step3.text',
              src: 'magellan',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1.2 },
                params: { grid: true, gridStep: 30, axis: false, terminator: false, voyage: true, satellites: false }
              },
              camera: { polar: 20, azim: 35, dist: 4.0 }
            },
            {
              id: '3.1.4',
              title: 'teach.d.s1.l1.step4.title',
              text: 'teach.d.s1.l1.step4.text',
              src: 'space_earth',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: true, revolve: false, speed: 0.7 },
                params: { grid: true, gridStep: 30, axis: false, terminator: true, sunLonDeg: 80, satellites: false, voyage: false }
              },
              camera: { polar: 28, azim: 75, dist: 3.7 }
            }
          ]
        },
        {
          id: '3.2',
          title: 'teach.d.s1.l2.title',
          summary: 'teach.lesson.s1l2.summary',
          points: [
            'teach.lesson.s1l2.p0',
            'teach.lesson.s1l2.p1',
            'teach.lesson.s1l2.p2'
          ],
          steps: [
            {
              id: '3.2.1',
              title: 'teach.d.s1.l2.step1.title',
              text: 'teach.d.s1.l2.step1.text',
              ask: 'teach.d.s1.l2.step1.ask',
              src: 'earth_size',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: true, revolve: false, speed: 0.4 },
                /* tiltDeg:90 → tiltGroup 不倾斜，地轴竖直：北极正上、南极正下。
                   讲尺寸与经纬网时地球应正立，倾斜留给后续讲四季/直射点。 */
                params: { grid: true, gridStep: 30, axis: false, terminator: false, satellites: false, voyage: false, sizeRings: true, tiltDeg: 90 }
              },
              camera: { polar: 24, azim: 30, dist: 3.6 }
            },
            {
              id: '3.2.2',
              title: 'teach.d.s1.l2.step2.title',
              text: 'teach.d.s1.l2.step2.text',
              ask: 'teach.d.s1.l2.step2.ask',
              src: 'eratosthenes',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1 },
                params: { grid: true, gridStep: 30, axis: false, terminator: false, satellites: false, voyage: false, eratosthenes: true, cities: ['alexandria', 'syene'], tiltDeg: 90 }
              },
              /* 相机对准东经 30°（埃及）：placeLatLon 约定东经偏向 -Z，
                 azim 取 -30 让亚历山大/塞尼与光柱正对镜头。 */
              camera: { polar: 4, azim: 5, dist: 4.4 }
            }
          ]
        },
        {
          id: '3.3',
          title: 'teach.d.s1.l3.title',
          summary: 'teach.lesson.s1l3.summary',
          points: [
            'teach.lesson.s1l3.p0',
            'teach.lesson.s1l3.p1',
            'teach.lesson.s1l3.p2'
          ],
          steps: [
            {
              id: '3.3.1',
              title: 'teach.d.s1.l3.step1.title',
              text: 'teach.d.s1.l3.step1.text',
              ask: 'teach.d.s1.l3.step1.ask',
              src: 'latlon_grid',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1 },
                params: {
                  grid: true, gridStep: 30, axis: true, terminator: false, satellites: false, voyage: false,
                  highlight: ['equator', 'tropic_n', 'tropic_s', 'lat30_n', 'lat30_s', 'lat60_n', 'lat60_s', 'polar_n', 'polar_s'],
                  degreeLabels: 'lat'
                }
              },
              camera: { polar: 12, azim: 0, dist: 3.7 }
            },
            {
              id: '3.3.2',
              title: 'teach.d.s1.l3.step2.title',
              text: 'teach.d.s1.l3.step2.text',
              ask: 'teach.d.s1.l3.step2.ask',
              src: 'prime_meridian',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1 },
                params: {
                  grid: true, gridStep: 30, axis: true, terminator: false, satellites: false, voyage: false,
                  highlight: ['meridian0', 'meridian20', 'meridian40', 'meridian60', 'meridian80', 'meridian100',
                    'meridian120', 'meridian140', 'meridian160', 'meridian180',
                    'meridian-20', 'meridian-40', 'meridian-60', 'meridian-80',
                    'meridian-100', 'meridian-120', 'meridian-140', 'meridian-160'],
                  degreeLabels: 'lon'
                }
              },
              camera: { polar: 18, azim: -5, dist: 3.7 }
            }
          ]
        },
        ] // sec-3-1 认识地球
        },
        {
          id: 'sec-3-2',
          title: 'teach.d.s2.title',
          lessons: [
        {
          id: '3.4',
          title: 'teach.d.s2.l1.title',
              summary: 'teach.lesson.s2l1.summary',
          points: [
              'teach.lesson.s2l1.p0',
              'teach.lesson.s2l1.p1',
              'teach.lesson.s2l1.p2'
          ],
          steps: [
            {
              id: '3.4.1',
              title: 'teach.d.s2.l1.step1.title',
              text: 'teach.d.s2.l1.step1.text',
              ask: 'teach.d.s2.l1.step1.ask',
              /* soloTip：隐藏常规信息面板，屏幕中间只显示引导小面板；
                 教学装置只有地球仪与日地月示意，完整太阳系在演示模式里。 */
              soloTip: true,
              gotoDemo: 'teach.d.s2.l1.step1.gotoDemo',
              src: 'solar_system',
              state: {
                /* rig 'none'：地球仪与日地月装置都收起，只留星空背景——
                   这一步的重点是引导去演示模式，不需要任何 3D 装置。 */
                rig: 'none', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1 },
                params: {}
              },
              camera: { dist: 5.0, polar: 12, azim: 0 }
            }
          ]
        }
        ] // sec-3-2 太阳系的组成与结构
        },
        {
          id: 'sec-3-3',
          title: 'teach.d.s3.title',
          lessons: [
            {
              id: '3.5',
              title: 'teach.d.s3.l1.title',
              summary: 'teach.lesson.s3l1.summary',
              points: [
                'teach.lesson.s3l1.p0',
                'teach.lesson.s3l1.p1',
                'teach.lesson.s3l1.p2',
                'teach.lesson.s3l1.p3'
              ],
              steps: [
                {
                  id: '3.5.1',
                  title: 'teach.d.s3.l1.step1.title',
                  text: 'teach.d.s3.l1.step1.text',
                  src: 'earth_rotation',
                  state: {
                    rig: 'globe', scale: 'iconic',
                    anim: { spin: true, revolve: false, speed: 1 },
                    params: {
                      grid: true, gridStep: 30,
                      axis: true,
                      tiltDeg: 90,
                      spinMark: true,
                      sunPoint: false
                    }
                  },
                  camera: { polar: 24, azim: 90, dist: 5.0 }
                },
                {
                  id: '3.5.2',
                  title: 'teach.d.s3.l1.step2.title',
                  text: 'teach.d.s3.l1.step2.text',
                  src: 'earth_rotation',
                  state: {
                    rig: 'globe', scale: 'iconic',
                    anim: { spin: true, revolve: false, speed: 1 },
                    params: {
                      axis: true,
                      tiltDeg: 90,
                      terminator: true,
                      sunPoint: false,
                      gridStep: 30
                    }
                  },
                  camera: { polar: 88, azim: 0 }
                },
                {
                  id: '3.5.3',
                  title: 'teach.d.s3.l1.step3.title',
                  text: 'teach.d.s3.l1.step3.text',
                  ask: 'teach.d.s3.l1.step3.ask',
                  src: 'earth_rotation',
                  state: {
                    rig: 'globe', scale: 'iconic',
                    anim: { spin: true, revolve: false, speed: 1 },
                    params: {
                      grid: true, gridStep: 30,
                      axis: true,
                      terminator: true,
                      sunPoint: false,
                      highlight: ['meridian0'],
                      cities: ['beijing', 'london'],
                      cityLabels: true
                    }
                  },
                  camera: { polar: 28, azim: 95 }
                }
              ]
            },
            {
              id: '3.6',
              title: 'teach.d.s3.l2.title',
              summary: 'teach.lesson.s3l2.summary',
              points: [
                'teach.lesson.s3l2.p0',
                'teach.lesson.s3l2.p1',
                'teach.lesson.s3l2.p2',
                'teach.lesson.s3l2.p3',
                'teach.lesson.s3l2.p4'
              ],
              steps: [
                {
                  id: '3.6.1',
                  title: 'teach.d.s3.l2.step1.title',
                  text: 'teach.d.s3.l2.step1.text',
                  ask: 'teach.d.s3.l2.step1.ask',
                  src: 'earth_revolution',
                  state: {
                    rig: 'orrery', scale: 'iconic',
                    anim: { spin: true, revolve: true, speed: 1 },
                    params: {
                      tiltDeg: 66.5,
                      tiltLocked: true,
                      sunPoint: true,
                      terminator: true,
                      /* 月球的公转轨道线（绕地球的白道圈） */
                      moonOrbit: true,
                      orbitMarks: 'major'
                    }
                  },
                  /* 二分二至定位按钮条：替代轨道上的节气标签（orbitMarks 已关），
                     点击把地球移到教材图4.2-6 的四个关键位置 */
                  termBar: true,
                  /* 全景机位（参考教材图4.2-6）：注视太阳、俯视轨道全貌。
                     focus:'sun' 让取景中心从地球改为装置原点（太阳）。 */
                   camera: { focus: 'sun', polar: 40, azim: 0, dist: 72 }
                }
              ]
            },
            {
              id: '3.7',
              title: 'teach.d.s3.l3.title',
              summary: 'teach.lesson.s3l3.summary',
              points: [
                'teach.lesson.s3l3.p0',
                'teach.lesson.s3l3.p1',
                'teach.lesson.s3l3.p2',
                'teach.lesson.s3l3.p3'
              ],
              steps: [
                {
                  id: '3.7.1',
                  title: 'teach.d.s3.l3.step1.title',
                  text: 'teach.d.s3.l3.step1.text',
                  ask: 'teach.d.s3.l3.step1.ask',
                  src: 'solar_height',
                  /* 'tracks' 档：只留三个「选轨迹」钮（夏至/春秋分/冬至），
                     点击只切换太阳周日视运动弧，不暂停、不弹浮窗 */
                  termBar: 'tracks',
                  state: {
                    rig: 'ground', scale: 'iconic',
                    anim: { spin: false, revolve: true, speed: 1 },
                    params: { latDeg: 23.5 }
                  },
                  camera: { polar: 20, azim: -135, dist: 32.0 }
                }
              ]
            },
            {
              id: '3.8',
              title: 'teach.d.s3.l4.title',
              summary: 'teach.lesson.s3l4.summary',
              points: [
                'teach.lesson.s3l4.p0',
                'teach.lesson.s3l4.p1',
                'teach.lesson.s3l4.p2',
                'teach.lesson.s3l4.p3'
              ],
              steps: [
                {
                  id: '3.8.1',
                  title: 'teach.d.s3.l4.step1.title',
                  text: 'teach.d.s3.l4.step1.text',
                  ask: 'teach.d.s3.l4.step1.ask',
                  src: 'day_night_length',
                  /* 节气条切换直射点：夏至北极圈极昼 / 冬至极夜 / 春秋分昼夜等长，
                     自转保持播放，可直观看到极地始终停在昼半球或夜半球 */
                  termBar: true,
                  state: {
                    rig: 'globe', scale: 'iconic',
                    anim: { spin: true, revolve: false, speed: 1 },
                    params: {
                      tiltDeg: 66.5,
                      sunLonDeg: 90,
                      terminator: true,
                      /* 北京纬线按昼夜分两段着色：昼弧/夜弧长度比直观对应昼夜长短；
                         不叠极昼极夜半透明帽（与分色纬线信息重复且干扰读图） */
                      highlight: ['polar_n', 'polar_s', 'beijing_lat'],
                      cities: ['beijing'],
                      cityLabels: true
                    }
                  },
                  camera: { polar: 24, azim: 0, dist: 5.0 }
                }
              ]
            },
            {
              id: '3.9',
              title: 'teach.d.s3.l5.title',
              summary: 'teach.lesson.s3l5.summary',
              points: [
                'teach.lesson.s3l5.p0',
                'teach.lesson.s3l5.p1',
                'teach.lesson.s3l5.p2',
                'teach.lesson.s3l5.p3'
              ],
              steps: [
                {
                  id: '3.9.1',
                  title: 'teach.d.s3.l5.step1.title',
                  text: 'teach.d.s3.l5.step1.text',
                  ask: 'teach.d.s3.l5.step1.ask',
                  src: 'solar_terms',
                  state: {
                    rig: 'orrery', scale: 'iconic',
                    anim: { spin: true, revolve: true, speed: 1 },
                    params: {
                      tiltDeg: 66.5,
                      tiltLocked: true,
                      sunPoint: true,
                      terminator: true,
                      /* 月球的公转轨道线（绕地球的白道圈） */
                      moonOrbit: true,
                      /* true = 24 个节气名称与刻度全部标在公转轨道上 */
                      orbitMarks: true
                    }
                  },
                  /* 全景机位：注视太阳、俯视公转轨道全貌 */
                  camera: { focus: 'sun', polar: 40, azim: 0, dist: 72 }
                }
              ]
            }
          ] // sec-3-3 地球的转动
        },
        {
          id: 'sec-3-4',
          title: 'teach.d.s4.title',
          lessons: [
            {
              id: '3.10',
              title: 'teach.d.s4.l1.title',
              summary: 'teach.lesson.s4l1.summary',
              points: [
                'teach.lesson.s4l1.p0',
                'teach.lesson.s4l1.p1',
                'teach.lesson.s4l1.p2',
                'teach.lesson.s4l1.p3'
              ],
              steps: [
                {
                  id: '3.10.1',
                  title: 'teach.d.s4.l1.step1.title',
                  text: 'teach.d.s4.l1.step1.text',
                  ask: 'teach.d.s4.l1.step1.ask',
                  src: 'moon_motion',
                  state: {
                    /* 专用装置「简易地月模型」：地球静止居中、只自转不公转，
                        月球公转且自转周期与公转周期相同（同步自转）；
                        画面里只有地月关系，与三球仪（四季 / 节气）完全不同 */
                    rig: 'moonsync', scale: 'iconic',
                    /* 月球的自转角由公转相位推出，两者同周期 */
                    anim: { spin: true, revolve: true, speed: 1 },
                    params: {
                      /* 画面从简：只保留轨道环，不画标记 / 文字 / 转轴 */
                      orbit: true
                    }
                  },
                  /* 3/4 视角：轨道全环、地月位置关系与月面 A 点同时可见 */
                  camera: { polar: 26, azim: 30, dist: 24 }
                }
              ]
            },
            {
              id: '3.11',
              title: 'teach.d.s4.l2.title',
              summary: 'teach.lesson.s4l2.summary',
              points: [
                'teach.lesson.s4l2.p0',
                'teach.lesson.s4l2.p1',
                'teach.lesson.s4l2.p2',
                'teach.lesson.s4l2.p3'
              ],
              steps: [
                {
                  id: '3.11.1',
                  title: 'teach.d.s4.l2.step1.title',
                  text: 'teach.d.s4.l2.step1.text',
                  ask: 'teach.d.s4.l2.step1.ask',
                  src: 'solar_eclipse',
                  state: {
                    /* 「地面观察日食」场景（teach-globe 场景模式，与「观察月食」
                       同一套机制）：暗色月盘从亮日盘前掠过，视线穿过月盘看日盘 */
                    rig: 'globe', scale: 'iconic',
                    /* 0.35 慢放：与月食（3.12）同一节奏，两个场景并排讲时一致 */
                    anim: { spin: false, revolve: true, speed: 0.35 },
                    params: { shapeScene: 'solareclipse', grid: false, axis: false, moonPhaseDay: 0, moonOrbit: false, moonTiltDeg: 5.145, sunRays: false, voyage: false, satellites: false }
                  },
                  /* 相机在遮挡月盘的地心侧，视线沿地心→月盘→日盘 */
                  camera: { polar: 0, azim: 90, dist: 3.6 }
                }
              ]
            },
            {
              id: '3.12',
              title: 'teach.d.s4.l3.title',
              summary: 'teach.lesson.s4l3.summary',
              points: [
                'teach.lesson.s4l3.p0',
                'teach.lesson.s4l3.p1',
                'teach.lesson.s4l3.p2',
                'teach.lesson.s4l3.p3'
              ],
              steps: [
                {
                  id: '3.12.1',
                  title: 'teach.d.s4.l3.step1.title',
                  text: 'teach.d.s4.l3.step1.text',
                  ask: 'teach.d.s4.l3.step1.ask',
                  src: 'lunar_eclipse',
                  state: {
                    /* 复用「观察月食」的地影掠过月面场景（3.1.2 同款） */
                    rig: 'globe', scale: 'iconic',
                    anim: { spin: false, revolve: true, speed: 0.35 },
                    params: { shapeScene: 'eclipse', grid: false, axis: false, moonPhaseDay: 14.77, moonOrbit: false, moonTiltDeg: 5.145, sunRays: false, voyage: false, satellites: false }
                  },
                  camera: { polar: 0, azim: 90, dist: 3.6 }
                }
              ]
            }
          ] // sec-3-4 日地月的相对运动
        }
      ]
    }
  ]
};
