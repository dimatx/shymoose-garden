import { FEEDING_SEASONS, LEGACY_TREATMENTS, matchesFeedingSearch } from "../lib/feeding";
import { SOIL_FERTILITIES, SOIL_REACTIONS } from "../lib/plant-care";

type View = "season" | "category" | "product";
let events: AbortController | undefined;
document.addEventListener("astro:before-swap", () => events?.abort());

function initFeedingCatalog() {
  const root = document.querySelector<HTMLElement>("[data-feeding-catalog]");
  if (!root || root.dataset.bound === "true") return;
  root.dataset.bound = "true";
  events?.abort();
  events = new AbortController();
  const { signal } = events;
  const season = root.querySelector<HTMLSelectElement>("[data-feeding-season]")!;
  const product = root.querySelector<HTMLSelectElement>("[data-feeding-product]")!;
  const acidity = root.querySelector<HTMLSelectElement>("[data-feeding-acidity]")!;
  const fertility = root.querySelector<HTMLSelectElement>("[data-feeding-fertility]")!;
  const search = root.querySelector<HTMLInputElement>("[data-feeding-search]")!;
  const rows = [...root.querySelectorAll<HTMLElement>("[data-feeding-plant]")];
  const treatments = [...root.querySelectorAll<HTMLDetailsElement>("[data-treatment]")];
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-feeding-view]")];
  const list = root.querySelector<HTMLElement>("[data-treatment-list]")!;
  const back = root.querySelector<HTMLButtonElement>("[data-treatment-back]")!;
  const related = root.querySelector<HTMLButtonElement>("[data-related-toggle]")!;
  const url = new URL(location.href);
  const requestedView = url.searchParams.get("view");
  let view: View = requestedView === "category" || requestedView === "plants" ? "category"
    : requestedView === "product" || url.searchParams.has("product") ? "product" : "season";
  let selected = url.searchParams.get("treatment") ?? LEGACY_TREATMENTS[location.hash.slice(1)] ?? "";
  let relatedOpen = false;
  const requestedSeason = url.searchParams.get("season") ?? url.searchParams.get("window") ?? "spring";
  season.value = Object.hasOwn(FEEDING_SEASONS, requestedSeason) ? requestedSeason : "spring";
  product.value = [...product.options].some((option) => option.value === url.searchParams.get("product")) ? url.searchParams.get("product")! : "";
  acidity.value = Object.hasOwn(SOIL_REACTIONS, url.searchParams.get("acidity") ?? "") ? url.searchParams.get("acidity")! : "";
  fertility.value = Object.hasOwn(SOIL_FERTILITIES, url.searchParams.get("fertility") ?? "") ? url.searchParams.get("fertility")! : "";
  search.value = url.searchParams.get("q") ?? "";

  const legacyPlant = url.searchParams.get("plant") ?? (location.hash.startsWith("#plant-") ? location.hash.slice(7) : "");
  if (legacyPlant) {
    view = "category";
    search.value = rows.find((row) => row.dataset.feedingPlant === legacyPlant)?.querySelector("h2")?.textContent?.trim() ?? legacyPlant;
  }
  const selectedTreatment = treatments.find((treatment) => treatment.id === selected);
  if (!selectedTreatment) selected = "";
  else if (selectedTreatment.dataset.seasons && !selectedTreatment.dataset.seasons.split("|").includes(season.value)) {
    season.value = selectedTreatment.dataset.seasons.split("|")[0];
  }
  if (view === "product" && !selected && product.value) {
    const matches = treatments.filter((treatment) => treatment.dataset.product === product.value);
    if (matches.length === 1) selected = matches[0].id;
  }
  if (selected) relatedOpen = true;
  const singleProductTreatment = () => {
    const matches = treatments.filter((treatment) => treatment.dataset.product === product.value);
    return product.value && matches.length === 1 ? matches[0].id : "";
  };

  const rowMatches = (row: HTMLElement) =>
    matchesFeedingSearch(row.dataset.search!, search.value)
    && (view !== "category" || !acidity.value || row.dataset.acidity === acidity.value)
    && (view !== "category" || !fertility.value || row.dataset.fertility === fertility.value);
  const isMember = (row: HTMLElement, id: string) => row.dataset.treatments!.split("|").includes(id);
  const treatmentInView = (treatment: HTMLDetailsElement) =>
    view === "category"
    || (view === "product" ? Boolean(product.value) && treatment.dataset.product === product.value
      : !treatment.dataset.seasons || treatment.dataset.seasons.split("|").includes(season.value));

  const saveUrl = () => {
    const next = new URL(location.href);
    for (const key of ["view", "season", "window", "product", "q", "plant", "need", "acidity", "fertility", "treatment"]) next.searchParams.delete(key);
    if (view !== "season") next.searchParams.set("view", view);
    if (view === "season" && season.value !== "spring") next.searchParams.set("season", season.value);
    if (view === "product" && product.value) next.searchParams.set("product", product.value);
    if (view === "category" && acidity.value) next.searchParams.set("acidity", acidity.value);
    if (view === "category" && fertility.value) next.searchParams.set("fertility", fertility.value);
    if (search.value.trim()) next.searchParams.set("q", search.value.trim());
    if (selected) next.searchParams.set("treatment", selected);
    next.hash = "";
    history.replaceState(history.state, "", next);
  };
  const update = () => {
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.feedingView === view));
    root.querySelector<HTMLElement>("[data-season-control]")!.hidden = view !== "season";
    root.querySelector<HTMLElement>("[data-product-control]")!.hidden = view !== "product";
    root.querySelectorAll<HTMLElement>("[data-category-control]").forEach((control) => control.hidden = view !== "category");
    const matching = rows.filter(rowMatches);
    if (selected) {
      const active = treatments.find((treatment) => treatment.id === selected);
      if (!active || !treatmentInView(active) || !matching.some((row) => isMember(row, selected))) selected = "";
    }
    let available = 0;
    let applications = 0;
    for (const treatment of treatments) {
      const count = matching.filter((row) => isMember(row, treatment.id)).length;
      const matches = treatmentInView(treatment) && count > 0;
      if (matches) {
        available++;
        if (treatment.dataset.action !== "withhold") applications++;
      }
      treatment.hidden = !matches || Boolean(selected && treatment.id !== selected);
      treatment.open = treatment.id === selected && !treatment.hidden;
      const total = Number(treatment.dataset.total);
      treatment.querySelector("[data-treatment-count]")!.textContent =
        count === total ? `${count} plants` : `${count} of ${total} plants`;
    }
    const visible = matching.filter((row) => !selected || isMember(row, selected));
    const showPlants = view === "category" || Boolean(selected);
    for (const row of rows) row.hidden = !showPlants || !visible.includes(row);
    root.querySelector<HTMLElement>("[data-treatment-plants]")!.hidden = !showPlants;
    const selectedAction = treatments.find((treatment) => treatment.id === selected)?.dataset.action;
    root.querySelector<HTMLElement>("[data-feeding-safety]")!.hidden = (view === "category" && !selected) || selectedAction === "withhold";
    root.querySelector<HTMLElement>("[data-feeding-clear]")!.hidden = !search.value.trim() && !(view === "category" && (acidity.value || fertility.value));
    root.querySelector("[data-plants-heading]")!.textContent = `${visible.length} ${visible.length === 1 ? "plant" : "plants"}`;
    list.hidden = view === "category" && !relatedOpen && !selected;
    root.querySelector<HTMLElement>("[data-withhold-heading]")!.hidden = Boolean(selected) || !treatments.some((treatment) => !treatment.hidden && treatment.dataset.action === "withhold");
    back.hidden = !selected;
    related.hidden = view !== "category" || Boolean(selected);
    related.querySelector("[data-related-label]")!.textContent = `Related treatments (${available})`;
    related.setAttribute("aria-expanded", String(relatedOpen));
    root.querySelector<HTMLElement>("[data-no-seasonal-applications]")!.hidden = view !== "season" || applications > 0 || Boolean(selected) || Boolean(search.value);
    const status = root.querySelector<HTMLElement>("[data-feeding-status]")!;
    status.classList.toggle("sr-only", Boolean(selected) || view === "category");
    status.textContent = selected
      ? "Treatment plants"
      : view === "category" ? `${matching.length} matching plants`
        : view === "season" ? `${applications} applications · ${available - applications} no-feed groups`
          : `${available} ${available === 1 ? "treatment" : "treatments"}`;
    const empty = root.querySelector<HTMLElement>("[data-feeding-empty]")!;
    empty.hidden = view === "category" ? matching.length > 0 : available > 0;
    empty.textContent = view === "product" && !product.value
      ? "Choose a fertilizer to see its treatments and plants."
      : view === "category" ? "No catalog plants match. Clear filters or choose another category."
        : "No treatments match these plants. Use By category to search the whole catalog.";
    saveUrl();
  };
  const clearSelection = () => { selected = ""; };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      view = button.dataset.feedingView as View;
      clearSelection();
      relatedOpen = false;
      search.value = "";
      acidity.value = "";
      fertility.value = "";
      if (view === "product") selected = singleProductTreatment();
      update();
    }, { signal });
  }
  for (const treatment of treatments) {
    treatment.querySelector("summary")!.addEventListener("click", (event) => {
      event.preventDefault();
      selected = selected === treatment.id ? "" : treatment.id;
      update();
      if (selected) treatment.scrollIntoView({ block: "start" });
    }, { signal });
  }
  season.addEventListener("change", () => { clearSelection(); update(); }, { signal });
  product.addEventListener("change", () => {
    clearSelection();
    selected = singleProductTreatment();
    update();
  }, { signal });
  for (const control of [acidity, fertility]) control.addEventListener("change", () => { clearSelection(); update(); }, { signal });
  search.addEventListener("input", update, { signal });
  root.querySelector("[data-feeding-clear]")!.addEventListener("click", () => {
    search.value = "";
    acidity.value = "";
    fertility.value = "";
    update();
  }, { signal });
  back.addEventListener("click", () => { clearSelection(); update(); }, { signal });
  related.addEventListener("click", () => { relatedOpen = !relatedOpen; update(); }, { signal });
  root.querySelector<HTMLElement>("[data-feeding-tools]")!.hidden = false;
  update();
  root.dataset.ready = "true";
}

initFeedingCatalog();
document.addEventListener("astro:page-load", initFeedingCatalog);
