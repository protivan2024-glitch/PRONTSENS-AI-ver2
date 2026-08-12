export type UserRole = 'Administrador' | 'Supervisor' | 'Limitado';

export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UserDoc {
  id: string; // matches Firebase Auth UID
  name: string;
  email: string;
  cpf: string;
  passwordHash?: string | null;
  role: UserRole;
  status: UserStatus;
  isPermanentAdmin?: boolean;
  createdAt: number;
  approvedAt?: number | null;
  approvedBy?: string | null;
  authProvider: 'password' | 'google';
}

export interface Collaborator {
  id: string;
  fullName: string;
  specialty: string;
  active: boolean; // soft-delete
  createdAt: number;
  createdBy: string;
}

export type FormFieldType = 
  | 'short_text' 
  | 'long_text' 
  | 'radio' 
  | 'checkbox' 
  | 'dropdown' 
  | 'photo' 
  | 'scale_1_5' 
  | 'date' 
  | 'time' 
  | 'datetime';

export type FormFieldSection = 'identificacao' | 'estimulacao' | 'seguranca' | 'parecer';

export type FieldMask = 'cpf' | 'phone' | 'date_ddmmaaaa' | 'time_hhmm' | 'temperature_00_0' | 'blood_pressure_000_00';

export interface FormField {
  id: string;
  section: FormFieldSection;
  order: number;
  label: string;
  type: FormFieldType;
  required: boolean;
  helpText?: string | null;
  options?: string[] | null;
  allowCustomOptionManagement?: boolean;
  conditionalLogic?: {
    triggerValue: string;
    revealFieldId: string;
  } | null;
  mask?: FieldMask | null;
}

export type RecordStatus = 'Conforme' | 'Alerta' | 'Crítico';

export interface RecordPhoto {
  fieldId: string;
  url: string;
  caption?: string;
}

export interface RecordDoc {
  id: string;
  answers: Record<string, string | string[]>;
  photos: RecordPhoto[];
  collaboratorId: string;
  collaboratorNameSnapshot: string;
  status: RecordStatus;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  submittedBy: string;
  submittedByUid: string;
  createdAt: number;
}

export interface DraftPhotoRef {
  fieldId: string;
  storagePathOrUrl: string;
}

export interface DraftDoc {
  id: string;
  ownerUid: string;
  answers: Record<string, string | string[]>;
  photoRefs: DraftPhotoRef[];
  currentStep: number;
  driverNamePreview: string;
  pausedAt: number;
  startedAt: number;
}

export interface AuditLogDoc {
  id: string;
  action: string;
  performedBy: string;
  timestamp: number;
  details?: Record<string, any>;
}
