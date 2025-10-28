// downloader.js
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

async function fetchAndSave(url, folder, idx) {
  try {
    // Use global fetch (Node >=18) or fallback to require('node-fetch') if needed.
    if (typeof fetch !== 'function') {
      throw new Error('fetch is not available in this Node runtime. Use Node >=18 or add node-fetch.');
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    // derive filename
    let filename = null;
    const cd = resp.headers.get('content-disposition');
    if (cd) {
      const m = /filename\\*=UTF-8''([^;\\n]+)|filename="?([^";\\n]+)"?/.exec(cd);
      if (m) filename = decodeURIComponent(m[1] || m[2]);
    }
    if (!filename) {
      try {
        const u = new URL(url);
        filename = path.basename(u.pathname) || `file-${Date.now()}-${idx}`;
      } catch (e) {
        filename = `file-${Date.now()}-${idx}`;
      }
    }
    // ensure unique
    const filepath = path.join(folder, filename);
    const fileStream = fs.createWriteStream(filepath);
    await streamPipeline(resp.body, fileStream);
    const stats = fs.statSync(filepath);
    return { url, ok: true, path: filepath, size: stats.size };
  } catch (e) {
    return { url, ok: false, error: String(e) };
  }
}

async function downloadUrlsToFolder(urls, folder) {
  if (!Array.isArray(urls)) throw new Error('urls must be array');
  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const u = urls[i];
    const res = await fetchAndSave(u, folder, i);
    results.push(res);
  }
  return results;
}

module.exports = { downloadUrlsToFolder };
