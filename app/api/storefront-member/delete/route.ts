/**
 * 👤 สมาชิกลบบัญชีตัวเอง (PDPA · Facebook/LINE ต้องมี) — /api/storefront-member/delete
 * POST { confirm: "ลบบัญชี" } → ล้างข้อมูลส่วนตัวในบัญชี + ลบวิธีเข้าสู่ระบบและที่อยู่ทั้งหมด (lib/website-members deletedMemberPatch)
 * ออเดอร์เดิมยังเก็บ (หลักฐานการขาย/ภาษี) · บันทึกลง audit_logs (ผู้ทำ = สมาชิกเอง)
 * ด่าน: กุญแจภายใน + สมาชิก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { DELETE_CONFIRM_TEXT, deletedMemberPatch } from "@/lib/website-members";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (String(body?.confirm ?? "").trim() !== DELETE_CONFIRM_TEXT) return storefrontJson({ ok: false, error: `พิมพ์คำว่า "${DELETE_CONFIRM_TEXT}" เพื่อยืนยัน` }, 400);

  const id = g.member.id;
  const [{ count: orders }] = await Promise.all([g.sb.from("store_orders").select("id", { count: "exact", head: true }).eq("customer_id", id)]);
  await g.sb.from("store_customer_identities").delete().eq("customer_id", id);
  await g.sb.from("store_customer_addresses").delete().eq("customer_id", id);
  const { error } = await g.sb.from("store_customers").update(deletedMemberPatch()).eq("id", id);
  if (error) return storefrontJson({ ok: false, error: "ลบบัญชีไม่สำเร็จ กรุณาลองใหม่หรือติดต่อร้าน" }, 500);

  await writeAudit(g.sb, {
    action: "delete",
    entityType: "store_customer",
    entityId: id,
    actorId: null,
    actorName: `สมาชิกลบบัญชีเอง (${g.shop.slug})`,
    metadata: { shop_id: g.shop.id, orders_kept: orders ?? 0, reason: "member_self_delete" },
  });
  return storefrontJson({ ok: true }, 200);
}
