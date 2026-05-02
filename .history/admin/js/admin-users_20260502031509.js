import { db } from "../../js/firebase.js";
import { auth } from "../../js/firebase.js";
import {
  collection, getDocs, doc,
  updateDoc, query, orderBy
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

function confirmWithPassword(actionLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.75);
      display:flex;align-items:center;justify-content:center;
      z-index:9999;padding:20px;
    `;
    overlay.innerHTML = `
      <div style="background:#0c1425;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:28px 28px 24px;width:100%;max-width:400px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
          <div style="width:40px;height:40px;border-radius:10px;background:rgba(201,168,76,0.12);color:#c9a84c;display:flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0;">
            <i class="fa-solid fa-lock"></i>
          </div>
          <div>
            <h3 style="font-family:'Syne',sans-serif;font-size:0.95rem;font-weight:700;color:#e2e8f0;margin:0;">Confirm Identity</h3>
            <p style="font-size:0.75rem;color:#64748b;margin:0;">${actionLabel}</p>
          </div>
        </div>
        <p style="font-size:0.82rem;color:#94a3b8;margin-bottom:14px;">Enter your admin password to proceed.</p>
        <div style="position:relative;margin-bottom:8px;">
          <i class="fa-solid fa-lock" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#475569;font-size:0.82rem;pointer-events:none;"></i>
          <input type="password" id="adminConfirmPw" placeholder="Enter your password"
            style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;"
            autocomplete="current-password" />
          <button type="button" id="adminPwEyeBtn"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="adminPwEyeIco"></i>
          </button>
        </div>
        <p id="adminConfirmPwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="adminConfirmYes"
            style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="adminConfirmIcon"></i>
            <span id="adminConfirmTxt">Confirm</span>
          </button>
          <button id="adminConfirmNo"
            style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">
            Cancel
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const pwInput  = overlay.querySelector("#adminConfirmPw");
    const errEl    = overlay.querySelector("#adminConfirmPwErr");
    const yesBtn   = overlay.querySelector("#adminConfirmYes");
    const noBtn    = overlay.querySelector("#adminConfirmNo");
    const eyeBtn   = overlay.querySelector("#adminPwEyeBtn");
    const eyeIco   = overlay.querySelector("#adminPwEyeIco");
    const confIcon = overlay.querySelector("#adminConfirmIcon");
    const confTxt  = overlay.querySelector("#adminConfirmTxt");

    setTimeout(() => pwInput.focus(), 100);

    eyeBtn.addEventListener("click", () => {
      const hidden     = pwInput.type === "password";
      pwInput.type     = hidden ? "text" : "password";
      eyeIco.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    });

    pwInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") yesBtn.click();
    });

    noBtn.addEventListener("click", () => {
      document.body.removeChild(overlay);
      resolve(false);
    });

    yesBtn.addEventListener("click", async () => {
      const pw = pwInput.value;
      errEl.textContent = "";
      if (!pw) { errEl.textContent = "Please enter your password."; return; }

      yesBtn.disabled    = true;
      confIcon.className = "fa-solid fa-spinner fa-spin";
      confTxt.textContent = "Verifying...";

      try {
        const user       = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, pw);
        await reauthenticateWithCredential(user, credential);
        document.body.removeChild(overlay);
        resolve(true);
      } catch (err) {
        yesBtn.disabled    = false;
        confIcon.className = "fa-solid fa-check";
        confTxt.textContent = "Confirm";
        if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
          errEl.textContent = "Incorrect password. Please try again.";
        } else {
          errEl.textContent = "Verification failed. Please try again.";
        }
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

    // FIX: emailVerified in Firestore may be stale.
    // Firebase Auth is the source of truth. We sync it by checking
    // the user's own Firestore emailVerified field AND the field
    // written by login.js when the user last logged in (authEmailVerified).
    // We treat a user as verified if EITHER field is true.
    allUsers = allUsers.map(u => ({
      ...u,
      emailVerified: u.authEmailVerified === true || u.emailVerified === true
    }));

    const todayStr = new Date().toLocaleDateString("en-GB");
    let verified = 0, premium = 0, standard = 0, totalBal = 0, todayCount = 0;

    allUsers.forEach(u => {
      if (u.emailVerified)     verified++;
      if (u.premiumActivated)  premium++;
      if (u.standardActivated) standard++;
      totalBal += u.balance || 0;
      const joinedStr = u.createdAt?.seconds
        ? new Date(u.createdAt.seconds * 1000).toLocaleDateString("en-GB") : "";
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
    const matchSearch = !search ||
      (u.name  || "").toLowerCase().includes(search) ||
      (u.email || "").toLowerCase().includes(search) ||
      (u.id    || "").toLowerCase().includes(search) ||
      (u.phone || "").toLowerCase().includes(search);

    const matchFilter =
      filter === "all"            ? true :
      filter === "verified"       ? u.emailVerified :
      filter === "unverified"     ? !u.emailVerified :
      filter === "phone_verified" ? u.phoneVerified :
      filter === "standard"       ? u.standardActivated :
      filter === "premium"        ? u.premiumActivated :
      filter === "suspended"      ? u.suspended :
      true;

    return matchSearch && matchFilter;
  });
}

function renderTable(data) {
  const tbody    = document.getElementById("usersTableBody");
  const total    = data.length;
  const start    = (currentPage - 1) * PAGE_SIZE;
  const end      = Math.min(start + PAGE_SIZE, total);
  const pageData = data.slice(start, end);

  document.getElementById("usersPageInfo").textContent =
    `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} users`;

  const prevBtn = document.getElementById("usersPrevBtn");
  const nextBtn = document.getElementById("usersNextBtn");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = end >= total;

  if (!pageData.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="adm-table-empty">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageData.map(u => {
    const accountId   = u.id.slice(0, 8).toUpperCase();
    const planLabel   = u.premiumActivated  ? `<span class="adm-badge active">Premium</span>` :
                        u.standardActivated ? `<span class="adm-badge completed">Standard</span>` :
                        `<span class="adm-badge pending">None</span>`;
    const statusLabel = u.suspended
      ? `<span class="adm-badge failed">Suspended</span>`
      : `<span class="adm-badge completed">Active</span>`;

    return `
      <tr>
        <td>
          <div class="adm-user-cell">
            <div class="adm-user-av">${initials(u.name)}</div>
            <div>
              <p class="adm-user-name">${u.name || "—"}</p>
              <p class="adm-user-email">${u.email || "—"}</p>
            </div>
          </div>
        </td>
        <td><span style="font-family:monospace;font-size:0.78rem;color:var(--adm-muted);">${accountId}</span></td>
        <td style="font-size:0.78rem;">${u.phone || "—"}</td>
        <td><strong>${fmtGHS(u.balance)}</strong></td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(u.createdAt?.seconds)}</td>
        <td><span class="adm-badge ${u.emailVerified ? "completed" : "pending"}">${u.emailVerified ? "✓ Verified" : "Unverified"}</span></td>
        <td><span class="adm-badge ${u.phoneVerified ? "completed" : "pending"}">${u.phoneVerified ? "✓ Verified" : "Unverified"}</span></td>
        <td>${planLabel}</td>
        <td>${statusLabel}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="adm-action-icon-btn blue" onclick="viewUser('${u.id}')" title="View Details">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="adm-action-icon-btn ${u.suspended ? "green" : "red"}"
              onclick="${u.suspended ? `unsuspendUser('${u.id}')` : `suspendUser('${u.id}')`}"
              title="${u.suspended ? "Unsuspend" : "Suspend"}">
              <i class="fa-solid fa-${u.suspended ? "lock-open" : "ban"}"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function getProfitSoFar(inv) { return inv.profitEarned || 0; }

function getExpectedProfit(inv) {
  const amount   = inv.amount || 0;
  const rate     = inv.returnRate ?? inv.rate ?? 0;
  const duration = inv.duration;
  const rateType = inv.rateType;
  if (!rate || !amount) return 0;
  if (rateType === "weekly") { const weeks = duration ? Math.ceil(duration / 7) : 52; return amount * rate * weeks; }
  if (rateType === "annual") { const years = duration ? duration / 365 : 3; return amount * rate * years; }
  return amount * rate;
}

function getPlanName(inv) { return inv.planName || inv.plan || "—"; }

function getMatSec(inv) { return inv.maturityDate?.seconds || inv.maturityDate?._seconds || null; }

window.viewUser = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;

  const modal  = document.getElementById("userDetailModal");
  const body   = document.getElementById("userModalBody");
  const footer = document.getElementById("userModalFooter");

  body.innerHTML = `<div style="text-align:center;padding:24px;"><i class="fa-solid fa-spinner fa-spin" style="color:var(--adm-gold);font-size:1.5rem;"></i></div>`;
  modal.classList.add("active");

  let txCount = 0, totalDeposited = 0, totalWithdrawn = 0;
  let investments = [];

  try {
    const txSnap  = await getDocs(collection(db, "users", uid, "transactions"));
    const invSnap = await getDocs(collection(db, "users", uid, "investments"));

    txSnap.forEach(d => {
      const t = d.data();
      if (t.type === "deposit")    { txCount++; totalDeposited += t.amount || 0; }
      if (t.type === "withdrawal") { txCount++; totalWithdrawn += t.gross || t.amount || 0; }
    });

    invSnap.forEach(d => { investments.push({ id: d.id, ...d.data() }); });
    investments.sort((a, b) => (b.startDate?.seconds || 0) - (a.startDate?.seconds || 0));
  } catch (err) { console.error(err); }

  const activePlans = investments.filter(i => i.status === "active" || i.status === "matured").length;

  const invRows = investments.length ? investments.map(inv => {
    const planName      = getPlanName(inv);
    const profitSoFar   = getProfitSoFar(inv);
    const expectedProfit = getExpectedProfit(inv);
    const matSec        = getMatSec(inv);
    const days          = matSec ? Math.ceil((new Date(matSec * 1000) - new Date()) / 86400000) : null;
    const isMatured     = inv.status === "matured" || (matSec && days !== null && days <= 0);

    const statusColor   = isMatured ? "var(--adm-orange)" : inv.status === "completed" ? "var(--adm-green)" : "var(--adm-blue, #3b82f6)";
    const statusLabel   = isMatured ? "Matured" : inv.status || "active";

    const maturityDisplay = matSec
      ? (isMatured ? `<span style="color:var(--adm-orange);font-size:0.72rem;font-weight:700;">⚠ Matured</span>`
         : days !== null && days <= 7 ? `<span style="color:var(--adm-orange);font-size:0.72rem;">In ${days}d</span>`
         : `<span style="font-size:0.72rem;color:var(--adm-muted);">${fmtDate(matSec)}</span>`)
      : `<span style="font-size:0.72rem;color:var(--adm-muted);">Flexible</span>`;

    return `
      <tr style="border-bottom:1px solid var(--adm-border);">
        <td style="padding:10px 8px;font-size:0.8rem;font-weight:600;color:var(--adm-text);">${planName}</td>
        <td style="padding:10px 8px;font-size:0.82rem;"><strong>${fmtGHS(inv.amount)}</strong></td>
        <td style="padding:10px 8px;font-size:0.78rem;color:var(--adm-green);">${((inv.returnRate ?? inv.rate ?? 0) * 100).toFixed(1)}%</td>
        <td style="padding:10px 8px;font-size:0.78rem;color:var(--adm-gold);">${fmtGHS(profitSoFar)}</td>
        <td style="padding:10px 8px;font-size:0.78rem;color:var(--adm-green);">${fmtGHS(expectedProfit)}</td>
        <td style="padding:10px 8px;">${maturityDisplay}</td>
        <td style="padding:10px 8px;"><span style="font-size:0.72rem;font-weight:700;color:${statusColor};">${statusLabel}</span></td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7" style="padding:16px;text-align:center;color:var(--adm-muted);font-size:0.82rem;">No investments found.</td></tr>`;

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--adm-border);">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--adm-gold-dim);color:var(--adm-gold);font-size:1.2rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials(u.name)}</div>
      <div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1.05rem;font-weight:700;color:var(--adm-text);">${u.name || "—"}</h3>
        <p style="font-size:0.8rem;color:var(--adm-muted);">${u.email || "—"}</p>
        <span class="adm-badge ${u.suspended ? "failed" : "completed"}" style="margin-top:4px;">${u.suspended ? "Suspended" : "Active"}</span>
      </div>
    </div>

    <div class="adm-detail-grid">
      <div class="adm-detail-item"><span>Account ID</span><strong style="font-family:monospace;">${u.id.slice(0,8).toUpperCase()}</strong></div>
      <div class="adm-detail-item"><span>Phone</span><strong>${u.phone || "—"}</strong></div>
      <div class="adm-detail-item"><span>Country</span><strong>${u.country || "—"}</strong></div>
      <div class="adm-detail-item"><span>Joined</span><strong>${fmtDate(u.createdAt?.seconds)}</strong></div>
      <div class="adm-detail-item"><span>Current Balance</span><strong style="color:var(--adm-green);">${fmtGHS(u.balance)}</strong></div>
      <div class="adm-detail-item"><span>Total Deposited</span><strong>${fmtGHS(totalDeposited)}</strong></div>
      <div class="adm-detail-item"><span>Total Withdrawn</span><strong style="color:var(--adm-red);">${fmtGHS(totalWithdrawn)}</strong></div>
      <div class="adm-detail-item"><span>Active Plans</span><strong>${activePlans}</strong></div>
      <div class="adm-detail-item"><span>Email Verified</span><strong>${u.emailVerified ? "✓ Yes" : "✗ No"}</strong></div>
      <div class="adm-detail-item"><span>Phone Verified</span><strong>${u.phoneVerified ? "✓ Yes" : "✗ No"}</strong></div>
      <div class="adm-detail-item"><span>Standard Plan</span><strong>${u.standardActivated ? "✓ Activated" : "Not activated"}</strong></div>
      <div class="adm-detail-item"><span>Premium Plan</span><strong>${u.premiumActivated ? "✓ Activated" : "Not activated"}</strong></div>
      <div class="adm-detail-item"><span>Referral Code</span><strong style="font-family:monospace;">${u.referralCode || "—"}</strong></div>
      <div class="adm-detail-item"><span>Referrals Made</span><strong>${u.referralCount || 0}</strong></div>
      <div class="adm-detail-item"><span>Referral Earnings</span><strong>${fmtGHS(u.referralEarnings)}</strong></div>
      <div class="adm-detail-item"><span>Withdrawal Locked</span><strong>${u.withdrawalAccountLocked ? "🔒 Locked" : "Unlocked"}</strong></div>
    </div>

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--adm-border);">
      <p style="font-size:0.78rem;font-weight:700;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">
        <i class="fa-solid fa-chart-line" style="color:var(--adm-gold);margin-right:6px;"></i>
        Investment History (${investments.length} plan${investments.length !== 1 ? "s" : ""})
      </p>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-family:'DM Sans',sans-serif;">
          <thead>
            <tr style="border-bottom:2px solid var(--adm-border);">
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Plan</th>
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Amount</th>
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Rate</th>
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Profit So Far</th>
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Expected Profit</th>
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Maturity</th>
              <th style="padding:8px;text-align:left;font-size:0.7rem;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Status</th>
            </tr>
          </thead>
          <tbody>${invRows}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--adm-border);">
      <p style="font-size:0.78rem;font-weight:700;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">
        Adjust Balance <span style="color:var(--adm-orange);font-size:0.68rem;font-weight:600;">— Password required</span>
      </p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="number" id="balAdjustInput" placeholder="Amount (GHS)" min="0"
          style="padding:8px 12px;background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:8px;color:var(--adm-text);font-family:'DM Sans',sans-serif;font-size:0.85rem;width:160px;outline:none;" />
        <button class="adm-btn green" onclick="adjustBalance('${uid}', 'add')">
          <i class="fa-solid fa-plus"></i> Add
        </button>
        <button class="adm-btn red" onclick="adjustBalance('${uid}', 'deduct')">
          <i class="fa-solid fa-minus"></i> Deduct
        </button>
      </div>
      <p id="balAdjustErr" style="font-size:0.75rem;color:var(--adm-red);margin-top:6px;min-height:16px;"></p>
    </div>
  `;

  footer.innerHTML = `
    <button class="adm-btn ${u.suspended ? "green" : "red"}"
      onclick="${u.suspended ? `unsuspendUser('${uid}')` : `suspendUser('${uid}')`}">
      <i class="fa-solid fa-${u.suspended ? "lock-open" : "ban"}"></i>
      ${u.suspended ? "Unsuspend Account" : "Suspend Account"}
    </button>
    <button class="adm-btn ghost" onclick="closeUserModal()">Close</button>
  `;
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
  const confirmed = await confirmWithPassword(`Suspend account — ${u.name || "User"}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { suspended: true });
    await createNotification(uid, "security", "Account Suspended", "Your YMG IQ account has been suspended. Please contact support for assistance.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].suspended = true;
    closeUserModal();
    renderTable(getFilteredUsers());
    showToast(`${u.name || "User"} has been suspended.`, "error");
  } catch (err) {
    console.error(err);
    showToast("Failed to suspend user. Please try again.", "error");
  }
};

window.unsuspendUser = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Unsuspend account — ${u.name || "User"}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { suspended: false });
    await createNotification(uid, "activation", "Account Reinstated ✅", "Your YMG IQ account has been reinstated. You can now log in and use the platform normally.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].suspended = false;
    closeUserModal();
    renderTable(getFilteredUsers());
    showToast(`${u.name || "User"} has been unsuspended.`, "success");
  } catch (err) {
    console.error(err);
    showToast("Failed to unsuspend user. Please try again.", "error");
  }
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

  const actionLabel = `${action === "add" ? "Add" : "Deduct"} ${fmtGHS(amount)} ${action === "add" ? "to" : "from"} ${u?.name || "user"}`;
  const confirmed   = await confirmWithPassword(actionLabel);
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "users", uid), { balance: newBal });
    await createNotification(
      uid,
      action === "add" ? "deposit" : "withdrawal",
      action === "add" ? "Balance Credited" : "Balance Adjusted",
      action === "add"
        ? `GHS ${amount.toFixed(2)} has been added to your account balance by admin.`
        : `GHS ${amount.toFixed(2)} has been deducted from your account balance by admin.`
    );
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].balance = newBal;
    if (errEl) errEl.textContent = "";
    if (document.getElementById("balAdjustInput")) document.getElementById("balAdjustInput").value = "";
    showToast(`Balance updated. New balance: ${fmtGHS(newBal)}`, "success");
    viewUser(uid);
  } catch (err) {
    console.error(err);
    if (errEl) errEl.textContent = "Failed to update balance. Please try again.";
  }
};

document.getElementById("usersFilter")?.addEventListener("change", () => { currentPage = 1; renderTable(getFilteredUsers()); });
document.getElementById("usersSearch")?.addEventListener("input",  () => { currentPage = 1; renderTable(getFilteredUsers()); });
document.getElementById("admRefresh")?.addEventListener("click", loadUsers);

document.getElementById("usersPrevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; renderTable(getFilteredUsers()); }
});

document.getElementById("usersNextBtn")?.addEventListener("click", () => {
  const total = getFilteredUsers().length;
  if (currentPage * PAGE_SIZE < total) { currentPage++; renderTable(getFilteredUsers()); }
});

loadUsers();