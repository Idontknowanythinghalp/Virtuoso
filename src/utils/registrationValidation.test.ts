import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  isValidPhone,
  validateInstitution,
  validateParticipant,
  validateUploadedFile,
  checkContingentCompleteness,
  MAX_FILE_SIZE_BYTES,
} from './registrationValidation';
import { ContingentRegistration } from '../types';

test('email validation correctly identifies valid and invalid emails', () => {
  assert.equal(isValidEmail('leader@college.edu'), true);
  assert.equal(isValidEmail('student.bba@gmail.com'), true);
  assert.equal(isValidEmail('plainaddress'), false);
  assert.equal(isValidEmail('missingdomain@'), false);
  assert.equal(isValidEmail(''), false);
});

test('phone validation identifies valid 10-digit Indian numbers and prefixes', () => {
  assert.equal(isValidPhone('9876543210'), true);
  assert.equal(isValidPhone('+91 9876543210'), true);
  assert.equal(isValidPhone('09876543210'), true);
  assert.equal(isValidPhone('8088006881'), true);
  assert.equal(isValidPhone('12345'), false);
  assert.equal(isValidPhone('abcdefghij'), false);
});

test('institution validation requires all institutional fields', () => {
  const invalid = validateInstitution({
    collegeName: '',
    department: '',
    city: '',
    state: '',
  });
  assert.equal(invalid.isValid, false);
  assert.equal(Object.keys(invalid.errors).length, 4);

  const valid = validateInstitution({
    collegeName: "St. Xavier's College",
    department: 'Department of Management',
    city: 'Mumbai',
    state: 'Maharashtra',
  });
  assert.equal(valid.isValid, true);
  assert.equal(Object.keys(valid.errors).length, 0);
});

test('file upload validation enforces 5MB limit and formats', () => {
  assert.equal(
    validateUploadedFile({ name: 'id_card.png', size: 1024 * 1024, type: 'image/png' }).isValid,
    true
  );
  assert.equal(
    validateUploadedFile({ name: 'college_id.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' }).isValid,
    true
  );
  // Exceeds size
  assert.equal(
    validateUploadedFile({ name: 'huge_id.png', size: MAX_FILE_SIZE_BYTES + 100, type: 'image/png' }).isValid,
    false
  );
  // Disallowed type
  assert.equal(
    validateUploadedFile({ name: 'script.exe', size: 1024, type: 'application/x-msdownload' }).isValid,
    false
  );
});

test('contingent completeness validates exactly 4 participants, 4 IDs, unique emails, and declarations', () => {
  const mockValidContingent: ContingentRegistration = {
    institution: {
      collegeName: 'Christ University',
      department: 'School of Business and Management',
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    leader: {
      fullName: 'Aditya Sharma',
      email: 'aditya@christ.edu',
      phone: '9876543210',
      dietaryPreference: 'Vegetarian',
      dietaryNotes: 'No peanuts',
    },
    participant2: {
      fullName: 'Rhea Kurian',
      email: 'rhea@christ.edu',
      phone: '9876543211',
      dietaryPreference: 'Non-Vegetarian',
    },
    participant3: {
      fullName: 'Karan Mehra',
      email: 'karan@christ.edu',
      phone: '9876543212',
      dietaryPreference: 'Jain',
    },
    participant4: {
      fullName: 'Ananya Rao',
      email: 'ananya@christ.edu',
      phone: '9876543213',
      dietaryPreference: 'Vegan',
    },
    idCards: {
      leader: { fileName: 'aditya_id.pdf', fileSize: 100000, fileType: 'application/pdf', uploadedAt: '2026-12-01' },
      participant2: { fileName: 'rhea_id.jpg', fileSize: 100000, fileType: 'image/jpeg', uploadedAt: '2026-12-01' },
      participant3: { fileName: 'karan_id.jpg', fileSize: 100000, fileType: 'image/jpeg', uploadedAt: '2026-12-01' },
      participant4: { fileName: 'ananya_id.png', fileSize: 100000, fileType: 'image/png', uploadedAt: '2026-12-01' },
    },
    declarations: {
      sameInstitution: true,
      fourMembersOnly: true,
      dressCodeFormals: true,
      laptopsAndDongles: true,
      noBackendAssistance: true,
      sjccRulesConsent: true,
    },
    registrationFee: 7000,
    createdAt: '2026-12-01T10:00:00.000Z',
    status: 'READY_FOR_PAYMENT',
  };

  const completeResult = checkContingentCompleteness(mockValidContingent);
  assert.equal(completeResult.isComplete, true);
  assert.equal(completeResult.missingItems.length, 0);

  // Missing dietary preference on Member 3 fails completeness
  const missingDietaryContingent: ContingentRegistration = {
    ...mockValidContingent,
    participant3: {
      ...mockValidContingent.participant3,
      dietaryPreference: '',
    },
  };
  const missingDietaryResult = checkContingentCompleteness(missingDietaryContingent);
  assert.equal(missingDietaryResult.isComplete, false);
  assert.match(missingDietaryResult.missingItems[0], /Participant 3 details incomplete/);

  // Missing one ID
  const incompleteContingent = {
    ...mockValidContingent,
    idCards: {
      ...mockValidContingent.idCards,
      participant4: undefined,
    },
  };
  const incompleteResult = checkContingentCompleteness(incompleteContingent);
  assert.equal(incompleteResult.isComplete, false);
  assert.match(incompleteResult.missingItems[0], /College ID cards missing/);
});

test('participant validation requires dietary preference for each contingent member', () => {
  const missingDietary = validateParticipant(
    {
      fullName: 'Aarav Nair',
      email: 'aarav@college.edu',
      phone: '9876543210',
      dietaryPreference: '',
    },
    'Contingent Leader'
  );
  assert.equal(missingDietary.isValid, false);
  assert.match(missingDietary.errors.dietaryPreference ?? '', /dietary preference/i);

  const validParticipant = validateParticipant(
    {
      fullName: 'Aarav Nair',
      email: 'aarav@college.edu',
      phone: '9876543210',
      dietaryPreference: 'Eggetarian',
      dietaryNotes: 'No shellfish',
    },
    'Contingent Leader'
  );
  assert.equal(validParticipant.isValid, true);
  assert.equal(Object.keys(validParticipant.errors).length, 0);
});
