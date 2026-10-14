"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, Leaf, Menu, X } from "lucide-react";
import { fullNav, isActive, primaryNav } from "./navigation";

export function Brand({ tagline }: { tagline: string }) {
  return (
    <Link className="public-brand" href="/">
      <Leaf aria-hidden />
      <span>
        le dattier<small>{tagline}</small>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrolled(window.scrollY > 24));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <header className="public-header" data-scrolled={scrolled || undefined}>
      <Brand tagline="HEFSI · BERNAY" />
      <nav className="public-nav" aria-label="Navigation principale">
        {primaryNav.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(pathname, l.href) ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="public-header-actions">
        <Link className="btn primary" href="/reservations">
          <span>
            Réserver<span className="hide-sm"> une table</span>
          </span>
          <ArrowUpRight size={16} aria-hidden />
        </Link>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="menu-toggle" aria-label="Ouvrir le menu">
            <Menu size={22} aria-hidden />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="public-menu-overlay" />
            <Dialog.Content className="public-menu-panel">
              <div className="public-menu-head">
                <Dialog.Title className="eyebrow">Menu</Dialog.Title>
                <Dialog.Close
                  className="menu-toggle"
                  aria-label="Fermer le menu"
                >
                  <X size={22} aria-hidden />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">
                Accès à toutes les sections du site.
              </Dialog.Description>
              <nav aria-label="Navigation mobile">
                {fullNav.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={
                      isActive(pathname, l.href) ? "page" : undefined
                    }
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <Link
                className="btn primary"
                href="/reservations"
                onClick={() => setOpen(false)}
              >
                Réserver une table <ArrowUpRight size={16} aria-hidden />
              </Link>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
