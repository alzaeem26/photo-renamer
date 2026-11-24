import { StorageEngine } from './storage.js';
import { ImageEngine } from './image-engine.js';
import { AssetEngine, KNOWN_SUFFIXES } from './assets.js';
import { BackupEngine } from './backup.js';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          if (confirm('يتوفر تحديث جديد للتطبيق. هل تريد تفعيله الآن؟')) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
          }
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

async function initAppStorage() {
  try {
    await StorageEngine.init();
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
    folderLabel.textContent = directoryHandle.name;
    pickFolderBtn.classList.add('btn-active-green');
    showToast(`✓ المجلد: ${directoryHandle.name}`);
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

    if (directoryHandle) {
      try {
        const fileHandle = await directoryHandle.getFileHandle(finalFileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(finalBlob);
        await writable.close();
        showToast(`✓ حُفظت في المجلد: ${finalFileName}`);
      } catch (err) {
        showToast(`✓ حُفظت: ${finalFileName}`);
      }
    } else {
      showToast(`✓ حُفظت: ${finalFileName}`);
    }
    resetToCamera();
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

function updateHistoryUI() {
  const count = sessionPhotos.length;
  const zipSpan = document.getElementById('zipCount');
  if (zipSpan) zipSpan.textContent = count;
  drawerTotalCount.textContent = count;
  exportZipBtn.disabled = count === 0;
  if (count === 0) {
    historyList.innerHTML = '<span style="color:#94a3b8;">لا يوجد بعد</span>';
    drawerList.innerHTML = '<p style="color:#94a3b8; font-size:13px; text-align:center; margin-top:20px;">لم يتم التقاط صور بعد</p>';
    return;
  }
  const lastFive = sessionPhotos.map((item, idx) => ({ ...item, originalIndex: idx })).slice(-5).reverse();
  historyList.innerHTML = lastFive.map(item => `<span class="history-item" onclick="openPhotoViewer(${item.originalIndex})">${item.name}</span>`).join('');
  const allReversed = sessionPhotos.map((item, idx) => ({ ...item, originalIndex: idx })).reverse();
  drawerList.innerHTML = allReversed.map(item => `
    <div class="drawer-photo-card">
      <div class="drawer-card-left" onclick="openPhotoViewer(${item.originalIndex})">
        <img class="drawer-thumb" src="${item.thumbUrl || item.dataUrl}" alt="${item.name}">
        <div class="drawer-photo-info">
          <span class="drawer-photo-name">${item.name}</span>
          ${item.subInfo ? `<span class="drawer-photo-sub">${item.subInfo}</span>` : ''}
        </div>
      </div>
      <div class="drawer-card-actions">
        <button class="drawer-icon-btn" onclick="shareSinglePhoto(${item.originalIndex})" title="إرسال الصورة">📤</button>
        <button class="drawer-icon-btn" onclick="editExistingPhotoName(${item.originalIndex})" title="تعديل الاسم">✏️</button>
        <button class="drawer-icon-btn" onclick="deleteSinglePhoto(${item.originalIndex})" title="حذف">🗑️</button>
      </div>
    </div>
  `).join('');
}

discardBtn.addEventListener('click', resetToCamera);

function resetToCamera() {
  rawCapturedCanvas = null;
  editingIndex = null;
  duplicateBox.style.display = 'none';
  duplicateBox.dataset.warned = '';
  assetMatchBox.style.display = 'none';
  renameModal.style.display = 'none';
  previewImg.style.display = 'none';
  video.style.display = 'block';
}


const backupExportBtn = document.getElementById('backupExportBtn');
const backupRestoreBtn = document.getElementById('backupRestoreBtn');
const backupRestoreInput = document.getElementById('backupRestoreInput');

if (backupExportBtn) {
  backupExportBtn.addEventListener('click', async () => {
    backupExportBtn.disabled = true;
    backupExportBtn.textContent = 'جاري تجهيز النسخة (0%)...';
    try {
      const { zipBlob, manifest } = await BackupEngine.exportFullBackup((pct) => {
        backupExportBtn.textContent = `جاري تجهيز النسخة (${pct}%)...`;
      });
      const url = URL.createObjectURL(zipBlob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Alzaeem_FullBackup_${dateStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      showToast(`✓ تم تصدير نسخة احتياطية (${manifest.photosCount} صورة)`);
    } catch (err) {
      alert('فشل إنشاء النسخة الاحتياطية: ' + (err.message || ''));
    } finally {
      backupExportBtn.disabled = false;
      backupExportBtn.textContent = '💾 تصدير نسخة احتياطية كاملة';
    }
  });
}

if (backupRestoreBtn && backupRestoreInput) {
  backupRestoreBtn.addEventListener('click', () => backupRestoreInput.click());

  backupRestoreInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const inspected = await BackupEngine.inspectBackup(file);
      const { manifest } = inspected;
      const msg = `تم فحص النسخة الاحتياطية بنجاح:\n• الصور: ${manifest.photosCount}\n• الأصول: ${manifest.assetsCount}\n• التاريخ: ${manifest.exportedAt.slice(0, 10)}\n\nهل تريد استبدال الصور الحالية بالنسخة المستعادة؟\n(موافق = استبدال | إلغاء = دمج مع الحالية)`;
      const replaceExisting = confirm(msg);
      const restoredCount = await BackupEngine.restoreFromInspected(inspected, replaceExisting);
      await loadPhotosFromDB();
      updateDbBadgeUI();
      closeDrawer();
      showToast(`✓ تمت استعادة ${restoredCount} صورة بنجاح`);
    } catch (err) {
      alert('تعذرت استعادة النسخة: ' + (err.message || ''));
    } finally {
      backupRestoreInput.value = '';
    }
  });
}

initAppStorage();
startCamera();

