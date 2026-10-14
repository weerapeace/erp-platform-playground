/**
 * บันทึกว่า "รูปในคลังไฟล์ ถูกใช้บนผืนผ้าใบอิสระของหน้าไหน" (asset_usages)
 * → คลังไฟล์กันลบรูป/ของตกแต่งที่ยังขึ้นเว็บอยู่ (DELETE /api/assets/[id] ตอบ 409 พร้อมบอกจำนวนที่ใช้)
 *
 * เรียกตอนบันทึกร่าง (field "draft") และเผยแพร่ (field "live") ของหน้าแรก/หน้าเว็บ
 * + แม่แบบผืน (module "website_canvas_template", field "data") — ลบแม่แบบ = ส่ง blocks ว่าง
 * รูปที่ไม่ได้อยู่ในคลัง (เช่น key เก่าที่ไม่ได้นำเข้า) ข้ามไปเงียบ ๆ — ไม่ทำให้บันทึกพัง
 */
import { canvasImageKeys } from "@/lib/website-canvas";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export async function syncCanvasAssetUsages(
  sb: Admin,
  opts: { module: "website_home" | "website_page" | "website_canvas_template"; recordId: string; recordLabel: string; field: "draft" | "live" | "data"; blocks: unknown }
): Promise<void> {
  try {
    const { module, recordId, recordLabel, field } = opts;
    await sb.from("asset_usages").delete().eq("module", module).eq("record_id", recordId).eq("field", field);
    const keys = canvasImageKeys(opts.blocks);
    if (!keys.length) return;
    const { data } = await sb.from("assets").select("id").in("r2_key", keys);
    const rows = ((data ?? []) as { id: string }[]).map((a) => ({ asset_id: a.id, module, record_id: recordId, record_label: recordLabel, field }));
    if (rows.length) await sb.from("asset_usages").upsert(rows, { onConflict: "asset_id,module,record_id,field", ignoreDuplicates: true });
  } catch (e) {
    // บันทึกหน้าเว็บสำคัญกว่า — ถ้าบันทึก "ถูกใช้ที่ไหน" พัง แค่ log ไว้
    console.error("[canvas-usage] sync failed", e);
  }
}
