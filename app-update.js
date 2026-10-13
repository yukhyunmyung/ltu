/**
 * ✨ 막차유 앱 자동 업데이트 확인
 *
 * 앱(페이지)을 오래 켜두면 서버에 새 버전을 올려도 옛날 화면이 계속 남아 있습니다.
 * (예: 플레이패스 할인율을 바꿨는데 일부 회원 폰에서 예전 금액으로 계산됨)
 * 그래서 화면을 다시 볼 때마다 version.json 을 확인하고, 이 화면을 연 뒤에
 * 버전이 바뀌었으면 딱 한 번 새로고침합니다.
 *
 * 📌 배포 방법
 *   1) 수정한 파일들을 모두 먼저 올린다
 *   2) 마지막에 version.json 의 "version" 값을 새 값으로 바꿔서 올린다
 *      (예: "2026-10-12-1" → "2026-10-15-1")
 *   ※ version.json 을 안 바꾸면 아무 일도 일어나지 않습니다 (기존과 동일)
 *
 * 🛡️ 안전장치
 *   - version.json 이 없거나, 인터넷이 끊기거나, 오류가 나면 아무것도 하지 않음
 *   - 같은 버전으로는 한 번만 새로고침 (무한 새로고침 방지)
 *   - 확인은 화면이 다시 보일 때만 (사용 중에 갑자기 새로고침되지 않음)
 */
(function () {
    var VERSION_URL = 'version.json';
    var RELOAD_GUARD_KEY = 'ltu_app_reloaded_for';
    var MIN_INTERVAL = 10 * 1000;   // 앱 전환을 자주 해도 10초에 한 번만 확인

    var loadedVersion = null;       // 이 화면을 열었을 때의 버전
    var checking = false;
    var lastCheckAt = 0;

    function fetchLatestVersion() {
        if (!window.fetch) return Promise.resolve(null);
        return fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) { return (data && data.version) ? String(data.version) : null; })
            .catch(function () { return null; });
    }

    function getGuard() { try { return sessionStorage.getItem(RELOAD_GUARD_KEY); } catch (e) { return null; } }
    function setGuard(v) { try { sessionStorage.setItem(RELOAD_GUARD_KEY, v); } catch (e) {} }

    function check(force) {
        var now = Date.now();
        if (checking) return;
        if (!force && now - lastCheckAt < MIN_INTERVAL) return;
        checking = true;
        lastCheckAt = now;

        fetchLatestVersion().then(function (latest) {
            checking = false;
            if (!latest) return;                                  // 확인 실패 → 아무것도 안 함
            if (!loadedVersion) { loadedVersion = latest; return; } // 처음 연 시점의 버전 기록
            if (latest === loadedVersion) return;                 // 최신 상태

            // 이미 이 버전으로 한 번 새로고침했다면 다시 하지 않음 (무한 새로고침 방지)
            if (getGuard() === latest) { loadedVersion = latest; return; }
            setGuard(latest);
            location.reload();
        }, function () { checking = false; });
    }

    // 앱으로 다시 돌아왔을 때 (다른 앱 갔다가 복귀, 화면 켜짐 등)
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') check(false);
    });

    // 뒤로가기 등으로 예전 화면이 메모리에서 그대로 복원됐을 때
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) check(true);
    });

    // 처음 열었을 때: 현재 버전 기록
    check(true);
})();
