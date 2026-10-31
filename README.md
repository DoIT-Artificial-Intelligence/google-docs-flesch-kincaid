# Google Docs Flesch-Kincaid Readability Calculator

A Google Docs Add-on designed to calculate and display readability metrics (Flesch-Kincaid Grade Level and Flesch Reading Ease) along with advanced text statistics directly in a document sidebar. 

![Google Docs Flesch-Kincaid Screenshot](./Screenshot%202026-04-17%20170955.png)

---

## Features

Everything the Hemingway Editor checks, inside Google Docs, plus more:

- **Readability grade** with a target you choose (grade 4–14) and a Good / OK / Hard rating. Pick the headline formula: Flesch-Kincaid (default), Hemingway-style ARI, or the average of five formulas.
- **All the major scores:** Flesch-Kincaid grade, Flesch reading ease, Automated Readability Index (the formula Hemingway uses), Gunning Fog, SMOG, Coleman-Liau, and their average.
- **Hemingway-style suggestions:**
  - Hard and very hard sentences (red and yellow)
  - Words with simpler alternatives (purple), from the federal plain language word list
  - Adverbs, passive voice, and qualifiers like "very", "just", and "I think"
- **Extra plain language checks Hemingway does not do:** wordy phrases ("in order to" → "to", "due to the fact that" → "because"), repeated words ("the the"), and long paragraphs.
- **Works in the document:**
  - **Highlight in doc** colors issues right in the Google Doc. Each category can be shown or hidden. Highlights only use the add-on's own colors, so your highlights stay. Clear them from the sidebar or **Extensions → Flesch-Kincaid Readability → Clear Highlights**.
  - Click any suggestion to select that text in the document.
  - One-click fixes replace a word or delete a hedge. Deleting cleans up the extra space or comma and capitalizes the sentence again.
  - **Selection** mode checks only the text you select.
  - **Update as I type** re-checks the document a few seconds after it changes.
- **Statistics:** words, sentences, paragraphs, characters, syllables, averages, passive sentence percentage, and reading and speaking time.

### Compared with Hemingway

These sample texts give the same grade, word count, sentence count, and hard and very hard sentence counts in both tools (see `tests/`):

| Text | Hemingway | This add-on (ARI) |
| --- | --- | --- |
| Hemingway's own sample (`hemingway-sample.txt`) | Grade 8, 180 words, 13 sentences, 1 very hard, 1 hard | 7.7 → 8, 180, 13, 1, 1 |
| Benefits memo (`test-memo.txt`) | Grade 10, 156 words, 11 sentences, 3 very hard, 1 hard | 10.4 → 10, 156, 11, 3, 1 |
| Games paragraph (`games.txt`) | Grade 15, 82 words, 3 sentences, 2 very hard | 15.0 → 15, 82, 3, 2 |

On the memo, the add-on also flags "cognizant", "disseminate", "utilizes", "approximately", "the majority of", and "the the". Hemingway's free editor misses all of these.

---

## Technical Architecture

The project is a Google Apps Script editor add-on. Text analysis is pure JavaScript with no Apps Script calls, so it also runs in Node for tests.

- **`src/TextAnalyzer.js`**: sentence splitting (handles abbreviations, initials, and decimals), syllable counting, readability formulas, and style checks. `analyzeParagraphs()` returns totals, scores, and a list of issues with paragraph offsets.
- **`src/Code.js`**: menus and sidebar. It reads paragraphs (including tables and lists), analyzes the document or the selection, writes and clears highlights, selects issues, and applies fixes. Paragraphs are identified by their path of child indexes. Fixes check that the text is still there before changing it.
- **`src/Sidebar.html`**: the sidebar UI. It calls the server with `google.script.run`. When "Update as I type" is on, it compares a cheap document fingerprint every 4 seconds and re-analyzes only when the text or selection changes.

Settings (target grade, formula, highlight and auto-update choices) are saved per user with `PropertiesService`.

---

## How It Works & Calculations

- **Words** are runs of letters and numbers. Contractions and hyphenated words count as one word.
- **Sentences** end at `.`, `!`, `?`, or the end of a paragraph, so headings and list items without periods count as sentences. Abbreviations such as "Dr.", "Jan.", "U.S.", and "e.g." do not end a sentence.
- **Syllables** use vowel-group rules with fixes for silent endings, plus an exception list. They match the CMU Pronouncing Dictionary for 97% of the 5,000 most common English words. The earlier counter matched 90%.

| Score | Formula |
| --- | --- |
| Flesch-Kincaid grade | 0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59 |
| Flesch reading ease | 206.835 − 1.015 × (words / sentences) − 84.6 × (syllables / words) |
| ARI (Hemingway-style) | 4.71 × (letters / words) + 0.5 × (words / sentences) − 21.43 |
| Gunning Fog | 0.4 × (words / sentences + 100 × complex words / words) |
| SMOG | 1.043 × √(polysyllables × 30 / sentences) + 3.1291 |
| Coleman-Liau | 0.0588 × letters per 100 words − 0.296 × sentences per 100 words − 15.8 |

**Hard sentences** follow Hemingway: a sentence of 14 or more words is *hard* when its own ARI grade rounds to 10–13 and *very hard* at 14 or more. Headings are skipped.

Reading ease guide: 90–100 very easy, 80–90 easy, 70–80 fairly easy, 60–70 plain English, 50–60 fairly hard, 30–50 hard, 0–30 very hard.

---

## Repository Structure

```
├── .clasp.json          # Clasp configuration containing the script ID
├── tsconfig.json        # TypeScript configuration for Apps Script compilation
├── src/
│   ├── Code.js          # Google Apps Script lifecycle hooks & RPC wrappers
│   ├── TextAnalyzer.js  # Text parsing, syllable counts, & readability logic
│   ├── Sidebar.html     # User interface (HTML, CSS styling, client-side JS)
│   └── appsscript.json  # Add-on configuration manifest (scopes, runtime)
└── tests/
    ├── analyzer.test.js # Node tests for TextAnalyzer.js
    └── *.txt            # Sample texts compared against Hemingway
```

Run the tests with Node 18 or later:

```bash
node --test tests/analyzer.test.js
```

---

## Local Development & Deployment

This project uses `clasp` (Command Line Apps Script Projects) to synchronize local files with the Google Apps Script ecosystem.

### Prerequisites

Install `clasp` globally:
```bash
npm install -g @google/clasp
```

Log in to your Google Account:
```bash
clasp login
```

### Initializing the Project

To clone the existing script project linked to this repository:
```bash
clasp clone <scriptId>
```
*(The `scriptId` can be found in `.clasp.json`).*

Or, to initialize a brand new Google Doc container script:
```bash
clasp create --title "Google Docs Flesch-Kincaid" --type docs
```

### Development Workflow

- **Pull changes from the Apps Script editor:**
  ```bash
  clasp pull
  ```
- **Push local changes to the Apps Script editor:**
  ```bash
  clasp push
  ```
- **Automatically watch and push changes during development:**
  ```bash
  clasp push --watch
  ```
- **Open the project in the online Apps Script editor:**
  ```bash
  clasp open
  ```

---

## Permissions & OAuth Scopes

The add-on declares the following scopes in `src/appsscript.json`:

- `https://www.googleapis.com/auth/documents.currentonly`: Grants access to read and edit the document the user is currently working on. Used to analyze the text, and to add highlights or apply fixes when you ask.
- `https://www.googleapis.com/auth/script.container.ui`: Allows the script to create and show the sidebar user interface within Google Docs.

---

## Installing & Usage

The add-on is published privately to the maryland.gov domain on the Google Workspace Marketplace. In any Google Doc, open **Extensions → Add-ons → Get add-ons**, search for "Flesch-Kincaid Readability", and click **Install**. Then open **Extensions → Flesch-Kincaid Readability → Show Sidebar**. The sidebar updates as you type. Turn on **Highlight in doc** to see issues in the document.

---

## Privacy

The add-on requests access only to the document you have open and permission to show a sidebar (see the scopes above). It reads the document text only while the sidebar is open. It changes the document only when you turn on highlights or click a fix. The text is analyzed within Google Apps Script and is not stored, logged, or sent to any third party. Your sidebar settings are saved to your Google account.

---

## Support

Report problems or request features via [GitHub Issues](https://github.com/DoIT-Artificial-Intelligence/google-docs-flesch-kincaid/issues).

---

## Releasing to the Marketplace

The Marketplace listing lives in GCP project `adept-figure-493916-r5` (Marketplace SDK). To release an update:

```bash
clasp push
clasp create-version "description"
```

Then set the new **Script version** in Marketplace SDK → App Configuration → Docs add-on.

Store listing text and images are in `store-assets/` (regenerate images with `uv run store-assets/make_assets.py`).