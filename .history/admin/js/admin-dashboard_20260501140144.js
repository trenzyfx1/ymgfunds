import { db } from "../../js/firebase.js";
import {
  collection, getDocs, query, where
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

let depWdrChartInstance = null;
let planChartInstance   = null;

async function loadDashboard() {
  try {
    const [usersSnap, wdrSnap, loanSnap] = await Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "withdrawalRequests"), where("status", "==", "pending"))),
      getDocs(query(collection(db, "loanRequests"),       where("status", "==", "pending")))
    ]);

    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const todayStr = new Date().toLocaleDateString("en-GB");
    const now      = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let totalDeposits     = 0;
    let totalWithdrawals  = 0;
    let totalInvested     = 0;
    let totalProfits      = 0;
    let depositsToday     = 0;
    let withdrawalsToday  = 0;
    let usersToday        = 0;
    let verifiedUsers     = 0;
    let standardActivated = 0;
    let premiumActivated  = 0;
    let activePlansCount  = 0;
    let profitsMonth      = 0;

    const planCounts = {
      "Starter Savings":       0,
      "Fixed Deposit":         0,
      "Growth Plus":           0,
      "182-Day Growth Tool":   0,
      "365-Day Premium Tool":  0,
      "3-Year Wealth Builder": 0,
    };

    const recentDeposits = [];

    const recentUsers = users
      .filter(u => u.createdAt?.seconds)
      .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
      .slice(0, 8);

    const userDataPromises = users.map(async (user) => {
      if (user.emailVerified || user.phoneVerified) verifiedUsers++;
      if (user.standardActivated) standardActivated++;
      if (user.premiumActivated)  premiumActivated++;

      const userCreatedStr = user.createdAt?.seconds
        ? new Date(user.createdAt.seconds * 1000).toLocaleDateString("en-GB")
        : "";
      if (userCreatedStr === todayStr) usersToday++;

      const [txSnap, invSnap] = await Promise.all([
        getDocs(collection(db, "users", user.id, "transactions")),
        getDocs(collection(db, "users", user.id, "investments"))
      ]);

      txSnap.forEach(tx => {
        const t        = tx.data();
        const tStr     = t.date?.seconds ? new Date(t.date.seconds * 1000).toLocaleDateString("en-GB") : "";
        const tMonthStr = t.date?.seconds ? new Date(t.date.seconds * 1000).toISOString().slice(0, 7) : "";

        if (t.type === "deposit") {
          totalDeposits += t.amount || 0;
          if (tStr === todayStr) depositsToday += t.amount || 0;
          if (recentDeposits.length < 8) recentDeposits.push({ ...t, userName: user.name });
        }
        if (t.type === "withdrawal") {
          totalWithdrawals += t.gross || t.amount || 0;
          if (tStr === todayStr) withdrawalsToday += t.gross || t.amount || 0;
        }
        if (t.type === "profit_credit") {
          totalProfits += t.amount || 0;
          if (tMonthStr === monthStr) profitsMonth += t.amount || 0;
        }
      });

      invSnap.forEach(inv => {
        const i = inv.data();
        if (i.status === "active") {
          totalInvested += i.amount || 0;
          activePlansCount++;
          if (planCounts[i.planName] !== undefined) planCounts[i.planName]++;
        }
      });
    });

    await Promise.all(userDataPromises);

    let pendingWdrAmount = 0;
    let pendingWdrCount  = 0;
    const pendingWdrs    = [];

    wdrSnap.forEach(w => {
      const d = w.data();
      pendingWdrAmount += d.gross || d.amount || 0;
      pendingWdrCount++;
      pendingWdrs.push({ id: w.id, ...d });
    });

    let pendingLoans = 0;
    loanSnap.forEach(() => pendingLoans++);

    document.getElementById("statTotalDeposits").textContent     = fmtGHS(totalDeposits);
    document.getElementById("statDepositsToday").textContent     = `Today: ${fmtGHS(depositsToday)}`;
    document.getElementById("statTotalWithdrawals").textContent  = fmtGHS(totalWithdrawals);
    document.getElementById("statWithdrawalsToday").textContent  = `Today: ${fmtGHS(withdrawalsToday)}`;
    document.getElementById("statActiveInvestments").textContent = fmtGHS(totalInvested);
    document.getElementById("statActivePlans").textContent       = `${activePlansCount} active plans`;
    document.getElementById("statTotalUsers").textContent        = users.length;
    document.getElementById("statUsersToday").textContent        = `Today: ${usersToday} new`;
    document.getElementById("statPendingWdr").textContent        = fmtGHS(pendingWdrAmount);
    document.getElementById("statPendingWdrCount").textContent   = `${pendingWdrCount} requests`;
    document.getElementById("statTotalProfits").textContent      = fmtGHS(totalProfits);
    document.getElementById("statProfitsMonth").textContent      = `This month: ${fmtGHS(profitsMonth)}`;

    const totalBal = users.reduce((s, u) => s + (u.balance || 0), 0);
    document.getElementById("healthTotalBal").textContent     = fmtGHS(totalBal);
    document.getElementById("healthOwed").textContent         = fmtGHS(totalBal);
    document.getElementById("healthVerified").textContent     = `${verifiedUsers} / ${users.length}`;
    document.getElementById("healthStandard").textContent     = `${standardActivated} users`;
    document.getElementById("healthPremium").textContent      = `${premiumActivated} users`;
    document.getElementById("healthPendingWdr").textContent   = `${pendingWdrCount} requests`;
    document.getElementById("healthPendingLoans").textContent = `${pendingLoans} requests`;

    const pendingWdrBadge  = document.getElementById("pendingWdrBadge");
    const pendingLoanBadge = document.getElementById("pendingLoanBadge");
    if (pendingWdrBadge)  pendingWdrBadge.textContent  = pendingWdrCount  || "";
    if (pendingLoanBadge) pendingLoanBadge.textContent = pendingLoans     || "";

    renderDepositsTable(recentDeposits);
    renderWithdrawalsTable(pendingWdrs.slice(0, 6));
    renderUsersTable(recentUsers);
    renderDepWdrChart();
    renderPlanChart(planCounts);

  } catch (err) {
    console.error("Dashboard load error:", err);
  }
}

function renderDepositsTable(deposits) {
  const tbody = document.getElementById("recentDepositsBody");
  if (!tbody) return;
  if (!deposits.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">No deposits yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = deposits.map(d => `
    <tr>
      <td><div class="adm-user-cell"><div class="adm-user-av">${initials(d.userName)}</div><span class="adm-user-name">${d.userName || "—"}</span></div></td>
      <td><strong>${fmtGHS(d.amount)}</strong></td>
      <td>${fmtDate(d.date?.seconds)}</td>
      <td><span class="adm-badge ${d.status || "completed"}">${d.status || "completed"}</span></td>
    </tr>
  `).join("");
}

function renderWithdrawalsTable(withdrawals) {
  const tbody = document.getElementById("pendingWithdrawalsBody");
  if (!tbody) return;
  if (!withdrawals.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="adm-table-empty">No pending withdrawals.</td></tr>`;
    return;
  }
  tbody.innerHTML = withdrawals.map(w => `
    <tr>
      <td>
        <div class="adm-user-cell">
          <div class="adm-user-av">${initials(w.name)}</div>
          <div><p class="adm-user-name">${w.name || "—"}</p><p class="adm-user-email">${w.phone || ""}</p></div>
        </div>
      </td>
      <td><strong>${fmtGHS(w.gross || w.amount)}</strong></td>
      <td>${w.method || "—"}</td>
      <td><a href="withdrawals.html" class="adm-approve-btn">Review</a></td>
    </tr>
  `).join("");
}

function renderUsersTable(users) {
  const tbody = document.getElementById("recentUsersBody");
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="adm-table-empty">No users yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><div class="adm-user-cell"><div class="adm-user-av">${initials(u.name)}</div><span class="adm-user-name">${u.name || "—"}</span></div></td>
      <td style="color:var(--adm-muted);font-size:0.78rem;">${u.email || "—"}</td>
      <td><strong>${fmtGHS(u.balance)}</strong></td>
      <td style="color:var(--adm-muted);font-size:0.78rem;">${fmtDate(u.createdAt?.seconds)}</td>
      <td><span class="adm-badge ${u.emailVerified ? "active" : "pending"}">${u.emailVerified ? "Verified" : "Unverified"}</span></td>
    </tr>
  `).join("");
}

function renderDepWdrChart() {
  const ctx = document.getElementById("depWdrChart");
  if (!ctx) return;

  if (depWdrChartInstance) depWdrChartInstance.destroy();

  const labels = [];
  const now    = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
  }

  depWdrChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Deposits",
          data: [0, 0, 0, 0, 0, 0, 0],
          borderColor: "#22c55e",
          backgroundColor: "rgba(34,197,94,0.08)",
          borderWidth: 2.5,
          pointBackgroundColor: "#22c55e",
          pointRadius: 4,
          tension: 0.4,
          fill: true,
        },
        {
          label: "Withdrawals",
          data: [0, 0, 0, 0, 0, 0, 0],
          borderColor: "#ef4444",
          backgroundColor: "rgba(239,68,68,0.08)",
          borderWidth: 2.5,
          pointBackgroundColor: "#ef4444",
          pointRadius: 4,
          tension: 0.4,
          fill: true,
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: "#64748b", font: { family: "DM Sans", size: 12 } } }
      },
      scales: {
        x: { ticks: { color: "#64748b", font: { family: "DM Sans", size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#64748b", font: { family: "DM Sans", size: 11 }, callback: v => "GHS " + v.toLocaleString() }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
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
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderColor: "transparent", borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true,
      cutout: "72%",
      plugins: { legend: { display: false } }
    }
  });

  const legend = document.getElementById("planLegend");
  if (legend) {
    legend.innerHTML = labels.map((label, i) => {
      const pct = total ? Math.round((data[i] / total) * 100) : 0;
      return `
        <div class="adm-legend-item">
          <div class="adm-legend-left">
            <div class="adm-legend-dot" style="background:${colors[i]}"></div>
            <span>${label}</span>
          </div>
          <span class="adm-legend-pct">${pct}%</span>
        </div>
      `;
    }).join("");
  }
}

document.getElementById("admRefresh")?.addEventListener("click", loadDashboard);

document.querySelectorAll(".adm-chart-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".adm-chart-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

loadDashboard();