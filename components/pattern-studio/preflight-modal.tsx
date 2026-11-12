"use client";
/**
 * 🛂 ด่านตรวจก่อนพิมพ์ / ส่งไฟล์ตัด (Bag CAD รอบ B · 2026-11-12) — เปิดจากปุ่ม "ใบสเปก / พิมพ์ / ไฟล์ตัด" ของแอปสตูดิโอแพทเทิร์น
 *   ตรวจด้วยตัวตรวจเดียวกับแผง "ตรวจแบบ" (lib/pattern-check) + สถานะบันทึก (ไฟล์ทุกแบบต้องออกจากรุ่นที่บันทึกแล้วรุ่นเดียวกัน)
 *   มีข้อสีแดง = พิมพ์ได้แค่ "แบบร่าง" (ลายน้ำทุกหน้า · ?draft=1) · ผ่าน = เปิดหน้าพิมพ์ / ดาวน์โหลด DXF / SVG ตามปกติ
 *   ข้อสีเหลืองไม่กันการพิมพ์ (เช่น ขอบที่ยังไม่ได้ระบุว่าเปิดตั้งใจ)
 */
import { useMemo, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { checkPattern, describeIssue, type CheckCode, type CheckIssue, type CheckLevel } from "@/lib/pattern-check";
import { formatLength, isLengthUnit, type LengthUnit } from "@/lib/length-units";
import type { ProjectPiece } from "@/lib/pattern-project";
import type { Seam } from "@/lib/pattern-seams";

export type SaveState = "saved" | "pending" | "saving" | "failed";
const GROUPS: { key: string; th: string; en: string; codes: CheckCode[] }[] = [
  { key: "shape", th: "เส้นตัดปิด ไม่ตัดกันเอง ไม่มีจุดซ้ำ", en: "Closed cut lines, no self-crossing, no duplicate points", codes: ["self-cross", "cut-cross", "short-edge"] },
  { key: "seam", th: "ตะเข็บครบ ยาวเท่ากัน หรือระบุว่าตั้งใจรูด", en: "Seams complete and equal, or marked as eased", codes: ["seam-broken", "seam-mismatch", "seam-eased"] },
  { key: "open", th: "ขอบที่ไม่ได้เย็บ ระบุว่าเปิดตั้งใจแล้ว", en: "Unsewn edges marked as intended openings", codes: ["edge-open"] },
  { key: "hole", th: "รู / ช่องเจาะ ไม่หลุดหรือชิดเส้นเย็บ", en: "Holes not outside or too close to the sew line", codes: ["hole-out", "hole-near"] },
  { key: "info", th: "ชื่อชิ้นและวัสดุครบ", en: "Piece names and materials filled in", codes: ["no-material", "no-name"] },
];
const RANK: Record<CheckLevel | "ok", number> = { ok: 0, info: 1, warn: 2, error: 3 };
const ICON: Record<CheckLevel | "ok", { v: string; c: string; th: string; en: string }> = {
  ok: { v: "i:circle-check", c: "text-emerald-600", th: "ผ่าน", en: "OK" },
  info: { v: "i:info-circle", c: "text-blue-600", th: "รับทราบ", en: "For info" },
  warn: { v: "i:alert-triangle", c: "text-amber-600", th: "ควรดู", en: "Worth a look" },
  error: { v: "i:circle-x", c: "text-red-600", th: "ต้องแก้", en: "Must fix" },
};

export function PreflightModal({ open, onClose, pieces, seams, tol, saveState, rev, onSaveNow, onPrint }: {
  open: boolean; onClose: () => void;
  pieces: ProjectPiece[]; seams: Seam[]; tol: number;
  saveState: SaveState; rev: number | null;
  onSaveNow: () => void;
  /** เปิดหน้าพิมพ์ — draft = แบบร่าง (มีลายน้ำ) */
  onPrint: (draft: boolean) => void;
}) {
  const t = useT();
  const unit: LengthUnit = useMemo(() => { try { const v = localStorage.getItem("pattern-studio-unit"); return isLengthUnit(v) ? v : "mm"; } catch { return "mm"; } }, []);
  const L = (cm: number) => formatLength(cm, unit, { label: t("th", "en") as "th" | "en" });
  const issues = useMemo(() => (open ? checkPattern(pieces.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, count: p.count, shape: p.shape, holes: p.holes, inner: p.inner, allow: p.allow, allowEdges: p.allowEdges, foldEdges: p.foldEdges, edgeMeta: p.edgeMeta, mats: p.mats ?? [] })), seams, { tol }) : []), [open, pieces, seams, tol]);
  const rows = GROUPS.map((g) => {
    const list = issues.filter((x) => g.codes.includes(x.code));
    const lv = list.reduce<CheckLevel | "ok">((m, x) => (RANK[x.level] > RANK[m] ? x.level : m), "ok");
    return { ...g, list, lv };
  });
  const saved = saveState === "saved";
  const errors = rows.filter((r) => r.lv === "error").length + (saved ? 0 : 1);
  const row = (lv: CheckLevel | "ok", title: string, body?: ReactNode, key?: string) => (
    <li key={key ?? title} className="flex gap-2 border-t border-slate-100 py-2 first:border-t-0">
      <span className={`mt-0.5 shrink-0 ${ICON[lv].c}`} title={t(ICON[lv].th, ICON[lv].en)}><Icon value={ICON[lv].v} /><span className="sr-only">{t(ICON[lv].th, ICON[lv].en)}</span></span>
      <div className="min-w-0 flex-1"><div className="text-sm text-slate-800">{title}</div>{body}</div>
    </li>
  );
  const detail = (list: CheckIssue[]) => list.length ? (
    <ul className="mt-0.5 space-y-0.5 text-[12px] text-slate-500">
      {list.slice(0, 3).map((x) => { const d = describeIssue(x, L); return <li key={x.id}>· {t(d.th, d.en)}</li>; })}
      {list.length > 3 && <li>{t(`· และอีก ${list.length - 3} ข้อ — ดูทั้งหมดที่ปุ่ม ตรวจแบบ บนกระดาน`, `· and ${list.length - 3} more — see all under Check on the board`)}</li>}
    </ul>
  ) : null;
  return (
    <ERPModal open={open} onClose={onClose} size="md" title={t("ตรวจก่อนพิมพ์ / ส่งไฟล์ตัด", "Check before printing / cut files")}
      description={t("ไฟล์ผลิตต้องผ่านข้อสีแดงทั้งหมด · ข้อสีเหลืองพิมพ์ได้แต่ควรดู", "Production files need every red item fixed · yellow items can still print")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">{t("ปิด", "Close")}</button>
          {errors > 0
            ? <button type="button" data-preflight-draft onClick={() => onPrint(true)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">{t("พิมพ์แบบร่าง (มีลายน้ำ)", "Print a draft (watermarked)")}</button>
            : <button type="button" data-preflight-print onClick={() => onPrint(false)} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">{t("เปิดหน้าพิมพ์ / ไฟล์ตัด", "Open print / cut files")}</button>}
        </div>
      }>
      <ul data-preflight className="text-sm">
        {row(saved ? "ok" : "error", saved ? t(`บันทึกแล้ว — ไฟล์ทุกแบบออกจากรุ่นเดียวกัน${rev ? ` (rev ${rev})` : ""}`, `Saved — every file comes from the same version${rev ? ` (rev ${rev})` : ""}`) : t("ยังมีการแก้ที่ยังไม่บันทึก — หน้าพิมพ์ใช้ข้อมูลที่บันทึกแล้ว", "There are unsaved changes — the print page uses the saved version"),
          saved ? null : <button type="button" onClick={onSaveNow} disabled={saveState === "saving"} className="mt-1 h-7 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">{saveState === "saving" ? t("กำลังบันทึก…", "Saving…") : t("บันทึกเดี๋ยวนี้", "Save now")}</button>, "save")}
        {rows.map((r) => row(r.lv, t(r.th, r.en), detail(r.list), r.key))}
        {row("ok", t("PDF มีกรอบสอบเทียบ 100 × 100 มม. + เลขแผ่น + แนวต่อกระดาษ", "The PDF has a 100 × 100 mm calibration square, sheet numbers and joining marks"),
          <div className="text-[12px] text-slate-500">{t("ตั้งพิมพ์ Actual size / ขนาดจริง 100% แล้ววัดกรอบก่อนตัด · DXF: ทดสอบกับโปรแกรม/เครื่องตัดปลายทางก่อนใช้จริง", "Print at Actual size / 100% and measure the square before cutting · DXF: test with the target software/cutter first")}</div>, "pdf")}
      </ul>
      {errors > 0 && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{t(`ยังส่งเป็นไฟล์ผลิตไม่ได้ — แก้ ${errors} ข้อสีแดงก่อน (กดปุ่ม ตรวจแบบ บนกระดาน แล้วกดแต่ละแถวเพื่อไปที่จุดนั้น)`, `Not ready for production — fix ${errors} red item(s) first (open Check on the board and click each row to jump there)`)}</p>}
    </ERPModal>
  );
}
