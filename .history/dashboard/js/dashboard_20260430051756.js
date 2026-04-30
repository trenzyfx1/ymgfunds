// DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
import "./init.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDocs, collection,
  query, orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── THEME (no auth needed) ─────────────────────
// handled by init.js

// ── EYE TOGGLE STATE ───────────────────────────
const HIDDEN_KEY  = "ymg_balances_hidden";
let   balHidden   = localStorage.getItem(HIDDEN_KEY) === "true";
const BALANCE_IDS = ["totalBalance", "investedBalance", "profitBalance", "referralEarnings"];
const realValues  = {};

function maskEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!realValues[id]) realValues[id] = el.textContent;
  el.textContent = "••••••";
  el.style.letterSpacing = "3px";
}

function unmaskEl(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (realValues[id]) el.textContent = realValues[id];
  el.style.letterSpacing = "";
}

function applyVisibility() {
  BALANCE_IDS.forEach(id => {
    balHidden ? maskEl(id) : unmaskEl(id);
    const ico = document.getElementById(`eyeIco-${id}`);
    if (ico) ico.className = balHidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  });
}

// Each eye button toggles all balances together
document.querySelectorAll(".dash-eye-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    balHidden = !balHidden;
    localStorage.setItem(HIDDEN_KEY, balHidden);
    applyVisibility();
  });
});

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }

  onSnapshot(doc(db, "users", user.uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();

    const name     = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    setEl("userName",    name.split(" ")[0]);
    setEl("profileAvatar", initials);

    const hour  = new Date().getHours();
    const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    setEl("dashGreetingSub", `${greet}, ${name.split(" ")[0]}. Here's your account overview.`);

    const balance  = typeof d.balance  === "number" ? d.balance  : 0;
    const invested = typeof d.invested === "number" ? d.invested : 0;
    const profit   = typeof d.profit   === "number" ? d.profit   : 0;
    const refEarn  = typeof d.referralEarnings === "number" ? d.referralEarnings : 0;
    const refCount = typeof d.referralCount    === "number" ? d.referralCount    : 0;
    const plans    = typeof d.activePlans      === "number" ? d.activePlans      : 0;

    // Store real values then apply visibility
    realValues["totalBalance"]      = fmtGHS(balance);
    realValues["investedBalance"]   = fmtGHS(invested);
    realValues["profitBalance"]     = fmtGHS(profit);
    realValues["referralEarnings"]  = fmtGHS(refEarn);

    setEl("totalBalance",      fmtGHS(balance));
    setEl("investedBalance",   fmtGHS(invested));
    setEl("profitBalance",     fmtGHS(profit));
    setEl("referralEarnings",  fmtGHS(refEarn));
    setEl("activePlansNote",   `${plans} active plan${plans !== 1 ? "s" : ""}`);
    setEl("referralNote",      `${refCount} referral${refCount !== 1 ? "s" : ""}`);
    setEl("totalReferrals",    refCount);
    setEl("activeInvestments", plans);

    const code = d.referralCode || user.uid.slice(0, 8).toUpperCase();
    setEl("dashRefCode", code);

    // Apply hide state after values set
    applyVisibility();

    const emailOk = user.emailVerified;
    const phoneOk = d.phoneVerified || false;
    const alertEl = document.getElementById("dashVerifyAlert");
    const msgEl   = document.getElementById("dashVerifyMsg");

    if (!emailOk || !phoneOk) {
      if (alertEl) alertEl.style.display = "flex";
      if (!emailOk && !phoneOk) {
        if (msgEl) msgEl.textContent = "Please verify your email and phone number to unlock withdrawals and full account features.";
      } else if (!emailOk) {
        if (msgEl) msgEl.textContent = "Please verify your email address to unlock full account features.";
      } else {
        if (msgEl) msgEl.textContent = "Please verify your phone number to enable withdrawals.";
      }
    } else {
      if (alertEl) alertEl.style.display = "none";
    }
  });

  await loadDashboardData(user.uid);
  await loadActivePlans(user.uid);
  loadCurrencyRates();
});

// ── LOGOUT ─────────────────────────────────────
document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(btn => {
  if (btn) btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

// ── REFERRAL COPY ──────────────────────────────
const copyRefBtn = document.getElementById("dashCopyRef");
if (copyRefBtn) {
  copyRefBtn.addEventListener("click", () => {
    const code = document.getElementById("dashRefCode").textContent;
    if (!code || code === "—") return;
    navigator.clipboard.writeText(code).then(() => {
      copyRefBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => { copyRefBtn.innerHTML = '<i class="fa-solid fa-copy"></i>'; }, 2000);
    });
  });
}

// ── LOAD DASHBOARD DATA ────────────────────────
let ALL_TRANSACTIONS = [];

async function loadDashboardData(uid) {
  try {
    const q    = query(collection(db, "users", uid, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    let totalDeposits    = 0;
    let totalWithdrawals = 0;
    const recentTxs      = [];

    ALL_TRANSACTIONS = [];
    snap.forEach(ds => {
      const tx = ds.data();
      ALL_TRANSACTIONS.push(tx);
      if (tx.type === "deposit")    totalDeposits    += tx.amount || 0;
      if (tx.type === "withdrawal") totalWithdrawals += tx.gross  || tx.amount || 0;
      if (recentTxs.length < 6)     recentTxs.push(tx);
    });

    setEl("totalDeposits",    fmtGHS(totalDeposits));
    setEl("totalWithdrawals", fmtGHS(totalWithdrawals));
    renderRecentTx(recentTxs);
    buildChart("7d");

  } catch (err) {
    console.error("Dashboard data error:", err);
  }
}

// ── RENDER RECENT TRANSACTIONS ─────────────────
function renderRecentTx(txs) {
  const tbody = document.getElementById("transactionTable");
  if (!tbody) return;

  if (txs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="dash-tx-msg">No transactions yet. <a href="deposit.html">Make your first deposit</a></td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  txs.forEach(tx => {
    const date = tx.date?.seconds
      ? new Date(tx.date.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

    const { icon, label, colorClass, prefix, amtClass } = getTxMeta(tx.type);
    const desc    = getTxDesc(tx);
    const statusC = tx.status === "completed" || tx.status === "success" || tx.status === "active"
      ? "dash-tx-success" : tx.status === "failed" ? "dash-tx-failed" : "dash-tx-pending";

    tbody.innerHTML += `
      <tr>
        <td><span class="dash-tx-badge ${colorClass}"><i class="${icon}"></i> ${label}</span></td>
        <td class="dash-tx-desc">${desc}</td>
        <td class="dash-tx-amt ${amtClass}">${prefix}${fmtGHS(tx.amount || 0)}</td>
        <td class="dash-tx-date">${date}</td>
        <td><span class="dash-tx-status ${statusC}">${tx.status || "pending"}</span></td>
      </tr>`;
  });
}

// ── LOAD ACTIVE PLANS ──────────────────────────
async function loadActivePlans(uid) {
  const container = document.getElementById("dashPlansList");
  if (!container) return;

  try {
    const q    = query(collection(db, "users", uid, "investments"), orderBy("startDate", "desc"));
    const snap = await getDocs(q);

    const active = [];
    snap.forEach(ds => {
      const inv = ds.data();
      if (inv.status === "active") active.push(inv);
    });

    if (active.length === 0) {
      container.innerHTML = `
        <div class="dash-empty-state">
          <i class="fa-solid fa-seedling"></i>
          <p>No active investments yet.</p>
          <a href="investments.html" class="dash-empty-btn">Start Investing</a>
        </div>`;
      return;
    }

    container.innerHTML = "";
    active.slice(0, 4).forEach(inv => {
      const profit   = typeof inv.profitEarned === "number" ? inv.profitEarned : 0;
      const initials = inv.plan.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const mat = inv.maturityDate?.seconds
        ? new Date(inv.maturityDate.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "Flexible";

      container.innerHTML += `
        <div class="dash-plan-item">
          <div class="dash-plan-badge">${initials}</div>
          <div class="dash-plan-info">
            <strong>${inv.plan}</strong>
            <span>${fmtGHS(inv.amount)} · Matures ${mat}</span>
          </div>
          <div class="dash-plan-right">
            <span class="dash-plan-profit">+${fmtGHS(profit)}</span>
            <span class="dash-plan-status">Active</span>
          </div>
        </div>`;
    });

  } catch (err) {
    console.error("Active plans error:", err);
  }
}

// ══════════════════════════════════════════════
// GROWTH CHART
// ══════════════════════════════════════════════
let growthChartInstance = null;

function buildChart(range) {
  const canvas = document.getElementById("growthChart");
  if (!canvas) return;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const labelColor = isDark ? "#7a9082" : "#7a8f80";

  const { labels, data } = getChartData(range);

  if (growthChartInstance) growthChartInstance.destroy();

  growthChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label:           "Balance (GHS)",
        data,
        borderColor:     "#c9a84c",
        backgroundColor: "rgba(201,168,76,0.08)",
        borderWidth:     2.5,
        pointRadius:     4,
        pointBackgroundColor: "#c9a84c",
        pointBorderColor:    "#fff",
        pointBorderWidth:    2,
        fill:            true,
        tension:         0.4
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "#1a2420" : "#fff",
          titleColor:      isDark ? "#e8f0eb" : "#081c10",
          bodyColor:       "#c9a84c",
          borderColor:     isDark ? "#2a3830" : "#e8ecee",
          borderWidth:     1,
          padding:         10,
          callbacks: {
            label: ctx => ` GHS ${Number(ctx.parsed.y).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
          }
        }
      },
      scales: {
        x: {
          grid:  { color: gridColor },
          ticks: { color: labelColor, font: { size: 11, family: "Inter" } }
        },
        y: {
          grid:  { color: gridColor },
          ticks: {
            color: labelColor,
            font:  { size: 11, family: "Inter" },
            callback: val => "GHS " + Number(val).toLocaleString("en-GH")
          }
        }
      }
    }
  });
}

function getChartData(range) {
  const now   = new Date();
  const txs   = ALL_TRANSACTIONS;
  let   labels = [];
  let   data   = [];

  // Build running balance snapshots from transactions
  // Sort oldest first
  const sorted = [...txs].sort((a, b) => (a.date?.seconds || 0) - (b.date?.seconds || 0));

  if (range === "7d") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit" }));
    }
  } else if (range === "30d") {
    for (let i = 29; i >= 0; i -= 3) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
    }
  } else if (range === "8m") {
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      labels.push(d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }));
    }
  } else if (range === "1y") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      labels.push(d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }));
    }
  }

  // For each label period, calculate cumulative balance
  let runningBalance = 0;
  labels.forEach((_, idx) => {
    // Get cutoff date for this label
    let cutoff;
    if (range === "7d") {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - (6 - idx));
      cutoff.setHours(23, 59, 59);
    } else if (range === "30d") {
      cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - (29 - idx * 3));
      cutoff.setHours(23, 59, 59);
    } else if (range === "8m") {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - (7 - idx));
      cutoff.setDate(new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate());
    } else {
      cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - (11 - idx));
      cutoff.setDate(new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate());
    }

    // Sum all transactions up to this cutoff
    let bal = 0;
    sorted.forEach(tx => {
      if (!tx.date?.seconds) return;
      const txDate = new Date(tx.date.seconds * 1000);
      if (txDate <= cutoff) {
        if (tx.type === "deposit")         bal += tx.amount || 0;
        if (tx.type === "withdrawal")      bal -= tx.gross  || tx.amount || 0;
        if (tx.type === "profit")          bal += tx.amount || 0;
        if (tx.type === "referral_reward") bal += tx.amount || 0;
      }
    });
    data.push(parseFloat(bal.toFixed(2)));
  });

  return { labels, data };
}

// Chart filter buttons
document.querySelectorAll(".dash-chart-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".dash-chart-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    buildChart(btn.dataset.range);
  });
});

// Rebuild chart on theme change
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    setTimeout(() => {
      const activeFilter = document.querySelector(".dash-chart-filter.active");
      buildChart(activeFilter ? activeFilter.dataset.range : "7d");
    }, 100);
  });
}

// ══════════════════════════════════════════════
// CURRENCY RATES & CONVERTER
// ══════════════════════════════════════════════
let RATES = {};

async function loadCurrencyRates() {
  try {
    // Using open.er-api.com (free, no key needed for basic rates)
    const res  = await fetch("https://open.er-api.com/v6/latest/USD");
    const json = await res.json();

    if (json.result !== "success") throw new Error("API error");

    RATES = json.rates;

    // Display rates vs USD
    const pairs = [
      { id: "rateGHS", code: "GHS" },
      { id: "rateNGN", code: "NGN" },
      { id: "rateKES", code: "KES" },
      { id: "rateZAR", code: "ZAR" }
    ];

    pairs.forEach(({ id, code }) => {
      const el = document.getElementById(id);
      if (!el || !RATES[code]) return;
      const rate = (1 / RATES[code]).toFixed(4);
      el.textContent = `$${rate}`;
    });

    const updated = document.getElementById("ratesUpdated");
    if (updated) {
      const t = new Date();
      updated.textContent = `Updated ${t.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    }

  } catch (err) {
    console.error("Currency rate error:", err);
    const updated = document.getElementById("ratesUpdated");
    if (updated) updated.textContent = "Rates unavailable";
  }
}

// Convert button
document.getElementById("convConvert")?.addEventListener("click", () => {
  const amount = parseFloat(document.getElementById("convAmount").value);
  const from   = document.getElementById("convFrom").value;
  const to     = document.getElementById("convTo").value;
  const rateEl = document.getElementById("convRate");
  const result = document.getElementById("convResult");

  if (!amount || isNaN(amount) || amount <= 0) {
    rateEl.textContent = "Please enter a valid amount.";
    return;
  }

  if (!RATES[from] || !RATES[to]) {
    rateEl.textContent = "Rates not loaded yet. Please wait.";
    return;
  }

  // Convert via USD as base
  const inUSD      = amount / RATES[from];
  const converted  = inUSD * RATES[to];
  const rate       = (RATES[to] / RATES[from]).toFixed(6);

  result.value = converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  rateEl.textContent = `1 ${from} = ${rate} ${to}`;
});

// Swap button
document.getElementById("convSwap")?.addEventListener("click", () => {
  const fromEl = document.getElementById("convFrom");
  const toEl   = document.getElementById("convTo");
  const temp   = fromEl.value;
  fromEl.value = toEl.value;
  toEl.value   = temp;
  document.getElementById("convResult").value = "";
  document.getElementById("convRate").textContent = "Enter an amount and click Convert";
});

// Auto-convert on amount input
document.getElementById("convAmount")?.addEventListener("input", () => {
  const btn = document.getElementById("convConvert");
  if (btn) btn.click();
});

// ── TX META ────────────────────────────────────
function getTxMeta(type) {
  switch (type) {
    case "deposit":         return { icon: "fa-solid fa-arrow-down",     label: "Deposit",    colorClass: "dash-dep", prefix: "+", amtClass: "dash-pos" };
    case "withdrawal":      return { icon: "fa-solid fa-arrow-up",       label: "Withdrawal", colorClass: "dash-wdr", prefix: "−", amtClass: "dash-neg" };
    case "investment":      return { icon: "fa-solid fa-chart-line",     label: "Investment", colorClass: "dash-inv", prefix: "−", amtClass: "dash-neg" };
    case "profit":          return { icon: "fa-solid fa-arrow-trend-up", label: "Profit",     colorClass: "dash-prf", prefix: "+", amtClass: "dash-pos" };
    case "referral_reward": return { icon: "fa-solid fa-gift",           label: "Referral",   colorClass: "dash-ref", prefix: "+", amtClass: "dash-pos" };
    case "activation":      return { icon: "fa-solid fa-unlock",         label: "Activation", colorClass: "dash-act", prefix: "−", amtClass: "dash-neg" };
    default:                return { icon: "fa-solid fa-circle",         label: type || "Tx", colorClass: "dash-oth", prefix: "",  amtClass: "" };
  }
}

function getTxDesc(tx) {
  switch (tx.type) {
    case "deposit":         return "Deposit via Paystack";
    case "withdrawal":      return tx.method ? `To ${tx.method}` : "Withdrawal";
    case "investment":      return tx.plan   ? `Invested in ${tx.plan}` : "Investment";
    case "profit":          return tx.plan   ? `Profit from ${tx.plan}` : (tx.note || "Profit credit");
    case "referral_reward": return tx.note   || "Referral reward";
    case "activation":      return tx.plan   || "Plan activation";
    default:                return tx.note   || "—";
  }
}

// ── HELPERS ────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtGHS(n) {
  return "GHS " + Number(n).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}