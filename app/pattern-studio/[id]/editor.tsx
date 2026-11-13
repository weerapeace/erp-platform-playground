"use client";

/**
 * สตูดิโอของแพทเทิร์น 1 ใบ (แอปหลัก · เจ้าของสั่ง 2026-11-10)
 *   หัว: ชื่อ · รหัสรุ่น · สถานะ · สรุป (ชิ้น / พื้นที่ / ตะเข็บ)
 *   แท็บ "วาดชิ้น + เย็บ" = PatternStudio (กระดานวาดเดิม + แม่แบบทรง + ภาพ 3D) · เครื่องมือเย็บ (N) + แก้ตะเข็บ (B) เป็นเครื่องมือของกระดานเอง เย็บบนกระดานเดิมแบบ CLO ไม่เปลี่ยนหน้า (เจ้าของสั่ง 2026-11-10)
 *   รหัสรุ่น = เลือกจากรุ่นสินค้า (ParentSkuPicker) หรือ SKU (SkuPicker) ของกลาง — เก็บเป็นรหัส
 *   จอเดียว (เจ้าของสั่ง 2026-11-11): ภาพ 3D คู่กับกระดาน ไม่มีแท็บแยกแล้ว — "ประกอบ 3D" เดิม (AssemblyView) ย้ายไปเป็นปุ่ม แยกชิ้น / ทีละขั้น / ทิ้งตัว บนหัวช่องภาพ 3D ของ PatternStudio
 *   จุดติดหู/แผ่นหลังช่อง (จากแม่แบบ) เก็บในช่อง template: { params, attach }
 *   สร้างจากแม่แบบทรง → ได้ชิ้น + ตะเข็บตั้งต้นครบ
 *   วัสดุของชิ้น = รายชื่อวัสดุตีราคา (/api/pattern-projects/materials) · ปุ่ม "ส่งไปตีราคา" = SendCostingModal (ต้องมีสิทธิ์ดูต้นทุน)
 *   ปุ่ม "ซิป / อะไหล่" = TrimsModal — รายการของที่ไม่ใช่ชิ้นตัด เก็บใน template.trims ไปตีราคาพร้อมชิ้น (lib/pattern-trims)
 *   บันทึกอัตโนมัติ (Bag CAD รอบ A · 2026-11-12): หยุดแก้ 4 วินาที → PATCH /api/pattern-projects/<id> (SaveBar mode auto: กำลังบันทึก / บันทึกแล้ว / ไม่สำเร็จ + ลองใหม่ + ดาวน์โหลดสำรอง)
 *     ระหว่างแก้เก็บสำเนาในเครื่อง (localStorage pattern-draft:<id>) → เปิดใหม่แล้วเจอสำเนาที่ยังไม่ได้บันทึก = แถบ "กู้คืน / ทิ้ง" · บันทึกสำเร็จ = ลบสำเนา
 *     template.rev = นับครั้งที่บันทึก (หน้าพิมพ์โชว์ rev) · template.schema = รุ่นข้อมูล (lib/pattern-project PATTERN_SCHEMA) · template.settings.seamTol = ค่าคลาดตะเข็บ · template.view = ชิ้นที่ล็อก/ซ่อน
 *   ปุ่มพิมพ์ = ด่านตรวจก่อนพิมพ์ (PreflightModal · lib/pattern-check) — มีข้อสีแดงพิมพ์ได้แค่แบบร่าง (ลายน้ำ) · ไม่มีสิทธิ์แก้ = ดูอย่างเดียว
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
import type { StudioTpl, TemplateInsertInfo } from "@/components/pattern-studio";
import { buildProjectFile } from "@/lib/pattern-export";
import type { Shape } from "@/lib/pattern-shape";
import { PATTERN_PROJECT_STATUSES, PATTERN_SCHEMA, PATTERN_STATUS_LABEL, cleanColorways, cleanMatProps, cleanPieceView, cleanProjectPieces, pieceStiffness, projectSummary, type MatProps, type PatternProject, type PatternProjectStatus, type PieceViewState, type ProjectPiece } from "@/lib/pattern-project";
import type { CostingTarget } from "@/components/pattern-studio/send-costing-modal";
import { checkSeam, cleanSeams, type Seam } from "@/lib/pattern-seams";
import { cleanSeamTol } from "@/lib/pattern-check";
import type { SaveState } from "@/components/pattern-studio/preflight-modal";
import { cleanLessonRef, type CopySource } from "@/components/pattern-studio/learn-panel";
import { lessonById } from "@/lib/pattern-lessons";
import { cleanAttaches, type Attach } from "@/lib/pattern-assembly";
import { cleanTrims, openTrims, pruneTrims, type ProjectTrim } from "@/lib/pattern-trims";
import { ParentSkuPicker, SkuPicker } from "@/components/pickers";

const PatternStudio = dynamic(() => import("@/components/pattern-studio").then((m) => m.PatternStudio), { ssr: false });
const SendCostingModal = dynamic(() => import("@/components/pattern-studio/send-costing-modal").then((m) => m.SendCostingModal), { ssr: false });
const TrimsModal = dynamic(() => import("@/components/pattern-studio/trims-modal").then((m) => m.TrimsModal), { ssr: false });
const PreflightModal = dynamic(() => import("@/components/pattern-studio/preflight-modal").then((m) => m.PreflightModal), { ssr: false });
const AUTOSAVE_MS = 4000;
type DraftRec = { at: number; newer: boolean; data: Record<string, unknown> };

const SQFT = 929.03;

export function PatternProjectEditor({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<{ can_edit: boolean; can_delete: boolean; can_cost?: boolean } | null>(null);
  const [materials, setMaterials] = useState<{ id: string; name: string; group: string | null; calc?: string | null }[]>([]);   // วัสดุให้เลือกติดกับชิ้น (ชื่อ + ชนิด ไม่มีราคา)
  const [costOpen, setCostOpen] = useState(false);
  const [trims, setTrims] = useState<ProjectTrim[]>([]);   // ซิปและอะไหล่ของแพทเทิร์น (เก็บใน template.trims)
  const [trimsOpen, setTrimsOpen] = useState(false);
  const [patternNo, setPatternNo] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [status, setStatus] = useState<PatternProjectStatus>("draft");
  const [pieces, setPieces] = useState<ProjectPiece[]>([]);
  const [seams, setSeams] = useState<Seam[]>([]);
  const [basis, setBasis] = useState<"box" | "area">("box");
  const [template, setTemplate] = useState<Record<string, unknown> | null>(null);   // { params: ค่าแม่แบบล่าสุด, attach: จุดติด }
  const [attaches, setAttaches] = useState<Attach[]>([]);
  const [matProps, setMatProps] = useState<Record<string, MatProps>>({});   // ค่าของวัสดุในแพทเทิร์นใบนี้ (เก็บใน template.matProps)
  const [skuKind, setSkuKind] = useState<"parent" | "sku">("parent");
  const [boardNonce, setBoardNonce] = useState(0);        // เปลี่ยน = เปิดกระดานใหม่จากชิ้นล่าสุด (โหลดเสร็จ / กลับจากแท็บเย็บ / ละทิ้ง)
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [ask, setAsk] = useState<null | "leave" | "delete">(null);
  const [deleting, setDeleting] = useState(false);
  const piecesRef = useRef(pieces); piecesRef.current = pieces;
  const [serverAt, setServerAt] = useState<string | null>(null);   // updated_at ล่าสุดของฉบับในระบบ
  const [draftFound, setDraftFound] = useState<DraftRec | null>(null);   // สำเนาในเครื่องที่ยังไม่ได้บันทึก (เปิดใหม่แล้วเจอ)
  const [preOpen, setPreOpen] = useState(false);   // ด่านตรวจก่อนพิมพ์
  const savingRef = useRef(false);
  const draftKey = `pattern-draft:${id}`;

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
      setMatProps(cleanMatProps((p.template as { matProps?: unknown } | null)?.matProps));
      setTrims(cleanTrims((p.template as { trims?: unknown } | null)?.trims));
      setDirty(false); setSaveErr(null); setBoardNonce((n) => n + 1); setServerAt(p.updated_at ?? null);
      // สำเนาในเครื่องจากครั้งก่อน (ปิดหน้า/ล่มก่อนบันทึก) — เหมือนฉบับในระบบ = ลบทิ้งเงียบ ๆ · ต่างกัน = ถามกู้คืน
      try {
        const raw = localStorage.getItem(`pattern-draft:${id}`);
        const d = raw ? JSON.parse(raw) as { at?: number; data?: Record<string, unknown> } : null;
        if (d?.data && typeof d.at === "number") {
          const same = JSON.stringify(d.data.pieces ?? []) === JSON.stringify(p.pieces ?? []) && JSON.stringify(d.data.seams ?? []) === JSON.stringify(p.seams ?? []) && d.data.name === p.name;
          if (same) localStorage.removeItem(`pattern-draft:${id}`);
          else setDraftFound({ at: d.at, newer: Date.parse(p.updated_at) > d.at, data: d.data });
        }
      } catch { /* อ่านสำเนาไม่ได้ = ข้าม */ }
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/pattern-projects/materials").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j?.data)) setMaterials(j.data); }).catch(() => { /* โหลดไม่ได้ = ยังเลือกวัสดุไม่ได้ แต่วาดได้ตามปกติ */ });
    return () => { alive = false; };
  }, []);
  const matGroup = useMemo(() => new Map(materials.map((m) => [m.id, m.group])), [materials]);
  const matOptions = useMemo(() => materials.map((m) => ({ id: m.id, name: m.name, sub: m.group })), [materials]);

  const canEdit = !!me?.can_edit;
  const slitsOpen = useMemo(() => openTrims(trims, pieces, seams).count, [trims, pieces, seams]);
  // ชิ้นตั้งต้นของกระดาน — อ่านครั้งเดียวต่อการเปิดกระดาน (ระหว่างวาด กระดานถือข้อมูลเอง แล้วส่งกลับทาง onChange)
  const initial: EditorPiece[] = useMemo(() => piecesRef.current.map((p) => ({ pid: p.pid, shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, allowEdges: p.allowEdges, foldEdges: p.foldEdges, edgeMeta: p.edgeMeta, info: p.info, inner: p.inner, link: p.link, name: p.name, at: p.at, grain: p.grain, notches: p.notches, mats: (p.mats ?? []).map((m) => ({ id: m.id, name: m.name })) })), [boardNonce]);   // eslint-disable-line react-hooks/exhaustive-deps

  const onBoard = useCallback((res: ShapeEditorResult) => {
    setPieces(res.pieces.map((p) => ({
      pid: p.pid, name: p.name, count: p.count, allow: p.allow, ...(p.allowEdges ? { allowEdges: p.allowEdges } : {}), ...(p.foldEdges ? { foldEdges: p.foldEdges } : {}), ...(p.edgeMeta ? { edgeMeta: p.edgeMeta } : {}), ...(p.info ? { info: p.info } : {}), ...(p.inner.length ? { inner: p.inner } : {}), ...(p.link ? { link: p.link } : {}), shape: p.shape, holes: p.holes, notches: p.notches, at: p.at,
      grain: p.grain && p.grain.length === 2 ? [p.grain[0], p.grain[1]] : null,
      ...(p.mats.length ? { mats: p.mats.map((m) => { const g = matGroup.get(m.id) ?? piecesRef.current.find((q) => q.pid === p.pid)?.mats?.find((x) => x.id === m.id)?.group; return { id: m.id, name: m.name, ...(g ? { group: g } : {}) }; }) } : {}),
    })));
    setBasis(res.basis); setDirty(true);
  }, [matGroup]);
  const onTemplate = useCallback((info: TemplateInsertInfo) => {
    const stamp = Date.now().toString(36);
    const made: Seam[] = [];
    info.seams.forEach((r, i) => {
      const a = info.pidByKey[r.a.piece], b = info.pidByKey[r.b.piece];
      const side = (pid: string, x: typeof r.a) => ({ pid, from: x.from, count: x.count, n: x.n, ...(x.t0 != null && x.t1 != null ? { t0: x.t0, t1: x.t1 } : {}), ...(x.inner ? { inner: x.inner } : {}) });
      if (a && b) made.push({ id: `s${stamp}t${i}`, a: side(a, r.a), b: side(b, r.b), ...(r.kind ? { kind: r.kind } : {}) });
    });
    const att: Attach[] = [];
    info.attach.forEach((r, i) => {
      const pid = info.pidByKey[r.piece], on = info.pidByKey[r.on];
      if (pid && on) att.push({ id: `a${stamp}t${i}`, kind: r.kind, pid, on, a: r.a, b: r.b, len: r.len, w: r.w, tail: r.tail, ...(r.across ? { across: true } : {}) });
    });
    setSeams((prev) => [...prev, ...made]); setDirty(true);
    // เก็บค่าแม่แบบ + จุดติด โดยไม่ทับค่าอื่นของ template (ค่าวัสดุ · ซิป/อะไหล่ · เป้าหมายตีราคา) — เดิมทับทั้งก้อน
    setAttaches((prev) => { const next = [...prev, ...att]; setTemplate((tp) => ({ ...(tp ?? {}), ...(info.params ? { params: info.params } : {}), style: info.style, attach: next, keys: info.pidByKey, kparams: info.kparams ?? null, opts: info.opts ?? null })); return next; });   // keys/kparams/opts = อัปเดตชุดเดิมได้ (รอบ F2)
  }, []);
  const onSeams = (next: Seam[]) => { setSeams(next); setDirty(true); };
  /** ชุดแม่แบบล่าสุด (รหัสชิ้นของแม่แบบ → ชิ้นบนกระดาน) — ปุ่ม "อัปเดตชุดเดิม" ในตัวสร้างจากแม่แบบ (รอบ F2) */
  const studioTpl = useMemo<StudioTpl | null>(() => {
    const tp = template as { style?: unknown; params?: unknown; kparams?: unknown; opts?: unknown; keys?: unknown } | null;
    if (!tp || typeof tp.style !== "string" || !tp.keys || typeof tp.keys !== "object") return null;
    const keys = Object.fromEntries(Object.entries(tp.keys as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
    return { style: tp.style as StudioTpl["style"], keys, ...(tp.params && typeof tp.params === "object" ? { params: tp.params as StudioTpl["params"] } : {}), ...(tp.kparams && typeof tp.kparams === "object" ? { kparams: tp.kparams as StudioTpl["kparams"] } : {}), ...(tp.opts && typeof tp.opts === "object" ? { opts: tp.opts as StudioTpl["opts"] } : {}) };
  }, [template]);
  /** ชุดสี (รอบ G2) — เก็บใน template.colorways + template.colorway */
  const colorways = useMemo(() => cleanColorways((template as { colorways?: unknown } | null)?.colorways), [template]);
  const colorwayId = typeof (template as { colorway?: unknown } | null)?.colorway === "string" ? (template as { colorway: string }).colorway : null;

  const shapes = useMemo(() => new Map(pieces.map((p) => [p.pid, { shape: p.shape, inner: p.inner, meta: p.edgeMeta ?? null }])), [pieces]);
  const summary = useMemo(() => projectSummary(pieces, basis), [pieces, basis]);
  // จุดติดหู / ปิดหลังช่อง + ความอยู่ทรงของชิ้น — ใช้ในภาพ 3D แบบ แยกชิ้น / ทิ้งตัว (อยู่ในช่องภาพ 3D ข้างกระดาน)
  const onAttaches = useCallback((next: Attach[]) => { setAttaches(next); setTemplate((tp) => ({ ...(tp ?? {}), attach: next })); setDirty(true); }, []);
  const pieceStiff = useCallback((pid: string, fallback: number) => { const p = pieces.find((x) => x.pid === pid); return p ? pieceStiffness(p, matProps, fallback) : null; }, [pieces, matProps]);
  const seamTol = useMemo(() => cleanSeamTol((template as { settings?: { seamTol?: unknown } } | null)?.settings?.seamTol), [template]);
  const pieceView: PieceViewState = useMemo(() => cleanPieceView((template as { view?: unknown } | null)?.view, new Set(pieces.map((x) => x.pid))), [template, pieces]);
  const rev = Number((template as { rev?: unknown } | null)?.rev) || null;
  const badSeams = useMemo(() => seams.filter((s) => { const c = checkSeam(shapes, s, seamTol).status; return c === "broken" || (c === "mismatch" && !s.ease); }).length, [seams, shapes, seamTol]);
  const saveState: SaveState = saving ? "saving" : saveErr ? "failed" : dirty ? "pending" : "saved";
  // บทเรียน (รอบ C): แพทเทิร์นนี้เป็นแบบฝึก/สำเนาของบทไหน (template.lesson) · เริ่มบทใหม่ = คืนชิ้นตั้งต้น · สำเนาเพื่อเรียน = งานที่เปิดอยู่
  const lessonRef = useMemo(() => cleanLessonRef((template as { lesson?: unknown } | null)?.lesson), [template]);
  const resetLesson = () => {
    const seed = lessonRef ? lessonById(lessonRef.id)?.seed?.() : null;
    if (!seed) return;
    setPieces(seed.pieces); piecesRef.current = seed.pieces; setSeams(seed.seams); setAttaches([]);
    setTemplate((tp) => ({ ...(tp ?? {}), attach: [], view: { lock: [], hide: [] } })); setDirty(true); setBoardNonce((n) => n + 1);
  };
  const copySource = (): CopySource | null => (piecesRef.current.length ? { name: name.trim() || patternNo || "", pieces: piecesRef.current, seams, template } : null);

  // ข้อมูลล่าสุด (อ่านตอนบันทึก / เก็บสำเนา โดยไม่ต้องพึ่ง closure ของ render เก่า)
  const latest = useRef({ name, sku, status, basis, template, seams, attaches, trims });
  latest.current = { name, sku, status, basis, template, seams, attaches, trims };
  /** ก้อนที่จะบันทึก: ตัดตะเข็บ/จุดติด/ซิปของชิ้นที่ลบไปแล้ว · กรองชิ้นที่ล็อก/ซ่อนให้เหลือชิ้นที่มีอยู่ */
  const buildPayload = () => {
    const L = latest.current, pieces0 = piecesRef.current, pids = new Set(pieces0.map((p) => p.pid));
    const keep = L.seams.filter((s) => pids.has(s.a.pid) && pids.has(s.b.pid));   // ตะเข็บของชิ้นที่ลบไปแล้ว = ทิ้ง
    const keepAtt = L.attaches.filter((a) => pids.has(a.pid) && pids.has(a.on));
    const keepTrims = pruneTrims(L.trims, pieces0, keep);   // ซิปของช่องที่ลบ / ขอบที่เลิกติดซิป / กุ๊นที่ไม่เหลือขอบ = ทิ้ง
    const view = cleanPieceView((L.template as { view?: unknown } | null)?.view, pids);
    const tpl: Record<string, unknown> = { ...(L.template ?? {}), attach: keepAtt, trims: keepTrims, view };
    return { keep, keepAtt, keepTrims, tpl, body: { name: L.name.trim(), sku_code: L.sku.trim(), status: L.status, basis: L.basis, template: tpl, pieces: pieces0, seams: keep } };
  };
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ไม่เป็นไร */ } };
  /** บันทึก (auto = จากตัวจับเวลา) — ระหว่างส่งมีการแก้เพิ่ม = ยังถือว่ามีของค้าง รอบถัดไปบันทึกต่อ */
  const save = async (auto = false) => {
    if (savingRef.current) return;
    const P = buildPayload();
    if (!P.body.name) { if (!auto) setSaveErr(t("ใส่ชื่อแพทเทิร์นก่อน", "Enter a pattern name first")); return; }
    const rev = (Number((P.tpl as { rev?: unknown }).rev) || 0) + 1;
    const tplOut = { ...P.tpl, rev, schema: PATTERN_SCHEMA };
    const sent = JSON.stringify(P.body);
    savingRef.current = true; setSaving(true); setSaveErr(null);
    try {
      const res = await apiFetch(`/api/pattern-projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...P.body, template: tplOut, ...(auto ? { autosave: true } : {}) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
      if (JSON.stringify(buildPayload().body) === sent) { setSeams(P.keep); setAttaches(P.keepAtt); setTrims(P.keepTrims); setTemplate(tplOut); setDirty(false); clearDraft(); }
      else setTemplate((tp) => ({ ...(tp ?? {}), rev, schema: PATTERN_SCHEMA }));
      setSavedAt(new Date()); if (j?.data?.updated_at) setServerAt(j.data.updated_at);
    } catch (e) { setSaveErr((e as Error).message || t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const saveRef = useRef(save); saveRef.current = save;
  // บันทึกอัตโนมัติ: หยุดแก้ AUTOSAVE_MS → บันทึก · บันทึกไม่สำเร็จ = ลองเองอีกครั้งใน 20 วินาที (หรือกดลองใหม่)
  useEffect(() => {
    if (!canEdit || !dirty || loading) return;
    const tm = setTimeout(() => { void saveRef.current(true); }, saveErr ? 20000 : AUTOSAVE_MS);
    return () => clearTimeout(tm);
  }, [canEdit, dirty, loading, saveErr, name, sku, status, basis, template, pieces, seams, attaches, trims]);
  // สำเนาในเครื่องระหว่างแก้ (กันปิดหน้า/ล่ม/เน็ตหลุด) — เต็มหรือเบราว์เซอร์ปิดไว้ = ข้าม
  useEffect(() => {
    if (!canEdit || !dirty || loading) return;
    const tm = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), base: serverAt, data: buildPayload().body })); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } }, 800);
    return () => clearTimeout(tm);
  }, [canEdit, dirty, loading, name, sku, status, basis, template, pieces, seams, attaches, trims]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** กู้คืนสำเนาในเครื่อง → ทุกอย่างกลับเป็นตอนก่อนปิด แล้วบันทึกอัตโนมัติตามปกติ */
  const recoverDraft = () => {
    const d = draftFound?.data; if (!d) return;
    const pcs = cleanProjectPieces(d.pieces), pids = new Set(pcs.map((x) => x.pid));
    const tpl = d.template && typeof d.template === "object" && !Array.isArray(d.template) ? d.template as Record<string, unknown> : null;
    if (typeof d.name === "string") setName(d.name);
    setSku(typeof d.sku_code === "string" ? d.sku_code : "");
    if (PATTERN_PROJECT_STATUSES.includes(d.status as PatternProjectStatus)) setStatus(d.status as PatternProjectStatus);
    setBasis(d.basis === "area" ? "area" : "box");
    setPieces(pcs); piecesRef.current = pcs; setSeams(cleanSeams(d.seams, pids)); setTemplate(tpl);
    setAttaches(cleanAttaches(tpl?.attach, pids)); setMatProps(cleanMatProps(tpl?.matProps)); setTrims(cleanTrims(tpl?.trims));
    setDirty(true); setBoardNonce((n) => n + 1); setDraftFound(null);
  };
  const discardDraft = () => { clearDraft(); setDraftFound(null); };
  /** ไฟล์โปรเจกต์ (.json · รอบ H): ชิ้น ตะเข็บ ค่าแม่แบบ/วัสดุ/ชุดสี ครบ — นำเข้าที่หน้ารายการแพทเทิร์นได้แพทเทิร์นใหม่ */
  const exportProjectFile = () => {
    const b = buildPayload().body;
    const txt = buildProjectFile({ pattern_no: patternNo, name: b.name, sku_code: b.sku_code || null, basis: b.basis === "area" ? "area" : "box", pieces: b.pieces, seams: b.seams, template: b.template });
    const url = URL.createObjectURL(new Blob([txt], { type: "application/json" })), a = document.createElement("a");
    a.href = url; a.download = `${patternNo || "pattern"}${rev ? `-rev${rev}` : ""}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  /** รุ่นเทียบ (รอบ H): เก็บรูปชิ้นแบบย่อใน template.compareRef (จำกัดขนาด — ใหญ่เกิน = แนะนำไฟล์โปรเจกต์) */
  const compareRef = useMemo(() => {
    const c = (template as { compareRef?: { label?: unknown; pieces?: unknown } } | null)?.compareRef;
    const ps = c ? cleanProjectPieces(c.pieces) : [];
    return ps.length ? { label: typeof c?.label === "string" ? c.label : "รุ่นเทียบ", pieces: ps } : null;
  }, [template]);
  const saveCompare = (): string | null => {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const slim = (s: Shape): Shape => (s.k === "path" ? { k: "path", nodes: s.nodes.map((n) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v])) as typeof n) } : { ...s, x: r2(s.x), y: r2(s.y), w: r2(s.w), h: r2(s.h) });
    const pieces0 = piecesRef.current.map((p) => ({ pid: p.pid, name: p.name, count: p.count, allow: 0, shape: slim(p.shape), holes: (p.holes ?? []).map(slim), grain: null, notches: [], at: p.at }));
    const ref = { label: `rev ${rev ?? "-"} · ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}`, pieces: pieces0 };
    const others = JSON.stringify({ ...(template ?? {}), compareRef: undefined }).length;
    if (JSON.stringify(ref).length + others > 28000) return t("รูปชิ้นใหญ่เกินกว่าจะเก็บไว้ในแพทเทิร์น — ใช้ปุ่ม 'ไฟล์โปรเจกต์' ส่งออกรุ่นนี้เก็บไว้ แล้วเลือกไฟล์นั้นมาเทียบแทน", "The pieces are too big to keep inside the pattern — export this version with 'Project file' and compare with that file instead");
    setTemplate((tp) => ({ ...(tp ?? {}), compareRef: ref })); setDirty(true);
    return null;
  };
  const clearCompare = () => { setTemplate((tp) => { const { compareRef: _c, ...rest } = tp ?? {}; void _c; return rest; }); setDirty(true); };
  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify({ kind: "pattern-project-backup", id, pattern_no: patternNo, at: new Date().toISOString(), ...buildPayload().body }, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `${patternNo || "pattern"}-backup.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        <div className="w-80 max-w-full space-y-1"><span className="text-xs text-slate-500">{t("รหัสรุ่น / สินค้า", "Model / product code")}</span>
          {sku ? (
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-sm">
              <Icon value="i:tag" className="text-slate-400" /><span className="min-w-0 flex-1 truncate font-medium">{sku}</span>
              {canEdit && <button type="button" onClick={() => { setSku(""); setDirty(true); }} title={t("เอารหัสออก เพื่อเลือกใหม่", "Remove to pick another")} aria-label={t("เอารหัสออก", "Remove code")} className="text-slate-400 hover:text-red-600"><Icon value="i:x" /></button>}
            </div>
          ) : canEdit ? (
            <div className="flex items-center gap-1.5">
              <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("เลือกจาก", "Pick from")}>
                {(["parent", "sku"] as const).map((k) => <button key={k} type="button" onClick={() => setSkuKind(k)} aria-pressed={skuKind === k} className={`h-8 rounded-md px-2 text-xs ${skuKind === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{k === "parent" ? t("รุ่น", "Model") : "SKU"}</button>)}
              </div>
              <div className="min-w-0 flex-1">{skuKind === "parent"
                ? <ParentSkuPicker value={null} disableCreate placeholder={t("ค้นหารุ่นสินค้า…", "Search models…")} onChange={(v) => { if (v?.code) { setSku(v.code); setDirty(true); } }} />
                : <SkuPicker value={null} placeholder={t("ค้นหา SKU…", "Search SKUs…")} onChange={(v) => { if (v?.code) { setSku(v.code); setDirty(true); } }} />}</div>
            </div>
          ) : <div className="flex h-9 items-center px-1 text-sm text-slate-400">—</div>}
        </div>
        <label className="w-40 space-y-1"><span className="text-xs text-slate-500">{t("สถานะ", "Status")}</span>
          {canEdit ? (
            <select value={status} onChange={(e) => { setStatus(e.target.value as PatternProjectStatus); setDirty(true); }} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
              {PATTERN_PROJECT_STATUSES.map((s) => <option key={s} value={s}>{t(PATTERN_STATUS_LABEL[s].th, PATTERN_STATUS_LABEL[s].en)}</option>)}
            </select>
          ) : <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${st.tone}`}>{t(st.th, st.en)}</span>}
        </label>
        <button type="button" data-open-preflight disabled={!pieces.length} onClick={() => setPreOpen(true)}
          title={t("ตรวจแบบก่อน แล้วพิมพ์ขนาดจริง A4 / ดาวน์โหลดไฟล์เครื่องตัด DXF / SVG", "Check first, then print at real size on A4 / download DXF or SVG cut files")}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <Icon value="i:printer" className="text-sm" />{t("ใบสเปก / พิมพ์ / ไฟล์ตัด", "Spec sheet / print / cut files")}
        </button>
        <button type="button" data-export-project onClick={exportProjectFile} disabled={!pieces.length}
          title={t("ส่งออกไฟล์โปรเจกต์ (.json) — ชิ้น ตะเข็บ ค่าวัสดุ ชุดสี ครบ · นำเข้าที่หน้ารายการได้แพทเทิร์นใหม่ / ใช้เทียบรุ่น", "Export the project file (.json) — pieces, seams, materials, colourways · import on the list page for a new pattern / use to compare versions")}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <Icon value="i:download" className="text-sm" />{t("ไฟล์โปรเจกต์", "Project file")}
        </button>
        <button type="button" onClick={() => setTrimsOpen(true)} data-trims-open
          title={t("ซิป กุ๊น สาย/เทป ห่วง ล็อก หมุด — ของที่ไม่ใช่ชิ้นตัด ใส่จำนวนต่อกระเป๋า 1 ใบ แล้วไปตีราคาพร้อมชิ้น", "Zips, tapes, rings, locks, rivets — enter the amount per bag; they go to costing with the pieces")}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50">
          <Icon value="i:link" className="text-sm" />{t("ซิป / อะไหล่", "Zips / hardware")}
          {trims.length > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">{trims.length}</span>}
          {slitsOpen > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] text-amber-800" title={t(`${slitsOpen} รายการ (ช่องซิป / ขอบติดซิป / กุ๊น / อะไหล่บนชิ้น) ยังไม่เลือกวัสดุ`, `${slitsOpen} items (zip slits / zip edges / binding / placed hardware) have no material yet`)}>{t(`ขาด ${slitsOpen}`, `${slitsOpen} missing`)}</span>}
        </button>
        {me?.can_cost && (
          <button type="button" disabled={dirty || !pieces.length} onClick={() => setCostOpen(true)}
            title={dirty ? t("บันทึกก่อน แล้วค่อยส่ง (ส่งจากข้อมูลที่บันทึกแล้ว)", "Save first — sending uses the saved pattern") : t("ส่งชิ้นไปเป็นบรรทัดตีราคาของใบงานออกแบบ", "Send the pieces to a design sheet's costing lines")}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40">
            <Icon value="i:calculator" className="text-sm" />{t("ส่งไปตีราคา", "Send to costing")}
          </button>
        )}
        {me?.can_delete && (
          <button type="button" onClick={() => setAsk("delete")} title={t("ลบแพทเทิร์นนี้", "Delete this pattern")} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600">
            <Icon value="i:trash" className="text-sm" />{t("ลบ", "Delete")}
          </button>
        )}
      </div>

      {draftFound && canEdit && (
        <div data-draft-banner className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Icon value="i:history" className="text-sm" />
          <span className="min-w-0 flex-1">{t(`พบงานที่ยังไม่ได้บันทึกจากครั้งก่อน (${new Date(draftFound.at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })})${draftFound.newer ? " — ฉบับในระบบถูกบันทึกทีหลังสำเนานี้ ถ้ากู้คืน ฉบับในระบบจะถูกแทนด้วยสำเนา" : ""}`, `Found unsaved work from last time (${new Date(draftFound.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })})${draftFound.newer ? " — the saved version is newer than this copy; recovering replaces it" : ""}`)}</span>
          <button type="button" data-draft-recover onClick={recoverDraft} className="h-7 rounded-md border border-amber-300 bg-white px-2.5 text-amber-900 hover:bg-amber-100">{t("กู้คืน", "Recover")}</button>
          <button type="button" data-draft-discard onClick={discardDraft} className="h-7 rounded-md px-2.5 text-amber-800 hover:bg-amber-100">{t("ทิ้ง", "Discard")}</button>
        </div>
      )}
      <PatternStudio key={`board-${boardNonce}`} imageName={`${patternNo ?? ""} ${name}`.trim() || undefined} readonly={!canEdit} initial={initial} initialBasis={basis} onChange={onBoard} onTemplateInsert={onTemplate} materials={matOptions}
        sew={{ seams, onChange: onSeams, attaches, onAttachesChange: canEdit ? onAttaches : undefined, pieceStiff,
          tol: seamTol, onTolChange: canEdit ? (v) => { setTemplate((tp) => ({ ...(tp ?? {}), settings: { ...((tp?.settings as Record<string, unknown> | undefined) ?? {}), seamTol: v } })); setDirty(true); } : undefined,
          view: pieceView, onViewChange: canEdit ? (next) => { setTemplate((tp) => ({ ...(tp ?? {}), view: next })); setDirty(true); } : undefined,
          lesson: lessonRef, lessonName: `${patternNo ?? ""} ${name}`.trim(), onLessonReset: canEdit ? resetLesson : undefined, copySource: lessonRef ? undefined : copySource, canLearn: canEdit,
          tpl: studioTpl, onTplUpdate: canEdit ? (next) => { setTemplate((tp) => ({ ...(tp ?? {}), ...next })); setDirty(true); } : undefined,
          colorways, colorway: colorwayId, onColorways: canEdit ? (list, active) => { setTemplate((tp) => ({ ...(tp ?? {}), colorways: list, colorway: active })); setDirty(true); } : undefined,
          compareRef, onSaveCompare: canEdit ? saveCompare : undefined, onClearCompare: canEdit ? clearCompare : undefined }} pieceInfoFields matProps={matProps}
        onMatPropsChange={canEdit ? (next) => { setMatProps(next); setTemplate((tp) => ({ ...(tp ?? {}), matProps: next })); setDirty(true); } : undefined}
        footerNote={<span className="text-slate-400">{canEdit ? t("บันทึกอัตโนมัติหลังหยุดแก้ 4 วินาที · Ctrl+Z ย้อนได้ทั้งชิ้นและตะเข็บ", "Saves automatically 4 seconds after you stop · Ctrl+Z undoes pieces and seams") : ""}</span>} />

      {(() => { const c = (template as { costing?: CostingTarget } | null)?.costing; return c?.code ? (
        <p className="text-xs text-slate-500">{t(`ส่งตีราคาล่าสุด: ${c.code} ${c.name ?? ""}${c.parent_code ? ` · แท็บ ${c.parent_code}` : ""}`, `Last sent to costing: ${c.code} ${c.name ?? ""}${c.parent_code ? ` · tab ${c.parent_code}` : ""}`)} · <a className="text-blue-700 hover:underline" href={`/master/design-sheets?open=${c.sheet_id}`} target="_blank" rel="noopener">{t("เปิดใบงาน", "Open sheet")}</a></p>
      ) : null; })()}
      {trimsOpen && <TrimsModal open onClose={() => setTrimsOpen(false)} pieces={pieces} seams={seams} trims={trims} materials={materials} readonly={!canEdit}
        onChange={(next) => { setTrims(next); setTemplate((tp) => ({ ...(tp ?? {}), trims: next })); setDirty(true); }} />}
      {costOpen && <SendCostingModal open onClose={() => setCostOpen(false)} projectId={id} last={(template as { costing?: CostingTarget } | null)?.costing ?? null} onSent={(tpl) => setTemplate(tpl)} />}

      {canEdit && <SaveBar mode="auto" dirty={dirty} saving={saving} error={saveErr} savedAt={savedAt} onSave={() => save(false)} note={rev ? `rev ${rev}` : undefined}
        extra={saveErr ? <button type="button" data-backup onClick={downloadBackup} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{t("ดาวน์โหลดสำรอง", "Download a backup")}</button> : undefined} />}
      {preOpen && <PreflightModal open onClose={() => setPreOpen(false)} pieces={pieces} seams={seams} tol={seamTol} saveState={saveState} rev={rev} onSaveNow={() => void save(false)}
        onPrint={(draft) => { setPreOpen(false); window.open(`/print/pattern-project/${id}${draft ? "?draft=1" : ""}`, "_blank", "noopener"); }} />}

      <ConfirmDialog open={ask === "leave"} onClose={() => setAsk(null)} onConfirm={() => router.push("/pattern-studio")}
        title={t("ยังไม่ได้บันทึก", "Unsaved changes")} message={t("คุณมีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกโดยไม่บันทึกหรือไม่?", "You have unsaved changes. Leave without saving?")}
        confirmText={t("ออกโดยไม่บันทึก", "Leave without saving")} cancelText={t("อยู่ต่อ", "Stay")} />
      <ConfirmDialog open={ask === "delete"} onClose={() => { if (!deleting) setAsk(null); }} onConfirm={() => void remove()} loading={deleting} variant="danger"
        title={t("ลบแพทเทิร์นนี้?", "Delete this pattern?")} message={t(`"${name}" จะหายจากรายการ (ผู้ดูแลระบบกู้คืนได้)`, `"${name}" will be removed from the list (an administrator can restore it)`)}
        confirmText={t("ลบแพทเทิร์น", "Delete pattern")} />
    </div>
  );
}
