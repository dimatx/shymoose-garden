import { matchesFeedingRow, readFeedingFilters, type FeedingFilters, type FeedingRow, type FeedingView } from "../lib/feeding";

let events: AbortController | undefined;
document.addEventListener("astro:before-swap", () => events?.abort());

function initFeedingGuide() {
  const root = document.querySelector<HTMLElement>("[data-feeding-guide]");
  if (!root || root.dataset.bound === "true") return;
  root.dataset.bound = "true";
  events?.abort();
  events = new AbortController();
  const { signal } = events;
  const season = root.querySelector<HTMLSelectElement>("[data-feeding-window]")!;
  const product = root.querySelector<HTMLSelectElement>("[data-feeding-product]")!;
  const search = root.querySelector<HTMLInputElement>("[data-feeding-search]")!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-feeding-view]")];
  const rows = [...root.querySelectorAll<HTMLDetailsElement>("[data-feeding-row]")];
  const productIds = [...product.options].map((option) => option.value);
  const state = readFeedingFilters(new URLSearchParams(location.search), productIds);
  const rowData = (row: HTMLDetailsElement): FeedingRow => ({
    search: row.dataset.search!,
    window: row.dataset.window,
    product: row.dataset.product,
    reviewed: Boolean(row.dataset.recommendation),
  });
  const initialUrl = new URL(location.href);
  const target = rows.find((row) => row.dataset.plantId === initialUrl.searchParams.get("plant"))
    ?? rows.find((row) => row.id === location.hash.slice(1))
    ?? rows.find((row) => row.dataset.recommendation === location.hash.slice(1));
  if (initialUrl.searchParams.has("plant") && !target) {
    state.view = "plants";
    state.query = initialUrl.searchParams.get("plant")!;
  }
  if (target && !matchesFeedingRow(rowData(target), state)) {
    state.view = "plants";
    state.query = target.dataset.plantName!;
  }
  season.value = state.window;
  product.value = state.product;
  search.value = state.query;

  const saveUrl = (selected?: HTMLDetailsElement) => {
    const url = new URL(location.href);
    for (const key of ["view", "window", "product", "q", "plant", "need"]) url.searchParams.delete(key);
    if (state.view !== "season") url.searchParams.set("view", state.view);
    if (state.view === "season" && state.window !== "spring") url.searchParams.set("window", state.window);
    if (state.view === "product" && state.product) url.searchParams.set("product", state.product);
    if (state.query.trim()) url.searchParams.set("q", state.query.trim());
    if (selected) {
      url.searchParams.set("plant", selected.dataset.plantId!);
      url.hash = selected.id;
    } else if (url.hash.startsWith("#plant-") || rows.some((row) => `#${row.dataset.recommendation}` === url.hash)) {
      url.hash = "";
    }
    history.replaceState(history.state, "", url);
  };
  const update = () => {
    state.window = season.value as FeedingFilters["window"];
    state.product = product.value;
    state.query = search.value;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.feedingView === state.view));
    root.querySelector<HTMLElement>("[data-season-control]")!.hidden = state.view !== "season";
    root.querySelector<HTMLElement>("[data-product-control]")!.hidden = state.view !== "product";
    root.querySelector("[data-search-label]")!.textContent = state.view === "plants" ? "Find any active plant" : "Search these plants";
    for (const row of rows) {
      row.parentElement!.hidden = !matchesFeedingRow(rowData(row), state);
      if (row.parentElement!.hidden) row.open = false;
    }
    const visible = rows.filter((row) => !row.parentElement!.hidden);
    const unreviewed = visible.filter((row) => !row.dataset.recommendation).length;
    const baseline = visible.filter((row) => row.dataset.evidence === "general").length;
    const count = root.querySelector<HTMLElement>("[data-feeding-count]")!;
    count.textContent = `${visible.length} ${visible.length === 1 ? "plant" : "plants"}`
      + (state.view === "product" && state.product !== "no-product" && state.product ? " with a reviewed product choice" : "")
      + (baseline ? ` · ${baseline} general baseline` : "")
      + (unreviewed ? ` · ${unreviewed} not yet reviewed` : "");
    const context = root.querySelector<HTMLElement>("[data-product-context]")!;
    context.hidden = state.view !== "product" || !state.product;
    context.textContent = state.product === "no-product"
      ? "These plants have guidance but no product choice recorded. That does not mean they need no fertilizer."
      : "Reviewed product options, not instructions to feed every plant listed. Open a plant to check its conditions.";
    const empty = root.querySelector<HTMLElement>("[data-feeding-empty]")!;
    empty.hidden = visible.length > 0;
    empty.textContent = state.view === "product" && !state.product
      ? "Choose a fertilizer to see its reviewed plant matches."
      : state.view === "plants" && !state.query.trim()
        ? "Type a common or Latin name to find a plant and its guidance."
        : "No plants match. Clear the search or use Find a plant to search the whole garden, including plants awaiting review.";
    saveUrl(rows.find((row) => row.open && !row.parentElement!.hidden));
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      state.view = button.dataset.feedingView as FeedingView;
      search.value = "";
      for (const row of rows) row.open = false;
      update();
    }, { signal });
  }
  season.addEventListener("change", () => update(), { signal });
  product.addEventListener("change", () => update(), { signal });
  search.addEventListener("input", () => update(), { signal });
  root.querySelector("[data-feeding-reset]")!.addEventListener("click", () => {
    search.value = "";
    if (state.view === "product") product.value = "";
    if (state.view === "season") season.value = "spring";
    for (const row of rows) row.open = false;
    update();
  }, { signal });
  root.addEventListener("toggle", (event) => {
    const row = event.target;
    if (row instanceof HTMLDetailsElement && row.hasAttribute("data-feeding-row")) {
      saveUrl(rows.find((item) => item.open && !item.parentElement!.hidden));
    }
  }, { signal, capture: true });
  root.querySelector<HTMLElement>("[data-feeding-tools]")!.hidden = false;
  if (target) target.open = true;
  update();
  if (target) target.scrollIntoView({ block: "start" });
}

initFeedingGuide();
document.addEventListener("astro:page-load", initFeedingGuide);
