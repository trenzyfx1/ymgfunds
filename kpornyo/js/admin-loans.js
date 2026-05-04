import { db } from "../../js/firebase.js";
import { auth } from "../../js/firebase.js";
import {
  collection, getDocs, doc,
  updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

let allLoans = [];

function fmtGHS(n) {
  return "GHS " + Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 });
}

function fmtDate(seconds) {
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

// loans are saved with status "under_review" from investments.js
// treat "under_review" same as "pending" throughout
function normaliseStatus(status) {
  if (status === "under_review") return "pending";
  return status || "pending";
}

function confirmWithPassword(actionLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;`;
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
          <input type="password" id="loanConfirmPw" placeholder="Enter your password"
            style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;"
            autocomplete="current-password" />
          <button type="button" id="loanPwEyeBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="loanPwEyeIco"></i>
          </button>
        </div>
        <p id="loanConfirmPwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="loanConfirmYes" style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="loanConfirmIcon"></i><span id="loanConfirmTxt">Confirm</span>
          </button>
          <button id="loanConfirmNo" style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const pwInput = overlay.querySelector("#loanConfirmPw");
    const errEl   = overlay.querySelector("#loanConfirmPwErr");
    const yesBtn  = overlay.querySelector("#loanConfirmYes");
    const noBtn   = overlay.querySelector("#loanConfirmNo");
    const eyeBtn  = overlay.querySelector("#loanPwEyeBtn");
    const eyeIco  = overlay.querySelector("#loanPwEyeIco");
    const cIcon   = overlay.querySelector("#loanConfirmIcon");
    const cTxt    = overlay.querySelector("#loanConfirmTxt");
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

async function loadLoans() {
  const tbody = document.getElementById("loanTableBody");
  tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    // order by createdAt — the field name used in investments.js
    // fallback: get all docs without ordering if createdAt index doesn't exist
    let snap;
    try {
      snap = await getDocs(query(collection(db, "loanRequests"), orderBy("createdAt", "desc")));
    } catch {
      snap = await getDocs(collection(db, "loanRequests"));
    }

    allLoans = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // sort client-side by createdAt desc as fallback
    allLoans.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    let pending = 0, pendingAmt = 0;
    let approved = 0, approvedAmt = 0;
    let rejected = 0, rejectedAmt = 0;
    let totalAmt = 0;

    allLoans.forEach(l => {
      const amt    = l.amount || 0;
      const status = normaliseStatus(l.status);
      totalAmt += amt;
      if (status === "pending")  { pending++;  pendingAmt  += amt; }
      if (status === "approved") { approved++; approvedAmt += amt; }
      if (status === "rejected") { rejected++; rejectedAmt += amt; }
    });

    document.getElementById("statPending").textContent     = pending;
    document.getElementById("statPendingAmt").textContent  = fmtGHS(pendingAmt);
    document.getElementById("statApproved").textContent    = approved;
    document.getElementById("statApprovedAmt").textContent = fmtGHS(approvedAmt);
    document.getElementById("statRejected").textContent    = rejected;
    document.getElementById("statRejectedAmt").textContent = fmtGHS(rejectedAmt);
    document.getElementById("statTotal").textContent       = fmtGHS(totalAmt);
    document.getElementById("statTotalCount").textContent  = `${allLoans.length} requests`;

    renderTable(getFiltered());

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFiltered() {
  const filter = document.getElementById("loanFilter")?.value || "all";
  const search = document.getElementById("loanSearch")?.value.toLowerCase() || "";
  return allLoans.filter(l => {
    const status      = normaliseStatus(l.status);
    const matchFilter = filter === "all" || status === filter;
    const matchSearch = !search ||
      (l.name  || "").toLowerCase().includes(search) ||
      (l.email || "").toLowerCase().includes(search);
    return matchFilter && matchSearch;
  });
}

function renderTable(data) {
  const tbody = document.getElementById("loanTableBody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="adm-table-empty">No loan requests found.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(l => {
    const status      = normaliseStatus(l.status);
    const badgeColor  = status === "approved" ? "completed" : status === "rejected" ? "failed" : "pending";
    // date — use createdAt (from investments.js) or requestDate as fallback
    const dateSec     = l.createdAt?.seconds || l.requestDate?.seconds || null;

    return `
      <tr>
        <td>
          <div class="adm-user-cell">
            <div class="adm-user-av">${initials(l.name)}</div>
            <div>
              <p class="adm-user-name">${l.name || "—"}</p>
              <p class="adm-user-email">${l.email || ""}</p>
            </div>
          </div>
        </td>
        <td><strong>${fmtGHS(l.amount)}</strong></td>
        <td style="font-size:0.78rem;color:var(--adm-muted);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${l.purpose || "—"}</td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(dateSec)}</td>
        <td><span class="adm-badge ${badgeColor}">${status}</span></td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="adm-action-icon-btn blue" onclick="viewLoan('${l.id}')" title="View Details">
              <i class="fa-solid fa-eye"></i>
            </button>
            ${status === "pending" ? `
              <button class="adm-action-icon-btn green" onclick="approveLoan('${l.id}')" title="Approve">
                <i class="fa-solid fa-check"></i>
              </button>
              <button class="adm-action-icon-btn red" onclick="rejectLoan('${l.id}')" title="Reject">
                <i class="fa-solid fa-xmark"></i>
              </button>
            ` : ""}
          </div>
        </td>
      </tr>`;
  }).join("");
}

window.viewLoan = function(id) {
  const l       = allLoans.find(x => x.id === id);
  if (!l) return;
  const status  = normaliseStatus(l.status);
  const dateSec = l.createdAt?.seconds || l.requestDate?.seconds || null;

  const modal  = document.getElementById("loanDetailModal");
  const body   = document.getElementById("loanModalBody");
  const footer = document.getElementById("loanModalFooter");

  body.innerHTML = `
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><span>User Name</span><strong>${l.name || "—"}</strong></div>
      <div class="adm-detail-item"><span>Email</span><strong>${l.email || "—"}</strong></div>
      <div class="adm-detail-item"><span>Phone</span><strong>${l.phone || "—"}</strong></div>
      <div class="adm-detail-item"><span>Status</span><span class="adm-badge ${status==="approved"?"completed":status==="rejected"?"failed":"pending"}">${status}</span></div>
      <div class="adm-detail-item"><span>Loan Plan</span><strong>${l.plan || "—"}</strong></div>
      <div class="adm-detail-item"><span>Loan Amount</span><strong style="color:var(--adm-gold);">${fmtGHS(l.amount)}</strong></div>
      <div class="adm-detail-item"><span>Interest</span><strong style="color:var(--adm-red);">${fmtGHS(l.interest)}</strong></div>
      <div class="adm-detail-item"><span>Total Repayment</span><strong>${fmtGHS(l.total)}</strong></div>
      <div class="adm-detail-item"><span>Request Date</span><strong>${fmtDate(dateSec)}</strong></div>
      ${l.processedAt?.seconds ? `<div class="adm-detail-item"><span>Processed</span><strong>${fmtDate(l.processedAt.seconds)}</strong></div>` : ""}
      ${l.rejectionReason ? `<div class="adm-detail-item"><span>Rejection Reason</span><strong style="color:var(--adm-red);">${l.rejectionReason}</strong></div>` : ""}
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--adm-border);">
      <p style="font-size:0.72rem;font-weight:700;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Purpose</p>
      <p style="font-size:0.85rem;color:var(--adm-text);line-height:1.6;">${l.purpose || "No purpose provided."}</p>
    </div>
  `;

  footer.innerHTML = status === "pending" ? `
    <button class="adm-btn green" onclick="approveLoan('${l.id}');closeLoanModal();">
      <i class="fa-solid fa-circle-check"></i> Approve Loan
    </button>
    <button class="adm-btn red" onclick="promptRejectLoan('${l.id}')">
      <i class="fa-solid fa-circle-xmark"></i> Reject
    </button>
  ` : `<p style="color:var(--adm-muted);font-size:0.82rem;">This request has already been ${status}.</p>`;

  modal.classList.add("active");
};

window.closeLoanModal = function() {
  document.getElementById("loanDetailModal").classList.remove("active");
};

document.getElementById("loanModalClose")?.addEventListener("click", closeLoanModal);
document.getElementById("loanDetailModal")?.addEventListener("click", e => {
  if (e.target.id === "loanDetailModal") closeLoanModal();
});

window.approveLoan = async function(id) {
  const l = allLoans.find(x => x.id === id);
  if (!l) return;

  const confirmed = await confirmWithPassword(`Approve loan — ${l.name} — ${fmtGHS(l.amount)}`);
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "loanRequests", id), {
      status:      "approved",
      processedAt: serverTimestamp()
    });

    await createNotification(
      l.uid, "activation",
      "Loan Request Approved ✅",
      `Your loan request of ${fmtGHS(l.amount)} has been approved. Our team will contact you shortly regarding disbursement.`
    );

    const idx = allLoans.findIndex(x => x.id === id);
    if (idx !== -1) allLoans[idx].status = "approved";
    closeLoanModal();
    renderTable(getFiltered());
    showToast(`Loan approved for ${l.name}.`, "success");

  } catch (err) {
    console.error(err);
    showToast("Failed to approve loan. Please try again.", "error");
  }
};

window.promptRejectLoan = function(id) {
  const footer = document.getElementById("loanModalFooter");
  footer.innerHTML = `
    <div style="width:100%;">
      <p style="font-size:0.82rem;color:var(--adm-muted);margin-bottom:8px;">Reason for rejection (optional):</p>
      <input type="text" id="loanRejectReason" placeholder="e.g. Insufficient account history"
        style="width:100%;padding:10px 14px;background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:8px;color:var(--adm-text);font-family:'DM Sans',sans-serif;font-size:0.85rem;margin-bottom:12px;outline:none;">
      <div style="display:flex;gap:8px;">
        <button class="adm-btn red" onclick="confirmRejectLoan('${id}')">
          <i class="fa-solid fa-circle-xmark"></i> Confirm Rejection
        </button>
        <button class="adm-btn ghost" onclick="viewLoan('${id}')">Cancel</button>
      </div>
    </div>`;
};

window.confirmRejectLoan = async function(id) {
  const l      = allLoans.find(x => x.id === id);
  if (!l) return;
  const reason = document.getElementById("loanRejectReason")?.value.trim() || "Rejected by admin";

  const confirmed = await confirmWithPassword(`Reject loan — ${l.name} — ${fmtGHS(l.amount)}`);
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "loanRequests", id), {
      status:          "rejected",
      rejectionReason: reason,
      processedAt:     serverTimestamp()
    });

    await createNotification(
      l.uid, "security",
      "Loan Request Rejected ❌",
      `Your loan request of ${fmtGHS(l.amount)} has been rejected. Reason: ${reason}. You may submit a new request after reviewing the requirements.`
    );

    const idx = allLoans.findIndex(x => x.id === id);
    if (idx !== -1) { allLoans[idx].status = "rejected"; allLoans[idx].rejectionReason = reason; }
    closeLoanModal();
    renderTable(getFiltered());
    showToast(`Loan request rejected for ${l.name}.`, "error");

  } catch (err) {
    console.error(err);
    showToast("Failed to reject loan. Please try again.", "error");
  }
};

window.rejectLoan = function(id) {
  viewLoan(id);
  setTimeout(() => promptRejectLoan(id), 100);
};

document.getElementById("loanFilter")?.addEventListener("change", () => renderTable(getFiltered()));
document.getElementById("loanSearch")?.addEventListener("input",  () => renderTable(getFiltered()));
document.getElementById("admRefresh")?.addEventListener("click", loadLoans);

loadLoans();