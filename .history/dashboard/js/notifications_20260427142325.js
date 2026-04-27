// ── NOTIFICATION SYSTEM ────────────────────────
// Save as: dashboard/js/notifications.js
// Import this on every dashboard page

import { db } from "../../js/firebase.js";
import {
  collection, query, orderBy, limit,
  onSnapshot, updateDoc, doc, writeBatch,
  getDocs, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let NOTIF_UID      = null;
let NOTIF_UNSUB    = null;

// ── INIT — call this after auth ────────────────
export function initNotifications(uid) {
  NOTIF_UID = uid;
  buildDropdown();
  listenNotifications();
  requestBrowserPermission();
}

// ── BUILD DROPDOWN HTML into notif btn ─────────
function buildDropdown() {
  const btn = document.getElementById("notifBtn");
  if (!btn || document.getElementById("notifDropdown")) return;

  // Make the button a relative container
  btn.style.position = "relative";

  const dropdown = document.createElement("div");
  dropdown.className = "notif-dropdown";
  dropdown.id = "notifDropdown";
  dropdown.innerHTML = `
    <div class="notif-drop-head">
      <h4>Notifications</h4>
      <button class="notif-mark-all" id="notifMarkAll">Mark all as read</button>
    </div>
    <div class="notif-drop-list" id="notifList">
      <div class="notif-empty">
        <i class="fa-solid fa-bell-slash"></i>
        No notifications yet
      </div>
    </div>
    <div class="notif-drop-footer">
      <a href="notifications.html">View all notifications</a>
    </div>
  `;

  // Place dropdown relative to topbar-right
  const topbarRight = btn.closest(".topbar-right");
  if (topbarRight) {
    topbarRight.style.position = "relative";
    topbarRight.appendChild(dropdown);
  } else {
    btn.parentNode.appendChild(dropdown);
  }

  // Toggle dropdown
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove("open");
    }
  });

  // Mark all as read
  document.getElementById("notifMarkAll")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await markAllRead();
  });
}

// ── LISTEN TO NOTIFICATIONS ────────────────────
function listenNotifications() {
  if (NOTIF_UNSUB) NOTIF_UNSUB();

  const q = query(
    collection(db, "users", NOTIF_UID, "notifications"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  NOTIF_UNSUB = onSnapshot(q, (snap) => {
    const notifs  = [];
    let   unread  = 0;

    snap.forEach(ds => {
      const n = { id: ds.id, ...ds.data() };
      notifs.push(n);
      if (!n.read) unread++;
    });

    updateBadge(unread);
    renderDropdown(notifs);

    // Browser popup for newest unread
    if (notifs.length > 0 && !notifs[0].read && !notifs[0]._popupShown) {
      triggerBrowserNotif(notifs[0]);
    }
  });
}

// ── RENDER DROPDOWN LIST ───────────────────────
function renderDropdown(notifs) {
  const listEl = document.getElementById("notifList");
  if (!listEl) return;

  if (notifs.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty">
        <i class="fa-solid fa-bell-slash"></i>
        No notifications yet
      </div>`;
    return;
  }

  listEl.innerHTML = "";
  notifs.forEach(n => {
    const item = document.createElement("div");
    item.className = "notif-item" + (n.read ? "" : " unread");
    item.innerHTML = `
      <div class="notif-item-icon ${getNotifIconClass(n.type)}">
        <i class="${getNotifIcon(n.type)}"></i>
      </div>
      <div class="notif-item-body">
        <strong>${n.title || "Notification"}</strong>
        <p>${n.message || ""}</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <span class="notif-item-time">${timeAgo(n.createdAt)}</span>
        ${!n.read ? '<div class="notif-dot"></div>' : ''}
      </div>
    `;

    // Mark as read on click
    item.addEventListener("click", async () => {
      if (!n.read) {
        await updateDoc(doc(db, "users", NOTIF_UID, "notifications", n.id), { read: true });
      }
    });

    listEl.appendChild(item);
  });
}

// ── MARK ALL READ ──────────────────────────────
async function markAllRead() {
  const q    = query(collection(db, "users", NOTIF_UID, "notifications"), where("read", "==", false));
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach(ds => batch.update(ds.ref, { read: true }));
  await batch.commit();
}

// ── UPDATE BADGE ───────────────────────────────
function updateBadge(count) {
  const badge = document.getElementById("notifCount");
  if (!badge) return;
  badge.textContent  = count > 99 ? "99+" : count;
  badge.style.display = count > 0 ? "flex" : "none";
}

// ── BROWSER NOTIFICATION ───────────────────────
function requestBrowserPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function triggerBrowserNotif(n) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(`YMG Funds — ${n.title || "New Notification"}`, {
    body:  n.message || "",
    icon:  "../images/logo.jpeg",
    badge: "../images/logo.jpeg",
    tag:   n.id  // prevents duplicate popups
  });
}

// ── HELPERS ────────────────────────────────────
function getNotifIconClass(type) {
  const map = {
    deposit:        "ni-deposit",
    withdrawal:     "ni-withdrawal",
    profit:         "ni-profit",
    referral_reward:"ni-referral",
    investment:     "ni-investment",
    activation:     "ni-activation",
  };
  return map[type] || "ni-info";
}

function getNotifIcon(type) {
  const map = {
    deposit:        "fa-solid fa-arrow-down",
    withdrawal:     "fa-solid fa-arrow-up",
    profit:         "fa-solid fa-arrow-trend-up",
    referral_reward:"fa-solid fa-gift",
    investment:     "fa-solid fa-chart-line",
    activation:     "fa-solid fa-unlock",
  };
  return map[type] || "fa-solid fa-bell";
}

function timeAgo(ts) {
  if (!ts?.seconds) return "—";
  const diff = Date.now() - ts.seconds * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}