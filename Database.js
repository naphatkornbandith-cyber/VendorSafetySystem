
function getDatabase_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty("VENDOR_SPREADSHEET_ID");

  if (!spreadsheetId) {
    throw new Error("ไม่พบฐานข้อมูล กรุณารัน setupVendorSystem ก่อน");
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getSheet_(sheetName) {
  const sheet = getDatabase_().getSheetByName(sheetName);

  if (!sheet) {
    throw new Error("ไม่พบ Sheet: " + sheetName);
  }

  return sheet;
}

function getSheetRecords_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const headers = values[0];

  return values.slice(1).map(row => {
    const record = {};

    headers.forEach((header, index) => {
      record[header] = row[index];
    });

    return record;
  });
}
