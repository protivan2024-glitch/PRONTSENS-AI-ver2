/**
 * Utility to compress image files from camera or gallery to under 100KB.
 * Ensures minimum cloud storage footprint while preserving visual clarity for reports.
 */
export async function compressImageFile(
  file: File | Blob, 
  maxDim = 1080, 
  maxSizeBytes = 95 * 1024 // Strict < 100KB threshold
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Scale down dimensions if exceeding max dimension
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        // Clean background for transparency / JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.82;
        let attempts = 0;

        const attemptCompression = (q: number, currentW: number, currentH: number) => {
          attempts++;
          canvas.width = currentW;
          canvas.height = currentH;
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, currentW, currentH);
          ctx.drawImage(img, 0, 0, currentW, currentH);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Falha na conversão da imagem'));
                return;
              }

              // If size is under threshold or minimum quality reached
              if (blob.size <= maxSizeBytes || attempts > 10) {
                resolve(blob);
              } else if (q > 0.35) {
                // Lower quality step
                attemptCompression(q - 0.12, currentW, currentH);
              } else {
                // If quality is already low, reduce resolution slightly
                const nextW = Math.round(currentW * 0.8);
                const nextH = Math.round(currentH * 0.8);
                attemptCompression(0.65, nextW, nextH);
              }
            },
            'image/jpeg',
            q
          );
        };

        attemptCompression(quality, width, height);
      };
      img.onerror = () => reject(new Error('Erro ao carregar a imagem para compressão'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo de imagem'));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a Blob to a base64 data URL
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
