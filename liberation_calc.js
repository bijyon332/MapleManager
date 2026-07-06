// Shared engine for weapon liberation / growth date-projection calculators
// (Genesis Weapon, Destiny Weapon, Astra Secondary Weapon all share the same
// "accumulate currency from weekly boss clears until a cumulative stage
// threshold is reached" mechanic - only the stage/boss tables differ).
const DIFF_LABELS = { easy: 'イージー', normal: 'ノーマル', chaos: 'カオス', hard: 'ハード', extreme: 'エクストリーム' };

function createLiberationCalc(cfg) {
    return {
        cfg,
        state: null,
        root: null,

        defaultState() {
            const s = {
                startDate: new Date().toISOString().slice(0, 10),
                currentStageId: cfg.stages[0].id,
                holdings: 0,
                passActive: !!cfg.passDefaultActive,
                passEndDate: cfg.passDefaultEndDate || '',
                areaId: cfg.secondaryCurrency ? cfg.secondaryCurrency.dailySources[cfg.secondaryCurrency.dailySources.length - 1].id : null,
                schedule: {}
            };
            cfg.bosses.forEach(b => { s.schedule[b.id] = { difficulty: '', party: 1, breakingThisWeek: false }; });
            return s;
        },

        load() {
            const def = this.defaultState();
            const raw = localStorage.getItem(cfg.storageKey);
            if (!raw) return def;
            try {
                const parsed = JSON.parse(raw);
                return { ...def, ...parsed, schedule: { ...def.schedule, ...(parsed.schedule || {}) } };
            } catch {
                return def;
            }
        },

        save() {
            localStorage.setItem(this.cfg.storageKey, JSON.stringify(this.state));
        },

        init(rootId) {
            this.root = document.getElementById(rootId);
            this.state = this.load();
            this.root.innerHTML = this.buildHTML();
            this.bindEvents();
            this.recalc();
        },

        buildHTML() {
            const c = this.cfg;
            const stageOpts = c.stages.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
            const passRow = c.hasPass ? `
                <div class="lc-field">
                    <label class="lc-check"><input type="checkbox" id="lc-pass-active"><span>${c.passLabel}を適用</span></label>
                    <input type="date" id="lc-pass-end" class="lc-input" title="${c.passLabel}適用期限">
                </div>` : '';
            const areaRow = c.secondaryCurrency ? `
                <div class="lc-field">
                    <label>デイリークエスト地域</label>
                    <select id="lc-area" class="lc-input">
                        ${c.secondaryCurrency.dailySources.map(a => `<option value="${a.id}">${a.label} (${c.secondaryCurrency.label} ${a.rate}個/日)</option>`).join('')}
                    </select>
                </div>` : '';

            const bossRows = c.bosses.map(b => {
                const diffOpts = Object.keys(b.rates).map(d => `<option value="${d}">${DIFF_LABELS[d] || d}</option>`).join('');
                return `
                <tr data-boss="${b.id}">
                    <td class="lc-boss-name">${b.label}${b.monthly ? '<span class="lc-monthly-tag">月間</span>' : ''}</td>
                    <td>
                        <select class="lc-diff-sel" data-boss="${b.id}">
                            <option value="">討伐しない</option>
                            ${diffOpts}
                        </select>
                    </td>
                    <td>
                        <input type="number" class="lc-party-inp" data-boss="${b.id}" min="1" max="${b.partyMax}" value="1">
                    </td>
                    <td class="lc-center">
                        <input type="checkbox" class="lc-cleared-chk" data-boss="${b.id}">
                    </td>
                    <td class="lc-num lc-gain-cell" data-boss="${b.id}">0</td>
                </tr>`;
            }).join('');

            return `
            <style>
                .lc-wrapper { max-width: 720px; margin: 0 auto; }
                .lc-header { text-align: center; margin-bottom: 20px; }
                .lc-header h1 {
                    font-family: 'Orbitron', sans-serif; font-size: clamp(15px, 3vw, 22px);
                    font-weight: 900; letter-spacing: 0.05em;
                    background: linear-gradient(120deg, #5b9cf6 0%, #9d6bf0 50%, #f5a623 100%);
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
                }
                .lc-header p { color: #8892aa; font-size: 11px; margin-top: 6px; }
                .lc-card { background: #111522; border: 1px solid #1e2a45; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
                .lc-sec-label {
                    font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
                    color: #5b9cf6; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
                }
                .lc-sec-label::after { content: ''; flex: 1; height: 1px; background: #1e2a45; }
                .lc-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px 14px; }
                .lc-field { display: flex; flex-direction: column; gap: 4px; }
                .lc-field label { font-size: 10px; color: #8892aa; font-weight: 600; }
                .lc-input, select.lc-input {
                    background: #161c2e; border: 1px solid #1e2a45; border-radius: 6px; color: #e8eaf0;
                    font-size: 12px; padding: 6px 8px; outline: none; font-family: inherit;
                }
                .lc-input:focus { border-color: #3a7bd5; }
                .lc-input option, .lc-diff-sel option {
                    background: #161c2e; color: #e8eaf0;
                }
                .lc-input::-webkit-calendar-picker-indicator { filter: invert(0.8); }
                .lc-diff-sel, .lc-party-inp {
                    background: #161c2e; border: 1px solid #1e2a45; border-radius: 6px; color: #e8eaf0;
                    font-size: 11px; padding: 4px 6px; outline: none; font-family: inherit;
                }
                .lc-diff-sel:focus, .lc-party-inp:focus { border-color: #3a7bd5; }
                .lc-diff-sel:disabled, .lc-party-inp:disabled { opacity: 0.5; }
                .lc-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #e8eaf0; cursor: pointer; margin-bottom: 4px; }
                .lc-table { width: 100%; border-collapse: collapse; font-size: 11px; }
                .lc-table th {
                    background: #161c2e; color: #8892aa; font-weight: 700; font-size: 9px; letter-spacing: 0.04em;
                    padding: 6px 8px; text-align: left; border-bottom: 1px solid #1e2a45; white-space: nowrap;
                }
                .lc-table td { padding: 5px 8px; border-bottom: 1px solid rgba(30,42,69,0.5); vertical-align: middle; }
                .lc-boss-name { font-weight: 700; color: #f5a623; white-space: nowrap; }
                .lc-monthly-tag { margin-left: 5px; font-size: 8px; background: #3a2d5c; color: #c9a8ff; padding: 1px 5px; border-radius: 4px; }
                .lc-diff-sel { width: 100%; min-width: 90px; }
                .lc-party-inp { width: 44px; text-align: center; }
                .lc-center { text-align: center; }
                .lc-num { text-align: right; font-weight: 700; color: #f5a623; font-variant-numeric: tabular-nums; }
                .lc-result-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 12px; align-items: center; }
                .lc-result-label { color: #8892aa; font-size: 11px; }
                .lc-result-val { font-weight: 700; color: #e8eaf0; }
                .lc-result-val.big { font-size: 16px; color: #5b9cf6; }
                .lc-note { font-size: 10px; color: #8892aa; margin-top: 8px; line-height: 1.5; }
                .lc-tier-list { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 11px; }
                .lc-tier-list .row { display: flex; justify-content: space-between; border-bottom: 1px dashed #1e2a45; padding: 3px 0; }
            </style>
            <div class="lc-wrapper">
                <div class="lc-header">
                    <h1>${c.titleJa}</h1>
                    <p>${c.subtitleJa}</p>
                </div>
                <div class="lc-card">
                    <div class="lc-sec-label">計算設定</div>
                    <div class="lc-settings-grid">
                        <div class="lc-field">
                            <label>計算開始日</label>
                            <input type="date" id="lc-start-date" class="lc-input">
                        </div>
                        <div class="lc-field">
                            <label>現在の進行ボス</label>
                            <select id="lc-stage" class="lc-input">${stageOpts}</select>
                        </div>
                        <div class="lc-field">
                            <label>保有${c.currencyLabel} (最大 ${c.maxHold.toLocaleString()})</label>
                            <input type="number" id="lc-holdings" class="lc-input" min="0" max="${c.maxHold}" value="0">
                        </div>
                        ${areaRow}
                        ${passRow}
                    </div>
                </div>
                <div class="lc-card">
                    <div class="lc-sec-label">ボススケジュール</div>
                    <div style="overflow-x:auto">
                        <table class="lc-table">
                            <thead><tr>
                                <th>ボス</th><th>難易度</th><th>人数</th><th>今週<br>討伐済</th><th>週間獲得量</th>
                            </tr></thead>
                            <tbody>${bossRows}</tbody>
                        </table>
                    </div>
                </div>
                <div class="lc-card">
                    <div class="lc-sec-label">結果</div>
                    <div class="lc-result-grid">
                        <div class="lc-result-label">獲得量</div>
                        <div class="lc-result-val" id="lc-out-gain">-</div>
                        <div class="lc-result-label">必要${c.currencyLabel}</div>
                        <div class="lc-result-val" id="lc-out-need">-</div>
                        <div class="lc-result-label">完了予定日</div>
                        <div class="lc-result-val big" id="lc-out-date">-</div>
                        <div class="lc-result-label">残り期間</div>
                        <div class="lc-result-val" id="lc-out-remain">-</div>
                    </div>
                    <div id="lc-tier-block"></div>
                    <div class="lc-note" id="lc-note"></div>
                </div>
            </div>`;
        },

        bindEvents() {
            const self = this;
            const startEl = this.root.querySelector('#lc-start-date');
            startEl.value = this.state.startDate;
            startEl.addEventListener('change', () => { self.state.startDate = startEl.value; self.save(); self.recalc(); });

            const stageEl = this.root.querySelector('#lc-stage');
            stageEl.value = this.state.currentStageId;
            stageEl.addEventListener('change', () => { self.state.currentStageId = stageEl.value; self.save(); self.recalc(); });

            const holdEl = this.root.querySelector('#lc-holdings');
            holdEl.value = this.state.holdings;
            holdEl.addEventListener('input', () => {
                self.state.holdings = Math.max(0, Math.min(Number(holdEl.value) || 0, self.cfg.maxHold));
                self.save(); self.recalc();
            });

            if (this.cfg.secondaryCurrency) {
                const areaEl = this.root.querySelector('#lc-area');
                areaEl.value = this.state.areaId;
                areaEl.addEventListener('change', () => { self.state.areaId = areaEl.value; self.save(); self.recalc(); });
            }

            if (this.cfg.hasPass) {
                const passChk = this.root.querySelector('#lc-pass-active');
                const passEnd = this.root.querySelector('#lc-pass-end');
                passChk.checked = this.state.passActive;
                passEnd.value = this.state.passEndDate;
                passChk.addEventListener('change', () => { self.state.passActive = passChk.checked; self.save(); self.recalc(); });
                passEnd.addEventListener('change', () => { self.state.passEndDate = passEnd.value; self.save(); self.recalc(); });
            }

            this.cfg.bosses.forEach(b => {
                const sch = this.state.schedule[b.id];
                const diffSel = this.root.querySelector(`.lc-diff-sel[data-boss="${b.id}"]`);
                const partyInp = this.root.querySelector(`.lc-party-inp[data-boss="${b.id}"]`);
                const chk = this.root.querySelector(`.lc-cleared-chk[data-boss="${b.id}"]`);
                diffSel.value = sch.difficulty || '';
                partyInp.value = sch.party || 1;
                partyInp.max = b.partyMax;
                chk.checked = !!sch.breakingThisWeek;

                diffSel.addEventListener('change', () => {
                    sch.difficulty = diffSel.value;
                    self.save(); self.recalc();
                });
                partyInp.addEventListener('input', () => {
                    sch.party = Math.max(1, Math.min(Number(partyInp.value) || 1, b.partyMax));
                    self.save(); self.recalc();
                });
                chk.addEventListener('change', () => {
                    sch.breakingThisWeek = chk.checked;
                    self.save(); self.recalc();
                });
            });
        },

        // Remaining currency needed to complete every stage from the
        // currently-selected stage through the end of the chain.
        stageNeedFrom(stageId) {
            let total = 0, found = false;
            for (const st of this.cfg.stages) {
                if (st.id === stageId) found = true;
                if (found) total += st.need;
            }
            return total;
        },

        simulate() {
            const c = this.cfg;
            const s = this.state;
            const passMultInit = (c.hasPass && s.passActive) ? c.passMultiplier : 1;

            let weekTotal = 0, monthTotal = 0;
            const perBoss = {};
            c.bosses.forEach(b => {
                const sch = s.schedule[b.id];
                const rate = (sch.difficulty && sch.party) ? Math.floor((b.rates[sch.difficulty] || 0) / sch.party) : 0;
                perBoss[b.id] = rate;
                if (b.monthly) monthTotal += rate; else weekTotal += rate;
            });

            let remain = Math.max(0, this.stageNeedFrom(s.currentStageId) - s.holdings);
            const startDate = new Date(s.startDate + 'T00:00:00');

            if (remain <= 0 || (weekTotal === 0 && monthTotal === 0)) {
                return { weekTotal, monthTotal, remain, days: 0, endDate: new Date(startDate) };
            }

            // Credit this week's/month's clears once immediately for bosses not
            // yet marked as "already cleared this week" (mirrors reference site).
            let d = remain;
            c.bosses.forEach(b => {
                const sch = s.schedule[b.id];
                const rate = perBoss[b.id];
                if (rate && !sch.breakingThisWeek) d -= rate * passMultInit;
            });

            if (d <= 0) return { weekTotal, monthTotal, remain, days: 0, endDate: new Date(startDate) };

            let mult = passMultInit;
            const passEnd = (c.hasPass && s.passEndDate) ? new Date(s.passEndDate + 'T00:00:00') : null;
            const date = new Date(startDate);
            date.setDate(date.getDate() + 1);
            let days = 1;

            while (true) {
                if (weekTotal && date.getDay() === 4) d -= weekTotal * mult;
                if (monthTotal && date.getDate() === 1) d -= monthTotal * mult;
                if (d <= 0 || days > 50000) break;
                date.setDate(date.getDate() + 1);
                if (passEnd && date.getTime() > passEnd.getTime()) mult = 1;
                days++;
            }

            return { weekTotal, monthTotal, remain, days, endDate: date };
        },

        recalc() {
            this.cfg.bosses.forEach(b => {
                const sch = this.state.schedule[b.id];
                const rate = (sch.difficulty && sch.party) ? Math.floor((b.rates[sch.difficulty] || 0) / sch.party) : 0;
                const cell = this.root.querySelector(`.lc-gain-cell[data-boss="${b.id}"]`);
                if (cell) cell.textContent = rate.toLocaleString();
            });

            const r = this.simulate();
            const gainEl = this.root.querySelector('#lc-out-gain');
            const needEl = this.root.querySelector('#lc-out-need');
            const dateEl = this.root.querySelector('#lc-out-date');
            const remainEl = this.root.querySelector('#lc-out-remain');

            let gainTxt = `週間 ${(r.weekTotal || 0).toLocaleString()}`;
            if (r.monthTotal) gainTxt += ` + 月間 ${r.monthTotal.toLocaleString()}`;
            gainEl.textContent = gainTxt;
            needEl.textContent = r.remain.toLocaleString();

            if (r.remain <= 0) {
                dateEl.textContent = '達成済み';
                remainEl.textContent = '-';
            } else if (r.weekTotal === 0 && r.monthTotal === 0) {
                dateEl.textContent = 'ボススケジュールを入力してください';
                remainEl.textContent = '-';
            } else {
                const fmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
                dateEl.textContent = fmt.format(r.endDate);
                const weeks = Math.floor(r.days / 7);
                const restDays = r.days % 7;
                remainEl.textContent = `${r.days.toLocaleString()}日 (${weeks}週${restDays ? restDays + '日' : ''})`;
            }

            if (this.cfg.hasPass) {
                const note = this.root.querySelector('#lc-note');
                note.textContent = this.state.passActive && this.state.passEndDate
                    ? `※${this.cfg.passLabel}は ${this.state.passEndDate} まで適用されます(${this.cfg.passMultiplier}倍)。期限を過ぎた週は通常獲得量で計算されます。`
                    : `※${this.cfg.passLabel}を有効にすると獲得量が${this.cfg.passMultiplier}倍になります。`;
            }

            if (this.cfg.secondaryCurrency) this.recalcSecondary(r);
        },

        recalcSecondary(r) {
            const sc = this.cfg.secondaryCurrency;
            const src = sc.dailySources.find(a => a.id === this.state.areaId) || sc.dailySources[sc.dailySources.length - 1];
            const stageIdx = this.cfg.stages.findIndex(st => st.id === this.state.currentStageId);
            const remainingFragmentNeed = sc.perStageFragmentNeed.slice(Math.max(0, stageIdx)).reduce((a, b) => a + b, 0);
            const fragmentsByDone = Math.max(0, remainingFragmentNeed - r.days * src.rate);

            const block = this.root.querySelector('#lc-tier-block');
            block.innerHTML = `
                <div class="lc-tier-list">
                    <div class="row"><span>1日あたりの${sc.label}獲得量</span><span>${src.rate.toLocaleString()}個 (${src.label})</span></div>
                    <div class="row"><span>完了までに必要な${sc.label}</span><span>${remainingFragmentNeed.toLocaleString()}個</span></div>
                    <div class="row"><span>${r.remain > 0 ? '完了予定日時点での不足見込み' : '不足'}</span><span>${fragmentsByDone > 0 ? fragmentsByDone.toLocaleString() + '個 不足' : '不足なし'}</span></div>
                </div>`;
        }
    };
}
