"use client";

/**
 * SupplierPicker — ของกลาง: ช่องเลือกร้าน (ผู้จำหน่าย) แบบ "พิมพ์ค้นหาได้"
 * - แทน <select> ธรรมดา (ร้านเยอะเลื่อนยาก)
 * - value = id ร้าน, onChange(id, name)
 * - onAddNew (ถ้ามี) → โชว์ "+ เพิ่มร้านใหม่" ท้ายรายการ
 * - dropdown เรนเดอร์ผ่าน portal + fixed position → ไม่โดนกรอบ popup ตัด
 * - "⏱ เคยใช้ล่าสุด" อยู่บนสุด (ของกลาง lib/recent-picks — แชร์ประวัติกับ SupplierPicker ตัวอื่น)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RECENT_KEYS, useRecentPicks } from "@/lib/recent-picks";

type Supplier = { id: string; name: string; cn?: boolean };   // cn = ร้านจีน

export function SupplierPicker({ value, onChange, suppliers, onAddNew, placeholder = "— เลือกผู้จำหน่าย —", disabled }: {
  value: string;
  onChange: (id: string, name: string) => void;
  suppliers: Supplier[];
  onAddNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "th" | "cn">("all");   // กรองร้านไทย/จีน
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const { recent, remember } = useRecentPicks<Supplier>(RECENT_KEYS.suppliers, open);   // เคยใช้ล่าสุด (ของกลาง)
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const sel = suppliers.find((s) => s.id === value);
  const ql = q.trim().toLowerCase();
  const hasKinds = suppliers.some((s) => s.cn);   // มีร้านจีนอย่างน้อย 1 → โชว์ badge กรอง
  const inKind = (s: Supplier) => kind === "all" ? true : kind === "cn" ? !!s.cn : !s.cn;
  // เคยใช้ล่าสุด — เอาเฉพาะร้านที่ยังอยู่ในทะเบียน + ใช้ชื่อล่าสุดจากทะเบียน (กันร้านถูกลบ/เปลี่ยนชื่อ)
  const recentShown = useMemo(() => (ql ? [] : recent
    .map((r) => suppliers.find((s) => s.id === r.id))
    .filter((s): s is Supplier => !!s && inKind(s))
    .slice(0, 5)), [recent, suppliers, ql, kind]);   // eslint-disable-line react-hooks/exhaustive-deps
  const recentIds = new Set(recentShown.map((s) => s.id));
  const filtered = useMemo(() => suppliers
    .filter((s) => (ql ? s.name.toLowerCase().includes(ql) : true))
    .filter((s) => kind === "all" ? true : kind === "cn" ? !!s.cn : !s.cn)
    .slice(0, 300), [suppliers, ql, kind]);

  // เลือกร้าน → จำไว้เป็น "เคยใช้ล่าสุด" ให้ทุก picker ร้านเห็นเหมือนกัน
  const pick = (s: Supplier) => { remember({ id: s.id, name: s.name, cn: s.cn }); onChange(s.id, s.name); setOpen(false); };

  const openPanel = () => {
    if (disabled) return;
    if (btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setRect({ left: r.left, top: r.bottom + 4, width: r.width }); }
    setQ(""); setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScroll);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("resize", onScroll); };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openPanel())}
        className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md bg-white text-left flex items-center justify-between disabled:opacity-50">
        <span className={sel ? "text-slate-700 truncate" : "text-slate-400 truncate"}>{sel ? sel.name : placeholder}</span>
        <span className="text-slate-400 ml-2 shrink-0">▾</span>
      </button>
      {open && rect && createPortal(
        <div ref={panelRef} style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, zIndex: 300 }}
          className="bg-white border border-slate-200 rounded-md shadow-xl max-h-72 flex flex-col">
          <div className="p-1.5 border-b border-slate-100 space-y-1.5">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ค้นหาร้าน…" className="w-full h-8 px-2 text-sm border border-slate-200 rounded" />
            {hasKinds && (
              <div className="flex gap-1">
                {([["all", "ทั้งหมด"], ["th", "🇹🇭 ร้านไทย"], ["cn", "🛒 ร้านจีน"]] as const).map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className={`h-6 px-2 text-[11px] rounded-full border ${kind === k ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{lbl}</button>
                ))}
              </div>
            )}
          </div>
          <div className="overflow-y-auto">
            {value && <button type="button" onClick={() => { onChange("", ""); setOpen(false); }} className="w-full px-3 py-1.5 text-sm text-left text-slate-400 hover:bg-slate-50">— ไม่เลือก —</button>}
            {recentShown.length > 0 && (
              <>
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400">⏱ เคยใช้ล่าสุด</div>
                {recentShown.map((s) => (
                  <button key={"recent-" + s.id} type="button" onClick={() => pick(s)}
                    className={`w-full px-3 py-1.5 text-sm text-left hover:bg-blue-50 truncate ${s.id === value ? "bg-blue-50/60 text-blue-700" : "text-slate-700"}`}>
                    <span className="text-slate-300 mr-1">↺</span>{s.name}
                  </button>
                ))}
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-slate-400 border-t border-slate-100">ร้านทั้งหมด</div>
              </>
            )}
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-slate-300 text-center">ไม่พบร้าน</div>}
            {filtered.filter((s) => !recentIds.has(s.id)).map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s)}
                className={`w-full px-3 py-1.5 text-sm text-left hover:bg-blue-50 truncate ${s.id === value ? "bg-blue-50/60 text-blue-700" : "text-slate-700"}`}>{s.name}</button>
            ))}
          </div>
          {onAddNew && (
            <button type="button" onClick={() => { setOpen(false); onAddNew(); }}
              className="px-3 py-2 text-sm text-left text-blue-600 border-t border-slate-100 hover:bg-blue-50 shrink-0">+ เพิ่มร้านใหม่</button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
