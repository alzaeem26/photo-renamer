export const ImageEngine = {
  qualityLevels: [
    { label: 'قصوى', reqW: 4096, reqH: 3072, maxDim: 0, q: 0.92 },
    { label: 'عالية', reqW: 1920, reqH: 1080, maxDim: 1920, q: 0.85 },
    { label: 'متوسطة', reqW: 1280, reqH: 720, maxDim: 1280, q: 0.80 }
  ],

  captureVideoFrame(videoEl, workCanvas, qualitySetting) {
    let w = videoEl.videoWidth;
    let h = videoEl.videoHeight;

    if (qualitySetting.maxDim > 0 && Math.max(w, h) > qualitySetting.maxDim) {
      const ratio = qualitySetting.maxDim / Math.max(w, h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    workCanvas.width = w;
    workCanvas.height = h;
    const ctx = workCanvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);

    const isolatedRaw = document.createElement('canvas');
    isolatedRaw.width = w;
    isolatedRaw.height = h;
    isolatedRaw.getContext('2d').drawImage(workCanvas, 0, 0);
    return isolatedRaw;
  },

  canvasToBlob(sourceCanvas, quality = 0.92) {
    return new Promise((resolve, reject) => {
      sourceCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('فشل تحويل الصورة إلى Blob'));
      }, 'image/jpeg', quality);
    });
  },

  async createThumbnail(sourceCanvas, maxThumbDim = 160) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const ratio = maxThumbDim / Math.max(w, h);
    const tw = Math.max(1, Math.round(w * ratio));
    const th = Math.max(1, Math.round(h * ratio));

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw;
    thumbCanvas.height = th;
    thumbCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0, tw, th);

    return await this.canvasToBlob(thumbCanvas, 0.72);
  },

  blobToCanvas(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.naturalWidth;
        tempCanvas.height = img.naturalHeight;
        tempCanvas.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(tempCanvas);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  },

  revokeUrl(url) {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
};
