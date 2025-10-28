// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

let loginWindow, panelWindow;
let saveDir = path.join(app.getPath('downloads'), 'XPathVideos');
let savedCount = 0;

function ensureSaveDir() {
  if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
}

app.whenReady().then(() => {
  ensureSaveDir();

  // 登录页面
  loginWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  loginWindow.loadURL('https://example.com'); // ← 你的视频网页
  loginWindow.webContents.openDevTools();

  // 控制面板
  panelWindow = new BrowserWindow({
    width: 900,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  panelWindow.loadFile('renderer.html');
  panelWindow.webContents.openDevTools();
});

// 选择保存目录
ipcMain.handle('choose-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) return { ok: false };
  saveDir = filePaths[0];
  ensureSaveDir();
  return { ok: true, folder: saveDir };
});

// 主进程：开始写入流
ipcMain.handle('start-save', async (event, { filename }) => {
  try {
    if (!filename.toLowerCase().endsWith('.mp4')) filename += '.mp4';
    const filePath = path.join(saveDir, filename);
    const stream = fs.createWriteStream(filePath);
    const id = Date.now() + '_' + Math.random().toString(36).slice(2);
    activeStreams[id] = { stream, filePath };
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 主进程：追加写入 Buffer 块
ipcMain.handle('write-chunk', async (event, { id, chunk }) => {
  try {
    const info = activeStreams[id];
    if (!info) return { ok: false, error: '无效的文件流 ID' };
    info.stream.write(Buffer.from(chunk));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 主进程：关闭流
ipcMain.handle('end-save', async (event, { id }) => {
  try {
    const info = activeStreams[id];
    if (!info) return { ok: false, error: '无效的文件流 ID' };
    info.stream.end();
    savedCount++;
    const { filePath } = info;
    delete activeStreams[id];
    return { ok: true, filePath, count: savedCount };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 存储活跃流
const activeStreams = {};

// 提取 XPath (支持 iframe)
ipcMain.handle('evaluate-xpath', async (event, { xpath }) => {
  if (!loginWindow) return { ok: false, error: '未打开网页窗口' };
  try {
    const urls = await loginWindow.webContents.executeJavaScript(`
      (async () => {
        const xp = ${JSON.stringify(xpath)};
        const results = new Set();
        function collect(doc) {
          const snapshot = doc.evaluate(xp, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let i=0;i<snapshot.snapshotLength;i++){
            const node = snapshot.snapshotItem(i);
            if (!node) continue;
            if (node.src) results.add(node.src);
            const sources = node.querySelectorAll?.('source') || [];
            for (const s of sources) if (s.src) results.add(s.src);
          }
        }
        collect(document);
        for (const f of document.querySelectorAll('iframe')){
          try{ if (f.contentDocument) collect(f.contentDocument); }catch{}
        }
        return [...results];
      })();
    `);
    return { ok: true, nodes: urls };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
