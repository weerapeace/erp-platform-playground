/**
 * POST /api/purchasing/create-pr
 * สร้างใบขอซื้อ (PR v2) จากตะกร้าช้อปปิ้ง — ครบในครั้งเดียว (แทนการยิงทีละใบจากหน้าจอ)
 *
 * body: { items: Item[], order_date?, actor? }   // 1 item = 1 ใบขอซื้อ (status 'waiting')
 *
 * ดีกว่าเดิม: เช็คสิทธิ์ pr.create + ออกเลขกลาง (กันซ้ำ) + insert รวดเดียว (ไม่ได้ใบครึ่ง ๆ) + บันทึก audit
 * เขียนผ่าน service role (supabaseAdmin)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAuditMany } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";
import { bracketCode, skuIdsByBracketCode } from "@/lib/pr-line-code";
import { buildPartnerMatcher, type PartnerLike } from "@/lib/partner-match";
import { shopDefaultCurrency, type ShopCurrencyInfo } from "@/lib/po-currency";
import { loadLineConfig, linePush, lineText } from "@/lib/line-send";
import { dropDisabledBells } from "@/lib/bell-switch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Item = {
  sku_id?: string | null; item_name?: string; qty?: number; uom?: string | null;
  seller_name?: string | null; price_est?: number; currency?: string | null;
  image_key?: string | null; note?: string | null;
  reason?: string | null;          // เหตุผลที่ขอซื้อ (ข้อความ — เลือกจาก lookup หรือ "ใบสั่งผลิต MO-xxx")
  used_for_sku_id?: string | null; used_for_label?: string | null;
  is_urgent?: boolean; needed_date?: string | null;
  source_mo_no?: string | null;   // เลขใบสั่งผลิตต้นทาง (ตัวหลัก — ถ้ามาจาก MO)
  source_mo_nos?: string[] | null; // ใบสั่งผลิตต้นทางทั้งหมด (m2m — 1 ของ ใช้ได้หลายใบสั่งผลิต)
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { items?: unknown; order_date?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const items = Array.isArray(body.items) ? (body.items as Item[]) : [];
  if (items.length === 0) return NextResponse.json({ error: "ไม่มีรายการในตะกร้า" }, { status: 400 });
  if (items.length > 200) return NextResponse.json({ error: "เกิน 200 รายการต่อครั้ง" }, { status: 400 });

  const admin = supabaseAdmin();

  // ---- ตรวจสิทธิ์ pr.create (admin override + role_permissions) ----
  const { data: prof } = await admin.from("user_profiles").select("role, active").eq("id", user.id).maybeSingle();
  const role = prof?.active ? (prof.role as string | null) : null;
  let allowed = role === "admin";
  if (!allowed && role) {
    const { data: perm } = await admin.from("erp_role_permissions").select("permission_key")
      .eq("role_key", role).eq("permission_key", "pr.create").maybeSingle();
    allowed = !!perm;
  }
  if (!allowed) return NextResponse.json({ error: "คุณไม่มีสิทธิ์สร้างใบขอซื้อ (pr.create)" }, { status: 403 });

  const actor = body.actor ?? user.email ?? "system";
  const orderDate = typeof body.order_date === "string" && body.order_date ? body.order_date : new Date().toISOString().slice(0, 10);

  // ---- ติดรหัส SKU ให้รายการที่ส่งมาแค่ "[รหัส] ชื่อ" (แท็บใบสั่งผลิต / บอร์ด "ซื้อของ") ----
  // ไม่มี sku_id → PO line ไม่มี item_sku_id → รับของแล้วไม่เข้าสต็อก + ไม่ได้ร้าน/ราคาหลักด้านล่าง
  // ชื่อยังคง "[รหัส] ชื่อ" เหมือนเดิม (lib/pr-line-code จับคู่กับ MO จากรหัสในชื่อก่อน)
  const codeIds = await skuIdsByBracketCode(admin, items.filter((it) => !it.sku_id).map((it) => it.item_name));
  for (const it of items) {
    const c = it.sku_id ? null : bracketCode(it.item_name);
    if (c && codeIds.has(c)) it.sku_id = codeIds.get(c)!;
  }

  // ---- เติม "ร้าน + ราคา" จากร้านหลัก ★ ของ SKU ให้อัตโนมัติ (ของกลาง: ตารางร้านที่จำหน่าย) ----
  // ใบที่มาจาก BOM/ใบสั่งผลิตมักไม่ได้ส่งร้าน/ราคามาด้วย → ดึงจาก SKU ให้เลย จะได้ไม่ต้องมาตั้งร้านทีหลัง
  const needFill = items.filter((it) => it.sku_id && (!it.seller_name || !(num(it.price_est) > 0)));
  const fillMap = new Map<string, { seller: string | null; price: number | null; currency: string | null }>();
  if (needFill.length) {
    const skuIds = [...new Set(needFill.map((it) => String(it.sku_id)))];
    for (let i = 0; i < skuIds.length; i += 300) {
      const { data: sis } = await admin.from("supplier_items")
        .select("item_sku_id, price, currency, is_default, partner:supplier_partner_id(display_name, name_th)")
        .in("item_sku_id", skuIds.slice(i, i + 300)).eq("is_active", true)
        .order("is_default", { ascending: false })            // ร้านหลัก ★ มาก่อน
        .order("price", { ascending: true, nullsFirst: false });
      for (const r of (sis ?? []) as Record<string, unknown>[]) {
        const k = String(r.item_sku_id);
        if (fillMap.has(k)) continue;                          // เอาแถวแรก = ร้านหลัก (ไม่มีก็ราคาถูกสุด)
        const p = r.partner as { display_name?: string; name_th?: string } | null;
        fillMap.set(k, {
          seller: p?.display_name || p?.name_th || null,
          price: r.price == null ? null : Number(r.price),
          currency: r.currency ? String(r.currency) : null,   // ว่าง = ไปใช้สกุลตั้งต้นของร้าน (currencyOf)
        });
      }
    }
  }

  // ---- สกุลตั้งต้นตามร้าน (lib/po-currency) — ใช้เมื่อผู้เรียกไม่ได้ส่งสกุลมา และไม่มีราคาร้านใน SKU ให้ดึง ----
  // เดิมตกเป็น "THB" ทุกกรณี → ร้านจีนได้ใบบาท (เจ้าของเจอ 2026-11-05) · ร้านจีน = หยวน, ร้านอื่น = ตามสกุลที่ตั้งไว้
  const sellerOf = (it: typeof items[number]) => it.seller_name || (it.sku_id ? fillMap.get(String(it.sku_id))?.seller ?? null : null);
  const needShopCur = items.some((it) => !it.currency && sellerOf(it) && !(it.sku_id && !(num(it.price_est) > 0) && fillMap.get(String(it.sku_id))?.currency));
  let shopCurOf: (name: string | null) => string | null = () => null;
  if (needShopCur) {
    const { data: ps } = await admin.from("partners_v2").select("id, display_name, name_th, name_en, is_supplier, is_active, shop_country, default_currency, is_taobao");
    const matcher = buildPartnerMatcher((ps ?? []) as unknown as (PartnerLike & NonNullable<ShopCurrencyInfo>)[]);
    shopCurOf = (name) => (name ? shopDefaultCurrency(matcher.match(name) ?? null) : null);
  }
  const currencyOf = (it: typeof items[number]): string => {
    if (it.currency) return it.currency;
    const fill = it.sku_id && !(num(it.price_est) > 0) ? fillMap.get(String(it.sku_id)) : undefined;
    if (fill?.currency) return fill.currency;                 // ราคามาจากราคาร้านใน SKU → ใช้สกุลของราคานั้น
    return shopCurOf(sellerOf(it)) ?? "THB";
  };

  // ---- ออกเลขกลางทีละใบ (atomic) แล้ว insert รวดเดียว ----
  const rows: Record<string, unknown>[] = [];
  for (const it of items) {
    const { data: prNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "pr" });
    if (numErr || !prNo) return NextResponse.json({ error: "ออกเลขใบขอซื้อไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });
    // ผูกใบสั่งผลิตหลายใบ (m2m): normalize เป็น array + ตัวหลัก = ตัวแรก (ให้โค้ดเดิมที่อ่าน source_mo_no ทำงานต่อ)
    const moNos = ((Array.isArray(it.source_mo_nos) && it.source_mo_nos.length ? it.source_mo_nos : (it.source_mo_no ? [it.source_mo_no] : [])).filter(Boolean)) as string[];
    const moPrimary = moNos[0] ?? null;
    rows.push({
      pr_no: prNo, requester: actor, status: "waiting", order_date: orderDate,
      item_sku_id: it.sku_id ?? null, item_name: it.item_name ?? null,
      qty: num(it.qty), uom: it.uom ?? null,
      // ร้าน/ราคา: ใช้ที่ส่งมาก่อน · ไม่มี → ดึงจากร้านหลัก ★ ของ SKU
      seller_name: it.seller_name || (it.sku_id ? fillMap.get(String(it.sku_id))?.seller ?? null : null),
      price_est: num(it.price_est) > 0 ? num(it.price_est) : (it.sku_id ? (fillMap.get(String(it.sku_id))?.price ?? 0) : 0),
      currency: currencyOf(it),
      image_key: it.image_key ?? null, note: it.note ?? null,
      reason: it.reason ?? null,
      used_for_sku_id: it.used_for_sku_id ?? null, used_for_label: it.used_for_label ?? null,
      is_urgent: it.is_urgent === true, needed_date: it.needed_date || null,
      source_mo_no: moPrimary,
      source_mo_nos: moNos.length ? moNos : null,
    });
  }

  const { data: inserted, error: insErr } = await admin
    .from("purchase_requests_v2").insert(rows).select("id, pr_no, item_name");
  if (insErr) return NextResponse.json({ error: "สร้างใบขอซื้อไม่สำเร็จ: " + insErr.message }, { status: 500 });

  // ---- audit: 1 แถวต่อ 1 ใบ ----
  await writeAuditMany(admin, (inserted ?? []).map((r) => ({
    action: "create", entityType: "purchase_requests_v2", entityId: r.id as string,
    actorId: user.id, actorName: actor, metadata: { pr_no: r.pr_no, item_name: r.item_name },
  })));

  // ---- แจ้งเตือนเมื่อมีคนขอซื้อ: ① ในแอป (ผู้มีสิทธิ์อนุมัติ) ② LINE (กลุ่มขอซื้อ) ----
  // ห่อ try/catch — แจ้งเตือนพลาดต้องไม่ทำให้สร้างใบขอซื้อล้มเหลว
  try {
    const created = inserted ?? [];
    const n = created.length;
    const first = String(created[0]?.item_name ?? "สินค้า");
    const summary = n <= 1 ? first : `${first} +${n - 1} รายการ`;
    const urgent = items.some((i) => i.is_urgent === true);
    // จำนวนรวม + ยอดรวม (แยกตามสกุลเงิน เผื่อมีทั้งบาท/หยวน) + รายการพร้อมจำนวน
    const totalQty = items.reduce((s, i) => s + num(i.qty), 0);
    const byCur: Record<string, number> = {};
    for (const i of items) { const c = String(i.currency || "THB").toUpperCase().replace("YUAN", "RMB"); byCur[c] = (byCur[c] ?? 0) + num(i.qty) * num(i.price_est); }
    const fmtCur = (v: number, c: string) => c === "THB" ? `฿${Math.round(v).toLocaleString("th-TH")}` : `${Math.round(v).toLocaleString("th-TH")} ${c}`;
    const totalStr = Object.entries(byCur).filter(([, v]) => v > 0).map(([c, v]) => fmtCur(v, c)).join(" + ") || "—";
    // เหตุผลของแต่ละรายการ — ถ้าเป็นใบสั่งผลิต ดึงรหัส SKU ของ MO มาโชว์ด้วย
    const moNos = [...new Set(items.flatMap((i) => (i.source_mo_nos?.length ? i.source_mo_nos : (i.source_mo_no ? [i.source_mo_no] : []))).filter(Boolean))] as string[];
    const skuByMo = new Map<string, string>();
    if (moNos.length) {
      const { data: moRows } = await admin.from("manufacturing_orders").select("mo_no, product_sku").in("mo_no", moNos);
      for (const m of moRows ?? []) if (m.product_sku) skuByMo.set(String(m.mo_no), String(m.product_sku));
    }
    const reasonOf = (i: Item): string => {
      const nos = (i.source_mo_nos?.length ? i.source_mo_nos : (i.source_mo_no ? [i.source_mo_no] : [])).filter(Boolean) as string[];
      if (nos.length) return `🏭 ใบสั่งผลิต ${nos.map((no) => { const sku = skuByMo.get(String(no)); return `${no}${sku ? ` (${sku})` : ""}`; }).join(", ")}`;
      if (i.reason) return `📋 ${i.reason}`;
      return "";
    };
    const itemLines = items.slice(0, 8).map((i) => {
      const head = `• ${String(i.item_name ?? "สินค้า")} ×${num(i.qty).toLocaleString()}${i.uom ? ` ${i.uom}` : ""}`;
      const r = reasonOf(i);
      return r ? `${head}\n   ↳ ${r}` : head;
    });
    if (items.length > 8) itemLines.push(`• …อีก ${items.length - 8} รายการ`);
    const title = `🛒 ใบขอซื้อใหม่ ${n} ใบ`;
    // ในแอป (กระดิ่ง): สรุป + เหตุผลกระชับ 1 บรรทัด/รายการ (ใบสั่งผลิตโชว์ SKU เหมือน LINE)
    const appItemLines = items.slice(0, 6).map((i) => {
      const r = reasonOf(i);
      return `• ${String(i.item_name ?? "สินค้า")} ×${num(i.qty).toLocaleString()}${i.uom ? ` ${i.uom}` : ""}${r ? ` — ${r}` : ""}`;
    });
    if (items.length > 6) appItemLines.push(`• …อีก ${items.length - 6} รายการ`);
    const bodyText = `${actor} · ${totalQty.toLocaleString()} ชิ้น · ${totalStr}\n${appItemLines.join("\n")}`;

    // ① ในแอป → user ที่มีสิทธิ์ pr.approve (+ admin) · ไม่เตือนตัวคนขอเอง
    const { data: roleRows } = await admin.from("erp_role_permissions").select("role_key").eq("permission_key", "pr.approve");
    const roleKeys = [...new Set([...(roleRows ?? []).map((r) => String(r.role_key)), "admin"])];
    const { data: approvers } = await admin.from("user_profiles").select("id").eq("active", true).in("role", roleKeys);
    const notifRows = (approvers ?? [])
      .filter((a) => a.id && a.id !== user.id)
      .map((a) => ({
        user_id: a.id as string, event_type: "pr_created", title, body: bodyText,
        link_url: "/purchasing/orders", entity_type: "purchase_requests_v2",
        entity_id: (created[0]?.id as string) ?? null, priority: urgent ? "high" : "normal",
      }));
    const bellRows = await dropDisabledBells(admin, notifRows);   // ปิดจากแผนผัง (สวิตช์กระดิ่ง) → ไม่ส่ง
    if (bellRows.length) await admin.from("erp_notifications").insert(bellRows);

    // ② LINE → กลุ่ม "ขอซื้อ" (groups.purchase_request → fallback กลุ่มหลัก) · ใช้บอท/โทเคนเดิม
    const cfg = await loadLineConfig(admin);
    const target = cfg.groups?.purchase_request || "";   // เฉพาะกลุ่มขอซื้อที่ตั้งไว้ (ไม่ fallback กลุ่มอื่น)
    const evOn = cfg.disabled_events?.pr_created !== true;   // ปิดจากศูนย์ LINE → ไม่ส่ง
    if (cfg.token && target && evOn) {
      const msg = `🛒 ใบขอซื้อใหม่ ${n} ใบ\nผู้ขอ: ${actor}\n${itemLines.join("\n")}\nจำนวนรวม: ${totalQty.toLocaleString()} ชิ้น\nยอดรวม: ${totalStr}${urgent ? "\n⚡ มีรายการด่วน" : ""}\n→ เปิดแอปจัดซื้อเพื่ออนุมัติ`;
      await linePush(cfg, { to: target, slot: "purchase_request", messages: [lineText(msg)] });
    }
  } catch (e) { console.warn("[create-pr] notify failed:", e); }

  return NextResponse.json({ ok: true, created: (inserted ?? []).length, pr_nos: (inserted ?? []).map((r) => r.pr_no), error: null });
}
