"use client";
/**
 * 🧩 AssemblyView — แท็บ "ประกอบ 3D" ของสตูดิโอแพทเทิร์น (รอบ 3): เอาชิ้น + ตะเข็บที่กำหนดไว้มาประกอบเป็นกระเป๋า
 *   ระบบอ่านตะเข็บแล้วหาโครงสร้าง (lib/pattern-assembly): ตัวหน้า/ตัวหลัง + ชิ้นคั่นกลาง หรือ ซองแบน
 *   ดูได้ 2 แบบ: แถบ "แยกชิ้นดู" หรือ "เย็บทีละขั้น" (ลำดับเย็บ — ชิ้นของขั้นที่ยังไม่เย็บลอยแยกอยู่)
 *   ชี้ชื่อชิ้น = ชิ้นนั้นสว่างในภาพ · ประกอบไม่ได้ = บอกเหตุผลและทางแก้ (ไม่วาดภาพหลอก)
 *   สีในภาพเป็นสีตัวอย่าง ไม่บันทึก · เป็นการประกอบทรงตามกติกา ไม่ใช่การจำลองวัสดุ
 *
 *   ชิ้นที่ยังไม่ได้ประกอบ (ไม่ได้เย็บขอบชนขอบ) → กด "ติดเป็นหู" ตั้งระยะห่างโคนหู/ความยาว แล้วเห็นผลในภาพทันที · หรือ "ใช้ปิดหลังช่อง"
 *   ชิ้นที่เย็บบางช่วงของขอบ (สายหู แถบ ฯลฯ · 2026-11-11) → มาจากภาพเย็บติด (lib/pattern-sewn): อยู่ในภาพ + เป็นขั้น "ชิ้นเสริม" ของเย็บทีละขั้น
 *     ระบบยังไม่เห็นโครงตัวกระเป๋า แต่มีชิ้นเย็บติดกัน = แสดงเฉพาะชิ้นที่เย็บติด (ไม่ขึ้นหน้าว่าง)
 *   <AssemblyView pieces={[{ pid, name, count, shape, holes }]} seams={seams} attaches={attaches} onGoSew={() => …} />
 * ใช้ที่: app/pattern-studio/[id] · คู่มือ: docs/pattern-studio.md
 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { Pattern3D, type Pattern3DCut } from "@/components/pattern-3d";
import { RangeInput } from "@/components/range-input";
import { SEAM_COLORS } from "@/components/pattern-sheet/shape-editor";
import { assemble, type AsmPiece, type AsmStepKey, type AssemblyOk, type Attach } from "@/lib/pattern-assembly";
import { buildSewn, isSewnExtra } from "@/lib/pattern-sewn";
import { shapeBox } from "@/lib/pattern-shape";
import { buildSimMesh, createBagSim } from "@/lib/pattern-sim";
import type { Seam } from "@/lib/pattern-seams";

const f1 = (x: number) => x.toFixed(1);
const COLORS: [string, string, string][] = [["#9a6a45", "น้ำตาลแทน", "Tan"], ["#4a3023", "น้ำตาลเข้ม", "Dark brown"], ["#26272b", "ดำ", "Black"], ["#d9cdb4", "ครีมแคนวาส", "Canvas cream"], ["#5d6b45", "เขียวมะกอก", "Olive"], ["#6f2531", "แดงเบอร์กันดี", "Burgundy"], ["#27364f", "กรมท่า", "Navy"]];

type HandleForm = { pid: string; gap: number; drop: number; len: number; w: number };
/** จุดติดหูจากค่าที่ตั้ง: โคนหู 2 จุด ห่างกัน gap กึ่งกลางแผ่น ต่ำจากปาก drop — ติดแผ่นหน้า และแผ่นหลังด้วยถ้าเป็นคนละชิ้น */
function handleAttaches(A: AssemblyOk, f: HandleForm, stamp: string): Attach[] {
  const r3 = (p: [number, number]): [number, number] => [Math.round(p[0] * 1000) / 1000 + 0, Math.round(p[1] * 1000) / 1000 + 0];
  const one = (side: "front" | "back", i: number): Attach => {
    const top = A.panelH[side === "front" ? 0 : 1] - f.drop;
    return { id: `a${stamp}h${i}`, kind: "handle", pid: f.pid, on: side === "front" ? A.front : A.back, a: r3(A.toLocal[side]([-f.gap / 2, top])), b: r3(A.toLocal[side]([f.gap / 2, top])), len: f.len, w: f.w, tail: 4 };
  };
  return A.back === A.front ? [one("front", 0)] : [one("front", 0), one("back", 1)];
}

export function AssemblyView({ pieces, seams, attaches, onGoSew, onGoDraw, onAttachesChange, pieceStiff, compact = false, height, view }: {
  /** ใช้ในช่องแคบข้างกระดาน (จอเดียว 3D คู่กับกระดาน): เรียงลงมาแถวเดียว ไม่แบ่ง 2 คอลัมน์ · ซ่อนกล่องคำอธิบายยาว */
  compact?: boolean;
  /** ความสูงของภาพ (ค่าเริ่ม 560) */
  height?: number;
  /** ให้ข้างนอกเลือกวิธีดู (ปุ่มบนหัวช่อง 3D): whole = ทั้งใบ + แยกชิ้นดู · steps = เย็บทีละขั้น · sim = ทิ้งตัว — ส่งมา = ซ่อนปุ่มสลับข้างใน */
  view?: "whole" | "steps" | "sim";
  /** ความอยู่ทรงของชิ้น (จากวัสดุ / แผ่นเสริม / ตั้งให้แข็ง) — fallback = ค่ากลางจากแถบเลื่อน · ไม่ส่ง = ใช้ค่ากลางทุกชิ้น */
  pieceStiff?: (pid: string, fallback: number) => { s: number; why: string } | null;
  /** แก้จุดติด (ติดหู / ปิดหลังช่อง / เอาออก) — ไม่ส่ง = ดูอย่างเดียว */
  onAttachesChange?: (next: Attach[]) => void;
  pieces: AsmPiece[];
  seams: Seam[];
  attaches: Attach[];
  /** ไปแท็บเย็บ / แท็บวาดชิ้น (ปุ่มในข้อความแนะนำ) */
  onGoSew?: () => void;
  onGoDraw?: () => void;
}) {
  const t = useT();
  const [hForm, setHForm] = useState<HandleForm | null>(null);   // กำลังตั้งค่าติดหูให้ชิ้นไหน (ภาพแสดงผลทันที ยังไม่บันทึกจนกด "ติดหู")
  const A0 = useMemo(() => assemble(pieces, seams, attaches), [pieces, seams, attaches]);
  const liveAtt = useMemo(() => (hForm && A0.ok ? [...attaches, ...handleAttaches(A0, hForm, "draft")] : attaches), [A0, hForm, attaches]);
  const A = useMemo(() => (liveAtt === attaches ? A0 : assemble(pieces, seams, liveAtt)), [A0, liveAtt, pieces, seams, attaches]);
  // ภาพเย็บติด: ตัวกระเป๋าเดียวกับ A + ชิ้นที่เย็บบางช่วง (แผ่นพับ / ห้อย / ห่วง)
  const scene = useMemo(() => buildSewn(pieces.map((p, i) => ({ ...p, name: p.name || `P${i + 1}` })), seams, liveAtt), [pieces, seams, liveAtt]);
  // ซับใน (ถ้าประกอบได้) = ถุงอีกใบซ้อนข้างใน · ชิ้นที่เกาะอยู่กับซับใน (ช่องใส่ของ / ถุงช่องซิป) ไปกับซับใน ไม่ใช่ขั้น "ชิ้นเสริม"
  const LA = scene.lining?.asm ?? null;
  const onLining = (on?: string) => !!LA && !!on && (on === LA.front || on === LA.back);
  const extras = useMemo(() => scene.parts.filter((p) => isSewnExtra(p) && !onLining(p.on)).map((p) => p.pid), [scene]);   // eslint-disable-line react-hooks/exhaustive-deps
  const liningPids = useMemo(() => (LA ? [...new Set([LA.front, LA.back, ...LA.bridges, ...scene.parts.filter((p) => isSewnExtra(p) && onLining(p.on)).map((p) => p.pid)])] : []), [scene]);   // eslint-disable-line react-hooks/exhaustive-deps
  const closers = useMemo(() => new Set(scene.parts.filter((p) => p.fold).map((p) => p.pid)), [scene]);   // ชิ้นปิดปาก / ฝาปิด (เย็บเต็มขอบ)
  const [cut, setCut] = useState<Pattern3DCut>("none");
  const [explode, setExplode] = useState(0);
  // จำลองวัสดุทิ้งตัว (ทดลอง): ตาข่ายสร้างจากผลประกอบที่บันทึกจุดติดแล้ว (ไม่รวมหูที่กำลังตั้งค่า) · ค่าความอยู่ทรง/ของข้างใน ไม่บันทึก
  const [simOn, setSimOn] = useState(false);
  const [stiff, setStiff] = useState(0.5);
  const [fill, setFill] = useState(0);
  const [simWake, setSimWake] = useState(0);
  const [simInfo, setSimInfo] = useState<{ h: number; done: boolean } | null>(null);
  const sim = useMemo(() => { if (!simOn || !A0.ok) return null; try { return createBagSim(buildSimMesh(A0), { stiffness: 0.5, fill: 0 }); } catch { return null; } }, [simOn, A0]);
  const stiffRows = useMemo(() => (sim ? sim.mesh.pids.map((pid) => ({ pid, ...(pieceStiff?.(pid, stiff) ?? { s: stiff, why: "" }) })) : []), [sim, pieceStiff, stiff]);
  const stiffKey = stiffRows.map((x) => `${x.pid}:${x.s}`).join("|");
  useEffect(() => { if (!sim) return; sim.setParams({ stiffness: stiff, fill, perPiece: Object.fromEntries(stiffRows.map((x) => [x.pid, x.s])) }); setSimWake((n) => n + 1); }, [sim, stiff, fill, stiffKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sim) { setSimInfo(null); return; }
    const id = window.setInterval(() => setSimInfo({ h: sim.height(), done: sim.settled() }), 400);
    return () => window.clearInterval(id);
  }, [sim]);
  const [stepMode, setStepMode] = useState(false);
  const [done, setDone] = useState(0);                       // เย็บไปแล้วกี่ขั้น (โหมดเย็บทีละขั้น)
  useEffect(() => { if (!view) return; setStepMode(view === "steps"); setSimOn(view === "sim"); if (view === "steps") setDone(0); }, [view]);
  const wrapCls = compact ? "space-y-3" : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]", H = height ?? 560;
  const [pick, setPick] = useState<string | null>(null);
  const [body, setBody] = useState(COLORS[0][0]);
  const [handle, setHandle] = useState(COLORS[1][0]);
  const colors = useMemo(() => ({ body, handle }), [body, handle]);
  const nameOf = (pid: string) => pieces.find((p) => p.pid === pid)?.name || t("ชิ้นไม่มีชื่อ", "Unnamed piece");
  const names = (pids: string[]) => pids.map(nameOf).join(" + ");

  const sewnNotes = (
    <>
      {scene.notes.filter((n) => n.why === "short").map((n) => <p key={`s${n.pid}`} className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{t(`${n.name}: สั้นกว่าระยะระหว่างสองจุดที่เย็บ ยาวไม่ถึง`, `${n.name}: shorter than the distance between its two seams`)}</p>)}
      {scene.notes.some((n) => n.why === "unsupported") && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t(`ยังประกอบชิ้นนี้ในภาพไม่ได้ (วางไว้ข้างหน้า): ${scene.notes.filter((n) => n.why === "unsupported").map((n) => n.name).join(", ")} — ภาพรองรับชิ้นที่เย็บ 1 ตะเข็บ หรือ 2 ตะเข็บ (เช่น สายหู) กับแผ่นหน้า/แผ่นหลัง`, `Cannot place these yet (laid in front): ${scene.notes.filter((n) => n.why === "unsupported").map((n) => n.name).join(", ")} — the view handles pieces joined by 1 or 2 seams to the front/back panel`)}</p>}
    </>
  );
  if (!A.ok && scene.joined > 0) {
    // ยังไม่เห็นโครงตัวกระเป๋า แต่มีชิ้นที่เย็บติดกัน (เช่น ตัวหน้า + สายหู) → แสดงเท่าที่เย็บแล้ว
    return (
      <div className={wrapCls} data-asm-view>
        <div className="min-w-0 space-y-2">
          <Pattern3D mode="sewn" sewn={scene} cut={cut} seamColors={SEAM_COLORS} colors={colors} explode={explode} selected={pick} onSelect={setPick} height={H} />
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("แยกชิ้นดู", "Pull pieces apart")}
            <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-56 max-w-full accent-blue-600" />
          </label>
          <p className="text-[11px] text-slate-400">{t("ภาพนี้วางชิ้นตามตะเข็บด้วยสูตร ไม่ใช่การจำลองวัสดุ — ตำแหน่งและสัดส่วนถูก การทิ้งตัวเป็นค่าประมาณ", "Pieces are placed from the seams by rules, not simulated — positions are right, drape is approximate.")}</p>
        </div>
        <aside className="min-w-0 space-y-3 text-sm">
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">{t("ชิ้นที่เย็บติดกันแล้ว", "Pieces sewn together")}</div>
            <ul className="space-y-0.5 text-xs">
              {scene.parts.filter((p) => p.kind !== "loose").map((p) => (
                <li key={p.pid} onPointerEnter={() => setPick(p.pid)} onPointerLeave={() => setPick(null)} className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 ${pick === p.pid ? "bg-amber-50" : ""}`}>
                  <span className="min-w-0 truncate">{p.name}</span><span className="shrink-0 text-slate-400">{p.kind === "base" ? t("ชิ้นหลัก", "main piece") : p.kind === "loop" ? t("ห่วง (เย็บ 2 ปลาย)", "loop (sewn at both ends)") : t("ชิ้นเสริม (เย็บบางช่วง)", "added piece")}</span>
                </li>
              ))}
            </ul>
            {sewnNotes}
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t("ระบบยังไม่เห็นโครงตัวกระเป๋า (ตัวหน้า + ตัวหลัง + ชิ้นคั่นกลาง หรือซองแบน) จึงแสดงเฉพาะชิ้นที่เย็บติดกัน · เย็บทีละขั้นและจำลองวัสดุใช้ได้เมื่อประกอบตัวกระเป๋าได้แล้ว", "No bag body (front + back + gusset, or a flat pouch) was found, so only the pieces sewn together are shown · step-by-step sewing and the drape simulation need an assembled body.")}</p>
            <div className="flex flex-wrap gap-2">
              {onGoSew && <button type="button" onClick={onGoSew} className="h-8 rounded-lg bg-blue-600 px-3 text-xs text-white hover:bg-blue-700">{t("ไปเย็บต่อ", "Go to Sew")}</button>}
              {onGoDraw && <button type="button" onClick={onGoDraw} className="h-8 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50">{t("ไปแท็บวาดชิ้น", "Go to Draw")}</button>}
            </div>
          </div>
        </aside>
      </div>
    );
  }
  if (!A.ok) {
    const msg = A.reason === "no-pieces"
      ? [t("ยังไม่มีชิ้นบนกระดาน", "No pieces on the board yet"), t("วาดชิ้นบนกระดาน หรือกด สร้างจากแม่แบบทรง", "Draw pieces on the board, or use Create from a bag template")]
      : A.reason === "no-seams"
        ? [t("ยังไม่ได้บอกว่าขอบไหนเย็บติดกัน", "No seams have been set yet"), t("ระบบประกอบจากตะเข็บ ใช้เครื่องมือเย็บ (N) บนกระดาน จับคู่ขอบที่ต้องเย็บติดกันก่อน (ชิ้นจากแม่แบบทรงมีตะเข็บมาให้แล้ว)", "The bag is assembled from seams. Use the Sew tool (N) on the board to pair the edges first (pieces from a bag template already have seams).")]
        : [t("ยังประกอบเป็นกระเป๋าไม่ได้", "Cannot assemble this yet"), t("ระบบเข้าใจโครงสร้าง 2 แบบ: (1) ตัวหน้า + ตัวหลัง ที่มีชิ้นคั่นกลาง 4 ขอบ เย็บขอบตรงข้ามกันเข้ากับตัวหน้าและตัวหลัง (2) ซองแบน สองแผ่นเย็บขอบติดกัน ลองตรวจตะเข็บในแท็บเย็บว่าตรงกับแบบใดแบบหนึ่ง", "Two structures are understood: (1) front + back panels joined by a four-edged piece sewn on opposite edges, (2) a flat pouch of two panels sewn edge to edge. Check your seams in the Sew tab.")];
    return (
      <div className={`rounded-xl border border-dashed border-slate-300 bg-white px-6 text-center ${compact ? "py-8" : "py-12"}`} data-asm-view>
        <div className="text-base font-medium text-slate-700">{msg[0]}</div>
        <p className="mx-auto mt-1.5 max-w-xl text-sm text-slate-500">{msg[1]}</p>
        <div className="mt-4 flex justify-center gap-2">
          {A.reason !== "no-pieces" && onGoSew && <button type="button" onClick={onGoSew} className="h-9 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700">{t("ไปแท็บเย็บ", "Go to Sew")}</button>}
          {onGoDraw && <button type="button" onClick={onGoDraw} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ไปแท็บวาดชิ้น", "Go to Draw")}</button>}
        </div>
      </div>
    );
  }

  const stepText = (key: AsmStepKey, pids: string[]) => key === "behind"
    ? t(`เย็บ ${names(pids)} เข้าด้านหลังช่องของ ${nameOf(A.front)}`, `Sew ${names(pids)} behind the window of ${nameOf(A.front)}`)
    : key === "handle"
      ? (A.handles.filter((h) => pids.includes(h.pid)).every((h) => h.side === 0)
        ? t(`เย็บโคน ${names(pids)} เข้ากับชิ้นข้างซ้ายและขวา (สายพาดข้างถึงข้าง) ทำตอนชิ้นข้างยังแบนอยู่`, `Sew the ends of ${names(pids)} onto the left and right sides (side-to-side strap) while the gusset is still flat`)
        : t(`เย็บโคน ${names(pids)} เข้ากับแผ่นหน้าและแผ่นหลัง ทำตอนชิ้นยังแบนอยู่เพราะเย็บง่ายที่สุด`, `Sew the ends of ${names(pids)} onto the front and back while they are still flat`))
      : key === "lining"
        ? t(`ใส่ซับใน (${names(pids)}) เข้าไปในตัวกระเป๋า แล้วเย็บรอบปาก — ช่องใส่ของและช่องซิปต้องเย็บติดซับในให้เสร็จก่อนขั้นนี้`, `Drop the lining (${names(pids)}) into the bag and sew around the mouth — pockets must already be sewn to the lining`)
      : key === "extra" && pids.every((p) => closers.has(p))
        ? t(`เย็บ ${names(pids)} เข้ากับขอบปากของแผ่นหน้า/แผ่นหลัง ตลอดทั้งขอบ (ชิ้นปิดปาก เช่น แถบซิป ฝาปิด) ทำตอนแผ่นยังแบนอยู่`, `Sew ${names(pids)} along the whole mouth edge of the front/back panel (closing pieces such as zip strips or a flap) while the panel is still flat`)
      : key === "extra"
        ? t(`เย็บ ${names(pids)} เข้ากับตำแหน่งที่กำหนดไว้บนแผ่น${pids.some((p) => closers.has(p)) ? " (ชิ้นปิดปากเย็บเต็มขอบปาก · ชิ้นอื่นเย็บบางช่วง)" : " (ตะเข็บบางช่วง)"} ทำตอนแผ่นยังแบนอยู่`, `Sew ${names(pids)} at their marked positions on the panel (partial seams) while the panel is still flat`)
      : key === "gusset"
        ? t(`เย็บ ${names(pids)} เข้ากับขอบของ ${nameOf(A.front)}`, `Sew ${names(pids)} to the edge of ${nameOf(A.front)}`)
        : A.kind === "pouch"
          ? t(`วาง ${nameOf(A.back)} ประกบ แล้วเย็บขอบติดกัน`, `Lay ${nameOf(A.back)} on top and sew the edges together`)
          : t(`เย็บ ${A.back === A.front ? t("แผ่นหลัง", "the back panel") : nameOf(A.back)} เข้ากับขอบอีกด้านของชิ้นคั่นกลาง`, `Sew ${A.back === A.front ? "the back panel" : nameOf(A.back)} to the other edge of the gusset`);
  // ขั้นเย็บ: ของตัวกระเป๋า + ขั้น "ชิ้นเสริม" (ชิ้นที่เย็บบางช่วง) แทรกก่อนเย็บชิ้นคั่นกลาง/แผ่นหลัง
  const steps: { key: AsmStepKey; pids: string[] }[] = [...A.steps];
  if (extras.length) { const at = steps.findIndex((s) => s.key === "gusset" || s.key === "back"); steps.splice(at < 0 ? steps.length : at, 0, { key: "extra", pids: extras }); }
  if (liningPids.length) steps.push({ key: "lining", pids: liningPids });
  const looseLeft = A.loose.filter((pid) => !extras.includes(pid));
  const joined = stepMode ? steps.slice(0, done).map((s) => s.key) : null;
  const seg = (on: boolean) => `h-8 flex-1 rounded-md px-3 text-xs ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`;
  const swatches = (value: string, onPick: (c: string) => void, label: string) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 text-xs text-slate-600">{label}</span>
      {COLORS.map(([c, th, en]) => (
        <button key={c} type="button" onClick={() => onPick(c)} title={t(th, en)} aria-label={`${label} ${t(th, en)}`} aria-pressed={value === c}
          className={`h-5 w-5 rounded-full border border-slate-300 ${value === c ? "ring-2 ring-blue-500 ring-offset-1" : ""}`} style={{ background: c }} />
      ))}
    </div>
  );
  const used = [...new Set([A.front, A.back, ...A.bridges, ...A.handles.map((h) => h.pid), ...A.behind.map((b) => b.pid), ...extras, ...liningPids])];

  return (
    <div className={wrapCls} data-asm-view>
      <div className="min-w-0 space-y-2">
        {simOn && sim
          ? <Pattern3D mode="sim" sim={sim} simWake={simWake} colors={colors} height={H} />
          : extras.length || LA
            ? <Pattern3D mode="sewn" sewn={scene} cut={cut} seamColors={SEAM_COLORS} colors={colors} explode={explode} joined={joined} selected={pick} onSelect={setPick} height={H} />
            : <Pattern3D mode="assembly" assembly={A} colors={colors} explode={explode} joined={joined} selected={pick} onSelect={setPick} height={H} />}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setSimOn(!simOn)} aria-pressed={simOn} className={`${view ? "hidden" : "inline-flex"} h-8 items-center gap-1.5 rounded-lg border px-3 text-xs ${simOn ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <Icon value="i:wind" className="text-sm" />{simOn ? t("กลับไปภาพประกอบ", "Back to the assembled view") : t("จำลองวัสดุทิ้งตัว (ทดลอง)", "Simulate material drape (experimental)")}
          </button>
          {simOn && sim && <button type="button" onClick={() => { sim.reset(); setSimWake((n) => n + 1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50">{t("เริ่มใหม่", "Restart")}</button>}
          {simOn && simInfo && <span className="text-xs tabular-nums text-slate-600">{simInfo.done ? t("นิ่งแล้ว", "Settled") : t("กำลังทิ้งตัว…", "Settling…")} · {t(`สูง ${simInfo.h.toFixed(1)} จาก ${A.height.toFixed(1)} ซม.`, `height ${simInfo.h.toFixed(1)} of ${A.height.toFixed(1)} cm`)}</span>}
          {simOn && !sim && <span className="text-xs text-red-600">{t("จำลองทรงนี้ไม่ได้", "This shape cannot be simulated")}</span>}
        </div>
        {simOn && sim && (extras.length > 0 || liningPids.length > 0 || scene.marks.length > 0 || scene.finishes.length > 0) && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800" data-sim-note>{t("โหมดทิ้งตัวจำลองเฉพาะตัวกระเป๋า (แผ่นหน้า แผ่นหลัง ชิ้นคั่นกลาง หู) — แถบซิป ฝาปิด ชิ้นเสริม ซับใน ซิป และอะไหล่ ไม่อยู่ในภาพนี้ จึงเห็นปากกระเป๋าเปิด", "Drape mode simulates the body only (front, back, gusset, handles) — zip strips, flaps, added pieces, lining, zips and hardware are not in this view, so the mouth looks open")}</p>
        )}
        {simOn && sim && (
          <div className="grid gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2">
            <RangeInput label={t("ความอยู่ทรงกลาง — ใช้กับชิ้นที่ยังไม่ได้ตั้งค่าวัสดุ (0 = ผ้านิ่ม · 1 = แข็ง)", "Default stiffness — for pieces without material values (0 = soft · 1 = rigid)")} min={0} max={1} step={0.05} value={stiff} onChange={setStiff} />
            <RangeInput label={t("ของข้างใน (0 = เปล่า · 1 = เต็มใบ)", "Contents (0 = empty · 1 = full)")} min={0} max={1} step={0.05} value={fill} onChange={setFill} />
            {stiffRows.length > 0 && (
              <ul className="space-y-0.5 rounded-md bg-slate-50 p-2 text-[11px] text-slate-600 sm:col-span-2">
                {stiffRows.map((x) => <li key={x.pid} className="flex justify-between gap-2"><span className="min-w-0 truncate">{nameOf(x.pid)}{x.why ? <span className="text-slate-400"> · {x.why}</span> : null}</span><b className="tabular-nums">{x.s.toFixed(2)}</b></li>)}
                <li className="text-slate-400">{t("ตั้งค่าได้บนกระดาน: กดชิ้น → ปุ่มตั้งค่าบนป้ายวัสดุ / หัวข้อ ข้อมูลชิ้นและการอยู่ทรง", "Set these in the Draw tab: select a piece → the settings button on a material chip / Piece details and stiffness")}</li>
              </ul>
            )}
            <p className="text-[11px] text-slate-500 sm:col-span-2">{t("นี่คือการประมาณเพื่อให้เห็นภาพว่าวัสดุแข็งกับนิ่มต่างกันยังไง ไม่ใช่การคำนวณจากค่าวัสดุจริง (ไม่รู้น้ำหนัก ความหนา หรือตัวเสริมข้างใน) · ไม่แสดงหู ชิ้นเสริมที่เย็บบางช่วง ซับใน แผ่นใส · ชิ้นข้างอาจทะลุกันได้เมื่อวัสดุนิ่มมาก · ค่านี้ไม่ถูกบันทึก", "An approximation to show how firm and soft materials differ — not computed from real material data (weight, thickness or stiffeners are unknown). Handles, lining and clear panels are not shown; sides may pass through each other when very soft. These values are not saved.")}</p>
            <p className="text-[11px] text-slate-500 sm:col-span-2"><b>{t("ช่างคิดยังไง", "How a pattern maker thinks")}</b> · {t("กระเป๋าจะอยู่ทรงหรือไม่ ขึ้นกับวัสดุและตัวเสริม (แผ่นรองก้น ผ้ากาว กระดาษแข็ง) มากกว่ารูปแพทเทิร์น — ถ้าลองเลื่อนแล้วทรุดมาก แปลว่าทรงนี้ต้องใช้วัสดุแข็งขึ้นหรือเพิ่มตัวเสริม", "Whether a bag stands up depends on the material and stiffeners (base board, interfacing) more than on the pattern. If it slumps a lot here, this shape needs a firmer material or added stiffeners.")}</p>
          </div>
        )}
        {!simOn && (extras.length > 0 || LA) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("ผ่าดูข้างใน", "Cut-away view")}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ผ่าดูข้างใน", "Cut-away view")}>
              {(["none", "front", "back"] as const).map((k) => <button key={k} type="button" onClick={() => setCut(k)} aria-pressed={cut === k} className={`h-7 rounded-md px-2.5 text-xs ${cut === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{k === "none" ? t("ดูข้างนอก", "Outside") : k === "front" ? t("ผ่าด้านหน้า", "Cut front") : t("ผ่าด้านหลัง", "Cut back")}</button>)}
            </div>
          </div>
        )}
        {!stepMode && !simOn && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("แยกชิ้นดู", "Pull pieces apart")}
            <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-56 max-w-full accent-blue-600" />
          </label>
        )}
        <p className="text-[11px] text-slate-400">{t("ภาพนี้ประกอบจากรูปชิ้นและตะเข็บจริงตามกติกาของโครงสร้าง ยังไม่ได้จำลองวัสดุทิ้งตัวหรือย่น · ภาพใช้ขนาดสำเร็จ (เส้นเย็บ) ของชิ้น ส่วนเผื่อเย็บและพับปากไม่แสดง", "Assembled from the real piece shapes and seams by structural rules. Material drape is not simulated · the view uses finished (sew-line) sizes; allowances and hems are not shown.")}</p>
      </div>

      <aside className={`min-w-0 text-sm ${compact ? "flex flex-col gap-3" : "space-y-3"}`}>
        <div className={`space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 ${compact ? "max-h-64 overflow-y-auto" : ""}`}>
          <div className="text-xs font-medium text-slate-500">{t("โครงสร้างที่ระบบอ่านได้", "Structure found")}</div>
          <div className="font-medium text-slate-800">{A.kind === "wrap" ? t("ตัวหน้า + ตัวหลัง มีชิ้นคั่นกลางพันรอบ", "Front + back panels joined by a gusset") : t("ซองแบน: สองแผ่นเย็บขอบติดกัน", "Flat pouch: two panels sewn edge to edge")}</div>
          <div className="text-xs tabular-nums text-slate-600">{t(`กว้าง ${f1(A.width)} · สูง ${f1(A.height)} · ลึก ${f1(A.depth)} ซม.`, `W ${f1(A.width)} · H ${f1(A.height)} · D ${f1(A.depth)} cm`)}</div>
          <ul className="space-y-0.5 pt-1 text-xs">
            {used.map((pid) => (
              <li key={pid} onPointerEnter={() => setPick(pid)} onPointerLeave={() => setPick(null)} className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 ${pick === pid ? "bg-amber-50" : ""}`}>
                <span className="min-w-0 truncate">{nameOf(pid)}</span>
                {onAttachesChange && !hForm && attaches.some((a) => a.pid === pid) && (
                  <button type="button" onClick={() => onAttachesChange(attaches.filter((a) => a.pid !== pid))} title={t("เอาชิ้นนี้ออกจากการประกอบ (ชิ้นยังอยู่บนกระดาน)", "Detach this piece (it stays on the board)")}
                    className="shrink-0 rounded px-1 text-[11px] text-slate-400 hover:bg-red-50 hover:text-red-600">{t("เอาออก", "Detach")}</button>
                )}
                <span className="shrink-0 text-slate-400">{pid === A.front ? (A.back === A.front ? t("แผ่นหน้าและหลัง", "front and back") : t("แผ่นหน้า", "front")) : pid === A.back ? t("แผ่นหลัง", "back") : A.bridges.includes(pid) ? t("ชิ้นคั่นกลาง", "gusset") : liningPids.includes(pid) ? t("ซับใน", "lining") : extras.includes(pid) ? (closers.has(pid) ? t("ชิ้นปิดปาก / ฝา (เย็บเต็มขอบ)", "closing piece / flap (whole edge)") : t("ชิ้นเสริม (เย็บบางช่วง)", "added piece (partial seam)")) : A.handles.some((h) => h.pid === pid) ? (A.handles.some((h) => h.pid === pid && h.side === 0) ? t("สายพาดข้างถึงข้าง", "side-to-side strap") : t("หู", "handle")) : t("ปิดหลังช่อง", "behind window")}</span>
              </li>
            ))}
          </ul>
          {looseLeft.length > 0 && (
            <div className="space-y-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <div>{t("ยังไม่ได้ประกอบ — ชิ้นเหล่านี้ยังไม่ได้เย็บกับแผ่นหน้า/แผ่นหลัง (เย็บบางช่วงบนกระดานได้ หรือใช้ปุ่มด้านล่าง)", "Not assembled — these pieces are not sewn to the front/back panel yet (sew part of an edge in the Draw tab, or use the buttons below)")}</div>
              {looseLeft.map((pid) => (
                <div key={pid} className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium">{nameOf(pid)}</span>
                  {onAttachesChange && <>
                    <button type="button" onClick={() => {
                      const p = pieces.find((x) => x.pid === pid); if (!p) return;
                      const b = shapeBox(p.shape), long = Math.max(b.w, b.h), short = Math.min(b.w, b.h);
                      setHForm({ pid, gap: Math.max(4, Math.min(Math.round(A.width * 0.4), Math.floor(A.width - 4))), drop: 0, len: Math.max(10, Math.round(long - 8)), w: Math.max(0.5, Math.round((short / 2) * 10) / 10) });
                    }} className="h-6 rounded border border-amber-300 bg-white px-2 text-[11px] text-amber-900 hover:bg-amber-100">{t("ติดเป็นหู", "Attach as handle")}</button>
                    {(A.panels[0]?.holes.length ?? 0) > 0 && A.behind.length === 0 && (
                      <button type="button" onClick={() => onAttachesChange([...attaches, { id: `a${Date.now().toString(36)}b`, kind: "behind", pid, on: A.front }])}
                        className="h-6 rounded border border-amber-300 bg-white px-2 text-[11px] text-amber-900 hover:bg-amber-100">{t("ใช้ปิดหลังช่อง", "Use behind the window")}</button>
                    )}
                  </>}
                </div>
              ))}
            </div>
          )}
          {hForm && onAttachesChange && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs">
              <div className="font-medium text-blue-900">{t(`ติดหู: ${nameOf(hForm.pid)}`, `Attach handle: ${nameOf(hForm.pid)}`)}</div>
              <RangeInput label={t("ระยะห่างโคนหู", "Gap between handle ends")} unit={t("ซม.", "cm")} min={4} max={Math.max(5, Math.floor(A.width - 2))} step={0.5} value={hForm.gap} onChange={(v) => setHForm({ ...hForm, gap: v })} />
              <RangeInput label={t("โคนหูต่ำจากปาก", "Ends below the rim")} unit={t("ซม.", "cm")} min={0} max={Math.max(1, Math.floor(A.height / 2))} step={0.5} value={hForm.drop} onChange={(v) => setHForm({ ...hForm, drop: v })} />
              <RangeInput label={t("ยาวหู ส่วนที่โผล่", "Handle length above the ends")} unit={t("ซม.", "cm")} min={8} max={150} step={1} value={hForm.len} onChange={(v) => setHForm({ ...hForm, len: v })} />
              <RangeInput label={t("กว้างหู", "Handle width")} unit={t("ซม.", "cm")} min={0.5} max={10} step={0.5} value={hForm.w} onChange={(v) => setHForm({ ...hForm, w: v })} />
              <p className="text-[11px] text-slate-500">{t("ค่าตั้งต้นเดาจากขนาดชิ้น (ยาว − โคน 2 ข้าง · กว้างครึ่งหนึ่งถ้าพับครึ่ง) ปรับให้ตรงกับของจริงได้ · ติดทั้งแผ่นหน้าและแผ่นหลัง", "Defaults are guessed from the piece size. Adjust to match the real handle · attached to both front and back.")}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => { if (A0.ok) onAttachesChange([...attaches, ...handleAttaches(A0, hForm, Date.now().toString(36))]); setHForm(null); }} className="h-7 rounded-lg bg-blue-600 px-3 text-white hover:bg-blue-700">{t("ติดหู", "Attach")}</button>
                <button type="button" onClick={() => setHForm(null)} className="h-7 rounded-lg border border-slate-200 bg-white px-3 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
              </div>
            </div>
          )}
          {sewnNotes}
          {A.notes.includes("mismatch") && <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{t("มีตะเข็บที่ยาวไม่เท่ากัน ภาพนี้ประกอบตามขอบของแผ่นหน้า ของจริงจะย่นหรือเหลือปลาย", "Some seams differ in length. This view follows the front panel edge; the real bag would pucker or overhang.")}{onGoSew && <button type="button" onClick={onGoSew} className="ml-1 underline">{t("ดูที่แท็บเย็บ", "See the Sew tab")}</button>}</p>}
          {A.notes.includes("depth-differs") && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t("ชิ้นคั่นกลางกว้างไม่เท่ากัน ใช้ค่ากลางเป็นความลึกของกระเป๋า", "Gusset pieces have different widths; the middle value is used as the depth")}</p>}
          {A.notes.includes("same-back") && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t("แผ่นหน้าตั้งจำนวนตัดไว้ 1 ชิ้น ระบบใช้รูปเดียวกันเป็นแผ่นหลังให้ ถ้าใช้แผ่นเดียวกันจริงให้ตั้งจำนวนตัดเป็น 2", "The front panel has a cut count of 1; the same shape is used for the back. Set the count to 2 if that is intended.")}</p>}
        </div>

        <div className={`space-y-2 rounded-lg border border-slate-200 bg-white p-3 ${compact && stepMode ? "order-first" : ""}`} data-asm-steps>
          <div className={`${view ? "hidden" : "flex"} rounded-lg border border-slate-200 bg-white p-0.5`} role="group" aria-label={t("วิธีดู", "View mode")}>
            <button type="button" className={seg(!stepMode)} onClick={() => setStepMode(false)}>{t("ดูทั้งใบ", "Whole bag")}</button>
            <button type="button" className={seg(stepMode)} onClick={() => { setStepMode(true); setDone(0); }}>{t("เย็บทีละขั้น", "Sew step by step")}</button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            {steps.map((s, i) => <li key={s.key} className={stepMode ? (i < done ? "text-slate-400" : i === done ? "font-semibold text-slate-800" : "text-slate-600") : "text-slate-700"}>{stepText(s.key, s.pids)}</li>)}
          </ol>
          {stepMode && (
            <div className="flex flex-wrap items-center gap-2">
              {done < steps.length
                ? <button type="button" onClick={() => setDone(done + 1)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs text-white hover:bg-blue-700">{t(`เย็บขั้นที่ ${done + 1}`, `Sew step ${done + 1}`)}</button>
                : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{t("เย็บครบแล้ว", "All sewn")}</span>}
              <button type="button" disabled={!done} onClick={() => setDone(0)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50 disabled:opacity-40">{t("แยกชิ้นใหม่", "Start over")}</button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">{t("ลำดับนี้เป็นลำดับทั่วไป แต่ละโรงงานอาจสลับขั้นได้ ให้ช่างยืนยัน", "This is a typical order. Workshops differ, so have your pattern maker confirm.")}</p>
        </div>

        <div className={`${compact ? "hidden " : ""}space-y-1.5 rounded-lg border border-slate-200 bg-white p-3`}>
          <div className="text-xs font-medium text-slate-500">{t("สีในภาพตัวอย่าง (ไม่บันทึก)", "Preview colours (not saved)")}</div>
          {swatches(body, setBody, t("ตัวกระเป๋า", "Body"))}
          {swatches(handle, setHandle, t("หู", "Handles"))}
        </div>

        <div className={`${compact ? "hidden " : ""}space-y-1.5 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700`}>
          <div className="flex items-center gap-1.5 font-medium text-blue-800"><Icon value="i:bulb" className="text-sm" />{t("ช่างคิดยังไง", "How a pattern maker thinks")}</div>
          <p>{t("กระเป๋าที่มีความลึก เกิดจากชิ้นคั่นกลางที่เย็บขอบหนึ่งกับแผ่นหน้า อีกขอบกับแผ่นหลัง ความกว้างของชิ้นคั่นกลางจึงกลายเป็นความลึกของกระเป๋า", "Depth comes from the gusset: one edge is sewn to the front, the opposite edge to the back, so the gusset width becomes the bag depth.")}</p>
          <p>{t("ขอบของแผ่นหน้าที่ไม่ได้เย็บกับอะไร คือปากกระเป๋า ระบบจึงหมุนให้ขอบนั้นหันขึ้นเอง", "The panel edge that is not sewn to anything is the opening, so the view turns it upward.")}</p>
          <p className="text-slate-500">{t("ลองเปลี่ยนบนกระดาน: เปลี่ยนความกว้างของชิ้นข้าง แล้วกลับมาดูว่ากระเป๋าลึกขึ้นหรือตื้นลง", "Try changing the gusset width in the Draw tab, then come back and see the bag get deeper or shallower.")}</p>
        </div>
      </aside>
    </div>
  );
}
