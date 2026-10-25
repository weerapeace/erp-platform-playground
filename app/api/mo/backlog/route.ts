/**
 * ใบสั่งผลิตค้าง (สำหรับหน้า /master/mo-backlog "จัดการใบสั่งผลิตค้าง") — GET /api/mo/backlog
 *   → ทุกใบที่ยังเปิด (is_active + status ไม่ใช่ done/cancelled) พร้อม
 *     อายุใบ · ยอดจ่าย/รับคืน · เตรียม/ตัด · กลุ่ม · กลุ่มสิ่งที่ต้องทำ (bucket ดู lib/mo-backlog)
 * อ่านอย่างเดียว · supabaseAdmin + guardApi(products.view) เหมือนบอร์ดจ่ายงาน
 * ⚠️ ทุก query ที่แถวโตตามจำนวนใบใช้ fetchAllPages (กันตัด 1,000 แถวเงียบ ๆ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { fetchAllPages } from "@/lib/fetch-all";
import { needsCut, type CutFields } from "@/lib/cut-rules";
import { todayBangkok } from "@/lib/date";
import { bangkokYmd, bucketOf, daysBetweenYmd, type MoBacklogRow } from "@/lib/mo-backlog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? x : 0; };
const r2 = (v: number) => Math.round(v * 100) / 100;

/** ดึงแถวลูกของหลายใบ แบ่ง mo_no เป็นชุด (กัน URL ยาวเกิน) + ไล่หน้า */
async function fetchByMoNos(admin: ReturnType<typeof supabaseAdmin>, table: string, select: string, moNos: string[]): Promise<Row[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < moNos.length; i += 200) chunks.push(moNos.slice(i, i + 200));
  const parts = await Promise.all(chunks.map((chunk) => fetchAllPages<Row>((from, to) =>
    admin.from(table).select(select).in("mo_no", chunk).eq("is_active", true)
      .order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>)));
  return parts.flat();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const mos = await fetchAllPages<Row>((from, to) =>
    admin.from("manufacturing_orders")
      .select("id, mo_no, product_sku, product_name, qty, status, created_at, due_date, internal_due_date, bom_code, prep_done, cut_done")
      .eq("is_active", true).not("status", "in", "(cancelled,done)")
      .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>);
  const moNos = [...new Set(mos.map((m) => String(m.mo_no)).filter(Boolean))];

  const [wos, sums, mats, groupsRes] = await Promise.all([
    fetchByMoNos(admin, "mo_work_orders", "id, mo_no, qty, received_qty, status, dispatch_date", moNos),
    fetchByMoNos(admin, "mo_material_summary", "id, mo_no, is_ready", moNos),
    fetchByMoNos(admin, "mo_materials", "id, mo_no, material_type, cut_block_code, cut_length, pieces, cut_done", moNos),
    admin.from("mo_groups").select("name, mo_nos").eq("is_active", true),
  ]);

  const woBy = new Map<string, { disp: number; recv: number; open: number; last: string | null }>();
  for (const w of wos) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    const cur = woBy.get(k) ?? { disp: 0, recv: 0, open: 0, last: null };
    cur.disp += n(w.qty); cur.recv += n(w.received_qty);
    if (w.status !== "done") cur.open += 1;
    const d = (w.dispatch_date as string) ?? null;
    if (d && (!cur.last || d > cur.last)) cur.last = d;
    woBy.set(k, cur);
  }
  const prep = new Map<string, { t: number; r: number }>();
  for (const s of sums) { const k = String(s.mo_no); const p = prep.get(k) ?? { t: 0, r: 0 }; p.t += 1; if (s.is_ready) p.r += 1; prep.set(k, p); }
  const cut = new Map<string, { t: number; r: number }>();
  for (const x of mats) {
    if (!needsCut(x as CutFields)) continue;   // อะไหล่ไม่ต้องตัด (กติกาเดียวกับบอร์ด)
    const k = String(x.mo_no); const p = cut.get(k) ?? { t: 0, r: 0 }; p.t += 1; if (x.cut_done) p.r += 1; cut.set(k, p);
  }
  const groupsBy = new Map<string, string[]>();
  for (const g of (groupsRes.data ?? []) as Row[]) {
    const list = Array.isArray(g.mo_nos) ? (g.mo_nos as unknown[]).map(String) : [];
    for (const no of list) groupsBy.set(no, [...(groupsBy.get(no) ?? []), String(g.name ?? "")]);
  }

  const today = todayBangkok();
  const data: MoBacklogRow[] = mos.map((m) => {
    const k = String(m.mo_no);
    const w = woBy.get(k) ?? { disp: 0, recv: 0, open: 0, last: null };
    const p = prep.get(k) ?? { t: 0, r: 0 };
    const c = cut.get(k) ?? { t: 0, r: 0 };
    const qty = n(m.qty);
    const created = (m.created_at as string) ?? null;
    const age = created ? Math.max(0, daysBetweenYmd(bangkokYmd(created), today)) : 0;
    const due = (m.due_date as string) ?? null;
    const dueYmd = due ? due.slice(0, 10) : null;
    const sentAll = qty > 0 && w.recv >= qty;
    const late = dueYmd && !sentAll ? daysBetweenYmd(dueYmd, today) : 0;
    const row = {
      id: String(m.id), mo_no: k,
      product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null,
      qty, status: String(m.status ?? "draft"), created_at: created, age_days: age,
      due_date: dueYmd, internal_due_date: ((m.internal_due_date as string) ?? null)?.slice(0, 10) ?? null,
      dispatched: r2(w.disp), received: r2(w.recv), open_work_orders: w.open, last_dispatch_date: w.last,
      has_bom: p.t > 0,
      // ใบไม่มีสูตร: ใช้ธงติ๊กรวมทั้งใบ (prep_done/cut_done) แทนตัวนับรายวัตถุดิบ
      prep_total: p.t > 0 ? p.t : 1, prep_ready: p.t > 0 ? p.r : (m.prep_done ? 1 : 0),
      cut_total: p.t > 0 ? c.t : 1, cut_ready: p.t > 0 ? c.r : (m.cut_done ? 1 : 0),
      groups: (groupsBy.get(k) ?? []).join(", "),
      overdue_days: late > 0 ? late : null,
    };
    return { ...row, bucket: bucketOf(row) };
  });

  return NextResponse.json({ data, today, error: null });
}
