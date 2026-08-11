"use client";

// ============================================================
// SkuWizard — สร้าง Parent SKU + SKU ลูก จากใบงานออกแบบ (เฉพาะโมดูล Design Sheets)
// ของกลางที่ใช้: ERPModal · useToast · apiFetch · ParentSkuPicker → POST /api/design-sheets/[id]/create-skus
// 2 โหมดในหน้าเดียว:
//   • Parent ใหม่  = พิมพ์รหัสที่ยังไม่มี → สร้าง Parent + SKU ลูก
//   • Parent เดิม  = เลือกจากช่องค้นหา (หรือพิมพ์รหัสที่มีแล้ว) → ดึงชื่อ/แบรนด์/หมวด/รูปปกมาโชว์
//                    + โชว์ SKU ลูกที่มีแล้ว (ถึงไหนแล้ว) + แนะนำรหัสถัดไป — เหมาะกับ "เพิ่มสี"
// ราคาเริ่มต้น = ราคาที่เสนอ (แก้ได้)
// ============================================================

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ImageThumbnail } from "@/components/image-manager";
import { ParentSkuPicker, type ParentSkuPickerValue } from "@/components/pickers";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";

const FAMILIES: [string, string][] = [
  ["general", "ทั่วไป"], ["bag", "กระเป๋า"], ["belt", "เข็มขัด"], ["jewelry", "เครื่องประดับ"], ["spare", "อะไหล่"],
];

type SkuRow = { code: string; color: string; name: string; price: string; imgs: string[] };

/** รหัสลูกลำดับที่ i นับจากรหัสตั้งต้น เช่น base=WL36-18 → i=0 WL36-18, i=1 WL36-19 (คงจำนวนหลัก) */
function nextCodeFrom(base: string, i: number): string {
  const m = base.match(/^(.*?)(\d+)$/);
  if (!m) return i === 0 ? base : `${base}-${i + 1}`;
  return `${m[1]}${String(parseInt(m[2], 10) + i).padStart(m[2].length, "0")}`;
}

/** เติมรหัสให้แถวที่ยังว่าง โดยไล่เลขต่อจากรหัสที่มีอยู่แล้ว (ข้ามเลขที่ถูกใช้ไปแล้ว) */
function fillCodes(list: SkuRow[], base: string | null, used: string[]): SkuRow[] {
  if (!base) return list;
  const taken = new Set([...used, ...list.map((r) => r.code)].map((c) => c.trim().toUpperCase()).filter(Boolean));
  let i = 0;
  return list.map((r) => {
    if (r.code.trim()) return r;
    let code = "";
    for (; i < 500; i++) { const cand = nextCodeFrom(base, i); if (!taken.has(cand.toUpperCase())) { code = cand; break; } }
    if (!code) return r;
    taken.add(code.toUpperCase()); i++;
    return { ...r, code };
  });
}

export function SkuWizard({
  open, onClose, sheetId, sheetName, brandId, parentCodeDefault, parentCodeOptions, defaultPrice, onDone,
}: {
  open: boolean;
  onClose: () => void;
  sheetId: string;
  sheetName: string;
  brandId: string | null;
  parentCodeDefault: string;
  /** รายการรหัส Parent SKU ของใบงาน (ถ้ามีหลายตัว → โชว์ตัวเลือกให้สร้างทีละตัว) */
  parentCodeOptions?: string[];
  /** ราคาที่เสนอ (ผ่านแล้ว) ใช้เป็นราคาตั้งต้นของ SKU */
  defaultPrice: number | null;
  /** เรียกหลังสร้างสำเร็จ — refresh + อัปเดตสถานะใบเป็น sku_created */
  onDone: () => void;
}) {
  const toast = useToast();
  const [pCode, setPCode] = useState("");
  const [pName, setPName] = useState("");
  const [pNameEn, setPNameEn] = useState("");
  const [family, setFamily] = useState("general");
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string; color: string | null }[]>([]);
  const [bId, setBId] = useState("");                                // แบรนด์ที่เลือก (ค่าเริ่มต้น = แบรนด์ของใบงาน)
  const [check, setCheck] = useState<ParentSkuCheck | null>(null);   // ผลเช็ครหัส Parent (ซ้ำ/ล่าสุด/ถัดไป/รายการที่มี)
  const [codeOpen, setCodeOpen] = useState(false);                   // เปิดลิสต์รหัสที่มี
  const [sheetImgs, setSheetImgs] = useState<{ key: string; url: string; sourceLabel: string }[]>([]);  // รูปทุกแหล่งในใบงาน (แกลเลอรี/รายละเอียด/คอมเมนต์ — เลือกเป็นรูปสินค้า)
  const [pImgs, setPImgs] = useState<string[]>([]);                  // รูป Parent (R2 keys, ตัวแรก = ปก)
  const [pickOpen, setPickOpen] = useState<string | null>(null);     // ช่องรูปที่กำลังเลือก ("parent" | "row-<i>")
  const [pickPos, setPickPos] = useState<{ left: number; top: number } | null>(null);   // ตำแหน่งป๊อปอัปเลือกรูป (fixed/portal)
  const [picked, setPicked] = useState<ParentSkuPickerValue | null>(null);   // Parent เดิมที่เลือกจากช่องค้นหา (โชว์ในตัวเลือก)
  const [showKids, setShowKids] = useState(false);                   // กาง/พับ รายการ SKU ลูกที่มีอยู่แล้ว
  const prefilledRef = useRef<string | null>(null);                  // id ของ Parent ที่ดึงข้อมูลมาเติมแล้ว (กันเติมซ้ำทับที่ผู้ใช้แก้)

  const parentInfo = check?.exists ? check.parent : null;            // ใช้ Parent เดิม (ข้อมูลด้านล่างมาจากตัวจริงใน DB)
  const kids = parentInfo ? (check?.children ?? []) : [];

  // เปิดหน้าต่าง = เซ็ตค่าเริ่มต้นจากใบงาน
  useEffect(() => {
    if (!open) return;
    setPCode(parentCodeDefault || "");
    setPName(sheetName || "");
    setPNameEn(""); setFamily("general");
    setBId(brandId ?? ""); setCheck(null); setCodeOpen(false); setPImgs([]); setPickOpen(null);
    setPicked(null); setShowKids(false); prefilledRef.current = null;
    setRows([{ code: "", color: "", name: sheetName || "", price: defaultPrice != null ? String(defaultPrice) : "", imgs: [] }]);
  }, [open, parentCodeDefault, sheetName, defaultPrice, brandId]);

  // โหลดรายชื่อแบรนด์ (ให้เลือก/เปลี่ยนได้ในหน้านี้)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    apiFetch("/api/brands").then((r) => r.json())
      .then((j) => { if (alive && Array.isArray(j.data)) setBrands(j.data); }).catch(() => {});
    return () => { alive = false; };
  }, [open]);

  // โหลดรูป "ทุกแหล่ง" ในใบงาน (แกลเลอรี/รายละเอียด/คอมเมนต์) ผ่าน endpoint กลาง → ตั้งรูปหลักให้ Parent อัตโนมัติ
  useEffect(() => {
    if (!open || !sheetId) return;
    let alive = true;
    apiFetch(`/api/design-sheets/${encodeURIComponent(sheetId)}/images`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !Array.isArray(j.data)) return;
        const imgs = j.data as { key: string; url: string; source_label: string; is_primary: boolean }[];
        setSheetImgs(imgs.map((a) => ({ key: a.key, url: a.url, sourceLabel: a.source_label })));
        const primary = imgs.find((i) => i.is_primary) ?? imgs[0];   // endpoint เรียงรูปหลักแกลเลอรีมาก่อนอยู่แล้ว
        if (primary) setPImgs((cur) => (cur.length ? cur : [primary.key]));
      }).catch(() => {});
    return () => { alive = false; };
  }, [open, sheetId]);

  // ปิดตัวเลือกรูปเมื่อคลิกนอกช่อง
  useEffect(() => {
    if (!pickOpen) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-imgpick]")) setPickOpen(null); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickOpen]);

  // เช็ครหัส Parent: ซ้ำ / ล่าสุด / ถัดไป / รายการที่มี — อ่าน j.data (ของเดิมอ่าน j เฉยๆ เลยไม่เคยเตือนซ้ำ)
  useEffect(() => {
    if (!open) return;
    const code = pCode.trim();
    if (!code) { setCheck(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(code)}`)
        .then((r) => r.json()).then((j) => { if (alive) setCheck((j?.data ?? null) as ParentSkuCheck | null); }).catch(() => {});
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [pCode, open]);

  // เจอ Parent เดิม → ดึงข้อมูลตัวจริงมาเติม (ครั้งเดียวต่อ Parent) · เปลี่ยนกลับไปรหัสใหม่ → คืนค่าจากใบงาน
  useEffect(() => {
    if (!open) return;
    const p = check?.exists ? check.parent : null;
    if (p) {
      if (prefilledRef.current === p.id) return;
      prefilledRef.current = p.id;
      const cover = p.cover_image_r2_key;
      setPName(p.name_th || sheetName || "");
      setPNameEn(p.name_en || "");
      setFamily(p.product_family || "general");
      setBId(p.brand_id || "");
      setPImgs(cover ? [cover] : []);
      setPicked({ id: p.id, code: p.code, name: p.name_th || p.code, image_key: cover, image_url: cover ? `/api/r2-image?key=${encodeURIComponent(cover)}` : null });
      setShowKids(true);
      // เติมรหัส SKU ลูกถัดไปให้แถวที่ยังว่าง (เช่น มีถึง WL36-17 → WL36-18, -19 …)
      setRows((list) => fillCodes(list, check?.child_next ?? null, (check?.children ?? []).map((c) => c.code)));
    } else if (prefilledRef.current) {
      prefilledRef.current = null;
      setPicked(null); setShowKids(false);
      setPName(sheetName || ""); setPNameEn(""); setFamily("general"); setBId(brandId ?? "");
      setPImgs(sheetImgs.length ? [sheetImgs[0].key] : []);
    }
  }, [open, check, sheetName, brandId, sheetImgs]);

  const setRow = (i: number, p: Partial<SkuRow>) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  // รหัสตั้งต้นของ SKU ลูก: Parent เดิม = เลขถัดไปจากที่มี · Parent ใหม่ = <รหัส>-01
  const codeBase = (): string | null => check?.child_next ?? (pCode.trim() ? `${pCode.trim()}-01` : null);
  const fillEmptyCodes = () => setRows((list) => fillCodes(list, codeBase(), kids.map((k) => k.code)));
  const addRow = () => setRows((list) => fillCodes(
    [...list, { code: "", color: "", name: pName, price: defaultPrice != null ? String(defaultPrice) : "", imgs: [...(parentInfo ? [] : pImgs)] }],
    codeBase(), kids.map((k) => k.code)));
  const removeRow = (i: number) => setRows((list) => (list.length <= 1 ? list : list.filter((_, idx) => idx !== i)));

  // ช่องเลือกรูปจากรูปที่แนบในใบงาน (ของกลางเล็ก ๆ ในหน้านี้) — คลิกเปิดกริดรูป → เลือก
  const imgUrlOf = (key: string) => sheetImgs.find((im) => im.key === key)?.url ?? (key ? `/api/r2-image?key=${encodeURIComponent(key)}` : "");
  // เปิดตัวเลือกรูป — คำนวณตำแหน่งจากปุ่ม แล้วลอย (portal→body) ออกนอกโมดอล ไม่โดนกรอบตัด
  const openPicker = (id: string, btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    const W = 236, Hest = 280;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const top = r.bottom + 4 + Hest > window.innerHeight - 8 ? Math.max(8, r.top - Hest - 4) : r.bottom + 4;
    setPickPos({ left, top }); setPickOpen(id);
  };
  // ช่องเลือกรูปจากใบงาน — เลือกได้หลายรูป (รูปแรก = ปก) · ป๊อปอัปลอย + hover ขยาย (ผ่าน ImageThumbnail)
  const imgSlot = (values: string[], onToggle: (k: string) => void, onClear: () => void, id: string) => {
    const cover = values[0];
    // จัดกลุ่มรูปตามแหล่ง (คงลำดับที่ endpoint ส่งมา: แกลเลอรี → รายละเอียด → คอมเมนต์)
    const groups: Array<[string, typeof sheetImgs]> = [];
    for (const im of sheetImgs) {
      const g = groups.find(([l]) => l === im.sourceLabel);
      if (g) g[1].push(im); else groups.push([im.sourceLabel, [im]]);
    }
    return (
      <div className="relative inline-block" data-imgpick>
        <button type="button" title="เลือกรูปจากใบงาน (เลือกได้หลายรูป)"
          onClick={(e) => { if (pickOpen === id) { setPickOpen(null); return; } openPicker(id, e.currentTarget); }}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white hover:border-blue-300">
          {cover ? <ImageThumbnail url={imgUrlOf(cover)} size={38} /> : <span className="text-lg leading-none text-slate-300">＋</span>}
          {values.length > 1 && <span className="absolute -right-1 -top-1 z-10 rounded-full bg-blue-600 px-1 text-[9px] font-medium text-white">+{values.length - 1}</span>}
        </button>
        {pickOpen === id && pickPos && createPortal(
          <div data-imgpick className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
            style={{ position: "fixed", left: pickPos.left, top: pickPos.top, width: 236, zIndex: 1000 }}>
            {sheetImgs.length === 0 ? <div className="p-2 text-[11px] text-slate-400">ใบงานนี้ยังไม่มีรูปแนบ</div> : (
              <>
                <div className="max-h-52 space-y-1.5 overflow-auto">
                  <button type="button" onClick={onClear}
                    className="flex h-8 w-full items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-400 hover:bg-slate-50">✕ ไม่เลือกรูป</button>
                  {groups.map(([label, imgs]) => (
                    <div key={label}>
                      {groups.length > 1 && <div className="px-0.5 pb-0.5 text-[9px] font-medium text-slate-400">{label}</div>}
                      <div className="grid grid-cols-3 gap-1.5">
                        {imgs.map((im) => {
                          const idx = values.indexOf(im.key);
                          return (
                            <button key={im.key} type="button" onClick={() => onToggle(im.key)}
                              className={`relative flex h-16 items-center justify-center overflow-hidden rounded border bg-white ${idx >= 0 ? "border-blue-500 ring-1 ring-blue-300" : "border-slate-200 hover:border-blue-300"}`}>
                              <ImageThumbnail url={im.url} size={54} />
                              {idx >= 0 && <span className="absolute left-0.5 top-0.5 z-10 rounded bg-blue-600 px-1 text-[9px] font-medium text-white">{idx === 0 ? "ปก" : idx + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex items-center justify-between px-1">
                  <span className="text-[10px] text-slate-400">เลือกหลายรูปได้ · แรก=ปก · ชี้เมาส์ดูใหญ่</span>
                  <button type="button" onClick={() => setPickOpen(null)} className="text-[11px] text-blue-600 hover:underline">เสร็จ</button>
                </div>
              </>
            )}
          </div>,
          document.body
        )}
      </div>
    );
  };

  const save = async () => {
    if (!pCode.trim()) { toast.error("กรอกรหัส Parent SKU"); return; }
    if (!pName.trim()) { toast.error("กรอกชื่อสินค้า"); return; }
    const valid = rows.filter((r) => r.code.trim());
    if (valid.length === 0) { toast.error("กรอกรหัส SKU ลูกอย่างน้อย 1 ตัว"); return; }
    const dupKid = valid.find((r) => kids.some((k) => k.code.toUpperCase() === r.code.trim().toUpperCase()));
    if (dupKid) { toast.error(`รหัส ${dupKid.code.trim()} มีอยู่แล้วใน ${pCode.trim()} — เปลี่ยนเป็นเลขถัดไป`); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${sheetId}/create-skus`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent: { code: pCode.trim(), name_th: pName.trim(), name_en: pNameEn.trim() || null, product_family: family, brand_id: bId || null, image_keys: pImgs },
          skus: valid.map((r) => ({
            code: r.code.trim(), color: r.color.trim() || null, name_th: r.name.trim() || pName.trim(),
            standard_price: r.price === "" ? null : Number(r.price),
            list_price: r.price === "" ? null : Number(r.price),
            image_keys: r.imgs,
          })),
        }),
      });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`สร้าง ${j.count} SKU ${j.parent_created ? "+ Parent ใหม่" : "(เข้า Parent เดิม)"} แล้ว`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้าง SKU ไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="lg" title="🪄 สร้าง SKU จากใบงาน"
      description="สร้างสินค้าใหม่ (Parent + SKU ลูกหลายสี) หรือเลือกสินค้าเดิมเพื่อเพิ่มสี — เลือกแล้วระบบดึงข้อมูลเดิมและบอกว่ารหัส SKU ไปถึงไหนแล้ว"
      footer={
        <div className="flex justify-between items-center w-full">
          <button onClick={addRow} disabled={saving} className="h-9 px-3 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">＋ เพิ่ม SKU</button>
          <div className="flex gap-2">
            <button onClick={() => !saving && onClose()} disabled={saving} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {saving ? "กำลังสร้าง..." : "สร้าง SKU"}</button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {/* ---- Parent SKU ---- */}
        <div className="p-3 border border-slate-200 rounded-lg bg-slate-50/60 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-500">สินค้าหลัก (Parent SKU)</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">รูปสินค้า:</span>
              {parentInfo ? (
                <div title="รูปปกของ Parent เดิม (แก้ที่หน้า Parent SKU)"
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                  {parentInfo.cover_image_r2_key
                    ? <ImageThumbnail url={imgUrlOf(parentInfo.cover_image_r2_key)} size={38} />
                    : <span className="text-[10px] text-slate-300">ไม่มีรูป</span>}
                </div>
              ) : imgSlot(pImgs, (k) => setPImgs((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k])), () => setPImgs([]), "parent")}
            </div>
          </div>

          {/* เลือก Parent ที่มีอยู่แล้ว (เคสเพิ่มสีเข้าสินค้าเดิม) — เลือกแล้วดึงข้อมูล + SKU ลูกที่มีมาโชว์ */}
          <label className="block">
            <span className="text-xs text-slate-500">เลือกสินค้าเดิมที่จะเพิ่มสี/แบบ <span className="text-slate-400">(ไม่เลือก = สร้างสินค้าใหม่)</span></span>
            <div className="mt-0.5">
              <ParentSkuPicker value={picked} disableCreate placeholder="ค้นหาด้วยรหัสหรือชื่อสินค้า..."
                onChange={(v) => { setPicked(v); setPCode(v ? v.code : ""); }} />
            </div>
          </label>
          {/* ใบงานมีหลายรหัส → เลือกตัวที่จะสร้าง (ทีละตัว) */}
          {(parentCodeOptions?.length ?? 0) > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-400">เลือกรหัสที่จะสร้าง:</span>
              {parentCodeOptions!.map((c) => (
                <button key={c} type="button" onClick={() => setPCode(c)}
                  className={`px-2 py-0.5 text-xs font-mono rounded border ${pCode === c ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"}`}>{c}</button>
              ))}
              <span className="text-[10px] text-slate-300">(สร้างทีละตัว)</span>
            </div>
          )}
          {/* รหัส Parent SKU — พิมพ์แล้วเด้งลิสต์รหัสที่มี + ตัวช่วยเลข + เตือนซ้ำ */}
          <label className="block relative">
            <span className="text-xs text-slate-500">รหัส Parent SKU *</span>
            <input value={pCode} onChange={(e) => { setPCode(e.target.value); setCodeOpen(true); }}
              onFocus={() => setCodeOpen(true)} onBlur={() => setTimeout(() => setCodeOpen(false), 150)}
              placeholder="เช่น CTL085" autoComplete="off"
              className={`mt-0.5 w-full h-9 px-2 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 ${
                check?.exists ? "border-emerald-400 bg-emerald-50 focus:ring-emerald-400"
                  : check?.skipped ? "border-amber-300 focus:ring-amber-400"
                  : "border-slate-200 focus:ring-blue-500"}`} />
            {codeOpen && (check?.matches?.length ?? 0) > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                <div className="px-2 py-1 text-[10px] text-slate-400 border-b border-slate-100">รหัสที่มีอยู่แล้วในกลุ่มนี้ (คลิกเพื่อดู)</div>
                {check!.matches.map((c) => {
                  const dup = c.toUpperCase() === pCode.trim().toUpperCase();
                  return (
                    <button key={c} type="button" onMouseDown={(e) => { e.preventDefault(); setPCode(c); setCodeOpen(false); }}
                      className={`block w-full px-2 py-1 text-left text-xs font-mono hover:bg-blue-50 ${dup ? "bg-rose-50 text-rose-600" : "text-slate-600"}`}>
                      {c}{dup ? " · มีแล้ว" : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </label>
          <div className="text-[11px] min-h-[16px]">
            {check?.exists ? <span className="text-emerald-700 font-medium">✓ ใช้สินค้าเดิมตัวนี้ — SKU ที่สร้างจะเข้า Parent เดิม (ไม่สร้างซ้ำ)</span>
              : check?.skipped ? <span className="text-amber-600">⚠ ตั้งข้ามเลข — ล่าสุดคือ {check.latest} (ตั้งได้ แต่เช็คว่าตั้งใจ)</span>
              : check?.latest ? <span className="text-slate-400">ล่าสุด: <b>{check.latest}</b>{check.suggested ? <> · ถัดไป: <b className="text-emerald-600">{check.suggested}</b></> : null}{check.max_code ? <> · สูงสุด: {check.max_code}</> : null}</span>
              : null}
            {check?.suggested && !check.exists && (
              <button type="button" onClick={() => setPCode(check.suggested!)} className="ml-2 text-blue-600 hover:underline">ใช้ {check.suggested}</button>
            )}
          </div>

          {/* Parent เดิม — โชว์ว่า SKU ลูกมีอะไรแล้วบ้าง (ถึงไหนแล้ว) + รหัสถัดไปที่แนะนำ */}
          {parentInfo && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 space-y-1.5">
              <div className="flex items-center gap-2 text-[11px] text-emerald-800">
                <span className="font-medium">SKU ที่มีอยู่แล้วใน {parentInfo.code}: {kids.length} ตัว</span>
                {check?.child_next && <span className="text-emerald-700">· รหัสถัดไป <b className="font-mono">{check.child_next}</b></span>}
                {kids.length > 0 && (
                  <button type="button" onClick={() => setShowKids((v) => !v)} className="ml-auto text-emerald-700 hover:underline">
                    {showKids ? "ซ่อนรายการ" : "ดูรายการ"}
                  </button>
                )}
              </div>
              {kids.length === 0 ? (
                <div className="text-[11px] text-slate-500">ยังไม่มี SKU ลูก — สร้างตัวแรกได้เลย</div>
              ) : showKids && (
                <div className="max-h-36 overflow-auto rounded border border-emerald-100 bg-white">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {kids.map((k) => (
                        <tr key={k.code} className={`border-b border-slate-100 last:border-0 ${k.is_active ? "" : "text-slate-400"}`}>
                          <td className="w-8 px-1 py-0.5">
                            {k.image_key ? <ImageThumbnail url={imgUrlOf(k.image_key)} size={22} /> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-1 py-0.5 font-mono text-slate-700">{k.code}</td>
                          <td className="px-1 py-0.5 text-slate-500 truncate max-w-[110px]" title={k.color ?? ""}>{k.color || "—"}</td>
                          <td className="px-1 py-0.5 text-slate-500 truncate max-w-[200px]" title={k.name_th ?? ""}>{k.name_th || ""}</td>
                          <td className="px-1 py-0.5 text-right text-slate-500">{k.standard_price != null ? k.standard_price.toLocaleString("th-TH") : ""}</td>
                          <td className="px-1 py-0.5 text-right text-[10px] text-slate-400">{k.is_active ? "" : "ปิดใช้"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-[10px] text-slate-500">ข้อมูลด้านล่างดึงจากสินค้าเดิม (แก้ได้ที่หน้า Parent SKU) — ที่สร้างรอบนี้คือ SKU ลูกเท่านั้น</div>
            </div>
          )}

          {/* ใช้ Parent เดิม = ช่องเหล่านี้เป็นข้อมูลของ Parent ตัวจริง (โชว์อย่างเดียว ระบบไม่แก้ของเดิม) */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-500">แบรนด์</span>
              <select value={bId} onChange={(e) => setBId(e.target.value)} disabled={!!parentInfo}
                className={`mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg ${parentInfo ? "bg-slate-100 text-slate-500" : "bg-white"}`}>
                <option value="">— ไม่ระบุ —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">หมวดสินค้า</span>
              <select value={family} onChange={(e) => setFamily(e.target.value)} disabled={!!parentInfo}
                className={`mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg ${parentInfo ? "bg-slate-100 text-slate-500" : "bg-white"}`}>
                {FAMILIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                {parentInfo?.product_family && !FAMILIES.some(([v]) => v === parentInfo.product_family) && (
                  <option value={parentInfo.product_family}>{parentInfo.product_family}</option>
                )}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">ชื่อสินค้า (ไทย) *</span>
              <input value={pName} onChange={(e) => setPName(e.target.value)} disabled={!!parentInfo}
                className={`mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${parentInfo ? "bg-slate-100 text-slate-500" : ""}`} />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">ชื่อสินค้า (อังกฤษ)</span>
              <input value={pNameEn} onChange={(e) => setPNameEn(e.target.value)} disabled={!!parentInfo}
                className={`mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${parentInfo ? "bg-slate-100 text-slate-500" : ""}`} />
            </label>
          </div>
        </div>

        {/* ---- SKU ลูก ---- */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-500">SKU ลูก (แต่ละสี/แบบ = 1 ตัว)</div>
            {codeBase() && (
              <button type="button" onClick={fillEmptyCodes} title={`ไล่เลขต่อจากที่มีอยู่ เริ่มที่ ${codeBase()}`}
                className="text-[11px] text-blue-600 hover:underline">🔢 เติมรหัสอัตโนมัติ ({codeBase()})</button>
            )}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500">
                <th className="border border-slate-200 px-1 py-1.5 w-12 text-center">รูป</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">รหัส SKU *</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left w-32">สี / แบบ</th>
                <th className="border border-slate-200 px-2 py-1.5 text-left">ชื่อ</th>
                <th className="border border-slate-200 px-2 py-1.5 text-right w-28">ราคาขาย</th>
                <th className="border border-slate-200 px-1 py-1.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    {imgSlot(r.imgs, (k) => setRow(i, { imgs: r.imgs.includes(k) ? r.imgs.filter((x) => x !== k) : [...r.imgs, k] }), () => setRow(i, { imgs: [] }), `row-${i}`)}
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    {(() => {
                      const dup = !!r.code.trim() && kids.some((k) => k.code.toUpperCase() === r.code.trim().toUpperCase());
                      return (
                        <input value={r.code} onChange={(e) => setRow(i, { code: e.target.value })} placeholder={codeBase() ?? "เช่น CTL085-01"}
                          title={dup ? "รหัสนี้มีอยู่แล้วใน Parent นี้" : undefined}
                          className={`w-full h-8 px-2 text-sm border rounded focus:outline-none focus:ring-2 ${dup ? "border-rose-400 bg-rose-50 focus:ring-rose-400" : "border-slate-200 focus:ring-blue-500"}`} />
                      );
                    })()}
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input value={r.color} onChange={(e) => setRow(i, { color: e.target.value })} placeholder="ดำ / แดง..."
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })}
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input type="number" min={0} step="any" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })}
                      className="w-full h-8 px-2 text-sm text-right border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </td>
                  <td className="border border-slate-200 px-1 py-1 text-center">
                    <button onClick={() => removeRow(i)} disabled={rows.length <= 1} title="ลบแถว"
                      className="h-7 w-7 text-rose-500 hover:bg-rose-50 rounded disabled:opacity-30">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ERPModal>
  );
}
