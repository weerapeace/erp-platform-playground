/**
 * Social Embed (ของกลาง) — /api/social-embed?url=<ลิงก์ Pinterest/TikTok>
 * คืน { kind, id, url, width, height, available, image } ให้กระดานฝังรูป/วิดีโอได้ถูกขนาด
 *
 * - ลิงก์สั้น (pin.it · vt./vm.tiktok.com · tiktok.com/t/) → ตามลิงก์ไปหาลิงก์เต็ม (ยอมเด้งเฉพาะโดเมน Pinterest/TikTok)
 * - Pinterest → ถามข้อมูลพินจาก widget API สาธารณะ (สัดส่วนรูป = ความสูงกรอบ · ไม่มีรูป = พินถูกลบ/ส่วนตัว)
 * - TikTok → ไม่ต้องถามอะไร (ขนาดตายตัว 325×578) · Instagram → ไม่ต้องถาม (ตัวฝังแจ้งเองถ้าโพสต์ถูกลบ/ส่วนตัว)
 * ความปลอดภัย: รับเฉพาะลิงก์ที่ lib/social-embed อ่านออก · ตัดเวลา 6 วิ · ไม่ส่ง cookie · ไม่อ่าน body ของการเด้งลิงก์ (HEAD)
 */
import { NextRequest, NextResponse } from "next/server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { parseSocialLink, socialEmbedSize, type SocialEmbedInfo } from "@/lib/social-embed";
import { expandShortSocial, pinterestInfo } from "@/lib/social-embed-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // กระดานอยู่ทั้งฝั่งงาน (tasks) และฝั่งสินค้า (ใบงานออกแบบ/บอร์ดจ่ายงาน) → มีสิทธิ์ดูฝั่งใดฝั่งหนึ่งก็พอ
  const denied = (await apiCan(request, "tasks.view")) ? null : await guardApi(request, "products.view");
  if (denied) return denied;

  const raw = (new URL(request.url).searchParams.get("url") ?? "").trim();
  let link = parseSocialLink(raw);
  if (!link) return NextResponse.json({ data: null, error: "ไม่ใช่ลิงก์ Pinterest / TikTok / Instagram ที่ฝังได้" }, { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    if (!link.id) {
      const full = await expandShortSocial(link.url, ctrl.signal);
      if (!full?.id) return NextResponse.json({ data: null, error: "เปิดลิงก์สั้นนี้ไม่ได้ ลองเปิดในแอปแล้ว copy ลิงก์เต็มมาวางแทน" });
      link = full;
    }
    const id = link.id as string;
    let out: SocialEmbedInfo;
    if (link.kind === "pinterest") {
      const p = await pinterestInfo(id, ctrl.signal);
      out = { kind: "pinterest", id, url: link.url, ...socialEmbedSize("pinterest", p.ratio), available: p.available, image: p.image };
    } else if (link.kind === "instagram") {
      out = { kind: "instagram", id, url: link.url, ...socialEmbedSize("instagram"), available: true, image: null };
    } else {
      // TikTok: oEmbed ตอบ 200 แม้เลขคลิปไม่มีจริง → เช็กสถานะไม่ได้ ปล่อยให้ตัวเล่นของ TikTok แจ้ง "คลิปใช้ไม่ได้" เอง
      out = { kind: "tiktok", id, url: link.url, ...socialEmbedSize("tiktok"), available: true, image: null };
    }
    return NextResponse.json({ data: out, error: null }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "ดึงข้อมูลลิงก์หมดเวลา" : "ดึงข้อมูลลิงก์ไม่สำเร็จ";
    // รู้เลขอยู่แล้ว → ยังฝังได้ (แค่ไม่รู้ขนาด/สถานะ) · ลิงก์สั้นที่ย่อไม่ได้ → แจ้ง error
    if (link.id) return NextResponse.json({ data: { kind: link.kind, id: link.id, url: link.url, ...socialEmbedSize(link.kind), available: true, image: null } satisfies SocialEmbedInfo, error: null });
    return NextResponse.json({ data: null, error: msg });
  } finally { clearTimeout(timer); }
}
