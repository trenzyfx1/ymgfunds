
import { auth } from "../../js/firebase.js";
import {
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const TIMEOUT_MS  = 10 * 60 * 1000;
const LOGIN_PAGE  = "../pages/login.html";
const SESSION_KEY = "ymg_session";

let inactivityTimer = null;

export function setSession(uid) {
  sessionStorage.setItem(SESSION_KEY, uid);
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

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

document.addEventListener("contextmenu", e => e.preventDefault());

export function initSecurity() {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      const hadSession = sessionStorage.getItem(SESSION_KEY);
      if (hadSession) {
        clearSession();
      }
      clearSession();
      window.location.replace(LOGIN_PAGE);
      return;
    }

    setSession(user.uid);
    startInactivityWatcher();
  });
}