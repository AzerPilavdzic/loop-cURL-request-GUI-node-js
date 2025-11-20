import { exec } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync, appendFileSync } from 'fs';

let currentInterval = null;

const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'curl_I_provided.log');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// ---- small helper: extract JSON from curl output ----
function extractJson(text) {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text.trim();
}

function notify(title, body) {
  const preview = body.length > 300 ? body.slice(0, 300) + '...' : body;
  exec(`notify-send "${title}" '${preview.replace(/'/g, `'\\''`)}'`, (err) => {
    if (err) {
      console.error('notify-send error:', err.message);
    }
  });
}

function appendLog(text) {
  const ts = new Date().toISOString().replace('T', ' ').split('.')[0];
  appendFileSync(LOG_FILE, `${ts} - ${text}\n`, 'utf-8');
}

function runCurlOnce(curlCmd, callback) {
  // force silent mode (-s) to hide progress bar
  let cmd = curlCmd
    .replace(/ -s /g, ' ')
    .replace(/ -s$/g, '')
    .replace(/^-s /g, '')
    .replace(/-s/g, '');
  cmd = cmd + ' -s';

  exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
    let output = stdout || stderr || '';
    output = output.trim();
    if (error && !output) {
      output = `curl failed with code ${error.code}`;
    }
    const jsonOnly = extractJson(output);
    callback(jsonOnly);
  });
}

export function startLoop(curl, minutes) {
  if (!curl || !minutes || minutes <= 0) {
    return { ok: false, error: 'Invalid curl or minutes.' };
  }

  // if you really want *minutes*, use: minutes * 60 * 1000
  const intervalMs = minutes * 60 * 1000;

  // Clear old loop if exists
  if (currentInterval) {
    clearInterval(currentInterval);
    currentInterval = null;
  }

  // Run once immediately
  runCurlOnce(curl, (jsonOnly) => {
    appendLog(jsonOnly);
    notify('First cURL Response', jsonOnly);
  });

  // Set interval loop
  currentInterval = setInterval(() => {
    runCurlOnce(curl, (jsonOnly) => {
      appendLog(jsonOnly);
      notify('API Response', jsonOnly);
    });
  }, intervalMs);

  return { ok: true, intervalMs };
}

export function stopLoop() {
  if (currentInterval) {
    clearInterval(currentInterval);
    currentInterval = null;
    return { ok: true };
  }
  return { ok: false };
}
