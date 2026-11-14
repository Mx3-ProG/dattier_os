import { createHash } from "node:crypto";

/**
 * Refuses passwords known to attackers, checked on the server only:
 *  - Have I Been Pwned "Pwned Passwords" (900M+ passwords from real data
 *    breaches) through k-anonymity: only the first 5 hex characters of the
 *    SHA-1 leave the server, never the password nor its full hash;
 *  - SecLists common-credential lists (the wordlists used by brute-force
 *    tools), downloaded and cached in memory for 24 h.
 *
 * The password is never logged, stored or sent anywhere else.
 */

const HIBP_RANGE = "https://api.pwnedpasswords.com/range/";
const SECLISTS = [
  "https://cdn.jsdelivr.net/gh/danielmiessler/SecLists@master/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt",
  "https://cdn.jsdelivr.net/gh/danielmiessler/SecLists@master/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt",
];
const TTL = 24 * 60 * 60 * 1000;

let wordlist: { words: Set<string>; at: number } | null = null;
let wordlistLoading: Promise<void> | null = null;

async function seclists(): Promise<Set<string> | null> {
  if (process.env.SECLISTS_PASSWORD_CHECK === "false") return null;
  if (wordlist && Date.now() - wordlist.at < TTL) return wordlist.words;
  wordlistLoading ??= (async () => {
    try {
      const words = new Set<string>();
      const texts = await Promise.all(
        SECLISTS.map((url) =>
          fetch(url, { signal: AbortSignal.timeout(5000) })
            .then((r) => (r.ok ? r.text() : ""))
            .catch(() => ""),
        ),
      );
      for (const text of texts)
        for (const line of text.split("\n")) {
          const word = line.trim().toLowerCase();
          if (word) words.add(word);
        }
      if (words.size > 10_000) wordlist = { words, at: Date.now() };
    } finally {
      wordlistLoading = null;
    }
  })();
  await wordlistLoading;
  return wordlist?.words ?? null;
}

/** Number of times the password appears in known breaches (0 = never seen). Null if HIBP is unreachable. */
export async function pwnedCount(password: string, fetcher: typeof fetch = fetch): Promise<number | null> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetcher(HIBP_RANGE + prefix, {
      // Padding hides from network observers how many suffixes were returned.
      headers: { "Add-Padding": "true", "User-Agent": "studio-os-password-check" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    for (const line of (await response.text()).split("\n")) {
      const [hash, count] = line.trim().split(":");
      if (hash === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

export const BREACHED =
  "Ce mot de passe figure dans des fuites de données ou dans les listes utilisées par les pirates. Choisissez-en un autre, idéalement généré par le trousseau de votre appareil.";

/** French error when the password is known to attackers, null otherwise. */
export async function breachedPasswordProblem(password: string): Promise<string | null> {
  const [count, words] = await Promise.all([pwnedCount(password), seclists()]);
  const lower = password.toLowerCase();
  if (words?.has(lower)) return BREACHED;
  if (count && count > 0) return BREACHED;
  if (count === null && !words) {
    // Neither source reachable: our local rules still apply, so do not lock people out.
    console.warn("[auth] Vérification des mots de passe compromis indisponible");
  }
  return null;
}
