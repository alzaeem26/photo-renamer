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

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    const promptUpdate = (worker) => {
      if (!worker) return;
      pendingWorker = worker;
      localStorage.setItem('alzaeem_update_deferred', 'true');
      if (updateBanner) updateBanner.style.display = 'flex';
    };

    // إظهار الإشعار فوراً إذا كان هناك تحديث ينتظر مسبقاً (مؤجل أو جاهز)
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

    // فحص فوري عن أي تحديث جديد عند فتح التطبيق وعند العودة إليه
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        reg.update().catch(() => {});
        if (reg.waiting) promptUpdate(reg.waiting);
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
