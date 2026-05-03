import { normalizeEmailTextForParsing } from './parsing';

export type PurchaseOrderPdfLine = {
  quantity: number | null;
  stockCode: string | null;
  productDescription: string;
  unitPrice: number | null;
  netAmount: number | null;
  vatCode: string | null;
  rawLine: string;
};

export type PurchaseOrderPdfExtraction = {
  parserVersion: 'ambe-po-pdf-v1';
  detected: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  supplierName: string | null;
  supplierAddressText: string | null;
  poNumber: string | null;
  orderDate: string | null;
  accountNo: string | null;
  totalNetAmount: number | null;
  totalVatAmount: number | null;
  orderTotal: number | null;
  lines: PurchaseOrderPdfLine[];
  evidence: string[];
};

const PARSER_VERSION = 'ambe-po-pdf-v1' as const;

const STRONG_CUE_PATTERNS = [
  /\bpurchase\s+order\b/i,
  /\bambe\s+(?:limited\s+t\/a\s+)?medical\s+group\b/i,
  /\bsupplier\s+name\b/i,
  /\border\s+no\.?\b/i,
  /\bproduct\s+description\b/i,
  /\bunit\s+price\b/i,
  /\border\s+total\b/i,
];

const NOTE_ROW_PATTERN = /\bbatch\s*\/?\s*expiry\b/i;
const PRODUCT_WORD_PATTERN =
  /\b(?:tabs?|tablets?|caps?(?:ules?)?|syr(?:inges?)?|solution|injection|prefilled|pre-filled|mg|mcg|units?|ml|vials?|amps?)\b/i;

function normalizeText(rawText: string): string {
  return normalizeEmailTextForParsing(rawText)
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseNumber(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[,\u00a3$€]/g, '').trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!match) {
    return null;
  }

  const day = match[1]!.padStart(2, '0');
  const month = match[2]!.padStart(2, '0');
  const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!;

  return `${year}-${month}-${day}`;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      return value.replace(/\s+/g, ' ');
    }
  }

  return null;
}

function extractSupplierAddress(text: string, supplierName: string | null): string | null {
  if (!supplierName) {
    return null;
  }

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const supplierIndex = lines.findIndex((line) => line.toLowerCase().includes(supplierName.toLowerCase()));
  if (supplierIndex < 0) {
    return null;
  }

  const addressLines: string[] = [];
  for (const line of lines.slice(supplierIndex + 1, supplierIndex + 6)) {
    if (/^(account\s+no|order\s+no|invoice\s*\/?\s*tax\s+date|qty\b|stock\s+code|product\s+description)/i.test(line)) {
      break;
    }

    if (line.length > 2) {
      addressLines.push(line);
    }
  }

  return addressLines.length > 0 ? addressLines.join('\n') : null;
}

function extractLine(rawLine: string): PurchaseOrderPdfLine | null {
  const line = rawLine.trim().replace(/\s+/g, ' ');

  if (!line || NOTE_ROW_PATTERN.test(line) || /\b000BDE\b/i.test(line)) {
    return null;
  }

  const match = line.match(
    /^(?<quantity>\d+(?:\.\d+)?)\s+(?<stockCode>[A-Z0-9-]{3,})\s+(?<description>.+?)\s+(?<unitPrice>\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?<netAmount>\d+(?:,\d{3})*(?:\.\d{2})?)\s+(?<vatCode>[A-Z]\d)\b/i,
  );

  if (!match?.groups?.description) {
    return null;
  }

  const productDescription = match.groups.description.trim();
  const stockCode = match.groups.stockCode?.trim();
  const vatCode = match.groups.vatCode?.trim().toUpperCase();
  if (!PRODUCT_WORD_PATTERN.test(productDescription)) {
    return null;
  }

  if (!stockCode || !vatCode) {
    return null;
  }

  return {
    quantity: parseNumber(match.groups.quantity),
    stockCode,
    productDescription,
    unitPrice: parseNumber(match.groups.unitPrice),
    netAmount: parseNumber(match.groups.netAmount),
    vatCode,
    rawLine: line,
  };
}

export function parseAmbePurchaseOrderPdfText(rawText: string): PurchaseOrderPdfExtraction {
  const text = normalizeText(rawText);
  const cueMatches = STRONG_CUE_PATTERNS.filter((pattern) => pattern.test(text));
  const detected = cueMatches.length >= 3;
  const supplierName = firstMatch(text, [
    /\bsupplier\s+name\s*:?\s*([A-Z0-9&.,'()/ -]+?)(?=\n|account\s+no|order\s+no|invoice\s*\/?\s*tax\s+date|$)/i,
    /\bsupplier\s*:?\s*([A-Z0-9&.,'()/ -]+?)(?=\n|account\s+no|order\s+no|invoice\s*\/?\s*tax\s+date|$)/i,
  ]);
  const lines = text.split('\n').map(extractLine).filter((line): line is PurchaseOrderPdfLine => Boolean(line));
  const evidence = [
    ...text.split('\n').filter((line) =>
      /purchase\s+order|supplier\s+name|order\s+no|account\s+no|product\s+description|order\s+total/i.test(line),
    ),
    ...lines.slice(0, 5).map((line) => line.rawLine),
  ].slice(0, 12);

  return {
    parserVersion: PARSER_VERSION,
    detected,
    confidence: detected && supplierName && lines.length > 0 ? 'HIGH' : detected ? 'MEDIUM' : 'LOW',
    supplierName,
    supplierAddressText: extractSupplierAddress(text, supplierName),
    poNumber: firstMatch(text, [
      /\border\s+no\.?\s*:?\s*([A-Z0-9-]+)/i,
      /\bpurchase\s+order\s*(?:no\.?|number)?\s*:?\s*([A-Z0-9-]+)/i,
    ]),
    orderDate: parseDate(firstMatch(text, [
      /\binvoice\s*\/?\s*tax\s+date\s*:?\s*([0-9./-]{8,10})/i,
      /\border\s+date\s*:?\s*([0-9./-]{8,10})/i,
      /\bdate\s*:?\s*([0-9./-]{8,10})/i,
    ])),
    accountNo: firstMatch(text, [/\baccount\s+no\.?\s*:?\s*([A-Z0-9-]+)/i]),
    totalNetAmount: parseNumber(firstMatch(text, [/\btotal\s+net\s*:?\s*(?:GBP|£)?\s*([0-9,]+\.\d{2})/i])),
    totalVatAmount: parseNumber(firstMatch(text, [/\btotal\s+vat\s*:?\s*(?:GBP|£)?\s*([0-9,]+\.\d{2})/i])),
    orderTotal: parseNumber(firstMatch(text, [/\border\s+total\s*:?\s*(?:GBP|£)?\s*([0-9,]+\.\d{2})/i])),
    lines,
    evidence,
  };
}

export function isAmbePurchaseOrderPdfText(rawText: string): boolean {
  return parseAmbePurchaseOrderPdfText(rawText).detected;
}
