import Link from 'next/link';

export default function LoginPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Login</p>
      <h2 className="title">Access the operating dashboard</h2>
      <p className="copy">
        This placeholder page is ready for authentication wiring. Start here for sign-in,
        role checks, and session handling.
      </p>
      <div className="actions">
        <Link className="button button-primary" href="/dashboard">
          Continue to dashboard
        </Link>
      </div>
    </section>
  );
}
