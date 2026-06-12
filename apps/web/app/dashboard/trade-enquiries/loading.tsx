export default function TradeEnquiriesLoading() {
  return (
    <section className="dashboard-layout">
      <section className="panel dashboard-panel">
        <div className="dashboard-section-header">
          <div>
            <p className="eyebrow">Trade enquiries</p>
            <h2 className="title">Buyer RFQs</h2>
            <p className="copy">Loading protected trade enquiry queue...</p>
          </div>
        </div>
        <div className="dashboard-empty-state">
          <p className="dashboard-feature-title">Loading enquiries</p>
          <p className="dashboard-feature-copy">
            The dashboard is checking the internal API for recent public Trade
            Access submissions.
          </p>
        </div>
      </section>
    </section>
  );
}
