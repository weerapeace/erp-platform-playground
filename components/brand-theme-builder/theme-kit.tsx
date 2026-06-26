"use client";

/**
 * Theme Kit Modal — ดาวน์โหลด "แม่แบบสไตล์แบบช่อง ๆ" + อัปกลับเข้าธีม (ของกลาง ใช้คู่ Brand Theme Builder)
 *
 * ดาวน์โหลด: วาดผัง (lib/brand-theme-kit) ลง canvas → PNG + คำสั่ง AI + รายชื่อไฟล์ต่อช่อง
 * อัปกลับ 2 โหมด:
 *   - แผ่นเดียว: สเกลรูปเข้าผัง → ตัดแต่ละช่อง (เผื่อขอบ) อัปขึ้น R2 + ดูดสีจากช่องสี
 *   - รายรูป: ลากหลายไฟล์ (ตั้งชื่อตาม slot) → แมปเข้า slot ตามชื่อ
 * reuse: ERPModal, apiFetch, /api/admin/upload (อัปขึ้น R2 ตัวเดียวกับ ImageInput)
 */
import { useMemo, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { buildKitLayout, KIT_COLOR_FIELDS, kitAiPrompt, kitFilename, slotIdFromFilename, type KitLayout } from "@/lib/brand-theme-kit";
import type { BrandTheme } from "@/lib/brand-theme";

export type KitApplyPatch = { slots?: Record<string, string | null>; colors?: Partial<BrandTheme> };

type Extracted = {
  images: { id: string; label: string; blob: Blob; url: string }[];
  colors: { key: keyof BrandTheme; label: string; hex: string }[];
};

// ── canvas helpers ──
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const isHex = (v: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((v ?? "").trim());
function lum(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
const textOn = (hex: string) => (lum(isHex(hex) ? hex : "#ffffff") > 0.6 ? "#0f172a" : "#ffffff");
const TH_FONT = "'Noto Sans Thai','Leelawadee UI','Tahoma',sans-serif";
const canvasToBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>((res) => cv.toBlob((b) => res(b), "image/png"));

function drawTemplate(ctx: CanvasRenderingContext2D, layout: KitLayout, draft: BrandTheme, brandName: string) {
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a"; ctx.font = `500 34px ${TH_FONT}`;
  ctx.fillText(`แม่แบบสไตล์ — ${brandName}`, PAD, 64);
  ctx.fillStyle = "#64748b"; ctx.font = `400 21px ${TH_FONT}`;
  ctx.fillText("วาด/วางรูปในกรอบเส้นประ · ห้ามขยับเส้น · ทาสีในช่องชุดสีด้านล่าง · พื้นรอบนอกสีขาว", PAD, 100);

  for (const s of layout.sections) {
    ctx.fillStyle = "#0f172a"; ctx.font = `500 27px ${TH_FONT}`;
    ctx.textAlign = "left"; ctx.fillText(s.title, PAD, s.y + 42);
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, s.y + 54); ctx.lineTo(layout.width - PAD, s.y + 54); ctx.stroke();
  }

  for (const c of layout.cells) {
    const boxH = c.rh + 16;
    if (c.kind === "image") {
      roundRect(ctx, c.tileX, c.tileY, c.tileW, boxH, 16);
      ctx.fillStyle = "#f8fafc"; ctx.fill();
      ctx.setLineDash([10, 8]); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.fillStyle = "#334155"; ctx.font = `400 22px ${TH_FONT}`;
      ctx.fillText(c.label, c.tileX + c.tileW / 2, c.tileY + boxH + 30);
      ctx.fillStyle = "#94a3b8"; ctx.font = `400 17px ${TH_FONT}`;
      ctx.fillText(kitFilename(c.id), c.tileX + c.tileW / 2, c.tileY + boxH + 52);
    } else {
      const hex = String(draft[c.colorKey!] ?? "#ffffff");
      roundRect(ctx, c.tileX, c.tileY, c.tileW, boxH, 14);
      ctx.fillStyle = isHex(hex) ? hex : "#ffffff"; ctx.fill();
      ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2; ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = textOn(hex); ctx.font = `400 21px ${TH_FONT}`;
      ctx.fillText(isHex(hex) ? hex : "#______", c.tileX + c.tileW / 2, c.tileY + boxH / 2 + 7);
      ctx.fillStyle = "#334155"; ctx.font = `400 21px ${TH_FONT}`;
      ctx.fillText(c.label, c.tileX + c.tileW / 2, c.tileY + boxH + 28);
    }
  }
  ctx.textAlign = "left";
}
const PAD = 62;

// เช็คว่ากรอบนี้ว่าง (ขาวเกือบหมด) → ข้าม ไม่ดึง
function regionBlank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): boolean {
  const d = ctx.getImageData(x, y, w, h).data;
  let sum = 0, min = 255, n = 0;
  for (let i = 0; i < d.length; i += 4 * 37) {        // sample ทุก ~37 px
    const b = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += b; if (b < min) min = b; n++;
  }
  return n > 0 && sum / n > 244 && min > 230;
}
function avgHex(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): string {
  const d = ctx.getImageData(x, y, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  const to = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return "#" + to(r) + to(g) + to(b);
}

export function ThemeKitModal({ open, onClose, draft, statuses = [], brandName, onApply }: {
  open: boolean; onClose: () => void; draft: BrandTheme;
  statuses?: { key: string; label: string }[]; brandName: string;
  onApply: (patch: KitApplyPatch) => void;
}) {
  const toast = useToast();
  const layout = useMemo(() => buildKitLayout(statuses), [statuses]);
  const [mode, setMode] = useState<"sheet" | "files">("sheet");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const sheetRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const imageCells = layout.cells.filter((c) => c.kind === "image");

  const downloadTemplate = () => {
    const cv = document.createElement("canvas");
    cv.width = layout.width; cv.height = layout.height;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    drawTemplate(ctx, layout, draft, brandName);
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `theme-template-${brandName.replace(/[^a-z0-9ก-๙]+/gi, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
    toast.success("ดาวน์โหลดแม่แบบแล้ว — เอาไปให้ AI เติมรูป/สีได้เลย");
  };

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(kitAiPrompt(brandName)); toast.success("คัดลอกคำสั่ง AI แล้ว"); }
    catch { toast.error("คัดลอกไม่ได้ — ก๊อปจากกล่องด้านล่างแทน"); }
  };

  // โหมดแผ่นเดียว: สเกลรูปเข้าผัง → ตัดทุกช่อง + ดูดสี
  const onSheetFile = (file: File) => {
    setBusy(true); setProgress("กำลังอ่านรูป..."); setExtracted(null);
    const img = new Image();
    img.onload = () => void (async () => {
      try {
        const cv = document.createElement("canvas");
        cv.width = layout.width; cv.height = layout.height;
        const ctx = cv.getContext("2d");
        if (!ctx) throw new Error("canvas error");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, layout.width, layout.height);   // สเกลแผ่นเข้าขนาดผังมาตรฐาน

        const images: Extracted["images"] = [];
        const colors: Extracted["colors"] = [];
        for (const c of layout.cells) {
          if (c.kind === "image") {
            if (regionBlank(ctx, c.rx, c.ry, c.rw, c.rh)) continue;
            const oc = document.createElement("canvas"); oc.width = c.rw; oc.height = c.rh;
            oc.getContext("2d")!.drawImage(cv, c.rx, c.ry, c.rw, c.rh, 0, 0, c.rw, c.rh);
            const blob = await canvasToBlob(oc);
            if (blob) images.push({ id: c.id, label: c.label, blob, url: URL.createObjectURL(blob) });
          } else {
            const hex = avgHex(ctx, c.rx + c.rw * 0.3, c.ry + c.rh * 0.3, Math.max(8, c.rw * 0.4), Math.max(8, c.rh * 0.4));
            colors.push({ key: c.colorKey!, label: c.label, hex });
          }
        }
        setExtracted({ images, colors });
        if (!images.length && !colors.length) toast.error("ไม่พบรูป/สีในแผ่น — ตรวจว่าใช้แม่แบบที่เติมแล้ว");
      } catch { toast.error("ประมวลผลรูปไม่สำเร็จ"); }
      finally { setBusy(false); setProgress(""); if (sheetRef.current) sheetRef.current.value = ""; }
    })();
    img.onerror = () => { setBusy(false); setProgress(""); toast.error("อ่านรูปไม่ได้"); };
    img.src = URL.createObjectURL(file);
  };

  const uploadOne = async (blobOrFile: Blob, filename: string): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", new File([blobOrFile], filename, { type: blobOrFile.type || "image/png" }));
    fd.append("folder", "brand-theme");
    const r = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
    const j = await r.json();
    return j?.r2_key ?? null;
  };

  // ดึงผลจากแผ่นเดียวเข้าธีม (อัปทุกรูป + ตั้งสี)
  const applySheet = async () => {
    if (!extracted) return;
    setBusy(true);
    try {
      const slots: Record<string, string | null> = {};
      let i = 0;
      for (const im of extracted.images) {
        setProgress(`อัปรูป ${++i}/${extracted.images.length}...`);
        const key = await uploadOne(im.blob, kitFilename(im.id));
        if (key) slots[im.id] = key;
      }
      const colors: Partial<BrandTheme> = {};
      for (const c of extracted.colors) (colors as Record<string, string>)[c.key as string] = c.hex;
      onApply({ slots, colors });
      toast.success(`ดึงเข้าธีมแล้ว: รูป ${Object.keys(slots).length} · สี ${extracted.colors.length} — กดเผยแพร่เพื่อใช้จริง`);
      setExtracted(null); onClose();
    } catch { toast.error("อัปขึ้นระบบไม่สำเร็จ"); }
    finally { setBusy(false); setProgress(""); }
  };

  // โหมดรายรูป: แมปไฟล์ตามชื่อ → slot
  const onFilesPicked = (files: FileList) => void (async () => {
    setBusy(true);
    try {
      const validIds = imageCells.map((c) => c.id);
      const slots: Record<string, string | null> = {};
      const unknown: string[] = [];
      let i = 0;
      for (const f of Array.from(files)) {
        const id = slotIdFromFilename(f.name, validIds);
        if (!id) { unknown.push(f.name); continue; }
        setProgress(`อัป ${++i}...`);
        const key = await uploadOne(f, f.name);
        if (key) slots[id] = key;
      }
      const okN = Object.keys(slots).length;
      if (okN) onApply({ slots });
      toast.success(unknown.length ? `อัปแล้ว ${okN} รูป · ข้าม ${unknown.length} (ชื่อไม่ตรงช่อง)` : `อัปแล้ว ${okN} รูป — กดเผยแพร่เพื่อใช้จริง`);
      if (okN && !unknown.length) onClose();
    } catch { toast.error("อัปไฟล์ไม่สำเร็จ"); }
    finally { setBusy(false); setProgress(""); if (filesRef.current) filesRef.current.value = ""; }
  })();

  return (
    <ERPModal open={open} onClose={onClose} size="lg" storageKey="brand-theme-kit"
      title="🧩 ชุดธีม — แม่แบบรูป + สี (ให้ AI เติม)"
      description="ดาวน์โหลดแม่แบบช่อง ๆ → ให้ AI เติมรูป/สี → อัปกลับ ระบบจัดเข้าธีมให้อัตโนมัติ">
      <div className="space-y-4">
        {/* 1) ดาวน์โหลด */}
        <section className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 text-sm font-medium text-slate-700">1) ดาวน์โหลดแม่แบบ</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadTemplate} disabled={busy}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">⬇️ ดาวน์โหลดแม่แบบ (PNG)</button>
            <button onClick={() => void copyPrompt()} disabled={busy}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">📋 คัดลอกคำสั่ง AI</button>
            <button onClick={() => setShowFiles((s) => !s)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{showFiles ? "▼" : "▶"} รายชื่อไฟล์ต่อช่อง ({imageCells.length})</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">แผ่นมี {imageCells.length} ช่องรูป + {KIT_COLOR_FIELDS.length} ช่องสี · เอาไปให้ AI เติมในกรอบเส้นประโดยไม่ขยับเส้น</p>
          {showFiles && (
            <div className="mt-2 max-h-32 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] font-mono text-slate-500">
              {imageCells.map((c) => <div key={c.id}>{kitFilename(c.id)} — <span className="font-sans">{c.label}</span></div>)}
            </div>
          )}
        </section>

        {/* 2) อัปกลับ */}
        <section className="rounded-lg border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">2) อัปแม่แบบที่เติมแล้วกลับ</div>
            <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs">
              <button onClick={() => { setMode("sheet"); setExtracted(null); }} className={`px-2.5 py-1 rounded-md ${mode === "sheet" ? "bg-blue-600 text-white" : "text-slate-500"}`}>แผ่นเดียว (ตัดอัตโนมัติ)</button>
              <button onClick={() => { setMode("files"); setExtracted(null); }} className={`px-2.5 py-1 rounded-md ${mode === "files" ? "bg-blue-600 text-white" : "text-slate-500"}`}>รายรูป (หลายไฟล์)</button>
            </div>
          </div>

          {mode === "sheet" ? (
            <div>
              <button onClick={() => sheetRef.current?.click()} disabled={busy}
                className="h-9 px-4 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">🖼 เลือกแผ่นที่เติมแล้ว (รูปเดียว)</button>
              <input ref={sheetRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onSheetFile(f); }} />
              <p className="mt-2 text-[11px] text-slate-400">ระบบจะตัดเฉพาะส่วนในของแต่ละกรอบ (เผื่อขอบ) แล้วดูดสีจากช่องสี · ช่องที่เว้นว่าง (ขาว) จะถูกข้าม</p>

              {extracted && (
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-2">
                  <div className="mb-1.5 text-xs text-slate-500">พบรูป {extracted.images.length} · สี {extracted.colors.length} (ตรวจก่อนดึงเข้าธีม)</div>
                  {extracted.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {extracted.images.map((im) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={im.id} src={im.url} alt={im.label} title={im.label} className="h-12 w-12 rounded border border-slate-200 bg-white object-contain" />
                      ))}
                    </div>
                  )}
                  {extracted.colors.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {extracted.colors.map((c) => (
                        <span key={String(c.key)} title={`${c.label} ${c.hex}`} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                          <span className="h-3.5 w-3.5 rounded-sm border border-slate-200" style={{ background: c.hex }} />{c.label}
                        </span>
                      ))}
                    </div>
                  )}
                  <button onClick={() => void applySheet()} disabled={busy || (!extracted.images.length && !extracted.colors.length)}
                    className="mt-2.5 h-9 px-4 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">✨ ดึงรูป+สี เข้าธีม</button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <button onClick={() => filesRef.current?.click()} disabled={busy}
                className="h-9 px-4 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50">🗂 เลือกรูปหลายไฟล์ (ตั้งชื่อตามช่อง)</button>
              <input ref={filesRef} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { if (e.target.files?.length) onFilesPicked(e.target.files); }} />
              <p className="mt-2 text-[11px] text-slate-400">ตั้งชื่อไฟล์ให้ตรงช่อง เช่น <span className="font-mono">header_left.png</span>, <span className="font-mono">stat_icon_0.png</span> (ดูรายชื่อไฟล์จากส่วนที่ 1) · ระบบแมปเข้า slot ตามชื่ออัตโนมัติ</p>
            </div>
          )}
        </section>

        {busy && <div className="text-center text-sm text-blue-600">{progress || "กำลังทำงาน..."}</div>}
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
          เคล็ดลับ: ถ้า AI วาดไม่ตรงกรอบ (ตัดแล้วเพี้ยน) ให้ใช้โหมด “รายรูป” จะคมชัดกว่า · ทั้งสองวิธีดึงเข้า “แบบร่าง” ก่อน ปรับต่อแล้วค่อยกดเผยแพร่
        </p>
      </div>
    </ERPModal>
  );
}
