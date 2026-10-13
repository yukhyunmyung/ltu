/**
 * 👥 막차유 회원 수 카드 (공통)
 *
 * 전체 회원 / 최근 30일 신규 / 남 / 여 + 남녀 비율 막대
 * - 처음 보일 때 숫자 카운트업 + 비율 막대 채우기 + "NEW" 배지 반짝임
 * - 실시간 갱신 때는 애니메이션 없이 숫자만 바뀜
 * - 휴대폰 "움직임 줄이기" 설정이면 애니메이션 없이 바로 표시
 *
 * 사용:
 *   <script src="member-count.js"></script>
 *   LtuMemberCount.render(박스요소, members객체, { layout: 'grid' })   // members.html: 2×2
 *   LtuMemberCount.render(박스요소, members객체, { layout: 'row' })    // mypage 등: 한 줄 4칸
 */
(function () {
    var RECENT_DAYS = 30;
    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var css = ''
        + '.mcx-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}'
        + '.mcx-row .mcx-grid{grid-template-columns:repeat(4,1fr);gap:0;padding:18px 6px 16px;}'
        + '.mcx-tile{position:relative;background:#f8fafc;border:1px solid #eef1f5;border-radius:14px;padding:12px;min-width:0;}'
        + '.mcx-row .mcx-tile,.mcx-row .mcx-tile.new{background:none;border:none;border-left:1px solid #eef1f5;border-radius:0;padding:0 2px;text-align:center;animation:none;}'
        + '.mcx-row .mcx-tile:first-child{border-left:none;}'
        + '.mcx-label{font-size:11px;font-weight:700;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
        + '.mcx-val{font-size:24px;font-weight:900;letter-spacing:-.5px;margin-top:2px;color:#252a34;line-height:1.15;}'
        + '.mcx-row .mcx-val{font-size:19px;}'
        + '.mcx-val small{font-size:12px;font-weight:700;color:#8e8e93;margin-left:2px;}'
        + '.mcx-tile.male .mcx-val{color:#007aff;}'
        + '.mcx-tile.female .mcx-val{color:#ff2e63;}'
        + '.mcx-tile.new{background:#fff5f8;border-color:#ffc2d3;animation:mcxGlow 1.6s ease-in-out infinite;}'
        + '.mcx-tile.new .mcx-val{color:#ff2e63;}'
        + '.mcx-badge{position:absolute;top:9px;right:9px;display:none;align-items:center;gap:2px;font-size:10px;font-weight:900;color:#fff;padding:2px 8px;border-radius:999px;'
        +   'background:linear-gradient(110deg,#ff2e63 25%,#ffd1de 50%,#ff2e63 75%);background-size:240% 100%;'
        +   'animation:mcxShine 1.3s linear infinite,mcxPulse 1.1s ease-in-out infinite;}'
        + '.mcx-badge svg{width:11px;height:11px;flex:0 0 11px;}'
        + '.mcx-row .mcx-val{white-space:nowrap;}'
        + '.mcx-row .mcx-badge{position:static;vertical-align:4px;margin-left:2px;font-size:8px;padding:1px 4px;}'
        + '.mcx-row .mcx-badge svg{display:none;}'
        + '.mcx-bar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:#eef1f5;margin-top:14px;}'
        + '.mcx-row .mcx-bar{margin-top:0;height:3px;border-radius:0;}'
        + '.mcx-row .mcx-bar-legend{display:none;}'
        + '.mcx-bar-m{background:#007aff;width:0;transition:width 1.2s cubic-bezier(.2,.8,.2,1);}'
        + '.mcx-bar-f{background:#ff2e63;width:0;transition:width 1.2s cubic-bezier(.2,.8,.2,1) .15s;}'
        + '.mcx-bar-legend{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#8e8e93;margin-top:6px;}'
        + '@keyframes mcxShine{0%{background-position:120% 0;}100%{background-position:-120% 0;}}'
        + '@keyframes mcxPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,46,99,.55);}50%{transform:scale(1.16);box-shadow:0 0 12px 3px rgba(255,46,99,.45);}}'
        + '@keyframes mcxGlow{0%,100%{box-shadow:0 0 0 0 rgba(255,46,99,0);}50%{box-shadow:0 0 0 3px rgba(255,46,99,.22),0 0 18px rgba(255,46,99,.28);}}'
        + '@media (prefers-reduced-motion: reduce){.mcx-tile.new,.mcx-badge{animation:none;}.mcx-bar-m,.mcx-bar-f{transition:none;}}';

    function injectCss() {
        if (document.getElementById('mcx-style')) return;
        var st = document.createElement('style');
        st.id = 'mcx-style';
        st.textContent = css;
        document.head.appendChild(st);
    }

    function compute(members) {
        var list = Object.keys(members || {}).map(function (k) { return members[k] || {}; });
        var since = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
        var male = 0, female = 0, recent = 0;
        list.forEach(function (m) {
            if (m.gender === '남성') male++;
            else if (m.gender === '여성') female++;
            var t = Number(m.createdAt) || Date.parse(m.createdAt || '') || 0;
            if (t && t >= since) recent++;
        });
        var gTotal = male + female;
        var malePct = gTotal ? Math.round(male / gTotal * 100) : 0;
        return { total: list.length, male: male, female: female, recent: recent, malePct: malePct, femalePct: gTotal ? 100 - malePct : 0 };
    }

    var NEW_BADGE = '<span class="mcx-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zm0-12a2 2 0 0 1 2 2a2 2 0 0 1 2-2a2 2 0 0 1-2-2a2 2 0 0 1-2 2zm-7 12a6 6 0 0 1 6-6a6 6 0 0 1-6-6a6 6 0 0 1-6 6a6 6 0 0 1 6 6z"/></svg>NEW</span>';

    function build(box, layout) {
        var isRow = layout === 'row';
        box.classList.add('mcx-wrap');
        if (isRow) box.classList.add('mcx-row');
        box.innerHTML = ''
            + '<div class="mcx-grid">'
            +   '<div class="mcx-tile"><div class="mcx-label">전체 회원</div><div class="mcx-val"><span data-k="total">0</span><small>명</small></div></div>'
            +   '<div class="mcx-tile new">' + (isRow ? '' : NEW_BADGE) + '<div class="mcx-label">' + (isRow ? '30일 신규' : '최근 30일 신규') + '</div><div class="mcx-val">+<span data-k="recent">0</span><small>명</small>' + (isRow ? NEW_BADGE : '') + '</div></div>'
            +   '<div class="mcx-tile male"><div class="mcx-label">남</div><div class="mcx-val"><span data-k="male">0</span><small>명</small></div></div>'
            +   '<div class="mcx-tile female"><div class="mcx-label">여</div><div class="mcx-val"><span data-k="female">0</span><small>명</small></div></div>'
            + '</div>'
            + '<div class="mcx-bar"><div class="mcx-bar-m"></div><div class="mcx-bar-f"></div></div>'
            + '<div class="mcx-bar-legend"><span data-k="malePctText">남 0%</span><span data-k="femalePctText">여 0%</span></div>';
    }

    function setText(box, k, v) {
        var el = box.querySelector('[data-k="' + k + '"]');
        if (el) el.textContent = v;
    }

    function countUp(el, to) {
        var t0 = null, dur = 1200;
        function step(t) {
            if (t0 === null) t0 = t;
            var p = Math.min((t - t0) / dur, 1);
            var e = 1 - Math.pow(1 - p, 3);   // 처음엔 빠르게, 끝에서 천천히
            el.textContent = Math.round(to * e);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function apply(box, st, animate) {
        ['total', 'recent', 'male', 'female'].forEach(function (k) {
            var el = box.querySelector('[data-k="' + k + '"]');
            if (!el) return;
            if (animate) countUp(el, st[k]);
            else el.textContent = st[k];
        });
        setText(box, 'malePctText', '남 ' + st.malePct + '%');
        setText(box, 'femalePctText', '여 ' + st.femalePct + '%');
        box.querySelector('.mcx-badge').style.display = st.recent > 0 ? 'inline-flex' : 'none';
        var bm = box.querySelector('.mcx-bar-m'), bf = box.querySelector('.mcx-bar-f');
        if (animate) {
            setTimeout(function () { bm.style.width = st.malePct + '%'; bf.style.width = st.femalePct + '%'; }, 30);
        } else {
            bm.style.width = st.malePct + '%';
            bf.style.width = st.femalePct + '%';
        }
    }

    function render(box, members, opts) {
        if (!box) return;
        opts = opts || {};
        injectCss();
        var st = compute(members);
        if (!box.__mcx) {
            box.__mcx = { played: false };
            build(box, opts.layout || 'grid');
        }
        var state = box.__mcx;
        state.last = st;
        if (state.played) { apply(box, st, false); return; }   // 실시간 갱신: 숫자만 교체

        // 처음: 화면에 보일 때 한 번만 애니메이션
        if (reduceMotion || !('IntersectionObserver' in window)) {
            state.played = true;
            apply(box, st, false);
            return;
        }
        if (state.observing) return;
        state.observing = true;
        var io = new IntersectionObserver(function (entries) {
            if (!entries.some(function (e) { return e.isIntersecting; })) return;
            io.disconnect();
            state.played = true;
            apply(box, state.last, true);
        }, { threshold: 0.3 });
        io.observe(box);
    }

    window.LtuMemberCount = { render: render, compute: compute };
})();
