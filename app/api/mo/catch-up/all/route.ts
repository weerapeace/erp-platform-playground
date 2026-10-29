/**
 * แท็บ "ทั้งหมด" ของโหมด 🔄 อัปเดตงาน — GET /api/mo/catch-up/all
 * ทุกใบสั่งผลิตที่ยังเปิดอยู่ + ที่ปิด/ยกเลิกใน 30 วันล่าสุด พร้อม "ตอนนี้ของอยู่ไหน" (กติกา cuLocate ใน catch-up.ts)
 * แก้ปัญหา: อัปเดตแล้วใบหลุดจากแท็บบนบอร์ด (รับเข้า QC แล้ว = ของอยู่โกดัง QC · ส่งออกครบ = รอปิดใบ) หาไม่เจอ
 * อ่านอย่างเดียว · ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { cuLocate, type CuWhere } from "@/app/master/work-board/catch-up";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
export type CuAllRow = {
  mo_no: string; product_sku: string | null; product_name: string | null; image_url: string | null;
  qty: number; status: string; dispatched: number; received: number; qc_pulled: number; where: CuWhere;
};
const DAYS_CLOSED = 30;
const n = (v: unknown) => Number(v) || 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const since = new Date(Date.now() - DAYS_CLOSED * 86400000).toISOString();
  const [mosRes, wosRes, itemsRes, shelvesRes] = await Promise.all([
    admin.from("manufacturing_orders").select("mo_no, product_sku, product_name, qty, status, updated_at").eq("is_active", true)
      .or(`status.not.in.(done,cancelled),updated_at.gte.${since}`).limit(5000),
    admin.from("mo_work_orders").select("mo_no, qty, received_qty, qc_pulled_qty").eq("is_active", true).neq("status", "cancelled").limit(10000),
    admin.from("qc_warehouse_items").select("mo_no, qty, status, shelf_id").gt("qty", 0).limit(10000),
    admin.from("qc_shelves").select("id, name"),
  ]);
  if (mosRes.error || wosRes.error) return NextResponse.json({ data: [], error: "โหลดรายการใบสั่งผลิตไม่สำเร็จ" }, { status: 500 });

  const sum = new Map<string, { d: number; r: number; q: number }>();
  for (const w of (wosRes.data ?? []) as Row[]) {
    const k = String(w.mo_no ?? ""); const cur = sum.get(k) ?? { d: 0, r: 0, q: 0 };
    cur.d += n(w.qty); cur.r += n(w.received_qty); cur.q += n(w.qc_pulled_qty); sum.set(k, cur);
  }
  const shelfName = new Map(((shelvesRes.data ?? []) as Row[]).map((s) => [String(s.id), String(s.name ?? "")]));
  const shelfAt = new Map<string, { name: string; qty: number; status: string }[]>();
  for (const it of (itemsRes.data ?? []) as Row[]) {
    const k = String(it.mo_no ?? ""); if (!k) continue;
    const name = shelfName.get(String(it.shelf_id ?? "")) || "โกดัง QC", status = String(it.status ?? "");
    const list = shelfAt.get(k) ?? [];
    const same = list.find((x) => x.name === name && x.status === status);
    if (same) same.qty += n(it.qty); else list.push({ name, qty: n(it.qty), status });
    shelfAt.set(k, list);
  }

  const mos = (mosRes.data ?? []) as Row[];
  // รูปสินค้า (ปกของ SKU) — ทีละ 300 รหัส ยิงขนานกัน
  const codes = [...new Set(mos.map((m) => String(m.product_sku ?? "").trim()).filter(Boolean))];
  const img = new Map<string, string>();
  const chunks: string[][] = [];
  for (let i = 0; i < codes.length; i += 300) chunks.push(codes.slice(i, i + 300));
  const imgRes = await Promise.all(chunks.map((c) => admin.from("skus_v2").select("code, cover_image_r2_key").eq("is_active", true).in("code", c)));
  for (const { data } of imgRes) for (const s of (data ?? []) as Row[]) {
    const key = s.cover_image_r2_key as string | null;
    if (key && !img.has(String(s.code ?? "").trim())) img.set(String(s.code ?? "").trim(), `/api/r2-image?key=${encodeURIComponent(key)}`);
  }

  const data: CuAllRow[] = mos.map((m) => {
    const moNo = String(m.mo_no ?? ""), s = sum.get(moNo) ?? { d: 0, r: 0, q: 0 }, sku = (m.product_sku as string | null) ?? null;
    return {
      mo_no: moNo, product_sku: sku, product_name: (m.product_name as string | null) ?? null, image_url: sku ? img.get(sku.trim()) ?? null : null,
      qty: n(m.qty), status: String(m.status ?? ""), dispatched: s.d, received: s.r, qc_pulled: s.q,
      where: cuLocate({ qty: n(m.qty), status: String(m.status ?? ""), dispatched: s.d, received: s.r, qcPulled: s.q, shelfAt: shelfAt.get(moNo) ?? [] }),
    };
  });
  return NextResponse.json({ data, error: null });
}
