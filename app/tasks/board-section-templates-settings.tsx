"use client";

/**
 * ⚙️ เทมเพลตโซนกระดาน (bento) — /tasks/settings แท็บ "เทมเพลตโซนกระดาน" (เจ้าของเลือก 2026-11-22)
 *  • หลายเทมเพลต · แต่ละอันเลือกได้ว่าใช้กับกระดานบรีฟของงาน / กระดานแคมเปญ
 *  • ตาราง 4 ช่อง: ลากกล่องเพื่อย้าย · ลากมุมขวาล่างเพื่อปรับขนาด · มือถือปรับขนาดด้วยปุ่ม − / +
 *  • ชนิดโซน: ทั่วไป / งาน / คอนเทนต์ (โซนงาน/คอนเทนต์ มีปุ่ม ＋ ที่กรอบบนกระดาน)
 *  • แก้ในร่างก่อน → กด "บันทึก" · ↶ ย้อนทีละขั้น · ลบเทมเพลต = ย้อนกลับได้จากแจ้งผล
 *  • เก็บ ui_config board_section_templates (ประวัติการแก้ลง audit ที่ /api/ui-config) · ตรรกะ = lib/board-section-templates
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import {
  BENTO_COLS, BENTO_MAX_ROWS, BOARD_KIND_OPTIONS, BOARD_SECTION_TEMPLATES_KEY, SECTION_KIND_OPTIONS,
  canPlace, cleanSectionConfig, firstFreeSpot, newId, usedRows,
  type BoardKind, type BoardSectionConfig, type SectionBlock, type SectionKind,
} from "@/lib/board-section-templates";
import { clearSectionTemplatesCache } from "@/components/canvas-cards/section-templates-cache";

const KIND_CLS: Record<SectionKind, string> = {
  none: "border-violet-300 bg-violet-50 text-violet-800",
  task: "border-sky-300 bg-sky-50 text-sky-800",
  content: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

export function BoardSectionTemplatesManager({ showToast }: { showToast: (m: string) => void }) {
  const t = useT();
  const toast = useToast();
  const [saved, setSaved] = useState<BoardSectionConfig | null>(null);
  const [draft, setDraft] = useState<BoardSectionConfig | null>(null);
  const [hist, setHist] = useState<BoardSectionConfig[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [selId, setSelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/ui-config?key=${BOARD_SECTION_TEMPLATES_KEY}`).then((r) => r.json())
      .then((j) => { const c = cleanSectionConfig(j?.value ?? null); setSaved(c); setDraft(c); setTplId(c.templates[0]?.id ?? ""); })
      .catch(() => { const c = cleanSectionConfig(null); setSaved(c); setDraft(c); setTplId(c.templates[0]?.id ?? ""); });
  }, []);

  const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const change = useCallback((fn: (c: BoardSectionConfig) => BoardSectionConfig) => {
    setDraft((cur) => { if (!cur) return cur; setHist((h) => [...h.slice(-49), cur]); return fn(cur); });
  }, []);
  const undo = () => setHist((h) => { if (!h.length) return h; setDraft(h[h.length - 1]); return h.slice(0, -1); });

  const save = async (next = draft) => {
    if (!next) return;
    setSaving(true); setErr(null);
    try {
      const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: BOARD_SECTION_TEMPLATES_KEY, value: next }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("บันทึกไม่สำเร็จ", "Save failed"));
      setSaved(next); setDraft(next); clearSectionTemplatesCache(); showToast(t("บันทึกเทมเพลตโซนแล้ว", "Section templates saved"));
    } catch (e) { setErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  if (!draft) return <p className="text-sm text-slate-400">{t("กำลังโหลด…", "Loading…")}</p>;
  const tpl = draft.templates.find((x) => x.id === tplId) ?? draft.templates[0] ?? null;
  const patchTpl = (fn: (b: NonNullable<typeof tpl>) => NonNullable<typeof tpl>) => tpl && change((c) => ({ templates: c.templates.map((x) => (x.id === tpl.id ? fn(x) : x)) }));
  const patchBlock = (id: string, p: Partial<SectionBlock>) => patchTpl((x) => ({ ...x, blocks: x.blocks.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  const sel = tpl?.blocks.find((b) => b.id === selId) ?? null;

  const addTemplate = () => {
    const id = newId();
    change((c) => ({ templates: [...c.templates, { id, name: t("เทมเพลตใหม่", "New template"), boards: ["brief", "campaign"], blocks: [{ id: newId(), name: t("ไอเดีย", "Ideas"), x: 0, y: 0, w: 2, h: 1, kind: "none" }] }] }));
    setTplId(id); setSelId(null);
  };
  const dupTemplate = () => {
    if (!tpl) return;
    const id = newId();
    change((c) => ({ templates: [...c.templates, { ...tpl, id, name: `${tpl.name} (${t("สำเนา", "copy")})`, blocks: tpl.blocks.map((b) => ({ ...b, id: newId() })) }] }));
    setTplId(id);
  };
  const delTemplate = () => {
    if (!tpl || !saved) return;
    const before = draft;
    const next = { templates: draft.templates.filter((x) => x.id !== tpl.id) };
    setHist((h) => [...h, before]); setDraft(next); setTplId(next.templates[0]?.id ?? ""); setSelId(null);
    void save(next).then(() => toast.undo(t(`ลบเทมเพลต “${tpl.name}” แล้ว`, `Deleted template “${tpl.name}”`), async () => { setDraft(before); setTplId(tpl.id); await save(before); }));
  };
  const addBlock = () => {
    if (!tpl) return;
    const spot = firstFreeSpot(tpl.blocks, 1, 1);
    if (!spot) { setErr(t("ตารางเต็มแล้ว — ย่อหรือลบโซนก่อน", "The grid is full — shrink or remove a zone first")); return; }
    const id = newId();
    patchTpl((x) => ({ ...x, blocks: [...x.blocks, { id, name: t("โซนใหม่", "New zone"), ...spot, w: 1, h: 1, kind: "none" }] }));
    setSelId(id); setErr(null);
  };
  const delBlock = (id: string) => { patchTpl((x) => ({ ...x, blocks: x.blocks.filter((b) => b.id !== id) })); setSelId(null); };
  const resize = (b: SectionBlock, dw: number, dh: number) => {
    const next = { x: b.x, y: b.y, w: b.w + dw, h: b.h + dh };
    if (canPlace(tpl!.blocks, b.id, next)) patchBlock(b.id, next);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{t("เทมเพลตโซนกระดาน (bento)", "Board section templates (bento)")}</h3>
        <p className="text-xs text-slate-500">{t("ชุดกรอบโซนที่วางลงกระดานบรีฟ/แคมเปญได้ทีเดียว (ปุ่ม Section → “วางเทมเพลตโซน”) · ลากกล่องเพื่อย้าย ลากมุมขวาล่างเพื่อปรับขนาด · โซนงาน/คอนเทนต์ มีปุ่ม ＋ ที่กรอบบนกระดาน", "Zone frames you can drop on a brief/campaign board at once (Section → “Place section template”) · drag a box to move, drag its corner to resize · Tasks/Content zones get a ＋ button on the board")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {draft.templates.map((x) => (
          <button key={x.id} type="button" onClick={() => { setTplId(x.id); setSelId(null); }}
            className={`h-8 rounded-lg border px-3 text-sm ${x.id === tpl?.id ? "border-violet-500 bg-violet-600 text-white" : "border-slate-200 text-slate-600 hover:border-violet-300"}`}>{x.name}</button>
        ))}
        <button type="button" onClick={addTemplate} className="h-8 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-500 hover:border-violet-300">＋ {t("เทมเพลต", "Template")}</button>
      </div>

      {tpl ? (
        <div className="rounded-xl border border-slate-200 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input value={tpl.name} onChange={(e) => patchTpl((x) => ({ ...x, name: e.target.value }))} className="h-8 flex-1 min-w-[160px] rounded-lg border border-slate-200 px-2 text-sm" aria-label={t("ชื่อเทมเพลต", "Template name")} />
            {BOARD_KIND_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={tpl.boards.includes(o.value)} className="accent-violet-600"
                  onChange={(e) => patchTpl((x) => ({ ...x, boards: e.target.checked ? [...new Set([...x.boards, o.value])] : x.boards.filter((b) => b !== o.value) as BoardKind[] }))} />
                {t(o.th, o.en)}
              </label>
            ))}
            <button type="button" onClick={dupTemplate} className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">⧉ {t("สำเนา", "Copy")}</button>
            <button type="button" onClick={delTemplate} className="h-8 rounded-lg border border-slate-200 px-2 text-xs text-rose-600 hover:bg-rose-50">{t("ลบเทมเพลต", "Delete template")}</button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
            <BentoGrid blocks={tpl.blocks} selId={selId} onSelect={setSelId} onMove={(id, p) => patchBlock(id, p)} />
            <div className="space-y-2">
              {sel ? (
                <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">{t("โซนที่เลือก", "Selected zone")}</p>
                  <input value={sel.name} onChange={(e) => patchBlock(sel.id, { name: e.target.value })} className="h-8 w-full rounded-lg border border-slate-200 px-2 text-sm" aria-label={t("ชื่อโซน", "Zone name")} />
                  <select value={sel.kind} onChange={(e) => patchBlock(sel.id, { kind: e.target.value as SectionKind })} className="h-8 w-full rounded-lg border border-slate-200 px-1 text-sm">
                    {SECTION_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.th, o.en)}</option>)}
                  </select>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1">{t("กว้าง", "W")}
                      <button type="button" onClick={() => resize(sel, -1, 0)} className="h-6 w-6 rounded border border-slate-200">−</button>{sel.w}
                      <button type="button" onClick={() => resize(sel, 1, 0)} className="h-6 w-6 rounded border border-slate-200">+</button></span>
                    <span className="flex items-center gap-1">{t("สูง", "H")}
                      <button type="button" onClick={() => resize(sel, 0, -1)} className="h-6 w-6 rounded border border-slate-200">−</button>{sel.h}
                      <button type="button" onClick={() => resize(sel, 0, 1)} className="h-6 w-6 rounded border border-slate-200">+</button></span>
                  </div>
                  <button type="button" onClick={() => delBlock(sel.id)} className="text-xs text-rose-600 hover:underline">{t("ลบโซนนี้", "Remove this zone")}</button>
                </div>
              ) : <p className="text-xs text-slate-400">{t("กดกล่องเพื่อแก้ชื่อ / ชนิด / ขนาด", "Click a box to edit its name / type / size")}</p>}
              <button type="button" onClick={addBlock} className="h-8 w-full rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 hover:border-violet-300">＋ {t("เพิ่มโซน", "Add zone")}</button>
            </div>
          </div>
        </div>
      ) : <p className="text-sm text-slate-400">{t("ยังไม่มีเทมเพลต — กด ＋ เทมเพลต", "No templates yet — click ＋ Template")}</p>}

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={undo} disabled={!hist.length} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 disabled:opacity-40">↶ {t("ย้อน", "Undo")}</button>
        <span className="flex-1" />
        {dirty && <button type="button" onClick={() => { setDraft(saved); setHist([]); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600">{t("ยกเลิกที่แก้", "Discard")}</button>}
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white disabled:opacity-40">{saving ? t("กำลังบันทึก…", "Saving…") : t("บันทึก", "Save")}</button>
      </div>
    </div>
  );
}

/** ตาราง bento — ลากกล่องย้าย · ลากมุมขวาล่างปรับขนาด (เมาส์/นิ้ว) · ห้ามทับกัน */
function BentoGrid({ blocks, selId, onSelect, onMove }: {
  blocks: SectionBlock[]; selId: string | null; onSelect: (id: string) => void;
  onMove: (id: string, p: Pick<SectionBlock, "x" | "y" | "w" | "h">) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize"; dx: number; dy: number; prev: Pick<SectionBlock, "x" | "y" | "w" | "h">; ok: boolean } | null>(null);
  const rows = Math.min(BENTO_MAX_ROWS, Math.max(3, usedRows(blocks) + 1));
  const cellOf = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { c: Math.floor(((e.clientX - r.left) / r.width) * BENTO_COLS), r: Math.floor(((e.clientY - r.top) / r.height) * rows) };
  };
  const start = (e: React.PointerEvent, b: SectionBlock, mode: "move" | "resize") => {
    e.stopPropagation(); e.preventDefault();
    onSelect(b.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const c = cellOf(e);
    setDrag({ id: b.id, mode, dx: c.c - b.x, dy: c.r - b.y, prev: { x: b.x, y: b.y, w: b.w, h: b.h }, ok: true });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const b = blocks.find((x) => x.id === drag.id); if (!b) return;
    const c = cellOf(e);
    const next = drag.mode === "move"
      ? { x: Math.min(BENTO_COLS - b.w, Math.max(0, c.c - drag.dx)), y: Math.min(BENTO_MAX_ROWS - b.h, Math.max(0, c.r - drag.dy)), w: b.w, h: b.h }
      : { x: b.x, y: b.y, w: Math.max(1, Math.min(BENTO_COLS - b.x, c.c - b.x + 1)), h: Math.max(1, Math.min(4, c.r - b.y + 1)) };
    const ok = canPlace(blocks, b.id, next);
    if (ok && (next.x !== drag.prev.x || next.y !== drag.prev.y || next.w !== drag.prev.w || next.h !== drag.prev.h)) { setDrag({ ...drag, prev: next, ok }); }
    else if (ok !== drag.ok) setDrag({ ...drag, ok });
  };
  const end = () => {
    if (!drag) return;
    const b = blocks.find((x) => x.id === drag.id);
    if (b && (drag.prev.x !== b.x || drag.prev.y !== b.y || drag.prev.w !== b.w || drag.prev.h !== b.h)) onMove(drag.id, drag.prev);
    setDrag(null);
  };

  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <div ref={ref} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        className="relative grid gap-1.5 touch-none select-none"
        style={{ gridTemplateColumns: `repeat(${BENTO_COLS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, 64px)` }}>
        {Array.from({ length: rows * BENTO_COLS }).map((_, i) => (
          <div key={`c${i}`} className="rounded-md border border-dashed border-slate-200" style={{ gridColumn: (i % BENTO_COLS) + 1, gridRow: Math.floor(i / BENTO_COLS) + 1 }} />
        ))}
        {blocks.map((b) => {
          const pos = drag?.id === b.id ? drag.prev : b;
          return (
            <div key={b.id} onPointerDown={(e) => start(e, b, "move")}
              className={`relative z-10 cursor-grab rounded-lg border-2 p-1.5 text-xs font-medium ${KIND_CLS[b.kind]} ${b.id === selId ? "ring-2 ring-violet-400" : ""} ${drag?.id === b.id ? "opacity-80 shadow-lg" : ""}`}
              style={{ gridColumn: `${pos.x + 1} / span ${pos.w}`, gridRow: `${pos.y + 1} / span ${pos.h}` }}>
              <span className="line-clamp-2">{b.name}</span>
              {b.kind !== "none" && <span className="absolute left-1.5 bottom-1 rounded bg-white/80 px-1 text-[10px]">＋ {b.kind === "task" ? t("งาน", "Task") : t("คอนเทนต์", "Content")}</span>}
              <span onPointerDown={(e) => start(e, b, "resize")} title={t("ลากเพื่อปรับขนาด", "Drag to resize")}
                className="absolute bottom-0.5 right-0.5 h-4 w-4 cursor-se-resize rounded-sm border-b-2 border-r-2 border-current opacity-60" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
