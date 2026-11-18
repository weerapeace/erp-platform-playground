"use client";

/**
 * คิดเร็ว — เครื่องคิดผ้าแบบลอย (เจ้าของขอ 2026-11-18 "คำนวณแบบลอย ๆ ใส่ขนาดแล้วคำนวณเลย")
 *   ปุ่มกลมมุมขวาล่างของหน้า /fabric-calc (ทุกแท็บ) → PC: หน้าต่างเล็กลอย ลากย้าย/ย่อได้ · มือถือ: แผ่นเลื่อนจากล่าง (BottomSheet กลาง)
 *   ใส่ กว้าง × ยาว × ชิ้น/ใบ (หลายแถว) + หน้าผ้า + ผลิตกี่ใบ → ได้หลา/เมตรทันที (วางจริงด้วย packFabric ตัวเดียวกับทั้งหน้า · ไม่ใช่หารพื้นที่)
 *   "ส่งเข้าคิดละเอียด" = ยกชิ้น/หน้าผ้า/จำนวนไปโหมดผ้าเดียว ขั้น 2 (เลือกผ้า ราคา สต็อก แล้วพิมพ์/ส่งจัดซื้อต่อ)
 *   จำค่าที่พิมพ์ไว้ในเครื่อง (localStorage) · ไม่บันทึกลงฐานข้อมูล
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { BottomSheet } from "@/components/modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { packFabric, YARD_CM } from "@/lib/fabric-calc";
import type { BuyPiece } from "@/lib/fabric-buy";

export type QuickSend = { pieces: Omit<BuyPiece, "key">[]; face: number; qty: number };
/** ส่งจากแท็บอื่นของหน้า (sessionStorage) → แท็บคิดผ้าก่อนซื้อหยิบไปตอนเปิด */
export const QUICK_HANDOFF_KEY = "fabric-quick-handoff";
type QRow = { k: string; w: number; l: number; n: number };
type QState = { rows: QRow[]; face: number; qty: number; waste: number; rotate: boolean };

const LS = "fabric-quick-calc";
let seq = 0;
const row = (p?: Partial<QRow>): QRow => ({ k: `q${seq++}`, w: 0, l: 0, n: 1, ...p });
const DEF: QState = { rows: [row({ w: 40, l: 35, n: 2 })], face: 150, qty: 100, waste: 3, rotate: true };
const fmt = (v: number, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("th-TH", { maximumFractionDigits: d });

function load(): QState {
  try {
    const j = JSON.parse(window.localStorage.getItem(LS) ?? "null") as QState | null;
    if (j && Array.isArray(j.rows) && j.rows.length) return { ...DEF, ...j, rows: j.rows.map((r) => row(r)) };
  } catch { /* ไม่มีค่าเดิม */ }
  return DEF;
}

/** ช่องตัวเลข — มือถือขึ้นแป้นตัวเลข · เลือกทั้งช่องตอนกด (พิมพ์ทับได้เลย) */
function N({ value, onChange, big, label }: { value: number; onChange: (v: number) => void; big?: boolean; label: string }) {
  const [txt, setTxt] = useState(value ? String(value) : "");
  useEffect(() => { setTxt((t) => (Number(t) === value ? t : value ? String(value) : "")); }, [value]);   // ค่าเปลี่ยนจากข้างนอก → ตามไป · พิมพ์ "1." ค้างได้
  return (
    <input aria-label={label} type="text" inputMode="decimal" value={txt} placeholder="0"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => { const t = e.target.value.replace(/[^\d.]/g, ""); setTxt(t); const v = Number(t); onChange(Number.isFinite(v) ? v : 0); }}
      className={`w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-right tabular-nums outline-none focus:border-indigo-400 ${big ? "h-11 text-base" : "h-8 text-[13px]"}`} />
  );
}

export function QuickFabricCalc({ onSend }: { onSend: (q: QuickSend) => void }) {
  const phone = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [st, setSt] = useState<QState>(DEF);
  const loaded = useRef(false);
  useEffect(() => { setSt(load()); loaded.current = true; }, []);
  useEffect(() => { if (!loaded.current) return; try { window.localStorage.setItem(LS, JSON.stringify(st)); } catch { /* ไม่จำ */ } }, [st]);
  const set = (p: Partial<QState>) => setSt((s) => ({ ...s, ...p }));
  const setRow = (k: string, p: Partial<QRow>) => setSt((s) => ({ ...s, rows: s.rows.map((r) => (r.k === k ? { ...r, ...p } : r)) }));

  const good = st.rows.filter((r) => r.w > 0 && r.l > 0 && r.n > 0);
  const res = useMemo(() => {
    if (!good.length || !(st.face > 0) || !(st.qty > 0)) return null;
    return packFabric({ pieces: good.map((r) => ({ key: r.k, label: `${r.w}×${r.l}`, width_cm: r.w, length_cm: r.l, qty: Math.round(r.n * st.qty) })), faceWidthCm: st.face, allowRotate: st.rotate, wastePercent: st.waste, gapCm: 0 });
  }, [good, st.face, st.qty, st.rotate, st.waste]);
  const eff = res?.ok && res.usedLengthCm > 0 ? (res.pieceAreaCm2 / (st.face * res.usedLengthCm)) * 100 : 0;

  // ── ลากย้าย (PC) ──
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const onDown = (e: React.PointerEvent) => {
    const r = boxRef.current?.getBoundingClientRect(); if (!r) return;
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !boxRef.current) return;
    const w = boxRef.current.offsetWidth, h = boxRef.current.offsetHeight;
    setPos({ x: Math.min(window.innerWidth - w - 4, Math.max(4, e.clientX - drag.current.dx)), y: Math.min(window.innerHeight - 40, Math.max(4, e.clientY - drag.current.dy)) });
  };
  const onUp = () => { drag.current = null; };

  const send = () => {
    if (!good.length) return;
    onSend({ pieces: good.map((r) => ({ label: `${r.w}×${r.l}`, width_cm: r.w, length_cm: r.l, per_unit: r.n })), face: st.face, qty: st.qty });
    setOpen(false);
  };

  const body = (
    <div className="space-y-2 text-[13px]">
      <div className="grid grid-cols-[1fr_1fr_0.8fr_1.6rem] gap-1.5 text-[11px] text-slate-500"><span>กว้าง ซม.</span><span>ยาว ซม.</span><span>ชิ้น/ใบ</span><span /></div>
      {st.rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[1fr_1fr_0.8fr_1.6rem] items-center gap-1.5">
          <N label="กว้าง" big={phone} value={r.w} onChange={(v) => setRow(r.k, { w: v })} />
          <N label="ยาว" big={phone} value={r.l} onChange={(v) => setRow(r.k, { l: v })} />
          <N label="ชิ้นต่อใบ" big={phone} value={r.n} onChange={(v) => setRow(r.k, { n: v })} />
          <button type="button" title="ลบแถว" disabled={st.rows.length < 2} onClick={() => set({ rows: st.rows.filter((x) => x.k !== r.k) })} className="text-slate-300 hover:text-rose-500 disabled:opacity-30"><Icon name="x" /></button>
        </div>
      ))}
      <button type="button" onClick={() => set({ rows: [...st.rows, row()] })} className="inline-flex items-center gap-1 text-[12px] text-indigo-600 hover:underline"><Icon name="plus" /> เพิ่มชิ้น</button>
      <div className="grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
        <label className="space-y-0.5"><span>หน้าผ้า ซม.</span><N label="หน้าผ้า" big={phone} value={st.face} onChange={(v) => set({ face: v })} /></label>
        <label className="space-y-0.5"><span>ผลิตกี่ใบ</span><N label="จำนวนผลิต" big={phone} value={st.qty} onChange={(v) => set({ qty: v })} /></label>
        <label className="space-y-0.5"><span>เผื่อเสีย %</span><N label="เผื่อเสีย" big={phone} value={st.waste} onChange={(v) => set({ waste: v })} /></label>
      </div>
      <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={st.rotate} onChange={(e) => set({ rotate: e.target.checked })} /> หมุนชิ้นได้ (ผ้าไม่มีลายทิศทาง)</label>
      <div className="rounded-xl bg-indigo-50 px-3 py-2">
        {!res ? <div className="text-[12px] text-slate-500">ใส่ขนาดชิ้น หน้าผ้า และจำนวนผลิต</div>
          : !res.ok ? <div className="text-[12px] text-rose-600">{res.error}</div>
          : <>
              <div className="flex items-baseline gap-2"><b className="text-2xl font-bold tabular-nums text-indigo-700">{fmt(res.lengthWithWasteCm / YARD_CM)}</b><span className="text-indigo-700">หลา</span><span className="ml-auto text-[12px] text-slate-500">{fmt(res.lengthWithWasteCm / 100)} ม.</span></div>
              <div className="text-[11.5px] text-slate-500">ใช้ต่อใบ {fmt(res.usedLengthCm / st.qty, 1)} ซม. · คุ้ม {fmt(eff, 1)}% · รวมเผื่อเสีย {fmt(st.waste, 1)}%</div>
            </>}
      </div>
    </div>
  );
  const sendBtn = (
    <button type="button" disabled={!good.length} onClick={send} className={`inline-flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 font-medium text-white hover:bg-indigo-700 disabled:opacity-50 ${phone ? "h-11 text-sm" : "h-8 text-[12.5px]"}`}><Icon name="send" /> ส่งเข้าคิดละเอียด (เลือกผ้า · ราคา · พิมพ์)</button>
  );

  return (
    <>
      {!open && (
        <button type="button" onClick={() => { setOpen(true); setMini(false); }} title="คิดเร็ว — ใส่ขนาดแล้วได้หลาทันที"
          className="fixed bottom-24 right-4 z-40 inline-flex h-12 items-center gap-1.5 rounded-full bg-indigo-600 px-4 text-sm font-medium text-white shadow-lg hover:bg-indigo-700 lg:bottom-6">
          <Icon name="calculator" /> คิดเร็ว
        </button>
      )}
      {open && phone && (
        <BottomSheet open onClose={() => setOpen(false)} title="คิดเร็ว" subtitle="ใส่ขนาดแล้วได้หลาทันที" backKey="quick-calc" footer={sendBtn}>{body}</BottomSheet>
      )}
      {open && !phone && (
        <div ref={boxRef} className="fixed z-40 w-[300px] rounded-2xl border border-indigo-200 bg-white shadow-2xl"
          style={pos ? { left: pos.x, top: pos.y } : { right: 24, bottom: 24 }}>
          <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} className="flex cursor-move select-none items-center gap-1.5 rounded-t-2xl border-b border-slate-100 bg-indigo-50/60 px-3 py-2">
            <Icon name="calculator" /> <b className="text-[13px] text-indigo-800">คิดเร็ว</b>
            {mini && res?.ok && <span className="text-[12px] tabular-nums text-indigo-700">{fmt(res.lengthWithWasteCm / YARD_CM)} หลา</span>}
            <span className="ml-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" title={mini ? "ขยาย" : "ย่อ"} onClick={() => setMini((v) => !v)} className="rounded p-1 text-slate-500 hover:bg-white"><Icon name={mini ? "chevron-down" : "minus"} /></button>
              <button type="button" title="ปิด" onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:bg-white"><Icon name="x" /></button>
            </span>
          </div>
          {!mini && <div className="max-h-[70vh] space-y-2 overflow-y-auto p-3">{body}{sendBtn}</div>}
        </div>
      )}
    </>
  );
}
