import React, { useState, useRef, useEffect } from 'react';
import { compressImageFile, blobToDataURL } from '../lib/imageCompressor';
import { Camera, Image as ImageIcon, Trash2, CheckCircle, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

interface PhotoCaptureProps {
  label: string;
  fieldId: string;
  currentUrl?: string;
  required?: boolean;
  onPhotoSelected: (fieldId: string, url: string) => void;
  onPhotoRemoved: (fieldId: string) => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({
  label,
  fieldId,
  currentUrl,
  required = true,
  onPhotoSelected,
  onPhotoRemoved,
}) => {
  const [compressing, setCompressing] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Sync with currentUrl if prop changes
  useEffect(() => {
    if (currentUrl) {
      setPreview(currentUrl);
    } else {
      setPreview(null);
    }
  }, [currentUrl]);

  // Process file from native camera or gallery with zero memory overhead
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setCompressing(true);

    try {
      // Compress with low-memory downscaling strictly to < 85KB
      const compressedBlob = await compressImageFile(file, 900, 85 * 1024);
      const dataUrl = await blobToDataURL(compressedBlob);

      setPreview(dataUrl);
      onPhotoSelected(fieldId, dataUrl);
    } catch (err: any) {
      console.error('Error processing photo:', err);
      setErrorMessage('Erro ao processar imagem: ' + (err.message || 'Falha na leitura do arquivo'));
    } finally {
      setCompressing(false);
      // Reset input value so user can re-capture immediately if desired
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setErrorMessage(null);
    onPhotoRemoved(fieldId);
  };

  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      preview 
        ? 'bg-emerald-50/40 border-emerald-300' 
        : required 
          ? 'bg-amber-50/30 border-amber-300' 
          : 'bg-white border-gray-200'
    } shadow-sm space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Camera className={`w-4 h-4 ${preview ? 'text-emerald-700' : 'text-[#3F3F3F]'}`} />
          <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">
            {label} {required && <span className="text-red-600 font-extrabold">*</span>}
          </label>
        </div>

        <div className="flex items-center gap-2">
          {preview ? (
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              Foto Anexada
            </span>
          ) : required ? (
            <span className="text-[11px] font-bold text-red-700 bg-red-100 border border-red-300 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-red-600" />
              Obrigatório
            </span>
          ) : null}
        </div>
      </div>

      <p className="text-[11px] text-gray-600 leading-relaxed">
        Fotografe o painel / resultado do <strong>teste de reflexo do motorista</strong> ou anexe uma foto da galeria para arquivamento no prontuário.
      </p>

      {/* Hidden Native File Inputs - Rock-solid for Mobile Android & iOS */}
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

      {/* Compression loader */}
      {compressing && (
        <div className="p-3.5 bg-white border border-gray-200 rounded-xl flex items-center justify-center gap-2.5 text-xs font-bold text-gray-700 shadow-sm animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin text-[#3F3F3F]" />
          <span>Comprimindo e salvando foto de forma otimizada (&lt;100KB)...</span>
        </div>
      )}

      {/* Error display */}
      {errorMessage && (
        <div className="p-2.5 bg-red-100 border border-red-300 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Preview Section if Photo Exists */}
      {preview && !compressing ? (
        <div className="space-y-3 pt-1">
          <div className="relative group rounded-xl overflow-hidden border-2 border-emerald-400 max-w-sm bg-gray-900 shadow-md">
            <img 
              src={preview} 
              alt="Evidência do Teste de Reflexo" 
              className="w-full h-52 object-cover" 
            />

            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="p-2 bg-black/80 hover:bg-black text-white rounded-lg shadow-lg transition-all active:scale-95 flex items-center gap-1 text-[11px] font-bold"
                title="Tirar outra foto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Trocar</span>
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-lg transition-all active:scale-95"
                title="Remover foto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="bg-black/85 text-lime-400 text-[10px] px-2.5 py-1 rounded-md flex items-center gap-1 font-bold border border-lime-400/40">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Foto pronta para arquivamento no Prontuário</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Camera className="w-3.5 h-3.5 text-lime-400" />
              Tirar Outra Foto (Câmera)
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="px-3.5 py-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <ImageIcon className="w-3.5 h-3.5 text-gray-600" />
              Escolher da Galeria
            </button>
          </div>
        </div>
      ) : !compressing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md pt-1">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center gap-3 p-4 bg-[#2B2B2B] hover:bg-[#1E1E1E] text-white rounded-xl transition-all shadow-md active:scale-95 border border-gray-700"
          >
            <div className="p-2 bg-white/10 rounded-lg">
              <Camera className="w-5 h-5 text-lime-400" />
            </div>
            <div className="text-left">
              <span className="text-xs font-bold block text-white">Tirar Foto (Câmera)</span>
              <span className="text-[10px] text-gray-300">Abrir câmera do celular</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center justify-center gap-3 p-4 bg-white hover:bg-gray-50 text-gray-800 rounded-xl transition-all shadow-sm active:scale-95 border-2 border-dashed border-gray-300 hover:border-gray-400"
          >
            <div className="p-2 bg-gray-100 rounded-lg">
              <ImageIcon className="w-5 h-5 text-gray-700" />
            </div>
            <div className="text-left">
              <span className="text-xs font-bold block text-gray-900">Anexar Galeria</span>
              <span className="text-[10px] text-gray-500">Escolher arquivo salvo</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
