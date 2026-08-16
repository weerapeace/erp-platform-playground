/**
 * ค่าแรงผลิตที่วางแผนไว้ต่อใบสั่งผลิต (กลุ่ม A) — /api/mo/est-labor
 *
 *   POST { mo_id, est_labor_cost }                                   → ตั้งค่าแรงรวมของใบเดียว
 *   POST { mo_id, rate_per_piece, scope:"parent", save_bom? }        → ใส่ค่าแรง/ชิ้นเดียวกัน
 *        ให้ "ทุกใบสั่งผลิตที่ยังเปิดอยู่ ของสินค้ารุ่นเดียวกัน (Parent SKU เดียวกัน)"
 *        แต่ละใบคิดยอดรวมจากจำนวนของใบนั้นเอง (rate × qty)
 *        save_bom: true = เขียนราคากลาง/ชิ้น กลับเข้า BOM ของทุกสีที่มีใบสั่งผลิตด้วย
 *
 * ของกลาง: guardApi(products.edit) + supabaseAdmin + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: { mo_id?: string; est_labor_cost?: unknown; rate_per_piece?: unknown; scope?: string; save_bom?: boolean };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moId = (b.mo_id ?? "").trim();
  if (!moId) return NextResponse.json({ error: "ต้องระบุ mo_id" }, { status: 400 });
  const admin = supabaseAdmin();

  // ── โหมด "ใส่ให้ทุกใบของรุ่นเดียวกัน" ──
  if (b.scope === "parent") {
    const rate = Number(b.rate_per_piece);
    if (!isFinite(rate) || rate < 0) return NextResponse.json({ error: "ค่าแรง/ชิ้น ต้องเป็นตัวเลขไม่ติดลบ" }, { status: 400 });

    const { data: srcMo } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku").eq("id", moId).single();
    const srcSku = (srcMo?.product_sku as string) ?? "";
    if (!srcSku) return NextResponse.json({ error: "ใบนี้ไม่มีรหัสสินค้า จึงหารุ่นเดียวกันไม่ได้" }, { status: 400 });

    // หา parent ของสินค้าใบนี้ → รหัสสีทั้งหมดในรุ่นเดียวกัน (ไม่มี parent = ใช้เฉพาะรหัสนี้)
    const { data: sku } = await admin.from("skus_v2").select("code, parent_sku_id").eq("code", srcSku).maybeSingle();
    const parentId = (sku?.parent_sku_id as string) ?? null;
    let siblings = [srcSku];
    if (parentId) {
      const { data: sibs } = await admin.from("skus_v2").select("code").eq("parent_sku_id", parentId).limit(2000);
      siblings = [...new Set([...(sibs ?? []).map((s) => String(s.code)), srcSku])];
    }

    // ใบสั่งผลิตที่ยังเปิดอยู่ของรหัสเหล่านั้น
    const mos: { id: string; mo_no: string; qty: number; product_sku: string }[] = [];
    for (let i = 0; i < siblings.length; i += 300) {
      const { data } = await admin.from("manufacturing_orders")
        .select("id, mo_no, qty, product_sku").eq("is_active", true)
        .not("status", "in", "(cancelled,done)").in("product_sku", siblings.slice(i, i + 300));
      for (const m of data ?? []) mos.push({ id: String(m.id), mo_no: String(m.mo_no), qty: Number(m.qty) || 0, product_sku: String(m.product_sku) });
    }
    if (mos.length === 0) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตที่ยังเปิดอยู่ของรุ่นนี้" }, { status: 404 });

    // ยอดรวมของแต่ละใบคิดจากจำนวนของใบนั้น → จัดกลุ่มตามจำนวน จะได้ยิง update น้อยครั้ง
    const byQty = new Map<number, string[]>();
    for (const m of mos) { const k = m.qty; byQty.set(k, [...(byQty.get(k) ?? []), m.id]); }
    for (const [qty, ids] of byQty) {
      const { error } = await admin.from("manufacturing_orders").update({ est_labor_cost: r2(rate * qty) }).in("id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // เขียนราคากลางกลับเข้า BOM ของทุกสีที่มีใบสั่งผลิต (ถ้าติ๊กไว้)
    let bomCount = 0;
    if (b.save_bom && rate > 0) {
      const skusWithMo = [...new Set(mos.map((m) => m.product_sku))];
      for (const code of skusWithMo) {
        const { data: bom } = await admin.from("bom_headers").select("bom_code")
          .eq("product_sku", code).eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const bomCode = (bom as { bom_code?: string } | null)?.bom_code;
        if (!bomCode) continue;
        // ราคากลาง = craftsman_id null → ปิดของเดิมก่อน แล้วใส่แถวใหม่ (เก็บประวัติ)
        const { data: cur } = await admin.from("bom_labor_rates").select("id, craftsman_id")
          .eq("bom_code", bomCode).eq("is_active", true).eq("is_current", true);
        const ex = (cur ?? []).find((r) => !r.craftsman_id) as { id: string } | undefined;
        if (ex) await admin.from("bom_labor_rates").update({ is_current: false }).eq("id", ex.id);
        const { error: insErr } = await admin.from("bom_labor_rates").insert({
          bom_code: bomCode, craftsman_id: null, craftsman_name: "ราคากลาง", rate, is_current: true, created_by: user?.id ?? null,
        });
        if (!insErr) bomCount += 1;
      }
    }

    await writeAudit(admin, {
      action: "bulk_edit", entityType: "manufacturing_orders", entityId: mos.map((m) => m.id).join(","),
      actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: { field: "est_labor_cost", rate_per_piece: rate, scope: "parent_sku", from_mo: srcMo?.mo_no, count: mos.length, bom_updated: bomCount },
    });
    return NextResponse.json({ data: { count: mos.length, bom_updated: bomCount, mo_nos: mos.map((m) => m.mo_no) }, error: null });
  }

  // ── โหมดเดิม: ใบเดียว ──
  // ว่าง = ล้างค่า (null); ไม่งั้นต้องเป็นตัวเลข >= 0
  let val: number | null = null;
  if (b.est_labor_cost != null && b.est_labor_cost !== "") {
    const n = Number(b.est_labor_cost);
    if (!isFinite(n) || n < 0) return NextResponse.json({ error: "ค่าแรงต้องเป็นตัวเลขไม่ติดลบ" }, { status: 400 });
    val = n;
  }
  const { error } = await admin.from("manufacturing_orders").update({ est_labor_cost: val }).eq("id", moId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "manufacturing_orders", entityId: moId, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { est_labor_cost: val } });
  return NextResponse.json({ data: { mo_id: moId, est_labor_cost: val }, error: null });
}
