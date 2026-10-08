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
 * 依赖：THREE、SOLAR.CONFIG、SOLAR.TEACH_DATA、SOLAR.TeachScenes、SOLAR.Scene、SOLAR.Controls。
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
  var chapterIdx = 0, lessonIdx = 0, stepIdx = 0;
  var curLesson = null, curStep = null;

  var lastFrame = 0;
  var rafId = 0;

  /* 退出时要还原的状态 */
  var saved = { autoDegrade: true, quality: 'high', solarVisible: true, hudDisplay: '', playing: true, galaxyVisible: true, camPos: null, camTarget: null };

  /* DOM 引用 */
  var el = {};

  /* ============ 数据导航 ============ */

  function chapters() { return (data && data.chapters) || []; }
  function lesson() {
    var ch = chapters()[chapterIdx];
    return (ch && ch.lessons) ? ch.lessons[lessonIdx] : null;
  }
  function steps() { return (curLesson && curLesson.steps) || []; }

  function findLesson(id) {
    var chs = chapters();
    for (var i = 0; i < chs.length; i++) {
      /* 三层：章节 → section（教材的"节"）→ lesson（小节） */
      var secs = chs[i].sections || [];
      for (var j = 0; j < secs.length; j++) {
        var ls = secs[j].lessons || [];
        for (var k = 0; k < ls.length; k++) {
          if (ls[k].id === id) { chapterIdx = i; lessonIdx = k; return ls[k]; }
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

    var seg = h('div', 'teach-seg');
    seg.id = 'teach-scale-seg';
    /* 初始不高亮任何一档：进入教学后 applyStep 会按当前步骤的实际
       state.scale 同步高亮（教学步骤默认示意比例）。 */
    var segReal = h('button', 'teach-seg-btn', '真实比例');
    segReal.setAttribute('data-scale', 'real');
    var segIconic = h('button', 'teach-seg-btn', '示意比例');
    segIconic.setAttribute('data-scale', 'iconic');
    segReal.addEventListener('click', function () { setScale('real'); });
    segIconic.addEventListener('click', function () { setScale('iconic'); });
    seg.appendChild(segReal);
    seg.appendChild(segIconic);

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
    grpRight.appendChild(seg);
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
    el.segReal = segReal;
    el.segIconic = segIconic;
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
          (function (ci, li, lsn) {
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
          })(i, m, ls[m]);
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

    if (SOLAR.TeachScenes) SOLAR.TeachScenes.applyState(stepState());

    /* 分段按钮高亮跟随本步骤实际生效的比例档：applyState 直接改内部 scale、
       不走 setScale（那里才更新按钮），必须在这里补同步，否则按钮与画面不一致。 */
    var stepScale = scaleOverride || (step.state && step.state.scale) ||
      (SOLAR.TeachScenes && SOLAR.TeachScenes.getScale ? SOLAR.TeachScenes.getScale() : 'iconic');
    if (el.segReal && el.segIconic) {
      el.segReal.classList.toggle('is-active', stepScale === 'real');
      el.segIconic.classList.toggle('is-active', stepScale === 'iconic');
    }

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
     教学数据里的 step.camera 只作参考，不再采用：那批数值是在旧错误比例下生成的。 */
  var CAM_PRESET = {
    globe: { real: 3.6, iconic: 3.6, polar: 16, azim: 0 },
    moon: { real: 150, iconic: 7.0, polar: 12, azim: 0 },
    orrery: { real: 320, iconic: 15, polar: 16, azim: 28 }
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

    /* 个别步骤需要特定机位（如埃拉托色尼示意要正对埃及），可显式覆盖极角/方位角/距离倍数。
       支持写在 step.cameraOverride，也兼容 step.state.cameraOverride。 */
    var co = step.cameraOverride || (step.state && step.state.cameraOverride) || step.camera || (step.state && step.state.camera) || null;
    if (co) {
      if (typeof co.polar === 'number') polar = co.polar * DEG;
      if (typeof co.azim === 'number') azim = co.azim * DEG;
      if (typeof co.dist === 'number') dist = co.dist * (rig === 'globe' ? globeScale() : 1);
    }
    var focus = rigFocus(rig);
    if (step.state && step.state.params && step.state.params.shapeScene === 'eclipse' && SOLAR.TeachGlobe) {
      var eclipseFocus = SOLAR.TeachGlobe.getWorldPosition('moon');
      if (eclipseFocus) focus.copy(eclipseFocus);
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

  /* ============ 播放 / 速度 / 比例 ============ */

  var playing = false;
  var speed = 1;
  var scaleOverride = null;

  function currentAnim() {
    var st = curStep ? (curStep.state || {}) : {};
    var a = st.anim || {};
    var hasMotion = !!(a.spin || a.revolve || (st.params && (st.params.voyage || st.params.shapeScene === 'horizon')));
    return {
      /* 无预设运动的地球仪可手动播放自转；有预设运动的场景只播放其指定运动。 */
      spin: playing && (!!a.spin || (!hasMotion && st.rig === 'globe')),
      revolve: playing && !!a.revolve,
      playing: playing,
      speed: speed * (typeof a.speed === 'number' ? a.speed : 1)
    };
  }

  function stepState() {
    var st = curStep.state || {};
    return {
      rig: st.rig || null,
      scale: scaleOverride || st.scale || 'iconic',
      anim: currentAnim(),
      params: st.params || {}
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

  function setScale(mode) {
    if (!active || !SOLAR.TeachScenes || !curStep) return;
    scaleOverride = mode === 'real' ? 'real' : 'iconic';
    /* 教学装置用「真实比例 / 示意比例」，与演示模式的「压缩示意 / 弱压缩示意」是两套
       独立语义（后者因深度缓冲限制无法真实），因此这里不再联动演示模式与设置面板。 */
    el.segReal.classList.toggle('is-active', scaleOverride === 'real');
    el.segIconic.classList.toggle('is-active', scaleOverride === 'iconic');
    SOLAR.TeachScenes.applyState(stepState());
    moveCamera(curStep);
  }

  function resetStep() {
    if (!active || !curStep) return;
    setPlaying(true);
    speed = 1;
    scaleOverride = null;
    el.speed.value = '2';
    el.speedValue.textContent = '1×';
    if (SOLAR.TeachScenes && SOLAR.TeachScenes.resetMotion) SOLAR.TeachScenes.resetMotion();
    applyStep(curStep);
  }

  /* ============ 模式进出 ============ */

  function enterMode() {
    if (active) return;
    if (!data) return;
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
    scaleOverride = null;
    el.speed.value = '2';
    el.speedValue.textContent = '1×';
    gotoLesson(data.chapters[0].sections[0].lessons[0].id);
    startLoop();
  }

  function exitMode() {
    if (!active) return;
    active = false;
    stopLoop();

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

    ['panel', 'topbar', 'info', 'infoOpen', 'bar', 'demoTip'].forEach(function (k) {
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
    setScale: setScale,
    getLesson: function () { return curLesson; },
    getStep: function () { return curStep; }
  };
})();
