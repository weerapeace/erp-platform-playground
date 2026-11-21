"use client";

/**
 * เปิดหน้าใหม่ให้เช็กหลังส่งขึ้นร้าน — ตัวเปิดแท็บ + หน้าตั้งค่า (ของกลาง) · กติกา lib/push-open · คู่มือ docs/push-open.md
 *
 * ใช้ (ทุกปุ่มที่ส่งขึ้นร้าน):
 *   const pushOpen = usePushOpen();
 *   onClick = async () => {
 *     const session = pushOpen.prepare([{ code: "shopee" }]);   // ⚠️ เรียก "ทันทีในจังหวะกด" ก่อน await ใด ๆ — เปิดแท็บรอไว้ (แบบ A · ไม่โดนบล็อก)
 *     ... ส่งขึ้นร้าน ...
 *     session.finish([{ code: "shopee", shopName: "Shopee", productId, state: "hidden" }]);   // พาแท็บไปหน้าที่เลือก · ไม่สำเร็จเลย = finish([]) ปิดแท็บเอง
 *   }
 *   <PushOpenGearButton />  = ปุ่ม ⚙ เปลี่ยนค่าได้ทันที (ขั้นยืนยัน) · <PushOpenSettingsModal open onClose /> = หน้าตั้งค่า (เมนูโปรไฟล์)
 * เบราว์เซอร์ให้เปิดหน้าต่างใหม่ได้ 1 หน้าต่อการกด 1 ครั้ง (ยกเว้นอนุญาตป๊อปอัปให้เว็บนี้) → หน้าที่เปิดไม่ทัน = ปุ่มในแจ้งผลมุมจอ ทีละหน้า
 * แค่เปิดหน้า ไม่ส่งอะไรขึ้นร้าน
 */
import { useCallback, useRef, useState } from "react";
import { useUserPref } from "@/lib/use-user-pref";
import { useToast, type ToastApi } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { ToggleSwitch } from "@/components/toggle-switch";
import {
  DEFAULT_PUSH_OPEN, PUSH_OPEN_MAX_TABS, PUSH_OPEN_PAGE_LABEL, PUSH_OPEN_PREF_KEY, PUSH_OPEN_SHOPS,
  parsePushOpenPrefs, planPushOpen, pushOpenTabBudget,
  type PushOpenPage, type PushOpenPrefs, type PushOpenShopChoice, type PushOpenTarget, type PushedItem,
} from "@/lib/push-open";

export type PushOpenSession = {
  /** ส่งเสร็จ → พาแท็บที่เปิดรอไว้ไปหน้าที่เลือก · ที่เหลือ = ปุ่มในแจ้งผล · [] = ปิดแท็บที่เปิดรอไว้ */
  finish: (items: PushedItem[]) => void;
};

export function usePushOpenPrefs(): [PushOpenPrefs, (v: PushOpenPrefs) => void] {
  return useUserPref<PushOpenPrefs>(PUSH_OPEN_PREF_KEY, DEFAULT_PUSH_OPEN, parsePushOpenPrefs);
}

const WAIT_HTML = `<div style="font-family:system-ui,sans-serif;padding:48px 24px;color:#475569;text-align:center">
<div style="font-size:18px;margin-bottom:8px">กำลังส่งขึ้นร้าน…</div>
<div style="font-size:13px;color:#94a3b8">ส่งเสร็จแล้วหน้านี้จะพาไปหน้าที่เลือกไว้ให้เช็ก · ส่งไม่สำเร็จ หน้านี้จะปิดเอง</div></div>`;

/** เปิดแท็บรอ 1 แท็บ (ต้องอยู่ในจังหวะกด) · โดนบล็อก = null */
function openWaitingTab(): Window | null {
  try {
    const w = window.open("", "_blank");
    if (!w) return null;
    try { w.document.title = "กำลังส่งขึ้นร้าน…"; w.document.body.innerHTML = WAIT_HTML; } catch { /* หน้าเปล่าเขียนไม่ได้ ไม่เป็นไร */ }
    try { w.opener = null; } catch { /* ignore */ }
    return w;
  } catch { return null; }
}

/** แจ้งผล: หน้าที่เปิดไม่ทัน → ปุ่มเปิดทีละหน้า (กดแล้วแสดงที่เหลือต่อ) + หมายเหตุ/คัดลอกรหัส */
function toastRest(toast: ToastApi, rest: PushOpenTarget[], opened: number, notes: string[]) {
  const head = opened ? `เปิดหน้าให้เช็กแล้ว ${opened} หน้า` : "เบราว์เซอร์บล็อกหน้าต่างใหม่";
  const tail = notes.length ? ` · ${notes.slice(0, 2).join(" · ")}` : "";
  if (!rest.length) { if (notes.length) toast.info(`${head}${tail}`); return; }
  const btn = (t: PushOpenTarget, i: number) => ({
    label: `เปิด ${t.title.split(" · ")[0]}${rest.length > 1 ? ` (${i + 1})` : ""}`,
    onClick: () => {
      window.open(t.url, "_blank", "noopener");
      if (t.copyId) void navigator.clipboard?.writeText(t.copyId).catch(() => undefined);
      toastRest(toast, rest.filter((x) => x !== t), opened + 1, []);
    },
  });
  const [first, ...more] = rest.slice(0, 4);
  toast.action(`${head} · เหลือ ${rest.length} หน้า${opened ? "" : " (อนุญาตป๊อปอัปให้เว็บนี้ แล้วระบบจะเปิดให้เอง)"}${tail}`, btn(first, 0).label, btn(first, 0).onClick,
    { variant: "info", ms: 20000, more: more.map((t, i) => btn(t, i + 1)) });
}

export function usePushOpen() {
  const [prefs, setPrefs] = usePushOpenPrefs();
  const toast = useToast();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  /** ⚠️ เรียกทันทีตอนกดปุ่ม (ก่อน await) · expected = ร้าน×สินค้าที่กำลังจะส่ง */
  const prepare = useCallback((expected: { code: string }[]): PushOpenSession => {
    const p = prefsRef.current;
    const budget = pushOpenTabBudget(expected, p);
    const tabs: Window[] = [];
    for (let i = 0; i < budget; i++) { const w = openWaitingTab(); if (!w) break; tabs.push(w); }
    let done = false;
    return {
      finish: (items) => {
        if (done) return; done = true;
        const targets = planPushOpen(items, p);
        const notes = [...new Set(targets.map((t) => t.note).filter((x): x is string => !!x))];
        let used = 0;
        for (const t of targets) {
          const w = tabs[used];
          if (!w || w.closed) break;
          try { w.location.href = t.url; used++; } catch { break; }
          if (t.copyId) void navigator.clipboard?.writeText(t.copyId).catch(() => undefined);
        }
        for (const w of tabs.slice(used)) { try { w.close(); } catch { /* ignore */ } }
        if (targets.length) toastRest(toast, targets.slice(used).slice(0, PUSH_OPEN_MAX_TABS * 4), used, notes);
      },
    };
  }, [toast]);

  return { prefs, setPrefs, prepare };
}

/** หน้าตั้งค่า (ต่อคน · ตามไปทุกเครื่อง) — เปิด/ปิด · หน้าที่จะเปิด · แยกรายร้าน */
export function PushOpenSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prefs, setPrefs] = usePushOpenPrefs();
  const [perOpen, setPerOpen] = useState(() => Object.keys(prefs.perShop).length > 0);
  const set = (patch: Partial<PushOpenPrefs>) => setPrefs({ ...prefs, ...patch });
  const setShop = (code: string, v: PushOpenShopChoice) => {
    const next = { ...prefs.perShop };
    if (v) next[code] = v; else delete next[code];
    set({ perShop: next });
  };
  return (
    <ERPModal open={open} onClose={onClose} title="หลังส่งขึ้นร้านเสร็จ" description="ตั้งค่าของคุณคนเดียว · บันทึกทันที" size="sm"
      footer={<button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">เสร็จ</button>}>
      <div className="space-y-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-slate-800">เปิดหน้าใหม่ให้เช็กอัตโนมัติ</div>
            <div className="text-xs text-slate-500">กดส่งแล้วระบบเปิดแท็บรอไว้ ส่งเสร็จพาไปหน้าที่เลือก · ส่งไม่สำเร็จ แท็บปิดเอง</div>
          </div>
          <ToggleSwitch on={prefs.enabled} onChange={(v) => set({ enabled: v })} label="เปิดหน้าใหม่ให้เช็กอัตโนมัติ" />
        </div>
        <div className={prefs.enabled ? "" : "pointer-events-none opacity-50"}>
          <div className="mb-1.5 text-xs text-slate-500">เปิดหน้าไหน</div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap" role="radiogroup" aria-label="เปิดหน้าไหน">
            {(Object.keys(PUSH_OPEN_PAGE_LABEL) as PushOpenPage[]).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={prefs.page === v} onClick={() => set({ page: v })}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs ${prefs.page === v ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <Icon name={v === "store" ? "store" : v === "seller" ? "edit" : "documents"} />{PUSH_OPEN_PAGE_LABEL[v]}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPerOpen((x) => !x)} className="mt-3 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
            <span aria-hidden className="text-slate-400">{perOpen ? "▾" : "▸"}</span>ตั้งแยกรายร้าน{Object.keys(prefs.perShop).length ? ` (${Object.keys(prefs.perShop).length})` : ""}
          </button>
          {perOpen && (
            <div className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {PUSH_OPEN_SHOPS.map((s) => (
                <div key={s.code} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-slate-800">{s.label}</div>
                    {s.note && <div className="text-[11px] text-slate-400">{s.note}</div>}
                  </div>
                  <select value={prefs.perShop[s.code] ?? ""} onChange={(e) => setShop(s.code, e.target.value as PushOpenShopChoice)}
                    className="h-8 rounded-md border border-slate-200 px-2 text-xs" aria-label={`${s.label}: เปิดหน้าไหน`}>
                    <option value="">ใช้ค่าหลัก</option>
                    <option value="store">หน้าสินค้า</option>
                    <option value="seller">Seller Center</option>
                    <option value="both">ทั้งสองหน้า</option>
                    <option value="off">ไม่เปิด</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400">ส่งหลายตัวพร้อมกัน เปิดอย่างมาก {PUSH_OPEN_MAX_TABS} หน้า ที่เหลือเป็นปุ่มในแจ้งผลมุมจอ · เบราว์เซอร์ส่วนใหญ่ให้เปิดได้ 1 หน้าต่อการกด 1 ครั้ง ถ้าอยากให้เปิดครบ ให้อนุญาตป๊อปอัปให้เว็บนี้</p>
        </div>
      </div>
    </ERPModal>
  );
}

/** ปุ่ม ⚙ เล็ก ๆ โชว์ค่าปัจจุบัน + เปิดหน้าตั้งค่า (ขั้นยืนยันของตัวช่วยลงสินค้า · ปุ่มส่งขึ้นร้านอื่น ๆ) */
export function PushOpenGearButton({ className = "" }: { className?: string }) {
  const [prefs] = usePushOpenPrefs();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="ตั้งค่าการเปิดหน้าใหม่หลังส่งขึ้นร้าน"
        className={`inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50 ${className}`}>
        <Icon name="settings" />เปิดหน้าให้เช็ก: {prefs.enabled ? (Object.keys(prefs.perShop).length ? "ตั้งรายร้าน" : prefs.page === "seller" ? "Seller Center" : prefs.page === "store" ? "หน้าสินค้า" : "ทั้งสองหน้า") : "ปิด"}
      </button>
      {open && <PushOpenSettingsModal open onClose={() => setOpen(false)} />}
    </>
  );
}
