# Google Docs Flesch-Kincaid Project Context

This project aims to provide a tool for calculating Flesch-Kincaid readability scores within Google Docs. It is primarily designed to be a Google Apps Script project managed locally.

## Project Overview

- **Purpose:** Analyze Google Docs content and calculate Flesch-Kincaid Grade Level and Reading Ease scores.
- **Technology Stack:**
  - **Language:** JavaScript / TypeScript (Google Apps Script)
  - **Tooling:** `clasp` (Command Line Apps Script Projects) for local development and deployment.
- **Architecture:** Likely a script bound to a document or a standalone script that interacts with the Google Docs API.

## Building and Running

Since this project uses `clasp`, the following commands are foundational:

### Prerequisites
- Ensure `clasp` is installed and you are logged in:
  ```bash
  clasp login
  ```

### Initialization (if not already done)
To link this local directory to an existing Apps Script project:
```bash
clasp clone <scriptId>
```
Or to create a new project:
```bash
clasp create --title "Google Docs Flesch-Kincaid" --type docs
```

### Development Workflow
- **Pull changes from the server:**
  ```bash
  clasp pull
  ```
- **Push local changes to the server:**
  ```bash
  clasp push
  ```
- **Watch for changes and push automatically:**
  ```bash
  clasp push --watch
  ```
- **Open the project in the Apps Script editor:**
  ```bash
  clasp open
  ```

## Development Conventions

- **Source Code:** Keep Apps Script source files in the root or a designated `src/` directory (configured in `.clasp.json`).
- **File Extensions:** Use `.js` or `.ts`. `clasp` will handle the conversion to `.gs` upon pushing.
- **Manifest:** The `appsscript.json` file is the manifest for the project and should be managed carefully.
- **Testing:** Use modular functions that can be tested independently. Consider using a testing framework compatible with Apps Script if the project grows.
- **Documentation:** Use JSDoc for function headers to provide context within the Apps Script editor.
