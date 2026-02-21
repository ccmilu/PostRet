/**
 * MediaPipe model loader for renderer process.
 *
 * Dev: Vite dev server serves assets/models/ at /models/
 * Prod: Models bundled via extraResources, resolved through IPC
 */

const MODEL_FILENAME = 'pose_landmarker_full.task';

export function getModelPath(): string {
  if (import.meta.env.DEV) {
    return `/models/${MODEL_FILENAME}`;
  }
  return `models/${MODEL_FILENAME}`;
}

export function getWasmPath(): string {
  if (import.meta.env.DEV) {
    // Dev: served by Vite middleware from node_modules/@mediapipe/tasks-vision/wasm/
    return '/wasm';
  }
  // Production: bundled WASM files
  return 'wasm';
}

export async function checkModelExists(): Promise<boolean> {
  try {
    const modelPath = getModelPath();
    const response = await fetch(modelPath, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
