"use client";

/**
 * 🎯 จับคู่ชื่อสี ↔ สีหลัก (ของกลาง) — สีหลัก = ปุ่ม "กรองตามสี" บนเว็บร้าน (โทนสี erp_color_tones · ใช้ทุกร้าน)
 * --------------------------------------------------------------------------
 * อยู่ในป๊อปทะเบียนสี แท็บ "สีหลักในตัวกรอง" (ColorSwatchButton) · ข้อมูล /api/color-tones · ตรรกะ lib/color-tone.ts
 * - ตาราง = ชื่อสีเดี่ยวทุกชื่อบนเว็บ (แตกสีผสม) + สีหลักตอนนี้ (อัตโนมัติจากคำในชื่อ / ตั้งเอง / ไม่ใช่สี)
 * - ชิป "ยังไม่มีสีหลัก" = ลูกค้ากรองสีแล้วหาไม่เจอ · ชิปต่อสีหลัก = ดูว่ามีชื่อไหนบ้าง
 * - คำแนะนำ (suggestTone): ชื่ออีกภาษาในพจนานุกรมสี → จุดสีในทะเบียนสี → ขนาด/จำนวนรู = ไม่ใช่สี · กด "ใช้" ทีละชื่อ หรือ "ใช้คำแนะนำทั้งหมด"
 * - ติ๊กหลายชื่อ → ตั้งทีเดียว · ที่แก้ค้างไว้ → SaveBar "บันทึกทั้งหมด" (POST action batch ครั้งเดียว + audit + ล้างแคชเว็บ)
 * - "ไม่ใช่สี / ไซส์" = ไม่โชว์ในตัวกรองและไม่นับว่ายังไม่มีสีหลัก (เช่น 10 รู · M (20.5 cm.)) — ป้ายเดียวกับแบบ "ไซส์ (ไม่มีสี)" ในแท็บหน้าตาจุดสี (เก็บในทะเบียนสี)
 * ตั้งชื่อ/สี/คำจับอัตโนมัติ/ลำดับของสีหลัก = ปุ่ม "ตั้งค่าสีหลัก" (ColorToneManager ตัวเดิม)
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { MiniTable } from "@/components/mini-table";
import { SaveBar } from "@/components/save-bar";
import { keyUrl } from "@/components/website-theme-media";
import { ColorToneButton } from "@/components/color-tone-manager";
import { SwatchIndex, swatchCss, normColorName, splitColorName, type SwatchEntry } from "@/lib/color-swatch";
import { toneOfColor, singleColorNames, suggestTone, NOT_COLOR_KEY, type ColorTone } from "@/lib/color-tone";

interface Used { name: string; skus: number }
interface Row {
  key: string;
  name: string;
  skus: number;
  /** สีหลักที่บันทึกอยู่: key โทน · "" = ยังไม่มี · NOT_COLOR_KEY = ไม่ใช่สี */
  saved: string;
  how: "member" | "keyword" | "not" | null;
  css: string | null;
  sug: { key: string; why: string } | null;
}

const NOT_COLOR_LABEL = "ไม่ใช่สี / ไซส์ (ไม่โชว์ในตัวกรอง)";
const selectCls = "w-full h-7 rounded-md border border-slate-200 bg-white px-1.5 text-xs";

function Dot({ css, size = 18 }: { css: string | null; size?: number }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: css ?? "repeating-linear-gradient(45deg,#f1f5f9 0 3px,#e2e8f0 3px 6px)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }}
    />
  );
}

export function ColorToneMatcher({ onDirtyChange, active = true }: { onDirtyChange?: (dirty: boolean) => void; active?: boolean }) {
  const toast = useToast();
  const [tones, setTones] = useState<ColorTone[]>([]);
  const [notColor, setNotColor] = useState<Set<string>>(new Set());
  const [used, setUsed] = useState<Used[]>([]);
  const [swatches, setSwatches] = useState<SwatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("todo");
  // ✏️ ที่แก้ค้างไว้: key ชื่อสี → สีหลักใหม่ · กด "บันทึกทั้งหมด" ทีเดียว
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkTone, setBulkTone] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = Object.keys(drafts).length > 0;

  const load = useCallback(async () => {
    try {
      const j = await apiFetch("/api/color-tones").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setTones(j.tones ?? []);
      setNotColor(new Set(j.notColor ?? []));
      setUsed(j.used ?? []);
      setSwatches(j.swatches ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  // เปิดแท็บนี้ (ครั้งแรก หรือกลับมาหลังตั้งจุดสี) → โหลดใหม่ให้คำแนะนำตามจุดสีล่าสุด · มีของแก้ค้าง = ไม่โหลดทับ
  useEffect(() => { if (active && !dirty) void load(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const toneName = useCallback((k: string) => (k === NOT_COLOR_KEY ? "ไม่ใช่สี / ไซส์" : tones.find((t) => t.key === k)?.name ?? "ยังไม่มี"), [tones]);

  // ชื่อสีเดี่ยวทุกชื่อบนเว็บ (แตกสีผสม) + จำนวน SKU (รวมที่อยู่ในสีผสม) + สีหลักตอนนี้ + คำแนะนำ
  const rows = useMemo<Row[]>(() => {
    const skus = new Map<string, number>();
    for (const u of used) for (const p of splitColorName(u.name).length ? splitColorName(u.name) : [u.name]) {
      const k = normColorName(p);
      skus.set(k, (skus.get(k) ?? 0) + u.skus);
    }
    const idx = new SwatchIndex(swatches);
    return singleColorNames(used.map((u) => u.name)).map((name) => {
      const key = normColorName(name);
      const hit = notColor.has(key) ? null : toneOfColor(name, tones);
      const saved = notColor.has(key) ? NOT_COLOR_KEY : hit?.tone.key ?? "";
      const spec = idx.resolve(name);
      return {
        key, name, skus: skus.get(key) ?? 0, saved,
        how: (notColor.has(key) ? "not" : hit?.how ?? null) as Row["how"],
        css: spec ? swatchCss(spec, (k) => keyUrl(k, 48) ?? "") : null,
        sug: saved ? null : suggestTone(name, tones, idx.find(name) ?? null),
      };
    }).sort((a, b) => b.skus - a.skus);
  }, [used, swatches, tones, notColor]);

  const valueOf = (r: Row) => drafts[r.key] ?? r.saved;
  const setTone = (r: Row, v: string) =>
    setDrafts((m) => {
      const n = { ...m };
      if (v === r.saved) delete n[r.key];
      else n[r.key] = v;
      return n;
    });

  // ชิปกรองตามสถานะที่บันทึกอยู่ (แถวที่เพิ่งแก้ไม่หายไปจากรายการจนกว่าจะบันทึก)
  const todo = rows.filter((r) => !r.saved);
  const shown = filter === "all" ? rows : filter === "todo" ? todo : rows.filter((r) => r.saved === filter);
  const sugReady = shown.filter((r) => r.sug && !drafts[r.key]);
  const bulkSel = [...sel].filter((k) => rows.some((r) => r.key === k));
  const pendingList = Object.entries(drafts).map(([k, v]) => `${rows.find((r) => r.key === k)?.name ?? k} → ${toneName(v)}`);

  // ปุ่มนี้โชว์เฉพาะตอนติ๊กแล้ว
  const applyBulk = () => {
    for (const k of bulkSel) {
      const r = rows.find((x) => x.key === k);
      if (r) setTone(r, bulkTone);
    }
    setSel(new Set());
  };

  const saveAll = async () => {
    const sent = { ...drafts };
    const items = Object.entries(sent).map(([k, tone]) => ({ color: rows.find((r) => r.key === k)?.name ?? k, tone }));
    if (!items.length) return;
    setSaving(true);
    try {
      const j = await apiFetch("/api/color-tones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "batch", items }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      // เอาออกเฉพาะที่ไม่ได้แก้ต่อระหว่างกำลังบันทึก
      setDrafts((m) => { const n = { ...m }; for (const [k, v] of Object.entries(sent)) if (n[k] === v) delete n[k]; return n; });
      toast.success(`จับคู่สีหลัก ${items.length} ชื่อแล้ว — ตัวกรองสีบนเว็บอัปเดตแล้ว`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        เกิดข้อผิดพลาดในการโหลดสีหลัก ({loadError}) <button className="ml-2 underline" onClick={() => void load()}>ลองใหม่</button>
      </div>
    );
  }

  const chip = (k: string, label: ReactNode, n: number, warn = false) => (
    <button key={k} type="button" onClick={() => setFilter(k)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${
        filter === k ? "bg-slate-900 text-white border-slate-900" : warn && n > 0 ? "bg-amber-50 text-amber-800 border-amber-300 hover:border-amber-400" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
      }`}>
      {label} <b className="font-semibold">{n}</b>
    </button>
  );
  const toneOptions = (
    <>
      <option value="">— ยังไม่มีสีหลัก —</option>
      {tones.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
      <option value={NOT_COLOR_KEY}>{NOT_COLOR_LABEL}</option>
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {chip("todo", "ยังไม่มีสีหลัก", todo.length, true)}
        {chip("all", "ทั้งหมด", rows.length)}
        {tones.map((t) => chip(t.key, <><Dot css={t.hex} size={12} />{t.name}</>, rows.filter((r) => r.saved === t.key).length))}
        {chip(NOT_COLOR_KEY, "ไม่ใช่สี / ไซส์", rows.filter((r) => r.saved === NOT_COLOR_KEY).length)}
        <ColorToneButton
          label="ตั้งค่าสีหลัก"
          onClosed={() => { if (!dirty) void load(); }}
          className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        />
      </div>
      <p className="text-[11px] text-slate-500 mb-2">
        สีหลัก = ปุ่ม &quot;กรองตามสี&quot; บนเว็บร้าน (ใช้ทุกร้าน) · ชื่อที่ยังไม่มีสีหลัก = ลูกค้ากดกรองสีแล้วหาไม่เจอ · ติ๊กหลายชื่อแล้วตั้งทีเดียวได้ · สีผสม (เช่น กรมท่า-ส้ม) นับเข้าทุกสีหลักของสีย่อยเอง
      </p>

      <MiniTable<Row>
        rows={shown}
        rowKey={(r) => r.key}
        dense
        maxHeightClass="max-h-[50vh]"
        countUnit="ชื่อ"
        selectable
        selected={sel}
        onSelectedChange={setSel}
        searchText={(r) => r.name}
        searchPlaceholder="ค้นหาชื่อสี…"
        emptyText={loading ? "กำลังโหลด…" : filter === "todo" ? "ทุกชื่อสีบนเว็บมีสีหลักแล้ว" : "ไม่มีชื่อสีในกลุ่มนี้"}
        actions={
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {/* ติ๊กหลายชื่อ → ตั้งสีหลักเดียวกันทีเดียว (ยังไม่บันทึก จนกด "บันทึกทั้งหมด") */}
            {bulkSel.length > 0 && (
              <>
                <span className="text-slate-500">ติ๊ก {bulkSel.length} ชื่อ →</span>
                <select value={bulkTone} onChange={(e) => setBulkTone(e.target.value)} className={`${selectCls} !w-auto`} aria-label="สีหลักที่จะตั้งให้ชื่อที่ติ๊ก">
                  {toneOptions}
                </select>
                <button type="button" onClick={applyBulk} className="h-7 px-2.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">ตั้งทีเดียว</button>
              </>
            )}
            {sugReady.length > 0 && (
              <button type="button" onClick={() => sugReady.forEach((r) => setTone(r, r.sug!.key))}
                className="h-7 px-2.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                ใช้คำแนะนำทั้งหมด ({sugReady.length})
              </button>
            )}
          </div>
        }
        columns={[
          { key: "dot", header: "", width: "2rem", cell: (r) => <Dot css={r.css} /> },
          {
            key: "name", header: "ชื่อสีบนสินค้า", width: "minmax(0,1.5fr)", sortValue: (r) => r.name, sortLabel: "ชื่อสี",
            cell: (r) => (
              <div className="min-w-0">
                <div className="truncate">{r.name}</div>
                {r.sug && !drafts[r.key] && <div className="text-[11px] text-slate-400 truncate">แนะนำ {toneName(r.sug.key)} — {r.sug.why}</div>}
              </div>
            ),
          },
          { key: "skus", header: "บนเว็บ", align: "right", width: "4.5rem", sortValue: (r) => r.skus, sortLabel: "จำนวน SKU", cell: (r) => <span className="text-xs text-slate-500">{r.skus} SKU</span> },
          {
            key: "tone", header: "สีหลัก", width: "11rem", sortValue: (r) => toneName(valueOf(r)), sortLabel: "สีหลัก",
            cell: (r) => (
              <select value={valueOf(r)} onChange={(e) => setTone(r, e.target.value)} onClick={(e) => e.stopPropagation()} aria-label={`สีหลักของ ${r.name}`}
                className={`${selectCls} ${drafts[r.key] !== undefined ? "!border-blue-400 !text-blue-700" : ""}`}>
                {toneOptions}
              </select>
            ),
          },
          {
            key: "how", header: "", width: "8rem",
            cell: (r) =>
              drafts[r.key] !== undefined ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-600 text-white">รอบันทึก</span>
              ) : r.sug ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); setTone(r, r.sug!.key); }} title={r.sug.why}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50 truncate max-w-full">
                  ใช้ {toneName(r.sug.key)}
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">
                  {r.how === "member" ? "ตั้งเอง" : r.how === "keyword" ? "อัตโนมัติจากชื่อ" : r.how === "not" ? "ไม่ใช่สี" : "ยังไม่มีคำแนะนำ"}
                </span>
              ),
          },
        ]}
      />

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={saveAll}
        onDiscard={() => setConfirmDiscard(true)}
        saveLabel={`บันทึกทั้งหมด (${pendingList.length} ชื่อ)`}
        note={dirty ? `แก้ไว้: ${pendingList.slice(0, 4).join(", ")}${pendingList.length > 4 ? ` +${pendingList.length - 4}` : ""}` : "จับคู่ได้หลายชื่อแล้วกดบันทึกทีเดียว · เว็บร้านทุกร้านอัปเดตหลังบันทึก"}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); setDrafts({}); }}
        title="ละทิ้งที่แก้ไว้ทั้งหมด?"
        message={`ชื่อสีที่จับคู่ไว้ ${pendingList.length} ชื่อ จะกลับเป็นค่าเดิม ไม่บันทึก`}
        confirmText="ละทิ้งทั้งหมด"
        cancelText="อยู่ต่อ"
        variant="danger"
      />
    </div>
  );
}
