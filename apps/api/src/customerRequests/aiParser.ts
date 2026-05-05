import { env } from '../config/env';
import { logger } from '../lib/logger';
import {
  CUSTOMER_REQUEST_PROMPT_VERSION,
  CUSTOMER_REQUEST_RESPONSE_SCHEMA,
  type AiCustomerDemandResponse,
  validateCustomerDemandResponse,
} from './schema';

type ParserStatus = 'success' | 'disabled' | 'unusable' | 'error';

export type CustomerDemandParsingAttemptResult =
  | {
      status: 'success';
      reason: string;
      decision: 'accepted';
      result: AiCustomerDemandResponse;
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

export type CustomerDemandParser = {
  parseText: (input: { rawText: string; source: string }) => Promise<CustomerDemandParsingAttemptResult>;
};

type CustomerDemandParserDependencies = {
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
    'Classify this inbound email body and extract customer/buyer demand requests for an internal UK pharmaceutical wholesale workflow.',
    '',
    'Intent labels:',
    '- CUSTOMER_REQUEST: a buyer/customer asks Ambe for product, stock, price, quote, availability, or sourcing help.',
    '- SUPPLIER_OFFER: someone offers stock/price to Ambe. Do not extract these as customer demand.',
    '- COMMERCIAL_INTEL: general business memory, supplier reliability, market note, or internal rule.',
    '- MIXED: contains customer demand plus another intent.',
    '- UNKNOWN: unclear or non-actionable.',
    '',
    'Extraction rules:',
    '- Extract only buyer/customer requests directed to Ambe, not supplier offers to sell to Ambe.',
    '- Phrases such as "can do X at £Y", "available at £Y", "MOQ", or "limited stock" are supplier-offer language unless the text clearly asks Ambe to quote/source.',
    '- Prefer null over guessing.',
    '- Preserve exact evidenceText copied from the email.',
    '- Use LOW confidence for vague requests or weak product/customer evidence.',
    '- Do not infer product, customer, contact, quantity, target price, or dates unless explicit.',
    '- Do not recommend actions; only structure the stated request.',
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

export function createCustomerDemandParser(overrides?: Partial<CustomerDemandParserDependencies>): CustomerDemandParser {
  const dependencies: CustomerDemandParserDependencies = {
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
          reason: 'Customer demand parsing is disabled.',
          decision: 'disabled',
        };
      }

      if (!dependencies.apiKey) {
        return {
          status: 'disabled',
          reason: 'Customer demand parsing is disabled because OPENAI_API_KEY is missing.',
          decision: 'disabled',
        };
      }

      const reducedText = reduceText(input.rawText, dependencies.maxChars);
      if (!reducedText) {
        return {
          status: 'disabled',
          reason: 'Customer demand parsing was skipped because the reduced text was empty.',
          decision: 'skipped_empty_after_reduction',
        };
      }

      if (reducedText.length < dependencies.minChars) {
        return {
          status: 'disabled',
          reason: 'Customer demand parsing was skipped because the text was too short to help.',
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
                      'You extract conservative customer demand requests from email. Only structure explicitly supported facts. Never invent details.',
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
                name: 'customer_request_parse',
                strict: true,
                schema: CUSTOMER_REQUEST_RESPONSE_SCHEMA,
              },
            },
          }),
        });

        const requestId = response.headers.get('x-request-id');

        if (!response.ok) {
          const errorText = await response.text();
          dependencies.logger.warn('Customer demand parser request failed', {
            requestId,
            status: response.status,
          });
          return {
            status: 'error',
            reason: `Customer demand parser request failed with status ${response.status}.`,
            decision: 'request_failed',
            issues: [errorText || 'OpenAI request failed.'],
            requestId,
            promptVersion: CUSTOMER_REQUEST_PROMPT_VERSION,
            reducedText,
          };
        }

        const outputText = extractOutputText(await response.json());
        if (!outputText) {
          return {
            status: 'unusable',
            reason: 'Customer demand parser did not return structured output text.',
            decision: 'response_missing_text',
            issues: ['Missing output_text in OpenAI response.'],
            requestId,
            promptVersion: CUSTOMER_REQUEST_PROMPT_VERSION,
            reducedText,
          };
        }

        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(outputText);
        } catch {
          return {
            status: 'unusable',
            reason: 'Customer demand parser returned non-JSON output.',
            decision: 'response_invalid_json',
            issues: ['OpenAI output was not valid JSON.'],
            requestId,
            promptVersion: CUSTOMER_REQUEST_PROMPT_VERSION,
            reducedText,
          };
        }

        const validation = validateCustomerDemandResponse(parsedPayload);
        if (!validation.valid || !validation.data) {
          return {
            status: 'unusable',
            reason: 'Customer demand parser returned unusable structured data.',
            decision: 'response_unusable',
            issues: validation.issues,
            requestId,
            promptVersion: CUSTOMER_REQUEST_PROMPT_VERSION,
            reducedText,
          };
        }

        return {
          status: 'success',
          reason: 'Customer demand parser returned validated structured data.',
          decision: 'accepted',
          result: validation.data,
          requestId,
          promptVersion: CUSTOMER_REQUEST_PROMPT_VERSION,
          reducedText,
        };
      } catch (error) {
        const issue = error instanceof Error ? error.message : 'Customer demand parser failed unexpectedly.';
        dependencies.logger.warn('Customer demand parser errored', {
          error: issue,
          source: input.source,
        });
        return {
          status: 'error',
          reason:
            issue === 'This operation was aborted'
              ? 'Customer demand parser timed out.'
              : 'Customer demand parser failed.',
          decision: 'request_failed',
          issues: [issue],
          requestId: null,
          promptVersion: CUSTOMER_REQUEST_PROMPT_VERSION,
          reducedText,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export const customerDemandParser = createCustomerDemandParser();
