import PizZip from 'pizzip';

/**
 * Word (.docx) account-opening form filler.
 *
 * Real supplier account-opening forms are almost never fillable PDF AcroForms —
 * they are Word documents with content controls ("Click here to enter text.")
 * laid out in label/value tables. This fills those controls from a vetted
 * master profile, preserving the supplier's original layout and branding.
 *
 * Safety: this is a REVIEW DRAFT generator. It never fills bank details, sort
 * codes, account numbers, or signature fields (deny-by-default), never signs,
 * never sends, and never submits. Every fill is reported back for human review.
 */

const DOCUMENT_PART = 'word/document.xml';
const PLACEHOLDER_TEXT = 'Click here to enter text.';

export type AccountOpeningDocxContact = {
  name?: string;
  email?: string;
  phone?: string;
};

export type AccountOpeningDocxFillValues = {
  legalCompanyName?: string;
  tradingName?: string;
  registeredAddress?: string;
  warehouseAddress?: string;
  companyNumber?: string;
  vatNumber?: string;
  dateStartedTrading?: string;
  telephone?: string;
  fax?: string;
  website?: string;
  regulatoryAuthority?: string;
  countryRegion?: string;
  wdaNumber?: string;
  wdaGrantedDate?: string;
  lastGdpInspectionDate?: string;
  director?: AccountOpeningDocxContact;
  responsiblePerson?: AccountOpeningDocxContact;
  customerService?: AccountOpeningDocxContact;
  sales?: AccountOpeningDocxContact;
  accounts?: AccountOpeningDocxContact;
  outOfHours?: AccountOpeningDocxContact;
};

export type AccountOpeningDocxFillStatus =
  | 'FILLED_FOR_REVIEW'
  | 'NO_FILLABLE_CONTROLS'
  | 'UNSUPPORTED'
  | 'FAILED';

export type AccountOpeningDocxFilledField = {
  index: number;
  section: string | null;
  label: string;
  value: string;
};

export type AccountOpeningDocxBlankField = {
  index: number;
  section: string | null;
  label: string;
  reason: 'POLICY_MUST_STAY_BLANK' | 'NO_PROFILE_VALUE' | 'UNRECOGNISED_FIELD';
};

export type AccountOpeningDocxFillResult = {
  status: AccountOpeningDocxFillStatus;
  filledBytes: Uint8Array | null;
  totalControls: number;
  filledCount: number;
  blankCount: number;
  filledFields: AccountOpeningDocxFilledField[];
  blankFields: AccountOpeningDocxBlankField[];
  warnings: string[];
  safetySummary: {
    reviewDraftOnly: true;
    bankDetailsLeftBlank: true;
    signatureFieldsLeftBlank: true;
    documentSigned: false;
    documentSent: false;
    documentSubmitted: false;
  };
};

// Section headers that scope the generic person sub-labels (NAME / E-MAIL / PHONE).
const CONTACT_SECTIONS: Array<{
  test: RegExp;
  key: keyof AccountOpeningDocxFillValues;
}> = [
  { test: /\bDIRECTOR\b/, key: 'director' },
  { test: /\bRESPONSIBLE\s+PERSON\b/, key: 'responsiblePerson' },
  { test: /\bCUSTOMER\s+SERVICE\b/, key: 'customerService' },
  { test: /\bSALES\b/, key: 'sales' },
  { test: /\bACCOUNTS\b|\bFINANCE\b/, key: 'accounts' },
  { test: /\bOUT\s+OF\s+HOURS\b/, key: 'outOfHours' },
];

// Headers that close a contact block. Once we pass one of these (scanning
// backwards), there is no active contact section, so generic NAME/PHONE/EMAIL
// controls below them (licence, references, signature, office-use) stay blank.
const RESET_HEADERS =
  /^(COMPANY DETAILS|BANK DETAILS|PERSONNEL|LICEN[SC]E DETAILS|ADDITIONAL|TRADE|REFERENCES?|QUALITY|SIGNATURE|DECLARATION|FOR OFFICE USE|TERMS|PRODUCTS)/;

// A header is only trusted if it is short — this stops long sentences that merely
// contain the words "responsible person" from being mistaken for a contact block.
const MAX_HEADER_WORDS = 5;
// How far back (in visible text tokens) a section header is allowed to scope.
const SECTION_LOOKBACK = 14;

// Fields that must NEVER be auto-filled (deny-by-default): bank/payment details,
// any signature/declaration field, and unverifiable licence/credit numbers.
const NEVER_FILL = [
  /\bBANK\b/,
  /\bACCOUNT\s+(NAME|NUMBER|NO)\b/,
  /\bSORT\s*CODE\b/,
  /\bSWIFT\b|\bBIC\b/,
  /\bIBAN\b/,
  /\bSIGN(ED|ATURE)?\b/,
  /\bPRINT\s+NAME\b/,
  /\bNATIONAL\s+AUTHORITY\b/,
  /\bCONTACT\s+PERSON\b/,
  /\bREFERENCE\b/,
  /\bCREDIT\s+(LIMIT|RATING|TERMS)\b/,
  /\bGDP\s+CERTIFICATE\b/,
  /\bGDP\s+EXPIRY\b/,
  /\bCONTROLLED\s+DRUGS?\b|\bCD\s+LICENCE\b/,
];

export function normaliseLabel(raw: string): string {
  return raw
    .replace(/[*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[:.\u2026]+$/g, '')
    .trim()
    .toUpperCase();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactValue(
  contact: AccountOpeningDocxContact | undefined,
  label: string,
): string | undefined {
  if (!contact) {
    return undefined;
  }
  if (/MAIL/.test(label)) {
    return contact.email;
  }
  if (/PHONE|TEL\b|TELEPHONE/.test(label)) {
    return contact.phone;
  }
  if (/NAME/.test(label)) {
    return contact.name;
  }
  return undefined;
}

type Resolution =
  | { kind: 'FILL'; value: string }
  | { kind: 'BLANK'; reason: AccountOpeningDocxBlankField['reason'] };

export function resolveControl(
  section: string | null,
  label: string,
  values: AccountOpeningDocxFillValues,
): Resolution {
  for (const pattern of NEVER_FILL) {
    if (pattern.test(label)) {
      return { kind: 'BLANK', reason: 'POLICY_MUST_STAY_BLANK' };
    }
  }

  // Specific labels are matched before generic ones — e.g. "DATE CURRENT WDA
  // GRANTED" must resolve to the grant date, not the WDA number.
  const direct: Array<{ test: RegExp; value?: string }> = [
    {
      test: /^COMPANY NAME$|LEGAL ENTITY NAME|NAME OF LEGAL ENTITY/,
      value: values.legalCompanyName,
    },
    { test: /TRADING NAME/, value: values.tradingName },
    {
      test: /REGISTERED ADDRESS|REGISTERED OFFICE/,
      value: values.registeredAddress,
    },
    {
      test: /WAREHOUSE ADDRESS|TRADING ADDRESS|LICEN[SC]ED SITE/,
      value: values.warehouseAddress,
    },
    { test: /COMPANY REG/, value: values.companyNumber },
    {
      test: /DATE.*STARTED TRADING|NUMBER OF YEARS|YEARS? OF TRADING/,
      value: values.dateStartedTrading,
    },
    { test: /\bVAT\b/, value: values.vatNumber },
    { test: /^WEBSITE/, value: values.website },
    { test: /^FAX/, value: values.fax },
    { test: /TELEPHONE/, value: values.telephone },
    {
      test: /REGULATORY AUTHORITY|REGULATORY BODY/,
      value: values.regulatoryAuthority,
    },
    { test: /\bCOUNTRY\b|\bREGION\b/, value: values.countryRegion },
    {
      test: /DATE.*WDA GRANTED|WDA.*GRANTED|DATE CURRENT WDA/,
      value: values.wdaGrantedDate,
    },
    { test: /LAST GDP INSPECTION/, value: values.lastGdpInspectionDate },
    {
      test: /\bWDA\b|WHOLESALE DISTRIBUTION AUTH|WHOLESALE DEALER/,
      value: values.wdaNumber,
    },
  ];

  for (const entry of direct) {
    if (entry.test.test(label)) {
      return entry.value && entry.value.trim()
        ? { kind: 'FILL', value: entry.value.trim() }
        : { kind: 'BLANK', reason: 'NO_PROFILE_VALUE' };
    }
  }

  // Generic person sub-labels (NAME / E-MAIL / PHONE) are filled ONLY when a
  // trusted contact section is active. Outside a contact block (section === null)
  // they are always left blank — this keeps names out of signature/office fields.
  const sectionKey = section
    ? CONTACT_SECTIONS.find((s) => s.test.test(section))?.key
    : undefined;
  if (sectionKey && /^(NAME|E-?MAIL|MAIL|PHONE|TEL|TELEPHONE)$/.test(label)) {
    const contact = values[sectionKey] as AccountOpeningDocxContact | undefined;
    const value = contactValue(contact, label);
    return value && value.trim()
      ? { kind: 'FILL', value: value.trim() }
      : { kind: 'BLANK', reason: 'NO_PROFILE_VALUE' };
  }

  return { kind: 'BLANK', reason: 'UNRECOGNISED_FIELD' };
}

type ControlSite = {
  sdtStart: number;
  sdtEnd: number;
  placeholderTagStart: number;
  placeholderTagEnd: number;
  label: string;
  section: string | null;
};

/**
 * Locate each placeholder content control and the label/section text that
 * precedes it. Returns sites in document order.
 */
function locateControls(xml: string): ControlSite[] {
  const sites: ControlSite[] = [];
  let searchFrom = 0;

  // Pre-extract visible text tokens with their positions for label inference.
  const textTokens: Array<{ pos: number; text: string }> = [];
  const tokenRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRe.exec(xml)) !== null) {
    const text = tokenMatch[1] ?? '';
    if (text === PLACEHOLDER_TEXT) {
      continue;
    }
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned) {
      textTokens.push({ pos: tokenMatch.index, text: cleaned });
    }
  }

  let placeholderIndex = xml.indexOf(PLACEHOLDER_TEXT, searchFrom);
  while (placeholderIndex !== -1) {
    const sdtStart = xml.lastIndexOf('<w:sdt>', placeholderIndex);
    const sdtEnd = xml.indexOf('</w:sdt>', placeholderIndex);
    // The <w:t> tag that holds the placeholder text.
    const placeholderTagStart = xml.lastIndexOf('<w:t', placeholderIndex);
    const placeholderTagEnd =
      xml.indexOf('</w:t>', placeholderIndex) + '</w:t>'.length;

    if (sdtStart !== -1 && sdtEnd !== -1 && placeholderTagStart !== -1) {
      const preceding = textTokens.filter((t) => t.pos < sdtStart);

      // Label = nearest meaningful preceding token, skipping pure parentheticals
      // ("(if applicable)", "(if different to above)") that sit under the label.
      const meaningful: string[] = [];
      for (
        let i = preceding.length - 1;
        i >= 0 && i >= preceding.length - 4 && meaningful.length < 3;
        i -= 1
      ) {
        const raw = preceding[i]!.text.trim();
        if (/^\(.*\)$/.test(raw) || !/[A-Za-z]/.test(raw)) {
          continue;
        }
        const cleaned = normaliseLabel(raw);
        if (cleaned) {
          meaningful.push(cleaned);
        }
      }
      let label = meaningful[0] ?? '';
      // A bare qualifier ("NO", "NUMBER") only makes sense with the word before
      // it — e.g. "WHOLESALE DISTRIBUTION AUTH (WDA) NO." splits so the control
      // sees just "NO". Merge it back with the preceding label token.
      if (/^(NO|NO\.|NUMBER|REGISTRATION)$/.test(label) && meaningful[1]) {
        label = normaliseLabel(`${meaningful[1]} ${label}`);
      }

      // Section = nearest preceding short header within the lookback window. A
      // reset header (or running out the window) means no active contact block.
      let section: string | null = null;
      for (
        let i = preceding.length - 1;
        i >= 0 && i >= preceding.length - SECTION_LOOKBACK;
        i -= 1
      ) {
        const upper = normaliseLabel(preceding[i]!.text);
        if (upper.split(' ').filter(Boolean).length > MAX_HEADER_WORDS) {
          continue;
        }
        if (RESET_HEADERS.test(upper)) {
          break;
        }
        if (CONTACT_SECTIONS.some((s) => s.test.test(upper))) {
          section = upper;
          break;
        }
      }

      sites.push({
        sdtStart,
        sdtEnd: sdtEnd + '</w:sdt>'.length,
        placeholderTagStart,
        placeholderTagEnd,
        label,
        section,
      });
    }

    searchFrom = placeholderIndex + PLACEHOLDER_TEXT.length;
    placeholderIndex = xml.indexOf(PLACEHOLDER_TEXT, searchFrom);
  }

  // In contact tables the NAME control is emitted before its role header (the
  // role sits in a vertically-merged cell), so "nearest header behind" assigns
  // each NAME to the previous person. The email/phone controls that follow do
  // carry the correct section — realign a bare NAME to its following email/phone.
  for (let i = 0; i < sites.length; i += 1) {
    if (sites[i]!.label !== 'NAME') {
      continue;
    }
    for (let j = i + 1; j < Math.min(sites.length, i + 3); j += 1) {
      if (/^(MAIL|E-?MAIL|PHONE|TEL|TELEPHONE)$/.test(sites[j]!.label)) {
        sites[i]!.section = sites[j]!.section;
        break;
      }
    }
  }

  return sites;
}

function rewriteControl(block: string, value: string): string {
  return (
    block
      // Drop placeholder marker so Word treats it as real content.
      .replace(/<w:showingPlcHdr\s*\/>/g, '')
      // Drop the greyed placeholder style.
      .replace(/<w:rStyle\s+w:val="PlaceholderText"\s*\/>/g, '')
      // Replace the placeholder text run.
      .replace(
        /<w:t(?:\s[^>]*)?>Click here to enter text\.<\/w:t>/,
        `<w:t xml:space="preserve">${escapeXml(value)}</w:t>`,
      )
  );
}

export function fillAccountOpeningDocx(input: {
  docxBytes: Uint8Array | Buffer;
  values: AccountOpeningDocxFillValues;
}): AccountOpeningDocxFillResult {
  const warnings: string[] = [];
  const safetySummary = {
    reviewDraftOnly: true,
    bankDetailsLeftBlank: true,
    signatureFieldsLeftBlank: true,
    documentSigned: false,
    documentSent: false,
    documentSubmitted: false,
  } as const;

  let zip: PizZip;
  try {
    zip = new PizZip(Buffer.from(input.docxBytes));
  } catch (error) {
    return {
      status: 'UNSUPPORTED',
      filledBytes: null,
      totalControls: 0,
      filledCount: 0,
      blankCount: 0,
      filledFields: [],
      blankFields: [],
      warnings: [
        `Not a readable .docx (zip) file: ${(error as Error).message}`,
      ],
      safetySummary,
    };
  }

  const documentFile = zip.file(DOCUMENT_PART);
  if (!documentFile) {
    return {
      status: 'UNSUPPORTED',
      filledBytes: null,
      totalControls: 0,
      filledCount: 0,
      blankCount: 0,
      filledFields: [],
      blankFields: [],
      warnings: ['No word/document.xml — not a Word document.'],
      safetySummary,
    };
  }

  const xml = documentFile.asText();
  const sites = locateControls(xml);

  if (sites.length === 0) {
    return {
      status: 'NO_FILLABLE_CONTROLS',
      filledBytes: null,
      totalControls: 0,
      filledCount: 0,
      blankCount: 0,
      filledFields: [],
      blankFields: [],
      warnings: [
        'No "Click here to enter text" content controls found. This form may use plain blank lines and needs a different fill strategy.',
      ],
      safetySummary,
    };
  }

  const filledFields: AccountOpeningDocxFilledField[] = [];
  const blankFields: AccountOpeningDocxBlankField[] = [];

  // Decide each control first (using original positions), then apply edits from
  // last to first so earlier offsets stay valid.
  const edits: Array<{ start: number; end: number; replacement: string }> = [];

  sites.forEach((site, index) => {
    const resolution = resolveControl(site.section, site.label, input.values);
    if (resolution.kind === 'FILL') {
      const block = xml.slice(site.sdtStart, site.sdtEnd);
      const rewritten = rewriteControl(block, resolution.value);
      if (rewritten === block) {
        warnings.push(
          `Could not rewrite control for "${site.label}" (placeholder run not found); left blank.`,
        );
        blankFields.push({
          index,
          section: site.section,
          label: site.label || '(unlabelled)',
          reason: 'UNRECOGNISED_FIELD',
        });
        return;
      }
      edits.push({
        start: site.sdtStart,
        end: site.sdtEnd,
        replacement: rewritten,
      });
      filledFields.push({
        index,
        section: site.section,
        label: site.label || '(unlabelled)',
        value: resolution.value,
      });
    } else {
      blankFields.push({
        index,
        section: site.section,
        label: site.label || '(unlabelled)',
        reason: resolution.reason,
      });
    }
  });

  if (edits.length === 0) {
    return {
      status: 'FILLED_FOR_REVIEW',
      filledBytes: null,
      totalControls: sites.length,
      filledCount: 0,
      blankCount: blankFields.length,
      filledFields,
      blankFields,
      warnings: [
        ...warnings,
        'No control matched the master profile — nothing was filled.',
      ],
      safetySummary,
    };
  }

  let nextXml = xml;
  edits
    .sort((a, b) => b.start - a.start)
    .forEach((edit) => {
      nextXml =
        nextXml.slice(0, edit.start) +
        edit.replacement +
        nextXml.slice(edit.end);
    });

  zip.file(DOCUMENT_PART, nextXml);
  const filledBytes = zip.generate({ type: 'uint8array' });

  return {
    status: 'FILLED_FOR_REVIEW',
    filledBytes,
    totalControls: sites.length,
    filledCount: filledFields.length,
    blankCount: blankFields.length,
    filledFields,
    blankFields,
    warnings,
    safetySummary,
  };
}
