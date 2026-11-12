import { Link, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Page } from "./format";

export function CatalogError() {
  const router = useRouter();
  return <Page title="This page couldn’t load"><Button onClick={() => void router.invalidate()}>Try again</Button></Page>;
}
export function CatalogNotFound() {
  return <Page title="Page not found"><Button asChild variant="outline"><Link to="/">Back to Home</Link></Button></Page>;
}