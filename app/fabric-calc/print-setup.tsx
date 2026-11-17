"use client";

/**
 * หน้าปรับก่อนพิมพ์ของ "คิดผ้าก่อนซื้อ" (เจ้าของเลือกแบบ A + ข้อเสนอ 1,2,3 จาก widget 2026-11-17)
 *   ใช้ป๊อปกลาง PrintSetupDialog (ซ้ายตัวเลือก · ขวาใบ A4 จริงเปลี่ยนตามทันที) — ไม่สร้างตัวพิมพ์ใหม่
 *   เลือกได้: ใบส่งจัดซื้อ / ใบสรุป / ใบวิธีตัด · ผ้า(สี)ที่จะพิมพ์ (ทั้งตระกูล) · ส่วนในใบสรุป · ช่วงผังการวาง (ภาพย่อ) · ภาพย่อต่อแถว
 *   จำตัวเลือกล่าสุดในเครื่อง (localStorage — ไม่จำผ้า/ช่วงผัง เพราะเปลี่ยนตามงาน) · QR ลิงก์กลับเมื่อบันทึกชุดคำนวณแล้ว
 *   ใบ HTML สร้างที่ lib/fabric-buy-print (renderFabricPrintHtml) · ใบวิธีตัด = lib/fabric-cut-sheet (cutSheetSection)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { PrintSetupDialog, PrintSetupSection } from "@/components/print-setup-dialog";
import { DEFAULT_FABRIC_PRINT, layoutSegPickThumbs, renderFabricPrintHtml, type FabricPrintItem, type FabricPrintMeta, type FabricPrintOpts, type FabricPrintSections } from "@/lib/fabric-buy-print";
import { CUT_SHEET_CSS, cutSheetSection, type CutSheetInput } from "@/lib/fabric-cut-sheet";
import { docFileName } from "@/lib/print-filename";
import { scanQrHtml } from "@/lib/scan-code";

const LS_KEY = "fabric-calc-print-opts";
type Remember = { po: boolean; summary: boolean; cut: boolean; sections: FabricPrintSections; thumbCols: number; qr: boolean };
const DEF: Remember = { po: DEFAULT_FABRIC_PRINT.po, summary: DEFAULT_FABRIC_PRINT.summary, cut: false, sections: DEFAULT_FABRIC_PRINT.sections, thumbCols: DEFAULT_FABRIC_PRINT.thumbCols, qr: true };

function loadRemember(): Remember {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEF;
    const j = JSON.parse(raw) as Partial<Remember>;
    return { ...DEF, ...j, sections: { ...DEF.sections, ...(j.sections ?? {}) } };
  } catch { return DEF; }
}

const SECTION_LABELS: [keyof FabricPrintSections, string][] = [
  ["kpi", "ตัวเลขหลัก (ต้องซื้อ · งบ · คุ้ม %)"], ["settings", "ค่าที่ตั้ง"], ["pieces", "ตารางชิ้นตัด"], ["compare", "เทียบหน้ากว้าง"], ["layout", "ผังการวาง (ภาพย่อ)"],
];

function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 text-[13px] ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function FabricPrintSetup({ open, onClose, items, meta, buildCut, calcId, docNo }: {
  open: boolean;
  onClose: () => void;
  /** ผ้าทั้งหมดที่พิมพ์ได้ (ผ้าเดียว = 1 ตัว) */
  items: FabricPrintItem[];
  meta: Omit<FabricPrintMeta, "qr_html">;
  /** สร้างข้อมูลใบวิธีตัดของผ้าที่เลือก (คำนวณเฉพาะตอนติ๊กใบวิธีตัด) */
  buildCut: (keys: string[]) => CutSheetInput[];
  /** ชุดคำนวณที่บันทึกแล้ว → QR ลิงก์กลับ */
  calcId?: string | null;
  /** ใช้ตั้งชื่อไฟล์ PDF */
  docNo?: string | null;
}) {
  const [rem, setRem] = useState<Remember>(DEF);
  const [picked, setPicked] = useState<string[]>([]);
  const [pages, setPages] = useState<Record<string, number[]>>({});
  const [qrHtml, setQrHtml] = useState("");
  const cutRef = useRef(buildCut);   // ตัวสร้างใบวิธีตัดตัวล่าสุด (ไม่ผูกพรีวิวกับ identity ของฟังก์ชัน — ข้อมูลเปลี่ยนเมื่อ items เปลี่ยนอยู่แล้ว)
  cutRef.current = buildCut;

  // เปิดทุกครั้ง = โหลดตัวเลือกที่จำไว้ + เลือกผ้าทุกตัว (ผ้าที่ต้องซื้อขึ้นก่อน)
  useEffect(() => {
    if (!open) return;
    setRem(loadRemember());
    setPicked(items.filter((i) => i.res.ok).map((i) => i.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const upd = (patch: Partial<Remember>) => setRem((r) => {
    const next = { ...r, ...patch };
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* โหมดส่วนตัว — ไม่จำ */ }
    return next;
  });

  // QR ลิงก์กลับหน้าคำนวณ (เฉพาะชุดที่บันทึกแล้ว)
  useEffect(() => {
    if (!open || !calcId) { setQrHtml(""); return; }
    let live = true;
    void scanQrHtml(`${window.location.origin}/fabric-calc?calc=${encodeURIComponent(calcId)}`, { width: 160, alt: "QR เปิดหน้าคำนวณ" }).then((h) => { if (live) setQrHtml(h); });
    return () => { live = false; };
  }, [open, calcId]);

  const sel = useMemo(() => items.filter((i) => picked.includes(i.key)), [items, picked]);
  const thumbs = useMemo(() => open && rem.summary && rem.sections.layout
    ? Object.fromEntries(sel.map((i) => [i.key, layoutSegPickThumbs(i.res.layout, i.res.usable_width_cm, i.input.form === "sheet" ? Number(i.input.sheet_length_cm) || null : null)]))
    : {}, [open, rem.summary, rem.sections.layout, sel]);

  const html = useMemo(() => {
    if (!open) return "";
    const opts: FabricPrintOpts = { po: rem.po, summary: rem.summary, sections: rem.sections, layoutPick: pages, thumbCols: rem.thumbCols };
    const cut = rem.cut && sel.length ? { html: cutRef.current(sel.map((i) => i.key)).map(cutSheetSection).join(""), css: CUT_SHEET_CSS } : undefined;
    return renderFabricPrintHtml(sel, { ...meta, qr_html: rem.qr ? qrHtml : "" }, opts, cut);
  }, [open, rem, pages, sel, meta, qrHtml]);

  const togglePage = (key: string, idx: number) => setPages((p) => {
    const cur = p[key] ?? [0, 1, 2];
    return { ...p, [key]: cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx].sort((a, b) => a - b) };
  });
  const setAllPages = (key: string, list: number[]) => setPages((p) => ({ ...p, [key]: list }));
  const multi = items.length > 1;
  const nothing = !rem.po && !rem.summary && !rem.cut;

  return (
    <PrintSetupDialog open={open} onClose={onClose} title="พิมพ์ / ส่งจัดซื้อ — คิดผ้าก่อนซื้อ" html={html}
      fileName={docFileName("คิดผ้าก่อนซื้อ", docNo ?? null)}
      note={<>ตัวเลือก (ใบ · ส่วน · ภาพย่อต่อแถว) จำไว้ในเครื่องนี้ให้ครั้งหน้า{calcId ? "" : " · บันทึกชุดคำนวณก่อน จะมี QR ลิงก์กลับหน้านี้"}</>}>
      <PrintSetupSection title="1. พิมพ์ใบไหน">
        <Check checked={rem.po} onChange={(v) => upd({ po: v })}>ใบส่งจัดซื้อ <span className="text-[11px] text-slate-400">— ตารางผ้าที่ต้องสั่ง + งบ + ช่องเซ็น (หน้าเดียว)</span></Check>
        <Check checked={rem.summary} onChange={(v) => upd({ summary: v })}>ใบสรุปคิดผ้า <span className="text-[11px] text-slate-400">— 1 ผ้า 1 หน้า</span></Check>
        <Check checked={rem.cut} onChange={(v) => upd({ cut: v })}>ใบวิธีตัด <span className="text-[11px] text-slate-400">— ส่งห้องตัด (แบบเดิม)</span></Check>
        {nothing && <p className="text-[12px] text-rose-600">เลือกอย่างน้อย 1 ใบ</p>}
      </PrintSetupSection>

      {multi && (
        <PrintSetupSection title="2. ผ้า / สี ที่จะพิมพ์">
          <div className="flex gap-2 text-[11px]">
            <button type="button" className="text-indigo-600 hover:underline" onClick={() => setPicked(items.map((i) => i.key))}>ทุกผ้า</button>
            <button type="button" className="text-indigo-600 hover:underline" onClick={() => setPicked(items.filter((i) => i.res.ok && i.res.to_buy > 0).map((i) => i.key))}>เฉพาะที่ต้องซื้อ</button>
            <button type="button" className="text-slate-500 hover:underline" onClick={() => setPicked([])}>ล้าง</button>
          </div>
          {items.map((i) => (
            <Check key={i.key} checked={picked.includes(i.key)} onChange={(v) => setPicked((p) => v ? [...p, i.key] : p.filter((k) => k !== i.key))}>
              <span className="font-medium text-slate-700">{i.fabric_name}</span>
              <span className="block text-[11px] text-slate-400">
                {i.colors?.length ? `สี ${i.colors.join(", ")} · ` : ""}
                {!i.res.ok ? (i.res.error ?? "คำนวณไม่ได้") : i.res.to_buy > 0 ? `ต้องซื้อ ${i.res.to_buy.toLocaleString("th-TH", { maximumFractionDigits: 2 })} ${i.res.unit_label}` : "สต็อกพอ"}
              </span>
            </Check>
          ))}
        </PrintSetupSection>
      )}

      {rem.summary && (
        <PrintSetupSection title={`${multi ? 3 : 2}. ส่วนในใบสรุป`}>
          {SECTION_LABELS.map(([k, label]) => (
            <Check key={k} checked={rem.sections[k]} onChange={(v) => upd({ sections: { ...rem.sections, [k]: v } })}>{label}</Check>
          ))}
        </PrintSetupSection>
      )}

      {rem.summary && rem.sections.layout && (
        <PrintSetupSection title="ผังการวาง — เลือกช่วงที่จะพิมพ์">
          <div className="flex items-center gap-1 text-[12px] text-slate-500">
            ภาพย่อต่อแถว
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" onClick={() => upd({ thumbCols: n })}
                className={`h-6 w-7 rounded border text-[12px] ${rem.thumbCols === n ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}>{n}</button>
            ))}
            <span className="text-[11px] text-slate-400">(น้อย = ภาพใหญ่)</span>
          </div>
          {sel.map((i) => {
            const list = thumbs[i.key] ?? [];
            if (!list.length) return <p key={i.key} className="text-[11px] text-slate-400">{i.fabric_name}: ไม่มีผัง</p>;
            const cur = pages[i.key] ?? [0, 1, 2];
            return (
              <div key={i.key} className="space-y-1">
                {multi && <div className="truncate text-[12px] font-medium text-slate-600">{i.fabric_name}</div>}
                <div className="flex gap-2 text-[11px]">
                  <span className="text-slate-400">{cur.filter((x) => x < list.length).length}/{list.length} ช่วง</span>
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => setAllPages(i.key, list.map((s) => s.index))}>ทั้งหมด</button>
                  <button type="button" className="text-indigo-600 hover:underline" onClick={() => setAllPages(i.key, [0])}>แรกอย่างเดียว</button>
                  <button type="button" className="text-slate-500 hover:underline" onClick={() => setAllPages(i.key, [])}>ไม่พิมพ์ผัง</button>
                </div>
                <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
                  {list.map((s) => {
                    const on = cur.includes(s.index);
                    return (
                      <button key={s.index} type="button" title={s.label} onClick={() => togglePage(i.key, s.index)}
                        className={`rounded border-2 bg-white p-0.5 text-center ${on ? "border-indigo-500" : "border-slate-200 opacity-60 hover:opacity-100"}`}>
                        <span className="block [&_svg]:h-auto [&_svg]:w-[42px]" dangerouslySetInnerHTML={{ __html: s.svg }} />
                        <span className={`block text-[10px] ${on ? "text-indigo-700" : "text-slate-400"}`}>{s.index + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </PrintSetupSection>
      )}

      <PrintSetupSection title="อื่น ๆ">
        <Check checked={rem.qr} disabled={!calcId} onChange={(v) => upd({ qr: v })}>QR มุมใบ ลิงก์กลับหน้าคำนวณ{!calcId && <span className="block text-[11px] text-slate-400">ต้องบันทึกชุดคำนวณก่อน</span>}</Check>
      </PrintSetupSection>
    </PrintSetupDialog>
  );
}
