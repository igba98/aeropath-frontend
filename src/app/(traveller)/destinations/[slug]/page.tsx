import { ContentPageView } from "@/features/traveller/content-page";
import { contentPages } from "@/lib/fixtures/misc";

/**
 * T24 · Destination landing page, generated from the content service.
 *
 * A server component so the slugs can be prerendered: without `generateStaticParams` the route
 * stays dynamic and Next's link prefetch 404s on every traveller page that links here.
 */
export function generateStaticParams() {
  return contentPages.filter((c) => c.kind === "destination").map((c) => ({ slug: c.slug }));
}

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ContentPageView slug={slug} kind="destination" />;
}
