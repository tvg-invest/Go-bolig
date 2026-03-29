/* ===== Go Bolig - Ejendomsberegner ===== */

// ── Helpers ──────────────────────────────────────────────────────────
function num(id) {
  const v = parseFloat(document.getElementById(id)?.value);
  return isNaN(v) ? 0 : v;
}

function fmt(n) {
  return Math.round(n).toLocaleString('da-DK');
}

function fmtSigned(n) {
  const prefix = n >= 0 ? '+' : '';
  return prefix + fmt(n);
}

function cls(n) {
  return n >= 0 ? 'positive' : 'negative';
}

// ── Toast Notifications ─────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ── Collapsible Cards ───────────────────────────────────────────────
document.querySelectorAll('.collapsible .card-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.closest('.collapsible').classList.toggle('collapsed');
  });
});

// ── Tabs ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'saved') renderSavedList();
  });
});

// ── Mortgage Calculator ──────────────────────────────────────────────
function calcMonthlyPayment(principal, annualRate, years, interestOnly) {
  if (!principal || !annualRate) return 0;
  const r = annualRate / 100 / 12;
  if (interestOnly) return principal * r;
  const n = years * 12;
  if (!n) return 0;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function remainingBalance(principal, annualRate, years, monthsPaid) {
  if (!principal || !annualRate || !years) return principal;
  const r = annualRate / 100 / 12;
  const n = years * 12;
  const pmt = principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return principal * Math.pow(1 + r, monthsPaid) - pmt * ((Math.pow(1 + r, monthsPaid) - 1) / r);
}

// ── Chart Instances (avoid leaks) ───────────────────────────────────
let rentalExpenseChart = null;
let rentalProjectionChart = null;
let flipWaterfallChart = null;

function getChartColors() {
  return { text: '#4a5568', grid: '#e2e8f0' };
}

// ── Rental Units ─────────────────────────────────────────────────────
let rentalUnitId = 0;

function addRentalUnit(name, rent) {
  rentalUnitId++;
  const id = rentalUnitId;
  const container = document.getElementById('r-units-list');
  const row = document.createElement('div');
  row.className = 'row-item';
  row.dataset.id = id;
  row.innerHTML = `
    <div class="field">
      <label>Lejemål</label>
      <input type="text" class="unit-name" placeholder="Fx Stuen, 1. sal" value="${name || ''}">
    </div>
    <div class="field">
      <label>Mdl. husleje (kr.)</label>
      <input type="number" class="unit-rent" placeholder="6.000" step="100" value="${rent || ''}">
    </div>
    <button class="btn-remove" title="Fjern">&times;</button>
  `;
  container.appendChild(row);

  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    calcRental();
  });
  row.querySelector('.unit-rent').addEventListener('input', calcRental);
  calcRental();
}

document.getElementById('r-add-unit').addEventListener('click', () => addRentalUnit('', ''));

// ── Renovation rows (rental) ─────────────────────────────────────────
let rentalRenoId = 0;

function addRentalReno(desc, cost) {
  rentalRenoId++;
  const container = document.getElementById('r-reno-list');
  const row = document.createElement('div');
  row.className = 'row-item';
  row.innerHTML = `
    <div class="field">
      <label>Beskrivelse</label>
      <input type="text" class="reno-desc" placeholder="Fx Nyt køkken" value="${desc || ''}">
    </div>
    <div class="field">
      <label>Beløb (kr.)</label>
      <input type="number" class="reno-cost" placeholder="50.000" step="1000" value="${cost || ''}">
    </div>
    <button class="btn-remove" title="Fjern">&times;</button>
  `;
  container.appendChild(row);

  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    calcRental();
  });
  row.querySelector('.reno-desc').addEventListener('input', calcRental);
  row.querySelector('.reno-cost').addEventListener('input', calcRental);
  calcRental();
}

document.getElementById('r-add-reno').addEventListener('click', () => addRentalReno('', ''));

// ── Renovation rows (flip) ───────────────────────────────────────────
let flipRenoId = 0;

function addFlipReno(desc, cost) {
  flipRenoId++;
  const container = document.getElementById('f-reno-list');
  const row = document.createElement('div');
  row.className = 'row-item';
  row.innerHTML = `
    <div class="field">
      <label>Beskrivelse</label>
      <input type="text" class="reno-desc" placeholder="Fx Badeværelse" value="${desc || ''}">
    </div>
    <div class="field">
      <label>Beløb (kr.)</label>
      <input type="number" class="reno-cost" placeholder="80.000" step="1000" value="${cost || ''}">
    </div>
    <button class="btn-remove" title="Fjern">&times;</button>
  `;
  container.appendChild(row);

  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
    calcFlip();
  });
  row.querySelector('.reno-desc').addEventListener('input', calcFlip);
  row.querySelector('.reno-cost').addEventListener('input', calcFlip);
  calcFlip();
}

document.getElementById('f-add-reno').addEventListener('click', () => addFlipReno('', ''));

// ── Rental Calculation ───────────────────────────────────────────────
function calcRental() {
  const purchasePriceForLoan = num('r-purchase');
  const loanPct = num('r-loan-pct');
  const loanAmt = purchasePriceForLoan * (loanPct / 100);

  document.getElementById('r-loan-amount-calc').textContent =
    loanAmt > 0 ? fmt(loanAmt) + ' kr.' : '–';

  const rate = num('r-rate');
  const term = num('r-term');
  const interestOnly = document.getElementById('r-interest-only').checked;
  const calcPayment = calcMonthlyPayment(loanAmt, rate, term, interestOnly);

  document.getElementById('r-payment-calc').textContent =
    calcPayment > 0 ? fmt(calcPayment) + ' kr.' : '–';

  const manualPayment = num('r-payment-override');
  const monthlyPayment = manualPayment > 0 ? manualPayment : calcPayment;

  // Income
  const unitRents = [];
  document.querySelectorAll('#r-units-list .row-item').forEach(row => {
    const rent = parseFloat(row.querySelector('.unit-rent').value) || 0;
    const name = row.querySelector('.unit-name').value || 'Lejemål';
    unitRents.push({ name, rent });
  });

  const monthlyGrossIncome = unitRents.reduce((s, u) => s + u.rent, 0);
  const annualGrossIncome = monthlyGrossIncome * 12;
  const vacancyPct = num('r-vacancy') || 0;
  const annualVacancy = annualGrossIncome * (vacancyPct / 100);
  const annualNetIncome = annualGrossIncome - annualVacancy;

  // Expenses
  const tax = num('r-tax');
  const insurance = num('r-insurance');
  const maintenance = num('r-maintenance');
  const admin = num('r-admin');
  const utilitiesMonthly = num('r-utilities');
  const other = num('r-other');
  const annualUtilities = utilitiesMonthly * 12;
  const annualPayment = monthlyPayment * 12;

  const annualOpex = tax + insurance + maintenance + admin + annualUtilities + other;
  const annualTotalExpenses = annualOpex + annualPayment;

  // Cash flow
  const annualCashFlow = annualNetIncome - annualTotalExpenses;
  const monthlyCashFlow = annualCashFlow / 12;

  // Renovation
  let totalReno = 0;
  document.querySelectorAll('#r-reno-list .row-item').forEach(row => {
    totalReno += parseFloat(row.querySelector('.reno-cost').value) || 0;
  });

  // Returns
  const purchasePrice = purchasePriceForLoan;
  const closingCosts = num('r-closing');
  const totalInvestment = purchasePrice + closingCosts + totalReno;
  const equity = totalInvestment - loanAmt;
  const size = num('r-size');

  const grossYield = purchasePrice > 0 ? (annualGrossIncome / purchasePrice) * 100 : 0;
  const netYield = purchasePrice > 0 ? ((annualNetIncome - annualOpex) / purchasePrice) * 100 : 0;
  const cashOnCash = equity > 0 ? (annualCashFlow / equity) * 100 : 0;

  // Bank metrics
  const noi = annualNetIncome - annualOpex;
  const dscr = annualPayment > 0 ? noi / annualPayment : 0;
  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
  const breakEvenOccupancy = annualGrossIncome > 0 ? ((annualOpex + annualPayment) / annualGrossIncome) * 100 : 0;
  const pricePerSqm = (purchasePrice > 0 && size > 0) ? purchasePrice / size : 0;

  // Nothing to show yet
  if (monthlyGrossIncome === 0 && purchasePrice === 0 && monthlyPayment === 0) {
    document.getElementById('r-results').innerHTML =
      '<p class="placeholder-text">Udfyld felterne for at se beregning.</p>';
    return;
  }

  // ── Render ──
  let html = '';

  // KPI Summary
  html += '<div class="kpi-grid">';
  html += kpiTile(fmtSigned(monthlyCashFlow) + ' kr.', 'Mdl. cash flow', monthlyCashFlow);
  if (grossYield > 0) html += kpiTile(grossYield.toFixed(1) + '%', 'Bruttoafkast');
  if (capRate > 0) html += kpiTile(capRate.toFixed(1) + '%', 'Cap Rate');
  if (dscr > 0) {
    const dscrClass = dscr >= 1.25 ? 'kpi-positive' : dscr >= 1.0 ? 'kpi-warn' : 'kpi-negative';
    html += `<div class="kpi-tile ${dscrClass}"><div class="kpi-value">${dscr.toFixed(2)}</div><div class="kpi-label">DSCR</div></div>`;
  }
  if (equity > 0) html += kpiTile(cashOnCash.toFixed(1) + '%', 'Cash-on-cash', cashOnCash);
  if (pricePerSqm > 0) html += kpiTile(fmt(pricePerSqm) + ' kr.', 'Pris/m²');
  html += '</div>';

  // Charts
  html += '<div class="chart-row">';
  html += '<div class="chart-wrap"><canvas id="r-expense-canvas"></canvas></div>';
  html += '<div class="chart-wrap"><canvas id="r-cashflow-canvas"></canvas></div>';
  html += '</div>';

  // Income section
  html += '<div class="result-section"><h3>Indtægter (årligt)</h3>';
  unitRents.forEach(u => {
    if (u.rent > 0) {
      html += `<div class="result-row"><span class="label">${u.name}</span><span class="value">${fmt(u.rent * 12)} kr.</span></div>`;
    }
  });
  html += `<div class="result-row total"><span class="label">Brutto lejeindtægt</span><span class="value">${fmt(annualGrossIncome)} kr.</span></div>`;
  if (vacancyPct > 0) {
    html += `<div class="result-row"><span class="label">Tomgang (${vacancyPct}%)</span><span class="value negative">-${fmt(annualVacancy)} kr.</span></div>`;
  }
  html += `<div class="result-row total"><span class="label">Netto lejeindtægt</span><span class="value">${fmt(annualNetIncome)} kr.</span></div>`;
  html += '</div>';

  // Expenses section
  html += '<div class="result-section"><h3>Udgifter (årligt)</h3>';
  if (annualPayment > 0) html += `<div class="result-row"><span class="label">Ydelse på lån</span><span class="value">${fmt(annualPayment)} kr.</span></div>`;
  if (tax > 0) html += `<div class="result-row"><span class="label">Ejendomsskat</span><span class="value">${fmt(tax)} kr.</span></div>`;
  if (insurance > 0) html += `<div class="result-row"><span class="label">Forsikring</span><span class="value">${fmt(insurance)} kr.</span></div>`;
  if (maintenance > 0) html += `<div class="result-row"><span class="label">Vedligeholdelse</span><span class="value">${fmt(maintenance)} kr.</span></div>`;
  if (admin > 0) html += `<div class="result-row"><span class="label">Administration</span><span class="value">${fmt(admin)} kr.</span></div>`;
  if (annualUtilities > 0) html += `<div class="result-row"><span class="label">Forsyning/drift</span><span class="value">${fmt(annualUtilities)} kr.</span></div>`;
  if (other > 0) html += `<div class="result-row"><span class="label">Andet</span><span class="value">${fmt(other)} kr.</span></div>`;
  html += `<div class="result-row total"><span class="label">Total udgifter</span><span class="value">${fmt(annualTotalExpenses)} kr.</span></div>`;
  html += '</div>';

  // Cash flow
  html += '<div class="result-section"><h3>Likviditet</h3>';
  html += `<div class="result-row highlight ${annualCashFlow >= 0 ? '' : 'negative'}">
    <span class="label">Årligt cash flow</span>
    <span class="value ${cls(annualCashFlow)}">${fmtSigned(annualCashFlow)} kr.</span>
  </div>`;
  html += `<div class="result-row highlight ${monthlyCashFlow >= 0 ? '' : 'negative'}">
    <span class="label">Mdl. cash flow</span>
    <span class="value ${cls(monthlyCashFlow)}">${fmtSigned(monthlyCashFlow)} kr.</span>
  </div>`;
  html += '</div>';

  // Renovation
  if (totalReno > 0) {
    html += '<div class="result-section"><h3>Renovering</h3>';
    document.querySelectorAll('#r-reno-list .row-item').forEach(row => {
      const desc = row.querySelector('.reno-desc').value || 'Post';
      const cost = parseFloat(row.querySelector('.reno-cost').value) || 0;
      if (cost > 0) {
        html += `<div class="result-row"><span class="label">${desc}</span><span class="value">${fmt(cost)} kr.</span></div>`;
      }
    });
    html += `<div class="result-row total"><span class="label">Total renovering</span><span class="value">${fmt(totalReno)} kr.</span></div>`;
    html += '</div>';
  }

  // Key metrics
  html += '<div class="result-section"><h3>Nøgletal</h3>';
  if (purchasePrice > 0) {
    html += `<div class="result-row"><span class="label">Købspris</span><span class="value">${fmt(purchasePrice)} kr.</span></div>`;
    if (closingCosts > 0) html += `<div class="result-row"><span class="label">Købsomkostninger</span><span class="value">${fmt(closingCosts)} kr.</span></div>`;
    if (totalReno > 0) html += `<div class="result-row"><span class="label">Renovering</span><span class="value">${fmt(totalReno)} kr.</span></div>`;
    html += `<div class="result-row total"><span class="label">Samlet investering</span><span class="value">${fmt(totalInvestment)} kr.</span></div>`;
    if (loanAmt > 0) html += `<div class="result-row"><span class="label">Lån</span><span class="value">${fmt(loanAmt)} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Egenkapital</span><span class="value">${fmt(equity)} kr.</span></div>`;
    html += '<hr class="result-divider">';
    html += `<div class="result-row"><span class="label">Bruttoafkast</span><span class="value">${grossYield.toFixed(1)}%</span></div>`;
    html += `<div class="result-row"><span class="label">Nettoafkast (før finans.)</span><span class="value">${netYield.toFixed(1)}%</span></div>`;
    if (capRate > 0) html += `<div class="result-row"><span class="label">Cap Rate (NOI/pris)</span><span class="value">${capRate.toFixed(1)}%</span></div>`;
    if (equity > 0) {
      html += `<div class="result-row"><span class="label">Cash-on-cash afkast</span><span class="value ${cls(cashOnCash)}">${cashOnCash.toFixed(1)}%</span></div>`;
    }
    if (dscr > 0) {
      html += `<div class="result-row"><span class="label">DSCR (gældsdækning)</span><span class="value ${dscr >= 1.0 ? 'positive' : 'negative'}">${dscr.toFixed(2)}</span></div>`;
    }
    if (breakEvenOccupancy > 0 && breakEvenOccupancy <= 100) {
      html += `<div class="result-row"><span class="label">Break-even udlejning</span><span class="value">${breakEvenOccupancy.toFixed(0)}%</span></div>`;
    }
    if (pricePerSqm > 0) html += `<div class="result-row"><span class="label">Pris pr. m²</span><span class="value">${fmt(pricePerSqm)} kr.</span></div>`;
  }
  html += '</div>';

  // Sensitivity analysis
  if (monthlyGrossIncome > 0 && purchasePrice > 0) {
    html += buildRentalSensitivity(purchasePrice, loanPct, term, interestOnly, monthlyGrossIncome, vacancyPct, annualOpex, rate);
  }

  // 10-year projection
  if (purchasePrice > 0 && monthlyGrossIncome > 0) {
    const rentIncrease = num('r-rent-increase') || 0;
    const appreciation = num('r-appreciation') || 0;
    html += buildProjectionTable(purchasePrice, loanAmt, rate, term, interestOnly, annualNetIncome, annualOpex, annualPayment, rentIncrease, appreciation, totalReno + closingCosts);
    html += '<div class="chart-wrap"><canvas id="r-projection-canvas"></canvas></div>';
  }

  document.getElementById('r-results').innerHTML = html;

  // Render charts after DOM update
  renderRentalCharts(annualPayment, tax, insurance, maintenance, admin, annualUtilities, other, annualNetIncome, annualTotalExpenses, purchasePrice, loanAmt, rate, term, interestOnly, annualOpex, monthlyGrossIncome, vacancyPct);

  // Animate KPIs
  document.querySelectorAll('#r-results .kpi-tile').forEach(t => {
    t.classList.add('updating');
    t.addEventListener('animationend', () => t.classList.remove('updating'), { once: true });
  });

  // Auto-save draft
  saveDraft('rental');
}

function kpiTile(value, label, colorVal) {
  let colorClass = '';
  if (colorVal !== undefined) colorClass = colorVal >= 0 ? 'kpi-positive' : 'kpi-negative';
  return `<div class="kpi-tile ${colorClass}"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
}

// ── Rental Charts ────────────────────────────────────────────────────
function renderRentalCharts(annualPayment, tax, insurance, maintenance, admin, annualUtilities, other, annualNetIncome, annualTotalExpenses, purchasePrice, loanAmt, rate, term, interestOnly, annualOpex, monthlyGrossIncome, vacancyPct) {
  const c = getChartColors();

  // Expense doughnut
  const expCanvas = document.getElementById('r-expense-canvas');
  if (expCanvas && annualTotalExpenses > 0) {
    if (rentalExpenseChart) rentalExpenseChart.destroy();
    const labels = [];
    const data = [];
    if (annualPayment > 0) { labels.push('Ydelse'); data.push(annualPayment); }
    if (tax > 0) { labels.push('Skat'); data.push(tax); }
    if (insurance > 0) { labels.push('Forsikring'); data.push(insurance); }
    if (maintenance > 0) { labels.push('Vedligehold'); data.push(maintenance); }
    if (admin > 0) { labels.push('Admin'); data.push(admin); }
    if (annualUtilities > 0) { labels.push('Forsyning'); data.push(annualUtilities); }
    if (other > 0) { labels.push('Andet'); data.push(other); }

    rentalExpenseChart = new Chart(expCanvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ['#3182ce','#e53e3e','#dd6b20','#38a169','#805ad5','#d69e2e','#718096'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 10 }, color: c.text } },
          title: { display: true, text: 'Udgiftsfordeling', color: c.text, font: { size: 12 } }
        }
      }
    });
  }

  // Cash flow bar
  const cfCanvas = document.getElementById('r-cashflow-canvas');
  if (cfCanvas && (annualNetIncome > 0 || annualTotalExpenses > 0)) {
    if (rentalProjectionChart) rentalProjectionChart.destroy();
    rentalProjectionChart = new Chart(cfCanvas, {
      type: 'bar',
      data: {
        labels: ['Indtægt', 'Udgifter', 'Cash flow'],
        datasets: [{
          data: [annualNetIncome, -annualTotalExpenses, annualNetIncome - annualTotalExpenses],
          backgroundColor: ['#38a169', '#e53e3e', annualNetIncome - annualTotalExpenses >= 0 ? '#3182ce' : '#e53e3e'],
          borderRadius: 4,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Årligt overblik (kr.)', color: c.text, font: { size: 12 } }
        },
        scales: {
          y: { ticks: { color: c.text, callback: v => fmt(v) }, grid: { color: c.grid } },
          x: { ticks: { color: c.text }, grid: { display: false } }
        }
      }
    });
  }

  // 10-year projection line chart
  const projCanvas = document.getElementById('r-projection-canvas');
  if (projCanvas) {
    const rentIncrease = num('r-rent-increase') || 0;
    const appreciation = num('r-appreciation') || 0;
    const years = 10;
    const cfData = [];
    const eqData = [];
    const lbls = [];
    let curRent = monthlyGrossIncome * 12;
    for (let y = 1; y <= years; y++) {
      curRent *= (1 + rentIncrease / 100);
      const netInc = curRent * (1 - (vacancyPct || 0) / 100);
      const cf = netInc - annualOpex - (calcMonthlyPayment(loanAmt, rate, term, interestOnly) * 12);
      const propVal = purchasePrice * Math.pow(1 + appreciation / 100, y);
      const remLoan = interestOnly ? loanAmt : Math.max(0, remainingBalance(loanAmt, rate, term, y * 12));
      const eq = propVal - remLoan;
      cfData.push(Math.round(cf));
      eqData.push(Math.round(eq));
      lbls.push('År ' + y);
    }

    if (flipWaterfallChart) flipWaterfallChart.destroy();
    flipWaterfallChart = new Chart(projCanvas, {
      type: 'line',
      data: {
        labels: lbls,
        datasets: [
          { label: 'Cash flow', data: cfData, borderColor: '#3182ce', backgroundColor: 'rgba(49,130,206,.1)', fill: true, tension: 0.3, pointRadius: 3 },
          { label: 'Egenkapital', data: eqData, borderColor: '#38a169', backgroundColor: 'rgba(56,161,105,.1)', fill: true, tension: 0.3, pointRadius: 3, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { boxWidth: 10, padding: 8, font: { size: 10 }, color: c.text } },
          title: { display: true, text: '10-års projektion', color: c.text, font: { size: 12 } }
        },
        scales: {
          y: { title: { display: true, text: 'Cash flow (kr.)', color: c.text, font: { size: 10 } }, ticks: { color: c.text, callback: v => fmt(v) }, grid: { color: c.grid } },
          y1: { position: 'right', title: { display: true, text: 'Egenkapital (kr.)', color: c.text, font: { size: 10 } }, ticks: { color: c.text, callback: v => fmt(v) }, grid: { display: false } },
          x: { ticks: { color: c.text }, grid: { display: false } }
        }
      }
    });
  }
}

// ── 10-Year Projection Table ─────────────────────────────────────────
function buildProjectionTable(purchasePrice, loanAmt, rate, term, interestOnly, annualNetIncome, annualOpex, annualPayment, rentIncreasePct, appreciationPct, extraCosts) {
  let html = '<div class="projection-section"><h3>10-års projektion</h3><div class="projection-scroll"><table class="projection-table"><thead><tr>';
  html += '<th>År</th><th>Ejendomsværdi</th><th>Rest lån</th><th>Egenkapital</th><th>Indtægt</th><th>Cash flow</th><th>Kumuleret CF</th>';
  html += '</tr></thead><tbody>';

  let curIncome = annualNetIncome;
  let cumCF = 0;

  for (let y = 1; y <= 10; y++) {
    curIncome *= (1 + rentIncreasePct / 100);
    const propVal = purchasePrice * Math.pow(1 + appreciationPct / 100, y);
    const remLoan = interestOnly ? loanAmt : Math.max(0, remainingBalance(loanAmt, rate, term, y * 12));
    const eq = propVal - remLoan;
    const cf = curIncome - annualOpex - annualPayment;
    cumCF += cf;

    html += `<tr>
      <td>${y}</td>
      <td>${fmt(propVal)}</td>
      <td>${fmt(remLoan)}</td>
      <td class="${cls(eq)}">${fmt(eq)}</td>
      <td>${fmt(curIncome)}</td>
      <td class="${cls(cf)}">${fmtSigned(cf)}</td>
      <td class="${cls(cumCF)}">${fmtSigned(cumCF)}</td>
    </tr>`;
  }

  html += '</tbody></table></div></div>';
  return html;
}

// ── Rental Sensitivity Table ─────────────────────────────────────────
function buildRentalSensitivity(purchasePrice, loanPct, term, interestOnly, monthlyRent, vacancyPct, annualOpex, currentRate) {
  const rentSteps = [-2000, -1000, 0, 1000, 2000];
  const rateSteps = [-1.0, -0.5, 0, 0.5, 1.0];

  let html = '<div class="sensitivity-section"><h3>Følsomhedsanalyse (mdl. cash flow)</h3>';
  html += '<table class="sensitivity-table"><thead><tr><th>Rente \\ Husleje</th>';

  rentSteps.forEach(rs => {
    html += `<th>${fmt(monthlyRent + rs)} kr.</th>`;
  });
  html += '</tr></thead><tbody>';

  rateSteps.forEach(rateAdj => {
    const adjRate = currentRate + rateAdj;
    if (adjRate < 0) return;
    html += `<tr><td><strong>${adjRate.toFixed(1)}%</strong></td>`;

    rentSteps.forEach(rs => {
      const adjRent = monthlyRent + rs;
      const adjAnnualGross = adjRent * 12;
      const adjAnnualNet = adjAnnualGross * (1 - vacancyPct / 100);
      const loanAmt = purchasePrice * (loanPct / 100);
      const pmt = calcMonthlyPayment(loanAmt, adjRate, term, interestOnly);
      const annualPmt = pmt * 12;
      const cf = (adjAnnualNet - annualOpex - annualPmt) / 12;
      const isCurrent = rs === 0 && rateAdj === 0;
      html += `<td class="${isCurrent ? 'current' : ''} ${cls(cf)}">${fmtSigned(cf)}</td>`;
    });

    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

// ── Flip Calculation ─────────────────────────────────────────────────
function calcFlip() {
  const purchasePrice = num('f-purchase');
  const closingCosts = num('f-closing');
  const holdMonths = num('f-hold-months');
  const holdCost = num('f-hold-cost');
  const holdTax = num('f-hold-tax');
  const holdInsurance = num('f-hold-insurance');
  const holdOther = num('f-hold-other');
  const salePrice = num('f-sale-price');
  const saleCosts = num('f-sale-costs');

  let totalReno = 0;
  const renoItems = [];
  document.querySelectorAll('#f-reno-list .row-item').forEach(row => {
    const desc = row.querySelector('.reno-desc').value || 'Post';
    const cost = parseFloat(row.querySelector('.reno-cost').value) || 0;
    totalReno += cost;
    if (cost > 0) renoItems.push({ desc, cost });
  });

  const totalHoldingCost = (holdCost + holdTax + holdInsurance + holdOther) * holdMonths;
  const totalInvestment = purchasePrice + closingCosts + totalReno + totalHoldingCost;
  const netSalePrice = salePrice - saleCosts;
  const profit = netSalePrice - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;

  if (purchasePrice === 0 && salePrice === 0 && totalReno === 0) {
    document.getElementById('f-results').innerHTML =
      '<p class="placeholder-text">Udfyld felterne for at se beregning.</p>';
    return;
  }

  let html = '';

  // KPI Summary
  html += '<div class="kpi-grid">';
  html += kpiTile(fmtSigned(profit) + ' kr.', 'Fortjeneste', profit);
  if (totalInvestment > 0) html += kpiTile(roi.toFixed(1) + '%', 'ROI', roi);
  if (holdMonths > 0 && totalInvestment > 0) {
    const annualizedRoi = (Math.pow(1 + profit / totalInvestment, 12 / holdMonths) - 1) * 100;
    if (isFinite(annualizedRoi)) html += kpiTile(annualizedRoi.toFixed(1) + '%', 'Annualiseret ROI', annualizedRoi);
  }
  if (totalInvestment > 0) html += kpiTile(fmt(totalInvestment) + ' kr.', 'Samlet investering');
  html += '</div>';

  // Waterfall chart
  html += '<div class="chart-wrap"><canvas id="f-waterfall-canvas"></canvas></div>';

  // Purchase
  html += '<div class="result-section"><h3>Investering</h3>';
  html += `<div class="result-row"><span class="label">Købspris</span><span class="value">${fmt(purchasePrice)} kr.</span></div>`;
  if (closingCosts > 0) html += `<div class="result-row"><span class="label">Købsomkostninger</span><span class="value">${fmt(closingCosts)} kr.</span></div>`;
  if (totalReno > 0) html += `<div class="result-row"><span class="label">Renovering</span><span class="value">${fmt(totalReno)} kr.</span></div>`;
  if (totalHoldingCost > 0) html += `<div class="result-row"><span class="label">Holdeomkostninger (${holdMonths} md.)</span><span class="value">${fmt(totalHoldingCost)} kr.</span></div>`;
  html += `<div class="result-row total"><span class="label">Samlet investering</span><span class="value">${fmt(totalInvestment)} kr.</span></div>`;
  html += '</div>';

  // Renovation detail
  if (renoItems.length > 0) {
    html += '<div class="result-section"><h3>Renovering - detaljer</h3>';
    renoItems.forEach(item => {
      html += `<div class="result-row"><span class="label">${item.desc}</span><span class="value">${fmt(item.cost)} kr.</span></div>`;
    });
    html += `<div class="result-row total"><span class="label">Total renovering</span><span class="value">${fmt(totalReno)} kr.</span></div>`;
    html += '</div>';
  }

  // Holding costs detail
  if (holdMonths > 0 && totalHoldingCost > 0) {
    html += '<div class="result-section"><h3>Holdeomkostninger</h3>';
    if (holdCost > 0) html += `<div class="result-row"><span class="label">Finansiering</span><span class="value">${fmt(holdCost * holdMonths)} kr.</span></div>`;
    if (holdTax > 0) html += `<div class="result-row"><span class="label">Ejendomsskat</span><span class="value">${fmt(holdTax * holdMonths)} kr.</span></div>`;
    if (holdInsurance > 0) html += `<div class="result-row"><span class="label">Forsikring</span><span class="value">${fmt(holdInsurance * holdMonths)} kr.</span></div>`;
    if (holdOther > 0) html += `<div class="result-row"><span class="label">Andet</span><span class="value">${fmt(holdOther * holdMonths)} kr.</span></div>`;
    html += `<div class="result-row total"><span class="label">Total (${holdMonths} md.)</span><span class="value">${fmt(totalHoldingCost)} kr.</span></div>`;
    html += '</div>';
  }

  // Sale
  html += '<div class="result-section"><h3>Salg</h3>';
  html += `<div class="result-row"><span class="label">Salgspris</span><span class="value">${fmt(salePrice)} kr.</span></div>`;
  if (saleCosts > 0) html += `<div class="result-row"><span class="label">Salgsomkostninger</span><span class="value">-${fmt(saleCosts)} kr.</span></div>`;
  html += `<div class="result-row total"><span class="label">Netto salgspris</span><span class="value">${fmt(netSalePrice)} kr.</span></div>`;
  html += '</div>';

  // Profit
  html += '<div class="result-section"><h3>Resultat</h3>';
  html += `<div class="result-row highlight ${profit >= 0 ? '' : 'negative'}">
    <span class="label">Fortjeneste</span>
    <span class="value ${cls(profit)}">${fmtSigned(profit)} kr.</span>
  </div>`;
  if (totalInvestment > 0) {
    html += `<div class="result-row highlight ${roi >= 0 ? '' : 'negative'}">
      <span class="label">ROI</span>
      <span class="value ${cls(roi)}">${roi.toFixed(1)}%</span>
    </div>`;
  }
  if (holdMonths > 0 && totalInvestment > 0) {
    const annualizedRoi = (Math.pow(1 + profit / totalInvestment, 12 / holdMonths) - 1) * 100;
    if (isFinite(annualizedRoi)) {
      html += `<div class="result-row"><span class="label">Annualiseret ROI</span><span class="value ${cls(annualizedRoi)}">${annualizedRoi.toFixed(1)}%</span></div>`;
    }
  }
  html += '</div>';

  // Sensitivity
  if (salePrice > 0 && totalInvestment > 0) {
    html += buildFlipSensitivity(purchasePrice, closingCosts, totalReno, totalHoldingCost, salePrice, saleCosts);
  }

  document.getElementById('f-results').innerHTML = html;

  // Waterfall chart
  renderFlipChart(purchasePrice, closingCosts, totalReno, totalHoldingCost, saleCosts, salePrice, profit);

  // Animate KPIs
  document.querySelectorAll('#f-results .kpi-tile').forEach(t => {
    t.classList.add('updating');
    t.addEventListener('animationend', () => t.classList.remove('updating'), { once: true });
  });

  saveDraft('flip');
}

// ── Flip Chart ───────────────────────────────────────────────────────
let flipChart = null;

function renderFlipChart(purchasePrice, closingCosts, totalReno, totalHoldingCost, saleCosts, salePrice, profit) {
  const canvas = document.getElementById('f-waterfall-canvas');
  if (!canvas) return;
  if (flipChart) flipChart.destroy();
  const c = getChartColors();

  const labels = ['Købspris'];
  const costs = [purchasePrice];
  if (closingCosts > 0) { labels.push('Omk.'); costs.push(closingCosts); }
  if (totalReno > 0) { labels.push('Renovering'); costs.push(totalReno); }
  if (totalHoldingCost > 0) { labels.push('Holdeomk.'); costs.push(totalHoldingCost); }
  if (saleCosts > 0) { labels.push('Salgsomk.'); costs.push(saleCosts); }
  labels.push('Salgspris', 'Fortjeneste');

  const totalCosts = costs.reduce((s, c) => s + c, 0);
  const allData = [...costs, salePrice, profit];
  const colors = costs.map(() => '#e53e3e');
  colors.push('#38a169', profit >= 0 ? '#3182ce' : '#e53e3e');

  flipChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: allData, backgroundColor: colors, borderRadius: 4, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Flip-overblik (kr.)', color: c.text, font: { size: 12 } }
      },
      scales: {
        y: { ticks: { color: c.text, callback: v => fmt(v) }, grid: { color: c.grid } },
        x: { ticks: { color: c.text, font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

// ── Flip Sensitivity Table ───────────────────────────────────────────
function buildFlipSensitivity(purchasePrice, closingCosts, totalReno, totalHoldingCost, salePrice, saleCosts) {
  const salePriceSteps = [-200000, -100000, 0, 100000, 200000];
  const renoSteps = [-50000, -25000, 0, 25000, 50000];

  let html = '<div class="sensitivity-section"><h3>Følsomhedsanalyse (fortjeneste)</h3>';
  html += '<table class="sensitivity-table"><thead><tr><th>Reno \\ Salgspris</th>';

  salePriceSteps.forEach(sp => {
    html += `<th>${fmt(salePrice + sp)} kr.</th>`;
  });
  html += '</tr></thead><tbody>';

  renoSteps.forEach(ra => {
    const adjReno = totalReno + ra;
    if (adjReno < 0) return;
    html += `<tr><td><strong>${fmt(adjReno)} kr.</strong></td>`;

    salePriceSteps.forEach(sp => {
      const adjSale = salePrice + sp;
      const adjNet = adjSale - saleCosts;
      const adjInv = purchasePrice + closingCosts + adjReno + totalHoldingCost;
      const adjProfit = adjNet - adjInv;
      const isCurrent = sp === 0 && ra === 0;
      html += `<td class="${isCurrent ? 'current' : ''} ${cls(adjProfit)}">${fmtSigned(adjProfit)}</td>`;
    });

    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

// ── Real-time updates ────────────────────────────────────────────────
['r-purchase', 'r-closing', 'r-loan-pct', 'r-rate', 'r-term',
 'r-payment-override', 'r-tax', 'r-insurance', 'r-maintenance',
 'r-admin', 'r-utilities', 'r-other', 'r-vacancy',
 'r-size', 'r-rooms', 'r-year-built',
 'r-rent-increase', 'r-appreciation'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcRental);
});
document.getElementById('r-interest-only')?.addEventListener('change', calcRental);

['f-purchase', 'f-closing', 'f-hold-months', 'f-hold-cost',
 'f-hold-tax', 'f-hold-insurance', 'f-hold-other',
 'f-sale-price', 'f-sale-costs'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcFlip);
});

// ── Auto-save Draft ──────────────────────────────────────────────────
let draftTimer = null;

function saveDraft(type) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (type === 'rental') {
      localStorage.setItem('gobolig_draft_rental', JSON.stringify(gatherRentalData()));
    } else {
      localStorage.setItem('gobolig_draft_flip', JSON.stringify(gatherFlipData()));
    }
  }, 500);
}

function restoreDrafts() {
  const rentalDraft = localStorage.getItem('gobolig_draft_rental');
  const flipDraft = localStorage.getItem('gobolig_draft_flip');
  let restored = false;

  if (rentalDraft) {
    try {
      const data = JSON.parse(rentalDraft);
      if (data.name || data.purchase || (data.units && data.units.some(u => u.rent > 0))) {
        loadRentalData(data);
        restored = true;
      }
    } catch (e) {}
  }

  if (flipDraft) {
    try {
      const data = JSON.parse(flipDraft);
      if (data.name || data.purchase || data.salePrice) {
        loadFlipData(data);
        restored = true;
      }
    } catch (e) {}
  }

  if (restored) {
    showToast('Kladde genindlæst.', 'info');
  }
}

// ── Save / Load / Delete ─────────────────────────────────────────────
function getProperties() {
  return JSON.parse(localStorage.getItem('gobolig_properties') || '[]');
}

function saveProperties(props) {
  localStorage.setItem('gobolig_properties', JSON.stringify(props));
}

function gatherRentalData() {
  const units = [];
  document.querySelectorAll('#r-units-list .row-item').forEach(row => {
    units.push({
      name: row.querySelector('.unit-name').value,
      rent: parseFloat(row.querySelector('.unit-rent').value) || 0
    });
  });

  const reno = [];
  document.querySelectorAll('#r-reno-list .row-item').forEach(row => {
    reno.push({
      desc: row.querySelector('.reno-desc').value,
      cost: parseFloat(row.querySelector('.reno-cost').value) || 0
    });
  });

  return {
    type: 'rental',
    name: document.getElementById('r-name').value,
    purchase: num('r-purchase'),
    closing: num('r-closing'),
    size: num('r-size'),
    rooms: num('r-rooms'),
    yearBuilt: num('r-year-built'),
    loanPct: num('r-loan-pct'),
    rate: num('r-rate'),
    term: num('r-term'),
    interestOnly: document.getElementById('r-interest-only').checked,
    paymentOverride: num('r-payment-override'),
    units,
    tax: num('r-tax'),
    insurance: num('r-insurance'),
    maintenance: num('r-maintenance'),
    admin: num('r-admin'),
    utilities: num('r-utilities'),
    other: num('r-other'),
    vacancy: num('r-vacancy'),
    rentIncrease: num('r-rent-increase'),
    appreciation: num('r-appreciation'),
    reno
  };
}

function gatherFlipData() {
  const reno = [];
  document.querySelectorAll('#f-reno-list .row-item').forEach(row => {
    reno.push({
      desc: row.querySelector('.reno-desc').value,
      cost: parseFloat(row.querySelector('.reno-cost').value) || 0
    });
  });

  return {
    type: 'flip',
    name: document.getElementById('f-name').value,
    purchase: num('f-purchase'),
    closing: num('f-closing'),
    holdMonths: num('f-hold-months'),
    holdCost: num('f-hold-cost'),
    holdTax: num('f-hold-tax'),
    holdInsurance: num('f-hold-insurance'),
    holdOther: num('f-hold-other'),
    salePrice: num('f-sale-price'),
    saleCosts: num('f-sale-costs'),
    reno
  };
}

function loadRentalData(data) {
  document.getElementById('r-name').value = data.name || '';
  document.getElementById('r-purchase').value = data.purchase || '';
  document.getElementById('r-closing').value = data.closing || '';
  document.getElementById('r-size').value = data.size || '';
  document.getElementById('r-rooms').value = data.rooms || '';
  document.getElementById('r-year-built').value = data.yearBuilt || '';
  document.getElementById('r-loan-pct').value = data.loanPct ?? 80;
  document.getElementById('r-rate').value = data.rate ?? 4;
  document.getElementById('r-term').value = data.term ?? 30;
  document.getElementById('r-interest-only').checked = data.interestOnly || false;
  document.getElementById('r-payment-override').value = data.paymentOverride || '';
  document.getElementById('r-tax').value = data.tax || '';
  document.getElementById('r-insurance').value = data.insurance || '';
  document.getElementById('r-maintenance').value = data.maintenance || '';
  document.getElementById('r-admin').value = data.admin || '';
  document.getElementById('r-utilities').value = data.utilities || '';
  document.getElementById('r-other').value = data.other || '';
  document.getElementById('r-vacancy').value = data.vacancy || '';
  document.getElementById('r-rent-increase').value = data.rentIncrease ?? 2;
  document.getElementById('r-appreciation').value = data.appreciation ?? 2;

  document.getElementById('r-units-list').innerHTML = '';
  (data.units || []).forEach(u => addRentalUnit(u.name, u.rent));

  document.getElementById('r-reno-list').innerHTML = '';
  (data.reno || []).forEach(r => addRentalReno(r.desc, r.cost));

  calcRental();
}

function loadFlipData(data) {
  document.getElementById('f-name').value = data.name || '';
  document.getElementById('f-purchase').value = data.purchase || '';
  document.getElementById('f-closing').value = data.closing || '';
  document.getElementById('f-hold-months').value = data.holdMonths || '';
  document.getElementById('f-hold-cost').value = data.holdCost || '';
  document.getElementById('f-hold-tax').value = data.holdTax || '';
  document.getElementById('f-hold-insurance').value = data.holdInsurance || '';
  document.getElementById('f-hold-other').value = data.holdOther || '';
  document.getElementById('f-sale-price').value = data.salePrice || '';
  document.getElementById('f-sale-costs').value = data.saleCosts || '';

  document.getElementById('f-reno-list').innerHTML = '';
  (data.reno || []).forEach(r => addFlipReno(r.desc, r.cost));

  calcFlip();
}

// Save buttons
document.getElementById('r-save').addEventListener('click', () => {
  const data = gatherRentalData();
  if (!data.name) { showToast('Angiv venligst et navn/adresse.', 'error'); return; }
  data.id = Date.now();
  data.savedAt = new Date().toISOString();
  const props = getProperties();
  props.push(data);
  saveProperties(props);
  showToast('Ejendom gemt!', 'success');
});

document.getElementById('f-save').addEventListener('click', () => {
  const data = gatherFlipData();
  if (!data.name) { showToast('Angiv venligst et navn/adresse.', 'error'); return; }
  data.id = Date.now();
  data.savedAt = new Date().toISOString();
  const props = getProperties();
  props.push(data);
  saveProperties(props);
  showToast('Ejendom gemt!', 'success');
});

// Reset buttons
document.getElementById('r-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#rental input[type="number"], #rental input[type="text"]').forEach(el => el.value = '');
  document.getElementById('r-interest-only').checked = false;
  document.getElementById('r-units-list').innerHTML = '';
  document.getElementById('r-reno-list').innerHTML = '';
  document.getElementById('r-property-image').innerHTML = '';
  localStorage.removeItem('gobolig_draft_rental');
  calcRental();
  showToast('Felter nulstillet.', 'info');
});

document.getElementById('f-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#flip input[type="number"], #flip input[type="text"]').forEach(el => el.value = '');
  document.getElementById('f-reno-list').innerHTML = '';
  document.getElementById('f-property-image').innerHTML = '';
  localStorage.removeItem('gobolig_draft_flip');
  calcFlip();
  showToast('Felter nulstillet.', 'info');
});

// ── Saved Properties List ────────────────────────────────────────────
function renderSavedList() {
  const props = getProperties();
  const container = document.getElementById('saved-list');

  if (props.length === 0) {
    container.innerHTML = '<p class="placeholder-text">Ingen gemte ejendomme endnu.</p>';
    return;
  }

  let html = '';
  props.forEach(p => {
    const date = new Date(p.savedAt).toLocaleDateString('da-DK');
    const typeBadge = p.type === 'rental'
      ? '<span class="type-badge rental">Udlejning</span>'
      : '<span class="type-badge flip">Flip</span>';

    let stats = '';
    if (p.type === 'rental') {
      const monthlyRent = (p.units || []).reduce((s, u) => s + u.rent, 0);
      stats = `<span>Husleje: <strong>${fmt(monthlyRent)} kr./md.</strong></span>
               <span>Købspris: <strong>${fmt(p.purchase)} kr.</strong></span>`;
    } else {
      const totalReno = (p.reno || []).reduce((s, r) => s + r.cost, 0);
      stats = `<span>Købspris: <strong>${fmt(p.purchase)} kr.</strong></span>
               <span>Renovering: <strong>${fmt(totalReno)} kr.</strong></span>
               <span>Salgspris: <strong>${fmt(p.salePrice)} kr.</strong></span>`;
    }

    html += `
      <div class="saved-card">
        <div class="saved-card-info">
          <h3>${p.name || 'Uden navn'}${typeBadge}</h3>
          <div class="saved-meta">Gemt ${date}</div>
          <div class="saved-stats">${stats}</div>
        </div>
        <div class="saved-card-actions">
          <button class="btn-load" onclick="loadProperty(${p.id})">Indlæs</button>
          <button class="btn-delete" onclick="deleteProperty(${p.id})">Slet</button>
        </div>
      </div>`;
  });

  container.innerHTML = html;
}

window.loadProperty = function(id) {
  const props = getProperties();
  const p = props.find(x => x.id === id);
  if (!p) return;

  if (p.type === 'rental') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-tab="rental"]').classList.add('active');
    document.getElementById('rental').classList.add('active');
    loadRentalData(p);
  } else {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-tab="flip"]').classList.add('active');
    document.getElementById('flip').classList.add('active');
    loadFlipData(p);
  }
  showToast(`${p.name} indlæst.`, 'success');
};

window.deleteProperty = function(id) {
  if (!confirm('Slet denne ejendom?')) return;
  const props = getProperties().filter(x => x.id !== id);
  saveProperties(props);
  renderSavedList();
  showToast('Ejendom slettet.', 'info');
};

// ── URL Fetch / Scrape ───────────────────────────────────────────────
async function fetchPropertyDual(prefix, applyFn) {
  const boligsidenUrl = document.getElementById(prefix + '-url-boligsiden').value.trim();
  const maglerUrl = document.getElementById(prefix + '-url-magler').value.trim();
  const statusEl = document.getElementById(prefix + '-url-status');
  const infoEl = document.getElementById(prefix + '-url-info');
  const btn = document.getElementById(prefix + '-fetch');

  if (!boligsidenUrl && !maglerUrl) {
    statusEl.className = 'url-status error';
    statusEl.textContent = 'Indsæt mindst ét link.';
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  statusEl.className = 'url-status loading';
  statusEl.textContent = 'Henter data fra annonce(r)...';
  infoEl.innerHTML = '';

  try {
    const resp = await fetch('/api/fetch-property', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boligsidenUrl, maglerUrl })
    });

    const result = await resp.json();

    if (!result.success) {
      statusEl.className = 'url-status error';
      statusEl.textContent = result.error || 'Kunne ikke hente data.';
      return;
    }

    const d = result.data;

    // Auto-fill discovered URLs
    if (result.discovered?.boligsiden && !boligsidenUrl) {
      document.getElementById(prefix + '-url-boligsiden').value = result.discovered.boligsiden;
    }
    if (result.discovered?.realtor && !maglerUrl) {
      document.getElementById(prefix + '-url-magler').value = result.discovered.realtor;
    }

    // Show property image
    if (d.imageUrl) {
      const imageWrap = document.getElementById(prefix + '-property-image');
      if (imageWrap) {
        imageWrap.innerHTML = `<img src="${d.imageUrl}" alt="Ejendomsbillede" onerror="this.parentElement.innerHTML=''">`;
      }
    }

    // Build preview
    let preview = '<div class="property-preview">';
    if (d.address) preview += previewRow('Adresse', d.address, true);
    if (d.price) preview += previewRow('Pris', fmt(d.price) + ' kr.');
    if (d.size) preview += previewRow('Boligareal', d.size + ' m²');
    if (d.lotSize) preview += previewRow('Grundareal', d.lotSize + ' m²');
    if (d.rooms) preview += previewRow('Værelser', d.rooms);
    if (d.yearBuilt) preview += previewRow('Byggeår', d.yearBuilt);
    if (d.propertyType) preview += previewRow('Boligtype', d.propertyType);
    if (d.energyLabel) preview += previewRow('Energimærke', d.energyLabel);
    if (d.monthlyExpense) preview += previewRow('Ejerudgift', fmt(d.monthlyExpense) + ' kr./md.');
    preview += '</div>';
    infoEl.innerHTML = preview;

    // Apply data to form
    applyFn(d);

    // Status message
    const sourceStr = (result.sources || []).join(' + ');
    const fields = Object.keys(d).filter(k => d[k] && !['description', 'imageUrl', 'currency'].includes(k));
    let msg = `Fandt ${fields.length} felter fra ${sourceStr}`;
    if (result.discovered?.boligsiden) msg += ' (boligsiden fundet automatisk)';
    if (result.discovered?.realtor) msg += ' (mæglerlink fundet automatisk)';
    statusEl.className = 'url-status success';
    statusEl.textContent = msg;
    showToast('Data hentet fra annonce!', 'success');

  } catch (err) {
    statusEl.className = 'url-status error';
    if (err.message === 'Failed to fetch') {
      statusEl.textContent = 'Kan ikke nå serveren. Start serveren med: node server.js';
    } else {
      statusEl.textContent = 'Fejl: ' + err.message;
    }
    showToast('Kunne ikke hente data.', 'error');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function previewRow(label, value, fullWidth) {
  return `<div class="preview-row${fullWidth ? ' full-width' : ''}">
    <span class="preview-label">${label}</span>
    <span class="preview-value">${value}</span>
  </div>`;
}

// Apply fetched data to rental form
function applyRentalData(d) {
  if (d.address) document.getElementById('r-name').value = d.address;
  if (d.price) document.getElementById('r-purchase').value = d.price;
  if (d.size) document.getElementById('r-size').value = d.size;
  if (d.rooms) document.getElementById('r-rooms').value = d.rooms;
  if (d.yearBuilt) document.getElementById('r-year-built').value = d.yearBuilt;
  calcRental();
}

// Apply fetched data to flip form
function applyFlipData(d) {
  if (d.address) document.getElementById('f-name').value = d.address;
  if (d.price) document.getElementById('f-purchase').value = d.price;
  calcFlip();
}

// Bind fetch buttons
document.getElementById('r-fetch').addEventListener('click', () => {
  fetchPropertyDual('r', applyRentalData);
});

document.getElementById('f-fetch').addEventListener('click', () => {
  fetchPropertyDual('f', applyFlipData);
});

// Allow Enter key in URL fields
['r-url-boligsiden', 'r-url-magler'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('r-fetch').click();
  });
});
['f-url-boligsiden', 'f-url-magler'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('f-fetch').click();
  });
});

// ── Keyboard Shortcuts ───────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab?.id === 'rental') document.getElementById('r-save').click();
    else if (activeTab?.id === 'flip') document.getElementById('f-save').click();
  }
});

// ── Print Preparation ────────────────────────────────────────────────
window.addEventListener('beforeprint', () => {
  const activeTab = document.querySelector('.tab-content.active');
  const prefix = activeTab?.id === 'flip' ? 'f' : 'r';
  const name = document.getElementById(prefix + '-name')?.value || '';
  document.getElementById('print-address').textContent = name;
  document.getElementById('print-date').textContent = new Date().toLocaleDateString('da-DK');
});

// ── Init ─────────────────────────────────────────────────────────────
addRentalUnit('', '');
restoreDrafts();
