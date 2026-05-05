import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  COMMERCIAL_INTEL_PROMPT_VERSION,
  COMMERCIAL_INTEL_RESPONSE_SCHEMA,
  type AiCommercialIntelResponse,
  validateCommercialIntelResponse,
} from './schema';

type ParserStatus = 'success' | 'disabled' | 'unusable' | 'error';

export type CommercialIntelParsingAttemptResult =
  | {
      status: 'success';
      reason: string;
      decision: 'accepted';
      result: AiCommercialIntelResponse;
      requestId: string | null;
      promptVersion: string;
      reducedText: string;
    }
  | {
      status: Exclude<ParserStatus, 'success'>;
      reason: string;
      decision:
        | 'disabled'
        | 'skipped_empty_after_reduction'
        | 'skipped_too_short'
        | 'request_failed'
        | 'response_missing_text'
        | 'response_invalid_json'
        | 'response_unusable';
      issues?: string[];
      requestId?: string | null;
      promptVersion?: string;
      reducedText?: string;
    };

export type CommercialIntelParser = {
  parseText: (input: { rawText: string; source: string }) => Promise<CommercialIntelParsingAttemptResult>;
};

type CommercialIntelParserDependencies = {
  apiKey: string;
  enabled: boolean;
  fetchImpl: typeof fetch;
  logger: Pick<typeof logger, 'warn'>;
  maxChars: number;
  minChars: number;
  model: string;
  timeoutMs: number;
};

function reduceText(rawText: string, maxChars: number): string {
  return rawText
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars);
}

function buildPrompt(source: string, text: string): string {
  return [
    `Source: ${source}`,
    '',
    'Classify this inbound email body and extract commercial intelligence notes for an internal UK pharmaceutical wholesale workflow.',
    '',
    'Intent labels:',
    '- SUPPLIER_OFFER: product+price supplier quote/list, handled by the separate supplier-offer parser.',
    '- CUSTOMER_REQUEST: a buyer/customer demand or request.',
    '- COMMERCIAL_INTEL: business knowledge, supplier reliability, market note, manual buy/sell trigger, expiry rule, product/contact note.',
    '- MIXED: contains both supplier offer data and commercial intelligence/customer demand.',
    '- UNKNOWN: unclear or non-actionable.',
    '',
    'Extraction rules:',
    '- Do not extract supplier offer quote rows whose main fact is product+price availability from a supplier.',
    '- Extract only explicitly stated business knowledge, demand, rules, risks, or market advice.',
    '- Prefer null over guessing.',
    '- Preserve exact evidenceText copied from the email.',
    '- Use LOW confidence for vague notes or weakly supported interpretations.',
    '- Do not infer product, supplier, customer, or contact unless explicit.',
    '- Do not recommend buying or selling as an action; only structure the stated note.',
    '',
    'Email text:',
    text,
  ].join('\n');
}

function extractOutputText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const direct = (payload as Record<string, unknown>).output_text;
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }

  const output = (payload as Record<string, unknown>).output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object' || Array.isArray(contentItem)) {
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

export function createCommercialIntelParser(overrides?: Partial<CommercialIntelParserDependencies>): CommercialIntelParser {
  const dependencies: CommercialIntelParserDependencies = {
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
    async parseText(input) {
      if (!dependencies.enabled) {
        return {
          status: 'disabled',
          reason: 'Commercial intel parsing is disabled.',
          decision: 'disabled',
        };
      }

      if (!dependencies.apiKey) {
        return {
          status: 'disabled',
          reason: 'Commercial intel parsing is disabled because OPENAI_API_KEY is missing.',
          decision: 'disabled',
        };
      }

      const reducedText = reduceText(input.rawText, dependencies.maxChars);
      if (!reducedText) {
        return {
          status: 'disabled',
          reason: 'Commercial intel parsing was skipped because the reduced text was empty.',
          decision: 'skipped_empty_after_reduction',
        };
      }

      if (reducedText.length < dependencies.minChars) {
        return {
          status: 'disabled',
          reason: 'Commercial intel parsing was skipped because the text was too short to help.',
          decision: 'skipped_too_short',
          reducedText,
        };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);

      try {
        const response = await dependencies.fetchImpl('https://api.openai.com/v1/responses', {
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
                    text:
                      'You extract conservative commercial intelligence from email. Only structure explicitly supported facts. Never invent details.',
                  },
                ],
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: buildPrompt(input.source, reducedText),
                  },
                ],
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'commercial_intel_parse',
                strict: true,
                schema: COMMERCIAL_INTEL_RESPONSE_SCHEMA,
              },
            },
          }),
        });

        const requestId = response.headers.get('x-request-id');

        if (!response.ok) {
          const errorText = await response.text();
          dependencies.logger.warn('Commercial intel parser request failed', {
            requestId,
            status: response.status,
          });
          return {
            status: 'error',
            reason: `Commercial intel parser request failed with status ${response.status}.`,
            decision: 'request_failed',
            issues: [errorText || 'OpenAI request failed.'],
            requestId,
            promptVersion: COMMERCIAL_INTEL_PROMPT_VERSION,
            reducedText,
          };
        }

        const outputText = extractOutputText(await response.json());
        if (!outputText) {
          return {
            status: 'unusable',
            reason: 'Commercial intel parser did not return structured output text.',
            decision: 'response_missing_text',
            issues: ['Missing output_text in OpenAI response.'],
            requestId,
            promptVersion: COMMERCIAL_INTEL_PROMPT_VERSION,
            reducedText,
          };
        }

        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(outputText);
        } catch {
          return {
            status: 'unusable',
            reason: 'Commercial intel parser returned non-JSON output.',
            decision: 'response_invalid_json',
            issues: ['OpenAI output was not valid JSON.'],
            requestId,
            promptVersion: COMMERCIAL_INTEL_PROMPT_VERSION,
            reducedText,
          };
        }

        const validation = validateCommercialIntelResponse(parsedPayload);
        if (!validation.valid || !validation.data) {
          return {
            status: 'unusable',
            reason: 'Commercial intel parser returned unusable structured data.',
            decision: 'response_unusable',
            issues: validation.issues,
            requestId,
            promptVersion: COMMERCIAL_INTEL_PROMPT_VERSION,
            reducedText,
          };
        }

        return {
          status: 'success',
          reason: 'Commercial intel parser returned validated structured data.',
          decision: 'accepted',
          result: validation.data,
          requestId,
          promptVersion: COMMERCIAL_INTEL_PROMPT_VERSION,
          reducedText,
        };
      } catch (error) {
        const issue =
          error instanceof Error ? error.message : 'Commercial intel parser failed unexpectedly.';
        dependencies.logger.warn('Commercial intel parser errored', {
          error: issue,
          source: input.source,
        });
        return {
          status: 'error',
          reason:
            issue === 'This operation was aborted'
              ? 'Commercial intel parser timed out.'
              : 'Commercial intel parser failed.',
          decision: 'request_failed',
          issues: [issue],
          requestId: null,
          promptVersion: COMMERCIAL_INTEL_PROMPT_VERSION,
          reducedText,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export const commercialIntelParser = createCommercialIntelParser();
