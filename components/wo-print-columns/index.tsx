"use client";

/**
 * ของกลาง — "⚙ ตั้งค่าตาราง" ของใบสั่งงานผลิต (คอลัมน์ + ความกว้าง + ช่องรูป)
 *  • useWoPrintColumns()  โหลดค่ากลางของระบบ (ui_config key "wo_print_columns") → ใช้กับหน้าพิมพ์เดี่ยว/พิมพ์รวม
 *  • <WoColumnSettings/>  ปุ่ม + "แผงลอย" ตั้งค่า (ไม่ใช่ป๊อปทึบ) — เจ้าของอยากเห็นเอกสารระหว่างปรับ:
 *      ลากย้ายตำแหน่งได้ · ย่อเหลือแถบเดียว · ปรับความจาง (โปร่งใส) · เห็นผลบนเอกสารทันทีก่อนบันทึก
 * ค่าที่ตั้งเป็น "ค่ากลาง" — ทุกคนพิมพ์ได้หน้าตาเดียวกัน (ต้องมีสิทธิ์ products.edit ถึงจะบันทึกได้)
 * ของกลางที่ใช้: useToast · apiFetch · useDragReorder/DragHandle/moveItem · usePermission
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { DragHandle, moveItem, useDragReorder } from "@/components/sortable-list";
import { usePermission } from "@/components/auth";
import { WO_DEFAULT_COLUMNS, normalizeWoColumns, type WoColumn, type WoPrintColumns } from "@/lib/work-order-print";

const CONFIG_KEY = "wo_print_columns";

/** โหลดค่ากลาง "ตั้งค่าคอลัมน์" — คืน null ระหว่างโหลด (หน้าพิมพ์รอค่อยวาดจะได้ไม่กระพริบสองรอบ) */
export function useWoPrintColumns() {
  const [cols, setCols] = useState<WoPrintColumns | null>(null);

  const reload = useCallback(() => {
    apiFetch(`/api/ui-config?key=${CONFIG_KEY}`)
      .then((r) => r.json())
      .then((j) => setCols(normalizeWoColumns(j?.value)))
      .catch(() => setCols(WO_DEFAULT_COLUMNS));   // โหลดไม่ได้ = ใช้ค่าเริ่มต้น ไม่ให้หน้าพิมพ์พัง
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { cols, reload };
}

function ColumnRows({ list, onChange }: { list: WoColumn[]; onChange: (next: WoColumn[]) => void }) {
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => onChange(moveItem(list, from, to)));
  const shown = list.filter((c) => c.show);
  const total = shown.reduce((n, c) => n + c.width, 0) || 1;
  const patch = (i: number, p: Partial<WoColumn>) => onChange(list.map((c, k) => (k === i ? { ...c, ...p } : c)));

  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
      {list.map((c, i) => (
        <div key={c.key} {...rowProps(i)} className={`flex items-center gap-1.5 px-1.5 py-1 ${rowCls(i)} ${c.show ? "" : "bg-slate-50"}`}>
          <DragHandle {...handleProps(i)} />
          <label className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer">
            <input type="checkbox" checked={c.show} onChange={(e) => patch(i, { show: e.target.checked })} className="w-4 h-4 accent-indigo-600 shrink-0" />
            <span className={`text-[12px] truncate ${c.show ? "text-slate-700" : "text-slate-400 line-through"}`}>
              {c.key === "image" ? "🖼 " : ""}{c.label}
            </span>
          </label>
          <input type="range" min={3} max={60} value={c.width} disabled={!c.show}
            onChange={(e) => patch(i, { width: Number(e.target.value) })}
            className="w-20 accent-indigo-600 disabled:opacity-30" />
          <input type="number" min={1} max={80} value={c.width} disabled={!c.show}
            onChange={(e) => patch(i, { width: Math.max(1, Math.min(80, Number(e.target.value) || 1)) })}
            className="w-12 h-6 px-1 text-[11px] text-right border border-slate-200 rounded disabled:opacity-30" />
          <span className="w-9 text-right text-[10px] text-slate-400 tabular-nums shrink-0">
            {c.show ? `${Math.round((c.width / total) * 100)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WoColumnSettings({ onPreview, onSaved }: {
  onPreview?: (cols: WoPrintColumns | null) => void;   // ส่งค่าให้หน้าพิมพ์วาดสด (null = กลับไปใช้ค่าที่บันทึกไว้)
  onSaved?: () => void;
}) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WoPrintColumns>(WO_DEFAULT_COLUMNS);
  const [saving, setSaving] = useState(false);
  const [mini, setMini] = useState(false);            // ย่อเหลือแถบหัว
  const [dim, setDim] = useState(false);              // โปร่งใส (จาง) — เห็นเอกสารทะลุ
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);   // null = มุมขวาบน (ค่าเริ่มต้น)
  const dragOff = useRef<{ dx: number; dy: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // เห็นผลสดบนเอกสาร — หน่วง 200ms กัน iframe โหลดใหม่รัวตอนลากแถบ
  useEffect(() => {
    if (!open || !onPreview) return;
    const t = setTimeout(() => onPreview(draft), 200);
    return () => clearTimeout(t);
  }, [draft, open, onPreview]);

  const openPanel = () => {
    apiFetch(`/api/ui-config?key=${CONFIG_KEY}`)
      .then((r) => r.json())
      .then((j) => setDraft(normalizeWoColumns(j?.value)))
      .catch(() => setDraft(WO_DEFAULT_COLUMNS))
      .finally(() => setOpen(true));
  };

  const closePanel = () => { onPreview?.(null); setOpen(false); };   // ปิดโดยไม่บันทึก = เอกสารกลับเป็นค่าเดิม

  // ลากย้ายแผง (จับที่แถบหัว) — clamp ไม่ให้หลุดจอ
  const onHeadPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;   // กดปุ่มบนหัว = ไม่ใช่การลาก
    const r = panelRef.current?.getBoundingClientRect();
    if (!r) return;
    dragOff.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeadPointerMove = (e: React.PointerEvent) => {
    const off = dragOff.current;
    const r = panelRef.current?.getBoundingClientRect();
    if (!off || !r) return;
    const x = Math.min(Math.max(0, e.clientX - off.dx), window.innerWidth - r.width);
    const y = Math.min(Math.max(0, e.clientY - off.dy), window.innerHeight - 40);
    setPos({ x, y });
  };
  const endDrag = () => { dragOff.current = null; };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/ui-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: CONFIG_KEY, value: draft }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success("บันทึกแล้ว — ทุกคนจะพิมพ์ได้หน้าตานี้");
      onSaved?.();          // โหลดค่ากลางใหม่ (preview ที่ค้างอยู่ = ค่าเดียวกันแล้ว ไม่ต้องล้าง)
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const btn = "h-6 px-1.5 text-[11px] rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50";

  return (
    <>
      <button onClick={() => (open ? closePanel() : openPanel())}
        title="ปรับความกว้างคอลัมน์ / เปิด-ปิดช่องรูป (เห็นผลบนเอกสารทันที)"
        className={`h-9 rounded-lg border px-3 text-sm ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>⚙ ตั้งค่าตาราง</button>

      {open && (
        <div ref={panelRef}
          style={pos ? { left: pos.x, top: pos.y } : { right: 16, top: 76 }}
          className={`no-print fixed z-40 w-[340px] rounded-xl border border-slate-300 bg-white/95 backdrop-blur-sm shadow-2xl transition-opacity ${dim ? "opacity-40 hover:opacity-100" : "opacity-100"}`}>

          {/* แถบหัว — ลากย้ายได้ */}
          <div onPointerDown={onHeadPointerDown} onPointerMove={onHeadPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
            className="flex items-center gap-1 px-2.5 py-1.5 border-b border-slate-100 cursor-move select-none rounded-t-xl bg-slate-50/80">
            <span className="text-[12px] font-bold text-slate-700 flex-1 truncate">⚙ ตั้งค่าตารางวัตถุดิบ</span>
            <button onClick={() => setDim((d) => !d)} title={dim ? "ทำให้ทึบ" : "ทำให้จาง (มองทะลุเห็นเอกสาร)"} className={btn}>{dim ? "👁 ทึบ" : "👁 จาง"}</button>
            <button onClick={() => setMini((m) => !m)} title={mini ? "กางแผง" : "ย่อแผง"} className={btn}>{mini ? "▢" : "—"}</button>
            <button onClick={closePanel} title="ปิด (ไม่บันทึก)" className={btn}>✕</button>
          </div>

          {!mini && (
            <>
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto px-2.5 py-2 space-y-2.5">
                <p className="text-[11px] text-slate-500 leading-snug">
                  ปรับแล้ว<b className="text-slate-700">เห็นผลบนเอกสารทันที</b> · กด <b>บันทึก</b> ถึงจะมีผลกับทุกคน
                  <br />ติ๊ก = แสดง · ลาก <span className="text-slate-400">⠿</span> = สลับลำดับ · % ขวา = ความกว้างจริงบนกระดาษ
                </p>

                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">1) ตาราง “สรุปวัตถุดิบที่ต้องใช้”</div>
                  <ColumnRows list={draft.summary} onChange={(summary) => setDraft((d) => ({ ...d, summary }))} />
                </div>

                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">2) ตาราง “รายการวัตถุดิบ / บล็อกตัด”</div>
                  <ColumnRows list={draft.lines} onChange={(lines) => setDraft((d) => ({ ...d, lines }))} />
                </div>

                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 leading-snug">
                  ⚠️ ช่อง <b>รูป</b> ขึ้นเฉพาะวัตถุดิบที่มีรูปปกในระบบ — ตัวที่ยังไม่มีรูป ช่องจะว่าง
                </p>
                {!canEdit && <p className="text-[10px] text-rose-600">คุณไม่มีสิทธิ์บันทึกค่ากลาง (ต้องมีสิทธิ์แก้ข้อมูลสินค้า) — ปรับดูได้แต่บันทึกไม่ได้</p>}
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100">
                <button onClick={() => setDraft(WO_DEFAULT_COLUMNS)} disabled={saving}
                  className="h-8 px-2 text-[11px] border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50">↺ ค่าเริ่มต้น</button>
                <div className="flex-1" />
                <button onClick={closePanel} disabled={saving} className="h-8 px-2.5 text-[11px] border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
                <button onClick={() => void save()} disabled={saving || !canEdit}
                  title={canEdit ? "" : "ต้องมีสิทธิ์แก้ข้อมูลสินค้าถึงจะบันทึกค่ากลางได้"}
                  className="h-8 px-3 text-[11px] font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก (ทุกคน)"}</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
