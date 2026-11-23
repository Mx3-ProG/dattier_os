import { resolveMx, resolve4, resolve6 } from "node:dns/promises";

/**
 * Refuses temporary / fake e-mail addresses at sign-up, without touching real
 * professional domains. Layers, cheapest first:
 *  1. syntax and reserved domains (example.com, .test, .invalid…);
 *  2. built-in list of disposable providers, plus their sub-domains;
 *  3. obvious disposable names in the domain (tempmail, 10minutemail…);
 *  4. the community blocklist (disposable-email-domains, ~5 000 domains),
 *     fetched and cached for 24 h — skipped silently if unreachable;
 *  5. DNS: the domain must accept mail (MX or address record), and its mail
 *     servers must not belong to a disposable provider. This catches the many
 *     fresh alias domains that temp-mail services point at their own servers.
 *
 * A professional domain only fails if it has no mail server at all. Wrongly
 * flagged domains can be allowed with DISPOSABLE_EMAIL_ALLOWLIST (comma list).
 */

const BUILT_IN = `
0-mail.com 0815.ru 10minutemail.com 10minutemail.net 10minutemail.co.uk 10minmail.com
10mail.org 20minutemail.com 20minutemail.it 33mail.com 30minutemail.com 60minutemail.com
anonbox.net anonymbox.com antispam.de armyspy.com binkmail.com bobmail.info bccto.me
burnermail.io byom.de chacuo.net cool.fr.nf courriel.fr.nf cuvox.de dayrep.com deadaddress.com
despam.it devnullmail.com discard.email discardmail.com discardmail.de disposableemailaddresses.com
disposablemail.com dispostable.com dodgit.com dropmail.me e4ward.com einrot.com email-fake.com
emailfake.com emailondeck.com emailtemporanea.net emailtemporar.ro emltmp.com emailsensei.com
fakeinbox.com fakemail.net fakemailgenerator.com fastacura.com filzmail.com fleckens.hu
getairmail.com getnada.com gishpuppy.com grr.la guerrillamail.biz guerrillamail.com
guerrillamail.de guerrillamail.info guerrillamail.net guerrillamail.org guerrillamailblock.com
gustr.com harakirimail.com hide.biz.st hidemail.de incognitomail.com inboxbear.com
inboxkitten.com jetable.com jetable.fr.nf jetable.net jetable.org jourrapide.com kasmail.com
kurzepost.de lroid.com luxusmail.org mail-temp.com mail.tm mail7.io mailcatch.com maildrop.cc
mailexpire.com mailforspam.com mailinator.com mailinator.net mailinator2.com mailmetrash.com
mailmoat.com mailnesia.com mailnull.com mailpoof.com mailsac.com mailslurp.com mailtemp.info
mailtothis.com meltmail.com mintemail.com moakt.com moakt.cc mohmal.com monemail.fr.nf
monmail.fr.nf mt2015.com mvrht.net mytemp.email mytrashmail.com nada.email no-spam.ws
nobulk.com noclickemail.com nomail.xl.cx nospam.ze.tc nospamfor.us nowmymail.com
objectmail.com obobbo.com oneoffemail.com owlpic.com pokemail.net proxymail.eu
put2.net qq.com.de rcpt.at reallymymail.com receivemail.org rhyta.com rmqkr.net
safetymail.info sharklasers.com shitmail.me shortmail.net sneakemail.com sofort-mail.de
spam4.me spamavert.com spambog.com spambox.us spamex.com spamfree24.org spamgourmet.com
spamhole.com spamify.com spaml.de spammotel.com spamspot.com speed.1s.fr superrito.com
suremail.info teleworm.us temp-mail.io temp-mail.org temp-mail.ru tempail.com tempemail.net
tempinbox.com tempm.com tempmail.com tempmail.de tempmail.dev tempmail.email tempmail.net
tempmail.plus tempmailaddress.com tempmailo.com tempomail.fr tempr.email temporarymail.com
thankyou2010.com thisisnotmyrealemail.com throwam.com throwawaymail.com tmail.ws tmailinator.com
tmpmail.net tmpmail.org trash-mail.com trash-mail.de trashmail.at trashmail.com trashmail.de
trashmail.me trashmail.net trashmail.ws trashmailer.com trbvm.com twinmail.de tyldd.com
uggsrock.com wegwerfadresse.de wegwerfemail.de wegwerfmail.de wegwerfmail.net wegwerfmail.org
wh4f.org yepmail.net yopmail.com yopmail.fr yopmail.net yomail.info zetmail.com zoemail.org
1secmail.com 1secmail.net 1secmail.org emailnax.com fexpost.com fextemp.com txcct.com
vjuum.com laafd.com tmpbox.net inboxes.com minuteinbox.com spamdecoy.net mailbox.in.ua
crazymailing.com mail-tester.com tempmailin.com disbox.net disbox.org snapmail.cc
`.trim().split(/\s+/);

/** Distinctive fragments only — never generic words that a real company might use. */
const KEYWORDS = [
  "tempmail", "temp-mail", "tmpmail", "throwaway", "trashmail", "trash-mail",
  "fakemail", "fake-mail", "fakeinbox", "disposable", "10minute", "20minute",
  "minutemail", "guerrillamail", "mailinator", "yopmail", "spamgourmet",
  "burnermail", "wegwerf", "jetable", "getnada", "maildrop", "sharklasers",
];

const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local", "lan", "internal", "home", "corp"]);
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org", "email.com.test", "domain.com", "test.com"]);

const REMOTE_LIST =
  "https://cdn.jsdelivr.net/gh/disposable-email-domains/disposable-email-domains@main/disposable_email_blocklist.conf";
const REMOTE_TTL = 24 * 60 * 60 * 1000;

const builtIn = new Set(BUILT_IN);
let remote: { domains: Set<string>; at: number } | null = null;
let remoteLoading: Promise<void> | null = null;

const allowlist = () =>
  new Set(
    (process.env.DISPOSABLE_EMAIL_ALLOWLIST || "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  );

async function remoteDomains(): Promise<Set<string> | null> {
  if (process.env.DISPOSABLE_EMAIL_REMOTE_LIST === "false") return null;
  if (remote && Date.now() - remote.at < REMOTE_TTL) return remote.domains;
  remoteLoading ??= (async () => {
    try {
      const response = await fetch(REMOTE_LIST, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return;
      const text = await response.text();
      const domains = new Set(
        text.split("\n").map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")),
      );
      if (domains.size > 1000) remote = { domains, at: Date.now() };
    } catch {
      // Unreachable list: the other layers still apply.
    } finally {
      remoteLoading = null;
    }
  })();
  await remoteLoading;
  return remote?.domains ?? null;
}

/** The domain and each parent domain: a.b.example.com → [a.b.example.com, b.example.com, example.com]. */
function withParents(domain: string) {
  const parts = domain.split(".");
  return parts.slice(0, -1).map((_, i) => parts.slice(i).join("."));
}

function listed(domain: string, lists: Array<Set<string> | null>) {
  return withParents(domain).some((d) => lists.some((list) => list?.has(d)));
}

const hasKeyword = (domain: string) => KEYWORDS.some((k) => domain.includes(k));

export type EmailVerdict = { ok: true; email: string } | { ok: false; reason: string };

const DISPOSABLE = "Les adresses e-mail temporaires ou jetables ne sont pas acceptées. Utilisez votre adresse personnelle ou professionnelle.";

/** Syntax, reserved domains, built-in list and keywords. Synchronous, no network. */
export function quickEmailCheck(raw: string): EmailVerdict {
  const email = raw.trim().toLowerCase();
  const match = /^([a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64})@([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63})+)$/.exec(email);
  if (!match || email.length > 150 || match[1].startsWith(".") || match[1].endsWith(".") || match[1].includes(".."))
    return { ok: false, reason: "Adresse e-mail invalide." };
  const domain = match[2];
  if (domain.split(".").some((label) => label.startsWith("-") || label.endsWith("-")))
    return { ok: false, reason: "Adresse e-mail invalide." };
  if (allowlist().has(domain)) return { ok: true, email };
  const tld = domain.split(".").pop()!;
  if (RESERVED_TLDS.has(tld) || /^\d+$/.test(tld) || RESERVED_DOMAINS.has(domain))
    return { ok: false, reason: "Ce domaine e-mail n’existe pas. Vérifiez votre adresse." };
  if (listed(domain, [builtIn]) || hasKeyword(domain)) return { ok: false, reason: DISPOSABLE };
  return { ok: true, email };
}

/**
 * Check at session opening: catches accounts created by calling Supabase Auth
 * directly (bypassing /auth/signup). No DNS, so a DNS hiccup never blocks a login.
 */
export async function loginEmailCheck(raw: string): Promise<EmailVerdict> {
  const quick = quickEmailCheck(raw);
  if (!quick.ok) return quick;
  const domain = quick.email.split("@")[1];
  if (allowlist().has(domain)) return quick;
  return listed(domain, [await remoteDomains()]) ? { ok: false, reason: DISPOSABLE } : quick;
}

type Resolver = {
  mx: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
  a: (domain: string) => Promise<string[]>;
};
const systemResolver: Resolver = {
  mx: resolveMx,
  a: async (domain) => [...(await resolve4(domain).catch(() => [])), ...(await resolve6(domain).catch(() => []))],
};

const NO_MAIL = "Ce domaine ne reçoit pas d’e-mails. Vérifiez votre adresse.";

/** Full check used before creating an account. */
export async function checkSignupEmail(raw: string, resolver: Resolver = systemResolver): Promise<EmailVerdict> {
  const quick = quickEmailCheck(raw);
  if (!quick.ok) return quick;
  const domain = quick.email.split("@")[1];
  if (allowlist().has(domain)) return quick;
  const community = await remoteDomains();
  if (listed(domain, [community])) return { ok: false, reason: DISPOSABLE };

  let mx: Array<{ exchange: string }>;
  try {
    mx = await resolver.mx(domain);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") mx = [];
    else return quick; // DNS outage: never block a real person on our side's failure.
  }
  // Null MX (RFC 7505): the domain explicitly refuses e-mail.
  if (mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".")) return { ok: false, reason: NO_MAIL };
  if (!mx.length) {
    const addresses = await resolver.a(domain).catch(() => []);
    return addresses.length ? quick : { ok: false, reason: NO_MAIL };
  }
  const hosts = mx.map((record) => record.exchange.toLowerCase().replace(/\.$/, ""));
  if (hosts.some((host) => listed(host, [builtIn, community]) || hasKeyword(host)))
    return { ok: false, reason: DISPOSABLE };
  return quick;
}
