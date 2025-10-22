# Asset-Dashboard
Fixed Asset Management Dashboard

## Overview

A comprehensive web-based dashboard for managing fixed assets with real-time audit trail functionality powered by Google Apps Script and Google Sheets.

## Features

- Asset tracking and management
- Real-time audit trail with automatic refresh
- Role-based access control (Admin/User)
- Export to Excel functionality
- Print reports
- Add, view, and delete audit entries
- Asset value tracking

## Setup

### Quick Start

1. Open `index.html` in a web browser
2. Log in with your credentials
3. Start managing your assets

### Audit Trail Configuration

The Audit Trail feature requires a Google Apps Script backend to store data in Google Sheets.

**For detailed setup instructions, see [AUDIT_TRAIL_SETUP.md](AUDIT_TRAIL_SETUP.md)**

Quick steps:
1. Create a Google Sheet with "Audit Trail" sheet
2. Deploy `AuditTrailScript.gs` as a web app in Google Apps Script
3. Update `AUDIT_SCRIPT_URL` in `index.html` with your deployment URL

## Files

- `index.html` - Main application (frontend)
- `AuditTrailScript.gs` - Google Apps Script backend for audit trail
- `AUDIT_TRAIL_SETUP.md` - Comprehensive setup guide
- `README.md` - This file

## Requirements

- Modern web browser (Chrome, Firefox, Edge, Safari)
- Google account (for Audit Trail functionality)
- Admin privileges to manage audit entries

## Security

- Admin authentication required for delete operations
- Row number validation to prevent accidental deletions
- Cannot delete header rows
- All operations logged in Google Apps Script

## Support

For issues with:
- Frontend: Check browser console (F12)
- Backend: Check Google Apps Script execution logs
- Setup: See detailed troubleshooting in AUDIT_TRAIL_SETUP.md
