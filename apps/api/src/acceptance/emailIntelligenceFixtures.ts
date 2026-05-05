export const emailIntelligenceAcceptanceFixtures = {
  cleanDeterministicSupplierOffer: {
    from: 'pricing@supplier.co',
    subject: 'Daily offer',
    bodyText: 'Paracetamol 500mg caplets 16 - £1.25',
  },
  messyAiSupplierOffer: {
    from: 'pricing@supplier.co',
    subject: 'Limited stock',
    bodyText: 'Hi, can do Amlodipine 5mg tabs 28 at £8.40, MOQ 20, limited stock.',
  },
  dadSupplierReliabilityNote: {
    from: 'dad@ambe.test',
    subject: 'Medline risk',
    bodyText: "Don’t trust Medline on insulin, they quote but never deliver.",
  },
  manualBuyTrigger: {
    from: 'dad@ambe.test',
    subject: 'Pregabalin buyers',
    bodyText: 'If anyone offers Pregabalin 150mg below £3.20 buy quickly, I know two buyers looking.',
  },
  mixedSupplierOfferAndIntel: {
    from: 'pricing@zenith.test',
    subject: 'Ozempic stock',
    bodyText:
      'Zenith can do Ozempic 0.5mg at £87. Also Amit says stock is tight and price likely rises next week.',
  },
  nonActionableAdminEmail: {
    from: 'ops@ambe.test',
    subject: 'Meeting notes',
    bodyText: 'Thanks, see attached invoice / meeting notes / regards',
  },
} as const;
