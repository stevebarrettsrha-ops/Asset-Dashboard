# Audit Trail Setup Guide

This guide will walk you through setting up the Google Apps Script backend for the Audit Trail feature in your Fixed Asset Management Dashboard.

## Overview

The Audit Trail feature consists of two parts:
1. **Frontend (index.html)** - Already configured and ready to use
2. **Backend (AuditTrailScript.gs)** - Needs to be deployed to Google Apps Script

## Prerequisites

- Google account with access to Google Sheets and Google Apps Script
- The `AuditTrailScript.gs` file from this repository

## Step-by-Step Setup

### 1. Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it something like "Fixed Asset Management - Audit Trail"
4. Note the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```
   The SPREADSHEET_ID is the long string between `/d/` and `/edit`

### 2. Create the Audit Trail Sheet (Option A: Manual)

1. In your spreadsheet, rename "Sheet1" to "Audit Trail" (or create a new sheet with this name)
2. Add the following headers in row 1:
   - Column A: `Timestamp`
   - Column B: `Asset Code`
   - Column C: `Description`
   - Column D: `Action`
   - Column E: `User`
   - Column F: `Location`
   - Column G: `Notes`
   - Column H: `Value`

### 2. Create the Audit Trail Sheet (Option B: Automated)

You can use the built-in initialization function after deploying the script (see Step 6).

### 3. Open Apps Script Editor

1. In your Google Sheet, click **Extensions > Apps Script**
2. Delete any existing code in the editor
3. Copy the entire contents of `AuditTrailScript.gs` from this repository
4. Paste it into the Apps Script editor

### 4. Configure the Script

1. Find this line near the top of the script:
   ```javascript
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
   ```
2. Replace `'YOUR_SPREADSHEET_ID_HERE'` with your actual Spreadsheet ID from Step 1
3. Save the script (File > Save or Ctrl+S)
4. Name your project (e.g., "Asset Audit Trail API")

### 5. Test the Script (Optional but Recommended)

1. In the Apps Script editor, select the `testConnection` function from the dropdown
2. Click the Run button (▶️)
3. You'll be asked to authorize the script - click "Review Permissions"
4. Choose your Google account
5. Click "Advanced" > "Go to [Your Project Name] (unsafe)"
6. Click "Allow"
7. Check the execution log (View > Logs) - you should see a success message

### 6. Initialize the Sheet (If you didn't do Step 2 manually)

1. In the Apps Script editor, select the `initializeAuditSheet` function
2. Click Run (▶️)
3. Check the logs - it should create the sheet with formatted headers

### 7. Deploy as Web App

1. In the Apps Script editor, click **Deploy > New deployment**
2. Click the gear icon (⚙️) next to "Select type"
3. Choose **Web app**
4. Configure the deployment:
   - **Description**: "Audit Trail API v1" (or any description)
   - **Execute as**: Me (your email)
   - **Who has access**: Anyone
5. Click **Deploy**
6. You may need to authorize again - follow the same process as in Step 5
7. Copy the **Web app URL** - it will look like:
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```

### 8. Update the Frontend Configuration

1. Open `index.html` from this repository
2. Find this line (around line 1532):
   ```javascript
   const AUDIT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxRt9acOzIUpkzVpss1pSymrNKEPCrISurkWg_T8UZQwWdW_c2WK-Z_0LS3M_uxR-WnQA/exec';
   ```
3. Replace the URL with your Web app URL from Step 7
4. Save the file

### 9. Test the Integration

1. Open `index.html` in your browser
2. Log in with an Admin account
3. Navigate to the "Audit Trail" tab
4. Try adding a new audit entry:
   - Enter an asset code
   - Select an action
   - Add notes (optional)
   - Click "Submit Entry"
5. Verify the entry appears in the audit trail
6. Try deleting an entry (click the red delete button)
7. Check your Google Sheet - the data should be synchronized

## Troubleshooting

### Error: "Failed to fetch audit data"

**Possible causes:**
- Web app URL is incorrect
- Script not deployed or deployment is outdated
- Google Sheets permissions issue

**Solutions:**
1. Verify the AUDIT_SCRIPT_URL in index.html matches your deployment URL
2. Redeploy the script (Deploy > New deployment)
3. Check browser console for detailed error messages

### Error: "Audit Trail sheet not found"

**Possible causes:**
- Sheet name doesn't match exactly (case-sensitive)
- SPREADSHEET_ID is incorrect

**Solutions:**
1. Ensure your sheet is named exactly "Audit Trail"
2. Verify SPREADSHEET_ID in the script
3. Run `initializeAuditSheet()` function

### Error: "Invalid row number"

**Possible causes:**
- Trying to delete header row
- Row number out of range
- Data synchronization issue

**Solutions:**
1. Refresh the audit trail (reload the page)
2. Check that the row exists in Google Sheets
3. Review browser console logs

### Entries not appearing / Updates not showing

**Possible causes:**
- Caching issues
- Script execution timeout
- Sheet permissions

**Solutions:**
1. Hard refresh the browser (Ctrl+Shift+R)
2. Check Google Apps Script execution logs (Apps Script Editor > View > Executions)
3. Verify your Google account has edit permissions on the sheet

### Delete button doesn't work

**Possible causes:**
- Not logged in as Admin
- rowNumber not being passed correctly
- Script error

**Solutions:**
1. Verify you're logged in with Admin role
2. Check browser console for JavaScript errors
3. Verify the Apps Script is returning rowNumber in the read operation
4. Check Apps Script execution logs

## Advanced Configuration

### Changing Sheet Columns

If you want to add or modify columns:

1. Update the headers in Google Sheets
2. Modify the `createAuditEntry` function in the script to match your column order
3. Update the frontend JavaScript to send the new fields

### Adding Email Notifications

You can add email notifications when entries are deleted:

```javascript
function deleteAuditEntry(rowNumber) {
  // ... existing code ...

  // Send email notification
  MailApp.sendEmail({
    to: 'admin@example.com',
    subject: 'Audit Entry Deleted',
    body: `Entry deleted:\nAsset Code: ${assetCode}\nRow: ${rowNum}\nDeleted by: ${Session.getActiveUser().getEmail()}`
  });

  // ... rest of function ...
}
```

### Rate Limiting and Security

For production use, consider:

1. **Authentication**: Implement proper user authentication
2. **Rate Limiting**: Add quotas to prevent abuse
3. **Logging**: Log all delete operations with user info
4. **Backup**: Set up automatic backups of your Google Sheet

## API Reference

### Endpoints

#### GET /exec?action=read
Retrieves all audit trail entries.

**Response:**
```json
{
  "status": "success",
  "entries": [
    {
      "Timestamp": "2025-10-22T10:30:00.000Z",
      "Asset Code": "LAP-001",
      "Description": "Dell Laptop",
      "Action": "Checkout",
      "User": "John Doe",
      "Location": "Building A",
      "Notes": "For remote work",
      "Value": 1200,
      "rowNumber": 2
    }
  ],
  "count": 1
}
```

#### POST /exec (Create Entry)
Creates a new audit trail entry.

**Request:**
```json
{
  "timestamp": "2025-10-22T10:30:00.000Z",
  "assetCode": "LAP-001",
  "description": "Dell Laptop",
  "action": "Checkout",
  "user": "John Doe",
  "location": "Building A",
  "notes": "For remote work",
  "value": 1200
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Entry added successfully",
  "rowNumber": 2
}
```

#### POST /exec (Delete Entry)
Deletes an audit trail entry by row number.

**Request:**
```json
{
  "action": "delete",
  "rowNumber": 2
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Entry deleted successfully",
  "deletedRow": 2,
  "assetCode": "LAP-001"
}
```

## Testing Functions

The script includes several testing functions you can run from the Apps Script editor:

- `testConnection()` - Verify connection to Google Sheets
- `testRead()` - Test reading audit entries
- `testCreate()` - Test creating a test entry
- `testDelete()` - Test deleting the last entry (WARNING: Destructive!)

## Security Considerations

1. **Access Control**: Only Admin users can delete entries (enforced in frontend)
2. **Data Validation**: All inputs are validated before processing
3. **Error Handling**: Comprehensive error handling prevents data corruption
4. **Audit Trail**: All operations are logged in Apps Script execution logs

## Support

If you encounter issues not covered in this guide:

1. Check the browser console (F12) for error messages
2. Review Google Apps Script execution logs
3. Verify all configuration steps were completed
4. Ensure you're using a supported browser (Chrome, Firefox, Edge)

## Version History

- **v1.0** (2025-10-22) - Initial release with read, create, and delete functionality
