// DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
import { db } from "../../js/firebase.js";
import {
  collection, query, orderBy, limit,
  onSnapshot, updateDoc, doc,
  getDocs, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let NOTIF_UID   = null;
let NOTIF_UNSUB = null;
let DROPDOWN_BUILT = false;

export function initNotifications(uid) {
  NOTIF_UID = uid;
  buildDropdown();
  listenNotifications();
  requestBrowserPermission();
}

function buildDropdown() {
  if (DROPDOWN_BUILT) return;
  DROPDOWN_BUILT = true;

  const btn = document.getElementById("notifBtn");
  if (!btn) return;

  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;display:inline-flex;";
  btn.parentNode.insertBefore(wrap, btn);
  wrap.appendChild(btn);

  const dropdown = document.createElement("div");
  dropdown.className = "notif-dropdown";
  dropdown.id        = "notifDropdown";
  dropdown.innerHTML = `
    <div class="notif-drop-head">
      <h4><i class="fa-solid fa-bell" style="color:#c9a84c;margin-right:6px;"></i> Notifications</h4>
      <button class="notif-mark-all" id="notifMarkAll">Mark all read</button>
    </div>
    <div class="notif-drop-list" id="notifList">
      <div class="notif-empty">
        <i class="fa-solid fa-bell-slash"></i>
        No notifications yet
      </div>
    </div>
    <div class="notif-drop-footer">
      <a href="notifications.html"><i class="fa-solid fa-list"></i> View all notifications</a>
    </div>
  `;

  wrap.appendChild(dropdown);

  // Toggle on bell click
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      dropdown.classList.remove("open");
    }
  });

  // Mark all as read
  document.getElementById("notifMarkAll")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await markAllRead();
    dropdown.classList.remove("open");
  });
}

// ── LISTEN ─────────────────────────────────────
function listenNotifications() {
  if (NOTIF_UNSUB) NOTIF_UNSUB();

  const q = query(
    collection(db, "users", NOTIF_UID, "notifications"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  let prevNewestId = null;

  NOTIF_UNSUB = onSnapshot(q, (snap) => {
    const notifs = [];
    let   unread = 0;

    snap.forEach(ds => {
      const n = { id: ds.id, ...ds.data() };
      notifs.push(n);
      if (!n.read) unread++;
    });

    updateBadge(unread);
    renderList(notifs);

    // Browser popup only for brand new notifications
    if (notifs.length > 0) {
      const newest = notifs[0];
      if (!newest.read && newest.id !== prevNewestId) {
        prevNewestId = newest.id;
        triggerBrowserNotif(newest);
      }
    }
  });
}

// ── RENDER LIST ────────────────────────────────
function renderList(notifs) {
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
      <div class="notif-item-icon ${getIconClass(n.type)}">
        <i class="${getIcon(n.type)}"></i>
      </div>
      <div class="notif-item-body">
        <strong>${n.title || "Notification"}</strong>
        <p>${n.message || ""}</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">
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
  try {
    const q    = query(
      collection(db, "users", NOTIF_UID, "notifications"),
      where("read", "==", false)
    );
    const snap  = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach(ds => batch.update(ds.ref, { read: true }));
    await batch.commit();
  } catch (err) {
    console.error("Mark all read error:", err);
  }
}

// ── BADGE ──────────────────────────────────────
function updateBadge(count) {
  const badge = document.getElementById("notifCount");
  if (!badge) return;
  if (count > 0) {
    badge.textContent   = count > 99 ? "99+" : String(count);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// ── BROWSER NOTIFICATION ───────────────────────
function requestBrowserPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function triggerBrowserNotif(n) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(`YMG Funds — ${n.title || "New Notification"}`, {
      body:  n.message || "",
      icon:  "../images/logo.jpeg",
      tag:   n.id
    });
  } catch (err) {
    console.warn("Browser notification failed:", err);
  }
}

function getIconClass(type) {
  const map = {
    deposit:         "ni-deposit",
    withdrawal:      "ni-withdrawal",
    profit:          "ni-profit",
    referral_reward: "ni-referral",
    investment:      "ni-investment",
    activation:      "ni-activation"
  };
  return map[type] || "ni-info";
}

function getIcon(type) {
  const map = {
    deposit:         "fa-solid fa-arrow-down",
    withdrawal:      "fa-solid fa-arrow-up",
    profit:          "fa-solid fa-arrow-trend-up",
    referral_reward: "fa-solid fa-gift",
    investment:      "fa-solid fa-chart-line",
    activation:      "fa-solid fa-unlock"
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
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(ts.seconds * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}