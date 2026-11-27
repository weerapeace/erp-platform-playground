/**
 * 🎨 ส่งไฟล์เวกเตอร์ (SVG) ของชิ้นที่แยกจากไฟล์ออกแบบ — เปลี่ยนสีได้ทางลิงก์ (?c=e24b4a-1d9e75.…)
 *   ใช้ใน <img> ของตัวออกแบบการ์ด / หน้าต่างเปลี่ยนสีในคลังไฟล์ (lib/svg-recolor vectorUrl)
 *   เปิดได้โดยไม่ต้องล็อกอิน = ระดับเดียวกับรูปในคลัง (/api/r2-image เสิร์ฟ key เดียวกันแบบเปิดอยู่แล้ว)
 *   รับเฉพาะ key รูปแบบ library/…-vec.svg · ตัดสคริปต์ออก + CSP sandbox (เปิดไฟล์ตรง ๆ ก็รันสคริปต์ไม่ได้)
 */
import { NextResponse } from "next/server";
import { r2GetObject } from "@/lib/r2";
import { VECTOR_KEY_RE, parseColorMapParam, recolorSvg, sanitizeSvg } from "@/lib/svg-recolor";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const sp = new URL(request.url).searchParams;
  const key = sp.get("key") ?? "";
  if (!VECTOR_KEY_RE.test(key) || key.includes("..")) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  try {
    const obj = await r2GetObject(key);
    if (!obj) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
    const text = await new Response(obj.body).text();   // อ่านจนจบเสมอ (ห้ามตัดกลางทาง — R2 บน Vercel ค้าง)
    const out = recolorSvg(sanitizeSvg(text), parseColorMapParam(sp.get("c")));
    return new NextResponse(out, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
        "X-Content-Type-Options": "nosniff",
        // ไฟล์ไม่เปลี่ยน (key ใหม่ทุกครั้งที่อัป) + สีอยู่ในลิงก์ → จำได้นาน
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "โหลดไฟล์ไม่สำเร็จ" }, { status: 502 });
  }
}
