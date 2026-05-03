import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, collection, getDocs,
  query, where, orderBy, limit,
  addDoc, updateDoc, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const INACTIVITY_LIMIT = 30 * 60 * 1000;
let inactivityTimer    = null;

function forceLogout() {
  sessionStorage.removeItem("admin_login_time");
  signOut(auth).then(() => {
    window.location.href = "./login.html";
  });
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    alert("You have been logged out due to inactivity.");
    forceLogout();
  }, INACTIVITY_LIMIT);
}

function startInactivityWatcher() {
  ["mousemove", "keydown", "click", "scroll", "touchstart"].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, true);
  });
  resetInactivityTimer();
}

const loginTime = sessionStorage.getItem("admin_login_time");
if (!loginTime) {
  signOut(auth).then(() => {
    window.location.href = "./login.html";
  });
}

// ── BUILD NOTIFICATION BELL ───────────────────────────────────────
function buildAdminNotifBell() {
  const topbarRight = document.querySelector(".adm-topbar-right");
  if (!topbarRight || document.getElementById("admNotifWrap")) return;

  const wrap = document.createElement("div");
  wrap.id    = "admNotifWrap";
  wrap.style.cssText = "position:relative;display:inline-flex;";

  wrap.innerHTML = `
    <button id="admNotifBtn" style="
      position:relative;width:38px;height:38px;border-radius:10px;
      background:var(--adm-card);border:1px solid var(--adm-border);
      color:var(--adm-muted);cursor:pointer;display:flex;align-items:center;
      justify-content:center;font-size:0.95rem;transition:all 0.2s;
    " title="Admin Notifications">
      <i class="fa-solid fa-bell"></i>
      <span id="admNotifBadge" style="
        display:none;position:absolute;top:-4px;right:-4px;
        background:#ef4444;color:white;font-size:0.6rem;font-weight:700;
        width:18px;height:18px;border-radius:50%;align-items:center;
        justify-content:center;font-family:'DM Sans',sans-serif;
      ">0</span>
    </button>

    <div id="admNotifDropdown" style="
      display:none;position:absolute;top:calc(100% + 8px);right:0;
      width:340px;background:var(--adm-card);border:1px solid var(--adm-border);
      border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.4);
      z-index:9999;overflow:hidden;
    ">
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:14px 16px;border-bottom:1px solid var(--adm-border);
      ">
        <strong style="font-family:'Syne',sans-serif;font-size:0.88rem;color:var(--adm-text);">
          <i class="fa-solid fa-bell" style="color:var(--adm-gold);margin-right:6px;"></i>
          Admin Alerts
        </strong>
        <button id="admNotifMarkAll" style="
          background:none;border:none;color:var(--adm-gold);font-size:0.72rem;
          cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;
        ">Mark all read</button>
      </div>
      <div id="admNotifList" style="
        max-height:360px;overflow-y:auto;
      ">
        <div style="text-align:center;padding:24px;color:var(--adm-muted);font-size:0.82rem;">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px;"></i> Loading...
        </div>
      </div>
      <div style="
        padding:10px 16px;border-top:1px solid var(--adm-border);
        text-align:center;
      ">
        <span style="font-size:0.72rem;color:var(--adm-muted);">
          Alerts refresh automatically every 5 minutes
        </span>
      </div>
    </div>
  `;

  // Insert before the first child (before live badge)
  topbarRight.insertBefore(wrap, topbarRight.firstChild);

  // Toggle dropdown
  document.getElementById("admNotifBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    const dd = document.getElementById("admNotifDropdown");
    dd.style.display = dd.style.display === "none" ? "block" : "none";
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) {
      const dd = document.getElementById("admNotifDropdown");
      if (dd) dd.style.display = "none";
    }
  });

  document.getElementById("admNotifMarkAll")?.addEventListener("click", async () => {
    await markAllAdminNotifsRead();
    document.getElementById("admNotifDropdown").style.display = "none";
  });
}

async function loadAdminNotifications() {
  const list  = document.getElementById("admNotifList");
  const badge = document.getElementById("admNotifBadge");
  if (!list) return;

  try {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, "adminNotifications"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const unread = notifs.filter(n => !n.read).length;

      if (badge) {
        if (unread > 0) {
          badge.textContent   = unread > 99 ? "99+" : String(unread);
          badge.style.display = "flex";
        } else {
          badge.style.display = "none";
        }
      }

      renderAdminNotifList(notifs);
    });

    await scanPlatformForAlerts();

  } catch (err) {
    console.error("Admin notif load error:", err);
    if (list) list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--adm-muted);font-size:0.82rem;">Failed to load alerts.</div>`;
  }
}

function renderAdminNotifList(notifs) {
  const list = document.getElementById("admNotifList");
  if (!list) return;

  if (!notifs.length) {
    list.innerHTML = `
      <div style="text-align:center;padding:28px 16px;color:var(--adm-muted);font-size:0.82rem;">
        <i class="fa-solid fa-shield-check" style="font-size:1.5rem;color:var(--adm-green);display:block;margin-bottom:8px;"></i>
        No alerts. Platform looks healthy.
      </div>`;
    return;
  }

  list.innerHTML = notifs.map(n => {
    const iconMap = {
      fraud:      { icon: "fa-solid fa-triangle-exclamation", color: "#ef4444" },
      withdrawal: { icon: "fa-solid fa-upload",               color: "#f97316" },
      loan:       { icon: "fa-solid fa-hand-holding-dollar",  color: "#3b82f6" },
      kyc:        { icon: "fa-solid fa-id-card",              color: "#a855f7" },
      user:       { icon: "fa-solid fa-user-plus",            color: "#22c55e" },
      system:     { icon: "fa-solid fa-gear",                 color: "#64748b" },
    };
    const { icon, color } = iconMap[n.type] || { icon: "fa-solid fa-bell", color: "#c9a84c" };

    const timeStr = n.createdAt?.seconds
      ? timeAgo(n.createdAt.seconds)
      : "Just now";

    return `
      <div onclick="markAdminNotifRead('${n.id}')" style="
        display:flex;align-items:flex-start;gap:10px;padding:12px 16px;
        border-bottom:1px solid var(--adm-border);cursor:pointer;
        background:${n.read ? "transparent" : "rgba(201,168,76,0.04)"};
        transition:background 0.2s;
      " onmouseover="this.style.background='var(--adm-card-hover)'"
         onmouseout="this.style.background='${n.read ? "transparent" : "rgba(201,168,76,0.04)"}'">
        <div style="
          width:32px;height:32px;border-radius:8px;flex-shrink:0;
          background:${color}18;color:${color};
          display:flex;align-items:center;justify-content:center;font-size:0.8rem;
        ">
          <i class="${icon}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <p style="font-size:0.8rem;font-weight:${n.read ? "500" : "700"};color:var(--adm-text);margin:0 0 2px 0;line-height:1.4;">${n.title || "Alert"}</p>
          <p style="font-size:0.72rem;color:var(--adm-muted);margin:0;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n.message || ""}</p>
          <span style="font-size:0.68rem;color:var(--adm-muted);margin-top:3px;display:block;">${timeStr}</span>
        </div>
        ${!n.read ? `<div style="width:7px;height:7px;border-radius:50%;background:var(--adm-gold);flex-shrink:0;margin-top:5px;"></div>` : ""}
      </div>`;
  }).join("");
}

window.markAdminNotifRead = async function(id) {
  try {
    await updateDoc(doc(db, "adminNotifications", id), { read: true });
  } catch (err) { console.error(err); }
};

async function markAllAdminNotifsRead() {
  try {
    const snap = await getDocs(query(collection(db, "adminNotifications"), where("read", "==", false)));
    const updates = snap.docs.map(d => updateDoc(d.ref, { read: true }));
    await Promise.all(updates);
  } catch (err) { console.error(err); }
}

async function scanPlatformForAlerts() {
  try {
    const existingSnap = await getDocs(
      query(collection(db, "adminNotifications"), orderBy("createdAt", "desc"), limit(50))
    );
    const existingKeys = new Set(existingSnap.docs.map(d => d.data().dedupeKey).filter(Boolean));

    const alerts = [];
    const todayStr = new Date().toLocaleDateString("en-GB");

    const pendingWdrs = await getDocs(
      query(collection(db, "withdrawalRequests"), where("status", "==", "pending"))
    );
    if (pendingWdrs.size > 0) {
      const key = `pending_wdr_${todayStr}`;
      if (!existingKeys.has(key)) {
        alerts.push({
          type:       "withdrawal",
          title:      `${pendingWdrs.size} Withdrawal${pendingWdrs.size !== 1 ? "s" : ""} Awaiting Approval`,
          message:    `You have ${pendingWdrs.size} pending withdrawal request${pendingWdrs.size !== 1 ? "s" : ""} that need your attention.`,
          dedupeKey:  key,
          read:       false,
          createdAt:  serverTimestamp()
        });
      }
    }

    const pendingLoans = await getDocs(collection(db, "loanRequests"));
    const pendingLoanCount = pendingLoans.docs.filter(d => {
      const s = d.data().status;
      return s === "pending" || s === "under_review";
    }).length;
    if (pendingLoanCount > 0) {
      const key = `pending_loan_${todayStr}`;
      if (!existingKeys.has(key)) {
        alerts.push({
          type:      "loan",
          title:     `${pendingLoanCount} Loan Application${pendingLoanCount !== 1 ? "s" : ""} Under Review`,
          message:   `${pendingLoanCount} loan application${pendingLoanCount !== 1 ? "s" : ""} require your review and decision.`,
          dedupeKey: key,
          read:      false,
          createdAt: serverTimestamp()
        });
      }
    }

    const usersSnap = await getDocs(collection(db, "users"));
    const users     = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unverified = users.filter(u => !u.emailVerified && !u.authEmailVerified && !u.phoneVerified);
    if (unverified.length > 0) {
      const key = `unverified_kyc_${todayStr}`;
      if (!existingKeys.has(key)) {
        alerts.push({
          type:      "kyc",
          title:     `${unverified.length} Unverified User${unverified.length !== 1 ? "s" : ""}`,
          message:   `${unverified.length} user${unverified.length !== 1 ? "s" : ""} have not verified their email or phone number.`,
          dedupeKey: key,
          read:      false,
          createdAt: serverTimestamp()
        });
      }
    }

    const allTxs = [];
    await Promise.all(users.map(async (user) => {
      const txSnap = await getDocs(collection(db, "users", user.id, "transactions"));
      txSnap.forEach(d => allTxs.push({ ...d.data(), userId: user.id }));
    }));

    users.forEach(user => {
      const userTxs  = allTxs.filter(t => t.userId === user.id);
      const deposits = userTxs.filter(t => t.type === "deposit");
      const wdrs     = userTxs.filter(t => t.type === "withdrawal");

      const totalDep = deposits.reduce((s, t) => s + (t.amount || 0), 0);
      const totalWdr = wdrs.reduce((s, t) => s + (t.gross || t.amount || 0), 0);

      const todayDeps = deposits.filter(t => t.date?.seconds && new Date(t.date.seconds * 1000).toLocaleDateString("en-GB") === todayStr);
      const todayWdrs = wdrs.filter(t => t.date?.seconds && new Date(t.date.seconds * 1000).toLocaleDateString("en-GB") === todayStr);

      if (todayDeps.length > 0 && todayWdrs.length > 0) {
        const key = `fraud_sameday_${user.id}_${todayStr}`;
        if (!existingKeys.has(key)) {
          alerts.push({
            type:      "fraud",
            title:     `⚠ Suspicious Activity — ${user.name || "User"}`,
            message:   `${user.name || user.email} deposited and requested a withdrawal on the same day.`,
            dedupeKey: key,
            read:      false,
            createdAt: serverTimestamp()
          });
        }
      }

      if (totalDep > 0 && totalWdr > totalDep * 3) {
        const key = `fraud_ratio_${user.id}`;
        if (!existingKeys.has(key)) {
          alerts.push({
            type:      "fraud",
            title:     `⚠ Withdrawal Ratio Alert — ${user.name || "User"}`,
            message:   `${user.name || user.email} has withdrawn ${totalWdr.toFixed(2)} vs deposited ${totalDep.toFixed(2)} (${Math.round(totalWdr / totalDep)}× ratio).`,
            dedupeKey: key,
            read:      false,
            createdAt: serverTimestamp()
          });
        }
      }

      if (todayWdrs.length >= 3) {
        const key = `fraud_freq_${user.id}_${todayStr}`;
        if (!existingKeys.has(key)) {
          alerts.push({
            type:      "fraud",
            title:     `⚠ High Frequency Withdrawals — ${user.name || "User"}`,
            message:   `${user.name || user.email} made ${todayWdrs.length} withdrawal requests today.`,
            dedupeKey: key,
            read:      false,
            createdAt: serverTimestamp()
          });
        }
      }

      if ((user.referralEarnings || 0) > totalDep && totalDep > 0) {
        const key = `fraud_referral_${user.id}`;
        if (!existingKeys.has(key)) {
          alerts.push({
            type:      "fraud",
            title:     `⚠ Referral Farming — ${user.name || "User"}`,
            message:   `${user.name || user.email} earned GHS ${(user.referralEarnings || 0).toFixed(2)} in referrals but only deposited GHS ${totalDep.toFixed(2)}.`,
            dedupeKey: key,
            read:      false,
            createdAt: serverTimestamp()
          });
        }
      }
    });

    const newToday = users.filter(u => {
      return u.createdAt?.seconds &&
        new Date(u.createdAt.seconds * 1000).toLocaleDateString("en-GB") === todayStr;
    });
    if (newToday.length > 0) {
      const key = `new_users_${todayStr}`;
      if (!existingKeys.has(key)) {
        alerts.push({
          type:      "user",
          title:     `${newToday.length} New User${newToday.length !== 1 ? "s" : ""} Today`,
          message:   newToday.map(u => u.name || u.email).join(", "),
          dedupeKey: key,
          read:      false,
          createdAt: serverTimestamp()
        });
      }
    }

    if (alerts.length > 0) {
      await Promise.all(alerts.map(a => addDoc(collection(db, "adminNotifications"), a)));
    }

  } catch (err) {
    console.error("Platform scan error:", err);
  }
}

function timeAgo(seconds) {
  const diff = Date.now() - seconds * 1000;
  if (diff < 60000)  return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "./login.html"; return; }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || !snap.data().isAdmin) {
    await signOut(auth);
    window.location.href = "./login.html";
    return;
  }

  const d    = snap.data();
  const name = d.name || "Admin";

  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const avEl     = document.getElementById("admAvatar");
  const nameEl   = document.getElementById("admName");
  const emailEl  = document.getElementById("admEmail");

  if (avEl)    avEl.textContent    = initials;
  if (nameEl)  nameEl.textContent  = name;
  if (emailEl) emailEl.textContent = d.email || user.email;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
  const dateEl = document.getElementById("admDate");
  if (dateEl) dateEl.textContent = today;

  startInactivityWatcher();
  buildAdminNotifBell();
  await loadAdminNotifications();

  setInterval(async () => { await loadAdminNotifications(); }, 5 * 60 * 1000);
});

document.getElementById("admLogout")?.addEventListener("click", async () => {
  sessionStorage.removeItem("admin_login_time");
  await signOut(auth);
  window.location.href = "./login.html";
});

document.getElementById("admMenuToggle")?.addEventListener("click", () => {
  document.getElementById("admSidebar")?.classList.toggle("open");
});