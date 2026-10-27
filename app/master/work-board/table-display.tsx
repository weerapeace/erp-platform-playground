"use client";

/**
 * หน้าตาตารางบอร์ดจ่ายงาน (มุมมอง ▦ ตาราง) — ชุดหน้าตา + แผงตั้งค่าละเอียด 6 หมวด
 * --------------------------------------------------------------------------
 * ชุดกลาง (แอดมินแก้): ปกติ / โหมดง่าย → ui_config key "admin_wb_table_presets" (เซิร์ฟเวอร์บังคับสิทธิ์ admin.users + audit)
 * ของแต่ละคน: ชุดที่เลือก + "กำหนดเอง" → useUserPref("wb_table_display") จำต่อคน ตามไปทุกเครื่อง
 * ค่าที่เก็บเป็นแบบ "บางส่วน" แล้วเติมด้วยค่าตั้งต้นในโค้ดเสมอ → เพิ่มตัวเลือกใหม่ทีหลัง ชุดเดิมไม่พัง
 * คนทั่วไปปรับอะไรตอนอยู่ชุดกลาง = กลายเป็น "กำหนดเอง" ของตัวเอง (ชุดกลางไม่เปลี่ยน)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useUserPref } from "@/lib/use-user-pref";
import { useToast } from "@/components/toast";
import { QV_DEFAULT_NORMAL, QV_DEFAULT_SIMPLE, parseViews, type QuickView } from "./quick-views";

export type DisplayCfg = {
  scale: number;                       // ขนาดทั้งหน้า % (ตัวหนังสือ ปุ่ม รูป ขยายพร้อมกัน)
  row: "s" | "m" | "l";                // ความสูงแถว
  img: "0" | "s" | "m" | "l";          // รูปในตาราง (0 = ไม่โชว์)
  show: { search: boolean; dev: boolean; tabs: boolean; cards: boolean; chips: boolean; colBtn: boolean; tools: boolean; foot: boolean };
  tabs: { pend: boolean; wip: boolean; qc: boolean };
  cards: Record<string, boolean>;      // ช่องในแถบสรุป (ไม่มี key = โชว์)
  chips: Record<string, boolean>;      // ปุ่มกรองด่วน (ไม่มี key = โชว์)
  cols: string[] | null;               // คอลัมน์แท็บรอจ่าย ตามลำดับ · null = ใช้ ▥ คอลัมน์ของแต่ละคน
  check: boolean;                      // ช่องติ๊กเลือกหลายใบ
  expand: boolean;                     // แตะแถวกางดูของที่ขาด (ปิด = แตะแถวเปิดเช็กลิสต์)
  zebra: boolean;                      // แถวสลับสี
  edit: boolean;                       // แก้ในตารางได้ (ดับเบิลคลิกวัน/ค่าแรง)
  stage: "dots" | "words" | "pill";    // ช่องขั้นตอน
  buy: "bar" | "words";                // ช่องซื้อของ
  due: "date" | "days" | "both";       // ช่องกำหนดส่ง
  sortDef: "none" | "urgent" | "old" | "value";   // ลำดับตอนเปิด (ใช้เมื่อมุมมองด่วนไม่ได้ตั้งเรียง)
  views: QuickView[];                  // มุมมองด่วนของแท็บรอจ่าย (ปุ่มบนแถบ) — กติกาที่ ./quick-views
};

export const DISPLAY_NORMAL: DisplayCfg = {
  scale: 100, row: "m", img: "s",
  show: { search: true, dev: true, tabs: true, cards: true, chips: true, colBtn: true, tools: true, foot: true },
  tabs: { pend: true, wip: true, qc: true },
  cards: {}, chips: {}, cols: null,
  check: true, expand: true, zebra: true, edit: true,
  stage: "dots", buy: "bar", due: "both", sortDef: "none",
  views: QV_DEFAULT_NORMAL,
};
export const DISPLAY_SIMPLE: DisplayCfg = {
  scale: 130, row: "l", img: "l",
  // chips = แถบมุมมองด่วน (โหมดง่ายใช้เป็นหลัก — การ์ดใหญ่/ของด่วน/งาน OEM)
  show: { search: true, dev: false, tabs: true, cards: true, chips: true, colBtn: false, tools: false, foot: false },
  tabs: { pend: true, wip: true, qc: true },
  cards: { "pend.noprice": false }, chips: {}, cols: ["img", "prod", "qty", "stage", "due", "value"],
  check: false, expand: true, zebra: true, edit: false,
  stage: "words", buy: "words", due: "days", sortDef: "urgent",
  views: QV_DEFAULT_SIMPLE,
};

export type PresetKey = "normal" | "simple" | "custom";
type Shared = { normal?: Partial<DisplayCfg>; simple?: Partial<DisplayCfg> };
type Mine = { preset: PresetKey; custom: Partial<DisplayCfg> | null };
const SHARED_KEY = "admin_wb_table_presets";
const PRESET_LABEL: Record<PresetKey, string> = { normal: "ปกติ", simple: "โหมดง่าย", custom: "กำหนดเอง" };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const boolMap = (v: unknown) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "boolean")) as Record<string, boolean> : {});
/** เติมค่าที่ขาดด้วย base (ใช้ทั้งชุดกลางและกำหนดเอง) */
export function mergeCfg(base: DisplayCfg, p?: Partial<DisplayCfg> | null): DisplayCfg {
  if (!p) return base;
  return {
    ...base, ...p,
    show: { ...base.show, ...(isObj(p.show) ? p.show : {}) },
    tabs: { ...base.tabs, ...(isObj(p.tabs) ? p.tabs : {}) },
    cards: { ...base.cards, ...boolMap(p.cards) },
    chips: { ...base.chips, ...boolMap(p.chips) },
    cols: Array.isArray(p.cols) ? p.cols.filter((x): x is string => typeof x === "string") : p.cols === null ? null : base.cols,
    scale: typeof p.scale === "number" ? Math.min(170, Math.max(80, p.scale)) : base.scale,
    views: parseViews(p.views) ?? base.views,
  };
}
const parseMine = (v: unknown): Mine | null => {
  if (!isObj(v)) return null;
  const preset = v.preset === "simple" || v.preset === "custom" ? v.preset : "normal";
  return { preset, custom: isObj(v.custom) ? (v.custom as Partial<DisplayCfg>) : null };
};
const MINE_DEFAULT: Mine = { preset: "normal", custom: null };

export type TableDisplay = {
  cfg: DisplayCfg;
  preset: PresetKey;
  setPreset: (p: PresetKey) => void;
  /** ปรับค่า — แอดมินที่กำลัง "แก้ชุดกลาง" = แก้ร่างของชุดกลาง · คนอื่น/ไม่ได้แก้ชุดกลาง = ไปเป็น "กำหนดเอง" */
  set: (patch: Partial<DisplayCfg>) => void;
  /** แอดมิน: กำลังแก้ชุดกลางชุดไหนอยู่ (null = ไม่ได้แก้) */
  editingShared: "normal" | "simple" | null;
  startEditShared: () => void;
  cancelEditShared: () => void;
  saveShared: () => Promise<void>;
  resetSharedToFactory: () => void;
  savingShared: boolean;
};

export function useTableDisplay(isAdmin: boolean): TableDisplay {
  const toast = useToast();
  const [shared, setShared] = useState<Shared>({});
  useEffect(() => {
    let cancel = false;
    apiFetch(`/api/ui-config?key=${SHARED_KEY}`).then((r) => r.json())
      .then((j) => { if (!cancel && isObj(j?.value)) setShared(j.value as Shared); })
      .catch(() => { /* ใช้ค่าตั้งต้นในโค้ด */ });
    return () => { cancel = true; };
  }, []);
  const [mine, setMine] = useUserPref<Mine>("wb_table_display", MINE_DEFAULT, parseMine);
  const [draft, setDraft] = useState<{ key: "normal" | "simple"; cfg: DisplayCfg } | null>(null);
  const [savingShared, setSavingShared] = useState(false);

  const sharedCfg = useCallback((k: "normal" | "simple") => (k === "simple" ? mergeCfg(DISPLAY_SIMPLE, shared.simple) : mergeCfg(DISPLAY_NORMAL, shared.normal)), [shared]);
  const cfg = useMemo(() => {
    if (draft && draft.key === mine.preset) return draft.cfg;
    if (mine.preset === "custom") return mergeCfg(DISPLAY_NORMAL, mine.custom);
    return sharedCfg(mine.preset);
  }, [draft, mine, sharedCfg]);

  const setPreset = useCallback((p: PresetKey) => {
    setDraft(null);
    // ยังไม่เคยมี "กำหนดเอง" → เริ่มจากหน้าตาที่ใช้อยู่ตอนนี้
    setMine({ preset: p, custom: p === "custom" && !mine.custom ? cfg : mine.custom });
  }, [mine, cfg, setMine]);

  const set = useCallback((patch: Partial<DisplayCfg>) => {
    if (draft) { setDraft({ key: draft.key, cfg: { ...draft.cfg, ...patch } }); return; }
    const wasShared = mine.preset !== "custom";
    setMine({ preset: "custom", custom: { ...cfg, ...patch } });
    if (wasShared) toast.info(`ปรับแล้ว — ตอนนี้เป็นชุด "กำหนดเอง" ของคุณ (ชุด${PRESET_LABEL[mine.preset]}กลางไม่เปลี่ยน)`);
  }, [draft, mine, cfg, setMine, toast]);

  const startEditShared = useCallback(() => {
    if (!isAdmin) return;
    const k = mine.preset === "simple" ? "simple" : "normal";
    if (mine.preset === "custom") setMine({ preset: k, custom: mine.custom });
    setDraft({ key: k, cfg: sharedCfg(k) });
  }, [isAdmin, mine, sharedCfg, setMine]);
  const cancelEditShared = useCallback(() => setDraft(null), []);
  const resetSharedToFactory = useCallback(() => {
    if (draft) setDraft({ key: draft.key, cfg: draft.key === "simple" ? DISPLAY_SIMPLE : DISPLAY_NORMAL });
  }, [draft]);
  const saveShared = useCallback(async () => {
    if (!draft || !isAdmin) return;
    setSavingShared(true);
    try {
      const next: Shared = { ...shared, [draft.key]: draft.cfg };
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: SHARED_KEY, value: next }) });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      setShared(next); setDraft(null);
      toast.success(`บันทึกชุด "${PRESET_LABEL[draft.key]}" กลางแล้ว — ทุกคนที่ใช้ชุดนี้เห็นแบบใหม่`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSavingShared(false); }
  }, [draft, isAdmin, shared, toast]);

  return { cfg, preset: mine.preset, setPreset, set, editingShared: draft?.key ?? null, startEditShared, cancelEditShared, saveShared, resetSharedToFactory, savingShared };
}
