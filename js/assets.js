import { StorageEngine } from './storage.js';

export const KNOWN_SUFFIXES = ['-1', '-2', '-3', '-أمام', '-خلف'];

export const AssetEngine = {
  map: Object.create(null),
  headers: [],
  fileName: '',
  showNameInWatermark: false,
  parsedRows: [],
  pendingFileName: '',
  updatedAt: null,

  hasLoaded() {
    return Object.keys(this.map).length > 0;
  },

  getCount() {
    return Object.keys(this.map).length;
  },

  getHeaders() {
    if (this.headers && this.headers.length > 0) return this.headers;
    const keys = Object.keys(this.map);
    if (keys.length > 0 && this.map[keys[0]].row) {
      return Object.keys(this.map[keys[0]].row);
    }
    return [];
  },

  async loadFromDB() {
    try {
      const res = await StorageEngine.getRecord('settings', 'assetsData');
      if (res && res.map) {
        const cleanMap = Object.create(null);
        for (const k of Object.keys(res.map)) {
          cleanMap[k] = res.map[k];
        }
        this.map = cleanMap;
        this.headers = Array.isArray(res.headers) ? res.headers : [];
        this.fileName = res.fileName || 'ملف أصول محفوظ';
        this.showNameInWatermark = !!res.showName;
        this.updatedAt = res.updatedAt || null;
      }
    } catch (e) {}
    return this.hasLoaded();
  },

  async saveToDB() {
    const plainMap = {};
    for (const k of Object.keys(this.map)) {
      plainMap[k] = this.map[k];
    }
    await StorageEngine.putRecord('settings', {
      key: 'assetsData',
      map: plainMap,
      headers: this.headers,
      fileName: this.fileName,
      showName: this.showNameInWatermark,
      updatedAt: this.updatedAt || Date.now()
    });
  },

  async clear() {
    this.map = Object.create(null);
    this.headers = [];
    this.fileName = '';
    this.pendingFileName = '';
    this.parsedRows = [];
    this.updatedAt = null;
    await this.saveToDB();
  },

  parseFile(file) {
    return new Promise((resolve, reject) => {
      this.pendingFileName = file.name;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

          if (!rows || rows.length === 0) {
            return reject(new Error('الملف فارغ أو لا يحتوي على بيانات.'));
          }

          this.parsedRows = rows;
          const headers = Object.keys(rows[0]);
          resolve({ headers, rowCount: rows.length });
        } catch (err) {
          reject(new Error('تعذر قراءة الملف. تأكد أنه بصيغة Excel (.xlsx) أو CSV.'));
        }
      };
      reader.onerror = () => reject(new Error('فشل قراءة الملف من الجهاز.'));
      reader.readAsArrayBuffer(file);
    });
  },

  buildAndValidate(seqCol, nameCol, codeCol, showName) {
    if (!seqCol) {
      throw new Error('يرجى تحديد عمود الرقم التسلسلي أولاً.');
    }
    const newMap = Object.create(null);
    let duplicatesCount = 0;
    let emptySeqRows = 0;

    for (const row of this.parsedRows) {
      const seqVal = String(row[seqCol] ?? '').trim();
      if (!seqVal) {
        emptySeqRows++;
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(newMap, seqVal)) {
        duplicatesCount++;
      }

      newMap[seqVal] = {
        name: String(row[nameCol] ?? '').trim(),
        code: String(row[codeCol] ?? '').trim(),
        row: { ...row }
      };
    }

    const total = Object.keys(newMap).length;
    if (total === 0) {
      throw new Error(`العمود المختار للتسلسل (${seqCol}) لا يحتوي على أي قيم صالحة!`);
    }

    return { newMap, total, duplicatesCount, emptySeqRows };
  },

  commitMap(newMap, showName) {
    this.map = newMap;
    if (this.parsedRows && this.parsedRows.length > 0) {
      this.headers = Object.keys(this.parsedRows[0]);
    }
    if (this.pendingFileName) {
      this.fileName = this.pendingFileName;
    }
    this.showNameInWatermark = !!showName;
    this.updatedAt = Date.now();
    return this.saveToDB();
  },

  lookup(rawText) {
    const clean = String(rawText || '').trim();
    if (!clean || !this.hasLoaded()) {
      return { found: null, baseSeq: clean, suffix: '' };
    }

    let baseSeq = clean;
    let matchedSuffix = '';
    for (const suffix of KNOWN_SUFFIXES) {
      if (baseSeq.endsWith(suffix)) {
        baseSeq = baseSeq.slice(0, -suffix.length).trim();
        matchedSuffix = suffix;
        break;
      }
    }

    const found = (Object.prototype.hasOwnProperty.call(this.map, clean) ? this.map[clean] : null)
               || (Object.prototype.hasOwnProperty.call(this.map, baseSeq) ? this.map[baseSeq] : null);
    return { found, baseSeq, suffix: matchedSuffix };
  }
};
