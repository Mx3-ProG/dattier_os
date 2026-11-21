import { BlackFridayBanner } from "@/components/auth/black-friday-banner";
import Link from "next/link";
import { Store } from "lucide-react";
import { TotpAuth } from "@/components/auth/totp-auth";
import "../../landing.css";
import "@/components/platform/access.css";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="access-shell">
      <BlackFridayBanner />
      <nav className="access-nav" aria-label="Navigation principale">
        <Link href="/" className="access-brand"><Store size={22} /> STUDIO S</Link>
      </nav>
      <div className="access-split">
        <aside className="access-hero">
          <span className="access-label">Le bureau dans la poche</span>
          <p className="access-display">De la scène<br />aux coulisses.</p>
        </aside>
        <section className="access-panel">
          <TotpAuth />
        </section>
      </div>
    </main>
  );
}
