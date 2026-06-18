/**
 * Creative Options API — ตัวเลือกที่ผู้ใช้จัดการได้ (ประเภทงาน/แพลตฟอร์ม)
 * GET    /api/creative-options?kind=task_type   (ไม่ใส่ kind = ทุกชนิด)
 * POST   /api/creative-options  { kind, label, key? }
 * แก้/ลบ ที่ /api/creative-options/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ----- map ชนิด → ตารางจริง (Phase A) -----
// คงรูป response เดิม { id, kind, key, label, sort_order, is_active } (key=code, label=name_th)
// เพื่อให้ use-options / หน้า settings เดิมใช้งานต่อได้โดยไม่ต้องแก้
const KIND_TABLE: Record<string, string> = { task_type: "erp_task_types", platform: "erp_platforms" };
const KINDS = new Set(Object.keys(KIND_TABLE));
const mapRow = (r: Record<string, unknown>, kind: string) => ({ id: r.id, kind, key: r.code, label: r.name_th, label_en: r.name_en ?? null, sort_order: r.sort_order, is_active: r.is_active });

function deriveKey(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "opt";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const kind = (new URL(request.url).searchParams.get("kind") ?? "").trim();
  const admin = supabaseAdmin();
  const kinds = kind ? [kind] : Object.keys(KIND_TABLE);
  const out: Record<string, unknown>[] = [];
  for (const k of kinds) {
    const table = KIND_TABLE[k]; if (!table) continue;
    const { data, error } = await admin.from(table).select("id, code, name_th, name_en, sort_order, is_active").eq("is_active", true).order("sort_order", { ascending: true });
    if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
    for (const r of (data ?? []) as Record<string, unknown>[]) out.push(mapRow(r, k));
  }
  return NextResponse.json({ data: out, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { kind?: string; label?: string; key?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const kind = (body.kind ?? "").trim();
  const label = (body.label ?? "").trim();
  if (!KINDS.has(kind)) return NextResponse.json({ error: "ชนิดไม่ถูกต้อง" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "กรุณาใส่ชื่อ" }, { status: 400 });

  const admin = supabaseAdmin();
  const table = KIND_TABLE[kind];
  // หา sort ถัดไป + code ไม่ซ้ำในตารางนี้
  const { data: rows } = await admin.from(table).select("code, sort_order");
  const existing = new Set((rows ?? []).map((r) => r.code as string));
  const maxSort = Math.max(0, ...((rows ?? []).map((r) => (r.sort_order as number) ?? 0)));
  let code = (body.key?.trim() || deriveKey(label)); let i = 1;
  while (existing.has(code)) code = `${deriveKey(label)}_${i++}`;

  const { data, error } = await admin.from(table).insert({ code, name_th: label, name_en: label, sort_order: maxSort + 10, created_by: user?.id ?? null }).select("id, code, name_th, sort_order, is_active").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_option", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { kind, label } });
  return NextResponse.json({ data: mapRow(data as Record<string, unknown>, kind), error: null });
}
