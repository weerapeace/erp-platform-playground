"use client";

/**
 * 🕘 ประวัติเวอร์ชันของสินค้า (ของกลาง) — ดู/เทียบ/ย้อนกลับ ชื่อ-คำอธิบาย · รูปปก · รูปแกลเลอรีที่ถูกลบ · รูป Description ที่เอาออก
 *
 * ใช้ในตัวแก้สินค้ากลาง (MasterCRUD drawer ของ Parent SKU / SKU) — ข้อมูลจาก /api/record-versions (lib/record-versions)
 * โหลดเมื่อกดเปิดเท่านั้น (ไม่เพิ่มงานตอนเปิด drawer) · ย้อนกลับ = ConfirmDialog กลาง → POST → onRestored ให้ drawer โหลดค่าใหม่
 * ค่าปัจจุบันก่อนย้อนถูกเก็บเป็นเวอร์ชันใหม่เสมอ → ย้อนกลับไปมาได้ไม่หาย
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";

type Version = {
  id: string; kind: "field" | "image"; field_key: string;
  old_value: unknown; new_value: unknown; r2_key: string | null; image_url: string | null;
  source: string | null; task_id: string | null; actor_name: string | null; changed_at: string; is_current: boolean;
};
type Group = "all" | "text" | "cover" | "gallery" | "description_images";

const isImageGroup = (fk: string) => fk === "cover" || fk === "gallery" || fk === "description_images";
const groupOf = (v: Version): Exclude<Group, "all"> => (isImageGroup(v.field_key) ? (v.field_key as Exclude<Group, "all" | "text">) : "text");
const textOf = (x: unknown): string | null => (x == null ? null : typeof x === "string" ? x : JSON.stringify(x));
const keyOf = (x: unknown): string | null => (x && typeof x === "object" && typeof (x as { r2_key?: unknown }).r2_key === "string" ? (x as { r2_key: string }).r2_key : null);
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const when = (iso: string) => { const d = new Date(iso); return `${d.getDate()} ${TH_MONTH[d.getMonth()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const who = (s: string | null) => (s ? s.split("@")[0] : "");

export function RecordVersionsPanel({ entityType, entityId, canRestore, fieldLabel, onRestored }: {
  /** parent_skus_v2 | skus_v2 */
  entityType: string;
  entityId: string;
  /** มีสิทธิ์แก้สินค้า (products.edit) — ไม่มี = ดูอย่างเดียว */
  canRestore: boolean;
  /** ชื่อช่องตามภาษาปัจจุบัน (จากทะเบียนฟิลด์ของ drawer) */
  fieldLabel: (key: string) => string;
  /** ย้อนกลับสำเร็จ → drawer โหลดค่า/รูปใหม่ */
  onRestored?: (fieldKey: string, kind: string) => void | Promise<void>;
}) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [current, setCurrent] = useState<Record<string, string | null>>({});
  const [group, setGroup] = useState<Group>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Version | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiFetch(`/api/record-versions?entity_type=${entityType}&entity_id=${entityId}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("โหลดประวัติเวอร์ชันไม่สำเร็จ", "Couldn't load version history"));
      setVersions(j.versions ?? []); setCurrent(j.current ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : t("โหลดประวัติเวอร์ชันไม่สำเร็จ", "Couldn't load version history"));
    } finally { setLoading(false); }
  }, [entityType, entityId, t]);

  // เปลี่ยนสินค้า (กดก่อนหน้า/ถัดไป) → ล้างของเดิม · เปิดอยู่ = โหลดของตัวใหม่
  useEffect(() => { setVersions(null); setExpanded(new Set()); if (open) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entityId]);

  const toggle = () => { const next = !open; setOpen(next); if (next && versions === null) void load(); };

  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: 0, text: 0, cover: 0, gallery: 0, description_images: 0 };
    for (const v of versions ?? []) { c.all++; c[groupOf(v)]++; }
    return c;
  }, [versions]);
  const shown = useMemo(() => (versions ?? []).filter((v) => group === "all" || groupOf(v) === group), [versions, group]);

  const labelOf = (v: Version) =>
    v.field_key === "cover" ? t("รูปปก", "Cover image")
      : v.field_key === "gallery" ? t("รูปแกลเลอรี", "Gallery image")
      : v.field_key === "description_images" ? t("รูป Description", "Description image")
      : fieldLabel(v.field_key);
  const sourceOf = (v: Version) =>
    v.source === "restore" ? t("ย้อนกลับ", "Restored")
      : v.source === "gallery_delete" ? t("ลบออก", "Removed")
      : v.source === "description_image_remove" ? t("เอาออก", "Removed")
      : t("แก้ไข", "Edited");
  const actionText = (v: Version) => (v.field_key === "gallery" || v.field_key === "description_images" ? t("＋ กู้รูปกลับ", "＋ Put back") : t("↩︎ ย้อนกลับ", "↩︎ Restore"));

  const doRestore = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/record-versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version_id: confirm.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("ย้อนกลับไม่สำเร็จ", "Restore failed"));
      toast.success(j.already ? t("ตรงกับปัจจุบันอยู่แล้ว", "Already current") : t("ย้อนกลับแล้ว — ค่าก่อนหน้าเก็บเป็นเวอร์ชันใหม่ ย้อนได้อีก", "Restored — the previous value was kept as a new version"));
      const fk = confirm.field_key, kind = confirm.kind;
      setConfirm(null);
      await onRestored?.(fk, kind);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ย้อนกลับไม่สำเร็จ", "Restore failed"));
    } finally { setBusy(false); }
  };

  const chip = (g: Group, label: string) => (counts[g] > 0 || g === "all") && (
    <button key={g} type="button" onClick={() => setGroup(g)}
      className={`h-7 px-2.5 rounded-full text-[11px] font-medium border ${group === g ? "bg-violet-50 border-violet-300 text-violet-700" : "border-slate-200 text-slate-500 hover:border-violet-200"}`}>
      {label} {versions !== null && <span className="opacity-70">{counts[g]}</span>}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="text-sm font-semibold text-slate-700">🕘 {t("ประวัติเวอร์ชัน", "Version history")}{versions !== null && <span className="ml-1 text-xs font-normal text-slate-400">({counts.all})</span>}</span>
        <span className="text-xs text-slate-400">{open ? "▲" : t("ดู / ย้อนกลับ ▼", "View / restore ▼")}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2.5 space-y-2.5">
          {loading && versions === null ? (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-lg bg-slate-100 animate-pulse" />)}</div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
              <span>⚠ {error}</span>
              <button type="button" onClick={() => void load()} className="shrink-0 h-7 px-2.5 rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50">{t("ลองใหม่", "Retry")}</button>
            </div>
          ) : (versions ?? []).length === 0 ? (
            <p className="text-xs text-slate-500 leading-relaxed py-1">
              {t("ยังไม่มีเวอร์ชันเก่า — ระบบเริ่มเก็บตั้งแต่ 18 ต.ค. 2569 · แก้ชื่อ/คำอธิบาย เปลี่ยนรูปปก หรือลบรูป ครั้งถัดไปจะมาอยู่ที่นี่",
                "No older versions yet — kept since 18 Oct 2026. Your next name/description edit, cover change or image removal will show up here.")}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {chip("all", t("ทั้งหมด", "All"))}
                {chip("text", t("ชื่อ/คำอธิบาย", "Text"))}
                {chip("cover", t("รูปปก", "Cover"))}
                {chip("gallery", t("แกลเลอรี", "Gallery"))}
                {chip("description_images", t("รูป Description", "Description images"))}
              </div>
              <ul className="space-y-2">
                {shown.map((v) => {
                  const isOpen = expanded.has(v.id);
                  const flip = () => setExpanded((s) => { const n = new Set(s); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; });
                  const oldText = textOf(v.old_value);
                  const newCover = v.field_key === "cover" ? keyOf(v.new_value) : null;
                  return (
                    <li key={v.id} className="rounded-lg border border-slate-100 p-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <span className="min-w-0 truncate"><span className="font-medium text-slate-600">{labelOf(v)}</span> · {sourceOf(v)}{v.actor_name ? ` · ${who(v.actor_name)}` : ""}</span>
                        <span className="shrink-0">{when(v.changed_at)}</span>
                      </div>

                      {v.kind === "field" ? (
                        <div className="mt-1.5 text-xs leading-relaxed">
                          <p className="text-[10px] text-slate-400">{t("ค่าเดิม (ก่อนแก้ครั้งนี้)", "Previous value")}</p>
                          <p className={`whitespace-pre-wrap break-words text-slate-700 ${isOpen ? "" : "line-clamp-3"}`}>{oldText ?? <span className="italic text-slate-400">{t("(ว่าง)", "(empty)")}</span>}</p>
                          {isOpen && (
                            <div className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5">
                              <p className="text-[10px] text-slate-400">{t("ตอนนี้", "Now")}</p>
                              <p className="whitespace-pre-wrap break-words text-slate-500">{current[v.field_key] ?? <span className="italic">{t("(ว่าง)", "(empty)")}</span>}</p>
                            </div>
                          )}
                          <button type="button" onClick={flip} className="mt-1 text-[11px] text-violet-600 hover:underline">{isOpen ? t("ย่อ", "Less") : t("ดูเต็ม + เทียบกับตอนนี้", "Show all + compare")}</button>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2">
                          <HoverImage url={v.image_url} size={56} previewSize={320} rounded="rounded-md" fallback="🖼" />
                          {newCover && <><span className="text-slate-300 text-xs">→</span><HoverImage url={r2ImageUrl(newCover)} size={40} previewSize={320} rounded="rounded-md" fallback="🖼" /></>}
                          {v.field_key === "cover" && !newCover && <span className="text-[11px] text-slate-400">→ {t("ลบปก", "cover removed")}</span>}
                        </div>
                      )}

                      <div className="mt-2 flex justify-end">
                        {v.is_current ? (
                          <span className="text-[11px] text-emerald-600">✓ {isImageGroup(v.field_key) && v.field_key !== "cover" ? t("อยู่ในสินค้าแล้ว", "Already in product") : t("ตรงกับตอนนี้", "Same as now")}</span>
                        ) : canRestore ? (
                          <button type="button" onClick={() => setConfirm(v)} className="h-7 px-2.5 rounded-md border border-violet-200 bg-white text-[11px] font-medium text-violet-700 hover:bg-violet-50">{actionText(v)}</button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => { if (!busy) setConfirm(null); }}
        onConfirm={() => void doRestore()}
        loading={busy}
        title={confirm ? (confirm.field_key === "gallery" || confirm.field_key === "description_images" ? t("กู้รูปนี้กลับ?", "Put this image back?") : t(`ย้อน "${labelOf(confirm)}" กลับ?`, `Restore "${labelOf(confirm)}"?`)) : ""}
        message={confirm ? (
          <div className="space-y-1.5 text-sm">
            <p>{confirm.field_key === "gallery" ? t("ใส่รูปนี้กลับเข้าแกลเลอรี (ต่อท้าย)", "Adds this image back to the gallery (at the end)")
              : confirm.field_key === "description_images" ? t("ใส่รูปนี้กลับเข้ารูป Description (ต่อท้าย)", "Adds this image back to the Description images (at the end)")
              : confirm.field_key === "cover" ? t("ตั้งรูปนี้เป็นรูปปกอีกครั้ง — รูปปกตอนนี้จะถูกเก็บเป็นเวอร์ชัน ย้อนกลับได้", "Sets this image as the cover again — the current cover is kept as a version")
              : t("เปลี่ยนกลับเป็นค่าเดิม — ค่าตอนนี้จะถูกเก็บเป็นเวอร์ชัน ย้อนกลับได้อีก", "Changes it back — the current value is kept as a version you can restore")}</p>
            <p className="text-xs text-slate-500">{t("ถ้าสินค้านี้ขายบนเว็บอยู่ ลูกค้าจะเห็นการเปลี่ยนแปลงภายในไม่กี่นาที", "If this product is on the website, customers will see the change within a few minutes")}</p>
          </div>
        ) : ""}
        confirmText={confirm ? actionText(confirm).replace(/^[＋↩︎\s]+/, "") : ""}
      />
    </div>
  );
}
