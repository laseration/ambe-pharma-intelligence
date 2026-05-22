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
    version: '2026-05-19',
    approvedBy: 'internal-operations',
    approvedAt: '2026-05-15T00:00:00.000Z',
    values: {
      legalCompanyName: 'AMBE LTD',
      tradingName: 'AMBE MEDICAL GROUP',
      companyNumber: '03809178',
      vatNumber: 'GB743707428',
      registeredAddress:
        'Unit 4 Green Lane Business Park, 238 Green Lane, London, SE9 3TL',
      tradingAddress:
        'Unit 4 Green Lane Business Park, 238 Green Lane, London, SE9 3TL',
      mainContactName: 'Aman Dhillon',
      mainContactEmail: 'To be confirmed',
      mainContactPhone: 'To be confirmed',
      accountsContact: 'To be confirmed',
      website: 'To be confirmed',
      businessHours: 'To be confirmed',
      companyType: 'Private Limited Company',
      businessDescription:
        'Pharmaceutical wholesaler / distributor / manufacturer',
      gphcPremisesNumber:
        'N/A for wholesale accounts; use WDA/MHRA number 19460 where WDA is requested',
      responsiblePerson: 'Dilshad Moulana',
      wholesaleDealerAuthorisation:
        'WDA Authorisation Number 19460; holder AMBE LTD; issuing authority MHRA; licensed site 1 Ascot Road, Bedfont, Feltham, TW14 8QH',
      cqcRegistration: 'N/A unless specifically requested',
      standardPaymentPreference:
        'BACS unless a supplier specifically requires another method',
      directDebitPlaceholder:
        'To be confirmed in secure review. Do not complete Direct Debit or bank authority fields automatically.',
      bankDetailsPlaceholder:
        'To be confirmed in secure review. Bank account and sort code details must not be exposed in dashboard drafts.',
    },
  };

export function getAccountOpeningMasterProfile(): AccountOpeningMasterProfile {
  return AMBE_ACCOUNT_OPENING_MASTER_PROFILE;
}
