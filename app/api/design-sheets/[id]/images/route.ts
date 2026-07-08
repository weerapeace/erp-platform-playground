/**
 * Design Sheets — รวมรูป "ทุกแหล่ง" ในใบงาน (ให้ Wizard สร้าง SKU เลือกรูปได้ครบ)
 *
 * GET /api/design-sheets/[id]/images
 *   รวมรูปจาก 3 แหล่งในคำขอเดียว:
 *     1. แกลเลอรีหลัก      → erp_playground_attachments entity_type='design_sheet'
 *     2. รายละเอียดงาน (Tiptap) → entity_type='design_sheet_detail'
 *     3. คอมเมนต์ลูกค้า     → entity_type='design_sheet_comment' (ผูกกับ comment id)
 *   dedup ด้วย file_path (R2 key) · เรียง: รูปหลักแกลเลอรี → แกลเลอรี → รายละเอียด → คอมเมนต์
 *   คืน [{ key, url, source, source_label, is_primary }]
 * ของกลาง: guardApi products.view · supabaseAdmin (RLS deny-all อ่านผ่าน service role)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DesignSheetImage = {
  key: string; url: string; source: string; source_label: string; is_primary: boolean;
};

// ลำดับความสำคัญของแหล่ง (เลขน้อย = มาก่อน / เก็บไว้ตอน dedup)
const SOURCE_ORDER: Record<string, number> = {
  design_sheet: 0, design_sheet_detail: 1, design_sheet_comment: 2,
};
const SOURCE_LABEL: Record<string, string> = {
  design_sheet: "แกลเลอรีหลัก", design_sheet_detail: "รายละเอียดงาน", design_sheet_comment: "คอมเมนต์ลูกค้า",
};

type AttRow = {
  entity_type: string; file_path: string; content_type: string | null;
  is_primary: boolean; sort_order: number | null; created_at: string;
};

const isImage = (a: AttRow) => String(a.content_type ?? "").startsWith("image/") && !!a.file_path;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  // แหล่ง 1+2: แกลเลอรีหลัก + รายละเอียดงาน (entity_id = รหัสใบงาน)
  const { data: sheetAtts } = await admin.from("erp_playground_attachments")
    .select("entity_type, file_path, content_type, is_primary, sort_order, created_at")
    .in("entity_type", ["design_sheet", "design_sheet_detail"]).eq("entity_id", id);

  // แหล่ง 3: คอมเมนต์ลูกค้า (รูปแนบผูกกับ comment id ไม่ใช่ sheet id)
  const { data: comments } = await admin.from("design_sheet_comments").select("id").eq("sheet_id", id);
  const commentIds = (comments ?? []).map((c) => String((c as { id: string }).id));
  let commentAtts: AttRow[] = [];
  if (commentIds.length > 0) {
    const { data } = await admin.from("erp_playground_attachments")
      .select("entity_type, file_path, content_type, is_primary, sort_order, created_at")
      .eq("entity_type", "design_sheet_comment").in("entity_id", commentIds);
    commentAtts = (data ?? []) as AttRow[];
  }

  const all = [...((sheetAtts ?? []) as AttRow[]), ...commentAtts].filter(isImage);

  // dedup ด้วย file_path — รูปเดียวกันถูกแนบหลายที่ ให้เก็บตัวจากแหล่งลำดับต้นกว่า/เป็นรูปหลัก
  const byKey = new Map<string, AttRow>();
  for (const a of all) {
    const cur = byKey.get(a.file_path);
    if (!cur) { byKey.set(a.file_path, a); continue; }
    const better =
      (SOURCE_ORDER[a.entity_type] ?? 9) < (SOURCE_ORDER[cur.entity_type] ?? 9) ||
      (a.is_primary && !cur.is_primary);
    if (better) byKey.set(a.file_path, a);
  }

  const isGalleryPrimary = (a: AttRow) => a.entity_type === "design_sheet" && !!a.is_primary;
  const list = [...byKey.values()].sort((a, b) => {
    // รูปหลักแกลเลอรีมาก่อนสุด (จะได้เป็นรูปปกอัตโนมัติ)
    const pa = isGalleryPrimary(a) ? 0 : 1, pb = isGalleryPrimary(b) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const sa = SOURCE_ORDER[a.entity_type] ?? 9, sb = SOURCE_ORDER[b.entity_type] ?? 9;
    if (sa !== sb) return sa - sb;
    const oa = a.sort_order ?? 9999, ob = b.sort_order ?? 9999;
    if (oa !== ob) return oa - ob;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

  const data: DesignSheetImage[] = list.map((a) => ({
    key: a.file_path,
    url: `/api/r2-image?key=${encodeURIComponent(a.file_path)}`,
    source: a.entity_type,
    source_label: SOURCE_LABEL[a.entity_type] ?? "อื่น ๆ",
    is_primary: isGalleryPrimary(a),
  }));

  return NextResponse.json({ data, error: null });
}
