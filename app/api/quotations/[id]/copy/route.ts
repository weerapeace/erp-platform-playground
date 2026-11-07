/**
 * คัดลอกใบเสนอราคา — POST /api/quotations/[id]/copy
 *
 * อ่านใบต้นทางผ่าน RPC เดิม (erp_playground_quote_get) แล้วสร้างใบใหม่เป็น "ร่าง"
 * ด้วย erp_playground_quote_create → ได้เลขที่ใบใหม่ + คัดลอกทุกบรรทัด (รวมรูปที่แนบ/หมายเหตุ/ส่วนลด)
 *
 * ไม่ก๊อป: เลขที่ใบ · สถานะ (ใบใหม่เป็นร่างเสมอ) · ประวัติส่ง/ตอบรับ
 * วันที่: ใบใหม่ = วันนี้ · ยืนราคาถึง = เลื่อนตามช่วงเดิมของใบต้นทาง (ไม่มี = +30 วัน)
 * สิทธิ์: qt.create (บังคับใน RPC ด้วย erp_can) — เรียกด้วย client ของผู้ใช้เอง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { quoteCopyPayload } from "@/lib/quote-copy";
import type { QuoteDetail } from "../../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const client = supabaseFromRequest(request);
  const { data: { user } } = await client.auth.getUser();

  let body: { actor?: string } = {};
  try { body = await request.json(); } catch { /* ไม่ส่ง body ก็ได้ */ }

  const { data: src, error: gErr } = await client.rpc("erp_playground_quote_get", { p_id: id });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  const q = src as QuoteDetail | null;
  if (!q) return NextResponse.json({ error: "ไม่พบใบเสนอราคาต้นทาง" }, { status: 404 });

  // หัวใบ + บรรทัดของใบใหม่ (ช่วงยืนราคาเดิม → นับจากวันนี้) — กติกากลาง lib/quote-copy
  const { header, lines } = quoteCopyPayload(q);

  const actor = body.actor ?? user?.email ?? null;
  const { data: newId, error } = await client.rpc("erp_playground_quote_create", {
    p_header: header, p_lines: lines, p_actor: actor,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: newId, copied_from: q.quote_number ?? id, lines: lines.length, error: null });
}
