/**
 * ขั้นหลัง Facebook อนุญาต "Meta Ads" (เรียกจาก /api/meta/oauth/callback เมื่อ state ขึ้นต้น "ads:")
 * แลก code → token ผู้ใช้ระยะยาว (~60 วัน) → รายชื่อบัญชีโฆษณา → เก็บ marketing_ads_accounts (token เข้ารหัส)
 * บัญชีที่ใช้งานอยู่ (account_status = 1) เปิดดึงให้เลย · ปิด/เปิดทีหลังได้ในแท็บโฆษณา
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { encryptSecret } from "@/lib/secret-box";
import { writeAudit } from "@/lib/audit";
import { metaExchangeCode, metaLongLivedToken } from "@/lib/meta-graph";
import { metaAdAccounts } from "@/lib/meta-ads";

export async function finishMetaAdsConnect(code: string, redirectUri: string, brandId: string): Promise<{ ok: true; accounts: number } | { ok: false; error: string }> {
  try {
    const longTok = await metaLongLivedToken(await metaExchangeCode(code, redirectUri));
    const accounts = await metaAdAccounts(longTok);
    if (!accounts.length) return { ok: false, error: "บัญชี Facebook นี้ไม่มีบัญชีโฆษณาที่เข้าถึงได้ — ใช้บัญชีที่เป็นผู้ดูแลบัญชีโฆษณา" };
    const admin = supabaseAdmin();
    const token_enc = await encryptSecret(longTok);
    const expires = new Date(Date.now() + 59 * 86_400_000).toISOString();
    const now = new Date().toISOString();
    const { data: existing } = await admin.from("marketing_ads_accounts").select("account_id, is_active").eq("platform", "meta").in("account_id", accounts.map((a) => a.id));
    const prev = new Map(((existing ?? []) as { account_id: string; is_active: boolean }[]).map((r) => [r.account_id, r.is_active]));
    const { error } = await admin.from("marketing_ads_accounts").upsert(accounts.map((a) => ({
      platform: "meta", brand_id: brandId, account_id: a.id, account_name: a.name, token_enc, token_expires_at: expires,
      is_active: prev.has(a.id) ? prev.get(a.id) : a.status === 1, meta: { currency: a.currency, status: a.status }, last_error: null, updated_at: now,
    })), { onConflict: "platform,account_id" });
    if (error) return { ok: false, error: "บันทึกบัญชีโฆษณาไม่สำเร็จ" };
    await writeAudit(admin, { action: "update", entityType: "marketing_ads_account", entityId: null, actorId: null, actorName: "meta_ads_oauth", metadata: { brand_id: brandId, platform: "meta", accounts: accounts.map((a) => a.name) } });
    return { ok: true, accounts: accounts.length };
  } catch (e) {
    return { ok: false, error: `เชื่อม Meta Ads ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}` };
  }
}
