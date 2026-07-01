"use client";

// ============================================================
// Player Store — ระบบแต้ม/เหรียญ/เลเวล ของแอปเป้าหมาย (เฟส 1 mock)
// เก็บใน localStorage ให้เหรียญค้างไว้ (รู้สึกจริง) — เฟส 2 ย้ายเป็น service กลาง + ตารางจริง
// ใช้ผ่าน usePlayer() / awardCoins() / redeem()
// ============================================================

import { useEffect } from "react";
import { useSyncExternalStore } from "react";

export type PlayerState = {
  coins: number;   // เหรียญที่ใช้แลกได้ (ยอดคงเหลือ)
  xp: number;      // แต้มสะสมถาวร (ใช้คิดเลเวล — ไม่ลดตอนแลกของ)
  streakDays: number;
  redeemed: { rewardId: string; label: string; cost: number; at: string }[];
  earnLog: { id: string; reason: string; coins: number; at: string }[];
};

export type Reward = { id: string; label: string; icon: string; cost: number; desc: string };

const KEY = "goals-player-v1";
const TODAY = "2026-07-01";

// เริ่มต้นแบบมีของอยู่แล้ว (ให้หน้าดูมีชีวิต)
const DEFAULT: PlayerState = {
  coins: 128,
  xp: 240,
  streakDays: 5,
  redeemed: [],
  earnLog: [
    { id: "seed-3", reason: "ทำขั้นบันได “เพิ่มสินค้า” คืบหน้า", coins: 5, at: "2026-06-30" },
    { id: "seed-2", reason: "check-in ประจำสัปดาห์", coins: 3, at: "2026-06-28" },
    { id: "seed-1", reason: "วิดพื้นครบ 40 ครั้ง (ทุก 20 = 1)", coins: 2, at: "2026-06-27" },
  ],
};

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

// ---- ร้านแลกรางวัล (mock — เฟส 2 แอดมินตั้งเองได้) ----
export const REWARDS: Reward[] = [
  { id: "r-coffee", label: "กาแฟ/ชานม ฟรี 1 แก้ว", icon: "☕", cost: 50, desc: "แลกเครื่องดื่มโปรดหนึ่งแก้ว" },
  { id: "r-leave-early", label: "เลิกงานเร็ว 1 ชั่วโมง", icon: "⏰", cost: 120, desc: "ใช้ได้ 1 ครั้ง แจ้งหัวหน้าล่วงหน้า" },
  { id: "r-lunch-pick", label: "เลือกร้านอาหารกลางวันให้ทีม", icon: "🍽️", cost: 180, desc: "วันศุกร์นี้คุณเป็นคนเลือก" },
  { id: "r-surprise", label: "กล่องสุ่มของขวัญ", icon: "🎁", cost: 300, desc: "ลุ้นของรางวัลเซอร์ไพรส์" },
];

// ---- กระดานทีม (เพื่อนร่วมทีม mock — ตัวเราเสียบจากยอดจริง) ----
export const TEAMMATES = [
  { name: "สมชาย", coins: 210, xp: 410 },
  { name: "พลอย", coins: 95, xp: 180 },
  { name: "นภา", coins: 156, xp: 300 },
  { name: "อาร์ม", coins: 64, xp: 130 },
];

// ---- store (pub/sub + localStorage) ----
let state: PlayerState = DEFAULT;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }

function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function getState() { return state; }

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { state = { ...DEFAULT, ...JSON.parse(raw) }; emit(); }
  } catch { /* ignore */ }
}

export function awardCoins(coins: number, reason: string) {
  if (coins <= 0) return;
  state = {
    ...state,
    coins: state.coins + coins,
    xp: state.xp + coins,
    earnLog: [{ id: `e-${Date.now()}-${Math.round(Math.random() * 1e6)}`, reason, coins, at: TODAY }, ...state.earnLog].slice(0, 50),
  };
  save(); emit();
}

export function redeem(r: Reward): boolean {
  if (state.coins < r.cost) return false;
  state = {
    ...state,
    coins: state.coins - r.cost,
    redeemed: [{ rewardId: r.id, label: r.label, cost: r.cost, at: TODAY }, ...state.redeemed],
  };
  save(); emit();
  return true;
}

export function usePlayer(): PlayerState {
  const s = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => { ensureHydrated(); }, []);
  return s;
}
