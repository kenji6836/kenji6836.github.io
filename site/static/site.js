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

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // 一覧カードの出現アニメ（読み込み時の最初の画面と、絞り込みの切り替え時）。動きを減らす設定では付けない
  const enterCards = (list, step) => {
    if (reducedMotion.matches) return;
    list.forEach((card, index) => {
      card.classList.remove("card-enter");
      void card.offsetWidth; // 連続クリックでも毎回アニメを再生する
      card.style.setProperty("--enter-delay", Math.min(index, 8) * step + "ms");
      card.classList.add("card-enter");
    });
  };

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
      if (updateHash) enterCards(cards.filter((card) => !card.hidden), 40);
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
    }, { threshold: 0.06, rootMargin: "0px 0px 80px 0px" });
    document.querySelectorAll(".stagger-grid").forEach((grid) => {
      Array.from(grid.children).forEach((element, index) => {
        element.style.setProperty("--reveal-delay", Math.min(index, 5) * 60 + "ms");
      });
    });
    reveals.forEach((element) => {
      if (element.getBoundingClientRect().top < window.innerHeight * 1.5) return; // 初期表示付近は隠さない
      element.classList.add("reveal-pending");
      observer.observe(element);
    });
    enterCards(cards.filter((card) => !card.classList.contains("reveal-pending")), 70); // 最初の画面のカードは順に浮かび上がる
  }
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) showAll();
  });

  // 紹介動画: autoplay 属性は付けない。動きを減らす設定ではネイティブ操作に任せ、それ以外は可視時のみ再生する
  document.querySelectorAll(".device-video").forEach((frame) => {
    const media = frame.querySelector("video");
    const toggle = frame.querySelector(".video-toggle");
    if (!media || !toggle) return;
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      media.controls = true;
      return;
    }
    let userPaused = false;
    const setState = () => {
      toggle.setAttribute("aria-pressed", media.paused ? "false" : "true");
      frame.classList.toggle("is-playing", !media.paused);
    };
    const play = () => { if (!userPaused) media.play().catch(() => { media.controls = true; }); };
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      userPaused = !media.paused;
      if (media.paused) media.play().catch(() => {}); else media.pause();
    });
    media.addEventListener("play", setState);
    media.addEventListener("pause", setState);
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) play(); else media.pause(); });
    }, { threshold: 0.35 }).observe(frame);
    reducedMotion.addEventListener("change", (event) => {
      if (event.matches) { userPaused = true; media.pause(); media.controls = true; toggle.hidden = true; }
    });
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

  // 動く実演（mock kind=report）: 「CSV を置く」→ 集計表が更新 → 通知が届く。要素は build 時に全月ぶん描いてあり、hidden とクラスの付け替えだけで進める
  document.querySelectorAll(".rd").forEach((demo) => {
    const run = demo.querySelector(".rd-run");
    const label = run.querySelector("span");
    const status = demo.querySelector(".rd-status");
    const pick = (selector) => Array.from(demo.querySelectorAll(selector));
    const files = pick(".rd-file"), rows = pick(".rd-row"), bars = pick(".rd-bar"), messages = pick(".rd-msg"), tiles = pick("[data-tile]");
    const initial = Number(demo.dataset.initial) || 1;
    let current = initial - 1;
    let busy = false;
    const month = (index) => rows[index].dataset.month;
    const steps = [
      (index, fresh) => files.forEach((file, n) => { file.hidden = n !== index; file.classList.toggle("is-new", fresh && n === index); }),
      (index, fresh) => {
        rows.forEach((row, n) => { row.hidden = n > index; row.classList.toggle("is-new", fresh && n === index); });
        bars.forEach((bar, n) => { bar.classList.toggle("is-future", n > index); bar.classList.toggle("is-latest", n === index); });
        const data = rows[index].dataset;
        tiles.forEach((tile) => {
          const value = data[tile.dataset.tile];
          tile.textContent = value;
          tile.classList.toggle("is-down", value.startsWith("−"));
          tile.classList.remove("is-bump");
          if (fresh) { void tile.offsetWidth; tile.classList.add("is-bump"); }
        });
      },
      (index, fresh) => messages.forEach((message, n) => { message.hidden = n > index || n < index - 1; message.classList.toggle("is-new", fresh && n === index); })
    ];
    const finish = () => {
      busy = false;
      run.disabled = false;
      label.textContent = current + 1 < rows.length ? demo.dataset.run.replace("{month}", month(current + 1)) : demo.dataset.reset;
    };
    const show = (index, fresh) => { // fresh: 3 段階を順に見せる／false: 一括で描き直す（最初に戻す）
      current = index;
      if (!fresh) { steps.forEach((step) => step(index, false)); demo.dataset.phase = "0"; status.textContent = ""; finish(); return; }
      busy = true;
      run.disabled = true;
      const wait = reducedMotion.matches ? 0 : 650;
      steps.forEach((step, n) => setTimeout(() => {
        demo.dataset.phase = String(n + 1);
        step(index, true);
        if (n === steps.length - 1) { status.textContent = demo.dataset.done.replace("{month}", month(index)); finish(); }
      }, n * wait));
    };
    run.addEventListener("click", () => {
      if (busy) return;
      if (current + 1 < rows.length) show(current + 1, true); else show(initial - 1, false);
    });
    finish();
    // 見えたら 1 か月ぶんだけ自動で進めて、押さなくても動きが分かるようにする（動きを減らす設定では待つ）
    if (!reducedMotion.matches && "IntersectionObserver" in window && current + 1 < rows.length) {
      const once = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        once.disconnect();
        setTimeout(() => { if (!busy && current === initial - 1) show(current + 1, true); }, 900);
      }, { threshold: 0.2 });
      once.observe(demo);
    }
  });
})();
