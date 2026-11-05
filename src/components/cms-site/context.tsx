"use client";
import NextLink from "next/link";
import {
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode,
} from "react";
const Context = createContext<{
  restaurant: string;
  demo: boolean;
  platformOrigin: string;
  preview: boolean;
  shopEnabled: boolean;
}>({
  restaurant: "",
  demo: false,
  platformOrigin: "",
  preview: false,
  shopEnabled: true,
});
export function TenantSiteProvider({
  restaurant,
  demo = false,
  platformOrigin = "",
  preview = false,
  shopEnabled = true,
  children,
}: {
  restaurant: string;
  demo?: boolean;
  platformOrigin?: string;
  preview?: boolean;
  shopEnabled?: boolean;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ restaurant, demo, platformOrigin, preview, shopEnabled }),
    [restaurant, demo, platformOrigin, preview, shopEnabled],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTenantSite() {
  const context = useContext(Context);
  return useMemo(() => {
    const base = `/r/${encodeURIComponent(context.restaurant)}`;
    function href(path: string) {
      if (
        !context.shopEnabled &&
        /^\/(commander|checkout|panier)([?#]|$)/.test(path)
      )
        path = "/carte";
      if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        path.startsWith("/api/") ||
        path.startsWith("/cms/")
      )
        return path;
      if (path.startsWith("/r/")) return path;
      if (
        context.platformOrigin &&
        ["/compte", "/account", "/panier", "/checkout", "/suivi"].some(
          (p) => path === p || path.startsWith(p + "?"),
        )
      )
        return context.platformOrigin + base + path;
      if (["/demo", "/dashboard", "/platform"].includes(path))
        return `${context.platformOrigin}/restaurant/${context.restaurant}`;
      if (path === "/source") return `${context.platformOrigin}/source`;
      return base + (path === "/" ? "" : path);
    }
    async function request(input: string, init?: RequestInit) {
      let url = input
        .replace("/api/shop/", `/api/store/${context.restaurant}/`)
        .replace("/api/v1/site-media", `/api/cms/${context.restaurant}/media`)
        .replace("/api/v1/site", `/api/cms/${context.restaurant}`);
      if (input === "/api/shop/customer-demo") url = "/api/demo/customer";
      const response = await fetch(url, init);
      if (response.ok) return response;
      let data;
      try {
        data = await response.json();
      } catch {
        data = { error: "Réponse indisponible." };
      }
      return new Response(
        JSON.stringify({
          ...data,
          error:
            typeof data.error === "object" ? data.error.message : data.error,
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    async function shopPost(action: string, body: unknown) {
      if (context.preview)
        throw new Error("Aperçu : aucune opération n’est enregistrée.");
      const response = await request(`/api/shop/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(body as object),
          restaurant: context.restaurant,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result;
    }
    return { ...context, base, href, request, shopPost };
  }, [context]);
}
export function TenantLink({
  href,
  ...props
}: ComponentProps<typeof NextLink>) {
  const tenant = useTenantSite();
  return (
    <NextLink
      {...props}
      href={typeof href === "string" ? tenant.href(href) : href}
    />
  );
}
