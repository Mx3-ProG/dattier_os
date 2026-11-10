import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function worker(offline = false) {
  const listeners = new Map<string, (event: unknown) => void>();
  const stored = new Map<string, Response>([
    ["https://example.test/_next/static/style.css", new Response("old styles")],
  ]);
  const deleted: string[] = [];
  const requests: { url: string; options?: RequestInit }[] = [];
  const cache = {
    addAll: async () => {},
    match: async (request: Request) => stored.get(request.url)?.clone(),
    put: async (request: Request | string, response: Response) => {
      stored.set(typeof request === "string" ? request : request.url, response);
    },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    location: { origin: "https://example.test" },
    self: {
      addEventListener: (name: string, fn: (event: unknown) => void) =>
        listeners.set(name, fn),
      clients: { claim: async () => {} },
      skipWaiting: () => {},
    },
    caches: {
      open: async () => cache,
      keys: async () => ["atacuisine-shell-v2", "another-app-cache"],
      delete: async (key: string) => {
        deleted.push(key);
      },
    },
    fetch: async (url: string, options?: RequestInit) => {
      requests.push({ url, options });
      if (offline) throw new Error("offline");
      return new Response("new styles");
    },
  });
  return { listeners, stored, deleted, requests };
}

test("updated styles replace a previously cached asset while online", async () => {
  const { listeners, stored } = worker();
  let result!: Promise<Response>;
  const request = new Request("https://example.test/_next/static/style.css");
  listeners.get("fetch")!({
    request,
    respondWith: (value: Promise<Response>) => {
      result = value;
    },
  });
  assert.equal(await (await result).text(), "new styles");
  assert.equal(await stored.get(request.url)!.text(), "new styles");
});

test("cached assets remain available offline", async () => {
  const { listeners } = worker(true);
  let result!: Promise<Response>;
  listeners.get("fetch")!({
    request: new Request("https://example.test/_next/static/style.css"),
    respondWith: (value: Promise<Response>) => {
      result = value;
    },
  });
  assert.equal(await (await result).text(), "old styles");
});

test("activation preserves caches owned by other applications", async () => {
  const { listeners, deleted } = worker();
  let completion!: Promise<unknown>;
  listeners.get("activate")!({
    waitUntil: (value: Promise<unknown>) => {
      completion = value;
    },
  });
  await completion;
  assert.deepEqual(deleted, ["atacuisine-shell-v2"]);
});

test("la page de secours hors ligne est chargée sans identité ni thème de compte", async () => {
  const { listeners, requests, stored } = worker();
  let completion!: Promise<unknown>;
  listeners.get("install")!({
    waitUntil: (value: Promise<unknown>) => {
      completion = value;
    },
  });
  await completion;
  assert.equal(requests[0].url, "/offline");
  assert.equal(requests[0].options?.credentials, "omit");
  assert.ok(stored.has("/offline"));
});
