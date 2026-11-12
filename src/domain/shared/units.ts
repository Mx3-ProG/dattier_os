export function convert(value: number, from: string, to: string) {
  const units: Record<string, [string, number]> = {
    g: ["mass", 1],
    kg: ["mass", 1000],
    ml: ["volume", 1],
    l: ["volume", 1000],
    unit: ["unit", 1],
  };
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !units[from] ||
    !units[to] ||
    units[from][0] !== units[to][0]
  )
    throw new Error("Unités incompatibles");
  return (value * units[from][1]) / units[to][1];
}
export function portions(lines: { available: number; quantity: number }[]) {
  return lines.length
    ? Math.max(
        0,
        Math.min(...lines.map((l) => Math.floor(l.available / l.quantity))),
      )
    : 0;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const dateTime = (s: string) =>
  new Date(s).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
