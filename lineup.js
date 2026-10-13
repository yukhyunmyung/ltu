/* ✨ AI 자동 라인업 (밸런스 팀 분배 + 전술판)
 * - 실력등급(skill) 기반 스네이크 드래프트로 팀 균등 분배
 * - 회원: pos(FW/MF/DF/GK)+skill, 게스트: skill(있음)/pos(없음)
 * - 📍 pick(이 경기에서 고른 선호 자리) > pos(프로필 주 포지션) 순으로 배치, 같은 자리 희망자는 팀별로 분산
 * - GK는 우선 배정하되 잉여 GK는 필드로 전환
 * - 외부 이미지 없이 SVG/CSS로 전술판 렌더링
 * - mypage.html 등에서 window.__mcLineups[matchId] 에 {roster, sportKey, sportLabel, matchName} 저장 후
 *   window.showLineupPopup(matchId) 호출
 */
(function () {
    'use strict';

    var SKILL_SCORE = { '상': 9, '중상': 8, '중': 7, '중하': 6, '하': 5, '하하': 4, '하하하': 3, '하하하하': 2, '하하하하하': 1 };
    function skillToScore(s) { return SKILL_SCORE[s] != null ? SKILL_SCORE[s] : 7; }
    function skillGrade(score) { return score >= 6 ? 'hi' : (score >= 4 ? 'mid' : 'lo'); }

    // 팀 인원수별 포메이션 (3:3 ~ 12:12 등 구장 크기에 맞춰 자동 적용)
    var FORM_TABLE = {
        1: { GK: 1, DF: 0, MF: 0, FW: 0 },
        2: { GK: 1, DF: 0, MF: 0, FW: 1 },
        3: { GK: 1, DF: 1, MF: 0, FW: 1 },
        4: { GK: 1, DF: 1, MF: 1, FW: 1 },
        5: { GK: 1, DF: 2, MF: 1, FW: 1 },
        6: { GK: 1, DF: 2, MF: 2, FW: 1 },
        7: { GK: 1, DF: 2, MF: 3, FW: 1 },
        8: { GK: 1, DF: 3, MF: 3, FW: 1 },
        9: { GK: 1, DF: 3, MF: 3, FW: 2 },
        10: { GK: 1, DF: 4, MF: 3, FW: 2 },
        11: { GK: 1, DF: 4, MF: 3, FW: 3 },
        12: { GK: 1, DF: 4, MF: 4, FW: 3 }
    };
    function makeFormation(size) {
        size = Math.max(1, size | 0);
        if (FORM_TABLE[size]) return FORM_TABLE[size];
        var rest = size - 1;                      // 12 초과 일반식
        var df = Math.round(rest * 0.38);
        var fw = Math.floor(rest * 0.27);
        var mf = rest - df - fw;
        return { GK: 1, DF: df, MF: mf < 0 ? 0 : mf, FW: fw };
    }
    // capacityText("5vs5","3:3","6vs6vs6","최대 12명","2~6명" 등)에서 팀 수·팀당 인원 산출
    function parseGrouping(capacityText, maxPeople, sportKey, n) {
        var text = String(capacityText || '').toLowerCase().replace(/\s+/g, '');
        // N(vs|:|대|x|×)N(...) → 그룹 분할 형식
        if (/(\d+)((?:vs|:|대|x|×)\d+)+/.test(text)) {
            var nums = (text.match(/\d+/g) || []).map(Number).filter(function (x) { return x > 0; });
            if (nums.length >= 2) {
                return { teamCount: nums.length, teamSize: Math.max.apply(null, nums) };
            }
        }
        // maxPeople 미전달 시 텍스트에서 총원 추출 (최대 N / N~M / N명)
        if (!(maxPeople > 0)) {
            var mm = text.match(/최대(\d+)/) || text.match(/\d+[~-](\d+)/) || text.match(/^(\d+)명?$/);
            if (mm) maxPeople = Number(mm[1] || mm[0].replace(/\D/g, ''));
        }
        if (maxPeople && maxPeople > 0) {         // 총원만 아는 경우
            var tc = (sportKey === 'futsal' && maxPeople > 12 && maxPeople % 3 === 0) ? 3 : 2;
            return { teamCount: tc, teamSize: Math.ceil(maxPeople / tc) };
        }
        var tc2 = (sportKey === 'futsal' && n > 12) ? 3 : 2;   // 정보 없음 → 실제 인원 기준
        return { teamCount: tc2, teamSize: Math.ceil(n / tc2) };
    }
    var TEAM_META = [
        { name: '레드팀', emoji: '🔴', cls: 'lu-t-red' },
        { name: '블루팀', emoji: '🔵', cls: 'lu-t-blue' },
        { name: '그린팀', emoji: '🟢', cls: 'lu-t-green' },
        { name: '옐로팀', emoji: '🟡', cls: 'lu-t-yellow' }
    ];

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    function computeLineup(roster, opts) {
        opts = opts || {};
        var sportKey = opts.sportKey || 'soccer';
        var players = (roster || []).map(function (p) {
            var sc = skillToScore(p.skill);
            return { name: p.name || '선수', key: p.key || null, score: sc, skill: p.skill || '중', pos: p.pos || null, pick: p.pick || null, isGuest: !!p.isGuest, confirmed: p.confirmed !== false, url: p.url || '' };
        });
        shuffle(players);                       // 동점자 랜덤
        players.sort(function (a, b) { return b.score - a.score; });

        // 입금확정자만 필드 배치, 미입금/확인중은 후보로
        var field = players.filter(function (p) { return p.confirmed; });
        var unconfirmed = players.filter(function (p) { return !p.confirmed; });

        var g = parseGrouping(opts.capacityText, opts.maxPeople, sportKey, field.length);
        var teamCount = g.teamCount;
        var formation = { teamSize: g.teamSize, slots: makeFormation(g.teamSize) };
        var teams = [];
        for (var i = 0; i < teamCount; i++) teams.push({ players: [] });

        // 스네이크 드래프트 (총점 균등)
        var idx = 0, dir = 1;
        field.forEach(function (p) {
            teams[idx].players.push(p);
            if (dir === 1) { if (idx === teamCount - 1) dir = -1; else idx++; }
            else { if (idx === 0) dir = 1; else idx--; }
        });
        spreadPrefs(teams, formation);          // 같은 자리 희망자 팀별 분산

        teams.forEach(function (t) {
            assignPositions(t, formation);
            t.total = t.players.reduce(function (s, p) { return s + p.score; }, 0);
            t.avg = t.players.length ? (t.total / t.players.length) : 0;
        });

        var totals = teams.map(function (t) { return t.total; });
        var diff = totals.length ? (Math.max.apply(null, totals) - Math.min.apply(null, totals)) : 0;

        return { teams: teams, sportKey: sportKey, formation: formation, teamCount: teamCount, teamSize: g.teamSize, balanceDiff: diff, bench: unconfirmed };
    }

    // 선호 라인: 이 경기에서 고른 자리(pick) 우선, 없으면 프로필 주 포지션(pos)
    function prefOf(p) { return p.pick || p.pos || null; }

    // 📍 같은 자리 희망자를 팀별로 고르게 분산 (실력이 가장 비슷한 선수끼리 맞교환 → 밸런스 유지)
    //    밸런스 편차가 max(원래 편차, 2점)을 넘게 되는 교환은 하지 않음
    function spreadPrefs(teams, formation) {
        if (!teams || teams.length < 2) return;
        var LINES = ['GK', 'DF', 'MF', 'FW'];
        var countOf = function (t, L) { return t.players.filter(function (p) { return !p.isSub && prefOf(p) === L; }).length; };
        var totals = teams.map(function (t) { return t.players.reduce(function (s, p) { return s + (p.isSub ? 0 : p.score); }, 0); });
        var spread = function (arr) { return Math.max.apply(null, arr) - Math.min.apply(null, arr); };
        var allowDiff = Math.max(spread(totals), 2);
        for (var iter = 0; iter < 60; iter++) {
            var moved = false;
            for (var li = 0; li < LINES.length && !moved; li++) {
                var L = LINES[li], need = formation.slots[L] || 0;
                var cnt = teams.map(function (t) { return countOf(t, L); });
                var a = cnt.indexOf(Math.max.apply(null, cnt)), b = cnt.indexOf(Math.min.apply(null, cnt));
                // 한 팀에 몰렸을 때만 (차이 2명 이상, 또는 한쪽은 넘치고 한쪽은 모자람)
                if (!(cnt[a] - cnt[b] >= 2 || (cnt[a] > need && cnt[b] < need))) continue;
                var best = null;
                teams[a].players.forEach(function (x, xi) {
                    if (x.isSub || prefOf(x) !== L) return;
                    teams[b].players.forEach(function (y, yi) {
                        if (y.isSub || prefOf(y) === L) return;
                        var cost = Math.abs(x.score - y.score) + (prefOf(y) ? 0.5 : 0);   // 희망 자리 없는 선수와 우선 교환
                        var M = prefOf(y);                                               // y를 옮겨서 다른 라인이 몰리면 제외
                        if (M && countOf(teams[a], M) >= countOf(teams[b], M)) return;
                        var nt = totals.slice(), d = x.score - y.score;                 // 교환 후 팀 총점
                        nt[a] -= d; nt[b] += d;
                        if (spread(nt) > allowDiff) return;                              // 밸런스가 깨지는 교환 제외
                        if (!best || cost < best.cost) best = { xi: xi, yi: yi, cost: cost, d: d };
                    });
                });
                if (!best) continue;
                var tmp = teams[a].players[best.xi];
                teams[a].players[best.xi] = teams[b].players[best.yi];
                teams[b].players[best.yi] = tmp;
                totals[a] -= best.d; totals[b] += best.d;
                moved = true;
            }
            if (!moved) break;
        }
    }

    function assignPositions(team, formation) {
        var slots = formation.slots;             // {GK,DF,MF,FW}
        var pool = team.players.slice().sort(function (a, b) { return b.score - a.score; });   // 실력 내림차순
        var lines = { GK: [], DF: [], MF: [], FW: [] };
        function take(L, test) {
            while (lines[L].length < (slots[L] || 0)) {
                var i = pool.findIndex(test);
                if (i < 0) return;
                var pl = pool.splice(i, 1)[0];
                pl.assigned = L;
                lines[L].push(pl);
            }
        }
        // 1순위: 이 경기에서 고른 선호 자리(pick) → 2순위: 프로필 주 포지션(pick 없는 선수만)
        ['GK', 'DF', 'MF', 'FW'].forEach(function (L) { take(L, function (p) { return p.pick === L; }); });
        ['GK', 'DF', 'MF', 'FW'].forEach(function (L) { take(L, function (p) { return !p.pick && p.pos === L; }); });
        // GK가 비면 남은 인원 중 가장 낮은 실력 1명 (잉여 GK 희망자는 자동으로 필드行)
        while (lines.GK.length < (slots.GK || 0) && pool.length) {
            var gk = pool.pop();
            gk.assigned = 'GK';
            lines.GK.push(gk);
        }
        // 남은 자리: DF → MF → FW 순으로 잔여 중 최고 실력
        ['DF', 'MF', 'FW'].forEach(function (L) { take(L, function () { return true; }); });
        team.lines = lines;
        team.bench = pool;                       // 정원 초과분 = 후보
    }

    // 📍 선호 자리 반영률 (자리를 고른 선수 중 그 자리에 배치된 수 + 미반영 목록)
    function prefStats(teams) {
        var picked = 0, matched = 0, misses = [];
        (teams || []).forEach(function (t) {
            ['GK', 'DF', 'MF', 'FW'].forEach(function (L) {
                ((t.lines && t.lines[L]) || []).forEach(function (p) {
                    if (!p.pick) return;
                    picked++;
                    if (p.pick === L) matched++;
                    else misses.push(p.name + '(' + p.pick + '→' + L + ')');
                });
            });
            (t.bench || []).forEach(function (p) {
                if (!p.pick) return;
                picked++;
                misses.push(p.name + '(' + p.pick + '→교체)');
            });
        });
        return { picked: picked, matched: matched, misses: misses };
    }

    /* ---------- 🙋 확정 라인업에서 내 자리 찾기 ---------- */
    var _me = null;   // 보기 팝업을 연 회원 { key, name }
    // 회원키가 저장된 라인업은 키로, 예전 라인업(키 없음)은 이름으로 비교
    function isMe(p, me) {
        if (!p || !me) return false;
        if (p.key && me.key) return p.key === me.key;
        return !p.key && !!me.name && String(p.name || '').trim() === String(me.name).trim();
    }
    function findMySpot(saved, me) {
        if (!saved || !saved.teams || !me) return null;
        for (var i = 0; i < saved.teams.length; i++) {
            var pl = (saved.teams[i].players || []).filter(function (p) { return isMe(p, me); })[0];
            if (pl) return { team: i, pos: pl.isSub ? '교체' : (pl.pos || ''), pick: pl.pick || null };
        }
        var b = (saved.bench || []).filter(function (p) { return isMe(p, me); })[0];
        return b ? { team: -1, pos: '후보', pick: b.pick || null } : null;
    }
    function spotText(spot) {
        if (!spot) return '';
        if (spot.team < 0) return '🪑 후보';
        var meta = TEAM_META[spot.team] || { name: '팀' + (spot.team + 1), emoji: '⚪' };
        return meta.emoji + ' ' + meta.name + (spot.pos ? ' · ' + spot.pos : '');
    }
    // 페이지 카드 버튼용: "🔴 레드팀 · DF" (라인업에 없으면 '')
    window.luMySpotText = function (saved, key, name) {
        return spotText(findMySpot(saved, { key: key || null, name: name || '' }));
    };

    /* ---------- 렌더링 ---------- */
    // editable=true 면 드래그/탭 이동용 속성 추가
    function tokenHtml(p, cls, editable) {
        var drag = editable ? ' draggable="true" data-pid="' + p.pid + '" ondragstart="luDragStart(event)" onclick="luTapToken(' + p.pid + ')"' : '';
        var sel = (editable && _editor && _editor.selectedPid === p.pid) ? ' lu-selected' : '';
        if (!editable && isMe(p, _me)) sel += ' lu-me';   // 🙋 보기 화면에서 내 선수 강조
        // 실력 등급은 관리자 편집(editable)에서만 노출. 마이페이지(읽기전용)에서는 이름만.
        var skillTag = (editable && !(_editor && _editor.hideSkill)) ? '<div class="lu-pskill sk-' + skillGrade(p.score) + '">' + esc(p.skill) + '</div>' : '';
        var hasPhoto = !!p.url;
        var initial = ((p.name || '?').trim().charAt(0)) || '?';
        var urlEnc = hasPhoto ? String(p.url).replace(/'/g, '%27') : '';
        var clickable = (!editable && hasPhoto);   // 읽기전용에서만 사진 확대
        var styleInner = (hasPhoto ? 'background-image:url(\'' + urlEnc + '\');' : '') + (clickable ? 'cursor:zoom-in;' : '');
        var styleAttr = styleInner ? ' style="' + styleInner + '"' : '';
        var nameJs = String(p.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var clickAttr = clickable ? ' onclick="luShowPhoto(\'' + urlEnc + '\',\'' + nameJs + '\')"' : '';
        var dotInner = hasPhoto ? '' : esc(initial);
        var posText = p.assigned || p.pos || '';
        var miss = !!(p.pick && p.assigned && p.pick !== p.assigned);   // 📍 희망 자리와 다르게 배치됨 → 주황 배지
        var posBadge = posText ? '<span class="lu-pos' + (miss ? ' lu-pos-miss' : '') + '"' + (miss ? ' title="희망 자리: ' + esc(p.pick) + '"' : '') + '>' + esc(posText) + '</span>' : '';
        return '<div class="lu-token' + sel + '"' + drag + '>'
            + '<div class="lu-dot ' + cls + (hasPhoto ? ' lu-dot-photo' : '') + (p.isGuest ? ' lu-guest' : '') + '"' + styleAttr + clickAttr + '>' + dotInner + posBadge + '</div>'
            + '<div class="lu-pname">' + esc(p.name) + (p.isGuest ? ' <span class="lu-g">G</span>' : '') + '</div>'
            + skillTag
            + '</div>';
    }
    function rowHtml(arr, cls, editable) {
        if (!arr || !arr.length) return '';
        return '<div class="lu-row">' + arr.map(function (p) { return tokenHtml(p, cls, editable); }).join('') + '</div>';
    }
    function teamHtml(team, i, editable) {
        var meta = TEAM_META[i] || { name: '팀' + (i + 1), emoji: '⚪', cls: 'lu-t-red' };
        var L = team.lines;
        var overflow = (team.bench && team.bench.length)
            ? '<div class="lu-overflow">교체대기: ' + rowHtml(team.bench, meta.cls, editable) + '</div>'
            : '';
        var drop = editable ? ' ondragover="luDragOver(event)" ondragleave="luDragLeave(event)" ondrop="luDrop(event,' + i + ')"' : '';
        return '<div class="lu-team">'
            + '<div class="lu-team-head ' + meta.cls + '">'
            + '<span class="lu-team-name">' + meta.emoji + ' ' + meta.name + '</span>'
            + '<span class="lu-team-stat">' + team.players.length + '명 · 평균 ' + team.avg.toFixed(1) + ' · 총 ' + team.total + '점</span>'
            + '</div>'
            + '<div class="lu-pitch"' + drop + '>'
            + rowHtml(L.FW, meta.cls, editable)
            + rowHtml(L.MF, meta.cls, editable)
            + rowHtml(L.DF, meta.cls, editable)
            + rowHtml(L.GK, meta.cls, editable)
            + '</div>'
            + overflow
            + '</div>';
    }
    function summaryHtml(result, meta, editable) {
        var f = result.formation.slots;
        var formText = 'GK' + f.GK + (f.DF ? '·DF' + f.DF : '') + (f.MF ? '·MF' + f.MF : '') + (f.FW ? '·FW' + f.FW : '');
        var totalN = result.teams.reduce(function (s, t) { return s + t.players.length; }, 0) + (result.bench ? result.bench.length : 0);
        var btn = editable
            ? '<button class="lu-reshuffle" onclick="luEditorRebalance()">🔄 자동 재배치</button>'
            : (meta.saved ? '' : '<button class="lu-reshuffle" onclick="reshuffleLineup()">🔄 다시 섞기</button>');   // 확정 라인업은 섞기 없음
        return '<div class="lu-summary">'
            + '<div class="lu-summary-title">⚖️ 밸런스 편차 <b>' + result.balanceDiff + '점</b> · ' + esc(meta.sportLabel)
            + ' · 총 ' + totalN + '명'
            + ' · ' + result.teamCount + '팀 ' + new Array(result.teamCount + 1).join(result.teamSize + ':').replace(/:$/, '') + ' 구성'
            + '<br><span style="opacity:.7;">포메이션 ' + formText + (meta.saved ? ' · ✅ 라인업 확정' + (meta.savedBy ? ' (' + esc(meta.savedBy) + ')' : '') : '') + '</span>'
            + prefSummaryHtml(result, editable) + '</div>'
            + btn + '</div>';
    }
    // 📍 선호 자리 반영률 한 줄 (+ 편집 화면에서는 미반영 선수 목록)
    function prefSummaryHtml(result, editable) {
        var st = prefStats(result.teams);
        if (!st.picked) return '';
        var rate = Math.round(st.matched / st.picked * 100);
        return '<br><span class="lu-pref">📍 선호 자리 반영 <b>' + st.matched + '/' + st.picked + '명</b> (' + rate + '%)</span>'
            + (editable && st.misses.length ? '<br><span class="lu-pref-miss">미반영: ' + esc(st.misses.join(', ')) + '</span>' : '');
    }
    function boardHtml(result, meta) {
        return summaryHtml(result, meta, false)
            + '<div class="lu-teams">' + result.teams.map(function (t, i) { return teamHtml(t, i, false); }).join('') + '</div>';
    }

    /* ---------- 스타일/DOM 1회 주입 ---------- */
    function ensureUi() {
        if (document.getElementById('luPopup')) return;
        var style = document.createElement('style');
        style.id = 'luStyle';
        style.textContent =
            '.lu-overlay{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;padding:16px;}'
            + '.lu-overlay.show{display:flex;}'
            + '.lu-overlay::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.66);}'
            + '.lu-card{position:relative;width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;background:#0b1630;border:1px solid rgba(255,46,99,.4);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;}'
            + '.lu-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.1);}'
            + '.lu-head h3{margin:0;color:#fff;font-size:16px;font-weight:900;letter-spacing:-.4px;}'
            + '.lu-head .lu-x{background:none;border:none;color:rgba(255,255,255,.6);font-size:18px;font-weight:800;cursor:pointer;font-family:inherit;}'
            + '.lu-body{padding:14px;overflow-y:auto;}'
            + '.lu-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px;}'
            + '.lu-summary-title{color:rgba(255,255,255,.82);font-size:13px;font-weight:700;}'
            + '.lu-summary-title b{color:#ff2e63;}'
            + '.lu-reshuffle{background:linear-gradient(135deg,#ff2e63,#e91e63);color:#fff;border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;}'
            + '.lu-reshuffle:active{transform:scale(.98);}'
            + '.lu-teams{display:flex;flex-direction:column;gap:16px;}'
            + '.lu-team-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:10px 10px 0 0;color:#fff;font-weight:800;font-size:13px;}'
            + '.lu-team-stat{font-size:11px;font-weight:700;opacity:.92;}'
            + '.lu-t-red .lu-team-name,.lu-t-blue .lu-team-name,.lu-t-green .lu-team-name,.lu-t-yellow .lu-team-name{font-size:14px;}'
            + '.lu-t-red{background:linear-gradient(135deg,#e23b4e,#b01f30);}'
            + '.lu-t-blue{background:linear-gradient(135deg,#2f6fe2,#1f3fb0);}'
            + '.lu-t-green{background:linear-gradient(135deg,#1fae5a,#0c7d3c);}'
            + '.lu-t-yellow{background:linear-gradient(135deg,#d9a92b,#a87d12);}'
            + '.lu-pitch{position:relative;background:repeating-linear-gradient(0deg,#1f7a3f 0,#1f7a3f 28px,#1c7039 28px,#1c7039 56px);border:2px solid rgba(255,255,255,.35);border-top:none;border-radius:0 0 10px 10px;padding:14px 8px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;min-height:260px;overflow:hidden;}'
            + '.lu-pitch::before{content:"";position:absolute;left:8px;right:8px;top:50%;height:2px;background:rgba(255,255,255,.4);}'
            + '.lu-pitch::after{content:"";position:absolute;left:50%;top:50%;width:64px;height:64px;border:2px solid rgba(255,255,255,.4);border-radius:50%;transform:translate(-50%,-50%);}'
            + '.lu-row{position:relative;z-index:1;display:flex;justify-content:space-evenly;align-items:center;gap:4px;}'
            + '.lu-token{display:flex;flex-direction:column;align-items:center;gap:2px;width:58px;}'
            + '.lu-dot{position:relative;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);background-size:cover;background-position:center;}'
            + '.lu-pos{position:absolute;bottom:-4px;right:-5px;background:#0b1630;color:#fff;font-size:8px;font-weight:900;line-height:1.5;padding:0 4px;border-radius:6px;border:1px solid rgba(255,255,255,.55);letter-spacing:-.2px;}'
            + '.lu-photoview{position:fixed;inset:0;z-index:100005;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:20px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}'
            + '.lu-photoview.show{display:flex;}'
            + '.lu-pv-card{position:relative;background:#fff;border-radius:18px;padding:14px;max-width:90vw;max-height:86vh;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:luPvPop .22s ease;}'
            + '@keyframes luPvPop{from{opacity:.3;transform:scale(.92);}to{opacity:1;transform:scale(1);}}'
            + '.lu-pv-close{position:absolute;top:8px;right:8px;width:34px;height:34px;border:none;border-radius:50%;background:rgba(0,0,0,.06);color:#333;font-size:17px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;}'
            + '.lu-pv-close:active{background:rgba(0,0,0,.16);}'
            + '.lu-photoview img{max-width:78vw;max-height:64vh;border-radius:12px;object-fit:contain;background:#f1f5f9;}'
            + '.lu-pv-name{font-size:16px;font-weight:800;color:#1e293b;}'
            + '.lu-photoview.contained{position:absolute;z-index:60;border-radius:20px;padding:12px;}'
            + '.lu-photoview.contained .lu-pv-card{max-width:100%;max-height:100%;}'
            + '.lu-photoview.contained img{max-width:88%;max-height:46vh;}'
            + '.lu-pname{color:#fff;font-size:11px;font-weight:800;text-align:center;line-height:1.1;max-width:58px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px rgba(0,0,0,.7);}'
            + '.lu-g{background:#ff2e63;color:#fff;font-size:8px;padding:0 3px;border-radius:4px;vertical-align:middle;}'
            + '.lu-dot.lu-guest{border:2px dashed #fff;box-shadow:0 0 0 2px #a855f7,0 2px 6px rgba(0,0,0,.3);}'   /* 👤 게스트: 흰 점선 + 보라 테두리 (노랑=선택/내 자리와 구분) */
            + '.lu-pskill{font-size:9px;font-weight:800;padding:1px 5px;border-radius:6px;}'
            + '.sk-hi{background:rgba(255,209,102,.25);color:#ffd166;}'
            + '.sk-mid{background:rgba(116,185,255,.22);color:#74b9ff;}'
            + '.sk-lo{background:rgba(255,255,255,.14);color:rgba(255,255,255,.7);}'
            + '.lu-bench{color:rgba(255,255,255,.6);font-size:11px;font-weight:700;padding:7px 10px;background:rgba(255,255,255,.05);border-radius:0 0 10px 10px;}'
            // 편집기 전용
            + '.lu-overflow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:rgba(255,255,255,.7);font-size:11px;font-weight:700;padding:8px 10px;background:rgba(255,180,0,.12);border-radius:0 0 10px 10px;}'
            + '.lu-token[draggable=true]{cursor:grab;}'
            + '.lu-token.lu-selected .lu-dot{outline:3px solid #ffd166;outline-offset:1px;}'
            + '.lu-pitch.lu-dropok{outline:2px dashed #ffd166;outline-offset:-4px;}'
            + '.lu-benchzone{margin-top:14px;border:1.5px dashed rgba(255,255,255,.3);border-radius:12px;padding:10px;background:rgba(255,255,255,.04);min-height:64px;}'
            + '.lu-benchzone.lu-dropok{outline:2px dashed #ffd166;background:rgba(255,209,102,.1);}'
            + '.lu-benchzone-title{color:rgba(255,255,255,.7);font-size:12px;font-weight:800;margin-bottom:8px;}'
            + '.lu-benchzone .lu-row{flex-wrap:wrap;justify-content:flex-start;gap:10px;}'
            + '.lu-edit-hint{color:#ffd166;font-size:12px;font-weight:700;margin-bottom:10px;}'
            + '.lu-tip{margin-bottom:12px;border:1px solid rgba(255,46,99,.4);border-radius:12px;background:linear-gradient(180deg,rgba(255,46,99,.12),rgba(255,255,255,.03));overflow:hidden;}'
            + '.lu-tip>summary{list-style:none;cursor:pointer;padding:10px 12px;display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:#fff;user-select:none;}'
            + '.lu-tip>summary::-webkit-details-marker{display:none;}'
            + '.lu-tip-badge{background:linear-gradient(135deg,#ff2e63,#e91e63);color:#fff;font-size:10px;font-weight:900;border-radius:6px;padding:2px 7px;letter-spacing:.5px;}'
            + '.lu-tip-caret{margin-left:auto;color:#ffd166;font-size:11px;transition:transform .2s;}'
            + '.lu-tip[open] .lu-tip-caret{transform:rotate(180deg);}'
            + '.lu-tip-body{padding:0 12px 12px;}'
            + '.lu-tip-lead{color:#ffd166;font-size:12px;font-weight:800;margin:2px 0 9px;line-height:1.5;}'
            + '.lu-tip-lead b{color:#fff;}'
            + '.lu-tip-list{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}'
            + '.lu-tip-list li{position:relative;padding-left:16px;color:rgba(255,255,255,.86);font-size:12px;line-height:1.45;}'
            + '.lu-tip-list li::before{content:"";position:absolute;left:3px;top:6px;width:5px;height:5px;border-radius:50%;background:#ff2e63;}'
            + '.lu-tip-list b{color:#ffd166;}'
            + '.lu-tip-trade{background:rgba(126,224,255,.08);border:1px solid rgba(126,224,255,.28);border-radius:10px;padding:8px 10px;margin-bottom:9px;}'
            + '.lu-tip-trade-h{color:#7ee0ff;font-size:12px;font-weight:900;margin-bottom:3px;}'
            + '.lu-tip-trade-h b{color:#fff;}'
            + '.lu-tip-trade-b{color:rgba(255,255,255,.82);font-size:11.5px;line-height:1.5;}'
            + '.lu-tip-foot{color:#ff9db1;font-size:11.5px;font-weight:800;display:flex;align-items:center;gap:4px;}'
            + '.lu-tip-foot b{color:#fff;}'
            + '.lu-editfoot{display:flex;gap:8px;padding:12px 14px;border-top:1px solid rgba(255,255,255,.1);background:#0b1630;}'
            + '.lu-editfoot button{flex:1;border:none;border-radius:12px;padding:13px;font-size:14px;font-weight:900;cursor:pointer;font-family:inherit;}'
            + '.lu-save{background:linear-gradient(135deg,#ff2e63,#e91e63);color:#fff;}'
            + '.lu-cancel{background:rgba(255,255,255,.12);color:#fff;}'
            + '.lu-clear{background:#475569;color:#fff;}'
            + '.lu-destbar{position:sticky;bottom:0;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:10px;margin-top:10px;background:rgba(11,22,48,.96);border-radius:12px;border:1px solid rgba(255,209,102,.5);}'
            + '.lu-destbar span{width:100%;text-align:center;color:#ffd166;font-size:12px;font-weight:800;margin-bottom:2px;}'
            + '.lu-destbar button{border:none;border-radius:9px;padding:9px 12px;font-size:12px;font-weight:800;color:#fff;cursor:pointer;font-family:inherit;}'
            // 🙋 내 자리 배너 / 내 선수 강조
            + '.lu-mine{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:12px;padding:11px 14px;border-radius:12px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:14px;font-weight:800;box-shadow:0 6px 16px rgba(22,163,74,.3);}'
            + '.lu-mine b{font-size:15px;font-weight:900;}'
            + '.lu-mine span{font-size:12px;font-weight:700;opacity:.85;}'
            + '.lu-token.lu-me .lu-dot{outline:3px solid #ffd166;outline-offset:2px;}'
            + '.lu-token.lu-me .lu-pname{color:#ffd166;}'
            // 📍 선호 자리 반영률 / 미반영 배지
            + '.lu-pref{color:#ffd166;font-weight:800;}'
            + '.lu-pref b{color:#ffd166;}'
            + '.lu-pref-miss{color:#fdba74;font-size:11.5px;font-weight:700;}'
            + '.lu-pos.lu-pos-miss{background:#ea580c;}'
            // 📍 선호 자리 선택 화면
            + '.sp-info{color:rgba(255,255,255,.75);font-size:12px;font-weight:700;margin-bottom:6px;line-height:1.5;}'
            + '.sp-info b{color:#ffd166;}'
            + '.sp-guide{color:#ffd166;font-size:12.5px;font-weight:800;margin-bottom:10px;}'
            + '.sp-guide.lock{color:#fca5a5;}'
            + '.sp-pitch{position:relative;background:repeating-linear-gradient(0deg,#1f7a3f 0,#1f7a3f 28px,#1c7039 28px,#1c7039 56px);border:2px solid rgba(255,255,255,.35);border-radius:12px;padding:16px 8px;display:flex;flex-direction:column;justify-content:space-between;gap:16px;min-height:300px;overflow:hidden;}'
            + '.sp-pitch::before{content:"";position:absolute;left:8px;right:8px;top:50%;height:2px;background:rgba(255,255,255,.4);}'
            + '.sp-pitch::after{content:"";position:absolute;left:50%;top:50%;width:64px;height:64px;border:2px solid rgba(255,255,255,.4);border-radius:50%;transform:translate(-50%,-50%);}'
            + '.sp-row{position:relative;z-index:1;display:flex;justify-content:space-evenly;gap:6px;}'
            + '.sp-slot{flex:0 1 120px;min-width:0;background:rgba(11,22,48,.82);border:1.5px solid rgba(255,255,255,.35);border-radius:10px;padding:6px 7px;transition:transform .1s;}'
            + '.sp-click{cursor:pointer;}'
            + '.sp-click:active{transform:scale(.97);}'
            + '.sp-label{display:flex;justify-content:space-between;align-items:center;gap:4px;color:#fff;font-size:11px;font-weight:900;margin-bottom:4px;white-space:nowrap;}'
            + '.sp-label b{font-size:10px;color:rgba(255,255,255,.6);font-weight:800;}'
            + '.sp-names{display:flex;flex-wrap:wrap;gap:3px;min-height:18px;}'
            + '.sp-name{background:rgba(255,255,255,.16);color:#fff;font-size:10.5px;font-weight:800;padding:1px 6px;border-radius:6px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
            + '.sp-name.me{background:#ffd166;color:#0b1630;}'
            + '.sp-emptytxt{color:rgba(255,255,255,.45);font-size:10.5px;font-weight:700;}'
            + '.sp-full{border-color:#4ade80;}'
            + '.sp-full .sp-label b{color:#4ade80;}'
            + '.sp-over{border-color:#fb923c;background:rgba(124,45,18,.78);}'
            + '.sp-over .sp-label b{color:#fdba74;}'
            + '.sp-need{border-style:dashed;border-color:#ffd166;}'
            + '.sp-need .sp-emptytxt{color:#ffd166;}'
            + '.sp-mine{box-shadow:0 0 0 3px #ffd166;}'
            + '.sp-legend{color:rgba(255,255,255,.6);font-size:11px;line-height:1.55;margin-top:10px;}'
            + '.sp-notpicked{color:rgba(255,255,255,.78);font-size:11.5px;font-weight:700;margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.06);border-radius:8px;line-height:1.55;}'
            + '@media(max-width:420px){.lu-token{width:50px;}.lu-dot{width:34px;height:34px;}.sp-slot{padding:5px;}.sp-label{flex-direction:column;align-items:flex-start;gap:1px;}}';
        document.head.appendChild(style);

        var ov = document.createElement('div');
        ov.className = 'lu-overlay';
        ov.id = 'luPopup';
        ov.addEventListener('click', function (e) { if (e.target === ov) window.closeLineupPopup(); });
        ov.innerHTML =
            '<div class="lu-card">'
            + '<div class="lu-head"><h3 id="luTitle">🤖 AI 자동 라인업</h3><button class="lu-x" onclick="closeLineupPopup()">✕</button></div>'
            + '<div class="lu-body" id="luBody"></div>'
            + '<div id="luFoot"></div>'
            + '</div>';
        document.body.appendChild(ov);
    }

    function makePlayer(src) {
        var skill = src.skill || '중';
        return {
            name: src.name || '선수', key: src.key || null, skill: skill, score: skillToScore(skill),
            pos: src.pos || null, pick: src.pick || null, isGuest: !!src.isGuest, isSub: !!src.isSub,
            url: src.url || '',
            assigned: src.isSub ? null : (src.pos || src.assigned || null), pid: 0
        };
    }
    // 저장된 라인업 구조 → 화면 result 형태 (urlByName: 이름→프로필사진, 과거 저장분에도 사진 매칭)
    function resultFromSaved(saved, urlByName) {
        urlByName = urlByName || {};
        var enrich = function (p) {
            var src = p;
            var nm = (p && p.name || '').trim();
            if (p && !p.url && nm && urlByName[nm]) src = Object.assign({}, p, { url: urlByName[nm] });
            return makePlayer(src);
        };
        var teams = (saved.teams || []).map(function (t) {
            var all = (t.players || []).map(enrich);
            var starters = all.filter(function (p) { return !p.isSub; });
            var subs = all.filter(function (p) { return p.isSub; });
            var lines = { GK: [], DF: [], MF: [], FW: [] };
            starters.forEach(function (p) { (lines[p.assigned] || lines.MF).push(p); });
            var total = starters.reduce(function (s, p) { return s + p.score; }, 0);
            return { players: starters, lines: lines, bench: subs, total: total, avg: starters.length ? total / starters.length : 0 };
        });
        var totals = teams.map(function (t) { return t.total; });
        var diff = totals.length ? (Math.max.apply(null, totals) - Math.min.apply(null, totals)) : 0;
        var teamSize = saved.teamSize || (teams[0] ? teams[0].players.length : 6);
        return {
            teams: teams, sportKey: saved.sportKey, teamCount: saved.teamCount || teams.length,
            teamSize: teamSize, formation: { teamSize: teamSize, slots: makeFormation(teamSize) },
            balanceDiff: diff, bench: (saved.bench || []).map(enrich)
        };
    }
    function benchHtmlRO(bench) {
        if (!bench || !bench.length) return '';
        return '<div class="lu-benchzone"><div class="lu-benchzone-title">🪑 후보 (' + bench.length + '명)</div>'
            + '<div class="lu-row">' + bench.map(function (p) { return tokenHtml(p, 'lu-t-yellow', false); }).join('') + '</div></div>';
    }

    // ✨ 사진 클릭 → 현재 열려있는 모달 "안"에서 크게 보기 (전체화면 아님 · 해당 창 내부에 담김)
    window.luClosePhoto = function () {
        var el = document.getElementById('luPhotoView');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    };
    window.luShowPhoto = function (url, name) {
        window.luClosePhoto();
        // ✨ 사진 뷰어 CSS 보장 (라인업을 안 열어도 스타일이 항상 적용되도록 직접 주입)
        if (!document.getElementById('luPhotoViewCss')) {
            var st = document.createElement('style');
            st.id = 'luPhotoViewCss';
            st.textContent =
                '.lu-photoview{position:fixed;inset:0;z-index:100005;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:20px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}'
                + '.lu-photoview.show{display:flex;}'
                + '.lu-pv-card{position:relative;background:#fff;border-radius:18px;padding:14px;max-width:90%;max-height:86%;display:flex;flex-direction:column;align-items:center;gap:10px;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:luPvPop .22s ease;}'
                + '@keyframes luPvPop{from{opacity:.3;transform:scale(.92);}to{opacity:1;transform:scale(1);}}'
                + '.lu-pv-close{position:absolute;top:8px;right:8px;width:34px;height:34px;border:none;border-radius:50%;background:rgba(0,0,0,.06);color:#333;font-size:17px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;}'
                + '.lu-pv-close:active{background:rgba(0,0,0,.16);}'
                + '.lu-photoview img{max-width:100%;max-height:76vh;border-radius:12px;object-fit:contain;background:#f1f5f9;}'
                + '.lu-pv-name{font-size:16px;font-weight:800;color:#1e293b;}'
                + '.lu-photoview.contained{position:absolute;z-index:60;border-radius:20px;padding:16px;}'
                + '.lu-photoview.contained .lu-pv-card{max-width:100%;max-height:100%;}'
                + '.lu-photoview.contained img{max-width:100%;max-height:52vh;}';
            document.head.appendChild(st);
        }
        // 동료평가 창이 열려 있으면 그 안에 담고(contained), 아니면(라인업 등) 전체화면 크게
        var rm = document.getElementById('reviewModal');
        var reviewOpen = rm && getComputedStyle(rm).display !== 'none';
        var host = reviewOpen ? rm.querySelector('.modal-content') : null;
        var contained = !!host;
        if (!host) host = document.body;
        if (contained && getComputedStyle(host).position === 'static') host.style.position = 'relative';
        var el = document.createElement('div');
        el.id = 'luPhotoView';
        el.className = 'lu-photoview' + (contained ? ' contained' : '');
        el.onclick = function (e) { if (e.target === el) window.luClosePhoto(); };
        var card = document.createElement('div'); card.className = 'lu-pv-card';
        var x = document.createElement('button'); x.className = 'lu-pv-close'; x.type = 'button'; x.textContent = '✕'; x.onclick = window.luClosePhoto;
        var img = document.createElement('img'); img.src = url; img.alt = '프로필';
        var nm = document.createElement('div'); nm.className = 'lu-pv-name'; nm.textContent = name || '';
        card.appendChild(x); card.appendChild(img); card.appendChild(nm);
        el.appendChild(card);
        host.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('show'); });
    };

    var _currentMatchId = null;
    window.showLineupPopup = function (matchId) {
        ensureUi();
        var cfg = (window.__mcLineups && window.__mcLineups[matchId]) || null;
        var hasSaved = !!(cfg && cfg.savedLineup && cfg.savedLineup.teams);   // 확정 라인업은 명단이 비어도 보기 가능
        if (!cfg || ((!cfg.roster || !cfg.roster.length) && !hasSaved)) { alert('라인업을 만들 참여 인원이 없습니다.'); return; }
        _currentMatchId = matchId; _editor = null; _slotMatchId = null;
        _me = cfg.myKey || cfg.myName ? { key: cfg.myKey || null, name: cfg.myName || '' } : null;
        document.getElementById('luFoot').innerHTML = '';
        var meta = { sportLabel: cfg.sportLabel || (cfg.sportKey === 'futsal' ? '풋살' : '축구') };
        var bodyHtml, benchExtra = '';
        if (cfg.savedLineup && cfg.savedLineup.teams) {       // 관리자가 확정한 라인업 우선 노출
            var urlByName = {};
            (cfg.roster || []).forEach(function (r) { if (r && r.name && r.url) urlByName[(r.name || '').trim()] = r.url; });
            var rs = resultFromSaved(cfg.savedLineup, urlByName);
            meta.saved = true;
            meta.savedBy = cfg.savedLineup.savedBy || '';
            var mySpot = findMySpot(cfg.savedLineup, _me);
            bodyHtml = (mySpot
                    ? '<div class="lu-mine">🙋 내 자리: <b>' + esc(spotText(mySpot)) + '</b>'
                        + (mySpot.pick && mySpot.team >= 0 && mySpot.pick !== mySpot.pos ? ' <span>(희망 ' + esc(mySpot.pick) + ')</span>' : '') + '</div>'
                    : '')
                + boardHtml(rs, meta);
            benchExtra = benchHtmlRO(rs.bench);
        } else {
            var result = computeLineup(cfg.roster, { sportKey: cfg.sportKey, capacityText: cfg.capacityText, maxPeople: cfg.maxPeople });
            _lastAuto = { matchId: matchId, sig: rosterSig(cfg.roster), result: result };   // 감독/PD가 [이대로 저장]하면 지금 보이는 편성을 그대로 저장
            bodyHtml = boardHtml(result, meta);
            benchExtra = benchHtmlRO(result.bench);   // 미입금/확인중 = 후보
        }
        document.getElementById('luTitle').textContent = (meta.saved ? '✅ 확정 라인업 — ' : '🤖 AI 자동 라인업 — ') + (cfg.matchName || '');
        document.getElementById('luBody').innerHTML = bodyHtml + benchExtra;
        // 🎬 해당 경기 감독/PD(cfg.canEdit)에게만 수정·저장 버튼 노출
        if (cfg.canEdit) {
            document.getElementById('luFoot').innerHTML =
                '<div class="lu-editfoot"><button class="lu-cancel" onclick="closeLineupPopup()">닫기</button>'
                + '<button class="lu-clear" onclick="luPdEdit()">✏️ 라인업 수정</button>'
                + (meta.saved ? '' : '<button class="lu-save" onclick="luPdSave()">💾 이대로 저장</button>')
                + '</div>';
        }
        document.getElementById('luPopup').classList.add('show');
        history.pushState({ luPopup: true }, '');
    };
    window.reshuffleLineup = function () {
        if (!_currentMatchId) return;
        var cfg = window.__mcLineups[_currentMatchId];
        var saved = cfg.savedLineup; cfg.savedLineup = null;   // 다시 섞기는 자동 생성 강제
        window.showLineupPopup(_currentMatchId);
        cfg.savedLineup = saved;
    };
    window.closeLineupPopup = function (skipHistory) {
        var el = document.getElementById('luPopup'); if (el) el.classList.remove('show');
        _editor = null; var f = document.getElementById('luFoot'); if (f) f.innerHTML = ''; _slotMatchId = null;
        if (!skipHistory && history.state && history.state.luPopup) history.back();
    };
    window.addEventListener('popstate', function (e) {
        var el = document.getElementById('luPopup');
        if (el && el.classList.contains('show')) window.closeLineupPopup(true);
    });

    /* ========== 라인업 편집기 (드래그/탭으로 팀 조정 + 후보) ========== */
    var _editor = null;
    var _lastAuto = null;   // 팝업에 마지막으로 보여준 자동 편성 { matchId, sig, result }
    // 참여 명단 내용 서명 (페이지가 실시간 갱신으로 명단 배열을 새로 만들어도 내용이 같으면 같은 값)
    function rosterSig(roster) {
        return (roster || []).map(function (p) { return [p.name, p.skill, p.pos, p.pick, p.confirmed ? 1 : 0, p.isGuest ? 1 : 0].join('|'); }).join('/');
    }

    function seedEditor(cfg) {
        var teams, teamSize, teamCount, sportKey = cfg.sportKey;
        if (cfg.savedLineup && cfg.savedLineup.teams) {
            teams = cfg.savedLineup.teams.map(function (t) { return (t.players || []).map(makePlayer); });
            var bench = (cfg.savedLineup.bench || []).map(makePlayer);
            teamSize = cfg.savedLineup.teamSize || (teams[0] ? teams[0].length : 6);
            teamCount = cfg.savedLineup.teamCount || teams.length;
            _editor = { teams: teams, bench: bench, teamSize: teamSize, teamCount: teamCount, sportKey: sportKey };
        } else {
            // 팝업에서 보던 자동 편성이 있으면 그걸 그대로 이어서 편집 (그사이 참여 명단이 바뀌었으면 새로 생성)
            var r = (_lastAuto && _lastAuto.matchId === _currentMatchId && _lastAuto.sig === rosterSig(cfg.roster)) ? _lastAuto.result
                : computeLineup(cfg.roster, { sportKey: sportKey, capacityText: cfg.capacityText, maxPeople: cfg.maxPeople });
            teams = r.teams.map(function (t) { return t.players.slice(); });
            _editor = { teams: teams, bench: (r.bench || []).slice(), teamSize: r.teamSize, teamCount: r.teamCount, sportKey: sportKey };
        }
        _editor.formation = { teamSize: _editor.teamSize, slots: makeFormation(_editor.teamSize) };
        _editor.sportLabel = cfg.sportLabel || (sportKey === 'futsal' ? '풋살' : '축구');
        _editor.matchName = cfg.matchName || '경기';
        _editor.selectedPid = null;
        _editor.hideSkill = !!cfg.canEdit;       // 감독/PD 편집 화면에서는 실력 등급 비노출 (관리자 전용 정보)
        var pid = 1;
        _editor.teams.forEach(function (arr) { arr.forEach(function (p) { p.pid = pid++; }); });
        _editor.bench.forEach(function (p) { p.pid = pid++; });
    }

    function editorResult() {
        var teams = _editor.teams.map(function (arr) {
            var starters = arr.filter(function (p) { return !p.isSub; });
            var subs = arr.filter(function (p) { return p.isSub; });
            var temp = { players: starters.slice() };
            assignPositions(temp, _editor.formation);
            subs.forEach(function (p) { p.assigned = null; });
            var total = starters.reduce(function (s, p) { return s + p.score; }, 0);
            var bench = temp.bench.concat(subs);   // 포메이션 초과분 + 지정 교체
            return { players: starters, lines: temp.lines, bench: bench, total: total, avg: starters.length ? total / starters.length : 0 };
        });
        var totals = teams.map(function (t) { return t.total; });
        var diff = totals.length ? (Math.max.apply(null, totals) - Math.min.apply(null, totals)) : 0;
        return {
            teams: teams, sportKey: _editor.sportKey, teamCount: _editor.teamCount,
            teamSize: _editor.teamSize, formation: _editor.formation, balanceDiff: diff, bench: _editor.bench
        };
    }

    function renderEditor() {
        var r = editorResult();
        var benchZone = '<div class="lu-benchzone" id="luBenchZone" ondragover="luDragOver(event)" ondragleave="luDragLeave(event)" ondrop="luDropBench(event)">'
            + '<div class="lu-benchzone-title">🪑 후보·미입금 — 입금 확인되면 팀으로 끌어/탭하여 넣으세요</div>'
            + (_editor.bench.length
                ? '<div class="lu-row">' + _editor.bench.map(function (p) { return tokenHtml(p, 'lu-t-yellow', true); }).join('') + '</div>'
                : '<div style="color:rgba(255,255,255,.4);font-size:12px;">후보 없음</div>')
            + '</div>';
        var destbar = '';
        if (_editor.selectedPid != null) {
            var sp = findPlayer(_editor.selectedPid);
            var btns = '<span>📍 ' + (sp ? esc(sp.player.name) : '') + ' → 선발로 이동</span>';
            _editor.teams.forEach(function (t, i) {
                var meta = TEAM_META[i] || { name: '팀' + (i + 1), cls: 'lu-t-red' };
                btns += '<button class="' + meta.cls + '" onclick="luMoveTo(' + i + ')">' + (meta.emoji || '') + ' ' + meta.name + '</button>';
            });
            btns += '<span>🔁 교체 인원으로 (팀별)</span>';
            _editor.teams.forEach(function (t, i) {
                var meta = TEAM_META[i] || { name: '팀' + (i + 1), cls: 'lu-t-red' };
                btns += '<button class="' + meta.cls + '" style="opacity:.72;" onclick="luMoveToSub(' + i + ')">' + (meta.emoji || '') + ' ' + meta.name + ' 교체</button>';
            });
            btns += '<button style="background:#a87d12;" onclick="luMoveToBench()">🪑 후보(미입금)로</button>';
            destbar = '<div class="lu-destbar">' + btns + '</div>';
        }
        document.getElementById('luTitle').textContent = '✏️ 라인업 수정 — ' + _editor.matchName;
        document.getElementById('luBody').innerHTML =
            '<div class="lu-edit-hint">🖱️ 선수를 끌어 팀/후보로 이동하거나, 탭하여 이동할 곳을 고르세요.</div>'
            + '<details class="lu-tip" open>'
            +   '<summary><span class="lu-tip-badge">AI</span> 밸런스 조절 TIP<span class="lu-tip-caret">▾</span></summary>'
            +   '<div class="lu-tip-body">'
            +     '<div class="lu-tip-lead">경기 <b>60분</b>까지 한 팀이 아래 조건을 <b>2개 이상</b> 충족하면 조정</div>'
            +     '<ul class="lu-tip-list">'
            +       '<li>평균 <b>3골 이상</b> 차이</li>'
            +       '<li>공격이 <b>한쪽 진영</b>에서만 진행됨</li>'
            +       '<li>상대 팀이 <b>볼을 거의 소유</b>하지 못함</li>'
            +       '<li>특정 선수 <b>1~2명</b>이 경기를 완전히 지배함</li>'
            +     '</ul>'
            +     '<div class="lu-tip-trade">'
            +       '<div class="lu-tip-trade-h">🔁 트레이드 시 · 성공 확률 <b>65%</b></div>'
            +       '<div class="lu-tip-trade-b">강팀 상위권 선수 1명 ↔ 약팀 하위권 선수 1명</div>'
            +     '</div>'
            +     '<div class="lu-tip-foot">⚠️ 정말 안 맞으면 <b>전면 재편성</b></div>'
            +   '</div>'
            + '</details>'
            + summaryHtml(r, { sportLabel: _editor.sportLabel }, true)
            + '<div class="lu-teams">' + r.teams.map(function (t, i) { return teamHtml(t, i, true); }).join('') + '</div>'
            + benchZone + destbar;
        var _hasSaved = !!(window.__mcLineups[_currentMatchId] && window.__mcLineups[_currentMatchId].savedLineup && window.__mcLineups[_currentMatchId].savedLineup.teams);
        document.getElementById('luFoot').innerHTML =
            '<div class="lu-editfoot"><button class="lu-cancel" onclick="closeLineupPopup()">취소</button>'
            + (_hasSaved ? '<button class="lu-clear" onclick="luEditorClear()">🔓 확정 해제</button>' : '')
            + '<button class="lu-save" onclick="luEditorSave()">💾 라인업 저장</button></div>';
    }

    function findPlayer(pid) {
        pid = +pid;
        for (var i = 0; i < _editor.teams.length; i++) {
            var idx = _editor.teams[i].findIndex(function (p) { return p.pid === pid; });
            if (idx >= 0) return { player: _editor.teams[i][idx], from: 'team', ti: i, idx: idx };
        }
        var bi = _editor.bench.findIndex(function (p) { return p.pid === pid; });
        if (bi >= 0) return { player: _editor.bench[bi], from: 'bench', idx: bi };
        return null;
    }
    function removePlayer(pid) {
        var f = findPlayer(pid); if (!f) return null;
        if (f.from === 'team') _editor.teams[f.ti].splice(f.idx, 1);
        else _editor.bench.splice(f.idx, 1);
        return f.player;
    }

    window.showLineupEditor = function (matchId) {
        ensureUi();
        var cfg = (window.__mcLineups && window.__mcLineups[matchId]) || null;
        if (!cfg || !cfg.roster || !cfg.roster.length) { alert('라인업을 만들 참여 인원이 없습니다.'); return; }
        _currentMatchId = matchId; _slotMatchId = null;
        seedEditor(cfg);
        renderEditor();
        document.getElementById('luPopup').classList.add('show');
    };
    window.luTapToken = function (pid) {
        _editor.selectedPid = (_editor.selectedPid === pid) ? null : pid;
        renderEditor();
    };
    window.luMoveTo = function (ti) {
        var p = removePlayer(_editor.selectedPid); if (p) { p.isSub = false; _editor.teams[ti].push(p); }
        _editor.selectedPid = null; renderEditor();
    };
    window.luMoveToSub = function (ti) {   // 선택 인원을 해당 팀의 교체 인원으로
        var p = removePlayer(_editor.selectedPid); if (p) { p.isSub = true; p.assigned = null; _editor.teams[ti].push(p); }
        _editor.selectedPid = null; renderEditor();
    };
    window.luMoveToBench = function () {
        var p = removePlayer(_editor.selectedPid); if (p) { p.isSub = false; _editor.bench.push(p); }
        _editor.selectedPid = null; renderEditor();
    };
    // 드래그앤드롭 (마우스)
    window.luDragStart = function (e) {
        var el = e.target.closest('[data-pid]'); if (!el) return;
        _editor.dragPid = +el.getAttribute('data-pid');
        e.dataTransfer.setData('text/plain', _editor.dragPid);
        e.dataTransfer.effectAllowed = 'move';
    };
    window.luDragOver = function (e) { e.preventDefault(); e.currentTarget.classList.add('lu-dropok'); };
    window.luDragLeave = function (e) { e.currentTarget.classList.remove('lu-dropok'); };
    window.luDrop = function (e, ti) {
        e.preventDefault(); e.currentTarget.classList.remove('lu-dropok');
        var p = removePlayer(_editor.dragPid); if (p) { p.isSub = false; _editor.teams[ti].push(p); }
        _editor.dragPid = null; _editor.selectedPid = null; renderEditor();
    };
    window.luDropBench = function (e) {
        e.preventDefault(); e.currentTarget.classList.remove('lu-dropok');
        var p = removePlayer(_editor.dragPid); if (p) { p.isSub = false; _editor.bench.push(p); }
        _editor.dragPid = null; _editor.selectedPid = null; renderEditor();
    };
    window.luEditorRebalance = function () {
        var all = [];
        _editor.teams.forEach(function (arr) { all = all.concat(arr); });
        all = all.concat(_editor.bench);
        // 팀 크기/수는 기존 설정 유지하며 재배치 (재배치 시 교체 지정은 초기화)
        all.forEach(function (p) { p.isSub = false; });
        var srt = all.slice().sort(function (a, b) { return b.score - a.score; });
        _editor.teams = []; for (var i = 0; i < _editor.teamCount; i++) _editor.teams.push([]);
        var idx = 0, dir = 1;
        srt.forEach(function (p) {
            _editor.teams[idx].push(p);
            if (dir === 1) { if (idx === _editor.teamCount - 1) dir = -1; else idx++; }
            else { if (idx === 0) dir = 1; else idx--; }
        });
        spreadPrefs(_editor.teams.map(function (arr) { return { players: arr }; }), _editor.formation);   // 같은 자리 희망자 팀별 분산
        _editor.bench = []; _editor.selectedPid = null; renderEditor();
    };
    window.luEditorSave = function () {
        var payload = {
            sportKey: _editor.sportKey, teamSize: _editor.teamSize, teamCount: _editor.teamCount,
            savedAt: Date.now(),
            teams: _editor.teams.map(function (arr) {
                var starters = arr.filter(function (p) { return !p.isSub; });
                var temp = { players: starters.slice() };
                assignPositions(temp, _editor.formation);
                return {
                    players: arr.map(function (p) { return { name: p.name, key: p.key || null, pos: p.isSub ? null : (p.assigned || null), pick: p.pick || null, skill: p.skill, isGuest: !!p.isGuest, isSub: !!p.isSub }; })
                };
            }),
            bench: _editor.bench.map(function (p) { return { name: p.name, key: p.key || null, skill: p.skill, isGuest: !!p.isGuest, pos: p.pos || null, pick: p.pick || null }; })
        };
        if (window.__mcLineups[_currentMatchId]) window.__mcLineups[_currentMatchId].savedLineup = payload;
        if (typeof window.saveLineupToServer === 'function') {
            window.saveLineupToServer(_currentMatchId, payload);
        }
        window.closeLineupPopup();
    };

    // 🎬 감독/PD: 팝업 → 편집기 / 팝업에 보이는 편성 그대로 저장
    window.luPdEdit = function () {
        var cfg = (window.__mcLineups && window.__mcLineups[_currentMatchId]) || null;
        if (!cfg || !cfg.canEdit) return;
        seedEditor(cfg);
        renderEditor();
    };
    window.luPdSave = function () {
        var cfg = (window.__mcLineups && window.__mcLineups[_currentMatchId]) || null;
        if (!cfg || !cfg.canEdit) return;
        if (!confirm('지금 보이는 라인업으로 확정 저장할까요?\n참여 회원 모두에게 같은 라인업이 보입니다.')) return;
        seedEditor(cfg);
        window.luEditorSave();
    };

    // 🔓 확정(저장) 해제 → 현재 참여 인원으로 라인업 다시 편성 (노쇼 빠짐/새 인원 반영)
    window.luEditorClear = function () {
        if (!confirm('확정된 라인업을 해제할까요?\n\n현재 참여 인원 기준으로 다시 편성됩니다.\n(노쇼로 빠진 인원 제외 · 새로 들어온 인원 반영)\n다시 [라인업 저장]을 누르기 전까지는 자동 편성 상태로 보입니다.')) return;
        var cfg = (window.__mcLineups && window.__mcLineups[_currentMatchId]) || {};
        cfg.savedLineup = null;                                 // 로컬 확정 제거
        if (typeof window.clearLineupOnServer === 'function') {
            window.clearLineupOnServer(_currentMatchId);        // 서버 확정 라인업 삭제
        }
        seedEditor(cfg);                                        // 현재 참여 인원(roster)으로 편집기 재구성
        renderEditor();
    };

    /* ========== 📍 선호 자리 선택 (경기 참여자가 희망 자리 고르기 · 자유 선택 + 경쟁 표시) ==========
     * cfg(window.__mcLineups[matchId]) 추가 필드:
     *   slotPicks {회원키: {slot:'DF-0', line:'DF', name, at}}, memberPlayers [{name,key}],
     *   myKey, myName, canPick(참여 회원 · 경기 전), isPast
     * 저장은 페이지의 window.saveSlotPick(matchId, pick|null) 이 담당 */
    var _slotMatchId = null;
    var SIDE_LABELS = { 1: ['중앙'], 2: ['왼쪽', '오른쪽'], 3: ['왼쪽', '중앙', '오른쪽'], 4: ['왼쪽', '왼중앙', '오른중앙', '오른쪽'] };
    function slotLabel(L, i, n) {
        if (L === 'GK') return 'GK';
        return L + ' ' + ((SIDE_LABELS[n] || [])[i] || String(i + 1));
    }
    function renderSlotPicker() {
        var cfg = window.__mcLineups && window.__mcLineups[_slotMatchId];
        if (!cfg) return;
        var g = parseGrouping(cfg.capacityText, cfg.maxPeople, cfg.sportKey, Math.max((cfg.roster || []).length, 2));
        var slots = makeFormation(g.teamSize);
        var cap = g.teamCount;                   // 자리마다 정원 = 팀 수 (같은 자리 희망자는 팀별로 나눠 배치)

        // 현재 참여 중인 회원의 선택만 유효 (참여 취소/명단 제외된 사람은 무시)
        var nameByKey = {};
        (cfg.memberPlayers || []).forEach(function (m) { if (m.key) nameByKey[m.key] = m.name; });
        var bySlot = {}, pickedKeys = {}, mySid = null;
        Object.keys(cfg.slotPicks || {}).forEach(function (k) {
            var pk = cfg.slotPicks[k];
            if (!pk || !nameByKey[k] || !slots[pk.line]) return;
            var idx = Math.min(parseInt(String(pk.slot || '').split('-')[1], 10) || 0, slots[pk.line] - 1);   // 포메이션이 바뀌어도 같은 라인에 유지
            var sid = pk.line + '-' + idx;
            (bySlot[sid] = bySlot[sid] || []).push({ key: k, name: nameByKey[k], at: pk.at || 0 });
            pickedKeys[k] = true;
            if (k === cfg.myKey) mySid = sid;
        });
        var locked = !!cfg.savedLineup;
        var canPick = !!(cfg.canPick && !locked);

        function slotHtml(L, i, n) {
            var sid = L + '-' + i;
            var list = (bySlot[sid] || []).sort(function (a, b) { return a.at - b.at; });
            var state = !list.length ? 'empty' : (list.length > cap ? 'over' : (list.length === cap ? 'full' : 'some'));
            var names = list.length
                ? list.map(function (x) { return '<span class="sp-name' + (x.key === cfg.myKey ? ' me' : '') + '">' + esc(x.name) + '</span>'; }).join('')
                : '<span class="sp-emptytxt">' + (L === 'GK' ? '🙋 지원자 필요' : '비어있음') + '</span>';
            var badge = state === 'over' ? '⚠️ ' + list.length + '/' + cap + ' 경쟁' : list.length + '/' + cap;
            var cls = 'sp-slot sp-' + state + (L === 'GK' && !list.length ? ' sp-need' : '') + (mySid === sid ? ' sp-mine' : '') + (canPick ? ' sp-click' : '');
            return '<div class="' + cls + '"' + (canPick ? ' onclick="luPickSlot(\'' + sid + '\')"' : '') + '>'
                + '<div class="sp-label">' + esc(slotLabel(L, i, n)) + '<b>' + badge + '</b></div>'
                + '<div class="sp-names">' + names + '</div></div>';
        }
        var pitch = ['FW', 'MF', 'DF', 'GK'].map(function (L) {
            var n = slots[L] || 0, h = '';
            for (var i = 0; i < n; i++) h += slotHtml(L, i, n);
            return n ? '<div class="sp-row">' + h + '</div>' : '';
        }).join('');

        var guide = locked ? '<div class="sp-guide lock">🔒 감독/PD가 라인업을 확정해서 선택이 마감되었습니다.</div>'
            : canPick ? '<div class="sp-guide">👆 원하는 자리를 누르세요 · 내 자리를 다시 누르면 선택 취소' + (mySid ? ' · 내 선택: <b>' + esc(slotLabel(mySid.split('-')[0], +mySid.split('-')[1], slots[mySid.split('-')[0]])) + '</b>' : '') + '</div>'
            : '<div class="sp-guide lock">' + (cfg.isPast ? '경기가 종료되어 선택할 수 없습니다.' : '경기에 참여한 회원만 자리를 고를 수 있어요.') + '</div>';
        var notPicked = (cfg.memberPlayers || []).filter(function (m) { return m.key && !pickedKeys[m.key]; }).map(function (m) { return esc(m.name); });

        document.getElementById('luBody').innerHTML =
            '<div class="sp-info">' + g.teamCount + '팀 · 팀당 ' + g.teamSize + '명 포메이션 기준 · 자리마다 <b>' + cap + '명</b>까지 (같은 자리 희망자는 팀별로 나눠 배치)</div>'
            + guide
            + '<div class="sp-pitch">' + pitch + '</div>'
            + '<div class="sp-legend">⚠️ <b>경쟁</b> = 정원보다 많이 몰린 자리예요. AI 라인업이 실력 밸런스를 보고 일부를 다른 자리로 배치하고, 최종 확정은 감독/PD가 합니다.</div>'
            + (notPicked.length ? '<div class="sp-notpicked">아직 안 고른 참여자 ' + notPicked.length + '명: ' + notPicked.join(', ') + '</div>' : '');
        document.getElementById('luFoot').innerHTML =
            '<div class="lu-editfoot"><button class="lu-cancel" onclick="closeLineupPopup()">닫기</button>'
            + (canPick && mySid ? '<button class="lu-clear" onclick="luPickSlot(null)">선택 취소</button>' : '')
            + '</div>';
    }
    window.showSlotPicker = function (matchId) {
        ensureUi();
        var cfg = window.__mcLineups && window.__mcLineups[matchId];
        if (!cfg) return;
        _currentMatchId = matchId; _editor = null; _slotMatchId = matchId;
        document.getElementById('luTitle').textContent = '📍 선호 자리 선택 — ' + (cfg.matchName || '');
        renderSlotPicker();
        document.getElementById('luPopup').classList.add('show');
        history.pushState({ luPopup: true }, '');
    };
    window.luPickSlot = function (sid) {
        var cfg = window.__mcLineups && window.__mcLineups[_slotMatchId];
        if (!cfg || !cfg.canPick || cfg.savedLineup || !cfg.myKey) return;
        var cur = (cfg.slotPicks || {})[cfg.myKey];
        var pick = (sid && !(cur && cur.slot === sid)) ? { slot: sid, line: sid.split('-')[0] } : null;   // 내 자리 다시 누르면 취소
        cfg.slotPicks = Object.assign({}, cfg.slotPicks);
        if (pick) cfg.slotPicks[cfg.myKey] = Object.assign({ name: cfg.myName || '', at: Date.now() }, pick);
        else delete cfg.slotPicks[cfg.myKey];
        renderSlotPicker();                      // 화면 먼저 반영 → 서버 저장 후 실시간 데이터로 다시 그려짐
        if (typeof window.saveSlotPick === 'function') window.saveSlotPick(_slotMatchId, pick);
    };
    // 페이지가 실시간 데이터로 __mcLineups 를 갱신할 때 호출 → 열려 있으면 다른 사람 선택도 바로 반영
    window.refreshSlotPickerIfOpen = function (matchId) {
        var el = document.getElementById('luPopup');
        if (_slotMatchId && _slotMatchId === matchId && el && el.classList.contains('show')) renderSlotPicker();
    };

    // 외부에서 직접 쓸 수 있게 노출
    window.computeLineup = computeLineup;
})();
