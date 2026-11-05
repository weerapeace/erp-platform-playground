/**
 * 📝 ใบจดผลงาน — ฝั่งเซิร์ฟเวอร์ (ห้าม import จากหน้าจอ)
 *   loadWorkLogLayout  : ใบสั่งผลิต + ขั้นตอนบนหน้านั้น (จาก QR)
 *   readWorkLogImage   : ส่งรูปให้ AI อ่าน โดยบอกโครงแถวทั้งหมด + รายชื่อพนักงานให้เลือก
 *   aiToRows           : ผล AI → บรรทัดสำหรับหน้าตรวจ (จับคู่ชื่อ · แปลงวันที่/เวลา/ตัวเลข)
 *   กติกาที่ใช้ร่วมหน้าจอ: lib/work-log-read.ts · ใบที่พิมพ์: lib/work-log-sheet.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJson, openAiKey } from "@/lib/ai-caption";
import { fileRefToDataUrl } from "@/lib/file-ref-server";
import { stepCode } from "@/lib/work-log-sheet";
import {
  dayMonthToIso, employeeLabel, lineKeyExtra, lineKeyStep, matchEmployee, normQty, normTime, stepsForQr, todayBangkok,
  type WorkLogEmployee, type WorkLogQr, type WorkLogRow,
} from "@/lib/work-log-read";

type Admin = SupabaseClient;

/** โมเดลอ่านลายมือ — ต้องการความแม่น ใช้ตัวเต็ม (ตั้งทับได้ด้วย OPENAI_WORKLOG_MODEL) */
export const WORK_LOG_AI_MODEL = (process.env.OPENAI_WORKLOG_MODEL || "gpt-4.1").trim();

export type WorkLogMoInfo = { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number | null };
export type WorkLogLayoutStep = { id: string | null; code: string; name: string };
export type WorkLogLayout = {
  mo: WorkLogMoInfo | null;
  page: number;
  total: number;
  linesPerStep: number;
  steps: WorkLogLayoutStep[];      // ขั้นตอนบนหน้านี้ตามลำดับ (ว่าง = ใบเปล่า/ไม่มี QR)
  fromQr: boolean;
};

export async function loadWorkLogMo(admin: Admin, moId: string): Promise<(WorkLogMoInfo & { bom_code: string | null }) | null> {
  const { data } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, bom_code").eq("id", moId).maybeSingle();
  const m = data as { id: string; mo_no: string; product_sku: string | null; product_name: string | null; qty: number | null; bom_code: string | null } | null;
  return m ? { ...m, qty: m.qty == null ? null : Number(m.qty) } : null;
}

async function bomCodeOf(admin: Admin, mo: { bom_code: string | null; product_sku: string | null }): Promise<string | null> {
  if (mo.bom_code) return mo.bom_code;
  if (!mo.product_sku) return null;
  const { data } = await admin.from("bom_headers").select("bom_code, updated_at").eq("product_sku", mo.product_sku).eq("is_active", true)
    .order("updated_at", { ascending: false }).limit(1);
  return ((data ?? [])[0] as { bom_code: string | null } | undefined)?.bom_code ?? null;
}

/** โครงหน้าจาก QR (มี) หรือจากใบสั่งผลิตที่คนเลือกเอง (ไม่มี QR = ถือว่าทุกบรรทัดเป็นขั้นตอนเขียนเอง) */
export async function loadWorkLogLayout(admin: Admin, qr: WorkLogQr | null, moId: string | null): Promise<WorkLogLayout> {
  const id = qr?.moId ?? moId;
  const mo = id ? await loadWorkLogMo(admin, id) : null;
  const base: WorkLogLayout = { mo, page: qr?.page ?? 1, total: qr?.total ?? 1, linesPerStep: qr?.linesPerStep ?? 3, steps: [], fromQr: !!qr };
  if (!mo || !qr || qr.stepPrefixes.length === 0) return base;
  const bom = await bomCodeOf(admin, mo);
  if (!bom) return base;
  // รวมขั้นตอนที่ปิดไปแล้วด้วย — แก้สูตรหลังพิมพ์ = แถวเดิมถูกปิด แต่ใบที่ถืออยู่ยังอ้างรหัสเดิม
  const { data } = await admin.from("bom_work_steps").select("id, sequence, step_name").eq("bom_code", bom);
  const all = (data ?? []) as { id: string; sequence: number; step_name: string }[];
  const found = stepsForQr(qr, all);
  base.steps = found.map((s, i) => (s ? { id: s.id, code: stepCode(Number(s.sequence) || i + 1), name: s.step_name } : { id: null, code: `S??${i + 1}`, name: "(ขั้นตอนนี้ถูกลบจากสูตรแล้ว)" }));
  return base;
}

/** พนักงานที่ยังทำงานอยู่ (ให้ AI เลือก + ให้คนเลือกในหน้าตรวจ) */
export async function loadActiveEmployees(admin: Admin): Promise<WorkLogEmployee[]> {
  const { data } = await admin.from("employees").select("id, employee_code, nickname, first_name, last_name, first_name_th, last_name_th")
    .eq("employment_status", "active").order("nickname", { ascending: true }).limit(1000);
  return ((data ?? []) as Record<string, string | null>[]).map((e) => ({
    id: String(e.id), code: e.employee_code ?? null, nickname: e.nickname?.trim() || null,
    first_name: (e.first_name_th || e.first_name)?.trim() || null, last_name: (e.last_name_th || e.last_name)?.trim() || null,
  }));
}

// ── AI ────────────────────────────────────────────────────────────────────────────────
function systemPrompt(layout: WorkLogLayout, employees: WorkLogEmployee[]): string {
  const stepLines = layout.steps.length
    ? layout.steps.map((s) => `- ${s.code} "${s.name}" มี ${layout.linesPerStep} บรรทัด (อ้างอิง ${s.code}#1 ถึง ${s.code}#${layout.linesPerStep} จากบนลงล่าง)`).join("\n")
    : "- (หน้านี้ไม่มีขั้นตอนพิมพ์ไว้ ทุกบรรทัดเป็นบรรทัดว่างที่เขียนชื่อขั้นตอนเอง)";
  return `คุณอ่าน "ใบจดผลงาน" ที่หัวหน้าเขียนด้วยลายมือ (ภาษาไทย) จากรูปถ่าย
ตารางมีคอลัมน์จากซ้ายไปขวา: ขั้นตอน·ชิ้นส่วน | ชื่อ (ชื่อเล่นเขียนมือ) | วันที่ วว/ดด (กล่องตัวเลข) | เริ่ม HH:MM | เลิก HH:MM | ทำได้ (4 กล่อง ตัวเลขชิดขวา) | เสีย (3 กล่อง) | เสร็จ (วงกลมระบาย) | หมายเหตุ
ขั้นตอนที่พิมพ์ไว้บนหน้านี้ เรียงจากบนลงล่าง:
${stepLines}
ถัดลงมาเป็นช่วง "ขั้นตอนเพิ่ม" (บรรทัดที่เขียนชื่อขั้นตอนเองในช่องแรก) นับลำดับ 1,2,3 จากบนลงล่าง
รายชื่อพนักงานที่มีในระบบ (เลือกได้เฉพาะจากนี้):
${employees.map(employeeLabel).join(", ")}

ตอบ JSON เท่านั้น:
{"rows":[{"ref":"S01#1","name_written":"ชื่อตามที่เขียน","name_match":"ป้ายชื่อจากรายชื่อด้านบนที่ตรงที่สุด หรือ null","date":"วว/ดด","start":"HH:MM","end":"HH:MM","done":ตัวเลขหรือnull,"waste":ตัวเลขหรือnull,"finished":true/false,"note":"","unsure":["ชื่อช่องที่อ่านไม่ชัด: name/date/start/end/done/waste"]}],
 "extra":[{"index":1,"step_name":"ชื่อขั้นตอนที่เขียน", ...ช่องเดียวกับ rows ยกเว้น ref}]}
กฎ: ใส่เฉพาะบรรทัดที่มีลายมือเขียนอย่างน้อย 1 ช่อง · ห้ามเดาค่าที่มองไม่เห็น ใส่ null แทน · บรรทัดที่ขีดฆ่าทั้งบรรทัดให้ข้าม
ตัวเลขในกล่องอ่านทีละหลักแล้วต่อกัน (กล่องว่างด้านซ้ายไม่นับ) · ถ้าไม่แน่ใจตัวไหนให้ใส่ชื่อช่องใน unsure · ตัวอย่างที่พิมพ์ไว้ท้ายใบ ("74 ชิ้น") ไม่ใช่ข้อมูล`;
}

export type WorkLogAiResult = { rows: unknown[]; extra: unknown[] };

export async function readWorkLogImage(admin: Admin, fileRef: string, layout: WorkLogLayout, employees: WorkLogEmployee[]): Promise<WorkLogAiResult> {
  if (!openAiKey()) throw new Error("ยังไม่ได้ตั้งค่า AI (OPENAI_API_KEY) — กรอกเองในหน้าตรวจได้");
  const url = await fileRefToDataUrl(admin, fileRef);
  if (!url) throw new Error("อ่านไฟล์รูปไม่ได้ (ไฟล์อาจยังอัปโหลดไม่เสร็จ)");
  return readWorkLogDataUrl(url, layout, employees);
}

/** ส่วนที่คุย AI จริง (แยกออกมาให้ทดสอบกับรูปตัวอย่างได้โดยไม่ต้องผ่านที่เก็บไฟล์) */
export async function readWorkLogDataUrl(url: string, layout: WorkLogLayout, employees: WorkLogEmployee[]): Promise<WorkLogAiResult> {
  const raw = await chatJson(systemPrompt(layout, employees), [
    { type: "text", text: "อ่านใบจดผลงานนี้ แล้วตอบ JSON ตามโครงที่กำหนด" },
    { type: "image_url", image_url: { url, detail: "high" } },
  ], 4000, WORK_LOG_AI_MODEL);
  return { rows: Array.isArray(raw.rows) ? raw.rows : [], extra: Array.isArray(raw.extra) ? raw.extra : [] };
}

type AiRow = { ref?: unknown; index?: unknown; step_name?: unknown; name_written?: unknown; name_match?: unknown; date?: unknown; start?: unknown; end?: unknown; done?: unknown; waste?: unknown; finished?: unknown; note?: unknown; unsure?: unknown };
const s = (v: unknown) => (v == null ? "" : String(v).trim());

/** ผล AI → บรรทัดหน้าตรวจ · บรรทัดที่ AI อ้างไม่ตรงโครง = ข้าม */
export function aiToRows(ai: WorkLogAiResult, layout: WorkLogLayout, employees: WorkLogEmployee[], today = todayBangkok()): WorkLogRow[] {
  const out: WorkLogRow[] = [];
  const fill = (r: AiRow, base: Pick<WorkLogRow, "line_key" | "kind" | "step_id" | "step_code" | "step_name">): WorkLogRow => {
    const name = s(r.name_written);
    const m = matchEmployee(name, employees, r.name_match ? s(r.name_match) : null);
    const unsure = Array.isArray(r.unsure) ? r.unsure.map(s).filter(Boolean) : [];
    if (name && !m.sure && !unsure.includes("name")) unsure.push("name");
    const date = dayMonthToIso(r.date, today);
    if (s(r.date) && !date && !unsure.includes("date")) unsure.push("date");
    return {
      ...base, name_written: name, employee_id: m.employee_id, work_date: date,
      start_time: normTime(r.start), end_time: normTime(r.end), qty_done: normQty(r.done), qty_waste: normQty(r.waste),
      step_done: r.finished === true || s(r.finished) === "true", note: s(r.note), unsure, include: true,
    };
  };
  for (const r of ai.rows as AiRow[]) {
    const m = /^(S[\w?]+)#(\d)$/.exec(s(r.ref));
    if (!m) continue;
    const step = layout.steps.find((x) => x.code === m[1]);
    const line = Number(m[2]);
    if (!step || line < 1 || line > layout.linesPerStep) continue;
    const key = lineKeyStep(layout.page, step.code, line);
    if (out.some((x) => x.line_key === key)) continue;
    out.push(fill(r, { line_key: key, kind: "step", step_id: step.id, step_code: step.code, step_name: step.name }));
  }
  (ai.extra as AiRow[]).forEach((r, i) => {
    const n = Number(r.index) || i + 1;
    const key = lineKeyExtra(layout.page, n);
    if (out.some((x) => x.line_key === key)) return;
    out.push(fill(r, { line_key: key, kind: "extra", step_id: null, step_code: null, step_name: s(r.step_name) }));
  });
  // เรียงตามลำดับบนใบ: ขั้นตอนตามลำดับ → บรรทัด → ขั้นตอนเพิ่ม
  const order = (r: WorkLogRow) => (r.kind === "step" ? layout.steps.findIndex((x) => x.code === r.step_code) * 10 + Number(r.line_key.split("#")[1] ?? 0) : 10_000 + Number(r.line_key.split(":x")[1] ?? 0));
  return out.sort((a, b) => order(a) - order(b));
}
