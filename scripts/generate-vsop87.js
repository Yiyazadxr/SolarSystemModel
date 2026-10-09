#!/usr/bin/env node
'use strict';

/* 从 IMCCE 原始主版本生成离线 ES5 要素级数；--check 不改输出。 */
var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');
var root = path.resolve(__dirname, '..');
var cache = path.join(root, 'assets', 'vsop87');
var output = path.join(root, 'assets', 'js', 'vsop87.js');
var ids = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
var ext = ['mer', 'ven', 'emb', 'mar', 'jup', 'sat', 'ura', 'nep'];
var phase0 = [4.40260884240, 3.17614669689, 1.75347045953, 6.20347611291,
  0.59954649739, 0.87401675650, 5.48129387159, 5.31188628676,
  5.19846674103, 1.62790523337, 2.35555589827, 3.81034454697];
var rate = [26087.9031415742, 10213.2855462110, 6283.0758499914, 3340.6124266998,
  529.6909650946, 213.2990954380, 74.7815985673, 38.1330356378,
  77713.7714681205, 84334.6615813083, 83286.9142695536, 83997.0911355954];
var threshold = Number(process.argv.indexOf('--full') >= 0 ? 0 :
  (process.argv.indexOf('--threshold') >= 0 ? process.argv[process.argv.indexOf('--threshold') + 1] : 1.2e-8));
if (!isFinite(threshold) || threshold < 0) throw new Error('Invalid threshold');

function download(name) {
  console.log('Downloading ' + name);
  return childProcess.execFileSync('curl', ['--fail', '--silent', '--show-error', '--retry', '3', '--max-time', '300',
    'https://ftp.imcce.fr/pub/ephem/planets/vsop87/' + name], { maxBuffer: 4 * 1024 * 1024 }).toString('ascii');
}

function parse(text, id) {
  var groups = [[], [], [], [], [], []];
  var lines = text.split(/\r?\n/);
  var expected = 0, count = 0, coord = 0, order = 0;
  lines.forEach(function (line) {
    if (!line.trim()) return;
    if (line.indexOf('VSOP87 VERSION') >= 0) {
      if (expected) throw new Error(id + ': incomplete series');
      coord = Number(line.slice(41, 42)) - 1;
      order = Number(line.slice(59, 60));
      expected = Number(line.slice(60, 67));
      if (coord < 0 || coord > 5 || order < 0 || order > 5 || !expected) throw new Error(id + ': invalid header ' + line);
      if (!groups[coord][order]) groups[coord][order] = [];
      return;
    }
    if (!expected || line.slice(1, 2) !== '0' || Number(line.slice(3, 4)) !== coord + 1 ||
        Number(line.slice(4, 5)) !== order) throw new Error(id + ': invalid term ' + line);
    expected--; count++;
    var s = Number(line.slice(46, 61)), k = Number(line.slice(61, 79));
    var a = Number(line.slice(79, 97)), b = Number(line.slice(97, 111)), c = Number(line.slice(111, 131));
    if (!isFinite(s + k + a + b + c)) throw new Error(id + ': invalid coefficient');
    if (!a) {
      a = Math.sqrt(s * s + k * k);
      b = Math.atan2(-s, k);
      c = 0;
      for (var j = 0; j < 12; j++) {
        var multiplier = Number(line.slice(10 + j * 3, 13 + j * 3));
        b += multiplier * phase0[j];
        c += multiplier * rate[j];
      }
    }
    groups[coord][order].push([a, b, c]);
  });
  if (expected || count < 1000) throw new Error(id + ': incomplete file (' + count + ' terms)');
  return { groups: groups, count: count };
}

function evaluate(groups, t) {
  return groups.map(function (orders, coord) {
    var total = 0, power = 1;
    for (var order = 0; order < orders.length; order++) {
      var terms = orders[order] || [];
      for (var j = 0; j < terms.length; j++) {
        var term = terms[j];
        total += power * term[0] * Math.cos(term[1] + term[2] * t);
      }
      power *= t;
    }
    return coord === 1 ? ((total % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) : total;
  });
}

function compact(groups) {
  return groups.map(function (orders) {
    return orders.map(function (terms) {
      return (terms || []).filter(function (term) { return term[0] >= threshold; }).map(function (term) {
        /* 原始 11 位小数振幅原样保留；相位和频率保留足够位数以覆盖千年跨度。 */
        return [Number(term[0].toPrecision(12)), Number(term[1].toFixed(11)), Number(term[2].toFixed(10))];
      });
    });
  });
}

function compare(full, reduced) {
  var max = 0;
  for (var t = -4; t <= 4.0001; t += 0.25) {
    var x = evaluate(full, t), y = evaluate(reduced, t);
    for (var i = 0; i < 6; i++) {
      var diff = Math.abs(x[i] - y[i]);
      if (i === 1) diff = Math.min(diff, 2 * Math.PI - diff);
      if (diff > max) max = diff;
    }
  }
  return max;
}

function checkOfficial(data, text) {
  var blocks = text.split(/\r?\n\s*\r?\n/);
  var checked = 0, worst = 0;
  var names = ['MERCURY', 'VENUS', 'EARTH-MOON', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'];
  blocks.forEach(function (block) {
    var lines = block.trim().split(/\r?\n/);
    if (lines.length !== 3 || lines[0].indexOf('VSOP87   ') !== 0) return;
    var header = /VSOP87\s+([A-Z-]+)\s+JD([0-9.]+)/.exec(lines[0]);
    if (!header) return;
    var id = ids[names.indexOf(header[1])];
    if (!id) return;
    var first = /a\s+(-?[0-9.]+)\s+au\s+k\s+(-?[0-9.]+)\s+rad\s+q\s+(-?[0-9.]+)/.exec(lines[1]);
    var second = /l\s+(-?[0-9.]+)\s+rad\s+h\s+(-?[0-9.]+)\s+rad\s+p\s+(-?[0-9.]+)/.exec(lines[2]);
    if (!first || !second) throw new Error('Invalid official check: ' + block);
    var actual = evaluate(data[id], (Number(header[2]) - 2451545) / 365250);
    var expected = [Number(first[1]), Number(second[1]), Number(first[2]), Number(second[2]),
      Number(first[3]), Number(second[3])];
    for (var i = 0; i < 6; i++) worst = Math.max(worst, Math.abs(actual[i] - expected[i]));
    checked++;
  });
  if (checked !== 80 || worst > 1e-9) throw new Error('Official VSOP87 check: ' + checked + ' epochs, max error ' + worst);
  console.log('Official full vsop87.chk: ' + checked + ' epochs × 6 elements, max error ' + worst.toExponential(3));
}

function main() {
  return Promise.all(ext.map(function (suffix) {
    var filename = 'VSOP87.' + suffix;
    var local = path.join(cache, filename);
    if (fs.existsSync(local)) return fs.readFileSync(local, 'ascii');
    if (process.argv.indexOf('--check') >= 0) throw new Error('Missing cache: ' + local);
    var text = download(filename);
    if (!fs.existsSync(cache)) fs.mkdirSync(cache);
    fs.writeFileSync(local, text, 'ascii');
    return text;
  })).then(function (texts) {
    var data = {}, fullData = {}, total = 0, retained = 0, maximum = 0;
    texts.forEach(function (text, i) {
      var parsed = parse(text, ids[i]);
      var groups = compact(parsed.groups);
      fullData[ids[i]] = parsed.groups;
      data[ids[i]] = groups;
      total += parsed.count;
      groups.forEach(function (orders) { orders.forEach(function (terms) { retained += terms.length; }); });
      maximum = Math.max(maximum, compare(parsed.groups, groups));
    });
    var source = '/* 由 scripts/generate-vsop87.js 从 IMCCE VSOP87 主版本生成，勿手改。\n' +
      ' * 地球项为地月质心 EMB；JD(UTC) 近似动力学时 TT。 */\n' +
      'window.SOLAR = window.SOLAR || {};\n' +
      'SOLAR.VSOP87 = (function () {\n  var series = ' + JSON.stringify(data) + ';\n' +
      '  function elements(id, t) {\n    var groups = series[id];\n' +
      '    if (!groups || !isFinite(t)) return null;\n' +
      '    var values = [];\n    for (var i = 0; i < 6; i++) {\n' +
      '      var sum = 0, power = 1, orders = groups[i];\n' +
      '      for (var j = 0; j < orders.length; j++) {\n' +
      '        var terms = orders[j];\n' +
      '        for (var k = 0; k < terms.length; k++) {\n' +
      '          var term = terms[k];\n' +
      '          sum += power * term[0] * Math.cos(term[1] + term[2] * t);\n' +
      '        }\n        power *= t;\n      }\n      values[i] = sum;\n    }\n' +
      '    return values;\n  }\n  return { elements: elements };\n})();\n';
    var chkFile = path.join(cache, 'vsop87.chk');
    if (!fs.existsSync(chkFile)) {
      if (process.argv.indexOf('--check') >= 0) throw new Error('Missing official check: ' + chkFile);
      fs.writeFileSync(chkFile, download('vsop87.chk'), 'ascii');
    }
    checkOfficial(fullData, fs.readFileSync(chkFile, 'ascii'));
    console.log('VSOP87: ' + total + ' terms, retained ' + retained + ', ' + Buffer.byteLength(source) +
      ' bytes, max element difference (±4000y grid): ' + maximum.toExponential(3));
    if (process.argv.indexOf('--check') >= 0) {
      if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== source) throw new Error('vsop87.js is stale');
    } else fs.writeFileSync(output, source);
  });
}

main().catch(function (err) { console.error(err); process.exitCode = 1; });
