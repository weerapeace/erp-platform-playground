/**
 * /api/drive-video/[id] — ส่งไฟล์วิดีโอ (หรือไฟล์อะไรก็ได้) ที่อยู่บน Google Drive ต่อให้ผู้เรียก
 * โดย "ไม่เก็บสำเนาลง R2" — ไฟล์ใหญ่จะอยู่ที่ Drive ที่เดียว
 *
 * ใช้กับ 2 อย่าง:
 *   1) เล่นพรีวิวในเว็บ (<video src="/api/drive-video/<fileId>">)
 *   2) ให้ Facebook/Instagram ดึงไฟล์ตอนยิงโพสต์อัตโนมัติ (Meta ต้องได้ URL ที่โหลดไฟล์ได้ตรง ๆ)
 *
 * เปิดให้เรียกได้โดยไม่ต้องล็อกอิน (Meta เรียกจากเซิร์ฟเวอร์ของเขา ไม่มี session ของเรา)
 * — ปลอดภัยเท่าที่ "ต้องรู้ fileId" เท่านั้น เหมือน /api/r2-image ที่ใช้อยู่
 * รองรับ Range เพื่อให้เล่นวิดีโอ/ข้ามไปกลางคลิปได้
 */
import { NextRequest } from "next/server";
import { driveAccessToken } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;   // ไฟล์ใหญ่ใช้เวลาส่งนาน

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return new Response("bad id", { status: 400 });

  let token: string;
  try { token = await driveAccessToken(); }
  catch (e) { return new Response(`Google Drive ยังไม่พร้อม: ${(e as Error).message}`, { status: 500 }); }

  const range = request.headers.get("range");
  const upstream = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
  });
  if (!upstream.ok || !upstream.body) {
    const msg = await upstream.text().catch(() => "");
    return new Response(`อ่านไฟล์จาก Drive ไม่ได้ (${upstream.status}) — ตรวจว่าแชร์ไฟล์ให้ service account แล้ว\n${msg.slice(0, 300)}`, { status: upstream.status === 404 ? 404 : 502 });
  }

  // ส่งต่อแบบ stream (ไม่โหลดทั้งไฟล์เข้าหน่วยความจำ)
  const h = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
    const v = upstream.headers.get(k);
    if (v) h.set(k, v);
  }
  if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
  h.set("cache-control", "public, max-age=3600");
  return new Response(upstream.body, { status: upstream.status, headers: h });
}
