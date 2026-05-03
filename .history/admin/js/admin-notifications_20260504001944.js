import { db, auth } from "../../js/firebase.js";
import {
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let allUsers       = [];
let selectedUserId = null;
let sentLog        = [];

function showToast(msg, type = "success") {
  const toast = document.getElementById("admToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `adm-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
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
          <input type="password" id="notifConfirmPw" placeholder="Enter your password"
            style="width:100%;padding:11px 40px 11px 36px;background:#080e1a;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#e2e8f0;font-family:'DM Sans',sans-serif;font-size:0.88rem;outline:none;"
            autocomplete="current-password" />
          <button type="button" id="notifPwEyeBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#475569;cursor:pointer;font-size:0.82rem;padding:4px;">
            <i class="fa-solid fa-eye" id="notifPwEyeIco"></i>
          </button>
        </div>
        <p id="notifConfirmPwErr" style="font-size:0.75rem;color:#ef4444;min-height:16px;margin-bottom:14px;"></p>
        <div style="display:flex;gap:8px;">
          <button id="notifConfirmYes" style="flex:1;background:#c9a84c;color:#081c10;border:none;border-radius:9px;padding:11px;font-family:'Syne',sans-serif;font-size:0.88rem;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
            <i class="fa-solid fa-check" id="notifConfirmIcon"></i><span id="notifConfirmTxt">Confirm</span>
          </button>
          <button id="notifConfirmNo" style="flex:1;background:rgba(255,255,255,0.05);color:#94a3b8;border:1px solid rgba(255,255,255,0.07);border-radius:9px;padding:11px;font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const pwInput = overlay.querySelector("#notifConfirmPw");
    const errEl   = overlay.querySelector("#notifConfirmPwErr");
    const yesBtn  = overlay.querySelector("#notifConfirmYes");
    const noBtn   = overlay.querySelector("#notifConfirmNo");
    const eyeBtn  = overlay.querySelector("#notifPwEyeBtn");
    const eyeIco  = overlay.querySelector("#notifPwEyeIco");
    const cIcon   = overlay.querySelector("#notifConfirmIcon");
    const cTxt    = overlay.querySelector("#notifConfirmTxt");
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
  try {
    const snap = await getDocs(collection(db, "users"));
    allUsers   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.error(err); }
}

document.getElementById("notifMessage")?.addEventListener("input", () => {
  const len   = document.getElementById("notifMessage").value.length;
  const count = document.getElementById("notifCharCount");
  if (count) count.textContent = `${len} / 500`;
});

document.getElementById("notifTarget")?.addEventListener("change", () => {
  const val  = document.getElementById("notifTarget").value;
  const wrap = document.getElementById("singleUserWrap");
  if (wrap) wrap.style.display = val === "single" ? "block" : "none";
  selectedUserId = null;
  const tag = document.getElementById("selectedUserTag");
  if (tag) tag.style.display = "none";
});

document.getElementById("singleUserSearch")?.addEventListener("input", () => {
  const searchVal = document.getElementById("singleUserSearch").value.toLowerCase().trim();
  const results   = document.getElementById("singleUserResults");
  if (!results) return;
  if (!searchVal) { results.innerHTML = ""; return; }
  const matches = allUsers.filter(u =>
    (u.name  || "").toLowerCase().includes(searchVal) ||
    (u.email || "").toLowerCase().includes(searchVal)
  ).slice(0, 6);
  if (!matches.length) {
    results.innerHTML = `<p style="font-size:0.78rem;color:var(--adm-muted);padding:8px 0;">No users found.</p>`;
    return;
  }
  results.innerHTML = matches.map(u => `
    <div onclick="selectUser('${u.id}')"
      style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid var(--adm-border);background:var(--adm-card-hover);transition:background 0.2s;"
      onmouseover="this.style.background='var(--adm-gold-dim)'"
      onmouseout="this.style.background='var(--adm-card-hover)'">
      <div style="width:28px;height:28px;border-radius:50%;background:var(--adm-gold-dim);color:var(--adm-gold);font-size:0.7rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials(u.name)}</div>
      <div>
        <p style="font-size:0.82rem;font-weight:600;color:var(--adm-text);margin:0;">${u.name || "—"}</p>
        <p style="font-size:0.72rem;color:var(--adm-muted);margin:0;">${u.email || ""}</p>
      </div>
    </div>
  `).join("");
});

window.selectUser = function(uid) {
  const user = allUsers.find(u => u.id === uid);
  if (!user) return;
  selectedUserId = uid;
  const results = document.getElementById("singleUserResults");
  const search  = document.getElementById("singleUserSearch");
  const tag     = document.getElementById("selectedUserTag");
  if (results) results.innerHTML = "";
  if (search)  search.value      = "";
  if (tag) { tag.textContent = `✓ Selected: ${user.name} (${user.email})`; tag.style.display = "block"; }
};

document.getElementById("sendNotifBtn")?.addEventListener("click", async () => {
  const target  = document.getElementById("notifTarget").value;
  const type    = document.getElementById("notifType").value;
  const title   = document.getElementById("notifTitle").value.trim();
  const message = document.getElementById("notifMessage").value.trim();
  const errEl   = document.getElementById("notifErr");
  const btn     = document.getElementById("sendNotifBtn");

  errEl.textContent = "";

  if (!title)   { errEl.textContent = "Please enter a notification title."; return; }
  if (!message) { errEl.textContent = "Please enter a notification message."; return; }
  if (target === "single" && !selectedUserId) { errEl.textContent = "Please select a user to send to."; return; }

  const targetLabel =
    target === "all"      ? "All Users" :
    target === "verified" ? "Verified Users" :
    target === "standard" ? "Standard Plan Users" :
    target === "premium"  ? "Premium Plan Users" :
    allUsers.find(u => u.id === selectedUserId)?.name || "User";

  const confirmed = await confirmWithPassword(`Send notification → ${targetLabel}`);
  if (!confirmed) return;

  btn.disabled = true;
  document.getElementById("sendNotifTxt").textContent = "Sending...";

  try {
    let recipients = [];
    if (target === "all")           recipients = allUsers;
    else if (target === "verified") recipients = allUsers.filter(u => u.emailVerified);
    else if (target === "standard") recipients = allUsers.filter(u => u.standardActivated);
    else if (target === "premium")  recipients = allUsers.filter(u => u.premiumActivated);
    else if (target === "single")   recipients = allUsers.filter(u => u.id === selectedUserId);

    if (!recipients.length) {
      errEl.textContent = "No users found matching this criteria.";
      btn.disabled = false;
      document.getElementById("sendNotifTxt").textContent = "Send Notification";
      return;
    }

    await Promise.all(recipients.map(user =>
      addDoc(collection(db, "users", user.id, "notifications"), {
        type, title, message, read: false, createdAt: serverTimestamp(), sentByAdmin: true
      })
    ));

    sentLog.unshift({ title, message, type, target: targetLabel, count: recipients.length, sentAt: new Date() });
    renderSentLog();

    document.getElementById("notifTitle").value           = "";
    document.getElementById("notifMessage").value         = "";
    document.getElementById("notifCharCount").textContent = "0 / 500";
    selectedUserId = null;
    const tag = document.getElementById("selectedUserTag");
    if (tag) tag.style.display = "none";

    showToast(`Notification sent to ${recipients.length} user${recipients.length !== 1 ? "s" : ""}.`, "success");

  } catch (err) {
    console.error(err);
    errEl.textContent = "Failed to send. Please try again.";
  }

  btn.disabled = false;
  document.getElementById("sendNotifTxt").textContent = "Send Notification";
});

function renderSentLog() {
  const list = document.getElementById("recentNotifsList");
  const cnt  = document.getElementById("sentCount");
  if (!list) return;
  if (cnt) cnt.textContent = `${sentLog.length} sent this session`;
  if (!sentLog.length) {
    list.innerHTML = `<p style="text-align:center;color:var(--adm-muted);font-size:0.82rem;padding:20px 0;">No notifications sent yet.</p>`;
    return;
  }
  list.innerHTML = sentLog.map(n => `
    <div style="background:var(--adm-bg);border:1px solid var(--adm-border);border-radius:10px;padding:12px 14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <strong style="font-size:0.85rem;color:var(--adm-text);">${n.title}</strong>
        <span style="font-size:0.68rem;color:var(--adm-muted);">${n.sentAt.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" })}</span>
      </div>
      <p style="font-size:0.78rem;color:var(--adm-muted);margin:0 0 8px 0;line-height:1.5;">${n.message}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="adm-badge active" style="font-size:0.65rem;">→ ${n.target}</span>
        <span class="adm-badge completed" style="font-size:0.65rem;">${n.count} recipient${n.count !== 1 ? "s" : ""}</span>
      </div>
    </div>
  `).join("");
}

loadUsers();