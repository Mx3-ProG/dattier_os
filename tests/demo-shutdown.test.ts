import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { closeOnShutdown } from "../src/infrastructure/database/demo-shutdown";

test("SIGTERM closes the demo database before the process exits, and it reopens", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "atacuisine-demo-shutdown-"));
  try {
    const child = spawn(process.execPath, ["--import", "tsx", "tests/support/demo-shutdown-child.ts", dir, "graceful"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`child not ready: ${output}`)), 60_000);
      child.stdout.on("data", () => { if (output.includes("READY")) { clearTimeout(timer); resolve(); } });
    });
    child.kill("SIGTERM");
    const code = await new Promise<number | null>((resolve) => child.on("exit", (c) => resolve(c)));
    assert.match(output, /CLOSED/);
    assert.equal(code, 143);
    const reopened = new PGlite(dir);
    const { rows } = await reopened.query<{ n: number }>("SELECT count(*)::int AS n FROM events");
    assert.equal(rows[0].n, 10_000);
    await reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an exit requested during shutdown waits for the close, and registration happens once", async () => {
  const listeners = new Map<string, () => void>();
  const order: string[] = [];
  let exitCode: number | undefined;
  const fake = {
    prependListener(signal: string, listener: () => void) { listeners.set(signal, listener); return fake; },
    exit(code?: number) { order.push("exit"); exitCode = code; },
  };
  let finishClose!: () => void;
  closeOnShutdown(() => new Promise<void>((resolve) => { finishClose = () => { order.push("closed"); resolve(); }; }), fake as never);
  assert.deepEqual([...listeners.keys()].sort(), ["SIGHUP", "SIGINT", "SIGTERM"]);
  listeners.get("SIGTERM")!();
  (fake as { exit(code?: number): void }).exit(143); // Next appelle process.exit aussitôt
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, []);
  finishClose();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, ["closed", "exit"]);
  assert.equal(exitCode, 143);
});
