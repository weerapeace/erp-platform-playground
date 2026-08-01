/**
 * บอร์ดจ่ายงาน — ติ๊กสถานะ "เตรียมครบ / ตัดครบ" ของใบสั่งผลิต (Phase 1)
 * PATCH /api/mo/[id]/prep  body: { prep_done?: boolean; cut_done?: boolean }
 *   → อัปเดตเฉพาะ 2 ช่องนี้ (+ เวลาที่กด) ไม่แตะฟิลด์อื่น ไม่กางสูตรใหม่
 *   → ไฟเขียวบนการ์ด = prep_done && cut_done
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { needsCut, type CutFields } from "@/lib/cut-rules";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { prep_done?: boolean; cut_done?: boolean; apply_all?: boolean };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  const now = new Date().toISOString();
  if (typeof body.prep_done === "boolean") { patch.prep_done = body.prep_done; patch.prep_done_at = body.prep_done ? now : null; }
  if (typeof body.cut_done  === "boolean") { patch.cut_done  = body.cut_done;  patch.cut_done_at  = body.cut_done  ? now : null; }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีสถานะให้อัปเดต" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("manufacturing_orders").select("mo_no").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moNo = (existing as { mo_no: string }).mo_no;

  const { error } = await admin.from("manufacturing_orders").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  /**
   * apply_all = "ติ๊กครบทั้งใบ" (ใช้จากหน้าสแกน)
   *
   * ⚠️ สำคัญ: ไฟเขียวบนบอร์ดของใบที่มีวัตถุดิบ **ไม่ได้ดู 2 ช่องระดับใบข้างบนเลย**
   *    (ดู /api/mo/work-board: has_bom → ready = ทุก summary.is_ready && ทุกบล็อกที่ต้องตัด cut_done)
   *    117 จาก 130 ใบมีวัตถุดิบ → ถ้าติ๊กแค่ระดับใบ 90% จะกดแล้วไฟไม่เขียว = ฟีเจอร์เงียบ
   *    จึงต้องไล่ติ๊กถึงระดับวัตถุดิบ/บล็อกให้ตรงกับที่บอร์ดนับจริง
   */
  let applied: { prep_total: number; prep_ready: number; cut_total: number; cut_ready: number } | null = null;
  if (body.apply_all) {
    const { data: sums } = await admin.from("mo_material_summary").select("id, component_sku").eq("mo_no", moNo);
    const sumRows = (sums ?? []) as Record<string, unknown>[];

    if (sumRows.length > 0) {
      // "ตัดครบ" — เฉพาะบล็อกที่ต้องตัดจริง (อะไหล่ไม่นับ ให้ตรงกับตัวนับบนบอร์ด)
      let cutTotal = 0, cutReady = 0;
      if (typeof body.cut_done === "boolean") {
        const { data: mats } = await admin.from("mo_materials")
          .select("id, component_sku, material_type, cut_block_code, cut_length, pieces")
          .eq("mo_no", moNo).eq("is_active", true);
        const cutLines = ((mats ?? []) as Record<string, unknown>[]).filter((m) => needsCut(m as CutFields));
        cutTotal = cutLines.length;
        if (cutLines.length > 0) {
          const ids = cutLines.map((m) => String(m.id));
          await admin.from("mo_materials")
            .update({ cut_done: body.cut_done, cut_done_at: body.cut_done ? now : null })
            .in("id", ids);
          cutReady = body.cut_done ? cutLines.length : 0;
          // ลิงก์สองทางเหมือน /api/mo/material-line: ตัดครบ → วัตถุดิบนั้นเตรียมครบด้วย
          const skus = [...new Set(cutLines.map((m) => (m.component_sku == null ? null : String(m.component_sku))))];
          for (const sku of skus) {
            let su = admin.from("mo_material_summary").update({ is_ready: body.cut_done }).eq("mo_no", moNo);
            su = sku == null ? su.is("component_sku", null) : su.eq("component_sku", sku);
            await su;
          }
        }
      }

      // "เตรียมครบ" — ติ๊กทุกวัตถุดิบในใบ (ทำหลังตัด เพื่อไม่ให้ลิงก์สองทางมาทับ)
      if (typeof body.prep_done === "boolean") {
        await admin.from("mo_material_summary").update({ is_ready: body.prep_done }).eq("mo_no", moNo);
      }

      const { data: after } = await admin.from("mo_material_summary").select("is_ready").eq("mo_no", moNo);
      const afterRows = (after ?? []) as { is_ready: boolean | null }[];
      applied = {
        prep_total: afterRows.length,
        prep_ready: afterRows.filter((s) => s.is_ready).length,
        cut_total: cutTotal,
        cut_ready: cutReady,
      };
    } else {
      // ใบไม่มีวัตถุดิบ → ไฟเขียวใช้ 2 ช่องระดับใบ (อัปเดตไปแล้วข้างบน)
      applied = { prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0 };
    }
  }

  await admin.from("audit_logs").insert({
    actor_user_id: user?.id ?? null, action: "update", entity_type: "mo", entity_id: id,
    metadata: { mo_no: moNo, ...patch, apply_all: !!body.apply_all, ...(applied ?? {}) },
  }).then(() => {}, () => {});

  return NextResponse.json({ id, ...patch, applied, error: null });
}
