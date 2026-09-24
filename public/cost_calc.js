const costCalc = {
    currentEvent: 'none',
    detailOpen: false,

    SF_COST: {
        140: { 18: 2,  21: 9,  22: 16, 23: 34  },
        150: { 18: 2,  21: 11, 22: 20, 23: 42  },
        160: { 18: 3,  21: 13, 22: 23, 23: 50  },
        200: { 18: 5,  21: 25, 22: 46, 23: 100 },
        250: { 18: 10, 21: 51, 22: 89, 23: 196 },
    },
    EVENT_MULT: {
        none:   { 18: 1,    21: 1,              22: 1,              23: 1              },
        meso30: { 18: 0.9,  21: 0.7843137255,   22: 0.7752808989,   23: 0.7244897959   },
        boom30: { 18: 1,    21: 0.7647058824,   22: 0.7191011236,   23: 0.6785714286   },
        both:   { 18: 0.9,  21: 0.6274509804,   22: 0.5617977528,   23: 0.5408163265   },
    },
    POT_COST: {
        accesory: { "2dup": 0.4, "3dup": 2.3 },
        belt:     { "2dup": 0.4, "3dup": 2.7 },
        head:     { "2dup": 0.6, "3dup": 4.0 },
        body:     { "2dup": 0.6, "3dup": 5.2 },
        leg:      { "2dup": 0.4, "3dup": 3.0 },
        shoe:     { "2dup": 0.5, "3dup": 3.4 },
        cape:     { "2dup": 0.4, "3dup": 2.7 },
        shoulder: { "2dup": 0.4, "3dup": 2.7 },
        heart:    { "2dup": 0.3, "3dup": 1.5 },
        glove:    { "cd1": 0.1,  "cd2": 11   },
        weapon:   { "AA": 1.9,   "AABoss": 10  },
        sub:      { "AA": 2.5,   "AABoss": 17  },
        emblem:   { "AA": 1.5,   "AABoss": 41  },
    },
    EQUIPS: [
        { id:'ring1',    label:'Ring',        potType:'dup', potKey:'accesory' },
        { id:'face',     label:'Face Acc.',      potType:'dup', potKey:'accesory' },
        {ph:true},{ph:true},{ph:true},
        { id:'head',     label:'Helmet',          potType:'dup', potKey:'head' },
        { id:'cape',     label:'Cape',      potType:'dup', potKey:'cape' },
        {ph:true},
        { id:'ring2',    label:'Ring 2',      potType:'dup', potKey:'accesory' },
        { id:'eye',      label:'Eye Acc.',      potType:'dup', potKey:'accesory' },
        {ph:true},{ph:true},{ph:true},
        { id:'body',     label:'Top/Overall',          potType:'dup', potKey:'body' },
        { id:'glove',    label:'Glove',          potType:'cd',  potKey:'glove' },
        {ph:true},
        { id:'ring3',    label:'Ring 3',      potType:'dup', potKey:'accesory' },
        { id:'ear',      label:'Earring',  potType:'dup', potKey:'accesory' },
        {ph:true},{ph:true},{ph:true},
        { id:'leg',      label:'Bottom',          potType:'dup', potKey:'leg' },
        { id:'shoe',     label:'Shoes',          potType:'dup', potKey:'shoe' },
        {ph:true},
        { id:'ring4',    label:'Ring 4',      potType:'dup', potKey:'accesory' },
        { id:'pendant',  label:'Pendant',  potType:'dup', potKey:'accesory' },
        {ph:true},{ph:true},{ph:true},
        { id:'shoulder', label:'Shoulder',          potType:'dup', potKey:'shoulder' },
        {ph:true},{ph:true},
        { id:'belt',      label:'Belt',      potType:'dup', potKey:'belt' },
        { id:'pendant2',  label:'Pendant 2', potType:'dup', potKey:'accesory' },
        { id:'weapon',    label:'Weapon',        potType:'aa',  potKey:'weapon' },
        { id:'subweapon', label:'Secondary',    potType:'aa',  potKey:'sub' },
        { id:'emblem',    label:'Emblem',  potType:'aa',  potKey:'emblem' },
        { id:'android',   label:'Android',potType:null,  potKey:null },
        { id:'heart',     label:'Heart',        potType:'dup', potKey:'heart' },
        {ph:true},
        { id:'pocket',    label:'Pocket', noSF:true, potType:null, potKey:null },
        {ph:true},{ph:true},{ph:true},{ph:true},{ph:true},
        { id:'badge',     label:'Badge',   noSF:true, potType:null, potKey:null },
        {ph:true},
    ],
    SF_LEVELS: [140, 150, 160, 200, 250],
    SF_TO_OPTS: [18, 21, 22, 23],

    calcSF(lv, toStar, event) {
        if (!toStar) return 0;
        return this.SF_COST[lv][toStar] * this.EVENT_MULT[event][toStar];
    },

    fmtG(v) {
        if (v === 0) return '0';
        if (Number.isInteger(v)) return v.toString();
        return parseFloat(v.toFixed(2)).toString();
    },

    init() {
        const root = document.getElementById('cost-calc-root');
        root.innerHTML = this.buildHTML();
        this.renderGrid();
        this.recalc();
    },

    buildHTML() {
        return `
        <style>
            .cc-wrapper { max-width: 1480px; }
            .cc-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
            .cc-header h1 { font-size: 18px; font-weight: 700; color: #fff; margin: 0; white-space: nowrap; }
            .cc-header p { color: #8b98ad; font-size: 11.5px; margin: 0; }
            .cc-sec-label {
                font-size: 11px; font-weight: 600; color: #8b98ad; margin-bottom: 4px;
                display: flex; align-items: center; gap: 8px;
            }
            .cc-sec-label::after { content: ''; flex: 1; height: 1px; background: #1e293b; }
            .cc-toolbar { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0; margin-bottom: 8px; background: #0f172a; border: 1px solid #1e293b; }
            .cc-tool { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-left: 1px solid #1e293b; }
            .cc-tool:first-child { border-left: 0; }
            .cc-global-bar-label, .cc-bulk-label { font-size: 11px; color: #8b98ad; font-weight: 600; white-space: nowrap; }
            .cc-event-checks { display: flex; gap: 0; }
            .cc-ev-btn {
                display: flex; align-items: center; gap: 5px;
                background: #020617; border: 1px solid #334155; border-radius: 0; margin-left: -1px;
                padding: 2px 9px; cursor: pointer; user-select: none;
            }
            .cc-ev-btn:first-child { margin-left: 0; }
            .cc-ev-btn:hover { border-color: #6366f1; position: relative; }
            .cc-ev-btn.active { border-color: #6366f1; background: #312e81; position: relative; }
            .cc-ev-btn span { font-size: 12px; font-weight: 600; color: #e2e8f0; }
            .cc-ev-dot { display: none; }
            .cc-live-total { margin-left: auto; display: flex; align-items: center; gap: 10px; padding: 3px 12px; border-left: 1px solid #1e293b; background: #111a2e; }
            .cc-live-total .lt-label { font-size: 11px; color: #8b98ad; font-weight: 600; }
            .cc-live-total .lt-val {
                font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums;
                font-size: 24px; font-weight: 700; color: #f5a623; line-height: 1; min-width: 6ch; text-align: right;
            }
            .cc-live-total .lt-val .u { font-size: 12px; color: #8b98ad; margin-left: 3px; }
            .cc-live-total .lt-hint { font-size: 10.5px; color: #64748b; }
            .cc-equip-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 3px; margin-bottom: 8px; max-width: 1180px; }
            .cc-equip-card {
                background: #0f172a; border: 1px solid #1e293b; border-radius: 0;
                padding: 4px 5px 5px; display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 2px 4px; align-items: center; align-content: start;
                cursor: pointer; user-select: none;
            }
            .cc-equip-card:not(.inactive):hover { border-color: #6366f1; }
            .cc-equip-card.ph { background: transparent; border: none; pointer-events: none; cursor: default; }
            .cc-equip-card.inactive { opacity: 0.3; background: #020617; }
            .cc-equip-card select { pointer-events: auto; }
            .cc-equip-card.inactive select { pointer-events: none; }
            .cc-card-name {
                grid-column: 1 / -1; font-size: 12px; font-weight: 700; color: #f5a623;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cc-equip-card.inactive .cc-card-name { color: #8b98ad; }
            .cc-fld-lbl { font-size: 10px; color: #64748b; font-weight: 600; text-align: right; white-space: nowrap; }
            .cc-equip-card select {
                font-size: 11.5px; padding: 1px 3px; width: 100%; cursor: pointer;
                background: #020617; border: 1px solid #334155; border-radius: 0;
                color: #e2e8f0; font-family: "IBM Plex Mono", ui-monospace, monospace; outline: none;
            }
            .cc-equip-card select:focus { border-color: #6366f1; }
            .cc-result-panel { background: #0f172a; border: 1px solid #1e293b; border-top: 2px solid #6366f1; border-radius: 0; padding: 6px 8px; }
            .cc-bk { overflow-x: auto; margin-top: 2px; }
            .cc-bk table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
            .cc-bk th {
                background: #0f172a; color: #64748b; font-weight: 600; font-size: 11px;
                padding: 4px 8px; text-align: left; border-bottom: 1px solid #334155; white-space: nowrap;
            }
            .cc-bk td { padding: 3px 8px; border-bottom: 1px solid #172036; }
            .cc-bk tbody tr:nth-child(even) td { background: #0c1428; }
            .cc-bk tr:last-child td { border-bottom: none; }
            .cc-bk tr:hover td { background: #18223a; }
            .cc-bk td.num { text-align: right; font-weight: 700; color: #f5a623; font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
            .cc-bk td.sub { color: #8b98ad; font-size: 11px; }
            .cc-bk td.tot { text-align: right; font-weight: 700; color: #fb923c; font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
            .cc-bk tfoot td { background: #111a2e; font-weight: 700; padding: 5px 8px; border-top: 1px solid #334155; font-size: 12.5px; }
            .cc-bk tfoot td.tot { color: #f5a623; font-size: 15px; }
            .cc-empty-msg { color: #8b98ad; font-size: 12.5px; padding: 8px 0; }
            .cc-show-detail-btn {
                display: block; width: 100%; padding: 4px;
                background: #0f172a; border: 1px solid #1e293b; border-radius: 0;
                color: #8b98ad; font-family: inherit; font-size: 12px; font-weight: 700;
                cursor: pointer; margin-bottom: 8px;
            }
            .cc-show-detail-btn:hover { border-color: #6366f1; color: #e2e8f0; }
            .cc-bulk-btn {
                padding: 2px 9px; border-radius: 0; border: 1px solid #334155;
                background: #020617; color: #e2e8f0; font-family: inherit;
                font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap;
            }
            .cc-bulk-btn.sf:hover  { border-color: #f5a623; color: #f5a623; }
            .cc-bulk-btn.pot:hover { border-color: #6366f1; color: #a5b4fc; }
            @media (max-width: 900px) { .cc-equip-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
        </style>
        <div class="cc-wrapper">
            <div class="cc-header">
                <h1>Gear Cost Calculator</h1>
                <p>スターフォースと潜在の期待費用。カードを押すとその部位を計算から外します。</p>
            </div>
            <div class="cc-toolbar">
                <div class="cc-tool">
                    <span class="cc-global-bar-label">Event</span>
                    <div class="cc-event-checks" id="cc-event-checks">
                        <div class="cc-ev-btn active" data-val="none"><div class="cc-ev-dot"></div><span>None</span></div>
                        <div class="cc-ev-btn" data-val="meso30"><div class="cc-ev-dot"></div><span>meso -30%</span></div>
                        <div class="cc-ev-btn" data-val="boom30"><div class="cc-ev-dot"></div><span>boom -30%</span></div>
                        <div class="cc-ev-btn" data-val="both"><div class="cc-ev-dot"></div><span>both</span></div>
                    </div>
                </div>
                <div class="cc-tool">
                    <span class="cc-bulk-label">一括 ★</span>
                    <button class="cc-bulk-btn sf" id="cc-bulk-sf18">18&#9733;</button>
                    <button class="cc-bulk-btn sf" id="cc-bulk-sf21">21&#9733;</button>
                    <button class="cc-bulk-btn sf" id="cc-bulk-sf22">22&#9733;</button>
                </div>
                <div class="cc-tool">
                    <span class="cc-bulk-label">一括 潜在</span>
                    <button class="cc-bulk-btn pot" id="cc-bulk-pot-first">2ライン</button>
                    <button class="cc-bulk-btn pot" id="cc-bulk-pot-third">3ライン</button>
                </div>
                <div class="cc-live-total">
                    <div class="lt-label">合計（期待値）</div>
                    <div class="lt-val" id="cc-live-val">0<span class="u">g</span></div>
                </div>
            </div>
            <div class="cc-sec-label">装備</div>
            <div class="cc-equip-grid" id="cc-equip-grid"></div>
            <button class="cc-show-detail-btn" id="cc-toggle-detail">&#9660; Show Breakdown</button>
            <div class="cc-result-panel" id="cc-result-panel" style="display:none">
                <div class="cc-sec-label">Cost Breakdown</div>
                <div class="cc-bk" id="cc-breakdown"></div>
            </div>
        </div>`;
    },

    bindEvents() {
        const self = this;
        document.querySelectorAll('#cc-event-checks .cc-ev-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('#cc-event-checks .cc-ev-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                self.currentEvent = this.dataset.val;
                self.recalc();
            });
        });
        document.getElementById('cc-bulk-sf18').addEventListener('click', () => this.bulkSF(18));
        document.getElementById('cc-bulk-sf21').addEventListener('click', () => this.bulkSF(21));
        document.getElementById('cc-bulk-sf22').addEventListener('click', () => this.bulkSF(22));
        document.getElementById('cc-bulk-pot-first').addEventListener('click', () => this.bulkPot('first'));
        document.getElementById('cc-bulk-pot-third').addEventListener('click', () => this.bulkPot('third'));
        document.getElementById('cc-toggle-detail').addEventListener('click', () => this.toggleDetail());
    },

    bulkSF(star) {
        const self = this;
        this.EQUIPS.forEach(eq => {
            if (eq.ph || eq.noSF) return;
            const card = document.querySelector('.cc-equip-card[data-id="' + eq.id + '"]');
            if (card && card.classList.contains('inactive')) return;
            const sel = document.getElementById('cc-sto-' + eq.id);
            if (!sel) return;
            if (parseInt(sel.value) === 0) return;
            sel.value = star;
        });
        self.recalc();
    },

    bulkPot(which) {
        const self = this;
        this.EQUIPS.forEach(eq => {
            if (eq.ph || !eq.potType) return;
            const card = document.querySelector('.cc-equip-card[data-id="' + eq.id + '"]');
            if (card && card.classList.contains('inactive')) return;
            const sel = document.getElementById('cc-pot-' + eq.id);
            if (!sel) return;
            if (sel.value === 'none') return;
            const opts = sel.options;
            if (opts.length <= 1) return;
            if (which === 'first') {
                sel.selectedIndex = 1;
            } else {
                sel.selectedIndex = opts.length > 3 ? 3 : opts.length - 1;
            }
        });
        self.recalc();
    },

    renderGrid() {
        const grid = document.getElementById('cc-equip-grid');
        grid.innerHTML = '';
        const self = this;

        this.EQUIPS.forEach(eq => {
            const card = document.createElement('div');
            if (eq.ph) { card.className = 'cc-equip-card ph'; grid.appendChild(card); return; }

            card.className = 'cc-equip-card';
            card.dataset.id = eq.id;

            card.addEventListener('click', function(e) {
                if (e.target.tagName === 'SELECT') return;
                card.classList.toggle('inactive');
                self.recalc();
            });

            const nm = document.createElement('div');
            nm.className = 'cc-card-name';
            nm.textContent = eq.label;
            card.appendChild(nm);

            if (!eq.noSF) {
                const lvLbl = document.createElement('div');
                lvLbl.className = 'cc-fld-lbl'; lvLbl.textContent = 'Lv';
                card.appendChild(lvLbl);

                const lvSel = document.createElement('select');
                lvSel.id = 'cc-lv-' + eq.id;
                self.SF_LEVELS.forEach(lv => {
                    const o = document.createElement('option');
                    o.value = lv; o.textContent = lv;
                    if (lv === 250) o.selected = true;
                    lvSel.appendChild(o);
                });
                lvSel.addEventListener('change', () => self.recalc());
                card.appendChild(lvSel);

                const sfLbl = document.createElement('div');
                sfLbl.className = 'cc-fld-lbl'; sfLbl.textContent = '\u2605'; sfLbl.title = '目標の★（0★から）';
                card.appendChild(sfLbl);

                const toSel = document.createElement('select');
                toSel.id = 'cc-sto-' + eq.id;
                const noneO = document.createElement('option');
                noneO.value = 0; noneO.textContent = 'None'; toSel.appendChild(noneO);
                self.SF_TO_OPTS.forEach(v => {
                    const o = document.createElement('option');
                    o.value = v; o.textContent = v + '\u2605';
                    if (v === 22) o.selected = true;
                    toSel.appendChild(o);
                });
                toSel.addEventListener('change', () => self.recalc());
                card.appendChild(toSel);
            }

            if (eq.potType) {
                const ptLbl = document.createElement('div');
                ptLbl.className = 'cc-fld-lbl'; ptLbl.textContent = '潜在'; ptLbl.title = '目標の潜在';
                card.appendChild(ptLbl);

                const ptSel = document.createElement('select');
                ptSel.id = 'cc-pot-' + eq.id;
                const noneOpt = document.createElement('option');
                noneOpt.value = 'none'; noneOpt.textContent = 'None'; ptSel.appendChild(noneOpt);

                const opts = eq.potType === 'dup' ? [['2dup','2-Line'],['3dup','3-Line']] :
                             eq.potType === 'cd'  ? [['cd1','Crit DMG 1L'],['cd2','Crit DMG 2L']] :
                             eq.potType === 'aa'  ? [['AA','ATT + ATT'],['AABoss','ATT + ATT + Boss']] : [];
                opts.forEach(p => {
                    const o = document.createElement('option');
                    o.value = p[0]; o.textContent = p[1]; ptSel.appendChild(o);
                });
                ptSel.addEventListener('change', () => self.recalc());
                card.appendChild(ptSel);
            }

            grid.appendChild(card);
        });

        this.bindEvents();
    },

    recalc() {
        const rows = [];
        let grandTotal = 0;
        const self = this;

        this.EQUIPS.forEach(eq => {
            if (eq.ph) return;
            const card = document.querySelector('.cc-equip-card[data-id="' + eq.id + '"]');
            if (card && card.classList.contains('inactive')) return;

            let sfCost = 0, potCost = 0, lv = 250, to = 0;

            if (!eq.noSF) {
                const lvEl = document.getElementById('cc-lv-' + eq.id);
                const toEl = document.getElementById('cc-sto-' + eq.id);
                if (lvEl) lv = parseInt(lvEl.value);
                if (toEl) to = parseInt(toEl.value);
                sfCost = self.calcSF(lv, to, self.currentEvent);
            }

            let potVal = 'none';
            if (eq.potType) {
                const potEl = document.getElementById('cc-pot-' + eq.id);
                if (potEl) potVal = potEl.value;
                if (potVal !== 'none' && eq.potKey) {
                    potCost = (self.POT_COST[eq.potKey] && self.POT_COST[eq.potKey][potVal]) || 0;
                }
            }

            const total = sfCost + potCost;
            if (total > 0) {
                rows.push({ eq, lv, to, sfCost, potCost, potVal, total });
                grandTotal += total;
            }
        });

        document.getElementById('cc-live-val').innerHTML = this.fmtG(grandTotal) + '<span class="u">g</span>';

        if (this.detailOpen) this.renderBreakdown(rows, grandTotal);
    },

    toggleDetail() {
        this.detailOpen = !this.detailOpen;
        const panel = document.getElementById('cc-result-panel');
        const btn = document.getElementById('cc-toggle-detail');
        if (this.detailOpen) {
            panel.style.display = 'block';
            btn.textContent = '\u25B2 Hide Breakdown';
            this.recalc();
        } else {
            panel.style.display = 'none';
            btn.textContent = '\u25BC Show Breakdown';
        }
    },

    renderBreakdown(rows, grandTotal) {
        const bd = document.getElementById('cc-breakdown');
        if (rows.length === 0) {
            bd.innerHTML = '<p class="cc-empty-msg">No enhancements set \u2014 select a Target \u2605 or Potential for active cards.</p>';
            return;
        }
        let html = '<table><thead><tr>' +
            '<th>Equip</th><th>Lv</th><th>Target \u2605</th>' +
            '<th style="text-align:right">SF Cost</th>' +
            '<th>Potential</th>' +
            '<th style="text-align:right">Pot. Cost</th>' +
            '<th style="text-align:right">Subtotal</th>' +
            '</tr></thead><tbody>';
        rows.forEach(r => {
            const sfDisp  = r.eq.noSF ? '\u2014' : (r.to > 0 ? '0\u2605 \u2192 ' + r.to + '\u2605' : '\u2014');
            const potDisp = r.potVal === 'none' ? '\u2014' : r.potVal;
            html += '<tr>' +
                '<td style="font-weight:700">' + r.eq.label + '</td>' +
                '<td class="sub">' + (r.eq.noSF ? '\u2014' : r.lv) + '</td>' +
                '<td class="sub">' + sfDisp + '</td>' +
                '<td class="num">' + (r.sfCost > 0 ? this.fmtG(r.sfCost) + 'g' : '\u2014') + '</td>' +
                '<td class="sub">' + potDisp + '</td>' +
                '<td class="num">' + (r.potCost > 0 ? this.fmtG(r.potCost) + 'g' : '\u2014') + '</td>' +
                '<td class="tot">' + this.fmtG(r.total) + 'g</td></tr>';
        });
        html += '</tbody><tfoot><tr>' +
            '<td colspan="6" style="color:#8892aa">Total</td>' +
            '<td class="tot">' + this.fmtG(grandTotal) + 'g</td>' +
            '</tr></tfoot></table>';
        bd.innerHTML = html;
    }
};
