interface MapLifecycleOptions<T> {
  getContainer(): HTMLElement | null;
  isEnabled(): boolean;
  setVisibility(enabled: boolean): void;
  load(): Promise<T>;
  initialize(container: HTMLElement, dependencies: T, signal: AbortSignal): void;
  onError(error: unknown): void;
}

/** Astro keeps module scripts alive between page swaps; each map gets its own lifetime. */
export function createMapLifecycle<T>(options: MapLifecycleOptions<T>) {
  let current: { container: HTMLElement; controller: AbortController } | null = null;

  function destroy() {
    const previous = current;
    current = null;
    previous?.controller.abort();
  }

  async function start() {
    const container = options.getContainer();
    const enabled = options.isEnabled();
    options.setVisibility(enabled);
    if (!container || !enabled) {
      destroy();
      return;
    }
    if (current?.container === container) return;
    destroy();
    const instance = { container, controller: new AbortController() };
    current = instance;
    try {
      const dependencies = await options.load();
      if (current !== instance || instance.controller.signal.aborted) return;
      options.initialize(container, dependencies, instance.controller.signal);
    } catch (error) {
      if (current !== instance) return;
      destroy();
      options.onError(error);
    }
  }

  return { start, destroy };
}
