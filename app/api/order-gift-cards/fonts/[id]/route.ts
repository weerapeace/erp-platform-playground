/**
 * 💌 ส่งไฟล์ฟอนต์ที่อัปโหลด (โดเมนเดียวกับเว็บ → ใช้ใน @font-face ได้ ไม่ติด CORS) — สิทธิ์ order_ops.view
 * ฟอนต์ที่อยู่ในถังขยะยังเปิดได้ (การ์ดเก่าที่ใช้ฟอนต์นั้นจะได้ไม่เพี้ยน)
 */
import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2GetObject } from "@/lib/r2";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "order_ops.view"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "ไม่พบฟอนต์" }, { status: 404 });
  const { data } = await supabaseAdmin().from("gift_card_fonts").select("r2_key, format").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "ไม่พบฟอนต์" }, { status: 404 });
  try {
    const obj = await r2GetObject(String(data.r2_key));
    if (!obj) return NextResponse.json({ error: "ไม่พบไฟล์ฟอนต์" }, { status: 404 });
    const buf = await new Response(obj.body).arrayBuffer();   // อ่านจนจบเสมอ (ห้ามตัดกลางทาง — R2 บน Vercel ค้าง)
    return new NextResponse(buf, { headers: { "Content-Type": TYPES[String(data.format)] ?? "application/octet-stream", "Cache-Control": "private, max-age=2592000, immutable" } });
  } catch {
    return NextResponse.json({ error: "โหลดฟอนต์ไม่สำเร็จ" }, { status: 502 });
  }
}
