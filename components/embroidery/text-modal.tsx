"use client";
/**
 * 🧵 ไฟล์ปัก — พิมพ์ตัวหนังสือแล้วได้ฝีปัก (รอบ 4 ข้อ 9)
 *   แปลงข้อความเป็นเส้นด้วยตัวแปลงของบล็อกพิมพ์ (lib/block-print-text · fontkit · ฟอนต์ในรายการ BLOCK_FONTS หรืออัปโหลดเอง)
 *   คืนเส้น + ความสูงจริงที่ปัก (มม.) + สี → หน้าทำงาน/หน้ารายการเอาไปทำเป็นชิ้น (ซิกแซกเลี้ยวตามเส้นอัตโนมัติ)
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { BLOCK_FONTS } from "@/lib/block-print-layout";
import { textToOps, uploadFont, uploadedFontNames } from "@/lib/block-print-text";
import type { DrawOps } from "@/lib/block-print";

export type TextResult = { ops: { d: DrawOps; w: number; h: number }; text: string; color: string; heightMm: number };

export function TextPieceModal({ open, onClose, onAdd, colors = [] }: {
  open: boolean; onClose: () => void; onAdd: (r: TextResult) => void; colors?: string[];
}) {
  const [text, setText] = useState("");
  const [font, setFont] = useState("Kanit");
  const [weight, setWeight] = useState(700);
  const [heightCm, setHeightCm] = useState(1.5);
  const [color, setColor] = useState(colors[0] ?? "#1f2a44");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>(() => uploadedFontNames());
  const f = BLOCK_FONTS.find((x) => x.family === font);
  const weights = f?.weights ?? [400];

  const add = async () => {
    setErr(null);
    if (!text.trim()) { setErr("พิมพ์ข้อความก่อน"); return; }
    if (!(heightCm > 0.2 && heightCm <= 40)) { setErr("ความสูงต้องอยู่ระหว่าง 0.3 – 40 ซม."); return; }
    setBusy(true);
    try {
      const ops = await textToOps(text, font, weights.includes(weight) ? weight : weights[0]);
      onAdd({ ops, text: text.trim(), color, heightMm: heightCm * 10 });
      setText("");
    } catch (e) { setErr(e instanceof Error ? e.message : "แปลงตัวหนังสือไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const upload = async (file: File) => {
    try { const name = await uploadFont(file); setExtra(uploadedFontNames()); setFont(name); }
    catch (e) { setErr(e instanceof Error ? e.message : "อ่านฟอนต์ไม่ได้"); }
  };

  return (
    <ERPModal open={open} onClose={onClose} title="พิมพ์ตัวหนังสือ → ฝีปัก" size="md" hasUnsavedChanges={!!text.trim()}
      description="ได้ซิกแซกเลี้ยวตามเส้นอัตโนมัติ · ตัวหนังสือควรสูง ≥ 5 มม. และเส้นหนา ≥ 1.5 มม. ถึงจะปักชัด"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" disabled={busy} onClick={() => void add()} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "กำลังแปลง…" : "เพิ่มตัวหนังสือ"}</button>
        </div>
      }>
      <div className="space-y-3 text-sm">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">ข้อความ (Enter = ขึ้นบรรทัดใหม่)</span>
          <textarea rows={2} value={text} onChange={(e) => { setText(e.target.value); setErr(null); }} placeholder="เช่น Chamber" className="w-full rounded-lg border border-slate-200 px-2 py-1.5 focus:border-indigo-400 focus:outline-none" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500">ฟอนต์</span>
            <select value={font} onChange={(e) => setFont(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2">
              {BLOCK_FONTS.map((x) => <option key={x.family} value={x.family}>{x.family}{x.thai ? " (ไทย)" : ""}</option>)}
              {extra.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500">น้ำหนัก</span>
            <select value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2">
              {weights.map((w) => <option key={w} value={w}>{w >= 600 ? "หนา" : "ปกติ"} ({w})</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500">สูง (ซม.)</span>
            <input type="number" min={0.3} max={40} step={0.1} value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} className="h-9 w-full rounded-lg border border-slate-200 px-2" />
          </label>
        </div>
        <div className="space-y-1">
          <span className="block text-xs font-medium text-slate-500">สีด้าย</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {colors.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`สี ${c}`} className={`h-7 w-7 rounded-full border ${color === c ? "ring-2 ring-indigo-500 ring-offset-1" : "border-slate-300"}`} style={{ background: c }} />)}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded border border-slate-200" aria-label="สีอื่น" />
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-slate-500 underline">
          ใช้ฟอนต์ของเราเอง (.ttf / .otf)
          <input type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => { const fl = e.target.files?.[0]; e.target.value = ""; if (fl) void upload(fl); }} />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </ERPModal>
  );
}
