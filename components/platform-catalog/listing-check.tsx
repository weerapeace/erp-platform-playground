"use client";
/**
 * โหมด "เช็กกับระบบ" ในลิ้นชักสินค้าบนร้าน — ของกลาง (ทุกร้าน) · เจ้าของเลือก 2026-11-23 แบบ A (โชว์ในแต่ละช่อง) + ข้อ 1, 2
 * --------------------------------------------------------------------------
 *   const chk = useListingCheck(listingId, { available, canAdopt });       // กดปุ่มหัวลิ้นชัก → ตรวจสด (ตัวเทียบกลาง lib/platform-listing-drift)
 *   <CheckToggleButton chk={chk} />   <CheckSummaryBar chk={chk} onUseAll={…} />
 *   ในแต่ละช่อง: <CheckBadge chk={chk} k="title" />  +  <CheckSysBox chk={chk} k="title" sys={…} onUse={() => edit.setName(…)} />
 *
 * - "ใช้ตามระบบ" = เติมค่าระบบลงฟอร์มในลิ้นชัก (ยังไม่ส่ง) → กด "บันทึกขึ้นร้าน" ตามปกติ (มีหน้ายืนยันก่อน → หลัง) · ย้อนได้ด้วย "ยกเลิกที่แก้"
 * - "ให้ระบบใช้ค่านี้" (ข้อ 1) = เขียนค่าบนร้านลง "ร่างของร้านนี้" (ไม่แตะ Parent SKU ที่ใช้ทุกร้าน) → POST /api/platform-catalog/drift adopt · ย้อนได้ (แจ้งผลมุมจอ)
 *   ได้เฉพาะ ชื่อ / รายละเอียด / ข้อมูลจำเพาะ (รูปบนร้านไม่อยู่ในคลังรูประบบ · ราคามาจากกติการาคา → บอกเหตุผล)
 * ข้อมูล: GET /api/platform-catalog/drift?listing_id= (ตรวจสด + ค่าฝั่งระบบเต็ม `sys`) · ไม่ตรวจเองตอนเปิดลิ้นชัก (เจ้าของไม่เลือกข้อ 5 — กดเอง)
 * ของกลางที่ใช้: Icon · toast.undo · ตัวเทียบกลาง lib/platform-listing-drift(-server)
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { DRIFT_LABEL, refImageUrl, type DriftItem, type DriftKey } from "@/lib/platform-listing-drift";
import type { DriftCheck, DriftSysView } from "@/lib/platform-listing-drift-server";

const ADOPTABLE: readonly DriftKey[] = ["title", "description", "attrs"];
const ADOPT_NO: Partial<Record<DriftKey, string>> = {
  images: "รูปบนร้านไม่อยู่ในคลังรูปของระบบ", desc_images: "รูปบนร้านไม่อยู่ในคลังรูปของระบบ", variant_images: "รูปบนร้านไม่อยู่ในคลังรูปของระบบ",
  price: "ราคามาจากกติการาคาของระบบ", options: "ชื่อตัวเลือกมาจาก SKU ในระบบ",
};

export type ListingCheckApi = {
  available: boolean;
  on: boolean;
  toggle: () => void;
  loading: boolean;
  error: string | null;
  check: DriftCheck | null;
  sys: DriftSysView | null;
  item: (k: DriftKey) => DriftItem | null;
  reload: () => void;
  /** เรื่องที่กด "ใช้ตามระบบ" แล้ว (ยังไม่ส่ง) — ป้ายเปลี่ยนเป็น "ใช้ตามระบบแล้ว" */
  filled: ReadonlySet<DriftKey>;
  markFilled: (keys: DriftKey[]) => void;
  clearFilled: () => void;
  canAdopt: boolean;
  adopt: (k: DriftKey) => Promise<void>;
  adopting: DriftKey | null;
  /** "ข้าม (ถือว่าตรง)" / เลิกข้าม (2026-11-24 · ตัวเดียวกับหน้าอัปเดตให้ตรง) */
  ignore: (k: DriftKey, on: boolean) => Promise<void>;
};

type CheckResp = { check: DriftCheck | null; error: string | null };
type AdoptResp = { before?: unknown; label?: string; check: DriftCheck | null; error: string | null };

export function useListingCheck(listingId: string | null, opts: { available: boolean; canAdopt: boolean }): ListingCheckApi {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<DriftCheck | null>(null);
  const [filled, setFilled] = useState<Set<DriftKey>>(new Set());
  const [adopting, setAdopting] = useState<DriftKey | null>(null);
  const seq = useRef(0);

  // เปิดตัวอื่น = ปิดโหมด ล้างผลเดิม
  useEffect(() => { seq.current++; setOn(false); setCheck(null); setError(null); setFilled(new Set()); }, [listingId]);

  const load = useCallback(() => {
    if (!listingId) return;
    const my = ++seq.current;
    setLoading(true); setError(null);
    apiFetch(`/api/platform-catalog/drift?listing_id=${encodeURIComponent(listingId)}`)
      .then((r) => r.json().catch(() => ({ check: null, error: `HTTP ${r.status}` })) as Promise<CheckResp>)
      .then((j) => { if (my !== seq.current) return; setCheck(j.check); setError(j.error ?? (j.check ? null : "ตรวจไม่สำเร็จ")); setFilled(new Set()); })
      .catch(() => { if (my === seq.current) setError("ตรวจไม่สำเร็จ — ลองใหม่"); })
      .finally(() => { if (my === seq.current) setLoading(false); });
  }, [listingId]);

  const toggle = useCallback(() => {
    setOn((x) => { const next = !x; if (next && !check) load(); return next; });
  }, [check, load]);

  const post = useCallback(async (body: Record<string, unknown>): Promise<AdoptResp> => {
    const r = await apiFetch("/api/platform-catalog/drift", { method: "POST", body: JSON.stringify({ listing_id: listingId, ...body }) });
    return r.json().catch(() => ({ check: null, error: `HTTP ${r.status}` })) as Promise<AdoptResp>;
  }, [listingId]);

  const adopt = useCallback(async (k: DriftKey) => {
    if (!listingId || adopting) return;
    setAdopting(k);
    try {
      const j = await post({ action: "adopt", key: k });
      if (j.error) { toast.error(j.error); return; }
      if (j.check) setCheck(j.check);
      const before = j.before ?? null;
      toast.undo(`ให้ระบบใช้${j.label ?? DRIFT_LABEL[k]}ตามบนร้านแล้ว (บันทึกลงร่างของร้านนี้ · ร้านอื่นไม่เปลี่ยน)`, async () => {
        const u = await post({ action: "adopt_undo", key: k, before });
        if (u.error) toast.error(u.error); else { if (u.check) setCheck(u.check); toast.success("ย้อนกลับร่างแล้ว"); }
      }, { ms: 10_000 });
    } catch (e) { toast.error((e as Error).message); }
    finally { setAdopting(null); }
  }, [listingId, adopting, post, toast]);

  const ignore = useCallback(async (k: DriftKey, onOff: boolean) => {
    if (!listingId || adopting) return;
    setAdopting(k);
    try {
      const j = await post({ action: onOff ? "ignore" : "unignore", key: k });
      if (j.error) { toast.error(j.error); return; }
      if (j.check) setCheck({ ...j.check, sys: j.check.sys ?? check?.sys });
      if (onOff) toast.undo(`ข้าม “${DRIFT_LABEL[k]}” ไว้แล้ว — ถ้าบนร้านหรือในระบบเปลี่ยนอีกจะเตือนใหม่`, async () => {
        const u = await post({ action: "unignore", key: k });
        if (u.error) toast.error(u.error); else if (u.check) setCheck(u.check);
      }, { ms: 8_000 });
      else toast.success(`เลิกข้าม “${DRIFT_LABEL[k]}” แล้ว`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setAdopting(null); }
  }, [listingId, adopting, post, toast, check]);

  return {
    available: opts.available, on: opts.available && on, toggle, loading, error, check, sys: check?.sys ?? null,
    item: (k) => check?.items.find((i) => i.key === k) ?? null,
    reload: load, filled, markFilled: (keys) => setFilled((s) => new Set([...s, ...keys])), clearFilled: () => setFilled(new Set()),
    canAdopt: opts.canAdopt, adopt, adopting, ignore,
  };
}

/** ปุ่มเปิด/ปิดโหมดที่หัวลิ้นชัก */
export function CheckToggleButton({ chk }: { chk: ListingCheckApi }) {
  if (!chk.available) return null;
  return (
    <button type="button" onClick={chk.toggle} aria-pressed={chk.on}
      title="เทียบสินค้าบนร้านกับข้อมูลในระบบ ทีละช่อง (ดึงสดทั้งสองฝั่ง)"
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs ${chk.on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
      <Icon name={chk.on ? "cancel" : "inspect"} />{chk.on ? "ปิดโหมดเช็ก" : "เช็กกับระบบ"}
    </button>
  );
}

/** แถบสรุปใต้หัวลิ้นชัก: ไม่ตรงกี่เรื่อง · ใช้ตามระบบทั้งหมด (ข้อ 2) · ตรวจใหม่ */
export function CheckSummaryBar({ chk, onUseAll, fillable, extra }: { chk: ListingCheckApi; onUseAll?: () => void; fillable?: readonly DriftKey[]; extra?: ReactNode }) {
  if (!chk.on) return null;
  if (chk.loading && !chk.check) return <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">กำลังเทียบกับระบบ (ดึงสดทั้งสองฝั่ง)…</div>;
  if (chk.error && !chk.check) return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
      <Icon name="warning" /><span className="min-w-0 flex-1">{chk.error}</span>
      <button type="button" onClick={chk.reload} className="h-7 rounded-md border border-rose-200 bg-white px-2 hover:bg-rose-100">ลองใหม่</button>
    </div>
  );
  const items = chk.check?.items ?? [];
  const diff = items.filter((i) => i.state === "diff");
  const open = diff.filter((i) => !chk.filled.has(i.key));
  const same = items.filter((i) => i.state === "same").length;
  const canFill = open.filter((i) => i.sendable && (fillable ?? []).includes(i.key));
  const allOk = open.length === 0;
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${allOk ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <Icon name={allOk ? "done" : "warning"} />
      <span className="min-w-0 flex-1">
        {allOk ? (diff.length ? `ใช้ตามระบบครบแล้ว ${diff.length} เรื่อง — กดบันทึกขึ้นร้านเพื่อส่ง` : `ตรงกับระบบทุกเรื่อง (${same} เรื่อง)`)
          : <>ไม่ตรงระบบ {open.length} เรื่อง: <b className="font-medium">{open.map((i) => DRIFT_LABEL[i.key]).join(" · ")}</b>{same ? ` · ตรงแล้ว ${same}` : ""}</>}
        {chk.loading && " · กำลังตรวจใหม่…"}
      </span>
      {onUseAll && canFill.length > 0 && (
        <button type="button" onClick={onUseAll} title="เติมค่าระบบลงทุกช่องที่ไม่ตรง (ยังไม่ส่ง — กดบันทึกขึ้นร้านอีกที)"
          className="h-7 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">ใช้ตามระบบทั้งหมด ({canFill.length})</button>
      )}
      {extra}
      <button type="button" onClick={chk.reload} disabled={chk.loading} className="h-7 rounded-md border border-current/20 bg-white px-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" />ตรวจใหม่</button>
    </div>
  );
}

/** ป้ายข้างชื่อช่อง: ตรงแล้ว / ไม่ตรง / ใช้ตามระบบแล้ว / บอกไม่ได้ */
export function CheckBadge({ chk, k }: { chk: ListingCheckApi | null | undefined; k: DriftKey }) {
  if (!chk?.on) return null;
  const it = chk.item(k);
  if (!it) return chk.loading ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">กำลังเทียบ…</span> : null;
  if (chk.filled.has(k)) return <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">ใช้ตามระบบแล้ว (ยังไม่ส่ง)</span>;
  if (it.ignored) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700" title={it.note ?? undefined}>ข้ามไว้ (ถือว่าตรง)
      {chk.canAdopt && <button type="button" disabled={!!chk.adopting} onClick={() => void chk.ignore(k, false)} className="underline hover:text-emerald-900 disabled:opacity-50">เลิกข้าม</button>}
    </span>
  );
  if (it.state === "same") return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">ตรงแล้ว</span>;
  if (it.state === "diff") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800" title={it.summary}>ไม่ตรง</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500" title={it.note ?? it.summary}>บอกไม่ได้</span>;
}

/**
 * กล่องค่าของระบบใต้ช่อง (เฉพาะตอนไม่ตรง/บอกไม่ได้) + ปุ่ม "ใช้ตามระบบ" / "ให้ระบบใช้ค่านี้"
 * sys = สิ่งที่โชว์เป็นค่าของระบบ (ข้อความ / รูปย่อ) · rows = ตารางรายช่อง (ข้อมูลจำเพาะ/ราคา) มาจากตัวเทียบเอง
 */
export function CheckSysBox({ chk, k, sys, onUse, useLabel = "ใช้ตามระบบ" }: {
  chk: ListingCheckApi | null | undefined; k: DriftKey; sys?: ReactNode; onUse?: (() => void) | null; useLabel?: string;
}) {
  if (!chk?.on) return null;
  const it = chk.item(k);
  if (!it || it.state === "same" || chk.filled.has(k)) return null;
  if (it.state === "unknown" && !it.note && !sys) return null;
  const adoptable = ADOPTABLE.includes(k) && chk.canAdopt && it.state === "diff";
  return (
    <div className="mt-1.5 rounded-lg border border-violet-200 bg-violet-50/60 px-2.5 py-2 text-xs text-violet-900">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className="font-medium">ระบบ:</span><span className="text-violet-800">{it.summary}</span>
      </div>
      {sys}
      {it.rows && it.rows.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {it.rows.slice(0, 12).map((r, i) => <li key={i}><span className="text-violet-700">{r.label}:</span> <span className="text-slate-400 line-through">{r.before}</span> → <span className="text-slate-800">{r.after}</span></li>)}
          {it.rows.length > 12 && <li className="text-violet-600">และอีก {it.rows.length - 12} รายการ</li>}
        </ul>
      )}
      {it.note && <p className="mt-1 text-[11px] text-violet-700">{it.note}</p>}
      {it.cannot && <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-800"><Icon name="warning" className="mt-0.5 shrink-0" />{it.cannot}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {onUse && it.sendable && (
          <button type="button" onClick={() => { onUse(); chk.markFilled([k]); }} className="h-7 rounded-md bg-violet-600 px-2.5 text-white hover:bg-violet-700">{useLabel}</button>
        )}
        {adoptable && (
          <button type="button" disabled={!!chk.adopting} onClick={() => void chk.adopt(k)}
            title="บันทึกค่าบนร้านนี้เป็นค่าของระบบ — ลงร่างของร้านนี้เท่านั้น (ร้านอื่น/Parent SKU ไม่เปลี่ยน) · ย้อนกลับได้"
            className="h-7 rounded-md border border-violet-300 bg-white px-2.5 text-violet-800 hover:bg-violet-100 disabled:opacity-50">{chk.adopting === k ? "กำลังบันทึก…" : "ให้ระบบใช้ค่านี้"}</button>
        )}
        {chk.canAdopt && it.state === "diff" && (
          <button type="button" disabled={!!chk.adopting} onClick={() => void chk.ignore(k, true)}
            title="ถือว่าเรื่องนี้ตรงแล้ว — ระบบจำไว้ ถ้าบนร้านหรือในระบบเปลี่ยนอีกจะเตือนใหม่ (ไม่ส่ง ไม่แก้อะไร)"
            className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50">ข้าม (ถือว่าตรง)</button>
        )}
        {!ADOPTABLE.includes(k) && it.state === "diff" && ADOPT_NO[k] && <span className="self-center text-[11px] text-violet-600">ให้ระบบใช้ตามร้านไม่ได้: {ADOPT_NO[k]}</span>}
      </div>
    </div>
  );
}

/** รูปย่อของค่าฝั่งระบบ ("r2:<key>" / ลิงก์) — ใช้ในกล่องค่าระบบ */
export function SysThumbs({ refs, max = 12 }: { refs: readonly string[]; max?: number }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {refs.slice(0, max).map((r, i) => <img key={`${r}-${i}`} src={refImageUrl(r, 160)} alt="" loading="lazy" className="h-11 w-11 rounded border border-violet-100 bg-white object-cover" />)}
      {refs.length > max && <span className="self-center text-[11px] text-violet-700">+{refs.length - max}</span>}
    </div>
  );
}

/** ปุ่ม "ใช้ตามระบบ" ต่อเรื่อง (ไม่มี = เรื่องนี้เติมฟอร์มไม่ได้ → ไปหน้าอัปเดตให้ตรง) */
export type CheckFill = Partial<Record<DriftKey, () => void>>;
/**
 * กล่องเทียบหลายเรื่องรวมไว้บนสุดของแท็บ — ร้านที่ยังไม่ได้ใส่ป้ายรายช่อง (TikTok / Lazada / LINE · Shopee ใส่ในแต่ละช่องแล้ว)
 * โชว์เฉพาะเรื่องที่ตัวเทียบตอบมา · ตรงแล้ว = ป้ายเขียวบรรทัดเดียว
 */
export function CheckTabBlock({ chk, keys, fill, sysOf }: { chk: ListingCheckApi | null | undefined; keys: readonly DriftKey[]; fill: CheckFill; sysOf?: Partial<Record<DriftKey, ReactNode>> }) {
  if (!chk?.on) return null;
  const shown = keys.filter((k) => chk.item(k));
  if (!shown.length) return chk.loading ? <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">กำลังเทียบกับระบบ…</div> : null;
  return (
    <div className="space-y-2 rounded-xl border border-violet-100 bg-white p-2.5">
      <div className="text-[11px] font-medium text-violet-800">เทียบกับระบบ (แท็บนี้)</div>
      {shown.map((k) => (
        <div key={k}>
          <div className="flex items-center gap-1.5 text-xs text-slate-600">{DRIFT_LABEL[k]} <CheckBadge chk={chk} k={k} /></div>
          <CheckSysBox chk={chk} k={k} sys={sysOf?.[k]} onUse={fill[k] ?? null} />
        </div>
      ))}
    </div>
  );
}
