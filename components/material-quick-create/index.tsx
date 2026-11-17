"use client";

/**
 * ➕ ของกลาง — เลือกวัสดุตีราคา + เพิ่มวัสดุใหม่ได้ทันทีเมื่อค้นไม่เจอ (เจ้าของขอ 2026-11-17 · แกะจากรูป/กระดานสตูดิโอแพทเทิร์น)
 *
 *   <MaterialAddSelect materials={[{ id, name, sub }]} exclude={ids} onPick={(m) => …} onCreated={(m) => …} />
 *     = ช่องค้นหาวัสดุ (SearchableSelect กลาง) · พิมพ์ชื่อที่ไม่มี → "＋ เพิ่มวัสดุใหม่" → แผงเลือกชนิด + เตือนชื่อคล้าย → สร้างแล้วเลือกให้เลย
 *     · ไม่ส่ง onCreated หรือผู้ใช้ไม่มีสิทธิ์ products.create = ค้นเลือกอย่างเดียว (ขึ้นคำแนะนำให้หัวหน้าเพิ่ม)
 *   <MaterialQuickCreate name="ฟองน้ำ 3mm" materials={…} onCreated={…} onPickExisting={…} onCancel={…} />
 *     = แผงสร้างอย่างเดียว (เช่น วัสดุที่ AI อ่านได้แต่ไม่มีในรายการ)
 *
 * onCreated ต้องเอาวัสดุใหม่ไปต่อท้ายรายการของหน้าแม่ (ไม่งั้นค้นครั้งหน้าไม่เจอ) · ราคา/หน้ากว้างใส่ทีหลังที่หน้าวัสดุตีราคา
 * ใช้: components/pattern-studio/photo-modal (แผงชิ้น) · components/pattern-sheet/shape-editor (แผงชิ้นบนกระดาน)
 * ห้ามใช้: วัตถุดิบ/SKU จริงที่ต้องอนุมัติ → MaterialRequestForm · เลือกวัตถุดิบ BOM → MaterialPicker
 * ไม่ใช่หน้าจอ: lib/material-quick-create (similarMaterials · createDesignMaterial) · คู่มือ docs/material-quick-create.md
 */
import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { usePermission } from "@/components/auth";
import { useT } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { createDesignMaterial, similarMaterials, type QuickMaterial } from "@/lib/material-quick-create";

type Mat = { id: string; name: string; sub?: string | null };
type Group = { id: string; name: string; calc_method?: string | null };

let groupCache: Promise<Group[]> | null = null;
function loadGroups(): Promise<Group[]> {
  groupCache ??= apiFetch("/api/bom/material-groups").then((r) => r.json())
    .then((j) => (Array.isArray(j?.data) ? (j.data as Group[]).map((g) => ({ id: String(g.id), name: String(g.name), calc_method: g.calc_method ?? null })) : []))
    .catch(() => { groupCache = null; return []; });
  return groupCache;
}

/** ผู้ใช้คนนี้เพิ่มวัสดุใหม่ได้ไหม (สิทธิ์เดียวกับ API สร้างข้อมูลหลัก) */
export function useCanCreateMaterial(): boolean { return usePermission("products.create"); }

export function MaterialQuickCreate({ name: name0, materials, onCreated, onPickExisting, onCancel, groupFilter, saveLabel }: {
  name: string;
  materials: Mat[];
  onCreated: (m: QuickMaterial) => void;
  onPickExisting?: (m: Mat) => void;
  onCancel: () => void;
  /** โชว์เฉพาะชนิดที่ผ่าน (เช่น ป๊อปเพิ่มอะไหล่ = กลุ่มนับชิ้น/ตามยาว) · ไม่ส่ง = ทุกชนิด */
  groupFilter?: (g: { id: string; name: string; calc_method?: string | null }) => boolean;
  /** ข้อความปุ่มบันทึก (ค่าเริ่ม "เพิ่ม + เลือกให้ชิ้นนี้") */
  saveLabel?: string;
}) {
  const t = useT();
  const [name, setName] = useState(name0);
  const [groups, setGroups] = useState<Group[]>([]);
  const [grp, setGrp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let alive = true; void loadGroups().then((g) => { if (alive) setGroups(groupFilter ? g.filter(groupFilter) : g); }); return () => { alive = false; }; }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- ตัวกรองอ่านครั้งเดียวตอนเปิด
  const similar = similarMaterials(name, materials);
  const save = async () => {
    setBusy(true); setErr(null);
    try { const m = await createDesignMaterial(name, grp); onCreated({ ...m, group: groups.find((g) => g.id === grp)?.name ?? null }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div data-material-quick-create className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2 text-[12px]">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-slate-600">{t("วัสดุใหม่", "New material")}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="h-7 min-w-0 flex-1 rounded border border-slate-200 bg-white px-2" aria-label={t("ชื่อวัสดุใหม่", "New material name")} />
      </div>
      {similar.length > 0 && (
        <div className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
          {t("ชื่อคล้ายที่มีอยู่แล้ว:", "Similar ones already exist:")}{" "}
          {similar.map((m, i) => (
            <span key={m.id}>{i > 0 && " · "}
              {onPickExisting
                ? <button type="button" onClick={() => onPickExisting(m)} className="underline hover:text-amber-950">{m.name}</button>
                : <span>{m.name}</span>}
            </span>
          ))}
          {onPickExisting && <span className="text-amber-700"> {t("— กดเพื่อใช้ตัวนั้น", "— click to use it")}</span>}
        </div>
      )}
      <div>
        <div className="mb-1 text-[11px] text-slate-500">{t("ชนิดวัสดุ (ใช้คิดผ้า/ซิป/อะไหล่ · ไม่รู้เว้นได้)", "Material type (for fabric/zip/trim calc · optional)")}</div>
        <div className="flex flex-wrap gap-1">
          {groups.map((g) => (
            <button key={g.id} type="button" onClick={() => setGrp(grp === g.id ? null : g.id)} aria-pressed={grp === g.id}
              className={`rounded-full border px-2 py-0.5 ${grp === g.id ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{g.name}</button>
          ))}
          {!groups.length && <span className="text-slate-400">{t("กำลังโหลดชนิด…", "Loading types…")}</span>}
        </div>
      </div>
      {err && <p className="rounded bg-red-50 px-2 py-1 text-red-700">{err}</p>}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" data-material-quick-save disabled={busy || !name.trim()} onClick={() => void save()} className="h-7 rounded-md bg-blue-600 px-2.5 text-white hover:bg-blue-700 disabled:opacity-50">{busy ? t("กำลังเพิ่ม…", "Adding…") : (saveLabel ?? t("เพิ่ม + เลือกให้ชิ้นนี้", "Add + use for this piece"))}</button>
        <button type="button" onClick={onCancel} className="h-7 rounded-md border border-slate-200 bg-white px-2.5 text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
      </div>
      <p className="text-[11px] text-slate-500">{t("ราคา/หน้ากว้าง ใส่ทีหลังที่หน้าวัสดุตีราคา", "Price/width can be set later on the costing materials page")}</p>
    </div>
  );
}

export function MaterialAddSelect({ materials, exclude, onPick, onCreated, placeholder }: {
  materials: Mat[];
  exclude?: string[];
  onPick: (m: Mat) => void;
  /** ส่งมา = เปิดให้เพิ่มวัสดุใหม่ (ถ้ามีสิทธิ์) — ต้องเอาไปต่อรายการของหน้าแม่ด้วย */
  onCreated?: (m: QuickMaterial) => void;
  placeholder?: string;
}) {
  const t = useT();
  const canCreate = useCanCreateMaterial() && !!onCreated;
  const [draft, setDraft] = useState<string | null>(null);
  const options = materials.filter((m) => !exclude?.includes(m.id)).map((m) => ({ value: m.id, label: m.name, sub: m.sub ?? undefined }));
  return (
    <div className="space-y-1.5">
      <SearchableSelect value="" options={options} placeholder={placeholder ?? t("＋ เพิ่มวัสดุ", "＋ Add material")}
        onChange={(v) => { const m = materials.find((x) => x.id === v); if (m) onPick(m); }}
        {...(canCreate ? { onCreate: (q: string) => setDraft(q), createLabel: t("เพิ่มวัสดุใหม่", "Add new material") } : {})} />
      {draft != null && onCreated && (
        <MaterialQuickCreate name={draft} materials={materials} onCancel={() => setDraft(null)}
          onPickExisting={(m) => { setDraft(null); onPick(m); }}
          onCreated={(m) => { setDraft(null); onCreated(m); onPick({ id: m.id, name: m.name, sub: m.group ?? null }); }} />
      )}
      {!!onCreated && !canCreate && <p className="text-[11px] text-slate-400">{t("ไม่มีวัสดุที่ต้องการ? ให้หัวหน้าเพิ่มที่หน้าวัสดุตีราคา", "Missing a material? Ask a lead to add it on the costing materials page")}</p>}
    </div>
  );
}
