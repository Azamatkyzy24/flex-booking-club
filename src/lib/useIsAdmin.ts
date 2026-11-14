import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGym } from "@/lib/store";
 
// The generated Supabase types don't know about is_admin() yet (same as admin.tsx).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
 
/** true only when the signed-in account has the 'admin' role (migration 0010).
 *  False when signed out or if migration 0010 is not applied yet. */
export async function fetchIsAdmin(): Promise<boolean> {
  const { data, error } = await db.rpc("is_admin");
  return !error && data === true;
}
 
export function useIsAdmin() {
  const g = useGym();
  const q = useQuery({
    queryKey: ["is-admin", g?.email ?? ""],
    queryFn: fetchIsAdmin,
    enabled: !!g,
    staleTime: 5 * 60_000,
  });
  return { isAdmin: q.data ?? false };
}
 