const app = {
    data: { config: { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' }, characters: [], masterDailies: [], masterWeeklies: [], masterBosses: [], memo: "" },
    lastLoginDate: null, editingBossId: null, currentTaskTab: 'daily', activeCharId: null, currentBossFilter: 'ALL', tempBossIds: new Set(), tempPartySizes: {},
    currentApp: 'planner', expInitialized: false, costInitialized: false, ranksInitialized: false, hexaInitialized: false,
    bcCharId: null, bcTab: 'WEEKLY', bcSelected: {}, bcParty: {}, bcDiff: {},
    DEFAULT_IMG_OFFSET_X: 50,
    DEFAULT_IMG_OFFSET_Y: 50,
    DEFAULT_IMG_SCALE: 100,

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
        this.startClock();
        lucide.createIcons();
        this.syncConfigUI();
        this.updateServerUI();
        this.navigate('dashboard');
        this.loadJobSelect();
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
        const previewContainer = document.getElementById('preview-class-container');
        const f = document.getElementById('char-form');

        if (val && opt) {
            f.job.value = opt.dataset.name;

            document.getElementById('preview-class-img').src = opt.dataset.path;
            document.getElementById('preview-class-name').innerText = opt.dataset.name;
            previewContainer.classList.remove('hidden');
            // Sync image position preview src
            const posImg = document.getElementById('pos-preview-img');
            if (posImg) posImg.src = opt.dataset.path;
        } else {
            previewContainer.classList.add('hidden');
        }
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
        if (img) img.src = char?.classImage || '';
        this.onImagePosChange();
    },
    loadData() {
        try {
            const stored = localStorage.getItem('gms_v24_data');
            if (stored) {
                this.data = JSON.parse(stored);
                if (!this.data.masterDailies) this.data.masterDailies = [...DEFAULT_DAILIES];
                if (!this.data.masterWeeklies) this.data.masterWeeklies = [...DEFAULT_WEEKLIES];
                if (!this.data.masterBosses) this.data.masterBosses = [...DEFAULT_BOSSES];
                // Merge in any newly-added default bosses (by id) without overwriting user edits
                else { const have = new Set(this.data.masterBosses.map(b => b.id)); DEFAULT_BOSSES.forEach(b => { if (!have.has(b.id)) this.data.masterBosses.push({ ...b }); }); }
                if (!this.data.config) this.data.config = { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' };
            } else {
                this.data.masterDailies = [...DEFAULT_DAILIES]; this.data.masterWeeklies = [...DEFAULT_WEEKLIES]; this.data.masterBosses = [...DEFAULT_BOSSES]; this.data.config = { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' };
            }
            this.lastLoginDate = localStorage.getItem('gms_v24_date') || new Date().toISOString().split('T')[0];
        } catch (e) {
            this.data = { config: { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' }, characters: [], masterDailies: [...DEFAULT_DAILIES], masterWeeklies: [...DEFAULT_WEEKLIES], masterBosses: [...DEFAULT_BOSSES] };
        }
    },
    saveData() { localStorage.setItem('gms_v24_data', JSON.stringify(this.data)); localStorage.setItem('gms_v24_date', new Date().toISOString().split('T')[0]); },

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
            const base = "px-2.5 py-1 rounded text-[10px] font-bold transition-all border";

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
    toggleRevenueMode() {
        this.data.config.revenueMode = this.data.config.revenueMode === 'weekly' ? 'monthly' : 'weekly';
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
            fetchBtn.innerHTML = `<svg class="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Fetching...`;
            fetchBtn.classList.add('opacity-70', 'cursor-not-allowed');
        }

        // コンソールログヘルパー
        const L = (step, status, msg) => console.log(`[Fetch][${status}] ${step}: ${msg}`);

        // Fetchボタンを元に戻す関数
        const resetBtn = () => {
            if (fetchBtn) {
                fetchBtn.disabled = false;
                fetchBtn.innerHTML = 'Fetch';
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
                if (typeof CLASS_DATA !== 'undefined') {
                    const allJobs = Object.values(CLASS_DATA).flat();
                    const targetJob = char.jobName.toLowerCase().replace(/[^a-z0-9]/g, '');

                    const matchedJob = allJobs.find(j => {
                        const dbJob = j.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        return dbJob === targetJob;
                    });

                    if (matchedJob) {
                        foundJobId = matchedJob.id;
                        foundJobImg = matchedJob.path;
                        L('JOB MAP', 'OK', `"${char.jobName}" → ${matchedJob.name} (id:${matchedJob.id})`);
                    } else {
                        L('JOB MAP', 'WARN', `No CLASS_DATA match for "${char.jobName}" (normalized: "${targetJob}")`);
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
                    const apiPrev = document.getElementById('preview-api-container');
                    const apiImg = document.getElementById('preview-api-img');
                    const apiPh = document.getElementById('preview-api-placeholder');
                    if (apiPrev && apiImg) {
                        apiImg.src = char.characterImgURL;
                        apiImg.classList.remove('hidden');
                        if (apiPh) apiPh.classList.add('hidden');
                        document.getElementById('preview-api-name').innerText = "Fetched";
                        apiPrev.classList.remove('hidden');
                    }
                    L('IMAGE', 'OK', `Set: ${char.characterImgURL.substring(0, 80)}...`);
                } else {
                    const apiPrev = document.getElementById('preview-api-container');
                    const apiImg = document.getElementById('preview-api-img');
                    const apiPh = document.getElementById('preview-api-placeholder');
                    if (apiPrev) {
                        if (apiImg) { apiImg.src = ""; apiImg.classList.add('hidden'); }
                        if (apiPh) apiPh.classList.remove('hidden');
                        document.getElementById('preview-api-name').innerText = "--";
                        apiPrev.classList.remove('hidden');
                    }
                    L('IMAGE', 'WARN', 'No characterImgURL in API response');
                }

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
    checkResets() {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        if (this.lastLoginDate && this.lastLoginDate !== todayStr) {
            const lastLogin = new Date(this.lastLoginDate);
            this.data.characters.forEach(c => {
                if (!c.progress) return;
                c.progress.daily = [];
                c.progress.boss = (c.progress.boss || []).filter(bid => {
                    const mb = this.data.masterBosses.find(b => b.id === bid);
                    return mb && mb.type !== 'DAILY';
                });
                if (now.getUTCDay() === 4 || (lastLogin.getUTCDay() !== 4 && now.getUTCDay() < lastLogin.getUTCDay())) {
                    c.progress.weekly = [];
                    c.progress.charDone = false;
                    c.progress.boss = (c.progress.boss || []).filter(bid => {
                        const mb = this.data.masterBosses.find(b => b.id === bid);
                        return mb && mb.type === 'MONTHLY';
                    });
                }
                if (now.getUTCDate() === 1) {
                    c.progress.boss = [];
                    c.progress.charMonthlyDone = false;
                }
            });
            this.saveData();
        }
    },
    startClock() { setInterval(() => { const n = new Date(); document.getElementById('clock-jst').innerText = n.toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); document.getElementById('clock-utc').innerText = n.toISOString().split('T')[1].split('.')[0]; }, 1000); },
    navigate(view) {
        ['dashboard', 'characters', 'tasks', 'system'].forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.add('hidden-page');
        });
        document.querySelectorAll('[id^="nav-"]').forEach(e => { e.classList.remove('nav-active'); e.classList.add('nav-inactive'); });
        document.getElementById(`view-${view}`).classList.remove('hidden-page');
        document.querySelectorAll(`[id="nav-${view}"]`).forEach(e => { e.classList.add('nav-active'); e.classList.remove('nav-inactive'); });
        if (view === 'dashboard') this.renderDashboard(); if (view === 'characters') this.renderCharacters(); if (view === 'tasks') this.renderTaskMaster();
    },

    switchApp(appName) {
        this.currentApp = appName;
        document.querySelectorAll('[id^="app-"]').forEach(e => { e.classList.remove('nav-active'); e.classList.add('nav-inactive'); });
        const appBtn = document.getElementById(`app-${appName}`);
        if (appBtn) { appBtn.classList.add('nav-active'); appBtn.classList.remove('nav-inactive'); }

        document.querySelectorAll('[id^="view-"]').forEach(e => e.classList.add('hidden-page'));

        const headerNav = document.querySelector('header nav');
        const dashStats = document.getElementById('dashboard-stats-container');
        const clockEl = document.querySelector('header > div:last-child');

        if (appName === 'planner') {
            if (headerNav) headerNav.style.display = '';
            if (dashStats) dashStats.style.display = '';
            if (dashStats && dashStats.nextElementSibling) dashStats.nextElementSibling.style.display = '';
            if (clockEl) clockEl.classList.remove('ml-auto');
            this.navigate('dashboard');
        } else if (appName === 'exp') {
            if (headerNav) headerNav.style.display = 'none';
            if (dashStats) dashStats.style.display = 'none';
            if (dashStats && dashStats.nextElementSibling) dashStats.nextElementSibling.style.display = 'none';
            if (clockEl) clockEl.classList.add('ml-auto');
            document.getElementById('view-exp-sim').classList.remove('hidden-page');
            if (!this.expInitialized) {
                expSim.init();
                this.expInitialized = true;
                lucide.createIcons();
            }
        } else if (appName === 'cost') {
            if (headerNav) headerNav.style.display = 'none';
            if (dashStats) dashStats.style.display = 'none';
            if (dashStats && dashStats.nextElementSibling) dashStats.nextElementSibling.style.display = 'none';
            if (clockEl) clockEl.classList.add('ml-auto');
            document.getElementById('view-cost-calc').classList.remove('hidden-page');
            if (!this.costInitialized) {
                costCalc.init();
                this.costInitialized = true;
            }
        } else if (appName === 'ranks') {
            if (headerNav) headerNav.style.display = 'none';
            if (dashStats) dashStats.style.display = 'none';
            if (dashStats && dashStats.nextElementSibling) dashStats.nextElementSibling.style.display = 'none';
            if (clockEl) clockEl.classList.add('ml-auto');
            document.getElementById('view-ranks').classList.remove('hidden-page');
            if (!this.ranksInitialized) {
                if (typeof ranks !== 'undefined') ranks.init();
                this.ranksInitialized = true;
                lucide.createIcons();
            }
        } else if (appName === 'hexa') {
            if (headerNav) headerNav.style.display = 'none';
            if (dashStats) dashStats.style.display = 'none';
            if (dashStats && dashStats.nextElementSibling) dashStats.nextElementSibling.style.display = 'none';
            if (clockEl) clockEl.classList.add('ml-auto');
            document.getElementById('view-hexa').classList.remove('hidden-page');
            if (!this.hexaInitialized) {
                if (typeof hexaTracker !== 'undefined') hexaTracker.init();
                this.hexaInitialized = true;
            }
        } else if (appName === 'liberation') {
            if (headerNav) headerNav.style.display = 'none';
            if (dashStats) dashStats.style.display = 'none';
            if (dashStats && dashStats.nextElementSibling) dashStats.nextElementSibling.style.display = 'none';
            if (clockEl) clockEl.classList.add('ml-auto');
            document.getElementById('view-liberation-calc').classList.remove('hidden-page');
            if (!this.liberationInitialized) {
                if (typeof genesisCalc !== 'undefined') genesisCalc.init('genesis-calc-root');
                if (typeof destinyCalc !== 'undefined') destinyCalc.init('destiny-calc-root');
                if (typeof astraCalc !== 'undefined') astraCalc.init('astra-calc-root');
                this.liberationInitialized = true;
            }
        }
    },

    switchLiberationTab(tab) {
        ['genesis', 'destiny', 'astra'].forEach(t => {
            document.getElementById(`lib-content-${t}`).classList.toggle('hidden', t !== tab);
            const btn = document.getElementById(`lib-tab-btn-${t}`);
            btn.classList.toggle('tab-active', t === tab);
            btn.classList.toggle('tab-inactive', t !== tab);
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

    getTaskBtnHTML(charId, item, type, isDone) {
        let containerTheme = "";
        let iconTheme = "";
        if (type === 'daily') {
            containerTheme = "bg-indigo-900/20 border-indigo-500/50";
            iconTheme = "text-indigo-400";
        } else {
            containerTheme = "bg-emerald-900/20 border-emerald-500/50";
            iconTheme = "text-emerald-400";
        }

        let typeColor = "";
        let taskType = item.type;
        if (!taskType) {
            if (item.isEvent) taskType = 'EVENT';
            else taskType = 'OTHER';
        }

        if (taskType === 'EVENT') typeColor = "text-rose-400";
        else if (taskType === 'SYMBOL') typeColor = "text-cyan-400";
        else if (taskType === 'MONPA') typeColor = "text-orange-400";
        else if (taskType === 'EPIC_DUNGEON') typeColor = "text-purple-400";
        else if (taskType === 'HEXA') typeColor = "text-indigo-400";
        else if (taskType === 'GUILD') typeColor = "text-amber-400";
        else typeColor = "text-slate-500 font-bold";

        const containerClass = isDone ? "bg-slate-950 border-slate-800 opacity-40" : `${containerTheme} hover:bg-opacity-40`;
        const textClass = isDone ? "text-slate-600 line-through decoration-slate-700 font-medium" : "text-slate-200 font-bold";
        const icon = taskType === 'EVENT' && !isDone ? "sparkles" : (isDone ? "check-circle-2" : "circle");
        const finalIconColor = isDone ? "text-slate-600" : iconTheme;
        const typeLabel = taskType.replace('_', ' ');

        return `
        <button onclick="app.toggleTask('${charId}','${type}','${item.id}')"
            class="group flex items-center px-1 py-0.5 rounded border transition-all duration-200 text-left task-btn-compact w-full ${containerClass} h-[26px]">
            <i data-lucide="${icon}" class="w-3 h-3 flex-shrink-0 ${finalIconColor}"></i>
            <div class="ml-1 overflow-hidden flex items-center min-w-0 flex-1">
                <div class="truncate text-[11px] leading-none ${textClass}">${item.name}</div>
            </div>
        </button>`;
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

    getBossBtnHTML(charId, boss, isDone, partySize) {
        const typeStripe = boss.type === 'WEEKLY' ? 'bg-purple-500' : (boss.type === 'MONTHLY' ? 'bg-yellow-500' : 'bg-cyan-500');
        const activeClass = boss.type === 'WEEKLY' ? "bg-purple-900/40 border-purple-500/50 hover:bg-purple-900/60" : (boss.type === 'MONTHLY' ? "bg-yellow-900/30 border-yellow-500/50 hover:bg-yellow-900/50" : "bg-cyan-900/40 border-cyan-500/50 hover:bg-cyan-900/60");
        const containerClass = isDone ? "bg-slate-950 border-slate-800 opacity-40" : activeClass;
        const badgeStyle = isDone ? "bg-slate-900/85 text-slate-600" : this.getBadgeClass(boss.difficulty);
        const img = this.getBossImageUrl(boss.name);
        const diff = (boss.difficulty || '').toUpperCase();
        const typeChar = boss.type === 'WEEKLY' ? 'W' : (boss.type === 'MONTHLY' ? 'M' : 'D');

        return `
        <button onclick="app.toggleTask('${charId}','boss','${boss.id}')"
            title="[${typeChar}] ${boss.difficulty} ${boss.name}${partySize > 1 ? ` ×${partySize}` : ''}"
            class="group relative aspect-square rounded border overflow-hidden transition-all duration-200 task-btn-compact ${containerClass}">
            <span class="absolute inset-x-0 top-0 h-1 ${typeStripe} ${isDone ? 'opacity-40' : ''}"></span>
            ${img
                ? `<img src="${img}" alt="${boss.name}" class="w-full h-full object-contain pt-1 pb-2 px-0.5 ${isDone ? 'grayscale opacity-50' : ''}" onerror="this.style.display='none'">`
                : `<div class="w-full h-full flex items-center justify-center text-[7px] font-bold text-slate-300 px-0.5 text-center leading-tight pt-1">${boss.name}</div>`
            }
            <span class="absolute inset-x-0 bottom-0 ${badgeStyle} text-[9px] font-extrabold leading-none uppercase text-center px-0.5 py-0.5 tracking-wider backdrop-blur-sm">${diff}</span>
            ${isDone ? '<span class="absolute top-1 right-0 bg-slate-950/80 rounded-bl p-px"><i data-lucide="check" class="w-2 h-2 text-emerald-400"></i></span>' : ''}
            ${partySize > 1 ? `<span class="absolute top-1 left-0 bg-slate-950/80 text-[7px] font-mono font-bold ${isDone ? 'text-slate-500' : 'text-blue-300'} px-0.5 rounded-br">×${partySize}</span>` : ''}
        </button>`;
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
                statsContainer.innerHTML = `
                    <div class="flex items-center gap-2">
                        <!-- Total Revenue Section -->
                        <div class="min-w-[200px] flex flex-col items-start justify-center border-r border-slate-700/50 pr-4 mr-1 cursor-pointer group" onclick="app.toggleRevenueMode()">
                            <div class="text-[10px] uppercase font-black text-slate-400 tracking-widest transition-colors mb-0.5">Total ${(this.data.config.revenueMode || 'weekly') === 'monthly' ? 'Monthly' : 'Weekly'}</div>
                            <div class="text-xl font-bold font-mono text-amber-300 tracking-tight group-hover:scale-105 transition-transform leading-none shadow-amber-900/20 drop-shadow-md">0</div>
                        </div>

                        <!-- Kronos Section -->
                        <div class="w-52 flex items-center gap-2 opacity-40">
                            <div class="flex flex-col items-center justify-center bg-slate-800/50 rounded px-2 py-1 border border-emerald-900/30 min-w-[54px]">
                                <i data-lucide="gem" class="w-3.5 h-3.5 text-emerald-400 mb-0.5"></i>
                                <span class="text-xs font-mono font-bold text-white">0/${this.data.config.worldMaxCrystals || 180}</span>
                            </div>
                            <div class="flex flex-col items-start justify-center min-w-0 flex-1">
                                <span class="text-[11px] uppercase font-bold text-emerald-500 tracking-wider leading-none mb-0.5">Kronos</span>
                                <span class="text-base font-mono text-emerald-300 font-bold leading-none truncate w-full">0</span>
                            </div>
                        </div>

                        <!-- Challenger Section -->
                        <div class="w-52 flex items-center gap-2 opacity-40">
                            <div class="flex flex-col items-center justify-center bg-slate-800/50 rounded px-2 py-1 border border-purple-900/30 min-w-[54px]">
                                <i data-lucide="gem" class="w-3.5 h-3.5 text-purple-400 mb-0.5"></i>
                                <span class="text-xs font-mono font-bold text-white">0/${this.data.config.worldMaxCrystals || 180}</span>
                            </div>
                            <div class="flex flex-col items-start justify-center min-w-0 flex-1">
                                <span class="text-[11px] uppercase font-bold text-purple-500 tracking-wider leading-none mb-0.5">Challenger</span>
                                <span class="text-base font-mono text-purple-300 font-bold leading-none truncate w-full">0</span>
                            </div>
                        </div>
                    </div>
                `;
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
                const settings = char.settings || { daily_ids: [], weekly_ids: [], boss_ids: [] };
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

        const getRev = (s) => Math.floor(revMode === 'monthly' ? (s.weekly * 4 + s.monthly) : s.weekly).toLocaleString();
        const kRevDisp = getRev(kStats);
        const cRevDisp = getRev(cStats);
        const totalRevDisp = Math.floor((revMode === 'monthly' ? (kStats.weekly * 4 + kStats.monthly) : kStats.weekly) + (revMode === 'monthly' ? (cStats.weekly * 4 + cStats.monthly) : cStats.weekly)).toLocaleString();

        const activeSrv = this.data.config.activeServer;
        const kOpacity = activeSrv === 'ALL' || activeSrv === 'KRONOS' ? 'opacity-100' : 'opacity-40';
        const cOpacity = activeSrv === 'ALL' || activeSrv === 'CHALLENGER' ? 'opacity-100' : 'opacity-40';

        const statsContainer = document.getElementById('dashboard-stats-container');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="flex items-center gap-2">
                    <!-- Total Revenue Section -->
                    <div class="min-w-[200px] flex flex-col items-start justify-center border-r border-slate-700/50 pr-4 mr-1 cursor-pointer group" onclick="app.toggleRevenueMode()">
                        <div class="text-[10px] uppercase font-black text-slate-400 tracking-widest transition-colors mb-0.5">Total ${revMode === 'monthly' ? 'Monthly' : 'Weekly'}</div>
                        <div class="text-xl font-bold font-mono text-amber-300 tracking-tight group-hover:scale-105 transition-transform leading-none shadow-amber-900/20 drop-shadow-md">${totalRevDisp}</div>
                    </div>

                    <!-- Kronos Section -->
                    <div class="w-52 flex items-center gap-2 ${kOpacity} transition-opacity">
                        <div class="flex flex-col items-center justify-center bg-slate-800/50 rounded px-2 py-1 border border-emerald-900/30 min-w-[54px]">
                            <i data-lucide="gem" class="w-3.5 h-3.5 text-emerald-400 mb-0.5"></i>
                            <span class="text-xs font-mono font-bold ${kStats.count >= worldLimit ? 'text-red-400' : 'text-white'}">${kStats.count}/${worldLimit}</span>
                        </div>
                        <div class="flex flex-col items-start justify-center min-w-0 flex-1">
                            <span class="text-[11px] uppercase font-bold text-emerald-500 tracking-wider leading-none mb-0.5">Kronos</span>
                            <span class="text-base font-mono text-emerald-300 font-bold leading-none truncate w-full">${kRevDisp}</span>
                        </div>
                    </div>

                    <!-- Challenger Section -->
                    <div class="w-52 flex items-center gap-2 ${cOpacity} transition-opacity">
                        <div class="flex flex-col items-center justify-center bg-slate-800/50 rounded px-2 py-1 border border-purple-900/30 min-w-[54px]">
                            <i data-lucide="gem" class="w-3.5 h-3.5 text-purple-400 mb-0.5"></i>
                             <span class="text-xs font-mono font-bold ${cStats.count >= worldLimit ? 'text-red-400' : 'text-white'}">${cStats.count}/${worldLimit}</span>
                        </div>
                         <div class="flex flex-col items-start justify-center min-w-0 flex-1">
                            <span class="text-[11px] uppercase font-bold text-purple-500 tracking-wider leading-none mb-0.5">Challenger</span>
                            <span class="text-base font-mono text-purple-300 font-bold leading-none truncate w-full">${cRevDisp}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        const addCardHTML = `
            <button type="button" onclick="app.openAddCharacterFromDashboard()" class="bg-slate-900/40 hover:bg-slate-800/60 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-lg flex flex-col items-center justify-center gap-2 transition-all min-h-[13.75rem] w-full max-w-[32rem] text-slate-500 hover:text-indigo-300 group">
                <div class="w-14 h-14 rounded-full bg-slate-800 group-hover:bg-indigo-600/20 border border-slate-700 group-hover:border-indigo-500 flex items-center justify-center transition-all"><i data-lucide="plus" class="w-7 h-7"></i></div>
                <div class="text-sm font-bold">Add Character</div>
                <div class="text-[10px] text-slate-600 group-hover:text-slate-400">Fetch from Ranking API by name</div>
            </button>`;

        c.innerHTML = activeChars.map(char => {
            const p = char.progress || { daily: [], weekly: [], boss: [] };
            const settings = char.settings || { daily_ids: [], weekly_ids: [], boss_ids: [] };
            const partySizes = settings.boss_party_sizes || {};
            const mD = this.data.masterDailies.filter(d => (settings.daily_ids || []).includes(d.id));
            const mW = this.data.masterWeeklies.filter(w => (settings.weekly_ids || []).includes(w.id));
            const cB = this.data.masterBosses.filter(b => (settings.boss_ids || []).includes(b.id)).map(b => ({ ...b, pSize: partySizes[b.id] || 1, effectiveMeso: b.meso / (partySizes[b.id] || 1) })).sort((a, b) => b.effectiveMeso - a.effectiveMeso);
            const dB = cB.filter(b => b.type === 'DAILY'), wB = cB.filter(b => b.type === 'WEEKLY'), mB = cB.filter(b => b.type === 'MONTHLY');
            const localMaxTotal = wB.slice(0, charLimit).reduce((s, b) => s + b.effectiveMeso, 0);
            const countD = mD.filter(i => (p.daily || []).includes(i.id)).length, countW = mW.filter(i => (p.weekly || []).includes(i.id)).length;
            const countBD = dB.filter(i => (p.boss || []).includes(i.id)).length, countBM = mB.filter(i => (p.boss || []).includes(i.id)).length;
            const countBW = (p.boss || []).filter(id => wB.some(b => b.id === id)).length;

            const isKronos = char.server === 'KRONOS';
            const sCol = isKronos ? (this.data.config.serverKColor || 'emerald') : (this.data.config.serverCColor || 'purple');
            const themeClass = `border-${sCol}-500/50`;
            const badgeClass = `text-${sCol}-400 bg-${sCol}-950/30 border-${sCol}-500/20`;
            const hexaReady = (typeof hexaTracker !== 'undefined');
            const hexaClassId = hexaReady ? hexaTracker.getCharClassId(char) : null;
            const hexaPct = hexaClassId ? hexaTracker.getProgress('char:' + char.id, hexaClassId).pct : 0;

            // Sort each section
            const wkSorted = wB.sort((a, b) => b.effectiveMeso - a.effectiveMeso);
            const dmSorted = [...dB.sort((a, b) => b.effectiveMeso - a.effectiveMeso), ...mB.sort((a, b) => b.effectiveMeso - a.effectiveMeso)];
            const allB = [...wkSorted, ...dmSorted];
            const countAll = (p.boss || []).filter(id => allB.some(b => b.id === id)).length;
            const isWeeklyDone = !!p.charDone;
            const isMonthlyDone = !!p.charMonthlyDone;
            const allDone = (wkSorted.length + mB.length > 0) && (!wkSorted.length || isWeeklyDone) && (!mB.length || isMonthlyDone);

            return `
            <div class="bg-${sCol}-950/40 border ${allDone ? 'border-emerald-500/70 ring-1 ring-emerald-500/30' : themeClass} rounded-lg overflow-hidden shadow-sm flex transition-all relative w-full max-w-[32rem]">
                <!-- Left: Slim portrait job image (clickable → opens editor) -->
                <div onclick="app.openCharModal('${char.id}')" class="w-28 bg-gradient-to-b from-${sCol}-950/80 to-slate-950 border-r border-slate-800 flex-shrink-0 relative overflow-hidden cursor-pointer group hover:brightness-110 transition" title="Edit ${char.name}">
                    ${char.classImage ? `<img src="${char.classImage}" style="${this.getCharImgStyle(char)}">` : `<div class="w-full h-full flex items-center justify-center text-slate-700"><i data-lucide="user" class="w-8 h-8 opacity-40"></i></div>`}
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent pointer-events-none"></div>
                    <span class="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-bold border ${char.role === 'MAIN' ? 'border-yellow-500/50 text-yellow-300 bg-yellow-950/80' : (char.role === 'SUB' ? 'border-cyan-500/50 text-cyan-300 bg-cyan-950/80' : 'border-slate-600 text-slate-400 bg-slate-900/90')} backdrop-blur-sm">${char.role}</span>
                    ${hexaReady ? (hexaClassId ? `
                    <button onclick="event.stopPropagation(); hexaTracker.openForCharacter('${char.id}')" title="HEXA Matrix 進捗を開く"
                        class="absolute bottom-0 left-0 right-0 z-10 py-1 px-1 bg-gradient-to-r from-violet-700 via-indigo-600 to-blue-600 hover:from-violet-600 hover:via-indigo-500 hover:to-blue-500 text-white flex items-center justify-center gap-1.5 transition-all overflow-hidden border-t border-violet-300/50 shadow-[0_-3px_10px_rgba(20,16,60,0.55)]">
                        <span class="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></span>
                        <i data-lucide="hexagon" class="w-3.5 h-3.5 relative shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,.5)]"></i>
                        <span class="text-xs font-black tracking-widest relative drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]">HEXA</span>
                        ${hexaPct > 0 ? `<span class="text-[10px] font-bold tabular-nums relative text-blue-100 drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]">${hexaPct}%</span>` : ''}
                    </button>` : `
                    <button onclick="event.stopPropagation(); hexaTracker.openForCharacter('${char.id}')" title="HEXA職業を登録"
                        class="absolute bottom-0 left-0 right-0 z-10 py-1 px-1 bg-violet-950/90 hover:bg-violet-800/80 text-violet-200 border-t-2 border-dashed border-violet-400/70 flex items-center justify-center gap-1 transition-all backdrop-blur-sm shadow-[0_-3px_10px_rgba(20,16,60,0.5)]">
                        <i data-lucide="plus" class="w-3.5 h-3.5 shrink-0"></i>
                        <span class="text-xs font-extrabold tracking-widest drop-shadow-[0_1px_1px_rgba(0,0,0,.6)]">HEXA</span>
                    </button>`) : ''}
                </div>
                <!-- Right: Header + Boss checklist -->
                <div class="flex-1 flex flex-col min-w-0">
                    <!-- Top: Character info bar -->
                    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900/40">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-baseline gap-2 min-w-0">
                                <h3 class="text-base font-extrabold text-white truncate leading-tight">${char.name}</h3>
                                <span class="text-xs font-mono font-extrabold text-${sCol}-300 flex-shrink-0">Lv.${char.level || '?'}</span>
                            </div>
                            <p class="text-xs text-indigo-300 font-semibold truncate leading-tight">${char.job || '—'}</p>
                        </div>
                        <div class="text-right flex-shrink-0 leading-none">
                            <div class="text-[9px] text-emerald-400 font-extrabold uppercase tracking-wider">Mesos</div>
                            <div class="text-lg font-extrabold text-emerald-300 font-mono leading-none mt-0.5">${Math.floor(localMaxTotal).toLocaleString()}</div>
                        </div>
                        <span class="text-[10px] font-mono font-extrabold text-slate-300 bg-slate-950/70 border border-slate-700 px-2 py-1 rounded flex-shrink-0">${countAll}/${allB.length}</span>
                    </div>
                    <!-- Boss checklist (min height ≈ 4 boss rows total: Monthly + 3 Weekly, or 4 Weekly) -->
                    <div class="flex-1 p-1.5 bg-slate-950/20 space-y-1 min-h-[13.75rem]">
                        ${mB.length ? `
                        <div>
                            <div class="flex items-center gap-1.5 mb-0.5">
                                <span class="text-[9px] font-black uppercase tracking-widest text-yellow-400 leading-none">Monthly</span>
                                <button onclick="app.toggleCharDone('${char.id}','monthly')" title="${isMonthlyDone ? '月ボスの消し込みを解除' : 'このキャラの月ボスを消し込む'}"
                                    class="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-extrabold text-[9px] leading-none transition-all border ${isMonthlyDone ? 'bg-yellow-500 border-yellow-300 text-slate-950' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-yellow-700/50 hover:border-yellow-500 hover:text-yellow-200'}">
                                    <i data-lucide="${isMonthlyDone ? 'check-circle-2' : 'circle'}" class="w-2.5 h-2.5"></i><span>COMPLETE</span>
                                </button>
                            </div>
                            <div class="relative">
                                <div class="grid grid-flow-col auto-cols-[3rem] gap-1 overflow-x-auto justify-start">${mB.sort((a, b) => b.effectiveMeso - a.effectiveMeso).map(b => this.getBossBtnHTML(char.id, b, (p.boss || []).includes(b.id), b.pSize)).join('')}</div>
                                ${isMonthlyDone ? `
                                <div onclick="app.toggleCharDone('${char.id}','monthly')" title="クリックで消し込みを解除" class="absolute inset-0 z-10 rounded bg-slate-950/75 backdrop-blur-[1px] flex items-center justify-center cursor-pointer hover:bg-slate-950/60 transition-colors">
                                    <div class="flex items-center gap-1.5 border-2 border-yellow-400/90 text-yellow-300 rounded-lg px-3 py-0.5 -rotate-3 bg-slate-950/70 shadow-lg shadow-yellow-950/60">
                                        <i data-lucide="check-circle-2" class="w-4 h-4"></i>
                                        <span class="text-xs font-black tracking-[0.2em]">COMPLETE</span>
                                    </div>
                                </div>` : ''}
                            </div>
                        </div>` : ''}
                        ${wkSorted.length ? `
                        <div>
                            <div class="flex items-center gap-1.5 mb-0.5">
                                <span class="text-[9px] font-black uppercase tracking-widest text-purple-400 leading-none">Weekly</span>
                                <button onclick="app.toggleCharDone('${char.id}','weekly')" title="${isWeeklyDone ? '週ボスの消し込みを解除' : 'このキャラの週ボスを消し込む'}"
                                    class="flex items-center gap-0.5 px-1.5 py-0.5 rounded font-extrabold text-[9px] leading-none transition-all border ${isWeeklyDone ? 'bg-purple-600 border-purple-400 text-white' : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-purple-700/50 hover:border-purple-500 hover:text-purple-200'}">
                                    <i data-lucide="${isWeeklyDone ? 'check-circle-2' : 'circle'}" class="w-2.5 h-2.5"></i><span>COMPLETE</span>
                                </button>
                            </div>
                            <div class="relative">
                                <div class="grid grid-cols-[repeat(7,minmax(0,3rem))] gap-1">
                                    ${wkSorted.map(b => this.getBossBtnHTML(char.id, b, (p.boss || []).includes(b.id), b.pSize)).join('')}
                                </div>
                                ${isWeeklyDone ? `
                                <div onclick="app.toggleCharDone('${char.id}','weekly')" title="クリックで消し込みを解除" class="absolute inset-0 z-10 rounded bg-slate-950/75 backdrop-blur-[1px] flex items-center justify-center cursor-pointer hover:bg-slate-950/60 transition-colors">
                                    <div class="flex items-center gap-2 border-2 border-purple-400/90 text-purple-300 rounded-lg px-4 py-1 -rotate-3 bg-slate-950/70 shadow-lg shadow-purple-950/60">
                                        <i data-lucide="check-circle-2" class="w-5 h-5"></i>
                                        <span class="text-base font-black tracking-[0.25em]">COMPLETE</span>
                                    </div>
                                </div>` : ''}
                            </div>
                        </div>` : ''}
                        ${!mB.length && !wkSorted.length ? this.getEmptyPlaceholderHTML("No Bosses Configured", "") : ''}
                    </div>
                </div>
            </div>`;
        }).join('') + addCardHTML;
        lucide.createIcons();
    },
    toggleTask(cid, type, tid) {
        const c = this.data.characters.find(x => x.id === cid); if (!c) return;
        if (!c.progress) c.progress = { daily: [], weekly: [], boss: [] };
        if (!Array.isArray(c.progress[type])) c.progress[type] = [];
        if (c.progress[type].includes(tid)) c.progress[type] = c.progress[type].filter(id => id !== tid); else c.progress[type].push(tid);
        this.saveData(); this.renderDashboard();
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

        if (c) c.innerHTML = activeChars.map((x, idx) => {
            const settings = x.settings || { daily_ids: [], weekly_ids: [], boss_ids: [] };
            const bossCount = (settings.boss_ids || []).length;
            const isKronos = x.server === 'KRONOS';
            const sCol = isKronos ? (this.data.config.serverKColor || 'emerald') : (this.data.config.serverCColor || 'purple');
            const charLimit = this.data.config.charMaxCrystals || 14;
            const charWeekly = this.data.masterBosses.filter(b => (settings.boss_ids || []).includes(b.id) && b.type === 'WEEKLY').length;

            return `
            <div class="bg-slate-900 border border-${sCol}-500/40 rounded-xl overflow-hidden flex flex-col group shadow-lg transition-all hover:border-${sCol}-500/70 relative">
                <span class="absolute top-2 left-2 z-10 text-[10px] font-bold text-slate-500 bg-slate-950/70 px-1.5 py-0.5 rounded">#${idx + 1}</span>
                ${x.hidden ? `<span class="absolute top-2 right-2 z-10 text-[9px] font-bold text-slate-400 bg-slate-950/80 border border-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1"><i data-lucide="eye-off" class="w-2.5 h-2.5"></i>Hidden</span>` : ''}
                <div class="w-full aspect-square bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    ${x.classImage ? `<img src="${x.classImage}" class="w-full h-full object-cover">` : `<div class="text-slate-800"><i data-lucide="user" class="w-16 h-16"></i></div>`}
                    ${x.image && x.image.startsWith('http') ? `<img src="${x.image}" class="absolute bottom-0 right-0 w-20 h-20 object-contain opacity-90 pointer-events-none">` : ''}
                </div>
                <div class="p-2 flex flex-col gap-1 min-w-0">
                    <div class="flex items-baseline gap-1 min-w-0">
                        <h3 class="text-[13px] font-extrabold text-white truncate leading-tight flex-1 min-w-0" title="${x.name}">${x.name}</h3>
                        <span class="text-[10px] font-mono font-bold text-${sCol}-300 flex-shrink-0">Lv.${x.level || '?'}</span>
                    </div>
                    <div class="flex items-center justify-between text-[9px] min-w-0 gap-1">
                        <span class="text-slate-400 truncate flex-1 min-w-0" title="${x.job || ''}">${x.job || '—'}</span>
                        <span class="font-mono ${charWeekly > charLimit ? 'text-amber-400' : 'text-slate-500'} flex-shrink-0" title="Weekly bosses">${charWeekly}/${charLimit}</span>
                    </div>
                    <div class="grid grid-cols-4 gap-0.5 pt-1 border-t border-slate-800/60">
                        <button onclick="app.openCharModal('${x.id}')" title="Edit details" class="p-1 bg-slate-800 hover:bg-indigo-600 rounded text-slate-400 hover:text-white transition-colors flex justify-center"><i data-lucide="pencil" class="w-2.5 h-2.5"></i></button>
                        <button onclick="app.refreshCharacter('${x.id}')" title="Refresh from API" class="p-1 bg-slate-800 hover:bg-emerald-600 rounded text-slate-400 hover:text-white transition-colors flex justify-center"><i data-lucide="refresh-cw" class="w-2.5 h-2.5"></i></button>
                        <button onclick="app.toggleCharHidden('${x.id}')" title="${x.hidden ? 'Show' : 'Hide'} on dashboard" class="p-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors flex justify-center"><i data-lucide="${x.hidden ? 'eye-off' : 'eye'}" class="w-2.5 h-2.5"></i></button>
                        <button onclick="app.deleteCharacter('${x.id}')" title="Delete" class="p-1 bg-slate-800 hover:bg-rose-600 rounded text-slate-400 hover:text-white transition-colors flex justify-center"><i data-lucide="trash-2" class="w-2.5 h-2.5"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
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
                if (typeof CLASS_DATA !== 'undefined') {
                    const all = Object.values(CLASS_DATA).flat();
                    const target = (info.jobName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                    const m = all.find(j => j.name.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
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
                if (typeof CLASS_DATA !== 'undefined') {
                    const all = Object.values(CLASS_DATA).flat();
                    const target = job.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const m = all.find(j => j.name.toLowerCase().replace(/[^a-z0-9]/g, '') === target);
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
            settings: { daily_ids: [], weekly_ids: [], boss_ids: [], boss_party_sizes: {} },
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

    renderTaskMaster() { this.switchTaskTab(this.currentTaskTab); },
    switchTaskTab(t) {
        this.currentTaskTab = t;
        ['daily', 'weekly', 'boss'].forEach(x => {
            const b = document.getElementById(`task-tab-btn-${x}`), c = document.getElementById(`task-content-${x}`);
            if (b && c) {
                if (x === t) { b.classList.add('tab-active'); b.classList.remove('tab-inactive'); c.classList.remove('hidden'); }
                else { b.classList.remove('tab-active'); b.classList.add('tab-inactive'); c.classList.add('hidden'); }
            }
        });
        const rl = (id, l, tp) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = (l || []).map(i => `<div class="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-700 text-xs mb-2"><div class="flex-1 overflow-hidden"><span class="text-slate-200 font-medium block truncate"><span class="text-xs font-bold text-indigo-400 mr-2">[${i.type || (i.isEvent ? 'EVENT' : 'OTHER')}]</span>${i.name}</span></div><button onclick="app.deleteMasterItem('${tp}','${i.id}')" class="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-slate-900"><i data-lucide="trash" class="w-3 h-3"></i></button></div>`).join('');
        };
        rl('master-daily-list', this.data.masterDailies, 'masterDailies');
        rl('master-weekly-list', this.data.masterWeeklies, 'masterWeeklies');
        this.data.masterBosses.sort((a, b) => b.meso - a.meso);
        const bl = document.getElementById('master-boss-list');
        if (bl) bl.innerHTML = this.data.masterBosses.map(b => this.editingBossId === b.id
            ? `<div class="flex items-center gap-2 bg-slate-800 p-2 rounded border border-indigo-500 text-sm mb-2"><input id="edit-meso-${b.id}" type="number" value="${b.meso}" class="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white"><button onclick="app.saveEditBoss('${b.id}')" class="bg-indigo-600 p-1 rounded text-white"><i data-lucide="check" class="w-3 h-3"></i></button></div>`
            : `<div class="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-700 text-xs mb-2"><div class="flex-1 overflow-hidden"><div class="flex items-center gap-2 mb-0.5"><span class="px-1.5 py-0.5 rounded text-[8px] font-bold ${this.getBadgeClass(b.difficulty)}">${b.difficulty}</span><span class="text-slate-200 font-medium truncate">${b.name}</span></div><div class="text-[10px] text-slate-500 flex items-center gap-2"><span>${b.meso.toLocaleString()}</span></div></div><div class="flex gap-1"><button onclick="app.startEditBoss('${b.id}')" class="text-slate-500 hover:text-indigo-400 p-1 rounded hover:bg-slate-900"><i data-lucide="pencil" class="w-3 h-3"></i></button><button onclick="app.deleteBoss('${b.id}')" class="text-slate-600 hover:text-red-400 p-1 rounded hover:bg-slate-900"><i data-lucide="trash" class="w-3 h-3"></i></button></div></div>`
        ).join('');
        lucide.createIcons();
    },
    addMasterItem(e, l) {
        e.preventDefault(); const f = e.target;
        if (f.name.value) {
            if (!this.data[l]) this.data[l] = [];
            this.data[l].push({ id: 'i' + Date.now(), name: f.name.value, kana: f.kana.value, type: f.type.value });
            f.reset(); this.saveData(); this.renderTaskMaster();
        }
    },
    deleteMasterItem(l, id) { if (confirm('Delete?')) { this.data[l] = this.data[l].filter(x => x.id !== id); this.saveData(); this.renderTaskMaster(); } },
    addBoss(e) { e.preventDefault(); const f = e.target; this.data.masterBosses.push({ id: 'b' + Date.now(), name: f.name.value, kana: f.kana.value, difficulty: f.diff.value, meso: parseInt(f.meso.value) || 0, type: f.type.value }); f.reset(); this.saveData(); this.renderTaskMaster(); },
    startEditBoss(id) { this.editingBossId = id; this.renderTaskMaster(); },
    saveEditBoss(id) { const v = document.getElementById(`edit-meso-${id}`).value; const b = this.data.masterBosses.find(x => x.id === id); if (b) { b.meso = parseInt(v) || 0; this.editingBossId = null; this.saveData(); this.renderTaskMaster(); } },
    deleteBoss(id) { if (confirm('Delete?')) { this.data.masterBosses = this.data.masterBosses.filter(x => x.id !== id); this.saveData(); this.renderTaskMaster(); } },
    openCharModal(cid = null, initialTab = 'boss') {
        const m = document.getElementById('char-modal'), f = document.getElementById('char-form');
        if (!m || !f) return;

        // thorough reset
        f.reset();
        document.getElementById('preview-class-container').classList.add('hidden');
        document.getElementById('preview-api-container').classList.remove('hidden'); // Always show container
        document.getElementById('preview-class-img').src = "";
        document.getElementById('preview-api-img').src = "";
        document.getElementById('preview-api-img').classList.add('hidden'); // Default hide img
        const ph = document.getElementById('preview-api-placeholder');
        if (ph) ph.classList.remove('hidden'); // Default show placeholder
        document.getElementById('preview-api-name').innerText = "--";

        m.classList.remove('hidden');
        this.currentBossFilter = 'ALL';
        this.activeCharId = cid;

        if (cid) {
            const c = this.data.characters.find(x => x.id === cid);
            this.tempBossIds = new Set(c.settings?.boss_ids || []);
            this.tempPartySizes = { ...(c.settings?.boss_party_sizes || {}) };
            this.initBossConfigState(c);

            document.getElementById('modal-title').innerText = 'Edit Character';
            f.id.value = c.id;
            f.name.value = c.name;
            f.level.value = c.level || "";
            f.job.value = c.job;
            f.role.value = c.role;
            f.image.value = c.image || "";
            f.memo.value = c.memo || "";

            // Set Job Select & Class Preview
            const jobSel = document.getElementById('char-job-select');
            if (jobSel && typeof CLASS_DATA !== 'undefined') {
                const opts = Array.from(jobSel.options);
                const match = opts.find(o => o.dataset.name === c.job);
                if (match) {
                    jobSel.value = match.value;
                    // Manually populate since we don't call onJobSelect to avoid side effects
                    document.getElementById('preview-class-img').src = match.dataset.path;
                    document.getElementById('preview-class-name').innerText = match.dataset.name;
                    document.getElementById('preview-class-container').classList.remove('hidden');
                }
            }
            // Set API Preview if exists, else show placeholder
            const apiImg = document.getElementById('preview-api-img');
            const apiPh = document.getElementById('preview-api-placeholder');
            const apiContainer = document.getElementById('preview-api-container');

            if (c.image && c.image.startsWith('http')) {
                apiImg.src = c.image;
                apiImg.classList.remove('hidden');
                if (apiPh) apiPh.classList.add('hidden');
                document.getElementById('preview-api-name').innerText = "Custom/API";
            } else {
                apiImg.src = "";
                apiImg.classList.add('hidden');
                if (apiPh) apiPh.classList.remove('hidden');
                document.getElementById('preview-api-name').innerText = "--";
            }
            if (apiContainer) apiContainer.classList.remove('hidden');

            const radio = f.querySelector(`input[name="server"][value="${c.server || 'KRONOS'}"]`);
            if (radio) radio.checked = true;

            this.applyImagePosToUI(c);
        } else {
            this.tempBossIds = new Set();
            this.tempPartySizes = {};
            this.bcCharId = null;
            this.bcSelected = {};
            this.bcParty = {};
            this.bcDiff = {};
            this.bcTab = 'WEEKLY';
            document.getElementById('modal-title').innerText = 'Add Character';
            f.id.value = "";
            f.name.value = "";
            f.level.value = "";
            f.job.value = "";
            f.image.value = "";

            // Reset Job Select
            const jobSel = document.getElementById('char-job-select');
            if (jobSel) jobSel.value = "";

            // Default Server Selection
            const targetServer = this.data.config.activeServer === 'ALL' ? 'KRONOS' : this.data.config.activeServer;
            const radio = f.querySelector(`input[name="server"][value="${targetServer}"]`);
            if (radio) radio.checked = true;

            this.applyImagePosToUI(null);
        }

        this.renderModalLists(cid);
        this.switchCharTab(initialTab);
    },
    updateTempBoss(id, checked) { if (checked) this.tempBossIds.add(id); else this.tempBossIds.delete(id); this.renderBossListFiltered(); },
    updateTempParty(id, val) { const size = parseInt(val); if (size > 1) this.tempPartySizes[id] = size; else delete this.tempPartySizes[id]; },
    renderModalLists(cid) {
        const c = cid ? this.data.characters.find(x => x.id === cid) : null;
        const settings = c?.settings || { daily_ids: [], weekly_ids: [], boss_ids: [] };
        const typeColor = {
            EVENT: 'text-rose-300 bg-rose-950/40 border-rose-500/30',
            SYMBOL: 'text-cyan-300 bg-cyan-950/40 border-cyan-500/30',
            MONPA: 'text-orange-300 bg-orange-950/40 border-orange-500/30',
            EPIC_DUNGEON: 'text-purple-300 bg-purple-950/40 border-purple-500/30',
            HEXA: 'text-indigo-300 bg-indigo-950/40 border-indigo-500/30',
            GUILD: 'text-amber-300 bg-amber-950/40 border-amber-500/30',
            OTHER: 'text-slate-300 bg-slate-800 border-slate-600'
        };
        const rc = (id, l, chk, nm) => {
            const el = document.getElementById(id);
            if (!el) return;
            const items = l || [];
            if (!items.length) { el.innerHTML = '<div class="col-span-full text-center text-slate-500 text-xs py-8 italic">No tasks defined. Add some in the Tasks view.</div>'; return; }
            el.innerHTML = items.map(i => {
                const t = i.type || (i.isEvent ? 'EVENT' : 'OTHER');
                const checked = (chk || []).includes(i.id);
                const badge = typeColor[t] || typeColor.OTHER;
                return `
                <label class="group flex items-center gap-3 cursor-pointer bg-slate-800/60 hover:bg-slate-800 border ${checked ? 'border-indigo-500/60 ring-1 ring-indigo-500/30' : 'border-slate-700/60'} rounded-lg px-3 py-2.5 transition-all">
                    <input type="checkbox" name="${nm}" value="${i.id}" class="accent-indigo-500 w-4 h-4 flex-shrink-0" ${checked ? 'checked' : ''}>
                    <div class="flex-1 min-w-0 overflow-hidden">
                        <div class="text-sm font-bold text-white truncate leading-tight">${i.name}</div>
                        ${i.kana ? `<div class="text-[10px] text-slate-500 truncate">${i.kana}</div>` : ''}
                    </div>
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badge} flex-shrink-0 uppercase tracking-wider">${t.replace('_', ' ')}</span>
                </label>`;
            }).join('');
        };
        rc('modal-daily-list', this.data.masterDailies, settings.daily_ids, 'chk_daily');
        rc('modal-weekly-list', this.data.masterWeeklies, settings.weekly_ids, 'chk_weekly');
    },
    renderBossListFiltered() {
        const filteredBosses = this.data.masterBosses.filter(b => this.currentBossFilter === 'ALL' || b.difficulty === this.currentBossFilter).sort((a, b) => b.meso - a.meso);
        const el = document.getElementById('modal-boss-list');
        if (el) el.innerHTML = filteredBosses.map(b => {
            const isChecked = this.tempBossIds.has(b.id), pSize = this.tempPartySizes[b.id] || 1;
            return `<div class="flex items-center gap-2 p-2 rounded border border-slate-700/50 hover:bg-slate-800"><label class="flex-1 flex items-center gap-2 cursor-pointer"><input type="checkbox" onchange="app.updateTempBoss('${b.id}', this.checked)" class="accent-indigo-500 w-4 h-4" ${isChecked ? 'checked' : ''}><div class="overflow-hidden"><div class="flex items-center gap-1"><span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${this.getBadgeClass(b.difficulty)}">${b.difficulty}</span> <span class="truncate text-xs font-medium text-slate-200">${b.name}</span></div></div></label><input type="number" min="1" max="6" value="${pSize}" onchange="app.updateTempParty('${b.id}', this.value)" class="w-10 h-6 bg-slate-900 border border-slate-600 rounded text-center text-xs text-white outline-none focus:border-indigo-500"></div>`;
        }).join('');
    },
    filterCharBosses(filter) { this.currentBossFilter = filter; this.renderBossListFiltered(); },
    switchCharTab(t) {
        ['daily', 'weekly', 'boss'].forEach(x => {
            const b = document.getElementById(`char-tab-btn-${x}`), c = document.getElementById(`char-content-${x}`);
            if (b && c) {
                if (x === t) { b.classList.add('tab-active'); b.classList.remove('tab-inactive'); c.classList.remove('hidden'); }
                else { b.classList.remove('tab-active'); b.classList.add('tab-inactive'); c.classList.add('hidden'); }
            }
        });
        const toolbar = document.getElementById('cm-boss-toolbar');
        if (toolbar) toolbar.classList.toggle('hidden', t !== 'boss');
        if (t === 'boss') {
            this.switchBossConfigTab(this.bcTab || 'WEEKLY');
            lucide.createIcons();
        }
    },
    closeCharModal() { document.getElementById('char-modal').classList.add('hidden'); },
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
        let classImgPath = "";
        if (typeof CLASS_DATA !== 'undefined' && f.job.value) {
            const all = Object.values(CLASS_DATA).flat();
            classImgPath = all.find(j => j.name === f.job.value)?.path || "";
        }

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
            server: f.querySelector('input[name="server"]:checked')?.value || 'KRONOS',
            settings: {
                daily_ids: Array.from(f.querySelectorAll('input[name="chk_daily"]:checked')).map(c => c.value),
                weekly_ids: Array.from(f.querySelectorAll('input[name="chk_weekly"]:checked')).map(c => c.value),
                boss_ids,
                boss_party_sizes
            },
            progress: { daily: pc?.progress?.daily || [], weekly: pc?.progress?.weekly || [], boss: pc?.progress?.boss || [] }
        };
        const idx = this.data.characters.findIndex(x => x.id === id);
        if (idx >= 0) this.data.characters[idx] = nd; else this.data.characters.push(nd);
        this.saveData(); this.closeCharModal(); this.renderCharacters(); this.renderDashboard();
    },
    deleteCharacter(id) { if (confirm('Delete?')) { this.data.characters = this.data.characters.filter(x => x.id !== id); this.saveData(); this.renderCharacters(); this.renderDashboard(); } },
    resetAllData() { if (confirm('Factory Reset?')) { localStorage.removeItem('gms_v24_data'); location.reload(); } },

    // ========== Boss Config Modal (MapleHub style) ==========
    DIFF_ORDER: ['EASY', 'NORMAL', 'HARD', 'CHAOS', 'EXTREME'],

    // MapleHub CDN boss image slug mapping (key: boss.name)
    BOSS_SLUG_MAP: {
        'Black Mage': 'black-mage',
        'Kaling': 'kaling',
        'First Adversary': 'the-first-adversary',
        'Kalos the Guardian': 'kalos-the-guardian',
        'Chosen Seren': 'chosen-seren',
        'Baldrix': 'baldrix',
        'Malefic Star': 'malefic-star',
        'Limbo': 'limbo',
        'Lotus': 'lotus',
        'Verus Hilla': 'verus-hilla',
        'Darknell': 'darknell',
        'Will': 'will',
        'Guardian Angel Slime': 'guardian-angel-slime',
        'Gloom': 'gloom',
        'Lucid': 'lucid',
        'Damien': 'damien',
        'Mitsuhide': 'akechi-mitsuhide',
        'Papulatus': 'papulatus',
        'Vellum': 'vellum',
        'Magnus': 'magnus',
        'Princess No': 'princess-no',
        'Zakum': 'zakum',
        'Pierre': 'pierre',
        'Von Bon': 'von-bon',
        'Crimson Queen': 'crimson-queen',
        'Cygnus': 'cygnus',
        'Pink Bean': 'pink-bean',
        'Hilla': 'hilla',
        'Arkarium': 'arkarium',
        'Gollux': 'gollux'
    },

    getBossImageUrl(bossName) {
        const slug = this.BOSS_SLUG_MAP[bossName] || (bossName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
        return Object.values(groups).sort((a, b) => {
            const maxA = Math.max(...a.variants.map(v => v.meso));
            const maxB = Math.max(...b.variants.map(v => v.meso));
            return maxB - maxA;
        });
    },

    openBossConfigModal(charId) {
        // Now opens the unified edit modal on the Bosses tab.
        this.openCharModal(charId, 'boss');
    },

    initBossConfigState(c) {
        this.bcCharId = c.id;
        this.bcTab = 'WEEKLY';
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

    switchBossConfigTab(type) {
        if (type === 'DAILY') type = 'WEEKLY';
        this.bcTab = type;
        ['MONTHLY', 'WEEKLY'].forEach(t => {
            const btn = document.getElementById(`bc-tab-${t}`);
            if (!btn) return;
            const base = "px-2.5 py-1 rounded text-[11px] font-bold transition-colors flex items-center gap-1";
            if (t === type) btn.className = `${base} bg-indigo-600 text-white shadow-sm`;
            else btn.className = `${base} text-slate-400 hover:text-white`;
        });
        const search = document.getElementById('bc-search');
        if (search) search.placeholder = `Search ${type.toLowerCase()} bosses...`;
        this.renderBossConfigGrid();
    },

    renderBossConfigGrid() {
        const grid = document.getElementById('bc-grid');
        if (!grid) return;
        const groups = this.getBossGroups(this.bcTab);

        grid.innerHTML = groups.map(g => {
            const key = `${this.bcTab}:${g.name}`;
            const isSel = !!this.bcSelected[key];
            const currentDiff = this.bcDiff[key] || g.variants[0].difficulty;
            const variant = g.variants.find(v => v.difficulty === currentDiff) || g.variants[0];
            const pSize = this.bcParty[key] || 1;
            const eff = Math.floor(variant.meso / pSize);
            const cardCls = isSel ? 'bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/30' : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600';

            const img = this.getBossImageUrl(g.name);
            return `
            <div class="border rounded-lg p-2.5 transition-all ${cardCls}">
                <div class="flex items-center gap-2 mb-2">
                    ${img ? `<img src="${img}" alt="" class="w-9 h-9 object-contain flex-shrink-0 rounded ${isSel ? '' : 'opacity-80'}" onerror="this.style.display='none'">` : ''}
                    <div class="min-w-0 flex-1">
                        <div class="text-sm font-bold text-white truncate leading-tight">${g.name}</div>
                        ${g.kana ? `<div class="text-[10px] text-slate-500 truncate">${g.kana}</div>` : ''}
                    </div>
                    <button type="button" onclick="app.bcToggleSelect('${key}')" class="flex-shrink-0 w-5 h-5 rounded-full border-2 ${isSel ? 'bg-indigo-500 border-indigo-400' : 'border-slate-600 hover:border-indigo-400'} flex items-center justify-center transition-colors">
                        ${isSel ? '<i data-lucide="check" class="w-3 h-3 text-white"></i>' : ''}
                    </button>
                </div>
                <div class="flex items-center gap-1.5">
                    <select onchange="app.bcSetDiff('${key}', this.value)" class="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500">
                        ${g.variants.map(v => `<option value="${v.difficulty}" ${v.difficulty === currentDiff ? 'selected' : ''}>${v.difficulty.charAt(0) + v.difficulty.slice(1).toLowerCase()}</option>`).join('')}
                    </select>
                    <div class="flex items-center gap-0.5 flex-shrink-0">
                        <button type="button" onclick="app.bcAdjustParty('${key}', -1)" class="w-5 h-6 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 text-xs leading-none">−</button>
                        <span class="w-5 text-center text-xs font-mono font-bold text-white" title="Party size">${pSize}</span>
                        <button type="button" onclick="app.bcAdjustParty('${key}', 1)" class="w-5 h-6 bg-slate-900 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 text-xs leading-none">+</button>
                    </div>
                </div>
                <div class="mt-2 pt-1.5 border-t border-slate-700/50 flex items-baseline justify-between gap-2">
                    <span class="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Est. Mesos</span>
                    <span class="text-${isSel ? 'amber-300' : 'slate-400'} font-mono font-bold text-xs">${eff.toLocaleString()}</span>
                </div>
            </div>`;
        }).join('') || `<div class="col-span-full text-center text-slate-500 text-xs py-8">No ${this.bcTab.toLowerCase()} bosses</div>`;

        this.updateBossConfigCounter();
        lucide.createIcons();
    },

    bcToggleSelect(key) {
        this.bcSelected[key] = !this.bcSelected[key];
        if (this.bcSelected[key] && !this.bcDiff[key]) {
            const type = key.split(':')[0], name = key.split(':').slice(1).join(':');
            const group = this.getBossGroups(type).find(g => g.name === name);
            if (group) this.bcDiff[key] = group.variants[0].difficulty;
        }
        if (!this.bcParty[key]) this.bcParty[key] = 1;
        this.renderBossConfigGrid();
    },

    bcSetDiff(key, diff) {
        this.bcDiff[key] = diff;
        this.renderBossConfigGrid();
    },

    bcAdjustParty(key, delta) {
        const cur = this.bcParty[key] || 1;
        const next = Math.max(1, Math.min(6, cur + delta));
        this.bcParty[key] = next;
        this.renderBossConfigGrid();
    },

    updateBossConfigCounter() {
        const charLimit = this.data.config.charMaxCrystals || 14;
        let weeklyCount = 0, totalCount = 0, weeklyEarnings = 0;
        Object.keys(this.bcSelected).filter(k => this.bcSelected[k]).forEach(key => {
            const [type, ...rest] = key.split(':');
            const name = rest.join(':');
            const group = this.getBossGroups(type).find(g => g.name === name);
            if (!group) return;
            const diff = this.bcDiff[key] || group.variants[0].difficulty;
            const variant = group.variants.find(v => v.difficulty === diff);
            if (!variant) return;
            totalCount++;
            if (type === 'WEEKLY') {
                weeklyCount++;
                const eff = variant.meso / (this.bcParty[key] || 1);
                weeklyEarnings += eff;
            }
        });
        const sortedWeekly = Object.keys(this.bcSelected).filter(k => this.bcSelected[k] && k.startsWith('WEEKLY:')).map(key => {
            const name = key.split(':').slice(1).join(':');
            const group = this.getBossGroups('WEEKLY').find(g => g.name === name);
            if (!group) return 0;
            const diff = this.bcDiff[key] || group.variants[0].difficulty;
            const variant = group.variants.find(v => v.difficulty === diff);
            return variant ? variant.meso / (this.bcParty[key] || 1) : 0;
        }).sort((a, b) => b - a).slice(0, charLimit);
        const cappedEarnings = sortedWeekly.reduce((s, v) => s + v, 0);

        const counter = document.getElementById('bc-counter');
        const totalEl = document.getElementById('bc-total-selected');
        const earnEl = document.getElementById('bc-weekly-earnings');
        if (counter) {
            counter.innerText = `${weeklyCount}/${charLimit}`;
            counter.className = weeklyCount > charLimit ? 'font-mono text-amber-400 font-bold' : 'font-mono text-white font-bold';
        }
        if (totalEl) totalEl.innerText = `${totalCount} total selected`;
        if (earnEl) earnEl.innerText = Math.floor(cappedEarnings).toLocaleString();
    },

};
window.app = app;
window.onload = () => app.init();