/**
 * ของใช้ร่วมของ /api/design-sheet-summaries (แยกจาก route.ts — route ต้อง export แค่ handler)
 */
import type { SavedSummary, SummaryItem } from "@/lib/design-sheet-summary";

/** แถวในฐานข้อมูล → SavedSummary */
export function toSavedSummary(r: Record<string, unknown>): SavedSummary {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    audience: r.audience === "customer" ? "customer" : "internal",
    columns: Array.isArray(r.columns) ? (r.columns as string[]) : [],
    items: Array.isArray(r.items) ? (r.items as SummaryItem[]) : [],
    note: String(r.note ?? ""),
    created_by_name: (r.created_by_name as string) ?? null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}
