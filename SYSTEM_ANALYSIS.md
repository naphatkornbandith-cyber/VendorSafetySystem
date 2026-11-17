# Vendor Safety Management System
## เอกสารวิเคราะห์ระบบและสถาปัตยกรรมซอฟต์แวร์ (System Analysis & Software Architecture)

**เวอร์ชันเอกสาร:** 1.0.0  
**วันที่จัดทำ:** 18 พฤศจิกายน 2026  
**บทบาท:** Senior Full-Stack Developer & Software Architect  
**สถานะ:** เอกสารอ้างอิงการวิเคราะห์ก่อนเริ่มการปรับปรุงระบบ (Pre-implementation Audit)

---

## 1. ภาพรวมระบบ (System Overview)

ระบบ **Vendor Safety Management System** เป็นเว็บแอปพลิเคชันสำหรับจัดการ ตรวจสอบ และติดตามความปลอดภัยของผู้รับเหมา (Contractors / Vendors) ที่เข้ามาปฏิบัติงานในพื้นที่ โดยระบบเดิมถูกพัฒนาขึ้นด้วย:
- **Backend:** Google Apps Script (GAS) รันบน V8 Runtime
- **Database:** Google Sheets (Spreadsheet Database)
- **Storage:** Google Drive จัดเก็บไฟล์หลักฐานภาพถ่ายและเอกสาร
- **Frontend:** HTML5, CSS3 (Dark Slate Theme), Vanilla JavaScript (Single Page Application - SPA Architecture)

---

## 2. การวิเคราะห์ไฟล์และโค้ดทั้งหมด (Source Code Audit)

โปรเจกต์ประกอบด้วยไฟล์ทั้งสิ้น 10 ไฟล์ โดยมีรายละเอียดและหน้าที่ดังนี้:

| ชื่อไฟล์ | ชนิด | หน้าที่และความรับผิดชอบ (Responsibility) |
| :--- | :---: | :--- |
| `.clasp.json` | Config | กำหนดการเชื่อมโยง Apps Script Project ด้วย Google Clasp (`scriptId: 1C3b8UycbAcvFNaeL5CvD0qFoUfVM-_GoOlqXdFSbVnzxeAwdPoS4rPAd`) |
| `appsscript.json` | Manifest | กำหนดค่าสภาพแวดล้อม (V8 Runtime, Timezone `Asia/Bangkok`, Web App Deployment: `executeAs: USER_DEPLOYING`, `access: MYSELF`) |
| `Code.js` | Backend | Entry point สำหรับ Web App (`doGet`, `include`) และฟังก์ชัน Migration/Setup ฐานข้อมูล (`setupVendorSystem`) |
| `Database.js` | Backend | Data Access Layer (DAL): ตัวเชื่อมต่อ Spreadsheet และดึงข้อมูลตารางเป็น Object Records (`getSheetRecords_`) |
| `Vendor.js` | Backend | Business Logic ของ Vendor Module: โหลดรายชื่อผู้รับเหมาและประเภทงาน (`getVendorPageData`) และบันทึกข้อมูลพร้อม concurrency lock (`saveVendor`) |
| `Inspection.js` | Backend | Business Logic ของ Inspection Module: โหลดรายชื่อบริษัทที่ Active (`getInspectionFormData`) บันทึกการตรวจและอัปโหลดไฟล์ลง Google Drive (`saveInspection`) |
| `Upload.js` | Backend | Utility Validation สำหรับตรวจสอบประเภทไฟล์ที่รองรับ (`validateInspectionFile_`) |
| `Index.html` | Frontend | โครงสร้าง SPA Layout หลัก (Sidebar, Topbar, Main Content Area) |
| `CSS.html` | Frontend | สไตล์และชุดสี (Dark Theme: Background `#17212B`, Card `#252F38`, Accent `#F28C28`, Font Prompt) |
| `JavaScript.html` | Frontend | Client Router (`showPage`), Event Listeners, Form Submission, Async Upload, DOM Rendering |

---

## 3. สถาปัตยกรรมข้อมูลและการจัดเก็บ (Database & Storage Architecture)

### 3.1 โครงสร้างฐานข้อมูลบน Google Sheets
ระบบอ้างอิง Spreadsheet ผ่าน `VENDOR_SPREADSHEET_ID` ที่ถูกบันทึกใน `PropertiesService.getScriptProperties()`

```
+--------------------------------------------------------------------------+
|                            Google Sheets Database                        |
+--------------------------------------------------------------------------+
|  1. Vendors                                                              |
|     - Company_Name (PK)                                                  |
|     - Work_Location                                                      |
|     - Created_At, Updated_At, Is_Active                                  |
|                                                                          |
|  2. WorkTypes (Master Data)                                              |
|     - Work_Type_Name (PK)                                                |
|     - Is_Active                                                          |
|                                                                          |
|  3. Vendor_WorkTypes (Junction Table)                                     |
|     - Company_Name (FK -> Vendors.Company_Name)                           |
|     - Work_Type_Name (FK -> WorkTypes.Work_Type_Name)                     |
|     - Created_At                                                         |
|                                                                          |
|  4. Inspections                                                          |
|     - Company_Name (FK -> Vendors.Company_Name)                           |
|     - Inspection_Date, Inspection_Period (Morning/Afternoon)             |
|     - Check_In_Time, Check_Out_Time                                      |
|     - Inspection_Result (ผ่าน / ต้องปรับปรุง / ไม่ผ่าน)                  |
|     - Remarks, Created_At                                                |
|                                                                          |
|  5. Inspection_Files                                                     |
|     - Company_Name, Inspection_Date, Inspection_Period                   |
|     - File_Type (Before / After / Work Permit)                           |
|     - File_Name, Drive_File_ID, File_URL, Uploaded_At                    |
+--------------------------------------------------------------------------+
```

> **ข้อกำหนดสำคัญ:** ห้ามแก้ไขหรือเปลี่ยนชื่อคอลัมน์ของชีตเดิม เพื่อไม่ให้กระทบต่อฟังก์ชัน `setupVendorSystem` ที่มีการตรวจสอบโครงสร้างแบบ Strict Validation

### 3.2 โครงสร้างการจัดเก็บไฟล์บน Google Drive
ระบบจัดเก็บข้อมูลใน Google Drive ภายใต้โฟลเดอร์หลักชื่อ **`VENDOR_SAFETY_STORAGE`** (`VENDOR_ROOT_FOLDER_ID`) ประกอบด้วย:
- `01_Vendor_Records`: จัดเก็บเอกสารของผู้รับเหมา
- `02_Inspection_Evidence`: จัดเก็บหลักฐานภาพถ่ายและเอกสารการตรวจสอบ โดยแบ่งย่อยตามชื่อโฟลเดอร์อัตโนมัติ: `YYYY-MM-DD_{CompanyName}_{Period}`
- `03_Archive`: โฟลเดอร์สำรองข้อมูลและเอกสารประวัติของหน่วยงาน

---

## 4. การประเมินโมดูลและฟังก์ชันของระบบ (Module Capability Matrix)

ตามข้อกำหนดทั้ง 5 โมดูล:

| โมดูล | ฟังก์ชันที่มีอยู่ในปัจจุบัน | สถานะการทำงาน | สิ่งที่ยังขาดและต้องพัฒนาเพิ่ม |
| :--- | :--- | :---: | :--- |
| **1. Vendor Registration** | - ลงทะเบียนบริษัทใหม่<br>- เลือกประเภทงานอันตราย<br>- ป้องกันชื่อบริษัทซ้ำ<br>- ตารางแสดงรายชื่อบริษัท | **ใช้งานได้บางส่วน (70%)** | - การค้นหาและกรองรายชื่อผู้รับเหมา<br>- การแก้ไขข้อมูล (Edit/Update)<br>- การระงับการใช้งาน (Deactivate / Soft Delete)<br>- การอัปโหลดเอกสารนิติบุคคล/หนังสือรับรอง |
| **2. Safety Inspection** | - ฟอร์มบันทึกผลการตรวจความปลอดภัย<br>- บันทึกเวลาเข้า-ออก<br>- แนบรูปถ่าย ก่อน/หลัง ปฏิบัติงาน<br>- อัปเดตรายการเดิมหากตรวจซ้ำในวันและช่วงเวลาเดียวกัน | **ใช้งานได้บางส่วน (65%)** | - หน้าประวัติการตรวจสอบ (Inspection History ยังเป็น Coming Soon)<br>- แดชบอร์ดสรุปสถิติประจำวัน (ปัจจุบันเป็นตัวเลข 0 Mockup)<br>- การ Export รายงานผลการตรวจเป็น PDF หรือ Excel |
| **3. Work Permit** | - ฟิลด์แนบไฟล์ Work Permit ในหน้า Inspection | **ยังไม่พัฒนา (0%)** | - ระบบขออนุญาตเข้าทำงาน (Work Permit Request Form)<br>- การตรวจสอบความเสี่ยงตามประเภทงาน (Hot Work, Height, Confined Space)<br>- การอนุมัติใบอนุญาต (Approval Workflow) และวันหมดอายุ |
| **4. Document Management** | - การบันทึกไฟล์ภาพ/เอกสารลง Google Drive พร้อมเก็บ URL | **ยังไม่พัฒนา (10%)** | - หน้าค้นหาและดาวน์โหลดเอกสาร (Document Center)<br>- การแยกหมวดหมู่เอกสาร (Permits, JSA, Certifications, Incident Reports)<br>- สิทธิ์การเข้าถึงไฟล์ตามระดับความปลอดภัย |
| **5. Request Department Archives** | - สร้างโฟลเดอร์ `03_Archive` เตรียมไว้ใน Google Drive | **ยังไม่พัฒนา (0%)** | - หน้าคลังจัดเก็บเอกสารย้อนหลังของหน่วยงาน<br>- ระบบสืบค้นเอกสารประวัติการทำงานตามแผนก/โครงการ<br>- การดึงข้อมูลอัตโนมัติจากใบงานที่ปิดแล้วเข้าสู่คลังเอกสาร |

---

## 5. การวิเคราะห์ข้อผิดพลาดและจุดเสี่ยงเชิงสถาปัตยกรรม (Bugs & Architectural Risks)

### 5.1 ข้อผิดพลาดระดับวิกฤต (Critical Bugs)
1. **Scope และ Syntax Error ใน `JavaScript.html`:**
   - ที่บรรทัด 3-30: ฟังก์ชัน `showPage` ไม่มีเครื่องหมายปิดปีกกา `}` ก่อนขึ้นต้นฟังก์ชัน `renderInspectionPage` ทำให้ฟังก์ชันลูกทั้งหมดถูกประกาศซ้อนอยู่ภายใน `showPage`
   - ที่บรรทัด 360-362: มีโค้ดตกค้าง `renderComingSoon(titles[page]); } }` ทำให้เกิด Client-side Syntax Error เมื่อผู้ใช้เข้าสู่หน้าเว็บ
2. **Duplicate DOM Elements ใน `Index.html`:**
   - บรรทัด 68-121 และ 124-179 มีบล็อก Dashboard ซ้ำกันสองชุด ทำให้มี Tag ID `#dashboard-date` ซ้ำซ้อน ซึ่งขัดต่อมาตรฐาน HTML DOM

### 5.2 ความเสี่ยงด้านความปลอดภัยและการเข้าถึง (Security & Access Control)
- **โหมดการ Deploy ปัจจุบัน:** ใน `appsscript.json` ตั้งไว้เป็น `access: MYSELF` ซึ่งบุคคลอื่นจะไม่สามารถเปิดใช้งานได้
- **ความต้องการระบบ:** ผู้ใช้ไม่ต้องการหน้า Login แต่ต้องการให้ระบบปลอดภัย
- **แนวทางสถาปัตยกรรมที่แนะนำ:**
  - ใช้ **Role/Department-based Tokenized URL** (เช่น URL พารามิเตอร์ `?auth_token=...` หรือ Passcode ประจำแผนก)
  - เข้ารหัส Hash ใน Script Properties เพื่อยืนยันสิทธิ์ก่อนดำเนินการเรียก `google.script.run`
  - ป้องกัน CSRF / Unauthorized Execution ด้วย Session Token ชั่วคราว

### 5.3 ข้อจำกัดด้านประสิทธิภาพ (Performance & Scalability)
- **การส่งไฟล์ผ่าน `google.script.run`:** การเข้ารหัสรูปภาพเป็น Base64 แล้วส่งผ่าน Payload มีขีดจำกัดขนาดข้อมูล หากอัปโหลดรูปภาพขนาดใหญ่หลายรูปพร้อมกันอาจทำให้เบราว์เซอร์ช้าหรือชนขีดจำกัด Timeout 6 นาทีของ Apps Script
- **แนวทางปรับปรุง:** บีบอัดภาพ (Image Compression via Canvas) ที่ฝั่ง Client ก่อนแปลงเป็น Base64 หรืออัปโหลดแบบแยกไฟล์เป็นชุด (Chunked/Sequential Upload)

### 5.4 การรองรับหลายภาษา (Internationalization - i18n)
- ปัจจุบันข้อความทั้งหมดถูก Hardcode ปะปนกันระหว่างภาษาไทยและภาษาอังกฤษ
- ต้องสร้าง **i18n Dictionary Engine** (เช่น `th` และ `en`) ที่สามารถสลับภาษาได้แบบไดนามิกโดยไม่ต้องรีโหลดหน้าเว็บ

---

## 6. แผนการพัฒนาระบบตามลำดับความสำคัญ (Implementation Roadmap)

```
[Phase 1: Stabilization] ───────► [Phase 2: Security & Foundation]
   - ซ่อม Bug โครงสร้าง Syntax       - ระบบความปลอดภัยไร้ Login
   - ลบ Code ซ้ำซ้อนใน DOM           - ระบบ i18n สลับภาษา (TH/EN)
   - Unit Verification ฟังก์ชันเดิม   - ปรับปรุง Responsive UX
                                                 │
                                                 ▼
[Phase 4: Missing Modules] ◄───── [Phase 3: Core Enhancements]
   - Module 3: Work Permit           - Dashboard สถิติจริง
   - Module 4: Doc Management        - Inspection History (ค้นหา/ดูภาพ)
   - Module 5: Department Archives   - Client-side Image Compression
```

### รายละเอียดแต่ละเฟส:
1. **Phase 1: แก้ไขข้อผิดพลาดและจัดระเบียบโครงสร้างเดิม (Bug Fixing & Stabilization)**
   - แก้ไข Syntax/Scope Error ใน `JavaScript.html`
   - ลบโค้ดซ้ำซ้อนใน `Index.html`
   - ทดสอบการทำงานของ `saveVendor` และ `saveInspection` ให้สมบูรณ์ 100%
2. **Phase 2: วางรากฐานด้านความปลอดภัยและระบบหลายภาษา (Security & i18n)**
   - ออกแบบระบบรักษาความปลอดภัยแบบ Token / Passcode ประจำแผนก
   - พัฒนาระบบ i18n รองรับภาษาไทยและภาษาอังกฤษในทุกโมดูล
   - ออกแบบ Mobile Navigation Drawer และปรับปรุง UI/UX บน Mobile & Tablet
3. **Phase 3: พัฒนาและเชื่อมต่อข้อมูลในโมดูลหลัก (Core Enhancements)**
   - พัฒนาแดชบอร์ดดึงสถิติจริงจากชีต `Inspections` (แสดงจำนวนบริษัทที่ตรวจ, ช่วงเช้า/บ่าย, อัตราผ่าน)
   - พัฒนาหน้าประวัติการตรวจสอบ (Inspection History) พร้อมฟังก์ชัน Filter ตามวันที่และบริษัท
   - พัฒนาตัวบีบอัดรูปภาพก่อนอัปโหลดเพื่อลดเวลาและ Payload
4. **Phase 4: พัฒนาโมดูลที่ยังขาดตามข้อกำหนด (Advanced Modules)**
   - พัฒนา **Module 3: Work Permit** (ฟอร์มขอใบอนุญาตทำงาน, ตรวจสอบประเภทงานอันตราย)
   - พัฒนา **Module 4: Document Management** (ศูนย์รวมเอกสารและการสืบค้น)
   - พัฒนา **Module 5: Request Department Archives** (ระบบคลังเอกสารประวัติของหน่วยงาน)

---
*เอกสารนี้ถูกจัดทำขึ้นตามข้อกำหนด ห้ามลบโค้ดเดิม ห้ามแก้ไขฐานข้อมูลจริง และยังไม่มีการแตะต้อง Source Code ใดๆ จนกว่าจะได้รับอนุมัติแผน*

