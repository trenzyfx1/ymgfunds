// DEVELOPED BY TRENZY TECH |+2347047889687 | COPYRIGHT © 2026 YMG FUNDS. ALL RIGHTS RESERVED.
import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { initSecurity } from "./security.js";
import { auth, db } from "../../js/firebase.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

initTheme();
initSecurity();

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  initNotifications(user.uid);

  try {
    await user.reload();
    if (user.emailVerified) {
      await updateDoc(doc(db, "users", user.uid), {
        emailVerified: true
      });
    }
  } catch (err) {
    console.error("Email verified sync error:", err);
  }
});