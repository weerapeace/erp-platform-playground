/**
 * 🗂️ บันทึกประวัติการใช้ตัวแยกไฟล์ ERP 1 งาน — POST /api/file-sort/log   (สิทธิ์ assets.upload)
 *
 * body { name, profile?: "artwork"|"product"|"content", variant?: "new"|"color"|"edit" (product), brand_id?, artwork_type?, asset_id?, batch_id?, album_id? (content),
 *        nas_folder?, nas_custom? (เลือกที่เก็บ Z: เอง), drive_link?,
 *        mode: "move"|"copy" (artwork) | "replace"|"append" (product) · content ไม่แตะต้นฉบับเสมอ,
 *        counts?: { nas?, drive?, erp?, album?, moved?, removed?, skipped?, already?, failed? }, moves?: [{ what, from, to, how, files }] (ย้าย Rawfiles/Images · เก็บเข้า Collection),
 *        run_id? (รหัสครั้งที่ใช้ — ผูกกับการย้ายกลับ), model? (รหัสรุ่น/ชื่องาน), parent_ids? (สินค้าที่ลงรูป — กล่องประวัติในหน้างานหาด้วยตัวนี้),
 *        status?: "done"|"partial"|"failed", errors?: string[], source_folder?, app_version? }
 *   event: "undo" = กด "ย้ายกลับที่เดิม" ในโปรแกรม → body { event:"undo", run_id, name, model?, parent_ids?, profile?, variant?, undone:[{ what, from, to, files }], errors? }
 * → เขียน audit_logs action = file_sort.upload | file_sort.undo (ใครทำ · เมื่อไหร่ · งานไหน · ย้ายอะไรไปไหน · พลาดอะไร)
 *   ดูได้ที่ Task Manager › ประวัติไฟล์ (/api/file-sort/history) + หน้าประวัติการใช้งานรวม
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().toLowerCase()).filter((x) => UUID.test(x)))].slice(0, 20);
const moveList = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 10).map((m) => {
  const x = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
  return { what: str(x.what, 20), from: str(x.from, 400), to: str(x.to, 400), how: str(x.how, 20), files: num(x.files) };
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "assets.upload"); if (denied) return denied;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = str(b.name, 200);
  if (!name) return NextResponse.json({ error: "ต้องมีชื่องาน" }, { status: 400 });
  const c = (b.counts && typeof b.counts === "object" ? b.counts : {}) as Record<string, unknown>;
  const errors = (Array.isArray(b.errors) ? b.errors : []).map((e) => str(e, 300)).filter(Boolean).slice(0, 30);

  const profile = b.profile === "product" || b.profile === "content" ? b.profile : "artwork";
  const variant = profile === "product" ? (b.variant === "color" || b.variant === "edit" ? b.variant : "new") : null;
  const ident = { name, model: str(b.model, 120) ?? name, run_id: str(b.run_id, 64), parent_ids: uuids(b.parent_ids), profile, variant };

  if (b.event === "undo") {
    if (!ident.run_id) return NextResponse.json({ error: "ต้องมีรหัสครั้งที่ใช้ (run_id)" }, { status: 400 });
    const ok = await writeAuditFor(request, supabaseAdmin(), {
      action: "file_sort.undo", entityType: profile === "content" ? "content_album" : "assets", entityId: null,
      metadata: { ...ident, undone: moveList(b.undone), errors, app_version: str(b.app_version, 40) },
    });
    if (!ok) return NextResponse.json({ error: "บันทึกประวัติไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ ok: true, error: null });
  }

  const ok = await writeAuditFor(request, supabaseAdmin(), {
    action: "file_sort.upload",
    entityType: profile === "content" ? "content_album" : "assets",
    entityId: profile === "content" ? str(b.album_id, 64) : str(b.asset_id, 64),
    metadata: {
      ...ident,
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
      status: b.status === "done" || b.status === "partial" || b.status === "failed" ? b.status : null,
      counts: { nas: num(c.nas), drive: num(c.drive), erp: num(c.erp), album: num(c.album), moved: num(c.moved), removed: num(c.removed), skipped: num(c.skipped), already: num(c.already), failed: num(c.failed) },
      // ย้ายโฟลเดอร์ (งานสินค้า) — what: raw/images = Rawfiles/Images · collection = ทั้งโฟลเดอร์เข้า Collection
      //   how: rename = ย้ายบน Z: · merge = รวมเข้ารุ่นที่มีใน Collection แล้ว (ไม่ทับ) · copy = ก๊อปจากเครื่อง · copy+trash = ก๊อปแล้วต้นฉบับลงถังขยะ
      moves: moveList(b.moves),
      errors,
      app_version: str(b.app_version, 40),
    },
  });
  if (!ok) return NextResponse.json({ error: "บันทึกประวัติไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
