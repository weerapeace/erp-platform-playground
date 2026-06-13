"use client";

// ============================================================
// TableColumnSelect — เลือก "คอลัมน์" จากตารางปลายทาง (ของกลาง)
// ใช้ตอนสร้างฟิลด์ชนิด relation: "field ที่ใช้แสดงชื่อ" ต้องเลือกจากคอลัมน์จริง ไม่ใช่พิมพ์เอง
// ดึงคอลัมน์จริงผ่าน /api/admin/schema/columns?table=<table> (information_schema)
// ใช้: <TableColumnSelect table={target} value={labelField} onChange={setLabelField} />
// ============================================================

import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/searchable-select";
import { apiFetch } from "@/lib/api";

export function TableColumnSelect({
  table, value, onChange, placeholder = "— เลือกคอลัมน์ —", className, preferText = true,
}: {
  table: string | null | undefined;
  value: string;
  onChange: (col: string) => void;
  placeholder?: string;
  className?: string;
  /** เรียงคอลัมน์ชนิดข้อความ (text/varchar) ขึ้นก่อน — เหมาะกับ "ชื่อแสดง" */
  preferText?: boolean;
}) {
  const [cols, setCols] = useState<{ column: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!table) { setCols([]); return; }
    let alive = true;
    setLoading(true);
    apiFetch(`/api/admin/schema/columns?table=${encodeURIComponent(table)}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setCols((j.columns ?? []) as { column: string; type: string }[]); })
      .catch(() => { if (alive) setCols([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [table]);

  if (!table) {
    return <div className={`h-9 px-2 flex items-center text-sm text-slate-400 border border-slate-200 rounded-md bg-slate-50 ${className ?? ""}`}>— เลือกตารางปลายทางก่อน —</div>;
  }

  const isText = (t: string) => /char|text|citext/i.test(t);
  const sorted = preferText ? [...cols].sort((a, b) => Number(isText(b.type)) - Number(isText(a.type))) : cols;
  const options = sorted.map((c) => ({ value: c.column, label: c.column, sub: c.type }));
  // คงค่าที่ตั้งไว้แม้ไม่อยู่ในลิสต์ (กันค่าหาย)
  if (value && !cols.some((c) => c.column === value)) options.unshift({ value, label: value, sub: "ตั้งไว้" });

  return <SearchableSelect value={value} onChange={onChange} placeholder={loading ? "กำลังโหลด..." : placeholder} options={options} className={className} />;
}
