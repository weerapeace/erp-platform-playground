"use client";

/**
 * useListPrintSettings — ค่าตั้งหน้าพิมพ์แบบรายการ (lib/list-print) ของกลาง
 *   • ค่าที่ใช้อยู่ จำ "ต่อคน ต่อใบ" (user_ui_prefs "print_settings:<reportKey>") ตามไปทุกเครื่อง — แก้แล้วจำเองไม่ต้องกดบันทึก
 *   • แบบของฉัน (user_ui_prefs "print_presets:<family>") · แบบของทีม (ui_config admin_print_presets · แอดมินบันทึก/ลบ)
 * ใช้คู่กับ components/report/list-print-panel (ListPrintPanel)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import {
  PRINT_TEAM_PRESETS_KEY, cleanListPrintSettings,
  type ListPrintColumn, type ListPrintPreset, type ListPrintSettings,
} from "@/lib/list-print";

const parsePresets = (available: ListPrintColumn[], base: ListPrintSettings) => (raw: unknown): ListPrintPreset[] | null => {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 30).flatMap((p) => {
    const o = (p ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? ""), name = String(o.name ?? "").trim().slice(0, 40);
    if (!/^[a-z0-9-]{1,40}$/.test(id) || !name) return [];
    return [{ id, name, settings: cleanListPrintSettings(o.settings, available, base) }];
  });
};
const newPresetId = () => `p-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export interface ListPrintSettingsState {
  settings: ListPrintSettings;
  setSettings: (next: ListPrintSettings) => void;
  reset: () => void;
  myPresets: ListPrintPreset[];
  teamPresets: ListPrintPreset[];
  saveMyPreset: (name: string) => void;
  deleteMyPreset: (id: string) => void;
  saveTeamPreset: (name: string) => Promise<string | null>;
  deleteTeamPreset: (id: string) => Promise<string | null>;
}

export function useListPrintSettings({ reportKey, family, available, defaults }: {
  /** ใบไหน เช่น "work-board:pending" — จำค่าแยกกันต่อใบ */
  reportKey: string;
  /** กลุ่มรายงานที่ใช้แบบร่วมกัน เช่น "work-board" */
  family: string;
  available: ListPrintColumn[];
  defaults: ListPrintSettings;
}): ListPrintSettingsState {
  const parse = useCallback((raw: unknown) => (raw && typeof raw === "object" ? cleanListPrintSettings(raw, available, defaults) : null), [available, defaults]);
  const [saved, setSaved] = useUserPref<ListPrintSettings>(`print_settings:${reportKey}`, defaults, parse);
  // ค่าที่กำลังแก้ (ลากแถบขนาดตัวอักษรรัว ๆ) → โชว์ทันที แล้วค่อยจำลงเซิร์ฟเวอร์ทีเดียวเมื่อหยุดแก้
  const [live, setLive] = useState<ListPrintSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setLive(null); }, [reportKey]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const setSettings = useCallback((next: ListPrintSettings) => {
    setLive(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(next), 700);
  }, [setSaved]);
  const reset = useCallback(() => setSettings(defaults), [defaults, setSettings]);

  const presetParse = useMemo(() => parsePresets(available, defaults), [available, defaults]);
  const [myPresets, setMyPresets] = useUserPref<ListPrintPreset[]>(`print_presets:${family}`, [], presetParse);

  const [teamAll, setTeamAll] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let on = true;
    apiFetch(`/api/ui-config?key=${PRINT_TEAM_PRESETS_KEY}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { value?: Record<string, unknown> } | null) => { if (on && j?.value && typeof j.value === "object") setTeamAll(j.value); })
      .catch(() => { /* ไม่มีแบบของทีม = ใช้แบบสำเร็จรูป/ของฉัน */ });
    return () => { on = false; };
  }, []);
  const teamPresets = useMemo(() => presetParse(teamAll[family]) ?? [], [teamAll, family, presetParse]);
  const writeTeam = useCallback(async (list: ListPrintPreset[]): Promise<string | null> => {
    const value = { ...teamAll, [family]: list };
    const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: PRINT_TEAM_PRESETS_KEY, value }) }).catch(() => null);
    if (!r) return "เชื่อมต่อไม่ได้";
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return r.status === 403 ? "ต้องเป็นแอดมินถึงจะบันทึกแบบของทีมได้" : j.error ?? "บันทึกไม่สำเร็จ";
    setTeamAll(value);
    return null;
  }, [teamAll, family]);

  const settings = live ?? saved;
  return {
    settings,
    setSettings,
    reset,
    myPresets,
    teamPresets,
    saveMyPreset: (name) => setMyPresets([...myPresets, { id: newPresetId(), name: name.trim().slice(0, 40), settings }]),
    deleteMyPreset: (id) => setMyPresets(myPresets.filter((p) => p.id !== id)),
    saveTeamPreset: (name) => writeTeam([...teamPresets, { id: newPresetId(), name: name.trim().slice(0, 40), settings }]),
    deleteTeamPreset: (id) => writeTeam(teamPresets.filter((p) => p.id !== id)),
  };
}
