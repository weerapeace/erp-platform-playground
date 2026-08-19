/**
 * ข้อมูลบอร์ดจ่ายงาน (whiteboard) — เฟส D (รื้อใหม่)
 * GET /api/mo/work-board
 *   → departments: โซนแผนก
 *   → workOrders: ใบจ่ายงาน active (+ แบรนด์/สี/รูป/แผนก) — ซ่อน done ฝั่ง client
 *   → pending: ใบสั่งผลิตที่ยังจ่ายไม่ครบ (การ์ดโซน "รอจ่าย") + ยอดจ่ายแล้ว/เหลือ
 * อ่านผ่าน supabaseAdmin + guardApi (join ข้ามตาราง master)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { needsCut, type CutFields } from "@/lib/cut-rules";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const r2 = (n: number) => Math.round(n * 100) / 100;

// brand_oem = แบรนด์นี้ตั้งไว้ว่าเป็นงาน OEM (รับจ้างผลิตให้ลูกค้า) — ใช้แยก "นัดส่งลูกค้า" ออกจากของแบรนด์เราเอง
type SkuInfo = { image_url: string | null; brand: string | null; brand_color: string | null; brand_oem: boolean; color: string | null };

/**
 * ดึงแถวของหลาย MO "ให้ครบจริง" — ไล่ทีละหน้า
 *
 * 🐛 บั๊กที่แก้: query ที่ไม่ใส่ช่วงแถว จะถูกตัดที่ 1,000 แถวเงียบ ๆ (ไม่มี error)
 *    ใบสั่งผลิตที่รอจ่ายมีวัตถุดิบรวมกันพันกว่าแถว → ใบท้าย ๆ ไม่ได้ข้อมูลมา
 *    เลยถูกมองว่า "ไม่มีสูตร" ทั้งที่มี (การ์ดขึ้นป้าย ⚠ ไม่มีสูตร ผิด ๆ)
 */
const PAGE = 1000;
async function fetchAllByMo(
  admin: ReturnType<typeof supabaseAdmin>, table: string, select: string, moNos: string[],
): Promise<{ data: Record<string, unknown>[] }> {
  if (moNos.length === 0) return { data: [] };
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await admin.from(table).select(select).in("mo_no", moNos).eq("is_active", true)
      .order("mo_no", { ascending: true }).range(from, from + PAGE - 1);
    if (error) break;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) break;   // หน้าสุดท้าย
  }
  return { data: out };
}

/**
 * รูป/แบรนด์ของสินค้าแต่ละรหัส
 *
 * 🐛 บั๊กที่แก้: บางรหัสมี SKU ซ้ำกันหลายแถว (และบางใบสั่งผลิตเก็บรหัสติดช่องว่างท้าย)
 *    เดิมแถวหลังทับแถวก่อนเสมอ → ถ้าตัวซ้ำไม่มีรูป การ์ดก็ไม่มีรูป (เจอกับ PIX34-05)
 *    ตอนนี้ตัดช่องว่างหัวท้ายก่อนจับคู่ + ตัวที่ "มีรูป" ชนะตัวที่ไม่มีรูป
 */
async function skuInfoMap(admin: ReturnType<typeof supabaseAdmin>, skus: string[]): Promise<Map<string, SkuInfo>> {
  const map = new Map<string, SkuInfo>();
  // ถามทั้งรหัสแบบดิบและแบบตัดช่องว่าง (บางแถวใน DB เก็บรหัสติดช่องว่างท้าย)
  const list = [...new Set(skus.flatMap((s) => [String(s ?? ""), String(s ?? "").trim()]).filter(Boolean))];
  // ยิงทุก chunk ขนานกัน (เดิมรอทีละ chunk — SKU เยอะ = หลายรอบต่อคิว ทำบอร์ดเปิดช้า)
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += 300) chunks.push(list.slice(i, i + 300));
  const results = await Promise.all(chunks.map((chunk) =>
    admin.from("skus_v2")
      .select("code, cover_image_r2_key, color_th, color, parent:parent_skus_v2!parent_sku_id ( brand:brands!brand_id ( name, color, pricing_mode ) )")
      .in("code", chunk)));
  for (const { data } of results) {
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      const parent = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { brand?: unknown } | null;
      const brand = (parent && (Array.isArray(parent.brand) ? parent.brand[0] : parent.brand)) as { name?: string; color?: string; pricing_mode?: string } | null;
      const key = s.cover_image_r2_key as string | null;
      // สี: ใช้ color_th ก่อน ถ้าไม่มีใช้ color (โชว์ต่อท้ายชื่อบนการ์ด)
      const colorTh = String(s.color_th ?? "").trim();
      const colorEn = String(s.color ?? "").trim();
      const code = String(s.code ?? "").trim();
      const info: SkuInfo = {
        image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null,
        brand: brand?.name ?? null, brand_color: brand?.color ?? null,
        brand_oem: brand?.pricing_mode === "oem",
        color: colorTh || colorEn || null,
      };
      const prev = map.get(code);
      // รหัสซ้ำ: เก็บตัวที่ข้อมูลครบกว่า (มีรูปมาก่อน แล้วค่อยดูแบรนด์)
      if (!prev || (!prev.image_url && info.image_url) || (!prev.brand && info.brand && !info.image_url === !prev.image_url)) map.set(code, info);
    }
  }
  return map;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const [{ data: depts }, { data: wos }, { data: mos }] = await Promise.all([
    admin.from("departments").select("id, name, status, note, show_note, display_order, show_on_board").order("display_order", { ascending: true, nullsFirst: false }).order("name", { ascending: true }),
    admin.from("mo_work_orders").select("*").eq("is_active", true).order("created_at", { ascending: true }).limit(2000),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date, internal_due_date, prep_done, cut_done, est_labor_cost, bom_code, priority, priority_note, size_breakdown").eq("is_active", true).not("status", "in", "(cancelled,done)").limit(1000),
  ]);

  const departments = (depts ?? []).filter((d: Record<string, unknown>) => !d.status || d.status === "active")
    .map((d: Record<string, unknown>) => ({ id: String(d.id), name: (d.name as string) ?? "—", note: (d.note as string) ?? null, show_note: !!d.show_note, show_on_board: d.show_on_board !== false }));

  const workOrders = (wos ?? []) as Record<string, unknown>[];
  const moList = (mos ?? []) as Record<string, unknown>[];

  // ── คำนวณชุดข้อมูลนำเข้า (sync) ก่อนยิง query รอบสอง ──
  const dispatchedByMo = new Map<string, number>();          // ยอดจ่ายแล้วต่อ MO (ไม่นับยกเลิก)
  const prodActualByMo = new Map<string, number>();          // ผลิต-จริง = ผลรวม labor_cost ใบจ่ายงาน
  for (const w of workOrders) {
    if (w.status === "cancelled") continue;
    const k = String(w.mo_no);
    dispatchedByMo.set(k, (dispatchedByMo.get(k) ?? 0) + (Number(w.qty) || 0));
    prodActualByMo.set(k, (prodActualByMo.get(k) ?? 0) + (Number(w.labor_cost) || 0));
  }
  const allSkus = [...workOrders.map((w) => w.product_sku as string), ...moList.map((m) => m.product_sku as string)].filter(Boolean) as string[];
  const moIdByNo = new Map<string, string>();
  const estByMo = new Map<string, number>(); const moQtyByNo = new Map<string, number>(); const bomByMo = new Map<string, string>();
  for (const m of moList) {
    moIdByNo.set(String(m.mo_no), String(m.id));
    estByMo.set(String(m.mo_no), Number(m.est_labor_cost) || 0);
    moQtyByNo.set(String(m.mo_no), Number(m.qty) || 0);
    if (m.bom_code) bomByMo.set(String(m.mo_no), String(m.bom_code));
  }
  const missingMoNos = [...new Set(workOrders.map((w) => String(w.mo_no)).filter(Boolean))].filter((n) => !moIdByNo.has(n));
  const bomCodes = [...new Set([...bomByMo.values()])];
  const allMoNos = [...new Set([...workOrders.map((w) => String(w.mo_no)), ...moList.map((m) => String(m.mo_no))].filter(Boolean))];
  // MO ที่ยังเหลือต้องจ่าย (remaining>0) → ใช้ดึงเช็กลิสต์วัตถุดิบ
  const pendingMoNos = moList.filter((m) => Math.max(0, (Number(m.qty) || 0) - (dispatchedByMo.get(String(m.mo_no)) ?? 0)) > 0.0001).map((m) => String(m.mo_no));
  const noData = { data: [] as Record<string, unknown>[] };

  // ── ยิง query รอบสองพร้อมกัน (เดิมยิงทีละตัว 5-6 รอบ = waterfall) ──
  const [info, extraMoRes, lrRes, pcsRes, sumsRes, matsRes] = await Promise.all([
    skuInfoMap(admin, allSkus),
    missingMoNos.length ? admin.from("manufacturing_orders").select("id, mo_no").in("mo_no", missingMoNos) : Promise.resolve(noData),
    bomCodes.length ? admin.from("bom_labor_rates").select("bom_code, rate").in("bom_code", bomCodes).is("craftsman_id", null).eq("is_current", true).eq("is_active", true) : Promise.resolve(noData),
    allMoNos.length ? admin.from("mo_piecework").select("id, mo_no, job_name, rate, qty_per, total_qty, status, assignee_name").in("mo_no", allMoNos).eq("is_active", true) : Promise.resolve(noData),
    // ⚠️ ต้องไล่ทีละหน้า — วัตถุดิบของใบที่รอจ่ายรวมกันเกิน 1,000 แถว (ดู fetchAllByMo)
    fetchAllByMo(admin, "mo_material_summary", "mo_no, is_ready", pendingMoNos),
    fetchAllByMo(admin, "mo_materials", "mo_no, material_type, cut_block_code, cut_length, pieces, cut_done", pendingMoNos),
  ]);

  for (const m of (extraMoRes.data ?? []) as Record<string, unknown>[]) moIdByNo.set(String(m.mo_no), String(m.id));
  const centralRateByBom = new Map<string, number>();
  for (const r of (lrRes.data ?? []) as Record<string, unknown>[]) centralRateByBom.set(String(r.bom_code), Number(r.rate) || 0);
  const centralRateOf = (moNo: string) => centralRateByBom.get(bomByMo.get(moNo) ?? "") ?? 0;
  const piecePlanByMo = new Map<string, number>(); const pieceActualByMo = new Map<string, number>();
  for (const p of (pcsRes.data ?? []) as Record<string, unknown>[]) {
    const k = String(p.mo_no); const amt = (Number(p.total_qty) || 0) * (Number(p.rate) || 0);
    piecePlanByMo.set(k, (piecePlanByMo.get(k) ?? 0) + amt);
    if (p.status === "done") pieceActualByMo.set(k, (pieceActualByMo.get(k) ?? 0) + amt);
  }
  const laborOfMo = (moNo: string) => ({
    prod_plan: r2(estByMo.get(moNo) ?? 0), prod_actual: r2(prodActualByMo.get(moNo) ?? 0),
    piece_plan: r2(piecePlanByMo.get(moNo) ?? 0), piece_actual: r2(pieceActualByMo.get(moNo) ?? 0),
  });

  const enrichedWO = workOrders.map((w) => {
    const inf = info.get(String(w.product_sku ?? "").trim()) ?? { image_url: null, brand: null, brand_color: null, brand_oem: false, color: null };
    const moNo = String(w.mo_no);
    // ใบจ่ายงาน 1 ใบ = ส่วนแบ่งตามจำนวนของทั้งใบสั่งผลิต (กันนับซ้ำเมื่อ MO แตกหลายใบจ่ายงาน)
    const moQty = moQtyByNo.get(moNo) || dispatchedByMo.get(moNo) || (Number(w.qty) || 0);
    const share = moQty > 0 ? (Number(w.qty) || 0) / moQty : 1;
    const ml = laborOfMo(moNo);
    const labor = {
      prod_plan: r2(ml.prod_plan * share), prod_actual: Number(w.labor_cost) || 0,
      piece_plan: r2(ml.piece_plan * share), piece_actual: r2(ml.piece_actual * share),
    };
    return { ...w, ...inf, mo_id: moIdByNo.get(moNo) ?? null, labor, central_rate: centralRateOf(moNo) };
  });

  const allMos = (mos ?? []).map((m: Record<string, unknown>) => {
    const qty = Number(m.qty) || 0;
    const dispatched = dispatchedByMo.get(String(m.mo_no)) ?? 0;
    const remaining = r2(Math.max(0, qty - dispatched));
    const inf = info.get(String(m.product_sku ?? "").trim()) ?? { image_url: null, brand: null, brand_color: null, brand_oem: false, color: null };
    return { id: String(m.id), mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
      qty, dispatched: r2(dispatched), remaining, due_date: m.due_date ?? null, status: m.status,
      // 📦 due_date = นัดส่งลูกค้า · 🪑 internal_due_date = กำหนดส่งงานภายใน (ตั้งได้ตั้งแต่ยังไม่จ่ายงาน)
      internal_due_date: (m.internal_due_date as string) ?? null,
      prep_done: !!m.prep_done, cut_done: !!m.cut_done, bom_code: (m.bom_code as string) ?? null,
      // ธง "งานเร่ง/สำคัญ" ที่ผู้บริหารติดไว้ในแท็บ 👔 แผนผู้บริหาร (0=ปกติ 1=สำคัญ 2=เร่งด่วน)
      priority: Number(m.priority) || 0, priority_note: (m.priority_note as string) ?? null,
      // ใบที่แบ่งจำนวนตามไซส์ → จำนวนรวมมาจากผลบวกไซส์ แก้จำนวนตรง ๆ ไม่ได้ (ต้องแก้ที่หน้าใบสั่งผลิต)
      has_sizes: Array.isArray(m.size_breakdown) && (m.size_breakdown as unknown[]).length > 0,
      ...inf, labor: laborOfMo(String(m.mo_no)), central_rate: centralRateOf(String(m.mo_no)) };
  });
  const pending = allMos.filter((m) => m.remaining > 0.0001);   // การ์ดโซน "รอจ่าย" = ยังจ่ายไม่ครบ
  // ใบที่จ่ายงานครบแล้วแต่ยังไม่ปิด — ไม่ใช่การ์ดรอจ่าย แต่ "ยังต้องส่งลูกค้า"
  // → ปฏิทินนัดส่งลูกค้าต้องเห็นด้วย ไม่งั้นค้นหาใบพวกนี้ไม่เจอ (บั๊กที่เจอกับ CTL107-01)
  const dispatchedMos = allMos.filter((m) => m.remaining <= 0.0001);

  // เช็กลิสต์วัตถุดิบจาก BOM ต่อใบ (ดึงมาแล้วในรอบ parallel ข้างบน: sumsRes/matsRes) — เตรียม=is_ready, ตัด=cut_done
  const prog = new Map<string, { prepTotal: number; prepDone: number; cutTotal: number; cutDone: number }>();
  for (const s of (sumsRes.data ?? []) as Record<string, unknown>[]) {
    const k = String(s.mo_no);
    const p = prog.get(k) ?? { prepTotal: 0, prepDone: 0, cutTotal: 0, cutDone: 0 };
    p.prepTotal += 1; if (s.is_ready) p.prepDone += 1;
    prog.set(k, p);
  }
  for (const x of (matsRes.data ?? []) as Record<string, unknown>[]) {
    if (!needsCut(x as CutFields)) continue;   // ไม่นับอะไหล่ (ให้ตรงกับตัวนับในป๊อปอัป/ตาราง)
    const k = String(x.mo_no);
    const p = prog.get(k) ?? { prepTotal: 0, prepDone: 0, cutTotal: 0, cutDone: 0 };
    p.cutTotal += 1; if (x.cut_done) p.cutDone += 1;
    prog.set(k, p);
  }
  const pendingEnriched = pending.map((p) => {
    const pr = prog.get(String(p.mo_no));
    if (pr && pr.prepTotal > 0) {
      const ready = pr.prepDone >= pr.prepTotal && pr.cutDone >= pr.cutTotal;
      return { ...p, has_bom: true, prep_total: pr.prepTotal, prep_ready: pr.prepDone, cut_total: pr.cutTotal, cut_ready: pr.cutDone, ready };
    }
    return { ...p, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: p.prep_done && p.cut_done };
  });

  // งานเหมารายชิ้นที่ "รอจ่าย" (ติ๊กแล้ว ยังไม่จ่ายให้ช่างเหมา) → โผล่เป็นการ์ดในโซนรอจ่าย
  const moInfoByNo = new Map<string, { sku: string | null; name: string | null }>();
  for (const m of moList) moInfoByNo.set(String(m.mo_no), { sku: (m.product_sku as string) ?? null, name: (m.product_name as string) ?? null });
  const pendingPiece = ((pcsRes.data ?? []) as Record<string, unknown>[])
    .filter((p) => p.status !== "done" && !(p.assignee_name as string))
    .map((p) => {
      const moNo = String(p.mo_no);
      const mi = moInfoByNo.get(moNo) ?? { sku: null, name: null };
      const inf = (mi.sku && info.get(String(mi.sku).trim())) || { image_url: null, brand: null, brand_color: null, brand_oem: false, color: null };
      return { id: String(p.id), mo_no: moNo, job_name: (p.job_name as string) ?? "งานเหมา", rate: Number(p.rate) || 0, qty_per: Number(p.qty_per) || 1, qty: Number(p.total_qty) || 0, product_sku: mi.sku, product_name: mi.name, ...inf };
    });

  // งวดส่ง (แบ่งส่งหลายวันต่อ 1 ใบ) — ปฏิทินนัดส่งลูกค้าเอาไปโชว์ทีละงวด
  const openMoIds = allMos.map((m) => m.id);
  const { data: plans } = openMoIds.length
    ? await admin.from("mo_delivery_plan").select("id, mo_id, mo_no, due_date, qty, note, shipped, shipped_at, dn_number, delivery_note_id")
        .in("mo_id", openMoIds).eq("is_active", true).order("due_date", { ascending: true })
    : { data: [] as Record<string, unknown>[] };

  return NextResponse.json({ departments, workOrders: enrichedWO, pending: pendingEnriched,
    dispatched_mos: dispatchedMos, delivery_plans: plans ?? [], pending_piece: pendingPiece, error: null });
}
