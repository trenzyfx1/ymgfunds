import { db } from "../../js/firebase.js";
import { auth } from "../../js/firebase.js";
import {
  collection, getDocs, doc,
  updateDoc, addDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

const PAGE_SIZE = 20;
let allUsers    = [];
let currentPage = 1;

function fmtGHS(n) {
  return "GHS " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

function fmtDate(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function fmtDateTime(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("admToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `adm-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}

function getPlanName(inv)  { return inv.planName || inv.plan || "—"; }
function getProfitSoFar(inv) { return inv.profitEarned || 0; }
function getMatSec(inv)    { return inv.maturityDate?.seconds || inv.maturityDate?._seconds || null; }

function getExpectedProfit(inv) {
  const amount   = inv.amount || 0;
  const rate     = inv.returnRate ?? inv.rate ?? 0;
  const rateType = inv.rateType;
  const duration = inv.duration;
  if (!rate || !amount) return 0;
  if (rateType === "weekly") { const w = duration ? Math.ceil(duration / 7) : 52; return amount * rate * w; }
  if (rateType === "annual") { const y = duration ? duration / 365 : 3; return amount * rate * y; }
  return amount * rate;
}

function confirmWithPassword(actionLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;`;
    overlay.innerHTML = `
      <div style="background:#0c1425;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:28px 28px 24px;width:100%;max-width:400px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(201,168,76,0.12);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;"><i class="fa-solid fa-lock"></i></div>
          <div>
            <h3 style="font-family:'Syne',sans-serif;font-size:0.95rem;font-weight:700;color:#e2e8f0;margin:0;">Confirm Identity</h3>
            <p style="font-size:0.75rem;color:#64748b;margin:0;">${actionLabel}</p>
          </div>
        </div>
        <p style="font-size:0.82rem;color:#94a3b8;margin-bottom:14px;">Enter your admin password to proceed.</p>
        <div style="position:relative;margin-bottom:8px;">
          <i class="fa-solid fa-lock" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#475569;font-size:0.82rem;pointer-events:none;"></i>
          <input type="password" id="usrConfirmPw" placeholder="Enter your password" style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;" autocomplete="current-password" />
          <button type="button" id="usrPwEyeBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="usrPwEyeIco"></i>
          </button>
        </div>
        <p id="usrConfirmPwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="usrConfirmYes" style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="usrConfirmIcon"></i><span id="usrConfirmTxt">Confirm</span>
          </button>
          <button id="usrConfirmNo" style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const pwInput = overlay.querySelector("#usrConfirmPw");
    const errEl   = overlay.querySelector("#usrConfirmPwErr");
    const yesBtn  = overlay.querySelector("#usrConfirmYes");
    const noBtn   = overlay.querySelector("#usrConfirmNo");
    const eyeBtn  = overlay.querySelector("#usrPwEyeBtn");
    const eyeIco  = overlay.querySelector("#usrPwEyeIco");
    const cIcon   = overlay.querySelector("#usrConfirmIcon");
    const cTxt    = overlay.querySelector("#usrConfirmTxt");
    setTimeout(() => pwInput.focus(), 100);
    eyeBtn.addEventListener("click", () => {
      const h = pwInput.type === "password"; pwInput.type = h ? "text" : "password";
      eyeIco.className = h ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });
    pwInput.addEventListener("keydown", e => { if (e.key === "Enter") yesBtn.click(); });
    noBtn.addEventListener("click", () => { document.body.removeChild(overlay); resolve(false); });
    yesBtn.addEventListener("click", async () => {
      const pw = pwInput.value; errEl.textContent = "";
      if (!pw) { errEl.textContent = "Please enter your password."; return; }
      yesBtn.disabled = true; cIcon.className = "fa-solid fa-spinner fa-spin"; cTxt.textContent = "Verifying...";
      try {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, pw);
        await reauthenticateWithCredential(auth.currentUser, credential);
        document.body.removeChild(overlay); resolve(true);
      } catch (err) {
        yesBtn.disabled = false; cIcon.className = "fa-solid fa-check"; cTxt.textContent = "Confirm";
        errEl.textContent = (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential")
          ? "Incorrect password. Please try again." : "Verification failed. Please try again.";
      }
    });
  });
}

async function loadUsers() {
  const tbody = document.getElementById("usersTableBody");
  tbody.innerHTML = `<tr><td colspan="10" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  try {
    const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
    allUsers   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allUsers   = allUsers.map(u => ({ ...u, emailVerified: u.authEmailVerified === true || u.emailVerified === true }));

    const todayStr = new Date().toLocaleDateString("en-GB");
    let verified = 0, premium = 0, standard = 0, totalBal = 0, todayCount = 0;
    allUsers.forEach(u => {
      if (u.emailVerified)     verified++;
      if (u.premiumActivated)  premium++;
      if (u.standardActivated) standard++;
      totalBal += u.balance || 0;
      const joinedStr = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString("en-GB") : "";
      if (joinedStr === todayStr) todayCount++;
    });

    document.getElementById("statTotal").textContent       = allUsers.length;
    document.getElementById("statToday").textContent       = `Today: ${todayCount} new`;
    document.getElementById("statVerified").textContent    = verified;
    document.getElementById("statVerifiedPct").textContent = `${allUsers.length ? Math.round((verified / allUsers.length) * 100) : 0}% of total`;
    document.getElementById("statPremium").textContent     = premium;
    document.getElementById("statStandard").textContent    = `Standard: ${standard}`;
    document.getElementById("statTotalBal").textContent    = fmtGHS(totalBal);
    document.getElementById("statAvgBal").textContent      = `Avg: ${fmtGHS(allUsers.length ? totalBal / allUsers.length : 0)}`;

    currentPage = 1;
    renderTable(getFilteredUsers());
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="10" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFilteredUsers() {
  const filter = document.getElementById("usersFilter")?.value || "all";
  const search = document.getElementById("usersSearch")?.value.toLowerCase() || "";
  return allUsers.filter(u => {
    const matchSearch = !search || (u.name||"").toLowerCase().includes(search) || (u.email||"").toLowerCase().includes(search) || (u.id||"").toLowerCase().includes(search) || (u.phone||"").toLowerCase().includes(search);
    const matchFilter = filter === "all" ? true : filter === "verified" ? u.emailVerified : filter === "unverified" ? !u.emailVerified : filter === "phone_verified" ? u.phoneVerified : filter === "standard" ? u.standardActivated : filter === "premium" ? u.premiumActivated : filter === "suspended" ? u.suspended : true;
    return matchSearch && matchFilter;
  });
}

function renderTable(data) {
  const tbody    = document.getElementById("usersTableBody");
  const total    = data.length;
  const start    = (currentPage - 1) * PAGE_SIZE;
  const end      = Math.min(start + PAGE_SIZE, total);
  const pageData = data.slice(start, end);

  document.getElementById("usersPageInfo").textContent = `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} users`;
  const prevBtn = document.getElementById("usersPrevBtn");
  const nextBtn = document.getElementById("usersNextBtn");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = end >= total;

  if (!pageData.length) { tbody.innerHTML = `<tr><td colspan="10" class="adm-table-empty">No users found.</td></tr>`; return; }

  tbody.innerHTML = pageData.map(u => {
    const accountId   = u.id.slice(0, 8).toUpperCase();
    const planLabel   = u.premiumActivated ? `<span class="adm-badge active">Premium</span>` : u.standardActivated ? `<span class="adm-badge completed">Standard</span>` : `<span class="adm-badge pending">None</span>`;
    const statusLabel = u.suspended ? `<span class="adm-badge failed">Suspended</span>` : `<span class="adm-badge completed">Active</span>`;
    return `
      <tr>
        <td><div class="adm-user-cell"><div class="adm-user-av">${initials(u.name)}</div><div><p class="adm-user-name">${u.name||"—"}</p><p class="adm-user-email">${u.email||"—"}</p></div></div></td>
        <td><span style="font-family:monospace;font-size:0.78rem;color:var(--adm-muted);">${accountId}</span></td>
        <td style="font-size:0.78rem;">${u.phone||"—"}</td>
        <td><strong>${fmtGHS(u.balance)}</strong></td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(u.createdAt?.seconds)}</td>
        <td><span class="adm-badge ${u.emailVerified?"completed":"pending"}">${u.emailVerified?"✓ Verified":"Unverified"}</span></td>
        <td><span class="adm-badge ${u.phoneVerified?"completed":"pending"}">${u.phoneVerified?"✓ Verified":"Unverified"}</span></td>
        <td>${planLabel}</td>
        <td>${statusLabel}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="adm-action-icon-btn blue" onclick="viewUser('${u.id}')" title="View Full Profile"><i class="fa-solid fa-eye"></i></button>
            <button class="adm-action-icon-btn ${u.suspended?"green":"red"}" onclick="${u.suspended?`unsuspendUser('${u.id}')`:`suspendUser('${u.id}')`}" title="${u.suspended?"Unsuspend":"Suspend"}">
              <i class="fa-solid fa-${u.suspended?"lock-open":"ban"}"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

const TAB_STYLE_ACTIVE   = "padding:8px 16px;border:none;border-radius:8px;background:var(--adm-gold);color:#081c10;font-family:'Syne',sans-serif;font-size:0.78rem;font-weight:700;cursor:pointer;";
const TAB_STYLE_INACTIVE = "padding:8px 16px;border:1px solid var(--adm-border);border-radius:8px;background:transparent;color:var(--adm-muted);font-family:'Syne',sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;";
const TH = (t) => `<th style="padding:10px 10px;text-align:left;font-size:0.68rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;border-bottom:1px solid var(--adm-border);white-space:nowrap;">${t}</th>`;
const TD = (t, color="") => `<td style="padding:10px;font-size:0.8rem;color:${color||"var(--adm-text)"};border-bottom:1px solid var(--adm-border);">${t}</td>`;
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" style="padding:20px;text-align:center;color:var(--adm-muted);font-size:0.82rem;">${msg}</td></tr>`;

function tableWrap(html) {
  return `<div style="overflow-x:auto;max-height:340px;overflow-y:auto;border:1px solid var(--adm-border);border-radius:10px;"><table style="width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;">${html}</table></div>`;
}

function renderProfileTab(u, totalDeposited, totalWithdrawn, activePlans, totalInvested) {
  return `
    <div class="adm-detail-grid" style="margin-bottom:20px;">
      <div class="adm-detail-item"><span>Account ID</span><strong style="font-family:monospace;">${u.id.slice(0,8).toUpperCase()}</strong></div>
      <div class="adm-detail-item"><span>Phone</span><strong>${u.phone||"—"}</strong></div>
      <div class="adm-detail-item"><span>Country</span><strong>${u.country||"—"}</strong></div>
      <div class="adm-detail-item"><span>Joined</span><strong>${fmtDate(u.createdAt?.seconds)}</strong></div>
      <div class="adm-detail-item"><span>Current Balance</span><strong style="color:var(--adm-green);">${fmtGHS(u.balance)}</strong></div>
      <div class="adm-detail-item"><span>Total Deposited</span><strong>${fmtGHS(totalDeposited)}</strong></div>
      <div class="adm-detail-item"><span>Total Withdrawn</span><strong style="color:var(--adm-red);">${fmtGHS(totalWithdrawn)}</strong></div>
      <div class="adm-detail-item"><span>Total Invested</span><strong style="color:var(--adm-gold);">${fmtGHS(totalInvested)}</strong></div>
      <div class="adm-detail-item"><span>Active Plans</span><strong>${activePlans}</strong></div>
      <div class="adm-detail-item"><span>Email Verified</span><strong>${u.emailVerified?"✓ Yes":"✗ No"}</strong></div>
      <div class="adm-detail-item"><span>Phone Verified</span><strong>${u.phoneVerified?"✓ Yes":"✗ No"}</strong></div>
      <div class="adm-detail-item"><span>Standard Plan</span><strong>${u.standardActivated?"✓ Activated":"Not activated"}</strong></div>
      <div class="adm-detail-item"><span>Premium Plan</span><strong>${u.premiumActivated?"✓ Activated":"Not activated"}</strong></div>
      <div class="adm-detail-item"><span>Referral Code</span><strong style="font-family:monospace;">${u.referralCode||"—"}</strong></div>
      <div class="adm-detail-item"><span>Premium Ref Code</span><strong style="font-family:monospace;">${u.premiumReferralCode||"—"}</strong></div>
      <div class="adm-detail-item"><span>Referrals Made</span><strong>${u.referralCount||0}</strong></div>
      <div class="adm-detail-item"><span>Referral Earnings</span><strong>${fmtGHS(u.referralEarnings)}</strong></div>
      <div class="adm-detail-item"><span>Withdrawal Locked</span><strong>${u.withdrawalAccountLocked?"🔒 Locked":"Unlocked"}</strong></div>
      <div class="adm-detail-item"><span>Last Login Device</span><strong style="font-size:0.78rem;">${u.lastLoginDevice||"—"}</strong></div>
      <div class="adm-detail-item"><span>Account Status</span><span class="adm-badge ${u.suspended?"failed":"completed"}">${u.suspended?"Suspended":"Active"}</span></div>
    </div>
    <div style="padding-top:14px;border-top:1px solid var(--adm-border);">
      <p style="font-size:0.75rem;font-weight:700;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Adjust Balance <span style="color:var(--adm-orange);font-weight:600;">— Password required</span></p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="number" id="balAdjustInput" placeholder="Amount (GHS)" min="0" style="padding:8px 12px;background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:8px;color:var(--adm-text);font-family:'DM Sans',sans-serif;font-size:0.85rem;width:160px;outline:none;" />
        <button class="adm-btn green" onclick="adjustBalance('${u.id}','add')"><i class="fa-solid fa-plus"></i> Add</button>
        <button class="adm-btn red"   onclick="adjustBalance('${u.id}','deduct')"><i class="fa-solid fa-minus"></i> Deduct</button>
      </div>
      <p id="balAdjustErr" style="font-size:0.75rem;color:var(--adm-red);margin-top:6px;min-height:16px;"></p>
    </div>`;
}

function renderActivatePlanTab(u) {
  const stdActivated  = u.standardActivated  || false;
  const premActivated = u.premiumActivated    || false;

  const planCard = (tier, activated) => {
    const isStd     = tier === "standard";
    const color     = isStd ? "#22c55e" : "#c9a84c";
    const icon      = isStd ? "fa-solid fa-lock-open" : "fa-solid fa-crown";
    const label     = isStd ? "Standard Plan" : "Premium Plan";
    const fee       = isStd ? "GHS 500" : "GHS 1,000";
    const perks     = isStd
      ? ["Starter Savings (0.5%/week)", "Fixed Deposit (9.5% in 90 days)", "Growth Plus (12.5% in 182 days)", "Standard Loan access"]
      : ["182-Day Growth Tool (15%)", "365-Day Premium Tool (25%)", "3-Year Wealth Builder (35%/yr)", "Premium Loan access", "Premium Referral system"];

    return `
      <div style="background:var(--adm-bg);border:1px solid ${activated ? color+"44" : "var(--adm-border)"};border-radius:14px;padding:20px;flex:1;min-width:220px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
          <div style="width:40px;height:40px;border-radius:10px;background:${color}18;color:${color};display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">
            <i class="${icon}"></i>
          </div>
          <div>
            <p style="font-family:'Syne',sans-serif;font-size:0.92rem;font-weight:700;color:var(--adm-text);margin:0;">${label}</p>
            <p style="font-size:0.72rem;color:var(--adm-muted);margin:0;">Normal activation fee: ${fee}</p>
          </div>
          ${activated ? `<span style="margin-left:auto;font-size:0.7rem;font-weight:700;padding:3px 10px;border-radius:20px;background:${color}22;color:${color};">✓ Active</span>` : ""}
        </div>
        <ul style="list-style:none;padding:0;margin:0 0 16px 0;">
          ${perks.map(p => `<li style="font-size:0.78rem;color:var(--adm-muted);padding:4px 0;display:flex;align-items:center;gap:7px;"><i class="fa-solid fa-check" style="color:${color};font-size:0.68rem;flex-shrink:0;"></i>${p}</li>`).join("")}
        </ul>
        ${activated
          ? `<div style="background:${color}11;border:1px solid ${color}33;border-radius:8px;padding:10px 14px;font-size:0.78rem;color:${color};font-weight:600;text-align:center;">
               <i class="fa-solid fa-circle-check" style="margin-right:6px;"></i>Already activated for this user
             </div>`
          : `<button class="adm-btn ${isStd?"green":"gold"}" style="width:100%;justify-content:center;" onclick="adminActivatePlan('${u.id}','${tier}')">
               <i class="${icon}"></i> Activate ${label} for Free
             </button>`
        }
      </div>`;
  };

  return `
    <div style="margin-bottom:16px;padding:12px 16px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:10px;">
      <p style="font-size:0.82rem;color:var(--adm-text);margin:0;line-height:1.6;">
        <i class="fa-solid fa-circle-info" style="color:var(--adm-gold);margin-right:6px;"></i>
        <strong>Admin Override:</strong> Activate plans for this user without charging their balance. Password confirmation required. The user will receive a notification.
      </p>
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      ${planCard("standard", stdActivated)}
      ${planCard("premium",  premActivated)}
    </div>
    <p id="activatePlanMsg" style="font-size:0.8rem;margin-top:14px;min-height:20px;"></p>`;
}

function renderInvestmentsTab(investments) {
  const rows = investments.length ? investments.map(inv => {
    const matSec    = getMatSec(inv);
    const days      = matSec ? Math.ceil((new Date(matSec * 1000) - new Date()) / 86400000) : null;
    const isMatured = inv.status === "matured" || (matSec && days !== null && days <= 0);
    const matDisplay = matSec ? (isMatured ? `<span style="color:var(--adm-orange);font-size:0.72rem;font-weight:700;">⚠ Matured</span>` : days <= 7 ? `<span style="color:var(--adm-orange);font-size:0.72rem;">In ${days}d</span>` : fmtDate(matSec)) : "Flexible";
    const statusColor = isMatured ? "var(--adm-orange)" : inv.status === "completed" ? "var(--adm-green)" : "var(--adm-blue,#3b82f6)";
    return `<tr>
      ${TD(getPlanName(inv))}
      ${TD(`<strong>${fmtGHS(inv.amount)}</strong>`)}
      ${TD(((inv.returnRate??inv.rate??0)*100).toFixed(1)+"%","var(--adm-green)")}
      ${TD(fmtGHS(getProfitSoFar(inv)),"var(--adm-gold)")}
      ${TD(fmtGHS(getExpectedProfit(inv)),"var(--adm-green)")}
      ${TD(fmtDate(inv.startDate?.seconds||inv.startDate?._seconds))}
      ${TD(matDisplay)}
      ${TD(`<span style="font-size:0.72rem;font-weight:700;color:${statusColor};">${isMatured?"Matured":inv.status||"active"}</span>`)}
    </tr>`;
  }).join("") : emptyRow(8, "No investments found.");
  return tableWrap(`<thead><tr>${TH("Plan")}${TH("Amount")}${TH("Rate")}${TH("Profit So Far")}${TH("Expected Profit")}${TH("Start Date")}${TH("Maturity")}${TH("Status")}</tr></thead><tbody>${rows}</tbody>`);
}

function renderTransactionsTab(transactions) {
  const rows = transactions.length ? transactions.map(t => {
    const isIn  = ["deposit","profit","profit_credit","referral_reward","referral_bonus","activation_refund"].includes(t.type);
    const amt   = t.type === "withdrawal" ? (t.gross || t.amount || 0) : (t.amount || 0);
    const color = isIn ? "var(--adm-green)" : "var(--adm-red)";
    const sign  = isIn ? "+" : "−";
    const statusBadge = `<span class="adm-badge ${t.status==="completed"||!t.status?"completed":t.status==="pending"?"pending":"failed"}">${t.status||"completed"}</span>`;
    return `<tr>
      ${TD(`<span style="font-family:monospace;font-size:0.72rem;color:var(--adm-muted);">${t.reference||"—"}</span>`)}
      ${TD(`<span class="adm-badge pending" style="font-size:0.7rem;">${t.type||"—"}</span>`)}
      ${TD(`<strong style="color:${color};">${sign}${fmtGHS(amt)}</strong>`)}
      ${TD(fmtDateTime(t.date?.seconds))}
      ${TD(statusBadge)}
    </tr>`;
  }).join("") : emptyRow(5, "No transactions found.");
  return tableWrap(`<thead><tr>${TH("Reference")}${TH("Type")}${TH("Amount")}${TH("Date")}${TH("Status")}</tr></thead><tbody>${rows}</tbody>`);
}

function renderWithdrawalsTab(withdrawals) {
  const rows = withdrawals.length ? withdrawals.map(w => {
    const statusBadge = `<span class="adm-badge ${w.status==="completed"?"completed":w.status==="rejected"?"failed":"pending"}">${w.status||"pending"}</span>`;
    return `<tr>
      ${TD(`<span style="font-family:monospace;font-size:0.72rem;color:var(--adm-muted);">${w.reference||"—"}</span>`)}
      ${TD(`<strong style="color:var(--adm-red);">−${fmtGHS(w.gross||w.amount)}</strong>`)}
      ${TD(fmtGHS(w.fee),"var(--adm-muted)")}
      ${TD(`<strong style="color:var(--adm-green);">${fmtGHS(w.amount)}</strong>`)}
      ${TD(w.method||"—")}
      ${TD(fmtDateTime(w.date?.seconds))}
      ${TD(statusBadge)}
    </tr>`;
  }).join("") : emptyRow(7, "No withdrawals found.");
  return tableWrap(`<thead><tr>${TH("Reference")}${TH("Gross")}${TH("Fee")}${TH("Net")}${TH("Method")}${TH("Date")}${TH("Status")}</tr></thead><tbody>${rows}</tbody>`);
}

function renderDepositsTab(deposits) {
  const rows = deposits.length ? deposits.map(d => {
    return `<tr>
      ${TD(`<span style="font-family:monospace;font-size:0.72rem;color:var(--adm-muted);">${d.reference||"—"}</span>`)}
      ${TD(`<strong style="color:var(--adm-green);">+${fmtGHS(d.amount)}</strong>`)}
      ${TD(d.method||d.channel||"Paystack")}
      ${TD(fmtDateTime(d.date?.seconds))}
      ${TD(`<span class="adm-badge ${d.status==="completed"||!d.status?"completed":"pending"}">${d.status||"completed"}</span>`)}
    </tr>`;
  }).join("") : emptyRow(5, "No deposits found.");
  return tableWrap(`<thead><tr>${TH("Reference")}${TH("Amount")}${TH("Method")}${TH("Date")}${TH("Status")}</tr></thead><tbody>${rows}</tbody>`);
}

function renderReferralsTab(referrals, u) {
  const refRows = referrals.length ? referrals.map(r => {
    return `<tr>
      ${TD(`<strong>${r.name||"—"}</strong>`)}
      ${TD(fmtDate(r.createdAt?.seconds))}
      ${TD(r.depositedAt?.seconds ? fmtDate(r.depositedAt.seconds) : "Not yet deposited")}
      ${TD(r.amountEarned ? fmtGHS(r.amountEarned) : "—","var(--adm-gold)")}
      ${TD(`<span class="adm-badge ${r.status==="completed"?"completed":"pending"}">${r.status||"pending"}</span>`)}
    </tr>`;
  }).join("") : emptyRow(5, "No referrals yet.");

  const summary = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
      <div style="background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <p style="font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Referral Code</p>
        <p style="font-size:0.88rem;font-weight:700;font-family:monospace;color:var(--adm-gold);">${u.referralCode||"—"}</p>
      </div>
      <div style="background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <p style="font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Total Referred</p>
        <p style="font-size:0.88rem;font-weight:700;color:var(--adm-text);">${u.referralCount||0}</p>
      </div>
      <div style="background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <p style="font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Total Earned</p>
        <p style="font-size:0.88rem;font-weight:700;color:var(--adm-green);">${fmtGHS(u.referralEarnings||0)}</p>
      </div>
      <div style="background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:10px;padding:12px 16px;flex:1;min-width:120px;">
        <p style="font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Premium Code</p>
        <p style="font-size:0.88rem;font-weight:700;font-family:monospace;color:var(--adm-gold);">${u.premiumReferralCode||"—"}</p>
      </div>
    </div>`;

  return summary + tableWrap(`<thead><tr>${TH("Referred User")}${TH("Joined")}${TH("First Deposit")}${TH("Earned")}${TH("Status")}</tr></thead><tbody>${refRows}</tbody>`);
}

window.viewUser = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;

  const modal  = document.getElementById("userDetailModal");
  const body   = document.getElementById("userModalBody");
  const footer = document.getElementById("userModalFooter");

  body.innerHTML = `<div style="text-align:center;padding:40px;"><i class="fa-solid fa-spinner fa-spin" style="color:var(--adm-gold);font-size:1.8rem;"></i><p style="color:var(--adm-muted);margin-top:12px;font-size:0.82rem;">Loading user data...</p></div>`;
  modal.classList.add("active");

  let transactions = [], investments = [], withdrawals = [], deposits = [], referrals = [];
  let totalDeposited = 0, totalWithdrawn = 0, totalInvested = 0;

  try {
    const [txSnap, invSnap, refSnap] = await Promise.all([
      getDocs(collection(db, "users", uid, "transactions")),
      getDocs(collection(db, "users", uid, "investments")),
      getDocs(collection(db, "users", uid, "referrals"))
    ]);

    txSnap.forEach(d => {
      const t = d.data();
      transactions.push(t);
      if (t.type === "deposit")    { deposits.push(t);    totalDeposited += t.amount || 0; }
      if (t.type === "withdrawal") { withdrawals.push(t); totalWithdrawn += t.gross || t.amount || 0; }
    });

    invSnap.forEach(d => {
      const inv = d.data();
      investments.push({ id: d.id, ...inv });
      if (inv.status === "active" || inv.status === "matured") totalInvested += inv.amount || 0;
    });

    refSnap.forEach(d => referrals.push(d.data()));

    transactions.sort((a,b) => (b.date?.seconds||0)      - (a.date?.seconds||0));
    investments.sort((a,b)  => (b.startDate?.seconds||0)  - (a.startDate?.seconds||0));
    withdrawals.sort((a,b)  => (b.date?.seconds||0)       - (a.date?.seconds||0));
    deposits.sort((a,b)     => (b.date?.seconds||0)       - (a.date?.seconds||0));
    referrals.sort((a,b)    => (b.createdAt?.seconds||0)  - (a.createdAt?.seconds||0));

  } catch (err) { console.error(err); }

  const activePlans = investments.filter(i => i.status === "active" || i.status === "matured").length;

  const tabs = ["profile","activate","investments","transactions","withdrawals","deposits","referrals"];
  const tabLabels = {
    profile:      `<i class="fa-solid fa-user"></i> Profile`,
    activate:     `<i class="fa-solid fa-unlock"></i> Activate Plan`,
    investments:  `<i class="fa-solid fa-chart-line"></i> Investments (${investments.length})`,
    transactions: `<i class="fa-solid fa-clock-rotate-left"></i> Transactions (${transactions.length})`,
    withdrawals:  `<i class="fa-solid fa-upload"></i> Withdrawals (${withdrawals.length})`,
    deposits:     `<i class="fa-solid fa-download"></i> Deposits (${deposits.length})`,
    referrals:    `<i class="fa-solid fa-gift"></i> Referrals (${referrals.length})`
  };

  let activeTab = "profile";

  function renderTabs() {
    const tabBar = document.getElementById("userTabBar");
    if (!tabBar) return;
    tabBar.innerHTML = tabs.map(t => `
      <button onclick="switchTab('${t}')" id="tab_${t}"
        style="${t === activeTab ? TAB_STYLE_ACTIVE : TAB_STYLE_INACTIVE}">
        ${tabLabels[t]}
      </button>`).join("");
  }

  function renderTabContent() {
    const content = document.getElementById("userTabContent");
    if (!content) return;
    if (activeTab === "profile")      content.innerHTML = renderProfileTab(u, totalDeposited, totalWithdrawn, activePlans, totalInvested);
    if (activeTab === "activate")     content.innerHTML = renderActivatePlanTab(u);
    if (activeTab === "investments")  content.innerHTML = renderInvestmentsTab(investments);
    if (activeTab === "transactions") content.innerHTML = renderTransactionsTab(transactions);
    if (activeTab === "withdrawals")  content.innerHTML = renderWithdrawalsTab(withdrawals);
    if (activeTab === "deposits")     content.innerHTML = renderDepositsTab(deposits);
    if (activeTab === "referrals")    content.innerHTML = renderReferralsTab(referrals, u);
  }

  window.switchTab = function(tab) {
    activeTab = tab;
    renderTabs();
    renderTabContent();
  };

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--adm-border);">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--adm-gold-dim);color:var(--adm-gold);font-size:1.1rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials(u.name)}</div>
      <div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:var(--adm-text);margin:0;">${u.name||"—"}</h3>
        <p style="font-size:0.8rem;color:var(--adm-muted);margin:2px 0;">${u.email||"—"}</p>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
          <span class="adm-badge ${u.suspended?"failed":"completed"}">${u.suspended?"Suspended":"Active"}</span>
          <span class="adm-badge ${u.emailVerified?"completed":"pending"}">${u.emailVerified?"✓ Email":"Email Unverified"}</span>
          <span class="adm-badge ${u.phoneVerified?"completed":"pending"}">${u.phoneVerified?"✓ Phone":"Phone Unverified"}</span>
          ${u.premiumActivated?`<span class="adm-badge active">Premium</span>`:u.standardActivated?`<span class="adm-badge completed">Standard</span>`:""}
        </div>
      </div>
      <div style="margin-left:auto;text-align:right;flex-shrink:0;">
        <p style="font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Balance</p>
        <p style="font-size:1.2rem;font-weight:800;font-family:'Syne',sans-serif;color:var(--adm-green);">${fmtGHS(u.balance)}</p>
      </div>
    </div>
    <div id="userTabBar" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;"></div>
    <div id="userTabContent"></div>
  `;

  renderTabs();
  renderTabContent();

  footer.innerHTML = `
    <button class="adm-btn ${u.suspended?"green":"red"}" onclick="${u.suspended?`unsuspendUser('${uid}')`:`suspendUser('${uid}')`}">
      <i class="fa-solid fa-${u.suspended?"lock-open":"ban"}"></i>
      ${u.suspended?"Unsuspend Account":"Suspend Account"}
    </button>
    <button class="adm-btn ghost" onclick="closeUserModal()">Close</button>
  `;
};

window.adminActivatePlan = async function(uid, tier) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;

  const alreadyActivated = tier === "standard" ? u.standardActivated : u.premiumActivated;
  if (alreadyActivated) {
    showToast(`${tier === "standard" ? "Standard" : "Premium"} plan is already activated for ${u.name}.`, "error");
    return;
  }

  const confirmed = await confirmWithPassword(`Activate ${tier} plan for ${u.name} — FREE (admin override)`);
  if (!confirmed) return;

  const msgEl = document.getElementById("activatePlanMsg");
  if (msgEl) { msgEl.style.color = "var(--adm-muted)"; msgEl.textContent = "Activating..."; }

  try {
    const updateFields = {};
    if (tier === "standard") updateFields.standardActivated = true;
    if (tier === "premium")  updateFields.premiumActivated  = true;

    await updateDoc(doc(db, "users", uid), updateFields);

    await addDoc(collection(db, "users", uid, "transactions"), {
      type:   "activation",
      plan:   tier === "standard" ? "Standard Plan Activation" : "Premium Plan Activation",
      amount: 0,
      note:   "Activated by admin — no charge",
      status: "completed",
      date:   serverTimestamp()
    });

    await createNotification(
      uid,
      "activation",
      tier === "standard" ? "Standard Plan Activated 🎉" : "Premium Plan Activated 👑",
      tier === "standard"
        ? "Your Standard investment plan has been activated by our admin team. You can now access Starter Savings, Fixed Deposit, Growth Plus, and Standard Loan plans."
        : "Your Premium investment plan has been activated by our admin team. You can now access all premium investment plans including the 365-Day Premium Tool and 3-Year Wealth Builder."
    );

    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) {
      if (tier === "standard") allUsers[idx].standardActivated = true;
      if (tier === "premium")  allUsers[idx].premiumActivated  = true;
      u.standardActivated = allUsers[idx].standardActivated;
      u.premiumActivated  = allUsers[idx].premiumActivated;
    }

    if (msgEl) { msgEl.style.color = "var(--adm-green)"; msgEl.textContent = `✓ ${tier === "standard" ? "Standard" : "Premium"} plan activated successfully for ${u.name}.`; }

    const content = document.getElementById("userTabContent");
    if (content) content.innerHTML = renderActivatePlanTab(u);

    renderTable(getFilteredUsers());
    showToast(`${tier === "standard" ? "Standard" : "Premium"} plan activated for ${u.name}.`, "success");

  } catch (err) {
    console.error(err);
    if (msgEl) { msgEl.style.color = "var(--adm-red)"; msgEl.textContent = "Failed to activate plan. Please try again."; }
    showToast("Failed to activate plan.", "error");
  }
};

window.closeUserModal = function() {
  document.getElementById("userDetailModal").classList.remove("active");
};

document.getElementById("userModalClose")?.addEventListener("click", closeUserModal);
document.getElementById("userDetailModal")?.addEventListener("click", e => {
  if (e.target.id === "userDetailModal") closeUserModal();
});

window.suspendUser = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Suspend account — ${u.name||"User"}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { suspended: true });
    await createNotification(uid, "security", "Account Suspended", "Your YMG IQ account has been suspended. Please contact support for assistance.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].suspended = true;
    closeUserModal();
    renderTable(getFilteredUsers());
    showToast(`${u.name||"User"} has been suspended.`, "error");
  } catch (err) { console.error(err); showToast("Failed to suspend user.", "error"); }
};

window.unsuspendUser = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Unsuspend account — ${u.name||"User"}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { suspended: false });
    await createNotification(uid, "activation", "Account Reinstated ✅", "Your YMG IQ account has been reinstated. You can now log in and use the platform normally.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].suspended = false;
    closeUserModal();
    renderTable(getFilteredUsers());
    showToast(`${u.name||"User"} has been unsuspended.`, "success");
  } catch (err) { console.error(err); showToast("Failed to unsuspend user.", "error"); }
};

window.adjustBalance = async function(uid, action) {
  const u      = allUsers.find(x => x.id === uid);
  const amount = parseFloat(document.getElementById("balAdjustInput")?.value);
  const errEl  = document.getElementById("balAdjustErr");
  if (errEl) errEl.textContent = "";
  if (!amount || isNaN(amount) || amount <= 0) { if (errEl) errEl.textContent = "Enter a valid amount."; return; }
  const currentBal = u?.balance || 0;
  const newBal     = action === "add" ? currentBal + amount : currentBal - amount;
  if (newBal < 0)  { if (errEl) errEl.textContent = "Balance cannot go below GHS 0."; return; }
  const confirmed = await confirmWithPassword(`${action==="add"?"Add":"Deduct"} ${fmtGHS(amount)} ${action==="add"?"to":"from"} ${u?.name||"user"}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { balance: newBal });
    await createNotification(uid, action==="add"?"deposit":"withdrawal", action==="add"?"Balance Credited":"Balance Adjusted",
      action==="add" ? `GHS ${amount.toFixed(2)} has been added to your account balance by admin.` : `GHS ${amount.toFixed(2)} has been deducted from your account balance by admin.`);
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].balance = newBal;
    if (document.getElementById("balAdjustInput")) document.getElementById("balAdjustInput").value = "";
    showToast(`Balance updated. New balance: ${fmtGHS(newBal)}`, "success");
    viewUser(uid);
  } catch (err) { console.error(err); if (errEl) errEl.textContent = "Failed to update balance."; }
};

document.getElementById("usersFilter")?.addEventListener("change", () => { currentPage = 1; renderTable(getFilteredUsers()); });
document.getElementById("usersSearch")?.addEventListener("input",  () => { currentPage = 1; renderTable(getFilteredUsers()); });
document.getElementById("admRefresh")?.addEventListener("click", loadUsers);
document.getElementById("usersPrevBtn")?.addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderTable(getFilteredUsers()); } });
document.getElementById("usersNextBtn")?.addEventListener("click", () => { if (currentPage * PAGE_SIZE < getFilteredUsers().length) { currentPage++; renderTable(getFilteredUsers()); } });

loadUsers();