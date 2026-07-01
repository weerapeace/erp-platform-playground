// ============================================================
// ระบบเกมของโมดูลเป้าหมาย (เฟส 2b) — server only (supabaseAdmin)
// แต้ม/เหรียญ/XP/streak/รางวัล/การแลก/กระดานทีม ลง DB จริง
// ============================================================
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (v == null ? 0 : Number(v));

const bangkokDate = (ts: string) => new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
const todayBangkok = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/** streak = จำนวนวันต่อเนื่อง (นับถึงวันนี้/เมื่อวาน) ที่มีการได้เหรียญ */
function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  const dayMs = 86400000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const todayT = new Date(todayBangkok() + "T00:00:00Z").getTime();
  let cursor: number;
  if (set.has(iso(todayT))) cursor = todayT;
  else if (set.has(iso(todayT - dayMs))) cursor = todayT - dayMs;
  else return 0;
  let streak = 0;
  while (set.has(iso(cursor))) { streak++; cursor -= dayMs; }
  return streak;
}

export async function getPlayer(userId: string, userName: string) {
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("erp_goal_players").select("coins, xp, user_name").eq("user_id", userId).maybeSingle();
  const { data: ledger } = await admin.from("erp_goal_coin_ledger").select("coins, reason, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200);
  const led = (ledger ?? []) as Row[];
  const earnLog = led.slice(0, 30).map((r, i) => ({ id: `${s(r.created_at)}-${i}`, coins: num(r.coins), reason: s(r.reason), at: bangkokDate(s(r.created_at)) }));
  const streakDays = computeStreak(led.map((r) => bangkokDate(s(r.created_at))));
  const { data: reds } = await admin.from("erp_goal_redemptions").select("label, cost, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  const redeemed = ((reds ?? []) as Row[]).map((r) => ({ label: s(r.label), cost: num(r.cost), at: bangkokDate(s(r.created_at)) }));
  const { count } = await admin.from("erp_goals").select("id", { count: "exact", head: true }).eq("owner_id", userId).eq("status", "achieved");
  return {
    coins: p ? num((p as Row).coins) : 0,
    xp: p ? num((p as Row).xp) : 0,
    streakDays,
    earnLog,
    redeemed,
    goalsAchieved: count ?? 0,
    userName: (p && s((p as Row).user_name)) || userName,
  };
}

export async function awardCoins(userId: string, userName: string, coins: number, reason: string) {
  const admin = supabaseAdmin();
  const c = Math.max(0, Math.round(Number(coins) || 0));
  if (c <= 0) return getPlayer(userId, userName);
  const { data: existing } = await admin.from("erp_goal_players").select("coins, xp").eq("user_id", userId).maybeSingle();
  const curCoins = existing ? num((existing as Row).coins) : 0;
  const curXp = existing ? num((existing as Row).xp) : 0;
  await admin.from("erp_goal_players").upsert(
    { user_id: userId, user_name: userName, coins: curCoins + c, xp: curXp + c, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  await admin.from("erp_goal_coin_ledger").insert({ user_id: userId, coins: c, reason });
  return getPlayer(userId, userName);
}

export async function listRewards() {
  const admin = supabaseAdmin();
  const { data } = await admin.from("erp_goal_rewards").select("id, label, icon, cost, description").eq("is_active", true).order("sort_order", { ascending: true });
  return ((data ?? []) as Row[]).map((r) => ({ id: s(r.id), label: s(r.label), icon: s(r.icon), cost: num(r.cost), desc: s(r.description) }));
}

export async function redeem(userId: string, userName: string, rewardId: string) {
  const admin = supabaseAdmin();
  const { data: reward } = await admin.from("erp_goal_rewards").select("id, label, cost").eq("id", rewardId).eq("is_active", true).maybeSingle();
  if (!reward) throw new Error("ไม่พบรางวัล");
  const cost = num((reward as Row).cost);
  const { data: player } = await admin.from("erp_goal_players").select("coins").eq("user_id", userId).maybeSingle();
  const coins = player ? num((player as Row).coins) : 0;
  if (coins < cost) return { ok: false, player: await getPlayer(userId, userName) };
  await admin.from("erp_goal_players").update({ coins: coins - cost, updated_at: new Date().toISOString() }).eq("user_id", userId);
  await admin.from("erp_goal_redemptions").insert({ user_id: userId, reward_id: rewardId, label: s((reward as Row).label), cost });
  await writeAudit(admin, { action: "reward_redeem", entityType: "goal_rewards", entityId: rewardId, actorId: userId, actorName: userName, metadata: { label: s((reward as Row).label), cost } });
  return { ok: true, player: await getPlayer(userId, userName) };
}

export async function leaderboard(meUserId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin.from("erp_goal_players").select("user_id, user_name, coins, xp").order("coins", { ascending: false }).limit(20);
  return ((data ?? []) as Row[]).map((r) => ({ user_name: s(r.user_name) || "ผู้ใช้", coins: num(r.coins), xp: num(r.xp), is_me: s(r.user_id) === meUserId }));
}
