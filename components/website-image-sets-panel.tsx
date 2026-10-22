"use client";

/**
 * 🖼 แท็บชุดรูปกลาง (ERP › เว็บไซต์ › ร้าน › 🖼 ชุดรูป) — เปลี่ยนรูปครั้งเดียว ทุกที่ที่ผูกชุดนี้เปลี่ยนตาม (คอม + มือถือ)
 * ผูก: ช่องรูปทุกช่องในแท็บหน้าแรก / หน้าเว็บ / ดีไซน์ (ของกลาง ImageUploadField) มีปุ่ม "🔗 ใช้ชุดรูป"
 * ที่นี่: ตั้งรูปคอม/มือถือ · จุดสำคัญของรูป (ครอปทุกที่ไม่ให้หน้าโดนตัด) · ลิงก์ของชุด · ⏰ ตั้งเวลาเปลี่ยน · ย้อนรูปก่อนหน้า · ดูว่าใช้ที่ไหนบ้าง
 * แก้แล้วขึ้นเว็บจริงทันที (ไม่ต้องเผยแพร่) — API /api/website/image-sets · กฎ lib/website-image-sets.ts
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";
import { ImageSetsContext, notifyImageSetsChanged } from "@/components/website-image-sets-context";
import { LinkTargetPicker } from "@/components/website-link-picker";
import { effectiveVersion, type ImageSet, type ImageSetUse, type ImageSetVersion } from "@/lib/website-image-sets";

type SetRow = ImageSet & { updatedAt?: string | null; updatedBy?: string | null };

const card = "rounded-xl border border-slate-200 bg-white p-4";
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-500 disabled:opacity-50";
const fmt = (iso: string) => new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
/** "YYYY-MM-DDTHH:mm" ของ input datetime-local (เวลาเครื่อง) → ISO */
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

/** จุดสำคัญของรูป: คลิก/ลากบนรูป = ตั้งจุด · ใต้รูปเห็นตัวอย่างครอป 3 แบบ (กว้าง · สี่เหลี่ยม · แนวตั้ง) */
function FocalPicker({ imageKey, x, y, onChange, label }: { imageKey: string | null; x: number; y: number; onChange: (x: number, y: number) => void; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const url = keyUrl(imageKey, 900);
  if (!url) return null;
  const at = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))), y: Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))) };
  };
  const cur = drag ?? { x, y };
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-slate-500">📍 จุดสำคัญ — {label} (คลิก/ลากไปที่หน้าคนหรือสินค้า)</p>
      <div
        ref={boxRef}
        className="relative inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded-lg border border-slate-200"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const p = at(e);
          if (p) setDrag(p);
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = at(e);
          if (p) setDrag(p);
        }}
        onPointerUp={() => {
          if (drag) onChange(drag.x, drag.y);
          setDrag(null);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" draggable={false} className="block max-h-56 w-auto max-w-full" />
        <span className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-pink-500/70 shadow" style={{ left: `${cur.x}%`, top: `${cur.y}%` }} />
      </div>
      <div className="flex items-end gap-2">
        {[
          { r: "21 / 9", w: 126, l: "แบนเนอร์กว้าง" },
          { r: "1 / 1", w: 54, l: "สี่เหลี่ยม" },
          { r: "4 / 5", w: 48, l: "แนวตั้ง" },
        ].map((f) => (
          <div key={f.l} className="text-center">
            <div className="overflow-hidden rounded border border-slate-200 bg-slate-100" style={{ width: f.w, aspectRatio: f.r }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${cur.x}% ${cur.y}%` }} />
            </div>
            <span className="text-[10px] text-slate-400">{f.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** รูปคอม + มือถือ ของรุ่นหนึ่ง (ไม่มีปุ่มชุดรูปซ้อนในนี้) */
function VersionImages({ v, onChange }: { v: ImageSetVersion; onChange: (p: Partial<ImageSetVersion>) => void }) {
  return (
    <ImageSetsContext.Provider value={null}>
      <div className="grid gap-3 sm:grid-cols-2">
        <ImageUploadField label="🖥 รูปคอม" hint="แนวนอน · กว้างอย่างน้อย 1600px" value={v.desk} onChange={(k) => onChange({ desk: k, fx: 50, fy: 50 })} height={90} />
        <ImageUploadField label="📱 รูปมือถือ" hint="ไม่ใส่ = ใช้รูปคอม" value={v.mob} onChange={(k) => onChange({ mob: k, mfx: 50, mfy: 50 })} height={90} />
      </div>
    </ImageSetsContext.Provider>
  );
}

export function WebsiteImageSetsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [uses, setUses] = useState<ImageSetUse[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [cats, setCats] = useState<{ key: string; label: string; parent?: string | null }[]>([]);
  const [draft, setDraft] = useState<{ at: string; until: string; v: ImageSetVersion } | null>(null);

  const load = useCallback(() => {
    apiFetch(`/api/website/image-sets?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j: { sets?: SetRow[]; uses?: ImageSetUse[]; error?: string }) => {
        if (j.error) throw new Error(j.error);
        setSets(j.sets ?? []);
        setUses(j.uses ?? []);
        setSelId((cur) => cur ?? j.sets?.[0]?.id ?? null);
      })
      .catch((e: Error) => {
        setSets([]);
        toast.error(e.message || "โหลดชุดรูปไม่สำเร็จ");
      });
  }, [shopSlug, toast]);
  useEffect(load, [load]);
  // หมวดสินค้าของร้าน (ตัวเลือกลิงก์ "ไปหน้าหมวด")
  useEffect(() => {
    fetch(`/api/public/storefront/site?shop=${encodeURIComponent(shopSlug)}`)
      .then((r) => r.json())
      .then((j: { categories?: { key: string; label: string; parent?: string | null }[] }) => setCats(j.categories ?? []))
      .catch(() => {});
  }, [shopSlug]);
  const linkCtx = useMemo(() => ({ shopSlug, shopId, categories: cats }), [shopSlug, shopId, cats]);

  const sel = sets?.find((s) => s.id === selId) ?? null;
  const usesOf = (id: string) => uses.filter((u) => u.setId === id);

  const patch = async (body: Record<string, unknown>, ok = "บันทึกแล้ว — ขึ้นเว็บจริงทันที") => {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/image-sets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, id: sel.id, ...body }) });
      const j = (await r.json()) as { set?: SetRow; error?: string };
      if (!r.ok || !j.set) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      setSets((cur) => (cur ?? []).map((s) => (s.id === j.set!.id ? { ...s, ...j.set! } : s)));
      notifyImageSetsChanged();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const setCur = (p: Partial<ImageSetVersion>) => sel && void patch({ action: "update", cur: { ...sel.cur, ...p } });

  const create = async () => {
    const name = newName.trim();
    if (!name) return toast.error("ตั้งชื่อชุดก่อน เช่น New Arrival");
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/image-sets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: shopSlug, name }) });
      const j = (await r.json()) as { set?: SetRow; error?: string };
      if (!r.ok || !j.set) throw new Error(j.error || "สร้างไม่สำเร็จ");
      setSets((cur) => [...(cur ?? []), j.set!].sort((a, b) => a.name.localeCompare(b.name, "th")));
      setSelId(j.set.id);
      setNewName("");
      notifyImageSetsChanged();
      toast.success(`สร้างชุด “${name}” แล้ว — ใส่รูปได้เลย`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!sel || !window.confirm(`ลบชุดรูป “${sel.name}”?`)) return;
    const r = await apiFetch(`/api/website/image-sets?shop=${encodeURIComponent(shopSlug)}&id=${sel.id}`, { method: "DELETE" });
    const j = (await r.json()) as { error?: string; uses?: ImageSetUse[] };
    if (!r.ok) return toast.error(j.uses?.length ? `${j.error} (${j.uses.map((u) => u.where).join(" · ")})` : j.error || "ลบไม่สำเร็จ");
    setSets((cur) => (cur ?? []).filter((s) => s.id !== sel.id));
    setSelId(null);
    notifyImageSetsChanged();
    toast.success("ลบชุดรูปแล้ว");
  };

  if (!sets) return <p className="py-10 text-center text-sm text-slate-400">กำลังโหลดชุดรูป…</p>;
  const now = effectiveVersion(sel ?? { cur: { desk: null, mob: null, fx: 50, fy: 50, mfx: 50, mfy: 50 }, queue: [] });
  const onSchedule = sel ? sel.queue.find((q) => Date.parse(q.at) <= Date.now() && (!q.until || Date.parse(q.until) > Date.now())) : null;

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-base font-semibold text-slate-800">🖼 ชุดรูปกลาง</h2>
        <p className="mt-1 text-xs text-slate-500">
          เปลี่ยนรูปครั้งเดียว ทุกที่ที่ผูกชุดนี้เปลี่ยนตาม (คอม + มือถือ) — ผูกได้ที่ช่องรูปทุกช่องในแท็บ 🧱 หน้าแรก / 📄 หน้าเว็บ / 🎨 ดีไซน์ (กด <b>🔗 ใช้ชุดรูป</b> ใต้ชื่อช่อง) · แก้รูปที่นี่แล้วขึ้นเว็บจริงทันที ไม่ต้องกดเผยแพร่
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* รายชื่อชุด */}
        <div className={`${card} space-y-2 self-start`}>
          {sets.length === 0 && <p className="text-xs text-slate-500">ยังไม่มีชุดรูป — ตั้งชื่อด้านล่างแล้วกดสร้าง</p>}
          {sets.map((s) => {
            const t = keyUrl(effectiveVersion(s).desk ?? effectiveVersion(s).mob, 160);
            const n = new Set(usesOf(s.id).map((u) => u.where)).size;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelId(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg border p-1.5 text-left ${s.id === selId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-400"}`}
              >
                <span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t ? <img src={t} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-slate-400">ยังไม่มีรูป</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{s.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {n ? `ใช้ ${n} ที่` : "ยังไม่ได้ผูก"}
                    {s.queue.length ? ` · ⏰ ${s.queue.length}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} maxLength={60} placeholder="ชื่อชุดใหม่ เช่น New Arrival" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
            <button type="button" onClick={() => void create()} disabled={busy} className={btn}>
              ＋ สร้าง
            </button>
          </div>
        </div>

        {/* ชุดที่เลือก */}
        {!sel ? (
          <div className={`${card} text-sm text-slate-400`}>เลือกชุดทางซ้าย หรือสร้างชุดใหม่</div>
        ) : (
          <div className="space-y-4">
            <div className={`${card} space-y-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  key={sel.id}
                  defaultValue={sel.name}
                  maxLength={60}
                  onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== sel.name && void patch({ action: "update", name: e.target.value.trim() }, "เปลี่ยนชื่อแล้ว")}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold"
                />
                <button type="button" onClick={() => void patch({ action: "undo" }, "ย้อนกลับเป็นรูปก่อนหน้าแล้ว")} disabled={busy || !sel.history.length} className={btn} title="กลับไปใช้รูปก่อนหน้า">
                  ↩ ย้อนรูปก่อนหน้า
                </button>
                <button type="button" onClick={() => void remove()} className={`${btn} border-red-200 text-red-600 hover:border-red-400`}>
                  ลบชุด
                </button>
              </div>
              {onSchedule && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">⏰ ตอนนี้เว็บกำลังใช้รูปที่ตั้งเวลาไว้ (ถึง {onSchedule.until ? fmt(onSchedule.until) : "—"}) — หมดเวลาแล้วกลับเป็นรูปด้านล่าง</p>}
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-700">รูปตอนนี้</p>
                <VersionImages v={sel.cur} onChange={setCur} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FocalPicker imageKey={sel.cur.desk} x={sel.cur.fx} y={sel.cur.fy} label="รูปคอม" onChange={(fx, fy) => setCur({ fx, fy })} />
                <FocalPicker imageKey={sel.cur.mob} x={sel.cur.mfx} y={sel.cur.mfy} label="รูปมือถือ" onChange={(mfx, mfy) => setCur({ mfx, mfy })} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">🔗 ลิงก์ของชุด (ว่าง = แต่ละที่ใช้ลิงก์ของตัวเอง)</p>
                  <LinkTargetPicker value={sel.link} onChange={(href) => void patch({ action: "update", link: href }, href ? "ตั้งลิงก์แล้ว — ทุกที่ที่ผูกจะลิงก์ไปที่นี่" : "เอาลิงก์ของชุดออกแล้ว")} ctx={linkCtx} size="sm" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">คำอธิบายรูป (alt · ช่วย SEO)</p>
                  <input
                    key={`alt-${sel.id}`}
                    defaultValue={sel.alt}
                    maxLength={160}
                    placeholder="เช่น กระเป๋าคอลเลกชันใหม่"
                    onBlur={(e) => e.target.value.trim() !== sel.alt && void patch({ action: "update", alt: e.target.value.trim() })}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                  />
                </div>
              </div>
              {sel.history.length > 0 && (
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-500">🕘 รูปก่อนหน้า (ล่าสุดอยู่ซ้าย · กด ↩ ย้อนได้)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {sel.history.map((h, i) => {
                      const t = keyUrl(h.desk ?? h.mob, 120);
                      return (
                        <span key={i} title={fmt(h.at)} className="flex h-9 w-14 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {t && <img src={t} alt="" className="h-full w-full object-cover" />}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ⏰ ตั้งเวลาเปลี่ยน */}
            <div className={`${card} space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">⏰ ตั้งเวลาเปลี่ยนรูป</p>
                {!draft && (
                  <button type="button" onClick={() => setDraft({ at: "", until: "", v: { desk: null, mob: null, fx: 50, fy: 50, mfx: 50, mfy: 50 } })} className={btn}>
                    ＋ ตั้งเวลา
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">อัปรูปชุดถัดไปไว้ก่อน ถึงเวลาทุกที่เปลี่ยนเอง (ภายใน ~1 นาที) · ใส่ &quot;กลับรูปเดิมเมื่อ&quot; = ใช้ชั่วคราว เช่น ช่วง Sale</p>
              {sel.queue.length === 0 && !draft && <p className="text-xs text-slate-400">ยังไม่ได้ตั้งเวลา</p>}
              {sel.queue.map((q) => {
                const t = keyUrl(q.desk ?? q.mob, 160);
                return (
                  <div key={q.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                    <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {t && <img src={t} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1 text-xs text-slate-700">
                      เริ่ม {fmt(q.at)}
                      {q.until ? ` → กลับรูปเดิม ${fmt(q.until)}` : " (ใช้ต่อไปเลย)"}
                      {q.mob ? " · มีรูปมือถือ" : ""}
                    </span>
                    <button type="button" onClick={() => void patch({ action: "schedule-remove", entryId: q.id }, "ยกเลิกเวลานี้แล้ว")} className="text-[11px] text-red-600 hover:underline">
                      ยกเลิก
                    </button>
                  </div>
                );
              })}
              {draft && (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[11px] text-slate-600">
                      เริ่มใช้เมื่อ (เวลาไทย)
                      <input type="datetime-local" value={draft.at} onChange={(e) => setDraft({ ...draft, at: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                    </label>
                    <label className="text-[11px] text-slate-600">
                      กลับรูปเดิมเมื่อ (ไม่ใส่ = ใช้ต่อไปเลย)
                      <input type="datetime-local" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                    </label>
                  </div>
                  <VersionImages v={draft.v} onChange={(p) => setDraft({ ...draft, v: { ...draft.v, ...p } })} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FocalPicker imageKey={draft.v.desk} x={draft.v.fx} y={draft.v.fy} label="รูปคอม" onChange={(fx, fy) => setDraft({ ...draft, v: { ...draft.v, fx, fy } })} />
                    <FocalPicker imageKey={draft.v.mob} x={draft.v.mfx} y={draft.v.mfy} label="รูปมือถือ" onChange={(mfx, mfy) => setDraft({ ...draft, v: { ...draft.v, mfx, mfy } })} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (!draft.at) return toast.error("เลือกวันเวลาที่เริ่มใช้ก่อน");
                        if (!draft.v.desk && !draft.v.mob) return toast.error("ใส่รูปอย่างน้อย 1 รูป");
                        if (draft.until && Date.parse(toIso(draft.until)) <= Date.parse(toIso(draft.at))) return toast.error("เวลากลับรูปเดิมต้องหลังเวลาเริ่ม");
                        const ok = await patch({ action: "schedule-add", entry: { ...draft.v, at: toIso(draft.at), until: draft.until ? toIso(draft.until) : null } }, "ตั้งเวลาแล้ว — ถึงเวลาทุกที่เปลี่ยนเอง");
                        if (ok) setDraft(null);
                      }}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      บันทึกเวลา
                    </button>
                    <button type="button" onClick={() => setDraft(null)} className={btn}>
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ใช้อยู่ที่ไหนบ้าง */}
            <div className={`${card} space-y-2`}>
              <p className="text-sm font-semibold text-slate-800">📍 ใช้อยู่ที่ไหนบ้าง</p>
              {usesOf(sel.id).length === 0 ? (
                <p className="text-xs text-slate-500">ยังไม่ได้ผูกที่ไหน — ไปที่ช่องรูปที่อยากใช้ชุดนี้ (เช่น Banner ในแท็บ 🧱 หน้าแรก · รูปในเมนู/รูปคั่นสินค้า/หน้าขอบคุณ ในแท็บ 🎨 ดีไซน์) แล้วกด 🔗 ใช้ชุดรูป</p>
              ) : (
                <ul className="space-y-1">
                  {usesOf(sel.id).map((u, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${u.state === "live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{u.state === "live" ? "เผยแพร่แล้ว" : "ร่าง"}</span>
                      {u.where}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-slate-400">ผูกในร่างแล้วต้องกดเผยแพร่ที่แท็บนั้นหนึ่งครั้ง · หลังจากนั้นเปลี่ยนรูปที่นี่ได้เลย ไม่ต้องเผยแพร่อีก</p>
            </div>
            {now.desk === null && now.mob === null && <p className="text-[11px] text-amber-700">⚠️ ชุดนี้ยังไม่มีรูป — ที่ที่ผูกไว้จะไม่มีรูปจนกว่าจะใส่</p>}
          </div>
        )}
      </div>
    </div>
  );
}
