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
  row.querySelector('.reno-cost').addEventListener('input', calcFlip);
  calcFlip();
}

document.getElementById('f-add-reno').addEventListener('click', () => addFlipReno('', ''));

// ── Rental Calculation ───────────────────────────────────────────────
function calcRental() {
  // Loan from purchase price * LTV%
  const purchasePriceForLoan = num('r-purchase');
  const loanPct = num('r-loan-pct');
  const loanAmt = purchasePriceForLoan * (loanPct / 100);

  document.getElementById('r-loan-amount-calc').textContent =
    loanAmt > 0 ? fmt(loanAmt) + ' kr.' : '–';

  // Mortgage payment
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

  const grossYield = purchasePrice > 0 ? (annualGrossIncome / purchasePrice) * 100 : 0;
  const netYield = purchasePrice > 0 ? ((annualNetIncome - annualOpex) / purchasePrice) * 100 : 0;
  const cashOnCash = equity > 0 ? (annualCashFlow / equity) * 100 : 0;

  // Only show if there's something to show
  if (monthlyGrossIncome === 0 && purchasePrice === 0 && monthlyPayment === 0) {
    document.getElementById('r-results').innerHTML =
      '<p class="placeholder-text">Udfyld felterne for at se beregning.</p>';
    return;
  }

  // Render
  let html = '';

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
    if (equity > 0) {
      html += `<div class="result-row"><span class="label">Cash-on-cash afkast</span><span class="value ${cls(cashOnCash)}">${cashOnCash.toFixed(1)}%</span></div>`;
    }
  }
  html += '</div>';

  document.getElementById('r-results').innerHTML = html;
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

  // Renovation
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
  const equityNeeded = totalInvestment; // Simplified - they put up the total

  if (purchasePrice === 0 && salePrice === 0 && totalReno === 0) {
    document.getElementById('f-results').innerHTML =
      '<p class="placeholder-text">Udfyld felterne for at se beregning.</p>';
    return;
  }

  let html = '';

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

  document.getElementById('f-results').innerHTML = html;
}

// ── Real-time updates ────────────────────────────────────────────────
// Rental inputs
['r-purchase', 'r-closing', 'r-loan-pct', 'r-rate', 'r-term',
 'r-payment-override', 'r-tax', 'r-insurance', 'r-maintenance',
 'r-admin', 'r-utilities', 'r-other', 'r-vacancy'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcRental);
});
document.getElementById('r-interest-only')?.addEventListener('change', calcRental);

// Flip inputs
['f-purchase', 'f-closing', 'f-hold-months', 'f-hold-cost',
 'f-hold-tax', 'f-hold-insurance', 'f-hold-other',
 'f-sale-price', 'f-sale-costs'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', calcFlip);
});

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

  // Clear and re-add units
  document.getElementById('r-units-list').innerHTML = '';
  (data.units || []).forEach(u => addRentalUnit(u.name, u.rent));

  // Clear and re-add reno
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

  // Clear and re-add reno
  document.getElementById('f-reno-list').innerHTML = '';
  (data.reno || []).forEach(r => addFlipReno(r.desc, r.cost));

  calcFlip();
}

// Save buttons
document.getElementById('r-save').addEventListener('click', () => {
  const data = gatherRentalData();
  if (!data.name) { alert('Angiv venligst et navn/adresse.'); return; }
  data.id = Date.now();
  data.savedAt = new Date().toISOString();
  const props = getProperties();
  props.push(data);
  saveProperties(props);
  alert('Ejendom gemt!');
});

document.getElementById('f-save').addEventListener('click', () => {
  const data = gatherFlipData();
  if (!data.name) { alert('Angiv venligst et navn/adresse.'); return; }
  data.id = Date.now();
  data.savedAt = new Date().toISOString();
  const props = getProperties();
  props.push(data);
  saveProperties(props);
  alert('Ejendom gemt!');
});

// Reset buttons
document.getElementById('r-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#rental input[type="number"], #rental input[type="text"]').forEach(el => el.value = '');
  document.getElementById('r-interest-only').checked = false;
  document.getElementById('r-units-list').innerHTML = '';
  document.getElementById('r-reno-list').innerHTML = '';
  calcRental();
});

document.getElementById('f-reset').addEventListener('click', () => {
  if (!confirm('Nulstil alle felter?')) return;
  document.querySelectorAll('#flip input[type="number"], #flip input[type="text"]').forEach(el => el.value = '');
  document.getElementById('f-reno-list').innerHTML = '';
  calcFlip();
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
    // Switch to rental tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-tab="rental"]').classList.add('active');
    document.getElementById('rental').classList.add('active');
    loadRentalData(p);
  } else {
    // Switch to flip tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    document.querySelector('[data-tab="flip"]').classList.add('active');
    document.getElementById('flip').classList.add('active');
    loadFlipData(p);
  }
};

window.deleteProperty = function(id) {
  if (!confirm('Slet denne ejendom?')) return;
  const props = getProperties().filter(x => x.id !== id);
  saveProperties(props);
  renderSavedList();
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

  } catch (err) {
    statusEl.className = 'url-status error';
    if (err.message === 'Failed to fetch') {
      statusEl.textContent = 'Kan ikke nå serveren. Start serveren med: node server.js';
    } else {
      statusEl.textContent = 'Fejl: ' + err.message;
    }
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

// ── Init ─────────────────────────────────────────────────────────────
// Add one empty unit row by default
addRentalUnit('', '');
