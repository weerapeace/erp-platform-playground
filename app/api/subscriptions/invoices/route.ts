/**
 * /api/subscriptions/invoices — รวมใบเสร็จของทุก subscription ไว้ที่เดียว (subscriptions.view)
 * GET → { data: (ใบเสร็จ + ชื่อรายการ + ลิงก์เปิด), months: [เดือนที่มี] }
 * (route static "invoices" นี้อยู่ระดับเดียวกับ [id] — Next เลือก static ก่อน จึงไม่ชนกับ [id]/invoices)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import type { SubInvoice } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SIGNED_TTL = 60 * 60;

type InvoiceWithSub = SubInvoice & { sub_name: string | null; sub_email: string | null; sub_profile: string | null; sub_card_name: string | null };

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const db = supabaseAdmin();
  const { data: invRows, error } = await db.from("subscription_invoices")
    .select("*").order("month", { ascending: false }).order("uploaded_at", { ascending: false });
  if (error) return NextResponse.json({ data: [], months: [], error: error.message }, { status: 500 });

  const rows = (invRows ?? []) as SubInvoice[];

  // ชื่อรายการ (subscription) — ดึงเป็นชุดเดียวแล้ว map
  const subIds = Array.from(new Set(rows.map((r) => r.subscription_id).filter(Boolean)));
  const subById: Record<string, { name: string; email: string; profile: string; card: string }> = {};
  if (subIds.length) {
    const { data: subs } = await db.from("subscriptions").select("id, name, account_email, chrome_profile, card_statement_name").in("id", subIds);
    (subs ?? []).forEach((s) => {
      subById[s.id as string] = {
        name: (s.name as string) ?? "", email: (s.account_email as string) ?? "",
        profile: (s.chrome_profile as string) ?? "", card: (s.card_statement_name as string) ?? "",
      };
    });
  }

  // ลิงก์เปิดไฟล์ (signed url) เป็นชุด
  const paths = rows.map((r) => r.file_path).filter(Boolean);
  const urlByPath: Record<string, string> = {};
  if (paths.length) {
    const { data: signed } = await db.storage.from("invoices").createSignedUrls(paths, SIGNED_TTL);
    (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl; });
  }

  const data: InvoiceWithSub[] = rows.map((r) => {
    const info = subById[r.subscription_id];
    return {
      ...r,
      sub_name: info?.name ?? null,
      sub_email: info?.email || null,
      sub_profile: info?.profile || null,
      sub_card_name: info?.card || null,
      url: urlByPath[r.file_path] ?? null,
    };
  });

  const months = Array.from(new Set(rows.map((r) => r.month).filter(Boolean))).sort((a, b) => b.localeCompare(a));

  return NextResponse.json({ data, months, error: null });
}
