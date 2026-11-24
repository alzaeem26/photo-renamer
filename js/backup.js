import { StorageEngine } from './storage.js';
import { AssetEngine } from './assets.js';

export const BackupEngine = {
  BACKUP_VERSION: 2,

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
    const zip = await JSZip.loadAsync(file);
    const manifestEntry = zip.file('backup-manifest.json');
    const metaEntry = zip.file('photos-meta.json');

    if (!manifestEntry || !metaEntry) {
      throw new Error('ملف النسخة الاحتياطية غير صالح أو تالف.');
    }

    const manifest = JSON.parse(await manifestEntry.async('string'));
    if (!manifest || manifest.app !== 'Alzaeem Camera') {
      throw new Error('هذا الملف لا يخص تطبيق كاميرا الزعيم.');
    }

    const photosMeta = JSON.parse(await metaEntry.async('string'));
    const assetsEntry = zip.file('assets-data.json');
    const assetsData = assetsEntry ? JSON.parse(await assetsEntry.async('string')) : null;

    return { zip, manifest, photosMeta, assetsData };
  },

  async restoreFromInspected(inspected, replaceExisting = false) {
    const { zip, photosMeta, assetsData } = inspected;

    // التحقق المسبق من وجود الملفات قبل أي تعديل على قاعدة البيانات
    const preparedRecords = [];
    for (const meta of photosMeta) {
      const finalEntry = zip.file(`final/${meta.key}.jpg`);
      const rawEntry = zip.file(`raw/${meta.key}.jpg`);
      if (!finalEntry) continue;

      const finalBuffer = await finalEntry.async('arraybuffer');
      const finalBlob = new Blob([finalBuffer], { type: 'image/jpeg' });
      let rawBlob = finalBlob;

      if (rawEntry) {
        const rawBuffer = await rawEntry.async('arraybuffer');
        rawBlob = new Blob([rawBuffer], { type: 'image/jpeg' });
      }

      preparedRecords.push({
        name: meta.name,
        subInfo: meta.subInfo || '',
        rawBlob,
        finalBlob,
        assetSequence: meta.assetSequence || '',
        assetCode: meta.assetCode || '',
        assetName: meta.assetName || '',
        watermarkApplied: !!meta.watermarkApplied,
        qualityLevel: meta.qualityLevel || 'قصوى',
        createdAt: meta.createdAt || Date.now(),
        updatedAt: meta.updatedAt || Date.now()
      });
    }

    if (replaceExisting) {
      await StorageEngine.clearPhotos();
    }

    for (const rec of preparedRecords) {
      await StorageEngine.addPhoto(rec);
    }

    if (assetsData && assetsData.map) {
      await StorageEngine.putRecord('settings', {
        key: 'assetsData',
        map: assetsData.map,
        fileName: assetsData.fileName || 'نسخة مستعادة',
        showName: !!assetsData.showName
      });
      await AssetEngine.loadFromDB();
    }

    return preparedRecords.length;
  }
};
