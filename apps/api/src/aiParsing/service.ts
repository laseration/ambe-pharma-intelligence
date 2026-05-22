import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  AI_PARSER_RESPONSE_SCHEMA,
  type AiParsedOfferResponse,
  validateAiParsedOfferResponse,
} from './schema';

type AiParsingSource = 'EMAIL_BODY' | 'TELEGRAM_TEXT';

type LoggerLike = {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

type FetchLike = typeof fetch;
type AiAttemptDecision =
  | 'disabled'
  | 'skipped_too_short'
  | 'skipped_too_noisy'
  | 'skipped_empty_after_reduction'
  | 'request_failed'
  | 'response_missing_text'
  | 'response_invalid_json'
  | 'response_unusable'
  | 'accepted';

export const AI_PARSER_PROMPT_VERSION = 'supplier-offer-v3';

export type AiOfferParsingAttemptResult =
  | {
      status: 'disabled';
      reason: string;
      decision: AiAttemptDecision;
    }
  | {
      status: 'success';
      reason: string;
      decision: 'accepted';
      result: AiParsedOfferResponse;
      requestId: string | null;
      promptVersion: string;
      reducedText: string;
    }
  | {
      status: 'error' | 'unusable';
      reason: string;
      decision: AiAttemptDecision;
      issues: string[];
      requestId: string | null;
      promptVersion?: string;
      reducedText?: string;
    };

type OpenAiOfferParserDependencies = {
  apiKey: string;
  enabled: boolean;
  fetchImpl: FetchLike;
  logger: LoggerLike;
  maxChars: number;
  minChars: number;
  model: string;
  timeoutMs: number;
};

function buildPrompt(source: AiParsingSource, rawText: string): string {
  return [
    `Prompt version: ${AI_PARSER_PROMPT_VERSION}`,
    `Source: ${source}`,
    '',
    'You extract structured commercial facts for an internal UK pharmaceutical wholesale workflow.',
    '',
    'Your job:',
    '- Extract only explicitly stated commercial facts from the provided text.',
    '- Return sparse, conservative JSON.',
    '- Prefer null over guessing.',
    '- Do not invent or infer missing facts.',
    '',
    'General extraction rules:',
    '- Extract only offers with both explicitly stated productText and explicitly stated price.',
    '- If a product is mentioned without a clear price, do not create an offer.',
    '- If a price is mentioned without a clearly attributable product, do not create an offer.',
    '- Keep separate offer lines separate. Do not merge two products into one offer.',
    '- Do not merge facts across different lines, paragraphs, or thread sections unless they are explicitly stated together.',
    '- Preserve wording conservatively in rawLine and evidenceText.',
    '',
    'Unknown / null rules:',
    '- Use null for unknown or unclear values.',
    '- Do not infer pack size, dosage form, manufacturer, currency, MOQ, availability, or supplierName.',
    '- Do not convert ambiguous text into confident structured fields.',
    '- If the text is messy, partial, weakly attributable, or conversational, return sparse fields, LOW confidence, and reviewRecommended=true.',
    '',
    'Forwarded / replied content rules:',
    '- Extract from any visible segment if the fact is explicit.',
    '- Label each offer with the correct sourceSegment: BODY_MAIN, BODY_FORWARDED, SIGNATURE, or UNKNOWN.',
    '- Do not assume the newest text overrides a clearer forwarded offer.',
    '- If an offer appears only in forwarded or replied content, that is acceptable, but confidence should usually remain MEDIUM or LOW unless the offer line is very clear.',
    '- Do not combine supplier identity from one thread segment with product/price facts from another unless the connection is explicit.',
    '',
    'Supplier extraction precedence:',
    '- Highest priority: explicit supplier/company label such as "supplier: X" or other clearly labeled company identification.',
    '- Next: explicit company/supplier name stated near the offer.',
    '- Next: clear signature/company block if it unambiguously identifies the sender company.',
    '- Next: clear forwarded sender/company attribution if the offer is in forwarded content and the supplier attribution is explicit.',
    '- If supplier cues conflict, set supplierName to null.',
    '- Do not guess supplierName from email tone, product range, or domain-style wording alone.',
    '- Do not treat "from X" as supplier unless the surrounding text clearly identifies X as the company making the offer.',
    '',
    'Price and currency rules:',
    '- Extract price only when the numeric amount is explicitly stated.',
    '- Extract currency only when a currency symbol or code is explicitly stated and unambiguous.',
    '- Allowed currencies: GBP, USD, EUR.',
    '- Map £ to GBP, $ to USD, € to EUR only when the symbol is clearly attached to the stated price.',
    '- If amount is stated but currency is unclear, set currency to null.',
    '- If currency markers conflict, keep confidence LOW.',
    '',
    'MOQ rules:',
    '- Extract minimumOrderQuantity only if explicitly stated as MOQ, minimum order, minimum quantity, min qty, min quantity, or equivalent.',
    '- If a quantity is mentioned but it is not clearly MOQ, set minimumOrderQuantity to null.',
    '',
    'Availability rules:',
    '- Extract availability only if explicitly stated, such as available, in stock, instock, limited stock, ready stock, or ETA wording.',
    '- Do not infer availability from the fact that a quote was sent.',
    '',
    'Manufacturer rules:',
    '- Extract manufacturer only if explicitly stated in a product-specific context, such as manufacturer, mfr, brand, or by.',
    '- Do not infer manufacturer from supplierName.',
    '- Do not infer manufacturer from a footer or signature unless it clearly refers to the product offer.',
    '',
    'Product field rules:',
    '- productText should preserve the explicitly offered product wording.',
    '- strength, dosageForm, and packSize should only be extracted when explicitly present in the product wording or clearly attached to it.',
    '- If unclear, set them to null.',
    '',
    'Confidence rules:',
    '- HIGH: clear product, clear price, clear currency, low ambiguity, clear source attribution.',
    '- MEDIUM: explicit commercial facts exist but the message is still messy, conversational, or forwarded.',
    '- LOW: ambiguous, incomplete, mixed-thread, weakly attributable, or partially specified.',
    '',
    'Output rules:',
    '- Return valid JSON only.',
    '- Use null for unknown fields.',
    '- Do not include explanatory prose outside JSON.',
    '- Keep notes concise.',
    '- Include a concise reason for each offer.',
    '- Include evidenceText for each offer, quoting the smallest useful explicit source text.',
    '- reviewRecommended should be true unless the message is unusually explicit and clean.',
    '',
    'Few-shot examples',
    '',
    'Example 1',
    'Input:',
    'Hi, can do Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.',
    'Regards,',
    'Acme Pharma Ltd',
    '',
    'Output:',
    '{"supplierName":"Acme Pharma Ltd","offers":[{"rawLine":"Hi, can do Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.","evidenceText":"Paracetamol 500mg caplets 16 at 1.25 GBP, MOQ 20. Limited stock.","productText":"Paracetamol 500mg caplets 16","strength":"500mg","dosageForm":"caplets","packSize":"16","price":1.25,"currency":"GBP","availability":"Limited stock","minimumOrderQuantity":20,"manufacturer":null,"sourceSegment":"BODY_MAIN","confidence":"MEDIUM","reason":"The message explicitly states product, price, currency, MOQ, and limited stock in messy prose."}],"overallConfidence":"MEDIUM","reviewRecommended":true,"notes":["Messy prose but explicit commercial facts were present."]}',
    '',
    'Example 2',
    'Input:',
    'Please see below.',
    '',
    'On Monday Supplier One wrote:',
    'Amlodipine 5mg tabs 28 - £8.40',
    'Metformin 500mg 28 - £3.10',
    '',
    'Output:',
    '{"supplierName":"Supplier One","offers":[{"rawLine":"Amlodipine 5mg tabs 28 - £8.40","evidenceText":"Amlodipine 5mg tabs 28 - £8.40","productText":"Amlodipine 5mg tabs 28","strength":"5mg","dosageForm":"tabs","packSize":"28","price":8.4,"currency":"GBP","availability":null,"minimumOrderQuantity":null,"manufacturer":null,"sourceSegment":"BODY_FORWARDED","confidence":"MEDIUM","reason":"The forwarded line explicitly states product and GBP price."},{"rawLine":"Metformin 500mg 28 - £3.10","evidenceText":"Metformin 500mg 28 - £3.10","productText":"Metformin 500mg 28","strength":"500mg","dosageForm":null,"packSize":"28","price":3.1,"currency":"GBP","availability":null,"minimumOrderQuantity":null,"manufacturer":null,"sourceSegment":"BODY_FORWARDED","confidence":"MEDIUM","reason":"The forwarded line explicitly states product and GBP price."}],"overallConfidence":"MEDIUM","reviewRecommended":true,"notes":["Offers were extracted from forwarded content."]}',
    '',
    'Example 3',
    'Input:',
    'We may have some stock on metformin around 3.10, let me know if useful.',
    '',
    'Output:',
    '{"supplierName":null,"offers":[],"overallConfidence":"LOW","reviewRecommended":true,"notes":["No offer was returned because product specification and currency were too unclear."]}',
    '',
    rawText,
  ].join('\n');
}

function reduceAiInputText(
  rawText: string,
  maxChars: number,
): {
  reducedText: string;
  changed: boolean;
  reasons: string[];
  noiseOnly: boolean;
} {
  let reducedText = rawText.replace(/\r\n/g, '\n').trim();
  const reasons: string[] = [];
  let changed = false;

  const forwardedSeparatorPattern = /^[-_=]{5,}\s*$/gm;
  if (forwardedSeparatorPattern.test(reducedText)) {
    reducedText = reducedText.replace(forwardedSeparatorPattern, '');
    changed = true;
    reasons.push('removed_forwarded_separators');
  }

  const quotedReplyPattern =
    /\n(?:On .+wrote:|From:\s.+|Sent:\s.+|Subject:\s.+|To:\s.+)\n[\s\S]*$/i;
  if (quotedReplyPattern.test(reducedText)) {
    reducedText = reducedText.replace(quotedReplyPattern, '').trim();
    changed = true;
    reasons.push('removed_quoted_thread_history');
  }

  const disclaimerPattern =
    /\n(?:this e-?mail(?: and any attachments)? is confidential|confidentiality notice|please consider the environment before printing this email|the information contained in this email is intended only for the named recipient)[\s\S]*$/i;
  if (disclaimerPattern.test(reducedText)) {
    reducedText = reducedText.replace(disclaimerPattern, '').trim();
    changed = true;
    reasons.push('removed_legal_disclaimer');
  }

  reducedText = reducedText.replace(/\n{3,}/g, '\n\n').trim();

  if (reducedText.length > maxChars) {
    reducedText = reducedText.slice(0, maxChars).trim();
    changed = true;
    reasons.push('truncated_to_max_chars');
  }

  const noiseOnly =
    !/[a-z0-9]/i.test(reducedText) || /^[\W_]+$/.test(reducedText);

  return {
    reducedText,
    changed: changed || reducedText !== rawText.trim(),
    reasons,
    noiseOnly,
  };
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as Record<string, unknown>;

  if (
    typeof candidate.output_text === 'string' &&
    candidate.output_text.trim()
  ) {
    return candidate.output_text;
  }

  if (!Array.isArray(candidate.output)) {
    return null;
  }

  for (const item of candidate.output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const content = (item as Record<string, unknown>).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (
        !contentItem ||
        typeof contentItem !== 'object' ||
        Array.isArray(contentItem)
      ) {
        continue;
      }

      const text = (contentItem as Record<string, unknown>).text;

      if (typeof text === 'string' && text.trim()) {
        return text;
      }
    }
  }

  return null;
}

export function createOpenAiOfferParser(
  overrides?: Partial<OpenAiOfferParserDependencies>,
) {
  const dependencies: OpenAiOfferParserDependencies = {
    apiKey: env.openAiApiKey,
    enabled: env.openAiParserEnabled,
    fetchImpl: fetch,
    logger,
    maxChars: env.openAiParserMaxChars,
    minChars: env.openAiParserMinChars,
    model: env.openAiParserModel,
    timeoutMs: env.openAiParserTimeoutMs,
    ...overrides,
  };

  return {
    async parseText(input: {
      rawText: string;
      source: AiParsingSource;
    }): Promise<AiOfferParsingAttemptResult> {
      if (!dependencies.enabled) {
        return {
          status: 'disabled',
          reason: 'OpenAI fallback parsing is disabled.',
          decision: 'disabled',
        };
      }

      if (!dependencies.apiKey) {
        return {
          status: 'disabled',
          reason:
            'OpenAI fallback parsing is disabled because OPENAI_API_KEY is missing.',
          decision: 'disabled',
        };
      }

      const reduction = reduceAiInputText(input.rawText, dependencies.maxChars);

      if (!reduction.reducedText) {
        return {
          status: 'disabled',
          reason:
            'OpenAI fallback parsing was skipped because the reduced text was empty.',
          decision: 'skipped_empty_after_reduction',
        };
      }

      if (reduction.reducedText.length < dependencies.minChars) {
        return {
          status: 'disabled',
          reason:
            'OpenAI fallback parsing was skipped because the text was too short to help.',
          decision: 'skipped_too_short',
        };
      }

      if (reduction.noiseOnly) {
        return {
          status: 'disabled',
          reason:
            'OpenAI fallback parsing was skipped because the text was mostly noise.',
          decision: 'skipped_too_noisy',
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        dependencies.timeoutMs,
      );

      try {
        const response = await dependencies.fetchImpl(
          'https://api.openai.com/v1/responses',
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${dependencies.apiKey}`,
            },
            body: JSON.stringify({
              model: dependencies.model,
              store: false,
              input: [
                {
                  role: 'system',
                  content: [
                    {
                      type: 'input_text',
                      text: 'You are extracting structured commercial facts for an internal UK pharmaceutical wholesale workflow. Only return explicitly supported facts. Never invent missing details.',
                    },
                  ],
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'input_text',
                      text: buildPrompt(input.source, reduction.reducedText),
                    },
                  ],
                },
              ],
              text: {
                format: {
                  type: 'json_schema',
                  name: 'supplier_offer_parse',
                  strict: true,
                  schema: AI_PARSER_RESPONSE_SCHEMA,
                },
              },
            }),
          },
        );

        const requestId = response.headers.get('x-request-id');

        if (!response.ok) {
          const errorText = await response.text();
          dependencies.logger.warn('OpenAI fallback parser request failed', {
            requestId,
            status: response.status,
          });
          return {
            status: 'error',
            reason: `OpenAI fallback parser request failed with status ${response.status}.`,
            decision: 'request_failed',
            issues: [errorText || 'OpenAI request failed.'],
            requestId,
            promptVersion: AI_PARSER_PROMPT_VERSION,
            reducedText: reduction.reducedText,
          };
        }

        const payload = (await response.json()) as unknown;
        const outputText = extractOutputText(payload);

        if (!outputText) {
          return {
            status: 'unusable',
            reason:
              'OpenAI fallback parser did not return structured output text.',
            decision: 'response_missing_text',
            issues: ['Missing output_text in OpenAI response.'],
            requestId,
            promptVersion: AI_PARSER_PROMPT_VERSION,
            reducedText: reduction.reducedText,
          };
        }

        let parsedPayload: unknown;

        try {
          parsedPayload = JSON.parse(outputText);
        } catch {
          return {
            status: 'unusable',
            reason: 'OpenAI fallback parser returned non-JSON output.',
            decision: 'response_invalid_json',
            issues: ['OpenAI output was not valid JSON.'],
            requestId,
            promptVersion: AI_PARSER_PROMPT_VERSION,
            reducedText: reduction.reducedText,
          };
        }

        const validation = validateAiParsedOfferResponse(parsedPayload);

        if (!validation.valid || !validation.data) {
          return {
            status: 'unusable',
            reason: 'OpenAI fallback parser returned unusable structured data.',
            decision: 'response_unusable',
            issues: validation.issues,
            requestId,
            promptVersion: AI_PARSER_PROMPT_VERSION,
            reducedText: reduction.reducedText,
          };
        }

        return {
          status: 'success',
          reason: 'OpenAI fallback parser returned validated structured data.',
          decision: 'accepted',
          result: validation.data,
          requestId,
          promptVersion: AI_PARSER_PROMPT_VERSION,
          reducedText: reduction.reducedText,
        };
      } catch (error) {
        const issue =
          error instanceof Error
            ? error.message
            : 'OpenAI fallback parser failed unexpectedly.';
        dependencies.logger.warn('OpenAI fallback parser errored', {
          error: issue,
          source: input.source,
        });
        return {
          status: 'error',
          reason:
            issue === 'This operation was aborted'
              ? 'OpenAI fallback parser timed out.'
              : 'OpenAI fallback parser failed.',
          decision: 'request_failed',
          issues: [issue],
          requestId: null,
          promptVersion: AI_PARSER_PROMPT_VERSION,
          reducedText: reduction.reducedText,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export const openAiOfferParser = createOpenAiOfferParser();
