import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export let ADMIN_USER = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./login.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists() || !snap.data().isAdmin) {
    await signOut(auth);
    window.location.href = "./login.html";
    return;
  }

  ADMIN_USER = user;
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
});

document.getElementById("admLogout")?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "./login.html";
});

document.getElementById("admMenuToggle")?.addEventListener("click", () => {
  document.getElementById("admSidebar")?.classList.toggle("open");
});