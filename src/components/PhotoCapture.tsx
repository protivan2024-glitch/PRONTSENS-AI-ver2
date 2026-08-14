import React, { useState, useRef, useEffect } from 'react';
import { compressImageFile, blobToDataURL } from '../lib/imageCompressor';
import { Camera, Image as ImageIcon, Trash2, CheckCircle, Loader2, RefreshCw, X, AlertCircle } from 'lucide-react';

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
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  // Clean up live stream on unmount or close
  const stopLiveCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsLiveCameraOpen(false);
    setCameraError(null);
  };

  useEffect(() => {
    return () => {
      stopLiveCamera();
    };
  }, []);

  // Start in-app live camera stream
  const startLiveCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setIsLiveCameraOpen(true);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Live camera permission or device error, falling back to native picker:', err);
      stopLiveCamera();
      // Fallback directly to native input
      cameraInputRef.current?.click();
    }
  };

  // Flip camera between front and back
  const handleFlipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startLiveCamera(nextMode);
  };

  // Capture frame from video element
  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;

    try {
      setCompressing(true);
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Falha no contexto do canvas.');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      stopLiveCamera();

      // Convert canvas to blob & compress to <95KB
      canvas.toBlob(async (blob) => {
        if (!blob) {
          alert('Erro ao capturar foto da câmera.');
          setCompressing(false);
          return;
        }

        try {
          const compressedBlob = await compressImageFile(blob, 1080, 90 * 1024);
          const dataUrl = await blobToDataURL(compressedBlob);

          setPreview(dataUrl);
          onPhotoSelected(fieldId, dataUrl);
        } catch (err: any) {
          console.error('Error compressing captured photo:', err);
          alert('Erro ao processar e comprimir foto.');
        } finally {
          setCompressing(false);
        }
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.error('Error capturing frame:', err);
      setCompressing(false);
    }
  };

  // Process file from native camera or gallery
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressing(true);
    try {
      // Compress strictly to < 95KB
      const compressedBlob = await compressImageFile(file, 1080, 90 * 1024);
      const dataUrl = await blobToDataURL(compressedBlob);

      setPreview(dataUrl);
      onPhotoSelected(fieldId, dataUrl);
    } catch (err: any) {
      console.error('Error compressing photo:', err);
      alert('Erro ao comprimir imagem para arquivo: ' + (err.message || err));
    } finally {
      setCompressing(false);
      // Reset input value so user can pick again if needed
      e.target.value = '';
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onPhotoRemoved(fieldId);
  };

  return (
    <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-[#3F3F3F]" />
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
            {label} {required && <span className="text-red-600 font-extrabold">*</span>}
          </label>
        </div>
        
        <div className="flex items-center gap-2">
          {required && (
            <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              Obrigatório
            </span>
          )}
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            Compressão &lt;100KB
          </span>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        Fotografe o resultado do teste de reflexo do motorista ou anexe da galeria. A imagem é comprimida automaticamente para arquivo permanente no prontuário.
      </p>

      {/* Hidden Native File Inputs */}
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

      {/* Live Camera Viewfinder Modal */}
      {isLiveCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-between p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg flex items-center justify-between text-white py-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <Camera className="w-4 h-4 text-lime-400" />
              Câmera - Teste de Reflexo
            </span>
            <button
              type="button"
              onClick={stopLiveCamera}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative w-full max-w-lg aspect-[4/3] bg-black rounded-2xl overflow-hidden border border-white/20 shadow-2xl flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="w-full h-full object-cover"
            />

            {/* Viewfinder crosshairs */}
            <div className="absolute inset-8 border border-white/30 rounded-xl pointer-events-none flex flex-col justify-between p-2">
              <div className="flex justify-between text-[10px] text-white/60 font-mono">
                <span>[ TESTE REFLEXO ]</span>
                <span>HSE</span>
              </div>
              <div className="text-center text-[10px] text-lime-400 font-semibold bg-black/50 py-1 rounded-md">
                Posicione o teste no centro e clique em Capturar
              </div>
            </div>

            {cameraError && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center text-white text-xs gap-3">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p>{cameraError}</p>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-4 py-2 bg-lime-500 text-gray-900 font-bold rounded-xl text-xs"
                >
                  Usar Câmera Nativa do Aparelho
                </button>
              </div>
            )}
          </div>

          <div className="w-full max-w-lg flex items-center justify-around py-4">
            <button
              type="button"
              onClick={handleFlipCamera}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors flex flex-col items-center gap-1"
              title="Alternar câmera frontal/traseira"
            >
              <RefreshCw className="w-5 h-5" />
              <span className="text-[9px] uppercase">Girar</span>
            </button>

            <button
              type="button"
              onClick={handleCaptureFrame}
              disabled={compressing}
              className="w-16 h-16 bg-lime-400 hover:bg-lime-300 text-gray-900 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform border-4 border-white"
              title="Capturar Foto"
            >
              <Camera className="w-7 h-7" />
            </button>

            <button
              type="button"
              onClick={() => {
                stopLiveCamera();
                galleryInputRef.current?.click();
              }}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors flex flex-col items-center gap-1"
              title="Abrir galeria"
            >
              <ImageIcon className="w-5 h-5" />
              <span className="text-[9px] uppercase">Galeria</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading state during compression */}
      {compressing && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-center gap-3 text-xs font-semibold text-gray-700">
          <Loader2 className="w-5 h-5 animate-spin text-[#3F3F3F]" />
          <span>Comprimindo e salvando evidência em formato leve (&lt;100KB)...</span>
        </div>
      )}

      {/* Captured Image Preview */}
      {preview && !compressing ? (
        <div className="space-y-2">
          <div className="relative group rounded-xl overflow-hidden border border-gray-300 max-w-sm bg-gray-900 shadow-md">
            <img src={preview} alt="Evidência do Teste de Reflexo" className="w-full h-48 object-cover" />
            
            <div className="absolute top-2 right-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => startLiveCamera()}
                className="p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-lg shadow transition-colors"
                title="Tirar outra foto"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow transition-colors"
                title="Remover foto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <div className="bg-black/80 text-lime-400 text-[10px] px-2.5 py-1 rounded-md flex items-center gap-1 font-bold border border-lime-400/30">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Foto Vinculada ao Prontuário</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => startLiveCamera()}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Camera className="w-3.5 h-3.5" />
              Substituir com Câmera
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Substituir da Galeria
            </button>
          </div>
        </div>
      ) : !compressing && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
          <button
            type="button"
            onClick={() => startLiveCamera()}
            className="flex items-center justify-center gap-2.5 p-3.5 border-2 border-dashed border-gray-300 hover:border-[#3F3F3F] bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-gray-800 font-bold active:scale-95 shadow-sm"
          >
            <Camera className="w-5 h-5 text-[#3F3F3F]" />
            <div className="text-left">
              <span className="text-xs font-bold block">Tirar Foto (Câmera)</span>
              <span className="text-[10px] text-gray-500 font-normal">Abrir câmera agora</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex items-center justify-center gap-2.5 p-3.5 border-2 border-dashed border-gray-300 hover:border-[#3F3F3F] bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-gray-800 font-bold active:scale-95 shadow-sm"
          >
            <ImageIcon className="w-5 h-5 text-gray-600" />
            <div className="text-left">
              <span className="text-xs font-bold block">Anexar Galeria</span>
              <span className="text-[10px] text-gray-500 font-normal">Escolher do dispositivo</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
