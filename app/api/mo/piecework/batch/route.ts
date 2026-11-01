/**
 * จ่ายงานเหมาแบบตาราง (หน้าต่าง "จ่ายงานเหมา" บนบอร์ด) — /api/mo/piecework/batch
 *   GET ?mo_nos=a,b     → ข้อมูลตั้งต้นต่อใบ: จำนวนสั่ง · งานเหมาใน BOM · ที่จ่ายไปแล้ว · ใบจ่ายงานที่ยังไม่เข้า QC + รายชื่องานเหมา
 *   GET ?open=1         → งานเหมาที่ยังไม่รับคืน (แท็บ "รับงานคืน")
 *   GET ?batch= / ?ids= → แถวสำหรับพิมพ์ใบจ่ายงานเหมา
 *   POST { batch_id, date, lines, save_bom, bom_scope }   → จ่ายงานเหมา (1 แถว = งาน × คน) + บันทึกเข้า BOM
 *        batch_id ซ้ำ = ไม่บันทึกซ้ำ (กดซ้ำ/เน็ตช้า) · ใบที่ส่งเข้า QC ครบแล้ว / ปิด / ยกเลิก = ไม่รับ
 *   POST { action: "done", items: [{ id, qty, rest }] }  → รับงานคืน/เสร็จ (รับไม่ครบ: keep = ที่เหลือแยกแถวใหม่ให้คนเดิม · drop = ไม่ทำแล้ว)
 * ของกลาง: guardApi (products.view / products.edit เหมือน /api/mo/piecework) · audit mo.piecework_dispatch / mo.piecework_done
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { pwDonePlan, pwDupLines, pwJobKey, pwValidate, type PwDoneItem, type PwLine } from "@/lib/piecework-dispatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const num = (v: unknown, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const PW_COLS = "id, mo_no, job_id, job_name, rate, qty_per, total_qty, status, assignee_id, assignee_name, wo_id, dispatched_at, done_qty, done_at, batch_id, created_at";

export type PwMoInfo = {
  mo_no: string; mo_id: string; qty: number; status: string; product_sku: string | null; product_name: string | null; bom_code: string | null;
  image_url: string | null;
  /** ใบจ่ายงานที่ยังไม่เข้า QC ครบ (ผูกแถวงานเหมาให้อัตโนมัติถ้ามีใบเดียว) */
  wos: { id: string; wo_no: string; assignee_name: string | null; department_name: string | null; qty: number }[];
  in_qc: boolean;
  tmpl: { job_id: string | null; job_name: string; rate: number; qty_per: number }[];
  existing: PwRow[];
};
export type PwRow = {
  id: string; mo_no: string; job_id: string | null; job_name: string; rate: number; qty_per: number; total_qty: number; status: string;
  assignee_id: string | null; assignee_name: string | null; wo_id: string | null; dispatched_at: string | null; done_qty: number | null;
  done_at: string | null; batch_id: string | null; created_at: string;
  product_sku?: string | null; product_name?: string | null; image_url?: string | null; mo_qty?: number;
};
export type PwJob = { id: string; name: string; default_rate: number; is_detail: boolean };

const toRow = (r: Row): PwRow => ({
  id: String(r.id), mo_no: String(r.mo_no ?? ""), job_id: (r.job_id as string) ?? null, job_name: String(r.job_name ?? ""),
  rate: num(r.rate), qty_per: num(r.qty_per, 1), total_qty: num(r.total_qty), status: String(r.status ?? "pending"),
  assignee_id: (r.assignee_id as string) ?? null, assignee_name: (r.assignee_name as string) ?? null, wo_id: (r.wo_id as string) ?? null,
  dispatched_at: (r.dispatched_at as string) ?? null, done_qty: r.done_qty == null ? null : num(r.done_qty), done_at: (r.done_at as string) ?? null,
  batch_id: (r.batch_id as string) ?? null, created_at: String(r.created_at ?? ""),
});

/** รูปสินค้า: ปก SKU → ปกสินค้าแม่ */
async function skuInfo(admin: Admin, codes: string[]): Promise<Map<string, { image_url: string | null; name: string | null }>> {
  const out = new Map<string, { image_url: string | null; name: string | null }>();
  const list = [...new Set(codes.filter(Boolean))];
  for (let i = 0; i < list.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("code, sku_name, cover_image_r2_key, parent:parent_skus_v2!parent_sku_id ( cover_image_r2_key )").in("code", list.slice(i, i + 300));
    for (const s of (data ?? []) as Row[]) {
      const parent = (Array.isArray(s.parent) ? s.parent[0] : s.parent) as { cover_image_r2_key?: string | null } | null;
      const key = (s.cover_image_r2_key as string | null) || parent?.cover_image_r2_key || null;
      out.set(String(s.code), { image_url: key ? `/api/r2-image?key=${encodeURIComponent(key)}` : null, name: (s.sku_name as string) ?? null });
    }
  }
  return out;
}

async function withMoInfo(admin: Admin, rows: PwRow[]): Promise<PwRow[]> {
  const moNos = [...new Set(rows.map((r) => r.mo_no))];
  if (!moNos.length) return rows;
  const { data: mos } = await admin.from("manufacturing_orders").select("mo_no, qty, product_sku, product_name").in("mo_no", moNos);
  const byNo = new Map(((mos ?? []) as Row[]).map((m) => [String(m.mo_no), m]));
  const imgs = await skuInfo(admin, ((mos ?? []) as Row[]).map((m) => String(m.product_sku ?? "")));
  return rows.map((r) => {
    const m = byNo.get(r.mo_no); const sku = (m?.product_sku as string) ?? null;
    return { ...r, product_sku: sku, product_name: (m?.product_name as string) ?? null, image_url: sku ? imgs.get(sku)?.image_url ?? null : null, mo_qty: num(m?.qty) };
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const admin = supabaseAdmin();

  // ── แถวสำหรับพิมพ์ / แท็บรับงานคืน
  const batch = (sp.get("batch") ?? "").trim();
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(isUuid);
  if (batch || ids.length || sp.get("open") === "1") {
    let q = admin.from("mo_piecework").select(PW_COLS).eq("is_active", true);
    if (batch) q = q.eq("batch_id", batch);
    else if (ids.length) q = q.in("id", ids.slice(0, 500));
    else q = q.neq("status", "done").not("assignee_name", "is", null);
    const { data, error } = await q.order("assignee_name").order("created_at").limit(2000);
    if (error) return NextResponse.json({ data: [], error: "โหลดงานเหมาไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ data: await withMoInfo(admin, ((data ?? []) as Row[]).map(toRow)), error: null });
  }

  // ── ข้อมูลตั้งต้นต่อใบสั่งผลิต
  const moNos = [...new Set((sp.get("mo_nos") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 200);
  const { data: jobsRaw } = await admin.from("piecework_jobs").select("id, name, default_rate, is_detail").eq("is_active", true).order("sort_order").order("name");
  const jobs: PwJob[] = ((jobsRaw ?? []) as Row[]).map((j) => ({ id: String(j.id), name: String(j.name ?? ""), default_rate: num(j.default_rate), is_detail: !!j.is_detail }));
  if (!moNos.length) return NextResponse.json({ data: [], jobs, error: null });

  const { data: mosRaw } = await admin.from("manufacturing_orders").select("id, mo_no, qty, status, product_sku, product_name, bom_code").in("mo_no", moNos);
  const mos = (mosRaw ?? []) as Row[];
  const bomCodes = [...new Set(mos.map((m) => m.bom_code as string).filter(Boolean))];
  const [{ data: tmplRaw }, { data: exRaw }, { data: wosRaw }, imgs] = await Promise.all([
    bomCodes.length ? admin.from("bom_piecework_lines").select("bom_code, job_id, job_name, rate, qty_per").in("bom_code", bomCodes).eq("is_active", true).order("sequence")
      : Promise.resolve({ data: [] as Row[] }),
    admin.from("mo_piecework").select(PW_COLS).in("mo_no", moNos).eq("is_active", true).order("created_at"),
    admin.from("mo_work_orders").select("id, wo_no, mo_no, assignee_name, department_id, qty, qc_pulled_qty, status").in("mo_no", moNos).eq("is_active", true),
    skuInfo(admin, mos.map((m) => String(m.product_sku ?? ""))),
  ]);
  const deptIds = [...new Set(((wosRaw ?? []) as Row[]).map((w) => w.department_id as string).filter(Boolean))];
  const { data: depts } = deptIds.length ? await admin.from("departments").select("id, name").in("id", deptIds) : { data: [] as Row[] };
  const deptName = new Map(((depts ?? []) as Row[]).map((d) => [String(d.id), String(d.name ?? "")]));
  const data: PwMoInfo[] = mos.map((m) => {
    const moNo = String(m.mo_no), sku = (m.product_sku as string) ?? null;
    const wosAll = ((wosRaw ?? []) as Row[]).filter((w) => w.mo_no === moNo && w.status !== "cancelled");
    const open = wosAll.filter((w) => num(w.qc_pulled_qty) < num(w.qty));
    const dn = (w: Row) => (w.department_id ? deptName.get(String(w.department_id)) ?? null : null);
    return {
      mo_no: moNo, mo_id: String(m.id), qty: num(m.qty), status: String(m.status ?? ""), product_sku: sku, product_name: (m.product_name as string) ?? null,
      bom_code: (m.bom_code as string) ?? null, image_url: sku ? imgs.get(sku)?.image_url ?? null : null,
      wos: open.map((w) => ({ id: String(w.id), wo_no: String(w.wo_no ?? ""), assignee_name: (w.assignee_name as string) ?? null, department_name: dn(w), qty: num(w.qty) })),
      in_qc: wosAll.length > 0 && open.length === 0,
      tmpl: ((tmplRaw ?? []) as Row[]).filter((t) => t.bom_code === m.bom_code)
        .map((t) => ({ job_id: (t.job_id as string) ?? null, job_name: String(t.job_name ?? ""), rate: num(t.rate), qty_per: num(t.qty_per, 1) })),
      existing: ((exRaw ?? []) as Row[]).filter((e) => e.mo_no === moNo).map(toRow),
    };
  });
  return NextResponse.json({ data, jobs, error: null });
}

type PostBody = {
  action?: string;
  batch_id?: string; date?: string; lines?: (PwLine & { wo_id?: string | null })[]; save_bom?: boolean; bom_scope?: "sku" | "parent";
  items?: PwDoneItem[];
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: PostBody; try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };

  if (b.action === "done") return markDone(admin, b.items ?? [], actor);

  // ── จ่ายงานเหมา
  const batchId = isUuid(b.batch_id) ? b.batch_id : null;
  if (!batchId) return NextResponse.json({ error: "ไม่มีเลขชุด (batch_id)" }, { status: 400 });
  const lines = (b.lines ?? []).map((l) => ({ ...l, job_name: String(l.job_name ?? "").trim(), assignee_name: String(l.assignee_name ?? "").trim(), qty: r2(num(l.qty)), rate: Math.max(0, num(l.rate)), qty_per: Math.max(0, num(l.qty_per, 1)) }));
  if (!lines.length) return NextResponse.json({ error: "ยังไม่มีงานเหมาให้จ่าย" }, { status: 400 });
  const bad = pwValidate(lines);
  if (bad.length) return NextResponse.json({ error: bad[0].msg }, { status: 400 });
  if (pwDupLines(lines).length) return NextResponse.json({ error: "มีแถวซ้ำ (งานเดียวกัน คนเดียวกัน ใบเดียวกัน) — รวมเป็นแถวเดียวก่อน" }, { status: 400 });
  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;

  // กดซ้ำ = ชุดนี้บันทึกไปแล้ว → ตอบเหมือนสำเร็จ ไม่บันทึกซ้ำ
  const { count: already } = await admin.from("mo_piecework").select("id", { count: "exact", head: true }).eq("batch_id", batchId);
  if ((already ?? 0) > 0) return NextResponse.json({ data: { batch_id: batchId, count: already, duplicate: true, bom_updated: 0 }, error: null });

  const moNos = [...new Set(lines.map((l) => l.mo_no))];
  const [{ data: mosRaw }, { data: wosRaw }] = await Promise.all([
    admin.from("manufacturing_orders").select("mo_no, qty, status, product_sku, bom_code").in("mo_no", moNos),
    admin.from("mo_work_orders").select("id, mo_no, qty, qc_pulled_qty, status").in("mo_no", moNos).eq("is_active", true),
  ]);
  const moBy = new Map(((mosRaw ?? []) as Row[]).map((m) => [String(m.mo_no), m]));
  for (const moNo of moNos) {
    const m = moBy.get(moNo);
    if (!m) return NextResponse.json({ error: `ไม่พบใบสั่งผลิต ${moNo}` }, { status: 404 });
    if (["done", "cancelled", "closed"].includes(String(m.status))) return NextResponse.json({ error: `${moNo} ปิด/ยกเลิกแล้ว — จ่ายงานเหมาไม่ได้` }, { status: 400 });
    const ws = ((wosRaw ?? []) as Row[]).filter((w) => w.mo_no === moNo && w.status !== "cancelled");
    if (ws.length && ws.every((w) => num(w.qc_pulled_qty) >= num(w.qty))) return NextResponse.json({ error: `${moNo} ส่งเข้า QC ครบแล้ว — จ่ายงานเหมาไม่ได้` }, { status: 400 });
  }

  // งานเหมาใหม่ (พิมพ์ชื่อเอง) → เพิ่มเข้ารายชื่องานเหมากลาง
  const jobIdOf = new Map<string, string | null>();
  for (const l of lines) {
    const k = pwJobKey(l.job_id, l.job_name);
    if (jobIdOf.has(k)) continue;
    if (isUuid(l.job_id)) { jobIdOf.set(k, l.job_id); continue; }
    const { data: found } = await admin.from("piecework_jobs").select("id").ilike("name", l.job_name).eq("is_active", true).limit(1).maybeSingle();
    if (found?.id) { jobIdOf.set(k, String(found.id)); continue; }
    const { data: ins, error } = await admin.from("piecework_jobs").insert({ name: l.job_name, default_rate: l.rate, is_active: true, sort_order: 999 }).select("id").single();
    if (error) return NextResponse.json({ error: `เพิ่มงานเหมา "${l.job_name}" ไม่สำเร็จ` }, { status: 400 });
    jobIdOf.set(k, String(ins.id));
    await writeAudit(admin, { action: "create", entityType: "piecework_jobs", entityId: String(ins.id), ...actor, metadata: { name: l.job_name, default_rate: l.rate, via: "piecework_dispatch" } });
  }

  const rows = lines.map((l) => ({
    mo_no: l.mo_no, job_id: jobIdOf.get(pwJobKey(l.job_id, l.job_name)) ?? null, job_name: l.job_name, rate: l.rate, qty_per: l.qty_per, total_qty: l.qty,
    is_detail: false, status: "pending", assignee_id: isUuid(l.assignee_id) ? l.assignee_id : null, assignee_name: l.assignee_name,
    wo_id: isUuid(l.wo_id) ? l.wo_id : null, dispatched_at: date, batch_id: batchId, created_by: user?.id ?? null,
  }));
  const { data: inserted, error } = await admin.from("mo_piecework").insert(rows).select("id");
  if (error) return NextResponse.json({ error: "บันทึกงานเหมาไม่สำเร็จ" }, { status: 400 });

  // บันทึกเข้า BOM: งาน + ชิ้นต่อใบ + ราคา (ไม่เก็บชื่อคน) · ทั้งรุ่น = BOM ล่าสุดของทุกสีใน Parent SKU เดียวกัน
  let bomUpdated = 0;
  if (b.save_bom) {
    const perMoJobs = new Map<string, Map<string, { job_id: string | null; job_name: string; rate: number; qty_per: number }>>();
    for (const l of lines) {
      const m = moBy.get(l.mo_no); const sku = String(m?.product_sku ?? ""); if (!sku) continue;
      const jm = perMoJobs.get(sku) ?? new Map(); const k = pwJobKey(l.job_id, l.job_name);
      if (!jm.has(k)) jm.set(k, { job_id: jobIdOf.get(k) ?? null, job_name: l.job_name, rate: l.rate, qty_per: l.qty_per });
      perMoJobs.set(sku, jm);
    }
    const bomsBySku = await bomCodesFor(admin, [...perMoJobs.keys()], b.bom_scope === "parent");
    const done = new Set<string>();
    for (const [sku, jm] of perMoJobs) {
      for (const bomCode of bomsBySku.get(sku) ?? []) {
        if (done.has(bomCode)) continue; done.add(bomCode);
        if (await upsertBomJobs(admin, bomCode, [...jm.values()])) bomUpdated++;
      }
    }
  }

  await writeAudit(admin, { action: "mo.piecework_dispatch", entityType: "mo_piecework", entityId: null, ...actor,
    metadata: { batch_id: batchId, count: rows.length, mo_nos: moNos, date, people: [...new Set(lines.map((l) => l.assignee_name))],
      total: r2(lines.reduce((a, l) => a + l.qty * l.rate, 0)), save_bom: !!b.save_bom, bom_scope: b.bom_scope ?? "sku", bom_updated: bomUpdated } });
  return NextResponse.json({ data: { batch_id: batchId, count: (inserted ?? []).length, duplicate: false, bom_updated: bomUpdated }, error: null });
}

/** BOM ที่ใช้อยู่ของ SKU (ทั้งรุ่น = ทุกสีใน Parent SKU เดียวกัน) → sku → [bom_code] */
async function bomCodesFor(admin: Admin, skus: string[], family: boolean): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const sku of skus) {
    let codes = [sku];
    if (family) {
      const { data: s } = await admin.from("skus_v2").select("parent_sku_id").eq("code", sku).maybeSingle();
      const pid = (s?.parent_sku_id as string) ?? null;
      if (pid) {
        const { data: sibs } = await admin.from("skus_v2").select("code").eq("parent_sku_id", pid).limit(2000);
        codes = [...new Set([sku, ...((sibs ?? []) as Row[]).map((x) => String(x.code))])];
      }
    }
    const boms: string[] = [];
    for (const code of codes) {
      const { data: bom } = await admin.from("bom_headers").select("bom_code").eq("product_sku", code).eq("is_active", true)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (bom?.bom_code) boms.push(String(bom.bom_code));
    }
    out.set(sku, boms);
  }
  return out;
}

/** เพิ่มงานเหมาเข้า BOM (ยังไม่มี = เพิ่มท้าย · มีแล้วราคาเปลี่ยน = อัปเดตราคา + เก็บประวัติราคา) — คืน true ถ้า BOM เปลี่ยน */
async function upsertBomJobs(admin: Admin, bomCode: string, jobs: { job_id: string | null; job_name: string; rate: number; qty_per: number }[]): Promise<boolean> {
  const { data: cur } = await admin.from("bom_piecework_lines").select("id, job_id, job_name, rate, sequence").eq("bom_code", bomCode).eq("is_active", true);
  const list = (cur ?? []) as Row[];
  let seq = list.reduce((a, r) => Math.max(a, num(r.sequence)), 0), changed = false;
  for (const j of jobs) {
    const hit = list.find((r) => (j.job_id && r.job_id === j.job_id) || String(r.job_name ?? "").trim().toLowerCase() === j.job_name.trim().toLowerCase());
    if (!hit) {
      const { error } = await admin.from("bom_piecework_lines").insert({ bom_code: bomCode, job_id: j.job_id, job_name: j.job_name, rate: j.rate, qty_per: j.qty_per || 1, sequence: ++seq, is_active: true });
      if (!error) changed = true;
    } else if (Math.abs(num(hit.rate) - j.rate) > 0.0001) {
      const { error } = await admin.from("bom_piecework_lines").update({ rate: j.rate, updated_at: new Date().toISOString() }).eq("id", String(hit.id));
      if (!error) {
        changed = true;
        if (j.job_id) await admin.from("piecework_rate_history").insert({ job_id: j.job_id, rate: j.rate, note: `BOM ${bomCode} (จ่ายงานเหมา)` });
      }
    }
  }
  return changed;
}

/** รับงานคืน / เสร็จ — รับไม่ครบ: keep = ที่เหลือแยกเป็นแถวใหม่ให้คนเดิม (ยังค้าง) · drop = ไม่ทำแล้ว */
async function markDone(admin: Admin, items: PwDoneItem[], actor: { actorId: string | null; actorName: string | null }): Promise<NextResponse> {
  const ids = items.map((i) => i.id).filter(isUuid);
  if (!ids.length) return NextResponse.json({ error: "ยังไม่ได้เลือกงานเหมา" }, { status: 400 });
  const { data } = await admin.from("mo_piecework").select("*").in("id", ids).eq("is_active", true);
  const byId = new Map(((data ?? []) as Row[]).map((r) => [String(r.id), r]));
  const now = new Date().toISOString();
  let ok = 0, split = 0; const fail: string[] = [];
  for (const it of items) {
    const r = byId.get(it.id);
    if (!r) { fail.push("ไม่พบรายการ (อาจถูกยกเลิกแล้ว)"); continue; }
    if (r.status === "done") { fail.push(`${r.job_name} (${r.assignee_name ?? "-"}) รับคืนไปแล้ว`); continue; }
    const plan = pwDonePlan({ total_qty: num(r.total_qty) }, it);
    const { error } = await admin.from("mo_piecework").update({ status: "done", done_at: now, done_qty: plan.done_qty, updated_at: now }).eq("id", it.id);
    if (error) { fail.push(`${r.job_name} (${r.assignee_name ?? "-"}) บันทึกไม่สำเร็จ`); continue; }
    ok++;
    if (plan.rest_qty > 0) {
      const { error: e2 } = await admin.from("mo_piecework").insert({
        mo_no: r.mo_no, job_id: r.job_id, job_name: r.job_name, rate: r.rate, qty_per: r.qty_per, total_qty: plan.rest_qty, is_detail: r.is_detail,
        note: `ที่เหลือจากรับคืน ${plan.done_qty}/${num(r.total_qty)}`, status: "pending", assignee_id: r.assignee_id, assignee_name: r.assignee_name,
        wo_id: r.wo_id, dispatched_at: r.dispatched_at, batch_id: r.batch_id, created_by: actor.actorId,
      });
      if (!e2) split++;
    }
  }
  await writeAudit(admin, { action: "mo.piecework_done", entityType: "mo_piecework", entityId: null, ...actor,
    metadata: { count: ok, split, items: items.slice(0, 200) } });
  return NextResponse.json({ data: { done: ok, split, fail }, error: fail.length && !ok ? fail[0] : null }, { status: fail.length && !ok ? 400 : 200 });
}
