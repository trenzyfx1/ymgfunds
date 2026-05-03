import { db } from "../../js/firebase.js";
import {
  collection, getDocs, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function fmtGHS(n) {
  return "GHS " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

function fmtDate(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

let depWdrChartInstance   = null;
let planChartInstance     = null;
let userGrowthInstance    = null;
let profitChartInstance   = null;

const CHART_DEFAULTS = {
  responsive: true,
  plugins: { legend: { labels: { color: "#64748b", font: { family: "DM Sans", size: 12 } } } },
  scales: {
    x: { ticks: { color: "#64748b", font: { family: "DM Sans", size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
    y: { ticks: { color: "#64748b", font: { family: "DM Sans", size: 11 }, callback: v => "GHS " + v.toLocaleString() }, grid: { color: "rgba(255,255,255,0.04)" } }
  }
};

// ── FRAUD DETECTION ──────────────────────────────────────────────
function detectFraud(users, allTransactions) {
  const alerts = [];
  const todayStr = new Date().toLocaleDateString("en-GB");

  users.forEach(user => {
    const userTxs = allTransactions.filter(t => t.userId === user.id);
    const deposits    = userTxs.filter(t => t.type === "deposit");
    const withdrawals = userTxs.filter(t => t.type === "withdrawal");

    // Rule 1: Multiple withdrawals on same day
    const todayWdrs = withdrawals.filter(t => {
      const d = t.date?.seconds ? new Date(t.date.seconds * 1000).toLocaleDateString("en-GB") : "";
      return d === todayStr;
    });
    if (todayWdrs.length >= 3) {
      alerts.push({
        user: user.name || "Unknown",
        email: user.email,
        reason: `${todayWdrs.length} withdrawals in one day`,
        tag: "High Frequency"
      });
    }

    // Rule 2: Large withdrawal with no deposit history
    const totalDeposited  = deposits.reduce((s, t) => s + (t.amount || 0), 0);
    const totalWithdrawn  = withdrawals.reduce((s, t) => s + (t.gross || t.amount || 0), 0);
    if (totalWithdrawn > 0 && totalDeposited === 0) {
      alerts.push({
        user: user.name || "Unknown",
        email: user.email,
        reason: "Withdrawal with no deposit history",
        tag: "No Deposits"
      });
    }

    // Rule 3: Withdrawal exceeds total deposits by more than 3x (could indicate referral abuse)
    if (totalDeposited > 0 && totalWithdrawn > totalDeposited * 3) {
      alerts.push({
        user: user.name || "Unknown",
        email: user.email,
        reason: `Withdrawn ${fmtGHS(totalWithdrawn)} vs deposited ${fmtGHS(totalDeposited)}`,
        tag: "Withdrawal Ratio"
      });
    }

    // Rule 4: Deposited and immediately requested withdrawal same day
    const todayDeps = deposits.filter(t => {
      const d = t.date?.seconds ? new Date(t.date.seconds * 1000).toLocaleDateString("en-GB") : "";
      return d === todayStr;
    });
    const todayWdrReq = withdrawals.filter(t => {
      const d = t.date?.seconds ? new Date(t.date.seconds * 1000).toLocaleDateString("en-GB") : "";
      return d === todayStr;
    });
    if (todayDeps.length > 0 && todayWdrReq.length > 0) {
      alerts.push({
        user: user.name || "Unknown",
        email: user.email,
        reason: "Deposit + withdrawal requested same day",
        tag: "Same-Day Cycle"
      });
    }

    // Rule 5: Account balance suspiciously high with no investments
    if ((user.balance || 0) > 50000 && (user.activePlans || 0) === 0 && totalDeposited > 0) {
      alerts.push({
        user: user.name || "Unknown",
        email: user.email,
        reason: `Balance ${fmtGHS(user.balance)} with no active investments`,
        tag: "Idle Large Balance"
      });
    }

    // Rule 6: Referral earnings exceed deposits (referral farming)
    if ((user.referralEarnings || 0) > totalDeposited && totalDeposited > 0) {
      alerts.push({
        user: user.name || "Unknown",
        email: user.email,
        reason: `Referral earnings ${fmtGHS(user.referralEarnings)} exceed deposits ${fmtGHS(totalDeposited)}`,
        tag: "Referral Farming"
      });
    }
  });

  // Deduplicate by user + tag
  const seen = new Set();
  return alerts.filter(a => {
    const key = `${a.email}-${a.tag}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderFraudAlerts(alerts) {
  const banner = document.getElementById("fraudBanner");
  const list   = document.getElementById("fraudList");
  const count  = document.getElementById("fraudCount");
  if (!banner || !list) return;

  if (!alerts.length) { banner.classList.remove("visible"); return; }

  banner.classList.add("visible");
  if (count) count.textContent = `${alerts.length} alert${alerts.length !== 1 ? "s" : ""}`;

  list.innerHTML = alerts.map(a => `
    <div class="adm-fraud-item">
      <div class="adm-fraud-item-left">
        <div class="adm-user-av" style="width:28px;height:28px;font-size:0.68rem;flex-shrink:0;">${initials(a.user)}</div>
        <div>
          <p><strong>${a.user}</strong> — ${a.email || "—"}</p>
          <span>${a.reason}</span>
        </div>
      </div>
      <span class="adm-fraud-tag">${a.tag}</span>
    </div>
  `).join("");
}

// ── MAIN LOAD ─────────────────────────────────────────────────────
let allDepositsByDay     = {};
let allWithdrawalsByDay  = {};
let allUsersByDay        = {};
let allTransactionsStore = [];

async function loadDashboard() {
  try {
    const [usersSnap, wdrSnap, loanSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "withdrawalRequests"), where("status", "==", "pending"))),
      getDocs(collection(db, "loanRequests"))
    ]);

    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const todayStr  = new Date().toLocaleDateString("en-GB");
    const now       = new Date();
    const monthStr  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let totalDeposits    = 0, totalWithdrawals = 0, totalInvested = 0;
    let totalProfits     = 0, depositsToday    = 0, withdrawalsToday = 0;
    let usersToday       = 0, verifiedUsers    = 0, standardActivated = 0;
    let premiumActivated = 0, activePlansCount = 0, profitsMonth = 0;
    let unverifiedKyc    = 0;

    const planCounts   = { "Starter Savings": 0, "Fixed Deposit": 0, "Growth Plus": 0, "182-Day Growth Tool": 0, "365-Day Premium Tool": 0, "3-Year Wealth Builder": 0 };
    const planProfits  = { "Starter Savings": 0, "Fixed Deposit": 0, "Growth Plus": 0, "182-Day Growth Tool": 0, "365-Day Premium Tool": 0, "3-Year Wealth Builder": 0 };

    const recentDeposits = [];
    allDepositsByDay     = {};
    allWithdrawalsByDay  = {};
    allUsersByDay        = {};
    allTransactionsStore = [];

    const recentUsers = users
      .filter(u => u.createdAt?.seconds)
      .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
      .slice(0, 8);

    // track user growth by day
    users.forEach(u => {
      const dayKey = u.createdAt?.seconds
        ? new Date(u.createdAt.seconds * 1000).toLocaleDateString("en-GB")
        : null;
      if (dayKey) allUsersByDay[dayKey] = (allUsersByDay[dayKey] || 0) + 1;
      if (!u.emailVerified && !u.phoneVerified) unverifiedKyc++;
    });

    const userDataPromises = users.map(async (user) => {
      if (user.emailVerified || user.authEmailVerified) verifiedUsers++;
      if (user.standardActivated) standardActivated++;
      if (user.premiumActivated)  premiumActivated++;

      const userCreatedStr = user.createdAt?.seconds
        ? new Date(user.createdAt.seconds * 1000).toLocaleDateString("en-GB") : "";
      if (userCreatedStr === todayStr) usersToday++;

      const [txSnap, invSnap] = await Promise.all([
        getDocs(collection(db, "users", user.id, "transactions")),
        getDocs(collection(db, "users", user.id, "investments"))
      ]);

      txSnap.forEach(tx => {
        const t         = tx.data();
        const tDate     = t.date?.seconds ? new Date(t.date.seconds * 1000) : null;
        const tStr      = tDate ? tDate.toLocaleDateString("en-GB") : "";
        const tMonthStr = tDate ? tDate.toISOString().slice(0, 7) : "";

        allTransactionsStore.push({ ...t, userId: user.id });

        if (t.type === "deposit") {
          totalDeposits += t.amount || 0;
          if (tStr === todayStr) depositsToday += t.amount || 0;
          if (tStr) allDepositsByDay[tStr] = (allDepositsByDay[tStr] || 0) + (t.amount || 0);
          if (recentDeposits.length < 8) recentDeposits.push({ ...t, userName: user.name });
        }
        if (t.type === "withdrawal") {
          totalWithdrawals += t.gross || t.amount || 0;
          if (tStr === todayStr) withdrawalsToday += t.gross || t.amount || 0;
          if (tStr) allWithdrawalsByDay[tStr] = (allWithdrawalsByDay[tStr] || 0) + (t.gross || t.amount || 0);
        }
        if (t.type === "profit_credit" || t.type === "profit") {
          totalProfits += t.amount || 0;
          if (tMonthStr === monthStr) profitsMonth += t.amount || 0;
        }
      });

      invSnap.forEach(inv => {
        const i    = inv.data();
        const plan = i.planName || i.plan || "";
        if (i.status === "active" || i.status === "matured") {
          totalInvested += i.amount || 0;
          activePlansCount++;
          if (planCounts[plan] !== undefined) planCounts[plan]++;
          if (planProfits[plan] !== undefined) planProfits[plan] += (i.profitEarned || 0);
        }
      });
    });

    await Promise.all(userDataPromises);

    let pendingWdrAmount = 0, pendingWdrCount = 0;
    const pendingWdrs = [];
    wdrSnap.forEach(w => {
      const d = w.data();
      pendingWdrAmount += d.gross || d.amount || 0;
      pendingWdrCount++;
      pendingWdrs.push({ id: w.id, ...d });
    });

    let pendingLoans = 0;
    loanSnap.forEach(l => {
      const status = l.data().status;
      if (status === "pending" || status === "under_review") pendingLoans++;
    });

    const totalBal = users.reduce((s, u) => s + (u.balance || 0), 0);

    // ── Update stat cards
    document.getElementById("statTotalDeposits").textContent    = fmtGHS(totalDeposits);
    document.getElementById("statDepositsToday").textContent    = `Today: ${fmtGHS(depositsToday)}`;
    document.getElementById("statTotalWithdrawals").textContent = fmtGHS(totalWithdrawals);
    document.getElementById("statWithdrawalsToday").textContent = `Today: ${fmtGHS(withdrawalsToday)}`;
    document.getElementById("statActiveInvestments").textContent = fmtGHS(totalInvested);
    document.getElementById("statActivePlans").textContent      = `${activePlansCount} active plans`;
    document.getElementById("statTotalUsers").textContent       = users.length;
    document.getElementById("statUsersToday").textContent       = `Today: ${usersToday} new`;
    document.getElementById("statPendingWdr").textContent       = fmtGHS(pendingWdrAmount);
    document.getElementById("statPendingWdrCount").textContent  = `${pendingWdrCount} requests`;
    document.getElementById("statTotalProfits").textContent     = fmtGHS(totalProfits);
    document.getElementById("statProfitsMonth").textContent     = `This month: ${fmtGHS(profitsMonth)}`;

    // ── Platform health
    const liquidity = totalDeposits - totalWithdrawals;
    document.getElementById("healthTotalBal").textContent     = fmtGHS(totalBal);
    document.getElementById("healthOwed").textContent         = fmtGHS(totalBal);
    document.getElementById("healthLiquidity").textContent    = fmtGHS(liquidity);
    document.getElementById("healthVerified").textContent     = `${verifiedUsers} / ${users.length}`;
    document.getElementById("healthStandard").textContent     = `${standardActivated} users`;
    document.getElementById("healthPremium").textContent      = `${premiumActivated} users`;
    document.getElementById("healthPendingWdr").textContent   = `${pendingWdrCount} requests`;
    document.getElementById("healthPendingLoans").textContent = `${pendingLoans} requests`;
    document.getElementById("healthPendingKyc").textContent   = `${unverifiedKyc} users`;

    // Liquidity warning if low
    const liquidityWarn = document.getElementById("liquidityWarn");
    if (liquidityWarn) {
      const liqEl = document.getElementById("healthLiquidity");
      if (liquidity < 5000) {
        liquidityWarn.classList.add("visible");
        if (liqEl) liqEl.style.color = "#ef4444";
      } else {
        liquidityWarn.classList.remove("visible");
        if (liqEl) liqEl.style.color = "";
      }
    }

    // ── Sidebar badges
    const pwBadge  = document.getElementById("pendingWdrBadge");
    const plBadge  = document.getElementById("pendingLoanBadge");
    const kycBadge = document.getElementById("pendingKycBadge");
    if (pwBadge)  pwBadge.textContent  = pendingWdrCount || "";
    if (plBadge)  plBadge.textContent  = pendingLoans    || "";
    if (kycBadge) kycBadge.textContent = unverifiedKyc   || "";

    // ── Tables
    renderDepositsTable(recentDeposits);
    renderWithdrawalsTable(pendingWdrs.slice(0, 6));
    renderUsersTable(recentUsers);

    // ── Charts
    renderDepWdrChart(7);
    renderPlanChart(planCounts);
    renderUserGrowthChart(7);
    renderProfitChart(planProfits);

    // ── Fraud detection
    const fraudAlerts = detectFraud(users, allTransactionsStore);
    renderFraudAlerts(fraudAlerts);

  } catch (err) {
    console.error("Dashboard load error:", err);
  }
}

// ── TABLE RENDERS ─────────────────────────────────────────────────
function renderDepositsTable(deposits) {
  const tbody = document.getElementById("recentDepositsBody");
  if (!tbody) return;
  if (!deposits.length) { tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">No deposits yet.</td></tr>`; return; }
  tbody.innerHTML = deposits.map(d => `
    <tr>
      <td><div class="adm-user-cell"><div class="adm-user-av">${initials(d.userName)}</div><span class="adm-user-name">${d.userName || "—"}</span></div></td>
      <td><strong>${fmtGHS(d.amount)}</strong></td>
      <td>${fmtDate(d.date?.seconds)}</td>
      <td><span class="adm-badge ${d.status || "completed"}">${d.status || "completed"}</span></td>
    </tr>`).join("");
}

function renderWithdrawalsTable(withdrawals) {
  const tbody = document.getElementById("pendingWithdrawalsBody");
  if (!tbody) return;
  if (!withdrawals.length) { tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">No pending withdrawals.</td></tr>`; return; }
  tbody.innerHTML = withdrawals.map(w => `
    <tr>
      <td><div class="adm-user-cell"><div class="adm-user-av">${initials(w.name)}</div><div><p class="adm-user-name">${w.name || "—"}</p><p class="adm-user-email">${w.phone || ""}</p></div></div></td>
      <td><strong>${fmtGHS(w.gross || w.amount)}</strong></td>
      <td>${w.method || "—"}</td>
      <td><a href="withdrawals.html" class="adm-approve-btn">Review</a></td>
    </tr>`).join("");
}

function renderUsersTable(users) {
  const tbody = document.getElementById("recentUsersBody");
  if (!tbody) return;
  if (!users.length) { tbody.innerHTML = `<tr><td colspan="5" class="adm-table-empty">No users yet.</td></tr>`; return; }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><div class="adm-user-cell"><div class="adm-user-av">${initials(u.name)}</div><span class="adm-user-name">${u.name || "—"}</span></div></td>
      <td style="color:var(--adm-muted);font-size:0.78rem;">${u.email || "—"}</td>
      <td><strong>${fmtGHS(u.balance)}</strong></td>
      <td style="color:var(--adm-muted);font-size:0.78rem;">${fmtDate(u.createdAt?.seconds)}</td>
      <td><span class="adm-badge ${(u.emailVerified || u.authEmailVerified) ? "active" : "pending"}">${(u.emailVerified || u.authEmailVerified) ? "Verified" : "Unverified"}</span></td>
    </tr>`).join("");
}

// ── CHARTS ────────────────────────────────────────────────────────
function getDayLabels(days) {
  const labels = [];
  const now    = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
  }
  return labels;
}

function renderDepWdrChart(days) {
  const ctx = document.getElementById("depWdrChart");
  if (!ctx) return;
  if (depWdrChartInstance) depWdrChartInstance.destroy();

  const labels  = getDayLabels(days);
  const depData = labels.map(l => allDepositsByDay[l]    || 0);
  const wdrData = labels.map(l => allWithdrawalsByDay[l] || 0);

  depWdrChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Deposits",    data: depData, borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 2.5, pointBackgroundColor: "#22c55e", pointRadius: 4, tension: 0.4, fill: true },
        { label: "Withdrawals", data: wdrData, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.08)",  borderWidth: 2.5, pointBackgroundColor: "#ef4444", pointRadius: 4, tension: 0.4, fill: true }
      ]
    },
    options: { ...CHART_DEFAULTS, responsive: true }
  });
}

function renderPlanChart(planCounts) {
  const ctx = document.getElementById("planChart");
  if (!ctx) return;
  if (planChartInstance) planChartInstance.destroy();

  const labels = Object.keys(planCounts);
  const data   = Object.values(planCounts);
  const colors = ["#22c55e", "#c9a84c", "#3b82f6", "#a855f7", "#f97316", "#ef4444"];
  const total  = data.reduce((s, v) => s + v, 0);

  planChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: "transparent", borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: true, cutout: "72%", plugins: { legend: { display: false } } }
  });

  const legend = document.getElementById("planLegend");
  if (legend) {
    legend.innerHTML = labels.map((label, i) => {
      const pct = total ? Math.round((data[i] / total) * 100) : 0;
      return `<div class="adm-legend-item"><div class="adm-legend-left"><div class="adm-legend-dot" style="background:${colors[i]}"></div><span>${label}</span></div><span class="adm-legend-pct">${pct}%</span></div>`;
    }).join("");
  }
}

function renderUserGrowthChart(days) {
  const ctx = document.getElementById("userGrowthChart");
  if (!ctx) return;
  if (userGrowthInstance) userGrowthInstance.destroy();

  const labels   = getDayLabels(days);
  const userData = labels.map(l => allUsersByDay[l] || 0);

  userGrowthInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "New Users",
        data: userData,
        borderColor: "#c9a84c",
        backgroundColor: "rgba(201,168,76,0.08)",
        borderWidth: 2.5,
        pointBackgroundColor: "#c9a84c",
        pointRadius: 4,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#64748b", font: { family: "DM Sans", size: 12 } } } },
      scales: {
        x: { ticks: { color: "#64748b", font: { family: "DM Sans", size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#64748b", font: { family: "DM Sans", size: 11 }, stepSize: 1 }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
}

function renderProfitChart(planProfits) {
  const ctx = document.getElementById("profitChart");
  if (!ctx) return;
  if (profitChartInstance) profitChartInstance.destroy();

  const labels = Object.keys(planProfits);
  const data   = Object.values(planProfits);
  const colors = ["#22c55e", "#c9a84c", "#3b82f6", "#a855f7", "#f97316", "#ef4444"];
  const total  = data.reduce((s, v) => s + v, 0);

  profitChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderColor: "transparent", borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: true, cutout: "72%", plugins: { legend: { display: false } } }
  });

  const legend = document.getElementById("profitLegend");
  if (legend) {
    legend.innerHTML = labels.map((label, i) => {
      const pct = total ? Math.round((data[i] / total) * 100) : 0;
      return `<div class="adm-legend-item"><div class="adm-legend-left"><div class="adm-legend-dot" style="background:${colors[i]}"></div><span>${label}</span></div><span class="adm-legend-pct">${pct}%</span></div>`;
    }).join("");
  }
}

// ── EVENT LISTENERS ───────────────────────────────────────────────
document.getElementById("admRefresh")?.addEventListener("click", loadDashboard);

document.querySelectorAll(".adm-chart-btn[data-range]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".adm-chart-btn[data-range]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderDepWdrChart(parseInt(btn.dataset.range));
  });
});

document.getElementById("growthBtn7")?.addEventListener("click", () => {
  document.getElementById("growthBtn7").classList.add("active");
  document.getElementById("growthBtn30")?.classList.remove("active");
  renderUserGrowthChart(7);
});

document.getElementById("growthBtn30")?.addEventListener("click", () => {
  document.getElementById("growthBtn30").classList.add("active");
  document.getElementById("growthBtn7")?.classList.remove("active");
  renderUserGrowthChart(30);
});

loadDashboard();