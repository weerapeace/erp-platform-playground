"use client";
/**
 * 🖼 ตัวแก้ชุดโปร 1 ชุด — 1 เลือกรุ่น · 2 ปกโปร (อัปเอง / คลังรูป / กรอบโปรอัตโนมัติ) · 3 เลือกร้าน · 4 ตั้งเวลา
 *   ร่าง/รอเริ่ม = แก้ได้ทุกอย่าง · กำลังใช้ = แก้ได้แค่ชื่อ/เวลาจบ (จะเปลี่ยนรูป ต้องย้อนปกเดิมก่อน)
 *   ปุ่ม "ตรวจก่อน/หลัง แล้วยืนยัน" → ป๊อปยืนยัน (confirm-modal) — การส่งขึ้นร้านจริงเกิดตอนถึงเวลา หรือกด "ทำเดี๋ยวนี้" ในผลรายร้าน
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { ERPDateTime24 } from "@/components/form";
import { useToast } from "@/components/toast";
import { AssetPicker } from "@/components/asset-picker";
import { MarketingSkuPickerModal, type SkuPickerCatalog } from "@/components/marketing-sku-picker-modal";
import { apiFetch } from "@/lib/api";
import { META_NOTE, PLATFORM_LABEL, PLATFORM_NOTE, PROMO_PLATFORMS, REVIEW_PLATFORMS, type PromoPlatform } from "@/lib/promo-cover";
import { frameBatch, imgUrl, patchCampaign, previewCampaign, uploadPromoImage, type Full, type Item, type Preview } from "./api";
import { Pill, Thumb, isoToLocal, localToIso } from "./parts";

type Mode = "upload" | "library" | "frame";
type Draft = { name: string; note: string; starts: string; ends: string; auto_revert: boolean; early_hours: number; platforms: string[] };
const draftOf = (f: Full): Draft => ({
  name: f.campaign.name, note: f.campaign.note ?? "", starts: isoToLocal(f.campaign.starts_at), ends: isoToLocal(f.campaign.ends_at),
  auto_revert: f.campaign.auto_revert, early_hours: f.campaign.early_hours, platforms: f.campaign.platforms,
});
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
const section = "rounded-xl border border-slate-200 bg-white p-3 sm:p-4";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const btnSm = "inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function PromoEditor({ full, canEdit, onChanged, onAskConfirm }: {
  full: Full;
  canEdit: boolean;
  onChanged: (f: Full) => void;
  /** บันทึกแล้วเปิดป๊อปยืนยัน */
  onAskConfirm: (preview: Preview | null) => void;
}) {
  const toast = useToast();
  const c = full.campaign;
  const editable = canEdit && (c.status === "draft" || c.status === "scheduled") && !c.deleted_at;
  const timeEditable = canEdit && c.status !== "ended" && c.status !== "cancelled" && !c.deleted_at;
  const [draft, setDraft] = useState<Draft>(() => draftOf(full));
  const saved = useMemo(() => draftOf(full), [full]);
  useEffect(() => { setDraft(draftOf(full)); }, [full.campaign.id, full.campaign.updated_at]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !same(draft, saved);
  const [mode, setMode] = useState<Mode>(() => (c.frame_key ? "frame" : "upload"));
  const [busy, setBusy] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [libFor, setLibFor] = useState<Item | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pvLoading, setPvLoading] = useState(false);
  const fileFor = useRef<string | null>(null);
  const oneFile = useRef<HTMLInputElement>(null);
  const manyFiles = useRef<HTMLInputElement>(null);
  const frameFile = useRef<HTMLInputElement>(null);

  const apply = (f: Full & { back_to_draft?: boolean }) => {
    onChanged(f);
    if (f.back_to_draft) toast.warning("แก้ชุดที่ยืนยันแล้ว → กลับเป็นร่าง ต้องกดตรวจก่อน/หลัง แล้วยืนยันใหม่");
  };
  const patch = useCallback(async (body: Record<string, unknown>, label: string) => {
    setBusy(label);
    try { const f = await patchCampaign(c.id, body); apply(f); return f; }
    catch (e) { toast.error((e as Error).message); return null; }
    finally { setBusy(null); }
  }, [c.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // สรุปร้าน (อ่านอย่างเดียว) — โหลดใหม่เมื่อรุ่น/ร้านเปลี่ยน
  const pvKey = `${full.items.map((i) => i.parent_sku_id).join(",")}|${c.platforms.join(",")}`;
  useEffect(() => {
    if (!full.items.length || !c.platforms.length) { setPreview(null); return; }
    let alive = true;
    setPvLoading(true);
    previewCampaign(c.id).then((p) => { if (alive) setPreview(p); }).catch(() => { if (alive) setPreview(null); }).finally(() => { if (alive) setPvLoading(false); });
    return () => { alive = false; };
  }, [pvKey, c.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const saveDraft = async () => {
    const body: Record<string, unknown> = { name: draft.name, note: draft.note, ends_at: localToIso(draft.ends), auto_revert: draft.auto_revert };
    if (editable) Object.assign(body, { starts_at: localToIso(draft.starts), early_hours: draft.early_hours, platforms: draft.platforms });
    const f = await patch(body, "save");
    if (f) toast.success("บันทึกแล้ว");
    return f;
  };

  // ── รูป ──
  const setImage = (item: Item, key: string | null, source: Item["source"]) => patch({ set_items: [{ id: item.id, promo_key: key, source }] }, `img:${item.id}`);
  const onOneFile = async (file: File | undefined) => {
    const item = full.items.find((i) => i.id === fileFor.current);
    if (!file || !item) return;
    setBusy(`img:${item.id}`);
    try { const key = await uploadPromoImage(file); await setImage(item, key, "upload"); }
    catch (e) { toast.error((e as Error).message); setBusy(null); }
  };
  /** วางหลายไฟล์ — จับคู่รุ่นจากชื่อไฟล์ (ชื่อไฟล์มีรหัสรุ่น เช่น LM-2201.jpg) */
  const onManyFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const byLen = [...full.items].sort((a, b) => b.code.length - a.code.length);
    const pairs: { item: Item; file: File }[] = []; const miss: string[] = [];
    for (const f of [...files]) {
      const nm = f.name.toUpperCase().replace(/\.[A-Z0-9]+$/, "");
      const it = byLen.find((i) => i.code && nm.includes(i.code.toUpperCase()));
      if (it && !pairs.some((p) => p.item.id === it.id)) pairs.push({ item: it, file: f }); else miss.push(f.name);
    }
    if (!pairs.length) { toast.warning("ไม่มีไฟล์ไหนตรงรหัสรุ่นในชุดนี้ — ตั้งชื่อไฟล์ให้มีรหัสรุ่น เช่น LM-2201.jpg"); return; }
    setBusy("many");
    const sets: { id: string; promo_key: string; source: "upload" }[] = []; const errs: string[] = [];
    for (const p of pairs) { try { sets.push({ id: p.item.id, promo_key: await uploadPromoImage(p.file), source: "upload" }); } catch (e) { errs.push((e as Error).message); } }
    setBusy(null);
    if (sets.length) await patch({ set_items: sets }, "many");
    toast[errs.length || miss.length ? "warning" : "success"](`ใส่ปกโปรแล้ว ${sets.length} รุ่น${miss.length ? ` · ไม่ตรงรหัสรุ่น ${miss.length} ไฟล์ (${miss.slice(0, 3).join(", ")})` : ""}${errs.length ? ` · อัปไม่ผ่าน ${errs.length}` : ""}`);
  };
  const onFrameFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png") { toast.warning("กรอบโปรต้องเป็นไฟล์ PNG พื้นใส (ตรงกลางโปร่ง ให้เห็นสินค้า)"); return; }
    setBusy("frame-up");
    try {
      const key = await uploadPromoImage(file);
      const f = await patchCampaign(c.id, { frame_key: key, set_items: full.items.filter((i) => i.source === "frame").map((i) => ({ id: i.id, promo_key: null, source: "frame" })) });
      apply(f);
      toast.success("อัปกรอบแล้ว — กด \"แปะกรอบให้ทุกรุ่น\" เพื่อสร้างปกโปร");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  /** แปะกรอบ (ทีละ 8 รุ่น เรียกซ้ำจนครบ) · all = ทำใหม่ทุกรุ่น */
  const runFrame = async (all: boolean) => {
    if (!c.frame_key) { toast.warning("อัปรูปกรอบโปรก่อน"); return; }
    setBusy("frame");
    try {
      let f = full;
      if (all) f = await patchCampaign(c.id, { set_items: full.items.map((i) => ({ id: i.id, promo_key: null, source: "frame" })) });
      else {
        const noImg = full.items.filter((i) => !i.promo_key && i.source !== "frame");
        if (noImg.length) f = await patchCampaign(c.id, { set_items: noImg.map((i) => ({ id: i.id, promo_key: null, source: "frame" })) });
      }
      onChanged(f);
      let done = 0; const failed: string[] = [];
      for (let i = 0; i < 80; i++) {
        const r = await frameBatch(c.id);
        done += r.done; failed.push(...r.failed.map((x) => x.error));
        if (!r.left || (!r.done && r.failed.length)) break;
      }
      onChanged(await patchCampaign(c.id, {}));
      if (failed.length) toast.warning(`แปะกรอบแล้ว ${done} รุ่น · ไม่ผ่าน ${failed.length}: ${failed[0]}`);
      else toast.success(`แปะกรอบแล้ว ${done} รุ่น`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const reframeOne = async (item: Item) => {
    setBusy(`img:${item.id}`);
    try { await patchCampaign(c.id, { set_items: [{ id: item.id, promo_key: null, source: "frame" }] }); await frameBatch(c.id, [item.id]); onChanged(await patchCampaign(c.id, {})); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  // ── รุ่น ──
  const loadCatalog = useCallback(async (): Promise<SkuPickerCatalog> => {
    const j = await (await apiFetch("/api/parent-skus/spec-export?catalog=1")).json() as { data?: SkuPickerCatalog; error?: string };
    if (j.error || !j.data) throw new Error(j.error || "โหลดรายการสินค้าไม่สำเร็จ");
    return { ...j.data, takenIds: full.items.map((i) => i.parent_sku_id) };
  }, [full.items]);

  const pv = preview?.summary ?? [];
  const pvOf = (p: PromoPlatform) => pv.find((s) => s.platform === p) ?? null;
  const missing = full.items.filter((i) => !i.promo_key).length;
  const hasReview = draft.platforms.some((p) => REVIEW_PLATFORMS.has(p as PromoPlatform));

  return (
    <div className="space-y-3">
      {/* หัว: ชื่อชุด */}
      <div className={section}>
        <label className="text-[12px] text-slate-500">ชื่อชุดโปร</label>
        <input value={draft.name} disabled={!timeEditable} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น 12.12 ลดใหญ่"
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-50" />
        {c.status === "live" && <p className="mt-2 text-[12px] text-amber-700">กำลังใช้อยู่ — แก้ได้แค่ชื่อและเวลาจบ · จะเปลี่ยนรูป/รุ่น/ร้าน ให้กด &quot;ย้อนปกเดิมเดี๋ยวนี้&quot; ก่อน</p>}
      </div>

      {/* 1 เลือกรุ่น */}
      <div className={section}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">1 · เลือกรุ่น <span className="font-normal text-slate-500">({full.items.length} รุ่น)</span></p>
          {editable && <button type="button" className={btnSm} onClick={() => setPickOpen(true)}><Icon name="add" /> เลือกรุ่น</button>}
        </div>
        {full.items.length === 0 ? <p className="text-[13px] text-slate-500">ยังไม่ได้เลือกรุ่น — กด &quot;เลือกรุ่น&quot; แล้วติ๊กได้หลายรุ่นพร้อมกัน</p> : (
          <div className="flex flex-wrap gap-1.5">
            {full.items.map((i) => (
              <span key={i.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 py-0.5 pl-0.5 pr-2 text-[12px] text-slate-700">
                <Thumb src={imgUrl(i.cover_key, 80)} size={22} />
                <span className="truncate">{i.code}</span>
                {editable && <button type="button" aria-label={`เอา ${i.code} ออก`} className="text-slate-400 hover:text-rose-600" onClick={() => void patch({ remove_item_ids: [i.id] }, "rm")}><Icon name="cancel" size={12} /></button>}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2 ปกโปร */}
      <div className={section}>
        <p className="mb-2 text-sm font-medium text-slate-800">2 · ปกโปร {missing > 0 && full.items.length > 0 && <Pill tone="warn" className="ml-1">ยังไม่มีปก {missing} รุ่น</Pill>}</p>
        {editable && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([["upload", "อัปรูปเองรายรุ่น"], ["library", "เลือกจากคลังรูป"], ["frame", "กรอบโปรอัตโนมัติ"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMode(k)} className={`h-8 rounded-md border px-3 text-[12px] ${mode === k ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
        )}
        {editable && mode === "upload" && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
            <button type="button" className={btnSm} disabled={!!busy || !full.items.length} onClick={() => manyFiles.current?.click()}><Icon name="upload" /> วางหลายไฟล์พร้อมกัน</button>
            <span>ชื่อไฟล์ต้องมีรหัสรุ่น เช่น LM-2201.jpg ระบบจับคู่ให้ · หรือกดอัปทีละรุ่นด้านล่าง</span>
          </div>
        )}
        {editable && mode === "library" && <p className="mb-3 text-[12px] text-slate-500">กด &quot;คลังรูป&quot; ที่รุ่นนั้น แล้วเลือกรูปจากคลังรูปกลาง</p>}
        {editable && mode === "frame" && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2.5">
            <Thumb src={imgUrl(c.frame_key, 160)} label="ยังไม่มีกรอบ" size={64} />
            <div className="min-w-0 flex-1 text-[12px] text-slate-600">
              <p>อัปกรอบ/ป้ายโปรเป็น PNG พื้นใส (จัตุรัส ตรงกลางโปร่ง) 1 ไฟล์ ระบบจะแปะทับปกในระบบของทุกรุ่นให้</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={btnSm} disabled={!!busy} onClick={() => frameFile.current?.click()}><Icon name="upload" /> {c.frame_key ? "เปลี่ยนกรอบ" : "อัปกรอบ PNG"}</button>
                <button type="button" className={btnSm} disabled={!!busy || !c.frame_key || !full.items.length} onClick={() => void runFrame(false)}><Icon name="image" /> {busy === "frame" ? "กำลังแปะ…" : "แปะกรอบให้รุ่นที่ยังไม่มีปก"}</button>
                <button type="button" className={btnSm} disabled={!!busy || !c.frame_key || !full.items.length} onClick={() => void runFrame(true)}><Icon name="refresh" /> แปะใหม่ทุกรุ่น</button>
              </div>
            </div>
          </div>
        )}
        {full.items.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {full.items.map((i) => {
              const b = busy === `img:${i.id}`;
              return (
                <div key={i.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <Thumb src={imgUrl(i.cover_key, 160)} label="ไม่มีปกในระบบ" />
                  <Icon name="open" size={14} className="shrink-0 text-slate-400" />
                  <Thumb src={imgUrl(i.promo_key, 160)} label={b ? "กำลังทำ…" : "ยังไม่มีปกโปร"} accent={!!i.promo_key} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-800">{i.code}</p>
                    <p className="truncate text-[11px] text-slate-500">{i.name || "—"}{i.promo_key ? ` · ${i.source === "frame" ? "จากกรอบ" : i.source === "library" ? "จากคลัง" : "อัปเอง"}` : ""}</p>
                    {editable && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button type="button" className={btnSm} disabled={!!busy} onClick={() => { fileFor.current = i.id; oneFile.current?.click(); }}>อัป</button>
                        <button type="button" className={btnSm} disabled={!!busy} onClick={() => setLibFor(i)}>คลังรูป</button>
                        {c.frame_key && <button type="button" className={btnSm} disabled={!!busy || !i.cover_key} onClick={() => void reframeOne(i)}>กรอบ</button>}
                        {i.promo_key && <button type="button" aria-label="เอาปกโปรออก" className={`${btnSm} text-rose-600`} disabled={!!busy} onClick={() => void setImage(i, null, i.source)}><Icon name="delete" /></button>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3 เลือกร้าน */}
      <div className={section}>
        <p className="mb-2 text-sm font-medium text-slate-800">3 · เลือกร้าน {pvLoading && <span className="text-[12px] font-normal text-slate-400">กำลังเช็กร้าน…</span>}</p>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {PROMO_PLATFORMS.map((p) => {
            const s = pvOf(p);
            const on = draft.platforms.includes(p);
            return (
              <label key={p} className={`flex items-start gap-2 rounded-lg border p-2 ${on ? "border-sky-300 bg-sky-50/40" : "border-slate-200"}`}>
                <input type="checkbox" className="mt-1" checked={on} disabled={!editable} onChange={(e) => setDraft({ ...draft, platforms: e.target.checked ? [...draft.platforms, p] : draft.platforms.filter((x) => x !== p) })} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-800">{PLATFORM_LABEL[p]}
                    {on && s && <Pill tone={s.ready ? (s.blocked.length ? "warn" : "ok") : "bad"}>ส่งได้ {s.ready.toLocaleString()} รายการ</Pill>}
                    {REVIEW_PLATFORMS.has(p) && <Pill tone="warn">ต้องรอร้านตรวจ</Pill>}
                  </span>
                  <span className="block text-[11px] text-slate-500">{PLATFORM_NOTE[p]}</span>
                  {on && s && (s.unmatched > 0 || s.closed > 0) && <span className="block text-[11px] text-slate-500">{s.unmatched ? `ยังไม่จับคู่/ไม่อยู่บนร้าน ${s.unmatched} รุ่น` : ""}{s.unmatched && s.closed ? " · " : ""}{s.closed ? `ปิดขายอยู่ ${s.closed} รายการ (ไม่เปลี่ยน)` : ""}</span>}
                  {on && s?.blocked.map((x) => <span key={x} className="block text-[11px] text-rose-600">{x} — ไปที่ ร้าน/บัญชีแพลตฟอร์ม แล้วเชื่อมต่อ</span>)}
                </span>
              </label>
            );
          })}
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-200 p-2 opacity-80">
            <input type="checkbox" className="mt-1" disabled />
            <span className="text-[12px] text-slate-500"><span className="text-[13px] text-slate-700">FB/IG Shop</span> <Pill tone="muted">ตามเว็บ</Pill><br />{META_NOTE}</span>
          </div>
        </div>
      </div>

      {/* 4 ตั้งเวลา */}
      <div className={section}>
        <p className="mb-2 text-sm font-medium text-slate-800">4 · ตั้งเวลา</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] text-slate-500">เริ่มโปร (ว่าง = เริ่มทันทีที่ยืนยัน)</p>
            <ERPDateTime24 value={draft.starts} onChange={(v) => setDraft({ ...draft, starts: v })} defaultTime="00:00" disabled={!editable} />
          </div>
          <div>
            <p className="mb-1 text-[12px] text-slate-500">จบโปร</p>
            <ERPDateTime24 value={draft.ends} onChange={(v) => setDraft({ ...draft, ends: v })} defaultTime="00:00" disabled={!timeEditable} />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={draft.auto_revert} disabled={!timeEditable} onChange={(e) => setDraft({ ...draft, auto_revert: e.target.checked })} />
          จบโปรแล้ว ย้อนกลับเป็นปกเดิมอัตโนมัติ
        </label>
        {hasReview && (
          <label className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
            TikTok / Lazada ส่งล่วงหน้า
            <input type="number" min={0} max={168} step={1} value={draft.early_hours} disabled={!editable} onChange={(e) => setDraft({ ...draft, early_hours: Math.max(0, Math.min(168, Math.round(Number(e.target.value) || 0))) })} className="h-8 w-20 rounded-md border border-slate-300 px-2 text-sm" />
            ชั่วโมง <span className="text-[11px] text-slate-500">(ร้านตรวจเสร็จเร็ว ปกโปรอาจขึ้นก่อนเวลาเริ่ม)</span>
          </label>
        )}
        {timeEditable && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={!dirty || !!busy} onClick={() => void saveDraft()}><Icon name="save" /> {busy === "save" ? "กำลังบันทึก…" : "บันทึก"}</button>
            {editable && c.status === "draft" && (
              <button type="button" className={`${btn} border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100`} disabled={!!busy || !full.items.length}
                onClick={async () => { const f = dirty ? await saveDraft() : full; if (f) onAskConfirm(preview); }}>
                <Icon name="view" /> ตรวจก่อน/หลัง แล้วยืนยัน
              </button>
            )}
            {dirty && <span className="self-center text-[12px] text-amber-700">มีที่แก้ยังไม่บันทึก</span>}
          </div>
        )}
      </div>

      <input ref={oneFile} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void onOneFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={manyFiles} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void onManyFiles(e.target.files); e.target.value = ""; }} />
      <input ref={frameFile} type="file" accept="image/png" className="hidden" onChange={(e) => { void onFrameFile(e.target.files?.[0]); e.target.value = ""; }} />

      <MarketingSkuPickerModal open={pickOpen} onClose={() => setPickOpen(false)} title="เลือกรุ่นที่จะเปลี่ยนปกโปร"
        load={loadCatalog} takenIds={full.items.map((i) => i.parent_sku_id)}
        taken={{ badge: "อยู่ในชุดแล้ว", short: "อยู่แล้ว", hide: "ซ่อนที่อยู่ในชุดแล้ว", row: "✓ อยู่ในชุดแล้ว" }}
        confirmText={(n) => (n ? `เพิ่ม ${n} รุ่น` : "เลือกรุ่นก่อน")} busyText="กำลังเพิ่ม…"
        onConfirm={async (ids) => !!(await patch({ add_parent_ids: ids }, "add"))}
        tabPrefKey="promo_cover_pick_tab" colsPrefKey="promo-cover-pick" showFullPageLink={false} />
      <AssetPicker open={!!libFor} onClose={() => setLibFor(null)} title={libFor ? `เลือกปกโปรของ ${libFor.code}` : "เลือกรูป"} typeFilter="image" defaultSearch={libFor?.code}
        onSelect={(a) => { const it = libFor; setLibFor(null); if (it && a[0]?.r2_key) void setImage(it, a[0].r2_key, "library"); }} />
    </div>
  );
}
