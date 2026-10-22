/**
 * 📋 สรุปงาน — ส่วนฝั่งเซิร์ฟเวอร์ (ดึงข้อมูลใบงานจริงมาวาดสรุป เช่น ตอนส่งอีเมล)
 * หน้าจอใช้ /api/design-sheets?ids= อยู่แล้ว · ไฟล์นี้ให้ API ที่ต้องวาดสรุปเองบนเซิร์ฟเวอร์ (ห้าม import ฝั่ง client)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { buildStatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import type { SummarySheetInfo } from "@/lib/design-sheet-summary";

type Admin = ReturnType<typeof supabaseAdmin>;

const excerpt = (html: string | null | undefined, max = 160): string | null => {
  if (!html) return null;
  const t = html.replace(/<(br|\/p|\/div|\/li|\/h[1-6])>/gi, " ").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max).trimEnd()}…` : t) : null;
};

export async function loadSummarySheets(admin: Admin, ids: string[]): Promise<Map<string, SummarySheetInfo>> {
  const map = new Map<string, SummarySheetInfo>();
  if (ids.length === 0) return map;
  const [{ data: st }, { data: rows }] = await Promise.all([
    admin.from("erp_workflow_states").select("state_key, label, color, is_terminal, customer_only").eq("entity_type", "design_sheet").order("sort_order"),
    admin.from("design_sheets").select("id, code, name, status, deadline, note, detail, updated_at, brand:brands!brand_id(name, color)").in("id", ids.slice(0, 200)),
  ]);
  const meta = buildStatusMeta((st ?? []) as WfStatusRow[]);
  for (const r of (rows ?? []) as Record<string, unknown>[]) {
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string | null; color?: string | null } | null;
    const status = String(r.status ?? "design");
    map.set(String(r.id), {
      id: String(r.id), code: String(r.code ?? ""), name: String(r.name ?? ""), brand_name: b?.name ?? null, brand_color: b?.color ?? null,
      status, status_label: meta.map[status]?.label ?? status, status_color: meta.colorHex[status] ?? "#94a3b8", closed: meta.finished.has(status),
      deadline: (r.deadline as string) ?? null, updated_at: String(r.updated_at ?? new Date().toISOString()),
      note: (r.note as string) ?? null, detail_excerpt: excerpt(r.detail as string | null),
    });
  }
  return map;
}
