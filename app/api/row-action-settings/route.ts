import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Placement = "inline" | "menu" | "hidden";
type RowActionSetting = { placement: Placement; iconKey: string };

const PLACEMENTS = new Set(["inline", "menu", "hidden"]);
const ICONS = new Set(["eye", "printer", "list", "edit", "send", "check", "convert", "x", "ban", "more"]);

async function requireAdmin(request: NextRequest): Promise<string | null> {
  const { data, error } = await supabaseFromRequest(request).rpc("erp_can", { p_permission: "admin.users" });
  if (error) return error.message;
  if (data !== true) return "ไม่มีสิทธิ์ตั้งค่า Row Actions กลาง (admin.users)";
  return null;
}

function normalizeKey(key: string) {
  const raw = key.trim();
  return raw.startsWith("master-") ? raw.slice("master-".length) : raw;
}

async function findModule(key: string) {
  const admin = supabaseAdmin();
  const normalized = normalizeKey(key);
  const candidates = Array.from(new Set([normalized, key.trim()].filter(Boolean)));

  for (const candidate of candidates) {
    const byModule = await admin
      .from("erp_modules")
      .select("id, module_key, table_name, label, config")
      .eq("module_key", candidate)
      .maybeSingle();
    if (byModule.data) return byModule.data;

    const byTable = await admin
      .from("erp_modules")
      .select("id, module_key, table_name, label, config")
      .eq("table_name", candidate)
      .maybeSingle();
    if (byTable.data) return byTable.data;
  }

  return null;
}

function normalizeSettings(value: unknown): Record<string, RowActionSetting> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, RowActionSetting> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!id || !raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const placement = String(item.placement ?? "");
    const iconKey = String(item.iconKey ?? "more");
    if (!PLACEMENTS.has(placement)) continue;
    out[id] = {
      placement: placement as Placement,
      iconKey: ICONS.has(iconKey) ? iconKey : "more",
    };
  }
  return out;
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") ?? request.nextUrl.searchParams.get("table_id") ?? "";
  if (!key.trim()) return NextResponse.json({ settings: {}, error: null });

  const mod = await findModule(key);
  if (!mod) return NextResponse.json({ settings: {}, error: null });

  const config = (mod.config ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    module_key: mod.module_key,
    table_name: mod.table_name,
    settings: normalizeSettings(config.row_actions),
    error: null,
  });
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return NextResponse.json({ error: denied }, { status: 403 });

  let body: { key?: string; settings?: unknown; actor?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const key = String(body.key ?? "").trim();
  if (!key) return NextResponse.json({ error: "missing key" }, { status: 400 });

  const mod = await findModule(key);
  if (!mod) return NextResponse.json({ error: "ไม่พบโมดูล" }, { status: 404 });

  const admin = supabaseAdmin();
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const config = { ...((mod.config ?? {}) as Record<string, unknown>) };
  config.row_actions = normalizeSettings(body.settings);

  const { error } = await admin
    .from("erp_modules")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", mod.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAudit(admin, {
    action: "module.row_actions_update",
    entityType: "erp_modules",
    entityId: mod.id,
    actorId: user?.id ?? null,
    actorName: body.actor ?? user?.email ?? null,
    metadata: { module: mod.module_key, row_actions: config.row_actions },
  });

  return NextResponse.json({ ok: true, settings: config.row_actions, error: null });
}
