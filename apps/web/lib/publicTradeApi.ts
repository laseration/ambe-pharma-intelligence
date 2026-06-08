import 'server-only';

import type { TradeAccessFormValues } from './tradeAccessValidation';
import {
  getInternalApiBaseUrl,
  redactInternalApiSecrets,
} from './internalApiRequest';

type PublicTradeApiEnv = Record<string, string | undefined>;

type PublicTradeEnquiryResponse = {
  item: {
    id: string;
    status: string;
    createdAt: string;
  };
  message: string;
};

const DEFAULT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000/public';

function publicApiBaseFromInternalBaseUrl(value: string): string {
  return value.replace(/\/api\/?$/i, '/public').replace(/\/+$/, '');
}

export function getPublicTradeApiBaseUrl(
  source: PublicTradeApiEnv = process.env,
): string {
  const configuredBaseUrl = source.PUBLIC_TRADE_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '');
  }

  if (source.NODE_ENV === 'production') {
    return publicApiBaseFromInternalBaseUrl(getInternalApiBaseUrl(source));
  }

  const localInternalBaseUrl =
    source.INTERNAL_API_BASE_URL?.trim() ||
    source.NEXT_PUBLIC_INTERNAL_API_BASE_URL?.trim();

  return localInternalBaseUrl
    ? publicApiBaseFromInternalBaseUrl(localInternalBaseUrl)
    : DEFAULT_PUBLIC_API_BASE_URL;
}

function optionalPayloadValue(value: string): string | undefined {
  return value.trim() || undefined;
}

export async function submitPublicTradeEnquiry(
  values: TradeAccessFormValues,
): Promise<PublicTradeEnquiryResponse> {
  const response = await fetch(
    `${getPublicTradeApiBaseUrl()}/trade-enquiries`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        companyName: values.companyName,
        contactName: values.contactName,
        contactEmail: values.contactEmail,
        contactPhone: optionalPayloadValue(values.contactPhone),
        businessType: optionalPayloadValue(values.businessType),
        country: optionalPayloadValue(values.country),
        productName: values.productName,
        strength: optionalPayloadValue(values.strength),
        packSize: optionalPayloadValue(values.packSize),
        quantityRequired: optionalPayloadValue(values.quantityRequired),
        targetMarket: optionalPayloadValue(values.targetMarket),
        requiredBy: optionalPayloadValue(values.requiredBy),
        documentationNotes: optionalPayloadValue(values.documentationNotes),
        additionalNotes: optionalPayloadValue(values.additionalNotes),
        website: optionalPayloadValue(values.website),
      }),
    },
  );

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    throw new Error(
      redactInternalApiSecrets(
        responseText ||
          `Trade enquiry submission failed with status ${response.status}.`,
      ),
    );
  }

  return (await response.json()) as PublicTradeEnquiryResponse;
}
