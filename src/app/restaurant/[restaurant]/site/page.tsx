import { WebsiteStudio } from "@/components/site-editor/entry";
import { demoEnabled } from "@/infrastructure/database/db";
import { restaurantAdminContext } from "@/features/platform/admin-context";
import { notFound, redirect } from "next/navigation";
import "@/app/site-editor.css";
import "@/app/site-sections.css";
export default async function Page({
  params,
}: {
  params: Promise<{ restaurant: string }>;
}) {
  const { restaurant } = await params;
  const access = await restaurantAdminContext(restaurant).catch(
    (error: unknown) => {
      if (error instanceof Error && error.message === "Connexion requise.") {
        redirect(
          "/connexion?returnTo=" +
            encodeURIComponent(
              "/restaurant/" + encodeURIComponent(restaurant) + "/site",
            ),
        );
      }
      if (
        error instanceof Error &&
        [
          "Établissement non autorisé.",
          "Compte suspendu ou non autorisé.",
        ].includes(error.message)
      )
        notFound();
      throw error;
    },
  );
  return (
    <WebsiteStudio
      restaurant={restaurant}
      restaurantName={access.restaurantName}
      industry={access.activity.industry}
      plan={access.plan}
      userRoles={access.roles}
      addons={access.addons}
      demo={demoEnabled()}
    />
  );
}
