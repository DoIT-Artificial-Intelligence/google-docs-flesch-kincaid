# google-docs-flesch-kincaid

A Google Docs add-on that brings Microsoft Word-style readability statistics — including the Flesch Reading Ease score and Flesch-Kincaid Grade Level — to Google Docs. Open the sidebar from the **Extensions** menu and the add-on analyzes the active document and displays grade level, reading ease, word/sentence/paragraph counts, averages, and the percentage of passive sentences, all with a traffic-light indicator that flags whether the writing is at a comfortable reading level.

![Google Docs Flesch-Kincaid Screenshot](./Screenshot%202026-04-17%20170955.png)

## Features

- **Flesch Reading Ease** and **Flesch-Kincaid Grade Level** scores, computed on the full document body.
- **Counts**: words, characters, paragraphs, sentences.
- **Averages**: sentences per paragraph, words per sentence, characters per word.
- **Passive voice detection** via a heuristic regex on "to be" + past participle constructions.
- **Traffic-light indicator** — green at grade ≤ 8.0, amber up to grade 10.0, red above that.
- Manual refresh button to re-analyze on demand after edits.

## Architecture

The add-on follows the standard Google Apps Script add-on model: a sandboxed HTML sidebar communicates with server-side Apps Script functions via the `google.script.run` bridge. All readability math runs server-side so it has direct access to the document body via the `DocumentApp` service; the client is a thin presentation layer.

```mermaid
flowchart LR
    subgraph User["User"]
        U["Author editing<br/>a Google Doc"]
    end

    subgraph Browser["Google Docs (browser)"]
        Menu["Extensions menu<br/>→ Show Sidebar"]
        Sidebar["Sidebar.html<br/>(iframe sandbox)<br/>• traffic-light UI<br/>• counts &amp; averages<br/>• Refresh button"]
    end

    subgraph AppsScript["Google Apps Script runtime (V8)"]
        Code["Code.js<br/>• onOpen / onInstall<br/>• showSidebar()<br/>• calculateStats()"]
        Analyzer["TextAnalyzer.js<br/>• countSyllables()<br/>• isPassive()<br/>• getReadabilityStats()"]
        Manifest["appsscript.json<br/>(manifest + OAuth scopes)"]
    end

    subgraph Google["Google Workspace APIs"]
        DocAPI["DocumentApp<br/>(active doc body)"]
        HtmlSvc["HtmlService<br/>(template + sandbox)"]
    end

    subgraph Dev["Developer workstation"]
        Src["src/ (.js, .html, .json)"]
        Clasp["clasp CLI"]
        TS["tsconfig.json"]
    end

    U -->|opens menu| Menu
    Menu -->|showSidebar| Code
    Code -->|createTemplateFromFile| HtmlSvc
    HtmlSvc -->|renders| Sidebar
    Sidebar -->|google.script.run<br/>.calculateStats()| Code
    Code --> Analyzer
    Analyzer -->|getActiveDocument<br/>.getBody().getText()| DocAPI
    DocAPI -->|raw text| Analyzer
    Analyzer -->|stats JSON| Code
    Code -->|success handler| Sidebar
    Sidebar -->|DOM update| U

    Src -->|clasp push| Code
    Src -->|clasp push| Analyzer
    Src -->|clasp push| Manifest
    Clasp -.->|pull / push| AppsScript
    TS -.->|optional typing| Src
```

### Request lifecycle

When the user opens the add-on, `onOpen` adds a menu item that calls `showSidebar`, which renders `Sidebar.html` through `HtmlService` and pins it to the document UI at 300 px wide. On load, the sidebar calls `calculateStats()` over `google.script.run`. That entry point delegates to `getReadabilityStats()` in `TextAnalyzer.js`, which pulls the body text from `DocumentApp.getActiveDocument()`, tokenizes it, counts syllables with a lightweight heuristic, applies the Flesch and Flesch-Kincaid formulas, and returns a plain JSON object back to the success handler in the sidebar. The sidebar then updates the DOM and recolors the traffic-light bar based on the returned grade level.

### Why server-side analysis

`DocumentApp` is only available inside the Apps Script runtime, not in the sidebar iframe. Doing the work server-side keeps the sidebar small (no need to ship the document over the wire), uses the same OAuth scope the user already granted (`documents.currentonly`), and means no third-party server is involved — Google hosts everything.

## Project structure

```
.
├── src/
│   ├── Code.js           # Add-on lifecycle + sidebar entry point
│   ├── TextAnalyzer.js   # Readability + passive-voice computation
│   ├── Sidebar.html      # Client UI (HTML/CSS/JS in one file)
│   └── appsscript.json   # Manifest: add-on config + OAuth scopes
├── conductor/
│   └── plan.md           # Working notes
├── .clasp.json           # clasp config (scriptId, rootDir, extensions)
├── tsconfig.json         # TypeScript compiler options (optional)
├── LICENSE
└── README.md
```

## Getting started

### Prerequisites

- Node.js (for the `clasp` CLI)
- A Google account with permission to create Apps Script projects
- `@google/clasp` installed globally:
  ```bash
  npm install -g @google/clasp
  clasp login
  ```

### Clone and link

```bash
git clone <this-repo>
cd google-docs-flesch-kincaid
```

The repo already contains a `.clasp.json` pointing at an existing script. To use your own Apps Script project instead, either edit the `scriptId` in `.clasp.json` or run:

```bash
clasp create --title "Flesch-Kincaid Readability" --type docs --rootDir ./src
```

### Push to Apps Script

```bash
clasp push
```

For an iterative development loop:

```bash
clasp push --watch
```

Then `clasp open` to jump to the Apps Script editor in the browser.

### Try it in a doc

1. Open any Google Doc.
2. **Extensions → Apps Scripts → \[your project\] → Test as add-on** (or install the add-on for your account).
3. Choose **Flesch-Kincaid Readability → Show Sidebar** from the Extensions menu.
4. Click **Refresh Statistics** to re-analyze after edits.

## Development notes

- The manifest declares the minimum OAuth scopes needed: `documents.currentonly` (read the active doc only) and `script.container.ui` (show the sidebar). It does **not** request broad Drive access.
- `countSyllables` uses a vowel-cluster heuristic — fast and reasonable on English prose but not perfect. The same is true of `isPassive`, which keys off a small set of "to be" auxiliaries plus a curated list of irregular past participles.
- Grade-level thresholds for the traffic light live in `Sidebar.html` (`updateStats`). Adjust `8.0` and `10.0` there if your audience target differs.
- The project is configured for `.js`, `.ts`, and `.html` files via `.clasp.json`. `tsconfig.json` is present for editor tooling; `clasp` transpiles TypeScript on push if you choose to add `.ts` files.

## Formulas

Flesch Reading Ease:

```
206.835 − 1.015 × (words / sentences) − 84.6 × (syllables / words)
```

Flesch-Kincaid Grade Level:

```
0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59
```

Both are computed in `TextAnalyzer.js#getReadabilityStats`.

## License

See [LICENSE](./LICENSE).