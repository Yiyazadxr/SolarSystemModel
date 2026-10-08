/**
 * 天体真实数据
 * 轨道根数：J2000 平均根数 + 每儒略世纪变化率（JPL Standish 近似表）
 *   a 半长轴(AU)  e 偏心率  i 轨道倾角(°)  L 平黄经(°)  peri 近日点黄经(°)  node 升交点黄经(°)
 * 物理参数：半径(km)、质量(kg)、表面重力(m/s²)、密度(g/cm³)、逃逸速度(km/s)、平均温度(℃)
 * 自转：rotationH 为恒星自转周期(小时)，负值表示逆向自转；solarDayH 为太阳日长度（正值）
 * 反照率：bondAlbedo 为 Bond 反照率；视星等范围以地球观测者为基准
 */
window.SOLAR = window.SOLAR || {};

SOLAR.DATA = {
  /* ============================ 太阳 ============================ */
  sun: {
    id: 'sun',
    type: 'star',
    texture: 'assets/textures/sun.jpg',
    color: 0xffd27f,
    radiusKm: 695700,
    massKg: 1.98847e30,
    gravity: 274,
    density: 1.408,
    escapeVel: 617.7,
    tempC: 5500,
    rotationH: 609.12,        // Carrington 恒星自转周期约 25.38 天
    solarDayH: null,          // 太阳不是绕太阳公转的固体表面，无此定义
    axialTilt: 7.25,
    moons: 8,                 // 行星计数，界面中单独处理
    atmosphereKey: 'atm_sun'
  },

  /* ============================ 行星 / 矮行星 ============================ */
  bodies: [
    {
      id: 'mercury', type: 'planet', texture: 'assets/textures/mercury.jpg', color: 0x9c8f84,
      radiusKm: 2439.7, massKg: 3.30103e23, gravity: 3.70, density: 5.429, escapeVel: 4.25,
      tempC: 167, rotationH: 1407.6, solarDayH: 4222.6, axialTilt: 0.034, moonsCount: 0,
      atmosphereKey: 'atm_mercury', surfacePressureBar: 5e-15, bondAlbedo: 0.088,
      meanOrbitVelocityKms: 47.36, synodicPeriodDays: 115.877,
      perihelionAu: 0.30749775, aphelionAu: 0.46670079,
      apparentMagnitude: { brightest: -2.48, faintest: 7.25 },
      discoverer: null, discoveryYear: null, discoveryEra: 'prehistoric',
      orbital: { a: 0.38709927, aRate: 0.00000037, e: 0.20563593, eRate: 0.00001906,
                 i: 7.00497902, iRate: -0.00594749, L: 252.25032350, LRate: 149472.67411175,
                 peri: 77.45779628, periRate: 0.16047689, node: 48.33076593, nodeRate: -0.12534081 },
      periodDays: 87.969
    },
    {
      id: 'venus', type: 'planet', texture: 'assets/textures/venus.jpg', color: 0xd9b98a,
      radiusKm: 6051.8, massKg: 4.86731e24, gravity: 8.87, density: 5.243, escapeVel: 10.36,
      tempC: 464, rotationH: -5832.5, solarDayH: 2802.0, axialTilt: 177.36, moonsCount: 0,
      atmosphereKey: 'atm_venus', surfacePressureBar: 92, bondAlbedo: 0.770,
      meanOrbitVelocityKms: 35.02, synodicPeriodDays: 583.924,
      perihelionAu: 0.71843382, aphelionAu: 0.72823750,
      apparentMagnitude: { brightest: -4.92, faintest: -2.98 },
      discoverer: null, discoveryYear: null, discoveryEra: 'prehistoric',
      orbital: { a: 0.72333566, aRate: 0.00000390, e: 0.00677672, eRate: -0.00004107,
                 i: 3.39467605, iRate: -0.00078890, L: 181.97909950, LRate: 58517.81538729,
                 peri: 131.60246718, periRate: 0.00268329, node: 76.67984255, nodeRate: -0.27769418 },
      periodDays: 224.701
    },
    {
      id: 'earth', type: 'planet', texture: 'assets/textures/earth.jpg', color: 0x3a6ea5,
      textureNight: 'assets/textures/earth_night.png',
      textureClouds: 'assets/textures/earth_clouds.png',
      textureSpecular: 'assets/textures/earth_specular.jpg',
      radiusKm: 6371.0084, massKg: 5.97217e24, gravity: 9.80665, density: 5.5134, escapeVel: 11.186,
      tempC: 15, rotationH: 23.93447, solarDayH: 24.0, axialTilt: 23.4393, moonsCount: 1,
      atmosphereKey: 'atm_earth', hasCityLights: true, hasClouds: true,
      surfacePressureBar: 1.01325, bondAlbedo: 0.306,
      meanOrbitVelocityKms: 29.78, synodicPeriodDays: null,
      perihelionAu: 0.98329134, aphelionAu: 1.01671388,
      apparentMagnitude: null,
      discoverer: null, discoveryYear: null, discoveryEra: 'notApplicable',
      orbital: { a: 1.00000261, aRate: 0.00000562, e: 0.01671123, eRate: -0.00004392,
                 i: -0.00001531, iRate: -0.01294668, L: 100.46457166, LRate: 35999.37244981,
                 peri: 102.93768193, periRate: 0.32327364, node: 0.0, nodeRate: 0.0 },
      periodDays: 365.256
    },
    {
      id: 'mars', type: 'planet', texture: 'assets/textures/mars.jpg', color: 0xc1440e,
      radiusKm: 3389.5, massKg: 6.4171e23, gravity: 3.721, density: 3.934, escapeVel: 5.03,
      tempC: -65, rotationH: 24.62296, solarDayH: 24.6597, axialTilt: 25.19, moonsCount: 2,
      atmosphereKey: 'atm_mars', surfacePressureBar: 0.00636, bondAlbedo: 0.250,
      meanOrbitVelocityKms: 24.07, synodicPeriodDays: 779.934,
      perihelionAu: 1.38140478, aphelionAu: 1.66601590,
      apparentMagnitude: { brightest: -2.94, faintest: 1.86 },
      discoverer: null, discoveryYear: null, discoveryEra: 'prehistoric',
      orbital: { a: 1.52371034, aRate: 0.00001847, e: 0.09339410, eRate: 0.00007882,
                 i: 1.84969142, iRate: -0.00813131, L: -4.55343205, LRate: 19140.30268499,
                 peri: -23.94362959, periRate: 0.44441088, node: 49.55953891, nodeRate: -0.29257343 },
      periodDays: 686.980
    },
    {
      id: 'jupiter', type: 'planet', texture: 'assets/textures/jupiter.jpg', color: 0xd8b48c,
      radiusKm: 69911, massKg: 1.898125e27, gravity: 24.79, density: 1.3262, escapeVel: 59.5,
      tempC: -110, rotationH: 9.925, solarDayH: 9.9259, axialTilt: 3.13, moonsCount: 95,
      atmosphereKey: 'atm_jupiter', surfacePressureBar: null, pressureReferenceBar: 1, bondAlbedo: 0.343,
      meanOrbitVelocityKms: 13.06, synodicPeriodDays: 398.884,
      perihelionAu: 4.95113886, aphelionAu: 5.45463514,
      apparentMagnitude: { brightest: -2.94, faintest: -1.66 },
      discoverer: null, discoveryYear: null, discoveryEra: 'prehistoric',
      orbital: { a: 5.20288700, aRate: -0.00011607, e: 0.04838624, eRate: -0.00013253,
                 i: 1.30439695, iRate: -0.00183714, L: 34.39644051, LRate: 3034.74612775,
                 peri: 14.72847983, periRate: 0.21252668, node: 100.47390909, nodeRate: 0.20469106,
                 b: -0.00012452, c: 0.06064060, s: -0.35635438, f: 38.35125000,
                 additionalTermsFor: 'longTerm',
                 longTerm: { a: 5.20248019, aRate: -0.00002864, e: 0.04853590, eRate: 0.00018026,
                   i: 1.29861416, iRate: -0.00322699, L: 34.33479152, LRate: 3034.90371757,
                   peri: 14.27495244, periRate: 0.18199196, node: 100.29282654, nodeRate: 0.13024619,
                   validTMin: -50, validTMax: 10 } },
      periodDays: 4332.589
    },
    {
      id: 'saturn', type: 'planet', texture: 'assets/textures/saturn.jpg', color: 0xe3d9a6,
      radiusKm: 58232, massKg: 5.68317e26, gravity: 10.44, density: 0.687, escapeVel: 35.5,
      tempC: -140, rotationH: 10.656, solarDayH: 10.6562, axialTilt: 26.73, moonsCount: 146,
      atmosphereKey: 'atm_saturn', surfacePressureBar: null, pressureReferenceBar: 1, bondAlbedo: 0.342,
      meanOrbitVelocityKms: 9.68, synodicPeriodDays: 378.092,
      perihelionAu: 9.02301350, aphelionAu: 10.05033838,
      apparentMagnitude: { brightest: -0.55, faintest: 1.17 },
      discoverer: null, discoveryYear: null, discoveryEra: 'prehistoric',
      ring: { innerKm: 74500, outerKm: 140220, texture: 'assets/textures/saturn_ring.png' },
      orbital: { a: 9.53667594, aRate: -0.00125060, e: 0.05386179, eRate: -0.00050991,
                 i: 2.48599187, iRate: 0.00193609, L: 49.95424423, LRate: 1222.49362201,
                 peri: 92.59887831, periRate: -0.41897216, node: 113.66242448, nodeRate: -0.28867794,
                 b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125000,
                 additionalTermsFor: 'longTerm',
                 longTerm: { a: 9.54149883, aRate: -0.00003065, e: 0.05550825, eRate: -0.00032044,
                   i: 2.49424102, iRate: 0.00451969, L: 50.07571329, LRate: 1222.11494724,
                   peri: 92.86136063, periRate: 0.54179478, node: 113.63998702, nodeRate: -0.25015002,
                   validTMin: -50, validTMax: 10 } },
      periodDays: 10759.22
    },
    {
      id: 'uranus', type: 'planet', texture: 'assets/textures/uranus.jpg', color: 0x9fd8e0,
      radiusKm: 25362, massKg: 8.68099e25, gravity: 8.69, density: 1.270, escapeVel: 21.3,
      tempC: -195, rotationH: -17.24, solarDayH: 17.2399, axialTilt: 97.77, moonsCount: 28,
      atmosphereKey: 'atm_uranus', surfacePressureBar: null, pressureReferenceBar: 1, bondAlbedo: 0.300,
      meanOrbitVelocityKms: 6.80, synodicPeriodDays: 369.656,
      perihelionAu: 18.28233384, aphelionAu: 20.09599544,
      apparentMagnitude: { brightest: 5.38, faintest: 6.03 },
      discoverer: 'William Herschel', discoveryYear: 1781, discoveryEra: 'historical',
      ring: { innerKm: 41837, outerKm: 51149, texture: 'assets/textures/uranus_ring.png' },
      orbital: { a: 19.18916464, aRate: -0.00196176, e: 0.04725744, eRate: -0.00004397,
                 i: 0.77263783, iRate: -0.00242939, L: 313.23810451, LRate: 428.48202785,
                 peri: 170.95427630, periRate: 0.40805281, node: 74.01692503, nodeRate: 0.04240589,
                 b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025000,
                 additionalTermsFor: 'longTerm',
                 longTerm: { a: 19.18797948, aRate: -0.00020455, e: 0.04685740, eRate: -0.00001550,
                   i: 0.77298127, iRate: -0.00180155, L: 314.20276625, LRate: 428.49512595,
                   peri: 172.43404441, periRate: 0.09266985, node: 73.96250215, nodeRate: 0.05739699,
                   validTMin: -50, validTMax: 10 } },
      periodDays: 30685.4
    },
    {
      id: 'neptune', type: 'planet', texture: 'assets/textures/neptune.jpg', color: 0x3f66d8,
      radiusKm: 24622, massKg: 1.024092e26, gravity: 11.15, density: 1.638, escapeVel: 23.5,
      tempC: -200, rotationH: 16.11, solarDayH: 16.1102, axialTilt: 28.32, moonsCount: 16,
      atmosphereKey: 'atm_neptune', surfacePressureBar: null, pressureReferenceBar: 1, bondAlbedo: 0.290,
      meanOrbitVelocityKms: 5.43, synodicPeriodDays: 367.486,
      perihelionAu: 29.81160769, aphelionAu: 30.32823783,
      apparentMagnitude: { brightest: 7.67, faintest: 8.00 },
      discoverer: 'Urbain Le Verrier / Johann G. Galle', discoveryYear: 1846, discoveryEra: 'historical',
      orbital: { a: 30.06992276, aRate: 0.00026291, e: 0.00859048, eRate: 0.00005105,
                 i: 1.77004347, iRate: 0.00035372, L: -55.12002969, LRate: 218.45945325,
                 peri: 44.96476227, periRate: -0.32241464, node: 131.78422574, nodeRate: -0.00508664,
                 b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025000,
                 additionalTermsFor: 'longTerm',
                 longTerm: { a: 30.06952752, aRate: 0.00006447, e: 0.00895439, eRate: 0.00000818,
                   i: 1.77005520, iRate: 0.00022400, L: 304.22289287, LRate: 218.46515314,
                   peri: 46.68158724, periRate: 0.01009938, node: 131.78635853, nodeRate: -0.00606302,
                   validTMin: -50, validTMax: 10 } },
      periodDays: 60189
    },
    {
      id: 'pluto', type: 'dwarf', texture: 'assets/textures/pluto.jpg', color: 0xbfa78a,
      radiusKm: 1188.3, massKg: 1.303e22, gravity: 0.62, density: 1.854, escapeVel: 1.21,
      tempC: -225, rotationH: -153.2928, solarDayH: 153.2820, axialTilt: 119.59, moonsCount: 5,
      atmosphereKey: 'atm_pluto', surfacePressureBar: 1e-5, bondAlbedo: 0.720,
      meanOrbitVelocityKms: 4.67, synodicPeriodDays: 366.735,
      perihelionAu: 29.65788824, aphelionAu: 49.30634526,
      apparentMagnitude: { brightest: 13.65, faintest: 16.30 },
      discoverer: 'Clyde Tombaugh', discoveryYear: 1930, discoveryEra: 'historical',
      barycenter: { companionId: 'charon', meanSeparationKm: 19596,
        fromPrimaryCenterKm: 2126, outsidePrimary: true, mutuallyTidallyLocked: true },
      orbital: { a: 39.48211675, aRate: -0.00031596, e: 0.24882730, eRate: 0.00005170,
                 i: 17.14001206, iRate: 0.00004818, L: 238.92903833, LRate: 145.20780515,
                 peri: 224.06891629, periRate: -0.04062942, node: 110.30393684, nodeRate: -0.01183482,
                 b: -0.01262724, c: 0, s: 0, f: 0,
                 additionalTermsFor: 'longTerm',
                 longTerm: { a: 39.48686035, aRate: 0.00449751, e: 0.24885238, eRate: 0.00006016,
                   i: 17.14104260, iRate: 0.00000501, L: 238.96535011, LRate: 145.18042903,
                   peri: 224.09702598, periRate: -0.00968827, node: 110.30167986, nodeRate: -0.00809981,
                   validTMin: -50, validTMax: 10 } },
      periodDays: 90560
    }
  ],

  /* ============================ 卫星 ============================ */
  /* orbitInclinationDeg 的参考面由 inclinationReference 明示；orbitKm 均为中心到中心半长轴。
     朝向三根数 ascendingNodeDeg(Ω 升交点) / argPeriapsisDeg(ω 近心点幅角) /
     meanAnomalyDeg(M₀ 平近点角) 取自 JPL Planetary Satellite Mean Elements
     （ssd.jpl.nasa.gov/sats/elem/，2026-10 抓取），历元 2000-01-01.5 TDB = J2000，
     与 simDays=0 精确对齐。JPL 原表 Ω 自参考面基准线在 ICRF 赤道上的交点量起；
     月球（ecliptic 帧）与 Charon（Pluto equatorial 帧）可直接使用，
     Laplace 面卫星落到母星赤道系内是近似——JPL Tilt 列显示这些 Laplace 面
     与母星赤道仅差 0.0~0.9°，视觉可忽略。 */
  moons: [
    { id: 'phobos', parent: 'mars', radiusKm: 11.2667, massKg: 1.0659e16, orbitKm: 9376,
      periodDays: 0.31891, rotationH: 7.6538, tidallyLocked: true, eccentricity: 0.0151,
      orbitInclinationDeg: 1.093, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 169.2, argPeriapsisDeg: 216.3, meanAnomalyDeg: 189.7, color: 0x8c7d72,
      gravity: 0.0057, tempC: -40, summaryKey: 'moons.phobos.desc' },
    { id: 'deimos', parent: 'mars', radiusKm: 6.2, massKg: 1.4762e15, orbitKm: 23463.2,
      periodDays: 1.26244, rotationH: 30.2986, tidallyLocked: true, eccentricity: 0.00033,
      orbitInclinationDeg: 1.791, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 54.3, argPeriapsisDeg: 0.0, meanAnomalyDeg: 205.0, color: 0x8c7d72,
      gravity: 0.0030, tempC: -40, summaryKey: 'moons.deimos.desc' },
    { id: 'luna', parent: 'earth', radiusKm: 1737.4, massKg: 7.346e22, orbitKm: 384399,
      periodDays: 27.32166, rotationH: 655.7198, tidallyLocked: true, eccentricity: 0.0549,
      orbitInclinationDeg: 5.145, inclinationReference: 'ecliptic',
      ascendingNodeDeg: 125.08, argPeriapsisDeg: 318.15, meanAnomalyDeg: 135.27, color: 0xbfbfbf,
      gravity: 1.62, texture: 'assets/textures/moon.jpg', tempC: -20, summaryKey: 'moons.luna.desc' },
    { id: 'io', parent: 'jupiter', radiusKm: 1821.6, massKg: 8.93194e22, orbitKm: 421800,
      periodDays: 1.76914, rotationH: 42.4594, tidallyLocked: true, eccentricity: 0.0041,
      orbitInclinationDeg: 0.036, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 0.0, argPeriapsisDeg: 49.1, meanAnomalyDeg: 330.9, color: 0xd8c56a,
      gravity: 1.796, texture: 'assets/textures/io.jpg', tempC: -143, summaryKey: 'moons.io.desc' },
    { id: 'europa', parent: 'jupiter', radiusKm: 1560.8, massKg: 4.79984e22, orbitKm: 671100,
      periodDays: 3.55118, rotationH: 85.2283, tidallyLocked: true, eccentricity: 0.0094,
      orbitInclinationDeg: 0.466, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 184.0, argPeriapsisDeg: 45.0, meanAnomalyDeg: 345.4, color: 0xd9cfae,
      gravity: 1.314, texture: 'assets/textures/europa.jpg', tempC: -171, summaryKey: 'moons.europa.desc' },
    { id: 'ganymede', parent: 'jupiter', radiusKm: 2634.1, massKg: 1.4819e23, orbitKm: 1070400,
      periodDays: 7.15455, rotationH: 171.7092, tidallyLocked: true, eccentricity: 0.0013,
      orbitInclinationDeg: 0.177, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 58.5, argPeriapsisDeg: 198.3, meanAnomalyDeg: 324.8, color: 0x9c8b7a,
      gravity: 1.428, texture: 'assets/textures/ganymede.jpg', tempC: -163, summaryKey: 'moons.ganymede.desc' },
    { id: 'callisto', parent: 'jupiter', radiusKm: 2410.3, massKg: 1.07594e23, orbitKm: 1882700,
      periodDays: 16.68902, rotationH: 400.5365, tidallyLocked: true, eccentricity: 0.0074,
      orbitInclinationDeg: 0.192, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 309.1, argPeriapsisDeg: 43.8, meanAnomalyDeg: 87.4, color: 0x6f6257,
      gravity: 1.235, texture: 'assets/textures/callisto.jpg', tempC: -139, summaryKey: 'moons.callisto.desc' },
    { id: 'enceladus', parent: 'saturn', radiusKm: 252.1, massKg: 1.08022e20, orbitKm: 238020,
      periodDays: 1.37022, rotationH: 32.8853, tidallyLocked: true, eccentricity: 0.0047,
      orbitInclinationDeg: 0.009, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 0.0, argPeriapsisDeg: 119.5, meanAnomalyDeg: 57.0, color: 0xf0f0f0,
      gravity: 0.113, tempC: -198, summaryKey: 'moons.enceladus.desc' },
    { id: 'titan', parent: 'saturn', radiusKm: 2574.73, massKg: 1.3452e23, orbitKm: 1221870,
      periodDays: 15.94542, rotationH: 382.6901, tidallyLocked: true, eccentricity: 0.0288,
      orbitInclinationDeg: 0.34854, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 78.6, argPeriapsisDeg: 78.3, meanAnomalyDeg: 11.7, color: 0xd8a15c,
      gravity: 1.352, texture: 'assets/textures/titan.jpg', tempC: -179, summaryKey: 'moons.titan.desc' },
    { id: 'triton', parent: 'neptune', radiusKm: 1353.4, massKg: 2.139e22, orbitKm: 354759,
      periodDays: -5.87685, rotationH: -141.0444, tidallyLocked: true, eccentricity: 0.000016,
      orbitInclinationDeg: 156.865, inclinationReference: 'parentEquator',
      ascendingNodeDeg: 178.1, argPeriapsisDeg: 0.0, meanAnomalyDeg: 63.0, color: 0xc9c1b8,
      gravity: 0.779, tempC: -235, summaryKey: 'moons.triton.desc' },
    { id: 'charon', parent: 'pluto', radiusKm: 606.0, massKg: 1.586e21, orbitKm: 19596,
      periodDays: -6.38723, rotationH: -153.2935, tidallyLocked: true, eccentricity: 0.0002,
      orbitInclinationDeg: 0.001, inclinationReference: 'plutoEquator',
      ascendingNodeDeg: 0.0, argPeriapsisDeg: 0.0, meanAnomalyDeg: 304.1, color: 0xa9a39e,
      gravity: 0.288, tempC: -220, summaryKey: 'moons.charon.desc' }
  ],

  /* ============================ 彗星（哈雷） ============================ */
  comets: [
    {
      id: 'halley', texture: null, color: 0xbfe9ff, radiusKm: 5.5,
      /* 1986-02-09.4589 近日点反推至 J2000；peri 为 Ω+ω，而非近日点幅角本身。 */
      orbital: { a: 17.83414429, aRate: 0, e: 0.96714291, eRate: 0,
                 i: 162.26269, iRate: 0, L: 236.15464917, LRate: 477.98902177,
                 peri: 169.75257, periRate: 0, node: 58.42008, nodeRate: 0 },
      periodDays: 27509.13,
      perihelionJd: 2446470.9589
    }
  ],

  /* ============================ 小行星带 / 柯伊伯带 ============================ */
  belts: {
    asteroid: { innerAu: 2.06, outerAu: 3.28, thicknessAu: 0.18, inclinationDeg: 10, color: 0x9a9a9a },
    kuiper:   { innerAu: 30.0, outerAu: 50.0, thicknessAu: 0.9, inclinationDeg: 8, color: 0x7f7f7f }
  },

  /* 数据版本说明：卫星总数按需求采用 95 / 146 / 28 / 16 的确认口径。 */
  scienceMeta: {
    orbitalModel: 'JPL approximate Keplerian elements',
    shortTermRange: '1800-2050',
    longTermRange: '3000 BC-3000 AD',
    moonCountSnapshot: 'Jupiter 95; Saturn 146; Uranus 28; Neptune 16'
  }
};
