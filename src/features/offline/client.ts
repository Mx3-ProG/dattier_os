export type LocalEvent = {
  id: string;
  kind: "order" | "preparing" | "ready" | "served" | "cancelled";
  order: string;
  items?: { quota: string; quantity: number }[];
  table?: string;
  at: string;
  state: "pending" | "applied" | "conflict" | "resolved";
  error?: string;
};
export type Quota = {
  id: string;
  menu_id: string;
  quantity: number;
  used: number;
  catalog: { name: string; price: number; station: string; expiresOn: string };
};
export type LocalState = {
  key: string;
  device: string;
  restaurant: string;
  name: string;
  quotas: Quota[];
  events: LocalEvent[];
  closed?: boolean;
};
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("atacuisine-offline-v1", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("workstations", { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function localState(key: string): Promise<LocalState | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("workstations", "readonly"),
        req = tx.objectStore("workstations").get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
export async function updateLocal(
  key: string,
  fn: (current: LocalState | undefined) => LocalState,
): Promise<LocalState> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      let result: LocalState;
      const tx = db.transaction("workstations", "readwrite");
      const store = tx.objectStore("workstations"),
        req = store.get(key);
      req.onsuccess = () => {
        try {
          result = fn(req.result);
          store.put(result);
        } catch (e) {
          tx.abort();
          reject(e);
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error("Enregistrement local interrompu."));
    });
  } finally {
    db.close();
  }
}
export function available(state: LocalState, quota: Quota) {
  return (
    quota.quantity -
    quota.used -
    state.events
      .filter(
        (e) => ["pending", "conflict"].includes(e.state) && e.kind === "order",
      )
      .flatMap((e) => e.items || [])
      .filter((i) => i.quota === quota.id)
      .reduce((sum, i) => sum + i.quantity, 0)
  );
}
export async function queueOrder(
  key: string,
  items: { quota: string; quantity: number }[],
  table: string,
) {
  return updateLocal(key, (state) => {
    if (!state) throw new Error("Poste non configuré.");
    if (!items.length) throw new Error("Panier vide.");
    const seen = new Set<string>();
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
    }).format(new Date());
    for (const i of items) {
      if (seen.has(i.quota)) throw new Error("Quota en double.");
      seen.add(i.quota);
      const q = state.quotas.find((q) => q.id === i.quota);
      if (
        !q ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 50 ||
        i.quantity > available(state, q)
      )
        throw new Error("Quota local insuffisant.");
      if (q.catalog.expiresOn < day)
        throw new Error("Quota alimentaire expiré.");
    }
    return {
      ...state,
      events: [
        ...state.events,
        {
          id: crypto.randomUUID(),
          kind: "order",
          order: crypto.randomUUID(),
          items,
          table,
          at: new Date().toISOString(),
          state: "pending",
        },
      ],
    };
  });
}
