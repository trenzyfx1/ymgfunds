import { db } from "../../js/firebase.js";
import { auth } from "../../js/firebase.js";
import {
  collection, getDocs, doc,
  updateDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

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
          <input type="password" id="invConfirmPw" placeholder="Enter your password"
            style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;"
            autocomplete="current-password" />
          <button type="button" id="invPwEyeBtn"
            style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="invPwEyeIco"></i>
          </button>
        </div>
        <p id="invConfirmPwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="invConfirmYes"
            style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="invConfirmIcon"></i>
            <span id="invConfirmTxt">Confirm</span>
          </button>
          <button id="invConfirmNo"
            style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">
            Cancel
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const pwInput  = overlay.querySelector("#invConfirmPw");
    const errEl    = overlay.querySelector("#invConfirmPwErr");
    const yesBtn   = overlay.querySelector("#invConfirmYes");
    const noBtn    = overlay.querySelector("#invConfirmNo");
    const eyeBtn   = overlay.querySelector("#invPwEyeBtn");
    const eyeIco   = overlay.querySelector("#invPwEyeIco");
    const confIcon = overlay.querySelector("#invConfirmIcon");
    const confTxt  = overlay.querySelector("#invConfirmTxt");

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

const PAGE_SIZE    = 25;
let allInvestments = [];
let currentPage    = 1;

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

function showToast(msg, type = "success") {
  const toast = document.getElementById("admToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `adm-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}

function daysUntilMaturity(maturitySeconds) {
  if (!maturitySeconds) return null;
  const diff = new Date(maturitySeconds * 1000) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getPlanName(inv) {
  return inv.planName || inv.plan || "—";
}

function getReturnRate(inv) {
  const rate = inv.returnRate ?? inv.rate ?? 0;
  return (rate * 100).toFixed(1);
}

function getProfitSoFar(inv) {
  return inv.profitEarned || 0;
}

function getExpectedProfit(inv) {
  const amount   = inv.amount || 0;
  const rate     = inv.returnRate ?? inv.rate ?? 0;
  const duration = inv.duration;
  const rateType = inv.rateType;

  if (!rate || !amount) return 0;

  if (rateType === "weekly") {
    const weeks = duration ? Math.ceil(duration / 7) : 52;
    return amount * rate * weeks;
  }
  if (rateType === "annual") {
    const years = duration ? duration / 365 : 3;
    return amount * rate * years;
  }
  return amount * rate;
}

function getMaturitySeconds(inv) {
  return inv.maturityDate?.seconds || inv.maturityDate?._seconds || null;
}

function getStartSeconds(inv) {
  return inv.startDate?.seconds || inv.startDate?._seconds || null;
}

async function loadInvestments() {
  const tbody = document.getElementById("invTableBody");
  tbody.innerHTML = `<tr><td colspan="10" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  allInvestments = [];

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const promises = users.map(async (user) => {
      const invSnap = await getDocs(collection(db, "users", user.id, "investments"));
      invSnap.forEach(d => {
        allInvestments.push({
          ...d.data(),
          invId:     d.id,
          userName:  user.name,
          userEmail: user.email,
          userId:    user.id
        });
      });
    });

    await Promise.all(promises);

    allInvestments.sort((a, b) => (getStartSeconds(b) || 0) - (getStartSeconds(a) || 0));

    let activeCount = 0, activeAmt = 0;
    let completedCount = 0, completedAmt = 0;
    let totalAmt = 0, soonCount = 0;

    allInvestments.forEach(inv => {
      const amt = inv.amount || 0;
      totalAmt += amt;
      if (inv.status === "active" || inv.status === "matured") {
        activeCount++; activeAmt += amt;
        const matSec = getMaturitySeconds(inv);
        const days   = daysUntilMaturity(matSec);
        if (days !== null && days >= 0 && days <= 7) soonCount++;
      }
      if (inv.status === "completed") { completedCount++; completedAmt += amt; }
    });

    document.getElementById("statActive").textContent       = activeCount;
    document.getElementById("statActiveAmt").textContent    = `${fmtGHS(activeAmt)} invested`;
    document.getElementById("statCompleted").textContent    = completedCount;
    document.getElementById("statCompletedAmt").textContent = `${fmtGHS(completedAmt)} matured`;
    document.getElementById("statTotal").textContent        = fmtGHS(totalAmt);
    document.getElementById("statTotalCount").textContent   = `${allInvestments.length} all time`;
    document.getElementById("statSoon").textContent         = soonCount;

    currentPage = 1;
    renderTable(getFiltered());

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="9" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFiltered() {
  const status = document.getElementById("invStatusFilter")?.value || "all";
  const plan   = document.getElementById("invPlanFilter")?.value   || "all";
  const search = document.getElementById("invSearch")?.value.toLowerCase() || "";

  return allInvestments.filter(inv => {
    const planName    = getPlanName(inv);
    const matchStatus = status === "all" || inv.status === status;
    const matchPlan   = plan   === "all" || planName === plan;
    const matchSearch = !search ||
      (inv.userName  || "").toLowerCase().includes(search) ||
      (inv.userEmail || "").toLowerCase().includes(search);
    return matchStatus && matchPlan && matchSearch;
  });
}

function renderTable(data) {
  const tbody  = document.getElementById("invTableBody");
  const total  = data.length;
  const start  = (currentPage - 1) * PAGE_SIZE;
  const end    = Math.min(start + PAGE_SIZE, total);
  const page   = data.slice(start, end);

  document.getElementById("invPageInfo").textContent =
    `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} plans`;

  const prevBtn = document.getElementById("invPrevBtn");
  const nextBtn = document.getElementById("invNextBtn");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = end >= total;

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="adm-table-empty">No investments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = page.map(inv => {
    const planName       = getPlanName(inv);
    const returnRatePct  = getReturnRate(inv);
    const profitSoFar    = getProfitSoFar(inv);
    const expectedProfit = getExpectedProfit(inv);
    const matSec         = getMaturitySeconds(inv);
    const days           = daysUntilMaturity(matSec);
    const isMatured      = inv.status === "matured" || (matSec && days !== null && days <= 0);

    const maturityTag = matSec
      ? (isMatured
          ? `<span style="font-size:0.72rem;color:var(--adm-red);font-weight:700;">⚠ Matured</span>`
          : days !== null && days <= 7
            ? `<span style="font-size:0.72rem;color:var(--adm-orange);font-weight:700;">In ${days}d</span>`
            : `<span style="font-size:0.72rem;color:var(--adm-muted);">${fmtDate(matSec)}</span>`)
      : `<span style="font-size:0.72rem;color:var(--adm-muted);">Flexible</span>`;

    const statusBadge = isMatured
      ? `<span class="adm-badge orange">Matured</span>`
      : inv.status === "completed"
        ? `<span class="adm-badge completed">Completed</span>`
        : `<span class="adm-badge active">Active</span>`;

    return `
      <tr>
        <td>
          <div class="adm-user-cell">
            <div class="adm-user-av">${initials(inv.userName)}</div>
            <div>
              <p class="adm-user-name">${inv.userName || "—"}</p>
              <p class="adm-user-email">${inv.userEmail || ""}</p>
            </div>
          </div>
        </td>
        <td style="font-size:0.8rem;font-weight:600;">${planName}</td>
        <td><strong>${fmtGHS(inv.amount)}</strong></td>
        <td style="color:var(--adm-green);font-weight:600;">${returnRatePct}%</td>
        <td style="color:var(--adm-gold);">${fmtGHS(profitSoFar)}</td>
        <td style="color:var(--adm-green);">${fmtGHS(expectedProfit)}</td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(getStartSeconds(inv))}</td>
        <td>${maturityTag}</td>
        <td>${statusBadge}</td>
        <td>
          <button class="adm-action-icon-btn blue" onclick="viewInvestment('${inv.userId}','${inv.invId}')" title="View">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

window.viewInvestment = function(userId, invId) {
  const inv = allInvestments.find(x => x.userId === userId && x.invId === invId);
  if (!inv) return;

  const modal  = document.getElementById("invDetailModal");
  const body   = document.getElementById("invModalBody");
  const footer = document.getElementById("invModalFooter");

  const planName       = getPlanName(inv);
  const returnRatePct  = getReturnRate(inv);
  const expectedProfit = getExpectedProfit(inv);
  const principal      = inv.amount || 0;
  const totalReturn    = principal + expectedProfit;
  const matSec         = getMaturitySeconds(inv);
  const days           = daysUntilMaturity(matSec);
  const isMatured      = inv.status === "matured" || (matSec && days !== null && days <= 0);
  const currentProfit  = inv.profitEarned || 0;

  body.innerHTML = `
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><span>User</span><strong>${inv.userName || "—"}</strong></div>
      <div class="adm-detail-item"><span>Email</span><strong>${inv.userEmail || "—"}</strong></div>
      <div class="adm-detail-item"><span>Plan</span><strong>${planName}</strong></div>
      <div class="adm-detail-item"><span>Status</span><span class="adm-badge ${isMatured ? "orange" : inv.status === "completed" ? "completed" : "active"}">${isMatured ? "Matured" : inv.status || "active"}</span></div>
      <div class="adm-detail-item"><span>Principal Invested</span><strong>${fmtGHS(principal)}</strong></div>
      <div class="adm-detail-item"><span>Return Rate</span><strong style="color:var(--adm-green);">${returnRatePct}%</strong></div>
      <div class="adm-detail-item"><span>Profit Earned So Far</span><strong style="color:var(--adm-gold);">${fmtGHS(currentProfit)}</strong></div>
      <div class="adm-detail-item"><span>Expected Full Profit</span><strong style="color:var(--adm-gold);">${fmtGHS(expectedProfit)}</strong></div>
      <div class="adm-detail-item"><span>Total at Maturity</span><strong style="color:var(--adm-green);">${fmtGHS(totalReturn)}</strong></div>
      <div class="adm-detail-item"><span>Start Date</span><strong>${fmtDate(getStartSeconds(inv))}</strong></div>
      <div class="adm-detail-item"><span>Maturity Date</span><strong>${matSec ? fmtDate(matSec) : "Flexible / No fixed date"}</strong></div>
      <div class="adm-detail-item"><span>Days Remaining</span><strong style="color:${days !== null && days <= 7 ? "var(--adm-orange)" : "var(--adm-text)"};">${days !== null ? (days <= 0 ? "⚠ Matured" : `${days} days`) : "Flexible"}</strong></div>
      <div class="adm-detail-item"><span>Profit Credited</span><strong>${inv.profitCredited ? "✓ Yes — Completed" : "Not yet"}</strong></div>
      <div class="adm-detail-item"><span>Plan Type</span><strong>${inv.rateType || "—"}</strong></div>
    </div>

    ${isMatured && !inv.profitCredited ? `
      <div style="margin-top:16px;padding:14px 16px;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2);border-radius:10px;">
        <p style="font-size:0.82rem;color:var(--adm-orange);font-weight:600;margin-bottom:4px;">⚠ This plan has matured and is awaiting payout.</p>
        <p style="font-size:0.78rem;color:var(--adm-muted);">Click "Release to User" below to return the principal <strong style="color:var(--adm-text);">${fmtGHS(principal)}</strong> + profit <strong style="color:var(--adm-text);">${fmtGHS(currentProfit || expectedProfit)}</strong> = <strong style="color:var(--adm-green);">${fmtGHS(principal + (currentProfit || expectedProfit))}</strong> to the user's balance.</p>
      </div>
    ` : ""}
  `;

  const canRelease = (inv.status === "active" || inv.status === "matured") && !inv.profitCredited;

  footer.innerHTML = canRelease ? `
    <button class="adm-btn green" onclick="releaseToUser('${userId}','${invId}')">
      <i class="fa-solid fa-coins"></i> Release Principal + Profit to User
    </button>
    <button class="adm-btn ghost" onclick="closeInvModal()">Close</button>
  ` : `
    <p style="color:var(--adm-muted);font-size:0.82rem;">${inv.profitCredited ? "This plan has already been completed and paid out." : "No action available."}</p>
    <button class="adm-btn ghost" onclick="closeInvModal()">Close</button>
  `;

  modal.classList.add("active");
};

window.closeInvModal = function() {
  document.getElementById("invDetailModal").classList.remove("active");
};

document.getElementById("invModalClose")?.addEventListener("click", closeInvModal);
document.getElementById("invDetailModal")?.addEventListener("click", e => {
  if (e.target.id === "invDetailModal") closeInvModal();
});

window.releaseToUser = async function(userId, invId) {
  const inv = allInvestments.find(x => x.userId === userId && x.invId === invId);
  if (!inv) return;

  const principal      = inv.amount || 0;
  const currentProfit  = inv.profitEarned || getExpectedProfit(inv);
  const totalPayout    = principal + currentProfit;
  const planName       = getPlanName(inv);

  const confirmed = await confirmWithPassword(
    `Release ${fmtGHS(totalPayout)} to ${inv.userName} — ${planName}`
  );
  if (!confirmed) return;

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const userDoc   = usersSnap.docs.find(d => d.id === userId);
    const currentBal = userDoc?.data()?.balance || 0;
    const newBalance = currentBal + totalPayout;

    await updateDoc(doc(db, "users", userId), {
      balance:     newBalance,
      invested:    Math.max(0, (userDoc?.data()?.invested || 0) - principal),
      activePlans: Math.max(0, (userDoc?.data()?.activePlans || 0) - 1)
    });

    await updateDoc(doc(db, "users", userId, "investments", invId), {
      status:         "completed",
      profitCredited: true,
      completedAt:    serverTimestamp()
    });

    const ref = "PAYOUT-" + Date.now();
    await addDoc(collection(db, "users", userId, "transactions"), {
      type:      "profit_credit",
      amount:    totalPayout,
      planName:  planName,
      reference: ref,
      note:      `Principal ${fmtGHS(principal)} + Profit ${fmtGHS(currentProfit)} released by admin`,
      status:    "completed",
      date:      serverTimestamp()
    });

    await createNotification(
      userId,
      "profit",
      "Investment Matured — Funds Released 🎉",
      `Your ${planName} plan has matured! Your principal of ${fmtGHS(principal)} plus profit of ${fmtGHS(currentProfit)} (total: ${fmtGHS(totalPayout)}) has been added to your balance. Reference: ${ref}`
    );

    const idx = allInvestments.findIndex(x => x.userId === userId && x.invId === invId);
    if (idx !== -1) { allInvestments[idx].status = "completed"; allInvestments[idx].profitCredited = true; }

    closeInvModal();
    renderTable(getFiltered());
    showToast(`${fmtGHS(totalPayout)} released to ${inv.userName}.`, "success");

  } catch (err) {
    console.error(err);
    showToast("Failed to release funds. Please try again.", "error");
  }
};

document.getElementById("invStatusFilter")?.addEventListener("change", () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("invPlanFilter")?.addEventListener("change",   () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("invSearch")?.addEventListener("input",        () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("admRefresh")?.addEventListener("click", loadInvestments);

document.getElementById("invPrevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; renderTable(getFiltered()); }
});

document.getElementById("invNextBtn")?.addEventListener("click", () => {
  if (currentPage * PAGE_SIZE < getFiltered().length) { currentPage++; renderTable(getFiltered()); }
});

loadInvestments();