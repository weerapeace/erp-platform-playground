/**
 * POST /api/master-v2/<entity>/import — นำเข้าข้อมูลแบบ "ของกลาง" (ทุกโมดูล)
 *
 * body: { rows: Record<string,unknown>[], mode: "create"|"upsert", uniqueKey?, actor? }
 * - resolve ค่า relation ที่เป็น "ชื่อ" → id อัตโนมัติ (อ่าน relation_config จากทะเบียน field)
 * - create = insert ทั้ง batch · upsert = onConflict <uniqueKey>
 * - คืนรายงาน { total, created, updated, failed[], audit_id }
 *
 * client ควรแบ่ง batch ทีละ ~100–200 แถว (กัน Worker CPU/subrequest limit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveEntity, friendlyDbError } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

type Body = { rows?: unknown; mode?: "create" | "upsert" | "update"; uniqueKey?: string; actor?: string };
type Failed = { row: number; code?: string; sku?: string; error: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
): Promise<NextResponse> {
  const { entity } = await params;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: Body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
  const mode = body.mode === "upsert" ? "upsert" : body.mode === "update" ? "update" : "create";
  if (rows.length === 0) return NextResponse.json({ error: "ไม่มีข้อมูลนำเข้า" }, { status: 400 });
  if (rows.length > 500) return NextResponse.json({ error: "นำเข้าครั้งละไม่เกิน 500 แถว — แบ่งไฟล์/แบ่ง batch" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = body.actor ?? user.email ?? "system";

  // ---- อ่าน relation fields จากทะเบียน (เพื่อแปลงชื่อ → id) ----
  const { data: mod } = await admin.from("erp_modules").select("id").eq("table_name", cfg.table).maybeSingle();
  let relFields: { col: string; tgt: string; labelField: string }[] = [];
  if (mod) {
    const { data: flds } = await admin.from("erp_module_fields")
      .select("column_name, ui_field_type, relation_config")
      .eq("module_id", mod.id).eq("is_active", true).eq("ui_field_type", "relation");
    relFields = (flds ?? []).map((f) => {
      const rc = (f.relation_config ?? {}) as Record<string, unknown>;
      return { col: String(f.column_name ?? ""), tgt: String(rc.target_table ?? ""), labelField: String(rc.target_label_field ?? "name") };
    }).filter((r) => r.col && r.tgt && SAFE.test(r.tgt) && SAFE.test(r.labelField));
  }

  // ---- สร้าง map ชื่อ→id ของแต่ละ relation (เฉพาะค่าที่อยู่ใน batch นี้) ----
  const relMap: Record<string, Map<string, string>> = {};
  for (const rf of relFields) {
    const vals = [...new Set(rows.map((r) => r[rf.col]).filter((v) => v != null && v !== "" && !UUID_RE.test(String(v))).map((v) => String(v)))];
    relMap[rf.col] = new Map();
    if (vals.length === 0) continue;
    const { data: td } = await admin.from(rf.tgt).select(`id, ${rf.labelField}`).in(rf.labelField, vals);
    (td ?? []).forEach((t) => { const o = t as Record<string, unknown>; relMap[rf.col].set(String(o[rf.labelField]).toLowerCase(), String(o.id)); });
  }

  // ---- เตรียมแถว: แปลง relation + คงเลขแถวจริงไว้ (สำหรับรายงาน) ----
  const failed: Failed[] = [];
  const resolved: { row: number; data: Record<string, unknown> }[] = [];   // แถวที่ผ่าน relation แล้ว
  rows.forEach((r, i) => {
    const out: Record<string, unknown> = { ...r };
    // id ว่าง/ไม่ใช่ uuid → ตัดทิ้ง (ให้ DB สร้างเอง / ไม่ใช้ match)
    if (out.id == null || out.id === "" || !UUID_RE.test(String(out.id))) delete out.id;
    else out.id = String(out.id);
    let err: string | null = null;
    for (const rf of relFields) {
      const v = r[rf.col];
      if (v == null || v === "") { out[rf.col] = null; continue; }
      if (UUID_RE.test(String(v))) { out[rf.col] = String(v); continue; }
      const id = relMap[rf.col]?.get(String(v).toLowerCase());
      if (!id) { err = `${rf.col}: ไม่พบ "${String(v)}" ใน ${rf.tgt}`; break; }
      out[rf.col] = id;
    }
    if (err) { failed.push({ row: i + 1, code: String(r.code ?? r.sku ?? ""), error: err }); return; }
    // เติมชื่อไทยอัตโนมัติถ้าว่าง (partners) — ใช้ Display/อังกฤษ/รหัสแทน เพื่อให้ผ่าน NOT NULL
    if (cfg.table === "partners_v2") {
      const txt = (k: string) => { const v = out[k]; return v == null ? "" : String(v).trim(); };
      if (!txt("name_th")) { const alt = txt("display_name") || txt("name_en") || txt("code"); if (alt) out.name_th = alt; }
    }
    resolved.push({ row: i + 1, data: out });
  });

  let created = 0, updated = 0;
  const withDefaults = (r: Record<string, unknown>) => ({ ...(cfg.defaults ?? {}), ...r });
  const PERROW_CAP = 200;

  // เขียนลง DB แบบ batch; ถ้าก้อนพัง → ลองทีละแถว เพื่อให้แถวดีเข้าได้ + รายงานเฉพาะแถวที่พังจริง
  const writeRows = async (items: { row: number; data: Record<string, unknown> }[], upsertKey: string | null): Promise<number> => {
    if (items.length === 0) return 0;
    const run = (arr: Record<string, unknown>[]) => upsertKey
      ? admin.from(cfg.table).upsert(arr, { onConflict: upsertKey }).select("id")
      : admin.from(cfg.table).insert(arr).select("id");
    const { data, error } = await run(items.map((it) => it.data));
    if (!error) return data?.length ?? items.length;
    if (items.length > PERROW_CAP) {   // ใหญ่เกิน → ไม่ไล่ทีละแถว (กัน subrequest เกิน)
      const m = friendlyDbError(error.message);
      items.forEach((it) => failed.push({ row: it.row, error: m }));
      return 0;
    }
    let ok = 0;
    for (const it of items) {
      const r = await run([it.data]);
      if (r.error) failed.push({ row: it.row, error: friendlyDbError(r.error.message) });
      else ok++;
    }
    return ok;
  };

  if (mode === "update") {
    const withId = resolved.filter((x) => x.data.id);
    const withoutId = resolved.filter((x) => !x.data.id).map((x) => ({ row: x.row, data: withDefaults(x.data) }));
    updated += await writeRows(withId, "id");
    created += await writeRows(withoutId, null);
  } else if (resolved.length > 0) {
    const items = resolved.map((x) => ({ row: x.row, data: withDefaults(x.data) }));
    const uniqueKey = body.uniqueKey && SAFE.test(body.uniqueKey) ? body.uniqueKey : null;
    if (mode === "upsert" && uniqueKey) updated += await writeRows(items, uniqueKey);
    else created += await writeRows(items, null);
  }

  // audit (best-effort)
  await admin.from("erp_audit_logs").insert({
    actor_name: actor, action: "import", module: entity,
    new_value: { total: rows.length, created, updated, failed: failed.length },
  }).then(() => {}, () => {});

  return NextResponse.json({
    data: { total: rows.length, created, updated, failed, audit_id: "" },
    error: null,
  });
}
