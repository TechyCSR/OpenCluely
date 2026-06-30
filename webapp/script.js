/* OpenCluely webapp interactions */
(function () {
  'use strict';

  var REPO = 'TechyCSR/OpenCluely';
  var el = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Nav: scroll state + mobile menu ---------- */
  var nav = el('nav');
  var onScroll = function () {
    if (window.scrollY > 12) { nav.classList.add('scrolled'); }
    else { nav.classList.remove('scrolled'); }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var menuBtn = el('menu-btn');
  var mobileMenu = el('mobile-menu');
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (mobileMenu) { mobileMenu.hidden = !open; }
    });
    mobileMenu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', 'Open menu');
        mobileMenu.hidden = true;
      });
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var revealTargets = document.querySelectorAll('.card, .step, .faq details, .platform, .install-list li, .section-title, .section-sub');
  if ('IntersectionObserver' in window && !reduceMotion) {
    revealTargets.forEach(function (t) { t.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealTargets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- Hero tilt ---------- */
  var tilt = el('tilt');
  var stage = tilt ? tilt.parentElement : null;
  if (tilt && stage && !reduceMotion && window.matchMedia('(hover: hover)').matches) {
    stage.addEventListener('mousemove', function (ev) {
      var r = stage.getBoundingClientRect();
      var px = (ev.clientX - r.left) / r.width;
      var py = (ev.clientY - r.top) / r.height;
      var rx = (py - 0.5) * -10;
      var ry = (px - 0.5) * 12;
      tilt.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)';
    });
    stage.addEventListener('mouseleave', function () {
      tilt.style.transition = 'transform .5s ease-out';
      tilt.style.transform = 'rotateX(0) rotateY(0)';
      setTimeout(function () { tilt.style.transition = 'transform .15s ease-out'; }, 500);
    });
  }

  /* ---------- Streaming code typing animation ---------- */
  var codeEl = el('type-code');
  if (codeEl && !reduceMotion) {
    var snippet =
      'int findDuplicate(vector<int>& nums) {\n' +
      '    int slow = nums[0], fast = nums[0];\n' +
      '    do {\n' +
      '        slow = nums[slow];\n' +
      '        fast = nums[nums[fast]];\n' +
      '    } while (slow != fast);\n' +
      '    return slow;\n' +
      '}';
    var i = 0;
    var typeNext = function () {
      codeEl.textContent = snippet.slice(0, i);
      i++;
      if (i <= snippet.length) {
        setTimeout(typeNext, 22 + Math.round(Math.sin(i) * 8) + 8);
      } else {
        setTimeout(function () { i = 0; typeNext(); }, 4200);
      }
    };
    typeNext();
  } else if (codeEl) {
    codeEl.textContent = 'int findDuplicate(vector<int>& nums) { ... }';
  }

  /* ---------- GitHub stars ---------- */
  var starEl = el('star-count');
  fetch('https://api.github.com/repos/' + REPO, { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (d && typeof d.stargazers_count === 'number' && starEl) {
        starEl.textContent = d.stargazers_count >= 1000
          ? (d.stargazers_count / 1000).toFixed(1) + 'k'
          : String(d.stargazers_count);
      }
    })
    .catch(function () {});

  /* ---------- OS detection ---------- */
  function detectOS() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var plat = (navigator.platform || '').toLowerCase();
    if (ua.indexOf('windows') !== -1 || plat.indexOf('win') !== -1) return 'windows';
    if (ua.indexOf('mac') !== -1 || plat.indexOf('mac') !== -1) {
      // Apple Silicon is the default for new Macs; cannot read arch reliably.
      return 'macos-arm';
    }
    if (ua.indexOf('linux') !== -1 || ua.indexOf('x11') !== -1) return 'linux-deb';
    return null;
  }

  /* ---------- Platforms ---------- */
  var PLATFORMS = [
    { id: 'windows', label: 'Windows', icon: 'i-windows', note: 'NSIS installer. Adds a Start Menu shortcut.',
      match: function (n) { return n.endsWith('.exe') && n.indexOf('blockmap') === -1; } },
    { id: 'macos-arm', label: 'macOS, Apple Silicon', icon: 'i-apple', note: 'For M1, M2, M3 and M4 Macs.',
      match: function (n) { return n.endsWith('.dmg') && n.indexOf('arm64') !== -1; } },
    { id: 'macos-intel', label: 'macOS, Intel', icon: 'i-apple', note: 'For older Intel based Macs.',
      match: function (n) { return n.endsWith('.dmg') && n.indexOf('arm64') === -1; } },
    { id: 'linux-deb', label: 'Linux, Debian or Ubuntu', icon: 'i-linux', note: 'Pulls system deps automatically.',
      match: function (n) { return n.endsWith('.deb'); } },
    { id: 'linux-appimage', label: 'Linux, universal', icon: 'i-linux', note: 'No install. Mark executable and run.',
      match: function (n) { return n.endsWith('.appimage'); } }
  ];

  function fmtBytes(b) {
    if (!b) return '';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
  }
  function icon(id) { return '<svg class="ic"><use href="#' + id + '"/></svg>'; }

  function assetRow(a) {
    return '<a class="asset" href="' + a.browser_download_url + '" target="_blank" rel="noopener" download>' +
      icon('i-download') +
      '<span class="meta"><span class="fname">' + a.name + '</span>' +
      '<span class="fsize">' + fmtBytes(a.size) + '</span></span>' +
      '<span class="go">' + '<svg class="ic"><use href="#i-arrow"/></svg>' + '</span>' +
      '</a>';
  }

  function renderRelease(rel) {
    var assets = (rel.assets || []).filter(function (a) {
      var n = a.name.toLowerCase();
      return !n.endsWith('.blockmap') && !n.endsWith('.yml') && n !== 'sha256sums.txt';
    });

    // Version banner
    el('dl-version').innerHTML =
      '<span class="tag"><span class="dot"></span>' + rel.tag_name +
      '<span class="when">released ' + fmtDate(rel.published_at) + '</span></span>';

    // Per-platform matched assets
    var byPlatform = PLATFORMS.map(function (p) {
      var matched = assets.filter(function (a) { return p.match(a.name.toLowerCase()); });
      return { p: p, assets: matched };
    });

    // Grid
    el('dl-grid').innerHTML = byPlatform.map(function (g) {
      var links = g.assets.length
        ? g.assets.map(assetRow).join('')
        : '<span class="asset empty">Not in this release</span>';
      return '<div class="platform">' +
        '<div class="platform-head">' + icon(g.p.icon) + '<h4>' + g.p.label + '</h4></div>' +
        '<p class="pnote">' + g.p.note + '</p>' +
        '<div class="dl-links">' + links + '</div>' +
        '</div>';
    }).join('');

    // Recommended card for the visitor's OS
    var os = detectOS();
    var rec = null;
    for (var k = 0; k < byPlatform.length; k++) {
      if (byPlatform[k].p.id === os && byPlatform[k].assets.length) { rec = byPlatform[k]; break; }
    }
    if (rec) {
      var a = rec.assets[0];
      el('dl-recommend').innerHTML =
        '<div class="rec-left">' +
          '<span class="rec-ic">' + icon(rec.p.icon) + '</span>' +
          '<span class="rec-text">' +
            '<span class="rec-label">Recommended for you</span>' +
            '<span class="rec-title">' + rec.p.label + '</span>' +
            '<span class="rec-file">' + a.name + ' &middot; ' + fmtBytes(a.size) + '</span>' +
          '</span>' +
        '</div>' +
        '<a class="btn btn-solid" href="' + a.browser_download_url + '" target="_blank" rel="noopener" download>' +
          icon('i-download') + 'Download</a>';
      el('dl-recommend').classList.remove('hidden');
      var heroLbl = el('hero-dl-label');
      if (heroLbl) { heroLbl.textContent = 'Download for ' + (os.indexOf('mac') === 0 ? 'macOS' : os.indexOf('win') === 0 ? 'Windows' : 'Linux'); }
    }

    el('dl-loading').classList.add('hidden');
    el('dl-version').classList.remove('hidden');
    el('dl-grid').classList.remove('hidden');
    el('dl-foot').classList.remove('hidden');

    // Animate freshly added cards
    if ('IntersectionObserver' in window && !reduceMotion) {
      el('dl-grid').querySelectorAll('.platform').forEach(function (p) {
        p.classList.add('reveal');
        var o = new IntersectionObserver(function (en) {
          en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); o.unobserve(x.target); } });
        }, { threshold: 0.1 });
        o.observe(p);
      });
    }
  }

  function showDownloadError() {
    el('dl-loading').classList.add('hidden');
    el('dl-error').classList.remove('hidden');
  }

  fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(renderRelease)
    .catch(showDownloadError);
})();
