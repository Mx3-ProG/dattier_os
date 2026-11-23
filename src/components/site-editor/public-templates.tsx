"use client";

import { TemplatesPanel } from "./templates";
import { useRouter } from "next/navigation";

export function PublicTemplates() {
  const router = useRouter();
  return (
    <main style={{ padding: "32px 20px", background: "#f6f4ee", minHeight: "100vh" }}>
      <TemplatesPanel
        demo={false}
        browseOnly
        back={() => router.push("/")}
        apply={() => {}}
      />
    </main>
  );
}
