import { db } from "../../js/firebase.js";
import {
  collection, getDocs, doc,
  updateDoc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

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
  setTimeout(() => toast.classList.remove("visible"), 5000);
}

let allWithdrawals = [];

async function loadWithdrawals() {
  const tbody = document.getElementById("wdrTableBody");
  tbody.innerHTML = `<tr><td colspan="9" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const snap = await getDocs(query(collection(db, "withdrawalRequests"), orderBy("requestDate", "desc")));
    allWithdrawals = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let pending = 0, pendingAmt = 0;
    let completed = 0, completedAmt = 0;
    let rejected = 0, rejectedAmt = 0;
    let totalAmt = 0;

    allWithdrawals.forEach(w => {
      const amt = w.gross || w.amount || 0;
      totalAmt += amt;
      if (w.status === "pending")   { pending++;   pendingAmt   += amt; }
      if (w.status === "completed") { completed++; completedAmt += amt; }
      if (w.status === "rejected")  { rejected++;  rejectedAmt  += amt; }
    });

    document.getElementById("wdrStatPending").textContent      = pending;
    document.getElementById("wdrStatPendingAmt").textContent   = fmtGHS(pendingAmt);
    document.getElementById("wdrStatCompleted").textContent    = completed;
    document.getElementById("wdrStatCompletedAmt").textContent = fmtGHS(completedAmt);
    document.getElementById("wdrStatRejected").textContent     = rejected;
    document.getElementById("wdrStatRejectedAmt").textContent  = fmtGHS(rejectedAmt);
    document.getElementById("wdrStatTotal").textContent        = fmtGHS(completedAmt);
    document.getElementById("wdrStatTotalCount").textContent   = `${allWithdrawals.length} total requests`;

    renderTable(allWithdrawals);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="9" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function renderTable(data) {
  const tbody = document.getElementById("wdrTableBody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="adm-table-empty">No withdrawal requests found.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(w => `
    <tr>
      <td><span style="font-size:0.72rem;color:var(--adm-muted);font-family:monospace;">${w.reference || "—"}</span></td>
      <td>
        <div class="adm-user-cell">
          <div class="adm-user-av">${initials(w.name)}</div>
          <div>
            <p class="adm-user-name">${w.name || "—"}</p>
            <p class="adm-user-email">${w.email || ""}</p>
          </div>
        </div>
      </td>
      <td><strong>${fmtGHS(w.gross || w.amount)}</strong></td>
      <td style="color:var(--adm-red);">${fmtGHS(w.fee)}</td>
      <td style="color:var(--adm-green);font-weight:600;">${fmtGHS(w.amount)}</td>
      <td style="font-size:0.78rem;">${w.method || "—"}</td>
      <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(w.requestDate?.seconds)}</td>
      <td><span class="adm-badge ${w.status || "pending"}">${w.status || "pending"}</span></td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="adm-action-icon-btn blue" onclick="viewDetails('${w.id}')">
            <i class="fa-solid fa-eye"></i>
          </button>
          ${w.status === "pending" ? `
            <button class="adm-action-icon-btn green" onclick="approveWithdrawal('${w.id}')">
              <i class="fa-solid fa-check"></i>
            </button>
            <button class="adm-action-icon-btn red" onclick="rejectWithdrawal('${w.id}')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

window.viewDetails = function(id) {
  const w = allWithdrawals.find(x => x.id === id);
  if (!w) return;

  const modal  = document.getElementById("wdrDetailModal");
  const body   = document.getElementById("wdrModalBody");
  const footer = document.getElementById("wdrModalFooter");

  const pd = w.paystackData || {};

  body.innerHTML = `
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><span>Reference</span><strong style="font-family:monospace;font-size:0.85rem;">${w.reference || "—"}</strong></div>
      <div class="adm-detail-item"><span>Status</span><span class="adm-badge ${w.status}">${w.status}</span></div>
      <div class="adm-detail-item"><span>User Name</span><strong>${w.name || "—"}</strong></div>
      <div class="adm-detail-item"><span>Email</span><strong>${w.email || "—"}</strong></div>
      <div class="adm-detail-item"><span>Phone</span><strong>${w.phone || "—"}</strong></div>
      <div class="adm-detail-item"><span>Gross Amount</span><strong>${fmtGHS(w.gross || w.amount)}</strong></div>
      <div class="adm-detail-item"><span>Processing Fee</span><strong style="color:var(--adm-red);">${fmtGHS(w.fee)}</strong></div>
      <div class="adm-detail-item"><span>Net to Send</span><strong style="color:var(--adm-green);">${fmtGHS(w.amount)}</strong></div>
      <div class="adm-detail-item"><span>Method</span><strong>${w.method || "—"}</strong></div>
      <div class="adm-detail-item"><span>Account Number</span><strong>${pd.accountNumber || "—"}</strong></div>
      <div class="adm-detail-item"><span>Account Name</span><strong>${pd.accountName || "—"}</strong></div>
      <div class="adm-detail-item"><span>Bank / Network</span><strong>${pd.bankName || pd.bankCode || "—"}</strong></div>
      <div class="adm-detail-item"><span>Request Date</span><strong>${fmtDate(w.requestDate?.seconds)}</strong></div>
      ${w.transferCode ? `<div class="adm-detail-item"><span>Transfer Code</span><strong style="font-family:monospace;">${w.transferCode}</strong></div>` : ""}
      ${w.processedAt?.seconds ? `<div class="adm-detail-item"><span>Processed</span><strong>${fmtDate(w.processedAt.seconds)}</strong></div>` : ""}
      ${w.rejectionReason ? `<div class="adm-detail-item"><span>Rejection Reason</span><strong style="color:var(--adm-red);">${w.rejectionReason}</strong></div>` : ""}
    </div>
  `;

  footer.innerHTML = w.status === "pending" ? `
    <button class="adm-btn green" onclick="approveWithdrawal('${w.id}');closeWdrModal();">
      <i class="fa-solid fa-paper-plane"></i> Approve & Send
    </button>
    <button class="adm-btn red" onclick="promptReject('${w.id}')">
      <i class="fa-solid fa-circle-xmark"></i> Reject
    </button>
  ` : `<p style="color:var(--adm-muted);font-size:0.82rem;">This request has already been ${w.status}.</p>`;

  modal.classList.add("active");
};

window.closeWdrModal = function() {
  document.getElementById("wdrDetailModal").classList.remove("active");
};

document.getElementById("wdrModalClose")?.addEventListener("click", closeWdrModal);
document.getElementById("wdrDetailModal")?.addEventListener("click", e => {
  if (e.target.id === "wdrDetailModal") closeWdrModal();
});

window.approveWithdrawal = async function(id) {
  const w = allWithdrawals.find(x => x.id === id);
  if (!w) return;

  const confirmed = confirm(
    `Approve withdrawal for ${w.name}?\n\nNet amount to send: ${fmtGHS(w.amount)}\nMethod: ${w.method}\nAccount: ${w.paystackData?.accountNumber || "—"}\n\nPaystack will automatically send the funds.`
  );
  if (!confirmed) return;

  showToast("Processing transfer via Paystack...", "success");

  try {
    const res  = await fetch("/api/approve-withdrawal", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        requestId:    id,
        amount:       w.amount,
        paystackData: w.paystackData || {},
        name:         w.name
      })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(`Transfer failed: ${data.details || data.error || "Unknown error"}`, "error");
      return;
    }

    await updateDoc(doc(db, "withdrawalRequests", id), {
      status:        "completed",
      processedAt:   serverTimestamp(),
      transferCode:  data.transferCode  || "",
      transferStatus: data.transferStatus || "success"
    });

    const userTxSnap = await getDocs(collection(db, "users", w.uid, "transactions"));
    userTxSnap.forEach(async (txDoc) => {
      if (txDoc.data().reference === w.reference) {
        await updateDoc(doc(db, "users", w.uid, "transactions", txDoc.id), {
          status: "completed"
        });
      }
    });

    await createNotification(
      w.uid,
      "withdrawal",
      "Withdrawal Sent ✅",
      `Your withdrawal of ${fmtGHS(w.gross || w.amount)} has been processed and sent to your ${w.method} (${w.paystackData?.accountNumber || ""}). Reference: ${w.reference}`
    );

    const idx = allWithdrawals.findIndex(x => x.id === id);
    if (idx !== -1) {
      allWithdrawals[idx].status       = "completed";
      allWithdrawals[idx].transferCode = data.transferCode;
    }

    renderTable(getFilteredData());
    showToast(`Transfer successful for ${w.name}. ${fmtGHS(w.amount)} sent.`, "success");

  } catch (err) {
    console.error(err);
    showToast("Transfer failed. Check your internet connection and try again.", "error");
  }
};

window.promptReject = function(id) {
  const footer = document.getElementById("wdrModalFooter");
  footer.innerHTML = `
    <div style="width:100%;">
      <p style="font-size:0.82rem;color:var(--adm-muted);margin-bottom:8px;">Reason for rejection (optional):</p>
      <input type="text" id="rejectReasonInput" placeholder="e.g. Invalid account details" style="width:100%;padding:10px 14px;background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:8px;color:var(--adm-text);font-family:'DM Sans',sans-serif;font-size:0.85rem;margin-bottom:12px;">
      <div style="display:flex;gap:8px;">
        <button class="adm-btn red" onclick="confirmReject('${id}')">
          <i class="fa-solid fa-circle-xmark"></i> Confirm Rejection
        </button>
        <button class="adm-btn ghost" onclick="viewDetails('${id}')">Cancel</button>
      </div>
    </div>
  `;
};

window.confirmReject = async function(id) {
  const w      = allWithdrawals.find(x => x.id === id);
  if (!w) return;
  const reason = document.getElementById("rejectReasonInput")?.value.trim() || "Rejected by admin";

  try {
    await updateDoc(doc(db, "withdrawalRequests", id), {
      status:          "rejected",
      rejectionReason: reason,
      processedAt:     serverTimestamp()
    });

    const userSnap = await getDocs(collection(db, "users", w.uid, "transactions"));
    userSnap.forEach(async (txDoc) => {
      if (txDoc.data().reference === w.reference) {
        await updateDoc(doc(db, "users", w.uid, "transactions", txDoc.id), {
          status: "rejected"
        });
      }
    });

    const userDocSnap = await getDocs(collection(db, "users"));
    const userDoc     = userDocSnap.docs.find(d => d.id === w.uid);
    if (userDoc) {
      const currentBal = userDoc.data().balance || 0;
      await updateDoc(doc(db, "users", w.uid), {
        balance: currentBal + (w.gross || w.amount || 0)
      });
    }

    await createNotification(
      w.uid,
      "withdrawal",
      "Withdrawal Rejected ❌",
      `Your withdrawal of ${fmtGHS(w.gross || w.amount)} has been rejected. Reason: ${reason}. Your balance has been refunded. Reference: ${w.reference}`
    );

    const idx = allWithdrawals.findIndex(x => x.id === id);
    if (idx !== -1) {
      allWithdrawals[idx].status          = "rejected";
      allWithdrawals[idx].rejectionReason = reason;
    }

    closeWdrModal();
    renderTable(getFilteredData());
    showToast(`Withdrawal rejected for ${w.name}. Balance refunded.`, "error");

  } catch (err) {
    console.error(err);
    showToast("Failed to reject. Please try again.", "error");
  }
};

window.rejectWithdrawal = function(id) {
  viewDetails(id);
  setTimeout(() => promptReject(id), 100);
};

function getFilteredData() {
  const filter = document.getElementById("wdrFilter")?.value || "all";
  const search = document.getElementById("wdrSearch")?.value.toLowerCase() || "";
  return allWithdrawals.filter(w => {
    const matchFilter = filter === "all" || w.status === filter;
    const matchSearch = !search ||
      (w.name      || "").toLowerCase().includes(search) ||
      (w.reference || "").toLowerCase().includes(search) ||
      (w.email     || "").toLowerCase().includes(search);
    return matchFilter && matchSearch;
  });
}

document.getElementById("wdrFilter")?.addEventListener("change", () => renderTable(getFilteredData()));
document.getElementById("wdrSearch")?.addEventListener("input",  () => renderTable(getFilteredData()));
document.getElementById("admRefresh")?.addEventListener("click", loadWithdrawals);

loadWithdrawals();