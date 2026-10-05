// DEV: Job Art Position。ダッシュボードのキャラカードに敷く職業の絵（透かし）を、
// 職業ごとにどこへどの大きさで置くか合わせるツール。絵は立ち絵か KMS の職業イラストを職ごとに選べる。
// 調整した値はこの端末の localStorage（app.JOB_ART_DRAFT_KEY）に下書きとして持ち、
// ダッシュボードにもすぐ反映される。本番に入れるときは「書き出す」で job_art.js の中身をコピーして貼る。
const jobArtTool = {
    root: null,
    sel: null,
    drag: null,

    init(viewId) {
        this.root = document.getElementById(viewId);
        const all = this.jobs();
        this.sel = (all.find(j => j.id === 'hero') || all[0] || {}).id || null;
        this.render();
    },

    jobs() {
        return typeof CLASS_DATA === 'undefined' ? [] : Object.values(CLASS_DATA).flat();
    },
    job(id) { return this.jobs().find(j => j.id === id); },

    draft() {
        try { return JSON.parse(localStorage.getItem(app.JOB_ART_DRAFT_KEY) || '{}'); } catch (e) { return {}; }
    },
    saveDraft(d) {
        try { localStorage.setItem(app.JOB_ART_DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* 保存できなくても画面上の調整は続けられる */ }
    },
    // コードの値に下書きを重ねた、今の値（使う絵 kind と、その絵の src・位置）
    pos(id) {
        return app.jobArtOf(this.job(id));
    },
    // 位置は今使っている絵のほうに保存する
    setPos(id, p) {
        const d = this.draft();
        d[p.kind === 'illust' ? id + ':illust' : id] = { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), ...(p.f ? { f: 1 } : {}) };
        this.saveDraft(d);
    },
    toggleFlip() {
        const p = this.pos(this.sel);
        this.setPos(this.sel, { ...p, f: !p.f });
        this.renderEdit();
        this.refresh();
    },
    setKind(kind) {
        const j = this.job(this.sel);
        if (!j || (kind === 'illust' && !j.illust)) return;
        const d = this.draft();
        d[j.id + ':use'] = kind;
        this.saveDraft(d);
        this.renderEdit();
        this.refresh();
    },
    state(id) {
        const d = this.draft();
        const k = this.pos(id).kind;
        if (d[k === 'illust' ? id + ':illust' : id] || d[id + ':use']) return 'draft';
        if ((k === 'illust' ? JOB_ART_ILLUST_POS : JOB_ART_POS)[id] || JOB_ART_USE_ILLUST.includes(id)) return 'code';
        return '';
    },

    render() {
        if (!this.root) return;
        const groups = typeof CLASS_DATA === 'undefined' ? {} : CLASS_DATA;
        this.root.innerHTML = `
        <div class="ja">
            <div class="ja-head">
                <div>
                    <h2 class="ja-title">Job Art Position</h2>
                    <p class="ja-note">カードの透かしを、顔がメルと月ボスの帯の右側に見えるように合わせます。絵は職ごとに「立ち絵／イラスト」を選べ、位置はそれぞれ別に持ちます。絵をドラッグで移動、ホイールで拡大縮小。
                    調整はこの端末に下書きとして残り、ダッシュボードにもすぐ出ます。本番に入れるときは「書き出す」でコピーして job_art.js の中身を丸ごと置き換えます。</p>
                </div>
                <div class="ja-actions">
                    <button class="ja-btn ja-btn-main" onclick="jobArtTool.exportCode()">書き出す</button>
                    <button class="ja-btn" onclick="jobArtTool.clearDrafts()">下書きを全部消す</button>
                </div>
            </div>
            <div class="ja-body">
                <div class="ja-list">
                    ${Object.entries(groups).map(([g, list]) => `
                    <div class="ja-grp">${g}</div>
                    ${list.map(j => `
                    <button class="ja-job ${j.id === this.sel ? 'is-sel' : ''}" onclick="jobArtTool.pick('${j.id}')">
                        <img src="${j.path}" alt="" loading="lazy"><span>${j.name}</span>${this.pos(j.id).kind === 'illust' ? '<em class="ja-ill">ILLUST</em>' : ''}
                        <i class="ja-dot ja-dot-${this.state(j.id) || 'none'}" title="${{ draft: '下書きあり', code: 'コードに設定済み' }[this.state(j.id)] || '既定の位置'}"></i>
                    </button>`).join('')}`).join('')}
                </div>
                <div class="ja-edit" id="ja-edit"></div>
            </div>
            <div class="ja-export hidden" id="ja-export">
                <div class="ja-export-head"><span>job_art.js に貼る中身</span><span id="ja-copied" class="ja-copied"></span></div>
                <textarea id="ja-export-text" readonly spellcheck="false"></textarea>
            </div>
        </div>`;
        this.renderEdit();
    },

    pick(id) {
        this.sel = id;
        this.root.querySelectorAll('.ja-job').forEach(b => b.classList.toggle('is-sel', b.getAttribute('onclick').includes(`'${id}'`)));
        this.renderEdit();
    },

    // 実物のカードと同じ mx-* の部品で見本を組む（メル・月ボス・週ボスは見本の値）
    sampleCard(j, p, done) {
        const bosses = (app.data && app.data.masterBosses) || [];
        const mo = bosses.find(b => b.type === 'MONTHLY');
        const wk = bosses.filter(b => b.type === 'WEEKLY').sort((a, b) => b.meso - a.meso)
            .filter((b, i, a) => a.findIndex(x => x.name === b.name) === i).slice(0, 14);
        const ic = (b, cls, nm) => { const img = app.getBossImageUrl(b.name); return `${img ? `<img src="${img}" alt="" onerror="this.nextElementSibling.style.display='';this.remove()">` : ''}<span class="${nm}" ${img ? 'style="display:none"' : ''}>${(bossByEn(b.name) || {}).shortEn || b.name}</span>`; };
        return `
        <div class="mx-card ja-card ${done ? 'mx-done' : ''}" style="--sc:#34d399;--wm:url('${p.src}')${app.jobArtVars(p)}">
            <div class="mx-art"><img src="${j.path}" style="${app.getCharImgStyle({})}">
                <span class="mx-role badge badge-xs badge-warning font-mono font-bold">MAIN</span>
                <div class="mx-id"><div class="mx-lvjob"><span class="mx-lv">Lv.285</span><span class="mx-job">${j.name}</span></div><h3 class="mx-name">Sample</h3></div>
            </div>
            <div class="mx-main" data-ja-drag="1">
                <div class="mx-top"><div class="mx-meso">21,268,095,625<small>mesos</small></div><div class="mx-count"><b>${done ? 15 : 0}</b>/15</div></div>
                ${mo ? `<div class="mx-mo ${done ? 'is-done' : ''}"><span class="mx-mo-boss mx-d-${(mo.difficulty || '').toLowerCase()}"><span class="mx-mo-ic">${ic(mo, '', 'mx-mo-nm')}</span><span class="mx-mo-df">${mo.difficulty}</span></span>${done ? `<div class="mx-mo-done">${Math.floor(mo.meso).toLocaleString()}</div>` : ''}</div>` : ''}
                <div class="mx-wk ${done ? 'is-done' : ''}"><div class="mx-grid">${wk.map(b => `<div class="mx-boss mx-d-${(b.difficulty || '').toLowerCase()}"><div class="mx-boss-ic">${ic(b, '', 'mx-boss-nm')}<span class="mx-boss-df">${b.difficulty}</span></div></div>`).join('')}</div>${done ? '<div class="mx-complete"><i data-lucide="check-circle-2"></i><span>COMPLETE</span></div>' : ''}</div>
                <div class="mx-tools"><span class="mx-tool mx-tool-hexa">HEXA <b>0%</b></span><span class="mx-tool mx-tool-up">UPGRADE</span><span class="mx-tool mx-tool-scout">SCOUTER</span></div>
            </div>
        </div>`;
    },

    renderEdit() {
        const box = document.getElementById('ja-edit');
        const j = this.job(this.sel);
        if (!box || !j) return;
        const p = this.pos(j.id);
        const st = this.state(j.id);
        box.innerHTML = `
            <div class="ja-edit-head">
                <h3>${j.name}</h3>
                <span class="ja-state">${{ draft: '下書き（未書き出し）', code: 'コードに設定済み' }[st] || '既定の位置'}</span>
            </div>
            <div class="ja-ctrl">
                <span class="ja-kind">
                    <button class="${p.kind === 'stand' ? 'is-on' : ''}" onclick="jobArtTool.setKind('stand')">立ち絵</button>
                    <button class="${p.kind === 'illust' ? 'is-on' : ''}" ${j.illust ? '' : 'disabled title="この職のイラストはまだありません"'} onclick="jobArtTool.setKind('illust')">イラスト</button>
                </span>
                <label>大きさ <input type="range" min="20" max="200" value="${p.z}" oninput="jobArtTool.set('z', this.value)"><input type="number" value="${p.z}" onchange="jobArtTool.set('z', this.value)"><em>%</em></label>
                <label>右端から <input type="number" value="${p.x}" onchange="jobArtTool.set('x', this.value)"><em>px</em></label>
                <label>上端から <input type="number" value="${p.y}" onchange="jobArtTool.set('y', this.value)"><em>px</em></label>
                <button class="ja-btn ja-flip ${p.f ? 'is-on' : ''}" onclick="jobArtTool.toggleFlip()">左右反転</button>
                <button class="ja-btn" onclick="jobArtTool.reset()">この職を戻す</button>
            </div>
            <div class="ja-previews">
                <div><div class="ja-cap">未消化</div>${this.sampleCard(j, p, false)}</div>
                <div><div class="ja-cap">全部消し込み済み</div>${this.sampleCard(j, p, true)}</div>
            </div>
            <div class="ja-full">
                <div class="ja-cap">絵の全体（枠が帯に見えている範囲）</div>
                <div class="ja-full-stage" id="ja-full"></div>
            </div>`;
        box.querySelectorAll('[data-ja-drag]').forEach(el => this.bindDrag(el));
        if (typeof lucide !== 'undefined') lucide.createIcons();
        this.drawFull();
    },

    // 絵の全体に、帯（見本カードのボス欄の上 88px）に写る範囲を枠で重ねる
    drawFull() {
        const stage = document.getElementById('ja-full');
        const main = this.root.querySelector('.ja-card .mx-main');
        const j = this.job(this.sel);
        if (!stage || !main || !j) return;
        const p = this.pos(j.id);
        const W = main.clientWidth, H = 88;
        const iw = W * p.z / 100, ih = iw * (p.kind === 'illust' ? 540 / 960 : 400 / 395);
        const left = W - p.x - iw, top = p.y;
        const k = 180 / ih;
        stage.innerHTML = `<img src="${p.src}" style="height:180px${p.f ? ';transform:scaleX(-1)' : ''}"><i class="ja-frame" style="left:${-left * k}px;top:${-top * k}px;width:${W * k}px;height:${H * k}px"></i>`;
    },

    set(key, val) {
        const v = Number(val);
        if (!Number.isFinite(v)) return;
        const p = this.pos(this.sel);
        p[key] = key === 'z' ? Math.min(300, Math.max(10, v)) : v;
        this.setPos(this.sel, p);
        this.refresh();
    },

    // 見本とリストの印だけ描き直す（触っている入力欄はそのまま、スライダーを動かしている最中でも途切れない）
    refresh() {
        const p = this.pos(this.sel);
        this.root.querySelectorAll('.ja-card').forEach(c => {
            app.jobArtVars(p).split(';').filter(Boolean).forEach(kv => {
                const i = kv.indexOf(':');
                c.style.setProperty(kv.slice(0, i), kv.slice(i + 1));
            });
        });
        const inputs = this.root.querySelectorAll('.ja-ctrl input');
        const vals = [p.z, p.z, p.x, p.y];
        inputs.forEach((el, i) => { if (document.activeElement !== el) el.value = vals[i]; });
        const st = this.state(this.sel);
        const stEl = this.root.querySelector('.ja-state');
        if (stEl) stEl.textContent = { draft: '下書き（未書き出し）', code: 'コードに設定済み' }[st] || '既定の位置';
        const btn = [...this.root.querySelectorAll('.ja-job')].find(b => b.getAttribute('onclick').includes(`'${this.sel}'`));
        if (btn) {
            btn.querySelector('.ja-dot').className = `ja-dot ja-dot-${st || 'none'}`;
            const ill = btn.querySelector('.ja-ill');
            if (p.kind === 'illust' && !ill) btn.querySelector('span').insertAdjacentHTML('afterend', '<em class="ja-ill">ILLUST</em>');
            if (p.kind !== 'illust' && ill) ill.remove();
        }
        this.drawFull();
    },

    bindDrag(el) {
        el.addEventListener('pointerdown', e => {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            this.drag = { sx: e.clientX, sy: e.clientY, p: this.pos(this.sel) };
        });
        el.addEventListener('pointermove', e => {
            if (!this.drag) return;
            const { sx, sy, p } = this.drag;
            // 右端からの距離なので、右へ動かすと x は減る
            this.setPos(this.sel, { ...p, x: p.x - (e.clientX - sx), y: p.y + (e.clientY - sy) });
            this.refresh();
        });
        const end = () => { this.drag = null; };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('wheel', e => {
            e.preventDefault();
            const p = this.pos(this.sel);
            this.setPos(this.sel, { ...p, z: Math.min(300, Math.max(10, p.z + (e.deltaY < 0 ? 2 : -2))) });
            this.refresh();
        }, { passive: false });
    },

    // この職の下書き（両方の絵の位置と、どちらを使うか）を消す
    reset() {
        const d = this.draft();
        delete d[this.sel];
        delete d[this.sel + ':illust'];
        delete d[this.sel + ':use'];
        this.saveDraft(d);
        this.renderEdit();
        this.refresh();
    },

    clearDrafts() {
        if (!confirm('この端末の下書きを全部消します。コード（job_art.js）の値は残ります。')) return;
        this.saveDraft({});
        this.render();
    },

    // コードの値と下書きを合わせ、既定と違う職だけを CLASS_DATA の並びで書き出す（job_art.js の中身を丸ごと）
    exportCode() {
        const D = JOB_ART_DEFAULT, I = JOB_ART_ILLUST_DEFAULT;
        const d = this.draft();
        const key = id => /^[a-z_$][\w$]*$/i.test(id) ? id : `'${id}'`;
        const line = (id, p) => `    ${key(id)}: { x: ${p.x}, y: ${p.y}, z: ${p.z}${p.f ? ', f: 1' : ''} },`;
        const diff = (p, b) => p.x !== b.x || p.y !== b.y || p.z !== b.z || !!p.f;
        const jobs = this.jobs();
        const stand = jobs.map(j => ({ id: j.id, p: { ...D, ...(JOB_ART_POS[j.id] || {}), ...(d[j.id] || {}) } })).filter(({ p }) => diff(p, D));
        const illust = jobs.filter(j => j.illust).map(j => ({ id: j.id, p: { ...I, ...(JOB_ART_ILLUST_POS[j.id] || {}), ...(d[j.id + ':illust'] || {}) } })).filter(({ p }) => diff(p, I));
        const use = jobs.filter(j => this.pos(j.id).kind === 'illust').map(j => `'${j.id}'`);
        const rows = [...stand, ...illust];
        const text = `// ダッシュボードのキャラカードに敷く職業の絵（透かし）の、職業ごとの位置と大きさ。
// 値は DEV の Job Art Position で調整して「書き出す」でコピーしたものを貼る（このファイルの中身を丸ごと置き換える）。
// 絵は立ち絵（CharacterIcon.png）か KMS の職業イラスト（Illust.webp、class_data.js の illust）を職ごとに選ぶ。
// キーは class_data.js の id。載っていない職は DEFAULT を使う。
//   x … 絵の右端をカードの右端から何px内側に置くか（マイナスではみ出す）
//   y … 絵の上端を帯の上端から何px下に置くか（マイナスで上にはみ出す）
//   z … 絵の横幅（カードのボス欄の幅に対する%）
//   f … 1 なら左右反転（無ければ反転しない）
const JOB_ART_DEFAULT = { x: ${D.x}, y: ${D.y}, z: ${D.z} };
const JOB_ART_POS = {
${stand.map(r => line(r.id, r.p)).join('\n')}
};

// イラストを使うときの位置と大きさ（立ち絵とは別に持つ。意味は上と同じ）
const JOB_ART_ILLUST_DEFAULT = { x: ${I.x}, y: ${I.y}, z: ${I.z} };
const JOB_ART_ILLUST_POS = {
${illust.map(r => line(r.id, r.p)).join('\n')}
};

// 透かしにイラストを使う職（載っていない職は立ち絵）
const JOB_ART_USE_ILLUST = [${use.join(', ')}];
`;
        const box = document.getElementById('ja-export');
        const ta = document.getElementById('ja-export-text');
        const msg = document.getElementById('ja-copied');
        box.classList.remove('hidden');
        ta.value = text;
        ta.rows = Math.min(24, rows.length + 16);
        const done = ok => { msg.textContent = ok ? `立ち絵${stand.length}職・イラスト${illust.length}職ぶん（イラスト使用${use.length}職）をコピーしました` : 'コピーできなかったので、下の欄から選んでコピーしてください'; };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
        else done(false);
        ta.focus(); ta.select();
    }
};
