"use client";

/**
 * IconField — ของกลาง: ช่องเลือกไอคอน (ไอคอนเส้นกลาง) แบบดรอปดาวน์ติดช่อง — ใช้ทุกที่ที่ให้ผู้ใช้ตั้งไอคอน
 *   กดช่อง → กล่องเล็กเด้งใต้ช่อง (มือถือ = แผ่นเลื่อนขึ้นจากล่าง):
 *     ค้นหา (ไทย/อังกฤษ) · แนะนำจากชื่อ (suggestFrom) · ใช้ล่าสุด · ยอดนิยม · เลือกสีเส้น · ดูทั้งหมด (ป๊อปใหญ่ IconPickerModal แบ่งหมวด)
 *   ค่าเก่าที่เป็นอีโมจิ = โชว์ได้ + ป้าย "อีโมจิเดิม" + ปุ่มเปลี่ยนเป็นไอคอนที่ใกล้เคียง (ไม่แปลงเอง)
 *   เปลี่ยนแล้วมีแจ้งผลมุมจอ "ย้อนกลับ" (เรียก onChange ด้วยค่าเดิม)
 *
 * ค่าที่เก็บ: "i:<key>" หรือ "i:<key>#rrggbb" (มีสี) · "c:<id>" ไอคอนของฉัน · "" = ไม่มีไอคอน · อีโมจิเก่าอ่านได้ตามเดิม
 * จุดที่โชว์ค่านี้ต้องวาดด้วย <Icon value={...} /> เสมอ (ห้ามพิมพ์ค่าตรง ๆ — จะเห็น "i:truck")
 *
 *   <IconField value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} suggestFrom={form.label} />
 * docs/icon-system.md
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Popover } from "@/components/popover";
import { useToast } from "@/components/toast";
import { Icon, useIconSettings } from "@/components/icon";
import { IconPickerModal } from "@/components/icon/icon-picker-modal";
import { ERP_ICONS, type ErpIconDef } from "@/lib/erp-icons";
import { isLegacyIconValue, joinIconColor, splitIconColor, suggestIconForEmoji } from "@/lib/icon-registry";

// ── ไอคอนล่าสุด (จำในเครื่องนี้ 12 ตัว) ──
const RECENT_KEY = "erp.iconRecent.v1";
const recentSubs = new Set<() => void>();
let recentCache: string[] | null = null;
function readRecent(): string[] {
  if (recentCache) return recentCache;
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); recentCache = Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12) : []; }
  catch { recentCache = []; }
  return recentCache;
}
const EMPTY: string[] = [];
function pushRecent(v: string) {
  const base = splitIconColor(v).value;
  if (!/^(i|c):/.test(base)) return;
  recentCache = [base, ...readRecent().filter((x) => x !== base)].slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentCache)); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
  recentSubs.forEach((f) => f());
}
function useRecent(): string[] {
  return useSyncExternalStore((f) => { recentSubs.add(f); return () => { recentSubs.delete(f); }; }, readRecent, () => EMPTY);
}

/** ไอคอนที่ใช้บ่อยในระบบ (โชว์เมื่อยังไม่มีล่าสุด / ยังไม่พิมพ์ชื่อ) */
export const POPULAR_ICONS = [
  "package", "shopping-cart", "building-store", "truck", "building-warehouse", "users", "briefcase", "cash",
  "receipt", "file-text", "clipboard-list", "calendar", "chart-bar", "speakerphone", "palette", "photo",
  "building-factory", "scissors", "tag", "star", "bell", "settings", "home", "world",
];

/** สีด่วนในดรอปดาวน์ (null = อัตโนมัติ) */
const QUICK_COLORS: (string | null)[] = [null, "#334155", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#db2777"];

const BY_KEY = new Map(ERP_ICONS.map((i) => [i.key, i]));

/** แนะนำไอคอนจากข้อความ (ชื่อแอป/เมนู) — เทียบคำค้นไทยในชุดไอคอน */
export function suggestIconsFromText(text: string, max = 12): ErpIconDef[] {
  const t = text.trim().toLowerCase();
  if (t.length < 2) return [];
  const scored: { i: ErpIconDef; s: number }[] = [];
  for (const i of ERP_ICONS) {
    let s = 0;
    for (const w of i.label.toLowerCase().split(/\s+/)) {
      if (w.length < 2) continue;
      if (t === w) s = Math.max(s, 3);
      else if (t.includes(w)) s = Math.max(s, 2);
      else if (w.includes(t)) s = Math.max(s, 1);
    }
    if (i.key.includes(t)) s = Math.max(s, 1);
    if (s) scored.push({ i, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.i);
}

function searchIcons(q: string): ErpIconDef[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return ERP_ICONS.filter((i) => `${i.key} ${i.label}`.toLowerCase().includes(t));
}

function useIsPhone() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const f = () => setM(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return m;
}

export function IconField({
  value,
  onChange,
  suggestFrom,
  allowColor = true,
  allowClear = true,
  undo = true,
  disabled,
  size = "md",
  placeholderIcon = "i:category",
  title = "เลือกไอคอน",
  className = "",
}: {
  /** ค่าเดิม ("i:…" / "c:…" / อีโมจิเก่า / "") */
  value: string | null | undefined;
  /** ค่าใหม่ · "" = ไม่มีไอคอน */
  onChange: (v: string) => void;
  /** ข้อความไว้แนะนำไอคอน (เช่น ชื่อแอป/ชื่อเมนูที่กำลังพิมพ์) */
  suggestFrom?: string;
  /** มีแถบเลือกสีเส้น (สีเก็บในค่าเดียวกัน) */
  allowColor?: boolean;
  allowClear?: boolean;
  /** แจ้งผลมุมจอ "ย้อนกลับ" หลังเปลี่ยน (ปิดได้ถ้าหน้านั้นมีย้อนกลับของตัวเอง) */
  undo?: boolean;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  /** ไอคอนจาง ๆ ตอนยังไม่มีค่า */
  placeholderIcon?: string;
  title?: string;
  className?: string;
}) {
  const toast = useToast();
  const settings = useIconSettings();
  const recent = useRecent();
  const phone = useIsPhone();
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState(false);
  const [all, setAll] = useState(false);
  const cur = (value ?? "").trim();
  const { value: base, color } = splitIconColor(cur);
  const legacy = isLegacyIconValue(cur);
  const legacySuggest = legacy ? suggestIconForEmoji(cur, settings) : null;

  const suggested = useMemo(() => suggestIconsFromText(suggestFrom ?? ""), [suggestFrom]);
  const results = useMemo(() => searchIcons(q), [q]);

  const commit = (next: string, close?: () => void) => {
    const prev = cur;
    if (next === prev) { close?.(); return; }
    onChange(next);
    if (next) pushRecent(next);
    close?.();
    if (undo) toast.undo(next ? "เปลี่ยนไอคอนแล้ว" : "ล้างไอคอนแล้ว", () => onChange(prev));
  };
  const pickIcon = (v: string, close?: () => void) => commit(joinIconColor(v, color), close);
  const pickColor = (hex: string | null) => { if (base && !legacy) commit(joinIconColor(base, hex)); };

  const box = size === "sm" ? "h-7 w-9 text-[16px]" : size === "lg" ? "h-12 w-14 text-[26px]" : "h-9 w-12 text-[20px]";
  const triggerBtn = (toggle: () => void, open: boolean) => (
    <button type="button" disabled={disabled} title={legacy ? `${title} (อีโมจิเดิม)` : title} aria-label={title} aria-expanded={open}
      onClick={() => (phone ? setSheet(true) : toggle())}
      className={`relative inline-flex items-center justify-center gap-0.5 rounded-lg border bg-white text-slate-700 transition-colors disabled:opacity-50 ${open ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"} ${box} ${className}`}>
      {cur ? <Icon value={cur} /> : <span className="text-slate-300"><Icon value={placeholderIcon} /></span>}
      {legacy && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-white" />}
    </button>
  );

  const cell = (v: string, tip: string, close?: () => void) => (
    <button key={v} type="button" title={tip} onClick={() => pickIcon(v, close)}
      style={color ? { color } : undefined}
      className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border text-[19px] text-slate-700 ${base === v ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 hover:bg-slate-50 hover:border-slate-300"}`}>
      <Icon value={v} settings={settings} />
    </button>
  );
  const row = (label: string, keys: string[], close?: () => void) => keys.length === 0 ? null : (
    <div className="mb-2">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {keys.map((v) => {
          const k = v.startsWith("i:") ? v.slice(2) : "";
          return cell(v, BY_KEY.get(k)?.label ?? (v.startsWith("c:") ? settings.custom.find((c) => `c:${c.id}` === v)?.label ?? "ไอคอนของฉัน" : v), close);
        })}
      </div>
    </div>
  );

  const panel = (close: () => void) => (
    <div className="text-sm">
      <input autoFocus={!phone} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา เช่น เงิน, รถ, truck"
        className="w-full h-9 px-3 mb-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />

      {legacy && (
        <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="text-base leading-none">{cur}</span>
          <span className="flex-1">อีโมจิเดิม — เปลี่ยนเป็นไอคอนเส้นดีกว่า</span>
          {legacySuggest && (
            <button type="button" onClick={() => pickIcon(legacySuggest, close)}
              className="inline-flex items-center gap-1 rounded-md bg-white border border-amber-300 px-2 py-1 text-amber-800 hover:bg-amber-100">
              <Icon value={legacySuggest} settings={settings} /> ใช้ตัวนี้
            </button>
          )}
        </div>
      )}

      {q.trim() ? (
        results.length === 0
          ? <p className="text-xs text-slate-400 py-4 text-center">ไม่พบ “{q}” — ลองคำอื่น หรือกดดูทั้งหมด</p>
          : row(`ผลค้นหา (${results.length})`, results.slice(0, 40).map((i) => `i:${i.key}`), close)
      ) : (
        <>
          {row(`แนะนำจากชื่อ “${(suggestFrom ?? "").trim()}”`, suggested.map((i) => `i:${i.key}`), close)}
          {row("ใช้ล่าสุด", recent, close)}
          {row("ยอดนิยม", POPULAR_ICONS.filter((k) => !recent.includes(`i:${k}`)).slice(0, recent.length ? 12 : 24).map((k) => `i:${k}`), close)}
        </>
      )}

      {allowColor && (
        <div className="flex flex-wrap items-center gap-1 pt-2 mt-1 border-t border-slate-100">
          <span className="text-[11px] text-slate-400 mr-1">สีเส้น</span>
          {QUICK_COLORS.map((hex) => (
            <button key={hex ?? "auto"} type="button" disabled={!base || legacy} onClick={() => pickColor(hex)}
              title={hex ? hex : "อัตโนมัติ (ตามตัวหนังสือ)"} aria-label={hex ? `สี ${hex}` : "สีอัตโนมัติ"}
              className={`w-6 h-6 rounded-md border-2 disabled:opacity-30 ${(color ?? null) === hex ? "border-slate-800" : "border-white shadow-sm hover:scale-110"} transition-transform`}
              style={{ background: hex ?? "linear-gradient(135deg,#fff 45%,#94a3b8 45%,#94a3b8 55%,#fff 55%)" }} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        <button type="button" onClick={() => { close(); setAll(true); }} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
          ดูทั้งหมด {ERP_ICONS.length} ตัว <Icon value="i:arrow-forward-up" />
        </button>
        {allowClear && cur && (
          <button type="button" onClick={() => commit("", close)} className="text-xs text-slate-400 hover:text-red-500">ล้างไอคอน</button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {phone ? triggerBtn(() => setSheet(true), sheet) : (
        <Popover panelClassName="w-[300px] p-2.5 overflow-y-auto" trigger={triggerBtn}>
          {(close) => panel(close)}
        </Popover>
      )}

      {phone && sheet && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90] flex items-end bg-black/30" onClick={() => setSheet(false)}>
          <div className="w-full max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-3 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-slate-300" />
            <div className="flex items-center mb-2">
              <span className="font-medium text-slate-800 text-sm">{title}</span>
              <button type="button" onClick={() => setSheet(false)} className="ml-auto p-1 text-slate-400" aria-label="ปิด"><Icon value="i:x" size={18} /></button>
            </div>
            {panel(() => setSheet(false))}
          </div>
        </div>,
        document.body,
      )}

      {all && (
        <IconPickerModal open title={title} value={base && !legacy ? base : null} settings={settings}
          color={color} onColor={allowColor ? (hex) => { if (base && !legacy) commit(joinIconColor(base, hex)); } : undefined}
          onPick={(v) => { if (v) pickIcon(v); else if (allowClear) commit(""); }}
          defaultValue={allowClear && cur ? placeholderIcon : undefined}
          onClose={() => setAll(false)} />
      )}
    </>
  );
}
