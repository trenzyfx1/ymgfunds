import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDocs, collection,
  query, orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── THEME (runs immediately, no auth needed) ───
initTheme();

// ── AUTH ───────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }

  // Init notifications now that we have user
  initNotifications(user.uid);

  // Real-time user data
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
async function loadDashboardData(uid) {
  try {
    const q    = query(collection(db, "users", uid, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    let totalDeposits    = 0;
    let totalWithdrawals = 0;
    const recentTxs      = [];

    snap.forEach(ds => {
      const tx = ds.data();
      if (tx.type === "deposit")    totalDeposits    += tx.amount || 0;
      if (tx.type === "withdrawal") totalWithdrawals += tx.gross  || tx.amount || 0;
      if (recentTxs.length < 6)     recentTxs.push(tx);
    });

    setEl("totalDeposits",    fmtGHS(totalDeposits));
    setEl("totalWithdrawals", fmtGHS(totalWithdrawals));
    renderRecentTx(recentTxs);

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