# รวม PDF (PdfMergeTool) — ของกลาง

รวมไฟล์ PDF และรูปหลายไฟล์เป็น PDF ไฟล์เดียว **ทำในเบราว์เซอร์ทั้งหมด ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์** (ไม่เปลืองที่เก็บ ไฟล์ไม่หลุด)

- หน้าเครื่องมือ: `/misc/pdf-merge` (แอป "งานอื่นๆ" · เมนู "รวม PDF")
- หน้าจอ: `components/pdf-merge` (`PdfMergeTool`)
- กฎล้วน + เทสต์: `lib/pdf-merge.ts` · `lib/__tests__/pdf-merge.test.ts`
- ตัวรวม (เบราว์เซอร์): `lib/pdf-merge-engine.ts` (`buildMergedPdf`, `mergePdfBlobs`, `downloadBlob`)
- กู้งานค้าง: `lib/pdf-merge-store.ts` (IndexedDB ของเครื่องนี้)

## ใช้ทำอะไร

| ทำได้ | วิธี |
|---|---|
| เพิ่มไฟล์ | ลากมาวาง · กดเลือก · Ctrl+V วางรูป · ลากทั้งโฟลเดอร์ (ของกลาง `useFileDrop`) |
| รับไฟล์ | PDF · JPG · PNG · WEBP · GIF · BMP · HEIC (รูปแปลงเป็นหน้า A4 หันตามรูป มีขอบ 18pt) |
| เรียงลำดับ | โหมด "ทีละไฟล์" ลากการ์ด · โหมด "ทีละหน้า" ลากหน้า (`useDragReorder` · มือถือกดค้างแล้วลาก) |
| หมุน / ลบ | ทั้งไฟล์ หรือรายหน้า |
| ตั้งชื่อ | ช่องชื่อไฟล์ (ตัดอักขระต้องห้าม ต่อ `.pdf` ให้เอง) |
| รวมแล้วดาวน์โหลด | แถบ % + ยกเลิกได้ (`UploadProgress`) |

**ย้อนกลับได้:** เอาไฟล์/หน้าออก · ย้ายลำดับ · หมุน · ล้างทั้งหมด → ปุ่ม "ย้อนกลับ" ในแจ้งผลมุมจอ 5 วินาที (`toast.undo`)
**กู้งานค้าง:** `storageKey` = เก็บไฟล์+ลำดับ+ชื่อในเครื่อง · เปิดหน้าใหม่ได้งานเดิม (แจ้งพร้อมปุ่ม "เริ่มใหม่") · ล้างทั้งหมด = ที่เก็บว่าง

แนวคิดข้อมูล: งาน = รายการหน้าแถวเดียว (`MergePage[]` จำไฟล์ต้นทาง/หน้าที่/มุมหมุน) · โหมดทีละไฟล์จับหน้าที่ติดกันจากไฟล์เดียวเป็นการ์ด (`groupRuns`) — ถ้าแยกหน้าของไฟล์เดียวไปไว้คนละที่ จะเห็นเป็นหลายการ์ดพร้อมป้าย "หน้า 2–3 จาก 5"

## ใช้ในหน้าอื่น

```tsx
// ให้ผู้ใช้จัดเอง (เปิดมาพร้อมไฟล์)
<PdfMergeTool initialFiles={[pdf1, pdf2]} storageKey={null} defaultName="ใบสั่งซื้อรวม" onMerged={(blob, name) => …} />

// รวมในโค้ดเลย ไม่ต้องมีหน้าจอ (เช่น พิมพ์เอกสารหลายใบ → ไฟล์เดียว)
import { mergePdfBlobs, downloadBlob } from "@/lib/pdf-merge-engine";
import { mergedFileName } from "@/lib/pdf-merge";
const blob = await mergePdfBlobs([blobA, blobB]);
downloadBlob(blob, mergedFileName("ใบส่งของรวม"));
```

## ห้ามใช้เมื่อ

- อยากเก็บไฟล์เข้าระบบ → `FileInput` / `DriveUploadBox` (ไฟล์พิมพ์/PDF เก็บ Drive เท่านั้น ห้าม R2)
- สร้าง PDF จากหน้าเว็บ → แผงพิมพ์กลาง (`DocPrintPanel` / `ListPrintPanel` / `SendPdfButton`)
- อ่านข้อความใน PDF ฝั่งเซิร์ฟเวอร์ → `lib/parse-pdf-server`

## ไลบรารี (public/vendor — ห้ามลง npm)

| ไฟล์ | ที่มา | ใบอนุญาต |
|---|---|---|
| `public/vendor/pdf-lib-pdfme-6.1.5.min.js` | `@pdfme/pdf-lib` 6.1.5 (มีในโปรเจกต์อยู่แล้วผ่าน @pdfme) มัดเป็นไฟล์เดียวด้วย esbuild → ตัวแปร `window.PDFLib` | MIT |
| `public/vendor/pdfjs-5.7.284/pdf.min.mjs` + `pdf.worker.min.mjs` | `pdfjs-dist` 5.7.284 (ก๊อปจาก node_modules) | Apache-2.0 |

โหลดตอนใช้งานจริงเท่านั้น (`loadPdfLib` = แท็ก script · `loadPdfJs` = `import(/* webpackIgnore */)`) — หน้าอื่นไม่โหลด
เหตุผลที่ไม่ลงเป็นแพ็กเกจ: Vercel build หน่วยความจำหมด (ดู `lib/image-decode` heic2any · `next.config.ts` BROWSER_ONLY_LIBS)

สร้างไฟล์ pdf-lib ใหม่ (ถ้าจะอัปเวอร์ชัน):
```
echo 'export * from "@pdfme/pdf-lib";' > zz-entry.mjs
node node_modules/esbuild/bin/esbuild zz-entry.mjs --bundle --minify --format=iife --global-name=PDFLib --platform=browser --target=es2019 --outfile=public/vendor/pdf-lib-pdfme-<ver>.min.js
rm zz-entry.mjs
```
แล้วแก้ `PDF_LIB_SRC` ใน `lib/pdf-merge-engine.ts`

## สิทธิ์ / ประวัติ

- ไม่มีสิทธิ์ย่อย — ใครเข้าแอปงานอื่นๆ ได้ก็ใช้ได้ (`lib/menu-permissions` กฎ `/misc/pdf-merge` keys ว่าง) · ซ่อนเมนูรายคนได้ที่ ⚙️ "เมนูและคนเห็น"
- ไม่บันทึกประวัติ (audit) เพราะไม่แตะข้อมูลในระบบ และไฟล์ไม่ออกจากเครื่อง

## ข้อจำกัด

- PDF ล็อกรหัสผ่าน = เปิดไม่ได้ (บอกให้ปลดรหัสก่อน)
- ไฟล์ใหญ่มาก (หลายร้อย MB) ขึ้นกับหน่วยความจำเครื่อง — มือถือรุ่นเก่าอาจช้า
- ยังไม่มี: ใส่เลขหน้า · บีบไฟล์ · บันทึกเข้า Drive (ทำต่อได้ผ่าน `onMerged`)
