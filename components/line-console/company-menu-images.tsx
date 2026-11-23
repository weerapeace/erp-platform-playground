"use client";

/**
 * รูปเมนูไลน์บริษัทที่ออกแบบเอง (อยู่ใต้ตัวอย่างใน company-menu-editor · เจ้าของเลือกข้อ 3.1-3.4 · 2026-11-23)
 *   3.1 ย่อ/ตัดขอบ/บีบให้เองในเบราว์เซอร์ → ขนาดตามกฎ LINE (2500×843 / 2500×1686 · ≤1MB) · สัดส่วนต่างมาก = ถามก่อนตัดขอบ
 *   3.2 เส้นแบ่งปุ่มทับรูป (กดตรงไหน = ปุ่มไหน)   3.3 โหลดแบบเปล่าขนาดถูกต้องไปออกแบบ
 *   3.4 รูปเก่าเก็บไว้ ย้อนกลับได้ (แจ้งผลมุมจอ + รายการรูปก่อน ๆ) · กลับไปใช้รูปที่ระบบวาดได้ทุกเมื่อ
 * กติกา lib/line-company-images · API /api/admin/line-company/menu-image · ของกลาง: useFileDrop · UploadProgress · toast · askConfirm
 */
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { useFileDrop, FileDropHint } from "@/components/file-drop";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import type { CompanyMenuLayout, PublishedMenuKey } from "@/lib/line-company";
import {
  MENU_IMAGE_CROP_WARN, MENU_IMAGE_MAX_BYTES, coverCrop, menuButtonCount, menuImageAreas, menuImageFits, menuImageTarget, type MenuImage,
} from "@/lib/line-company-images";

export type MenuImageView = MenuImage & { url: string | null; thumb: string | null };
export type MenuImagesView = Partial<Record<PublishedMenuKey, { current: MenuImageView | null; history: MenuImageView[] }>>;

const fmtTime = (d: string) => (d ? new Date(d).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const kb = (n: number) => `${Math.round(n / 1024)}KB`;

/** ย่อ + ตัดขอบกลาง + บีบให้ไม่เกิน 1MB (PNG ถ้าไหว ไม่งั้น JPG ลดคุณภาพทีละขั้น) */
async function prepareImage(file: File, target: { width: number; height: number }): Promise<File | null> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("เปิดรูปนี้ไม่ได้ — ใช้ไฟล์ JPG หรือ PNG");
  const crop = coverCrop({ width: bmp.width, height: bmp.height }, target);
  if (crop.off > MENU_IMAGE_CROP_WARN) {
    const ok = await askConfirm({
      title: "สัดส่วนรูปไม่ตรงกับเมนู",
      message: `รูปนี้ ${bmp.width}×${bmp.height} แต่เมนูต้องการ ${target.width}×${target.height} · ระบบจะตัดขอบ${bmp.width / bmp.height > target.width / target.height ? "ซ้าย-ขวา" : "บน-ล่าง"}ให้พอดี (เก็บกลางรูปไว้) ต่อเลยไหม?`,
      confirmText: "ตัดขอบแล้วใช้",
    });
    if (!ok) return null;
  }
  const c = document.createElement("canvas");
  c.width = target.width; c.height = target.height;
  const g = c.getContext("2d");
  if (!g) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = "high";
  g.drawImage(bmp, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, c.width, c.height);
  const blob = (type: string, q?: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
  const base = file.name.replace(/\.[^.]+$/, "") || "menu";
  if (file.type === "image/png") {
    const png = await blob("image/png");
    if (png && png.size <= MENU_IMAGE_MAX_BYTES) return new File([png], `${base}.png`, { type: "image/png" });
  }
  for (let q = 0.92; q >= 0.5; q -= 0.07) {
    const jpg = await blob("image/jpeg", q);
    if (jpg && jpg.size <= MENU_IMAGE_MAX_BYTES) return new File([jpg], `${base}.jpg`, { type: "image/jpeg" });
  }
  throw new Error("บีบรูปให้ไม่เกิน 1MB ไม่ได้ — ลองรูปที่ลายละเอียดน้อยลง");
}

/** แบบเปล่าขนาดถูกต้อง มีเส้นแบ่งปุ่ม + เลขปุ่ม → ดาวน์โหลด PNG */
async function downloadTemplate(key: PublishedMenuKey, layout: CompanyMenuLayout) {
  const count = menuButtonCount(key, layout);
  const t = menuImageTarget(count);
  const c = document.createElement("canvas");
  c.width = t.width; c.height = t.height;
  const g = c.getContext("2d"); if (!g) return;
  g.fillStyle = "#f8fafc"; g.fillRect(0, 0, t.width, t.height);
  for (const a of menuImageAreas(key, layout)) {
    g.fillStyle = a.tab ? (a.on ? "#ede9fe" : "#f1f5f9") : "#ffffff";
    g.fillRect(a.box.x + 6, a.box.y + 6, a.box.width - 12, a.box.height - 12);
    g.setLineDash([24, 16]); g.lineWidth = 6; g.strokeStyle = "#6366f1";
    g.strokeRect(a.box.x + 6, a.box.y + 6, a.box.width - 12, a.box.height - 12);
    g.setLineDash([]);
    g.fillStyle = "#4338ca"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `${a.tab ? 64 : 96}px sans-serif`;
    g.fillText(a.tab ? `แท็บ ${a.label}` : `ปุ่ม ${a.label}`, a.box.x + a.box.width / 2, a.box.y + a.box.height / 2);
  }
  g.font = "40px sans-serif"; g.fillStyle = "#94a3b8"; g.textAlign = "right"; g.textBaseline = "bottom";
  g.fillText(`แบบเปล่าเมนูไลน์ ${t.width}×${t.height} · กดตรงกรอบไหน = ปุ่มนั้น`, t.width - 30, t.height - 20);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `แบบเปล่าเมนูไลน์-${key}-${t.width}x${t.height}.png`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** เส้นแบ่งปุ่มทับรูป (ตำแหน่งเป็น % ของรูป) */
export function MenuAreaOverlay({ menuKey, layout }: { menuKey: PublishedMenuKey; layout: CompanyMenuLayout }) {
  const t = menuImageTarget(menuButtonCount(menuKey, layout));
  return (
    <div className="pointer-events-none absolute inset-0">
      {menuImageAreas(menuKey, layout).map((a) => (
        <div key={`${a.tab}-${a.label}`} className="absolute border border-dashed border-indigo-500/80"
          style={{ left: `${(a.box.x / t.width) * 100}%`, top: `${(a.box.y / t.height) * 100}%`, width: `${(a.box.width / t.width) * 100}%`, height: `${(a.box.height / t.height) * 100}%` }}>
          <span className="absolute bottom-0.5 left-0.5 rounded bg-indigo-600/85 px-1 text-[9px] leading-4 text-white">{a.label}</span>
        </div>
      ))}
    </div>
  );
}

export function CompanyMenuImages({ menuKey, layout, images, onChanged }: {
  menuKey: PublishedMenuKey; layout: CompanyMenuLayout; images: MenuImagesView; onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [busy, setBusy] = useState(false);
  const [grid, setGrid] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const slot = images[menuKey];
  const cur = slot?.current ?? null;
  const history = slot?.history ?? [];
  const count = menuButtonCount(menuKey, layout);
  const target = menuImageTarget(count);
  const fits = menuImageFits(cur, count);

  const send = async (body: FormData | Record<string, unknown>) => {
    const r = await apiFetch("/api/admin/line-company/menu-image", body instanceof FormData
      ? { method: "POST", body }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || (j as { error?: string }).error) throw new Error((j as { error?: string }).error || "บันทึกไม่สำเร็จ");
    await onChanged();
  };
  const act = async (body: Record<string, unknown>, done: string, undo?: Record<string, unknown>) => {
    setBusy(true);
    try {
      await send({ key: menuKey, ...body });
      if (undo) toast.undo(done, async () => { try { await send({ key: menuKey, ...undo }); toast.success("ย้อนกลับแล้ว"); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); } });
      else toast.success(done);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      setUp({ name: file.name, size: file.size, pct: null, label: "กำลังย่อรูปให้พอดีเมนู" });
      const ready = await prepareImage(file, target);
      if (!ready) return;
      setUp({ name: ready.name, size: ready.size, pct: null, label: "กำลังอัปโหลด" });
      const fd = new FormData();
      fd.set("key", menuKey); fd.set("count", String(count)); fd.set("file", ready);
      const hadCur = !!cur;
      await send(fd);
      toast.undo(`ใช้รูปของคุณแล้ว (${target.width}×${target.height} · ${kb(ready.size)}) · กดสร้างเมนูในไลน์เพื่อให้ทุกคนเห็น`, async () => {
        try { await send(hadCur ? { key: menuKey, action: "revert", index: 0 } : { key: menuKey, action: "use_drawn" }); toast.success("ย้อนกลับแล้ว"); }
        catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setUp(null); setBusy(false); if (input.current) input.current.value = ""; }
  };
  const drop = useFileDrop((files) => void upload(files[0]), { accept: "image/", disabled: busy, onReject: () => toast.warning("ใช้ได้เฉพาะไฟล์รูป") });

  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 p-2" {...drop.guard}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-slate-600">รูปเมนูหน้านี้</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${cur && fits ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{cur && fits ? "ใช้รูปของฉัน" : "ระบบวาดให้"}</span>
        <span className="text-[10px] text-slate-400">ต้องการ {target.width}×{target.height} · {count} ปุ่ม</span>
      </div>

      {cur && (
        <div>
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50" style={{ aspectRatio: `${cur.width} / ${cur.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cur.url && <img src={cur.url} alt="รูปเมนูที่อัปโหลด" className="h-full w-full object-cover" />}
            {grid && fits && <MenuAreaOverlay menuKey={menuKey} layout={layout} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-400">
            <span>{cur.name || "รูป"} · {cur.width}×{cur.height} · {kb(cur.bytes)} · อัป {fmtTime(cur.uploaded_at)}{cur.uploaded_by ? ` · ${cur.uploaded_by}` : ""}</span>
            {fits && <label className="inline-flex items-center gap-1"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> เส้นแบ่งปุ่ม</label>}
          </div>
          {!fits && (
            <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              รูปนี้ทำไว้สำหรับ {cur.count} ปุ่ม แต่ตอนนี้หน้านี้มี {count} ปุ่ม — ตอนสร้างเมนูจะใช้รูปที่ระบบวาดแทน (อัปรูปใหม่ หรือจัดปุ่มกลับเป็น {cur.count} ปุ่ม)
            </div>
          )}
        </div>
      )}

      <div {...drop.zone("menu")} className="relative">
        <FileDropHint show={drop.over === "menu"} label="วางรูปเมนูที่นี่" />
        {up ? <UploadProgress {...up} /> : (
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-0.5 rounded-lg border border-dashed border-slate-300 px-2 py-2.5 text-[11px] text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            <Icon name="upload" />
            <span>{cur ? "เปลี่ยนรูป — " : ""}ลากรูปมาวาง · กดเลือก · หรือ Ctrl+V</span>
            <span className="text-[10px] text-slate-400">JPG/PNG ขนาดไหนก็ได้ ระบบย่อ-ตัดขอบ-บีบให้เหลือ {target.width}×{target.height} ไม่เกิน 1MB</span>
          </button>
        )}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => void downloadTemplate(menuKey, layout)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] text-slate-700 hover:bg-slate-50"><Icon name="download" /> โหลดแบบเปล่าไปออกแบบ</button>
        {cur && <button type="button" disabled={busy} onClick={() => void act({ action: "use_drawn" }, "กลับไปใช้รูปที่ระบบวาดแล้ว", { action: "revert", index: 0 })}
          className="h-7 rounded-lg border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">กลับไปใช้รูปที่ระบบวาด</button>}
        {history.length > 0 && <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50"><Icon name="history" /> รูปก่อน ๆ ({history.length})</button>}
      </div>

      {showHistory && history.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {history.map((h, i) => (
            <div key={h.r2_key} className="rounded-lg border border-slate-200 p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {h.thumb && <img src={h.thumb} alt="" loading="lazy" className="w-full rounded" style={{ aspectRatio: `${h.width} / ${h.height}`, objectFit: "cover" }} />}
              <div className="mt-0.5 truncate text-[10px] text-slate-500">{fmtTime(h.uploaded_at)} · {h.count} ปุ่ม</div>
              <button type="button" disabled={busy} onClick={() => void act({ action: "revert", index: i }, "ใช้รูปที่เลือกแล้ว", cur ? { action: "revert", index: 0 } : { action: "use_drawn" })}
                className="mt-0.5 h-6 w-full rounded border border-slate-200 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-40">ใช้รูปนี้</button>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-slate-400">แอดมิน 3 แท็บ: ทำรูปแยกได้ทีละแท็บ (แถบแท็บอยู่ในรูป 200 px บนสุด) · คนในไลน์เห็นรูปใหม่หลังกด &ldquo;สร้างเมนูในไลน์&rdquo;</div>
    </div>
  );
}
