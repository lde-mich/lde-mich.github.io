(function () {
  "use strict";

  const CATEGORY_LABELS = Object.freeze({
    pokemon: "Pokémon",
    onepiece: "One Piece",
    dragonball: "Dragon Ball"
  });

  const STATUS_CONFIG = Object.freeze({
    available: {
      label: "Disponibile",
      note: "Link allo shop in aggiornamento"
    },
    coming: {
      label: "In arrivo",
      note: "Presto in vetrina"
    },
    "live-only": {
      label: "Disponibile in live",
      note: "Seguici su TikTok per le prossime live"
    },
    "sold-out": {
      label: "Esaurito",
      note: "Non disponibile all’acquisto"
    }
  });

  const CORE_CATEGORIES = Object.keys(CATEGORY_LABELS);
  const collator = new Intl.Collator("it", { sensitivity: "base" });

  function updateYear() {
    const year = document.getElementById("year");

    if (year) {
      year.textContent = String(new Date().getFullYear());
    }
  }

  function initializeLiveBadge() {
    const comingSoonBadge = document.getElementById("coming-soon-badge");
    const liveBadge = document.getElementById("tiktok-live-badge");
    const config = window.BALU_SITE_CONFIG;
    const isTikTokLive = Boolean(config && config.tiktokLive === true);

    if (!comingSoonBadge || !liveBadge) {
      return;
    }

    comingSoonBadge.hidden = isTikTokLive;
    liveBadge.hidden = !isTikTokLive;
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isSlug(value) {
    return isNonEmptyString(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  }

  function getSafeImagePath(value) {
    if (!isNonEmptyString(value)) {
      return null;
    }

    const path = value.trim();
    const hasParentSegment = path.split("/").includes("..");

    if (!path.startsWith("assets/products/") || hasParentSegment || path.includes("\\")) {
      return null;
    }

    return path;
  }

  function getSafeExternalUrl(value) {
    if (!isNonEmptyString(value) || !value.trim().startsWith("https://")) {
      return null;
    }

    try {
      const url = new URL(value.trim());
      const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
      const isTikTokUrl = hostname === "tiktok.com" || hostname.endsWith(".tiktok.com");

      return url.protocol === "https:" && isTikTokUrl ? url.href : null;
    } catch (error) {
      return null;
    }
  }

  function normalizeProducts(source) {
    if (!Array.isArray(source)) {
      console.warn("BaluStore: BALU_PRODUCTS non è un array; viene mostrato il catalogo vuoto.");
      return [];
    }

    const ids = new Set();
    const products = [];

    source.forEach(function (item, index) {
      if (!item || typeof item !== "object" || Array.isArray(item) || item.active === false) {
        return;
      }

      const id = isNonEmptyString(item.id) ? item.id.trim() : "";
      const name = isNonEmptyString(item.name) ? item.name.trim() : "";
      const category = isNonEmptyString(item.category) ? item.category.trim() : "";

      if (!isSlug(id) || !name || !isSlug(category) || ids.has(id)) {
        console.warn("BaluStore: prodotto ignorato perché non valido o duplicato all’indice", index);
        return;
      }

      const status = Object.prototype.hasOwnProperty.call(STATUS_CONFIG, item.status)
        ? item.status
        : "coming";

      if (status !== item.status) {
        console.warn("BaluStore: stato non valido per", id, "— impostato su 'coming'.");
      }

      ids.add(id);
      products.push({
        id: id,
        name: name,
        category: category,
        type: isNonEmptyString(item.type) ? item.type.trim() : "",
        image: getSafeImagePath(item.image),
        imageAlt: isNonEmptyString(item.imageAlt) ? item.imageAlt.trim() : name,
        status: status,
        badge: isNonEmptyString(item.badge) ? item.badge.trim() : null,
        tiktokUrl: getSafeExternalUrl(item.tiktokUrl),
        featured: item.featured === true,
        order: Number.isFinite(item.order) ? item.order : Number.MAX_SAFE_INTEGER
      });
    });

    return products.sort(function (first, second) {
      if (first.featured !== second.featured) {
        return first.featured ? -1 : 1;
      }

      if (first.order !== second.order) {
        return first.order - second.order;
      }

      const byName = collator.compare(first.name, second.name);
      return byName || collator.compare(first.id, second.id);
    });
  }

  function getCategoryLabel(category) {
    if (CATEGORY_LABELS[category]) {
      return CATEGORY_LABELS[category];
    }

    return category
      .split("-")
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function createFilters(products, filterBar, onSelect) {
    const discoveredCategories = Array.from(
      new Set(
        products.map(function (product) {
          return product.category;
        })
      )
    )
      .filter(function (category) {
        return !CORE_CATEGORIES.includes(category);
      })
      .sort(function (first, second) {
        return collator.compare(getCategoryLabel(first), getCategoryLabel(second));
      });

    const categories = ["all"].concat(CORE_CATEGORIES, discoveredCategories);
    const fragment = document.createDocumentFragment();

    categories.forEach(function (category) {
      const button = document.createElement("button");
      const isActive = category === "all";

      button.type = "button";
      button.className = "filter-button";
      button.dataset.category = category;
      button.textContent = category === "all" ? "Tutti" : getCategoryLabel(category);
      button.setAttribute("aria-pressed", String(isActive));
      button.setAttribute("aria-controls", "product-grid");
      button.addEventListener("click", function () {
        onSelect(category);
      });
      fragment.appendChild(button);
    });

    filterBar.replaceChildren(fragment);
  }

  function createImageFallback(product) {
    const fallback = document.createElement("div");
    const mark = document.createElement("span");
    const label = document.createElement("span");

    fallback.className = "product-card__fallback";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", "Immagine di " + product.name + " non disponibile");

    mark.className = "product-card__fallback-mark";
    mark.textContent = "B";
    mark.setAttribute("aria-hidden", "true");

    label.className = "product-card__fallback-label";
    label.textContent = "BaluStore";
    label.setAttribute("aria-hidden", "true");

    fallback.append(mark, label);
    return fallback;
  }

  function createProductCard(product) {
    const card = document.createElement("article");
    const media = document.createElement("div");
    const fallback = createImageFallback(product);
    const content = document.createElement("div");
    const category = document.createElement("p");
    const title = document.createElement("h3");
    const meta = document.createElement("div");
    const status = document.createElement("span");
    const titleId = "product-" + product.id + "-title";

    card.className = "product-card is-" + product.status;
    card.dataset.category = product.category;
    card.dataset.productId = product.id;
    card.setAttribute("aria-labelledby", titleId);

    media.className = "product-card__media";
    if (product.image) {
      const image = document.createElement("img");

      fallback.setAttribute("aria-hidden", "true");
      image.className = "product-card__image";
      image.alt = product.imageAlt;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener(
        "load",
        function () {
          image.classList.add("is-loaded");
          fallback.hidden = true;
        },
        { once: true }
      );
      image.addEventListener(
        "error",
        function () {
          image.remove();
          fallback.hidden = false;
          fallback.removeAttribute("aria-hidden");
        },
        { once: true }
      );
      image.src = product.image;
      media.append(image, fallback);
    } else {
      media.appendChild(fallback);
    }

    content.className = "product-card__content";
    category.className = "product-card__category";
    category.textContent = getCategoryLabel(product.category);
    title.className = "product-card__title";
    title.id = titleId;
    title.textContent = product.name;

    meta.className = "product-card__meta";
    if (product.badge) {
      const badge = document.createElement("span");
      badge.className = "product-card__badge";
      badge.textContent = product.badge;
      meta.appendChild(badge);
    }

    status.className = "product-card__status";
    status.textContent = STATUS_CONFIG[product.status].label;
    meta.appendChild(status);

    content.append(category, title, meta);

    const canLink =
      Boolean(product.tiktokUrl) &&
      (product.status === "available" || product.status === "live-only");

    if (canLink) {
      const link = document.createElement("a");
      const text = document.createElement("span");
      const arrow = document.createElement("span");
      const externalHint = document.createElement("span");

      link.className = "product-card__cta";
      link.href = product.tiktokUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";

      text.textContent =
        product.status === "available" ? "Vedi su TikTok Shop" : "Vedi su TikTok";
      arrow.textContent = "→";
      arrow.setAttribute("aria-hidden", "true");
      externalHint.className = "visually-hidden";
      externalHint.textContent =
        " — " + product.name + "; si apre in una nuova scheda";

      link.append(text, arrow, externalHint);
      content.appendChild(link);
    } else {
      const note = document.createElement("p");
      note.className = "product-card__note";
      note.textContent = STATUS_CONFIG[product.status].note;
      content.appendChild(note);
    }

    card.append(media, content);
    return card;
  }

  function createEmptyState(isCatalogEmpty, onReset) {
    const emptyState = document.createElement("div");
    const title = document.createElement("p");
    const copy = document.createElement("p");

    emptyState.className = "catalog-empty";
    emptyState.dataset.emptyState = "true";

    title.className = "catalog-empty__title";
    copy.className = "catalog-empty__copy";

    if (isCatalogEmpty) {
      title.textContent = "Nuovi prodotti in arrivo.";
      copy.textContent = "Seguici su TikTok per non perdere i prossimi drop.";
    } else {
      title.textContent = "Nessun prodotto disponibile in questa categoria.";
      copy.textContent = "Prova un altro filtro oppure torna a vedere tutta la vetrina.";

      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "catalog-empty__reset";
      reset.textContent = "Mostra tutti";
      reset.addEventListener("click", onReset);
      emptyState.append(title, copy, reset);
      return emptyState;
    }

    emptyState.append(title, copy);
    return emptyState;
  }

  function initializeShowcase() {
    const grid = document.getElementById("product-grid");
    const filterBar = document.getElementById("product-filters");
    const resultsStatus = document.getElementById("product-results-status");

    if (!grid || !filterBar) {
      return;
    }

    const products = normalizeProducts(window.BALU_PRODUCTS);
    const cards = products.map(createProductCard);
    let activeCategory = "all";

    grid.append.apply(grid, cards);

    function selectCategory(category, options) {
      const settings = options || {};
      activeCategory = category;

      filterBar.querySelectorAll(".filter-button").forEach(function (button) {
        const isActive = button.dataset.category === activeCategory;
        button.setAttribute("aria-pressed", String(isActive));

        if (settings.focus && isActive) {
          button.focus();
        }
      });

      grid.querySelectorAll("[data-empty-state]").forEach(function (emptyState) {
        emptyState.remove();
      });

      let visibleCount = 0;
      cards.forEach(function (card) {
        const isVisible = activeCategory === "all" || card.dataset.category === activeCategory;
        card.hidden = !isVisible;

        if (isVisible) {
          visibleCount += 1;
        }
      });

      if (visibleCount === 0) {
        grid.appendChild(
          createEmptyState(products.length === 0, function () {
            selectCategory("all", { focus: true });
          })
        );
      }

      if (resultsStatus) {
        const filterLabel =
          activeCategory === "all" ? "Tutti" : getCategoryLabel(activeCategory);
        const countLabel =
          visibleCount === 1 ? " prodotto visualizzato." : " prodotti visualizzati.";
        resultsStatus.textContent = "Filtro " + filterLabel + ": " + visibleCount + countLabel;
      }
    }

    createFilters(products, filterBar, function (category) {
      selectCategory(category);
    });
    selectCategory("all");
  }

  updateYear();
  initializeLiveBadge();
  initializeShowcase();
})();
