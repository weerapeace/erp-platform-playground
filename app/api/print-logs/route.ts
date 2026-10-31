/**
 * 🖨 ประวัติการพิมพ์เอกสาร (ของกลาง) — ดู lib/print-log.ts
 *   GET  ?doc_type=mo&doc_id=<id>                              → ประวัติของใบนั้น (ล่าสุดก่อน · 100 ครั้ง)
 *   POST { doc_type, variant, items: [{ doc_id, doc_no, qty }] } → บันทึกว่าพิมพ์ (หน้าพิมพ์รวมหลายใบ = หลายแถว)
 * สิทธิ์ = ดูสินค้าได้ (คนที่เปิดหน้าพิมพ์ได้) · เข้าตารางด้วย service role
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { PRINT_DOC_TYPES, type PrintHow, type PrintLogItem } from "@/lib/print-log";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const HOWS: PrintHow[] = ["print", "pdf", "link"];
const okType = (t: unknown): t is string => typeof t === "string" && (PRINT_DOC_TYPES as readonly string[]).includes(t);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const docType = sp.get("doc_type"), docId = (sp.get("doc_id") ?? "").trim();
  if (!okType(docType) || !docId) return bad("ระบุ doc_type และ doc_id");
  const { data, error } = await supabaseAdmin().from("print_logs")
    .select("id, doc_type, doc_id, doc_no, variant, batch_size, qty_at_print, printed_by, printed_by_name, printed_at")
    .eq("doc_type", docType).eq("doc_id", docId).order("printed_at", { ascending: false }).limit(100);
  if (error) return bad("โหลดประวัติการพิมพ์ไม่สำเร็จ", 500);
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const body = await request.json().catch(() => null) as { doc_type?: unknown; variant?: unknown; items?: unknown } | null;
  if (!body || !okType(body.doc_type)) return bad("ชนิดเอกสารไม่ถูกต้อง");
  const variant: PrintHow = HOWS.includes(body.variant as PrintHow) ? (body.variant as PrintHow) : "print";
  const items = (Array.isArray(body.items) ? body.items : []).filter((x): x is PrintLogItem => !!x && typeof (x as PrintLogItem).doc_id === "string" && !!(x as PrintLogItem).doc_id.trim());
  if (!items.length) return bad("ไม่มีใบที่พิมพ์");
  if (items.length > 500) return bad("พิมพ์ทีละไม่เกิน 500 ใบ");
  const admin = supabaseAdmin();
  // ใครพิมพ์ — ชื่อจากโปรไฟล์ (เหมือน API อื่น) · หาไม่ได้ = อีเมล
  let by: string | null = null, byName: string | null = null;
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (user) {
      by = user.id;
      const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
      const prof = p as { display_name: string | null; email: string | null } | null;
      byName = prof?.display_name?.trim() || prof?.email || user.email || null;
    }
  } catch { /* ไม่รู้ว่าใคร ก็ยังบันทึกว่าพิมพ์ */ }
  const rows = items.map((x) => ({
    doc_type: body.doc_type as string, doc_id: x.doc_id.trim(), doc_no: x.doc_no ?? null, variant, batch_size: items.length,
    qty_at_print: typeof x.qty === "number" && Number.isFinite(x.qty) ? x.qty : null, printed_by: by, printed_by_name: byName,
  }));
  const { error } = await admin.from("print_logs").insert(rows);
  if (error) return bad("บันทึกประวัติการพิมพ์ไม่สำเร็จ", 500);
  return NextResponse.json({ ok: true, n: rows.length });
}
