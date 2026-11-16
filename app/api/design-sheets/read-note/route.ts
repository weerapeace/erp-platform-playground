/**
 * POST /api/design-sheets/read-note — ให้ AI อ่านรูปโน้ตขนาดชิ้นวัสดุ (ลายมือช่าง) → ตารางให้ยืนยันก่อนลงตารางตีราคา (เจ้าของขอ 2026-11-16)
 *   body { image: "data:image/jpeg;base64,…" (ย่อจากหน้าจอแล้ว ≤ ~1.5MB) }
 *   → { data: { rows: [{ group, name, w, h, qty, unsure }], groups, notes }, error }
 *   สิทธิ์: products.edit (แก้ใบงาน) + products.cost.view (ตีราคา) + ai.caption (สิทธิ์ใช้ AI ตัวเดียวกับปุ่ม AI อื่น)
 *   บริการเสียเงิน: ลงทะเบียน "ai.note_dims" ใน lib/paid-services · เรียกผ่านด่านกลาง aiChat (เปิด-ปิด/งบ/บันทึกการใช้ ที่ /admin/paid-services)
 *   รูปไม่ถูกเก็บ — ส่งให้ AI อ่านครั้งเดียวแล้วทิ้ง · ไม่เขียนฐานข้อมูล (ผู้ใช้กดเพิ่มบรรทัดแล้วบันทึกตีราคาตามปกติ)
 *   คำสั่ง AI + ตัวตรวจคำตอบ: lib/note-dims
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { openAiKey } from "@/lib/ai-caption";
import { aiChat, BudgetExceededError, ServiceOffError } from "@/lib/paid-services-server";
import { NOTE_DIMS_ASK, NOTE_DIMS_SYSTEM, parseNoteDims } from "@/lib/note-dims";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_IMAGE_CHARS = 2_100_000;   // base64 ของรูป ~1.5MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  if (!(await apiCan(request, COST_PERM))) return NextResponse.json({ error: "คุณไม่มีสิทธิ์ตีราคา (ดูต้นทุน)" }, { status: 403 });
  if (!(await apiCan(request, "ai.caption"))) return NextResponse.json({ error: "คุณยังไม่ได้รับสิทธิ์ใช้ AI (ai.caption) — ขอสิทธิ์จากผู้ดูแลระบบ" }, { status: 403 });
  if (!openAiKey()) return NextResponse.json({ error: "ยังไม่ได้ตั้งค่า AI — ผู้ดูแลต้องใส่ค่า OPENAI_API_KEY ใน Vercel" }, { status: 400 });
  let body: { image?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return NextResponse.json({ error: "เลือกรูปโน้ตก่อน (รองรับ JPG / PNG / WebP)" }, { status: 400 });
  if (image.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "รูปใหญ่เกินไป ลองรูปที่เล็กลง" }, { status: 400 });

  try {
    const raw = await aiChat("ai.note_dims", NOTE_DIMS_SYSTEM, [{ type: "text", text: NOTE_DIMS_ASK }, { type: "image_url", image_url: { url: image, detail: "high" } }], 2500, "gpt-4.1", { request });
    const d = parseNoteDims(raw);
    if (!d.rows.length) return NextResponse.json({ error: "AI หาขนาดชิ้นในรูปไม่เจอ — ลองถ่ายให้ชัดขึ้น ตรง ๆ และเห็นโน้ตเต็มแผ่น" }, { status: 422 });
    return NextResponse.json({ data: d, error: null });
  } catch (e) {
    if (e instanceof ServiceOffError || e instanceof BudgetExceededError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "AI อ่านรูปไม่สำเร็จ กรุณาลองใหม่ หรือเพิ่มวัตถุดิบเอง" }, { status: 502 });
  }
}
