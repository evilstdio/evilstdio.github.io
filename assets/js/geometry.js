
(function (global) {
  'use strict';

  var Mesh = GLX.Mesh;

  var DIM = {
    SW: 2.00,
    SH: 1.50,
    BULGE: 0.22,
    FRONT_Z: 0.20,
    DESK_Y: -2.50,
    DESK_T: 0.24,
    FLOOR_Y: -9.00,
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

  var UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

  function buildRoom() {
    var m = new Mesh();
    var Y = DIM.FLOOR_Y;
    var FZ = 14, BZ = -15;
    var WX = 12.0;
    var CY = 6;

    m.quad([-WX, Y, FZ], [WX, Y, FZ], [WX, Y, BZ], [-WX, Y, BZ], [0, 1, 0], UV);
    m.quad([-WX, Y, BZ], [WX, Y, BZ], [WX, CY, BZ], [-WX, CY, BZ], [0, 0, 1], UV);
    m.quad([-WX, Y, BZ], [-WX, Y, FZ], [-WX, CY, FZ], [-WX, CY, BZ], [1, 0, 0], UV);
    m.quad([WX, Y, FZ], [WX, Y, BZ], [WX, CY, BZ], [WX, CY, FZ], [-1, 0, 0], UV);
    m.quad([-WX, CY, BZ], [WX, CY, BZ], [WX, CY, FZ], [-WX, CY, FZ], [0, -1, 0], UV);
    return m;
  }

  function buildDesk() {
    var m = new Mesh();
    var TOP = DIM.DESK_Y, T = DIM.DESK_T;
    var X = 6.4, ZB = -3.6, ZF = 4.4;

    var cz = (ZB + ZF) / 2, hz = (ZF - ZB) / 2;
    m.box([0, TOP - T / 2, cz], [X, T / 2, hz]);

    m.box([0, TOP - T - 0.12, ZF - 0.16], [X - 0.3, 0.12, 0.10]);

    var legY = (TOP - T + DIM.FLOOR_Y) / 2;
    var legH = (TOP - T - DIM.FLOOR_Y) / 2;
    var lx = X - 0.55, lz0 = ZB + 0.55, lz1 = ZF - 0.55;
    [[-lx, lz0], [lx, lz0], [-lx, lz1], [lx, lz1]].forEach(function (p) {
      m.box([p[0], legY, p[1]], [0.16, legH, 0.16]);
    });

    m.box([0, TOP - T - 0.9, lz0], [lx, 0.22, 0.10]);
    return m;
  }


  var RACK_W = 2.9, RACK_D = 2.5;
  var UNIT_H = 0.95;
  var UNIT_D = 0.34;

  var RACKS = [
    { x:  -7.6, z:  -8.4, h: 13.0, seed: 0.17 },
    { x:   8.0, z:  -9.8, h: 13.8, seed: 0.63 },
    { x: -10.4, z: -12.0, h: 12.2, seed: 0.41 }
  ];

  function unitsOf(r) {
    return Math.max(4, Math.floor((r.h - 1.5) / UNIT_H));
  }
  function unitY(r, k) {
    return DIM.FLOOR_Y + 0.75 + (k + 0.5) * UNIT_H;
  }

  function unitDepth(r, k) {
    var h = Math.abs(Math.sin((k + 1) * 12.9898 + r.seed * 78.233) * 43758.5453) % 1;
    return UNIT_D * (0.70 + h * 0.62);
  }

  function buildRackBodies() {
    var m = new Mesh();
    RACKS.forEach(function (r) {
      var cy = DIM.FLOOR_Y + r.h / 2;
      m.box([r.x, cy, r.z], [RACK_W / 2, r.h / 2, RACK_D / 2]);
      m.box([r.x, DIM.FLOOR_Y + 0.08, r.z],
            [RACK_W / 2 + 0.10, 0.08, RACK_D / 2 + 0.10]);

      var face = r.z + RACK_D / 2;
      var n = unitsOf(r);
      for (var k = 0; k < n; k++) {
        var ud = unitDepth(r, k);
        m.box([r.x, unitY(r, k), face + ud / 2 - 0.06],
              [RACK_W / 2 - 0.17, UNIT_H * 0.43, ud / 2]);
      }
    });
    return m;
  }

  function buildRackPanels() {
    return RACKS.map(function (r) {
      var m = new Mesh();
      var n = unitsOf(r);
      var face = r.z + RACK_D / 2;
      var x0 = r.x - RACK_W / 2 + 0.19, x1 = r.x + RACK_W / 2 - 0.19;

      for (var k = 0; k < n; k++) {
        var z = face + unitDepth(r, k) - 0.052;
        var cy = unitY(r, k), hh = UNIT_H * 0.40;
        var v0 = k / n, v1 = (k + 1) / n;
        m.quad([x0, cy - hh, z], [x1, cy - hh, z], [x1, cy + hh, z], [x0, cy + hh, z],
               [0, 0, 1], [[0, v0], [1, v0], [1, v1], [0, v1]]);
      }
      return { mesh: m, seed: r.seed, units: n };
    });
  }

  function rackLights() {
    var out = [];
    RACKS.forEach(function (r) {
      out.push(r.x, DIM.FLOOR_Y + r.h * 0.5, r.z + RACK_D / 2 + 1.1);
    });
    return new Float32Array(out);
  }


  var MOUSE = { x: 3.45, z: 2.55, rx: 0.44, rz: 0.74, ry: 0.36 };

  function buildMouse() {
    var m = new Mesh();
    var NU = 20, NV = 8;
    var y0 = DIM.DESK_Y;
    var u, v;

    function P(iu, iv) {
      var th = (iu / NU) * Math.PI * 2;
      var ph = (iv / NV) * Math.PI * 0.5;
      var cph = Math.cos(ph);
      var taper = 1 - 0.22 * Math.max(0, -Math.cos(th));
      return [
        MOUSE.x + MOUSE.rx * Math.cos(th) * cph * taper,
        y0 + MOUSE.ry * Math.sin(ph),
        MOUSE.z + MOUSE.rz * Math.sin(th) * cph
      ];
    }
    function N(iu, iv) {
      var p = P(iu, iv);
      return GLX.V3.norm([
        (p[0] - MOUSE.x) / (MOUSE.rx * MOUSE.rx),
        (p[1] - y0)      / (MOUSE.ry * MOUSE.ry),
        (p[2] - MOUSE.z) / (MOUSE.rz * MOUSE.rz)
      ]);
    }

    var grid = [];
    for (v = 0; v <= NV; v++) {
      grid[v] = [];
      for (u = 0; u <= NU; u++) grid[v][u] = m.vertex(P(u, v), N(u, v), [u / NU, v / NV]);
    }
    for (v = 0; v < NV; v++) {
      for (u = 0; u < NU; u++) {
        var a = grid[v][u], b = grid[v][u + 1], c = grid[v + 1][u + 1], d = grid[v + 1][u];
        m.index.push(a, b, c, a, c, d);
      }
    }

    m.box([MOUSE.x, y0 + MOUSE.ry * 0.90, MOUSE.z - MOUSE.rz * 0.42],
          [0.045, 0.06, 0.11]);
    return m;
  }

  function buildMousePad() {
    var m = new Mesh();
    var y = DIM.DESK_Y + 0.006;
    var x0 = MOUSE.x - 1.15, x1 = MOUSE.x + 1.15;
    var z0 = MOUSE.z - 1.35, z1 = MOUSE.z + 1.35;
    m.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], UV);
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
    desk: buildDesk,
    mouse: buildMouse,
    mousePad: buildMousePad,
    plate: buildPlate,
    led: buildLed,
    rackBodies: buildRackBodies,
    rackPanels: buildRackPanels,
    rackLights: rackLights,
    RACK_COUNT: RACKS.length
  };
})(window);
