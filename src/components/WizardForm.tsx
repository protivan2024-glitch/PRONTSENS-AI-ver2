import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { FormField, Collaborator, DraftDoc, RecordDoc, RecordStatus } from '../types';
import { PhotoCapture } from './PhotoCapture';
import { collection, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { 
  ChevronRight, ChevronLeft, PauseCircle, RefreshCw, PlusCircle, CheckCircle, 
  AlertCircle, Clock, Shield, Stethoscope, User, Lock, Pill
} from 'lucide-react';

interface WizardFormProps {
  fields: FormField[];
  collaborators: Collaborator[];
  currentUserEmail: string;
  currentUserUid: string;
  activeDraft: DraftDoc | null;
  onClearDraftContext: () => void;
  onRecordSubmitted: () => void;
  onOpenDraftsModal: () => void;
}

const LOCAL_DRAFT_KEY = 'prontosens_active_form_draft';

export const WizardForm: React.FC<WizardFormProps> = ({
  fields,
  collaborators,
  currentUserEmail,
  currentUserUid,
  activeDraft,
  onClearDraftContext,
  onRecordSubmitted,
  onOpenDraftsModal,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const prevStepRef = useRef<number>(1);
  const formTopRef = useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [hasRestoredLocalCache, setHasRestoredLocalCache] = useState(false);

  // Medication modal state
  const [showMedicationModal, setShowMedicationModal] = useState(false);
  const [medicationName, setMedicationName] = useState('');

  // Form submission state
  const [submitting, setSubmitting] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or restore draft (from cloud activeDraft or from localStorage)
  useEffect(() => {
    if (activeDraft) {
      setAnswers(activeDraft.answers || {});
      setCurrentStep(activeDraft.currentStep || 1);
      const photoMap: Record<string, string> = {};
      (activeDraft.photoRefs || []).forEach(p => {
        photoMap[p.fieldId] = p.storagePathOrUrl;
      });
      if (activeDraft.answers && activeDraft.answers['f_foto_reflexo']) {
        photoMap['f_foto_reflexo'] = String(activeDraft.answers['f_foto_reflexo']);
      }
      setPhotoUrls(photoMap);
      if (activeDraft.answers['f_medicamento_nome']) {
        setMedicationName(String(activeDraft.answers['f_medicamento_nome']));
      }
    } else {
      // Check if there is a cached unsubmitted session in localStorage to recover from memory crash
      try {
        const cachedRaw = localStorage.getItem(LOCAL_DRAFT_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw);
          if (cached && cached.answers && Object.keys(cached.answers).length > 0) {
            setAnswers(cached.answers);
            setCurrentStep(cached.currentStep || 1);
            setPhotoUrls(cached.photoUrls || {});
            if (cached.medicationName) setMedicationName(cached.medicationName);
            setHasRestoredLocalCache(true);
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to read local draft cache:', e);
      }

      // Set initial defaults if clean start
      const now = new Date();
      const dateFormatted = now.toISOString().slice(0, 10);
      const timeFormatted = now.toTimeString().slice(0, 5);

      setAnswers((prev) => ({
        ...prev,
        f_datetime: prev.f_datetime || `${dateFormatted}T${timeFormatted}`,
        f_time_start: prev.f_time_start || timeFormatted,
        f_ciclo_escala: prev.f_ciclo_escala || '1º DIA DE ESCALA',
        f_hora_escala: prev.f_hora_escala || timeFormatted,
      }));
    }
  }, [activeDraft]);

  // Persist form state automatically into local cache so it survives accidental refresh / memory kill
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      try {
        localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({
          answers,
          photoUrls,
          currentStep,
          medicationName,
          updatedAt: Date.now()
        }));
      } catch (e) {
        // LocalStorage quota safety
      }
    }
  }, [answers, photoUrls, currentStep, medicationName]);

  // Handle field change helper
  const updateAnswer = (fieldId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  };

  // Motorista formatting & cleaning
  const handleMotoristaChange = (val: string) => {
    // Upper case + A-Z + Spaces only
    const uppercaseVal = val.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, '');
    updateAnswer('f_motorista', uppercaseVal);
  };

  const handleMotoristaBlur = () => {
    const raw = answers['f_motorista'] || '';
    // Trim leading and trailing spaces, preserve single spaces inside
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    updateAnswer('f_motorista', trimmed);
  };

  // Mask helpers
  const handleTempChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 3);
    let masked = digits;
    if (digits.length >= 3) {
      masked = `${digits.slice(0, 2)}.${digits.slice(2)}`;
    } else if (digits.length === 2) {
      masked = `${digits}.`;
    }
    updateAnswer('f_temp', masked);

    // Auto temperature level check
    const num = parseFloat(masked);
    if (!isNaN(num)) {
      if (num >= 37.8) {
        updateAnswer('f_nivel_temp', 'FEBRIL');
      } else {
        updateAnswer('f_nivel_temp', 'NORMAL');
      }
    }
  };

  const handlePressaoChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 5);
    let masked = digits;
    if (digits.length > 3) {
      masked = `${digits.slice(0, 3)}/${digits.slice(3)}`;
    }
    updateAnswer('f_pressao', masked);
  };

  // Duration calculation
  const startT = answers['f_time_start'];
  const endT = answers['f_time_end'];
  let durationStr = '---';
  let durationMinutes = 0;

  if (startT && endT && startT.includes(':') && endT.includes(':')) {
    const [sh, sm] = startT.split(':').map(Number);
    const [eh, em] = endT.split(':').map(Number);
    let diffMs = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMs < 0) diffMs += 24 * 60; // Handle midnight crossover
    durationMinutes = diffMs;
    if (diffMs >= 60) {
      const hrs = Math.floor(diffMs / 60);
      const mins = diffMs % 60;
      durationStr = `${hrs}h ${mins}min`;
    } else {
      durationStr = `${diffMs} minutos`;
    }
  }

  // Step validation
  const validateStep = (step: number): boolean => {
    setErrorMsg(null);

    if (step === 1) {
      if (!answers['f_sala']) {
        setErrorMsg('Selecione o endereço da sala de estimulação.');
        return false;
      }
      if (!answers['f_empresa']) {
        setErrorMsg('Selecione a Empresa.');
        return false;
      }
      if (answers['f_empresa'] === 'OUTROS' && !answers['f_empresa_outro']?.trim()) {
        setErrorMsg('Digite o nome da empresa.');
        return false;
      }
      if (!answers['f_empresa_sub']) {
        setErrorMsg('Selecione a Empresa sub-contratada.');
        return false;
      }
      if (answers['f_empresa_sub'] === 'OUTROS' && !answers['f_empresa_sub_outro']?.trim()) {
        setErrorMsg('Digite o nome da empresa subcontratada.');
        return false;
      }
      if (!answers['f_datetime']) {
        setErrorMsg('Informe a Data e hora do atendimento.');
        return false;
      }
      if (!answers['f_time_start']) {
        setErrorMsg('Informe o Horário de início do atendimento.');
        return false;
      }
      const motName = (answers['f_motorista'] || '').trim();
      if (!motName || motName.split(' ').filter(Boolean).length < 2) {
        setErrorMsg('Informe o nome completo do motorista (nome e sobrenome).');
        return false;
      }
      if (!answers['f_ciclo_escala']) {
        setErrorMsg('Selecione o Ciclo da escala do motorista.');
        return false;
      }
      if (!answers['f_hora_escala']) {
        setErrorMsg('Informe a Hora escala.');
        return false;
      }
    }

    if (step === 2) {
      if (!answers['f_temp']) {
        setErrorMsg('Informe a Temperatura aferida.');
        return false;
      }
      if (!answers['f_nivel_temp']) {
        setErrorMsg('Selecione o Nível de temperatura.');
        return false;
      }
      if (!answers['f_fadiga']) {
        setErrorMsg('Selecione o Nível de fadiga.');
        return false;
      }
      if (!answers['f_percepcao']) {
        setErrorMsg('Selecione o Teste de percepção.');
        return false;
      }
      if (!answers['f_pressao']) {
        setErrorMsg('Informe a Pressão arterial.');
        return false;
      }
      if (!answers['f_nivel_pressao']) {
        setErrorMsg('Selecione o Nível de pressão.');
        return false;
      }
      if (!answers['f_medicamento']) {
        setErrorMsg('Responda se faz uso de medicamento.');
        return false;
      }
      if (answers['f_medicamento'] === 'Sim' && !answers['f_medicamento_nome']?.trim()) {
        setShowMedicationModal(true);
        setErrorMsg('Informe o nome do(s) medicamento(s).');
        return false;
      }
    }

    if (step === 3) {
      const statusLib = answers['f_status_liberacao'];
      if (!statusLib) {
        setErrorMsg('Selecione o Status de liberação.');
        return false;
      }
      if (statusLib === 'BLOQUEADO PARA ATIVIDADE') {
        if (!answers['f_categoria_bloqueio']) {
          setErrorMsg('Selecione a Categoria do Bloqueio.');
          return false;
        }
        if (!answers['f_motivo_bloqueio']?.trim()) {
          setErrorMsg('Informe o Motivo do bloqueio.');
          return false;
        }
      } else if (statusLib === 'LIBERADO COM OBSERVAÇÃO') {
        if (!answers['f_motivo_observacao']?.trim()) {
          setErrorMsg('Informe o Motivo/Observação da liberação.');
          return false;
        }
      }
    }

    if (step === 4) {
      const reflexoPhoto = photoUrls['f_foto_reflexo'] || answers['f_foto_reflexo'];
      if (!reflexoPhoto) {
        setErrorMsg('A foto do teste de reflexo do motorista é obrigatória para finalizar o prontuário.');
        return false;
      }
      if (!answers['f_time_end']) {
        setErrorMsg('Informe o Horário final do atendimento.');
        return false;
      }
      if (!answers['f_avaliador']) {
        setErrorMsg('Selecione o Avaliador responsável.');
        return false;
      }
      if (!answers['f_declaracao']) {
        setErrorMsg('Confirme a declaração de conformidade técnica.');
        return false;
      }
    }

    return true;
  };

  const scrollToTop = () => {
    // 1. Direct window scroll to top
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
    // 2. Document element / body scroll reset (for mobile browsers / iframe wrappers)
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
    // 3. Scroll container ref into view
    if (formTopRef.current) {
      formTopRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  };

  // Scroll to top automatically when advancing step
  useLayoutEffect(() => {
    if (currentStep > prevStepRef.current) {
      scrollToTop();
      // Second tick after layout mount to guarantee 0 scroll on mobile rendering
      requestAnimationFrame(() => {
        scrollToTop();
      });
    }
    prevStepRef.current = currentStep;
  }, [currentStep]);

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      scrollToTop();
      setCurrentStep((prev) => Math.min(prev + 1, 4));
      requestAnimationFrame(() => {
        scrollToTop();
      });
    }
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Pause & Save Draft
  const handlePauseDraft = async () => {
    setPausing(true);
    try {
      const reflexoPhoto = photoUrls['f_foto_reflexo'] || answers['f_foto_reflexo'] || '';
      const updatedAnswers = {
        ...answers,
        f_foto_reflexo: reflexoPhoto
      };

      const photoRefsArray = Object.entries(photoUrls)
        .filter(([_, url]) => !!url)
        .map(([fieldId, storagePathOrUrl]) => ({
          fieldId,
          storagePathOrUrl: String(storagePathOrUrl)
        }));

      if (reflexoPhoto && !photoRefsArray.some(p => p.fieldId === 'f_foto_reflexo')) {
        photoRefsArray.push({
          fieldId: 'f_foto_reflexo',
          storagePathOrUrl: reflexoPhoto
        });
      }

      const draftData: Partial<DraftDoc> = {
        ownerUid: currentUserUid,
        answers: updatedAnswers,
        photoRefs: photoRefsArray,
        currentStep: currentStep,
        driverNamePreview: answers['f_motorista'] || 'Motorista em Atendimento',
        pausedAt: Date.now(),
        startedAt: activeDraft?.startedAt || Date.now()
      };

      if (activeDraft?.id) {
        await updateDoc(doc(db, 'drafts', activeDraft.id), draftData);
      } else {
        await addDoc(collection(db, 'drafts'), draftData);
      }

      alert('Atendimento pausado com sucesso! Salvo na lista de rascunhos.');
      handleNewBlankForm();
      onRecordSubmitted();
    } catch (err) {
      console.error('Error saving draft:', err);
      alert('Erro ao salvar rascunho.');
    } finally {
      setPausing(false);
    }
  };

  // Clear current form
  const handleClearForm = () => {
    if (confirm('Deseja realmente limpar todos os campos deste formulário?')) {
      localStorage.removeItem(LOCAL_DRAFT_KEY);
      setAnswers({});
      setPhotoUrls({});
      setCurrentStep(1);
      setErrorMsg(null);
      setHasRestoredLocalCache(false);
    }
  };

  // New Blank Form
  const handleNewBlankForm = () => {
    localStorage.removeItem(LOCAL_DRAFT_KEY);
    setAnswers({});
    setPhotoUrls({});
    setCurrentStep(1);
    setErrorMsg(null);
    setHasRestoredLocalCache(false);
    onClearDraftContext();
  };

  // Final Submit
  const handleSubmitRecord = async () => {
    if (!validateStep(4)) return;

    setSubmitting(true);
    try {
      // Resolve evaluator snapshot
      const collabId = answers['f_avaliador'];
      const selectedCollab = collaborators.find(c => c.id === collabId);
      const collabNameSnapshot = selectedCollab ? selectedCollab.fullName : 'AVALIADOR DESCONHECIDO';

      // Determine HSE status
      let hseStatus: RecordStatus = 'Conforme';
      const statusLib = answers['f_status_liberacao'];
      const nivelTemp = answers['f_nivel_temp'];
      const nivelPressao = answers['f_nivel_pressao'];

      if (statusLib === 'BLOQUEADO PARA ATIVIDADE') {
        hseStatus = 'Crítico';
      } else if (statusLib === 'LIBERADO COM OBSERVAÇÃO' || nivelTemp === 'FEBRIL' || nivelPressao === 'ALTA' || nivelPressao === 'BAIXA') {
        hseStatus = 'Alerta';
      }

      // Photos array and answers sync
      const reflexoPhoto = photoUrls['f_foto_reflexo'] || answers['f_foto_reflexo'] || '';
      const finalAnswers = {
        ...answers,
        f_foto_reflexo: reflexoPhoto
      };

      const photosArray = Object.entries(photoUrls)
        .filter(([_, url]) => !!url)
        .map(([fieldId, url]) => ({
          fieldId,
          url: String(url),
          caption: 'Foto do teste de reflexo'
        }));

      if (reflexoPhoto && !photosArray.some(p => p.fieldId === 'f_foto_reflexo')) {
        photosArray.push({
          fieldId: 'f_foto_reflexo',
          url: String(reflexoPhoto),
          caption: 'Foto do teste de reflexo'
        });
      }

      const newRecordDoc: Partial<RecordDoc> = {
        answers: finalAnswers,
        photos: photosArray,
        collaboratorId: collabId,
        collaboratorNameSnapshot: collabNameSnapshot,
        status: hseStatus,
        startTime: Date.now(),
        endTime: Date.now(),
        durationMinutes: durationMinutes,
        submittedBy: currentUserEmail,
        submittedByUid: currentUserUid,
        createdAt: Date.now()
      };

      await addDoc(collection(db, 'records'), newRecordDoc);

      // Clear local storage cache
      localStorage.removeItem(LOCAL_DRAFT_KEY);

      // If came from a draft, delete draft
      if (activeDraft?.id) {
        await deleteDoc(doc(db, 'drafts', activeDraft.id));
      }

      alert('Prontuário enviado com sucesso!');
      handleNewBlankForm();
      onRecordSubmitted();
    } catch (err) {
      console.error('Error submitting record:', err);
      alert('Erro ao enviar prontuário. Verifique sua conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  // Active collaborators list for evaluator dropdown
  const activeCollaborators = collaborators.filter(c => c.active);

  return (
    <div ref={formTopRef} className="max-w-4xl mx-auto px-4 py-6">
      
      {/* Restored Cache Alert Banner */}
      {hasRestoredLocalCache && !activeDraft && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Rascunho em andamento restaurado automaticamente da sessão anterior (proteção anti-perda).</span>
          </div>
          <button
            type="button"
            onClick={handleNewBlankForm}
            className="px-2.5 py-1 bg-white border border-blue-300 hover:bg-blue-100 text-blue-800 font-bold rounded-lg text-[11px] shrink-0"
          >
            Iniciar do Zero
          </button>
        </div>
      )}

      {/* Top Wizard Steps Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-6">
        <div className="grid grid-cols-4 gap-2 text-center">
          
          <button
            onClick={() => setCurrentStep(1)}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              currentStep === 1 ? 'bg-[#3F3F3F] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <User className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-bold uppercase tracking-wider">1. Identificação</span>
          </button>

          <button
            onClick={() => validateStep(1) && setCurrentStep(2)}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              currentStep === 2 ? 'bg-[#3F3F3F] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Stethoscope className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-bold uppercase tracking-wider">2. Estimulação</span>
          </button>

          <button
            onClick={() => validateStep(1) && validateStep(2) && setCurrentStep(3)}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              currentStep === 3 ? 'bg-[#3F3F3F] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Shield className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-bold uppercase tracking-wider">3. Segurança</span>
          </button>

          <button
            onClick={() => validateStep(1) && validateStep(2) && validateStep(3) && setCurrentStep(4)}
            className={`flex flex-col items-center p-2 rounded-xl transition-colors ${
              currentStep === 4 ? 'bg-[#3F3F3F] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <CheckCircle className="w-5 h-5 mb-1" />
            <span className="text-[11px] font-bold uppercase tracking-wider">4. Parecer</span>
          </button>

        </div>
      </div>

      {/* Form Card Container */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
        
        {/* Step Banner */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-lime-600 uppercase tracking-widest">Etapa {currentStep} de 4</span>
            <h2 className="text-lg font-bold text-gray-800">
              {currentStep === 1 && 'Identificação Geral do Atendimento'}
              {currentStep === 2 && 'Estimulação & Resposta Clínica'}
              {currentStep === 3 && 'Segurança e Inspeção HSE'}
              {currentStep === 4 && 'Parecer Técnico & Fechamento'}
            </h2>
          </div>

          {/* Duration Badge preview */}
          {durationStr !== '---' && (
            <div className="bg-gray-200 text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-lime-600" />
              <span>Duração: {durationStr}</span>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="p-6 space-y-6">

          {/* ================= ETAPA 1 ================= */}
          {currentStep === 1 && (
            <div className="space-y-6">
              
              {/* 1. Endereço da Sala */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  1. Endereço da sala de estimulação *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['CMPC - BUTIÁ - RS', 'CMPC - CACHOEIRA - RS'].map((sala) => (
                    <label
                      key={sala}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        answers['f_sala'] === sala
                          ? 'border-[#3F3F3F] bg-gray-50 ring-2 ring-[#3F3F3F]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="f_sala"
                        value={sala}
                        checked={answers['f_sala'] === sala}
                        onChange={(e) => updateAnswer('f_sala', e.target.value)}
                        className="accent-[#3F3F3F] w-4 h-4"
                      />
                      <span className="text-sm font-semibold text-gray-800">{sala}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 2. Empresa */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  2. Empresa *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {['JSL S/A', 'RIO DO SUL', 'REITER LOG', 'HAMMES', 'OUTROS'].map((emp) => (
                    <label
                      key={emp}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                        answers['f_empresa'] === emp
                          ? 'border-[#3F3F3F] bg-gray-50 ring-2 ring-[#3F3F3F]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="f_empresa"
                        value={emp}
                        checked={answers['f_empresa'] === emp}
                        onChange={(e) => updateAnswer('f_empresa', e.target.value)}
                        className="accent-[#3F3F3F] w-4 h-4"
                      />
                      <span className="text-xs font-semibold text-gray-800">{emp}</span>
                    </label>
                  ))}
                </div>

                {/* Conditional Text Field for Empresa Outros */}
                {answers['f_empresa'] === 'OUTROS' && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Especifique o nome da empresa *
                    </label>
                    <input
                      type="text"
                      value={answers['f_empresa_outro'] || ''}
                      onChange={(e) => updateAnswer('f_empresa_outro', e.target.value)}
                      placeholder="Digite o nome da empresa"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 3. Empresa Sub-contratada */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  3. Empresa sub-contratada *
                </label>
                <p className="text-[11px] text-gray-500 mb-2">
                  Para os casos de empresas agregadas, informar o nome da empresa. Para a própria empresa, informar 'próprio'.
                </p>
                <select
                  value={answers['f_empresa_sub'] || ''}
                  onChange={(e) => updateAnswer('f_empresa_sub', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                >
                  <option value="">-- Selecione a empresa subcontratada --</option>
                  <option value="PRÓPRIO - JSL">PRÓPRIO - JSL</option>
                  <option value="PRÓPRIO - RIO DO SUL">PRÓPRIO - RIO DO SUL</option>
                  <option value="SUBCONTRATADO - JSL">SUBCONTRATADO - JSL</option>
                  <option value="SUBCONTRATADO - RIO DO SUL">SUBCONTRATADO - RIO DO SUL</option>
                  <option value="PRÓPRIO - HAMMES">PRÓPRIO - HAMMES</option>
                  <option value="PRÓPRIO - REITER LOG">PRÓPRIO - REITER LOG</option>
                  <option value="OUTROS">OUTROS</option>
                </select>

                {/* Conditional Text Field for Empresa Sub Outros */}
                {answers['f_empresa_sub'] === 'OUTROS' && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Especifique a empresa subcontratada *
                    </label>
                    <input
                      type="text"
                      value={answers['f_empresa_sub_outro'] || ''}
                      onChange={(e) => updateAnswer('f_empresa_sub_outro', e.target.value)}
                      placeholder="Digite o nome da empresa subcontratada"
                      className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 4 & 5. Data/Hora e Horário Início */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    4. Data e hora do atendimento *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={answers['f_datetime'] || ''}
                      onChange={(e) => updateAnswer('f_datetime', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        updateAnswer('f_datetime', `${now.toISOString().slice(0, 10)}T${now.toTimeString().slice(0, 5)}`);
                      }}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors"
                    >
                      Agora
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    5. Horário de início *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={answers['f_time_start'] || ''}
                      onChange={(e) => updateAnswer('f_time_start', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        updateAnswer('f_time_start', now.toTimeString().slice(0, 5));
                      }}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors"
                    >
                      Agora
                    </button>
                  </div>
                </div>
              </div>

              {/* 7. Nome do Motorista */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  7. Nome do motorista *
                </label>
                <input
                  type="text"
                  value={answers['f_motorista'] || ''}
                  onChange={(e) => handleMotoristaChange(e.target.value)}
                  onBlur={handleMotoristaBlur}
                  placeholder="EX: CARLOS EDUARDO SILVA"
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none font-semibold uppercase tracking-wide"
                />
                <p className="text-[11px] text-red-600 mt-1 font-medium">
                  O nome do motorista deve ser escrito sem abreviação e sem acentuação.
                </p>
              </div>

              {/* 8 & 9. Ciclo e Hora Escala */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    8. Ciclo da escala do motorista *
                  </label>
                  <select
                    value={answers['f_ciclo_escala'] || '1º DIA DE ESCALA'}
                    onChange={(e) => updateAnswer('f_ciclo_escala', e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none font-medium"
                  >
                    {['1º DIA DE ESCALA', '2º DIA DE ESCALA', '3º DIA DE ESCALA', '4º DIA DE ESCALA', '5º DIA DE ESCALA', '6º DIA DE ESCALA'].map(ciclo => (
                      <option key={ciclo} value={ciclo}>{ciclo}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    9. Hora escala *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={answers['f_hora_escala'] || ''}
                      onChange={(e) => updateAnswer('f_hora_escala', e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        updateAnswer('f_hora_escala', now.toTimeString().slice(0, 5));
                      }}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors"
                    >
                      Agora
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ================= ETAPA 2 ================= */}
          {currentStep === 2 && (
            <div className="space-y-6">
              
              {/* 10 & 11. Temperatura */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    10. Temperatura aferida (ºC) *
                  </label>
                  <input
                    type="text"
                    value={answers['f_temp'] || ''}
                    onChange={(e) => handleTempChange(e.target.value)}
                    placeholder="36.5"
                    maxLength={4}
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    11. Nível de temperatura *
                  </label>
                  <div className="flex gap-3">
                    {['NORMAL', 'FEBRIL'].map((nv) => (
                      <label
                        key={nv}
                        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer font-bold text-xs transition-all ${
                          answers['f_nivel_temp'] === nv
                            ? nv === 'FEBRIL' ? 'bg-red-500 text-white border-red-600' : 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="f_nivel_temp"
                          value={nv}
                          checked={answers['f_nivel_temp'] === nv}
                          onChange={(e) => updateAnswer('f_nivel_temp', e.target.value)}
                          className="hidden"
                        />
                        <span>{nv}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 12. Nível de Fadiga */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  12. Nível de fadiga *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {['NADA CANSADO', 'POUCO CANSADO', 'MODERADAMENTE CANSADO', 'MUITO CANSADO', 'EXTREMAMENTE CANSADO'].map((fadiga) => (
                    <label
                      key={fadiga}
                      className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer text-xs font-semibold transition-all ${
                        answers['f_fadiga'] === fadiga
                          ? 'border-[#3F3F3F] bg-gray-800 text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="f_fadiga"
                        value={fadiga}
                        checked={answers['f_fadiga'] === fadiga}
                        onChange={(e) => updateAnswer('f_fadiga', e.target.value)}
                        className="accent-lime-400 w-4 h-4"
                      />
                      <span>{fadiga}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 13. Teste de Percepção */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  13. Teste de percepção *
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {['1º MOMENTO', '2º MOMENTO', '3º MOMENTO'].map((momento) => (
                    <label
                      key={momento}
                      className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer text-xs font-bold transition-all ${
                        answers['f_percepcao'] === momento
                          ? 'border-[#3F3F3F] bg-[#3F3F3F] text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="f_percepcao"
                        value={momento}
                        checked={answers['f_percepcao'] === momento}
                        onChange={(e) => updateAnswer('f_percepcao', e.target.value)}
                        className="hidden"
                      />
                      <span>{momento}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 14 & 15. Pressão Arterial */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    14. Pressão arterial (mmHg) *
                  </label>
                  <input
                    type="text"
                    value={answers['f_pressao'] || ''}
                    onChange={(e) => handlePressaoChange(e.target.value)}
                    placeholder="120/80"
                    maxLength={6}
                    className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    15. Nível de pressão *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['BAIXA', 'NORMAL', 'ALTA'].map((np) => (
                      <label
                        key={np}
                        className={`flex items-center justify-center p-2.5 rounded-xl border cursor-pointer font-bold text-xs transition-all ${
                          answers['f_nivel_pressao'] === np
                            ? np === 'NORMAL' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="f_nivel_pressao"
                          value={np}
                          checked={answers['f_nivel_pressao'] === np}
                          onChange={(e) => updateAnswer('f_nivel_pressao', e.target.value)}
                          className="hidden"
                        />
                        <span>{np}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* 16. Faz uso de medicamento? */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  16. Faz uso de medicamento? *
                </label>
                <div className="grid grid-cols-2 gap-3 max-w-xs">
                  {['Sim', 'Não'].map((opt) => (
                    <label
                      key={opt}
                      className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer font-bold text-sm transition-all ${
                        answers['f_medicamento'] === opt
                          ? 'border-[#3F3F3F] bg-[#3F3F3F] text-white'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="f_medicamento"
                        value={opt}
                        checked={answers['f_medicamento'] === opt}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateAnswer('f_medicamento', val);
                          if (val === 'Sim') {
                            setShowMedicationModal(true);
                          } else {
                            updateAnswer('f_medicamento_nome', '');
                            setMedicationName('');
                          }
                        }}
                        className="hidden"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>

                {answers['f_medicamento'] === 'Sim' && answers['f_medicamento_nome'] && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                    <span><strong>Medicamento(s):</strong> {answers['f_medicamento_nome']}</span>
                    <button
                      type="button"
                      onClick={() => setShowMedicationModal(true)}
                      className="text-blue-700 underline font-bold"
                    >
                      Alterar
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ================= ETAPA 3 ================= */}
          {currentStep === 3 && (
            <div className="space-y-6">
              
              {/* 17. Status de Liberação */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  17. Status de liberação *
                </label>
                <p className="text-[11px] text-gray-500 mb-3">
                  Inserir neste campo, se após medições, o colaborador foi bloqueado ou não.
                </p>

                <div className="space-y-3">
                  {[
                    { id: 'LIBERADO PARA ATIVIDADE', label: 'LIBERADO PARA ATIVIDADE', color: 'border-emerald-500 bg-emerald-50 text-emerald-900' },
                    { id: 'BLOQUEADO PARA ATIVIDADE', label: 'BLOQUEADO PARA ATIVIDADE', color: 'border-red-500 bg-red-50 text-red-900' },
                    { id: 'LIBERADO COM OBSERVAÇÃO', label: 'LIBERADO COM OBSERVAÇÃO', color: 'border-amber-500 bg-amber-50 text-amber-900' },
                  ].map((st) => (
                    <label
                      key={st.id}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        answers['f_status_liberacao'] === st.id
                          ? `${st.color} ring-2 ring-current/20 shadow-sm`
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="f_status_liberacao"
                        value={st.id}
                        checked={answers['f_status_liberacao'] === st.id}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateAnswer('f_status_liberacao', val);
                          if (val === 'LIBERADO PARA ATIVIDADE') {
                            updateAnswer('f_categoria_bloqueio', '');
                            updateAnswer('f_motivo_bloqueio', '');
                            updateAnswer('f_motivo_observacao', '');
                          }
                        }}
                        className="accent-[#3F3F3F] w-4 h-4"
                      />
                      <span className="font-bold text-sm">{st.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Conditional Block Fields */}
              {answers['f_status_liberacao'] === 'BLOQUEADO PARA ATIVIDADE' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-4">
                  <h4 className="font-bold text-xs text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-red-600" /> Detalhes do Bloqueio Ocupacional
                  </h4>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Categoria do Bloqueio *
                    </label>
                    <select
                      value={answers['f_categoria_bloqueio'] || ''}
                      onChange={(e) => updateAnswer('f_categoria_bloqueio', e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    >
                      <option value="">-- Selecione a categoria do bloqueio --</option>
                      <option value="Fadiga/Sonolência">Fadiga/Sonolência</option>
                      <option value="Pressão Arterial">Pressão Arterial</option>
                      <option value="Febril">Febril</option>
                      <option value="Embriaguez/Alteração por Substância">Embriaguez/Alteração por Substância</option>
                      <option value="Emocional">Emocional</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Motivo detalhado do bloqueio *
                    </label>
                    <textarea
                      value={answers['f_motivo_bloqueio'] || ''}
                      onChange={(e) => updateAnswer('f_motivo_bloqueio', e.target.value)}
                      rows={3}
                      placeholder="Descreva o motivo que impossibilitou a liberação para a atividade..."
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Conditional Observação Field */}
              {answers['f_status_liberacao'] === 'LIBERADO COM OBSERVAÇÃO' && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                  <label className="block text-xs font-bold text-amber-900 uppercase tracking-wider mb-1">
                    Motivo / Observação para liberação *
                  </label>
                  <textarea
                    value={answers['f_motivo_observacao'] || ''}
                    onChange={(e) => updateAnswer('f_motivo_observacao', e.target.value)}
                    rows={3}
                    placeholder="Descreva as recomendações ou ressalvas da liberação..."
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              )}

            </div>
          )}

          {/* ================= ETAPA 4 ================= */}
          {currentStep === 4 && (
            <div className="space-y-6">
              
              {/* 18. Foto do Teste de Reflexo */}
              <PhotoCapture
                label="18. Foto do teste de reflexo do motorista (Evidência)"
                fieldId="f_foto_reflexo"
                required={true}
                currentUrl={photoUrls['f_foto_reflexo'] || answers['f_foto_reflexo']}
                onPhotoSelected={(fid, url) => {
                  setPhotoUrls(prev => ({ ...prev, [fid]: url }));
                  updateAnswer(fid, url);
                }}
                onPhotoRemoved={(fid) => {
                  setPhotoUrls(prev => {
                    const copy = { ...prev };
                    delete copy[fid];
                    return copy;
                  });
                  updateAnswer(fid, '');
                }}
              />

              {/* 19. Horário Final do Atendimento */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  19. Horário final do atendimento *
                </label>
                <div className="flex gap-2 max-w-xs">
                  <input
                    type="time"
                    value={answers['f_time_end'] || ''}
                    onChange={(e) => updateAnswer('f_time_end', e.target.value)}
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      updateAnswer('f_time_end', now.toTimeString().slice(0, 5));
                    }}
                    className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors"
                  >
                    Agora
                  </button>
                </div>
              </div>

              {/* 20. Avaliador Dropdown */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  20. Avaliador (Colaborador Responsável) *
                </label>
                <select
                  value={answers['f_avaliador'] || ''}
                  onChange={(e) => updateAnswer('f_avaliador', e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none font-medium"
                >
                  <option value="">-- Selecione o avaliador --</option>
                  {activeCollaborators.map((collab) => (
                    <option key={collab.id} value={collab.id}>
                      {collab.fullName} ({collab.specialty})
                    </option>
                  ))}
                </select>
              </div>

              {/* 21. Declaração de Conformidade */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!answers['f_declaracao']}
                    onChange={(e) => updateAnswer('f_declaracao', e.target.checked)}
                    className="accent-[#3F3F3F] w-5 h-5 rounded mt-0.5"
                  />
                  <span className="text-xs text-gray-700 font-medium leading-relaxed">
                    Declaro a veracidade e conformidade técnica das informações e medições registradas neste prontuário de atendimento da HSE Consultoria Especializada.
                  </span>
                </label>
              </div>

              {/* Mandatory Photo Notice if Missing */}
              {!(photoUrls['f_foto_reflexo'] || answers['f_foto_reflexo']) && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 font-semibold">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>A foto do teste de reflexo do motorista é <strong>obrigatória</strong>. Por favor, capture ou anexe a foto no item 18 acima antes de enviar o prontuário.</span>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Action Buttons */}
        <div className="bg-gray-100 px-6 py-4 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3">
          
          {/* Secondary Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePauseDraft}
              disabled={pausing}
              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
            >
              <PauseCircle className="w-4 h-4 text-lime-600" />
              <span>Pausar Rascunho</span>
            </button>

            <button
              type="button"
              onClick={handleClearForm}
              className="px-3 py-2 text-gray-600 hover:bg-gray-200 text-xs font-medium rounded-xl transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>

            <button
              type="button"
              onClick={handleNewBlankForm}
              className="px-3 py-2 text-gray-600 hover:bg-gray-200 text-xs font-medium rounded-xl transition-colors flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Novo em Branco</span>
            </button>
          </div>

          {/* Step Navigation Actions */}
          <div className="flex items-center gap-2">
            {currentStep > 1 && (
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            )}

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 bg-[#3F3F3F] hover:bg-[#2f2f2f] text-white font-bold text-xs rounded-xl transition-colors shadow flex items-center gap-1.5"
              >
                <span>Próximo</span>
                <ChevronRight className="w-4 h-4 text-lime-400" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitRecord}
                disabled={submitting}
                className="px-6 py-2.5 bg-[#A6CE39] hover:bg-[#95ba32] text-gray-900 font-extrabold text-xs rounded-xl transition-colors shadow flex items-center gap-1.5"
              >
                {submitting ? (
                  <span className="inline-block w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Enviar Prontuário Final</span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>

      </div>

      {/* Mandatory Medication Modal */}
      {showMedicationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center gap-2 text-amber-600 mb-3">
              <Pill className="w-5 h-5" />
              <h3 className="font-bold text-base text-gray-900">Uso de Medicamentos</h3>
            </div>
            <p className="text-xs text-gray-600 mb-4">
              Por favor, especifique o nome de todos os medicamentos em uso pelo colaborador/motorista:
            </p>

            <input
              type="text"
              value={medicationName}
              onChange={(e) => setMedicationName(e.target.value)}
              placeholder="Ex: Paracetamol 500mg, Losartana 50mg"
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#3F3F3F] outline-none mb-4"
              autoFocus
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!medicationName.trim()) {
                    alert('Por favor, informe o nome do medicamento.');
                    return;
                  }
                  updateAnswer('f_medicamento_nome', medicationName.trim());
                  setShowMedicationModal(false);
                }}
                className="px-4 py-2 bg-[#3F3F3F] hover:bg-[#2f2f2f] text-white font-bold text-xs rounded-xl transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
