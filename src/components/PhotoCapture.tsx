import React, { useState, useRef } from 'react';
import { compressImageFile, blobToDataURL } from '../lib/imageCompressor';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { Camera, Image as ImageIcon, Trash2, CheckCircle, Loader2 } from 'lucide-react';

interface PhotoCaptureProps {
  label: string;
  fieldId: string;
  currentUrl?: string;
  onPhotoSelected: (fieldId: string, url: string) => void;
  onPhotoRemoved: (fieldId: string) => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  label,
  fieldId,
  currentUrl,
  onPhotoSelected,
  onPhotoRemoved,
}) => {
  const [compressing, setCompressing] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      // Compress strictly to < 100KB (max 95KB)
      const compressedBlob = await compressImageFile(file, 1080, 95 * 1024);
      const dataUrl = await blobToDataURL(compressedBlob);

      // Try uploading to Firebase Storage if available, fallback to compressed base64
      let finalUrl = dataUrl;
      try {
        const storagePath = `records/uploads/${fieldId}_${Date.now()}.jpg`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, compressedBlob);
        finalUrl = await getDownloadURL(storageRef);
      } catch (storageErr) {
        console.warn('Storage upload fallback to compressed base64 (<100KB):', storageErr);
        finalUrl = dataUrl;
      }

      setPreview(finalUrl);
      onPhotoSelected(fieldId, finalUrl);
    } catch (err: any) {
      console.error('Error compressing photo:', err);
      alert('Erro ao comprimir imagem para menos de 100KB: ' + (err.message || err));
    } finally {
      setCompressing(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onPhotoRemoved(fieldId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">{label}</label>
        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
          Compressão máx. 100KB
        </span>
      </div>

      {/* Hidden Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {preview ? (
        <div className="relative group rounded-xl overflow-hidden border border-gray-300 max-w-xs bg-gray-900 shadow-sm">
          <img src={preview} alt="Evidência" className="w-full h-44 object-cover" />
          
          {compressing && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-xs gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-lime-400" />
              <span>Comprimindo para menos de 100KB...</span>
            </div>
          )}

          {!compressing && (
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow transition-colors"
                title="Remover foto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="absolute bottom-2 left-2 bg-black/75 text-lime-400 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-semibold">
            <CheckCircle className="w-3 h-3" />
            <span>Foto Otimizada (&lt;100KB)</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-gray-300 hover:border-[#3F3F3F] bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-gray-700 active:scale-95"
          >
            <Camera className="w-5 h-5 text-[#3F3F3F] mb-1" />
            <span className="text-xs font-semibold">Tirar Foto</span>
          </button>

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-gray-300 hover:border-[#3F3F3F] bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-gray-700 active:scale-95"
          >
            <ImageIcon className="w-5 h-5 text-gray-500 mb-1" />
            <span className="text-xs font-semibold">Galeria</span>
          </button>
        </div>
      )}
    </div>
  );
};
