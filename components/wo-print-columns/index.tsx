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
import { Icon } from "@/components/icon";
import {
  WO_BORDER_COLORS, WO_BORDER_MODES, WO_DEFAULT_COLUMNS, WO_DEFAULT_EXTRAS, WO_DEFAULT_HEADER, WO_DEFAULT_ISSUES, WO_DEFAULT_SECTIONS, WO_DEFAULT_SIGNOFF, WO_DEFAULT_STYLE,
  WO_EXTRA_LABELS, WO_HEADER_BLOCKS, WO_HEADER_FIELDS, WO_HEADER_SIZES, WO_SECTION_LABELS, WO_SECTION_PRESETS, WO_SHEETS, isBlankWoColumn, normalizeWoColumns,
  type WoBoxKey, type WoColumn, type WoExtras, type WoHeader, type WoIssuesCfg, type WoHeaderBlock, type WoPrintColumns, type WoSheet, type WoSignoff,
} from "@/lib/work-order-print";

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
          <input type="checkbox" checked={c.show} onChange={(e) => patch(i, { show: e.target.checked })}
            title="แสดงคอลัมน์นี้" className="w-4 h-4 accent-indigo-600 shrink-0" />
          {c.key === "image" && <span className="text-[11px] shrink-0">🖼</span>}
          {c.key === "check" && <span className="text-[11px] shrink-0">☑</span>}
          {isBlankWoColumn(c.key) && <span className="text-[9px] shrink-0 px-1 py-0.5 rounded bg-slate-100 text-slate-400">ว่าง {c.key.replace("blank", "")}</span>}
          {/* ชื่อหัวคอลัมน์ — พิมพ์เปลี่ยนเองได้ทุกช่อง (ช่องว่างจะได้ตั้งชื่อเองตามที่เจ้าของขอ) */}
          <input type="text" value={c.label} maxLength={40}
            onChange={(e) => patch(i, { label: e.target.value })}
            placeholder={isBlankWoColumn(c.key) ? "ตั้งชื่อหัวช่องว่าง…" : "ชื่อหัวคอลัมน์"}
            title="พิมพ์เปลี่ยนชื่อหัวคอลัมน์ได้"
            className={`min-w-0 flex-1 h-6 px-1 text-[12px] rounded bg-transparent border border-transparent hover:border-slate-200 focus:border-indigo-300 focus:bg-white focus:outline-none ${c.show ? "text-slate-700" : "text-slate-400 line-through"}`} />
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

/** ลากเรียงกล่องหัวใบ (รูป / ชื่อ / จำนวน / เลขที่+QR) — ของกลาง sortable-list */
function HeaderOrder({ order, onChange }: { order: WoHeaderBlock[]; onChange: (next: WoHeaderBlock[]) => void }) {
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => onChange(moveItem(order, from, to)));
  const label = (k: WoHeaderBlock) => WO_HEADER_BLOCKS.find((b) => b.key === k)?.label ?? k;
  return (
    <div className="flex gap-1">
      {order.map((k, i) => (
        <div key={k} {...rowProps(i)} className={`flex-1 flex items-center gap-0.5 border border-slate-200 rounded px-1 py-0.5 bg-white ${rowCls(i)}`}>
          <DragHandle {...handleProps(i)} />
          <span className="text-[10px] text-slate-600 truncate">{i + 1}. {label(k)}</span>
        </div>
      ))}
    </div>
  );
}

/** ปุ่มเลือกทีละอย่าง (แบบเดียวกับปุ่ม "แบบเส้น") */
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 flex-1">
      {options.map((o) => (
        <button key={o.value} title={o.hint} onClick={() => onChange(o.value)}
          className={`flex-1 min-h-6 px-1 rounded border text-[10px] leading-tight ${value === o.value ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{o.label}</button>
      ))}
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const b = "w-6 h-6 rounded border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-30";
  return (
    <span className="inline-flex items-center gap-1">
      <button className={b} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="ลด">−</button>
      <span className="w-4 text-center text-[12px] tabular-nums">{value}</span>
      <button className={b} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="เพิ่ม">+</button>
    </span>
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

  // หัวใบ / กล่องลงชื่อ / ส่วนเสริม (ค่าเก่าที่ยังไม่มีคีย์เหล่านี้ = ค่าเริ่มต้น)
  const hdr = draft.header ?? WO_DEFAULT_HEADER;
  const so = draft.signoff ?? WO_DEFAULT_SIGNOFF;
  const ex = draft.extras ?? WO_DEFAULT_EXTRAS;
  const signOn = (draft.sections ?? WO_DEFAULT_SECTIONS).signature;
  const setHdr = (p: Partial<WoHeader>) => setDraft((d) => ({ ...d, header: { ...(d.header ?? WO_DEFAULT_HEADER), ...p } }));
  const setSo = (p: Partial<WoSignoff>) => setDraft((d) => ({ ...d, signoff: { ...(d.signoff ?? WO_DEFAULT_SIGNOFF), ...p } }));
  const setEx = (p: Partial<WoExtras>) => setDraft((d) => ({ ...d, extras: { ...(d.extras ?? WO_DEFAULT_EXTRAS), ...p } }));
  const iss = draft.issues ?? WO_DEFAULT_ISSUES;
  const setIss = (p: Partial<WoIssuesCfg>) => setDraft((d) => ({ ...d, issues: { ...(d.issues ?? WO_DEFAULT_ISSUES), ...p } }));
  // "ช่องติ๊กเตรียมรายวัตถุดิบ" = คอลัมน์ ☑ ในตารางสรุปที่มีอยู่แล้ว — แค่สลับเปิด/ปิดให้จากตรงนี้
  const tickOn = draft.summary.some((c) => c.key === "check" && c.show);
  const setTick = (on: boolean) => setDraft((d) => ({ ...d, summary: d.summary.map((c) => (c.key === "check" ? { ...c, show: on } : c)) }));

  // ตาราง "กล่องไหนโชว์ · อยู่แผ่นไหน" — ช่องโชว์ผูกกับค่าที่มีอยู่แล้ว (ส่วนเสริม / ช่างรับงาน / ตัด-เตรียม) ไม่ซ้ำซ้อน
  const sec = draft.sections ?? WO_DEFAULT_SECTIONS;
  const splitOn = sec.split;
  const sheetCols = splitOn ? WO_SHEETS.filter((s) => sec[s.key]) : [];
  const extraRow = (key: keyof WoExtras & WoBoxKey, label: string) => {
    const meta = WO_EXTRA_LABELS.find((x) => x.key === key);
    return { key, label, hint: meta?.hint, show: ex[key], setShow: (on: boolean) => setEx({ [key]: on }) };
  };
  const boxRows: { key: WoBoxKey; label: string; hint?: string; show: boolean; setShow: (on: boolean) => void }[] = [
    extraRow("approve", "ผู้สั่งผลิต + หัวหน้าอนุมัติ"),
    ...(so.prep === "split"
      ? [
        { key: "prep" as const, label: "เตรียมวัตถุดิบ", show: so.prep_show, setShow: (on: boolean) => setSo({ prep_show: on }) },
        { key: "cut" as const, label: "ตัด", show: so.cut_show, setShow: (on: boolean) => setSo({ cut_show: on }) },
      ]
      : [{ key: "prepcut" as const, label: "แผนกตัด/เตรียม", show: so.prep === "one", setShow: (on: boolean) => setSo({ prep: on ? "one" : "off" }) }]),
    { key: "worker", label: "ช่างรับงาน (ทุกกล่อง)", hint: "1 กล่องต่อใบจ่ายงานจริงของใบนี้ · ยังไม่จ่าย = กล่องว่างให้เขียนเอง", show: so.worker, setShow: (on) => setSo({ worker: on }) },
    extraRow("qc", "QC ตรวจรับ (ดี / เสีย)"),
    extraRow("returns", "ตารางส่งคืนงาน"),
    extraRow("note", "หมายเหตุถึงช่าง"),
  ];
  const setPlace = (key: WoBoxKey, sheet: WoSheet, on: boolean) =>
    setDraft((d) => {
      const cur = d.signoff ?? WO_DEFAULT_SIGNOFF;
      return { ...d, signoff: { ...cur, place: { ...cur.place, [key]: { ...cur.place[key], [sheet]: on } } } };
    });
  // โชว์อยู่แต่ไม่ได้เลือกแผ่นที่พิมพ์เลย → จะไปแผ่นสุดท้าย (บอกให้รู้ ไม่ให้งง)
  const orphanBoxes = sheetCols.length === 0 ? [] : boxRows.filter((r) => r.show && !sheetCols.some((s) => so.place[r.key][s.key])).map((r) => r.label);

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
        title="ปรับหัวใบ / กล่องลงชื่อ / คอลัมน์ตาราง (เห็นผลบนเอกสารทันที)"
        className={`h-9 rounded-lg border px-3 text-sm inline-flex items-center gap-1.5 ${open ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}><Icon name="settings" /> ตั้งค่าใบพิมพ์</button>

      {open && (
        <div ref={panelRef}
          style={pos ? { left: pos.x, top: pos.y } : { right: 16, top: 76 }}
          className={`no-print fixed z-40 w-[340px] rounded-xl border border-slate-300 bg-white/95 backdrop-blur-sm shadow-2xl transition-opacity ${dim ? "opacity-40 hover:opacity-100" : "opacity-100"}`}>

          {/* แถบหัว — ลากย้ายได้ */}
          <div onPointerDown={onHeadPointerDown} onPointerMove={onHeadPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
            className="flex items-center gap-1 px-2.5 py-1.5 border-b border-slate-100 cursor-move select-none rounded-t-xl bg-slate-50/80">
            <span className="text-[12px] font-bold text-slate-700 flex-1 truncate inline-flex items-center gap-1"><Icon name="settings" /> ตั้งค่าใบพิมพ์ใบสั่งงาน</span>
            <button onClick={() => setDim((d) => !d)} title={dim ? "ทำให้ทึบ" : "ทำให้จาง (มองทะลุเห็นเอกสาร)"} className={btn}>{dim ? "👁 ทึบ" : "👁 จาง"}</button>
            <button onClick={() => setMini((m) => !m)} title={mini ? "กางแผง" : "ย่อแผง"} className={btn}>{mini ? "▢" : "—"}</button>
            <button onClick={closePanel} title="ปิด (ไม่บันทึก)" className={btn}>✕</button>
          </div>

          {!mini && (
            <>
              <div className="max-h-[calc(100vh-230px)] overflow-y-auto px-2.5 py-2 space-y-2.5">
                <p className="text-[11px] text-slate-500 leading-snug">
                  ปรับแล้ว<b className="text-slate-700">เห็นผลบนเอกสารทันที</b> · กด <b>บันทึก</b> ถึงจะมีผลกับทุกคน
                  <br />ติ๊ก = แสดง · ลาก <span className="text-slate-400">⠿</span> = สลับลำดับ · <b className="text-slate-700">พิมพ์ทับชื่อคอลัมน์ได้</b> · % ขวา = ความกว้างจริงบนกระดาษ
                  <br />ช่องพิเศษ: <b>☑ ติ๊กถูก</b> (กล่องเปล่าให้ช่างติ๊กบนกระดาษ) · <b>ช่องว่าง 1/2</b> (เว้นว่างไว้เขียนมือ ตั้งชื่อหัวเองได้)
                </p>

                {/* ส่วนที่จะพิมพ์ — อยากได้แค่ตารางเดียวก็กดชุดสำเร็จได้เลย */}
                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">0) จะพิมพ์ส่วนไหนบ้าง</div>
                  <div className="border border-slate-200 rounded-lg px-2 py-1.5 space-y-1.5">
                    <div className="flex gap-1">
                      {WO_SECTION_PRESETS.map((p) => {
                        const cur = draft.sections ?? WO_DEFAULT_SECTIONS;
                        const on = WO_SECTION_LABELS.every((s) => cur[s.key] === p.value[s.key]);
                        return (
                          <button key={p.label} title={p.hint}
                            onClick={() => setDraft((d) => ({ ...d, sections: { ...p.value } }))}
                            className={`flex-1 h-6 rounded border text-[10px] ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{p.label}</button>
                        );
                      })}
                    </div>
                    {WO_SECTION_LABELS.map((s) => {
                      const cur = draft.sections ?? WO_DEFAULT_SECTIONS;
                      return (
                        <label key={s.key} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={cur[s.key]}
                            onChange={(e) => setDraft((d) => ({ ...d, sections: { ...(d.sections ?? WO_DEFAULT_SECTIONS), [s.key]: e.target.checked } }))}
                            className="w-4 h-4 accent-indigo-600 shrink-0" />
                          <span className={`text-[12px] ${cur[s.key] ? "text-slate-700" : "text-slate-400 line-through"}`}>{s.label}</span>
                        </label>
                      );
                    })}
                    {/* แยกใบ — ส่วนที่เปิดไว้ไปคนละแผ่น (ส่งช่างคนละคนได้) */}
                    <label className="flex items-start gap-1.5 cursor-pointer border-t border-slate-100 pt-1.5">
                      <input type="checkbox" checked={(draft.sections ?? WO_DEFAULT_SECTIONS).split}
                        onChange={(e) => setDraft((d) => ({ ...d, sections: { ...(d.sections ?? WO_DEFAULT_SECTIONS), split: e.target.checked } }))}
                        className="w-4 h-4 accent-indigo-600 shrink-0 mt-0.5" />
                      <span className="text-[12px] text-slate-700 leading-snug">
                        ✂️ <b>แยกใบ</b> — ส่วนที่ติ๊กไว้ไป<b>คนละแผ่น</b> (แต่ละแผ่นมีหัวเอกสารครบ ส่งช่างคนละคนได้)
                        <br /><span className="text-[10px] text-slate-400">ไม่ติ๊ก = ทุกส่วนต่อกันในใบเดียวแบบเดิม</span>
                      </span>
                    </label>
                    <p className="text-[10px] text-slate-400">หัวเอกสาร (ชื่อบริษัท · สินค้า · จำนวน · เลขที่ใบ · QR) พิมพ์ติดไปด้วยเสมอ</p>
                  </div>
                </div>

                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">1) ตาราง “สรุปวัตถุดิบที่ต้องใช้”</div>
                  <ColumnRows list={draft.summary} onChange={(summary) => setDraft((d) => ({ ...d, summary }))} />
                </div>

                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">2) ตาราง “รายการวัตถุดิบ / บล็อกตัด”</div>
                  {/* กรองแถว — ใบบล็อกตัดให้ช่างตัดเห็นแต่ชิ้นที่ต้องตัดจริง */}
                  <label className="flex items-start gap-1.5 cursor-pointer mb-1"
                    title="แถวที่มีแค่กว้าง หรือแค่ยาว หรือมีแต่จำนวน (เช่น ซิป ด้าย) จะไม่แสดง">
                    <input type="checkbox" checked={!!draft.lines_cut_only}
                      onChange={(e) => setDraft((d) => ({ ...d, lines_cut_only: e.target.checked }))}
                      className="w-4 h-4 accent-indigo-600 shrink-0 mt-0.5" />
                    <span className="text-[12px] text-slate-700 leading-snug">
                      แสดงเฉพาะแถวที่มี <b>กว้าง x ยาว</b>
                      <br /><span className="text-[10px] text-slate-400">มีแค่กว้าง / แค่ยาว / แค่จำนวน = ไม่แสดง · ใต้ตารางบอกจำนวนแถวที่ซ่อน</span>
                    </span>
                  </label>
                  <ColumnRows list={draft.lines} onChange={(lines) => setDraft((d) => ({ ...d, lines }))} />
                </div>

                {/* เส้นตาราง — เจ้าของบอกว่าเส้นดำ 1px หนาไปตอนพิมพ์ */}
                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">3) เส้นตาราง + ขนาดตัวอักษร</div>
                  <div className="border border-slate-200 rounded-lg px-2 py-1.5 space-y-1.5">
                    {/* แบบเส้น — ตัวที่ทำให้ "ดูบางลง" ได้จริงที่สุด */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">แบบเส้น</span>
                      <div className="flex gap-1 flex-1">
                        {WO_BORDER_MODES.map((m) => {
                          const on = (draft.style ?? WO_DEFAULT_STYLE).border_mode === m.value;
                          return (
                            <button key={m.value} title={m.hint}
                              onClick={() => setDraft((d) => ({ ...d, style: { ...(d.style ?? WO_DEFAULT_STYLE), border_mode: m.value } }))}
                              className={`flex-1 h-6 rounded border text-[10px] ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>{m.label}</button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">สีเส้น</span>
                      <div className="flex gap-1 flex-1">
                        {WO_BORDER_COLORS.map((c) => {
                          const on = (draft.style ?? WO_DEFAULT_STYLE).border_color === c.value;
                          return (
                            <button key={c.value} onClick={() => setDraft((d) => ({ ...d, style: { ...(d.style ?? WO_DEFAULT_STYLE), border_color: c.value } }))}
                              title={c.label}
                              className={`flex-1 h-6 rounded border flex items-center justify-center ${on ? "border-indigo-500 ring-1 ring-indigo-300" : "border-slate-200 hover:bg-slate-50"}`}>
                              <span className="block w-full mx-1" style={{ borderTop: `3px solid ${c.value}` }} />
                              <span className="sr-only">{c.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">ความหนา</span>
                      <input type="range" min={0.05} max={0.6} step={0.01}
                        value={(draft.style ?? WO_DEFAULT_STYLE).border_mm}
                        onChange={(e) => setDraft((d) => ({ ...d, style: { ...(d.style ?? WO_DEFAULT_STYLE), border_mm: Number(e.target.value) } }))}
                        className="flex-1 accent-indigo-600" />
                      <span className="w-14 text-right text-[11px] text-slate-500 tabular-nums">{(draft.style ?? WO_DEFAULT_STYLE).border_mm} มม.</span>
                    </div>
                    {/* ขนาดตัวอักษร */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">ตัวอักษร</span>
                      <input type="range" min={0.6} max={1.6} step={0.05}
                        value={(draft.style ?? WO_DEFAULT_STYLE).font_scale}
                        onChange={(e) => setDraft((d) => ({ ...d, style: { ...(d.style ?? WO_DEFAULT_STYLE), font_scale: Number(e.target.value) } }))}
                        className="flex-1 accent-indigo-600" />
                      <span className="w-14 text-right text-[11px] text-slate-500 tabular-nums">{Math.round((draft.style ?? WO_DEFAULT_STYLE).font_scale * 100)}%</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      ⚠️ <b className="text-slate-600">บนจอ</b> เส้นจะดูหนาเท่ากันหมด (จอวาดบางกว่า 1 จุดไม่ได้) — <b className="text-slate-600">ต้องดูที่ “ตัวอย่างก่อนพิมพ์” (Ctrl+P) หรือกระดาษจริง</b> ถึงจะเห็นว่าบางลง
                      <br />เทียบให้: เส้นเดิม = 0.26 มม. · ค่าเริ่มต้นใหม่ = 0.12 มม. (บางกว่าครึ่ง) · อยากโปร่งอีกให้เลือก “เส้นนอน” + สีจาง
                    </p>
                  </div>
                </div>

                {/* 4) หัวใบ — กล่องบนสุด (รูป · ชื่อ · จำนวน · เลขที่+QR · กำหนดส่ง) */}
                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">4) หัวใบ</div>
                  <div className="border border-slate-200 rounded-lg px-2 py-1.5 space-y-1.5">
                    {/* ขนาดหัวใบ — กดทีเดียวย่อทั้งชุด (ตั้งขนาดรูป + บรรทัดเดียวให้ด้วย ปรับต่อเองได้) */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">ขนาดหัวใบ</span>
                      <Seg value={hdr.size} onChange={(size) => {
                        const p = WO_HEADER_SIZES.find((x) => x.value === size)!;
                        setHdr({ size, photo_mm: p.photo_mm, title_inline: p.title_inline });
                      }} options={WO_HEADER_SIZES.map((x) => ({ value: x.value, label: x.label, hint: x.hint }))} />
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={hdr.title_inline} onChange={(e) => setHdr({ title_inline: e.target.checked })}
                        className="w-4 h-4 accent-indigo-600 shrink-0" />
                      <span className="text-[11px] text-slate-600">ชื่อบริษัท + หัวข้อ บรรทัดเดียว (ประหยัดความสูง)</span>
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {WO_HEADER_FIELDS.map((f) => {
                        const on = hdr.show[f.key];
                        return (
                          <button key={f.key} onClick={() => setHdr({ show: { ...hdr.show, [f.key]: !on } })}
                            className={`h-6 px-1.5 rounded border text-[10px] ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-400 line-through hover:bg-slate-50"}`}>{f.label}</button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-14 shrink-0">ขนาดรูป</span>
                      <input type="range" min={20} max={60} step={1} value={hdr.photo_mm} disabled={!hdr.show.photo}
                        onChange={(e) => setHdr({ photo_mm: Number(e.target.value) })}
                        className="flex-1 accent-indigo-600 disabled:opacity-30" />
                      <span className="w-14 text-right text-[11px] text-slate-500 tabular-nums">{hdr.photo_mm} มม.</span>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 mb-0.5">เรียงกล่องหัว (ลาก ⠿ ซ้าย → ขวา)</div>
                      <HeaderOrder order={hdr.order} onChange={(order) => setHdr({ order })} />
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">"จำนวนเดิม" ขึ้นเฉพาะใบที่เคยลด/เพิ่มจำนวน (เช่น เดิม 20 · ของไม่พอ) — ตัวเลขใหญ่คือจำนวนปัจจุบันเสมอ</p>
                  </div>
                </div>

                {/* 5) กล่องลงชื่อ — ของกลาง lib/print-signoff */}
                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1 inline-flex items-center gap-1"><Icon value="i:signature" /> 5) กล่องลงชื่อ</div>
                  <div className={`border border-slate-200 rounded-lg px-2 py-1.5 space-y-1.5 ${signOn ? "" : "opacity-50"}`}>
                    {!signOn && <p className="text-[10px] text-rose-600">ปิดอยู่ — ติ๊ก "กล่องลงชื่อ + ส่วนเสริม" ในข้อ 0 ก่อน</p>}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-20 shrink-0">แผนกตัด/เตรียม</span>
                      <Seg value={so.prep} onChange={(prep) => setSo({ prep })} options={[
                        { value: "off", label: "ไม่ใส่" }, { value: "one", label: "1 กล่องรวม" }, { value: "split", label: "แยก เตรียม/ตัด" },
                      ]} />
                    </div>
                    {so.worker && (
                      <>
                        <label className="flex items-center gap-1.5 cursor-pointer" title="ช่างรับงาน = 1 กล่องต่อใบจ่ายงานจริงของใบนี้ (โต๊ะ/ช่าง + จำนวนที่รับ)">
                          <span className="text-[11px] text-slate-500 w-20 shrink-0">ช่างรับงาน</span>
                          <input type="checkbox" checked={so.merge} onChange={(e) => setSo({ merge: e.target.checked })} className="w-4 h-4 accent-indigo-600 shrink-0" />
                          <span className="text-[11px] text-slate-600">รวมกล่องโต๊ะ/ช่างเดียวกัน (จ่ายหลายรอบ)</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 w-20 shrink-0">ใบเดียวหลายช่าง</span>
                          <Seg value={so.multi} onChange={(multi) => setSo({ multi })} options={[
                            { value: "each", label: "เซ็นแยกรายคน" }, { value: "one", label: "ช่องเซ็นเดียว" },
                          ]} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-slate-500 w-20 shrink-0">กล่องว่าง</span>
                          <span className="text-[11px] text-slate-600 inline-flex items-center gap-1">ยังไม่จ่าย <Stepper value={so.blanks} min={1} max={4} onChange={(blanks) => setSo({ blanks })} /></span>
                          <span className="text-[11px] text-slate-600 inline-flex items-center gap-1">จ่ายแล้วเผื่อ <Stepper value={so.extra} min={0} max={4} onChange={(extra) => setSo({ extra })} /></span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-20 shrink-0">วันที่</span>
                      <Seg value={so.date} onChange={(date) => setSo({ date })} options={[
                        { value: "blank", label: "เขียนมือ ___/___/___" },
                        { value: "fill", label: "เติมจากระบบ (ถ้ามี)", hint: "วันจ่ายงาน · วันเตรียม/ตัดเสร็จ · วันสั่ง — ไม่มีข้อมูล = เว้นให้เขียนมือ" },
                      ]} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-20 shrink-0">วางไว้</span>
                      <Seg value={so.pos} onChange={(pos) => setSo({ pos })} options={[
                        { value: "top", label: "ใต้หัวใบ" }, { value: "bottom", label: "ท้ายใบ" },
                      ]} />
                    </div>
                  </div>
                </div>

                {/* 6) กล่องไหนโชว์ · อยู่แผ่นไหน (แผ่น = โหมดแยกใบในข้อ 0) */}
                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">6) กล่องไหนโชว์ · อยู่แผ่นไหน</div>
                  <div className={`border border-slate-200 rounded-lg px-2 py-1.5 space-y-1 ${signOn ? "" : "opacity-50"}`}>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="text-left font-normal py-0.5">กล่อง</th>
                          <th className="font-normal w-9">โชว์</th>
                          {sheetCols.map((s) => <th key={s.key} className="font-normal w-14 leading-tight">{s.short}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {boxRows.map((r) => (
                          <tr key={r.key} className="border-t border-slate-100" title={r.hint}>
                            <td className={`py-1 pr-1 ${r.show ? "text-slate-700" : "text-slate-400"}`}>{r.label}</td>
                            <td className="text-center"><input type="checkbox" checked={r.show} onChange={(e) => r.setShow(e.target.checked)} aria-label={`โชว์ ${r.label}`} className="w-4 h-4 accent-indigo-600 align-middle" /></td>
                            {sheetCols.map((s) => (
                              <td key={s.key} className="text-center">
                                <input type="checkbox" checked={so.place[r.key][s.key]} disabled={!r.show}
                                  onChange={(e) => setPlace(r.key, s.key, e.target.checked)} aria-label={`${r.label} บน${s.label}`}
                                  className="w-4 h-4 accent-indigo-600 align-middle disabled:opacity-30" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {splitOn
                      ? orphanBoxes.length > 0 && <p className="text-[10px] text-amber-700 leading-snug">ไม่ได้เลือกแผ่นที่พิมพ์ให้: {orphanBoxes.join(", ")} → จะไปอยู่แผ่นสุดท้ายแทน (ไม่หายเงียบ)</p>
                      : <p className="text-[10px] text-slate-400 leading-snug">ติ๊ก <b>แยกใบ</b> ในข้อ 0 ถ้าอยากให้แต่ละกล่องไปอยู่คนละแผ่น (เช่น กล่องตัดอยู่ใบบล็อกตัด กล่องช่างอยู่ใบรายละเอียด)</p>}
                    <label title="คอลัมน์ ☑ ในตาราง “สรุปวัตถุดิบ” (ข้อ 1)" className="flex items-center gap-1.5 cursor-pointer border-t border-slate-100 pt-1">
                      <input type="checkbox" checked={tickOn} onChange={(e) => setTick(e.target.checked)} className="w-4 h-4 accent-indigo-600 shrink-0" />
                      <span className={`text-[12px] ${tickOn ? "text-slate-700" : "text-slate-400"}`}>ช่องติ๊กเตรียมรายวัตถุดิบ</span>
                    </label>
                  </div>
                </div>

                {/* 7) ปัญหาที่เคยเกิด — รุ่นนี้ (ทุกสี) | SKU นี้ (จดเฉพาะสี + ของเสีย QC) */}
                <div>
                  <div className="text-[12px] font-bold text-slate-700 mb-1">7) ข้อควรระวัง — ปัญหาที่เคยเกิด</div>
                  <div className="border border-slate-200 rounded-lg px-2 py-1.5 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 w-20 shrink-0">กล่องปัญหา</span>
                      <Seg value={iss.show ? "on" : "off"} onChange={(v) => setIss({ show: v === "on" })} options={[{ value: "on", label: "โชว์" }, { value: "off", label: "ไม่โชว์" }]} />
                    </div>
                    <div className={`space-y-1.5 ${iss.show ? "" : "opacity-50"}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 w-20 shrink-0">วางไว้</span>
                        <Seg value={iss.pos} onChange={(pos) => setIss({ pos })} options={[{ value: "top", label: "ใต้หัวใบ" }, { value: "bottom", label: "ท้ายตาราง" }]} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 w-20 shrink-0">สูงสุดต่อกลุ่ม</span>
                        <Seg value={String(iss.max)} onChange={(v) => setIss({ max: Number(v) })} options={[{ value: "3", label: "3" }, { value: "5", label: "5" }, { value: "0", label: "ทั้งหมด" }]} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 w-20 shrink-0">ยังไม่มีบันทึก</span>
                        <Seg value={iss.empty} onChange={(empty) => setIss({ empty })} options={[
                          { value: "hide", label: "ซ่อนกล่อง" }, { value: "blank", label: "เว้นให้ช่างเขียน", hint: "เส้นว่างให้ช่างจดปัญหาใหม่ที่เจอ แล้วค่อยนำมาจดเข้าระบบ" },
                        ]} />
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={iss.stats} onChange={(e) => setIss({ stats: e.target.checked })} className="w-4 h-4 accent-indigo-600 shrink-0" />
                        <span className="text-[11px] text-slate-600">โชว์จำนวนครั้ง · ชิ้น · ล่าสุด (ของเสียจาก QC)</span>
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      ซ้าย = ปัญหาทั้งรุ่น (ทุกสี) · ขวา = ปัญหาเฉพาะ SKU นี้ + ของเสียที่ QC บันทึก
                      <br />จดปัญหาได้ที่: ป๊อป QC (จดให้อัตโนมัติตอนกดของเสีย) · หน้า Parent SKU แท็บ "ปัญหา" · หน้าใบสั่งผลิต — เลือก "ทุกสี" หรือ "เฉพาะสีนี้"
                    </p>
                  </div>
                </div>

                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 leading-snug">
                  ⚠️ ช่อง <b>รูป</b> ขึ้นเฉพาะวัตถุดิบที่มีรูปปกในระบบ — ตัวที่ยังไม่มีรูป ช่องจะว่าง
                </p>
                {!canEdit && <p className="text-[10px] text-rose-600">คุณไม่มีสิทธิ์บันทึกค่ากลาง (ต้องมีสิทธิ์แก้ข้อมูลสินค้า) — ปรับดูได้แต่บันทึกไม่ได้</p>}
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-slate-100">
                <button onClick={() => setDraft({ ...WO_DEFAULT_COLUMNS, style: WO_DEFAULT_STYLE, sections: WO_DEFAULT_SECTIONS, header: WO_DEFAULT_HEADER, signoff: WO_DEFAULT_SIGNOFF, extras: WO_DEFAULT_EXTRAS, issues: WO_DEFAULT_ISSUES })} disabled={saving}
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
