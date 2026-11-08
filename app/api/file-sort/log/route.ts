/**
 * 🗂️ บันทึกประวัติการใช้ตัวแยกไฟล์ ERP 1 งาน — POST /api/file-sort/log   (สิทธิ์ assets.upload)
 *
 * body { name, profile?: "artwork"|"product", brand_id?, artwork_type?, asset_id?, batch_id?, nas_folder?, drive_link?,
 *        mode: "move"|"copy" (artwork) | "replace"|"append" (product),
 *        counts?: { nas?, drive?, erp?, removed?, skipped?, already?, failed? }, errors?: string[], source_folder?, app_version? }
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

  const ok = await writeAuditFor(request, supabaseAdmin(), {
    action: "file_sort.upload",
    entityType: "assets",
    entityId: str(b.asset_id, 64),
    metadata: {
      name,
      profile: b.profile === "product" ? "product" : "artwork",
      brand_id: str(b.brand_id, 64),
      artwork_type: str(b.artwork_type, 100),
      // artwork: move/copy (ต้นฉบับ) · product: replace/append (รูปเดิมของสินค้า — ต้นฉบับไม่ถูกแตะเสมอ)
      mode: b.profile === "product" ? (b.mode === "append" ? "append" : "replace") : b.mode === "move" ? "move" : "copy",
      batch_id: str(b.batch_id, 64),
      nas_folder: str(b.nas_folder, 400),
      drive_link: str(b.drive_link, 400),
      source_folder: str(b.source_folder, 400),
      counts: { nas: num(c.nas), drive: num(c.drive), erp: num(c.erp), removed: num(c.removed), skipped: num(c.skipped), already: num(c.already), failed: num(c.failed) },
      errors,
      app_version: str(b.app_version, 40),
    },
  });
  if (!ok) return NextResponse.json({ error: "บันทึกประวัติไม่สำเร็จ" }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
