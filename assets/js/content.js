(function (global) {
  'use strict';

  var PROFILE = {
    handle: 'STDIO',
    name: 'STDIO',
    role: 'Security Tool Developer / Red Teamer',
    email: 'stdio@jarscanner.org',
    github: 'github.com/evilstdio',
  };

  var BANNER = [
    ['███████ ████████ ██████   ██   ██████  ', 'hi'],
    ['██         ██    ██   ██  ██  ██    ██ ', 'hi'],
    ['███████    ██    ██   ██  ██  ██    ██ ', 'hi'],
    ['     ██    ██    ██   ██  ██  ██    ██ ', 'hi'],
    ['███████    ██    ██████   ██   ██████  ', 'hi']
  ];


  var C = {};

  C.PROFILE = PROFILE;

  C.banner = function () {
    var out = [''];
    BANNER.forEach(function (b) { out.push([b]); });
    out.push('');
    out.push([['  ', 'dim'], [PROFILE.role, 'ok']]);
    out.push('');
    out.push([['  Type ', 'dim'], ['help', 'warn'], [' for the command index.', 'dim']]);
    out.push('');
    return out;
  };

  C.help = function () {
    return [
      '',
      [['AVAILABLE COMMANDS', 'hi']],
      '',
      [['  about      ', 'warn'], ['background, working style, what I actually do', 'fg']],
      [['  skills     ', 'warn'], ['The tools behind my analysis', 'fg']],
      [['  projects   ', 'warn'], ['work and writing', 'fg']],
      [['  contact    ', 'warn'], ['how to reach me', 'fg']],
      '',
      [['SYSTEM', 'hi']],
      '',
      [['  scan       ', 'warn'], ['run a demo port sweep', 'fg']],
      [['  sound      ', 'warn'], ['on | off', 'fg']],
      [['  theme      ', 'warn'], ['green | amber | ice', 'fg']],
      [['  crt        ', 'warn'], ['on | off', 'fg']],
      [['  zoom       ', 'warn'], ['in | out', 'fg']],
      [['  banner     ', 'warn'], ['redraw the logo', 'fg']],
      [['  clear      ', 'warn'], ['clear the screen', 'fg']],
      [['  poweroff   ', 'warn'], ['shut the terminal down', 'fg']],
      '',
      [['  Tab completes. ', 'dim'], ['↑↓', 'warn'], [' walks history.', 'dim']],
      ''
    ];
  };

  C.about = function () {
    return [
      '',
      [['// WHOAMI', 'hi']],
      '',
      [['  handle    ', 'dim'], [PROFILE.handle, 'ok']],
      [['  role      ', 'dim'], ['Security Tool Developer', 'fg']],
      [['  focus     ', 'dim'], ['Red team | Malware Analysis | Reverse engineering', 'fg']],
      [['  languages ', 'dim'], ['Python, Java, Javascript', 'fg']],
      '',
      'I am a developer and cybersecurity researcher focused on reverse engineering, malware analysis, and security tooling.',
      '',
      'I created JAR Scanner, a static malware analyzer designed to detect suspicious behavior in Java and Minecraft mod files. I enjoy researching how malicious software works, improving detection techniques, and turning that knowledge into practical, user-friendly tools.',
      '',
    ];
  };

  C.tools = [
    ['Detect It Easy', 'packer and obfuscator identification'],
    ['IDA Pro',        'native disassembly and decompilation'],
    ['Recaf',          'JVM bytecode analysis and editing'],
    ['Diobfuscator',   'JAR deobfuscation'],
    ['dnSpy',          '.NET decompiler and debugger'],
    ['pyinstxtractor', 'unpacking PyInstaller executables'],
    ['1shot',          'PyArmor deobfuscation'],
    ['Burp Suite',     'web proxy, request tampering, API testing'],
    ['Wireshark',      'traffic capture, C2 and exfil paths']
  ];

  C.languages = 'Python, Java, JavaScript';

  C.projects = [
    {
      id: 'jarscanner', code: 'OP-01', name: 'Jarscanner', status: 'DEPLOYED',
      sub: 'Static Malware Analyzer',
      stack: 'Java, JavaScript, Typescript, Node.js, HTML, CSS',
      impact: 'Detection for all active Java Malware-as-a-Services.',
      body: [ 
        'Static malware analysis platform focused on Java archives, with an emphasis on Minecraft mods and other JAR-based software.',
        'Inspects class files, manifests, embedded strings, URLs, webhooks, suspicious APIs, obfuscation patterns and other indicators without executing the sample.',
        'Uses custom detection rules and heuristics to surface suspicious behavior, known malware families and potentially malicious functionality in a clear scan report.' ]
    },
    {
      id: 'blog', code: 'OP-02', name: 'Blog', status: 'ONGOING',
      sub: 'Malware analysis writeups',
      link: 'jarscanner.github.io',
      body: [
        'Long-form analysis of Java malware families - the loaders, stealers and RATs that circulate through Minecraft mods, cracked plugins and other JAR-based software.',
        'Each post walks a real sample end to end: how it is packed and obfuscated, what the deobfuscated control flow actually does, where it reaches out to (webhooks, paste services, C2).',
      ]
    },
    {
      id: 'github', code: 'OP-03', name: 'Github', status: 'EXTERNAL',
      sub: 'Source, tools and releases',
      link: PROFILE.github
    }
  ];

  C.githubUrl = 'https://' + PROFILE.github;

  C.contact = function () {
    return [
      '',
      [['// ESTABLISH CONTACT', 'hi']],
      '',
      'Available for red-team engagements, security architecture reviews and advisory retainers.',
      '',
      [['  email     ', 'dim'], [PROFILE.email, 'link', 'mailto:' + PROFILE.email]],
      [['  github    ', 'dim'], [PROFILE.github, 'link', 'https://' + PROFILE.github]],
      '',
    ];
  };

  C.scanHosts = [
    ['22/tcp   open  ssh', 'OpenSSH 9.6p1', 'ok'],
    ['80/tcp   open  http', 'nginx 1.24.0', 'ok'],
    ['443/tcp  open  https', 'nginx 1.24.0 (TLS 1.3)', 'ok'],
    ['3389/tcp open  ms-wbt-server', 'NLA disabled', 'err'],
    ['5985/tcp open  wsman', 'WinRM — HTTP only', 'warn'],
    ['8080/tcp open  http-proxy', 'Jetty 9.4.51', 'warn'],
    ['9200/tcp open  elasticsearch', 'unauthenticated', 'err']
  ];

  global.CONTENT = C;
})(window);
