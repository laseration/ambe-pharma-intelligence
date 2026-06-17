import React from 'react';

type UploadDocumentFormProps = {
  action: (formData: FormData) => void;
  error?: string | null;
  classification?: string | null;
  fileName?: string | null;
  supplierName?: string | null;
  pending?: boolean;
};

/**
 * Presentational document-upload form. Hook-free and free of the server-only
 * action module so it can be unit-tested directly; the `useActionState` wiring
 * lives in UploadDocumentSection.
 */
export function UploadDocumentForm({
  action,
  error,
  classification,
  fileName,
  supplierName,
  pending,
}: UploadDocumentFormProps) {
  return (
    <section className="panel dashboard-panel">
      <div className="dashboard-section-header">
        <div>
          <h3 className="section-title">Upload a document</h3>
          <p className="copy">
            Attach the account-opening form or a supporting document (PDF,
            image, DOCX, XLSX, CSV, or TXT, up to 10MB). The system reads and
            classifies it for review only — it never signs, sends, or completes
            anything, and raw files are not shown on the dashboard.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}

      {classification ? (
        <div className="alert alert-success" role="status">
          Uploaded {fileName ?? 'document'} — classified as {classification}.
          {supplierName ? ` Detected supplier: ${supplierName}.` : ''} Review
          the case before completion.
        </div>
      ) : null}

      <form action={action} className="action-form">
        <label>
          Document file
          <input
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.csv,.txt"
            name="file"
            required
            type="file"
          />
        </label>
        <button
          className="button button-primary"
          disabled={pending}
          type="submit"
        >
          {pending ? 'Uploading…' : 'Upload & classify'}
        </button>
      </form>
    </section>
  );
}
