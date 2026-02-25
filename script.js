const app = {
    data: { config: { charMaxCrystals: 14, worldMaxCrystals: 180, revenueMode: 'weekly', activeServer: 'KRONOS' }, characters: [], masterDailies: [], masterWeeklies: [], masterBosses: [], memo: "" },
    lastLoginDate: null, editingBossId: null, currentTaskTab: 'daily', activeCharId: null, currentBossFilter: 'ALL', tempBossIds: new Set(), tempPartySizes: {},

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
            // Removed: f.image.value = opt.dataset.path; (Keep image field for API/Custom only)

            document.getElementById('preview-class-img').src = opt.dataset.path;
            document.getElementById('preview-class-name').innerText = opt.dataset.name;
            previewContainer.classList.remove('hidden');
        } else {
            previewContainer.classList.add('hidden');
        }
    },
    loadData() {
        try {
            const stored = localStorage.getItem('gms_v24_data');
            if (stored) {
                this.data = JSON.parse(stored);
                if (!this.data.masterDailies) this.data.masterDailies = [...DEFAULT_DAILIES];
                if (!this.data.masterWeeklies) this.data.masterWeeklies = [...DEFAULT_WEEKLIES];
                if (!this.data.masterBosses) this.data.masterBosses = [...DEFAULT_BOSSES];
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
            const base = "px-3 py-1.5 rounded text-xs font-bold transition-all border";

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
                // ALL
                kBtn.className = `${base} ${kActive}`;
                cBtn.className = `${base} ${cActive}`;
            }
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
        const log = document.getElementById('fetch-debug-log');

        if (!f) return;
        const name = f.name.value;
        if (!name) return;

        if (log) {
            log.innerHTML = `Fetching info for: ${name}...`;
            log.classList.remove('hidden');
        }

        try {
            const apiUrl = `/api?name=${encodeURIComponent(name)}`;

            if (log) log.innerHTML += `<br>API: ${apiUrl}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`API Error: ${res.status} ${res.statusText}`);
            const data = await res.json();

            if (log) log.innerHTML += `<br>Response: ${JSON.stringify(data).substring(0, 200)}...`;

            if (data.ranks && data.ranks.length > 0) {
                // The API returns exact matches usually, but let's filter just in case
                const char = data.ranks.find(r => r.characterName.toLowerCase() === name.toLowerCase()) || data.ranks[0];

                if (log) log.innerHTML += `<br>Found: ${char.characterName}, Lv.${char.level}, Job:${char.jobName}`;

                // Update basic form fields
                f.level.value = char.level;
                f.job.value = char.jobName;

                // Job Mapping to CLASS_DATA
                let foundJobId = "";
                let foundJobImg = "";
                if (typeof CLASS_DATA !== 'undefined') {
                    const allJobs = Object.values(CLASS_DATA).flat();
                    const targetJob = char.jobName.toLowerCase().replace(/[^a-z0-9]/g, ''); // Normalize API job name

                    const matchedJob = allJobs.find(j => {
                        const dbJob = j.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        return dbJob === targetJob;
                    });

                    if (matchedJob) {
                        foundJobId = matchedJob.id;
                        foundJobImg = matchedJob.path;
                        if (log) log.innerHTML += `<br>Matched Key Job: ${matchedJob.name} (${matchedJob.id})`;
                    } else {
                        if (log) log.innerHTML += `<br>No matching key job found for ${char.jobName}`;
                    }
                }

                // Update Job Select Dropdown
                const jobSelect = document.getElementById('char-job-select');
                if (jobSelect && foundJobId) {
                    jobSelect.value = foundJobId;
                    this.onJobSelect(foundJobId); // This updates preview with class icon
                }

                // Image Handling
                // Priority: API Character Image > Class Icon > Default/Empty
                if (char.characterImgURL) {
                    f.image.value = char.characterImgURL;
                    // API Image Preview - Show Image
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
                } else {
                    // API Image Preview - No Image (Placeholder)
                    const apiPrev = document.getElementById('preview-api-container');
                    const apiImg = document.getElementById('preview-api-img');
                    const apiPh = document.getElementById('preview-api-placeholder');
                    if (apiPrev) {
                        if (apiImg) { apiImg.src = ""; apiImg.classList.add('hidden'); }
                        if (apiPh) apiPh.classList.remove('hidden');
                        document.getElementById('preview-api-name').innerText = "--";
                        apiPrev.classList.remove('hidden');
                    }
                }
            } else {
                if (log) log.innerHTML += `<br>No character found with name: ${name}`;
            }
        } catch (error) {
            console.error("Failed to fetch character data:", error);
            if (log) log.innerHTML += `<br>Error: ${error.message}`;
        } finally {
            // Optionally hide log after a delay or on success
            // setTimeout(() => { if (log) log.classList.add('hidden'); }, 5000);
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
                    c.progress.boss = (c.progress.boss || []).filter(bid => {
                        const mb = this.data.masterBosses.find(b => b.id === bid);
                        return mb && mb.type === 'MONTHLY';
                    });
                }
                if (now.getUTCDate() === 1) {
                    c.progress.boss = [];
                }
            });
            this.saveData();
        }
    },
    startClock() { setInterval(() => { const n = new Date(); document.getElementById('clock-jst').innerText = n.toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }); document.getElementById('clock-utc').innerText = n.toISOString().split('T')[1].split('.')[0]; }, 1000); },
    navigate(view) {
        document.querySelectorAll('[id^="view-"]').forEach(e => e.classList.add('hidden-page'));
        document.querySelectorAll('[id^="nav-"]').forEach(e => { e.classList.remove('nav-active'); e.classList.add('nav-inactive'); });
        document.getElementById(`view-${view}`).classList.remove('hidden-page');
        document.getElementById(`nav-${view}`).classList.add('nav-active');
        if (view === 'dashboard') this.renderDashboard(); if (view === 'characters') this.renderCharacters(); if (view === 'tasks') this.renderTaskMaster();
    },

    getRoleStyle(role) {
        if (role === 'MAIN') return 'bg-yellow-500/20 text-yellow-100 border border-yellow-500/50';
        if (role === 'SUB') return 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/50';
        return 'bg-slate-700/50 text-slate-300 border border-slate-600';
    },

    getEmptyPlaceholderHTML(message = "None", colSpan = "") {
        return `<div class="bg-slate-900/30 border border-slate-800/50 rounded flex items-center justify-center min-h-[34px] ${colSpan}">
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
            class="group flex items-center px-1.5 py-1 rounded border transition-all duration-200 text-left task-btn-compact w-full ${containerClass} h-[36px]">
            <i data-lucide="${icon}" class="w-3.5 h-3.5 flex-shrink-0 ${finalIconColor}"></i>
            <div class="ml-1.5 overflow-hidden flex flex-col justify-center min-w-0 flex-1">
                <div class="truncate text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5 ${typeColor}">${typeLabel}</div>
                <div class="truncate text-xs leading-tight ${textClass}">${item.name}</div>
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
        let activeClass = boss.type === 'WEEKLY' ? "bg-purple-900/40 border-purple-500/50 hover:bg-purple-900/60" : (boss.type === 'MONTHLY' ? "bg-yellow-900/30 border-yellow-500/50 hover:bg-yellow-900/50" : "bg-cyan-900/40 border-cyan-500/50 hover:bg-cyan-900/60");
        let iconColor = boss.type === 'WEEKLY' ? "text-purple-400" : (boss.type === 'MONTHLY' ? "text-yellow-400" : "text-cyan-400");
        const containerClass = isDone ? "bg-slate-950 border-slate-800 opacity-40" : activeClass;
        const badgeStyle = isDone ? "bg-slate-900 text-slate-700 border-slate-800 grayscale" : `${this.getBadgeClass(boss.difficulty)} border-white/10`;

        return `
        <button onclick="app.toggleTask('${charId}','boss','${boss.id}')" 
            class="group relative text-left px-1 py-1 rounded border flex items-center gap-1.5 transition-all duration-200 task-btn-compact w-full ${containerClass} h-[36px]">
            <i data-lucide="${isDone ? 'check-circle-2' : 'circle'}" class="w-3 h-3 flex-shrink-0 ${isDone ? 'text-slate-600' : iconColor}"></i>
            <div class="flex-1 flex flex-col justify-center gap-0.5 min-w-0">
                <div class="leading-none">
                    <span class="px-1 py-0.5 rounded text-[7px] font-bold leading-none uppercase ${badgeStyle} shrink-0 inline-block">${boss.difficulty}</span>
                </div>
                <div class="truncate text-xs leading-tight ${isDone ? 'text-slate-600 line-through font-medium' : 'text-slate-200 font-bold'}">${boss.name}</div>
            </div>
            ${partySize > 1 ? `<div class="absolute top-0.5 right-0.5 text-[8px] ${isDone ? 'text-slate-700' : 'text-blue-300'} flex items-center gap-0.5"><i data-lucide="users" class="w-2 h-2"></i>${partySize}</div>` : ''} 
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
        const activeChars = this.data.characters
            .filter(char => (this.data.config.activeServer === 'ALL' || char.server === this.data.config.activeServer) && !char.hidden)
            .sort((a, b) => (parseInt(b.level) || 0) - (parseInt(a.level) || 0));

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

            return `
            <div class="bg-${sCol}-950/40 border ${themeClass} rounded-xl overflow-hidden shadow-sm flex flex-col md:flex-row min-h-[140px] transition-all relative">
                <div class="w-full md:w-64 bg-${sCol}-950/60 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col flex-shrink-0">
                    <div class="w-full aspect-square relative bg-slate-950 flex items-center justify-center overflow-hidden group">
                        ${char.classImage ? `<img src="${char.classImage}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">` : `<div class="flex flex-col items-center justify-center text-slate-700"><i data-lucide="user" class="w-16 h-16 mb-2 opacity-50"></i><span class="text-[10px] font-bold tracking-widest opacity-30">NO IMAGE</span></div>`}
                        <div class="absolute top-3 left-3 flex flex-col gap-1 items-start z-10">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${char.role === 'MAIN' ? 'border-yellow-500/50 text-yellow-400 bg-yellow-950/40' : (char.role === 'SUB' ? 'border-cyan-500/50 text-cyan-400 bg-cyan-950/40' : 'border-slate-600 text-slate-400 bg-slate-900/60')} backdrop-blur-sm shadow-md">${char.role}</span>

                        </div>
                        <div class="absolute top-3 right-3 z-10 drop-shadow-md">
                             <div class="bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-slate-700/30 flex items-baseline gap-1 shadow-lg">
                                <span class="text-lg font-bold text-emerald-400 font-mono tracking-tight leading-none">${Math.floor(localMaxTotal).toLocaleString()}</span>
                                <span class="text-[8px] text-emerald-300 font-bold uppercase tracking-wider opacity-80">Mesos</span>
                             </div>
                        </div>
                        <div class="absolute inset-x-0 bottom-0 pt-16 pb-3 px-3 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent flex items-end justify-between z-10 gap-2">
                            <div class="flex flex-col min-w-0 flex-1 mr-1">
                                <p class="text-xs text-indigo-300 font-bold drop-shadow-sm mb-0.5 leading-none truncate">${char.job}</p>
                                <h3 class="text-xl font-bold text-white leading-tight drop-shadow-sm truncate pb-0.5">${char.name}</h3>
                            </div>
                            <!-- Character Image at bottom right ONLY if it is an API fetched image (starts with http) -->
                            ${char.image && char.image.startsWith('http') ? `<div class="absolute bottom-1 right-1 w-32 h-32 overflow-hidden pointer-events-none opacity-80"><img src="${char.image}" class="w-full h-full object-contain"></div>` : ''} 
                        </div>
                    </div>
                </div>
                <div class="flex-1 flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-slate-800">
                    <div class="w-full xl:w-72 flex-shrink-0 flex flex-col">
                        <div class="p-2 bg-slate-900/30">
                            <h4 class="text-indigo-400 text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"><i data-lucide="sun" class="w-3 h-3"></i> Daily <span class="ml-auto opacity-70 font-mono">${countD}/${mD.length}</span></h4>
                            <div class="grid grid-cols-2 gap-1">${mD.length ? mD.map(d => this.getTaskBtnHTML(char.id, d, 'daily', (p.daily || []).includes(d.id))).join('') : this.getEmptyPlaceholderHTML("None", "col-span-2")}</div>
                        </div>
                        <div class="border-t border-slate-800 mx-2"></div>
                        <div class="p-2 bg-slate-900/30 flex-1">
                            <h4 class="text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"><i data-lucide="calendar-clock" class="w-3 h-3"></i> Weekly <span class="ml-auto opacity-70 font-mono">${countW}/${mW.length}</span></h4>
                            <div class="grid grid-cols-2 gap-1">${mW.length ? mW.map(w => this.getTaskBtnHTML(char.id, w, 'weekly', (p.weekly || []).includes(w.id))).join('') : this.getEmptyPlaceholderHTML("None", "col-span-2")}</div>
                        </div>
                    </div>
                    <div class="p-2 flex-1 flex flex-col bg-slate-950/20">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div class="md:border-r md:border-slate-800 md:pr-3">
                                <h4 class="text-cyan-400 text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"><i data-lucide="eye" class="w-3 h-3"></i> Daily Boss <span class="ml-auto opacity-70 font-mono">${countBD}/${dB.length}</span></h4>
                                <div class="grid grid-cols-2 lg:grid-cols-3 gap-1">${dB.length ? dB.map(b => this.getBossBtnHTML(char.id, b, (p.boss || []).includes(b.id), b.pSize)).join('') : this.getEmptyPlaceholderHTML("None", "col-span-full")}</div>
                            </div>
                            <div>
                                <h4 class="text-yellow-400 text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"><i data-lucide="moon" class="w-3 h-3"></i> Monthly Boss <span class="ml-auto opacity-70 font-mono">${countBM}/${mB.length}</span></h4>
                                <div class="grid grid-cols-2 lg:grid-cols-3 gap-1">${mB.length ? mB.map(b => this.getBossBtnHTML(char.id, b, (p.boss || []).includes(b.id), b.pSize)).join('') : this.getEmptyPlaceholderHTML("None", "col-span-full")}</div>
                            </div>
                        </div>
                        <div class="border-t border-slate-800 my-2"></div>
                        <div class="flex-1">
                            <h4 class="text-purple-400 text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1"><i data-lucide="skull" class="w-3 h-3"></i> Weekly Boss <span class="ml-auto opacity-70 font-mono">${countBW}/${wB.length}</span></h4>
                            <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-1">${wB.length ? wB.map(b => this.getBossBtnHTML(char.id, b, (p.boss || []).includes(b.id), b.pSize)).join('') : this.getEmptyPlaceholderHTML("No Weekly Bosses", "col-span-full")}</div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();
    },
    toggleTask(cid, type, tid) {
        const c = this.data.characters.find(x => x.id === cid); if (!c) return;
        if (!c.progress) c.progress = { daily: [], weekly: [], boss: [] };
        if (!Array.isArray(c.progress[type])) c.progress[type] = [];
        if (c.progress[type].includes(tid)) c.progress[type] = c.progress[type].filter(id => id !== tid); else c.progress[type].push(tid);
        this.saveData(); this.renderDashboard();
    },

    renderCharacters() {
        const c = document.getElementById('char-list-container');
        const activeChars = this.data.characters.filter(char => this.data.config.activeServer === 'ALL' || char.server === this.data.config.activeServer);
        if (c) c.innerHTML = activeChars.map(x => {
            const settings = x.settings || { daily_ids: [], weekly_ids: [], boss_ids: [] };
            const charBosses = this.data.masterBosses.filter(b => (settings.boss_ids || []).includes(b.id));
            const counts = { daily: (settings.daily_ids || []).length, weekly: (settings.weekly_ids || []).length, bossD: charBosses.filter(b => b.type === 'DAILY').length, bossW: charBosses.filter(b => b.type === 'WEEKLY').length, bossM: charBosses.filter(b => b.type === 'MONTHLY').length };
            const isKronos = x.server === 'KRONOS';
            const sCol = isKronos ? (this.data.config.serverKColor || 'emerald') : (this.data.config.serverCColor || 'purple');
            const cardClass = `border-${sCol}-500/50`;
            const badgeClass = `text-${sCol}-300 border-${sCol}-500/30 bg-${sCol}-950/30`;

            return `
            <div class="bg-slate-900 border ${cardClass} rounded-xl overflow-hidden flex flex-col md:flex-row transition-all group shadow-2xl">
                <div class="w-full md:w-48 aspect-square bg-slate-950 flex-shrink-0 relative overflow-hidden border-b md:border-b-0 md:border-r border-slate-800">
                    ${x.classImage ? `<img src="${x.classImage}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">` : `<div class="w-full h-full flex flex-col items-center justify-center text-slate-800 bg-slate-900/50"><i data-lucide="user" class="w-16 h-16"></i></div>`}
                    <div class="absolute bottom-2 left-2"><span class="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter ${app.getRoleStyle(x.role)}">${x.role}</span></div>
                </div>
                <div class="flex-1 p-4 flex flex-col gap-3 min-w-0">
                    <div class="flex justify-between items-start gap-2">
                        <div class="min-w-0"><h3 class="text-base font-bold text-white truncate leading-tight">${x.name}</h3><p class="text-[11px] text-indigo-400 font-medium truncate mt-0.5">${x.job} ${x.level ? `Lv.${x.level}` : ''}</p></div>
                    </div>
                    <div class="grid grid-cols-3 gap-1.5">
                        <div class="bg-indigo-900/10 border border-indigo-500/20 p-1.5 rounded flex flex-col items-center"><span class="text-[8px] text-indigo-400 uppercase font-bold tracking-tighter">Daily</span><span class="text-xs font-bold text-slate-200">${counts.daily}</span></div>
                        <div class="bg-emerald-900/10 border border-emerald-500/20 p-1.5 rounded flex flex-col items-center"><span class="text-[8px] text-emerald-400 uppercase font-bold tracking-tighter">Weekly</span><span class="text-xs font-bold text-slate-200">${counts.weekly}</span></div>
                        <div class="bg-cyan-900/10 border border-cyan-500/20 p-1.5 rounded flex flex-col items-center"><span class="text-[8px] text-cyan-400 uppercase font-bold tracking-tighter">Boss D</span><span class="text-xs font-bold text-slate-200">${counts.bossD}</span></div>
                        <div class="bg-purple-900/10 border border-purple-500/20 p-1.5 rounded flex flex-col items-center"><span class="text-[8px] text-purple-400 uppercase font-bold tracking-tighter">Boss W</span><span class="text-xs font-bold text-slate-200">${counts.bossW}</span></div>
                        <div class="bg-yellow-900/10 border border-yellow-500/20 p-1.5 rounded flex flex-col items-center"><span class="text-[8px] text-yellow-400 uppercase font-bold tracking-tighter">Boss M</span><span class="text-xs font-bold text-slate-200">${counts.bossM}</span></div>
                    </div>
                    <div class="flex justify-end gap-2 mt-auto pt-2 border-t border-slate-800/50">
                        <button onclick="app.openCharModal('${x.id}')" class="flex-1 py-1.5 text-[10px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-indigo-600 rounded transition-colors flex items-center justify-center gap-1.5"><i data-lucide="settings" class="w-3 h-3"></i> Configure</button>
                        <button onclick="app.deleteCharacter('${x.id}')" class="px-2 py-1.5 bg-slate-800 hover:bg-rose-600 rounded text-slate-500 hover:text-white transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();
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
    openCharModal(cid = null) {
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
        this.switchCharTab('daily');
        this.currentBossFilter = 'ALL';
        this.activeCharId = cid;

        if (cid) {
            const c = this.data.characters.find(x => x.id === cid);
            this.tempBossIds = new Set(c.settings?.boss_ids || []);
            this.tempPartySizes = { ...(c.settings?.boss_party_sizes || {}) };

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

            const hiddenCheck = f.querySelector('input[name="hidden"]');
            if (hiddenCheck) hiddenCheck.checked = !!c.hidden;
        } else {
            this.tempBossIds = new Set();
            this.tempPartySizes = {};
            document.getElementById('modal-title').innerText = 'Add Character';
            f.id.value = "";
            f.name.value = "";
            f.level.value = "";
            f.job.value = "";
            f.image.value = "";

            // Reset Job Select
            const jobSel = document.getElementById('char-job-select');
            if (jobSel) jobSel.value = "";

            // Reset Hidden Check
            const hiddenCheck = f.querySelector('input[name="hidden"]');
            if (hiddenCheck) hiddenCheck.checked = false;

            // Default Server Selection
            const targetServer = this.data.config.activeServer === 'ALL' ? 'KRONOS' : this.data.config.activeServer;
            const radio = f.querySelector(`input[name="server"][value="${targetServer}"]`);
            if (radio) radio.checked = true;
        }

        this.renderModalLists(cid);
        this.renderBossListFiltered();
    },
    updateTempBoss(id, checked) { if (checked) this.tempBossIds.add(id); else this.tempBossIds.delete(id); this.renderBossListFiltered(); },
    updateTempParty(id, val) { const size = parseInt(val); if (size > 1) this.tempPartySizes[id] = size; else delete this.tempPartySizes[id]; },
    renderModalLists(cid) {
        const c = cid ? this.data.characters.find(x => x.id === cid) : null;
        const settings = c?.settings || { daily_ids: [], weekly_ids: [], boss_ids: [] };
        const rc = (id, l, chk, nm) => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = (l || []).map(i => `<label class="flex items-center gap-2 text-slate-300 text-xs cursor-pointer hover:bg-slate-800 p-2 rounded border border-slate-700/50"><input type="checkbox" name="${nm}" value="${i.id}" class="accent-indigo-500 w-4 h-4" ${(chk || []).includes(i.id) ? 'checked' : ''}><div class="flex-1 overflow-hidden"><div class="truncate text-xs font-medium text-slate-200"><span class="text-slate-500 mr-2 text-[10px]">[${i.type || (i.isEvent ? 'EVENT' : 'OTHER')}]</span>${i.name}</div></div></label>`).join('');
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
    switchCharTab(t) { ['daily', 'weekly', 'boss'].forEach(x => { const b = document.getElementById(`char-tab-btn-${x}`), c = document.getElementById(`char-content-${x}`); if (b && c) { if (x === t) { b.classList.add('tab-active'); b.classList.remove('tab-inactive'); c.classList.remove('hidden'); } else { b.classList.remove('tab-active'); b.classList.add('tab-inactive'); c.classList.add('hidden'); } } }); if (t === 'boss') { if (document.getElementById('char-boss-filters')) document.getElementById('char-boss-filters').classList.remove('hidden'); } else { if (document.getElementById('char-boss-filters')) document.getElementById('char-boss-filters').classList.add('hidden'); } },
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
                const apiUrl = `/api?name=${encodeURIComponent(c.name)}`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                const res = await fetch(apiUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data.ranks && data.ranks.length > 0) {
                        const info = data.ranks.find(r => r.characterName.toLowerCase() === c.name.toLowerCase()) || data.ranks[0];
                        c.level = info.level;
                        if (info.characterImgURL) c.image = info.characterImgURL;
                        // c.job = info.jobName; // Optional: update job name if changed? Risk of breaking ID mapping if name format differs.
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

        const nd = {
            id: id,
            name: f.name.value,
            job: f.job.value,
            classImage: classImgPath, // Helper for main image
            role: f.role.value,
            image: f.image.value, // This is now reserved for API fetched image (or custom URL if user enters One)
            level: f.level.value,
            memo: f.memo.value,
            hidden: f.querySelector('input[name="hidden"]')?.checked || false,
            server: f.querySelector('input[name="server"]:checked')?.value || 'KRONOS',
            settings: { daily_ids: Array.from(f.querySelectorAll('input[name="chk_daily"]:checked')).map(c => c.value), weekly_ids: Array.from(f.querySelectorAll('input[name="chk_weekly"]:checked')).map(c => c.value), boss_ids: Array.from(this.tempBossIds), boss_party_sizes: { ...this.tempPartySizes } },
            progress: { daily: pc?.progress?.daily || [], weekly: pc?.progress?.weekly || [], boss: pc?.progress?.boss || [] }
        };
        const idx = this.data.characters.findIndex(x => x.id === id);
        if (idx >= 0) this.data.characters[idx] = nd; else this.data.characters.push(nd);
        this.saveData(); this.closeCharModal(); this.renderCharacters(); this.renderDashboard();
    },
    deleteCharacter(id) { if (confirm('Delete?')) { this.data.characters = this.data.characters.filter(x => x.id !== id); this.saveData(); this.renderCharacters(); this.renderDashboard(); } },
    resetAllData() { if (confirm('Factory Reset?')) { localStorage.removeItem('gms_v24_data'); location.reload(); } }
};
window.onload = () => app.init();