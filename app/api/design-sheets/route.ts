/**
 * Design Sheets API — ใบงานออกแบบสินค้าใหม่ (เฟส 1)
 *
 * GET  /api/design-sheets?search=&status=&brand_id=&archived=&limit=&offset=&sort_by=&sort_dir=
 *      → list (server mode) + รูปหลักจากระบบแนบไฟล์กลาง (erp_playground_attachments)
 * POST /api/design-sheets → สร้างใบงาน (เลขรันอัตโนมัติ DS-{YYYY}-{0000})
 *
 * ของกลาง: guardApi (products.view/products.edit) + writeAudit → audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";
import { isValidDsStatus } from "./shared";
import { designSheetCoverMap } from "@/lib/design-sheet-covers";
import { loadChecklistSummaries } from "@/lib/record-tasks-server";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import type { ChecklistSummary } from "@/lib/record-tasks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DesignSheetListItem = {
  id: string; code: string; name: string;
  brand_id: string | null; brand_name: string | null; brand_color: string | null;
  brand_is_customer_job: boolean | null;   // 👤 งานลูกค้า (null = ไม่ระบุแบรนด์) — แยกมุมมองงานลูกค้า / แบรนด์เรา
  status: string; order_date: string | null; deadline: string | null;
  drive_link: string | null; note: string | null; is_active: boolean;
  detail_excerpt: string | null;   // ตัวอย่างข้อความจาก "รายละเอียดงาน" (ตัด HTML แล้ว) ไว้โชว์บนการ์ด
  updated_at: string; cover_url: string | null;
  // เฟส 8 (Canvas): สถานะความครบของขั้นตอน — ไว้โชว์ไฟบนการ์ด
  has_cost: boolean; has_quote: boolean; parent_count: number;
  // 🪟 กล่อง hover (Design Dashboard): รออะไรอยู่ · เสนอราคาครั้งล่าสุด · comment ลูกค้าล่าสุด
  waiting_for: string | null;              // ช่องข้อความเดิม (เลิกใช้แล้ว — ย้ายเป็นเช็กลิสต์ 2026-10-23 · เก็บไว้สำรอง)
  waiting_items: ChecklistSummary | null;  // ⏳ เช็กลิสต์รออะไรอยู่ (lib/design-sheet-waiting) · null = ไม่มีรายการ
  quote_latest: QuoteLatest | null;
  comments_latest: { date: string | null; body: string }[];
};
/** เสนอราคาครั้งล่าสุด — status = pending/passed/failed หรือ "mixed" (ช่องในครั้งเดียวกันสถานะไม่เท่ากัน)
 *  cells.price = ราคาที่เสนอจริง (offered_price) เท่านั้น — ไม่ส่งต้นทุนจากตีราคา (price) ออกไป */
export type QuoteLatest = {
  no: number; date: string | null; status: string;
  cells: { size: string | null; qty: number | null; label: string | null; price: number | null }[];
};

// ตัด HTML จาก "รายละเอียดงาน" → ข้อความสั้น ๆ สำหรับโชว์บนการ์ด (ไม่ส่ง HTML ก้อนใหญ่ไป client)
function excerptHtml(html: string | null | undefined, max = 160): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])>/gi, " ")   // ขึ้นบรรทัด → เว้นวรรค
    .replace(/<[^>]*>/g, "")                              // ตัด tag ที่เหลือ
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/** เสนอราคาครั้งล่าสุดของใบ — จัดกลุ่ม "ครั้ง" แบบเดียวกับแท็บเสนอราคา (batch · แถวเก่าไม่มี batch ใช้วันที่) */
function latestQuote(rows: Array<Record<string, unknown>>): QuoteLatest | null {
  if (!rows.length) return null;
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const k = r.batch != null ? `b:${String(Number(r.batch)).padStart(6, "0")}` : `d:${String(r.quote_date ?? "")}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  // ครั้งที่มีเลข batch มาทีหลังครั้งเก่าที่ไม่มี batch เสมอ ("b:" > "d:") · ในกลุ่มเดียวกันเรียงตามเลขครั้งย่อย (round)
  const keys = [...groups.keys()].sort();
  const lastKey = keys[keys.length - 1];
  const qs = [...groups.get(lastKey)!].sort((a, b) => Number(a.round ?? 0) - Number(b.round ?? 0));
  const sts = new Set(qs.map((q) => String(q.status ?? "pending")));
  const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
  return {
    no: lastKey.startsWith("b:") ? Number(qs[0].batch) : keys.length,
    date: (qs[0].quote_date as string) ?? null,
    status: sts.size === 1 ? [...sts][0] : "mixed",
    cells: qs.map((q) => {
      const qty = num(q.qty);
      const note = String(q.note ?? "").trim();
      return {
        size: String(q.parent_code ?? "").trim() || null, qty,
        label: note && note !== String(qty ?? "") ? note.slice(0, 60) : null,
        price: num(q.offered_price),
      };
    }),
  };
}

async function nextDsNo(admin: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data, error } = await admin.rpc("erp_next_number", { p_key: "ds" });
  if (!error && data) return String(data);
  // fallback กันพลาด
  const yr = new Date().getFullYear();
  const { count } = await admin.from("design_sheets").select("id", { count: "exact", head: true });
  return `DS-${yr}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

/** รูปหลักของแต่ละใบงาน — ของกลาง lib/design-sheet-covers (อีเมลรายงานงานค้างใช้ตัวเดียวกัน) */
const coverMap = designSheetCoverMap;

// ---- GET list ----
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search   = (searchParams.get("search") ?? "").trim();
  const status   = (searchParams.get("status") ?? "").trim();
  const brandId  = (searchParams.get("brand_id") ?? "").trim();
  const archived = searchParams.get("archived") === "1";   // โชว์ที่เก็บเข้ากรุ
  // ids=<id,id,...> → ดึงเฉพาะใบที่ระบุ (ไม่สนกรุ) — ใช้ซิงค์การ์ดใบงานบนกระดานแคมเปญ ให้ยิงครั้งเดียวแทนยิงราย id
  const idList = (searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  const limit  = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const SAFE = ["code", "name", "status", "order_date", "deadline", "created_at", "updated_at", "sort_order"];
  const sortBy = searchParams.get("sort_by");
  const orderCol = sortBy && SAFE.includes(sortBy) ? sortBy : "updated_at";
  const orderAsc = sortBy ? searchParams.get("sort_dir") === "asc" : false;

  const admin = supabaseAdmin();
  let q = admin.from("design_sheets")
    .select("id, code, name, brand_id, status, order_date, deadline, drive_link, note, detail, is_active, updated_at, parent_sku_codes, waiting_for, brand:brands!brand_id(name, color, is_customer_job)", { count: "exact" })
    .order(orderCol, { ascending: orderAsc })
    .range(offset, offset + Math.max(limit, idList.length) - 1);
  if (idList.length) q = q.in("id", idList);
  else q = q.eq("is_active", !archived);
  if (search)  { const t = `%${search}%`; q = q.or(`code.ilike.${t},name.ilike.${t}`); }
  if (status)  q = q.eq("status", status);
  if (brandId) q = q.eq("brand_id", brandId);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ data: [], total: 0, error: friendlyDbError(error.message) }, { status: 500 });

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((r) => String(r.id));
  const covers = await coverMap(admin, ids);
  // เฟส 8: ขั้นตอนที่ทำแล้ว (มีบรรทัดตีราคา? / มีรอบเสนอราคา?) — batch ครั้งเดียวต่อหน้า
  const withCost = new Set<string>(), withQuote = new Set<string>();
  const quotesBy = new Map<string, Array<Record<string, unknown>>>();
  const commentsBy = new Map<string, { date: string | null; body: string }[]>();
  let waitingBy = new Map<string, ChecklistSummary>();
  if (ids.length) {
    const [cl, ql, cm, wt] = await Promise.all([
      admin.from("design_sheet_cost_lines").select("sheet_id").in("sheet_id", ids),
      admin.from("design_sheet_quotes").select("sheet_id, batch, round, quote_date, status, parent_code, qty, offered_price, note").in("sheet_id", ids),
      admin.from("design_sheet_comments").select("sheet_id, comment_date, body, created_at").in("sheet_id", ids)
        .order("comment_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(3000),
      // เช็กลิสต์พลาดก็ยังโชว์รายการใบงานได้ (แค่ไม่มีแถบ ⏳ บนการ์ด)
      loadChecklistSummaries(admin, DESIGN_WAITING.moduleKey, ids).catch((e) => { console.error("[design-sheets] waiting", e); return new Map<string, ChecklistSummary>(); }),
    ]);
    waitingBy = wt;
    for (const r of (cl.data ?? []) as Array<Record<string, unknown>>) withCost.add(String(r.sheet_id));
    for (const r of (ql.data ?? []) as Array<Record<string, unknown>>) {
      const sid = String(r.sheet_id); withQuote.add(sid);
      (quotesBy.get(sid) ?? quotesBy.set(sid, []).get(sid)!).push(r);
    }
    for (const r of (cm.data ?? []) as Array<Record<string, unknown>>) {
      const sid = String(r.sheet_id); const list = commentsBy.get(sid) ?? commentsBy.set(sid, []).get(sid)!;
      const body = String(r.body ?? "").trim();
      if (body && list.length < 3) list.push({ date: (r.comment_date as string) ?? null, body: body.length > 200 ? body.slice(0, 200).trimEnd() + "…" : body });
    }
  }
  const items: DesignSheetListItem[] = rows.map((r) => {
    const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string; color?: string | null; is_customer_job?: boolean | null } | null;
    const id = String(r.id);
    return {
      id, code: String(r.code), name: String(r.name),
      brand_id: (r.brand_id as string) ?? null, brand_name: b?.name ?? null, brand_color: b?.color ?? null,
      brand_is_customer_job: b ? !!b.is_customer_job : null,
      status: String(r.status ?? "design"), order_date: (r.order_date as string) ?? null, deadline: (r.deadline as string) ?? null,
      drive_link: (r.drive_link as string) ?? null, note: (r.note as string) ?? null, is_active: !!r.is_active,
      detail_excerpt: excerptHtml(r.detail as string | null),
      updated_at: String(r.updated_at), cover_url: covers.get(id) ?? null,
      has_cost: withCost.has(id), has_quote: withQuote.has(id),
      parent_count: Array.isArray(r.parent_sku_codes) ? (r.parent_sku_codes as unknown[]).length : 0,
      waiting_for: ((r.waiting_for as string) ?? "").trim() || null,
      waiting_items: waitingBy.get(id) ?? null,
      quote_latest: latestQuote(quotesBy.get(id) ?? []),
      comments_latest: commentsBy.get(id) ?? [],
    };
  });
  return NextResponse.json({ data: items, total: count ?? 0, error: null });
}

// ---- POST create ----
type CreateBody = {
  name?: string; brand_id?: string | null; detail?: string | null; note?: string | null;
  status?: string; order_date?: string | null; deadline?: string | null; appointment_date?: string | null; drive_link?: string | null;
  waiting_for?: string | null;            // ⏳ รออะไรอยู่ (พิมพ์เอง)
  parent_sku_code?: string | null;        // เดิม (รหัสเดี่ยว) — ยังรองรับเพื่อ backward compat
  parent_sku_codes?: string[];            // ใหม่ — หลายรหัส
  parent_sku_drafts?: string[];           // ข้อ 6: ร่าง Parent (ชื่อ ยังไม่มีรหัสจริง)
};

// รวม/ปรับรหัส Parent SKU จาก payload (รองรับทั้งฟิลด์เดี่ยวเดิม + array ใหม่) → uppercase, ตัดช่องว่าง, ตัดซ้ำ
function normalizeParentCodes(body: { parent_sku_code?: string | null; parent_sku_codes?: string[] }): string[] {
  const raw = Array.isArray(body.parent_sku_codes)
    ? body.parent_sku_codes
    : (body.parent_sku_code ? [body.parent_sku_code] : []);
  const out: string[] = [];
  for (const c of raw) {
    const code = String(c ?? "").trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: CreateBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่องาน" }, { status: 400 });

  const admin = supabaseAdmin();
  const status = body.status && (await isValidDsStatus(admin, body.status)) ? body.status : "design";

  // ตั้ง Parent SKU ตั้งแต่ตอนสร้าง (หลายรหัสได้) — รหัสซ้ำในระบบ = ห้ามบันทึก (เฟส 5)
  const parentCodes = normalizeParentCodes(body);
  if (parentCodes.length) {
    const { data: dup } = await admin.from("parent_skus_v2").select("code").in("code", parentCodes);
    const taken = (dup ?? []).map((d) => String((d as { code: string }).code).toUpperCase());
    if (taken.length) {
      return NextResponse.json({ error: `รหัส ${taken.join(", ")} มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ` }, { status: 400 });
    }
  }

  // ข้อ 6: ร่าง Parent (ชื่อล้วน) — sanitize + dedupe
  const parentDrafts: string[] = [];
  for (const d of Array.isArray(body.parent_sku_drafts) ? body.parent_sku_drafts : []) {
    const s = String(d ?? "").trim().slice(0, 200);
    if (s && !parentDrafts.includes(s)) parentDrafts.push(s);
  }

  const code = await nextDsNo(admin);
  const { data: row, error } = await admin.from("design_sheets").insert({
    code, name, brand_id: body.brand_id || null, detail: body.detail ?? null, note: body.note ?? null,
    status, order_date: body.order_date || null, deadline: body.deadline || null,
    appointment_date: body.appointment_date || null,
    drive_link: body.drive_link?.trim() || null,
    waiting_for: String(body.waiting_for ?? "").trim().slice(0, 300) || null,
    parent_sku_codes: parentCodes, parent_sku_code: parentCodes[0] ?? null,   // เก็บ array + ตัวแรก (backward compat)
    parent_sku_drafts: parentDrafts,
    is_active: true, created_by: user?.id ?? null,
  }).select("id, code").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "design_sheet", entityId: row.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { code, name },
  });
  return NextResponse.json({ id: row.id, code, error: null });
}
