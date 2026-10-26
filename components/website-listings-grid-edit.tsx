"use client";
/**
 * ▦ แก้ไขทีละมาก (หน้า "สินค้าบนเว็บ" → ปุ่มหัวตาราง = ทั้งร้าน · แถบล่างตอนติ๊ก = เฉพาะที่เลือก)
 * --------------------------------------------------------------------------
 * ตารางแก้ได้ทุกแถว ค่าต่างกันได้ (ไม่ใช่ค่าเดียวทุกตัวแบบ ✏️ แก้หลายรายการ)
 *   - ทีละสินค้า: ช่องเว็บของร้านนี้ (ทะเบียน WEB_GRID_FIELDS ใน lib/website-listing-fields) + ทุกช่องของ Parent SKU (ทะเบียนฟิลด์กลาง)
 *   - ทีละสี: ทุกช่องของ SKU ลูก (ทะเบียนฟิลด์กลาง)
 *   ⚠️ ห้ามฝังรายการช่องในไฟล์นี้ — เพิ่มช่องที่ทะเบียน → ขึ้นในตัวเลือกช่องเอง · สิทธิ์เห็น/แก้ + ฟิลด์ลับ ตามทะเบียน (lib/registry-fields)
 *   - ตัวเลือกช่อง = FieldChipsPicker (ของกลาง) · พับเก็บได้ · จำช่องที่เลือก + พับ/กาง ต่อคน (useUserPref)
 *   - วางจาก Excel ได้ทีละหลายช่อง (lib/grid-edit) · ⤓ = ใช้ค่าแถวแรกทั้งคอลัมน์ · ช่องที่เปลี่ยน = สีเหลือง · ผิด = สีแดง
 * 🖼 แท็บรูปภาพ = components/website-listings-image-grid (Hero/รูปบนเว็บ/รูปสี ของหลายสินค้า · ลาก/เรียง/ย้าย/คลัง/รูป ERP) — กดบันทึกปุ่มเดียวกัน
 * บันทึกครั้งเดียว: ช่องเว็บ → POST /api/website/listings/grid (audit + ล้างแคชเว็บ) · ช่อง ERP → PATCH /api/master-v2/<module>/<id> ตัวกลางเดิม
 *   เกิน 20 แถวต้องพิมพ์ CONFIRM · สรุปสำเร็จ/ไม่สำเร็จรายแถว
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { apiFetch } from "@/lib/api";
import { cachedJson } from "@/lib/client-cache";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { FieldChipsPicker, type PickableField } from "@/components/field-chips-picker";
import { MoneyInput } from "@/components/money-input";
import { DateInput } from "@/components/date-input";
import { RelationPicker, type RelationConfig } from "@/components/relation-picker";
import { useCardBadges } from "@/components/website-card-badges";
import { useUserPref } from "@/lib/use-user-pref";
import type { FieldRegistryV2Response, FormField } from "@/app/api/admin/field-registry-v2/route";
import { registryCanView, registryFieldChoices, registryFieldType, registryGridEditable } from "@/lib/registry-fields";
import { STOCK_STATUS_OPTIONS, WEB_GRID_FIELDS, webGridPatch, webGridValidate, type WebGridRow } from "@/lib/website-listing-fields";
import { coerceCell, erpWriteValue, parseClipboardGrid, sameCell, type GridKind, type GridValue } from "@/lib/grid-edit";
import { listingIssues } from "@/lib/website-listing-health";
import { PARENT_FIELD_GROUP_LABEL } from "@/lib/website-parent-fields";
import type { CategoryDef, Listing, ShopInfo } from "@/components/website-listings-panel";
import { WebsiteListingsImageGrid, type ImageGridHandle } from "@/components/website-listings-image-grid";
import { WebsiteImageMassUpload } from "@/components/website-image-mass-upload";

type Level = "product" | "color";
type Source = "web" | "parent" | "sku";
type Col = {
  id: string;
  source: Source;
  label: string;
  group: string;
  kind: GridKind;
  editable: boolean;
  required?: boolean;
  sensitive?: boolean;
  /** ทะเบียนตั้ง "โชว์ในตารางหลัก" */
  visible?: boolean;
  webKey?: string;
  column?: string;
  choices?: { value: string; label: string }[];
  relation?: RelationConfig;
};
type Row = Record<string, unknown>;
type GridRow = { key: string; parentId: string; code: string; name: string; web?: WebGridRow; erp: Row };
type Loaded = { listings: WebGridRow[]; parents: Row[]; skus: Row[]; pcols: string[]; scols: string[] };

const MODULE: Record<"parent" | "sku", string> = { parent: "parent-skus-v2", sku: "skus-v2" };
const CONFIRM_OVER = 20;
const PAGE = 100;
const SAVE_CONCURRENCY = 4;
const SKIP_UI = new Set(["image", "many2many", "one2many", "computed", "json", "related"]);
const WIDTH: Partial<Record<GridKind, number>> = { textarea: 260, text: 200, codes: 200, money: 120, number: 110, bool: 84, date: 150, relation: 210, categories: 240 };
const cellCls = "w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-400";

const kindOf = (rf: FormField): GridKind => {
  const t = registryFieldType(rf.ui_field_type);
  if (t === "number") return registryFieldChoices(rf).currencyCode || registryFieldChoices(rf).currencyField ? "money" : "number";
  return t === "boolean" ? "bool" : t === "select" ? "select" : t === "date" ? "date" : t === "relation" ? "relation" : t === "textarea" ? "textarea" : "text";
};

export function WebsiteListingsGridEdit({
  open,
  onClose,
  shop,
  listings,
  categories,
  scopeIds,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  shop: ShopInfo;
  /** รายการของหน้า "สินค้าบนเว็บ" (ชื่อที่ลูกค้าเห็น · ค่าอัตโนมัติ · ป้ายต้องแก้ · ลำดับ) */
  listings: Listing[];
  categories: CategoryDef[];
  /** ติ๊กไว้ = เฉพาะรุ่นเหล่านี้ · ไม่ส่ง/ว่าง = ทั้งร้าน */
  scopeIds?: string[] | null;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const { user, can } = useAuth();
  const role = user?.role ?? null;
  const [level, setLevel] = useState<Level>("product");
  const [reg, setReg] = useState<{ parent: FieldRegistryV2Response | null; sku: FieldRegistryV2Response | null }>({ parent: null, sku: null });
  const [data, setData] = useState<Partial<Record<Level, Loaded>>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<Level, Record<string, Record<string, GridValue>>>>({ product: {}, color: {} });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [onlyFix, setOnlyFix] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [typed, setTyped] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: number; failed: { label: string; error: string }[] } | null>(null);
  // แท็บ ▦ ข้อมูล / 🖼 รูปภาพ · รูปที่แก้ค้าง (นับช่อง) · โหลดแผนที่รูปใหม่ · ป๊อปลงทั้งโฟลเดอร์
  const [tab, setTab] = useState<"data" | "images">("data");
  const imgRef = useRef<ImageGridHandle>(null);
  const [imgDirty, setImgDirty] = useState(0);
  const [imgReload, setImgReload] = useState(0);
  const [folderOpen, setFolderOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useUserPref<boolean>("website_grid_picker_open", true, (v) => (typeof v === "boolean" ? v : null));
  const parseIds = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  const [prodCols, setProdCols] = useUserPref<string[]>("website_grid_cols_product", [], parseIds);
  const [colorCols, setColorCols] = useUserPref<string[]>("website_grid_cols_color", [], parseIds);
  const badges = useCardBadges(open ? shop.id : null);
  const [sizeGuides, setSizeGuides] = useState<{ id: string; name: string }[]>([]);

  // ---- โหลด: ทะเบียนฟิลด์ (cache) · ข้อมูลระดับที่เปิด · ตารางไซส์ ----
  useEffect(() => {
    if (!open) return;
    setDraft({ product: {}, color: {} });
    setErrors({});
    setResult(null);
    setErr(null);
    setTyped("");
    setData({});
    void Promise.all([
      cachedJson<FieldRegistryV2Response>(`/api/admin/field-registry-v2?module=${MODULE.parent}`).catch(() => null),
      cachedJson<FieldRegistryV2Response>(`/api/admin/field-registry-v2?module=${MODULE.sku}`).catch(() => null),
    ]).then(([parent, sku]) => setReg({ parent, sku }));
    void apiFetch(`/api/website/size-guides?shopId=${encodeURIComponent(shop.id)}`)
      .then((r) => r.json())
      .then((j) => setSizeGuides(Array.isArray(j?.guides) ? j.guides.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })) : []))
      .catch(() => setSizeGuides([]));
  }, [open, shop.id]);

  // โหลดเฉพาะคอลัมน์ ERP ที่เลือกไว้ (SKU นับพันแถว × ทุกคอลัมน์ = หนักเกิน) · เลือกช่องเพิ่ม = โหลดเพิ่มเอง (ดู effect ด้านล่าง)
  const loadingRef = useRef(false);
  const loadLevel = async (lv: Level, pcols: string[], scols: string[]) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadErr(null);
    try {
      const qs = new URLSearchParams({ shopId: shop.id, level: lv, pcols: pcols.join(","), scols: scols.join(",") });
      const r = await apiFetch(`/api/website/listings/grid?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "โหลดไม่สำเร็จ");
      setData((d) => ({ ...d, [lv]: { listings: j.listings ?? [], parents: j.parents ?? [], skus: j.skus ?? [], pcols, scols } }));
    } catch (e) {
      setLoadErr((e as Error).message || "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
    } finally {
      loadingRef.current = false;
    }
  };

  // ---- คอลัมน์ทั้งหมดจากทะเบียน ----
  const allCols = useMemo(() => {
    const erpCols = (source: "parent" | "sku", r: FieldRegistryV2Response | null): Col[] => {
      if (!r?.fields) return [];
      const sectionLabel = new Map<string, string>();
      for (const t of r.layout?.tabs ?? []) for (const s of t.sections) sectionLabel.set(s.key, s.label);
      return [...r.fields]
        .filter((rf) => rf.column_name && !SKIP_UI.has(rf.ui_field_type) && !SKIP_UI.has(registryFieldType(rf.ui_field_type)))
        .filter((rf) => registryCanView(rf, { role, can: (p) => can(p as Parameters<typeof can>[0]) }))
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((rf) => {
          const ch = registryFieldChoices(rf);
          const g = rf.group_key || "other";
          return {
            id: `${source === "parent" ? "p" : "s"}:${rf.column_name}`,
            source,
            label: rf.field_label,
            group: `${source}:${g}`,
            kind: kindOf(rf),
            editable: registryGridEditable(rf, role),
            required: rf.is_required,
            sensitive: rf.is_sensitive,
            visible: rf.is_visible,
            column: rf.column_name as string,
            choices: ch.options?.map((o) => ({ value: o, label: ch.optionLabels?.[o] || o })),
            relation: (rf.relation_config as RelationConfig | undefined)?.target_table ? (rf.relation_config as RelationConfig) : undefined,
            _groupLabel: sectionLabel.get(g) ?? PARENT_FIELD_GROUP_LABEL[g] ?? g,
          } as Col & { _groupLabel: string };
        });
    };
    const web: Col[] = WEB_GRID_FIELDS.map((f) => ({
      id: `w:${f.key}`,
      source: "web",
      label: f.label,
      group: "web",
      kind: f.kind,
      editable: true,
      webKey: f.key,
      choices: f.kind === "stock" ? STOCK_STATUS_OPTIONS : undefined,
    }));
    return { product: [...web, ...erpCols("parent", reg.parent)], color: erpCols("sku", reg.sku) };
  }, [reg, role, can]);

  const groupLabels = useMemo(() => {
    const out: Record<string, string> = { web: `🌐 เว็บร้านนี้ (เฉพาะ ${shop.name})` };
    for (const c of [...allCols.product, ...allCols.color] as (Col & { _groupLabel?: string })[]) {
      if (c.source === "parent") out[c.group] = `📦 Parent SKU · ${c._groupLabel} (ทุกร้านเห็น)`;
      if (c.source === "sku") out[c.group] = `🎨 SKU ลูก · ${c._groupLabel} (ทุกร้านเห็น)`;
    }
    return out;
  }, [allCols, shop.name]);

  const cols = allCols[level];
  const colById = useMemo(() => new Map(cols.map((c) => [c.id, c])), [cols]);
  // ค่าเริ่มต้น (ก่อนคนเลือกเอง) — ทีละสี: ช่องที่ทะเบียนตั้ง "โชว์ในตาราง" + แก้ได้ + ไม่บังคับ + ไม่ใช่ลิงก์/สวิตช์ (กันแก้รหัส/ย้ายรุ่น/ปิดใช้งานโดยไม่ตั้งใจ)
  const defaults =
    level === "product"
      ? ["w:webName", "w:webPrice", "w:webStockStatus", "w:published"]
      : cols.filter((c) => c.visible && c.editable && !c.required && c.kind !== "relation" && c.kind !== "bool").slice(0, 4).map((c) => c.id);
  const prefCols = level === "product" ? prodCols : colorCols;
  const chosenIds = (prefCols.length ? prefCols : defaults).filter((id) => colById.has(id));
  const setChosen = (ids: string[]) => (level === "product" ? setProdCols(ids) : setColorCols(ids));
  const shownCols = chosenIds.map((id) => colById.get(id)!).filter(Boolean);
  const pickable: PickableField[] = cols.map((c) => ({
    key: c.id,
    label: c.label,
    group: c.group,
    hint: !c.editable ? "อ่านอย่างเดียว" : c.sensitive ? "🔒 ข้อมูลลับ" : undefined,
  }));

  // ---- แถว ----
  const listingById = useMemo(() => new Map(listings.map((l) => [l.parentId, l])), [listings]);
  const order = useMemo(() => new Map(listings.map((l, i) => [l.parentId, i])), [listings]);
  const scope = useMemo(() => (scopeIds?.length ? new Set(scopeIds) : null), [scopeIds]);
  const fixSet = useMemo(() => {
    const s = new Set<string>();
    for (const l of listings) {
      if (!l.display) continue;
      if (listingIssues({ price: l.display.price, imageCount: l.display.imageCount, categories: l.categories ?? [], colors: l.display.colors, compartmentsMissing: l.display.compartmentsMissing }).length) s.add(l.parentId);
    }
    return s;
  }, [listings]);
  const primarySku = reg.sku?.primary_field ?? null;

  const rows: GridRow[] = useMemo(() => {
    const d = data[level];
    if (!d) return [];
    const parents = new Map(d.parents.map((p) => [String(p.id), p]));
    const nameOf = (pid: string) => {
      const l = listingById.get(pid);
      return l?.display?.name || l?.webName || l?.erpName || "";
    };
    if (level === "product") {
      return d.listings
        .map((w) => {
          const p = parents.get(w.parent_sku_id) ?? {};
          return { key: w.parent_sku_id, parentId: w.parent_sku_id, code: String(p.code ?? listingById.get(w.parent_sku_id)?.code ?? ""), name: nameOf(w.parent_sku_id), web: w, erp: p };
        })
        .sort((a, b) => (order.get(a.parentId) ?? 1e9) - (order.get(b.parentId) ?? 1e9));
    }
    return d.skus.map((k) => {
      const pid = String(k.parent_sku_id ?? "");
      const nm = primarySku && primarySku !== "code" ? String(k[primarySku] ?? "") : "";
      return { key: String(k.id), parentId: pid, code: String(k.code ?? ""), name: nm || `${String(parents.get(pid)?.code ?? "")}`, erp: k };
    });
  }, [data, level, listingById, order, primarySku]);

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => (!scope || scope.has(r.parentId)) && (!onlyFix || fixSet.has(r.parentId)) && (!ql || r.code.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql)));
  }, [rows, scope, onlyFix, fixSet, q]);
  const page = visible.slice(0, limit);
  // แท็บรูปภาพใช้ตัวกรองชุดเดียวกัน (ติ๊กไว้ · เฉพาะที่ต้องแก้ · ค้นหา)
  const imgRowFilter = useCallback(
    (r: { parentId: string; code: string; name: string }) => {
      const ql = q.trim().toLowerCase();
      return (!scope || scope.has(r.parentId)) && (!onlyFix || fixSet.has(r.parentId)) && (!ql || r.code.toLowerCase().includes(ql) || r.name.toLowerCase().includes(ql));
    },
    [q, scope, onlyFix, fixSet],
  );

  // ---- โหลด/โหลดเพิ่ม: ระดับที่เปิด + คอลัมน์ ERP ที่เลือก (ที่โหลดไว้แล้วไม่โหลดซ้ำ) ----
  const needP = level === "product" ? shownCols.filter((c) => c.source === "parent").map((c) => c.column as string) : [];
  const needS = level === "color" ? [...shownCols.filter((c) => c.source === "sku").map((c) => c.column as string), ...(primarySku ? [primarySku] : [])] : [];
  const needKey = `${level}|${needP.join(",")}|${needS.join(",")}`;
  const regReady = level === "product" ? !!reg.parent : !!reg.sku;
  useEffect(() => {
    if (!open || !regReady) return;
    const d = data[level];
    const missing = needP.some((c) => !d?.pcols.includes(c)) || needS.some((c) => !d?.scols.includes(c));
    if (d && !missing) return;
    void loadLevel(level, [...new Set([...(d?.pcols ?? []), ...needP])], [...new Set([...(d?.scols ?? []), ...needS])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, regReady, needKey, data[level]]);

  // ---- ค่า ----
  const origOf = (r: GridRow, c: Col): GridValue => {
    if (c.source === "web") return r.web ? (WEB_GRID_FIELDS.find((f) => f.key === c.webKey)?.read(r.web) ?? "") : "";
    const v = r.erp[c.column as string];
    if (c.kind === "bool") return v === true;
    if (v == null) return "";
    if (c.kind === "date") return String(v).slice(0, 10);
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  const valOf = (r: GridRow, c: Col): GridValue => {
    const d = draft[level][r.key];
    return d && c.id in d ? d[c.id] : origOf(r, c);
  };
  const setCell = (r: GridRow, c: Col, v: GridValue) => {
    setResult(null);
    setErrors((e) => {
      const k = `${level}|${r.key}|${c.id}`;
      if (!(k in e)) return e;
      const n = { ...e };
      delete n[k];
      return n;
    });
    setDraft((d) => {
      const lv = { ...d[level] };
      const one = { ...(lv[r.key] ?? {}) };
      if (sameCell(v, origOf(r, c))) delete one[c.id];
      else one[c.id] = v;
      if (Object.keys(one).length) lv[r.key] = one;
      else delete lv[r.key];
      return { ...d, [level]: lv };
    });
  };
  const autoOf = (r: GridRow, c: Col): string => {
    if (c.source !== "web") return "";
    const l = listingById.get(r.parentId);
    if (!l) return "";
    if (c.webKey === "webName") return l.mapped?.name || l.erpName || "";
    if (c.webKey === "webPrice") return l.mapped?.price ? String(l.mapped.price) : "";
    if (c.webKey === "webDescription") return (l.mapped?.description || "").slice(0, 80);
    if (c.webKey === "webUnit") return l.mapped?.unit || "";
    return "";
  };

  const dirtyCells = Object.values(draft).reduce((n, lv) => n + Object.values(lv).reduce((m, one) => m + Object.keys(one).length, 0), 0);
  const dirtyRows = Object.values(draft).reduce((n, lv) => n + Object.keys(lv).length, 0);
  const totalDirty = dirtyCells + imgDirty;
  const needConfirm = dirtyRows + imgDirty > CONFIRM_OVER;

  // ---- วางจาก Excel / เติมทั้งคอลัมน์ ----
  const onPaste = (e: ClipboardEvent<HTMLTableSectionElement>) => {
    const cell = (e.target as HTMLElement).closest("[data-cell]") as HTMLElement | null;
    if (!cell) return;
    const grid = parseClipboardGrid(e.clipboardData.getData("text/plain"));
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return; // ช่องเดียว = วางปกติ
    e.preventDefault();
    const r0 = Number(cell.dataset.r);
    const c0 = Number(cell.dataset.c);
    let put = 0;
    let skip = 0;
    grid.forEach((line, i) =>
      line.forEach((raw, j) => {
        const r = page[r0 + i];
        const c = shownCols[c0 + j];
        if (!r || !c || !c.editable) return void skip++;
        const v = coerceCell(c.kind, raw, c.kind === "categories" ? categories.map((x) => ({ value: x.key, label: x.label })) : c.kind === "badge" ? badges.map((b) => ({ value: b.name, label: b.name })) : c.kind === "sizeGuide" ? sizeGuides.map((g) => ({ value: g.id, label: g.name })) : c.choices);
        if (v === undefined) return void skip++;
        setCell(r, c, v);
        put++;
      }),
    );
    toast.info(`วาง ${put} ช่อง${skip ? ` · ข้าม ${skip} ช่อง (ค่าใช้ไม่ได้/แก้ไม่ได้)` : ""}`);
  };
  const fillDown = (c: Col) => {
    if (!c.editable || !page.length) return;
    const v = valOf(page[0], c);
    for (const r of visible) setCell(r, c, v);
    toast.info(`ใช้ค่าแถวแรกกับ ${visible.length} แถว (ยังไม่บันทึก)`);
  };

  // ---- บันทึก ----
  const save = async () => {
    setErr(null);
    setResult(null);
    const errs: Record<string, string> = {};
    const web = new Map<string, { row: WebGridRow; changes: Record<string, GridValue> }>();
    const erp: { module: string; id: string; label: string; patch: Record<string, unknown> }[] = [];
    for (const lv of ["product", "color"] as Level[]) {
      const d = data[lv];
      if (!d) continue;
      const lvCols = new Map(allCols[lv].map((c) => [c.id, c]));
      const byKey = new Map<string, Row>(lv === "product" ? d.parents.map((p) => [String(p.id), p]) : d.skus.map((k) => [String(k.id), k]));
      const wByPid = new Map(d.listings.map((w) => [w.parent_sku_id, w]));
      for (const [key, one] of Object.entries(draft[lv])) {
        const erpRow = byKey.get(key) ?? {};
        const label = String(erpRow.code ?? key);
        const patches: Record<"parent" | "sku", Record<string, unknown>> = { parent: {}, sku: {} };
        for (const [cid, v] of Object.entries(one)) {
          const c = lvCols.get(cid);
          if (!c || !c.editable) continue;
          const ek = `${lv}|${key}|${cid}`;
          if (c.source === "web") {
            const msg = webGridValidate(c.webKey as string, v as never);
            if (msg) errs[ek] = msg;
            const w = wByPid.get(key);
            if (!w) continue;
            const cur = web.get(key) ?? { row: w, changes: {} };
            cur.changes[c.webKey as string] = v;
            web.set(key, cur);
            continue;
          }
          const empty = v === "" || v == null || (Array.isArray(v) && !v.length);
          if (c.required && empty) {
            errs[ek] = "ช่องบังคับ ห้ามเว้นว่าง";
            continue;
          }
          const w = erpWriteValue(c.kind, v);
          if ("error" in w) errs[ek] = w.error;
          else patches[c.source as "parent" | "sku"][c.column as string] = w.value;
        }
        for (const src of ["parent", "sku"] as const) if (Object.keys(patches[src]).length) erp.push({ module: MODULE[src], id: key, label, patch: patches[src] });
      }
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      return setErr(`มี ${Object.keys(errs).length} ช่องที่ต้องแก้ก่อนบันทึก (ช่องสีแดง — ชี้เพื่อดูเหตุผล)`);
    }
    if (needConfirm && typed !== "CONFIRM") return setErr(`แก้ ${dirtyRows + imgDirty} รายการพร้อมกัน — พิมพ์ CONFIRM ก่อนบันทึก`);

    const failed: { label: string; error: string }[] = [];
    let ok = 0;
    const doneKeys = new Set<string>();
    if (web.size) {
      setSaving("กำลังบันทึกช่องเว็บ…");
      try {
        const r = await apiFetch("/api/website/listings/grid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: shop.id, changes: [...web.entries()].map(([pid, x]) => ({ parentId: pid, patch: webGridPatch(x.row, x.changes as never) })) }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "บันทึกช่องเว็บไม่สำเร็จ");
        const bad = new Set(((j.failed ?? []) as { parentId: string }[]).map((f) => f.parentId));
        for (const pid of web.keys()) {
          const code = String(data.product?.parents.find((p) => String(p.id) === pid)?.code ?? pid);
          if (bad.has(pid)) failed.push({ label: code, error: "บันทึกช่องเว็บไม่สำเร็จ" });
          else {
            ok++;
            doneKeys.add(`web|${pid}`);
          }
        }
      } catch (e) {
        failed.push({ label: "ช่องเว็บ", error: (e as Error).message });
      }
    }
    let next = 0;
    let n = 0;
    const worker = async () => {
      while (next < erp.length) {
        const job = erp[next++];
        setSaving(`กำลังบันทึก ERP ${++n}/${erp.length}…`);
        try {
          const r = await apiFetch(`/api/master-v2/${job.module}/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job.patch) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || j?.error) failed.push({ label: job.label, error: j?.error || "บันทึกไม่สำเร็จ" });
          else {
            ok++;
            doneKeys.add(`${job.module}|${job.id}`);
          }
        } catch {
          failed.push({ label: job.label, error: "เชื่อมต่อไม่ได้" });
        }
      }
    };
    await Promise.all(Array.from({ length: SAVE_CONCURRENCY }, worker));
    // 🖼 รูปที่แก้ในแท็บรูปภาพ
    if (imgRef.current?.dirty()) {
      setSaving("กำลังบันทึกรูป…");
      const ir = await imgRef.current.save();
      ok += ir.ok;
      failed.push(...ir.failed);
    }
    setSaving(null);

    // ล้างช่องที่บันทึกแล้ว (แถวที่พลาดคงไว้ให้แก้ต่อ)
    setDraft((d) => {
      const out: typeof d = { product: { ...d.product }, color: { ...d.color } };
      for (const lv of ["product", "color"] as Level[]) {
        for (const [key, one] of Object.entries(out[lv])) {
          const keep: Record<string, GridValue> = {};
          for (const [cid, v] of Object.entries(one)) {
            const src = cid.startsWith("w:") ? `web|${key}` : cid.startsWith("p:") ? `${MODULE.parent}|${key}` : `${MODULE.sku}|${key}`;
            if (!doneKeys.has(src)) keep[cid] = v;
          }
          if (Object.keys(keep).length) out[lv][key] = keep;
          else delete out[lv][key];
        }
      }
      return out;
    });
    setTyped("");
    setResult({ ok, failed });
    if (failed.length) toast.warning(`บันทึกแล้ว ${ok} รายการ · ไม่สำเร็จ ${failed.length}`);
    else toast.success(`บันทึก ${ok} รายการแล้ว — เว็บเปลี่ยนตามทันที`);
    setData({});
    void onDone();
  };

  const busy = !!saving;
  const close = () => {
    if (busy) return toast.info("กำลังบันทึกอยู่ รอให้เสร็จก่อน");
    onClose();
  };

  // ---- ช่องแก้ตามชนิด ----
  const editor = (r: GridRow, c: Col) => {
    const v = valOf(r, c);
    const sv = v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
    if (!c.editable) {
      const label = c.kind === "relation" ? String(r.erp[`${(c.column ?? "").replace(/_id$/, "")}_label`] ?? sv) : c.kind === "bool" ? (v ? "✓" : "—") : sv;
      return <span className="block truncate px-1 text-sm text-slate-500" title={label}>{label || "—"}</span>;
    }
    const set = (x: GridValue) => setCell(r, c, x);
    const ph = autoOf(r, c);
    switch (c.kind) {
      case "bool":
        return <input type="checkbox" checked={v === true} onChange={(e) => set(e.target.checked)} className="h-4 w-4 accent-blue-600" aria-label={c.label} />;
      case "money":
        return <MoneyInput value={sv} onChange={(raw) => set(raw)} placeholder={ph || "—"} className={`${cellCls} text-right tabular-nums`} />;
      case "number":
        return <input value={sv} inputMode="decimal" onChange={(e) => set(e.target.value)} className={`${cellCls} text-right tabular-nums`} />;
      case "textarea":
        return <textarea value={sv} rows={1} placeholder={ph} onChange={(e) => set(e.target.value)} className={`${cellCls} h-8 resize-y py-1 leading-5 focus:h-24`} />;
      case "date":
        return <DateInput value={sv} onChange={(iso) => set(iso)} className={cellCls} />;
      case "select":
      case "stock":
        return (
          <select value={sv} onChange={(e) => set(e.target.value)} className={cellCls}>
            {c.kind === "select" && <option value="">—</option>}
            {(c.choices ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      case "badge":
        return (
          <select value={sv} onChange={(e) => set(e.target.value)} className={cellCls}>
            <option value="">— ไม่มีป้าย —</option>
            {sv && !badges.some((b) => b.name === sv) && <option value={sv}>{sv}</option>}
            {badges.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
        );
      case "sizeGuide":
        return (
          <select value={sv} onChange={(e) => set(e.target.value)} className={cellCls}>
            <option value="">อัตโนมัติตามหมวด</option>
            <option value="none">ไม่แสดง</option>
            {sizeGuides.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        );
      case "categories":
        return (
          <FieldChipsPicker
            compact
            value={Array.isArray(v) ? v : []}
            onChange={(keys) => set(keys)}
            fields={categories.map((x) => ({ key: x.key, label: x.label, icon: x.icon || undefined }))}
            showKeys={false}
            markFirst="หมวดหลัก"
            addLabel="＋ หมวด"
            unit="หมวด"
            title={`หมวดบนเว็บ — ${r.code}`}
            description="ตัวแรก = หมวดหลัก"
            searchPlaceholder="ค้นหาหมวด…"
            emptyText={listingById.get(r.parentId)?.categories?.length ? "ใช้หมวดเดิม" : undefined}
          />
        );
      case "relation":
        return <RelationCell row={r} col={c} value={sv} onChange={(id) => set(id ?? "")} />;
      default:
        return <input value={sv} placeholder={ph} onChange={(e) => set(e.target.value)} className={cellCls} />;
    }
  };

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="min-w-[12rem] flex-1 text-xs">
        {err ? (
          <span className="text-rose-600">{err}</span>
        ) : saving ? (
          <span className="text-slate-600">{saving}</span>
        ) : result ? (
          <span className={result.failed.length ? "text-amber-700" : "text-emerald-700"}>
            บันทึกแล้ว {result.ok} รายการ{result.failed.length ? ` · ไม่สำเร็จ ${result.failed.length}: ${result.failed.slice(0, 4).map((f) => `${f.label} (${f.error})`).join(" · ")}` : " — เว็บเปลี่ยนตามทันที"}
          </span>
        ) : (
          <span className="text-slate-500">{totalDirty ? `แก้${dirtyCells ? ` ข้อมูล ${dirtyCells} ช่อง (${dirtyRows} แถว)` : ""}${imgDirty ? ` รูป ${imgDirty} ช่อง` : ""} — ช่องสีเหลือง = ยังไม่บันทึก` : "ยังไม่ได้แก้อะไร"}</span>
        )}
      </div>
      {needConfirm && !busy && <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="พิมพ์ CONFIRM" className="h-9 w-36 rounded-lg border border-rose-300 px-2 font-mono text-sm" />}
      {totalDirty > 0 && !busy && (
        <button type="button" onClick={() => { setDraft({ product: {}, color: {} }); imgRef.current?.discard(); setErrors({}); setErr(null); }} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">
          ยกเลิกที่แก้
        </button>
      )}
      <button type="button" onClick={() => void save()} disabled={busy || !totalDirty || (needConfirm && typed !== "CONFIRM")} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
        {busy ? "กำลังบันทึก…" : totalDirty ? `บันทึก ${totalDirty} ช่อง` : "บันทึก"}
      </button>
    </div>
  );

  const loaded = data[level];
  return (
    <ERPModal
      open={open}
      onClose={close}
      title={`▦ แก้ไขทีละมาก — ${shop.name}`}
      description={scope ? `เฉพาะ ${scope.size} รายการที่ติ๊กไว้ · ช่องจากทะเบียนฟิลด์กลาง` : "แก้ได้ทุกแถว ค่าต่างกันได้ · ช่องจากทะเบียนฟิลด์กลาง · วางจาก Excel ได้"}
      size="xl"
      hasUnsavedChanges={totalDirty > 0}
      closeOnBackdrop={false}
      footer={footer}
    >
      <div className="space-y-3">
        {/* ระดับ + ค้นหา + ตัวกรอง */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
            {(["product", "color"] as Level[]).map((lv) => (
              <button key={lv} type="button" onClick={() => { setLevel(lv); setLimit(PAGE); }} className={`px-3 py-1.5 text-xs ${level === lv ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                {lv === "product" ? "ทีละสินค้า" : "ทีละสี (SKU ลูก)"}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส หรือชื่อ" className="h-8 min-w-[160px] flex-1 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-blue-400" />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={onlyFix} onChange={(e) => setOnlyFix(e.target.checked)} className="h-4 w-4 accent-amber-500" />
            เฉพาะสินค้าที่ต้องแก้ ({fixSet.size})
          </label>
        </div>

        {/* แท็บ */}
        <div className="flex gap-1 border-b border-slate-200">
          {([["data", "▦ ข้อมูล", dirtyCells], ["images", "🖼 รูปภาพ", imgDirty]] as const).map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === k ? "border-blue-600 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {label}
              {n > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-800">{n}</span>}
            </button>
          ))}
        </div>

        {/* 🖼 รูปภาพ — คงไว้ตลอด (ซ่อนเมื่ออยู่แท็บข้อมูล) ไม่ให้รูปที่แก้ค้างหาย */}
        <div className={tab === "images" ? "" : "hidden"}>
          <WebsiteListingsImageGrid
            ref={imgRef}
            shopId={shop.id}
            level={level}
            listings={listings}
            rowFilter={imgRowFilter}
            onDirtyChange={setImgDirty}
            onOpenFolderUpload={() => setFolderOpen(true)}
            reloadKey={imgReload}
          />
        </div>
        {tab === "data" && (<>
        {/* ตัวเลือกช่อง (พับได้ · จำต่อคน) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60">
          <button type="button" onClick={() => setPickerOpen(!pickerOpen)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700">
            <span className="text-slate-400">{pickerOpen ? "▾" : "▸"}</span>
            <span className="font-medium">ช่องที่จะแก้ ({shownCols.length}/{cols.length})</span>
            {!pickerOpen && <span className="truncate text-xs text-slate-500">{shownCols.map((c) => c.label).join(" · ")}</span>}
            <span className="ml-auto text-[11px] text-slate-400">{pickerOpen ? "พับเก็บ" : "กางเลือกช่อง"}</span>
          </button>
          {pickerOpen && (
            <div className="border-t border-slate-200 px-3 py-2.5">
              <FieldChipsPicker
                value={chosenIds}
                onChange={setChosen}
                fields={pickable}
                groups={groupLabels}
                groupToggle
                showKeys={false}
                title={level === "product" ? "เลือกช่องที่จะแก้ — ทีละสินค้า" : "เลือกช่องที่จะแก้ — ทีละสี"}
                description="ทุกช่องมาจากทะเบียนฟิลด์กลาง (เพิ่มช่องที่ทะเบียน = ขึ้นที่นี่เอง) · 🌐 = เฉพาะร้านนี้ · 📦/🎨 = แก้ที่ ERP ทุกร้านเห็น · รูป/แท็ก/รายการย่อย แก้ที่หน้าสินค้า"
                addLabel="＋ เลือกช่อง…"
                searchPlaceholder="ค้นหาช่อง เช่น ราคา วัสดุ SEO"
                unit="ช่อง"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">ตารางแสดงตามลำดับที่เลือก · จำไว้ต่อคน</p>
            </div>
          )}
        </div>

        {/* ตาราง */}
        {loadErr ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {loadErr}{" "}
            <button type="button" onClick={() => { setLoadErr(null); setData((d) => ({ ...d, [level]: undefined })); }} className="ml-1 underline">
              ลองใหม่
            </button>
          </div>
        ) : !loaded || (level === "product" ? !reg.parent : !reg.sku) ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : !visible.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">ไม่พบแถว ลองเปลี่ยนคำค้นหรือเอาตัวกรองออก</div>
        ) : !shownCols.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">ยังไม่ได้เลือกช่อง — กด "＋ เลือกช่อง…" ด้านบน</div>
        ) : (
          <div className="max-h-[62vh] overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 w-56 min-w-[14rem] border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-medium text-slate-500">
                    {level === "product" ? "สินค้า" : "สี / SKU"} ({visible.length})
                  </th>
                  {shownCols.map((c) => (
                    <th key={c.id} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2 text-left text-[11px] font-medium text-slate-500" style={{ minWidth: WIDTH[c.kind] ?? 160 }}>
                      <span className="flex items-center gap-1">
                        <span title={groupLabels[c.group]}>{c.source === "web" ? "🌐" : c.source === "parent" ? "📦" : "🎨"}</span>
                        <span className="truncate">{c.label}</span>
                        {c.required && <span className="text-rose-500">*</span>}
                        {c.editable && c.kind !== "relation" && (
                          <button type="button" onClick={() => fillDown(c)} title="ใช้ค่าแถวแรกกับทุกแถวที่เห็น" className="ml-auto rounded px-1 text-blue-600 hover:bg-blue-50">
                            ⤓
                          </button>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody onPaste={onPaste}>
                {page.map((r, ri) => {
                  const issues = level === "product" && fixSet.has(r.parentId);
                  return (
                    <tr key={r.key} className="align-top">
                      <td className="sticky left-0 z-[5] border-b border-slate-100 bg-white px-3 py-1.5">
                        <div className="text-[13px] font-medium text-slate-800">{r.code}</div>
                        <div className="max-w-[13rem] truncate text-[11px] text-slate-500" title={r.name}>
                          {issues && <span className="mr-1 text-amber-600">⚠️</span>}
                          {r.name}
                        </div>
                      </td>
                      {shownCols.map((c, ci) => {
                        const k = `${level}|${r.key}|${c.id}`;
                        const changed = !!draft[level][r.key] && c.id in draft[level][r.key];
                        const bad = errors[k];
                        return (
                          <td key={c.id} data-cell data-r={ri} data-c={ci} title={bad} className={`border-b border-slate-100 px-1.5 py-1 ${bad ? "bg-rose-50" : changed ? "bg-amber-50" : ""}`}>
                            {editor(r, c)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length > page.length && (
              <div className="border-t border-slate-100 p-2 text-center">
                <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="text-xs text-blue-600 hover:underline">
                  แสดงเพิ่มอีก {Math.min(PAGE, visible.length - page.length)} แถว (เห็น {page.length}/{visible.length})
                </button>
              </div>
            )}
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          วางจาก Excel ได้ทีละหลายช่อง (คลิกช่องเริ่มแล้ว Ctrl+V) · ⤓ ที่หัวคอลัมน์ = ใช้ค่าแถวแรกกับทุกแถวที่เห็น · ช่องเว็บว่าง = ใช้ค่าอัตโนมัติ (ตัวจาง) · ช่อง 📦/🎨 แก้ที่ ERP จริง ทุกร้าน/ทุกหน้าเห็นค่าใหม่ ·
          บันทึกประวัติทุกช่อง
        </p>
        </>)}
        {/* 📁 ลงทั้งโฟลเดอร์ (ระบบ 📸 ลงรูปทีละมากเดิม) → เสร็จแล้วโหลดแผนที่รูปใหม่ */}
        {folderOpen && (
          <WebsiteImageMassUpload open onClose={() => setFolderOpen(false)} shop={shop} scopeIds={scopeIds} onDone={async () => { setImgReload((n) => n + 1); await onDone(); }} />
        )}
      </div>
    </ERPModal>
  );
}

/** relation: โชว์ชื่อ (จากแถว) · กดแล้วค่อยเปิดตัวเลือกกลาง RelationPicker (ไม่โหลดตัวเลือกทุกช่องพร้อมกัน) */
function RelationCell({ row, col, value, onChange }: { row: GridRow; col: Col; value: string; onChange: (id: string | null) => void }) {
  const [edit, setEdit] = useState(false);
  const base = (col.column ?? "").replace(/_id$/, "");
  const label = value === String(row.erp[col.column as string] ?? "") ? String(row.erp[`${base}_label`] ?? row.erp[`${base}_name`] ?? "") : "";
  if (!edit || !col.relation)
    return (
      <button type="button" onClick={() => setEdit(true)} className={`${cellCls} truncate text-left`} title={label || value}>
        {value ? label || "เลือกแล้ว (กดเพื่อดู)" : <span className="text-slate-300">— เลือก —</span>}
      </button>
    );
  return <RelationPicker value={value || null} onChange={(id) => onChange(id)} config={col.relation} siblingValues={row.erp} />;
}
