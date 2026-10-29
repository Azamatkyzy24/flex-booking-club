import { useSyncExternalStore } from "react";
import { makeSeed, type GymState } from "./gym";

const KEY = "gymflow-v1";
let state: GymState | null = null;
const listeners = new Set<() => void>();

function load(): GymState {
  if (!state) {
    try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : makeSeed(); }
    catch { state = makeSeed(); }
  }
  return state!;
}

export function setGym(next: GymState) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
export const getGym = () => load();

export function resetGym() { setGym(makeSeed()); }

/** Returns null during SSR/hydration, then the persisted state. */
export function useGym(): GymState | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    load,
    () => null,
  );
}
