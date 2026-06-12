'use server';

import { redirect } from 'next/navigation';

import {
  updateBuyerTradeEnquiryStatus,
  type BuyerTradeEnquiryStatus,
} from '../../../lib/tradeEnquiriesApi';
import { requireCurrentWebCapability } from '../../../lib/serverWebAuth';

function value(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function normalizeStatus(value: string): BuyerTradeEnquiryStatus | null {
  switch (value) {
    case 'NEW':
    case 'REVIEWING':
    case 'MATCHED':
    case 'QUOTED':
    case 'CLOSED':
    case 'REJECTED':
    case 'DUPLICATE':
    case 'SPAM':
    case 'ARCHIVED':
      return value;
    default:
      return null;
  }
}

function detailRedirect(
  enquiryId: string,
  key: string,
  message: string,
): string {
  const searchParams = new URLSearchParams();
  searchParams.set(key, message);
  return `/dashboard/trade-enquiries/${encodeURIComponent(enquiryId)}?${searchParams.toString()}`;
}

export async function submitBuyerTradeEnquiryStatusAction(formData: FormData) {
  await requireCurrentWebCapability('trade-enquiries:manage');

  const enquiryId = value(formData, 'enquiryId');
  const status = normalizeStatus(value(formData, 'status'));
  const reviewNotes = value(formData, 'reviewNotes');

  if (!enquiryId || !status) {
    redirect(
      `/dashboard/trade-enquiries?error=${encodeURIComponent(
        'Missing trade enquiry status input.',
      )}`,
    );
  }

  try {
    await updateBuyerTradeEnquiryStatus(enquiryId, {
      status,
      reviewNotes: reviewNotes || undefined,
      actorType: 'OPERATOR',
      actorIdentifier: 'web-dashboard',
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Trade enquiry status update failed.';
    redirect(detailRedirect(enquiryId, 'error', message));
  }

  redirect(detailRedirect(enquiryId, 'updated', status));
}
