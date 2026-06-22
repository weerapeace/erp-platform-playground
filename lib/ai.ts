/**
 * ของกลาง — ตัวเรียก Cloudflare Workers AI (รวมที่เดียว ใช้ได้ทั้งบน Cloudflare และนอก Cloudflare)
 *
 * - บน Cloudflare: ใช้ binding AI (เร็ว มีโควตาฟรีรายวัน) เหมือนเดิม
 * - นอก Cloudflare (เช่น Vercel): เรียก Workers AI ผ่าน REST API ด้วย API token
 *     ตั้ง env 2 ตัว: CF_ACCOUNT_ID, CF_AI_API_TOKEN
 *     (สร้าง API Token ใน Cloudflare dashboard → สิทธิ์ "Workers AI: Read/Run")
 *   → ใช้ "โมเดลตัวเดียวกัน" → ผล OCR/แปล เหมือนเดิม
 *
 * คืน object ที่มีเมธอด .run(model, inputs) หน้าตาเหมือน binding เดิม
 * → โค้ดที่เรียก (ocr-slip, ocr-slip-extract, ai/translate) ใช้ได้โดยแทบไม่ต้องแก้
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AiRunner = { run: (model: string, inputs: Record<string, unknown>) => Promise<any> };

export async function getAi(): Promise<AiRunner | null> {
  // 1) Cloudflare binding (เมื่อรันบน Cloudflare)
  try {
    const wk: any = await import(/* webpackIgnore: true */ ("cloudflare:workers" as string));
    if (wk?.env?.AI) return wk.env.AI as AiRunner;
  } catch { /* ไม่ใช่ runtime CF */ }
  try {
    const mod: any = await import(/* webpackIgnore: true */ ("@opennextjs/cloudflare" as string));
    const ctx = mod.getCloudflareContext ? mod.getCloudflareContext() : null;
    if (ctx?.env?.AI) return ctx.env.AI as AiRunner;
  } catch { /* noop */ }

  // 2) REST fallback (นอก Cloudflare เช่น Vercel) — เรียก Workers AI REST ด้วย API token
  const acct  = (process.env.CF_ACCOUNT_ID ?? "").trim();
  const token = (process.env.CF_AI_API_TOKEN ?? "").trim();
  if (acct && token) {
    return {
      run: async (model: string, inputs: Record<string, unknown>) => {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(inputs),
        });
        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          const msg = json?.errors?.[0]?.message ?? `AI REST ${res.status}`;
          throw new Error(String(msg));
        }
        return json.result;   // binding.run() คืน result ตรงๆ → ให้เหมือนกัน (out.response ใช้ได้)
      },
    };
  }

  return null;
}
