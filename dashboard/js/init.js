// ── init.js ────────────────────────────────────
// Import this at the top of EVERY dashboard JS file
// It handles theme + notifications automatically

import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Theme runs immediately — no auth needed
initTheme();

// Notifications run after auth
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  initNotifications(user.uid);
});