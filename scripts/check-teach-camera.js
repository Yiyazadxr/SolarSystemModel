/* 回归验证：退出教学模式时视角必须被重置。
   成因A：自研兜底控制器不暴露 .object，teach.js 的机位保存/还原守卫静默失败
          （只在 OrbitControls 缺失的环境出现，故表现为"偶发"）。
   成因B：cancelFlight 不清 zoom.remaining，教学模式内滚轮累积的缩放在退出后
          继续逐帧推镜头，刚还原的机位又被拉走。 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || 'D:\\SolarSystem';

function boot(withOrbit) {
  const listeners = {};
  const documentStub = {
    addEventListener: function () { },
    removeEventListener: function () { },
    hidden: false
  };
  const canvas = {
    style: {},
    ownerDocument: documentStub,
    clientWidth: 800,
    clientHeight: 600,
    addEventListener: function (type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener: function () { },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
    setPointerCapture: function () { },
    releasePointerCapture: function () { }
  };
  /* 浏览器里 window 就是全局对象：bare SOLAR / THREE 都靠它解析 */
  const sandbox = { console: console };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.document = documentStub;
  sandbox.addEventListener = function () { };
  sandbox.removeEventListener = function () { };
  sandbox.innerWidth = 800;
  sandbox.innerHeight = 600;
  vm.createContext(sandbox);

  const run = function (rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
  };
  run('assets/vendor/three.min.js');
  if (withOrbit) run('assets/vendor/OrbitControls.js');
  run('assets/js/config.js');
  run('assets/js/controls.js');
  return {
    THREE: sandbox.THREE,
    SOLAR: sandbox.SOLAR,
    canvas: canvas,
    fire: function (type) {
      const list = listeners[type] || [];
      for (let i = 0; i < list.length; i++) {
        list[i].apply(null, Array.prototype.slice.call(arguments, 1));
      }
    }
  };
}

/* ---- 用例1：两条控制器路径都必须把相机挂在 .object 上 ---- */
[true, false].forEach(function (withOrbit) {
  const tag = withOrbit ? 'OrbitControls' : '自研兜底控制器';
  const ctx = boot(withOrbit);
  const camera = new ctx.THREE.PerspectiveCamera(55, 800 / 600, 0.1, 1000);
  camera.position.set(0, 40, 220);
  const scene = new ctx.THREE.Scene();
  assert.strictEqual(
    ctx.SOLAR.Controls.init(scene, camera, { domElement: ctx.canvas }, ctx.canvas),
    true, 'Controls.init 失败'
  );
  const c = ctx.SOLAR.Controls.getControls();
  assert.ok(c, tag + '：getControls() 返回空');
  assert.ok(c.target, tag + '：缺少 target');
  assert.strictEqual(
    c.object, camera,
    tag + '：必须通过 .object 暴露相机（teach.js 靠它保存/还原机位）'
  );
  console.log('OK  ' + tag + ' 暴露 .object');
});

/* ---- 用例2：教学模式内滚轮缩放不得存活到退出之后 ---- */
(function () {
  const ctx = boot(false);                       // 复现现场：回落到自研控制器
  const camera = new ctx.THREE.PerspectiveCamera(55, 800 / 600, 0.1, 1000);
  camera.position.set(0, 40, 220);
  const scene = new ctx.THREE.Scene();
  assert.strictEqual(
    ctx.SOLAR.Controls.init(scene, camera, { domElement: ctx.canvas }, ctx.canvas),
    true, 'Controls.init 失败'
  );

  const wheel = { deltaY: -240, clientX: 400, clientY: 300, preventDefault: function () { } };
  for (let i = 0; i < 4; i++) ctx.fire('wheel', wheel);
  for (let i = 0; i < 5; i++) ctx.SOLAR.Controls.update(1 / 60);
  const settled = camera.position.clone();
  assert.ok(settled.length() > 0, 'sanity');

  /* 重新累积一次缩放，模拟"教学模式里滚了两下就退出" */
  for (let i = 0; i < 4; i++) ctx.fire('wheel', wheel);
  const before = camera.position.clone();
  ctx.SOLAR.Controls.cancelFlight();
  for (let i = 0; i < 60; i++) ctx.SOLAR.Controls.update(1 / 60);
  const drift = camera.position.distanceTo(before);
  assert.ok(
    drift < 1e-6,
    'cancelFlight 之后镜头仍在漂移 ' + drift + '（缩放残留会推走刚还原的机位）'
  );
  console.log('OK  cancelFlight 清掉残留缩放（漂移 ' + drift.toFixed(9) + '）');
})();

console.log('PASS: 退出教学模式视角重置回归');
