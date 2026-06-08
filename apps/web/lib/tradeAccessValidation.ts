export type TradeAccessFormValues = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  businessType: string;
  country: string;
  productName: string;
  strength: string;
  packSize: string;
  quantityRequired: string;
  targetMarket: string;
  requiredBy: string;
  documentationNotes: string;
  additionalNotes: string;
  website: string;
};

export type TradeAccessFormErrors = Partial<
  Record<keyof TradeAccessFormValues, string>
>;

export type TradeAccessValidationResult =
  | {
      valid: true;
      values: TradeAccessFormValues;
      errors: TradeAccessFormErrors;
    }
  | {
      valid: false;
      values: TradeAccessFormValues;
      errors: TradeAccessFormErrors;
    };

export const emptyTradeAccessFormValues: TradeAccessFormValues = {
  companyName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  businessType: '',
  country: '',
  productName: '',
  strength: '',
  packSize: '',
  quantityRequired: '',
  targetMarket: '',
  requiredBy: '',
  documentationNotes: '',
  additionalNotes: '',
  website: '',
};

const MAX_SHORT_FIELD_LENGTH = 180;
const MAX_NOTE_LENGTH = 500;

function readText(
  input: FormData | Record<string, FormDataEntryValue | string | undefined>,
  key: keyof TradeAccessFormValues,
): string {
  const rawValue =
    input instanceof FormData ? input.get(key) : (input[key] ?? '');

  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateRequiredText(
  values: TradeAccessFormValues,
  errors: TradeAccessFormErrors,
  key: keyof TradeAccessFormValues,
  label: string,
) {
  const value = values[key];

  if (value.length < 2) {
    errors[key] = `${label} is required.`;
    return;
  }

  if (value.length > MAX_SHORT_FIELD_LENGTH) {
    errors[key] =
      `${label} must be ${MAX_SHORT_FIELD_LENGTH} characters or fewer.`;
  }
}

function validateOptionalText(
  values: TradeAccessFormValues,
  errors: TradeAccessFormErrors,
  key: keyof TradeAccessFormValues,
  label: string,
  maxLength = MAX_SHORT_FIELD_LENGTH,
) {
  if (values[key].length > maxLength) {
    errors[key] = `${label} must be ${maxLength} characters or fewer.`;
  }
}

export function validateTradeAccessForm(
  input: FormData | Record<string, FormDataEntryValue | string | undefined>,
): TradeAccessValidationResult {
  const values: TradeAccessFormValues = {
    companyName: readText(input, 'companyName'),
    contactName: readText(input, 'contactName'),
    contactEmail: readText(input, 'contactEmail').toLowerCase(),
    contactPhone: readText(input, 'contactPhone'),
    businessType: readText(input, 'businessType'),
    country: readText(input, 'country'),
    productName: readText(input, 'productName'),
    strength: readText(input, 'strength'),
    packSize: readText(input, 'packSize'),
    quantityRequired: readText(input, 'quantityRequired'),
    targetMarket: readText(input, 'targetMarket'),
    requiredBy: readText(input, 'requiredBy'),
    documentationNotes: readText(input, 'documentationNotes'),
    additionalNotes: readText(input, 'additionalNotes'),
    website: readText(input, 'website'),
  };
  const errors: TradeAccessFormErrors = {};

  validateRequiredText(values, errors, 'companyName', 'Company name');
  validateRequiredText(values, errors, 'contactName', 'Contact name');
  validateRequiredText(values, errors, 'productName', 'Product requirement');

  if (!values.contactEmail) {
    errors.contactEmail = 'Email address is required.';
  } else if (!isLikelyEmail(values.contactEmail)) {
    errors.contactEmail = 'Enter a valid business email address.';
  } else if (values.contactEmail.length > 254) {
    errors.contactEmail = 'Email address must be 254 characters or fewer.';
  }

  validateOptionalText(values, errors, 'contactPhone', 'Phone');
  validateOptionalText(values, errors, 'businessType', 'Business type');
  validateOptionalText(values, errors, 'country', 'Country');
  validateOptionalText(values, errors, 'strength', 'Strength');
  validateOptionalText(values, errors, 'packSize', 'Pack size');
  validateOptionalText(values, errors, 'quantityRequired', 'Quantity');
  validateOptionalText(values, errors, 'targetMarket', 'Target market');
  validateOptionalText(values, errors, 'requiredBy', 'Required by');
  validateOptionalText(
    values,
    errors,
    'documentationNotes',
    'Documentation notes',
    MAX_NOTE_LENGTH,
  );
  validateOptionalText(
    values,
    errors,
    'additionalNotes',
    'Additional notes',
    MAX_NOTE_LENGTH,
  );

  if (values.website) {
    errors.website = 'Submission could not be accepted.';
  }

  if (values.requiredBy) {
    const parsed = new Date(values.requiredBy);
    if (Number.isNaN(parsed.getTime())) {
      errors.requiredBy = 'Enter a valid required-by date.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    values,
    errors,
  };
}
