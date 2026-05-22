import {
  listLikelyDuplicateProductGroups,
  type ProductDuplicateGroup,
} from '../../../lib/productsApi';

export const dynamic = 'force-dynamic';

function describeReasonCode(
  reasonCode: ProductDuplicateGroup['reasonCodes'][number],
) {
  switch (reasonCode) {
    case 'STRUCTURED_BASE_NAME_MATCH':
      return 'Same base product name and matching structured attributes.';
    case 'CANONICAL_ALIAS_COLLISION':
      return 'Different products share the same canonicalized alias wording.';
    default:
      return reasonCode;
  }
}

function formatStructuredValue(value: string | null) {
  return value?.trim() ? value : 'Unknown';
}

function formatConfidence(confidence: ProductDuplicateGroup['confidence']) {
  return confidence === 'HIGH' ? 'High confidence' : 'Medium confidence';
}

export default async function ProductDuplicateTriagePage() {
  try {
    const groups = await listLikelyDuplicateProductGroups();

    return (
      <section className="duplicate-layout">
        <section className="panel duplicate-panel">
          <p className="eyebrow">Product Catalog</p>
          <h2 className="title">Likely Duplicate Products</h2>
          <p className="copy">
            Read-only catalog triage for products that look commercially related
            enough to review before they weaken matching, supplier resolution,
            or signal quality.
          </p>
        </section>

        {groups.length === 0 ? (
          <section className="panel duplicate-panel">
            <h3 className="section-title">No Likely Duplicates Found</h3>
            <p className="copy">
              The current duplicate check did not find any product groups that
              are safe enough to flag for review.
            </p>
          </section>
        ) : (
          groups.map((group) => (
            <section className="panel duplicate-panel" key={group.groupKey}>
              <div className="duplicate-group-header">
                <div>
                  <h3 className="section-title">
                    Duplicate group with {group.products.length} products
                  </h3>
                  <p className="copy">
                    {group.reasonCodes.map(describeReasonCode).join(' ')}
                  </p>
                </div>
                <div className="duplicate-group-badges">
                  <span
                    className={`pill pill-${group.confidence === 'HIGH' ? 'high' : 'neutral'}`}
                  >
                    {formatConfidence(group.confidence)}
                  </span>
                  <span className="pill pill-neutral">
                    {group.products.length} records
                  </span>
                </div>
              </div>

              <div className="duplicate-product-grid">
                {group.products.map((product) => (
                  <article className="duplicate-product-card" key={product.id}>
                    <div className="duplicate-product-top">
                      <div>
                        <p className="duplicate-product-title">
                          {product.name}
                        </p>
                        <p className="duplicate-product-meta">
                          Product ID: {product.id}
                        </p>
                      </div>
                      <span className="pill pill-neutral">
                        {product.aliasCount} aliases
                      </span>
                    </div>

                    <dl className="duplicate-product-details">
                      <div>
                        <dt>Derived base name</dt>
                        <dd>{product.derivedNormalizedBaseName}</dd>
                      </div>
                      <div>
                        <dt>Stored canonical field</dt>
                        <dd>{product.storedCanonicalField}</dd>
                      </div>
                      <div>
                        <dt>Strength</dt>
                        <dd>{formatStructuredValue(product.strength)}</dd>
                      </div>
                      <div>
                        <dt>Formulation</dt>
                        <dd>{formatStructuredValue(product.formulation)}</dd>
                      </div>
                      <div>
                        <dt>Pack size</dt>
                        <dd>{formatStructuredValue(product.packSize)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </section>
    );
  } catch (error) {
    return (
      <section className="panel">
        <p className="eyebrow">Product Catalog</p>
        <h2 className="title">Duplicate Triage Unavailable</h2>
        <p className="copy">
          {error instanceof Error
            ? error.message
            : 'Failed to load likely duplicate product groups.'}
        </p>
      </section>
    );
  }
}
