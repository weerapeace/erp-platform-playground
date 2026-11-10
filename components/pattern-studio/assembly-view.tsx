"use client";
/**
 * 🧩 AssemblyView — แท็บ "ประกอบ 3D" ของสตูดิโอแพทเทิร์น (รอบ 3): เอาชิ้น + ตะเข็บที่กำหนดไว้มาประกอบเป็นกระเป๋า
 *   ระบบอ่านตะเข็บแล้วหาโครงสร้าง (lib/pattern-assembly): ตัวหน้า/ตัวหลัง + ชิ้นคั่นกลาง หรือ ซองแบน
 *   ดูได้ 2 แบบ: แถบ "แยกชิ้นดู" หรือ "เย็บทีละขั้น" (ลำดับเย็บ — ชิ้นของขั้นที่ยังไม่เย็บลอยแยกอยู่)
 *   ชี้ชื่อชิ้น = ชิ้นนั้นสว่างในภาพ · ประกอบไม่ได้ = บอกเหตุผลและทางแก้ (ไม่วาดภาพหลอก)
 *   สีในภาพเป็นสีตัวอย่าง ไม่บันทึก · เป็นการประกอบทรงตามกติกา ไม่ใช่การจำลองวัสดุ
 *
 *   <AssemblyView pieces={[{ pid, name, count, shape, holes }]} seams={seams} attaches={attaches} onGoSew={() => …} />
 * ใช้ที่: app/pattern-studio/[id] · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { Pattern3D } from "@/components/pattern-3d";
import { assemble, type AsmPiece, type AsmStepKey, type Attach } from "@/lib/pattern-assembly";
import type { Seam } from "@/lib/pattern-seams";

const f1 = (x: number) => x.toFixed(1);
const COLORS: [string, string, string][] = [["#9a6a45", "น้ำตาลแทน", "Tan"], ["#4a3023", "น้ำตาลเข้ม", "Dark brown"], ["#26272b", "ดำ", "Black"], ["#d9cdb4", "ครีมแคนวาส", "Canvas cream"], ["#5d6b45", "เขียวมะกอก", "Olive"], ["#6f2531", "แดงเบอร์กันดี", "Burgundy"], ["#27364f", "กรมท่า", "Navy"]];

export function AssemblyView({ pieces, seams, attaches, onGoSew, onGoDraw }: {
  pieces: AsmPiece[];
  seams: Seam[];
  attaches: Attach[];
  /** ไปแท็บเย็บ / แท็บวาดชิ้น (ปุ่มในข้อความแนะนำ) */
  onGoSew?: () => void;
  onGoDraw?: () => void;
}) {
  const t = useT();
  const A = useMemo(() => assemble(pieces, seams, attaches), [pieces, seams, attaches]);
  const [explode, setExplode] = useState(0);
  const [stepMode, setStepMode] = useState(false);
  const [done, setDone] = useState(0);                       // เย็บไปแล้วกี่ขั้น (โหมดเย็บทีละขั้น)
  const [pick, setPick] = useState<string | null>(null);
  const [body, setBody] = useState(COLORS[0][0]);
  const [handle, setHandle] = useState(COLORS[1][0]);
  const colors = useMemo(() => ({ body, handle }), [body, handle]);
  const nameOf = (pid: string) => pieces.find((p) => p.pid === pid)?.name || t("ชิ้นไม่มีชื่อ", "Unnamed piece");
  const names = (pids: string[]) => pids.map(nameOf).join(" + ");

  if (!A.ok) {
    const msg = A.reason === "no-pieces"
      ? [t("ยังไม่มีชิ้นบนกระดาน", "No pieces on the board yet"), t("ไปที่แท็บวาดชิ้น แล้ววาดชิ้นหรือกด สร้างจากแม่แบบทรง", "Go to the Draw tab and draw pieces, or use Create from a bag template")]
      : A.reason === "no-seams"
        ? [t("ยังไม่ได้บอกว่าขอบไหนเย็บติดกัน", "No seams have been set yet"), t("ระบบประกอบจากตะเข็บ ไปที่แท็บเย็บแล้วจับคู่ขอบที่ต้องเย็บติดกันก่อน (ชิ้นจากแม่แบบทรงมีตะเข็บมาให้แล้ว)", "The bag is assembled from seams. Go to the Sew tab and pair the edges first (pieces from a bag template already have seams).")]
        : [t("ยังประกอบเป็นกระเป๋าไม่ได้", "Cannot assemble this yet"), t("ระบบเข้าใจโครงสร้าง 2 แบบ: (1) ตัวหน้า + ตัวหลัง ที่มีชิ้นคั่นกลาง 4 ขอบ เย็บขอบตรงข้ามกันเข้ากับตัวหน้าและตัวหลัง (2) ซองแบน สองแผ่นเย็บขอบติดกัน ลองตรวจตะเข็บในแท็บเย็บว่าตรงกับแบบใดแบบหนึ่ง", "Two structures are understood: (1) front + back panels joined by a four-edged piece sewn on opposite edges, (2) a flat pouch of two panels sewn edge to edge. Check your seams in the Sew tab.")];
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
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
      ? t(`เย็บโคน ${names(pids)} เข้ากับแผ่นหน้าและแผ่นหลัง ทำตอนชิ้นยังแบนอยู่เพราะเย็บง่ายที่สุด`, `Sew the ends of ${names(pids)} onto the front and back while they are still flat`)
      : key === "gusset"
        ? t(`เย็บ ${names(pids)} เข้ากับขอบของ ${nameOf(A.front)}`, `Sew ${names(pids)} to the edge of ${nameOf(A.front)}`)
        : A.kind === "pouch"
          ? t(`วาง ${nameOf(A.back)} ประกบ แล้วเย็บขอบติดกัน`, `Lay ${nameOf(A.back)} on top and sew the edges together`)
          : t(`เย็บ ${A.back === A.front ? t("แผ่นหลัง", "the back panel") : nameOf(A.back)} เข้ากับขอบอีกด้านของชิ้นคั่นกลาง`, `Sew ${A.back === A.front ? "the back panel" : nameOf(A.back)} to the other edge of the gusset`);
  const joined = stepMode ? A.steps.slice(0, done).map((s) => s.key) : null;
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
  const used = [...new Set([A.front, A.back, ...A.bridges, ...A.handles.map((h) => h.pid), ...A.behind.map((b) => b.pid)])];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-2">
        <Pattern3D mode="assembly" assembly={A} colors={colors} explode={explode} joined={joined} selected={pick} onSelect={setPick} height={560} />
        {!stepMode && (
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {t("แยกชิ้นดู", "Pull pieces apart")}
            <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-56 max-w-full accent-blue-600" />
          </label>
        )}
        <p className="text-[11px] text-slate-400">{t("ภาพนี้ประกอบจากรูปชิ้นและตะเข็บจริงตามกติกาของโครงสร้าง ยังไม่ได้จำลองวัสดุทิ้งตัวหรือย่น · ส่วนพับปากยังไม่ถูกพับลง กระเป๋าในภาพจึงสูงกว่าจริงเท่าส่วนพับ", "Assembled from the real piece shapes and seams by structural rules. Material drape is not simulated · the top hem is not folded down yet, so the bag looks taller by the hem.")}</p>
      </div>

      <aside className="min-w-0 space-y-3 text-sm">
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-500">{t("โครงสร้างที่ระบบอ่านได้", "Structure found")}</div>
          <div className="font-medium text-slate-800">{A.kind === "wrap" ? t("ตัวหน้า + ตัวหลัง มีชิ้นคั่นกลางพันรอบ", "Front + back panels joined by a gusset") : t("ซองแบน: สองแผ่นเย็บขอบติดกัน", "Flat pouch: two panels sewn edge to edge")}</div>
          <div className="text-xs tabular-nums text-slate-600">{t(`กว้าง ${f1(A.width)} · สูง ${f1(A.height)} · ลึก ${f1(A.depth)} ซม.`, `W ${f1(A.width)} · H ${f1(A.height)} · D ${f1(A.depth)} cm`)}</div>
          <ul className="space-y-0.5 pt-1 text-xs">
            {used.map((pid) => (
              <li key={pid} onPointerEnter={() => setPick(pid)} onPointerLeave={() => setPick(null)} className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 ${pick === pid ? "bg-amber-50" : ""}`}>
                <span className="min-w-0 truncate">{nameOf(pid)}</span>
                <span className="shrink-0 text-slate-400">{pid === A.front ? (A.back === A.front ? t("แผ่นหน้าและหลัง", "front and back") : t("แผ่นหน้า", "front")) : pid === A.back ? t("แผ่นหลัง", "back") : A.bridges.includes(pid) ? t("ชิ้นคั่นกลาง", "gusset") : A.handles.some((h) => h.pid === pid) ? t("หู", "handle") : t("ปิดหลังช่อง", "behind window")}</span>
              </li>
            ))}
          </ul>
          {A.loose.length > 0 && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t(`ยังไม่ได้ประกอบ: ${names(A.loose)} — ชิ้นเหล่านี้ไม่มีตะเข็บที่ระบบใช้ประกอบได้`, `Not assembled: ${names(A.loose)} — no usable seams for these pieces`)}</p>}
          {A.notes.includes("mismatch") && <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{t("มีตะเข็บที่ยาวไม่เท่ากัน ภาพนี้ประกอบตามขอบของแผ่นหน้า ของจริงจะย่นหรือเหลือปลาย", "Some seams differ in length. This view follows the front panel edge; the real bag would pucker or overhang.")}{onGoSew && <button type="button" onClick={onGoSew} className="ml-1 underline">{t("ดูที่แท็บเย็บ", "See the Sew tab")}</button>}</p>}
          {A.notes.includes("depth-differs") && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t("ชิ้นคั่นกลางกว้างไม่เท่ากัน ใช้ค่ากลางเป็นความลึกของกระเป๋า", "Gusset pieces have different widths; the middle value is used as the depth")}</p>}
          {A.notes.includes("same-back") && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{t("แผ่นหน้าตั้งจำนวนตัดไว้ 1 ชิ้น ระบบใช้รูปเดียวกันเป็นแผ่นหลังให้ ถ้าใช้แผ่นเดียวกันจริงให้ตั้งจำนวนตัดเป็น 2", "The front panel has a cut count of 1; the same shape is used for the back. Set the count to 2 if that is intended.")}</p>}
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("วิธีดู", "View mode")}>
            <button type="button" className={seg(!stepMode)} onClick={() => setStepMode(false)}>{t("ดูทั้งใบ", "Whole bag")}</button>
            <button type="button" className={seg(stepMode)} onClick={() => { setStepMode(true); setDone(0); }}>{t("เย็บทีละขั้น", "Sew step by step")}</button>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs">
            {A.steps.map((s, i) => <li key={s.key} className={stepMode ? (i < done ? "text-slate-400" : i === done ? "font-semibold text-slate-800" : "text-slate-600") : "text-slate-700"}>{stepText(s.key, s.pids)}</li>)}
          </ol>
          {stepMode && (
            <div className="flex flex-wrap items-center gap-2">
              {done < A.steps.length
                ? <button type="button" onClick={() => setDone(done + 1)} className="h-8 rounded-lg bg-blue-600 px-3 text-xs text-white hover:bg-blue-700">{t(`เย็บขั้นที่ ${done + 1}`, `Sew step ${done + 1}`)}</button>
                : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">{t("เย็บครบแล้ว", "All sewn")}</span>}
              <button type="button" disabled={!done} onClick={() => setDone(0)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs hover:bg-slate-50 disabled:opacity-40">{t("แยกชิ้นใหม่", "Start over")}</button>
            </div>
          )}
          <p className="text-[11px] text-slate-400">{t("ลำดับนี้เป็นลำดับทั่วไป แต่ละโรงงานอาจสลับขั้นได้ ให้ช่างยืนยัน", "This is a typical order. Workshops differ, so have your pattern maker confirm.")}</p>
        </div>

        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium text-slate-500">{t("สีในภาพตัวอย่าง (ไม่บันทึก)", "Preview colours (not saved)")}</div>
          {swatches(body, setBody, t("ตัวกระเป๋า", "Body"))}
          {swatches(handle, setHandle, t("หู", "Handles"))}
        </div>

        <div className="space-y-1.5 rounded-lg bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
          <div className="flex items-center gap-1.5 font-medium text-blue-800"><Icon value="i:bulb" className="text-sm" />{t("ช่างคิดยังไง", "How a pattern maker thinks")}</div>
          <p>{t("กระเป๋าที่มีความลึก เกิดจากชิ้นคั่นกลางที่เย็บขอบหนึ่งกับแผ่นหน้า อีกขอบกับแผ่นหลัง ความกว้างของชิ้นคั่นกลางจึงกลายเป็นความลึกของกระเป๋า", "Depth comes from the gusset: one edge is sewn to the front, the opposite edge to the back, so the gusset width becomes the bag depth.")}</p>
          <p>{t("ขอบของแผ่นหน้าที่ไม่ได้เย็บกับอะไร คือปากกระเป๋า ระบบจึงหมุนให้ขอบนั้นหันขึ้นเอง", "The panel edge that is not sewn to anything is the opening, so the view turns it upward.")}</p>
          <p className="text-slate-500">{t("ลองกลับไปแท็บวาดชิ้น เปลี่ยนความกว้างของชิ้นข้าง แล้วกลับมาดูว่ากระเป๋าลึกขึ้นหรือตื้นลง", "Try changing the gusset width in the Draw tab, then come back and see the bag get deeper or shallower.")}</p>
        </div>
      </aside>
    </div>
  );
}
