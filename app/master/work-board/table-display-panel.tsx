"use client";

/**
 * ตั้งค่าหน้าตาตารางบอร์ดจ่ายงาน — 3 แท็บในป๊อป ⚙️ ตั้งค่ามุมมอง (./view-settings-modal)
 *   look = ชุดหน้าตา + ขนาด + ตาราง + รูปแบบข้อมูล + ค่าเริ่มต้นตอนเปิด · head = ส่วนหัวหน้า · cols = คอลัมน์ปกติ
 * ปรับแล้วตารางด้านหลังเห็นผลทันที (ร่างของ useTableDisplay — เก็บจริงตอนกด 💾 บันทึกของป๊อป)
 * ค่า/ชุดหน้าตา/สิทธิ์แก้ชุดกลาง อยู่ที่ ./table-display (useTableDisplay)
 * ⚠️ ชิ้นย่อยเรียกเป็น "ฟังก์ชัน" ไม่ใช่ <Component/> — ไม่งั้นทุกครั้งที่ปรับค่า React สร้างใหม่ แถบเลื่อนจะหลุดมือกลางทาง
 */
import type { ReactNode } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import type { DisplayCfg, TableDisplay } from "./table-display";

type Opt = [string, string];
export type DisplayTab = "look" | "head" | "cols";

export function DisplaySettings({ d, isAdmin, colOptions, currentCols, cardGroups, tab }: {
  d: TableDisplay; isAdmin: boolean;
  colOptions: Opt[];                 // คอลัมน์ที่มีในแท็บรอจ่าย [key, ชื่อ]
  currentCols: string[];             // คอลัมน์ที่เห็นอยู่ตอนนี้ (ใช้ตอนกด "กำหนดคอลัมน์ในชุดนี้")
  cardGroups: [string, Opt[]][];     // ช่องแถบสรุปแยกตามแท็บ
  tab: DisplayTab;
}) {
  const c = d.cfg;
  const btn = (on: boolean) => `h-7 px-2.5 text-xs rounded-md border ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`;
  const seg = <K extends keyof DisplayCfg>(k: K, opts: [DisplayCfg[K], string][]) => (
    <span className="inline-flex flex-wrap gap-1">{opts.map(([v, l]) => <button key={String(v)} type="button" onClick={() => d.set({ [k]: v } as Partial<DisplayCfg>)} className={btn(c[k] === v)}>{l}</button>)}</span>
  );
  const ck = (key: string, on: boolean, label: string, onChange: (v: boolean) => void, disabled = false) => (
    <label key={key} className={`inline-flex items-center gap-1.5 mr-3 mb-1.5 text-[13px] ${disabled ? "text-slate-400" : "text-slate-700 cursor-pointer"}`}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-blue-600" />{label}
    </label>
  );
  const sec = (id: string, title: string, body: ReactNode) => (
    <div key={id} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
      <div className="mb-1.5 text-[13px] font-semibold text-slate-700">{title}</div>
      <div className="pb-3">{body}</div>
    </div>
  );
  const row = (label: string, body: ReactNode) => (
    <div className="flex items-center gap-2 flex-wrap mb-2"><span className="w-24 shrink-0 text-[12px] text-slate-500">{label}</span>{body}</div>
  );
  const sub = (t: string) => <div className="mt-1 text-[11px] text-slate-400">{t}</div>;
  const setShow = (k: keyof DisplayCfg["show"], v: boolean) => d.set({ show: { ...c.show, [k]: v } });
  const setTab = (k: keyof DisplayCfg["tabs"], v: boolean) => d.set({ tabs: { ...c.tabs, [k]: v } });
  const cols = c.cols;
  const dragCols = useDragReorder((from, to) => { if (cols) d.set({ cols: moveItem(cols, from, to) }); }, { group: "disp-cols" });
  const labelOf = (k: string) => colOptions.find(([x]) => x === k)?.[1] ?? k;
  const SHOW: [keyof DisplayCfg["show"], string][] = [["search", "ช่องค้นหา"], ["dev", "ปุ่มคอม/iPad"], ["tabs", "แท็บ"], ["cards", "แถบสรุป"], ["chips", "แถบมุมมองด่วน + แบรนด์"], ["colBtn", "ปุ่ม ▥ คอลัมน์"], ["tools", "ปุ่มจัดกลุ่ม / เรียง / รูป"], ["foot", "คำอธิบายท้ายตาราง"]];
  const TABS: [keyof DisplayCfg["tabs"], string][] = [["pend", "📥 รอจ่าย"], ["wip", "🛠 กำลังผลิต"], ["qc", "✅ รอ QC รับเข้า"]];

  if (tab === "head") return (
    <div>
      {sec("head", "ส่วนหัวหน้า (โชว์/ซ่อนทีละชิ้น)", <>
        <div>{SHOW.map(([k, l]) => ck(`s-${k}`, c.show[k], l, (v) => setShow(k, v)))}</div>
        {!c.show.chips && <p className="mb-1 text-[11px] text-amber-700">แถบมุมมองด่วนถูกซ่อน — ตารางจะใช้มุมมองแรกเสมอ</p>}
        {sub("แท็บที่โชว์")}
        <div>{TABS.map(([k, l]) => ck(`t-${k}`, c.tabs[k], l, (v) => setTab(k, v)))}</div>
        {cardGroups.map(([title, opts]) => (
          <div key={title}>{sub(`ช่องในแถบสรุป · ${title}`)}<div>{opts.map(([k, l]) => ck(`c-${k}`, c.cards[k] !== false, l, (v) => d.set({ cards: { ...c.cards, [k]: v } })))}</div></div>
        ))}
      </>)}
    </div>
  );

  if (tab === "cols") return (
    <div>
      {sec("cols", "คอลัมน์ปกติของแท็บรอจ่าย (ใช้กับมุมมองที่ไม่ได้กำหนดคอลัมน์เอง)", !cols ? (
        <div className="text-[12px] text-slate-500 flex items-center gap-2 flex-wrap">
          ตอนนี้ให้แต่ละคนเลือกเองที่ปุ่ม ▥ คอลัมน์ บนตาราง (จำแยกคอม/iPad)
          <button type="button" onClick={() => d.set({ cols: currentCols })} className={btn(false)}>กำหนดคอลัมน์ในชุดนี้</button>
        </div>
      ) : <>
        <div className="mb-1 text-[11px] text-slate-500">ลำดับซ้าย → ขวา — ลาก ⠿ หรือกด ↑ ↓ · ติ๊กออก = ซ่อน</div>
        <div className="space-y-1 max-w-md">
          {cols.map((k, i) => (
            <div key={k} {...dragCols.rowProps(i)} className={`flex items-center gap-2 rounded-md border border-slate-100 bg-white px-2 py-1 text-[13px] ${dragCols.rowCls(i)}`}>
              <DragHandle {...dragCols.handleProps(i)} />
              <input type="checkbox" checked disabled={k === "prod"} onChange={() => d.set({ cols: cols.filter((x) => x !== k) })} className="w-4 h-4 accent-blue-600" title={k === "prod" ? "คอลัมน์หลัก ซ่อนไม่ได้" : "ติ๊กออกเพื่อซ่อน"} />
              <span className="flex-1">{labelOf(k)}</span>
              <button type="button" onClick={() => d.set({ cols: moveItem(cols, i, i - 1) })} disabled={i === 0} className="h-6 w-6 rounded border border-slate-200 text-xs disabled:opacity-30" title="เลื่อนขึ้น">↑</button>
              <button type="button" onClick={() => d.set({ cols: moveItem(cols, i, i + 1) })} disabled={i === cols.length - 1} className="h-6 w-6 rounded border border-slate-200 text-xs disabled:opacity-30" title="เลื่อนลง">↓</button>
            </div>
          ))}
        </div>
        {colOptions.some(([k]) => !cols.includes(k)) && <>
          {sub("ที่ซ่อนอยู่ — ติ๊กเพื่อเพิ่มท้ายสุด")}
          <div>{colOptions.filter(([k]) => !cols.includes(k)).map(([k, l]) => ck(`h-${k}`, false, l, () => d.set({ cols: [...cols, k] })))}</div>
        </>}
        <button type="button" onClick={() => d.set({ cols: null })} className={`mt-2 ${btn(false)}`}>ให้แต่ละคนเลือกเอง (ใช้ ▥ คอลัมน์)</button>
      </>)}
    </div>
  );

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 flex-wrap">
        <span className="text-[12px] text-slate-500">ชุดหน้าตา:</span>
        {(["normal", "simple", "custom"] as const).map((p) => (
          <button key={p} type="button" onClick={() => d.setPreset(p)} disabled={!!d.editingShared && p === "custom"}
            className={`h-8 px-3 text-sm rounded-lg border disabled:opacity-40 ${d.preset === p ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {p === "normal" ? "ปกติ" : p === "simple" ? "👓 โหมดง่าย" : "✏️ กำหนดเอง"}
          </button>
        ))}
      </div>
      {/* แอดมิน: แก้ชุดกลาง (ทุกคนที่เลือกชุดนี้เห็นตาม) — บันทึกพร้อมปุ่ม 💾 ของป๊อป */}
      {isAdmin && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-[12px] flex items-center gap-2 flex-wrap ${d.editingShared ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-slate-50 text-slate-500"}`}>
          {d.editingShared ? <>
            <span>✏️ กำลังแก้ <b>ชุด{d.editingShared === "simple" ? "โหมดง่าย" : "ปกติ"}กลาง</b> — กด 💾 บันทึก ด้านล่าง ทุกคนที่ใช้ชุดนี้จะเห็นตาม</span>
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={d.resetSharedToFactory} className="h-7 px-2.5 rounded-md border border-amber-300 bg-white">คืนค่าตั้งต้น</button>
              <button type="button" onClick={d.cancelEditShared} className="h-7 px-2.5 rounded-md border border-amber-300 bg-white">เลิกแก้ชุดกลาง</button>
            </span>
          </> : <>
            <span>คุณเป็นแอดมิน — แก้ชุด <b>ปกติ</b> / <b>โหมดง่าย</b> ให้ทุกคนได้ (ปรับเฉย ๆ = เป็น &quot;กำหนดเอง&quot; ของคุณคนเดียว)</span>
            <button type="button" onClick={d.startEditShared} className="ml-auto h-7 px-2.5 rounded-md border border-slate-300 bg-white text-slate-700">✏️ แก้ชุด{d.preset === "simple" ? "โหมดง่าย" : "ปกติ"}กลาง</button>
          </>}
        </div>
      )}

      {sec("size", "ขนาด", <>
        {row("ขนาดทั้งหน้า", <>
          <input type="range" min={80} max={170} step={5} value={c.scale} onChange={(e) => d.set({ scale: Number(e.target.value) })} className="flex-1 min-w-[10rem] accent-blue-600" />
          <span className="w-12 text-right text-[12px] tabular-nums text-slate-600">{c.scale}%</span>
          <button type="button" onClick={() => d.set({ scale: 100 })} className={btn(false)}>100%</button>
        </>)}
        {row("ความสูงแถว", seg("row", [["s", "แน่น"], ["m", "ปกติ"], ["l", "โปร่ง"]]))}
        {row("รูปในตาราง", seg("img", [["0", "ไม่โชว์"], ["s", "เล็ก"], ["m", "กลาง"], ["l", "ใหญ่"]]))}
      </>)}

      {sec("table", "ตาราง", <>
        {ck("check", c.check, "ช่องติ๊กเลือกหลายใบ (+ ปุ่มทำหลายใบ)", (v) => d.set({ check: v }))}
        {ck("expand", c.expand, "แตะแถวกางดูของที่ขาด (ปิด = แตะแถวเปิดเช็กลิสต์)", (v) => d.set({ expand: v }))}
        {ck("zebra", c.zebra, "แถวสลับสี", (v) => d.set({ zebra: v }))}
        {ck("edit", c.edit, "แก้ในตารางได้ (ดับเบิลคลิกวัน/ค่าแรง)", (v) => d.set({ edit: v }))}
      </>)}

      {sec("data", "รูปแบบข้อมูล", <>
        {row("ขั้นตอน", seg("stage", [["dots", "จุดขั้นตอน"], ["words", "คำพูด"], ["pill", "ป้ายสี"]]))}
        {row("ซื้อของ", seg("buy", [["bar", "แถบสี + ตัวเลข"], ["words", "คำพูด"]]))}
        {row("กำหนดส่ง", seg("due", [["date", "วันที่"], ["days", "อีก/เลย กี่วัน"], ["both", "ทั้งคู่"]]))}
      </>)}

      {sec("def", "ค่าเริ่มต้นตอนเปิด (ใช้กับมุมมองที่ไม่ได้ตั้งเรียง)", <>
        {row("เรียง", seg("sortDef", [["none", "ตามระบบ"], ["urgent", "เร่งด่วนก่อน"], ["old", "ใบเก่าก่อน"], ["value", "มูลค่ามากก่อน"]]))}
        <p className="text-[11px] text-slate-400">เร่งด่วนก่อน = เลยกำหนดนานสุดขึ้นก่อน → งานเร่ง → รอซื้อของ → … · กดเรียงที่หัวตารางเองได้ตามปกติ</p>
      </>)}
    </div>
  );
}
