"use client";
import { PublicAppearance, PublicModeSwitch } from "./public-appearance";
import { TemplateExtras } from "./template-extras";
import "./templates.css";
import { ProductRecommendations } from "../product-recommendations";
import { ProductDetails } from "../product-details";
import { productPath } from "@/lib/product-pages";
import { useTenantSite } from "./context";
/* eslint-disable @next/next/no-img-element */
import { TenantLink as Link } from "./context";
import dynamic from "next/dynamic";
const PublicReservation = dynamic(() =>
  import("./public-reservation").then((m) => m.PublicReservation),
);
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ShoppingBag,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Minus,
  X,
  Clock,
  MapPin,
  Sparkles,
  Check,
  Menu,
  CreditCard,
  WalletCards,
  Star,
  ExternalLink,
  UserRound,
  Zap,
} from "lucide-react";
import type {
  Product,
  Settings,
  ShopOrder,
  PublicReview,
} from "@/features/commerce/schema";
import { preparation } from "@/features/commerce/schema";
import { Modal } from "../forms";
import { prepLabels } from "@/features/commerce/client";
import { money } from "@/lib/domain";
import { CookieConsent } from "./cookie-consent";
import { CustomerAccount } from "./customer-account";
import { OrderQrCard } from "./account/qr-sheet";
import { CustomerAuth } from "./customer-auth";
import type { CustomerIdentity } from "./customer-auth";
import { LegalPage } from "./legal-pages";
import {
  siteConfigSchema,
  type Section,
  type SiteConfig,
} from "@/features/cms/schema";
import { rich, type PlaceholderContext } from "@/features/cms/text";
import { themeCss } from "@/features/cms/theme";
import {
  Categories,
  Cta,
  Faq,
  Gallery,
  Hours,
  PromoBanner,
  SiteLink,
  TextBlock,
  TextImage,
  Video,
} from "../site/sections";
type Line = { menu: string; quantity: number; choices: string[]; note: string };
type PurchaseMode = "solo" | "menu";
type Data = {
  settings: Settings;
  products: Product[];
  slots: string[];
  stripe: boolean;
  reviews: PublicReview[];
};
const slotLabel = (s: string) =>
  new Date(s).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const badgeIcons = {
  bag: ShoppingBag,
  clock: Clock,
  card: CreditCard,
  wallet: WalletCards,
  star: Star,
  pin: MapPin,
  sparkles: Sparkles,
} as const;
/** Messages exchanged with the CMS editor (same origin only). */
export type PreviewMessage =
  | { type: "cms:config"; config: SiteConfig; page?: string }
  | { type: "cms:select"; id: string | null }
  | { type: "cms:drop"; files: File[]; id: string | null }
  | { type: "cms:ready" }
  | { type: "cms:pick"; id: string };
function linePrice(p: Product | undefined, l: Line) {
  return (
    (p?.price || 0) +
    (p?.options
      .flatMap((o) => o.choices.map((c) => ({ ...c, key: `${o.id}:${c.id}` })))
      .filter((c) => l.choices.includes(c.key))
      .reduce((n, c) => n + c.price, 0) || 0)
  );
}
export function DonutStore({
  route: initialRoute,
  config: initialConfig,
  context,
  preview = false,
  initialData = null,
  updatedAt = null,
  initialCategory = "Tout",
  detailProduct,
}: {
  route: string;
  config: SiteConfig;
  context: PlaceholderContext;
  /** CMS preview inside the editor iframe: live config, click-to-select, no navigation. */
  preview?: boolean;
  /** Catalogue loaded on the server so products are present in the initial HTML. */
  initialData?: Data | null;
  /** Publication date of the live version, shown so visitors and machines know how fresh the site is. */
  updatedAt?: string | null;
  initialCategory?: string;
  detailProduct?: Product;
}) {
  const nextRouter = useRouter();
  const {
    request: fetch,
    shopPost,
    href,
    restaurant,
    demo,
    shopEnabled,
  } = useTenantSite();
  const router = { push: (path: string) => nextRouter.push(href(path)) };
  const [config, setConfig] = useState(initialConfig),
    [previewPage, setPreviewPage] = useState<string>(),
    [selectedSection, setSelectedSection] = useState<string | null>(null);
  const route = previewPage ?? initialRoute;
  useEffect(() => setConfig(initialConfig), [initialConfig]);
  useEffect(() => {
    if (!preview || window.parent === window) return;
    const send = (message: PreviewMessage) =>
      window.parent.postMessage(message, location.origin);
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (event.origin !== location.origin || event.source !== window.parent)
        return;
      if (event.data?.type === "cms:config") {
        const parsed = siteConfigSchema.safeParse(event.data.config);
        if (parsed.success) {
          setConfig(parsed.data as SiteConfig);
          const key = event.data.page;
          setPreviewPage(
            key && parsed.data.pages[key]?.kind === "custom" ? key : undefined,
          );
        }
      }
      if (event.data?.type === "cms:select") {
        setSelectedSection(event.data.id);
        if (event.data.id)
          document
            .querySelector(`[data-cms-section="${CSS.escape(event.data.id)}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    // In the editor a click selects the block under the pointer; links never navigate.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const block = target.closest("[data-cms-section]");
      if (target.closest("a") || block) event.preventDefault();
      if (block) {
        event.stopPropagation();
        send({ type: "cms:pick", id: block.getAttribute("data-cms-section")! });
      }
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      event.stopPropagation();
      const target =
        event.target instanceof Element
          ? event.target.closest("[data-cms-section]")
          : null;
      send({
        type: "cms:drop",
        files: Array.from(event.dataTransfer.files),
        id: target?.getAttribute("data-cms-section") || null,
      });
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    send({ type: "cms:ready" });
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [preview]);
  const [data, setData] = useState<Data | null>(initialData),
    [error, setError] = useState(""),
    [cart, setCart] = useState<Line[]>([]),
    [hydrated, setHydrated] = useState(false),
    [product, setProduct] = useState<Product | null>(null),
    [reviewProduct, setReviewProduct] = useState<Product | null>(null),
    [purchaseMode, setPurchaseMode] = useState<PurchaseMode | null>(null),
    [purchaseIntent, setPurchaseIntent] = useState<PurchaseMode | null>(null),
    [menuDrink, setMenuDrink] = useState(""),
    [menuTreat, setMenuTreat] = useState(""),
    [choices, setChoices] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [category, setCategory] = useState(initialCategory),
    [toast, setToast] = useState(""),
    [nav, setNav] = useState(false),
    [burgerOpen, setBurgerOpen] = useState(false),
    [clicks, setClicks] = useState(0),
    [externalMediaAllowed, setExternalMediaAllowed] = useState(false),
    [customerIdentity, setCustomerIdentity] = useState<CustomerIdentity | null>(
      null,
    );
  const [busy, setBusy] = useState(false),
    [consumption, setConsumption] = useState("takeaway"),
    [payment, setPayment] = useState("counter"),
    [slot, setSlot] = useState(""),
    [receipt, setReceipt] = useState<ShopOrder | null>(null),
    // Table QR scanned (?table=7): orders go to that table, served on site.
    [tableNumber, setTableNumber] = useState<number | null>(null);
  useEffect(() => {
    const key = `atacuisine-table:${restaurant}`;
    try {
      const fromUrl = Number(new URLSearchParams(location.search).get("table"));
      if (Number.isInteger(fromUrl) && fromUrl > 0) {
        sessionStorage.setItem(key, String(fromUrl));
        setTableNumber(fromUrl);
        setConsumption("onsite");
        return;
      }
      const saved = Number(sessionStorage.getItem(key));
      if (Number.isInteger(saved) && saved > 0) {
        setTableNumber(saved);
        setConsumption("onsite");
      }
    } catch {
      /* Storage unavailable: table mode only for this page. */
    }
  }, [restaurant]);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/shop/catalog");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    return d as Data;
  }, [fetch]);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          `atacuisine-cart:${restaurant}${preview ? ":preview" : ""}`,
        ) || "[]",
      );
      if (Array.isArray(saved))
        setCart(
          saved
            .filter(
              (l) =>
                l &&
                typeof l.menu === "string" &&
                Number.isInteger(l.quantity) &&
                l.quantity > 0 &&
                Array.isArray(l.choices) &&
                l.choices.every((c: unknown) => typeof c === "string") &&
                typeof l.note === "string",
            )
            .slice(0, 30),
        );
    } catch {}
    setHydrated(true);
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      30000,
    );
    return () => clearInterval(timer);
  }, [refresh, preview, restaurant]);
  useEffect(() => {
    if (preview) return;
    fetch("/api/shop/customer-session")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as CustomerIdentity;
      })
      .then(setCustomerIdentity)
      .catch(() => setCustomerIdentity(null));
  }, [fetch, preview]);
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(
          `atacuisine-cart:${restaurant}${preview ? ":preview" : ""}`,
          JSON.stringify(cart),
        );
      } catch {
        /* Private browser storage may be unavailable. */
      }
    }
  }, [cart, hydrated, restaurant, preview]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (route !== "suivi") return;
    const token =
      location.hash.slice(1) ||
      sessionStorage.getItem(
        `atacuisine-receipt:${restaurant}${preview ? ":preview" : ""}`,
      );
    if (!token) {
      setError(
        "Ouvrez votre lien privé de confirmation pour suivre la commande.",
      );
      return;
    }
    const load = async () => {
      const r = await fetch("/api/shop/receipt", {
        headers: { "x-order-token": token },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setReceipt(d);
    };
    void load().catch((e) => setError(e.message));
    const timer = setInterval(
      () => void load().catch((e) => setError(e.message)),
      3000,
    );
    return () => clearInterval(timer);
  }, [route, fetch, preview, restaurant]);
  const count = cart.reduce((s, l) => s + l.quantity, 0),
    total = cart.reduce(
      (s, l) =>
        s +
        linePrice(
          data?.products.find((p) => p.id === l.menu),
          l,
        ) *
          l.quantity,
      0,
    );
  function select(p: Product, intent = purchaseIntent) {
    if (!shopEnabled) return;
    setError("");
    setProduct(p);
    setPurchaseMode(p.category === "Menus" ? "solo" : intent);
    setMenuDrink("");
    setMenuTreat("");
    setChoices([]);
    setNote("");
  }
  function addLines(lines: Line[], message: string) {
    if (!shopEnabled) return;
    setCart((current) => {
      const next = current.map((line) => ({ ...line }));
      for (const line of lines) {
        const match = next.find(
          (item) =>
            item.menu === line.menu &&
            item.note === line.note &&
            item.choices.join("|") === line.choices.join("|"),
        );
        if (match) match.quantity += line.quantity;
        else next.push(line);
      }
      return next;
    });
    setProduct(null);
    setPurchaseMode(null);
    setError("");
    setToast(message);
  }
  function quickAdd(p: Product) {
    addLines(
      [{ menu: p.id, quantity: 1, choices: [], note: "" }],
      `${p.name} a rejoint votre panier !`,
    );
  }
  function add() {
    if (!product) return;
    for (const o of product.options)
      if (o.required && !choices.some((c) => c.startsWith(`${o.id}:`))) {
        setError(`Choisissez ${o.label}.`);
        return;
      }
    const line: Line = {
      menu: product.id,
      quantity: 1,
      choices: [...choices].sort(),
      note,
    };
    if (purchaseMode === "menu") {
      const needsDrink = product.category !== "Boissons";
      const needsTreat = product.category !== "Desserts";
      if (needsDrink && !menuDrink) {
        setError("Choisissez votre boisson pour terminer le menu.");
        return;
      }
      if (needsTreat && !menuTreat) {
        setError("Choisissez votre dessert pour terminer le menu.");
        return;
      }
      const extras: Line[] = [menuDrink, menuTreat]
        .filter(Boolean)
        .map((menu) => ({ menu, quantity: 1, choices: [], note: "" }));
      addLines([line, ...extras], `Votre menu ${product.name} est au panier !`);
      router.push("/checkout");
      return;
    }
    addLines([line], `${product.name} a rejoint votre panier !`);
  }
  function reorder(items: ShopOrder["reorder_items"]) {
    const available = items.filter((item) =>
      data?.products.some(
        (product) =>
          product.id === item.menu && product.enabled && product.portions > 0,
      ),
    );
    if (!available.length) {
      setError("Les produits de cette commande ne sont plus disponibles.");
      return;
    }
    setCart(available);
    router.push("/checkout");
    setToast(
      available.length === items.length
        ? "Votre ancienne commande est prête à être vérifiée."
        : "Les produits encore disponibles ont été ajoutés au panier.",
    );
  }
  const availableProducts =
      data?.products.filter((item) => item.enabled && item.portions > 0) || [],
    drinks = availableProducts.filter((item) => item.category === "Boissons"),
    treats = availableProducts.filter((item) => item.category === "Desserts"),
    menuTotal = product
      ? linePrice(product, {
          menu: product.id,
          quantity: 1,
          choices,
          note,
        }) +
        (data?.products.find((item) => item.id === menuDrink)?.price || 0) +
        (data?.products.find((item) => item.id === menuTreat)?.price || 0)
      : 0,
    suggestions = availableProducts
      .filter(
        (item) =>
          !cart.some((line) => line.menu === item.id) &&
          ["Desserts", "Boissons", "Snacks"].includes(item.category),
      )
      .slice(0, 3),
    address = data?.settings.address || "Adresse à renseigner",
    googleBusinessUrl =
      data?.settings.googleBusinessUrl ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    googleReviewUrl = data?.settings.googleReviewUrl,
    googleMapUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  const extraPages = Object.entries(config.pages).filter(
    ([, page]) => page.kind === "custom" && page.visible,
  );
  const page = config.pages[route || "home"] ?? { sections: [] as Section[] },
    ctx: PlaceholderContext = {
      ...context,
      ...(data
        ? { address: data.settings.address, phone: data.settings.phone }
        : {}),
    },
    r = (text: string) => rich(text, ctx),
    brandName = config.branding.publicName || context.name || "",
    cms = (section: { id: string }): Record<string, string> =>
      preview ? { "data-cms-section": section.id } : {},
    { branding, header, footer } = config;
  const css = useMemo(() => themeCss(config.theme), [config.theme]);
  // Each section of the page, in the order chosen in the CMS. The JSX of the
  // original sections is unchanged; only their texts and media come from the
  // configuration. Business data (products, prices, hours, reviews) stays live.
  function renderSection(section: Section) {
    const attrs = cms(section);
    switch (section.type) {
      case "hero": {
        const p = section.props;
        return (
          <section className="donut-hero" key={section.id} {...attrs}>
            <div className="donut-hero-copy">
              {p.kicker && (
                <p className="donut-kicker">
                  <span /> {r(p.kicker)}
                </p>
              )}
              <h1>{r(p.title)}</h1>
              {p.lead && <p className="donut-lead">{r(p.lead)}</p>}
              <div className="donut-hero-actions">
                <SiteLink link={p.primary} className="donut-button">
                  <ArrowUpRight size={21} />
                </SiteLink>
                <SiteLink link={p.secondary} className="donut-text-link">
                  <ArrowRight size={17} />
                </SiteLink>
              </div>
              {p.badges.length > 0 && (
                <div className="donut-service">
                  {p.badges.map((badge, index) => {
                    const Icon = badgeIcons[badge.icon];
                    return (
                      <span key={index}>
                        <Icon size={17} /> {badge.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="donut-hero-art">
              <img
                className="hero-photo"
                src={p.image.src}
                alt={p.image.alt}
                fetchPriority="high"
              />
              {p.sticker && (
                <button
                  className="donut-sticker"
                  onClick={() => {
                    setClicks(clicks + 1);
                    setToast(
                      clicks >= 4
                        ? "Vous avez trouvé le trou du bonheur. Aucun point, juste un sourire !"
                        : "Encore un tour de gourmandise !",
                    );
                  }}
                  style={{ transform: `rotate(${12 + clicks * 360}deg)` }}
                  aria-label="Animer l’illustration"
                >
                  100%
                  <br />
                  <b>
                    GOOD
                    <br />
                    MOOD
                  </b>
                  <Sparkles size={20} />
                </button>
              )}
              {p.floatingText && (
                <div className="donut-floating">
                  <img src="/cms/restaurant.svg" alt="" />
                  <span>{r(p.floatingText)}</span>
                </div>
              )}
              <span className="donut-star">✳</span>
            </div>
          </section>
        );
      }
      case "marquee":
        return (
          <div
            className="donut-marquee"
            aria-hidden="true"
            key={section.id}
            {...attrs}
          >
            <div className="donut-marquee-track">
              {[0, 1].map((copy) => (
                <span className="donut-marquee-copy" key={copy}>
                  {section.props.items.map((item, index) => (
                    <Fragment key={index}>
                      {index > 0 && " "}
                      {item} <i>✦</i>
                    </Fragment>
                  ))}
                </span>
              ))}
            </div>
          </div>
        );
      case "featuredProducts": {
        const fp = section.props;
        return (
          <section
            className="donut-catalog donut-section"
            id="specialites"
            key={section.id}
            {...attrs}
          >
            <div className="donut-section-title">
              <div>
                {fp.kicker && <p className="donut-kicker">{r(fp.kicker)}</p>}
                <h2>{r(fp.title)}</h2>
              </div>
              {(fp.aside || fp.note) && (
                <p>
                  {r(fp.aside)}
                  {fp.note && (
                    <>
                      <br />
                      <small>{r(fp.note)}</small>
                    </>
                  )}
                </p>
              )}
            </div>
            <div className="donut-categories" aria-label="Catégories">
              {["Tout", ...(data?.settings.categories || [])].map((c) => (
                <button
                  aria-pressed={category === c}
                  className={category === c ? "selected" : ""}
                  key={c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            {!data ? (
              <p className="donut-loading">La gourmandise se prépare…</p>
            ) : (
              <div className="donut-product-grid">
                {data.products
                  .filter((p) => category === "Tout" || p.category === category)
                  .slice(0, fp.limit && category === "Tout" ? fp.limit : 100)
                  .map((p, i) => (
                    <article
                      className={`donut-product tone-${i % 4}`}
                      key={p.id}
                    >
                      <Link
                        href={productPath(p.id)}
                        aria-label={`Voir la fiche de ${p.name}`}
                      >
                        <span className="donut-product-image">
                          <img
                            loading="lazy"
                            src={p.images[0] || "/cms/restaurant.svg"}
                            alt={`Photo de ${p.name}`}
                            width="600"
                            height="480"
                          />
                          <span>{p.category}</span>
                        </span>
                      </Link>
                      <span className="donut-product-info">
                        <div>
                          <h3>
                            <Link
                              className="product-name-link"
                              href={productPath(p.id)}
                            >
                              {p.name}
                            </Link>
                          </h3>
                          <b>
                            {money(p.price)}
                            {p.flash && (
                              <s className="donut-flash-was">
                                {money(p.flash.regular_price)}
                              </s>
                            )}
                          </b>
                        </div>
                        {p.flash && (
                          <span className="donut-flash-tag">
                            <Zap size={13} /> Flash −{p.flash.percent} %
                            {p.flash.member_bonus_points > 0 &&
                              ` · +${p.flash.member_bonus_points} pts membre`}
                          </span>
                        )}
                        <p>{p.description}</p>
                        {data.reviews.some(
                          (review) => review.menu_id === p.id,
                        ) && (
                          <span className="donut-product-rating">
                            <Star size={15} fill="currentColor" />
                            {(
                              data.reviews
                                .filter((review) => review.menu_id === p.id)
                                .reduce(
                                  (sum, review) => sum + review.rating,
                                  0,
                                ) /
                              data.reviews.filter(
                                (review) => review.menu_id === p.id,
                              ).length
                            ).toFixed(1)}
                            <small>
                              (
                              {
                                data.reviews.filter(
                                  (review) => review.menu_id === p.id,
                                ).length
                              }{" "}
                              avis)
                            </small>
                          </span>
                        )}
                        <button
                          type="button"
                          className="donut-review-quick"
                          onClick={(event) => {
                            event.stopPropagation();
                            setError("");
                            setReviewProduct(p);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Star size={15} /> Noter ce produit
                        </button>
                        {shopEnabled && (
                          <button
                            type="button"
                            className="donut-add"
                            disabled={p.portions < 1}
                            onClick={() => select(p)}
                          >
                            {p.portions < 1
                              ? "Victime de son succès"
                              : purchaseIntent === "menu"
                                ? "Composer mon menu"
                                : "Choisir solo ou menu"}
                            <Plus size={20} aria-hidden />
                          </button>
                        )}
                      </span>
                    </article>
                  ))}
              </div>
            )}
            <SiteLink link={fp.allLink} className="donut-button outline">
              <ArrowUpRight size={18} />
            </SiteLink>
          </section>
        );
      }
      case "about": {
        const p = section.props;
        return (
          <section
            className="donut-about donut-section"
            key={section.id}
            {...attrs}
          >
            <div className="donut-about-art">
              <img
                loading="lazy"
                decoding="async"
                src={p.image.src}
                width="320"
                height="320"
                alt={p.image.alt}
              />
              {p.artCaption && <span>{r(p.artCaption)}</span>}
            </div>
            <div>
              {p.kicker && <p className="donut-kicker">{r(p.kicker)}</p>}
              <h2>{r(p.title)}</h2>
              {p.paragraphs.map((text, index) => (
                <p key={index}>{r(text)}</p>
              ))}
              <SiteLink link={p.cta} className="donut-button dark">
                <ArrowUpRight size={19} />
              </SiteLink>
            </div>
          </section>
        );
      }
      case "visit": {
        const p = section.props;
        return (
          <section
            className="donut-visit donut-section"
            key={section.id}
            {...attrs}
          >
            <div>
              {p.kicker && <p className="donut-kicker">{r(p.kicker)}</p>}
              <h2>{r(p.title)}</h2>
              <p>
                <MapPin size={18} />{" "}
                {data?.settings.address || "Adresse à renseigner"}
              </p>
              <a
                href={`tel:${(data?.settings.phone || "").replace(/[^0-9+]/g, "")}`}
              >
                {data?.settings.phone || ""} <ArrowUpRight size={18} />
              </a>
              {p.burger && !config.theme.presentation && (
                <button
                  type="button"
                  className={`donut-burger-stack ${burgerOpen ? "is-open" : ""}`}
                  aria-label={
                    burgerOpen ? "Recomposer le burger" : "Décomposer le burger"
                  }
                  aria-pressed={burgerOpen}
                  onClick={() => setBurgerOpen((open) => !open)}
                  onMouseEnter={() => setBurgerOpen(true)}
                  onMouseLeave={() => setBurgerOpen(false)}
                >
                  <span className="donut-burger-halo" />
                  {Array.from({ length: 6 }, (_, layer) => (
                    <img
                      key={layer}
                      loading="lazy"
                      decoding="async"
                      className={`donut-burger-layer layer-${layer + 1}`}
                      src="/cms/restaurant.svg"
                      alt=""
                    />
                  ))}
                  <span className="donut-burger-caption">
                    <b>{burgerOpen ? p.burgerOpen : p.burgerClosed}</b>
                    <small>{p.burgerHint}</small>
                  </span>
                </button>
              )}
            </div>
            <div className="donut-hours">
              <h3>{r(p.hoursTitle)}</h3>
              {p.hoursNote && <p>{r(p.hoursNote)}</p>}
              {[
                "Dimanche",
                "Lundi",
                "Mardi",
                "Mercredi",
                "Jeudi",
                "Vendredi",
                "Samedi",
              ].map((day, n) => (
                <div key={day}>
                  <span>{day}</span>
                  <b>
                    {data?.settings.hours
                      .filter((h) => h.day === n)
                      .toSorted((a, b) => a.open.localeCompare(b.open))
                      .map((h) => `${h.open} – ${h.close}`)
                      .join(" / ") || "Fermé"}
                  </b>
                </div>
              ))}
              <SiteLink link={p.cta} className="donut-button">
                <ArrowRight size={18} />
              </SiteLink>
            </div>
          </section>
        );
      }
      case "reviews": {
        const p = section.props;
        return (
          <section
            className="donut-reviews donut-section"
            id="avis-clients"
            key={section.id}
            {...attrs}
          >
            <div>
              {p.kicker && <p className="donut-kicker">{r(p.kicker)}</p>}
              <h2>{r(p.title)}</h2>
              {p.text && <p>{r(p.text)}</p>}
              <div className="donut-review-actions">
                <a
                  className="donut-button"
                  href={googleReviewUrl || googleBusinessUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {googleReviewUrl ? p.rateLabel : p.viewLabel}
                  <Star size={19} />
                </a>
                {googleReviewUrl && (
                  <a
                    className="donut-text-link"
                    href={googleBusinessUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {p.sheetLabel} <ExternalLink size={17} />
                  </a>
                )}
              </div>
            </div>
            <a
              className="donut-google-card"
              href={googleBusinessUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Ouvrir la fiche Google — ${brandName}`}
            >
              <span className="donut-google-stars" aria-hidden="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <span key={index}>
                    <Star size={30} fill="currentColor" />
                  </span>
                ))}
              </span>
              <strong>{brandName}</strong>
              <span>{address}</span>
              <b>
                {p.cardCaption} <ExternalLink size={16} />
              </b>
            </a>
            {!!data?.reviews.length && (
              <div className="donut-review-list">
                {data.reviews
                  .slice(0, route === "avis" ? 60 : 3)
                  .map((review) => (
                    <article key={review.id}>
                      <div
                        className="donut-google-stars"
                        aria-label={`${review.rating} étoiles`}
                      >
                        {Array.from({ length: review.rating }, (_, index) => (
                          <Star key={index} size={18} fill="currentColor" />
                        ))}
                      </div>
                      <p>« {review.body} »</p>
                      <b>{review.customer_name}</b>
                      <small>
                        {review.menu_name}
                        {review.verified_purchase && (
                          <span className="donut-review-verified">
                            <Check size={12} /> Achat vérifié
                          </span>
                        )}
                      </small>
                      {review.admin_reply && (
                        <blockquote>
                          <b>{brandName} répond</b>
                          <p>{review.admin_reply}</p>
                        </blockquote>
                      )}
                    </article>
                  ))}
              </div>
            )}
          </section>
        );
      }
      case "map": {
        const p = section.props;
        return (
          <section
            className="donut-map-section"
            aria-labelledby="map-title"
            key={section.id}
            {...attrs}
          >
            <div className="donut-map-heading">
              <div>
                {p.kicker && <p className="donut-kicker">{r(p.kicker)}</p>}
                <h2 id="map-title">{r(p.title)}</h2>
              </div>
              <a
                className="donut-button dark"
                href={googleBusinessUrl}
                target="_blank"
                rel="noreferrer"
              >
                {p.buttonLabel} <ExternalLink size={18} />
              </a>
            </div>
            {externalMediaAllowed ? (
              <iframe
                className="donut-map"
                src={googleMapUrl}
                title={`Carte de ${address}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            ) : (
              <div className="donut-map-consent">
                <MapPin size={34} />
                <strong>La carte Google Maps est bloquée.</strong>
                <p>
                  Autorisez le contenu externe dans vos préférences ou ouvrez
                  directement l’itinéraire.
                </p>
                <button
                  className="donut-button"
                  onClick={() =>
                    window.dispatchEvent(new Event("donuts:cookie-settings"))
                  }
                >
                  Gérer mes préférences
                </button>
              </div>
            )}
          </section>
        );
      }
      case "gallery":
        return (
          <Gallery
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
          />
        );
      case "textBlock":
        return (
          <TextBlock
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
          />
        );
      case "textImage":
        return (
          <TextImage
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
          />
        );
      case "video":
        return (
          <Video
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
            externalAllowed={externalMediaAllowed}
          />
        );
      case "faq":
        return (
          <Faq key={section.id} props={section.props} ctx={ctx} attrs={attrs} />
        );
      case "cta":
        return (
          <Cta key={section.id} props={section.props} ctx={ctx} attrs={attrs} />
        );
      case "promoBanner":
        return (
          <PromoBanner
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
          />
        );
      case "categories":
        return (
          <Categories
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
            categories={data?.settings.categories || []}
          />
        );
      case "hours":
        return (
          <Hours
            key={section.id}
            props={section.props}
            ctx={ctx}
            attrs={attrs}
            hours={data?.settings.hours}
          />
        );
      case "legal":
        return (
          <LegalPage
            key={section.id}
            route={route}
            legal={config.legal}
            extra={section.props.extra}
          />
        );
      case "system":
        return (
          <Fragment key={section.id}>
            {renderSystem(section.props.block)}
          </Fragment>
        );
    }
  }
  // Functional blocks: order flow, tracking, account and forms, unchanged.
  function renderSystem(
    block: Extract<Section, { type: "system" }>["props"]["block"],
  ) {
    if (block === "account")
      return preview ? (
        <section className="donut-section">
          <h2>Espace client</h2>
          <p>
            Aperçu : connexion, fidélité et historique sont désactivés dans
            l’éditeur.
          </p>
        </section>
      ) : (
        <CustomerAccount onReorder={reorder} />
      );
    if (preview && block === "reservationForm")
      return (
        <section className="donut-section">
          <h2>Réservations</h2>
          <p>Le formulaire est désactivé dans l’aperçu de l’éditeur.</p>
        </section>
      );
    if (block === "reservationForm")
      return (
        <section className="donut-section">
          <PublicReservation />
        </section>
      );
    if (block === "orderStart")
      return (
        <section className="donut-order-start" id="start">
          <p className="donut-kicker">MA PROCHAINE PAUSE</p>
          <h1>Une envie précise ou le menu complet ?</h1>
          <p>
            Choisissez votre point de départ. Vous pourrez tout modifier avant
            de valider le panier.
          </p>
          <div className="donut-order-paths">
            <button
              className={purchaseIntent === "solo" ? "selected" : ""}
              onClick={() => {
                setPurchaseIntent("solo");
                document.getElementById("specialites")?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
            >
              <span>01</span>
              <strong>Je choisis un produit</strong>
              <small>Choisissez vos produits et composez votre commande.</small>
              <ArrowRight />
            </button>
            <button
              className={purchaseIntent === "menu" ? "selected" : ""}
              onClick={() => {
                setPurchaseIntent("menu");
                document.getElementById("specialites")?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
            >
              <span>02</span>
              <strong>Je compose mon menu</strong>
              <small>
                Le produit de départ, la boisson et la touche sucrée.
              </small>
              <Sparkles />
            </button>
          </div>
        </section>
      );
    if (block === "tracking")
      return (
        <section className="donut-section donut-tracking">
          {receipt ? (
            <>
              <span className="donut-success">
                <Check />
              </span>
              <p className="donut-kicker">COMMANDE #{receipt.number}</p>
              <h1>
                {preparation(receipt) === "cancelled"
                  ? "Commande annulée."
                  : "C’est dans la boîte !"}
              </h1>
              <p>
                Merci {receipt.customer_name}. Votre commande est enregistrée
                dans le restaurant de démonstration.
              </p>
              <div className="donut-progress">
                {["waiting", "preparing", "ready", "served"].map((s, i) => (
                  <span
                    className={
                      i <=
                      ["waiting", "preparing", "ready", "served"].indexOf(
                        preparation(receipt),
                      )
                        ? "done"
                        : ""
                    }
                    key={s}
                  >
                    {i + 1}. {prepLabels[s]}
                  </span>
                ))}
              </div>
              <div className="donut-receipt">
                <h2>
                  {receipt.consumption === "onsite"
                    ? "Sur place"
                    : "À emporter"}{" "}
                  · {slotLabel(receipt.desired_at)}
                </h2>
                <p>
                  {receipt.payment_status === "paid"
                    ? "Paiement confirmé (démonstration)"
                    : receipt.payment_method === "counter"
                      ? "À encaisser au comptoir"
                      : "Paiement Stripe test en attente"}
                </p>
                {receipt.items.map((i) => {
                  const reviewedProduct = data?.products.find(
                    (item) => item.id === i.menu_id,
                  );
                  return (
                    <div className="donut-receipt-line" key={i.id}>
                      <span>
                        {i.quantity} × {i.name}
                        <small>{i.note}</small>
                        {reviewedProduct && (
                          <button
                            type="button"
                            className="donut-review-inline"
                            onClick={() => {
                              setError("");
                              setReviewProduct(reviewedProduct);
                            }}
                          >
                            <Star size={14} /> Noter ce produit
                          </button>
                        )}
                      </span>
                      <b>{money(i.price * i.quantity)}</b>
                    </div>
                  );
                })}
                {receipt.discount > 0 && (
                  <div className="donut-receipt-line">
                    <span>Remise code promo</span>
                    <b>− {money(receipt.discount)}</b>
                  </div>
                )}
                {!preview && (
                  <OrderQrCard
                    storageKey={`atacuisine-receipt:${restaurant}`}
                  />
                )}
                <div className="donut-points-earned">
                  <Star size={22} fill="currentColor" />
                  <span>
                    <b>
                      {receipt.points_awarded > 0
                        ? `+${receipt.points_awarded} points ajoutés à votre compte`
                        : "Vos points fidélité sont crédités dès le retrait"}
                    </b>
                    <small>
                      Partagez votre lien de parrainage : vos amis reçoivent un
                      cadeau, vous gagnez des points.{" "}
                      <Link href="/compte?onglet=parrainage">
                        Partager et gagner →
                      </Link>
                    </small>
                  </span>
                </div>
                <div className="donut-receipt-line">
                  <b>Total</b>
                  <b>{money(receipt.total)}</b>
                </div>
                {receipt.payment_method === "stripe" &&
                  receipt.payment_status !== "paid" && (
                    <button
                      className="donut-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          const d = await shopPost("payment", {
                            token: receipt.token,
                          });
                          location.href = d.url;
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Continuer le paiement Stripe test
                    </button>
                  )}
                <p>
                  Ce lien est privé. Conservez-le pour retrouver votre suivi.
                </p>
                <details>
                  <summary>Aperçu de l’e-mail · non envoyé</summary>
                  <pre>{receipt.email_preview}</pre>
                </details>
              </div>
            </>
          ) : (
            <p>{error || "Chargement de votre commande…"}</p>
          )}
        </section>
      );
    return (
      <section className="donut-section donut-review-form-section">
        <div>
          <p className="donut-kicker">VOTRE EXPÉRIENCE</p>
          <h2>Donnez votre avis sur un produit.</h2>
          <p>
            Votre avis sera relu avant publication. Une réponse de
            l’établissement pourra apparaître avec lui.
          </p>
        </div>
        {customerIdentity ? (
          <form
            className="donut-review-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                const values = new FormData(event.currentTarget);
                await shopPost("review", {
                  menu: values.get("menu"),
                  rating: Number(values.get("rating")),
                  body: values.get("body"),
                });
                event.currentTarget.reset();
                setToast(
                  "Merci ! Votre avis est maintenant en attente de validation.",
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Produit à noter
              <select name="menu" required defaultValue="">
                <option value="" disabled>
                  Choisir un produit
                </option>
                {data?.products.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note
              <select name="rating" required defaultValue="5">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <option value={rating} key={rating}>
                    {rating} étoile{rating > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Votre avis
              <textarea
                name="body"
                minLength={10}
                maxLength={1000}
                required
                placeholder="Ce que vous avez aimé, le goût, la texture…"
              />
            </label>
            {error && (
              <p className="donut-error" role="alert">
                {error}
              </p>
            )}
            <button className="donut-button" disabled={busy}>
              {busy ? "Envoi…" : "Envoyer mon avis"}
            </button>
          </form>
        ) : (
          <div className="donut-review-login">
            <p>
              Connectez-vous pour laisser un avis. Les produits déjà commandés
              porteront la mention « achat vérifié ».
            </p>
            <Link className="donut-button" href="/compte">
              Me connecter
            </Link>
          </div>
        )}
      </section>
    );
  }
  return (
    <PublicAppearance theme={config.theme}
      className={`donut-site${preview ? " is-cms-preview" : ""}`}
      data-template={config.theme.presentation?.layout}
      data-sticky-header={config.theme.presentation?.stickyHeader}
      data-motion={config.theme.presentation?.motion}
      data-action-bar={
        config.theme.presentation?.stickyAction !== undefined &&
        config.theme.presentation.stickyAction !== "none"
      }
    >
      {demo && (
        <aside className="tenant-demo-banner">
          Démonstration locale · données fictives · aucun paiement réel.
        </aside>
      )}
      {css && <style>{css}</style>}
      {preview && selectedSection && /^[a-z0-9-]+$/.test(selectedSection) && (
        <style>{`[data-cms-section="${selectedSection}"]{outline:3px solid #e83e91;outline-offset:-3px}`}</style>
      )}
      <a className="donut-skip" href="#main">
        Aller au contenu
      </a>
      {tableNumber && !preview && (
        <div className="donut-table-banner" role="status">
          <span>
            Commande à table · <b>Table {tableNumber}</b> · servie sur place
          </span>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(`atacuisine-table:${restaurant}`);
              } catch {
                /* Nothing to forget. */
              }
              setTableNumber(null);
              setConsumption("takeaway");
            }}
          >
            Quitter
          </button>
        </div>
      )}
      {(branding.announcement || branding.announcementHighlight) && (
        <div
          className="donut-announcement"
          {...cms({ id: "site-announcement" })}
        >
          {r(branding.announcement)}{" "}
          {branding.announcementHighlight && (
            <span>{branding.announcementHighlight}</span>
          )}
        </div>
      )}
      <header className="donut-header" {...cms({ id: "site-header" })}>
        <Link href="/" className="donut-brand">
          <img
            src={branding.logo.src}
            width="68"
            height="68"
            alt={branding.logo.alt}
          />
          <span>
            {r(branding.brandLines)}
            <span className="brand-dot">.</span>
          </span>
        </Link>
        <nav className={nav ? "expanded" : ""}>
          <Link href="/carte">{header.navMenu}</Link>
          <Link href="/histoire">{header.navUniverse}</Link>
          <Link href="/contact">{header.navContact}</Link>
          <Link href="/compte">{header.navAccount}</Link>
        </nav>
        <div className="donut-nav-actions">
          <PublicModeSwitch />
          <Link
            className="donut-account-link"
            href="/compte"
            aria-label="Mon compte"
          >
            <UserRound size={20} />
          </Link>
          {shopEnabled && (
            <>
              <Link className="donut-button compact" href="/commander">
                {header.orderLabel} <ArrowUpRight size={17} />
              </Link>
              <button
                className={`donut-bag ${toast ? "bounce" : ""}`}
                aria-label={`Ouvrir le panier, ${count} produits`}
                onClick={() => router.push("/checkout")}
              >
                <ShoppingBag size={23} />
                <span>{count}</span>
              </button>
            </>
          )}
          <button
            className="donut-mobile-menu"
            aria-label="Menu"
            onClick={() => setNav(!nav)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <main id="main">
        {error && (
          <div role="alert" className="donut-error">
            {error}
            <button aria-label="Fermer l’erreur" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {detailProduct ? (
          <section className="donut-section">
            <ProductDetails
              product={detailProduct}
              image={detailProduct.images[0]}
            >
              <Link className="donut-button outline" href="/carte">
                Retour à la carte
              </Link>
              {shopEnabled && detailProduct.portions > 0 && (
                <button
                  type="button"
                  className="donut-button primary"
                  onClick={() => select(detailProduct)}
                >
                  Commander ce produit
                </button>
              )}
            </ProductDetails>
            <ProductRecommendations
              product={detailProduct}
              items={data?.products ?? []}
              href={(item) => href(productPath(item.id))}
              image={(item) => item.images[0]}
            >
              {shopEnabled &&
                !preview &&
                (detailProduct.portions > 0 &&
                detailProduct.category !== "Menus" &&
                (detailProduct.category === "Boissons" || drinks.length > 0) &&
                (detailProduct.category === "Desserts" || treats.length > 0) ? (
                  <button
                    type="button"
                    className="donut-button"
                    onClick={() => select(detailProduct, "menu")}
                  >
                    Composer mon menu
                  </button>
                ) : (
                  <Link
                    className="donut-button outline"
                    href="/commander#start"
                  >
                    Voir les options à emporter
                  </Link>
                ))}
            </ProductRecommendations>
          </section>
        ) : (
          page.sections.filter((s) => s.visible).map(renderSection)
        )}
      </main>
      {route !== "checkout" && (
        <footer className="donut-footer" {...cms({ id: "site-footer" })}>
          <div className="donut-footer-top">
            <Link href="/" className="donut-brand">
              <img
                loading="lazy"
                decoding="async"
                src={branding.logo.src}
                width="70"
                height="70"
                alt={branding.logo.alt}
              />
              <span>{r(footer.tagline)}</span>
            </Link>
            {shopEnabled && (
              <Link href="/commander">
                {footer.cta} <ArrowUpRight />
              </Link>
            )}
          </div>
          {extraPages.length > 0 && (
            <nav
              className="donut-extra-pages"
              aria-label="Autres pages du restaurant"
            >
              {extraPages.map(([key, page]) => (
                <Link
                  key={key}
                  href={`/${key}`}
                  aria-current={key === route ? "page" : undefined}
                >
                  {page.title}
                </Link>
              ))}
            </nav>
          )}
          <div className="donut-footer-bottom">
            <span>
              {r(footer.credit)} · <Link href="/source">Code source</Link>
            </span>
            <Link href="/mentions-legales">Mentions légales</Link>
            <Link href="/conditions-generales-vente">CGV</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/cookies">Cookies</Link>
            <button
              onClick={() =>
                window.dispatchEvent(new Event("donuts:cookie-settings"))
              }
            >
              Gérer mes cookies
            </button>
            <Link href="/demo">Espace équipe ↗</Link>
          </div>
          {footer.notice && <p>{r(footer.notice)}</p>}
          {updatedAt && !preview && (
            <p className="donut-updated">
              <small>
                Site mis à jour le{" "}
                <time dateTime={new Date(updatedAt).toISOString()}>
                  {new Date(updatedAt).toLocaleDateString("fr-FR", {
                    timeZone: "Europe/Paris",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </small>
            </p>
          )}
        </footer>
      )}
      {!["checkout", "compte", "suivi"].includes(route || "") && (
        <TemplateExtras
          presentation={config.theme.presentation}
          shopEnabled={shopEnabled}
          cartVisible={count > 0 && shopEnabled}
        />
      )}
      <CookieConsent onChange={setExternalMediaAllowed} />
      {toast && (
        <div className="donut-toast" role="status">
          <Sparkles size={20} />
          {toast}
        </div>
      )}
      {shopEnabled && count > 0 && route !== "checkout" && (
        <button
          className="donut-mobile-cart donut-button"
          onClick={() => router.push("/checkout")}
        >
          <ShoppingBag size={19} /> Mon panier · {count}
          <b>{money(total)}</b>
        </button>
      )}
      {reviewProduct && (
        <Modal
          title={`Noter ${reviewProduct.name}`}
          description="Partagez votre expérience. L’équipe relira votre avis avant sa publication."
          close={() => {
            setReviewProduct(null);
            setError("");
          }}
        >
          {customerIdentity ? (
            <form
              className="donut-review-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const values = new FormData(event.currentTarget);
                  const result = await shopPost("review", {
                    menu: reviewProduct.id,
                    rating: Number(values.get("rating")),
                    body: values.get("body"),
                  });
                  setReviewProduct(null);
                  setToast(
                    result.verifiedPurchase
                      ? "Merci ! Votre avis avec achat vérifié est en attente de validation."
                      : "Merci ! Votre avis est en attente de validation.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="donut-review-product">
                <img
                  src={reviewProduct.images[0] || "/cms/restaurant.svg"}
                  alt=""
                />
                <div>
                  <b>{reviewProduct.name}</b>
                  <small>Vous notez précisément ce produit.</small>
                </div>
              </div>
              <label>
                Note
                <select name="rating" required defaultValue="5">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option value={rating} key={rating}>
                      {rating} étoile{rating > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Votre avis
                <textarea
                  name="body"
                  minLength={10}
                  maxLength={1000}
                  required
                  placeholder="Le goût, la texture, ce que vous avez aimé…"
                />
              </label>
              {error && (
                <p className="donut-error" role="alert">
                  {error}
                </p>
              )}
              <button className="donut-button" disabled={busy}>
                {busy ? "Envoi…" : "Envoyer mon avis"}
              </button>
            </form>
          ) : (
            <div className="donut-review-login">
              <p>
                Connectez-vous pour noter {reviewProduct.name}. Si vous l’avez
                commandé, l’avis sera identifié comme achat vérifié.
              </p>
              <Link className="donut-button" href="/compte">
                Me connecter pour noter
              </Link>
            </div>
          )}
        </Modal>
      )}
      {product && (
        <Modal
          title={product.name}
          description="Composez votre pause, vérifiez le prix puis ajoutez-la au panier."
          footer={
            purchaseMode ? (
              <div className="donut-modal-action">
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button className="donut-button" onClick={add}>
                  {purchaseMode === "menu"
                    ? "Ajouter mon menu"
                    : "Ajouter au panier"}{" "}
                  ·{" "}
                  {money(
                    purchaseMode === "menu"
                      ? menuTotal
                      : linePrice(product, {
                          menu: product.id,
                          quantity: 1,
                          choices,
                          note,
                        }),
                  )}
                  <Plus size={18} />
                </button>
              </div>
            ) : undefined
          }
          close={() => {
            setProduct(null);
            setPurchaseMode(null);
          }}
        >
          <div className="donut-product-modal">
            <img
              src={product.images[0] || "/cms/restaurant.svg"}
              alt={`Illustration de ${product.name}`}
            />
            {product.images.slice(1).map((src, i) => (
              <img
                key={src + i}
                loading="lazy"
                src={src}
                alt={`Illustration ${i + 2} de ${product.name}`}
              />
            ))}
            <div className="donut-product-summary">
              <div>
                <p>{product.description}</p>
                <small>Illustration et recette de démonstration.</small>
                <button
                  type="button"
                  className="donut-review-link"
                  onClick={() => {
                    setError("");
                    setReviewProduct(product);
                    setProduct(null);
                    setPurchaseMode(null);
                  }}
                >
                  <Star size={16} /> Donner mon avis sur ce produit
                </button>
              </div>
              <b>
                {money(product.price)}
                {product.flash && (
                  <s className="donut-flash-was">
                    {money(product.flash.regular_price)}
                  </s>
                )}
              </b>
            </div>
            <p>
              <b>Allergènes :</b>{" "}
              {product.allergens || "Non renseignés — demandez au personnel."}
            </p>
            {!purchaseMode && (
              <div className="donut-mode-picker">
                <button onClick={() => setPurchaseMode("solo")}>
                  <span>Juste cette envie</span>
                  <strong>Le prendre seul</strong>
                  <small>À partir de {money(product.price)}</small>
                  <ArrowRight />
                </button>
                <button onClick={() => setPurchaseMode("menu")}>
                  <span>La pause complète</span>
                  <strong>Composer un menu</strong>
                  <small>Avec boisson et gourmandise selon votre choix</small>
                  <Sparkles />
                </button>
              </div>
            )}
            {purchaseMode && (
              <button
                className="donut-back-choice"
                onClick={() => setPurchaseMode(null)}
              >
                ← Changer : {purchaseMode === "menu" ? "menu" : "produit seul"}
              </button>
            )}
            {purchaseMode &&
              product.options.map((o) => (
                <fieldset key={o.id}>
                  <legend>
                    {o.label} {o.required ? "(obligatoire)" : "(facultatif)"}
                  </legend>
                  {o.choices.map((c) => {
                    const key = `${o.id}:${c.id}`;
                    return (
                      <label key={c.id}>
                        <input
                          type={o.multiple ? "checkbox" : "radio"}
                          name={o.id}
                          checked={choices.includes(key)}
                          onChange={(e) =>
                            setChoices(
                              e.target.checked
                                ? [
                                    ...choices.filter(
                                      (x) =>
                                        o.multiple || !x.startsWith(`${o.id}:`),
                                    ),
                                    key,
                                  ]
                                : choices.filter((x) => x !== key),
                            )
                          }
                        />
                        {c.label}
                        <b>{c.price ? `+ ${money(c.price)}` : "Inclus"}</b>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            {purchaseMode === "menu" && product.category !== "Boissons" && (
              <fieldset className="donut-menu-step">
                <legend>1. Choisissez votre boisson</legend>
                <div className="donut-choice-grid">
                  {drinks.map((item) => (
                    <button
                      type="button"
                      className={menuDrink === item.id ? "selected" : ""}
                      key={item.id}
                      onClick={() => setMenuDrink(item.id)}
                    >
                      <img src={item.images[0]} alt="" />
                      <span>{item.name}</span>
                      <b>+ {money(item.price)}</b>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {purchaseMode === "menu" && product.category !== "Desserts" && (
              <fieldset className="donut-menu-step">
                <legend>2. La touche sucrée</legend>
                <div className="donut-choice-grid">
                  {treats.map((item) => (
                    <button
                      type="button"
                      className={menuTreat === item.id ? "selected" : ""}
                      key={item.id}
                      onClick={() => setMenuTreat(item.id)}
                    >
                      <img src={item.images[0]} alt="" />
                      <span>{item.name}</span>
                      <b>+ {money(item.price)}</b>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {purchaseMode && (
              <>
                <label>
                  Une précision ?
                  <textarea
                    maxLength={300}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Une préférence pour la préparation…"
                  />
                </label>
              </>
            )}
          </div>
        </Modal>
      )}
      {route === "checkout" && (
        <Modal
          page
          title="Finaliser ma commande"
          description="Votre panier, votre code promo et le paiement réunis sur une seule page."
          footer={
            cart.length ? (
              <button
                className="donut-button"
                type="submit"
                form="donut-checkout-form"
                disabled={
                  busy ||
                  !customerIdentity ||
                  !data?.slots.length ||
                  cart.some(
                    (line) =>
                      !data?.products.some(
                        (item) =>
                          item.id === line.menu &&
                          item.portions >= line.quantity,
                      ),
                  )
                }
              >
                {!customerIdentity
                  ? "Créez un compte pour commander"
                  : busy
                    ? "Envoi de la commande…"
                    : `Commander avec obligation de paiement · ${money(total)}`}
                <ArrowRight size={19} />
              </button>
            ) : undefined
          }
          close={() => router.push("/commander")}
        >
          <div className="donut-checkout">
            {!cart.length ? (
              <p>Votre panier attend sa première gourmandise.</p>
            ) : (
              <>
                {cart.map((l, n) => {
                  const p = data?.products.find((p) => p.id === l.menu);
                  return (
                    <div className="donut-cart-line" key={n}>
                      <img src={p?.images[0] || "/cms/restaurant.svg"} alt="" />
                      <div>
                        <h3>{p?.name || "Produit indisponible"}</h3>
                        <small>
                          {p?.options
                            .flatMap((o) =>
                              o.choices
                                .filter((c) =>
                                  l.choices.includes(`${o.id}:${c.id}`),
                                )
                                .map((c) => c.label),
                            )
                            .join(" · ")}{" "}
                          {l.note}
                        </small>
                        <div className="donut-quantity">
                          <button
                            aria-label={`Diminuer ${p?.name}`}
                            onClick={() =>
                              setCart(
                                cart.flatMap((x, i) =>
                                  i === n
                                    ? x.quantity > 1
                                      ? [{ ...x, quantity: x.quantity - 1 }]
                                      : []
                                    : [x],
                                ),
                              )
                            }
                          >
                            <Minus size={14} />
                          </button>
                          <span>{l.quantity}</span>
                          <button
                            aria-label={`Augmenter ${p?.name}`}
                            disabled={l.quantity >= 20}
                            onClick={() =>
                              setCart(
                                cart.map((x, i) =>
                                  i === n
                                    ? { ...x, quantity: x.quantity + 1 }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            aria-label={`Supprimer ${p?.name}`}
                            onClick={() =>
                              setCart(cart.filter((_, i) => i !== n))
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <b>{money(linePrice(p, l) * l.quantity)}</b>
                    </div>
                  );
                })}
                <div className="donut-receipt-line">
                  <b>Total estimé</b>
                  <b>{money(total)}</b>
                </div>
                {!!suggestions.length && (
                  <section className="donut-upsell">
                    <p className="donut-kicker">AVANT DE FILER…</p>
                    <h3>Un petit plus avec ça ?</h3>
                    <div>
                      {suggestions.map((item) => (
                        <article key={item.id}>
                          <img src={item.images[0]} alt="" />
                          <span>
                            <b>{item.name}</b>
                            <small>{money(item.price)}</small>
                          </span>
                          <button
                            aria-label={`Ajouter ${item.name}`}
                            onClick={() => quickAdd(item)}
                            type="button"
                          >
                            <Plus size={17} />
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
                {!customerIdentity ? (
                  <CustomerAuth
                    compact
                    initialMode="register"
                    onAuthenticated={setCustomerIdentity}
                  />
                ) : (
                  <form
                    id="donut-checkout-form"
                    className="form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (busy) return;
                      setBusy(true);
                      const values = new FormData(e.currentTarget);
                      try {
                        let key = sessionStorage.getItem(
                          `atacuisine-checkout-key:${restaurant}${preview ? ":preview" : ""}`,
                        );
                        if (!key) {
                          key = crypto.randomUUID();
                          sessionStorage.setItem(
                            `atacuisine-checkout-key:${restaurant}${preview ? ":preview" : ""}`,
                            key,
                          );
                        }
                        const order = await shopPost("checkout", {
                          key,
                          customer: customerIdentity.name,
                          email: customerIdentity.email,
                          consumption: tableNumber ? "onsite" : consumption,
                          table: tableNumber ?? undefined,
                          payment,
                          slot,
                          promo: values.get("promo"),
                          loyaltyConsent: values.get("loyaltyConsent") === "on",
                          termsAccepted: values.get("termsAccepted") === "on",
                          items: cart,
                        });
                        sessionStorage.setItem(
                          `atacuisine-receipt:${restaurant}${preview ? ":preview" : ""}`,
                          order.token,
                        );
                        sessionStorage.removeItem(
                          `atacuisine-checkout-key:${restaurant}${preview ? ":preview" : ""}`,
                        );
                        localStorage.removeItem(
                          `atacuisine-cart:${restaurant}${preview ? ":preview" : ""}`,
                        );
                        setCart([]);
                        router.push(`/suivi#${order.token}`);
                      } catch (e) {
                        setError((e as Error).message);
                        await refresh().catch(() => {});
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <h3>1. Comment en profiter ?</h3>
                    <label>
                      Mode de consommation
                      <select
                        value={consumption}
                        onChange={(e) => setConsumption(e.target.value)}
                      >
                        <option value="takeaway">À emporter</option>
                        <option value="onsite">Sur place</option>
                      </select>
                    </label>
                    {consumption === "onsite" && (
                      <p>
                        Remise au comptoir ou à table par l’équipe. Aucune place
                        assise garantie.
                      </p>
                    )}
                    <label>
                      Créneau de retrait (heure de Paris)
                      <select
                        required
                        value={slot}
                        onChange={(e) => setSlot(e.target.value)}
                      >
                        <option value="">Choisir un horaire</option>
                        {data?.slots.map((s) => (
                          <option key={s} value={s}>
                            {slotLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!data?.slots.length && (
                      <p role="alert">
                        Aucun créneau disponible. Le restaurant est fermé ou les
                        créneaux sont complets.
                      </p>
                    )}
                    <p>
                      Préparation indicative : {data?.settings.prepMinutes}{" "}
                      minutes.
                    </p>
                    <h3>2. On vous appelle comment ?</h3>
                    <div className="donut-checkout-account">
                      <span>
                        <strong>{customerIdentity.name}</strong>
                        <small>{customerIdentity.email}</small>
                      </span>
                      <Link href="/compte">Gérer mon compte</Link>
                    </div>
                    <small>
                      Cette commande sera ajoutée automatiquement à votre
                      historique client.
                    </small>
                    <h3>3. Vos avantages</h3>
                    <label>
                      Code promo ou fidélité
                      <input
                        name="promo"
                        maxLength={40}
                        autoComplete="off"
                        placeholder="Ex. HAPPY100"
                      />
                    </label>
                    <label className="check">
                      <input name="loyaltyConsent" type="checkbox" />
                      J’accepte de rejoindre le programme de fidélité et de
                      cumuler des points avec mon e-mail.
                    </label>
                    <small>
                      Un code fidélité peut nécessiter un produit précis dans le
                      panier. La remise ou les points sont validés avant
                      l’envoi.
                    </small>
                    <h3>4. Le règlement</h3>
                    <label>
                      Mode de paiement
                      <select
                        value={payment}
                        onChange={(e) => setPayment(e.target.value)}
                      >
                        <option value="counter">
                          Au comptoir · carte ou espèces
                        </option>
                        <option value="stripe" disabled={!data?.stripe}>
                          En ligne · Stripe test{" "}
                          {data?.stripe ? "" : "(non configuré)"}
                        </option>
                      </select>
                    </label>
                    {error && (
                      <p role="alert" className="error">
                        {error}
                      </p>
                    )}
                    <div className="donut-order-finality">
                      <strong>Commande transmise directement en cuisine</strong>
                      <p>
                        Après validation, elle ne peut plus être modifiée,
                        annulée ou remboursée à votre initiative, sous réserve
                        de vos droits légaux en cas de non-conformité ou
                        d’inexécution.
                      </p>
                    </div>
                    <label className="check donut-terms-check">
                      <input name="termsAccepted" type="checkbox" required />
                      <span>
                        J’ai lu et j’accepte les{" "}
                        <Link
                          href="/conditions-generales-vente"
                          target="_blank"
                        >
                          conditions générales de vente
                        </Link>
                        , dont l’exclusion du droit de rétractation applicable
                        aux produits préparés et périssables.
                      </span>
                    </label>
                    <small>
                      Les montants et disponibilités sont vérifiés par le
                      restaurant au moment de la validation.
                    </small>
                  </form>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </PublicAppearance>
  );
}
