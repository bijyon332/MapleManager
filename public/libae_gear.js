/* =========================================================
 *  Libae's Gear（サイドバーの Event）
 *  Event World: Quanah の装備「Libae's Supercharged」6部位の [Hologram] スキルラインとジュエルを登録して、
 *  スキルの合計レベル・ジュエルのステータス・ジュエル強化の残り素材（Dust 換算）を出す。
 *  bi がアップロードした単体版（Libae's gear 管理アプリ 公開版、2026-11-08 調査の PTS 情報）を移植（2026-11-09）。
 *
 *  - 上部ヘッダーのタブ（#libae-nav）で 装備管理／ジュエル強化／資料 を切り替える。
 *  - 保存はこのブラウザだけ（mm-libae-gear / mm-libae-settings）。JSON の書き出し・読み込みは単体版と同じ形
 *    （app: 'libae-gear', version: 1）なので、単体版で書き出した JSON をそのまま読み込める。
 *  - 数値（強化コスト・ステータスボーナス）はクライアントデータ、スキルの効果は PTS 時点の情報。
 *    正式実装（GMS 2026-11-11）で変わったら下の定数を直す。
 * ========================================================= */

const libaeGear = (() => {
    'use strict';

    /* ---------- 資料データ（クライアントデータ / PTS 調査 2026-11-08） ---------- */
    const EQUIP_CAP = 3, MASTER_LEVEL = 8, MAX_LINES = 18;
    const SKILL_GROUPS = [
        { id: 'attack', label: 'ジョブ攻撃スキル' },
        { id: 'passive', label: '強化パッシブ' },
        { id: 'exclusive', label: 'Quanah 専用スキル' },
    ];
    const SKILLS = [
        { name: 'Warrior Attack Skill', group: 'attack', label: 'Warrior 攻撃', effect: '通常: Raging Blow / 強化: Worldreaver', note: '強化版は不明な確率で発動（PTS）。ダメージ%は未公開。' },
        { name: 'Magician Attack Skill', group: 'attack', label: 'Magician 攻撃', effect: '通常: Chain Lightning / 強化: Bolt Barrage', note: '強化版は不明な確率で発動（PTS）。ダメージ%は未公開。' },
        { name: 'Bowman Attack Skill', group: 'attack', label: 'Bowman 攻撃', effect: '通常: Snipe / 強化: Ultimate Snipe', note: '強化版は不明な確率で発動（PTS）。ダメージ%は未公開。' },
        { name: 'Thief Attack Skill', group: 'attack', label: 'Thief 攻撃', effect: '通常: Showdown / 強化: Shurikane', note: '綴りはツールチップ表示どおり。強化版は不明な確率で発動（PTS）。' },
        { name: 'Pirate Attack Skill', group: 'attack', label: 'Pirate 攻撃', effect: '通常: Cannon Barrage / 強化: Max Cannon R…', note: '強化版の正式名は唯一のスクリーンショットで途切れており未確定。Banhmi ガイドは Pirate 攻撃を最も強いと評価。' },
        { name: 'Attack Power & Magic ATT Enhancement', group: 'passive', label: '攻撃力＆魔力 強化', effect: '1レベルごとに 攻撃力 +5% / 魔力 +5%（Lv.2 表示: +10% / +10%）', note: '一定スタック数で追加のファイナルダメージが付く（閾値表は Lv.3 以降が未確認）。' },
        { name: 'Critical Damage Enhancement', group: 'passive', label: 'クリティカルダメージ 強化', effect: '1レベルごとに クリティカルダメージ +5%（Lv.2 表示: +10%）' },
        { name: 'Damage Enhancement', group: 'passive', label: 'ダメージ 強化', effect: '1レベルごとに ダメージ +5%' },
        { name: 'Boss Damage Enhancement', group: 'passive', label: 'ボスダメージ 強化', effect: '1レベルごとに ボスダメージ +5%', note: '資料によっては「Boss Damage Increase Enhancement」とも表記されます。' },
        { name: 'Ignore Defense Enhancement', group: 'passive', label: '防御率無視 強化', effect: '1レベルごとに 防御率無視 +5%' },
        { name: 'Registry', group: 'exclusive', label: 'Registry', effect: 'Hologram スキルで命中した敵に [Hologram] Format を付与（Lv.1: 20秒）。Format 中の敵に指定の強化攻撃を当てると Defrag 爆発（Lv.1: 4155%）。Defrag 後5秒は再付与不可。', note: 'Banhmi ガイドのおすすめ配分では最優先（×3）。' },
        { name: 'White Hole', group: 'exclusive', label: 'White Hole', effect: '効果・数値は未公開', note: 'Banhmi ガイドが Quanah 専用スキルとして名前のみ記載（White Hole / Black Hole）。ツールチップはどの情報源にも出ていません。' },
        { name: 'Black Hole', group: 'exclusive', label: 'Black Hole', effect: '効果・数値は未公開', note: 'Banhmi ガイドが Quanah 専用スキルとして名前のみ記載（White Hole / Black Hole）。ツールチップはどの情報源にも出ていません。' },
        { name: 'Dimensional Leap', group: 'exclusive', label: 'Dimensional Leap', effect: '効果・数値は未公開', note: '下（Pants）のスクリーンショットで装備ラインとして確認（[Hologram] 接頭辞なし）。所属システムは情報源によって不明。' },
    ];
    const SKILL_NAMES = SKILLS.map((s) => s.name);
    const JEWEL_COLORS = [
        { id: 'red', label: 'Red Jewel', hex: '#f87171' },
        { id: 'blue', label: 'Blue Jewel', hex: '#60a5fa' },
        { id: 'purple', label: 'Purple Jewel', hex: '#c084fc' },
        { id: 'green', label: 'Green Jewel', hex: '#4ade80' },
        { id: 'gray', label: 'Gray Jewel', hex: '#9ca3af' },
        { id: 'prismatic', label: 'Prismatic Jewel', hex: '#f472b6' },
    ];
    const JEWELS = [
        { color: 'red', name: 'Red Jewel', archetype: 'Warrior', statPool: 'ATT / STR / DEX（+ HP / MP は全色共通で付きうる）', example: 'Lv.1 実例: Max MP +1000、DEX +50', dustPrice: 500 },
        { color: 'blue', name: 'Blue Jewel', archetype: 'Magician', statPool: 'Magic ATT / INT / LUK（+ HP / MP）', example: 'Lv.1 実例: INT +50、Max HP +1000 → Lv.2 で INT +100、Max HP +2000', dustPrice: 500 },
        { color: 'purple', name: 'Purple Jewel', archetype: 'Thief', statPool: 'ATT / LUK / DEX（+ HP / MP）', example: 'Lv.1 実例: DEX +50、Attack Power +15', dustPrice: 500 },
        { color: 'green', name: 'Green Jewel', archetype: 'Bowman', statPool: 'ATT / DEX / STR（+ HP / MP）', dustPrice: 500 },
        { color: 'gray', name: 'Gray Jewel', archetype: 'Pirate', statPool: 'ATT / STR / DEX（+ HP / MP）', dustPrice: 500 },
        { color: 'prismatic', name: 'Prismatic Jewel', archetype: '全ジョブ', statPool: 'ステータスの代わり／追加で [Hologram] スキルのレベルを持つ', example: 'Lv.1 実例: [Hologram] Boss Damage Enhancement +1 と [Hologram] Pirate Attack Skill +1', dustPrice: 3000 },
    ];
    const JEWEL_ABILITIES = {
        red: ['Attack Power', 'STR', 'DEX', 'Max HP', 'Max MP'],
        blue: ['Magic ATT', 'INT', 'LUK', 'Max HP', 'Max MP'],
        purple: ['Attack Power', 'LUK', 'DEX', 'Max HP', 'Max MP'],
        green: ['Attack Power', 'DEX', 'STR', 'Max HP', 'Max MP'],
        gray: ['Attack Power', 'STR', 'DEX', 'Max HP', 'Max MP'],
    };
    const PRISMATIC_LINE_ABILITIES = [...new Set(Object.values(JEWEL_ABILITIES).flat())];
    const COLORED_STEP_COSTS = [5, 9, 18, 33];
    const PRISMATIC_STEP_COSTS = [2, 3, 4, 6];
    const STAT_GROUPS = [
        { label: 'STR / DEX / INT / LUK', abilities: ['STR', 'DEX', 'INT', 'LUK'], values: [50, 100, 150, 200, 300] },
        { label: 'Max HP / Max MP', abilities: ['Max HP', 'Max MP'], values: [1000, 2000, 3000, 4000, 6000] },
        { label: 'Attack Power / Magic ATT', abilities: ['Attack Power', 'Magic ATT'], values: [15, 30, 45, 60, 100] },
    ];
    const STAT_BONUS = {};
    STAT_GROUPS.forEach((g) => g.abilities.forEach((a) => { STAT_BONUS[a] = g.values; }));
    const STAT_ORDER = ['STR', 'DEX', 'INT', 'LUK', 'Attack Power', 'Magic ATT', 'Max HP', 'Max MP'];
    const GRID_ORDER = ['hat', 'top', 'bottom', 'cape', 'gloves', 'shoes'];
    const SLOT_LABEL = { hat: '帽子', top: '服（上）', bottom: '服（下）', cape: 'マント', gloves: '手袋', shoes: '靴' };
    const SLOT_EN = { hat: 'Hat', top: 'Top', bottom: 'Bottom', cape: 'Cape', gloves: 'Gloves', shoes: 'Shoes' };
    const RECOMMENDED = [
        { skill: 'Registry', count: 3 }, { skill: '（ジョブ攻撃スキル 合計）', count: 4 },
        { skill: 'Attack Power & Magic ATT Enhancement', count: 3 }, { skill: 'Critical Damage Enhancement', count: 3 },
        { skill: 'Boss Damage Enhancement', count: 3 },
    ];
    const SOURCES = [
        { label: '公式マイクロサイト — Maplayer One / Event World: Quanah', url: 'https://www.nexon.com/maplestory/micro-site/maplayerone/event-world', kind: '公式（スキル名・ジュエルの記載なし）' },
        { label: 'Guild Banhmi (Scania) — GMS Quanah World Guide (Notion)', url: 'https://developing-havarti-064.notion.site/MapleStory-GMS-Quanah-World-QW-Guide-40a99b59718a80779303da920c57632c', kind: 'PTS プレイガイド＋ツールチップ画像' },
        { label: 'PierecedMoon — The Quanah Files (Google Docs)', url: 'https://docs.google.com/document/d/1X2P51gaWxZ_Ltxr466CEH26pK9OouXyDT5rOdbYxOhE/edit?usp=sharing', kind: 'PTS プレイガイド＋ツールチップ画像' },
    ];
    const DUST = { colored: 500, prismatic: 3000 };

    /* ---------- 保存（このブラウザだけ） ---------- */
    const LS_GEAR = 'mm-libae-gear', LS_SETTINGS = 'mm-libae-settings', LS_TAB = 'mm-libae-tab';
    const presetSettings = () => ({ maxLevel: 5, coloredStepCosts: COLORED_STEP_COSTS.slice(), prismaticStepCosts: PRISMATIC_STEP_COSTS.slice(), isPreset: true });
    const blankGear = () => Object.fromEntries(GRID_ORDER.map((s) => [s, null]));
    function loadJSON(key, fallback) {
        try { const raw = localStorage.getItem(key); if (!raw) return fallback; const v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
    }

    let gear = blankGear();
    let settings = presetSettings();
    let tab = 'gear';
    let rootEl = null;
    let dustCalc = { colored: 0, prismatic: 0 };
    let resetAsk = false;
    const openFolds = new Set();   // 開いている折りたたみ（描き直しても開いたままにする）

    function load() {
        const g = loadJSON(LS_GEAR, null);
        gear = g && typeof g === 'object' ? g : blankGear();
        GRID_ORDER.forEach((s) => { if (!(s in gear)) gear[s] = null; });
        const st = loadJSON(LS_SETTINGS, null);
        settings = st && Array.isArray(st.coloredStepCosts) && Array.isArray(st.prismaticStepCosts) ? st : presetSettings();
        if (typeof settings.maxLevel !== 'number' || settings.maxLevel < 2) settings.maxLevel = 5;
        const t = loadJSON(LS_TAB, 'gear');
        tab = ['gear', 'jewel', 'reference'].includes(t) ? t : 'gear';
    }
    function saveGear() { try { localStorage.setItem(LS_GEAR, JSON.stringify(gear)); } catch (e) { setMsg('保存できませんでした（ブラウザの保存領域を確認してください）', false); } }
    function saveSettings() { try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (e) { setMsg('設定を保存できませんでした', false); } }

    /* ---------- 小物 ---------- */
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => Number(n || 0).toLocaleString();
    const colorOf = (c) => JEWEL_COLORS.find((x) => x.id === c);
    const colorHex = (c) => colorOf(c)?.hex || '#9ca3af';
    const colorLabel = (c) => colorOf(c)?.label || c;
    const dotBg = (c) => (c === 'prismatic' ? 'linear-gradient(135deg,#f87171,#fbbf24,#4ade80,#22d3ee,#c084fc)' : colorHex(c));
    const dot = (c, size = 10) => `<span class="lg-dot" style="width:${size}px;height:${size}px;background:${c ? dotBg(c) : 'transparent'}"></span>`;
    const jewelStatBonus = (ability, level) => { const v = STAT_BONUS[ability]; if (!v || level < 1) return 0; return v[Math.min(level, v.length) - 1] || 0; };
    const stepCosts = (color) => (color === 'prismatic' ? settings.prismaticStepCosts : settings.coloredStepCosts);
    const fodderSpent = (level, color) => { const costs = stepCosts(color); let sum = 0; for (let lv = 1; lv < level; lv++) sum += costs[lv - 1] || 0; return sum; };
    const dustRate = (color) => (color === 'prismatic' ? DUST.prismatic : DUST.colored);
    const dustFor = (count, color) => count * dustRate(color);
    const pct = (spent, total) => (total > 0 ? Math.round(spent / total * 100) : 100);
    const slotHasContent = (item) => !!item && (item.skillLines.some((v) => v && v.trim() !== '') || item.sockets.length > 0);
    const ensureSlot = (slot) => { if (!gear[slot]) gear[slot] = { skillLines: ['', '', ''], sockets: [] }; return gear[slot]; };
    const normalizeSlot = (slot) => { if (gear[slot] && !slotHasContent(gear[slot])) gear[slot] = null; };
    const filledCount = () => GRID_ORDER.filter((s) => !!gear[s]).length;
    const doneBadge = '<span class="badge badge-success badge-xs font-bold">完了</span>';

    function slotIcon(slot, size) {
        const p = {
            hat: '<path d="M4 19h16"/><path d="M5 19L4 8l5 3.5L12 5l3 6.5L20 8l-1 11"/>',
            cape: '<path d="M12 3c2.8 0 4.8.9 5.8 2L20 19c-2.6-1.1-5.2-1.6-8-1.6s-5.4.5-8 1.6L6.2 5C7.2 3.9 9.2 3 12 3z"/><circle cx="12" cy="8" r="1.4"/>',
            top: '<path d="M9 4L4 7l2 4 2-1v10h8V10l2 1 2-4-5-3a3 3 0 0 1-6 0z"/>',
            gloves: '<path d="M9.5 20.5v-5.2l-2.2-2.5a1.9 1.9 0 0 1 2.8-2.5l1.4 1.5V5.2a2.6 2.6 0 0 1 5.2 0v6.1c1.7.7 2.8 2.2 2.8 4.1v5.1"/><path d="M9 17.5h10.5"/>',
            bottom: '<path d="M7 3h10l1 18h-4.4L12 11.2 10.4 21H6z"/><path d="M6.8 7h10.4"/>',
            shoes: '<path d="M3.5 15.5L9.5 13V5.5h4V12l6.5 3v3.5h-15a1.8 1.8 0 0 1-1.5-3z"/><path d="M3.5 20.5h16.5"/>',
        }[slot] || '<path d="M12 3l7 2v6c0 5-3.4 8.1-7 10-3.6-1.9-7-5-7-10V5z"/>';
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    }
    function gaugeHTML(spent, total, color, label, tall) {
        const p = total > 0 ? Math.min(100, Math.max(0, spent / total * 100)) : 100;
        const done = total > 0 && spent >= total;
        const bg = done ? 'var(--color-success)' : color === 'prismatic' ? 'linear-gradient(90deg,#f472b6,#c084fc)' : color ? colorHex(color) : 'var(--color-primary)';
        return `<div class="lg-gauge ${tall ? 'lg-gauge-tall' : ''}" role="img" aria-label="${esc(label)} 使用済み ${spent} / 必要総数 ${total}（${Math.round(p)}%）"><div style="width:${p}%;background:${bg}"></div></div>`;
    }
    const h3 = (icon, text, right = '') => `<h3 class="lg-h"><i data-lucide="${icon}"></i>${text}${right ? `<span class="ml-auto">${right}</span>` : ''}</h3>`;

    /* ---------- 集計 ---------- */
    function aggregate() {
        const equip = {}, jewel = {}, statTotals = {};
        let lines = 0, equippedJewels = 0;
        GRID_ORDER.forEach((slot) => {
            const item = gear[slot]; if (!item) return;
            item.skillLines.forEach((n) => { if (n && n.trim()) { lines++; equip[n] = (equip[n] || 0) + 1; } });
            item.sockets.forEach((s) => {
                if (s.jewelLevel > 0) equippedJewels++;
                if (s.color === 'prismatic' && s.jewelLevel > 0) {
                    (s.prismaticSkills || []).forEach((n) => {
                        if (!n) return;
                        if (PRISMATIC_LINE_ABILITIES.includes(n)) { const b = jewelStatBonus(n, s.jewelLevel); if (b > 0) statTotals[n] = (statTotals[n] || 0) + b; }
                        else jewel[n] = (jewel[n] || 0) + s.jewelLevel;
                    });
                } else if (s.color !== 'prismatic' && s.jewelLevel > 0) {
                    (s.abilities || []).forEach((a) => { if (!a) return; const b = jewelStatBonus(a, s.jewelLevel); if (b > 0) statTotals[a] = (statTotals[a] || 0) + b; });
                }
            });
        });
        const names = [...new Set([...SKILL_NAMES.filter((n) => equip[n] || jewel[n]), ...Object.keys(equip), ...Object.keys(jewel)])];
        const stats = STAT_ORDER.filter((a) => (statTotals[a] || 0) > 0).map((a) => ({ ability: a, total: statTotals[a] }));
        return { equip, jewel, names, lines, stats, equippedJewels, gearCount: filledCount() };
    }
    function jewelSummary() {
        const maxLevel = settings.maxLevel;
        let equipped = 0, grandTotal = 0, grandSpent = 0, maxed = 0, emptySockets = 0, coloredFull = 0, prismaticFull = 0;
        const tot = {}, sp = {}, cnt = {};
        GRID_ORDER.forEach((slot) => {
            const item = gear[slot]; if (!item) return;
            item.sockets.forEach((s) => {
                if (s.jewelLevel === 0) { emptySockets++; return; }
                equipped++;
                const full = fodderSpent(maxLevel, s.color), spent = fodderSpent(Math.min(s.jewelLevel, maxLevel), s.color);
                grandTotal += full; grandSpent += spent;
                tot[s.color] = (tot[s.color] || 0) + full; sp[s.color] = (sp[s.color] || 0) + spent; cnt[s.color] = (cnt[s.color] || 0) + 1;
                if (s.color === 'prismatic') prismaticFull += full; else coloredFull += full;
                if (s.jewelLevel >= maxLevel) maxed++;
            });
        });
        const perColor = JEWEL_COLORS.filter((c) => (cnt[c.id] || 0) > 0).map((c) => {
            const total = tot[c.id] || 0, spent = sp[c.id] || 0, remaining = total - spent;
            return { color: c.id, label: c.label, count: cnt[c.id] || 0, total, spent, remaining, remainingDust: dustFor(remaining, c.id) };
        });
        const remainingDust = perColor.reduce((a, c) => a + c.remainingDust, 0);
        const fullDust = dustFor(coloredFull, 'red') + dustFor(prismaticFull, 'prismatic');
        return { equipped, grandTotal, grandSpent, remaining: grandTotal - grandSpent, maxed, emptySockets, perColor, remainingDust, coloredFull, prismaticFull, fullDust };
    }

    /* ---------- 装備管理 ---------- */
    function skillOptionsHTML(selected) {
        let h = '<option value="">（なし）</option>';
        SKILL_GROUPS.forEach((g) => {
            h += `<optgroup label="[Hologram] ${esc(g.label)}">`;
            SKILLS.filter((s) => s.group === g.id).forEach((s) => { h += `<option value="${esc(s.name)}" ${selected === s.name ? 'selected' : ''}>${esc(s.name)}</option>`; });
            h += '</optgroup>';
        });
        if (selected && !SKILL_NAMES.includes(selected)) h += `<option value="${esc(selected)}" selected>${esc(selected)}</option>`;
        return h;
    }
    function socketHTML(slot, s, idx) {
        const at = `data-slot="${slot}" data-idx="${idx}"`;
        let h = `<div class="lg-socket"><div class="flex items-center gap-1.5">${dot(s.color, 12)}
            <select data-act="color" ${at} class="select select-xs flex-1 min-w-0" aria-label="ソケットの色（無しでソケットを削除）">
                <option value="none">無し（外す）</option>
                ${JEWEL_COLORS.map((c) => `<option value="${c.id}" ${s.color === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
            </select>
            <select data-act="level" ${at} class="select select-xs w-[72px] shrink-0 font-mono ${s.jewelLevel > 0 ? 'font-bold' : ''}" aria-label="ジュエルレベル">
                <option value="0" ${s.jewelLevel === 0 ? 'selected' : ''}>空き</option>`;
        const maxLv = Math.max(settings.maxLevel, s.jewelLevel);
        for (let lv = 1; lv <= maxLv; lv++) h += `<option value="${lv}" ${s.jewelLevel === lv ? 'selected' : ''}>Lv.${lv}</option>`;
        h += '</select></div>';
        if (s.color !== 'prismatic' && s.jewelLevel > 0) {
            const opts = JEWEL_ABILITIES[s.color] || [];
            h += '<div class="grid grid-cols-2 gap-1 mt-1">';
            for (let pos = 0; pos < 2; pos++) {
                const cur = (s.abilities && s.abilities[pos]) || '';
                h += `<select data-act="ability" ${at} data-pos="${pos}" class="select select-xs w-full min-w-0" aria-label="ジュエルの能力 ${pos + 1}">
                    <option value="">能力${pos + 1}</option>
                    ${opts.map((a) => { const b = jewelStatBonus(a, s.jewelLevel); return `<option value="${esc(a)}" ${cur === a ? 'selected' : ''}>${esc(b > 0 ? `${a} +${fmt(b)}` : a)}</option>`; }).join('')}
                </select>`;
            }
            h += '</div>';
        }
        if (s.color === 'prismatic' && s.jewelLevel > 0) {
            const lines = [(s.prismaticSkills && s.prismaticSkills[0]) || '', (s.prismaticSkills && s.prismaticSkills[1]) || ''];
            h += '<div class="flex flex-col gap-1 mt-1">';
            lines.forEach((name, pi) => {
                h += `<select data-act="pline" ${at} data-pos="${pi}" class="select select-xs w-full min-w-0" aria-label="プリズマティックのライン ${pi + 1}">
                    <option value="">ライン${pi + 1}</option>
                    <optgroup label="[Hologram] スキル（+${s.jewelLevel}）">${SKILLS.map((sk) => `<option value="${esc(sk.name)}" ${name === sk.name ? 'selected' : ''}>${esc(sk.name)} +${s.jewelLevel}</option>`).join('')}</optgroup>
                    <optgroup label="ステータス">${PRISMATIC_LINE_ABILITIES.map((a) => { const b = jewelStatBonus(a, s.jewelLevel); return `<option value="${esc(a)}" ${name === a ? 'selected' : ''}>${esc(b > 0 ? `${a} +${fmt(b)}` : a)}</option>`; }).join('')}</optgroup>
                </select>`;
            });
            h += '</div>';
        }
        return h + '</div>';
    }
    function cellDotsHTML(item) {
        if (!item) return '<span class="lg-dots text-[11px] text-base-content/35">未登録</span>';
        if (!item.sockets.length) return '';
        return `<span class="lg-dots">${item.sockets.map((s) => (s.jewelLevel <= 0
            ? `<span class="lg-dotwrap">${dot(null)}</span>`
            : `<span class="lg-dotwrap">${dot(s.color)}Lv.${s.jewelLevel}</span>`)).join('')}</span>`;
    }
    function cellHTML(slot) {
        const item = gear[slot];
        const lines = item ? item.skillLines : ['', '', ''];
        const socks = item ? item.sockets : [];
        return `<div class="lg-cell ${item ? 'lg-filled' : ''}" id="lg-cell-${slot}">
            <div class="lg-cell-head">${slotIcon(slot, 18)}<span class="lg-sname">${esc(SLOT_LABEL[slot])}</span>${cellDotsHTML(item)}</div>
            <div class="lg-editor">
                <div class="lg-legend">スキルライン</div>
                <div class="flex flex-col gap-1">
                    ${[0, 1, 2].map((i) => `<select data-act="skill" data-slot="${slot}" data-idx="${i}" class="select select-xs w-full min-w-0 ${lines[i] ? 'font-bold' : 'text-base-content/45'}" aria-label="スキルライン ${i + 1}">${skillOptionsHTML(lines[i] || '')}</select>`).join('')}
                </div>
                <div class="lg-legend mt-2">ジュエルソケット</div>
                ${socks.map((s, idx) => socketHTML(slot, s, idx)).join('')}
                ${socks.length < 3 ? `<button type="button" data-act="add-socket" data-slot="${slot}" class="btn btn-xs btn-ghost border-dashed border-base-content/20 w-full mt-1"><i data-lucide="plus" class="w-3 h-3"></i>ソケット</button>` : ''}
            </div>
        </div>`;
    }
    function sideHTML() {
        const agg = aggregate();
        const allAt = (lv) => agg.equippedJewels > 0 && GRID_ORDER.every((slot) => { const it = gear[slot]; return !it || it.sockets.every((s) => s.jewelLevel === 0 || s.jewelLevel === lv); });
        let h = `<div class="grid grid-cols-2 gap-1.5">
                <div class="lg-stat"><span>装備</span><b>${agg.gearCount}<small> / 6</small></b></div>
                <div class="lg-stat"><span>スキルライン</span><b>${agg.lines}<small> / ${MAX_LINES}</small></b></div>
            </div>`;
        h += `<section class="mt-4">${h3('layers', 'スキルスタック', '<span class="lg-legend-key"><i class="bg-primary"></i>装備<i class="lg-bj"></i>ジュエル</span>')}`;
        if (!agg.names.length) h += '<p class="lg-empty">スキルライン未登録</p>';
        else {
            h += '<ul class="flex flex-col gap-1">';
            agg.names.forEach((name) => {
                const e = agg.equip[name] || 0, j = agg.jewel[name] || 0, total = e + j;
                const wE = Math.min(100, (Math.min(e, EQUIP_CAP) / MASTER_LEVEL) * 100), wJ = Math.min(100, (j / MASTER_LEVEL) * 100);
                const over = e > EQUIP_CAP;
                h += `<li class="lg-stack" title="装備 ${e}（上限 ${EQUIP_CAP}）＋ ジュエル ${j}　Master Level ${MASTER_LEVEL}${over ? '　※装備ラインが上限を超えています' : ''}">
                    <div class="flex items-baseline gap-2"><span class="flex-1 min-w-0 truncate text-[12px] font-bold">${esc(name)}</span>
                        <span class="font-mono text-[11px] text-base-content/50 shrink-0 ${over ? 'text-warning' : ''}">${e}+${j}</span>
                        <b class="font-mono text-[14px] shrink-0 ${total >= MASTER_LEVEL ? 'text-success' : 'text-white'}">Lv.${total}</b></div>
                    <div class="lg-bar"><div class="bg-primary" style="width:${wE}%"></div><div class="lg-bj" style="width:${wJ}%"></div></div>
                </li>`;
            });
            h += '</ul>';
        }
        h += `</section><section class="mt-4">${h3('gem', 'ジュエルのステータス')}`;
        if (!agg.stats.length) h += '<p class="lg-empty">なし</p>';
        else h += `<ul class="lg-statlist">${agg.stats.map((x) => `<li><span>${esc(x.ability)}</span><b class="font-mono text-white">+${fmt(x.total)}</b></li>`).join('')}</ul>`;
        h += `</section><section class="mt-4">${h3('arrow-up-narrow-wide', 'ジュエルを一括で', `<span class="text-[11px] text-base-content/50 font-normal">${agg.equippedJewels}個</span>`)}
            <div class="join w-full" role="group" aria-label="一括変更先のレベル">`;
        for (let lv = 1; lv <= settings.maxLevel; lv++) {
            const on = allAt(lv);
            h += `<button type="button" data-act="bulk" data-level="${lv}" ${agg.equippedJewels === 0 ? 'disabled' : ''} class="btn btn-sm join-item flex-1 font-mono ${on ? 'btn-primary' : ''}" aria-pressed="${on}" title="装着中のジュエルを全部 Lv.${lv} にする（空きソケットはそのまま）">Lv.${lv}</button>`;
        }
        h += '</div></section>';
        return h;
    }
    function gearHTML() {
        return `<div class="lg-gear">
            <div class="card card-sm bg-base-100 border border-base-content/10 overflow-hidden">
                <div class="lg-equip-head"><span>EQUIP <span class="text-base-content/55 font-bold ml-1">Libae's Supercharged</span></span><span class="badge badge-sm font-mono" id="lg-count">${filledCount()} / 6</span></div>
                <div class="lg-equip-grid">${GRID_ORDER.map(cellHTML).join('')}</div>
            </div>
            <aside class="card card-sm bg-base-100 border border-base-content/10 p-3" id="lg-side">${sideHTML()}</aside>
        </div>`;
    }
    function refreshSide() {
        const el = rootEl && rootEl.querySelector('#lg-side');
        if (el) { el.innerHTML = sideHTML(); icons(); }
    }
    // セルの見出し（ジュエルの点）と枠の色だけ直す。選択欄は作り直さない（フォーカスが外れないように）。
    function refreshCellHead(slot) {
        const cell = rootEl && rootEl.querySelector(`#lg-cell-${slot}`); if (!cell) return;
        const item = gear[slot];
        cell.classList.toggle('lg-filled', !!item);
        const head = cell.querySelector('.lg-cell-head');
        const old = head.querySelector('.lg-dots');
        const dots = cellDotsHTML(item);
        if (old) old.outerHTML = dots; else if (dots) head.insertAdjacentHTML('beforeend', dots);
        const cnt = rootEl.querySelector('#lg-count'); if (cnt) cnt.textContent = `${filledCount()} / 6`;
    }

    /* ---------- ジュエル強化 ---------- */
    function statBonusTableHTML() {
        const levels = [1, 2, 3, 4, 5];
        const rows = STAT_GROUPS.map((g) => ({ label: g.label, values: g.values.map(fmt) }));
        rows.push({ label: 'Designated skill level', values: levels.map((l) => `+${l}`) });
        return `<table class="table table-xs lg-table"><thead><tr><th>能力</th>${levels.map((l) => `<th class="text-right">Lv.${l}</th>`).join('')}</tr></thead>
            <tbody>${rows.map((r) => `<tr><td class="font-bold">${esc(r.label)}</td>${r.values.map((v) => `<td class="text-right font-mono">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function costTableHTML() {
        const sum = (a) => a.reduce((x, y) => x + y, 0);
        return `<table class="table table-xs lg-table"><thead><tr><th>上げる先</th><th class="text-right">カラー</th><th class="text-right">プリズマティック</th></tr></thead>
            <tbody>${[2, 3, 4, 5].map((t) => `<tr><td class="font-mono font-bold">Lv.${t}</td><td class="text-right font-mono">${COLORED_STEP_COSTS[t - 2]}</td><td class="text-right font-mono">${PRISMATIC_STEP_COSTS[t - 2]}</td></tr>`).join('')}
            <tr class="font-bold"><td>合計（Lv.1 → 5）</td><td class="text-right font-mono text-white">${sum(COLORED_STEP_COSTS)}</td><td class="text-right font-mono text-white">${sum(PRISMATIC_STEP_COSTS)}</td></tr></tbody></table>`;
    }
    function settingsHTML() {
        const row = (kind, label, costs) => `<div class="mt-2"><div class="text-[11px] font-bold text-base-content/70">${label}</div>
            <div class="grid grid-cols-4 gap-1.5 mt-1">${costs.map((cost, i) => `<label class="lg-field"><span>Lv.${i + 1}→${i + 2}</span><input type="number" min="0" max="9999" value="${cost}" class="input input-xs w-full font-mono text-right lg-set-cost" data-kind="${kind}" data-idx="${i}"></label>`).join('')}</div></div>`;
        return `<div class="flex items-end gap-2">
                <label class="lg-field w-24"><span>最大レベル</span><input type="number" min="2" max="20" value="${settings.maxLevel}" id="lg-set-max" class="input input-xs w-full font-mono text-right"></label>
                <span class="badge badge-sm ${settings.isPreset ? 'badge-ghost' : 'badge-warning badge-soft'} ml-auto">${settings.isPreset ? 'クライアントデータ' : 'カスタム'}</span>
            </div>
            ${row('colored', 'カラージュエル', settings.coloredStepCosts)}
            ${row('prismatic', 'プリズマティックジュエル', settings.prismaticStepCosts)}
            <div class="flex gap-1.5 mt-3"><button type="button" class="btn btn-sm btn-primary" data-act="save-settings">保存</button>
                ${settings.isPreset ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-act="preset-settings">クライアントデータに戻す</button>'}</div>`;
    }
    function jewelHTML() {
        const maxLevel = settings.maxLevel, sum = jewelSummary();
        let h = '<div class="flex flex-col gap-3">';
        // 全体の進捗
        h += `<section class="card card-sm bg-base-100 border border-base-content/10 p-4">
            ${h3('gem', `強化の進捗<span class="text-base-content/50 font-normal ml-1">Lv.${maxLevel}まで</span>`, sum.equipped > 0 ? `<span class="font-mono text-[11px] text-base-content/50 font-normal">全${sum.equipped}個 · 完了${sum.maxed}個 · 空き${sum.emptySockets}個</span>` : '')}`;
        if (sum.equipped === 0) h += '<p class="lg-empty">装着中のジュエルがありません。装備管理のソケットにジュエルを入れると出ます。</p>';
        else {
            const done = sum.remaining === 0;
            h += `<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-end mt-1">
                <div>
                    <div class="flex items-end justify-between gap-3">
                        <div><div class="lg-k">使用済み / 必要総数</div><div class="font-mono"><span class="lg-big">${sum.grandSpent}</span><span class="text-base-content/50 font-bold text-[15px]"> / ${sum.grandTotal} 個</span></div></div>
                        <div class="text-right"><div class="lg-k">残り</div><div class="font-mono lg-big ${done ? 'text-success' : 'text-white'}">${sum.remaining}<span class="text-[13px] font-bold"> 個</span></div></div>
                    </div>
                    <div class="mt-2">${gaugeHTML(sum.grandSpent, sum.grandTotal, null, '全体', true)}</div>
                    <div class="flex justify-between mt-1 font-mono text-[11px] text-base-content/50"><span>${pct(sum.grandSpent, sum.grandTotal)}%</span>${done ? doneBadge : `<span>残りを Dust で <b class="text-[14px] text-amber-300">${fmt(sum.remainingDust)}</b> Dust</span>`}</div>
                </div>
                <div class="lg-inset">
                    <div class="lg-k">全部 Dust で買うと（Lv.1 → ${maxLevel}）</div>
                    <div class="font-mono text-[16px] font-black mt-0.5 text-white">${sum.grandTotal}個 <span class="text-base-content/40 font-normal">＝</span> <span class="text-amber-300">${fmt(sum.fullDust)}</span> Dust</div>
                    <div class="font-mono text-[11px] text-base-content/50 mt-0.5">カラー ${sum.coloredFull}個（${fmt(dustFor(sum.coloredFull, 'red'))}）　プリズマティック ${sum.prismaticFull}個（${fmt(dustFor(sum.prismaticFull, 'prismatic'))}）</div>
                </div>
            </div>`;
        }
        h += '</section>';
        // 色別
        if (sum.perColor.length) {
            h += `<section>${h3('palette', '色別の残り')}<ul class="lg-colorgrid">`;
            sum.perColor.forEach((c) => {
                const done = c.remaining === 0;
                h += `<li class="card card-sm bg-base-100 border border-base-content/10 p-3">
                    <div class="flex items-center gap-1.5">${dot(c.color, 14)}<span class="font-black text-[13px] flex-1 min-w-0 truncate">${esc(c.label)}</span><span class="font-mono text-[11px] text-base-content/50">×${c.count}</span></div>
                    <div class="flex justify-between items-end mt-1.5"><div><div class="lg-k">残り</div><div class="font-mono text-[24px] font-black leading-none ${done ? 'text-success' : 'text-white'}">${c.remaining}<span class="text-[12px] font-bold"> 個</span></div></div>
                        ${done ? doneBadge : `<span class="font-mono text-[11px] text-base-content/50">${pct(c.spent, c.total)}%</span>`}</div>
                    <div class="mt-2">${gaugeHTML(c.spent, c.total, c.color, c.label, false)}</div>
                    <div class="flex justify-between mt-1.5 font-mono text-[11px] text-base-content/50"><span>${c.spent} / ${c.total} 個</span><b class="${done ? 'text-base-content/50' : 'text-amber-300'}">${fmt(c.remainingDust)} Dust</b></div>
                </li>`;
            });
            h += '</ul></section>';
        }
        // 装備ごと
        const groups = [];
        GRID_ORDER.forEach((slot) => {
            const item = gear[slot]; if (!item) return;
            const jewels = item.sockets.filter((s) => s.jewelLevel > 0).map((s) => {
                const full = fodderSpent(maxLevel, s.color), spent = fodderSpent(Math.min(s.jewelLevel, maxLevel), s.color);
                return { socket: s, full, spent, remaining: full - spent };
            });
            if (jewels.length) groups.push({ slot, jewels, remaining: jewels.reduce((a, j) => a + j.remaining, 0), remainingDust: jewels.reduce((a, j) => a + dustFor(j.remaining, j.socket.color), 0) });
        });
        if (groups.length) {
            h += `<section>${h3('shirt', '装備ごと')}<ul class="lg-slotgrid">`;
            groups.forEach((g) => {
                h += `<li class="card card-sm bg-base-100 border border-base-content/10 px-3 py-2">
                    <div class="flex justify-between items-center gap-2 pb-1"><span class="flex items-center gap-1.5 font-black text-[13px]">${slotIcon(g.slot, 16)}${esc(SLOT_LABEL[g.slot])}<span class="text-base-content/40 font-normal text-[11px]">${SLOT_EN[g.slot]}</span></span>
                        ${g.remaining === 0 ? doneBadge : `<span class="font-mono text-[12px] font-bold whitespace-nowrap">残り ${g.remaining}個 <span class="text-amber-300">${fmt(g.remainingDust)}</span><span class="text-base-content/50 font-normal"> Dust</span></span>`}</div>`;
                g.jewels.forEach((j) => {
                    const done = j.remaining === 0;
                    h += `<div class="lg-jrow"><div class="flex items-center gap-1.5">${dot(j.socket.color)}<span class="font-bold text-[12px] flex-1 min-w-0">${esc(colorLabel(j.socket.color))}</span>
                            <span class="font-mono text-[12px] font-bold">Lv.${j.socket.jewelLevel}<span class="text-base-content/40 font-normal"> / ${maxLevel}</span></span>
                            ${done ? doneBadge : `<span class="font-mono text-[12px] font-black w-16 text-right">残り ${j.remaining}</span>`}</div>
                        <div class="flex items-center gap-2 mt-1"><div class="flex-1">${gaugeHTML(j.spent, j.full, j.socket.color, colorLabel(j.socket.color), false)}</div>
                            <span class="font-mono text-[11px] text-base-content/50 whitespace-nowrap">${done ? `${j.full}個` : `${j.spent}/${j.full}個 · ${fmt(dustFor(j.remaining, j.socket.color))} Dust`}</span></div></div>`;
                });
                h += '</li>';
            });
            h += '</ul></section>';
        }
        // 設定・Dust 計算・表
        const fold = (key, icon, title, body) => `<details data-fold="${key}" class="collapse collapse-arrow bg-base-100 border border-base-content/10 rounded" ${openFolds.has(key) ? 'open' : ''}>
                <summary class="collapse-title text-[13px] font-bold min-h-0 py-2.5 flex items-center gap-2"><i data-lucide="${icon}" class="w-3.5 h-3.5 text-indigo-400"></i>${title}</summary>
                <div class="collapse-content text-[12px]">${body}</div></details>`;
        h += `<div class="grid gap-3 lg:grid-cols-3 items-start">
            ${fold('settings', 'settings-2', 'ジュエル設定（コスト）', settingsHTML())}
            ${fold('dust', 'calculator', 'Dust 交換計算', `<div class="grid grid-cols-2 gap-2">
                    <label class="lg-field"><span>カラージュエル数</span><input type="number" min="0" max="99" value="${dustCalc.colored}" data-dust="colored" class="input input-xs w-full font-mono text-right"></label>
                    <label class="lg-field"><span>プリズマティック数</span><input type="number" min="0" max="99" value="${dustCalc.prismatic}" data-dust="prismatic" class="input input-xs w-full font-mono text-right"></label>
                </div>
                <p class="font-mono text-[16px] font-black mt-3">必要 <span class="text-amber-300" id="lg-dust-total">${fmt(dustCalc.colored * DUST.colored + dustCalc.prismatic * DUST.prismatic)}</span> Dust</p>`)}
            ${fold('tables', 'table-2', 'レベル別ボーナスと強化コスト', `${statBonusTableHTML()}<div class="lg-k mt-3 mb-1">強化コスト（その Lv に上げる素材数）</div>${costTableHTML()}`)}
        </div>`;
        return h + '</div>';
    }

    /* ---------- 資料 ---------- */
    function referenceHTML() {
        const box = 'card card-sm bg-base-100 border border-base-content/10';
        const ul = (items) => `<ul class="${box} list-disc pl-7 pr-4 py-3 text-[12px] leading-relaxed">${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
        let h = '<div class="flex flex-col gap-5">';
        h += `<section>${h3('book-open', 'スキル候補一覧<span class="text-base-content/50 font-normal ml-1">PTS プール</span>')}`;
        SKILL_GROUPS.forEach((g) => {
            h += `<div class="mt-2"><div class="text-[12px] font-black text-indigo-300 mb-1">${esc(g.label)}</div><ul class="lg-refgrid">`;
            SKILLS.filter((s) => s.group === g.id).forEach((s) => {
                h += `<li class="${box} px-3 py-2"><div class="text-[13px] font-bold text-white">[Hologram] ${esc(s.name)}${s.label !== s.name ? ` <span class="text-[11px] text-base-content/50 font-normal ml-1">${esc(s.label)}</span>` : ''}</div>
                    <p class="text-[12px] mt-1">${esc(s.effect)}</p>${s.note ? `<p class="text-[11px] text-base-content/50 mt-1">※ ${esc(s.note)}</p>` : ''}</li>`;
            });
            h += '</ul></div>';
        });
        h += '</section>';
        h += `<div class="grid gap-5 lg:grid-cols-2 items-start">
            <section>${h3('thumbs-up', 'ガイド著者のおすすめ配分<span class="text-base-content/50 font-normal ml-1">意見</span>')}
                <ul class="${box} px-4 py-2">${RECOMMENDED.map((r) => `<li class="flex justify-between py-0.5 text-[12px]"><span>${esc(r.skill)}</span><b class="font-mono text-white">×${r.count}</b></li>`).join('')}</ul></section>
            <section>${h3('shirt', '装備セットについて')}${ul([
                '名称は「Libae\'s Supercharged [部位]」。狩り場と Battlesim ダンジョンでドロップし、トレード不可。',
                'スターフォース上限は 30。強化はすべて Quanah Crystal を使い、通常のキューブ／フレーム／スクロールは使えません。',
                'Banhmi ガイドによれば全8部位で、ラインが付くのは6部位（武器・肩を除く）、最大18ライン。',
                '装備スキルラインは1スキル合計 Lv.3 が上限で、ジュエル込みの Master Level は Lv.8。',
                'ラインの移動は Orb システム（コスト未公表）。',
            ])}</section>
        </div>`;
        h += `<section>${h3('gem', 'ジュエル仕様')}<ul class="lg-refgrid">`;
        JEWELS.forEach((j) => {
            h += `<li class="${box} px-3 py-2"><div class="flex items-center gap-2 text-[13px] font-bold text-white">${dot(j.color, 14)}${esc(j.name)}<span class="text-[11px] text-base-content/50 font-normal">${esc(j.archetype)}</span><span class="font-mono text-[11px] ml-auto text-amber-300">${fmt(j.dustPrice)} Dust</span></div>
                <p class="text-[12px] mt-1">${esc(j.statPool)}</p>${j.example ? `<p class="text-[11px] text-base-content/50 mt-1">${esc(j.example)}</p>` : ''}</li>`;
        });
        h += '</ul><p class="text-[11px] text-base-content/50 mt-2">強化は同色の素材のみ・成功率100%。上限は両カテゴリとも Lv.5。装着済みジュエルの取り外しは Dust 化のみ（そのまま回収不可）。</p></section>';
        h += `<div class="grid gap-5 lg:grid-cols-2 items-start">
            <section>${h3('table-2', 'ジュエル強化コスト<span class="text-base-content/50 font-normal ml-1">クライアントデータ</span>')}<div class="${box} overflow-x-auto">${costTableHTML()}</div></section>
            <section>${h3('table-2', 'レベル別ステータスボーナス<span class="text-base-content/50 font-normal ml-1">クライアントデータ・能力1種あたり</span>')}<div class="${box} overflow-x-auto">${statBonusTableHTML()}</div></section>
        </div>`;
        h += `<div class="grid gap-5 lg:grid-cols-2 items-start">
            <section>${h3('circle-help', '未確認事項')}${ul([
                'Pirate 強化攻撃の正式名（「Max Cannon R…」までしか写っていない）',
                'White Hole / Black Hole と Dimensional Leap の効果・数値',
                'ジョブ攻撃スキルのダメージ%と強化版の発動率',
                '強化パッシブのファイナルダメージ閾値表（Lv.3 以降）',
                '以上すべて PTS（10/29〜11/1）時点の情報で、11月11日の正式実装で変わる可能性あり',
            ])}</section>
            <section>${h3('link', '出典<span class="text-base-content/50 font-normal ml-1">2026-11-08 調査</span>')}<ul class="flex flex-col gap-1.5">${SOURCES.map((s) => `<li class="${box} px-3 py-2"><a href="${esc(s.url)}" target="_blank" rel="noreferrer" class="link link-hover text-indigo-300 text-[13px] font-bold">${esc(s.label)}</a><p class="text-[11px] text-base-content/50 mt-0.5">${esc(s.kind)}</p></li>`).join('')}</ul></section>
        </div>`;
        return h + '</div>';
    }

    /* ---------- データ（書き出し・読み込み・初期化） ---------- */
    function dataHTML() {
        return `<section class="card card-sm bg-base-100 border border-base-content/10 px-3 py-2 mt-4">
            <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-[12px] font-bold flex items-center gap-1.5 mr-2" title="登録内容はこのブラウザに自動で保存されます。別の端末に移すときは JSON で書き出して読み込みます。"><i data-lucide="database" class="w-3.5 h-3.5 text-indigo-400"></i>データ<span class="text-base-content/45 font-normal">このブラウザに保存</span></span>
                <button type="button" class="btn btn-xs" data-act="export-dl"><i data-lucide="download" class="w-3 h-3"></i>JSON を保存</button>
                <button type="button" class="btn btn-xs" data-act="export-copy"><i data-lucide="copy" class="w-3 h-3"></i>JSON をコピー</button>
                <label class="btn btn-xs"><i data-lucide="upload" class="w-3 h-3"></i>JSON を読み込む<input type="file" data-act="import" accept="application/json,.json" hidden></label>
                <span id="lg-msg" class="text-[11px] font-bold ml-1" role="status"></span>
                <span class="ml-auto flex gap-1.5">${resetAsk
                    ? '<button type="button" class="btn btn-xs btn-error" data-act="reset-yes">本当にすべて初期化する</button><button type="button" class="btn btn-xs btn-ghost" data-act="reset-no">やめる</button>'
                    : '<button type="button" class="btn btn-xs btn-ghost text-error" data-act="reset" title="登録した装備すべてとジュエル設定を初期状態に戻します（元に戻せません）"><i data-lucide="rotate-ccw" class="w-3 h-3"></i>初期化</button>'}</span>
            </div>
        </section>`;
    }
    function setMsg(text, ok = true) {
        const el = rootEl && rootEl.querySelector('#lg-msg'); if (!el) return;
        el.textContent = text;
        el.className = `text-[11px] font-bold ml-1 ${ok ? 'text-success' : 'text-error'}`;
        clearTimeout(setMsg._t);
        setMsg._t = setTimeout(() => { if (el.isConnected) el.textContent = ''; }, 4000);
    }
    const exportData = () => ({ app: 'libae-gear', version: 1, exportedAt: new Date().toISOString(), gear, settings });
    function importData(data) {
        if (!data || typeof data !== 'object' || !data.gear) throw new Error('bad');
        const ng = blankGear();
        GRID_ORDER.forEach((slot) => {
            const it = data.gear[slot]; if (!it || typeof it !== 'object') return;
            const sl = Array.isArray(it.skillLines) ? it.skillLines : [];
            ng[slot] = {
                skillLines: [sl[0] || '', sl[1] || '', sl[2] || ''],
                sockets: Array.isArray(it.sockets) ? it.sockets.slice(0, 3).map((s) => ({
                    color: colorOf(s.color) ? s.color : 'red',
                    jewelLevel: Number(s.jewelLevel) || 0,
                    abilities: Array.isArray(s.abilities) ? [s.abilities[0] || '', s.abilities[1] || ''] : ['', ''],
                    prismaticSkills: Array.isArray(s.prismaticSkills) ? [s.prismaticSkills[0] || '', s.prismaticSkills[1] || ''] : ['', ''],
                })) : [],
            };
            if (!slotHasContent(ng[slot])) ng[slot] = null;
        });
        gear = ng;
        const st = data.settings;
        if (st && Array.isArray(st.coloredStepCosts) && Array.isArray(st.prismaticStepCosts)) {
            settings = { maxLevel: Number(st.maxLevel) || 5, coloredStepCosts: st.coloredStepCosts, prismaticStepCosts: st.prismaticStepCosts, isPreset: !!st.isPreset };
            saveSettings();
        }
        saveGear();
    }
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
        fallbackCopy(text);
        return Promise.resolve();
    }
    function fallbackCopy(text) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* 何もしない */ } ta.remove();
    }

    /* ---------- 描画 ---------- */
    const icons = () => { if (window.lucide) lucide.createIcons(); };
    function syncNav() {
        document.querySelectorAll('#libae-nav [data-tab]').forEach((b) => b.classList.toggle('tab-active', b.dataset.tab === tab));
    }
    function render() {
        if (!rootEl) return;
        const body = tab === 'jewel' ? jewelHTML() : tab === 'reference' ? referenceHTML() : gearHTML();
        rootEl.innerHTML = `<div class="lg-root">${body}${dataHTML()}</div>`;
        syncNav();
        icons();
    }
    function setTab(t) {
        tab = t;
        try { localStorage.setItem(LS_TAB, JSON.stringify(t)); } catch (e) { /* 何もしない */ }
        render();
        const main = rootEl && rootEl.closest('main'); if (main) main.scrollTop = 0;
    }
    function init(id) {
        rootEl = document.getElementById(id);
        load();
        bind();
        render();
    }

    /* ---------- 操作 ---------- */
    function bind() {
        rootEl.addEventListener('change', (ev) => {
            const el = ev.target; const act = el.dataset && el.dataset.act; if (!act) return;
            if (act === 'import') {
                const file = el.files && el.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try { importData(JSON.parse(String(reader.result || ''))); render(); setMsg('読み込みました'); }
                    catch (e) { setMsg('読み込めませんでした。JSON ファイルを確認してください。', false); }
                };
                reader.readAsText(file);
                el.value = '';
                return;
            }
            const slot = el.dataset.slot, idx = Number(el.dataset.idx);
            if (act === 'skill') {
                ensureSlot(slot).skillLines[idx] = el.value;
                el.classList.toggle('font-bold', !!el.value);
                el.classList.toggle('text-base-content/45', !el.value);
                normalizeSlot(slot); saveGear(); refreshSide(); refreshCellHead(slot);
                return;
            }
            const it = gear[slot]; if (!it) return;
            const sock = it.sockets[idx]; if (!sock) return;
            if (act === 'color') {
                if (el.value === 'none') it.sockets.splice(idx, 1);
                else {
                    sock.color = el.value;
                    if (el.value === 'prismatic') sock.prismaticSkills = [(sock.prismaticSkills && sock.prismaticSkills[0]) || '', (sock.prismaticSkills && sock.prismaticSkills[1]) || ''];
                    else { const valid = JEWEL_ABILITIES[el.value] || []; sock.abilities = (sock.abilities || []).filter((a) => valid.includes(a)); while (sock.abilities.length < 2) sock.abilities.push(''); }
                }
                normalizeSlot(slot); saveGear(); render();
                return;
            }
            if (act === 'level') { sock.jewelLevel = Number(el.value); saveGear(); render(); return; }
            if (act === 'ability') { if (!sock.abilities) sock.abilities = ['', '']; sock.abilities[Number(el.dataset.pos)] = el.value; saveGear(); refreshSide(); return; }
            if (act === 'pline') { if (!sock.prismaticSkills) sock.prismaticSkills = ['', '']; sock.prismaticSkills[Number(el.dataset.pos)] = el.value; saveGear(); refreshSide(); return; }
        });
        // toggle は泡立たないので capture で拾う。
        rootEl.addEventListener('toggle', (ev) => {
            const d = ev.target; const k = d.dataset && d.dataset.fold; if (!k) return;
            if (d.open) openFolds.add(k); else openFolds.delete(k);
        }, true);
        rootEl.addEventListener('input', (ev) => {
            const el = ev.target; const k = el.dataset && el.dataset.dust; if (!k) return;
            dustCalc[k] = Math.max(0, Math.min(99, Number(el.value) || 0));
            const t = rootEl.querySelector('#lg-dust-total'); if (t) t.textContent = fmt(dustCalc.colored * DUST.colored + dustCalc.prismatic * DUST.prismatic);
        });
        rootEl.addEventListener('click', (ev) => {
            const el = ev.target.closest && ev.target.closest('[data-act]'); if (!el || !rootEl.contains(el)) return;
            const act = el.dataset.act;
            if (act === 'add-socket') {
                const item = ensureSlot(el.dataset.slot);
                if (item.sockets.length < 3) { item.sockets.push({ color: 'red', jewelLevel: 0, abilities: ['', ''], prismaticSkills: ['', ''] }); saveGear(); render(); }
            } else if (act === 'bulk') {
                const lv = Number(el.dataset.level);
                GRID_ORDER.forEach((slot) => { const it = gear[slot]; if (it) it.sockets.forEach((s) => { if (s.jewelLevel > 0) s.jewelLevel = lv; }); });
                saveGear(); render(); setMsg(`全ジュエルを Lv.${lv} にしました`);
            } else if (act === 'save-settings') {
                const newMax = Math.max(2, Math.min(20, Number(rootEl.querySelector('#lg-set-max')?.value) || 5));
                const read = (kind, preset) => {
                    const arr = [...rootEl.querySelectorAll(`.lg-set-cost[data-kind="${kind}"]`)].map((x) => Math.max(0, Math.min(9999, Number(x.value) || 0)));
                    while (arr.length < newMax - 1) arr.push(preset[arr.length] != null ? preset[arr.length] : (arr[arr.length - 1] || 5));
                    return arr.slice(0, newMax - 1);
                };
                settings = { maxLevel: newMax, coloredStepCosts: read('colored', COLORED_STEP_COSTS), prismaticStepCosts: read('prismatic', PRISMATIC_STEP_COSTS), isPreset: false };
                saveSettings(); render(); setMsg('ジュエル設定を保存しました');
            } else if (act === 'preset-settings') {
                settings = presetSettings(); saveSettings(); render(); setMsg('クライアントデータの値に戻しました');
            } else if (act === 'export-dl') {
                const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'libae-gear-data.json';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                setMsg('JSON を保存しました');
            } else if (act === 'export-copy') {
                copyText(JSON.stringify(exportData(), null, 2)).then(() => setMsg('JSON をコピーしました'));
            } else if (act === 'reset') { resetAsk = true; render(); }
            else if (act === 'reset-no') { resetAsk = false; render(); }
            else if (act === 'reset-yes') {
                resetAsk = false; gear = blankGear(); settings = presetSettings(); saveGear(); saveSettings(); render(); setMsg('すべて初期化しました');
            }
        });
    }

    return { init, render, setTab };
})();
