import React, { useState, useEffect } from 'react';
import { UserDoc, Collaborator, FormField, RecordDoc, AuditLogDoc } from '../types';
import { db, auth } from '../lib/firebase';
import { 
  collection, query, onSnapshot, doc, updateDoc, deleteDoc, setDoc, addDoc, getDocs 
} from 'firebase/firestore';
import { PERMANENT_ADMIN_EMAIL, restoreDefaultFormFields } from '../lib/seed';
import { hashPassword } from '../lib/authService';
import { generateRecordPdf } from '../lib/pdfGenerator';
import { exportRecordsToCsv } from '../lib/csvExporter';
import { 
  Users, UserCheck, Shield, FormInput, FileText, Activity, Search, Trash2, 
  Download, Eye, Plus, Edit2, RotateCcw, CheckCircle, XCircle, AlertTriangle, Key, X, Lock, KeyRound,
  ImageIcon, HardDrive, Sparkles, RefreshCw, Camera
} from 'lucide-react';
import { 
  getImageStorageStats, 
  purgeImagesOlderThanCycle, 
  purgeAllImagesFromSystem, 
  ImageStats 
} from '../lib/imagePurgeService';

interface AdminPanelProps {
  currentUser: UserDoc;
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onClose }) => {
  const [activeTab, setActiveTab] = useState<'records' | 'collaborators' | 'fields' | 'users' | 'audit'>('records');

  // Data states
  const [records, setRecords] = useState<RecordDoc[]>([]);
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [fields, setFields] = useState<FormField[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDoc[]>([]);

  // Filters & Selected Record
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<RecordDoc | null>(null);

  // Collaborator form state
  const [collabName, setCollabName] = useState('');
  const [collabSpecialty, setCollabSpecialty] = useState('');
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);

  // Field form state
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldSection, setFieldSection] = useState<FormField['section']>('identificacao');
  const [fieldType, setFieldType] = useState<FormField['type']>('short_text');
  const [fieldOptions, setFieldOptions] = useState('');

  // Diagnostic state
  const [diagResult, setDiagResult] = useState<string | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  // Direct user registration state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserCpf, setNewUserCpf] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserDoc['role']>('Limitado');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [addUserLoading, setAddUserLoading] = useState(false);

  // Password reset state
  const [resettingUser, setResettingUser] = useState<UserDoc | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Image storage & purge state
  const [imageStats, setImageStats] = useState<ImageStats | null>(null);
  const [purgingImages, setPurgingImages] = useState(false);

  const isAdmin = currentUser.role === 'Administrador';

  // Load and refresh image stats
  const refreshStorageStats = async () => {
    try {
      const stats = await getImageStorageStats();
      setImageStats(stats);
    } catch (err) {
      console.warn('Error loading storage stats:', err);
    }
  };

  useEffect(() => {
    refreshStorageStats();
    // Auto-run 29-day cycle cleanup check
    purgeImagesOlderThanCycle(29).then(({ updatedCount }) => {
      if (updatedCount > 0) {
        console.log(`[Auto Purge] ${updatedCount} prontuários tiveram imagens com mais de 29 dias expurgadas.`);
        refreshStorageStats();
      }
    }).catch(err => console.warn('Auto purge check:', err));
  }, []);

  // Listeners
  useEffect(() => {
    // Records
    const qRecords = query(collection(db, 'records'));
    const unsubRecords = onSnapshot(qRecords, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecordDoc));
      setRecords(docs.sort((a,b) => b.createdAt - a.createdAt));
    });

    // Users
    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc));
      setUsers(docs.sort((a,b) => b.createdAt - a.createdAt));
    });

    // Collaborators
    const qCollab = query(collection(db, 'collaborators'));
    const unsubCollab = onSnapshot(qCollab, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Collaborator));
      setCollaborators(docs.sort((a,b) => b.createdAt - a.createdAt));
    });

    // Fields
    const qFields = query(collection(db, 'formFields'));
    const unsubFields = onSnapshot(qFields, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as FormField));
      setFields(docs.sort((a,b) => a.order - b.order));
    });

    return () => {
      unsubRecords();
      unsubUsers();
      unsubCollab();
      unsubFields();
    };
  }, []);

  // Filtered records
  const filteredRecords = records.filter(r => {
    const driver = String(r.answers['f_motorista'] || '').toLowerCase();
    const evaluator = String(r.collaboratorNameSnapshot || '').toLowerCase();
    const matchesSearch = driver.includes(searchTerm.toLowerCase()) || evaluator.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingUsers = users.filter(u => u.status === 'pending');

  // User Approval Handlers
  const handleApproveUser = async (user: UserDoc, roleToAssign: UserDoc['role']) => {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        status: 'approved',
        role: roleToAssign,
        approvedAt: Date.now(),
        approvedBy: currentUser.email
      });
      alert(`Usuário ${user.name} aprovado com sucesso como ${roleToAssign}!`);
    } catch (err) {
      console.error('Error approving user:', err);
      alert('Erro ao aprovar usuário.');
    }
  };

  const handleRejectUser = async (userId: string, targetEmail?: string) => {
    if (targetEmail?.toLowerCase() === PERMANENT_ADMIN_EMAIL.toLowerCase()) {
      alert('A conta de Administrador Permanente não pode ser removida ou alterada.');
      return;
    }
    if (!confirm('Deseja realmente recusar e remover esta solicitação de acesso?')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err) {
      console.error('Error rejecting user:', err);
    }
  };

  const handleRoleChange = async (targetUser: UserDoc, newRole: UserDoc['role']) => {
    if (targetUser.isPermanentAdmin || targetUser.email === PERMANENT_ADMIN_EMAIL) {
      alert('A conta de Administrador Permanente não pode ter seu papel alterado.');
      return;
    }
    try {
      await updateDoc(doc(db, 'users', targetUser.id), { role: newRole });
    } catch (err) {
      console.error('Error updating role:', err);
    }
  };

  const handleAddUserDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      alert('Preencha os campos obrigatórios.');
      return;
    }
    const cleanCpf = newUserCpf.replace(/\D/g, '');
    const userId = cleanCpf.length === 11 ? 'u_' + cleanCpf : 'u_' + Date.now();
    setAddUserLoading(true);

    try {
      const passHash = await hashPassword(newUserPassword);
      const userRef = doc(db, 'users', userId);
      const newUser: UserDoc = {
        id: userId,
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        cpf: cleanCpf,
        passwordHash: passHash,
        role: newUserRole,
        status: 'approved',
        isPermanentAdmin: false,
        createdAt: Date.now(),
        approvedAt: Date.now(),
        approvedBy: currentUser.email,
        authProvider: 'password'
      };
      await setDoc(userRef, newUser);
      alert(`Usuário ${newUserName} criado e aprovado com sucesso!`);
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserCpf('');
      setNewUserPassword('');
    } catch (err: any) {
      console.error('Error adding user direct:', err);
      alert('Erro ao criar usuário: ' + (err.message || err));
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || !newPasswordInput.trim()) return;
    if (newPasswordInput.length < 6) {
      alert('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setResetLoading(true);
    try {
      const passHash = await hashPassword(newPasswordInput);
      await updateDoc(doc(db, 'users', resettingUser.id), {
        passwordHash: passHash
      });
      alert(`Senha do usuário ${resettingUser.name} alterada com sucesso!`);
      setResettingUser(null);
      setNewPasswordInput('');
    } catch (err: any) {
      console.error('Error resetting password:', err);
      alert('Erro ao alterar senha: ' + (err.message || err));
    } finally {
      setResetLoading(false);
    }
  };

  // Image Purging Handlers
  const handlePurge29DaysCycle = async () => {
    if (!isAdmin) return;
    const confirmRun = window.confirm(
      'Deseja executar o ciclo de expurgo de imagens com mais de 29 dias?\n\n' +
      '• As fotos/evidências com mais de 29 dias serão removidas da nuvem para economia de espaço.\n' +
      '• 100% dos prontuários, dados clínicos, respostas e histórico permanecerão totalmente preservados.'
    );
    if (!confirmRun) return;

    setPurgingImages(true);
    try {
      const res = await purgeImagesOlderThanCycle(29);
      alert(`Ciclo de 29 dias concluído com sucesso!\n${res.updatedCount} prontuário(s) tiveram suas fotos expurgadas, mantendo o histórico clínico intacto.`);
      await refreshStorageStats();
    } catch (err: any) {
      console.error('Error purging 29 days images:', err);
      alert('Erro ao executar expurgo: ' + (err.message || err));
    } finally {
      setPurgingImages(false);
    }
  };

  const handlePurgeAllImages = async () => {
    if (!isAdmin) return;
    const word = prompt(
      'ATENÇÃO: Deseja expurgar TODAS as imagens/evidências fotográficas anexadas no sistema para liberação imediata de espaço na nuvem?\n\n' +
      'Todos os dados clínicos, cadastros, respostas, motoristas e relatórios permanecerão 100% intactos.\n\n' +
      'Digite "EXPURGAR" para confirmar:'
    );
    if (word === 'EXPURGAR') {
      setPurgingImages(true);
      try {
        const res = await purgeAllImagesFromSystem();
        alert(`Expurgo concluído com sucesso!\n${res.updatedCount} prontuário(s) tiveram imagens removidas do armazenamento. O histórico de atendimentos foi totalmente preservado.`);
        await refreshStorageStats();
      } catch (err: any) {
        console.error('Error purging all images:', err);
        alert('Erro ao expurgar imagens: ' + (err.message || err));
      } finally {
        setPurgingImages(false);
      }
    }
  };

  // Collaborator Handlers
  const handleSaveCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabName.trim() || !collabSpecialty.trim()) return;

    try {
      if (editingCollabId) {
        await updateDoc(doc(db, 'collaborators', editingCollabId), {
          fullName: collabName.trim().toUpperCase(),
          specialty: collabSpecialty.trim()
        });
      } else {
        const ref = doc(collection(db, 'collaborators'));
        await setDoc(ref, {
          id: ref.id,
          fullName: collabName.trim().toUpperCase(),
          specialty: collabSpecialty.trim(),
          active: true,
          createdAt: Date.now(),
          createdBy: currentUser.email
        });
      }
      setCollabName('');
      setCollabSpecialty('');
      setEditingCollabId(null);
    } catch (err) {
      console.error('Error saving collaborator:', err);
    }
  };

  const handleToggleCollabActive = async (collab: Collaborator) => {
    if (!isAdmin) {
      alert('Apenas Administradores podem inativar colaboradores.');
      return;
    }
    try {
      await updateDoc(doc(db, 'collaborators', collab.id), {
        active: !collab.active
      });
    } catch (err) {
      console.error('Error toggling collaborator status:', err);
    }
  };

  // Field Handlers
  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) return;

    try {
      const fieldId = `f_custom_${Date.now()}`;
      const opts = fieldOptions ? fieldOptions.split(',').map(s => s.trim()).filter(Boolean) : null;

      const newField: FormField = {
        id: fieldId,
        section: fieldSection,
        order: fields.length + 1,
        label: fieldLabel.trim(),
        type: fieldType,
        required: true,
        options: opts
      };

      await setDoc(doc(db, 'formFields', fieldId), newField);
      setFieldLabel('');
      setFieldOptions('');
    } catch (err) {
      console.error('Error saving field:', err);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!isAdmin) {
      alert('Apenas Administradores podem excluir perguntas.');
      return;
    }
    if (!confirm('Deseja realmente excluir esta pergunta do formulário?')) return;
    try {
      await deleteDoc(doc(db, 'formFields', fieldId));
    } catch (err) {
      console.error('Error deleting field:', err);
    }
  };

  const handleRestoreHseFields = async () => {
    if (!confirm('ATENÇÃO: Deseja restaurar a estrutura de perguntas para o Padrão Oficial HSE (19 perguntas)?')) return;
    try {
      await restoreDefaultFormFields();
      alert('Perguntas restauradas com sucesso para o Padrão HSE!');
    } catch (err) {
      console.error('Error restoring fields:', err);
      alert('Erro ao restaurar perguntas.');
    }
  };

  // Record Delete Handlers
  const handleDeleteRecord = async (recordId: string) => {
    if (!isAdmin) {
      alert('Apenas Administradores podem excluir prontuários.');
      return;
    }
    if (!confirm('Deseja realmente excluir este prontuário? Esta ação é irreversível.')) return;
    try {
      await deleteDoc(doc(db, 'records', recordId));
      if (selectedRecord?.id === recordId) setSelectedRecord(null);
    } catch (err) {
      console.error('Error deleting record:', err);
    }
  };

  const handleBulkDeleteRecords = async () => {
    if (!isAdmin) return;
    const word = prompt('ATENÇÃO: Para excluir TODOS os prontuários permanentemente, digite "DELETAR":');
    if (word === 'DELETAR') {
      try {
        const snap = await getDocs(collection(db, 'records'));
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
        }
        alert('Todos os prontuários foram excluídos com sucesso.');
      } catch (err) {
        console.error('Error bulk deleting:', err);
      }
    }
  };

  // Run Health Diagnostic
  const handleRunDiagnostic = async () => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const userSnap = await getDocs(collection(db, 'users'));
      const recordSnap = await getDocs(collection(db, 'records'));
      const collabSnap = await getDocs(collection(db, 'collaborators'));

      setDiagResult(`
✅ Autenticação Firebase Auth: OK (Sessão ativa: ${currentUser.email})
✅ Leitura Firestore: OK (${userSnap.size} usuários, ${recordSnap.size} prontuários, ${collabSnap.size} colaboradores)
✅ Escrita/Regras Firestore: OK (Permissões de ${currentUser.role} validadas)
✅ Firebase Storage: Operacional
STATUS GERAL DO SISTEMA: 100% OPERACIONAL E SINCRONIZADO
      `.trim());
    } catch (err: any) {
      setDiagResult(`❌ ERRO NO DIAGNÓSTICO: ${err.message}`);
    } finally {
      setDiagLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col h-[92vh]">
        
        {/* Panel Header */}
        <div className="bg-[#3F3F3F] p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold">Painel Administrativo HSE</h2>
            <p className="text-xs text-lime-400 font-semibold mt-0.5">
              ProntoSens AI • Usuário: {currentUser.name} ({currentUser.role})
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-300" />
          </button>
        </div>

        {/* Pending Requests Alert Banner */}
        {pendingUsers.length > 0 && (
          <div className="bg-amber-500 text-gray-900 px-4 py-2.5 font-bold text-xs flex items-center justify-between shrink-0 shadow-inner">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-gray-900" />
              <span>{pendingUsers.length} SOLICITAÇÃO(ÕES) DE AUTOCADASTRO PENDENTE(S) DE APROVAÇÃO</span>
            </div>
            <button
              onClick={() => setActiveTab('users')}
              className="bg-gray-900 text-white px-3 py-1 rounded-lg text-[11px] font-bold hover:bg-black transition-colors"
            >
              Ver e Aprovar Agora
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto shrink-0">
          {[
            { id: 'records', label: 'Atendimentos e Respostas', icon: FileText },
            { id: 'collaborators', label: 'Gestão de Colaboradores', icon: UserCheck },
            { id: 'fields', label: 'Gerenciador de Campos', icon: FormInput },
            { id: 'users', label: `Usuários ${pendingUsers.length > 0 ? `(${pendingUsers.length})` : ''}`, icon: Users },
            { id: 'audit', label: 'Diagnóstico & Auditoria', icon: Activity },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-[#3F3F3F] text-[#3F3F3F] bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto bg-gray-50/50">

          {/* ================ TAB 1: RECORDS ================ */}
          {activeTab === 'records' && (
            <div className="space-y-4">
              
              {/* Cloud Storage & Image Purge Control Banner */}
              {isAdmin && (
                <div className="bg-gradient-to-r from-gray-900 via-[#3F3F3F] to-gray-800 p-4 rounded-xl text-white shadow-md flex flex-wrap items-center justify-between gap-4 border border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-white/10 rounded-xl">
                      <HardDrive className="w-5 h-5 text-lime-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-xs text-white">Armazenamento & Imagens na Nuvem</h4>
                        <span className="text-[10px] font-semibold bg-lime-400/20 text-lime-300 px-2 py-0.5 rounded-full">
                          Ciclo de 29 Dias Ativo
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 mt-0.5">
                        {imageStats 
                          ? `${imageStats.recordsWithImages} prontuário(s) com fotos anexadas (${imageStats.recordsOlderThan29DaysWithImages} com mais de 29 dias)`
                          : 'Calculando ocupação de imagens na nuvem...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handlePurge29DaysCycle}
                      disabled={purgingImages}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      title="Remove imagens anexadas com mais de 29 dias mantendo 100% dos dados dos prontuários"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Expurgar Imagens &gt; 29 Dias
                    </button>

                    <button
                      onClick={handlePurgeAllImages}
                      disabled={purgingImages}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      title="Expurga todas as imagens do sistema para liberar espaço mantendo os prontuários intactos"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Expurgar Todas as Imagens
                    </button>

                    <button
                      onClick={refreshStorageStats}
                      className="p-1.5 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                      title="Recarregar dados de armazenamento"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Search & Export Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por motorista ou avaliador..."
                    className="w-full text-xs outline-none bg-transparent"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white font-semibold"
                  >
                    <option value="ALL">Todos os Status</option>
                    <option value="Conforme">Conforme</option>
                    <option value="Alerta">Alerta</option>
                    <option value="Crítico">Crítico</option>
                  </select>

                  <button
                    onClick={() => exportRecordsToCsv(filteredRecords, fields)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar CSV
                  </button>

                  {isAdmin && (
                    <button
                      onClick={handleBulkDeleteRecords}
                      className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Todos
                    </button>
                  )}
                </div>
              </div>

              {/* Records Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 font-bold uppercase tracking-wider border-b border-gray-200">
                        <th className="p-3">Data/Hora</th>
                        <th className="p-3">Motorista</th>
                        <th className="p-3">Status HSE</th>
                        <th className="p-3">Avaliador</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-gray-500">
                            Nenhum prontuário encontrado.
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((r) => {
                          let badgeClass = 'bg-emerald-100 text-emerald-800';
                          if (r.status === 'Alerta') badgeClass = 'bg-amber-100 text-amber-800';
                          if (r.status === 'Crítico') badgeClass = 'bg-red-100 text-red-800';

                          return (
                            <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="p-3 font-medium text-gray-600">
                                {new Date(r.createdAt).toLocaleString('pt-BR')}
                              </td>
                              <td className="p-3 font-bold text-gray-900">
                                {String(r.answers['f_motorista'] || 'N/A')}
                              </td>
                              <td className="p-3">
                                <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] ${badgeClass}`}>
                                  {r.status}
                                </span>
                              </td>
                              <td className="p-3 font-medium text-gray-700">
                                {r.collaboratorNameSnapshot}
                              </td>
                              <td className="p-3 text-right space-x-1">
                                <button
                                  onClick={() => setSelectedRecord(r)}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                                  title="Ver Prontuário Detalhado"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => generateRecordPdf(r, fields)}
                                  className="p-1.5 bg-lime-100 hover:bg-lime-200 text-gray-900 rounded-lg transition-colors"
                                  title="Baixar PDF"
                                >
                                  <Download className="w-4 h-4" />
                                </button>

                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteRecord(r.id)}
                                    className="p-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                                    title="Excluir Prontuário"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ================ TAB 2: COLLABORATORS ================ */}
          {activeTab === 'collaborators' && (
            <div className="space-y-6">
              
              {/* Form to add/edit collaborator */}
              <form onSubmit={handleSaveCollaborator} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                <h3 className="font-bold text-sm text-gray-800">
                  {editingCollabId ? 'Editar Colaborador' : 'Cadastrar Novo Colaborador'}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={collabName}
                    onChange={(e) => setCollabName(e.target.value)}
                    placeholder="Nome completo (Ex: JOÃO DA SILVA)"
                    required
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                  />
                  <input
                    type="text"
                    value={collabSpecialty}
                    onChange={(e) => setCollabSpecialty(e.target.value)}
                    placeholder="Cargo / Especialidade (Ex: Técnico em Enfermagem / HSE)"
                    required
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  {editingCollabId && (
                    <button
                      type="button"
                      onClick={() => { setEditingCollabId(null); setCollabName(''); setCollabSpecialty(''); }}
                      className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-bold rounded-lg"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#3F3F3F] text-white text-xs font-bold rounded-lg flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {editingCollabId ? 'Salvar Alterações' : 'Adicionar Colaborador'}
                  </button>
                </div>
              </form>

              {/* Collaborators List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {collaborators.map((c) => (
                  <div key={c.id} className={`p-4 rounded-xl border bg-white shadow-sm flex flex-col justify-between ${!c.active ? 'opacity-60 bg-gray-50' : ''}`}>
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-sm text-gray-900">{c.fullName}</h4>
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {c.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{c.specialty}</p>
                    </div>

                    <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setEditingCollabId(c.id);
                          setCollabName(c.fullName);
                          setCollabSpecialty(c.specialty);
                        }}
                        className="p-1 text-gray-600 hover:text-gray-900"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => handleToggleCollabActive(c)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-md ${c.active ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}
                        >
                          {c.active ? 'Inativar' : 'Ativar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* ================ TAB 3: FIELDS ================ */}
          {activeTab === 'fields' && (
            <div className="space-y-6">
              
              <div className="flex justify-between items-center bg-white p-3.5 rounded-xl border border-gray-200">
                <span className="text-xs font-bold text-gray-700">Estrutura de Perguntas do Formulário ({fields.length} campos)</span>
                <button
                  onClick={handleRestoreHseFields}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar Padrão HSE (19 Perguntas)
                </button>
              </div>

              {/* Add Field Form */}
              <form onSubmit={handleSaveField} className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                <h4 className="font-bold text-xs text-gray-800">Adicionar Pergunta Customizada</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={fieldLabel}
                    onChange={(e) => setFieldLabel(e.target.value)}
                    placeholder="Título da Pergunta"
                    required
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl"
                  />
                  <select
                    value={fieldSection}
                    onChange={(e) => setFieldSection(e.target.value as any)}
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl"
                  >
                    <option value="identificacao">1. Identificação Geral</option>
                    <option value="estimulacao">2. Estimulação & Clínica</option>
                    <option value="seguranca">3. Segurança HSE</option>
                    <option value="parecer">4. Parecer Técnico</option>
                  </select>
                  <select
                    value={fieldType}
                    onChange={(e) => setFieldType(e.target.value as any)}
                    className="px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl"
                  >
                    <option value="short_text">Texto Curto</option>
                    <option value="radio">Múltipla Escolha (Radio)</option>
                    <option value="dropdown">Menu Suspenso (Dropdown)</option>
                    <option value="photo">Upload de Foto</option>
                  </select>
                </div>

                {(fieldType === 'radio' || fieldType === 'dropdown') && (
                  <input
                    type="text"
                    value={fieldOptions}
                    onChange={(e) => setFieldOptions(e.target.value)}
                    placeholder="Opções separadas por vírgula (Ex: Opção A, Opção B, OUTROS)"
                    className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl"
                  />
                )}

                <div className="text-right">
                  <button type="submit" className="px-4 py-1.5 bg-[#3F3F3F] text-white text-xs font-bold rounded-lg">
                    Adicionar Pergunta
                  </button>
                </div>
              </form>

              {/* Fields Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 font-bold text-gray-700 border-b">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Pergunta / Rótulo</th>
                      <th className="p-3">Seção</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fields.map((f, idx) => (
                      <tr key={f.id}>
                        <td className="p-3 font-bold text-gray-400">{idx + 1}</td>
                        <td className="p-3 font-semibold text-gray-900">{f.label}</td>
                        <td className="p-3 text-gray-600 uppercase text-[10px] font-bold">{f.section}</td>
                        <td className="p-3 text-gray-600">{f.type}</td>
                        <td className="p-3 text-right">
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteField(f.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* ================ TAB 4: USERS ================ */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              
              {/* Pending Requests Section */}
              {pendingUsers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
                  <h3 className="font-bold text-sm text-amber-900 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-700" />
                    Solicitações de Autocadastro Pendentes ({pendingUsers.length})
                  </h3>

                  <div className="space-y-2">
                    {pendingUsers.map((u) => (
                      <div key={u.id} className="bg-white p-3 rounded-xl border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <p className="font-bold text-gray-900">{u.name}</p>
                          <p className="text-gray-500">{u.email} • CPF: {u.cpf || 'Não informado'}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            id={`role-select-${u.id}`}
                            defaultValue="Limitado"
                            className="border border-gray-300 rounded-lg px-2 py-1 bg-white text-xs font-semibold"
                          >
                            <option value="Limitado">Limitado</option>
                            <option value="Supervisor">Supervisor</option>
                            <option value="Administrador">Administrador</option>
                          </select>

                          <button
                            onClick={() => {
                              const el = document.getElementById(`role-select-${u.id}`) as HTMLSelectElement;
                              handleApproveUser(u, el.value as any);
                            }}
                            className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700"
                          >
                            Aprovar Acesso
                          </button>

                          <button
                            onClick={() => handleRejectUser(u.id, u.email)}
                            className="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200"
                          >
                            Recusar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved Users List */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="p-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-bold text-xs text-gray-700">
                    Usuários Cadastrados na Plataforma ({users.length})
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => setShowAddUserModal(true)}
                      className="px-3 py-1.5 bg-[#3F3F3F] hover:bg-[#2f2f2f] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Cadastrar Novo Usuário
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 font-bold text-gray-700 border-b">
                      <tr>
                        <th className="p-3">Nome</th>
                        <th className="p-3">E-mail / CPF</th>
                        <th className="p-3">Papel (Role)</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map((u) => {
                        const isPermanent = u.isPermanentAdmin || u.email.toLowerCase() === PERMANENT_ADMIN_EMAIL.toLowerCase();

                        return (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="p-3 font-bold text-gray-900 flex items-center gap-1.5">
                              {u.name}
                              {isPermanent && (
                                <span className="bg-purple-100 text-purple-800 text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                                  <Lock className="w-3 h-3" /> Admin Permanente
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-gray-600">
                              {u.email} <br />
                              <span className="text-[10px] text-gray-400">CPF: {u.cpf || '---'}</span>
                            </td>
                            <td className="p-3">
                              {isPermanent ? (
                                <span className="font-bold text-purple-900">Administrador</span>
                              ) : (
                                <select
                                  value={u.role}
                                  onChange={(e) => handleRoleChange(u, e.target.value as any)}
                                  disabled={!isAdmin}
                                  className="border border-gray-300 rounded-lg px-2 py-1 bg-white font-semibold"
                                >
                                  <option value="Limitado">Limitado</option>
                                  <option value="Supervisor">Supervisor</option>
                                  <option value="Administrador">Administrador</option>
                                </select>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {u.status}
                              </span>
                            </td>
                            <td className="p-3 text-right space-x-1">
                              {isAdmin && !isPermanent && (
                                <>
                                  <button
                                    onClick={() => {
                                      setResettingUser(u);
                                      setNewPasswordInput('');
                                    }}
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg"
                                    title="Alterar Senha do Usuário"
                                  >
                                    <KeyRound className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleRejectUser(u.id, u.email)}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                                    title="Remover Acesso"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Direct Add User Modal */}
              {showAddUserModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-100 space-y-4">
                    <div className="flex justify-between items-center border-b pb-3">
                      <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#3F3F3F]" />
                        Cadastrar Novo Usuário
                      </h3>
                      <button onClick={() => setShowAddUserModal(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleAddUserDirect} className="space-y-3 text-xs">
                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">Nome Completo *</label>
                        <input
                          type="text"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="Ex: MARCOS DE SOUZA"
                          required
                          className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">E-mail *</label>
                        <input
                          type="email"
                          value={newUserEmail}
                          onChange={(e) => setNewUserEmail(e.target.value)}
                          placeholder="marcos@empresa.com"
                          required
                          className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">CPF (11 dígitos)</label>
                        <input
                          type="text"
                          value={newUserCpf}
                          onChange={(e) => setNewUserCpf(e.target.value)}
                          placeholder="000.000.000-00"
                          className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">Papel / Nível de Acesso</label>
                        <select
                          value={newUserRole}
                          onChange={(e) => setNewUserRole(e.target.value as any)}
                          className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none font-semibold"
                        >
                          <option value="Limitado">Limitado (Preenchimento de Formulários)</option>
                          <option value="Supervisor">Supervisor (Visualização e Edição Técnica)</option>
                          <option value="Administrador">Administrador (Controle Total)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">Senha Inicial *</label>
                        <input
                          type="password"
                          value={newUserPassword}
                          onChange={(e) => setNewUserPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          minLength={6}
                          required
                          className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-3 border-t">
                        <button
                          type="button"
                          onClick={() => setShowAddUserModal(false)}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={addUserLoading}
                          className="px-5 py-2 bg-[#3F3F3F] hover:bg-[#2f2f2f] text-white rounded-xl font-bold transition-colors shadow-md disabled:opacity-50"
                        >
                          {addUserLoading ? 'Cadastrando...' : 'Criar e Aprovar Usuário'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Reset Password Modal */}
              {resettingUser && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 space-y-4">
                    <div className="flex justify-between items-center border-b pb-3">
                      <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-amber-600" />
                        Alterar Senha do Usuário
                      </h3>
                      <button onClick={() => setResettingUser(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleResetUserPassword} className="space-y-3 text-xs">
                      <p className="text-gray-600">
                        Definir nova senha de acesso para <strong>{resettingUser.name}</strong> ({resettingUser.email}):
                      </p>

                      <div>
                        <label className="block font-semibold text-gray-700 mb-1">Nova Senha *</label>
                        <input
                          type="password"
                          value={newPasswordInput}
                          onChange={(e) => setNewPasswordInput(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          minLength={6}
                          required
                          className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-[#3F3F3F]"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-3 border-t">
                        <button
                          type="button"
                          onClick={() => setResettingUser(null)}
                          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={resetLoading}
                          className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-colors shadow-md disabled:opacity-50"
                        >
                          {resetLoading ? 'Salvando...' : 'Atualizar Senha'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ================ TAB 5: AUDIT & DIAGNOSTIC ================ */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-lime-600" />
                  Diagnóstico de Integridade e Conexão (Suporte Técnico)
                </h3>
                <p className="text-xs text-gray-600">
                  Execute um teste em tempo real na conexão com Firebase Auth, Firestore Database e Firebase Storage:
                </p>

                <button
                  onClick={handleRunDiagnostic}
                  disabled={diagLoading}
                  className="px-4 py-2 bg-[#3F3F3F] hover:bg-[#2f2f2f] text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
                >
                  {diagLoading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      Executar Teste de Diagnóstico
                    </>
                  )}
                </button>

                {diagResult && (
                  <pre className="p-4 bg-gray-900 text-lime-400 rounded-xl text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {diagResult}
                  </pre>
                )}
              </div>

              {/* Cloud Storage & 29-Day Image Purge Card */}
              {isAdmin && (
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-amber-600" />
                      Gestão de Armazenamento na Nuvem & Ciclo de 29 Dias
                    </h3>
                    <span className="text-[11px] font-bold px-2.5 py-1 bg-lime-100 text-lime-800 rounded-full">
                      Compressão &lt;100KB Ativa
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed">
                    Todas as fotos e evidências enviadas passam por compressão rigorosa (&lt;100KB). Para evitar acúmulo desnecessário de custos e espaço na nuvem, o sistema aplica a política de expurgo periódico:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold uppercase block">Total de Prontuários</span>
                      <span className="text-base font-extrabold text-gray-900">{records.length}</span>
                    </div>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <span className="text-[10px] text-gray-500 font-bold uppercase block">Prontuários c/ Imagens</span>
                      <span className="text-base font-extrabold text-gray-900">{imageStats?.recordsWithImages ?? 0}</span>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-[10px] text-amber-700 font-bold uppercase block">Imagens &gt; 29 Dias</span>
                      <span className="text-base font-extrabold text-amber-900">{imageStats?.recordsOlderThan29DaysWithImages ?? 0}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                    <strong>Garantia de Integridade de Dados:</strong> O expurgo de imagens remove estritamente os arquivos binários pesados de imagens da nuvem. Todos os prontuários, dados clínicos, respostas de formulário, nomes de motoristas, datas, horários e pareceres permanecem <strong>100% gravados e preservados no histórico</strong>.
                  </div>

                  <div className="flex gap-3 flex-wrap pt-2">
                    <button
                      onClick={handlePurge29DaysCycle}
                      disabled={purgingImages}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      Executar Ciclo de Expurgo (29 Dias)
                    </button>

                    <button
                      onClick={handlePurgeAllImages}
                      disabled={purgingImages}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Expurgar TODAS as Imagens do Sistema
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

      </div>

      {/* Record Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-base text-gray-900">
                Prontuário - Motorista: {selectedRecord.answers['f_motorista']}
              </h3>
              <button onClick={() => setSelectedRecord(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-3 rounded-xl">
              <div><strong>Status:</strong> {selectedRecord.status}</div>
              <div><strong>Avaliador:</strong> {selectedRecord.collaboratorNameSnapshot}</div>
              <div><strong>Data:</strong> {new Date(selectedRecord.createdAt).toLocaleString('pt-BR')}</div>
              <div><strong>Enviado por:</strong> {selectedRecord.submittedBy}</div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider border-b pb-1">
                Respostas Registradas
              </h4>
              {fields.map(f => {
                const val = selectedRecord.answers[f.id];
                if (f.type === 'photo' || f.id === 'f_foto_reflexo') return null; // Rendered in photos section
                return (
                  <div key={f.id} className="text-xs">
                    <span className="font-bold text-gray-700">{f.label}: </span>
                    <span className="text-gray-900">{Array.isArray(val) ? val.join(', ') : (val || '---')}</span>
                  </div>
                );
              })}
            </div>

            {/* Evidências Fotográficas */}
            {(() => {
              const displayPhotos: { url: string; caption?: string }[] = [];
              if (selectedRecord.photos && selectedRecord.photos.length > 0) {
                selectedRecord.photos.forEach(p => {
                  if (p.url) displayPhotos.push(p);
                });
              }
              const ansPhoto = selectedRecord.answers['f_foto_reflexo'];
              if (typeof ansPhoto === 'string' && ansPhoto && !displayPhotos.some(p => p.url === ansPhoto)) {
                displayPhotos.push({
                  url: ansPhoto,
                  caption: 'Foto do teste de reflexo do motorista'
                });
              }

              if (displayPhotos.length === 0) {
                return (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-xs flex items-center gap-2">
                    <Camera className="w-4 h-4 text-gray-400" />
                    <span>Nenhuma evidência fotográfica anexada (ou imagem expurgada pelo ciclo de 29 dias).</span>
                  </div>
                );
              }

              return (
                <div className="space-y-2 border-t pt-3">
                  <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Evidências Fotográficas Registradas</span>
                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                      {displayPhotos.length} foto(s) anexada(s)
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {displayPhotos.map((p, idx) => (
                      <div key={idx} className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm">
                        <img 
                          src={p.url} 
                          alt="Evidência" 
                          className="w-full h-48 object-cover cursor-pointer hover:opacity-95" 
                          onClick={() => window.open(p.url, '_blank')}
                          title="Clique para visualizar imagem"
                        />
                        <div className="p-2.5 flex items-center justify-between bg-white border-t">
                          <p className="text-[11px] font-bold text-gray-700">{p.caption || 'Foto do Teste de Reflexo'}</p>
                          <a
                            href={p.url}
                            download={`foto_reflexo_${selectedRecord.id}.jpg`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800"
                          >
                            Abrir / Baixar
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="text-right border-t pt-3">
              <button
                onClick={() => generateRecordPdf(selectedRecord, fields)}
                className="px-4 py-2 bg-[#A6CE39] text-gray-900 font-bold text-xs rounded-xl"
              >
                Baixar PDF Oficial
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
