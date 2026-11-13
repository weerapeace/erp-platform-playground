/**
 * คลังแพ็กเกจ (ฝั่งเซิร์ฟเวอร์) — ให้ AI ค้นเว็บหาแพ็กเกจ/ราคา/เว็บทางการของแอป แล้วบันทึกเข้าคลัง
 *
 * เรียก AI ผ่านด่านกลาง aiWebSearch("ai.subscription_lookup") → เปิด-ปิด / งบ / โมเดล ตั้งที่ /admin/paid-services
 * ผลบันทึกเข้า subscription_app_catalog (source = ai) — ครั้งต่อไปพิมพ์ชื่อเดิมใช้คลังฟรี ไม่ต้องค้นซ้ำ
 * มีแอปนี้ในคลังแล้ว → เพิ่มเฉพาะแพ็กเกจที่ยังไม่มี (ไม่ทับราคาที่คนตั้งเอง) · ช่องว่างค่อยเติม (เว็บ/หมวด/โลโก้)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiWebSearch, type UseCtx } from "@/lib/paid-services-server";
import { logoCandidates } from "@/lib/app-logo";
import { catalogKey, mergePlans, parseLookupResult, toCatalogApp, type CatalogApp, type LookupResult } from "@/lib/subscription-catalog";

const SYSTEM = [
  "You research software subscription plans and prices for a company in Thailand. Always use web search.",
  "Find the product's official website and its current PAID plans (skip free plans).",
  "Prefer official prices for Thailand in THB when the vendor shows them (localized pricing page or app store); otherwise use the official USD (or EUR) price.",
  "List monthly and yearly options as separate plans, e.g. \"Pro (monthly)\" and \"Pro (yearly)\". At most 8 plans.",
  "Reply with ONLY one JSON object, no other text:",
  "{\"found\":true,\"name\":\"official product name\",\"category\":\"one short English word such as Design, Productivity, Storage, Video, Marketing, Finance, Communication\",",
  "\"site\":\"official domain like capcut.com\",\"plans\":[{\"name\":\"Pro (monthly)\",\"cost\":9.99,\"currency\":\"USD\",\"billing_cycle\":\"monthly\"}],",
  "\"note\":\"one short sentence in Thai about where the prices came from or caveats\"}",
  "currency must be THB, USD or EUR. billing_cycle must be monthly, yearly or one-time. If you are not confident the product exists or cannot find paid plans, return {\"found\":false,\"name\":\"...\",\"note\":\"...\"}.",
].join("\n");

export type LookupOutcome = {
  app: CatalogApp | null;          // แถวในคลังหลังบันทึก (ไม่เจอ = null)
  result: LookupResult;
  citations: { url: string; title: string }[];
  merged: boolean;                 // มีแอปนี้ในคลังอยู่แล้ว (เพิ่มเฉพาะแพ็กเกจใหม่)
};

/** ค้นแพ็กเกจของแอปจากเว็บ → บันทึก/รวมเข้าคลัง · error ของด่านกลาง (ปิดอยู่/เกินงบ) โยนต่อให้ API แปลงเป็นข้อความ */
export async function lookupAppPlans(name: string, categories: string[], ctx: UseCtx): Promise<LookupOutcome> {
  const hint = categories.length ? `\nExisting categories in our system (reuse one if it fits): ${categories.slice(0, 20).join(", ")}` : "";
  const { text, citations } = await aiWebSearch("ai.subscription_lookup", SYSTEM, `Product name typed by the user: "${name}"${hint}`, 1200, "gpt-4.1-mini", ctx);
  const result = parseLookupResult(text, name);
  if (!result.found) return { app: null, result, citations, merged: false };

  const db = supabaseAdmin();
  const { data: rows } = await db.from("subscription_app_catalog").select("*");
  const all = ((rows ?? []) as Record<string, unknown>[]).map(toCatalogApp);
  // จับคู่ทั้งชื่อทางการที่ AI ให้ และชื่อที่ผู้ใช้พิมพ์
  const existing = all.find((a) => catalogKey(a.name) === catalogKey(result.name)) ?? all.find((a) => catalogKey(a.name) === catalogKey(name)) ?? null;
  const logo = result.site ? logoCandidates(result.site)[0]?.url ?? "" : "";
  const now = new Date().toISOString();

  if (existing) {
    const patch = {
      plans: mergePlans(existing.plans, result.plans),
      site: existing.site || result.site,
      category: existing.category || result.category,
      logo_url: existing.logo_url || logo,
      source_urls: citations,
      looked_up_at: now,
      updated_at: now,
    };
    const { data, error } = await db.from("subscription_app_catalog").update(patch).eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "บันทึกเข้าคลังไม่สำเร็จ");
    return { app: toCatalogApp(data as Record<string, unknown>), result, citations, merged: true };
  }

  const row = {
    name: result.name, category: result.category, site: result.site, logo_url: logo,
    plans: result.plans, source: "ai", source_urls: citations, looked_up_at: now,
  };
  const { data, error } = await db.from("subscription_app_catalog").insert(row).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "บันทึกเข้าคลังไม่สำเร็จ");
  return { app: toCatalogApp(data as Record<string, unknown>), result, citations, merged: false };
}
