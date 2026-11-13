"use client";
/**
 * หน่วยน้ำหนักที่ผู้ใช้เลือกล่าสุด (กิโลกรัม / กรัม) — จำในเครื่อง · ใช้ร่วม: ลิ้นชักสินค้า TikTok + หน้าลงฉบับร่าง TikTok
 * ค่าที่เก็บ/ส่งยังเป็นกิโลกรัมเสมอ — แปลงด้วย kgToUnit / unitToKg (lib/tiktok-attrs)
 */
import { useEffect, useState } from "react";
import type { WeightUnit } from "@/lib/tiktok-attrs";

const KEY = "tts-weight-unit";

export function useWeightUnit(): [WeightUnit, (u: WeightUnit) => void] {
  const [unit, setUnitState] = useState<WeightUnit>("kg");
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v === "g" || v === "kg") setUnitState(v); } catch { /* ไม่มี localStorage */ } }, []);
  return [unit, (u) => { setUnitState(u); try { localStorage.setItem(KEY, u); } catch { /* ไม่มี localStorage */ } }];
}
