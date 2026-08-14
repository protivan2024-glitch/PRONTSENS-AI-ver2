/**
 * Ultra-safe, low-memory image compressor designed for mobile devices.
 * Prevents mobile browser out-of-memory crashes (Jetsam / RAM limit)
 * by avoiding raw base64 string duplication and using downscaled decoding.
 */

export async function compressImageFile(
  file: File | Blob,
  maxDimension = 900,
  maxSizeBytes = 85 * 1024 // ~85KB target (strictly < 100KB)
): Promise<Blob> {
  // Method 1: Use createImageBitmap with hardware downscaling if supported (modern Android / iOS 15+)
  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      const { width: origW, height: origH } = bitmap;
      
      let targetW = origW;
      let targetH = origH;

      if (targetW > maxDimension || targetH > maxDimension) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDimension) / targetW);
          targetW = maxDimension;
        } else {
          targetW = Math.round((targetW * maxDimension) / targetH);
          targetH = maxDimension;
        }
      }

      // Close the raw bitmap and get a downscaled bitmap directly
      bitmap.close();

      const resizedBitmap = await createImageBitmap(file, {
        resizeWidth: targetW,
        resizeHeight: targetH,
        resizeQuality: 'medium'
      });

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(resizedBitmap, 0, 0, targetW, targetH);
        resizedBitmap.close();

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, 'image/jpeg', 0.72);
        });

        // Release canvas dimensions
        canvas.width = 0;
        canvas.height = 0;

        if (blob && blob.size <= maxSizeBytes) {
          return blob;
        } else if (blob) {
          // If slightly above maxSizeBytes, fast second pass
          return await secondPassCompress(blob, 700, 0.65);
        }
      }
    } catch (e) {
      console.warn('createImageBitmap downscale fallback to ObjectURL:', e);
    }
  }

  // Method 2: Standard ObjectURL with memory cleanup
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Immediately revoke to free memory in browser
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas não disponível no dispositivo'));
        return;
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Clean image element
      img.src = '';

      canvas.toBlob(
        (blob) => {
          // Release canvas
          canvas.width = 0;
          canvas.height = 0;

          if (!blob) {
            reject(new Error('Falha ao comprimir imagem.'));
            return;
          }

          if (blob.size <= maxSizeBytes) {
            resolve(blob);
          } else {
            // Second pass
            secondPassCompress(blob, 700, 0.60).then(resolve).catch(reject);
          }
        },
        'image/jpeg',
        0.72
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível processar o arquivo da imagem.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Fast second pass if first pass was over limit
 */
async function secondPassCompress(blob: Blob, maxDim: number, quality: number): Promise<Blob> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
      }
      img.src = '';
      canvas.toBlob((finalBlob) => {
        canvas.width = 0;
        canvas.height = 0;
        resolve(finalBlob || blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    img.src = objectUrl;
  });
}

/**
 * Converts a small Blob (<100KB) to a base64 data URL
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
