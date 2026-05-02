import { db } from "../../js/firebase.js";
import {
  collection, getDocs, doc,
  updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

const PAGE_SIZE      = 25;
let allInvestments   = [];
let currentPage      = 1;

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

async function loadInvestments() {
  const tbody = document.getElementById("invTableBody");
  tbody.innerHTML = `<tr><td colspan="9" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
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

    allInvestments.sort((a, b) => (b.startDate?.seconds || 0) - (a.startDate?.seconds || 0));

    let activeCount = 0, activeAmt = 0;
    let completedCount = 0, completedAmt = 0;
    let totalAmt = 0, soonCount = 0;

    allInvestments.forEach(inv => {
      const amt = inv.amount || 0;
      totalAmt += amt;
      if (inv.status === "active") {
        activeCount++; activeAmt += amt;
        const days = daysUntilMaturity(inv.maturityDate?.seconds);
        if (days !== null && days >= 0 && days <= 7) soonCount++;
      }
      if (inv.status === "completed") { completedCount++; completedAmt += amt; }
    });

    document.getElementById("statActive").textContent      = activeCount;
    document.getElementById("statActiveAmt").textContent   = `${fmtGHS(activeAmt)} invested`;
    document.getElementById("statCompleted").textContent   = completedCount;
    document.getElementById("statCompletedAmt").textContent = `${fmtGHS(completedAmt)} matured`;
    document.getElementById("statTotal").textContent       = fmtGHS(totalAmt);
    document.getElementById("statTotalCount").textContent  = `${allInvestments.length} all time`;
    document.getElementById("statSoon").textContent        = soonCount;

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
    const matchStatus = status === "all" || inv.status === status;
    const matchPlan   = plan   === "all" || inv.planName === plan;
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
    tbody.innerHTML = `<tr><td colspan="9" class="adm-table-empty">No investments found.</td></tr>`;
    return;
  }

  tbody.innerHTML = page.map(inv => {
    const days        = daysUntilMaturity(inv.maturityDate?.seconds);
    const maturityTag = inv.status === "active" && days !== null
      ? (days <= 0   ? `<span style="font-size:0.68rem;color:var(--adm-red);font-weight:700;">Matured</span>` :
         days <= 7   ? `<span style="font-size:0.68rem;color:var(--adm-orange);font-weight:700;">In ${days}d</span>` :
                       `<span style="font-size:0.68rem;color:var(--adm-muted);">${fmtDate(inv.maturityDate?.seconds)}</span>`)
      : `<span style="font-size:0.72rem;color:var(--adm-muted);">${fmtDate(inv.maturityDate?.seconds)}</span>`;

    const expectedProfit = inv.expectedProfit || ((inv.amount || 0) * ((inv.returnRate || 0) / 100));

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
        <td style="font-size:0.8rem;font-weight:600;">${inv.planName || "—"}</td>
        <td><strong>${fmtGHS(inv.amount)}</strong></td>
        <td style="color:var(--adm-green);font-weight:600;">${inv.returnRate || 0}%</td>
        <td style="color:var(--adm-gold);">${fmtGHS(expectedProfit)}</td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(inv.startDate?.seconds)}</td>
        <td>${maturityTag}</td>
        <td><span class="adm-badge ${inv.status === "active" ? "active" : inv.status === "completed" ? "completed" : "failed"}">${inv.status || "active"}</span></td>
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

  const days           = daysUntilMaturity(inv.maturityDate?.seconds);
  const expectedProfit = inv.expectedProfit || ((inv.amount || 0) * ((inv.returnRate || 0) / 100));
  const totalReturn    = (inv.amount || 0) + expectedProfit;

  body.innerHTML = `
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><span>User</span><strong>${inv.userName || "—"}</strong></div>
      <div class="adm-detail-item"><span>Email</span><strong>${inv.userEmail || "—"}</strong></div>
      <div class="adm-detail-item"><span>Plan</span><strong>${inv.planName || "—"}</strong></div>
      <div class="adm-detail-item"><span>Status</span><span class="adm-badge ${inv.status === "active" ? "active" : "completed"}">${inv.status || "active"}</span></div>
      <div class="adm-detail-item"><span>Amount Invested</span><strong>${fmtGHS(inv.amount)}</strong></div>
      <div class="adm-detail-item"><span>Return Rate</span><strong style="color:var(--adm-green);">${inv.returnRate || 0}%</strong></div>
      <div class="adm-detail-item"><span>Expected Profit</span><strong style="color:var(--adm-gold);">${fmtGHS(expectedProfit)}</strong></div>
      <div class="adm-detail-item"><span>Total at Maturity</span><strong style="color:var(--adm-green);">${fmtGHS(totalReturn)}</strong></div>
      <div class="adm-detail-item"><span>Start Date</span><strong>${fmtDate(inv.startDate?.seconds)}</strong></div>
      <div class="adm-detail-item"><span>Maturity Date</span><strong>${fmtDate(inv.maturityDate?.seconds)}</strong></div>
      <div class="adm-detail-item"><span>Days Remaining</span><strong style="color:${days !== null && days <= 7 ? "var(--adm-orange)" : "var(--adm-text)"};">${days !== null ? (days <= 0 ? "Matured" : `${days} days`) : "—"}</strong></div>
      <div class="adm-detail-item"><span>Profit Credited</span><strong>${inv.profitCredited ? "✓ Yes" : "Not yet"}</strong></div>
    </div>
  `;

  footer.innerHTML = inv.status === "active" ? `
    <button class="adm-btn green" onclick="creditProfit('${userId}','${invId}')">
      <i class="fa-solid fa-coins"></i> Credit Profit & Complete
    </button>
    <button class="adm-btn ghost" onclick="closeInvModal()">Close</button>
  ` : `
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

window.creditProfit = async function(userId, invId) {
  const inv = allInvestments.find(x => x.userId === userId && x.invId === invId);
  if (!inv) return;

  const expectedProfit = inv.expectedProfit || ((inv.amount || 0) * ((inv.returnRate || 0) / 100));

  const confirmed = confirm(
    `Credit profit for ${inv.userName}?\n\nPlan: ${inv.planName}\nProfit to credit: ${fmtGHS(expectedProfit)}\n\nThis will add the profit to the user's balance and mark the plan as completed.`
  );
  if (!confirmed) return;

  try {
    const userSnap    = await getDocs(collection(db, "users"));
    const userDoc     = userSnap.docs.find(d => d.id === userId);
    const currentBal  = userDoc?.data()?.balance || 0;
    const newBalance  = currentBal + expectedProfit;

    await updateDoc(doc(db, "users", userId), { balance: newBalance });

    await updateDoc(doc(db, "users", userId, "investments", invId), {
      status:        "completed",
      profitCredited: true,
      completedAt:   serverTimestamp()
    });

    const ref = "PROF-" + Date.now();
    const { addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await addDoc(collection(db, "users", userId, "transactions"), {
      type:      "profit_credit",
      amount:    expectedProfit,
      planName:  inv.planName,
      reference: ref,
      status:    "completed",
      date:      serverTimestamp()
    });

    await createNotification(
      userId,
      "profit",
      "Profit Credited 🎉",
      `Your ${inv.planName} plan has matured! ${fmtGHS(expectedProfit)} profit has been added to your balance. Total credited: ${fmtGHS(expectedProfit)}.`
    );

    const idx = allInvestments.findIndex(x => x.userId === userId && x.invId === invId);
    if (idx !== -1) { allInvestments[idx].status = "completed"; allInvestments[idx].profitCredited = true; }

    closeInvModal();
    renderTable(getFiltered());
    showToast(`Profit of ${fmtGHS(expectedProfit)} credited to ${inv.userName}.`, "success");

  } catch (err) {
    console.error(err);
    showToast("Failed to credit profit. Please try again.", "error");
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