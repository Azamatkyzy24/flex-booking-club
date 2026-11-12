import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/gym/format";
import { CatalogError, CatalogNotFound } from "@/components/gym/CatalogState";
import { newsQuery, newsCategories, filterNews, catalogHead } from "@/lib/catalog";

export const Route = createFileRoute("/news/")({
  ssr: false,
  validateSearch: (input: Record<string, unknown>): { category?: typeof newsCategories[number] | undefined } => ({ category: z.enum(newsCategories).optional().catch(undefined).parse(input["category"]) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(newsQuery),
  head: () => catalogHead("News", "GymFlow announcements, gym updates, upcoming events and special activities."),
  component: News,
  errorComponent: CatalogError,
  notFoundComponent: CatalogNotFound,
});

export const newsDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function News() {
  const { data } = useSuspenseQuery(newsQuery);
  const { category } = Route.useSearch();
  const navigate = useNavigate({ from: "/news/" });
  const announcements = filterNews(data, category);
  return <Page title="News">
    <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="News category">
      <Button variant={!category ? "default" : "outline"} onClick={() => void navigate({ search: {} })} aria-pressed={!category}>All</Button>
      {newsCategories.map((c) => <Button key={c} variant={category === c ? "default" : "outline"} aria-pressed={category === c}
        onClick={() => void navigate({ search: { category: c } })}>{c}</Button>)}
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {announcements.map((a) => <article key={a.id} className="overflow-hidden rounded-2xl border border-border bg-card">
        {a.image_url && <img src={a.image_url} alt={a.title} className="aspect-[2/1] w-full object-cover" />}
        <div className="p-5"><div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{a.category}</Badge>{a.is_important && <Badge>Important</Badge>}{a.is_demo && <span className="text-xs text-muted-foreground">Demo announcement</span>}</div>
          <p className="mt-3 text-xs text-muted-foreground">Published {newsDate(a.publication_date)}</p>
          <h2 className="mt-2 text-xl font-bold"><Link to="/news/$id" params={{ id: String(a.id) }} className="hover:text-primary">{a.title}</Link></h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.description}</p>
          {a.event_date && <p className="mt-3 text-sm text-primary">Event: {newsDate(a.event_date)}</p>}
          <Button asChild variant="outline" className="mt-5"><Link to="/news/$id" params={{ id: String(a.id) }}>Read More</Link></Button>
        </div>
      </article>)}
    </div>
    {!announcements.length && <p className="text-muted-foreground">No announcements in this category.</p>}
  </Page>;
}