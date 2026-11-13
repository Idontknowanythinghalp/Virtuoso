/**
 * Isolated API Integration Layer for Virtuoso 2026.
 * 
 * NOTE FOR SJCC COLLEGE WEB HANDLER:
 * This module is prepared specifically to integrate with St. Joseph's College of Commerce's
 * official backend infrastructure, database, and payment gateway.
 * 
 * When deploying on SJCC servers:
 * 1. Implement the `SJCCBackendAdapter` interface with the live college endpoint(s).
 * 2. Connect the college payment gateway (Razorpay / BillDesk / SBI ePay / ICICI) in `paymentService`.
 * 3. Replace the local staging adapter below with your authenticated HTTPS calls.
 */

import { ContingentRegistration, ParticipantDetails } from '../types';

const STORAGE_KEY = 'virtuoso_2026_contingent_draft';

export interface SJCCBackendAdapter {
  saveDraft(registration: ContingentRegistration): Promise<{ success: boolean; message: string }>;
  getDraft(): Promise<ContingentRegistration | null>;
  clearDraft(): Promise<void>;
  validateContingentEligibility(collegeName: string, department: string): Promise<{ eligible: boolean; reason?: string }>;
  preparePaymentPayload(registration: ContingentRegistration): Promise<{ paymentReferenceId?: string; status: 'PENDING_INTEGRATION' }>;
}

export const defaultContingentState: ContingentRegistration = {
  institution: {
    collegeName: '',
    department: '',
    city: '',
    state: '',
  },
  leader: {
    fullName: '',
    email: '',
    phone: '',
    dietaryPreference: '',
    dietaryNotes: '',
  },
  participant2: {
    fullName: '',
    email: '',
    phone: '',
    dietaryPreference: '',
    dietaryNotes: '',
  },
  participant3: {
    fullName: '',
    email: '',
    phone: '',
    dietaryPreference: '',
    dietaryNotes: '',
  },
  participant4: {
    fullName: '',
    email: '',
    phone: '',
    dietaryPreference: '',
    dietaryNotes: '',
  },
  idCards: {},
  declarations: {
    sameInstitution: false,
    fourMembersOnly: false,
    dressCodeFormals: false,
    laptopsAndDongles: false,
    noBackendAssistance: false,
    sjccRulesConsent: false,
  },
  registrationFee: 7000,
  createdAt: new Date().toISOString(),
  status: 'DRAFT',
};

class LocalStagingAdapter implements SJCCBackendAdapter {
  async saveDraft(registration: ContingentRegistration): Promise<{ success: boolean; message: string }> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(registration));
      }
      return { success: true, message: 'Draft preserved locally in browser session.' };
    } catch {
      return { success: false, message: 'Unable to write to local storage.' };
    }
  }

  async getDraft(): Promise<ContingentRegistration | null> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<ContingentRegistration>;
          const normalizeParticipant = (
            part?: Partial<ParticipantDetails>
          ): ParticipantDetails => ({
            fullName: part?.fullName ?? '',
            email: part?.email ?? '',
            phone: part?.phone ?? '',
            dietaryPreference: part?.dietaryPreference ?? '',
            dietaryNotes: part?.dietaryNotes ?? '',
          });

          return {
            ...defaultContingentState,
            ...parsed,
            institution: {
              ...defaultContingentState.institution,
              ...parsed.institution,
            },
            leader: normalizeParticipant(parsed.leader),
            participant2: normalizeParticipant(parsed.participant2),
            participant3: normalizeParticipant(parsed.participant3),
            participant4: normalizeParticipant(parsed.participant4),
            idCards: {
              ...parsed.idCards,
            },
            declarations: {
              ...defaultContingentState.declarations,
              ...parsed.declarations,
            },
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async clearDraft(): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  async validateContingentEligibility(collegeName: string, department: string): Promise<{ eligible: boolean; reason?: string }> {
    if (!collegeName.trim() || !department.trim()) {
      return { eligible: false, reason: 'Institution name and department are required.' };
    }
    // Future SJCC API will check single-contingent per college policy
    return { eligible: true };
  }

  async preparePaymentPayload(_registration: ContingentRegistration): Promise<{ paymentReferenceId?: string; status: 'PENDING_INTEGRATION' }> {
    return {
      status: 'PENDING_INTEGRATION',
    };
  }
}

export const sjccApi = new LocalStagingAdapter();
