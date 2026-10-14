"use client";

/**
 * หน้าต่าง "แม่แบบผืน" (ของกลาง — เปิดจากป๊อปอัปแก้ผืนผ้าใบ ปุ่ม 📐 แม่แบบ)
 *
 *   บันทึกผืนนี้เป็นแม่แบบ (ตั้งชื่อ) → ใช้ซ้ำกับผืนอื่น/หน้าอื่น/ร้านอื่น
 *   แม่แบบตั้งต้นของระบบ (ไม่มีรูป สีตามธีม) · แม่แบบที่บันทึกไว้: ใช้ · แก้ชื่อ · บันทึกทับด้วยผืนนี้ · ลบ
 *   "ใช้" = คัดลอกเนื้อผืนมาแทนผืนนี้ (ย้อนกลับได้ด้วย ↶) — แก้ผืนทีหลังไม่กระทบแม่แบบ และกลับกัน
 *
 * ข้อมูล: /api/website/canvas-templates (ตาราง website_canvas_templates · audit log ครบ)
 */
import { useCallback, useEffect, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { CanvasMiniPreview } from "@/components/website-canvas-mini";
import { CANVAS_STARTER_TEMPLATES } from "@/lib/website-canvas";
import type { ThemeColors } from "@/components/website-canvas-inspector";

export type CanvasTemplate = { id: string; shopId: string | null; shopName: string | null; name: string; data: Record<string, unknown>; createdByName: string | null; updatedAt: string };

type Confirm = null | { kind: "apply" | "overwrite" | "delete"; name: string; data?: Record<string, unknown>; id?: string };

const fmtDate = (s: string) => {
  try {
    return new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return "";
  }
};

export function CanvasTemplates({
  open,
  onClose,
  shopId,
  block,
  theme,
  fontNames,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  /** ผืนที่กำลังแก้ (ไว้บันทึกเป็นแม่แบบ / บันทึกทับ) */
  block: Record<string, unknown>;
  theme: ThemeColors;
  fontNames: { display: string; body: string };
  /** ใช้แม่แบบ → ตัวแก้ผืนใส่เนื้อแม่แบบแทนผืนนี้ */
  onApply: (data: Record<string, unknown>) => void;
}) {
  const toast = useToast();
  const [list, setList] = useState<CanvasTemplate[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [scope, setScope] = useState<"shop" | "all">("shop");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  const itemCount = Array.isArray(block.items) ? block.items.length : 0;

  const load = useCallback(async () => {
    setLoadErr(false);
    try {
      const r = await apiFetch("/api/website/canvas-templates");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error);
      setList((j.templates ?? []) as CanvasTemplate[]);
    } catch {
      setLoadErr(true);
      setList([]);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    const n = name.trim();
    if (!n) {
      toast.warning("ตั้งชื่อแม่แบบก่อน เช่น “หัวเว็บคอลเลกชันฤดูร้อน”");
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch("/api/website/canvas-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, name: n, block }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success(`บันทึกแม่แบบ “${n}” แล้ว`);
      setName("");
      setScope("shop");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/website/canvas-templates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success(okMsg);
      await load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const doConfirm = async () => {
    const c = confirm;
    if (!c) return;
    if (c.kind === "apply" && c.data) {
      onApply(c.data);
      setConfirm(null);
      onClose();
      toast.success(`ใช้แม่แบบ “${c.name}” แล้ว — ย้อนกลับได้ด้วยปุ่ม ↶`);
      return;
    }
    if (c.kind === "overwrite" && c.id) {
      if (await patch(c.id, { block }, `บันทึกทับ “${c.name}” ด้วยผืนนี้แล้ว`)) setConfirm(null);
      return;
    }
    if (c.kind === "delete" && c.id) {
      setBusy(true);
      try {
        const r = await apiFetch(`/api/website/canvas-templates?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "ลบไม่สำเร็จ");
        toast.success(`ลบแม่แบบ “${c.name}” แล้ว`);
        setConfirm(null);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
    }
  };

  /** ใช้แม่แบบ: ผืนว่าง = ใส่เลย · มีของอยู่แล้ว = ถามก่อน (แทนที่ทั้งผืน) */
  const use = (tplName: string, data: Record<string, unknown>) => {
    if (itemCount) setConfirm({ kind: "apply", name: tplName, data });
    else {
      onApply(data);
      onClose();
      toast.success(`ใช้แม่แบบ “${tplName}” แล้ว`);
    }
  };

  const shown = (list ?? []).filter((t) => scope === "all" || t.shopId === shopId);
  const card = "rounded-xl border border-slate-200 bg-white p-2 flex flex-col gap-2";
  const small = "rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:border-slate-400 disabled:opacity-40";

  return (
    <>
      <ERPModal open={open} onClose={onClose} title="📐 แม่แบบผืน" size="lg" defaultExpanded={false} resizable={false}>
        <div className="space-y-5">
          {/* บันทึกผืนนี้ */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-800">บันทึกผืนนี้เป็นแม่แบบ</p>
            <p className="text-[11px] text-slate-500">เก็บทั้งผืน (ชิ้นส่วน · ตำแหน่งคอม/มือถือ · ความสูง · พื้นหลัง) ไว้ใช้ซ้ำกับผืนอื่น หน้าอื่น หรือร้านอื่น</p>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                placeholder="ชื่อแม่แบบ เช่น หัวเว็บคอลเลกชันฤดูร้อน"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
              />
              <button onClick={() => void save()} disabled={saving || !itemCount} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
              </button>
            </div>
            {!itemCount && <p className="text-[11px] text-amber-600">ผืนนี้ยังว่าง — วางชิ้นก่อนแล้วค่อยบันทึก</p>}
          </div>

          {/* แม่แบบที่บันทึกไว้ */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm font-semibold text-slate-800">แม่แบบที่บันทึกไว้</p>
              {(["shop", "all"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} className={`rounded-full border px-2.5 py-1 text-[11px] ${scope === s ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}>
                  {s === "shop" ? "ร้านนี้" : "ทุกร้าน"}
                </button>
              ))}
            </div>
            {list === null ? (
              <p className="py-6 text-center text-xs text-slate-400">กำลังโหลด…</p>
            ) : loadErr ? (
              <div className="py-6 text-center text-xs text-red-600">
                โหลดแม่แบบไม่สำเร็จ{" "}
                <button onClick={() => void load()} className="underline">
                  ลองใหม่
                </button>
              </div>
            ) : !shown.length ? (
              <p className="py-6 text-center text-xs text-slate-400">{scope === "shop" ? "ร้านนี้ยังไม่มีแม่แบบ — บันทึกผืนที่ชอบไว้ด้านบน หรือดู “ทุกร้าน”" : "ยังไม่มีแม่แบบ"}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {shown.map((t) => (
                  <div key={t.id} className={card}>
                    <CanvasMiniPreview data={t.data} theme={theme} fontNames={fontNames} width={300} />
                    {renaming?.id === t.id ? (
                      <div className="flex gap-1">
                        <input
                          autoFocus
                          className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          maxLength={80}
                          value={renaming.name}
                          onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void patch(t.id, { name: renaming.name }, "เปลี่ยนชื่อแล้ว").then((ok) => ok && setRenaming(null));
                            if (e.key === "Escape") setRenaming(null);
                          }}
                        />
                        <button disabled={busy || !renaming.name.trim()} onClick={() => void patch(t.id, { name: renaming.name }, "เปลี่ยนชื่อแล้ว").then((ok) => ok && setRenaming(null))} className={small}>
                          ✓
                        </button>
                        <button onClick={() => setRenaming(null)} className={small}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{t.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {t.shopId === shopId ? "ร้านนี้" : t.shopName ?? "ร้านอื่น"} · {fmtDate(t.updatedAt)}
                          {t.createdByName ? ` · ${t.createdByName}` : ""}
                        </p>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => use(t.name, t.data)} className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] text-white hover:bg-blue-700">
                        ใช้แบบนี้
                      </button>
                      <button disabled={busy} onClick={() => setRenaming({ id: t.id, name: t.name })} className={small} title="แก้ชื่อ">
                        ✏️ ชื่อ
                      </button>
                      <button disabled={busy || !itemCount} onClick={() => setConfirm({ kind: "overwrite", id: t.id, name: t.name })} className={small} title="แทนเนื้อแม่แบบด้วยผืนที่กำลังแก้">
                        💾 บันทึกทับ
                      </button>
                      <button disabled={busy} onClick={() => setConfirm({ kind: "delete", id: t.id, name: t.name })} className={`${small} text-red-600`} title="ลบแม่แบบ">
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* แม่แบบตั้งต้น */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">แบบสำเร็จของระบบ</p>
            <p className="text-[11px] text-slate-500 -mt-1">ไม่มีรูป ใช้สีตามธีมร้าน — ใส่แล้วแก้ข้อความ/เพิ่มรูปต่อได้</p>
            <div className="grid grid-cols-3 gap-3">
              {CANVAS_STARTER_TEMPLATES.map((t) => (
                <div key={t.key} className={card}>
                  <CanvasMiniPreview data={t.data} theme={theme} fontNames={fontNames} width={190} />
                  <p className="text-xs font-medium text-slate-700 truncate">{t.name}</p>
                  <button onClick={() => use(t.name, t.data)} className="rounded-md border border-blue-300 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50">
                    ใช้แบบนี้
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ERPModal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doConfirm()}
        loading={busy}
        variant={confirm?.kind === "delete" ? "danger" : undefined}
        title={confirm?.kind === "apply" ? "แทนที่ผืนนี้ด้วยแม่แบบ?" : confirm?.kind === "overwrite" ? "บันทึกทับแม่แบบ?" : "ลบแม่แบบนี้?"}
        message={
          confirm?.kind === "apply"
            ? `ชิ้นที่วางอยู่ ${itemCount} ชิ้นจะถูกแทนด้วยแม่แบบ “${confirm?.name ?? ""}” (กด ↶ ย้อนกลับได้)`
            : confirm?.kind === "overwrite"
              ? `เนื้อแม่แบบ “${confirm?.name ?? ""}” จะถูกแทนด้วยผืนที่กำลังแก้ (ผืนที่เคยใช้แม่แบบนี้ไปแล้วไม่เปลี่ยน)`
              : `“${confirm?.name ?? ""}” จะหายจากรายการถาวร (ผืนที่เคยใช้แม่แบบนี้ไปแล้วไม่กระทบ)`
        }
        confirmText={confirm?.kind === "apply" ? "แทนที่" : confirm?.kind === "overwrite" ? "บันทึกทับ" : "ลบ"}
      />
    </>
  );
}
