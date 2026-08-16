import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";
import type { DeliveryNoteLine } from "../route";

const firstText = (...values: unknown[]) => {
  for (const value of values) { const t = String(value ?? "").trim(); if (t) return t; }
  return "";
};

// เติมที่อยู่/เลขภาษีลูกค้าจาก partners_v2 (ใช้ตอนพิมพ์ใบส่งสินค้า)
async function enrichCustomer(request: NextRequest, doc: unknown) {
  if (!doc || typeof doc !== "object") return doc;
  const detail = doc as Record<string, unknown>;
  const customerId = String(detail.customer_id ?? "").trim();
  if (!customerId) return doc;
  const { data: partner } = await supabaseFromRequest(request)
    .from("partners_v2").select("*").eq("id", customerId).maybeSingle();
  if (!partner) return doc;
  const row = partner as Record<string, unknown>;
  return {
    ...detail,
    customer_name:    firstText(detail.customer_name, row.name_th, row.name_en, row.display_name, row.code),
    customer_code:    firstText(detail.customer_code, row.code),
    customer_address: firstText(detail.customer_address, formatThaiAddress(row)),
    customer_phone:   firstText(detail.customer_phone, row.phone, row.mobile, row.tel, row.contact_phone),
    customer_tax_id:  firstText(detail.customer_tax_id, formatTaxId(firstText(row.tax_id, row.tax_no, row.vat_id), row.tax_branch)),
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_delivery_note_get", { p_id: id });
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const enriched = await enrichCustomer(request, data);
  return NextResponse.json({ data: enriched, error: null });
}

type PatchBody = { header?: Record<string, unknown>; lines?: DeliveryNoteLine[]; actor?: string };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: PatchBody;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const { data, error } = await supabaseFromRequest(request).rpc("erp_playground_delivery_note_update", {
    p_id: id, p_header: body.header ?? {}, p_lines: body.lines ?? null, p_actor: body.actor ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data, error: null });
}

/**
 * DELETE — ลบใบส่งสินค้าออกจากระบบถาวร
 *   สิทธิ์: so.cancel (สิทธิ์เดียวกับการยกเลิกเอกสารขาย)
 *   กติกา: ลบได้เฉพาะใบ "ร่าง" หรือ "ยกเลิกแล้ว" — ใบที่ส่งของแล้วต้องกดยกเลิกก่อน
 *   ก่อนลบเก็บสำเนาทั้งใบ (หัวบิล + รายการสินค้า) ลง audit log ไว้ตรวจย้อนหลัง
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "so.cancel"); if (denied) return denied;
  const { id } = await params;
  const actor = new URL(request.url).searchParams.get("actor");

  const admin = supabaseAdmin();
  const { data: doc, error: getErr } = await admin
    .from("erp_playground_delivery_notes").select("*").eq("id", id).maybeSingle();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "ไม่พบใบส่งสินค้า" }, { status: 404 });

  const status = String((doc as Record<string, unknown>).status ?? "");
  if (status === "delivered") {
    return NextResponse.json({ error: 'ใบที่ส่งของแล้วลบไม่ได้ — กด "ยกเลิก" ก่อนแล้วค่อยลบ' }, { status: 400 });
  }

  const { data: lines } = await admin
    .from("erp_playground_delivery_note_lines").select("*").eq("delivery_note_id", id);

  // เก็บประวัติ + สำเนาข้อมูลก่อนลบ (ลบแล้วยังตามดูได้ว่าใบไหน ใครลบ มีอะไรอยู่ในใบ)
  await writeAudit(admin, {
    action: "delete", entityType: "erp_playground_delivery_note", entityId: id, actorName: actor,
    metadata: {
      dn_number: (doc as Record<string, unknown>).dn_number ?? null,
      status,
      customer_name: (doc as Record<string, unknown>).customer_name ?? null,
      line_count: (lines ?? []).length,
      snapshot: doc,
      lines: lines ?? [],
    },
  });

  const { error: delLinesErr } = await admin
    .from("erp_playground_delivery_note_lines").delete().eq("delivery_note_id", id);
  if (delLinesErr) return NextResponse.json({ error: delLinesErr.message }, { status: 500 });

  const { error: delErr } = await admin.from("erp_playground_delivery_notes").delete().eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ deleted: true, dn_number: (doc as Record<string, unknown>).dn_number ?? null, error: null });
}
