import Link from 'next/link';

export default function LoginPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Login</p>
      <h2 className="title">Access the operating dashboard</h2>
      <p className="copy">
        Open the Ambe operating dashboard. Review supplier emails, check opportunities,
        and keep buying decisions clear.
      </p>
      <div className="actions">
        <Link className="button button-primary" href="/dashboard">
          Continue to dashboard
        </Link>
      </div>
    </section>
  );
}
