export type QRDecoder = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: { inversionAttempts: "dontInvert" },
) => { data: string } | null;

interface ScannerDependencies {
  loadDecoder: () => Promise<QRDecoder>;
  getStream?: () => Promise<MediaStream>;
  attachStream: (stream: MediaStream) => void;
  detachStream: () => void;
  play: () => Promise<void>;
  readCode: (decoder: QRDecoder) => string | null;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  show: () => void;
  hide: (restoreFocus: boolean) => void;
  setStatus: (message: string) => void;
  navigate: (url: string) => void;
}

export function qrDestination(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function scanDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(1, 960 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function cameraError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  return name === "NotAllowedError" || name === "SecurityError"
    ? "Camera blocked. Allow camera access in your browser settings, then try again."
    : name === "NotFoundError" || name === "OverconstrainedError"
      ? "No camera found on this device."
      : name === "NotReadableError"
        ? "Camera is in use by another app."
        : "Couldn't start the camera.";
}

export function createQRScanner(deps: ScannerDependencies) {
  let generation = 0;
  let active = false;
  let disposed = false;
  let stream: MediaStream | null = null;
  let frame: number | null = null;

  function releaseCamera() {
    if (frame !== null) deps.cancelFrame(frame);
    frame = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    deps.detachStream();
  }

  function close(restoreFocus = true) {
    generation++;
    releaseCamera();
    if (!active) return;
    active = false;
    deps.hide(restoreFocus);
  }

  async function open() {
    if (active || disposed) return;
    active = true;
    const session = ++generation;
    const isCurrent = () => active && generation === session && !disposed;
    deps.show();
    deps.setStatus("Loading QR scanner…");

    if (!deps.getStream) {
      deps.setStatus("Camera needs a secure (https) connection.");
      return;
    }

    let decoder: QRDecoder;
    try {
      decoder = await deps.loadDecoder();
    } catch {
      if (isCurrent()) deps.setStatus("Couldn't load the QR scanner. Close and try again.");
      return;
    }
    if (!isCurrent()) return;

    try {
      deps.setStatus("Starting camera…");
      const acquired = await deps.getStream();
      // Permission prompts cannot be cancelled; release their eventual result.
      if (!isCurrent()) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      deps.attachStream(acquired);
      await deps.play();
      if (!isCurrent()) return;
      deps.setStatus("Point at a plant QR code");
    } catch (error) {
      // An earlier play() rejection must never stop a newly opened camera.
      if (isCurrent()) {
        releaseCamera();
        deps.setStatus(cameraError(error));
      }
      return;
    }

    let lastDecode = -Infinity;
    function tick(time: number) {
      if (!isCurrent()) return;
      frame = null;
      if (time - lastDecode >= 150) {
        lastDecode = time;
        try {
          const value = deps.readCode(decoder);
          if (value !== null) {
            const destination = qrDestination(value);
            if (destination) {
              close();
              deps.navigate(destination);
              return;
            }
            deps.setStatus("This QR code isn't a web link. Try a plant QR code.");
          }
        } catch {
          releaseCamera();
          deps.setStatus("Couldn't read the camera. Close and try again.");
          return;
        }
      }
      frame = deps.requestFrame(tick);
    }
    frame = deps.requestFrame(tick);
  }

  return {
    open,
    close,
    dispose() {
      disposed = true;
      close(false);
    },
  };
}
