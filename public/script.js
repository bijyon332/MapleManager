// 起動時に読むのは config / class_data / community_store とこのファイルだけ。
// 各アプリのHTML断片とJSは、そのアプリを初めて開いたときに読む（APPS / loadAppAssets）。
// Chart.js は EXP Leaderboard と HEXA だけが使う。
const CHART_JS = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

const app = {
    data: { config: { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' }, characters: [], masterBosses: [], memo: "" },
    lastLoginDate: null, lastCheckAt: null, activeCharId: null,
    currentApp: 'planner',
    bcCharId: null, bcSelected: {}, bcParty: {}, bcDiff: {},
    DEFAULT_IMG_OFFSET_X: 50,
    DEFAULT_IMG_OFFSET_Y: 50,
    DEFAULT_IMG_SCALE: 100,

    // ランキングAPIの職名から CLASS_DATA のエントリを引く。改名された職は
    // CLASS_ALIASES で旧エントリへ読み替える（例: Blade Master → Dual Blade）。
    classByJobName(jobName) {
        if (typeof CLASS_DATA === 'undefined' || !jobName) return null;
        const t = String(jobName).toLowerCase().replace(/[^a-z0-9]/g, '');
        const aliasId = (window.CLASS_ALIASES || {})[t];
        return Object.values(CLASS_DATA).flat()
            .find(j => (aliasId ? j.id === aliasId : j.name.toLowerCase().replace(/[^a-z0-9]/g, '') === t)) || null;
    },

    // 職業の絵の透かしの位置と大きさ（job_art.js）。DEV の Job Art Position で調整中の値
    // （この端末の localStorage）があればそちらを優先して、ダッシュボードですぐ確かめられるようにする。
    JOB_ART_DRAFT_KEY: 'mm-jobart-draft',
    jobArtDraft() {
        try { return JSON.parse(localStorage.getItem(this.JOB_ART_DRAFT_KEY) || '{}'); } catch (e) { return {}; /* 読めなければ下書きなし */ }
    },
    // 職の透かしに使う絵（立ち絵 stand／イラスト illust）と、その絵用の位置。
    // 下書きのキーは 立ち絵の位置＝id、イラストの位置＝id:illust、どちらを使うか＝id:use
    jobArtOf(cls) {
        const d = this.jobArtDraft();
        const use = d[cls.id + ':use'] || (JOB_ART_USE_ILLUST.includes(cls.id) ? 'illust' : 'stand');
        const kind = cls.illust && use === 'illust' ? 'illust' : 'stand';
        const pos = kind === 'illust'
            ? { ...JOB_ART_ILLUST_DEFAULT, ...(JOB_ART_ILLUST_POS[cls.id] || {}), ...(d[cls.id + ':illust'] || {}) }
            : { ...JOB_ART_DEFAULT, ...(JOB_ART_POS[cls.id] || {}), ...(d[cls.id] || {}) };
        return { ...pos, id: cls.id, kind, src: kind === 'illust' ? cls.illust : cls.path };
    },
    jobArtFor(char) {
        const all = typeof CLASS_DATA === 'undefined' ? [] : Object.values(CLASS_DATA).flat();
        const cls = all.find(j => j.path === char.classImage) || this.classByJobName(char.job);
        return cls ? this.jobArtOf(cls) : null;
    },
    // f（左右反転）のときは透かしの欄ごと裏返すので、位置を left 基準にして見た目は右端からの距離のままにする
    jobArtVars(pos) {
        return pos.f
            ? `;--wm-pos:left ${pos.x}px top ${pos.y}px;--wm-size:${pos.z}% auto;--wm-flip:-1;--wm-mask:to left`
            : `;--wm-pos:right ${pos.x}px top ${pos.y}px;--wm-size:${pos.z}% auto;--wm-flip:1;--wm-mask:to right`;
    },
    // カードの角の飾り線に使うサーバー色（Tailwind の色名 → 400 の値）
    SERVER_HEX: { emerald: '#34d399', purple: '#c084fc', violet: '#a78bfa', indigo: '#818cf8', sky: '#38bdf8', cyan: '#22d3ee', teal: '#2dd4bf', amber: '#fbbf24', yellow: '#facc15', orange: '#fb923c', rose: '#fb7185', red: '#f87171', pink: '#f472b6', blue: '#60a5fa', lime: '#a3e635', green: '#4ade80' },
    getCharImgStyle(char) {
        // Slider value: 0 = image at left, 100 = image at right (intuitive).
        // CSS object-position is inverted, so we flip when applying.
        const x = char?.imgOffsetX ?? this.DEFAULT_IMG_OFFSET_X;
        const cssX = 100 - x;
        return `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cssX}% center;`;
    },

    // Nexon Ranking APIへのリクエスト: CORSプロキシ経由（フォールバック付き）
    async _fetchRanking(characterName, timeoutMs = 15000) {
        const nexonUrl = `https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=${encodeURIComponent(characterName)}`;
        const endpoints = [
            `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(nexonUrl)}`,
            `/api?name=${encodeURIComponent(characterName)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(nexonUrl)}`,
            `https://corsproxy.io/?${encodeURIComponent(nexonUrl)}`
        ];
        const errors = [];
        for (const url of endpoints) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(tid);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (data && data.error) throw new Error(data.error);
                return { data, usedUrl: url };
            } catch (e) {
                const msg = e.name === 'AbortError' ? 'timeout' : e.message;
                errors.push(`${url.split('?')[0]}: ${msg}`);
                console.warn(`API attempt failed (${url}):`, msg);
            }
        }
        throw new Error('All API endpoints failed. ' + errors.join(' | '));
    },


    init() {
        this.loadData();
        // Ensure ALL is default if activeServer is invalid
        if (!['KRONOS', 'CHALLENGER', 'ALL'].includes(this.data.config.activeServer)) {
            this.data.config.activeServer = 'ALL';
        }
        this.checkResets();
        this.startResetWatcher();
        this.startClock();
        lucide.createIcons();
        this.syncConfigUI();
        this.updateServerUI();
        this.navigate('dashboard');
        this.loadJobSelect();
        this.initCommunity();
        this.prefetchHexa();
        this.initAppRouting();
    },
    loadJobSelect() {
        if (typeof CLASS_DATA === 'undefined') return;
        const sel = document.getElementById('char-job-select');
        if (!sel) return;
        sel.innerHTML = '<option value="">Select a Class</option>';
        Object.keys(CLASS_DATA).forEach(group => {
            const grp = document.createElement('optgroup');
            grp.label = group;
            CLASS_DATA[group].forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls.id;
                opt.innerText = cls.name;
                opt.dataset.group = group;
                opt.dataset.path = cls.path;
                opt.dataset.name = cls.name;
                grp.appendChild(opt);
            });
            sel.appendChild(grp);
        });
    },
    onJobSelect(val) {
        const sel = document.getElementById('char-job-select');
        const opt = sel.options[sel.selectedIndex];
        const f = document.getElementById('char-form');
        if (val && opt) {
            f.job.value = opt.dataset.name;
            // 立ち絵の位置のプレビュー（カードは職業の画像を使う）
            const posImg = document.getElementById('pos-preview-img');
            if (posImg) { posImg.src = opt.dataset.path; posImg.style.display = ''; }
        }
        this.updateCharAvatar();
    },

    // 左上の画像: Fetch で取れたキャラ画像があればそれ、無ければ職業の画像。
    updateCharAvatar() {
        const f = document.getElementById('char-form');
        const img = document.getElementById('char-avatar-img');
        const ph = document.getElementById('char-avatar-ph');
        if (!f || !img) return;
        const sel = document.getElementById('char-job-select');
        const opt = sel && sel.value ? sel.options[sel.selectedIndex] : null;
        const src = (f.image.value && f.image.value.startsWith('http')) ? f.image.value : (opt ? opt.dataset.path : '');
        img.onerror = () => { img.classList.add('hidden'); if (ph) ph.classList.remove('hidden'); };
        if (src) { img.src = src; img.classList.remove('hidden'); if (ph) ph.classList.add('hidden'); }
        else { img.removeAttribute('src'); img.classList.add('hidden'); if (ph) ph.classList.remove('hidden'); }
    },

    togglePortraitPop(force) {
        const pop = document.getElementById('portrait-pop');
        if (!pop) return;
        const show = typeof force === 'boolean' ? force : pop.classList.contains('hidden');
        pop.classList.toggle('hidden', !show);
    },

    setCharRole(v) {
        const f = document.getElementById('char-form');
        f.role.value = v;
        document.querySelectorAll('#cm-role [data-v]').forEach(b => b.classList.toggle('cm-on', b.dataset.v === v));
    },

    setCharServer(v) {
        const f = document.getElementById('char-form');
        f.server.value = v;
        document.querySelectorAll('#cm-server [data-v]').forEach(b => {
            const on = b.dataset.v === v;
            b.classList.toggle('cm-on', on);
            b.classList.toggle('cm-kr', on && v === 'KRONOS');
            b.classList.toggle('cm-ch', on && v === 'CHALLENGER');
        });
    },

    // 編集中のキャラの HEXA / Upgrade Priority を開く。保存前の新規キャラでは押せない。
    openLinkedFromModal(kind) {
        const cid = this.activeCharId;
        if (!cid) return;
        this.closeCharModal();
        if (kind === 'hexa' && typeof hexaTracker !== 'undefined') hexaTracker.openForCharacter(cid);
        if (kind === 'gear') this.openGearForCharacter(cid);
    },

    onImagePosChange() {
        const x = parseInt(document.getElementById('pos-x-slider')?.value ?? this.DEFAULT_IMG_OFFSET_X);
        const cssX = 100 - x;
        const img = document.getElementById('pos-preview-img');
        if (img) img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cssX}% center;`;
        const xv = document.getElementById('pos-x-val'); if (xv) xv.innerText = `${x}%`;
    },

    resetImagePos() {
        const xs = document.getElementById('pos-x-slider');
        if (xs) xs.value = this.DEFAULT_IMG_OFFSET_X;
        this.onImagePosChange();
    },

    applyImagePosToUI(char) {
        const xs = document.getElementById('pos-x-slider');
        const img = document.getElementById('pos-preview-img');
        if (xs) xs.value = char?.imgOffsetX ?? this.DEFAULT_IMG_OFFSET_X;
        const cls = char ? (char.classImage || (this.classByJobName(char.job) || {}).path || '') : '';
        if (img) { img.src = cls; img.style.display = ''; }
        this.onImagePosChange();
    },
    // Planner のデータはこのブラウザだけのもの（共有DBには載せない）。
    // ただしコミュニティ名簿で「自分」を選んでいるときは、その人ごとに分けて持つ。
    // 1台のPCを何人かで使っても、名前を切り替えれば各自の週ボスが出てくる。
    //
    // キーに使うのは Discord名。メンバーidは名簿を共有DBから読み直すたびに
    // 振り直されることがあり、idをキーにすると「保存先が勝手に変わって
    // 前のデータが行方不明になる」事故が起きる。
    plannerKey() {
        const cs = window.communityStore;
        const me = cs && cs.me();
        return me ? `gms_v24_data::${me.discordName}` : 'gms_v24_data';
    },
    // 未保存の人に切り替えたときの初期値。既存の this.data を使い回すと
    // 前の人のキャラがそのまま残ってしまうので、必ず新しい入れ物を作る。
    emptyPlannerData() {
        return {
            config: { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' },
            characters: [], masterBosses: this.bossMaster([]), memo: ''
        };
    },
    // 「自分」を選ぶ前のデータや、旧いキー方式で保存されたデータを拾う。
    // 見つけた元のキーは消さずに残すので、取り違えても元に戻せる。
    findLegacyPlannerData(key) {
        const cs = window.communityStore;
        const me = cs && cs.me();
        if (me) {
            // 一時期この形式で保存していた（メンバーidをキーにしていた頃のもの）
            const byId = localStorage.getItem(`gms_v24_data::${me.id}`);
            if (byId) return byId;
        }
        // 「自分」を選ぶ前から使っていたデータ。最初に選んだ人だけが引き継ぐ。
        const claimedBy = localStorage.getItem('gms_v24_legacy_owner');
        if (!claimedBy || claimedBy === key) {
            const legacy = localStorage.getItem('gms_v24_data');
            if (legacy) { localStorage.setItem('gms_v24_legacy_owner', key); return legacy; }
        }
        return null;
    },
    // ボスの名前・難易度・結晶価格は保存データに持たず、毎回 config.js の DEFAULT_BOSSES から作る。
    // 以前は最初に開いたときの一覧をそのまま保存していたので、config.js で価格を直しても
    // 既存の利用者には届かなかった。DEFAULT_BOSSES に無いid（昔のタスク画面で足した自作ボス）だけは
    // 選択が消えないよう保存データから引き継ぐ。
    bossMaster(saved) {
        const out = DEFAULT_BOSSES.map(b => ({ ...b }));
        const have = new Set(out.map(b => b.id));
        (Array.isArray(saved) ? saved : []).forEach(b => { if (b && b.id && !have.has(b.id)) out.push({ ...b }); });
        return out;
    },
    loadData() {
        const key = this.plannerKey();
        this.dataKey = key;   // この this.data がどのキーの中身なのかを覚えておく
        try {
            let stored = localStorage.getItem(key);
            if (!stored && key !== 'gms_v24_data') stored = this.findLegacyPlannerData(key);
            if (stored) {
                this.data = JSON.parse(stored);
                this.data.masterBosses = this.bossMaster(this.data.masterBosses);
                if (!this.data.config) this.data.config = { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' };
            } else {
                this.data = this.emptyPlannerData();
            }
            this.lastLoginDate = localStorage.getItem('gms_v24_date') || new Date().toISOString().split('T')[0];
            // Migrate the old date-only marker: treat it as that day's 00:00 UTC.
            const checked = parseInt(localStorage.getItem('gms_v24_checked'), 10);
            this.lastCheckAt = Number.isFinite(checked) ? checked : Date.parse(this.lastLoginDate + 'T00:00:00Z');
        } catch (e) {
            this.data = this.emptyPlannerData();
        }
    },
    // 保存先は「いま画面に出しているデータを読み込んだキー」でなければならない。
    // 名簿の読み込みは非同期なので、起動直後と読み込み後で plannerKey() の値が
    // 変わりうる。そのズレたまま書くと、別のキーを空データで潰してしまう。
    saveData(opts) {
        const key = this.plannerKey();
        if (this.dataKey && key !== this.dataKey) {
            console.warn('[Planner] 保存先が変わったため書き込みを見送り、読み直します:', this.dataKey, '→', key);
            this.loadData();
            this.renderDashboard();
            this.renderCharacters();
            return;
        }
        // 中身のある記録を空のデータで潰さない（キャラの全削除は allowEmpty で通す）。
        if (!(opts && opts.allowEmpty) && !this.data.characters.length) {
            const prev = localStorage.getItem(key);
            if (prev) {
                try {
                    const old = JSON.parse(prev);
                    if (old && Array.isArray(old.characters) && old.characters.length) {
                        console.warn('[Planner] 空のデータで既存の記録を上書きしようとしたので中止しました:', key);
                        return;
                    }
                } catch (e) { /* 壊れている記録なら上書きしてよい */ }
            }
        }
        localStorage.setItem(key, JSON.stringify(this.data));
        localStorage.setItem('gms_v24_date', new Date().toISOString().split('T')[0]);
    },

    // 名簿で「自分」を選び直したときに、その人の Planner データへ入れ替える。
    switchPlannerOwner(memberId) {
        const cs = window.communityStore;
        if (!cs) return;
        this.saveData();          // いま開いている人の分を確定させてから
        cs.setMe(memberId);
        this.loadData();
        this.syncConfigUI();
        this.updateServerUI();
        this.navigate('characters');
        this.renderCommunityBar();
    },

    setServer(s) {
        if (this.data.config.activeServer === s) {
            this.data.config.activeServer = 'ALL';
        } else {
            this.data.config.activeServer = s;
        }
        this.saveData();
        this.updateServerUI();
        this.renderDashboard();
        this.renderCharacters();
        this.syncConfigUI();
    },

    syncConfigUI() {
        const cmEl = document.getElementById('config-char-crystals');
        const wmEl = document.getElementById('config-world-crystals');
        if (cmEl) cmEl.value = this.data.config.charMaxCrystals || 14;
        if (wmEl) wmEl.value = this.data.config.worldMaxCrystals || 180;
    },

    updateServerUI() {
        const srv = this.data.config.activeServer;
        const kBtn = document.getElementById('btn-server-kronos');
        const cBtn = document.getElementById('btn-server-challenger');

        if (kBtn && cBtn) {
            const base = "px-2 py-0.5 text-[11px] font-bold transition-all border";

            const kActive = "bg-emerald-950/40 text-emerald-200 border-emerald-800 shadow-sm";
            const cActive = "bg-purple-950/40 text-purple-200 border-purple-800 shadow-sm";
            const inactive = "text-slate-500 border-transparent hover:text-slate-300";

            if (srv === 'KRONOS') {
                kBtn.className = `${base} ${kActive}`;
                cBtn.className = `${base} ${inactive}`;
            } else if (srv === 'CHALLENGER') {
                kBtn.className = `${base} ${inactive}`;
                cBtn.className = `${base} ${cActive}`;
            } else {
                kBtn.className = `${base} ${kActive}`;
                cBtn.className = `${base} ${cActive}`;
            }
        }

        // Quick-add server toggle on Characters view
        const qK = document.getElementById('btn-quick-srv-kronos');
        const qC = document.getElementById('btn-quick-srv-challenger');
        if (qK && qC) {
            const qBase = "px-3 py-1.5 rounded text-[11px] font-bold transition-all";
            const qkActive = "bg-emerald-600 text-white shadow-sm";
            const qcActive = "bg-purple-600 text-white shadow-sm";
            const qIn = "text-slate-400 hover:text-white";
            if (srv === 'KRONOS') { qK.className = `${qBase} ${qkActive}`; qC.className = `${qBase} ${qIn}`; }
            else if (srv === 'CHALLENGER') { qK.className = `${qBase} ${qIn}`; qC.className = `${qBase} ${qcActive}`; }
            else { qK.className = `${qBase} ${qkActive}`; qC.className = `${qBase} ${qcActive}`; }
        }
    },
    saveConfig() {
        this.data.config.charMaxCrystals = parseInt(document.getElementById('config-char-crystals').value) || 14;
        this.data.config.worldMaxCrystals = parseInt(document.getElementById('config-world-crystals').value) || 180;
        this.saveData();
        this.renderDashboard();
    },
    setRevenueMode(mode) {
        if ((this.data.config.revenueMode || 'weekly') === mode) return;
        this.data.config.revenueMode = mode;
        this.saveData(); this.renderDashboard();
    },
    async fetchCharacterData(e) {
        if (e && e.preventDefault) e.preventDefault();
        const f = document.getElementById('char-form');
        const fetchBtn = document.getElementById('btn-fetch');
        const errMsg = document.getElementById('fetch-error-msg');

        if (!f) return;
        const name = f.name.value;
        if (!name) return;

        // エラーメッセージを非表示にリセット
        if (errMsg) { errMsg.classList.add('hidden'); errMsg.textContent = ''; }

        // Fetchボタンをスピナー状態にする
        if (fetchBtn) {
            fetchBtn.disabled = true;
            fetchBtn.innerHTML = `<svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> `;
            fetchBtn.classList.add('opacity-70', 'cursor-not-allowed');
        }

        // コンソールログヘルパー
        const L = (step, status, msg) => console.log(`[Fetch][${status}] ${step}: ${msg}`);

        // Fetchボタンを元に戻す関数
        const resetBtn = () => {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.innerHTML = '<i data-lucide="download" class="w-3.5 h-3.5"></i>Fetch';
                if (window.lucide) lucide.createIcons();
                fetchBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            }
        };

        try {
            L('API', 'INFO', `Fetching ranking data for "${name}"...`);
            const { data, usedUrl } = await this._fetchRanking(name);
            L('API', 'OK', `Source: ${usedUrl}`);
            L('RAW JSON', 'DATA', JSON.stringify(data));
            L('PARSE', 'INFO', `totalCount=${data.totalCount ?? 'N/A'}, ranks=${Array.isArray(data.ranks) ? data.ranks.length : 'missing'}`);

            if (data.ranks && data.ranks.length > 0) {
                const char = data.ranks.find(r => r.characterName.toLowerCase() === name.toLowerCase()) || data.ranks[0];

                L('MATCH', 'OK', `Found: ${char.characterName} Lv.${char.level} (${char.jobName})`);
                L('FIELDS', 'INFO', `imgURL=${char.characterImgURL ? 'present' : 'missing'}, worldID=${char.worldID}, rank=${char.rank}`);

                f.level.value = char.level;
                f.job.value = char.jobName;
                L('FORM', 'OK', `level=${char.level}, job=${char.jobName}`);

                // Job Mapping to CLASS_DATA
                let foundJobId = "";
                let foundJobImg = "";
                {
                    const matchedJob = this.classByJobName(char.jobName);
                    if (matchedJob) {
                        foundJobId = matchedJob.id;
                        foundJobImg = matchedJob.path;
                        L('JOB MAP', 'OK', `"${char.jobName}" → ${matchedJob.name} (id:${matchedJob.id})`);
                    } else {
                        L('JOB MAP', 'WARN', `No CLASS_DATA match for "${char.jobName}"`);
                    }
                }

                // Update Job Select Dropdown
                const jobSelect = document.getElementById('char-job-select');
                if (jobSelect && foundJobId) {
                    jobSelect.value = foundJobId;
                    this.onJobSelect(foundJobId);
                    L('DROPDOWN', 'OK', `Job select updated to: ${foundJobId}`);
                }

                // Image Handling
                if (char.characterImgURL) {
                    f.image.value = char.characterImgURL;
                    L('IMAGE', 'OK', `Set: ${char.characterImgURL.substring(0, 80)}...`);
                } else {
                    L('IMAGE', 'WARN', 'No characterImgURL in API response');
                }
                this.updateCharAvatar();

                L('DONE', 'OK', 'Fetch complete');
            } else {
                L('PARSE', 'FAIL', `No character found. ranks array is ${data.ranks ? 'empty' : 'missing'}`);
                if (errMsg) { errMsg.textContent = `Failed to fetch: No character found with name "${name}".`; errMsg.classList.remove('hidden'); }
            }
        } catch (error) {
            console.error("Failed to fetch character data:", error);
            if (errMsg) { errMsg.textContent = `Failed to fetch character data. Please try again later.`; errMsg.classList.remove('hidden'); }
        } finally {
            resetBtn();
        }
    },
    // Reset boundaries are UTC midnight, i.e. 09:00 JST.
    //   daily   : every day
    //   weekly  : Thursday
    //   monthly : the 1st
    // Each returns the most recent boundary at or before `now`, so the check is a
    // plain "did we cross it since the last check?" and works no matter how many
    // days the app went unopened.
    lastDailyReset(now) {
        return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    },
    lastWeeklyReset(now) {
        const back = (now.getUTCDay() - 4 + 7) % 7; // days since the last Thursday
        return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back);
    },
    lastMonthlyReset(now) {
        return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    },

    // Returns true if any progress was cleared, so callers can re-render.
    checkResets() {
        const now = new Date();
        const last = this.lastCheckAt;
        if (!last) { this.markChecked(now); return false; }

        const daily = last < this.lastDailyReset(now);
        const weekly = last < this.lastWeeklyReset(now);
        const monthly = last < this.lastMonthlyReset(now);
        if (!daily && !weekly && !monthly) return false;

        const typeOf = {};
        this.data.masterBosses.forEach(b => { typeOf[b.id] = b.type; });
        // Drops ids that no longer exist in masterBosses as well.
        const keep = (ids, types) => (ids || []).filter(id => typeOf[id] && !types.includes(typeOf[id]));

        this.data.characters.forEach(c => {
            if (!c.progress) return;
            if (daily) {
                c.progress.boss = keep(c.progress.boss, ['DAILY']);
            }
            if (weekly) {
                c.progress.charDone = false;
                c.progress.boss = keep(c.progress.boss, ['WEEKLY']);
            }
            if (monthly) {
                c.progress.charMonthlyDone = false;
                c.progress.boss = keep(c.progress.boss, ['MONTHLY']);
            }
        });
        this.markChecked(now);
        this.saveData();
        return true;
    },
    markChecked(now) {
        this.lastCheckAt = now.getTime();
        localStorage.setItem('gms_v24_checked', String(this.lastCheckAt));
    },
    // The tab can stay open across 09:00 JST, so keep checking while it runs.
    startResetWatcher() {
        setInterval(() => {
            if (this.checkResets() && this.currentApp === 'planner') {
                this.renderDashboard();
                this.renderCharacters();
            }
        }, 60000);
    },
    startClock() { setInterval(() => { const n = new Date(); document.getElementById('clock-jst').innerText = n.toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); document.getElementById('clock-utc').innerText = n.toISOString().split('T')[1].split('.')[0]; }, 1000); },
    navigate(view) {
        ['dashboard', 'characters', 'system'].forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.add('hidden-page');
        });
        document.querySelectorAll('[id^="nav-"]').forEach(e => e.classList.remove('tab-active'));
        document.getElementById(`view-${view}`).classList.remove('hidden-page');
        document.querySelectorAll(`[id="nav-${view}"]`).forEach(e => e.classList.add('tab-active'));
        if (view === 'dashboard') this.renderDashboard(); if (view === 'characters') this.renderCharacters();
    },

    // ---------------------------------------------------------
    //  アプリの登録表
    // ---------------------------------------------------------
    // 左サイドバーのアイコン1つ = ここの1エントリ。switchApp はこの表しか見ない。
    //
    //   view    … 表示する #view-* の id
    //   nav     … 上部バーに出すアプリ専用サブナビの id
    //   html    … view の中身として初回に読み込むHTML断片
    //   cdn     … 同じく初回に読み込むが、外部CDN頼みなので失敗しても先に進むもの
    //   scripts … 初回に読み込むJS。上から順に読み、読み終わるまで init は呼ばない
    //   init    … 初回オープン時に1度だけ
    //   reopen  … 2回目以降オープンするたびに
    //   open    … 読み込みと関係なく、オープンのたびに同期で
    //
    // planner だけは navigate() が中の画面を持っているので view を持たない。
    // 上部バーの並びも planner のときだけ元に戻す（chrome: 'planner'）。
    APPS: {
        planner: {
            chrome: 'planner',
            open() { this.navigate('dashboard'); }
        },
        jobart: {
            view: 'view-jobart',
            scripts: ['job_art_tool.js'],
            init() { jobArtTool.init('view-jobart'); },
            reopen() { jobArtTool.render(); }
        },
        cheatsheet: {
            view: 'view-cheatsheet',
            scripts: ['cheatsheet.js'],
            init() { cheatsheet.init('view-cheatsheet'); }
        },
        scouter: {
            view: 'view-scouter',
            scripts: ['hexa_data.js', 'hexa_tracker.js', 'scouter_reader.js', 'scouter_bosscut.js', 'scouter.js'],
            init() { scouter.init('view-scouter'); },
            reopen() { scouter.render(); }
        },
        kmsvideos: {
            view: 'view-kmsvideos',
            scripts: ['kms_videos.js'],
            init() { kmsVideos.init('view-kmsvideos'); }
        },
        ranks: {
            view: 'view-ranks',
            nav: 'ranks-nav',
            html: 'ranks.html',
            cdn: [CHART_JS],
            scripts: ['exp_data.js', 'ranks.js'],
            init() { ranks.init(); lucide.createIcons(); }
        },
        scheduler: {
            view: 'view-scheduler',
            nav: 'scheduler-nav',
            // 中身は iframe（boss_scheduler.html）。初回に src を入れたら以降はそのまま。
            open() {
                const frame = document.getElementById('scheduler-frame');
                if (frame && !frame.getAttribute('src')) frame.setAttribute('src', 'boss_scheduler.html');
            }
        },
        gear: {
            view: 'view-gear-priority',
            scripts: ['gear_items.js', 'cube_rates.js', 'gear_reader.js', 'gear_priority.js'],
            init() { gearPriority.init('gear-priority-root'); }
        },
        community: {
            view: 'view-community',
            nav: 'community-nav',
            scripts: ['community.js', 'community_import.js'],
            init() { community.init('community-root'); lucide.createIcons(); }
        },
        exp: {
            view: 'view-exp-sim',
            html: 'exp_sim.html',
            scripts: ['exp_data.js', 'exp_sim.js'],
            init() { expSim.init(); lucide.createIcons(); }
        },
        cost: {
            view: 'view-cost-calc',
            scripts: ['cost_calc.js'],
            init() { costCalc.init(); }
        },
        hexa: {
            view: 'view-hexa',
            nav: 'hexa-nav',
            cdn: [CHART_JS],
            scripts: ['hexa_data.js', 'hexa_tracker.js'],
            init() { hexaTracker.init(); },
            reopen() { hexaTracker.syncPageNav(); }
        },
        liberation: {
            view: 'view-liberation-calc',
            nav: 'liberation-nav',
            // liberation_calc.js の createLiberationCalc を3つが読み込み時点で使うので、
            // 必ずこの順で読む。
            scripts: ['liberation_calc.js', 'genesis_calc.js', 'destiny_calc.js', 'astra_calc.js'],
            init() {
                genesisCalc.init('genesis-calc-root');
                destinyCalc.init('destiny-calc-root');
                astraCalc.init('astra-calc-root');
            }
        }
    },

    // ---------------------------------------------------------
    //  URL とアプリの対応
    // ---------------------------------------------------------
    // アプリごとに共有できるよう、開いているアプリを URL のハッシュに出す
    // （/#hexa, /#scheduler …）。名前は APPS のキーそのまま。planner はハッシュ無し。
    // パス（/hexa）にしないのは、静的アセットが拡張子なしのURLを .html に解決するので
    // /ranks で断片の ranks.html が返ってしまうのと、Worker 側の振り分けが要るため。
    // ?view=1 などのクエリはそのまま残す。
    appFromHash() {
        let name = location.hash.slice(1);
        try { name = decodeURIComponent(name); } catch (e) { /* 壊れた %xx はそのまま照合して外れる */ }
        return Object.hasOwn(this.APPS, name) ? name : 'planner';
    },

    appUrl(appName) {
        const base = location.pathname + location.search;
        return appName === 'planner' ? base : `${base}#${appName}`;
    },

    initAppRouting() {
        // 戻る・進むと、アドレスバーでハッシュを書き換えたとき。
        // 両方来ることがあるが、同じアプリなら何もしないので二重には切り替わらない。
        const follow = () => {
            const name = this.appFromHash();
            if (name !== this.currentApp) this.switchApp(name, { fromUrl: true });
        };
        window.addEventListener('popstate', follow);
        window.addEventListener('hashchange', follow);

        const first = this.appFromHash();
        // 知らない名前のハッシュは、ダッシュボードを出したうえで URL からも消す。
        if (first === 'planner' && location.hash) history.replaceState(null, '', this.appUrl('planner'));
        if (first !== 'planner') this.switchApp(first, { fromUrl: true });
    },

    // サイドバーの開閉。起動時の状態は index.html の </aside> 直後で当てている。
    toggleSidebar() {
        const collapsed = document.getElementById('sidebar').classList.toggle('collapsed');
        try { localStorage.setItem('mm-sidebar-collapsed', collapsed ? '1' : '0'); } catch (e) {}
    },

    switchApp(appName, { fromUrl = false } = {}) {
        const entry = this.APPS[appName];
        if (!entry) return;
        this.currentApp = appName;

        // サイドバーから切り替えたときは履歴に積む（ブラウザの戻るで前のアプリへ）。
        // URL から来たときは、URL の方が既に正しいので触らない。
        if (!fromUrl) {
            const url = this.appUrl(appName);
            if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
        }

        document.querySelectorAll('[id^="app-"]').forEach(e => e.classList.remove('menu-active'));
        const appBtn = document.getElementById(`app-${appName}`);
        if (appBtn) appBtn.classList.add('menu-active');

        document.querySelectorAll('[id^="view-"]').forEach(e => e.classList.add('hidden-page'));
        this.applyChrome(entry.chrome === 'planner');

        // アプリ専用サブナビ（APPS の nav）は、そのアプリのときだけ出す。
        Object.values(this.APPS).map(a => a.nav).filter(Boolean).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const on = (entry.nav === id);
            el.classList.toggle('hidden', !on);
            el.classList.toggle('flex', on);
        });

        if (entry.view) document.getElementById(entry.view).classList.remove('hidden-page');
        if (entry.open) entry.open.call(this);
        if (entry.html || entry.scripts || entry.cdn || entry.init || entry.reopen) {
            this.openApp(appName).catch(e => console.error(e));
        }
    },

    // 上部バーの並び。planner は自前のサブナビとダッシュボード統計を出し、
    // 他のアプリはそれを畳んで時計を右端に寄せる。
    applyChrome(isPlanner) {
        const display = isPlanner ? '' : 'none';
        const headerNav = document.querySelector('header nav');
        const dashStats = document.getElementById('dashboard-stats-container');
        const clockEl = document.querySelector('header > div:last-child');
        if (headerNav) headerNav.style.display = display;
        if (dashStats) dashStats.style.display = display;
        if (clockEl) clockEl.classList.toggle('ml-auto', !isPlanner);
    },

    // ---------------------------------------------------------
    //  アプリの遅延読み込み
    // ---------------------------------------------------------
    // 起動時に読むのは config / class_data / community_store / script だけ。
    // 各アプリのHTML断片とJSは、そのアプリを初めて開いたときに読む。
    _scripts: {},   // src -> 読み込みの Promise
    _html: {},      // url -> 読み込みの Promise
    _assets: {},    // アプリ名 -> 断片とJSを読み終えた Promise
    _started: {},   // アプリ名 -> init を呼んだか

    loadScript(src) {
        if (this._scripts[src]) return this._scripts[src];
        const p = new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = () => resolve();
            el.onerror = () => reject(new Error(`読み込めませんでした: ${src}`));
            document.head.appendChild(el);
        });
        // 失敗したものは覚えない。次に開いたときにもう一度試せるようにする。
        p.catch(() => { delete this._scripts[src]; });
        return this._scripts[src] = p;
    },

    loadHtml(url, targetId) {
        if (this._html[url]) return this._html[url];
        const p = (async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`読み込めませんでした: ${url} (${res.status})`);
            document.getElementById(targetId).innerHTML = await res.text();
        })();
        p.catch(() => { delete this._html[url]; });
        return this._html[url] = p;
    },

    // HTML断片とJSを読むところまで。init は呼ばない。
    // 読み込み中にもう一度呼ばれても、同じ Promise を返すので二重には走らない。
    loadAppAssets(name) {
        if (this._assets[name]) return this._assets[name];
        const entry = this.APPS[name];
        const p = (async () => {
            if (entry.html) await this.loadHtml(entry.html, entry.view);
            // 外部CDNのものは、落ちていてもアプリごと死なせない。
            // Chart.js が無ければグラフだけ出ない、という形で済ませる。
            for (const src of entry.cdn || []) {
                await this.loadScript(src).catch(e => console.error(e));
            }
            // JSは順番に読む。前のファイルが定義したものを、次のファイルが
            // 読み込み時点で使うことがある（liberation_calc → genesis_calc など）。
            for (const src of entry.scripts || []) await this.loadScript(src);
        })();
        p.catch(() => { delete this._assets[name]; });
        return this._assets[name] = p;
    },

    async openApp(name) {
        const entry = this.APPS[name];
        try {
            await this.loadAppAssets(name);
        } catch (e) {
            console.error(e);
            const box = entry.view && document.getElementById(entry.view);
            if (box) {
                box.innerHTML = `<div class="text-center py-20 text-slate-500 text-xs">
                    読み込みに失敗しました。ページを再読み込みしてください。<br>
                    <span class="text-slate-600">${e.message}</span></div>`;
            }
            return;
        }
        if (!this._started[name]) {
            this._started[name] = true;
            if (entry.init) entry.init.call(this);
        } else if (entry.reopen) {
            entry.reopen.call(this);
        }
    },

    // HEXA は「アプリ」であると同時に、Planner のキャラカードに進捗バッジを出す側でもある
    // （renderCharacters / renderDashboard 内の hexaReady を参照）。開かれるまで待つと、
    // HEXAを一度も開かない人にはバッジが出ないままになるので、起動直後の空いたところで
    // 裏で読んでおき、読み終わったら描き直す。起動そのものからは外れる（約190KB）。
    // init は呼ばない。hexaTracker は ensureLoaded() で init 前でも動くようにしてある。
    prefetchHexa() {
        const start = () => this.loadAppAssets('hexa').then(() => {
            if (this.currentApp === 'planner') { this.renderDashboard(); this.renderCharacters(); }
        }).catch(e => console.error(e));
        if (window.requestIdleCallback) requestIdleCallback(start, { timeout: 3000 });
        else setTimeout(start, 1000);
    },

    // Drives the Boss Scheduler's tabs from the top bar. The scheduler runs in
    // an iframe and keeps its own tab buttons (hidden), so we click those and
    // mirror the active state onto the header buttons.
    schedulerTab(tab) {
        const frame = document.getElementById('scheduler-frame');
        const doc = frame && frame.contentDocument;
        if (doc) {
            const btn = doc.getElementById(`tab-${tab}`);
            if (btn) btn.click();
        }
        this.schedulerTabState(tab);
    },

    // The scheduler can also switch screens on its own (e.g. "この編成を開く" on
    // the dashboard). It calls back here so the top-bar buttons stay in sync.
    schedulerTabState(tab) {
        ['members', 'builder', 'dashboard'].forEach(t => {
            const b = document.getElementById(`snav-${t}`);
            if (!b) return;
            b.classList.toggle('tab-active', t === tab);
        });
    },

    switchLiberationTab(tab) {
        ['genesis', 'destiny', 'astra'].forEach(t => {
            document.getElementById(`lib-content-${t}`).classList.toggle('hidden', t !== tab);
            const btn = document.getElementById(`lib-tab-btn-${t}`);
            btn.classList.toggle('tab-active', t === tab);
        });
    },

    getRoleStyle(role) {
        if (role === 'MAIN') return 'bg-yellow-500/20 text-yellow-100 border border-yellow-500/50';
        if (role === 'SUB') return 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/50';
        return 'bg-slate-700/50 text-slate-300 border border-slate-600';
    },

    getEmptyPlaceholderHTML(message = "None", colSpan = "") {
        return `<div class="bg-slate-900/30 border border-slate-800/50 rounded flex items-center justify-center min-h-[22px] ${colSpan}">
                    <span class="text-[9px] text-slate-600 font-mono italic tracking-wider">${message}</span>
                </div>`;
    },

    getBadgeClass(diff) {
        const d = diff?.toUpperCase();
        if (d === 'EASY') return 'badge-easy';
        if (d === 'NORMAL') return 'badge-normal';
        if (d === 'HARD') return 'badge-hard';
        if (d === 'CHAOS') return 'badge-chaos';
        if (d === 'EXTREME') return 'badge-extreme';
        return 'badge-normal';
    },


    // 上部バーの収入欄。左に「週 / 月」の切り替え、右寄せでサーバーごとの枠（左線がサーバー色）。
    // 枠の中は、左に結晶の個数（上限で赤）と上限までの進み具合のバー、右にサーバー名と収入（全桁）。
    // Kronos / Challenger の枠はそのままサーバーの切り替えボタンを兼ねる（別の切り替えボタンを置くと上部バーに収まらない）。
    // 幅を固定して、桁が変わっても横の並びを動かさない。
    headerStatsHTML({ revMode, k, c, worldLimit, kOn, cOn }) {
        const full = n => Math.floor(n).toLocaleString();
        const srv = (key, name, color, s, on) => `
            <button type="button" onclick="app.setServer('${key}')" title="${name} に切り替え（結晶 ${s.count}/${worldLimit}、残り ${Math.max(0, worldLimit - s.count)}）"
                class="mm-srv border-l-${color}-400 ${on ? '' : 'opacity-45 hover:opacity-80'}">
                <span class="flex flex-col items-center gap-1 leading-none">
                    <span class="font-mono text-[11px] ${s.count >= worldLimit ? 'text-red-400' : 'text-slate-300'}">${s.count}/${worldLimit}</span>
                    <progress class="progress w-12 h-1 text-${color}-400" value="${Math.min(s.count, worldLimit)}" max="${worldLimit}"></progress>
                </span>
                <span class="flex flex-col items-end gap-1 leading-none">
                    <span class="text-[10px] font-bold tracking-widest text-${color}-400">${name.toUpperCase()}</span>
                    <span class="mm-srv-v">${full(s.rev)}</span>
                </span>
            </button>`;
        const seg = (mode, label) => `<button type="button" class="btn btn-xs join-item ${revMode === mode ? 'btn-primary btn-soft text-indigo-300' : 'text-slate-500'}" onclick="app.setRevenueMode('${mode}')">${label}</button>`;
        return `
            <div class="flex items-center gap-2 w-full min-w-0">
                <div class="join shrink-0" title="収入の集計期間">${seg('weekly', '週')}${seg('monthly', '月')}</div>
                <div class="flex-1"></div>
                ${srv('KRONOS', 'Kronos', this.data.config.serverKColor || 'emerald', k, kOn)}
                ${srv('CHALLENGER', 'Challenger', this.data.config.serverCColor || 'purple', c, cOn)}
            </div>`;
    },

    renderDashboard() {
        const c = document.getElementById('dashboard-list');
        const e = document.getElementById('empty-state');
        const headerRev = document.getElementById('header-revenue');
        const headerCry = document.getElementById('header-crystals');
        const revenueLabel = document.getElementById('label-revenue');
        const labelParent = document.getElementById('revenue-label-container');
        if (!c) return;
        const charLimitForSort = this.data.config.charMaxCrystals || 14;
        const computeCharMesos = (char) => {
            const settings = char.settings || { boss_ids: [], boss_party_sizes: {} };
            const ps = settings.boss_party_sizes || {};
            const wk = this.data.masterBosses
                .filter(b => (settings.boss_ids || []).includes(b.id) && b.type === 'WEEKLY')
                .map(b => b.meso / (ps[b.id] || 1))
                .sort((a, b) => b - a)
                .slice(0, charLimitForSort)
                .reduce((s, v) => s + v, 0);
            const monthly = this.data.masterBosses
                .filter(b => (settings.boss_ids || []).includes(b.id) && b.type === 'MONTHLY')
                .map(b => b.meso / (ps[b.id] || 1))
                .reduce((s, v) => s + v, 0);
            return wk + monthly / 4; // normalize monthly to weekly-equivalent
        };
        const activeChars = this.data.characters
            .filter(char => (this.data.config.activeServer === 'ALL' || char.server === this.data.config.activeServer) && !char.hidden)
            .sort((a, b) => computeCharMesos(b) - computeCharMesos(a));

        if (activeChars.length === 0) {
            c.innerHTML = ''; if (e) e.classList.remove('hidden');
            const statsContainer = document.getElementById('dashboard-stats-container');
            if (statsContainer) {
                statsContainer.innerHTML = this.headerStatsHTML({ revMode: this.data.config.revenueMode || 'weekly', k: { rev: 0, count: 0 }, c: { rev: 0, count: 0 }, worldLimit: this.data.config.worldMaxCrystals || 180, kOn: false, cOn: false });
                lucide.createIcons();
            }
            return;
        }
        if (e) e.classList.add('hidden');

        const charLimit = this.data.config.charMaxCrystals || 14;
        const worldLimit = this.data.config.worldMaxCrystals || 180;
        const revMode = this.data.config.revenueMode || 'weekly';

        const calcStats = (chars) => {
            let allCrystals = [], monthlyRev = 0;
            chars.filter(c => !c.hidden).forEach(char => {
                const settings = char.settings || { boss_ids: [] };
                const partySizes = settings.boss_party_sizes || {};
                const charWeekly = this.data.masterBosses
                    .filter(b => (settings.boss_ids || []).includes(b.id) && b.type === 'WEEKLY')
                    .map(b => ({ ...b, effectiveMeso: b.meso / (partySizes[b.id] || 1) }))
                    .sort((a, b) => b.effectiveMeso - a.effectiveMeso);
                allCrystals = allCrystals.concat(charWeekly.slice(0, charLimit));
                const charMonthly = this.data.masterBosses
                    .filter(b => (settings.boss_ids || []).includes(b.id) && b.type === 'MONTHLY')
                    .map(b => ({ ...b, effectiveMeso: b.meso / (partySizes[b.id] || 1) }));
                monthlyRev += charMonthly.reduce((sum, b) => sum + b.effectiveMeso, 0);
            });
            allCrystals.sort((a, b) => b.effectiveMeso - a.effectiveMeso);
            const valid = allCrystals.slice(0, worldLimit);
            const weeklyRev = valid.reduce((sum, b) => sum + b.effectiveMeso, 0);
            return { count: valid.length, weekly: weeklyRev, monthly: monthlyRev };
        };

        const kStats = calcStats(this.data.characters.filter(c => c.server === 'KRONOS'));
        const cStats = calcStats(this.data.characters.filter(c => c.server === 'CHALLENGER'));

        const rev = (s) => Math.floor(revMode === 'monthly' ? (s.weekly * 4 + s.monthly) : s.weekly);

        const activeSrv = this.data.config.activeServer;
        const kOpacity = activeSrv === 'ALL' || activeSrv === 'KRONOS' ? 'opacity-100' : 'opacity-40';
        const cOpacity = activeSrv === 'ALL' || activeSrv === 'CHALLENGER' ? 'opacity-100' : 'opacity-40';

        const statsContainer = document.getElementById('dashboard-stats-container');
        if (statsContainer) {
            statsContainer.innerHTML = this.headerStatsHTML({ revMode, k: { rev: rev(kStats), count: kStats.count }, c: { rev: rev(cStats), count: cStats.count }, worldLimit, kOn: kOpacity === 'opacity-100', cOn: cOpacity === 'opacity-100' });
        }

        const addCardHTML = `
            <button type="button" onclick="app.openAddCharacterFromDashboard()" class="bg-slate-900/40 hover:bg-slate-800/60 border border-dashed border-slate-700 hover:border-indigo-500 flex flex-col items-center justify-center gap-2 transition-all w-full max-w-[32rem] text-slate-500 hover:text-indigo-300 group">
                <div class="w-14 h-14 rounded-full bg-slate-800 group-hover:bg-indigo-600/20 border border-slate-700 group-hover:border-indigo-500 flex items-center justify-center transition-all"><i data-lucide="plus" class="w-7 h-7"></i></div>
                <div class="text-sm font-bold">Add Character</div>
                <div class="text-[10px] text-slate-600 group-hover:text-slate-400">Fetch from Ranking API by name</div>
            </button>`;

        c.innerHTML = activeChars.map(char => {
            const p = char.progress || { daily: [], weekly: [], boss: [] };
            const settings = char.settings || { boss_ids: [] };
            const partySizes = settings.boss_party_sizes || {};
            const cB = this.data.masterBosses.filter(b => (settings.boss_ids || []).includes(b.id)).map(b => ({ ...b, pSize: partySizes[b.id] || 1, effectiveMeso: b.meso / (partySizes[b.id] || 1) })).sort((a, b) => b.effectiveMeso - a.effectiveMeso);
            const dB = cB.filter(b => b.type === 'DAILY'), wB = cB.filter(b => b.type === 'WEEKLY'), mB = cB.filter(b => b.type === 'MONTHLY');
            const localMaxTotal = wB.slice(0, charLimit).reduce((s, b) => s + b.effectiveMeso, 0);

            const isKronos = char.server === 'KRONOS';
            const sCol = isKronos ? (this.data.config.serverKColor || 'emerald') : (this.data.config.serverCColor || 'purple');
            const themeClass = `border-${sCol}-500/50`;
            const badgeClass = `text-${sCol}-400 bg-${sCol}-950/30 border-${sCol}-500/20`;
            const hexaReady = (typeof hexaTracker !== 'undefined');
            const hexaClassId = hexaReady ? hexaTracker.getCharClassId(char) : null;
            const hexaPct = hexaClassId ? hexaTracker.getProgress('char:' + char.id, hexaClassId).pct : 0;
            let gearSaved = false, scout = null;
            try { const sc = JSON.parse(localStorage.getItem('mapleManager_scouter_v1') || '{}')['char:' + char.id]; if (sc && sc.result && sc.result.b300 > 0) scout = sc.result; } catch (e) { /* 読めなければ未入力扱い */ }
            try { gearSaved = !!localStorage.getItem('gms-gear-priority::char:' + char.id); } catch (e) { /* 読めなければ未入力扱い */ }

            // Sort each section
            const wkSorted = wB.sort((a, b) => b.effectiveMeso - a.effectiveMeso);
            const isWeeklyDone = !!p.charDone;
            const isMonthlyDone = !!p.charMonthlyDone;
            const countAll = (isWeeklyDone ? wkSorted.length : 0) + (isMonthlyDone ? mB.length : 0);
            const allDone = (wkSorted.length + mB.length > 0) && (!wkSorted.length || isWeeklyDone) && (!mB.length || isMonthlyDone);

            // 月ボス1行・週ボス2行の枠は必ず取り、全カードの高さを揃える。
            // 枠に収まらない分は最後のマスを「+N and more」にする（中身はツールチップ）。
            // ボスは画像だけのマス（難易度は画像の下部に重ねてフル表記）。欄をクリックするとキャラ単位でまとめて消し込む。
            const tiles = (list, max) => {
                const shown = list.length > max ? list.slice(0, max - 1) : list;
                const rest = list.slice(shown.length);
                return shown.map(b => {
                    const img = this.getBossImageUrl(b.name);
                    const d = (b.difficulty || '').toLowerCase();
                    return `<div class="mx-boss mx-d-${d}" title="${b.difficulty} ${b.name}${b.pSize > 1 ? ` ×${b.pSize}` : ''}">
                        <div class="mx-boss-ic">${img ? `<img src="${img}" alt="" onerror="this.nextElementSibling.style.display='';this.remove()">` : ''}<span class="mx-boss-nm" ${img ? 'style="display:none"' : ''}>${(bossByEn(b.name) || {}).shortEn || b.name}</span>${b.pSize > 1 ? `<i class="mx-boss-ps">×${b.pSize}</i>` : ''}<span class="mx-boss-df">${b.difficulty}</span></div></div>`;
                }).join('') + (rest.length ? `<div class="mx-boss mx-boss-more" title="${rest.map(b => `${b.difficulty} ${b.name}`).join('\n')}"><div class="mx-boss-ic">+${rest.length}<span class="mx-boss-df">more</span></div></div>` : '');
            };
            // 消し込み済みは元のカードと同じ「COMPLETE」（枠を色で囲み、中を沈める）
            const completeMark = `<div class="mx-complete"><i data-lucide="check-circle-2"></i><span>COMPLETE</span></div>`;
            const art = char.classImage ? this.jobArtFor(char) : null;

            return `
            <div class="mx-card ${allDone ? 'mx-done' : ''}" style="--sc:${this.SERVER_HEX[sCol] || '#94a3b8'}${char.classImage ? `;--wm:url('${(art && art.src) || char.classImage}')${this.jobArtVars(art || JOB_ART_DEFAULT)}` : ''}">
                <div class="mx-art" onclick="app.openCharModal('${char.id}')" title="Edit ${char.name}">
                    ${char.image ? `
                    <img class="mx-avatar" src="${char.image}" alt="${char.name}" onerror="this.remove()">` : (char.classImage ? `<img src="${char.classImage}" style="${this.getCharImgStyle(char)}">` : '')}
                    <span class="mx-role mx-role-${(char.role || '').toLowerCase()}">${char.role}</span>
                    <div class="mx-id">
                        <div class="mx-lv">Lv.${char.level || '?'}</div>
                        <h3 class="mx-name">${char.name}</h3>
                        <div class="mx-job">${char.job || '—'}</div>
                    </div>
                </div>
                <div class="mx-main">
                    <div class="mx-top">
                        <div class="mx-meso" title="週の収入（上位${charLimit}体）">${Math.floor(localMaxTotal).toLocaleString()}<small>mesos</small></div>
                        <div class="mx-count"><b>${countAll}</b>/${wkSorted.length + mB.length}</div>
                    </div>
                    ${mB.length ? `
                    <div class="mx-mo ${isMonthlyDone ? 'is-done' : ''}" onclick="app.toggleCharDone('${char.id}','monthly')" title="${isMonthlyDone ? 'クリックで消し込みを解除' : 'クリックで月ボスを消し込む'}">
                        ${mB.slice(0, 2).map(b => { const img = this.getBossImageUrl(b.name); return `
                        <span class="mx-mo-boss mx-d-${(b.difficulty || '').toLowerCase()}">
                            <span class="mx-mo-ic" title="${b.difficulty} ${b.name}">${img ? `<img src="${img}" alt="" onerror="this.nextElementSibling.style.display='';this.remove()">` : ''}<span class="mx-mo-nm" ${img ? 'style="display:none"' : ''}>${(bossByEn(b.name) || {}).shortEn || b.name}</span></span>
                            <span class="mx-mo-df">${b.difficulty}</span>
                        </span>`; }).join('')}
                        ${isMonthlyDone ? `${completeMark}<span class="mx-mo-meso">${Math.floor(mB.reduce((s, b) => s + b.effectiveMeso, 0)).toLocaleString()}</span>` : ''}
                    </div>` : '<div class="mx-mo mx-mo-none">月ボスなし</div>'}
                    <div class="mx-wk ${isWeeklyDone ? 'is-done' : ''}" ${wkSorted.length ? `onclick="app.toggleCharDone('${char.id}','weekly')" title="${isWeeklyDone ? 'クリックで消し込みを解除' : 'クリックで週ボスをまとめて消し込む'}"` : ''}>
                        ${wkSorted.length ? `<div class="mx-grid">${tiles(wkSorted, 14)}</div>${isWeeklyDone ? completeMark : ''}` : '<div class="mx-none mx-none-wk">週ボスなし</div>'}
                    </div>
                    <div class="mx-tools">
                        ${hexaReady ? `<button onclick="hexaTracker.openForCharacter('${char.id}')" class="mx-tool mx-tool-hexa"><span class="mx-bar" style="width:${hexaPct}%"></span>${hexaClassId ? `HEXA <b>${hexaPct}%</b>` : 'HEXA 登録'}</button>` : ''}
                        <button onclick="app.openGearForCharacter('${char.id}')" class="mx-tool ${gearSaved ? 'is-on' : ''}">UPGRADE</button>
                        <button onclick="app.openScouterForCharacter('${char.id}')" class="mx-tool mx-tool-scout ${scout ? 'is-on' : ''}" title="${scout ? `換算主ステ（防御率300%） ${scout.b300.toLocaleString()}` : 'Scouter に入力'}">${scout ? `SCOUT <b>${(scout.b300 / 10000).toFixed(1)}万</b>` : 'SCOUTER'}</button>
                    </div>
                </div>
            </div>`;
        }).join('') + addCardHTML;
        lucide.createIcons();
    },
    // カードの UPGRADE から、そのキャラの Upgrade Priority をモーダルで開く（HEXA と同じ形）。
    // Upgrade Priority のJSは遅延読み込みなので、先に読み込む。
    async openGearForCharacter(cid) {
        try { await this.loadAppAssets('gear'); } catch (e) { console.error(e); return; }
        gearPriority.openForCharacter(cid);
    },
    // カードの SCOUTER から、そのキャラの Scouter をモーダルで開く（HEXA・UPGRADE と同じ形）。
    async openScouterForCharacter(cid) {
        try { await this.loadAppAssets('scouter'); } catch (e) { console.error(e); return; }
        scouter.openForCharacter(cid);
    },
    toggleCharDone(cid, scope = 'weekly') {
        const c = this.data.characters.find(x => x.id === cid); if (!c) return;
        if (!c.progress) c.progress = { daily: [], weekly: [], boss: [] };
        const key = scope === 'monthly' ? 'charMonthlyDone' : 'charDone';
        c.progress[key] = !c.progress[key];
        this.saveData(); this.renderDashboard();
    },

    renderCharacters() {
        const c = document.getElementById('char-list-container');
        const activeChars = this.data.characters.filter(char => this.data.config.activeServer === 'ALL' || char.server === this.data.config.activeServer);
        const countBadge = document.getElementById('roster-count-badge');
        if (countBadge) countBadge.innerText = `${activeChars.length} Character${activeChars.length === 1 ? '' : 's'}`;

        // 表計算調の一覧。1行1キャラで、Lv・週ボス数・HEXA進捗を横に並べる。
        const charLimit = this.data.config.charMaxCrystals || 14;
        const hexaReady = (typeof hexaTracker !== 'undefined');
        const rows = activeChars.map((x, idx) => {
            const settings = x.settings || { boss_ids: [] };
            const sCol = x.server === 'KRONOS' ? (this.data.config.serverKColor || 'emerald') : (this.data.config.serverCColor || 'purple');
            const charWeekly = this.data.masterBosses.filter(b => (settings.boss_ids || []).includes(b.id) && b.type === 'WEEKLY').length;
            const hexaClassId = hexaReady ? hexaTracker.getCharClassId(x) : null;
            const hexaPct = hexaClassId ? hexaTracker.getProgress('char:' + x.id, hexaClassId).pct : null;
            const roleCls = x.role === 'MAIN' ? 'border-yellow-500/50 text-yellow-300 bg-yellow-950/80' : (x.role === 'SUB' ? 'border-cyan-500/50 text-cyan-300 bg-cyan-950/80' : 'border-slate-600 text-slate-400 bg-slate-900/90');
            const act = (fn, icon, label, hover) => `<button onclick="${fn}" title="${label}" class="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-slate-400 border border-transparent hover:border-slate-700 ${hover}"><i data-lucide="${icon}" class="w-3 h-3"></i>${label}</button>`;
            return `
            <tr class="${x.hidden ? 'opacity-45' : ''}">
                <td class="text-right font-mono text-slate-500">${idx + 1}</td>
                <td>
                    <div class="flex items-center gap-2 min-w-0 cursor-pointer" onclick="app.openCharModal('${x.id}')" title="Edit ${x.name}">
                        <span class="w-7 h-7 shrink-0 border border-${sCol}-500/40 bg-slate-950 relative overflow-hidden">${x.classImage ? `<img src="${x.classImage}" style="${this.getCharImgStyle(x)}">` : ''}</span>
                        <span class="font-semibold text-white truncate">${x.name}</span>
                        ${x.hidden ? '<span class="text-[10px] text-slate-500 flex items-center gap-0.5"><i data-lucide="eye-off" class="w-3 h-3"></i>Hidden</span>' : ''}
                    </div>
                </td>
                <td class="text-right font-mono text-${sCol}-300">${x.level || '?'}</td>
                <td class="text-slate-300 truncate">${x.job || '—'}</td>
                <td class="font-mono text-[11px] text-${sCol}-400">${x.server === 'KRONOS' ? 'Kronos' : 'Challenger'}</td>
                <td><span class="px-1 text-[10px] font-mono font-bold border ${roleCls}">${x.role || '—'}</span></td>
                <td class="text-right font-mono ${charWeekly > charLimit ? 'text-amber-400' : 'text-slate-300'}" title="週ボスの数 / 上限">${charWeekly}/${charLimit}</td>
                <td class="text-right font-mono text-violet-300">${hexaPct === null ? '<span class="text-slate-600">—</span>' : hexaPct + '%'}</td>
                <td>
                    <div class="flex items-center gap-0.5 justify-end">
                        ${act(`app.openCharModal('${x.id}')`, 'pencil', 'Edit', 'hover:text-white')}
                        ${act(`app.refreshCharacter('${x.id}')`, 'refresh-cw', 'Refresh', 'hover:text-emerald-300')}
                        ${act(`app.toggleCharHidden('${x.id}')`, x.hidden ? 'eye' : 'eye-off', x.hidden ? 'Show' : 'Hide', 'hover:text-white')}
                        ${act(`app.deleteCharacter('${x.id}')`, 'trash-2', 'Delete', 'hover:text-rose-400')}
                    </div>
                </td>
            </tr>`;
        }).join('');
        if (c) c.innerHTML = activeChars.length ? `
            <div class="overflow-x-auto">
                <table class="mm-table w-full">
                    <thead><tr>
                        <th class="w-8 text-right">#</th><th>Name</th><th class="w-12 text-right">Lv</th><th>Job</th><th class="w-24">Server</th>
                        <th class="w-16">Role</th><th class="w-16 text-right">Weekly</th><th class="w-14 text-right">HEXA</th><th class="w-64"></th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>` : `<div class="border border-dashed border-slate-700 py-10 text-center text-slate-500 text-xs">このサーバーにはキャラがいません。上の欄から追加できます。</div>`;
        lucide.createIcons();
    },

    openAddCharacterFromDashboard() {
        this.navigate('characters');
        setTimeout(() => {
            const input = document.getElementById('quick-add-name');
            if (input) { input.focus(); input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 50);
    },

    toggleCharHidden(id) {
        const c = this.data.characters.find(x => x.id === id);
        if (!c) return;
        c.hidden = !c.hidden;
        this.saveData();
        this.renderCharacters();
        this.renderDashboard();
    },

    async refreshCharacter(id) {
        const c = this.data.characters.find(x => x.id === id);
        if (!c) return;
        try {
            const { data } = await this._fetchRanking(c.name, 10000);
            if (data && data.ranks && data.ranks.length) {
                const info = data.ranks.find(r => r.characterName.toLowerCase() === c.name.toLowerCase()) || data.ranks[0];
                c.level = info.level;
                c.job = info.jobName || c.job;
                if (info.characterImgURL) c.image = info.characterImgURL;
                {
                    const m = this.classByJobName(info.jobName);
                    if (m) c.classImage = m.path;
                }
                this.saveData();
                this.renderCharacters();
                this.renderDashboard();
            }
        } catch (e) { console.error(e); alert('Failed to refresh character'); }
    },

    async quickAddCharacter(e) {
        if (e && e.preventDefault) e.preventDefault();
        const input = document.getElementById('quick-add-name');
        const btn = document.getElementById('btn-quick-add');
        const msg = document.getElementById('quick-add-msg');
        const name = (input?.value || '').trim();
        if (!name) return;
        if (this.data.characters.some(c => c.name.toLowerCase() === name.toLowerCase())) {
            if (msg) { msg.textContent = `"${name}" is already in your roster.`; msg.className = 'mt-2 text-[11px] font-medium text-center text-amber-400'; msg.classList.remove('hidden'); }
            return;
        }

        if (btn) { btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`; lucide.createIcons(); }
        if (msg) { msg.textContent = `Fetching "${name}"...`; msg.className = 'mt-2 text-[11px] font-medium text-center text-slate-400'; msg.classList.remove('hidden'); }

        let level = 0, job = '', classImage = '', image = '';
        try {
            const { data } = await this._fetchRanking(name, 10000);
            if (data && data.ranks && data.ranks.length) {
                const info = data.ranks.find(r => r.characterName.toLowerCase() === name.toLowerCase()) || data.ranks[0];
                level = info.level;
                job = info.jobName || '';
                image = info.characterImgURL || '';
                {
                    const m = this.classByJobName(job);
                    if (m) classImage = m.path;
                }
            } else {
                if (msg) { msg.textContent = `No character found: "${name}". Added anyway with defaults.`; msg.className = 'mt-2 text-[11px] font-medium text-center text-amber-400'; }
            }
        } catch (err) {
            console.error(err);
            if (msg) { msg.textContent = `API failed. Added "${name}" with defaults.`; msg.className = 'mt-2 text-[11px] font-medium text-center text-amber-400'; }
        }

        const server = this.data.config.activeServer === 'CHALLENGER' ? 'CHALLENGER' : 'KRONOS';
        const newChar = {
            id: 'c' + Date.now(),
            name, job, classImage, image,
            level, role: 'MAIN', server, hidden: false, memo: '',
            settings: { boss_ids: [], boss_party_sizes: {} },
            progress: { daily: [], weekly: [], boss: [] }
        };
        this.data.characters.push(newChar);
        this.saveData();
        if (input) input.value = '';
        if (btn) { btn.disabled = false; btn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i>`; lucide.createIcons(); }
        if (msg) { msg.textContent = `Added "${name}"${level ? ` (Lv.${level} ${job})` : ''}`; msg.className = 'mt-2 text-[11px] font-medium text-center text-emerald-400'; setTimeout(() => msg.classList.add('hidden'), 3000); }
        this.renderCharacters();
        this.renderDashboard();
    },

    // ================= コミュニティ名簿との連携 =================
    // 名簿があれば、自分のキャラは名簿から取り込むだけで済む（週ボスの設定に専念できる）。
    // 名簿が無い環境ではこの行ごと隠れ、上の手動追加だけで今までどおり使える。
    initCommunity() {
        const cs = window.communityStore;
        if (!cs) return;
        const sel = document.getElementById('planner-me');
        if (sel) sel.addEventListener('change', () => this.switchPlannerOwner(sel.value));
        const btn = document.getElementById('btn-planner-import');
        if (btn) btn.addEventListener('click', () => this.importFromCommunity());
        const autoBox = document.getElementById('planner-auto-import');
        if (autoBox) autoBox.addEventListener('change', () => {
            this.data.config.autoRosterImport = autoBox.checked;
            this.saveData();
            if (autoBox.checked) this.applyRosterSync(true);
            this.renderCommunityBar();
        });
        cs.ready().then(() => {
            // 名簿が変わったら（自分で直した / 他の人が直した / 定期取得）追随する。
            cs.onChange(() => { this.applyRosterSync(); this.renderCommunityBar(); });
            // 名前ごとの保存に切り替わるので、名簿を読み終えてからもう一度読み直す。
            this.loadData();
            this.syncFromRoster();
            this.renderCommunityBar();
            this.renderCharacters();
            this.renderDashboard();
        });
    },

    // 名簿の変更を Planner に反映して、変化があれば描き直す。
    applyRosterSync(force) {
        const r = this.syncFromRoster();
        if (force || r.updated || r.added) {
            this.renderCharacters();
            this.renderDashboard();
        }
        return r;
    },

    // 名簿に自動で追随するか（人ごとの設定。既定はON）
    autoRosterImport() { return this.data.config.autoRosterImport !== false; },

    // 名簿のキャラ1体から Planner のキャラを作る。週ボスの設定は空。
    plannerCharFromRoster(c, i) {
        const cls = this.classByJobName(c.job);
        return {
            id: 'c' + Date.now() + '_' + (i || 0),
            name: c.name, job: c.job || '', classImage: cls ? cls.path : '', image: c.imgURL || '',
            level: c.level || 0, role: c.isMain ? 'MAIN' : 'SUB',
            server: this.data.config.activeServer === 'CHALLENGER' ? 'CHALLENGER' : 'KRONOS',
            hidden: false, memo: '',
            communityCharId: c.id,   // 名簿のどのキャラか（週ボスの設定はこちらだけが持つ）
            settings: { boss_ids: [], boss_party_sizes: {} },
            progress: { daily: [], weekly: [], boss: [] }
        };
    },

    // 名簿の内容を Planner のキャラに反映する。
    //   - 名簿と結び付いたキャラは 名前 / レベル / 職 / 画像 を追随させる
    //   - 結び付いていないキャラも、名前が一致すればここで結び付ける
    //   - 名簿にあって Planner に無いキャラは、自動取り込みがONなら足す
    // 週ボスの設定と進捗はこの端末だけのものなので、絶対に触らない。
    // 名簿から消えたキャラは Planner に残す（設定を巻き添えで消さないため）。
    syncFromRoster() {
        const cs = window.communityStore;
        const me = cs && cs.me();
        const none = { updated: 0, added: 0 };
        if (!me) return none;
        // 保存先が確定していないうちは触らない（キーずれで別の記録を壊さないため）
        if (this.dataKey && this.dataKey !== this.plannerKey()) return none;

        const byId = new Map(me.characters.map(c => [c.id, c]));
        const byName = new Map(me.characters.map(c => [(c.name || '').toLowerCase(), c]));
        let updated = 0, added = 0;

        this.data.characters.forEach(pc => {
            let rc = pc.communityCharId ? byId.get(pc.communityCharId) : null;
            if (!rc) {
                rc = byName.get((pc.name || '').toLowerCase());
                if (rc) pc.communityCharId = rc.id;   // 手で登録していた分もここで結び付く
            }
            if (!rc) return;
            const cls = this.classByJobName(rc.job);
            const next = {
                name: rc.name,
                level: rc.level || pc.level,
                job: rc.job || pc.job,
                image: rc.imgURL || pc.image,
                classImage: cls ? cls.path : pc.classImage
            };
            Object.keys(next).forEach(k => {
                if (next[k] && pc[k] !== next[k]) { pc[k] = next[k]; updated++; }
            });
        });

        if (this.autoRosterImport()) {
            const haveId = new Set(this.data.characters.map(c => c.communityCharId).filter(Boolean));
            const haveName = new Set(this.data.characters.map(c => (c.name || '').toLowerCase()));
            me.characters.forEach((rc, i) => {
                if (haveId.has(rc.id) || haveName.has((rc.name || '').toLowerCase())) return;
                this.data.characters.push(this.plannerCharFromRoster(rc, i));
                added++;
            });
        }
        if (updated || added) this.saveData();
        return { updated, added };
    },

    renderCommunityBar() {
        const cs = window.communityStore;
        const bar = document.getElementById('planner-community-bar');
        const sel = document.getElementById('planner-me');
        const note = document.getElementById('planner-community-note');
        if (!cs || !bar || !sel) return;

        const members = cs.members();
        if (!members.length) { bar.classList.add('hidden'); bar.classList.remove('flex'); return; }
        bar.classList.remove('hidden');
        bar.classList.add('flex');

        const me = cs.me();
        sel.innerHTML = '<option value="">（名簿を使わない）</option>' +
            members.map(m => `<option value="${m.id}" ${me && me.id === m.id ? 'selected' : ''}>${cs.labelWithHandle(m)}</option>`).join('');

        const autoBox = document.getElementById('planner-auto-import');
        if (autoBox) autoBox.checked = this.autoRosterImport();
        const autoWrap = document.getElementById('planner-auto-import-wrap');
        if (autoWrap) autoWrap.style.display = me ? '' : 'none';

        if (note) {
            if (!me) {
                note.textContent = '自分を選ぶと、その人のキャラが自動で入ります（データも名前ごとに分かれます）';
            } else {
                const have = new Set(this.data.characters.map(c => c.name.toLowerCase()));
                const left = me.characters.filter(c => c.name && !have.has(c.name.toLowerCase())).length;
                note.textContent = left
                    ? (this.autoRosterImport() ? `名簿に未取り込みのキャラが${left}体あります` : `名簿に未取り込みが${left}体（自動取り込みはOFF）`)
                    : '名簿のキャラはすべて取り込み済み・自動で追随します';
            }
        }
    },

    // 名簿にある自分のキャラを Planner に取り込む。既にあるものは触らない。
    // 週ボスの設定は空のまま作るので、あとはボスを選ぶだけ。
    importFromCommunity() {
        const cs = window.communityStore;
        const me = cs && cs.me();
        if (!me) { this.showQuickMsg('先に「自分」のDiscord名を選んでください。', 'warn'); return; }

        const have = new Set(this.data.characters.map(c => c.name.toLowerCase()));
        const targets = me.characters.filter(c => c.name && !have.has(c.name.toLowerCase()));
        if (!targets.length) { this.showQuickMsg('名簿のキャラはすべて取り込み済みです。', 'warn'); return; }

        targets.forEach((c, i) => this.data.characters.push(this.plannerCharFromRoster(c, i)));
        this.saveData();
        this.renderCommunityBar();
        this.renderCharacters();
        this.renderDashboard();
        this.showQuickMsg(`名簿から${targets.length}体を取り込みました。各キャラの週ボスを設定してください。`, 'ok');
    },

    showQuickMsg(text, kind) {
        const msg = document.getElementById('quick-add-msg');
        if (!msg) return;
        const color = kind === 'ok' ? 'text-emerald-400' : kind === 'warn' ? 'text-amber-400' : 'text-slate-400';
        msg.textContent = text;
        msg.className = `mt-2 text-[11px] font-medium text-center ${color}`;
        msg.classList.remove('hidden');
        clearTimeout(this._quickMsgTimer);
        this._quickMsgTimer = setTimeout(() => msg.classList.add('hidden'), 4000);
    },

    openCharModal(cid = null) {
        const m = document.getElementById('char-modal'), f = document.getElementById('char-form');
        if (!m || !f) return;

        f.reset();
        this.togglePortraitPop(false);
        const err = document.getElementById('fetch-error-msg');
        if (err) { err.classList.add('hidden'); err.textContent = ''; }
        m.classList.remove('hidden');
        this.activeCharId = cid;
        const c = cid ? this.data.characters.find(x => x.id === cid) : null;

        document.getElementById('modal-title').innerText = c ? 'Edit Character' : 'Add Character';
        document.getElementById('modal-subtitle').innerText = c ? c.name : '';
        f.id.value = c ? c.id : '';
        f.name.value = c ? c.name : '';
        f.level.value = c ? (c.level || '') : '';
        f.job.value = c ? (c.job || '') : '';
        f.image.value = c ? (c.image || '') : '';
        f.memo.value = c ? (c.memo || '') : '';

        const jobSel = document.getElementById('char-job-select');
        if (jobSel) {
            const match = c ? Array.from(jobSel.options).find(o => o.dataset.name === c.job) : null;
            jobSel.value = match ? match.value : '';
        }
        this.setCharRole(c ? (c.role || 'MAIN') : 'MAIN');
        const defServer = this.data.config.activeServer === 'ALL' ? 'KRONOS' : this.data.config.activeServer;
        this.setCharServer(c ? (c.server || 'KRONOS') : defServer);
        ['cm-link-hexa', 'cm-link-gear'].forEach(id => {
            const b = document.getElementById(id);
            if (b) { b.disabled = !c; b.title = c ? '' : '保存すると使えます'; }
        });

        if (c) this.initBossConfigState(c);
        else { this.bcCharId = null; this.bcSelected = {}; this.bcParty = {}; this.bcDiff = {}; }

        this.applyImagePosToUI(c);
        this.updateCharAvatar();
        this.renderBossConfigGrid();
        lucide.createIcons();
    },
    closeCharModal() { this.togglePortraitPop(false); document.getElementById('char-modal').classList.add('hidden'); },
    async updateAllCharacters() {
        if (!confirm('Update all characters from Ranking API? This may take a while.')) return;
        const btn = document.getElementById('btn-update-all');
        const originalContent = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Updating...`; lucide.createIcons(); }

        let count = 0;
        const total = this.data.characters.length;

        for (let i = 0; i < total; i++) {
            const c = this.data.characters[i];
            if (btn) btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${i + 1}/${total}`;
            try {
                const { data } = await this._fetchRanking(c.name, 10000);

                if (data) {
                    if (data.ranks && data.ranks.length > 0) {
                        const info = data.ranks.find(r => r.characterName.toLowerCase() === c.name.toLowerCase()) || data.ranks[0];
                        c.level = info.level;
                        if (info.characterImgURL) c.image = info.characterImgURL;
                        count++;
                    }
                }
            } catch (err) {
                console.error(`Failed to update ${c.name}:`, err);
            }
            await new Promise(r => setTimeout(r, 800)); // Throttling
        }

        this.saveData();
        this.renderCharacters();
        this.renderDashboard(); // Update dashboard too for sorting
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
        alert(`Update Complete! Updated ${count}/${total} characters.`);
    },

    saveCharacter(e) {
        e.preventDefault();
        const f = e.target, id = f.id.value || 'c' + Date.now(), pc = this.data.characters.find(x => x.id === id);

        // Find class image from CLASS_DATA
        const classImgPath = (this.classByJobName(f.job.value) || {}).path || "";

        // Derive boss_ids/party_sizes from boss-config state (bcSelected/bcDiff/bcParty)
        const boss_ids = [], boss_party_sizes = {};
        Object.keys(this.bcSelected || {}).filter(k => this.bcSelected[k]).forEach(key => {
            const [type, ...rest] = key.split(':');
            const name = rest.join(':');
            const group = this.getBossGroups(type).find(g => g.name === name);
            if (!group) return;
            const diff = this.bcDiff[key] || group.variants[0].difficulty;
            const variant = group.variants.find(v => v.difficulty === diff);
            if (!variant) return;
            boss_ids.push(variant.id);
            const ps = this.bcParty[key] || 1;
            if (ps > 1) boss_party_sizes[variant.id] = ps;
        });

        const hiddenInput = f.querySelector('input[name="hidden"]');
        const hiddenVal = hiddenInput?.type === 'checkbox' ? hiddenInput.checked : (pc?.hidden || false);

        const offX = parseInt(document.getElementById('pos-x-slider')?.value);
        const defX = this.DEFAULT_IMG_OFFSET_X;

        const nd = {
            id: id,
            name: f.name.value,
            job: f.job.value,
            classImage: classImgPath,
            role: f.role.value,
            image: f.image.value,
            level: f.level.value,
            memo: f.memo.value,
            imgOffsetX: Number.isFinite(offX) ? offX : defX,
            hidden: hiddenVal,
            server: f.server.value || 'KRONOS',
            // 画面に無い項目（旧タスク機能の選択など）は消さずに引き継ぐ。
            settings: { ...(pc?.settings || {}), boss_ids, boss_party_sizes },
            // 週・月の消し込み（charDone / charMonthlyDone）も引き継ぐ。以前は編集して保存すると外れていた。
            progress: { daily: [], weekly: [], boss: [], ...(pc?.progress || {}) }
        };
        const idx = this.data.characters.findIndex(x => x.id === id);
        if (idx >= 0) this.data.characters[idx] = nd; else this.data.characters.push(nd);
        this.saveData(); this.closeCharModal(); this.renderCharacters(); this.renderDashboard();
    },
    // 最後の1体を消したときも保存する必要があるので、空データを許可して呼ぶ。
    deleteCharacter(id) { if (confirm('Delete?')) { this.data.characters = this.data.characters.filter(x => x.id !== id); this.saveData({ allowEmpty: true }); this.renderCharacters(); this.renderDashboard(); } },
    // 消すのは「いま開いている人」の分だけ。他の人の記録は残す。
    resetAllData() { if (confirm('Factory Reset?')) { localStorage.removeItem(this.plannerKey()); location.reload(); } },

    // ========== Boss Config Modal (MapleHub style) ==========
    DIFF_ORDER: ['EASY', 'NORMAL', 'HARD', 'CHAOS', 'EXTREME'],

    // MapleHub CDN boss image slug mapping (key: boss.name)
    // マスが狭いので、長いボス名は画像が読めないときの表示用に縮める。
    // ボスの画像は boss_master.js の image（MapleHub のスラグ）。無ければ英語名から作る。
    getBossImageUrl(bossName) {
        const m = bossByEn(bossName);
        const slug = (m && m.image) || (bossName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return slug ? `https://cdn.maplehub.app/bosses/${slug}.webp` : '';
    },

    getBossGroups(type) {
        const groups = {};
        this.data.masterBosses.filter(b => b.type === type).forEach(b => {
            if (!groups[b.name]) groups[b.name] = { name: b.name, kana: b.kana, variants: [] };
            groups[b.name].variants.push(b);
        });
        Object.values(groups).forEach(g => {
            g.variants.sort((a, b) => this.DIFF_ORDER.indexOf(a.difficulty) - this.DIFF_ORDER.indexOf(b.difficulty));
        });
        // 並びは boss_master.js の BOSS_REGISTER_ORDER。無いボスは結晶価格の高い順で後ろへ。
        const order = (typeof BOSS_REGISTER_ORDER !== 'undefined') ? BOSS_REGISTER_ORDER : [];
        const rank = n => { const i = order.indexOf(n); return i < 0 ? Infinity : i; };
        const top = g => Math.max(...g.variants.map(v => v.meso));
        return Object.values(groups).sort((a, b) => (rank(a.name) - rank(b.name)) || (top(b) - top(a)));
    },

    openBossConfigModal(charId) {
        this.openCharModal(charId);
    },

    initBossConfigState(c) {
        this.bcCharId = c.id;
        this.bcSelected = {};
        this.bcParty = {};
        this.bcDiff = {};
        const settings = c.settings || { boss_ids: [], boss_party_sizes: {} };
        const partySizes = settings.boss_party_sizes || {};
        (settings.boss_ids || []).forEach(bid => {
            const b = this.data.masterBosses.find(x => x.id === bid);
            if (!b) return;
            const key = `${b.type}:${b.name}`;
            this.bcSelected[key] = true;
            this.bcDiff[key] = b.difficulty;
            this.bcParty[key] = partySizes[bid] || 1;
        });
    },

    // 難易度の枠。ハードとカオスは同じボスに両方あることがないので同じ列にする。
    BC_DIFF_COLS: [['EASY'], ['NORMAL'], ['HARD', 'CHAOS'], ['EXTREME']],
    BC_DIFF_COLOR: { EASY: '#9ca3af', NORMAL: '#22d3ee', HARD: '#f87171', CHAOS: '#ca8a04', EXTREME: '#ef4444' },

    bcVariant(key) {
        const [type, ...rest] = key.split(':');
        const group = this.getBossGroups(type).find(g => g.name === rest.join(':'));
        if (!group) return null;
        const diff = this.bcDiff[key] || group.variants[0].difficulty;
        return group.variants.find(v => v.difficulty === diff) || null;
    },

    bcMaxParty(variant, name) {
        return (variant && variant.max) || ((typeof bossByEn === 'function' && bossByEn(name)) || {}).maxMembers || 6;
    },

    renderBossConfigGrid() {
        const body = document.getElementById('bc-grid');
        if (!body) return;
        const label = d => d.charAt(0) + d.slice(1).toLowerCase();
        const section = type => {
            const groups = this.getBossGroups(type);
            if (!groups.length) return '';
            const col = type === 'WEEKLY' ? 'violet' : 'amber';
            const head = `<tr><td colspan="5" class="!border-x-0 px-3 pt-3 pb-1 bg-slate-900"><div class="flex items-center gap-2 text-[11px] font-bold text-${col}-400">${type}<span class="flex-1 h-px bg-${col}-500/40"></span></div></td></tr>`;
            return head + groups.map(g => {
                const key = `${type}:${g.name}`;
                const on = !!this.bcSelected[key];
                const v = on ? this.bcVariant(key) : null;
                const max = this.bcMaxParty(v, g.name);
                const p = on ? Math.min(this.bcParty[key] || 1, max) : 1;
                const img = this.getBossImageUrl(g.name);
                const diffs = this.BC_DIFF_COLS.map(ds => {
                    const x = g.variants.find(y => ds.includes(y.difficulty));
                    if (!x) return `<button type="button" class="cm-db na" tabindex="-1"></button>`;
                    const sel = on && v && v.difficulty === x.difficulty;
                    return `<button type="button" onclick="app.bcPickDiff('${key}','${x.difficulty}')" class="cm-db ${sel ? 'on' : ''}" style="--c:${this.BC_DIFF_COLOR[x.difficulty] || '#94a3b8'}">${label(x.difficulty)}</button>`;
                }).join('');
                const bossMax = this.bcMaxParty(null, g.name);
                const pts = Array.from({ length: bossMax }, (_, i) => i + 1).filter(i => i <= max)
                    .map(i => `<button type="button" onclick="app.bcSetParty('${key}',${i})" class="cm-pb ${on && p === i ? 'on' : ''}">${i}</button>`).join('');
                return `<tr class="${on ? 'cm-sel' : 'cm-off'}">
                    <td class="cm-bn px-3 py-1 max-w-0 w-full overflow-hidden"><div class="flex items-center gap-2 overflow-hidden">
                        ${img ? `<img src="${img}" alt="" class="w-7 h-7 object-contain shrink-0 ${on ? '' : 'opacity-40'}" onerror="this.style.visibility='hidden'">` : '<span class="w-7 shrink-0"></span>'}
                        <span class="${on ? 'text-white font-bold' : 'text-slate-400'} text-[13px] whitespace-nowrap">${g.name}</span>
                        ${g.kana ? `<span class="text-[10px] text-slate-500 whitespace-nowrap truncate">${g.kana}</span>` : ''}</div></td>
                    <td class="px-3 w-36 text-right font-mono text-[12px] ${on ? 'text-slate-400' : 'text-slate-700'}">${v ? v.meso.toLocaleString() : '—'}</td>
                    <td class="px-3 w-36 text-right font-mono text-[13px] ${on ? 'text-amber-300 font-bold' : 'text-slate-700'}">${v ? Math.floor(v.meso / p).toLocaleString() : '—'}</td>
                    <td class="px-2 whitespace-nowrap"><div class="flex gap-1">${diffs}</div></td>
                    <td class="px-2 whitespace-nowrap"><div class="flex gap-1 w-[164px]">${pts}</div></td></tr>`;
            }).join('');
        };
        body.innerHTML = section('WEEKLY') + section('MONTHLY')
            || `<tr><td colspan="5" class="text-center text-slate-500 text-xs py-8">No bosses</td></tr>`;
        this.updateBossConfigCounter();
    },

    // 難易度を押すと登録、同じ難易度をもう一度押すと解除。
    bcPickDiff(key, diff) {
        if (this.bcSelected[key] && this.bcDiff[key] === diff) {
            this.bcSelected[key] = false;
        } else {
            this.bcSelected[key] = true;
            this.bcDiff[key] = diff;
            if (!this.bcParty[key]) this.bcParty[key] = 1;
            // 難易度で人数の上限が変わるボス（スウ Extreme は2人）は上限に合わせる。
            const max = this.bcMaxParty(this.bcVariant(key), key.split(':').slice(1).join(':'));
            if (this.bcParty[key] > max) this.bcParty[key] = max;
        }
        this.renderBossConfigGrid();
    },

    bcSetParty(key, n) {
        if (!this.bcSelected[key]) return;
        this.bcParty[key] = n;
        this.renderBossConfigGrid();
    },

    updateBossConfigCounter() {
        const charLimit = this.data.config.charMaxCrystals || 14;
        const weekly = [];
        Object.keys(this.bcSelected).filter(k => this.bcSelected[k] && k.startsWith('WEEKLY:')).forEach(key => {
            const v = this.bcVariant(key);
            if (v) weekly.push(v.meso / (this.bcParty[key] || 1));
        });
        const capped = weekly.sort((a, b) => b - a).slice(0, charLimit).reduce((s, x) => s + x, 0);
        const counter = document.getElementById('bc-counter');
        const earnEl = document.getElementById('bc-weekly-earnings');
        if (counter) {
            counter.innerText = `${weekly.length}/${charLimit}`;
            counter.className = `font-mono font-bold inline-block w-12 text-right ${weekly.length > charLimit ? 'text-rose-400' : 'text-violet-300'}`;
        }
        if (earnEl) earnEl.innerText = Math.floor(capped).toLocaleString();
    },

};
window.app = app;
window.onload = () => app.init();