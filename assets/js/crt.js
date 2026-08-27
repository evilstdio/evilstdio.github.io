(function (global) {
  'use strict';

  var M4 = GLX.M4;
  var V3 = GLX.V3;
  var DIM = GEO.DIM;

  var CRT = {
    state: 'off',
    fx: 1,
    showStandby: true,
    hover: false,
    onReady: function () {},
    onPowerOff: function () {}
  };

  var gl, canvas, meshes = {}, progs = {}, tex = {}, ready = false;
  var rackPanels = [], RACK_LIGHTS = new Float32Array(9);


  var COMMON_VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNrm;',
    'attribute vec2 aUv;',
    'uniform mat4 uVP;',
    'varying vec3 vPos;',
    'varying vec3 vNrm;',
    'varying vec2 vUv;',
    'void main(){',
    '  vPos = aPos; vNrm = aNrm; vUv = aUv;',
    '  gl_Position = uVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var LIGHT_CHUNK = [
    'uniform vec3 uSamples[5];',
    'uniform vec3 uScreenCol;',
    'uniform float uScreenGlow;',
    'vec3 tubeLight(vec3 P, vec3 N){',
    '  float acc = 0.0;',
    '  for (int i = 0; i < 5; i++) {',
    '    vec3 d = uSamples[i] - P;',
    '    float dist = length(d);',
    '    acc += max(dot(N, d / dist), 0.0) / (1.0 + 0.55 * dist * dist);',
    '  }',
    '  float front = smoothstep(-0.75, 0.35, P.z);',
    '  return uScreenCol * uScreenGlow * acc * front;',
    '}',
    'uniform vec3 uRack[3];',
    'uniform vec3 uRackCol;',
    'vec3 rackLight(vec3 P, vec3 N){',
    '  float acc = 0.0;',
    '  for (int i = 0; i < 3; i++) {',
    '    vec3 dd = uRack[i] - P;',
    '    float dist = length(dd);',
    '    acc += max(dot(N, dd / dist), 0.0) / (1.0 + 0.10 * dist * dist);',
    '  }',
    '  return uRackCol * acc;',
    '}',
    'float hash3(vec3 p){',
    '  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
    '}',
    'float vnoise(vec3 p){',
    '  vec3 i = floor(p), f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(mix(hash3(i + vec3(0.0, 0.0, 0.0)), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),',
    '                mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y);',
    '  float b = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),',
    '                mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y);',
    '  return mix(a, b, f.z);',
    '}'
  ].join('\n');

  var PLASTIC_FS = [
    'precision highp float;',
    'varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;',
    'uniform vec3 uEye; uniform vec3 uAlbedo;',
    'uniform float uUseMap;',
    'uniform float uRackK;',
    'uniform sampler2D uMap;',
    LIGHT_CHUNK,
    'void main(){',
    '  vec3 N = normalize(vNrm);',
    '  vec3 V = normalize(uEye - vPos);',
    '  if (dot(N, V) < 0.0) N = -N;',
    '',
    '  vec3 albedo = uAlbedo * (0.94 + 0.11 * vnoise(vPos * 22.0));',
    '  if (uUseMap > 0.5) albedo *= texture2D(uMap, vUv).rgb;',
    '',
    '  vec3 L = normalize(vec3(-0.62, 0.80, 0.52));',
    '  vec3 col = albedo * (0.030 + 0.145 * max(dot(N, L), 0.0));',
    '  col += albedo * tubeLight(vPos, N) * 0.60;',
    '  col += albedo * rackLight(vPos, N) * uRackK;',
    '',
    '  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);',
    '  col += mix(vec3(0.05, 0.07, 0.10), uScreenCol, 0.45) * rim * 0.32;',
    '',
    '  vec3 H = normalize(L + V);',
    '  col += vec3(1.0) * pow(max(dot(N, H), 0.0), 46.0) * 0.075;',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var ROOM_FS = [
    'precision highp float;',
    'varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;',
    'uniform vec3 uEye; uniform vec3 uAlbedo;',
    LIGHT_CHUNK,
    'void main(){',
    '  vec3 N = normalize(vNrm);',
    '  vec3 V = normalize(uEye - vPos);',
    '  if (dot(N, V) < 0.0) N = -N;',
    '',
    '  float m = vnoise(vPos * 0.30) * 0.65 + vnoise(vPos * 0.95) * 0.35;',
    '  vec3 albedo = uAlbedo * (0.90 + 0.20 * m);',
    '',
    '  float sky = 0.5 + 0.5 * N.y;',
    '  vec3 col = albedo * mix(vec3(0.070, 0.075, 0.092),',
    '                          vec3(0.235, 0.245, 0.275), sky);',
    '',
    '  vec3 L = normalize(vec3(-0.35, 0.86, 0.30));',
    '  col += albedo * 0.11 * max(dot(N, L), 0.0);',
    '',
    '  col += albedo * tubeLight(vPos, N) * 1.25;',
    '  col += albedo * rackLight(vPos, N) * 0.85;',
    '',
    '  float d = length(vPos.xz - vec2(0.0, 1.2));',
    '  col *= exp(-max(0.0, d - 4.0) * 0.055);',
    '  col *= mix(1.0, 0.34, smoothstep(-9.0, 6.0, vPos.y));',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var SCREEN_FS = [
    'precision highp float;',
    'varying vec3 vPos; varying vec3 vNrm; varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform sampler2D uGlow;',
    'uniform vec2 uAtlas;',
    'uniform vec2 uOpen;',
    'uniform vec2 uGlowTexel;',
    'uniform vec3 uEye;',
    'uniform float uTime, uBright, uDegauss, uFx, uCurve, uLines, uNoise, uPower;',
    '',
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(127.13, 311.7));',
    '  p += dot(p, p + 34.71);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'void main(){',
    '  vec2 s = vUv;',
    '',
    '  vec2 c = s - 0.5;',
    '  s = c * (1.0 + uCurve * dot(c, c)) + 0.5;',
    '',
    '  s = (s - 0.5) / max(uOpen, vec2(0.0006)) + 0.5;',
    '',
    '  s += vec2(sin(s.y * 38.0 + uTime * 26.0), cos(s.x * 29.0 + uTime * 19.0)) * uDegauss * 0.014;',
    '',
    '  vec3 col = vec3(0.0);',
    '  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0) {',
    '    vec2 t = vec2(s.x, uAtlas.x + s.y * uAtlas.y);',
    '    float ca = 0.00055 * uFx * (0.30 + dot(c, c) * 3.2) * (1.0 + uDegauss * 9.0);',
    '    col.r = texture2D(uTex, t + vec2(ca, 0.0)).r;',
    '    col.g = texture2D(uTex, t).g;',
    '    col.b = texture2D(uTex, t - vec2(ca, 0.0)).b;',
    '',
    '    vec2 gp = uGlowTexel * 1.35;',
    '    vec3 bloom = texture2D(uGlow, s).rgb * 0.36',
    '               + texture2D(uGlow, s + vec2( gp.x, 0.0)).rgb * 0.16',
    '               + texture2D(uGlow, s + vec2(-gp.x, 0.0)).rgb * 0.16',
    '               + texture2D(uGlow, s + vec2(0.0,  gp.y)).rgb * 0.16',
    '               + texture2D(uGlow, s + vec2(0.0, -gp.y)).rgb * 0.16;',
    '    col += bloom * 0.45 * uFx;',
    '',
    '    float sl = 0.5 + 0.5 * cos(s.y * uLines * 6.28318);',
    '    col *= 1.0 - 0.14 * sl * uFx;',
    '',
    '    col += vec3(0.55, 0.85, 0.70) * hash21(s * 640.0 + fract(uTime) * 97.0) * uNoise;',
    '  }',
    '',
    '  float m = mod(gl_FragCoord.x, 3.0);',
    '  vec3 mask = vec3(m < 1.0 ? 1.18 : 0.90,',
    '                   (m >= 1.0 && m < 2.0) ? 1.18 : 0.90,',
    '                   m >= 2.0 ? 1.18 : 0.90);',
    '  col *= mix(vec3(1.0), mask, 0.10 * uFx);',
    '',
    '  col *= uBright * (1.0 + 0.018 * sin(uTime * 121.0) * uFx);',
    '',
    '  vec3 N = normalize(vNrm);',
    '  vec3 V = normalize(uEye - vPos);',
    '  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);',
    '  col += vec3(0.055, 0.075, 0.095) * fres * 1.5;',
    '  vec2 q = (vUv - vec2(0.26, 0.74)) * vec2(2.6, 6.2);',
    '  col += vec3(0.050, 0.058, 0.070) * exp(-dot(q, q) * 2.2) * (1.0 - 0.55 * uPower);',
    '',
    '  float vg = 1.0 - 0.72 * pow(length((vUv - 0.5) * vec2(1.05, 1.0)), 3.0);',
    '  gl_FragColor = vec4(col * vg, 1.0);',
    '}'
  ].join('\n');

  var RACK_FS = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform float uTime, uSeed, uUnits;',
    '',
    'float hash21(vec2 p){',
    '  p = fract(p * vec2(127.13, 311.7));',
    '  p += dot(p, p + 34.71);',
    '  return fract(p.x * p.y);',
    '}',
    '',
    'void main(){',
    '  float ry  = vUv.y * uUnits;',
    '  float row = floor(ry);',
    '  float fy  = fract(ry);',
    '',
    '  float seam = smoothstep(0.0, 0.07, fy) * smoothstep(1.0, 0.93, fy);',
    '  vec3 col = vec3(0.020, 0.025, 0.032) * seam;',
    '',
    '  float rs = hash21(vec2(row, uSeed * 37.0));',
    '',
    '  float cols = 22.0;',
    '  float gx = vUv.x * cols;',
    '  float ci = floor(gx);',
    '  float cf = fract(gx);',
    '  float hasLed = clamp(step(ci, 2.0) + step(14.0, ci) * step(rs, 0.45), 0.0, 1.0);',
    '',
    '  float seed  = hash21(vec2(ci, row + uSeed * 91.0));',
    '  float rate  = 0.6 + seed * 7.0;',
    '  float blink = step(0.42, hash21(vec2(floor(uTime * rate), seed * 53.0)));',
    '  blink = mix(blink, 1.0, step(0.82, seed));',
    '',
    '  vec2 d = vec2(cf - 0.5, (fy - 0.5) * 1.9);',
    '  float lamp = smoothstep(0.34, 0.06, length(d));',
    '',
    '  vec3 tint = mix(vec3(0.15, 1.00, 0.35), vec3(1.00, 0.62, 0.10), step(0.55, seed));',
    '  tint = mix(tint, vec3(1.00, 0.22, 0.14), step(0.92, seed));',
    '',
    '  col += tint * lamp * blink * hasLed * 1.2;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var LED_FS = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform vec3 uColour;',
    'uniform float uOn, uTime;',
    'void main(){',
    '  float d = length(vUv - 0.5);',
    '  float core = smoothstep(0.30, 0.06, d);',
    '  float halo = smoothstep(0.50, 0.10, d) * 0.55;',
    '  float f = 0.92 + 0.08 * sin(uTime * 7.0);',
    '  gl_FragColor = vec4(uColour * (core + halo) * uOn * f, 1.0);',
    '}'
  ].join('\n');


  CRT.init = function (cvs) {
    canvas = cvs;
    gl = GLX.context(canvas, { alpha: false, antialias: true, depth: true });
    if (!gl) return false;

    var ATTRS = ['aPos', 'aNrm', 'aUv'];
    progs.plastic = GLX.program(gl, COMMON_VS, PLASTIC_FS, ATTRS);
    progs.room    = GLX.program(gl, COMMON_VS, ROOM_FS, ATTRS);
    progs.screen  = GLX.program(gl, COMMON_VS, SCREEN_FS, ATTRS);
    progs.led     = GLX.program(gl, COMMON_VS, LED_FS, ATTRS);
    progs.rack    = GLX.program(gl, COMMON_VS, RACK_FS, ATTRS);
    if (!progs.plastic || !progs.room || !progs.screen || !progs.led || !progs.rack) return false;

    meshes.shell    = GEO.shell().upload(gl);
    meshes.keyboard = GEO.keyboard().upload(gl);
    meshes.screen   = GEO.screen().upload(gl);
    meshes.room     = GEO.room().upload(gl);
    meshes.plate    = GEO.plate(SCR.PLATE_V0, SCR.PLATE_V1).upload(gl);
    meshes.led      = GEO.led().upload(gl);
    meshes.racks    = GEO.rackBodies().upload(gl);
    meshes.desk     = GEO.desk().upload(gl);
    meshes.mouse    = GEO.mouse().upload(gl);
    meshes.pad      = GEO.mousePad().upload(gl);

    rackPanels = GEO.rackPanels().map(function (p) {
      return { mesh: p.mesh.upload(gl), seed: p.seed, units: p.units };
    });

    RACK_LIGHTS.set(GEO.rackLights().subarray(0, 9));

    tex.screen = GLX.texture(gl, SCR.canvas);
    tex.glow   = GLX.texture(gl, SCR.glowCanvas);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0.004, 0.006, 0.009, 1);

    ready = true;
    return true;
  };


  var cam = {
    mode: 'boot',
    eye: [1.6, 1.3, 9.2], tgt: [0, -0.5, 0],
    from: null, to: null, t: 1, dur: 1
  };
  var FOV = 34 * Math.PI / 180;

  function fitDistance(aspect) {
    var half = Math.tan(FOV / 2);
    var dv = 2.15 / half;
    var dh = 2.80 / (half * aspect);
    return Math.max(dv, dh) + 0.30;
  }

  function preset(mode, aspect) {
    var d = fitDistance(aspect);
    var k = Math.max(1, d / 5.6);
    if (mode === 'read') return { eye: [0, 0.12, d], tgt: [0, -0.04, 0.28] };
    if (mode === 'wide') return { eye: [2.5 * k, 1.85 * k, 9.0 * k], tgt: [0, -0.85, -0.1] };
    return { eye: [0.62 * k, 0.58 * k, d * 1.30], tgt: [0, -0.26, 0.10] };
  }

  var ndcRect = { x0: -1, y0: -1, x1: 1, y1: 1 };
  var tmpV = [0, 0];

  function projectNDC(x, y, z, out) {
    var w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (Math.abs(w) < 1e-6) w = 1e-6;
    out[0] = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w;
    out[1] = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
  }

  function updateScreenRect() {
    var SW = DIM.SW, SH = DIM.SH, z = 0.12;
    var xs = [-SW, SW, SW, -SW], ys = [-SH, -SH, SH, SH];
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < 4; i++) {
      projectNDC(xs[i], ys[i], z, tmpV);
      if (tmpV[0] < x0) x0 = tmpV[0];
      if (tmpV[0] > x1) x1 = tmpV[0];
      if (tmpV[1] < y0) y0 = tmpV[1];
      if (tmpV[1] > y1) y1 = tmpV[1];
    }
    ndcRect.x0 = x0; ndcRect.x1 = x1;
    ndcRect.y0 = y0; ndcRect.y1 = y1;
  }

  CRT.overScreen = function (nx, ny) {
    return nx >= ndcRect.x0 && nx <= ndcRect.x1 &&
           ny >= ndcRect.y0 && ny <= ndcRect.y1;
  };

  var CURVE = 0.055;

  function rayFor(nx, ny) {
    var f = V3.norm(V3.sub(cam.tgt, eyePos));
    var r = V3.norm(V3.cross(f, [0, 1, 0]));
    var u = V3.cross(r, f);
    var th = Math.tan(FOV / 2);
    var aspect = canvas.width / Math.max(1, canvas.height);
    var dx = nx * th * aspect, dy = ny * th;
    return V3.norm([
      f[0] + r[0] * dx + u[0] * dy,
      f[1] + r[1] * dx + u[1] * dy,
      f[2] + r[2] * dx + u[2] * dy
    ]);
  }

  CRT.pickScreen = function (nx, ny) {
    if (!ready || CRT.state !== 'on') return null;

    var d = rayFor(nx, ny);
    if (Math.abs(d[2]) < 1e-6) return null;

    var z = DIM.BULGE * 0.5, x = 0, y = 0;
    for (var k = 0; k < 4; k++) {
      var t = (z - eyePos[2]) / d[2];
      if (t <= 0) return null;
      x = eyePos[0] + d[0] * t;
      y = eyePos[1] + d[1] * t;
      z = DIM.glassZ(x, y);
    }
    if (Math.abs(x) > DIM.SW || Math.abs(y) > DIM.SH) return null;

    var cx = (x + DIM.SW) / (2 * DIM.SW) - 0.5;
    var cy = (y + DIM.SH) / (2 * DIM.SH) - 0.5;
    var k2 = 1 + CURVE * CRT.fx * (cx * cx + cy * cy);
    var sx = cx * k2 + 0.5, sy = cy * k2 + 0.5;
    if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null;

    return { x: sx * SCR.TEX_W, y: (1 - sy) * SCR.SCR_H };
  };

  CRT.setCamera = function (mode, dur) {
    if (cam.mode === mode) return;
    var aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    cam.from = { eye: cam.eye.slice(), tgt: cam.tgt.slice() };
    cam.to = preset(mode, aspect);
    cam.mode = mode;
    cam.t = 0;
    cam.dur = dur || 1.7;
  };
  CRT.cameraMode = function () { return cam.mode; };

  CRT.refit = function () {
    if (!canvas) return;
    var aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    var next = preset(cam.mode, aspect);
    if (cam.t < 1) cam.to = next;
    else { cam.to = next; cam.eye = next.eye.slice(); cam.tgt = next.tgt.slice(); }
  };


  var ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  global.addEventListener('pointermove', function (e) {
    ptr.tx = (e.clientX / global.innerWidth) * 2 - 1;
    ptr.ty = (e.clientY / global.innerHeight) * 2 - 1;
  }, { passive: true });


  var pw = {
    openX: 1, openY: 1,
    bright: 0, degauss: 0, noise: 0, led: 0, power: 0,
    clock: 0
  };

  var STANDBY_POWER = 0.42;
  var COLLAPSE = 0.13;

  CRT.powerOn = function () {
    if (CRT.state !== 'off') return;
    CRT.state = 'warm';
    pw.clock = 0;
    CRT.hover = false;
    SCR.clearGlow();
    CRT.setCamera('read', 2.3);
  };

  CRT.powerOff = function () {
    if (CRT.state !== 'on' && CRT.state !== 'warm') return;
    CRT.state = 'dying';
    pw.clock = 0;
  };

  var firedReady = false;

  function updatePower(dt) {
    pw.clock += dt;
    var t = pw.clock;

    if (CRT.state === 'warm') {
      pw.power = Math.max(STANDBY_POWER, GLX.smooth(0, 0.5, t));
      pw.led = GLX.smooth(0.0, 0.35, t);
      pw.openX = 1;

      if (t < COLLAPSE) {
        pw.openY = GLX.lerp(1, 0.004, GLX.easeInOut(t / COLLAPSE));
      } else {
        pw.openY = GLX.lerp(0.004, 1, GLX.easeInOut(GLX.smooth(COLLAPSE + 0.04, 0.70, t)));
      }

      var surge = Math.exp(-Math.pow((t - 0.22) / 0.15, 2)) * 1.6;
      pw.bright = GLX.lerp(0.24, 1, GLX.smooth(0.05, 0.45, t)) + surge;
      pw.noise = Math.max(0, GLX.smooth(0.62, 0.18, t)) * 0.5;
      pw.degauss = t > 0.38 ? Math.exp(-(t - 0.38) * 3.4) * Math.abs(Math.cos((t - 0.38) * 22)) : 0;

      if (!firedReady && t >= COLLAPSE) {
        firedReady = true;
        CRT.showStandby = false;
        CRT.onReady();
      }
      if (t > 1.9) {
        CRT.state = 'on';
        pw.bright = 1; pw.degauss = 0; pw.noise = 0;
        pw.openX = pw.openY = 1; pw.power = 1;
      }
    } else if (CRT.state === 'on') {
      pw.bright += (1 - pw.bright) * Math.min(1, dt * 6);
      pw.led = 1; pw.power = 1;
      pw.openX = pw.openY = 1;
      pw.degauss *= Math.max(0, 1 - dt * 4);
      pw.noise *= Math.max(0, 1 - dt * 4);
    } else if (CRT.state === 'dying') {
      pw.openY = GLX.lerp(1, 0.0025, GLX.easeInOut(GLX.smooth(0, 0.26, t)));
      pw.openX = GLX.lerp(1, 0.0015, GLX.easeInOut(GLX.smooth(0.26, 0.48, t)));
      pw.bright = t < 0.30 ? GLX.lerp(1, 2.6, GLX.smooth(0, 0.26, t))
                           : GLX.lerp(2.6, 0, GLX.smooth(0.30, 0.72, t));
      pw.led = 1 - GLX.smooth(0.1, 0.5, t);
      pw.power = 1 - GLX.smooth(0.2, 0.7, t);
      if (t > 0.95) {
        CRT.state = 'off';
        firedReady = false;
        pw.clock = 0;
        pw.bright = 0; pw.openX = pw.openY = 0.0006; pw.led = 0; pw.power = 0;
        SCR.clearGlow();
        CRT.showStandby = true;
        CRT.setCamera('boot', 1.6);
        CRT.onPowerOff();
      }
    } else {
      pw.openX = pw.openY = 1;
      pw.power = STANDBY_POWER;
      pw.led = 0.5;
      pw.degauss = 0;
      pw.noise = 0;

      var pulse = 0.5 + 0.5 * Math.sin(t * 1.9);
      var target = (0.21 + 0.075 * pulse + (CRT.hover ? 0.13 : 0)) * GLX.smooth(0, 0.9, t);
      pw.bright += (target - pw.bright) * Math.min(1, dt * 5);
    }
  }

  CRT.degauss = function () { pw.clock = 0.30; pw.degauss = 1; };


  var lastUpload = -1;

  function syncTextures(now) {
    if (SCR.dirty && now - lastUpload > 0.040) {
      GLX.updateTexture(gl, tex.screen, SCR.canvas);
      SCR.dirty = false;
      lastUpload = now;
      SCR.measureLuma();
    }
    SCR.accumulate(CRT.fx ? 0.40 : 0.85, CRT.fx ? 0.18 : 0.10);
    GLX.updateTexture(gl, tex.glow, SCR.glowCanvas);
  }


  var vp = M4.create(), proj = M4.create(), view = M4.create();
  var SAMPLES = new Float32Array([
     0.00,  0.00, 0.22,
    -1.35,  0.95, 0.06,
     1.35,  0.95, 0.06,
    -1.35, -0.95, 0.06,
     1.35, -0.95, 0.06
  ]);

  var CASE_ALBEDO   = [0.62, 0.585, 0.50];
  var KEY_ALBEDO    = [0.50, 0.475, 0.415];
  var DESK_ALBEDO   = [0.34, 0.255, 0.185];
  var ROOM_ALBEDO   = [0.36, 0.365, 0.395];
  var PAD_ALBEDO    = [0.085, 0.090, 0.105];

  var eyePos = [0, 0, 8];

  var RACK_ALBEDO = [0.30, 0.315, 0.345];
  var RACK_COL    = [0.22, 0.62, 0.34];

  function setLight(p, glowCol, glowAmt, rackK) {
    gl.uniform3fv(p.u.uSamples, SAMPLES);
    gl.uniform3f(p.u.uScreenCol, glowCol[0], glowCol[1], glowCol[2]);
    gl.uniform1f(p.u.uScreenGlow, glowAmt);
    gl.uniform3fv(p.u.uRack, RACK_LIGHTS);
    gl.uniform3f(p.u.uRackCol, RACK_COL[0], RACK_COL[1], RACK_COL[2]);
    gl.uniform3f(p.u.uEye, eyePos[0], eyePos[1], eyePos[2]);
    if (p.u.uRackK) gl.uniform1f(p.u.uRackK, rackK === undefined ? 0.35 : rackK);
  }

  function drawWith(p, mesh, setup) {
    gl.useProgram(p);
    gl.uniformMatrix4fv(p.u.uVP, false, vp);
    setup(p);
    GLX.bindMesh(gl, p, mesh);
    GLX.drawMesh(gl, mesh);
  }

  CRT.render = function (t, dt) {
    if (!ready) return;
    GLX.resize(gl, canvas, 2);

    updatePower(dt);
    syncTextures(t);

    var aspect = canvas.width / canvas.height;

    if (cam.t < 1) {
      cam.t = Math.min(1, cam.t + dt / cam.dur);
      var k = GLX.easeInOut(cam.t);
      for (var i = 0; i < 3; i++) {
        cam.eye[i] = GLX.lerp(cam.from.eye[i], cam.to.eye[i], k);
        cam.tgt[i] = GLX.lerp(cam.from.tgt[i], cam.to.tgt[i], k);
      }
    } else if (cam.to) {
      cam.eye = cam.to.eye.slice();
      cam.tgt = cam.to.tgt.slice();
    }

    ptr.x += (ptr.tx - ptr.x) * Math.min(1, dt * 3.0);
    ptr.y += (ptr.ty - ptr.y) * Math.min(1, dt * 3.0);
    var par = cam.mode === 'read' ? 0.42 : 1.1;
    var drift = GLX.reducedMotion ? 0 : 1;
    var eye = [
      cam.eye[0] + ptr.x * par + Math.sin(t * 0.21) * 0.05 * drift,
      cam.eye[1] - ptr.y * par * 0.55 + Math.sin(t * 0.17 + 1.3) * 0.035 * drift,
      cam.eye[2]
    ];
    eyePos = eye;

    M4.perspective(proj, FOV, aspect, 0.1, 60);
    M4.lookAt(view, eye, cam.tgt, [0, 1, 0]);
    M4.multiply(vp, proj, view);
    updateScreenRect();

    var base = SCR.baseRGB;
    var lum = SCR.luma * pw.bright;
    var glowAmt = GLX.clamp((0.10 + lum * 2.4) * pw.power, 0, 2.2);
    var glowCol = [base[0], base[1], base[2]];

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    drawWith(progs.room, meshes.room, function (p) {
      gl.uniform3f(p.u.uAlbedo, ROOM_ALBEDO[0], ROOM_ALBEDO[1], ROOM_ALBEDO[2]);
      setLight(p, glowCol, glowAmt);
    });

    drawWith(progs.plastic, meshes.desk, function (p) {
      gl.uniform3f(p.u.uAlbedo, DESK_ALBEDO[0], DESK_ALBEDO[1], DESK_ALBEDO[2]);
      gl.uniform1f(p.u.uUseMap, 0);
      setLight(p, glowCol, glowAmt);
    });

    drawWith(progs.room, meshes.pad, function (p) {
      gl.uniform3f(p.u.uAlbedo, PAD_ALBEDO[0], PAD_ALBEDO[1], PAD_ALBEDO[2]);
      setLight(p, glowCol, glowAmt);
    });

    drawWith(progs.plastic, meshes.racks, function (p) {
      gl.uniform3f(p.u.uAlbedo, RACK_ALBEDO[0], RACK_ALBEDO[1], RACK_ALBEDO[2]);
      gl.uniform1f(p.u.uUseMap, 0);
      setLight(p, glowCol, glowAmt, 2.1);
    });

    drawWith(progs.plastic, meshes.shell, function (p) {
      gl.uniform3f(p.u.uAlbedo, CASE_ALBEDO[0], CASE_ALBEDO[1], CASE_ALBEDO[2]);
      gl.uniform1f(p.u.uUseMap, 0);
      setLight(p, glowCol, glowAmt);
    });

    drawWith(progs.plastic, meshes.keyboard, function (p) {
      gl.uniform3f(p.u.uAlbedo, KEY_ALBEDO[0], KEY_ALBEDO[1], KEY_ALBEDO[2]);
      gl.uniform1f(p.u.uUseMap, 0);
      setLight(p, glowCol, glowAmt);
    });

    drawWith(progs.plastic, meshes.mouse, function (p) {
      gl.uniform3f(p.u.uAlbedo, KEY_ALBEDO[0], KEY_ALBEDO[1], KEY_ALBEDO[2]);
      gl.uniform1f(p.u.uUseMap, 0);
      setLight(p, glowCol, glowAmt);
    });

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.screen);
    drawWith(progs.plastic, meshes.plate, function (p) {
      gl.uniform3f(p.u.uAlbedo, CASE_ALBEDO[0] * 1.08, CASE_ALBEDO[1] * 1.08, CASE_ALBEDO[2] * 1.08);
      gl.uniform1f(p.u.uUseMap, 1);
      gl.uniform1i(p.u.uMap, 0);
      setLight(p, glowCol, glowAmt);
    });

    var onScreenPx = canvas.height * (2 * Math.atan(DIM.SH / Math.max(1, cam.eye[2])) / FOV);
    var lines = GLX.clamp(onScreenPx / 2.7, 110, 420);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex.screen);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex.glow);

    drawWith(progs.screen, meshes.screen, function (p) {
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform1i(p.u.uGlow, 1);
      gl.uniform2f(p.u.uAtlas, SCR.V0, SCR.V1 - SCR.V0);
      gl.uniform2f(p.u.uOpen, pw.openX, pw.openY);
      gl.uniform2f(p.u.uGlowTexel, 1 / SCR.GLOW_W, 1 / SCR.GLOW_H);
      gl.uniform3f(p.u.uEye, eye[0], eye[1], eye[2]);
      gl.uniform1f(p.u.uTime, t);
      gl.uniform1f(p.u.uBright, pw.bright);
      gl.uniform1f(p.u.uDegauss, pw.degauss);
      gl.uniform1f(p.u.uFx, CRT.fx);
      gl.uniform1f(p.u.uCurve, 0.055 * CRT.fx);
      gl.uniform1f(p.u.uLines, lines);
      gl.uniform1f(p.u.uNoise, pw.noise);
      gl.uniform1f(p.u.uPower, pw.power);
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);

    for (var ri = 0; ri < rackPanels.length; ri++) {
      var rp = rackPanels[ri];
      drawWith(progs.rack, rp.mesh, function (p) {
        gl.uniform1f(p.u.uTime, t);
        gl.uniform1f(p.u.uSeed, rp.seed);
        gl.uniform1f(p.u.uUnits, rp.units);
      });
    }

    drawWith(progs.led, meshes.led, function (p) {
      var amber = CRT.state === 'off' || (CRT.state === 'warm' && pw.clock < 0.6);
      if (amber) gl.uniform3f(p.u.uColour, 1.0, 0.55, 0.12);
      else gl.uniform3f(p.u.uColour, 0.35, 1.0, 0.55);
      gl.uniform1f(p.u.uOn, pw.led);
      gl.uniform1f(p.u.uTime, t);
    });
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };

  CRT.gl = function () { return gl; };
  global.CRT = CRT;
})(window);
