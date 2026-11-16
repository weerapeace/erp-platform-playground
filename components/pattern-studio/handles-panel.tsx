"use client";
/**
 * 👜 HandlesPanel — หูหิ้วและห่วง (Bag CAD รอบ J2 · ส่วนของสตูดิโอแพทเทิร์น · แผงใต้ภาพ 3D แบบเย็บติดแล้ว)
 *   หาชิ้นหู (ยาวแคบ) + แถบเล็กจากกระดาน → ตั้งแบบหู (แบน / ม้วนกลม / ม้วนกลาง ปลายแบน) · ความสูงหูพ้นปาก · ไส้เชือก
 *   ปลายหูยึดตาม "จุดติดหู" บนแผ่นหน้า/หลัง (จากหน้าตรวจหลังนำเข้า J1) · ไม่มีจุด = ใช้ระยะห่างโคนหูที่ตั้ง
 *   ชิ้นหูยาวเท่ากัน 2 ชิ้น = ประกบนอก+ใน เป็นหู 1 เส้น · ห่วง/แถบ: แถบห่วง D ×2 · แถบกระดุมปิด ×1 · ห่วงยึดสายสะพาย ×2
 *   เปิดแผงอยู่ = ลากลูกกลมสีส้มที่ปลายหูในภาพ 3D เพื่อย้ายจุดติดได้ (ผู้เรียกส่ง onHandleMove ให้ Pattern3D)
 *   สูตร: lib/pattern-handles · จุดติดเก็บใน Attach (lib/pattern-assembly)
 *
 *   <HandlesPanel pieces={asmPieces} asm={assemblyOk} attaches={attaches} onAttachesChange={…} onClose={…} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md (รอบ J2)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { RangeInput } from "@/components/range-input";
import type { AssemblyOk, Attach } from "@/lib/pattern-assembly";
import { CORD_MM, DEFAULT_HANDLE_STYLE, HANDLE_STYLES, TAB_KINDS, handleDims, heightForLen, lenForHeight, pairHandlePieces, pairSpots, rolledDiameter, spotCenters, type HandleStyle, type TabKind } from "@/lib/pattern-handles";
import { guessPieceTypes } from "@/lib/pattern-import-assist";
import { shapeBox, type InnerLine, type Pt, type Shape } from "@/lib/pattern-shape";

type P = { pid: string; name?: string; shape: Shape; holes?: Shape[]; inner?: InnerLine[] | null };
const TAIL = 4;
const TAB_N: Record<TabKind, number> = { dring: 2, snap: 1, strap: 2 };

export function HandlesPanel({ pieces, asm, attaches, onAttachesChange, onClose }: {
  pieces: P[]; asm: AssemblyOk; attaches: Attach[];
  onAttachesChange?: (next: Attach[]) => void; onClose: () => void;
}) {
  const t = useT();
  const types = useMemo(() => guessPieceTypes(pieces.map((p) => ({ shape: p.shape, holes: p.holes ?? [], inner: p.inner ?? null }))), [pieces]);
  const panelSet = new Set([asm.front, asm.back, ...asm.bridges]);   // ชิ้นที่เป็นตัวกระเป๋าแล้ว (แผ่นหน้า/หลัง/ชิ้นข้างยาวแคบ) ไม่ใช่หู
  const handlePieces = pieces.filter((p, i) => types[i] === "handle" && !panelSet.has(p.pid));
  const tabPieces = pieces.filter((p, i) => types[i] === "tab" && !panelSet.has(p.pid));
  const cur = attaches.filter((a) => a.kind === "handle");
  const [style, setStyle] = useState<HandleStyle>(cur[0]?.style ?? DEFAULT_HANDLE_STYLE);
  const [cord, setCord] = useState<number>(cur[0]?.cord ?? 10);
  const [pairOn, setPairOn] = useState(true);
  const units = useMemo(() => (pairOn ? pairHandlePieces(handlePieces) : handlePieces.map((p) => ({ main: p, inner: undefined as P | undefined }))), [pairOn, handlePieces]);   // eslint-disable-line react-hooks/exhaustive-deps
  // จุดติดหูบนแผ่นหน้า/หลัง → คู่ปลายหู
  const slots = useMemo(() => {
    const out: { on: string; a: Pt; b: Pt; fromSpot: boolean }[] = [];
    for (const on of asm.front === asm.back ? [asm.front] : [asm.front, asm.back]) {
      const p = pieces.find((x) => x.pid === on); if (!p) continue;
      for (const [a, b] of pairSpots(spotCenters(p))) out.push({ on, a, b, fromSpot: true });
    }
    return out;
  }, [asm, pieces]);
  const spotCount = slots.length * 2;
  const [gap, setGap] = useState(() => { const c = cur[0]; return c?.a && c.b ? Math.round(Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) * 2) / 2 : Math.max(4, Math.round(asm.width * 0.4)); });
  const useGap = slots.length ? Math.hypot(slots[0].b[0] - slots[0].a[0], slots[0].b[1] - slots[0].a[1]) : gap;
  const baseLen = units[0] ? handleDims(units[0].main.shape, TAIL).len : cur[0]?.len ?? 40;
  const [drop, setDrop] = useState(() => heightForLen(useGap, cur[0]?.len ?? baseLen));
  const baseW = units[0] ? handleDims(units[0].main.shape, TAIL).w : cur[0]?.w ?? 3;
  const freeTabs = tabPieces.filter((p) => !attaches.some((a) => a.pid === p.pid && a.kind !== "tab"));
  const [tabsOn, setTabsOn] = useState<Record<TabKind, boolean>>({ dring: freeTabs.length >= 2, snap: freeTabs.length >= 3, strap: false });

  const plan = useMemo(() => {
    const stamp = "ah", len = lenForHeight(useGap, drop), out: Attach[] = [];
    const defSlots = (): { on: string; a: Pt; b: Pt; fromSpot: boolean }[] => {
      const one = (side: "front" | "back") => { const top = asm.panelH[side === "front" ? 0 : 1]; return { on: side === "front" ? asm.front : asm.back, a: asm.toLocal[side]([-gap / 2, top]), b: asm.toLocal[side]([gap / 2, top]), fromSpot: false }; };
      return asm.front === asm.back ? [one("front")] : [one("front"), one("back")];
    };
    const use = slots.length ? slots : defSlots();
    use.forEach((s, i) => {
      const u = units[i]; if (!u) return;
      const w = handleDims(u.main.shape, TAIL).w;
      out.push({ id: `${stamp}${i}`, kind: "handle", pid: u.main.pid, on: s.on, a: s.a, b: s.b, len, w, tail: TAIL, style, ...(style !== "flat" && cord ? { cord } : {}), ...(u.inner ? { inner: u.inner.pid } : {}) });
    });
    // ห่วง/แถบ: แถบห่วง D ข้างซ้าย-ขวาแผ่นหน้า · กระดุมกลางปากแผ่นหลัง · ห่วงสายสะพายข้างซ้าย-ขวาแผ่นหลัง (ตำแหน่งตั้งต้น · ลากย้ายไม่ได้)
    const pool = [...freeTabs]; let k = 0;
    const box = (pid: string) => shapeBox(pieces.find((p) => p.pid === pid)!.shape);
    for (const tk of ["dring", "snap", "strap"] as TabKind[]) {
      if (!tabsOn[tk]) continue;
      const on = tk === "dring" ? asm.front : asm.back, b = box(on);
      const at: Pt[] = tk === "snap" ? [[b.w / 2, 1.5]] : [[1.5, 1.5], [b.w - 1.5, 1.5]];
      for (const q of at.slice(0, TAB_N[tk])) { const p = pool.shift(); if (!p) break; out.push({ id: `at${k++}`, kind: "tab", pid: p.pid, on, a: q, tab: tk }); }
    }
    return out;
  }, [slots, units, style, cord, drop, gap, useGap, tabsOn, asm, pieces, freeTabs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const nH = plan.filter((a) => a.kind === "handle").length, nT = plan.filter((a) => a.kind === "tab").length;
  const apply = () => {
    if (!onAttachesChange) return;
    const mine = new Set(plan.flatMap((a) => [a.pid, ...(a.inner ? [a.inner] : [])]));
    const keep = attaches.filter((a) => !(a.kind === "handle" || a.kind === "tab") || (!mine.has(a.pid) && !a.id.startsWith("ah") && !a.id.startsWith("at")));
    onAttachesChange([...keep, ...plan.map((a) => ({ ...a, id: `${a.id}${Date.now().toString(36)}` }))]);
  };
  const remove = () => onAttachesChange?.(attaches.filter((a) => a.kind !== "handle" && a.kind !== "tab"));
  const dia = rolledDiameter(baseW, style === "flat" ? 0 : cord);
  const chip = (on: boolean) => `h-7 rounded-md border px-2 text-xs ${on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs" data-handles-panel>
      <div className="flex items-center gap-1.5 font-medium text-slate-700"><Icon value="i:shopping-bag" className="text-sm" />{t("หูหิ้วและห่วง", "Handles and loops")}
        <button type="button" onClick={onClose} className="ml-auto rounded px-1 text-slate-400 hover:text-slate-700" aria-label={t("ปิด", "Close")}>✕</button></div>
      <div className="space-y-1.5 rounded-md border border-slate-100 p-2">
        <div className="flex flex-wrap items-center gap-1.5"><b className="font-medium">{t(`หู ${units.length} เส้น`, `${units.length} handles`)}</b>
          <span className="text-slate-500">{t(`จากชิ้นหู ${handlePieces.length} ชิ้น`, `from ${handlePieces.length} handle pieces`)}</span>
          <label className="ml-auto inline-flex items-center gap-1 text-slate-600"><input type="checkbox" checked={pairOn} onChange={(e) => setPairOn(e.target.checked)} data-handles-pair />{t("ประกบนอก+ใน", "Pair outer+inner")}</label></div>
        {!handlePieces.length && <p className="text-amber-700">{t("ไม่พบชิ้นหู (ชิ้นยาวแคบ) บนกระดาน — วาดชิ้นหู หรือใช้ \"ชิ้นกระเป๋า → สาย/หู\"", "No handle pieces (long narrow strips) on the board — draw one or use Bag parts → Strap")}</p>}
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("แบบหู", "Handle style")}>
          {HANDLE_STYLES.map((s) => <button key={s.key} type="button" onClick={() => setStyle(s.key)} aria-pressed={style === s.key} className={chip(style === s.key)} data-handle-style={s.key}>{t(s.th, s.en)}</button>)}
        </div>
        <RangeInput label={t("ความสูงหูพ้นโคน", "Handle height above the ends")} unit={t("ซม.", "cm")} min={4} max={40} step={0.5} value={drop} onChange={setDrop} />
        {style !== "flat" && <div className="flex flex-wrap items-center gap-1.5">{t("ไส้เชือก", "Cord")}
          <select value={cord} onChange={(e) => setCord(Number(e.target.value))} className="h-7 rounded-md border border-slate-200 bg-white px-1" data-handle-cord>
            {CORD_MM.map((v) => <option key={v} value={v}>{v ? t(`${v} มม.`, `${v} mm`) : t("ไม่ใส่", "None")}</option>)}
          </select>
          <span className="text-slate-500">{t(`ยาวหู ${lenForHeight(useGap, drop)} ซม. · หูม้วนโต ⌀ ${dia} ซม.`, `length ${lenForHeight(useGap, drop)} cm · rolled ⌀ ${dia} cm`)}</span></div>}
        {slots.length ? <p className="flex items-center gap-1 text-slate-600"><Icon value="i:map-pin" className="text-rose-600" />{t(`ยึดปลายหูที่จุดติดหู ${spotCount} จุด (${slots.length} คู่)`, `Handle ends at ${spotCount} handle spots (${slots.length} pairs)`)}</p>
          : <><p className="text-slate-500">{t("ไม่พบจุดติดหูบนแผ่นหน้า/หลัง — ใช้ระยะห่างโคนหู (จุดติดหูมาจากหน้าตรวจหลังนำเข้า DXF)", "No handle spots on the front/back — using the gap below (spots come from the DXF import review)")}</p>
            <RangeInput label={t("ระยะห่างโคนหู", "Gap between ends")} unit={t("ซม.", "cm")} min={4} max={Math.max(5, Math.floor(asm.width - 2))} step={0.5} value={gap} onChange={setGap} /></>}
        {units.length > 0 && units.length < (slots.length || (asm.front === asm.back ? 1 : 2)) && <p className="text-amber-700">{t("ชิ้นหูไม่พอสำหรับทุกจุด — ติดเท่าที่มี", "Not enough handle pieces for every spot — attaching what there is")}</p>}
      </div>
      <div className="space-y-1 rounded-md border border-slate-100 p-2" data-handles-tabs>
        <div className="flex items-center gap-1.5"><b className="font-medium">{t("ห่วงและแถบ", "Loops and tabs")}</b><span className="text-slate-500">{t(`แถบเล็กที่ว่าง ${freeTabs.length} ชิ้น`, `${freeTabs.length} free tabs`)}</span></div>
        {TAB_KINDS.map((k) => (
          <label key={k.key} className="flex items-center gap-1.5"><input type="checkbox" checked={tabsOn[k.key]} onChange={(e) => setTabsOn((s) => ({ ...s, [k.key]: e.target.checked }))} data-tab-kind={k.key} />
            {t(k.th, k.en)} ×{TAB_N[k.key]}<span className="text-slate-400">{k.key === "dring" ? t("· ข้างซ้าย/ขวา แผ่นหน้า", "· left/right of the front") : k.key === "snap" ? t("· กลางปาก แผ่นหลัง", "· top centre of the back") : t("· ข้างซ้าย/ขวา แผ่นหลัง", "· left/right of the back")}</span></label>
        ))}
        <p className="text-[11px] text-slate-400">{t("ห่วงและกระดุมในภาพเป็นรูปชั่วคราว — อะไหล่ 3D จริงมาในรอบ J3", "Rings and snaps are placeholders — real 3D hardware comes in round J3")}</p>
      </div>
      {onAttachesChange && <p className="text-[11px] text-slate-500">{t("เปิดแผงนี้อยู่: ลากลูกกลมสีส้มที่ปลายหูในภาพ 3D เพื่อย้ายจุดติด", "While this panel is open: drag the orange dots at the handle ends in the 3D view to move them")}</p>}
      <div className="flex flex-wrap justify-end gap-1.5">
        {cur.length > 0 && onAttachesChange && <button type="button" onClick={remove} className="mr-auto h-8 rounded-md border border-slate-200 px-2 text-slate-500 hover:text-rose-600">{t("เอาหูและห่วงออก", "Remove handles and loops")}</button>}
        <button type="button" onClick={onClose} className="h-8 rounded-md border border-slate-200 px-3 hover:bg-slate-50">{t("ปิด", "Close")}</button>
        {onAttachesChange && <button type="button" disabled={!nH && !nT} onClick={apply} className="h-8 rounded-md bg-blue-600 px-3 text-white hover:bg-blue-700 disabled:opacity-40" data-handles-apply>{t(`ติดหู ${nH} เส้น + ห่วง ${nT} จุด`, `Attach ${nH} handles + ${nT} loops`)}</button>}
      </div>
    </div>
  );
}
