import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const patterns = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "provider-secret",
    /\b(?:sk_live_|sk_test_|whsec_|ghp_|github_pat_)[A-Za-z0-9_]{24,}\b/,
  ],
  ["cloud-key", /\bAKIA[A-Z0-9]{16}\b/],
  ["password-url", /postgres(?:ql)?:\/\/[^\s:/]+:([^\s@]+)@/],
] as const;
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const findings: { location: string; kind: string }[] = [];
let scanned = 0;
function check(text: string, location: string) {
  if (text.includes("\0")) return;
  scanned++;
  for (const [kind, pattern] of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    if (
      kind === "password-url" &&
      /\$|example|PASSWORD|password|process\.env|<|>|test|dummy/i.test(m[1])
    )
      continue;
    findings.push({ location, kind });
  }
}
for (const file of tracked) {
  if (path.basename(file).startsWith(".env") && !file.endsWith("example"))
    findings.push({ location: file, kind: "tracked-env" });
  const b = await readFile(file);
  if (b.length < 2e6) check(b.toString("utf8"), file);
}
// Scan historical blobs without displaying matched secret values.
const objects = execFileSync("git", ["rev-list", "--objects", "--all"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
for (const object of objects) {
  const [sha, ...parts] = object.split(" ");
  if (!parts.length) continue;
  const type = execFileSync("git", ["cat-file", "-t", sha], {
    encoding: "utf8",
  }).trim();
  if (type !== "blob") continue;
  const size = Number(
    execFileSync("git", ["cat-file", "-s", sha], { encoding: "utf8" }),
  );
  if (size > 2e6) continue;
  check(
    execFileSync("git", ["cat-file", "blob", sha], {
      encoding: "utf8",
      maxBuffer: 3e6,
    }),
    `history:${sha.slice(0, 10)}:${parts.join(" ")}`,
  );
}
const report = {
  checkedAt: new Date().toISOString(),
  scope:
    "Tracked and untracked non-ignored working files and reachable Git blobs under 2 MB; pattern matching, not a guarantee of rights or absence of secrets.",
  textObjectsScanned: scanned,
  findings,
};
await writeFile(
  "docs/platform/RELEASE_AUDIT.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (findings.length) process.exitCode = 1;
