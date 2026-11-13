import React, { useState, useEffect } from 'react';
import {
  AppRoute,
  ContingentRegistration,
  DIETARY_PREFERENCE_OPTIONS,
  ParticipantDetails,
  InstitutionDetails,
  UploadedFileSummary,
} from '../../types';
import { GoldDivider } from '../common/GoldDivider';
import { sjccApi, defaultContingentState } from '../../services/api';
import { useSound } from '../../contexts/SoundContext';
import {
  validateInstitution,
  validateParticipant,
  validateUploadedFile,
  checkContingentCompleteness,
  MAX_FILE_SIZE_BYTES,
} from '../../utils/registrationValidation';
import {
  Building,
  User,
  Users,
  FileUp,
  CheckSquare,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  AlertCircle,
  FileCheck,
  Trash2,
  ShieldAlert,
  CreditCard,
  Check,
} from 'lucide-react';

interface RegistrationPageProps {
  onRouteChange: (route: AppRoute) => void;
}

export const RegistrationPage: React.FC<RegistrationPageProps> = ({ onRouteChange }) => {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [formData, setFormData] = useState<ContingentRegistration>(defaultContingentState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftSavedToast, setDraftSavedToast] = useState(false);
  const { playClick, playSuccess, playError } = useSound();

  // Load existing draft if present
  useEffect(() => {
    async function loadDraft() {
      const saved = await sjccApi.getDraft();
      if (saved) {
        setFormData(saved);
      }
    }
    loadDraft();
  }, []);

  // Save draft on change
  const updateAndSave = (updated: ContingentRegistration) => {
    setFormData(updated);
    sjccApi.saveDraft(updated);
  };

  const steps = [
    { num: 1, title: 'Institution', icon: <Building className="w-4 h-4" /> },
    { num: 2, title: 'Leader', icon: <User className="w-4 h-4" /> },
    { num: 3, title: 'Member 2', icon: <Users className="w-4 h-4" /> },
    { num: 4, title: 'Member 3', icon: <Users className="w-4 h-4" /> },
    { num: 5, title: 'Member 4', icon: <Users className="w-4 h-4" /> },
    { num: 6, title: 'ID Cards', icon: <FileUp className="w-4 h-4" /> },
    { num: 7, title: 'Declaration', icon: <CheckSquare className="w-4 h-4" /> },
    { num: 8, title: 'Review', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  // Validation per step
  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (currentStep === 1) {
      const { isValid, errors: instErrors } = validateInstitution(formData.institution);
      if (!isValid) {
        Object.assign(newErrors, instErrors);
      }
    } else if (currentStep === 2) {
      const { isValid, errors: leaderErrors } = validateParticipant(formData.leader, 'Contingent Leader');
      if (!isValid) {
        Object.assign(newErrors, leaderErrors);
      }
    } else if (currentStep === 3) {
      const { isValid, errors: p2Errors } = validateParticipant(formData.participant2, 'Participant 2');
      if (!isValid) {
        Object.assign(newErrors, p2Errors);
      }
      if (formData.participant2.email && formData.participant2.email.toLowerCase() === formData.leader.email.toLowerCase()) {
        newErrors.email = 'Participant 2 cannot share the same email as the Contingent Leader.';
      }
    } else if (currentStep === 4) {
      const { isValid, errors: p3Errors } = validateParticipant(formData.participant3, 'Participant 3');
      if (!isValid) {
        Object.assign(newErrors, p3Errors);
      }
      const existingEmails = [formData.leader.email, formData.participant2.email].map(e => e.toLowerCase());
      if (formData.participant3.email && existingEmails.includes(formData.participant3.email.toLowerCase())) {
        newErrors.email = 'Participant 3 cannot share an email with prior participants.';
      }
    } else if (currentStep === 5) {
      const { isValid, errors: p4Errors } = validateParticipant(formData.participant4, 'Participant 4');
      if (!isValid) {
        Object.assign(newErrors, p4Errors);
      }
      const existingEmails = [formData.leader.email, formData.participant2.email, formData.participant3.email].map(e => e.toLowerCase());
      if (formData.participant4.email && existingEmails.includes(formData.participant4.email.toLowerCase())) {
        newErrors.email = 'Participant 4 cannot share an email with prior participants.';
      }
    } else if (currentStep === 6) {
      // Validate 4 ID uploads
      if (!formData.idCards.leader) newErrors.leaderId = 'Please upload College ID for Contingent Leader.';
      if (!formData.idCards.participant2) newErrors.p2Id = 'Please upload College ID for Participant 2.';
      if (!formData.idCards.participant3) newErrors.p3Id = 'Please upload College ID for Participant 3.';
      if (!formData.idCards.participant4) newErrors.p4Id = 'Please upload College ID for Participant 4.';
    } else if (currentStep === 7) {
      // Validate declarations
      const d = formData.declarations;
      if (!d.sameInstitution || !d.fourMembersOnly || !d.dressCodeFormals || !d.laptopsAndDongles || !d.noBackendAssistance || !d.sjccRulesConsent) {
        newErrors.declarations = 'All mandatory declarations and institutional undertakings must be confirmed.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setErrors({});
      if (currentStep === 7) {
        playSuccess();
      } else {
        playClick();
      }
      if (currentStep < 8) {
        setCurrentStep((prev) => prev + 1);
        window.scrollTo({ top: 120, behavior: 'smooth' });
      }
    } else {
      playError();
    }
  };

  const handlePrev = () => {
    setErrors({});
    if (currentStep > 1) {
      playClick();
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
  };

  // Generic participant field handler
  const handleParticipantChange = (
    key: 'leader' | 'participant2' | 'participant3' | 'participant4',
    field: keyof ParticipantDetails,
    value: string
  ) => {
    const updated = {
      ...formData,
      [key]: {
        ...formData[key],
        [field]: value,
      },
    };
    updateAndSave(updated);
  };

  const renderDietaryFields = (
    slot: 'leader' | 'participant2' | 'participant3' | 'participant4',
    prefix: string
  ) => {
    const participant = formData[slot];
    return (
      <div className="space-y-4 pt-2 border-t border-[#B9873F]/15">
        <div className="space-y-2">
          <span className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
            Dietary Preference *
          </span>
          <div
            role="radiogroup"
            aria-label={`${prefix} Dietary Preference`}
            className="grid grid-cols-2 sm:grid-cols-5 gap-2.5"
          >
            {DIETARY_PREFERENCE_OPTIONS.map((option) => {
              const isSelected = participant.dietaryPreference === option;
              return (
                <button
                  key={option}
                  id={`${prefix}-dietary-${option.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => {
                    playClick();
                    handleParticipantChange(slot, 'dietaryPreference', option);
                    if (errors.dietaryPreference) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.dietaryPreference;
                        return next;
                      });
                    }
                  }}
                  className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#4B0507] border-[#F0D18B] text-[#FFFFFF] shadow-[0_0_12px_rgba(240,209,139,0.22)]'
                      : 'bg-[#200000] border-[#B9873F]/35 text-[#D9AD61] hover:border-[#D9AD61] hover:text-[#FFFFFF]'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#F0D18B] shrink-0" />}
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
          {errors.dietaryPreference && (
            <p className="text-xs text-rose-400 mt-1">{errors.dietaryPreference}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor={`${prefix}DietaryNotes`}
            className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]"
          >
            Food Allergies / Specific Dietary Notes (Optional)
          </label>
          <input
            id={`${prefix}DietaryNotes`}
            type="text"
            placeholder="e.g. Nut allergy, lactose intolerant, gluten-free (leave blank if none)"
            value={participant.dietaryNotes || ''}
            onChange={(e) => handleParticipantChange(slot, 'dietaryNotes', e.target.value)}
            className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
          />
        </div>
      </div>
    );
  };

  // Institution field handler
  const handleInstitutionChange = (field: keyof InstitutionDetails, value: string) => {
    const updated = {
      ...formData,
      institution: {
        ...formData.institution,
        [field]: value,
      },
    };
    updateAndSave(updated);
  };

  // File upload handler
  const handleFileUpload = (
    slot: 'leader' | 'participant2' | 'participant3' | 'participant4',
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateUploadedFile(file);
    if (!validation.isValid) {
      playError();
      setErrors((prev) => ({ ...prev, [slot + 'Id']: validation.error || 'Invalid file' }));
      return;
    }

    // Clean error
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[slot + 'Id'];
      return copy;
    });

    const summary: UploadedFileSummary = {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      uploadedAt: new Date().toISOString(),
    };

    // If image, create object url for preview
    if (file.type.startsWith('image/')) {
      summary.previewUrl = URL.createObjectURL(file);
    }

    const updated = {
      ...formData,
      idCards: {
        ...formData.idCards,
        [slot]: summary,
      },
    };
    updateAndSave(updated);
  };

  const handleRemoveFile = (slot: 'leader' | 'participant2' | 'participant3' | 'participant4') => {
    const updated = {
      ...formData,
      idCards: {
        ...formData.idCards,
        [slot]: undefined,
      },
    };
    updateAndSave(updated);
  };

  // Declaration checkbox handler
  const handleDeclarationToggle = (key: keyof ContingentRegistration['declarations']) => {
    const updated = {
      ...formData,
      declarations: {
        ...formData.declarations,
        [key]: !formData.declarations[key],
      },
    };
    updateAndSave(updated);
  };

  const completeness = checkContingentCompleteness(formData);

  return (
    <div className="w-full min-h-screen bg-[#200000] text-[#F0D18B] py-12 md:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <span className="text-xs uppercase tracking-[0.25em] text-[#D9AD61] font-serif-luxury">
            Official Portal
          </span>
          <h1 className="font-serif-luxury text-3xl sm:text-5xl font-extrabold text-[#FFFFFF]">
            Contingent Registration
          </h1>
          <p className="text-xs sm:text-sm text-[#D9AD61]/80 max-w-xl mx-auto leading-relaxed">
            National Level Inter-Collegiate Management Fest • 4th & 5th December 2026.
            Each contingent must comprise <strong>exactly four participants</strong> from the same institution.
          </p>
        </div>

        {/* Progress Indicator (8 Steps) */}
        <div className="bg-[#330205]/70 p-4 rounded-xl border border-[#B9873F]/25 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[620px] gap-2">
            {steps.map((s, idx) => {
              const isPassed = currentStep > s.num;
              const isCurrent = currentStep === s.num;
              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => {
                    // Allow navigating to any previous step or current step
                    if (s.num <= currentStep) {
                      setErrors({});
                      setCurrentStep(s.num);
                    }
                  }}
                  className={`flex flex-col items-center gap-1.5 focus:outline-none transition-all flex-1 ${
                    isCurrent
                      ? 'text-[#FFFFFF] scale-105'
                      : isPassed
                      ? 'text-[#D9AD61] hover:text-[#FFFFFF]'
                      : 'text-[#B9873F]/40 cursor-not-allowed'
                  }`}
                  aria-label={`Step ${s.num}: ${s.title}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border ${
                      isCurrent
                        ? 'bg-[#B9873F] text-[#200000] border-[#F0D18B] shadow-[0_0_10px_rgba(240,209,139,0.5)]'
                        : isPassed
                        ? 'bg-[#4B0507] text-[#D9AD61] border-[#B9873F]'
                        : 'bg-[#200000] text-[#B9873F]/40 border-[#B9873F]/20'
                    }`}
                  >
                    {isPassed ? <Check className="w-4 h-4" /> : s.num}
                  </div>
                  <span className="text-[11px] font-serif-luxury tracking-wide whitespace-nowrap">
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Container */}
        <div className="p-6 sm:p-10 rounded-2xl bg-gradient-to-b from-[#330205] to-[#200000] border border-[#B9873F]/30 shadow-2xl relative">
          {/* Step 1: Institution Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 01 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Institution & Department Details
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Official representation details. Only one contingent per college or department is permitted.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2 space-y-1.5">
                  <label htmlFor="collegeName" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Official College / Institution Name *
                  </label>
                  <input
                    id="collegeName"
                    type="text"
                    placeholder="e.g. St. Xavier's College / Christ University / Loyola College"
                    value={formData.institution.collegeName}
                    onChange={(e) => handleInstitutionChange('collegeName', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.collegeName && (
                    <p className="text-xs text-rose-400 mt-1">{errors.collegeName}</p>
                  )}
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label htmlFor="department" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Department / Faculty *
                  </label>
                  <input
                    id="department"
                    type="text"
                    placeholder="e.g. Department of Business Administration / School of Management"
                    value={formData.institution.department}
                    onChange={(e) => handleInstitutionChange('department', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.department && (
                    <p className="text-xs text-rose-400 mt-1">{errors.department}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="city" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    City *
                  </label>
                  <input
                    id="city"
                    type="text"
                    placeholder="e.g. Bengaluru / Mumbai / Chennai"
                    value={formData.institution.city}
                    onChange={(e) => handleInstitutionChange('city', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.city && (
                    <p className="text-xs text-rose-400 mt-1">{errors.city}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="state" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    State / Union Territory *
                  </label>
                  <input
                    id="state"
                    type="text"
                    placeholder="e.g. Karnataka / Maharashtra / Tamil Nadu"
                    value={formData.institution.state}
                    onChange={(e) => handleInstitutionChange('state', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.state && (
                    <p className="text-xs text-rose-400 mt-1">{errors.state}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Contingent Leader (Participant 1) */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 02 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Contingent Leader (Participant 1)
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  The contingent leader is one of the four active participants and acts as the official liaison with the Virtuoso secretariat.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="leaderName" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Full Legal Name *
                  </label>
                  <input
                    id="leaderName"
                    type="text"
                    placeholder="Full name as printed on College ID"
                    value={formData.leader.fullName}
                    onChange={(e) => handleParticipantChange('leader', 'fullName', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.fullName && <p className="text-xs text-rose-400 mt-1">{errors.fullName}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="leaderEmail" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Official / Personal Email Address *
                    </label>
                    <input
                      id="leaderEmail"
                      type="email"
                      placeholder="e.g. leader@college.edu / name@gmail.com"
                      value={formData.leader.email}
                      onChange={(e) => handleParticipantChange('leader', 'email', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="leaderPhone" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      10-Digit Mobile Number (WhatsApp) *
                    </label>
                    <input
                      id="leaderPhone"
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={formData.leader.phone}
                      onChange={(e) => handleParticipantChange('leader', 'phone', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.phone && <p className="text-xs text-rose-400 mt-1">{errors.phone}</p>}
                  </div>
                </div>

                {renderDietaryFields('leader', 'leader')}
              </div>
            </div>
          )}

          {/* Step 3: Participant 2 */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 03 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Participant 2 Information
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Second active contingent executive. Must belong to {formData.institution.collegeName || 'the same institution'}.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="p2Name" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Full Legal Name *
                  </label>
                  <input
                    id="p2Name"
                    type="text"
                    placeholder="Full name as printed on College ID"
                    value={formData.participant2.fullName}
                    onChange={(e) => handleParticipantChange('participant2', 'fullName', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.fullName && <p className="text-xs text-rose-400 mt-1">{errors.fullName}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="p2Email" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Personal Email Address *
                    </label>
                    <input
                      id="p2Email"
                      type="email"
                      placeholder="e.g. member2@college.edu"
                      value={formData.participant2.email}
                      onChange={(e) => handleParticipantChange('participant2', 'email', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="p2Phone" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      10-Digit Mobile Number *
                    </label>
                    <input
                      id="p2Phone"
                      type="tel"
                      placeholder="e.g. 9876543211"
                      value={formData.participant2.phone}
                      onChange={(e) => handleParticipantChange('participant2', 'phone', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.phone && <p className="text-xs text-rose-400 mt-1">{errors.phone}</p>}
                  </div>
                </div>

                {renderDietaryFields('participant2', 'p2')}
              </div>
            </div>
          )}

          {/* Step 4: Participant 3 */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 04 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Participant 3 Information
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Third active contingent executive. Must belong to {formData.institution.collegeName || 'the same institution'}.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="p3Name" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Full Legal Name *
                  </label>
                  <input
                    id="p3Name"
                    type="text"
                    placeholder="Full name as printed on College ID"
                    value={formData.participant3.fullName}
                    onChange={(e) => handleParticipantChange('participant3', 'fullName', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.fullName && <p className="text-xs text-rose-400 mt-1">{errors.fullName}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="p3Email" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Personal Email Address *
                    </label>
                    <input
                      id="p3Email"
                      type="email"
                      placeholder="e.g. member3@college.edu"
                      value={formData.participant3.email}
                      onChange={(e) => handleParticipantChange('participant3', 'email', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="p3Phone" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      10-Digit Mobile Number *
                    </label>
                    <input
                      id="p3Phone"
                      type="tel"
                      placeholder="e.g. 9876543212"
                      value={formData.participant3.phone}
                      onChange={(e) => handleParticipantChange('participant3', 'phone', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.phone && <p className="text-xs text-rose-400 mt-1">{errors.phone}</p>}
                  </div>
                </div>

                {renderDietaryFields('participant3', 'p3')}
              </div>
            </div>
          )}

          {/* Step 5: Participant 4 */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 05 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Participant 4 Information
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Fourth and final contingent member. Exactly four members form the complete executive unit.
                </p>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="p4Name" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                    Full Legal Name *
                  </label>
                  <input
                    id="p4Name"
                    type="text"
                    placeholder="Full name as printed on College ID"
                    value={formData.participant4.fullName}
                    onChange={(e) => handleParticipantChange('participant4', 'fullName', e.target.value)}
                    className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                  />
                  {errors.fullName && <p className="text-xs text-rose-400 mt-1">{errors.fullName}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="p4Email" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      Personal Email Address *
                    </label>
                    <input
                      id="p4Email"
                      type="email"
                      placeholder="e.g. member4@college.edu"
                      value={formData.participant4.email}
                      onChange={(e) => handleParticipantChange('participant4', 'email', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.email && <p className="text-xs text-rose-400 mt-1">{errors.email}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="p4Phone" className="block text-xs font-semibold uppercase tracking-wider text-[#F0D18B]">
                      10-Digit Mobile Number *
                    </label>
                    <input
                      id="p4Phone"
                      type="tel"
                      placeholder="e.g. 9876543213"
                      value={formData.participant4.phone}
                      onChange={(e) => handleParticipantChange('participant4', 'phone', e.target.value)}
                      className="w-full px-4 py-3 bg-[#200000] border border-[#B9873F]/40 rounded-lg text-sm text-[#FFFFFF] placeholder-[#B9873F]/40 focus:outline-none focus:border-[#F0D18B] transition-colors"
                    />
                    {errors.phone && <p className="text-xs text-rose-400 mt-1">{errors.phone}</p>}
                  </div>
                </div>

                {renderDietaryFields('participant4', 'p4')}
              </div>
            </div>
          )}

          {/* Step 6: College ID Uploads for all 4 */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 06 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  College ID Card Uploads
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Upload official college photo ID cards for each of the four participants. Accepted formats: PDF, PNG, JPG, JPEG (Max 5 MB each).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { slot: 'leader' as const, title: 'Contingent Leader ID', name: formData.leader.fullName || 'Member 1', error: errors.leaderId },
                  { slot: 'participant2' as const, title: 'Participant 2 ID', name: formData.participant2.fullName || 'Member 2', error: errors.p2Id },
                  { slot: 'participant3' as const, title: 'Participant 3 ID', name: formData.participant3.fullName || 'Member 3', error: errors.p3Id },
                  { slot: 'participant4' as const, title: 'Participant 4 ID', name: formData.participant4.fullName || 'Member 4', error: errors.p4Id },
                ].map(({ slot, title, name, error }) => {
                  const uploaded = formData.idCards[slot];
                  return (
                    <div
                      key={slot}
                      className={`p-5 rounded-xl bg-[#200000] border transition-all ${
                        uploaded ? 'border-emerald-500/50 bg-[#250d0d]' : error ? 'border-rose-500/60' : 'border-[#B9873F]/30 hover:border-[#D9AD61]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-serif-luxury text-[#FFFFFF] font-bold">
                          {title}
                        </span>
                        {uploaded && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Uploaded
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#D9AD61] truncate mb-3">
                        Participant: <strong>{name}</strong>
                      </p>

                      {uploaded ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between p-3 rounded bg-[#330205] border border-[#B9873F]/30 text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="text-[#FFFFFF] truncate font-medium">
                                {uploaded.fileName}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#B9873F] shrink-0 ml-2">
                              {(uploaded.fileSize / (1024 * 1024)).toFixed(2)} MB
                            </span>
                          </div>

                          {uploaded.previewUrl && (
                            <div className="h-28 overflow-hidden rounded border border-[#B9873F]/20">
                              <img
                                src={uploaded.previewUrl}
                                alt="ID preview"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveFile(slot)}
                            className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove and replace ID</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label
                            htmlFor={`upload-${slot}`}
                            className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[#B9873F]/40 hover:border-[#F0D18B] rounded-lg cursor-pointer bg-[#330205]/40 hover:bg-[#330205] transition-all group"
                          >
                            <FileUp className="w-6 h-6 text-[#D9AD61] group-hover:scale-110 transition-transform mb-1.5" />
                            <span className="text-xs font-semibold text-[#F0D18B] text-center">
                              Click to select ID Card
                            </span>
                            <span className="text-[10px] text-[#B9873F] mt-0.5">
                              JPEG, PNG, or PDF up to 5 MB
                            </span>
                          </label>
                          <input
                            id={`upload-${slot}`}
                            type="file"
                            accept=".pdf,image/png,image/jpeg,image/jpg"
                            onChange={(e) => handleFileUpload(slot, e)}
                            className="sr-only"
                          />
                          {error && <p className="text-xs text-rose-400 mt-1.5">{error}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-4 rounded-lg bg-[#180000] border border-[#B9873F]/20 text-xs text-[#D9AD61]/80">
                <strong>Manual Committee Verification:</strong> The Virtuoso organizing committee inspects all 4 ID cards after payment. Please ensure college seal, student photograph, and active academic year are clearly legible.
              </div>
            </div>
          )}

          {/* Step 7: Declaration & Institutional Consent */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 07 of 08
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Declaration & Code of Conduct
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Contingent leaders must confirm compliance on behalf of all four executives.
                </p>
              </div>

              <div className="space-y-4">
                {[
                  {
                    key: 'sameInstitution' as const,
                    title: 'Single Institutional Integrity',
                    desc: `All four members are bona-fide regular undergraduate students of ${formData.institution.collegeName || 'the declared institution'}. No cross-college participants are included.`,
                  },
                  {
                    key: 'fourMembersOnly' as const,
                    title: 'Contingent Quorum (Exactly 4 Members)',
                    desc: 'We understand that our contingent consists strictly of four individuals (leader + 3 members). No extra delegates, proxies, or alternate participants are permitted.',
                  },
                  {
                    key: 'dressCodeFormals' as const,
                    title: 'Executive Western Formal Attire',
                    desc: 'All contingent members will strictly maintain western formal attire (suits, blazers, executive formals) and decorum during both days.',
                  },
                  {
                    key: 'laptopsAndDongles' as const,
                    title: 'Mandatory Technical Equipment',
                    desc: 'All participants will compulsorily carry functional personal laptops, internet dongles, and USB pen drives for competition rounds.',
                  },
                  {
                    key: 'noBackendAssistance' as const,
                    title: 'Prohibition of Back-End Teams',
                    desc: 'No outside assistance, remote advisory teams, or back-end strategy desks will be used. Violation results in immediate disqualification.',
                  },
                  {
                    key: 'sjccRulesConsent' as const,
                    title: 'St. Joseph’s College of Commerce Authority',
                    desc: 'We agree that the decision of the Core Committee and the Management of St. Joseph’s College of Commerce will be final and binding on all proceedings.',
                  },
                ].map(({ key, title, desc }) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 p-4 rounded-xl bg-[#200000] border border-[#B9873F]/25 hover:border-[#D9AD61]/60 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.declarations[key]}
                      onChange={() => handleDeclarationToggle(key)}
                      className="mt-1 h-4 w-4 rounded border-[#B9873F] text-[#B9873F] focus:ring-[#D9AD61] accent-[#B9873F]"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-serif-luxury font-bold text-[#FFFFFF] block">
                        {title}
                      </span>
                      <span className="text-xs text-[#D9AD61]/80 leading-relaxed block">
                        {desc}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              {errors.declarations && (
                <div className="p-3 rounded bg-rose-950/60 border border-rose-500/50 text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errors.declarations}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 8: Registration Review & Summary */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <div className="border-b border-[#B9873F]/20 pb-4">
                <span className="text-xs uppercase tracking-widest text-[#D9AD61] font-serif-luxury">
                  Step 08 of 08 • Final Review
                </span>
                <h2 className="font-serif-luxury text-2xl font-bold text-[#FFFFFF] mt-1">
                  Contingent Registration Review
                </h2>
                <p className="text-xs text-[#D9AD61]/80 mt-1">
                  Please review all contingent information carefully before proceeding to the payment gate briefing.
                </p>
              </div>

              {/* Status Banner */}
              <div className="p-4 rounded-xl bg-[#1c0000] border border-[#B9873F]/40 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-[#B9873F] font-serif-luxury block">
                    Institutional Fee
                  </span>
                  <span className="font-serif-luxury text-2xl font-bold text-[#FFFFFF]">
                    ₹7,000 <span className="text-xs font-normal text-[#D9AD61] font-sans-clean">/ Contingent (4 Members)</span>
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase tracking-widest text-[#B9873F] font-serif-luxury block">
                    Form Completion
                  </span>
                  <span className={`text-xs font-bold ${completeness.isComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {completeness.isComplete ? 'All Requirements Verified' : 'Incomplete Sections'}
                  </span>
                </div>
              </div>

              {/* Institution Card */}
              <div className="p-5 rounded-xl bg-[#200000] border border-[#B9873F]/25 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-serif-luxury uppercase tracking-wider text-[#D9AD61] font-bold">
                    Institution & Department
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-[#F0D18B] hover:text-[#FFFFFF] underline"
                  >
                    Edit
                  </button>
                </div>
                <h3 className="font-serif-luxury text-lg font-bold text-[#FFFFFF]">
                  {formData.institution.collegeName || 'Not provided'}
                </h3>
                <p className="text-xs text-[#D9AD61]">
                  {formData.institution.department} • {formData.institution.city}, {formData.institution.state}
                </p>
              </div>

              {/* 4 Participants Roster */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-serif-luxury uppercase tracking-wider text-[#D9AD61] font-bold">
                    Contingent Executive Roster (4 Members)
                  </span>
                  <span className="text-xs text-[#B9873F]">
                    Strictly 4 Members
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { role: 'Contingent Leader (Member 1)', data: formData.leader, idSlot: 'leader' as const, stepNum: 2 },
                    { role: 'Participant 2', data: formData.participant2, idSlot: 'participant2' as const, stepNum: 3 },
                    { role: 'Participant 3', data: formData.participant3, idSlot: 'participant3' as const, stepNum: 4 },
                    { role: 'Participant 4', data: formData.participant4, idSlot: 'participant4' as const, stepNum: 5 },
                  ].map(({ role, data, idSlot, stepNum }) => {
                    const idFile = formData.idCards[idSlot];
                    return (
                      <div key={role} className="p-4 rounded-xl bg-[#200000] border border-[#B9873F]/25 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-serif-luxury uppercase tracking-wider text-[#B9873F]">
                            {role}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCurrentStep(stepNum)}
                            className="text-[10px] text-[#F0D18B] hover:text-[#FFFFFF] underline"
                          >
                            Edit
                          </button>
                        </div>
                        <h4 className="font-serif-luxury text-sm font-bold text-[#FFFFFF]">
                          {data.fullName || 'Name missing'}
                        </h4>
                        <div className="text-xs text-[#D9AD61]/80 space-y-0.5">
                          <p>Email: {data.email || '—'}</p>
                          <p>Phone: {data.phone || '—'}</p>
                          <p>
                            Dietary:{' '}
                            <span className="text-[#F0D18B]">
                              {data.dietaryPreference || 'Not selected'}
                            </span>
                            {data.dietaryNotes?.trim() ? ` (${data.dietaryNotes.trim()})` : ''}
                          </p>
                        </div>
                        <div className="pt-2 border-t border-[#B9873F]/15 flex items-center justify-between text-[11px]">
                          <span className="text-[#B9873F]">College ID:</span>
                          {idFile ? (
                            <span className="text-emerald-400 font-medium truncate max-w-[140px]">
                              {idFile.fileName}
                            </span>
                          ) : (
                            <span className="text-rose-400">Missing ID</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Incomplete warning if any */}
              {!completeness.isComplete && (
                <div className="p-4 rounded-xl bg-amber-950/70 border border-amber-500/50 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Incomplete Contingent Requirements:</span>
                  </div>
                  <ul className="text-xs text-amber-200 list-disc list-inside space-y-1">
                    {completeness.missingItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Note on isolated backend & Payment redirect */}
              <div className="p-4 rounded-xl bg-[#140000] border border-[#B9873F]/30 space-y-2 text-xs text-[#D9AD61]">
                <div className="flex items-center gap-2 text-[#FFFFFF] font-serif-luxury font-bold">
                  <CreditCard className="w-4 h-4 text-[#D9AD61]" />
                  <span>NEXT STEP: OFFICIAL PAYMENT INFORMATION</span>
                </div>
                <p>
                  As an official college portal, payment gateway connection will be managed by St. Joseph's College of Commerce's web handler. Review your details and click below to navigate to the official Payment page.
                </p>
              </div>

              {/* Proceed to Payment Page Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    // Update state to ready for payment and navigate
                    playSuccess();
                    const updated = {
                      ...formData,
                      status: 'READY_FOR_PAYMENT' as const,
                    };
                    updateAndSave(updated);
                    onRouteChange('payment');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={!completeness.isComplete}
                  className={`w-full py-4 text-xs sm:text-sm font-semibold uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2 ${
                    completeness.isComplete
                      ? 'text-[#200000] bg-gradient-to-r from-[#F0D18B] via-[#D9AD61] to-[#B9873F] hover:brightness-110 shadow-[0_0_20px_rgba(185,135,63,0.35)] btn-gold-glow cursor-pointer'
                      : 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700'
                  }`}
                >
                  <span>Proceed to Payment Information Page (₹7,000)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                {!completeness.isComplete && (
                  <p className="text-[11px] text-center text-amber-400 mt-2">
                    Please complete all steps (all 4 participants, 4 IDs, and declarations) to unlock the payment page.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stepper Navigation Buttons (Prev / Next) */}
          <div className="pt-8 mt-8 border-t border-[#B9873F]/20 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 1}
              className={`px-5 py-2.5 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 ${
                currentStep === 1
                  ? 'border-transparent text-[#B9873F]/30 cursor-not-allowed'
                  : 'border-[#B9873F]/40 text-[#F0D18B] hover:text-[#FFFFFF] hover:border-[#D9AD61]'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Step</span>
            </button>

            <div className="text-xs text-[#B9873F]">
              Step <span className="text-[#FFFFFF] font-bold">{currentStep}</span> of 8
            </div>

            {currentStep < 8 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 transition-all flex items-center gap-1.5 shadow"
              >
                <span>Save & Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (completeness.isComplete) {
                    onRouteChange('payment');
                  }
                }}
                disabled={!completeness.isComplete}
                className="px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#200000] bg-gradient-to-r from-[#F0D18B] to-[#D9AD61] rounded hover:brightness-110 disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                <span>Go to Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
