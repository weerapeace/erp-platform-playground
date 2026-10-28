/**
 * 👤 โปรไฟล์สมาชิกที่ล็อกอินอยู่ — /api/storefront-member/me
 * GET   → { ok, member, addresses }
 * PATCH { name?, phone?, marketingOptIn?, birthMonth?, birthDay? } → { ok, member }  (อีเมลแก้ไม่ได้ — มาจากผู้ให้บริการที่ยืนยันแล้ว)
 *   🎂 วันเกิดตั้งได้ครั้งเดียว (ตั้งแล้ว = ต้องให้ร้านแก้ใน ERP) — กันเปลี่ยนเดือนเกิดเพื่อเอาคูปอง
 * ด่าน: กุญแจภายใน + x-storefront-member (lib/storefront-internal guardMember)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, MEMBER_ROW_COLS, storefrontJson, type MemberRow } from "@/lib/storefront-internal";
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
  if ("birth_month" in v.patch && g.member.birth_month) {
    if (g.member.birth_month === v.patch.birth_month && g.member.birth_day === v.patch.birth_day) {
      delete v.patch.birth_month;
      delete v.patch.birth_day;
    } else return storefrontJson({ ok: false, error: "ตั้งวันเกิดไว้แล้ว — ถ้าต้องการแก้ ติดต่อร้านได้เลย" }, 400);
  }
  const { data, error } = await g.sb
    .from("store_customers")
    .update({ ...v.patch, updated_at: new Date().toISOString() })
    .eq("id", g.member.id)
    .select(MEMBER_ROW_COLS)
    .maybeSingle();
  if (error || !data) return storefrontJson({ ok: false, error: "บันทึกไม่สำเร็จ" }, 500);
  return storefrontJson({ ok: true, member: await memberSummary(g.sb, data as MemberRow) }, 200);
}
