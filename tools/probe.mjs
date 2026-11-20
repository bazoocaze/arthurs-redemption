#!/usr/bin/env node
// Probe headless via CDP: abre a página, coleta erros/console, avalia uma
// expressão JS e opcionalmente salva screenshot. Sem dependências (Node 22+).
//
// Uso:
//   node tools/probe.mjs --url=http://localhost:8777/?seed=1&debug=1 \
//     --wait=1200 --eval="window.__game.camera.zoom" --shot=/tmp/x.png

import { spawn } from 'node:child_process';
import { readdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const opts = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) opts[m[1]] = m[2];
}
const url = opts.url ?? 'http://localhost:8777/';
const waitMs = Number(opts.wait ?? 1200);
const width = Number(opts.width ?? 1280);
const height = Number(opts.height ?? 800);

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(base)) {
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = join(base, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return '/usr/bin/google-chrome';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(120);
  }
  throw new Error('devtools não respondeu');
}

const port = 9300 + Math.floor(Math.random() * 600);
const profile = join(tmpdir(), `probe-${port}`);
const exe = findChrome();
const chrome = spawn(
  exe,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-lcd-text',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore'] },
);

const cleanup = () => {
  try {
    chrome.kill('SIGKILL');
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
};

try {
  await waitForDevtools(port);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('nenhum target de página');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  let nextId = 1;
  const pending = new Map();
  const logs = [];
  const errors = [];

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception?.description ?? d.text);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args
        .map((a) => a.value ?? a.description ?? a.preview?.description ?? a.type)
        .join(' ');
      logs.push(`[${msg.params.type}] ${text}`);
      if (msg.params.type === 'error') errors.push(text);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      logs.push(`[log:${e.level}] ${e.text} ${e.url ?? ''}`);
      if (e.level === 'error') errors.push(`${e.text} ${e.url ?? ''}`);
    }
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url });
  await sleep(waitMs);

  let result;
  if (opts.eval) {
    const r = await send('Runtime.evaluate', {
      expression: opts.eval,
      returnByValue: true,
      awaitPromise: true,
    });
    result = r.exceptionDetails
      ? { __evalError: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text }
      : r.result?.value;
    if (result === undefined) {
      // CDP recusa avaliacoes grandes ou com referencia circular sem avisar
      result = { __noValue: r.error ?? r.result ?? null };
    }
  }

  if (opts.shot) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(opts.shot, Buffer.from(shot.data, 'base64'));
  }

  // Nao usar process.exit() aqui: ele corta o stdout escrito em pipe.
  // O callback do write garante que o JSON saiu inteiro antes de sair.
  const code = errors.length ? 1 : 0;
  process.stdout.write(JSON.stringify({ url, errors, logs, result }, null, 2) + '\n', () => {
    ws.close();
    cleanup();
    process.exit(code);
  });
} catch (e) {
  console.error('probe falhou:', e.message);
  cleanup();
  process.exit(2);
}
