"use client";

/**
 * แม่แบบเอกสาร (Report Template Designer) — หน้าเรียบ 3 ช่อง
 *   ซ้าย  = รายการแม่แบบ จัดกลุ่มตามเอกสาร + ค้นหา (จุดสี = สถานะ)
 *   กลาง  = พรีวิวกระดาษ: ข้อมูลตัวอย่าง | เอกสารจริง (หน้าพิมพ์จริงใน iframe) | เทียบเวอร์ชัน · แบบลากวาง = ตัวออกแบบ pdfme
 *   ขวา   = แผงแก้: ตั้งค่า (+ ใช้พิมพ์ที่) · ใส่ข้อมูล · ตาราง · โค้ด · ประวัติ
 *
 * กติกาบันทึก (กันหน้าพิมพ์จริงพัง — หน้าพิมพ์เลือกแม่แบบจาก active / is_default / template_key ดู lib/report-usage):
 *   "บันทึก"      = เก็บเนื้อหา คงสถานะเดิม (แม่แบบที่ใช้งานอยู่ ยังใช้งานต่อ) · server เก็บสำเนาของเดิมไว้ในประวัติ
 *   "ใช้งานจริง"  = เฉพาะร่าง → active + ค่าหลักของเอกสารนั้น (ถามก่อน บอกว่าจะแทนใบไหน)
 *   "เก็บเข้าคลัง" = เลิกใช้ (ถามก่อน ถ้ากำลังใช้งานอยู่)
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { askConfirm, askLeaveUnsaved } from "@/components/modal/ask-dialog";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { Icon } from "@/components/icon";
import { Popover } from "@/components/popover";
import { PrintFrame } from "@/components/report";
import { PdfmeDesigner, PdfmeFieldHint, blankPdfmeJson, isPdfmeJson, openPdfmeSample } from "@/components/pdfme-designer";
import { useReportUnsaved } from "@/components/save-bar";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { buildReportHtml } from "@/lib/template";
import { setTemplatePreview } from "@/lib/report-template-preview";
import { previewUsageFor } from "@/lib/report-usage";
import {
  DEFAULT_QUOTATION_TEMPLATE,
  DEFAULT_REPORT_CSS,
  DEFAULT_WORKORDER_TEMPLATE,
  REPORT_ENTITY_OPTIONS,
  buildDesignerDescription,
  buildTableHtml,
  fieldToken,
  getReportEntityDef,
  hasReportEntityDef,
  inferTemplateStatus,
  parseDesignerDescription,
  reportEntityLabel,
  statusLabel,
  type ReportTableColumnDef,
  type TemplateStatus,
} from "@/lib/report-designer";
import type { ReportTemplateRow, ReportTemplatesResponse } from "@/app/api/admin/report-templates/route";
import { HistoryList, Note, RealDocPicker, UsageList, type SampleDoc, type TemplateVersion } from "./_parts";

type EditorTarget = "header_html" | "body_html" | "footer_html" | "custom_css";
type PanelTab = "settings" | "fields" | "table" | "code" | "history";
type PreviewMode = "sample" | "real";
type DraftTemplate = ReportTemplateRow & { description_note?: string };

const TARGET_LABEL: Record<EditorTarget, string> = {
  header_html: "หัวเอกสาร",
  body_html: "เนื้อหา",
  footer_html: "ท้ายเอกสาร",
  custom_css: "CSS",
};
const INSERT_TARGETS: EditorTarget[] = ["header_html", "body_html", "footer_html"];

const HTML_TABS: { key: PanelTab; label: string }[] = [
  { key: "settings", label: "ตั้งค่า" },
  { key: "fields", label: "ข้อมูล" },
  { key: "table", label: "ตาราง" },
  { key: "code", label: "โค้ด" },
  { key: "history", label: "ประวัติ" },
];
const PDFME_TABS: { key: PanelTab; label: string }[] = [
  { key: "settings", label: "ตั้งค่า" },
  { key: "history", label: "ประวัติ" },
];

const STATUS_DOT: Record<TemplateStatus, string> = {
  published: "bg-emerald-500",
  draft: "bg-amber-400",
  archived: "bg-slate-300",
};

const PAPER_W = { portrait: 794, landscape: 1123 } as const;
const paperW = (o: string) => (o === "landscape" ? PAPER_W.landscape : PAPER_W.portrait);

function starterTemplate(entityType: string) {
  if (entityType === "qt") return DEFAULT_QUOTATION_TEMPLATE;
  if (entityType === "wo") return DEFAULT_WORKORDER_TEMPLATE;
  return {
    header_html: `<div class="doc-title">${reportEntityLabel(entityType)}</div>`,
    body_html: "",
    footer_html: "",
    custom_css: DEFAULT_REPORT_CSS,
  };
}

function newTemplate(entityType: string, actor?: string, pdfmeJson?: string) {
  const tpl = pdfmeJson
    ? { header_html: "", body_html: pdfmeJson, footer_html: "", custom_css: "" }
    : starterTemplate(entityType);
  return {
    entity_type: entityType,
    template_key: `${entityType}_${pdfmeJson ? "pdfme" : "custom"}_${Date.now()}`,
    label: `${reportEntityLabel(entityType)} (${pdfmeJson ? "ลากวาง" : "ร่างใหม่"})`,
    description: buildDesignerDescription({ status: "draft", version: 1, updated_by: actor ?? null }, ""),
    paper_size: "A4" as const,
    orientation: "portrait" as const,
    ...tpl,
    is_default: false,
    active: false,
    actor,
  };
}

function normalizeDraft(row: ReportTemplateRow): DraftTemplate {
  return { ...row, description_note: parseDesignerDescription(row.description).note };
}

/** mode "keep" = คง active/is_default เดิมของแถวนี้ (แก้เนื้อหาอย่างเดียว) */
function preparePayload(draft: DraftTemplate, mode: "keep" | TemplateStatus, actor?: string) {
  const current = parseDesignerDescription(draft.description).meta;
  const status: TemplateStatus = mode === "keep" ? inferTemplateStatus(draft) : mode;
  return {
    ...draft,
    description: buildDesignerDescription({
      ...current,
      status,
      version: Number(current.version || 1),
      updated_by: actor ?? current.updated_by ?? null,
    }, draft.description_note ?? ""),
    active: mode === "keep" ? draft.active : status === "published",
    is_default: mode === "keep" ? draft.is_default : status === "published",
    actor,
  };
}

/** หน่วงค่า — พรีวิวใช้ srcDoc เปลี่ยนทีโหลดใหม่ทั้งใบ ถ้าไม่หน่วงจะกระพริบตอนพิมพ์ */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminReportTemplatesPage() {
  const canView = usePermission("reports.view");
  const canEdit = usePermission("admin.reports");
  const { user } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState<ReportTemplateRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportTemplateRow | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<PanelTab>("settings");
  const [target, setTarget] = useState<EditorTarget>("body_html");
  const [fieldQuery, setFieldQuery] = useState("");
  const [previewMax, setPreviewMax] = useState(false);
  const [tableKey, setTableKey] = useState("lines");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("sample");
  const [realDoc, setRealDoc] = useState<SampleDoc | null>(null);
  const [compare, setCompare] = useState<TemplateVersion | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [designerKey, setDesignerKey] = useState(0);   // เปลี่ยน = เปิดตัวลากวางใหม่ (ย้อนเวอร์ชัน)
  // ตำแหน่งเคอร์เซอร์ล่าสุดในช่องโค้ด → กด field แล้วแทรกตรงนั้น (ไม่งั้นต่อท้าย)
  const cursorRef = useRef<{ target: EditorTarget; pos: number } | null>(null);

  useReportUnsaved(dirty);

  const entityType = draft?.entity_type ?? "qt";
  const hasDef = hasReportEntityDef(entityType);
  const entityDef = getReportEntityDef(entityType);
  const tableDef = entityDef.tables.find(t => t.key === tableKey) ?? entityDef.tables[0];
  const isPdfme = isPdfmeJson(draft?.body_html);
  const realUsage = draft ? previewUsageFor(draft) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates");
      const json: ReportTemplatesResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.data);
      setSelectedId(prev => prev ?? json.data[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดแม่แบบไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canView) void load(); }, [canView, load]);

  useEffect(() => {
    const current = items.find(item => item.id === selectedId);
    setDraft(current ? normalizeDraft(current) : null);
    setDirty(false);
    setCompare(null);
    cursorRef.current = null;
  }, [items, selectedId]);

  useEffect(() => {
    const first = getReportEntityDef(entityType).tables[0];
    setTableKey(first?.key ?? "lines");
    setSelectedColumns(first?.columns.map(col => col.key) ?? []);
    setRealDoc(null);
  }, [entityType]);

  // แท็บที่ไม่มีในโหมดลากวาง → กลับไปตั้งค่า
  useEffect(() => {
    if (isPdfme && !PDFME_TABS.some(t => t.key === tab)) setTab("settings");
  }, [isPdfme, tab]);

  const previewSource = useMemo(() => {
    if (!draft || isPdfme) return "";
    return buildReportHtml({
      paper_size: draft.paper_size,
      orientation: draft.orientation,
      header_html: draft.header_html,
      body_html: draft.body_html,
      footer_html: draft.footer_html,
      custom_css: draft.custom_css,
    }, hasDef ? entityDef.sampleData : {});
  }, [draft, isPdfme, hasDef, entityDef.sampleData]);
  const previewHtml = useDebounced(previewSource, 250);

  const compareHtml = useMemo(() => {
    if (!draft || !compare) return "";
    const s = compare.snapshot;
    return buildReportHtml({
      paper_size: (s.paper_size as ReportTemplateRow["paper_size"]) ?? draft.paper_size,
      orientation: (s.orientation as ReportTemplateRow["orientation"]) ?? draft.orientation,
      header_html: s.header_html ?? "",
      body_html: s.body_html ?? "",
      footer_html: s.footer_html ?? "",
      custom_css: s.custom_css ?? "",
    }, hasDef ? entityDef.sampleData : {});
  }, [compare, draft, hasDef, entityDef.sampleData]);

  // พรีวิวเอกสารจริง: ฝากแม่แบบที่กำลังแก้ไว้ให้หน้าพิมพ์ใน iframe หยิบไปใช้ (lib/report-template-preview) · รีโหลดเมื่อหยุดแก้ 1 วิ
  const realStamp = useDebounced(previewMode === "real" && draft ? `${draft.id}|${draft.header_html}|${draft.body_html}|${draft.footer_html}|${draft.custom_css}|${draft.paper_size}|${draft.orientation}` : "", 1000);
  useEffect(() => {
    if (previewMode !== "real" || !draft) { setTemplatePreview(null); return; }
    setTemplatePreview({
      id: draft.id,
      base_id: parseDesignerDescription(draft.description).meta.base_template_id ?? null,
      entity_type: draft.entity_type, template_key: draft.template_key, label: draft.label,
      paper_size: draft.paper_size, orientation: draft.orientation,
      header_html: draft.header_html, body_html: draft.body_html, footer_html: draft.footer_html, custom_css: draft.custom_css,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- อัปเดตตามจังหวะหน่วง (realStamp)
  }, [realStamp, previewMode]);
  useEffect(() => () => setTemplatePreview(null), []);

  const groupsMemo = useMemo(() => {
    const q = query.trim().toLowerCase();
    let archived = 0;
    const map = new Map<string, ReportTemplateRow[]>();
    for (const item of items) {
      const status = inferTemplateStatus(item);
      if (status === "archived") { archived++; if (!showArchived) continue; }
      const group = reportEntityLabel(item.entity_type);
      if (q && !`${item.label} ${group}`.toLowerCase().includes(q)) continue;
      map.set(group, [...(map.get(group) ?? []), item]);
    }
    const rank = (r: ReportTemplateRow) => (r.is_default ? 0 : r.active ? 1 : 2);
    const list = [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "th"))
      .map(([label, rows]) => ({ label, rows: rows.sort((a, b) => rank(a) - rank(b)) }));
    return { groups: list, archivedCount: archived };
  }, [items, query, showArchived]);
  const { groups, archivedCount } = groupsMemo;

  const filteredFields = useMemo(() => {
    const q = fieldQuery.trim().toLowerCase();
    const grouped: Record<string, typeof entityDef.fields> = {};
    for (const f of entityDef.fields) {
      if (q && !`${f.label} ${f.key}`.toLowerCase().includes(q)) continue;
      (grouped[f.group] ??= []).push(f);
    }
    return Object.entries(grouped);
  }, [entityDef, fieldQuery]);

  if (!canView) return <PlaygroundShell><AccessDenied /></PlaygroundShell>;

  const status = draft ? inferTemplateStatus(draft) : "draft";
  const tabs = isPdfme ? PDFME_TABS : HTML_TABS;
  const insertInto: EditorTarget = target === "custom_css" ? "body_html" : target;

  const update = (patch: Partial<DraftTemplate>) => {
    setDraft(prev => prev ? { ...prev, ...patch } : prev);
    setDirty(true);
  };

  const insertText = (text: string, into: EditorTarget = target) => {
    if (!draft || !canEdit) return;
    const value = draft[into] ?? "";
    const cur = cursorRef.current;
    if (cur && cur.target === into && cur.pos <= value.length) {
      update({ [into]: value.slice(0, cur.pos) + text + value.slice(cur.pos) } as Partial<DraftTemplate>);
      cursorRef.current = { target: into, pos: cur.pos + text.length };
    } else {
      update({ [into]: `${value}${value.endsWith("\n") || value.length === 0 ? "" : "\n"}${text}` } as Partial<DraftTemplate>);
    }
    toast.success(`ใส่ใน${TARGET_LABEL[into]}แล้ว`);
  };

  const save = async (mode: "keep" | TemplateStatus, okMsg: string) => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preparePayload(draft, mode, user?.name)),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success(okMsg);
      setDirty(false);
      setHistoryKey(k => k + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!draft) return;
    const replacing = items.find(i => i.id !== draft.id && i.entity_type === draft.entity_type && i.is_default);
    const ok = await askConfirm({
      title: "ใช้แม่แบบนี้พิมพ์จริง?",
      message: replacing
        ? `"${draft.label}" จะเป็นแม่แบบหลักของ${reportEntityLabel(draft.entity_type)} แทน "${replacing.label}" — ใบเดิมยังอยู่ กลับไปใช้ได้`
        : `"${draft.label}" จะเป็นแม่แบบหลักของ${reportEntityLabel(draft.entity_type)}`,
      confirmText: "ใช้งานจริง",
      cancelText: "ยกเลิก",
    });
    if (ok) await save("published", "ใช้งานจริงแล้ว");
  };

  const archive = async () => {
    if (!draft) return;
    if (draft.active) {
      const ok = await askConfirm({
        title: "เก็บแม่แบบนี้?",
        message: `"${draft.label}" กำลังใช้พิมพ์อยู่ — ถ้าเก็บ หน้าพิมพ์${reportEntityLabel(draft.entity_type)}จะไปใช้แม่แบบอื่นแทน`,
        confirmText: "เก็บเข้าคลัง",
        cancelText: "ยกเลิก",
        variant: "danger",
      });
      if (!ok) return;
    }
    await save("archived", "เก็บเข้าคลังแล้ว");
  };

  const postNew = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/report-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success(okMsg);
      await load();
      setSelectedId(json.data?.id ?? null);
      setTab("settings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const confirmLeave = async () => !dirty || await askLeaveUnsaved();

  const createNew = async (type: string, pdfme = false) => {
    if (!(await confirmLeave())) return;
    const json = pdfme ? await blankPdfmeJson() : undefined;
    await postNew(newTemplate(type, user?.name, json), pdfme ? "สร้างแม่แบบลากวางแล้ว" : "สร้างร่างใหม่แล้ว");
  };

  const duplicateVersion = async () => {
    if (!draft) return;
    const nextVersion = Number(parseDesignerDescription(draft.description).meta.version || 1) + 1;
    await postNew({
      ...draft,
      id: undefined,
      template_key: `${draft.template_key}_v${nextVersion}_${Date.now()}`,
      label: `${draft.label} v${nextVersion}`,
      description: buildDesignerDescription({
        status: "draft", version: nextVersion, base_template_id: draft.id, updated_by: user?.name ?? null,
      }, draft.description_note ?? ""),
      active: false,
      is_default: false,
      actor: user?.name,
    }, "คัดลอกเป็นร่างเวอร์ชันใหม่แล้ว — แก้ได้โดยไม่กระทบใบที่ใช้อยู่");
  };

  const remove = async (row: ReportTemplateRow) => {
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/report-templates?id=${row.id}&actor=${encodeURIComponent(user?.name ?? "")}`, { method: "DELETE" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      toast.success("ลบแม่แบบแล้ว");
      setSelectedId(items.find(item => item.id !== row.id)?.id ?? null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setDeleteTarget(null);
    }
  };

  const restoreVersion = async (v: TemplateVersion) => {
    if (dirty && !(await askConfirm({
      title: "แทนที่งานที่ยังไม่บันทึก?",
      message: "งานที่แก้ค้างอยู่จะถูกแทนด้วยเวอร์ชันที่เลือก",
      confirmText: "แทนที่", cancelText: "ยกเลิก", variant: "danger",
    }))) return;
    const s = v.snapshot;
    update({
      label: s.label ?? draft?.label ?? "",
      paper_size: (s.paper_size as ReportTemplateRow["paper_size"]) ?? draft?.paper_size,
      orientation: (s.orientation as ReportTemplateRow["orientation"]) ?? draft?.orientation,
      header_html: s.header_html ?? "", body_html: s.body_html ?? "", footer_html: s.footer_html ?? "", custom_css: s.custom_css ?? "",
    });
    setCompare(null);
    setDesignerKey(k => k + 1);
    toast.info("โหลดเวอร์ชันเก่ามาแล้ว — กด \"บันทึก\" เพื่อใช้ (ตอนนี้ยังไม่บันทึก)");
  };

  const pick = async (id: string) => {
    if (id === selectedId || !(await confirmLeave())) return;
    setSelectedId(id);
  };

  const toggleColumn = (key: string) =>
    setSelectedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const moveColumn = (key: string, dir: -1 | 1) => setSelectedColumns(prev => {
    const i = prev.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // คอลัมน์ที่เลือก (ตามลำดับที่จัด) ขึ้นก่อน ตามด้วยที่ยังไม่เลือก
  const orderedColumns: ReportTableColumnDef[] = tableDef
    ? [
        ...selectedColumns.map(k => tableDef.columns.find(c => c.key === k)).filter((c): c is ReportTableColumnDef => !!c),
        ...tableDef.columns.filter(c => !selectedColumns.includes(c.key)),
      ]
    : [];

  const realSrc = realUsage && realDoc ? realUsage.path.replace(":id", encodeURIComponent(realDoc.id)) : null;

  return (
    <PlaygroundShell>
      <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
        {/* ── หัวหน้า ── */}
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-slate-800">แม่แบบเอกสาร</h1>
            <p className="mt-0.5 text-sm text-slate-500">ออกแบบหน้าตาเอกสารที่พิมพ์ — แก้แล้วกดบันทึก ระบบเก็บของเดิมไว้ย้อนได้</p>
          </div>
          {canEdit && draft && (
            <div className="flex items-center gap-2">
              <span className={`text-xs ${dirty ? "text-amber-600" : "text-slate-400"}`}>
                {saving ? "กำลังบันทึก…" : dirty ? "● ยังไม่บันทึก" : "บันทึกแล้ว"}
              </span>
              <button type="button" onClick={() => void save("keep", "บันทึกแล้ว")} disabled={!dirty || saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                <Icon name="save" /> บันทึก
              </button>
              {status !== "published" && (
                <button type="button" onClick={() => void publish()} disabled={saving}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                  ใช้งานจริง
                </button>
              )}
            </div>
          )}
        </header>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <Icon name="warning" /> {error}
          </div>
        )}

        <div className={`grid grid-cols-1 gap-4 lg:h-[calc(100vh-10rem)] lg:min-h-[560px] ${isPdfme ? "lg:grid-cols-[220px_minmax(0,1fr)_260px]" : "lg:grid-cols-[250px_minmax(0,1fr)_340px]"}`}>
          {/* ── ซ้าย: รายการแม่แบบ ── */}
          <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 p-2.5">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" size={14} /></span>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาแม่แบบ"
                  className="h-8 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-sm focus:border-blue-400 focus:outline-none" />
              </div>
              {canEdit && (
                <Popover align="right" panelClassName="w-72 p-1"
                  trigger={(toggle) => (
                    <button type="button" onClick={toggle} disabled={saving} title="สร้างแม่แบบใหม่"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                      <Icon name="add" size={16} />
                    </button>
                  )}>
                  {(close) => (
                    <div>
                      <p className="px-2.5 py-1.5 text-[11px] font-medium text-slate-400">สร้างร่างใหม่สำหรับ…</p>
                      {REPORT_ENTITY_OPTIONS.map(o => (
                        <button key={o.value} type="button" onClick={() => { close(); void createNew(o.value); }}
                          className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                          {o.label}
                        </button>
                      ))}
                      <div className="my-1 border-t border-slate-100" />
                      <button type="button" onClick={() => { close(); void createNew("wo", true); }}
                        className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                        ใบสั่งงานผลิต — แบบลากวาง
                        <span className="block text-[11px] text-slate-400">ลากช่องวางบนกระดาษ ไม่ต้องเขียนโค้ด</span>
                      </button>
                    </div>
                  )}
                </Popover>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-1.5">
              {loading ? (
                <div className="space-y-1.5 p-1">{[0, 1, 2, 3].map(i => <div key={i} className="h-9 animate-pulse rounded-md bg-slate-100" />)}</div>
              ) : groups.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">{query ? "ไม่พบแม่แบบที่ค้นหา" : "ยังไม่มีแม่แบบ"}</p>
              ) : groups.map(g => (
                <div key={g.label} className="mb-2">
                  <p className="truncate px-2 pb-0.5 pt-1.5 text-[11px] font-medium text-slate-400">{g.label}</p>
                  {g.rows.map(item => {
                    const st = inferTemplateStatus(item);
                    const active = selectedId === item.id;
                    return (
                      <button key={item.id} type="button" onClick={() => void pick(item.id)} title={item.template_key}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"} ${st === "archived" ? "opacity-60" : ""}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[st]}`} title={statusLabel(st)} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {isPdfmeJson(item.body_html) && <span className="shrink-0 text-[10px] text-violet-500">ลากวาง</span>}
                        {item.is_default && <span className="shrink-0 text-[10px] text-slate-400">หลัก</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-2.5">
                <span className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT.published}`} />ใช้งาน</span>
                <span className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT.draft}`} />ร่าง</span>
              </span>
              {archivedCount > 0 && (
                <button type="button" onClick={() => setShowArchived(v => !v)} className="hover:text-slate-600">
                  {showArchived ? "ซ่อนที่เก็บ" : `ที่เก็บแล้ว (${archivedCount})`}
                </button>
              )}
            </div>
          </aside>

          {/* ── กลาง: พรีวิว / ตัวลากวาง ── */}
          <section className="flex min-h-[480px] flex-col rounded-xl border border-slate-200 bg-slate-100 lg:min-h-0">
            {!draft ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">เลือกแม่แบบทางซ้าย</div>
            ) : isPdfme ? (
              <>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-500"><span className="font-medium text-slate-700">{draft.label}</span> · แบบลากวาง</p>
                  <button type="button" onClick={() => void openPdfmeSample(draft.body_html).catch(e => toast.error(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ"))}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
                    <Icon name="document" /> PDF ตัวอย่าง
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden border-t border-slate-200 bg-white">
                  <PdfmeDesigner key={`${draft.id}:${designerKey}`} value={draft.body_html}
                    onChange={json => { if (canEdit) update({ body_html: json }); }} />
                </div>
                <div className="px-3 pb-3"><PdfmeFieldHint /></div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <Segmented value={compare ? "compare" : previewMode}
                    options={[{ value: "sample", label: "ข้อมูลตัวอย่าง" }, { value: "real", label: "เอกสารจริง" }, ...(compare ? [{ value: "compare", label: "เทียบเวอร์ชัน" }] : [])]}
                    onChange={v => { if (v === "compare") return; setCompare(null); setPreviewMode(v as PreviewMode); }} />
                  {previewMode === "real" && !compare && realUsage && (
                    <RealDocPicker entityType={draft.entity_type} value={realDoc} onPick={setRealDoc} />
                  )}
                  <span className="flex-1" />
                  {!compare && previewMode === "sample" && (
                    <button type="button" onClick={() => setPreviewMax(true)} title="ดูขนาดจริงเต็มจอ"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
                      <Icon name="view" /> ขนาดจริง
                    </button>
                  )}
                  {!compare && previewMode === "real" && realSrc && (
                    <a href={realSrc} target="_blank" rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
                      <Icon name="open" /> เปิดหน้าพิมพ์
                    </a>
                  )}
                </div>

                {!compare && previewMode === "sample" && !hasDef && (
                  <div className="mx-4 mb-2"><Note tone="warn">เอกสารประเภทนี้ยังไม่มีข้อมูลตัวอย่าง — ลองกด “เอกสารจริง” ด้านบน</Note></div>
                )}
                {!compare && previewMode === "real" && (
                  <div className="mx-4 mb-2">
                    {!realUsage
                      ? <Note tone="warn">เอกสารประเภทนี้ยังไม่มีหน้าพิมพ์ที่ลงทะเบียนไว้ — พรีวิวด้วยเอกสารจริงไม่ได้</Note>
                      : <Note>เปิดหน้าพิมพ์จริงด้วยแม่แบบที่กำลังแก้ (ยังไม่บันทึกก็เห็น) — เปลี่ยนแล้วรอ 1 วินาที หน้าจะโหลดใหม่ · ข้อมูลเอกสารไม่ถูกแก้{realUsage.pick === "chosen" ? " · หน้านี้ให้เลือกแม่แบบเอง: เลือกชื่อแม่แบบนี้ในหน้าพิมพ์" : ""}</Note>}
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                  {compare ? (
                    <div className="grid min-w-[640px] grid-cols-2 gap-3">
                      <ComparePane title={`เวอร์ชัน ${new Date(compare.changed_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}`}>
                        <PrintFrame html={compareHtml} fit maxWidth={paperW(compare.snapshot.orientation ?? draft.orientation)} />
                      </ComparePane>
                      <ComparePane title={dirty ? "ตอนนี้ (ยังไม่บันทึก)" : "ตอนนี้"} accent>
                        <PrintFrame html={previewHtml} fit maxWidth={paperW(draft.orientation)} />
                      </ComparePane>
                    </div>
                  ) : previewMode === "real" ? (
                    realSrc
                      ? <iframe key={`${realSrc}|${realStamp}`} src={realSrc} title="พรีวิวด้วยเอกสารจริง" className="h-full min-h-[600px] w-full rounded-lg border border-slate-200 bg-white" />
                      : realUsage && <div className="py-16 text-center text-sm text-slate-400">เลือกเอกสารจากช่องด้านบน</div>
                  ) : (
                    <PrintFrame html={previewHtml} fit maxWidth={paperW(draft.orientation)} />
                  )}
                </div>
              </>
            )}
          </section>

          {/* ── ขวา: แผงแก้ ── */}
          <aside className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white">
            {!draft ? (
              <p className="p-8 text-center text-sm text-slate-400">เลือกแม่แบบ หรือกด + เพื่อสร้างใหม่</p>
            ) : (
              <>
                <div className="flex gap-1 border-b border-slate-100 p-1.5">
                  {tabs.map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                      className={`flex-1 rounded-md py-1.5 text-sm ${tab === t.key ? "bg-slate-100 font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {tab === "settings" && (
                    <div className="space-y-4">
                      <Field label="ชื่อแม่แบบ">
                        <input value={draft.label} onChange={e => update({ label: e.target.value })} disabled={!canEdit}
                          className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-50" />
                      </Field>
                      <Field label="ใช้กับเอกสาร">
                        <div className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm text-slate-700">
                          <span className="min-w-0 flex-1 truncate">{reportEntityLabel(draft.entity_type)}</span>
                          <span className={`flex shrink-0 items-center gap-1 text-xs ${status === "published" ? "text-emerald-600" : status === "archived" ? "text-slate-400" : "text-amber-600"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                            {statusLabel(status)}{draft.is_default ? " · หลัก" : ""}
                          </span>
                        </div>
                      </Field>
                      <Field label="ใช้พิมพ์ที่">
                        <UsageList row={draft} />
                      </Field>
                      {!isPdfme && (
                        <>
                          <Field label="กระดาษ">
                            <Segmented value={draft.paper_size} disabled={!canEdit}
                              options={[{ value: "A4", label: "A4" }, { value: "A5", label: "A5" }, { value: "Letter", label: "Letter" }]}
                              onChange={v => update({ paper_size: v as ReportTemplateRow["paper_size"] })} />
                          </Field>
                          <Field label="แนวกระดาษ">
                            <Segmented value={draft.orientation} disabled={!canEdit}
                              options={[{ value: "portrait", label: "แนวตั้ง" }, { value: "landscape", label: "แนวนอน" }]}
                              onChange={v => update({ orientation: v as ReportTemplateRow["orientation"] })} />
                          </Field>
                        </>
                      )}
                      <Field label="บันทึกช่วยจำ">
                        <textarea value={draft.description_note ?? ""} onChange={e => update({ description_note: e.target.value })} disabled={!canEdit}
                          rows={2} placeholder="เช่น ปรับคอลัมน์ให้แคบลง"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" />
                      </Field>

                      {canEdit && (
                        <div className="space-y-0.5 border-t border-slate-100 pt-3">
                          <MenuRow icon="documents" onClick={() => void duplicateVersion()} disabled={saving}
                            hint="แก้ในร่างก่อน ไม่กระทบใบที่ใช้อยู่">คัดลอกเป็นเวอร์ชันใหม่</MenuRow>
                          {status !== "archived" && (
                            <MenuRow icon="cabinet" onClick={() => void archive()} disabled={saving}>เก็บเข้าคลัง</MenuRow>
                          )}
                          <MenuRow icon="delete" danger onClick={() => setDeleteTarget(draft)} disabled={saving}>ลบแม่แบบ</MenuRow>
                        </div>
                      )}
                    </div>
                  )}

                  {tab === "fields" && (!hasDef ? <NoDef /> : (
                    <div className="space-y-3">
                      <Field label="ใส่ที่">
                        <Segmented value={insertInto}
                          options={INSERT_TARGETS.map(t => ({ value: t, label: TARGET_LABEL[t] }))}
                          onChange={v => setTarget(v as EditorTarget)} />
                      </Field>
                      <input value={fieldQuery} onChange={e => setFieldQuery(e.target.value)} placeholder="ค้นหาข้อมูล"
                        className="h-8 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-blue-400 focus:outline-none" />
                      {filteredFields.length === 0 && <p className="py-4 text-center text-sm text-slate-400">ไม่พบข้อมูลที่ค้นหา</p>}
                      {filteredFields.map(([group, fields]) => (
                        <div key={group}>
                          <p className="mb-1 text-[11px] font-medium text-slate-400">{group}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {fields.map(f => (
                              <button key={f.key} type="button" disabled={!canEdit} title={f.sample ? `ตัวอย่าง: ${f.sample}` : f.key}
                                onClick={() => insertText(f.key.endsWith("_html") || f.key === "lines_table" ? `{{{${f.key}}}}` : fieldToken(f.key), insertInto)}
                                className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50">
                                {f.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        กดแล้วข้อมูลจะต่อท้าย{TARGET_LABEL[insertInto]} — ถ้าเคยคลิกวางเคอร์เซอร์ในแท็บโค้ด จะแทรกตรงจุดนั้นแทน
                      </p>
                    </div>
                  ))}

                  {tab === "table" && (!hasDef || !tableDef ? <NoDef what="ตาราง" /> : (
                    <div className="space-y-3">
                      {entityDef.tables.length > 1 && (
                        <select value={tableKey} onChange={e => setTableKey(e.target.value)}
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm">
                          {entityDef.tables.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                      )}
                      <p className="text-xs text-slate-500">ติ๊กคอลัมน์ที่ต้องการ แล้วจัดลำดับ</p>
                      <div className="space-y-1">
                        {orderedColumns.map(col => {
                          const on = selectedColumns.includes(col.key);
                          return (
                            <div key={col.key} className={`group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 ${on ? "" : "opacity-50"}`}>
                              <input type="checkbox" checked={on} onChange={() => toggleColumn(col.key)} className="h-4 w-4" />
                              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{col.label}</span>
                              {on && (
                                <span className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                                  <button type="button" onClick={() => moveColumn(col.key, -1)} title="เลื่อนขึ้น" className="h-6 w-6 rounded text-slate-400 hover:bg-white hover:text-slate-700">↑</button>
                                  <button type="button" onClick={() => moveColumn(col.key, 1)} title="เลื่อนลง" className="h-6 w-6 rounded text-slate-400 hover:bg-white hover:text-slate-700">↓</button>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button type="button" disabled={!canEdit || selectedColumns.length === 0}
                        onClick={() => insertText(buildTableHtml(tableDef, selectedColumns), "body_html")}
                        className="h-9 w-full rounded-lg bg-slate-800 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
                        ใส่ตาราง {selectedColumns.length} คอลัมน์ลงเนื้อหา
                      </button>
                    </div>
                  ))}

                  {tab === "code" && (
                    <div className="flex h-full flex-col gap-2">
                      <Segmented value={target} onChange={v => setTarget(v as EditorTarget)}
                        options={(Object.keys(TARGET_LABEL) as EditorTarget[]).map(t => ({ value: t, label: TARGET_LABEL[t] }))} />
                      <textarea
                        value={draft[target] ?? ""}
                        onChange={e => { update({ [target]: e.target.value } as Partial<DraftTemplate>); cursorRef.current = { target, pos: e.target.selectionStart }; }}
                        onSelect={e => { cursorRef.current = { target, pos: e.currentTarget.selectionStart }; }}
                        disabled={!canEdit}
                        spellCheck={false}
                        className="min-h-[360px] w-full flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed focus:border-blue-400 focus:outline-none disabled:opacity-60"
                      />
                      <p className="text-[11px] text-slate-400">สำหรับคนที่ถนัด HTML — {"{{field}}"} = ข้อมูล · {"{{#lines}}…{{/lines}}"} = วนแถวตาราง</p>
                    </div>
                  )}

                  {tab === "history" && (
                    <HistoryList templateId={draft.id} reloadKey={historyKey} comparingId={compare?.id ?? null}
                      onCompare={setCompare} onRestore={v => void restoreVersion(v)} canEdit={canEdit} allowCompare={!isPdfme} />
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* ── ดูขนาดจริง ── */}
      {draft && !isPdfme && (
        <ERPModal open={previewMax} onClose={() => setPreviewMax(false)} title={`ขนาดจริง · ${draft.label}`} size="xl" storageKey="report-template-preview">
          <div className="flex justify-center bg-slate-100 p-4">
            <div style={{ width: paperW(draft.orientation) }}>
              <PrintFrame html={previewHtml} maxWidth={paperW(draft.orientation)} />
            </div>
          </div>
        </ERPModal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="ลบแม่แบบ"
        message={deleteTarget?.active
          ? `"${deleteTarget.label}" กำลังใช้พิมพ์อยู่ — ลบแล้วหน้าพิมพ์จะไปใช้แม่แบบอื่น และกู้คืนไม่ได้ แนะนำ "เก็บเข้าคลัง" แทน`
          : `ลบ "${deleteTarget?.label}" ถาวร กู้คืนไม่ได้`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        onConfirm={() => { if (deleteTarget) void remove(deleteTarget); }}
        variant="danger"
      />
    </PlaygroundShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      {children}
    </div>
  );
}

function Segmented({ value, options, onChange, disabled }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex rounded-lg bg-slate-200/60 p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" disabled={disabled} onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs ${value === o.value ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"} disabled:cursor-not-allowed`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ComparePane({ title, accent, children }: { title: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={`mb-1.5 text-xs font-medium ${accent ? "text-blue-600" : "text-slate-500"}`}>{title}</p>
      {children}
    </div>
  );
}

function MenuRow({ icon, children, hint, onClick, disabled, danger }: {
  icon: string; children: ReactNode; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-40 ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-600 hover:bg-slate-50"}`}>
      <span className="mt-0.5"><Icon name={icon} /></span>
      <span>
        {children}
        {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
      </span>
    </button>
  );
}

function NoDef({ what = "ข้อมูล" }: { what?: string }) {
  return (
    <div className="py-8 text-center text-sm text-slate-400">
      <p>เอกสารประเภทนี้ยังไม่มีรายการ{what}ให้กดเลือก</p>
      <p className="mt-1 text-xs">แก้ได้ที่แท็บ “โค้ด” แทน</p>
    </div>
  );
}
