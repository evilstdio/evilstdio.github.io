(function (global) {
  'use strict';

  var TEX_W = 1280;
  var SCR_H = 960;
  var PLATE_H = 48;
  var TEX_H = SCR_H + PLATE_H;
  var MARGIN = 30;

  var GLOW_W = 256, GLOW_H = 192;

  var THEMES = {
    green: { base: [0.20, 1.00, 0.55], label: 'P1 GREEN' },
    amber: { base: [1.00, 0.70, 0.24], label: 'P3 AMBER' },
    ice:   { base: [0.70, 0.88, 1.00], label: 'P4 WHITE' }
  };

  var SCR = {
    TEX_W: TEX_W, TEX_H: TEX_H, SCR_H: SCR_H,
    GLOW_W: GLOW_W, GLOW_H: GLOW_H,
    V0: PLATE_H / TEX_H,
    V1: 1.0,
    PLATE_V0: 0,
    PLATE_V1: (PLATE_H - 4) / TEX_H,
    dirty: true,
    themeName: 'green',
    cols: 80, rows: 32
  };


  var canvas = document.createElement('canvas');
  canvas.width = TEX_W; canvas.height = TEX_H;
  var ctx = canvas.getContext('2d', { alpha: false });

  var glow = document.createElement('canvas');
  glow.width = GLOW_W; glow.height = GLOW_H;
  var gctx = glow.getContext('2d', { alpha: false });
  gctx.fillStyle = '#000'; gctx.fillRect(0, 0, GLOW_W, GLOW_H);

  SCR.canvas = canvas;
  SCR.glowCanvas = glow;


  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function css(c, k) {
    k = k === undefined ? 1 : k;
    return 'rgb(' + Math.round(GLX.clamp(c[0] * k, 0, 1) * 255) + ','
                  + Math.round(GLX.clamp(c[1] * k, 0, 1) * 255) + ','
                  + Math.round(GLX.clamp(c[2] * k, 0, 1) * 255) + ')';
  }

  var PAL = {};

  function buildPalette() {
    var b = THEMES[SCR.themeName].base;
    PAL = {
      dim:  css(b, 0.42),
      fg:   css(b, 0.80),
      hi:   css(mix(b, [1, 1, 1], 0.55)),
      ok:   css(b, 1.0),
      warn: css(mix(b, [1.00, 0.74, 0.22], 0.68)),
      err:  css(mix(b, [1.00, 0.34, 0.32], 0.68)),
      link: css(mix(b, [1, 1, 1], 0.38)),
      cursor: css(mix(b, [1, 1, 1], 0.35))
    };
    SCR.baseRGB = b;
  }

  SCR.setTheme = function (name) {
    if (!THEMES[name]) return false;
    SCR.themeName = name;
    buildPalette();
    SCR.dirty = true;
    return true;
  };
  SCR.themeLabel = function () { return THEMES[SCR.themeName].label; };
  SCR.themeNames = Object.keys(THEMES);

  buildPalette();


  var fontFamily = '"JetBrains Mono", Consolas, monospace';
  SCR.fontReady = false;

  function measure(family, size) {
    ctx.font = size + 'px ' + family;
    return ctx.measureText('M').width;
  }

  function pickFont() {
    var candidates = ['"VT323", monospace', '"JetBrains Mono", Consolas, monospace'];
    for (var i = 0; i < candidates.length; i++) {
      var f = candidates[i];
      ctx.font = '100px ' + f;
      var mAdv = ctx.measureText('M').width;
      var bAdv = ctx.measureText('█').width;
      var wAdv = ctx.measureText('W').width;
      if (mAdv > 0 && Math.abs(bAdv - mAdv) < 0.6 && Math.abs(wAdv - mAdv) < 0.6) {
        fontFamily = f;
        break;
      }
    }
    SCR.fontReady = true;
    layout();
    SCR.dirty = true;
  }

  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('100px "VT323"'),
      document.fonts.load('100px "JetBrains Mono"')
    ]).then(pickFont).catch(pickFont);
  } else {
    setTimeout(pickFont, 300);
  }


  var cellW = 16, cellH = 30, fontPx = 26, baseline = 22;

  function layout() {
    var usableW = TEX_W - MARGIN * 2;
    cellW = usableW / SCR.cols;

    var adv100 = measure(fontFamily, 100) / 100;
    fontPx = cellW / adv100;

    cellH = cellW * 1.86;
    SCR.rows = Math.max(8, Math.floor((SCR_H - MARGIN * 2) / cellH));
    baseline = cellH * 0.74;
  }

  SCR.setCols = function (cols) {
    if (cols === SCR.cols) return;
    SCR.cols = cols;
    layout();
    SCR.dirty = true;
  };

  layout();


  SCR.hits = [];

  SCR.hitTest = function (px, py) {
    for (var i = 0; i < SCR.hits.length; i++) {
      var h = SCR.hits[i];
      if (px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1) return h.url;
    }
    return null;
  };

  SCR.paint = function (lines, caret, opts) {
    opts = opts || {};
    SCR.hits.length = 0;

    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, TEX_W, SCR_H);

    ctx.font = fontPx + 'px ' + fontFamily;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    var startRow = Math.max(0, lines.length - SCR.rows);
    var y0 = MARGIN;

    for (var r = 0; r < SCR.rows; r++) {
      var line = lines[startRow + r];
      if (line === undefined) continue;
      var rowTop = y0 + r * cellH;
      var col = 0;
      var art = isBlockArt(line);

      if (typeof line === 'string') {
        if (line.length) {
          ctx.fillStyle = PAL.fg;
          drawRun(line, col, rowTop, art);
        }
        continue;
      }
      for (var i = 0; i < line.length; i++) {
        var run = line[i];
        var text = run[0];
        if (!text) continue;
        ctx.fillStyle = PAL[run[1]] || PAL.fg;
        drawRun(text, col, rowTop, art);

        if (run[2]) {
          var lx = MARGIN + col * cellW;
          var lw = text.length * cellW;
          ctx.fillRect(lx, rowTop + baseline + cellH * 0.11,
                       lw, Math.max(1, Math.round(cellH * 0.045)));
          SCR.hits.push({
            x0: lx, x1: lx + lw,
            y0: rowTop, y1: rowTop + cellH,
            url: run[2]
          });
        }
        col += text.length;
      }
    }

    if (caret && caret.on) {
      var cr = caret.row - startRow;
      if (cr >= 0 && cr < SCR.rows) {
        ctx.fillStyle = PAL.cursor;
        ctx.fillRect(
          MARGIN + caret.col * cellW,
          y0 + cr * cellH + cellH * 0.16,
          cellW * 0.86,
          cellH * 0.72
        );
      }
    }

    drawPlate();
    SCR.dirty = true;
  };

  var BLOCK = 0x2588;

  function isBlockArt(line) {
    var text = '', i;
    if (typeof line === 'string') text = line;
    else for (i = 0; i < line.length; i++) text += line[i][0];

    var solid = 0;
    for (i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c === BLOCK) solid++;
      else if (c !== 32) return false;
    }
    return solid > 0;
  }

  function drawRun(text, col, rowTop, art) {
    if (!art) {
      if (text.trim()) ctx.fillText(text, MARGIN + col * cellW, rowTop + baseline);
      return;
    }

    var yTop = Math.round(rowTop);
    var yBot = Math.round(rowTop + cellH);
    var i = 0;

    while (i < text.length) {
      var solid = text.charCodeAt(i) === BLOCK;
      var j = i;
      while (j < text.length && (text.charCodeAt(j) === BLOCK) === solid) j++;

      if (solid) {
        var xL = Math.round(MARGIN + (col + i) * cellW);
        var xR = Math.round(MARGIN + (col + j) * cellW);
        ctx.fillRect(xL, yTop, xR - xL, yBot - yTop);
      }
      i = j;
    }
  }

  function drawPlate() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, SCR_H, TEX_W, PLATE_H);
    ctx.fillStyle = '#4a4336';
    ctx.font = '600 ' + Math.round(PLATE_H * 0.46) + 'px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STDIO  SYSTEMS', TEX_W * 0.30, SCR_H + PLATE_H * 0.68);
    ctx.fillStyle = '#6b6252';
    ctx.fillText('VT-9000', TEX_W * 0.72, SCR_H + PLATE_H * 0.68);
    ctx.textAlign = 'left';
  }

  SCR.paintStandby = function () {
    SCR.hits.length = 0;
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, TEX_W, SCR_H);

    var cx = TEX_W / 2;
    var cy = SCR_H * 0.43;
    var r = SCR_H * 0.108;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = PAL.dim;
    ctx.lineWidth = r * 0.045;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.62, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = PAL.ok;
    ctx.lineWidth = r * 0.155;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2 + 0.52, -Math.PI / 2 - 0.52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.92);
    ctx.lineTo(cx, cy - r * 0.10);
    ctx.stroke();
    ctx.restore();

    var big = Math.round(TEX_W * 0.030);
    var small = Math.round(TEX_W * 0.021);

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.hi;
    ctx.font = big + 'px ' + fontFamily;
    ctx.fillText('PRESS ANY KEY TO POWER ON', cx, cy + r * 2.55);

    drawPlate();
    SCR.dirty = true;
  };

  SCR.accumulate = function (decay, gain) {
    gctx.globalCompositeOperation = 'source-over';
    gctx.globalAlpha = 1;
    gctx.fillStyle = 'rgba(0,0,0,' + decay + ')';
    gctx.fillRect(0, 0, GLOW_W, GLOW_H);

    gctx.globalCompositeOperation = 'lighter';
    gctx.globalAlpha = gain;
    gctx.drawImage(canvas, 0, 0, TEX_W, SCR_H, 0, 0, GLOW_W, GLOW_H);
    gctx.globalAlpha = 1;
    gctx.globalCompositeOperation = 'source-over';
  };

  SCR.clearGlow = function () {
    gctx.globalCompositeOperation = 'source-over';
    gctx.globalAlpha = 1;
    gctx.fillStyle = '#000';
    gctx.fillRect(0, 0, GLOW_W, GLOW_H);
  };

  SCR.luma = 0.35;
  var sample = document.createElement('canvas');
  sample.width = 8; sample.height = 6;
  var sctx = sample.getContext('2d', { alpha: false, willReadFrequently: true });

  SCR.measureLuma = function () {
    sctx.drawImage(canvas, 0, 0, TEX_W, SCR_H, 0, 0, 8, 6);
    var d = sctx.getImageData(0, 0, 8, 6).data;
    var sum = 0;
    for (var i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    SCR.luma = (sum / (d.length / 4)) / 255;
    return SCR.luma;
  };

  global.SCR = SCR;
})(window);
