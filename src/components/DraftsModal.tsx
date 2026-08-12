import React from 'react';
import { DraftDoc } from '../types';
import { FileEdit, Play, Trash2, X, Clock, AlertTriangle } from 'lucide-react';

interface DraftsModalProps {
  isOpen: boolean;
  onClose: () => void;
  drafts: DraftDoc[];
  onResumeDraft: (draft: DraftDoc) => void;
  onDeleteDraft: (draftId: string) => void;
}

export const DraftsModal: React.FC<DraftsModalProps> = ({
  isOpen,
  onClose,
  drafts,
  onResumeDraft,
  onDeleteDraft,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="bg-[#3F3F3F] p-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-lime-400" />
            <h3 className="font-bold text-base">Atendimentos Pausados (Rascunhos)</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-300" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 divide-y divide-gray-100">
          {drafts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Clock className="w-10 h-10 mx-auto text-gray-300 mb-2" />
              Nenhum rascunho pausado no momento.
            </div>
          ) : (
            drafts.map((draft) => {
              const pausedDate = new Date(draft.pausedAt).toLocaleString('pt-BR');
              return (
                <div key={draft.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">
                      {draft.driverNamePreview || 'Motorista Não Informado'}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span>Etapa {draft.currentStep} de 4</span>
                      <span>•</span>
                      <span>Pausado em: {pausedDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onResumeDraft(draft)}
                      className="px-3 py-1.5 bg-[#A6CE39] hover:bg-[#95ba32] text-gray-900 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Retomar
                    </button>

                    <button
                      onClick={() => {
                        if (confirm('Deseja realmente descartar este rascunho? Esta ação não pode ser desfeita.')) {
                          onDeleteDraft(draft.id);
                        }
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Descartar rascunho"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-3 text-right border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-xs rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
