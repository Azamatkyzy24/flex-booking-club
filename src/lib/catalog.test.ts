import { describe, expect, it } from "vitest";
import { filterNews, latestImportant, trainerPath, type Announcement } from "./catalog";

const announcement = (id: number, category: string, publication: string, important = false): Announcement => ({
  id, category, publication_date: publication, is_important: important,
  title: `Notice ${id}`, description: "Sample", details: "Sample details", created_at: publication,
  event_date: null, image_url: null, is_demo: true, is_published: true, workout_id: null,
});
const items = [
  announcement(1, "Gym Updates", "2026-11-10T12:00:00Z", true),
  announcement(2, "Upcoming Events", "2026-11-12T12:00:00Z"),
  announcement(3, "Gym Updates", "2026-11-11T12:00:00Z", true),
];

describe("GymFlow catalog rules", () => {
  it("uses existing trainer IDs when no slug is available", () => {
    expect(trainerPath(3, "jordan-blake")).toBe("jordan-blake");
    expect(trainerPath(3, null)).toBe("3");
  });
  it("filters announcements by the chosen category", () => {
    expect(filterNews(items, "Gym Updates").map((a) => a.id)).toEqual([3, 1]);
  });
  it("orders announcements newest first without changing the input", () => {
    expect(filterNews(items).map((a) => a.id)).toEqual([2, 3, 1]);
    expect(items.map((a) => a.id)).toEqual([1, 2, 3]);
  });
  it("selects the latest important notice for Home", () => {
    expect(latestImportant(items)?.id).toBe(3);
    expect(latestImportant([announcement(4, "Upcoming Events", "2026-11-12T12:00:00Z")])).toBeUndefined();
  });
});