import { db } from "../../js/firebase.js";
import {
  collection, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";
import { confirmWithPassword, requirePagePassword } from "./admin-auth-gate.js";

const PAGE_SIZE = 20;
let allUsers    = [];
let currentPage = 1;

await requirePagePassword("KYC Verification");

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

function kycLevel(u) {
  if (u.emailVerified && u.phoneVerified)  return { label: "Fully Verified", color: "completed", icon: "fa-shield-check" };
  if (u.emailVerified && !u.phoneVerified) return { label: "Email Only",     color: "active",    icon: "fa-envelope-circle-check" };
  if (!u.emailVerified && u.phoneVerified) return { label: "Phone Only",     color: "active",    icon: "fa-phone-volume" };
  return { label: "Unverified", color: "failed", icon: "fa-circle-xmark" };
}

async function loadKYC() {
  const tbody = document.getElementById("kycTableBody");
  tbody.innerHTML = `<tr><td colspan="7" class="adm-table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>`;

  try {
    const snap = await getDocs(collection(db, "users"));
    allUsers   = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    let emailVerified = 0, phoneVerified = 0, unverified = 0;

    allUsers.forEach(u => {
      if (u.emailVerified)  emailVerified++;
      if (u.phoneVerified)  phoneVerified++;
      if (!u.emailVerified && !u.phoneVerified) unverified++;
    });

    document.getElementById("statTotal").textContent      = allUsers.length;
    document.getElementById("statEmail").textContent      = emailVerified;
    document.getElementById("statEmailPct").textContent   = `${allUsers.length ? Math.round(emailVerified / allUsers.length * 100) : 0}% of users`;
    document.getElementById("statPhone").textContent      = phoneVerified;
    document.getElementById("statPhonePct").textContent   = `${allUsers.length ? Math.round(phoneVerified / allUsers.length * 100) : 0}% of users`;
    document.getElementById("statUnverified").textContent = unverified;

    currentPage = 1;
    renderTable(getFiltered());

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="adm-table-empty">Failed to load. Please refresh.</td></tr>`;
  }
}

function getFiltered() {
  const filter = document.getElementById("kycFilter")?.value || "all";
  const search = document.getElementById("kycSearch")?.value.toLowerCase() || "";

  return allUsers.filter(u => {
    const matchFilter =
      filter === "fully_verified" ? (u.emailVerified && u.phoneVerified) :
      filter === "email_only"     ? (u.emailVerified && !u.phoneVerified) :
      filter === "phone_only"     ? (!u.emailVerified && u.phoneVerified) :
      filter === "unverified"     ? (!u.emailVerified && !u.phoneVerified) :
      true;

    const matchSearch = !search ||
      (u.name  || "").toLowerCase().includes(search) ||
      (u.email || "").toLowerCase().includes(search) ||
      (u.phone || "").toLowerCase().includes(search);

    return matchFilter && matchSearch;
  });
}

function renderTable(data) {
  const tbody = document.getElementById("kycTableBody");
  const total = data.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end   = Math.min(start + PAGE_SIZE, total);
  const page  = data.slice(start, end);

  document.getElementById("kycPageInfo").textContent =
    `Showing ${total === 0 ? 0 : start + 1}–${end} of ${total} users`;

  const prevBtn = document.getElementById("kycPrevBtn");
  const nextBtn = document.getElementById("kycNextBtn");
  if (prevBtn) prevBtn.disabled = currentPage === 1;
  if (nextBtn) nextBtn.disabled = end >= total;

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="adm-table-empty">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = page.map(u => {
    const { label, color } = kycLevel(u);
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
        <td style="font-size:0.78rem;">${u.phone || "—"}</td>
        <td style="font-size:0.75rem;color:var(--adm-muted);">${fmtDate(u.createdAt?.seconds)}</td>
        <td><span class="adm-badge ${u.emailVerified ? "completed" : "failed"}">${u.emailVerified ? "✓ Verified" : "✗ Not Verified"}</span></td>
        <td><span class="adm-badge ${u.phoneVerified ? "completed" : "failed"}">${u.phoneVerified ? "✓ Verified" : "✗ Not Verified"}</span></td>
        <td><span class="adm-badge ${color}">${label}</span></td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="adm-action-icon-btn blue" onclick="viewKYC('${u.id}')" title="View & Manage">
              <i class="fa-solid fa-eye"></i>
            </button>
            ${!u.emailVerified ? `<button class="adm-action-icon-btn green" onclick="manualVerifyEmail('${u.id}')" title="Verify Email"><i class="fa-solid fa-envelope-circle-check"></i></button>` : ""}
            ${!u.phoneVerified ? `<button class="adm-action-icon-btn gold"  onclick="manualVerifyPhone('${u.id}')" title="Verify Phone"><i class="fa-solid fa-phone-volume"></i></button>` : ""}
          </div>
        </td>
      </tr>`;
  }).join("");
}

window.viewKYC = function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const { label, color } = kycLevel(u);

  const modal  = document.getElementById("kycDetailModal");
  const body   = document.getElementById("kycModalBody");
  const footer = document.getElementById("kycModalFooter");

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--adm-border);">
      <div style="width:52px;height:52px;border-radius:50%;background:var(--adm-gold-dim);color:var(--adm-gold);font-size:1.1rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials(u.name)}</div>
      <div>
        <h3 style="font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;color:var(--adm-text);">${u.name || "—"}</h3>
        <p style="font-size:0.8rem;color:var(--adm-muted);">${u.email || "—"}</p>
        <span class="adm-badge ${color}" style="margin-top:4px;">${label}</span>
      </div>
    </div>
    <div class="adm-detail-grid">
      <div class="adm-detail-item"><span>Phone Number</span><strong>${u.phone || "—"}</strong></div>
      <div class="adm-detail-item"><span>Country</span><strong>${u.country || "—"}</strong></div>
      <div class="adm-detail-item"><span>Joined</span><strong>${fmtDate(u.createdAt?.seconds)}</strong></div>
      <div class="adm-detail-item"><span>Account ID</span><strong style="font-family:monospace;">${u.id.slice(0,8).toUpperCase()}</strong></div>
      <div class="adm-detail-item"><span>Email Verification</span><span class="adm-badge ${u.emailVerified ? "completed" : "failed"}">${u.emailVerified ? "✓ Verified" : "✗ Not Verified"}</span></div>
      <div class="adm-detail-item"><span>Phone Verification</span><span class="adm-badge ${u.phoneVerified ? "completed" : "failed"}">${u.phoneVerified ? "✓ Verified" : "✗ Not Verified"}</span></div>
      <div class="adm-detail-item"><span>Standard Plan</span><strong>${u.standardActivated ? "✓ Activated" : "Not activated"}</strong></div>
      <div class="adm-detail-item"><span>Premium Plan</span><strong>${u.premiumActivated ? "✓ Activated" : "Not activated"}</strong></div>
      <div class="adm-detail-item"><span>Withdrawal Locked</span><strong>${u.withdrawalAccountLocked ? "🔒 Yes" : "Not locked"}</strong></div>
      <div class="adm-detail-item"><span>Last Login Device</span><strong style="font-size:0.78rem;">${u.lastLoginDevice || "—"}</strong></div>
    </div>
  `;

  const actions = [];
  if (!u.emailVerified) actions.push(`<button class="adm-btn green" onclick="manualVerifyEmail('${uid}');closeKycModal();"><i class="fa-solid fa-envelope-circle-check"></i> Verify Email</button>`);
  if (!u.phoneVerified) actions.push(`<button class="adm-btn blue"  onclick="manualVerifyPhone('${uid}');closeKycModal();"><i class="fa-solid fa-phone-volume"></i> Verify Phone</button>`);
  if (u.emailVerified)  actions.push(`<button class="adm-btn red"   onclick="revokeEmailVerification('${uid}');closeKycModal();"><i class="fa-solid fa-envelope-open"></i> Revoke Email</button>`);
  if (u.phoneVerified)  actions.push(`<button class="adm-btn red"   onclick="revokePhoneVerification('${uid}');closeKycModal();"><i class="fa-solid fa-phone-slash"></i> Revoke Phone</button>`);
  actions.push(`<button class="adm-btn ghost" onclick="closeKycModal()">Close</button>`);
  footer.innerHTML = actions.join("");
  modal.classList.add("active");
};

window.closeKycModal = function() {
  document.getElementById("kycDetailModal").classList.remove("active");
};

document.getElementById("kycModalClose")?.addEventListener("click", closeKycModal);
document.getElementById("kycDetailModal")?.addEventListener("click", e => {
  if (e.target.id === "kycDetailModal") closeKycModal();
});

window.manualVerifyEmail = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Verify email for ${u.name}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { emailVerified: true, authEmailVerified: true });
    await createNotification(uid, "activation", "Email Verified ✅", "Your email address has been verified by our admin team.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].emailVerified = true;
    renderTable(getFiltered());
    showToast(`Email verified for ${u.name}.`, "success");
  } catch (err) { console.error(err); showToast("Failed. Please try again.", "error"); }
};

window.manualVerifyPhone = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Verify phone for ${u.name}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { phoneVerified: true });
    await createNotification(uid, "activation", "Phone Verified ✅", "Your phone number has been verified by our admin team.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].phoneVerified = true;
    renderTable(getFiltered());
    showToast(`Phone verified for ${u.name}.`, "success");
  } catch (err) { console.error(err); showToast("Failed. Please try again.", "error"); }
};

window.revokeEmailVerification = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Revoke email verification for ${u.name}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { emailVerified: false, authEmailVerified: false });
    await createNotification(uid, "security", "Email Verification Revoked", "Your email verification has been revoked. Please re-verify your email in Settings.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].emailVerified = false;
    renderTable(getFiltered());
    showToast(`Email verification revoked for ${u.name}.`, "error");
  } catch (err) { console.error(err); showToast("Failed. Please try again.", "error"); }
};

window.revokePhoneVerification = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Revoke phone verification for ${u.name}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { phoneVerified: false });
    await createNotification(uid, "security", "Phone Verification Revoked", "Your phone verification has been revoked. Please re-verify your phone number in Settings.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) allUsers[idx].phoneVerified = false;
    renderTable(getFiltered());
    showToast(`Phone verification revoked for ${u.name}.`, "error");
  } catch (err) { console.error(err); showToast("Failed. Please try again.", "error"); }
};

document.getElementById("kycFilter")?.addEventListener("change", () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("kycSearch")?.addEventListener("input",  () => { currentPage = 1; renderTable(getFiltered()); });
document.getElementById("admRefresh")?.addEventListener("click", loadKYC);

document.getElementById("kycPrevBtn")?.addEventListener("click", () => {
  if (currentPage > 1) { currentPage--; renderTable(getFiltered()); }
});

document.getElementById("kycNextBtn")?.addEventListener("click", () => {
  if (currentPage * PAGE_SIZE < getFiltered().length) { currentPage++; renderTable(getFiltered()); }
});

loadKYC();