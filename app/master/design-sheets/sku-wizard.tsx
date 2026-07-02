"use client";

// ============================================================
// SkuWizard — สร้าง Parent SKU + SKU ลูก จากใบงานออกแบบ (เฉพาะโมดูล Design Sheets)
// ของกลางที่ใช้: ERPModal · useToast · apiFetch → POST /api/design-sheets/[id]/create-skus
// Parent มีรหัสนี้แล้ว = เพิ่ม SKU เข้า Parent เดิม · ราคาเริ่มต้น = ราคาที่เสนอ (แก้ได้)
// ============================================================

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { ImageThumbnail } from "@/components/image-manager";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";

const FAMILIES: [string, string][] = [
  ["general", "ทั่วไป"], ["bag", "กระเป๋า"], ["belt", "เข็มขัด"], ["jewelry", "เครื่องประดับ"], ["spare", "อะไหล่"],
];

type SkuRow = { code: string; color: string; name: string; price: string; imgs: string[] };

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
  const [sheetImgs, setSheetImgs] = useState<{ key: string; url: string }[]>([]);  // รูปที่แนบในใบงาน (เลือกเป็นรูปสินค้า)
  const [pImgs, setPImgs] = useState<string[]>([]);                  // รูป Parent (R2 keys, ตัวแรก = ปก)
  const [pickOpen, setPickOpen] = useState<string | null>(null);     // ช่องรูปที่กำลังเลือก ("parent" | "row-<i>")
  const [pickPos, setPickPos] = useState<{ left: number; top: number } | null>(null);   // ตำแหน่งป๊อปอัปเลือกรูป (fixed/portal)

  // เปิดหน้าต่าง = เซ็ตค่าเริ่มต้นจากใบงาน
  useEffect(() => {
    if (!open) return;
    setPCode(parentCodeDefault || "");
    setPName(sheetName || "");
    setPNameEn(""); setFamily("general");
    setBId(brandId ?? ""); setCheck(null); setCodeOpen(false); setPImgs([]); setPickOpen(null);
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

  // โหลดรูปที่แนบในใบงาน → ให้เลือกเป็นรูปสินค้า · ตั้งรูปหลัก (is_primary/ตัวแรก) ให้ Parent อัตโนมัติ
  useEffect(() => {
    if (!open || !sheetId) return;
    let alive = true;
    apiFetch(`/api/attachments?entity_type=design_sheet&entity_id=${encodeURIComponent(sheetId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !Array.isArray(j.data)) return;
        const imgs = (j.data as { file_path: string; content_type: string | null; is_primary: boolean }[])
          .filter((a) => (a.content_type ?? "").startsWith("image/"))
          // สร้าง URL จาก file_path ผ่าน proxy เสมอ (attachment เก่าบางรูป public_url เพี้ยน → รูปขาด)
          .map((a) => ({ key: a.file_path, url: `/api/r2-image?key=${encodeURIComponent(a.file_path)}`, primary: a.is_primary }));
        setSheetImgs(imgs.map(({ key, url }) => ({ key, url })));
        const primary = imgs.find((i) => i.primary) ?? imgs[0];
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

  const setRow = (i: number, p: Partial<SkuRow>) => setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const addRow = () => setRows((list) => [...list, { code: "", color: "", name: pName, price: defaultPrice != null ? String(defaultPrice) : "", imgs: [...pImgs] }]);
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
                <div className="grid max-h-52 grid-cols-3 gap-1.5 overflow-auto">
                  <button type="button" onClick={onClear}
                    className="flex h-16 items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-400 hover:bg-slate-50">ไม่มีรูป</button>
                  {sheetImgs.map((im) => {
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
      description="สร้างสินค้าหลัก (Parent SKU) + SKU ลูกหลายสี/หลายแบบในครั้งเดียว — ราคาตั้งต้นดึงจากราคาที่เสนอ แก้ได้"
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
              {imgSlot(pImgs, (k) => setPImgs((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k])), () => setPImgs([]), "parent")}
            </div>
          </div>
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
                check?.exists ? "border-rose-400 bg-rose-50 focus:ring-rose-400"
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
            {check?.exists ? <span className="text-rose-600 font-medium">✕ รหัสนี้มีอยู่แล้ว — SKU ลูกที่สร้างจะเข้า Parent เดิม (ไม่สร้าง Parent ซ้ำ)</span>
              : check?.skipped ? <span className="text-amber-600">⚠ ตั้งข้ามเลข — ล่าสุดคือ {check.latest} (ตั้งได้ แต่เช็คว่าตั้งใจ)</span>
              : check?.latest ? <span className="text-slate-400">ล่าสุด: <b>{check.latest}</b>{check.suggested ? <> · ถัดไป: <b className="text-emerald-600">{check.suggested}</b></> : null}{check.max_code ? <> · สูงสุด: {check.max_code}</> : null}</span>
              : null}
            {check?.suggested && !check.exists && (
              <button type="button" onClick={() => setPCode(check.suggested!)} className="ml-2 text-blue-600 hover:underline">ใช้ {check.suggested}</button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-slate-500">แบรนด์</span>
              <select value={bId} onChange={(e) => setBId(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="">— ไม่ระบุ —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">หมวดสินค้า</span>
              <select value={family} onChange={(e) => setFamily(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white">
                {FAMILIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">ชื่อสินค้า (ไทย) *</span>
              <input value={pName} onChange={(e) => setPName(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">ชื่อสินค้า (อังกฤษ)</span>
              <input value={pNameEn} onChange={(e) => setPNameEn(e.target.value)} className="mt-0.5 w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>
        </div>

        {/* ---- SKU ลูก ---- */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-slate-500">SKU ลูก (แต่ละสี/แบบ = 1 ตัว)</div>
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
                    <input value={r.code} onChange={(e) => setRow(i, { code: e.target.value })} placeholder="เช่น CTL085-BLK"
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
