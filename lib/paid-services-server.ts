/**
 * ด่านกลาง "AI และ API ที่เสียเงิน" (ฝั่งเซิร์ฟเวอร์เท่านั้น) — ทะเบียนอยู่ที่ lib/paid-services
 *
 *   aiChat(key, system, content, maxTokens, model?)  GPT แบบตอบ JSON — ปิดอยู่ = โยน ServiceOffError (ข้อความภาษาคน)
 *                                                    โมเดล: ที่แอดมินเลือกในศูนย์ → ที่ฟีเจอร์ส่งมา → ค่าเริ่มต้น
 *   getAiFor(key)       Cloudflare AI — ปิดอยู่ = null (ผู้เรียกจัดการ null อยู่แล้ว เหมือนตอนยังไม่ตั้งค่า)
 *   serviceOn(key)      เช็กก่อนเรียกบริการอื่น (สลิป / LINE / อีเมล) · logServiceUse(key, …) บันทึกการใช้
 *
 * ค่าตั้ง = ตาราง paid_service_settings (แคช 30 วิ) · อ่านไม่ได้ = ถือว่าเปิด (ไม่ทำให้ระบบอื่นพังเพราะศูนย์นี้)
 * บันทึกการใช้ = paid_service_usage (บันทึกไม่ได้ = ข้าม ไม่ขวางงาน)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { openAiChatRaw } from "@/lib/ai-caption";
import { getAi, type AiRunner } from "@/lib/ai";
import { estimateCostThb, paidService, serviceOffMessage } from "@/lib/paid-services";

export type ServiceSetting = { key: string; enabled: boolean; model: string | null };

const TTL_MS = 30_000;
let cache: { at: number; map: Map<string, ServiceSetting> } | null = null;

export async function loadServiceSettings(force = false): Promise<Map<string, ServiceSetting>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = new Map<string, ServiceSetting>();
  try {
    const { data, error } = await supabaseAdmin().from("paid_service_settings").select("key, enabled, model");
    if (error) throw error;
    for (const r of (data ?? []) as ServiceSetting[]) map.set(r.key, { key: r.key, enabled: r.enabled !== false, model: r.model || null });
    cache = { at: Date.now(), map };
  } catch { /* อ่านไม่ได้ = ค่าเริ่มต้นทั้งหมด (เปิด) · ไม่แคช เพื่อลองใหม่ครั้งหน้า */ }
  return map;
}

/** ล้างแคชหลังแอดมินเปลี่ยนค่า (เครื่องเดียวกันเห็นทันที · เครื่องอื่นไม่เกิน 30 วิ) */
export const invalidateServiceSettings = () => { cache = null; };

/** เปิดอยู่ไหม — ไม่มีในทะเบียน = เปิด (เทสต์ guard จับ key ที่ไม่ลงทะเบียนอยู่แล้ว) · ปิดไม่ได้ (locked) = เปิดเสมอ */
export async function serviceOn(key: string): Promise<boolean> {
  const svc = paidService(key);
  if (svc?.kind === "locked") return true;
  const s = (await loadServiceSettings()).get(key);
  return s?.enabled !== false;
}

export class ServiceOffError extends Error {
  readonly code = "service_off";
  constructor(public readonly key: string) { super(serviceOffMessage(key)); }
}

export async function logServiceUse(key: string, u: { model?: string | null; tokensIn?: number; tokensOut?: number; costThb?: number | null; ok?: boolean; error?: string | null; userId?: string | null } = {}): Promise<void> {
  try {
    await supabaseAdmin().from("paid_service_usage").insert({
      key, model: u.model ?? null, tokens_in: u.tokensIn ?? null, tokens_out: u.tokensOut ?? null,
      est_cost_thb: u.costThb ?? null, ok: u.ok !== false, error: u.error ? String(u.error).slice(0, 300) : null, user_id: u.userId ?? null,
    });
  } catch { /* บันทึกไม่ได้ = ข้าม */ }
}

/** GPT ตอบ JSON ผ่านด่านกลาง — แทน chatJson เดิม (ผลลัพธ์/ข้อความ error เหมือนเดิม) */
export async function aiChat(key: string, system: string, userContent: unknown[], maxTokens: number, model?: string): Promise<Record<string, unknown>> {
  if (!(await serviceOn(key))) throw new ServiceOffError(key);
  const picked = (await loadServiceSettings()).get(key)?.model || undefined;
  const useModel = picked || model;
  try {
    const r = await openAiChatRaw(system, userContent, maxTokens, useModel);
    await logServiceUse(key, { model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costThb: estimateCostThb(r.model, r.tokensIn, r.tokensOut) });
    return r.data;
  } catch (e) {
    await logServiceUse(key, { model: useModel ?? null, ok: false, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Cloudflare AI ผ่านด่านกลาง — ปิดอยู่/ยังไม่ตั้งค่า = null · ทุกครั้งที่เรียก = บันทึกการใช้ (ฟรีตามโควตา → ค่าใช้จ่าย 0) */
export async function getAiFor(key: string): Promise<AiRunner | null> {
  if (!(await serviceOn(key))) return null;
  const ai = await getAi();
  if (!ai) return null;
  return {
    run: async (model, inputs) => {
      try {
        const out = await ai.run(model, inputs);
        await logServiceUse(key, { model, costThb: 0 });
        return out;
      } catch (e) {
        await logServiceUse(key, { model, ok: false, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
    },
  };
}
