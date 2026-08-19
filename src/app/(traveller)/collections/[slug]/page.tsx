import { ContentPageView } from "@/features/traveller/content-page";
import { contentPages } from "@/lib/fixtures/misc";

/**
 * T25 · Collection page, curated rails and editorial from the content service.
 * Prerendered for the same reason as destinations — see that route.
 */
export function generateStaticParams() {
  return contentPages.filter((c) => c.kind === "collection").map((c) => ({ slug: c.slug }));
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ContentPageView slug={slug} kind="collection" />;
}
