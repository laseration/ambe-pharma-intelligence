export type RegulatoryMessageInput = {
  title: string;
  sourceUrl: string;
  eventType: string;
  severity: string;
  possibleAffectedProduct: string | null;
  summary: string;
  suggestedAction: string;
  evidenceSnippets?: string[];
};

export function buildRegulatoryAlertTitle(input: {
  eventType: string;
  severity: string;
  productName: string | null;
}): string {
  return [
    'Potentially relevant regulatory update',
    input.productName ? `for ${input.productName}` : null,
    `(${input.eventType.replace(/_/g, ' ')}, ${input.severity})`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildRegulatorySuggestedAction(severity: string): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    return 'Requires compliance review. Check source evidence and affected stock before any buying, selling, or customer-facing action.';
  }

  return 'Recommended review. Check source evidence and product match before taking operational action.';
}

export function buildRegulatoryAlertMessage(
  input: RegulatoryMessageInput,
): string {
  const evidence = input.evidenceSnippets?.length
    ? `\nEvidence:\n${input.evidenceSnippets.map((snippet) => `- ${snippet}`).join('\n')}`
    : '';

  return [
    'Potentially relevant update',
    `Event type: ${input.eventType.replace(/_/g, ' ')}`,
    `Severity: ${input.severity}`,
    `Possible affected product: ${input.possibleAffectedProduct ?? 'Requires review'}`,
    `Summary: ${input.summary}`,
    `Suggested action: ${input.suggestedAction}`,
    `Source: ${input.sourceUrl}`,
    evidence,
  ]
    .filter(Boolean)
    .join('\n');
}
