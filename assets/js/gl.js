(function (global) {
  'use strict';

  var GLX = {};


  GLX.context = function (canvas, opts) {
    var attrs = Object.assign({
      alpha: false,
      antialias: true,
      depth: true,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance'
    }, opts || {});
    try {
      return canvas.getContext('webgl', attrs) ||
             canvas.getContext('experimental-webgl', attrs);
    } catch (e) { return null; }
  };


  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[gl] compile failed:\n' + gl.getShaderInfoLog(sh) + '\n---\n' +
        src.split('\n').map(function (l, i) { return (i + 1) + '| ' + l; }).join('\n'));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  GLX.program = function (gl, vsSrc, fsSrc, attribs) {
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;

    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);

    var i, n, info;
    if (attribs) {
      for (i = 0; i < attribs.length; i++) gl.bindAttribLocation(p, i, attribs[i]);
    }

    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[gl] link failed:\n' + gl.getProgramInfoLog(p));
      return null;
    }

    p.a = {}; p.u = {};
    if (attribs) {
      for (i = 0; i < attribs.length; i++) p.a[attribs[i]] = i;
    }
    n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (i = 0; i < n; i++) {
      info = gl.getActiveAttrib(p, i);
      p.a[info.name] = gl.getAttribLocation(p, info.name);
    }
    n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (i = 0; i < n; i++) {
      info = gl.getActiveUniform(p, i);
      var nm = info.name.replace(/\[0\]$/, '');
      p.u[nm] = gl.getUniformLocation(p, nm);
    }
    return p;
  };


  GLX.buffer = function (gl, data, target, usage) {
    var t = target || gl.ARRAY_BUFFER;
    var b = gl.createBuffer();
    gl.bindBuffer(t, b);
    gl.bufferData(t, data, usage || gl.STATIC_DRAW);
    return b;
  };

  GLX.attrib = function (gl, buf, loc, size, stride, offset) {
    if (loc === undefined || loc === null || loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, (stride || 0) * 4, (offset || 0) * 4);
  };

  GLX.fullscreenTri = function (gl) {
    return GLX.buffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
  };


  GLX.texture = function (gl, source, opts) {
    opts = opts || {};
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY !== false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return t;
  };

  GLX.updateTexture = function (gl, tex, source, flipY) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY !== false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };


  var V3 = {};
  V3.sub = function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; };
  V3.cross = function (a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  };
  V3.norm = function (a) {
    var l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  GLX.V3 = V3;


  var M4 = {};

  M4.create = function () {
    var o = new Float32Array(16);
    o[0] = o[5] = o[10] = o[15] = 1;
    return o;
  };

  M4.identity = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  };

  M4.perspective = function (o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };

  M4.lookAt = function (o, eye, center, up) {
    var z = V3.norm(V3.sub(eye, center));
    var x = V3.norm(V3.cross(up, z));
    var y = V3.cross(z, x);
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0]; o[3] = 0;
    o[4] = x[1]; o[5] = y[1]; o[6] = z[1]; o[7] = 0;
    o[8] = x[2]; o[9] = y[2]; o[10] = z[2]; o[11] = 0;
    o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    o[15] = 1;
    return o;
  };

  M4.multiply = function (o, a, b) {
    var out = (o === a || o === b) ? new Float32Array(16) : o;
    for (var c = 0; c < 4; c++) {
      var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    if (out !== o) o.set(out);
    return o;
  };

  GLX.M4 = M4;


  function Mesh() {
    this.data = [];
    this.index = [];
    this.count = 0;
  }

  Mesh.prototype.vertex = function (p, n, u) {
    this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], u[0], u[1]);
    return this.count++;
  };

  Mesh.prototype.quad = function (a, b, c, d, n, uvs) {
    if (!n) n = V3.norm(V3.cross(V3.sub(b, a), V3.sub(d, a)));
    uvs = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    var i0 = this.vertex(a, n, uvs[0]);
    var i1 = this.vertex(b, n, uvs[1]);
    var i2 = this.vertex(c, n, uvs[2]);
    var i3 = this.vertex(d, n, uvs[3]);
    this.index.push(i0, i1, i2, i0, i2, i3);
    return this;
  };

  Mesh.prototype.bridge = function (inner, outer, close) {
    var n = inner.length;
    var last = close === false ? n - 1 : n;
    for (var i = 0; i < last; i++) {
      var j = (i + 1) % n;
      this.quad(inner[i], inner[j], outer[j], outer[i]);
    }
    return this;
  };

  Mesh.prototype.box = function (c, h) {
    var x0 = c[0] - h[0], x1 = c[0] + h[0];
    var y0 = c[1] - h[1], y1 = c[1] + h[1];
    var z0 = c[2] - h[2], z1 = c[2] + h[2];
    var P = function (x, y, z) { return [x, y, z]; };
    this.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1]);
    this.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), [0, 0, -1]);
    this.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), [1, 0, 0]);
    this.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), [-1, 0, 0]);
    this.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), [0, 1, 0]);
    this.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, -1, 0]);
    return this;
  };

  Mesh.prototype.cap = function (path, n, flip) {
    var cx = 0, cy = 0, cz = 0, i;
    for (i = 0; i < path.length; i++) { cx += path[i][0]; cy += path[i][1]; cz += path[i][2]; }
    var c = [cx / path.length, cy / path.length, cz / path.length];
    var ci = this.vertex(c, n, [0.5, 0.5]);
    var start = this.count;
    for (i = 0; i < path.length; i++) this.vertex(path[i], n, [0, 0]);
    for (i = 0; i < path.length; i++) {
      var a = start + i, b = start + (i + 1) % path.length;
      if (flip) this.index.push(ci, b, a); else this.index.push(ci, a, b);
    }
    return this;
  };

  Mesh.prototype.upload = function (gl) {
    return {
      vbo: GLX.buffer(gl, new Float32Array(this.data)),
      ibo: GLX.buffer(gl, new Uint16Array(this.index), gl.ELEMENT_ARRAY_BUFFER),
      count: this.index.length,
      verts: this.count
    };
  };

  GLX.Mesh = Mesh;

  GLX.bindMesh = function (gl, prog, m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    if (prog.a.aPos >= 0) {
      gl.enableVertexAttribArray(prog.a.aPos);
      gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, 32, 0);
    }
    if (prog.a.aNrm >= 0) {
      gl.enableVertexAttribArray(prog.a.aNrm);
      gl.vertexAttribPointer(prog.a.aNrm, 3, gl.FLOAT, false, 32, 12);
    }
    if (prog.a.aUv >= 0) {
      gl.enableVertexAttribArray(prog.a.aUv);
      gl.vertexAttribPointer(prog.a.aUv, 2, gl.FLOAT, false, 32, 24);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
  };

  GLX.drawMesh = function (gl, m) {
    gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
  };


  GLX.resize = function (gl, canvas, maxDpr) {
    var dpr = Math.min(global.devicePixelRatio || 1, maxDpr || 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  };


  GLX.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  GLX.lerp = function (a, b, t) { return a + (b - a) * t; };
  GLX.smooth = function (e0, e1, x) {
    var t = GLX.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  GLX.easeInOut = function (t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  GLX.reducedMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)').matches : false;

  global.GLX = GLX;
})(window);
