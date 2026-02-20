/**
 * Download MediaPipe PoseLandmarker model to assets/models/
 *
 * Usage: npm run download-models
 */

import { existsSync, mkdirSync, createWriteStream, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import https from 'https';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';
const MODEL_DIR = join(__dirname, '..', 'assets', 'models');
const MODEL_FILE = 'pose_landmarker_full.task';
const MODEL_PATH = join(MODEL_DIR, MODEL_FILE);

const MIN_EXPECTED_SIZE = 5_000_000; // 5MB

function followRedirects(url: string, maxRedirects = 5): Promise<import('http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without Location header'));
          return;
        }
        response.resume();
        followRedirects(redirectUrl, maxRedirects - 1).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      resolve(response);
    }).on('error', reject);
  });
}

async function downloadModel(): Promise<void> {
  if (existsSync(MODEL_PATH)) {
    const stat = statSync(MODEL_PATH);
    if (stat.size > MIN_EXPECTED_SIZE) {
      console.log(`Model already exists: ${MODEL_PATH} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    console.log(`Model file incomplete (${stat.size} bytes), re-downloading...`);
    unlinkSync(MODEL_PATH);
  }

  if (!existsSync(MODEL_DIR)) {
    mkdirSync(MODEL_DIR, { recursive: true });
  }

  console.log('Downloading MediaPipe PoseLandmarker model...');
  console.log(`  URL: ${MODEL_URL}`);
  console.log(`  Target: ${MODEL_PATH}`);

  const response = await followRedirects(MODEL_URL);
  const totalSize = parseInt(response.headers['content-length'] || '0', 10);

  return new Promise((resolve, reject) => {
    const file = createWriteStream(MODEL_PATH);
    let downloaded = 0;
    let lastProgress = 0;

    response.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (totalSize > 0) {
        const progress = Math.floor((downloaded / totalSize) * 100);
        if (progress >= lastProgress + 10) {
          console.log(`  Progress: ${progress}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          lastProgress = progress;
        }
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      file.close();
      const stat = statSync(MODEL_PATH);
      console.log(`Download complete: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

      if (stat.size < MIN_EXPECTED_SIZE) {
        unlinkSync(MODEL_PATH);
        reject(new Error(`File too small (${stat.size} bytes), download may be incomplete`));
        return;
      }

      resolve();
    });

    file.on('error', (err) => {
      file.close();
      if (existsSync(MODEL_PATH)) {
        unlinkSync(MODEL_PATH);
      }
      reject(err);
    });
  });
}

downloadModel().catch((err) => {
  console.error(`\nModel download failed: ${err.message}`);
  console.error('Check your network connection and retry: npm run download-models');
  process.exit(1);
});
