export default function TradeEnquiryDetailLoading() {
  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Trade enquiry</p>
            <h2 className="title">Loading RFQ detail</h2>
            <p className="copy">
              The dashboard is reading the protected trade enquiry record.
            </p>
          </div>
        </div>
        <div className="dashboard-empty-state">
          <p className="dashboard-feature-title">Loading detail</p>
          <p className="dashboard-feature-copy">
            Status, buyer context, requirement notes, and internal review fields
            will appear here.
          </p>
        </div>
      </section>
    </section>
  );
}
