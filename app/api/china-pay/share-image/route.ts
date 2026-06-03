/**
 * POST /api/china-pay/share-image — อัปโหลดรูป (PNG) ขึ้น R2 bucket "china-pay-share" (public)
 *
 * body: { dataUrl: "data:image/png;base64,...." , name?: string }
 * คืน:  { key } — URL สาธารณะ = <R2 public base> + "/" + key (ฝั่ง UI ประกอบเอง)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { r2PutShare } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { dataUrl?: string; name?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const dataUrl = String(body.dataUrl ?? "");
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return NextResponse.json({ error: "รูปไม่ถูกต้อง (ต้องเป็น data URL)" }, { status: 400 });

  const contentType = m[1];
  const ext = contentType.split("/")[1] || "png";
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 6_000_000) return NextResponse.json({ error: "รูปใหญ่เกิน 6MB" }, { status: 400 });

  const safe = String(body.name ?? "share").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "share";
  const key = `share/${safe}-${Date.now()}.${ext}`;
  try {
    await r2PutShare(key, bytes, contentType);
    return NextResponse.json({ key });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
