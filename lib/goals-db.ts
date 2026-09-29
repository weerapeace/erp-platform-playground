// ============================================================
// ชั้นเข้าถึงข้อมูลกลางของโมดูลเป้าหมาย (Goals) — server only
// ใช้ supabaseAdmin (service role) ตามแบบ lib/payroll-*-db.ts
// route ทุกตัวเรียกผ่านที่นี่ ไม่ query ตรงในหน้า UI
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

type Row = Record<string, unknown>;
type Actor = { id: string; name: string };
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

// ---- mappers: DB row → รูปที่ฝั่ง client ใช้ ----
function mapStep(r: Row) {
  return {
    id: s(r.id),
    title: s(r.title),
    description: (r.description as string) ?? undefined,
    status: s(r.status) || "pending",
    sort_order: Number(r.sort_order ?? 0),
    weight: r.weight == null ? 1 : Number(r.weight),
    assignee: (r.assignee as string) ?? undefined,
    target_date: (r.target_date as string) ?? null,
    progress_percent: r.progress_percent == null ? 0 : Number(r.progress_percent),
  };
}
function mapCheckin(r: Row) {
  return {
    id: s(r.id),
    author: s(r.author),
    checkin_date: s(r.checkin_date),
    progress_percent: n(r.progress_percent),
    current_value: n(r.current_value),
    health: s(r.health) || "on_track",
    note: s(r.note),
  };
}
function mapGoal(r: Row, steps: Row[] = [], checkins: Row[] = []) {
  return {
    id: s(r.id),
    goal_no: s(r.goal_no),
    title: s(r.title),
    why: (r.why as string) ?? undefined,
    description: (r.description as string) ?? undefined,
    category: s(r.category) || "sales",
    level: s(r.level) || "team",
    owner: s(r.owner_name),
    owner_id: (r.owner_id as string) ?? null,
    department: (r.department as string) ?? undefined,
    collaborators: Array.isArray(r.collaborators) ? r.collaborators : [],
    status: s(r.status) || "active",
    health: s(r.health) || "on_track",
    priority: Number(r.priority ?? 0),
    start_date: (r.start_date as string) ?? undefined,
    target_date: (r.target_date as string) ?? undefined,
    achieved_at: (r.achieved_at as string) ?? undefined,
    progress_mode: s(r.progress_mode) || "auto",
    progress_percent: Number(r.progress_percent ?? 0),
    measure_type: s(r.measure_type) || "percent",
    measure_unit: (r.measure_unit as string) ?? undefined,
    start_value: n(r.start_value),
    target_value: n(r.target_value),
    current_value: n(r.current_value),
    reward: (r.reward as Record<string, unknown>) ?? {},
    plan: (r.plan as Record<string, unknown>) ?? {},
    steps: steps.map(mapStep).sort((a, b) => a.sort_order - b.sort_order),
    checkins: checkins.map(mapCheckin),
  };
}

// ---- inputs ----
export type GoalInput = {
  title: string; why?: string; description?: string; category?: string; level?: string;
  department?: string; start_date?: string | null; target_date?: string | null;
  measure_type?: string; measure_unit?: string;
  start_value?: number | null; target_value?: number | null; current_value?: number | null;
  reward?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  steps?: { title: string; target_date?: string | null; weight?: number }[];
};
export type StepInput = { title: string; description?: string; target_date?: string | null; weight?: number };
export type CheckinInput = { step_id?: string | null; progress_percent?: number | null; current_value?: number | null; health?: string; note?: string };

// ---- reads ----
export async function listGoals() {
  const admin = supabaseAdmin();
  const { data: goals, error } = await admin.from("erp_goals").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (goals ?? []) as Row[];
  const ids = rows.map((g) => s(g.id));
  let steps: Row[] = [];
  if (ids.length) {
    const { data } = await admin.from("erp_goal_steps").select("*").in("goal_id", ids);
    steps = (data ?? []) as Row[];
  }
  const byGoal = new Map<string, Row[]>();
  for (const st of steps) { const k = s(st.goal_id); (byGoal.get(k) ?? byGoal.set(k, []).get(k)!).push(st); }
  return rows.map((g) => mapGoal(g, byGoal.get(s(g.id)) ?? [], []));
}

export async function getGoal(id: string) {
  const admin = supabaseAdmin();
  const { data: g } = await admin.from("erp_goals").select("*").eq("id", id).maybeSingle();
  if (!g) return null;
  const { data: steps } = await admin.from("erp_goal_steps").select("*").eq("goal_id", id);
  const { data: checkins } = await admin.from("erp_goal_checkins").select("*").eq("goal_id", id).order("created_at", { ascending: false });
  return mapGoal(g as Row, (steps ?? []) as Row[], (checkins ?? []) as Row[]);
}

// ---- writes ----
export async function createGoal(input: GoalInput, owner: { id: string; name: string }) {
  const admin = supabaseAdmin();
  const year = new Date().getFullYear();
  const { count } = await admin.from("erp_goals").select("id", { count: "exact", head: true });
  const goalNo = `GOAL-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data: g, error } = await admin.from("erp_goals").insert({
    goal_no: goalNo,
    title: input.title,
    why: input.why ?? null,
    description: input.description ?? null,
    category: input.category ?? "sales",
    level: input.level ?? "team",
    owner_id: owner.id,
    owner_name: owner.name,
    department: input.department ?? null,
    status: "active",
    health: "on_track",
    progress_mode: "auto",
    measure_type: input.measure_type ?? "percent",
    measure_unit: input.measure_unit ?? null,
    start_value: input.start_value ?? null,
    target_value: input.target_value ?? null,
    current_value: input.current_value ?? null,
    reward: input.reward ?? {},
    plan: input.plan ?? {},
    start_date: input.start_date ?? null,
    target_date: input.target_date ?? null,
    created_by: owner.id,
  }).select("id").single();
  if (error) throw error;

  const goalId = s((g as Row).id);
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (steps.length) {
    const rows = steps
      .filter((st) => (st.title ?? "").trim() !== "")
      .map((st, i) => ({ goal_id: goalId, title: st.title.trim(), sort_order: i, status: "pending", weight: st.weight ?? 1, target_date: st.target_date || null }));
    if (rows.length) await admin.from("erp_goal_steps").insert(rows);
  }
  await writeAudit(admin, { action: "create", entityType: "goals", entityId: goalId, actorId: owner.id, actorName: owner.name, metadata: { title: input.title, goal_no: goalNo } });
  return getGoal(goalId);
}

const GOAL_FIELDS = ["title", "why", "description", "category", "level", "department", "status", "health", "priority", "start_date", "target_date", "progress_mode", "progress_percent", "measure_type", "measure_unit", "start_value", "target_value", "current_value", "reward", "plan"];

export async function updateGoal(id: string, patch: Record<string, unknown>, actor?: Actor) {
  const admin = supabaseAdmin();
  const upd: Row = { updated_at: new Date().toISOString() };
  for (const k of GOAL_FIELDS) if (k in patch) upd[k] = patch[k];
  if (patch.status === "achieved") { upd.achieved_at = new Date().toISOString(); upd.closed_at = new Date().toISOString(); }
  if (patch.status === "missed" || patch.status === "cancelled") upd.closed_at = new Date().toISOString();
  const { error } = await admin.from("erp_goals").update(upd).eq("id", id);
  if (error) throw error;
  await writeAudit(admin, { action: patch.status ? "status_change" : "update", entityType: "goals", entityId: id, actorId: actor?.id ?? null, actorName: actor?.name ?? null, metadata: { fields: Object.keys(patch), status: patch.status ?? null } });
  return getGoal(id);
}

export async function deleteGoal(id: string, actor?: Actor) {
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_goals").delete().eq("id", id);
  if (error) throw error;
  await writeAudit(admin, { action: "delete", entityType: "goals", entityId: id, actorId: actor?.id ?? null, actorName: actor?.name ?? null });
}

export async function addStep(goalId: string, input: StepInput) {
  const admin = supabaseAdmin();
  const { data: last } = await admin.from("erp_goal_steps").select("sort_order").eq("goal_id", goalId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = last ? Number((last as Row).sort_order ?? 0) + 1 : 0;
  const { error } = await admin.from("erp_goal_steps").insert({
    goal_id: goalId, title: input.title, description: input.description ?? null,
    sort_order: nextOrder, status: "pending", weight: input.weight ?? 1, target_date: input.target_date || null,
  });
  if (error) throw error;
  return getGoal(goalId);
}

const STEP_FIELDS = ["title", "description", "status", "weight", "assignee", "target_date", "progress_percent", "sort_order"];

export async function updateStep(goalId: string, stepId: string, patch: Record<string, unknown>) {
  const admin = supabaseAdmin();
  const upd: Row = { updated_at: new Date().toISOString() };
  for (const k of STEP_FIELDS) if (k in patch) upd[k] = patch[k];
  if (patch.status === "done") upd.done_at = new Date().toISOString();
  else if (patch.status && patch.status !== "done") upd.done_at = null;
  const { error } = await admin.from("erp_goal_steps").update(upd).eq("id", stepId).eq("goal_id", goalId);
  if (error) throw error;
  return getGoal(goalId);
}

export async function deleteStep(goalId: string, stepId: string) {
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_goal_steps").delete().eq("id", stepId).eq("goal_id", goalId);
  if (error) throw error;
  return getGoal(goalId);
}

export async function addCheckin(goalId: string, input: CheckinInput, actor: Actor) {
  const admin = supabaseAdmin();
  const { error } = await admin.from("erp_goal_checkins").insert({
    goal_id: goalId, step_id: input.step_id ?? null, author: actor.name,
    progress_percent: input.progress_percent ?? null, current_value: input.current_value ?? null,
    health: input.health ?? null, note: input.note ?? null,
  });
  if (error) throw error;
  // อัปเดตสุขภาพ + ค่าปัจจุบันของเป้า จาก check-id ล่าสุด
  const goalUpd: Row = { updated_at: new Date().toISOString() };
  if (input.health) goalUpd.health = input.health;
  if (input.current_value != null) goalUpd.current_value = input.current_value;
  await admin.from("erp_goals").update(goalUpd).eq("id", goalId);
  await writeAudit(admin, { action: "checkin", entityType: "goals", entityId: goalId, actorId: actor.id, actorName: actor.name, metadata: { health: input.health ?? null } });
  return getGoal(goalId);
}

// ---- บันทึกออกกำลังกาย (ขั้น 1) ----
export type ExerciseInput = {
  activity_type?: string; title: string; quantity: number; unit?: string;
  duration_min?: number | null; distance_km?: number | null; calories?: number | null;
};

export async function addExerciseLog(goalId: string, input: ExerciseInput, user: { id: string; name: string }) {
  const admin = supabaseAdmin();
  const { data: gRow } = await admin.from("erp_goals").select("id, measure_type, current_value, start_value, health").eq("id", goalId).maybeSingle();
  if (!gRow) throw new Error("ไม่พบเป้าหมาย");
  const g = gRow as Row;
  const qty = Number(input.quantity) || 0;

  await admin.from("erp_exercise_logs").insert({
    goal_id: goalId, user_id: user.id, user_name: user.name,
    activity_type: input.activity_type ?? "custom", title: input.title,
    quantity: qty, unit: input.unit ?? null,
    duration_min: input.duration_min ?? null, distance_km: input.distance_km ?? null, calories: input.calories ?? null,
    source: "manual",
  });

  // บวกเข้าค่าเป้า (เฉพาะเป้าที่วัดเป็นตัวเลข)
  let newVal: number | null = null;
  if (s(g.measure_type) !== "boolean") {
    const base = g.current_value == null ? (g.start_value == null ? 0 : Number(g.start_value)) : Number(g.current_value);
    newVal = base + qty;
    await admin.from("erp_goals").update({ current_value: newVal, updated_at: new Date().toISOString() }).eq("id", goalId);
  }

  // ลง check-in เป็นไทม์ไลน์ให้เห็นประวัติ
  await admin.from("erp_goal_checkins").insert({
    goal_id: goalId, author: user.name, health: s(g.health) || "on_track",
    current_value: newVal, note: `🏃 ${input.title} ${qty}${input.unit ? " " + input.unit : ""}`,
  });
  await writeAudit(admin, { action: "exercise_log", entityType: "goals", entityId: goalId, actorId: user.id, actorName: user.name, metadata: { title: input.title, quantity: qty, unit: input.unit ?? null } });
  return getGoal(goalId);
}

// ---- บันทึกความคืบหน้าเป็นจำนวน (เช่น ฝากเงินเก็บ) — บวกเข้าค่าเป้า + ลง check-in ----
export async function addProgress(goalId: string, amount: number, note: string, user: { id: string; name: string }) {
  const admin = supabaseAdmin();
  const { data: gRow } = await admin.from("erp_goals").select("id, current_value, start_value, health").eq("id", goalId).maybeSingle();
  if (!gRow) throw new Error("ไม่พบเป้าหมาย");
  const gg = gRow as Row;
  const base = gg.current_value == null ? (gg.start_value == null ? 0 : Number(gg.start_value)) : Number(gg.current_value);
  const newVal = base + (Number(amount) || 0);
  await admin.from("erp_goals").update({ current_value: newVal, updated_at: new Date().toISOString() }).eq("id", goalId);
  await admin.from("erp_goal_checkins").insert({
    goal_id: goalId, author: user.name, health: s(gg.health) || "on_track",
    current_value: newVal, note: note || `ฝากเงิน ${(Number(amount) || 0).toLocaleString("th-TH")}`,
  });
  await writeAudit(admin, { action: "deposit", entityType: "goals", entityId: goalId, actorId: user.id, actorName: user.name, metadata: { amount: Number(amount) || 0 } });
  return getGoal(goalId);
}

// ---- แก้ / ยกเลิก รายการอัปเดตความคืบหน้า (check-in · ฝากเงิน · ออกกำลังกาย) ----
// ยอดของเป้าเป็น "ยอดสะสม" → ยกเลิกได้เฉพาะรายการล่าสุด (ย้อนทีละรายการ) ไม่งั้นยอดสะสมของรายการถัดไปจะเพี้ยน
// รายการเก่ากว่านั้นแก้ได้แค่ข้อความ

async function loadCheckinCtx(goalId: string, checkinId: string) {
  const admin = supabaseAdmin();
  const [{ data: gRow }, { data: list }] = await Promise.all([
    admin.from("erp_goals").select("id, title, owner_id, current_value, start_value, health").eq("id", goalId).maybeSingle(),
    admin.from("erp_goal_checkins").select("*").eq("goal_id", goalId).order("created_at", { ascending: false }),
  ]);
  if (!gRow) throw new Error("ไม่พบเป้าหมาย");
  const rows = (list ?? []) as Row[];
  const idx = rows.findIndex((r) => s(r.id) === checkinId);
  if (idx < 0) throw new Error("ไม่พบรายการนี้");
  return { admin, goal: gRow as Row, rows, idx, row: rows[idx] };
}

const canTouchCheckin = (row: Row, goal: Row, actor: Actor) => s(row.author) === actor.name || (!!actor.id && s(goal.owner_id) === actor.id);

/** ✏️ แก้ข้อความ (ทุกรายการ) · แก้สถานะสุขภาพ (เฉพาะรายการล่าสุด — เป้าจะเปลี่ยนตาม) */
export async function updateCheckin(goalId: string, checkinId: string, input: { note?: string; health?: string }, actor: Actor) {
  const { admin, goal, idx, row } = await loadCheckinCtx(goalId, checkinId);
  if (!canTouchCheckin(row, goal, actor)) throw new Error("แก้ได้เฉพาะรายการที่ตัวเองบันทึก (หรือเจ้าของเป้า)");
  const patch: Row = {};
  if (input.note !== undefined) patch.note = String(input.note ?? "").trim() || null;
  if (input.health !== undefined && input.health && input.health !== s(row.health)) {
    if (idx !== 0) throw new Error("แก้สถานะได้เฉพาะรายการล่าสุด");
    patch.health = input.health;
  }
  if (Object.keys(patch).length === 0) return getGoal(goalId);
  const { error } = await admin.from("erp_goal_checkins").update(patch).eq("id", checkinId);
  if (error) throw error;
  if (patch.health) await admin.from("erp_goals").update({ health: patch.health, updated_at: new Date().toISOString() }).eq("id", goalId);
  await writeAudit(admin, { action: "checkin_edit", entityType: "goals", entityId: goalId, actorId: actor.id, actorName: actor.name,
    metadata: { checkin_id: checkinId, old: { note: row.note ?? null, health: row.health ?? null }, new: patch } });
  return getGoal(goalId);
}

/** ↩ ยกเลิกรายการล่าสุด — คืนยอดสะสม/สุขภาพของเป้าเป็นค่าก่อนหน้า + ลบบันทึกออกกำลังกายคู่กัน + หักเหรียญที่ได้จากรายการนี้คืน */
export async function undoLatestCheckin(goalId: string, checkinId: string, actor: Actor) {
  const { admin, goal, rows, idx, row } = await loadCheckinCtx(goalId, checkinId);
  if (idx !== 0) throw new Error("ยกเลิกได้เฉพาะรายการล่าสุด — ยอดของเป้าเป็นยอดสะสม ต้องย้อนทีละรายการจากล่าสุด");
  if (!canTouchCheckin(row, goal, actor)) throw new Error("ยกเลิกได้เฉพาะรายการที่ตัวเองบันทึก (หรือเจ้าของเป้า)");

  // ค่าก่อนหน้า = รายการถัดไปในลิสต์ (เก่ากว่า) ที่มีค่า · ไม่มี = ค่าเริ่มต้นของเป้า
  const prev = rows.slice(1);
  const prevVal = prev.find((r) => r.current_value != null)?.current_value ?? goal.start_value ?? null;
  const prevHealth = prev.find((r) => r.health)?.health ?? null;
  const goalUpd: Row = { updated_at: new Date().toISOString() };
  if (row.current_value != null) goalUpd.current_value = prevVal;
  if (prevHealth) goalUpd.health = prevHealth;

  const at = new Date(s(row.created_at)).getTime();
  const lo = new Date(at - 30_000).toISOString(), hi = new Date(at + 60_000).toISOString();

  // บันทึกออกกำลังกายที่ลงพร้อมกัน
  let exerciseRemoved = 0;
  if (s(row.note).startsWith("🏃")) {
    const { data: ex } = await admin.from("erp_exercise_logs").select("id").eq("goal_id", goalId).gte("created_at", lo).lte("created_at", hi);
    const ids = ((ex ?? []) as Row[]).map((r) => s(r.id));
    if (ids.length) { await admin.from("erp_exercise_logs").delete().in("id", ids); exerciseRemoved = ids.length; }
  }

  // เหรียญที่ได้จากรายการนี้ (แจกหลังบันทึกไม่กี่วินาที) → หักคืน กันปั๊มเหรียญด้วยการบันทึกแล้วยกเลิก
  let coinsBack = 0;
  if (actor.id) {
    const { data: led } = await admin.from("erp_goal_coin_ledger").select("coins, reason, created_at")
      .eq("user_id", actor.id).gt("coins", 0).gte("created_at", lo).lte("created_at", hi).ilike("reason", `%${s(goal.title)}%`);
    coinsBack = ((led ?? []) as Row[]).reduce((t, r) => t + (Number(r.coins) || 0), 0);
    if (coinsBack > 0) {
      const { data: pl } = await admin.from("erp_goal_players").select("coins, xp").eq("user_id", actor.id).maybeSingle();
      if (pl) {
        await admin.from("erp_goal_players").update({
          coins: Math.max(0, (Number((pl as Row).coins) || 0) - coinsBack), xp: Math.max(0, (Number((pl as Row).xp) || 0) - coinsBack), updated_at: new Date().toISOString(),
        }).eq("user_id", actor.id);
        await admin.from("erp_goal_coin_ledger").insert({ user_id: actor.id, coins: -coinsBack, reason: `ยกเลิกรายการ · ${s(goal.title)}` });
      }
    }
  }

  const { error } = await admin.from("erp_goal_checkins").delete().eq("id", checkinId);
  if (error) throw error;
  await admin.from("erp_goals").update(goalUpd).eq("id", goalId);
  await writeAudit(admin, { action: "checkin_undo", entityType: "goals", entityId: goalId, actorId: actor.id, actorName: actor.name,
    metadata: { snapshot: row, restored: goalUpd, exercise_removed: exerciseRemoved, coins_back: coinsBack } });
  return { goal: await getGoal(goalId), coins_back: coinsBack };
}
