"use client";

/**
 * DesignSheetPresentPanel — แผงลอย "📄 ใบนำเสนอ A4" ของใบงานออกแบบ (ของกลาง เปิดได้จาก Design Dashboard / ป๊อปอัปใบงาน / หน้ามือถือ)
 *
 * แบบ A (ตกลงกับเจ้าของ): เลือกรูป + แม่แบบสำเร็จ — ไม่ลากวางอิสระ
 * - หน้า 1-2 · แต่ละหน้าเลือกรูปแบบจัดวาง (LAYOUTS) · เลือกรูปจาก 2 แหล่ง: ใบงาน (แกลเลอรี/รายละเอียด/comment) และ กระดานแคมเปญ
 * - หัวข้อ/จุดขาย/ข้อความ แก้ได้ · ราคาเสนอ เปิด-ปิดได้ (ไม่มีต้นทุนให้เลือกเลย)
 * - พรีวิว A4 ย่อในแผง (เทมเพลตเดียวกับหน้าพิมพ์) · บันทึก → PUT /presentation · พิมพ์/PDF → /print/design-sheet-present/[id]
 * - ใช้ FloatingPanel ของกลาง (ลาก/ย่อ/ขยาย · มือถือ=เต็มจอ)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { FloatingPanel } from "@/components/floating-panel";
import { withImageWidth } from "@/lib/r2-image";
import { buildReportHtml } from "@/lib/template";
import { LAYOUTS, MAX_PAGES, buildPresentData, DEFAULT_DS_PRESENT_TEMPLATE, type Presentation, type PresentPage, type PresentLayout, type PresentImage } from "@/lib/design-sheet-present";
import { loadPresentBundle, type PresentBundle } from "@/lib/design-sheet-present-client";
import type { CanvasImage } from "@/app/api/creative-campaigns/[id]/canvas-images/route";

type Campaign = { id: string; name: string; brand?: { name?: string } | null };

export function DesignSheetPresentPanel({ sheetId, open, onClose }: { sheetId: string | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [bundle, setBundle] = useState<PresentBundle | null>(null);
  const [pages, setPages] = useState<PresentPage[]>([]);
  const [cur, setCur] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [picker, setPicker] = useState<"sheet" | "canvas" | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [canvasImgs, setCanvasImgs] = useState<CanvasImage[]>([]);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.5);

  // โหลดใบงาน + รูป + ใบนำเสนอที่เคยจัด
  useEffect(() => {
    if (!open || !sheetId) return;
    let alive = true;
    setLoading(true); setError(null); setBundle(null); setPicker(null); setCur(0); setDirty(false);
    loadPresentBundle(sheetId).then((b) => { if (!alive) return; setBundle(b); setPages(b.presentation.pages); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "โหลดไม่ได้"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, sheetId]);

  // รายชื่อแคมเปญ (เฉพาะตอนเปิดตัวเลือก "จากกระดานแคมเปญ")
  useEffect(() => {
    if (picker !== "canvas" || campaigns.length) return;
    apiFetch("/api/creative-campaigns?limit=100").then((r) => r.json())
      .then((j) => setCampaigns(Array.isArray(j.data) ? (j.data as Campaign[]) : []))
      .catch(() => setCampaigns([]));
  }, [picker, campaigns.length]);
  useEffect(() => {
    if (!campaignId) { setCanvasImgs([]); return; }
    let alive = true; setCanvasLoading(true);
    apiFetch(`/api/creative-campaigns/${encodeURIComponent(campaignId)}/canvas-images`).then((r) => r.json())
      .then((j) => { if (alive) setCanvasImgs(Array.isArray(j.data) ? (j.data as CanvasImage[]) : []); })
      .catch(() => { if (alive) setCanvasImgs([]); })
      .finally(() => { if (alive) setCanvasLoading(false); });
    return () => { alive = false; };
  }, [campaignId]);

  // พรีวิว: ย่อ A4 (794px) ให้พอดีกว้างแผง
  useEffect(() => {
    const el = previewRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setPreviewScale(Math.max(0.25, Math.min(1, (el.clientWidth - 8) / 794))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [bundle]);

  const page = pages[cur];
  const slots = page ? LAYOUTS[page.layout].slots : 0;
  const patchPage = (p: Partial<PresentPage>) => { setPages((list) => list.map((x, i) => (i === cur ? { ...x, ...p } : x))); setDirty(true); };
  const addImage = (im: PresentImage) => {
    if (!page) return;
    if (page.images.some((x) => x.key === im.key)) { toast.info("รูปนี้อยู่ในหน้านี้แล้ว"); return; }
    if (page.images.length >= slots) { toast.warning(`รูปแบบนี้ใส่ได้ ${slots} รูป — เอารูปเดิมออกก่อน หรือเปลี่ยนรูปแบบจัดวาง`); return; }
    patchPage({ images: [...page.images, im] });
  };
  const removeImage = (key: string) => page && patchPage({ images: page.images.filter((x) => x.key !== key) });
  const moveImage = (key: string, dir: -1 | 1) => {
    if (!page) return;
    const i = page.images.findIndex((x) => x.key === key); const j = i + dir;
    if (i < 0 || j < 0 || j >= page.images.length) return;
    const arr = [...page.images]; [arr[i], arr[j]] = [arr[j], arr[i]];
    patchPage({ images: arr });
  };
  const addPage = () => { if (pages.length >= MAX_PAGES) return; setPages((l) => [...l, { layout: "grid4", images: [], bullets: [] }]); setCur(pages.length); setDirty(true); };
  const removePage = (i: number) => { if (pages.length <= 1) return; setPages((l) => l.filter((_, k) => k !== i)); setCur(0); setDirty(true); };

  const html = useMemo(() => {
    if (!bundle) return "";
    const pres: Presentation = { pages };
    return buildReportHtml({ paper_size: "A4", orientation: "portrait", ...DEFAULT_DS_PRESENT_TEMPLATE }, buildPresentData(pres, bundle.ctx));
  }, [bundle, pages]);

  const save = async (): Promise<boolean> => {
    if (!sheetId) return false;
    setSaving(true);
    try {
      const r = await apiFetch(`/api/design-sheets/${encodeURIComponent(sheetId)}/presentation`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages }) });
      const j = await r.json() as { error?: string | null };
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setDirty(false); toast.success("บันทึกใบนำเสนอแล้ว");
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); return false; }
    finally { setSaving(false); }
  };
  const printIt = async () => {
    if (!sheetId) return;
    if (canEdit && dirty && !(await save())) return;
    window.open(`/print/design-sheet-present/${encodeURIComponent(sheetId)}`, "_blank", "noopener");
  };
  const close = () => { if (dirty && !window.confirm("มีการแก้ใบนำเสนอที่ยังไม่บันทึก ต้องการปิดโดยไม่บันทึกหรือไม่?")) return; onClose(); };

  // รูปจากใบงาน จัดกลุ่มตามแหล่ง (แกลเลอรี / รายละเอียด / comment)
  const sheetGroups = useMemo(() => {
    const g: [string, PresentBundle["images"]][] = [];
    for (const im of bundle?.images ?? []) { const f = g.find(([l]) => l === im.source_label); if (f) f[1].push(im); else g.push([im.source_label, [im]]); }
    return g;
  }, [bundle]);
  const thumb = (im: PresentImage, selected: boolean, onClick: () => void) => (
    // eslint-disable-next-line @next/next/no-img-element
    <button key={im.key} type="button" onClick={onClick} title={selected ? "อยู่ในหน้านี้แล้ว" : "ใส่ลงหน้านี้"}
      className={`relative aspect-square overflow-hidden rounded-md border bg-white ${selected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-300"}`}>
      <img src={withImageWidth(im.url, 200) ?? im.url} alt="" loading="lazy" className="h-full w-full object-contain" />
      {selected && <span className="absolute right-1 top-1 rounded bg-blue-600 px-1 text-[10px] font-bold text-white">✓</span>}
    </button>
  );

  const footer = bundle && (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{dirty ? "มีการแก้ที่ยังไม่บันทึก" : "บันทึกแล้ว"} · {pages.length} หน้า</span>
      {canEdit && <button type="button" onClick={() => void save()} disabled={saving || !dirty} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-40">{saving ? "กำลังบันทึก…" : "💾 บันทึก"}</button>}
      <button type="button" onClick={() => void printIt()} disabled={saving} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50">🖨 พิมพ์ / PDF</button>
    </div>
  );

  return (
    <FloatingPanel open={open} onClose={close} title={bundle ? `ใบนำเสนอ A4 · ${bundle.sheet.code}` : "ใบนำเสนอ A4"} icon="📄" width={460} storageKey="ds-present" footer={footer}>
      {loading ? <div className="p-6 text-center text-sm text-slate-400">กำลังโหลด…</div>
        : error || !bundle || !page ? <div className="m-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error ?? "ไม่พบใบงาน"}</div>
        : (
          <div className="space-y-3 p-3">
            {/* หน้า */}
            <div className="flex items-center gap-1">
              {pages.map((p, i) => (
                <button key={i} type="button" onClick={() => { setCur(i); setPicker(null); }}
                  className={`h-8 rounded-md px-3 text-xs font-medium ${i === cur ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>หน้า {i + 1} <span className="opacity-60">{LAYOUTS[p.layout].icon}</span></button>
              ))}
              {canEdit && pages.length < MAX_PAGES && <button type="button" onClick={addPage} className="h-8 rounded-md border border-dashed border-slate-300 px-2.5 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600">＋ หน้า 2</button>}
              {canEdit && pages.length > 1 && <button type="button" onClick={() => removePage(cur)} title="ลบหน้านี้" className="ml-auto h-8 rounded-md px-2 text-xs text-rose-500 hover:bg-rose-50">🗑 ลบหน้า {cur + 1}</button>}
            </div>

            {/* รูปแบบจัดวาง */}
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-600">รูปแบบจัดวาง</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(LAYOUTS) as PresentLayout[]).map((k) => (
                  <button key={k} type="button" disabled={!canEdit} onClick={() => patchPage({ layout: k, images: page.images.slice(0, LAYOUTS[k].slots) })} title={LAYOUTS[k].hint}
                    className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center ${page.layout === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
                    <span className="text-xl leading-none">{LAYOUTS[k].icon}</span>
                    <span className="text-[10px] leading-tight">{LAYOUTS[k].label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* รูปที่เลือก */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">รูปในหน้านี้ <span className="font-normal text-slate-400">{page.images.length}/{slots}</span></span>
                {canEdit && (
                  <span className="flex gap-1">
                    <button type="button" onClick={() => setPicker(picker === "sheet" ? null : "sheet")} className={`h-7 rounded-md border px-2 text-[11px] font-medium ${picker === "sheet" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>🖼 จากใบงาน</button>
                    <button type="button" onClick={() => setPicker(picker === "canvas" ? null : "canvas")} className={`h-7 rounded-md border px-2 text-[11px] font-medium ${picker === "canvas" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600"}`}>🎨 จากกระดานแคมเปญ</button>
                  </span>
                )}
              </div>
              {page.images.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">ยังไม่มีรูป — กด "จากใบงาน" หรือ "จากกระดานแคมเปญ"</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {page.images.map((im, i) => (
                    <div key={im.key} className="relative h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={withImageWidth(im.url, 160) ?? im.url} alt="" className="h-full w-full object-contain" />
                      <span className="absolute left-0.5 top-0.5 rounded bg-slate-900/70 px-1 text-[9px] text-white">{i + 1}</span>
                      {canEdit && (
                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-white/85 px-0.5 text-[10px]">
                          <button type="button" onClick={() => moveImage(im.key, -1)} className="px-0.5 text-slate-500">◀</button>
                          <button type="button" onClick={() => removeImage(im.key)} className="px-0.5 text-rose-500">✕</button>
                          <button type="button" onClick={() => moveImage(im.key, 1)} className="px-0.5 text-slate-500">▶</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {picker === "sheet" && (
                <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                  {sheetGroups.length === 0 && <div className="text-center text-xs text-slate-400">ใบงานนี้ยังไม่มีรูป</div>}
                  {sheetGroups.map(([label, imgs]) => (
                    <div key={label}>
                      <div className="mb-1 text-[10px] font-medium text-slate-500">{label}</div>
                      <div className="grid grid-cols-4 gap-1.5">{imgs.map((im) => thumb({ key: im.key, url: im.url }, page.images.some((x) => x.key === im.key), () => addImage({ key: im.key, url: im.url })))}</div>
                    </div>
                  ))}
                </div>
              )}
              {picker === "canvas" && (
                <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">
                    <option value="">— เลือกแคมเปญ —</option>
                    {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.brand?.name ? ` · ${c.brand.name}` : ""}</option>)}
                  </select>
                  {campaignId && (canvasLoading ? <div className="text-center text-xs text-slate-400">กำลังอ่านรูปบนกระดาน…</div>
                    : canvasImgs.length === 0 ? <div className="text-center text-xs text-slate-400">กระดานนี้ไม่มีรูป (รูปที่เพิ่งแปะต้องรอให้กระดานบันทึกก่อน)</div>
                    : <div className="grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto">{canvasImgs.map((im) => thumb({ key: im.key, url: im.url }, page.images.some((x) => x.key === im.key), () => addImage({ key: im.key, url: im.url })))}</div>)}
                </div>
              )}
            </div>

            {/* ข้อความ */}
            <div className="space-y-1.5">
              <input value={page.heading ?? ""} onChange={(e) => patchPage({ heading: e.target.value })} disabled={!canEdit} placeholder={`หัวข้อ (ค่าเริ่มต้น: ${bundle.sheet.name})`}
                className="h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm" />
              <textarea value={(page.bullets ?? []).join("\n")} onChange={(e) => patchPage({ bullets: e.target.value.split("\n") })} disabled={!canEdit} rows={3} placeholder={"จุดขาย บรรทัดละ 1 ข้อ\nเช่น ผ้าแคนวาสหนา 12 oz"}
                className="w-full resize-none rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
              <textarea value={page.text ?? ""} onChange={(e) => patchPage({ text: e.target.value })} disabled={!canEdit} rows={2} placeholder="ข้อความอธิบายเพิ่มเติม (ไม่บังคับ)"
                className="w-full resize-none rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
              <label className={`flex items-center gap-2 text-xs ${bundle.ctx.offered_price ? "text-slate-700" : "text-slate-400"}`}>
                <input type="checkbox" checked={!!page.show_price} disabled={!canEdit || !bundle.ctx.offered_price} onChange={(e) => patchPage({ show_price: e.target.checked })} />
                โชว์ราคาเสนอ {bundle.ctx.offered_price ? <b>{bundle.ctx.offered_price} บาท</b> : "(ยังไม่มีรอบเสนอราคา)"} <span className="text-slate-400">· ต้นทุนไม่มีทางหลุดขึ้นใบ</span>
              </label>
            </div>

            {/* พรีวิว A4 */}
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-600">พรีวิว (เหมือนตอนพิมพ์)</div>
              <div ref={previewRef} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-1">
                <div style={{ width: 794 * previewScale, height: 1123 * previewScale * pages.length + 16 * (pages.length - 1) * previewScale }}>
                  <iframe title="preview" srcDoc={html} style={{ width: 794, height: 1123 * pages.length + 16 * (pages.length - 1) + 40, transform: `scale(${previewScale})`, transformOrigin: "top left", border: 0, background: "white", pointerEvents: "none" }} />
                </div>
              </div>
            </div>
          </div>
        )}
    </FloatingPanel>
  );
}
