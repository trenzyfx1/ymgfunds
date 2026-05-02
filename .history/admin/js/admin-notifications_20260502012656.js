import { db } from "../../js/firebase.js";
import {
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
  const query   = document.getElementById("singleUserSearch").value.toLowerCase().trim();
  const results = document.getElementById("singleUserResults");
  if (!results) return;

  if (!query) { results.innerHTML = ""; return; }

  const matches = allUsers.filter(u =>
    (u.name  || "").toLowerCase().includes(query) ||
    (u.email || "").toLowerCase().includes(query)
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
}

window.selectUser = function(uid) {
  const user = allUsers.find(u => u.id === uid);
  if (!user) return;
  selectedUserId = uid;

  const results = document.getElementById("singleUserResults");
  const search  = document.getElementById("singleUserSearch");
  const tag     = document.getElementById("selectedUserTag");

  if (results) results.innerHTML = "";
  if (search)  search.value      = "";
  if (tag) {
    tag.textContent   = `✓ Selected: ${user.name} (${user.email})`;
    tag.style.display = "block";
  }
}

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

  btn.disabled = true;
  document.getElementById("sendNotifTxt").textContent = "Sending...";

  try {
    let recipients = [];

    if (target === "all") {
      recipients = allUsers;
    } else if (target === "verified") {
      recipients = allUsers.filter(u => u.emailVerified);
    } else if (target === "standard") {
      recipients = allUsers.filter(u => u.standardActivated);
    } else if (target === "premium") {
      recipients = allUsers.filter(u => u.premiumActivated);
    } else if (target === "single") {
      recipients = allUsers.filter(u => u.id === selectedUserId);
    }

    if (!recipients.length) {
      errEl.textContent = "No users found matching this criteria.";
      btn.disabled = false;
      document.getElementById("sendNotifTxt").textContent = "Send Notification";
      return;
    }

    const batches = [];
    for (const user of recipients) {
      batches.push(
        addDoc(collection(db, "users", user.id, "notifications"), {
          type,
          title,
          message,
          read:      false,
          createdAt: serverTimestamp(),
          sentByAdmin: true
        })
      );
    }

    await Promise.all(batches);

    const targetLabel =
      target === "all"      ? "All Users" :
      target === "verified" ? "Verified Users" :
      target === "standard" ? "Standard Plan Users" :
      target === "premium"  ? "Premium Plan Users" :
      allUsers.find(u => u.id === selectedUserId)?.name || "User";

    sentLog.unshift({
      title,
      message,
      type,
      target: targetLabel,
      count:  recipients.length,
      sentAt: new Date()
    });

    renderSentLog();

    document.getElementById("notifTitle").value   = "";
    document.getElementById("notifMessage").value = "";
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