/**
 * โมดูล "ใบปะหน้ากล่อง" (carton labels) — list + create
 *
 * GET  /api/carton-labels?search=...        → รายการที่บันทึกไว้ (ใช้ซ้ำ/พิมพ์ใหม่)
 * POST /api/carton-labels                    → บันทึกใบใหม่
 *
 * เข้าถึงผ่าน guardApi (ของกลาง) · cartons เก็บเป็น jsonb [{ qty }]
 * NOTE: ใช้สิทธิ์ products.* ชั่วคราว (โมดูลผูกกับ SKU) — ภายหลังเพิ่ม carton_labels.* ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanCartons } from "./shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type CartonItem = { qty: number };
export type CartonLabelRow = {
  id: string;
  from_text: string;
  to_text: string | null;
  customer_id: string | null;
  po_no: string | null;
  sku_id: string | null;
  style_no: string | null;
  color: string | null;
  total_qty: number;
  per_carton: number;
  cartons: CartonItem[];
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const s = (v: unknown) => (v == null ? null : String(v).trim() || null);

function buildPayload(body: Record<string, unknown>) {
  return {
    from_text: s(body.from_text) ?? "หจก. ไอ.เอส.จี เทรดดิ้ง",
    to_text: s(body.to_text),
    customer_id: s(body.customer_id),
    po_no: s(body.po_no),
    sku_id: s(body.sku_id),
    style_no: s(body.style_no),
    color: s(body.color),
    total_qty: n(body.total_qty),
    per_carton: n(body.per_carton),
    cartons: cleanCartons(body.cartons),
    note: s(body.note),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();

  let query = supabaseAdmin().from("carton_labels").select("*").order("created_at", { ascending: false }).limit(500);
  if (search) query = query.or(`po_no.ilike.%${search}%,style_no.ilike.%${search}%,to_text.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const payload = { ...buildPayload(body), created_by: user?.id ?? null, created_by_name: user?.email ?? null };
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("carton_labels").insert(payload).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "create", entityType: "carton_labels", entityId: data.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { po_no: payload.po_no, style_no: payload.style_no, cartons: payload.cartons.length },
  });
  return NextResponse.json({ id: data.id, error: null });
}
