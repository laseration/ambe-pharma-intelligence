import {
  downloadAccountOpeningFillPreviewFile,
  downloadAccountOpeningReviewExportFile,
} from '../../../../../../lib/accountOpeningApi';
import { requireAccountOpeningDownloadAccess } from '../../../../../../lib/accountOpeningDownloadAuth';

export const runtime = 'nodejs';

const DOWNLOAD_FILE_NAMES = new Set([
  'review-pack.json',
  'review-pack.md',
  'completion-draft.json',
  'field-mapping-summary.json',
  'unresolved-fields.json',
  'blocked-fields.json',
  'signing-notes.json',
  'risk-summary.json',
  'source-evidence.json',
  'source-evidence.md',
]);
const FILL_PREVIEW_FILE_NAMES = new Set([
  'fill-preview.json',
  'fill-preview.md',
  'fill-values.json',
  'blank-fields.json',
  'original-form-reference.json',
]);
const ALL_DOWNLOAD_FILE_NAMES = new Set([
  ...DOWNLOAD_FILE_NAMES,
  ...FILL_PREVIEW_FILE_NAMES,
]);

function safeFileName(value: string): string {
  return ALL_DOWNLOAD_FILE_NAMES.has(value)
    ? value
    : 'account-opening-review.txt';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fileName: string }> },
) {
  const { id, fileName } = await context.params;

  if (!ALL_DOWNLOAD_FILE_NAMES.has(fileName)) {
    return Response.json(
      { error: 'Unsupported account-opening review download file.' },
      { status: 404 },
    );
  }

  const auth = requireAccountOpeningDownloadAccess(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const file = FILL_PREVIEW_FILE_NAMES.has(fileName)
      ? await downloadAccountOpeningFillPreviewFile(id, fileName)
      : await downloadAccountOpeningReviewExportFile(id, fileName);

    return new Response(file.content, {
      status: 200,
      headers: {
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${safeFileName(file.fileName)}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to download account-opening review export.',
      },
      { status: 500 },
    );
  }
}
