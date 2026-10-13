/**
 * 💬 막차유 1:1 문의 플로팅 버튼 + 채팅 창
 *
 * - 모든 회원 화면 오른쪽 아래에 채팅 버튼을 띄우고, 안 읽은 관리자 답변 수를 배지로 표시
 * - 버튼을 누르면 화면 이동 없이 아래에서 채팅 창이 올라옴 (내용은 chat.html?embed=1)
 * - 닫기: 창 왼쪽 위 "‹" 버튼(아이폰) / 폰 뒤로가기(갤럭시) / 바깥 어두운 영역 터치
 * - 관리자 답변이 오면 알림음 (화면을 한 번이라도 터치한 뒤부터 가능 — 브라우저 정책)
 *
 * 사용: 각 화면 </head> 앞에 <script type="module" src="chat-launcher.js"></script>
 * 로그인 안 된 화면에서는 아무것도 표시하지 않음
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const userKey = localStorage.getItem('userKey');

if (userKey && !window.__ltuChatLauncher) {
    window.__ltuChatLauncher = true;

    const firebaseConfig = {
        apiKey: "AIzaSyAo6x8MqKqEJVstH9ZjDa6tyrOPHEo6CfM",
        authDomain: "makcha-united-final.firebaseapp.com",
        databaseURL: "https://makcha-united-final-default-rtdb.firebaseio.com",
        projectId: "makcha-united-final",
        storageBucket: "makcha-united-final.firebasestorage.app",
        messagingSenderId: "631914143856",
        appId: "1:631914143856:web:5d96e048da9a19a90954b5"
    };
    // 화면 자체의 Firebase 와 충돌하지 않도록 이름을 붙인 별도 앱 사용
    const app = initializeApp(firebaseConfig, 'ltu-chat-launcher');
    const db = getDatabase(app);

    // 운영진 전용 버튼/글쓰기 버튼이 보이면 그 위로 비켜섬
    const AVOID_SELECTORS = ['#reviewPreviewBtn', '#adminFloatingAddBtn', '.write-btn'];

    const style = document.createElement('style');
    style.textContent = `
        .ltu-chat-fab {
            position: fixed; right: 16px; bottom: 90px; z-index: 950;
            width: 54px; height: 54px; border: none; border-radius: 50%;
            background: linear-gradient(135deg, #ff2e63, #e91e63); color: #fff;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 10px 24px rgba(255,46,99,.38); cursor: pointer;
            -webkit-tap-highlight-color: transparent; transition: transform .15s, opacity .2s;
        }
        .ltu-chat-fab:active { transform: scale(.94); }
        .ltu-chat-fab.hide { opacity: 0; pointer-events: none; }
        .ltu-chat-fab-badge {
            position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px;
            border-radius: 10px; background: #111827; color: #fff; border: 2px solid #fff;
            font: 900 11px/16px 'Pretendard', -apple-system, sans-serif; text-align: center; display: none;
        }
        .ltu-chat-overlay {
            position: fixed; inset: 0; z-index: 100010; display: none;
            background: rgba(15,23,42,.5); align-items: flex-end; justify-content: center;
        }
        .ltu-chat-overlay.show { display: flex; }
        .ltu-chat-sheet {
            width: 100%; max-width: 520px;
            height: calc(100vh - 40px); height: calc(100dvh - 40px);
            background: #fff; border-radius: 18px 18px 0 0; overflow: hidden;
            display: flex; flex-direction: column;
            padding-bottom: env(safe-area-inset-bottom, 0px);
            box-shadow: 0 -12px 40px rgba(0,0,0,.25);
            transform: translateY(100%); transition: transform .28s cubic-bezier(.2,.8,.2,1);
        }
        .ltu-chat-overlay.open .ltu-chat-sheet { transform: translateY(0); }
        .ltu-chat-head {
            flex: 0 0 auto; display: flex; align-items: center; gap: 4px;
            height: 54px; padding: 0 12px 0 6px; border-bottom: 1px solid #e5e7eb;
            font-family: 'Pretendard', -apple-system, sans-serif;
        }
        .ltu-chat-back {
            width: 42px; height: 42px; border: none; border-radius: 50%; background: transparent;
            color: #111827; font-size: 30px; line-height: 1; cursor: pointer;
            display: flex; align-items: center; justify-content: center; padding-bottom: 3px;
        }
        .ltu-chat-back:active { background: #f1f5f9; }
        .ltu-chat-title { font-size: 17px; font-weight: 900; color: #111827; letter-spacing: -.3px; }
        .ltu-chat-frame { flex: 1; width: 100%; border: 0; display: block; background: #f8fafc; }
    `;
    document.head.appendChild(style);

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'ltu-chat-fab';
    fab.setAttribute('aria-label', '1:1 문의 열기');
    fab.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg><span class="ltu-chat-fab-badge"></span>';
    const badge = fab.querySelector('.ltu-chat-fab-badge');

    const overlay = document.createElement('div');
    overlay.className = 'ltu-chat-overlay';
    overlay.innerHTML = '<div class="ltu-chat-sheet" role="dialog" aria-modal="true" aria-label="1:1 문의">'
        + '<div class="ltu-chat-head"><button type="button" class="ltu-chat-back" aria-label="뒤로가기">‹</button>'
        + '<span class="ltu-chat-title">1:1 문의</span></div></div>';
    const sheet = overlay.querySelector('.ltu-chat-sheet');

    let isOpen = false;
    let frame = null;
    let ignoreNextPop = false;
    let pendingOpen = false;
    let popGuardTimer = null;
    let savedOverflow = null;

    // ── 버튼 위치: 하단 탭바 바로 위, 겹치는 버튼이 있으면 그 위 ──
    function placeFab() {
        const vh = window.innerHeight;
        let bottom = 24;
        const tab = document.querySelector('.tabbar');
        if (tab) {
            const r = tab.getBoundingClientRect();
            if (r.height > 0 && r.top < vh) bottom = Math.max(bottom, vh - r.top + 14);
        }
        AVOID_SELECTORS.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                if (!r.width || !r.height || cs.display === 'none' || cs.visibility === 'hidden') return;
                if (r.right < window.innerWidth - 90) return;   // 오른쪽 끝에 있는 것만
                bottom = Math.max(bottom, vh - r.top + 12);
            });
        });
        fab.style.bottom = Math.round(bottom) + 'px';
    }

    // ── 안 읽은 답변 배지 ──
    let lastCount = null;
    onValue(ref(db, `soccer_club/inquiries/${userKey}/memberUnreadCount`), (snap) => {
        const count = Number(snap.val() || 0);
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : String(count);
            badge.style.display = 'block';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
        // 창이 닫혀 있을 때 새 답변이 오면 알림음 (창이 열려 있으면 채팅 화면이 알려줌)
        if (lastCount !== null && count > lastCount && !isOpen) playAlertSound();
        lastCount = count;
    });

    // ── 알림음 (외부 파일 없이 생성) ──
    let alertCtx = null;
    function unlockAlertSound() {
        try {
            if (!alertCtx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (AC) alertCtx = new AC();
            }
            if (alertCtx && alertCtx.state === 'suspended') alertCtx.resume();
        } catch (e) {}
    }
    ['pointerdown', 'touchend', 'keydown'].forEach(evt => document.addEventListener(evt, unlockAlertSound, { capture: true, passive: true }));
    function playAlertSound() {
        try {
            if (!alertCtx || alertCtx.state !== 'running') return;
            const t = alertCtx.currentTime;
            [[880, 0], [1320, 0.13]].forEach(([freq, delay]) => {
                const osc = alertCtx.createOscillator();
                const gain = alertCtx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.0001, t + delay);
                gain.gain.exponentialRampToValueAtTime(0.18, t + delay + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.22);
                osc.connect(gain).connect(alertCtx.destination);
                osc.start(t + delay);
                osc.stop(t + delay + 0.24);
            });
        } catch (e) {}
    }
    // 채팅 창 안(chat.html)에서 "답변 왔어요" 신호를 보내면 여기서 소리
    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin) return;
        if (e.data && e.data.type === 'ltu-chat-alert') playAlertSound();
    });

    // ── 열기 / 닫기 ──
    function openChat() {
        if (isOpen) return;
        // 방금 닫으면서 정리 중인 뒤로가기가 아직 안 끝났으면, 끝난 뒤에 열기 (히스토리 꼬임 방지)
        if (ignoreNextPop) { pendingOpen = true; return; }
        isOpen = true;
        // 창을 열 때마다 새로 불러옴 → 닫혀 있는 동안 몰래 "읽음" 처리되지 않음
        frame = document.createElement('iframe');
        frame.className = 'ltu-chat-frame';
        frame.title = '1:1 문의';
        frame.src = 'chat.html?embed=1';
        sheet.appendChild(frame);

        savedOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        overlay.classList.add('show');
        // 애니메이션 시작 (그 사이 이미 닫혔으면 다시 열지 않음)
        requestAnimationFrame(() => requestAnimationFrame(() => { if (isOpen) overlay.classList.add('open'); }));
        fab.classList.add('hide');
        // 갤럭시 뒤로가기 → 앱이 꺼지지 않고 채팅 창만 닫히도록 히스토리 한 칸 추가
        history.pushState({ ltuChat: 1 }, '');
    }

    function closeChat(fromPop) {
        if (!isOpen) return;
        isOpen = false;
        overlay.classList.remove('open');
        fab.classList.remove('hide');
        if (savedOverflow) {
            document.documentElement.style.overflow = savedOverflow[0];
            document.body.style.overflow = savedOverflow[1];
            savedOverflow = null;
        }
        const f = frame;
        frame = null;
        setTimeout(() => {
            if (!isOpen) overlay.classList.remove('show');
            if (f && f.parentNode) f.parentNode.removeChild(f);
        }, 280);
        // 버튼/바깥 터치로 닫았으면 추가해둔 히스토리 한 칸 정리 (뒤로가기로 닫힌 경우는 이미 소비됨)
        if (!fromPop && history.state && history.state.ltuChat) {
            ignoreNextPop = true;
            history.back();
            // 혹시 뒤로가기 신호가 오지 않는 브라우저 대비: 잠시 뒤 정리 상태 해제
            clearTimeout(popGuardTimer);
            popGuardTimer = setTimeout(finishPopCleanup, 800);
        }
    }

    function finishPopCleanup() {
        clearTimeout(popGuardTimer);
        ignoreNextPop = false;
        if (pendingOpen) { pendingOpen = false; openChat(); }
    }

    // capture 단계 → 화면의 다른 팝업(경기 상세, 라인업) 뒤로가기 처리보다 먼저 실행
    window.addEventListener('popstate', (e) => {
        if (ignoreNextPop) {               // 우리가 정리하느라 생긴 뒤로가기 → 다른 팝업은 건드리지 않음
            e.stopImmediatePropagation();
            finishPopCleanup();
            return;
        }
        if (isOpen) {
            closeChat(true);
            e.stopImmediatePropagation();
        }
    }, true);

    fab.addEventListener('click', openChat);
    overlay.querySelector('.ltu-chat-back').addEventListener('click', () => closeChat(false));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeChat(false); });

    function mount() {
        document.body.appendChild(fab);
        document.body.appendChild(overlay);
        placeFab();
        window.addEventListener('resize', placeFab);
        // 운영진 버튼 등은 데이터 로딩 후에 나타나므로 주기적으로 위치 재확인 (가벼운 계산)
        setInterval(() => { if (!isOpen && !document.hidden) placeFab(); }, 1500);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) placeFab(); });
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
}
