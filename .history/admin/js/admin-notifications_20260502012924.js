import { db } from "../../js/firebase.js";
import {
  collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let allUsers       = [];
let selectedUserId = null;
let sentLog        = [];

// ✅ Make function global FIRST (important for onclick)
window.selectUser = function(uid) {
  if (!allUsers || !allUsers.length) return;

  const user = allUsers.find(u => String(u.id) === String(uid));
  if (!user) return;

  selectedUserId = uid;

  const results = document.getElementById("singleUserResults");
  const search  = document.getElementById("singleUserSearch");
  const tag     = document.getElementById("selectedUserTag");

  if (results) results.innerHTML = "";
  if (search)  search.value      = "";

  if (tag) {
    tag.textContent   = `✓ Selected: ${user.name || "User"} (${user.email || ""})`;
    tag.style.display = "block";
  }
};

function showToast(msg, type = "success") {
  const toast = document.getElementById("admToast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `adm-toast ${type} visible`;
  setTimeout(() => toast.classList.remove("visible"), 4000);
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

async function loadUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    allUsers   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(err);
  }
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

  if (!query) {
    results.innerHTML = "";
    return;
  }

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
});

// (rest of your code remains unchanged)

loadUsers();