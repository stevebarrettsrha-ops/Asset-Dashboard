/**
 * Google Apps Script for Fixed Asset Management Dashboard - Audit Trail
 *
 * This script handles CRUD operations for the Audit Trail sheet in Google Sheets.
 * It provides endpoints for:
 * - Reading audit trail entries (GET)
 * - Creating new audit entries (POST)
 * - Deleting audit entries (POST with action='delete')
 *
 * SETUP INSTRUCTIONS:
 * 1. Create a Google Sheets with a sheet named "Audit Trail"
 * 2. Add headers in the first row: Timestamp, Asset Code, Description, Action, User, Location, Notes, Value
 * 3. Copy this script to Google Apps Script (Extensions > Apps Script)
 * 4. Update SPREADSHEET_ID constant below with your Google Sheets ID
 * 5. Deploy as web app (Deploy > New deployment)
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6. Copy the deployment URL and update AUDIT_SCRIPT_URL in index.html
 *
 * @version 1.0
 * @author Claude AI
 */

// ============================================================================
// CONFIGURATION - UPDATE THIS WITH YOUR GOOGLE SHEETS ID
// ============================================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const SHEET_NAME = 'Audit Trail';

// ============================================================================
// MAIN HANDLERS
// ============================================================================

/**
 * Handles GET requests
 * Supports: ?action=read to retrieve all audit trail entries
 */
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'read') {
      return readAuditTrail();
    }

    return createJsonResponse({
      status: 'error',
      message: 'Invalid action. Use ?action=read to retrieve audit entries.'
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: 'GET request failed: ' + error.toString()
    });
  }
}

/**
 * Handles POST requests
 * Supports:
 * - Creating new audit entries (default or action='create')
 * - Deleting audit entries (action='delete' with rowNumber)
 */
function doPost(e) {
  try {
    // Parse JSON data from request body
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'delete') {
      return deleteAuditEntry(data.rowNumber);
    } else if (action === 'create' || !action) {
      // No action or 'create' action means creating a new entry
      return createAuditEntry(data);
    }

    return createJsonResponse({
      status: 'error',
      message: 'Unknown action: ' + action
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: 'POST request failed: ' + error.toString()
    });
  }
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Reads all audit trail entries from the sheet
 * Returns entries with rowNumber for deletion purposes
 */
function readAuditTrail() {
  try {
    const sheet = getAuditSheet();

    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: 'Audit Trail sheet not found. Please create a sheet named "' + SHEET_NAME + '"'
      });
    }

    const lastRow = sheet.getLastRow();

    // If only header row exists or sheet is empty
    if (lastRow <= 1) {
      return createJsonResponse({
        status: 'success',
        entries: []
      });
    }

    // Get all data including headers
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const entries = [];

    // Process each data row (skip header row)
    for (let i = 1; i < data.length; i++) {
      const entry = {};

      // Map each column to its header
      headers.forEach((header, index) => {
        entry[header] = data[i][index];
      });

      // Add rowNumber for delete operations (1-based, matching Google Sheets)
      entry.rowNumber = i + 1;
      entries.push(entry);
    }

    return createJsonResponse({
      status: 'success',
      entries: entries,
      count: entries.length
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: 'Failed to read audit trail: ' + error.toString()
    });
  }
}

/**
 * Creates a new audit trail entry
 * Expected data format:
 * {
 *   timestamp: ISO date string,
 *   assetCode: string,
 *   description: string,
 *   action: string,
 *   user: string,
 *   location: string,
 *   notes: string,
 *   value: number
 * }
 */
function createAuditEntry(data) {
  try {
    const sheet = getAuditSheet();

    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: 'Audit Trail sheet not found. Please create a sheet named "' + SHEET_NAME + '"'
      });
    }

    // Validate required fields
    if (!data.timestamp || !data.assetCode || !data.action) {
      return createJsonResponse({
        status: 'error',
        message: 'Missing required fields: timestamp, assetCode, and action are required'
      });
    }

    // Prepare row data matching the expected column order
    const row = [
      data.timestamp || new Date().toISOString(),
      data.assetCode || '',
      data.description || '',
      data.action || '',
      data.user || '',
      data.location || '',
      data.notes || '',
      data.value || 0
    ];

    // Append the new row
    sheet.appendRow(row);

    return createJsonResponse({
      status: 'success',
      message: 'Entry added successfully',
      rowNumber: sheet.getLastRow()
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: 'Failed to create entry: ' + error.toString()
    });
  }
}

/**
 * Deletes an audit trail entry by row number
 * @param {number} rowNumber - The row number to delete (1-based)
 */
function deleteAuditEntry(rowNumber) {
  try {
    const sheet = getAuditSheet();

    if (!sheet) {
      return createJsonResponse({
        status: 'error',
        message: 'Audit Trail sheet not found'
      });
    }

    // Validate rowNumber
    if (!rowNumber || isNaN(rowNumber)) {
      return createJsonResponse({
        status: 'error',
        message: 'Invalid row number: ' + rowNumber
      });
    }

    const rowNum = parseInt(rowNumber);

    // Prevent deleting header row (row 1)
    if (rowNum < 2) {
      return createJsonResponse({
        status: 'error',
        message: 'Cannot delete header row (row 1)'
      });
    }

    const lastRow = sheet.getLastRow();

    // Check if row exists
    if (rowNum > lastRow) {
      return createJsonResponse({
        status: 'error',
        message: 'Row ' + rowNum + ' does not exist. Sheet has ' + lastRow + ' rows.'
      });
    }

    // Get the data before deletion for confirmation
    const rowData = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
    const assetCode = rowData[1]; // Asset Code is in column 2 (index 1)

    // Delete the row
    sheet.deleteRow(rowNum);

    return createJsonResponse({
      status: 'success',
      message: 'Entry deleted successfully',
      deletedRow: rowNum,
      assetCode: assetCode
    });

  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: 'Failed to delete entry: ' + error.toString()
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the Audit Trail sheet
 * @returns {Sheet} The audit trail sheet object
 */
function getAuditSheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return ss.getSheetByName(SHEET_NAME);
  } catch (error) {
    throw new Error('Failed to access spreadsheet. Please check SPREADSHEET_ID: ' + error.toString());
  }
}

/**
 * Creates a JSON response
 * @param {Object} data - The data to return as JSON
 * @returns {TextOutput} Formatted JSON response
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================================
// UTILITY FUNCTIONS FOR SETUP AND TESTING
// ============================================================================

/**
 * Test function to verify the script is working
 * Run this from the Apps Script editor to test
 */
function testConnection() {
  try {
    const sheet = getAuditSheet();
    if (sheet) {
      Logger.log('✅ Successfully connected to sheet: ' + SHEET_NAME);
      Logger.log('Sheet has ' + sheet.getLastRow() + ' rows');
      return true;
    } else {
      Logger.log('❌ Sheet not found: ' + SHEET_NAME);
      return false;
    }
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return false;
  }
}

/**
 * Initialize the Audit Trail sheet with headers if it doesn't exist
 * Run this once to set up the sheet structure
 */
function initializeAuditSheet() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      // Create the sheet if it doesn't exist
      sheet = ss.insertSheet(SHEET_NAME);
      Logger.log('Created new sheet: ' + SHEET_NAME);
    }

    // Check if headers exist
    const lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      // Add headers
      const headers = ['Timestamp', 'Asset Code', 'Description', 'Action', 'User', 'Location', 'Notes', 'Value'];
      sheet.appendRow(headers);

      // Format header row
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4CAF50');
      headerRange.setFontColor('#FFFFFF');

      // Set column widths
      sheet.setColumnWidth(1, 180); // Timestamp
      sheet.setColumnWidth(2, 120); // Asset Code
      sheet.setColumnWidth(3, 200); // Description
      sheet.setColumnWidth(4, 120); // Action
      sheet.setColumnWidth(5, 150); // User
      sheet.setColumnWidth(6, 150); // Location
      sheet.setColumnWidth(7, 250); // Notes
      sheet.setColumnWidth(8, 100); // Value

      // Freeze header row
      sheet.setFrozenRows(1);

      Logger.log('✅ Initialized ' + SHEET_NAME + ' with headers');
      return true;
    } else {
      Logger.log('ℹ️ Sheet already has data (' + lastRow + ' rows)');
      return true;
    }
  } catch (error) {
    Logger.log('❌ Failed to initialize sheet: ' + error.toString());
    return false;
  }
}

/**
 * Test the read operation
 */
function testRead() {
  const result = readAuditTrail();
  Logger.log(result.getContent());
}

/**
 * Test the create operation
 */
function testCreate() {
  const testData = {
    timestamp: new Date().toISOString(),
    assetCode: 'TEST-001',
    description: 'Test Asset',
    action: 'Test Action',
    user: 'Test User',
    location: 'Test Location',
    notes: 'This is a test entry',
    value: 1000
  };

  const result = createAuditEntry(testData);
  Logger.log(result.getContent());
}

/**
 * Test the delete operation
 * WARNING: This will delete the last row in your sheet!
 */
function testDelete() {
  const sheet = getAuditSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    Logger.log('❌ No data rows to delete (only header exists)');
    return;
  }

  Logger.log('Attempting to delete row ' + lastRow);
  const result = deleteAuditEntry(lastRow);
  Logger.log(result.getContent());
}
