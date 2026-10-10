/**
 * 界面层基础工具：DOM 查询、数字与单位格式化、天体记录检索。
 * 纯函数集中于此，供 ui-dom / ui-nav / ui-info / ui-settings / ui-time /
 * ui-shell / ui.js 共同调用；不持有 dom 缓存与跨模块状态。
 * 依赖：config.js、data.js、i18n.js、astro.js、SOLAR.UIShared（state.unitSystem）
 */
window.SOLAR = window.SOLAR || {};

SOLAR.UIUtil = (function () {
  'use strict';

  var C = SOLAR.CONFIG, D = SOLAR.DATA, A = SOLAR.Astro;
  var U = SOLAR.UIShared;

  /* ============ 基础工具 ============ */

  function byId(id) {
    return document.getElementById(id);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function setClass(el, name, on) {
    if (!el) return;
    if (on) el.classList.add(name);
    else el.classList.remove(name);
  }

  /* 判断节点是否在指定容器内（用于点击外部关闭弹层） */
  function inside(parent, node) {
    while (node) {
      if (node === parent) return true;
      node = node.parentNode;
    }
    return false;
  }

  function pad(value, size) {
    var text = String(Math.abs(value));
    while (text.length < size) text = '0' + text;
    return (value < 0 ? '−' : '') + text;
  }

  function colorCss(color) {
    var value = typeof color === 'number' ? color : C.colors.accent;
    return '#' + ('000000' + value.toString(16)).slice(-6);
  }

  function trimZeros(text) {
    return text.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  }

  function formatDecimal(value, decimals) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var negative = value < 0;
    var fixed = Math.abs(value).toFixed(decimals == null ? 2 : decimals);
    fixed = trimZeros(fixed);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '−' : '') + parts.join('.');
  }

  function superscript(value) {
    var map = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    var text = String(value), out = '';
    for (var i = 0; i < text.length; i++) out += map[text.charAt(i)] || text.charAt(i);
    return out;
  }

  function formatScientific(value, significant) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    if (value === 0) return '0';
    var pieces = Math.abs(value).toExponential((significant || 4) - 1).split('e');
    var mantissa = trimZeros(pieces[0]);
    var exponent = parseInt(pieces[1], 10);
    return (value < 0 ? '−' : '') + mantissa + '×10' + superscript(exponent);
  }

  function formatSmart(value, decimals) {
    var abs = Math.abs(value);
    if ((abs >= 1e12) || (abs > 0 && abs < 0.0001)) return formatScientific(value, 4);
    return formatDecimal(value, decimals == null ? 2 : decimals);
  }

  function unitValue(value, unit, decimals) {
    return formatSmart(value, decimals) + (unit ? ' ' + unit : '');
  }

  function formatPeriod(days) {
    if (typeof days !== 'number') return '—';
    if (Math.abs(days) >= 730) {
      return formatDecimal(days / 365.256, 2) + ' ' + SOLAR.t('units.years');
    }
    return formatDecimal(days, Math.abs(days) < 10 ? 3 : 2) + ' ' + SOLAR.t('units.days');
  }

  function formatRotation(hours) {
    if (typeof hours !== 'number') return '—';
    if (Math.abs(hours) >= 48) {
      return formatDecimal(hours / 24, 2) + ' ' + SOLAR.t('units.days');
    }
    return formatDecimal(hours, 2) + ' ' + SOLAR.t('units.hours');
  }

  /* 距离：受设置面板中的单位偏好（AU / km）控制 */
  function formatAu(au) {
    if (U.state.unitSystem === 'km') return unitValue(au * C.astro.AU_KM, SOLAR.t('units.km'), 0);
    return unitValue(au, SOLAR.t('units.au'), 6);
  }

  function formatAuShort(au) {
    if (U.state.unitSystem === 'km') return formatDecimal(au * C.astro.AU_KM, 0) + ' ' + SOLAR.t('units.km');
    return formatDecimal(au, 2) + ' ' + SOLAR.t('units.au');
  }

  /* 固定小数位（不裁剪末尾 0），用于视星等等需要统一位数的数值 */
  function formatFixed(value, decimals) {
    if (typeof value !== 'number' || !isFinite(value)) return '—';
    var text = Math.abs(value).toFixed(decimals == null ? 2 : decimals);
    return (value < 0 ? '−' : '') + text;
  }

  /* 角度统一用小数显示，避免极小倾角被格式化成科学计数法 */
  function formatAngle(value, decimals) {
    return formatDecimal(value, decimals == null ? 4 : decimals) + ' ' + SOLAR.t('units.deg');
  }

  function formatDistance(au) {
    var km = au * C.astro.AU_KM;
    if (U.state.unitSystem === 'km') return formatDecimal(km, 0) + ' ' + SOLAR.t('units.km');
    var precision = Math.abs(au) < 0.01 ? 6 : 3;
    return formatDecimal(au, precision) + ' ' + SOLAR.t('units.au') + ' · ' +
      formatDecimal(km, 0) + ' ' + SOLAR.t('units.km');
  }

  function bodyCount() {
    return (D.bodies ? D.bodies.length : 0) + 1 + (D.moons ? D.moons.length : 0) + 1;
  }

  /* 数据字段可能由数据同事补充：按候选键名逐个探测，缺失返回 null */
  function pick(data, keys) {
    if (!data) return null;
    for (var i = 0; i < keys.length; i++) {
      if (data[keys[i]] != null) return data[keys[i]];
    }
    return null;
  }

  function numOrNull(value) {
    return (typeof value === 'number' && isFinite(value)) ? value : null;
  }

  function findRecord(id) {
    var i;
    if (id === 'sun') return { id: id, data: D.sun, type: 'star', section: 'bodies' };
    for (i = 0; i < D.bodies.length; i++) {
      if (D.bodies[i].id === id) {
        return { id: id, data: D.bodies[i], type: D.bodies[i].type, section: 'bodies' };
      }
    }
    for (i = 0; i < D.moons.length; i++) {
      if (D.moons[i].id === id) return { id: id, data: D.moons[i], type: 'moon', section: 'moons' };
    }
    for (i = 0; i < D.comets.length; i++) {
      if (D.comets[i].id === id) return { id: id, data: D.comets[i], type: 'comet', section: 'comet' };
    }
    return null;
  }

  function localizedRecord(record) {
    var dict = SOLAR.I18N[SOLAR.lang] || SOLAR.I18N.en;
    var section = dict[record.section] || {};
    var entry = section[record.id];
    if (entry) return entry;
    /* 词包缺失时退化为首字母大写的 id，避免出现原始 key */
    var id = String(record.id || '');
    return { name: id.charAt(0).toUpperCase() + id.slice(1), desc: '', fact: '' };
  }

  /* 取词：缺键时返回空串（用于 summaryKey 之类的可选文案） */
  function tOrEmpty(path) {
    var value = SOLAR.t(path);
    return (value === path) ? '' : value;
  }

  function localizedName(id) {
    var record = findRecord(id);
    return record ? localizedRecord(record).name : id;
  }

  function nameIn(id, lang) {
    var record = findRecord(id);
    if (!record) return '';
    var dict = SOLAR.I18N[lang] || {};
    var section = dict[record.section] || {};
    var entry = section[id];
    return (entry && entry.name) ? entry.name : '';
  }

  function formatUtcDateFromJd(jd) {
    if (typeof jd !== 'number' || !isFinite(jd)) return '—';
    var date = A.fromJulian(jd);
    if (!date || !isFinite(date.getTime())) return '—';
    return pad(date.getUTCFullYear(), 4) + '-' + pad(date.getUTCMonth() + 1, 2) + '-' +
      pad(date.getUTCDate(), 2);
  }

  return {
    byId: byId,
    hasOwn: hasOwn,
    setClass: setClass,
    inside: inside,
    pad: pad,
    colorCss: colorCss,
    trimZeros: trimZeros,
    formatDecimal: formatDecimal,
    superscript: superscript,
    formatScientific: formatScientific,
    formatSmart: formatSmart,
    unitValue: unitValue,
    formatPeriod: formatPeriod,
    formatRotation: formatRotation,
    formatAu: formatAu,
    formatAuShort: formatAuShort,
    formatFixed: formatFixed,
    formatAngle: formatAngle,
    formatDistance: formatDistance,
    bodyCount: bodyCount,
    pick: pick,
    numOrNull: numOrNull,
    findRecord: findRecord,
    localizedRecord: localizedRecord,
    tOrEmpty: tOrEmpty,
    localizedName: localizedName,
    nameIn: nameIn,
    formatUtcDateFromJd: formatUtcDateFromJd
  };
})();
