/**
 * 💬 การ์ดเช็กลิสต์ใน Discord (ของกลาง · ฝั่งเซิร์ฟเวอร์) — 1 เรคคอร์ด = 1 ข้อความ: การ์ด (embed) + ปุ่มติ๊กทีละข้อ + ปุ่มเปิดในระบบ
 * ใช้ทั้งตอนโพสต์รายงาน (lib/email-report/discord) และตอนมีคนกดปุ่ม (app/api/discord/interactions) → หน้าตาเดียวกันเสมอ
 * ปุ่มติ๊ก custom_id = "rt:<id ใน erp_record_tasks>" · ติ๊ก = สลับ ค้าง ⇄ เสร็จ (กดผิดกดซ้ำได้)
 * เพิ่มข้อจาก Discord (ส่ง add = เรคคอร์ดไหน + ค่าที่ใช้บ่อย):
 *   ปุ่ม "＋ พิมพ์เพิ่ม" custom_id "rta:<module>:<record>" → เด้งกล่องพิมพ์ (modal "rtm:…": หลายบรรทัด = หลายข้อ + ผู้รับผิดชอบ)
 *   เมนู "ค่าที่ใช้บ่อย" custom_id "rtp:<module>:<record>" → เลือกแล้วเพิ่มทันที (ซ่อนค่าที่มีค้างอยู่แล้ว)
 * ลิงก์ของข้อที่ยังรอ (เช่น ร้านที่จะซื้อของ) = ช่อง "🔗 ลิงก์" ในการ์ด กดเปิดได้เลย
 */
import { isTaskDone, linkLabel, taskWithWho, type TaskLink } from "@/lib/record-tasks";

/** assigned_name = ชื่อผู้รับผิดชอบ (โชว์บนปุ่ม "☐ รอหาผ้า · ฝน") */
export type ChecklistTask = { id: string; title: string; status: string; resolved_by?: string | null; assigned_name?: string | null; links?: TaskLink[] };
export type ChecklistCardBase = { title: string; url: string | null; description: string; thumbnail: string | null };
/** เปิดให้เพิ่มข้อจาก Discord: เช็กลิสต์ชนิดไหน · เรคคอร์ดไหน · ค่าที่ใช้บ่อย */
export type ChecklistAdd = { moduleKey: string; recordId: string; presets: string[] };
type Embed = { title?: string; url?: string; description?: string; color?: number; thumbnail?: { url: string }; fields?: { name: string; value: string }[] };

const AMBER = 0xf0b232;
const GREEN = 0x23a55a;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const SAFE_KEY = /^[a-z0-9_]{1,40}$/i;
const UUID = /^[0-9a-f-]{36}$/i;

/** "rta:design_sheet_waiting:<uuid>" → { kind, moduleKey, recordId } (ไม่ถูกรูปแบบ = null) */
export function parseChecklistCustomId(customId: string): { kind: "add" | "preset" | "modal"; moduleKey: string; recordId: string } | null {
  const [p, moduleKey, recordId] = customId.split(":");
  const kind = p === "rta" ? "add" : p === "rtp" ? "preset" : p === "rtm" ? "modal" : null;
  if (!kind || !SAFE_KEY.test(moduleKey ?? "") || !UUID.test(recordId ?? "")) return null;
  return { kind, moduleKey, recordId };
}

/** กล่องพิมพ์เพิ่มสิ่งที่รอ (Discord modal) — ข้อความ 1 บรรทัด = 1 ข้อ · ผู้รับผิดชอบพิมพ์ชื่อในระบบ (ไม่บังคับ) */
export function checklistAddModal(moduleKey: string, recordId: string, code: string | null) {
  return {
    custom_id: `rtm:${moduleKey}:${recordId}`,
    title: clip(`เพิ่มสิ่งที่รอ${code ? ` — ${code}` : ""}`, 45),
    components: [
      { type: 1, components: [{ type: 4, custom_id: "items", style: 2, label: "สิ่งที่รอ (1 บรรทัด = 1 ข้อ)", required: true, max_length: 1000, placeholder: "เช่น ทำ Pattern\nรอลูกค้าเลือกสี" }] },
      { type: 1, components: [{ type: 4, custom_id: "who", style: 1, label: "ผู้รับผิดชอบ (ไม่บังคับ)", required: false, max_length: 60, placeholder: "พิมพ์ชื่อในระบบ เช่น ฝน" }] },
    ],
  };
}

/** markdown ลิงก์ของ Discord — กันวงเล็บในชื่อ/ลิงก์ทำให้ลิงก์ขาด */
const mdLink = (l: TaskLink) => `[${clip(linkLabel(l).replace(/[[\]]/g, ""), 40)}](${l.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`;

/** ช่อง "🔗 ลิงก์" — เฉพาะข้อที่ยังรอและมีลิงก์ (ไม่มี = null) */
function linksField(tasks: ChecklistTask[]): { name: string; value: string } | null {
  const lines: string[] = [];
  for (const t of tasks.filter((x) => !isTaskDone(x.status) && x.links?.length)) {
    const line = `**${clip(t.title, 60)}**: ${t.links!.map(mdLink).join(" · ")}`;
    if ([...lines, line].join("\n").length > 1000) break;
    lines.push(line);
  }
  return lines.length ? { name: "🔗 ลิงก์", value: lines.join("\n") } : null;
}

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

/** ปุ่ม: ข้อที่ยังรอขึ้นก่อน (เทา ☐) · ข้อที่เสร็จ (เขียว ✓) · แถวท้าย = ＋ พิมพ์เพิ่ม + เปิดในระบบ · เมนูค่าที่ใช้บ่อย (ถ้ามี)
 *  Discord ให้ 5 แถวต่อข้อความ → ปุ่มติ๊กได้ 4 แถว (20 ข้อ) หรือ 3 แถว (15 ข้อ) เมื่อมีเมนูค่าที่ใช้บ่อย */
export function checklistComponents(tasks: ChecklistTask[], openUrl: string | null, interactive: boolean, add?: ChecklistAdd | null) {
  const openTitles = new Set(tasks.filter((t) => !isTaskDone(t.status)).map((t) => t.title.trim()));
  const presets = interactive && add ? add.presets.filter((p) => !openTitles.has(p)).slice(0, 25) : [];
  const maxTick = presets.length ? 15 : 20;
  const ordered = [...tasks.filter((t) => !isTaskDone(t.status)), ...tasks.filter((t) => isTaskDone(t.status))].slice(0, maxTick);
  const buttons = interactive ? ordered.map((t) => {
    const done = isTaskDone(t.status);
    return { type: 2, style: done ? 3 : 2, label: clip(`${done ? "✓" : "☐"} ${taskWithWho(t.title, t.assigned_name)}`, 80), custom_id: `rt:${t.id}` };
  }) : [];
  const rows: { type: 1; components: Record<string, unknown>[] }[] = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push({ type: 1, components: buttons.slice(i, i + 5) });
  const last: Record<string, unknown>[] = [];
  if (interactive && add) last.push({ type: 2, style: 1, label: "＋ พิมพ์เพิ่ม", custom_id: `rta:${add.moduleKey}:${add.recordId}` });
  if (openUrl) last.push({ type: 2, style: 5, label: "เปิดใบงาน", url: openUrl });
  if (last.length) rows.push({ type: 1, components: last });
  if (presets.length && add) {
    rows.push({ type: 1, components: [{
      type: 3, custom_id: `rtp:${add.moduleKey}:${add.recordId}`, placeholder: "＋ เพิ่มจากค่าที่ใช้บ่อย…",
      options: presets.map((p) => ({ label: clip(p, 100), value: clip(p, 100) })),
    }] });
  }
  return rows;
}

/** ข้อความการ์ดเต็ม (ตอนโพสต์) */
export function checklistCardMessage(base: ChecklistCardBase, tasks: ChecklistTask[], interactive: boolean, add?: ChecklistAdd | null) {
  const s = statusField(tasks, interactive);
  const embed: Embed = {
    title: clip(base.title, 256), description: clip(base.description, 1500), color: s.color, fields: [s.field, ...(linksField(tasks) ? [linksField(tasks)!] : [])],
    ...(base.url ? { url: base.url } : {}), ...(base.thumbnail ? { thumbnail: { url: base.thumbnail } } : {}),
  };
  return { embeds: [embed], components: checklistComponents(tasks, base.url, interactive, add), allowed_mentions: { parse: [] as string[] } };
}

/** หลังกดติ๊ก/เพิ่ม: ใช้การ์ดเดิมจากข้อความ (ชื่อ/ลิงก์/รูป) แล้วเปลี่ยนแค่สถานะ + ปุ่ม */
export function checklistCardUpdate(oldEmbed: Embed | undefined, tasks: ChecklistTask[], add?: ChecklistAdd | null) {
  const s = statusField(tasks, true);
  const o = oldEmbed ?? {};
  // เอาเฉพาะช่องที่เราตั้งเอง (การ์ดที่ Discord ส่งกลับมีช่องอ่านอย่างเดียวปน เช่น proxy_url)
  const embed: Embed = {
    ...(o.title ? { title: o.title } : {}), ...(o.url ? { url: o.url } : {}), ...(o.description ? { description: o.description } : {}),
    ...(o.thumbnail?.url ? { thumbnail: { url: o.thumbnail.url } } : {}), color: s.color, fields: [s.field, ...(linksField(tasks) ? [linksField(tasks)!] : [])],
  };
  return { embeds: [embed], components: checklistComponents(tasks, o.url ?? null, true, add) };
}
