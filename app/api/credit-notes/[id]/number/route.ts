/**
 * แก้ "เลขที่เอกสาร" ของใบลดหนี้ — PATCH /api/credit-notes/[id]/number
 *
 * เจ้าของขอให้แก้เลขได้ถ้าจำเป็น (เช่น ต้องให้ตรงกับเล่มที่ออกมือไว้ หรือออกเลขผิด)
 * แก้ได้ทั้งใบร่างและใบที่ออกเอกสารแล้ว — เนื้อหาอื่นของใบที่ออกแล้วยังแก้ไม่ได้เหมือนเดิม
 * ทุกครั้งบันทึกลง audit log ว่าเปลี่ยนจากเลขอะไรเป็นเลขอะไร ใครเปลี่ยน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "cn.create"); if (denied) return denied;
  const { id } = await params;

  let body: { cn_number?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const next = String(body.cn_number ?? "").trim();
  if (!next) return NextResponse.json({ error: "ต้องระบุเลขที่เอกสาร" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: doc } = await admin.from("erp_playground_credit_notes")
    .select("id, cn_number, status").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "ไม่พบใบลดหนี้" }, { status: 404 });
  const prev = (doc as { cn_number: string | null }).cn_number;

  const { data: dup } = await admin.from("erp_playground_credit_notes")
    .select("id").eq("cn_number", next).neq("id", id).maybeSingle();
  if (dup) return NextResponse.json({ error: `เลขที่ ${next} ถูกใช้กับใบลดหนี้ใบอื่นแล้ว` }, { status: 400 });

  const { error } = await admin.from("erp_playground_credit_notes")
    .update({ cn_number: next, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "renumber", entityType: "erp_playground_credit_note", entityId: id, actorName: body.actor ?? null,
    metadata: { from: prev, to: next, status: (doc as { status: string }).status },
  });
  return NextResponse.json({ cn_number: next, error: null });
}
