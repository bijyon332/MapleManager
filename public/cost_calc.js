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
            .cc-wrapper { max-width: 1120px; margin: 0 auto; }
            .cc-header { text-align: center; margin-bottom: 28px; }
            .cc-header h1 {
                font-family: 'Orbitron', sans-serif; font-size: clamp(16px, 3.5vw, 28px);
                font-weight: 900; letter-spacing: 0.06em;
                background: linear-gradient(120deg, #f5a623 0%, #e8621a 45%, #5b9cf6 100%);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
            }
            .cc-header p { color: #8892aa; font-size: 12px; margin-top: 6px; }
            .cc-sec-label {
                font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
                color: #5b9cf6; margin-bottom: 10px;
                display: flex; align-items: center; gap: 8px;
            }
            .cc-sec-label::after { content: ''; flex: 1; height: 1px; background: #1e2a45; }
            .cc-top-bar { display: flex; gap: 12px; align-items: stretch; margin-bottom: 24px; flex-wrap: wrap; }
            .cc-global-bar-label { font-size: 10px; color: #8892aa; font-weight: 700; letter-spacing: 0.08em; }
            .cc-event-checks { display: flex; flex-wrap: wrap; gap: 6px 14px; }
            .cc-ev-btn {
                display: flex; align-items: center; gap: 6px;
                background: #161c2e; border: 1px solid #1e2a45; border-radius: 7px;
                padding: 6px 11px; cursor: pointer; transition: border-color 0.15s, background 0.15s;
                user-select: none;
            }
            .cc-ev-btn:hover { border-color: #3a7bd5; }
            .cc-ev-btn.active { border-color: #5b9cf6; background: rgba(91,156,246,0.12); }
            .cc-ev-btn span { font-size: 12px; font-weight: 600; color: #e8eaf0; }
            .cc-ev-dot { width: 8px; height: 8px; border-radius: 50%; background: #1e2a45; transition: background 0.15s; flex-shrink: 0; }
            .cc-ev-btn.active .cc-ev-dot { background: #5b9cf6; box-shadow: 0 0 6px #5b9cf6; }
            .cc-live-total {
                background: linear-gradient(135deg, rgba(58,123,213,0.15), rgba(245,166,35,0.1));
                border: 1px solid rgba(91,156,246,0.35); border-radius: 12px;
                padding: 14px 22px; display: flex; flex-direction: column; justify-content: center;
                gap: 4px; min-width: 180px;
            }
            .cc-live-total .lt-label { font-size: 10px; color: #8892aa; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
            .cc-live-total .lt-val {
                font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 900; color: #f5a623;
                transition: color 0.2s; line-height: 1;
            }
            .cc-live-total .lt-val .u { font-size: 13px; color: #8892aa; font-family: 'Noto Sans JP', sans-serif; margin-left: 3px; }
            .cc-live-total .lt-hint { font-size: 10px; color: #8892aa; }
            .cc-equip-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 7px; margin-bottom: 28px; }
            .cc-equip-card {
                background: #111522; border: 1px solid #1e2a45; border-radius: 10px;
                padding: 9px 8px 11px; display: flex; flex-direction: column; gap: 5px;
                cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, opacity 0.2s, background 0.15s;
                user-select: none;
            }
            .cc-equip-card:not(.inactive):hover { border-color: rgba(91,156,246,0.6); box-shadow: 0 0 14px rgba(58,123,213,0.22); }
            .cc-equip-card.ph { background: transparent; border: none; pointer-events: none; cursor: default; }
            .cc-equip-card.inactive { opacity: 0.25; background: #161c2e; }
            .cc-equip-card select { pointer-events: auto; }
            .cc-equip-card.inactive select { pointer-events: none; }
            .cc-card-name {
                font-size: 11px; font-weight: 700; color: #f5a623;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .cc-equip-card.inactive .cc-card-name { color: #8892aa; }
            .cc-fld-lbl { font-size: 9px; color: #8892aa; font-weight: 600; margin-top: 2px; }
            .cc-equip-card select {
                font-size: 11px; padding: 5px 6px; width: 100%; cursor: pointer;
                background: #161c2e; border: 1px solid #1e2a45; border-radius: 6px;
                color: #e8eaf0; font-family: 'Noto Sans JP', sans-serif; outline: none;
                transition: border-color 0.15s;
            }
            .cc-equip-card select:focus { border-color: #3a7bd5; }
            .cc-result-panel { background: #111522; border: 1px solid #1e2a45; border-radius: 13px; padding: 22px; }
            .cc-bk { overflow-x: auto; margin-top: 4px; }
            .cc-bk table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .cc-bk th {
                background: #161c2e; color: #8892aa; font-weight: 700; font-size: 10px;
                letter-spacing: 0.06em; padding: 8px 10px; text-align: left; border-bottom: 1px solid #1e2a45; white-space: nowrap;
            }
            .cc-bk td { padding: 7px 10px; border-bottom: 1px solid rgba(30,42,69,0.5); }
            .cc-bk tr:last-child td { border-bottom: none; }
            .cc-bk tr:hover td { background: rgba(255,255,255,0.02); }
            .cc-bk td.num { text-align: right; font-weight: 700; color: #f5a623; font-variant-numeric: tabular-nums; }
            .cc-bk td.sub { color: #8892aa; font-size: 10px; }
            .cc-bk td.tot { text-align: right; font-weight: 700; color: #e8621a; font-variant-numeric: tabular-nums; }
            .cc-bk tfoot td { background: #161c2e; font-weight: 700; padding: 9px 10px; border-top: 1px solid #1e2a45; font-size: 12px; }
            .cc-bk tfoot td.tot { color: #f5a623; font-size: 14px; }
            .cc-empty-msg { color: #8892aa; font-size: 13px; padding: 12px 0; }
            .cc-show-detail-btn {
                display: block; width: 100%; padding: 12px;
                background: #161c2e; border: 1px solid #1e2a45; border-radius: 9px;
                color: #8892aa; font-family: 'Noto Sans JP', sans-serif; font-size: 12px; font-weight: 700;
                cursor: pointer; transition: border-color 0.15s, color 0.15s; margin-bottom: 20px;
            }
            .cc-show-detail-btn:hover { border-color: #3a7bd5; color: #e8eaf0; }
            .cc-bulk-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; align-items: center; }
            .cc-bulk-label { font-size: 10px; color: #8892aa; font-weight: 700; letter-spacing: 0.06em; white-space: nowrap; }
            .cc-bulk-btn {
                padding: 6px 12px; border-radius: 7px; border: 1px solid #1e2a45;
                background: #161c2e; color: #e8eaf0; font-family: 'Noto Sans JP', sans-serif;
                font-size: 11px; font-weight: 700; cursor: pointer;
                transition: border-color 0.15s, background 0.15s, color 0.15s; white-space: nowrap;
            }
            .cc-bulk-btn.sf:hover  { border-color: #f5a623; color: #f5a623; }
            .cc-bulk-btn.pot:hover { border-color: #5b9cf6; color: #5b9cf6; }
            .cc-bulk-sep { width: 1px; height: 20px; background: #1e2a45; margin: 0 2px; }
            @media (max-width: 640px) { .cc-equip-grid { grid-template-columns: repeat(4, 1fr); } }
        </style>
        <div class="cc-wrapper">
            <div class="cc-header">
                <h1>MAPLE COST CALCULATOR</h1>
                <p>Star Force &amp; Potential Enhancement Cost Estimator</p>
            </div>
            <div class="cc-sec-label">Settings &amp; Total Cost</div>
            <div class="cc-top-bar">
                <div style="display:flex; flex-direction:column; gap:8px; justify-content:center;">
                    <div class="cc-global-bar-label">Event Discount</div>
                    <div class="cc-event-checks" id="cc-event-checks">
                        <div class="cc-ev-btn active" data-val="none"><div class="cc-ev-dot"></div><span>None</span></div>
                        <div class="cc-ev-btn" data-val="meso30"><div class="cc-ev-dot"></div><span>meso -30%</span></div>
                        <div class="cc-ev-btn" data-val="boom30"><div class="cc-ev-dot"></div><span>boom -30%</span></div>
                        <div class="cc-ev-btn" data-val="both"><div class="cc-ev-dot"></div><span>both</span></div>
                    </div>
                </div>
                <div class="cc-live-total">
                    <div class="lt-label">Total Cost (Expected)</div>
                    <div class="lt-val" id="cc-live-val">0<span class="u">g</span></div>
                    <div class="lt-hint">Click a card to exclude it</div>
                </div>
            </div>
            <div class="cc-sec-label">Bulk Set</div>
            <div class="cc-bulk-bar">
                <span class="cc-bulk-label">Star Force</span>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <button class="cc-bulk-btn sf" id="cc-bulk-sf18">All 18&#9733;</button>
                    <button class="cc-bulk-btn sf" id="cc-bulk-sf21">All 21&#9733;</button>
                    <button class="cc-bulk-btn sf" id="cc-bulk-sf22">All 22&#9733;</button>
                </div>
                <div class="cc-bulk-sep"></div>
                <span class="cc-bulk-label">Potential</span>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <button class="cc-bulk-btn pot" id="cc-bulk-pot-first">All 2-Line</button>
                    <button class="cc-bulk-btn pot" id="cc-bulk-pot-third">All 3-Line</button>
                </div>
            </div>
            <div class="cc-sec-label">Equipment Settings</div>
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
                lvLbl.className = 'cc-fld-lbl'; lvLbl.textContent = 'Equip Level';
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
                sfLbl.className = 'cc-fld-lbl'; sfLbl.textContent = 'Target \u2605 (from 0\u2605)';
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
                ptLbl.className = 'cc-fld-lbl'; ptLbl.textContent = 'Target Potential';
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
