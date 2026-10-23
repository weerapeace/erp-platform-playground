# ร่าง / เผยแพร่ / ย้อน ของตัวจัดหน้าเว็บ (useDraftPublish)

ของกลาง `components/website-draft-publish.ts` รวมระบบที่เดิมเขียนซ้ำในตัวจัดหน้า 3 ตัว:
🧱 หน้าแรก (`website-layout-panel`) · 📄 หน้าเว็บ (`website-pages-panel`) · 🆕 หน้าชุดมาใหม่ (`website-drop-page-builder`)

## ทำให้ทุกหน้า
- ↶ ย้อน / ↷ ทำซ้ำ (เก็บ 50 ก้าว) + Ctrl+Z / Ctrl+Shift+Z (ไม่ทำงานตอนพิมพ์ในช่อง)
- บันทึกร่างเองหลังหยุดแก้ 1.5 วินาที แล้วพรีวิวโหลดใหม่ (`previewVersion`) ถ้าบันทึกไม่สำเร็จจะไม่แจ้ง ผู้ใช้กดบันทึกร่างเองได้
- เตือนก่อนปิดเบราว์เซอร์ (`warnOnLeave`: ยังไม่บันทึก หรือยังมีร่างที่ไม่ได้เผยแพร่)
- กดเผยแพร่แล้วเปิดป๊อปตรวจ (`checkOpen` ใช้คู่กับ `PublishCheckDialog`) ยืนยันแล้วค่อยเผยแพร่จริง ข้อความแจ้งผลเป็นแบบเดียวกันทุกหน้า
- กู้คืนจากประวัติเวอร์ชัน (`restored`) เซิร์ฟเวอร์บันทึกเป็นร่างให้แล้ว จึงไม่บันทึกซ้ำ และกด ↶ ย้อนได้

## วิธีใช้
```ts
const dp = useDraftPublish<Block>({
  what: "หน้านี้",                       // → "เผยแพร่หน้านี้แล้ว"
  active: editId !== null,               // ยังไม่ได้เปิดหน้า = ปิดคีย์ลัดและการบันทึกอัตโนมัติ
  save: async (blocks, mode, { auto }) => (await apiFetch(url, { method: "PUT", ... })).json(),
  onSaved: (mode, { auto }) => { /* เช่น โหลดรายการใหม่ */ },
});
// โหลดเสร็จ: dp.reset(draft ?? published, published, hasDraft)
<WebsiteBuilder blocks={dp.blocks} onChange={dp.apply} previewVersion={dp.previewVersion}
  toolbar={{ ...dp.toolbar, statusNote, issues, changes: summarizeChanges(dp.blocks, dp.published, types) }} />
<PublishCheckDialog open={dp.checkOpen} onClose={dp.closeCheck} onConfirm={() => void dp.publish()} busy={dp.busy === "publish"} ... />
```

- API ต้องตอบ `{ ok, error?, purged?, version?, blocks? }` ถ้าเผยแพร่แล้วคืน `blocks` มา จะใช้บล็อกที่เซิร์ฟเวอร์จัดรูปแล้วเป็นค่าปัจจุบัน
- ข้อมูลเฉพาะหน้า (SEO/ชื่อหน้า · ปุ่ม "หน้าตาเดิม" · ละทิ้งร่าง) ให้แต่ละหน้าดูแลเอง

## ยังไม่ใช้
- หน้าดีไซน์ (`website-theme-panel`) ยังมีชุดร่าง/เผยแพร่ของตัวเอง
- หน้าชุดมาใหม่ยังไม่มีประวัติเวอร์ชัน (ต้องเพิ่ม API และตารางเก็บเวอร์ชันก่อน)

ทดสอบ: `lib/__tests__/website-draft-publish.test.ts`
