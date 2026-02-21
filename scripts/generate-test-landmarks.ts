/**
 * Generate MediaPipe landmarks from test photos.
 *
 * Uses Playwright to run MediaPipe PoseLandmarker in a real browser environment,
 * since @mediapipe/tasks-vision requires WebGL/Canvas (not available in Node.js).
 *
 * Usage: npm run generate-landmarks
 *
 * Prerequisites:
 *   - npm run download-models (model in assets/models/)
 *   - npx playwright install chromium
 */

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename, resolve } from 'path';
import http from 'http';

const PROJECT_ROOT = resolve(__dirname, '..');
const PHOTOS_DIR = join(PROJECT_ROOT, 'test', 'fixtures', 'photos');
const MODEL_PATH = join(PROJECT_ROOT, 'assets', 'models', 'pose_landmarker_full.task');
const WASM_DIR = join(PROJECT_ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const VISION_BUNDLE = join(PROJECT_ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'vision_bundle.mjs');
const HTML_PATH = join(__dirname, 'mediapipe-extract.html');

interface LandmarkResult {
  readonly photoId: number;
  readonly filename: string;
  readonly landmarks: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly visibility: number;
  }>;
  readonly worldLandmarks: ReadonlyArray<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly visibility: number;
  }>;
  readonly frameWidth: number;
  readonly frameHeight: number;
}

interface DetectionResult {
  readonly success: boolean;
  readonly error?: string;
  readonly landmarks?: LandmarkResult['landmarks'];
  readonly worldLandmarks?: LandmarkResult['worldLandmarks'];
  readonly frameWidth: number;
  readonly frameHeight: number;
}

function findPhotos(): Array<{ photoPath: string; photoId: number; filename: string }> {
  const photos: Array<{ photoPath: string; photoId: number; filename: string }> = [];
  const subdirs = readdirSync(PHOTOS_DIR).filter((d) => {
    const fullPath = join(PHOTOS_DIR, d);
    return statSync(fullPath).isDirectory();
  });

  for (const subdir of subdirs) {
    const dirPath = join(PHOTOS_DIR, subdir);
    const files = readdirSync(dirPath).filter((f) => f.endsWith('.jpeg'));
    for (const file of files) {
      const photoId = parseInt(basename(file, '.jpeg'), 10);
      if (isNaN(photoId)) continue;
      photos.push({
        photoPath: join(dirPath, file),
        photoId,
        filename: file,
      });
    }
  }

  return photos.sort((a, b) => a.photoId - b.photoId);
}

async function startServer(): Promise<{ server: http.Server; port: number }> {
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.wasm': 'application/wasm',
    '.task': 'application/octet-stream',
    '.map': 'application/json',
  };

  const server = http.createServer((req, res) => {
    const url = req.url || '/';

    if (url === '/') {
      const html = readFileSync(HTML_PATH, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (url === '/wasm-bundle/vision_bundle.mjs') {
      const content = readFileSync(VISION_BUNDLE);
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(content);
      return;
    }

    if (url.startsWith('/wasm/')) {
      const filename = url.slice('/wasm/'.length);
      const filePath = join(WASM_DIR, filename);
      if (existsSync(filePath)) {
        const ext = '.' + filename.split('.').pop();
        const content = readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        });
        res.end(content);
        return;
      }
    }

    if (url === '/model/pose_landmarker_full.task') {
      const content = readFileSync(MODEL_PATH);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(content);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, port });
    });
  });
}

async function main(): Promise<void> {
  // Validate prerequisites
  if (!existsSync(MODEL_PATH)) {
    console.error('Model not found. Run: npm run download-models');
    process.exit(1);
  }

  if (!existsSync(WASM_DIR)) {
    console.error('WASM files not found. Run: npm install');
    process.exit(1);
  }

  const photos = findPhotos();
  if (photos.length === 0) {
    console.error('No photos found in', PHOTOS_DIR);
    process.exit(1);
  }

  console.log(`Found ${photos.length} photos to process`);

  // Start local server to serve HTML, WASM, and model files
  const { server, port } = await startServer();
  console.log(`Local server started on port ${port}`);

  let browser;
  try {
    browser = await chromium.launch({
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
      ],
    });
    const page = await browser.newPage();

    // Navigate and wait for page load
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => (window as any).__mediapipe !== undefined, {
      timeout: 10000,
    });

    // Initialize MediaPipe
    console.log('Initializing MediaPipe PoseLandmarker...');
    const initResult = await page.evaluate(async () => {
      return await (window as any).__mediapipe.init(
        '/model/pose_landmarker_full.task',
        '/wasm'
      );
    });

    if (!initResult) {
      throw new Error('Failed to initialize MediaPipe');
    }
    console.log('MediaPipe initialized successfully');

    // Process each photo
    let successCount = 0;
    let failCount = 0;
    const failures: Array<{ photoId: number; error: string }> = [];

    for (const photo of photos) {
      const { photoPath, photoId, filename } = photo;

      // Read photo as base64 data URL
      const imageBuffer = readFileSync(photoPath);
      const base64 = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      // Run detection in browser
      const result: DetectionResult = await page.evaluate(
        async (dataUrl: string) => {
          return await (window as any).__mediapipe.detectFromDataUrl(dataUrl);
        },
        dataUrl
      );

      if (result.success && result.landmarks && result.worldLandmarks) {
        const output: LandmarkResult = {
          photoId,
          filename,
          landmarks: result.landmarks,
          worldLandmarks: result.worldLandmarks,
          frameWidth: result.frameWidth,
          frameHeight: result.frameHeight,
        };

        const outputPath = photoPath.replace('.jpeg', '.landmarks.json');
        writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
        successCount++;
        console.log(
          `  [${successCount + failCount}/${photos.length}] ${filename}: ${result.landmarks.length} landmarks (${result.frameWidth}x${result.frameHeight})`
        );
      } else {
        failCount++;
        const error = result.error || 'Unknown error';
        failures.push({ photoId, error });
        console.warn(
          `  [${successCount + failCount}/${photos.length}] ${filename}: FAILED - ${error}`
        );
      }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Total: ${photos.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);

    if (failures.length > 0) {
      console.log('\nFailed photos:');
      for (const f of failures) {
        console.log(`  Photo ${f.photoId}: ${f.error}`);
      }
    }

    if (failCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
