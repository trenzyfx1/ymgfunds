// ── THEME MANAGER ──────────────────────────────
// Save as: dashboard/js/theme.js
// Import this on every dashboard page

const THEME_KEY = "ymg-theme";

(function () {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
})();

export function initTheme() {
  const isDark = () => document.documentElement.getAttribute("data-theme") === "dark";

  function updateIcon() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const ico = btn.querySelector("i");
    if (!ico) return;
    ico.className = isDark() ? "fa-solid fa-sun" : "fa-solid fa-moon";
    btn.title = isDark() ? "Switch to Light Mode" : "Switch to Dark Mode";
  }

  updateIcon();

  const toggleBtn = document.getElementById("themeToggle");
  if (!toggleBtn) return;

  toggleBtn.addEventListener("click", () => {
    if (isDark()) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(THEME_KEY, "light");
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem(THEME_KEY, "dark");
    }
    updateIcon();
  });
}