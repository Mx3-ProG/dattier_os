import { useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Eye,
  LayoutTemplate,
  PenLine,
  Search,
} from "lucide-react";
import { siteTemplates, type SiteTemplate } from "@/features/cms/templates";
import { fonts } from "@/features/cms/theme";
import { Button } from "../ui/button";
import { Modal } from "../forms";
// Imported by the component itself so the store is never rendered unstyled,
// whatever route or navigation brought the user here.
import "./template-store.css";
import "./template-variants.css";

const templateVars = (t: SiteTemplate) =>
  ({
    "--tpl-primary": t.theme.colors.primary,
    "--tpl-bg": t.theme.colors.background,
    "--tpl-font": fonts[t.theme.fonts.heading].stack,
  }) as CSSProperties;

function TemplatePreview({ template: t }: { template: SiteTemplate }) {
  return (
    <div className="tpl-window" style={templateVars(t)}>
      <div className="tpl-window-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{t.id}.example.com</span>
      </div>
      <div className={`tpl-site tpl-site-${t.id}`}>
        <div className="tpl-site-nav">
          <b>{t.name}</b>
          <span>
            <em>Carte</em>
            <em>Histoire</em>
            <em className="tpl-site-pill">Réserver</em>
          </span>
        </div>
        <div className="tpl-site-hero">
          <div>
            <small>{t.category}</small>
            <strong>{t.title.replaceAll("*", "")}</strong>
            <span className="tpl-site-cta">Découvrir la carte</span>
          </div>
          <div
            className="tpl-site-photo"
            style={{ backgroundImage: `url("${t.image}")` }}
            role="img"
            aria-label="Illustration culinaire de démonstration"
          />
        </div>
        {t.premium && (
          <div className="tpl-variant-dock">
            La carte{" "}
            <b>
              {t.theme.presentation?.stickyAction === "reserve"
                ? "Réserver ↗"
                : "Commander ↗"}
            </b>
          </div>
        )}
        <div className="tpl-site-foot">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

const free = siteTemplates.filter((t) => !t.premium).length;
const premium = siteTemplates.length - free;

/** Landing of « Mon site web » : two clear choices, nothing else. */
export function SiteHome({
  shop,
  edit,
  dirty = false,
}: {
  shop: () => void;
  edit: () => void;
  dirty?: boolean;
}) {
  const fan = [siteTemplates[0], siteTemplates[4], siteTemplates[1]];
  return (
    <section className="site-home">
      <header className="tpl-heading">
        <span className="shop-eyebrow">VOTRE RESTAURANT, VOTRE UNIVERS</span>
        <h1>Mon site web</h1>
        <p>Que souhaitez-vous faire aujourd’hui ?</p>
      </header>
      <div className="site-home-choices">
        <button className="site-choice site-choice-shop" onClick={shop}>
          <span className="site-choice-art site-choice-fan" aria-hidden="true">
            {fan.map((t) => (
              <span key={t.id} className="site-choice-card">
                <TemplatePreview template={t} />
              </span>
            ))}
          </span>
          <span className="site-choice-body">
            <span className="site-choice-icon">
              <LayoutTemplate size={20} />
            </span>
            <strong>Boutique de modèles</strong>
            <span className="site-choice-text">
              {siteTemplates.length} modèles pensés pour la restauration.
              Changez d’ambiance en un clic.
            </span>
            <span className="site-choice-meta">
              {free} gratuits · {premium} premium
            </span>
            <span className="site-choice-cta">
              Explorer la boutique <ArrowRight size={17} />
            </span>
          </span>
        </button>
        <button className="site-choice site-choice-edit" onClick={edit}>
          <span
            className="site-choice-art site-choice-editor"
            aria-hidden="true"
          >
            <span className="mock-editor">
              <span className="mock-side">
                <i />
                <i />
                <i className="on" />
                <i />
                <i />
              </span>
              <span className="mock-canvas">
                <span className="mock-hero" />
                <span className="mock-line" />
                <span className="mock-line short" />
                <span className="mock-row">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
              <span className="mock-cursor">
                <PenLine size={14} />
              </span>
            </span>
          </span>
          <span className="site-choice-body">
            <span className="site-choice-icon">
              <PenLine size={20} />
            </span>
            <strong>Modifier mon site</strong>
            <span className="site-choice-text">
              Textes, photos, couleurs, pages et sections : tout se règle dans
              l’éditeur, avec un aperçu en direct.
            </span>
            <span className="site-choice-meta">
              {dirty
                ? "Brouillon en cours"
                : "Aperçu ordinateur, tablette et mobile"}
            </span>
            <span className="site-choice-cta">
              Ouvrir l’éditeur <ArrowRight size={17} />
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

export function TemplatesPanel({
  demo,
  apply,
  back,
  dirty = false,
}: {
  demo: boolean;
  apply: (template: SiteTemplate, composition: boolean) => void;
  back: () => void;
  dirty?: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SiteTemplate | null>(null);
  const [composition, setComposition] = useState(true);
  const visible = siteTemplates.filter(
    (t) =>
      (filter === "all" || (filter === "premium" ? t.premium : !t.premium)) &&
      `${t.name} ${t.category}`
        .toLocaleLowerCase("fr")
        .includes(query.toLocaleLowerCase("fr").trim()),
  );
  return (
    <section className="template-shop">
      <button className="tpl-back" onClick={back}>
        <ArrowLeft size={16} />
        Mon site web
      </button>
      <header className="tpl-heading">
        <span className="shop-eyebrow">BOUTIQUE DE MODÈLES</span>
        <h1>Un site qui vous ressemble.</h1>
        <p>
          Choisissez un point de départ, puis faites-en votre propre adresse :
          chaque modèle se personnalise entièrement.
        </p>
      </header>
      {dirty && (
        <p className="shop-draft-note">
          Vos modifications en cours sont conservées dans le brouillon.
        </p>
      )}
      <div className="tpl-toolbar">
        <div
          className="tpl-filters"
          role="group"
          aria-label="Filtrer les modèles"
        >
          {(
            [
              ["all", "Tous", siteTemplates.length],
              ["free", "Gratuits", free],
              ["premium", "Premium", premium],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "premium" && <Crown size={13} />}
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>
        <label className="tpl-search">
          <Search size={16} />
          <input
            aria-label="Rechercher un modèle"
            placeholder="Bistrot, café, cuisine…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="tpl-count" role="status">
        {visible.length} modèle{visible.length > 1 ? "s" : ""}
      </p>
      <div className="tpl-grid">
        {visible.map((t) => (
          <article className="tpl-card" key={t.id} style={templateVars(t)}>
            <button
              className="tpl-stage"
              aria-label={`Aperçu de ${t.name}`}
              onClick={() => setSelected(t)}
            >
              <span className={`tpl-badge ${t.premium ? "premium" : ""}`}>
                {t.premium ? (
                  <>
                    <Crown size={12} /> Premium
                  </>
                ) : (
                  "Gratuit"
                )}
              </span>
              <TemplatePreview template={t} />
              <span className="tpl-peek">
                <Eye size={15} /> Aperçu
              </span>
            </button>
            <div className="tpl-card-body">
              <span className="tpl-category">{t.category}</span>
              <h3>{t.name}</h3>
              <p>{t.description}</p>
              <ul className="tpl-features">
                {t.features.slice(0, 3).map((f) => (
                  <li key={f}>
                    <Check size={13} />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="tpl-card-foot">
                <span className="tpl-swatches" aria-hidden="true">
                  <i style={{ background: t.theme.colors.primary }} />
                  <i style={{ background: t.theme.colors.background }} />
                </span>
                <span className="tpl-price">
                  {t.premium ? "Dès 9 €" : "Inclus"}
                </span>
                <button className="tpl-choose" onClick={() => setSelected(t)}>
                  Choisir <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="shop-empty">
          <h3>Aucun modèle trouvé</h3>
          <p>Essayez un autre mot ou explorez toute la collection.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          >
            Voir tous les modèles
          </Button>
        </div>
      )}
      <div className="tpl-included">
        <span className="tpl-included-icon">
          <Check size={18} />
        </span>
        <div>
          <strong>Les pages essentielles sont déjà là</strong>
          <p>
            Accueil, histoire, galerie, carte, contact, avis et réservation. Vos
            parcours de commande, panier, compte client et QR restent connectés
            à votre établissement.
          </p>
          <small>
            Les informations légales restent à compléter. Les modèles premium
            sont proposés à partir de 9 € ; leur achat sera disponible
            prochainement.
          </small>
        </div>
      </div>
      {selected && (
        <Modal
          title={selected.name}
          description={`${selected.category} · ${selected.premium ? "Premium, à partir de 9 €" : "Modèle gratuit"}`}
          close={() => setSelected(null)}
        >
          <div className="tpl-modal-stage" style={templateVars(selected)}>
            <TemplatePreview template={selected} />
          </div>
          <p>{selected.description}</p>
          <ul className="tpl-features">
            {selected.features.map((f) => (
              <li key={f}>
                <Check size={14} /> {f}
              </li>
            ))}
          </ul>
          <label className="shop-apply-option">
            <input
              type="checkbox"
              checked={composition}
              onChange={(e) => setComposition(e.target.checked)}
            />
            <span>
              Utiliser la composition de l’accueil
              <small>
                Remplace le titre et la photo d’accueil, et réorganise ses
                sections. Décochez pour changer uniquement les couleurs et les
                polices, la composition visuelle et les interactions.
              </small>
            </span>
          </label>
          <p className="muted">
            Votre identité, vos autres pages et vos données sont conservées. Le
            changement reste dans le brouillon et peut être annulé.
          </p>
          <div className="actions">
            <Button
              disabled={selected.premium && !demo}
              onClick={() => {
                apply(selected, composition);
                setSelected(null);
              }}
            >
              {selected.premium
                ? demo
                  ? "Essayer ce modèle en démo"
                  : "Achat bientôt disponible"
                : "Choisir ce modèle"}
              <ArrowRight size={16} />
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Continuer à explorer
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
