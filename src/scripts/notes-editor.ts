import {
  NOTES_BRANCH,
  NOTES_DIR,
  NOTES_REPO,
  commitMessage,
  decodeBase64Utf8,
  encodeBase64Utf8,
  normalizeNote,
  noteChange,
  notePath,
  parseNote,
  serializeNote,
} from "../lib/notes";

interface PlantInfo {
  id: string;
  name: string;
  latinName: string;
  url: string;
  thumb: string;
}

interface Draft {
  text: string;
  baseSha?: string;
  savedAt: string;
}

type LeaveChoice = "publish" | "draft" | "discard" | "cancel";

const TOKEN_KEY = "garden-notes:github-token";
const draftKey = (plantId: string) => `garden-notes:draft:${plantId}`;
const API = "https://api.github.com";

class GitHubError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function readDraft(plantId: string): Draft | undefined {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey(plantId)) ?? "null");
    return typeof draft?.text === "string" ? draft : undefined;
  } catch {
    return undefined;
  }
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function initNotesEditor() {
  const appEl = document.getElementById("notes-app");
  if (!appEl) return;
  const app: HTMLElement = appEl;

  // Sveltia, the previous editor, kept its GitHub token here.
  localStorage.removeItem("sveltia-cms.user");

  const plants: PlantInfo[] = JSON.parse(document.getElementById("notes-plants")!.textContent!);
  const plantsById = new Map(plants.map((plant) => [plant.id, plant]));
  const authUrl = app.dataset.authUrl!;
  const $ = <T extends HTMLElement = HTMLElement>(name: string) =>
    app.querySelector<T>(`[data-bind="${name}"]`)!;
  const textArea = $<HTMLTextAreaElement>("text");
  const dialog = $<HTMLDialogElement>("dialog");
  const publishButton = app.querySelector<HTMLButtonElement>('[data-action="publish"]')!;
  const draftButton = app.querySelector<HTMLButtonElement>('[data-action="save-draft"]')!;

  let token = localStorage.getItem(TOKEN_KEY) ?? "";
  let notedPlants = new Set(
    [...app.querySelectorAll<HTMLElement>("[data-plant-row][data-noted]")].map((row) => row.dataset.plantRow!),
  );
  let filter: "all" | "noted" = "all";

  // Editor state for the open plant.
  let current: PlantInfo | undefined;
  let published = "";
  let publishedSha: string | undefined;
  let draftText: string | undefined;
  let loading = false;
  let busy = false;
  let loadId = 0;

  const show = (view: string) => {
    app.dataset.state = view;
    app.querySelectorAll<HTMLElement>("[data-view]").forEach((el) => (el.hidden = el.dataset.view !== view));
  };

  const setGlobalMessage = (text: string) => ($("global-message").textContent = text);

  const setMessage = (html: string, tone: "ok" | "error" = "ok") => {
    const box = $("message");
    box.className =
      tone === "error"
        ? "mt-4 rounded-2xl bg-bloom-100 px-4 py-3 text-sm text-bloom-600 dark:bg-bloom-600/20 dark:text-bloom-100 empty:hidden"
        : "mt-4 rounded-2xl bg-leaf-100 px-4 py-3 text-sm text-leaf-800 dark:bg-leaf-900 dark:text-leaf-100 empty:hidden";
    box.innerHTML = html;
  };

  async function github(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      });
    } catch {
      throw new GitHubError(0, "Couldn't reach GitHub. Check your connection and try again.");
    }
    if (response.status === 401) {
      signOut("Your GitHub sign-in expired. Please sign in again.");
      throw new GitHubError(401, "Signed out.");
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new GitHubError(response.status, body.message ?? `GitHub returned ${response.status}.`);
    }
    return response.status === 204 ? undefined : response.json();
  }

  // --- Unsaved-change tracking -------------------------------------------

  const currentText = () => normalizeNote(textArea.value);
  /** Changes that are neither published nor kept as a draft. */
  const hasUnsavedChanges = () =>
    !!current && !loading && currentText() !== published && currentText() !== draftText;

  function renderStatus() {
    const text = currentText();
    const status = $("status");
    let label = "";
    let tone = "ok";
    if (loading) label = "";
    else if (text !== published && text !== draftText) [label, tone] = ["Unsaved changes", "pending"];
    else if (text !== published) [label, tone] = ["Draft — not published", "pending"];
    else if (published) label = "Published";
    status.textContent = label;
    status.dataset.tone = tone;

    const change = noteChange(publishedSha !== undefined, text);
    publishButton.disabled = busy || loading || text === published || change === undefined;
    publishButton.textContent = busy ? "Publishing…" : change === "remove" ? "Publish (removes note)" : "Publish";
    draftButton.disabled = busy || loading || text === published || text === draftText;
    textArea.disabled = loading;

    const banner = $("draft-banner");
    banner.hidden = loading || draftText === undefined;
  }

  function setDraftBanner(draft: Draft) {
    const stale = draft.baseSha !== publishedSha;
    $("draft-text").textContent =
      `Draft from ${formatWhen(draft.savedAt)}, saved on this device and not published yet.` +
      (stale ? " The published note has changed since then." : "");
  }

  function saveDraft() {
    if (!current) return;
    const draft: Draft = { text: currentText(), baseSha: publishedSha, savedAt: new Date().toISOString() };
    localStorage.setItem(draftKey(current.id), JSON.stringify(draft));
    draftText = draft.text;
    setDraftBanner(draft);
    setMessage("Draft saved on this device. Publish it when you're ready.");
    renderStatus();
  }

  function clearDraft() {
    if (!current) return;
    localStorage.removeItem(draftKey(current.id));
    draftText = undefined;
  }

  function markNoted(plantId: string, noted: boolean) {
    if (noted) notedPlants.add(plantId);
    else notedPlants.delete(plantId);
    const row = app.querySelector<HTMLElement>(`[data-plant-row="${CSS.escape(plantId)}"]`);
    if (row) row.toggleAttribute("data-noted", noted);
    renderList();
  }

  // --- Publishing ----------------------------------------------------------

  async function publish(): Promise<boolean> {
    if (!current || busy) return false;
    const plant = current;
    const text = currentText();
    const change = noteChange(publishedSha !== undefined, text);
    if (!change) return true;
    busy = true;
    renderStatus();
    try {
      const path = `/repos/${NOTES_REPO}/contents/${notePath(plant.id)}`;
      const message = commitMessage(change, plant.name);
      if (change === "remove") {
        await github(path, { method: "DELETE", body: JSON.stringify({ message, sha: publishedSha, branch: NOTES_BRANCH }) });
        publishedSha = undefined;
      } else {
        const result = await github(path, {
          method: "PUT",
          body: JSON.stringify({
            message,
            content: encodeBase64Utf8(serializeNote(plant.id, text)),
            branch: NOTES_BRANCH,
            ...(publishedSha ? { sha: publishedSha } : {}),
          }),
        });
        publishedSha = result.content.sha;
      }
      if (current !== plant) return true;
      published = text;
      textArea.value = text;
      clearDraft();
      markNoted(plant.id, change !== "remove");
      setMessage(
        `${change === "remove" ? "Note removed." : "Published!"} The plant page updates in about a minute. ` +
          `<a class="font-semibold underline underline-offset-4" href="${plant.url}">View plant page</a>`,
      );
      return true;
    } catch (error) {
      if (!(error instanceof GitHubError) || error.status === 401) return false;
      if (error.status === 409 || error.status === 422) {
        saveDraft();
        setMessage(
          "Someone else changed this note after you opened it, so it wasn't published. Your text is saved as a draft. " +
            '<button type="button" data-action="reload-note" class="font-semibold underline underline-offset-4">Reload the note</button>',
          "error",
        );
      } else if (error.status === 403 || error.status === 404) {
        setMessage("GitHub didn't allow this change. Make sure your account can write to the garden repository.", "error");
      } else {
        setMessage(error.message, "error");
      }
      return false;
    } finally {
      busy = false;
      renderStatus();
    }
  }

  // --- Leave guard ---------------------------------------------------------

  function askToLeave(): Promise<LeaveChoice> {
    dialog.querySelector("#dialog-title")!.textContent = "Publish your changes?";
    dialog.querySelector("#dialog-body")!.textContent =
      `Your changes to ${current?.name ?? "this note"} aren't published yet.`;
    dialog.returnValue = "cancel";
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>('button[value="publish"]')!.focus();
    return new Promise((resolve) =>
      dialog.addEventListener("close", () => resolve((dialog.returnValue || "cancel") as LeaveChoice), { once: true }),
    );
  }

  /** Resolves true when it's safe to leave the open note. */
  async function confirmLeave(): Promise<boolean> {
    if (!hasUnsavedChanges()) return true;
    const choice = await askToLeave();
    if (choice === "publish") return publish();
    if (choice === "draft") {
      saveDraft();
      return true;
    }
    return choice === "discard";
  }

  window.addEventListener("beforeunload", (event) => {
    if (hasUnsavedChanges()) event.preventDefault();
  });

  // --- Views ---------------------------------------------------------------

  function renderList() {
    const query = $<HTMLInputElement>("search").value.trim().toLowerCase();
    let visible = 0;
    app.querySelectorAll<HTMLElement>("[data-plant-row]").forEach((row) => {
      const match =
        (!query || row.dataset.search!.includes(query)) && (filter === "all" || notedPlants.has(row.dataset.plantRow!));
      row.hidden = !match;
      if (match) visible++;
    });
    $("empty").hidden = visible > 0;
    $("empty").textContent = filter === "noted" && !query ? "No plants have notes yet." : "No plants match your search.";
    $("noted-count").textContent = `(${notedPlants.size})`;
    app.querySelectorAll<HTMLElement>("[data-filter]").forEach((chip) =>
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === filter)),
    );
  }

  async function openPlant(plant: PlantInfo) {
    current = plant;
    const id = ++loadId;
    loading = true;
    published = "";
    publishedSha = undefined;
    draftText = undefined;
    textArea.value = "";
    setMessage("");
    show("editor");
    document.title = `${plant.name} · Garden notes · ShyMoose Garden`;
    $("name").textContent = plant.name;
    $("latin").textContent = plant.latinName;
    $<HTMLImageElement>("thumb").src = plant.thumb;
    $<HTMLAnchorElement>("plant-link").href = plant.url;
    textArea.placeholder = "Loading the published note…";
    renderStatus();

    try {
      const file = await github(
        `/repos/${NOTES_REPO}/contents/${notePath(plant.id)}?ref=${NOTES_BRANCH}`,
      ).catch((error) => {
        if (error instanceof GitHubError && error.status === 404) return undefined;
        throw error;
      });
      if (id !== loadId) return;
      published = file ? parseNote(decodeBase64Utf8(file.content)) : "";
      publishedSha = file?.sha;
      if (!!file !== notedPlants.has(plant.id)) markNoted(plant.id, !!file);
    } catch (error) {
      if (id !== loadId || (error instanceof GitHubError && error.status === 401)) return;
      setMessage(error instanceof Error ? error.message : "Couldn't load this note.", "error");
    }
    if (id !== loadId) return;

    const draft = readDraft(plant.id);
    if (draft && normalizeNote(draft.text) !== published) {
      draftText = normalizeNote(draft.text);
      setDraftBanner(draft);
      textArea.value = draftText;
    } else {
      if (draft) localStorage.removeItem(draftKey(plant.id));
      textArea.value = published;
    }
    loading = false;
    textArea.placeholder =
      "What have you noticed? When it woke up, how it handled the heat, where it's happiest…";
    renderStatus();
  }

  function showPicker() {
    current = undefined;
    loadId++;
    document.title = "Garden notes · ShyMoose Garden";
    show("picker");
    renderList();
  }

  function renderRoute() {
    const plant = plantsById.get(new URL(location.href).searchParams.get("plant") ?? "");
    if (plant) void openPlant(plant);
    else showPicker();
  }

  async function navigate(url: string) {
    if (!(await confirmLeave())) return;
    history.pushState(null, "", url);
    renderRoute();
    window.scrollTo({ top: 0 });
  }

  let routedUrl = location.href;
  window.addEventListener("popstate", async () => {
    const target = location.href;
    if (!hasUnsavedChanges()) {
      routedUrl = target;
      renderRoute();
      return;
    }
    history.pushState(null, "", routedUrl);
    if (await confirmLeave()) {
      history.pushState(null, "", target);
      routedUrl = target;
      renderRoute();
    }
  });
  const route = () => {
    routedUrl = location.href;
    renderRoute();
  };

  // --- Auth ----------------------------------------------------------------

  async function start() {
    if (!token) {
      show("signed-out");
      return;
    }
    show("loading");
    try {
      const [user, repo] = await Promise.all([github("/user"), github(`/repos/${NOTES_REPO}`)]);
      app.querySelectorAll('[data-bind="login"]').forEach((el) => (el.textContent = `@${user.login}`));
      if (!repo.permissions?.push) {
        show("forbidden");
        return;
      }
      route();
      void refreshNotedPlants();
    } catch (error) {
      if (error instanceof GitHubError && error.status === 401) return;
      show("signed-out");
      setGlobalMessage(error instanceof Error ? error.message : "Couldn't reach GitHub.");
    }
  }

  async function refreshNotedPlants() {
    try {
      const files: { name: string }[] = await github(`/repos/${NOTES_REPO}/contents/${NOTES_DIR}?ref=${NOTES_BRANCH}`);
      const live = new Set(files.filter((f) => f.name.endsWith(".md")).map((f) => f.name.slice(0, -3)));
      for (const plant of plants) {
        const row = app.querySelector<HTMLElement>(`[data-plant-row="${CSS.escape(plant.id)}"]`);
        row?.toggleAttribute("data-noted", live.has(plant.id));
      }
      notedPlants = live;
      renderList();
    } catch {
      // The build-time list is a fine fallback.
    }
  }

  function signIn() {
    setGlobalMessage("");
    const authOrigin = new URL(authUrl).origin;
    const popup = window.open(`${authUrl}/auth?provider=github`, "garden-notes-auth", "popup,width=620,height=760");
    if (!popup) {
      setGlobalMessage("Your browser blocked the sign-in window. Allow pop-ups for this site and try again.");
      return;
    }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== authOrigin || typeof event.data !== "string") return;
      if (event.data === "authorizing:github") {
        (event.source as Window | null)?.postMessage(event.data, event.origin);
        return;
      }
      const match = /^authorization:github:(success|error):([\s\S]*)$/.exec(event.data);
      if (!match) return;
      window.removeEventListener("message", onMessage);
      const payload = JSON.parse(match[2]);
      if (match[1] === "success" && payload.token) {
        token = payload.token;
        localStorage.setItem(TOKEN_KEY, token);
        void start();
      } else {
        setGlobalMessage(`Sign-in failed: ${payload.error ?? "unknown error"}.`);
      }
    };
    window.addEventListener("message", onMessage);
  }

  async function signOut(message = "") {
    if (message === "" && !(await confirmLeave())) return;
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    current = undefined;
    show("signed-out");
    setGlobalMessage(message);
  }

  // --- Events --------------------------------------------------------------

  app.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>("a[data-plant-link], a[data-action='all-plants']");
    if (link && !(event as MouseEvent).metaKey && !(event as MouseEvent).ctrlKey) {
      event.preventDefault();
      void navigate(link.href);
      return;
    }
    const plantLink = target.closest<HTMLAnchorElement>('[data-bind="plant-link"], [data-bind="message"] a');
    if (plantLink && hasUnsavedChanges()) {
      event.preventDefault();
      if (await confirmLeave()) location.href = plantLink.href;
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    const chip = target.closest<HTMLElement>("[data-filter]");
    if (chip) {
      filter = chip.dataset.filter as typeof filter;
      renderList();
    } else if (action === "sign-in") signIn();
    else if (action === "sign-out") void signOut();
    else if (action === "publish") void publish();
    else if (action === "save-draft") saveDraft();
    else if (action === "discard-draft") {
      clearDraft();
      textArea.value = published;
      setMessage("");
      renderStatus();
    } else if (action === "reload-note" && current) void openPlant(current);
  });

  textArea.addEventListener("input", renderStatus);
  $("search").addEventListener("input", renderList);
  textArea.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void publish();
    }
  });

  void start();
}
