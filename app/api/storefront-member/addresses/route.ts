/**
 * 👤 ที่อยู่จัดส่งของสมาชิก — /api/storefront-member/addresses
 * GET → { ok, addresses } · POST {ที่อยู่} สร้าง · PATCH { id, ...ที่อยู่ } แก้ · DELETE ?id= ลบ
 * ตั้งเป็นค่าเริ่มต้น (isDefault) = ที่อยู่อื่นของคนนี้เลิกเป็นค่าเริ่มต้น · ที่อยู่แรก = ค่าเริ่มต้นเอง · สูงสุด 10 ที่
 * ด่าน: กุญแจภายใน + สมาชิก (แก้ได้เฉพาะที่อยู่ของตัวเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { addressFromRow, addressToRow, sanitizeAddress } from "@/lib/website-members";

export const dynamic = "force-dynamic";
const MAX = 10;

type Sb = Parameters<typeof addressList>[0];
async function addressList(sb: ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>, customerId: string) {
  const { data } = await sb.from("store_customer_addresses").select("*").eq("customer_id", customerId).order("is_default", { ascending: false }).order("created_at");
  return ((data ?? []) as Record<string, unknown>[]).map(addressFromRow);
}
async function clearDefault(sb: Sb, customerId: string, exceptId?: string) {
  let q = sb.from("store_customer_addresses").update({ is_default: false }).eq("customer_id", customerId);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  return storefrontJson({ ok: true, addresses: await addressList(g.sb, g.member.id) }, 200);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const v = sanitizeAddress(await request.json().catch(() => null));
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  const cur = await addressList(g.sb, g.member.id);
  if (cur.length >= MAX) return storefrontJson({ ok: false, error: `บันทึกที่อยู่ได้สูงสุด ${MAX} ที่ — ลบที่ไม่ใช้ก่อน` }, 400);
  const isDefault = v.address.isDefault || cur.length === 0;
  const { data, error } = await g.sb
    .from("store_customer_addresses")
    .insert({ ...addressToRow({ ...v.address, isDefault }), customer_id: g.member.id })
    .select("id")
    .maybeSingle();
  if (error || !data) return storefrontJson({ ok: false, error: "บันทึกที่อยู่ไม่สำเร็จ" }, 500);
  if (isDefault) await clearDefault(g.sb, g.member.id, (data as { id: string }).id);
  return storefrontJson({ ok: true, id: (data as { id: string }).id, addresses: await addressList(g.sb, g.member.id) }, 200);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = String(body?.id ?? "");
  const v = sanitizeAddress(body);
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  const { data, error } = await g.sb
    .from("store_customer_addresses")
    .update({ ...addressToRow(v.address), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("customer_id", g.member.id)
    .select("id")
    .maybeSingle();
  if (error) return storefrontJson({ ok: false, error: "บันทึกที่อยู่ไม่สำเร็จ" }, 500);
  if (!data) return storefrontJson({ ok: false, error: "ไม่พบที่อยู่นี้" }, 404);
  if (v.address.isDefault) await clearDefault(g.sb, g.member.id, id);
  return storefrontJson({ ok: true, addresses: await addressList(g.sb, g.member.id) }, 200);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const { data } = await g.sb.from("store_customer_addresses").delete().eq("id", id).eq("customer_id", g.member.id).select("is_default").maybeSingle();
  if (!data) return storefrontJson({ ok: false, error: "ไม่พบที่อยู่นี้" }, 404);
  // ลบที่อยู่หลัก → ให้ที่อยู่แรกที่เหลือเป็นหลักแทน
  let list = await addressList(g.sb, g.member.id);
  if ((data as { is_default: boolean }).is_default && list.length && !list.some((a) => a.isDefault)) {
    await g.sb.from("store_customer_addresses").update({ is_default: true }).eq("id", list[0].id);
    list = await addressList(g.sb, g.member.id);
  }
  return storefrontJson({ ok: true, addresses: list }, 200);
}
