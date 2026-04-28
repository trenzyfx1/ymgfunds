// ── SECURITY MODULE ────────────────────────────
// Save as: dashboard/js/security.js

import { auth } from "../../js/firebase.js";
import {
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes inactivity
const LOGIN_PAGE  = "../pages/login.html";
const SESSION_KEY = "ymg_session";

let inactivityTimer = null;

// ── 1. SET / CLEAR SESSION ─────────────────────
export function setSession(uid) {
  sessionStorage.setItem(SESSION_KEY, uid);
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── 2. INACTIVITY TIMER ────────────────────────
// Only logs out if user has been completely idle for 10 minutes
// Page navigation resets the timer naturally because the page reloads
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(async () => {
    clearSession();
    await signOut(auth);
    window.location.replace(LOGIN_PAGE);
  }, TIMEOUT_MS);
}

function startInactivityWatcher() {
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"]
    .forEach(evt => document.addEventListener(evt, resetInactivityTimer, { passive: true }));
  resetInactivityTimer();
}

// ── 3. TAB CLOSE = SESSION CLEAR ──────────────
// sessionStorage is cleared automatically by the browser when the tab
// or window is ACTUALLY closed — we do NOT manually clear it on
// beforeunload because that fires on page navigation too.
// We only need to handle the case where the user comes back after
// the session has naturally expired.

// ── 4. DEVTOOLS WARNING ────────────────────────
// (function () {
//   const threshold = 160;
//   setInterval(() => {
//     if (
//       window.outerWidth  - window.innerWidth  > threshold ||
//       window.outerHeight - window.innerHeight > threshold
//     ) {
//       console.clear();
//       console.log("%c⚠ WARNING", "color:red;font-size:32px;font-weight:bold;");
//       console.log(
//         "%cThis is a secure financial platform. Unauthorized access is prohibited.",
//         "color:#081c10;font-size:14px;"
//       );
//     }
//   }, 1000);
// })();

// ── 5. DISABLE RIGHT CLICK ─────────────────────
document.addEventListener("contextmenu", e => e.preventDefault());

// ── INIT ───────────────────────────────────────
export function initSecurity() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Only redirect if there was a session before (tab was closed and reopened)
      const hadSession = sessionStorage.getItem(SESSION_KEY);
      if (hadSession) {
        clearSession();
      }
      // If no session at all, Firebase auth will handle redirect
      clearSession();
      window.location.replace(LOGIN_PAGE);
      return;
    }

    // Valid user — set session and watch inactivity
    setSession(user.uid);
    startInactivityWatcher();
  });
}