import { db, auth } from "../../js/firebase.js";
import {
  collection, getDocs, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { createNotification } from "../../dashboard/js/notify-helper.js";

const PAGE_SIZE = 20;
let allUsers    = [];
let currentPage = 1;

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
  if (u.emailVerified && u.phoneVerified)   return { label: "Fully Verified", color: "completed", icon: "fa-shield-check" };
  if (u.emailVerified && !u.phoneVerified)  return { label: "Email Only",     color: "active",    icon: "fa-envelope-circle-check" };
  if (!u.emailVerified && u.phoneVerified)  return { label: "Phone Only",     color: "active",    icon: "fa-phone-volume" };
  return { label: "Unverified", color: "failed", icon: "fa-circle-xmark" };
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
          <input type="password" id="kycConfirmPw" placeholder="Enter your password"
            style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;"
            autocomplete="current-password" />
          <button type="button" id="kycPwEyeBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="kycPwEyeIco"></i>
          </button>
        </div>
        <p id="kycConfirmPwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="kycConfirmYes" style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="kycConfirmIcon"></i><span id="kycConfirmTxt">Confirm</span>
          </button>
          <button id="kycConfirmNo" style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const pwInput = overlay.querySelector("#kycConfirmPw");
    const errEl   = overlay.querySelector("#kycConfirmPwErr");
    const yesBtn  = overlay.querySelector("#kycConfirmYes");
    const noBtn   = overlay.querySelector("#kycConfirmNo");
    const eyeBtn  = overlay.querySelector("#kycPwEyeBtn");
    const eyeIco  = overlay.querySelector("#kycPwEyeIco");
    const cIcon   = overlay.querySelector("#kycConfirmIcon");
    const cTxt    = overlay.querySelector("#kycConfirmTxt");
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
      filter === "unverified"     ? (!u.emailVerified && !u.phoneVerified) : true;
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
            ${!u.emailVerified ? `<button class="adm-action-icon-btn green" onclick="manualVerifyEmail('${u.id}')" title="Verify email"><i class="fa-solid fa-envelope-circle-check"></i></button>` : ""}
            ${!u.phoneVerified ? `<button class="adm-action-icon-btn gold"  onclick="manualVerifyPhone('${u.id}')" title="Verify phone"><i class="fa-solid fa-phone-volume"></i></button>` : ""}
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
    </div>`;

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
  const confirmed = await confirmWithPassword(`Verify email — ${u.name}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { emailVerified: true, authEmailVerified: true });
    await createNotification(uid, "activation", "Email Verified ✅", "Your email address has been verified by our admin team.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) { allUsers[idx].emailVerified = true; allUsers[idx].authEmailVerified = true; }
    renderTable(getFiltered());
    showToast(`Email verified for ${u.name}.`, "success");
  } catch (err) { console.error(err); showToast("Failed. Please try again.", "error"); }
};

window.manualVerifyPhone = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Verify phone — ${u.name}`);
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
  const confirmed = await confirmWithPassword(`Revoke email verification — ${u.name}`);
  if (!confirmed) return;
  try {
    await updateDoc(doc(db, "users", uid), { emailVerified: false, authEmailVerified: false });
    await createNotification(uid, "security", "Email Verification Revoked", "Your email verification has been revoked. Please re-verify your email in Settings.");
    const idx = allUsers.findIndex(x => x.id === uid);
    if (idx !== -1) { allUsers[idx].emailVerified = false; allUsers[idx].authEmailVerified = false; }
    renderTable(getFiltered());
    showToast(`Email verification revoked for ${u.name}.`, "error");
  } catch (err) { console.error(err); showToast("Failed. Please try again.", "error"); }
};

window.revokePhoneVerification = async function(uid) {
  const u = allUsers.find(x => x.id === uid);
  if (!u) return;
  const confirmed = await confirmWithPassword(`Revoke phone verification — ${u.name}`);
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