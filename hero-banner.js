/**
 * 막차유 공용 히어로 배너 (타일/모자이크 전환)
 * - Firebase RTDB(soccer_club/heroBanner)에서 슬라이드(이미지/링크/문구)를 읽어 렌더
 * - 페이지에 <div id="heroBannerMount"></div> 를 두고 이 스크립트를 include 하면 동작
 * - admin.html에서 이미지/링크/문구를 관리
 */
(function () {
  var DB_URL = 'https://makcha-united-final-default-rtdb.firebaseio.com/soccer_club/heroBanner.json';
  var DEFAULT_SLIDES = [
    { image: 'ltu_slide_1.png' },
    { image: 'ltu_slide_2.png' },
    { image: 'ltu_slide_3.png' },
    { image: 'ltu_slide_4.png' }
  ];
  var COLS = 10, ROWS = 5, HOLD = 4500, TILE_DUR = 560, STEP = 28;

  var CSS =
    '.hero-banner{position:relative;width:100%;height:25vh;min-height:150px;max-height:300px;overflow:hidden;border-radius:0 0 5px 5px;background:#0b1220;box-shadow:0 4px 14px rgba(7,18,37,.14);margin-bottom:14px;}' +
    '.hero-banner.clickable{cursor:pointer;}' +
    '.hero-base{position:absolute;inset:0;background-size:cover;background-position:center;}' +
    '.hero-tiles{position:absolute;inset:0;display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(5,1fr);pointer-events:none;}' +
    '.hero-tile{background-repeat:no-repeat;opacity:.25;-webkit-clip-path:inset(50%);clip-path:inset(50%);will-change:opacity,clip-path;}' +
    '.hero-tile.show{opacity:1;-webkit-clip-path:inset(0);clip-path:inset(0);transition:opacity .45s ease,-webkit-clip-path .55s cubic-bezier(.45,0,.15,1),clip-path .55s cubic-bezier(.45,0,.15,1);}' +
    '.hero-overlay{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,0) 62%,rgba(0,0,0,.30) 100%);}' +
    '.hero-content{position:absolute;left:0;right:0;bottom:0;z-index:2;padding:16px 18px;color:#fff;pointer-events:none;}' +
    '.hero-kicker{font-size:10px;font-weight:900;letter-spacing:1.6px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.75),0 0 2px rgba(0,0,0,.6);}' +
    '.hero-title{font-size:22px;font-weight:1000;letter-spacing:-1px;line-height:1.06;text-shadow:0 2px 8px rgba(0,0,0,.7),0 1px 2px rgba(0,0,0,.85);margin-top:3px;}' +
    '.hero-title span{color:#ff2e63;}' +
    '.hero-dots{position:absolute;right:14px;bottom:14px;z-index:3;display:flex;gap:6px;}' +
    '.hero-dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5);transition:.25s;}' +
    '.hero-dots i.on{background:#fff;width:18px;border-radius:4px;}' +
    '@media (max-width:480px){.hero-title{font-size:20px;}}';

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function injectCSS() {
    if (document.getElementById('heroBannerStyle')) return;
    var st = document.createElement('style');
    st.id = 'heroBannerStyle';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function start(slides) {
    var mount = document.getElementById('heroBannerMount');
    if (!mount) return;
    slides = (slides && slides.length) ? slides : DEFAULT_SLIDES;
    injectCSS();
    mount.innerHTML =
      '<section class="hero-banner" id="heroBanner" aria-label="배너">' +
      '<div class="hero-base" id="heroBase"></div>' +
      '<div class="hero-tiles" id="heroTiles"></div>' +
      '<div class="hero-overlay"></div>' +
      '<div class="hero-content" id="heroContent"></div>' +
      '<div class="hero-dots" id="heroDots"></div>' +
      '</section>';

    var banner = document.getElementById('heroBanner');
    var base = document.getElementById('heroBase');
    var tiles = document.getElementById('heroTiles');
    var content = document.getElementById('heroContent');
    var dotsBox = document.getElementById('heroDots');
    var idx = 0, dims = {};

    slides.forEach(function (s) { if (s.image) { var im = new Image(); im.onload = (function (src) { return function () { dims[src] = { w: im.naturalWidth, h: im.naturalHeight }; }; })(s.image); im.src = s.image; } });
    slides.forEach(function (_, i) { var d = document.createElement('i'); if (i === 0) d.className = 'on'; dotsBox.appendChild(d); });
    function setDots(n) { [].forEach.call(dotsBox.children, function (d, i) { d.className = i === n ? 'on' : ''; }); }

    function applySlide(n) {
      var s = slides[n] || {};
      var html = '';
      if (s.kicker) html += '<div class="hero-kicker">' + esc(s.kicker) + '</div>';
      if (s.title) html += '<div class="hero-title">' + esc(s.title).replace(/\n/g, '<br>') + '</div>';
      content.innerHTML = html;
      if (s.link) { banner.classList.add('clickable'); banner.onclick = function () { location.href = s.link; }; }
      else { banner.classList.remove('clickable'); banner.onclick = null; }
      setDots(n);
    }

    base.style.backgroundImage = "url('" + slides[0].image + "')";
    applySlide(0);

    function coverBox(src) {
      var W = banner.clientWidth, H = banner.clientHeight, d = dims[src] || { w: 16, h: 9 };
      var s = Math.max(W / d.w, H / d.h), cw = d.w * s, ch = d.h * s;
      return { W: W, H: H, cw: cw, ch: ch, ox: (W - cw) / 2, oy: (H - ch) / 2 };
    }

    function next() {
      var n = (idx + 1) % slides.length, img = slides[n].image;
      var cv = coverBox(img), tileW = cv.W / COLS, tileH = cv.H / ROWS;
      tiles.innerHTML = '';
      var frag = document.createDocumentFragment();
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var t = document.createElement('div');
          t.className = 'hero-tile';
          t.style.backgroundImage = "url('" + img + "')";
          t.style.backgroundSize = cv.cw + 'px ' + cv.ch + 'px';
          t.style.backgroundPosition = (cv.ox - c * tileW) + 'px ' + (cv.oy - r * tileH) + 'px';
          t.style.transitionDelay = ((c + r) * STEP) + 'ms';
          frag.appendChild(t);
        }
      }
      tiles.appendChild(frag);
      requestAnimationFrame(function () { requestAnimationFrame(function () { [].forEach.call(tiles.children, function (t) { t.classList.add('show'); }); }); });
      var total = (COLS - 1 + ROWS - 1) * STEP + TILE_DUR + 60;
      setTimeout(function () { base.style.backgroundImage = "url('" + img + "')"; tiles.innerHTML = ''; idx = n; applySlide(n); }, total);
    }

    if (slides.length > 1) setInterval(next, HOLD);
  }

  function normalizeSlides(cfg) {
    var raw = cfg && cfg.slides;
    var arr = null;
    if (Array.isArray(raw)) arr = raw;
    else if (raw && typeof raw === 'object') arr = Object.keys(raw).sort().map(function (k) { return raw[k]; });
    return arr ? arr.filter(function (s) { return s && s.image; }) : null;
  }

  function boot() {
    fetch(DB_URL)
      .then(function (r) { return r.json(); })
      .then(function (cfg) { start(normalizeSlides(cfg)); })
      .catch(function () { start(null); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
