
function setupVendorSystem(customId) {
  let ss = null;

  if (customId) {
    try {
      ss = SpreadsheetApp.openById(String(customId).trim());
    } catch (e) {}
  }

  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
  }

  const props = PropertiesService.getScriptProperties();

  // หากเปิดเป็น Standalone ให้เช็คจาก Properties หรือสร้าง Google Sheet ใหม่อัตโนมัติ
  if (!ss) {
    const existingId = props.getProperty("VENDOR_SPREADSHEET_ID");
    if (existingId) {
      try {
        ss = SpreadsheetApp.openById(existingId);
      } catch (e) {}
    }

    if (!ss) {
      ss = SpreadsheetApp.create("Vendor_Safety_Database");
      Logger.log("สร้าง Google Sheets ฐานข้อมูลใหม่เรียบร้อยแล้ว: " + ss.getUrl());
    }
  }

  const tables = {
    Vendors: [
      "Company_Name",
      "Work_Location",
      "Created_At",
      "Updated_At",
      "Is_Active"
    ],

    Vendor_WorkTypes: [
      "Company_Name",
      "Work_Type_Name",
      "Created_At"
    ],

    WorkTypes: [
      "Work_Type_Name",
      "Is_Active"
    ],

    Inspections: [
      "Company_Name",
      "Inspection_Date",
      "Inspection_Period",
      "Check_In_Time",
      "Check_Out_Time",
      "Inspection_Result",
      "Remarks",
      "Created_At"
    ],

    Inspection_Files: [
      "Company_Name",
      "Inspection_Date",
      "Inspection_Period",
      "File_Type",
      "File_Name",
      "Drive_File_ID",
      "File_URL",
      "Uploaded_At"
    ]
  };

  // Create database sheets
  Object.entries(tables).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
    }

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length)
        .setValues([headers]);

      formatHeader_(sheet, headers.length);

    } else {
      const currentHeaders = sheet
        .getRange(1, 1, 1, headers.length)
        .getValues()[0];

      const matches = headers.every(
        (header, index) => currentHeaders[index] === header
      );

      if (!matches) {
        throw new Error(
          "โครงสร้าง Sheet " + name +
          " ไม่ตรงกับระบบ กรุณาตรวจสอบก่อนใช้งาน"
        );
      }
    }
  });

  // Insert default work types
  const workSheet = ss.getSheetByName("WorkTypes");

  if (workSheet.getLastRow() === 1) {
    workSheet.getRange(2, 1, 4, 2).setValues([
      ["การเชื่อมไฟฟ้า (Hot Work)", true],
      ["ทำงานบนที่สูงเกิน 2 เมตร (Work at Height)", true],
      ["ทำงานในที่อับอากาศ (Confined Space)", true],
      ["งานที่เกี่ยวข้องกับไฟฟ้า (Electrical Work)", true]
    ]);
  }

  // Set timezone
  ss.setSpreadsheetTimeZone("Asia/Bangkok");

  props.setProperty("VENDOR_SPREADSHEET_ID", ss.getId());
  props.setProperty("VENDOR_TIME_ZONE", "Asia/Bangkok");

  // Create Google Drive folders
  const rootFolder = getOrCreateFolder_(
    DriveApp.getRootFolder(),
    "VENDOR_SAFETY_STORAGE"
  );

  props.setProperty("VENDOR_ROOT_FOLDER_ID", rootFolder.getId());

  const folderNames = [
    "01_Vendor_Records",
    "02_Inspection_Evidence",
    "03_Archive"
  ];

  folderNames.forEach(name => {
    const folder = getOrCreateFolder_(rootFolder, name);
    props.setProperty("FOLDER_" + name, folder.getId());
  });

  SpreadsheetApp.flush();

  try {
    SpreadsheetApp.getUi().alert("Vendor Safety Database Setup Completed!");
  } catch (e) {
    Logger.log("Vendor Safety Database Setup Completed! Spreadsheet ID: " + ss.getId() + " URL: " + ss.getUrl());
  }
}

function formatHeader_(sheet, columnCount) {
  sheet.setFrozenRows(1);

  sheet.getRange(1, 1, 1, columnCount)
    .setBackground("#1F4E78")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");

  sheet.autoResizeColumns(1, columnCount);
}

function getOrCreateFolder_(parent, folderName) {
  const folders = parent.getFoldersByName(folderName);

  if (folders.hasNext()) {
    return folders.next();
  }

  return parent.createFolder(folderName);
}

function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("Vendor Safety Management")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
