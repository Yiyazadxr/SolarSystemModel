#!/usr/bin/env node
/* 教学数据契约：目录层级、来源引用与场景参数。只读，不加载渲染模块。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'assets', 'js', 'teach-data.js');
const i18nFile = path.join(__dirname, '..', 'assets', 'js', 'i18n.js');

/* i18n.js 首行是 window.SOLAR = window.SOLAR || {}，之后一律裸写 SOLAR。
   所以沙箱必须让 window 指向自身（bare 标识符才能解析到 SOLAR）。 */
const sandbox = { console: console };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(i18nFile, 'utf8'), sandbox, { filename: i18nFile });
const solar = sandbox.window.SOLAR;
vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window: { SOLAR: solar }, SOLAR: solar }, { filename: file });
const data = solar.TEACH_DATA;
const errors = [];
const ids = new Set();
const sources = new Set((data.meta.sources || []).map(source => source.key));
const rigs = new Set(['globe', 'orrery', 'ground', 'moonsync', 'none']);
let count = 0;

function checkId(item, where) {
  if (!item || typeof item.id !== 'string' || !item.id) errors.push(where + ': 缺少 id');
  else if (ids.has(item.id)) errors.push(where + ': 重复 id ' + item.id);
  else ids.add(item.id);
}

/* 词键存在性：teach-data 里的 title / text / ask / gotoDemo / summary / points
   全是 i18n 键名，渲染时才 SOLAR.t 取值。SOLAR.t 缺键时原样返回路径本身，
   所以"取出值 === 键名"就是拼错的判据——data-i18n 门禁扫不到这些动态键。 */
function checkKey(value, where) {
  if (typeof value !== 'string' || !value) return;
  if (value.indexOf('teach.') !== 0) return;
  if (solar.t && solar.t(value) === value) {
    errors.push(where + ': 词键在 i18n.js 中不存在 -> ' + value);
  }
}

function checkStep(step, where) {
  count++;
  checkId(step, where);
  if (!step.title || !step.text) errors.push(where + ': 缺少标题或正文');
  checkKey(step.title, where + '.title');
  checkKey(step.text, where + '.text');
  checkKey(step.ask, where + '.ask');
  checkKey(step.gotoDemo, where + '.gotoDemo');
  if (step.summary) checkKey(step.summary, where + '.summary');
  (step.points || []).forEach(function (point, i) { checkKey(point, where + '.points[' + i + ']'); });
  if (!sources.has(step.src)) errors.push(where + ': 无效来源 ' + step.src);
  if (!step.state || !rigs.has(step.state.rig)) errors.push(where + ': 无效装置');
  if (step.cameraOverride) errors.push(where + ': 旧 cameraOverride 字段');
  if (step.camera) {
    ['polar', 'azim', 'dist'].forEach(key => {
      if (step.camera[key] !== undefined &&
          (typeof step.camera[key] !== 'number' || !Number.isFinite(step.camera[key]))) {
        errors.push(where + ': 无效机位 ' + key);
      }
    });
    if (step.camera.dist !== undefined && step.camera.dist <= 0) errors.push(where + ': 机位距离必须为正');
    if (step.camera.focus && step.camera.focus !== 'sun') errors.push(where + ': 无效 focus');
  }
  if (step.termBar && step.termBar !== true && step.termBar !== 'tracks') errors.push(where + ': 无效 termBar');
  if (step.termBar === 'tracks' && step.state.rig !== 'ground') errors.push(where + ': tracks 需要 ground 装置');
  const params = step.state.params || {};
  if (params.shapeScene === 'solareclipse' && params.moonPhaseDay !== undefined && params.moonPhaseDay !== 0) {
    errors.push(where + ': 日食需要朔月相 (0)');
  }
  if (params.shapeScene === 'eclipse' && params.moonPhaseDay !== undefined && Math.abs(params.moonPhaseDay - 14.77) > 0.1) {
    errors.push(where + ': 月食需要望月相 (约 14.77)');
  }
}

(data.chapters || []).forEach(chapter => {
  checkId(chapter, 'chapter');
  if (!chapter.sections || !chapter.sections.length) errors.push(chapter.id + ': 缺少 sections');
  (chapter.sections || []).forEach(section => {
    checkId(section, chapter.id + '/section');
    if (!section.lessons || !section.lessons.length) errors.push(section.id + ': 缺少 lessons');
    (section.lessons || []).forEach(lesson => {
      checkId(lesson, section.id + '/lesson');
      if (!lesson.steps || !lesson.steps.length) errors.push(lesson.id + ': 缺少 steps');
      (lesson.steps || []).forEach(step => checkStep(step, lesson.id + '/step'));
    });
  });
});

if (!count) errors.push('没有教学步骤');
if (errors.length) {
  errors.forEach(error => console.error('ERR: ' + error));
  process.exitCode = 1;
} else {
  console.log('OK: ' + count + ' 个教学步骤，层级、来源与场景数据有效');
}
