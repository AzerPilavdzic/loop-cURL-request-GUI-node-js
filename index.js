#!/usr/bin/env node
import express, { urlencoded, json } from 'express';
import open from 'open';
import { startLoop, stopLoop } from './loopService.js';

const app = express();
const PORT = 3000;

app.use(urlencoded({ extended: true }));
app.use(json());

// ---- HTML GUI ----
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>cURL Loop Launcher (Node)</title>
  <style>
    body { font-family: sans-serif; margin: 20px; background-color: #000000ff; color:white; }
    textarea { width: 100%; height: 150px; background-color: #000000ff; color:white; }
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

  const result = startLoop(curl, minutes);

  if (!result.ok) {
    return res.json({ success: false, message: result.error });
  }

  return res.json({
    success: true,
    message: `Loop started every ${minutes} minute(s).`
  });
});

// ---- Stop loop endpoint ----
app.post('/stop', (req, res) => {
  const result = stopLoop();

  if (result.ok) {
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
  stopLoop();
  process.exit(0);
});
