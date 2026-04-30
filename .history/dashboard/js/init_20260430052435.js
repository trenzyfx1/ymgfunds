
import { initTheme } from "./theme.js";
import { initNotifications } from "./notifications.js";
import { initSecurity } from "./security.js";
import { auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

initTheme();

initSecurity();

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  initNotifications(user.uid);
});