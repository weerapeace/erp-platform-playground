/**
 * 🗂️ บันทึกประวัติการใช้ตัวแยกไฟล์ ERP 1 งาน — POST /api/file-sort/log   (สิทธิ์ assets.upload)
 *
 * body { name, profile?: "artwork"|"product"|"content", variant?: "new"|"color"|"edit" (product), brand_id?, artwork_type?, asset_id?, batch_id?, album_id? (content),
 *        nas_folder?, nas_custom? (เลือกที่เก็บ Z: เอง), drive_link?,
 *        mode: "move"|"copy" (artwork) | "replace"|"append" (product) · content ไม่แตะต้นฉบับเสมอ,
 *        counts?: { nas?, drive?, erp?, album?, moved?, removed?, skipped?, already?, failed? }, moves?: [{ what, from, to, how, files }] (ย้าย Rawfiles/Images · เก็บเข้า Collection),
 *        errors?: string[], source_folder?, app_version? }
 * → เขียน audit_logs action = file_sort.upload (ใครทำ · เมื่อไหร่ · งานไหน · ไปที่ไหนกี่ไฟล์ · พลาดอะไร)
 * โปรแกรมเรียกหลังจบงานทุกครั้ง (สำเร็จ/พลาดบางส่วนก็เรียก) — ไม่แก้ข้อมูลอื่น
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditFor } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = str(b.name, 200);
  if (!name) return NextResponse.json({ error: "ต้องมีชื่องาน" }, { status: 400 });
  const c = (b.counts && typeof b.counts === "object" ? b.counts : {}) as Record<string, unknown>;
  const errors = (Array.isArray(b.errors) ? b.errors : []).map((e) => str(e, 300)).filter(Boolean).slice(0, 30);

  const profile = b.profile === "product" || b.profile === "content" ? b.profile : "artwork";
  const ok = await writeAuditFor(request, supabaseAdmin(), {
    action: "file_sort.upload",
    entityType: profile === "content" ? "content_album" : "assets",
    entityId: profile === "content" ? str(b.album_id, 64) : str(b.asset_id, 64),
    metadata: {
      name,
      profile,
      variant: profile === "product" ? (b.variant === "color" || b.variant === "edit" ? b.variant : "new") : null,
      brand_id: str(b.brand_id, 64),
      artwork_type: str(b.artwork_type, 100),
      // artwork: move/copy (ต้นฉบับ) · product: replace/append (รูปเดิมของสินค้า) · content: copy — สองอย่างหลังไม่แตะต้นฉบับเสมอ
      mode: profile === "product" ? (b.mode === "append" ? "append" : "replace") : profile === "content" ? "copy" : b.mode === "move" ? "move" : "copy",
      batch_id: str(b.batch_id, 64),
      album_id: str(b.album_id, 64),
      nas_folder: str(b.nas_folder, 400),
      nas_custom: b.nas_custom === true,
      drive_link: str(b.drive_link, 400),
      source_folder: str(b.source_folder, 400),
      counts: { nas: num(c.nas), drive: num(c.drive), erp: num(c.erp), album: num(c.album), moved: num(c.moved), removed: num(c.removed), skipped: num(c.skipped), already: num(c.already), failed: num(c.failed) },
      // ย้ายโฟลเดอร์ (งานสินค้า) — what: raw/images = Rawfiles/Images · collection = ทั้งโฟลเดอร์เข้า Collection
      //   how: rename = ย้ายบน Z: · merge = รวมเข้ารุ่นที่มีใน Collection แล้ว (ไม่ทับ) · copy = ก๊อปจากเครื่อง · copy+trash = ก๊อปแล้วต้นฉบับลงถังขยะ
      moves: (Array.isArray(b.moves) ? b.moves : []).slice(0, 10).map((m) => {
        const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
        return { what: str(x.what, 20), from: str(x.from, 400), to: str(x.to, 400), how: str(x.how, 20), files: num(x.files) };
      }),
      errors,
      app_version: str(b.app_version, 40),
    },
  });
  if (!ok) return NextResponse.json({ error: "บันทึกประวัติไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
