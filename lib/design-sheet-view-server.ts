/**
 * Design sheet แบบดูอย่างเดียว — โหลดข้อมูลฝั่งเซิร์ฟเวอร์ (ใช้ใน API เท่านั้น · ชนิดข้อมูลดู lib/design-sheet-view)
 *   loadSheetCards = การ์ดเล็กหลายใบ (เรียงตาม ids ที่ส่งมา · ใบที่ถูกลบไปแล้ว = ข้าม)
 *   loadSheetView  = รูปทั้งหมด + รายละเอียด + comment ลูกค้า (ไม่มีราคาโดยตั้งใจ)
 * รูป = ระบบแนบไฟล์กลาง erp_playground_attachments (entity design_sheet / design_sheet_comment) · ปก = designSheetCoverMap
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { designSheetCoverMap } from "@/lib/design-sheet-covers";
import type { DesignSheetCard, DesignSheetView } from "@/lib/design-sheet-view";

type Db = ReturnType<typeof supabaseAdmin>;
type SheetRow = { id: string; code: string | null; name: string | null; status: string | null; detail?: string | null; brand: { name: string | null } | { name: string | null }[] | null };

const brandName = (b: SheetRow["brand"]) => (Array.isArray(b) ? b[0]?.name : b?.name) ?? null;

export async function loadSheetCards(admin: Db, ids: string[]): Promise<DesignSheetCard[]> {
  if (!ids.length) return [];
  const [{ data }, covers] = await Promise.all([
    admin.from("design_sheets").select("id, code, name, status, brand:brands!brand_id(name)").in("id", ids),
    designSheetCoverMap(admin, ids),
  ]);
  const byId = new Map(((data ?? []) as unknown as SheetRow[]).map((r) => [String(r.id), r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [{ id, code: r.code ?? "", name: r.name ?? "", status: r.status ?? "", brand_name: brandName(r.brand), cover_url: covers.get(id) ?? null }];
  });
}

export async function loadSheetView(admin: Db, id: string): Promise<DesignSheetView | null> {
  const { data: row } = await admin.from("design_sheets").select("id, code, name, status, detail, brand:brands!brand_id(name)").eq("id", id).maybeSingle();
  if (!row) return null;
  const r = row as unknown as SheetRow;
  const [{ data: imgs }, { data: cms }] = await Promise.all([
    admin.from("erp_playground_attachments").select("public_url, content_type")
      .eq("entity_type", "design_sheet").eq("entity_id", id)
      .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("design_sheet_comments").select("id, comment_date, body, created_at")
      .eq("sheet_id", id).order("comment_date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
  ]);
  const comments = (cms ?? []) as Array<{ id: string; comment_date: string | null; body: string | null }>;
  const cmImages = new Map<string, string[]>();
  if (comments.length) {
    const { data: atts } = await admin.from("erp_playground_attachments").select("entity_id, public_url, content_type")
      .eq("entity_type", "design_sheet_comment").in("entity_id", comments.map((c) => String(c.id)))
      .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    for (const a of (atts ?? []) as Array<{ entity_id: string; public_url: string; content_type: string | null }>) {
      if (!String(a.content_type ?? "").startsWith("image/")) continue;
      const k = String(a.entity_id);
      cmImages.set(k, [...(cmImages.get(k) ?? []), String(a.public_url)]);
    }
  }
  const images = ((imgs ?? []) as Array<{ public_url: string; content_type: string | null }>)
    .filter((a) => String(a.content_type ?? "").startsWith("image/")).map((a) => String(a.public_url));
  return {
    id, code: r.code ?? "", name: r.name ?? "", status: r.status ?? "", brand_name: brandName(r.brand),
    cover_url: images[0] ?? null, detail_html: r.detail ?? "", images,
    comments: comments.map((c) => ({ id: String(c.id), date: c.comment_date, body: c.body ?? "", images: cmImages.get(String(c.id)) ?? [] })),
  };
}
