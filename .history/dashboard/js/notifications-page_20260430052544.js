import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, query, orderBy,
  onSnapshot, updateDoc, deleteDoc,
  doc, getDocs, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();

let NF_USER    = null;
let ALL_NOTIFS = [];
let NF_FILTER  = "all";

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "../pages/login.html"; return; }
  NF_USER = user;

  const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) {
    const d = snap.data();
    const name     = d.name || "User";
    const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    const av = document.getElementById("profileAvatar");
    if (av) av.textContent = initials;
  }

  initNotifications(user.uid);
  listenNotifications(user.uid);
});

document.querySelectorAll("#logoutBtn, #logoutBtn2").forEach(btn => {
  if (btn) btn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "../pages/login.html";
  });
});

function listenNotifications(uid) {
  const q = query(
    collection(db, "users", uid, "notifications"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snap) => {
    ALL_NOTIFS = [];
    snap.forEach(ds => ALL_NOTIFS.push({ id: ds.id, ...ds.data() }));
    updateSummary();
    renderList();
  });
}

function renderList() {
  const container = document.getElementById("nfList");
  if (!container) return;

  const filtered = NF_FILTER === "all"
    ? ALL_NOTIFS
    : NF_FILTER === "unread"
      ? ALL_NOTIFS.filter(n => !n.read)
      : ALL_NOTIFS.filter(n => n.type === NF_FILTER);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="nf-empty">
        <i class="fa-solid fa-bell-slash"></i>
        <p>${NF_FILTER === "unread" ? "No unread notifications" : "No notifications found"}</p>
      </div>`;
    return;
  }

  container.innerHTML = "";

  const groups = {};
  filtered.forEach(n => {
    const dateKey = n.createdAt?.seconds
      ? new Date(n.createdAt.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
      : "Earlier";
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(n);
  });

  Object.entries(groups).forEach(([date, notifs]) => {
    const group = document.createElement("div");
    group.className = "nf-group";
    group.innerHTML = `<div class="nf-group-label">${date}</div>`;

    notifs.forEach(n => {
      const item = document.createElement("div");
      item.className = "nf-item" + (n.read ? "" : " nf-unread");
      item.innerHTML = `
        <div class="nf-item-icon ${getIconClass(n.type)}">
          <i class="${getIcon(n.type)}"></i>
        </div>
        <div class="nf-item-body">
          <div class="nf-item-top">
            <strong>${n.title || "Notification"}</strong>
            <span class="nf-item-time">${timeAgo(n.createdAt)}</span>
          </div>
          <p>${n.message || ""}</p>
        </div>
        <div class="nf-item-actions">
          ${!n.read ? `<button class="nf-read-btn" data-id="${n.id}" title="Mark as read"><i class="fa-solid fa-check"></i></button>` : '<span class="nf-read-tag">Read</span>'}
          <button class="nf-del-btn" data-id="${n.id}" title="Delete"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;

      item.querySelector(".nf-read-btn")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await updateDoc(doc(db, "users", NF_USER.uid, "notifications", n.id), { read: true });
      });

      item.querySelector(".nf-del-btn")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        await deleteDoc(doc(db, "users", NF_USER.uid, "notifications", n.id));
      });

      item.addEventListener("click", async () => {
        if (!n.read) {
          await updateDoc(doc(db, "users", NF_USER.uid, "notifications", n.id), { read: true });
        }
      });

      group.appendChild(item);
    });

    container.appendChild(group);
  });
}

function updateSummary() {
  const unread = ALL_NOTIFS.filter(n => !n.read).length;
  const unreadEl = document.getElementById("nfUnreadCount");
  const totalEl  = document.getElementById("nfTotalCount");
  if (unreadEl) {
    unreadEl.textContent = `${unread} unread`;
    unreadEl.style.display = unread > 0 ? "inline-flex" : "none";
  }
  if (totalEl) totalEl.textContent = `${ALL_NOTIFS.length} total`;
}

document.querySelectorAll(".nf-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".nf-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    NF_FILTER = chip.dataset.filter;
    renderList();
  });
});

document.getElementById("nfMarkAllBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("nfMarkAllBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Marking...';

  const q     = query(collection(db, "users", NF_USER.uid, "notifications"), where("read", "==", false));
  const snap  = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(ds => batch.update(ds.ref, { read: true }));
  await batch.commit();

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Mark all as read';
});

// ── CLEAR ALL ──────────────────────────────────
document.getElementById("nfClearAllBtn")?.addEventListener("click", async () => {
  if (!confirm("Delete all notifications? This cannot be undone.")) return;

  const btn = document.getElementById("nfClearAllBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Clearing...';

  const q     = query(collection(db, "users", NF_USER.uid, "notifications"));
  const snap  = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(ds => batch.delete(ds.ref));
  await batch.commit();

  btn.disabled = false;
  btn.innerHTML = '<i class="fa-solid fa-trash"></i> Clear all';
});

// ── HELPERS ────────────────────────────────────
function getIconClass(type) {
  const map = { deposit: "ni-deposit", withdrawal: "ni-withdrawal", profit: "ni-profit", referral_reward: "ni-referral", investment: "ni-investment", activation: "ni-activation" };
  return map[type] || "ni-info";
}

function getIcon(type) {
  const map = { deposit: "fa-solid fa-arrow-down", withdrawal: "fa-solid fa-arrow-up", profit: "fa-solid fa-arrow-trend-up", referral_reward: "fa-solid fa-gift", investment: "fa-solid fa-chart-line", activation: "fa-solid fa-unlock" };
  return map[type] || "fa-solid fa-bell";
}

function timeAgo(ts) {
  if (!ts?.seconds) return "—";
  const diff = Date.now() - ts.seconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}