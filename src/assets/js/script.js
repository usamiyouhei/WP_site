// リセット（node_modules の kiso.css）
import "kiso.css";
import "./_drawer.js";
import "./_mv-slider.js";
import "./_viewport.js";
import "./_works-filter.js";

// 開発環境でのみCSSをインポート（JS経由でスタイルを注入）
if (import.meta.env.DEV) {
  import("../styles/style.scss");
}

const hamburger = document.querySelector(".js-hamburger");
const drawer = document.querySelector(".js-drawer");

if (hamburger && drawer) {
  hamburger.addEventListener("click", () => {
    const isOpen = hamburger.classList.toggle("is-open");

    drawer.classList.toggle("is-open", isOpen);

    hamburger.setAttribute("aria-expanded", String(isOpen));
    drawer.setAttribute("aria-hidden", String(!isOpen));

    hamburger.setAttribute(
      "aria-label",
      isOpen ? "メニューを閉じる" : "メニューを開く",
    );
  });
}
