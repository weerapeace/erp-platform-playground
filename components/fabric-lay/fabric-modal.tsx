"use client";
/**
 * ✂️ เพิ่ม / แก้ผ้าในอัลบั้ม — รูปถ่าย → ขนาดจริง (กว้าง×ยาว ซม.) → จิ้ม 4 มุมผ้า (แก้มุมเอียง) → ตรวจระยะ 2 จุด
 *   ดัดรูปใช้ของกลาง StraightenModal (lib/perspective-warp) บังคับสัดส่วน = ขนาดจริง → 1 ซม. บนผ้า = img_w / width_cm จุดภาพ
 *   รูปถ่าย (ย่อแล้ว) เก็บไว้ด้วย → แก้มุมใหม่ได้ภายหลัง (จำมุมเดิม)
 */
import { useEffect, useRef, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { FreeTextPicker } from "@/components/free-text-picker";
import { StraightenModal } from "@/components/photo-capture/straighten-modal";
import type { Quad } from "@/lib/perspective-warp";
import { checkResults, cleanChecks, type LayCheck } from "@/lib/fabric-lay";
import type { Pt } from "@/lib/pattern-shape";
import { API, FABRIC_KIND, api, imgUrl, shrinkToJpeg, uploadImage, type Fabric } from "./shared";

type Img = { url: string; w: number; h: number; blob?: Blob; key?: string | null };

export function FabricModal({ open, fabric, onClose, onSaved }: {
  open: boolean;
  /** null = เพิ่มผ้าใหม่ */
  fabric: Fabric | null;
  onClose: () => void;
  onSaved: (f: Fabric) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [photo, setPhoto] = useState<Img | null>(null);   // รูปถ่าย (ย่อแล้ว)
  const [flat, setFlat] = useState<Img | null>(null);     // รูปดัดตรงแล้ว
  const [quad, setQuad] = useState<Quad | null>(null);
  const [checks, setChecks] = useState<LayCheck[]>([]);
  const [straighten, setStraighten] = useState(false);
  const [measure, setMeasure] = useState<Pt | null | "on">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    const f = fabric;
    setName(f?.name ?? ""); setKind(f?.kind ?? ""); setNote(f?.note ?? "");
    setW(f?.width_cm ? String(Number(f.width_cm)) : ""); setH(f?.height_cm ? String(Number(f.height_cm)) : "");
    setPhoto(f?.photo_key ? { url: imgUrl(f.photo_key) ?? "", w: 0, h: 0, key: f.photo_key } : null);
    setFlat(f?.image_key ? { url: imgUrl(f.image_key) ?? "", w: f.img_w ?? 0, h: f.img_h ?? 0, key: f.image_key } : null);
    setQuad(f?.quad ? (f.quad.map(([x, y]) => ({ x, y })) as Quad) : null);
    setChecks(cleanChecks(f?.checks ?? []));
    setMeasure(null); setDirty(false);
  }, [open, fabric]);

  const wn = Number(w), hn = Number(h);
  const sizeOk = wn >= 1 && hn >= 1 && wn <= 2000 && hn <= 2000;
  const flatAspect = flat && flat.w && flat.h ? flat.w / flat.h : null;
  const aspectOff = flatAspect && sizeOk ? Math.abs(flatAspect / (wn / hn) - 1) : 0;

  const pickFile = async (file: File) => {
    setBusy("กำลังเตรียมรูป…");
    try {
      const s = await shrinkToJpeg(file, 3600);
      setPhoto({ url: URL.createObjectURL(s.blob), w: s.w, h: s.h, blob: s.blob, key: null });
      setFlat(null); setQuad(null); setChecks([]); setDirty(true);
      if (!name) setName(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80));
      if (sizeOk) setStraighten(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เปิดรูปไม่ได้"); }
    setBusy(null);
  };

  /** ใช้ทั้งรูปเป็นผ้า (รูปสแกน/ถ่ายตรงแล้ว ไม่ต้องดัด) */
  const takeWhole = async () => {
    if (!photo) return;
    const im = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); if (!/^(blob|data):/.test(photo.url)) i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("x")); i.src = photo.url; }).catch(() => null);
    if (!im) { toast.error("เปิดรูปไม่ได้"); return; }
    setFlat({ url: photo.url, w: im.naturalWidth, h: im.naturalHeight, blob: photo.blob, key: photo.blob ? null : photo.key });
    setQuad(null); setChecks([]); setDirty(true);
  };

  const save = async () => {
    if (!name.trim()) { toast.warning("ใส่ชื่อผ้าก่อน"); return; }
    if (!sizeOk) { toast.warning("ใส่ขนาดจริงของผ้า กว้าง×ยาว (1–2000 ซม.)"); return; }
    if (!flat) { toast.warning("ใส่รูปผ้า แล้วจิ้ม 4 มุม (หรือกด ใช้ทั้งรูป)"); return; }
    if (aspectOff > 0.03) { toast.warning("สัดส่วนรูปไม่ตรงกับขนาดผ้า — กด \"จิ้ม 4 มุม\" ใหม่หลังแก้ขนาด"); return; }
    try {
      setBusy("กำลังอัปรูป…");
      const photoKey = photo?.blob ? await uploadImage(photo.blob, "fabric-photo.jpg") : photo?.key ?? null;
      const imageKey = flat.blob ? (flat.blob === photo?.blob && photoKey ? photoKey : await uploadImage(flat.blob, "fabric-flat.jpg")) : flat.key ?? null;
      setBusy("กำลังบันทึก…");
      const body = {
        name: name.trim(), kind: kind.trim() || null, note: note.trim() || null, width_cm: wn, height_cm: hn,
        photo_key: photoKey, image_key: imageKey, img_w: flat.w, img_h: flat.h,
        quad: quad ? quad.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]) : null, checks,
      };
      const saved = fabric ? await api<Fabric>(`${API}/fabrics/${fabric.id}`, { method: "PATCH", json: body }) : await api<Fabric>(`${API}/fabrics`, { json: body });
      toast.success(fabric ? "บันทึกผ้าแล้ว" : `เพิ่มผ้า ${saved.code} แล้ว`);
      setDirty(false);
      onSaved(saved);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    setBusy(null);
  };

  // ── ตรวจระยะ: คลิก 2 จุดบนรูปตรง แล้วใส่ระยะจริง ──
  const flatRef = useRef<HTMLDivElement>(null);
  const clickFlat = (e: React.MouseEvent) => {
    if (!measure || !flatRef.current || !sizeOk) return;
    const r = flatRef.current.getBoundingClientRect();
    const p: Pt = [Math.round(((e.clientX - r.left) / r.width) * wn * 100) / 100, Math.round(((e.clientY - r.top) / r.height) * hn * 100) / 100];
    if (measure === "on") { setMeasure(p); return; }
    const a = measure, got = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const real = Number(window.prompt(`ระยะจริงระหว่าง 2 จุดนี้กี่ ซม.? (ระบบวัดได้ ${got.toFixed(1)} ซม.)`, got.toFixed(1)));
    setMeasure(null);
    if (real > 0) { setChecks((c) => [...c, { a, b: p, real }].slice(-10)); setDirty(true); }
  };
  const results = checkResults(checks);

  return (
    <ERPModal open={open} onClose={onClose} title={fabric ? `แก้ผ้า ${fabric.code}` : "เพิ่มผ้าเข้าอัลบั้ม"} size="xl" hasUnsavedChanges={dirty} loading={!!busy}
      description="ถ่ายรูปผ้าจากด้านบน ใส่ขนาดจริง แล้วจิ้ม 4 มุมผ้า — ระบบดัดรูปให้ตรงและขนาดเป๊ะ"
      footer={<div className="flex w-full items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{busy}</span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={!!busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">บันทึก</button>
        </div>
      </div>}>
      <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-3 text-sm">
          <label className="block"><span className="text-xs text-slate-500">ชื่อผ้า *</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2" placeholder="ผ้าทอกวาง ผืน A" /></label>
          <div><span className="text-xs text-slate-500">ประเภทผ้า</span>
            <FreeTextPicker kind={FABRIC_KIND} value={kind} onChange={(v) => { setKind(v); setDirty(true); }} title="ประเภทผ้า" placeholder="ผ้าทอลาย / ผ้าพิมพ์ / ผ้าปัก"
              inputClassName="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2" /></div>
          <div>
            <span className="text-xs text-slate-500">ขนาดจริงของผ้า (วัดด้วยตลับเมตร) *</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input inputMode="decimal" value={w} onChange={(e) => { setW(e.target.value); setDirty(true); }} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-right" placeholder="กว้าง" />
              <span>×</span>
              <input inputMode="decimal" value={h} onChange={(e) => { setH(e.target.value); setDirty(true); }} className="h-9 w-20 rounded-lg border border-slate-200 px-2 text-right" placeholder="ยาว" />
              <span className="text-xs text-slate-500">ซม.</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">กว้าง = ด้านซ้าย→ขวาในรูป · ยาว = บน→ล่าง · วัดขอบที่จะจิ้มมุม</p>
          </div>
          <label className="block"><span className="text-xs text-slate-500">โน้ต</span>
            <textarea value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1" /></label>

          <div className="space-y-1.5 rounded-lg border border-slate-200 p-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"><Icon name="upload" /> {photo ? "เปลี่ยนรูปผ้า" : "เลือกรูปผ้า / ถ่ายรูป"}</button>
            <button type="button" disabled={!photo || !sizeOk} onClick={() => setStraighten(true)} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-50 font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"><Icon value="i:perspective" /> จิ้ม 4 มุมผ้า (แก้มุมเอียง)</button>
            <button type="button" disabled={!photo} onClick={() => void takeWhole()} className="h-8 w-full rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40">ใช้ทั้งรูป (รูปสแกน/ตัดขอบตรงแล้ว)</button>
            {!sizeOk && photo && <p className="text-[11px] text-amber-700">ใส่ขนาดจริงก่อน แล้วค่อยจิ้มมุม</p>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickFile(f); }} />
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          {flat && sizeOk ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-700">รูปผ้าที่ดัดตรงแล้ว · {wn}×{hn} ซม.</span>
                {flat.w > 0 && <span className="text-slate-500">ความละเอียด {(flat.w / wn).toFixed(1)} จุด/ซม.</span>}
                <span className="flex-1" />
                <button type="button" onClick={() => setMeasure(measure ? null : "on")} className={`h-7 rounded-md border px-2 ${measure ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white"}`}><Icon name="ruler" /> {measure ? (measure === "on" ? "คลิกจุดที่ 1" : "คลิกจุดที่ 2") : "ตรวจระยะ 2 จุด"}</button>
              </div>
              {aspectOff > 0.03 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">สัดส่วนรูปไม่ตรงกับขนาดที่ใส่ (ต่าง {(aspectOff * 100).toFixed(0)}%) — กด จิ้ม 4 มุมผ้า อีกครั้ง</div>}
              <div ref={flatRef} onClick={clickFlat} className={`relative mx-auto ${measure ? "cursor-crosshair" : ""}`} style={{ aspectRatio: `${wn} / ${hn}`, maxWidth: `min(100%, calc(55vh * ${wn / hn}))` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flat.url} alt="" className="absolute inset-0 h-full w-full rounded" draggable={false} />
                <svg viewBox={`0 0 ${wn} ${hn}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                  {Array.from({ length: Math.floor(wn / 10) }, (_, i) => <line key={`x${i}`} x1={(i + 1) * 10} y1={0} x2={(i + 1) * 10} y2={hn} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.12} />)}
                  {Array.from({ length: Math.floor(hn / 10) }, (_, i) => <line key={`y${i}`} x1={0} y1={(i + 1) * 10} x2={wn} y2={(i + 1) * 10} stroke="#fff" strokeOpacity={0.35} strokeWidth={0.12} />)}
                  {checks.map((c, i) => <line key={i} x1={c.a[0]} y1={c.a[1]} x2={c.b[0]} y2={c.b[1]} stroke={results[i]?.ok ? "#22c55e" : "#f59e0b"} strokeWidth={Math.max(wn, hn) / 250} />)}
                  {measure && measure !== "on" && <circle cx={measure[0]} cy={measure[1]} r={Math.max(wn, hn) / 120} fill="#6366f1" />}
                </svg>
              </div>
              <p className="text-[11px] text-slate-500">เส้นตาราง = ทุก 10 ซม. · ตรวจระยะ: คลิก 2 จุดที่รู้ระยะจริง (เช่น ขอบลายที่วัดไว้) ระบบบอกว่าคลาดกี่ ซม.</p>
              {checks.length > 0 && (
                <table className="w-full text-xs">
                  <thead><tr className="text-slate-500"><th className="text-left font-normal">จุดตรวจ</th><th className="text-right font-normal">จริง</th><th className="text-right font-normal">วัดได้</th><th className="text-right font-normal">คลาด</th><th /></tr></thead>
                  <tbody>{checks.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td>คู่ที่ {i + 1}</td><td className="text-right">{c.real} ซม.</td><td className="text-right">{results[i].got} ซม.</td>
                      <td className={`text-right ${results[i].ok ? "text-emerald-700" : "text-amber-700"}`}>{results[i].err > 0 ? "+" : ""}{results[i].err} ซม. ({results[i].pct}%)</td>
                      <td className="text-right"><button type="button" onClick={() => { setChecks((cs) => cs.filter((_, j) => j !== i)); setDirty(true); }} className="text-slate-400 hover:text-red-600" aria-label="ลบจุดตรวจ"><Icon value="i:x" /></button></td>
                    </tr>))}</tbody>
                </table>
              )}
            </>
          ) : (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              {photo ? <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="max-h-[40vh] rounded" />
                <span>ใส่ขนาดจริง แล้วกด “จิ้ม 4 มุมผ้า”</span>
              </> : <>
                <Icon name="upload" />
                <span>1) ถ่ายรูปผ้าจากด้านบนให้เห็นครบ 4 มุม · 2) วัดกว้าง×ยาวจริง · 3) จิ้ม 4 มุม</span>
              </>}
            </div>
          )}
        </div>
      </div>

      {photo && sizeOk && (
        <StraightenModal open={straighten} src={photo.url} aspect={wn / hn} initialQuad={quad} maxSide={4000} zIndex={70}
          title="จิ้ม 4 มุมของผ้า" description={`ลากจุดทั้ง 4 ไปวางที่มุมผ้าพอดี (ซูมเบราว์เซอร์ช่วยได้) · ขนาดจริง ${wn}×${hn} ซม.`}
          onClose={() => setStraighten(false)}
          onDone={({ blob, w: ow, h: oh, quad: q }) => { setFlat({ url: URL.createObjectURL(blob), w: ow, h: oh, blob }); setQuad(q); setChecks([]); setDirty(true); }} />
      )}
    </ERPModal>
  );
}
