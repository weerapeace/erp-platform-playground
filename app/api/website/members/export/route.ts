/**
 * 🎯 ส่งออกกลุ่มลูกค้าเป็น CSV (ทำแคมเปญ LINE/อีเมล/โฆษณา) — POST /api/website/members/export
 * body { shop, ids: [รหัสสมาชิกที่เห็นในกลุ่มที่เลือก], segment } → ไฟล์ CSV (ภาษาไทยเปิดใน Excel ได้)
 * PDPA: ส่งออกเฉพาะคนที่ "ยินยอมรับข่าวสาร" เสมอ (คนที่ไม่ยินยอมถูกตัดฝั่งเซิร์ฟเวอร์) · บันทึก audit (ใคร ส่งออกกลุ่มไหน กี่คน)
 * สิทธิ์ products.edit (เท่าการระงับบัญชีสมาชิก) · กฎกลุ่ม/CSV: lib/website-member-segments
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { memberStats, readTiers } from "@/lib/member-points-db";
import { tierFor } from "@/lib/member-points";
import { lastOrderDates } from "@/lib/website-members-db";
import { membersCsv } from "@/lib/website-member-segments";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { shop?: string; ids?: unknown; segment?: string } | null;
  const ids = Array.isArray(body?.ids) ? [...new Set((body!.ids as unknown[]).map(String).filter((x) => UUID.test(x)))].slice(0, 5000) : [];
  if (!ids.length) return NextResponse.json({ error: "ไม่มีสมาชิกในกลุ่มนี้" }, { status: 400 });
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string }>(sb, body?.shop, "id, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const shopId = (shop as { id: string }).id;

  type Row = { id: string; name: string; email: string | null; phone: string | null; marketing_opt_in: boolean; created_at: string };
  const rows: Row[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb
      .from("store_customers")
      .select("id, name, email, phone, marketing_opt_in, created_at")
      .eq("shop_id", shopId)
      .eq("status", "active")
      .eq("marketing_opt_in", true)
      // 🧪 สมาชิกทดลองไม่ใช่ลูกค้าจริง — ไม่ส่งออกเสมอ
      .eq("is_test", false)
      .in("id", ids.slice(i, i + 500));
    rows.push(...((data ?? []) as Row[]));
  }
  if (!rows.length) return NextResponse.json({ error: "ไม่มีคนในกลุ่มนี้ที่ยินยอมรับข่าวสาร (ส่งออกได้เฉพาะคนที่ยินยอม)" }, { status: 400 });

  const keep = rows.map((r) => r.id);
  const [stats, tiers, last] = await Promise.all([memberStats(sb, keep), readTiers(sb, shopId), lastOrderDates(sb, keep)]);
  const csv = membersCsv(
    rows.map((r) => {
      const st = stats.get(r.id);
      return {
        name: r.name,
        email: r.email,
        phone: r.phone ?? "",
        marketingOptIn: r.marketing_opt_in,
        orderCount: st?.orderCount ?? 0,
        orderTotal: st?.orderTotal ?? 0,
        lastOrderAt: last.get(r.id) ?? null,
        tierName: tierFor(st?.spend12m ?? 0, tiers).tier?.name ?? null,
        createdAt: r.created_at,
      };
    }),
  );
  const segment = String(body?.segment ?? "all").slice(0, 40);
  await writeAuditFor(request, sb, {
    action: "export",
    entityType: "store_customer",
    metadata: { shop_id: shopId, segment, requested: ids.length, exported: rows.length, skipped_no_consent: ids.length - rows.length, purpose: "marketing_segment" },
  });
  const slug = (shop as { slug: string }).slug;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${slug}-${segment.replace(/[^a-z0-9-]/gi, "-")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
