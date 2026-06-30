/**
 * Creative Statuses API — สถานะงาน + เส้นทาง (transition)
 * GET  /api/creative-statuses          → { statuses, transitions }
 * POST /api/creative-statuses          → สร้างสถานะใหม่ { label, color?, is_terminal?, is_approval_gate? }
 * แก้/ลบสถานะ ที่ /[id] · เส้นทางที่ /transitions
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function deriveKey(label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || "status";
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [{ data: statuses, error: e1 }, { data: transitions, error: e2 }] = await Promise.all([
    admin.from("erp_creative_statuses").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
    admin.from("erp_creative_status_transitions").select("*").order("sort_order", { ascending: true }),
  ]);
  if (e1 || e2) return NextResponse.json({ statuses: [], transitions: [], error: friendlyDbError((e1 ?? e2)!.message) }, { status: 500 });
  return NextResponse.json({ statuses: statuses ?? [], transitions: transitions ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { label?: string; label_en?: string; color?: string; progress_percent?: number; is_terminal?: boolean; is_approval_gate?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const label = (body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "กรุณาใส่ชื่อสถานะ" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: rows } = await admin.from("erp_creative_statuses").select("key, sort_order");
  const existing = new Set((rows ?? []).map((r) => r.key as string));
  const maxSort = Math.max(0, ...((rows ?? []).map((r) => (r.sort_order as number) ?? 0)));
  let key = deriveKey(label); let i = 1;
  while (existing.has(key)) key = `${deriveKey(label)}_${i++}`;

  const { data, error } = await admin.from("erp_creative_statuses").insert({
    key, label, label_en: (body.label_en ?? "").trim() || null, color: body.color || "slate", progress_percent: body.progress_percent ?? 0,
    is_terminal: !!body.is_terminal, is_approval_gate: !!body.is_approval_gate, sort_order: maxSort + 10, created_by: user?.id ?? null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  await writeAudit(admin, { action: "create", entityType: "creative_status", entityId: data.id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { key, label } });
  return NextResponse.json({ data, error: null });
}
