// blob-worker.js
const MAX_CONCURRENT = 2;
let queue = [];
let active = 0;

async function processTask(task) {
  active++;
  const { url } = task;
  try {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const reader = resp.body.getReader();
    const filename = (url.split('/').pop().split('?')[0] || `video_${Date.now()}`).replace(/[^\w.-]/g, '_') + '.mp4';
    postMessage({ type: 'start', url, filename });

    // 通知主进程开始保存
    const idResp = await postToMain('start', { filename });
    if (!idResp.ok) throw new Error('无法创建文件流');

    const id = idResp.id;
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      await postToMain('chunk', { id, chunk: Array.from(value) });
    }

    const endRes = await postToMain('end', { id });
    if (endRes.ok) {
      postMessage({ type: 'done', url, filename, filePath: endRes.filePath, count: endRes.count });
    } else {
      postMessage({ type: 'error', url, error: endRes.error });
    }
  } catch (err) {
    postMessage({ type: 'error', url, error: err.message });
  } finally {
    active--;
    nextTask();
  }
}

function nextTask() {
  if (active >= MAX_CONCURRENT) return;
  const task = queue.shift();
  if (task) processTask(task);
}

self.onmessage = (e) => {
  const { type, url } = e.data;
  if (type === 'download') {
    queue.push({ url });
    nextTask();
  }
};

// 用于和 renderer 通信
async function postToMain(type, payload) {
  return new Promise((resolve) => {
    const msgId = 'm' + Math.random().toString(36).slice(2);
    const listener = (ev) => {
      if (ev.data.msgId === msgId) {
        self.removeEventListener('message', listener);
        resolve(ev.data.resp);
      }
    };
    self.addEventListener('message', listener);
    postMessage({ type: 'ipc', msgId, payloadType: type, payload });
  });
}
