"use client";

/**
 * BankPicker — ของกลาง "เลือกธนาคาร" (พิมพ์ค้นหาได้ + เพิ่มธนาคารใหม่ได้)
 *
 * ใช้เมื่อไหร่: ทุกหน้าที่ต้องกรอกชื่อธนาคาร (บัญชีพนักงาน, บัญชีร้าน, บิลโอนเงิน)
 * ห้ามใช้เมื่อไหร่: ถ้าต้องการช่องพิมพ์อิสระจริง ๆ ที่ไม่อยากคุมชื่อ (จะเกิดชื่อซ้ำสะกดต่าง)
 *
 * ทำไมต้องมี: ข้อมูลเดิมมี "ธนาคารไทยพาณิชย์ (SCB)" กับ "SCB" ปนกัน → ทำไฟล์ส่งธนาคารแยกกลุ่มไม่ตรง
 *
 * onChange คืน (ชื่อธนาคาร, จำนวนหลักเลขบัญชีของธนาคารนั้น) เพื่อให้ช่องเลขบัญชีรู้ว่ากรอกครบยัง
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

export type BankOption = { id: string; name: string; code?: string | null; account_digits?: number | null };

let cache: BankOption[] | null = null;   // โหลดครั้งเดียวต่อการเปิดเว็บ (รายชื่อธนาคารไม่ค่อยเปลี่ยน)

export function bankAccountDigits(bankName: string, banks: BankOption[]): number {
  const hit = banks.find((b) => b.name === bankName);
  return Number(hit?.account_digits) > 0 ? Number(hit?.account_digits) : 10;
}

/** รายชื่อธนาคาร (แชร์ cache กับ BankPicker) — ใช้หาจำนวนหลักเลขบัญชีของธนาคารที่เลือกไว้ */
export function useBanks(country = "TH"): BankOption[] {
  const [banks, setBanks] = useState<BankOption[]>(cache ?? []);
  useEffect(() => {
    if (cache) { setBanks(cache); return; }
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/payroll/banks?country=${encodeURIComponent(country)}`);
        const j = await r.json();
        if (!alive) return;
        cache = (j?.data ?? []) as BankOption[];
        setBanks(cache);
      } catch { /* ไม่มีรายชื่อก็ยังกรอกต่อได้ */ }
    })();
    return () => { alive = false; };
  }, [country]);
  return banks;
}

export function BankPicker({
  value, onChange, country = "TH", disabled, allowCreate = true, allowFreeText = false, placeholder = "เลือกธนาคาร / พิมพ์ค้นหา",
}: {
  value: string;
  onChange: (name: string, digits: number) => void;
  country?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  /** ให้ใช้ชื่อที่พิมพ์ได้เลยโดยไม่ต้องเพิ่มเข้าทะเบียนธนาคาร — สำหรับเจ้าหนี้ที่ไม่ใช่ธนาคาร
   *  (บุคคล / บริษัทอื่น / ลีสซิ่ง) เช่น ช่อง "ผู้ให้กู้" ของสัญญาเงินกู้ · ตั้งจากทะเบียนฟิลด์ options.picker_free_text = true */
  allowFreeText?: boolean;
  placeholder?: string;
}) {
  const [banks, setBanks] = useState<BankOption[]>(cache ?? []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (cache) { setBanks(cache); return; }
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/payroll/banks?country=${encodeURIComponent(country)}`);
        const j = await r.json();
        if (!alive) return;
        const rows = (j?.data ?? []) as BankOption[];
        cache = rows; setBanks(rows);
      } catch { /* ปล่อยให้พิมพ์เองต่อได้ */ }
    })();
    return () => { alive = false; };
  }, [country]);

  // คลิกข้างนอก = ปิด
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return banks;
    // ค้นเป๊ะก่อน แล้วค่อยคำที่มีอยู่ข้างใน (ตามมาตรฐานค้นหาของระบบ)
    const exact = banks.filter((b) => b.name.toLowerCase() === q || (b.code ?? "").toLowerCase() === q);
    const starts = banks.filter((b) => !exact.includes(b) && b.name.toLowerCase().startsWith(q));
    const has = banks.filter((b) => !exact.includes(b) && !starts.includes(b)
      && (b.name.toLowerCase().includes(q) || (b.code ?? "").toLowerCase().includes(q)));
    return [...exact, ...starts, ...has];
  }, [banks, q]);

  const canCreate = allowCreate && !!q && !banks.some((b) => b.name.toLowerCase() === q);
  const canFreeText = allowFreeText && !!q && !banks.some((b) => b.name.toLowerCase() === q);

  const useTyped = () => {
    const name = query.trim();
    if (!name) return;
    onChange(name, 10);
    setOpen(false); setQuery("");
  };

  const pick = (b: BankOption) => {
    onChange(b.name, Number(b.account_digits) > 0 ? Number(b.account_digits) : 10);
    setOpen(false); setQuery("");
  };

  const createBank = async () => {
    const name = query.trim();
    if (!name) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch("/api/payroll/banks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, country }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "เพิ่มธนาคารไม่สำเร็จ");
      const row = j.data as BankOption;
      const next = [...banks.filter((b) => b.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name, "th"));
      cache = next; setBanks(next);
      pick(row);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เพิ่มธนาคารไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button" disabled={disabled} onClick={() => setOpen((v) => !v)}
        className={`h-9 w-full rounded-lg border px-3 text-left text-sm ${disabled ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}
      >
        {value ? <span className="truncate">{value}</span> : <span className="text-slate-400">{placeholder}</span>}
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อธนาคาร เช่น กสิกร หรือ SCB"
              className="h-8 w-full rounded border border-slate-200 px-2 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <div className="max-h-60 overflow-auto">
            {filtered.map((b) => (
              <button
                key={b.id} type="button" onClick={() => pick(b)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${b.name === value ? "bg-slate-50 font-medium" : ""}`}
              >
                <span className="truncate">{b.name}</span>
                {b.code && <span className="shrink-0 font-mono text-[11px] text-slate-400">{b.code}</span>}
              </button>
            ))}
            {!filtered.length && !canCreate && !canFreeText && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">ไม่พบธนาคารที่ค้นหา</div>
            )}
          </div>
          {canFreeText && (
            <button
              type="button" onClick={useTyped}
              className="w-full border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {`✏️ ใช้ชื่อ “${query.trim()}” ตามที่พิมพ์ (ไม่ใช่ธนาคาร — ไม่เพิ่มเข้าทะเบียน)`}
            </button>
          )}
          {canCreate && (
            <button
              type="button" onClick={() => void createBank()} disabled={busy}
              className="w-full border-t border-slate-100 bg-emerald-50 px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              {busy ? "กำลังเพิ่ม…" : `➕ เพิ่ม “${query.trim()}” เข้าทะเบียนธนาคาร`}
            </button>
          )}
          {err && <div className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}
        </div>
      )}
    </div>
  );
}

export default BankPicker;
