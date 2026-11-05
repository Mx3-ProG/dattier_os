import "@/components/platform/platform.css";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <main className="platform">
      <h1>atacuisine, logiciel libre</h1>
      <p>
        Le code de cette version est distribué sous AGPL-3.0, sous réserve des
        notices tierces et des droits sur les contenus.
      </p>
      <p>
        <a
          href={
            process.env.SOURCE_URL || "https://github.com/Mx3-ProG/dattier_os"
          }
        >
          Consulter le dépôt source
        </a>
      </p>
      <p>
        L’exploitant d’une version modifiée doit fournir l’accès au code
        correspondant. Pour une instance modifiée, SOURCE_URL doit pointer vers
        les sources exactes utilisées.
      </p>
    </main>
  );
}
