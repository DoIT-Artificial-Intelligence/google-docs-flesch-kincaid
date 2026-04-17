# Implementation Plan: Google Docs Flesch-Kincaid Add-on

## Objective
Develop a Google Docs Standalone Add-on that calculates the Flesch-Kincaid Reading Grade Level for the active document's text and displays the results interactively within a Sidebar UI.

## Key Files & Context
- `appsscript.json`: Manifest file configured for a Docs Add-on, containing required OAuth scopes.
- `src/Code.ts`: Server-side logic for the Apps Script project. It will handle the menu creation, sidebar serving, and text extraction/processing.
- `src/Sidebar.html`: Frontend HTML/CSS/JS for the sidebar UI. It will display the stats and contain a "Refresh" button to trigger the calculation.
- `src/TextAnalyzer.ts`: Helper module for containing the logic to count words, sentences, syllables, and calculating the final grade level score.

## Implementation Steps

### 1. Project Initialization & Configuration
- Ensure the `clasp` project is set up as a standalone script.
- Modify `appsscript.json` to include the `addOns.docs` configuration.
- Add necessary OAuth scopes, specifically `https://www.googleapis.com/auth/documents.currentonly`.

### 2. Server-Side Framework (`Code.ts`)
- Implement `onInstall(e)` and `onOpen(e)` functions to add a custom menu: "Flesch-Kincaid" -> "Show Sidebar".
- Implement `showSidebar()` to evaluate and display `Sidebar.html` using `HtmlService.createHtmlOutputFromFile()`.

### 3. Text Processing Logic (`TextAnalyzer.ts`)
- Create a function `getReadabilityStats()` that fetches the text of the active document using `DocumentApp.getActiveDocument().getBody().getText()`.
- Implement word counting (splitting by word boundaries/punctuation).
- Implement sentence counting (splitting by `.`, `!`, `?`).
- Implement syllable counting using a regex-based heuristic (e.g., counting vowel groups and adjusting for silent 'e's).
- Calculate the Flesch-Kincaid Grade Level: `0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59`.

### 4. Frontend Sidebar UI (`Sidebar.html`)
- Create a simple, clean UI with placeholders for:
  - Flesch-Kincaid Grade Level
  - Word Count
  - Sentence Count
  - Syllable Count
- Add a "Refresh/Calculate" button.
- Write client-side JavaScript to invoke the server-side `getReadabilityStats()` function using `google.script.run` and update the DOM with the results.
- Handle edge cases, such as an empty document, displaying appropriate user feedback.

## Verification & Testing
- Deploy the code using `clasp push`.
- Use the Apps Script "Test Deployments" feature to test the Add-on in a sample Google Doc.
- Prepare a sample text with a known Flesch-Kincaid score to verify the accuracy of the syllable, word, and sentence counting heuristics.
- Test edge cases, including empty documents or documents with a single word.