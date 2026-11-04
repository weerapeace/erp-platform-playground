/**
 * แผนงานสำหรับผู้บริหาร (เฉพาะแอดมิน) — /api/mo/exec-plan
 *
 * GET   → รายการใบสั่งผลิตที่ยังเปิดอยู่ พร้อม "ตัวเลขเงิน" ที่บอร์ดปกติไม่โชว์:
 *         ราคาขาย/ชิ้น · มูลค่าที่ยังไม่ได้จ่ายงาน · ต้นทุนวัตถุดิบ/ชิ้น · ค่าแรง · กำไรประมาณ
 *         + ความคืบหน้า (จ่ายแล้ว/ค้าง/พร้อมจ่าย) + ธงลำดับความสำคัญ
 * PATCH → ติด/ปลดธงงานเร่ง { mo_id, priority: 0|1|2, note? }  (ธงไปโผล่บนการ์ดหน้าช้อปจ่ายงาน)
 *
 * 🔒 ล็อกที่ "ชั้น API" ด้วย guardApi("admin.users") — ไม่พึ่งการซ่อนปุ่มฝั่งหน้าเว็บ
 *    (สิทธิ์เดียวกับมุมมองผู้บริหารบน /dashboard → เจ้าของ/แอดมินเท่านั้นที่เห็นตัวเลขต้นทุน-กำไร)
 *
 * ⚠️ กับดักที่ระวังไว้แล้ว: query ที่แถวโตตามจำนวนใบ (mo_material_summary ตอนนี้ ~1,4xx แถว)
 *    ถูก PostgREST ตัดที่ 1,000 แถวเงียบ ๆ → ต้องไล่ทีละหน้า (fetchAllByMo)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { needsCut, type CutFields } from "@/lib/cut-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;
const PAGE = 1000;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

/** นับ query ที่พลาดแม้ยิงซ้ำแล้ว → ตอบ partial: true ให้หน้าเว็บเตือน (ไม่เงียบเป็น "ไม่มีราคา") */
type Fails = { n: number };

/**
 * ยิงซ้ำเมื่อพลาด — DB หนาแน่นชั่วคราว (statement timeout 57014) เคยทำให้ราคาขายหายทั้งชุด 300 รหัส
 * (เจอจริง 2026-11-04 13:02 — query อื่นหลายตัวโดน timeout พร้อมกัน) · สูงสุด 3 ครั้ง เว้น 0.4 / 1.2 วิ
 */
async function withRetry<T extends { error: unknown }>(run: () => PromiseLike<T>, tries = 3): Promise<T> {
  let r = await run();
  for (let i = 1; i < tries && r.error; i++) {
    await new Promise((ok) => setTimeout(ok, 400 * 3 ** (i - 1)));
    r = await run();
  }
  return r;
}

/** ดึงแถวของหลายใบสั่งผลิต "ให้ครบจริง" — ไล่ทีละหน้า (กันโดนตัดที่ 1,000 แถว) */
async function fetchAllByMo(admin: Admin, table: string, select: string, moNos: string[], fails?: Fails): Promise<Row[]> {
  if (moNos.length === 0) return [];
  const out: Row[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await withRetry(() => admin.from(table).select(select).in("mo_no", moNos).eq("is_active", true)
      .order("mo_no", { ascending: true }).range(from, from + PAGE - 1));
    if (error) { if (fails) fails.n++; break; }
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** ดึง skus_v2 เป็นชุด ๆ (ชุดละ 150 · ยิงขนานกัน · พลาดยิงซ้ำ) — ใช้ทั้งสินค้าที่ผลิตและวัตถุดิบในสูตร */
async function fetchSkus(admin: Admin, codes: string[], select: string, fails?: Fails): Promise<Row[]> {
  const list = [...new Set(codes.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 150) chunks.push(list.slice(i, i + 150));
  const results = await Promise.all(chunks.map((c) => withRetry(() => admin.from("skus_v2").select(select).in("code", c).eq("is_active", true))));
  if (fails) fails.n += results.filter((r) => r.error).length;
  return results.flatMap((r) => (r.data ?? []) as unknown as Row[]);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const admin = supabaseAdmin();

  // ?dispatched=1&from=&to= → ยอดที่จ่ายงานไปแล้วในช่วง (แผง "สรุปเป้า" โหมดผู้บริหาร) · วันที่ = dispatch_date (วันไทย)
  //   ใบที่ไม่ระบุวันจ่าย ("จำไม่ได้" / อัปเดตย้อนหลัง — ข้อมูลจริง ต.ค.–พ.ย. 69 ว่างทั้งหมด 141 ใบ) = นับตามวันที่บันทึกใบ (created_at เวลาไทย)
  const sp = new URL(request.url).searchParams;

  // ?prices=1 → ราคาขาย/ชิ้น ต่อใบสั่งผลิตที่ยังเปิด (เบา: 2 query) — การ์ดโหมดผู้บริหารใช้แค่นี้ ไม่ต้องดึงทั้งแผน (~25 query)
  if (sp.get("prices") === "1") {
    const fails: Fails = { n: 0 };
    const { data: ms, error } = await withRetry(() => admin.from("manufacturing_orders").select("mo_no, product_sku")
      .eq("is_active", true).not("status", "in", "(cancelled,done)").limit(2000));
    if (error) return NextResponse.json({ prices: {}, partial: true, error: "โหลดราคาขายไม่สำเร็จ (ระบบหนาแน่นชั่วคราว) — ลองใหม่อีกครั้ง" }, { status: 503 });
    const list = (ms ?? []) as Row[];
    const skus = await fetchSkus(admin, list.map((m) => String(m.product_sku ?? "")), "code, list_price", fails);
    const priceOf = new Map(skus.map((s) => [String(s.code), Number(s.list_price) || 0]));
    const prices: Record<string, number> = {};
    for (const m of list) { const p = priceOf.get(String(m.product_sku ?? "")) ?? 0; if (p > 0) prices[String(m.mo_no)] = r2(p); }
    return NextResponse.json({ prices, partial: fails.n > 0, error: null });
  }

  if (sp.get("dispatched") === "1") {
    const ok = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const from = sp.get("from"), to = sp.get("to");
    if (!ok(from) || !ok(to)) return NextResponse.json({ error: "ระบุช่วงวันที่ from / to (YYYY-MM-DD)" }, { status: 400 });
    const t0 = new Date(Date.parse(`${from}T00:00:00+07:00`)).toISOString(), t1 = new Date(Date.parse(`${to}T23:59:59.999+07:00`)).toISOString();
    const fails: Fails = { n: 0 };
    const { data: ws, error: wErr } = await withRetry(() => admin.from("mo_work_orders").select("mo_no, qty, labor_cost, status, dispatch_date")
      .eq("is_active", true).neq("status", "cancelled")
      .or(`and(dispatch_date.gte.${from},dispatch_date.lte.${to}),and(dispatch_date.is.null,created_at.gte."${t0}",created_at.lte."${t1}")`).limit(10000));
    if (wErr) return NextResponse.json({ error: "โหลดยอดที่จ่ายไม่สำเร็จ (ระบบหนาแน่นชั่วคราว) — ลองใหม่อีกครั้ง" }, { status: 503 });
    const list = (ws ?? []) as Row[];
    const moNos = [...new Set(list.map((w) => String(w.mo_no)))];
    const skuOf = new Map<string, string>();
    for (let i = 0; i < moNos.length; i += 300) {
      const { data: ms, error } = await withRetry(() => admin.from("manufacturing_orders").select("mo_no, product_sku").in("mo_no", moNos.slice(i, i + 300)));
      if (error) fails.n++;
      for (const m of (ms ?? []) as Row[]) skuOf.set(String(m.mo_no), String(m.product_sku ?? ""));
    }
    const priceOf = new Map<string, number>();
    for (const p of await fetchSkus(admin, [...skuOf.values()], "code, list_price", fails)) priceOf.set(String(p.code), Number(p.list_price) || 0);
    let value = 0, labor = 0, qty = 0, laborMissing = 0, noPrice = 0, noDate = 0;
    for (const w of list) {
      if (!w.dispatch_date) noDate++;
      const q = Number(w.qty) || 0, p = priceOf.get(skuOf.get(String(w.mo_no)) ?? "") ?? 0;
      qty += q; value += q * p; if (!p) noPrice++;
      if (w.labor_cost == null) laborMissing++; else labor += Number(w.labor_cost) || 0;
    }
    return NextResponse.json({ data: { from, to, count: list.length, qty: r2(qty), value: r2(value), labor: r2(labor), labor_missing: laborMissing, no_price: noPrice, no_date: noDate, partial: fails.n > 0 }, error: null });
  }

  const fails: Fails = { n: 0 };
  const [{ data: mosRaw, error: mErr }, { data: wosRaw, error: wErr }] = await Promise.all([
    withRetry(() => admin.from("manufacturing_orders")
      .select("id, mo_no, product_sku, product_name, qty, status, due_date, prep_done, cut_done, est_labor_cost, bom_code, priority, priority_note, priority_at, priority_by, created_at, size_breakdown")
      .eq("is_active", true).not("status", "in", "(cancelled,done)").limit(2000)),
    withRetry(() => admin.from("mo_work_orders").select("mo_no, qty, status, labor_cost").eq("is_active", true).limit(5000)),
  ]);
  if (mErr) return NextResponse.json({ rows: [], error: "โหลดแผนไม่สำเร็จ (ระบบหนาแน่นชั่วคราว) — ลองใหม่อีกครั้ง" }, { status: 503 });
  if (wErr) fails.n++;

  const mos = (mosRaw ?? []) as Row[];
  const wos = (wosRaw ?? []) as Row[];

  // ยอดที่จ่ายงานไปแล้ว + ค่าแรงจริงที่จ่ายไป ต่อใบ
  const dispatchedByMo = new Map<string, number>();
  const laborPaidByMo = new Map<string, number>();
  for (const w of wos) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    dispatchedByMo.set(k, (dispatchedByMo.get(k) ?? 0) + (Number(w.qty) || 0));
    laborPaidByMo.set(k, (laborPaidByMo.get(k) ?? 0) + (Number(w.labor_cost) || 0));
  }

  const moNos = mos.map((m) => String(m.mo_no));
  const bomCodes = [...new Set(mos.map((m) => String(m.bom_code ?? "")).filter(Boolean))];

  const [prodSkus, sums, mats, { data: ratesRaw }, { data: pcsRaw }] = await Promise.all([
    fetchSkus(admin, mos.map((m) => String(m.product_sku ?? "")),
      "code, list_price, cover_image_r2_key, color_th, color, parent:parent_skus_v2!parent_sku_id ( brand:brands!brand_id ( id, name, color, pricing_mode ) )", fails),
    fetchAllByMo(admin, "mo_material_summary", "mo_no, component_sku, qty_per, is_ready", moNos, fails),
    fetchAllByMo(admin, "mo_materials", "mo_no, cut_done, material_type, cut_block_code, cut_length, pieces", moNos, fails),
    bomCodes.length
      ? withRetry(() => admin.from("bom_labor_rates").select("bom_code, rate").in("bom_code", bomCodes).is("craftsman_id", null).eq("is_current", true).eq("is_active", true))
      : Promise.resolve({ data: [] as Row[] }),
    moNos.length
      ? withRetry(() => admin.from("mo_piecework").select("mo_no, rate, qty_per, total_qty, status").in("mo_no", moNos).eq("is_active", true))
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  // ราคาซื้อวัตถุดิบ (standard_price) ของชิ้นส่วนในสูตร
  const compSkus = await fetchSkus(admin, sums.map((s) => String(s.component_sku ?? "")), "code, standard_price", fails);
  const costOf = new Map<string, number>();
  for (const c of compSkus) costOf.set(String(c.code), Number(c.standard_price) || 0);

  // ข้อมูลสินค้าที่ผลิต (ราคาขาย/รูป/แบรนด์/สี)
  type Info = { list_price: number; image_url: string | null; brand: string | null; brand_id: string | null; brand_color: string | null; brand_oem: boolean; color: string | null };
  const infoOf = new Map<string, Info>();
  for (const s of prodSkus) {
    const parent = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { brand?: unknown } | null;
    const brand = (parent && (Array.isArray(parent.brand) ? parent.brand[0] : parent.brand)) as { id?: string; name?: string; color?: string; pricing_mode?: string } | null;
    const key = s.cover_image_r2_key as string | null;
    const colorTh = String(s.color_th ?? "").trim(), colorEn = String(s.color ?? "").trim();
    infoOf.set(String(s.code), {
      list_price: Number(s.list_price) || 0,
      image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
      brand: brand?.name ?? null, brand_id: brand?.id ?? null, brand_color: brand?.color ?? null,
      // แบรนด์ OEM = รับจ้างผลิต ราคาคิดต่อออเดอร์ → ไม่ต้องเตือนว่า "ยังไม่ตั้งราคาขาย"
      brand_oem: brand?.pricing_mode === "oem",
      color: colorTh || colorEn || null,
    });
  }

  // ต้นทุนวัตถุดิบ/ชิ้น + ความคืบหน้า "เตรียม" ต่อใบ
  const matCost = new Map<string, number>(), matNoPrice = new Map<string, number>();
  const prepTotal = new Map<string, number>(), prepDone = new Map<string, number>();
  for (const s of sums) {
    const k = String(s.mo_no);
    const price = costOf.get(String(s.component_sku)) ?? 0;
    matCost.set(k, (matCost.get(k) ?? 0) + (Number(s.qty_per) || 0) * price);
    if (!(price > 0)) matNoPrice.set(k, (matNoPrice.get(k) ?? 0) + 1);
    prepTotal.set(k, (prepTotal.get(k) ?? 0) + 1);
    if (s.is_ready) prepDone.set(k, (prepDone.get(k) ?? 0) + 1);
  }
  // ความคืบหน้า "ตัด" ต่อใบ (รายบล็อก) — ใช้กติกากลาง needsCut เพื่อให้ตัวเลขตรงกับบอร์ด (อะไหล่ไม่นับ)
  const cutTotal = new Map<string, number>(), cutDone = new Map<string, number>();
  for (const x of mats) {
    if (!needsCut(x as CutFields)) continue;
    const k = String(x.mo_no);
    cutTotal.set(k, (cutTotal.get(k) ?? 0) + 1);
    if (x.cut_done) cutDone.set(k, (cutDone.get(k) ?? 0) + 1);
  }

  const centralRate = new Map<string, number>();
  for (const r of ((ratesRaw ?? []) as Row[])) centralRate.set(String(r.bom_code), Number(r.rate) || 0);

  // ค่าแรงเหมา/ชิ้น (rate × qty_per ต่อชิ้นสินค้า)
  const pieceRate = new Map<string, number>();
  for (const p of ((pcsRaw ?? []) as Row[])) {
    const k = String(p.mo_no);
    pieceRate.set(k, (pieceRate.get(k) ?? 0) + (Number(p.rate) || 0) * (Number(p.qty_per) || 0));
  }

  const rows = mos.map((m) => {
    const moNo = String(m.mo_no);
    const qty = Number(m.qty) || 0;
    const dispatched = dispatchedByMo.get(moNo) ?? 0;
    const remaining = r2(Math.max(0, qty - dispatched));
    const inf = infoOf.get(String(m.product_sku)) ?? { list_price: 0, image_url: null, brand: null, brand_id: null, brand_color: null, brand_oem: false, color: null };

    // ค่าแรงผลิต/ชิ้น: ราคากลางจากสูตรก่อน → ไม่มีก็ใช้ค่าแรงที่วางแผนไว้ทั้งใบหารจำนวน
    const central = centralRate.get(String(m.bom_code ?? "")) ?? 0;
    const est = Number(m.est_labor_cost) || 0;
    const laborUnit = central > 0 ? central : (qty > 0 && est > 0 ? est / qty : 0);
    const laborSrc: "central" | "est" | "none" = central > 0 ? "central" : (laborUnit > 0 ? "est" : "none");

    const mat = r2(matCost.get(moNo) ?? 0);
    const piece = r2(pieceRate.get(moNo) ?? 0);
    const pt = prepTotal.get(moNo) ?? 0, pd = prepDone.get(moNo) ?? 0;
    const ct = cutTotal.get(moNo) ?? 0, cd = cutDone.get(moNo) ?? 0;
    const hasBom = pt > 0;

    return {
      id: String(m.id), mo_no: moNo,
      product_sku: (m.product_sku as string) ?? null, product_name: (m.product_name as string) ?? null,
      image_url: inf.image_url, brand: inf.brand, brand_id: inf.brand_id, brand_color: inf.brand_color, brand_oem: inf.brand_oem, color: inf.color,
      qty, dispatched: r2(dispatched), remaining,
      due_date: (m.due_date as string) ?? null, status: (m.status as string) ?? null,
      created_at: (m.created_at as string) ?? null,
      // ส่งไปให้หน้าเปิด "ป๊อปเช็กลิสต์" ของใบนั้นได้ทันที (แม้ใบที่จ่ายงานครบแล้ว ซึ่งไม่อยู่ในรายการรอจ่าย)
      prep_done: !!m.prep_done, cut_done: !!m.cut_done, bom_code: (m.bom_code as string) ?? null,
      has_sizes: Array.isArray(m.size_breakdown) && (m.size_breakdown as unknown[]).length > 0,
      priority: Number(m.priority) || 0, priority_note: (m.priority_note as string) ?? null,
      priority_at: (m.priority_at as string) ?? null, priority_by: (m.priority_by as string) ?? null,
      // เงิน (ต่อชิ้น)
      list_price: r2(inf.list_price),
      mat_cost: mat, mat_no_price: matNoPrice.get(moNo) ?? 0,
      labor_cost: r2(laborUnit), labor_src: laborSrc, piece_cost: piece,
      labor_paid: r2(laborPaidByMo.get(moNo) ?? 0),   // ค่าแรงที่จ่ายไปแล้วทั้งใบ (ของจริง)
      // ความคืบหน้า
      has_bom: hasBom,
      prep_total: pt, prep_ready: pd, cut_total: ct, cut_ready: cd,
      ready: hasBom ? (pd >= pt && cd >= ct) : (!!m.prep_done && !!m.cut_done),
    };
  });

  // partial = บาง query พลาดแม้ยิงซ้ำ (ตัวเลขบางช่องอาจเป็น 0) → หน้าเว็บเตือน + ปุ่มโหลดใหม่
  return NextResponse.json({ rows, partial: fails.n > 0, error: null });
}

/** ติด/ปลดธงลำดับความสำคัญ (0=ปกติ 1=สำคัญ 2=เร่งด่วน) */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "admin.users"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let b: { mo_id?: string; priority?: unknown; note?: unknown };
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const moId = String(b.mo_id ?? "").trim();
  if (!moId) return NextResponse.json({ error: "ต้องระบุ mo_id" }, { status: 400 });
  const p = Number(b.priority);
  if (![0, 1, 2].includes(p)) return NextResponse.json({ error: "priority ต้องเป็น 0 (ปกติ), 1 (สำคัญ) หรือ 2 (เร่งด่วน)" }, { status: 400 });
  const note = b.note == null ? null : String(b.note).slice(0, 200).trim() || null;

  const admin = supabaseAdmin();
  const actor = user?.email ?? null;
  const patch = p === 0
    ? { priority: 0, priority_note: null, priority_at: null, priority_by: null }
    : { priority: p, priority_note: note, priority_at: new Date().toISOString(), priority_by: actor };
  const { error } = await admin.from("manufacturing_orders").update(patch).eq("id", moId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "update", entityType: "manufacturing_orders", entityId: moId,
    actorId: user?.id ?? null, actorName: actor,
    metadata: { field: "priority", priority: p, priority_note: note, source: "exec-plan" },
  });
  return NextResponse.json({ data: { mo_id: moId, priority: p, priority_note: note }, error: null });
}
