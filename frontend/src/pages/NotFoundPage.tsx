import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="panel panel-large">
      <p className="eyebrow">404</p>
      <h2>Page not found</h2>
      <p>The requested route does not exist in the Phase 1 shell.</p>
      <Link to="/" className="button-link">
        Return to dashboard
      </Link>
    </section>
  );
}
