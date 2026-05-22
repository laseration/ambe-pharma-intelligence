export type SideEffectOperationName =
  | 'ACCOUNT_OPENING_APPROVE_COMPLETED_UNSIGNED_FORM'
  | 'ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM'
  | 'EMAIL_REPROCESS_EXECUTE'
  | 'REVIEW_QUEUE_APPROVE_TO_BUY'
  | 'REVIEW_QUEUE_MARK_ORDERED';

export type SideEffectPolicy = {
  operation: SideEffectOperationName;
  requiredRoleCategory: 'operator' | 'admin';
  writesDatabase: boolean;
  mayUploadToMicrosoftDrive: boolean;
  mayCreateOrUpdateBuyDecisions: boolean;
  mayMarkOrderPlaced: boolean;
  requiresReviewOrApprovalGate: boolean;
  dryRunShouldExist: boolean;
  supplierFacingSendOrSubmitForbidden: boolean;
};

const SIDE_EFFECT_POLICIES: Record<SideEffectOperationName, SideEffectPolicy> =
  {
    ACCOUNT_OPENING_APPROVE_COMPLETED_UNSIGNED_FORM: {
      operation: 'ACCOUNT_OPENING_APPROVE_COMPLETED_UNSIGNED_FORM',
      requiredRoleCategory: 'operator',
      writesDatabase: true,
      mayUploadToMicrosoftDrive: false,
      mayCreateOrUpdateBuyDecisions: false,
      mayMarkOrderPlaced: false,
      requiresReviewOrApprovalGate: true,
      dryRunShouldExist: false,
      supplierFacingSendOrSubmitForbidden: true,
    },
    ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM: {
      operation: 'ACCOUNT_OPENING_FILE_COMPLETED_UNSIGNED_FORM',
      requiredRoleCategory: 'operator',
      writesDatabase: true,
      mayUploadToMicrosoftDrive: true,
      mayCreateOrUpdateBuyDecisions: false,
      mayMarkOrderPlaced: false,
      requiresReviewOrApprovalGate: true,
      dryRunShouldExist: false,
      supplierFacingSendOrSubmitForbidden: true,
    },
    EMAIL_REPROCESS_EXECUTE: {
      operation: 'EMAIL_REPROCESS_EXECUTE',
      requiredRoleCategory: 'operator',
      writesDatabase: true,
      mayUploadToMicrosoftDrive: false,
      mayCreateOrUpdateBuyDecisions: false,
      mayMarkOrderPlaced: false,
      requiresReviewOrApprovalGate: true,
      dryRunShouldExist: true,
      supplierFacingSendOrSubmitForbidden: true,
    },
    REVIEW_QUEUE_APPROVE_TO_BUY: {
      operation: 'REVIEW_QUEUE_APPROVE_TO_BUY',
      requiredRoleCategory: 'operator',
      writesDatabase: true,
      mayUploadToMicrosoftDrive: false,
      mayCreateOrUpdateBuyDecisions: true,
      mayMarkOrderPlaced: false,
      requiresReviewOrApprovalGate: true,
      dryRunShouldExist: false,
      supplierFacingSendOrSubmitForbidden: true,
    },
    REVIEW_QUEUE_MARK_ORDERED: {
      operation: 'REVIEW_QUEUE_MARK_ORDERED',
      requiredRoleCategory: 'operator',
      writesDatabase: true,
      mayUploadToMicrosoftDrive: false,
      mayCreateOrUpdateBuyDecisions: true,
      mayMarkOrderPlaced: true,
      requiresReviewOrApprovalGate: true,
      dryRunShouldExist: false,
      supplierFacingSendOrSubmitForbidden: true,
    },
  };

export function getSideEffectPolicy(
  operation: SideEffectOperationName,
): SideEffectPolicy {
  return SIDE_EFFECT_POLICIES[operation];
}

export function buildSideEffectAuditMetadata(
  operation: SideEffectOperationName,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    sideEffectOperation: operation,
    sideEffectPolicy: getSideEffectPolicy(operation),
  };
}
