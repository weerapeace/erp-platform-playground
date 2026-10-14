"use client";

/**
 * 🎨 โทนสี (ของกลาง ใช้ทุกร้าน) — จัดชื่อสีของสินค้าเป็นกลุ่ม ให้ลูกค้า "กรองตามสี" บนเว็บได้
 * --------------------------------------------------------------------------
 * ข้อมูล: /api/color-tones (erp_color_tones) · ตรรกะว่าสีไหนอยู่โทนไหน = lib/color-tone.ts (ตัวเดียวกับเว็บจริง)
 * - แต่ละโทน: ชื่อ + สีตัวแทน + ชื่อสีที่อยู่ในโทน (🔗 = จับอัตโนมัติจากคำขึ้นต้น · ✋ = ย้ายเข้าเอง) — กด × เอาออก
 * - "+ เพิ่มชื่อสี" ย้ายสีเข้าโทน (ออกจากโทนเดิมให้เอง · 1 สี 1 โทน) · คำขึ้นต้นที่จับอัตโนมัติแก้ได้
 * - กล่องเหลือง = สีที่ยังไม่อยู่ในโทนไหน (ลูกค้ากรองไม่เจอ) · ลาก ⠿ เรียงลำดับปุ่มบนเว็บ
 * ทุกการแก้บันทึกทันที + เว็บร้านล้างแคชเอง
 * ใช้: <ColorToneButton /> (ปุ่ม + ป๊อปอัป) หรือ <ColorToneManager /> ฝังในหน้า
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { ColorInput } from "@/components/color-picker";
import { keyUrl } from "@/components/website-theme-media";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { SwatchIndex, swatchCss, normColorName, splitColorName, type SwatchEntry } from "@/lib/color-swatch";
import { toneOfColor, singleColorNames, type ColorTone } from "@/lib/color-tone";

interface Used { name: string; skus: number; products: number; shops: string[] }

export function ColorToneManager() {
  const toast = useToast();
  const [tones, setTones] = useState<ColorTone[]>([]);
  const [used, setUsed] = useState<Used[]>([]);
  const [swatches, setSwatches] = useState<SwatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newHex, setNewHex] = useState("#B08850");
  const [newErr, setNewErr] = useState("");
  const [del, setDel] = useState<ColorTone | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/color-tones");
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setTones(j.tones ?? []);
      setUsed(j.used ?? []);
      setSwatches(j.swatches ?? []);
    } catch {
      toast.error("โหลดโทนสีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, ok?: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/color-tones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (e) {
      toast.error((e as Error).message || "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // ชื่อสีเดี่ยวทั้งหมดบนเว็บ (แตกสีผสม) + จำนวน SKU ที่ใช้ (รวมที่อยู่ในสีผสม)
  const singles = useMemo(() => {
    const names = singleColorNames(used.map((u) => u.name));
    const skus = new Map<string, number>();
    for (const u of used) for (const p of splitColorName(u.name).length ? splitColorName(u.name) : [u.name]) {
      const k = normColorName(p);
      skus.set(k, (skus.get(k) ?? 0) + u.skus);
    }
    return names.map((n) => ({ name: n, key: normColorName(n), skus: skus.get(normColorName(n)) ?? 0 })).sort((a, b) => b.skus - a.skus);
  }, [used]);
  const idx = useMemo(() => new SwatchIndex(swatches), [swatches]);
  const dot = (name: string, fallback: string) => {
    const spec = idx.resolve(name);
    return spec ? swatchCss(spec, (k) => keyUrl(k, 48) ?? "") : fallback;
  };
  const resolved = useMemo(() => new Map(singles.map((s) => [s.key, toneOfColor(s.name, tones)])), [singles, tones]);
  const orphans = singles.filter((s) => !resolved.get(s.key));
  const inTone = (t: ColorTone) => {
    const list = singles.filter((s) => resolved.get(s.key)?.tone.id === t.id).map((s) => ({ ...s, how: resolved.get(s.key)!.how }));
    // ย้ายเข้าเองไว้ แต่ยังไม่มีสินค้าบนเว็บใช้ชื่อนี้
    const extra = t.members.filter((m) => !singles.some((s) => s.key === m)).map((m) => ({ name: m, key: m, skus: 0, how: "member" as const }));
    return [...list, ...extra];
  };

  const reorder = (from: number, to: number) => {
    const next = moveItem(tones, from, to);
    setTones(next);
    void post({ action: "reorder", ids: next.map((t) => t.id) });
  };
  const drag = useDragReorder(reorder);

  const addTone = async () => {
    if (!newName.trim()) return setNewErr("ใส่ชื่อโทนก่อน");
    if (await post({ action: "create", name: newName.trim(), hex: newHex }, `เพิ่มโทน "${newName.trim()}" แล้ว`)) setNewName("");
  };

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          สีบนเว็บ <b className="text-slate-700">{singles.length}</b> ชื่อ · อยู่ในโทนแล้ว <b className="text-emerald-700">{singles.length - orphans.length}</b>
          {orphans.length > 0 && (
            <>
              {" "}· ยังไม่อยู่ <b className="text-amber-700">{orphans.length}</b>
            </>
          )}
        </span>
        <span className="text-slate-400">🔗 = จับอัตโนมัติจากคำขึ้นต้น · ✋ = ย้ายเข้าเอง · สีผสม (เช่น กรมท่า-ส้ม) นับเข้าทุกโทนของสีย่อยเอง</span>
      </div>

      <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
        {tones.map((t, i) => {
          const list = inTone(t);
          const addable = singles.filter((s) => resolved.get(s.key)?.tone.id !== t.id);
          return (
            <li key={t.id} {...drag.rowProps(i)} className={`px-3 py-2.5 ${drag.rowCls(i)}`}>
              <div className="flex flex-wrap items-start gap-2">
                <DragHandle {...drag.handleProps(i)} title="ลากเพื่อเรียงลำดับปุ่มบนเว็บ" className="pt-1.5" />
                <div className="w-44 shrink-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <ColorInput value={t.hex} onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && v !== t.hex && void post({ action: "update", id: t.id, hex: v })} allowText={false} />
                    <input
                      defaultValue={t.name}
                      key={t.name}
                      onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.name && void post({ action: "update", id: t.id, name: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm font-medium text-slate-800"
                    />
                  </div>
                  <input
                    defaultValue={t.keywords.join(", ")}
                    key={t.keywords.join(",")}
                    title="ชื่อสีที่ขึ้นต้นด้วยคำเหล่านี้ เข้าโทนนี้อัตโนมัติ (สีใหม่ในอนาคตก็เข้าเอง) — คั่นด้วยจุลภาค"
                    placeholder="คำขึ้นต้นที่จับอัตโนมัติ"
                    onBlur={(e) => {
                      const next = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
                      if (next.join(",") !== t.keywords.join(",")) void post({ action: "update", id: t.id, keywords: next });
                    }}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1">
                  {list.map((c) => (
                    <span key={c.key} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${c.skus ? "border-slate-200 bg-slate-50 text-slate-700" : "border-dashed border-slate-300 text-slate-400"}`}>
                      <span className="w-3 h-3 rounded-full ring-1 ring-black/10" style={{ background: dot(c.name, t.hex), backgroundSize: "cover" }} />
                      <span title={c.how === "member" ? "ย้ายเข้าเอง" : "จับอัตโนมัติจากคำขึ้นต้น"}>{c.how === "member" ? "✋" : "🔗"}</span>
                      {c.name}
                      {c.skus > 0 ? <span className="text-slate-400">{c.skus}</span> : <span>(ยังไม่มีสินค้า)</span>}
                      <button type="button" disabled={busy} onClick={() => void post({ action: "unassign", color: c.name, toneId: t.id })} className="text-slate-400 hover:text-rose-500 px-0.5" title="เอาออกจากโทนนี้">
                        ×
                      </button>
                    </span>
                  ))}
                  {!list.length && <span className="text-[11px] text-slate-400">ยังไม่มีสี</span>}
                  <select
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && void post({ action: "assign", color: e.target.value, toneId: t.id }, `ย้าย "${e.target.value}" เข้าโทน ${t.name}`)}
                    className="h-6 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-600"
                  >
                    <option value="">+ เพิ่มชื่อสี</option>
                    {addable.map((s) => (
                      <option key={s.key} value={s.name}>
                        {s.name}
                        {resolved.get(s.key) ? ` (ตอนนี้: ${resolved.get(s.key)!.tone.name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={() => setDel(t)} className="shrink-0 text-xs text-slate-300 hover:text-rose-500 pt-1" title="ลบโทนนี้">
                  🗑
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-xs font-medium text-amber-800 mb-1.5">สีที่ยังไม่อยู่ในโทนไหน — ลูกค้ากรองไม่เจอ ({orphans.length})</p>
        {orphans.length ? (
          <div className="flex flex-wrap gap-1.5">
            {orphans.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700">
                <span className="w-3 h-3 rounded-full ring-1 ring-black/10" style={{ background: dot(s.name, "#ddd"), backgroundSize: "cover" }} />
                {s.name}
                <span className="text-slate-400">{s.skus}</span>
                <select
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && void post({ action: "assign", color: s.name, toneId: e.target.value }, `ย้าย "${s.name}" เข้าโทนแล้ว`)}
                  className="h-5 rounded border border-slate-200 bg-white px-1 text-[10px]"
                >
                  <option value="">ย้ายเข้าโทน…</option>
                  {tones.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-emerald-700">ครบแล้ว — ทุกสีบนเว็บอยู่ในโทน ✓</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ColorInput value={newHex} onChange={setNewHex} allowText={false} />
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setNewErr("");
          }}
          onKeyDown={(e) => e.key === "Enter" && void addTone()}
          placeholder="ชื่อโทนใหม่ เช่น ทอง / เมทัลลิก"
          className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
        />
        <button type="button" disabled={busy} onClick={() => void addTone()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
          + เพิ่มโทน
        </button>
        {newErr && <span className="w-full text-xs text-rose-600">{newErr}</span>}
      </div>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          const t = del;
          setDel(null);
          if (t) void post({ action: "delete", id: t.id }, `ลบโทน "${t.name}" แล้ว`);
        }}
        title="ลบโทนนี้?"
        message={del ? `โทน "${del.name}" จะหายจากตัวกรองบนเว็บ · สีในโทนนี้จะไปเข้าโทนอื่นตามคำขึ้นต้น หรือกลายเป็น "ยังไม่อยู่ในโทนไหน"` : ""}
        confirmText="ลบโทน"
        cancelText="ยกเลิก"
        variant="danger"
      />
    </div>
  );
}

/** ปุ่ม + ป๊อปอัปจัดโทนสี (ใช้ในหน้าดีไซน์เว็บ แท็บหน้ารายการสินค้า) */
export function ColorToneButton({ label = "🎨 จัดโทนสี (ตัวกรองสี)", className }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}
      >
        {label}
      </button>
      <ERPModal
        open={open}
        onClose={() => setOpen(false)}
        title="🎨 โทนสี — สำหรับตัวกรองสีบนเว็บ"
        description="จัดชื่อสีของสินค้าเป็นโทน (ใช้ทุกร้าน) · ลูกค้ากดโทน “แดง” แล้วเห็นสินค้าที่มี แดง / แดงเลือดหมู / แดงไวน์ · บันทึกทันที"
        size="xl"
      >
        {open && <ColorToneManager />}
      </ERPModal>
    </>
  );
}
