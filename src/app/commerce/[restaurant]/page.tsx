import { redirect } from "next/navigation";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ restaurant: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { restaurant } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.set(key, value);
  }
  const target = `/restaurant/${encodeURIComponent(restaurant)}${qs.toString() ? `?${qs.toString()}` : ""}`;
  redirect(target);
}