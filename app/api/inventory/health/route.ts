import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi, apiCan } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { fetchAllPages } from "@/lib/fetch-all";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 🩺 สุขภาพคลัง — ตัวเลขจริงสำหรับหัวหน้า /inventory (อ่านอย่างเดียว ไม่แตะข้อมูล)
 * - จำนวนจริงของแท็บ (ประวัติทั้งหมด · แถวยอดคงเหลือ) — เดิมแท็บโชว์แค่จำนวนที่โหลดมา
 * - ยอดติดลบต่อคลัง → ตัวเลขนั้นเชื่อไม่ได้
 * - "การไหลอัตโนมัติ" แต่ละจุด ลงสต็อกล่าสุดเมื่อไหร่ + งานต้นทางที่เกิดหลังจากนั้น → เห็นว่าจุดไหนหยุด
 */

export type FlowCheck = {
  key: string;
  label: string;          // ภาษาคน เช่น "จ่ายงาน → เบิกวัตถุดิบเข้าระหว่างผลิต"
  last_at: string | null; // ลงสต็อกครั้งล่าสุด
  pending: number;        // งานต้นทางที่เกิดหลังจากนั้น (ยังไม่ลงสต็อก)
  pending_label: string;  // อธิบาย pending
  stalled: boolean;
};

/** ภาพรวมต่อคลัง (แถบโซน + การ์ด) */
export type ZoneSummary = {
  warehouse_id: string; code: string; name: string; kind: string;
  rows: number;       // แถวยอดคงเหลือ
  in_stock: number;   // แถวที่มีของ (> 0)
  negative: number;   // แถวติดลบ
  value: number;      // มูลค่าเฉพาะยอดบวก (ยอดติดลบไม่นับ กันมูลค่าเพี้ยน)
  neg_value: number;  // มูลค่าส่วนที่ติดลบ (ค่าลบ)
  no_location: number;// มีของแต่ยังไม่ตั้งชั้นวาง
};

export type InventoryHealth = {
  movements_total: number;
  balances_total: number;
  negative_total: number;
  negative_by_wh: { warehouse_id: string; code: string; name: string; count: number }[];
  last_movement_at: string | null;
  flows: FlowCheck[];
  zones: ZoneSummary[];
  cost_hidden?: boolean;   // ไม่มีสิทธิ์ดูราคาทุน → value/neg_value = 0
  error: string | null;
};

const STALL_DAYS = 3;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "stock.view"); if (denied) return denied;
  const db = supabaseAdmin();
  try {
    const cnt = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    };
    const lastOf = async (refType: string) => {
      const { data, error } = await db.from("erp_playground_stock_movements")
        .select("created_at").eq("reference_type", refType)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.created_at as string | undefined) ?? null;
    };

    const [movTotal, balTotal, negRows, whs, lastAny, lastIssue, lastGr, lastOnline] = await Promise.all([
      cnt(db.from("erp_playground_stock_movements").select("id", { count: "exact", head: true })),
      cnt(db.from("erp_playground_stock_balances").select("product_id", { count: "exact", head: true })),
      // ⚠️ เกิน 1,000 แถว PostgREST ตัดเงียบ → ไล่หน้าให้ครบ (strict: ไม่ครบ = ตอบ error ดีกว่าตัวเลขผิด)
      fetchAllPages((from, to) => db.from("erp_playground_stock_balances").select("warehouse_id, qty_on_hand, avg_cost, location_code")
        .order("product_id").order("warehouse_id").range(from, to), { strict: true }).then((data) => ({ data, error: null as { message: string } | null })),
      db.from("erp_playground_warehouses").select("id, code, name, kind, active"),
      db.from("erp_playground_stock_movements").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      lastOf("mo_issue_wip"),
      lastOf("goods_receipt"),
      lastOf("platform_order"),
    ]);
    if (negRows.error) throw new Error(negRows.error.message);

    type W = { id: string; code: string; name: string; kind: string | null; active: boolean | null };
    const whMap = new Map(((whs.data ?? []) as W[]).map((w) => [w.id, w]));
    const negCount = new Map<string, number>();
    const zoneMap = new Map<string, ZoneSummary>();
    for (const w of whMap.values()) if (w.active !== false)
      zoneMap.set(w.id, { warehouse_id: w.id, code: w.code, name: w.name, kind: w.kind ?? "general", rows: 0, in_stock: 0, negative: 0, value: 0, neg_value: 0, no_location: 0 });
    let negative_total = 0;
    for (const r of (negRows.data ?? []) as { warehouse_id: string; qty_on_hand: number; avg_cost: number; location_code: string | null }[]) {
      const q = Number(r.qty_on_hand) || 0, v = q * (Number(r.avg_cost) || 0);
      let z = zoneMap.get(r.warehouse_id);
      if (!z) { const w = whMap.get(r.warehouse_id); z = { warehouse_id: r.warehouse_id, code: w?.code ?? "", name: w?.name ?? "", kind: w?.kind ?? "general", rows: 0, in_stock: 0, negative: 0, value: 0, neg_value: 0, no_location: 0 }; zoneMap.set(r.warehouse_id, z); }
      z.rows++;
      if (q > 0) { z.in_stock++; z.value += v; if (!r.location_code) z.no_location++; }
      if (q < 0) { z.negative++; z.neg_value += v; negative_total++; negCount.set(r.warehouse_id, (negCount.get(r.warehouse_id) ?? 0) + 1); }
    }
    const canCost = await apiCan(request, COST_PERM);
    const zones = [...zoneMap.values()].map((z) => canCost ? z : { ...z, value: 0, neg_value: 0 });
    const negative_by_wh = [...negCount.entries()].map(([id, count]) => ({
      warehouse_id: id, code: whMap.get(id)?.code ?? "", name: whMap.get(id)?.name ?? "", count,
    })).sort((a, b) => b.count - a.count);

    // งานต้นทางที่เกิดหลังลงสต็อกครั้งล่าสุด
    const since = (iso: string | null) => iso ?? "1970-01-01T00:00:00Z";
    const [moAfter, grAfter, onlineShippedNotCut] = await Promise.all([
      cnt(db.from("manufacturing_orders").select("id", { count: "exact", head: true }).gt("created_at", since(lastIssue))),
      cnt(db.from("goods_receipt_lines_v2").select("id", { count: "exact", head: true }).gt("created_at", since(lastGr))),
      cnt(db.from("platform_orders").select("id", { count: "exact", head: true }).eq("status", "shipped").eq("stock_deducted", false).neq("source", "email")),   // ออเดอร์จากอีเมลไม่ตัดสต็อกตามกติกา
    ]);

    const daysAgo = (iso: string | null) => iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity;
    const flows: FlowCheck[] = [
      { key: "mo_issue", label: "จ่ายงานผลิต → เบิกวัตถุดิบเข้าระหว่างผลิต", last_at: lastIssue,
        pending: moAfter, pending_label: "ใบสั่งผลิตที่เปิดหลังจากนั้น",
        stalled: moAfter > 0 && daysAgo(lastIssue) > STALL_DAYS },
      { key: "goods_receipt", label: "รับของจากใบสั่งซื้อ → เข้าคลังวัตถุดิบ", last_at: lastGr,
        pending: grAfter, pending_label: "บรรทัดรับของที่ยังไม่ลงสต็อก",
        stalled: grAfter > 0 },
      { key: "online", label: "ร้านออนไลน์ส่งของ → ตัดสต็อก", last_at: lastOnline,
        pending: onlineShippedNotCut, pending_label: "ออเดอร์ส่งแล้วแต่ยังไม่ตัดสต็อก",
        stalled: onlineShippedNotCut > 0 },
    ];

    return NextResponse.json({
      movements_total: movTotal, balances_total: balTotal,
      negative_total, negative_by_wh, zones, cost_hidden: !canCost,
      last_movement_at: (lastAny.data?.created_at as string | undefined) ?? null,
      flows, error: null,
    } satisfies InventoryHealth);
  } catch (e) {
    return NextResponse.json({ movements_total: 0, balances_total: 0, negative_total: 0, negative_by_wh: [], last_movement_at: null, flows: [], zones: [],
      error: e instanceof Error ? e.message : "โหลดไม่ได้" } satisfies InventoryHealth, { status: 500 });
  }
}
