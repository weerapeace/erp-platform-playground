"use client";

/**
 * 🧵 Belt Builder — มุมมอง "ตาราง (ขั้นสูง)" ของหลังบ้านออกแบบเข็มขัด
 *
 * 3 แท็บ ใช้ตารางกลาง (MasterCRUD + DataTable + MasterRecordDrawer) ทั้งหมด:
 *   ชิ้นส่วน   → belt_parts (กรองตามประเภท · อัปโหลด PNG โปร่งผ่านช่องรูปกลาง/คลังไฟล์ · พรีวิวซ้อนรูป + ปรับจุดยึดใน drawer)
 *   กติกาไซซ์  → belt_size_rules (ช่วงเอวชาย/หญิง + สูตรตัดหนัง + ตัวอย่างสด)
 *   แบบของลูกค้า → belt_designs (อ่านอย่างเดียว · ก้อน 4 ค่อยต่อใบสั่งขาย)
 * หน้าหลัก /admin/belt-builder = สตูดิโอ (components/belt-builder/studio.tsx) · มุมมองนี้เปิดจากแท็บ "📋 ตาราง"
 * API: /api/belt-builder/* (guardApi belt_builder.view/edit + writeAudit) · กฎ: lib/belt-builder.ts
 */
import nextDynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { MasterCRUDConfig, FieldDef } from "@/components/master-crud";
import { ImageInput, ImageCell } from "@/components/image-input";
import { apiFetch } from "@/lib/api";
import { DEFAULT_ANCHOR, DEFAULT_STRAP_FORMULA, GENDER_LABEL, PART_TYPES, PART_TYPE_LABEL, strapLengthCm, parseStrapFormula, type Anchor, type PartType } from "@/lib/belt-builder";
import { AnchorEditor, invalidateRefParts } from "@/components/belt-builder/anchor-editor";
import { AttrsEditor } from "@/components/belt-builder/attrs-editor";
import { StrapFormulaEditor } from "@/components/belt-builder/formula-editor";
import { BeltPreview, partToLayer } from "@/components/belt-builder/belt-preview";

const MasterCRUDPage = nextDynamic(() => import("@/components/master-crud").then((m) => m.MasterCRUDPage), { ssr: false });

type Tab = "parts" | "sizes" | "designs";
type PartFilter = "all" | PartType;

const PERMS = { view: "belt_builder.view", create: "belt_builder.edit", edit: "belt_builder.edit" } as const;
const PART_TYPE_OPTS = [...PART_TYPES];
const PART_TYPE_LABELS: Record<string, string> = Object.fromEntries(PART_TYPES.map((t) => [t, `${PART_TYPE_LABEL[t].icon} ${PART_TYPE_LABEL[t].th}`]));

const money = (v: unknown) => (v == null || v === "" ? "—" : `฿${Number(v).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`);

export function BeltBuilderTables({ shopId }: { shopId: string }) {
  const [tab, setTab] = useState<Tab>("parts");
  const [partFilter, setPartFilter] = useState<PartFilter>("all");

  // ── ชิ้นส่วน ──────────────────────────────────────────────────────────────
  const partsConfig = useMemo<MasterCRUDConfig>(() => {
    const fields: FieldDef[] = [
      { key: "part_type", label: "ประเภท", type: "select", colSize: 120, required: true, options: PART_TYPE_OPTS, optionLabels: PART_TYPE_LABELS, filterable: true,
        helpText: "ชั้น 1 สายหนัง · ชั้น 2 หู · ชั้น 3 หัว (สลักชื่อ = ตัวอักษรพิมพ์สด ไม่ต้องทำชิ้นส่วน)",
        cellRender: (v) => PART_TYPE_LABELS[String(v)] ?? String(v) },
      { key: "image_key", label: "รูป PNG พื้นโปร่ง", type: "image", colSize: 70, formSpan: 2,
        helpText: "ถ่ายชิ้นจริงบนพื้นขาว ไดคัทเป็น PNG พื้นโปร่ง — สายหนัง: ถ่ายเต็มเส้นแนวนอน · หัว/หู: ถ่ายด้านหน้าตรง",
        cellRender: (v) => <ImageCell r2Key={(v as string) || null} size={40} />,
        renderForm: ({ value, onChange, disabled }) => (
          <div>
            <div className="text-xs font-medium text-slate-700 mb-1">รูป PNG พื้นโปร่ง</div>
            <ImageInput value={(value as string) || null} onChange={(k) => onChange(k)} folder="belt-parts" disabled={disabled} />
          </div>
        ) },
      { key: "code", label: "รหัส", type: "text", colSize: 170, placeholder: "strap-black-35", helpText: "strap-{สี}-{กว้าง} · buckle-{ทรง}-{สีโลหะ} · keeper-{แบบ}-{สี} (ห้ามซ้ำในร้าน)" },
      { key: "name_th", label: "ชื่อ (ไทย)", type: "text", colSize: 200, required: true },
      { key: "name_en", label: "ชื่อ (อังกฤษ)", type: "text", colSize: 160 },
      { key: "price_delta", label: "ราคาเพิ่ม (฿)", type: "number", colSize: 110, required: true, defaultValue: "0", helpText: "บวกจากราคาฐานของเข็มขัด · 0 = ไม่บวก", cellRender: (v) => money(v) },
      { key: "sort_order", label: "ลำดับ", type: "number", colSize: 70, defaultValue: "100" },
      { key: "attrs", label: "คุณสมบัติ (ใช้ทำตัวกรองบนเว็บ)", type: "textarea", formSpan: 2,
        renderForm: ({ value, onChange, disabled, form }) => (
          <div>
            <div className="text-xs font-medium text-slate-700 mb-1">คุณสมบัติ (สี / ความกว้างสาย / ทรงหัว / สีโลหะ)</div>
            <AttrsEditor value={value} onChange={onChange} disabled={disabled} partType={String(form.part_type ?? "")} />
          </div>
        ),
        renderDetail: ({ value, form }) => <AttrsEditor value={value} onChange={() => {}} disabled partType={String(form.part_type ?? "")} /> },
      { key: "anchor", label: "จุดยึดบนผืนผ้าใบ + พรีวิวซ้อนรูป", type: "textarea", required: true, formSpan: 3,
        renderForm: ({ value, onChange, disabled, form, recordId }) => {
          const pt = (PART_TYPES.includes(form.part_type as PartType) ? form.part_type : "strap") as PartType;
          const attrs = (form.attrs && typeof form.attrs === "object" ? form.attrs : {}) as Record<string, unknown>;
          return (
            <div>
              <div className="text-xs font-medium text-slate-700 mb-1">จุดยึดบนผืนผ้าใบ + พรีวิวซ้อนรูป</div>
              <AnchorEditor value={value} onChange={(a: Anchor) => onChange(a)} disabled={disabled} partType={pt}
                imageKey={(form.image_key as string) || null} imageUrl={(form.image_url as string) || null}
                colorHex={(attrs.color_hex as string) || (attrs.metal_hex as string) || null}
                label={(form.name_th as string) || undefined} shopId={shopId} currentId={recordId} />
            </div>
          );
        },
        renderDetail: ({ value, form, recordId }) => {
          const pt = (PART_TYPES.includes(form.part_type as PartType) ? form.part_type : "strap") as PartType;
          const attrs = (form.attrs && typeof form.attrs === "object" ? form.attrs : {}) as Record<string, unknown>;
          return <AnchorEditor value={value} onChange={() => {}} disabled partType={pt}
            imageKey={(form.image_key as string) || null} imageUrl={(form.image_url as string) || null}
            colorHex={(attrs.color_hex as string) || (attrs.metal_hex as string) || null}
            label={(form.name_th as string) || undefined} shopId={shopId} currentId={recordId} />;
        } },
    ];
    const defaultType: PartType = partFilter === "all" ? "strap" : partFilter;
    return {
      apiBase: "/api/belt-builder/", apiPath: "parts", restApi: true,
      tableId: "admin-belt-parts", title: "ชิ้นส่วนเข็มขัด", icon: "🧵",
      description: "สายหนัง / หัว / หู ที่ลูกค้าเลือกได้ — อัปโหลดรูป PNG พื้นโปร่ง ตั้งราคาเพิ่ม และจัดตำแหน่งบนผืนผ้าใบ 1600×600",
      exportEntityType: "belt_parts", searchKeys: ["code", "name_th", "name_en"],
      permissions: PERMS, activeField: "is_active", allowPermanentDelete: true, inlineCreate: false, formLayout: "sections",
      fields,
      extraQuery: { shop_id: shopId, part_type: partFilter === "all" ? undefined : partFilter },
      createDefaults: { shop_id: shopId, part_type: defaultType, anchor: DEFAULT_ANCHOR[defaultType], attrs: {}, price_delta: 0, sort_order: 100 },
      afterSave: () => invalidateRefParts(shopId),
    };
  }, [shopId, partFilter]);

  // ── กติกาไซซ์ ─────────────────────────────────────────────────────────────
  const sizesConfig = useMemo<MasterCRUDConfig>(() => ({
    apiBase: "/api/belt-builder/", apiPath: "size-rules", restApi: true,
    tableId: "admin-belt-size-rules", title: "กติกาไซซ์", icon: "📏",
    description: "ช่วงรอบเอว (นิ้ว) แยกชาย/หญิง + สูตรคิดความยาวหนังที่ต้องตัด + จำนวน/ระยะรู — ใช้กับคู่มือวัดไซซ์บนเว็บ",
    exportEntityType: "belt_size_rules", searchKeys: ["label", "gender"],
    permissions: PERMS, activeField: "is_active", allowPermanentDelete: true, inlineCreate: false, formLayout: "sections",
    fields: [
      { key: "gender", label: "เพศ", type: "select", colSize: 100, required: true, options: ["men", "women"], optionLabels: { men: GENDER_LABEL.men.th, women: GENDER_LABEL.women.th },
        cellRender: (v) => GENDER_LABEL[v as "men" | "women"]?.th ?? String(v) },
      { key: "label", label: "ชื่อที่โชว์ลูกค้า", type: "text", colSize: 140, placeholder: "ผู้ชาย" },
      { key: "waist_min_in", label: "เอวต่ำสุด (นิ้ว)", type: "number", colSize: 110, required: true },
      { key: "waist_max_in", label: "เอวสูงสุด (นิ้ว)", type: "number", colSize: 110, required: true },
      { key: "hole_count", label: "จำนวนรู", type: "number", colSize: 80, required: true, defaultValue: "5" },
      { key: "hole_spacing_cm", label: "ระยะรู (ซม.)", type: "number", colSize: 100, required: true, defaultValue: "2.5" },
      { key: "strap_formula", label: "สูตรตัดหนัง", type: "textarea", required: true, formSpan: 3, colSize: 160,
        cellRender: (v, row) => { const f = parseStrapFormula(v); if (!f) return "—"; const w = Number(row?.waist_min_in) || 30; return `×${f.mult} + ${f.add_cm} (เอว ${w}″ → ${strapLengthCm(w, f)} ซม.)`; },
        renderForm: ({ value, onChange, disabled, form }) => (
          <div><div className="text-xs font-medium text-slate-700 mb-1">สูตรตัดหนัง</div><StrapFormulaEditor value={value} onChange={onChange} disabled={disabled} form={form} /></div>
        ),
        renderDetail: ({ value, form }) => <StrapFormulaEditor value={value} onChange={() => {}} disabled form={form} /> },
      { key: "sort_order", label: "ลำดับ", type: "number", colSize: 70, defaultValue: "100" },
      { key: "note", label: "หมายเหตุ", type: "textarea", formSpan: 3 },
    ],
    extraQuery: { shop_id: shopId },
    createDefaults: { shop_id: shopId, strap_formula: DEFAULT_STRAP_FORMULA, hole_count: 5, hole_spacing_cm: 2.5, sort_order: 100 },
  }), [shopId]);

  // ── แบบของลูกค้า (อ่านอย่างเดียว) ─────────────────────────────────────────
  const [partsById, setPartsById] = useState<Record<string, Record<string, unknown>>>({});
  useEffect(() => {
    if (tab !== "designs" || !shopId) return;
    apiFetch(`/api/belt-builder/parts?shop_id=${encodeURIComponent(shopId)}&limit=500`).then((r) => r.json()).then((j) => {
      const m: Record<string, Record<string, unknown>> = {};
      for (const p of (j.data ?? []) as Record<string, unknown>[]) m[String(p.id)] = p;
      setPartsById(m);
    }).catch(() => {});
  }, [tab, shopId]);

  const designsConfig = useMemo<MasterCRUDConfig>(() => {
    const STATUS_TH: Record<string, string> = { saved: "บันทึกไว้", in_cart: "อยู่ในตะกร้า", ordered: "สั่งแล้ว" };
    const sel = (v: unknown) => (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const nameOf = (id: unknown) => (id ? String(partsById[String(id)]?.name_th ?? "—") : "—");
    return {
      apiBase: "/api/belt-builder/", apiPath: "designs", restApi: true,
      tableId: "admin-belt-designs", title: "แบบที่ลูกค้าออกแบบ", icon: "🧾",
      description: "แบบเข็มขัดที่ลูกค้าบันทึก / ใส่ตะกร้า / สั่งซื้อ — ก้อนถัดไปจะไหลเข้าใบสั่งขาย (ตอนนี้ดูอย่างเดียว)",
      exportEntityType: "belt_designs", searchKeys: ["status", "order_ref"],
      permissions: PERMS, readOnly: true, hideActiveStatus: true, inlineCreate: false, formLayout: "sections",
      fields: [
        { key: "status", label: "สถานะ", type: "select", colSize: 110, options: ["saved", "in_cart", "ordered"], optionLabels: STATUS_TH, cellRender: (v) => STATUS_TH[String(v)] ?? String(v) },
        { key: "created_at", label: "เมื่อ", type: "date", colSize: 150, readonly: true },
        { key: "total_price", label: "ราคารวม", type: "number", colSize: 100, cellRender: (v) => money(v) },
        { key: "order_ref", label: "เลขใบสั่งขาย", type: "text", colSize: 130 },
        { key: "selections", label: "ที่เลือก", type: "textarea", colSize: 320, formSpan: 3,
          cellRender: (v) => { const s = sel(v); const e = sel(s.engraving); return `${nameOf(s.strap_id)} · ${nameOf(s.buckle_id)} · ${nameOf(s.keeper_id)}${s.waist_in ? ` · เอว ${s.waist_in}″` : ""}${e.text ? ` · สลัก "${e.text}"` : ""}`; },
          renderDetail: ({ value }) => {
            const s = sel(value); const e = sel(s.engraving);
            const layers = ["strap_id", "keeper_id", "buckle_id"].map((k) => { const p = partsById[String(s[k] ?? "")]; return p ? partToLayer(p as Parameters<typeof partToLayer>[0]) : null; }).filter((l): l is NonNullable<typeof l> => !!l);
            return (
              <div className="space-y-2">
                <BeltPreview layers={layers} width={640} engraving={e.text ? { text: String(e.text), font: e.font as string | undefined } : null} />
                <div className="text-sm text-slate-700 space-y-0.5">
                  <div>สายหนัง: {nameOf(s.strap_id)} · หัว: {nameOf(s.buckle_id)} · หู: {nameOf(s.keeper_id)}</div>
                  <div>เพศ: {GENDER_LABEL[s.gender as "men" | "women"]?.th ?? "—"} · เอว: {s.waist_in ? `${s.waist_in} นิ้ว` : "—"} · กว้างสาย: {s.width_mm ? `${s.width_mm} มม.` : "—"}</div>
                  {e.text ? <div>สลักชื่อ: “{String(e.text)}” {e.font ? `(ฟอนต์ ${e.font})` : ""} {e.position ? `· ตำแหน่ง ${e.position}` : ""}</div> : null}
                </div>
              </div>
            );
          } },
        { key: "member_id", label: "สมาชิก", type: "text", colSize: 120, readonly: true },
        { key: "preview_url", label: "รูปพรีวิว (URL)", type: "text", readonly: true },
      ],
      extraQuery: { shop_id: shopId },
    };
  }, [shopId, partsById]);

  const TABS: { key: Tab; label: string }[] = [
    { key: "parts", label: "🧵 ชิ้นส่วน" },
    { key: "sizes", label: "📏 กติกาไซซ์" },
    { key: "designs", label: "🧾 แบบของลูกค้า" },
  ];
  const chip = (active: boolean) => `px-3 py-1 rounded-full text-xs border transition ${active ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 pt-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 text-sm border-b-2 -mb-px transition ${tab === t.key ? "border-indigo-500 text-indigo-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "parts" && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
          <span className="text-xs text-slate-500 mr-1">ประเภท:</span>
          <button className={chip(partFilter === "all")} onClick={() => setPartFilter("all")}>ทั้งหมด</button>
          {PART_TYPES.map((t) => (
            <button key={t} className={chip(partFilter === t)} onClick={() => setPartFilter(t)}>{PART_TYPE_LABEL[t].icon} {PART_TYPE_LABEL[t].th}</button>
          ))}
          <span className="text-[11px] text-slate-400 ml-2">ค่าเริ่มต้นจุดยึด — สาย {fmtAnchor(DEFAULT_ANCHOR.strap)} · หัว {fmtAnchor(DEFAULT_ANCHOR.buckle)} · หู {fmtAnchor(DEFAULT_ANCHOR.keeper)}</span>
        </div>
      )}

      {tab === "parts"   && <MasterCRUDPage key={`parts-${shopId}-${partFilter}`} config={partsConfig} />}
      {tab === "sizes"   && <MasterCRUDPage key={`sizes-${shopId}`} config={sizesConfig} />}
      {tab === "designs" && <MasterCRUDPage key={`designs-${shopId}`} config={designsConfig} />}
    </div>
  );
}

function fmtAnchor(a: Anchor) { return `${a.x},${a.y},${a.w}×${a.h}`; }
