"use client";

// ============================================================
// PublishModal — ตัวช่วยลงโพสต์ (เผยแพร่แบบ manual)
// โชว์ Parent SKU + คอนเทนต์ของงาน · ต่อแพลตฟอร์ม: รูป/แคปชั่น + ปุ่มไปโพสต์ + ช่องวางลิงก์หลังลง
// บันทึกลิงก์ที่ลง (erp_creative_content.posted_links) แล้วเปลี่ยนสถานะงานเป็นเผยแพร่
// ============================================================

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { r2ImageUrl } from "@/lib/r2-image";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { platformLabel } from "./use-options";
import type { FormField } from "@/app/api/admin/field-registry-v2/route";
import {
  listContent, getContent, listContentAttachments, updateContent, getPlatformSettings, savePlatformSettings, listSubtasks,
  getPublishConfig, savePublishConfig,
  type ContentDetail, type ContentAttachment, type PlatformSettings,
} from "./data";

const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

type Toast = { type: "success" | "error" | "info"; message: string };
type ParentRef = { id: string; code: string | null; name?: string | null };
type Row = { content: ContentDetail; images: ContentAttachment[] };
// ฟิลด์ที่ "คัดลอกไปลงโพสต์" ได้ (ตัด relation/รูป/ไฟล์ ออก)
const COPYABLE_TYPES = new Set(["text", "textarea", "longtext", "string", "number", "currency", "decimal", "int", "integer", "richtext", "html", "url", "email", "phone", "select", "date", "datetime"]);
// ป้ายสถานะงานย่อย (สำหรับรูปที่ส่งงาน)
const subBadge = (s: string) => s === "approved" ? { label: "✓", cls: "bg-emerald-500" }
  : s === "submitted" ? { label: "รอ", cls: "bg-amber-500" }
  : s === "revision_requested" ? { label: "แก้", cls: "bg-orange-500" }
  : { label: "ร่าง", cls: "bg-slate-400" };

export function PublishModal({ taskId, parents, parentFallback, onClose, onConfirm, pushToast }: {
  taskId: string;
  parents: ParentRef[];
  parentFallback?: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  pushToast: (type: Toast["type"], m: string) => void;
}) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [pset, setPset] = useState<PlatformSettings>({});
  const [posted, setPosted] = useState<Record<string, Record<string, string>>>({});   // contentId → {platform: url}
  const [saving, setSaving] = useState(false);
  const [openFull, setOpenFull] = useState<{ moduleKey: string; apiPath: string; id: string } | null>(null);   // เปิด drawer สินค้าเต็ม (Parent/SKU)
  const [parentFields, setParentFields] = useState<string[]>([]);   // คอลัมน์ Parent SKU ที่เลือกโชว์ (ว่าง=อัตโนมัติ)
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [taskImages, setTaskImages] = useState<{ key: string; status: string }[]>([]);   // รูปที่ส่งงาน (ทุกงานย่อย)
  const [taskLinks, setTaskLinks] = useState<{ label: string | null; url: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = (await listContent({ task_id: taskId })).filter((c) => !c.is_template);
      const details = await Promise.all(list.map((c) => getContent(c.id)));
      const imgs = await Promise.all(list.map((c) => listContentAttachments(c.id).catch(() => [] as ContentAttachment[])));
      setRows(details.map((d, i) => ({ content: d, images: imgs[i].filter((a) => a.kind === "image" && a.r2_key) })));
      setPosted(Object.fromEntries(details.map((d) => [d.id, { ...(d.posted_links ?? {}) }])));
      setPset(await getPlatformSettings().catch(() => ({})));
      setParentFields((await getPublishConfig().catch(() => ({} as { parent_fields?: string[] }))).parent_fields ?? []);
      // รูป/ลิงก์ที่ส่งงาน — ทุกงานย่อยที่ส่ง (รวมยังไม่อนุมัติ)
      try {
        const subs = await listSubtasks(taskId);
        const seen = new Set<string>(); const imgs: { key: string; status: string }[] = []; const lks: { label: string | null; url: string }[] = [];
        for (const s of subs) {
          for (const a of (s.attachments ?? [])) {
            if (a.kind === "image" && a.r2_key) { if (!seen.has(a.r2_key)) { seen.add(a.r2_key); imgs.push({ key: a.r2_key, status: s.status }); } }
            else if (a.kind !== "image" && a.url) lks.push({ label: a.label ?? s.title, url: a.url });
          }
          for (const arr of Object.values(s.image_sync_targets?.sku_images ?? {})) for (const k of (arr as string[])) { if (k && !seen.has(k)) { seen.add(k); imgs.push({ key: k, status: s.status }); } }
        }
        setTaskImages(imgs); setTaskLinks(lks);
      } catch { /* ว่าง */ }
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [taskId, pushToast]);
  useEffect(() => { load(); }, [load]);

  const setLink = (contentId: string, platform: string, url: string) =>
    setPosted((p) => ({ ...p, [contentId]: { ...(p[contentId] ?? {}), [platform]: url } }));
  // ลิงก์เปิดแพลตฟอร์ม = ค่ากลางต่อแพลตฟอร์ม (post_url ใน platform settings) — แก้ inline + บันทึก
  const setOpenLink = (platform: string, url: string) => setPset((p) => ({ ...p, [platform]: { ...(p[platform] ?? {}), post_url: url } }));
  const persistPset = (next: PlatformSettings) => { void savePlatformSettings(next).catch(() => {}); };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); pushToast("success", t(`คัดลอก ${label} แล้ว`, `Copied ${label}`)); }
    catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  const confirm = async () => {
    setSaving(true);
    try {
      for (const r of rows) await updateContent(r.content.id, { posted_links: posted[r.content.id] ?? {} });
      await onConfirm();
    } catch (e) { pushToast("error", (e as Error).message); setSaving(false); }
  };

  return (
    <>
    <ERPModal open onClose={onClose} size="xl" title={`🚀 ${t("เผยแพร่ — ตัวช่วยลงโพสต์", "Publish — posting helper")}`}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ปิด", "Close")}</button>
        <button onClick={confirm} disabled={saving || loading} className="h-9 px-5 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : `✓ ${t("ยืนยันเผยแพร่", "Confirm publish")}`}</button>
      </>}>
      {loading ? <div className="py-12 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div> : (
        <div className="space-y-4">
          {parents.length > 0 && (
            <div className="flex justify-end">
              <button onClick={() => setFieldPickerOpen(true)} className="text-xs text-violet-700 hover:underline">⚙️ {t("เลือกฟิลด์ที่โชว์", "Choose fields")}</button>
            </div>
          )}

          {/* รูป/ลิงก์ที่ส่งงาน (ทุกงานย่อย) — เอาไปลงโพสต์ */}
          {(taskImages.length > 0 || taskLinks.length > 0) && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500 mb-2">🖼️ {t("รูป/ลิงก์ที่ส่งงาน", "Submitted images / links")} <span className="font-normal text-slate-400">({taskImages.length} {t("รูป", "img")})</span></p>
              {taskImages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {taskImages.map((im) => { const bd = subBadge(im.status); return (
                    <a key={im.key} href={r2ImageUrl(im.key) ?? "#"} download target="_blank" rel="noreferrer" title={t("ดาวน์โหลด", "Download")} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r2ImageUrl(im.key, 240) ?? ""} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-200 hover:ring-2 hover:ring-violet-300" />
                      <span className={`absolute top-0.5 left-0.5 text-[8px] text-white px-1 py-px rounded ${bd.cls}`}>{bd.label}</span>
                    </a>
                  ); })}
                </div>
              )}
              {taskLinks.length > 0 && (
                <div className="mt-2 space-y-1">
                  {taskLinks.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noreferrer" className="block text-xs text-violet-700 hover:underline truncate">🔗 {l.label || l.url}</a>)}
                </div>
              )}
            </div>
          )}
          {/* Parent SKU — รายละเอียดเต็ม (คัดลอกไปลงโพสต์ได้) + SKU ลูก inline */}
          {parents.length ? parents.map((p) => (
            <ParentDetailPanel key={p.id} parentId={p.id} code={p.code} selectedCols={parentFields} onOpenFull={() => setOpenFull({ moduleKey: "parent-skus-v2", apiPath: "parent-skus", id: p.id })} onOpenSku={(id) => setOpenFull({ moduleKey: "skus-v2", apiPath: "skus", id })} onCopy={copy} />
          )) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">Parent SKU</p>
              {parentFallback ? <span className="inline-flex items-center text-sm font-medium bg-white border border-slate-200 rounded-lg px-2.5 py-1">{parentFallback}</span> : <p className="text-sm text-slate-400">{t("— ไม่มี Parent SKU", "— none")}</p>}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-slate-400 italic">{t("งานนี้ยังไม่มีคอนเทนต์ — กดยืนยันเพื่อเปลี่ยนสถานะอย่างเดียว", "No content yet — confirm just changes the status")}</p>
          ) : rows.map((r) => {
            const c = r.content; const platforms = c.platforms ?? [];
            return (
              <div key={c.id} className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="bg-slate-50/80 px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{c.title}</span>
                  <span className="font-mono text-[11px] text-slate-400">{c.content_no}</span>
                </div>
                {/* รูปที่จะโพสต์ */}
                {r.images.length > 0 && (
                  <div className="px-3 pt-3">
                    <p className="text-[11px] text-slate-400 mb-1">{t("รูปที่จะโพสต์", "Images to post")}</p>
                    <div className="flex gap-2 flex-wrap">
                      {r.images.map((im) => (
                        <a key={im.id} href={r2ImageUrl(im.r2_key!) ?? "#"} download target="_blank" rel="noreferrer" title={t("ดาวน์โหลด", "Download")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={r2ImageUrl(im.r2_key!, 200) ?? ""} alt="" className="h-16 w-16 object-cover rounded-lg border border-slate-200 hover:ring-2 hover:ring-violet-300" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {/* ต่อแพลตฟอร์ม */}
                <div className="p-3 space-y-2">
                  {platforms.length === 0 ? <p className="text-xs text-slate-400 italic">{t("ยังไม่ได้เลือกแพลตฟอร์ม", "No platforms")}</p> : platforms.map((pf) => {
                    const cap = c.captions.find((x) => x.platform === pf);
                    const text = [cap?.caption, cap?.hashtags].filter(Boolean).join("\n\n");
                    const goUrl = (pset[pf]?.post_url ?? "").trim();
                    const prodUrl = (c.product_links ?? []).find((l) => l.platform === pf)?.url ?? "";
                    const doneUrl = posted[c.id]?.[pf] ?? "";
                    return (
                      <div key={pf} className={`rounded-lg border p-2.5 ${doneUrl ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                        <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                          <span className="text-sm font-medium text-slate-700">{doneUrl ? "✅ " : ""}{platformLabel(pf)}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {text && <button onClick={() => copy(text, platformLabel(pf))} className="text-xs text-violet-700 hover:underline">📋 {t("คัดลอกแคปชั่น", "Copy caption")}</button>}
                            {goUrl && <a href={goUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-white bg-violet-600 rounded-md px-2 py-1 hover:bg-violet-700">↗ {t("เปิด", "Open")} {platformLabel(pf)}</a>}
                            {prodUrl && <a href={prodUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-700 hover:underline">🔗 {t("ลิงก์สินค้า", "Product link")}</a>}
                          </div>
                        </div>
                        {text && <pre className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded p-2 whitespace-pre-wrap font-sans max-h-24 overflow-y-auto mb-1.5">{text}</pre>}
                        {/* ลิงก์เปิดแพลตฟอร์ม (ค่ากลาง ตั้ง/แก้ได้ตรงนี้) */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] text-slate-400 shrink-0 w-20">{t("ลิงก์เปิด", "Open link")}</span>
                          <ERPInput value={pset[pf]?.post_url ?? ""} onChange={(e) => setOpenLink(pf, e.target.value)} onBlur={() => persistPset(pset)} placeholder={t("ลิงก์เปิด Shopee/Lazada… (ค่ากลาง)", "Shopee/Lazada link… (shared)")} />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-400 shrink-0 w-20">{t("ลิงก์หลังลง", "Posted link")}</span>
                          <ERPInput value={doneUrl} onChange={(e) => setLink(c.id, pf, e.target.value)} placeholder="https://..." />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">{t("ลงบางแพลตฟอร์มก่อนก็ได้ — กดยืนยันจะบันทึกลิงก์ที่ลงแล้ว + เปลี่ยนสถานะงานเป็นเผยแพร่", "Partial posting is fine — Confirm saves posted links and marks the task published")}</p>
        </div>
      )}
    </ERPModal>
    {openFull && <MasterRecordDrawer moduleKey={openFull.moduleKey} apiPath={openFull.apiPath} recordId={openFull.id} onClose={() => setOpenFull(null)} onChanged={() => {}} />}
    {fieldPickerOpen && <FieldPickerModal selected={parentFields} onClose={() => setFieldPickerOpen(false)} onSaved={(cols) => { setParentFields(cols); setFieldPickerOpen(false); }} pushToast={pushToast} />}
    </>
  );
}

// เลือกคอลัมน์ Parent SKU ที่จะโชว์ใน popup เผยแพร่ (ของกลาง · ว่าง = อัตโนมัติ)
function FieldPickerModal({ selected, onClose, onSaved, pushToast }: { selected: string[]; onClose: () => void; onSaved: (cols: string[]) => void; pushToast: (type: Toast["type"], m: string) => void }) {
  const t = useT();
  const [regs, setRegs] = useState<FormField[]>([]);
  const [picked, setPicked] = useState<string[]>(selected);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch(`/api/admin/field-registry-v2?module=parent-skus-v2`).then((r) => r.json())
      .then((j) => setRegs(((j.fields as FormField[]) ?? []).filter((f) => f.column_name && f.is_visible !== false && !f.is_sensitive && COPYABLE_TYPES.has(f.ui_field_type) && !/(^id$|_id$|_r2_key$|created_at|updated_at)/.test(f.column_name)).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))))
      .catch(() => {});
  }, []);
  const toggle = (col: string) => setPicked((p) => p.includes(col) ? p.filter((x) => x !== col) : [...p, col]);
  const save = async () => { setSaving(true); try { await savePublishConfig({ parent_fields: picked }); pushToast("success", t("บันทึกแล้ว", "Saved")); onSaved(picked); } catch (e) { pushToast("error", (e as Error).message); setSaving(false); } };
  return (
    <ERPModal open onClose={onClose} size="lg" title={t("⚙️ เลือกฟิลด์ Parent SKU ที่จะโชว์", "⚙️ Choose Parent SKU fields to show")}
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>
        <button onClick={save} disabled={saving} className="h-9 px-5 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
      </>}>
      <p className="text-xs text-slate-400 mb-2">{t("ติ๊กฟิลด์ที่อยากให้โชว์ในตัวช่วยเผยแพร่ · ไม่ติ๊กเลย = โชว์อัตโนมัติทุกฟิลด์ข้อความที่มีค่า", "Check fields to show in the publish helper · none checked = auto-show all text fields with a value")}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 max-h-[55vh] overflow-y-auto">
        {regs.map((f) => (
          <label key={f.column_name} className="inline-flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
            <input type="checkbox" checked={picked.includes(f.column_name!)} onChange={() => toggle(f.column_name!)} className="h-4 w-4 rounded border-slate-300 text-violet-600" />
            <span className="truncate">{f.field_label || f.column_name}</span>
          </label>
        ))}
      </div>
    </ERPModal>
  );
}

type ChildSku = { id: string; code: string; name: string; color: string | null; price: number | null; img: string | null };

// พาเนลรายละเอียด Parent SKU (ฝังใน popup เผยแพร่) — เลือกฟิลด์ที่โชว์ + คัดลอกทุกช่อง + SKU ลูก inline + เปิด drawer เต็ม
function ParentDetailPanel({ parentId, code, selectedCols, onOpenFull, onOpenSku, onCopy }: { parentId: string; code: string | null; selectedCols: string[]; onOpenFull: () => void; onOpenSku: (id: string) => void; onCopy: (text: string, label: string) => void }) {
  const t = useT();
  const [fields, setFields] = useState<{ label: string; value: string }[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [skus, setSkus] = useState<ChildSku[]>([]);
  const [showSkus, setShowSkus] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [regJ, recJ, skuJ] = await Promise.all([
          apiFetch(`/api/admin/field-registry-v2?module=parent-skus-v2`).then((r) => r.json()),
          apiFetch(`/api/master-v2/parent-skus/${parentId}`).then((r) => r.json()),
          apiFetch(`/api/pickers/skus?parent_sku_id=${encodeURIComponent(parentId)}&limit=100`).then((r) => r.json()).catch(() => ({ data: [] })),
        ]);
        const regs = ((regJ.fields as FormField[]) ?? []).slice().sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const rec = (recJ.data as Record<string, unknown>) ?? {};
        // map คอลัมน์→{label,value} เฉพาะฟิลด์ข้อความที่มีค่า (เรียงตามทะเบียน)
        const byCol = new Map<string, { label: string; value: string }>();
        for (const f of regs) {
          const col = f.column_name;
          if (!col || f.is_visible === false || f.is_sensitive) continue;
          if (!COPYABLE_TYPES.has(f.ui_field_type)) continue;
          if (/(^id$|_id$|_r2_key$|created_at|updated_at)/.test(col)) continue;
          const v = rec[col];
          if (v == null || typeof v === "object") continue;
          let s = String(v); if (!s.trim()) continue;
          if (f.ui_field_type === "richtext" || f.ui_field_type === "html") s = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (s) byCol.set(col, { label: f.field_label || col, value: s });
        }
        // เลือกฟิลด์ที่ตั้งไว้ (ตามลำดับที่เลือก) ไม่งั้นโชว์ทุกฟิลด์ที่มีค่า
        const out = selectedCols.length ? selectedCols.map((c) => byCol.get(c)).filter(Boolean) as { label: string; value: string }[] : [...byCol.values()];
        const childRows = ((skuJ.data ?? []) as Record<string, unknown>[]).map((s) => ({
          id: String(s.id), code: String(s.code ?? ""), name: String(s.name_th ?? s.name ?? ""),
          color: (s.color_th as string) ?? (s.color as string) ?? null, price: (s.list_price as number) ?? null,
          img: (s.image_key as string) ?? (s.cover_image_r2_key as string) ?? null,
        }));
        if (live) { setFields(out); setCover((rec.cover_image_r2_key as string) ?? null); setSkus(childRows); }
      } catch { /* noop */ }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; };
  }, [parentId, selectedCols]);
  const copyAll = () => onCopy(fields.map((f) => `${f.label}: ${f.value}`).join("\n"), code || "Parent SKU");
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className="text-sm font-semibold text-slate-700">📦 {code || parentId}</span>
        <div className="flex items-center gap-3">
          <button onClick={copyAll} className="text-xs font-medium text-violet-700 hover:underline">📋 {t("คัดลอกทั้งหมด", "Copy all")}</button>
          <button onClick={onOpenFull} className="text-xs text-violet-700 hover:underline">↗ {t("เปิดสินค้าเต็ม", "Open full")}</button>
        </div>
      </div>
      {cover && <a href={r2ImageUrl(cover) ?? "#"} download target="_blank" rel="noreferrer" title={t("ดาวน์โหลดรูปปก", "Download cover")}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={r2ImageUrl(cover, 200) ?? ""} alt="" className="h-20 w-20 object-cover rounded-lg border border-slate-200 mb-2" /></a>}
      {loading ? <p className="text-xs text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
        : fields.length === 0 ? <p className="text-xs text-slate-400">{t("— ไม่มีรายละเอียด (กด ⚙️ เลือกฟิลด์)", "— no details (use ⚙️ Choose fields)")}</p> : (
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[11px] text-slate-400 w-28 shrink-0 pt-0.5">{f.label}</span>
              <span className="text-xs text-slate-700 flex-1 whitespace-pre-wrap break-words min-w-0">{f.value}</span>
              <button onClick={() => onCopy(f.value, f.label)} title={t("คัดลอก", "Copy")} className="text-slate-400 hover:text-violet-600 text-xs shrink-0">📋</button>
            </div>
          ))}
        </div>
      )}
      {/* SKU ลูก (สี/ตัวเลือก) inline */}
      {skus.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-200">
          <button onClick={() => setShowSkus((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-violet-700 inline-flex items-center gap-1">
            <span className="text-[9px]">{showSkus ? "▼" : "▶"}</span>SKU {t("ลูก", "variants")} ({skus.length})
          </button>
          {showSkus && (
            <div className="mt-1.5 space-y-1 max-h-56 overflow-y-auto">
              {skus.map((s) => (
                <div key={s.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-lg p-1.5">
                  {s.img
                    ? <img src={r2ImageUrl(s.img, 80) ?? ""} alt="" className="h-9 w-9 object-cover rounded border border-slate-200 shrink-0" />
                    : <span className="h-9 w-9 rounded bg-slate-50 border border-slate-100 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="text-xs font-mono text-slate-700 truncate">{s.code}</span>{s.color && <span className="text-[11px] text-slate-500 truncate">· {s.color}</span>}</div>
                    {s.price != null && <div className="text-[11px] text-emerald-700">{Number(s.price).toLocaleString("th-TH")} ฿</div>}
                  </div>
                  <button onClick={() => onCopy(s.code, s.code)} title={t("คัดลอกรหัส", "Copy code")} className="text-slate-400 hover:text-violet-600 text-xs shrink-0">📋</button>
                  <button onClick={() => onOpenSku(s.id)} title={t("เปิด SKU", "Open SKU")} className="text-violet-600 hover:text-violet-800 text-xs shrink-0">↗</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
