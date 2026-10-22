/**
 * 👀 ป้ายคนดู / 🔥 ขายแล้ว (แท็บดีไซน์ ชุด 5 · theme.page.proof) — นับจากข้อมูลจริงฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * คนดูวันนี้ = store_web_stats metric "item_viewer" ของวันนี้ (เวลาไทย) — เว็บร้านนับ 1 เครื่องต่อรุ่นต่อวัน (src/lib/site-stats.ts)
 * ขายแล้ว    = ออเดอร์บนเว็บ (store_orders ไม่รวมยกเลิก) · soldSource "all" = + ใบสั่งขาย ERP ที่ไม่ใช่ร่าง/ยกเลิก
 * ส่งออกเว็บเฉพาะเมื่อร้านเปิดป้ายนั้นในธีมที่เผยแพร่ และตัวเลข ≥ ขั้นต่ำ — ตัวเลขยอดขายจริงไม่หลุดออกไปเมื่อยังไม่เปิด
 */
import type { ProofLook } from "@/lib/website-site-design";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export interface ProofCounts {
  viewers?: number;
  sold?: number;
}

const DAY = 864e5;
/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ตรงกับ store_web_stat_bump */
export const thaiToday = (now = Date.now()) => new Date(now + 7 * 3600e3).toISOString().slice(0, 10);

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** รหัสรุ่น (ตัวใหญ่) → ตัวเลขที่ผ่านขั้นต่ำแล้ว · parentCodeById = id Parent SKU → รหัสรุ่น (ใช้แปลงใบสั่งขาย ERP) */
export async function loadProofCounts(sb: Admin, shopId: string, proof: ProofLook, parentCodeById: Map<string, string>): Promise<Map<string, ProofCounts>> {
  const out = new Map<string, ProofCounts>();
  if (!proof.viewers && !proof.sold) return out;
  const put = (code: string, k: keyof ProofCounts, n: number) => out.set(code, { ...out.get(code), [k]: n });

  if (proof.viewers) {
    const { data } = await sb.from("store_web_stats").select("dim, n").eq("shop_id", shopId).eq("metric", "item_viewer").eq("day", thaiToday());
    for (const r of (data ?? []) as { dim: string; n: number }[]) if (r.n >= proof.viewersMin) put(r.dim.toUpperCase(), "viewers", r.n);
  }

  if (proof.sold) {
    const since = proof.soldPeriod === "30d" ? new Date(Date.now() - 30 * DAY).toISOString() : null;
    const qty = new Map<string, number>();
    const add = (code: string, n: number) => code && n > 0 && qty.set(code, (qty.get(code) ?? 0) + n);

    // ออเดอร์บนเว็บของร้านนี้
    let oq = sb.from("store_orders").select("id").eq("shop_id", shopId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(5000);
    if (since) oq = oq.gte("created_at", since);
    const { data: orders } = await oq;
    for (const ids of chunks(((orders ?? []) as { id: string }[]).map((o) => o.id), 300)) {
      const { data: items } = await sb.from("store_order_items").select("parent_code, qty").in("order_id", ids);
      for (const it of (items ?? []) as { parent_code: string | null; qty: number | string | null }[]) add((it.parent_code ?? "").toUpperCase(), Number(it.qty) || 0);
    }

    // + ใบสั่งขาย ERP (ไม่ใช่ร่าง/ยกเลิก) → SKU ลูก → Parent SKU → รหัสรุ่น
    if (proof.soldSource === "all" && parentCodeById.size) {
      let sq = sb.from("erp_playground_sales_orders").select("id").not("status", "in", "(draft,cancelled)").order("order_date", { ascending: false }).limit(5000);
      if (since) sq = sq.gte("order_date", since.slice(0, 10));
      const { data: sos } = await sq;
      const lines: { product_id: string | null; qty: number | string | null }[] = [];
      for (const ids of chunks(((sos ?? []) as { id: string }[]).map((o) => o.id), 300)) {
        const { data } = await sb.from("erp_playground_so_lines").select("product_id, qty").in("so_id", ids);
        lines.push(...((data ?? []) as typeof lines));
      }
      const skuIds = [...new Set(lines.map((l) => l.product_id).filter((x): x is string => !!x))];
      const parentOfSku = new Map<string, string>();
      for (const ids of chunks(skuIds, 300)) {
        const { data } = await sb.from("skus_v2").select("id, parent_sku_id").in("id", ids);
        for (const k of (data ?? []) as { id: string; parent_sku_id: string | null }[]) if (k.parent_sku_id) parentOfSku.set(k.id, k.parent_sku_id);
      }
      for (const l of lines) {
        const pid = l.product_id ? parentOfSku.get(l.product_id) : undefined;
        const code = pid ? parentCodeById.get(pid) : undefined;
        if (code) add(code.toUpperCase(), Number(l.qty) || 0);
      }
    }

    for (const [code, n] of qty) {
      const whole = Math.floor(n);
      if (whole >= proof.soldMin) put(code, "sold", whole);
    }
  }
  return out;
}
