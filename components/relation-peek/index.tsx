"use client";

/**
 * RelationPeekModal — popup ดู/แก้ไขรายละเอียดของ record ที่เชื่อม (ของกลาง)
 * ใช้ตอนกดที่ค่า relation หรือกดรายการในการ์ด "ข้อมูลที่เกี่ยวข้อง (360)"
 * registry-driven: โหลด field + ค่า → โชว์เป็น view; กด "✎ แก้ไข" → แก้ได้ทุก field แล้วบันทึก (PATCH)
 *
 * Phase 1 (unify): ยกความสามารถฝั่ง "แก้" ให้เท่า MasterCRUD โดยใช้ชิ้นส่วนกลางชุดเดียวกัน
 *   - แก้ many2many (แท็ก) ผ่าน RelationMany2Many + บันทึก diff junction เอง (เหมือน MasterCRUD)
 *   - ฟิลด์มีเงื่อนไข show_if (evaluateCondition) — ซ่อน/โชว์ตามค่าอื่น ทั้งดู/แก้
 *   - ฟอร์มแก้แบบแท็บ/เซกชัน (ตาม layout เดียวกับฟอร์มหน้าเต็ม)
 *   - ค่าเริ่มต้นอัตโนมัติตอนสร้าง (resolveDefault: now/today/current_user/uuid/static)
 *   - ตรวจค่าก่อนบันทึก (validateValue + required) แสดง error ใต้แต่ละช่อง
 *   - แกลเลอรีหลายรูป (ImageManager) — เปิดเมื่อตัวเรียกส่ง prop mediaGallery
 *
 * โหมด quickEdit: โชว์เฉพาะ "ชุดฟิลด์แก้เร็ว" ของโมดูล (erp_modules.config.quick_edit_fields)
 * — ยังไม่ตั้ง = โชว์ทุกฟิลด์เหมือนเดิม · ปุ่ม ⚙ (admin) เลือกฟิลด์ → เป็น default ของทุก user
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { useAuth, usePermission } from "@/components/auth";
import { useBackdropDismiss } from "@/components/modal";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { RelationOne2Many, RelationMany2Many } from "@/components/relation-multi";   // ของกลาง: ลูก/เกี่ยวข้อง (BOM, 360) + แท็ก m2m
import { ImageInput } from "@/components/image-input";
import { ImageManager } from "@/components/image-manager";   // แกลเลอรีหลายรูป (ของกลาง)
import { invalidateCache } from "@/lib/client-cache";
import { formatAmount, currencyLabel } from "@/lib/money";
import { StudioLauncher } from "@/components/studio-launcher";
import { resolveDefault, evaluateCondition, type FieldType } from "@/lib/field-helpers";   // ค่าเริ่มต้นอัตโนมัติ + เงื่อนไข show_if
import { loadValidationRules, validateValue, type ValidationRule } from "@/lib/validation";   // ตรวจค่าก่อนบันทึก (ของกลาง)

type RF = {
  field_key: string; column_name: string | null; field_label: string; ui_field_type: string;
  is_visible: boolean; show_in_form: boolean; is_editable: boolean; is_required: boolean;
  options: { options?: string[]; currency?: string; currency_field?: string } | null;
  relation_config: RelationConfig | null; display_order: number; group_key?: string | null;
  // Phase 1 unify — เงื่อนไข/ค่าเริ่มต้น/ตรวจสอบ/ช่วยเหลือ (จากทะเบียนกลาง field-registry-v2)
  condition_rules?: Record<string, unknown> | null;
  default_value?: string | null;
  default_expression?: string | null;
  validation_rules?: { rules?: string[] } | null;
  help_text?: string | null;
  placeholder?: string | null;
};
// layout ฟอร์มที่ออกแบบไว้ (Tab→Section) — peek เอามาจัดเซกชัน/ลำดับเหมือนฟอร์ม
type PeekLayout = { tabs: { key: string; label: string; sections: { key: string; label: string }[] }[] } | null;
// แกลเลอรีหลายรูป (ของกลาง) — ตัวเรียกเปิดใช้โดยส่ง prop นี้
type MediaGalleryCfg = { entityType?: string; title?: string; description?: string; maxItems?: number; maxSizeBytes?: number; imageOnly?: boolean };

// สกุลเงินของฟิลด์ (ทะเบียนกลาง) — ตายตัว (options.currency) หรือตามฟิลด์อื่นในรายการ (options.currency_field)
const fieldCurrency = (f: RF, rec: Record<string, unknown> | null): unknown => {
  if (f.options?.currency) return f.options.currency;
  if (f.options?.currency_field) return rec?.[f.options.currency_field];
  return f.ui_field_type === "currency" ? "THB" : null;
};

const img = (k: unknown) => (k ? `/api/r2-image?key=${encodeURIComponent(String(k))}` : null);

// map ui_field_type → ชนิดที่ resolveDefault รองรับ (currency→number, อื่นที่ไม่รู้จัก→text)
const RD_TYPES = new Set(["text", "number", "boolean", "select", "textarea", "relation", "image"]);
const dfType = (t: string): FieldType => (t === "currency" ? "number" : (RD_TYPES.has(t) ? (t as FieldType) : "text"));

// junction table ของฟิลด์ m2m (ไว้โหลด/บันทึกลิงก์) — null ถ้าไม่ใช่ m2m/ไม่มี junction
const junctionOf = (f: RF): string | null => {
  if (f.ui_field_type !== "many2many") return null;
  const j = (f.relation_config as Record<string, unknown> | null)?.junction_table;
  return j ? String(j) : null;
};

export function RelationPeekModal({
  moduleKey, recordId, onClose, startInEdit, onChanged, createDefaults, createTitle, quickEdit, nav, onCopy, mediaGallery, defaultWidth,
}: {
  moduleKey: string;
  recordId?: string | null;       // ว่าง/null = โหมดสร้างใหม่ (POST)
  onClose: () => void;
  startInEdit?: boolean;          // เปิดมาในโหมดแก้ไขเลย (กดปุ่ม ✎ จากการ์ด)
  onChanged?: () => void;         // เรียกหลังบันทึกสำเร็จ → ให้ตัวเรียกรีเฟรชรายการ
  createDefaults?: Record<string, unknown>;  // โหมดสร้าง: ค่าตั้งต้น เช่น { parent_sku_id, is_active:true }
  createTitle?: string;           // โหมดสร้าง: หัวข้อ popup
  quickEdit?: boolean;            // โหมดแก้เร็ว: กรองตามชุดฟิลด์ของโมดูล + ปุ่ม ⚙ (admin) เลือกฟิลด์
  nav?: { onPrev?: () => void; onNext?: () => void; label?: string };   // เลื่อนรายการก่อนหน้า/ถัดไป (ตัวเรียกส่งรายการมา)
  onCopy?: () => void;            // ปุ่มคัดลอก (ตัวเรียกจัดการ action เอง)
  mediaGallery?: MediaGalleryCfg;  // เปิดแท็บ "📷 รูป" (แกลเลอรีหลายรูป ImageManager) — ตัวเรียก opt-in
  defaultWidth?: number;           // ความกว้างเริ่มต้น (ถ้ายังไม่เคยลากปรับ) — เช่นหน้า master ใช้กว้างกว่า peek ทั่วไป
}) {
  const isCreate = !recordId;
  const { user } = useAuth();
  const canCfg = usePermission("admin.users");   // ⚙ ตั้งชุดฟิลด์ = ค่ากลางของทุก user → จำกัด admin
  const [fields, setFields] = useState<RF[]>([]);
  const [layout, setLayout] = useState<PeekLayout>(null);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // quick edit config
  const [quickFields, setQuickFields] = useState<string[] | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [cfgSel, setCfgSel] = useState<string[]>([]);
  const [cfgQ, setCfgQ] = useState("");
  const [cfgSaving, setCfgSaving] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);   // เปิดตัวออกแบบ layout กลาง (StudioPanel)
  const [activeTab, setActiveTab] = useState(0);   // แท็บที่เลือกในโหมดดู (drawer ขวา)
  const [editTab, setEditTab] = useState(0);       // แท็บที่เลือกในโหมดแก้
  const [width, setWidth] = useState(defaultWidth ?? 560);   // ความกว้าง drawer (ลากปรับ + จำค่า)
  const widthRef = useRef(defaultWidth ?? 560);
  const resizing = useRef(false);
  const [zoom, setZoom] = useState<string | null>(null);   // รูปที่กดดูใหญ่ (lightbox)
  // Phase 1 unify — แท็ก m2m (ลิงก์ปัจจุบันต่อฟิลด์) + กฎ validation + error รายฟิลด์
  const [m2mLinks, setM2mLinks] = useState<Record<string, string[]>>({});
  const [valRules, setValRules] = useState<Record<string, ValidationRule>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => {
    try { const w = Number(localStorage.getItem("relpeek-w")); if (w >= 360) setWidth(Math.min(w, 1100)); } catch { /* ignore */ }
    const mv = (e: MouseEvent) => { if (resizing.current) setWidth(Math.max(360, Math.min(window.innerWidth - e.clientX, window.innerWidth - 40))); };
    const up = () => { if (resizing.current) { resizing.current = false; document.body.style.userSelect = ""; try { localStorage.setItem("relpeek-w", String(widthRef.current)); } catch { /* ignore */ } } };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, []);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const reg = await apiFetch(`/api/admin/field-registry-v2?module=${moduleKey}`).then((r) => r.json());
      setFields((reg.fields ?? []).filter((f: RF) => (f.is_visible || f.show_in_form)));   // เก็บ one2many/many2many ไว้โชว์/แก้ (Phase 1 unify)
      setLayout((reg.layout ?? null) as PeekLayout);
      setQuickFields(Array.isArray(reg.quick_edit_fields) && reg.quick_edit_fields.length > 0 ? (reg.quick_edit_fields as string[]) : null);
      if (isCreate) {
        setRow({});               // โหมดสร้าง: ไม่มี record เดิม ใช้ object ว่าง (กัน "ไม่พบข้อมูล")
      } else {
        const rec = await apiFetch(`/api/master-v2/${moduleKey}/${recordId}`).then((r) => r.json());
        setRow((rec.data ?? null) as Record<string, unknown> | null);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [moduleKey, recordId, isCreate]);

  useEffect(() => { void load(); }, [load]);

  // โหลดกฎ validation กลาง (cache 60s) ครั้งเดียว
  useEffect(() => { loadValidationRules().then(setValRules).catch(() => {}); }, []);

  // โหลดลิงก์ m2m ปัจจุบันของ record (ทุกฟิลด์ m2m) — ใช้ทั้งโหมดดู (chips) และเริ่มต้นโหมดแก้
  const loadM2m = useCallback(async () => {
    if (isCreate || !recordId) { setM2mLinks({}); return; }
    const m2m = fields.filter((f) => junctionOf(f));
    if (m2m.length === 0) { setM2mLinks({}); return; }
    const entries = await Promise.all(m2m.map(async (f) => {
      const junction = junctionOf(f)!;
      try {
        const j = await apiFetch(`/api/admin/schema/m2m-links?junction=${junction}&src_id=${recordId}`).then((r) => r.json());
        return [f.field_key, ((j.links ?? []) as unknown[]).map(String)] as const;
      } catch { return [f.field_key, [] as string[]] as const; }
    }));
    setM2mLinks(Object.fromEntries(entries));
  }, [fields, recordId, isCreate]);
  useEffect(() => { void loadM2m(); }, [loadM2m]);

  // กำลังแก้อยู่ + ลิงก์ m2m เพิ่งโหลดเสร็จ → เติมลง form เฉพาะช่องที่ยังว่าง (กัน revert ค่าที่ผู้ใช้แก้)
  useEffect(() => {
    if (!editing) return;
    setForm((p) => {
      let changed = false; const next = { ...p };
      for (const fd of fields) {
        if (fd.ui_field_type === "many2many" && next[fd.field_key] === undefined && m2mLinks[fd.field_key] !== undefined) {
          next[fd.field_key] = m2mLinks[fd.field_key]; changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [m2mLinks, editing, fields]);

  // ข้อมูลที่เกี่ยวข้อง 360 (โมดูลอื่นชี้กลับมาหา record นี้) — ของกลางเดียวกับ MasterCRUD
  const [reverseRels, setReverseRels] = useState<{ source_module_key: string; fk_column: string; source_label: string; label_field: string; image_field?: string | null; sub_fields?: string[] }[]>([]);
  useEffect(() => {
    if (isCreate) { setReverseRels([]); return; }
    apiFetch(`/api/admin/reverse-relations?module=${moduleKey}`).then((r) => r.json())
      .then((j) => { if (Array.isArray(j.data)) setReverseRels(j.data); }).catch(() => {});
  }, [moduleKey, isCreate]);

  // โหมดแก้เร็ว: กรองตามชุดฟิลด์ของโมดูล (ยังไม่ตั้ง = โชว์ทุกฟิลด์)
  const shownFields = quickEdit && quickFields ? fields.filter((f) => quickFields.includes(f.field_key)) : fields;

  // field ที่แก้ไขได้ (เคารพทะเบียน field) — ตัด one2many/related/computed/id · "เก็บ many2many ไว้แก้" (Phase 1 unify)
  const editAll = shownFields.filter(
    (f) => f.is_editable && f.show_in_form && !["one2many", "related", "computed"].includes(f.ui_field_type) && f.field_key !== "id",
  );
  // ที่โชว์จริงในฟอร์ม = ผ่านเงื่อนไข show_if ตามค่าปัจจุบันในฟอร์ม
  const editVisible = editAll.filter((f) => evaluateCondition(f.condition_rules ?? null, form));

  // ⚙ บันทึกชุดฟิลด์แก้เร็ว → config กลางของโมดูล (default ทุก user) ผ่าน API กลาง (admin + audit)
  const saveQuickCfg = async (list: string[] | null) => {
    setCfgSaving(true); setErr(null);
    try {
      const res = await apiFetch(`/api/admin/module-settings/${moduleKey}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: { quick_edit_fields: list }, actor: user?.name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) { setErr(j.error ?? `บันทึกไม่สำเร็จ (HTTP ${res.status})`); return; }
      const next = list && list.length > 0 ? list : null;
      setQuickFields(next);
      // กำลังแก้ไขค้างอยู่ → เติมค่าฟิลด์ที่เพิ่งเพิ่มเข้าชุดจาก record (กันฟอร์มส่งค่าว่างทับ) — ข้าม virtual (m2m/o2m)
      if (editing && row) {
        setForm((p) => {
          const f = { ...p };
          fields.filter((fd) => (!next || next.includes(fd.field_key)) && !["many2many", "one2many", "related", "computed"].includes(fd.ui_field_type)).forEach((fd) => {
            if (!(fd.field_key in f)) {
              const v = row[fd.field_key];
              f[fd.field_key] = v == null ? (fd.ui_field_type === "boolean" ? false : "") : v;
            }
          });
          return f;
        });
      }
      invalidateCache("/api/admin/field-registry-v2");   // ให้จุดอื่นที่ cache ทะเบียนเห็นค่าล่าสุด
      setCfgOpen(false);
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setCfgSaving(false); }
  };

  const enterEdit = () => {
    if (!row) return;
    const f: Record<string, unknown> = {};
    editAll.forEach((fd) => {
      if (fd.ui_field_type === "many2many") {
        // แท็ก: เริ่มจากลิงก์ที่โหลดมา (ยังไม่มา = undefined → widget โชว์ "กำลังโหลด" + ล็อกคลิก); สร้างใหม่ = []
        f[fd.field_key] = isCreate ? [] : m2mLinks[fd.field_key];
        return;
      }
      if (isCreate) {
        // ค่าเริ่มต้นอัตโนมัติ (now/today/current_user/uuid/static) ตามทะเบียน
        f[fd.field_key] = resolveDefault(dfType(fd.ui_field_type), fd.default_value, fd.default_expression, user?.email ?? user?.name ?? null);
        return;
      }
      const v = row[fd.field_key];
      f[fd.field_key] = v == null ? (fd.ui_field_type === "boolean" ? false : "") : v;
    });
    if (isCreate) Object.assign(f, createDefaults ?? {});   // โหมดสร้าง: ทับด้วยค่าตั้งต้น (เช่น FK)
    setForm(f); setErr(null); setFieldErrors({}); setEditTab(0); setEditing(true);
  };

  // เข้าโหมดแก้ไขทันทีถ้าสั่งมา (หลังโหลด row เสร็จ) — โหมดสร้างเข้าฟอร์มเลย
  useEffect(() => {
    if ((startInEdit || isCreate) && !loading && row && !editing) enterEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startInEdit, isCreate, loading, row]);

  // แปลงค่าให้ตรงชนิดก่อนส่ง (เหมือน master-crud) — กัน "" ไปลงคอลัมน์ number/integer แล้วฐานข้อมูล error
  const serializeValue = (fd: RF, v: unknown): unknown => {
    if (fd.ui_field_type === "number" || fd.ui_field_type === "currency") {
      if (v === "" || v == null) return null;
      const n = Number(v); return Number.isFinite(n) ? n : null;
    }
    if (fd.ui_field_type === "boolean") return !!v;
    return v === "" || v == null ? null : v;   // ข้อความว่าง → null (เหมือนตารางกลาง)
  };

  // ผูก/ถอดลิงก์ m2m ให้ตรงกับที่เลือก (diff want↔have) — ใช้ทั้งสร้าง/แก้ เหมือน MasterCRUD
  const syncM2m = async (srcId: string) => {
    for (const fd of editAll) {
      const junction = junctionOf(fd); if (!junction) continue;
      const want = Array.isArray(form[fd.field_key]) ? (form[fd.field_key] as string[]).map(String) : [];
      let have: string[] = [];
      try {
        const gr = await apiFetch(`/api/admin/schema/m2m-links?junction=${junction}&src_id=${srcId}`).then((r) => r.json());
        have = ((gr.links ?? []) as unknown[]).map(String);
      } catch { /* ถือว่ายังไม่มีลิงก์ */ }
      for (const tgt of want.filter((x) => !have.includes(x))) {
        await apiFetch("/api/admin/schema/m2m-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction, src_id: srcId, tgt_id: tgt }) }).catch(() => {});
      }
      for (const tgt of have.filter((x) => !want.includes(x))) {
        await apiFetch("/api/admin/schema/m2m-links", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ junction, src_id: srcId, tgt_id: tgt }) }).catch(() => {});
      }
    }
  };

  const save = async () => {
    // 1) ตรวจค่าก่อนบันทึก — เฉพาะช่องที่โชว์จริง (ผ่านเงื่อนไข) · ข้าม m2m (จัดการที่ junction)
    const fErr: Record<string, string[]> = {}; let bad = false;
    for (const f of editVisible) {
      if (f.ui_field_type === "many2many") continue;
      const keys = [...(f.is_required ? ["required"] : []), ...((f.validation_rules?.rules) ?? [])];
      if (keys.length === 0) continue;
      const errs = validateValue(form[f.field_key], keys, valRules);
      if (errs.length > 0) { fErr[f.field_key] = errs; bad = true; }
    }
    setFieldErrors(fErr);
    if (bad) { setErr("มีช่องที่ยังไม่ผ่านการตรวจ — ดูข้อความใต้แต่ละช่อง"); return; }

    setSaving(true); setErr(null);
    try {
      const body: Record<string, unknown> = { actor: user?.name };
      editAll.forEach((fd) => { if (fd.ui_field_type !== "many2many") body[fd.field_key] = serializeValue(fd, form[fd.field_key]); });
      let srcId = recordId ?? "";
      if (isCreate) {
        Object.assign(body, createDefaults ?? {});   // กัน FK/ค่าตั้งต้นหลุด แม้ไม่ใช่ field ที่แก้ได้
        const res = await apiFetch(`/api/master-v2/${moduleKey}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) { setErr(j.error ?? `บันทึกไม่สำเร็จ (HTTP ${res.status})`); return; }
        srcId = String((j.data as Record<string, unknown> | undefined)?.id ?? "");
        if (srcId) await syncM2m(srcId);   // ผูกแท็กหลังสร้าง record
        onChanged?.();        // ให้รายการต้นทางรีเฟรช
        onClose();            // สร้างเสร็จ → ปิด popup
        return;
      }
      const res = await apiFetch(`/api/master-v2/${moduleKey}/${recordId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json();
      if (j.error) { setErr(j.error); return; }
      if (srcId) await syncM2m(srcId);   // ผูก/ถอดแท็กให้ตรงที่เลือก
      setEditing(false);
      await load();          // ดึงค่าใหม่ + label มาแสดง
      await loadM2m();       // รีเฟรช chips แท็กให้ตรงหลังบันทึก
      onChanged?.();         // ให้รายการต้นทางรีเฟรช
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  // ---- view value ----
  const val = (f: RF): React.ReactNode => {
    if (!row) return "—";
    if (f.ui_field_type === "image") {
      const k = row[f.field_key];
      return img(k) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(k)!} alt="" className="w-20 h-20 rounded object-cover border border-slate-100" /> : <span className="text-slate-300">—</span>;
    }
    if (f.ui_field_type === "relation") {
      const lk = f.field_key.endsWith("_id") ? f.field_key.slice(0, -3) + "_label" : f.field_key + "_label";
      const lbl = row[lk];
      return <span>{String(lbl ?? row[f.field_key] ?? "—")}</span>;
    }
    if (f.ui_field_type === "boolean") return row[f.field_key] ? "ใช่" : "ไม่ใช่";
    const v = row[f.field_key];
    if (v == null || v === "") return <span className="text-slate-300">—</span>;
    // ค่าเป็น array/object (เช่น attribute_values jsonb) — แปลงให้อ่านได้ (กัน [object Object])
    if (Array.isArray(v)) return v.length ? <span>{v.map((x) => String(x)).join(", ")}</span> : <span className="text-slate-300">—</span>;
    if (typeof v === "object") {
      const e = Object.entries(v as Record<string, unknown>).filter(([, vv]) => vv != null && vv !== "");
      return e.length ? <span className="text-xs text-slate-600">{e.map(([k, vv]) => `${k}: ${typeof vv === "object" ? JSON.stringify(vv) : String(vv)}`).join(" · ")}</span> : <span className="text-slate-300">—</span>;
    }
    // ฟิลด์เงิน → โชว์สกุลถูกต้องตามทะเบียน (฿1,234 / 1,234 RMB)
    const cur = fieldCurrency(f, row);
    if (cur != null && typeof v !== "boolean" && !isNaN(Number(v))) return <span className="tabular-nums">{formatAmount(Number(v), cur)}</span>;
    return <span>{typeof v === "number" ? v.toLocaleString() : String(v)}</span>;
  };

  // ---- edit input ----
  const editField = (fd: RF) => {
    const v = form[fd.field_key];
    if (fd.ui_field_type === "boolean") {
      return <label className="flex items-center gap-2 text-sm text-slate-700 h-9"><input type="checkbox" checked={!!v} onChange={(e) => set(fd.field_key, e.target.checked)} /> {fd.field_label}</label>;
    }
    if (fd.ui_field_type === "many2many") {
      // แท็ก/หลายค่า: ใช้ของกลาง RelationMany2Many (controlled) — บันทึก diff junction ที่ save()
      return (
        <div>
          <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
          <RelationMany2Many config={(fd.relation_config ?? {}) as never} recordId={recordId} editable
            value={Array.isArray(v) ? (v as string[]) : undefined}
            onChange={(ids) => set(fd.field_key, ids)} />
        </div>
      );
    }
    if (fd.ui_field_type === "relation" && fd.relation_config?.target_table) {
      return (
        <div>
          <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
          <div className="mt-0.5"><RelationPicker value={(v as string) || null} onChange={(id) => set(fd.field_key, id)} config={fd.relation_config} siblingValues={form} /></div>
        </div>
      );
    }
    if (fd.ui_field_type === "image") {
      return <div><label className="text-[11px] font-medium text-slate-500">{fd.field_label}</label><div className="mt-0.5"><ImageInput value={(v as string) || null} onChange={(k) => set(fd.field_key, k)} folder={moduleKey} /></div></div>;
    }
    if (fd.ui_field_type === "textarea") {
      return (
        <div>
          <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
          <textarea value={(v as string) ?? ""} rows={3} placeholder={fd.placeholder ?? undefined}
            onChange={(e) => set(fd.field_key, e.target.value)}
            className="mt-0.5 w-full px-3 py-2 text-sm border border-slate-200 rounded-md" />
        </div>
      );
    }
    if (fd.ui_field_type === "select" && fd.options?.options?.length) {
      return (
        <div>
          <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
          <select value={(v as string) ?? ""} onChange={(e) => set(fd.field_key, e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-md bg-white">
            <option value="">—</option>{fd.options.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    const isNum = fd.ui_field_type === "number" || fd.ui_field_type === "currency";
    // ฟิลด์เงิน: ป้ายสกุลกำกับท้ายช่อง (currency_field อ่านจากค่าที่กำลังแก้ก่อน แล้วค่อย fallback record เดิม)
    const cur = isNum ? fieldCurrency(fd, { ...(row ?? {}), ...form }) : null;
    return (
      <div>
        <label className="text-[11px] font-medium text-slate-500">{fd.field_label}{fd.is_required && " *"}</label>
        <div className="relative">
          <input type={isNum ? "number" : "text"} value={(v as string | number) ?? ""} step={isNum ? "any" : undefined} placeholder={fd.placeholder ?? undefined}
            onChange={(e) => set(fd.field_key, isNum ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
            className={`mt-0.5 w-full h-9 px-3 text-sm border border-slate-200 rounded-md ${cur != null ? "pr-12" : ""}`} />
          {cur != null && <span className="absolute right-3 top-1/2 -translate-y-1/2 mt-[1px] text-[11px] font-medium text-slate-400 pointer-events-none">{currencyLabel(cur)}</span>}
        </div>
      </div>
    );
  };

  // ฟิลด์ + ข้อความ error ใต้ช่อง (โหมดแก้) — m2m/textarea กินเต็มแถว
  const editFieldCell = (f: RF) => (
    <div key={f.field_key} className={["many2many", "textarea"].includes(f.ui_field_type) ? "col-span-2" : ""}>
      {editField(f)}
      {f.help_text && <div className="text-[11px] text-slate-400 mt-0.5">{f.help_text}</div>}
      {(fieldErrors[f.field_key]?.length ?? 0) > 0 && (
        <div className="text-[11px] text-red-600 mt-1 space-y-0.5">{fieldErrors[f.field_key].map((m, i) => <div key={i}>⚠ {m}</div>)}</div>
      )}
    </div>
  );

  // สร้าง "แท็บ→เซกชัน" จากรายการฟิลด์ ตาม layout เดียวกับฟอร์มหน้าเต็ม (ใช้ทั้งดู/แก้)
  const buildTabs = (list: RF[]): { label: string; secs: { key: string; label: string; fields: RF[] }[] }[] => {
    const bySec = new Map<string, RF[]>();
    for (const f of list) { const k = f.group_key || ""; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k)!.push(f); }
    const known = new Set((layout?.tabs ?? []).flatMap((t) => t.sections.map((s) => s.key)));
    const leftover = list.filter((f) => !known.has(f.group_key || ""));
    const tabs = (layout?.tabs ?? [])
      .map((t) => ({ label: t.label, secs: t.sections.filter((s) => (bySec.get(s.key)?.length ?? 0) > 0).map((s) => ({ key: s.key, label: s.label, fields: bySec.get(s.key)! })) }))
      .filter((t) => t.secs.length > 0);
    if (leftover.length) tabs.push({ label: tabs.length ? "อื่นๆ" : "", secs: [{ key: "__lo__", label: "", fields: leftover }] });
    return tabs;
  };

  const title = isCreate
    ? (createTitle ?? "เพิ่มรายการใหม่")
    : (row ? String(row["name_th"] ?? row["name"] ?? row["code"] ?? "รายละเอียด") : "รายละเอียด");
  const cover = row ? (row["cover_image_r2_key"] ?? row["image_key"]) : null;
  // ปิดด้วย backdrop ได้เฉพาะตอน "ดู" — โหมดแก้ไขกันปิดพลาด
  const dismiss = useBackdropDismiss(editing ? () => {} : onClose);

  // แกลเลอรีหลายรูป (ของกลาง) — เปิดเมื่อตัวเรียกส่ง prop + มี record แล้ว
  const galleryNode = mediaGallery && !isCreate && recordId ? (
    <ImageManager
      entityType={mediaGallery.entityType ?? moduleKey}
      entityId={String(recordId)}
      actor={user?.name ?? user?.email ?? undefined}
      readonly={false}
      title={mediaGallery.title}
      description={mediaGallery.description}
      maxItems={mediaGallery.maxItems ?? 9}
      maxSizeBytes={mediaGallery.maxSizeBytes ?? 2 * 1024 * 1024}
      imageOnly={mediaGallery.imageOnly ?? true}
    />
  ) : null;

  return createPortal(
    <>
    <div className="fixed inset-0 z-[140] bg-black/40 flex justify-end" {...dismiss}>
      <div className="relative bg-white shadow-2xl h-full flex flex-col" style={{ width, maxWidth: "100vw" }} onClick={(e) => e.stopPropagation()}>
        <div onMouseDown={(e) => { e.preventDefault(); resizing.current = true; document.body.style.userSelect = "none"; }}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-blue-300 z-20" title="ลากปรับความกว้าง" />
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-800 line-clamp-1">{isCreate ? "➕ " : editing ? "✎ " : "🔗 "}{title}</h3>
          <div className="flex items-center gap-2 flex-shrink-0">
            {quickEdit && canCfg && !cfgOpen && !loading && (
              <button onClick={() => { setCfgSel(quickFields ?? fields.map((f) => f.field_key)); setCfgQ(""); setCfgOpen(true); }}
                title="เลือกฟิลด์ที่จะโชว์/แก้ไขในป๊อปนี้ (เป็นค่าเริ่มต้นของทุกคน)"
                className="h-7 w-7 text-sm border border-slate-200 rounded-md text-slate-500 hover:bg-slate-50">⚙</button>
            )}
            {canCfg && !editing && !cfgOpen && !loading && !isCreate && row && (
              <button onClick={() => setStudioOpen(true)} title="ออกแบบ layout ของป๊อปนี้ (ใช้ตัวกลางชุดเดียวกับฟอร์มหน้าเต็ม — แก้ที่นี่มีผลทุกที่)"
                className="h-7 px-2.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">🎨 Layout</button>
            )}
            {!editing && !cfgOpen && !loading && row && editAll.length > 0 && (
              <button onClick={enterEdit} className="h-7 px-2.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">✎ แก้ไข</button>
            )}
            {!editing && !cfgOpen && !isCreate && recordId && (
              <a href={`/m/${moduleKey}?open=${encodeURIComponent(recordId)}`}
                className="h-7 px-2.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center">เปิดหน้าเต็ม →</a>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>

        <div className="p-5 overflow-auto flex-1">
          {loading ? (
            <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : cfgOpen ? (
            /* ⚙ เลือกชุดฟิลด์แก้เร็ว — เป็น default ของทุก user */
            <div>
              <div className="text-xs text-slate-500 mb-2">เลือกฟิลด์ที่จะโชว์/แก้ไขในป๊อปแก้เร็วนี้ — มีผลกับ<b>ทุกคน</b>ที่เปิดป๊อปนี้ · ฟิลด์ใหม่ที่เพิ่มเข้าทะเบียนภายหลังจะโผล่ในรายการนี้อัตโนมัติ</div>
              <input value={cfgQ} onChange={(e) => setCfgQ(e.target.value)} placeholder="🔎 ค้นหาฟิลด์…" className="w-full h-8 px-2 mb-2 text-xs border border-slate-200 rounded-md" />
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[45vh] overflow-auto">
                {fields
                  .filter((f) => { const q = cfgQ.trim().toLowerCase(); return !q || f.field_label.toLowerCase().includes(q) || f.field_key.toLowerCase().includes(q); })
                  .map((f) => (
                    <label key={f.field_key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={cfgSel.includes(f.field_key)}
                        onChange={(e) => setCfgSel((p) => e.target.checked ? [...p, f.field_key] : p.filter((k) => k !== f.field_key))}
                        className="rounded border-slate-300" />
                      <span className="flex-1 min-w-0 truncate">{f.field_label}</span>
                      <span className="text-[10px] font-mono text-slate-300">{f.field_key}</span>
                    </label>
                  ))}
              </div>
              <div className="text-[11px] text-slate-400 mt-1.5">เลือกแล้ว {cfgSel.length} / {fields.length} ฟิลด์</div>
            </div>
          ) : !row ? (
            <div className="py-10 text-center text-slate-300 text-sm">— ไม่พบข้อมูล —</div>
          ) : editing ? (
            (() => {
              // โหมดแก้: จัดแท็บ/เซกชันเหมือนฟอร์มหน้าเต็ม + แท็บแกลเลอรี (ถ้าเปิด) · ไม่มี layout = กริดแบนเดิม
              const etabs = buildTabs(editVisible);
              if (galleryNode) etabs.push({ label: "📷 รูป", secs: [{ key: "__gallery__", label: "", fields: [] }] });
              const renderEditSecs = (secs: { key: string; label: string; fields: RF[] }[]) => secs.map((s) => {
                if (s.key === "__gallery__") return <div key="__gallery__">{galleryNode}</div>;
                return (
                  <div key={s.key} className="mb-3">
                    {s.label && <div className="text-xs font-semibold text-slate-500 mb-1.5 pb-0.5 border-b border-slate-100">{s.label}</div>}
                    <div className="grid grid-cols-2 gap-3">{s.fields.map(editFieldCell)}</div>
                  </div>
                );
              });
              if (etabs.length === 0) return <div className="grid grid-cols-2 gap-3">{editVisible.map(editFieldCell)}</div>;
              if (etabs.length === 1) return <>{renderEditSecs(etabs[0].secs)}</>;
              const ei = Math.min(editTab, etabs.length - 1);
              return (
                <>
                  <div className="flex gap-1 border-b border-slate-100 mb-3 flex-wrap">
                    {etabs.map((t, i) => (
                      <button key={i} onClick={() => setEditTab(i)}
                        className={`px-3 py-1.5 text-[13px] -mb-px border-b-2 ${i === ei ? "border-blue-500 text-blue-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
                    ))}
                  </div>
                  {renderEditSecs(etabs[ei].secs)}
                </>
              );
            })()
          ) : (
            <div className="flex gap-4">
              {img(cover) && (
                <button type="button" onClick={() => setZoom(img(cover)!)} title="กดดูรูปใหญ่"
                  className="w-40 h-40 flex-shrink-0 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img(cover)!} alt="" className="w-full h-full object-contain" />
                </button>
              )}
              <div className="flex-1 min-w-0 space-y-3">
                {(() => {
                  // ฟิลด์โหมดดู: ไม่เอ image (โชว์เป็นปก) + ผ่านเงื่อนไข show_if ตามค่า record
                  const viewFields = shownFields.filter((f) => f.ui_field_type !== "image" && evaluateCondition(f.condition_rules ?? null, row ?? {}));
                  const grid = (list: RF[]) => (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {list.map((f) => (
                        <div key={f.field_key} className="min-w-0">
                          <dt className="text-[11px] text-slate-400">{f.field_label}</dt>
                          <dd className="text-sm text-slate-700 truncate">{val(f)}</dd>
                        </div>
                      ))}
                    </dl>
                  );
                  // จัดเป็น "แท็บ" ตาม layout ฟอร์ม (Tab→Section) · ไม่มี layout → grid แบบเดิม
                  const bySec = new Map<string, RF[]>();
                  for (const f of viewFields) { const k = f.group_key || ""; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k)!.push(f); }
                  const known = new Set((layout?.tabs ?? []).flatMap((t) => t.sections.map((s) => s.key)));
                  const leftover = viewFields.filter((f) => !known.has(f.group_key || ""));
                  const vtabs = (layout?.tabs ?? [])
                    .map((t) => ({ label: t.label, secs: t.sections.filter((s) => (bySec.get(s.key)?.length ?? 0) > 0) }))
                    .filter((t) => t.secs.length > 0);
                  if (leftover.length) { bySec.set("__lo__", leftover); vtabs.push({ label: "อื่นๆ", secs: [{ key: "__lo__", label: "" }] }); }
                  if (reverseRels.length) vtabs.push({ label: "🧩 เกี่ยวข้อง", secs: [{ key: "__360__", label: "" }] });
                  if (galleryNode) vtabs.push({ label: "📷 รูป", secs: [{ key: "__gallery__", label: "" }] });
                  const normOf = (fs: RF[]) => fs.filter((f) => f.ui_field_type !== "one2many" && f.ui_field_type !== "many2many");
                  const o2mOf  = (fs: RF[]) => fs.filter((f) => f.ui_field_type === "one2many");
                  const m2mOf  = (fs: RF[]) => fs.filter((f) => f.ui_field_type === "many2many");
                  const renderSecs = (secs: { key: string; label: string }[]) => secs.map((s) => {
                    if (s.key === "__gallery__") return <div key="__gallery__">{galleryNode}</div>;
                    if (s.key === "__360__") return (
                      <div key="__360__" className="space-y-3">
                        {reverseRels.map((rr) => (
                          <RelationOne2Many key={`${rr.source_module_key}|${rr.fk_column}`} recordId={recordId} title={rr.source_label}
                            config={{ target_module_key: rr.source_module_key, target_fk_column: rr.fk_column, list_title_field: rr.label_field, list_image_field: rr.image_field ?? undefined, list_sub_fields: rr.sub_fields } as never} />
                        ))}
                      </div>
                    );
                    const fs = bySec.get(s.key) ?? [];
                    return (
                      <div key={s.key} className="mb-3">
                        {s.label && <div className="text-xs font-semibold text-slate-500 mb-1 pb-0.5 border-b border-slate-100">{s.label}</div>}
                        {normOf(fs).length > 0 && grid(normOf(fs))}
                        {m2mOf(fs).map((f) => (
                          <div key={f.field_key} className="mt-2">
                            <div className="text-[11px] text-slate-400 mb-0.5">{f.field_label}</div>
                            <RelationMany2Many config={(f.relation_config ?? {}) as never} recordId={recordId} editable={false} value={m2mLinks[f.field_key] ?? []} />
                          </div>
                        ))}
                        {o2mOf(fs).map((f) => (
                          <div key={f.field_key} className="mt-2">
                            <RelationOne2Many recordId={recordId} title={f.field_label} parentValues={row ?? undefined} config={(f.relation_config ?? {}) as never} />
                          </div>
                        ))}
                      </div>
                    );
                  });
                  if (vtabs.length === 0) return grid(normOf(viewFields));
                  if (vtabs.length === 1) return <>{renderSecs(vtabs[0].secs)}</>;
                  const ai = Math.min(activeTab, vtabs.length - 1);
                  return (
                    <>
                      <div className="flex gap-1 border-b border-slate-100 mb-3 flex-wrap">
                        {vtabs.map((t, i) => (
                          <button key={i} onClick={() => setActiveTab(i)}
                            className={`px-3 py-1.5 text-[13px] -mb-px border-b-2 ${i === ai ? "border-blue-500 text-blue-600 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
                        ))}
                      </div>
                      {renderSecs(vtabs[ai].secs)}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {err && <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">⚠ {err}</div>}
        </div>

        {cfgOpen && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2">
            <button onClick={() => void saveQuickCfg(null)} disabled={cfgSaving}
              title="ล้างค่า — กลับไปโชว์ทุกฟิลด์ตามทะเบียน"
              className="h-9 px-3 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50">↺ โชว์ทุกฟิลด์</button>
            <div className="flex-1" />
            <button onClick={() => { setCfgOpen(false); setErr(null); }} disabled={cfgSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void saveQuickCfg(cfgSel)} disabled={cfgSaving || cfgSel.length === 0}
              title={cfgSel.length === 0 ? "เลือกอย่างน้อย 1 ฟิลด์" : ""}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{cfgSaving ? "กำลังบันทึก..." : "บันทึก (ทุกคน)"}</button>
          </div>
        )}

        {editing && !cfgOpen && (
          <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={() => { setEditing(false); setErr(null); setFieldErrors({}); }} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        )}

        {!editing && !cfgOpen && !loading && row && (nav || onCopy) && (
          <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            {nav && (
              <>
                <button onClick={() => nav.onPrev?.()} disabled={!nav.onPrev} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40" title="รายการก่อนหน้า">◀ ก่อนหน้า</button>
                <button onClick={() => nav.onNext?.()} disabled={!nav.onNext} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40" title="รายการถัดไป">ถัดไป ▶</button>
                {nav.label && <span className="text-xs text-slate-400 ml-1">{nav.label}</span>}
              </>
            )}
            <div className="flex-1" />
            {onCopy && <button onClick={onCopy} className="h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1">⧉ คัดลอก</button>}
          </div>
        )}
      </div>

      {studioOpen && (
        <StudioLauncher
          moduleKey={moduleKey}
          moduleLabel={moduleKey}
          sampleRow={row}
          onClose={() => setStudioOpen(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
      {zoom && (
        <div className="fixed inset-0 z-[160] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>,
    document.body,
  );
}
