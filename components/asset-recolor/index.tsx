"use client";

/**
 * 🎨 AssetRecolorModal — ของกลาง "เปลี่ยนสีรูปในคลัง → บันทึกเป็นสำเนาใหม่" (ตัวเดิมไม่หาย)
 *   มีเวกเตอร์ (assets.vector_key · ชิ้นที่แยกจากไฟล์ออกแบบ) = เปลี่ยนได้ทีละสี (พื้น/เส้น/จุด) + ปุ่ม "สีเดียวทั้งชิ้น"
 *   ไม่มีเวกเตอร์ (PNG ทั่วไป) = เปลี่ยนเป็นสีเดียวทั้งชิ้น (คงความโปร่งใส · เหมาะรูปลายเส้นสีเดียว)
 *   ปุ่มสีแบรนด์ (lib/brand-swatches) · บันทึก = PNG + SVG ชุดใหม่ ผูกกลับชิ้นเดิม (source_asset_id) · ย้อนกลับได้จากแจ้งผล (ลงถังขยะ)
 * ใช้: หน้ารายละเอียดไฟล์ในคลัง (components/asset-library/detail-modal) · สีเปลี่ยนตรงในการ์ดใช้ components/card-designer (ไม่สร้างสำเนา)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ColorInput } from "@/components/color-picker";
import { useBrandSwatches } from "@/lib/brand-swatches";
import { listSvgColors, recolorSvg, vectorUrl } from "@/lib/svg-recolor";
import type { AssetRow } from "@/app/api/assets/shared";

type Target = AssetRow & { collection_ids?: string[] };

const CHECKER = { backgroundImage: "linear-gradient(45deg,#eef0f3 25%,transparent 25%),linear-gradient(-45deg,#eef0f3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eef0f3 75%),linear-gradient(-45deg,transparent 75%,#eef0f3 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,0 8px,8px -8px,-8px 0" };

function loadImage(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    if (cors) i.crossOrigin = "anonymous";
    i.onload = () => res(i); i.onerror = () => rej(new Error("โหลดรูปไม่สำเร็จ"));
    i.src = src;
  });
}
/** ทาสีเดียวทั้งรูป คงความโปร่งใส */
function tintCanvas(img: HTMLImageElement, hex: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}
const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("แปลง PNG ไม่สำเร็จ"))), "image/png"));

export function AssetRecolorModal({ asset, actor, onClose, onSaved }: {
  asset: Target; actor?: string | null; onClose: () => void; onSaved?: (copy: AssetRow) => void;
}) {
  const toast = useToast();
  const swatches = useBrandSwatches();
  const vecKey = asset.vector_key ?? null;
  const [svg, setSvg] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [one, setOne] = useState("#1d9e75");              // โหมดสีเดียว (PNG)
  const [tintUrl, setTintUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [title, setTitle] = useState(`${asset.title}_สีใหม่`);
  const [saving, setSaving] = useState(false);

  // โหลดเวกเตอร์ (ถ้ามี) หรือรูป PNG สำหรับทาสีเดียว
  useEffect(() => {
    let off = false;
    if (vecKey) {
      fetch(vectorUrl(vecKey)).then((r) => (r.ok ? r.text() : Promise.reject(new Error("โหลดไฟล์เวกเตอร์ไม่สำเร็จ"))))
        .then((s) => { if (!off) setSvg(s); }).catch((e) => { if (!off) setLoadErr(e.message); });
    } else {
      loadImage(asset.url, true).then((i) => { if (off) return; imgRef.current = i; refreshTint(one); })
        .catch(() => { if (!off) setLoadErr("โหลดรูปไม่สำเร็จ (รูปนี้อาจเปิดข้ามเว็บไม่ได้)"); });
    }
    return () => { off = true; };
  }, [vecKey, asset.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const colors = useMemo(() => (svg ? listSvgColors(svg).slice(0, 24) : []), [svg]);
  const hasRaster = !!svg && /<image[\s>]/i.test(svg);
  const outSvg = useMemo(() => (svg ? recolorSvg(svg, map) : null), [svg, map]);
  const outUrl = useMemo(() => (outSvg ? URL.createObjectURL(new Blob([outSvg], { type: "image/svg+xml" })) : null), [outSvg]);
  useEffect(() => () => { if (outUrl) URL.revokeObjectURL(outUrl); }, [outUrl]);
  useEffect(() => () => { if (tintUrl) URL.revokeObjectURL(tintUrl); }, [tintUrl]);

  function refreshTint(hex: string) {
    const img = imgRef.current; if (!img) return;
    void toPng(tintCanvas(img, hex)).then((b) => setTintUrl(URL.createObjectURL(b))).catch(() => setLoadErr("รูปนี้ทาสีไม่ได้ (เปิดข้ามเว็บไม่ได้)"));
  }
  const changed = vecKey ? Object.entries(map).some(([a, b]) => a !== b) : !!tintUrl;
  const setAllTo = (hex: string) => setMap(Object.fromEntries(colors.map((c) => [c.color, hex])));

  const save = async () => {
    if (!title.trim()) { toast.error("ตั้งชื่อก่อน"); return; }
    setSaving(true);
    try {
      let png: Blob; let w: number; let h: number;
      if (vecKey && outSvg && outUrl) {
        const img = await loadImage(outUrl, false);
        w = asset.width || img.naturalWidth || 1024; h = asset.height || img.naturalHeight || 1024;
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        png = await toPng(c);
      } else {
        const img = imgRef.current; if (!img) throw new Error("ยังโหลดรูปไม่เสร็จ");
        const c = tintCanvas(img, one); w = c.width; h = c.height;
        png = await toPng(c);
      }
      const fd = new FormData();
      const name = title.trim().replace(/[\\/:*?"<>|]+/g, "_");
      fd.append("file", new File([png], `${name}.png`, { type: "image/png" }));
      if (vecKey && outSvg) fd.append("vector", new File([outSvg], `${name}.svg`, { type: "image/svg+xml" }));
      fd.append("title", title.trim());
      fd.append("width", String(w)); fd.append("height", String(h));
      fd.append("tags", "เปลี่ยนสี");
      fd.append("source_asset_id", asset.source_asset_id || asset.id);   // ผูกกลับไฟล์ต้นทาง (เห็นใน "ชิ้นอื่นจากไฟล์เดียวกัน")
      if (asset.collection_ids?.length) fd.append("collection_ids", JSON.stringify(asset.collection_ids));
      else if (asset.collection_id) fd.append("collection_id", asset.collection_id);
      if (actor) fd.append("actor", actor);
      const res = await apiFetch("/api/assets", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({ error: "บันทึกไม่สำเร็จ" }));
      if (!res.ok || j.error || !j.data) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      const copy = j.data as AssetRow;
      toast.undo(j.duplicate ? `มีรูปสีนี้อยู่แล้ว — ใช้ตัวเดิม “${copy.title}”` : `บันทึกสำเนาสีใหม่แล้ว “${copy.title}”`, async () => {
        if (j.duplicate) return;
        const r = await apiFetch(`/api/assets/${copy.id}`, { method: "DELETE" });
        if (!r.ok) { toast.error("ย้อนกลับไม่สำเร็จ"); return; }
        toast.success("ย้ายสำเนาลงถังขยะแล้ว");
        onSaved?.(copy);
      });
      onSaved?.(copy);
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const preview = (src: string | null, label: string) => (
    <div className="text-center">
      <div className="aspect-square rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden" style={CHECKER}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[12px] text-slate-400">…</span>}
      </div>
      <p className="mt-1 text-[12px] text-slate-500">{label}</p>
    </div>
  );

  return (
    <ERPModal open onClose={onClose} size="lg" title={`🎨 เปลี่ยนสี · ${asset.title}`} hasUnsavedChanges={changed && !saving}
      footer={
        <div className="flex flex-wrap items-center gap-2 w-full">
          <span className="text-[12px] text-slate-500 mr-auto">ตัวเดิมไม่หาย · บันทึกเป็นสำเนาใหม่ · ย้อนกลับได้</span>
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => void save()} disabled={saving || !changed || !!loadErr}
            className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกเป็นสำเนาใหม่"}</button>
        </div>
      }>
      {loadErr ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">{loadErr}</div>
      ) : (
        <div className="flex flex-col md:grid md:grid-cols-2 gap-4">
          <div className="grid grid-cols-2 gap-2">
            {preview(asset.url, "เดิม")}
            {preview(vecKey ? outUrl : tintUrl, "ใหม่")}
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            {vecKey ? (
              <>
                <p className="text-[12px] text-slate-500">สีในชิ้นนี้ ({colors.length} สี) · เรียงจากที่ใช้มากสุด</p>
                {!svg && <p className="text-[12px] text-slate-400">กำลังโหลดไฟล์เวกเตอร์…</p>}
                <div className="max-h-64 overflow-auto flex flex-col gap-1.5 pr-1">
                  {colors.map((c) => (
                    <div key={c.color} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
                      <span className="h-6 w-6 shrink-0 rounded border border-slate-200" style={{ background: c.color }} title={c.color} />
                      <span className="text-slate-400">→</span>
                      <div className="flex-1 min-w-0"><ColorInput value={map[c.color] ?? c.color} onChange={(v) => setMap((m) => ({ ...m, [c.color]: v }))} swatches={swatches} /></div>
                      {map[c.color] && map[c.color] !== c.color && (
                        <button type="button" title="กลับเป็นสีเดิม" onClick={() => setMap((m) => { const n = { ...m }; delete n[c.color]; return n; })} className="text-[12px] text-slate-400 hover:text-indigo-600">↺</button>
                      )}
                    </div>
                  ))}
                </div>
                {colors.length > 1 && (
                  <div className="flex items-center gap-2 text-[12px] text-slate-600">
                    <span className="shrink-0">ทาสีเดียวทั้งชิ้น</span>
                    <div className="flex-1 min-w-0"><ColorInput value={one} onChange={(v) => { setOne(v); if (/^#[0-9a-f]{6}$/i.test(v)) setAllTo(v); }} swatches={swatches} allowText={false} /></div>
                    {changed && <button type="button" onClick={() => setMap({})} className="text-indigo-600 hover:underline">ล้างทั้งหมด</button>}
                  </div>
                )}
                {hasRaster && <p className="text-[11px] text-amber-600">ชิ้นนี้มีรูปถ่าย/พิกเซลฝังอยู่ — ส่วนนั้นเปลี่ยนสีไม่ได้</p>}
              </>
            ) : (
              <>
                <p className="text-[12px] text-slate-500">รูปนี้ไม่มีไฟล์เวกเตอร์ — เปลี่ยนได้เป็น <b className="font-medium">สีเดียวทั้งชิ้น</b> (ส่วนโปร่งใสคงเดิม · เหมาะรูปลายเส้นสีเดียว)</p>
                <ColorInput value={one} onChange={(v) => { setOne(v); if (/^#[0-9a-f]{6}$/i.test(v)) refreshTint(v); }} swatches={swatches} />
                <p className="text-[11px] text-slate-400">อยากเปลี่ยนทีละสี → แยกชิ้นจากไฟล์ออกแบบใหม่โดยติ๊ก “เก็บไฟล์เวกเตอร์ไว้เปลี่ยนสีทีหลัง”</p>
              </>
            )}
            <div className="mt-1">
              <p className="text-[12px] text-slate-500 mb-1">ชื่อสำเนาใหม่</p>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full h-9 px-3 border border-slate-200 rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </ERPModal>
  );
}
