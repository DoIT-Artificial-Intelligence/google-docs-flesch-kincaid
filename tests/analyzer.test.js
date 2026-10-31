// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const a = require('../src/TextAnalyzer.js');

const analyzeText = (text, headingFirst) => a.analyzeParagraphs(
  text.split('\n').map((t, i) => ({ id: i, text: t, heading: !!headingFirst && i === 0 })));
const ofType = (r, type) => r.issues.filter(i => i.type === type).map(i => i.text);

test('splits sentences, ignoring abbreviations, initials, and decimals', () => {
  const s = 'Dr. Smith met J. R. Jones on Jan. 5 in Washington, D.C. at 3.5 p.m. today. They talked! Did it help? Yes.';
  const parts = a.splitSentences(s).map(x => s.slice(x.start, x.end));
  assert.deepStrictEqual(parts, [
    'Dr. Smith met J. R. Jones on Jan. 5 in Washington, D.C. at 3.5 p.m. today.',
    'They talked!', 'Did it help?', 'Yes.'
  ]);
});

test('a paragraph without end punctuation is its own sentence', () => {
  const r = analyzeText('A heading\nThe body text follows here.');
  assert.strictEqual(r.stats.sentences, 2);
});

test('counts syllables for common words', () => {
  const cases = { the: 1, cat: 1, table: 2, tables: 2, make: 1, makes: 1, jumped: 1, wanted: 2,
    boxes: 2, beautiful: 3, readability: 5, everyone: 3, player: 2, statement: 2, realism: 4,
    "doesn't": 2, area: 3, simple: 2, people: 2, education: 4, 'well-known': 2 };
  for (const [w, n] of Object.entries(cases)) assert.strictEqual(a.countSyllables(w), n, w);
});

test('computes Flesch-Kincaid and reading ease', () => {
  const r = analyzeText('The cat sat on the mat.');
  assert.strictEqual(r.stats.words, 6);
  assert.strictEqual(r.stats.syllables, 6);
  assert.ok(Math.abs(r.scores.fleschKincaid - (0.39 * 6 + 11.8 - 15.59)) < 1e-9);
  assert.ok(Math.abs(r.scores.readingEase - (206.835 - 1.015 * 6 - 84.6)) < 1e-9);
});

test('matches Hemingway on its own sample text', () => {
  const text = fs.readFileSync(path.join(__dirname, 'hemingway-sample.txt'), 'utf8').trim();
  const r = analyzeText(text, true);
  assert.strictEqual(r.stats.words, 180);
  assert.strictEqual(r.stats.sentences, 13);
  assert.strictEqual(Math.round(r.scores.ari), 8);
  assert.strictEqual(r.counts.veryHard, 1);
  assert.strictEqual(r.counts.hard, 1);
  assert.deepStrictEqual(ofType(r, 'simpler'), ['utilize']);
  assert.deepStrictEqual(ofType(r, 'passive'), ['are marked']);
  assert.deepStrictEqual(ofType(r, 'qualifier'), ['I believe']);
});

test('matches Hemingway on the benefits memo', () => {
  const text = fs.readFileSync(path.join(__dirname, 'test-memo.txt'), 'utf8').trim();
  const r = analyzeText(text, true);
  assert.strictEqual(r.stats.words, 156);
  assert.strictEqual(r.stats.sentences, 11);
  assert.strictEqual(Math.round(r.scores.ari), 10);
  assert.strictEqual(r.counts.veryHard, 3);
  assert.strictEqual(r.counts.hard, 1);
  // Everything Hemingway flags, plus more it misses.
  const passive = ofType(r, 'passive');
  ['were reviewed', 'are required', 'was implemented', 'are received', 'was quickly completed'].forEach(p => assert.ok(passive.includes(p), p));
  const simpler = ofType(r, 'simpler').concat(ofType(r, 'wordy')).map(x => x.toLowerCase());
  ['prior to', 'in order to', 'facilitate', 'additional', 'due to the fact that', 'reside', 'numerous', 'multiple', 'regarding']
    .forEach(w => assert.ok(simpler.includes(w), w));
  ['cognizant', 'disseminate', 'utilizes', 'the majority of'].forEach(w => assert.ok(simpler.includes(w), w));
  assert.deepStrictEqual(ofType(r, 'repeated'), ['the the']);
});

test('suggestions keep the original capitalization', () => {
  const r = analyzeText('In order to win, Utilize the tools. We will utilize them.');
  const wordy = r.issues.find(i => i.type === 'wordy');
  assert.deepStrictEqual(wordy.suggestions, ['To']);
  const simpler = r.issues.filter(i => i.type === 'simpler').map(i => i.suggestions[0]);
  assert.deepStrictEqual(simpler, ['Use', 'use']);
});

test('does not flag non-adverbs or non-passives', () => {
  const r = analyzeText('The family reply was friendly. Only the early bird is tired. We need more seed.');
  assert.deepStrictEqual(ofType(r, 'adverb'), []);
  assert.deepStrictEqual(ofType(r, 'passive'), ['is tired']);
});

test('headings are never hard sentences', () => {
  const long = 'Comprehensive Administrative Procedures Governing Intergovernmental Telecommunications Infrastructure Modernization Initiatives Statewide Implementation Considerations Overview';
  const r = analyzeText(long + '\nShort body.', true);
  assert.strictEqual(r.counts.veryHard + r.counts.hard, 0);
});

test('offsets point at the issue text, including with a paragraph offset', () => {
  const para = 'Intro. We will utilize it.';
  const r = a.analyzeParagraphs([{ id: 0, text: para.slice(7), offset: 7 }]);
  const issue = r.issues.find(i => i.type === 'simpler');
  assert.strictEqual(para.slice(issue.start, issue.end), 'utilize');
});

test('flags long paragraphs', () => {
  const r = analyzeText('One. Two. Three. Four. Five. Six.');
  assert.strictEqual(r.counts.longParagraph, 1);
});

test('empty input returns zeros', () => {
  const r = analyzeText('');
  assert.strictEqual(r.stats.words, 0);
  assert.strictEqual(r.scores.fleschKincaid, 0);
  assert.strictEqual(r.issues.length, 0);
});

test('flags acronyms used before they are defined', () => {
  const paras = [
    { id: 0, text: 'Contact MVA or MDH today. The IRS and the FBI are federal.' },
    { id: 1, text: 'The Maryland Department of Health (MDH) can help. The MVA (Motor Vehicle Administration) too.' },
    { id: 2, text: 'The Department of Labor (DOL) said DOL forms are online.' }
  ];
  const r = a.analyzeParagraphs(paras, { acronyms: true });
  assert.deepStrictEqual(ofType(r, 'acronym').sort(), ['MDH', 'MVA']);
  assert.strictEqual(a.analyzeParagraphs(paras).counts.acronym, 0); // off unless asked
});

test('suggests must for shall and you for the applicant', () => {
  const r = analyzeText('The applicant shall sign the form.');
  const s = r.issues.filter(i => i.type === 'simpler').map(i => [i.text, i.suggestions[0]]);
  assert.deepStrictEqual(s, [['The applicant', 'You'], ['shall', 'must']]);
});

test('flags long inline lists', () => {
  const r = analyzeText('You can apply by mail, by email, by phone at the main office, through the online portal, or in person at any regional office during business hours.');
  assert.strictEqual(r.counts.list, 1);
});

test('ignored issues are skipped and counted', () => {
  const text = 'We will utilize it. They utilize it too.';
  const first = analyzeText(text);
  const key = first.issues.find(i => i.type === 'simpler').key;
  const r = a.analyzeParagraphs([{ id: 0, text }], { ignored: [key] });
  assert.strictEqual(r.counts.simpler, 0);
  assert.strictEqual(r.ignoredCount, 2);
});

test('reports a grade for each heading section', () => {
  const r = a.analyzeParagraphs([
    { id: 0, text: 'Intro text is short.' },
    { id: 1, text: 'Eligibility', heading: true },
    { id: 2, text: 'Notwithstanding the aforementioned considerations, applicants must demonstrate comprehensive documentation.' },
    { id: 3, text: 'How to apply', heading: true },
    { id: 4, text: 'Fill out the form. Send it to us.' }
  ]);
  assert.deepStrictEqual(r.sections.map(x => x.title), ['', 'Eligibility', 'How to apply']);
  assert.ok(r.sections[1].fleschKincaid > r.sections[2].fleschKincaid);
  assert.strictEqual(analyzeText('No headings here.').sections.length, 0);
});
