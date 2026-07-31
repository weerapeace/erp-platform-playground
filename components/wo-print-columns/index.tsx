"use client";

/**
 * ของกลาง — "⚙ ตั้งค่าตาราง" ของใบสั่งงานผลิต (คอลัมน์ + ความกว้าง + ช่องรูป)
 *  • useWoPrintColumns()  โหลดค่ากลางของระบบ (ui_config key "wo_print_columns") → ใช้กับหน้าพิมพ์เดี่ยว/พิมพ์รวม
 *  • <WoColumnSettings/>  ปุ่ม + ป๊อปตั้งค่า: เปิด/ปิดคอลัมน์ · ลากจัดลำดับ · ปรับความกว้าง (%) · รีเซ็ต
 * ค่าที่ตั้งเป็น "ค่ากลาง" — ทุกคนพิมพ์ได้หน้าตาเดียวกัน (ต้องมีสิทธิ์ products.edit ถึงจะบันทึกได้)
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch · useDragReorder/DragHandle/moveItem · usePermission
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
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
        <div key={c.key} {...rowProps(i)} className={`flex items-center gap-2 px-2 py-1.5 ${rowCls(i)} ${c.show ? "" : "bg-slate-50"}`}>
          <DragHandle {...handleProps(i)} />
          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
            <input type="checkbox" checked={c.show} onChange={(e) => patch(i, { show: e.target.checked })} className="w-4 h-4 accent-indigo-600 shrink-0" />
            <span className={`text-sm truncate ${c.show ? "text-slate-700" : "text-slate-400 line-through"}`}>
              {c.key === "image" ? "🖼 " : ""}{c.label}
            </span>
          </label>
          <input type="range" min={3} max={60} value={c.width} disabled={!c.show}
            onChange={(e) => patch(i, { width: Number(e.target.value) })}
            className="w-28 accent-indigo-600 disabled:opacity-30" />
          <input type="number" min={1} max={80} value={c.width} disabled={!c.show}
            onChange={(e) => patch(i, { width: Math.max(1, Math.min(80, Number(e.target.value) || 1)) })}
            className="w-14 h-7 px-1.5 text-xs text-right border border-slate-200 rounded disabled:opacity-30" />
          <span className="w-12 text-right text-[11px] text-slate-400 tabular-nums">
            {c.show ? `${Math.round((c.width / total) * 100)}%` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WoColumnSettings({ onSaved }: { onSaved?: () => void }) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WoPrintColumns>(WO_DEFAULT_COLUMNS);
  const [saving, setSaving] = useState(false);

  const openModal = () => {
    apiFetch(`/api/ui-config?key=${CONFIG_KEY}`)
      .then((r) => r.json())
      .then((j) => setDraft(normalizeWoColumns(j?.value)))
      .catch(() => setDraft(WO_DEFAULT_COLUMNS))
      .finally(() => setOpen(true));
  };

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
      setOpen(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <>
      <button onClick={openModal} title="ปรับความกว้างคอลัมน์ / เปิด-ปิดช่องรูป (มีผลกับทุกคน)"
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">⚙ ตั้งค่าตาราง</button>

      <ERPModal open={open} onClose={() => !saving && setOpen(false)} size="lg" title="ตั้งค่าตารางวัตถุดิบ (ใบสั่งงานผลิต)" storageKey="wo-print-columns"
        footer={<>
          <button onClick={() => setDraft(WO_DEFAULT_COLUMNS)} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50">↺ ค่าเริ่มต้น</button>
          <div className="flex-1" />
          <button onClick={() => setOpen(false)} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={saving || !canEdit}
            title={canEdit ? "" : "ต้องมีสิทธิ์แก้ข้อมูลสินค้าถึงจะบันทึกค่ากลางได้"}
            className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึก"}</button>
        </>}>
        <div className="space-y-4">
          <p className="text-[12px] text-slate-500">
            ติ๊ก = แสดงคอลัมน์นั้น · ลาก <span className="text-slate-400">⠿</span> = สลับลำดับ · เลื่อนแถบ = ปรับความกว้าง
            <br />ตัวเลข % ทางขวาคือความกว้างจริงบนกระดาษ (ระบบเฉลี่ยให้รวมกันได้ 100% เสมอ ไม่ต้องคำนวณเอง)
          </p>

          <div>
            <div className="text-sm font-bold text-slate-700 mb-1.5">1) ตาราง “สรุปวัตถุดิบที่ต้องใช้”</div>
            <ColumnRows list={draft.summary} onChange={(summary) => setDraft((d) => ({ ...d, summary }))} />
          </div>

          <div>
            <div className="text-sm font-bold text-slate-700 mb-1.5">2) ตาราง “รายการวัตถุดิบ / บล็อกตัด”</div>
            <ColumnRows list={draft.lines} onChange={(lines) => setDraft((d) => ({ ...d, lines }))} />
          </div>

          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            ⚠️ ช่อง <b>รูป</b> จะขึ้นเฉพาะวัตถุดิบที่มีรูปปกในระบบเท่านั้น — ถ้ายังไม่ได้ใส่รูปให้วัตถุดิบ ช่องจะว่าง
          </p>
          {!canEdit && <p className="text-[11px] text-rose-600">คุณไม่มีสิทธิ์บันทึกค่ากลาง (ต้องมีสิทธิ์แก้ข้อมูลสินค้า) — ปรับดูได้แต่กดบันทึกไม่ได้</p>}
        </div>
      </ERPModal>
    </>
  );
}
