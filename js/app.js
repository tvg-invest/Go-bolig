/* ===== Go Bolig - Ejendomsberegner ===== */

// ── Login Gate ──────────────────────────────────────────────────────
(function initLogin() {
  const SESSION_KEY = 'gobolig_session';
  const session = sessionStorage.getItem(SESSION_KEY);

  if (session === 'ok') {
    document.getElementById('login-screen').classList.add('hidden');
  } else {
    document.body.classList.add('locked');
  }

  document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');

    if (user === 'admin' && pass === 'gobolig') {
      sessionStorage.setItem(SESSION_KEY, 'ok');
      document.body.classList.remove('locked');
      document.getElementById('login-screen').classList.add('hidden');
      errorEl.textContent = '';
    } else {
      errorEl.textContent = 'Forkert brugernavn eller adgangskode.';
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
    }
  });
})();

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

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
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
let rentalCashFlowChart = null;
let rentalProjectionChart = null;

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
      <input type="text" class="unit-name" placeholder="Fx Stuen, 1. sal" value="${escHtml(name || '')}">
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
      <input type="text" class="reno-desc" placeholder="Fx Nyt køkken" value="${escHtml(desc || '')}">
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
      <input type="text" class="reno-desc" placeholder="Fx Badeværelse" value="${escHtml(desc || '')}">
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
    renderLoanComparison();
    return;
  }

  // Break-even calculation
  let breakEvenYears = null;
  if (equity > 0 && annualCashFlow > 0) {
    const rentGrowth = num('r-rent-increase') || 0;
    const expGrowth = num('r-expense-growth') || 0;
    let cumCF = 0, yrInc = annualNetIncome, yrOpex = annualOpex;
    for (let y = 1; y <= 30; y++) {
      yrInc *= (1 + rentGrowth / 100);
      yrOpex *= (1 + expGrowth / 100);
      const yrCF = yrInc - yrOpex - annualPayment;
      const prevCum = cumCF;
      cumCF += yrCF;
      if (cumCF >= equity) {
        const frac = (equity - prevCum) / yrCF;
        breakEvenYears = (y - 1) + frac;
        break;
      }
    }
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
  if (breakEvenYears !== null) html += kpiTile(breakEvenYears.toFixed(1) + ' år', 'Break-even');
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
      html += `<div class="result-row"><span class="label">${escHtml(u.name)}</span><span class="value">${fmt(u.rent * 12)} kr.</span></div>`;
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
        html += `<div class="result-row"><span class="label">${escHtml(desc)}</span><span class="value">${fmt(cost)} kr.</span></div>`;
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
    const expenseGrowth = num('r-expense-growth') || 0;
    html += buildProjectionTable(purchasePrice, loanAmt, rate, term, interestOnly, annualNetIncome, annualOpex, annualPayment, rentIncrease, appreciation, expenseGrowth, equity);
    html += '<div class="chart-wrap"><canvas id="r-projection-canvas"></canvas></div>';
  }

  // Amortization table
  if (loanAmt > 0 && rate > 0 && term > 0) {
    html += buildAmortizationTable(loanAmt, rate, term, interestOnly);
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

  // Update loan comparison when rental inputs change
  renderLoanComparison();
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
    if (rentalCashFlowChart) rentalCashFlowChart.destroy();
    rentalCashFlowChart = new Chart(cfCanvas, {
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
    const expenseGrowthChart = num('r-expense-growth') || 0;
    const years = 10;
    const cfData = [];
    const eqData = [];
    const lbls = [];
    let curRent = monthlyGrossIncome * 12;
    let curOpexChart = annualOpex;
    for (let y = 1; y <= years; y++) {
      curRent *= (1 + rentIncrease / 100);
      curOpexChart *= (1 + expenseGrowthChart / 100);
      const netInc = curRent * (1 - (vacancyPct || 0) / 100);
      const cf = netInc - curOpexChart - (calcMonthlyPayment(loanAmt, rate, term, interestOnly) * 12);
      const propVal = purchasePrice * Math.pow(1 + appreciation / 100, y);
      const remLoan = interestOnly ? loanAmt : Math.max(0, remainingBalance(loanAmt, rate, term, y * 12));
      const eq = propVal - remLoan;
      cfData.push(Math.round(cf));
      eqData.push(Math.round(eq));
      lbls.push('År ' + y);
    }

    if (rentalProjectionChart) rentalProjectionChart.destroy();
    rentalProjectionChart = new Chart(projCanvas, {
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
function buildProjectionTable(purchasePrice, loanAmt, rate, term, interestOnly, annualNetIncome, annualOpex, annualPayment, rentIncreasePct, appreciationPct, expenseGrowthPct, equity) {
  expenseGrowthPct = expenseGrowthPct || 0;
  equity = equity || 0;

  let html = '<div class="projection-section"><h3>10-års projektion</h3><div class="projection-scroll"><table class="projection-table"><thead><tr>';
  html += '<th>År</th><th>Ejendomsværdi</th><th>Rest lån</th><th>Egenkapital</th><th>Indtægt</th><th>Udgifter</th><th>Cash flow</th><th>Kumuleret CF</th>';
  html += '</tr></thead><tbody>';

  let curIncome = annualNetIncome;
  let curOpex = annualOpex;
  let cumCF = 0;
  let breakEvenHit = false;

  for (let y = 1; y <= 10; y++) {
    curIncome *= (1 + rentIncreasePct / 100);
    curOpex *= (1 + expenseGrowthPct / 100);
    const propVal = purchasePrice * Math.pow(1 + appreciationPct / 100, y);
    const remLoan = interestOnly ? loanAmt : Math.max(0, remainingBalance(loanAmt, rate, term, y * 12));
    const eq = propVal - remLoan;
    const cf = curIncome - curOpex - annualPayment;
    const prevCum = cumCF;
    cumCF += cf;

    const isBreakEven = equity > 0 && cumCF >= equity && prevCum < equity && !breakEvenHit;
    if (isBreakEven) breakEvenHit = true;

    html += `<tr class="${isBreakEven ? 'break-even-row' : ''}">
      <td>${y}${isBreakEven ? ' &#9733;' : ''}</td>
      <td>${fmt(propVal)}</td>
      <td>${fmt(remLoan)}</td>
      <td class="${cls(eq)}">${fmt(eq)}</td>
      <td>${fmt(curIncome)}</td>
      <td>${fmt(curOpex + annualPayment)}</td>
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
  const size = num('f-size');
  const holdMonths = num('f-hold-months');
  const holdTax = num('f-hold-tax');
  const holdInsurance = num('f-hold-insurance');
  const holdUtilities = num('f-hold-utilities');
  const holdOther = num('f-hold-other');
  const salePrice = num('f-sale-price');
  const saleCosts = num('f-sale-costs');

  // Financing: computed or manual
  const loanPct = num('f-loan-pct');
  const loanAmt = purchasePrice * (loanPct / 100);
  const rate = num('f-rate');
  const calcFinancing = loanAmt > 0 && rate > 0 ? loanAmt * (rate / 100 / 12) : 0;
  const manualHoldCost = num('f-hold-cost');
  const monthlyFinancing = manualHoldCost > 0 ? manualHoldCost : calcFinancing;
  const equity = purchasePrice + closingCosts - loanAmt;

  document.getElementById('f-loan-amount-calc').textContent =
    loanAmt > 0 ? fmt(loanAmt) + ' kr.' : '–';
  document.getElementById('f-payment-calc').textContent =
    calcFinancing > 0 ? fmt(Math.round(calcFinancing)) + ' kr.' : '–';

  let totalReno = 0;
  const renoItems = [];
  document.querySelectorAll('#f-reno-list .row-item').forEach(row => {
    const desc = row.querySelector('.reno-desc').value || 'Post';
    const cost = parseFloat(row.querySelector('.reno-cost').value) || 0;
    totalReno += cost;
    if (cost > 0) renoItems.push({ desc, cost });
  });

  const monthlyHoldCost = monthlyFinancing + holdTax + holdInsurance + holdUtilities + holdOther;
  const totalHoldingCost = monthlyHoldCost * holdMonths;
  const totalInvestment = purchasePrice + closingCosts + totalReno + totalHoldingCost;
  const netSalePrice = salePrice - saleCosts;
  const profit = netSalePrice - totalInvestment;
  const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
  const profitMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const breakEvenSale = totalInvestment + saleCosts;
  const pricePerSqm = (purchasePrice > 0 && size > 0) ? purchasePrice / size : 0;
  const profitPerSqm = (size > 0) ? profit / size : 0;
  const afterRepairValue = salePrice;
  const arvPerSqm = (afterRepairValue > 0 && size > 0) ? afterRepairValue / size : 0;

  if (purchasePrice === 0 && salePrice === 0 && totalReno === 0) {
    document.getElementById('f-results').innerHTML =
      '<p class="placeholder-text">Udfyld felterne for at se beregning.</p>';
    renderBudgetActual();
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
  if (salePrice > 0) html += kpiTile(profitMargin.toFixed(1) + '%', 'Profitmargin', profitMargin);
  if (equity > 0) html += kpiTile(fmt(Math.round(equity + totalReno)) + ' kr.', 'Egenkapital krævet');
  if (holdMonths > 0 && monthlyHoldCost > 0) html += kpiTile(fmt(Math.round(monthlyHoldCost)) + ' kr./md.', 'Mdl. cash burn');
  html += '</div>';

  // Charts row
  html += '<div class="flip-charts-row">';
  html += '<div class="chart-wrap"><canvas id="f-waterfall-canvas"></canvas></div>';
  html += '<div class="chart-wrap"><canvas id="f-breakdown-canvas"></canvas></div>';
  html += '</div>';

  // Purchase
  html += '<div class="result-section"><h3>Investering</h3>';
  html += `<div class="result-row"><span class="label">Købspris</span><span class="value">${fmt(purchasePrice)} kr.</span></div>`;
  if (closingCosts > 0) html += `<div class="result-row"><span class="label">Købsomkostninger</span><span class="value">${fmt(closingCosts)} kr.</span></div>`;
  if (totalReno > 0) html += `<div class="result-row"><span class="label">Renovering</span><span class="value">${fmt(totalReno)} kr.</span></div>`;
  if (totalHoldingCost > 0) html += `<div class="result-row"><span class="label">Holdeomkostninger (${holdMonths} md.)</span><span class="value">${fmt(totalHoldingCost)} kr.</span></div>`;
  html += `<div class="result-row total"><span class="label">Samlet investering</span><span class="value">${fmt(totalInvestment)} kr.</span></div>`;
  if (loanAmt > 0) html += `<div class="result-row"><span class="label">Heraf lånefinansieret</span><span class="value">${fmt(loanAmt)} kr.</span></div>`;
  if (equity > 0) html += `<div class="result-row"><span class="label">Egenkapital krævet (køb + reno)</span><span class="value">${fmt(Math.round(equity + totalReno))} kr.</span></div>`;
  html += '</div>';

  // Renovation detail
  if (renoItems.length > 0) {
    html += '<div class="result-section"><h3>Renovering - detaljer</h3>';
    renoItems.forEach(item => {
      html += `<div class="result-row"><span class="label">${escHtml(item.desc)}</span><span class="value">${fmt(item.cost)} kr.</span></div>`;
    });
    html += `<div class="result-row total"><span class="label">Total renovering</span><span class="value">${fmt(totalReno)} kr.</span></div>`;
    if (size > 0) html += `<div class="result-row"><span class="label">Renovering pr. m²</span><span class="value">${fmt(Math.round(totalReno / size))} kr.</span></div>`;
    html += '</div>';
  }

  // Holding costs detail
  if (holdMonths > 0 && totalHoldingCost > 0) {
    html += '<div class="result-section"><h3>Holdeomkostninger</h3>';
    if (monthlyFinancing > 0) html += `<div class="result-row"><span class="label">Finansiering</span><span class="value">${fmt(monthlyFinancing * holdMonths)} kr.</span></div>`;
    if (holdTax > 0) html += `<div class="result-row"><span class="label">Ejendomsskat</span><span class="value">${fmt(holdTax * holdMonths)} kr.</span></div>`;
    if (holdInsurance > 0) html += `<div class="result-row"><span class="label">Forsikring</span><span class="value">${fmt(holdInsurance * holdMonths)} kr.</span></div>`;
    if (holdUtilities > 0) html += `<div class="result-row"><span class="label">Forsyning</span><span class="value">${fmt(holdUtilities * holdMonths)} kr.</span></div>`;
    if (holdOther > 0) html += `<div class="result-row"><span class="label">Andet</span><span class="value">${fmt(holdOther * holdMonths)} kr.</span></div>`;
    html += `<div class="result-row total"><span class="label">Total (${holdMonths} md.)</span><span class="value">${fmt(totalHoldingCost)} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Mdl. cash burn</span><span class="value">${fmt(Math.round(monthlyHoldCost))} kr.</span></div>`;
    html += '</div>';
  }

  // Sale & value analysis
  html += '<div class="result-section"><h3>Salg & værdianalyse</h3>';
  html += `<div class="result-row"><span class="label">Salgspris</span><span class="value">${fmt(salePrice)} kr.</span></div>`;
  if (saleCosts > 0) html += `<div class="result-row"><span class="label">Salgsomkostninger</span><span class="value">-${fmt(saleCosts)} kr.</span></div>`;
  html += `<div class="result-row total"><span class="label">Netto salgspris</span><span class="value">${fmt(netSalePrice)} kr.</span></div>`;
  if (size > 0 && purchasePrice > 0) {
    html += `<div class="result-row"><span class="label">Købspris pr. m²</span><span class="value">${fmt(Math.round(pricePerSqm))} kr.</span></div>`;
    if (afterRepairValue > 0) html += `<div class="result-row"><span class="label">Salgspris pr. m² (ARV)</span><span class="value">${fmt(Math.round(arvPerSqm))} kr.</span></div>`;
  }
  if (purchasePrice > 0 && salePrice > 0) {
    const valueUplift = ((salePrice - purchasePrice) / purchasePrice) * 100;
    html += `<div class="result-row"><span class="label">Værdistigning</span><span class="value ${cls(valueUplift)}">${valueUplift.toFixed(1)}%</span></div>`;
  }
  if (totalInvestment > 0) html += `<div class="result-row"><span class="label">Break-even salgspris</span><span class="value">${fmt(Math.round(breakEvenSale))} kr.</span></div>`;
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
  if (salePrice > 0) html += `<div class="result-row"><span class="label">Profitmargin</span><span class="value ${cls(profitMargin)}">${profitMargin.toFixed(1)}%</span></div>`;
  if (size > 0) html += `<div class="result-row"><span class="label">Fortjeneste pr. m²</span><span class="value ${cls(profitPerSqm)}">${fmtSigned(Math.round(profitPerSqm))} kr.</span></div>`;

  // Tax estimation
  if (profit > 0) {
    const taxType = document.getElementById('f-tax-type')?.value || 'person';
    let taxAmount, taxLabel;
    if (taxType === 'person') {
      const BRACKET = 600000;
      if (profit > BRACKET) {
        taxAmount = Math.round(BRACKET * 0.37 + (profit - BRACKET) * 0.52);
        taxLabel = '37%/52%';
      } else {
        taxAmount = Math.round(profit * 0.37);
        taxLabel = '37%';
      }
    } else {
      taxAmount = Math.round(profit * 0.22);
      taxLabel = '22%';
    }
    const afterTax = profit - taxAmount;
    document.getElementById('f-tax-amount').textContent = fmt(taxAmount) + ' kr. (' + taxLabel + ')';
    document.getElementById('f-profit-after-tax').textContent = fmt(afterTax) + ' kr.';
    document.getElementById('f-profit-after-tax').className = 'computed-val ' + cls(afterTax);

    html += `<div class="result-row"><span class="label">Estimeret skat (${taxLabel})</span><span class="value negative">-${fmt(taxAmount)} kr.</span></div>`;
    html += `<div class="result-row highlight"><span class="label">Profit efter skat</span><span class="value ${cls(afterTax)}">${fmtSigned(afterTax)} kr.</span></div>`;
  } else {
    document.getElementById('f-tax-amount').textContent = '–';
    document.getElementById('f-profit-after-tax').textContent = '–';
    document.getElementById('f-profit-after-tax').className = 'computed-val';
  }
  html += '</div>';

  // Monthly timeline
  if (holdMonths > 0 && holdMonths <= 24) {
    html += buildFlipTimeline(purchasePrice, closingCosts, totalReno, monthlyFinancing, holdTax, holdInsurance, holdUtilities, holdOther, holdMonths);
  }

  // Sensitivity
  if (salePrice > 0 && totalInvestment > 0) {
    html += buildFlipSensitivity(purchasePrice, closingCosts, totalReno, totalHoldingCost, salePrice, saleCosts);
  }

  document.getElementById('f-results').innerHTML = html;

  // Waterfall chart
  renderFlipChart(purchasePrice, closingCosts, totalReno, totalHoldingCost, saleCosts, salePrice, profit);
  // Breakdown doughnut
  renderFlipBreakdown(purchasePrice, closingCosts, totalReno, totalHoldingCost, saleCosts);

  // Animate KPIs
  document.querySelectorAll('#f-results .kpi-tile').forEach(t => {
    t.classList.add('updating');
    t.addEventListener('animationend', () => t.classList.remove('updating'), { once: true });
  });

  saveDraft('flip');

  // Update budget-actual when flip data changes
  renderBudgetActual();
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

// ── Flip Breakdown Chart ─────────────────────────────────────────────
let flipBreakdownChart = null;

function renderFlipBreakdown(purchasePrice, closingCosts, totalReno, totalHoldingCost, saleCosts) {
  const canvas = document.getElementById('f-breakdown-canvas');
  if (!canvas) return;
  if (flipBreakdownChart) flipBreakdownChart.destroy();
  const c = getChartColors();

  const labels = [];
  const data = [];
  const colors = ['#3182ce', '#805ad5', '#dd6b20', '#e53e3e', '#38a169'];
  if (purchasePrice > 0) { labels.push('Købspris'); data.push(purchasePrice); }
  if (closingCosts > 0) { labels.push('Omk.'); data.push(closingCosts); }
  if (totalReno > 0) { labels.push('Renovering'); data.push(totalReno); }
  if (totalHoldingCost > 0) { labels.push('Holdeomk.'); data.push(totalHoldingCost); }
  if (saleCosts > 0) { labels.push('Salgsomk.'); data.push(saleCosts); }

  if (data.length === 0) return;

  flipBreakdownChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Omkostningsfordeling', color: c.text, font: { size: 12 } },
        legend: { position: 'bottom', labels: { color: c.text, font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
              const pct = total > 0 ? (ctx.raw / total * 100).toFixed(1) : 0;
              return ctx.label + ': ' + fmt(ctx.raw) + ' kr. (' + pct + '%)';
            }
          }
        }
      }
    }
  });
}

// ── Flip Monthly Timeline ───────────────────────────────────────────
function buildFlipTimeline(purchasePrice, closingCosts, totalReno, monthlyFinancing, holdTax, holdInsurance, holdUtilities, holdOther, holdMonths) {
  const monthlyBurn = monthlyFinancing + holdTax + holdInsurance + holdUtilities + holdOther;
  const upfrontCost = purchasePrice + closingCosts + totalReno;

  let html = '<div class="result-section"><h3>Holdeperiode - tidslinje</h3>';
  html += '<div class="projection-scroll"><table class="projection-table"><thead><tr>';
  html += '<th>Md.</th><th>Finansiering</th><th>Skat</th><th>Forsikring</th><th>Forsyning</th><th>Andet</th><th>Mdl. total</th><th>Kumuleret</th>';
  html += '</tr></thead><tbody>';

  let cumulative = upfrontCost;
  for (let m = 1; m <= holdMonths; m++) {
    cumulative += monthlyBurn;
    html += '<tr>';
    html += `<td>${m}</td>`;
    html += `<td>${monthlyFinancing > 0 ? fmt(Math.round(monthlyFinancing)) : '–'}</td>`;
    html += `<td>${holdTax > 0 ? fmt(holdTax) : '–'}</td>`;
    html += `<td>${holdInsurance > 0 ? fmt(holdInsurance) : '–'}</td>`;
    html += `<td>${holdUtilities > 0 ? fmt(holdUtilities) : '–'}</td>`;
    html += `<td>${holdOther > 0 ? fmt(holdOther) : '–'}</td>`;
    html += `<td><strong>${fmt(Math.round(monthlyBurn))}</strong></td>`;
    html += `<td>${fmt(Math.round(cumulative))}</td>`;
    html += '</tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
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
 'r-rent-increase', 'r-appreciation', 'r-expense-growth'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcRental);
});
document.getElementById('r-interest-only')?.addEventListener('change', calcRental);

['f-purchase', 'f-closing', 'f-size', 'f-rooms', 'f-year-built',
 'f-loan-pct', 'f-rate', 'f-hold-months', 'f-hold-cost',
 'f-hold-tax', 'f-hold-insurance', 'f-hold-utilities', 'f-hold-other',
 'f-sale-price', 'f-sale-costs'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcFlip);
});

// ── Auto-save Draft ──────────────────────────────────────────────────
const draftTimers = { rental: null, flip: null };

function saveDraft(type) {
  clearTimeout(draftTimers[type]);
  draftTimers[type] = setTimeout(() => {
    try {
      if (type === 'rental') {
        localStorage.setItem('gobolig_draft_rental', JSON.stringify(gatherRentalData()));
      } else {
        localStorage.setItem('gobolig_draft_flip', JSON.stringify(gatherFlipData()));
      }
    } catch (e) { /* quota exceeded – silently skip draft save */ }
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
  try {
    localStorage.setItem('gobolig_properties', JSON.stringify(props));
  } catch (e) {
    showToast('Kunne ikke gemme – lager er fyldt. Slet gamle ejendomme.', 'error');
  }
}

// ── Due Diligence Progress ──────────────────────────────────────────
function updateDDProgress(section) {
  const checks = document.querySelectorAll(`.dd-check[data-section="${section}"]`);
  const done = document.querySelectorAll(`.dd-check[data-section="${section}"]:checked`).length;
  const total = checks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const el = document.getElementById(section + '-dd-progress');
  if (el) {
    el.innerHTML = `${done} af ${total} udført (${pct}%)
      <div class="dd-bar"><div class="dd-bar-fill" style="width:${pct}%"></div></div>`;
  }
}

// ── Amortization Table (Rental) ─────────────────────────────────────
function buildAmortizationTable(loanAmt, rate, term, interestOnly) {
  if (!loanAmt || !rate || !term) return '';
  const monthlyRate = rate / 100 / 12;
  const monthlyPmt = interestOnly ? loanAmt * monthlyRate : calcMonthlyPayment(loanAmt, rate, term, false);

  let html = '<div class="result-section"><h3>Afdragstabel (årligt)</h3>';
  html += '<div class="projection-scroll"><table class="projection-table"><thead><tr>';
  html += '<th>År</th><th>Ydelse</th><th>Rente</th><th>Afdrag</th><th>Rest lån</th>';
  html += '</tr></thead><tbody>';

  let balance = loanAmt;
  for (let y = 1; y <= Math.min(term, 30); y++) {
    let yearInterest = 0, yearPrincipal = 0;
    for (let m = 0; m < 12; m++) {
      const interest = balance * monthlyRate;
      const principal = interestOnly ? 0 : Math.min(monthlyPmt - interest, balance);
      yearInterest += interest;
      yearPrincipal += principal;
      balance = Math.max(0, balance - principal);
    }
    html += `<tr>
      <td>${y}</td>
      <td>${fmt(Math.round(monthlyPmt * 12))}</td>
      <td>${fmt(Math.round(yearInterest))}</td>
      <td>${fmt(Math.round(yearPrincipal))}</td>
      <td>${fmt(Math.round(balance))}</td>
    </tr>`;
    if (balance <= 0) break;
  }

  html += '</tbody></table></div></div>';
  return html;
}

// ── Gather / Load Data ──────────────────────────────────────────────
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
    expenseGrowth: num('r-expense-growth'),
    notes: document.getElementById('r-notes').value,
    ddChecks: Array.from(document.querySelectorAll('.dd-check[data-section="r"]')).reduce((acc, cb, i) => { if (cb.checked) acc.push(i); return acc; }, []),
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
    size: num('f-size'),
    rooms: num('f-rooms'),
    yearBuilt: num('f-year-built'),
    loanPct: num('f-loan-pct'),
    rate: num('f-rate'),
    holdMonths: num('f-hold-months'),
    holdCost: num('f-hold-cost'),
    holdTax: num('f-hold-tax'),
    holdInsurance: num('f-hold-insurance'),
    holdUtilities: num('f-hold-utilities'),
    holdOther: num('f-hold-other'),
    salePrice: num('f-sale-price'),
    saleCosts: num('f-sale-costs'),
    notes: document.getElementById('f-notes').value,
    taxType: document.getElementById('f-tax-type')?.value || 'person',
    ddChecks: Array.from(document.querySelectorAll('.dd-check[data-section="f"]')).reduce((acc, cb, i) => { if (cb.checked) acc.push(i); return acc; }, []),
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
  document.getElementById('r-expense-growth').value = data.expenseGrowth ?? 2;
  document.getElementById('r-notes').value = data.notes || '';

  document.getElementById('r-units-list').innerHTML = '';
  (data.units || []).forEach(u => addRentalUnit(u.name, u.rent));

  document.getElementById('r-reno-list').innerHTML = '';
  (data.reno || []).forEach(r => addRentalReno(r.desc, r.cost));

  // Restore DD checks
  const rChecks = document.querySelectorAll('.dd-check[data-section="r"]');
  rChecks.forEach(cb => cb.checked = false);
  (data.ddChecks || []).forEach(i => { if (rChecks[i]) rChecks[i].checked = true; });
  updateDDProgress('r');

  calcRental();
}

function loadFlipData(data) {
  if (window.resetScenarioBase) window.resetScenarioBase();
  document.getElementById('f-name').value = data.name || '';
  document.getElementById('f-purchase').value = data.purchase || '';
  document.getElementById('f-closing').value = data.closing || '';
  document.getElementById('f-size').value = data.size || '';
  document.getElementById('f-rooms').value = data.rooms || '';
  document.getElementById('f-year-built').value = data.yearBuilt || '';
  document.getElementById('f-loan-pct').value = data.loanPct ?? 80;
  document.getElementById('f-rate').value = data.rate ?? 4;
  document.getElementById('f-hold-months').value = data.holdMonths || '';
  document.getElementById('f-hold-cost').value = data.holdCost || '';
  document.getElementById('f-hold-tax').value = data.holdTax || '';
  document.getElementById('f-hold-insurance').value = data.holdInsurance || '';
  document.getElementById('f-hold-utilities').value = data.holdUtilities || '';
  document.getElementById('f-hold-other').value = data.holdOther || '';
  document.getElementById('f-sale-price').value = data.salePrice || '';
  document.getElementById('f-sale-costs').value = data.saleCosts || '';
  document.getElementById('f-notes').value = data.notes || '';

  document.getElementById('f-reno-list').innerHTML = '';
  (data.reno || []).forEach(r => addFlipReno(r.desc, r.cost));

  if (data.taxType) document.getElementById('f-tax-type').value = data.taxType;

  // Restore DD checks
  const fChecks = document.querySelectorAll('.dd-check[data-section="f"]');
  fChecks.forEach(cb => cb.checked = false);
  (data.ddChecks || []).forEach(i => { if (fChecks[i]) fChecks[i].checked = true; });
  updateDDProgress('f');

  calcFlip();
}

// Save buttons
function saveProperty(type) {
  const data = type === 'rental' ? gatherRentalData() : gatherFlipData();
  if (!data.name) { showToast('Angiv venligst et navn/adresse.', 'error'); return; }

  const props = getProperties();
  const editId = window._editingPropertyId;

  if (editId) {
    const idx = props.findIndex(x => x.id === editId);
    if (idx !== -1 && props[idx].type === type) {
      data.id = editId;
      data.savedAt = props[idx].savedAt;
      data.updatedAt = new Date().toISOString();
      props[idx] = data;
      saveProperties(props);
      window._editingPropertyId = null;
      showToast(`${data.name} opdateret!`, 'success');
      return;
    }
  }

  data.id = Date.now();
  data.savedAt = new Date().toISOString();
  props.push(data);
  saveProperties(props);
  window._editingPropertyId = null;
  showToast('Ejendom gemt!', 'success');
}

document.getElementById('r-save').addEventListener('click', () => saveProperty('rental'));
document.getElementById('f-save').addEventListener('click', () => saveProperty('flip'));

// Reset buttons
document.getElementById('r-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#rental input[type="number"], #rental input[type="text"]').forEach(el => el.value = '');
  document.getElementById('r-interest-only').checked = false;
  document.getElementById('r-notes').value = '';
  document.getElementById('r-units-list').innerHTML = '';
  document.getElementById('r-reno-list').innerHTML = '';
  document.getElementById('r-loan-compare-inputs').innerHTML = '';
  document.getElementById('r-loan-compare-results').innerHTML = '';
  document.getElementById('r-property-image').innerHTML = '';
  // Restore defaults
  document.getElementById('r-loan-pct').value = 80;
  document.getElementById('r-rate').value = 4;
  document.getElementById('r-term').value = 30;
  document.getElementById('r-rent-increase').value = 2;
  document.getElementById('r-appreciation').value = 2;
  document.getElementById('r-expense-growth').value = 2;
  document.querySelectorAll('.dd-check[data-section="r"]').forEach(cb => cb.checked = false);
  updateDDProgress('r');
  const rStatus = document.getElementById('r-url-status');
  if (rStatus) { rStatus.textContent = ''; rStatus.className = 'url-status'; }
  const rInfo = document.getElementById('r-url-info');
  if (rInfo) rInfo.innerHTML = '';
  localStorage.removeItem('gobolig_draft_rental');
  window._editingPropertyId = null;
  calcRental();
  addLoanCompareRow('Fastforrentet 30 år', 4, 30, false);
  addLoanCompareRow('Flexlån F5', 3, 30, false);
  showToast('Felter nulstillet.', 'info');
});

document.getElementById('f-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#flip input[type="number"], #flip input[type="text"]').forEach(el => el.value = '');
  document.getElementById('f-notes').value = '';
  document.getElementById('f-reno-list').innerHTML = '';
  document.getElementById('f-property-image').innerHTML = '';
  document.getElementById('f-loan-pct').value = 80;
  document.getElementById('f-rate').value = 4;
  document.querySelectorAll('.dd-check[data-section="f"]').forEach(cb => cb.checked = false);
  updateDDProgress('f');
  const fStatus = document.getElementById('f-url-status');
  if (fStatus) { fStatus.textContent = ''; fStatus.className = 'url-status'; }
  const fInfo = document.getElementById('f-url-info');
  if (fInfo) fInfo.innerHTML = '';
  if (window.resetScenarioBase) window.resetScenarioBase();
  localStorage.removeItem('gobolig_draft_flip');
  window._editingPropertyId = null;
  calcFlip();
  showToast('Felter nulstillet.', 'info');
});

// ── Saved Properties List ────────────────────────────────────────────
function renderSavedList() {
  renderPortfolioDashboard();
  const props = getProperties();
  const container = document.getElementById('saved-list');
  const compareBtn = document.getElementById('btn-compare');

  if (props.length === 0) {
    container.innerHTML = '<p class="placeholder-text">Ingen gemte ejendomme endnu.</p>';
    compareBtn.style.display = 'none';
    return;
  }

  compareBtn.style.display = props.length >= 2 ? '' : 'none';

  let html = '';
  props.forEach(p => {
    const date = new Date(p.savedAt).toLocaleDateString('da-DK');
    const typeBadge = p.type === 'rental'
      ? '<span class="type-badge rental">Udlejning</span>'
      : '<span class="type-badge flip">Flip</span>';

    let stats = '';
    let keyMetric = '';
    if (p.type === 'rental') {
      const m = computeRentalMetrics(p);
      stats = `<span>Husleje: <strong>${fmt(m.monthlyRent)} kr./md.</strong></span>
               <span>Købspris: <strong>${fmt(p.purchase)} kr.</strong></span>`;
      keyMetric = `<span class="saved-key-metric ${cls(m.cashFlowMonth)}">CF: ${fmtSigned(m.cashFlowMonth)} kr./md.</span>
                   <span class="saved-key-metric">Cap Rate: ${m.capRate.toFixed(1)}%</span>`;
    } else {
      const m = computeFlipMetrics(p);
      stats = `<span>Købspris: <strong>${fmt(p.purchase)} kr.</strong></span>
               <span>Renovering: <strong>${fmt(m.totalReno)} kr.</strong></span>
               <span>Salgspris: <strong>${fmt(m.salePrice)} kr.</strong></span>`;
      keyMetric = `<span class="saved-key-metric ${cls(m.profit)}">Profit: ${fmtSigned(m.profit)} kr.</span>
                   <span class="saved-key-metric ${cls(m.roi)}">ROI: ${m.roi.toFixed(1)}%</span>`;
    }

    const notesSnippet = p.notes ? `<div class="saved-meta" style="margin-top:0.25rem;font-style:italic">${escHtml(p.notes.substring(0, 80))}${p.notes.length > 80 ? '...' : ''}</div>` : '';

    html += `
      <div class="saved-card">
        <div class="saved-card-select">
          <input type="checkbox" class="compare-check" data-id="${p.id}" title="Vælg til sammenligning">
        </div>
        <div class="saved-card-info">
          <h3>${escHtml(p.name || 'Uden navn')}${typeBadge}</h3>
          <div class="saved-meta">Gemt ${date}${p.updatedAt ? ' &middot; Opdateret ' + new Date(p.updatedAt).toLocaleDateString('da-DK') : ''}</div>
          <div class="saved-stats">${stats}</div>
          <div class="saved-stats saved-key-metrics">${keyMetric}</div>
          ${notesSnippet}
        </div>
        <div class="saved-card-actions">
          <button class="btn-load" onclick="loadProperty(${p.id})">Indlæs</button>
          <button class="btn-update" onclick="updateProperty(${p.id})">Opdater</button>
          <button class="btn-dup" onclick="duplicateProperty(${p.id})">Dupliker</button>
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
  window._editingPropertyId = null;
  showToast(`${p.name} indlæst.`, 'success');
};

window.deleteProperty = function(id) {
  if (!confirm('Slet denne ejendom?')) return;
  const props = getProperties().filter(x => x.id !== id);
  saveProperties(props);
  document.getElementById('compare-container').innerHTML = '';
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
    if (d.imageUrl && /^https?:\/\//.test(d.imageUrl)) {
      const imageWrap = document.getElementById(prefix + '-property-image');
      if (imageWrap) {
        const img = document.createElement('img');
        img.src = d.imageUrl;
        img.alt = 'Ejendomsbillede';
        img.onerror = function() { this.parentElement.innerHTML = ''; };
        imageWrap.innerHTML = '';
        imageWrap.appendChild(img);
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
    <span class="preview-label">${escHtml(label)}</span>
    <span class="preview-value">${escHtml(String(value))}</span>
  </div>`;
}

// Apply fetched data to rental form
function applyRentalData(d) {
  if (d.address) document.getElementById('r-name').value = d.address;
  if (d.price) document.getElementById('r-purchase').value = d.price;
  if (d.size) document.getElementById('r-size').value = d.size;
  if (d.rooms) document.getElementById('r-rooms').value = d.rooms;
  if (d.yearBuilt) document.getElementById('r-year-built').value = d.yearBuilt;
  // Estimate expenses from monthlyExpense (ejerudgift)
  if (d.monthlyExpense && d.monthlyExpense > 0) {
    const annual = d.monthlyExpense * 12;
    // Rough split: ~40% tax, ~25% insurance, ~20% maintenance, ~15% other
    if (!num('r-tax')) document.getElementById('r-tax').value = Math.round(annual * 0.40);
    if (!num('r-insurance')) document.getElementById('r-insurance').value = Math.round(annual * 0.25);
    if (!num('r-maintenance')) document.getElementById('r-maintenance').value = Math.round(annual * 0.20);
  }
  calcRental();
}

// Apply fetched data to flip form
function applyFlipData(d) {
  if (d.address) document.getElementById('f-name').value = d.address;
  if (d.price) document.getElementById('f-purchase').value = d.price;
  if (d.size) document.getElementById('f-size').value = d.size;
  if (d.rooms) document.getElementById('f-rooms').value = d.rooms;
  if (d.yearBuilt) document.getElementById('f-year-built').value = d.yearBuilt;
  // Estimate holding costs from monthlyExpense
  if (d.monthlyExpense && d.monthlyExpense > 0) {
    if (!num('f-hold-tax')) document.getElementById('f-hold-tax').value = Math.round(d.monthlyExpense * 0.40);
    if (!num('f-hold-insurance')) document.getElementById('f-hold-insurance').value = Math.round(d.monthlyExpense * 0.25);
  }
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

// ── Property Comparison ──────────────────────────────────────────────
document.getElementById('btn-compare').addEventListener('click', () => {
  const checked = document.querySelectorAll('.compare-check:checked');
  const ids = Array.from(checked).map(c => parseInt(c.dataset.id));

  if (ids.length < 2) {
    showToast('Vælg mindst 2 ejendomme at sammenligne.', 'error');
    return;
  }

  const props = getProperties();
  const selected = ids.map(id => props.find(p => p.id === id)).filter(Boolean);

  renderComparison(selected);
});

function computeRentalMetrics(p) {
  const loanAmt = p.purchase * ((p.loanPct ?? 80) / 100);
  const monthlyRent = (p.units || []).reduce((s, u) => s + u.rent, 0);
  const annualGross = monthlyRent * 12;
  const annualNet = annualGross * (1 - (p.vacancy || 0) / 100);
  const opex = (p.tax || 0) + (p.insurance || 0) + (p.maintenance || 0) + (p.admin || 0) + ((p.utilities || 0) * 12) + (p.other || 0);
  const pmt = calcMonthlyPayment(loanAmt, p.rate ?? 4, p.term ?? 30, p.interestOnly) * 12;
  const totalReno = (p.reno || []).reduce((s, r) => s + r.cost, 0);
  const totalInv = p.purchase + (p.closing || 0) + totalReno;
  const equity = totalInv - loanAmt;
  const noi = annualNet - opex;
  const cashFlow = noi - pmt;

  return {
    name: p.name,
    type: 'Udlejning',
    purchase: p.purchase,
    monthlyRent,
    annualNet,
    opex,
    annualPayment: pmt,
    cashFlowYear: cashFlow,
    cashFlowMonth: cashFlow / 12,
    totalInvestment: totalInv,
    equity,
    grossYield: p.purchase > 0 ? (annualGross / p.purchase) * 100 : 0,
    netYield: p.purchase > 0 ? (noi / p.purchase) * 100 : 0,
    capRate: p.purchase > 0 ? (noi / p.purchase) * 100 : 0,
    cashOnCash: equity > 0 ? (cashFlow / equity) * 100 : 0,
    dscr: pmt > 0 ? noi / pmt : 0,
    pricePerSqm: (p.purchase > 0 && p.size > 0) ? p.purchase / p.size : 0,
  };
}

function computeFlipMetrics(p) {
  const totalReno = (p.reno || []).reduce((s, r) => s + r.cost, 0);
  // Financing: computed or manual
  const loanAmt = p.purchase * ((p.loanPct ?? 80) / 100);
  const calcFin = (loanAmt > 0 && (p.rate ?? 0) > 0) ? loanAmt * ((p.rate ?? 4) / 100 / 12) : 0;
  const monthlyFin = (p.holdCost || 0) > 0 ? (p.holdCost || 0) : calcFin;
  const holdCost = (monthlyFin + (p.holdTax || 0) + (p.holdInsurance || 0) + (p.holdUtilities || 0) + (p.holdOther || 0)) * (p.holdMonths || 0);
  const totalInv = p.purchase + (p.closing || 0) + totalReno + holdCost;
  const netSale = (p.salePrice || 0) - (p.saleCosts || 0);
  const profit = netSale - totalInv;
  const roi = totalInv > 0 ? (profit / totalInv) * 100 : 0;
  const profitMargin = (p.salePrice || 0) > 0 ? (profit / p.salePrice) * 100 : 0;
  const profitPerSqm = (p.size || 0) > 0 ? profit / p.size : 0;

  return {
    name: p.name,
    type: 'Flip',
    purchase: p.purchase,
    totalReno,
    holdCost,
    totalInvestment: totalInv,
    salePrice: p.salePrice || 0,
    profit,
    roi,
    annualizedRoi: (() => { if (p.holdMonths > 0 && totalInv > 0) { const r = (Math.pow(1 + profit / totalInv, 12 / p.holdMonths) - 1) * 100; return isFinite(r) ? r : 0; } return 0; })(),
    profitMargin,
    profitPerSqm,
  };
}

function renderComparison(selected) {
  const container = document.getElementById('compare-container');

  // Compute metrics for all
  const metrics = selected.map(p => p.type === 'rental' ? computeRentalMetrics(p) : computeFlipMetrics(p));
  const allRental = metrics.every(m => m.type === 'Udlejning');
  const allFlip = metrics.every(m => m.type === 'Flip');

  let html = '<div class="compare-card"><h3>Sammenligning</h3><div class="compare-scroll"><table class="compare-table">';

  // Header
  html += '<thead><tr><th></th>';
  metrics.forEach(m => { html += `<th>${escHtml(m.name || 'Ejendom')}</th>`; });
  html += '</tr></thead><tbody>';

  // Helper to add row with best-highlighting
  function addRow(label, values, opts = {}) {
    const { format = 'kr', higherBetter = true, decimals = 0 } = opts;
    const nums = values.map(v => typeof v === 'number' ? v : 0);
    const best = higherBetter ? Math.max(...nums) : Math.min(...nums.filter(n => n > 0));

    html += `<tr><th>${label}</th>`;
    values.forEach((v, i) => {
      let formatted;
      if (format === 'kr') formatted = fmt(v) + ' kr.';
      else if (format === 'pct') formatted = v.toFixed(decimals || 1) + '%';
      else if (format === 'num') formatted = v.toFixed(decimals);
      else formatted = String(v);

      const isBest = nums[i] === best && nums.filter(n => n === best).length < nums.length;
      html += `<td class="${isBest ? 'best' : ''}">${formatted}</td>`;
    });
    html += '</tr>';
  }

  // Common rows
  addRow('Købspris', metrics.map(m => m.purchase), { higherBetter: false });
  addRow('Samlet investering', metrics.map(m => m.totalInvestment), { higherBetter: false });

  if (allRental) {
    addRow('Mdl. husleje', metrics.map(m => m.monthlyRent));
    addRow('Mdl. cash flow', metrics.map(m => m.cashFlowMonth));
    addRow('Årligt cash flow', metrics.map(m => m.cashFlowYear));
    addRow('Bruttoafkast', metrics.map(m => m.grossYield), { format: 'pct' });
    addRow('Cap Rate', metrics.map(m => m.capRate), { format: 'pct' });
    addRow('Cash-on-cash', metrics.map(m => m.cashOnCash), { format: 'pct' });
    addRow('DSCR', metrics.map(m => m.dscr), { format: 'num', decimals: 2 });
    addRow('Pris/m²', metrics.map(m => m.pricePerSqm), { higherBetter: false });
  } else if (allFlip) {
    addRow('Renovering', metrics.map(m => m.totalReno), { higherBetter: false });
    addRow('Holdeomkostninger', metrics.map(m => m.holdCost), { higherBetter: false });
    addRow('Salgspris', metrics.map(m => m.salePrice));
    addRow('Fortjeneste', metrics.map(m => m.profit));
    addRow('ROI', metrics.map(m => m.roi), { format: 'pct' });
    addRow('Annualiseret ROI', metrics.map(m => m.annualizedRoi), { format: 'pct' });
    addRow('Profitmargin', metrics.map(m => m.profitMargin), { format: 'pct' });
    if (metrics.some(m => m.profitPerSqm)) addRow('Fortjeneste/m²', metrics.map(m => m.profitPerSqm));
  } else {
    // Mixed - show what we can
    addRow('Type', metrics.map(m => m.type), { format: 'text' });
    if (metrics.some(m => m.cashFlowMonth !== undefined)) addRow('Mdl. cash flow', metrics.map(m => m.cashFlowMonth || 0));
    if (metrics.some(m => m.profit !== undefined)) addRow('Fortjeneste', metrics.map(m => m.profit || 0));
  }

  html += '</tbody></table></div></div>';
  container.innerHTML = html;
  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── PDF Export ───────────────────────────────────────────────────────
function exportPDF(prefix) {
  const resultsEl = document.getElementById(prefix + '-results');
  if (!resultsEl || resultsEl.querySelector('.placeholder-text')) {
    showToast('Udfyld felterne først.', 'error');
    return;
  }

  const name = document.getElementById(prefix + '-name')?.value || 'Ejendom';
  const date = new Date().toLocaleDateString('da-DK');

  // Build exportable content
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'font-family:Inter,sans-serif;color:#1a202c;padding:20px;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'border-bottom:2px solid #1a365d;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:baseline;';
  header.innerHTML = `<div style="font-size:16px;font-weight:700;color:#1a365d;">Go Bolig - Investeringsrapport</div><div style="font-size:11px;color:#718096;">${name} &mdash; ${date}</div>`;
  wrapper.appendChild(header);

  // Clone results
  const clone = resultsEl.cloneNode(true);
  // Remove canvases (they don't export well in html2pdf, use the table data instead)
  clone.querySelectorAll('canvas').forEach(c => c.remove());
  clone.querySelectorAll('.chart-wrap, .chart-row').forEach(c => c.remove());
  wrapper.appendChild(clone);

  // Notes
  const notes = document.getElementById(prefix + '-notes')?.value;
  if (notes) {
    const notesDiv = document.createElement('div');
    notesDiv.style.cssText = 'margin-top:16px;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;';
    notesDiv.innerHTML = `<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:#718096;margin-bottom:4px;">Noter</div><div>${escHtml(notes).replace(/\n/g, '<br>')}</div>`;
    wrapper.appendChild(notesDiv);
  }

  const btn = document.getElementById(prefix + '-export-pdf');
  btn.disabled = true;
  btn.textContent = '...';

  html2pdf().set({
    margin: [10, 10, 10, 10],
    filename: name.replace(/[^a-zA-Z0-9æøåÆØÅ\s-]/g, '') + ' - Go Bolig.pdf',
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(wrapper).save().then(() => {
    btn.disabled = false;
    btn.textContent = 'PDF';
    showToast('PDF downloadet!', 'success');
  });
}

document.getElementById('r-export-pdf').addEventListener('click', () => exportPDF('r'));
document.getElementById('f-export-pdf').addEventListener('click', () => exportPDF('f'));

// ── Excel Export ─────────────────────────────────────────────────────
function exportExcel(prefix) {
  if (typeof XLSX === 'undefined') {
    showToast('Excel-bibliotek indlæses...', 'info');
    return;
  }

  const name = document.getElementById(prefix + '-name')?.value || 'Ejendom';
  const date = new Date().toLocaleDateString('da-DK');
  const wb = XLSX.utils.book_new();

  if (prefix === 'r') {
    // Rental Excel
    const data = gatherRentalData();
    const loanAmt = data.purchase * ((data.loanPct ?? 80) / 100);
    const monthlyRent = (data.units || []).reduce((s, u) => s + u.rent, 0);
    const annualGross = monthlyRent * 12;
    const annualNet = annualGross * (1 - (data.vacancy || 0) / 100);
    const opex = (data.tax || 0) + (data.insurance || 0) + (data.maintenance || 0) + (data.admin || 0) + ((data.utilities || 0) * 12) + (data.other || 0);
    const pmt = calcMonthlyPayment(loanAmt, data.rate ?? 4, data.term ?? 30, data.interestOnly) * 12;
    const totalReno = (data.reno || []).reduce((s, r) => s + r.cost, 0);
    const totalInv = data.purchase + (data.closing || 0) + totalReno;
    const equity = totalInv - loanAmt;
    const noi = annualNet - opex;
    const cf = noi - pmt;

    // Sheet 1: Overblik
    const summary = [
      ['Go Bolig - Investeringsrapport', '', date],
      [name],
      [],
      ['Nøgletal', 'Værdi'],
      ['Købspris', data.purchase],
      ['Samlet investering', totalInv],
      ['Lån', loanAmt],
      ['Egenkapital', equity],
      ['Mdl. husleje', monthlyRent],
      ['Årlig netto indtægt', annualNet],
      ['Årlige driftsudgifter', opex],
      ['Årlig ydelse', pmt],
      ['Årligt cash flow', cf],
      ['Mdl. cash flow', cf / 12],
      [],
      ['Afkast', '%'],
      ['Bruttoafkast', data.purchase > 0 ? +(annualGross / data.purchase * 100).toFixed(1) : 0],
      ['Cap Rate', data.purchase > 0 ? +(noi / data.purchase * 100).toFixed(1) : 0],
      ['Cash-on-cash', equity > 0 ? +(cf / equity * 100).toFixed(1) : 0],
      ['DSCR', pmt > 0 ? +(noi / pmt).toFixed(2) : 0],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Overblik');

    // Sheet 2: Likviditetsbudget
    const budget = [
      ['Likviditetsbudget', name],
      [],
      ['Indtægter', 'Årligt'],
    ];
    (data.units || []).forEach(u => {
      if (u.rent > 0) budget.push([u.name || 'Lejemål', u.rent * 12]);
    });
    budget.push(['Brutto lejeindtægt', annualGross]);
    if (data.vacancy) budget.push(['Tomgang (' + data.vacancy + '%)', -annualGross * data.vacancy / 100]);
    budget.push(['Netto lejeindtægt', annualNet]);
    budget.push([]);
    budget.push(['Udgifter', 'Årligt']);
    if (pmt > 0) budget.push(['Ydelse på lån', pmt]);
    if (data.tax) budget.push(['Ejendomsskat', data.tax]);
    if (data.insurance) budget.push(['Forsikring', data.insurance]);
    if (data.maintenance) budget.push(['Vedligeholdelse', data.maintenance]);
    if (data.admin) budget.push(['Administration', data.admin]);
    if (data.utilities) budget.push(['Forsyning/drift', data.utilities * 12]);
    if (data.other) budget.push(['Andet', data.other]);
    budget.push(['Total udgifter', opex + pmt]);
    budget.push([]);
    budget.push(['Cash flow', cf]);
    const ws2 = XLSX.utils.aoa_to_sheet(budget);
    ws2['!cols'] = [{ wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Likviditetsbudget');

    // Sheet 3: 10-års projektion
    const proj = [['År', 'Ejendomsværdi', 'Rest lån', 'Egenkapital', 'Indtægt', 'Udgifter', 'Cash flow', 'Kumuleret CF']];
    let curInc = annualNet;
    let curOpexExcel = opex;
    let cumCF = 0;
    const ri = data.rentIncrease || 0;
    const ap = data.appreciation || 0;
    const eg = data.expenseGrowth || 0;
    for (let y = 1; y <= 10; y++) {
      curInc *= (1 + ri / 100);
      curOpexExcel *= (1 + eg / 100);
      const pv = data.purchase * Math.pow(1 + ap / 100, y);
      const rl = data.interestOnly ? loanAmt : Math.max(0, remainingBalance(loanAmt, data.rate ?? 4, data.term ?? 30, y * 12));
      const yCF = curInc - curOpexExcel - pmt;
      cumCF += yCF;
      proj.push([y, Math.round(pv), Math.round(rl), Math.round(pv - rl), Math.round(curInc), Math.round(curOpexExcel + pmt), Math.round(yCF), Math.round(cumCF)]);
    }
    const ws3 = XLSX.utils.aoa_to_sheet(proj);
    ws3['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, '10-års projektion');

  } else {
    // Flip Excel - 3 sheets
    const data = gatherFlipData();
    const totalReno = (data.reno || []).reduce((s, r) => s + r.cost, 0);
    const loanAmt = data.purchase * ((data.loanPct ?? 80) / 100);
    const calcFin = (loanAmt > 0 && (data.rate ?? 0) > 0) ? loanAmt * ((data.rate ?? 4) / 100 / 12) : 0;
    const monthlyFin = (data.holdCost || 0) > 0 ? (data.holdCost || 0) : calcFin;
    const monthlyBurn = monthlyFin + (data.holdTax || 0) + (data.holdInsurance || 0) + (data.holdUtilities || 0) + (data.holdOther || 0);
    const holdCost = monthlyBurn * (data.holdMonths || 0);
    const totalInv = data.purchase + (data.closing || 0) + totalReno + holdCost;
    const equity = data.purchase + (data.closing || 0) - loanAmt + totalReno;
    const netSale = (data.salePrice || 0) - (data.saleCosts || 0);
    const profit = netSale - totalInv;
    const roi = totalInv > 0 ? (profit / totalInv * 100) : 0;
    const profitMargin = (data.salePrice || 0) > 0 ? (profit / data.salePrice * 100) : 0;
    const breakEven = totalInv + (data.saleCosts || 0);

    // Sheet 1: Overblik
    const summary = [
      ['Go Bolig - Flip-rapport', '', date],
      [name],
      [],
      ['Nøgletal', 'Værdi'],
      ['Købspris', data.purchase],
      ['Købsomkostninger', data.closing || 0],
      ['Renovering', totalReno],
      ['Holdeomkostninger', holdCost],
      ['Samlet investering', totalInv],
      [],
      ['Finansiering', ''],
      ['Lån', loanAmt],
      ['Egenkapital krævet', Math.round(equity)],
      [],
      ['Salg', ''],
      ['Salgspris', data.salePrice || 0],
      ['Salgsomkostninger', data.saleCosts || 0],
      ['Netto salgspris', netSale],
      ['Break-even salgspris', Math.round(breakEven)],
      [],
      ['Resultat', ''],
      ['Fortjeneste', profit],
      ['ROI', +(roi.toFixed(1)) + '%'],
      ['Profitmargin', +(profitMargin.toFixed(1)) + '%'],
    ];
    if (data.holdMonths > 0 && totalInv > 0) {
      const annRoi = (Math.pow(1 + profit / totalInv, 12 / data.holdMonths) - 1) * 100;
      if (isFinite(annRoi)) summary.push(['Annualiseret ROI', +(annRoi.toFixed(1)) + '%']);
    }
    if (data.size > 0) {
      summary.push([]);
      summary.push(['Arealanalyse', '']);
      summary.push(['Boligareal', data.size + ' m²']);
      summary.push(['Købspris pr. m²', Math.round(data.purchase / data.size)]);
      if (data.salePrice > 0) summary.push(['Salgspris pr. m²', Math.round(data.salePrice / data.size)]);
      summary.push(['Fortjeneste pr. m²', Math.round(profit / data.size)]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    ws1['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Overblik');

    // Sheet 2: Budget & Tidslinje
    const budget = [
      ['Budget & Holdeperiode', name],
      [],
      ['Renovering', 'Beløb'],
    ];
    (data.reno || []).forEach(r => { if (r.cost > 0) budget.push([r.desc || 'Post', r.cost]); });
    budget.push(['Total renovering', totalReno]);
    budget.push([]);
    if (data.holdMonths > 0) {
      budget.push(['Mdl. holdeomkostning', 'Beløb']);
      if (monthlyFin > 0) budget.push(['Finansiering', Math.round(monthlyFin)]);
      if (data.holdTax > 0) budget.push(['Ejendomsskat', data.holdTax]);
      if (data.holdInsurance > 0) budget.push(['Forsikring', data.holdInsurance]);
      if (data.holdUtilities > 0) budget.push(['Forsyning', data.holdUtilities]);
      if (data.holdOther > 0) budget.push(['Andet', data.holdOther]);
      budget.push(['Mdl. total', Math.round(monthlyBurn)]);
      budget.push([]);
      budget.push(['Md.', 'Mdl. omkostning', 'Kumuleret']);
      let cum = data.purchase + (data.closing || 0) + totalReno;
      for (let m = 1; m <= data.holdMonths; m++) {
        cum += monthlyBurn;
        budget.push([m, Math.round(monthlyBurn), Math.round(cum)]);
      }
    }
    const ws2 = XLSX.utils.aoa_to_sheet(budget);
    ws2['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Budget');

    // Sheet 3: Følsomhedsanalyse
    const sens = [['Følsomhedsanalyse - Fortjeneste'], []];
    const salePriceSteps = [-200000, -100000, 0, 100000, 200000];
    const renoSteps = [-50000, -25000, 0, 25000, 50000];
    sens.push(['Reno \\ Salgspris', ...salePriceSteps.map(s => (data.salePrice || 0) + s)]);
    renoSteps.forEach(ra => {
      const adjReno = totalReno + ra;
      if (adjReno < 0) return;
      const row = [adjReno];
      salePriceSteps.forEach(sp => {
        const adjSale = (data.salePrice || 0) + sp;
        const adjNet = adjSale - (data.saleCosts || 0);
        const adjInv = data.purchase + (data.closing || 0) + adjReno + holdCost;
        row.push(adjNet - adjInv);
      });
      sens.push(row);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(sens);
    ws3['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Følsomhed');
  }

  XLSX.writeFile(wb, name.replace(/[^a-zA-Z0-9æøåÆØÅ\s-]/g, '') + ' - Go Bolig.xlsx');
  showToast('Excel downloadet!', 'success');
}

document.getElementById('r-export-excel').addEventListener('click', () => exportExcel('r'));
document.getElementById('f-export-excel').addEventListener('click', () => exportExcel('f'));

// ── Portfolio Dashboard ──────────────────────────────────────────────
let portfolioAllocChart = null;
let portfolioReturnChart = null;

function renderPortfolioDashboard() {
  const props = getProperties();
  const container = document.getElementById('portfolio-dashboard');
  const rentals = props.filter(p => p.type === 'rental');
  const flips = props.filter(p => p.type === 'flip');

  if (props.length === 0) {
    container.innerHTML = '';
    return;
  }

  let totalValue = 0, totalEquity = 0, totalMonthlyCF = 0, totalMonthlyRent = 0;
  let totalFlipProfit = 0, totalFlipInvestment = 0;
  const allMetrics = [];

  rentals.forEach(p => {
    const m = computeRentalMetrics(p);
    totalValue += p.purchase;
    totalEquity += m.equity;
    totalMonthlyCF += m.cashFlowMonth;
    totalMonthlyRent += m.monthlyRent;
    allMetrics.push(m);
  });

  flips.forEach(p => {
    const m = computeFlipMetrics(p);
    totalFlipProfit += m.profit;
    totalFlipInvestment += m.totalInvestment;
    allMetrics.push(m);
  });

  let html = '<div class="portfolio-card"><h3>Porteføljeoverblik</h3><div class="portfolio-kpis">';
  html += `<div class="portfolio-kpi"><div class="pk-value">${props.length}</div><div class="pk-label">Ejendomme</div></div>`;

  if (rentals.length > 0) {
    html += `<div class="portfolio-kpi"><div class="pk-value">${fmt(totalValue)} kr.</div><div class="pk-label">Samlet værdi</div></div>`;
    html += `<div class="portfolio-kpi"><div class="pk-value">${fmt(totalEquity)} kr.</div><div class="pk-label">Samlet egenkapital</div></div>`;
    html += `<div class="portfolio-kpi"><div class="pk-value" style="color:${totalMonthlyCF >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSigned(totalMonthlyCF)} kr.</div><div class="pk-label">Mdl. cash flow</div></div>`;
    html += `<div class="portfolio-kpi"><div class="pk-value">${fmt(totalMonthlyRent)} kr.</div><div class="pk-label">Mdl. husleje</div></div>`;
  }

  if (flips.length > 0) {
    html += `<div class="portfolio-kpi"><div class="pk-value" style="color:${totalFlipProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSigned(totalFlipProfit)} kr.</div><div class="pk-label">Samlet flip-profit</div></div>`;
    if (totalFlipInvestment > 0) {
      const avgRoi = (totalFlipProfit / totalFlipInvestment * 100);
      html += `<div class="portfolio-kpi"><div class="pk-value">${avgRoi.toFixed(1)}%</div><div class="pk-label">Gns. flip ROI</div></div>`;
    }
  }

  html += '</div>';

  // Charts row (only when 2+ properties)
  if (props.length >= 2) {
    html += '<div class="portfolio-charts-row">';
    html += '<div class="chart-wrap"><canvas id="portfolio-alloc-canvas"></canvas></div>';
    html += '<div class="chart-wrap"><canvas id="portfolio-return-canvas"></canvas></div>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  // Render portfolio charts
  if (props.length >= 2) {
    const c = getChartColors();

    // Allocation doughnut
    const allocCanvas = document.getElementById('portfolio-alloc-canvas');
    if (allocCanvas) {
      if (portfolioAllocChart) portfolioAllocChart.destroy();
      const allocColors = ['#3182ce','#38a169','#dd6b20','#805ad5','#e53e3e','#d69e2e','#319795','#d53f8c'];
      portfolioAllocChart = new Chart(allocCanvas, {
        type: 'doughnut',
        data: {
          labels: allMetrics.map(m => m.name || 'Ejendom'),
          datasets: [{ data: allMetrics.map(m => m.totalInvestment || m.purchase), backgroundColor: allocColors.slice(0, allMetrics.length), borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Kapitalallokering', color: c.text, font: { size: 12 } },
            legend: { position: 'bottom', labels: { color: c.text, font: { size: 10 }, boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ctx.label + ': ' + fmt(ctx.raw) + ' kr.' } }
          }
        }
      });
    }

    // Returns bar chart
    const retCanvas = document.getElementById('portfolio-return-canvas');
    if (retCanvas) {
      if (portfolioReturnChart) portfolioReturnChart.destroy();
      const labels = allMetrics.map(m => m.name ? (m.name.length > 15 ? m.name.substring(0, 15) + '...' : m.name) : 'Ejendom');
      const returnValues = allMetrics.map(m => {
        if (m.type === 'Flip') return m.roi || 0;
        return m.cashOnCash || 0;
      });
      const colors = returnValues.map(v => v >= 0 ? '#38a169' : '#e53e3e');

      portfolioReturnChart = new Chart(retCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Afkast %', data: returnValues, backgroundColor: colors, borderRadius: 4, borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: { display: true, text: 'Afkast pr. ejendom (%)', color: c.text, font: { size: 12 } },
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => { const m = allMetrics[ctx.dataIndex]; return (m.type === 'Flip' ? 'ROI' : 'Cash-on-cash') + ': ' + ctx.raw.toFixed(1) + '%'; } } }
          },
          scales: {
            y: { ticks: { color: c.text, callback: v => v + '%' }, grid: { color: c.grid } },
            x: { ticks: { color: c.text, font: { size: 10 } }, grid: { display: false } }
          }
        }
      });
    }
  }
}

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

// ── AI Renovation Estimator ─────────────────────────────────────────
async function estimateRenovation(prefix, addRenoFn) {
  const room = document.getElementById(prefix + '-ai-room').value;
  const sqm = parseFloat(document.getElementById(prefix + '-ai-sqm').value) || 0;
  const quality = document.getElementById(prefix + '-ai-quality').value;
  const desc = document.getElementById(prefix + '-ai-desc').value.trim();
  const statusEl = document.getElementById(prefix + '-ai-status');
  const previewEl = document.getElementById(prefix + '-ai-preview');
  const btn = document.getElementById(prefix + '-ai-submit');

  if (!desc && sqm <= 0) {
    statusEl.className = 'url-status error';
    statusEl.textContent = 'Angiv areal og/eller beskrivelse.';
    return;
  }

  const yearBuilt = num(prefix === 'r' ? 'r-year-built' : 'f-year-built');
  const propertySize = num(prefix === 'r' ? 'r-size' : 'f-size');

  btn.disabled = true;
  btn.textContent = 'Estimerer...';
  statusEl.className = 'url-status';
  statusEl.textContent = 'AI analyserer priser...';
  previewEl.innerHTML = '';

  try {
    const resp = await fetch('/api/estimate-renovation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomType: room, squareMeters: sqm, qualityLevel: quality, description: desc, yearBuilt, propertySize })
    });

    const result = await resp.json();

    if (!result.success) {
      statusEl.className = 'url-status error';
      statusEl.textContent = result.error || 'Estimering fejlede.';
      return;
    }

    let html = '<table class="ai-preview-table">';
    html += '<thead><tr><th>Post</th><th>Materialer</th><th>Arbejdsløn</th><th>Total</th></tr></thead><tbody>';
    result.items.forEach(item => {
      html += `<tr><td>${escHtml(item.desc)}</td><td>${fmt(item.materialCost)} kr.</td><td>${fmt(item.laborCost)} kr.</td><td>${fmt(item.totalCost)} kr.</td></tr>`;
    });
    html += `<tr class="total-row"><td>I alt</td><td>${fmt(result.totalMaterial)} kr.</td><td>${fmt(result.totalLabor)} kr.</td><td><strong>${fmt(result.totalEstimate)} kr.</strong></td></tr>`;
    html += '</tbody></table>';
    if (result.notes) html += `<p class="hint" style="margin-top:0.4rem">${escHtml(result.notes)}</p>`;

    html += '<div class="ai-preview-actions">';
    html += `<button class="btn-save ai-apply-btn" id="${prefix}-ai-apply">Tilføj til renovering</button>`;
    html += `<button class="btn-reset ai-cancel-btn" id="${prefix}-ai-discard">Kassér</button>`;
    html += '</div>';

    previewEl.innerHTML = html;
    statusEl.className = 'url-status success';
    statusEl.textContent = `Estimat: ${fmt(result.totalEstimate)} kr.`;

    document.getElementById(prefix + '-ai-apply').addEventListener('click', () => {
      result.items.forEach(item => addRenoFn(item.desc, item.totalCost));
      previewEl.innerHTML = '';
      statusEl.textContent = '';
      showToast(`${result.items.length} renoveringsposter tilføjet.`, 'success');
    });

    document.getElementById(prefix + '-ai-discard').addEventListener('click', () => {
      previewEl.innerHTML = '';
      statusEl.textContent = '';
    });

  } catch (err) {
    statusEl.className = 'url-status error';
    statusEl.textContent = err.message === 'Failed to fetch' ? 'Kan ikke nå serveren.' : 'Fejl: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Beregn estimat';
  }
}

// AI toggle and submit handlers
['r', 'f'].forEach(prefix => {
  const toggleBtn = document.getElementById(prefix + '-ai-toggle');
  const form = document.getElementById(prefix + '-ai-form');
  if (toggleBtn && form) {
    toggleBtn.addEventListener('click', () => {
      const visible = form.style.display !== 'none';
      form.style.display = visible ? 'none' : 'block';
      toggleBtn.textContent = visible ? 'Estimer med AI' : 'Skjul AI-estimator';
    });
  }
  const cancelBtn = document.getElementById(prefix + '-ai-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      form.style.display = 'none';
      toggleBtn.textContent = 'Estimer med AI';
    });
  }
});

document.getElementById('r-ai-submit')?.addEventListener('click', () => estimateRenovation('r', addRentalReno));
document.getElementById('f-ai-submit')?.addEventListener('click', () => estimateRenovation('f', addFlipReno));

// ── Renovation Templates ────────────────────────────────────────────
document.querySelectorAll('#rental .btn-template').forEach(btn => {
  btn.addEventListener('click', () => {
    addRentalReno(btn.dataset.desc, btn.dataset.cost);
  });
});
document.querySelectorAll('#flip .btn-template').forEach(btn => {
  btn.addEventListener('click', () => {
    addFlipReno(btn.dataset.desc, btn.dataset.cost);
  });
});

// ── Estimate Sale Costs ─────────────────────────────────────────────
document.getElementById('f-estimate-sale-costs').addEventListener('click', () => {
  const salePrice = num('f-sale-price');
  if (salePrice <= 0) {
    showToast('Angiv salgspris først.', 'error');
    return;
  }
  // Typical Danish: ~1% mægler + ~0.5% tinglysning + diverse ~50.000
  const estimated = Math.round(salePrice * 0.02 + 50000);
  document.getElementById('f-sale-costs').value = estimated;
  calcFlip();
  showToast(`Estimeret: ${fmt(estimated)} kr. (2% + 50.000)`, 'info');
});

// ── Duplicate Property ──────────────────────────────────────────────
window.duplicateProperty = function(id) {
  const props = getProperties();
  const orig = props.find(x => x.id === id);
  if (!orig) return;
  const clone = JSON.parse(JSON.stringify(orig));
  clone.id = Date.now();
  clone.name = (clone.name || 'Ejendom') + ' (kopi)';
  clone.savedAt = new Date().toISOString();
  props.push(clone);
  saveProperties(props);
  renderSavedList();
  showToast('Kopi oprettet!', 'success');
};

// ── Tax Type Change ─────────────────────────────────────────────────
document.getElementById('f-tax-type')?.addEventListener('change', calcFlip);

// ── Scenario Analysis ───────────────────────────────────────────────
(function initScenarios() {
  let baseSalePrice = 0;
  let baseRenoValues = [];
  let baseHoldMonths = 0;
  let hasCaptured = false;

  function captureBase() {
    baseSalePrice = num('f-sale-price');
    baseRenoValues = [];
    document.querySelectorAll('#f-reno-list .row-item .reno-cost').forEach(el => {
      baseRenoValues.push(parseFloat(el.value) || 0);
    });
    baseHoldMonths = num('f-hold-months');
    hasCaptured = true;
  }

  function restoreBase() {
    document.getElementById('f-sale-price').value = baseSalePrice || '';
    const renoEls = document.querySelectorAll('#f-reno-list .row-item .reno-cost');
    renoEls.forEach((el, i) => {
      if (i < baseRenoValues.length) el.value = baseRenoValues[i] || '';
    });
    document.getElementById('f-hold-months').value = baseHoldMonths || '';
  }

  // Expose reset so loadFlipData/reset can clear stale base values
  window.resetScenarioBase = function() {
    hasCaptured = false;
    baseSalePrice = 0;
    baseRenoValues = [];
    baseHoldMonths = 0;
    document.querySelectorAll('.btn-scenario').forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-scenario[data-scenario="base"]').classList.add('active');
    const infoEl = document.getElementById('f-scenario-info');
    if (infoEl) infoEl.textContent = '';
  };

  document.querySelectorAll('.btn-scenario').forEach(btn => {
    btn.addEventListener('click', () => {
      const scenario = btn.dataset.scenario;
      const infoEl = document.getElementById('f-scenario-info');

      document.querySelectorAll('.btn-scenario').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (scenario === 'base') {
        if (hasCaptured) {
          restoreBase();
          calcFlip();
          infoEl.textContent = 'Base case gendannet.';
        } else {
          captureBase();
          infoEl.textContent = 'Base case - aktuelle værdier gemt som udgangspunkt.';
        }
        return;
      }

      // Auto-capture base on first scenario click
      if (!hasCaptured) captureBase();

      // Always apply from base values (not from current modified values)
      restoreBase();

      if (scenario === 'worst') {
        const newSale = Math.round(baseSalePrice * 0.90);
        document.getElementById('f-sale-price').value = newSale;
        const renoEls = document.querySelectorAll('#f-reno-list .row-item .reno-cost');
        renoEls.forEach((el, i) => {
          const base = i < baseRenoValues.length ? baseRenoValues[i] : 0;
          if (base > 0) el.value = Math.round(base * 1.15);
        });
        if (baseHoldMonths > 0) document.getElementById('f-hold-months').value = baseHoldMonths + 2;
        infoEl.textContent = 'Worst: salgspris -10%, renovering +15%, holdeperiode +2 md.';
      } else {
        const newSale = Math.round(baseSalePrice * 1.05);
        document.getElementById('f-sale-price').value = newSale;
        const renoEls = document.querySelectorAll('#f-reno-list .row-item .reno-cost');
        renoEls.forEach((el, i) => {
          const base = i < baseRenoValues.length ? baseRenoValues[i] : 0;
          if (base > 0) el.value = Math.round(base * 0.90);
        });
        if (baseHoldMonths > 1) document.getElementById('f-hold-months').value = Math.max(1, baseHoldMonths - 1);
        infoEl.textContent = 'Best: salgspris +5%, renovering -10%, holdeperiode -1 md.';
      }

      calcFlip();
    });
  });
})();

// ── Tinglysningsafgift ──────────────────────────────────────────────
function calcTinglysningsafgift(prefix) {
  const purchaseField = prefix + '-purchase';
  const closingField = prefix + '-closing';
  const purchase = num(purchaseField);
  if (purchase <= 0) {
    showToast('Angiv købspris først.', 'error');
    return;
  }
  const fee = Math.round(purchase * 0.006 + 1850);
  const current = num(closingField);
  document.getElementById(closingField).value = current + fee;
  if (prefix === 'r') calcRental();
  else if (prefix === 'f') calcFlip();
  else if (prefix === 'b') calcBRRRR();
  showToast(`Tinglysningsafgift: ${fmt(fee)} kr. tillagt`, 'info');
}

document.getElementById('r-auto-tinglysning').addEventListener('click', () => calcTinglysningsafgift('r'));
document.getElementById('f-auto-tinglysning').addEventListener('click', () => calcTinglysningsafgift('f'));
document.getElementById('b-auto-tinglysning').addEventListener('click', () => calcTinglysningsafgift('b'));

// ── Update (Edit) Saved Property ────────────────────────────────────
window.updateProperty = function(id) {
  const props = getProperties();
  const existing = props.find(x => x.id === id);
  if (!existing) return;

  // Load property into form, switch to correct tab, let user edit, then save
  if (existing.type === 'rental') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-tab="rental"]').classList.add('active');
    document.getElementById('rental').classList.add('active');
    loadRentalData(existing);
  } else {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-tab="flip"]').classList.add('active');
    document.getElementById('flip').classList.add('active');
    loadFlipData(existing);
  }

  // Mark this as the property being edited so save overwrites instead of creating new
  window._editingPropertyId = id;
  showToast(`${existing.name} indlæst til redigering. Tryk Gem når du er færdig.`, 'info');
};

// ── Backup / Restore ────────────────────────────────────────────────
let pendingImportData = null;

function exportBackup() {
  const backup = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('gobolig_')) {
      try { backup[key] = JSON.parse(localStorage.getItem(key)); } catch (e) { backup[key] = localStorage.getItem(key); }
    }
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  a.download = `go-bolig-backup-${date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
  showToast('Backup downloadet!', 'success');
}

function importBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.gobolig_properties && !Object.keys(data).some(k => k.startsWith('gobolig_'))) {
        showToast('Ugyldig backup-fil.', 'error');
        return;
      }
      pendingImportData = data;
      document.getElementById('import-choice').style.display = 'flex';
    } catch (err) {
      showToast('Kunne ikke læse filen.', 'error');
    }
  };
  reader.readAsText(file);
}

function applyImport(mode) {
  if (!pendingImportData) return;
  const data = pendingImportData;
  pendingImportData = null;
  document.getElementById('import-choice').style.display = 'none';

  if (mode === 'replace') {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('gobolig_')) keys.push(key);
    }
    keys.forEach(k => localStorage.removeItem(k));
    Object.entries(data).forEach(([key, val]) => {
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    });
    showToast('Alle data erstattet fra backup.', 'success');
  } else {
    // Merge
    const existing = getProperties();
    const existingIds = new Set(existing.map(p => p.id));
    const imported = Array.isArray(data.gobolig_properties) ? data.gobolig_properties : [];
    let added = 0;
    imported.forEach(p => {
      if (!existingIds.has(p.id)) {
        existing.push(p);
        added++;
      }
    });
    saveProperties(existing);
    // Also restore drafts if they exist and current ones are empty
    if (data.gobolig_draft_rental && !localStorage.getItem('gobolig_draft_rental')) {
      localStorage.setItem('gobolig_draft_rental', typeof data.gobolig_draft_rental === 'string' ? data.gobolig_draft_rental : JSON.stringify(data.gobolig_draft_rental));
    }
    if (data.gobolig_draft_flip && !localStorage.getItem('gobolig_draft_flip')) {
      localStorage.setItem('gobolig_draft_flip', typeof data.gobolig_draft_flip === 'string' ? data.gobolig_draft_flip : JSON.stringify(data.gobolig_draft_flip));
    }
    showToast(`${added} nye ejendomme tilføjet.`, 'success');
  }
  renderSavedList();
  document.getElementById('backup-file-input').value = '';
}

document.getElementById('btn-backup').addEventListener('click', exportBackup);
document.getElementById('backup-file-input').addEventListener('change', (e) => importBackup(e.target.files[0]));
document.getElementById('import-merge').addEventListener('click', () => applyImport('merge'));
document.getElementById('import-replace').addEventListener('click', () => applyImport('replace'));
document.getElementById('import-cancel').addEventListener('click', () => {
  pendingImportData = null;
  document.getElementById('import-choice').style.display = 'none';
  document.getElementById('backup-file-input').value = '';
});

// ── Loan Comparison ─────────────────────────────────────────────────
let loanCompareId = 0;

function addLoanCompareRow(name, rate, term, interestOnly) {
  loanCompareId++;
  const container = document.getElementById('r-loan-compare-inputs');
  const row = document.createElement('div');
  row.className = 'loan-compare-row';
  row.innerHTML = `
    <div class="field">
      <label>Navn</label>
      <input type="text" class="lc-name" value="${escHtml(name || '')}" placeholder="Fx Fastforrentet">
    </div>
    <div class="field">
      <label>Rente (%)</label>
      <input type="number" class="lc-rate" value="${rate || ''}" step="0.01">
    </div>
    <div class="field">
      <label>Løbetid (år)</label>
      <input type="number" class="lc-term" value="${term || ''}" step="1">
    </div>
    <div class="field checkbox-field">
      <label><input type="checkbox" class="lc-io" ${interestOnly ? 'checked' : ''}> Afdragsfri</label>
    </div>
    <button class="btn-remove" title="Fjern">&times;</button>
  `;
  container.appendChild(row);
  row.querySelector('.btn-remove').addEventListener('click', () => { row.remove(); renderLoanComparison(); });
  row.querySelectorAll('input:not(.lc-io)').forEach(el => el.addEventListener('input', renderLoanComparison));
  row.querySelector('.lc-io').addEventListener('change', renderLoanComparison);
  renderLoanComparison();
}

function renderLoanComparison() {
  const resultsEl = document.getElementById('r-loan-compare-results');
  const rows = document.querySelectorAll('#r-loan-compare-inputs .loan-compare-row');
  const purchase = num('r-purchase');
  const loanPct = num('r-loan-pct');
  const loanAmt = purchase * (loanPct / 100);

  if (rows.length === 0 || loanAmt <= 0) {
    resultsEl.innerHTML = '';
    return;
  }

  // Gather rental income data for CF calc
  const monthlyGross = Array.from(document.querySelectorAll('#r-units-list .unit-rent')).reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
  const vacancyPct = num('r-vacancy');
  const annualNet = monthlyGross * 12 * (1 - vacancyPct / 100);
  const tax = num('r-tax'), insurance = num('r-insurance'), maintenance = num('r-maintenance');
  const admin = num('r-admin'), utilities = num('r-utilities'), other = num('r-other');
  const annualOpex = tax + insurance + maintenance + admin + (utilities * 12) + other;

  const loans = [];
  rows.forEach(row => {
    const name = row.querySelector('.lc-name').value || 'Lån';
    const rate = parseFloat(row.querySelector('.lc-rate').value) || 0;
    const term = parseFloat(row.querySelector('.lc-term').value) || 30;
    const io = row.querySelector('.lc-io').checked;
    const monthlyPmt = calcMonthlyPayment(loanAmt, rate, term, io);
    const annualPmt = monthlyPmt * 12;
    const totalCost = annualPmt * term;
    const totalInterest = totalCost - (io ? 0 : loanAmt);
    const monthlyCF = (annualNet - annualOpex - annualPmt) / 12;
    loans.push({ name, rate, term, io, monthlyPmt, annualPmt, totalInterest, monthlyCF });
  });

  let html = '<div class="compare-scroll" style="margin-top:0.75rem"><table class="compare-table"><thead><tr><th></th>';
  loans.forEach(l => html += `<th>${escHtml(l.name)}</th>`);
  html += '</tr></thead><tbody>';

  function bestVal(vals, higher) {
    const nums = vals.filter(v => typeof v === 'number');
    return higher ? Math.max(...nums) : Math.min(...nums.filter(n => n > 0));
  }

  function addRow(label, vals, fmt_fn, higherBetter) {
    const best = bestVal(vals, higherBetter);
    html += `<tr><th>${label}</th>`;
    vals.forEach(v => {
      const isBest = v === best && vals.filter(x => x === best).length < vals.length;
      html += `<td class="${isBest ? 'best' : ''}">${fmt_fn(v)}</td>`;
    });
    html += '</tr>';
  }

  addRow('Rente', loans.map(l => l.rate), v => v.toFixed(2) + '%', false);
  addRow('Løbetid', loans.map(l => l.term), v => v + ' år', false);
  addRow('Type', loans.map(l => l.io ? 'Afdragsfri' : 'Annuitet'), v => v, false);
  addRow('Mdl. ydelse', loans.map(l => l.monthlyPmt), v => fmt(Math.round(v)) + ' kr.', false);
  addRow('Årlig ydelse', loans.map(l => l.annualPmt), v => fmt(Math.round(v)) + ' kr.', false);
  addRow('Total rente', loans.map(l => l.totalInterest), v => fmt(Math.round(v)) + ' kr.', false);
  addRow('Mdl. cash flow', loans.map(l => l.monthlyCF), v => fmtSigned(Math.round(v)) + ' kr.', true);

  html += '</tbody></table></div>';
  resultsEl.innerHTML = html;
}

document.getElementById('r-add-loan-compare').addEventListener('click', () => addLoanCompareRow('', '', '', false));

// ── Budget vs. Actual (Flip) ────────────────────────────────────────
function renderBudgetActual() {
  const renoRows = document.querySelectorAll('#f-reno-list .row-item');
  const container = document.getElementById('f-budget-actual-list');
  const summaryEl = document.getElementById('f-budget-actual-summary');
  const headerEl = document.getElementById('f-budget-actual-header');

  if (renoRows.length === 0) {
    container.innerHTML = '<p class="hint">Tilføj renoveringsposter først.</p>';
    summaryEl.innerHTML = '';
    headerEl.style.display = 'none';
    return;
  }

  headerEl.style.display = 'grid';
  const items = [];
  renoRows.forEach((row, i) => {
    const desc = row.querySelector('.reno-desc').value || 'Post ' + (i + 1);
    const budget = parseFloat(row.querySelector('.reno-cost').value) || 0;
    items.push({ desc, budget, index: i });
  });

  // Preserve existing actual values
  const existingActuals = container.querySelectorAll('.actual-cost');
  const prevValues = Array.from(existingActuals).map(el => el.value);

  let html = '';
  items.forEach((item, i) => {
    const prevVal = i < prevValues.length ? prevValues[i] : '';
    const actual = parseFloat(prevVal) || 0;
    const variance = actual > 0 ? item.budget - actual : 0;
    const hasActual = prevVal !== '' && prevVal !== '0';
    html += `<div class="budget-actual-row">
      <span class="ba-label">${escHtml(item.desc)}</span>
      <span class="ba-budget">${fmt(item.budget)} kr.</span>
      <span class="ba-actual"><input type="number" class="actual-cost" step="1000" placeholder="–" value="${prevVal}"></span>
      <span class="ba-variance ${hasActual ? cls(variance) : ''}">${hasActual ? fmtSigned(variance) + ' kr.' : '–'}</span>
    </div>`;
  });
  container.innerHTML = html;

  // Bind change events
  container.querySelectorAll('.actual-cost').forEach(el => {
    el.addEventListener('input', updateBudgetActualSummary);
  });

  updateBudgetActualSummary();
}

function updateBudgetActualSummary() {
  const rows = document.querySelectorAll('#f-budget-actual-list .budget-actual-row');
  const summaryEl = document.getElementById('f-budget-actual-summary');
  let totalBudget = 0, totalActual = 0, hasAny = false;

  rows.forEach(row => {
    const budgetText = row.querySelector('.ba-budget').textContent;
    const budget = parseFloat(budgetText.replace(/\./g, '').replace(',', '.')) || 0;
    const actualEl = row.querySelector('.actual-cost');
    const actual = parseFloat(actualEl.value) || 0;
    const varianceEl = row.querySelector('.ba-variance');

    // Parse budget from the original reno list
    const idx = Array.from(rows).indexOf(row);
    const renoRow = document.querySelectorAll('#f-reno-list .row-item')[idx];
    const realBudget = renoRow ? (parseFloat(renoRow.querySelector('.reno-cost').value) || 0) : 0;

    totalBudget += realBudget;
    if (actualEl.value !== '') {
      hasAny = true;
      totalActual += actual;
      const v = realBudget - actual;
      varianceEl.textContent = fmtSigned(v) + ' kr.';
      varianceEl.className = 'ba-variance ' + cls(v);
    } else {
      varianceEl.textContent = '–';
      varianceEl.className = 'ba-variance';
    }
  });

  if (!hasAny) {
    summaryEl.innerHTML = '';
    return;
  }

  const totalVariance = totalBudget - totalActual;
  const pctVariance = totalBudget > 0 ? (totalVariance / totalBudget * 100) : 0;

  summaryEl.innerHTML = `<div class="ba-summary">
    <div class="ba-summary-row"><span>Budgetteret</span><span>${fmt(totalBudget)} kr.</span></div>
    <div class="ba-summary-row"><span>Faktisk</span><span>${fmt(totalActual)} kr.</span></div>
    <div class="ba-summary-row total"><span>Afvigelse</span><span class="${cls(totalVariance)}">${fmtSigned(totalVariance)} kr. (${pctVariance >= 0 ? '+' : ''}${pctVariance.toFixed(1)}%)</span></div>
  </div>`;
}

// Update budget-actual when reno items change via MutationObserver
const renoObserver = new MutationObserver(() => {
  setTimeout(renderBudgetActual, 50);
});
renoObserver.observe(document.getElementById('f-reno-list'), { childList: true });

// Also gather/load actual data
const origGatherFlipData = gatherFlipData;
gatherFlipData = function() {
  const data = origGatherFlipData();
  data.renoActuals = Array.from(document.querySelectorAll('#f-budget-actual-list .actual-cost')).map(el => el.value);
  return data;
};

const origLoadFlipData = loadFlipData;
loadFlipData = function(data) {
  origLoadFlipData(data);
  // Restore actuals after reno rows are built
  setTimeout(() => {
    renderBudgetActual();
    if (data.renoActuals && data.renoActuals.length) {
      const inputs = document.querySelectorAll('#f-budget-actual-list .actual-cost');
      data.renoActuals.forEach((val, i) => {
        if (inputs[i] && val) inputs[i].value = val;
      });
      updateBudgetActualSummary();
    }
  }, 50);
};

// ── BRRRR Calculator ────────────────────────────────────────────────
function calcBRRRR() {
  const purchase = num('b-purchase');
  const closing = num('b-closing');
  const renoTotal = num('b-reno-total');
  const totalInvestment = purchase + closing + renoTotal;

  // Initial loan
  const initLtv = num('b-init-ltv');
  const initLoan = purchase * (initLtv / 100);
  const equityNeeded = totalInvestment - initLoan;

  // Refinance
  const arv = num('b-arv');
  const refiLtv = num('b-refi-ltv');
  const refiRate = num('b-refi-rate');
  const refiTerm = num('b-refi-term');
  const refiIO = document.getElementById('b-refi-io').checked;
  const newLoan = arv * (refiLtv / 100);
  const cashOut = newLoan - totalInvestment;
  const equityLeftIn = Math.max(0, totalInvestment - newLoan);
  const refiPayment = calcMonthlyPayment(newLoan, refiRate, refiTerm, refiIO);

  // Rental
  const monthlyRent = num('b-monthly-rent');
  const vacancy = num('b-vacancy');
  const annualOpex = num('b-annual-opex');
  const annualRent = monthlyRent * 12 * (1 - vacancy / 100);
  const noi = annualRent - annualOpex;
  const annualCF = noi - (refiPayment * 12);
  const monthlyCF = annualCF / 12;
  const capRate = arv > 0 ? (noi / arv * 100) : 0;
  const cashOnCash = equityLeftIn > 0 ? (annualCF / equityLeftIn * 100) : 0;
  const equityRecycledPct = totalInvestment > 0 ? (newLoan / totalInvestment * 100) : 0;

  // Update computed fields
  document.getElementById('b-total-investment').textContent = totalInvestment > 0 ? fmt(totalInvestment) + ' kr.' : '–';
  document.getElementById('b-equity-needed').textContent = equityNeeded > 0 ? fmt(Math.round(equityNeeded)) + ' kr.' : '–';
  document.getElementById('b-new-loan').textContent = newLoan > 0 ? fmt(newLoan) + ' kr.' : '–';
  document.getElementById('b-refi-payment').textContent = refiPayment > 0 ? fmt(Math.round(refiPayment)) + ' kr.' : '–';

  if (purchase === 0 && arv === 0) {
    document.getElementById('b-results').innerHTML = '<p class="placeholder-text">Udfyld felterne for at se BRRRR-beregning.</p>';
    return;
  }

  let html = '';

  // BRRRR status banner
  if (totalInvestment > 0 && newLoan > 0) {
    if (cashOut >= 0) {
      html += `<div class="brrrr-banner full">Fuld BRRRR! Du får ${fmt(Math.round(cashOut))} kr. tilbage ved refinansiering.</div>`;
    } else if (equityRecycledPct >= 75) {
      html += `<div class="brrrr-banner partial">${equityRecycledPct.toFixed(0)}% af egenkapitalen genbrugt. ${fmt(Math.round(-cashOut))} kr. bundet.</div>`;
    } else {
      html += `<div class="brrrr-banner negative">Kun ${equityRecycledPct.toFixed(0)}% genbrugt. ${fmt(Math.round(-cashOut))} kr. forbliver bundet.</div>`;
    }
  }

  // KPIs
  html += '<div class="kpi-grid">';
  if (totalInvestment > 0 && newLoan > 0) html += kpiTile(equityRecycledPct.toFixed(0) + '%', 'Egenkapital genbrugt', cashOut);
  if (cashOut !== 0) html += kpiTile(fmtSigned(Math.round(cashOut)) + ' kr.', 'Cash-out ved refi', cashOut);
  if (monthlyCF !== 0) html += kpiTile(fmtSigned(Math.round(monthlyCF)) + ' kr.', 'Mdl. cash flow', monthlyCF);
  if (capRate > 0) html += kpiTile(capRate.toFixed(1) + '%', 'Cap Rate');
  if (equityLeftIn > 0 && annualCF !== 0) html += kpiTile(cashOnCash.toFixed(1) + '%', 'Cash-on-cash', cashOnCash);
  html += '</div>';

  // Investment breakdown
  html += '<div class="result-section"><h3>Investering</h3>';
  html += `<div class="result-row"><span class="label">Købspris</span><span class="value">${fmt(purchase)} kr.</span></div>`;
  if (closing > 0) html += `<div class="result-row"><span class="label">Købsomkostninger</span><span class="value">${fmt(closing)} kr.</span></div>`;
  if (renoTotal > 0) html += `<div class="result-row"><span class="label">Renovering</span><span class="value">${fmt(renoTotal)} kr.</span></div>`;
  html += `<div class="result-row total"><span class="label">Total investering</span><span class="value">${fmt(totalInvestment)} kr.</span></div>`;
  if (initLoan > 0) html += `<div class="result-row"><span class="label">Første lån (${initLtv}%)</span><span class="value">${fmt(initLoan)} kr.</span></div>`;
  html += `<div class="result-row"><span class="label">Egenkapital krævet</span><span class="value">${fmt(Math.round(equityNeeded))} kr.</span></div>`;
  html += '</div>';

  // Refinancing
  if (arv > 0 && newLoan > 0) {
    html += '<div class="result-section"><h3>Refinansiering</h3>';
    html += `<div class="result-row"><span class="label">After Repair Value (ARV)</span><span class="value">${fmt(arv)} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Nyt lån (${refiLtv}% af ARV)</span><span class="value">${fmt(newLoan)} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Indfrier investering</span><span class="value">-${fmt(totalInvestment)} kr.</span></div>`;
    html += `<div class="result-row highlight ${cashOut >= 0 ? '' : 'negative'}"><span class="label">Cash-out / bundet</span><span class="value ${cls(cashOut)}">${fmtSigned(Math.round(cashOut))} kr.</span></div>`;
    if (equityLeftIn > 0) html += `<div class="result-row"><span class="label">Egenkapital bundet i ejendom</span><span class="value">${fmt(Math.round(equityLeftIn))} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Mdl. ydelse (nyt lån)</span><span class="value">${fmt(Math.round(refiPayment))} kr.</span></div>`;
    html += '</div>';
  }

  // Cash flow
  if (monthlyRent > 0) {
    html += '<div class="result-section"><h3>Udlejning (efter refi)</h3>';
    html += `<div class="result-row"><span class="label">Mdl. husleje</span><span class="value">${fmt(monthlyRent)} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Årlig netto lejeindtægt</span><span class="value">${fmt(Math.round(annualRent))} kr.</span></div>`;
    if (annualOpex > 0) html += `<div class="result-row"><span class="label">Årlige driftsudgifter</span><span class="value">${fmt(annualOpex)} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">NOI</span><span class="value">${fmt(Math.round(noi))} kr.</span></div>`;
    html += `<div class="result-row"><span class="label">Årlig ydelse (nyt lån)</span><span class="value">${fmt(Math.round(refiPayment * 12))} kr.</span></div>`;
    html += `<div class="result-row highlight ${annualCF >= 0 ? '' : 'negative'}"><span class="label">Årligt cash flow</span><span class="value ${cls(annualCF)}">${fmtSigned(Math.round(annualCF))} kr.</span></div>`;
    html += `<div class="result-row highlight ${monthlyCF >= 0 ? '' : 'negative'}"><span class="label">Mdl. cash flow</span><span class="value ${cls(monthlyCF)}">${fmtSigned(Math.round(monthlyCF))} kr.</span></div>`;
    if (capRate > 0) html += `<div class="result-row"><span class="label">Cap Rate</span><span class="value">${capRate.toFixed(1)}%</span></div>`;
    if (equityLeftIn > 0) html += `<div class="result-row"><span class="label">Cash-on-cash</span><span class="value ${cls(cashOnCash)}">${cashOnCash.toFixed(1)}%</span></div>`;
    html += '</div>';
  }

  // Deal summary
  if (totalInvestment > 0 && arv > 0 && monthlyRent > 0) {
    const forcedAppreciation = arv - purchase;
    const forcedPct = purchase > 0 ? (forcedAppreciation / purchase * 100) : 0;
    html += '<div class="result-section"><h3>BRRRR-overblik</h3>';
    html += `<div class="result-row"><span class="label">Forced appreciation</span><span class="value ${cls(forcedAppreciation)}">${fmtSigned(Math.round(forcedAppreciation))} kr. (${forcedPct.toFixed(1)}%)</span></div>`;
    html += `<div class="result-row"><span class="label">Egenkapital genbrugt</span><span class="value">${equityRecycledPct.toFixed(0)}%</span></div>`;
    if (cashOut > 0 && monthlyCF > 0) {
      html += `<div class="result-row"><span class="label">Næste deal: klar kapital</span><span class="value positive">${fmt(Math.round(cashOut))} kr.</span></div>`;
    }
    html += '</div>';
  }

  document.getElementById('b-results').innerHTML = html;

  // Animate KPIs
  document.querySelectorAll('#b-results .kpi-tile').forEach(t => {
    t.classList.add('updating');
    t.addEventListener('animationend', () => t.classList.remove('updating'), { once: true });
  });
}

// BRRRR event listeners
['b-purchase', 'b-closing', 'b-reno-total', 'b-init-ltv', 'b-init-rate',
 'b-arv', 'b-refi-ltv', 'b-refi-rate', 'b-refi-term',
 'b-monthly-rent', 'b-vacancy', 'b-annual-opex'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcBRRRR);
});
document.getElementById('b-refi-io')?.addEventListener('change', calcBRRRR);

// BRRRR reset
document.getElementById('b-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#brrrr input[type="number"], #brrrr input[type="text"]').forEach(el => el.value = '');
  document.getElementById('b-refi-io').checked = false;
  document.getElementById('b-init-ltv').value = 80;
  document.getElementById('b-init-rate').value = 4;
  document.getElementById('b-refi-ltv').value = 80;
  document.getElementById('b-refi-rate').value = 4;
  document.getElementById('b-refi-term').value = 30;
  document.getElementById('b-vacancy').value = 5;
  calcBRRRR();
  showToast('Felter nulstillet.', 'info');
});

// ── Init Due Diligence listeners ────────────────────────────────────
document.querySelectorAll('.dd-check').forEach(cb => {
  cb.addEventListener('change', () => updateDDProgress(cb.dataset.section));
});
updateDDProgress('r');
updateDDProgress('f');

// ── Init ─────────────────────────────────────────────────────────────
addRentalUnit('', '');
addLoanCompareRow('Fastforrentet 30 år', 4, 30, false);
addLoanCompareRow('Flexlån F5', 3, 30, false);
restoreDrafts();
