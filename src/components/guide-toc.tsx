"use client";
import { useEffect, useState } from "react";
/** Sommaire du guide : suit la section lue pendant le défilement. */
export function GuideToc({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-90px 0px -60% 0px" },
    );
    for (const i of items) {
      const el = document.getElementById(i.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);
  return (
    <nav className="guide-toc" aria-label="Sommaire du guide">
      <span>Sommaire</span>
      <ol>
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
