
(function (global) {
  'use strict';

  var Mesh = GLX.Mesh;

  var DIM = {
    SW: 2.00,
    SH: 1.50,
    BULGE: 0.22,
    FRONT_Z: 0.20,
    DESK_Y: -2.50,
    CASE_BOTTOM: -2.05
  };

  function glassZ(x, y) {
    var nx = x / DIM.SW, ny = y / DIM.SH;
    var kx = Math.max(0, 1 - nx * nx);
    var ky = Math.max(0, 1 - ny * ny);
    return DIM.BULGE * Math.pow(kx, 0.8) * Math.pow(ky, 0.8);
  }
  DIM.glassZ = glassZ;

  function roundedRect(w, h, r, segs) {
    var hw = w / 2 - r, hh = h / 2 - r, pts = [];
    var corners = [
      [ hw,  hh, 0],
      [-hw,  hh, Math.PI / 2],
      [-hw, -hh, Math.PI],
      [ hw, -hh, Math.PI * 1.5]
    ];
    for (var c = 0; c < 4; c++) {
      var cx = corners[c][0], cy = corners[c][1], a0 = corners[c][2];
      for (var i = 0; i <= segs; i++) {
        var a = a0 + (i / segs) * (Math.PI / 2);
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    return pts;
  }

  function atZ(path, z) {
    return path.map(function (p) { return [p[0], p[1], z]; });
  }

  function buildScreen() {
    var m = new Mesh();
    var NX = 44, NY = 34;
    var SW = DIM.SW, SH = DIM.SH;
    var e = 0.004;

    function P(u, v) {
      var x = -SW + u * 2 * SW;
      var y = -SH + v * 2 * SH;
      return [x, y, glassZ(x, y)];
    }
    function N(u, v) {
      var x = -SW + u * 2 * SW;
      var y = -SH + v * 2 * SH;
      var dzdx = (glassZ(x + e, y) - glassZ(x - e, y)) / (2 * e);
      var dzdy = (glassZ(x, y + e) - glassZ(x, y - e)) / (2 * e);
      return GLX.V3.norm([-dzdx, -dzdy, 1]);
    }

    var grid = [];
    for (var j = 0; j <= NY; j++) {
      grid[j] = [];
      for (var i = 0; i <= NX; i++) {
        var u = i / NX, v = j / NY;
        grid[j][i] = m.vertex(P(u, v), N(u, v), [u, v]);
      }
    }
    for (j = 0; j < NY; j++) {
      for (i = 0; i < NX; i++) {
        var a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
        m.index.push(a, b, c, a, c, d);
      }
    }
    return m;
  }

  function buildShell() {
    var m = new Mesh();
    var S = 7;

    var pIn   = atZ(roundedRect(3.96, 2.94, 0.26, S),  0.055);
    var pMidI = atZ(roundedRect(4.32, 3.30, 0.34, S),  DIM.FRONT_Z);
    var pOut  = atZ(roundedRect(5.30, 4.10, 0.55, S),  DIM.FRONT_Z);
    var pBack = atZ(roundedRect(5.30, 4.10, 0.55, S), -0.35);
    var pTube = atZ(roundedRect(4.24, 3.34, 0.48, S), -1.55);
    var pNeck = atZ(roundedRect(2.20, 1.85, 0.40, S), -2.42);

    m.bridge(pIn, pMidI);
    m.bridge(pMidI, pOut);
    m.bridge(pOut, pBack);
    m.bridge(pBack, pTube);
    m.bridge(pTube, pNeck);
    m.cap(pNeck, [0, 0, -1], true);

    m.box([0, -2.26, -0.80], [0.62, 0.24, 0.46]);
    m.box([0, -2.435, -0.85], [1.62, 0.075, 1.16]);
    m.box([0, -2.36, -0.85], [1.42, 0.06, 1.00]);

    return m;
  }

  function buildKeyboard() {
    var m = new Mesh();
    var Z0 = 1.72, Z1 = 3.36;
    var X = 2.35;
    var YB = DIM.DESK_Y;
    var YTop0 = -2.26, YTop1 = -2.41;

    function topY(z) {
      return YTop0 + (z - Z0) / (Z1 - Z0) * (YTop1 - YTop0);
    }

    var bl = [-X, YB, Z0], br = [X, YB, Z0];
    var fl = [-X, YB, Z1], fr = [X, YB, Z1];
    var tbl = [-X, YTop0, Z0], tbr = [X, YTop0, Z0];
    var tfl = [-X, YTop1, Z1], tfr = [X, YTop1, Z1];

    m.quad(tfl, tfr, tbr, tbl);
    m.quad(fl, fr, tfr, tfl);
    m.quad(br, bl, tbl, tbr);
    m.quad(bl, fl, tfl, tbl);
    m.quad(fr, br, tbr, tfr);
    m.quad(bl, br, fr, fl);

    var COLS = 15, ROWS = 5;
    var kw = 0.115, kd = 0.095, kh = 0.048;
    var stepX = 0.295, stepZ = 0.255;
    var z0 = Z0 + 0.30;
    for (var r = 0; r < ROWS; r++) {
      var z = z0 + r * stepZ;
      var offset = (r === 1 ? 0.06 : r === 2 ? 0.10 : r === 3 ? 0.16 : 0);
      for (var c = 0; c < COLS; c++) {
        if (r === ROWS - 1 && c > 2 && c < 10) continue;
        var x = -((COLS - 1) / 2) * stepX + c * stepX + offset;
        if (x + kw > X - 0.12) continue;
        m.box([x, topY(z) + kh * 0.55, z], [kw, kh, kd]);
      }
    }
    var zs = z0 + (ROWS - 1) * stepZ;
    m.box([0.1, topY(zs) + kh * 0.55, zs], [1.02, kh, kd]);

    return m;
  }

  function buildRoom() {
    var m = new Mesh();
    var Y = DIM.DESK_Y;
    m.quad([-16, Y, 9], [16, Y, 9], [16, Y, -11], [-16, Y, -11], [0, 1, 0],
           [[0, 0], [1, 0], [1, 1], [0, 1]]);
    m.quad([-18, Y, -10.5], [18, Y, -10.5], [18, 12, -10.5], [-18, 12, -10.5], [0, 0, 1],
           [[0, 0], [1, 0], [1, 1], [0, 1]]);
    return m;
  }

  function buildPlate(v0, v1) {
    var m = new Mesh();
    var y = -1.815, hw = 0.78, hh = 0.085, z = DIM.FRONT_Z + 0.004;
    m.quad([-hw, y - hh, z], [hw, y - hh, z], [hw, y + hh, z], [-hw, y + hh, z], [0, 0, 1],
           [[0, v0], [1, v0], [1, v1], [0, v1]]);
    return m;
  }

  function buildLed() {
    var m = new Mesh();
    var x = 1.94, y = -1.83, s = 0.075, z = DIM.FRONT_Z + 0.006;
    m.quad([x - s, y - s, z], [x + s, y - s, z], [x + s, y + s, z], [x - s, y + s, z], [0, 0, 1],
           [[0, 0], [1, 0], [1, 1], [0, 1]]);
    return m;
  }

  global.GEO = {
    DIM: DIM,
    screen: buildScreen,
    shell: buildShell,
    keyboard: buildKeyboard,
    room: buildRoom,
    plate: buildPlate,
    led: buildLed
  };
})(window);
