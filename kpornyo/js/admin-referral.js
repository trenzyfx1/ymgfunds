import { db } from "../../js/firebase.js";
import {
  collection, getDocs, doc, updateDoc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

let allUsers   = [];
let refData    = [];

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

async function loadReferrals() {
  const tbody = document.getElementById("refTableBody");
  tbody.innerHTML = `<tr><td colspan="7" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;
  refData = [];

  try {
    const usersSnap = await getDocs(collection(db, "users"));
    allUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const promises = allUsers.map(async (user) => {
      const refSnap = await getDocs(collection(db, "users", user.id, "referrals"));
      const refs    = refSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (refs.length > 0 || (user.referralCount || 0) > 0) {
        refData.push({
          userId:        user.id,
          name:          user.name,
          email:         user.email,
          referralCode:  user.referralCode,
          referralCount: user.referralCount || refs.length || 0,
          earnings:      user.referralEarnings || 0,
          rewarded:      user.referralRewarded || false,
          refs
        });
      }
    });

    await Promise.all(promises);

    refData.sort((a, b) => b.referralCount - a.referralCount);

    const totalReferrals = refData.reduce((s, r) => s + r.referralCount, 0);
    const totalEarnings  = refData.reduce((s, r) => s + r.earnings, 0);
    const top            = refData[0];
    const referrers      = refData.length;

    document.getElementById("statTotal").textContent    = totalReferrals;
    document.getElementById("statEarnings").textContent = fmtGHS(totalEarnings);
    document.getElementById("statTopName").textContent  = top?.name || "—";
    document.getElementById("statTopCount").textContent = top ? `${top.referralCount} referrals` : "0 referrals";
    document.getElementById("statReferrers").textContent = referrers;

    renderTable(refData);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFiltered() {
  const search = document.getElementById("refSearch")?.value.toLowerCase() || "";
  if (!search) return refData;
  return refData.filter(r =>
    (r.name         || "").toLowerCase().includes(search) ||
    (r.email        || "").toLowerCase().includes(search) ||
    (r.referralCode || "").toLowerCase().includes(search)
  );
}

function renderTable(data) {
  const tbody = document.getElementById("refTableBody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="adm-table-empty">No referral data found.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((r, i) => `
    <tr>
      <td>
        <div style="width:28px;height:28px;border-radius:50%;background:${i === 0 ? "var(--adm-gold-dim)" : i === 1 ? "rgba(148,163,184,0.15)" : i === 2 ? "rgba(180,83,9,0.15)" : "var(--adm-card)"};color:${i === 0 ? "var(--adm-gold)" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "var(--adm-muted)"};font-weight:700;font-size:0.78rem;display:flex;align-items:center;justify-content:center;border-radius:50%;">
          ${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
        </div>
      </td>
      <td>
        <div class="adm-user-cell">
          <div class="adm-user-av">${initials(r.name)}</div>
          <div>
            <p class="adm-user-name">${r.name || "—"}</p>
            <p class="adm-user-email">${r.email || ""}</p>
          </div>
        </div>
      </td>
      <td><span style="font-family:monospace;font-size:0.8rem;color:var(--adm-gold);font-weight:700;">${r.referralCode || "—"}</span></td>
      <td><strong style="color:var(--adm-text);">${r.referralCount}</strong></td>
      <td><strong style="color:var(--adm-green);">${fmtGHS(r.earnings)}</strong></td>
      <td>
        <span class="adm-badge ${r.rewarded ? "completed" : "pending"}">
          ${r.rewarded ? "✓ Rewarded" : "Pending"}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="adm-action-icon-btn blue" onclick="viewReferral('${r.userId}')" title="View referrals">
            <i class="fa-solid fa-eye"></i>
          </button>
          ${!r.rewarded && r.referralCount > 0 ? `
            <button class="adm-action-icon-btn green" onclick="rewardUser('${r.userId}')" title="Mark as rewarded">
              <i class="fa-solid fa-coins"></i>
            </button>
          ` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

window.viewReferral = function(uid) {
  const r = refData.find(x => x.userId === uid);
  if (!r) return;

  const modal  = document.getElementById("refDetailModal");
  const body   = document.getElementById("refModalBody");
  const footer = document.getElementById("refModalFooter");

  const refRows = r.refs.length
    ? r.refs.map(ref => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--adm-border);">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--adm-gold-dim);color:var(--adm-gold);font-size:0.68rem;font-weight:700;display:flex;align-items:center;justify-content:center;">${initials(ref.name)}</div>
            <div>
              <p style="font-size:0.82rem;font-weight:600;color:var(--adm-text);margin:0;">${ref.name || "—"}</p>
              <p style="font-size:0.7rem;color:var(--adm-muted);margin:0;">${fmtDate(ref.createdAt?.seconds)}</p>
            </div>
          </div>
          <span class="adm-badge ${ref.status === "rewarded" ? "completed" : "pending"}">${ref.status || "pending"}</span>
        </div>
      `).join("")
    : `<p style="color:var(--adm-muted);font-size:0.82rem;text-align:center;padding:16px 0;">No referral records found.</p>`;

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--adm-border);">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--adm-gold-dim);color:var(--adm-gold);font-size:1.1rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials(r.name)}</div>
      <div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:var(--adm-text);">${r.name || "—"}</h3>
        <p style="font-size:0.8rem;color:var(--adm-muted);">${r.email || "—"}</p>
        <p style="font-size:0.78rem;color:var(--adm-gold);font-weight:700;font-family:monospace;margin-top:4px;">${r.referralCode || "—"}</p>
      </div>
    </div>
    <div class="adm-detail-grid" style="margin-bottom:20px;">
      <div class="adm-detail-item"><span>Total Referrals</span><strong>${r.referralCount}</strong></div>
      <div class="adm-detail-item"><span>Earnings</span><strong style="color:var(--adm-green);">${fmtGHS(r.earnings)}</strong></div>
      <div class="adm-detail-item"><span>Reward Status</span><span class="adm-badge ${r.rewarded ? "completed" : "pending"}">${r.rewarded ? "Rewarded" : "Pending"}</span></div>
    </div>
    <p style="font-size:0.72rem;font-weight:700;color:var(--adm-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Referred Users</p>
    <div style="max-height:240px;overflow-y:auto;">${refRows}</div>
  `;

  footer.innerHTML = `
    ${!r.rewarded && r.referralCount > 0 ? `
      <button class="adm-btn green" onclick="rewardUser('${uid}');closeRefModal();">
        <i class="fa-solid fa-coins"></i> Mark as Rewarded
      </button>
    ` : ""}
    <button class="adm-btn ghost" onclick="closeRefModal()">Close</button>
  `;

  modal.classList.add("active");
};

window.closeRefModal = function() {
  document.getElementById("refDetailModal").classList.remove("active");
};

document.getElementById("refModalClose")?.addEventListener("click", closeRefModal);
document.getElementById("refDetailModal")?.addEventListener("click", e => {
  if (e.target.id === "refDetailModal") closeRefModal();
});

window.rewardUser = async function(uid) {
  const r = refData.find(x => x.userId === uid);
  if (!r) return;

  const confirmed = confirm(`Mark ${r.name} as rewarded for ${r.referralCount} referral${r.referralCount !== 1 ? "s" : ""}?\n\nThis marks their referral status as rewarded.`);
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "users", uid), {
      referralRewarded: true
    });

    const refSnap = await getDocs(collection(db, "users", uid, "referrals"));
    const updates = refSnap.docs.map(d => updateDoc(doc(db, "users", uid, "referrals", d.id), { status: "rewarded" }));
    await Promise.all(updates);

    await createNotification(
      uid,
      "profit",
      "Referral Reward Processed 🎉",
      `Your referral reward for ${r.referralCount} referral${r.referralCount !== 1 ? "s" : ""} has been processed. Thank you for growing the YMG IQ community!`
    );

    const idx = refData.findIndex(x => x.userId === uid);
    if (idx !== -1) refData[idx].rewarded = true;

    renderTable(getFiltered());
    showToast(`${r.name} marked as rewarded.`, "success");

  } catch (err) {
    console.error(err);
    showToast("Failed to update. Please try again.", "error");
  }
};

document.getElementById("refSearch")?.addEventListener("input", () => renderTable(getFiltered()));
document.getElementById("admRefresh")?.addEventListener("click", loadReferrals);

loadReferrals();