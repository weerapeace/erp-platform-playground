/**
 * 💌 ฟอนต์ของแบรนด์สำหรับการ์ดของขวัญ (ข้อ 8) — อัปโหลด .ttf / .otf / .woff / .woff2 (ไม่เกิน 4 MB)
 * POST multipart: file, name? → เก็บไฟล์ใน R2 (gift-card-fonts/<id>.<ext>) + แถว gift_card_fonts
 * ใช้ในการ์ดเป็นฟอนต์ "upload:<id>" · ไฟล์เสิร์ฟที่ /api/order-gift-cards/fonts/<id> · ลบ = DELETE /api/order-gift-cards {kind:"font"} (ถังขยะ)
 * สิทธิ์ order_ops.manage · audit
 */
import { NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject } from "@/lib/r2";
import { writeAudit } from "@/lib/audit";
import { whoAmI } from "@/lib/order-ops-server";

export const dynamic = "force-dynamic";

const MAX = 4 * 1024 * 1024;   // ทางเข้า API บน Vercel รับได้ ~4.5 MB
const TYPES: Record<string, string> = { ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2" };
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

/** ตรวจหัวไฟล์ว่าเป็นฟอนต์จริง (ไม่เชื่อนามสกุลอย่างเดียว) */
function sniff(b: Uint8Array): string | null {
  const tag = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "OTTO") return "otf";
  if ((b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === "true") return "ttf";
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const denied = await guardApi(request, "order_ops.manage"); if (denied) return denied;
  let form: FormData;
  try { form = await request.formData(); } catch { return bad("ไฟล์ไม่ถูกต้อง"); }
  const file = form.get("file");
  if (!(file instanceof File)) return bad("ยังไม่ได้เลือกไฟล์ฟอนต์");
  if (file.size > MAX) return bad("ไฟล์ฟอนต์ใหญ่เกิน 4 MB — ลองใช้ไฟล์ .woff2 (เล็กกว่า)");
  const buf = new Uint8Array(await file.arrayBuffer());
  const fmt = sniff(buf);
  if (!fmt) return bad("ไฟล์นี้ไม่ใช่ฟอนต์ — ใช้ไฟล์ .ttf / .otf / .woff / .woff2");
  const name = (String(form.get("name") ?? "").trim() || file.name.replace(/\.[^.]+$/, "")).slice(0, 60) || "ฟอนต์แบรนด์";
  const admin = supabaseAdmin();
  const me = await whoAmI(request, admin);
  const id = crypto.randomUUID();
  const key = `gift-card-fonts/${id}.${fmt}`;
  try { await r2PutObject(key, buf, TYPES[fmt]); } catch { return bad("อัปโหลดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง", 502); }
  const { error } = await admin.from("gift_card_fonts").insert({ id, name, r2_key: key, format: fmt, size_bytes: file.size, created_by_name: me.name });
  if (error) return bad("บันทึกฟอนต์ไม่สำเร็จ ลองใหม่อีกครั้ง", 500);
  await writeAudit(admin, { action: "create", entityType: "gift_card_fonts", entityId: id, actorId: me.id, actorName: me.name, metadata: { name, format: fmt, size_bytes: file.size } });
  return NextResponse.json({ ok: true, font: { id, name, format: fmt } });
}
