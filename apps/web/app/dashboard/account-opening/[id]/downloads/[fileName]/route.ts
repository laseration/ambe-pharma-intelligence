import {
  downloadAccountOpeningBinaryFillPreviewFile,
  downloadAccountOpeningFillPreviewFile,
  downloadAccountOpeningReviewExportFile,
} from '../../../../../../lib/accountOpeningApi';
import { requireAccountOpeningDownloadAccess } from '../../../../../../lib/accountOpeningDownloadAuth';
import {
  classifyAccountOpeningDownloadFileName,
  safeAccountOpeningDownloadFileName,
} from '../../../../../../lib/accountOpeningDownloadFiles';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fileName: string }> },
) {
  const { id, fileName } = await context.params;
  const downloadKind = classifyAccountOpeningDownloadFileName(fileName);

  if (!downloadKind) {
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
    const file =
      downloadKind === 'binary-fill-preview'
        ? await downloadAccountOpeningBinaryFillPreviewFile(id, fileName)
        : downloadKind === 'fill-preview'
          ? await downloadAccountOpeningFillPreviewFile(id, fileName)
          : await downloadAccountOpeningReviewExportFile(id, fileName);

    return new Response(file.content, {
      status: 200,
      headers: {
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${safeAccountOpeningDownloadFileName(file.fileName)}"`,
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
