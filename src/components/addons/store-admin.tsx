"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { loadingRendererIds, loadingScreenKind } from "@/features/addons/loading-screens";
import { formatPrice } from "@/features/addons/store-catalog";
import { analyticsKind, analyticsRenderers } from "@/features/analytics/modules";
import "./addon-store.css";

type Category = { id: string; name: string; description: string; position: number; visible: boolean };
type Product = {
  id: string;
  category_id: string;
  kind?: string;
  renderer: string;
  name: string;
  description: string;
  pricing_mode: "free" | "one_time";
  price_cents: number;
  sellable: boolean;
  listed: boolean;
  version: string;
  position: number;
};
type Stat = {
  product_id: string;
  installations: number;
  active_uses: number;
  sales: number;
  refunds: number;
  revenue_cents: number;
};
type Purchase = {
  id: string;
  restaurant_name: string;
  product_name: string;
  status: string;
  amount_cents: number;
  refunded_cents: number;
  created_at: string;
};
type AdminState = { categories: Category[]; products: Product[]; stats: Stat[]; purchases: Purchase[] };
const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
const purchaseLabels: Record<string, string> = {
  pending: "En attente",
  paid: "Payé",
  expired: "Expiré",
  failed: "Échoué",
  refunded: "Remboursé",
  disputed: "Litige en cours",
  dispute_lost: "Litige perdu",
  duplicate: "Doublon remboursé",
};
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const blankProduct: Product = {
  id: "",
  category_id: "",
  renderer: loadingRendererIds[0],
  name: "",
  description: "",
  pricing_mode: "one_time",
  price_cents: 500,
  sellable: true,
  listed: true,
  version: "1.0.0",
  position: 100,
};

function ProductForm({
  product,
  categories,
  isNew,
  busy,
  onSave,
}: {
  product: Product;
  categories: Category[];
  isNew: boolean;
  busy: boolean;
  onSave: (value: unknown) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pricingMode = text(form, "pricingMode");
    onSave({
      id: isNew ? text(form, "id") : product.id,
      categoryId: text(form, "categoryId"),
      kind: product.kind ?? loadingScreenKind,
      renderer: text(form, "renderer"),
      name: text(form, "name"),
      description: text(form, "description"),
      pricingMode,
      priceCents: pricingMode === "free" ? 0 : Math.round(Number(text(form, "price").replace(",", ".")) * 100),
      sellable: form.get("sellable") === "on",
      listed: form.get("listed") === "on",
      version: text(form, "version"),
      position: Number(text(form, "position")) || 0,
    });
  }
  return (
    <form className="addon-admin-form" onSubmit={submit}>
      {isNew && (
        <label>
          Identifiant
          <input name="id" required pattern="[a-z0-9][a-z0-9\-]*" />
        </label>
      )}
      <label>
        Nom
        <input name="name" required maxLength={80} defaultValue={product.name} />
      </label>
      <label>
        Description
        <input name="description" maxLength={500} defaultValue={product.description} />
      </label>
      <label>
        Catégorie
        <select name="categoryId" defaultValue={product.category_id || categories[0]?.id}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {product.kind === analyticsKind ? "Moteur" : "Animation"}
        <select name="renderer" defaultValue={product.renderer}>
          {(product.kind === analyticsKind ? analyticsRenderers : loadingRendererIds).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tarification
        <select name="pricingMode" defaultValue={product.pricing_mode}>
          <option value="free">Gratuit</option>
          <option value="one_time">Paiement unique</option>
        </select>
      </label>
      <label>
        Prix TTC (€)
        <input name="price" inputMode="decimal" defaultValue={String(product.price_cents / 100)} />
      </label>
      <label>
        Version
        <input name="version" required maxLength={20} defaultValue={product.version} />
      </label>
      <label>
        Position
        <input name="position" type="number" min={0} defaultValue={product.position} />
      </label>
      <label className="addon-check">
        <input name="sellable" type="checkbox" defaultChecked={product.sellable} />
        En vente
      </label>
      <label className="addon-check">
        <input name="listed" type="checkbox" defaultChecked={product.listed} />
        Au catalogue
      </label>
      <Button disabled={busy}>{isNew ? "Ajouter l’add-on" : "Enregistrer"}</Button>
    </form>
  );
}

function CategoryForm({
  category,
  busy,
  onSave,
  onDelete,
}: {
  category?: Category;
  busy: boolean;
  onSave: (value: unknown) => void;
  onDelete?: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      id: category?.id ?? text(form, "id"),
      name: text(form, "name"),
      description: text(form, "description"),
      position: Number(text(form, "position")) || 0,
      visible: form.get("visible") === "on",
    });
    if (!category) event.currentTarget.reset();
  }
  return (
    <form className="addon-admin-form" onSubmit={submit}>
      {!category && (
        <label>
          Identifiant
          <input name="id" required pattern="[a-z0-9][a-z0-9\-]*" />
        </label>
      )}
      <label>
        Nom
        <input name="name" required maxLength={80} defaultValue={category?.name} />
      </label>
      <label>
        Description
        <input name="description" maxLength={500} defaultValue={category?.description} />
      </label>
      <label>
        Position
        <input name="position" type="number" min={0} defaultValue={category?.position ?? 100} />
      </label>
      <label className="addon-check">
        <input name="visible" type="checkbox" defaultChecked={category?.visible ?? true} />
        Visible
      </label>
      <Button disabled={busy}>{category ? "Enregistrer" : "Créer la catégorie"}</Button>
      {onDelete && (
        <Button type="button" variant="secondary" disabled={busy} onClick={onDelete}>
          Supprimer
        </Button>
      )}
    </form>
  );
}

export function AddonStoreAdmin() {
  const [state, setState] = useState<AdminState | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/platform/addons")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "Administration indisponible.");
        setState(body);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function perform(body: unknown, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/platform/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Enregistrement impossible.");
      setState(result);
      setRevision((value) => value + 1);
      setNotice(success);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <main className="addon-admin">
        <h1>Boutique d’add-ons</h1>
        {error ? <p role="alert">{error}</p> : <p role="status">Chargement…</p>}
        <Link href="/platform">Retour à mon espace</Link>
      </main>
    );
  const nameOf = (id: string) => state.products.find((product) => product.id === id)?.name ?? id;
  const popular = [...state.stats].sort((a, b) => b.active_uses + b.installations - (a.active_uses + a.installations));
  const totalRevenue = state.stats.reduce((sum, stat) => sum + stat.revenue_cents, 0);
  return (
    <main className="addon-admin">
      <header>
        <Link href="/platform">Retour à mon espace</Link>
        <h1>Boutique d’add-ons</h1>
        <p>Catalogue commun à tous les établissements. Les prix s’appliquent aux prochains achats.</p>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section className="card" aria-label="Revenus et popularité">
        <h2>Revenus et popularité</h2>
        <p>
          Revenus produits cumulés après remboursements : <strong>{euros(totalRevenue)}</strong>
        </p>
        <div className="addon-admin-table">
          <table>
            <thead>
              <tr>
                <th>Add-on</th>
                <th>Installations</th>
                <th>Écrans actifs</th>
                <th>Ventes</th>
                <th>Remb. et litiges</th>
                <th>Revenus nets</th>
              </tr>
            </thead>
            <tbody>
              {popular.map((stat) => (
                <tr key={stat.product_id}>
                  <td>{nameOf(stat.product_id)}</td>
                  <td>{stat.installations}</td>
                  <td>{stat.active_uses}</td>
                  <td>{stat.sales}</td>
                  <td>{stat.refunds}</td>
                  <td>{euros(stat.revenue_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card" aria-label="Catégories">
        <h2>Catégories</h2>
        {state.categories.map((category) => (
          <div className="addon-admin-item" key={`${category.id}-${revision}`}>
            <strong>{category.id}</strong>
            <CategoryForm
              category={category}
              busy={busy}
              onSave={(value) => perform({ action: "saveCategory", category: value }, "Catégorie enregistrée.")}
              onDelete={() => perform({ action: "deleteCategory", id: category.id }, "Catégorie supprimée.")}
            />
          </div>
        ))}
        <div className="addon-admin-item">
          <strong>Nouvelle catégorie</strong>
          <CategoryForm
            busy={busy}
            onSave={(value) => perform({ action: "saveCategory", category: value }, "Catégorie créée.")}
          />
        </div>
      </section>
      <section className="card" aria-label="Add-ons">
        <h2>Add-ons</h2>
        {state.products.map((product) => (
          <details className="addon-admin-item" key={`${product.id}-${revision}`}>
            <summary>
              {product.name} · {formatPrice(product)} · v{product.version}
              {!product.listed && " · retiré du catalogue"}
              {product.listed && !product.sellable && " · hors vente"}
            </summary>
            <ProductForm
              product={product}
              categories={state.categories}
              isNew={false}
              busy={busy}
              onSave={(value) => perform({ action: "saveProduct", product: value }, "Add-on enregistré.")}
            />
          </details>
        ))}
        <details className="addon-admin-item" key={`new-${revision}`}>
          <summary>Ajouter un add-on</summary>
          <ProductForm
            product={blankProduct}
            categories={state.categories}
            isNew
            busy={busy}
            onSave={(value) => perform({ action: "saveProduct", product: value }, "Add-on ajouté.")}
          />
        </details>
      </section>
      <section className="card" aria-label="Derniers achats">
        <h2>Derniers achats</h2>
        {state.purchases.length === 0 ? (
          <p>Aucun achat pour le moment.</p>
        ) : (
          <div className="addon-admin-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Établissement</th>
                  <th>Add-on</th>
                  <th>Prix affiché lors de l’achat</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {state.purchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td>{new Date(purchase.created_at).toLocaleDateString("fr-FR")}</td>
                    <td>{purchase.restaurant_name}</td>
                    <td>{purchase.product_name}</td>
                    <td>{euros(purchase.amount_cents)}</td>
                    <td>{purchaseLabels[purchase.status] ?? purchase.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
