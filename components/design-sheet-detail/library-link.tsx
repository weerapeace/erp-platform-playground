"use client";

/**
 * 📚 "จัดการที่ Design Library" ในแท็บรายละเอียดงานของใบงาน (เจ้าของสั่ง 2026-11-23 · เลือกข้อเสนอ 1-5)
 *  • ยังไม่เชื่อม → ปุ่ม → ป๊อปเลือกแม่แบบ (เดาจากชื่องานให้ก่อน) → สร้างสูตรผูกใบงาน (รูปใบงาน = รูปอ้างอิงในสูตร · key เดิม)
 *    → เปิดหน้าสูตรเป็นป๊อป (ของกลาง EmbedModal · มีปุ่มเปิดเต็มจอ)
 *  • เชื่อมแล้ว → แถบ: แม่แบบ/สูตร · เปิด Design Library · ดึงกลับตอนนี้ · ยกเลิกการเชื่อม
 *  • ทางกลับ = ระบบ "ส่งสูตรเป็นใบงาน" เดิม (/api/design-library/send-to-sheet mode attach · ไม่ลบของเดิม · ไม่รวมตีราคา กันบรรทัดซ้ำ)
 *    หน้าสูตรซิงค์กลับเองตอนบันทึก/ติดดาวรูป (components/design-library/sheet-autosync.ts) · ปุ่มนี้ = สั่งเอง
 *  • สิทธิ์: ดู = design_library.view · เชื่อม/ดึงกลับ = design_library.edit + products.edit · ไม่มีสิทธิ์ดู Library = ไม่โชว์อะไร
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { EmbedModal } from "@/components/embed-modal";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { recipeHref } from "@/components/design-library/shared";
import { pushRecipeToSheet } from "@/components/design-library/sheet-autosync";

type Linked = { id: string; seq: number; name: string | null; template_code: string | null; template_name: string | null; render_count: number; updated_at: string; updated_by_name: string | null };
type Tpl = { id: string; code: string; name: string; description: string | null; category: string | null; image_key: string | null };

/** เดาแม่แบบจากชื่องาน — คำในชื่อแม่แบบที่เจอในชื่องาน (ยาวกว่า = น้ำหนักมากกว่า) · คำกลาง ๆ อย่าง "กระเป๋า" ไม่นับ */
const GENERIC = new Set(["กระเป๋า", "แบบ", "ใบ", "ทรง", "bag"]);
export function guessTemplate(name: string, tpls: Tpl[]): string | null {
  const n = name.toLowerCase();
  let best: { id: string; score: number } | null = null;
  for (const tp of tpls) {
    const parts = `${tp.name} ${tp.description ?? ""}`.toLowerCase().split(/[\s/,()·\-–+]+/).map((x) => x.replace(/^กระเป๋า/, "")).filter((x) => x.length >= 2 && !GENERIC.has(x));
    const score = [...new Set(parts)].reduce((s, p) => (n.includes(p) ? s + p.length : s), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: tp.id, score };
  }
  return best?.id ?? null;
}

export function LibraryLink({ sheetId, sheetName, onSynced }: { sheetId: string; sheetName: string; onSynced?: () => void }) {
  const t = useT();
  const toast = useToast();
  const canView = usePermission("design_library.view");
  const canLibEdit = usePermission("design_library.edit");
  const canSheetEdit = usePermission("products.edit");
  const canLink = canLibEdit && canSheetEdit;
  const [linked, setLinked] = useState<Linked | null | undefined>(undefined);   // undefined = กำลังโหลด
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [useImages, setUseImages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const [askUnlink, setAskUnlink] = useState(false);

  const load = useCallback(async (withTemplates = false) => {
    try {
      const r = await apiFetch(`/api/design-library/bundle?sheet=${sheetId}${withTemplates ? "&templates=1" : ""}`);
      if (!r.ok) { setLinked(null); return; }
      const j = await r.json();
      setLinked((j?.data ?? null) as Linked | null);
      if (Array.isArray(j?.templates)) setTpls(j.templates as Tpl[]);
    } catch { setLinked(null); }
  }, [sheetId]);
  useEffect(() => { if (canView) void load(); }, [canView, load]);

  const openPicker = async () => {
    setPickOpen(true); setQ("");
    if (!tpls.length) await load(true);
  };
  useEffect(() => { if (pickOpen && tpls.length && !pick) setPick(guessTemplate(sheetName, tpls)); }, [pickOpen, tpls, pick, sheetName]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? tpls.filter((x) => `${x.code} ${x.name} ${x.description ?? ""}`.toLowerCase().includes(s)) : tpls;
  }, [tpls, q]);

  const create = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/design-library/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recipe_from_sheet", template_id: pick, sheet_id: sheetId, use_images: useImages }) });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || t("สร้างสูตรไม่สำเร็จ", "Couldn't create the recipe"));
      setPickOpen(false);
      toast.success(j.existed ? t("ใบงานนี้เชื่อมสูตรไว้แล้ว — เปิดสูตรเดิมให้", "Already linked — opening the existing recipe") : t("สร้างสูตรผูกใบงานแล้ว", "Recipe created and linked"));
      await load();
      setPeek(String(j.data.id));
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const pullNow = async () => {
    if (!linked) return;
    setBusy(true);
    const res = await pushRecipeToSheet(linked.id, sheetId);
    setBusy(false);
    if (res.ok) { toast.success(res.summary || t("ดึงจาก Design Library แล้ว", "Pulled from Design Library")); onSynced?.(); void load(); }
    else toast.error(res.error || t("ดึงกลับไม่สำเร็จ", "Couldn't pull back"));
  };

  const unlink = async () => {
    if (!linked) return;
    setAskUnlink(false); setBusy(true);
    try {
      const r = await apiFetch("/api/design-library/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlink_sheet", recipe_id: linked.id }) });
      const j = await r.json(); if (!r.ok || j?.error) throw new Error(j?.error);
      const was = linked;
      setLinked(null);
      toast.undo(t("ยกเลิกการเชื่อมแล้ว (ใบงานกับสูตรยังอยู่ครบ)", "Unlinked (sheet and recipe are kept)"), async () => {
        // ย้อนกลับ = ผูกใหม่ด้วย "ส่งสูตรเข้าใบนี้" (ไม่ส่งของ แค่จำการเชื่อม)
        const res = await pushRecipeToSheet(was.id, sheetId, { images: false, spec: false, colors: false }, null);
        if (res.ok) void load(); else toast.error(res.error || t("ย้อนกลับไม่สำเร็จ", "Undo failed"));
      });
    } catch (e) { toast.error(e instanceof Error && e.message ? e.message : t("ยกเลิกการเชื่อมไม่สำเร็จ", "Couldn't unlink")); }
    finally { setBusy(false); }
  };

  if (!canView || linked === undefined) return null;
  if (!linked && !canLink) return null;

  return (
    <>
      {linked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs">
          <Icon value="i:books" className="text-indigo-600" />
          <span className="text-slate-700">{t("จัดการที่", "Managed in")} <b className="font-semibold">Design Library</b> · {linked.template_code ?? "?"} {t("สูตร", "recipe")} #{linked.seq}</span>
          <span className="text-[11px] text-emerald-700">
            {t("อัปเดต", "Updated")} {new Date(linked.updated_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{linked.render_count ? ` · ${t("รูปผล", "renders")} ${linked.render_count}` : ""}
          </span>
          <span className="flex-1" />
          <button type="button" onClick={() => setPeek(linked.id)} className="inline-flex h-7 items-center gap-1 rounded-md bg-indigo-600 px-2.5 font-medium text-white hover:bg-indigo-700">
            <Icon value="i:external-link" /> {t("เปิด Design Library", "Open Design Library")}
          </button>
          {canLink && <>
            <button type="button" onClick={() => void pullNow()} disabled={busy} title={t("ดึงรูปติดดาว + หน้ารายละเอียดงาน + ตารางสีจากสูตรมาเดี๋ยวนี้ (ไม่ลบของเดิม)", "Pull starred images + detail page + colours from the recipe now (keeps existing)")}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-white px-2.5 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              <Icon value="i:refresh" /> {busy ? t("กำลังดึง…", "Pulling…") : t("ดึงกลับตอนนี้", "Pull now")}
            </button>
            <button type="button" onClick={() => setAskUnlink(true)} disabled={busy} className="h-7 rounded-md px-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50">{t("ยกเลิกการเชื่อม", "Unlink")}</button>
          </>}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-indigo-200 px-3 py-2 text-xs text-slate-500">
          <Icon value="i:books" className="text-indigo-500" />
          <span>{t("ทำรายละเอียดงานใน Design Library ได้ (ปักหมุดวัสดุ · ชุดสี · ทุน · รูป GPT) แล้วส่งกลับมาที่ใบนี้เอง", "Build this job's details in Design Library (material pins · colourways · cost · GPT images) — they sync back here")}</span>
          <span className="flex-1" />
          <button type="button" onClick={() => void openPicker()} className="inline-flex h-7 items-center gap-1 rounded-md bg-indigo-600 px-2.5 font-medium text-white hover:bg-indigo-700">
            <Icon value="i:books" /> {t("จัดการที่ Design Library", "Manage in Design Library")}
          </button>
        </div>
      )}

      <ERPModal open={pickOpen} onClose={() => setPickOpen(false)} size="lg" storageKey="dsd-lib-pick"
        title={t("เลือกแม่แบบกระเป๋า", "Pick a bag template")}
        description={t("ระบบสร้างสูตรใหม่จากแม่แบบนี้ ผูกกับใบงานนี้ แล้วเปิดให้ใส่รายละเอียดต่อ", "A new recipe is created from this template, linked to this sheet, then opened for you")}
        footer={<>
          <label className="mr-auto inline-flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={useImages} onChange={(e) => setUseImages(e.target.checked)} /> {t("ใช้รูปในใบงานเป็นรูปอ้างอิงในสูตร", "Use this sheet's images as recipe references")}</label>
          <button type="button" onClick={() => setPickOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
          <button type="button" onClick={() => void create()} disabled={!pick || busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? t("กำลังสร้าง…", "Creating…") : t("สร้างสูตร + เปิด Design Library", "Create recipe + open")}
          </button>
        </>}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาแม่แบบ…", "Search templates…")} autoFocus
          className="mb-2 h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        {!tpls.length ? <div className="py-10 text-center text-sm text-slate-400">{t("กำลังโหลดแม่แบบ…", "Loading templates…")}</div> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shown.map((x) => (
              <button key={x.id} type="button" onClick={() => setPick(x.id)} onDoubleClick={() => { setPick(x.id); void create(); }} aria-pressed={pick === x.id}
                className={`rounded-lg border bg-white p-1.5 text-left transition ${pick === x.id ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-slate-50">
                  {x.image_key ? <img src={r2ImageUrl(x.image_key, 240) ?? ""} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Icon value="i:photo" className="text-2xl text-slate-300" />}
                </div>
                <div className="mt-1 truncate text-[12px] font-medium text-slate-800">{x.name}</div>
                <div className="text-[10px] text-slate-400">{x.code}</div>
              </button>
            ))}
          </div>
        )}
      </ERPModal>

      {peek && <EmbedModal url={recipeHref(peek)} title={`Design Library · ${linked?.template_code ?? ""} #${linked?.seq ?? ""}`} storageKey="dsd_lib_peek"
        onClose={() => { setPeek(null); void load(); onSynced?.(); }} />}

      <ConfirmDialog open={askUnlink} onClose={() => setAskUnlink(false)} onConfirm={() => void unlink()}
        title={t("ยกเลิกการเชื่อมกับ Design Library?", "Unlink from Design Library?")}
        message={t("ใบงานกับสูตรยังอยู่ครบทั้งคู่ ของที่ดึงมาแล้วไม่หาย แค่ไม่ซิงค์กันอีก (มีปุ่มย้อนกลับ 5 วินาที)", "Both the sheet and the recipe stay; pulled items remain — they just stop syncing (5-second undo)")}
        confirmText={t("ยกเลิกการเชื่อม", "Unlink")} />
    </>
  );
}
