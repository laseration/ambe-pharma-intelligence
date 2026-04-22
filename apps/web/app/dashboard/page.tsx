import Link from 'next/link';

export default function DashboardPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Dashboard</p>
      <h2 className="title">Commercial and supply visibility</h2>
      <p className="copy">
        This placeholder dashboard can grow into product, supplier, inventory, customer, and
        opportunity workflows without restructuring the app shell.
      </p>
      <div className="actions">
        <Link className="button button-primary" href="/dashboard/review">
          Open Review Queue
        </Link>
      </div>
    </section>
  );
}
