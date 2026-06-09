import { env } from '../config/env';

export type AccountOpeningMasterProfile = {
  profileId: string;
  version: string;
  approvedBy: string;
  approvedAt: string;
  values: {
    legalCompanyName: string;
    tradingName: string;
    companyNumber: string;
    vatNumber: string;
    registeredAddress: string;
    tradingAddress: string;
    mainContactName: string;
    mainContactEmail: string;
    mainContactPhone: string;
    accountsContact: string;
    website: string;
    businessHours: string;
    companyType: string;
    businessDescription: string;
    gphcPremisesNumber: string;
    responsiblePerson: string;
    wholesaleDealerAuthorisation: string;
    cqcRegistration: string;
    standardPaymentPreference: string;
    directDebitPlaceholder: string;
    bankDetailsPlaceholder: string;
  };
};

const TO_BE_CONFIRMED = 'To be confirmed';
const SECURE_REVIEW_PLACEHOLDER = 'To be confirmed in secure review';

function profileValue(value: string): string {
  return value.trim() || TO_BE_CONFIRMED;
}

export function buildAccountOpeningMasterProfile(): AccountOpeningMasterProfile {
  return {
    profileId: 'ambe-account-opening-profile',
    version: '2026-06-09',
    approvedBy: 'configurable-profile-source',
    approvedAt: '2026-06-09T00:00:00.000Z',
    values: {
      legalCompanyName: profileValue(env.accountOpeningProfileLegalCompanyName),
      tradingName: profileValue(env.accountOpeningProfileTradingName),
      companyNumber: profileValue(env.accountOpeningProfileCompanyNumber),
      vatNumber: profileValue(env.accountOpeningProfileVatNumber),
      registeredAddress: profileValue(
        env.accountOpeningProfileRegisteredAddress,
      ),
      tradingAddress: profileValue(env.accountOpeningProfileTradingAddress),
      mainContactName: profileValue(env.accountOpeningProfileMainContactName),
      mainContactEmail: profileValue(env.accountOpeningProfileMainContactEmail),
      mainContactPhone: profileValue(env.accountOpeningProfileMainContactPhone),
      accountsContact: profileValue(env.accountOpeningProfileAccountsContact),
      website: profileValue(env.accountOpeningProfileWebsite),
      businessHours: profileValue(env.accountOpeningProfileBusinessHours),
      companyType: profileValue(env.accountOpeningProfileCompanyType),
      businessDescription: profileValue(
        env.accountOpeningProfileBusinessDescription,
      ),
      gphcPremisesNumber: profileValue(
        env.accountOpeningProfileGphcPremisesNumber,
      ),
      responsiblePerson: profileValue(
        env.accountOpeningProfileResponsiblePerson,
      ),
      wholesaleDealerAuthorisation: profileValue(
        env.accountOpeningProfileWholesaleDealerAuthorisation,
      ),
      cqcRegistration: profileValue(env.accountOpeningProfileCqcRegistration),
      standardPaymentPreference: profileValue(
        env.accountOpeningProfileStandardPaymentPreference,
      ),
      directDebitPlaceholder: `${SECURE_REVIEW_PLACEHOLDER}. Do not complete Direct Debit or bank authority fields automatically.`,
      bankDetailsPlaceholder: `${SECURE_REVIEW_PLACEHOLDER}. Bank account and sort code details must not be exposed in dashboard drafts.`,
    },
  };
}

export function getAccountOpeningMasterProfile(): AccountOpeningMasterProfile {
  return buildAccountOpeningMasterProfile();
}
