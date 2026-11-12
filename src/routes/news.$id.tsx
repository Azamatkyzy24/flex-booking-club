import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/gym/format";
import { CatalogError, CatalogNotFound } from "@/components/gym/CatalogState";
import { newsQuery, catalogHead } from "@/lib/catalog";
import { useGym } from "@/lib/store";

export const Route = createFileRoute("/news/$id")({
  ssr: false,
  loader: async ({ context, params }) => {
    const announcements = await context.queryClient.ensureQueryData(newsQuery);
    const a = announcements.find((x) => String(x.id) === params.id);
    if (!a) throw notFound();
    return a;
  },
  head: ({ loaderData }) => ({ ...catalogHead(loaderData?.title ?? "Announcement", loaderData?.description ?? "Read the latest GymFlow announcement."),
    ...(loaderData?.image_url?.startsWith("https://") ? { meta: [...catalogHead(loaderData.title, loaderData.description).meta,
      { property: "og:image", content: loaderData.image_url }, { name: "twitter:image", content: loaderData.image_url }] } : {}),
  }),
  component: NewsDetail,
  errorComponent: CatalogError,
  notFoundComponent: CatalogNotFound,
});

function NewsDetail() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(newsQuery);
  const g = useGym();
  const a = data.find((x) => String(x.id) === id);
  if (!a) return <CatalogNotFound />;
  const workout = g?.sessions.find((s) => s.id === String(a.workout_id));
  const format = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return <Page title={a.title}>
    <Button asChild variant="ghost" className="mb-6"><Link to="/news">← All news</Link></Button>
    <article className="max-w-3xl">
      <div className="flex flex-wrap gap-2"><Badge variant="secondary">{a.category}</Badge>{a.is_important && <Badge>Important</Badge>}{a.is_demo && <Badge variant="outline">Demo announcement · not an operational notice</Badge>}</div>
      <p className="mt-4 text-sm text-muted-foreground">Published {format(a.publication_date)}</p>
      {a.event_date && <p className="mt-2 text-primary">Event date: {format(a.event_date)}</p>}
      {a.image_url && <img src={a.image_url} alt={a.title} className="mt-6 aspect-[2/1] w-full rounded-2xl object-cover" />}
      <p className="mt-6 text-lg font-semibold">{a.description}</p>
      <p className="mt-5 whitespace-pre-line leading-relaxed text-muted-foreground">{a.details}</p>
      {workout && <div className="mt-8 border-t border-border pt-5"><p className="text-sm text-muted-foreground">Associated workout</p>
        <Button asChild variant="outline" className="mt-2"><Link to="/book/$id" params={{ id: workout.id }}>{workout.name}</Link></Button>
      </div>}
    </article>
  </Page>;
}