/**
 * /api/subscriptions — รายการ subscription (ใช้ตาราง subscriptions ร่วมกับแอปเดิม)
 *
 * GET  → { data: Subscription[], settings } (subscriptions.view)
 * POST → สร้างรายการใหม่ (subscriptions.edit)
 *
 * ⚠️ id เป็น text (ไม่มี default) → generate เอง · ข้อความ NOT NULL → toSubRow บังคับ '' แล้ว
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { toSubRow, validateSubInput, type SubInput, type SubSettings } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_SETTINGS: SubSettings = { exchange_rate: 32, eur_rate: 39, display_currency: "THB" };

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function GET(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.view");
  if (guard) return guard;

  const db = supabaseAdmin();
  const [{ data: rows, error }, { data: st }] = await Promise.all([
    db.from("subscriptions").select("*").order("name"),
    db.from("app_settings").select("exchange_rate, eur_rate, display_currency").eq("id", 1).single(),
  ]);
  if (error) return NextResponse.json({ data: [], settings: DEFAULT_SETTINGS, error: error.message }, { status: 500 });

  const settings: SubSettings = st
    ? {
        exchange_rate: Number(st.exchange_rate) || DEFAULT_SETTINGS.exchange_rate,
        eur_rate: Number(st.eur_rate) || DEFAULT_SETTINGS.eur_rate,
        display_currency: (st.display_currency as SubSettings["display_currency"]) || "THB",
      }
    : DEFAULT_SETTINGS;

  return NextResponse.json({ data: rows ?? [], settings, error: null });
}

export async function POST(request: NextRequest) {
  const guard = await guardApi(request, "subscriptions.edit");
  if (guard) return guard;

  let body: Partial<SubInput> & { actor?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const err = validateSubInput(body, true);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const { data: auth } = await supabaseFromRequest(request).auth.getUser();

  const row = {
    id: genId(),
    // ค่าเริ่มต้นให้ครบทุก NOT NULL แม้ฟอร์มไม่ส่งมา
    category: "Other", billing_cycle: "monthly", cost: 0, currency: "THB",
    active: true, type: "personal", pending_cancel: false, want_to_buy: false,
    chrome_profile: "", chrome_profile_url: "", invoice_url: "", notes: "",
    account_email: "", card_last4: "",
    ...toSubRow(body),
  };

  const db = supabaseAdmin();
  const { data, error } = await db.from("subscriptions").insert(row).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });

  await writeAudit(db, {
    action: "create", entityType: "subscriptions", entityId: null,
    actorId: auth?.user?.id ?? null, actorName: body.actor ?? null,
    metadata: { sub_id: data.id, name: data.name, cost: data.cost, currency: data.currency },
  });
  return NextResponse.json({ data, error: null });
}
