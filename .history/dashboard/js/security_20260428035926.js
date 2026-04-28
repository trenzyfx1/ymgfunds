// ── SECURITY MODULE ────────────────────────────
// Save as: dashboard/js/security.js
// Import in init.js — runs on every dashboard page

// import { auth } from "../../js/firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const TIMEOUT_MS   = 5 * 60 * 1000; // 5 minutes
const LOGIN_PAGE   = "../pages/login.html";
const SESSION_KEY  = "ymg_session";

let inactivityTimer = null;

// ── 1. SESSION CHECK ───────────────────────────
// If no active session token, force login immediately
function checkSession() {
  const session = sessionStorage.getItem(SESSION_KEY);
  if (!session) {
    // No session — sign out and redirect
    signOut(auth).catch(() => {});
    window.location.replace(LOGIN_PAGE);
  }
}

// ── 2. SET SESSION ON LOGIN ────────────────────
// Called when auth state confirms user is logged in
function setSession(uid) {
  sessionStorage.setItem(SESSION_KEY, uid);
}

// ── 3. CLEAR SESSION ON LOGOUT ─────────────────
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ── 4. AUTO LOGOUT ON INACTIVITY ──────────────
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(async () => {
    clearSession();
    await signOut(auth);
    window.location.replace(LOGIN_PAGE);
  }, TIMEOUT_MS);
}

function startInactivityWatcher() {
  // Reset timer on any user interaction
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(event => {
    document.addEventListener(event, resetInactivityTimer, { passive: true });
  });
  // Start the initial timer
  resetInactivityTimer();
}

// ── 5. LOGOUT ON TAB/BROWSER CLOSE ────────────
// sessionStorage is cleared automatically when tab closes
// This ensures next visit requires fresh login
window.addEventListener("beforeunload", () => {
  // Clear session so next visit requires login
  clearSession();
  signOut(auth).catch(() => {});
});

// ── 6. DISABLE RIGHT CLICK ─────────────────────
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// ── 7. DEVTOOLS DETERRENT ──────────────────────
// Detects if devtools is open and warns
(function devToolsDeterrent() {
  const threshold = 160;
  const check = () => {
    if (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      console.clear();
      console.log(
        "%c⚠ WARNING",
        "color:red;font-size:32px;font-weight:bold;"
      );
      console.log(
        "%cThis is a secure financial platform. Unauthorized access or tampering is prohibited and may be prosecuted.",
        "color:#081c10;font-size:14px;"
      );
    }
  };
  setInterval(check, 1000);
})();

// ── 8. BLOCK COPY OF SENSITIVE DATA ───────────
// Prevent copying on balance and account number elements
document.addEventListener("DOMContentLoaded", () => {
  const sensitiveIds = [
    "totalBalance", "investedBalance", "profitBalance",
    "availableBalance", "dashRefCode", "accountId"
  ];
  sensitiveIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("copy", e => e.preventDefault());
      el.style.userSelect = "none";
    }
  });
});

// ── INIT ───────────────────────────────────────
export function initSecurity() {
  // Watch auth state
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      clearSession();
      window.location.replace(LOGIN_PAGE);
      return;
    }
    // Valid user — set session and start watching
    setSession(user.uid);
    startInactivityWatcher();
  });

  // Check session immediately on page load
  checkSession();
}