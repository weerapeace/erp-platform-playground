// 💌 /order-ops/gift-cards — รวมเข้าหน้า "คำสั่งพิเศษ & การ์ด" แล้ว (เจ้าของเลือก 2026-11-25 ข้อ 2)
// ลิงก์เก่า (บันทึกไว้/แชร์ไป) พาไปส่วนที่ตรงกันในหน้ารวม /order-ops/instructions · ชิ้นส่วนจริงอยู่ที่ ../gift-panels
import { redirect } from "next/navigation";

export default async function GiftCardsRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const target = tab === "cards" ? "?s=cards"
    : tab === "templates" ? "?s=settings"
    : ["engrave", "engrave_missing", "other"].includes(tab) ? `?tab=${tab}`
    : "";
  redirect(`/order-ops/instructions${target}`);
}
