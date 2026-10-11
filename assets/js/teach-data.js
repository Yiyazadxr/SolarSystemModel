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
    note: '教学文字依据浙江教育出版社《科学》七年级上册（根据2022年版课程标准修订）相关页码整理，覆盖第3章第1节及后续新增课节；教材以外的延伸数据不作为教学结论。',
    sources: [
      { key: 'textbook_3_1', text: '同教材第93–94页：通过观察远去船只和月食地影，认识地球表面的弧度并推测地球是球体。' },
      { key: 'earth_size', text: '同教材第95页：地球两极稍扁、赤道略鼓；赤道半径约6378 km，两极方向半径约6357 km，赤道周长约4×10⁴ km。' },
      { key: 'earth_surface', text: '同教材第95页仅列出赤道周长约4×10⁴ km；本节不引用教材未列出的地球表面积数值。' },
      { key: 'eratosthenes', text: '同教材第95–96页“科学阅读”：塞尼城与亚历山大相距约800 km，正午太阳光夹角差为7.2°（圆周的1/50），据此估算地球周长约4×10⁴ km。' },
      { key: 'magellan', text: '同教材第93–94页：1519年麦哲伦船队出发，历时1082天完成首次环球航行；教材以此作为实践证据。' },
      { key: 'space_earth', text: '同教材第94页：20世纪人造地球卫星与载人航天器拍摄的照片确证地球是球体；1961年加加林成为首位在太空亲眼看到地球球体的人。' },
      { key: 'globe_model', text: '同教材第97–99页：地球仪是按比例缩小的地球模型；地轴是表示地球自转轴的假想轴，地轴与地球表面的交点为南、北极。' },
      { key: 'latlon_grid', text: '同教材第97–98页：赤道为0°纬线；纬线指示东西方向，纬度由赤道向南北两极增至90°；经线连接两极并指示南北方向。' },
      { key: 'solar_system', text: '同教材第104页：太阳、行星及其卫星，以及矮行星、小行星、彗星等小天体共同组成太阳系；太阳约占太阳系总质量的99.86%。' },
      { key: 'prime_meridian', text: '同教材第97–98页：通过英国伦敦格林尼治天文台的经线为0°经线，即本初子午线；向东、西各计至180°。' },
      { key: 'map_basic', text: '同教材第99–100页：地图是地球表面的平面模型；比例尺、方向和图例是地图的“语言”，比例尺有线段式、文字式和数字式。' },
      { key: 'bds', text: '本次教材核对范围为第93–104页，未涉及北斗卫星导航系统；该内容不作为本节教学文字的来源。' },
      { key: 'earth_rotation', text: '同教材图4.2-1：地球自转方向自西向东，周期约23小时56分4秒；昼夜交替约24小时；偏东先见日出产生地方时；北京在东八区，与格林尼治相差8小时。' },
      { key: 'earth_revolution', text: '同教材图4.2-6：公转方向自西向东，周期约365天；地轴与公转轨道面夹角66.5°，北端始终指向北极星；夏至直射北回归线（23.5°N）、冬至直射南回归线、春分秋分直射赤道。' },
      { key: 'solar_height', text: '同教材图4.2-14、图4.2-15：北纬30°地区正午太阳高度夏至日约83.5°、冬至日约36.5°；正午杆影夏季短、冬季长，同一天纬度不同影长不同。' },
      { key: 'day_night_length', text: '同教材图4.2-17：夏至日北半球昼长夜短，北极圈及以北极昼；冬至日昼短夜长，北极圈及以北极夜；春分秋分全球昼夜等长，赤道全年昼夜等长。' },
      { key: 'solar_terms', text: '同教材图4.2-18：二十四节气按地球在黄道上的位置划分，从春分点（黄经0°）每前进15°为一个节气，一年共24个节气。' },
      { key: 'moon_motion', text: '同教材图4.3-8：月球自转与公转周期相同，总以同一面朝向地球，地球上只能看到月球正面。' },
      { key: 'solar_eclipse', text: '同教材图4.3-10、图4.3-14：月球运行到地球与太阳之间、三者接近成一直线时挡住太阳光，形成日食；分日偏食、日环食、日全食三类。' },
      { key: 'lunar_eclipse', text: '同教材图4.3-17：月球进入地球本影而变暗，分月全食（全部进入本影）和月偏食（部分进入本影）；月食时月面呈古铜色。' }
    ]
  },

  /* ============================ 章节 ============================ */
  chapters: [
    {
      id: 'ch3',
      title: '广袤浩瀚的宇宙',
      /* 三层结构：section（教材的"节"）→ lesson（小节）→ step（界面）。
         教材：第 1 节 认识地球（含形状/大小/地球仪三个小节）、第 2 节 太阳系的组成与结构。 */
      sections: [
        {
          id: 'sec-3-1',
          title: '认识地球',
          lessons: [
        {
          id: '3.1',
          title: '地球的形状',
          summary: '从地面观察、天象推论、环球航行实践和太空观测四条证据，认识人类如何逐步确认地球是球体。',
          points: [
            '远去的船只：船身先被地平线遮住，桅杆后消失',
            '月食：地球投在月球上的影子边缘呈弧形',
            '麦哲伦船队：完成首次环绕地球航行一周',
            '太空观测：卫星和载人航天器拍摄地球，加加林亲眼观察地球'
          ],
          steps: [
            {
              id: '3.1.1',
              title: '观察远去的船只',
              text: '教材提出观察远去船只的问题：船驶向远处时，船身先从视野中消失，桅杆后消失。地球表面的弧度使较低的船身先被地平线遮挡。这是观察地面景象得到的推论；判断地球形状还要结合月食、环球航行和太空观测等证据。',
              ask: '船身和桅杆谁先消失？地平线怎样遮挡逐渐远去的船只？',
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
              title: '观察月食',
              text: '月食时，地球挡在太阳和月球之间，地球的影子落在月球上。教材指出，人们多次观察月食，发现地影总呈弧形，并据此推测地球是球体。动画展示地影掠过月面的过程，画面中的尺度和运动速度为便于观察的示意。',
              ask: '月食时，地球的影子落在哪里？人们从地影的什么特征推测地球形状？',
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
              title: '麦哲伦环球航线',
              text: '1519年，麦哲伦率领船队出发，经过1082天的海上航行，船队中仅一艘船和18名水手返回出发地，完成了人类历史上第一次环绕地球航行一周。船队亲身完成环球航行，以实践证实地球是球体。画面上的航线是依据地理位置绘制的历史路线示意。',
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
              title: '从太空直接看见地球',
              text: '20世纪，人类发射人造地球卫星和载人航天器，从太空拍摄地球照片，确证地球是一个球体；照片上可见蓝色的海洋和白色的云。1961年，苏联宇航员加加林成为第一个在太空亲眼看到地球球体的人。人类认识地球形状的过程，也随着观测和航天技术的发展不断推进。',
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
          title: '地球的大小',
          summary: '认识地球的形状和大小数据，并通过埃拉托色尼利用两地太阳光夹角与距离估算地球周长的故事，理解测量思路。',
          points: [
            '地球是两极稍扁、赤道略鼓的球体',
            '赤道半径约6378 km，两极方向半径约6357 km，赤道周长约4×10⁴ km',
            '埃拉托色尼用7.2°（圆周的1/50）和约800 km估算地球周长'
          ],
          steps: [
            {
              id: '3.2.1',
              title: '地球的尺寸',
              text: '现代测量表明，地球是一个两极稍扁、赤道略鼓的球体。教材给出的近似值是：赤道半径约6378 km，两极方向的半径约6357 km，赤道周长约4×10⁴ km。赤道半径与两极方向半径的差异相对地球整体很小。',
              ask: '从赤道半径和两极方向半径的数据看，地球的形状有什么特点？',
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
              title: '埃拉托色尼测地球周长',
              text: '公元前3世纪，埃拉托色尼利用夏至正午的光影测量地球周长。他根据塞尼城（今阿斯旺）阳光直射井底，以及同一时刻亚历山大垂直杆的影子，求得两地太阳光与地面夹角的差约为7.2°，即圆周的1/50。教材给出的两城距离约800 km，因此估算地球周长约为800 km×50，结果约4×10⁴ km。',
              ask: '两地相距约800 km，夹角差为7.2°（圆周的1/50），怎样估算地球一周的长度？',
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
          title: '地球仪',
          summary: '在地球仪上认识地轴、两极、赤道、纬线和经线，并用经纬度描述地球表面地点的位置。',
          points: [
            '赤道是0°纬线；北极和南极的纬度分别为90°N和90°S',
            '纬线指示东西方向，纬度由赤道向两极增至90°',
            '经线连接南北两极并指示南北方向；经纬网可确定地点'
          ],
          steps: [
            {
              id: '3.3.1',
              title: '主要纬线与南北两极',
              text: '地球仪上，与南、北两极距离相等的大圆叫赤道，它把地球分为南、北半球。所有与赤道平行的圈线叫纬线，指示东西方向。赤道纬度为0°，南、北两极纬度分别为90°；赤道以北为北纬（N），以南为南纬（S），纬度由赤道向两极增大。',
              ask: '赤道把地球分成哪两个半球？怎样区分北纬和南纬？',
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
              title: '主要经线与本初子午线',
              text: '连接南、北两极的半圆弧线叫经线，也叫子午线。经线与纬线垂直，指示南北方向。通过英国伦敦格林尼治天文台的经线为0°经线，即本初子午线；向东从0°计至180°为东经（E），向西从0°计至180°为西经（W）。经纬线相互交织形成经纬网，地球表面地点可以用经纬度表示。',
              ask: '本初子午线是几度经线？怎样区分东经和西经？',
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
          title: '太阳系的组成与结构',
          lessons: [
        {
          id: '3.4',
          title: '太阳系的组成',
              summary: '认识太阳系由太阳、行星及其卫星和多种小天体共同组成。',
          points: [
              '太阳是太阳系中体积和质量最大的天体，约占太阳系总质量的99.86%',
              '太阳、行星及其卫星共同组成太阳系的重要部分',
              '矮行星、小行星、彗星等小天体也属于太阳系成员'
          ],
          steps: [
            {
              id: '3.4.1',
              title: '太阳系',
              text: '地球与水星、金星、火星、木星等行星一起围绕太阳转动。太阳、行星及其卫星，以及矮行星、小行星、彗星等小天体共同组成太阳系。教材指出，太阳约占太阳系总质量的99.86%，是太阳系中体积和质量最大的天体。',
              ask: '除太阳和行星外，教材还列举了哪些太阳系成员？太阳约占太阳系总质量的百分之多少？',
              /* soloTip：隐藏常规信息面板，屏幕中间只显示引导小面板；
                 教学装置只有地球仪与日地月示意，完整太阳系在演示模式里。 */
              soloTip: true,
              gotoDemo: '完整太阳系的组成和结构，推荐前往演示模式自由探索。',
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
          title: '地球的转动',
          lessons: [
            {
              id: '3.5',
              title: '地球绕地轴自转',
              summary: '认识地球自转的方向与周期，理解昼夜交替、地方时与时区的成因。',
              points: [
                '自转方向：自西向东，从北极上空俯视呈逆时针',
                '自转周期：约23小时56分4秒；昼夜交替约24小时，即一天',
                '昼半球与夜半球：太阳光照到的区域为昼半球，照不到的为夜半球',
                '地方时：偏东的地方先看到日出，时间早；北京时间采用东八区区时'
              ],
              steps: [
                {
                  id: '3.5.1',
                  title: '自转的方向与周期',
                  text: '古代的人们看到太阳周而复始地东升西落，认为太阳在绕地球旋转。其实，太阳东升西落是地球载着我们不停地自西向东绕地轴旋转的缘故。地球始终不停地绕着贯穿南、北两极的地轴旋转，这种运动称为自转。地轴是地球自转的假想轴，它的北端指向北极星附近；从北极上空俯视，地球呈逆时针方向转动。地球自转一周所需时间约为23小时56分4秒。',
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
                  title: '昼夜交替',
                  text: '从北极上空俯视地球，太阳光始终照亮半个地球表面：同一时间里，太阳光照射到的地球区域是昼半球，太阳光照射不到的另一半区域是夜半球，这就使地球上的不同区域有了昼夜之分。因为地球沿自西向东的方向不停地转动，白昼与黑夜也就交替出现了，这就是昼夜交替现象；地球每自转一周，白天和黑夜就更替一次，时间约为24小时，即一天。',
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
                  title: '地方时与北京时间',
                  text: '由于地球的自转，偏东的地方先看到日出，偏西的地方后看到日出，不同经度的地方产生了不同的地方时——偏东的地方时间早，偏西的地方时间晚。北京处于世界时区分布图中的东八区，同英国格林尼治（位于本初子午线上）标准时间整整相差8小时；我国采用北京所在的东八区的区时作为标准时间，称为「北京时间」。',
                  ask: '为什么偏东的地方总先看到日出？北京所在的东八区与格林尼治标准时间相差多少？',
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
              title: '地球绕太阳公转',
              summary: '认识地球公转的方向、周期与地轴倾斜，理解太阳直射点移动与四季变化的成因。',
              points: [
                '公转方向：自西向东，沿近似圆形轨道，周期约365天（一年）',
                '地轴倾斜66.5°，北端始终指向北极星附近',
                '夏至直射北回归线（23.5°N），冬至直射南回归线，春分/秋分直射赤道',
                '太阳直射点在南、北回归线之间来回移动——四季变化的主要原因',
                '斜射时同束阳光照到更大面积，单位面积接受辐射比直射少；纬度越高辐射越少'
              ],
              steps: [
                {
                  id: '3.6.1',
                  title: '地球的公转与四季',
                  text: '地球沿近似圆形的轨道不停地绕着太阳转动，这种运动称为公转；地球公转一周所需时间约为365天，即通常所说的一年。地球公转方向是自西向东，且地轴呈倾斜状态，地轴的北端始终指向北极星附近，地轴与地球公转轨道面之间的夹角为66.5°。地球运行到公转轨道不同位置，太阳直射的纬度不同，这是四季变化的成因：夏至日（6月22日前后）太阳直射北回归线（23.5°N），北半球是夏季；冬至日（12月22日前后）直射南回归线，北半球是冬季；春分日（3月21日前后）、秋分日（9月23日前后）直射赤道，北半球是春季和秋季。一年中，太阳直射点在南、北回归线之间来回移动，大部分地区因此有太阳照射角度与照射时间长短的差异。',
                  ask: '夏至日和冬至日太阳分别直射哪条纬线？一年中太阳直射点在什么范围内移动？',
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
              title: '正午太阳高度变化',
              summary: '认识太阳高度角，理解一天中杆影的变化与正午太阳高度随季节、纬度的变化规律。',
              points: [
                '一天中杆影：日出较长，正午最短，偏西后又变长',
                '太阳高度角：太阳光线与地面的夹角',
                '正午太阳高度：夏至日最大，冬至日最小；北纬30°夏至约83.5°、冬至约36.5°',
                '正午杆影：夏季短，冬季长；同一天纬度不同影长不同'
              ],
              steps: [
                {
                  id: '3.7.1',
                  title: '太阳高度与杆影',
                  text: '站在平地上看太阳（图4.2-14）：一天中，太阳从东方升起、正午最高、向西方落下，杆影随之由长变短再变长，正午时最短（图4.2-13）。太阳光线与地面的夹角叫作太阳高度角。一年中，正午太阳高度随季节变化：夏至最大、冬至最小，如北纬30°夏至日约83.5°、冬至日约36.5°；同一天纬度不同，正午杆影长短也不同——太阳高度越大，杆影越短（图4.2-15）。北回归线上，春分、秋分太阳由正东升起、正西落下；夏至由东偏北升起、西偏北落下；冬至由东偏南升起、西偏南落下。',
                  ask: '北回归线上，夏至和冬至时太阳的升落方向与春分、秋分有什么不同？北纬30°地区正午太阳高度夏至日和冬至日分别约为多少？',
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
              title: '昼夜长短变化',
              summary: '理解昼夜长短随季节与纬度的变化规律，认识极昼、极夜与昼夜等长的条件。',
              points: [
                '除赤道外，各地夏季昼长夜短，冬季昼短夜长',
                '夏至日北半球昼长达一年最大值，北极圈及以北极昼',
                '冬至日北半球昼长达一年最小值，北极圈及以北极夜',
                '春分、秋分太阳直射赤道，全球昼夜等长；赤道全年昼夜等长'
              ],
              steps: [
                {
                  id: '3.8.1',
                  title: '极昼极夜与昼夜等长',
                  text: '自春分日至秋分日，太阳直射北半球，北半球各地昼长于夜，夏至日昼长达一年中的最大值，北极圈（66.5°N）及其以北出现极昼；自秋分日至次年春分日，太阳直射南半球，北半球昼短夜长，冬至日昼长达一年中的最小值，北极圈及其以北出现极夜。南半球相反。春分日和秋分日太阳直射赤道，全球各地昼夜等长；赤道上全年昼夜等长。',
                  ask: '北极圈及其以北地区什么时候出现极昼、什么时候出现极夜？什么时候全球各地昼夜等长？哪些地方全年昼夜等长？',
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
              title: '二十四节气与地球运动',
              summary: '了解二十四节气的历史与划分依据，理解节气与地球公转位置的对应关系。',
              points: [
                '2016年「二十四节气」列入人类非物质文化遗产代表作名录',
                '古代用圭表、日晷测日影定冬至、夏至、春分、秋分；秦汉年间完全确立',
                '按地球在黄道上的位置划分：从春分点（黄经0°）每前进15°为一个节气',
                '一回归年合360°，一年共24个节气；日期在阳历中相对固定'
              ],
              steps: [
                {
                  id: '3.9.1',
                  title: '二十四节气',
                  text: '我国古代用圭表、日晷实测日影长度，将正午日影最长的一天定为冬至，最短的一天定为夏至，昼夜等长的两天定为春分和秋分。商朝四节气、周朝八个，秦汉年间完全确立。二十四节气按地球在黄道（公转轨道）上的位置划分：从春分点（黄经0°，太阳直射赤道）每前进15°为一个节气，一回归年合360°，一年共24个节气，日期在阳历中相对固定。',
                  ask: '二十四节气是按什么划分的？一个节气对应黄道上多少度？一年为什么正好有24个节气？',
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
          title: '日地月的相对运动',
          lessons: [
            {
              id: '3.10',
              title: '月球的运动',
              summary: '认识月球的自转与公转，理解月球总以同一面朝向地球的原因。',
              points: [
                '月球自身不发光，反射太阳光；被照亮的一面亮，另一面暗',
                '月球绕自身的轴自转，同时绕地球公转',
                '自转与公转周期相同，月球总以同一面朝向地球',
                '地球上只能看到月球正面；月球探测器已拍到正面和背面'
              ],
              steps: [
                {
                  id: '3.10.1',
                  title: '月球的自转与公转',
                  text: '月球自己不会发光，只能反射太阳光，被照亮的一面亮，另一面暗。正如地球自转的同时绕太阳公转，月球也绕自身的轴自转，并绕地球公转。月球的自转和公转周期相同，因此总以同一面朝向地球：如图4.3-8，地球上的人始终只能看到 A 点所在的那半个月球，即月球正面；如果月球不发生自转，就能在同一个月内看到月球的正面和背面。',
                  ask: '为什么月球总以同一面朝向地球？如果月球不自转，我们在地球上能看到月球的哪些面？',
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
              title: '日食',
              summary: '认识日食的类型与成因，理解月球影子投在地球上产生日食的过程。',
              points: [
                '日食：太阳表面全部或部分被月球遮掩的现象',
                '三种类型：日偏食、日环食、日全食',
                '成因：月球运行到地球和太阳之间，三者接近排成一条直线',
                '月球挡住太阳光形成影子，月影所在区看到日食'
              ],
              steps: [
                {
                  id: '3.11.1',
                  title: '日食',
                  text: '太阳表面全部或部分被月球遮掩的现象称为日食：月球遮住太阳的一部分时出现日偏食；只遮住中心部分、太阳周围露出一圈日面时出现日环食；太阳完全被遮住时出现日全食。月球运行到日地之间、三者接近成一直线时，由于光沿直线传播，月球挡住太阳光形成影子；月影分为本影、半影和伪本影，对应区域分别看到日全食、日偏食和日环食（图4.3-14）。',
                  ask: '日食发生时，月球、地球、太阳三者处于什么位置关系？月影的哪个部分对应日全食？',
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
              title: '月食',
              summary: '认识月食的现象与类型，理解月球进入地球影子产生月食的过程。',
              points: [
                '月食：月面部分或全部变暗的现象，可持续一个多小时',
                '地球大气对太阳光的折射使月食时月面呈暗弱的古铜色',
                '两种类型：月全食（全部进入地球本影）、月偏食（部分进入本影）',
                '成因：月球进入地球背对太阳方向的影子'
              ],
              steps: [
                {
                  id: '3.12.1',
                  title: '月食',
                  text: '月面部分或全部变暗的现象称为月食，时间可长达一个多小时；由于地球大气对太阳光的折射，发生月食部分的月球并非全黑，而是呈暗弱的古铜色（图4.3-15）。地球在背对太阳的方向会产生影子，影子分为本影和半影；月球进入地影的不同位置，月球全部进入地球本影中而变暗的叫月全食，有一部分进入本影区的叫月偏食（图4.3-17）。',
                  ask: '月食有哪两种类型？月全食和月偏食分别是月球进入地球影子的哪个部分？',
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
