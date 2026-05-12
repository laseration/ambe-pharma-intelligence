export const TO_BE_CONFIRMED = 'To be confirmed';
export const SECURE_REVIEW_REQUIRED = 'To be confirmed in secure review';

export type AmbeMasterAccountOpeningProfile = {
  companyProfileUsed: string;
  registeredCompanyName: string;
  tradingName: string;
  companyNumber: string;
  vatNumber: string;
  legalStatus: string;
  businessType: string;
  yearsTrading: string;
  registeredAddress: string;
  invoiceAddress: string;
  accountantsAddress: string;
  licensedDeliveryAddress: string;
  contacts: {
    generalCommercial: {
      name: 'Aman Dhillon';
      role: string;
      email: string;
      phone: string;
    };
    accounts: {
      name: 'Sandeep Patel';
      role: string;
      email: string;
      phone: string;
    };
    regulatory: {
      name: 'Dilshad Moulana';
      role: string;
      email: string;
      phone: string;
    };
  };
  regulatory: {
    mhraWdaNumber: string;
    responsiblePerson: string;
    rpEmail: string;
    gphcPremisesNumber: string;
    cqcRegistration: string;
    cdLicenceApplies: string;
    wdaHolder: string;
    licensedSiteAddress: string;
    wdaIssueDate: string;
    lastInspectionDate: string;
  };
  standardAnswers: {
    website: string;
    numberOfEmployees: string;
    businessHours: string;
    estimatedMonthlyPurchases: string;
    webOrdering: string;
    saturdayDeliveries: string;
    numberOfOutlets: string;
    membershipOrderPlatformHandling: string;
    paymentMethod: string;
    directDebitRequested: string;
    bankDetails: string;
    tradeReferences: string;
    returnsPolicyAccepted: string;
  };
  signingRules: {
    defaultSigner: 'Aman Dhillon';
    defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.';
    signatureFields: '';
    signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.';
  };
};

export const AMBE_MASTER_ACCOUNT_OPENING_PROFILE: AmbeMasterAccountOpeningProfile = {
  companyProfileUsed: 'AMBE master account-opening profile v1',
  registeredCompanyName: 'AMBE LTD',
  tradingName: 'AMBE MEDICAL GROUP',
  companyNumber: TO_BE_CONFIRMED,
  vatNumber: TO_BE_CONFIRMED,
  legalStatus: 'Limited company',
  businessType: 'Pharmaceutical wholesale business',
  yearsTrading: TO_BE_CONFIRMED,
  registeredAddress: TO_BE_CONFIRMED,
  invoiceAddress: TO_BE_CONFIRMED,
  accountantsAddress: TO_BE_CONFIRMED,
  licensedDeliveryAddress: TO_BE_CONFIRMED,
  contacts: {
    generalCommercial: {
      name: 'Aman Dhillon',
      role: 'Default account-opening signer',
      email: TO_BE_CONFIRMED,
      phone: TO_BE_CONFIRMED,
    },
    accounts: {
      name: 'Sandeep Patel',
      role: 'Accounts contact',
      email: TO_BE_CONFIRMED,
      phone: TO_BE_CONFIRMED,
    },
    regulatory: {
      name: 'Dilshad Moulana',
      role: 'RP/regulatory contact',
      email: TO_BE_CONFIRMED,
      phone: TO_BE_CONFIRMED,
    },
  },
  regulatory: {
    mhraWdaNumber: TO_BE_CONFIRMED,
    responsiblePerson: 'Dilshad Moulana',
    rpEmail: TO_BE_CONFIRMED,
    gphcPremisesNumber: TO_BE_CONFIRMED,
    cqcRegistration: TO_BE_CONFIRMED,
    cdLicenceApplies: TO_BE_CONFIRMED,
    wdaHolder: TO_BE_CONFIRMED,
    licensedSiteAddress: TO_BE_CONFIRMED,
    wdaIssueDate: TO_BE_CONFIRMED,
    lastInspectionDate: TO_BE_CONFIRMED,
  },
  standardAnswers: {
    website: TO_BE_CONFIRMED,
    numberOfEmployees: TO_BE_CONFIRMED,
    businessHours: TO_BE_CONFIRMED,
    estimatedMonthlyPurchases: TO_BE_CONFIRMED,
    webOrdering: TO_BE_CONFIRMED,
    saturdayDeliveries: TO_BE_CONFIRMED,
    numberOfOutlets: TO_BE_CONFIRMED,
    membershipOrderPlatformHandling: TO_BE_CONFIRMED,
    paymentMethod: TO_BE_CONFIRMED,
    directDebitRequested: TO_BE_CONFIRMED,
    bankDetails: SECURE_REVIEW_REQUIRED,
    tradeReferences: TO_BE_CONFIRMED,
    returnsPolicyAccepted: TO_BE_CONFIRMED,
  },
  signingRules: {
    defaultSigner: 'Aman Dhillon',
    defaultSigningStatement: 'Aman Dhillon can sign this account-opening form by default.',
    signatureFields: '',
    signatureInstruction: 'Leave signature fields blank until approved by a human reviewer.',
  },
};
