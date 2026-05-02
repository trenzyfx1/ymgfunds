import { auth, db } from "../../js/firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists() && snap.data().isAdmin) {
    window.location.href = "./index.html";
  } else {
    await signOut(auth);
  }
});

document.getElementById("admEyeBtn")?.addEventListener("click", () => {
  const inp = document.getElementById("adminPassword");
  const ico = document.getElementById("admEyeIco");
  const hidden = inp.type === "password";
  inp.type      = hidden ? "text" : "password";
  ico.className = hidden ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
});

document.getElementById("adminPassword")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("adminLoginBtn")?.click();
});

document.getElementById("adminLoginBtn")?.addEventListener("click", async () => {
  const email    = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const errEl    = document.getElementById("adminErr");
  const denied   = document.getElementById("accessDenied");
  const btn      = document.getElementById("adminLoginBtn");
  const icon     = document.getElementById("adminBtnIcon");
  const text     = document.getElementById("adminBtnText");

  errEl.textContent    = "";
  denied.style.display = "none";

  if (!email)    { errEl.textContent = "Please enter your email address."; return; }
  if (!password) { errEl.textContent = "Please enter your password."; return; }

  btn.disabled     = true;
  icon.className   = "fa-solid fa-spinner fa-spin";
  text.textContent = "Verifying...";

  try {
    await setPersistence(auth, browserSessionPersistence);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists() || !snap.data().isAdmin) {
      await signOut(auth);
      denied.style.display = "flex";
      document.getElementById("accessDeniedMsg").textContent = "Access denied. You do not have admin privileges.";
      btn.disabled     = false;
      icon.className   = "fa-solid fa-arrow-right-to-bracket";
      text.textContent = "Login to Admin Panel";
      return;
    }

    sessionStorage.setItem("admin_login_time", Date.now().toString());
    window.location.href = "./index.html";

  } catch (err) {
    btn.disabled     = false;
    icon.className   = "fa-solid fa-arrow-right-to-bracket";
    text.textContent = "Login to Admin Panel";

    if (
      err.code === "auth/user-not-found"    ||
      err.code === "auth/wrong-password"    ||
      err.code === "auth/invalid-credential"
    ) {
      errEl.textContent = "Incorrect email or password.";
    } else if (err.code === "auth/too-many-requests") {
      errEl.textContent = "Too many failed attempts. Please try again later.";
    } else {
      errEl.textContent = "Login failed. Please try again.";
    }
  }
});