import {
  ContingentRegistration,
  DIETARY_PREFERENCE_OPTIONS,
  DietaryPreference,
  InstitutionDetails,
  ParticipantDetails,
  UploadedFileSummary,
} from '../types';

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

export function isValidEmail(email: string): boolean {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  // Clean spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Match 10 digits, or +91 followed by 10 digits, or 0 followed by 10 digits
  const re = /^(?:\+91|91|0)?[6-9]\d{9}$/;
  return re.test(cleaned);
}

export function validateInstitution(inst: InstitutionDetails): { isValid: boolean; errors: Partial<Record<keyof InstitutionDetails, string>> } {
  const errors: Partial<Record<keyof InstitutionDetails, string>> = {};

  if (!inst.collegeName || inst.collegeName.trim().length < 3) {
    errors.collegeName = 'Please enter the official institution / college name (min 3 characters).';
  }
  if (!inst.department || inst.department.trim().length < 2) {
    errors.department = 'Please enter your department (e.g. BBA / Management Studies).';
  }
  if (!inst.city || inst.city.trim().length < 2) {
    errors.city = 'Please enter the institution city.';
  }
  if (!inst.state || inst.state.trim().length < 2) {
    errors.state = 'Please enter the institution state.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateParticipant(
  part: ParticipantDetails,
  roleLabel: string
): { isValid: boolean; errors: Partial<Record<keyof ParticipantDetails, string>> } {
  const errors: Partial<Record<keyof ParticipantDetails, string>> = {};

  if (!part.fullName || part.fullName.trim().length < 2) {
    errors.fullName = `${roleLabel}: Full legal name is required.`;
  }
  if (!part.email || !isValidEmail(part.email)) {
    errors.email = `${roleLabel}: A valid email address is required.`;
  }
  if (!part.phone || !isValidPhone(part.phone)) {
    errors.phone = `${roleLabel}: A valid 10-digit mobile number is required (e.g. 9876543210).`;
  }
  if (
    !part.dietaryPreference ||
    !DIETARY_PREFERENCE_OPTIONS.includes(part.dietaryPreference as DietaryPreference)
  ) {
    errors.dietaryPreference = `${roleLabel}: Please select a dietary preference.`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateUploadedFile(file: { name: string; size: number; type: string }): { isValid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the 5 MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const isAllowedType = ALLOWED_FILE_TYPES.includes(file.type.toLowerCase()) ||
    /\.(jpe?g|png|pdf)$/i.test(file.name);

  if (!isAllowedType) {
    return {
      isValid: false,
      error: 'Invalid file format. Only JPEG, PNG, or PDF college ID cards are accepted.',
    };
  }

  return { isValid: true };
}

export function checkContingentCompleteness(data: ContingentRegistration): {
  isComplete: boolean;
  missingItems: string[];
} {
  const missingItems: string[] = [];

  const instCheck = validateInstitution(data.institution);
  if (!instCheck.isValid) {
    missingItems.push('Institution Information incomplete');
  }

  const leaderCheck = validateParticipant(data.leader, 'Contingent Leader');
  if (!leaderCheck.isValid) {
    missingItems.push('Contingent Leader details incomplete');
  }

  const p2Check = validateParticipant(data.participant2, 'Participant 2');
  if (!p2Check.isValid) {
    missingItems.push('Participant 2 details incomplete');
  }

  const p3Check = validateParticipant(data.participant3, 'Participant 3');
  if (!p3Check.isValid) {
    missingItems.push('Participant 3 details incomplete');
  }

  const p4Check = validateParticipant(data.participant4, 'Participant 4');
  if (!p4Check.isValid) {
    missingItems.push('Participant 4 details incomplete');
  }

  // Check unique emails
  const emails = [
    data.leader.email?.trim().toLowerCase(),
    data.participant2.email?.trim().toLowerCase(),
    data.participant3.email?.trim().toLowerCase(),
    data.participant4.email?.trim().toLowerCase(),
  ].filter(Boolean);

  if (new Set(emails).size !== 4 && emails.length === 4) {
    missingItems.push('Each of the four participants must have a distinct personal email address');
  }

  // Check ID uploads
  const ids: (UploadedFileSummary | undefined)[] = [
    data.idCards.leader,
    data.idCards.participant2,
    data.idCards.participant3,
    data.idCards.participant4,
  ];

  const uploadedCount = ids.filter(Boolean).length;
  if (uploadedCount < 4) {
    missingItems.push(`College ID cards missing (${uploadedCount}/4 uploaded)`);
  }

  // Check declarations
  const decls = data.declarations;
  if (!decls.sameInstitution || !decls.fourMembersOnly || !decls.dressCodeFormals || !decls.laptopsAndDongles || !decls.noBackendAssistance || !decls.sjccRulesConsent) {
    missingItems.push('All official declarations and code of conduct consents must be acknowledged');
  }

  return {
    isComplete: missingItems.length === 0,
    missingItems,
  };
}
