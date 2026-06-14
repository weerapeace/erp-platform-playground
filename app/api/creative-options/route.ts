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

const KINDS = new Set(["task_type", "platform"]);

function deriveKey(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "opt";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const kind = (new URL(request.url).searchParams.get("kind") ?? "").trim();
  const admin = supabaseAdmin();
  let q = admin.from("erp_creative_options").select("id, kind, key, label, sort_order, is_active").eq("is_active", true).order("kind", { ascending: true }).order("sort_order", { ascending: true });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: friendlyDbError(error.message) }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
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
  // หา sort ถัดไป + key ไม่ซ้ำในชนิดนี้
  const { data: rows } = await admin.from("erp_creative_options").select("key, sort_order").eq("kind", kind);
  const existing = new Set((rows ?? []).map((r) => r.key as string));
  const maxSort = Math.max(0, ...((rows ?? []).map((r) => (r.sort_order as number) ?? 0)));
  let key = (body.key?.trim() || deriveKey(label)); let i = 1;
  while (existing.has(key)) key = `${deriveKey(label)}_${i++}`;

  const { data, error } = await admin.from("erp_creative_options").insert({ kind, key, label, sort_order: maxSort + 10, created_by: user?.id ?? null }).select("id, kind, key, label, sort_order, is_active").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_option", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { kind, label } });
  return NextResponse.json({ data, error: null });
}
