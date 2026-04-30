// ── init.js ────────────────────────────────────
// Import this at the top of EVERY dashboard JS file
// Handles: theme + notifications + security

import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { initSecurity } from "./security.js";
import { auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Theme runs immediately — no auth needed
initTheme();

initSecurity();

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  initNotifications(user.uid);
});