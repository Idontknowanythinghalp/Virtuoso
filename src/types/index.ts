export type AppRoute =
  | 'home'
  | 'about-virtuoso'
  | 'about-sjcc'
  | 'about-department'
  | 'theme'
  | 'schedule-venue'
  | 'rules'
  | 'registration'
  | 'payment'
  | 'contact'
  | 'brochure';

export interface InstitutionDetails {
  collegeName: string;
  department: string;
  city: string;
  state: string;
}

export type DietaryPreference =
  | 'Vegetarian'
  | 'Non-Vegetarian'
  | 'Vegan'
  | 'Jain'
  | 'Eggetarian';

export const DIETARY_PREFERENCE_OPTIONS: DietaryPreference[] = [
  'Vegetarian',
  'Non-Vegetarian',
  'Vegan',
  'Jain',
  'Eggetarian',
];

export interface ParticipantDetails {
  fullName: string;
  email: string;
  phone: string;
  dietaryPreference: DietaryPreference | '';
  dietaryNotes?: string;
}

export interface UploadedFileSummary {
  fileName: string;
  fileSize: number; // in bytes
  fileType: string;
  previewUrl?: string;
  uploadedAt: string;
}

export interface ContingentRegistration {
  institution: InstitutionDetails;
  leader: ParticipantDetails; // Participant 1
  participant2: ParticipantDetails;
  participant3: ParticipantDetails;
  participant4: ParticipantDetails;
  idCards: {
    leader?: UploadedFileSummary;
    participant2?: UploadedFileSummary;
    participant3?: UploadedFileSummary;
    participant4?: UploadedFileSummary;
  };
  declarations: {
    sameInstitution: boolean;
    fourMembersOnly: boolean;
    dressCodeFormals: boolean;
    laptopsAndDongles: boolean;
    noBackendAssistance: boolean;
    sjccRulesConsent: boolean;
  };
  registrationFee: number; // ₹7,000
  createdAt: string;
  status: 'DRAFT' | 'READY_FOR_PAYMENT' | 'PAYMENT_PENDING';
}
