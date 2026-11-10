"use client";

/**
 * สตูดิโอของแพทเทิร์น 1 ใบ (แอปหลัก · เจ้าของสั่ง 2026-11-10)
 *   หัว: ชื่อ · รหัสรุ่น · สถานะ · สรุป (ชิ้น / พื้นที่ / ตะเข็บ)
 *   แท็บ "วาดชิ้น" = PatternStudio (กระดานวาดเดิม + แม่แบบทรง + ภาพ 3D) · แท็บ "เย็บ" = SewView (จับคู่ขอบ + ตรวจความยาว)
 *   แท็บ "ประกอบ 3D" = AssemblyView (ประกอบชิ้นเป็นกระเป๋าจากตะเข็บ + เย็บทีละขั้น)
 *   จุดติดหู/แผ่นหลังช่อง (จากแม่แบบ) เก็บในช่อง template: { params, attach }
 *   สร้างจากแม่แบบทรง → ได้ชิ้น + ตะเข็บตั้งต้นครบ
 *   บันทึกด้วยแถบบันทึกกลาง (SaveBar) → PATCH /api/pattern-projects/<id> · ไม่มีสิทธิ์แก้ = ดูอย่างเดียว
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/modal";
import { SaveBar } from "@/components/save-bar";
import { ErrorState, LoadingState } from "@/components/state-views";
import { apiFetch } from "@/lib/api";
import type { EditorPiece, ShapeEditorResult } from "@/components/pattern-sheet/shape-editor";
import type { TemplateInsertInfo } from "@/components/pattern-studio";
import { PATTERN_PROJECT_STATUSES, PATTERN_STATUS_LABEL, projectSummary, type PatternProject, type PatternProjectStatus, type ProjectPiece } from "@/lib/pattern-project";
import { checkSeam, type Seam } from "@/lib/pattern-seams";
import { cleanAttaches, type Attach } from "@/lib/pattern-assembly";

const PatternStudio = dynamic(() => import("@/components/pattern-studio").then((m) => m.PatternStudio), { ssr: false });
const SewView = dynamic(() => import("@/components/pattern-studio/sew-view").then((m) => m.SewView), { ssr: false });
const AssemblyView = dynamic(() => import("@/components/pattern-studio/assembly-view").then((m) => m.AssemblyView), { ssr: false });

const SQFT = 929.03;
type Tab = "draw" | "sew" | "asm";

export function PatternProjectEditor({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<{ can_edit: boolean; can_delete: boolean } | null>(null);
  const [patternNo, setPatternNo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [status, setStatus] = useState<PatternProjectStatus>("draft");
  const [pieces, setPieces] = useState<ProjectPiece[]>([]);
  const [seams, setSeams] = useState<Seam[]>([]);
  const [basis, setBasis] = useState<"box" | "area">("box");
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);   // { params: ค่าแม่แบบล่าสุด, attach: จุดติด }
  const [attaches, setAttaches] = useState<Attach[]>([]);
  const [tab, setTab] = useState<Tab>("draw");
  const [boardNonce, setBoardNonce] = useState(0);        // เปลี่ยน = เปิดกระดานใหม่จากชิ้นล่าสุด (โหลดเสร็จ / กลับจากแท็บเย็บ / ละทิ้ง)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [ask, setAsk] = useState<null | "leave" | "delete">(null);
  const [deleting, setDeleting] = useState(false);
  const piecesRef = useRef(pieces); piecesRef.current = pieces;

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch(`/api/pattern-projects/${id}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      const p = j.data as PatternProject;
      setMe(j.me ?? null); setPatternNo(p.pattern_no); setName(p.name); setSku(p.sku_code ?? ""); setStatus(p.status);
      setPieces(p.pieces ?? []); piecesRef.current = p.pieces ?? []; setSeams(p.seams ?? []); setBasis(p.basis === "area" ? "area" : "box"); setTemplate(p.template ?? null);
      setAttaches(cleanAttaches((p.template as { attach?: unknown } | null)?.attach, new Set((p.pieces ?? []).map((x) => x.pid))));
      setDirty(false); setSaveErr(null); setBoardNonce((n) => n + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const canEdit = !!me?.can_edit;
  // ชิ้นตั้งต้นของกระดาน — อ่านครั้งเดียวต่อการเปิดกระดาน (ระหว่างวาด กระดานถือข้อมูลเอง แล้วส่งกลับทาง onChange)
  const initial: EditorPiece[] = useMemo(() => piecesRef.current.map((p) => ({ pid: p.pid, shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, allowEdges: p.allowEdges, name: p.name, at: p.at, grain: p.grain, notches: p.notches })), [boardNonce]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onBoard = useCallback((res: ShapeEditorResult) => {
    setPieces(res.pieces.map((p) => ({
      pid: p.pid, name: p.name, count: p.count, allow: p.allow, ...(p.allowEdges ? { allowEdges: p.allowEdges } : {}), shape: p.shape, holes: p.holes, notches: p.notches, at: p.at,
      grain: p.grain && p.grain.length === 2 ? [p.grain[0], p.grain[1]] : null,
    })));
    setBasis(res.basis); setDirty(true);
  }, []);
  const onTemplate = useCallback((info: TemplateInsertInfo) => {
    const stamp = Date.now().toString(36);
    const made: Seam[] = [];
    info.seams.forEach((r, i) => {
      const a = info.pidByKey[r.a.piece], b = info.pidByKey[r.b.piece];
      if (a && b) made.push({ id: `s${stamp}t${i}`, a: { pid: a, from: r.a.from, count: r.a.count, n: r.a.n }, b: { pid: b, from: r.b.from, count: r.b.count, n: r.b.n } });
    });
    const att: Attach[] = [];
    info.attach.forEach((r, i) => {
      const pid = info.pidByKey[r.piece], on = info.pidByKey[r.on];
      if (pid && on) att.push({ id: `a${stamp}t${i}`, kind: r.kind, pid, on, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail });
    });
    setSeams((prev) => [...prev, ...made]); setDirty(true);
    setAttaches((prev) => { const next = [...prev, ...att]; setTemplate({ params: info.params, attach: next }); return next; });
  }, []);
  const onSeams = (next: Seam[]) => { setSeams(next); setDirty(true); };
  const switchTab = (next: Tab) => { if (next === tab) return; if (next === "draw") setBoardNonce((n) => n + 1); setTab(next); };

  const shapes = useMemo(() => new Map(pieces.map((p) => [p.pid, p.shape])), [pieces]);
  const summary = useMemo(() => projectSummary(pieces, basis), [pieces, basis]);
  const asmPieces = useMemo(() => pieces.map((p) => ({ pid: p.pid, name: p.name, count: p.count, shape: p.shape, holes: p.holes })), [pieces]);
  const badSeams = useMemo(() => seams.filter((s) => checkSeam(shapes, s).status !== "ok").length, [seams, shapes]);

  const save = async () => {
    if (!name.trim()) { setSaveErr(t("ใส่ชื่อแพทเทิร์นก่อน", "Enter a pattern name first")); return; }
    setSaving(true); setSaveErr(null);
    try {
      const pids = new Set(piecesRef.current.map((p) => p.pid));
      const keep = seams.filter((s) => pids.has(s.a.pid) && pids.has(s.b.pid));   // ตะเข็บของชิ้นที่ลบไปแล้ว = ทิ้ง
      const keepAtt = attaches.filter((a) => pids.has(a.pid) && pids.has(a.on));
      const tpl = template || keepAtt.length ? { ...(template ?? {}), attach: keepAtt } : null;
      const res = await apiFetch(`/api/pattern-projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), sku_code: sku.trim(), status, basis, template: tpl, pieces: piecesRef.current, seams: keep }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      setSeams(keep); setAttaches(keepAtt); setTemplate(tpl); setDirty(false); setSavedAt(new Date());
    } catch (e) { setSaveErr((e as Error).message); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/pattern-projects/${id}`, { method: "DELETE" });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      router.push("/pattern-studio");
    } catch (e) { setSaveErr((e as Error).message); setDeleting(false); setAsk(null); }
  };

  if (loading) return <LoadingState />;
  if (err) return <div className="p-4"><ErrorState hint={err} onRetry={() => void load()} /><div className="mt-3 text-center"><button type="button" onClick={() => router.push("/pattern-studio")} className="text-sm text-blue-700 hover:underline">{t("กลับไปหน้ารวมแพทเทิร์น", "Back to all patterns")}</button></div></div>;

  const st = PATTERN_STATUS_LABEL[status];
  const tabBtn = (k: Tab, icon: string, label: string, badge?: number) => (
    <button type="button" onClick={() => switchTab(k)} aria-pressed={tab === k} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm ${tab === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
      <Icon value={icon} className="text-base" />{label}{badge ? <span className="rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white">{badge}</span> : null}
    </button>
  );
  return (
    <div className="mx-auto max-w-[1700px] space-y-3 p-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => (dirty ? setAsk("leave") : router.push("/pattern-studio"))} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">
          ← {t("แพทเทิร์นทั้งหมด", "All patterns")}
        </button>
        {patternNo && <span className="text-xs tabular-nums text-slate-500">{patternNo}</span>}
        {!canEdit && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{t("ดูอย่างเดียว", "View only")}</span>}
        <span className="ml-auto text-xs tabular-nums text-slate-600">{t(`${summary.pieceCount} ชิ้น · ${(summary.areaCm2 / SQFT).toFixed(2)} ตร.ฟุต · ตะเข็บ ${seams.length} แนว`, `${summary.pieceCount} pcs · ${(summary.areaCm2 / SQFT).toFixed(2)} sq ft · ${seams.length} seams`)}{badSeams ? <span className="ml-1 text-red-600">{t(`(${badSeams} แนวต้องแก้)`, `(${badSeams} need attention)`)}</span> : null}</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="min-w-[220px] flex-1 space-y-1"><span className="text-xs text-slate-500">{t("ชื่อแพทเทิร์น", "Pattern name")}</span>
          <input value={name} disabled={!canEdit} maxLength={120} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium disabled:bg-slate-50" /></label>
        <label className="w-48 space-y-1"><span className="text-xs text-slate-500">{t("รหัสรุ่น / สินค้า", "Model / product code")}</span>
          <input value={sku} disabled={!canEdit} maxLength={80} onChange={(e) => { setSku(e.target.value); setDirty(true); }} className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" /></label>
        <label className="w-40 space-y-1"><span className="text-xs text-slate-500">{t("สถานะ", "Status")}</span>
          {canEdit ? (
            <select value={status} onChange={(e) => { setStatus(e.target.value as PatternProjectStatus); setDirty(true); }} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
              {PATTERN_PROJECT_STATUSES.map((s) => <option key={s} value={s}>{t(PATTERN_STATUS_LABEL[s].th, PATTERN_STATUS_LABEL[s].en)}</option>)}
            </select>
          ) : <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${st.tone}`}>{t(st.th, st.en)}</span>}
        </label>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ขั้นตอน", "Step")}>
          {tabBtn("draw", "i:vector-bezier", t("วาดชิ้น", "Draw pieces"))}
          {tabBtn("sew", "i:needle-thread", t("เย็บ", "Sew"), badSeams)}
          {tabBtn("asm", "i:box", t("ประกอบ 3D", "Assemble 3D"))}
        </div>
        <button type="button" disabled={dirty || !pieces.length} onClick={() => window.open(`/print/pattern-project/${id}`, "_blank", "noopener")}
          title={dirty ? t("บันทึกก่อน แล้วค่อยพิมพ์ (หน้าพิมพ์ใช้ข้อมูลที่บันทึกแล้ว)", "Save first — the print page uses the saved pattern") : t("พิมพ์ขนาดจริง A4 / ดาวน์โหลดไฟล์เครื่องตัด DXF / SVG", "Print at real size on A4 / download DXF or SVG cut files")}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <Icon value="i:printer" className="text-sm" />{t("พิมพ์ / ไฟล์ตัด", "Print / cut files")}
        </button>
        {me?.can_delete && (
          <button type="button" onClick={() => setAsk("delete")} title={t("ลบแพทเทิร์นนี้", "Delete this pattern")} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600">
            <Icon value="i:trash" className="text-sm" />{t("ลบ", "Delete")}
          </button>
        )}
      </div>

      {tab === "draw" ? (
        <PatternStudio key={`board-${boardNonce}`} readonly={!canEdit} initial={initial} initialBasis={basis} onChange={onBoard} onTemplateInsert={onTemplate}
          footerNote={<span className="text-slate-400">{canEdit ? t("แก้แล้วกด บันทึก ที่แถบด้านล่าง", "Press Save in the bar below to keep your changes") : ""}</span>} />
      ) : tab === "sew" ? (
        <SewView pieces={pieces.map((p) => ({ pid: p.pid, name: p.name, shape: p.shape, holes: p.holes }))} seams={seams} onChange={onSeams} readonly={!canEdit} />
      ) : (
        <AssemblyView pieces={asmPieces} seams={seams} attaches={attaches} onGoSew={() => switchTab("sew")} onGoDraw={() => switchTab("draw")}
          onAttachesChange={canEdit ? (next) => { setAttaches(next); setTemplate((tp) => ({ ...(tp ?? {}), attach: next })); setDirty(true); } : undefined} />
      )}

      {canEdit && <SaveBar dirty={dirty} saving={saving} error={saveErr} savedAt={savedAt} onSave={save} onDiscard={() => void load()} />}

      <ConfirmDialog open={ask === "leave"} onClose={() => setAsk(null)} onConfirm={() => router.push("/pattern-studio")}
        title={t("ยังไม่ได้บันทึก", "Unsaved changes")} message={t("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?", "You have unsaved changes. Leave without saving?")}
        confirmText={t("ออกโดยไม่บันทึก", "Leave without saving")} cancelText={t("อยู่ต่อ", "Stay")} />
      <ConfirmDialog open={ask === "delete"} onClose={() => { if (!deleting) setAsk(null); }} onConfirm={() => void remove()} loading={deleting} variant="danger"
        title={t("ลบแพทเทิร์นนี้?", "Delete this pattern?")} message={t(`"${name}" จะหายจากรายการ (ผู้ดูแลระบบกู้คืนได้)`, `"${name}" will be removed from the list (an administrator can restore it)`)}
        confirmText={t("ลบแพทเทิร์น", "Delete pattern")} />
    </div>
  );
}
