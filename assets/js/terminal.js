(function (global) {
  'use strict';

  var C = global.CONTENT;

  var TERM = {
    lines: [],
    input: '',
    history: [],
    histIdx: -1,
    scrollOffset: 0,
    busy: false,
    caretOn: true,
    prompt: 'stdio@vt9000:~$ ',
    onEvent: function () {}
  };

  var queue = [];
  var waitFor = 0;
  var caretClock = 0;


  function runsOf(line) {
    if (typeof line === 'string') return [[line, 'fg']];
    var out = [];
    for (var i = 0; i < line.length; i++) {
      var t = line[i][0];
      if (t === undefined || t === null) continue;
      out.push([typeof t === 'string' ? t : String(t), line[i][1], line[i][2]]);
    }
    return out;
  }

  function lineLength(runs) {
    var n = 0;
    for (var i = 0; i < runs.length; i++) n += runs[i][0].length;
    return n;
  }

  function wrapLine(line, cols) {
    var runs = runsOf(line);
    if (lineLength(runs) <= cols) return [runs];

    var lead = (runs[0][0].match(/^\s+/) || [''])[0];
    if (lead.length > cols * 0.4) lead = '';

    var out = [], cur = [], curLen = 0, started = false;

    function flush() {
      if (cur.length) out.push(cur);
      cur = [];
      curLen = 0;
      if (lead) { cur.push([lead, 'dim']); curLen = lead.length; }
    }

    for (var i = 0; i < runs.length; i++) {
      var text = runs[i][0], colour = runs[i][1], url = runs[i][2];
      var tokens = text.match(/\S+\s*|\s+/g) || [];
      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        var trimmed = tok.replace(/\s+$/, '');
        if (curLen > 0 && curLen + trimmed.length > cols) {
          flush();
          tok = tok.replace(/^\s+/, '');
          if (!tok) continue;
        }
        if (curLen === 0 && started && /^\s+$/.test(tok)) continue;
        cur.push([tok, colour, url]);   // a wrapped link stays a link
        curLen += tok.length;
        started = true;
      }
    }
    if (cur.length) out.push(cur);
    return out;
  }

  function hardWrap(text, cols) {
    var out = [];
    for (var i = 0; i < text.length; i += cols) out.push(text.slice(i, i + cols));
    return out.length ? out : [''];
  }


  TERM.raw = [];
  var counts = [];

  TERM.push = function (line) {
    var wrapped = wrapLine(line, SCR.cols);
    for (var i = 0; i < wrapped.length; i++) TERM.lines.push(wrapped[i]);
    TERM.raw.push(line);
    counts.push(wrapped.length);

    while (TERM.lines.length > 700 && counts.length > 1) {
      TERM.lines.splice(0, counts[0]);
      counts.shift();
      TERM.raw.shift();
    }
    TERM.scrollOffset = 0;
  };

  TERM.replaceLast = function (line) {
    var n = counts.pop() || 1;
    TERM.lines.splice(TERM.lines.length - n, n);
    TERM.raw.pop();
    TERM.push(line);
  };

  TERM.reset = function () {
    TERM.lines = []; TERM.raw = []; counts = [];
    TERM.scrollOffset = 0;
  };

  TERM.reflow = function () {
    var src = TERM.raw.slice();
    TERM.reset();
    for (var i = 0; i < src.length; i++) TERM.push(src[i]);
    TERM.dirty = true;
  };

  TERM.emit = function (lines, delay) {
    for (var i = 0; i < lines.length; i++) {
      queue.push({ k: 'line', v: lines[i], d: delay === undefined ? 0.022 : delay });
    }
    TERM.busy = true;
  };
  TERM.wait = function (d) { queue.push({ k: 'wait', d: d }); TERM.busy = true; };
  TERM.then = function (fn) { queue.push({ k: 'fn', fn: fn, d: 0 }); TERM.busy = true; };
  TERM.count = function (to, fmt, step, d) {
    queue.push({ k: 'count', to: to, fmt: fmt, step: step, d: d, n: 0, started: false });
    TERM.busy = true;
  };

  TERM.flush = function () {
    while (queue.length) {
      var t = queue.shift();
      if (t.k === 'line') TERM.push(t.v);
      else if (t.k === 'fn') t.fn();
      else if (t.k === 'count') TERM.push(t.fmt(t.to));
    }
    TERM.busy = false;
    waitFor = 0;
  };

  TERM.tick = function (dt) {
    caretClock += dt;
    var blink = caretClock % 1.06 < 0.62;
    if (blink !== TERM.caretOn) { TERM.caretOn = blink; TERM.dirty = true; }

    if (!queue.length) { TERM.busy = false; return; }

    waitFor -= dt;
    var guard = 0;
    while (queue.length && waitFor <= 0 && guard++ < 200) {
      var t = queue[0];
      if (t.k === 'line') {
        TERM.push(t.v); queue.shift(); waitFor += t.d;
      } else if (t.k === 'wait') {
        queue.shift(); waitFor += t.d;
      } else if (t.k === 'fn') {
        queue.shift(); t.fn();
      } else if (t.k === 'count') {
        if (!t.started) { t.started = true; TERM.push(t.fmt(0)); }
        t.n = Math.min(t.to, t.n + t.step);
        TERM.replaceLast(t.fmt(t.n));
        if (t.n >= t.to) queue.shift();
        waitFor += t.d;
      }
      TERM.dirty = true;
    }
    if (!queue.length) TERM.busy = false;
  };


  TERM.display = function () {
    var out = TERM.lines.slice();
    var caret = null;

    if (!TERM.busy) {
      var full = TERM.prompt + TERM.input;
      var chunks = hardWrap(full, SCR.cols);
      if (full.length > 0 && full.length % SCR.cols === 0) chunks.push('');

      for (var i = 0; i < chunks.length; i++) {
        if (i === 0) {
          out.push([[TERM.prompt, 'ok'], [chunks[0].slice(TERM.prompt.length), 'hi']]);
        } else {
          out.push([[chunks[i], 'hi']]);
        }
      }
      caret = {
        row: out.length - 1,
        col: chunks[chunks.length - 1].length,
        on: TERM.caretOn
      };
    }
    return { lines: out, caret: caret };
  };

  TERM.scroll = function (delta) {
    var view = TERM.display().lines.length;
    var max = Math.max(0, view - SCR.rows);
    TERM.scrollOffset = GLX.clamp(TERM.scrollOffset + delta, 0, max);
    TERM.dirty = true;
  };


  function rule(ch, n, colour) {
    return [[new Array(n + 1).join(ch || '─'), colour || 'dim']];
  }

  function head(text) {
    return [['// ' + text, 'hi']];
  }

  function pad(s, n) {
    s = String(s);
    return s.length >= n ? s.slice(0, n) : s + new Array(n - s.length + 1).join(' ');
  }


  var CMD = {};

  CMD.help = function () { TERM.emit(C.help(), 0.018); };

  CMD.banner = function () { TERM.emit(C.banner(), 0.05); };

  CMD.about = function () { TERM.emit(C.about(), 0.03); };
  CMD.whoami = CMD.about;

  CMD.skills = function () {
    var out = ['', head('TOOLCHAIN'), ''];

    var w = 0;
    C.tools.forEach(function (t) { w = Math.max(w, t[0].length); });

    C.tools.forEach(function (t) {
      out.push([
        ['  ', 'dim'],
        [pad(t[0], w + 3), 'ok'],
        [t[1], 'fg']
      ]);
    });

    out.push('');
    out.push([['  languages  ', 'dim'], [C.languages, 'fg']]);
    out.push('');
    TERM.emit(out, 0.06);
  };
  CMD.tools = CMD.skills;

  CMD.projects = function () {
    var out = ['', head('SELECTED OPERATIONS'), ''];
    C.projects.forEach(function (p) {
      out.push([
        ['  ' + pad(p.code, 7), 'dim'],
        [pad(p.name, 13), 'ok'],
        [pad(p.sub, 36), 'fg'],
        [p.status, p.status === 'RESEARCH' ? 'warn' : 'dim']
      ]);
    });
    out.push('');
    out.push([['  open <name>', 'warn'], ['  for the full brief — e.g. ', 'dim'], ['open jarscanner', 'ok']]);
    out.push('');
    TERM.emit(out, 0.03);
  };
  CMD.ops = CMD.projects;

  CMD.open = function (arg) {
    if (!arg) { TERM.emit([[['usage: open <project>   (try: projects)', 'warn']]]); return; }
    var key = arg.toLowerCase();
    var p = C.projects.filter(function (x) {
      return x.id === key || x.name.toLowerCase() === key || x.code.toLowerCase() === key;
    })[0];
    if (!p) {
      TERM.emit([[['no such project: ', 'err'], [arg, 'fg']]]);
      return;
    }
    var out = ['', [[p.code + '  ', 'dim'], [p.name, 'hi'], ['   [' + p.status + ']', 'warn']]];
    out.push([['  ' + p.sub, 'ok']]);
    out.push(rule('─', Math.min(SCR.cols - 2, 62)));

    if (p.body) p.body.forEach(function (para) { out.push('  ' + para); out.push(''); });
    if (p.stack)  out.push([['  stack   ', 'dim'], [p.stack, 'fg']]);
    if (p.impact) out.push([['  impact  ', 'dim'], [p.impact, 'ok']]);

    if (p.link) {
      var target = p.url || p.link;
      if (!/^https?:\/\//i.test(target)) target = 'https://' + target;
      out.push([['  link    ', 'dim'], [p.link, 'link', target]]);
    }
    out.push('');
    TERM.emit(out, 0.03);
  };
  CMD.project = CMD.open;

  CMD.github = function () { CMD.open('github'); };

  CMD.contact = function () { TERM.emit(C.contact(), 0.035); };

  CMD.clear = function () {
    TERM.reset();
    SCR.clearGlow();
  };

  CMD.ls = function () {
    TERM.emit([
      '',
      [['  about.txt      toolchain.txt  projects/', 'ok']],
      [['  contact.asc    github.url     .secrets', 'ok']],
      '',
      [['  (cat <file> works too)', 'dim']],
      ''
    ], 0.03);
  };

  CMD.cat = function (arg) {
    if (!arg) { TERM.emit([[['usage: cat <file>', 'warn']]]); return; }
    var map = {
      'about.txt': 'about', 'contact.asc': 'contact',
      'toolchain.txt': 'skills', 'skills.dat': 'skills'
    };
    var target = map[arg.toLowerCase()];
    if (target) { CMD[target](); return; }
    if (arg.toLowerCase() === 'github.url') {
      // shortcut files really do look like this
      TERM.emit([
        '',
        [['[InternetShortcut]', 'dim']],
        [['URL=', 'dim'], [C.githubUrl, 'link', C.githubUrl]],
        '',
        [['  (click it, or ', 'dim'], ['open github', 'warn'], [')', 'dim']],
        ''
      ], 0.04);
      return;
    }
    if (arg === '.secrets') {
      TERM.emit(['', [['  cat: .secrets: Permission denied', 'err']],
                 [['  (nice try)', 'dim']], ''], 0.08);
      return;
    }
    TERM.emit([[['cat: ' + arg + ': No such file or directory', 'err']]]);
  };

  CMD.scan = function (arg) {
    var target = arg || '10.0.14.0/24';
    TERM.emit([
      '',
      [['$ nmap -sS -sV -T4 ' + target, 'dim']],
      ''
    ], 0.02);
    TERM.wait(0.35);
    TERM.emit([[['Starting scan against ' + target + ' ...', 'fg']]]);
    TERM.wait(0.5);
    TERM.emit([
      '',
      [['Host is up (0.00042s latency).', 'fg']],
      [['PORT     STATE SERVICE          VERSION', 'dim']]
    ], 0.05);
    C.scanHosts.forEach(function (h) {
      TERM.wait(0.16);
      TERM.emit([[['  ' + pad(h[0], 32), h[2]], [h[1], 'dim']]]);
    });
    TERM.wait(0.4);
    TERM.emit([
      '',
      [['2 findings above threshold. ', 'err'], ['Full methodology in the report.', 'dim']],
      [['This is a canned demo - no packets left your machine.', 'dim']],
      ''
    ], 0.05);
  };

  CMD.theme = function (arg) {
    if (!arg) {
      TERM.emit([[['phosphor: ', 'dim'], [SCR.themeLabel(), 'ok'],
                  ['   options: ' + SCR.themeNames.join(', '), 'dim']]]);
      return;
    }
    if (SCR.setTheme(arg.toLowerCase())) {
      TERM.emit([[['phosphor set to ', 'dim'], [SCR.themeLabel(), 'ok']]]);
      TERM.onEvent('theme', arg.toLowerCase());
    } else {
      TERM.emit([[['unknown phosphor: ' + arg, 'err']]]);
    }
  };

  CMD.sound = function (arg) {
    if (!arg) {
      TERM.emit([[['key clicks are ', 'dim'], [TERM.soundOn ? 'ON' : 'OFF', 'ok'],
                  ['   (sound on | off)', 'dim']]]);
      return;
    }
    var on = arg.toLowerCase() !== 'off';
    TERM.onEvent('sound', on);
    TERM.emit([[['key clicks ', 'dim'], [on ? 'ENABLED' : 'MUTED', on ? 'ok' : 'warn']]]);
  };
  CMD.mute = function () { CMD.sound('off'); };

  CMD.crt = function (arg) {
    var on = arg !== 'off';
    TERM.onEvent('crt', on);
    TERM.emit([[['tube effects ', 'dim'], [on ? 'ENABLED' : 'DISABLED', on ? 'ok' : 'warn']]]);
  };

  CMD.zoom = function (arg) {
    var mode = (arg === 'out' || arg === 'wide') ? 'wide' : 'read';
    TERM.onEvent('zoom', mode);
    TERM.emit([[['camera: ' + (mode === 'wide' ? 'stepping back' : 'moving in'), 'dim']]]);
  };

  CMD.uname = function () {
    TERM.emit([[['VT-9000 vt9000 2.14 #1 PHOSPHOR ' + SCR.themeLabel() + ' m68k', 'fg']]]);
  };

  CMD.date = function () {
    TERM.emit([[[new Date().toString(), 'fg']]]);
  };

  CMD.echo = function (arg) { TERM.emit([[[arg || '', 'fg']]]); };

  CMD.history = function () {
    var out = [''];
    TERM.history.slice(-20).forEach(function (h, i) {
      out.push([['  ' + pad(i + 1, 4), 'dim'], [h, 'fg']]);
    });
    out.push('');
    TERM.emit(out, 0.015);
  };

  CMD.sudo = function () {
    TERM.emit([
      '',
      [['  stdio is not in the sudoers file.', 'err']],
      [['  This incident has been reported.', 'err']],
      [['  ...to me. I logged it. Nicely done.', 'dim']],
      ''
    ], 0.12);
  };

  CMD.poweroff = function () {
    TERM.emit(['', [['Broadcast message from root@vt9000', 'dim']],
               [['The system is going down NOW!', 'warn']], ''], 0.12);
    TERM.wait(0.5);
    TERM.then(function () { TERM.onEvent('poweroff'); });
  };
  CMD.exit = CMD.poweroff;
  CMD.shutdown = CMD.poweroff;

  var NAMES = Object.keys(CMD);


  TERM.exec = function (raw) {
    var text = raw.trim();
    TERM.push([[TERM.prompt, 'ok'], [text, 'hi']]);
    if (!text) return;

    TERM.history.push(text);
    if (TERM.history.length > 60) TERM.history.shift();
    TERM.histIdx = -1;

    var sp = text.indexOf(' ');
    var name = (sp === -1 ? text : text.slice(0, sp)).toLowerCase();
    var arg = sp === -1 ? '' : text.slice(sp + 1).trim();

    if (CMD.hasOwnProperty(name)) {
      CMD[name](arg);
      return;
    }

    var near = NAMES.filter(function (n) { return n.indexOf(name.slice(0, 3)) === 0; })[0];
    var msg = [['  ', 'dim'], [name, 'err'], [': command not found', 'fg']];
    TERM.emit(['', msg,
      near ? [['  did you mean ', 'dim'], [near, 'warn'], ['?', 'dim']]
           : [['  type ', 'dim'], ['help', 'warn'], [' for the command index', 'dim']],
      ''], 0.04);
  };


  TERM.key = function (e) {
    if (TERM.busy) {
      if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'c')) TERM.flush();
      return true;
    }

    if (e.key === 'Enter') {
      var cmd = TERM.input;
      TERM.input = '';
      TERM.exec(cmd);
      return true;
    }
    if (e.key === 'Backspace') {
      TERM.input = TERM.input.slice(0, -1);
      return true;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!TERM.history.length) return true;
      if (TERM.histIdx === -1) TERM.histIdx = TERM.history.length;
      TERM.histIdx += (e.key === 'ArrowUp' ? -1 : 1);
      TERM.histIdx = GLX.clamp(TERM.histIdx, 0, TERM.history.length);
      TERM.input = TERM.history[TERM.histIdx] || '';
      return true;
    }
    if (e.key === 'Tab') {
      var cur = TERM.input.toLowerCase();
      if (cur) {
        var hit = NAMES.filter(function (n) { return n.indexOf(cur) === 0; });
        if (hit.length === 1) TERM.input = hit[0] + ' ';
        else if (hit.length > 1) TERM.emit(['', [['  ' + hit.join('   '), 'dim']], '']);
      }
      return true;
    }
    if (e.key === 'Escape') { TERM.input = ''; return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { CMD.clear(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { TERM.input = ''; return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    if (e.key.length === 1 && TERM.input.length < 120) {
      TERM.input += e.key;
      return true;
    }
    return false;
  };

  TERM.type = function (text) {
    if (TERM.busy) return;
    TERM.input = '';
    TERM.exec(text);
  };


  TERM.bootSequence = function () {
    TERM.reset();
    var d = 0.055;

    TERM.emit([
      [['VT-9000 BIOS  v2.14', 'hi']],
      [['(C) 1984 STDIO SYSTEMS  —  all rights reserved', 'dim']],
      ''
    ], 0.09);

    TERM.wait(0.25);
    TERM.emit([[['CPU  : MOS 68010 @ 10 MHz', 'fg']]], d);
    TERM.wait(0.18);

    TERM.count(640, function (n) {
      return [['MEM  : ', 'fg'], [pad(String(n).padStart(6, '0') + ' KB', 12), 'fg'],
              [n >= 640 ? 'OK' : '', 'ok']];
    }, 40, 0.022);

    TERM.wait(0.3);
    TERM.emit([
      '',
      [['Detecting devices ...', 'fg']],
      [['  fd0   1.44M floppy        ', 'dim'], ['[ OK ]', 'ok']],
      [['  hd0   40MB MFM            ', 'dim'], ['[ OK ]', 'ok']],
      [['  tty0  phosphor display    ', 'dim'], ['[ OK ]', 'ok']],
      [['  eth0  10BASE-2            ', 'dim'], ['[ LINK ]', 'ok']],
      ''
    ], 0.11);

    TERM.wait(0.3);
    TERM.emit([
      [['Mounting /dev/hd0 on /            ', 'fg'], ['done', 'ok']],
      [['Loading /boot/portfolio.img       ', 'fg'], ['done', 'ok']],
      [['Starting shell                    ', 'fg'], ['done', 'ok']]
    ], 0.16);

    TERM.wait(0.45);
    TERM.then(function () { TERM.reset(); SCR.clearGlow(); });
    TERM.emit(C.banner(), 0.06);
  };

  TERM.commandNames = NAMES;
  global.TERM = TERM;
})(window);
