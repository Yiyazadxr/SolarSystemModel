/**
 * 中英双语词包（默认英文）
 * 结构：ui（界面文案）/ bodies（天体名称与简介）/ atm（大气成分）/ moons / comets / views / fields
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
      factAu: '1 AU', factBody: 'Earth radius', factExagg: 'planets', factLocal: '1 scene unit at 1 AU ≈',
      sceneUnit: 'scene units',
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
      hudFx: 'HUD MOTION',
      unitTitle: 'DISTANCE UNIT',
      unitAu: 'AU',
      unitKm: 'KM',
      langTitle: 'LANGUAGE',
      needApi: 'Greyed switches still need a scene API',
      sound: 'SOUND',

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
      orbitChart: 'Top-down heliocentric orbit with perihelion, current position and aphelion',
      orbitPeri: 'PERI', orbitNow: 'NOW', orbitApo: 'APO',
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
      loadStage0: 'LOADING TEXTURES',
      loadStage1: 'BUILDING STAR',
      loadStage2: 'BUILDING PLANETS',
      loadStage3: 'BUILDING ORBITS',
      loadStage4: 'COMPILING SHADERS',
      loadStage5: 'READY'
    },

    /* 教学模式：按钮 / 标题 / 提示（课程正文见 teach-data 相关键） */
    teach: {
      modeTitle: 'Teach mode',
      demoMode: 'Demo mode',
      toc: 'Contents',
      expandToc: 'Expand contents',
      brandSub: '3D interactive demo · step-by-step lessons',
      hideInfo: 'Hide info',
      expandInfo: 'Expand info',
      expandInfoPanel: 'Expand info panel',
      gotoDemo: 'Switch to demo mode',
      prev: 'Prev',
      play: 'Play',
      pause: 'Pause',
      next: 'Next',
      speed: 'Speed',
      reset: 'Reset',
      askLabel: 'Think and discuss: ',
      srcLabel: 'Source: ',
      /* 二分二至：id 参与数据链路（data-term / TERM_LAMBDA），显示走这里的键 */
      term: {
        spring: 'Spring equinox',
        summer: 'Summer solstice',
        autumn: 'Autumn equinox',
        winter: 'Winter solstice',
        equinox: 'Spring / Autumn equinox'
      },
      termDate: {
        spring: 'around Mar 21',
        summer: 'around Jun 22',
        autumn: 'around Sep 23',
        winter: 'around Dec 22'
      },
      termSub: {
        spring: 'Sun directly over the equator (0°)',
        summer: 'Sun directly over the Tropic of Cancer (23.5°N)',
        autumn: 'Sun directly over the equator (0°)',
        winter: 'Sun directly over the Tropic of Capricorn (23.5°S)'
      },
      termTip: {
        spring: 'Spring equinox (around Mar 21)',
        summer: 'Summer solstice (around Jun 22)',
        autumn: 'Autumn equinox (around Sep 23)',
        winter: 'Winter solstice (around Dec 22)',
        equinox: 'Spring / Autumn equinox (around Mar 21 / Sep 23)'
      },
      /* 平地观日装置的 3D 标签：方位与太阳高度读数 */
      dir: { e: 'E', s: 'S', w: 'W', n: 'N' },
    /* 二十四节气（三球仪装置的 3D 标签）：顺序与 teach-orrery 的
       TERM_KEYS 一致，即黄经每 15° 一个节气 */
      t24: {
        lichun: 'Start of Spring', yushui: 'Rain Water', jingzhe: 'Awakening of Insects',
        chunfen: 'Spring Equinox', qingming: 'Pure Brightness', guyu: 'Grain Rain',
        lixia: 'Start of Summer', xiaoman: 'Grain Full', mangzhong: 'Grain in Ear',
        xiazhi: 'Summer Solstice', xiaoshu: 'Minor Heat', dashu: 'Major Heat',
        liqiu: 'Start of Autumn', chushu: 'End of Heat', bailu: 'White Dew',
        qiufen: 'Autumn Equinox', hanlu: 'Cold Dew', shuangjiang: 'Frost Descent',
        lidong: 'Start of Winter', xiaoxue: 'Minor Snow', daxue: 'Major Snow',
        dongzhi: 'Winter Solstice', xiaohan: 'Minor Cold', dahan: 'Major Cold'
      },
      sunAlt: 'Altitude',
      /* 地球仪装置的 3D 标签（航线名 / 尺寸标注 / 本初子午线） */
      globe: {
        magellanRoute: 'Magellan route',
        elcanoRoute: 'Elcano return voyage',
        polarRadius: 'Polar radius',
        eqRadius: 'Equatorial radius',
        eqCirc: 'Equatorial circumference about',
        primeMeridian: 'Prime meridian'
      },
      /* 元信息与课节级文案（teach-data.js）：当前界面未渲染这两组，但与课程
         数据同源，一并按语言存键，避免日后上屏时中英不一致。 */
      meta: {
        note: 'Teaching text follows the relevant pages of Zhejiang Education Press “Science” Grade 7 Volume 1 (revised to the 2022 curriculum standards), covering Chapter 3 Section 1 and later added lessons; extended data beyond the textbook is not presented as a teaching conclusion.'
      },
      lesson: {
        ch1: { title: 'The vast universe' },
        s1l1: {
          summary: 'Through four lines of evidence — ground observation, inference from celestial events, the practice of circumnavigation and space observation — see how humanity gradually established that the Earth is a sphere.',
          p0: 'A ship sailing away: the hull is hidden by the horizon first, the mast last',
          p1: 'Lunar eclipse: the edge of the Earth shadow on the Moon is always curved',
          p2: 'Magellan fleet: completed the first circumnavigation of the Earth',
          p3: 'Space observation: satellites and crewed spacecraft photographed the Earth; Gagarin saw it with his own eyes'
        },
        s1l2: {
          summary: 'Learn the shape and size data of the Earth, and through Eratosthenes use of the Sun angle difference and the distance between two cities, understand the idea of the measurement.',
          p0: 'The Earth is a sphere slightly flattened at the poles and bulging at the equator',
          p1: 'Equatorial radius about 6378 km, polar radius about 6357 km, equatorial circumference about 4×10⁴ km',
          p2: 'Eratosthenes used 7.2° (1/50 of a circle) and about 800 km to estimate the circumference'
        },
        s1l3: {
          summary: 'On a globe, learn the axis, the two poles, the equator, parallels and meridians, and describe places on the Earth surface with latitude and longitude.',
          p0: 'The equator is the 0° parallel; the north and south poles are 90°N and 90°S',
          p1: 'Parallels run east-west; latitude increases to 90° towards the poles',
          p2: 'Meridians join the two poles and run north-south; the grid fixes any location'
        },
        s2l1: {
          summary: 'Learn that the solar system is made up of the Sun, the planets and their satellites, and many kinds of small bodies.',
          p0: 'The Sun is the largest body in the solar system, about 99.86% of its total mass',
          p1: 'The Sun, the planets and their satellites are the main parts of the solar system',
          p2: 'Dwarf planets, asteroids, comets and other small bodies are members too'
        },
        s3l1: {
          summary: 'Learn the direction and period of Earth rotation, and understand the causes of day-night alternation, local time and time zones.',
          p0: 'Rotation direction: west to east, counter-clockwise seen from above the north pole',
          p1: 'Rotation period: about 23 h 56 min 4 s; day and night alternate about every 24 h, one day',
          p2: 'Day and night hemispheres: the lit half is day, the unlit half is night',
          p3: 'Local time: places further east see sunrise earlier; Beijing Time is the zone time of East 8'
        },
        s3l2: {
          summary: 'Learn the direction and period of Earth revolution and the tilt of the axis, and how the moving sub-solar point causes the seasons.',
          p0: 'Revolution: west to east along a nearly circular orbit, about 365 days (one year)',
          p1: 'The axis is tilted 66.5°, its north end always pointing near Polaris',
          p2: 'At the summer solstice the Sun is overhead at the Tropic of Cancer (23.5°N), at the winter solstice at the Tropic of Capricorn, at the equinoxes at the equator',
          p3: 'The sub-solar point moves back and forth between the two tropics — the main cause of the seasons',
          p4: 'Slanting rays spread the same beam over a larger area, so less radiation per unit area; higher latitudes receive less'
        },
        s3l3: {
          summary: 'Learn the solar altitude angle, and how a pole shadow changes through the day and how noon altitude varies with season and latitude.',
          p0: 'Through the day the pole shadow is long at sunrise, shortest at noon, long again towards the west',
          p1: 'Solar altitude angle: the angle between the sunlight and the ground',
          p2: 'Noon altitude: greatest at the summer solstice, smallest at the winter solstice; at 30°N about 83.5° and about 36.5°',
          p3: 'Noon shadow: short in summer, long in winter; on a given day it varies with latitude'
        },
        s3l4: {
          summary: 'Understand how the length of day and night varies with season and latitude, and the conditions for polar day, polar night and equal day and night.',
          p0: 'Except on the equator, days are longer than nights in summer and shorter in winter',
          p1: 'At the summer solstice the northern hemisphere has its longest day, with polar day beyond the Arctic Circle',
          p2: 'At the winter solstice the northern hemisphere has its shortest day, with polar night beyond the Arctic Circle',
          p3: 'At the equinoxes the Sun is overhead at the equator and day equals night worldwide; on the equator they are equal all year'
        },
        s3l5: {
          summary: 'Learn the history and basis of the 24 solar terms, and how they correspond to the Earth position in its orbit.',
          p0: 'In 2016 the 24 solar terms were inscribed on the UNESCO Representative List of the Intangible Cultural Heritage of Humanity',
          p1: 'In antiquity a gnomon and a sundial fixed the solstices and equinoxes; the full set was established by the Qin and Han',
          p2: 'Divided by the Earth position on the ecliptic: every 15° from the vernal equinox point (longitude 0°) is one solar term',
          p3: 'A tropical year spans 360°, giving 24 terms a year; the dates are fairly fixed in the solar calendar'
        },
        s4l1: {
          summary: 'Learn the rotation and revolution of the Moon, and why it always keeps the same face towards the Earth.',
          p0: 'The Moon does not emit light, it reflects sunlight; the lit side is bright, the other dark',
          p1: 'The Moon rotates on its own axis while revolving around the Earth',
          p2: 'Rotation and revolution periods are equal, so it always keeps one face towards us',
          p3: 'We only ever see the near side; lunar probes have imaged both the near and the far sides'
        },
        s4l2: {
          summary: 'Learn the types and cause of solar eclipses, and how the Moon shadow falling on the Earth produces one.',
          p0: 'A solar eclipse: the Sun disc is wholly or partly hidden by the Moon',
          p1: 'Three types: partial, annular and total solar eclipse',
          p2: 'Cause: the Moon comes between the Earth and the Sun, the three nearly in a line',
          p3: 'The Moon blocks sunlight and casts a shadow; the eclipse is seen where the shadow falls'
        },
        s4l3: {
          summary: 'Learn the phenomenon and types of lunar eclipses, and how the Moon entering the Earth shadow produces one.',
          p0: 'A lunar eclipse: part or all of the Moon darkens, lasting more than an hour',
          p1: 'Refraction by the Earth atmosphere gives the eclipsed Moon a dim coppery colour',
          p2: 'Two types: total (the whole disc in the umbra) and partial (only part of it)',
          p3: 'Cause: the Moon enters the Earth shadow pointing away from the Sun'
        }
      },
      /* 课程数据（teach-data.js）只存键，渲染时由 SOLAR.t 取文案；
         键名按「节 / 课 / 步」层级编排，便于与教材目录对照。 */
      d: {
        s1: {
          title: 'Knowing the Earth',
          l1: {
            title: 'Shape of the Earth',
            step1: {
              title: 'Watching a ship sail away',
              text: 'The textbook poses the question of a ship sailing away: as it moves off, the hull disappears first and the mast last. The curvature of the Earth lets the horizon hide the lower hull first. This is an inference from ground-level observation; judging the shape of the Earth also needs evidence from lunar eclipses, circumnavigation and space observation.',
              ask: 'Which disappears first, the hull or the mast? How does the horizon hide a ship that is sailing away?'
            },
            step2: {
              title: 'Observing a lunar eclipse',
              text: 'During a lunar eclipse the Earth comes between the Sun and the Moon, and the Earth shadow falls on the Moon. The textbook notes that repeated observations showed the shadow edge is always curved, which led people to infer a spherical Earth. The animation shows the shadow sweeping across the lunar disc; scale and speed are schematic for clarity.',
              ask: 'Where does the Earth shadow fall during a lunar eclipse? What feature of the shadow led people to infer the shape of the Earth?'
            },
            step3: {
              title: 'Magellan circumnavigation',
              text: 'In 1519 Magellan set out with his fleet. After 1082 days at sea only one ship and 18 sailors returned to the starting point, completing the first circumnavigation of the Earth in human history. The voyage itself proved by practice that the Earth is a sphere. The route drawn on screen is a schematic historical route based on geographic locations.'
            },
            step4: {
              title: 'Seeing Earth from space',
              text: 'In the 20th century, satellites and crewed spacecraft photographed the Earth from space and confirmed it is a sphere, with blue oceans and white clouds visible. In 1961 the Soviet cosmonaut Gagarin became the first person to see the spherical Earth from space with his own eyes. Our understanding of the Earth shape advanced along with observation and spaceflight technology.'
            }
          },
          l2: {
            title: 'Size of the Earth',
            step1: {
              title: 'Dimensions of the Earth',
              text: 'Modern measurements show the Earth is a sphere slightly flattened at the poles and bulging at the equator. The textbook gives approximate values: equatorial radius about 6378 km, polar radius about 6357 km, equatorial circumference about 4×10⁴ km. The difference between equatorial and polar radius is very small relative to the Earth as a whole.',
              ask: 'From the equatorial and polar radius data, what can we say about the shape of the Earth?'
            },
            step2: {
              title: 'Eratosthenes measures the Earth',
              text: 'In the 3rd century BCE Eratosthenes measured the Earth circumference using the noon shadow at the summer solstice. From sunlight striking the bottom of a well in Syene (today Aswan) and the shadow of a vertical rod in Alexandria at the same moment, he found the difference in Sun angle to be about 7.2°, that is 1/50 of a full circle. The textbook gives the distance between the two cities as about 800 km, so the circumference is about 800 km × 50, roughly 4×10⁴ km.',
              ask: 'Two places are about 800 km apart and the angle difference is 7.2° (1/50 of a circle). How would you estimate the circumference of the Earth?'
            }
          },
          l3: {
            title: 'The globe',
            step1: {
              title: 'Main parallels and the poles',
              text: 'On a globe, the great circle equidistant from the two poles is called the equator; it divides the Earth into the Northern and Southern Hemispheres. Circles parallel to the equator are called parallels (lines of latitude) and they run east-west. The equator is 0° latitude and the poles are 90°; north of the equator is north latitude (N) and south is south latitude (S), with latitude increasing from the equator toward the poles.',
              ask: 'Into which two hemispheres does the equator divide the Earth? How do we tell north latitude from south latitude?'
            },
            step2: {
              title: 'Main meridians and the prime meridian',
              text: 'The semicircular arcs joining the two poles are called meridians (lines of longitude). Meridians are perpendicular to parallels and run north-south. The meridian through the Royal Observatory at Greenwich, London is 0°, the prime meridian; eastward from 0° to 180° is east longitude (E) and westward is west longitude (W). The network of meridians and parallels lets any place on Earth be given by latitude and longitude.',
              ask: 'Which meridian is the prime meridian? How do we tell east longitude from west longitude?'
            }
          }
        },
        s2: {
          title: 'Structure of the solar system',
          l1: {
            title: 'Members of the solar system',
            step1: {
              title: 'The solar system',
              text: 'Earth moves around the Sun together with Mercury, Venus, Mars, Jupiter and the other planets. The Sun, the planets and their satellites, plus small bodies such as dwarf planets, asteroids and comets, make up the solar system. The textbook notes that the Sun holds about 99.86% of the total mass of the solar system and is by far the largest body in both volume and mass.',
              ask: 'Besides the Sun and the planets, which other members of the solar system does the textbook list? About what percentage of the total mass is the Sun?',
              gotoDemo: 'For the full composition and structure of the solar system, switch to demo mode and explore freely.'
            }
          }
        },
        s3: {
          title: 'Motions of the Earth',
          l1: {
            title: 'Earth rotation',
            step1: {
              title: 'Direction and period of rotation',
              text: 'People in ancient times saw the Sun rise in the east and set in the west day after day and thought the Sun went around the Earth. In fact this daily motion comes from the Earth carrying us around its axis from west to east. The Earth keeps rotating about the axis through the two poles; this motion is called rotation. The axis is an imaginary line whose north end points near Polaris; seen from above the north pole, the Earth turns counter-clockwise. One rotation takes about 23 h 56 min 4 s.'
            },
            step2: {
              title: 'Day and night',
              text: 'Seen from above the north pole, sunlight always lights half of the Earth: the lit half is the day hemisphere and the other half is the night hemisphere, which is why different places have day and night. Because the Earth keeps turning west to east, day and night alternate; one rotation brings one alternation, about 24 hours, that is, one day.'
            },
            step3: {
              title: 'Local time and Beijing time',
              text: 'Because the Earth rotates, places further east see sunrise earlier and places further west later, so different longitudes have different local time — earlier in the east, later in the west. Beijing lies in the East 8th time zone, exactly 8 hours ahead of Greenwich Mean Time at the prime meridian. China uses the zone time of East 8 as its standard time, known as Beijing Time.',
              ask: 'Why do places further east always see sunrise first? How many hours is East 8 (Beijing) ahead of Greenwich Mean Time?'
            }
          },
          l2: {
            title: 'Earth revolution',
            step1: {
              title: 'Revolution and the seasons',
              text: 'The Earth keeps moving around the Sun along a nearly circular orbit; this motion is called revolution, and one revolution takes about 365 days, that is, one year. The Earth revolves from west to east with its axis tilted, the north end always pointing near Polaris, and the angle between the axis and the orbital plane is 66.5°. At different points of the orbit the Sun is directly overhead at different latitudes, which is the cause of the seasons: at the summer solstice (around Jun 22) the Sun is overhead at the Tropic of Cancer (23.5°N) and the northern hemisphere has summer; at the winter solstice (around Dec 22) it is overhead at the Tropic of Capricorn and the northern hemisphere has winter; at the equinoxes (around Mar 21 and Sep 23) it is overhead at the equator, giving spring and autumn in the north. Over the year the sub-solar point moves back and forth between the two tropics, so most places differ in both the angle and the duration of sunshine.',
              ask: 'At the summer and winter solstices, which latitude does the Sun shine directly over? Between which latitudes does the sub-solar point move over the year?'
            }
          },
          l3: {
            title: 'Noon sun altitude',
            step1: {
              title: 'Sun altitude and shadow',
              text: 'Watching the Sun from level ground (Fig. 4.2-14): through the day it rises in the east, is highest at noon and sets in the west, and the shadow of a pole grows shorter then longer again, shortest at noon (Fig. 4.2-13). The angle between the sunlight and the ground is the solar altitude angle. Over the year noon altitude changes with season: greatest at the summer solstice and smallest at the winter solstice; at 30°N it is about 83.5° at the summer solstice and about 36.5° at the winter solstice. On a given day the noon shadow length also varies with latitude — the higher the Sun, the shorter the shadow (Fig. 4.2-15). On the Tropic of Cancer the Sun rises due east and sets due west at the equinoxes, rises north of east and sets north of west at the summer solstice, and rises south of east and sets south of west at the winter solstice.',
              ask: 'On the Tropic of Cancer, how do the sunrise and sunset directions at the summer and winter solstices differ from those at the equinoxes? What are the noon solar altitudes at 30°N at the summer and winter solstices?'
            }
          },
          l4: {
            title: 'Changing length of day and night',
            step1: {
              title: 'Polar day, polar night and equal day and night',
              text: 'From the spring equinox to the autumn equinox the Sun is overhead in the northern hemisphere, so days are longer than nights there; the longest day comes at the summer solstice, and the Arctic Circle (66.5°N) and beyond have polar day. From the autumn equinox to the next spring equinox the Sun is overhead in the southern hemisphere, days are shorter than nights in the north, the shortest day comes at the winter solstice, and the Arctic Circle and beyond have polar night. The southern hemisphere is the reverse. At the equinoxes the Sun is overhead at the equator and day and night are equal everywhere; on the equator they are equal all year.',
              ask: 'When do the Arctic Circle and beyond have polar day and polar night? When are day and night equal everywhere? Where are they equal all year?'
            }
          },
          l5: {
            title: 'The 24 solar terms and Earth motion',
            step1: {
              title: 'The 24 solar terms',
              text: 'In ancient China the length of the noon shadow was measured with a gnomon and a sundial: the longest noon shadow marked the winter solstice, the shortest the summer solstice, and the two days of equal day and night the spring and autumn equinoxes. There were four solar terms in the Shang dynasty and eight in the Zhou, and the full set was established by the Qin and Han. The 24 solar terms divide the Earth position along the ecliptic (its orbit): starting from the vernal equinox point (ecliptic longitude 0°, Sun overhead at the equator), every 15° is one solar term; a tropical year spans 360°, so there are 24 terms in a year, with fairly fixed dates in the solar calendar.',
              ask: 'How are the 24 solar terms defined? How many degrees along the ecliptic is one solar term? Why are there exactly 24 in a year?'
            }
          }
        },
        s4: {
          title: 'Relative motions of Sun, Earth and Moon',
          l1: {
            title: 'Motion of the Moon',
            step1: {
              title: 'Rotation and revolution of the Moon',
              text: 'The Moon does not emit light; it only reflects sunlight, so the lit side is bright and the other dark. Just as the Earth rotates while revolving around the Sun, the Moon rotates on its own axis while revolving around the Earth. Its rotation and revolution periods are equal, so it always keeps the same face towards us: as Fig. 4.3-8 shows, we always see only the half containing point A, the near side. If the Moon did not rotate, we would see both the near and the far side within one month.',
              ask: 'Why does the Moon always keep the same face towards the Earth? If it did not rotate, which sides could we see?'
            }
          },
          l2: {
            title: 'Solar eclipse',
            step1: {
              title: 'Solar eclipse',
              text: 'A solar eclipse occurs when the Moon covers all or part of the Sun: a partial eclipse when it covers part of the disc; an annular eclipse when only the centre is covered and a ring of the Sun remains; a total eclipse when the Sun is completely hidden. When the Moon comes between the Earth and the Sun with the three nearly in a line, light travels in straight lines and the Moon casts a shadow; the shadow has an umbra, a penumbra and an antumbra, and the corresponding regions see a total, partial or annular eclipse (Fig. 4.3-14).',
              ask: 'During a solar eclipse, how are the Moon, Earth and Sun positioned? Which part of the Moon shadow corresponds to a total eclipse?'
            }
          },
          l3: {
            title: 'Lunar eclipse',
            step1: {
              title: 'Lunar eclipse',
              text: 'A lunar eclipse occurs when part or all of the Moon darkens, and it can last more than an hour; because the Earth atmosphere refracts sunlight, the eclipsed Moon is not completely black but a dim coppery red (Fig. 4.3-15). The Earth casts a shadow away from the Sun, divided into umbra and penumbra; depending on where the Moon enters, a total lunar eclipse occurs when the whole Moon enters the umbra, and a partial one when only part of it does (Fig. 4.3-17).',
              ask: 'What two types of lunar eclipse are there? Into which part of the Earth shadow does the Moon enter in a total and in a partial lunar eclipse?'
            }
          }
        },
        /* 数据来源：子键与 teach-data.js 的 meta.sources[].key 同名 */
        src: {
          textbook_3_1: 'Same textbook, pp. 93–94: from a ship sailing away and the Earth shadow in a lunar eclipse, recognising the curvature of the Earth surface and inferring a spherical Earth.',
          earth_size: 'Same textbook, p. 95: the Earth is slightly flattened at the poles and bulges at the equator; equatorial radius about 6378 km, polar radius about 6357 km, equatorial circumference about 4×10⁴ km.',
          earth_surface: 'Same textbook, p. 95 lists only the equatorial circumference of about 4×10⁴ km; this lesson does not quote any surface area value that the textbook does not give.',
          eratosthenes: 'Same textbook, pp. 95–96 “Science reading”: Syene and Alexandria are about 800 km apart and the noon Sun angle differs by 7.2° (1/50 of a circle), giving a circumference of about 4×10⁴ km.',
          magellan: 'Same textbook, pp. 93–94: the Magellan fleet set out in 1519 and took 1082 days to complete the first circumnavigation; the textbook uses this as practical evidence.',
          space_earth: 'Same textbook, p. 94: photographs from satellites and crewed spacecraft in the 20th century confirmed the Earth is a sphere; in 1961 Gagarin became the first person to see the spherical Earth from space.',
          globe_model: 'Same textbook, pp. 97–99: a globe is a scale model of the Earth; the axis is an imaginary line for the rotation axis, meeting the surface at the south and north poles.',
          latlon_grid: 'Same textbook, pp. 97–98: the equator is the 0° parallel; parallels run east-west and latitude increases to 90° at the poles; meridians join the poles and run north-south.',
          solar_system: 'Same textbook, p. 104: the Sun, the planets and their satellites, plus dwarf planets, asteroids and comets, make up the solar system; the Sun holds about 99.86% of its total mass.',
          prime_meridian: 'Same textbook, pp. 97–98: the meridian through the Royal Observatory at Greenwich, London is the 0° meridian, the prime meridian; longitude counts to 180° east and west.',
          map_basic: 'Same textbook, pp. 99–100: a map is a flat model of the Earth surface; scale, direction and legend are the “language” of maps, and scale can be a bar, a statement or a ratio.',
          bds: 'This check covered pp. 93–104, which do not include the Beidou satellite navigation system; that content is not a source for this lesson.',
          earth_rotation: 'Same textbook, Fig. 4.2-1: the Earth rotates west to east with a period of about 23 h 56 min 4 s; day and night alternate about every 24 h; places further east see sunrise first, which gives local time; Beijing is in East 8, 8 hours from Greenwich.',
          earth_revolution: 'Same textbook, Fig. 4.2-6: revolution is west to east with a period of about 365 days; the axis is 66.5° from the orbital plane and its north end always points near Polaris; at the summer solstice the Sun is overhead at the Tropic of Cancer (23.5°N), at the winter solstice at the Tropic of Capricorn, and at the equinoxes at the equator.',
          solar_height: 'Same textbook, Figs. 4.2-14 and 4.2-15: at 30°N the noon solar altitude is about 83.5° at the summer solstice and about 36.5° at the winter solstice; the noon shadow is short in summer and long in winter, and varies with latitude on a given day.',
          day_night_length: 'Same textbook, Fig. 4.2-17: at the summer solstice the northern hemisphere has long days and short nights with polar day beyond the Arctic Circle; at the winter solstice short days with polar night; at the equinoxes day and night are equal worldwide, and on the equator equal all year.',
          solar_terms: 'Same textbook, Fig. 4.2-18: the 24 solar terms divide the Earth position along the ecliptic; every 15° from the vernal equinox point (longitude 0°) is one term, 24 in a year.',
          moon_motion: 'Same textbook, Fig. 4.3-8: the Moon rotation and revolution periods are equal, so it always keeps one face towards the Earth and we only ever see the near side.',
          solar_eclipse: 'Same textbook, Figs. 4.3-10 and 4.3-14: when the Moon comes between the Earth and the Sun with the three nearly in a line it blocks sunlight, producing a solar eclipse, of partial, annular and total types.',
          lunar_eclipse: 'Same textbook, Fig. 4.3-17: the Moon darkens as it enters the Earth umbra, giving a total lunar eclipse (whole disc in the umbra) or a partial one (part of it); during the eclipse the Moon looks coppery.'
        }
      }
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

    comets: {
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
      factAu: '1 AU', factBody: '地球半径', factExagg: '行星放大', factLocal: '1 AU 处 1 场景单位 ≈',
      sceneUnit: '场景单位',
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
      hudFx: '界面动效',
      unitTitle: '距离单位',
      unitAu: '天文单位',
      unitKm: '千米',
      langTitle: '语言',
      needApi: '置灰的开关尚需场景接口支持',
      sound: '音效',

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
      orbitChart: '日心轨道俯视图，标有近日点、当前位置和远日点',
      orbitPeri: '近日', orbitNow: '当前', orbitApo: '远日',
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
      loadStage0: '加载星球贴图',
      loadStage1: '构建恒星',
      loadStage2: '构建行星与卫星',
      loadStage3: '生成轨道与带',
      loadStage4: '编译着色器',
      loadStage5: '就绪'
    },

    /* 教学模式：按钮 / 标题 / 提示（课程正文见 teach-data 相关键） */
    teach: {
      modeTitle: '教学模式',
      demoMode: '演示模式',
      toc: '目录',
      expandToc: '展开目录',
      brandSub: '三维互动演示 · 步骤讲解教学',
      hideInfo: '隐藏信息',
      expandInfo: '展开信息',
      expandInfoPanel: '展开信息面板',
      gotoDemo: '切换演示模式',
      prev: '上一步',
      play: '播放',
      pause: '暂停',
      next: '下一步',
      speed: '速度',
      reset: '复位',
      askLabel: '思考与讨论：',
      srcLabel: '数据来源：',
      /* 二分二至：id 参与数据链路（data-term / TERM_LAMBDA），显示走这里的键 */
      term: {
        spring: '春分',
        summer: '夏至',
        autumn: '秋分',
        winter: '冬至',
        equinox: '春分 / 秋分'
      },
      termDate: {
        spring: '3月21日前后',
        summer: '6月22日前后',
        autumn: '9月23日前后',
        winter: '12月22日前后'
      },
      termSub: {
        spring: '太阳直射赤道（0°）',
        summer: '太阳直射北回归线（23.5°N）',
        autumn: '太阳直射赤道（0°）',
        winter: '太阳直射南回归线（23.5°S）'
      },
      termTip: {
        spring: '春分（3月21日前后）',
        summer: '夏至（6月22日前后）',
        autumn: '秋分（9月23日前后）',
        winter: '冬至（12月22日前后）',
        equinox: '春分 / 秋分（3月21日 / 9月23日前后）'
      },
      /* 平地观日装置的 3D 标签：方位与太阳高度读数 */
      dir: { e: '东', s: '南', w: '西', n: '北' },
      sunAlt: '高度',
      /* 地球仪装置的 3D 标签（航线名 / 尺寸标注 / 本初子午线） */
      globe: {
        magellanRoute: '麦哲伦航线',
        elcanoRoute: '埃尔卡诺返航',
        polarRadius: '极半径',
        eqRadius: '赤道半径',
        eqCirc: '赤道周长约',
        primeMeridian: '本初子午线'
      },
      /* 元信息与课节级文案（teach-data.js）：当前界面未渲染这两组，但与课程
         数据同源，一并按语言存键，避免日后上屏时中英不一致。 */
    /* 二十四节气（三球仪装置的 3D 标签）：顺序与 teach-orrery 的
       TERM_KEYS 一致，即黄经每 15° 一个节气 */
      t24: {
        lichun: '立春', yushui: '雨水', jingzhe: '惊蛰',
        chunfen: '春分', qingming: '清明', guyu: '谷雨',
        lixia: '立夏', xiaoman: '小满', mangzhong: '芒种',
        xiazhi: '夏至', xiaoshu: '小暑', dashu: '大暑',
        liqiu: '立秋', chushu: '处暑', bailu: '白露',
        qiufen: '秋分', hanlu: '寒露', shuangjiang: '霜降',
        lidong: '立冬', xiaoxue: '小雪', daxue: '大雪',
        dongzhi: '冬至', xiaohan: '小寒', dahan: '大寒'
      },
      meta: {
        note: '教学文字依据浙江教育出版社《科学》七年级上册（根据2022年版课程标准修订）相关页码整理，覆盖第3章第1节及后续新增课节；教材以外的延伸数据不作为教学结论。'
      },
      lesson: {
        ch1: { title: '广袤浩瀚的宇宙' },
        s1l1: {
          summary: '从地面观察、天象推论、环球航行实践和太空观测四条证据，认识人类如何逐步确认地球是球体。',
          p0: '远去的船只：船身先被地平线遮住，桅杆后消失',
          p1: '月食：地球投在月球上的影子边缘呈弧形',
          p2: '麦哲伦船队：完成首次环绕地球航行一周',
          p3: '太空观测：卫星和载人航天器拍摄地球，加加林亲眼观察地球'
        },
        s1l2: {
          summary: '认识地球的形状和大小数据，并通过埃拉托色尼利用两地太阳光夹角与距离估算地球周长的故事，理解测量思路。',
          p0: '地球是两极稍扁、赤道略鼓的球体',
          p1: '赤道半径约6378 km，两极方向半径约6357 km，赤道周长约4×10⁴ km',
          p2: '埃拉托色尼用7.2°（圆周的1/50）和约800 km估算地球周长'
        },
        s1l3: {
          summary: '在地球仪上认识地轴、两极、赤道、纬线和经线，并用经纬度描述地球表面地点的位置。',
          p0: '赤道是0°纬线；北极和南极的纬度分别为90°N和90°S',
          p1: '纬线指示东西方向，纬度由赤道向两极增至90°',
          p2: '经线连接南北两极并指示南北方向；经纬网可确定地点'
        },
        s2l1: {
          summary: '认识太阳系由太阳、行星及其卫星和多种小天体共同组成。',
          p0: '太阳是太阳系中体积和质量最大的天体，约占太阳系总质量的99.86%',
          p1: '太阳、行星及其卫星共同组成太阳系的重要部分',
          p2: '矮行星、小行星、彗星等小天体也属于太阳系成员'
        },
        s3l1: {
          summary: '认识地球自转的方向与周期，理解昼夜交替、地方时与时区的成因。',
          p0: '自转方向：自西向东，从北极上空俯视呈逆时针',
          p1: '自转周期：约23小时56分4秒；昼夜交替约24小时，即一天',
          p2: '昼半球与夜半球：太阳光照到的区域为昼半球，照不到的为夜半球',
          p3: '地方时：偏东的地方先看到日出，时间早；北京时间采用东八区区时'
        },
        s3l2: {
          summary: '认识地球公转的方向、周期与地轴倾斜，理解太阳直射点移动与四季变化的成因。',
          p0: '公转方向：自西向东，沿近似圆形轨道，周期约365天（一年）',
          p1: '地轴倾斜66.5°，北端始终指向北极星附近',
          p2: '夏至直射北回归线（23.5°N），冬至直射南回归线，春分/秋分直射赤道',
          p3: '太阳直射点在南、北回归线之间来回移动——四季变化的主要原因',
          p4: '斜射时同束阳光照到更大面积，单位面积接受辐射比直射少；纬度越高辐射越少'
        },
        s3l3: {
          summary: '认识太阳高度角，理解一天中杆影的变化与正午太阳高度随季节、纬度的变化规律。',
          p0: '一天中杆影：日出较长，正午最短，偏西后又变长',
          p1: '太阳高度角：太阳光线与地面的夹角',
          p2: '正午太阳高度：夏至日最大，冬至日最小；北纬30°夏至约83.5°、冬至约36.5°',
          p3: '正午杆影：夏季短，冬季长；同一天纬度不同影长不同'
        },
        s3l4: {
          summary: '理解昼夜长短随季节与纬度的变化规律，认识极昼、极夜与昼夜等长的条件。',
          p0: '除赤道外，各地夏季昼长夜短，冬季昼短夜长',
          p1: '夏至日北半球昼长达一年最大值，北极圈及以北极昼',
          p2: '冬至日北半球昼长达一年最小值，北极圈及以北极夜',
          p3: '春分、秋分太阳直射赤道，全球昼夜等长；赤道全年昼夜等长'
        },
        s3l5: {
          summary: '了解二十四节气的历史与划分依据，理解节气与地球公转位置的对应关系。',
          p0: '2016年「二十四节气」列入人类非物质文化遗产代表作名录',
          p1: '古代用圭表、日晷测日影定冬至、夏至、春分、秋分；秦汉年间完全确立',
          p2: '按地球在黄道上的位置划分：从春分点（黄经0°）每前进15°为一个节气',
          p3: '一回归年合360°，一年共24个节气；日期在阳历中相对固定'
        },
        s4l1: {
          summary: '认识月球的自转与公转，理解月球总以同一面朝向地球的原因。',
          p0: '月球自身不发光，反射太阳光；被照亮的一面亮，另一面暗',
          p1: '月球绕自身的轴自转，同时绕地球公转',
          p2: '自转与公转周期相同，月球总以同一面朝向地球',
          p3: '地球上只能看到月球正面；月球探测器已拍到正面和背面'
        },
        s4l2: {
          summary: '认识日食的类型与成因，理解月球影子投在地球上产生日食的过程。',
          p0: '日食：太阳表面全部或部分被月球遮掩的现象',
          p1: '三种类型：日偏食、日环食、日全食',
          p2: '成因：月球运行到地球和太阳之间，三者接近排成一条直线',
          p3: '月球挡住太阳光形成影子，月影所在区看到日食'
        },
        s4l3: {
          summary: '认识月食的现象与类型，理解月球进入地球影子产生月食的过程。',
          p0: '月食：月面部分或全部变暗的现象，可持续一个多小时',
          p1: '地球大气对太阳光的折射使月食时月面呈暗弱的古铜色',
          p2: '两种类型：月全食（全部进入地球本影）、月偏食（部分进入本影）',
          p3: '成因：月球进入地球背对太阳方向的影子'
        }
      },
      /* 课程数据（teach-data.js）只存键，渲染时由 SOLAR.t 取文案；
         键名按「节 / 课 / 步」层级编排，便于与教材目录对照。 */
      d: {
        s1: {
          title: '认识地球',
          l1: {
            title: '地球的形状',
            step1: {
              title: '观察远去的船只',
              text: '教材提出观察远去船只的问题：船驶向远处时，船身先从视野中消失，桅杆后消失。地球表面的弧度使较低的船身先被地平线遮挡。这是观察地面景象得到的推论；判断地球形状还要结合月食、环球航行和太空观测等证据。',
              ask: '船身和桅杆谁先消失？地平线怎样遮挡逐渐远去的船只？'
            },
            step2: {
              title: '观察月食',
              text: '月食时，地球挡在太阳和月球之间，地球的影子落在月球上。教材指出，人们多次观察月食，发现地影总呈弧形，并据此推测地球是球体。动画展示地影掠过月面的过程，画面中的尺度和运动速度为便于观察的示意。',
              ask: '月食时，地球的影子落在哪里？人们从地影的什么特征推测地球形状？'
            },
            step3: {
              title: '麦哲伦环球航线',
              text: '1519年，麦哲伦率领船队出发，经过1082天的海上航行，船队中仅一艘船和18名水手返回出发地，完成了人类历史上第一次环绕地球航行一周。船队亲身完成环球航行，以实践证实地球是球体。画面上的航线是依据地理位置绘制的历史路线示意。'
            },
            step4: {
              title: '从太空直接看见地球',
              text: '20世纪，人类发射人造地球卫星和载人航天器，从太空拍摄地球照片，确证地球是一个球体；照片上可见蓝色的海洋和白色的云。1961年，苏联宇航员加加林成为第一个在太空亲眼看到地球球体的人。人类认识地球形状的过程，也随着观测和航天技术的发展不断推进。'
            }
          },
          l2: {
            title: '地球的大小',
            step1: {
              title: '地球的尺寸',
              text: '现代测量表明，地球是一个两极稍扁、赤道略鼓的球体。教材给出的近似值是：赤道半径约6378 km，两极方向的半径约6357 km，赤道周长约4×10⁴ km。赤道半径与两极方向半径的差异相对地球整体很小。',
              ask: '从赤道半径和两极方向半径的数据看，地球的形状有什么特点？'
            },
            step2: {
              title: '埃拉托色尼测地球周长',
              text: '公元前3世纪，埃拉托色尼利用夏至正午的光影测量地球周长。他根据塞尼城（今阿斯旺）阳光直射井底，以及同一时刻亚历山大垂直杆的影子，求得两地太阳光与地面夹角的差约为7.2°，即圆周的1/50。教材给出的两城距离约800 km，因此估算地球周长约为800 km×50，结果约4×10⁴ km。',
              ask: '两地相距约800 km，夹角差为7.2°（圆周的1/50），怎样估算地球一周的长度？'
            }
          },
          l3: {
            title: '地球仪',
            step1: {
              title: '主要纬线与南北两极',
              text: '地球仪上，与南、北两极距离相等的大圆叫赤道，它把地球分为南、北半球。所有与赤道平行的圈线叫纬线，指示东西方向。赤道纬度为0°，南、北两极纬度分别为90°；赤道以北为北纬（N），以南为南纬（S），纬度由赤道向两极增大。',
              ask: '赤道把地球分成哪两个半球？怎样区分北纬和南纬？'
            },
            step2: {
              title: '主要经线与本初子午线',
              text: '连接南、北两极的半圆弧线叫经线，也叫子午线。经线与纬线垂直，指示南北方向。通过英国伦敦格林尼治天文台的经线为0°经线，即本初子午线；向东从0°计至180°为东经（E），向西从0°计至180°为西经（W）。经纬线相互交织形成经纬网，地球表面地点可以用经纬度表示。',
              ask: '本初子午线是几度经线？怎样区分东经和西经？'
            }
          }
        },
        s2: {
          title: '太阳系的组成与结构',
          l1: {
            title: '太阳系的组成',
            step1: {
              title: '太阳系',
              text: '地球与水星、金星、火星、木星等行星一起围绕太阳转动。太阳、行星及其卫星，以及矮行星、小行星、彗星等小天体共同组成太阳系。教材指出，太阳约占太阳系总质量的99.86%，是太阳系中体积和质量最大的天体。',
              ask: '除太阳和行星外，教材还列举了哪些太阳系成员？太阳约占太阳系总质量的百分之多少？',
              gotoDemo: '完整太阳系的组成和结构，推荐前往演示模式自由探索。'
            }
          }
        },
        s3: {
          title: '地球的转动',
          l1: {
            title: '地球绕地轴自转',
            step1: {
              title: '自转的方向与周期',
              text: '古代的人们看到太阳周而复始地东升西落，认为太阳在绕地球旋转。其实，太阳东升西落是地球载着我们不停地自西向东绕地轴旋转的缘故。地球始终不停地绕着贯穿南、北两极的地轴旋转，这种运动称为自转。地轴是地球自转的假想轴，它的北端指向北极星附近；从北极上空俯视，地球呈逆时针方向转动。地球自转一周所需时间约为23小时56分4秒。'
            },
            step2: {
              title: '昼夜交替',
              text: '从北极上空俯视地球，太阳光始终照亮半个地球表面：同一时间里，太阳光照射到的地球区域是昼半球，太阳光照射不到的另一半区域是夜半球，这就使地球上的不同区域有了昼夜之分。因为地球沿自西向东的方向不停地转动，白昼与黑夜也就交替出现了，这就是昼夜交替现象；地球每自转一周，白天和黑夜就更替一次，时间约为24小时，即一天。'
            },
            step3: {
              title: '地方时与北京时间',
              text: '由于地球的自转，偏东的地方先看到日出，偏西的地方后看到日出，不同经度的地方产生了不同的地方时——偏东的地方时间早，偏西的地方时间晚。北京处于世界时区分布图中的东八区，同英国格林尼治（位于本初子午线上）标准时间整整相差8小时；我国采用北京所在的东八区的区时作为标准时间，称为「北京时间」。',
              ask: '为什么偏东的地方总先看到日出？北京所在的东八区与格林尼治标准时间相差多少？'
            }
          },
          l2: {
            title: '地球绕太阳公转',
            step1: {
              title: '地球的公转与四季',
              text: '地球沿近似圆形的轨道不停地绕着太阳转动，这种运动称为公转；地球公转一周所需时间约为365天，即通常所说的一年。地球公转方向是自西向东，且地轴呈倾斜状态，地轴的北端始终指向北极星附近，地轴与地球公转轨道面之间的夹角为66.5°。地球运行到公转轨道不同位置，太阳直射的纬度不同，这是四季变化的成因：夏至日（6月22日前后）太阳直射北回归线（23.5°N），北半球是夏季；冬至日（12月22日前后）直射南回归线，北半球是冬季；春分日（3月21日前后）、秋分日（9月23日前后）直射赤道，北半球是春季和秋季。一年中，太阳直射点在南、北回归线之间来回移动，大部分地区因此有太阳照射角度与照射时间长短的差异。',
              ask: '夏至日和冬至日太阳分别直射哪条纬线？一年中太阳直射点在什么范围内移动？'
            }
          },
          l3: {
            title: '正午太阳高度变化',
            step1: {
              title: '太阳高度与杆影',
              text: '站在平地上看太阳（图4.2-14）：一天中，太阳从东方升起、正午最高、向西方落下，杆影随之由长变短再变长，正午时最短（图4.2-13）。太阳光线与地面的夹角叫作太阳高度角。一年中，正午太阳高度随季节变化：夏至最大、冬至最小，如北纬30°夏至日约83.5°、冬至日约36.5°；同一天纬度不同，正午杆影长短也不同——太阳高度越大，杆影越短（图4.2-15）。北回归线上，春分、秋分太阳由正东升起、正西落下；夏至由东偏北升起、西偏北落下；冬至由东偏南升起、西偏南落下。',
              ask: '北回归线上，夏至和冬至时太阳的升落方向与春分、秋分有什么不同？北纬30°地区正午太阳高度夏至日和冬至日分别约为多少？'
            }
          },
          l4: {
            title: '昼夜长短变化',
            step1: {
              title: '极昼极夜与昼夜等长',
              text: '自春分日至秋分日，太阳直射北半球，北半球各地昼长于夜，夏至日昼长达一年中的最大值，北极圈（66.5°N）及其以北出现极昼；自秋分日至次年春分日，太阳直射南半球，北半球昼短夜长，冬至日昼长达一年中的最小值，北极圈及其以北出现极夜。南半球相反。春分日和秋分日太阳直射赤道，全球各地昼夜等长；赤道上全年昼夜等长。',
              ask: '北极圈及其以北地区什么时候出现极昼、什么时候出现极夜？什么时候全球各地昼夜等长？哪些地方全年昼夜等长？'
            }
          },
          l5: {
            title: '二十四节气与地球运动',
            step1: {
              title: '二十四节气',
              text: '我国古代用圭表、日晷实测日影长度，将正午日影最长的一天定为冬至，最短的一天定为夏至，昼夜等长的两天定为春分和秋分。商朝四节气、周朝八个，秦汉年间完全确立。二十四节气按地球在黄道（公转轨道）上的位置划分：从春分点（黄经0°，太阳直射赤道）每前进15°为一个节气，一回归年合360°，一年共24个节气，日期在阳历中相对固定。',
              ask: '二十四节气是按什么划分的？一个节气对应黄道上多少度？一年为什么正好有24个节气？'
            }
          }
        },
        s4: {
          title: '日地月的相对运动',
          l1: {
            title: '月球的运动',
            step1: {
              title: '月球的自转与公转',
              text: '月球自己不会发光，只能反射太阳光，被照亮的一面亮，另一面暗。正如地球自转的同时绕太阳公转，月球也绕自身的轴自转，并绕地球公转。月球的自转和公转周期相同，因此总以同一面朝向地球：如图4.3-8，地球上的人始终只能看到 A 点所在的那半个月球，即月球正面；如果月球不发生自转，就能在同一个月内看到月球的正面和背面。',
              ask: '为什么月球总以同一面朝向地球？如果月球不自转，我们在地球上能看到月球的哪些面？'
            }
          },
          l2: {
            title: '日食',
            step1: {
              title: '日食',
              text: '太阳表面全部或部分被月球遮掩的现象称为日食：月球遮住太阳的一部分时出现日偏食；只遮住中心部分、太阳周围露出一圈日面时出现日环食；太阳完全被遮住时出现日全食。月球运行到日地之间、三者接近成一直线时，由于光沿直线传播，月球挡住太阳光形成影子；月影分为本影、半影和伪本影，对应区域分别看到日全食、日偏食和日环食（图4.3-14）。',
              ask: '日食发生时，月球、地球、太阳三者处于什么位置关系？月影的哪个部分对应日全食？'
            }
          },
          l3: {
            title: '月食',
            step1: {
              title: '月食',
              text: '月面部分或全部变暗的现象称为月食，时间可长达一个多小时；由于地球大气对太阳光的折射，发生月食部分的月球并非全黑，而是呈暗弱的古铜色（图4.3-15）。地球在背对太阳的方向会产生影子，影子分为本影和半影；月球进入地影的不同位置，月球全部进入地球本影中而变暗的叫月全食，有一部分进入本影区的叫月偏食（图4.3-17）。',
              ask: '月食有哪两种类型？月全食和月偏食分别是月球进入地球影子的哪个部分？'
            }
          }
        },
        /* 数据来源：子键与 teach-data.js 的 meta.sources[].key 同名 */
        src: {
          textbook_3_1: '同教材第93–94页：通过观察远去船只和月食地影，认识地球表面的弧度并推测地球是球体。',
          earth_size: '同教材第95页：地球两极稍扁、赤道略鼓；赤道半径约6378 km，两极方向半径约6357 km，赤道周长约4×10⁴ km。',
          earth_surface: '同教材第95页仅列出赤道周长约4×10⁴ km；本节不引用教材未列出的地球表面积数值。',
          eratosthenes: '同教材第95–96页“科学阅读”：塞尼城与亚历山大相距约800 km，正午太阳光夹角差为7.2°（圆周的1/50），据此估算地球周长约4×10⁴ km。',
          magellan: '同教材第93–94页：1519年麦哲伦船队出发，历时1082天完成首次环球航行；教材以此作为实践证据。',
          space_earth: '同教材第94页：20世纪人造地球卫星与载人航天器拍摄的照片确证地球是球体；1961年加加林成为首位在太空亲眼看到地球球体的人。',
          globe_model: '同教材第97–99页：地球仪是按比例缩小的地球模型；地轴是表示地球自转轴的假想轴，地轴与地球表面的交点为南、北极。',
          latlon_grid: '同教材第97–98页：赤道为0°纬线；纬线指示东西方向，纬度由赤道向南北两极增至90°；经线连接两极并指示南北方向。',
          solar_system: '同教材第104页：太阳、行星及其卫星，以及矮行星、小行星、彗星等小天体共同组成太阳系；太阳约占太阳系总质量的99.86%。',
          prime_meridian: '同教材第97–98页：通过英国伦敦格林尼治天文台的经线为0°经线，即本初子午线；向东、西各计至180°。',
          map_basic: '同教材第99–100页：地图是地球表面的平面模型；比例尺、方向和图例是地图的“语言”，比例尺有线段式、文字式和数字式。',
          bds: '本次教材核对范围为第93–104页，未涉及北斗卫星导航系统；该内容不作为本节教学文字的来源。',
          earth_rotation: '同教材图4.2-1：地球自转方向自西向东，周期约23小时56分4秒；昼夜交替约24小时；偏东先见日出产生地方时；北京在东八区，与格林尼治相差8小时。',
          earth_revolution: '同教材图4.2-6：公转方向自西向东，周期约365天；地轴与公转轨道面夹角66.5°，北端始终指向北极星；夏至直射北回归线（23.5°N）、冬至直射南回归线、春分秋分直射赤道。',
          solar_height: '同教材图4.2-14、图4.2-15：北纬30°地区正午太阳高度夏至日约83.5°、冬至日约36.5°；正午杆影夏季短、冬季长，同一天纬度不同影长不同。',
          day_night_length: '同教材图4.2-17：夏至日北半球昼长夜短，北极圈及以北极昼；冬至日昼短夜长，北极圈及以北极夜；春分秋分全球昼夜等长，赤道全年昼夜等长。',
          solar_terms: '同教材图4.2-18：二十四节气按地球在黄道上的位置划分，从春分点（黄经0°）每前进15°为一个节气，一年共24个节气。',
          moon_motion: '同教材图4.3-8：月球自转与公转周期相同，总以同一面朝向地球，地球上只能看到月球正面。',
          solar_eclipse: '同教材图4.3-10、图4.3-14：月球运行到地球与太阳之间、三者接近成一直线时挡住太阳光，形成日食；分日偏食、日环食、日全食三类。',
          lunar_eclipse: '同教材图4.3-17：月球进入地球本影而变暗，分月全食（全部进入本影）和月偏食（部分进入本影）；月食时月面呈古铜色。'
        }
      }
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

    comets: {
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
