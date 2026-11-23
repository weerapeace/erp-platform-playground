# 💾 SaveBar — แถบบันทึกติดขอบล่าง (ของกลาง)

`components/save-bar/index.tsx`

**ใช้ทำอะไร** — ทุกหน้าที่แก้ข้อมูลได้ต้องเห็นปุ่ม/สถานะบันทึกเสมอ (ไม่ต้องเลื่อนหาปุ่มบนสุด) + ถามก่อนออก/สลับแท็บถ้ายังไม่บันทึก

| แบบ | ใช้เมื่อ | หน้าตา |
|---|---|---|
| `mode="manual"` (ค่าเริ่ม) | กดบันทึกเอง | แก้แล้ว → "มีการแก้ไขที่ยังไม่บันทึก" + [ละทิ้ง] + [💾 บันทึก] · ไม่ได้แก้ → "✓ บันทึกแล้ว" |
| `mode="auto"` | บันทึกเองหลังหยุดแก้ | "มีการแก้ไข — กำลังจะบันทึกอัตโนมัติ" / "กำลังบันทึก…" / "✓ บันทึกอัตโนมัติแล้ว 10:32" / "⚠ บันทึกไม่สำเร็จ" + [💾 บันทึกเดี๋ยวนี้] |

```tsx
<SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={reset} note="บันทึกแล้วขึ้นเว็บทันที" />
<SaveBar mode="auto" dirty={pending} saving={saving} error={err} savedAt={at} onSave={saveNow} />
```

- ยังไม่บันทึก → ถามก่อนปิด/รีโหลดเบราว์เซอร์ (beforeunload) อัตโนมัติ
- หน้าที่มีแท็บ: `const guard = useUnsavedGuardHost()` → ครอบแท็บด้วย `<UnsavedGuardProvider value={guard.register}>` → ก่อนสลับแท็บเช็ก `guard.anyDirty()` แล้วถาม (ConfirmDialog "อยู่ต่อ / ออกโดยไม่บันทึก")
- หน้าที่มีแถบบันทึกของตัวเองแล้ว (เช่น ดีไซน์: ร่าง/เผยแพร่) → `useReportUnsaved(isDirty)` แจ้งหน้าแม่อย่างเดียว
- **ห้ามใช้** กับหน้าที่บันทึกทันทีทุกคลิก (ไม่มีอะไรค้าง) — ใช้ toast ตามเดิม

ใช้ที่ (2026-10-17): เว็บไซต์ → 📂 หมวดหมู่ (auto) · 🎞 คอลเลกชัน · ⚙️ จับคู่ฟิลด์ (เพิ่มเช็กว่ามีการแก้ไหม) · 🏪 ข้อมูลร้าน · 🎨 ดีไซน์ (แจ้งหน้าแม่) · หน้าจัดการเว็บถามก่อนสลับแท็บ

## 💾 บันทึกทั้งหมด — `useSaveAll` + `SaveAllBar` (2026-11-23)

`components/save-bar/save-all.tsx` · หน้า/ป๊อปที่ **แก้ได้หลายแถว** ห้ามให้กด 💾 ทีละแถวอย่างเดียว ต้องมี "บันทึกทั้งหมด (N)"

```tsx
const sa = useSaveAll({ items: rows, keyOf: (r) => r.id, original: (r) => orig.get(r.id),
  isDirty: (r, o) => !!o && r.name !== o.name,
  saveOne: async (r) => { const e = await patch(r); if (!e) markSaved(r); return e; },   // คืนข้อความ error = พลาด
  undoOne: (o) => patch(o), afterUndo: load, label: (r) => r.name });
<div className={sa.isDirty(r) ? DIRTY_ROW_CLASS : ""}>…</div>     // แถวที่แก้ค้าง = แถบส้ม
<SaveAllBar sa={sa} unit="ประเภท" onDiscard={reset} extra={<button>ปิด</button>} />   // ท้ายป๊อป · หน้าเต็มใส่ sticky
```

- บอกผลสำเร็จ/พลาดกี่รายการ · แถวที่พลาดค้างไว้ให้แก้ต่อ (อย่าโหลดใหม่ใน afterSave — อัปเดตค่าเดิมใน saveOne แทน)
- ส่ง `undoOne` = มีปุ่ม "ย้อนกลับ" ในแจ้งผลมุมจอ 10 วิ (บันทึกค่าเดิมกลับทุกแถว)
- Ctrl+S = บันทึกทั้งหมด · ยังแก้ค้าง → เบราว์เซอร์ถามก่อนออก · ปิดป๊อปเองให้ askConfirm ก่อน
- **ห้ามใช้:** ฟอร์มเดียว (ใช้ SaveBar) · หน้าที่บันทึกทันทีทุกการแก้ (เช่น เทียบ field /admin/schema-sync)

ใช้ที่: ค่าเริ่มต้น SKU ต่อประเภท (`components/sku-prefix-manager`) · เทอมจ่าย/ระยะส่งของร้าน (`components/shop-terms-board`)
ยังเขียนเองอยู่ (ย้ายมาใช้ตัวกลางได้): ราคากลางค่าใช้จ่ายเพิ่ม (cost-extras-tools) · ตัวเลือก Design Library (choices-manager) · จัดการสี (color-swatch-manager)
