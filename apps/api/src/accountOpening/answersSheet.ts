import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

import type {
  AccountOpeningDocxContact,
  AccountOpeningDocxFillValues,
} from './docxFill';

/**
 * Generates a clean "Ambe answers" PDF — every value the bot would put on an
 * account-opening form, laid out for a human. This is the universal fallback so
 * the bot can handle ANY incoming form (including flat/scanned PDFs it cannot
 * fill in place): the reviewer reads this sheet and transcribes/finalises.
 *
 * Bank details and signatures are listed as "complete by hand" — never values.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const LINE = 16;

type Writer = {
  text: (
    value: string,
    opts?: { bold?: boolean; size?: number; indent?: number },
  ) => void;
  gap: (amount?: number) => void;
  rule: () => void;
};

function createWriter(
  pdf: PDFDocument,
  regular: PDFFont,
  bold: PDFFont,
): { writer: Writer; finish: () => Promise<Uint8Array> } {
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };

  const wrap = (
    value: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
  ): string[] => {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines.length ? lines : [''];
  };

  const writer: Writer = {
    text: (value, opts = {}) => {
      const size = opts.size ?? 10;
      const font = opts.bold ? bold : regular;
      const indent = opts.indent ?? 0;
      const maxWidth = A4[0] - MARGIN * 2 - indent;
      for (const line of wrap(value, font, size, maxWidth)) {
        ensure(LINE);
        page.drawText(line, {
          x: MARGIN + indent,
          y,
          size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= LINE;
      }
    },
    gap: (amount = LINE / 2) => {
      y -= amount;
    },
    rule: () => {
      ensure(LINE);
      page.drawLine({
        start: { x: MARGIN, y: y + 4 },
        end: { x: A4[0] - MARGIN, y: y + 4 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= LINE / 2;
    },
  };

  return { writer, finish: () => pdf.save() };
}

function row(
  writer: Writer,
  label: string,
  value: string | undefined | null,
): void {
  const shown = value && value.trim() ? value.trim() : '—';
  writer.text(`${label}:  ${shown}`, { indent: 12 });
}

function contactBlock(
  writer: Writer,
  title: string,
  contact: AccountOpeningDocxContact | undefined,
): void {
  writer.text(title, { bold: true, indent: 6 });
  row(writer, 'Name', contact?.name);
  row(writer, 'Email', contact?.email);
  row(writer, 'Phone', contact?.phone);
  writer.gap();
}

export async function buildAccountOpeningAnswersSheetPdf(input: {
  values: AccountOpeningDocxFillValues;
  supplierName?: string | null;
  formName?: string | null;
  generatedAtIso?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { writer, finish } = createWriter(pdf, regular, bold);
  const v = input.values;

  writer.text('Ambe Account-Opening — Answer Sheet (for review)', {
    bold: true,
    size: 15,
  });
  writer.gap();
  if (input.formName) {
    writer.text(`Form: ${input.formName}`, { size: 9 });
  }
  if (input.supplierName) {
    writer.text(`Counterparty: ${input.supplierName}`, { size: 9 });
  }
  if (input.generatedAtIso) {
    writer.text(`Generated: ${input.generatedAtIso}`, { size: 9 });
  }
  writer.text(
    'Unsigned draft data. Bank details and signatures are NOT included and must be completed by hand. Do not send to a supplier without review.',
    { size: 9 },
  );
  writer.gap();
  writer.rule();

  writer.text('Company details', { bold: true, size: 12 });
  row(writer, 'Legal company name', v.legalCompanyName);
  row(writer, 'Trading name', v.tradingName);
  row(writer, 'Company registration no.', v.companyNumber);
  row(writer, 'VAT number', v.vatNumber);
  row(writer, 'Registered address', v.registeredAddress);
  row(writer, 'Trading / warehouse address', v.warehouseAddress);
  row(writer, 'Date started trading', v.dateStartedTrading);
  row(writer, 'Telephone', v.telephone);
  row(writer, 'Fax', v.fax);
  row(writer, 'Website', v.website);
  writer.gap();
  writer.rule();

  writer.text('Regulatory', { bold: true, size: 12 });
  row(writer, 'Regulatory authority', v.regulatoryAuthority);
  row(writer, 'Country / region', v.countryRegion);
  row(writer, 'WDA / premises number', v.wdaNumber);
  row(writer, 'WDA granted', v.wdaGrantedDate);
  row(writer, 'Last GDP inspection', v.lastGdpInspectionDate);
  writer.gap();
  writer.rule();

  writer.text('Contacts', { bold: true, size: 12 });
  writer.gap();
  contactBlock(writer, 'Director', v.director);
  contactBlock(writer, 'Responsible Person', v.responsiblePerson);
  contactBlock(writer, 'Customer Service', v.customerService);
  contactBlock(writer, 'Sales', v.sales);
  contactBlock(writer, 'Accounts / Finance', v.accounts);
  if (v.outOfHours) {
    contactBlock(writer, 'Out of hours', v.outOfHours);
  }
  writer.rule();

  writer.text('Complete by hand (deliberately left out)', {
    bold: true,
    size: 12,
  });
  for (const label of [
    'Bank name & address',
    'Account name',
    'Account number',
    'Sort code',
    'SWIFT / BIC',
    'IBAN',
    'Authorised signature',
    'Signatory name & position',
    'Date',
  ]) {
    row(writer, label, '__________________________');
  }

  return finish();
}
