(function () {
  'use strict';

  var stage   = document.getElementById('stage');
  var powerBtn= document.getElementById('powerBtn');
  var keys    = document.getElementById('keys');
  var ghost   = document.getElementById('ghost');

  if (!CRT.init(stage)) {
    document.body.classList.add('no-webgl');
    return;
  }

  var isTouch = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  if (isTouch) document.body.classList.add('is-touch');


  function columnsFor(w) {
    if (w >= 1150) return 80;
    if (w >= 900)  return 72;
    if (w >= 680)  return 62;
    if (w >= 520)  return 52;
    return 44;
  }

  function applyLayout() {
    var cols = columnsFor(window.innerWidth);
    if (cols !== SCR.cols) {
      SCR.setCols(cols);
      TERM.prompt = cols >= 62 ? 'stdio@vt9000:~$ ' : '~$ ';
      TERM.reflow();
    }
    CRT.refit();
    TERM.dirty = true;
  }
  applyLayout();
  window.addEventListener('resize', applyLayout);


  function followLink(url) {
    if (!/^(https?:|mailto:)/i.test(url)) return;
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  TERM.onEvent = function (kind, value) {
    if (kind === 'crt') CRT.fx = value ? 1 : 0;
    else if (kind === 'zoom') CRT.setCamera(value === 'wide' ? 'wide' : 'read');
    else if (kind === 'poweroff') CRT.powerOff();
    else if (kind === 'theme') { CRT.degauss(); TERM.dirty = true; }
    else if (kind === 'openurl') followLink(value);
  };

  CRT.onReady = function () { TERM.bootSequence(); TERM.dirty = true; };

  CRT.onPowerOff = function () {
    document.body.classList.remove('is-live');
    TERM.dirty = true;
  };


  function powerOn() {
    if (CRT.state !== 'off') return;
    document.body.classList.add('is-live');
    CRT.powerOn();
    if (isTouch) focusGhost();
  }

  powerBtn.addEventListener('click', powerOn);

  function urlAt(clientX, clientY) {
    var nx = (clientX / window.innerWidth) * 2 - 1;
    var ny = 1 - (clientY / window.innerHeight) * 2;
    var p = CRT.pickScreen(nx, ny);
    return p ? SCR.hitTest(p.x, p.y) : null;
  }

  stage.addEventListener('pointerdown', function (e) {
    if (CRT.state === 'off') { powerOn(); return; }

    var url = urlAt(e.clientX, e.clientY);
    if (url) { followLink(url); return; }

    if (isTouch) focusGhost();
  });

  window.addEventListener('pointermove', function (e) {
    if (CRT.state === 'off') {
      var nx = (e.clientX / window.innerWidth) * 2 - 1;
      var ny = 1 - (e.clientY / window.innerHeight) * 2;
      CRT.hover = CRT.overScreen(nx, ny);
      return;
    }
    stage.style.cursor = urlAt(e.clientX, e.clientY) ? 'pointer' : '';
  }, { passive: true });

  var PASSTHROUGH = { F5: 1, F11: 1, F12: 1 };
  var MODIFIER = {
    Shift: 1, Control: 1, Alt: 1, Meta: 1,
    CapsLock: 1, NumLock: 1, ScrollLock: 1, ContextMenu: 1
  };

  window.addEventListener('keydown', function (e) {
    if (CRT.state === 'off') {
      if (PASSTHROUGH[e.key] || MODIFIER[e.key]) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab') return;
      powerOn();
      e.preventDefault();
      return;
    }
    if (PASSTHROUGH[e.key]) return;
    if ((e.ctrlKey || e.metaKey) && 'rcvxRCVX'.indexOf(e.key) !== -1) return;

    if (e.target === ghost && e.key.length === 1 && !e.ctrlKey && !e.metaKey) return;

    if (e.key === 'PageUp')   { TERM.scroll(SCR.rows - 2);  e.preventDefault(); return; }
    if (e.key === 'PageDown') { TERM.scroll(-(SCR.rows - 2)); e.preventDefault(); return; }

    if (TERM.key(e)) {
      TERM.dirty = true;
      e.preventDefault();
    }
  });

  function focusGhost() {
    ghost.value = '';
    ghost.focus({ preventScroll: true });
  }
  ghost.addEventListener('input', function () {
    var v = ghost.value;
    ghost.value = '';
    for (var i = 0; i < v.length; i++) {
      TERM.key({ key: v[i], preventDefault: function () {} });
    }
    TERM.dirty = true;
  });


  keys.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || CRT.state === 'off') return;
    TERM.type(b.getAttribute('data-cmd'));
    TERM.dirty = true;
  });


  stage.addEventListener('wheel', function (e) {
    if (CRT.state === 'off') return;
    TERM.scroll(e.deltaY > 0 ? -2 : 2);
    e.preventDefault();
  }, { passive: false });

  var touchY = null;
  stage.addEventListener('touchstart', function (e) {
    touchY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchmove', function (e) {
    if (touchY === null) return;
    var dy = e.touches[0].clientY - touchY;
    if (Math.abs(dy) > 22) {
      TERM.scroll(dy > 0 ? 1 : -1);
      touchY = e.touches[0].clientY;
    }
  }, { passive: true });


  function repaint() {
    if (CRT.showStandby) {
      SCR.paintStandby();
      TERM.dirty = false;
      return;
    }
    var d = TERM.display();
    var lines = d.lines;
    if (TERM.scrollOffset > 0) {
      lines = lines.slice(0, Math.max(1, lines.length - TERM.scrollOffset));
    }
    SCR.paint(lines, d.caret);
    TERM.dirty = false;
  }

  TERM.reset();
  repaint();
  SCR.clearGlow();


  var last = performance.now();

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (CRT.state !== 'off') TERM.tick(dt);
    if (TERM.dirty || !SCR.fontReadyPainted) {
      if (SCR.fontReady) SCR.fontReadyPainted = true;
      repaint();
    }

    CRT.render(now / 1000, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      applyLayout();
      TERM.dirty = true;
    });
  }
})();
