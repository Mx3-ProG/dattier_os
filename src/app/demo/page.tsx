import { notFound } from "next/navigation";
import { demoEnabled } from "@/lib/database/db";
import { Demo } from "@/components/demo";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!demoEnabled()) notFound();
  return <Demo />;
}
