"use client";

/**
 * หน้าต่าง "แยกชิ้น" — ภาพเดียวมีหลายส่วน (เช่น ช้าง + ตัวหนังสือ) → แยกเป็นหลายชิ้น แต่ละชิ้นมีเส้นตัดของตัวเอง
 * ตัวช่วยในเครื่องหาส่วนต่าง ๆ แล้วรวมส่วนที่ห่างกันไม่เกิน "ระยะรวมชิ้น" (ตัวอักษรในคำเดียวกันรวมเป็นคำ)
 * คลิกชิ้น 2 ชิ้นแล้วกด "รวม" = สั่งรวมเอง · จำการแยกไว้กับลายในคลังได้ (ครั้งหน้าแยกให้เอง)
 */
import { useEffect, useMemo, useState } from "react";
import { useT, useLang } from "@/components/i18n";
import { ERPModal } from "@/components/modal";
import { helperApi, helperFileUrl, type SplitResult } from "@/lib/nesting-helper";
import type { NestingItem, SplitParams } from "./data";
import { fmtLen, type FileInfo, type Unit } from "./nest-utils";
import { NumInput } from "./num-input";

export function SplitModal({
  open, onClose, item, info, scale, initial, saved, canRemember, unit, onApply, onForget,
}: {
  open: boolean;
  onClose: () => void;
  item: NestingItem;
  info: FileInfo;
  scale: number;                 // ขนาดที่จะพิมพ์ ÷ ขนาดจริงของภาพ (ชิ้นที่แยกได้ขนาดเท่าเดิมในภาพ)
  initial: SplitParams;
  saved: boolean;                // ลายนี้จำการแยกไว้ในคลังแล้ว
  canRemember: boolean;          // มาจากคลัง (มี asset_id)
  unit: Unit;
  onApply: (res: SplitResult, params: SplitParams, qtys: number[], remember: boolean) => Promise<void>;
  onForget: () => Promise<void>;
}) {
  const t = useT();
  const { lang } = useLang();
  const [gap, setGap] = useState(initial.gap_mm);
  const [joins, setJoins] = useState<[number, number][]>(initial.joins);
  const [res, setRes] = useState<SplitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [qtys, setQtys] = useState<number[]>([]);
  const [remember, setRemember] = useState(canRemember);
  const [applying, setApplying] = useState(false);
  const sha = item.file?.sha ?? "";

  useEffect(() => {
    if (!open) return;
    setGap(initial.gap_mm); setJoins(initial.joins); setSelected([]); setRemember(canRemember); setError(null);
  }, [open, initial, canRemember]);

  // ตัวอย่างการแยก — ถามตัวช่วยใหม่ทุกครั้งที่เลื่อนระยะ/สั่งรวม (หน่วงนิดหน่อยตอนเลื่อน)
  useEffect(() => {
    if (!open || !sha) return;
    let alive = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const r = await helperApi<SplitResult>(`/api/files/${sha}/split`, lang, { method: "POST", body: { gap_mm: gap, joins } });
        if (!alive) return;
        setRes(r); setError(null);
        setQtys((q) => (q.length === r.groups.length ? q : r.groups.map(() => item.qty)));
      } catch (e) { if (alive) setError((e as Error).message); } finally { if (alive) setLoading(false); }
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [open, sha, gap, joins, lang, item.qty]);

  const [u0, v0, u1, v1] = info.trim_box;
  const tw = u1 - u0, th = v1 - v0;
  const groups = useMemo(() => res?.groups ?? [], [res]);

  // คลิกบนภาพ → ชิ้นที่กรอบครอบจุดนั้น (กรอบเล็กสุดก่อน) · เลือกได้ทีละ 2 ชิ้น
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * tw, y = ((e.clientY - r.top) / r.height) * th;
    const hit = groups.filter((g) => x >= g.box[0] && x <= g.box[2] && y >= g.box[1] && y <= g.box[3])
      .sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]))[0];
    if (!hit) return;
    setSelected((s) => (s.includes(hit.index) ? s.filter((i) => i !== hit.index) : [...s, hit.index].slice(-2)));
  };
  const joinSelected = () => {
    const [a, b] = selected.map((i) => groups[i]);
    if (!a || !b) return;
    setJoins((j) => [...j, [a.auto[0], b.auto[0]]]);
    setSelected([]);
  };
  const changeGap = (v: number) => { setGap(v); setJoins([]); setSelected([]); };   // เลขกลุ่มเปลี่ยนตามระยะ → ล้างที่สั่งรวมเอง

  const apply = async () => {
    setApplying(true); setError(null);
    try {
      const r = await helperApi<SplitResult>(`/api/files/${sha}/split`, lang, {
        method: "POST", body: { gap_mm: gap, joins, apply: true, name: item.file?.name ?? "image.png" },
      });
      await onApply(r, { gap_mm: gap, joins }, qtys, remember && canRemember);
    } catch (e) { setError((e as Error).message); } finally { setApplying(false); }
  };

  return (
    <ERPModal open={open} onClose={() => { if (!applying) onClose(); }} size="lg" closeOnBackdrop={!applying}
      title={`✂️ ${t("แยกชิ้น", "Split pieces")} · ${item.title}`}
      description={t("แยกส่วนต่าง ๆ ในภาพออกเป็นหลายชิ้น แต่ละชิ้นมีเส้นตัดของตัวเอง", "Split the parts of this image into separate pieces, each with its own cut line")}
      footer={
        <div className="flex items-center justify-end gap-2">
          {saved && (
            <button type="button" disabled={applying} onClick={() => void onForget()} className="mr-auto text-xs text-slate-500 underline">
              {t("เลิกจำการแยกในคลัง", "Stop remembering this split")}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={applying} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void apply()} disabled={applying || loading || groups.length < 2}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
            {applying ? t("กำลังแยก…", "Splitting…") : t(`ใช้การแยกนี้ (${groups.length} ชิ้น)`, `Use this split (${groups.length} pieces)`)}
          </button>
        </div>
      }>
      <div className="grid gap-4 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <div className="relative cursor-pointer select-none overflow-hidden rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#eceef1_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
            onClick={pick} title={t("คลิกเลือกชิ้น 2 ชิ้นแล้วกด “รวม”", "Click two pieces, then press “Join”")}>
            <img src={helperFileUrl(sha, "view")} alt="" className="block w-full" draggable={false} />
            {res?.overlay && <img src={res.overlay} alt="" className="absolute inset-0 h-full w-full" draggable={false} />}
            {groups.map((g) => (
              <div key={g.index} className="pointer-events-none absolute"
                style={{ left: `${(g.box[0] / tw) * 100}%`, top: `${(g.box[1] / th) * 100}%`, width: `${((g.box[2] - g.box[0]) / tw) * 100}%`, height: `${((g.box[3] - g.box[1]) / th) * 100}%`,
                  outline: selected.includes(g.index) ? `3px solid ${g.color}` : `1px dashed ${g.color}` }}>
                <span className="absolute left-0 top-0 rounded-br px-1 text-[11px] font-semibold text-white" style={{ background: g.color }}>{g.index + 1}</span>
              </div>
            ))}
            {loading && <div className="absolute inset-0 flex items-center justify-center bg-white/50 text-xs text-slate-600">⏳ {t("กำลังหาชิ้น…", "Finding pieces…")}</div>}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <span className="shrink-0">{t("รวมส่วนที่ห่างกันไม่เกิน", "Join parts closer than")}</span>
            <input type="range" min={0} max={20} step={0.5} value={gap} onChange={(e) => changeGap(Number(e.target.value))} className="flex-1" aria-label={t("ระยะรวมชิ้น", "Join distance")} />
            <span className="w-12 shrink-0 text-right font-medium text-slate-800">{gap} mm</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{t("เลื่อนน้อย = แยกละเอียด · เลื่อนมาก = รวมเป็นก้อน", "Lower = finer pieces · higher = bigger pieces")}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <button type="button" disabled={selected.length !== 2} onClick={joinSelected}
              className="rounded border border-violet-300 bg-violet-50 px-2 py-1 text-violet-700 disabled:opacity-40">
              {t("รวม 2 ชิ้นที่เลือก", "Join the 2 selected")}
            </button>
            {joins.length > 0 && (
              <button type="button" onClick={() => { setJoins([]); setSelected([]); }} className="rounded border border-slate-300 px-2 py-1 text-slate-600">
                {t("ยกเลิกที่รวมเอง", "Undo manual joins")}
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-700">{t("ชิ้นที่ได้", "Pieces")} ({groups.length})</div>
          <div className="max-h-72 space-y-1 overflow-auto">
            {groups.map((g, i) => (
              <div key={g.index} className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs ${selected.includes(g.index) ? "bg-violet-50" : ""}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color }} />
                <span className="flex-1">{t(`ชิ้น ${i + 1}`, `Piece ${i + 1}`)} · {fmtLen(g.w_mm * scale, unit, lang)} × {fmtLen(g.h_mm * scale, unit, lang)}</span>
                <NumInput className="h-6 w-14 rounded border border-slate-300 px-1" integer value={String(qtys[i] ?? item.qty)}
                  onChange={(v) => setQtys((q) => groups.map((_, k) => (k === i ? Math.max(0, Math.floor(v ?? 0)) : q[k] ?? item.qty)))} />
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-slate-500">{t("แต่ละชิ้นมีเส้นตัดของตัวเอง · ขนาดเท่าเดิมในภาพ · ใส่จำนวนแยกได้", "Each piece has its own cut line · same size as in the image · set quantities separately")}</div>
          {groups.length === 1 && !loading && <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">{t("ตอนนี้ได้ชิ้นเดียว — ลองลดระยะรวมชิ้น", "Only one piece now — try a smaller join distance")}</div>}
          {canRemember && (
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
              <span>{t("จำการแยกนี้ไว้กับลายในคลัง — ครั้งหน้าลากไฟล์ลายนี้มา แยกให้เอง", "Remember this split with the library artwork — next time this file is dropped, it splits automatically")}</span>
            </label>
          )}
          {error && <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</div>}
        </div>
      </div>
    </ERPModal>
  );
}
