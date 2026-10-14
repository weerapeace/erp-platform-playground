"use client";

/**
 * WebsiteProductPicker — เลือก "สินค้าที่อยู่บนเว็บร้านนี้" หลายรุ่น (เก็บเป็นรหัสรุ่น code[])
 *
 * ใช้ในบล็อก "ตารางสินค้า / คอลเลกชัน" (schema field type = products)
 * ดึงจาก /api/website/listings?shop= (สินค้าที่เพิ่มในแท็บ "สินค้าบนเว็บ" แล้ว) — ไม่ใช่ทั้ง ERP
 * ป๊อปใช้ของกลาง ERPModal + MiniTable (เลือกหลายแถว) · ลำดับที่เลือก = ลำดับที่โชว์บนเว็บ
 * รายการที่เลือก = แถวมีรูปเล็ก + รหัส + ชื่อ · ลากหูจับ ⠿ เพื่อเรียง (ของกลาง useDragReorder) · ✕ เอาออก
 * รายการสินค้าบนเว็บโหลดครั้งเดียวต่อร้าน (แคชในหน้า) — หลายช่องในหน้าเดียวกันไม่ยิงซ้ำ
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ERPModal } from "@/components/modal";
import { MiniTable } from "@/components/mini-table";
import { keyUrl } from "@/components/website-theme-media";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";

type Listing = {
  id: string;
  code: string;
  erpName: string;
  webName: string;
  published: boolean;
  erpImageKey: string | null;
  webImages: string[];
  webCategory: string;
  mapped: { category?: string; name?: string; images?: string[] } | null;
};

/** สินค้าที่เผยแพร่ของร้าน — แคชต่อร้าน (โหลดใหม่เมื่อเปิดป๊อปเลือก) */
const listingCache = new Map<string, Promise<Listing[]>>();
function loadListings(shopSlug: string, fresh = false): Promise<Listing[]> {
  if (fresh || !listingCache.has(shopSlug)) {
    listingCache.set(
      shopSlug,
      apiFetch(`/api/website/listings?shop=${encodeURIComponent(shopSlug)}`)
        .then((r) => r.json())
        .then((j) => ((j.listings ?? []) as Listing[]).filter((l) => l.published))
        .catch(() => [])
    );
  }
  return listingCache.get(shopSlug)!;
}

export function WebsiteProductPicker({
  shopSlug,
  value,
  max = 24,
  onChange,
}: {
  shopSlug: string;
  value: string[];
  max?: number;
  onChange: (codes: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(value));

  // โหลดรายการตั้งแต่แรก (โชว์รูป/ชื่อในรายการที่เลือก) · เปิดป๊อป = โหลดใหม่ (เผื่อเพิ่งเพิ่มสินค้า)
  useEffect(() => {
    let alive = true;
    if (open) {
      setSel(new Set(value));
      setLoading(true);
    }
    loadListings(shopSlug, open)
      .then((ls) => alive && setRows(ls))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopSlug]);

  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);
  const name = (l: Listing) => l.webName || l.mapped?.name || l.erpName || l.code;
  const img = (l: Listing) => keyUrl(l.webImages?.[0] ?? l.mapped?.images?.[0] ?? l.erpImageKey, 80);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => onChange(moveItem(value, from, to)));

  const confirm = () => {
    // คงลำดับเดิมของตัวที่เลือกไว้แล้ว + ต่อท้ายตัวใหม่ตามลำดับในตาราง
    const keep = value.filter((c) => sel.has(c));
    const added = rows.map((r) => r.code).filter((c) => sel.has(c) && !keep.includes(c));
    onChange([...keep, ...added].slice(0, max));
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-slate-400">ยังไม่ได้เลือกสินค้า</p>
      ) : (
        <ul className="space-y-1">
          {value.map((code, i) => {
            const l = byCode.get(code);
            const u = l ? img(l) : null;
            return (
              <li key={code} {...rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-1.5 py-1 ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} title="ลากเพื่อเรียงลำดับ" />
                <span className="text-[10px] text-slate-400 tabular-nums w-3 text-right">{i + 1}</span>
                {u ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={u} alt="" className="w-8 h-8 rounded object-cover bg-slate-100 shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded bg-slate-100 shrink-0" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block font-mono text-[11px] text-slate-700">{code}</span>
                  <span className={`block text-[10px] truncate ${l ? "text-slate-400" : "text-amber-600"}`}>{l ? name(l) : rows.length ? "ไม่อยู่บนเว็บแล้ว" : ""}</span>
                </span>
                <button type="button" onClick={() => onChange(value.filter((c) => c !== code))} className="text-slate-400 hover:text-red-500 px-1.5" title="เอาออก">
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 hover:border-slate-500">
        🛍️ เลือกสินค้า ({value.length}/{max})
      </button>

      <ERPModal open={open} onClose={() => setOpen(false)} title="เลือกสินค้าที่จะแสดง" size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-slate-500">เลือกแล้ว {sel.size} รุ่น (สูงสุด {max})</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100">ยกเลิก</button>
              <button type="button" onClick={confirm} disabled={sel.size > max} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40">ใช้รายการนี้</button>
            </div>
          </div>
        }
      >
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">กำลังโหลดสินค้าบนเว็บ…</p>
        ) : (
          <MiniTable<Listing>
            rows={rows}
            rowKey={(r) => r.code}
            selectable
            selected={sel}
            onSelectedChange={setSel}
            searchText={(r) => `${r.code} ${name(r)} ${r.webCategory} ${r.mapped?.category ?? ""}`}
            searchPlaceholder="ค้นหารหัส/ชื่อสินค้า"
            countUnit="รุ่น"
            emptyText='ยังไม่มีสินค้าที่เผยแพร่บนเว็บ — เพิ่มได้ที่แท็บ "สินค้าบนเว็บ"'
            dense
            maxHeightClass="max-h-[60vh]"
            columns={[
              {
                key: "img",
                header: "",
                width: "3rem",
                cell: (r) => {
                  const u = img(r);
                  return u ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={u} alt="" className="w-9 h-9 rounded object-cover bg-slate-100" />
                  ) : (
                    <span className="inline-block w-9 h-9 rounded bg-slate-100" />
                  );
                },
              },
              { key: "code", header: "รหัส", width: "7rem", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, sortValue: (r) => r.code },
              { key: "name", header: "ชื่อบนเว็บ", width: "1fr", cell: (r) => <span className="text-sm line-clamp-2">{name(r)}</span>, sortValue: (r) => name(r) },
              { key: "cat", header: "หมวด", width: "7rem", cell: (r) => <span className="text-xs text-slate-500">{r.webCategory || r.mapped?.category || "—"}</span>, sortValue: (r) => r.webCategory || r.mapped?.category || "" },
            ]}
          />
        )}
        {byCode.size > 0 && value.some((c) => !byCode.has(c)) && (
          <p className="mt-2 text-[11px] text-amber-600">บางรหัสที่เลือกไว้ไม่อยู่บนเว็บแล้ว (ถูกปิดเผยแพร่) — จะไม่แสดงบนเว็บ</p>
        )}
      </ERPModal>
    </div>
  );
}
