"use client";
/**
 * 👜 BagTemplateWizard — สร้างชิ้นแพทเทิร์นจากแม่แบบทรงกระเป๋า (ส่วนของสตูดิโอแพทเทิร์น)
 *   ใส่ขนาดกระเป๋าตอนเสร็จ → เห็นกระเป๋าที่เย็บแล้วเป็นภาพ 3D ทันที + รายการชิ้นที่จะได้ + คำอธิบายว่าช่างคิดยังไง
 *   กด "วางชิ้นลงกระดาน" → ชิ้นไปอยู่บนกระดานวาดเป็นชิ้นจริง แก้ต่อได้ (ไม่ผูกกับแม่แบบอีก)
 *   เลือกทรงได้ 6 ทรง (2026-11-11 · lib/bag-kits): Tote (ฟอร์มเดิมทั้งหมด) · ถุงผ้า · ซองซิป · ทรงกล่อง · ฝาปิด · ทรงกลม — ทรง 2–6 ใช้ฟอร์มสั้น + ภาพชิ้นแบน (KitBody)
 *   ทุกทรงได้ซับในมาพร้อมกัน (ติ๊กออกได้) + ช่องใส่ของในซับใน 1 ช่อง (ติ๊กออกได้) · กดวาง = ส่ง "ชุด" (BagKit: ชิ้น + ตะเข็บ + จุดติด) ให้หน้าจอวางทีเดียว
 * สูตร: lib/bag-templates · lib/bag-kits · ภาพ 3D: components/pattern-3d · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { RangeInput } from "@/components/range-input";
import { Pattern3D } from "@/components/pattern-3d";
import { BAG_STYLES, KIT_LIMITS, KIT_OPTS_DEFAULT, bagKit, bagStyle, kitParams, toteKit, type BagKit, type BagStyle, type KitKey, type KitOpts, type KitParams } from "@/lib/bag-kits";
import { flattenShape, shapeBox } from "@/lib/pattern-shape";
import { BAG_DEFAULT, BAG_LIMITS, BAG_PRESETS, BAG_PVC_MARGIN, bagGeometry, bagPieces, type BagGeometry, type BagNumKey, type BagParams, type BagPiece, type BagWindow, type BagWinType } from "@/lib/bag-templates";

const f1 = (x: number) => x.toFixed(1);
const SQFT = 929.03;
const COLORS: [string, string, string][] = [["#9a6a45", "น้ำตาลแทน", "Tan"], ["#4a3023", "น้ำตาลเข้ม", "Dark brown"], ["#26272b", "ดำ", "Black"], ["#d9cdb4", "ครีมแคนวาส", "Canvas cream"], ["#5d6b45", "เขียวมะกอก", "Olive"], ["#6f2531", "แดงเบอร์กันดี", "Burgundy"], ["#27364f", "กรมท่า", "Navy"]];

export function BagTemplateWizard({ open, onClose, onInsert, initial, notice, pocket: canPocket = true }: {
  /** หน้านี้วางช่องใส่ของในซับในได้ไหม (ต้องมีเส้นในชิ้น + เครื่องมือเย็บ) — ใบงานออกแบบ = ไม่ได้ จึงไม่โชว์ตัวเลือก */
  pocket?: boolean;
  open: boolean;
  onClose: () => void;
  /** ค่าตั้งต้น (เช่น ค่าที่ AI ร่างจากรูปกระเป๋า) — ไม่ส่ง = ค่าเริ่มต้นของแม่แบบ */
  initial?: Partial<BagParams>;
  /** ข้อความแจ้งเหนือฟอร์ม (เช่น "ค่าจาก AI ตรวจก่อนวาง") */
  notice?: string;
  /** ผู้ใช้กดวางชิ้นลงกระดาน */
  onInsert: (kit: BagKit) => void;
}) {
  const t = useT();
  const [params, setParams] = useState<BagParams>(() => ({ ...BAG_DEFAULT, ...initial }));
  const [explode, setExplode] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [body, setBody] = useState(COLORS[0][0]);
  const [handle, setHandle] = useState(COLORS[1][0]);
  const G = useMemo(() => bagGeometry(params), [params]);
  const pieces = useMemo(() => bagPieces(G), [G]);
  const p = G.p;
  const set = (k: BagNumKey, v: number) => setParams((old) => ({ ...old, [k]: v }));
  const colors = useMemo(() => ({ body, handle }), [body, handle]);
  // ทรงที่เลือก + ค่าของทรง 2–6 (จำแยกรายทรงระหว่างสลับ) + ตัวเลือกซับใน/ช่องใส่ของ
  const [style, setStyle] = useState<BagStyle>("tote");
  const [kp, setKp] = useState<Partial<Record<BagStyle, Partial<KitParams>>>>({});
  const [opts, setOpts] = useState<KitOpts>(KIT_OPTS_DEFAULT);
  const kit = useMemo(() => (style === "tote" ? toteKit(params, { ...opts, pocket: canPocket && opts.pocket }) : bagKit(style, kp[style] ?? {}, { ...opts, pocket: canPocket && opts.pocket })), [style, params, kp, opts, canPocket]);
  const kitTotal = kit.pieces.reduce((n, q) => n + q.count, 0);

  const area = pieces.reduce((s, q) => s + q.cut.w * q.cut.h * q.count, 0);
  const total = pieces.reduce((s, q) => s + q.count, 0);
  const partName = (k: string) => (k === "side" ? t("ข้าง", "side") : k === "corner" ? t("โค้ง", "corner") : t("ก้น", "bottom"));

  const field = (k: BagNumKey, th: string, en: string, lim?: { min?: number; max?: number }) => (
    <RangeInput key={k} label={t(th, en)} ariaLabel={t(th, en)} unit={t("ซม.", "cm")} value={p[k]} step={BAG_LIMITS[k].step}
      min={lim?.min ?? BAG_LIMITS[k].min} max={lim?.max ?? BAG_LIMITS[k].max} onChange={(v) => set(k, v)} />
  );
  const seg = (on: boolean) => `h-8 flex-1 rounded-md px-2 text-xs ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`;
  const winTypes: [BagWinType | "none", string, string][] = [["none", "ไม่มี", "None"], ["window", "หน้าต่างโชว์", "Display window"], ["zip", "ช่องซิป", "Zip opening"], ["slot", "ช่องสอด", "Slot"]];
  const wins: [BagWindow, string, string][] = [["none", "ไม่มี", "None"], ["rect", "เหลี่ยมมน", "Rounded"], ["heart", "หัวใจ", "Heart"], ["circle", "วงกลม", "Circle"]];
  const swatches = (value: string, onPick: (c: string) => void, label: string) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-full text-xs text-slate-600">{label}</span>
      {COLORS.map(([c, th, en]) => (
        <button key={c} type="button" onClick={() => onPick(c)} title={t(th, en)} aria-label={`${label} ${t(th, en)}`} aria-pressed={value === c}
          className={`h-6 w-6 rounded-full border border-slate-300 ${value === c ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: c }} />
      ))}
    </div>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="bag-template-wizard"
      title={t("สร้างชิ้นจากแม่แบบทรงกระเป๋า", "Create pieces from a bag template")}
      description={t("ใส่ขนาดกระเป๋าตอนเสร็จ ระบบคิดชิ้นแพทเทิร์นให้ครบ แล้ววางลงกระดานเป็นชิ้นที่แก้ต่อได้", "Enter the finished bag size. The pieces are worked out for you and placed on the board, ready to edit.")}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" data-kit-insert onClick={() => onInsert(kit)} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">{t(`วางชิ้นลงกระดาน (${kit.pieces.length} แบบ ${kitTotal} ชิ้น)`, `Place on the board (${kit.pieces.length} patterns, ${kitTotal} pcs)`)}</button>
      </>}>
      {notice && <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><Icon value="i:sparkles" className="mt-0.5 text-sm" /><span>{notice}</span></div>}
      {/* ── เลือกทรง + ซับใน ── */}
      <div className="mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label={t("ทรงกระเป๋า", "Bag style")}>
          {BAG_STYLES.map((st) => (
            <button key={st.key} type="button" data-style={st.key} onClick={() => setStyle(st.key)} aria-pressed={style === st.key}
              className={`rounded-lg border px-2.5 py-2 text-left ${style === st.key ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:border-blue-300"}`}>
              <div className="text-[13px] font-medium text-slate-800">{t(st.th, st.en)}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{t(st.hintTh, st.hintEn)}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" data-kit-lining checked={opts.lining} onChange={(e) => setOpts((o) => ({ ...o, lining: e.target.checked }))} className="h-3.5 w-3.5 accent-blue-600" />{t("สร้างซับในมาด้วย (ขนาดเท่าตัวนอก ผูกรูปกับตัวนอก)", "Create the lining too (same size, linked to the outer pieces)")}</label>
          {canPocket && <label className={`inline-flex items-center gap-1.5 ${opts.lining ? "" : "opacity-40"}`}><input type="checkbox" data-kit-pocket checked={opts.lining && opts.pocket} disabled={!opts.lining} onChange={(e) => setOpts((o) => ({ ...o, pocket: e.target.checked }))} className="h-3.5 w-3.5 accent-blue-600" />{t("ช่องใส่ของในซับใน 1 ช่อง", "One pocket on the lining")}</label>}
          <span className="text-slate-500">{t(`ตัวนอก ${kit.pieces.filter((q) => !q.lining).length} แบบ · ซับใน ${kit.pieces.filter((q) => q.lining).length} แบบ · ตะเข็บ ${kit.seams.length} แนว`, `${kit.pieces.filter((q) => !q.lining).length} outer · ${kit.pieces.filter((q) => q.lining).length} lining patterns · ${kit.seams.length} seams`)}</span>
        </div>
      </div>
      {style !== "tote" ? <KitBody style={style} p={kitParams(style, kp[style] ?? {})} kit={kit} onChange={(k, v) => setKp((old) => ({ ...old, [style]: { ...(old[style] ?? {}), [k]: v } }))} /> : (
      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        {/* ── ซ้าย: ขนาด ── */}
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500">{t("เริ่มจากแบบสำเร็จรูป", "Start from a preset")}</div>
            <div className="flex flex-wrap gap-1.5">
              {BAG_PRESETS.map((ps) => (
                <button key={ps.key} type="button" onClick={() => setParams({ ...BAG_DEFAULT, ...ps.params })} className="h-7 rounded-full border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:border-blue-300 hover:text-blue-700">{t(ps.th, ps.en)}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-slate-500">{t("ตัวกระเป๋า", "Body")}</div>
            {field("W", "กว้างก้น", "Base width")}
            {field("flare", "ปากบานออก ข้างละ", "Flare per side")}
            {field("H", "สูง", "Height")}
            {field("D", "หนา (ก้นลึก)", "Depth")}
            {field("r", "มุมก้นโค้ง", "Corner radius", { max: Math.max(BAG_LIMITS.r.step, G.rMax) })}
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ข้างและก้น", "Sides and bottom")}>
              <button type="button" className={seg(G.strip)} onClick={() => setParams((o) => ({ ...o, strip: true }))}>{t("ข้าง+ก้น ชิ้นเดียว", "One gusset strip")}</button>
              <button type="button" className={`${seg(!G.strip)} disabled:cursor-not-allowed disabled:opacity-50`} disabled={p.r > 0} onClick={() => setParams((o) => ({ ...o, strip: false }))}>{t("แยก 3 ชิ้น", "3 separate pieces")}</button>
            </div>
            {p.r > 0 && <p className="text-[11px] text-slate-400">{t("มุมก้นโค้งต้องใช้ข้าง+ก้นเป็นชิ้นเดียว ตั้งมุมโค้งเป็น 0 ถ้าต้องการแยกชิ้น", "Rounded corners need a single gusset strip. Set the radius to 0 to split it.")}</p>}
          </div>
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-slate-500">{t("ช่องบนตัวหน้า", "Opening on the front panel")}</div>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ชนิดช่อง", "Opening type")}>
              {winTypes.map(([k, th, en]) => <button key={k} type="button" className={seg(k === "none" ? p.win === "none" : p.win !== "none" && p.winType === k)}
                onClick={() => setParams((o) => (k === "none" ? { ...o, win: "none" } : { ...o, winType: k, win: o.win === "none" || k !== "window" ? "rect" : o.win }))}>{t(th, en)}</button>)}
            </div>
            {G.win?.type === "window" && (
              <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("รูปช่องโชว์", "Window shape")}>
                {wins.filter(([k]) => k !== "none").map(([k, th, en]) => <button key={k} type="button" className={seg(p.win === k)} onClick={() => setParams((o) => ({ ...o, win: k }))}>{t(th, en)}</button>)}
              </div>
            )}
            {G.win && <>
              {field("ws", G.win.type === "window" ? "กว้างช่อง" : "ยาวช่อง", G.win.type === "window" ? "Window width" : "Opening length", { max: G.win.wsMax })}
              {field("wy", "กลางช่องสูงจากก้น", "Window centre above base", { min: G.win.yMin, max: Math.max(G.win.yMin + 0.5, G.win.yMax) })}
            </>}
          </div>
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-slate-500">{t("หูหิ้ว", "Handles")}</div>
            {field("Lh", "ยาวหู ส่วนที่โผล่", "Handle length above rim")}
            {field("wh", "กว้างหู", "Handle width")}
            {field("g", "ระยะห่างโคนหู", "Gap between handle ends", { min: G.gMin, max: Math.max(G.gMin + 0.5, G.gMax) })}
          </div>
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-slate-500">{t("เผื่อเย็บ", "Allowances")}</div>
            {field("sa", "เผื่อเย็บรอบชิ้น", "Seam allowance")}
            {field("hem", "พับปาก", "Top hem")}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500">{t("สีในภาพตัวอย่าง (ไม่บันทึก)", "Preview colours (not saved)")}</div>
            {swatches(body, setBody, t("ตัวกระเป๋า", "Body"))}
            {swatches(handle, setHandle, t("หู", "Handles"))}
          </div>
        </div>

        {/* ── ขวา: ภาพ 3D + ชิ้นที่จะได้ + คำอธิบาย ── */}
        <div className="min-w-0 space-y-3">
          <Pattern3D mode="bag" bag={G} colors={colors} explode={explode} selected={pick} onSelect={setPick} height={340} />
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("แยกชิ้นดู", "Pull pieces apart")}
            <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-48 max-w-full accent-blue-600" />
          </label>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="px-2.5 py-1.5 text-left font-medium">{t("ชิ้น", "Piece")}</th><th className="px-2.5 py-1.5 text-right font-medium">{t("จำนวน", "Qty")}</th><th className="px-2.5 py-1.5 text-right font-medium">{t("ขนาดสำเร็จ (ซม.)", "Finished (cm)")}</th><th className="px-2.5 py-1.5 text-right font-medium">{t("ขนาดตัด (ซม.)", "Cut (cm)")}</th></tr>
              </thead>
              <tbody>
                {pieces.map((q) => (
                  <tr key={q.key} onPointerEnter={() => setPick(q.key)} onPointerLeave={() => setPick(null)} className={`border-t border-slate-100 ${pick === q.key ? "bg-amber-50" : ""}`}>
                    <td className="px-2.5 py-1.5">{t(q.name, q.nameEn)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{q.count}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f1(q.finished.w)} × {f1(q.finished.h)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{f1(q.cut.w)} × {f1(q.cut.h)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t border-slate-200 bg-slate-50 font-medium"><td className="px-2.5 py-1.5">{t("รวม", "Total")}</td><td className="px-2.5 py-1.5 text-right tabular-nums">{total}</td><td /><td className="px-2.5 py-1.5 text-right tabular-nums">{t(`กรอบรวม ${(area / SQFT).toFixed(2)} ตร.ฟุต`, `${(area / SQFT).toFixed(2)} sq ft (boxes)`)}</td></tr></tfoot>
            </table>
          </div>

          <div className="space-y-1.5 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
            <div className="flex items-center gap-1.5 font-medium text-blue-800"><Icon value="i:bulb" className="text-sm" />{t("ช่างคิดยังไง", "How a pattern maker thinks")}</div>
            <p><b>{t("ขอบที่เย็บติดกันต้องยาวเท่ากัน", "Edges sewn together must be the same length")}</b> · {G.strip
              ? <>{t("ชิ้นข้าง+ก้นพันไปตามขอบตัวหน้า จึงยาวเท่าเส้นรอบขอบนั้น:", "The gusset strip wraps the front panel edge, so it is as long as that edge:")} <span className="tabular-nums">{G.parts.map((x) => `${partName(x.kind)} ${f1(x.len)}`).join(" + ")} = {f1(G.Lg)} {t("ซม.", "cm")}</span></>
              : <>{t(`ชิ้นข้างยาว ${f1(G.Ls)} ซม. เท่าขอบข้างของตัวหน้า · ชิ้นก้นยาว ${f1(p.W)} ซม. เท่าขอบก้น`, `Side piece ${f1(G.Ls)} cm = front side edge · bottom piece ${f1(p.W)} cm = front bottom edge`)}</>}</p>
            <p><b>{t("ขนาดตัดใหญ่กว่าขนาดจริง", "Cut size is larger than finished size")}</b> · {t(`เผื่อเย็บรอบชิ้น ${f1(p.sa)} ซม. เป็นเนื้อวัสดุที่ซ่อนอยู่ในตะเข็บ`, `${f1(p.sa)} cm seam allowance all round is material hidden inside the seam`)}{p.hem > 0 ? t(` · ขอบปากเผื่อ ${f1(p.hem)} ซม. เพราะต้องพับเข้าด้านใน (เผื่อเฉพาะขอบปาก)`, ` · the top edge alone gets ${f1(p.hem)} cm because it folds inward`) : ""}</p>
            <p><b>{t("รอยบาก = จุดนัดพบตอนเย็บ", "Notches = meeting points when sewing")}</b> · {t("ขีดสั้นที่กึ่งกลางก้นและจุดเริ่ม-จบมุมโค้ง จับให้ตรงกันก่อนเย็บ ชิ้นยาวจะไม่เลื่อน", "Short marks at the bottom centre and where corners start and end. Match them first so long pieces do not drift.")}</p>
            {G.win?.pocket && <p><b>{G.win.type === "zip" ? t("ช่องซิป", "Zip opening") : t("ช่องสอด", "Slot")}</b> · {G.win.type === "zip"
              ? t(`ตัวหน้าเจาะช่องยาว ${f1(G.win.w)} กว้าง ${f1(G.win.h)} ซม. ให้ฟันซิปโผล่ ซิปที่ใช้ควรยาวกว่าช่องราว 2.5 ซม. ด้านหลังเย็บถุงซับในกว้าง ${f1(G.win.pocket.w)} ลึก ${f1(G.win.pocket.depth)} ซม. (ตัดผ้าสูง 2 เท่าของความลึก + 3 ซม. แล้วพับครึ่งเป็นถุง)`, `The front panel gets a ${f1(G.win.w)} × ${f1(G.win.h)} cm opening for the zip teeth; use a zip about 2.5 cm longer. A lining pocket bag ${f1(G.win.pocket.w)} wide and ${f1(G.win.pocket.depth)} cm deep is sewn behind it.`)
              : t(`ตัวหน้ากรีดช่องยาว ${f1(G.win.w)} ซม. (กว้าง ${f1(G.win.h)} ซม.) ไว้สอดของ ด้านหลังเย็บถุงซับในกว้าง ${f1(G.win.pocket.w)} ลึก ${f1(G.win.pocket.depth)} ซม.`, `The front panel gets a ${f1(G.win.w)} cm slit with a lining pocket bag ${f1(G.win.pocket.w)} wide and ${f1(G.win.pocket.depth)} cm deep behind it.`)}
              {" "}{t("ขนาดถุงเป็นค่าทั่วไป ให้ช่างยืนยัน", "Pocket sizes are generic — confirm with your pattern maker.")}</p>}
            {G.win && !G.win.pocket && <p><b>{t("ช่องโชว์", "Display window")}</b> · {t(`ตัวหน้าถูกเจาะเป็นรูจริง แผ่น PVC ใหญ่กว่ารูรอบละ ${f1(BAG_PVC_MARGIN)} ซม. ไว้เป็นที่เย็บ ตัวหน้ากับตัวหลังจึงเป็นคนละแบบ`, `The front panel gets a real hole. The PVC sheet is ${f1(BAG_PVC_MARGIN)} cm larger all round for stitching, so front and back become different patterns.`)}</p>}
            <p className="text-slate-500">{t("ค่าหูหิ้ว (โคนเย็บ 4 ซม. · แถบกว้าง 2 เท่าของหู) และขอบ PVC เป็นค่าทั่วไป ให้ช่างยืนยันก่อนตัดจริง", "Handle values (4 cm attachment, strip twice the handle width) and the PVC margin are general defaults. Have your pattern maker confirm before cutting.")}</p>
          </div>
        </div>
      </div>
      )}
    </ERPModal>
  );
}

const KIT_LABEL: Record<KitKey, [string, string]> = {
  W: ["กว้าง", "Width"], H: ["สูง", "Height"], D: ["หนา", "Depth"], r: ["มุมมน", "Corner radius"], sa: ["เผื่อเย็บรอบชิ้น", "Seam allowance"], hem: ["พับปาก", "Mouth hem"],
  Lh: ["ยาวหู ส่วนที่โผล่", "Handle length"], wh: ["กว้างหู", "Handle width"], g: ["ระยะห่างโคนหู", "Gap between handle ends"],
  strap: ["ยาวสายสะพาย", "Strap length"], ws: ["กว้างสาย", "Strap width"], flapH: ["ฝาทับด้านหน้าลงมา", "Flap overlap on the front"],
};
/** ฟอร์มของทรง 2–6: ค่าที่ปรับได้ + ภาพชิ้นแบน (ตัวนอก = ฟ้า · ซับใน = ส้ม) + รายการชิ้น — ภาพ 3 มิติขึ้นข้างกระดานหลังวาง */
function KitBody({ style, p, kit, onChange }: { style: Exclude<BagStyle, "tote">; p: KitParams; kit: BagKit; onChange: (k: KitKey, v: number) => void }) {
  const t = useT();
  const st = bagStyle(style);
  const drawn = kit.pieces.map((q) => { const b = shapeBox(q.shape), dx = q.at[0] - b.x, dy = q.at[1] - b.y; return { q, w: b.w, h: b.h, pts: flattenShape(q.shape).map(([x, y]) => [x + dx, y + dy] as [number, number]), inner: (q.inner ?? []).map((l) => l.pts.map(([x, y]) => [x + dx, y + dy] as [number, number])) }; });
  let x1 = 1, y1 = 1; for (const d of drawn) for (const [x, y] of d.pts) { x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 2.5, sw = Math.max(x1, y1) / 320;
  const path = (P: [number, number][], close = true) => P.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") + (close ? "Z" : "");
  return (
    <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]" data-kit-body={style}>
      <div className="space-y-2.5 text-sm">
        <div className="text-xs font-medium text-slate-500">{t("ขนาดตอนเสร็จ", "Finished size")}</div>
        {st.fields.map((k) => (
          <RangeInput key={k} label={(style === "round" || style === "bucket") && k === "W" ? t(style === "bucket" ? "เส้นผ่านศูนย์กลางก้น" : "เส้นผ่านศูนย์กลาง", "Diameter")
            : style === "duffel" && k === "W" ? t("ยาวตัวกระเป๋า", "Body length") : style === "duffel" && k === "H" ? t("เส้นผ่านศูนย์กลางปลาย", "End diameter")
            : style === "backpack" && k === "strap" ? t("ยาวสายสะพายบ่า", "Shoulder strap length") : style === "wallet" && k === "W" ? t("กว้างตอนกางออก", "Open width")
            : style === "drawstring" && k === "hem" ? t("พับปาก (ช่องร้อยเชือก)", "Casing fold") : t(KIT_LABEL[k][0], KIT_LABEL[k][1])} ariaLabel={t(KIT_LABEL[k][0], KIT_LABEL[k][1])} unit={t("ซม.", "cm")}
            value={p[k]} step={KIT_LIMITS[k].step} min={KIT_LIMITS[k].min} max={KIT_LIMITS[k].max} onChange={(v) => onChange(k, v)} />
        ))}
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-800">{t("สัดส่วนตั้งต้นของทรงนี้เป็นค่าประมาณ ไม่ใช่สูตรช่าง (เช่น ความกว้างแถบซิป ความสูงฝาปิด) — ให้ช่างยืนยัน และแก้ต่อบนกระดานได้ทุกชิ้น · ความยาวชิ้นข้าง/แถบ วัดจากขอบจริงของแผ่นหน้า ขอบคู่จึงยาวเท่ากัน", "The starting proportions are estimates, not a pattern maker's formula — have them confirmed; every piece can be edited on the board. Gusset and strip lengths are measured from the panel's real edge, so paired edges match.")}</p>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <svg viewBox={`${-pad} ${-pad} ${x1 + 2 * pad} ${y1 + 2 * pad}`} className="max-h-[360px] w-full" role="img" aria-label={t("ชิ้นของทรงนี้", "Pieces of this style")}>
            {drawn.map(({ q, pts, inner }, i) => (
              <g key={q.key}>
                <path d={path(pts)} fill={q.lining ? "#ffedd5" : "#dbeafe"} stroke={q.lining ? "#9a3412" : "#1e3a8a"} strokeWidth={sw * 1.6} strokeLinejoin="round" />
                {inner.map((P, k) => <path key={k} d={path(P, false)} fill="none" stroke="#9a3412" strokeWidth={sw * 1.4} strokeDasharray={`${sw * 4} ${sw * 3}`} />)}
                <text x={pts.reduce((a, c) => a + c[0], 0) / pts.length} y={pts.reduce((a, c) => a + c[1], 0) / pts.length} fontSize={Math.max(sw * 9, 1.6)} textAnchor="middle" dominantBaseline="central" fill={q.lining ? "#9a3412" : "#1e3a8a"}>{i + 1}</text>
              </g>
            ))}
          </svg>
        </div>
        <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
          {drawn.map(({ q, w, h }, i) => (
            <li key={q.key} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate"><span className={`mr-1 inline-block w-4 text-right tabular-nums ${q.lining ? "text-orange-800" : "text-blue-900"}`}>{i + 1}</span>{t(q.name, q.nameEn)}{q.count > 1 ? ` ×${q.count}` : ""}{q.edgeMeta?.some((m) => m.zip) ? <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] text-slate-700">{t("ติดซิป", "zip")}</span> : null}</span>
              <span className="shrink-0 tabular-nums text-slate-500">{w.toFixed(1)} × {h.toFixed(1)}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-400">{t("ฟ้า = ตัวนอก · ส้ม = ซับใน · ภาพ 3 มิติจะขึ้นข้างกระดานหลังกดวาง (ทรงกล่อง ฝาปิด ทรงกลม: แถบซิป/ฝาพับปิดปากตามกติกา ไม่ใช่การจำลองผ้า)", "Blue = outer · orange = lining · the 3D view appears beside the board after placing (zip strips and flaps fold over the mouth by rule, not simulated)")}</p>
      </div>
    </div>
  );
}
