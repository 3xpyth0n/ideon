(function () {
  try {
    document.documentElement.setAttribute("data-no-transition", "true");
    var theme = localStorage.getItem("theme");
    var supportDarkMode =
      window.matchMedia("(prefers-color-scheme: dark)").matches === true;
    if (!theme && supportDarkMode) theme = "dark";
    if (!theme) theme = "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.setProperty("color-scheme", theme);

    var collapsed = localStorage.getItem("sidebarCollapsed");
    if (collapsed === "true") {
      document.documentElement.setAttribute("data-sidebar-collapsed", "true");
    }
  } catch {
    // Local storage access might be restricted
  }
})();
