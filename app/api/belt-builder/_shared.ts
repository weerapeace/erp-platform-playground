/**
 * Belt Builder API — ของกลางของ 3 ทรัพยากร (parts / size-rules / designs)
 *
 * ทุก handler: guardApi (สิทธิ์ belt_builder.view / .edit) → ตรวจค่าด้วย lib/belt-builder (pure, ใช้ร่วมกับหน้าจอ)
 *              → เขียนผ่าน supabaseAdmin (ตาราง RLS เปิด ไม่มี policy = เข้าได้แค่ทางนี้) → writeAudit ทุกการเปลี่ยน
 *
 * รูปแบบ URL/response ตรงกับที่ MasterCRUD (restApi) คาดหวัง:
 *   GET    /api/belt-builder/<res>?limit=&include_inactive=true&shop_id=&part_type=   → { data: rows[], total }
 *   POST   /api/belt-builder/<res>                                                      → { data: row }
 *   GET    /api/belt-builder/<res>/<id>                                                 → { data: row }
 *   PATCH  /api/belt-builder/<res>/<id>   (ส่งเฉพาะฟิลด์ที่แก้)                          → { data: row }
 *   DELETE /api/belt-builder/<res>/<id>?hard=1                                          → { id }
 *   (ลบธรรมดา = soft: is_active=false (+deleted_at) · กู้คืน = PATCH is_active=true)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError, parseDupError } from "@/app/api/master-v2/[entity]/route";
import type { ValidationResult } from "@/lib/belt-builder";

export const VIEW_PERM = "belt_builder.view";
export const EDIT_PERM = "belt_builder.edit";

type Col = { key: string; kind: "text" | "number" | "int" | "bool" | "json" | "uuid" };

export type CrudResource = {
  table:       string;
  entityType:  string;                       // ใช้ใน audit_logs.entity_type
  columns:     Col[];                        // คอลัมน์ที่ยอมให้เขียน (กันยัดคอลัมน์มั่ว)
  /** คอลัมน์ที่กรองแบบเท่ากับได้จาก query string (เช่น shop_id, part_type) */
  filterCols:  string[];
  orderBy:     { col: string; asc: boolean }[];
  /** ตรวจค่า (partial=true ตอน PATCH) */
  validate:    (body: Record<string, unknown>, opts: { partial?: boolean }) => ValidationResult;
  /** วิธีลบธรรมดา: "deleted_at" = ตั้ง is_active=false + deleted_at · "is_active" = ตั้ง is_active=false · null = ไม่มี soft (ลบจริงเสมอ) */
  softDelete:  "deleted_at" | "is_active" | null;
  /** ค่าเริ่มต้นตอนสร้าง (ถ้า body ไม่ส่งมา) */
  defaults?:   Record<string, unknown>;
  /** สรุปสั้นเก็บใน audit metadata */
  summary?:    (row: Record<string, unknown>) => Record<string, unknown>;
};

const asStr  = (v: unknown) => (v == null ? null : String(v).trim() || null);
const asNum  = (v: unknown) => { if (v === "" || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const asJson = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return undefined; } }
  return v;
};

/** แปลง body → เฉพาะคอลัมน์ที่อนุญาต + coerce ชนิด (คืน undefined ถ้า JSON พัง → ให้ validate จับ) */
export function pickColumns(res: CrudResource, body: Record<string, unknown>, opts: { partial: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of res.columns) {
    if (opts.partial && !(c.key in body)) continue;
    if (!opts.partial && !(c.key in body)) {
      if (res.defaults && c.key in res.defaults) out[c.key] = res.defaults[c.key];
      continue;
    }
    const v = body[c.key];
    switch (c.kind) {
      case "text":   out[c.key] = asStr(v); break;
      case "uuid":   out[c.key] = asStr(v); break;
      case "number": out[c.key] = asNum(v); break;
      case "int":    { const n = asNum(v); out[c.key] = n == null ? null : Math.round(n); break; }
      case "bool":   out[c.key] = v === true || v === "true" || v === 1 || v === "1"; break;
      case "json":   { const j = asJson(v); out[c.key] = j === undefined ? "__INVALID_JSON__" : j; break; }
    }
  }
  return out;
}

function badRequest(errors: string[], extra?: Record<string, unknown>) {
  return NextResponse.json({ data: null, error: errors.join(" · "), errors, ...(extra ?? {}) }, { status: 400 });
}

async function actorOf(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { actorId: user?.id ?? null, actorName: user?.email ?? null };
}

// ─── LIST ────────────────────────────────────────────────────────────────────
export async function listHandler(res: CrudResource, request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const limit = Math.min(2000, Math.max(1, parseInt(sp.get("limit") ?? "500", 10) || 500));
  const includeInactive = sp.get("include_inactive") === "true";
  const search = (sp.get("search") ?? "").trim();

  let q = supabaseAdmin().from(res.table).select("*", { count: "exact" });
  for (const col of res.filterCols) {
    const v = sp.get(col);
    if (v) q = q.eq(col, v);
  }
  if (!includeInactive && res.softDelete) q = q.eq("is_active", true);
  if (search) {
    const textCols = res.columns.filter((c) => c.kind === "text").map((c) => c.key);
    if (textCols.length) q = q.or(textCols.map((c) => `${c}.ilike.%${search.replace(/[,%]/g, " ")}%`).join(","));
  }
  for (const o of res.orderBy) q = q.order(o.col, { ascending: o.asc });
  const { data, error, count } = await q.limit(limit);
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? (data?.length ?? 0), error: null });
}

// ─── CREATE ──────────────────────────────────────────────────────────────────
export async function createHandler(res: CrudResource, request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return badRequest(["ข้อมูลที่ส่งมาไม่ใช่ JSON"]); }

  const payload = pickColumns(res, body, { partial: false });
  if (Object.values(payload).includes("__INVALID_JSON__")) return badRequest(["ค่า JSON ไม่ถูกต้อง (anchor / attrs / สูตร)"]);
  const v = res.validate(payload, {});
  if (!v.ok) return badRequest(v.errors);

  const admin = supabaseAdmin();
  const { data, error } = await admin.from(res.table).insert(payload).select("*").single();
  if (error) {
    const dup = parseDupError(error);
    return badRequest([friendlyDbError(error.message)], dup ? { dup } : undefined);
  }
  const actor = await actorOf(request);
  await writeAudit(admin, { action: "create", entityType: res.entityType, entityId: data.id, ...actor, metadata: res.summary?.(data) ?? {} });
  return NextResponse.json({ data, error: null });
}

// ─── GET ONE ─────────────────────────────────────────────────────────────────
export async function getHandler(res: CrudResource, request: NextRequest, id: string): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from(res.table).select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: friendlyDbError(error.message) }, { status: 500 });
  if (!data) return NextResponse.json({ data: null, error: "ไม่พบรายการนี้" }, { status: 404 });
  return NextResponse.json({ data, error: null });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────
export async function patchHandler(res: CrudResource, request: NextRequest, id: string): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return badRequest(["ข้อมูลที่ส่งมาไม่ใช่ JSON"]); }

  const patch = pickColumns(res, body, { partial: true });
  if (Object.values(patch).includes("__INVALID_JSON__")) return badRequest(["ค่า JSON ไม่ถูกต้อง (anchor / attrs / สูตร)"]);
  if (Object.keys(patch).length === 0) return badRequest(["ไม่มีฟิลด์ที่ต้องแก้"]);
  const v = res.validate(patch, { partial: true });
  if (!v.ok) return badRequest(v.errors);

  const admin = supabaseAdmin();
  const { data: before } = await admin.from(res.table).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบรายการนี้" }, { status: 404 });

  const out: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  // กู้คืน (is_active=true) → ล้าง deleted_at ด้วย
  if (res.softDelete === "deleted_at" && patch.is_active === true) out.deleted_at = null;

  const { data, error } = await admin.from(res.table).update(out).eq("id", id).select("*").single();
  if (error) {
    const dup = parseDupError(error);
    return badRequest([friendlyDbError(error.message)], dup ? { dup } : undefined);
  }
  const actor = await actorOf(request);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch)) {
    const b = (before as Record<string, unknown>)[k], a = (data as Record<string, unknown>)[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) changes[k] = { from: b, to: a };
  }
  await writeAudit(admin, { action: patch.is_active === true && before.is_active === false ? "restore" : "update", entityType: res.entityType, entityId: id, ...actor, metadata: { ...(res.summary?.(data) ?? {}), changes } });
  return NextResponse.json({ data, error: null });
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
export async function deleteHandler(res: CrudResource, request: NextRequest, id: string): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const hard = new URL(request.url).searchParams.get("hard") === "1" || !res.softDelete;
  const admin = supabaseAdmin();
  const { data: before } = await admin.from(res.table).select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบรายการนี้" }, { status: 404 });
  const actor = await actorOf(request);

  if (hard) {
    const { error } = await admin.from(res.table).delete().eq("id", id);
    if (error) return badRequest([friendlyDbError(error.message)]);
    await writeAudit(admin, { action: "delete", entityType: res.entityType, entityId: id, ...actor, metadata: { hard: true, ...(res.summary?.(before) ?? {}) } });
    return NextResponse.json({ id, error: null });
  }
  const patch: Record<string, unknown> = { is_active: false, updated_at: new Date().toISOString() };
  if (res.softDelete === "deleted_at") patch.deleted_at = new Date().toISOString();
  const { error } = await admin.from(res.table).update(patch).eq("id", id);
  if (error) return badRequest([friendlyDbError(error.message)]);
  await writeAudit(admin, { action: "archive", entityType: res.entityType, entityId: id, ...actor, metadata: { hard: false, ...(res.summary?.(before) ?? {}) } });
  return NextResponse.json({ id, error: null });
}

/** รายการ shops ที่เปิดอยู่ (ใช้เป็นตัวเลือกร้านบนหัวหน้า) */
export async function listShops(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("shops").select("id, slug, name, status").eq("status", "active").order("is_default", { ascending: false }).order("name");
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}
