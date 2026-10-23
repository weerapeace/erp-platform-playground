/**
 * 💬 การ์ดเช็กลิสต์ใน Discord (ของกลาง · ฝั่งเซิร์ฟเวอร์) — 1 เรคคอร์ด = 1 ข้อความ: การ์ด (embed) + ปุ่มติ๊กทีละข้อ + ปุ่มเปิดในระบบ
 * ใช้ทั้งตอนโพสต์รายงาน (lib/email-report/discord) และตอนมีคนกดปุ่ม (app/api/discord/interactions) → หน้าตาเดียวกันเสมอ
 * ปุ่มติ๊ก custom_id = "rt:<id ใน erp_record_tasks>" · ติ๊ก = สลับ ค้าง ⇄ เสร็จ (กดผิดกดซ้ำได้)
 */
import { isTaskDone, taskWithWho } from "@/lib/record-tasks";

/** assigned_name = ชื่อผู้รับผิดชอบ (โชว์บนปุ่ม "☐ รอหาผ้า · ฝน") */
export type ChecklistTask = { id: string; title: string; status: string; resolved_by?: string | null; assigned_name?: string | null };
export type ChecklistCardBase = { title: string; url: string | null; description: string; thumbnail: string | null };
type Embed = { title?: string; url?: string; description?: string; color?: number; thumbnail?: { url: string }; fields?: { name: string; value: string }[] };

const AMBER = 0xf0b232;
const GREEN = 0x23a55a;
const MAX_TICK_BUTTONS = 20;   // 4 แถว × 5 ปุ่ม (แถวสุดท้ายเป็นปุ่มเปิดในระบบ) — Discord ให้ 5 แถวต่อข้อความ
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** ช่องสถานะในการ์ด — ไม่มีปุ่มติ๊ก (ยังไม่ตั้งลิงก์รับปุ่ม) = เขียนข้อที่ค้างไว้ในการ์ดแทน */
function statusField(tasks: ChecklistTask[], interactive: boolean) {
  const open = tasks.filter((t) => !isTaskDone(t.status));
  const done = tasks.filter((t) => isTaskDone(t.status));
  const lines = [
    ...(interactive ? [] : open.map((t) => `☐ ${taskWithWho(t.title, t.assigned_name, " — ")}`)),
    ...done.slice(-6).map((t) => `✓ ${t.title}${t.resolved_by ? ` — ${t.resolved_by}` : ""}`),
  ];
  return {
    color: open.length === 0 ? GREEN : AMBER,
    field: {
      name: open.length === 0 ? "✓ ไม่มีอะไรรอแล้ว" : `⏳ เหลือ ${open.length}/${tasks.length} ข้อ`,
      value: lines.length ? clip(lines.join("\n"), 1000) : "กดปุ่มด้านล่างเมื่อเสร็จ",
    },
  };
}

/** ปุ่ม: ข้อที่ยังรอขึ้นก่อน (เทา ☐) · ข้อที่เสร็จ (เขียว ✓) · ท้ายสุด = ลิงก์เปิดในระบบ */
export function checklistComponents(tasks: ChecklistTask[], openUrl: string | null, interactive: boolean) {
  const ordered = [...tasks.filter((t) => !isTaskDone(t.status)), ...tasks.filter((t) => isTaskDone(t.status))].slice(0, MAX_TICK_BUTTONS);
  const buttons = interactive ? ordered.map((t) => {
    const done = isTaskDone(t.status);
    return { type: 2, style: done ? 3 : 2, label: clip(`${done ? "✓" : "☐"} ${taskWithWho(t.title, t.assigned_name)}`, 80), custom_id: `rt:${t.id}` };
  }) : [];
  const rows: { type: 1; components: Record<string, unknown>[] }[] = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  if (openUrl) rows.push({ type: 1, components: [{ type: 2, style: 5, label: "เปิดใบงาน", url: openUrl }] });
  return rows;
}

/** ข้อความการ์ดเต็ม (ตอนโพสต์) */
export function checklistCardMessage(base: ChecklistCardBase, tasks: ChecklistTask[], interactive: boolean) {
  const s = statusField(tasks, interactive);
  const embed: Embed = {
    title: clip(base.title, 256), description: clip(base.description, 1500), color: s.color, fields: [s.field],
    ...(base.url ? { url: base.url } : {}), ...(base.thumbnail ? { thumbnail: { url: base.thumbnail } } : {}),
  };
  return { embeds: [embed], components: checklistComponents(tasks, base.url, interactive), allowed_mentions: { parse: [] as string[] } };
}

/** หลังกดติ๊ก: ใช้การ์ดเดิมจากข้อความ (ชื่อ/ลิงก์/รูป) แล้วเปลี่ยนแค่สถานะ + ปุ่ม */
export function checklistCardUpdate(oldEmbed: Embed | undefined, tasks: ChecklistTask[]) {
  const s = statusField(tasks, true);
  const o = oldEmbed ?? {};
  // เอาเฉพาะช่องที่เราตั้งเอง (การ์ดที่ Discord ส่งกลับมีช่องอ่านอย่างเดียวปน เช่น proxy_url)
  const embed: Embed = {
    ...(o.title ? { title: o.title } : {}), ...(o.url ? { url: o.url } : {}), ...(o.description ? { description: o.description } : {}),
    ...(o.thumbnail?.url ? { thumbnail: { url: o.thumbnail.url } } : {}), color: s.color, fields: [s.field],
  };
  return { embeds: [embed], components: checklistComponents(tasks, o.url ?? null, true) };
}
