import path from 'node:path';

import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';

import type { NormalizedEmailAttachment } from './inbound/types';

const EXTRACTION_TIMEOUT_MS = 15000;

export type AttachmentTextExtractionResult = {
  method: 'PDF_TEXT' | 'IMAGE_OCR';
  text: string;
  warnings: string[];
};

function lower(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isPdfAttachment(
  input: Pick<NormalizedEmailAttachment, 'fileName' | 'mimeType'>,
): boolean {
  const extension = input.fileName
    ? path.extname(input.fileName).toLowerCase()
    : '';
  const mimeType = lower(input.mimeType);

  return extension === '.pdf' || mimeType === 'application/pdf';
}

function isImageAttachment(
  input: Pick<NormalizedEmailAttachment, 'fileName' | 'mimeType'>,
): boolean {
  const extension = input.fileName
    ? path.extname(input.fileName).toLowerCase()
    : '';
  const mimeType = lower(input.mimeType);

  return (
    mimeType.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp'].includes(extension)
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function extractPdfText(
  buffer: Buffer,
): Promise<AttachmentTextExtractionResult | null> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await withTimeout(
      parser.getText(),
      EXTRACTION_TIMEOUT_MS,
      'PDF text extraction',
    );
    const text = normalizeExtractedText(result.text);

    if (!text) {
      return null;
    }

    return {
      method: 'PDF_TEXT',
      text,
      warnings: [],
    };
  } finally {
    await parser.destroy();
  }
}

async function extractImageText(
  buffer: Buffer,
): Promise<AttachmentTextExtractionResult | null> {
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: () => undefined,
  });

  try {
    const result = await withTimeout(
      worker.recognize(buffer, {
        rotateAuto: true,
      }),
      EXTRACTION_TIMEOUT_MS,
      'Image OCR',
    );
    const text = normalizeExtractedText(result.data.text);

    if (!text) {
      return null;
    }

    return {
      method: 'IMAGE_OCR',
      text,
      warnings: [],
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractAttachmentText(
  attachment: NormalizedEmailAttachment,
): Promise<AttachmentTextExtractionResult | null> {
  if (!attachment.buffer) {
    return null;
  }

  try {
    if (isPdfAttachment(attachment)) {
      return await extractPdfText(attachment.buffer);
    }

    if (isImageAttachment(attachment)) {
      return await extractImageText(attachment.buffer);
    }
  } catch {
    return null;
  }

  return null;
}
