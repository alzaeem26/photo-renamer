const DB_NAME = 'AlzaeemCameraDB_v2';
const DB_VERSION = 2;

export const StorageEngine = {
  db: null,

  async init() {
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch (e) {}
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('photos')) {
          database.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
        }
        if (!database.objectStoreNames.contains('assets')) {
          database.createObjectStore('assets', { keyPath: 'sequence' });
        }
        if (!database.objectStoreNames.contains('settings')) {
          database.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains('operations')) {
          database.createObjectStore('operations', { keyPath: 'id', autoIncrement: true });
        }
        if (!database.objectStoreNames.contains('metadata')) {
          database.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
          alert('تم تحديث بنية قاعدة البيانات في نافذة أخرى؛ يرجى إعادة تحميل الصفحة.');
        };
        this.putRecord('metadata', { key: 'schema', version: DB_VERSION, updatedAt: Date.now() }).catch(() => {});
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  },

  _tx(storeName, mode, operation) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('قاعدة البيانات غير مهيأة'));
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let resultData;

      const req = operation(store);
      if (req) {
        req.onsuccess = () => { resultData = req.result; };
        req.onerror = () => reject(req.error);
      }

      tx.oncomplete = () => resolve(resultData);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('تم إلغاء المعاملة وتراجع النظام لحماية البيانات'));
    });
  },

  addPhoto(photoRecord) {
    return this._tx('photos', 'readwrite', (store) => store.add(photoRecord));
  },

  updatePhoto(photoRecord) {
    return this._tx('photos', 'readwrite', (store) => store.put(photoRecord));
  },

  deletePhoto(id) {
    return this._tx('photos', 'readwrite', (store) => store.delete(id));
  },

  getAllPhotos() {
    return this._tx('photos', 'readonly', (store) => store.getAll());
  },

  clearPhotos() {
    return this._tx('photos', 'readwrite', (store) => store.clear());
  },

  replaceAllPhotosAtomic(records) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('قاعدة البيانات غير مهيأة'));
      const tx = this.db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');

      store.clear();
      for (const rec of records) {
        store.add(rec);
      }

      tx.oncomplete = () => resolve(records.length);
      tx.onerror = () => {
        try { tx.abort(); } catch (e) {}
        reject(tx.error || new Error('فشل الاستبدال الذرّي؛ تم الحفاظ على البيانات السابقة'));
      };
      tx.onabort = () => reject(tx.error || new Error('تم التراجع عن الاستبدال وحماية البيانات السابقة'));
    });
  },

  addPhotosBatchAtomic(records) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('قاعدة البيانات غير مهيأة'));
      if (!records || records.length === 0) return resolve(0);
      const tx = this.db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');

      for (const rec of records) {
        store.add(rec);
      }

      tx.oncomplete = () => resolve(records.length);
      tx.onerror = () => {
        try { tx.abort(); } catch (e) {}
        reject(tx.error || new Error('فشل الدمج الذرّي للصور'));
      };
      tx.onabort = () => reject(tx.error || new Error('تم التراجع عن الدمج'));
    });
  },

  putRecord(storeName, record) {
    return this._tx(storeName, 'readwrite', (store) => store.put(record));
  },

  getRecord(storeName, key) {
    return this._tx(storeName, 'readonly', (store) => store.get(key));
  },

  async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      return await navigator.storage.estimate();
    }
    return null;
  }
};