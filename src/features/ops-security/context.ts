import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

/** Per-request facts attached to every security event, without changing service signatures. */
export type RequestContext = {
  correlationId: string;
  route: string;
  /** Short, non-reversible reference to the session hash (never the token). */
  sessionRef?: string;
  actorId?: string;
  /** Salted hash of the client address: lets rules group attempts without storing the IP. */
  clientRef?: string;
};
const runtime = globalThis as typeof globalThis & {
  atacuisineRequestContext?: AsyncLocalStorage<RequestContext>;
};
const storage = (runtime.atacuisineRequestContext ??=
  new AsyncLocalStorage<RequestContext>());
const salt =
  process.env.SECURITY_LOG_SALT || process.env.SESSION_SECRET || randomUUID();
export const shortHash = (value: string, length = 16) =>
  createHash("sha256").update(value).digest("hex").slice(0, length);

export function withRequestContext<Q extends Request, A extends unknown[], R>(
  route: string,
  handler: (req: Q, ...rest: A) => Promise<R>,
) {
  return (req: Q, ...rest: A) => {
    const address =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    return storage.run(
      {
        correlationId: randomUUID(),
        route,
        clientRef: shortHash(`${salt}:${address}`, 12),
      },
      () => handler(req, ...rest),
    );
  };
}
export const requestContext = () => storage.getStore();
/** Runs code (tests, scheduled jobs) under an explicit context. */
export const runWithContext = <R>(ctx: RequestContext, fn: () => R) =>
  storage.run(ctx, fn);
export function bindActor(actorId: string, sessionHash: string) {
  const ctx = storage.getStore();
  if (!ctx) return;
  ctx.actorId = actorId;
  ctx.sessionRef = sessionHash.slice(0, 16);
}
