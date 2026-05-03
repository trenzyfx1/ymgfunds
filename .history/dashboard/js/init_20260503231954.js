// DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { initSecurity } from "./security.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
initSecurity();

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    await user.reload();
    if (user.emailVerified) {
      await updateDoc(doc(db, "users", user.uid), { emailVerified: true });
    }

    const [userSnap, settingsSnap] = await Promise.all([
      getDoc(doc(db, "users", user.uid)),
      getDoc(doc(db, "config", "platformSettings"))
    ]);

    const userData     = userSnap.data();
    const settings     = settingsSnap.exists() ? settingsSnap.data() : {};

    if (userData?.suspended === true) {
      await signOut(auth);
      sessionStorage.removeItem("ymg_session");
      window.location.href = "../pages/login.html?suspended=1";
      return;
    }

    if (settings.maintenanceMode === true) {
      window.location.href = "../dashboard/maintenance.html";
      return;
    }

  } catch (err) {
    console.error("Init auth check error:", err);
  }

  initNotifications(user.uid);
});

if (window.location.search.includes("suspended=1")) {
  window.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector('.auth-form') ||
                 document.querySelector('form') ||
                 document.querySelector('.login-card');

    if (!form) return;

    const existing = document.getElementById('suspendedBannerAuto');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id    = 'suspendedBannerAuto';
    banner.style.cssText = `
      display:flex;align-items:flex-start;gap:12px;
      background:#fef2f2;border:1px solid #fecaca;border-radius:10px;
      padding:14px 16px;margin-bottom:16px;
    `;
    banner.innerHTML = `
      <i class="fa-solid fa-ban" style="color:#dc2626;margin-top:2px;flex-shrink:0;font-size:1rem;"></i>
      <div>
        <strong style="display:block;font-size:0.88rem;color:#dc2626;margin-bottom:4px;">Account Suspended</strong>
        <p style="font-size:0.82rem;color:#555;margin:0 0 8px 0;line-height:1.5;">
          Your account has been suspended and you have been signed out. You cannot access YMG IQ at this time.
        </p>
        <a href="help.html" style="font-size:0.8rem;color:#dc2626;font-weight:700;text-decoration:underline;">
          Contact Support / Submit Appeal →
        </a>
      </div>
    `;
    form.insertBefore(banner, form.firstChild);
  });
}