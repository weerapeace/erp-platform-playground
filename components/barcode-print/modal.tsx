"use client";

/**
 * ป๊อปอัปตั้งค่าพิมพ์บาร์โค้ด/QR แบบ batch (เฟส 1)
 * รับ ids ที่เลือก → ดึงข้อมูล (/api/skus/for-print) → ตั้งค่า → ส่ง payload ไปหน้าพิมพ์ /print/barcode-labels
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import {
  LABEL_PRESETS, getPreset, PRINT_PAYLOAD_KEY, QR_LOGO_KEY, MAX_LABELS,
  type PrintOpts,
} from "./labels";

type Row = { id: string; code: string; barcode: string; name: string; price: number | null; qty: number };

export function BarcodePrintModal({ open, onClose, ids, entity }: {
  open: boolean; onClose: () => void; ids: string[]; entity: "skus" | "parent-skus";
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [globalQty, setGlobalQty] = useState(1);
  const [opts, setOpts] = useState<PrintOpts>({
    showQR: true, showBarcode: true, showCode: true, showName: false, showPrice: false, preset: "a4-3x8", logo: null,
  });

  const idsKey = ids.join(",");
  useEffect(() => {
    if (!open) return;
    setLoading(true); setRows([]);
    apiFetch("/api/skus/for-print", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, entity }) })
      .then((r) => r.json())
      .then((j) => setRows(((j.data ?? []) as Omit<Row, "qty">[]).map((d) => ({ ...d, qty: 1 }))))
      .catch(() => toast.error("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
    try { const l = localStorage.getItem(QR_LOGO_KEY); if (l) setOpts((o) => ({ ...o, logo: l })); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey, entity]);

  const total = useMemo(() => rows.reduce((s, r) => s + (r.qty > 0 ? r.qty : 0), 0), [rows]);
  const preset = getPreset(opts.preset);
  const sheets = Math.ceil(Math.min(total, MAX_LABELS) / (preset.cols * preset.rows)) || 0;
  const isParent = entity === "parent-skus";

  const setQty = (id: string, q: number) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, qty: Math.max(0, Math.min(999, Math.floor(q || 0))) } : r)));
  const applyGlobal = () => setRows((rs) => rs.map((r) => ({ ...r, qty: Math.max(0, Math.min(999, Math.floor(globalQty || 0))) })));

  const onLogoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const d = String(reader.result); setOpts((o) => ({ ...o, logo: d })); try { localStorage.setItem(QR_LOGO_KEY, d); } catch { /* ignore */ } };
    reader.readAsDataURL(file);
  };
  const clearLogo = () => { setOpts((o) => ({ ...o, logo: null })); try { localStorage.removeItem(QR_LOGO_KEY); } catch { /* ignore */ } };

  const generate = () => {
    if (!opts.showQR && !opts.showBarcode) { toast.error("เลือกอย่างน้อย 1 อย่าง: QR หรือ บาร์โค้ด"); return; }
    const items = rows.filter((r) => r.qty > 0).map((r) => ({ code: r.code, barcode: r.barcode, name: r.name, price: r.price, qty: r.qty }));
    if (items.length === 0) { toast.error("ยังไม่มีรายการที่จะพิมพ์ (ใส่จำนวน ≥ 1)"); return; }
    if (total > MAX_LABELS) toast.warning(`เกิน ${MAX_LABELS.toLocaleString("th-TH")} ดวง — จะพิมพ์แค่ ${MAX_LABELS.toLocaleString("th-TH")} ดวงแรก`);
    try {
      sessionStorage.setItem(PRINT_PAYLOAD_KEY, JSON.stringify({ items, opts }));
      window.open("/print/barcode-labels", "_blank");
      onClose();
    } catch { toast.error("สร้างหน้าพิมพ์ไม่สำเร็จ (ข้อมูลเยอะเกิน)"); }
  };

  const chk = (label: string, val: boolean, on: (v: boolean) => void, note?: string) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={val} onChange={(e) => on(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
      {label}{note && <span className="text-xs text-slate-400">{note}</span>}
    </label>
  );

  return (
    <ERPModal open={open} onClose={onClose} title="🏷️ พิมพ์บาร์โค้ด / QR" size="lg"
      description={`เลือกไว้ ${ids.length.toLocaleString("th-TH")} รายการ`}
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-sm text-slate-500">รวม <b className="text-slate-800">{total.toLocaleString("th-TH")}</b> ดวง · ~{sheets} แผ่น</span>
          <div className="flex-1" />
          <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={generate} disabled={loading || total === 0}
            className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-40">🖨️ สร้างหน้าพิมพ์</button>
        </div>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* โค้ดที่พิมพ์ */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-500">โค้ดที่พิมพ์</div>
            {chk("QR Code", opts.showQR, (v) => setOpts((o) => ({ ...o, showQR: v })))}
            {chk("บาร์โค้ด (Code128)", opts.showBarcode, (v) => setOpts((o) => ({ ...o, showBarcode: v })), "สแกนรหัส SKU ได้")}
          </div>
          {/* โชว์ใต้โค้ด */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-500">โชว์ใต้โค้ด</div>
            {chk("รหัส SKU", opts.showCode, (v) => setOpts((o) => ({ ...o, showCode: v })))}
            {chk("ชื่อสินค้า", opts.showName, (v) => setOpts((o) => ({ ...o, showName: v })))}
            {chk("ราคาขาย", opts.showPrice, (v) => setOpts((o) => ({ ...o, showPrice: v })), isParent ? "(Parent ไม่มีราคา)" : "(เฉพาะตัวที่มีราคา)")}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* เลย์เอาต์ */}
          <div>
            <label className="text-xs font-medium text-slate-500">เลย์เอาต์กระดาษ (A4)</label>
            <select value={opts.preset} onChange={(e) => setOpts((o) => ({ ...o, preset: e.target.value }))}
              className="mt-1 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {/* โลโก้กลาง QR */}
          <div>
            <label className="text-xs font-medium text-slate-500">โลโก้กลาง QR (ไม่บังคับ)</label>
            <div className="mt-1 flex items-center gap-2">
              {opts.logo
                ? <img src={opts.logo} alt="logo" className="w-9 h-9 rounded border border-slate-200 object-contain bg-white" />
                : <div className="w-9 h-9 rounded border border-dashed border-slate-300 bg-slate-50" />}
              <label className="h-9 px-3 inline-flex items-center text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                เลือกรูป
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)} />
              </label>
              {opts.logo && <button onClick={clearLogo} className="text-xs text-slate-400 hover:text-red-500">ล้าง</button>}
            </div>
          </div>
        </div>

        {/* จำนวน */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">ตั้งจำนวนทุกตัว =</span>
          <input type="number" min={0} max={999} value={globalQty} onChange={(e) => setGlobalQty(Number(e.target.value))}
            className="w-20 h-9 px-2 text-sm border border-slate-200 rounded-lg" />
          <button onClick={applyGlobal} className="h-9 px-3 text-sm rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">ตั้งทั้งหมด</button>
        </div>

        {/* รายการ + จำนวนต่อตัว */}
        <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-100">
          {loading && <div className="p-4 text-center text-sm text-slate-400">กำลังโหลด…</div>}
          {!loading && rows.length === 0 && <div className="p-4 text-center text-sm text-slate-400">ไม่มีรายการ</div>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="font-mono text-xs text-slate-700 shrink-0">{r.code}</span>
              <span className="text-xs text-slate-400 truncate flex-1">{r.name}</span>
              {!isParent && r.price != null && r.price > 0 && <span className="text-xs text-slate-500 shrink-0">฿{Number(r.price).toLocaleString("th-TH")}</span>}
              <input type="number" min={0} max={999} value={r.qty} onChange={(e) => setQty(r.id, Number(e.target.value))}
                className="w-16 h-8 px-2 text-sm border border-slate-200 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </ERPModal>
  );
}
