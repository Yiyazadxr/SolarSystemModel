/*
 * 相机控制：轨道操作 / 光标缩放 / 飞行 / 软跟随 / 巡航 / 拾取
 * 依赖：three.min.js（全局 THREE）、config.js、data.js、scene.js
 * 说明：优先使用 THREE.OrbitControls；缺失时自动启用内置 ES5 轨道控制器。
 */
window.SOLAR = window.SOLAR || {};

SOLAR.Controls = (function () {
  'use strict';

  var C = SOLAR.CONFIG || {};
  var D = SOLAR.DATA || {};
  var CAM = C.camera || {};

  /* ================= 内部状态 ================= */
  var scene = null;
  var camera = null;
  var renderer = null;
  var dom = null;
  var controls = null;
  var usingFallback = false;

  var raycaster = null;
  var ndc = null;
  var tmpA = null, tmpB = null, tmpC = null, tmpD = null, tmpE = null;
  var tmpDir = null, projA = null, projB = null;
  var rightV = null, upV = null;
  var rayHitPoint = null;
  var candIds = null;
  var rayHitId = null;
  var rayHitValid = false;

  var rangeMin = numberConfig('minDistance', 3);
  var rangeMax = numberConfig('maxDistance', 12000);

  /* 飞行所需向量在 init 中一次性创建，逐帧不分配临时对象。 */
  var flight = {
    active: false,
    id: null,
    t0: 0,
    dur: 1600,
    progress: 0,
    fromPos: null,
    fromTarget: null,
    toPos: null,
    toTarget: null,
    basePos: null,
    baseTarget: null,
    focusDir: null,
    focusDirValid: false,
    travelDir: null,
    arcUp: null,
    arcSide: null,
    dist: 0,
    arc: 0,
    arcSideAmount: 0.16,
    flatMotion: false,
    rollNow: 0,
    rollSign: 1,
    trackSystem: false
  };

  var follow = {
    id: null,
    prev: null,
    has: false,
    strength: 1,
    resumeAt: 0
  };

  var cruise = {
    on: false,
    timer: 0,
    index: -1,
    order: null,
    pauseUntil: 0
  };

  /* 滚轮使用“剩余对数缩放量”，指数收敛可兼容滚轮与触摸板惯性。 */
  var zoom = {
    remaining: 0,
    anchor: null,
    anchorValid: false,
    focusId: null
  };

  /* 历史视角保存为太阳系局部坐标，银河公转时仍能回到正确位置。 */
  var historyView = {
    valid: false,
    pos: null,
    target: null
  };

  /* hover 返回复用对象，避免主循环每帧创建新对象。 */
  var hoverState = {
    stableId: null,
    candidateId: null,
    candidateSince: 0,
    lastEval: 0,
    lastX: -100000,
    lastY: -100000,
    result: { id: null, x: 0, y: 0 }
  };

  var mouse = {
    x: 0,
    y: 0,
    downX: 0,
    downY: 0,
    down: false,
    dragged: false,
    button: 0,
    buttons: 0,
    pointerId: null,
    lastClickId: null,
    lastClickValid: false
  };

  var bound = false;
  var previousTouchAction = '';
  var lastErrorAt = -Infinity;

  /* ================= 基础工具 ================= */

  function numberConfig(name, fallback) {
    var value = CAM[name];
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function now() {
    return (window.performance && typeof window.performance.now === 'function') ?
      window.performance.now() : Date.now();
  }

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  /* 五阶最小加加速度曲线：起止速度、加速度均为零。 */
  function smootherStep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function validVector(v) {
    return !!v && isFinite(v.x) && isFinite(v.y) && isFinite(v.z);
  }

  function warnSafely(error) {
    var stamp = now();
    if (stamp - lastErrorAt < 2000) return;
    lastErrorAt = stamp;
    if (window.console && typeof window.console.warn === 'function') {
      console.warn('[SOLAR.Controls] 已隔离一次控制器异常：', error);
    }
  }

  /* 天体世界坐标（Scene 返回的是独立向量，调用方只读）。 */
  function worldPos(id) {
    if (!id || !SOLAR.Scene || typeof SOLAR.Scene.worldPositionOf !== 'function') return null;
    try {
      var p = SOLAR.Scene.worldPositionOf(id);
      return validVector(p) ? p : null;
    } catch (e) {
      return null;
    }
  }

  function bodyRadius(id) {
    if (!id || !SOLAR.Scene || typeof SOLAR.Scene.radiusOf !== 'function') return 0.35;
    try {
      var radius = SOLAR.Scene.radiusOf(id);
      return typeof radius === 'number' && isFinite(radius) && radius > 0 ? radius : 0.35;
    } catch (e) {
      return 0.35;
    }
  }

  function sysOffset() {
    try {
      var root = SOLAR.Scene && SOLAR.Scene.getSystemRoot ? SOLAR.Scene.getSystemRoot() : null;
      return root && validVector(root.position) ? root.position : null;
    } catch (e) {
      return null;
    }
  }

  function interactionAllowed() {
    return !!controls && (controls.enabled !== false || flight.active);
  }

  /* ================= OrbitControls 缺失时的兜底控制器 ================= */

  function makeMiniControls(cam, el) {
    var api = {};
    var spherical = new THREE.Spherical();
    var sphericalDelta = new THREE.Spherical(0, 0, 0);
    var panOffset = new THREE.Vector3();
    var offset = new THREE.Vector3();
    var state = 0;                    // 0 无 / 1 旋转 / 2 平移
    var lastX = 0, lastY = 0;
    var pointerId = null;

    api.enabled = true;
    api.target = new THREE.Vector3();
    api.enableDamping = true;
    api.dampingFactor = 0.08;
    api.rotateSpeed = numberConfig('rotateSpeed', 0.55);
    api.zoomSpeed = 1;
    api.panSpeed = numberConfig('panSpeed', 0.72);
    api.enableZoom = true;
    api.enablePan = true;
    api.minDistance = rangeMin;
    api.maxDistance = rangeMax;
    api.minPolarAngle = 0.000001;
    api.maxPolarAngle = Math.PI - 0.000001;

    function buttonState(event) {
      if (event.button === 1 || event.button === 2) return 2;
      return 1;
    }

    function buttonsState(buttons) {
      if (buttons & 2 || buttons & 4) return 2;
      if (buttons & 1) return 1;
      return 0;
    }

    function onDown(event) {
      if (!api.enabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      if (pointerId !== null && pointerId !== event.pointerId) return;
      state = buttonState(event);
      lastX = event.clientX;
      lastY = event.clientY;
      pointerId = event.pointerId;
      if (el && el.setPointerCapture && event.pointerId != null) {
        try { el.setPointerCapture(event.pointerId); } catch (ignore) { }
      }
    }

    function onMove(event) {
      if (!api.enabled || state === 0 || (pointerId !== null && event.pointerId !== pointerId)) return;
      if (typeof event.buttons === 'number' && event.buttons === 0 && event.pointerType === 'mouse') {
        state = 0;
        pointerId = null;
        return;
      }

      var dx = event.clientX - lastX;
      var dy = event.clientY - lastY;
      var height = (el && el.clientHeight) || window.innerHeight || 1;
      lastX = event.clientX;
      lastY = event.clientY;

      if (state === 1) {
        sphericalDelta.theta -= (2 * Math.PI * dx / height) * api.rotateSpeed;
        sphericalDelta.phi -= (2 * Math.PI * dy / height) * api.rotateSpeed;
      } else if (api.enablePan) {
        offset.copy(cam.position).sub(api.target);
        var distance = Math.max(offset.length(), 0.0001);
        var fov = typeof cam.fov === 'number' ? cam.fov : 50;
        var worldPerPixel = 2 * distance * Math.tan(fov * Math.PI / 360) / height;
        worldPerPixel *= api.panSpeed;
        if (typeof cam.updateMatrix === 'function') cam.updateMatrix();
        rightV.setFromMatrixColumn(cam.matrix, 0);
        upV.setFromMatrixColumn(cam.matrix, 1);
        panOffset.addScaledVector(rightV, -dx * worldPerPixel);
        panOffset.addScaledVector(upV, dy * worldPerPixel);
      }
    }

    function onUp(event) {
      if (pointerId !== null && event.pointerId !== pointerId) return;
      if (typeof event.buttons === 'number' && event.buttons !== 0) {
        state = buttonsState(event.buttons);
        return;
      }
      state = 0;
      if (el && el.releasePointerCapture && pointerId !== null) {
        try { el.releasePointerCapture(pointerId); } catch (ignore) { }
      }
      pointerId = null;
    }

    function onLostCapture() {
      state = 0;
      pointerId = null;
    }

    if (el) {
      el.addEventListener('pointerdown', onDown, false);
      el.addEventListener('pointermove', onMove, false);
      el.addEventListener('pointerup', onUp, false);
      el.addEventListener('pointercancel', onUp, false);
      el.addEventListener('lostpointercapture', onLostCapture, false);
    }

    api.cancelInteraction = function () {
      state = 0;
      pointerId = null;
      sphericalDelta.theta = 0;
      sphericalDelta.phi = 0;
      panOffset.set(0, 0, 0);
    };

    api.update = function (dt) {
      var d = typeof dt === 'number' && isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
      var alpha = api.enableDamping ? 1 - Math.exp(-numberConfig('dampingLambda', 5.0) * d) : 1;

      offset.copy(cam.position).sub(api.target);
      spherical.setFromVector3(offset);
      spherical.theta += sphericalDelta.theta * alpha;
      spherical.phi += sphericalDelta.phi * alpha;
      spherical.phi = clamp(spherical.phi, api.minPolarAngle, api.maxPolarAngle);
      if (typeof spherical.makeSafe === 'function') spherical.makeSafe();
      spherical.radius = clamp(spherical.radius, api.minDistance, api.maxDistance);

      api.target.addScaledVector(panOffset, alpha);
      offset.setFromSpherical(spherical);
      cam.position.copy(api.target).add(offset);
      if (typeof cam.lookAt === 'function') cam.lookAt(api.target);

      sphericalDelta.theta *= (1 - alpha);
      sphericalDelta.phi *= (1 - alpha);
      panOffset.multiplyScalar(1 - alpha);
      if (Math.abs(sphericalDelta.theta) < 1e-8) sphericalDelta.theta = 0;
      if (Math.abs(sphericalDelta.phi) < 1e-8) sphericalDelta.phi = 0;
      if (panOffset.lengthSq() < 1e-12) panOffset.set(0, 0, 0);
      return true;
    };

    api.dispose = function () {
      if (!el) return;
      el.removeEventListener('pointerdown', onDown, false);
      el.removeEventListener('pointermove', onMove, false);
      el.removeEventListener('pointerup', onUp, false);
      el.removeEventListener('pointercancel', onUp, false);
      el.removeEventListener('lostpointercapture', onLostCapture, false);
    };

    return api;
  }

  function createControls() {
    var T = window.THREE;
    if (T && T.OrbitControls) {
      try {
        var nativeControls = new T.OrbitControls(camera, dom);
        nativeControls.enableDamping = true;
        nativeControls.dampingFactor = 1 - Math.exp(-numberConfig('dampingLambda', 5.0) / 60);
        nativeControls.rotateSpeed = numberConfig('rotateSpeed', 0.55);
        nativeControls.zoomSpeed = 1;
        nativeControls.panSpeed = numberConfig('panSpeed', 0.72);
        nativeControls.enableZoom = true;       // 保留双指缩放；滚轮由捕获阶段的光标缩放接管
        nativeControls.enablePan = true;
        nativeControls.screenSpacePanning = true;
        nativeControls.minDistance = rangeMin;
        nativeControls.maxDistance = rangeMax;
        if (T.MOUSE && nativeControls.mouseButtons) {
          nativeControls.mouseButtons.LEFT = T.MOUSE.ROTATE;
          nativeControls.mouseButtons.MIDDLE = T.MOUSE.PAN;
          nativeControls.mouseButtons.RIGHT = T.MOUSE.PAN;
        }
        usingFallback = false;
        return nativeControls;
      } catch (error) {
        warnSafely(error);
      }
    }
    usingFallback = true;
    return makeMiniControls(camera, dom);
  }

  function allocateVectors() {
    raycaster = new THREE.Raycaster();
    ndc = new THREE.Vector2();
    tmpA = new THREE.Vector3();
    tmpB = new THREE.Vector3();
    tmpC = new THREE.Vector3();
    tmpD = new THREE.Vector3();
    tmpE = new THREE.Vector3();
    tmpDir = new THREE.Vector3();
    projA = new THREE.Vector3();
    projB = new THREE.Vector3();
    rightV = new THREE.Vector3();
    upV = new THREE.Vector3();
    rayHitPoint = new THREE.Vector3();

    flight.fromPos = new THREE.Vector3();
    flight.fromTarget = new THREE.Vector3();
    flight.toPos = new THREE.Vector3();
    flight.toTarget = new THREE.Vector3();
    flight.basePos = new THREE.Vector3();
    flight.baseTarget = new THREE.Vector3();
    flight.focusDir = new THREE.Vector3();
    flight.travelDir = new THREE.Vector3();
    flight.arcUp = new THREE.Vector3();
    flight.arcSide = new THREE.Vector3();

    follow.prev = new THREE.Vector3();
    zoom.anchor = new THREE.Vector3();
    historyView.pos = new THREE.Vector3();
    historyView.target = new THREE.Vector3();
  }

  function init(sceneRef, cameraRef, rendererRef, canvasEl) {
    if (controls || bound) dispose();

    scene = sceneRef || null;
    camera = cameraRef || null;
    renderer = rendererRef || null;
    dom = canvasEl || (renderer && renderer.domElement) || null;
    if (!camera || !dom || typeof window.THREE === 'undefined') return false;

    rangeMin = numberConfig('minDistance', 3);
    rangeMax = numberConfig('maxDistance', 12000);
    allocateVectors();

    flight.active = false;
    follow.id = null;
    follow.has = false;
    cruise.on = false;
    cruise.timer = 0;
    cruise.pauseUntil = 0;
    zoom.remaining = 0;
    zoom.anchorValid = false;
    zoom.focusId = null;
    historyView.valid = false;
    candIds = null;
    resetHover();

    controls = createControls();
    if (!controls) return false;
    if (controls.target && typeof controls.target.set === 'function') controls.target.set(0, 0, 0);

    bindEvents();
    buildCruiseOrder();
    return true;
  }

  /* ================= 飞行与视角历史 ================= */

  function flushControlInertia() {
    if (!controls || typeof controls.update !== 'function') return;
    var damping = controls.enableDamping;
    try {
      controls.enableDamping = false;
      controls.update(1 / 60);
    } catch (error) {
      warnSafely(error);
    }
    controls.enableDamping = damping;
  }

  function rememberCurrentView() {
    if (!camera || !controls || !historyView.pos || !historyView.target) return;
    var off = sysOffset();
    historyView.pos.copy(camera.position);
    historyView.target.copy(controls.target);
    if (off) {
      historyView.pos.sub(off);
      historyView.target.sub(off);
    }
    historyView.valid = true;
  }

  function computeFlightDuration(travel) {
    var base = numberConfig('flyDuration', 1600);
    var extra = Math.log(1 + Math.max(0, travel) / 40) * numberConfig('flyDistanceDuration', 360);
    return clamp(base + extra, numberConfig('flyMinDuration', 1100), numberConfig('flyMaxDuration', 3800));
  }

  function configureFlightArc(travel, arcScale, sideScale) {
    flight.travelDir.copy(flight.toPos).sub(flight.fromPos);
    if (flight.travelDir.lengthSq() < 1e-10) flight.travelDir.set(0, 0, -1);
    else flight.travelDir.normalize();

    /* 把世界上方向投影到航线法平面，避免垂直航线的抬升方向退化。 */
    flight.arcUp.set(0, 1, 0);
    flight.arcUp.addScaledVector(flight.travelDir, -flight.arcUp.dot(flight.travelDir));
    if (flight.arcUp.lengthSq() < 1e-6) {
      flight.arcUp.set(1, 0, 0);
      flight.arcUp.addScaledVector(flight.travelDir, -flight.arcUp.dot(flight.travelDir));
    }
    flight.arcUp.normalize();
    flight.arcSide.crossVectors(flight.travelDir, flight.arcUp);
    if (flight.arcSide.lengthSq() < 1e-8) flight.arcSide.set(0, 0, 1);
    else flight.arcSide.normalize();

    var ratio = numberConfig('flyArcRatio', 0.09) * (arcScale == null ? 1 : arcScale);
    var side = numberConfig('flyArcSideRatio', 0.16) * (sideScale == null ? 1 : sideScale);
    flight.arc = Math.min(travel * ratio, numberConfig('flyArcMax', 260));
    flight.arcSideAmount = side;
    flight.rollSign = flight.travelDir.x + flight.travelDir.z >= 0 ? 1 : -1;
  }

  function interruptFlight() {
    if (!flight.active) return false;
    flight.active = false;
    flight.id = null;
    flight.focusDirValid = false;
    flight.rollNow = 0;
    if (controls) controls.enabled = true;
    return true;
  }

  /**
   * trackSystem=true 时，baseIsLocal 决定传入终点是否已经是太阳系局部坐标。
   * 所有目标向量都会复制到预分配缓存，调用方可安全复用临时向量。
   */
  function startFlight(toPos, toTarget, id, trackSystem, baseIsLocal, remember, arcScale, sideScale) {
    if (!camera || !controls || !validVector(toPos) || !validVector(toTarget)) return false;

    var hadFlight = flight.active;
    if (hadFlight) interruptFlight();
    controls.enabled = true;
    flushControlInertia();
    if (remember !== false && !hadFlight) rememberCurrentView();

    flight.fromPos.copy(camera.position);
    flight.fromTarget.copy(controls.target);
    flight.id = id || null;
    flight.trackSystem = !!trackSystem;
    flight.focusDirValid = false;
    flight.flatMotion = false;

    var off = sysOffset();
    if (flight.trackSystem) {
      flight.basePos.copy(toPos);
      flight.baseTarget.copy(toTarget);
      if (!baseIsLocal && off) {
        flight.basePos.sub(off);
        flight.baseTarget.sub(off);
      }
      flight.toPos.copy(flight.basePos);
      flight.toTarget.copy(flight.baseTarget);
      if (off) {
        flight.toPos.add(off);
        flight.toTarget.add(off);
      }
    } else {
      flight.basePos.copy(toPos);
      flight.baseTarget.copy(toTarget);
      flight.toPos.copy(toPos);
      flight.toTarget.copy(toTarget);
    }

    var travel = flight.fromPos.distanceTo(flight.toPos);
    flight.t0 = now();
    flight.dur = computeFlightDuration(travel);
    flight.progress = 0;
    flight.rollNow = 0;
    configureFlightArc(travel, arcScale, sideScale);

    follow.id = null;
    follow.has = false;
    zoom.remaining = 0;
    zoom.focusId = id || null;
    flight.active = true;
    controls.enabled = false;
    cruise.timer = 0;
    return true;
  }

  function focusDistance(id, radius, alignView) {
    var scale = alignView ? numberConfig('alignDistanceScale', 10) :
      (id === 'sun' ? numberConfig('sunDistanceScale', 8) : numberConfig('focusDistanceScale', 6));
    var surface = radius * numberConfig('surfacePadding', 1.35) + numberConfig('focusPadding', 2);
    return Math.max(radius * scale, surface);
  }

  function flyToInternal(id, alignView, remember, flatMotion) {
    if (!camera || !controls || !id) return false;
    var pos = worldPos(id);
    if (!pos) return false;

    var radius = bodyRadius(id);
    var distance = focusDistance(id, radius, !!alignView);
    if (alignView) tmpDir.set(0, 0.22, 1).normalize();
    else {
      tmpDir.copy(camera.position).sub(controls.target);
      if (tmpDir.lengthSq() < 1e-8) tmpDir.set(0, 0.45, 1);
      tmpDir.normalize();
    }

    tmpA.copy(pos).addScaledVector(tmpDir, distance);
    tmpB.copy(pos);
    /* 演示模式的列表切换保持平移感，避免电影弧线先抬升再落到目标。 */
    var arcScale = flatMotion ? 0 : (alignView ? numberConfig('alignFlyArcFactor', 0.08) : null);
    var sideScale = flatMotion ? 0 : (alignView ? numberConfig('alignFlySideFactor', 0) : null);
    var ok = startFlight(tmpA, tmpB, id, false, false, remember, arcScale, sideScale);
    if (ok) {
      flight.flatMotion = !!flatMotion;
      flight.focusDir.copy(tmpDir);
      flight.focusDirValid = true;
      flight.dist = distance;
      zoom.focusId = id;
    }
    return ok;
  }

  function flyTo(id, alignView, flatMotion) {
    return flyToInternal(id, alignView, true, flatMotion);
  }

  function goToPreset(name, flatMotion) {
    if (!camera || !controls) return false;
    var views = C.views || {};
    var mode = (SOLAR.Scene && typeof SOLAR.Scene.getScaleMode === 'function')
      ? SOLAR.Scene.getScaleMode() : 'compact';
    var profileViews = C.viewProfiles && C.viewProfiles[mode];
    var profileView = profileViews && profileViews[name];
    var view = profileView || views[name] ||
      (profileViews && profileViews.home) || views.home;
    if (!view || !view.pos || !view.target) return false;
    setFollow(null);
    zoom.focusId = null;
    /* compact 沿用旧视角数值；faithful 使用单独的取景表。
       两档的 distanceExp 不同，统一乘 distanceBase/42 会让海王星出框。 */
    if (profileView) {
      tmpA.set(view.pos[0], view.pos[1], view.pos[2]);
      tmpB.set(view.target[0], view.target[1], view.target[2]);
    } else {
      var k = (C.scale && typeof C.scale.distanceBase === 'number') ? C.scale.distanceBase / 42 : 1;
      tmpA.set(view.pos[0] * k, view.pos[1] * k, view.pos[2] * k);
      tmpB.set(view.target[0] * k, view.target[1] * k, view.target[2] * k);
    }
    /* 压缩示意的预设距离变化很大，保留轻微空间弧线即可；过大的抬升会让
       切换看起来像镜头先升空再回到太阳系。faithful 档保留完整的电影弧线。 */
    var presetArcScale = flatMotion ? 0 : (mode === 'compact' ? 0.18 : 1);
    var ok = startFlight(tmpA, tmpB, null, true, true, true, presetArcScale, presetArcScale);
    if (ok) {
      flight.flatMotion = !!flatMotion;
      if (flatMotion) {
        /* 比例档切换只做位置补间；startFlight 已经按普通预设算过弧线，
           这里必须显式清零，否则仍会在切档中途向上拱起。 */
        flight.arc = 0;
        flight.arcSideAmount = 0;
      }
    }
    return ok;
  }

  function goToView(pos, target) {
    if (!camera || !controls || !validVector(pos) || !validVector(target)) return false;
    setFollow(null);
    zoom.focusId = null;
    tmpA.set(pos.x, pos.y, pos.z);
    tmpB.set(target.x, target.y, target.z);
    /* 任意视角先精确抵达传入的世界坐标，随后终点跟随太阳系整体位移。 */
    return startFlight(tmpA, tmpB, null, true, false, true);
  }

  function goBackOrHome() {
    setFollow(null);
    zoom.focusId = null;
    if (!historyView.valid) return goToPreset('home');
    tmpC.copy(historyView.pos);
    tmpD.copy(historyView.target);
    return startFlight(tmpC, tmpD, null, true, true, true);
  }

  function resetView() {
    setFollow(null);
    return goToPreset('home');
  }

  function isFlying() {
    return flight.active;
  }

  function stepFlight() {
    var t = clamp((now() - flight.t0) / Math.max(flight.dur, 1), 0, 1);
    /* 比例档切换需要尽快离开旧距离，否则太阳半径已经变档、镜头却还贴在
       原位置，会短暂出现“太阳吞屏”的错觉。使用平滑的 ease-out，起步更快，
       仍保持位置连续且没有抬升弧线；普通天体飞行继续使用原曲线。 */
    var eased = flight.flatMotion ? (1 - Math.pow(1 - t, 3)) : smootherStep(t);

    /* 天体与太阳系根节点都可能在飞行中移动，终点每帧实时重算。 */
    if (flight.id && flight.focusDirValid) {
      var destination = worldPos(flight.id);
      if (destination) {
        flight.toTarget.copy(destination);
        flight.toPos.copy(destination).addScaledVector(flight.focusDir, flight.dist);
      }
    } else if (flight.trackSystem) {
      var off = sysOffset();
      flight.toPos.copy(flight.basePos);
      flight.toTarget.copy(flight.baseTarget);
      if (off) {
        flight.toPos.add(off);
        flight.toTarget.add(off);
      }
    }

    camera.position.lerpVectors(flight.fromPos, flight.toPos, eased);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);

    var pulse = Math.sin(Math.PI * t);
    if (flight.arc > 0 && pulse > 0) {
      camera.position.addScaledVector(flight.arcUp, flight.arc * pulse);
      if (flight.arcSideAmount > 0) {
        camera.position.addScaledVector(flight.arcSide, flight.arc * flight.arcSideAmount * Math.sin(Math.PI * 2 * t));
      }
    }
    flight.progress = t;
    flight.rollNow = flight.flatMotion ? 0 : flight.rollSign * numberConfig('flyRoll', 0.028) * pulse;

    if (t >= 1) {
      var focusedId = flight.id;
      camera.position.copy(flight.toPos);
      controls.target.copy(flight.toTarget);
      flight.active = false;
      flight.id = null;
      flight.focusDirValid = false;
      flight.flatMotion = false;
      flight.rollNow = 0;
      controls.enabled = true;
      if (focusedId) setFollow(focusedId);
    }
  }

  function applyFlightRoll() {
    if (!flight.active || Math.abs(flight.rollNow) < 1e-7) return;
    if (typeof camera.rotateZ === 'function') camera.rotateZ(flight.rollNow);
    else if (camera.rotation) camera.rotation.z += flight.rollNow;
  }

  /* ================= 软跟随 ================= */

  function setFollow(id) {
    if (flight.active) interruptFlight();
    if (!id) {
      follow.id = null;
      follow.has = false;
      follow.strength = 1;
      zoom.focusId = null;
      return null;
    }

    var p = worldPos(id);
    if (!p) {
      follow.id = null;
      follow.has = false;
      return null;
    }
    follow.id = id;
    follow.prev.copy(p);
    follow.has = true;
    follow.strength = 1;
    follow.resumeAt = 0;
    zoom.focusId = id;
    return id;
  }

  function getFollow() {
    return follow.id || null;
  }

  function stepFollow(dt) {
    var current = worldPos(follow.id);
    if (!current) return;
    if (!follow.has) {
      follow.prev.copy(current);
      follow.has = true;
      return;
    }

    /* 同步平移保持相对方位与距离，不改变用户刚刚旋转出的观察角度。 */
    tmpA.copy(current).sub(follow.prev);
    if (tmpA.lengthSq() > 1e10) {
      follow.prev.copy(current);
      return;
    }
    camera.position.add(tmpA);
    controls.target.add(tmpA);
    follow.prev.copy(current);

    var stamp = now();
    var manualStrength = numberConfig('followManualStrength', 0.12);
    if (stamp < follow.resumeAt) follow.strength = Math.min(follow.strength, manualStrength);
    else {
      var recovery = 1 - Math.exp(-numberConfig('followRecoverRate', 1.8) * dt);
      follow.strength += (1 - follow.strength) * recovery;
    }

    /* 只柔和修正用户平移造成的偏心；手动操作期间强度会自动降低。 */
    tmpB.copy(current).sub(controls.target);
    if (tmpB.lengthSq() > 1e-10) {
      var legacyLerp = clamp(numberConfig('followLerp', 0.08), 0.001, 0.95);
      var followRate = -60 * Math.log(1 - legacyLerp);
      var amount = (1 - Math.exp(-followRate * dt)) * follow.strength;
      tmpB.multiplyScalar(clamp(amount, 0, 1));
      camera.position.add(tmpB);
      controls.target.add(tmpB);
    }
  }

  /* ================= 巡航 ================= */

  function cruiseInterval() {
    return Math.max(1, numberConfig('cruiseInterval', 9));
  }

  function buildCruiseOrder() {
    var order = [];
    var i;
    if (D && D.bodies) {
      for (i = 0; i < D.bodies.length; i++) {
        if (D.bodies[i] && D.bodies[i].id) order.push(D.bodies[i].id);
      }
    }
    if (D && D.comets) {
      for (i = 0; i < D.comets.length; i++) {
        if (D.comets[i] && D.comets[i].id) order.push(D.comets[i].id);
      }
    }
    order.push('sun');
    cruise.order = order;
    return order;
  }

  function cruiseNext() {
    if (!cruise.order || !cruise.order.length) buildCruiseOrder();
    if (!cruise.order.length) return false;
    cruise.index = (cruise.index + 1) % cruise.order.length;
    var id = cruise.order[cruise.index];
    if (!flyToInternal(id, false, false)) {
      cruise.timer = cruiseInterval() - 0.5;
      return false;
    }
    /* 巡航切换视角时同步右侧信息浮窗（只更新面板，不再发起一次飞行） */
    if (SOLAR.UI && typeof SOLAR.UI.onCruiseId === 'function') {
      try { SOLAR.UI.onCruiseId(id); } catch (error) { warnSafely(error); }
    }
    return true;
  }

  function stepCruiseOrbit(dt) {
    if (!follow.id || flight.active || mouse.down || Math.abs(zoom.remaining) > 1e-5) return;
    tmpA.copy(camera.position).sub(controls.target);
    if (tmpA.lengthSq() < 1e-8) return;
    var angle = numberConfig('cruiseOrbitSpeed', 0.035) * dt;
    var cosine = Math.cos(angle);
    var sine = Math.sin(angle);
    var x = tmpA.x;
    var z = tmpA.z;
    tmpA.x = x * cosine - z * sine;
    tmpA.z = x * sine + z * cosine;
    camera.position.copy(controls.target).add(tmpA);
  }

  function setCruise(on) {
    var value = !!on;
    if (value === cruise.on) return cruise.on;
    cruise.on = value;
    cruise.timer = 0;
    cruise.pauseUntil = 0;
    if (value) cruiseNext();
    return cruise.on;
  }

  function toggleCruise() {
    return setCruise(!cruise.on);
  }

  function isCruising() {
    return cruise.on;
  }

  /* ================= 距离范围与光标缩放 ================= */

  function effectiveMinDistance() {
    var id = flight.id || follow.id || zoom.focusId;
    if (!id) return Math.max(0.001, rangeMin);
    var protectedDistance = Math.max(
      numberConfig('minDistanceFloor', 0.08),
      bodyRadius(id) * numberConfig('surfacePadding', 1.35)
    );
    return protectedDistance;
  }

  function updateDistanceLimits() {
    if (!controls) return;
    var min = effectiveMinDistance();
    var max = Math.max(min, rangeMax);
    controls.minDistance = min;
    controls.maxDistance = max;
  }

  function setDistanceRange(min, max) {
    if (typeof min === 'number' && isFinite(min) && min > 0) rangeMin = min;
    if (typeof max === 'number' && isFinite(max) && max > 0) rangeMax = max;
    if (rangeMax < 0.001) rangeMax = 0.001;
    updateDistanceLimits();
  }

  function panBy(delta) {
    if (!camera || !controls || !validVector(delta)) return;
    if (flight.active || follow.id) return;
    camera.position.add(delta);
    controls.target.add(delta);
  }

  function setZoomAnchor(clientX, clientY) {
    zoom.anchorValid = false;
    rayHitValid = false;
    rayHitId = null;

    var id = pickByRay(clientX, clientY);
    if (id && rayHitValid) {
      zoom.anchor.copy(rayHitPoint);
      zoom.anchorValid = true;
      zoom.focusId = id;
      return;
    }

    if (!raycaster || !controls) return;
    try {
      updateNdc(clientX, clientY);
      raycaster.setFromCamera(ndc, camera);
      tmpDir.copy(controls.target).sub(camera.position);
      if (tmpDir.lengthSq() < 1e-10) tmpDir.set(0, 0, -1);
      else tmpDir.normalize();
      var denominator = raycaster.ray.direction.dot(tmpDir);
      if (Math.abs(denominator) > 1e-6) {
        tmpA.copy(controls.target).sub(raycaster.ray.origin);
        var distance = tmpA.dot(tmpDir) / denominator;
        if (distance > 0) {
          zoom.anchor.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, distance);
          zoom.anchorValid = true;
        }
      }
      var screenId = pickByScreen(clientX, clientY);
      zoom.focusId = screenId || null;
    } catch (error) {
      zoom.anchor.copy(controls.target);
      zoom.anchorValid = true;
    }
  }

  function stepZoom(dt) {
    if (flight.active || Math.abs(zoom.remaining) < 1e-6) {
      if (Math.abs(zoom.remaining) < 1e-6) zoom.remaining = 0;
      return;
    }

    var alpha = 1 - Math.exp(-numberConfig('zoomResponse', 14) * dt);
    var step = zoom.remaining * alpha;
    var maxStep = numberConfig('zoomMaxStep', 0.18);
    step = clamp(step, -maxStep, maxStep);
    zoom.remaining -= step;

    tmpA.copy(camera.position).sub(controls.target);
    var currentDistance = tmpA.length();
    if (!(currentDistance > 1e-8)) {
      zoom.remaining = 0;
      return;
    }

    var requestedDistance = currentDistance * Math.exp(step);
    var minDistance = effectiveMinDistance();
    var maxDistance = Math.max(minDistance, rangeMax);
    var nextDistance = clamp(requestedDistance, minDistance, maxDistance);
    var scale = nextDistance / currentDistance;
    if (Math.abs(scale - 1) < 1e-8) {
      if (requestedDistance !== nextDistance) zoom.remaining = 0;
      return;
    }

    /* 只沿视线（camera.position - target）方向缩放，绝不移动 target。
       旧实现把 target 也绕 zoom.anchor 一起缩放：当光标停在行星上时 anchor 是
       「表面命中点」而非球心，target 会被推离球心造成画面平移；紧接着跟随逻辑
       每帧又把 target 拉回天体世界位置，于是表现为「先平移一段再弹回原位」。
       行星显示半径越大偏离越明显（弱压缩示意档），缩放手感抖动也因此而来。 */
    tmpA.copy(camera.position).sub(controls.target).multiplyScalar(scale);
    camera.position.copy(controls.target).add(tmpA);

    if (requestedDistance !== nextDistance) zoom.remaining = 0;
  }

  /* ================= 射线与屏幕空间拾取 ================= */

  function domRect() {
    if (dom && typeof dom.getBoundingClientRect === 'function') return dom.getBoundingClientRect();
    return { left: 0, top: 0, width: window.innerWidth || 1, height: window.innerHeight || 1 };
  }

  function updateNdc(clientX, clientY) {
    var rect = domRect();
    var width = rect.width || window.innerWidth || 1;
    var height = rect.height || window.innerHeight || 1;
    ndc.x = ((clientX - rect.left) / width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / height) * 2 + 1;
    return rect;
  }

  /* 射线命中以距离为主；距离接近时给较大天体少量优先级。 */
  function pickByRay(clientX, clientY) {
    rayHitId = null;
    rayHitValid = false;
    if (!camera || !raycaster || !SOLAR.Scene || typeof SOLAR.Scene.getPickables !== 'function') return null;

    var list;
    try { list = SOLAR.Scene.getPickables(); } catch (error) { return null; }
    if (!list || !list.length) return null;

    updateNdc(clientX, clientY);
    raycaster.setFromCamera(ndc, camera);
    var hits;
    try { hits = raycaster.intersectObjects(list, false); } catch (error2) { return null; }
    if (!hits || !hits.length) return null;

    var bestScore = Infinity;
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      var object = hit && hit.object;
      if (!object || object.isSprite) continue;
      if (window.THREE.Sprite && object instanceof window.THREE.Sprite) continue;
      var id = object.userData && object.userData.bodyId;
      if (!id) continue;

      var hitDistance = typeof hit.distance === 'number' ? hit.distance : Infinity;
      var radius = bodyRadius(id);
      var score = hitDistance - Math.min(radius * 0.25, hitDistance * 0.08);
      if (score < bestScore) {
        bestScore = score;
        rayHitId = id;
        if (hit.point && validVector(hit.point)) {
          rayHitPoint.copy(hit.point);
          rayHitValid = true;
        } else {
          rayHitValid = false;
        }
      }
    }
    return rayHitId;
  }

  function candidateIds() {
    if (candIds) return candIds;
    var ids = ['sun'];
    var i;
    if (D.bodies) {
      for (i = 0; i < D.bodies.length; i++) if (D.bodies[i] && D.bodies[i].id) ids.push(D.bodies[i].id);
    }
    if (D.moons) {
      for (i = 0; i < D.moons.length; i++) if (D.moons[i] && D.moons[i].id) ids.push(D.moons[i].id);
    }
    if (D.comets) {
      for (i = 0; i < D.comets.length; i++) if (D.comets[i] && D.comets[i].id) ids.push(D.comets[i].id);
    }
    candIds = ids;
    return ids;
  }

  function pickByScreen(clientX, clientY) {
    if (!camera || !dom) return null;
    var rect = domRect();
    var width = rect.width || window.innerWidth || 1;
    var height = rect.height || window.innerHeight || 1;
    var fovScale = height / (2 * Math.tan((camera.fov || 50) * Math.PI / 360));
    var ids = candidateIds();
    var best = null;
    var bestNormalized = Infinity;
    var bestDepth = Infinity;
    var bestRadiusPx = 0;
    var minPixels = numberConfig('pickMinPixels', 11);
    var maxPixels = numberConfig('pickMaxPixels', 34);

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var p = worldPos(id);
      if (!p) continue;

      projA.copy(p);
      projA.applyMatrix4(camera.matrixWorldInverse);
      if (projA.z > -0.01) continue;
      var depth = -projA.z;

      projB.copy(p).project(camera);
      if (projB.z < -1 || projB.z > 1 || Math.abs(projB.x) > 1.15 || Math.abs(projB.y) > 1.15) continue;
      var screenX = rect.left + (projB.x * 0.5 + 0.5) * width;
      var screenY = rect.top + (-projB.y * 0.5 + 0.5) * height;
      var radiusPx = Math.max(0, bodyRadius(id) * fovScale / depth);
      var limit = minPixels + Math.sqrt(radiusPx) * 2.2;
      limit = clamp(limit, minPixels, maxPixels);
      limit = Math.max(limit, Math.min(radiusPx * 1.05, maxPixels * 1.5));

      var dx = clientX - screenX;
      var dy = clientY - screenY;
      var distancePx = Math.sqrt(dx * dx + dy * dy);
      if (distancePx > limit) continue;
      var normalized = distancePx / Math.max(limit, 1);

      if (normalized < bestNormalized - 0.06 ||
          (Math.abs(normalized - bestNormalized) <= 0.06 &&
           (depth < bestDepth * 0.96 || radiusPx > bestRadiusPx * 1.15))) {
        best = id;
        bestNormalized = normalized;
        bestDepth = depth;
        bestRadiusPx = radiusPx;
      }
    }
    return best;
  }

  function resolveId(clientX, clientY) {
    var id = pickByRay(clientX, clientY);
    return id || pickByScreen(clientX, clientY);
  }

  function pick(clientX, clientY) {
    if (!camera || !dom || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
    try { return resolveId(clientX, clientY); } catch (error) { return null; }
  }

  function resetHover() {
    hoverState.stableId = null;
    hoverState.candidateId = null;
    hoverState.candidateSince = 0;
    hoverState.lastEval = 0;
    hoverState.lastX = -100000;
    hoverState.lastY = -100000;
    hoverState.result.id = null;
  }

  function hover(clientX, clientY) {
    if (!camera || !dom || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
    var stamp = now();
    var dx = clientX - hoverState.lastX;
    var dy = clientY - hoverState.lastY;
    var movedSq = dx * dx + dy * dy;
    var intervalMs = numberConfig('hoverInterval', 0.035) * 1000;

    if (stamp - hoverState.lastEval >= intervalMs || movedSq > 16) {
      var rawId = null;
      try { rawId = resolveId(clientX, clientY); } catch (error) { rawId = null; }
      hoverState.lastEval = stamp;
      hoverState.lastX = clientX;
      hoverState.lastY = clientY;

      if (rawId !== hoverState.candidateId) {
        hoverState.candidateId = rawId;
        hoverState.candidateSince = stamp;
        if (movedSq > 900 && rawId !== hoverState.stableId) hoverState.stableId = null;
      }
    }

    if (hoverState.candidateId !== hoverState.stableId) {
      var delay = hoverState.candidateId ? numberConfig('hoverDelay', 0.065) :
        numberConfig('hoverReleaseDelay', 0.1);
      if (stamp - hoverState.candidateSince >= delay * 1000) {
        hoverState.stableId = hoverState.candidateId;
      }
    }

    if (!hoverState.stableId) return null;
    hoverState.result.id = hoverState.stableId;
    hoverState.result.x = clientX;
    hoverState.result.y = clientY;
    return hoverState.result;
  }

  /* ================= 用户输入与事件生命周期 ================= */

  function noteUserInteraction(kind, button) {
    if (!controls) return;
    if (flight.active) interruptFlight();
    if (controls.enabled === false) return;

    var stamp = now();
    if (follow.id) {
      follow.strength = Math.min(follow.strength, numberConfig('followManualStrength', 0.12));
      follow.resumeAt = stamp + numberConfig('followResumeDelay', 1.2) * 1000;
    }
    if (cruise.on) {
      cruise.pauseUntil = stamp + numberConfig('cruiseResumeDelay', 5) * 1000;
      cruise.timer = cruiseInterval();
    }
    if (kind === 'pointer') {
      zoom.remaining = 0;
      if ((button === 1 || button === 2) && !follow.id) zoom.focusId = null;
    }
  }

  function onPointerDown(event) {
    if (!interactionAllowed()) return;
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    noteUserInteraction('pointer', event.button);

    if (mouse.down && mouse.pointerId !== event.pointerId) return;
    if (mouse.down) mouse.dragged = true;
    mouse.down = true;
    mouse.downX = event.clientX;
    mouse.downY = event.clientY;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.button = typeof event.button === 'number' ? event.button : 0;
    mouse.buttons = typeof event.buttons === 'number' ? event.buttons : 1;
    mouse.pointerId = event.pointerId;

    if (dom && dom.setPointerCapture && event.pointerId != null) {
      try { dom.setPointerCapture(event.pointerId); } catch (ignore) { }
    }
  }

  function onPointerMove(event) {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    if (!mouse.down || (mouse.pointerId !== null && event.pointerId !== mouse.pointerId)) return;
    var dx = event.clientX - mouse.downX;
    var dy = event.clientY - mouse.downY;
    var threshold = numberConfig('dragThreshold', 5);
    if (dx * dx + dy * dy > threshold * threshold) mouse.dragged = true;
    mouse.buttons = typeof event.buttons === 'number' ? event.buttons : mouse.buttons;
  }

  function finishPointer(event) {
    if (!mouse.down) return;
    if (event && mouse.pointerId !== null && event.pointerId !== mouse.pointerId) return;
    if (event) {
      var dx = event.clientX - mouse.downX;
      var dy = event.clientY - mouse.downY;
      var threshold = numberConfig('dragThreshold', 5);
      if (dx * dx + dy * dy > threshold * threshold) mouse.dragged = true;
      if (typeof event.buttons === 'number' && event.buttons !== 0) {
        mouse.buttons = event.buttons;
        return;
      }
    }
    if (dom && dom.releasePointerCapture && mouse.pointerId !== null) {
      try { dom.releasePointerCapture(mouse.pointerId); } catch (ignore) { }
    }
    mouse.down = false;
    mouse.buttons = 0;
    mouse.pointerId = null;
  }

  function onPointerUp(event) {
    finishPointer(event);
  }

  function onLostPointerCapture(event) {
    if (mouse.pointerId !== null && event.pointerId != null && event.pointerId !== mouse.pointerId) return;
    mouse.down = false;
    mouse.buttons = 0;
    mouse.pointerId = null;
  }

  function onPointerLeave() {
    if (!mouse.down) resetHover();
  }

  function onClick(event) {
    if (mouse.dragged) {
      mouse.dragged = false;
      mouse.lastClickValid = false;
      return;
    }
    if (typeof event.button === 'number' && event.button !== 0) return;
    /* 第二次 click 交给 dblclick，避免重复飞行覆盖“上一个视角”。 */
    if (typeof event.detail === 'number' && event.detail > 1) return;

    var id = null;
    try { id = resolveId(event.clientX, event.clientY); } catch (error) { id = null; }
    mouse.lastClickId = id;
    mouse.lastClickValid = true;
    if (SOLAR.UI && typeof SOLAR.UI.onSelectId === 'function') {
      try { SOLAR.UI.onSelectId(id); } catch (error2) { warnSafely(error2); }
    }
  }

  function onDoubleClick(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    var id = null;
    try { id = resolveId(event.clientX, event.clientY); } catch (error) { id = null; }

    if (id) {
      var aligned = false;
      try { aligned = !!(SOLAR.Scene && SOLAR.Scene.isAligned && SOLAR.Scene.isAligned()); } catch (ignore) { }
      if (mouse.lastClickValid && mouse.lastClickId === id) {
        flyToInternal(id, aligned, false);
      } else if (SOLAR.UI && typeof SOLAR.UI.onSelectId === 'function') {
        try { SOLAR.UI.onSelectId(id); } catch (error2) { warnSafely(error2); }
      } else {
        flyToInternal(id, aligned, true);
      }
    } else {
      goBackOrHome();
    }
    mouse.lastClickValid = false;
  }

  function onWheel(event) {
    if (!interactionAllowed()) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    /* OrbitControls 的普通滚轮缩放必须被截断，否则会与光标缩放叠加。 */
    if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    if (!event || !event.deltaY) return;

    noteUserInteraction('wheel', 0);
    setZoomAnchor(event.clientX, event.clientY);

    var delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= (dom && dom.clientHeight) || window.innerHeight || 800;
    delta = clamp(delta, -240, 240);
    var sign = delta < 0 ? -1 : 1;
    var curved = sign * (Math.pow(1 + Math.abs(delta), 0.82) - 1);
    var sensitivity = numberConfig('zoomSensitivity', 0.003);
    if (event.ctrlKey) sensitivity *= 0.75;
    zoom.remaining = clamp(zoom.remaining + curved * sensitivity, -0.9, 0.9);
  }

  function onContextMenu(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  function rebuildNativeAfterBlur() {
    if (!controls) return;
    if (usingFallback) {
      if (typeof controls.cancelInteraction === 'function') controls.cancelInteraction();
      return;
    }

    var wasEnabled = controls.enabled;
    tmpC.copy(controls.target);
    try { if (typeof controls.dispose === 'function') controls.dispose(); } catch (ignore) { }
    controls = createControls();
    if (controls && controls.target) controls.target.copy(tmpC);
    if (controls) controls.enabled = wasEnabled && !flight.active;
    updateDistanceLimits();
  }

  function onWindowBlur() {
    finishPointer(null);
    mouse.dragged = false;
    zoom.remaining = 0;
    resetHover();
    try { rebuildNativeAfterBlur(); } catch (error) { warnSafely(error); }
  }

  function bindEvents() {
    if (!dom || bound) return;
    /* 捕获 pointerdown，确保飞行先被打断，再让 OrbitControls 接收同一次按下。 */
    dom.addEventListener('pointerdown', onPointerDown, true);
    dom.addEventListener('pointermove', onPointerMove, false);
    dom.addEventListener('pointerup', onPointerUp, false);
    dom.addEventListener('pointercancel', onPointerUp, false);
    dom.addEventListener('lostpointercapture', onLostPointerCapture, false);
    dom.addEventListener('pointerleave', onPointerLeave, false);
    dom.addEventListener('click', onClick, false);
    dom.addEventListener('dblclick', onDoubleClick, false);
    dom.addEventListener('wheel', onWheel, { passive: false, capture: true });
    dom.addEventListener('contextmenu', onContextMenu, false);
    if (window.addEventListener) window.addEventListener('blur', onWindowBlur, false);

    if (dom.style) {
      previousTouchAction = dom.style.touchAction || '';
      dom.style.touchAction = 'none';
    }
    bound = true;
  }

  function dispose() {
    if (dom && bound) {
      dom.removeEventListener('pointerdown', onPointerDown, true);
      dom.removeEventListener('pointermove', onPointerMove, false);
      dom.removeEventListener('pointerup', onPointerUp, false);
      dom.removeEventListener('pointercancel', onPointerUp, false);
      dom.removeEventListener('lostpointercapture', onLostPointerCapture, false);
      dom.removeEventListener('pointerleave', onPointerLeave, false);
      dom.removeEventListener('click', onClick, false);
      dom.removeEventListener('dblclick', onDoubleClick, false);
      dom.removeEventListener('wheel', onWheel, true);
      dom.removeEventListener('contextmenu', onContextMenu, false);
      if (dom.style) dom.style.touchAction = previousTouchAction;
      bound = false;
    }
    if (window.removeEventListener) window.removeEventListener('blur', onWindowBlur, false);
    if (controls && typeof controls.dispose === 'function') {
      try { controls.dispose(); } catch (error) { warnSafely(error); }
    }

    controls = null;
    flight.active = false;
    follow.id = null;
    follow.has = false;
    cruise.on = false;
    zoom.remaining = 0;
    mouse.down = false;
    mouse.pointerId = null;
    scene = null;
    camera = null;
    renderer = null;
    dom = null;
  }

  /* ================= 每帧更新 ================= */

  function update(dt) {
    if (!camera || !controls) return;
    var d = typeof dt === 'number' && isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;

    try {
      if (flight.active) stepFlight();
      else if (follow.id) stepFollow(d);

      if (cruise.on) {
        if (now() >= cruise.pauseUntil) {
          if (!flight.active) stepCruiseOrbit(d);
          cruise.timer += d;
          if (!flight.active && cruise.timer >= cruiseInterval()) {
            cruise.timer = 0;
            cruiseNext();
          }
        }
      }

      updateDistanceLimits();
      if (!usingFallback && controls.enableDamping) {
        controls.dampingFactor = 1 - Math.exp(-numberConfig('dampingLambda', 5.0) * d);
      }
      if (typeof controls.update === 'function') controls.update(d);
      stepZoom(d);
      applyFlightRoll();
    } catch (error) {
      /* 控制异常不得冒泡并中断渲染主循环。 */
      interruptFlight();
      zoom.remaining = 0;
      warnSafely(error);
    }
  }

  /* ================= 对外 API ================= */
  return {
    init: init,
    update: update,
    flyTo: flyTo,
    goToPreset: goToPreset,
    goToView: goToView,
    setDistanceRange: setDistanceRange,
    panBy: panBy,
    resetView: resetView,
    setFollow: setFollow,
    getFollow: getFollow,
    getTarget: function () { return controls ? controls.target : null; },
    setCruise: setCruise,
    toggleCruise: toggleCruise,
    isCruising: isCruising,
    pick: pick,
    hover: hover,
    isFlying: isFlying,
    cancelFlight: interruptFlight,

    /* 保留既有附加接口，避免调试工具或外部集成失效。 */
    getControls: function () { return controls; },
    isFallbackControls: function () { return usingFallback; },
    setEnabled: function (on) {
      if (!controls) return;
      controls.enabled = !!on && !flight.active;
      if (!on) zoom.remaining = 0;
    },
    dispose: dispose
  };
})();
