(() => {
  "use strict";

  const menu = document.querySelector(".nav-toggle");
  const navigation = document.querySelector(".site-nav");
  if (menu && navigation) {
    const closeMenu = () => {
      menu.setAttribute("aria-expanded", "false");
      navigation.classList.remove("is-open");
    };
    menu.addEventListener("click", () => {
      const open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      navigation.classList.toggle("is-open", open);
    });
    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
        closeMenu();
        menu.focus();
      }
    });
    const desktop = window.matchMedia("(min-width: 900px)");
    desktop.addEventListener("change", () => {
      if (desktop.matches) closeMenu();
    });
    document.documentElement.classList.add("js");
  }

  const filters = Array.from(document.querySelectorAll("button[data-cat]"));
  const cards = Array.from(document.querySelectorAll("#work-list .card[data-cats]"));
  if (filters.length) {
    const selectCategory = (category, updateHash = false) => {
      const selected = filters.some((button) => button.dataset.cat === category) ? category : "all";
      filters.forEach((button) => {
        const active = button.dataset.cat === selected;
        button.classList.toggle("is-selected", active);
        button.setAttribute("aria-pressed", String(active));
      });
      cards.forEach((card) => {
        card.hidden = selected !== "all" && !card.dataset.cats.split(/\s+/).includes(selected);
      });
      if (updateHash) {
        const hash = selected === "all" ? "" : "#cat=" + encodeURIComponent(selected);
        history.replaceState(null, "", location.pathname + location.search + hash);
      }
    };
    const fromHash = () => {
      let category = "all";
      if (location.hash.startsWith("#cat=")) {
        try {
          category = decodeURIComponent(location.hash.slice(5));
        } catch (_) {
          category = "all";
        }
      }
      selectCategory(category);
    };
    filters.forEach((button) => button.addEventListener("click", () => selectCategory(button.dataset.cat, true)));
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reveals = Array.from(document.querySelectorAll(".reveal"));
  let observer;
  const showAll = () => {
    if (observer) observer.disconnect();
    reveals.forEach((element) => element.classList.remove("reveal-pending"));
  };
  if (!reducedMotion.matches && "IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove("reveal-pending");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06 });
    document.querySelectorAll(".stagger-grid").forEach((grid) => {
      Array.from(grid.children).forEach((element, index) => {
        element.style.setProperty("--reveal-delay", index * 60 + "ms");
      });
    });
    reveals.forEach((element) => {
      element.classList.add("reveal-pending");
      observer.observe(element);
    });
  }
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) showAll();
  });

  document.querySelectorAll("form[data-action]").forEach((form) => {
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('[role="status"]');
    const showStatus = (success) => {
      status.textContent = success ? form.dataset.success : form.dataset.error;
      status.dataset.state = success ? "success" : "error";
    };
    let pending = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (pending) return;
      if (!form.reportValidity()) return;
      status.textContent = "";
      const action = form.dataset.action.trim();
      if (!action) {
        showStatus(false);
        return;
      }
      pending = true;
      submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      try {
        const response = await fetch(action, {
          method: "POST",
          mode: "no-cors",
          body: new FormData(form)
        });
        if (response.type !== "opaque" && !response.ok) throw new Error("Request failed");
        form.reset();
        showStatus(true);
      } catch (_) {
        showStatus(false);
      } finally {
        pending = false;
        submit.disabled = false;
        form.removeAttribute("aria-busy");
      }
    });
    submit.disabled = false;
  });
})();
