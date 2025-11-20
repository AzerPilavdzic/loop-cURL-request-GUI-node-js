#!/usr/bin/env node
import express, { urlencoded, json } from 'express';
import { exec, execSync } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import open from 'open';
import { fileURLToPath } from "url";
import path from "path";

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


let currentInterval = null;
const LOG_DIR = join(__dirname, 'logs');
const LOG_FILE = join(LOG_DIR, 'curl_I_provided.log');

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

app.use(urlencoded({ extended: true }));
app.use(json());

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

// ---- HTML GUI ----
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>cURL Loop Launcher (Node)</title>
  <style>
    body { font-family: sans-serif; margin: 20px; background-color:black; color:white; }
    textarea { width: 100%; height: 150px; background-color:black; color:white; }
    input[type="number"] { width: 80px; }
    button { padding: 6px 12px; margin-right: 8px; }
  </style>
</head>
<body>
  <h1>cURL Loop Launcher (Node)</h1>
  <form id="form">
    <label>cURL command:</label><br/>
    <textarea style="width:500px !important; height:500px !important;" name="curl" id="curl" required></textarea><br/><br/>

    <label>Interval (minutes):</label>
    <input type="number" name="minutes" id="minutes" value="1" min="1" required /><br/><br/>

    <button type="button" onclick="startLoop()">Start Loop</button>
    <button type="button" onclick="stopLoop()">Stop Loop</button>
  </form>

  <p id="status"></p>

  <script>
    async function startLoop() {
      const curl = document.getElementById('curl').value;
      const minutes = document.getElementById('minutes').value;
      const res = await fetch('/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curl, minutes: parseInt(minutes, 10) })
      });
      const data = await res.json();
      document.getElementById('status').innerText = data.message || JSON.stringify(data);
    }

    async function stopLoop() {
      const res = await fetch('/stop', { method: 'POST' });
      const data = await res.json();
      document.getElementById('status').innerText = data.message || JSON.stringify(data);
    }
  </script>
</body>
</html>
  `);
});

// ---- Start loop endpoint ----
app.post('/start', (req, res) => {
  const { curl, minutes } = req.body;
  if (!curl || !minutes || minutes <= 0) {
    return res.json({ success: false, message: 'Invalid curl or minutes.' });
  }

  const intervalMs = minutes * 1 * 1000;

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

  return res.json({ success: true, message: `Loop started every ${minutes} minute(s).` });
});

// ---- Stop loop endpoint ----
app.post('/stop', (req, res) => {
  if (currentInterval) {
    clearInterval(currentInterval);
    currentInterval = null;
    return res.json({ success: true, message: 'Loop stopped.' });
  }
  return res.json({ success: false, message: 'No loop running.' });
});

// ---- Start server ----
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  open(`http://localhost:${PORT}`).catch(() => {});
});

// Clean up when you Ctrl+C
process.on('SIGINT', () => {
  if (currentInterval) clearInterval(currentInterval);
  process.exit(0);
});
