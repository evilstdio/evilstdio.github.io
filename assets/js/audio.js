(function (global) {
  'use strict';

  var STORE = 'vt9000.sound';
  var SFX = { enabled: true, available: true };

  try {
    var saved = global.localStorage && localStorage.getItem(STORE);
    if (saved !== null && saved !== undefined) SFX.enabled = (saved === '1');
  } catch (e) {}

  var ctx = null, master = null, noise = null, lastAt = -1;

  function init() {
    if (ctx) return true;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { SFX.available = false; return false; }

    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);

      var n = Math.floor(ctx.sampleRate * 0.25);
      noise = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noise.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      SFX.available = false;
      return false;
    }
    return true;
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  SFX.key = function (kind) {
    if (!SFX.enabled || !SFX.available) return;
    if (!init()) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

    var t = ctx.currentTime;
    if (t - lastAt < 0.022) return;
    lastAt = t;

    var heavy = (kind === 'enter' || kind === 'space');
    var dur = heavy ? rnd(0.055, 0.075) : rnd(0.026, 0.040);

    var src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = heavy ? rnd(850, 1350) : rnd(1700, 2700);
    bp.Q.value = rnd(0.7, 1.5);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((heavy ? 0.40 : 0.30) * rnd(0.78, 1.18), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? rnd(115, 165) : rnd(175, 245), t);
    osc.frequency.exponentialRampToValueAtTime(68, t + dur * 0.9);

    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime((heavy ? 0.30 : 0.15) * rnd(0.8, 1.2), t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.25);

    osc.connect(og); og.connect(master);
    osc.start(t);
    osc.stop(t + dur * 1.25 + 0.02);
  };

  SFX.thunk = function () {
    if (!SFX.enabled || !SFX.available) return;
    if (!init()) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();

    var t = ctx.currentTime;

    var src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.2);
    src.stop(t + 0.2);

    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);

    var og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.42, t + 0.006);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(og); og.connect(master);
    osc.start(t);
    osc.stop(t + 0.24);
  };

  SFX.setEnabled = function (on) {
    SFX.enabled = !!on;
    try { localStorage.setItem(STORE, SFX.enabled ? '1' : '0'); } catch (e) {}
    return SFX.enabled;
  };

  global.SFX = SFX;
})(window);
