/* Tema anti-FOUC: aplica .dark do localStorage antes do 1.º paint.
   Ficheiro externo render-blocking (sem async/defer) referenciado no
   <head> do RootLayout — corre síncrono antes do body, sem flash, e sem
   o warning do React 19 sobre scripts inline como filhos de componente. */
(function () {
  try {
    var d = localStorage.getItem("theme") === "dark";
    if (d) document.documentElement.classList.add("dark");
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", d ? "#100f0d" : "#fafaf7");
  } catch (e) {}
})();
