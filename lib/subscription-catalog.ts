/**
 * คลังแพ็กเกจของแอป (App Subscription) — ไฟล์ pure ใช้ได้ทั้งหน้าจอ + API + เทสต์
 *
 * ตาราง `subscription_app_catalog`: 1 แถว = 1 แอป (เช่น ChatGPT) + แพ็กเกจหลายตัว (Plus $20/ด., Pro …)
 * - ผูกกับรายการด้วย "ชื่อแอป" ไม่สนตัวพิมพ์เล็ก-ใหญ่ (catalogKey) → ตั้งครั้งเดียว ทุกรายการชื่อเดียวกันใช้ร่วม
 * - รายการเก็บชื่อแพ็กเกจที่เลือกไว้ใน subscriptions.plan_name
 * - เปลี่ยนราคาแพ็กเกจในคลัง ไม่แก้รายการเดิมให้เอง (ฟอร์มขึ้นเตือน "ราคาไม่ตรงแพ็กเกจ" ให้กดเอง)
 * - หาจากเว็บด้วย AI: lib/subscription-catalog-server.ts (ผ่านศูนย์ AI ที่เสียเงิน key "ai.subscription_lookup")
 */
import type { BillingCycle, Currency } from "@/lib/subscriptions";

export type CatalogPlan = {
  id: string;
  name: string;              // เช่น "Plus", "Pro รายปี"
  cost: number;
  currency: Currency;
  billing_cycle: BillingCycle;
};

export type CatalogSource = "manual" | "ai";

export type CatalogApp = {
  id: string;
  name: string;              // ชื่อแอป (ตรงกับชื่อรายการ)
  category: string;
  site: string;              // เว็บทางการ เช่น capcut.com
  logo_url: string;          // URL เต็ม หรือ R2 key (แสดงผ่าน AppLogo)
  plans: CatalogPlan[];
  source: CatalogSource;
  source_urls: { url: string; title: string }[];
  looked_up_at: string | null;
  updated_at?: string;
};

export type CatalogInput = Partial<Pick<CatalogApp, "name" | "category" | "site" | "logo_url" | "plans">>;

const CURRENCIES: Currency[] = ["THB", "USD", "EUR"];
const CYCLES: BillingCycle[] = ["monthly", "yearly", "one-time"];
const MAX_PLANS = 12;

/** คีย์จับคู่ชื่อแอป ↔ ชื่อรายการ */
export function catalogKey(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function newPlanId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** แอปในคลังที่ชื่อตรงกับชื่อรายการ (ไม่มี = null) */
export function findCatalogApp(list: CatalogApp[] | null | undefined, name: string | null | undefined): CatalogApp | null {
  const k = catalogKey(name);
  if (!k || !list) return null;
  return list.find((a) => catalogKey(a.name) === k) ?? null;
}

/** ค้นแอปในคลังตามที่พิมพ์ — ขึ้นต้นด้วยคำค้นมาก่อน แล้วค่อยที่มีคำค้นอยู่กลางชื่อ */
export function searchCatalog(list: CatalogApp[] | null | undefined, q: string, limit = 6): CatalogApp[] {
  const k = catalogKey(q);
  if (!k || !list) return [];
  const starts: CatalogApp[] = [], contains: CatalogApp[] = [];
  for (const a of list) {
    const n = catalogKey(a.name);
    if (n.startsWith(k)) starts.push(a);
    else if (n.includes(k)) contains.push(a);
  }
  const byName = (x: CatalogApp, y: CatalogApp) => x.name.localeCompare(y.name);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit);
}

/** ทำความสะอาดแพ็กเกจจาก DB/ฟอร์ม/AI — ตัดตัวที่ไม่มีชื่อ · สกุลเงิน/รอบบิลแปลก = ตัดทิ้ง · ชื่อซ้ำเก็บตัวแรก */
export function normalizePlans(raw: unknown): CatalogPlan[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CatalogPlan[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const currency = String(o.currency ?? "").toUpperCase() as Currency;
    const billing_cycle = String(o.billing_cycle ?? "") as BillingCycle;
    const cost = Math.round((Number(o.cost) || 0) * 100) / 100;
    if (!name || !CURRENCIES.includes(currency) || !CYCLES.includes(billing_cycle) || cost < 0) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: typeof o.id === "string" && o.id ? o.id : newPlanId(), name, cost, currency, billing_cycle });
    if (out.length >= MAX_PLANS) break;
  }
  return out;
}

/** แพ็กเกจที่ชื่อตรงกับ plan_name ของรายการ */
export function findPlan(app: CatalogApp | null | undefined, planName: string | null | undefined): CatalogPlan | null {
  const k = (planName ?? "").trim().toLowerCase();
  if (!app || !k) return null;
  return app.plans.find((p) => p.name.toLowerCase() === k) ?? null;
}

/** ราคา/สกุลเงิน/รอบบิล ตรงกับแพ็กเกจไหม (ไว้ขึ้นเตือน "ราคาไม่ตรงแพ็กเกจ") */
export function planMatches(plan: CatalogPlan, v: { cost: number; currency: Currency; billing_cycle: BillingCycle }): boolean {
  return Math.abs((Number(v.cost) || 0) - plan.cost) < 0.005 && v.currency === plan.currency && v.billing_cycle === plan.billing_cycle;
}

/** รวมแพ็กเกจใหม่เข้าของเดิม — ชื่อซ้ำคงของเดิมไว้ (ไม่ทับราคาที่คนตั้งเอง) */
export function mergePlans(existing: CatalogPlan[], incoming: CatalogPlan[]): CatalogPlan[] {
  const have = new Set(existing.map((p) => p.name.toLowerCase()));
  return normalizePlans([...existing, ...incoming.filter((p) => !have.has(p.name.toLowerCase()))]);
}

/** แถวจาก DB → CatalogApp (กันค่า null/รูปแบบแปลก) */
export function toCatalogApp(r: Record<string, unknown>): CatalogApp {
  const urls = Array.isArray(r.source_urls) ? r.source_urls : [];
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    category: String(r.category ?? ""),
    site: String(r.site ?? ""),
    logo_url: String(r.logo_url ?? ""),
    plans: normalizePlans(r.plans),
    source: r.source === "ai" ? "ai" : "manual",
    source_urls: urls.filter((u) => u && typeof u === "object" && typeof (u as { url?: unknown }).url === "string")
      .map((u) => ({ url: String((u as { url: string }).url), title: String((u as { title?: unknown }).title ?? "") })).slice(0, 8),
    looked_up_at: typeof r.looked_up_at === "string" ? r.looked_up_at : null,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
  };
}

/** ค่าจากฟอร์ม/คำขอ → แถวสำหรับเขียน DB (เฉพาะช่องที่ส่งมา) */
export function toCatalogRow(input: CatalogInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = String(input.name ?? "").trim().replace(/\s+/g, " ");
  if (input.category !== undefined) row.category = String(input.category ?? "").trim();
  if (input.site !== undefined) row.site = String(input.site ?? "").trim().toLowerCase();
  if (input.logo_url !== undefined) row.logo_url = String(input.logo_url ?? "").trim();
  if (input.plans !== undefined) row.plans = normalizePlans(input.plans);
  return row;
}

export function validateCatalogInput(input: CatalogInput, isCreate: boolean): string | null {
  if (isCreate || input.name !== undefined) {
    if (!String(input.name ?? "").trim()) return "กรุณาใส่ชื่อแอป";
  }
  if (input.plans !== undefined) {
    if (!Array.isArray(input.plans)) return "รายการแพ็กเกจไม่ถูกต้อง";
    if (input.plans.length > MAX_PLANS) return `แพ็กเกจได้สูงสุด ${MAX_PLANS} ตัวต่อแอป`;
    for (const p of input.plans) {
      if (!String(p?.name ?? "").trim()) return "ทุกแพ็กเกจต้องมีชื่อ";
      if (isNaN(Number(p?.cost)) || Number(p?.cost) < 0) return `ราคาแพ็กเกจ "${p.name}" ต้องเป็นตัวเลขไม่ติดลบ`;
      if (!CURRENCIES.includes(p.currency)) return `สกุลเงินของ "${p.name}" ไม่ถูกต้อง`;
      if (!CYCLES.includes(p.billing_cycle)) return `รอบบิลของ "${p.name}" ไม่ถูกต้อง`;
    }
  }
  return null;
}

// ── ผลจาก AI ค้นเว็บ ────────────────────────────────────────

export type LookupResult = {
  found: boolean;
  name: string;
  category: string;
  site: string;
  plans: CatalogPlan[];
  note: string;
};

/** ดึง JSON ก้อนแรกออกจากข้อความที่ AI ตอบ (AI อาจห่อด้วย ```json หรือมีคำอธิบายนำ) */
function firstJsonObject(text: string): Record<string, unknown> | null {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === "\"") inStr = false; continue; }
    if (ch === "\"") inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)) as Record<string, unknown>; } catch { return null; }
    }
  }
  return null;
}

/** แปลงคำตอบของ AI → LookupResult (อ่านไม่ออก / ไม่มีแพ็กเกจเสียเงิน = found false) */
export function parseLookupResult(text: string, fallbackName: string): LookupResult {
  const j = firstJsonObject(text);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!j) return { found: false, name: fallbackName.trim(), category: "", site: "", plans: [], note: "" };
  const plans = normalizePlans(j.plans).filter((p) => p.cost > 0);
  const site = str(j.site).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  return {
    found: j.found !== false && plans.length > 0,
    name: str(j.name) || fallbackName.trim(),
    category: str(j.category),
    site: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) ? site : "",
    plans,
    note: str(j.note).slice(0, 300),
  };
}
