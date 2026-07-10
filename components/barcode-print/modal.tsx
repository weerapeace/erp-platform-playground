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
  DEFAULT_CUSTOM, LAYOUT_TEMPLATES_KEY,
  type PrintOpts, type CustomLayout, type SavedTemplate,
} from "./labels";

type Row = { id: string; code: string; barcode: string; name: string; price: number | null; brandLogo: string | null; qty: number };

export function BarcodePrintModal({ open, onClose, ids, entity }: {
  open: boolean; onClose: () => void; ids: string[]; entity: "skus" | "parent-skus";
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [globalQty, setGlobalQty] = useState(1);
  const [opts, setOpts] = useState<PrintOpts>({
    showQR: true, showBarcode: true, showCode: true, showName: false, showPrice: false, preset: "a4-3x8", custom: null,
    logoMode: "none", logo: null, codeColor: "#000000", showBorder: true,
  });
  const [templates, setTemplates] = useState<SavedTemplate[]>([]);

  // โหลดแม่แบบเลย์เอาต์ที่บันทึกไว้
  useEffect(() => {
    if (!open) return;
    try { const raw = localStorage.getItem(LAYOUT_TEMPLATES_KEY); if (raw) setTemplates(JSON.parse(raw) as SavedTemplate[]); } catch { /* ignore */ }
  }, [open]);
  const saveTemplates = (list: SavedTemplate[]) => { setTemplates(list); try { localStorage.setItem(LAYOUT_TEMPLATES_KEY, JSON.stringify(list)); } catch { /* ignore */ } };

  const usePreset = () => setOpts((o) => ({ ...o, custom: null }));
  const useCustom = () => setOpts((o) => ({ ...o, custom: o.custom ?? { ...DEFAULT_CUSTOM } }));
  const setCustom = (patch: Partial<CustomLayout>) => setOpts((o) => ({ ...o, custom: { ...(o.custom ?? DEFAULT_CUSTOM), ...patch } }));

  const saveAsTemplate = () => {
    if (!opts.custom) return;
    const name = window.prompt("ตั้งชื่อแม่แบบเลย์เอาต์:", `ป้าย ${opts.custom.labelW}×${opts.custom.labelH}mm`);
    if (!name?.trim()) return;
    const list = [...templates.filter((t) => t.name !== name.trim()), { name: name.trim(), layout: { ...opts.custom } }];
    saveTemplates(list); toast.success(`บันทึกแม่แบบ "${name.trim()}" แล้ว`);
  };
  const applyTemplate = (name: string) => { const t = templates.find((x) => x.name === name); if (t) setOpts((o) => ({ ...o, custom: { ...t.layout } })); };
  const deleteTemplate = (name: string) => saveTemplates(templates.filter((t) => t.name !== name));

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
  const isParent = entity === "parent-skus";
  // จำนวนดวงต่อแผ่น (ประมาณ) — สำเร็จรูป หรือ กำหนดเอง A4
  const perPage = useMemo(() => {
    if (opts.custom) {
      if (opts.custom.mode === "roll") return null;   // roll = ต่อเนื่อง ไม่นับแผ่น
      const cols = Math.max(1, Math.floor(opts.custom.cols));
      const rowsPer = Math.max(1, Math.floor((297 - opts.custom.mTop - opts.custom.mBottom + opts.custom.gapY) / (opts.custom.labelH + opts.custom.gapY)));
      return cols * rowsPer;
    }
    const p = getPreset(opts.preset);
    return p.cols * p.rows;
  }, [opts.custom, opts.preset]);
  const sheets = perPage ? (Math.ceil(Math.min(total, MAX_LABELS) / perPage) || 0) : 0;

  const setQty = (id: string, q: number) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, qty: Math.max(0, Math.min(999, Math.floor(q || 0))) } : r)));
  const applyGlobal = () => setRows((rs) => rs.map((r) => ({ ...r, qty: Math.max(0, Math.min(999, Math.floor(globalQty || 0))) })));

  const onLogoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const d = String(reader.result); setOpts((o) => ({ ...o, logo: d, logoMode: "single" })); try { localStorage.setItem(QR_LOGO_KEY, d); } catch { /* ignore */ } };
    reader.readAsDataURL(file);
  };
  const clearLogo = () => { setOpts((o) => ({ ...o, logo: null })); try { localStorage.removeItem(QR_LOGO_KEY); } catch { /* ignore */ } };

  const generate = () => {
    if (!opts.showQR && !opts.showBarcode) { toast.error("เลือกอย่างน้อย 1 อย่าง: QR หรือ บาร์โค้ด"); return; }
    const items = rows.filter((r) => r.qty > 0).map((r) => ({ code: r.code, barcode: r.barcode, name: r.name, price: r.price, qty: r.qty, brandLogo: r.brandLogo }));
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
  const num = (label: string, value: number, on: (v: number) => void) => (
    <label className="flex flex-col gap-0.5">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input type="number" value={value} min={0} step={0.5} onChange={(e) => on(Number(e.target.value))}
        className="h-8 px-2 text-sm border border-slate-200 rounded-md w-full" />
    </label>
  );

  return (
    <ERPModal open={open} onClose={onClose} title="🏷️ พิมพ์บาร์โค้ด / QR" size="lg"
      description={`เลือกไว้ ${ids.length.toLocaleString("th-TH")} รายการ`}
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-sm text-slate-500">รวม <b className="text-slate-800">{total.toLocaleString("th-TH")}</b> ดวง · {opts.custom?.mode === "roll" ? "Roll (ต่อเนื่อง)" : `~${sheets} แผ่น`}</span>
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

        {/* เลย์เอาต์ */}
        <div className="border border-slate-200 rounded-lg p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">เลย์เอาต์</span>
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm">
              <button onClick={usePreset} className={`h-8 px-3 ${!opts.custom ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"}`}>A4 สำเร็จรูป</button>
              <button onClick={useCustom} className={`h-8 px-3 border-l border-slate-200 ${opts.custom ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"}`}>กำหนดเอง</button>
            </div>
          </div>

          {!opts.custom ? (
            <select value={opts.preset} onChange={(e) => setOpts((o) => ({ ...o, preset: e.target.value }))}
              className="w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
              {LABEL_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          ) : (() => { const c = opts.custom!; return (
            <div className="space-y-3">
              {/* แม่แบบ */}
              <div className="flex items-center gap-2 flex-wrap">
                <select value="" onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); e.currentTarget.value = ""; }}
                  className="h-8 px-2 text-sm border border-slate-200 rounded-md bg-white">
                  <option value="">📁 โหลดแม่แบบ…</option>
                  {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                </select>
                <button onClick={saveAsTemplate} className="h-8 px-2.5 text-xs rounded-md border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">💾 บันทึกเป็นแม่แบบ</button>
              </div>
              {templates.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {templates.map((t) => (
                    <span key={t.name} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600">
                      {t.name}<button onClick={() => deleteTemplate(t.name)} title="ลบแม่แบบ" className="text-slate-400 hover:text-red-500">✕</button>
                    </span>
                  ))}
                </div>
              )}
              {/* โหมด */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">พิมพ์ลง</span>
                <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm">
                  <button onClick={() => setCustom({ mode: "a4" })} className={`h-8 px-3 ${c.mode === "a4" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500 hover:bg-slate-50"}`}>กระดาษ A4</button>
                  <button onClick={() => setCustom({ mode: "roll" })} className={`h-8 px-3 border-l border-slate-200 ${c.mode === "roll" ? "bg-indigo-50 text-indigo-700" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Roll sticker</button>
                </div>
              </div>
              {/* ขนาดสติ๊กเกอร์ + ต่อแถว */}
              <div className="grid grid-cols-3 gap-2">
                {num("กว้าง (mm)", c.labelW, (v) => setCustom({ labelW: v }))}
                {num("ยาว/สูง (mm)", c.labelH, (v) => setCustom({ labelH: v }))}
                {num("จำนวนต่อแถว", c.cols, (v) => setCustom({ cols: Math.max(1, Math.floor(v)) }))}
              </div>
              {/* ช่องไฟระหว่างดวง */}
              <div className="grid grid-cols-2 gap-2">
                {num("ช่องไฟ แนวนอน (mm)", c.gapX, (v) => setCustom({ gapX: v }))}
                {num("ช่องไฟ แนวตั้ง (mm)", c.gapY, (v) => setCustom({ gapY: v }))}
              </div>
              {/* ระยะขอบ */}
              <div className="grid grid-cols-4 gap-2">
                {num("ขอบบน", c.mTop, (v) => setCustom({ mTop: v }))}
                {num("ขอบล่าง", c.mBottom, (v) => setCustom({ mBottom: v }))}
                {num("ขอบซ้าย", c.mLeft, (v) => setCustom({ mLeft: v }))}
                {num("ขอบขวา", c.mRight, (v) => setCustom({ mRight: v }))}
              </div>
              {c.mode === "roll" && (
                <div className="grid grid-cols-3 gap-2">
                  {num("ความกว้าง Roll (mm)", c.rollWidth, (v) => setCustom({ rollWidth: v }))}
                </div>
              )}
            </div>
          ); })()}
        </div>

        {/* โลโก้กลาง QR + สี/เส้น */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* โลโก้ */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-500">โลโก้กลาง QR</div>
            <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-sm">
              {(["none", "single", "brand"] as const).map((m, i) => (
                <button key={m} onClick={() => setOpts((o) => ({ ...o, logoMode: m }))}
                  className={`h-8 px-3 ${i > 0 ? "border-l border-slate-200" : ""} ${opts.logoMode === m ? "bg-indigo-50 text-indigo-700 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {m === "none" ? "ไม่มี" : m === "single" ? "อัปโหลดเอง" : "ตามแบรนด์"}
                </button>
              ))}
            </div>
            {opts.logoMode === "single" && (
              <div className="flex items-center gap-2">
                {opts.logo
                  ? <img src={opts.logo} alt="logo" className="w-9 h-9 rounded border border-slate-200 object-contain bg-white" />
                  : <div className="w-9 h-9 rounded border border-dashed border-slate-300 bg-slate-50" />}
                <label className="h-8 px-3 inline-flex items-center text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                  เลือกรูป
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0] ?? null)} />
                </label>
                {opts.logo && <button onClick={clearLogo} className="text-xs text-slate-400 hover:text-red-500">ล้าง</button>}
              </div>
            )}
            {opts.logoMode === "brand" && <div className="text-[11px] text-slate-400">ดึงโลโก้แบรนด์ของสินค้าแต่ละตัวให้อัตโนมัติ (ตัวที่ไม่มีแบรนด์/โลโก้ = ไม่ใส่)</div>}
          </div>
          {/* สี & เส้น */}
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="text-xs font-medium text-slate-500">สี & เส้น</div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              สีโค้ด
              <input type="color" value={opts.codeColor} onChange={(e) => setOpts((o) => ({ ...o, codeColor: e.target.value }))} className="h-7 w-10 border border-slate-200 rounded cursor-pointer" />
              {opts.codeColor.toLowerCase() !== "#000000" && <button onClick={() => setOpts((o) => ({ ...o, codeColor: "#000000" }))} className="text-xs text-slate-400 hover:text-slate-600">รีเซ็ตดำ</button>}
            </label>
            {chk("แสดงเส้นตัด (ขอบดวง)", opts.showBorder, (v) => setOpts((o) => ({ ...o, showBorder: v })))}
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
