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
      pendingWorker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  });
}

if (dismissUpdateBtn && updateBanner) {
  dismissUpdateBtn.addEventListener('click', () => {
    updateBanner.style.display = 'none';
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          pendingWorker = newWorker;
          if (updateBanner) updateBanner.style.display = 'flex';
        }
      });
    });
  }).catch(() => {});
}

const cameraContainer = document.getElementById('cameraContainer');
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const previewImg = document.getElementById('previewImg');
const captureBtn = document.getElementById('captureBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const clearSessionBtn = document.getElementById('clearSessionBtn');
const qualityBtn = document.getElementById('qualityBtn');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const folderLabel = document.getElementById('folderLabel');
const exportZipBtn = document.getElementById('exportZipBtn');
const toastMsg = document.getElementById('toastMsg');

const torchBtn = document.getElementById('torchBtn');
const zoomBar = document.getElementById('zoomBar');
const zoomSlider = document.getElementById('zoomSlider');
const zoomValue = document.getElementById('zoomValue');
const focusRing = document.getElementById('focusRing');
const offlineBadge = document.getElementById('offlineBadge');

const renameModal = document.getElementById('renameModal');
const modalTitleText = document.getElementById('modalTitleText');
const renameForm = document.getElementById('renameForm');
const fileNameInput = document.getElementById('fileNameInput');
const toggleKbBtn = document.getElementById('toggleKbBtn');
const submitSaveBtn = document.getElementById('submitSaveBtn');
const discardBtn = document.getElementById('discardBtn');
const duplicateBox = document.getElementById('duplicateBox');
const duplicateMsgText = document.getElementById('duplicateMsgText');
const saveNextSeqBtn = document.getElementById('saveNextSeqBtn');
const replaceOldBtn = document.getElementById('replaceOldBtn');
const historyList = document.getElementById('historyList');

const dbSettingsBtn = document.getElementById('dbSettingsBtn');
const dbCountLabel = document.getElementById('dbCountLabel');
const dbModal = document.getElementById('dbModal');
const closeDbModalBtn = document.getElementById('closeDbModalBtn');
const activeDbBanner = document.getElementById('activeDbBanner');
const activeDbFileName = document.getElementById('activeDbFileName');
const activeDbMetaText = document.getElementById('activeDbMetaText');
const triggerFileSelectBtn = document.getElementById('triggerFileSelectBtn');
const fileSelectBtnText = document.getElementById('fileSelectBtnText');
const excelFileInput = document.getElementById('excelFileInput');
const columnMappingSection = document.getElementById('columnMappingSection');
const colSeqSelect = document.getElementById('colSeqSelect');
const colNameSelect = document.getElementById('colNameSelect');
const colCodeSelect = document.getElementById('colCodeSelect');
const includeNameInWatermark = document.getElementById('includeNameInWatermark');
const saveDbMappingBtn = document.getElementById('saveDbMappingBtn');
const loadedAssetsCount = document.getElementById('loadedAssetsCount');
const clearDbAssetsBtn = document.getElementById('clearDbAssetsBtn');

const assetMatchBox = document.getElementById('assetMatchBox');
const matchedAssetName = document.getElementById('matchedAssetName');
const matchedAssetCode = document.getElementById('matchedAssetCode');

const openDrawerBtn = document.getElementById('openDrawerBtn');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');
const drawerOverlay = document.getElementById('drawerOverlay');
const sideDrawer = document.getElementById('sideDrawer');
const drawerList = document.getElementById('drawerList');
const drawerTotalCount = document.getElementById('drawerTotalCount');

const photoViewerModal = document.getElementById('photoViewerModal');
const viewerFileName = document.getElementById('viewerFileName');
const viewerFullImg = document.getElementById('viewerFullImg');
const closeViewerBtn = document.getElementById('closeViewerBtn');

let currentStream = null;
let videoTrack = null;
let useBackCamera = true;
let torchEnabled = false;
let rawCapturedCanvas = null;
let directoryHandle = null;
let sessionPhotos = [];
let isNumericMode = true;
let editingIndex = null;

const qualityLevels = ImageEngine.qualityLevels;
let currentQualityIdx = 0;

qualityBtn.addEventListener('click', () => {
  currentQualityIdx = (currentQualityIdx + 1) % qualityLevels.length;
  const selected = qualityLevels[currentQualityIdx];
  qualityBtn.textContent = selected.label;
  showToast(`دقة الكاميرا: ${selected.label}`);
  startCamera();
});

function updateOnlineStatus() {
  offlineBadge.style.display = navigator.onLine ? 'none' : 'inline-block';
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

function requestDirectoryPermissionOnGesture() {
  if (!directoryHandle || typeof directoryHandle.requestPermission !== 'function') {
    return Promise.resolve(false);
  }
  return directoryHandle.requestPermission({ mode: 'readwrite' })
    .then(res => res === 'granted')
    .catch(() => false);
}

async function restoreSavedDirectoryHandle() {
  try {
    const saved = await StorageEngine.getRecord('settings', 'savedDirectoryHandle');
    if (saved && saved.handle) {
      directoryHandle = saved.handle;
      folderLabel.textContent = directoryHandle.name;
      pickFolderBtn.classList.add('btn-active-green');
    }
  } catch (e) {}
}

async function initAppStorage() {
  try {
    await StorageEngine.init();
    await restoreSavedDirectoryHandle();
    await loadPhotosFromDB();
    await AssetEngine.loadFromDB();
    includeNameInWatermark.checked = AssetEngine.showNameInWatermark;
    updateDbBadgeUI();
  } catch (err) {
    alert('تعذر تهيئة قاعدة البيانات المحلية: ' + (err.message || ''));
  }
}

function updateDbBadgeUI() {
  const count = AssetEngine.getCount();
  if (count > 0) {
    dbCountLabel.textContent = `الأصول (${count})`;
    dbSettingsBtn.classList.add('btn-db-loaded');
    activeDbBanner.style.display = 'flex';
    activeDbFileName.textContent = AssetEngine.fileName || 'ملف أصول محفوظ';
    activeDbMetaText.textContent = `عدد الأصول المسجلة والنشطة: ${count} أصل`;
    fileSelectBtnText.textContent = `تغيير الملف الحالي (${AssetEngine.fileName || 'Excel/CSV'})`;
    loadedAssetsCount.textContent = `الحالة: مرتبط (${count} أصل)`;
    clearDbAssetsBtn.style.display = 'inline-block';
  } else {
    dbCountLabel.textContent = 'الأصول';
    dbSettingsBtn.classList.remove('btn-db-loaded');
    activeDbBanner.style.display = 'none';
    fileSelectBtnText.textContent = 'اختيار ملف Excel / CSV';
    loadedAssetsCount.textContent = 'الحالة: غير مرتبط';
    clearDbAssetsBtn.style.display = 'none';
  }
}

dbSettingsBtn.addEventListener('click', () => {
  updateDbBadgeUI();
  dbModal.style.display = 'flex';
});
closeDbModalBtn.addEventListener('click', () => {
  dbModal.style.display = 'none';
});
triggerFileSelectBtn.addEventListener('click', () => {
  excelFileInput.click();
});

excelFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileSelectBtnText.textContent = `تم اختيار: ${file.name}`;
  try {
    const { headers } = await AssetEngine.parseFile(file);
    populateColumnSelects(headers);
    columnMappingSection.style.display = 'flex';
  } catch (err) {
    alert(err.message);
  }
});

function populateColumnSelects(headers) {
  [colSeqSelect, colNameSelect, colCodeSelect].forEach(sel => {
    sel.innerHTML = '';
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      sel.appendChild(opt);
    });
  });
  headers.forEach(h => {
    const lower = h.toLowerCase();
    if (lower.includes('تسلسل') || lower.includes('رقم') || lower.includes('seq') || lower.includes('id')) colSeqSelect.value = h;
    if (lower.includes('اسم') || lower.includes('بيان') || lower.includes('وصف') || lower.includes('name')) colNameSelect.value = h;
    if (lower.includes('كود') || lower.includes('رمز') || lower.includes('code') || lower.includes('asset')) colCodeSelect.value = h;
  });
}

saveDbMappingBtn.addEventListener('click', async () => {
  const { newMap, total, duplicatesCount } = AssetEngine.buildAndValidate(
    colSeqSelect.value,
    colNameSelect.value,
    colCodeSelect.value,
    includeNameInWatermark.checked
  );

  if (duplicatesCount > 0) {
    const proceed = confirm(`تنبيه: تم اكتشاف (${duplicatesCount}) رقم تسلسل مكرر داخل الملف؛ سيتم اعتماد آخر سجل لكل رقم مكرر. هل تريد المتابعة؟`);
    if (!proceed) return;
  }

  try {
    await AssetEngine.commitMap(newMap, includeNameInWatermark.checked);
    updateDbBadgeUI();
    columnMappingSection.style.display = 'none';
    dbModal.style.display = 'none';
    showToast(`✓ تم ربط ${total} أصل بنجاح`);
  } catch (err) {
    alert('فشل حفظ قاعدة الأصول في التخزين المحلي.');
  }
});

clearDbAssetsBtn.addEventListener('click', async () => {
  if (confirm('هل تريد إلغاء ارتباط قاعدة بيانات الأصول وحذفها؟')) {
    await AssetEngine.clear();
    updateDbBadgeUI();
    columnMappingSection.style.display = 'none';
    excelFileInput.value = '';
    showToast('تم إلغاء الارتباط - الصور ستحفظ بدون علامة مائية');
  }
});

function lookupAssetByInput(rawText) {
  const clean = rawText.trim();
  const isEditing = editingIndex !== null;
  if (!clean || !AssetEngine.hasLoaded()) {
    assetMatchBox.style.display = 'none';
    submitSaveBtn.textContent = isEditing ? 'تحديث الاسم' : 'حفظ';
    return null;
  }

  const { found, baseSeq } = AssetEngine.lookup(clean);
  assetMatchBox.style.display = 'block';
  if (found) {
    assetMatchBox.classList.remove('not-found');
    matchedAssetName.textContent = `الأصل: ${found.name || 'بدون اسم'}`;
    matchedAssetCode.textContent = found.code || 'لا يوجد كود';
    submitSaveBtn.textContent = isEditing ? 'تحديث الاسم والعلامة' : 'حفظ وطباعة العلامة';
    return found;
  } else {
    assetMatchBox.classList.add('not-found');
    matchedAssetName.textContent = `رقم التسلسل (${baseSeq}) غير مسجل في القاعدة (سيُحفظ بدون علامة مائية)`;
    matchedAssetCode.textContent = '-';
    submitSaveBtn.textContent = isEditing ? 'تحديث الاسم (بدون علامة)' : 'حفظ (بدون علامة)';
    return null;
  }
}

function renderPhotoWithWatermark(sourceCanvas, seqText, assetInfo) {
  const outCanvas = document.createElement('canvas');
  outCanvas.width = sourceCanvas.width;
  outCanvas.height = sourceCanvas.height;
  const ctx = outCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0);
  if (!AssetEngine.hasLoaded() || !assetInfo) return outCanvas;

  const parts = [`التسلسل: ${seqText}`];
  if (assetInfo.code) parts.push(`كود الأصل: ${assetInfo.code}`);
  if (AssetEngine.showNameInWatermark && assetInfo.name) parts.push(assetInfo.name);
  const watermarkText = parts.join('   |   ');

  const baseDimension = Math.min(outCanvas.width, outCanvas.height);
  const fontSize = Math.max(22, Math.round(baseDimension * 0.032));
  ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Arabic", sans-serif`;

  const paddingX = Math.round(fontSize * 0.8);
  const paddingY = Math.round(fontSize * 0.5);
  const textMetrics = ctx.measureText(watermarkText);
  const boxWidth = Math.min(outCanvas.width - 24, textMetrics.width + paddingX * 2);
  const boxHeight = fontSize + paddingY * 2;
  const margin = Math.max(16, Math.round(baseDimension * 0.02));
  const boxX = outCanvas.width - boxWidth - margin;
  const boxY = outCanvas.height - boxHeight - margin;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(fontSize * 0.35));
  ctx.fill();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.08));
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.fillText(watermarkText, boxX + boxWidth - paddingX, boxY + boxHeight / 2, boxWidth - paddingX * 2);
  return outCanvas;
}

async function loadPhotosFromDB() {
  const records = (await StorageEngine.getAllPhotos()) || [];
  sessionPhotos = records
    .filter(r => r && (r.finalBlob || r.blob) && (r.finalBlob || r.blob).size > 0)
    .map(r => {
      const activeBlob = r.finalBlob || r.blob;
      const thumbBlob = r.thumbnailBlob || activeBlob;
      return {
        ...r,
        blob: activeBlob,
        finalBlob: activeBlob,
        rawBlob: r.rawBlob || activeBlob,
        thumbnailBlob: thumbBlob,
        dataUrl: URL.createObjectURL(activeBlob),
        thumbUrl: URL.createObjectURL(thumbBlob)
      };
    });
  updateHistoryUI();
}

function showToast(text) {
  toastMsg.textContent = text;
  toastMsg.classList.add('show');
  setTimeout(() => toastMsg.classList.remove('show'), 2000);
}

pickFolderBtn.addEventListener('click', async () => {
  if (!('showDirectoryPicker' in window)) {
    alert('هذا المتصفح لا يدعم ربط مجلد مباشر. يتم حفظ الصور تلقائياً بصمت داخل التطبيق ويمكنك تنزيلها كلها كملف ZIP.');
    return;
  }
  try {
    directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await StorageEngine.putRecord('settings', { key: 'savedDirectoryHandle', handle: directoryHandle, updatedAt: Date.now() }).catch(() => {});
    folderLabel.textContent = directoryHandle.name;
    pickFolderBtn.classList.add('btn-active-green');
    showToast(`✓ المجلد: ${directoryHandle.name}`);

    // حفظ جميع الصور غير المصدّرة تلقائياً في المجلد فور اختياره
    const pendingPhotos = sessionPhotos.filter(p => !p.folderExported);
    if (pendingPhotos.length > 0 && typeof executeAppendToFolder === 'function') {
      await executeAppendToFolder(pendingPhotos);
    }
  } catch (err) {
    if (err.name !== 'AbortError') alert('لم يتم منح صلاحية الوصول للمجلد.');
  }
});

function openDrawer() {
  drawerOverlay.style.display = 'block';
  requestAnimationFrame(() => sideDrawer.classList.add('open'));
}
function closeDrawer() {
  sideDrawer.classList.remove('open');
  setTimeout(() => { drawerOverlay.style.display = 'none'; }, 220);
}
openDrawerBtn.addEventListener('click', openDrawer);
closeDrawerBtn.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

window.openPhotoViewer = function(index) {
  const photo = sessionPhotos[index];
  if (!photo) return;
  viewerFileName.textContent = photo.name;
  viewerFullImg.src = photo.dataUrl;
  photoViewerModal.style.display = 'flex';
};

closeViewerBtn.addEventListener('click', () => {
  photoViewerModal.style.display = 'none';
  viewerFullImg.src = '';
});

window.shareSinglePhoto = async function(index) {
  const photo = sessionPhotos[index];
  if (!photo) return;
  try {
    const file = new File([photo.finalBlob || photo.blob], photo.name, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: photo.name,
        text: photo.subInfo ? `${photo.name} (${photo.subInfo})` : photo.name
      });
    } else {
      const link = document.createElement('a');
      link.href = photo.dataUrl;
      link.download = photo.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`✓ تم تنزيل: ${photo.name}`);
    }
  } catch (err) {
    if (err.name !== 'AbortError') showToast('تعذرت مشاركة الصورة');
  }
};

window.deleteSinglePhoto = async function(index) {
  const photo = sessionPhotos[index];
  if (!photo) return;
  if (confirm(`حذف الصورة ${photo.name}؟`)) {
    try {
      await StorageEngine.deletePhoto(photo.id);
      ImageEngine.revokeUrl(photo.dataUrl);
      ImageEngine.revokeUrl(photo.thumbUrl);
      sessionPhotos.splice(index, 1);
      updateHistoryUI();
    } catch (err) {
      alert('تعذر حذف الصورة من قاعدة البيانات.');
    }
  }
};

window.editExistingPhotoName = function(index) {
  const photo = sessionPhotos[index];
  if (!photo) return;
  closeDrawer();
  editingIndex = index;
  modalTitleText.textContent = 'تعديل رقم/اسم الصورة:';
  const baseVal = photo.name.replace(/\.jpg$/i, '');
  fileNameInput.value = baseVal;
  lookupAssetByInput(baseVal);
  duplicateBox.style.display = 'none';
  renameModal.style.display = 'flex';
  setTimeout(() => { fileNameInput.focus(); fileNameInput.select(); }, 60);
};

toggleKbBtn.addEventListener('click', () => {
  isNumericMode = !isNumericMode;
  fileNameInput.setAttribute('inputmode', isNumericMode ? 'numeric' : 'text');
  toggleKbBtn.textContent = isNumericMode ? 'لوحة: أرقام 123' : 'لوحة: نص ABC';
  fileNameInput.blur();
  setTimeout(() => fileNameInput.focus(), 50);
});

document.querySelectorAll('.suffix-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const suffix = btn.getAttribute('data-suffix');
    let currentVal = fileNameInput.value.trim();
    for (const s of KNOWN_SUFFIXES) {
      if (currentVal.endsWith(s)) {
        currentVal = currentVal.slice(0, -s.length);
        break;
      }
    }
    fileNameInput.value = currentVal + suffix;
    onInputChanged();
    fileNameInput.focus();
  });
});

async function startCamera() {
  if (currentStream) currentStream.getTracks().forEach(track => track.stop());
  torchEnabled = false;
  torchBtn.classList.remove('torch-on');
  torchBtn.style.display = 'none';
  zoomBar.style.display = 'none';
  const qSetting = qualityLevels[currentQualityIdx];
  try {
    const constraints = {
      video: {
        facingMode: useBackCamera ? { ideal: 'environment' } : 'user',
        width: { ideal: qSetting.reqW },
        height: { ideal: qSetting.reqH }
      },
      audio: false
    };
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    videoTrack = currentStream.getVideoTracks()[0];
    if (videoTrack && 'getCapabilities' in videoTrack) {
      const caps = videoTrack.getCapabilities();
      if (currentQualityIdx === 0 && caps.width && caps.height) {
        try {
          await videoTrack.applyConstraints({
            width: { ideal: caps.width.max },
            height: { ideal: caps.height.max }
          });
        } catch (e) {}
      }
      if (caps.torch) torchBtn.style.display = 'inline-block';
      if (caps.zoom) {
        zoomBar.style.display = 'flex';
        zoomSlider.min = caps.zoom.min || 1;
        zoomSlider.max = Math.min(caps.zoom.max || 4, 6);
        zoomSlider.step = caps.zoom.step || 0.1;
        zoomSlider.value = caps.zoom.min || 1;
        zoomValue.textContent = `${Number(zoomSlider.value).toFixed(1)}x`;
      }
    }
  } catch (err) {
    alert('تعذر الوصول إلى الكاميرا. تأكد من منح صلاحية الكاميرا للمتصفح.');
  }
}

torchBtn.addEventListener('click', async () => {
  if (!videoTrack) return;
  try {
    torchEnabled = !torchEnabled;
    await videoTrack.applyConstraints({ advanced: [{ torch: torchEnabled }] });
    torchBtn.classList.toggle('torch-on', torchEnabled);
  } catch (e) {
    showToast('الفلاش غير مدعوم في هذه العدسة');
  }
});

zoomSlider.addEventListener('input', async () => {
  if (!videoTrack) return;
  const val = Number(zoomSlider.value);
  zoomValue.textContent = `${val.toFixed(1)}x`;
  try {
    await videoTrack.applyConstraints({ advanced: [{ zoom: val }] });
  } catch (e) {}
});

cameraContainer.addEventListener('click', async (e) => {
  const rect = cameraContainer.getBoundingClientRect();
  focusRing.style.left = `${e.clientX - rect.left}px`;
  focusRing.style.top = `${e.clientY - rect.top}px`;
  focusRing.classList.add('active');
  setTimeout(() => focusRing.classList.remove('active'), 650);
  if (videoTrack && 'getCapabilities' in videoTrack) {
    const caps = videoTrack.getCapabilities();
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      try {
        await videoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch (err) {}
    }
  }
});

switchCamBtn.addEventListener('click', () => {
  useBackCamera = !useBackCamera;
  startCamera();
});

captureBtn.addEventListener('click', () => {
  if (!video.videoWidth || renameModal.style.display === 'flex') return;
  const qSetting = qualityLevels[currentQualityIdx];
  const isolatedRaw = ImageEngine.captureVideoFrame(video, canvas, qSetting);
  rawCapturedCanvas = isolatedRaw;

  previewImg.src = isolatedRaw.toDataURL('image/jpeg', qSetting.q);
  previewImg.style.display = 'block';
  video.style.display = 'none';

  editingIndex = null;
  modalTitleText.textContent = AssetEngine.hasLoaded() ? 'أدخل رقم التسلسل للصورة:' : 'أدخل رقم أو اسم الصورة:';
  submitSaveBtn.textContent = 'حفظ';
  fileNameInput.value = '';
  assetMatchBox.style.display = 'none';
  duplicateBox.style.display = 'none';
  renameModal.style.display = 'flex';
  setTimeout(() => fileNameInput.focus(), 60);
});

function getNextAvailableName(baseName) {
  let counter = 2;
  let candidate = `${baseName}-${counter}.jpg`;
  while (sessionPhotos.some((p, idx) => idx !== editingIndex && p.name.toLowerCase() === candidate.toLowerCase())) {
    counter++;
    candidate = `${baseName}-${counter}.jpg`;
  }
  return candidate;
}

function checkDuplicateName() {
  const raw = fileNameInput.value.trim().replace(/[\\/:*?"<>|]/g, '-');
  if (!raw) {
    duplicateBox.style.display = 'none';
    return null;
  }
  const targetName = `${raw}.jpg`;
  const existingIdx = sessionPhotos.findIndex((p, idx) => idx !== editingIndex && p.name.toLowerCase() === targetName.toLowerCase());
  if (existingIdx !== -1) {
    const nextName = getNextAvailableName(raw);
    duplicateMsgText.textContent = `⚠️ الاسم (${targetName}) مستخدم مسبقاً!`;
    saveNextSeqBtn.textContent = `حفظ باسم ${nextName.replace('.jpg', '')}`;
    saveNextSeqBtn.dataset.nextName = nextName;
    duplicateBox.style.display = 'flex';
    return existingIdx;
  } else {
    duplicateBox.style.display = 'none';
    return -1;
  }
}

function onInputChanged() {
  lookupAssetByInput(fileNameInput.value);
  checkDuplicateName();
}

fileNameInput.addEventListener('input', onInputChanged);

saveNextSeqBtn.addEventListener('click', () => {
  const nextFull = saveNextSeqBtn.dataset.nextName;
  if (nextFull) finalizeSave(nextFull, -1);
});

replaceOldBtn.addEventListener('click', () => {
  const raw = fileNameInput.value.trim().replace(/[\\/:*?"<>|]/g, '-');
  const targetName = `${raw}.jpg`;
  const existingIdx = sessionPhotos.findIndex((p, idx) => idx !== editingIndex && p.name.toLowerCase() === targetName.toLowerCase());
  if (existingIdx === -1) return;
  if (confirm(`تنبيه: سيتم حذف الصورة القديمة (${targetName}) نهائياً واستبدالها بالصورة الجديدة، هل تريد المتابعة؟`)) {
    finalizeSave(targetName, existingIdx);
  }
});

renameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const rawName = fileNameInput.value.trim();
  if (!rawName) return;
  const safeName = rawName.replace(/[\\/:*?"<>|]/g, '-');
  const finalFileName = `${safeName}.jpg`;
  const dupIdx = checkDuplicateName();
  if (dupIdx !== -1 && duplicateBox.dataset.warned !== finalFileName) {
    duplicateBox.dataset.warned = finalFileName;
    return;
  }
  duplicateBox.dataset.warned = '';
  finalizeSave(finalFileName, -1);
});

async function finalizeSave(finalFileName, replaceIndex) {
  const cleanSeq = finalFileName.replace(/\.jpg$/i, '');
  const matchedAsset = lookupAssetByInput(cleanSeq);
  const subInfoText = matchedAsset ? `${matchedAsset.code} - ${matchedAsset.name}` : '';
  const qSetting = qualityLevels[currentQualityIdx];
  const now = Date.now();

  if (editingIndex !== null) {
    const item = sessionPhotos[editingIndex];
    try {
      const sourceRawBlob = item.rawBlob || item.blob;
      const baseCanvas = await ImageEngine.blobToCanvas(sourceRawBlob);
      const reRenderedCanvas = renderPhotoWithWatermark(baseCanvas, cleanSeq, matchedAsset);
      const updatedBlob = await ImageEngine.canvasToBlob(reRenderedCanvas, qSetting.q);
      const updatedThumbBlob = await ImageEngine.createThumbnail(reRenderedCanvas);

      const updatedRecord = {
        id: item.id,
        name: finalFileName,
        subInfo: subInfoText,
        rawBlob: sourceRawBlob,
        finalBlob: updatedBlob,
        thumbnailBlob: updatedThumbBlob,
        assetSequence: cleanSeq,
        assetCode: matchedAsset ? matchedAsset.code : '',
        assetName: matchedAsset ? matchedAsset.name : '',
        watermarkApplied: !!(AssetEngine.hasLoaded() && matchedAsset),
        qualityLevel: qSetting.label,
        folderExported: false,
        createdAt: item.createdAt || now,
        updatedAt: now
      };

      await StorageEngine.updatePhoto(updatedRecord);
      ImageEngine.revokeUrl(item.dataUrl);
      ImageEngine.revokeUrl(item.thumbUrl);
      sessionPhotos[editingIndex] = {
        ...updatedRecord,
        blob: updatedBlob,
        dataUrl: URL.createObjectURL(updatedBlob),
        thumbUrl: URL.createObjectURL(updatedThumbBlob)
      };
      updateHistoryUI();
      showToast(matchedAsset ? `✓ تم التعديل وتحديث العلامة: ${finalFileName}` : `✓ تم التعديل إلى: ${finalFileName}`);
      resetToCamera();
    } catch (err) {
      alert('فشل حفظ التعديل في قاعدة البيانات: ' + (err.message || ''));
    }
    return;
  }

  if (!rawCapturedCanvas) return;

  try {
    const rawBlob = await ImageEngine.canvasToBlob(rawCapturedCanvas, qSetting.q);
    const finalCanvas = renderPhotoWithWatermark(rawCapturedCanvas, cleanSeq, matchedAsset);
    const finalBlob = await ImageEngine.canvasToBlob(finalCanvas, qSetting.q);
    const thumbBlob = await ImageEngine.createThumbnail(finalCanvas);

    if (replaceIndex !== -1) {
      const oldItem = sessionPhotos[replaceIndex];
      const replacedRecord = {
        id: oldItem.id,
        name: finalFileName,
        subInfo: subInfoText,
        rawBlob: rawBlob,
        finalBlob: finalBlob,
        thumbnailBlob: thumbBlob,
        assetSequence: cleanSeq,
        assetCode: matchedAsset ? matchedAsset.code : '',
        assetName: matchedAsset ? matchedAsset.name : '',
        watermarkApplied: !!(AssetEngine.hasLoaded() && matchedAsset),
        qualityLevel: qSetting.label,
        folderExported: false,
        createdAt: oldItem.createdAt || now,
        updatedAt: now
      };
      await StorageEngine.updatePhoto(replacedRecord);
      ImageEngine.revokeUrl(oldItem.dataUrl);
      ImageEngine.revokeUrl(oldItem.thumbUrl);
      sessionPhotos[replaceIndex] = {
        ...replacedRecord,
        blob: finalBlob,
        dataUrl: URL.createObjectURL(finalBlob),
        thumbUrl: URL.createObjectURL(thumbBlob)
      };
    } else {
      const newRecord = {
        uid: `uid_${now}_${finalBlob.size}_${finalFileName}`,
        name: finalFileName,
        subInfo: subInfoText,
        rawBlob: rawBlob,
        finalBlob: finalBlob,
        thumbnailBlob: thumbBlob,
        assetSequence: cleanSeq,
        assetCode: matchedAsset ? matchedAsset.code : '',
        assetName: matchedAsset ? matchedAsset.name : '',
        watermarkApplied: !!(AssetEngine.hasLoaded() && matchedAsset),
        qualityLevel: qSetting.label,
        folderExported: false,
        createdAt: now,
        updatedAt: now
      };
      const newId = await StorageEngine.addPhoto(newRecord);
      sessionPhotos.push({
        ...newRecord,
        id: newId,
        blob: finalBlob,
        dataUrl: URL.createObjectURL(finalBlob),
        thumbUrl: URL.createObjectURL(thumbBlob)
      });
    }

    updateHistoryUI();
    showToast(`✓ حُفظت: ${finalFileName}`);
    resetToCamera();

    // الكتابة للمجلد في الخلفية بصمت فقط إذا كان الإذن ممنوحاً مسبقاً في هذه الجلسة (بدون إبطاء الكاميرا أو طلب إذن أثناء التصوير)
    if (directoryHandle) {
      (async () => {
        try {
          const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted') return;

          const alreadyInFolder = await fileExistsInDirectory(directoryHandle, finalFileName);
          if (alreadyInFolder) return;

          const fileHandle = await directoryHandle.getFileHandle(finalFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(finalBlob);
          await writable.close();

          const savedItem = sessionPhotos.find(p => p.name === finalFileName);
          if (savedItem) {
            savedItem.folderExported = true;
            await StorageEngine.updatePhoto({
              id: savedItem.id,
              uid: savedItem.uid || `uid_${savedItem.createdAt || Date.now()}_${finalBlob.size}_${savedItem.name}`,
              name: savedItem.name,
              subInfo: savedItem.subInfo || '',
              rawBlob: savedItem.rawBlob || finalBlob,
              finalBlob: finalBlob,
              thumbnailBlob: savedItem.thumbnailBlob || null,
              assetSequence: savedItem.assetSequence || '',
              assetCode: savedItem.assetCode || '',
              assetName: savedItem.assetName || '',
              watermarkApplied: !!savedItem.watermarkApplied,
              qualityLevel: savedItem.qualityLevel || '',
              folderExported: true,
              createdAt: savedItem.createdAt || Date.now(),
              updatedAt: Date.now()
            });
            updateHistoryUI();
          }
        } catch (e) {}
      })();
    }
  } catch (err) {
    alert('فشل حفظ الصورة في قاعدة البيانات. تأكد من توفر مساحة كافية على الجهاز.');
  }
}

exportZipBtn.addEventListener('click', async () => {
  if (sessionPhotos.length === 0) return;
  exportZipBtn.disabled = true;
  exportZipBtn.textContent = 'جاري الضغط...';
  try {
    const zip = new JSZip();
    const usedPaths = new Set();
    let addedCount = 0;
    let customFolderCount = 0;
    for (let i = 0; i < sessionPhotos.length; i++) {
      const item = sessionPhotos[i];
      const activeBlob = item ? (item.finalBlob || item.blob) : null;
      if (!activeBlob) continue;
      let baseName = String(item.name || `photo_${i + 1}`)
        .replace(/\.jpg$/i, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .trim();
      if (!baseName) baseName = `photo_${i + 1}`;
      const isEnglishNumbersOnly = /^[0-9]+$/.test(baseName);
      const folderPrefix = isEnglishNumbersOnly ? '' : 'Custom_Names/';
      if (!isEnglishNumbersOnly) customFolderCount++;
      let finalZipEntryPath = `${folderPrefix}${baseName}.jpg`;
      let dupCounter = 2;
      while (usedPaths.has(finalZipEntryPath.toLowerCase())) {
        finalZipEntryPath = `${folderPrefix}${baseName}_${dupCounter}.jpg`;
        dupCounter++;
      }
      usedPaths.add(finalZipEntryPath.toLowerCase());
      const arrayBuffer = await activeBlob.arrayBuffer();
      zip.file(finalZipEntryPath, arrayBuffer, { binary: true });
      addedCount++;
    }
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    const url = URL.createObjectURL(zipBlob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Alzaeem_Assets_${dateStr}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    if (customFolderCount > 0) {
      showToast(`✓ ضُغطت ${addedCount} صورة (${customFolderCount} بمجلد Custom_Names)`);
    } else {
      showToast(`✓ تم ضغط ${addedCount} من أصل ${sessionPhotos.length} صورة`);
    }
  } catch (err) {
    alert('حدث خطأ أثناء إنشاء ملف ZIP: ' + (err.message || ''));
  } finally {
    exportZipBtn.disabled = false;
    exportZipBtn.innerHTML = `📦 ZIP (<span id="zipCount">${sessionPhotos.length}</span>)`;
  }
});

clearSessionBtn.addEventListener('click', async () => {
  if (sessionPhotos.length === 0) return;
  if (confirm('هل تريد مسح جميع الصور المحفوظة في هذه الجلسة؟')) {
    try {
      await StorageEngine.clearPhotos();
      sessionPhotos.forEach(p => {
        ImageEngine.revokeUrl(p.dataUrl);
        ImageEngine.revokeUrl(p.thumbUrl);
      });
      sessionPhotos = [];
      updateHistoryUI();
      closeDrawer();
      showToast('تم مسح الجلسة');
    } catch (err) {
      alert('تعذر مسح الجلسة.');
    }
  }
});

// ضمان حرية السحب العمودي باللمس داخل قائمة الصور في اللوحة الجانبية على الهواتف
document.addEventListener('touchmove', (e) => {
  if (e.target && e.target.closest && e.target.closest('#drawerList')) {
    e.stopPropagation();
  }
}, { capture: true, passive: true });

window.isSelectionMode = false;

function updateHistoryUI() {
  const count = sessionPhotos.length;
  const zipSpan = document.getElementById('zipCount');
  if (zipSpan) zipSpan.textContent = count;
  drawerTotalCount.textContent = count;
  exportZipBtn.disabled = count === 0;

  // تنظيف أي معرّفات محددة لم تعد موجودة في الجلسة لمنع ظهور عداد تحديد وهمي
  if (!window.selectedPhotoIds) {
    window.selectedPhotoIds = new Set();
  } else {
    const validIds = new Set(sessionPhotos.map(p => p.id));
    for (const id of Array.from(window.selectedPhotoIds)) {
      if (!validIds.has(id)) window.selectedPhotoIds.delete(id);
    }
  }

  if (count === 0) {
    historyList.innerHTML = '<span style="color:#94a3b8;">لا يوجد بعد</span>';
    drawerList.innerHTML = '<p style="color:#94a3b8; font-size:13px; text-align:center; margin-top:20px;">لم يتم التقاط صور بعد</p>';
    window.isSelectionMode = false;
    const selBtnEl = document.getElementById('selectAllPhotosBtn');
    if (selBtnEl) selBtnEl.textContent = '☑️ تحديد';
    const deselBtnEl = document.getElementById('deselectAllPhotosBtn');
    if (deselBtnEl) deselBtnEl.style.display = 'none';
    const selCountEl = document.getElementById('selectedPhotosCountLabel');
    if (selCountEl) { selCountEl.style.display = 'none'; selCountEl.textContent = '(0 محدد)'; }
    const unexpBadge = document.getElementById('unexportedCountBadge');
    if (unexpBadge) unexpBadge.style.display = 'none';
    return;
  }

  const unexportedCount = sessionPhotos.filter(p => !p.folderExported).length;
  const unexpBadge = document.getElementById('unexportedCountBadge');
  if (unexpBadge) {
    unexpBadge.style.display = unexportedCount > 0 ? 'inline-block' : 'none';
    unexpBadge.textContent = `${unexportedCount} غير مُصدّرة`;
  }

  const selBtnEl = document.getElementById('selectAllPhotosBtn');
  const deselBtnEl = document.getElementById('deselectAllPhotosBtn');
  const selCountEl = document.getElementById('selectedPhotosCountLabel');
  if (selBtnEl) {
    selBtnEl.textContent = window.isSelectionMode ? '☑️ تحديد الكل' : '☑️ تحديد';
  }
  if (deselBtnEl) {
    deselBtnEl.style.display = window.isSelectionMode ? 'inline-block' : 'none';
  }
  if (selCountEl) {
    selCountEl.style.display = window.isSelectionMode ? 'inline-block' : 'none';
    selCountEl.textContent = `(${window.selectedPhotoIds.size} محدد)`;
  }

  // شريط آخر 5 صور في الأسفل بدون لاحقة .jpg داخل إطار زجاجي مدمج وقابل للضغط
  const recent = sessionPhotos.slice(-5).reverse();
  historyList.innerHTML = recent.map((item, revIdx) => {
    const realIndex = sessionPhotos.length - 1 - revIdx;
    const cleanName = escapeHtml(String(item.name || '').replace(/\.jpe?g$/i, ''));
    return `<span class="history-chip" onclick="openPhotoViewer(${realIndex})" title="معاينة ${escapeHtml(item.name)}" style="display:inline-flex; align-items:center; justify-content:center; padding:2px 8px; border-radius:6px; background:rgba(255,255,255,0.1); border:1px solid rgba(125,211,252,0.35); color:#f8fafc; font-size:12px; font-weight:600; line-height:1.3; white-space:nowrap; cursor:pointer;">${cleanName}</span>`;
  }).join('');

  // قائمة اللوحة الجانبية مع إظهار مربع التحديد فقط عند تفعيل وضع التحديد
  drawerList.innerHTML = sessionPhotos.map((item, idx) => {
    const cleanName = escapeHtml(String(item.name || '').replace(/\.jpe?g$/i, ''));
    const isChecked = window.selectedPhotoIds.has(item.id) ? 'checked' : '';
    const checkboxHtml = window.isSelectionMode
      ? `<input type="checkbox" ${isChecked} onchange="togglePhotoSelection(${item.id}, this.checked)" style="width:17px; height:17px; min-width:17px; flex:0 0 17px; margin:0; accent-color:#38bdf8; cursor:pointer;" />`
      : '';
    const statusBadge = item.folderExported
      ? '<div style="line-height:1.2; margin-top:2px;"><span style="color:#34d399; font-size:11px; font-weight:600;">✓ بالمجلد</span></div>'
      : '';
    return `
      <div class="drawer-item" style="display:flex; align-items:center; gap:8px; padding:8px; width:100%; box-sizing:border-box; overflow:hidden;">
        ${checkboxHtml}
        <img src="${item.thumbUrl}" onclick="openPhotoViewer(${idx})" alt="${cleanName}" style="width:46px; height:46px; min-width:46px; flex:0 0 46px; object-fit:cover; border-radius:8px; cursor:pointer;" />
        <div onclick="openPhotoViewer(${idx})" style="flex:1 1 auto; min-width:0; overflow:hidden; cursor:pointer;">
          <div style="font-weight:700; font-size:13px; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cleanName}</div>
          ${item.subInfo ? `<div style="font-size:11px; color:#7dd3fc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.subInfo)}</div>` : ''}
          ${statusBadge}
        </div>
        <div style="display:flex; align-items:center; gap:4px; flex:0 0 auto;">
          <button type="button" onclick="editExistingPhotoName(${idx})" title="تعديل الاسم" style="width:30px; height:30px; min-width:30px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-size:13px; cursor:pointer;">✏️</button>
          <button type="button" onclick="shareSinglePhoto(${idx})" title="مشاركة / حفظ" style="width:30px; height:30px; min-width:30px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-size:13px; cursor:pointer;">📤</button>
          <button type="button" onclick="deleteSinglePhoto(${idx})" title="حذف" style="width:30px; height:30px; min-width:30px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; border:1px solid rgba(248,113,113,0.35); background:rgba(239,68,68,0.15); color:#f87171; font-size:13px; cursor:pointer;">🗑️</button>
        </div>
      </div>`;
  }).reverse().join('');
}

if (!window.selectedPhotoIds) window.selectedPhotoIds = new Set();
let lastFailedAppendIds = [];

window.togglePhotoSelection = function(photoId, checked) {
  if (checked) window.selectedPhotoIds.add(photoId);
  else window.selectedPhotoIds.delete(photoId);
  updateHistoryUI();
};

const selectAllPhotosBtn = document.getElementById('selectAllPhotosBtn');
const deselectAllPhotosBtn = document.getElementById('deselectAllPhotosBtn');
if (selectAllPhotosBtn) {
  selectAllPhotosBtn.addEventListener('click', () => {
    if (!window.isSelectionMode) {
      window.isSelectionMode = true;
    } else {
      sessionPhotos.forEach(p => window.selectedPhotoIds.add(p.id));
    }
    updateHistoryUI();
  });
}
if (deselectAllPhotosBtn) {
  deselectAllPhotosBtn.addEventListener('click', () => {
    window.selectedPhotoIds.clear();
    window.isSelectionMode = false;
    updateHistoryUI();
  });
}

async function ensureDirectoryAccess() {
  if (directoryHandle) {
    try {
      const perm = await directoryHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') return directoryHandle;
      const req = await directoryHandle.requestPermission({ mode: 'readwrite' });
      if (req === 'granted') return directoryHandle;
    } catch (e) {}
  }
  if (!('showDirectoryPicker' in window)) {
    throw new Error('هذا المتصفح لا يدعم الوصول المباشر للمجلدات. تبقى صورك محفوظة داخل التطبيق ويمكنك تصديرها كـ ZIP أو مشاركتها.');
  }
  directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await StorageEngine.putRecord('settings', { key: 'savedDirectoryHandle', handle: directoryHandle, updatedAt: Date.now() }).catch(() => {});
  folderLabel.textContent = directoryHandle.name;
  pickFolderBtn.classList.add('btn-active-green');
  return directoryHandle;
}

async function fileExistsInDirectory(dirHandle, fileName) {
  try {
    await dirHandle.getFileHandle(fileName, { create: false });
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') return false;
    throw err;
  }
}

const openAppendFolderBtn = document.getElementById('openAppendFolderBtn');
const appendFolderModal = document.getElementById('appendFolderModal');
const appendModalTitle = document.getElementById('appendModalTitle');
const appendFolderInfo = document.getElementById('appendFolderInfo');
const appendOptionsWrap = document.getElementById('appendOptionsWrap');
const operationReportList = document.getElementById('operationReportList');
const retryFailedAppendBtn = document.getElementById('retryFailedAppendBtn');

function closeAppendModal() {
  if (appendFolderModal) appendFolderModal.style.display = 'none';
}
document.getElementById('closeAppendModalBtn')?.addEventListener('click', closeAppendModal);
document.getElementById('closeAppendFooterBtn')?.addEventListener('click', closeAppendModal);

async function executeAppendToFolder(targetPhotos) {
  if (!targetPhotos || targetPhotos.length === 0) {
    alert('لا توجد صور مطابقة للإلحاق بالمجلد.');
    return;
  }

  let dir;
  try {
    dir = await ensureDirectoryAccess();
  } catch (err) {
    alert(err.message || 'تعذّر الوصول إلى المجلد. تبقى جميع الصور محفوظة داخل التطبيق.');
    return;
  }

  const existingFiles = [];
  try {
    for (const p of targetPhotos) {
      if (await fileExistsInDirectory(dir, p.name)) {
        existingFiles.push(p.name);
      }
    }
  } catch (permErr) {
    lastFailedAppendIds = targetPhotos.map(p => p.id);
    appendOptionsWrap.style.display = 'none';
    operationReportList.style.display = 'flex';
    retryFailedAppendBtn.style.display = 'inline-block';
    appendFolderInfo.innerHTML = `المجلد: <b>${escapeHtml(dir.name)}</b> | نجح: <b style="color:#34d399;">0</b> | تعذّر: <b style="color:#f87171;">${targetPhotos.length}</b>`;
    const idsJson = JSON.stringify(lastFailedAppendIds);
    operationReportList.innerHTML = `
      <div style="color:#f87171;">✕ تعذّرت الكتابة المباشرة في المجلد (${escapeHtml(permErr.message || 'قيد صلاحيات النظام')}) — بقيت جميع الصور محفوظة داخل التطبيق.</div>
      <div style="margin-top:8px; padding:10px; border-radius:8px; background:rgba(56,189,248,0.14); border:1px solid rgba(56,189,248,0.45);">
        <div style="color:#7dd3fc; font-size:12px; margin-bottom:6px;">📱 <b>بديل الموبايل:</b> احفظ أو شارك الصور مباشرة عبر نظام الهاتف (لن تُعلّم كمُصدّرة لمجلد إلا بعد حفظها الفعلي):</div>
        <button type="button" onclick='shareOrDownloadBatchPhotos(${idsJson})' class="btn-save" style="width:100%; padding:9px; font-size:12px; background:rgba(16,185,129,0.4); border:1px solid #34d399;">📤 حفظ / مشاركة الصور (${lastFailedAppendIds.length}) عبر الهاتف</button>
      </div>`;
    return;
  }

  let overwriteApproved = false;
  if (existingFiles.length > 0) {
    const previewNames = existingFiles.slice(0, 6).join('، ') + (existingFiles.length > 6 ? ` ... (+${existingFiles.length - 6})` : '');
    overwriteApproved = confirm(
      `⚠️ تنبيه: توجد ${existingFiles.length} ملفات بنفس الاسم داخل المجلد (${dir.name}):\n${previewNames}\n\n` +
      `• اضغط [موافق] للكتابة فوق الملفات الموجودة.\n` +
      `• اضغط [إلغاء] لتخطي الملفات الموجودة وحفظ الجديدة فقط.`
    );
  }

  appendOptionsWrap.style.display = 'none';
  operationReportList.style.display = 'flex';
  operationReportList.innerHTML = '<div style="color:#7dd3fc;">⏳ جاري إلحاق الصور بالمجلد...</div>';
  retryFailedAppendBtn.style.display = 'none';
  lastFailedAppendIds = [];

  const reportLines = [];
  let successCount = 0;

  for (const photo of targetPhotos) {
    try {
      const exists = existingFiles.includes(photo.name);
      if (exists && !overwriteApproved) {
        lastFailedAppendIds.push(photo.id);
        reportLines.push(`<div style="color:#fbbf24;">⏭️ <b>${escapeHtml(photo.name)}</b>: تم التخطي (الملف موجود مسبقاً في المجلد)</div>`);
        continue;
      }

      const blobToWrite = photo.finalBlob || photo.blob;
      if (!blobToWrite) throw new Error('بيانات الصورة غير متوفرة');

      const fileHandle = await dir.getFileHandle(photo.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blobToWrite);
      await writable.close();

      await StorageEngine.updatePhoto({
        id: photo.id,
        uid: photo.uid || `uid_${photo.createdAt || Date.now()}_${blobToWrite.size}_${photo.name}`,
        name: photo.name,
        subInfo: photo.subInfo || '',
        rawBlob: photo.rawBlob || blobToWrite,
        finalBlob: blobToWrite,
        thumbnailBlob: photo.thumbnailBlob || null,
        assetSequence: photo.assetSequence || '',
        assetCode: photo.assetCode || '',
        assetName: photo.assetName || '',
        watermarkApplied: !!photo.watermarkApplied,
        qualityLevel: photo.qualityLevel || '',
        folderExported: true,
        createdAt: photo.createdAt || Date.now(),
        updatedAt: Date.now()
      });
      photo.folderExported = true;

      successCount++;
      reportLines.push(`<div style="color:#34d399;">✓ <b>${escapeHtml(photo.name)}</b>: نجحت الكتابة في المجلد</div>`);
    } catch (err) {
      lastFailedAppendIds.push(photo.id);
      const isAndroidBlock = String(err.message || '').includes('not allowed by the user agent');
      const friendlyErr = isAndroidBlock
        ? 'نظام أندرويد يحظر الكتابة المباشرة للمجلدات من المتصفح'
        : escapeHtml(err.message || 'خطأ وصول');
      reportLines.push(`<div style="color:#f87171;">✕ <b>${escapeHtml(photo.name)}</b>: ${friendlyErr}</div>`);
    }
  }

  updateHistoryUI();
  appendFolderInfo.innerHTML = `المجلد: <b>${escapeHtml(dir.name)}</b> | نجح: <b style="color:#34d399;">${successCount}</b> | تعذّر/تخطي: <b style="color:#f87171;">${lastFailedAppendIds.length}</b>`;
  operationReportList.innerHTML = reportLines.join('');
  if (lastFailedAppendIds.length > 0) {
    retryFailedAppendBtn.style.display = 'inline-block';
    const idsJson = JSON.stringify(lastFailedAppendIds);
    operationReportList.innerHTML += `
      <div style="margin-top:8px; padding:10px; border-radius:8px; background:rgba(56,189,248,0.14); border:1px solid rgba(56,189,248,0.45);">
        <div style="color:#7dd3fc; font-size:12px; margin-bottom:6px;">📱 <b>بديل الموبايل:</b> يمكنك مشاركة أو تنزيل الصور المتبقية عبر الهاتف (ستبقى حالة المجلد ⚠️ حتى تُكتب في مجلد فعلي):</div>
        <button type="button" onclick='shareOrDownloadBatchPhotos(${idsJson})' class="btn-save" style="width:100%; padding:9px; font-size:12px; background:rgba(16,185,129,0.4); border:1px solid #34d399;">📤 مشاركة / تنزيل الصور (${lastFailedAppendIds.length})</button>
      </div>`;
  }
}

if (openAppendFolderBtn) {
  openAppendFolderBtn.addEventListener('click', () => {
    if (sessionPhotos.length === 0) return;
    const unexported = sessionPhotos.filter(p => !p.folderExported);
    const selected = sessionPhotos.filter(p => window.selectedPhotoIds.has(p.id));

    appendModalTitle.textContent = '📂 إلحاق صور الجلسة بالمجلد';
    appendFolderInfo.innerHTML =
      `• المجلد الحالي: <b>${directoryHandle ? escapeHtml(directoryHandle.name) : 'لم يُحدد بعد (سيُطلب عند التنفيذ)'}</b><br>` +
      `• صور غير مُصدّرة لمجلد: <b>${unexported.length}</b> | صور محددة: <b>${selected.length}</b>`;

    appendOptionsWrap.style.display = 'flex';
    operationReportList.style.display = 'none';
    retryFailedAppendBtn.style.display = 'none';

    const allBtn = document.getElementById('appendAllUnexportedBtn');
    const selBtn = document.getElementById('appendSelectedOnlyBtn');
    allBtn.disabled = unexported.length === 0;
    allBtn.textContent = `إلحاق جميع الصور غير المُصدّرة (${unexported.length})`;
    selBtn.disabled = selected.length === 0;
    selBtn.textContent = `إلحاق الصور المحددة فقط (${selected.length})`;

    appendFolderModal.style.display = 'flex';
  });
}

document.getElementById('appendAllUnexportedBtn')?.addEventListener('click', () => {
  executeAppendToFolder(sessionPhotos.filter(p => !p.folderExported));
});

document.getElementById('appendSelectedOnlyBtn')?.addEventListener('click', () => {
  executeAppendToFolder(sessionPhotos.filter(p => window.selectedPhotoIds.has(p.id)));
});

retryFailedAppendBtn?.addEventListener('click', () => {
  executeAppendToFolder(sessionPhotos.filter(p => lastFailedAppendIds.includes(p.id)));
});

const openBatchRenameBtn = document.getElementById('openBatchRenameBtn');
const batchRenameModal = document.getElementById('batchRenameModal');
const batchColSelect = document.getElementById('batchColSelect');
const batchKeepSuffixChk = document.getElementById('batchKeepSuffixChk');
const batchSummaryBanner = document.getElementById('batchSummaryBanner');
const batchPreviewList = document.getElementById('batchPreviewList');
const confirmBatchRenameBtn = document.getElementById('confirmBatchRenameBtn');

let currentBatchPlan = [];

function sanitizeFileNamePart(val) {
  return String(val || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ');
}

async function buildBatchRenamePreview() {
  const selectedCol = batchColSelect.value;
  const keepSuffix = batchKeepSuffixChk.checked;
  const selectedPhotos = sessionPhotos.filter(p => window.selectedPhotoIds.has(p.id));

  currentBatchPlan = [];
  const proposedTargets = new Map();

  const draftItems = selectedPhotos.map(photo => {
    const rawLookupKey = photo.assetSequence || photo.name.replace(/\.jpg$/i, '');
    const { found, suffix } = AssetEngine.lookup(rawLookupKey);

    if (!found) {
      return { photo, status: 'skip', reason: 'غير مرتبطة بسجل في قاعدة البيانات — ستبقى على اسمها', newName: photo.name };
    }

    const rowObj = found.row || {};
    let colValue = '';
    if (Object.prototype.hasOwnProperty.call(rowObj, selectedCol)) {
      colValue = String(rowObj[selectedCol] ?? '').trim();
    } else if (selectedCol === '__code__') {
      colValue = String(found.code || '').trim();
    } else if (selectedCol === '__name__') {
      colValue = String(found.name || '').trim();
    }

    const cleanVal = sanitizeFileNamePart(colValue);
    if (!cleanVal) {
      return { photo, status: 'skip', reason: `لا تتوفر قيمة في عمود (${selectedCol}) — ستبقى على اسمها`, newName: photo.name };
    }

    const finalBase = (keepSuffix && suffix) ? `${cleanVal}${suffix}` : cleanVal;
    const newName = `${finalBase}.jpg`;

    if (newName.toLowerCase() === photo.name.toLowerCase()) {
      return { photo, status: 'unchanged', reason: 'الاسم مطابق مسبقاً', newName: photo.name };
    }

    const key = newName.toLowerCase();
    proposedTargets.set(key, (proposedTargets.get(key) || 0) + 1);
    return { photo, status: 'candidate', newName };
  });

  const unselectedNames = new Set(
    sessionPhotos
      .filter(p => !window.selectedPhotoIds.has(p.id))
      .map(p => p.name.toLowerCase())
  );

  const batchExportedOldNames = new Set(
    draftItems
      .filter(i => i.status === 'candidate' && i.photo.folderExported)
      .map(i => i.photo.name.toLowerCase())
  );

  let readyCount = 0;
  let conflictCount = 0;
  let skipCount = 0;

  currentBatchPlan = [];
  for (const item of draftItems) {
    if (item.status !== 'candidate') {
      skipCount++;
      currentBatchPlan.push(item);
      continue;
    }

    const key = item.newName.toLowerCase();
    if ((proposedTargets.get(key) || 0) > 1) {
      conflictCount++;
      currentBatchPlan.push({ ...item, status: 'conflict', reason: `تعارض: الاسم (${item.newName}) مكرر بين الصور المحددة` });
      continue;
    }

    if (unselectedNames.has(key)) {
      conflictCount++;
      currentBatchPlan.push({ ...item, status: 'conflict', reason: `تعارض: الاسم (${item.newName}) مستخدم لصورة أخرى في الجلسة` });
      continue;
    }

    if (item.photo.folderExported && directoryHandle && !batchExportedOldNames.has(key)) {
      try {
        if (await fileExistsInDirectory(directoryHandle, item.newName)) {
          conflictCount++;
          currentBatchPlan.push({ ...item, status: 'conflict', reason: `تعارض في المجلد: يوجد ملف باسم (${item.newName}) مسبقاً` });
          continue;
        }
      } catch (e) {}
    }

    readyCount++;
    currentBatchPlan.push({ ...item, status: 'ready', reason: 'جاهز للتسمية' });
  }

  if (conflictCount > 0) {
    batchSummaryBanner.style.borderColor = 'rgba(248,113,113,0.7)';
    batchSummaryBanner.innerHTML =
      `<span style="color:#f87171;">⚠️ يوجد <b>${conflictCount}</b> تعارض في الأسماء!</span> ` +
      `جاهز: <b>${readyCount}</b> | بدون تغيير: <b>${skipCount}</b>.<br>` +
      `<span style="font-size:11px; color:#cbd5e1;">لن يتم المساس بأي اسم متعارض؛ يمكنك اختيار عمود آخر أو المتابعة للصور السليمة فقط.</span>`;
  } else {
    batchSummaryBanner.style.borderColor = 'rgba(52,211,153,0.6)';
    batchSummaryBanner.innerHTML =
      `<span style="color:#34d399;">✓ المعاينة سليمة بدون تعارضات (يدعم تبديل الأسماء تلقائياً).</span> ` +
      `سيتم إعادة تسمية <b>${readyCount}</b> صورة، وتبقى <b>${skipCount}</b> صورة على اسمها الحالي.`;
  }

  confirmBatchRenameBtn.disabled = readyCount === 0;
  confirmBatchRenameBtn.textContent = `اعتماد وتنفيذ (${readyCount} صورة)`;

  batchPreviewList.innerHTML = currentBatchPlan.map(item => {
    if (item.status === 'ready') {
      return `<div style="padding:6px 8px; border-radius:6px; background:rgba(16,185,129,0.12); border:1px solid rgba(52,211,153,0.3); font-size:12px;">
        <div style="color:#e2e8f0;">${escapeHtml(item.photo.name)} ➔ <b style="color:#34d399;">${escapeHtml(item.newName)}</b></div>
      </div>`;
    }
    if (item.status === 'conflict') {
      return `<div style="padding:6px 8px; border-radius:6px; background:rgba(239,68,68,0.14); border:1px solid rgba(248,113,113,0.4); font-size:12px;">
        <div style="color:#fca5a5;">${escapeHtml(item.photo.name)} ➔ <b>${escapeHtml(item.newName)}</b></div>
        <div style="font-size:11px; color:#f87171;">${escapeHtml(item.reason)}</div>
      </div>`;
    }
    return `<div style="padding:6px 8px; border-radius:6px; background:rgba(148,163,184,0.1); border:1px solid rgba(148,163,184,0.25); font-size:12px;">
      <div style="color:#cbd5e1;">${escapeHtml(item.photo.name)} (يبقى كما هو)</div>
      <div style="font-size:11px; color:#94a3b8;">${escapeHtml(item.reason)}</div>
    </div>`;
  }).join('');
}

if (openBatchRenameBtn) {
  openBatchRenameBtn.addEventListener('click', async () => {
    if (window.selectedPhotoIds.size === 0) {
      alert('يرجى تحديد صورة واحدة على الأقل أولاً.');
      return;
    }
    if (!AssetEngine.hasLoaded()) {
      alert('يرجى ربط ملف قاعدة بيانات الأصول (Excel / CSV) أولاً لاستخراج الأسماء منه.');
      return;
    }

    const headers = AssetEngine.getHeaders();
    batchColSelect.innerHTML = '';
    if (headers.length > 1) {
      headers.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = `عمود: ${h}`;
        batchColSelect.appendChild(opt);
      });
    } else {
      if (headers.length === 1) {
        const opt0 = document.createElement('option');
        opt0.value = headers[0];
        opt0.textContent = `عمود: ${headers[0]}`;
        batchColSelect.appendChild(opt0);
      }
      const optCode = document.createElement('option');
      optCode.value = '__code__';
      optCode.textContent = 'كود الأصل (المحفوظ بالقاعدة)';
      const optName = document.createElement('option');
      optName.value = '__name__';
      optName.textContent = 'اسم الأصل (المحفوظ بالقاعدة)';
      batchColSelect.appendChild(optCode);
      batchColSelect.appendChild(optName);
    }

    await buildBatchRenamePreview();
    batchRenameModal.style.display = 'flex';
  });
}

batchColSelect?.addEventListener('change', buildBatchRenamePreview);
batchKeepSuffixChk?.addEventListener('change', buildBatchRenamePreview);
document.getElementById('closeBatchRenameBtn')?.addEventListener('click', () => { batchRenameModal.style.display = 'none'; });
document.getElementById('cancelBatchRenameBtn')?.addEventListener('click', () => { batchRenameModal.style.display = 'none'; });

confirmBatchRenameBtn?.addEventListener('click', async () => {
  const readyItems = currentBatchPlan.filter(i => i.status === 'ready');
  if (readyItems.length === 0) return;

  confirmBatchRenameBtn.disabled = true;
  confirmBatchRenameBtn.textContent = 'جاري التنفيذ الآمن...';

  const reportLines = [];
  let renamedCount = 0;
  let failedCount = 0;

  const stagedDirItems = new Map();
  for (const item of readyItems) {
    const photo = item.photo;
    if (!photo.folderExported) continue;

    try {
      const dir = await ensureDirectoryAccess();
      const tempName = `__tmp_swap_${Date.now()}_${photo.id}_${photo.name}`;
      const blobToWrite = photo.finalBlob || photo.blob;
      const tmpHandle = await dir.getFileHandle(tempName, { create: true });
      const writable = await tmpHandle.createWritable();
      await writable.write(blobToWrite);
      await writable.close();

      let oldDeleted = true;
      try {
        await dir.removeEntry(photo.name);
      } catch (delErr) {
        oldDeleted = false;
      }

      stagedDirItems.set(photo.id, { dir, tempName, oldName: photo.name, oldDeleted });
    } catch (dirErr) {
      stagedDirItems.set(photo.id, { mobileFallback: true });
    }
  }

  for (const item of readyItems) {
    const photo = item.photo;
    const oldName = photo.name;
    const newName = item.newName;
    const staged = stagedDirItems.get(photo.id);
    let nextFolderExported = !!photo.folderExported;
    let folderWarning = '';

    try {
      if (staged && !staged.mobileFallback) {
        const { dir, tempName, oldDeleted } = staged;
        if (await fileExistsInDirectory(dir, newName)) {
          try { await dir.removeEntry(tempName); } catch (e) {}
          throw new Error(`يوجد ملف باسم (${newName}) مسبقاً في المجلد`);
        }

        const blobToWrite = photo.finalBlob || photo.blob;
        const finalHandle = await dir.getFileHandle(newName, { create: true });
        const writable = await finalHandle.createWritable();
        await writable.write(blobToWrite);
        await writable.close();

        try { await dir.removeEntry(tempName); } catch (e) {}
        if (!oldDeleted) {
          folderWarning = ` (تنبيه: تعذّر حذف الملف القديم ${oldName} من المجلد)`;
        }
      } else if (staged && staged.mobileFallback) {
        nextFolderExported = false;
      }

      const updatedAt = Date.now();
      await StorageEngine.updatePhoto({
        id: photo.id,
        uid: photo.uid || `uid_${photo.createdAt || updatedAt}_${(photo.finalBlob || photo.blob)?.size || 0}_${newName}`,
        name: newName,
        subInfo: photo.subInfo || '',
        rawBlob: photo.rawBlob || photo.blob,
        finalBlob: photo.finalBlob || photo.blob,
        thumbnailBlob: photo.thumbnailBlob || null,
        assetSequence: photo.assetSequence || '',
        assetCode: photo.assetCode || '',
        assetName: photo.assetName || '',
        watermarkApplied: !!photo.watermarkApplied,
        qualityLevel: photo.qualityLevel || '',
        folderExported: nextFolderExported,
        createdAt: photo.createdAt || updatedAt,
        updatedAt
      });

      photo.name = newName;
      photo.folderExported = nextFolderExported;
      photo.updatedAt = updatedAt;

      renamedCount++;
      reportLines.push(`<div style="color:#34d399;">✓ <b>${escapeHtml(oldName)}</b> ➔ <b>${escapeHtml(newName)}</b>${escapeHtml(folderWarning)}</div>`);
    } catch (err) {
      failedCount++;
      reportLines.push(`<div style="color:#f87171;">✕ <b>${escapeHtml(oldName)}</b>: تعذّر التحديث (${escapeHtml(err.message || 'خطأ')}) — بقي الاسم القديم سليماً</div>`);
    }
  }

  updateHistoryUI();
  batchRenameModal.style.display = 'none';

  appendModalTitle.textContent = '📋 نتيجة إعادة التسمية الجماعية';
  appendFolderInfo.innerHTML = `تمت تسمية: <b style="color:#34d399;">${renamedCount}</b> | تعذّر/تعارض: <b style="color:#f87171;">${failedCount}</b>`;
  appendOptionsWrap.style.display = 'none';
  retryFailedAppendBtn.style.display = 'none';
  operationReportList.style.display = 'flex';
  operationReportList.innerHTML = reportLines.join('');
  appendFolderModal.style.display = 'flex';
});

window.shareOrDownloadBatchPhotos = async function(photoIds) {
  const targets = sessionPhotos.filter(p => photoIds.includes(p.id));
  if (targets.length === 0) return;

  try {
    const files = targets.map(p => new File([p.finalBlob || p.blob], p.name, { type: 'image/jpeg' }));
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({
        files,
        title: `صور الجرد (${files.length})`,
        text: `تصدير ${files.length} صورة من كاميرا الزعيم`
      });
      closeAppendModal();
      showToast(`✓ تمت مشاركة ${targets.length} صورة (تبقى حالة المجلد ⚠️ حتى الحفظ في مجلد)`);
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }

  const zip = new JSZip();
  for (const p of targets) {
    const blob = p.finalBlob || p.blob;
    if (blob) zip.file(p.name, await blob.arrayBuffer(), { binary: true });
  }
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Alzaeem_Batch_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 15000);

  closeAppendModal();
  showToast(`✓ تم تنزيل ${targets.length} صورة في ملف ZIP`);
};

function resetToCamera() {
  renameModal.style.display = 'none';
  previewImg.style.display = 'none';
  previewImg.src = '';
  video.style.display = 'block';
  rawCapturedCanvas = null;
  editingIndex = null;
}

if (discardBtn) {
  discardBtn.addEventListener('click', resetToCamera);
}

// تشغيل قاعدة البيانات والكاميرا فور فتح التطبيق
initAppStorage();
startCamera();

// ربط قائمة وأزرار النسخ الاحتياطي والاستعادة
const backupMenuToggleBtn = document.getElementById('backupMenuToggleBtn');
const backupActionsWrap = document.getElementById('backupActionsWrap');
const backupExportBtn = document.getElementById('backupExportBtn');
const backupRestoreBtn = document.getElementById('backupRestoreBtn');
const backupRestoreInput = document.getElementById('backupRestoreInput');

if (backupMenuToggleBtn && backupActionsWrap) {
  backupMenuToggleBtn.addEventListener('click', () => {
    const isHidden = backupActionsWrap.style.display === 'none' || !backupActionsWrap.style.display;
    backupActionsWrap.style.display = isHidden ? 'flex' : 'none';
  });
}

if (backupExportBtn) {
  backupExportBtn.addEventListener('click', async () => {
    backupExportBtn.disabled = true;
    const origText = backupExportBtn.textContent;
    backupExportBtn.textContent = '⏳ جاري تجهيز النسخة الاحتياطية...';
    try {
      const res = await BackupEngine.exportFullBackup(sessionPhotos);
      showToast(`✓ تم تصدير النسخة (${res.photosCount} صورة)`);
    } catch (err) {
      alert('فشل تصدير النسخة الاحتياطية: ' + (err.message || ''));
    } finally {
      backupExportBtn.disabled = false;
      backupExportBtn.textContent = origText;
    }
  });
}

if (backupRestoreBtn && backupRestoreInput) {
  backupRestoreBtn.addEventListener('click', () => backupRestoreInput.click());
  backupRestoreInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const mergeMode = confirm(
      'اختر طريقة استعادة النسخة الاحتياطية:\n\n' +
      '• اضغط [موافق] للدمج مع الصور الحالية (يمنع تكرار الصور المطابقة تلقائياً).\n' +
      '• اضغط [إلغاء] للاستبدال الكامل للجلسة الحالية.'
    );
    try {
      const stats = await BackupEngine.restoreBackup(file, sessionPhotos, { merge: mergeMode });
      await loadPhotosFromDB();
      await AssetEngine.loadFromDB();
      includeNameInWatermark.checked = AssetEngine.showNameInWatermark;
      updateDbBadgeUI();
      showToast(`✓ استُعيدت ${stats.restoredPhotos} صورة` + (stats.skippedDuplicates ? ` (تُخطي ${stats.skippedDuplicates} مكررة)` : ''));
    } catch (err) {
      alert('فشل استعادة النسخة: ' + (err.message || ''));
    } finally {
      backupRestoreInput.value = '';
    }
  });
}