#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { platform } = process;

const apiBase = process.env.SNIP_API || 'http://localhost:3000';

function printUsage() {
  console.log(`Usage:\n  snip add <url>\n  snip ls\n  snip open <code>\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function request(path, options = {}) {
  const url = `${apiBase}${path}`;
  const response = await fetch(url, options);
  if (!response.ok) {
    const data = await response.text();
    throw new Error(data || `Request failed with status ${response.status}`);
  }
  return response;
}

async function add(url) {
  if (!isHttpUrl(url)) {
    fail('Invalid URL. Expected an http(s) URL.');
  }
  try {
    const response = await request('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json();
    console.log(payload.shortUrl);
  } catch (error) {
    fail(`Failed to add link: ${error.message}`);
  }
}

async function listLinks() {
  try {
    const response = await request('/api/links');
    const links = await response.json();
    if (!Array.isArray(links) || links.length === 0) {
      console.log('No links yet.');
      return;
    }
    const rows = links.map((link) => ({ code: link.code, hits: String(link.hits), url: link.url }));
    const codeWidth = Math.max(...rows.map((row) => row.code.length), 'code'.length);
    const hitsWidth = Math.max(...rows.map((row) => row.hits.length), 'hits'.length);
    console.log(`${'code'.padEnd(codeWidth)}  ${'hits'.padEnd(hitsWidth)}  url`);
    console.log(`${'-'.repeat(codeWidth)}  ${'-'.repeat(hitsWidth)}  ${'-'.repeat(20)}`);
    rows.forEach((row) => {
      console.log(`${row.code.padEnd(codeWidth)}  ${row.hits.padEnd(hitsWidth)}  ${row.url}`);
    });
  } catch (error) {
    fail(`Failed to list links: ${error.message}`);
  }
}

async function openCode(code) {
  if (!code) {
    fail('Missing code.');
  }
  try {
    const response = await fetch(`${apiBase}/${code}`, { redirect: 'manual' });
    if (response.status === 404) {
      fail(`Unknown code: ${code}`);
    }
    const location = response.headers.get('location');
    if (!location) {
      fail('No redirect location received.');
    }
    const openCommand = platform === 'win32'
      ? ['cmd', '/c', 'start', '', location]
      : platform === 'darwin'
        ? ['open', location]
        : ['xdg-open', location];
    const result = spawnSync(openCommand[0], openCommand.slice(1), { stdio: 'inherit', shell: false });
    if (result.status !== 0) {
      fail(`Unable to open browser for ${location}`);
    }
  } catch (error) {
    fail(`Failed to open link: ${error.message}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }
  if (command === 'add') {
    const [url] = args;
    if (!url) {
      fail('Missing URL.');
    }
    await add(url);
    return;
  }
  if (command === 'ls') {
    if (args.length > 0) {
      fail('Usage: snip ls');
    }
    await listLinks();
    return;
  }
  if (command === 'open') {
    const [code] = args;
    await openCode(code);
    return;
  }
  fail(`Unknown command: ${command}`);
}

main().catch((error) => fail(error.message));
