"use client";

/**
 * Popup: คัดลอกงานเหมาจากสินค้าตัวอื่น (บอร์ดจ่ายงาน → แท็บงานเหมา)
 *
 * ใช้ตอน "สินค้าตัวนี้ยังไม่มีงานเหมา แต่รุ่นพี่น้อง/รุ่นอื่นมีอยู่แล้ว" — ไม่ต้องนั่งเพิ่มทีละงาน
 *  · เลือกต้นทางได้ 2 ทาง: รุ่นเดียวกัน (Parent SKU เดียวกัน) แบบกดเลือก หรือค้นหา SKU ไหนก็ได้
 *  · เลือกได้ว่าจะเอางานไหนบ้าง · เลือกได้ว่าจะใส่ให้ทุกตัวในรุ่นเดียวกันด้วยไหม
 *  · งานที่ปลายทางมีชื่อซ้ำอยู่แล้วจะข้ามให้ (ไม่ทับของเดิม)
 *
 * ของกลาง: ERPModal · SkuPicker · apiSave/useToast · /api/piecework/copy
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { apiSave } from "@/lib/save-toast";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";

type Line = { id: string; job_name: string; rate: number; qty_per: number; is_detail: boolean; note: string | null };
type Sibling = { code: string; bom_code: string | null; piece_count: number };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");

export function CopyPieceworkModal({ open, productSku, productName, onClose, onCopied }: {
  open: boolean; productSku: string | null; productName?: string | null; onClose: () => void; onCopied: () => void;
}) {
  const toast = useToast();
  const [sibs, setSibs] = useState<Sibling[]>([]);
  const [fromSku, setFromSku] = useState<string>("");
  const [picked, setPicked] = useState<SkuPickerValue | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [allSiblings, setAllSiblings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !productSku) return;
    setFromSku(""); setPicked(null); setLines([]); setChecked(new Set()); setAllSiblings(false);
    void (async () => {
      try {
        const r = await apiFetch(`/api/piecework/copy?siblings=${encodeURIComponent(productSku)}`);
        const j = await r.json(); setSibs((j.data ?? []) as Sibling[]);
      } catch { setSibs([]); }
    })();
  }, [open, productSku]);

  // โหลดงานเหมาของต้นทางที่เลือก
  const loadFrom = useCallback(async (sku: string) => {
    setFromSku(sku); setLines([]); setChecked(new Set());
    if (!sku) return;
    setLoading(true);
    try {
      const r = await apiFetch(`/api/piecework/copy?sku=${encodeURIComponent(sku)}`);
      const j = await r.json();
      const rows = (j.data ?? []) as Line[];
      setLines(rows);
      setChecked(new Set(rows.map((l) => l.job_name)));   // ค่าเริ่มต้น = เอาทั้งหมด
      if (rows.length === 0) toast.error(`${sku} ไม่มีงานเหมาใน BOM`);
    } catch { toast.error("โหลดงานเหมาของต้นทางไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [toast]);

  const submit = async () => {
    if (!productSku || !fromSku) { toast.error("เลือกสินค้าต้นทางก่อน"); return; }
    const names = lines.filter((l) => checked.has(l.job_name)).map((l) => l.job_name);
    if (!names.length) { toast.error("ติ๊กงานที่จะคัดลอกอย่างน้อย 1 งาน"); return; }
    setSaving(true);
    const r = await apiSave<{ added?: number; targets?: number }>(toast, "/api/piecework/copy",
      { method: "POST", body: { from_sku: fromSku, to_sku: productSku, job_names: names, all_siblings: allSiblings } },
      { quiet: true, fail: "คัดลอกไม่สำเร็จ" });
    setSaving(false);
    if (r.ok) {
      const added = r.data?.added ?? 0;
      if (added > 0) toast.success(`เพิ่มงานเหมา ${added} รายการ${allSiblings ? ` (${r.data?.targets ?? 1} รุ่น)` : ""}`);
      else toast.error("ปลายทางมีงานเหล่านี้อยู่แล้ว — ไม่ได้เพิ่มซ้ำ");
      onCopied(); onClose();
    } else {
      toast.error(r.error ?? "คัดลอกไม่สำเร็จ");
    }
  };

  const total = lines.filter((l) => checked.has(l.job_name)).reduce((n, l) => n + (Number(l.rate) || 0) * (Number(l.qty_per) || 1), 0);

  return (
    <ERPModal open={open} onClose={onClose} size="md" title="📋 คัดลอกงานเหมาจากสินค้าอื่น"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 mr-auto">ยกเลิก</button>
        <button onClick={() => void submit()} disabled={saving || !fromSku || checked.size === 0}
          className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "กำลังคัดลอก…" : `คัดลอก ${checked.size} งาน`}
        </button>
      </>}>
      <div className="space-y-3">
        <p className="text-[12px] text-slate-500">คัดลอกเข้า: <b className="text-slate-700">{productSku}</b>{productName ? ` · ${productName}` : ""}</p>

        {sibs.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">รุ่นเดียวกัน (กดเลือกเพื่อคัดลอกจากตัวนั้น)</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {sibs.map((s) => (
                <button key={s.code} type="button" onClick={() => void loadFrom(s.code)} disabled={s.piece_count === 0}
                  title={s.piece_count === 0 ? "ตัวนี้ยังไม่มีงานเหมา" : `มีงานเหมา ${s.piece_count} รายการ`}
                  className={`h-7 px-2 text-[11px] rounded-lg border ${fromSku === s.code ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                    : s.piece_count > 0 ? "border-slate-200 bg-white text-slate-600 hover:border-blue-300" : "border-slate-100 bg-slate-50 text-slate-300"}`}>
                  {s.code}{s.piece_count > 0 ? ` · ${s.piece_count}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">หรือค้นหาสินค้าตัวอื่น</label>
          <SkuPicker value={picked} onChange={(v) => { setPicked(v); if (v?.code) void loadFrom(v.code); }} placeholder="ค้นหา SKU ต้นทาง…" />
        </div>

        {loading && <p className="text-[12px] text-slate-400">กำลังโหลดงานเหมาของต้นทาง…</p>}

        {lines.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500">
              <span>งานเหมาของ <b className="text-slate-700">{fromSku}</b> ({lines.length} รายการ)</span>
              <span>รวม/ใบ <b className="text-indigo-700">฿{fmt(total)}</b></span>
            </div>
            <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
              {lines.map((l) => (
                <label key={l.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50/60 cursor-pointer">
                  <input type="checkbox" checked={checked.has(l.job_name)} className="w-4 h-4 accent-blue-600"
                    onChange={(e) => setChecked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(l.job_name); else n.delete(l.job_name); return n; })} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-700 truncate">{l.job_name}{l.is_detail && <span className="ml-1 text-[10px] text-amber-600">★ละเอียด</span>}</span>
                    <span className="block text-[10px] text-slate-400">{fmt(l.rate)} ฿/ชิ้น × {fmt(l.qty_per)} ต่อใบ</span>
                  </span>
                  <span className="text-sm tabular-nums text-slate-600">฿{fmt((Number(l.rate) || 0) * (Number(l.qty_per) || 1))}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={allSiblings} onChange={(e) => setAllSiblings(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          📌 ใส่ให้ทุกตัวในรุ่นเดียวกัน (Parent SKU เดียวกัน)
        </label>
        <p className="text-[11px] text-slate-400">งานที่ปลายทางมีชื่อซ้ำอยู่แล้วจะข้ามให้ ไม่ทับของเดิม · ตัวที่ยังไม่มี BOM จะถูกข้าม</p>
      </div>
    </ERPModal>
  );
}
