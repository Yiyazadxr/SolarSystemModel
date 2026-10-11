#!/usr/bin/env node
/* 轨道小图几何：AU 比例、近远日点与黄道俯视投影。 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'astro.js'), 'utf8');
const context = {
  window: {},
  SOLAR: {
    CONFIG: { time: { j2000: 2451545 }, astro: {} },
    DATA: { bodies: [] }
  },
  Math: Math,
  isFinite: isFinite
};
vm.runInNewContext(source, context);
const astro = context.SOLAR.Astro;
const orb = { a: 2, e: 0.5, i: 60, L: 90, peri: 90, node: 0 };
const jd = 2451545;
const points = astro.orbitPathAu(orb, jd, 128);

function near(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-9, message + ': ' + actual + ' != ' + expected);
}

assert.strictEqual(points.length, 129);
near(points[0].r, 1, '近日点应为 a(1-e) AU');
near(points[64].r, 3, '远日点应为 a(1+e) AU');
near(points[0].x, 0, '近点经度在 Y 方向');
near(points[0].y, 0.5, '60 度倾角的俯视投影');
near(points[0].z, Math.sqrt(3) / 2, '倾角对应的离面高度');

const now = astro.heliocentric(orb, jd);
near(now.x, points[0].x, '当前相位位于近日点时的 X');
near(now.y, points[0].y, '当前相位位于近日点时的 Y');

console.log('OK: 轨道小图 AU 几何与当前相位');
