import { doc, getDoc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';
import { FormField, Collaborator } from '../types';

export const PERMANENT_ADMIN_EMAIL = 'marketing.hseconsultoria@gmail.com';
export const PERMANENT_ADMIN_PASSWORD = 'Hse.mkt@#2025';


export const DEFAULT_HSE_FIELDS: FormField[] = [
  {
    id: 'f_sala',
    section: 'identificacao',
    order: 1,
    label: 'Endereço da sala de estimulação',
    type: 'radio',
    required: true,
    options: ['CMPC - BUTIÁ - RS', 'CMPC - CACHOEIRA - RS'],
    allowCustomOptionManagement: true
  },
  {
    id: 'f_empresa',
    section: 'identificacao',
    order: 2,
    label: 'Empresa',
    type: 'radio',
    required: true,
    options: ['JSL S/A', 'RIO DO SUL', 'REITER LOG', 'HAMMES', 'OUTROS'],
    allowCustomOptionManagement: true
  },
  {
    id: 'f_empresa_sub',
    section: 'identificacao',
    order: 3,
    label: 'Empresa sub-contratada',
    type: 'dropdown',
    required: true,
    helpText: "Para os casos de empresas agregadas, informar o nome da empresa. Para a própria empresa, informar 'próprio'.",
    options: ['PRÓPRIO - JSL', 'PRÓPRIO - RIO DO SUL', 'SUBCONTRATADO - JSL', 'SUBCONTRATADO - RIO DO SUL', 'PRÓPRIO - HAMMES', 'PRÓPRIO - REITER LOG', 'OUTROS'],
    allowCustomOptionManagement: true
  },
  {
    id: 'f_datetime',
    section: 'identificacao',
    order: 4,
    label: 'Data e hora do atendimento',
    type: 'datetime',
    required: true,
    mask: 'date_ddmmaaaa'
  },
  {
    id: 'f_time_start',
    section: 'identificacao',
    order: 5,
    label: 'Horário de início (Atendimento)',
    type: 'time',
    required: true,
    mask: 'time_hhmm'
  },
  {
    id: 'f_duracao',
    section: 'identificacao',
    order: 6,
    label: 'Período de procedimento (Duração total)',
    type: 'short_text',
    required: false,
    helpText: 'Calculado automaticamente entre início e término'
  },
  {
    id: 'f_motorista',
    section: 'identificacao',
    order: 7,
    label: 'Nome do motorista',
    type: 'short_text',
    required: true,
    helpText: 'Nome completo sem acentuação (ex: CARLOS SILVA)'
  },
  {
    id: 'f_ciclo_escala',
    section: 'identificacao',
    order: 8,
    label: 'Ciclo da escala do motorista',
    type: 'radio',
    required: true,
    options: [
      '1º DIA DE ESCALA',
      '2º DIA DE ESCALA',
      '3º DIA DE ESCALA',
      '4º DIA DE ESCALA',
      '5º DIA DE ESCALA',
      '6º DIA DE ESCALA'
    ]
  },
  {
    id: 'f_hora_escala',
    section: 'identificacao',
    order: 9,
    label: 'Hora escala',
    type: 'time',
    required: true,
    mask: 'time_hhmm'
  },
  {
    id: 'f_temp',
    section: 'estimulacao',
    order: 10,
    label: 'Temperatura aferida (ºC)',
    type: 'short_text',
    required: true,
    mask: 'temperature_00_0'
  },
  {
    id: 'f_nivel_temp',
    section: 'estimulacao',
    order: 11,
    label: 'Nível de temperatura',
    type: 'radio',
    required: true,
    options: ['NORMAL', 'FEBRIL']
  },
  {
    id: 'f_fadiga',
    section: 'estimulacao',
    order: 12,
    label: 'Nível de fadiga',
    type: 'radio',
    required: true,
    options: ['NADA CANSADO', 'POUCO CANSADO', 'MODERADAMENTE CANSADO', 'MUITO CANSADO', 'EXTREMAMENTE CANSADO']
  },
  {
    id: 'f_percepcao',
    section: 'estimulacao',
    order: 13,
    label: 'Teste de percepção',
    type: 'radio',
    required: true,
    options: ['1º MOMENTO', '2º MOMENTO', '3º MOMENTO']
  },
  {
    id: 'f_pressao',
    section: 'estimulacao',
    order: 14,
    label: 'Pressão arterial (mmHg)',
    type: 'short_text',
    required: true,
    mask: 'blood_pressure_000_00'
  },
  {
    id: 'f_nivel_pressao',
    section: 'estimulacao',
    order: 15,
    label: 'Nível de pressão',
    type: 'radio',
    required: true,
    options: ['BAIXA', 'NORMAL', 'ALTA']
  },
  {
    id: 'f_medicamento',
    section: 'estimulacao',
    order: 16,
    label: 'Faz uso de medicamento?',
    type: 'radio',
    required: true,
    options: ['Sim', 'Não']
  },
  {
    id: 'f_status_liberacao',
    section: 'seguranca',
    order: 17,
    label: 'Status de liberação',
    type: 'radio',
    required: true,
    helpText: 'Inserir neste campo, se após medições, o colaborador foi bloqueado ou não.',
    options: ['LIBERADO PARA ATIVIDADE', 'BLOQUEADO PARA ATIVIDADE', 'LIBERADO COM OBSERVAÇÃO']
  },
  {
    id: 'f_foto_reflexo',
    section: 'parecer',
    order: 18,
    label: 'Foto do teste de reflexo',
    type: 'photo',
    required: false
  },
  {
    id: 'f_time_end',
    section: 'parecer',
    order: 19,
    label: 'Horário final do atendimento',
    type: 'time',
    required: true,
    mask: 'time_hhmm'
  },
  {
    id: 'f_avaliador',
    section: 'parecer',
    order: 20,
    label: 'Avaliador',
    type: 'dropdown',
    required: true,
    helpText: 'Selecione o colaborador responsável pelo parecer'
  },
  {
    id: 'f_declaracao',
    section: 'parecer',
    order: 21,
    label: 'Declaro a veracidade e conformidade técnica do atendimento prestado',
    type: 'checkbox',
    required: true
  }
];

export const DEFAULT_COLLABORATORS: Omit<Collaborator, 'id'>[] = [
  { fullName: 'CMPC - AVALIADOR 1', specialty: 'Técnico em Enfermagem / HSE', active: true, createdAt: Date.now(), createdBy: 'system' },
  { fullName: 'CMPC - AVALIADOR 2', specialty: 'Enfermeiro do Trabalho / HSE', active: true, createdAt: Date.now(), createdBy: 'system' },
  { fullName: 'CMPC - AVALIADOR 3', specialty: 'Supervisor de Saúde Ocupacional', active: true, createdAt: Date.now(), createdBy: 'system' }
];

export async function ensureSeedData() {
  if (!auth.currentUser) {
    return;
  }
  try {
    // 1. Check formFields collection
    const fieldsSnap = await getDocs(collection(db, 'formFields'));
    if (fieldsSnap.empty) {
      await restoreDefaultFormFields();
    }

    // 2. Check collaborators collection
    const collabSnap = await getDocs(collection(db, 'collaborators'));
    if (collabSnap.empty) {
      const batch = writeBatch(db);
      DEFAULT_COLLABORATORS.forEach((collab) => {
        const ref = doc(collection(db, 'collaborators'));
        batch.set(ref, {
          ...collab,
          id: ref.id
        });
      });
      await batch.commit();
    }
  } catch (err: any) {
    console.warn('Initial seed check skipped:', err?.message || err);
  }
}

export async function restoreDefaultFormFields() {
  const batch = writeBatch(db);
  // Clear existing or overwrite
  const existing = await getDocs(collection(db, 'formFields'));
  existing.docs.forEach(d => batch.delete(d.ref));

  DEFAULT_HSE_FIELDS.forEach((field) => {
    const ref = doc(db, 'formFields', field.id);
    batch.set(ref, field);
  });

  await batch.commit();
}
