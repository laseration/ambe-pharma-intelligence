import { downloadAccountOpeningReviewExportFile } from '../../../../../../lib/accountOpeningApi';
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

function safeFileName(value: string): string {
  return DOWNLOAD_FILE_NAMES.has(value) ? value : 'account-opening-review.txt';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fileName: string }> },
) {
  const { id, fileName } = await context.params;

  if (!DOWNLOAD_FILE_NAMES.has(fileName)) {
    return Response.json(
      { error: 'Unsupported account-opening review export file.' },
      { status: 404 },
    );
  }

  const auth = requireAccountOpeningDownloadAccess(request);
  if (!auth.authorized) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const file = await downloadAccountOpeningReviewExportFile(id, fileName);

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
