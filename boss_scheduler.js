/* =========================================================
 *  Boss Scheduler v4 — 週ボスPT編成（シーズン制）
 *
 *  画面は3つ:
 *    ① メンバーと希望  … メンバー一覧を入口に、キャラ登録と参加希望を編集
 *    ② 編成編集        … ボス×難易度を選び、希望者をPT枠へ配置
 *    ③ ダッシュボード  … 公開された編成の周知（自分のPT / 全体 / 空き / テキスト）
 *
 *  希望は Boss × 難易度 の粒度。優先度は持たず、難易度の高さで代替する。
 *  難易度の高さはボス内の相対順位（BOSS_DATA.difficulties の並び）で決まる。
 *
 *  配置ルール:
 *    R1 同一PT内に同じメンバーのキャラを2体以上入れない
 *    R2 同一キャラは同じボスの複数PTに入れない（難易度が違っても不可）
 *    R3 PT人数の上限はボスの maxMembers（下限は設けない）
 * ========================================================= */

(function () {
    "use strict";

    const STORAGE_KEY = "boss-scheduler-v4";
    const VERSION = 4;

    const MEMBER_COLORS = [
        "#a5b4fc", "#67e8f9", "#fda4af", "#fcd34d", "#86efac",
        "#c4b5fd", "#f9a8d4", "#5eead4", "#fdba74", "#93c5fd"
    ];

    // 難易度アクセント（PTカード・所属PTカードの左端）
    const DIFF_COLOR = {
        EASY: "#6b7280", NORMAL: "#22d3ee", HARD: "#f87171",
        CHAOS: "#facc15", EXTREME: "#ef4444"
    };

    // ---- tiny helpers ---------------------------------------------------
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 9);
    const now = () => new Date().toISOString();

    function el(tag, attrs, ...children) {
        const n = document.createElement(tag);
        if (attrs) for (const [k, v] of Object.entries(attrs)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === "class") n.className = v;
            else if (k === "text") n.textContent = v;
            else if (k === "style") n.setAttribute("style", v);
            else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
            else if (v === true) n.setAttribute(k, "");
            else n.setAttribute(k, v);
        }
        for (const c of children.flat()) {
            if (c === null || c === undefined || c === false || c === "") continue;
            n.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
        }
        return n;
    }
    const icon = (name, cls) => el("i", { "data-lucide": name, class: cls || "w-3.5 h-3.5" });

    // ホストのiframe内では window.confirm が抑止されて常に false を返すため、
    // 取り返しのつかない操作は自前のモーダルで確認する。
    function confirmDialog(message, okLabel) {
        return new Promise((resolve) => {
            const bg = $("#confirm-modal");
            const ok = $("#confirm-ok");
            const cancel = $("#confirm-cancel");
            $("#confirm-text").textContent = message;
            ok.textContent = okLabel || "削除する";

            const close = (v) => {
                bg.classList.add("hidden");
                ok.removeEventListener("click", onOk);
                cancel.removeEventListener("click", onCancel);
                bg.removeEventListener("click", onBackdrop);
                document.removeEventListener("keydown", onKey);
                resolve(v);
            };
            const onOk = () => close(true);
            const onCancel = () => close(false);
            const onBackdrop = (e) => { if (e.target === bg) close(false); };
            const onKey = (e) => {
                if (e.key === "Escape") close(false);
                else if (e.key === "Enter") close(true);
            };

            ok.addEventListener("click", onOk);
            cancel.addEventListener("click", onCancel);
            bg.addEventListener("click", onBackdrop);
            document.addEventListener("keydown", onKey);
            bg.classList.remove("hidden");
            ok.focus();
        });
    }

    let toastTimer = 0;
    function toast(msg, kind) {
        $$(".toast").forEach((t) => t.remove());
        const t = el("div", { class: "toast" + (kind ? " " + kind : ""), role: "status", text: msg });
        document.body.appendChild(t);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.remove(), 2600);
    }

    // 戦闘力の整形と解釈（「1.2億」「9800万」「120000000」を受け付ける）
    function formatCp(n) {
        if (n == null || isNaN(n) || n <= 0) return "—";
        if (n >= 100000000) {
            const oku = n / 100000000;
            return (oku >= 10 ? oku.toFixed(1) : oku.toFixed(2)).replace(/\.?0+$/, "") + "億";
        }
        if (n >= 10000) return Math.round(n / 10000).toLocaleString() + "万";
        return Math.round(n).toLocaleString();
    }
    function parseCp(str) {
        if (str == null) return 0;
        const s = String(str).trim().replace(/[,\s]/g, "");
        if (!s) return 0;
        let m = s.match(/^([\d.]+)億(?:([\d.]+)万)?$/);
        if (m) return Math.round(parseFloat(m[1]) * 1e8 + (m[2] ? parseFloat(m[2]) * 1e4 : 0));
        m = s.match(/^([\d.]+)万$/);
        if (m) return Math.round(parseFloat(m[1]) * 1e4);
        const n = parseFloat(s);
        return isNaN(n) ? 0 : Math.round(n);
    }

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

    // ============================================================
    //  STATE
    // ============================================================
    let state = null;
    let drag = null;   // { charId, fromPartyId }

    function emptyState() {
        return {
            version: VERSION,
            seasons: [{ id: uid("s"), name: "シーズン1", isCurrent: true, note: "", createdAt: now() }],
            members: [],   // { id, discordName, displayName, isActive, note, colorIdx, characters: [...] }
            wishes: [],    // { characterId, bossId, difficulty, note, updatedBy, updatedAt }
            parties: [],   // { id, seasonId, bossId, difficulty, label, slots:[charId], status, memo, createdAt }
            ui: {
                screen: "members",
                editorMemberId: null,
                editorCharId: null,
                viewerMemberId: null,
                bossId: (window.BOSS_DATA || [{}])[0].id,
                difficulty: null,
                selectedCharId: null,
                sortKey: "combatPower",
                candSearch: "",
                dashBossIds: [],
                includeCp: true,
                includeDraft: false,
                outBossId: ""
            }
        };
    }

    function loadState() {
        state = emptyState();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.members)) {
                    state.seasons = Array.isArray(parsed.seasons) && parsed.seasons.length
                        ? parsed.seasons : state.seasons;
                    state.members = parsed.members;
                    state.wishes  = Array.isArray(parsed.wishes) ? parsed.wishes : [];
                    state.parties = Array.isArray(parsed.parties) ? parsed.parties : [];
                    if (parsed.ui) state.ui = Object.assign(state.ui, parsed.ui);
                }
            }
        } catch (e) { /* 壊れた保存データは無視して空で始める */ }
        normalize();
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
        catch (e) { /* 容量超過などは無視 */ }
    }

    // 参照切れ・欠損フィールドの掃除。読み込み直後と JSON 取り込み後に通す。
    function normalize() {
        const bosses = window.BOSS_DATA || [];
        const bossIds = new Set(bosses.map((b) => b.id));
        const season = currentSeason();

        state.members.forEach((m, i) => {
            if (!m.id) m.id = uid("m");
            if (m.isActive == null) m.isActive = true;
            if (m.colorIdx == null) m.colorIdx = i % MEMBER_COLORS.length;
            if (!Array.isArray(m.characters)) m.characters = [];
            m.characters.forEach((c) => {
                if (!c.id) c.id = uid("c");
                if (c.combatPower == null) c.combatPower = 0;
                if (c.hexa == null) c.hexa = 0;
                if (!c.server) c.server = ((window.SERVERS || [{}])[0] || {}).id || "kronos";
                if (c.isActive == null) c.isActive = true;
                if (!c.updatedAt) c.updatedAt = now();
            });
        });

        const charIds = new Set(allChars().map((c) => c.id));
        state.wishes = state.wishes.filter((w) =>
            charIds.has(w.characterId) && bossIds.has(w.bossId) &&
            (bossById(w.bossId).difficulties || []).includes(w.difficulty));

        state.parties = state.parties.filter((p) => bossIds.has(p.bossId));
        state.parties.forEach((p) => {
            if (!p.id) p.id = uid("p");
            if (!p.seasonId) p.seasonId = season.id;
            if (!p.status) p.status = "draft";
            if (!Array.isArray(p.slots)) p.slots = [];
            const b = bossById(p.bossId);
            if (!b.difficulties.includes(p.difficulty)) p.difficulty = b.difficulties[b.difficulties.length - 1];
            p.slots = p.slots.filter((id) => charIds.has(id)).slice(0, b.maxMembers);
        });

        // UI 参照の整合
        const ui = state.ui;
        if (!bossIds.has(ui.bossId)) ui.bossId = bosses.length ? bosses[0].id : null;
        const cur = bossById(ui.bossId);
        if (cur && !cur.difficulties.includes(ui.difficulty)) {
            ui.difficulty = cur.difficulties[cur.difficulties.length - 1];
        }
        if (ui.editorMemberId && !memberById(ui.editorMemberId)) ui.editorMemberId = null;
        if (ui.viewerMemberId && !memberById(ui.viewerMemberId)) ui.viewerMemberId = null;
        if (!ui.viewerMemberId && state.members.length) ui.viewerMemberId = state.members[0].id;
        ui.dashBossIds = (ui.dashBossIds || []).filter((id) => bossIds.has(id));
        if (ui.outBossId && !bossIds.has(ui.outBossId)) ui.outBossId = "";
    }

    // ---- 参照ヘルパ ------------------------------------------------------
    const bossList = () => window.BOSS_DATA || [];
    const bossById = (id) => bossList().find((b) => b.id === id) || bossList()[0];
    const memberById = (id) => state.members.find((m) => m.id === id) || null;
    const allChars = () => state.members.flatMap((m) => m.characters.map((c) => ({ ...c, memberId: m.id })));
    function charById(id) {
        for (const m of state.members) {
            const c = m.characters.find((x) => x.id === id);
            if (c) return { ...c, memberId: m.id };
        }
        return null;
    }
    const currentSeason = () => state.seasons.find((s) => s.isCurrent) || state.seasons[0];
    const seasonParties = () => state.parties.filter((p) => p.seasonId === currentSeason().id);
    const partiesOf = (bossId, difficulty) => seasonParties().filter((p) =>
        p.bossId === bossId && (difficulty == null || p.difficulty === difficulty));
    const wishOf = (characterId, bossId, difficulty) => state.wishes.find((w) =>
        w.characterId === characterId && w.bossId === bossId && w.difficulty === difficulty);
    const displayName = (m) => (m ? (m.displayName || m.discordName) : "?");
    const memberColor = (m) => (m ? MEMBER_COLORS[(m.colorIdx || 0) % MEMBER_COLORS.length] : "#475569");
    const serverById = (id) => (window.SERVERS || []).find((s) => s.id === id) || null;

    const diffLabel   = (d) => (window.DIFFICULTY_LABEL || {})[d] || d || "";
    const diffLabelJa = (d) => (window.DIFFICULTY_LABEL_JA || {})[d] || d || "";
    const diffClass   = (d) => (window.DIFFICULTY_BADGE_CLASS || {})[d] || "badge-easy";
    const diffColor   = (d) => DIFF_COLOR[d] || "#334155";

    // 難易度の高さはボス内の相対順位。ボスをまたいだ比較はしない。
    const diffRank = (bossId, d) => (bossById(bossId).difficulties || []).indexOf(d);
    function hardestWish(characterId, bossId) {
        const ds = (bossById(bossId).difficulties || []).filter((d) => wishOf(characterId, bossId, d));
        return ds.length ? ds[ds.length - 1] : null;
    }

    // ============================================================
    //  配置ルール（R1〜R3）
    // ============================================================
    function canPlace(charId, party) {
        const ch = charById(charId);
        if (!ch) return { ok: false, reason: "キャラが見つかりません" };
        if (party.slots.includes(charId)) return { ok: false, reason: "すでにこのPTにいます" };

        const b = bossById(party.bossId);
        // R3: 定員
        if (party.slots.length >= b.maxMembers) {
            return { ok: false, reason: "定員に達しています（最大" + b.maxMembers + "人）" };
        }
        // R1: 同一PT内に同じメンバーのキャラを2体以上入れない
        for (const sid of party.slots) {
            const other = charById(sid);
            if (other && other.memberId === ch.memberId) {
                return { ok: false, reason: displayName(memberById(ch.memberId)) + " は既にこのPTにいます（" + other.name + "）" };
            }
        }
        // R2: 同一キャラは同じボスの複数PTに入れない（難易度が違っても不可）
        const conflict = seasonParties().find((p) =>
            p.id !== party.id && p.bossId === party.bossId && p.slots.includes(charId));
        if (conflict) {
            return { ok: false, reason: bossById(conflict.bossId).name + " " + diffLabelJa(conflict.difficulty) + " に配置済みです" };
        }
        // R4: サーバーが違うキャラは同じPTに入れない（ゲーム側で組めないため）
        for (const sid of party.slots) {
            const other = charById(sid);
            if (other && other.server && ch.server && other.server !== ch.server) {
                const a = serverById(ch.server), z = serverById(other.server);
                return { ok: false, reason: "サーバーが違います（" + (a ? a.name : ch.server) + " / " + (z ? z.name : other.server) + "）" };
            }
        }
        return { ok: true };
    }

    function placeChar(charId, partyId, fromPartyId) {
        const party = state.parties.find((p) => p.id === partyId);
        if (!party) return;
        const from = fromPartyId && fromPartyId !== partyId
            ? state.parties.find((p) => p.id === fromPartyId) : null;
        const fromIndex = from ? from.slots.indexOf(charId) : -1;
        if (from && fromIndex >= 0) from.slots.splice(fromIndex, 1);

        const v = canPlace(charId, party);
        if (!v.ok) {
            if (from && fromIndex >= 0) from.slots.splice(fromIndex, 0, charId);   // 移動が通らなければ元の位置に戻す
            toast(v.reason, "warn");
            render();
            return;
        }
        party.slots.push(charId);
        state.ui.selectedCharId = null;
        saveState();
        render();
    }

    function removeFromParty(charId, partyId) {
        const p = state.parties.find((x) => x.id === partyId);
        if (p) p.slots = p.slots.filter((id) => id !== charId);
        saveState();
        render();
    }

    // ============================================================
    //  共通パーツ
    // ============================================================
    function bossIconNode(b, size) {
        const wrap = el("div", { class: "boss-icon" + (size === "sm" ? " sm" : "") });
        if (b) wrap.style.setProperty("--boss-color", b.color || "#6366f1");
        const url = b && window.bossImageUrl ? window.bossImageUrl(b) : "";
        const fallback = () => icon((b && b.icon) || "flame", size === "sm" ? "w-3 h-3" : "w-4 h-4");
        if (url) {
            const img = el("img", { src: url, alt: b.name });
            img.addEventListener("error", () => {
                wrap.textContent = "";
                wrap.appendChild(fallback());
                if (window.lucide) window.lucide.createIcons();
            });
            wrap.appendChild(img);
        } else {
            wrap.appendChild(fallback());
        }
        return wrap;
    }

    function charIconNode(c, cls) {
        const job = classById(c && c.jobId);
        const wrap = el("div", { class: cls || "icon" });
        if (job) {
            const img = el("img", { src: job.path, alt: "" });
            img.addEventListener("error", () => { img.style.display = "none"; });
            wrap.appendChild(img);
        } else {
            wrap.appendChild(icon("user", "w-3 h-3 text-slate-600"));
        }
        return wrap;
    }

    const diffBadge = (d) => el("span", { class: "badge " + diffClass(d), text: diffLabel(d) });

    function cpBlock(c, cls) {
        return el("div", { class: cls || "cand-cp" },
            el("div", { class: "cp", text: formatCp(c && c.combatPower) }),
            el("div", { class: "hx", text: "H " + formatCp(c && c.hexa) }));
    }

    function jobSelect(value, onChange) {
        const sel = el("select", { onchange: onChange });
        sel.appendChild(el("option", { value: "", text: "職業なし" }));
        Object.entries(window.CLASS_DATA || {}).forEach(([group, list]) => {
            const grp = el("optgroup", { label: group });
            list.forEach((c) => grp.appendChild(el("option", { value: c.id, selected: c.id === value, text: c.name })));
            sel.appendChild(grp);
        });
        sel.value = value || "";
        return sel;
    }

    function serverSelect(value, onChange) {
        const sel = el("select", { onchange: onChange });
        (window.SERVERS || []).forEach((s) =>
            sel.appendChild(el("option", { value: s.id, selected: s.id === value, text: s.name })));
        return sel;
    }

    // ============================================================
    //  ① メンバーと希望
    // ============================================================
    function renderMembers() {
        const root = $("#members-root");
        root.textContent = "";
        root.appendChild(state.ui.editorMemberId ? memberDetail() : memberListView());
    }

    function memberListView() {
        const wrap = el("div", { class: "fade-in" });
        const panel = el("section", { class: "panel" });

        // 追加はインライン入力。ダイアログはiframe内で出せないため使わない。
        const nameInput = el("input", {
            type: "text", id: "new-member", placeholder: "Discord名", style: "width:160px",
            onkeydown: (e) => { if (e.key === "Enter") addMember(e.target.value); }
        });
        panel.appendChild(el("div", { class: "panel-head" },
            el("h2", { text: "メンバー" }),
            el("span", { class: "sub", text: "名前を押すと、そのメンバーのキャラクターと参加希望を編集できます" }),
            el("span", { class: "spacer" }),
            nameInput,
            el("button", {
                class: "btn btn-primary", onclick: () => addMember(nameInput.value)
            }, icon("user-plus"), "メンバーを追加")
        ));

        const body = el("div", { class: "panel-body" });
        if (!state.members.length) {
            body.appendChild(el("div", { class: "empty-state", text: "メンバーがいません。「メンバーを追加」から始めてください。" }));
        } else {
            const grid = el("div", { class: "member-grid" });
            state.members.forEach((m) => {
                const ids = m.characters.map((c) => c.id);
                const wishCount = state.wishes.filter((w) => ids.includes(w.characterId)).length;
                const placed = seasonParties().filter((p) => p.slots.some((id) => ids.includes(id))).length;
                const top = m.characters.reduce((mx, c) => Math.max(mx, c.combatPower || 0), 0);

                const card = el("button", {
                    class: "member-card" + (m.isActive ? "" : " inactive"),
                    onclick: () => { state.ui.editorMemberId = m.id; state.ui.editorCharId = null; saveState(); render(); }
                },
                    el("div", { class: "mc-name" },
                        el("span", { class: "player-dot", style: "background:" + memberColor(m) + ";color:" + memberColor(m) }),
                        displayName(m),
                        !m.isActive && el("span", { class: "badge badge-soft", text: "休止中" })),
                    el("div", { class: "mc-stats" },
                        el("span", { text: "キャラ " + m.characters.length }),
                        el("span", { class: wishCount ? "" : "warn", text: "希望 " + wishCount }),
                        el("span", { text: "配置 " + placed + "PT" })),
                    el("div", { class: "mc-cp", text: m.characters.length ? "最高 " + formatCp(top) : "キャラが未登録です" })
                );
                card.style.setProperty("--member-color", memberColor(m));
                grid.appendChild(card);
            });
            body.appendChild(grid);
        }
        panel.appendChild(body);
        wrap.appendChild(panel);
        return wrap;
    }

    function addMember(name) {
        const v = (name || "").trim();
        if (!v) { toast("Discord名を入力してください", "warn"); return; }
        if (state.members.some((m) => m.discordName === v)) { toast("同じDiscord名が既にあります", "warn"); return; }
        const m = {
            id: uid("m"), discordName: v, displayName: "", isActive: true, note: "",
            colorIdx: state.members.length % MEMBER_COLORS.length, characters: []
        };
        state.members.push(m);
        state.ui.editorMemberId = m.id;
        state.ui.editorCharId = null;
        if (!state.ui.viewerMemberId) state.ui.viewerMemberId = m.id;
        saveState();
        render();
    }

    function memberDetail() {
        const me = memberById(state.ui.editorMemberId);
        if (!me) { state.ui.editorMemberId = null; return memberListView(); }
        const wrap = el("div", { class: "fade-in" });

        wrap.appendChild(el("div", { class: "crumb" },
            el("button", {
                class: "btn", onclick: () => { state.ui.editorMemberId = null; saveState(); render(); }
            }, icon("arrow-left"), "メンバー一覧"),
            el("span", { class: "player-dot", style: "background:" + memberColor(me) + ";color:" + memberColor(me) }),
            el("span", { class: "who", text: displayName(me) })
        ));

        // ---- キャラクター ----
        const panel = el("section", { class: "panel" });
        panel.appendChild(el("div", { class: "panel-head" },
            el("h2", { text: "キャラクター" }),
            el("span", { class: "sub", text: "戦闘力とHEXAは「1.2億」「9800万」のような入力を受け付けます" }),
            el("span", { class: "spacer" }),
            el("button", {
                class: "btn btn-primary", onclick: () => {
                    const c = {
                        id: uid("c"), name: "新しいキャラ", jobId: "",
                        server: ((window.SERVERS || [{}])[0] || {}).id || "kronos",
                        combatPower: 0, hexa: 0, note: "", isActive: true, updatedAt: now()
                    };
                    me.characters.push(c);
                    state.ui.editorCharId = c.id;
                    saveState(); render();
                }
            }, icon("plus"), "キャラを追加")
        ));

        const body = el("div", { class: "panel-body" });
        body.appendChild(el("div", { class: "row", style: "margin-bottom:10px" },
            el("label", { class: "field" }, "Discord名",
                el("input", {
                    type: "text", value: me.discordName, style: "width:170px",
                    onchange: (e) => {
                        const v = e.target.value.trim();
                        if (!v) { toast("Discord名は必須です", "warn"); render(); return; }
                        if (state.members.some((x) => x.id !== me.id && x.discordName === v)) {
                            toast("同じDiscord名が既にあります", "warn"); render(); return;
                        }
                        me.discordName = v; saveState(); render();
                    }
                })),
            el("label", { class: "field" }, "表示名（任意）",
                el("input", {
                    type: "text", value: me.displayName || "", placeholder: "未設定ならDiscord名", style: "width:150px",
                    onchange: (e) => { me.displayName = e.target.value.trim(); saveState(); render(); }
                })),
            el("label", { class: "check", style: "align-self:flex-end;padding-bottom:6px" },
                el("input", {
                    type: "checkbox", checked: me.isActive,
                    onchange: (e) => { me.isActive = e.target.checked; saveState(); render(); }
                }), "活動中"),
            el("span", { class: "spacer" }),
            el("button", {
                class: "btn btn-ghost btn-danger", onclick: async () => {
                    if (!await confirmDialog(displayName(me) + " と、そのキャラ・希望・PT配置をすべて削除します。よろしいですか？")) return;
                    const ids = me.characters.map((c) => c.id);
                    state.wishes = state.wishes.filter((w) => !ids.includes(w.characterId));
                    state.parties.forEach((p) => { p.slots = p.slots.filter((id) => !ids.includes(id)); });
                    state.members = state.members.filter((x) => x.id !== me.id);
                    state.ui.editorMemberId = null;
                    normalize(); saveState(); render();
                }
            }, icon("trash-2"), "このメンバーを削除")
        ));

        if (!me.characters.length) {
            body.appendChild(el("div", { class: "empty-state", text: "キャラがまだありません。「キャラを追加」すると、下に参加希望の入力欄が出ます。" }));
        } else {
            const grid = el("div", { class: "char-grid" });
            me.characters.forEach((c) => grid.appendChild(charCard(me, c)));
            body.appendChild(grid);
        }
        panel.appendChild(body);
        wrap.appendChild(panel);

        // ---- 参加希望 ----
        if (me.characters.length) {
            if (!me.characters.some((c) => c.id === state.ui.editorCharId)) {
                state.ui.editorCharId = me.characters[0].id;
            }
            const target = me.characters.find((c) => c.id === state.ui.editorCharId);

            const wp = el("section", { class: "panel" });
            wp.appendChild(el("div", { class: "panel-head" },
                el("h2", { text: "参加希望" }),
                el("span", { class: "sub", text: "ボスごとに行きたい難易度を選びます。押すたびに入／切が変わり、複数選べます" })
            ));
            const wb = el("div", { class: "panel-body" });

            const tabs = el("div", { class: "char-tabs" });
            me.characters.forEach((c) => {
                const n = state.wishes.filter((w) => w.characterId === c.id).length;
                tabs.appendChild(el("button", {
                    class: "char-tab", "aria-pressed": String(c.id === state.ui.editorCharId),
                    onclick: () => { state.ui.editorCharId = c.id; saveState(); render(); }
                },
                    charIconNode(c, "icon"),
                    c.name,
                    el("span", { class: "ct-sub", text: n ? "希望 " + n : "希望なし" })));
            });
            wb.appendChild(tabs);
            wb.appendChild(wishRows(me, target));
            wp.appendChild(wb);
            wrap.appendChild(wp);
        }
        return wrap;
    }

    function charCard(member, c) {
        const card = el("div", { class: "char-card" + (c.isActive ? "" : " inactive") });
        const touch = () => { c.updatedAt = now(); };

        card.appendChild(el("div", { class: "cc-top" },
            charIconNode(c, "char-icon"),
            el("input", {
                class: "cc-name", type: "text", value: c.name, "aria-label": "キャラ名",
                onchange: (e) => { c.name = e.target.value.trim() || c.name; touch(); saveState(); render(); }
            }),
            el("label", { class: "check" },
                el("input", {
                    type: "checkbox", checked: c.isActive,
                    onchange: (e) => { c.isActive = e.target.checked; saveState(); render(); }
                }), "使用中"),
            el("button", {
                class: "btn btn-ghost btn-danger btn-icon", title: "このキャラを削除",
                onclick: async () => {
                    if (!await confirmDialog(c.name + " を削除します。希望とPT配置も消えます。")) return;
                    state.wishes = state.wishes.filter((w) => w.characterId !== c.id);
                    state.parties.forEach((p) => { p.slots = p.slots.filter((id) => id !== c.id); });
                    member.characters = member.characters.filter((x) => x.id !== c.id);
                    saveState(); render();
                }
            }, icon("x", "w-3.5 h-3.5"))
        ));

        card.appendChild(el("div", { class: "cc-fields" },
            el("label", { class: "field" }, "職業",
                jobSelect(c.jobId, (e) => { c.jobId = e.target.value; touch(); saveState(); render(); })),
            el("label", { class: "field" }, "サーバー",
                serverSelect(c.server, (e) => { c.server = e.target.value; saveState(); render(); })),
            el("label", { class: "field" }, "戦闘力",
                el("input", {
                    type: "text", value: c.combatPower ? formatCp(c.combatPower) : "", placeholder: "例: 1.2億",
                    onchange: (e) => { c.combatPower = parseCp(e.target.value); touch(); saveState(); render(); }
                })),
            el("label", { class: "field" }, "HEXA",
                el("input", {
                    type: "text", value: c.hexa ? formatCp(c.hexa) : "", placeholder: "例: 4200万",
                    onchange: (e) => { c.hexa = parseCp(e.target.value); touch(); saveState(); render(); }
                })),
            el("label", { class: "field wide" }, "備考",
                el("input", {
                    type: "text", value: c.note || "", placeholder: "例: 火力枠 / 練習中",
                    onchange: (e) => { c.note = e.target.value; saveState(); render(); }
                }))
        ));

        const wishCount = state.wishes.filter((w) => w.characterId === c.id).length;
        card.appendChild(el("div", { class: "cc-foot" },
            el("span", { class: "badge badge-soft", text: "希望 " + wishCount }),
            el("span", { class: "cc-ranks" },
                el("a", { href: "https://mapleranks.com/u/" + encodeURIComponent(c.name), target: "_blank", rel: "noopener noreferrer", text: "MapleRanks" })),
            el("span", { class: "spacer" }),
            el("span", { class: "cc-ranks", text: "更新 " + (c.updatedAt || "").slice(0, 10) })
        ));
        return card;
    }

    function wishRows(member, c) {
        const wrap = el("div");
        const mine = state.wishes.filter((w) => w.characterId === c.id);
        const bossCount = bossList().filter((b) => b.difficulties.some((d) => wishOf(c.id, b.id, d))).length;

        wrap.appendChild(el("div", { class: "wish-summary" },
            el("span", { text: c.name + " の希望： " + bossCount + "ボス / " + mine.length + "件" }),
            el("span", { class: "spacer" }),
            mine.length > 0 && el("button", {
                class: "btn btn-ghost btn-xs", onclick: () => {
                    state.wishes = state.wishes.filter((w) => w.characterId !== c.id);
                    toast(c.name + " の希望をすべて消しました");
                    saveState(); render();
                }
            }, "すべて解除")
        ));

        const rows = el("div", { class: "wish-rows" });
        bossList().forEach((b) => {
            const row = el("div", { class: "wish-row" });
            row.appendChild(el("div", { class: "wr-boss" },
                bossIconNode(b, "sm"),
                el("div", {},
                    el("div", { class: "wr-boss-name", text: b.name }),
                    el("span", { class: "wr-cap", text: "最大 " + b.maxMembers + "人" }))
            ));

            const chips = el("div", { class: "wr-chips" });
            b.difficulties.forEach((d) => {
                const on = !!wishOf(c.id, b.id, d);
                chips.appendChild(el("button", {
                    class: "chip" + (on ? " on" : ""), "data-d": d,
                    title: b.name + " " + diffLabelJa(d) + (on ? "：行きたい" : "：希望なし"),
                    onclick: () => { toggleWish(member, c.id, b.id, d); saveState(); render(); }
                }, diffLabelJa(d), on && el("span", { class: "mark", text: "✓" })));
            });
            row.appendChild(chips);

            // この難易度のPTに既に入っているかを右端に出す（希望と配置のずれが見える）
            const placed = seasonParties().find((p) => p.bossId === b.id && p.slots.includes(c.id));
            const picked = b.difficulties.some((d) => wishOf(c.id, b.id, d));
            row.appendChild(el("div", {
                class: "wr-state" + (placed ? " placed" : (picked ? " on" : "")),
                text: placed ? diffLabelJa(placed.difficulty) + "に配置" : (picked ? "希望あり" : "—")
            }));
            rows.appendChild(row);
        });
        wrap.appendChild(rows);
        return wrap;
    }

    function toggleWish(member, characterId, bossId, difficulty) {
        const ex = wishOf(characterId, bossId, difficulty);
        if (ex) { state.wishes = state.wishes.filter((w) => w !== ex); return; }
        state.wishes.push({
            characterId, bossId, difficulty, note: "",
            updatedBy: member ? member.id : null, updatedAt: now()
        });
    }

    // ============================================================
    //  ② 編成編集
    // ============================================================
    function renderBuilder() {
        renderBuilderBar();
        renderCandidatePane();
        renderPartyPane();
    }

    function renderBuilderBar() {
        const bar = $("#builder-bar");
        bar.textContent = "";
        const b = bossById(state.ui.bossId);

        bar.appendChild(el("span", { class: "bar-label", text: "Boss" }));
        const chips = el("div", { class: "boss-chip-list" });
        bossList().forEach((x) => {
            const n = partiesOf(x.id, null).length;
            const chip = el("button", {
                class: "boss-chip" + (x.id === state.ui.bossId ? " active" : ""),
                onclick: () => {
                    state.ui.bossId = x.id;
                    // 難しい方から組めるよう、初期選択は最も難しい難易度にする
                    state.ui.difficulty = x.difficulties[x.difficulties.length - 1];
                    state.ui.selectedCharId = null;
                    saveState(); render();
                }
            }, bossIconNode(x, "sm"), x.name, n ? el("span", { class: "chip-count", text: String(n) }) : null);
            chip.style.setProperty("--boss-color", x.color || "#6366f1");
            chips.appendChild(chip);
        });
        bar.appendChild(chips);

        bar.appendChild(el("span", { class: "builder-sep" }));
        bar.appendChild(el("span", { class: "bar-label", text: "難易度" }));
        const diffs = el("div", { class: "diff-select" });
        b.difficulties.forEach((d) => {
            const cands = candidateRows(b.id, d).length;
            diffs.appendChild(el("button", {
                class: "diff-btn" + (d === state.ui.difficulty ? " active" : ""),
                title: "希望者 " + cands + "人 / PT " + partiesOf(b.id, d).length,
                onclick: () => { state.ui.difficulty = d; state.ui.selectedCharId = null; saveState(); render(); }
            }, diffLabelJa(d), el("span", { class: "dcount", text: partiesOf(b.id, d).length + "PT・希望" + cands })));
        });
        bar.appendChild(diffs);

        bar.appendChild(el("span", { class: "spacer" }));
        bar.appendChild(el("span", { class: "bar-label", text: "最大 " + b.maxMembers + "人" }));
        bar.appendChild(el("button", {
            class: "btn btn-primary", onclick: () => {
                const list = partiesOf(state.ui.bossId, state.ui.difficulty);
                state.parties.push({
                    id: uid("p"), seasonId: currentSeason().id,
                    bossId: state.ui.bossId, difficulty: state.ui.difficulty,
                    label: "PT" + (list.length + 1), slots: [], status: "draft", memo: "", createdAt: now()
                });
                saveState(); render();
            }
        }, icon("plus"), "PT枠を追加"));
    }

    // 候補（選択中の Boss × 難易度 に希望を出しているキャラ）
    function candidateRows(bossId, difficulty) {
        const here = partiesOf(bossId, difficulty);
        const placedHere = new Set(here.flatMap((p) => p.slots));
        const q = (state.ui.candSearch || "").trim().toLowerCase();
        const rows = [];
        allChars().forEach((c) => {
            if (!c.isActive) return;
            const m = memberById(c.memberId);
            if (!m || !m.isActive) return;
            if (!wishOf(c.id, bossId, difficulty)) return;
            if (placedHere.has(c.id)) return;              // R6: この難易度のPTに入れたら候補から消す
            if (q && !(c.name.toLowerCase().includes(q) || displayName(m).toLowerCase().includes(q))) return;
            // R2: 同じボスの別難易度に配置済みなら、掴めない形で残す（理由が見える）
            const elsewhere = seasonParties().find((p) => p.bossId === bossId && p.slots.includes(c.id));
            const top = hardestWish(c.id, bossId);
            const upper = (!elsewhere && top && diffRank(bossId, top) > diffRank(bossId, difficulty)) ? top : null;
            rows.push({ c, m, elsewhere, upper });
        });
        // 上位難易度にも希望を出している人を先に。難しい方から埋めるための並び。
        rows.sort((a, b) =>
            (b.upper ? 1 : 0) - (a.upper ? 1 : 0) ||
            ((b.c[state.ui.sortKey] || 0) - (a.c[state.ui.sortKey] || 0)));
        return rows;
    }

    function renderCandidatePane() {
        const pane = $("#cand-pane");
        pane.textContent = "";
        const b = bossById(state.ui.bossId);
        const d = state.ui.difficulty;

        pane.appendChild(el("div", { class: "col-header", text: "希望を出している人" }));
        pane.appendChild(el("p", { class: "hint" },
            "カードを押して選び、PTの「ここに追加」で配置します。ドラッグでも動かせます。難しい難易度から先に組むと取りこぼしが減ります。"));

        // 検索欄はここで作り直されるため、入力中だったらフォーカスとカーソル位置を戻す
        const searchWasFocused = document.activeElement && document.activeElement.id === "cand-search";
        pane.appendChild(el("div", { class: "row", style: "margin-bottom:7px" },
            el("input", {
                type: "text", id: "cand-search", value: state.ui.candSearch || "",
                placeholder: "キャラ名・メンバー名で検索",
                style: "flex:1;min-width:110px",
                oninput: (e) => { state.ui.candSearch = e.target.value; renderCandidatePane(); if (window.lucide) window.lucide.createIcons(); }
            }),
            el("select", {
                title: "並べ替え",
                onchange: (e) => { state.ui.sortKey = e.target.value; saveState(); render(); }
            },
                el("option", { value: "combatPower", selected: state.ui.sortKey === "combatPower", text: "戦闘力順" }),
                el("option", { value: "hexa", selected: state.ui.sortKey === "hexa", text: "HEXA順" }))
        ));

        const rows = candidateRows(b.id, d);
        const list = el("div", { class: "cand-list" });
        if (!rows.length) {
            list.appendChild(el("div", { class: "empty-state", text: b.name + " " + diffLabelJa(d) + " に希望を出している人がいません。" }));
        }
        rows.forEach(({ c, m, elsewhere, upper }) => {
            const card = el("div", {
                class: "cand" + (state.ui.selectedCharId === c.id ? " selected" : "") + (elsewhere ? " placed-elsewhere" : ""),
                draggable: elsewhere ? null : "true",
                title: [(classById(c.jobId) || {}).name, c.note].filter(Boolean).join(" / ") || c.name
            });
            card.style.borderLeftColor = memberColor(m);
            if (!elsewhere) {
                card.addEventListener("click", () => {
                    state.ui.selectedCharId = state.ui.selectedCharId === c.id ? null : c.id;
                    render();
                });
                card.addEventListener("dragstart", (e) => {
                    drag = { charId: c.id, fromPartyId: null };
                    try { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
                    card.classList.add("dragging");
                    renderPartyPane();
                });
                card.addEventListener("dragend", () => { drag = null; card.classList.remove("dragging"); render(); });
            }
            card.appendChild(charIconNode(c, "icon"));
            card.appendChild(el("div", { class: "cand-main" },
                el("div", { class: "cand-name", text: c.name }),
                el("div", { class: "cand-meta", text: displayName(m) + (classById(c.jobId) ? " / " + classById(c.jobId).name : "") }),
                upper && el("div", {}, el("span", { class: "upper-badge", text: diffLabelJa(upper) + " にも希望" })),
                elsewhere && el("div", { class: "cand-meta warn", text: diffLabelJa(elsewhere.difficulty) + " の " + (elsewhere.label || "PT") + " に配置済み" })
            ));
            card.appendChild(cpBlock(c));
            list.appendChild(card);
        });
        pane.appendChild(list);

        const back = el("div", { class: "drop-back", text: "PTから外すにはここへドラッグ" });
        back.addEventListener("dragover", (e) => {
            if (drag && drag.fromPartyId) { e.preventDefault(); back.classList.add("hot"); }
        });
        back.addEventListener("dragleave", () => back.classList.remove("hot"));
        back.addEventListener("drop", (e) => {
            e.preventDefault(); back.classList.remove("hot");
            if (drag && drag.fromPartyId) removeFromParty(drag.charId, drag.fromPartyId);
            drag = null;
        });
        pane.appendChild(back);

        if (searchWasFocused) {
            const input = $("#cand-search");
            if (input) {
                input.focus();
                const n = input.value.length;
                try { input.setSelectionRange(n, n); } catch (_) { /* 型によっては未対応 */ }
            }
        }
    }

    function renderPartyPane() {
        const pane = $("#party-pane");
        pane.textContent = "";
        const list = partiesOf(state.ui.bossId, state.ui.difficulty);
        if (!list.length) {
            pane.appendChild(el("div", { class: "empty-state", text: "PT枠がありません。右上の「PT枠を追加」から作ります。" }));
            return;
        }
        const grid = el("div", { class: "party-grid" });
        list.forEach((p) => grid.appendChild(partyCard(p)));
        pane.appendChild(grid);
        if (window.lucide) window.lucide.createIcons();
    }

    function partyCard(p) {
        const b = bossById(p.bossId);
        const active = state.ui.selectedCharId || (drag && drag.charId);
        const check = active ? canPlace(active, p) : null;
        const blocked = check && !check.ok && !(drag && drag.fromPartyId === p.id);

        const card = el("div", { class: "party-card" + (blocked ? " blocked" : "") });
        card.style.setProperty("--diff-color", diffColor(p.difficulty));

        const total = p.slots.reduce((s, id) => s + ((charById(id) || {}).combatPower || 0), 0);

        card.appendChild(el("div", { class: "party-head" },
            el("input", {
                class: "party-name-input", type: "text", value: p.label || "", "aria-label": "PT名",
                onchange: (e) => { p.label = e.target.value; saveState(); render(); }
            }),
            diffBadge(p.difficulty),
            el("span", {
                class: "party-count" + (p.slots.length >= b.maxMembers ? " full" : ""),
                text: p.slots.length + " / " + b.maxMembers
            }),
            el("span", { class: "spacer" }),
            el("button", {
                class: "pill" + (p.status === "published" ? " published" : ""),
                title: "押すと公開／下書きが切り替わります",
                onclick: () => {
                    p.status = p.status === "published" ? "draft" : "published";
                    toast(p.status === "published" ? "公開しました。ダッシュボードに出ます" : "下書きに戻しました",
                        p.status === "published" ? "ok" : null);
                    saveState(); render();
                }
            }, p.status === "published" ? "公開中" : "下書き")
        ));

        const ul = el("ul", { class: "slots" });
        for (let i = 0; i < b.maxMembers; i++) {
            const id = p.slots[i];
            if (id) {
                const c = charById(id);
                const m = c ? memberById(c.memberId) : null;
                const li = el("li", { class: "slot filled", draggable: "true" });
                li.addEventListener("dragstart", (e) => {
                    drag = { charId: id, fromPartyId: p.id };
                    try { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
                    li.classList.add("dragging");
                });
                li.addEventListener("dragend", () => { drag = null; li.classList.remove("dragging"); render(); });
                li.appendChild(el("span", { class: "slot-no", text: String(i + 1) }));
                li.appendChild(charIconNode(c, "icon"));
                li.appendChild(el("div", { class: "slot-body" },
                    el("div", { class: "slot-name" },
                        el("a", {
                            href: "https://mapleranks.com/u/" + encodeURIComponent(c ? c.name : ""),
                            target: "_blank", rel: "noopener noreferrer", text: c ? c.name : "(不明)"
                        })),
                    el("div", { class: "slot-owner", text: displayName(m) })));
                li.appendChild(cpBlock(c, "slot-cp"));
                li.appendChild(el("button", {
                    class: "slot-x", title: "PTから外す", onclick: () => removeFromParty(id, p.id)
                }, icon("x", "w-3 h-3")));
                ul.appendChild(li);
            } else {
                const li = el("li", { class: "slot empty" },
                    el("span", { class: "slot-no", text: String(i + 1) }),
                    el("span", { class: "slot-body", text: "空き" }));
                if (state.ui.selectedCharId && check && check.ok) {
                    li.appendChild(el("button", {
                        class: "add-here",
                        onclick: () => placeChar(state.ui.selectedCharId, p.id, null)
                    }, "ここに追加"));
                }
                ul.appendChild(li);
            }
        }
        card.appendChild(ul);

        if (blocked) card.appendChild(el("div", { class: "block-reason", text: check.reason }));

        card.appendChild(el("div", { class: "party-foot" },
            el("span", {}, "合計 ", el("strong", { text: formatCp(total) }),
                p.slots.length ? " / 平均 " + formatCp(Math.round(total / p.slots.length)) : ""),
            el("input", {
                class: "party-memo", type: "text", value: p.memo || "", placeholder: "周知メモ（集合場所・時間など）",
                onchange: (e) => { p.memo = e.target.value; saveState(); render(); }
            }),
            el("button", {
                class: "btn btn-ghost btn-danger btn-icon", title: "このPTを削除",
                onclick: async () => {
                    if (p.slots.length && !await confirmDialog((p.label || "このPT") + " を削除します。よろしいですか？")) return;
                    state.parties = state.parties.filter((x) => x.id !== p.id);
                    saveState(); render();
                }
            }, icon("trash-2", "w-3 h-3"))
        ));

        // ---- drop target ----
        card.addEventListener("dragover", (e) => {
            if (!drag) return;
            if (drag.fromPartyId !== p.id) {
                const v = canPlace(drag.charId, p);
                if (!v.ok) return;
            }
            e.preventDefault();
            card.classList.add("hot");
        });
        card.addEventListener("dragleave", () => card.classList.remove("hot"));
        card.addEventListener("drop", (e) => {
            e.preventDefault(); card.classList.remove("hot");
            if (!drag) return;
            const d = drag; drag = null;
            if (d.fromPartyId === p.id) { render(); return; }
            placeChar(d.charId, p.id, d.fromPartyId);
        });
        return card;
    }

    // ============================================================
    //  ③ ダッシュボード
    // ============================================================
    function renderDashboard() {
        const root = $("#dash-root");
        root.textContent = "";
        const ui = state.ui;
        const viewer = memberById(ui.viewerMemberId) || state.members[0] || null;
        ui.viewerMemberId = viewer ? viewer.id : null;

        const shown = seasonParties().filter((p) => ui.includeDraft || p.status === "published");

        // ---- A. 自分の所属PT ----
        const hero = el("section", { class: "dash-hero" });
        const head = el("div", { class: "dash-hero-head" },
            icon("user-check", "w-4 h-4 text-indigo-300"),
            el("h2", { text: "自分の所属PT" }),
            el("span", { class: "spacer" }));
        if (state.members.length) {
            head.appendChild(el("select", {
                onchange: (e) => { ui.viewerMemberId = e.target.value; saveState(); render(); }
            }, state.members.map((m) => el("option", { value: m.id, selected: viewer && m.id === viewer.id, text: displayName(m) }))));
        }
        hero.appendChild(head);

        if (!viewer) {
            hero.appendChild(el("div", { class: "hero-empty", text: "メンバーがまだ登録されていません。" }));
        } else {
            const myIds = viewer.characters.map((c) => c.id);
            const mine = shown.filter((p) => p.slots.some((id) => myIds.includes(id)))
                .sort((a, b) => bossList().findIndex((x) => x.id === a.bossId) - bossList().findIndex((x) => x.id === b.bossId));
            if (!mine.length) {
                hero.appendChild(el("div", { class: "hero-empty", text: "公開されている編成に、あなたのキャラはまだ入っていません。希望を出しておくと、空きが出たときに声がかかります。" }));
            } else {
                const g = el("div", { class: "mine-grid" });
                mine.forEach((p) => {
                    const b = bossById(p.bossId);
                    const myChar = charById(p.slots.find((id) => myIds.includes(id)));
                    const mates = p.slots.filter((id) => id !== myChar.id).map((id) => {
                        const c = charById(id);
                        return c ? c.name + "（" + displayName(memberById(c.memberId)) + "）" : "?";
                    });
                    const box = el("div", { class: "mine" },
                        el("div", { class: "mine-boss" }, bossIconNode(b, "sm"), b.name, diffBadge(p.difficulty),
                            p.status === "draft" ? el("span", { class: "badge badge-soft", text: "下書き" }) : null),
                        el("div", { class: "mine-who", text: (p.label || "PT") + " / " + myChar.name + " で参加" }),
                        el("div", { class: "mine-mates", text: mates.length ? "一緒に行く人: " + mates.join("、") : "他のメンバーは未定" }),
                        p.memo && el("div", { class: "mine-memo", text: "メモ: " + p.memo }));
                    box.style.setProperty("--diff-color", diffColor(p.difficulty));
                    g.appendChild(box);
                });
                hero.appendChild(g);
            }
        }
        root.appendChild(hero);

        // ---- B. 編成全体 ----
        const all = el("section", { class: "panel" });
        const allHead = el("div", { class: "panel-head" },
            el("h2", { text: "編成全体" }),
            el("span", { class: "sub", text: ui.includeDraft ? "下書きも表示しています" : "公開されているPTのみ表示しています" }),
            el("span", { class: "spacer" }),
            el("label", { class: "check" },
                el("input", {
                    type: "checkbox", checked: ui.includeDraft,
                    onchange: (e) => { ui.includeDraft = e.target.checked; saveState(); render(); }
                }), "下書きも表示"));
        all.appendChild(allHead);

        const allBody = el("div", { class: "panel-body" });
        // ボス絞り込みチップ（既存ダッシュボードのフィルタを踏襲）
        const filter = el("div", { class: "boss-chip-list", style: "margin-bottom:10px" });
        const allChip = el("button", {
            class: "boss-chip" + (ui.dashBossIds.length ? "" : " active"),
            onclick: () => { ui.dashBossIds = []; saveState(); render(); }
        }, "すべて");
        filter.appendChild(allChip);
        bossList().forEach((b) => {
            const n = shown.filter((p) => p.bossId === b.id).length;
            const chip = el("button", {
                class: "boss-chip" + (ui.dashBossIds.includes(b.id) ? " active" : ""),
                onclick: () => {
                    ui.dashBossIds = ui.dashBossIds.includes(b.id)
                        ? ui.dashBossIds.filter((x) => x !== b.id)
                        : ui.dashBossIds.concat(b.id);
                    saveState(); render();
                }
            }, bossIconNode(b, "sm"), b.name, n ? el("span", { class: "chip-count", text: String(n) }) : null);
            chip.style.setProperty("--boss-color", b.color || "#6366f1");
            filter.appendChild(chip);
        });
        allBody.appendChild(filter);

        const visibleBosses = bossList().filter((b) => !ui.dashBossIds.length || ui.dashBossIds.includes(b.id));
        if (!shown.length) {
            allBody.appendChild(el("div", { class: "empty-state", text: "表示できる編成がありません。編成編集でPTを組み、「下書き」を押して公開してください。" }));
        } else {
            const grid = el("div", { class: "boss-grid" });
            visibleBosses.forEach((b) => {
                const ps = shown.filter((p) => p.bossId === b.id)
                    .sort((x, y) => b.difficulties.indexOf(y.difficulty) - b.difficulties.indexOf(x.difficulty));
                grid.appendChild(dashBossCard(b, ps, viewer));
            });
            allBody.appendChild(grid);
        }
        all.appendChild(allBody);
        root.appendChild(all);

        // ---- C. 空き枠と未配置の希望者 ----
        root.appendChild(gapPanel(shown));

        // ---- D. テキスト出力 ----
        root.appendChild(textPanel());
    }

    function dashBossCard(b, parties, viewer) {
        const card = el("div", { class: "boss-card" + (parties.length ? "" : " empty") });
        card.style.setProperty("--boss-color", b.color || "#6366f1");

        const filled = parties.reduce((s, p) => s + p.slots.length, 0);
        const cap = parties.length * b.maxMembers;
        card.appendChild(el("div", { class: "boss-head" },
            bossIconNode(b, "lg"),
            el("div", { class: "boss-head-info" },
                el("div", { class: "boss-title" }, el("span", { class: "boss-title-name", text: b.name })),
                el("div", { class: "boss-subtitle" },
                    el("span", { text: parties.length + " PT · " + filled + "/" + cap + "人 · 上限 " + b.maxMembers + "人" }))),
            el("button", {
                class: "btn btn-xs", title: "このボスの編成を開く",
                onclick: () => {
                    state.ui.bossId = b.id;
                    state.ui.difficulty = parties.length ? parties[0].difficulty : b.difficulties[b.difficulties.length - 1];
                    switchScreen("builder");
                }
            }, icon("edit-3", "w-3 h-3"), "編成")
        ));

        if (!parties.length) {
            card.appendChild(el("div", { class: "boss-empty-hint", text: "PT未設定" }));
            return card;
        }

        const myIds = viewer ? viewer.characters.map((c) => c.id) : [];
        const strip = el("div", { class: "parties-strip" });
        parties.forEach((p, idx) => {
            const wrap = el("div", { class: "party-mini" });
            const total = p.slots.reduce((s, id) => s + ((charById(id) || {}).combatPower || 0), 0);
            wrap.appendChild(el("div", { class: "party-mini-head" },
                el("span", { class: "party-mini-letter", text: String.fromCharCode(65 + idx) }),
                diffBadge(p.difficulty),
                el("span", { class: "party-mini-name", text: p.label || "PT" }),
                p.status === "draft" ? el("span", { class: "badge badge-soft", text: "下書き" }) : null
            ));

            const body = el("div", { class: "party-mini-members" });
            for (let i = 0; i < b.maxMembers; i++) {
                const id = p.slots[i];
                if (id) {
                    const c = charById(id);
                    const m = c ? memberById(c.memberId) : null;
                    const row = el("div", { class: "party-mini-member" + (myIds.includes(id) ? " me" : "") },
                        charIconNode(c, "mini-icon"),
                        el("span", { class: "pmm-name", text: c ? c.name : "(不明)" }),
                        el("span", { class: "pmm-owner", text: displayName(m) }),
                        state.ui.includeCp && el("span", { class: "pmm-cp", text: formatCp(c && c.combatPower) }));
                    body.appendChild(row);
                } else {
                    body.appendChild(el("div", { class: "party-mini-member vacant" },
                        el("span", { class: "mini-icon" }, icon("user-plus", "w-3 h-3")),
                        el("span", { class: "pmm-vacant", text: "空き" })));
                }
            }
            wrap.appendChild(body);
            if (p.memo) wrap.appendChild(el("div", { class: "party-mini-memo", text: p.memo }));
            wrap.appendChild(el("div", { class: "party-mini-total" },
                p.slots.length + "/" + b.maxMembers + "人 · 合計 ", el("strong", { text: formatCp(total) })));
            strip.appendChild(wrap);
        });
        card.appendChild(strip);
        return card;
    }

    function gapPanel(shown) {
        const panel = el("section", { class: "panel" });
        panel.appendChild(el("div", { class: "panel-head" },
            el("h2", { text: "空き枠と、まだ入れていない人" }),
            el("span", { class: "sub", text: "表示している難易度は、その人が希望した中で最も難しいものです" })
        ));
        const body = el("div", { class: "panel-body" });
        const grid = el("div", { class: "gap-grid" });

        // --- 空きのあるPT ---
        const left = el("div");
        const vac = shown.filter((p) => p.slots.length < bossById(p.bossId).maxMembers);
        left.appendChild(el("div", { class: "col-header", text: "空きのあるPT（" + vac.length + "）" }));
        if (!vac.length) {
            left.appendChild(el("div", { class: "empty-state", text: "空き枠はありません。" }));
        } else {
            const list = el("div", { class: "gap-list" });
            vac.forEach((p) => {
                const b = bossById(p.bossId);
                list.appendChild(el("div", { class: "gap-row" },
                    bossIconNode(b, "sm"),
                    el("span", { class: "gr-name", text: b.name }),
                    diffBadge(p.difficulty),
                    el("span", { class: "gr-sub", text: (p.label || "PT") + " / あと " + (b.maxMembers - p.slots.length) + "人" }),
                    el("span", { class: "spacer" }),
                    el("button", {
                        class: "btn btn-xs", onclick: () => {
                            state.ui.bossId = p.bossId; state.ui.difficulty = p.difficulty;
                            switchScreen("builder");
                        }
                    }, "開く")));
            });
            left.appendChild(list);
        }
        grid.appendChild(left);

        // --- 未配置の希望者（キャラ×ボス単位、難易度は希望の最上位） ---
        const right = el("div");
        const placedKeys = new Set(seasonParties().flatMap((p) => p.slots.map((id) => id + "|" + p.bossId)));
        const seen = new Set();
        const unplaced = [];
        state.wishes.forEach((w) => {
            const key = w.characterId + "|" + w.bossId;
            if (seen.has(key)) return;
            seen.add(key);
            if (placedKeys.has(key)) return;
            const c = charById(w.characterId);
            if (!c || !c.isActive) return;
            const m = memberById(c.memberId);
            if (!m || !m.isActive) return;
            const top = hardestWish(c.id, w.bossId);
            if (!top) return;
            unplaced.push({ c, m, bossId: w.bossId, difficulty: top });
        });
        unplaced.sort((a, b) =>
            bossList().findIndex((x) => x.id === a.bossId) - bossList().findIndex((x) => x.id === b.bossId) ||
            diffRank(b.bossId, b.difficulty) - diffRank(a.bossId, a.difficulty) ||
            (b.c.combatPower || 0) - (a.c.combatPower || 0));

        right.appendChild(el("div", { class: "col-header", text: "希望を出しているのに、どのPTにも入っていない人（" + unplaced.length + "）" }));
        if (!unplaced.length) {
            right.appendChild(el("div", { class: "empty-state", text: "取りこぼしはありません。" }));
        } else {
            const list = el("div", { class: "gap-list" });
            unplaced.forEach(({ c, m, bossId, difficulty }) => {
                const b = bossById(bossId);
                list.appendChild(el("div", { class: "gap-row" },
                    bossIconNode(b, "sm"),
                    el("span", { class: "gr-sub", style: "flex:0 0 auto", text: b.name }),
                    diffBadge(difficulty),
                    el("span", { class: "gr-name", style: "flex:1;min-width:0", text: c.name }),
                    el("span", { class: "gr-sub", text: displayName(m) }),
                    el("span", { class: "gr-cp", text: formatCp(c.combatPower) }),
                    el("button", {
                        class: "btn btn-xs", onclick: () => {
                            state.ui.bossId = bossId; state.ui.difficulty = difficulty;
                            state.ui.selectedCharId = c.id;
                            switchScreen("builder");
                        }
                    }, "編成へ")));
            });
            right.appendChild(list);
        }
        grid.appendChild(right);

        body.appendChild(grid);
        panel.appendChild(body);
        return panel;
    }

    function textPanel() {
        const ui = state.ui;
        const panel = el("section", { class: "panel" });
        panel.appendChild(el("div", { class: "panel-head" },
            el("h2", { text: "Discord用のテキスト" }),
            el("span", { class: "spacer" }),
            el("select", {
                title: "出力するボス",
                onchange: (e) => { ui.outBossId = e.target.value; saveState(); render(); }
            },
                el("option", { value: "", selected: !ui.outBossId, text: "すべてのボス" }),
                bossList().map((b) => el("option", { value: b.id, selected: ui.outBossId === b.id, text: b.name }))),
            el("label", { class: "check" },
                el("input", {
                    type: "checkbox", checked: ui.includeCp,
                    onchange: (e) => { ui.includeCp = e.target.checked; saveState(); render(); }
                }), "戦闘力・HEXAを含める"),
            el("label", { class: "check" },
                el("input", {
                    type: "checkbox", checked: ui.includeDraft,
                    onchange: (e) => { ui.includeDraft = e.target.checked; saveState(); render(); }
                }), "下書きも含める"),
            el("button", { class: "btn btn-primary", onclick: () => copyText(buildText()) }, icon("copy"), "コピー")
        ));
        panel.appendChild(el("div", { class: "panel-body" },
            el("textarea", { class: "out-text", readonly: true }, buildText())));
        return panel;
    }

    function buildText() {
        const ui = state.ui;
        const ps = seasonParties().filter((p) =>
            (ui.includeDraft || p.status === "published") && (!ui.outBossId || p.bossId === ui.outBossId));
        const lines = ["■ 週ボスPT編成" + (currentSeason().name ? "（" + currentSeason().name + "）" : "")];
        bossList().forEach((b) => {
            b.difficulties.forEach((d) => {
                const list = ps.filter((p) => p.bossId === b.id && p.difficulty === d);
                if (!list.length) return;
                lines.push("");
                lines.push("【" + b.name + " " + diffLabelJa(d) + "】");
                list.forEach((p) => {
                    lines.push((p.label || "PT") + (p.status === "draft" ? "（下書き）" : ""));
                    for (let i = 0; i < b.maxMembers; i++) {
                        const id = p.slots[i];
                        if (!id) { lines.push(" " + (i + 1) + ". 空き"); continue; }
                        const c = charById(id);
                        const m = c ? memberById(c.memberId) : null;
                        let line = " " + (i + 1) + ". " + (c ? c.name : "(不明)") + " (" + displayName(m) + ")";
                        if (ui.includeCp && c && c.combatPower) {
                            line += " " + formatCp(c.combatPower) + (c.hexa ? " / H" + formatCp(c.hexa) : "");
                        }
                        lines.push(line);
                    }
                    if (p.memo) lines.push(" ※ " + p.memo);
                });
            });
        });
        if (lines.length === 1) lines.push("", "（表示できる編成がありません）");
        return lines.join("\n");
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                () => toast("コピーしました", "ok"),
                () => toast("コピーできませんでした。テキストを選んでコピーしてください", "warn"));
        } else {
            toast("コピーできませんでした。テキストを選んでコピーしてください", "warn");
        }
    }

    // ============================================================
    //  データ入出力
    // ============================================================
    function serialize() {
        return {
            version: VERSION,
            exportedAt: now(),
            seasons: state.seasons,
            members: state.members,
            wishes: state.wishes,
            parties: state.parties
        };
    }
    const exportJson = () => JSON.stringify(serialize(), null, 2);

    function loadJson(text) {
        let obj;
        try { obj = JSON.parse(text); }
        catch (e) { toast("JSONとして読めませんでした", "warn"); return; }
        if (!obj || !Array.isArray(obj.members)) {
            toast("形式が違います。members が必要です", "warn"); return;
        }
        state.seasons = Array.isArray(obj.seasons) && obj.seasons.length
            ? obj.seasons
            : [{ id: uid("s"), name: "シーズン1", isCurrent: true, note: "", createdAt: now() }];
        state.members = obj.members;
        state.wishes  = Array.isArray(obj.wishes) ? obj.wishes : [];
        state.parties = Array.isArray(obj.parties) ? obj.parties : [];
        state.ui.editorMemberId = null;
        state.ui.editorCharId = null;
        state.ui.selectedCharId = null;
        normalize(); saveState(); render();
        toast("読み込みました", "ok");
    }

    // 動作を確かめるためのサンプル（20人規模）。
    // 乱数は固定シードなので、何度入れ直しても同じ顔ぶれになる。
    // 初期PTは R1（PT内のメンバー重複）/ R2（同一ボスの重複）/ R4（サーバー混在）を
    // 守った形で埋め、補充の練習ができるよう一部に空きと下書きを残している。
    function sampleData() {
        let seed = 20260831;
        const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const pick = (a) => a[Math.floor(rnd() * a.length)];

        const jobIds = allClasses().map((c) => c.id);
        const names = [
            "ゆき", "そら", "かえで", "はると", "みお", "りく", "なぎ", "ひなた", "つむぎ", "こはる",
            "あおい", "れん", "いつき", "ののか", "たくみ", "さくら", "ゆうと", "みなも", "けい", "ましろ"
        ];
        const serverIds = (window.SERVERS || [{ id: "kronos" }]).map((s) => s.id);
        const NOTES = ["", "", "", "火力枠", "サポート可", "初回なので教えてほしい", "遅れる日あり"];

        const members = names.map((n, i) => {
            // 3キャラ持ちが6人、2キャラが8人、1キャラが6人。実際の分布に近づけている。
            const count = i < 6 ? 3 : (i < 14 ? 2 : 1);
            // サーバーはメンバー単位で決める。1人が両サーバーに跨ることは稀なため。
            const home = i % 4 === 3 ? serverIds[serverIds.length - 1] : serverIds[0];
            const chars = [];
            for (let k = 0; k < count; k++) {
                // 本命ほど強い。2番目以降は本命の6〜9割程度。
                const base = Math.round(4000 + rnd() * 26000) * 10000;
                const cp = k === 0 ? base : Math.round(base * (0.6 + rnd() * 0.3));
                chars.push({
                    id: "c_" + i + "_" + k,
                    name: n + ["A", "B", "C"][k],
                    jobId: jobIds.length ? pick(jobIds) : "",
                    server: home,
                    combatPower: cp,
                    hexa: Math.round(cp * (0.22 + rnd() * 0.3)),
                    note: pick(NOTES),
                    isActive: true,
                    updatedAt: now()
                });
            }
            return {
                id: "m_" + i, discordName: n, displayName: "",
                // 20人のうち2人は休止中。候補から外れることを確かめられる。
                isActive: !(i === 12 || i === 18),
                note: "", colorIdx: i % MEMBER_COLORS.length, characters: chars
            };
        });

        const wishes = [];
        members.forEach((m) => m.characters.forEach((c) => {
            bossList().forEach((b) => {
                b.difficulties.forEach((d) => {
                    const strong = c.combatPower > 150000000;
                    const hardish = (d === "EXTREME" || d === "HARD" || d === "CHAOS");
                    const chance = hardish ? (strong ? 0.5 : 0.18) : 0.42;
                    if (rnd() > chance) return;
                    wishes.push({ characterId: c.id, bossId: b.id, difficulty: d, note: "", updatedBy: m.id, updatedAt: now() });
                });
            });
        }));

        const season = { id: "s_1", name: "2026年 夏シーズン", isCurrent: true, note: "", createdAt: now() };
        const plan = [
            { bossId: "kaling",    difficulty: "HARD",    label: "PT1", status: "published", memo: "連絡は週ボスチャンネルで", vacancy: 0 },
            { bossId: "kaling",    difficulty: "HARD",    label: "PT2", status: "published", memo: "", vacancy: 1 },
            { bossId: "kaling",    difficulty: "NORMAL",  label: "PT1", status: "published", memo: "初参加の人はこちら", vacancy: 1 },
            { bossId: "kalos",     difficulty: "CHAOS",   label: "PT1", status: "published", memo: "", vacancy: 0 },
            { bossId: "seren",     difficulty: "EXTREME", label: "PT1", status: "published", memo: "", vacancy: 2 },
            { bossId: "limbo",     difficulty: "HARD",    label: "PT1", status: "published", memo: "", vacancy: 0 },
            { bossId: "limbo",     difficulty: "NORMAL",  label: "PT1", status: "published", memo: "", vacancy: 1 },
            { bossId: "adversary", difficulty: "HARD",    label: "PT1", status: "published", memo: "", vacancy: 0 },
            { bossId: "baldrix",   difficulty: "NORMAL",  label: "PT1", status: "published", memo: "", vacancy: 1 },
            { bossId: "kyousei",   difficulty: "NORMAL",  label: "PT1", status: "draft",     memo: "人が集まったら公開する", vacancy: 1 },
            { bossId: "jupiter",   difficulty: "HARD",    label: "PT1", status: "draft",     memo: "", vacancy: 2 }
        ];

        const parties = plan.map((p, i) => ({
            id: "p_" + (i + 1), seasonId: season.id, bossId: p.bossId, difficulty: p.difficulty,
            label: p.label, slots: [], status: p.status, memo: p.memo, createdAt: now()
        }));

        const pool = members.filter((m) => m.isActive).flatMap((m) => m.characters.map((c) => ({ c, m })));
        parties.forEach((party, i) => {
            const b = bossById(party.bossId);
            const room = Math.max(1, b.maxMembers - (plan[i].vacancy || 0));
            const cands = pool
                .filter(({ c }) => wishes.some((w) =>
                    w.characterId === c.id && w.bossId === party.bossId && w.difficulty === party.difficulty))
                .sort((a, z) => z.c.combatPower - a.c.combatPower);

            const usedMembers = new Set();
            let server = null;
            for (const { c, m } of cands) {
                if (party.slots.length >= room) break;
                if (usedMembers.has(m.id)) continue;                       // R1
                if (parties.some((p) => p !== party && p.bossId === party.bossId && p.slots.includes(c.id))) continue;  // R2
                if (server && c.server !== server) continue;               // R4
                server = server || c.server;
                usedMembers.add(m.id);
                party.slots.push(c.id);
            }
        });

        return { seasons: [season], members, wishes, parties };
    }

    // ============================================================
    //  画面切り替え / レンダリング
    // ============================================================
    const SCREENS = ["members", "builder", "dashboard"];

    // ホスト（index.html）のトップバーのタブ表示を合わせる
    function syncHostTab(name) {
        try {
            const host = window.parent;
            if (host && host !== window && host.app && host.app.schedulerTabState) {
                host.app.schedulerTabState(name);
            }
        } catch (_) { /* 単体で開いた場合・cross-origin は無視 */ }
    }

    function switchScreen(name) {
        if (!SCREENS.includes(name)) name = "members";
        state.ui.screen = name;
        state.ui.selectedCharId = null;
        saveState();
        syncHostTab(name);
        render();
    }

    function render() {
        const ui = state.ui;
        SCREENS.forEach((s) => {
            const sec = $("#view-" + s);
            if (sec) sec.classList.toggle("hidden", s !== ui.screen);
            const btn = $("#tab-" + s);
            if (btn) {
                btn.classList.toggle("tab-active", s === ui.screen);
                btn.classList.toggle("tab-inactive", s !== ui.screen);
            }
        });

        if (ui.screen === "members") renderMembers();
        else if (ui.screen === "builder") renderBuilder();
        else renderDashboard();

        renderAppBar();
        if (window.lucide) window.lucide.createIcons();
    }

    function renderAppBar() {
        const season = currentSeason();
        const input = $("#season-name");
        if (input && document.activeElement !== input) input.value = season.name || "";
        const chars = allChars().length;
        const published = seasonParties().filter((p) => p.status === "published").length;
        const drafts = seasonParties().length - published;
        $("#app-stats").textContent =
            "メンバー " + state.members.length + " / キャラ " + chars +
            " / 希望 " + state.wishes.length +
            " / 公開PT " + published + (drafts ? "（下書き " + drafts + "）" : "");
    }

    // ============================================================
    //  WIRE
    // ============================================================
    function wire() {
        // ホストのトップバーから叩かれる隠しタブ
        SCREENS.forEach((s) => {
            const btn = $("#tab-" + s);
            if (btn) btn.addEventListener("click", () => switchScreen(s));
        });

        $("#season-name").addEventListener("change", (e) => {
            const s = currentSeason();
            s.name = e.target.value.trim() || "シーズン1";
            saveState(); render();
        });

        // ---- データモーダル ----
        const modal = $("#data-modal");
        const openData = () => {
            $("#json-out").value = exportJson();
            modal.classList.remove("hidden");
            if (window.lucide) window.lucide.createIcons();
        };
        const closeData = () => modal.classList.add("hidden");
        $("#btn-data").addEventListener("click", openData);
        $$("[data-close-data]").forEach((b) => b.addEventListener("click", closeData));
        modal.addEventListener("click", (e) => { if (e.target === modal) closeData(); });

        $("#btn-download").addEventListener("click", () => {
            const blob = new Blob([exportJson()], { type: "application/json" });
            const a = el("a", {
                href: URL.createObjectURL(blob),
                download: "boss-party-" + new Date().toISOString().slice(0, 10) + ".json"
            });
            document.body.appendChild(a); a.click(); a.remove();
            toast("ダウンロードしました", "ok");
        });
        $("#btn-copy-json").addEventListener("click", () => copyText(exportJson()));
        $("#btn-load-text").addEventListener("click", () => {
            const t = $("#json-in").value.trim();
            if (!t) { toast("JSONを貼り付けてください", "warn"); return; }
            loadJson(t); $("#json-out").value = exportJson();
        });
        $("#file-in").addEventListener("change", (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => { loadJson(String(r.result)); $("#json-out").value = exportJson(); };
            r.readAsText(f);
        });
        $("#btn-sample").addEventListener("click", async () => {
            if (!await confirmDialog("今の内容を捨てて、サンプルデータを入れます。よろしいですか？", "入れる")) return;
            const s = sampleData();
            state.seasons = s.seasons; state.members = s.members;
            state.wishes = s.wishes; state.parties = s.parties;
            state.ui.editorMemberId = null; state.ui.viewerMemberId = s.members[0].id;
            normalize(); saveState(); render();
            $("#json-out").value = exportJson();
            toast("サンプルデータを入れました", "ok");
        });
        $("#btn-wipe").addEventListener("click", async () => {
            if (!await confirmDialog("メンバー・希望・編成をすべて削除します。元に戻せません。よろしいですか？")) return;
            const keep = state.ui;
            state = emptyState();
            state.ui = Object.assign(state.ui, { screen: keep.screen });
            normalize(); saveState(); render();
            $("#json-out").value = exportJson();
            toast("すべて削除しました");
        });

        // ドラッグ中にiframe外へ抜けた場合の後始末
        document.addEventListener("dragend", () => { if (drag) { drag = null; render(); } });

        // ドラッグ中の自動スクロール。候補リストが縦に長いと、掴んだまま
        // PT枠まで運べないため、カーソル位置に応じて内側の器から順に送る。
        // （preventDefault はしない = ドロップ可否の判定は各ドロップ先に任せる）
        document.addEventListener("dragover", (e) => {
            if (!drag) return;
            autoScroll.x = e.clientX; autoScroll.y = e.clientY;
            if (!autoScroll.raf) autoScroll.raf = requestAnimationFrame(autoScrollTick);
        });
    }

    const autoScroll = { x: 0, y: 0, raf: 0 };
    function autoScrollTick() {
        autoScroll.raf = 0;
        if (!drag) return;
        const EDGE = 56, STEP = 16;
        const { x, y } = autoScroll;
        const targets = [$(".cand-list"), $("main")].filter(Boolean);
        for (const box of targets) {
            if (box.scrollHeight <= box.clientHeight) continue;
            const r = box.getBoundingClientRect();
            if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            if (y - r.top < EDGE) box.scrollTop -= STEP;
            else if (r.bottom - y < EDGE) box.scrollTop += STEP;
            break;   // カーソル直下の最も内側の器だけ動かす
        }
        autoScroll.raf = requestAnimationFrame(autoScrollTick);
    }

    // ============================================================
    //  INIT
    // ============================================================
    function init() {
        loadState();
        wire();
        render();
        syncHostTab(state.ui.screen);   // 前回開いていた画面をホストのタブにも反映
        if (window.lucide) window.lucide.createIcons();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
