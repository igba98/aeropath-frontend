import type { ContentPage, Vertical } from "@/lib/domain/types";

/**
 * M02 home rails and M06 banners are configuration, but the only persistence contract the
 * prototype exposes for merchandising is `admin.upsertContent`. So both live on a
 * `kind: "landing"` content page (slugs `home` and `banners`) and their targeting rules are
 * carried as JSON inside the block `body`. That keeps one write path and one audit trail.
 */

export const HOME_SLUG = "home";
export const BANNERS_SLUG = "banners";

export type RailAudience = "all" | "consumer" | "agent" | "corporate";

export interface RailRules {
  enabled: boolean;
  audience: RailAudience;
  vertical: "all" | Vertical;
  region: string;
  note: string;
}

export const DEFAULT_RAIL_RULES: RailRules = { enabled: true, audience: "all", vertical: "all", region: "All regions", note: "" };

export function parseRailRules(body: string | undefined): RailRules {
  if (!body) return { ...DEFAULT_RAIL_RULES };
  try {
    const raw = JSON.parse(body) as Partial<RailRules>;
    return {
      enabled: raw.enabled ?? true,
      audience: raw.audience ?? "all",
      vertical: raw.vertical ?? "all",
      region: raw.region ?? "All regions",
      note: raw.note ?? "",
    };
  } catch {
    return { ...DEFAULT_RAIL_RULES, note: body };
  }
}

export const serialiseRailRules = (r: RailRules) => JSON.stringify(r);

export type BannerPlacement = "home_top" | "search_results" | "checkout" | "my_trips" | "partner_portal";

export const BANNER_PLACEMENTS: Array<{ id: BannerPlacement; label: string; where: string }> = [
  { id: "home_top", label: "Home · above the fold", where: "Traveller home, under the search widget" },
  { id: "search_results", label: "Search results", where: "Between the first and second result row" },
  { id: "checkout", label: "Checkout", where: "Review and pay, above the price breakdown" },
  { id: "my_trips", label: "My trips", where: "Top of the traveller trip list" },
  { id: "partner_portal", label: "Partner portal", where: "Agent and supplier console header" },
];

export interface BannerConfig {
  enabled: boolean;
  placement: BannerPlacement;
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  audience: RailAudience;
  message: string;
  ctaLabel: string;
  ctaHref: string;
  tone: string;
}

export const DEFAULT_BANNER: BannerConfig = {
  enabled: true,
  placement: "home_top",
  from: new Date().toISOString().slice(0, 10),
  to: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  audience: "all",
  message: "",
  ctaLabel: "See offers",
  ctaHref: "/collections/bush-and-beach",
  tone: "from-brand-700 via-brand-500 to-brand-300",
};

export function parseBanner(body: string | undefined): BannerConfig {
  if (!body) return { ...DEFAULT_BANNER };
  try {
    const raw = JSON.parse(body) as Partial<BannerConfig>;
    return { ...DEFAULT_BANNER, ...raw };
  } catch {
    return { ...DEFAULT_BANNER, message: body };
  }
}

export const serialiseBanner = (b: BannerConfig) => JSON.stringify(b);

export function bannerLive(b: BannerConfig, now = new Date()): boolean {
  if (!b.enabled) return false;
  const from = new Date(b.from + "T00:00:00Z").getTime();
  const to = new Date(b.to + "T23:59:59Z").getTime();
  const t = now.getTime();
  return t >= from && t <= to;
}

/** A blank page shell used when the home/banners config page does not exist yet. */
export function emptyLandingPage(slug: string, title: string, subtitle: string): Omit<ContentPage, "id" | "updatedAt"> {
  return {
    kind: "landing",
    slug,
    title,
    subtitle,
    heroTone: "from-brand-700 via-brand-500 to-brand-300",
    status: "published",
    blocks: [],
    seo: { title, description: subtitle },
  };
}
