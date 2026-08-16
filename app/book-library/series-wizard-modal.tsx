"use client";

/**
 * 📚 เพิ่มทั้งชุด — ลงหนังสือชุดทีเดียวทั้งชุด (เช่น ดาบพิฆาตอสูร 1-23 จบ)
 *
 * ขั้นที่ 1 ตั้งชุด: ชื่อชุด + จำนวนเล่มทั้งหมด + ข้อมูลที่ใช้ร่วมกันทุกเล่ม (ผู้แต่ง/หมวด/ร้าน/ราคาต่อเล่ม)
 * ขั้นที่ 2 ติ๊กว่ามีเล่มไหนแล้ว: เล่มที่ติ๊ก = "มีแล้ว" · ที่เหลือ = "อยากได้" (พิมพ์ช่วงเร็ว ๆ ได้ เช่น 1-10, 15)
 * ชื่อเล่มตั้งให้อัตโนมัติตามรูปแบบ "<ชื่อชุด> เล่ม <เลข>"
 *
 * ของกลางที่ใช้: ERPModal · MoneyInput · useToast · บันทึกผ่าน /api/master-v2/book_library/import
 */

import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

const MAX_VOLUMES = 200;

/** "1-10, 12, 15-18" → {1..10,12,15..18} — ผู้ใช้พิมพ์เร็วกว่าไล่กดทีละเล่ม */
function parseRanges(input: string, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of input.split(/[,\s]+/)) {
    if (!part) continue;
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) out.add(i);
  }
  return out;
}

export function SeriesWizardModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);
  const [series, setSeries] = useState("");
  const [total, setTotal] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [store, setStore] = useState("");
  const [price, setPrice] = useState<string>("");
  const [owned, setOwned] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [saving, setSaving] = useState(false);
  // เล่มที่ "มีในคลังอยู่แล้ว" (เช็กตอนเข้าขั้น 2) — จะไม่สร้างซ้ำ
  const [dupes, setDupes] = useState<Map<number, string>>(new Map());   // เลขเล่ม → สถานะเดิมในคลัง
  const [checking, setChecking] = useState(false);

  const n = Math.min(MAX_VOLUMES, Math.max(0, parseInt(total || "0", 10) || 0));
  const volumes = useMemo(() => Array.from({ length: n }, (_, i) => i + 1), [n]);
  const titleOf = (v: number) => `${series.trim()} เล่ม ${v}`;

  const reset = () => {
    setStep(1); setSeries(""); setTotal(""); setAuthor(""); setCategory("");
    setStore(""); setPrice(""); setOwned(new Set()); setRangeText(""); setSaving(false);
    setDupes(new Map()); setChecking(false);
  };
  const close = () => { reset(); onClose(); };

  const toggle = (v: number) => {
    if (dupes.has(v)) return;   // มีในคลังแล้ว — แตะไม่ได้
    setOwned((prev) => { const s = new Set(prev); if (s.has(v)) s.delete(v); else s.add(v); return s; });
  };

  const applyRange = () => {
    const picked = parseRanges(rangeText, n);
    if (picked.size === 0) { toast.warning("พิมพ์เลขเล่มที่มี เช่น 1-10, 12, 15-18"); return; }
    for (const v of dupes.keys()) picked.delete(v);
    setOwned(picked);
    toast.success(`ติ๊กให้แล้ว ${picked.size} เล่ม`);
  };

  /** เช็กว่าเล่มไหนมีในคลังแล้ว (เทียบด้วยชื่อเล่มแบบเดียวกับที่ฐานข้อมูลกันซ้ำ) */
  const checkDupes = async (count: number) => {
    setChecking(true);
    try {
      const list = Array.from({ length: count }, (_, i) => titleOf(i + 1));
      const res = await apiFetch("/api/book-library/check-duplicates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles: list }),
      });
      const j = await res.json();
      const found = (j.existing ?? {}) as Record<string, { status: string }>;
      const map = new Map<number, string>();
      list.forEach((t, i) => { if (found[t]) map.set(i + 1, found[t].status); });
      setDupes(map);
      setOwned((prev) => { const s = new Set(prev); for (const v of map.keys()) s.delete(v); return s; });
      if (map.size > 0) toast.info(`ชุดนี้มีในคลังแล้ว ${map.size} เล่ม — จะข้ามให้ ไม่สร้างซ้ำ`);
    } catch { /* เช็กไม่ได้ก็ปล่อยผ่าน — ฐานข้อมูลกันซ้ำให้อีกชั้น */ }
    finally { setChecking(false); }
  };

  const next = () => {
    if (!series.trim()) { toast.warning("ใส่ชื่อชุดก่อน"); return; }
    if (n < 1) { toast.warning("ใส่จำนวนเล่มทั้งหมด (1-200)"); return; }
    setStep(2);
    void checkDupes(n);
  };

  const save = async () => {
    setSaving(true);
    try {
      const priceNum = price === "" ? null : Number(price);
      const rows = volumes.filter((v) => !dupes.has(v)).map((v) => {
        const row: Record<string, unknown> = {
          title: titleOf(v),
          series: series.trim(),
          volume: String(v),
          status: owned.has(v) ? "owned" : "wishlist",
        };
        if (author.trim()) row.author = author.trim();
        if (category.trim()) row.category = category.trim();
        if (store.trim()) row.store = store.trim();
        if (priceNum != null && priceNum > 0) row.price = priceNum;
        return row;
      });
      if (rows.length === 0) { toast.warning("ชุดนี้มีครบในคลังแล้ว ไม่มีเล่มใหม่ให้เพิ่ม"); return; }
      const res = await apiFetch("/api/master-v2/book_library/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, mode: "create", actor: user?.name ?? user?.email }),
      });
      const j = await res.json();
      if (j.error) { toast.error(String(j.error)); return; }
      const failed = (j.failed ?? []) as { error: string }[];
      if (failed.length > 0) toast.warning(`ลงได้ ${j.created ?? 0} เล่ม · ไม่สำเร็จ ${failed.length} เล่ม (${failed[0].error})`);
      else toast.success(`ลงชุด "${series.trim()}" แล้ว ${j.created ?? rows.length} เล่ม`);
      onCreated();
      close();
    } catch (e) {
      toast.error((e as Error).message ?? "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const field = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <ERPModal
      open={open}
      onClose={close}
      size="lg"
      title="📚 เพิ่มทั้งชุด"
      description={step === 1
        ? "ลงหนังสือชุดทีเดียวทั้งชุด — ใส่ชื่อชุดกับจำนวนเล่ม แล้วระบบตั้งชื่อเล่มให้เอง"
        : `ติ๊กเล่มที่มีอยู่แล้ว — เล่มที่ไม่ติ๊กจะบันทึกเป็น "อยากได้"`}
      hasUnsavedChanges={!!series.trim() && !saving}
      storageKey="book-library-series-wizard"
      footer={
        <>
          <button onClick={close} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          {step === 2 && (
            <button onClick={() => setStep(1)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">← ย้อนกลับ</button>
          )}
          {step === 1
            ? <button onClick={next}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">ถัดไป →</button>
            : <button onClick={save} disabled={saving || checking || n - dupes.size === 0}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : `บันทึก ${n - dupes.size} เล่ม`}
              </button>}
        </>
      }
    >
      {step === 1 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className={label}>ชื่อชุด <span className="text-red-500">*</span></label>
              <input autoFocus value={series} onChange={(e) => setSeries(e.target.value)}
                placeholder="เช่น ดาบพิฆาตอสูร" className={field} />
            </div>
            <div>
              <label className={label}>จำนวนเล่มทั้งหมด <span className="text-red-500">*</span></label>
              <input value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric" placeholder="23" className={field} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>ผู้แต่ง</label>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="ใส่ครั้งเดียว ใช้ทุกเล่ม" className={field} />
            </div>
            <div>
              <label className={label}>หมวด</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="เช่น การ์ตูน" className={field} />
            </div>
            <div>
              <label className={label}>ร้านที่ซื้อ</label>
              <input value={store} onChange={(e) => setStore(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>ราคาต่อเล่ม</label>
              <MoneyInput value={price} onChange={setPrice} placeholder="ใส่ก็ได้ ไม่ใส่ก็ได้" className={field} />
            </div>
          </div>
          {series.trim() && n > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-sm text-slate-600">
              จะสร้าง <b className="text-slate-800">{n} เล่ม</b> ชื่อ:{" "}
              <span className="text-slate-800">{titleOf(1)}</span> … <span className="text-slate-800">{titleOf(n)}</span>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input value={rangeText} onChange={(e) => setRangeText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyRange(); }}
              placeholder="พิมพ์เล่มที่มี เช่น 1-10, 12, 15-18" className={`${field} w-full sm:w-72`} />
            <button onClick={applyRange}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ติ๊กให้</button>
            <button onClick={() => setOwned(new Set(volumes))}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">มีครบทุกเล่ม</button>
            <button onClick={() => setOwned(new Set())}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-400 hover:bg-slate-50">ล้างทั้งหมด</button>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[42vh] overflow-auto p-1">
            {volumes.map((v) => {
              const dup = dupes.has(v);
              const on = owned.has(v);
              return (
                <button key={v} onClick={() => toggle(v)} disabled={dup}
                  title={dup ? `${titleOf(v)} — มีในคลังแล้ว (จะไม่สร้างซ้ำ)` : titleOf(v)}
                  className={`w-11 h-11 rounded-lg border text-sm tabular-nums transition-colors
                    ${dup ? "bg-slate-100 border-slate-200 text-slate-300 line-through cursor-not-allowed"
                      : on ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium"
                           : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"}`}>
                  {v}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {checking && <span className="text-slate-400">กำลังเช็กเล่มที่มีอยู่แล้ว…</span>}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />มีแล้ว <b>{owned.size}</b> เล่ม
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />อยากได้ <b>{n - owned.size - dupes.size}</b> เล่ม
            </span>
            {dupes.size > 0 && (
              <span className="inline-flex items-center gap-1.5 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-300" />ข้าม <b>{dupes.size}</b> เล่ม (มีในคลังแล้ว)
              </span>
            )}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
