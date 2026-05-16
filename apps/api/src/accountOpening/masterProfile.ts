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

export const AMBE_ACCOUNT_OPENING_MASTER_PROFILE: AccountOpeningMasterProfile =
  {
    profileId: 'ambe-master-profile',
    version: '2026-05-15',
    approvedBy: 'internal-operations',
    approvedAt: '2026-05-15T00:00:00.000Z',
    values: {
      legalCompanyName: 'AMBE LTD',
      tradingName: 'AMBE MEDICAL GROUP',
      companyNumber: 'To be confirmed',
      vatNumber: 'To be confirmed',
      registeredAddress: 'To be confirmed',
      tradingAddress: 'To be confirmed',
      mainContactName: 'To be confirmed',
      mainContactEmail: 'To be confirmed',
      mainContactPhone: 'To be confirmed',
      accountsContact: 'To be confirmed',
      website: 'To be confirmed',
      businessHours: 'To be confirmed',
      companyType: 'UK pharmaceutical wholesale business',
      businessDescription:
        'Pharmaceutical wholesale and supply operations for licensed healthcare customers.',
      gphcPremisesNumber: 'To be confirmed in secure review',
      responsiblePerson: 'To be confirmed in secure review',
      wholesaleDealerAuthorisation: 'To be confirmed in secure review',
      cqcRegistration: 'To be confirmed in secure review',
      standardPaymentPreference:
        'Standard payment terms to be confirmed by an authorised AMBE reviewer before submission.',
      directDebitPlaceholder:
        'To be confirmed in secure review. Do not complete Direct Debit or bank authority fields automatically.',
      bankDetailsPlaceholder:
        'To be confirmed in secure review. Bank account and sort code details must not be exposed in dashboard drafts.',
    },
  };

export function getAccountOpeningMasterProfile(): AccountOpeningMasterProfile {
  return AMBE_ACCOUNT_OPENING_MASTER_PROFILE;
}
