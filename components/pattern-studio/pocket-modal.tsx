"use client";
/**
 * 👝 PocketModal — ตัวช่วย "เพิ่มช่องในกระเป๋า" ของสตูดิโอแพทเทิร์น (เจ้าของดูภาพตัวอย่างแล้วสั่ง "ทำตามแบบนี้" 2026-11-11)
 *   เลือกชิ้นที่จะติดช่อง (ปกติ = ซับในหลัง) → เลือก ช่องใส่ของ หรือ ช่องซิป → ตั้งขนาด/ตำแหน่ง ดูภาพตัวอย่างทันที → กดเพิ่ม
 *   ระบบสร้างให้ครบ (lib/pattern-lining pocketPlan): เส้นในบนชิ้นที่ติด + ชิ้นใหม่ + ตะเข็บ — ทั้งหมดเป็นของจริงบนกระดาน แก้ต่อ/ย้อนกลับได้
 *   ช่องอยู่กึ่งกลางซ้ายขวาของชิ้น · "ต่ำจากขอบบน" วัดจากขอบบนของชิ้นตามที่วางบนกระดาน (ขอบบน = ปากกระเป๋า)
 *
 *   <PocketModal open onClose={…} hosts={[{ pid, name, box, lining }]} defaultPid={…} onInsert={(pid, opts) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { RangeInput } from "@/components/range-input";
import { POCKET_HEM, ZIP_BAG_MARGIN, pocketPlan, type PocketKind, type PocketOpts } from "@/lib/pattern-lining";
import type { Box } from "@/lib/pattern-shape";

export type PocketHost = { pid: string; name: string; box: Box; lining: boolean };

export function PocketModal({ open, onClose, hosts, defaultPid, onInsert }: {
  open: boolean;
  onClose: () => void;
  /** ชิ้นบนกระดานที่ติดช่องได้ */
  hosts: PocketHost[];
  defaultPid?: string | null;
  onInsert: (hostPid: string, opts: PocketOpts) => void;
}) {
  const t = useT();
  const [pid, setPid] = useState<string>(() => (hosts.find((h) => h.pid === defaultPid) ?? hosts.find((h) => h.lining) ?? hosts[0])?.pid ?? "");
  const [kind, setKind] = useState<PocketKind>("patch");
  const [val, setVal] = useState<Record<PocketKind, { w: number; depth: number; top: number }>>({ patch: { w: 18, depth: 11, top: 9 }, zip: { w: 16, depth: 12, top: 4 } });
  const host = hosts.find((h) => h.pid === pid) ?? null;
  const v = val[kind];
  const set = (k: "w" | "depth" | "top", n: number) => setVal((x) => ({ ...x, [kind]: { ...x[kind], [k]: n } }));
  const plan = useMemo(() => (host ? pocketPlan(host.box, { kind, ...v }, "preview") : null), [host, kind, v]);
  const seg = (on: boolean) => `h-8 flex-1 rounded-md px-3 text-xs ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`;

  // ภาพตัวอย่าง: ชิ้นที่ติด (เป็นกรอบ) + เส้นใน + ชิ้นใหม่ข้าง ๆ
  const preview = host && plan ? (() => {
    const b = host.box, pw = plan.piece.shape.k === "rect" ? plan.piece.shape.w : 0, ph = plan.piece.shape.k === "rect" ? plan.piece.shape.h : 0;
    const total = b.w + 4 + pw, k = Math.min(520 / total, 260 / Math.max(b.h, ph + POCKET_HEM + 2));
    const X = (x: number) => (x - b.x) * k + 6, Y = (y: number) => (y - b.y) * k + 22, px = (b.w + 4) * k + 6, hem = kind === "patch" ? POCKET_HEM * k : 0;
    const col = kind === "patch" ? "#2563eb" : "#c2410c";
    return (
      <svg viewBox={`0 0 ${Math.round(total * k + 12)} ${Math.round(Math.max(b.h, ph + POCKET_HEM + 2) * k + 44)}`} className="w-full" role="img" aria-label={t("ภาพตัวอย่างตำแหน่งช่อง", "Preview of the pocket position")}>
        <rect x={X(b.x)} y={Y(b.y)} width={b.w * k} height={b.h * k} rx={2} fill="#e9e2cf" stroke="#8a8266" />
        <text x={X(b.x) + (b.w * k) / 2} y={14} textAnchor="middle" fontSize={11} fill="#475569">{host.name} · {t("ขอบบน = ปากกระเป๋า", "top edge = bag mouth")}</text>
        {kind === "zip" && <rect x={X(plan.line.pts[0][0]) - ZIP_BAG_MARGIN * k} y={Y(plan.line.pts[0][1])} width={pw * k} height={v.depth * k} fill="none" stroke="#64748b" strokeDasharray="4 3" />}
        <path d={"M" + plan.line.pts.map((q) => `${X(q[0])} ${Y(q[1])}`).join("L")} fill="none" stroke={col} strokeWidth={kind === "zip" ? 5 : 2.5} strokeDasharray={kind === "zip" ? undefined : "6 4"} strokeLinecap="round" strokeLinejoin="round" />
        <rect x={px} y={22 + hem} width={pw * k} height={ph * k} fill="#e9e2cf" stroke={col} strokeWidth={1.5} />
        {kind === "patch" && <rect x={px} y={22} width={pw * k} height={hem} fill="none" stroke="#7c3aed" strokeDasharray="3 3" />}
        {kind === "zip" && <line x1={px} x2={px + pw * k} y1={22 + (ph * k) / 2} y2={22 + (ph * k) / 2} stroke="#7c3aed" strokeDasharray="6 3 2 3" />}
        <text x={px + (pw * k) / 2} y={22 + hem + (ph * k) / 2 + 4} textAnchor="middle" fontSize={11} fill="#334155">{t(plan.piece.name, kind === "patch" ? "Pocket" : "Zip pocket bag")}</text>
        <text x={px + (pw * k) / 2} y={22 + hem + ph * k + 14} textAnchor="middle" fontSize={10} fill="#64748b">{pw} × {kind === "patch" ? `${ph} + ${t("พับปาก", "hem")} ${POCKET_HEM}` : `${ph} (${t("พับครึ่ง", "folded in half")})`}</text>
      </svg>
    );
  })() : null;

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="pattern-pocket-modal"
      title={t("เพิ่มช่องในกระเป๋า", "Add a pocket")}
      description={t("ระบบสร้างเส้นในบนชิ้นที่ติด ชิ้นของช่อง และตะเข็บให้ครบ วางลงกระดานเป็นของจริงที่แก้ต่อได้", "Creates the inner line on the host piece, the pocket piece and the seam — all real items on the board that you can keep editing")}
      footer={<>
        <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={!host} onClick={() => { if (host) onInsert(host.pid, { kind, ...v }); }} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
          <Icon value="i:plus" className="text-sm" />{t("เพิ่มลงกระดาน", "Add to the board")}
        </button>
      </>}>
      {!hosts.length ? <p className="py-8 text-center text-sm text-slate-500">{t("ยังไม่มีชิ้นบนกระดาน", "No pieces on the board yet")}</p> : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">{preview}</div>
            {plan && plan.warnings.length > 0 && (
              <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
                {plan.warnings.includes("too-wide") && t("ช่องกว้างกว่าชิ้นที่ติด ให้ลดความกว้าง ", "The pocket is wider than the host piece — reduce the width. ")}
                {plan.warnings.includes("past-bottom") && t("ช่องยาวเลยก้นของชิ้นที่ติด ให้ลดความลึกหรือขยับขึ้น", "The pocket runs past the bottom of the host piece — reduce the depth or move it up.")}
              </p>
            )}
            <p className="text-[11px] text-slate-500"><b>{t("ช่างคิดยังไง", "How a pattern maker thinks")}</b> · {kind === "patch"
              ? t("ช่องใส่ของเย็บติดกับซับใน 3 ด้าน (ซ้าย ล่าง ขวา) ด้านบนเปิดไว้และพับปากเข้าใน 2 ซม. ให้ขอบเรียบ ต้องเย็บตอนซับในยังเป็นแผ่นแบน ก่อนประกอบเป็นถุง", "A patch pocket is stitched to the lining on three sides; the top stays open with a 2 cm hem. Sew it while the lining is still flat.")
              : t("ช่องซิปเจาะซับในเป็นช่องยาวเท่าซิป แล้วเย็บถุงผ้าไว้ด้านหลัง ถุงกว้างกว่าซิปข้างละ 1 ซม. และยาว 2 เท่าของความลึกเพราะพับครึ่ง", "A zip pocket is a slot cut in the lining as long as the zip, with a fabric bag sewn behind it — 1 cm wider each side and twice the depth because it folds in half.")}</p>
          </div>
          <div className="min-w-0 space-y-3 text-xs">
            <label className="block space-y-1"><span className="text-slate-500">{t("ติดบนชิ้น", "On piece")}</span>
              <select value={pid} onChange={(e) => setPid(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                {hosts.map((h) => <option key={h.pid} value={h.pid}>{h.name}{h.lining ? ` (${t("ซับใน", "lining")})` : ""} · {Math.round(h.box.w * 10) / 10} × {Math.round(h.box.h * 10) / 10}</option>)}
              </select></label>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ชนิดของช่อง", "Pocket type")}>
              <button type="button" className={seg(kind === "patch")} aria-pressed={kind === "patch"} onClick={() => setKind("patch")}>{t("ช่องใส่ของ", "Patch pocket")}</button>
              <button type="button" className={seg(kind === "zip")} aria-pressed={kind === "zip"} onClick={() => setKind("zip")}>{t("ช่องซิป", "Zip pocket")}</button>
            </div>
            <RangeInput label={kind === "patch" ? t("กว้าง", "Width") : t("ซิปยาว", "Zip length")} unit={t("ซม.", "cm")} min={4} max={Math.max(6, Math.floor((host?.box.w ?? 40) - 2))} step={0.5} value={v.w} onChange={(n) => set("w", n)} />
            <RangeInput label={kind === "patch" ? t("ลึก", "Depth") : t("ถุงลึก", "Bag depth")} unit={t("ซม.", "cm")} min={4} max={Math.max(6, Math.floor(host?.box.h ?? 30))} step={0.5} value={v.depth} onChange={(n) => set("depth", n)} />
            <RangeInput label={kind === "patch" ? t("ปากช่องต่ำจากขอบบนของชิ้น", "Opening below the top edge") : t("ซิปต่ำจากขอบบนของชิ้น", "Zip below the top edge")} unit={t("ซม.", "cm")} min={1} max={Math.max(2, Math.floor((host?.box.h ?? 30) - 4))} step={0.5} value={v.top} onChange={(n) => set("top", n)} />
            {host && !host.lining && <p className="rounded-md bg-amber-50 px-2 py-1.5 text-amber-800">{t("ชิ้นนี้ไม่ใช่ชั้นซับใน ช่องจะไปอยู่ด้านนอกของกระเป๋า (ถ้าต้องการช่องข้างใน ให้สร้างซับในก่อน แล้วเลือกชิ้นซับใน)", "This piece is not in the lining layer, so the pocket goes on the outside of the bag (create a lining first for an inside pocket)")}</p>}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
