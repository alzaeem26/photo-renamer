import { StorageEngine } from './storage.js';
import { AssetEngine } from './assets.js';
import { ImageEngine } from './image-engine.js';

function generatePhotoUid(photo, index = 0) {
  if (photo && photo.uid) return String(photo.uid);
  const created = photo?.createdAt || Date.now();
  const name = String(photo?.name || `photo_${index}`);
  const size = photo?.finalBlob?.size || photo?.blob?.size || 0;
  return `uid_${created}_${size}_${name}`;
}

export const BackupEngine = {
  BACKUP_VERSION: 3,

  async exportFullBackup(onProgress) {
    const zip = new JSZip();
    const photos = (await StorageEngine.getAllPhotos()) || [];
    const assetsSettings = await StorageEngine.getRecord('settings', 'assetsData');

    const photosMeta = [];
    const rawFolder = zip.folder('raw');
    const finalFolder = zip.folder('final');

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (!p) continue;

      const uid = generatePhotoUid(p, i);
      const safeKey = `photo_${p.id || i + 1}`;
      const finalBlob = p.finalBlob || p.blob;
      const rawBlob = p.rawBlob || finalBlob;

      if (rawBlob) {
        rawFolder.file(`${safeKey}.jpg`, await rawBlob.arrayBuffer(), { binary: true });
      }
      if (finalBlob) {
        finalFolder.file(`${safeKey}.jpg`, await finalBlob.arrayBuffer(), { binary: true });
      }

      photosMeta.push({
        uid,
        key: safeKey,
        name: p.name,
        subInfo: p.subInfo || '',
        assetSequence: p.assetSequence || '',
        assetCode: p.assetCode || '',
        assetName: p.assetName || '',
        watermarkApplied: !!p.watermarkApplied,
        qualityLevel: p.qualityLevel || 'قصوى',
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now()
      });

      if (onProgress) onProgress(Math.round(((i + 1) / Math.max(1, photos.length)) * 80));
    }

    const manifest = {
      app: 'Alzaeem Camera',
      backupVersion: this.BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      photosCount: photosMeta.length,
      assetsCount: assetsSettings && assetsSettings.map ? Object.keys(assetsSettings.map).length : 0
    };

    zip.file('backup-manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('photos-meta.json', JSON.stringify(photosMeta, null, 2));
    if (assetsSettings) {
      zip.file('assets-data.json', JSON.stringify(assetsSettings, null, 2));
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    if (onProgress) onProgress(100);
    return { zipBlob, manifest };
  },

  async inspectBackup(file) {
    if (file.size > 1536 * 1024 * 1024) {
      throw new Error('حجم ملف النسخة الاحتياطية يتجاوز الحد المسموح للاستعادة المباشرة (1.5 GB).');
    }

    const zip = await JSZip.loadAsync(file);
    const manifestEntry = zip.file('backup-manifest.json');
    const metaEntry = zip.file('photos-meta.json');

    if (!manifestEntry || !metaEntry) {
      throw new Error('ملف النسخة الاحتياطية غير صالح أو يفتقد ملفات البيانات الأساسية.');
    }

    const manifest = JSON.parse(await manifestEntry.async('string'));
    if (!manifest || manifest.app !== 'Alzaeem Camera') {
      throw new Error('هذا الملف لا يخص تطبيق كاميرا الزعيم.');
    }

    const photosMeta = JSON.parse(await metaEntry.async('string'));
    if (!Array.isArray(photosMeta)) {
      throw new Error('بنية سجل الصور داخل النسخة الاحتياطية تالفة.');
    }

    const existingPhotos = (await StorageEngine.getAllPhotos()) || [];
    const existingUids = new Set(existingPhotos.map((p, idx) => generatePhotoUid(p, idx)));

    let validCount = 0;
    let missingFilesCount = 0;
    let duplicateInDeviceCount = 0;

    for (let i = 0; i < photosMeta.length; i++) {
      const meta = photosMeta[i];
      if (!meta || !meta.key || !meta.name) {
        missingFilesCount++;
        continue;
      }
      const finalEntry = zip.file(`final/${meta.key}.jpg`);
      if (!finalEntry) {
        missingFilesCount++;
        continue;
      }
      validCount++;
      const uid = generatePhotoUid(meta, i);
      if (existingUids.has(uid)) {
        duplicateInDeviceCount++;
      }
    }

    const assetsEntry = zip.file('assets-data.json');
    const assetsData = assetsEntry ? JSON.parse(await assetsEntry.async('string')) : null;

    return {
      zip,
      manifest,
      photosMeta,
      assetsData,
      audit: {
        totalInMeta: photosMeta.length,
        validCount,
        missingFilesCount,
        duplicateInDeviceCount
      }
    };
  },

  async restoreFromInspected(inspected, replaceExisting = false) {
    const { zip, photosMeta, assetsData } = inspected;

    const existingPhotos = replaceExisting ? [] : ((await StorageEngine.getAllPhotos()) || []);
    const existingUids = new Set(existingPhotos.map((p, idx) => generatePhotoUid(p, idx)));

    const preparedRecords = [];
    let skippedDuplicates = 0;
    let missingFiles = 0;

    for (let i = 0; i < photosMeta.length; i++) {
      const meta = photosMeta[i];
      if (!meta || !meta.key || !meta.name) {
        missingFiles++;
        continue;
      }

      const finalEntry = zip.file(`final/${meta.key}.jpg`);
      const rawEntry = zip.file(`raw/${meta.key}.jpg`);
      if (!finalEntry) {
        missingFiles++;
        continue;
      }

      const uid = generatePhotoUid(meta, i);
      if (!replaceExisting && existingUids.has(uid)) {
        skippedDuplicates++;
        continue;
      }

      const finalBuffer = await finalEntry.async('arraybuffer');
      const finalBlob = new Blob([finalBuffer], { type: 'image/jpeg' });
      let rawBlob = finalBlob;

      if (rawEntry) {
        const rawBuffer = await rawEntry.async('arraybuffer');
        rawBlob = new Blob([rawBuffer], { type: 'image/jpeg' });
      }

      let thumbBlob = null;
      try {
        const canvas = await ImageEngine.blobToCanvas(finalBlob);
        thumbBlob = await ImageEngine.createThumbnail(canvas);
      } catch (e) {}

      preparedRecords.push({
        uid,
        name: String(meta.name),
        subInfo: String(meta.subInfo || ''),
        rawBlob,
        finalBlob,
        thumbnailBlob: thumbBlob,
        assetSequence: String(meta.assetSequence || ''),
        assetCode: String(meta.assetCode || ''),
        assetName: String(meta.assetName || ''),
        watermarkApplied: !!meta.watermarkApplied,
        qualityLevel: String(meta.qualityLevel || 'قصوى'),
        folderExported: false,
        createdAt: Number(meta.createdAt) || Date.now(),
        updatedAt: Number(meta.updatedAt) || Date.now()
      });
    }

    if (replaceExisting) {
      await StorageEngine.replaceAllPhotosAtomic(preparedRecords);
    } else {
      await StorageEngine.addPhotosBatchAtomic(preparedRecords);
    }

    if (assetsData && assetsData.map) {
      await StorageEngine.putRecord('settings', {
        key: 'assetsData',
        map: assetsData.map,
        headers: assetsData.headers || [],
        fileName: assetsData.fileName || 'نسخة مستعادة',
        showName: !!assetsData.showName,
        updatedAt: Date.now()
      });
      await AssetEngine.loadFromDB();
    }

    return {
      restoredCount: preparedRecords.length,
      skippedDuplicates,
      missingFiles
    };
  }
};
