// community_import.js — 名簿の一括登録。
//
// コミュニティのスプレッドシートをそのまま貼り付けて名簿を作る。列は
//   Discord名 / D1での名前 / 表示名 / キャラ1(メイン) / キャラ2 / …
// で、キャラ名から レベル・職・画像 をランキングAPIで取る。
//
// Boss Scheduler の既存データとの対応:
//   人   … 「D1での名前」で突き合わせる（名簿には Scheduler のメンバーが
//           そのDiscord名で移行されているため）
//   キャラ… Schedulerのキャラは "D1名(職略称)" という名前で実在のIGNを持たない。
//           そこで、APIで取れた職と既存キャラの職を突き合わせ、一致したものは
//           id を保ったまま実名に置き換える。idを保つので、そのキャラに付いて
//           いる参加希望とPT編成はそのまま生きる。
//   照合できなかったものは最後にまとめて報告する（黙って結び付けない）。
(function () {
    'use strict';

    const CS = () => window.communityStore;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // 突き合わせ用のゆるい正規化。全角/半角・大小・濁点半濁点の揺れを吸収する。
    // 「ぎすば / ぎすぱ」「ぱると / ばると」のような差はシート側とD1側で実際に出る。
    function loose(s) {
        return String(s || '')
            .normalize('NFKC')
            .toLowerCase()
            .replace(/[゙゚゛゜]/g, '')   // 結合・単独の濁点半濁点
            .normalize('NFD').replace(/[゙゚]/g, '').normalize('NFC')
            .replace(/[\s　]/g, '');
    }
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Boss Scheduler のキャラ名に入っている職の略称 → CLASS_DATA のid。
    // 値が空のものは略称だけでは職を決められないので、対応を取らず報告に回す。
    const JOB_ALIAS = {
        'AB': 'angelicbuster', 'DB': 'dualblade', 'DK': 'darkknight',
        'イリウム': 'illium', 'エリル': 'erellight', 'エヴァン': 'evan',
        'カイザー': 'kaiser', 'カンナ': 'kanna', 'カーリー': 'khali',
        'キネシス': 'kinesis', 'シア': 'sia', 'シャドー': 'shadower',
        'ゼノン': 'xenon', 'ゼロ': 'zero', 'ソルマス': 'dawnwarrior',
        'ハヤト': 'hayato', 'バトルメイジ': 'battlemage', 'ミハエル': 'mihile',
        'ララ': 'lara', 'リン': 'lynn', 'レン': 'ren', '聖魔(カンナ)': 'kanna',
        'BM': '', 'BaM': '', 'CBM': '', 'レン/エリル': ''
    };

    // 既存キャラの職を推定する。jobId があればそれ、無ければ名前の "(略称)" から。
    function classOf(c) {
        if (c.jobId) return c.jobId;
        const m = String(c.name || '').match(/[(（]([^)）]+)[)）]\s*$/);
        if (m) {
            const alias = JOB_ALIAS[m[1].trim()];
            if (alias) return alias;
        }
        if (c.job && typeof CLASS_DATA !== 'undefined') {
            const t = norm(c.job);
            for (const list of Object.values(CLASS_DATA)) {
                const hit = list.find((j) => norm(j.name) === t);
                if (hit) return hit.id;
            }
        }
        return '';
    }

    // 「(予定)」が付いたキャラはまだ作られていない。名前からは外し、メモに残す。
    function cleanName(raw) {
        const s = String(raw || '').trim();
        const m = s.match(/^(.*?)[(（]\s*予定\s*[)）]$/);
        return m ? { name: m[1].trim(), note: '予定' } : { name: s, note: '' };
    }

    function parseSheet(text) {
        const rows = [];
        String(text || '').split(/\r?\n/).forEach((line) => {
            if (!line.trim()) return;
            const cells = line.split('\t').map((c) => c.trim());
            // 見出し行は読み飛ばす
            if (/^discord/i.test(cells[0]) || cells[0] === 'Discord名') return;
            const discord = cells[0];
            if (!discord) return;
            const seen = new Set();
            const chars = [];
            cells.slice(3).forEach((raw) => {
                if (!raw) return;
                const c = cleanName(raw);
                if (!c.name) return;
                const key = c.name.toLowerCase();
                if (seen.has(key)) return;   // 同じ行に同じ名前が2回出ることがある
                seen.add(key);
                chars.push(c);
            });
            rows.push({ discord, d1: cells[1] || '', display: cells[2] || '', chars });
        });
        return rows;
    }

    // 名簿の中から、この行の人を探す。Discord名 → D1名 → 表示名 の順に見て、
    // 完全一致で見つからなければゆるい一致を試す。
    function findMember(members, row) {
        const keys = [row.discord, row.d1, row.display].filter(Boolean);
        for (const k of keys) {
            const hit = members.find((m) => m.discordName === k || (m.displayName && m.displayName === k));
            if (hit) return { member: hit, by: 'exact', key: k };
        }
        for (const k of keys) {
            const lk = loose(k);
            const hit = members.find((m) => loose(m.discordName) === lk || (m.displayName && loose(m.displayName) === lk));
            if (hit) return { member: hit, by: 'loose', key: k };
        }
        return null;
    }

    const importer = {
        running: false,

        // キャラ名を改行区切りで貼るだけの一括登録。
        // 割り当て先を選ばなければ「未割り当て」に入り、名簿の未割り当てタブで人に振れる。
        openChars() {
            const cs = CS();
            if (!cs) { alert('名簿ストアが読み込まれていません'); return; }
            const me = cs.me();
            const veil = document.createElement('div');
            veil.className = 'cm-veil top';
            veil.innerHTML = `<div class="modal">
    <h2>キャラを一括追加</h2>
    <p class="note" style="margin-top:0">キャラ名を1行に1つずつ貼り付けてください。
        レベル・職・画像はキャラ名からAPIで取得します。</p>
    <div class="fld"><label>割り当て先</label>
        <select data-x="member"><option value="">（人に割り当てない → 未割り当てへ）</option>${
            cs.members().map((m) => `<option value="${m.id}" ${me && me.id === m.id ? 'selected' : ''}>${esc(cs.labelWithHandle(m))}</option>`).join('')
        }</select></div>
    <div class="fld"><label>ギルド（任意）</label><input data-x="guild" type="text" placeholder="例: Yoglet"></div>
    <textarea data-x="names" placeholder="CharName1&#10;CharName2&#10;CharName3" style="min-height:170px"></textarea>
    <div data-x="progress" class="note" style="display:none"></div>
    <div data-x="report" class="note" style="display:none"></div>
    <div class="foot"><span class="grow"></span>
        <button data-x="close">閉じる</button>
        <button class="primary" data-x="run">追加する</button>
    </div>
</div>`;
            document.body.appendChild(veil);
            const $ = (k) => veil.querySelector(`[data-x="${k}"]`);

            veil.addEventListener('click', async (e) => {
                if (e.target === veil && !this.running) return veil.remove();
                const b = e.target.closest('[data-x]');
                if (!b || b.tagName === 'TEXTAREA' || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
                if (b.dataset.x === 'close') { if (!this.running) veil.remove(); return; }
                if (b.dataset.x !== 'run' || this.running) return;

                const names = $('names').value.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
                if (!names.length) { $('progress').style.display = ''; $('progress').textContent = 'キャラ名を入力してください'; return; }

                this.running = true;
                b.disabled = true;
                const guild = ($('guild').value || '').trim();
                const target = cs.memberById($('member').value);
                const known = new Set(cs.characters().concat(cs.pending()).map((c) => c.name.toLowerCase()));
                const added = [], skipped = [], missed = [];

                for (let i = 0; i < names.length; i++) {
                    const raw = names[i];
                    $('progress').style.display = '';
                    $('progress').textContent = `取得中 ${i + 1}/${names.length} … ${raw}`;
                    if (known.has(raw.toLowerCase())) { skipped.push(raw); continue; }
                    let info = null;
                    try { info = await window.community.lookup(raw); } catch (err) { /* 見つからない扱い */ }
                    if (!info) missed.push(raw);
                    const c = {
                        id: cs.uid('c'),
                        name: (info && info.name) || raw,
                        guild,
                        level: info ? info.level : 0,
                        job: info ? info.job : '',
                        jobId: info ? info.jobId : '',
                        imgURL: info ? info.imgURL : '',
                        worldID: info ? info.worldID : null,
                        isMain: false, note: '', combatPower: 0, hexa: 0, isActive: true,
                        fetchedAt: info ? info.fetchedAt : '', updatedAt: cs.now()
                    };
                    known.add(c.name.toLowerCase());
                    cs.mutate((members, pending) => {
                        if (target) { c.isMain = !target.characters.length; target.characters.push(c); }
                        else pending.push(c);
                    });
                    added.push(c.name);
                    await sleep(250);
                }

                this.running = false;
                b.disabled = false;
                $('progress').textContent = `完了 — ${added.length}体を追加しました`;
                $('report').style.display = '';
                $('report').innerHTML =
                    `<b>${added.length}体</b>を${target ? esc(cs.label(target)) + ' に' : '未割り当てとして'}追加しました。` +
                    (skipped.length ? `<br>既に登録済みで飛ばした: ${skipped.map(esc).join(', ')}` : '') +
                    (missed.length ? `<br>ランキングAPIで見つからず、レベル・職が空のもの: ${missed.map(esc).join(', ')}` : '');
                if (window.community) window.community.render();
            });
        },

        open() {
            const cs = CS();
            if (!cs) { alert('名簿ストアが読み込まれていません'); return; }
            const veil = document.createElement('div');
            veil.className = 'cm-veil top';
            veil.innerHTML = `<div class="modal wide">
    <h2>スプレッドシートから一括登録</h2>
    <p class="note" style="margin-top:0">
        タブ区切りで <b>Discord名 / D1での名前 / 表示名 / キャラ1(メイン) / キャラ2 …</b> の順に貼り付けてください。
        キャラ名から レベル・職・画像 をAPIで取得します（キャラ数ぶん時間がかかります）。<br>
        Boss Scheduler の既存メンバーは「D1での名前」で、キャラは<b>職</b>で突き合わせます。
        一致したキャラは id を保ったまま実名に置き換わるので、参加希望とPT編成はそのまま残ります。
    </p>
    <div class="row">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px">ギルド名
            <input data-x="guild" type="text" value="Yoglet" style="width:130px"></label>
        <label class="chk"><input type="checkbox" data-x="overwrite">既存のキャラ名も上書きする</label>
        <span class="spacer" style="flex:1"></span>
        <button data-x="load-seed">同梱のデータを読み込む</button>
    </div>
    <textarea data-x="sheet" placeholder="ここにスプレッドシートを貼り付け" style="min-height:200px"></textarea>
    <div data-x="progress" class="note" style="display:none"></div>
    <div data-x="report" style="display:none;max-height:230px;overflow:auto;border:1px solid var(--ln);
        border-radius:8px;padding:10px;margin-top:10px;font-size:11.5px;line-height:1.8"></div>
    <div class="foot">
        <span class="grow"></span>
        <button data-x="close">閉じる</button>
        <button class="primary" data-x="run">取り込む</button>
    </div>
</div>`;
            document.body.appendChild(veil);

            const $ = (k) => veil.querySelector(`[data-x="${k}"]`);
            const close = () => { if (!this.running) veil.remove(); };

            // 同梱の community_seed.tsv があれば読み込む（無ければ何もしない）。
            fetch('community_seed.tsv', { cache: 'no-store' })
                .then((r) => (r.ok ? r.text() : null))
                .then((t) => { if (t && !$('sheet').value) $('sheet').value = t; })
                .catch(() => { /* 無くてよい */ });

            veil.addEventListener('click', async (e) => {
                if (e.target === veil) return close();
                const b = e.target.closest('[data-x]');
                if (!b || b.tagName === 'TEXTAREA' || b.tagName === 'INPUT') return;
                if (b.dataset.x === 'close') return close();
                if (b.dataset.x === 'load-seed') {
                    try {
                        const r = await fetch('community_seed.tsv', { cache: 'no-store' });
                        if (!r.ok) throw new Error('community_seed.tsv がありません');
                        $('sheet').value = await r.text();
                    } catch (err) { $('progress').style.display = ''; $('progress').textContent = err.message; }
                    return;
                }
                if (b.dataset.x !== 'run' || this.running) return;

                const rows = parseSheet($('sheet').value);
                if (!rows.length) { $('progress').style.display = ''; $('progress').textContent = '読み取れる行がありません'; return; }

                this.running = true;
                b.disabled = true;
                $('close').disabled = true;
                const report = await this.run(rows, {
                    guild: ($('guild').value || '').trim(),
                    overwrite: $('overwrite').checked,
                    onProgress: (t) => { $('progress').style.display = ''; $('progress').textContent = t; }
                });
                this.running = false;
                b.disabled = false;
                $('close').disabled = false;
                $('report').style.display = '';
                $('report').innerHTML = report;
            });
        },

        async run(rows, opts) {
            const cs = CS();
            const members = cs.members();
            const guild = opts.guild;
            const stats = { members: 0, created: 0, chars: 0, linked: 0, added: 0, notFound: [], looseMatched: [], leftover: [] };

            const total = rows.reduce((a, r) => a + r.chars.length, 0);
            let done = 0;

            for (const row of rows) {
                let hit = findMember(members, row);
                let m;
                if (hit) {
                    m = hit.member;
                    if (hit.by === 'loose') stats.looseMatched.push(`${row.discord} ← ${m.discordName}`);
                } else {
                    m = {
                        id: cs.uid('m'), discordName: row.discord, displayName: '', note: '',
                        colorIdx: members.length % cs.COLORS.length, createdAt: cs.now(), characters: []
                    };
                    members.push(m);
                    stats.created++;
                }
                m.discordName = row.discord;
                m.displayName = row.display || m.displayName || '';
                stats.members++;

                // このメンバーの既存キャラを職で引けるようにしておく。
                // 1体を2回使わないよう、対応が取れたものは候補から外す。
                const pool = m.characters.map((c) => ({ c, cls: classOf(c) }));
                const used = new Set();

                for (const entry of row.chars) {
                    done++;
                    opts.onProgress(`取得中 ${done}/${total} … ${entry.name}`);
                    let info = null;
                    try {
                        info = await window.community.lookup(entry.name);
                    } catch (e) { /* 通信エラーは「見つからない」と同じ扱いにする */ }
                    if (!info) stats.notFound.push(`${row.display || row.discord} / ${entry.name}`);
                    stats.chars++;

                    const cls = info ? info.jobId : '';
                    const slot = cls
                        ? pool.find((p) => p.cls && p.cls === cls && !used.has(p.c.id))
                        : null;

                    if (slot) {
                        used.add(slot.c.id);
                        const c = slot.c;
                        // idはそのまま（希望とPT編成が参照している）。戦闘力やメモも残す。
                        c.name = info.name || entry.name;
                        c.level = info.level;
                        c.job = info.job;
                        c.jobId = info.jobId;
                        if (info.imgURL) c.imgURL = info.imgURL;
                        c.guild = guild;
                        if (entry.note && !c.note) c.note = entry.note;
                        c.updatedAt = cs.now();
                        stats.linked++;
                    } else {
                        // 同名のキャラが既にいれば作り直さない
                        const same = m.characters.find((c) => c.name.toLowerCase() === entry.name.toLowerCase());
                        if (same) {
                            if (info && (opts.overwrite || !same.level)) {
                                same.level = info.level; same.job = info.job; same.jobId = info.jobId;
                                if (info.imgURL) same.imgURL = info.imgURL;
                            }
                            same.guild = guild;
                            used.add(same.id);
                        } else {
                            m.characters.push({
                                id: cs.uid('c'),
                                name: (info && info.name) || entry.name,
                                guild,
                                level: info ? info.level : 0,
                                job: info ? info.job : '',
                                jobId: info ? info.jobId : '',
                                imgURL: info ? info.imgURL : '',
                                worldID: info ? info.worldID : null,
                                isMain: !m.characters.length,
                                note: entry.note || '',
                                combatPower: 0, hexa: 0, isActive: true,
                                fetchedAt: info ? info.fetchedAt : '',
                                updatedAt: cs.now()
                            });
                            stats.added++;
                        }
                    }
                    await sleep(250);   // APIを続けざまに叩かない
                }

                // シートに出てこなかった既存キャラ（Scheduler由来で職が特定できなかった等）
                pool.forEach((p) => {
                    if (!used.has(p.c.id) && /[(（].+[)）]\s*$/.test(p.c.name)) {
                        stats.leftover.push(`${row.display || row.discord} / ${p.c.name}`);
                    }
                });

                // メインは先頭（シートの1体目）に揃える
                if (m.characters.length) {
                    const mainName = row.chars.length ? row.chars[0].name.toLowerCase() : '';
                    m.characters.forEach((c) => { c.isMain = false; });
                    const main = m.characters.find((c) => c.name.toLowerCase() === mainName) || m.characters[0];
                    main.isMain = true;
                }
            }

            cs.replaceAll(members);
            opts.onProgress(`完了 — ${stats.members}人 / ${stats.chars}キャラを処理しました`);

            const list = (title, arr) => arr.length
                ? `<div style="margin-top:8px"><b>${esc(title)}（${arr.length}）</b><br>${arr.map(esc).join('<br>')}</div>`
                : '';
            return `<b>${stats.members}人</b>（新規 ${stats.created}人） / <b>${stats.chars}キャラ</b>を処理<br>` +
                `Schedulerの既存キャラと職で対応が取れた: <b>${stats.linked}</b>体 · 新規登録: <b>${stats.added}</b>体` +
                list('ゆるい一致で結び付けた人（要確認）', stats.looseMatched) +
                list('ランキングAPIで見つからなかったキャラ（レベル・職は手入力してください）', stats.notFound) +
                list('シートに出てこなかったScheduler由来のキャラ（職で対応が取れず。手動で整理してください）', stats.leftover);
        }
    };

    window.communityImport = importer;
})();
