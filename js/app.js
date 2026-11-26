import { StorageEngine } from './storage.js';
import { ImageEngine } from './image-engine.js';
import { AssetEngine, KNOWN_SUFFIXES } from './assets.js';
import { BackupEngine } from './backup.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let pendingWorker = null;
const updateBanner = document.getElementById('updateBanner');
const applyUpdateBtn = document.getElementById('applyUpdateBtn');
const dismissUpdateBtn = document.getElementById('dismissUpdateBtn');

if (applyUpdateBtn) {
  applyUpdateBtn.addEventListener('click', () => {
    if (pendingWorker) {
      localStorage.removeItem('alzaeem_update_deferred');
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  });
}

if (dismissUpdateBtn && updateBanner) {
  dismissUpdateBtn.addEventListener('click', () => {
    localStorage.setItem('alzaeem_update_deferred', 'true');
    updateBanner.style.display = 'none';
  });
}

const CURRENT_APP_VERSION = '1.4.8';

async function checkRemoteVersionUpdate() {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.version && data.version !== CURRENT_APP_VERSION) {
      localStorage.setItem('alzaeem_update_deferred', 'true');
      if (updateBanner) updateBanner.style.display = 'flex';
    }
  } catch (e) {}
}

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const promptUpdate = (worker) => {
      if (worker) pendingWorker = worker;
      localStorage.setItem('alzaeem_update_deferred', 'true');
      if (updateBanner) updateBanner.style.display = 'flex';
    };

    if (reg.waiting) {
      promptUpdate(reg.waiting);
    }

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          promptUpdate(newWorker);
        }
      });
    });

    reg.update().catch(() => {});
    checkRemoteVersionUpdate();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
        if (reg.waiting) promptUpdate(reg.waiting);
        checkRemoteVersionUpdate();
      }
    });
  }).catch(() => {});
}

if (applyUpdateBtn) {
  applyUpdateBtn.addEventListener('click', () => {
    localStorage.removeItem('alzaeem_update_deferred');
    applyUpdateBtn.disabled = true;
    applyUpdateBtn.textContent = 'جاري تطبيق التحديث...';
    if (pendingWorker) {
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      window.location.reload(true);
    }
  });
}

if (dismissUpdateBtn && updateBanner) {
  dismissUpdateBtn.addEventListener('click', () => {
    localStorage.setItem('alzaeem_update_deferred', 'true');
    updateBanner.style.display = 'none';
  });
}

// تشغيل تهيئة التخزين المحلي وفتح عدسة الكاميرا فور جاهزية الصفحة
(async function bootApp() {
  try {
    if (typeof initAppStorage === 'function') {
      await initAppStorage();
    }
  } catch (e) {}
  try {
    if (typeof startCamera === 'function') {
      await startCamera();
    }
  } catch (e) {}
})();