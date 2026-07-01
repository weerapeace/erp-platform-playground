"use client";

// ============================================================
// Player Store (เฟส 2b) — ต่อ DB จริงผ่าน /api/goals/player
// เหรียญ/XP/streak เก็บถาวรในฐานข้อมูล ข้ามเครื่องได้
// ใช้ผ่าน usePlayer() / awardCoins() / redeem() / refreshPlayer()
// ============================================================
import { useEffect } from "react";
import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";

export type PlayerState = {
  coins: number;
  xp: number;
  streakDays: number;
  redeemed: { label: string; cost: number; at: string }[];
  earnLog: { id: string; reason: string; coins: number; at: string }[];
  goalsAchieved: number;
};

const EMPTY: PlayerState = { coins: 0, xp: 0, streakDays: 0, redeemed: [], earnLog: [], goalsAchieved: 0 };

// ---- เลเวลจาก XP ----
const LEVEL_STARTS = [0, 50, 120, 220, 350, 520, 750, 1050];
const LEVEL_TITLES = ["มือใหม่", "นักลุย", "นักมุ่งมั่น", "นักสู้เป้าหมาย", "มือโปร", "เซียนเป้าหมาย", "ตำนาน", "ปรมาจารย์"];

export function levelFromXp(xp: number) {
  let idx = 0;
  for (let i = 0; i < LEVEL_STARTS.length; i++) if (xp >= LEVEL_STARTS[i]) idx = i;
  const curBase = LEVEL_STARTS[idx];
  const nextBase = LEVEL_STARTS[idx + 1] ?? curBase + 300;
  return {
    level: idx + 1,
    title: LEVEL_TITLES[Math.min(idx, LEVEL_TITLES.length - 1)],
    into: xp - curBase,
    span: nextBase - curBase,
    toNext: Math.max(0, nextBase - xp),
    isMax: idx >= LEVEL_STARTS.length - 1,
  };
}

// ---- store (pub/sub + API) ----
let state: PlayerState = EMPTY;
let loaded = false;
let loading = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getState() { return state; }
function setState(next: PlayerState) { state = next; emit(); }

function normalize(d: Record<string, unknown>): PlayerState {
  return {
    coins: Number(d.coins) || 0,
    xp: Number(d.xp) || 0,
    streakDays: Number(d.streakDays) || 0,
    redeemed: Array.isArray(d.redeemed) ? (d.redeemed as PlayerState["redeemed"]) : [],
    earnLog: Array.isArray(d.earnLog) ? (d.earnLog as PlayerState["earnLog"]) : [],
    goalsAchieved: Number(d.goalsAchieved) || 0,
  };
}

async function fetchPlayer() {
  try {
    const res = await apiFetch("/api/goals/player");
    const j = await res.json();
    if (res.ok && j?.data) setState(normalize(j.data));
  } catch { /* ignore */ }
}

function ensureLoaded() {
  if (loaded || loading || typeof window === "undefined") return;
  loaded = true; loading = true;
  fetchPlayer().finally(() => { loading = false; });
}

export function refreshPlayer() { void fetchPlayer(); }

/** ให้เหรียญ (optimistic + บันทึกลง DB) — เรียกได้แบบ fire-and-forget เหมือนเดิม */
export function awardCoins(coins: number, reason: string) {
  const c = Math.max(0, Math.round(coins || 0));
  if (c <= 0) return;
  setState({ ...state, coins: state.coins + c, xp: state.xp + c }); // optimistic
  apiFetch("/api/goals/player/award", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coins: c, reason }) })
    .then((res) => res.json())
    .then((j) => { if (j?.data) setState(normalize(j.data)); })
    .catch(() => {});
}

/** แลกรางวัล — คืน true ถ้าสำเร็จ (เหรียญพอ) */
export async function redeem(rewardId: string): Promise<boolean> {
  try {
    const res = await apiFetch("/api/goals/rewards/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rewardId }) });
    const j = await res.json();
    if (j?.data) setState(normalize(j.data));
    return res.ok;
  } catch {
    return false;
  }
}

export function usePlayer(): PlayerState {
  const st = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => { ensureLoaded(); }, []);
  return st;
}
