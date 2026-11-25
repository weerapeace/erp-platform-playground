/**
 * 🐾 ทะเบียนแมว — ข้อความแจ้งเตือน LINE (pure · ทดสอบได้)
 *   สรุปวันละ 1 ข้อความ (ประหยัดโควตา LINE ที่ทั้ง ERP ใช้ร่วมกัน · นับตามจำนวนคนในกลุ่ม)
 *   ส่งเฉพาะวันที่ "ถึงจุดเตือน": วัคซีน/ยา = อีก health_days วัน · พรุ่งนี้ · วันนี้
 *                                  ของใกล้หมด = อีก supply_days วัน · 3 วัน · 1 วัน · หมดแล้ววันนี้
 *   รอบ 5: น้ำหนักลดผิดปกติ = เช้าหลังวันที่ชั่ง (ครั้งเดียว) · ไม่ได้ชั่งเกิน 30 วัน = วันที่ 31 แล้วทุก 30 วัน
 *          วันเกิด / วันรับเลี้ยง = เช้าวันนั้น
 *   (วันอื่น ๆ ไม่ส่งซ้ำ — cron วันละครั้งจึงเตือนแต่ละเรื่องไม่เกิน 3-4 ครั้ง)
 *   test = ส่งทุกเรื่องที่อยู่ในช่วงเตือน (ปุ่ม "ส่งทดสอบตอนนี้")
 * ตัวส่งจริง = app/api/cron/cat-reminders (ผ่าน lib/line-send)
 */
import { daysBetween, dueItems, type CatsData } from "@/lib/cats";
import { anniversaries, anniversaryText, WEIGHT_STALE_DAYS, weightAlert, weightAlertText } from "@/lib/cats-extras";
import { asMealPlan, fmtQty, stockUnitLabel, supplyStatus, type NotifySettings } from "@/lib/cats-supplies";
import { formatDate } from "@/lib/date";

export type DigestLine = { key: string; text: string; url?: string | null };

const when = (d: number) => (d < 0 ? `เลยมา ${-d} วัน` : d === 0 ? "วันนี้" : d === 1 ? "พรุ่งนี้" : `อีก ${d} วัน`);

export function digestLines(data: CatsData, mealPlanRaw: unknown, s: NotifySettings, today: string, test = false): DigestLine[] {
  const out: DigestLine[] = [];
  const healthHit = (d: number) => (test ? d <= s.health_days : d === s.health_days || d === 1 || d === 0);
  for (const d of dueItems(data, today, s.health_days)) {
    if (!healthHit(d.daysLeft)) continue;
    const icon = d.kind === "vaccinations" ? "💉" : "💊";
    out.push({ key: d.key, text: `${icon} ${d.catName} — ${d.title} ${formatDate(d.due)} (${when(d.daysLeft)})` });
  }
  for (const c of data.cats.filter((x) => x.is_active)) {
    const a = weightAlert(data.weights, c.id, today);
    if (!a) continue;
    const hit = test || (a.kind === "drop" ? daysBetween(a.date, today) === 1 : a.days > WEIGHT_STALE_DAYS && (a.days - WEIGHT_STALE_DAYS - 1) % 30 === 0);
    if (hit) out.push({ key: `w:${c.id}`, text: `⚖️ ${c.name} — ${weightAlertText(a)}${a.kind === "drop" ? " ลองสังเกตอาการ/ปรึกษาหมอ" : ""}` });
  }
  for (const a of anniversaries(data.cats, today, test ? 7 : 0)) {
    out.push({ key: `a:${a.key}`, text: `${a.kind === "birthday" ? "🎂" : "🏠"} ${anniversaryText(a)}` });
  }
  const plan = asMealPlan(mealPlanRaw);
  const active = data.supplies.filter((x) => x.is_active);
  const supplyHit = (d: number) => (test ? d <= s.supply_days : d === s.supply_days || d === 3 || d === 1 || d === 0);
  for (const sp of active) {
    const st = supplyStatus(sp, data.purchases, plan, active, today);
    // ใช้วันแบบติดลบได้ — หมดไปแล้วหลายวันไม่เตือนซ้ำทุกเช้า (ยกเว้นตอนกดทดสอบ)
    if (st.daysLeftRaw == null || !(test ? st.daysLeftRaw <= s.supply_days : supplyHit(st.daysLeftRaw))) continue;
    const name = [sp.brand, sp.flavor].filter(Boolean).join(" ");
    const left = st.daysLeft === 0 ? "หมดแล้ว" : `เหลือ ${fmtQty(st.remaining)} ${stockUnitLabel(sp)} หมดใน ${st.daysLeft} วัน`;
    out.push({ key: `s:${sp.id}`, text: `🛒 ${name} — ${left}`, url: sp.shop_url });
  }
  return out;
}

/** ข้อความ LINE 1 ข้อความ (null = วันนี้ไม่มีเรื่องเตือน) */
export function digestText(lines: DigestLine[], today: string, appUrl: string): string | null {
  if (!lines.length) return null;
  const body = lines.map((l) => (l.url ? `${l.text}\n   สั่งซื้อ: ${l.url}` : l.text)).join("\n");
  return `🐾 เตือนเรื่องแมว (${formatDate(today)})\n${body}\n\nเปิดแอป: ${appUrl.replace(/\/$/, "")}/misc/cats`;
}
