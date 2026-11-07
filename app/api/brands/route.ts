/**
 * แบรนด์ (Brands) — สำหรับตั้งสีประจำแบรนด์ (ใช้ทำกรอบการ์ดบนบอร์ดจ่ายงาน)
 * GET   /api/brands         → รายชื่อแบรนด์ + สี
 * POST  /api/brands         → สร้างแบรนด์ใหม่ { name, color? } (ปุ่ม ＋ ในฟอร์ม Design Sheets)
 * PATCH /api/brands         → ตั้งสี { id, color }
 *                              ลูกค้าประจำแบรนด์ (งานลูกค้า — หลายสาขาได้):
 *                                { id, default_customer_ids: [...] }  ตั้งทั้งรายการ (หน้าแบรนด์)
 *                                { id, add_default_customer_id }      เพิ่ม 1 ราย (ป๊อปสร้างใบสั่งผลิต "จำลูกค้านี้")
 *                                { id, default_customer_id }          แบบเดิม = ตั้งเหลือรายเดียว (null = ล้าง)
 * อ่าน/เขียนผ่าน supabaseAdmin + ตรวจ login
 * กติกากลางลูกค้าหลายราย: lib/brand-customers.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit, auditSnapshot, auditChangeMeta } from "@/lib/audit";
import { addCustomerId, brandCustomerColumns, brandCustomerIds, cleanCustomerIds, orderCustomers, type BrandCustomer } from "@/lib/brand-customers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// หมายเหตุ: logo_url เก็บ "R2 key" ของรูปโลโก้ (แสดงผ่าน /api/r2-image?key=...) ไม่ใช่ URL เต็ม
// pricing_mode: own = แบรนด์เราเอง มีราคาขายในระบบ · oem = รับจ้างผลิต ราคาคิดต่อออเดอร์ (ใช้ในหน้าแผนผู้บริหาร)
export type Brand = { id: string; name: string; color: string | null; is_customer_job?: boolean; logo_url?: string | null; hide_in_artwork?: boolean; pricing_mode?: "own" | "oem";
  /** ลูกค้าประจำแบรนด์ (งานลูกค้า · หลายสาขาได้ เรียงตามที่ตั้ง) — ป๊อปสร้างใบสั่งผลิต/ลงออเดอร์ ใช้กรองและให้เลือก */
  default_customer_ids?: string[]; default_customers?: BrandCustomer[];
  /** รายแรกของรายการ (ของเดิมที่ใช้ลูกค้ารายเดียว) */
  default_customer_id?: string | null; default_customer?: BrandCustomer | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: [], error: "ต้อง login" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("brands").select("id, name, color, is_customer_job, logo_url, hide_in_artwork, pricing_mode, default_customer_id, default_customer_ids").eq("is_active", true).order("name", { ascending: true });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const rows = (data ?? []) as Brand[];
  const idsOf = new Map(rows.map((b) => [b.id, brandCustomerIds(b)]));
  const custIds = [...new Set([...idsOf.values()].flat())];
  const cust = new Map<string, BrandCustomer>();
  if (custIds.length) {
    const { data: ps } = await admin.from("partners_v2").select("id, code, name_th").in("id", custIds);
    for (const p of (ps ?? []) as { id: string; code: string | null; name_th: string | null }[]) cust.set(p.id, { id: p.id, code: p.code, name: p.name_th ?? p.code ?? "" });
  }
  return NextResponse.json({ data: rows.map((b) => {
    const list = orderCustomers(idsOf.get(b.id) ?? [], cust);
    return { ...b, default_customer_ids: list.map((c) => c.id), default_customers: list, default_customer: list[0] ?? null };
  }), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { name?: string; color?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อแบรนด์" }, { status: 400 });
  const color = body.color && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;

  const admin = supabaseAdmin();
  const { data: dup } = await admin.from("brands").select("id").ilike("name", name).limit(1);
  if ((dup ?? []).length > 0) return NextResponse.json({ error: `มีแบรนด์ชื่อ "${name}" อยู่แล้ว` }, { status: 400 });

  // slug จากชื่อ — ถ้าชนของเดิม เติมท้ายด้วยรหัสสั้น
  const baseSlug = name.toLowerCase().replace(/\s+/g, "-");
  let result = await admin.from("brands").insert({ name, slug: baseSlug, color, is_active: true }).select("id, name, color").single();
  if (result.error && /duplicate|unique/i.test(result.error.message)) {
    result = await admin.from("brands").insert({ name, slug: `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`, color, is_active: true }).select("id, name, color").single();
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });

  await writeAudit(admin, { action: "create", entityType: "brand", entityId: result.data.id, actorId: user.id, actorName: user.email ?? null, metadata: { name, color } });
  return NextResponse.json({ data: result.data as Brand, error: null });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  let body: { id?: string; name?: string; color?: string | null; is_customer_job?: boolean; logo_url?: string | null; hide_in_artwork?: boolean; pricing_mode?: string;
    default_customer_id?: string | null; default_customer_ids?: unknown; add_default_customer_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ไม่พบแบรนด์" }, { status: 400 });

  const admin = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  if ("color" in body) patch.color = body.color && /^#[0-9a-fA-F]{6}$/.test(body.color) ? body.color : null;
  if ("is_customer_job" in body) patch.is_customer_job = !!body.is_customer_job;
  if ("hide_in_artwork" in body) patch.hide_in_artwork = !!body.hide_in_artwork;
  // แบรนด์เราเอง (มีราคาขาย) หรือ OEM (ราคาคิดต่อออเดอร์) — ค่าอื่นถือว่า own
  if ("pricing_mode" in body) patch.pricing_mode = body.pricing_mode === "oem" ? "oem" : "own";
  if ("logo_url" in body) patch.logo_url = body.logo_url || null;   // R2 key ของโลโก้ (หรือ null = เอาออก)
  // ลูกค้าประจำแบรนด์ — เขียน 2 ช่องให้ตรงกันเสมอ (รายการ + รายแรก)
  let custIds: string[] | null = null;
  if ("default_customer_ids" in body) custIds = cleanCustomerIds(body.default_customer_ids);
  else if (body.add_default_customer_id) {
    const { data: cur } = await admin.from("brands").select("default_customer_id, default_customer_ids").eq("id", body.id).maybeSingle();
    custIds = addCustomerId(brandCustomerIds(cur as Record<string, unknown> | null), String(body.add_default_customer_id));
  } else if ("default_customer_id" in body) custIds = cleanCustomerIds([body.default_customer_id]);
  if (custIds) {
    if (custIds.length) {
      const { data: found } = await admin.from("partners_v2").select("id").in("id", custIds);
      const ok = new Set(((found ?? []) as { id: string }[]).map((c) => c.id));
      if (custIds.some((id) => !ok.has(id))) return NextResponse.json({ error: "ไม่พบลูกค้าที่เลือกบางราย — ลองเลือกใหม่" }, { status: 400 });
    }
    Object.assign(patch, brandCustomerColumns(custIds));
  }
  if ("name" in body) {
    const nm = (body.name ?? "").trim();
    if (!nm) return NextResponse.json({ error: "ชื่อแบรนด์ห้ามว่าง" }, { status: 400 });
    const { data: dup } = await admin.from("brands").select("id").ilike("name", nm).neq("id", body.id).limit(1);
    if ((dup ?? []).length > 0) return NextResponse.json({ error: `มีแบรนด์ชื่อ "${nm}" อยู่แล้ว` }, { status: 400 });
    patch.name = nm;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ id: body.id, error: null });

  const before = await auditSnapshot(admin, "brands", body.id);   // ค่าเดิม ไว้จดประวัติ "จากอะไรเป็นอะไร"
  const { error } = await admin.from("brands").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, {
    action: "update", entityType: "brand", entityId: body.id, actorId: user.id, actorName: user.email ?? null,
    metadata: { name: (patch.name as string | undefined) ?? (before?.name as string | undefined) ?? null, ...(before ? auditChangeMeta(before, patch) : patch) },
  });
  return NextResponse.json({ id: body.id, ...patch, error: null });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ไม่พบแบรนด์" }, { status: 400 });

  // soft delete — ซ่อนจากรายการ (is_active=false) แต่ข้อมูลเดิมที่อ้างถึงแบรนด์นี้ยังอยู่ ไม่พัง
  const admin = supabaseAdmin();
  const { error } = await admin.from("brands").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "brand", entityId: id, actorId: user.id, actorName: user.email ?? null, metadata: { soft: true } });
  return NextResponse.json({ ok: true, error: null });
}
