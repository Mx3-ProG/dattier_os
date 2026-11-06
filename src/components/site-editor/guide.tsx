import { useState } from "react";
import { Modal } from "../forms";
import { Button } from "../ui/button";

const steps = [
  {
    title: "Choisir ou créer une page",
    text: "Dans Pages, ouvrez l’accueil ou choisissez Créer une page. Saisissez son titre et vérifiez son adresse. Une nouvelle page reste masquée jusqu’à ce que vous l’activiez avec le bouton en forme d’œil dans Pages et que vous publiiez.",
    tab: "pages",
    action: "Ouvrir Pages",
  },
  {
    title: "Modifier les textes et les images",
    text: "Dans Sections, touchez le nom d’un bloc ou sélectionnez-le dans l’aperçu pour ouvrir ses propriétés. Modifiez les champs disponibles. Un cadenas indique que certains éléments sont protégés, notamment ceux liés au compte et à la commande.",
    tab: "sections",
    action: "Ouvrir Sections",
  },
  {
    title: "Composer la page",
    text: "Ouvrez Ajouter une section et recherchez un bloc, par exemple Texte, Bannière ou Catégories. Le nouveau bloc se place après la sélection ou en bas de la page. Les flèches ↑ et ↓ changent l’ordre, l’œil masque le bloc et la corbeille le retire. Les catégories et les produits proviennent de la boutique.",
    tab: "library",
    action: "Ouvrir la bibliothèque",
  },
  {
    title: "Personnaliser l’identité",
    text: "Dans Identité, modifiez le logo, le bandeau du haut et le pied de page. Dans Couleurs & polices, ajustez le style. Pour présenter le site dans les résultats de recherche, ouvrez Référencement.",
    tab: "brand",
    action: "Ouvrir Identité",
  },
  {
    title: "Vérifier et publier",
    text: "Utilisez les icônes ordinateur, tablette et téléphone pour contrôler la mise en page. Enregistrer garde votre brouillon. Prévisualiser ouvre le dernier brouillon enregistré. Publier rend les changements visibles aux visiteurs. Vous pouvez revenir à une ancienne publication depuis Historique.",
  },
] as const;

export function StudioGuide({
  close,
  openTab,
}: {
  close: () => void;
  openTab: (tab: "pages" | "sections" | "library" | "brand") => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  return (
    <Modal
      title="Créer votre site, étape par étape"
      description={`Étape ${index + 1} sur ${steps.length}`}
      close={close}
    >
      <section className="site-guide-step" aria-live="polite">
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {"tab" in step && (
          <Button
            variant="secondary"
            onClick={() => {
              openTab(step.tab);
              close();
            }}
          >
            {step.action}
          </Button>
        )}
      </section>
      <div className="actions">
        <Button
          variant="ghost"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          Précédent
        </Button>
        <Button
          onClick={() =>
            index === steps.length - 1 ? close() : setIndex(index + 1)
          }
        >
          {index === steps.length - 1 ? "Terminer" : "Suivant"}
        </Button>
      </div>
    </Modal>
  );
}
