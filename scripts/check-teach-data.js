#!/usr/bin/env node
/* 教学数据契约：目录层级、来源引用与场景参数。只读，不加载渲染模块。 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', 'assets', 'js', 'teach-data.js');
const solar = {};
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

function checkStep(step, where) {
  count++;
  checkId(step, where);
  if (!step.title || !step.text) errors.push(where + ': 缺少标题或正文');
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
