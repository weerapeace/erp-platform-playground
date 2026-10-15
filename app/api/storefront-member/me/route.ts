/**
 * 👤 โปรไฟล์สมาชิกที่ล็อกอินอยู่ — /api/storefront-member/me
 * GET   → { ok, member, addresses }
 * PATCH { name?, phone?, marketingOptIn? } → { ok, member }  (อีเมลแก้ไม่ได้ — มาจากผู้ให้บริการที่ยืนยันแล้ว)
 * ด่าน: กุญแจภายใน + x-storefront-member (lib/storefront-internal guardMember)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson, type MemberRow } from "@/lib/storefront-internal";
import { addressFromRow, sanitizeProfilePatch } from "@/lib/website-members";
import { memberSummary } from "@/lib/website-members-db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const { data } = await g.sb.from("store_customer_addresses").select("*").eq("customer_id", g.member.id).order("is_default", { ascending: false }).order("created_at");
  return storefrontJson({ ok: true, member: await memberSummary(g.sb, g.member), addresses: ((data ?? []) as Record<string, unknown>[]).map(addressFromRow) }, 200);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const v = sanitizeProfilePatch(await request.json().catch(() => null));
  if (!v.ok) return storefrontJson({ ok: false, error: v.error }, 400);
  if (!Object.keys(v.patch).length) return storefrontJson({ ok: true, member: await memberSummary(g.sb, g.member) }, 200);
  const { data, error } = await g.sb
    .from("store_customers")
    .update({ ...v.patch, updated_at: new Date().toISOString() })
    .eq("id", g.member.id)
    .select("id, shop_id, email, email_verified, name, phone, avatar_url, marketing_opt_in, status, created_at")
    .maybeSingle();
  if (error || !data) return storefrontJson({ ok: false, error: "บันทึกไม่สำเร็จ" }, 500);
  return storefrontJson({ ok: true, member: await memberSummary(g.sb, data as MemberRow) }, 200);
}
