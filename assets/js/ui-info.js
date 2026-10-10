/**
 * 界面层：信息卡的表格与九个分区渲染、选中 / 巡航联动。
 * 折叠状态与列表高亮在 SOLAR.UINav，跟随状态在 SOLAR.UITime，
 * 数字与单位格式化在 SOLAR.UIUtil，跨模块一律运行时限定名调用。
 * 依赖：config.js、data.js、i18n.js、astro.js、SOLAR.UIShared、
 *       SOLAR.UIUtil、SOLAR.UINav、SOLAR.UITime、SOLAR.Scene、SOLAR.Controls
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UIInfo = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA, A = SOLAR.Astro;
  var U = SOLAR.UIShared;
  var els = U.dom;

  /* ============ 信息卡：表格与分区渲染 ============ */

  function addTag(text) {
    var tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = text;
    els.infoTags.appendChild(tag);
  }

  /* 向指定表格追加一行；liveName 用于登记逐帧刷新单元格 */
  function addRow(table, fieldKey, value, liveName) {
    if (!table) return null;
    var row = document.createElement('tr');
    var key = document.createElement('td');
    var val = document.createElement('td');
    key.className = 'k';
    val.className = 'v';
    key.textContent = SOLAR.t('fields.' + fieldKey);
    val.textContent = value;
    if (liveName) {
      val.setAttribute('data-live', liveName);
      if (U.state.liveCells[liveName]) U.state.liveCells[liveName].push(val);
    }
    row.appendChild(key);
    row.appendChild(val);
    table.appendChild(row);
    return val;
  }

  function comparisonWidth(ratio) {
    if (!(ratio > 0)) return 0;
    return Math.max(2, Math.min(100, 50 + (Math.log(ratio) / Math.LN10) * 18));
  }

  function renderComparison(data) {
    els.infoCompare.textContent = '';
    var earth = null;
    for (var i = 0; i < D.bodies.length; i++) {
      if (D.bodies[i].id === 'earth') earth = D.bodies[i];
    }
    if (!earth) {
      SOLAR.UINav.setSectionHidden(els.secCompare, true);
      return;
    }

    var comparisons = [
      { key: 'diameter', value: data.radiusKm, earth: earth.radiusKm },
      { key: 'mass', value: data.massKg, earth: earth.massKg },
      { key: 'gravity', value: data.gravity, earth: earth.gravity }
    ];
    var count = 0;

    for (i = 0; i < comparisons.length; i++) {
      var item = comparisons[i];
      if (typeof item.value !== 'number' || typeof item.earth !== 'number' || item.earth === 0) continue;
      var ratio = item.value / item.earth;
      /* 比值过小（< 1%，含 NaN / 缺字段）没有对比意义——哈雷彗星直径只有
         地球的 0.0009 倍，显示成「0.001×」跟没有一样，直接不显示该行。 */
      if (!(ratio > 0.01)) continue;
      var row = document.createElement('div');
      var label = document.createElement('div');
      var title = document.createElement('span');
      var number = document.createElement('span');
      var bar = document.createElement('div');
      var fill = document.createElement('i');

      row.className = 'compare-row';
      label.className = 'label';
      title.textContent = SOLAR.t('fields.' + item.key);
      number.className = 'num';
      number.textContent = SOLAR.UIUtil.formatDecimal(ratio, ratio < 0.1 ? 3 : 2) + '×';
      bar.className = 'compare-bar';
      fill.style.width = comparisonWidth(ratio) + '%';

      label.appendChild(title);
      label.appendChild(number);
      bar.appendChild(fill);
      row.appendChild(label);
      row.appendChild(bar);
      els.infoCompare.appendChild(row);
      count++;
    }

    /* 全部行都被过滤时显示「暂无数据」，分组本身保留（不整块隐藏） */
    if (count === 0) {
      var empty = document.createElement('div');
      empty.className = 'compare-empty';
      empty.textContent = SOLAR.t('ui.compareEmpty');
      els.infoCompare.appendChild(empty);
    }
    SOLAR.UINav.setSectionHidden(els.secCompare, false);
  }

  function currentDistance(record) {
    if (!record || !record.data.orbital || !SOLAR.Scene || !SOLAR.Scene.distanceAuOf) return 0;
    return SOLAR.Scene.distanceAuOf(record.id);
  }

  function currentPhase(record) {
    if (!record || !record.data.orbital) return 0;
    var angle = A.trueAnomaly(record.data.orbital, SOLAR.time.jd) * 180 / Math.PI;
    angle = ((angle % 360) + 360) % 360;
    return angle;
  }

  /* 平均轨道速度：优先读数据字段，缺失时用 2πa/P 的偏心修正近似 */
  function orbitalSpeed(data) {
    var value = SOLAR.UIUtil.numOrNull(SOLAR.UIUtil.pick(data, ['meanOrbitVelocityKms', 'orbitalSpeed', 'meanOrbitalSpeed', 'orbitalVelocity']));
    if (value != null) return value;
    if (!data.orbital) return null;
    var a = data.orbital.a;
    if (typeof a !== 'number' || !(a > 0)) return null;
    var period = (typeof data.periodDays === 'number' && data.periodDays > 0)
      ? data.periodDays
      : 365.256 * Math.pow(a, 1.5);
    var e = (typeof data.orbital.e === 'number') ? data.orbital.e : 0;
    return (2 * Math.PI * a * C.astro.AU_KM / (period * 86400)) * (1 - e * e / 4);
  }

  /* 会合周期（相对地球）：优先读数据字段，缺失时由公转周期推算 */
  function synodicDays(data, id) {
    var value = SOLAR.UIUtil.numOrNull(SOLAR.UIUtil.pick(data, ['synodicDays', 'synodicPeriod']));
    if (value != null && value > 0) return value;
    if (!data.orbital || id === 'earth') return null;
    var p = Math.abs(data.periodDays);
    if (!(p > 0)) return null;
    var diff = Math.abs(1 / p - 1 / 365.256);
    if (!(diff > 1e-9)) return null;
    return 1 / diff;
  }

  /* 轨道分区 */
  function renderOrbitSection(record) {
    var table = els.infoOrbit;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (data.orbital) {
      addRow(table, 'distance', SOLAR.UIUtil.formatDistance(currentDistance(record)), 'distance');
      rows++;
    }
    if (typeof data.periodDays === 'number') {
      addRow(table, 'orbitalPeriod', SOLAR.UIUtil.formatPeriod(data.periodDays));
      rows++;
    }
    if (typeof data.perihelionJd === 'number') {
      addRow(table, 'perihelionDate', SOLAR.UIUtil.formatUtcDateFromJd(data.perihelionJd));
      rows++;
    }
    var speed = orbitalSpeed(data);
    if (speed != null) {
      addRow(table, 'orbitalSpeed', SOLAR.UIUtil.unitValue(speed, SOLAR.t('units.vel'), 2));
      rows++;
    }
    var syn = synodicDays(data, record.id);
    if (syn != null) {
      addRow(table, 'synodic', SOLAR.UIUtil.formatPeriod(syn));
      rows++;
    }

    if (data.orbital) {
      var el = A.planetElements ? A.planetElements(data.orbital, SOLAR.time.jd) : data.orbital;
      var a = el.a, e = el.e;
      var source = A.orbitSource ? A.orbitSource(data.orbital) : 'jpl';
      addRow(table, 'orbitSource', SOLAR.t('fields.source_' + source));
      rows++;
      addRow(table, 'semiMajor', SOLAR.UIUtil.formatAu(a));
      addRow(table, 'eccentricity', SOLAR.UIUtil.formatDecimal(e, 6));
      addRow(table, 'inclination', SOLAR.UIUtil.formatAngle(el.i, 6));

      var peri = SOLAR.UIUtil.numOrNull(SOLAR.UIUtil.pick(data, ['perihelionAu', 'perihelion', 'qAu']));
      var aph = SOLAR.UIUtil.numOrNull(SOLAR.UIUtil.pick(data, ['aphelionAu', 'aphelion', 'QAu']));
      if (peri == null && typeof a === 'number' && typeof e === 'number') peri = a * (1 - e);
      if (aph == null && typeof a === 'number' && typeof e === 'number') aph = a * (1 + e);
      if (peri != null) addRow(table, 'perihelion', SOLAR.UIUtil.formatAu(peri));
      if (aph != null) addRow(table, 'aphelion', SOLAR.UIUtil.formatAu(aph));

      addRow(table, 'phaseAngle', SOLAR.UIUtil.formatAngle(currentPhase(record), 2), 'phase');
      rows += 5;
    } else if (typeof data.orbitKm === 'number') {
      /* 卫星：以宿主为中心，补充偏心与轨道倾角 */
      addRow(table, 'semiMajor', SOLAR.UIUtil.unitValue(data.orbitKm, SOLAR.t('units.km'), 0));
      if (typeof data.eccentricity === 'number') addRow(table, 'eccentricity', SOLAR.UIUtil.formatDecimal(data.eccentricity, 6));
      if (typeof data.orbitInclinationDeg === 'number') {
        addRow(table, 'inclination', SOLAR.UIUtil.formatAngle(data.orbitInclinationDeg, 3));
      }
      rows++;
    }

    if (data.barycenter && data.barycenter.outsidePrimary) {
      addRow(table, 'barycenter', SOLAR.t('fields.barycenterOutside'));
      rows++;
    }

    if (typeof data.axialTilt === 'number') {
      addRow(table, 'axialTilt', SOLAR.UIUtil.formatAngle(data.axialTilt, 4));
      rows++;
    }
    SOLAR.UINav.setSectionHidden(els.secOrbit, rows === 0);
  }

  /* 物理分区 */
  function renderPhysicalSection(record) {
    var table = els.infoPhysical;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (typeof data.radiusKm === 'number') {
      addRow(table, 'diameter', SOLAR.UIUtil.unitValue(data.radiusKm * 2, SOLAR.t('units.km'), 1));
      rows++;
    }
    if (typeof data.massKg === 'number') {
      addRow(table, 'mass', SOLAR.UIUtil.formatScientific(data.massKg, 4) + ' ' + SOLAR.t('units.kg'));
      rows++;
    }
    if (typeof data.density === 'number') {
      addRow(table, 'density', SOLAR.UIUtil.unitValue(data.density, SOLAR.t('units.density'), 3));
      rows++;
    }
    if (typeof data.gravity === 'number') {
      addRow(table, 'gravity', SOLAR.UIUtil.unitValue(data.gravity, SOLAR.t('units.gravity'), 3));
      rows++;
    }
    if (typeof data.escapeVel === 'number') {
      addRow(table, 'escape', SOLAR.UIUtil.unitValue(data.escapeVel, SOLAR.t('units.vel'), 2));
      rows++;
    }
    if (typeof data.tempC === 'number') {
      addRow(table, 'temp', SOLAR.UIUtil.unitValue(data.tempC, SOLAR.t('units.c'), 1));
      rows++;
    }
    if (typeof data.rotationH === 'number') {
      addRow(table, 'rotation', SOLAR.UIUtil.formatRotation(data.rotationH));
      rows++;
    }
    if (typeof data.solarDayH === 'number' && data.solarDayH > 0) {
      addRow(table, 'solarDay', SOLAR.UIUtil.formatRotation(data.solarDayH));
      rows++;
    }
    if (typeof data.moonsCount === 'number') {
      addRow(table, 'moons', SOLAR.UIUtil.formatDecimal(data.moonsCount, 0) + (SOLAR.t('units.moons') ? ' ' + SOLAR.t('units.moons') : ''));
      rows++;
    }
    if (data.ring && typeof data.ring.innerKm === 'number' && typeof data.ring.outerKm === 'number') {
      addRow(table, 'ringSpan', SOLAR.UIUtil.formatDecimal(data.ring.innerKm, 0) + ' – ' +
        SOLAR.UIUtil.formatDecimal(data.ring.outerKm, 0) + ' ' + SOLAR.t('units.km'));
      rows++;
    }
    SOLAR.UINav.setSectionHidden(els.secPhysical, rows === 0);
  }

  /* 大气分区 */
  function renderAtmosphereSection(record) {
    var table = els.infoAtmosphere;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (data.atmosphereKey) {
      addRow(table, 'atmosphere', SOLAR.t('atm.' + data.atmosphereKey));
      rows++;
    } else if (typeof data.atmosphere === 'string' && data.atmosphere) {
      addRow(table, 'atmosphere', data.atmosphere);
      rows++;
    }

    var pressure = SOLAR.UIUtil.numOrNull(SOLAR.UIUtil.pick(data, ['surfacePressureBar', 'surfacePressure', 'pressure', 'atmPressure']));
    if (pressure != null) {
      var unit = SOLAR.UIUtil.pick(data, ['pressureUnit', 'surfacePressureUnit']);
      if (typeof unit !== 'string' || !unit) unit = SOLAR.t('units.bar');
      addRow(table, 'pressure', SOLAR.UIUtil.unitValue(pressure, unit, pressure < 0.001 ? 6 : 3));
      rows++;
    }
    SOLAR.UINav.setSectionHidden(els.secAtmosphere, rows === 0);
  }

  /* 发现与观测分区（字段缺失时整块跳过） */
  function renderDiscoverySection(record) {
    var table = els.infoDiscovery;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    var albedo = SOLAR.UIUtil.numOrNull(SOLAR.UIUtil.pick(data, ['bondAlbedo', 'albedo', 'geometricAlbedo']));
    if (albedo != null) { addRow(table, 'albedo', SOLAR.UIUtil.formatDecimal(albedo, 3)); rows++; }

    /* 视星等：既支持单一数值，也支持 { brightest, faintest } 区间 */
    var magnitude = SOLAR.UIUtil.pick(data, ['apparentMagnitude', 'magnitude', 'apparentMag']);
    var magText = '';
    if (typeof magnitude === 'number' && isFinite(magnitude)) {
      magText = SOLAR.UIUtil.formatFixed(magnitude, 2);
    } else if (magnitude && typeof magnitude === 'object') {
      var bright = SOLAR.UIUtil.numOrNull(magnitude.brightest);
      var faint = SOLAR.UIUtil.numOrNull(magnitude.faintest);
      if (bright != null && faint != null && bright !== faint) {
        magText = SOLAR.UIUtil.formatFixed(bright, 2) + ' … ' + SOLAR.UIUtil.formatFixed(faint, 2);
      } else if (bright != null) {
        magText = SOLAR.UIUtil.formatFixed(bright, 2);
      } else if (faint != null) {
        magText = SOLAR.UIUtil.formatFixed(faint, 2);
      }
    }
    if (magText) { addRow(table, 'magnitude', magText); rows++; }

    var discoverer = SOLAR.UIUtil.pick(data, ['discoverer', 'discoveredBy']);
    if (typeof discoverer === 'string' && discoverer) { addRow(table, 'discoverer', discoverer); rows++; }

    var year = SOLAR.UIUtil.pick(data, ['discoveryYear', 'discoveredYear', 'discovered']);
    if (typeof year === 'number' && isFinite(year)) {
      addRow(table, 'discoveryYear', String(Math.round(year)));
      rows++;
    } else if (typeof year === 'string' && year) {
      addRow(table, 'discoveryYear', year);
      rows++;
    }

    /* 发现时代：史前已知 / 历史时期 / 不适用 */
    var era = SOLAR.UIUtil.pick(data, ['discoveryEra']);
    if (typeof era === 'string' && era) {
      addRow(table, 'discoveryEra', SOLAR.t('ui.era' + era.charAt(0).toUpperCase() + era.slice(1)));
      rows++;
    }
    SOLAR.UINav.setSectionHidden(els.secDiscovery, rows === 0);
  }

  /* 卫星 / 成员列表（可点击飞行） */
  function moonItemsFor(record) {
    var items = [], i;
    if (record.id === 'sun') {
      for (i = 0; i < D.bodies.length; i++) {
        var body = D.bodies[i];
        var sub = '';
        if (body.orbital && typeof body.orbital.a === 'number') sub = SOLAR.UIUtil.formatAuShort(body.orbital.a);
        if (typeof body.periodDays === 'number') {
          sub += (sub ? ' · ' : '') + SOLAR.UIUtil.formatPeriod(body.periodDays);
        }
        items.push({ id: body.id, sub: sub });
      }
      return items;
    }
    for (i = 0; i < D.moons.length; i++) {
      var moon = D.moons[i];
      if (moon.parent !== record.id) continue;
      var text = '';
      if (typeof moon.orbitKm === 'number') text = SOLAR.UIUtil.unitValue(moon.orbitKm, SOLAR.t('units.km'), 0);
      if (typeof moon.periodDays === 'number') {
        text += (text ? ' · ' : '') + SOLAR.UIUtil.formatPeriod(moon.periodDays);
      }
      items.push({ id: moon.id, sub: text });
    }
    return items;
  }

  function renderMoonsSection(record) {
    var items = moonItemsFor(record);
    if (els.secMoonsTitle) {
      els.secMoonsTitle.textContent = SOLAR.t(record.id === 'sun' ? 'ui.membersTitle' : 'ui.moonsTitle');
    }
    SOLAR.UINav.setSectionHidden(els.secMoons, items.length === 0);
    if (!els.infoMoons) return;
    els.infoMoons.textContent = '';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var li = document.createElement('li');
      var button = document.createElement('button');
      var name = document.createElement('span');
      var sub = document.createElement('span');

      button.type = 'button';
      button.className = 'moon-item';
      name.textContent = SOLAR.UIUtil.localizedName(item.id);
      sub.className = 'moon-sub';
      sub.textContent = item.sub;
      button.appendChild(name);
      button.appendChild(sub);
      bindMoonButton(button, item.id);

      li.appendChild(button);
      els.infoMoons.appendChild(li);
    }

    /* 已建模数量与真实数量的差异提示 */
    var note = '';
    if (record.id !== 'sun' && typeof record.data.moonsCount === 'number') {
      if (record.data.moonsCount > items.length) {
        note = SOLAR.t('ui.moonsTitle') + ' ' + SOLAR.UIUtil.formatDecimal(record.data.moonsCount, 0) +
          (SOLAR.t('units.moons') ? ' ' + SOLAR.t('units.moons') : '') +
          ' · ' + SOLAR.t('ui.modeled') + ' ' + items.length;
      }
    }
    if (els.infoMoonsNote) {
      els.infoMoonsNote.textContent = note;
      els.infoMoonsNote.hidden = !note;
    }
  }

  /* 点击卫星：选中该天体（内部会调用 Controls.flyTo 飞向它） */
  function bindMoonButton(button, id) {
    button.addEventListener('click', function () { select(id); });
  }

  /* 全部数据（兜底分区，保持原有的扁平列表） */
  function renderDataSection(record) {
    var table = els.infoTable;
    var data = record.data;
    var rows = 0;
    if (table) table.textContent = '';

    if (data.orbital) {
      addRow(table, 'distance', SOLAR.UIUtil.formatDistance(currentDistance(record)), 'distance');
      rows++;
    }
    if (typeof data.radiusKm === 'number') {
      addRow(table, 'diameter', SOLAR.UIUtil.unitValue(data.radiusKm * 2, SOLAR.t('units.km'), 1));
      rows++;
    }
    if (typeof data.massKg === 'number') {
      addRow(table, 'mass', SOLAR.UIUtil.formatScientific(data.massKg, 4) + ' ' + SOLAR.t('units.kg'));
      rows++;
    }
    if (typeof data.density === 'number') {
      addRow(table, 'density', SOLAR.UIUtil.unitValue(data.density, SOLAR.t('units.density'), 3));
      rows++;
    }
    if (typeof data.gravity === 'number') {
      addRow(table, 'gravity', SOLAR.UIUtil.unitValue(data.gravity, SOLAR.t('units.gravity'), 3));
      rows++;
    }
    if (typeof data.escapeVel === 'number') {
      addRow(table, 'escape', SOLAR.UIUtil.unitValue(data.escapeVel, SOLAR.t('units.vel'), 2));
      rows++;
    }
    if (typeof data.tempC === 'number') {
      addRow(table, 'temp', SOLAR.UIUtil.unitValue(data.tempC, SOLAR.t('units.c'), 1));
      rows++;
    }
    if (typeof data.rotationH === 'number') { addRow(table, 'rotation', SOLAR.UIUtil.formatRotation(data.rotationH)); rows++; }
    if (typeof data.periodDays === 'number') { addRow(table, 'orbitalPeriod', SOLAR.UIUtil.formatPeriod(data.periodDays)); rows++; }
    if (typeof data.moonsCount === 'number') {
      addRow(table, 'moons', SOLAR.UIUtil.formatDecimal(data.moonsCount, 0) + (SOLAR.t('units.moons') ? ' ' + SOLAR.t('units.moons') : ''));
      rows++;
    }
    if (data.atmosphereKey) { addRow(table, 'atmosphere', SOLAR.t('atm.' + data.atmosphereKey)); rows++; }

    if (typeof data.solarDayH === 'number' && data.solarDayH > 0) {
      addRow(table, 'solarDay', SOLAR.UIUtil.formatRotation(data.solarDayH));
      rows++;
    }
    if (data.orbital) {
      addRow(table, 'semiMajor', SOLAR.UIUtil.unitValue(data.orbital.a, SOLAR.t('units.au'), 6));
      addRow(table, 'eccentricity', SOLAR.UIUtil.formatDecimal(data.orbital.e, 6));
      addRow(table, 'inclination', SOLAR.UIUtil.formatAngle(data.orbital.i, 6));
      rows += 3;
    } else if (typeof data.orbitKm === 'number') {
      addRow(table, 'semiMajor', SOLAR.UIUtil.unitValue(data.orbitKm, SOLAR.t('units.km'), 0));
      rows++;
    }
    if (typeof data.axialTilt === 'number') {
      addRow(table, 'axialTilt', SOLAR.UIUtil.formatAngle(data.axialTilt, 4));
      rows++;
    }
    if (data.orbital) {
      addRow(table, 'phaseAngle', SOLAR.UIUtil.formatAngle(currentPhase(record), 2), 'phase');
      rows++;
    }
    SOLAR.UINav.setSectionHidden(els.secData, rows === 0);
  }

  function renderInfo(record) {
    if (!record || !els.panelBody) return;
    var data = record.data;
    var text = SOLAR.UIUtil.localizedRecord(record);

    els.panelEmpty.hidden = true;
    els.panelBody.hidden = false;
    if (els.infoPanel) {
      els.infoPanel.classList.remove('collapsed');
      /* 设置面板打开期间被自动收起的信息栏保持收起，避免被重新渲染时闪回。 */
      if (U.state.infoCollapsedBySettings && els.settingsPanel && !els.settingsPanel.hidden) {
        els.infoPanel.classList.add('collapsed');
      }
    }
    els.infoType.textContent = SOLAR.t('type.' + record.type);
    els.infoName.textContent = text.name || record.id;
    /* 简介 / 冷知识：优先词包，缺失时回退到数据里的 summaryKey / factKey */
    var descText = text.desc || (data.summaryKey ? SOLAR.UIUtil.tOrEmpty(data.summaryKey) : '');
    var factText = text.fact || (data.factKey ? SOLAR.UIUtil.tOrEmpty(data.factKey) : '');
    els.infoDesc.textContent = descText;
    els.infoFact.textContent = factText;
    SOLAR.UINav.setSectionHidden(els.secFact, !factText);

    els.infoTags.textContent = '';
    if (typeof data.periodDays === 'number') {
      addTag(SOLAR.t('fields.orbitalPeriod') + ' ' + SOLAR.UIUtil.formatPeriod(data.periodDays));
    }
    if (typeof data.moonsCount === 'number') {
      addTag(SOLAR.t('fields.moons') + ' ' + SOLAR.UIUtil.formatDecimal(data.moonsCount, 0) + SOLAR.t('units.moons'));
    }
    if (typeof data.rotationH === 'number') {
      addTag(SOLAR.t('fields.rotation') + ' ' + SOLAR.UIUtil.formatRotation(data.rotationH));
    }
    if (data.tidallyLocked) addTag(SOLAR.t('ui.locked'));
    if (!els.infoTags.children.length && typeof data.radiusKm === 'number') {
      addTag(SOLAR.t('fields.diameter') + ' ' + SOLAR.UIUtil.unitValue(data.radiusKm * 2, SOLAR.t('units.km'), 1));
    }

    /* 示意压缩标注：如实告知"图上看到的"被压缩了多少（倍数以地球为基准，1 = 未压缩）。
       演示模式无法使用真实比例（见 config.profiles），不标注就等于误导。 */
    try {
      if (SOLAR.Scene && typeof SOLAR.Scene.getScaleCompress === 'function') {
        var comp = SOLAR.Scene.getScaleCompress(record.id);
        if (comp) {
          var parts = [];
          if (typeof comp.radius === 'number' && isFinite(comp.radius)) {
            parts.push(SOLAR.t('fields.radiusScale') + ' ×' + comp.radius);
          }
          if (typeof comp.distance === 'number' && isFinite(comp.distance)) {
            parts.push(SOLAR.t('fields.distScale') + ' ×' + comp.distance);
          }
          if (parts.length) addTag(parts.join(' · '));
        }
      }
    } catch (e2) { /* 压缩比查询失败不影响信息卡 */ }

    /* 逐帧刷新单元格登记：每次重绘前清空 */
    U.state.liveCells.distance.length = 0;
    U.state.liveCells.phase.length = 0;

    renderComparison(data);
    renderOrbitSection(record);
    renderPhysicalSection(record);
    renderAtmosphereSection(record);
    renderMoonsSection(record);
    renderDiscoverySection(record);
    renderDataSection(record);

    SOLAR.UINav.applySectionStates();
    SOLAR.UITime.refreshFollowState(true);
  }

  function showEmptyPanel() {
    U.state.selectedRecord = null;
    U.state.liveCells.distance.length = 0;
    U.state.liveCells.phase.length = 0;
    if (els.panelEmpty) els.panelEmpty.hidden = false;
    if (els.panelBody) els.panelBody.hidden = true;
    /* 未选中任何天体时整块右侧面板收起，避免遮挡画面 */
    if (els.infoPanel) els.infoPanel.classList.add('collapsed');
    if (els.infoFollow) els.infoFollow.hidden = true;
    if (els.btnUnfollow) els.btnUnfollow.hidden = true;
  }

  /* 只更新选中态与信息面板，不发起飞行（飞行由调用方自己安排） */
  function applySelection(id) {
    if (id == null) {
      U.state.selectedId = null;
      U.state.selectedRecord = null;
      if (SOLAR.Controls && SOLAR.Controls.setFollow) SOLAR.Controls.setFollow(null);
      showEmptyPanel();
      SOLAR.UINav.updateActiveItem();
      U.state.lastFollowId = null;
      return;
    }

    var record = SOLAR.UIUtil.findRecord(id);
    if (!record) {
      applySelection(null);
      return;
    }

    U.state.selectedId = id;
    U.state.selectedRecord = record;
    renderInfo(record);
    SOLAR.UINav.updateActiveItem();
  }

  function select(id) {
    if (id == null) {
      applySelection(null);
      return;
    }
    if (!SOLAR.UIUtil.findRecord(id)) {
      applySelection(null);
      return;
    }
    /* 交互选中的语义是“点击即飞”：飞行完成前先更新面板 */
    if (SOLAR.Controls && SOLAR.Controls.flyTo) {
      var demoMode = !SOLAR.Teach || !SOLAR.Teach.isActive || !SOLAR.Teach.isActive();
      SOLAR.Controls.flyTo(id,
        !!(SOLAR.Scene && SOLAR.Scene.isAligned && SOLAR.Scene.isAligned()), demoMode);
    }
    applySelection(id);
  }

  function onSelectId(id) {
    select(id);
  }

  /* 巡航切到新天体：controls 已经安排好飞行，这里只同步信息面板，
     避免走 select() 再触发一次 flyTo 把当前飞行打断重来。 */
  function onCruiseId(id) {
    applySelection(id);
  }

  /* 逐帧刷新登记过的距离 / 相位单元格 */
  function updateLiveCells() {
    if (!U.state.selectedRecord || !U.state.selectedRecord.data.orbital) return;
    var i;
    for (i = 0; i < U.state.liveCells.distance.length; i++) {
      U.state.liveCells.distance[i].textContent = SOLAR.UIUtil.formatDistance(currentDistance(U.state.selectedRecord));
    }
    for (i = 0; i < U.state.liveCells.phase.length; i++) {
      U.state.liveCells.phase[i].textContent = SOLAR.UIUtil.formatAngle(currentPhase(U.state.selectedRecord), 2);
    }
  }

  return {
    select: select,
    applySelection: applySelection,
    onSelectId: onSelectId,
    onCruiseId: onCruiseId,
    renderInfo: renderInfo,
    showEmptyPanel: showEmptyPanel,
    updateLiveCells: updateLiveCells
  };
})();
