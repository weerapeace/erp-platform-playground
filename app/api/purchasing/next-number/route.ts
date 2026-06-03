/**
 * POST /api/purchasing/next-number
 * ออกเลขเอกสารจากระบบเลขกลาง (erp_next_number) — atomic กันเลขซ้ำ
 *
 * body: { key: "pr" | "po" | "gr", count?: number }
 * - count > 1 = ออกเลขทีละหลายใบ (เช่น ช้อปปิ้งสร้างหลายใบขอซื้อพร้อมกัน)
 * ตอบกลับ: { numbers: string[] }  เรียงตามลำดับที่ออก
 *
 * รูปแบบเลขปรับได้ที่หน้า /admin/numbering โดยไม่ต้องแก้โค้ด
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// อนุญาตเฉพาะ key ของโมดูลจัดซื้อ (กันการ consume เลขของโมดูลอื่นโดยไม่ตั้งใจ)
const ALLOWED = new Set(["pr", "po", "gr"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { key?: string; count?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const key = typeof body.key === "string" ? body.key : "";
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "key ไม่ถูกต้อง (รองรับ pr/po/gr)" }, { status: 400 });
  const count = Math.min(200, Math.max(1, Math.floor(Number(body.count) || 1)));

  const admin = supabaseAdmin();
  const numbers: string[] = [];
  for (let i = 0; i < count; i++) {
    const { data, error } = await admin.rpc("erp_next_number", { p_key: key });
    if (error || !data) return NextResponse.json({ error: "ออกเลขไม่สำเร็จ: " + (error?.message ?? "") }, { status: 500 });
    numbers.push(data as string);
  }
  return NextResponse.json({ numbers, error: null });
}
