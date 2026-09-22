// hair salon nagi — 共通スクリプト（ナビ開閉・現在ページ表示・ふわっと表示・ギャラリー絞り込み）
(function () {
  document.documentElement.classList.add('js');

  // 現在ページをナビで示す
  var file = (location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.site-nav a, .footer-nav a').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (href === file) a.setAttribute('aria-current', 'page');
  });

  // スマホのナビ開閉
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  // スクロールで表示
  var items = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && items.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  // ギャラリーの絞り込み
  var filter = document.querySelector('.filter');
  if (filter) {
    filter.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var key = btn.getAttribute('data-filter');
      filter.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      document.querySelectorAll('.style-card').forEach(function (card) {
        var cat = card.getAttribute('data-cat') || '';
        card.hidden = !(key === 'all' || cat.split(' ').indexOf(key) !== -1);
      });
    });
  }
})();
