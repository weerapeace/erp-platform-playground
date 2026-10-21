"use client";

/**
 * ⭐ แท็บรีวิวสินค้าของเว็บร้าน (/website/<shop>?tab=reviews)
 *
 * รายการ = MiniTable กลาง (แยก รอตรวจ / ขึ้นเว็บแล้ว / ซ่อนอยู่) · กดแถว = ERPModal ดูเต็ม + ตอบกลับ · ลบ = ConfirmDialog
 * อนุมัติครั้งแรก = ให้แต้มสมาชิก (ถ้าร้านตั้งไว้ · ครั้งเดียว) · ทุกการเปลี่ยนลง audit
 * ข้อมูล /api/website/reviews · กฎ lib/website-reviews · ตั้งค่า (เปิด/เฉพาะคนซื้อ/อนุมัติอัตโนมัติ/แต้ม) ที่แท็บ 🏪 ข้อมูลร้าน กลุ่ม ⭐
 */
import { useCallback, useEffect, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { REVIEW_STATUSES, type ReviewStatus } from "@/lib/website-reviews";

interface Row {
  id: string;
  parent_code: string;
  product_name: string | null;
  variant_label: string | null;
  order_no: string | null;
  customer_id: string | null;
  rating: number;
  body: string;
  author_name: string;
  images: string[];
  status: ReviewStatus;
  verified: boolean;
  reply: string | null;
  points_awarded: number;
  moderated_by_name: string | null;
  created_at: string;
}

const stars = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
const thDate = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

export function WebsiteReviewsPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Row | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Row | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch(`/api/website/reviews?shop=${encodeURIComponent(shopSlug)}&status=${status}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) toast.error(j.error);
        setRows(j.reviews ?? []);
        setCounts(j.counts ?? {});
      })
      .catch(() => {
        toast.error("โหลดรีวิวไม่สำเร็จ");
        setRows([]);
      });
  }, [shopSlug, status, toast]);
  useEffect(() => load(), [load]);

  const act = async (r: Row, action: "approve" | "hide" | "pending" | "reply" | "delete", text?: string) => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/website/reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, shopId, action, text }) });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return false;
      }
      const msg =
        action === "approve" ? `ขึ้นเว็บแล้ว${j.points ? ` · ให้ ${j.points} แต้มแก่ลูกค้า` : ""}` : action === "hide" ? "ซ่อนรีวิวแล้ว" : action === "pending" ? "ย้ายกลับไปรอตรวจ" : action === "reply" ? (text?.trim() ? "บันทึกคำตอบแล้ว — ขึ้นใต้รีวิวบนเว็บ" : "ลบคำตอบแล้ว") : "ลบรีวิวแล้ว";
      toast.success(msg);
      load();
      return true;
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openRow = (r: Row) => {
    setOpen(r);
    setReply(r.reply ?? "");
  };

  if (rows === null) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {REVIEW_STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatus(s.key)}
            className={`h-8 px-3 rounded-lg text-xs font-medium border ${status === s.key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
          >
            {s.label} <span className="opacity-70">({counts[s.key] ?? 0})</span>
          </button>
        ))}
      </div>

      <MiniTable<Row>
        title="⭐ รีวิวสินค้า"
        rows={rows}
        rowKey={(r) => r.id}
        countUnit="รีวิว"
        searchText={(r) => `${r.parent_code} ${r.product_name ?? ""} ${r.author_name} ${r.body} ${r.order_no ?? ""}`}
        searchPlaceholder="ค้นหารหัสรุ่น / ชื่อ / ข้อความ / เลขออเดอร์"
        onRowClick={openRow}
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">{status === "pending" ? "ไม่มีรีวิวรอตรวจ 🎉" : "ยังไม่มีรีวิวในกลุ่มนี้"}</p>
            <p className="text-xs text-slate-400 mt-1">เปิดรีวิว/ตั้งแต้ม/อนุมัติอัตโนมัติ ที่แท็บ 🏪 ข้อมูลร้าน › กลุ่ม ⭐ รีวิวสินค้า</p>
          </div>
        }
        columns={[
          {
            key: "product",
            header: "สินค้า",
            width: "1.2fr",
            cell: (r) => (
              <span className="min-w-0">
                <span className="block font-mono text-xs font-semibold text-slate-800">{r.parent_code}</span>
                <span className="block text-[11px] text-slate-500 truncate">{r.product_name}{r.variant_label ? ` · ${r.variant_label}` : ""}</span>
              </span>
            ),
            sortValue: (r) => r.parent_code,
          },
          { key: "rating", header: "ดาว", width: "6rem", cell: (r) => <span className="text-amber-500 tracking-tight">{stars(r.rating)}</span>, sortValue: (r) => r.rating },
          {
            key: "body",
            header: "รีวิว",
            width: "2.4fr",
            cell: (r) => (
              <span className="flex items-center gap-2 min-w-0">
                {r.images[0] && <img src={r2ImageUrl(r.images[0], 96) ?? ""} alt="" className="w-9 h-9 rounded object-cover shrink-0" />}
                <span className="text-sm text-slate-700 line-clamp-2">{r.body || <span className="text-slate-400">(ให้ดาวอย่างเดียว)</span>}</span>
                {r.reply && <span className="text-[10px] text-blue-600 shrink-0">💬 ตอบแล้ว</span>}
              </span>
            ),
          },
          {
            key: "who",
            header: "ลูกค้า",
            width: "1fr",
            cell: (r) => (
              <span className="text-xs text-slate-600">
                {r.author_name || "—"}
                {r.verified ? <span className="ml-1 text-emerald-600" title={r.order_no ? `ออเดอร์ ${r.order_no}` : undefined}>✓ ซื้อจริง</span> : <span className="ml-1 text-slate-400">แขก</span>}
                {r.points_awarded > 0 && <span className="block text-[10px] text-amber-700">+{r.points_awarded} แต้ม</span>}
              </span>
            ),
          },
          { key: "date", header: "เมื่อ", width: "7rem", cell: (r) => <span className="text-[11px] text-slate-500">{thDate(r.created_at)}</span>, sortValue: (r) => r.created_at },
          {
            key: "act",
            header: "",
            width: "8.5rem",
            align: "right",
            cell: (r) => (
              <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                {r.status !== "approved" && (
                  <button type="button" disabled={busy} onClick={() => void act(r, "approve")} className="h-7 px-2 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                    ขึ้นเว็บ
                  </button>
                )}
                {r.status !== "hidden" && (
                  <button type="button" disabled={busy} onClick={() => void act(r, "hide")} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 hover:border-slate-400 disabled:opacity-40">
                    ซ่อน
                  </button>
                )}
              </span>
            ),
          },
        ]}
        footnote="ขึ้นเว็บ = ลูกค้าเห็นที่หน้าสินค้า + ดาวเฉลี่ยบนการ์ด/ผลค้นหา Google · ซ่อน = ไม่โชว์แต่ยังเก็บไว้ · กดแถวเพื่อดูรูปเต็มและตอบกลับ"
      />

      <ERPModal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `รีวิว ${open.parent_code} · ${stars(open.rating)}` : ""}
        size="md"
        defaultExpanded={false}
        hasUnsavedChanges={!!open && reply !== (open.reply ?? "")}
        footer={
          open && (
            <div className="flex flex-wrap items-center gap-2 w-full">
              <button type="button" onClick={() => setDel(open)} className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-red-600 hover:border-red-300">
                ลบ
              </button>
              <span className="flex-1" />
              {open.status !== "pending" && (
                <button type="button" disabled={busy} onClick={() => void act(open, "pending").then((ok) => ok && setOpen(null))} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:border-slate-400 disabled:opacity-40">
                  กลับไปรอตรวจ
                </button>
              )}
              {open.status !== "hidden" && (
                <button type="button" disabled={busy} onClick={() => void act(open, "hide").then((ok) => ok && setOpen(null))} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:border-slate-400 disabled:opacity-40">
                  ซ่อน
                </button>
              )}
              {reply !== (open.reply ?? "") && (
                <button type="button" disabled={busy} onClick={() => void act(open, "reply", reply).then((ok) => ok && setOpen({ ...open, reply: reply.trim() || null }))} className="h-9 px-3 text-sm rounded-lg bg-slate-900 text-white disabled:opacity-40">
                  บันทึกคำตอบ
                </button>
              )}
              {open.status !== "approved" && (
                <button type="button" disabled={busy} onClick={() => void act(open, "approve").then((ok) => ok && setOpen(null))} className="h-9 px-4 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">
                  ขึ้นเว็บ
                </button>
              )}
            </div>
          )
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="text-xs text-slate-500 space-y-0.5">
              <p>
                <b className="text-slate-700">{open.product_name ?? open.parent_code}</b>
                {open.variant_label ? ` · ${open.variant_label}` : ""}
              </p>
              <p>
                {open.author_name || "—"} · {open.verified ? `✓ ซื้อจริง${open.order_no ? ` (ออเดอร์ ${open.order_no})` : ""}` : "แขก (ไม่ได้ยืนยันการซื้อ)"} · {thDate(open.created_at)}
              </p>
              {open.points_awarded > 0 && <p className="text-amber-700">ให้แต้มแล้ว {open.points_awarded} แต้ม</p>}
              {open.moderated_by_name && <p>ตรวจล่าสุดโดย {open.moderated_by_name === "auto" ? "ระบบ (อนุมัติอัตโนมัติ)" : open.moderated_by_name}</p>}
            </div>
            <p className="text-amber-500 text-lg">{stars(open.rating)}</p>
            <p className="text-sm text-slate-800 whitespace-pre-line">{open.body || <span className="text-slate-400">(ลูกค้าให้ดาวอย่างเดียว ไม่ได้เขียน)</span>}</p>
            {open.images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {open.images.map((k) => (
                  <button key={k} type="button" onClick={() => setZoom(k)} className="rounded-lg overflow-hidden border border-slate-200">
                    <img src={r2ImageUrl(k, 240) ?? ""} alt="" className="w-24 h-24 object-cover" />
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">💬 คำตอบจากร้าน (โชว์ใต้รีวิวบนเว็บ · เว้นว่าง = ไม่ตอบ)</label>
              <textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, 1000))} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="เช่น ขอบคุณมากค่ะ ดีใจที่ชอบนะคะ 🙏" />
            </div>
          </div>
        )}
      </ERPModal>

      <ERPModal open={!!zoom} onClose={() => setZoom(null)} title="รูปจากลูกค้า" size="lg" defaultExpanded={false}>
        {zoom && <img src={r2ImageUrl(zoom, 1400) ?? ""} alt="" className="w-full h-auto rounded-lg" />}
      </ERPModal>

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) void act(del, "delete").then((ok) => ok && setOpen(null));
          setDel(null);
        }}
        variant="danger"
        title="ลบรีวิวนี้ถาวร?"
        message="รีวิวและรูปจะหายไปเลย (กู้คืนไม่ได้) · ถ้าแค่ไม่อยากให้โชว์ ใช้ปุ่ม &quot;ซ่อน&quot; แทน · แต้มที่ให้ไปแล้วไม่ถูกดึงคืน"
        confirmText="ลบถาวร"
      />
    </div>
  );
}
