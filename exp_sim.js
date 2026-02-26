// =============================================
// MapleEXP Simulator - Logic (integrated into MapleManager)
// =============================================

const expSim = {
    potionRowCount: 0,
    monpaEventCount: 0,

    init() {
        const startDateEl = document.getElementById('exp-startDate');
        if (startDateEl) startDateEl.value = new Date().toISOString().slice(0, 10);
        this.renderRegionCheckboxes();
        this.bindEvents();
    },

    renderRegionCheckboxes() {
        const container = document.getElementById('exp-regionCheckboxes');
        if (!container) return;
        container.innerHTML = '';
        const grp1 = expRegionData.filter(r => r.lv >= 200 && r.lv <= 235 && r.daily !== 0);
        const grp2 = expRegionData.filter(r => r.lv >= 245 && r.lv <= 255 && r.daily !== 0);
        const grp3 = expRegionData.filter(r => r.lv >= 260 && r.daily !== 0);

        const renderGroup = (regions) => {
            const grid = document.createElement('div');
            grid.className = 'exp-cb-grid';
            regions.forEach(r => {
                const lbl = document.createElement('label');
                lbl.className = 'exp-cb-item';
                lbl.innerHTML = `<input type="checkbox" id="exp-${r.id}" checked><span>${r.name}</span><span class="exp-lv-tag">${r.lv}+</span>`;
                grid.appendChild(lbl);
            });
            container.appendChild(grid);
        };

        renderGroup(grp1);
        const d1 = document.createElement('div'); d1.className = 'exp-cb-divider'; container.appendChild(d1);
        renderGroup(grp2);
        const d2 = document.createElement('div'); d2.className = 'exp-cb-divider'; container.appendChild(d2);
        renderGroup(grp3);
    },

    bindEvents() {
        const searchBtn = document.getElementById('exp-charSearchBtn');
        if (searchBtn) searchBtn.addEventListener('click', () => this.fetchCharacter());

        const nameInput = document.getElementById('exp-charNameInput');
        if (nameInput) nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') this.fetchCharacter(); });

        const addMonpaBtn = document.getElementById('exp-addMonpaEventBtn');
        if (addMonpaBtn) addMonpaBtn.addEventListener('click', () => this.addMonpaEventRow());

        const addPotionBtn = document.getElementById('exp-addPotionBtn');
        if (addPotionBtn) addPotionBtn.addEventListener('click', () => this.addPotionRow());

        const runBtn = document.getElementById('exp-runBtn');
        if (runBtn) runBtn.addEventListener('click', () => this.calculate());

        // Section toggles
        document.querySelectorAll('#view-exp-sim .exp-section-head').forEach(head => {
            head.addEventListener('click', () => {
                const body = head.nextElementSibling;
                const icon = head.querySelector('.exp-section-toggle');
                body.classList.toggle('hidden');
                if (icon) icon.classList.toggle('open');
            });
        });
    },

    addPotionRow(typeId = 'p249', qty = 1, deadline = '') {
        const rowId = ++this.potionRowCount;
        const rowOpts = EXP_POTION_TYPES.map(p =>
            `<option value="${p.id}"${p.id === typeId ? ' selected' : ''}>${p.name}</option>`).join('');
        const rowEl = document.createElement('div');
        rowEl.className = 'exp-potion-row';
        rowEl.id = `exp-potion-${rowId}`;
        rowEl.innerHTML = `
        <select id="exp-pt-type-${rowId}">${rowOpts}</select>
        <input type="number" id="exp-pt-qty-${rowId}" value="${qty}" min="1" max="99">
        <input type="date" id="exp-pt-dead-${rowId}" value="${deadline}">
        <button class="exp-del-btn" onclick="document.getElementById('exp-potion-${rowId}').remove()">
            <i data-lucide="x" class="w-3 h-3"></i>
        </button>`;
        document.getElementById('exp-potionRows').appendChild(rowEl);
        lucide.createIcons();
    },

    getPotions() {
        return [...document.querySelectorAll('#exp-potionRows .exp-potion-row')].map(rowEl => {
            const rowId = rowEl.id.replace('exp-potion-', '');
            const typeId = document.getElementById(`exp-pt-type-${rowId}`).value;
            const qty = parseInt(document.getElementById(`exp-pt-qty-${rowId}`).value) || 0;
            const dl = document.getElementById(`exp-pt-dead-${rowId}`).value;
            const ptype = EXP_POTION_TYPES.find(p => p.id === typeId);
            return (qty > 0 && ptype) ? { capLv: ptype.capLv, qty, deadline: dl } : null;
        }).filter(Boolean);
    },

    addMonpaEventRow(dateVal = '') {
        const evId = ++this.monpaEventCount;
        const evEl = document.createElement('div');
        evEl.className = 'exp-event-row';
        evEl.id = `exp-mev-${evId}`;
        evEl.innerHTML = `
        <input type="date" id="exp-mev-date-${evId}" value="${dateVal}">
        <button class="exp-del-btn" onclick="document.getElementById('exp-mev-${evId}').remove()">
            <i data-lucide="x" class="w-3 h-3"></i>
        </button>`;
        document.getElementById('exp-monpaEventRows').appendChild(evEl);
        lucide.createIcons();
    },

    getMonpaEventDates() {
        return [...document.querySelectorAll('#exp-monpaEventRows .exp-event-row')].map(evEl => {
            const evId = evEl.id.replace('exp-mev-', '');
            const evVal = document.getElementById(`exp-mev-date-${evId}`).value;
            if (!evVal) return null;
            const evDate = new Date(evVal);
            evDate.setHours(0, 0, 0, 0);
            return evDate;
        }).filter(Boolean);
    },

    async fetchCharacter() {
        const nameInput = document.getElementById('exp-charNameInput');
        const searchBtn = document.getElementById('exp-charSearchBtn');
        const previewEl = document.getElementById('exp-charPreview');
        const errEl = document.getElementById('exp-charError');
        const charName = nameInput.value.trim();
        if (!charName) return;

        searchBtn.disabled = true;
        searchBtn.innerHTML = `<svg class="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Searching`;
        previewEl.classList.add('hidden');
        errEl.classList.add('hidden');

        const apiUrl = `https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=overall&id=weekly&reboot_index=0&page_index=1&character_name=${encodeURIComponent(charName)}`;
        const endpoints = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
            `https://corsproxy.io/?url=${encodeURIComponent(apiUrl)}`
        ];

        let resData = null, lastErr = null;
        for (const url of endpoints) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 10000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(tid);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                resData = await res.json();
                break;
            } catch (e) { lastErr = e; }
        }

        try {
            if (!resData) throw lastErr;
            if (!resData.ranks || resData.ranks.length === 0) throw new Error(`"${charName}" was not found`);
            const c = resData.ranks[0];
            const charTnl = tnlData[c.level] || 1;
            const charPct = ((c.exp / charTnl) * 100).toFixed(4);

            document.getElementById('exp-startLv').value = c.level;
            document.getElementById('exp-startPct').value = charPct;
            document.getElementById('exp-charAvatar').src = c.characterImgURL || '';
            document.getElementById('exp-charName').textContent = c.characterName;
            document.getElementById('exp-charJob').textContent = `${c.jobName}  |  Lv.${c.level}  |  Rank #${c.rank.toLocaleString()}`;
            document.getElementById('exp-charExpTxt').textContent = `EXP: ${c.exp.toLocaleString()} / ${charTnl.toLocaleString()}  (${charPct}%)`;
            previewEl.classList.remove('hidden');
        } catch (e) {
            errEl.textContent = `⚠ ${e instanceof TypeError ? 'Network error' : (e.message || 'Unknown error')}`;
            errEl.classList.remove('hidden');
        } finally {
            searchBtn.disabled = false;
            searchBtn.innerHTML = `<i data-lucide="search" class="w-3 h-3"></i>Search`;
            lucide.createIcons();
        }
    },

    addExp(expGain, curLv, curExp, goalLv) {
        curExp += expGain;
        while (curLv < goalLv && tnlData[curLv] && curExp >= tnlData[curLv]) {
            curExp -= tnlData[curLv]; curLv++;
        }
        return [curLv, curExp];
    },

    calculate() {
        let curLv = parseInt(document.getElementById('exp-startLv').value);
        let curExp = (tnlData[curLv] || 0) * (parseFloat(document.getElementById('exp-startPct').value) / 100);
        const goalLv = parseInt(document.getElementById('exp-targetLv').value);
        const monpaRunsVal = parseInt(document.getElementById('exp-monpaRuns').value);
        const farmRunsWeekly = parseInt(document.getElementById('exp-farmRuns').value);
        const dailyMultVal = parseFloat(document.getElementById('exp-dailyMult').value);
        const monpaBaseMultVal = parseFloat(document.getElementById('exp-monpaMult').value);
        const monpaEventDates = this.getMonpaEventDates();

        const startD = new Date(document.getElementById('exp-startDate').value);
        startD.setHours(0, 0, 0, 0);
        const endDateVal = document.getElementById('exp-endDate').value;
        const endD = endDateVal ? (() => { const d = new Date(endDateVal); d.setHours(0, 0, 0, 0); return d; })() : null;
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        const potions = this.getPotions().map(p => ({
            capLv: p.capLv, qty: p.qty,
            deadline: p.deadline ? (() => { const d = new Date(p.deadline); d.setHours(0, 0, 0, 0); return d; })() : null
        }));

        const self = this;
        function usePotions(loopDate) {
            const lbls = [];
            for (const pot of potions) {
                if (pot.qty <= 0) continue;
                const deadlineHit = pot.deadline && loopDate >= pot.deadline;
                const optimalHit = curLv >= pot.capLv;
                if (!deadlineHit && !optimalHit) continue;
                const useQty = pot.qty; pot.qty = 0;
                for (let qi = 0; qi < useQty; qi++) {
                    const potExp = tnlData[Math.min(curLv, pot.capLv)] || 0;
                    [curLv, curExp] = self.addExp(potExp, curLv, curExp, goalLv);
                }
                lbls.push(deadlineHit ? `Potion×${useQty}(expired)` : `Potion×${useQty}`);
            }
            return lbls;
        }

        let loopDays = 0, log = [], farmUsedThisWeek = false;
        let endDateLv = null, endDatePct = null, goalReachedDay = null;

        while (true) {
            const loopDate = new Date(startD);
            loopDate.setDate(startD.getDate() + loopDays);
            loopDate.setHours(0, 0, 0, 0);

            const goalReached = curLv >= goalLv;
            const endPassed = endD && loopDate > endD;
            if (goalReached && (!endD || endPassed)) break;
            if (loopDays > 3650) break;
            if (!tnlData[curLv] && curLv >= goalLv) break;

            const dayIdx = loopDate.getDay();
            const isSun = dayIdx === 0;
            const isThu = dayIdx === 4;
            if (isThu) farmUsedThisWeek = false;

            const lvBefore = curLv;

            // Farm
            if (!farmUsedThisWeek) {
                for (let fi = 0; fi < farmRunsWeekly; fi++) {
                    let mobsLeft = 1000;
                    while (mobsLeft > 0 && curLv < goalLv && tnlData[curLv]) {
                        const epm = farmTable[curLv] || 0;
                        if (!epm) break;
                        const toNext = tnlData[curLv] - curExp;
                        const mobs2lv = Math.ceil(toNext / epm);
                        if (mobs2lv <= mobsLeft) { curExp = 0; curLv++; mobsLeft -= mobs2lv; }
                        else { curExp += epm * mobsLeft; mobsLeft = 0; }
                    }
                }
                farmUsedThisWeek = true;
            }

            // Daily Quests
            expRegionData.forEach(reg => {
                if (reg.daily === 0) return;
                const cbEl = document.getElementById(`exp-${reg.id}`);
                if (!cbEl || !cbEl.checked || reg.lv > curLv) return;
                [curLv, curExp] = self.addExp(reg.daily * dailyMultVal, curLv, curExp, goalLv);
            });

            // Monster Park
            const isEventDay = monpaEventDates.some(evD => evD.getTime() === loopDate.getTime());
            const monpaEffMult = monpaBaseMultVal + (isSun ? 0.5 : 0) + (isEventDay ? 2.5 : 0);
            for (let mi = 0; mi < monpaRunsVal; mi++) {
                const availRegions = expRegionData.filter(reg => reg.lv <= curLv && reg.monpa > 0);
                const monpaBase = availRegions.length ? availRegions[availRegions.length - 1].monpa : 0;
                if (!monpaBase) break;
                [curLv, curExp] = self.addExp(monpaBase * monpaEffMult, curLv, curExp, goalLv);
            }

            // Potions
            const potionLabels = usePotions(loopDate);
            const lvUp = curLv > lvBefore;
            const hasPot = potionLabels.length > 0;

            if (endD && !endDateLv && loopDate >= endD) {
                endDateLv = curLv;
                endDatePct = (curExp / (tnlData[curLv] || 1) * 100).toFixed(2);
            }
            if (goalReachedDay === null && curLv >= goalLv) goalReachedDay = loopDays;

            if (lvUp || hasPot || isEventDay || curLv >= goalLv) {
                log.push({
                    date: `${loopDate.getMonth() + 1}/${loopDate.getDate()}(${dayNames[dayIdx]})`,
                    isSun, isThu, isEventDay, days: loopDays, lv: curLv,
                    pct: (curExp / (tnlData[curLv] || 1) * 100).toFixed(2),
                    lvUp, potionLabels
                });
            }
            loopDays++;
        }

        const totalDays = goalReachedDay !== null ? goalReachedDay : loopDays - 1;
        const finishDate = new Date(startD);
        finishDate.setDate(startD.getDate() + totalDays);
        const lvGained = goalLv - parseInt(document.getElementById('exp-startLv').value);
        const lvUps = log.filter(e => e.lvUp).length;
        const fmt = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

        const endCard = endD && endDateLv ? `
        <div class="exp-stat-card">
            <div class="exp-stat-lbl">End Date Lv</div>
            <div class="exp-stat-val text-amber-400">Lv.${endDateLv}</div>
            <div class="exp-stat-sub">${endDatePct}% | ${fmt(endD)}</div>
        </div>` : '';

        const summaryEl = document.getElementById('exp-summaryStrip');
        summaryEl.style.gridTemplateColumns = endCard ? 'repeat(4,1fr)' : 'repeat(3,1fr)';
        summaryEl.innerHTML = `
        <div class="exp-stat-card">
            <div class="exp-stat-lbl">Target Date</div>
            <div class="exp-stat-val text-indigo-400">${fmt(finishDate)}</div>
            <div class="exp-stat-sub">${dayNames[finishDate.getDay()]}</div>
        </div>
        <div class="exp-stat-card">
            <div class="exp-stat-lbl">Days Required</div>
            <div class="exp-stat-val text-slate-200">${totalDays}<span class="text-slate-500 text-xs ml-1">days</span></div>
            <div class="exp-stat-sub">${(totalDays / 7).toFixed(1)} weeks</div>
        </div>
        <div class="exp-stat-card">
            <div class="exp-stat-lbl">Levels Gained</div>
            <div class="exp-stat-val text-emerald-400">+${lvGained}<span class="text-slate-500 text-xs ml-1">lv</span></div>
            <div class="exp-stat-sub">LV UP ${lvUps} times</div>
        </div>
        ${endCard}`;

        document.getElementById('exp-logBody').innerHTML = log.map(e => `
        <tr class="${e.lvUp ? 'exp-is-lvup' : ''}${e.potionLabels.length ? ' exp-is-pot' : ''}">
            <td class="${e.isSun ? 'text-red-400 font-bold' : e.isThu ? 'text-cyan-400 font-bold' : ''}">${e.date}</td>
            <td class="font-mono">${e.days}</td>
            <td class="font-mono">Lv.${e.lv}</td>
            <td>
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1 bg-slate-700 rounded overflow-hidden min-w-[60px]">
                        <div class="h-full rounded bg-gradient-to-r from-indigo-500 to-indigo-400" style="width:${Math.min(parseFloat(e.pct), 100)}%"></div>
                    </div>
                    <span class="font-mono text-xs text-slate-300 min-w-[48px] text-right">${e.pct}%</span>
                </div>
            </td>
        </tr>`).join('');

        document.getElementById('exp-emptyState').classList.add('hidden');
        document.getElementById('exp-resultContent').classList.remove('hidden');
    }
};
