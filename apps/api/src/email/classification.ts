import { detectAccountOpeningEmail } from '../accountOpening/service';

export const EMAIL_ROUTE_CLASSIFIER_VERSION = 'email-route-classifier-v1';

export type EmailRouteClassifierVersion = typeof EMAIL_ROUTE_CLASSIFIER_VERSION;

export type EmailRoute =
  | 'ACCOUNT_OPENING'
  | 'COMMERCIAL_REVIEW'
  | 'IGNORED_OR_STANDARD';

export type EmailRouteConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type EmailRouteEvidence =
  | 'SUBJECT'
  | 'BODY'
  | 'ATTACHMENT_FILENAME'
  | 'ATTACHMENT_TEXT';

export type EmailRouteClassification = {
  classifierVersion: EmailRouteClassifierVersion;
  route: EmailRoute;
  confidence: EmailRouteConfidence;
  accountOpeningDetected: boolean;
  matchedTerms: string[];
  matchedAttachmentNames: string[];
  classificationReason: string;
  evidenceUsed: EmailRouteEvidence[];
};

export function classifyEmailRoute(input: {
  subject?: string | null;
  bodyText?: string | null;
  attachmentFileNames?: Array<string | null | undefined>;
  attachmentTexts?: Array<string | null | undefined>;
}): EmailRouteClassification {
  const accountOpening = detectAccountOpeningEmail(input);
  const evidenceUsed: EmailRouteEvidence[] = [];

  if (input.subject?.trim()) {
    evidenceUsed.push('SUBJECT');
  }

  if (input.bodyText?.trim()) {
    evidenceUsed.push('BODY');
  }

  if ((input.attachmentFileNames ?? []).some((value) => value?.trim())) {
    evidenceUsed.push('ATTACHMENT_FILENAME');
  }

  if ((input.attachmentTexts ?? []).some((value) => value?.trim())) {
    evidenceUsed.push('ATTACHMENT_TEXT');
  }

  return {
    classifierVersion: EMAIL_ROUTE_CLASSIFIER_VERSION,
    route: accountOpening.detected ? 'ACCOUNT_OPENING' : 'IGNORED_OR_STANDARD',
    confidence: accountOpening.detected ? 'HIGH' : 'LOW',
    accountOpeningDetected: accountOpening.detected,
    matchedTerms: accountOpening.matchedTerms,
    matchedAttachmentNames: accountOpening.matchedAttachmentNames,
    classificationReason:
      accountOpening.classificationReason ??
      'No account-opening route evidence matched.',
    evidenceUsed,
  };
}
