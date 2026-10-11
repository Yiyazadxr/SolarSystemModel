/**
 * 教学模式主控（SOLAR.Teach）
 *
 * 职责：
 *   1. 自建教学 UI（左侧章节目录 / 顶部要点条 / 右下悬浮信息窗 / 底部控制条 / 入口按钮）
 *   2. 读 SOLAR.TEACH_DATA 生成「章 → 节 → 步骤」的课堂导览，逐步推进
 *   3. 把步骤的 state 交给 SOLAR.TeachScenes，并按 step.camera 摆相机
 *   4. 模式隔离：进入教学 → 锁定 HIGH 画质 + 关闭自动降级 + 隐藏真实太阳系与主 HUD；
 *      退出时逐项还原，不留副作用
 *
 * 约定：
 *   - 教学装置建在世界原点（与随银河公转的太阳系互不干扰），相机一律用世界坐标取景；
 *     若将来要取景真实太阳系，必须先减掉 SOLAR.Scene.getSolarBasis().position。
 *   - 键盘：→ / 空格 下一步，← 上一步，Esc 退出教学。
 *
 * 依赖：THREE、SOLAR.TEACH_DATA、SOLAR.TeachScenes、SOLAR.Scene、SOLAR.Controls、SOLAR.Galaxy、SOLAR.Audio、SOLAR.time。
 * 语法：ES5 + IIFE
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Teach = (function () {
  'use strict';

  var DEG = Math.PI / 180;

  var active = false;
  var built = false;
  var infoCollapsed = false;
  var data = null;

  /* 当前位置 */
  var stepIdx = 0;
  var curLesson = null, curStep = null;
  /* 节气条对地球仪直射点经度的临时覆盖：只在本步内生效，不写回课程数据本体 */
  var globeTermLon = null;

  var lastFrame = 0;
  var rafId = 0;

  /* 退出时要还原的状态 */
  var saved = { autoDegrade: true, quality: 'high', solarVisible: true, hudDisplay: '', playing: true, galaxyVisible: true, camPos: null, camTarget: null };

  /* 二分二至速查：节气名 → 阳历日期与太阳直射纬线（教材口径），供定点小浮窗使用 */
  var TERM_INFO = {
    '春分': { date: '3月21日前后', sub: '太阳直射赤道（0°）' },
    '夏至': { date: '6月22日前后', sub: '太阳直射北回归线（23.5°N）' },
    '秋分': { date: '9月23日前后', sub: '太阳直射赤道（0°）' },
    '冬至': { date: '12月22日前后', sub: '太阳直射南回归线（23.5°S）' }
  };

  /* DOM 引用 */
  var el = {};

  /* ============ 数据导航 ============ */

  function chapters() { return (data && data.chapters) || []; }
  function steps() { return (curLesson && curLesson.steps) || []; }

  function findLesson(id) {
    var chs = chapters();
    for (var i = 0; i < chs.length; i++) {
      /* 三层：章节 → section（教材的"节"）→ lesson（小节） */
      var secs = chs[i].sections || [];
      for (var j = 0; j < secs.length; j++) {
        var ls = secs[j].lessons || [];
        for (var k = 0; k < ls.length; k++) {
          if (ls[k].id === id) return ls[k];
        }
      }
    }
    return null;
  }

  /* ============ DOM 构建 ============ */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function buildDom() {
    var root = h('div', 'teach-root is-hidden');
    root.id = 'teach-root';

    /* 入口按钮：演示模式下也常驻（右下角） */
    /* 位置与层级交给 CSS（.teach-enter），避免内联样式与演示模式控件不一致 */
    var enter = h('button', 'teach-btn teach-enter', '教学模式');
    enter.id = 'teach-enter';
    enter.addEventListener('click', enterMode);
    root.appendChild(enter);
    el.enter = enter;

    /* 教学模式下右下角常驻「演示模式」返回按钮，与入口按钮同角互为镜像 */
    var toDemo = h('button', 'teach-btn teach-to-demo is-hidden', '演示模式');
    toDemo.id = 'teach-to-demo';
    toDemo.addEventListener('click', exitMode);
    root.appendChild(toDemo);
    el.toDemo = toDemo;

    /* 左侧目录 */
    var panel = h('aside', 'teach-panel is-hidden');
    panel.id = 'teach-panel';
    var head = h('div', 'teach-panel-head');
    /* 头部与演示模式一致：左侧小字标签 + 右侧 ‹ 折叠钮（退出走 Esc，不放常驻按钮） */
    head.appendChild(h('h2', 'teach-panel-title', '目录'));
    var toggle = h('button', 'teach-btn teach-icon teach-panel-toggle', '‹');
    toggle.id = 'teach-panel-toggle';
    toggle.addEventListener('click', function () { panel.classList.toggle('is-collapsed'); });
    head.appendChild(toggle);
    panel.appendChild(head);
    var toc = h('div', 'teach-toc');
    toc.id = 'teach-toc';
    panel.appendChild(toc);
    root.appendChild(panel);
    el.panel = panel;
    el.toc = toc;

    /* 顶部标题：与演示模式品牌区同款结构——主标题「教学模式」+ 副标题 */
    var top = h('div', 'teach-topbar is-hidden');
    top.id = 'teach-topbar';
    var brand = h('div', 'teach-brand');
    brand.appendChild(h('h1', 'teach-brand-title', '教学模式'));
    brand.appendChild(h('p', 'teach-brand-sub', '三维互动演示 · 步骤讲解教学'));
    top.appendChild(brand);
    root.appendChild(top);
    el.topbar = top;

    /* 右下悬浮信息窗 */
    var info = h('div', 'teach-info is-hidden');
    info.id = 'teach-info';
    var ihead = h('div', 'teach-info-head');
    var ititle = h('span', 'teach-info-title');
    ititle.id = 'teach-step-title';
    var itog = h('button', 'teach-btn teach-icon', '—');
    itog.id = 'teach-info-toggle';
    itog.type = 'button';
    itog.title = '隐藏信息';
    itog.addEventListener('click', function () { infoCollapsed = true; updateInfoVisibility(); });
    ihead.appendChild(ititle);
    ihead.appendChild(itog);
    var text = h('p', 'teach-text');
    text.id = 'teach-text';
    var ask = h('div', 'teach-ask is-hidden');
    ask.id = 'teach-ask';
    var src = h('div', 'teach-src');
    src.id = 'teach-src';
    /* 二分二至定位条（教材图4.2-6 的交互版）：挂在信息窗底部，
       仅 step.termBar 的步骤显示；点击把地球移到对应轨道位置并暂停公转。 */
    var termBar = h('div', 'teach-term-bar is-hidden');
    termBar.id = 'teach-term-bar';
    var TERMS4 = [['春分', '3月21日前后'], ['夏至', '6月22日前后'], ['秋分', '9月23日前后'], ['冬至', '12月22日前后']];
    for (var ti = 0; ti < TERMS4.length; ti++) {
      (function (nm, dateTip) {
        var b = h('button', 'teach-term-btn', nm);
        b.type = 'button';
        b.title = nm + '（' + dateTip + '）';
        b.setAttribute('data-term', nm);
        b.addEventListener('click', function () { gotoTerm(nm); });
        termBar.appendChild(b);
      })(TERMS4[ti][0], TERMS4[ti][1]);
    }
    /* 平地装置的轨迹选择钮：春秋分共用一条轨迹，合并为一个按钮（排在夏至与冬至之间） */
    var eqBtn = h('button', 'teach-term-btn', '春分 / 秋分');
    eqBtn.type = 'button';
    eqBtn.title = '春分 / 秋分（3月21日 / 9月23日前后）';
    eqBtn.setAttribute('data-term', '春秋分');
    eqBtn.addEventListener('click', function () { gotoTerm('春秋分'); });
    termBar.appendChild(eqBtn);
    /* 节气信息小浮窗：点定位按钮后浮在定位条上方，切步/复位/退出时收起。
       纯展示——不进 pointer-events 白名单，不挡相机拖拽。 */
    var termTip = h('div', 'teach-term-tip is-hidden');
    termTip.id = 'teach-term-tip';
    var termTipTitle = h('div', 'teach-term-tip-title');
    var termTipSub = h('div', 'teach-term-tip-sub');
    termTip.appendChild(termTipTitle);
    termTip.appendChild(termTipSub);
    /* 「去演示模式」提示面板：太阳系章节用它把学生引去完整的演示模式
       （教学装置只有地球仪/日地月，完整太阳系在演示模式里） */
    var demoTip = h('div', 'teach-tip is-hidden');
    demoTip.id = 'teach-goto-demo';
    var demoTipText = h('span', 'teach-tip-text');
    var demoBtn = h('button', 'teach-btn', '切换演示模式');
    demoBtn.addEventListener('click', function () { exitMode(); });
    demoBtn.style.marginLeft = 'auto';
    demoTip.appendChild(demoTipText);
    demoTip.appendChild(demoBtn);
    info.appendChild(ihead);
    info.appendChild(text);
    info.appendChild(ask);
    info.appendChild(src);
    root.appendChild(demoTip);   // 独立于 info：solo 步骤时 info 隐藏、tip 单独居中显示
    root.appendChild(info);
    /* 定位条独立于信息窗：正文长短不影响它，且信息窗收起后仍可用 */
    root.appendChild(termBar);
    root.appendChild(termTip);
    var infoOpen = h('button', 'teach-btn teach-icon teach-info-open is-hidden', '+');
    infoOpen.id = 'teach-info-open';
    infoOpen.type = 'button';
    infoOpen.title = '展开信息';
    infoOpen.setAttribute('aria-label', '展开信息面板');
    infoOpen.addEventListener('click', function () { infoCollapsed = false; updateInfoVisibility(); });
    root.appendChild(infoOpen);
    el.info = info;
    el.infoOpen = infoOpen;
    el.stepTitle = ititle;
    el.text = text;
    el.ask = ask;
    el.src = src;
    el.termBar = termBar;
    el.termTip = termTip;
    el.termTipTitle = termTipTitle;
    el.termTipSub = termTipSub;
    el.demoTip = demoTip;
    el.demoTipText = demoTipText;

    /* 底部控制条 */
    var bar = h('div', 'teach-bar is-hidden');
    bar.id = 'teach-bar';
    var prev = h('button', 'teach-btn', '上一步'); prev.id = 'teach-prev';
    var play = h('button', 'teach-btn', '播放'); play.id = 'teach-play';
    var next = h('button', 'teach-btn', '下一步'); next.id = 'teach-next';
    prev.addEventListener('click', function () { gotoStepIndex(stepIdx - 1); });
    next.addEventListener('click', function () { gotoStepIndex(stepIdx + 1); });
    play.addEventListener('click', togglePlay);

    var field = h('label', 'teach-field');
    field.appendChild(h('span', null, '速度'));
    var speedValue = h('span', 'teach-speed-value', '1×');
    var range = h('input', 'teach-range');
    range.id = 'teach-speed';
    range.type = 'range';
    range.min = '0'; range.max = '7'; range.step = '1'; range.value = '2';
    /* 离散档位，与演示模式速度滑块一致；档位映射为教学动画倍率 */
    range.addEventListener('input', function () {
      var i = parseInt(range.value, 10);
      var speeds = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
      var idx = isNaN(i) ? 2 : Math.max(0, Math.min(speeds.length - 1, i));
      speedValue.textContent = speeds[idx] + '×';
      setAnimSpeed(speeds[idx]);
    });
    field.appendChild(range);
    field.appendChild(speedValue);

    /* 「真实比例 / 示意比例」分段已移除：教学装置统一使用示意比例
       （各步骤 state.scale 均为 'iconic'，teach-scenes 默认档同为 iconic）。 */

    var reset = h('button', 'teach-btn', '复位'); reset.id = 'teach-reset';
    reset.addEventListener('click', resetStep);
    var prog = h('span', 'teach-progress'); prog.id = 'teach-progress';

    var grpLeft = h('div', 'teach-bar-group');
    grpLeft.appendChild(prev);
    grpLeft.appendChild(play);
    grpLeft.appendChild(next);

    var grpMid = h('div', 'teach-bar-group');
    grpMid.appendChild(field);

    var grpRight = h('div', 'teach-bar-group');
    grpRight.appendChild(reset);
    grpRight.appendChild(prog);

    bar.appendChild(grpLeft);
    bar.appendChild(grpMid);
    bar.appendChild(grpRight);
    root.appendChild(bar);
    el.bar = bar;
    el.prev = prev;
    el.next = next;
    el.play = play;
    el.speed = range;
    el.speedValue = speedValue;
    el.progress = prog;

    document.body.appendChild(root);
    el.root = root;
  }

  function buildToc() {
    el.toc.innerHTML = '';
    var chs = chapters();
    for (var i = 0; i < chs.length; i++) {
      var ch = chs[i];
      var chNode = h('div', 'teach-chapter');
      var secs = ch.sections || [];
      for (var j = 0; j < secs.length; j++) {
        /* 教材的"节"（认识地球 / 太阳系的组成与结构）：目录里的最高分组标题 */
        chNode.appendChild(h('div', 'teach-chapter-title', secs[j].title));
        var ls = secs[j].lessons || [];
        for (var m = 0; m < ls.length; m++) {
          (function (lsn) {
            var lNode = h('div', 'teach-lesson');
            var lt = h('div', 'teach-lesson-title', lsn.title);
            lt.setAttribute('data-lesson-id', lsn.id);
            lt.addEventListener('click', function () { gotoLesson(lsn.id); });
            lNode.appendChild(lt);
            var stNode = h('div', 'teach-steps');
            var ss = lsn.steps || [];
            for (var k = 0; k < ss.length; k++) {
              (function (ki, st) {
                var s = h('div', 'teach-step', st.title);
                s.setAttribute('data-step-id', st.id);
                s.addEventListener('click', function () {
                  gotoLesson(lsn.id);
                  gotoStepIndex(ki);
                });
                stNode.appendChild(s);
              })(k, ss[k]);
            }
            lNode.appendChild(stNode);
            chNode.appendChild(lNode);
          })(ls[m]);
        }
      }
      el.toc.appendChild(chNode);
    }
  }

  function refreshTocActive() {
    var nodes = el.toc.querySelectorAll('.teach-step');
    var id = curStep ? curStep.id : null;
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].getAttribute('data-step-id') === id;
      nodes[i].classList.toggle('is-active', on);
    }
    var lts = el.toc.querySelectorAll('.teach-lesson-title');
    for (var j = 0; j < lts.length; j++) {
      lts[j].classList.toggle('is-active', !!curLesson && lts[j].getAttribute('data-lesson-id') === curLesson.id);
    }
  }

  /* ============ 步骤应用 ============ */

  function updateInfoVisibility() {
    var solo = !!(curStep && curStep.soloTip);
    el.info.classList.toggle('is-hidden', !active || solo || infoCollapsed);
    el.infoOpen.classList.toggle('is-hidden', !active || solo || !infoCollapsed);
  }

  function applyStep(step, keepCamera) {
    if (!step) return;
    curStep = step;
    /* 切步 / 复位 / 进入课程都清掉节气条覆盖，恢复步骤作者的 sunLonDeg */
    globeTermLon = null;

    if (SOLAR.TeachScenes) SOLAR.TeachScenes.applyState(stepState());

    el.stepTitle.textContent = step.title;
    el.text.textContent = step.text || '';

    if (step.ask) {
      el.ask.textContent = '思考与讨论：' + step.ask;
      el.ask.classList.remove('is-hidden');
    } else {
      el.ask.classList.add('is-hidden');
    }

    var srcText = '';
    if (step.src && data && data.meta && data.meta.sources) {
      for (var i = 0; i < data.meta.sources.length; i++) {
        if (data.meta.sources[i].key === step.src) { srcText = '数据来源：' + data.meta.sources[i].text; break; }
      }
    }
    el.src.textContent = srcText;

    /* 太阳系章节（soloTip）：隐藏常规信息面板，屏幕中间只留引导小面板；
       普通章节：小面板隐藏，一切照旧 */
    var solo = !!step.soloTip;
    updateInfoVisibility();
    if (el.demoTip) {
      el.demoTip.classList.toggle('teach-solo-tip', solo);
      if (step.gotoDemo) {
        el.demoTipText.textContent = step.gotoDemo;
        el.demoTip.classList.remove('is-hidden');
      } else {
        el.demoTip.classList.add('is-hidden');
      }
    }

    el.progress.textContent = (stepIdx + 1) + ' / ' + steps().length;
    el.prev.disabled = stepIdx === 0;
    el.next.disabled = stepIdx === steps().length - 1;
    /* 二分二至定位条：仅 step.termBar 的步骤显示；切步/复位时清掉残留高亮与浮窗。
       termBar === 'tracks' 时只留三个「选轨迹」钮（夏至 / 春秋分 / 冬至），
       用于平地装置选太阳周日视运动轨迹。 */
    if (el.termBar) {
      markTermActive(null);
      el.termBar.classList.toggle('is-hidden', !step.termBar);
      var tracksMode = step.termBar === 'tracks';
      var btns = el.termBar.children;
      for (var bi = 0; bi < btns.length; bi++) {
        var nm = btns[bi].getAttribute('data-term');
        var show = tracksMode ? (nm === '夏至' || nm === '春秋分' || nm === '冬至')
                              : (nm !== '春秋分');
        btns[bi].classList.toggle('is-hidden', !show);
      }
    }
    if (el.termTip) el.termTip.classList.add('is-hidden');
    refreshTocActive();
    if (!keepCamera && !(step.keepCamera || (step.state && step.state.keepCamera))) moveCamera(step);
  }

  function gotoStepIndex(idx, keepCamera) {
    var ss = steps();
    if (!ss.length) return;
    /* 边界处不重复应用步骤，否则动画会被意外重置。 */
    if (idx < 0 || idx >= ss.length) return;
    if (idx === stepIdx && !keepCamera) return;
    stepIdx = idx;
    setPlaying(true);
    applyStep(ss[idx], keepCamera);
    if (SOLAR.TeachScenes && SOLAR.TeachScenes.resetMotion) SOLAR.TeachScenes.resetMotion();
  }

  function gotoLesson(id) {
    var l = findLesson(id);
    if (!l) return;
    curLesson = l;
    stepIdx = 0;
    setPlaying(true);
    applyStep(l.steps ? l.steps[0] : null);
    if (SOLAR.TeachScenes && SOLAR.TeachScenes.resetMotion) SOLAR.TeachScenes.resetMotion();
  }

  /* ============ 相机 ============ */

  /* 取景距离表，单位是「地球半径的倍数」（教学上最直观的口径）。
     真实比例下天体间距极大——地月距离 60.3 地球半径、日地距离 23481 地球半径——
     所以两档必须分别给距离，不能共用一套数值：
       globe  细看地球本体
       moon   看地月系全貌：真实档需拉到 150 地球半径才看得清月相轮廓
              （6 地球半径处月亮的视直径只有 0.5°，真实但讲不清"月相成因"）
       orrery 看太阳—地球—地球卫星的相对关系
     step.camera 仅覆盖明确指定的参数，其余取此表的默认值。 */
  var CAM_PRESET = {
    globe: { real: 3.6, iconic: 3.6, polar: 16, azim: 0 },
    moon: { real: 150, iconic: 7.0, polar: 12, azim: 0 },
    orrery: { real: 320, iconic: 15, polar: 16, azim: 28 },
    /* 平地装置：太阳轨迹在南半天（z>0），相机站在北侧偏上向南看，
       三条轨迹弧、立杆与杆影同框 */
    ground: { real: 19, iconic: 19, polar: 18, azim: 270 }
  };

  /* 地球仪装置在示意档会把整个 root 放大 1.6 倍，距离需同步换算 */
  function globeScale() {
    return (SOLAR.TeachScenes && SOLAR.TeachScenes.getScale() === 'iconic') ? 1.6 : 1.0;
  }

  function rigFocus(rig) {
    var v = new THREE.Vector3(0, 0, 0);
    if (rig === 'moon' && SOLAR.TeachOrrery) {
      var p = SOLAR.TeachOrrery.getWorldPosition('earth');
      if (p) v.copy(p);
    } else if (rig === 'orrery' && SOLAR.TeachOrrery) {
      var p2 = SOLAR.TeachOrrery.getWorldPosition('earth');
      if (p2) v.copy(p2);
    }
    /* ground：观察点即装置原点，默认 (0,0,0) */
    return v;
  }

  /* 相机：必须走 Controls 自己的 goToView（内部 startFlight 负责补间，
     且 trackSystem=false 不会跟着银河系位移漂移）。
     直接改 camera.position 会在下一帧被 controls 的内部状态重建覆盖——已经踩过。 */
  function moveCamera(step) {
    if (!SOLAR.Controls || typeof SOLAR.Controls.goToView !== 'function') return;

    var rig = (step.state && step.state.rig) || null;
    var preset = CAM_PRESET[rig] || CAM_PRESET.globe;
    var scale = (SOLAR.TeachScenes && SOLAR.TeachScenes.getScale()) === 'iconic' ? 'iconic' : 'real';
    var dist = preset[scale] * (rig === 'globe' ? globeScale() : 1);
    var polar = preset.polar * DEG;
    var azim = preset.azim * DEG;

    /* 个别步骤需要特定机位时，只覆盖明确给出的极角、方位角或距离。 */
    var co = step.camera || null;
    if (co) {
      if (typeof co.polar === 'number') polar = co.polar * DEG;
      if (typeof co.azim === 'number') azim = co.azim * DEG;
      if (typeof co.dist === 'number') dist = co.dist * (rig === 'globe' ? globeScale() : 1);
    }
    var focus = rigFocus(rig);
    /* 全景机位（教材图4.2-6 式）：focus:'sun' 时注视太阳（装置原点），
       默认注视地球——orbit 全貌需要以太阳为中心取景 */
    if (co && co.focus === 'sun' && SOLAR.TeachOrrery && typeof SOLAR.TeachOrrery.getWorldPosition === 'function') {
      var sunF = SOLAR.TeachOrrery.getWorldPosition('sun');
      if (sunF) focus.copy(sunF);
    }
    var shapeSc = (step.state && step.state.params) ? step.state.params.shapeScene : null;
    if ((shapeSc === 'eclipse' || shapeSc === 'solareclipse') && SOLAR.TeachGlobe) {
      var eclipseFocus = SOLAR.TeachGlobe.getWorldPosition('moon');
      if (eclipseFocus) focus.copy(eclipseFocus);
      /* 相机放到月面朝地一侧的正对方向：视线沿「月球→地心」，地影
         （锚定在朝地点）就落在月盘正中扫过。此前机位固定为 polar/azim
         常量，视线与朝地方向不共线，阴影被投到月盘下缘。
         日食（solareclipse）取同一公式：相机在遮挡月盘的地心侧，
         视线依次穿过月盘、日盘——遮挡关系与真实日食一致。
         用世界位置实时计算，不受装置层级与倾斜影响。 */
      var earthP = SOLAR.TeachGlobe.getWorldPosition('earth');
      if (earthP) {
        var nE = earthP.sub(focus).normalize();
        var toE = focus.clone().addScaledVector(nE, dist);
        SOLAR.Controls.goToView(toE, focus);
        return;
      }
    }

    /* 地月系：站在地球背阳侧看向地月系，太阳在画面远处、月面明暗朝向太阳——
       这正是讲月相成因与月相观测的标准视角。 */
    if (rig === 'moon' && SOLAR.TeachOrrery) {
      var earth = focus.clone();
      var sun = SOLAR.TeachOrrery.getWorldPosition('sun');
      if (sun) {
        var back = earth.clone().sub(sun).normalize();
        var to = earth.clone().addScaledVector(back, dist);
        to.y += dist * Math.sin(polar);
        SOLAR.Controls.goToView(to, earth);
        return;
      }
    }

    var y = dist * Math.sin(polar);
    var r = dist * Math.cos(polar);
    var to2 = new THREE.Vector3(focus.x + r * Math.cos(azim), focus.y + y, focus.z + r * Math.sin(azim));
    SOLAR.Controls.goToView(to2, focus);
  }

  /* 节气定点后的近景：站到地球向阳侧（地球→太阳方向正对镜头，直射点居中），
     抬离黄道面约 19°，晨昏线与地轴倾斜同框可见。距离单位仍是地球半径。 */
  function flyToTermEarth() {
    if (!(SOLAR.TeachOrrery && SOLAR.Controls && typeof SOLAR.Controls.goToView === 'function')) return;
    var e = SOLAR.TeachOrrery.getWorldPosition('earth');
    var s = SOLAR.TeachOrrery.getWorldPosition('sun');
    if (!e || !s) return;
    var dir = s.clone().sub(e).normalize();
    var d = 10;
    var to = e.clone().addScaledVector(dir, d);
    to.y += d * 0.35;
    SOLAR.Controls.goToView(to, e);
  }

  /* ============ 播放 / 速度 / 比例 ============ */

  var playing = false;
  var speed = 1;

  function currentAnim() {
    var st = curStep ? (curStep.state || {}) : {};
    var a = st.anim || {};
    var hasMotion = !!(a.spin || a.revolve || (st.params && (st.params.voyage || st.params.shapeScene === 'horizon')));
    return {
      /* 显式 spin:false = 该步骤要求静止（如经纬网演示，自转会让经线
         与度数标注错位）；未写 spin 字段的无预设运动地球仪仍可手动播放自转。 */
      spin: playing && (a.spin === true || (a.spin !== false && !hasMotion && st.rig === 'globe')),
      revolve: playing && !!a.revolve,
      playing: playing,
      speed: speed * (typeof a.speed === 'number' ? a.speed : 1)
    };
  }

  function stepState() {
    var st = curStep.state || {};
    var params = st.params || {};
    /* 节气条只在 globe 上覆盖直射点经度：用副本叠加，不污染课程数据本体，
       切步 / 复位后覆盖失效，自动回到步骤作者写的值 */
    if (globeTermLon !== null && st.rig === 'globe') {
      var merged = {}, k;
      for (k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) merged[k] = params[k];
      }
      merged.sunLonDeg = globeTermLon;
      params = merged;
    }
    return {
      rig: st.rig || null,
      scale: st.scale || 'iconic',
      anim: currentAnim(),
      params: params
    };
  }

  function pushAnim() {
    if (SOLAR.TeachScenes && curStep) SOLAR.TeachScenes.applyState(stepState());
  }

  function setPlaying(on) {
    playing = !!on;
    el.play.textContent = playing ? '暂停' : '播放';
  }

  function togglePlay() {
    setPlaying(!playing);
    pushAnim();
  }

  function setAnimSpeed(v) {
    speed = (typeof v === 'number' && isFinite(v)) ? v : 1;
    pushAnim();
  }

  function resetStep() {
    if (!active || !curStep) return;
    setPlaying(true);
    speed = 1;
    el.speed.value = '2';
    el.speedValue.textContent = '1×';
    if (SOLAR.TeachScenes && SOLAR.TeachScenes.resetMotion) SOLAR.TeachScenes.resetMotion();
    applyStep(curStep);
  }

  /* ============ 二分二至定点 ============ */

  function markTermActive(name) {
    if (!el.termBar) return;
    var btns = el.termBar.children;
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute('data-term') === name);
    }
  }

  /* 把地球移到指定二分二至位置并暂停：定点后地球不再漂移，教师可从容指认
     直射点与晨昏线；底部播放键可从该位置继续公转。
     同时把视角移近地球向阳侧（直射点正对镜头），并弹出节气小浮窗。
     ground 装置：按钮只是「选轨迹」——切换太阳周日视运动弧后继续播放，
     不暂停、不弹节气浮窗、不移相机。'春秋分' 合并为赤纬 0（取春分）。 */
  function gotoTerm(name) {
    if (!active) return;
    var rig = curStep && curStep.state && curStep.state.rig;
    if (rig === 'ground') {
      if (!(SOLAR.TeachGround && typeof SOLAR.TeachGround.goToTerm === 'function')) return;
      if (!SOLAR.TeachGround.goToTerm(name === '春秋分' ? '春分' : name)) return;
      markTermActive(name);
      if (SOLAR.Audio && typeof SOLAR.Audio.play === 'function') SOLAR.Audio.play('toggle');
      return;
    }
    /* 地球仪装置：节气 = 直射点黄经（春分0/夏至90/秋分180/冬至270）。
       只切换直射位置并弹浮窗，保持自转播放——正好观察「北极圈始终
       在昼半球（极昼）/始终在夜半球（极夜）」。不移相机。 */
    if (rig === 'globe') {
      var TERM_LON = { '春分': 0, '夏至': 90, '秋分': 180, '冬至': 270 };
      if (TERM_LON[name] === undefined) return;
      globeTermLon = TERM_LON[name];
      pushAnim();
      markTermActive(name);
      showTermTip(name);
      if (SOLAR.Audio && typeof SOLAR.Audio.play === 'function') SOLAR.Audio.play('toggle');
      return;
    }
    if (!(SOLAR.TeachOrrery && typeof SOLAR.TeachOrrery.goToTerm === 'function')) return;
    if (!SOLAR.TeachOrrery.goToTerm(name)) return;
    setPlaying(false);
    pushAnim();
    markTermActive(name);
    showTermTip(name);
    flyToTermEarth();
    if (SOLAR.Audio && typeof SOLAR.Audio.play === 'function') SOLAR.Audio.play('toggle');
  }

  function showTermTip(name) {
    if (!el.termTip) return;
    var info = TERM_INFO[name];
    if (!info) { el.termTip.classList.add('is-hidden'); return; }
    el.termTipTitle.textContent = name + ' · ' + info.date;
    el.termTipSub.textContent = info.sub;
    el.termTip.classList.remove('is-hidden');
  }

  /* ============ 模式进出 ============ */

  function enterMode() {
    if (active) return;
    if (!data) return;
    if (SOLAR.Audio && typeof SOLAR.Audio.play === 'function') SOLAR.Audio.play('mode');
    if (SOLAR.TeachScenes && !SOLAR.TeachScenes.isReady()) {
      var scn = (SOLAR.Scene && SOLAR.Scene.getSystemRoot) ? SOLAR.Scene.getSystemRoot().parent : null;
      if (scn && !SOLAR.TeachScenes.init(scn)) return;
    }
    active = true;

    /* 保存并锁定：画质稳定是课堂演示的前提 */
    saved.autoDegrade = (typeof SOLAR.isAutoDegrade === 'function') ? SOLAR.isAutoDegrade() : true;
    saved.quality = (SOLAR.Scene && SOLAR.Scene.getQuality) ? SOLAR.Scene.getQuality() : 'high';
    saved.camPos = null;
    saved.camTarget = null;
    if (SOLAR.Controls && typeof SOLAR.Controls.getControls === 'function') {
      var entryControls = SOLAR.Controls.getControls();
      if (entryControls && entryControls.object && entryControls.object.position && entryControls.target) {
        saved.camPos = entryControls.object.position.clone();
        saved.camTarget = entryControls.target.clone();
      }
    }
    if (typeof SOLAR.setAutoDegrade === 'function') SOLAR.setAutoDegrade(false);
    if (typeof SOLAR.setManualQuality === 'function') SOLAR.setManualQuality('high');

    /* 冻结演示模式的时间系统（含银河公转）：公转每秒会把相机拖动约 29 个场景单位，
       任何固定于世界原点的教学装置都会被推出视野；讲课也不需要行星自己乱跑。
       教学内的时间流速由底部控制条独立控制（anim.speed），与此互不影响。 */
    saved.playing = SOLAR.time ? !!SOLAR.time.playing : true;
    if (SOLAR.time) SOLAR.time.playing = false;

    /* 隐藏真实太阳系与演示模式 HUD，避免两套内容同屏打架 */
    if (SOLAR.Scene && SOLAR.Scene.setSolarSystemVisible) {
      saved.solarVisible = SOLAR.Scene.isSolarSystemVisible ? SOLAR.Scene.isSolarSystemVisible() : true;
      SOLAR.Scene.setSolarSystemVisible(false);
    }
    if (SOLAR.Galaxy && SOLAR.Galaxy.setVisible) {
      saved.galaxyVisible = SOLAR.Galaxy.isVisible ? SOLAR.Galaxy.isVisible() : true;
      SOLAR.Galaxy.setVisible(false);
    }
    var hud = document.getElementById('hud');
    if (hud) { saved.hudDisplay = hud.style.display; hud.style.display = 'none'; }
    if (SOLAR.Controls && SOLAR.Controls.setFollow) { try { SOLAR.Controls.setFollow(null); } catch (e) { } }
    if (SOLAR.Controls && SOLAR.Controls.setCruise) { try { SOLAR.Controls.setCruise(false); } catch (e) { } }

    el.root.classList.remove('is-hidden');
    el.enter.classList.add('is-hidden');
    if (el.toDemo) el.toDemo.classList.remove('is-hidden');
    /* 无论从哪条路径进入（模式选择卡片 / 右下角入口），都把"选择模式"层收起，
       否则从右下角进入时它会一直盖在教学画面上。 */
    var layer = document.getElementById('mode-layer');
    if (layer) { layer.hidden = true; layer.style.display = 'none'; }
    ['panel', 'topbar', 'bar'].forEach(function (k) {
      if (el[k]) el[k].classList.remove('is-hidden');
    });

    infoCollapsed = false;
    setPlaying(true);
    speed = 1;
    el.speed.value = '2';
    el.speedValue.textContent = '1×';
    gotoLesson(data.chapters[0].sections[0].lessons[0].id);
    startLoop();
  }

  function exitMode() {
    if (!active) return;
    active = false;
    stopLoop();
    if (SOLAR.Audio && typeof SOLAR.Audio.play === 'function') SOLAR.Audio.play('mode');

    if (SOLAR.TeachScenes) SOLAR.TeachScenes.hide();
    if (SOLAR.Scene && SOLAR.Scene.setSolarSystemVisible) SOLAR.Scene.setSolarSystemVisible(saved.solarVisible !== false);
    if (SOLAR.Galaxy && SOLAR.Galaxy.setVisible) SOLAR.Galaxy.setVisible(saved.galaxyVisible !== false);
    if (SOLAR.Controls && typeof SOLAR.Controls.cancelFlight === 'function') SOLAR.Controls.cancelFlight();
    var hud = document.getElementById('hud');
    if (hud) hud.style.display = saved.hudDisplay;
    if (typeof SOLAR.setAutoDegrade === 'function') SOLAR.setAutoDegrade(saved.autoDegrade);
    if (typeof SOLAR.setManualQuality === 'function') SOLAR.setManualQuality(saved.quality);
    if (SOLAR.time) SOLAR.time.playing = saved.playing;
    if (saved.camPos && saved.camTarget && SOLAR.Controls && typeof SOLAR.Controls.getControls === 'function') {
      var exitControls = SOLAR.Controls.getControls();
      if (exitControls && exitControls.object && exitControls.object.position && exitControls.target) {
        exitControls.object.position.copy(saved.camPos);
        exitControls.target.copy(saved.camTarget);
        if (typeof exitControls.update === 'function') exitControls.update();
      }
    }

    ['panel', 'topbar', 'info', 'infoOpen', 'bar', 'demoTip', 'termBar', 'termTip'].forEach(function (k) {
      if (el[k]) el[k].classList.add('is-hidden');
    });
    if (el.toDemo) el.toDemo.classList.add('is-hidden');
    el.enter.classList.remove('is-hidden');
  }

  /* ============ 每帧 ============ */

  function loop(ts) {
    rafId = window.requestAnimationFrame(loop);
    var dt = lastFrame ? Math.min(100, ts - lastFrame) : 16;
    lastFrame = ts;
    if (!active) return;
    if (SOLAR.TeachScenes) SOLAR.TeachScenes.update(dt / 1000);
  }

  function startLoop() {
    if (rafId) return;
    lastFrame = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
  }

  /* ============ 键盘 ============ */

  function onKey(e) {
    if (!active) return;
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Spacebar') {
      gotoStepIndex(stepIdx + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      gotoStepIndex(stepIdx - 1);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      exitMode();
    }
  }

  /* ============ 对外 ============ */

  /* 演示模式下显示右下角「教学模式」入口；仅切换可见性，不动教学状态。 */
  function showEntry() {
    if (active || !built) return false;
    el.root.classList.remove('is-hidden');
    el.enter.classList.remove('is-hidden');
    if (el.toDemo) el.toDemo.classList.add('is-hidden');
    return true;
  }

  /* 沉浸模式（演示模式隐藏 HUD）只留画面，右下角「教学模式」入口也要收起。
     #teach-root 在 #hud 之外，不吃 #hud.immersive 的 opacity，只能显式切。
     与 showEntry 的分工：showEntry 管"进演示模式时把入口放出来"，
     这里只管 enter 按钮自身的显隐，教学进行中一律不干预（返回钮归 exitMode）。 */
  function setEntryVisible(on) {
    if (!built || active) return false;
    el.enter.classList.toggle('is-hidden', !on);
    return true;
  }

  return {
    init: function () {
      if (built) return true;
      if (!window.THREE || !SOLAR.TEACH_DATA) return false;
      data = SOLAR.TEACH_DATA;
      buildDom();
      buildToc();
      window.addEventListener('keydown', onKey);
      built = true;

      /* 装置初始化需要 scene：等主场景就绪后再建 */
      var scn = (SOLAR.Scene && SOLAR.Scene.getSystemRoot) ? SOLAR.Scene.getSystemRoot().parent : null;
      if (scn && SOLAR.TeachScenes) SOLAR.TeachScenes.init(scn);
      return true;
    },

    enter: enterMode,
    exit: exitMode,
    showEntry: showEntry,
    setEntryVisible: setEntryVisible,
    isActive: function () { return active; },
    gotoLesson: gotoLesson,
    gotoStep: function (id) {
      var ss = steps();
      for (var i = 0; i < ss.length; i++) {
        if (ss[i].id === id) { gotoStepIndex(i); return true; }
      }
      return false;
    },
    next: function () { gotoStepIndex(stepIdx + 1); },
    prev: function () { gotoStepIndex(stepIdx - 1); },
    getLesson: function () { return curLesson; },
    getStep: function () { return curStep; }
  };
})();
