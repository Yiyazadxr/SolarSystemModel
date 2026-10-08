/**
 * 教学模式 · 教学内容数据（纯数据模块，供 teach.js 主控读取）
 *
 * 当前范围：科学教材 第3章 第1节《认识地球》。
 * 按用户要求，其余章节与课节已暂时移除，后续按教材逐节补回。
 *
 * 使用说明：
 *   1. 章节 chapters -> 课 lessons -> 步骤 steps，步骤顺序即课堂讲解顺序。
 *   2. 每个步骤的 state 传给 SOLAR.TeachScenes.applyState(state)，字段名与 teach-scenes.js 严格一致。
 *   3. src 字段引用 meta.sources 中的 key，界面据此显示数值来源。
 *   4. 数值口径：正文采用教材常用近似值，src 保存权威值与教材依据。
 *   3. 个别步骤需要定点机位时，可在该 step 加 cameraOverride：
 *      { polar: 度, azim: 度, dist: 地球半径倍数 }，只覆盖对应步骤相机，不改状态。
 *
 * state 字段含义：
 *   rig          当前演示装置：'globe' 地球仪 / 'moon' 月相三球 / 'orrery' 地球公转 / null 不切换
 *   scale        尺度：'real' 尽量真实比例 / 'iconic' 示意比例
 *   anim         动画：spin 自转、revolve 公转（月相中为月球绕地）、speed 倍速
 *   params.grid            是否显示经纬网
 *   params.gridStep        经纬网间隔（度）
 *   params.highlight       高亮特殊线：equator/tropic_n/tropic_s/polar_n/polar_s/meridian0/meridian180/ew_boundary
 *   params.axis            是否显示地轴
 *   params.tiltDeg         地轴与黄道面夹角（度），教材口径 66.5
 *   params.tiltLocked      地轴倾斜方向是否保持不变
 *   params.spinDeg         地球自转角（度）
 *   params.sunLonDeg       太阳直射点所在经度（度）
 *   params.terminator      是否显示晨昏线
 *   params.sunPoint        是否标出太阳直射点
 *   params.cities          标注点：beijing/shanghai/hangzhou/tianjin/hongkong/sydney/paris/london/newyork/alexandria/syene
 *   params.cityLabels      是否显示城市名称
 *   params.polarDayNight   是否显示极昼极夜区域
 *   params.moonPhaseDay    月相日（0~29.53），0 为朔
 *   params.moonOrbit       是否显示月球轨道（白道）
 *   params.moonTiltDeg     白道相对黄道倾角（度）
 *   params.dayOfYear       演示日期在一年中的序号（1~365）
 *   params.term            节气定位
 *   params.orbitMarks      公转轨道上是否标出二分二至等位置
 *   params.sunRays         是否画出太阳光线
 *   params.eratosthenes    是否显示埃拉托色尼测量示意（平行太阳光 + 地心延长线 + 7.2° 弧）
 *   params.voyage          是否显示环球航行航线示意
 *   params.satellites      是否显示人造地球卫星
 *   params.sizeRings       是否显示赤道周长 / 赤道半径 / 表面积标注
 *   params.degreeLabels    是否显示经纬度度数标注
 *   params.shapeScene      地球形状专题镜头：horizon / eclipse
 *   params.satelliteMode   人造卫星专题样式：dongfang1
 */
window.SOLAR = window.SOLAR || {};

SOLAR.TEACH_DATA = {
  /* ============================ 元信息 ============================ */
  meta: {
    version: '2.0',
    updated: '2026-10-06',
    note: '教学文字依据浙江教育出版社《科学》七年级上册（根据2022年版课程标准修订）第3章第1节相关页码整理；教材以外的延伸数据不作为本节结论。',
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
      { key: 'bds', text: '本次教材核对范围为第93–104页，未涉及北斗卫星导航系统；该内容不作为本节教学文字的来源。' }
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
                params: { shapeScene: 'horizon', grid: false, axis: false, terminator: false, voyage: false, satellites: false }
              },
              /* 相机贴海面（等效眼高 0.35R）、朝船行方向（-z）：azim=90 使船
                 驶向画面深处，而不是从左到右横移。 */
              camera: { target: 'globe', dist: 3.86, polar: 21, azim: 90 },
              cameraOverride: { polar: 21, azim: 90, dist: 3.86 }
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
                params: { shapeScene: 'eclipse', grid: false, axis: false, moonPhaseDay: 14.77, moonOrbit: false, moonTiltDeg: 5.145, sunRays: false, voyage: false, satellites: false }
              },
              camera: { target: 'moon', dist: 3.6, polar: 0, azim: 90 },
              cameraOverride: { polar: 0, azim: 90, dist: 3.6 }
            },
            {
              id: '3.1.3',
              title: '麦哲伦环球航线',
              text: '1519年，麦哲伦率领船队出发，经过1082天的海上航行，船队中仅一艘船和18名水手返回出发地，完成了人类历史上第一次环绕地球航行一周。船队亲身完成环球航行，以实践证实地球是球体。画面上的航线是依据地理位置绘制的历史路线示意。',
              src: 'magellan',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: false, revolve: false, speed: 1.2 },
                params: { grid: false, axis: false, terminator: false, voyage: true, satellites: false }
              },
              camera: { target: 'globe', dist: 2.8, polar: 20, azim: 35 },
              cameraOverride: { polar: 20, azim: 35, dist: 3.2 }
            },
            {
              id: '3.1.4',
              title: '从太空直接看见地球',
              text: '20世纪，人类发射人造地球卫星和载人航天器，从太空拍摄地球照片，确证地球是一个球体；照片上可见蓝色的海洋和白色的云。1961年，苏联宇航员加加林成为第一个在太空亲眼看到地球球体的人。人类认识地球形状的过程，也随着观测和航天技术的发展不断推进。',
              src: 'space_earth',
              state: {
                rig: 'globe', scale: 'iconic',
                anim: { spin: true, revolve: false, speed: 0.7 },
                params: { grid: false, axis: false, terminator: true, sunLonDeg: 80, satellites: false, voyage: false }
              },
              camera: { target: 'globe', dist: 3.0, polar: 24, azim: 75 },
              cameraOverride: { polar: 24, azim: 75, dist: 3.7 }
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
                params: { grid: false, axis: false, terminator: false, satellites: false, voyage: false, sizeRings: true, tiltDeg: 90 }
              },
              camera: { target: 'globe', dist: 3.2, polar: 18, azim: 30 },
              cameraOverride: { polar: 18, azim: 30, dist: 3.6 }
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
                params: { grid: false, axis: false, terminator: false, satellites: false, voyage: false, eratosthenes: true, cities: ['alexandria', 'syene'], tiltDeg: 90 }
              },
              /* 相机对准东经 30°（埃及）：placeLatLon 约定东经偏向 -Z，
                 azim 取 -30 让亚历山大/塞尼与光柱正对镜头。 */
              camera: { target: 'globe', dist: 3.4, polar: 15, azim: -30 },
              cameraOverride: { polar: 15, azim: -30, dist: 3.9 }
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
                  grid: false, axis: true, terminator: false, satellites: false, voyage: false,
                  highlight: ['equator', 'tropic_n', 'tropic_s', 'lat30_n', 'lat30_s', 'lat60_n', 'lat60_s', 'polar_n', 'polar_s'],
                  degreeLabels: 'lat'
                }
              },
              camera: { target: 'globe', dist: 3.2, polar: 12, azim: 0 },
              cameraOverride: { polar: 12, azim: 0, dist: 3.7 }
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
                  grid: false, axis: true, terminator: false, satellites: false, voyage: false,
                  highlight: ['meridian0', 'meridian20', 'meridian40', 'meridian60', 'meridian80', 'meridian100',
                    'meridian120', 'meridian140', 'meridian160', 'meridian180',
                    'meridian-20', 'meridian-40', 'meridian-60', 'meridian-80',
                    'meridian-100', 'meridian-120', 'meridian-140', 'meridian-160'],
                  degreeLabels: 'lon'
                }
              },
              camera: { target: 'globe', dist: 3.2, polar: 12, azim: -15 },
              cameraOverride: { polar: 12, azim: -15, dist: 3.7 }
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
              camera: { target: 'globe', dist: 5.0, polar: 12, azim: 0 },
              cameraOverride: { dist: 5.0, polar: 12, azim: 0 }
            }
          ]
        }
        ] // sec-3-2 太阳系的组成与结构
        }
      ]
    }
  ]
};
