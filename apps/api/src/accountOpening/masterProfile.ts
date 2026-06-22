import { env } from '../config/env';
import { getActiveAccountOpeningProfileValues } from '../organization/activeOrganizationConfig';

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
    faxNumber: string;
    regulatoryAuthority: string;
    countryRegion: string;
    dateStartedTrading: string;
    wdaGrantedDate: string;
    lastGdpInspectionDate: string;
    responsiblePersonEmail: string;
    responsiblePersonPhone: string;
    accountsEmail: string;
    accountsPhone: string;
    salesName: string;
    salesEmail: string;
    salesPhone: string;
    customerServiceName: string;
    customerServiceEmail: string;
    customerServicePhone: string;
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
  // Prefer the active organisation's stored profile (if loaded) over env, per
  // field, so a client can run on its own company identity. The bank /
  // direct-debit placeholders are intentionally NOT sourced from the org — they
  // remain hardcoded safety text and must never be auto-completed.
  const orgValues = getActiveAccountOpeningProfileValues();
  const field = (
    key: keyof AccountOpeningMasterProfile['values'],
    envValue: string,
  ): string => profileValue(orgValues?.[key] ?? envValue);

  return {
    profileId: 'ambe-account-opening-profile',
    version: '2026-06-09',
    approvedBy: 'configurable-profile-source',
    approvedAt: '2026-06-09T00:00:00.000Z',
    values: {
      legalCompanyName: field(
        'legalCompanyName',
        env.accountOpeningProfileLegalCompanyName,
      ),
      tradingName: field('tradingName', env.accountOpeningProfileTradingName),
      companyNumber: field(
        'companyNumber',
        env.accountOpeningProfileCompanyNumber,
      ),
      vatNumber: field('vatNumber', env.accountOpeningProfileVatNumber),
      registeredAddress: field(
        'registeredAddress',
        env.accountOpeningProfileRegisteredAddress,
      ),
      tradingAddress: field(
        'tradingAddress',
        env.accountOpeningProfileTradingAddress,
      ),
      mainContactName: field(
        'mainContactName',
        env.accountOpeningProfileMainContactName,
      ),
      mainContactEmail: field(
        'mainContactEmail',
        env.accountOpeningProfileMainContactEmail,
      ),
      mainContactPhone: field(
        'mainContactPhone',
        env.accountOpeningProfileMainContactPhone,
      ),
      accountsContact: field(
        'accountsContact',
        env.accountOpeningProfileAccountsContact,
      ),
      website: field('website', env.accountOpeningProfileWebsite),
      businessHours: field(
        'businessHours',
        env.accountOpeningProfileBusinessHours,
      ),
      companyType: field('companyType', env.accountOpeningProfileCompanyType),
      businessDescription: field(
        'businessDescription',
        env.accountOpeningProfileBusinessDescription,
      ),
      gphcPremisesNumber: field(
        'gphcPremisesNumber',
        env.accountOpeningProfileGphcPremisesNumber,
      ),
      responsiblePerson: field(
        'responsiblePerson',
        env.accountOpeningProfileResponsiblePerson,
      ),
      wholesaleDealerAuthorisation: field(
        'wholesaleDealerAuthorisation',
        env.accountOpeningProfileWholesaleDealerAuthorisation,
      ),
      cqcRegistration: field(
        'cqcRegistration',
        env.accountOpeningProfileCqcRegistration,
      ),
      standardPaymentPreference: field(
        'standardPaymentPreference',
        env.accountOpeningProfileStandardPaymentPreference,
      ),
      faxNumber: field('faxNumber', env.accountOpeningProfileFaxNumber),
      regulatoryAuthority: field(
        'regulatoryAuthority',
        env.accountOpeningProfileRegulatoryAuthority,
      ),
      countryRegion: field(
        'countryRegion',
        env.accountOpeningProfileCountryRegion,
      ),
      dateStartedTrading: field(
        'dateStartedTrading',
        env.accountOpeningProfileDateStartedTrading,
      ),
      wdaGrantedDate: field(
        'wdaGrantedDate',
        env.accountOpeningProfileWdaGrantedDate,
      ),
      lastGdpInspectionDate: field(
        'lastGdpInspectionDate',
        env.accountOpeningProfileLastGdpInspectionDate,
      ),
      responsiblePersonEmail: field(
        'responsiblePersonEmail',
        env.accountOpeningProfileResponsiblePersonEmail,
      ),
      responsiblePersonPhone: field(
        'responsiblePersonPhone',
        env.accountOpeningProfileResponsiblePersonPhone,
      ),
      accountsEmail: field(
        'accountsEmail',
        env.accountOpeningProfileAccountsEmail,
      ),
      accountsPhone: field(
        'accountsPhone',
        env.accountOpeningProfileAccountsPhone,
      ),
      salesName: field('salesName', env.accountOpeningProfileSalesName),
      salesEmail: field('salesEmail', env.accountOpeningProfileSalesEmail),
      salesPhone: field('salesPhone', env.accountOpeningProfileSalesPhone),
      customerServiceName: field(
        'customerServiceName',
        env.accountOpeningProfileCustomerServiceName,
      ),
      customerServiceEmail: field(
        'customerServiceEmail',
        env.accountOpeningProfileCustomerServiceEmail,
      ),
      customerServicePhone: field(
        'customerServicePhone',
        env.accountOpeningProfileCustomerServicePhone,
      ),
      directDebitPlaceholder: `${SECURE_REVIEW_PLACEHOLDER}. Do not complete Direct Debit or bank authority fields automatically.`,
      bankDetailsPlaceholder: `${SECURE_REVIEW_PLACEHOLDER}. Bank account and sort code details must not be exposed in dashboard drafts.`,
    },
  };
}

export function getAccountOpeningMasterProfile(): AccountOpeningMasterProfile {
  return buildAccountOpeningMasterProfile();
}
