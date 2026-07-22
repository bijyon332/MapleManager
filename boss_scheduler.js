/* =========================================================
 *  Boss Scheduler v2
 *  - Per-player accordion pool
 *  - Click-to-assign modal (no DnD)
 *  - Per-boss max members + same-player ban + opt-out
 *  - Templates / Calendar / Filters / Datetime
 *  - HEXA score / Servers / Discord ID / MapleRanks link
 * ========================================================= */

(function () {
    "use strict";

    const STORAGE_KEY = "boss-scheduler-v2";
    const VERSION = 2;

    const PLAYER_COLORS = [
        "#a5b4fc", "#67e8f9", "#fda4af", "#fcd34d", "#86efac",
        "#c4b5fd", "#f9a8d4", "#5eead4", "#fdba74", "#93c5fd"
    ];

    // ---- helpers --------------------------------------------------------
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const uid = () => Math.random().toString(36).slice(2, 10);
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g,
        (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const fmtCP = (n) => {
        if (!n) return "0";
        if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "万";
        return Math.round(n).toLocaleString();
    };

    // ---- class lookup ---------------------------------------------------
    function allClasses() {
        const out = [];
        Object.entries(window.CLASS_DATA || {}).forEach(([group, list]) => {
            list.forEach((c) => out.push({ ...c, group }));
        });
        return out;
    }
    function classById(id) {
        if (!id) return null;
        return allClasses().find((c) => c.id === id) || null;
    }
    function classIconPath(id) {
        const c = classById(id);
        return c ? c.path : null;
    }

    // ---- state ----------------------------------------------------------
    // v3.1 schema:
    //   bossEntries: フラット配列 (週で区切らない)
    //   各PTが recurrence: { dayOfWeek: 0-6, hour, minute } を持つ
    //   bossId は1つにつき最大1エントリ (PT配列が0になったら削除)
    let state = {
        version: 3,
        players: [],          // { id, name, colorIdx, discordId }
        characters: [],       // { id, playerId, name, jobId, cp, hexa, server, level, bossOptOut: [bossId,...] }
        bossEntries: [],      // { id, bossId, parties:[{id,name,difficulty,recurrence,memberIds[]}] }
        ui: {
            filters: { boss: [], team: "", player: "", server: "" },  // boss: 複数選択
            calendarMode: "week",
            monthOffset: 0,
            weekOffset: 0     // for calendar week navigation (0=current Thursday-week)
        }
    };

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                state = Object.assign(state, parsed);
            }
        } catch (e) { /* ignore */ }
        if (!state.players)    state.players = [];
        if (!state.characters) state.characters = [];
        if (!state.bossEntries) state.bossEntries = [];
        if (!state.ui) state.ui = { filters: { boss: [], team: "", player: "", server: "" }, calendarMode: "week", monthOffset: 0, weekOffset: 0 };
        if (!state.ui.filters) state.ui.filters = { boss: [], team: "", player: "", server: "" };
        // The boss filter is multi-select; migrate the legacy single-string value.
        if (!Array.isArray(state.ui.filters.boss)) {
            state.ui.filters.boss = state.ui.filters.boss ? [state.ui.filters.boss] : [];
        }
        if (!state.ui.calendarMode) state.ui.calendarMode = "week";
        if (state.ui.monthOffset == null) state.ui.monthOffset = 0;
        if (state.ui.weekOffset == null) state.ui.weekOffset = 0;

        // ---- Migration: v2 (weeks-based) -> v3 (flat) ----
        if (state.weeks) {
            // Pick the most recent week's bossEntries as the new flat list
            const keys = Object.keys(state.weeks).sort();
            if (keys.length > 0 && state.bossEntries.length === 0) {
                const last = state.weeks[keys[keys.length - 1]];
                if (last && Array.isArray(last.bossEntries)) {
                    state.bossEntries = last.bossEntries.map((be) => {
                        let recurrence = null;
                        if (be.startAt) {
                            const d = new Date(be.startAt);
                            if (!isNaN(d.getTime())) {
                                recurrence = { dayOfWeek: d.getDay(), hour: d.getHours(), minute: d.getMinutes() };
                            }
                        }
                        return {
                            id: be.id || uid(),
                            bossId: be.bossId,
                            parties: (be.parties || []).map((pt) => ({
                                id: pt.id || uid(),
                                name: pt.name || "",
                                difficulty: pt.difficulty,
                                recurrence: recurrence ? { ...recurrence } : null,
                                memberIds: pt.memberIds || []
                            }))
                        };
                    });
                }
            }
            delete state.weeks;
            // also clean obsolete fields
            delete state.currentWeekOffset;
            if (state.ui) delete state.ui.openPlayerIds;
        }

        // Migrations on characters / players
        state.characters.forEach((c) => {
            if (c.hexa == null) c.hexa = 0;
            if (!c.server) c.server = "kronos";
            if (!c.bossOptOut) c.bossOptOut = [];
        });
        state.players.forEach((p) => {
            if (!p.discordId) p.discordId = "";
        });

        // Remove bossEntries with invalid bossId
        const validBoss = new Set((window.BOSS_DATA || []).map((b) => b.id));
        state.bossEntries = state.bossEntries.filter((be) => validBoss.has(be.bossId));
        // Drop entries with 0 parties (orphan housekeeping)
        // Actually keep them; the dashboard renders all 9 bosses always (synthesizing empties)
        // But we won't keep stored entries with 0 parties — they'll be re-created on demand
        state.bossEntries = state.bossEntries.filter((be) => (be.parties || []).length > 0);

        // Migration: if a bossEntry has recurrence (v3.0), move it to each party (v3.1)
        state.bossEntries.forEach((be) => {
            if (be.recurrence) {
                be.parties.forEach((pt) => {
                    if (!pt.recurrence) pt.recurrence = { ...be.recurrence };
                });
                delete be.recurrence;
            }
            // ensure each party has recurrence field (default null)
            be.parties.forEach((pt) => {
                if (pt.recurrence === undefined) pt.recurrence = null;
            });
        });

        // Drop legacy templates field if present
        delete state.templates;

        if (state.players.length === 0 && state.characters.length === 0) seed();
    }
    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
        catch (e) { console.warn("保存に失敗:", e); }
    }

    function seed() {
        const p1 = { id: uid(), name: "bi",   colorIdx: 0, discordId: "" };
        const p2 = { id: uid(), name: "taro", colorIdx: 1, discordId: "" };
        const p3 = { id: uid(), name: "hana", colorIdx: 2, discordId: "" };
        state.players = [p1, p2, p3];
        state.characters = [
            { id: uid(), playerId: p1.id, name: "biMain",   jobId: "pathfinder",  cp: 82000, hexa: 21000, server: "kronos",      level: 285, bossOptOut: [] },
            { id: uid(), playerId: p1.id, name: "biSub",    jobId: "cadena",      cp: 41000, hexa:  9500, server: "kronos",      level: 270, bossOptOut: [] },
            { id: uid(), playerId: p2.id, name: "taroMain", jobId: "marksman",    cp: 75000, hexa: 18000, server: "kronos",      level: 282, bossOptOut: [] },
            { id: uid(), playerId: p2.id, name: "taroSub",  jobId: "shade",       cp: 30000, hexa:  6000, server: "challengers", level: 265, bossOptOut: [] },
            { id: uid(), playerId: p3.id, name: "hanaMain", jobId: "nightwalker", cp: 91000, hexa: 25000, server: "kronos",      level: 287, bossOptOut: [] }
        ];
    }

    // ---- boss entry helpers ---------------------------------------------
    // Find existing entry by bossId (or null)
    function findBossEntry(bossId) {
        return state.bossEntries.find((be) => be.bossId === bossId) || null;
    }

    // Get or create a bossEntry by bossId.
    // Returns the entry. Does NOT save to state automatically — caller saves.
    function ensureBossEntry(bossId) {
        let be = findBossEntry(bossId);
        if (!be) {
            be = { id: uid(), bossId, parties: [] };
            state.bossEntries.push(be);
        }
        return be;
    }

    // Remove the entry if it has zero parties (housekeeping after deletes)
    function pruneEmptyBossEntry(bossId) {
        const be = findBossEntry(bossId);
        if (be && be.parties.length === 0) {
            state.bossEntries = state.bossEntries.filter((x) => x.id !== be.id);
        }
    }

    // For dashboard rendering: synthesize a "virtual entry" for bosses with no real entry
    // so the dashboard can always show 9 cards.
    function bossEntriesForDashboard() {
        const order = (window.BOSS_DATA || []).map((b) => b.id);
        return order.map((bossId) => {
            return findBossEntry(bossId) ||
                { id: "virtual-" + bossId, bossId, parties: [], _virtual: true };
        });
    }

    // ---- date/time helpers ----------------------------------------------
    const DOW_JP = ["日","月","火","水","木","金","土"];

    // Compute the next occurrence (as Date) of a recurrence from `from` (default now).
    // Returns Date or null.
    function nextOccurrence(recurrence, from) {
        if (!recurrence) return null;
        const base = new Date(from || Date.now());
        base.setSeconds(0, 0);
        const today = new Date(base); today.setHours(0,0,0,0);
        for (let i = 0; i < 7; i++) {
            const d = new Date(today); d.setDate(today.getDate() + i);
            if (d.getDay() !== recurrence.dayOfWeek) continue;
            d.setHours(recurrence.hour, recurrence.minute, 0, 0);
            if (d.getTime() >= base.getTime()) return d;
        }
        return null;
    }

    // Generate all occurrences of a recurrence within [fromDate, toDate)
    function occurrencesInRange(recurrence, fromDate, toDate) {
        if (!recurrence) return [];
        const out = [];
        const cursor = new Date(fromDate); cursor.setHours(0,0,0,0);
        while (cursor < toDate) {
            if (cursor.getDay() === recurrence.dayOfWeek) {
                const evt = new Date(cursor);
                evt.setHours(recurrence.hour, recurrence.minute, 0, 0);
                if (evt >= fromDate && evt < toDate) out.push(evt);
            }
            cursor.setDate(cursor.getDate() + 1);
        }
        return out;
    }

    // Format a recurrence as "毎週(月) 21:00"
    function formatRecurrence(recurrence) {
        if (!recurrence) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `毎週(${DOW_JP[recurrence.dayOfWeek]}) ${pad(recurrence.hour)}:${pad(recurrence.minute)}`;
    }

    // Format a Date for calendar display
    function formatDateShort(d) {
        if (!d) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getMonth() + 1}/${d.getDate()}(${DOW_JP[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // Start of current Thursday-week (for calendar week view)
    function startOfThursdayWeek(date) {
        const d = new Date(date); d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = (day - 4 + 7) % 7;
        d.setDate(d.getDate() - diff);
        return d;
    }
    function calendarWeekStart() {
        const base = startOfThursdayWeek(new Date());
        base.setDate(base.getDate() + state.ui.weekOffset * 7);
        return base;
    }

    // ---- lookups --------------------------------------------------------
    function getPlayer(id) { return state.players.find((p) => p.id === id); }
    function getChar(id)   { return state.characters.find((c) => c.id === id); }
    function getBoss(id)   { return (window.BOSS_DATA || []).find((b) => b.id === id); }
    function getServer(id) { return (window.SERVERS || []).find((s) => s.id === id); }
    function playerColor(p) { return p ? PLAYER_COLORS[p.colorIdx % PLAYER_COLORS.length] : "#475569"; }

    function difficultyLabel(d) { return (window.DIFFICULTY_LABEL || {})[d] || d || ""; }
    function difficultyClass(d) { return (window.DIFFICULTY_BADGE_CLASS || {})[d] || "badge-easy"; }
    function difficultyOrderIndex(d) {
        const list = window.DIFFICULTY_ORDER || ["EASY","NORMAL","HARD","CHAOS","EXTREME"];
        const i = list.indexOf(d);
        return i < 0 ? 99 : i;
    }

    // Boss icon HTML: img (MapleHub CDN) with lucide fallback on error.
    // size: "lg" (32px) | "sm" (24px)
    function bossIconHtml(boss, size) {
        const sz = size === "sm" ? "sm" : "lg";
        const lucideSize = sz === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
        const url = boss ? (window.bossImageUrl ? window.bossImageUrl(boss) : "") : "";
        const fallback = `<i data-lucide="${esc(boss && boss.icon || "flame")}" class="${lucideSize}"></i>`;
        if (url) {
            // The img attempts to load; on error we swap to lucide fallback by removing the img
            return `<div class="boss-icon ${sz}" data-fallback='${esc(fallback)}'>` +
                   `<img src="${esc(url)}" alt="${esc(boss.name)}" ` +
                   `onerror="this.parentNode.innerHTML = this.parentNode.dataset.fallback; if(window.lucide) window.lucide.createIcons();" />` +
                   `</div>`;
        }
        return `<div class="boss-icon ${sz}">${fallback}</div>`;
    }

    function bossEntriesSorted() {
        const order = (window.BOSS_DATA || []).map((b) => b.id);
        return [...state.bossEntries].sort((a, b) => order.indexOf(a.bossId) - order.indexOf(b.bossId));
    }

    function assignedIdsForBoss(bossEntry) {
        const s = new Set();
        bossEntry.parties.forEach((pt) => pt.memberIds.forEach((id) => s.add(id)));
        return s;
    }

    function playerIdsInParty(pt) {
        const s = new Set();
        pt.memberIds.forEach((id) => {
            const c = getChar(id);
            if (c) s.add(c.playerId);
        });
        return s;
    }

    // ============================================================
    //  RENDER (master)
    // ============================================================
    function render() {
        renderFilterBar();
        renderDashboard();
        renderCalendar();
        renderPlayers();
        if (window.lucide) window.lucide.createIcons();
    }

    // ============================================================
    //  FILTER BAR
    // ============================================================
    function renderFilterBar() {
        const f = state.ui.filters;

        // Boss filter: clickable chips (toggle like the player list) instead of a select.
        const bossList = $("#boss-filter-list");
        if (bossList) {
            bossList.innerHTML = "";
            (window.BOSS_DATA || []).forEach((b) => {
                const chip = document.createElement("button");
                chip.className = "boss-filter-chip" + (f.boss.includes(b.id) ? " active" : "");
                chip.dataset.bossId = b.id;
                chip.style.setProperty("--boss-color", b.color || "#6366f1");
                chip.innerHTML = `${bossIconHtml(b, "sm")}<span>${esc(b.name)}</span>`;
                chip.addEventListener("click", () => {
                    // Multi-select: toggle this boss in/out of the selection.
                    const sel = state.ui.filters.boss;
                    const i = sel.indexOf(b.id);
                    if (i >= 0) sel.splice(i, 1);
                    else sel.push(b.id);
                    saveState();
                    renderFilterBar();
                    renderDashboard();
                });
                bossList.appendChild(chip);
            });
        }

        const teamSel = $("#filter-team"); teamSel.innerHTML = '<option value="">All</option>';
        const teamNames = new Set();
        state.bossEntries.forEach((be) => be.parties.forEach((pt) => {
            if (pt.name) teamNames.add(pt.name);
        }));
        [...teamNames].sort().forEach((n) => {
            const o = document.createElement("option"); o.value = n; o.textContent = n;
            if (f.team === n) o.selected = true;
            teamSel.appendChild(o);
        });

        const serverSel = $("#filter-server"); serverSel.innerHTML = '<option value="">All</option>';
        (window.SERVERS || []).forEach((s) => {
            const o = document.createElement("option"); o.value = s.id; o.textContent = s.name;
            if (f.server === s.id) o.selected = true;
            serverSel.appendChild(o);
        });

        renderPlayerFilterList();
    }

    function renderPlayerFilterList() {
        const roots = [$("#player-filter-list"), $("#player-filter-list-cal")].filter(Boolean);
        if (roots.length === 0) return;
        const f = state.ui.filters;

        roots.forEach((root) => {
            root.innerHTML = "";

            // "All" option
            const allItem = document.createElement("div");
            allItem.className = "player-filter-item" + (!f.player ? " active" : "");
            allItem.innerHTML = `
                <span class="pf-dot" style="background:#475569;"></span>
                <span class="pf-name">全員</span>
                <span class="pf-count">${state.players.length}</span>
            `;
            allItem.addEventListener("click", () => {
                state.ui.filters.player = "";
                saveState();
                renderDashboard(); renderCalendar(); renderPlayerFilterList();
            });
            root.appendChild(allItem);

            state.players.forEach((p) => {
                const color = playerColor(p);
                const charCount = state.characters.filter((c) => c.playerId === p.id).length;
                const item = document.createElement("div");
                item.className = "player-filter-item" + (f.player === p.id ? " active" : "");
                item.innerHTML = `
                    <span class="pf-dot" style="background:${color};"></span>
                    <span class="pf-name">${esc(p.name)}</span>
                    <span class="pf-count">${charCount}</span>
                `;
                item.addEventListener("click", () => {
                    // Toggle: clicking active player clears
                    state.ui.filters.player = (f.player === p.id) ? "" : p.id;
                    saveState();
                    renderDashboard(); renderCalendar(); renderPlayerFilterList();
                });
                root.appendChild(item);
            });
        });
    }

    function filteredBossEntries() {
        const f = state.ui.filters;
        // Always show all 9 bosses on dashboard (synthesize virtual entries for empties)
        const filtered = bossEntriesForDashboard().filter((be) => {
            if (f.boss.length && !f.boss.includes(be.bossId)) return false;
            // For non-empty bosses, apply team/player/server filter
            if (f.team || f.player || f.server) {
                if (be.parties.length === 0) return false; // virtual entries excluded when filtering
                const ok = be.parties.some((pt) => {
                    if (f.team && pt.name !== f.team) return false;
                    if (f.player && !pt.memberIds.some((id) => (getChar(id) || {}).playerId === f.player)) return false;
                    if (f.server && !pt.memberIds.some((id) => (getChar(id) || {}).server === f.server)) return false;
                    return true;
                });
                if (!ok) return false;
            }
            return true;
        });

        // Sort: bosses with parties first, then by boss definition order
        const order = (window.BOSS_DATA || []).map((b) => b.id);
        return filtered.sort((a, b) => {
            const aHas = a.parties.length > 0 ? 0 : 1;
            const bHas = b.parties.length > 0 ? 0 : 1;
            if (aHas !== bHas) return aHas - bHas;
            return order.indexOf(a.bossId) - order.indexOf(b.bossId);
        });
    }

    // ============================================================
    //  DASHBOARD (read-only view of all bosses)
    // ============================================================
    function renderDashboard() {
        const root = $("#boss-list");
        root.innerHTML = "";
        const list = filteredBossEntries();
        list.forEach((be) => root.appendChild(buildBossCard(be)));
    }

    function buildBossCard(be) {
        const boss = getBoss(be.bossId);
        const card = document.createElement("div");
        card.className = "boss-card fade-in";
        if (be.parties.length === 0) card.classList.add("empty");
        if (boss) card.style.setProperty("--boss-color", boss.color || "#6366f1");

        const noteTag = boss && boss.note
            ? `<span class="badge badge-soft">${esc(boss.note)}</span>` : "";

        // ----- header -----
        const head = document.createElement("div");
        head.className = "boss-head";
        head.innerHTML = `
            ${bossIconHtml(boss, "lg")}
            <div class="boss-head-info">
                <div class="boss-title">
                    <span class="boss-title-name">${esc(boss ? boss.name : "?")}</span>
                    ${noteTag}
                </div>
                <div class="boss-subtitle">
                    <span>${be.parties.length} PT · 上限 ${boss ? boss.maxMembers : "?"}人</span>
                </div>
            </div>
            <button class="btn btn-primary" data-act="edit">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> 編集
            </button>
        `;
        head.querySelector('[data-act="edit"]').addEventListener("click", () => {
            const real = ensureBossEntry(be.bossId);
            openBossEditModal(real);
        });
        card.appendChild(head);

        // ----- parties strip (horizontal, members stacked vertically inside each) -----
        // If a player filter is active, only show PTs that contain a char of that player
        const f = state.ui.filters;
        const visibleParties = f.player
            ? be.parties.filter((pt) =>
                pt.memberIds.some((id) => (getChar(id) || {}).playerId === f.player))
            : be.parties;
        if (visibleParties.length === 0) {
            const empty = document.createElement("div");
            empty.className = "boss-empty-hint";
            empty.textContent = be.parties.length === 0
                ? "PT未設定 — 編集ボタンから追加してください"
                : "このプレイヤーが入っているPTはありません";
            card.appendChild(empty);
        } else {
            const strip = document.createElement("div");
            strip.className = "parties-strip";
            // Sort parties by difficulty index
            const diffList = boss ? boss.difficulties : [];
            const sortedParties = [...visibleParties].sort((a, b) => {
                const ai = diffList.indexOf(a.difficulty);
                const bi = diffList.indexOf(b.difficulty);
                return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
            });
            sortedParties.forEach((pt, idx) => strip.appendChild(buildPartyMini(be, pt, idx)));
            card.appendChild(strip);
        }

        return card;
    }

    // Compact PT view (used on dashboard)
    function buildPartyMini(be, pt, idx) {
        const boss = getBoss(be.bossId);
        const members = pt.memberIds
            .map((id) => getChar(id))
            .filter(Boolean)
            .sort((a, b) => (b.cp || 0) - (a.cp || 0));
        const total = members.reduce((s, c) => s + (c.cp || 0), 0);

        const wrap = document.createElement("div");
        wrap.className = "party-mini";

        const badgeCls = difficultyClass(pt.difficulty);
        const badgeLbl = difficultyLabel(pt.difficulty);

        const head = document.createElement("div");
        head.className = "party-mini-head";
        const recText = pt.recurrence ? formatRecurrence(pt.recurrence) : "日時未設定";
        const recCls = pt.recurrence ? "party-mini-rec" : "party-mini-rec unset";
        head.innerHTML = `
            <span class="party-mini-letter">${String.fromCharCode(65 + idx)}</span>
            <span class="badge ${badgeCls}" style="font-size:9px; padding:1px 5px;">${esc(badgeLbl)}</span>
            <span class="${recCls}" title="毎週の実施日時">
                <i data-lucide="calendar-clock" class="w-3 h-3"></i> ${esc(recText)}
            </span>
            <span class="party-mini-name">${esc(pt.name || "")}</span>
        `;
        wrap.appendChild(head);

        const body = document.createElement("div");
        body.className = "party-mini-members";
        if (members.length === 0) {
            body.innerHTML = `<div class="party-mini-empty">メンバーなし</div>`;
        } else {
            members.forEach((c) => {
                const p = getPlayer(c.playerId);
                const color = playerColor(p);
                const job = classById(c.jobId);
                const row = document.createElement("div");
                row.className = "party-mini-member";
                row.innerHTML = `
                    <span class="player-dot" style="background:${color}; color:${color};"></span>
                    <span class="mini-icon">${job ? `<img src="${esc(job.path)}" alt="" onerror="this.style.display='none'" />` : ""}</span>
                    <span class="pmm-name" title="${esc(c.name)} (${p ? esc(p.name) : ""})">${esc(c.name)}</span>
                    <span class="pmm-cp">${fmtCP(c.cp)}</span>
                `;
                body.appendChild(row);
            });
        }
        wrap.appendChild(body);

        const foot = document.createElement("div");
        foot.className = "party-mini-total";
        foot.innerHTML = `${members.length}/${boss ? boss.maxMembers : 6}人 · 合計 <strong>${fmtCP(total)}</strong>`;
        wrap.appendChild(foot);

        return wrap;
    }

    // ============================================================
    //  CALENDAR
    // ============================================================
    // Collect all scheduled events (recurrence per party) within a [from, to) range.
    // Honors the global player filter (state.ui.filters.player).
    function collectEventsInRange(fromDate, toDate) {
        const events = [];
        const playerFilter = state.ui.filters.player;
        state.bossEntries.forEach((be) => {
            const boss = getBoss(be.bossId);
            (be.parties || []).forEach((pt) => {
                if (!pt.recurrence) return;
                // Player filter: only include PT if it contains a char belonging to that player
                if (playerFilter) {
                    const hit = pt.memberIds.some((id) => (getChar(id) || {}).playerId === playerFilter);
                    if (!hit) return;
                }
                const occurrences = occurrencesInRange(pt.recurrence, fromDate, toDate);
                occurrences.forEach((occDate) => {
                    events.push({
                        date: occDate,
                        startAt: occDate.toISOString(),
                        bossName: boss ? boss.name : "?",
                        bossColor: boss ? boss.color : "#6366f1",
                        teamName: pt.name || (pt.difficulty ? difficultyLabel(pt.difficulty) + " PT" : "PT"),
                        difficulty: pt.difficulty,
                        memberCount: pt.memberIds.length
                    });
                });
            });
        });
        return events;
    }

    function renderCalendar() {
        if (state.ui.calendarMode === "month") {
            renderCalendarMonth();
        } else {
            renderCalendarWeek();
        }
        // Sync mode toggle button visuals
        $$(".cal-mode-btn").forEach((b) => {
            b.classList.toggle("cal-mode-active", b.dataset.calMode === state.ui.calendarMode);
        });
    }

    // ---- Week view (per-day timeline) ----
    function renderCalendarWeek() {
        const root = $("#calendar");
        if (!root) return;
        root.innerHTML = "";

        // Header with prev/next week buttons
        const head = document.createElement("div");
        head.className = "cal-week-head";
        const weekStart = calendarWeekStart();
        const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
        const fmt = (x) => `${x.getMonth() + 1}/${x.getDate()}`;
        head.innerHTML = `
            <button class="btn btn-ghost btn-icon" data-week-act="prev" aria-label="前週">
                <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <span class="cal-week-title">${weekStart.getFullYear()} ${fmt(weekStart)} 〜 ${fmt(weekEnd)}</span>
            <div class="flex gap-1">
                <button class="btn btn-xs" data-week-act="today">今週</button>
                <button class="btn btn-ghost btn-icon" data-week-act="next" aria-label="翌週">
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        head.querySelector('[data-week-act="prev"]').addEventListener("click", () => {
            state.ui.weekOffset--; saveState(); renderCalendar();
            if (window.lucide) window.lucide.createIcons();
        });
        head.querySelector('[data-week-act="next"]').addEventListener("click", () => {
            state.ui.weekOffset++; saveState(); renderCalendar();
            if (window.lucide) window.lucide.createIcons();
        });
        head.querySelector('[data-week-act="today"]').addEventListener("click", () => {
            state.ui.weekOffset = 0; saveState(); renderCalendar();
            if (window.lucide) window.lucide.createIcons();
        });
        root.appendChild(head);

        // Days
        const weekEndExclusive = new Date(weekStart); weekEndExclusive.setDate(weekStart.getDate() + 7);
        const today = new Date(); today.setHours(0,0,0,0);
        const events = collectEventsInRange(weekStart, weekEndExclusive);

        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const dow = DOW_JP[d.getDay()];
            const isToday = d.getTime() === today.getTime();

            const dayEl = document.createElement("div");
            dayEl.className = "calendar-day" + (isToday ? " today" : "");
            dayEl.innerHTML = `
                <div class="calendar-day-head">
                    <span class="calendar-day-label">${d.getMonth() + 1}/${d.getDate()}</span>
                    <span class="calendar-day-dow">${dow}</span>
                </div>
            `;
            const dayEvents = events.filter((e) => {
                const ed = new Date(e.date); ed.setHours(0,0,0,0);
                return ed.getTime() === d.getTime();
            }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

            if (dayEvents.length === 0) {
                dayEl.innerHTML += '<div class="calendar-no-event">予定なし</div>';
            } else {
                dayEvents.forEach((e) => {
                    const time = new Date(e.startAt);
                    const pad = (n) => String(n).padStart(2, "0");
                    const div = document.createElement("div");
                    div.className = "calendar-event";
                    div.style.setProperty("--boss-color", e.bossColor);
                    div.innerHTML = `
                        <span class="calendar-event-time">${pad(time.getHours())}:${pad(time.getMinutes())}</span>
                        <span class="calendar-event-title">${esc(e.bossName)}</span>
                        <span class="calendar-event-team">${esc(e.teamName)}</span>
                    `;
                    dayEl.appendChild(div);
                });
            }
            root.appendChild(dayEl);
        }
    }

    // ---- Month view (calendar grid) ----
    function renderCalendarMonth() {
        const root = $("#calendar");
        root.innerHTML = "";

        const base = new Date();
        base.setDate(1);
        base.setMonth(base.getMonth() + state.ui.monthOffset);
        base.setHours(0,0,0,0);
        const year = base.getFullYear();
        const month = base.getMonth(); // 0-indexed

        const firstOfMonth = new Date(year, month, 1);
        const nextMonth = new Date(year, month + 1, 1);
        // Grid starts at Sunday on or before firstOfMonth
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(1 - firstOfMonth.getDay());
        // Grid ends at the Saturday on or after the last of month -> 42 cells (6 weeks)
        const gridEnd = new Date(gridStart);
        gridEnd.setDate(gridStart.getDate() + 42);

        const events = collectEventsInRange(gridStart, gridEnd);

        const today = new Date(); today.setHours(0,0,0,0);

        // ----- header (month label + prev/next) -----
        const head = document.createElement("div");
        head.className = "cal-month-head";
        head.innerHTML = `
            <button class="btn btn-ghost btn-icon" data-month-act="prev" aria-label="前月">
                <i data-lucide="chevron-left" class="w-4 h-4"></i>
            </button>
            <span class="cal-month-title">${year}年 ${month + 1}月</span>
            <div class="flex gap-1">
                <button class="btn btn-xs" data-month-act="today">今月</button>
                <button class="btn btn-ghost btn-icon" data-month-act="next" aria-label="翌月">
                    <i data-lucide="chevron-right" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        head.querySelector('[data-month-act="prev"]').addEventListener("click", () => {
            state.ui.monthOffset--; saveState(); renderCalendar();
            if (window.lucide) window.lucide.createIcons();
        });
        head.querySelector('[data-month-act="next"]').addEventListener("click", () => {
            state.ui.monthOffset++; saveState(); renderCalendar();
            if (window.lucide) window.lucide.createIcons();
        });
        head.querySelector('[data-month-act="today"]').addEventListener("click", () => {
            state.ui.monthOffset = 0; saveState(); renderCalendar();
            if (window.lucide) window.lucide.createIcons();
        });
        root.appendChild(head);

        // ----- grid -----
        const grid = document.createElement("div");
        grid.className = "cal-month-grid";
        const dowLabels = ["日","月","火","水","木","金","土"];
        dowLabels.forEach((lbl, idx) => {
            const h = document.createElement("div");
            h.className = "cal-dow-head" + (idx === 0 ? " sun" : idx === 6 ? " sat" : "");
            h.textContent = lbl;
            grid.appendChild(h);
        });
        for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);
            const inMonth = d.getMonth() === month;
            const isToday = d.getTime() === today.getTime();
            const dayEvents = events.filter((e) => {
                const ed = new Date(e.date); ed.setHours(0,0,0,0);
                return ed.getTime() === d.getTime();
            }).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));

            const cell = document.createElement("div");
            cell.className = "cal-month-cell" + (inMonth ? "" : " other-month") + (isToday ? " today" : "");
            const dowCls = d.getDay() === 0 ? "sun" : d.getDay() === 6 ? "sat" : "";
            const headRow = document.createElement("div");
            headRow.className = "cal-month-date " + dowCls;
            headRow.textContent = d.getDate();
            cell.appendChild(headRow);

            const maxShow = 3;
            dayEvents.slice(0, maxShow).forEach((e) => {
                const time = new Date(e.startAt);
                const pad = (n) => String(n).padStart(2, "0");
                const ev = document.createElement("div");
                ev.className = "cal-month-event";
                ev.style.setProperty("--boss-color", e.bossColor);
                ev.title = `${pad(time.getHours())}:${pad(time.getMinutes())} ${e.bossName} / ${e.teamName}`;
                ev.textContent = `${pad(time.getHours())}:${pad(time.getMinutes())} ${e.bossName}`;
                cell.appendChild(ev);
            });
            if (dayEvents.length > maxShow) {
                const more = document.createElement("div");
                more.className = "cal-month-event-more";
                more.textContent = `+${dayEvents.length - maxShow}件`;
                cell.appendChild(more);
            }
            grid.appendChild(cell);
        }
        root.appendChild(grid);
    }

    // ============================================================
    //  BOSS EDIT MODAL (manages all PTs of one boss in one place)
    // ============================================================
    let editingBossEntry = null; // current be being edited

    function openBossEditModal(be) {
        editingBossEntry = be;
        const boss = getBoss(be.bossId);
        // Title
        $("#boss-edit-title").innerHTML = `
            ${bossIconHtml(boss, "sm")}
            <span>${esc(boss ? boss.name : "?")}</span>
        `;
        // Clear pool search and render
        const ps = $("#boss-edit-pool-search");
        if (ps) ps.value = "";
        // Initialize open player groups (all open by default)
        if (!be._openPlayerIds) be._openPlayerIds = state.players.map((p) => p.id);
        renderBossEditPool();
        renderBossEditParties();
        $("#boss-edit-modal").classList.remove("hidden");
        if (window.lucide) window.lucide.createIcons();
    }
    function closeBossEditModal() {
        if (editingBossEntry) delete editingBossEntry._openPlayerIds;
        editingBossEntry = null;
        $("#boss-edit-modal").classList.add("hidden");
    }

    function renderBossEditParties() {
        if (!editingBossEntry) return;
        const be = editingBossEntry;
        const boss = getBoss(be.bossId);
        const root = $("#boss-edit-parties");
        const empty = $("#boss-edit-empty");

        root.innerHTML = "";
        if (be.parties.length === 0) {
            empty.classList.remove("hidden");
            return;
        }
        empty.classList.add("hidden");

        // Sort by difficulty
        const diffList = boss ? boss.difficulties : [];
        const sorted = [...be.parties].sort((a, b) => {
            const ai = diffList.indexOf(a.difficulty);
            const bi = diffList.indexOf(b.difficulty);
            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        });
        sorted.forEach((pt, idx) => root.appendChild(buildPartyEditRow(be, pt, idx)));
        if (window.lucide) window.lucide.createIcons();
    }

    function buildPartyEditRow(be, pt, idx) {
        const boss = getBoss(be.bossId);
        const maxMembers = boss ? boss.maxMembers : 6;
        const members = pt.memberIds
            .map((id) => getChar(id))
            .filter(Boolean)
            .sort((a, b) => (b.cp || 0) - (a.cp || 0));
        const total = members.reduce((s, c) => s + (c.cp || 0), 0);

        const row = document.createElement("div");
        row.className = "party-edit-row";
        row.dataset.partyId = pt.id;

        const badgeCls = difficultyClass(pt.difficulty);
        const badgeLbl = difficultyLabel(pt.difficulty);

        const pad2 = (n) => String(n).padStart(2, "0");
        const curDow = pt.recurrence ? String(pt.recurrence.dayOfWeek) : "";
        const curTime = pt.recurrence ? `${pad2(pt.recurrence.hour)}:${pad2(pt.recurrence.minute)}` : "21:00";

        const head = document.createElement("div");
        head.className = "party-edit-head";
        head.innerHTML = `
            <span class="party-label">${String.fromCharCode(65 + idx)}班</span>
            <input type="text" class="party-name-input" placeholder="チーム名 (例: 月曜PT)" value="${esc(pt.name || "")}" />
            <select data-role="difficulty" class="text-xs"></select>
            <span class="party-rec-inline" title="毎週の実施日時">
                <i data-lucide="calendar-clock" class="w-3 h-3 text-slate-500"></i>
                <select data-role="rec-dow" class="text-xs">
                    <option value="">--</option>
                    <option value="0">日</option>
                    <option value="1">月</option>
                    <option value="2">火</option>
                    <option value="3">水</option>
                    <option value="4">木</option>
                    <option value="5">金</option>
                    <option value="6">土</option>
                </select>
                <input type="time" data-role="rec-time" class="text-xs" value="${curTime}" />
                <button class="btn btn-ghost btn-danger btn-icon btn-xs" data-role="rec-clear" title="日時クリア" aria-label="日時クリア">
                    <i data-lucide="x" class="w-3 h-3"></i>
                </button>
            </span>
            <span class="party-total">
                ${members.length}/${maxMembers}人 · 合計 <strong>${fmtCP(total)}</strong>
            </span>
            <button class="btn btn-ghost btn-danger btn-icon" data-role="del" aria-label="PT削除">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
        `;
        head.querySelector(".party-name-input").addEventListener("change", (e) => {
            pt.name = e.target.value.trim();
            saveState(); renderFilterBar();
        });
        const sel = head.querySelector('[data-role="difficulty"]');
        (boss ? boss.difficulties : []).forEach((d) => {
            const o = document.createElement("option");
            o.value = d; o.textContent = difficultyLabel(d);
            if (d === pt.difficulty) o.selected = true;
            sel.appendChild(o);
        });
        sel.addEventListener("change", () => {
            pt.difficulty = sel.value;
            saveState(); renderBossEditParties(); renderDashboard(); renderCalendar();
        });

        // Recurrence editor (inline next to difficulty)
        const dowSel = head.querySelector('[data-role="rec-dow"]');
        dowSel.value = curDow;
        const timeInp = head.querySelector('[data-role="rec-time"]');
        const onRecChange = () => {
            const dow = dowSel.value;
            const t = timeInp.value;
            if (!dow || !t) {
                pt.recurrence = null;
            } else {
                const [h, m] = t.split(":").map((x) => parseInt(x, 10));
                pt.recurrence = {
                    dayOfWeek: parseInt(dow, 10),
                    hour: isNaN(h) ? 0 : h,
                    minute: isNaN(m) ? 0 : m
                };
            }
            saveState(); renderDashboard(); renderCalendar();
        };
        dowSel.addEventListener("change", onRecChange);
        timeInp.addEventListener("change", onRecChange);
        head.querySelector('[data-role="rec-clear"]').addEventListener("click", () => {
            pt.recurrence = null;
            dowSel.value = "";
            timeInp.value = "21:00";
            saveState(); renderDashboard(); renderCalendar();
        });

        head.querySelector('[data-role="del"]').addEventListener("click", () => {
            if (members.length > 0 && !confirm("メンバーが入っているPTを削除しますか？")) return;
            be.parties = be.parties.filter((x) => x.id !== pt.id);
            saveState(); renderBossEditParties(); renderBossEditPool(); renderDashboard(); renderCalendar(); renderFilterBar();
        });

        row.appendChild(head);

        // Members area (vertical, drop zone)
        const body = document.createElement("div");
        body.className = "party-members drop-zone";
        body.dataset.partyId = pt.id;

        if (members.length === 0) {
            body.innerHTML = '<span class="party-empty-hint">プールからキャラをドラッグして追加</span>';
        } else {
            members.forEach((c) => {
                const p = getPlayer(c.playerId);
                const color = playerColor(p);
                const job = classById(c.jobId);
                const chip = document.createElement("div");
                chip.className = "party-member dnd-source";
                chip.draggable = true;
                chip.dataset.charId = c.id;
                chip.dataset.fromPartyId = pt.id;
                chip.innerHTML = `
                    <span class="player-dot" style="background:${color}; color:${color};"></span>
                    <span class="mini-icon">
                        ${job ? `<img src="${esc(job.path)}" alt="" onerror="this.style.display='none'" />` : ""}
                    </span>
                    <div class="mem-info">
                        <div class="mem-name">
                            <a href="https://mapleranks.com/u/${encodeURIComponent(c.name)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>
                        </div>
                        <div class="text-slate-600 text-[10px]">${p ? esc(p.name) : ""} · ${job ? esc(job.name) : ""}</div>
                    </div>
                    <div class="text-right">
                        <div class="mem-cp">${fmtCP(c.cp)}</div>
                        ${c.hexa ? `<div class="text-[9px] text-slate-600 font-mono">H ${fmtCP(c.hexa)}</div>` : ""}
                    </div>
                    <button aria-label="外す"><i data-lucide="x" class="w-3 h-3"></i></button>
                `;
                chip.querySelector("button").addEventListener("click", (e) => {
                    e.stopPropagation();
                    pt.memberIds = pt.memberIds.filter((x) => x !== c.id);
                    saveState(); renderBossEditParties(); renderBossEditPool(); renderDashboard(); renderCalendar();
                });
                attachDragSource(chip, c.id, pt.id);
                body.appendChild(chip);
            });
        }

        // Drop zone listeners
        attachDropZone(body, be, pt);

        row.appendChild(body);

        return row;
    }

    // ============================================================
    //  POOL (left column of boss-edit modal) + DnD
    // ============================================================

    // Render the character pool inside the boss-edit modal.
    // Each player's chars are grouped; "in-use" chars (already in this boss) are dimmed.
    function renderBossEditPool() {
        if (!editingBossEntry) return;
        const be = editingBossEntry;
        const root = $("#boss-edit-pool");
        if (!root) return;
        const search = ($("#boss-edit-pool-search").value || "").trim().toLowerCase();
        // Preserve scroll position: replacing innerHTML resets scrollTop to 0,
        // which otherwise jerks the list to the top whenever a group is toggled.
        const prevScroll = root.scrollTop;
        root.innerHTML = "";

        // Characters currently assigned to any party of THIS boss
        const usedInBoss = new Set();
        be.parties.forEach((pt) => pt.memberIds.forEach((id) => usedInBoss.add(id)));

        // Open state cache (per modal session)
        if (!be._openPlayerIds) be._openPlayerIds = state.players.map((p) => p.id);

        state.players.forEach((p) => {
            const chars = state.characters
                .filter((c) => c.playerId === p.id)
                .filter((c) => !search ||
                    c.name.toLowerCase().includes(search) ||
                    p.name.toLowerCase().includes(search))
                .sort((a, b) => (b.cp || 0) - (a.cp || 0));
            if (chars.length === 0) return;

            const open = be._openPlayerIds.includes(p.id);
            const group = document.createElement("div");
            group.className = "pool-player-group" + (open ? " open" : "");
            const color = playerColor(p);

            const ghead = document.createElement("div");
            ghead.className = "pool-player-group-head";
            ghead.innerHTML = `
                <i data-lucide="chevron-right" class="chev w-3 h-3"></i>
                <span class="player-dot" style="background:${color}; color:${color};"></span>
                <span style="flex:1;">${esc(p.name)}</span>
                <span class="text-[10px] text-slate-600">${chars.length}</span>
            `;
            ghead.addEventListener("click", () => {
                const i = be._openPlayerIds.indexOf(p.id);
                if (i >= 0) be._openPlayerIds.splice(i, 1);
                else be._openPlayerIds.push(p.id);
                renderBossEditPool();
            });
            group.appendChild(ghead);

            const gbody = document.createElement("div");
            gbody.className = "pool-player-group-body";
            chars.forEach((c) => {
                const optedOut = (c.bossOptOut || []).includes(be.bossId);
                const inUse = usedInBoss.has(c.id);
                // skip opted-out chars entirely (they're explicitly hidden for this boss)
                if (optedOut) return;
                const job = classById(c.jobId);
                const card = document.createElement("div");
                card.className = "dnd-char" + (inUse ? " in-use" : "");
                card.draggable = !inUse;     // only pool->PT moves; in-use chars cannot leave PT via pool
                card.dataset.charId = c.id;
                card.dataset.fromPartyId = "";  // empty = from pool
                card.innerHTML = `
                    <span class="player-dot" style="background:${color}; color:${color};"></span>
                    <span class="icon">${job ? `<img src="${esc(job.path)}" alt="" onerror="this.style.display='none'"/>` : ""}</span>
                    <span class="name">${esc(c.name)}</span>
                    ${inUse ? '<span class="badge-mini">使用中</span>' : ""}
                    <span class="cp">${fmtCP(c.cp)}</span>
                `;
                if (!inUse) attachDragSource(card, c.id, null);
                gbody.appendChild(card);
            });
            group.appendChild(gbody);
            root.appendChild(group);
        });

        if (root.children.length === 0) {
            root.innerHTML = '<div class="empty-state" style="padding:0.75rem;">該当キャラなし</div>';
        }
        // Restore scroll so toggling a group doesn't jump the list to the top.
        root.scrollTop = prevScroll;
        if (window.lucide) window.lucide.createIcons();
    }

    // ---- DnD helpers ----
    // Currently-dragged element memory (since dataTransfer.getData isn't readable
    // during dragover, but we need it for highlighting drop zones).
    let dndState = null;  // { charId, fromPartyId | null }

    // ---- Auto-scroll during drag ----------------------------------------
    // Native HTML5 drag doesn't scroll containers, so the character pool /
    // parties list can't be reached past the fold while dragging. This
    // scrolls the relevant containers when the cursor nears their edges.
    const autoScroll = { active: false, x: 0, y: 0, raf: 0 };

    function autoScrollContainers() {
        // Innermost first: cursor over the pool scrolls the pool, not the
        // whole modal body (which wraps both columns).
        return [
            document.getElementById("boss-edit-pool"),                 // character pool
            document.querySelector("#boss-edit-modal .modal-body")     // parties column
        ].filter(Boolean);
    }
    function autoScrollTick() {
        if (!autoScroll.active) return;
        const EDGE = 56, STEP = 16;
        const { x, y } = autoScroll;
        for (const el of autoScrollContainers()) {
            if (el.scrollHeight <= el.clientHeight) continue;
            const r = el.getBoundingClientRect();
            if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            if (y - r.top < EDGE)         el.scrollTop -= STEP;
            else if (r.bottom - y < EDGE) el.scrollTop += STEP;
            break; // only the innermost container under the cursor
        }
        autoScroll.raf = requestAnimationFrame(autoScrollTick);
    }
    function startAutoScroll() {
        if (autoScroll.active) return;
        autoScroll.active = true;
        autoScroll.raf = requestAnimationFrame(autoScrollTick);
    }
    function stopAutoScroll() {
        autoScroll.active = false;
        if (autoScroll.raf) cancelAnimationFrame(autoScroll.raf);
        autoScroll.raf = 0;
    }
    // Track cursor position throughout the drag (dragover fires on the document).
    document.addEventListener("dragover", (e) => {
        if (!autoScroll.active) return;
        autoScroll.x = e.clientX;
        autoScroll.y = e.clientY;
    });

    function attachDragSource(el, charId, fromPartyId) {
        el.addEventListener("dragstart", (e) => {
            dndState = { charId, fromPartyId: fromPartyId || null };
            try {
                e.dataTransfer.setData("text/plain", charId);
                e.dataTransfer.effectAllowed = "move";
            } catch (_) {}
            el.classList.add("dragging");
            // Highlight valid drop targets
            highlightDropTargets();
            startAutoScroll();
        });
        el.addEventListener("dragend", () => {
            dndState = null;
            el.classList.remove("dragging");
            clearDropHighlights();
            stopAutoScroll();
        });
    }

    function highlightDropTargets() {
        if (!editingBossEntry || !dndState) return;
        const be = editingBossEntry;
        const c = getChar(dndState.charId); if (!c) return;
        const boss = getBoss(be.bossId);
        const maxMembers = boss ? boss.maxMembers : 6;

        // For each existing PT body in the modal, decide if dropping here is OK
        $$(".party-members.drop-zone").forEach((zone) => {
            const partyId = zone.dataset.partyId;
            const pt = be.parties.find((p) => p.id === partyId);
            if (!pt) return;
            const reason = dropRejectReason(c, pt, be, maxMembers);
            zone.classList.remove("drag-over-ok", "drag-over-bad");
            if (reason) zone.dataset.dropReason = reason;
            else delete zone.dataset.dropReason;
        });
    }

    function clearDropHighlights() {
        $$(".party-members.drop-zone").forEach((zone) => {
            zone.classList.remove("drag-over-ok", "drag-over-bad");
            delete zone.dataset.dropReason;
        });
    }

    // Returns rejection reason string (or null if drop is OK).
    // Source party is dndState.fromPartyId; dropping into pt of be.
    function dropRejectReason(c, pt, be, maxMembers) {
        const fromPartyId = dndState && dndState.fromPartyId;
        // Same PT → no-op (treat as reject so it doesn't visually look like a real drop)
        if (fromPartyId === pt.id) return "同じPT";
        // Already in same boss (different PT) and we're not the source PT
        const otherPtUses = be.parties.some((p) => p.id !== fromPartyId && p.id !== pt.id && p.memberIds.includes(c.id));
        if (otherPtUses) return "他PTで使用中";
        // Same player in this PT (excluding the char itself if it's source)
        const sameInPt = pt.memberIds.some((id) => {
            if (id === c.id) return false;
            const other = getChar(id);
            return other && other.playerId === c.playerId;
        });
        if (sameInPt) return "同プレイヤー";
        // Opt-out
        if ((c.bossOptOut || []).includes(be.bossId)) return "非表示設定";
        // Capacity (only when adding NEW to PT)
        if (fromPartyId !== pt.id && !pt.memberIds.includes(c.id) && pt.memberIds.length >= maxMembers) {
            return "定員超過";
        }
        return null;
    }

    function attachDropZone(el, be, pt) {
        el.addEventListener("dragover", (e) => {
            if (!dndState) return;
            const c = getChar(dndState.charId); if (!c) return;
            const boss = getBoss(be.bossId);
            const maxMembers = boss ? boss.maxMembers : 6;
            const reason = dropRejectReason(c, pt, be, maxMembers);
            if (reason) {
                el.classList.add("drag-over-bad");
                el.classList.remove("drag-over-ok");
                try { e.dataTransfer.dropEffect = "none"; } catch(_){}
            } else {
                el.classList.add("drag-over-ok");
                el.classList.remove("drag-over-bad");
                e.preventDefault();
                try { e.dataTransfer.dropEffect = "move"; } catch(_){}
            }
        });
        el.addEventListener("dragleave", () => {
            el.classList.remove("drag-over-ok", "drag-over-bad");
        });
        el.addEventListener("drop", (e) => {
            e.preventDefault();
            el.classList.remove("drag-over-ok", "drag-over-bad");
            if (!dndState) return;
            const c = getChar(dndState.charId); if (!c) return;
            const boss = getBoss(be.bossId);
            const maxMembers = boss ? boss.maxMembers : 6;
            const reason = dropRejectReason(c, pt, be, maxMembers);
            if (reason) {
                el.classList.add("invalid-flash");
                setTimeout(() => el.classList.remove("invalid-flash"), 350);
                return;
            }
            // Apply move
            if (dndState.fromPartyId) {
                // Remove from source PT
                const src = be.parties.find((x) => x.id === dndState.fromPartyId);
                if (src) src.memberIds = src.memberIds.filter((id) => id !== c.id);
            }
            // Add to target PT (if not already)
            if (!pt.memberIds.includes(c.id)) pt.memberIds.push(c.id);
            saveState();
            renderBossEditParties();
            renderBossEditPool();
            renderDashboard();
            renderCalendar();
        });
    }

    // ============================================================
    //  Players (roster) tab
    // ============================================================
    function renderPlayers() {
        const root = $("#players-list");
        root.innerHTML = "";
        if (state.players.length === 0) {
            root.innerHTML = '<div class="empty-state">プレイヤーを追加してください</div>';
            return;
        }
        state.players.forEach((p) => root.appendChild(buildPlayerCard(p)));
    }

    function buildPlayerCard(p) {
        const color = playerColor(p);
        const chars = state.characters
            .filter((c) => c.playerId === p.id)
            .sort((a, b) => (b.cp || 0) - (a.cp || 0));

        const card = document.createElement("div");
        card.className = "player-card";

        card.innerHTML = `
            <div class="player-head">
                <span class="player-dot" style="background:${color}; color:${color}; width:14px; height:14px;"></span>
                <span class="player-name">${esc(p.name)}</span>
                ${p.discordId ? `<span class="badge badge-soft"><i data-lucide="message-circle" class="w-3 h-3 mr-1"></i>${esc(p.discordId)}</span>` : ""}
                <span class="player-meta">${chars.length} キャラ</span>
                <button class="btn btn-ghost btn-icon ml-auto" data-act="edit-player" aria-label="プレイヤー編集">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button class="btn btn-ghost btn-danger btn-icon" data-act="del-player" aria-label="プレイヤー削除">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
            <div data-role="chars" class="flex flex-col"></div>
            <div class="add-char-form" data-role="add-form">
                <div class="char-icon" data-role="preview" style="width:34px; height:34px;">
                    <i data-lucide="user" class="w-4 h-4 text-slate-600"></i>
                </div>
                <input type="text" data-role="name" placeholder="キャラ名" />
                <select data-role="job"></select>
                <select data-role="server"></select>
                <input type="number" data-role="cp" placeholder="戦闘力" min="0" />
                <input type="number" data-role="hexa" placeholder="HEXA" min="0" />
                <button class="btn btn-primary" data-role="add"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>
            </div>
        `;

        card.querySelector('[data-act="edit-player"]').addEventListener("click", () => openEditPlayerModal(p));
        card.querySelector('[data-act="del-player"]').addEventListener("click", () => {
            if (!confirm(`${p.name} を削除しますか？(紐づくキャラも全て削除されます)`)) return;
            state.players = state.players.filter((x) => x.id !== p.id);
            state.characters = state.characters.filter((c) => c.playerId !== p.id);
            cleanupOrphans();
            saveState(); render();
        });

        const list = card.querySelector('[data-role="chars"]');
        chars.forEach((c) => list.appendChild(buildCharRow(c)));

        const form = card.querySelector('[data-role="add-form"]');
        const jobSel = form.querySelector('[data-role="job"]');
        populateJobSelect(jobSel);
        const serverSel = form.querySelector('[data-role="server"]');
        populateServerSelect(serverSel);
        const preview = form.querySelector('[data-role="preview"]');
        const updatePreview = () => {
            const path = classIconPath(jobSel.value);
            preview.innerHTML = path
                ? `<img src="${esc(path)}" alt="" />`
                : `<i data-lucide="user" class="w-4 h-4 text-slate-600"></i>`;
            if (window.lucide) window.lucide.createIcons();
        };
        jobSel.addEventListener("change", updatePreview);
        updatePreview();

        form.querySelector('[data-role="add"]').addEventListener("click", () => {
            const name = form.querySelector('[data-role="name"]').value.trim();
            const jobId = jobSel.value;
            const server = serverSel.value;
            const cp = parseInt(form.querySelector('[data-role="cp"]').value, 10) || 0;
            const hexa = parseInt(form.querySelector('[data-role="hexa"]').value, 10) || 0;
            if (!name) { alert("キャラ名を入力してください"); return; }
            state.characters.push({ id: uid(), playerId: p.id, name, jobId, cp, hexa, server, level: 0, bossOptOut: [] });
            saveState(); render();
        });

        return card;
    }

    function buildCharRow(c) {
        const job = classById(c.jobId);
        const srv = getServer(c.server);
        const row = document.createElement("div");
        row.className = "char-row";
        row.innerHTML = `
            <div class="char-icon" style="width:30px; height:30px;">
                ${job ? `<img src="${esc(job.path)}" alt="" onerror="this.style.display='none'" />`
                      : `<i data-lucide="user" class="w-4 h-4 text-slate-600"></i>`}
            </div>
            <div>
                <div class="text-sm font-semibold text-slate-100">
                    <a href="https://mapleranks.com/u/${encodeURIComponent(c.name)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a>
                </div>
                <div class="text-[11px] text-slate-500">${job ? esc(job.name) : "未設定"}</div>
            </div>
            <span class="badge badge-server">${esc(srv ? srv.name : "?")}</span>
            <div class="text-xs text-slate-400 font-mono">CP <span class="text-indigo-300 font-bold">${fmtCP(c.cp)}</span></div>
            <div class="text-xs text-slate-400 font-mono">H <span class="text-purple-300 font-bold">${fmtCP(c.hexa)}</span></div>
            <div class="text-[10px] text-slate-600 font-mono">${c.level ? `Lv${c.level}` : ""}</div>
            <button class="btn btn-ghost btn-icon" data-act="edit" aria-label="編集">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button class="btn btn-ghost btn-danger btn-icon" data-act="del" aria-label="削除">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
        `;
        row.querySelector('[data-act="edit"]').addEventListener("click", () => openEditCharModal(c));
        row.querySelector('[data-act="del"]').addEventListener("click", () => {
            if (!confirm(`${c.name} を削除しますか？`)) return;
            state.characters = state.characters.filter((x) => x.id !== c.id);
            cleanupOrphans();
            saveState(); render();
        });
        return row;
    }

    function cleanupOrphans() {
        state.bossEntries.forEach((be) => be.parties.forEach((pt) => {
            pt.memberIds = pt.memberIds.filter((id) => getChar(id));
        }));
        // Drop bossEntries with all-empty parties
        state.bossEntries = state.bossEntries.filter((be) => be.parties.length > 0);
    }

    function populateJobSelect(sel) {
        sel.innerHTML = "";
        Object.entries(window.CLASS_DATA || {}).forEach(([group, list]) => {
            const grp = document.createElement("optgroup");
            grp.label = group;
            list.forEach((c) => {
                const o = document.createElement("option");
                o.value = c.id; o.textContent = c.name;
                grp.appendChild(o);
            });
            sel.appendChild(grp);
        });
    }

    function populateServerSelect(sel) {
        sel.innerHTML = "";
        (window.SERVERS || []).forEach((s) => {
            const o = document.createElement("option");
            o.value = s.id; o.textContent = s.name;
            sel.appendChild(o);
        });
    }

    // ---- Edit player modal ----
    let editingPlayerId = null;
    function openEditPlayerModal(p) {
        editingPlayerId = p.id;
        $("#edit-player-name").value = p.name;
        $("#edit-player-discord").value = p.discordId || "";
        $("#edit-player-modal").classList.remove("hidden");
        if (window.lucide) window.lucide.createIcons();
    }
    function closeEditPlayerModal() {
        editingPlayerId = null;
        $("#edit-player-modal").classList.add("hidden");
    }
    function saveEditPlayerModal() {
        if (!editingPlayerId) return;
        const p = getPlayer(editingPlayerId);
        if (!p) return closeEditPlayerModal();
        const name = $("#edit-player-name").value.trim();
        if (!name) { alert("プレイヤー名を入力してください"); return; }
        p.name = name;
        p.discordId = $("#edit-player-discord").value.trim();
        saveState(); closeEditPlayerModal(); render();
    }

    // ---- Edit character modal ----
    let editingCharId = null;
    function openEditCharModal(c) {
        editingCharId = c.id;
        $("#edit-char-name").value = c.name;
        $("#edit-char-cp").value = c.cp || 0;
        $("#edit-char-hexa").value = c.hexa || 0;
        $("#edit-char-level").value = c.level || "";
        populateJobSelect($("#edit-char-job"));
        $("#edit-char-job").value = c.jobId || "";
        populateServerSelect($("#edit-char-server"));
        $("#edit-char-server").value = c.server || "kronos";
        renderOptOutGrid(c);
        $("#edit-char-modal").classList.remove("hidden");
        if (window.lucide) window.lucide.createIcons();
    }
    function closeEditCharModal() {
        editingCharId = null;
        $("#edit-char-modal").classList.add("hidden");
    }
    function renderOptOutGrid(c) {
        const root = $("#edit-char-optout");
        root.innerHTML = "";
        (window.BOSS_DATA || []).forEach((b) => {
            const optedOut = (c.bossOptOut || []).includes(b.id);
            const lbl = document.createElement("label");
            lbl.className = "optout-toggle" + (optedOut ? " off" : "");
            lbl.innerHTML = `
                <input type="checkbox" data-bid="${esc(b.id)}" ${optedOut ? "" : "checked"} />
                <span>${esc(b.name)}</span>
            `;
            lbl.querySelector("input").addEventListener("change", (e) => {
                lbl.classList.toggle("off", !e.target.checked);
            });
            root.appendChild(lbl);
        });
    }
    function saveEditCharModal() {
        if (!editingCharId) return;
        const c = getChar(editingCharId);
        if (!c) return closeEditCharModal();
        c.name  = $("#edit-char-name").value.trim() || c.name;
        c.jobId = $("#edit-char-job").value;
        c.cp    = parseInt($("#edit-char-cp").value, 10) || 0;
        c.hexa  = parseInt($("#edit-char-hexa").value, 10) || 0;
        c.level = parseInt($("#edit-char-level").value, 10) || 0;
        c.server = $("#edit-char-server").value;
        // Opt-out collection
        const optOut = [];
        $$('#edit-char-optout input[type="checkbox"]').forEach((cb) => {
            if (!cb.checked) optOut.push(cb.dataset.bid);
        });
        c.bossOptOut = optOut;
        // Remove from any current assignment where opted out
        state.bossEntries.forEach((be) => {
            if (optOut.includes(be.bossId)) {
                be.parties.forEach((pt) => {
                    pt.memberIds = pt.memberIds.filter((id) => id !== c.id);
                });
            }
        });
        saveState(); closeEditCharModal(); render();
    }


    // ============================================================
    //  WIRING
    // ============================================================
    function wire() {
        // Tabs
        $$(".tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const tab = btn.dataset.tab;
                $$(".tab-btn").forEach((b) => {
                    const active = b.dataset.tab === tab;
                    b.classList.toggle("tab-active",   active);
                    b.classList.toggle("tab-inactive", !active);
                });
                ["schedule","calendar","roster"].forEach((t) => {
                    $("#view-" + t).classList.toggle("hidden", tab !== t);
                });
            });
        });

        // Filters (Boss is a clickable chip list, wired in renderFilterBar)
        $("#filter-team").addEventListener("change",   (e) => { state.ui.filters.team   = e.target.value; saveState(); renderDashboard(); });
        $("#filter-server").addEventListener("change", (e) => { state.ui.filters.server = e.target.value; saveState(); renderDashboard(); });
        $("#filter-clear").addEventListener("click",   () => {
            state.ui.filters = { boss: [], team: "", player: "", server: "" };
            saveState(); render();
        });

        // Add player
        $("#add-player-btn").addEventListener("click", () => {
            const inp = $("#new-player");
            const inpD = $("#new-player-discord");
            const name = inp.value.trim();
            if (!name) return;
            const usedColors = new Set(state.players.map((p) => p.colorIdx));
            let colorIdx = state.players.length % PLAYER_COLORS.length;
            for (let i = 0; i < PLAYER_COLORS.length; i++) {
                if (!usedColors.has(i)) { colorIdx = i; break; }
            }
            state.players.push({ id: uid(), name, colorIdx, discordId: inpD.value.trim() });
            inp.value = ""; inpD.value = "";
            saveState(); render();
        });
        $("#new-player").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#add-player-btn").click(); });

        // Boss edit modal: recurrence change handler
        $$("[data-close-boss-edit]").forEach((el) => el.addEventListener("click", closeBossEditModal));
        $("#boss-edit-add-party").addEventListener("click", () => {
            if (!editingBossEntry) return;
            const boss = getBoss(editingBossEntry.bossId);
            editingBossEntry.parties.push({
                id: uid(), name: "",
                difficulty: boss ? boss.difficulties[0] : "",
                recurrence: null,
                memberIds: []
            });
            saveState(); renderBossEditParties(); renderBossEditPool(); renderDashboard(); renderCalendar(); renderFilterBar();
        });

        // Pool search inside boss-edit modal
        const poolSearch = $("#boss-edit-pool-search");
        if (poolSearch) poolSearch.addEventListener("input", renderBossEditPool);

        // Player modal
        $$("[data-close-player]").forEach((el) => el.addEventListener("click", closeEditPlayerModal));
        $("#edit-player-save").addEventListener("click", saveEditPlayerModal);

        // Char modal
        $$("[data-close-char]").forEach((el) => el.addEventListener("click", closeEditCharModal));
        $("#edit-char-save").addEventListener("click", saveEditCharModal);

        // Close modals on backdrop click
        $$(".modal-bg").forEach((bg) => {
            bg.addEventListener("click", (e) => {
                if (e.target === bg) bg.classList.add("hidden");
            });
        });

        // Calendar mode toggle
        $$(".cal-mode-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                state.ui.calendarMode = btn.dataset.calMode;
                state.ui.monthOffset = 0;
                saveState();
                renderCalendar();
                if (window.lucide) window.lucide.createIcons();
            });
        });
    }

    // ============================================================
    //  BOOT
    // ============================================================
    document.addEventListener("DOMContentLoaded", () => {
        loadState();
        wire();
        render();
        if (window.lucide) window.lucide.createIcons();
    });
})();
