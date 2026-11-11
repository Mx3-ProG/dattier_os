import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Un serveur SMTP saisi par un établissement ne doit jamais atteindre le réseau interne
 * de la plateforme (métadonnées cloud, base, services locaux). On résout le nom, on
 * refuse toute adresse privée, puis on se connecte à l'adresse vérifiée elle-même
 * (le nom ne sert plus qu'à la vérification TLS) : pas de seconde résolution possible.
 */
function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPublicAddress(ip: string) {
  const version = isIP(ip);
  if (version === 4) return !privateV4(ip);
  if (version !== 6) return false;
  const value = ip.toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !privateV4(mapped[1]);
  return !(
    value === "::" || value === "::1" ||
    value.startsWith("fc") || value.startsWith("fd") ||
    /^fe[89ab]/.test(value) || value.startsWith("ff") ||
    value.startsWith("64:ff9b") || value.startsWith("2001:db8")
  );
}

export async function resolvePublicHost(host: string) {
  if (isIP(host)) throw new Error("Indiquez le nom du serveur SMTP, pas une adresse IP.");
  const addresses = await lookup(host, { all: true }).catch(() => {
    throw new Error("Serveur SMTP introuvable : vérifiez le nom d'hôte.");
  });
  const address = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  if (!address || addresses.some((entry) => !isPublicAddress(entry.address)))
    throw new Error("Ce serveur SMTP pointe vers une adresse non autorisée.");
  return address.address;
}
