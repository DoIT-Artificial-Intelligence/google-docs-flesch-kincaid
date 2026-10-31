/**
 * Server-side Apps Script functions for the Google Docs Add-on: menus, the
 * sidebar, reading the document, and writing highlights and fixes back to it.
 * Text analysis itself lives in TextAnalyzer.js.
 */

/** Background colors used for in-document highlights, by issue type. */
const HIGHLIGHT_COLORS = {
  veryHard: '#f6c4c3',
  hard: '#fbecb4',
  simpler: '#e3cff8',
  wordy: '#e3cff8',
  adverb: '#c5e2fa',
  qualifier: '#c5e2fa',
  passive: '#cbedc9',
  repeated: '#fbd5b3',
  acronym: '#f9d0e6'
};
const OUR_COLORS = new Set(Object.values(HIGHLIGHT_COLORS));
/** Each highlight is a few document calls, so very long documents are capped. */
const MAX_HIGHLIGHTS = 1000;

const DEFAULT_SETTINGS = {
  targetGrade: 8,
  primaryScore: 'fleschKincaid',
  autoRefresh: true,
  highlight: false,
  scope: 'document',
  hidden: []
};

function onInstall(e) {
  onOpen(e);
}

function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem('Show Sidebar', 'showSidebar')
    .addItem('Clear Highlights', 'clearHighlights')
    .addToUi();
}

function showSidebar() {
  const template = HtmlService.createTemplateFromFile('Sidebar');
  template.settingsJson = JSON.stringify(getSettings()).replace(/</g, '\\u003c');
  const html = template.evaluate().setTitle('Flesch-Kincaid Readability');
  DocumentApp.getUi().showSidebar(html);
}

function getSettings() {
  const saved = PropertiesService.getUserProperties().getProperty('settings');
  return Object.assign({}, DEFAULT_SETTINGS, saved ? JSON.parse(saved) : {});
}

function saveSettings(settings) {
  const clean = {};
  Object.keys(DEFAULT_SETTINGS).forEach(k => { if (k in settings) clean[k] = settings[k]; });
  PropertiesService.getUserProperties().setProperty('settings', JSON.stringify(clean));
}

// ---------------------------------------------------------------------------
// Reading the document
// ---------------------------------------------------------------------------

/**
 * Collects every paragraph and list item in the body (including inside
 * tables) in document order. Each entry has the element, a path of child
 * indices from the body (stable between calls while the structure is
 * unchanged), and its text built from its Text children.
 */
function collectParagraphs(body) {
  const out = [];
  const walk = (container, path) => {
    const n = container.getNumChildren();
    for (let i = 0; i < n; i++) {
      const child = container.getChild(i);
      const type = child.getType();
      const childPath = path.concat(i);
      if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
        out.push(paragraphRecord(child, childPath));
      } else if (type === DocumentApp.ElementType.TABLE || type === DocumentApp.ElementType.TABLE_ROW ||
                 type === DocumentApp.ElementType.TABLE_CELL) {
        walk(child, childPath);
      }
    }
  };
  walk(body, []);
  return out;
}

function paragraphRecord(element, path) {
  const p = element.getType() === DocumentApp.ElementType.LIST_ITEM ? element.asListItem() : element.asParagraph();
  const pieces = textChildren(p);
  return {
    element: p,
    path: path.join('.'),
    text: pieces.map(x => x.text).join(''),
    heading: p.getHeading() !== DocumentApp.ParagraphHeading.NORMAL
  };
}

/** Text children of a paragraph with their offsets in the paragraph text. */
function textChildren(paragraph) {
  const out = [];
  let offset = 0;
  const n = paragraph.getNumChildren();
  for (let i = 0; i < n; i++) {
    const child = paragraph.getChild(i);
    if (child.getType() !== DocumentApp.ElementType.TEXT) continue;
    const textEl = child.asText();
    const text = textEl.getText();
    out.push({ el: textEl, index: i, start: offset, text });
    offset += text.length;
  }
  return out;
}

function resolvePath(body, path) {
  let el = body;
  path.split('.').forEach(i => { el = el.getChild(Number(i)); });
  return paragraphRecord(el, path.split('.').map(Number));
}

function pathOf(element) {
  const path = [];
  let el = element;
  while (el.getParent() && el.getType() !== DocumentApp.ElementType.BODY_SECTION) {
    const parent = el.getParent();
    path.unshift(parent.getChildIndex(el));
    el = parent;
  }
  return el.getType() === DocumentApp.ElementType.BODY_SECTION ? path : null;
}

function enclosingParagraph(element) {
  let el = element;
  while (el) {
    const t = el.getType();
    if (t === DocumentApp.ElementType.PARAGRAPH || t === DocumentApp.ElementType.LIST_ITEM) return el;
    el = el.getParent();
  }
  return null;
}

/**
 * Paragraph windows covered by the user's selection: [{record, start, end}].
 * Returns null when nothing is selected.
 */
function selectedWindows(doc) {
  const selection = doc.getSelection();
  if (!selection) return null;
  const byPath = {};
  selection.getRangeElements().forEach(re => {
    const el = re.getElement();
    const paraEl = enclosingParagraph(el);
    if (!paraEl) return;
    const path = pathOf(paraEl);
    if (!path) return; // headers, footers, footnotes
    const key = path.join('.');
    const record = byPath[key] ? byPath[key].record : paragraphRecord(paraEl, path);
    let start = 0;
    let end = record.text.length;
    if (el.getType() === DocumentApp.ElementType.TEXT) {
      const index = record.element.getChildIndex(el);
      const piece = textChildren(record.element).filter(c => c.index === index)[0];
      if (piece) {
        start = piece.start + (re.isPartial() ? re.getStartOffset() : 0);
        end = piece.start + (re.isPartial() ? re.getEndOffsetInclusive() + 1 : piece.text.length);
      }
    }
    if (byPath[key]) {
      byPath[key].start = Math.min(byPath[key].start, start);
      byPath[key].end = Math.max(byPath[key].end, end);
    } else {
      byPath[key] = { record, start, end };
    }
  });
  const windows = Object.keys(byPath).map(k => byPath[k]);
  windows.sort((a, b) => comparePaths(a.record.path, b.record.path));
  return windows.length ? windows : null;
}

function comparePaths(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return x.length - y.length;
}

/**
 * Cheap change detector for auto-refresh. In selection scope it also changes
 * when the selection moves.
 */
function getFingerprint(scope) {
  const doc = DocumentApp.getActiveDocument();
  let key = fingerprint(doc.getBody().getText());
  if (scope === 'selection') {
    const windows = selectedWindows(doc) || [];
    key += '|' + windows.map(w => w.record.path + ':' + w.start + '-' + w.end).join(',');
  }
  return key;
}

function fingerprint(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes) + ':' + text.length;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes the document or the current selection.
 *
 * @param {{scope?: string, highlight?: boolean, hidden?: string[]}} options
 * @return {Object} analysis result plus `paths` (paragraph id -> path),
 *   `scope` actually used, and the document `fingerprint`.
 */
function analyzeDocument(options) {
  options = options || {};
  const doc = DocumentApp.getActiveDocument();
  const body = doc.getBody();
  let scope = options.scope === 'selection' ? 'selection' : 'document';
  let notice = '';

  let records;
  if (scope === 'selection') {
    const windows = selectedWindows(doc);
    if (windows) {
      records = windows.map((w, i) => ({
        id: i, path: w.record.path, heading: w.record.heading,
        text: w.record.text.slice(w.start, w.end), offset: w.start
      }));
    } else {
      scope = 'document';
      notice = 'Nothing is selected, so the whole document was analyzed.';
    }
  }
  if (!records) {
    records = collectParagraphs(body).map((r, i) => ({ id: i, path: r.path, heading: r.heading, text: r.text, offset: 0 }));
  }

  const ignored = getIgnored();
  const result = analyzeParagraphs(records, { ignored, acronyms: scope === 'document' });
  result.paths = records.map(r => r.path);
  result.scope = scope;
  result.notice = notice;
  result.fingerprint = getFingerprint(options.scope);

  if (options.highlight) {
    const applied = applyHighlights(body, result, options.hidden || []);
    result.highlighted = true;
    if (applied >= MAX_HIGHLIGHTS) {
      result.notice = 'This document is long, so only the first ' + MAX_HIGHLIGHTS +
        ' issues are highlighted. Use Selection to check one part at a time.';
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

/** Removes highlight colors added by this add-on, leaving other backgrounds alone. */
function clearHighlights() {
  const body = DocumentApp.getActiveDocument().getBody();
  collectParagraphs(body).forEach(r => {
    textChildren(r.element).forEach(c => clearOurColors(c.el, c.text.length));
  });
}

function clearOurColors(textEl, length) {
  if (!length) return;
  const idx = textEl.getTextAttributeIndices();
  for (let i = 0; i < idx.length; i++) {
    const bg = textEl.getBackgroundColor(idx[i]);
    if (bg && OUR_COLORS.has(bg.toLowerCase())) {
      const end = (i + 1 < idx.length ? idx[i + 1] : length) - 1;
      textEl.setBackgroundColor(idx[i], end, null);
    }
  }
}

function applyHighlights(body, result, hidden) {
  clearHighlights();
  const hiddenSet = new Set(hidden);
  const records = {};
  // Sentences first so word-level colors sit on top of them.
  const order = ['veryHard', 'hard', 'passive', 'adverb', 'qualifier', 'simpler', 'wordy', 'acronym', 'repeated'];
  const issues = result.issues.filter(i => HIGHLIGHT_COLORS[i.type] && !hiddenSet.has(i.type)).slice(0, MAX_HIGHLIGHTS);
  order.forEach(type => {
    issues.filter(i => i.type === type).forEach(issue => {
      const path = result.paths[issue.p];
      const record = records[path] || (records[path] = resolvePath(body, path));
      piecesFor(record, issue.start, issue.end).forEach(pc => colorRange(pc.el, pc.start, pc.end, HIGHLIGHT_COLORS[type]));
    });
  });
  return issues.length;
}

/** Colors [start, end] (inclusive) without overwriting backgrounds the user set. */
function colorRange(textEl, start, end, color) {
  const idx = textEl.getTextAttributeIndices();
  const length = textEl.getText().length;
  for (let i = 0; i < idx.length; i++) {
    const runStart = idx[i];
    const runEnd = (i + 1 < idx.length ? idx[i + 1] : length) - 1;
    if (runEnd < start || runStart > end) continue;
    const bg = textEl.getBackgroundColor(runStart);
    if (!bg || OUR_COLORS.has(bg.toLowerCase())) {
      textEl.setBackgroundColor(Math.max(start, runStart), Math.min(end, runEnd), color);
    }
  }
}

/** Splits a paragraph range [start, end) into per-Text-element inclusive ranges. */
function piecesFor(record, start, end) {
  const out = [];
  textChildren(record.element).forEach(c => {
    const a = Math.max(start, c.start);
    const b = Math.min(end, c.start + c.text.length);
    if (b > a) out.push({ el: c.el, start: a - c.start, end: b - c.start - 1 });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Jumping to and fixing issues
// ---------------------------------------------------------------------------

/**
 * Finds an issue's current position, tolerating small edits elsewhere in the
 * paragraph. Throws if the text is gone.
 */
function locateIssue(body, issue) {
  let record;
  try {
    record = resolvePath(body, issue.path);
  } catch (e) {
    record = null;
  }
  if (record && record.text.slice(issue.start, issue.end) === issue.text) {
    return { record, start: issue.start, end: issue.end };
  }
  const candidates = record ? [record] : [];
  collectParagraphs(body).forEach(r => { if (!record || r.path !== record.path) candidates.push(r); });
  for (let i = 0; i < candidates.length; i++) {
    const at = nearestIndex(candidates[i].text, issue.text, issue.start);
    if (at !== -1) return { record: candidates[i], start: at, end: at + issue.text.length };
  }
  throw new Error('That text has changed. Click Refresh to re-analyze.');
}

function nearestIndex(haystack, needle, near) {
  let best = -1;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    if (best === -1 || Math.abs(i - near) < Math.abs(best - near)) best = i;
    i = haystack.indexOf(needle, i + 1);
  }
  return best;
}

/** Selects an issue in the document so the user can see and edit it. */
function selectIssue(issue) {
  const doc = DocumentApp.getActiveDocument();
  const loc = locateIssue(doc.getBody(), issue);
  const builder = doc.newRange();
  piecesFor(loc.record, loc.start, loc.end).forEach(pc => builder.addElement(pc.el, pc.start, pc.end));
  doc.setSelection(builder.build());
  return true;
}

/**
 * Replaces an issue's text. An empty replacement deletes the word along with
 * the extra space or comma it leaves behind, and re-capitalizes the sentence.
 */
function replaceIssue(issue, replacement) {
  const doc = DocumentApp.getActiveDocument();
  const loc = locateIssue(doc.getBody(), issue);
  const text = loc.record.text;
  let start = loc.start;
  let end = loc.end;
  const atSentenceStart = /(^|[.!?]["'”’)]?\s+)$/.test(text.slice(0, start)) || text.slice(0, start).trim() === '';

  if (!replacement) {
    // "I believe that we..." -> "We...": drop the "that" a hedge introduces.
    if (/^(?:i|we)\b/i.test(issue.text)) {
      const that = text.slice(end).match(/^,?\s+that\b/i);
      if (that) end += that[0].length;
    }
    const after = text.slice(end).match(/^,?\s+/);
    if (after) end += after[0].length;
    else if (/\s$/.test(text.slice(0, start))) start -= 1;
  }

  const pieces = piecesFor(loc.record, start, end);
  if (!pieces.length) throw new Error('Could not find that text.');
  const first = pieces[0];
  for (let i = pieces.length - 1; i >= 0; i--) pieces[i].el.deleteText(pieces[i].start, pieces[i].end);
  if (replacement) {
    first.el.insertText(first.start, replacement);
  } else if (atSentenceStart) {
    const rest = first.el.getText();
    const ch = rest.charAt(first.start);
    if (/[a-z]/.test(ch)) {
      first.el.deleteText(first.start, first.start);
      first.el.insertText(first.start, ch.toUpperCase());
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Ignoring issues (per document)
// ---------------------------------------------------------------------------

function getIgnored() {
  const saved = PropertiesService.getDocumentProperties().getProperty('ignored');
  return saved ? JSON.parse(saved) : [];
}

/** Ignores every issue with this key (type + text) in the current document. */
function ignoreIssue(key) {
  const list = getIgnored();
  if (list.indexOf(key) === -1) list.push(key);
  // Document properties hold up to 9 KB per value; keep the newest keys.
  while (JSON.stringify(list).length > 8500) list.shift();
  PropertiesService.getDocumentProperties().setProperty('ignored', JSON.stringify(list));
}

function resetIgnored() {
  PropertiesService.getDocumentProperties().deleteProperty('ignored');
}

// ---------------------------------------------------------------------------
// AI rewrites (Gemini)
// ---------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const AI_DAILY_LIMIT = 300;

/**
 * Rewrites text in plain language with Gemini, re-scores the result, retries
 * once if it is still hard, and checks that the meaning did not change.
 *
 * @param {{path:string, start:number, end:number, text:string}|null} ref the
 *   text to rewrite, or null to use the current selection.
 * @param {number} targetGrade reading grade to aim for.
 * @return {{ref:Object, rewrite:string, grade:number, sameMeaning:boolean, changes:string[]}}
 */
function aiRewrite(ref, targetGrade) {
  if (!ref) ref = selectionRef();
  const target = Math.max(4, Math.min(14, Number(targetGrade) || 8));
  countAiUse();

  let rewrite = geminiJson(rewritePrompt(ref.text, target, ''), {
    type: 'OBJECT', properties: { rewrite: { type: 'STRING' } }, required: ['rewrite']
  }).rewrite.trim();
  let check = scoreText(rewrite);
  if (check.hard || check.grade > target + 1) {
    const feedback = 'Your last attempt was still at grade ' + Math.round(check.grade) +
      '. Use shorter sentences and simpler words.\nLast attempt: ' + rewrite;
    rewrite = geminiJson(rewritePrompt(ref.text, target, feedback), {
      type: 'OBJECT', properties: { rewrite: { type: 'STRING' } }, required: ['rewrite']
    }).rewrite.trim();
    check = scoreText(rewrite);
  }

  const meaning = geminiJson(
    'Compare the ORIGINAL text and its plain language REWRITE.\n' +
    'List every fact, number, name, date, condition, or requirement that the rewrite adds, removes, or changes. ' +
    'Also list it if a requirement became optional or a request (for example "must" became "please"). ' +
    'Ignore changes in wording, tone, or sentence structure that keep the meaning. ' +
    'Set sameMeaning to true only if the list is empty. Keep each item under 15 words.\n\n' +
    'ORIGINAL: ' + ref.text + '\n\nREWRITE: ' + rewrite,
    {
      type: 'OBJECT',
      properties: { sameMeaning: { type: 'BOOLEAN' }, changes: { type: 'ARRAY', items: { type: 'STRING' } } },
      required: ['sameMeaning', 'changes']
    });

  return {
    ref,
    rewrite,
    grade: check.grade,
    sameMeaning: !!meaning.sameMeaning && !(meaning.changes || []).length,
    changes: meaning.changes || []
  };
}

function rewritePrompt(text, target, feedback) {
  return 'You are a plain language editor for the State of Maryland.\n' +
    'Rewrite the TEXT so a reader at US grade ' + target + ' or below can understand it.\n' +
    'Rules:\n' +
    '- Keep every fact, number, name, date, deadline, condition, and requirement.\n' +
    '- Keep obligations as obligations: "must" stays "must". Never turn a requirement into a request.\n' +
    '- Do not add information, examples, or reasons that are not in the text.\n' +
    '- Use short sentences (under 20 words), common words, and active voice.\n' +
    '- Speak to the reader as "you" when the text is about the reader.\n' +
    '- Keep the same language, and keep any names or terms that must stay exact.\n' +
    '- Return only the rewritten text, with no quotes or notes.\n' +
    (feedback ? '\n' + feedback + '\n' : '') +
    '\nTEXT: ' + text;
}

/** Grade (Flesch-Kincaid) and whether any sentence is still hard. */
function scoreText(text) {
  const r = analyzeParagraphs([{ id: 0, text }]);
  return { grade: r.scores.fleschKincaid, hard: r.counts.hard + r.counts.veryHard > 0 };
}

function geminiJson(prompt, schema) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('AI rewrites are not set up yet. Ask your administrator to add GEMINI_API_KEY.');
  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 }
      })
    });
  if (response.getResponseCode() !== 200) {
    console.error('Gemini error ' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 500));
    throw new Error('The AI service is busy or unavailable. Try again in a minute.');
  }
  const body = JSON.parse(response.getContentText());
  const part = body.candidates && body.candidates[0] && body.candidates[0].content &&
    body.candidates[0].content.parts && body.candidates[0].content.parts[0];
  if (!part) throw new Error('The AI service did not return a rewrite. Try again.');
  return JSON.parse(part.text);
}

/** Per-user daily limit so one person cannot use up the shared quota. */
function countAiUse() {
  const props = PropertiesService.getUserProperties();
  const today = Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
  const saved = JSON.parse(props.getProperty('aiUse') || '{}');
  const used = saved.day === today ? saved.n : 0;
  if (used >= AI_DAILY_LIMIT) throw new Error('You have reached today\'s limit of ' + AI_DAILY_LIMIT + ' AI rewrites.');
  props.setProperty('aiUse', JSON.stringify({ day: today, n: used + 1 }));
}

/** The selected text as an issue-style reference. It must sit in one paragraph. */
function selectionRef() {
  const windows = selectedWindows(DocumentApp.getActiveDocument());
  if (!windows) throw new Error('Select the text you want to rewrite first.');
  if (windows.length > 1) throw new Error('Select text within one paragraph to rewrite it.');
  const w = windows[0];
  if (!w.record.text.slice(w.start, w.end).trim()) throw new Error('Select the text you want to rewrite first.');
  // Rewrite whole sentences, so a selection that starts or ends mid-sentence
  // does not leave a broken sentence behind.
  let start = w.start;
  let end = w.end;
  splitSentences(w.record.text).forEach(s => {
    if (s.start < w.end && s.end > w.start) {
      start = Math.min(start, s.start);
      end = Math.max(end, s.end);
    }
  });
  const text = w.record.text.slice(start, end);
  if (text.length > 2000) throw new Error('Select a shorter passage (under 2,000 characters) to rewrite.');
  return { path: w.record.path, start, end, text };
}
