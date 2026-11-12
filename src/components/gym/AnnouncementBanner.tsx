import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { latestImportant, newsQuery } from "@/lib/catalog";
import { Button } from "@/components/ui/button";

export function AnnouncementBanner() {
  const { data } = useQuery(newsQuery);
  const announcement = latestImportant(data ?? []);
  if (!announcement) return null;
  return <aside className="flex flex-wrap items-center gap-4 border-y border-primary/30 bg-primary/5 px-4 py-4">
    <Megaphone className="h-5 w-5 shrink-0 text-primary" />
    <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-primary">{announcement.is_demo ? "Demo announcement" : "Important announcement"}</p>
      <p className="font-bold">{announcement.title}</p></div>
    <Button asChild variant="outline" size="sm"><Link to="/news/$id" params={{ id: String(announcement.id) }}>Read More</Link></Button>
  </aside>;
}