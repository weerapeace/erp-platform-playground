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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Item = {
  sku_id?: string | null; item_name?: string; qty?: number; uom?: string | null;
  seller_name?: string | null; price_est?: number; currency?: string | null;
  image_key?: string | null; note?: string | null;
  used_for_sku_id?: string | null; used_for_label?: string | null;
  is_urgent?: boolean; needed_date?: string | null;
  source_mo_no?: string | null;   // เลขใบสั่งผลิตต้นทาง (ถ้ามาจาก MO)
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

  // ---- ออกเลขกลางทีละใบ (atomic) แล้ว insert รวดเดียว ----
  const rows: Record<string, unknown>[] = [];
  for (const it of items) {
    const { data: prNo, error: numErr } = await admin.rpc("erp_next_number", { p_key: "pr" });
    if (numErr || !prNo) return NextResponse.json({ error: "ออกเลขใบขอซื้อไม่สำเร็จ: " + (numErr?.message ?? "") }, { status: 500 });
    rows.push({
      pr_no: prNo, requester: actor, status: "waiting", order_date: orderDate,
      item_sku_id: it.sku_id ?? null, item_name: it.item_name ?? null,
      qty: num(it.qty), uom: it.uom ?? null,
      seller_name: it.seller_name ?? null, price_est: num(it.price_est), currency: it.currency ?? "THB",
      image_key: it.image_key ?? null, note: it.note ?? null,
      used_for_sku_id: it.used_for_sku_id ?? null, used_for_label: it.used_for_label ?? null,
      is_urgent: it.is_urgent === true, needed_date: it.needed_date || null,
      source_mo_no: it.source_mo_no ?? null,
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
    const itemLines = items.slice(0, 8).map((i) => `• ${String(i.item_name ?? "สินค้า")} ×${num(i.qty).toLocaleString()}${i.uom ? ` ${i.uom}` : ""}`);
    if (items.length > 8) itemLines.push(`• …อีก ${items.length - 8} รายการ`);
    const title = `🛒 ใบขอซื้อใหม่ ${n} ใบ`;
    const bodyText = `${actor} · ${totalQty.toLocaleString()} ชิ้น · ${totalStr} — ${summary}`;

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
    if (notifRows.length) await admin.from("erp_notifications").insert(notifRows);

    // ② LINE → กลุ่ม "ขอซื้อ" (groups.purchase_request → fallback กลุ่มหลัก) · ใช้บอท/โทเคนเดิม
    const { data: lc } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
    const cfg = (lc?.sval ?? {}) as { token?: string; group_id?: string; groups?: Record<string, string> };
    const target = cfg.groups?.purchase_request || "";   // เฉพาะกลุ่มขอซื้อที่ตั้งไว้ (ไม่ fallback กลุ่มอื่น)
    if (cfg.token && target) {
      const lineText = `🛒 ใบขอซื้อใหม่ ${n} ใบ\nผู้ขอ: ${actor}\n${itemLines.join("\n")}\nจำนวนรวม: ${totalQty.toLocaleString()} ชิ้น\nยอดรวม: ${totalStr}${urgent ? "\n⚡ มีรายการด่วน" : ""}\n→ เปิดแอปจัดซื้อเพื่ออนุมัติ`;
      await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify({ to: target, messages: [{ type: "text", text: lineText.slice(0, 4900) }] }),
      });
    }
  } catch (e) { console.warn("[create-pr] notify failed:", e); }

  return NextResponse.json({ ok: true, created: (inserted ?? []).length, pr_nos: (inserted ?? []).map((r) => r.pr_no), error: null });
}
