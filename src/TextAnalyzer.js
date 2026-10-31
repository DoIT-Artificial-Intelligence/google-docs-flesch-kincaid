/**
 * Pure text analysis: sentence splitting, syllable counting, readability
 * formulas, and style checks (hard sentences, adverbs, passive voice,
 * qualifiers, complex words, wordy phrases, long paragraphs, repeated words).
 *
 * No Apps Script services are used here, so the same file runs in Node for
 * tests (see tests/analyzer.test.js).
 */

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

const WORD_RE = /[A-Za-z0-9\u00C0-\u024F]+(?:['\u2019][A-Za-z\u00C0-\u024F]+)*(?:-[A-Za-z0-9\u00C0-\u024F]+(?:['\u2019][A-Za-z]+)*)*/g;

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'ft', 'vs', 'etc',
  'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'assn', 'bros', 'gen', 'gov',
  'sen', 'rep', 'rev', 'hon', 'capt', 'col', 'lt', 'sgt', 'cmdr', 'adm',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct',
  'nov', 'dec', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri',
  'sat', 'sun', 'no', 'nos', 'vol', 'vols', 'fig', 'figs', 'p', 'pp', 'ch',
  'sec', 'approx', 'est', 'al', 'cf', 'ave', 'blvd', 'rd', 'hwy', 'apt',
  'ste', 'md', 'u.s', 'e.g', 'i.e', 'a.m', 'p.m', 'ph.d', 'u.k', 'd.c'
]);

/**
 * Splits one paragraph into sentences. Returns [{start, end}] offsets into
 * `text` (end exclusive), trimmed of surrounding whitespace.
 */
function splitSentences(text) {
  const out = [];
  const enders = /[.!?\u2026]+["'\u201D\u2019)\]]*(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = enders.exec(text)) !== null) {
    const endPos = m.index + m[0].length;
    if (m[0][0] === '.' && m[0].replace(/["'\u201D\u2019)\]]+$/, '') === '.') {
      // Single period: skip abbreviations, initials, and lowercase continuations.
      const before = text.slice(start, m.index);
      const prev = (before.match(/([A-Za-z.]+)$/) || [])[1] || '';
      const prevLower = prev.toLowerCase();
      const next = text.slice(endPos).match(/^\s*(\S)/);
      const nextChar = next ? next[1] : '';
      if (ABBREVIATIONS.has(prevLower) || /^[A-Z]$/.test(prev) || /\.[a-z]$/i.test(prev)) {
        if (!nextChar || !/[A-Z"\u201C]/.test(nextChar) || /^[A-Z]$/.test(prev) || prevLower === 'u.s') {
          continue;
        }
        // Abbreviations such as "etc." can still end a sentence.
        if (!['etc', 'inc', 'ltd', 'co', 'corp', 'al'].includes(prevLower)) continue;
      }
      if (nextChar && /[a-z]/.test(nextChar)) continue;
    }
    pushSentence(text, start, endPos, out);
    start = endPos;
  }
  pushSentence(text, start, text.length, out);
  return out;
}

function pushSentence(text, start, end, out) {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (end > start && /[A-Za-z0-9\u00C0-\u024F]/.test(text.slice(start, end))) {
    out.push({ start, end });
  }
}

/** Returns [{word, start, end}] for each word in `text`. */
function tokenizeWords(text) {
  const out = [];
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function countLetters(word) {
  return word.replace(/[^A-Za-z0-9\u00C0-\u024F]/g, '').length;
}

// ---------------------------------------------------------------------------
// Syllables
// ---------------------------------------------------------------------------

const SYLLABLE_EXCEPTIONS = {
  any: 2, many: 2, ago: 2, beyond: 2, somebody: 3, anybody: 4, nobody: 3,
  entire: 3, january: 4, february: 4, european: 4, association: 5,
  associated: 5, realize: 3, influence: 3, senior: 2, marriage: 2,
  awesome: 2, football: 2, overall: 3, earlier: 3, league: 1, george: 1,
  centre: 2, louis: 2, william: 2, ok: 2, tv: 2, mr: 2, mrs: 2, etc: 4,
  vs: 2, usa: 3, uk: 2, safety: 2, idle: 2, smile: 1, while: 1,
  the: 1, every: 3, everything: 3, everyone: 3, everybody: 4, business: 2,
  businesses: 3, different: 3, evening: 2, family: 3, families: 3, interest: 3,
  interesting: 4, several: 3, average: 3, beautiful: 3, chocolate: 3,
  camera: 3, area: 3, areas: 3, idea: 3, ideas: 3, real: 1, really: 2,
  people: 2, create: 2, created: 3, creates: 2, creating: 3, creation: 3,
  science: 2, quiet: 2, poem: 2, poet: 2, being: 2, doing: 2, going: 2,
  seeing: 2, video: 3, radio: 3, piano: 3, period: 3, serious: 3, various: 3,
  experience: 4, experienced: 4, union: 2, million: 2, billion: 2,
  ocean: 2, special: 2, social: 2, official: 3, financial: 3, initial: 3,
  vehicle: 3, vehicles: 3, naive: 2, maybe: 2, someone: 2, something: 2,
  sometimes: 2, somewhere: 2, anyone: 3, everywhere: 3, whatever: 3,
  however: 3, therefore: 2, likely: 2, lively: 2, lovely: 2, safely: 2,
  completely: 3, immediately: 5, extremely: 3, management: 3, statement: 2,
  movement: 2, require: 3, required: 3, requires: 3, fire: 1, hire: 1,
  higher: 2, ion: 2, lion: 2, via: 2, diet: 2, client: 2, clients: 2, society: 4, variety: 4, anxiety: 4, deity: 3, reality: 4,
  ideal: 3, theater: 3, theatre: 3, museum: 3, react: 2,
  reactions: 3, cooperate: 4, coordinate: 4, preexisting: 4, reenter: 3,
  employee: 3, employees: 3, guarantee: 3, agreed: 2, used: 1, sure: 1,
  whole: 1, whose: 1, toward: 2, towards: 2, our: 1, hour: 1, hours: 1,
  flour: 1, flower: 2, power: 2, naturally: 4, actually: 4,
  usually: 4, especially: 4, generally: 4, probably: 3, literally: 4,
  basically: 3, simile: 3, recipe: 3, apostrophe: 4, epitome: 4, cafe: 2,
  resume: 3, forever: 3, wednesday: 2, colonel: 2, choir: 1, aisle: 1,
  island: 2, queue: 1, rhythm: 2, rhythms: 2, prism: 2, schism: 2,
  organism: 4, mechanism: 4, tourism: 3, criticism: 4, journalism: 4,
  realism: 4, capitalism: 5, sarcasm: 3, enthusiasm: 5, spasm: 2, chasm: 2
};

/** Estimates the number of syllables in an English word. */
function countSyllables(word) {
  if (word.indexOf('-') !== -1) {
    return word.split('-').reduce((n, part) => n + (part ? countSyllables(part) : 0), 0);
  }
  let w = word.toLowerCase().replace(/['\u2019]s$/, '').replace(/[^a-z]/g, '');
  if (!w) return /\d/.test(word) ? 1 : 0;
  if (SYLLABLE_EXCEPTIONS[w]) return SYLLABLE_EXCEPTIONS[w];
  if (w.length <= 3) return 1;

  let n = 0;
  if (/[^aeiouy]les$/.test(w)) n++;           // "tables": -les is its own syllable
  if (/[^aeiouyl]e(?:ly|ment|ments|ful|ness|less)$/.test(w)) n--; // "safely", "statement"
  if (/[dsz]nt$/.test(w) && /n['\u2019]t$/.test(word)) n++;         // "doesn't", "couldn't"
  if (/[^aeiouy]ire[ds]?$/.test(w) || /[^aeiouy]ire(?:ment|ly)$/.test(w)) n++; // "tired", "desire"
  if (/ically$/.test(w)) n--;                 // "automatically"
  if (/^some[^aeiouy]/.test(w)) n--;          // "somehow"
  if (/(?:[^aeiouy]|[aeiou]y)ed$/.test(w) && !/[td]ed$/.test(w)) {
    w = w.slice(0, -2);                       // "jumped": silent -ed
  } else if (/[^aeiouy]es$/.test(w) && !/(?:[sxzcg]|ch|sh)es$/.test(w)) {
    w = w.slice(0, -2);                       // "makes": silent -es
  } else if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) {
    w = w.slice(0, -1);                       // "make": silent -e (keep "table")
  }
  w = w.replace(/^y/, '').replace(/([aeiou])y(?=[aeiou])/g, '$1_'); // "player": y is a consonant
  n += (w.match(/[aeiouy]+/g) || []).length;
  // Vowel pairs that are usually split across two syllables.
  const splits = w.match(/(?:[^aeiou]yi|[^cgst]ia|[^cgstx]io(?!n)|[^qg]ua(?!y|r)|eo|ii|uo|[aeiou]ing$)/g);
  if (splits) n += splits.length;
  if (/[^aeiou]isms?$/.test(w)) n++;          // "realism"
  return Math.max(1, n);
}

// ---------------------------------------------------------------------------
// Style dictionaries
// ---------------------------------------------------------------------------

/**
 * Words and phrases with plainer alternatives (plainlanguage.gov and the
 * Federal Plain Language Guidelines). Value is a list of suggestions; the
 * first suggestion is used for one-click replace. An empty string means
 * "omit it".
 */
const SIMPLER_WORDS = buildSimplerWords();

function buildSimplerWords() {
  const map = {};
  const add = (k, v) => { map[k] = Array.isArray(v) ? v : [v]; };
  // Regular verbs: [complex, plain, plainForms?]
  const verbs = [
    ['utilize', 'use'], ['facilitate', 'help'], ['commence', 'start'],
    ['terminate', 'end'], ['endeavor', 'try'], ['ascertain', 'find out'],
    ['demonstrate', 'show'], ['indicate', 'show'], ['initiate', 'start'],
    ['purchase', 'buy'], ['assist', 'help'], ['attempt', 'try'],
    ['obtain', 'get', ['gets', 'got', 'getting']], ['acquire', 'get', ['gets', 'got', 'getting']],
    ['procure', 'get', ['gets', 'got', 'getting']], ['require', 'need'],
    ['request', 'ask'], ['inquire', 'ask'], ['transmit', 'send', ['sends', 'sent', 'sending']],
    ['forward', 'send', ['sends', 'sent', 'sending']], ['notify', 'tell', ['tells', 'told', 'telling']],
    ['inform', 'tell', ['tells', 'told', 'telling']], ['advise', 'tell', ['tells', 'told', 'telling']],
    ['comprise', 'include'], ['constitute', 'make up', ['makes up', 'made up', 'making up']],
    ['implement', 'carry out', ['carries out', 'carried out', 'carrying out']],
    ['accomplish', 'do', ['does', 'did', 'doing']], ['perform', 'do', ['does', 'did', 'doing']],
    ['ameliorate', 'improve'], ['optimize', 'improve'], ['leverage', 'use'],
    ['modify', 'change'], ['alter', 'change'], ['determine', 'decide'],
    ['eliminate', 'cut'], ['expedite', 'speed up'], ['disseminate', 'share'],
    ['allocate', 'divide'], ['anticipate', 'expect'], ['apprise', 'tell'],
    ['concur', 'agree'], ['consolidate', 'combine'], ['designate', 'name'],
    ['enumerate', 'list'], ['evidence', 'show'], ['finalize', 'finish'],
    ['identify', 'find'], ['necessitate', 'require'], ['participate', 'take part'],
    ['possess', 'have', ['has', 'had', 'having']], ['provide', 'give', ['gives', 'gave', 'giving']],
    ['reside', 'live'], ['remunerate', 'pay'], ['retain', 'keep', ['keeps', 'kept', 'keeping']],
    ['submit', 'send', ['sends', 'sent', 'sending']], ['supplement', 'add to'],
    ['validate', 'confirm'], ['observe', 'see', ['sees', 'saw', 'seeing']],
    ['locate', 'find', ['finds', 'found', 'finding']], ['initiate', 'begin'],
    ['permit', 'let', ['lets', 'let', 'letting']], ['prioritize', 'rank'],
    ['ensure', 'make sure', ['makes sure', 'made sure', 'making sure']],
    ['delineate', 'describe'], ['elucidate', 'explain'], ['emphasize', 'stress'],
    ['encounter', 'meet', ['meets', 'met', 'meeting']], ['establish', 'set up', ['sets up', 'set up', 'setting up']],
    ['exhibit', 'show'], ['incentivize', 'encourage'], ['operationalize', 'start'],
    ['reimburse', 'repay'], ['relocate', 'move'], ['solicit', 'ask for'],
    ['substantiate', 'prove'], ['indicate', 'show']
  ];
  verbs.forEach(([verb, plain, plainForms]) => {
    const vf = verbForms(verb);
    const pf = plainForms ? [plain].concat(plainForms) : verbForms(plain);
    vf.forEach((form, i) => { if (!map[form]) add(form, pf[i]); });
  });

  const nouns = {
    utilization: 'use', methodology: 'method', functionality: 'feature',
    assistance: 'help', commencement: 'start', termination: 'end',
    remuneration: 'pay', modification: 'change', modifications: 'changes',
    objective: 'goal', objectives: 'goals', component: 'part', components: 'parts',
    proficiency: 'skill', requirement: 'need', requirements: 'needs',
    expenditure: 'cost', expenditures: 'costs', notification: 'notice',
    implementation: 'carrying out', documentation: 'documents', compensation: 'pay',
    correspondence: 'letter', vicinity: 'area', inception: 'start',
    alternatively: 'or', consequently: 'so', subsequently: 'later',
    additionally: 'also', furthermore: 'also', moreover: 'also',
    nevertheless: 'still', notwithstanding: 'despite', heretofore: 'until now',
    henceforth: 'from now on', therein: 'there', thereof: 'of it',
    herein: 'here', hereby: '', aforementioned: 'this', aforesaid: 'this',
    approximately: 'about', numerous: 'many', sufficient: 'enough',
    insufficient: 'not enough', adequate: 'enough', additional: 'more',
    principal: 'main', primary: 'main', initial: 'first', optimal: 'best',
    optimum: 'best', prior: 'earlier', subsequent: 'later', equitable: 'fair',
    advantageous: 'helpful', beneficial: 'helpful', cognizant: 'aware',
    commensurate: 'equal', comparable: 'similar', competency: 'skill',
    discontinue: 'stop', erroneous: 'wrong', feasible: 'possible',
    impacted: 'affected', inadvertently: 'by mistake', magnitude: 'size',
    multiple: 'many', nominal: 'small', parameters: 'limits',
    preclude: 'prevent', proximity: 'nearness', remainder: 'rest',
    timely: 'prompt', transpire: 'happen', viable: 'workable',
    whereas: 'but', whilst: 'while', amongst: 'among', amidst: 'amid',
    accordingly: 'so', accompany: 'go with', accumulate: 'gather',
    accurate: 'correct', aggregate: 'total', anticipated: 'expected',
    apparent: 'clear', appreciable: 'many', appropriate: 'right',
    ascertained: 'found', authorize: 'allow', capability: 'ability',
    caveat: 'warning', cease: 'stop',
    concerning: 'about', regarding: 'about', pertaining: 'about',
    demonstrable: 'clear', equivalent: 'equal', evident: 'clear',
    explicit: 'plain', facilitated: 'helped', immediately: 'now',
    individual: 'person', individuals: 'people', inquiry: 'question',
    intimate: 'close', likewise: 'also', maximum: 'most', minimum: 'least',
    obligate: 'bind', obligated: 'required', operate: 'run', portion: 'part',
    practicable: 'practical', preceding: 'previous',
    previously: 'before', proficient: 'skilled', promulgate: 'issue',
    pursuant: 'under', reflect: 'show', relative: 'about', remain: 'stay',
    selection: 'choice', solely: 'only', successfully: '', sustain: 'keep',
    therefore: 'so', thus: 'so', ultimately: 'finally', unavailability: 'lack',
    visualize: 'see', whether: 'if'
  };
  Object.keys(nouns).forEach(k => { if (!map[k]) add(k, nouns[k]); });
  // "whether" and "reflect" are too noisy to flag on their own.
  delete map.whether; delete map.reflect; delete map.operate; delete map.remain;
  delete map.individual; delete map.selection; delete map.relative; delete map.intimate;
  delete map.primary; delete map.initial; delete map.immediately;
  delete map.accurate; delete map.appropriate; delete map.therefore; delete map.thus;
  return map;
}

/** Wordy phrases and their concise replacements. */
const WORDY_PHRASES = {
  'in order to': 'to', 'in order for': 'for', 'due to the fact that': 'because',
  'owing to the fact that': 'because', 'in light of the fact that': 'because',
  'in view of the fact that': 'because', 'on the grounds that': 'because',
  'for the reason that': 'because', 'despite the fact that': 'although',
  'regardless of the fact that': 'although', 'in spite of the fact that': 'although',
  'at this point in time': 'now', 'at the present time': 'now',
  'at this time': 'now', 'at the present': 'now', 'in the near future': 'soon',
  'at an early date': 'soon', 'in the event that': 'if', 'in the event of': 'if',
  'on the condition that': 'if', 'with the exception of': 'except',
  'a large number of': 'many', 'a great number of': 'many',
  'a significant number of': 'many', 'a majority of': 'most',
  'the majority of': 'most', 'a small number of': 'a few',
  'a number of': 'some', 'each and every': 'each', 'first and foremost': 'first',
  'is able to': 'can', 'are able to': 'can', 'has the ability to': 'can',
  'have the ability to': 'can', 'has the capacity to': 'can',
  'is in a position to': 'can', 'it is necessary that': 'must',
  'it is important that': 'must', 'it is essential that': 'must',
  'with regard to': 'about', 'with respect to': 'about', 'in regard to': 'about',
  'in relation to': 'about', 'in reference to': 'about', 'with reference to': 'about',
  'in connection with': 'about', 'on the subject of': 'about', 'as regards': 'about',
  'in terms of': 'in', 'on the part of': 'by', 'by means of': 'by',
  'by virtue of': 'by', 'in accordance with': 'under', 'pursuant to': 'under',
  'in compliance with': 'under', 'for the purpose of': 'to',
  'with the purpose of': 'to', 'with a view to': 'to', 'so as to': 'to',
  'in an effort to': 'to', 'prior to': 'before', 'subsequent to': 'after',
  'in advance of': 'before', 'until such time as': 'until',
  'during the course of': 'during', 'in the course of': 'during',
  'for the duration of': 'during', 'throughout the duration of': 'during',
  'in close proximity to': 'near', 'in the vicinity of': 'near',
  'in the amount of': 'for', 'in excess of': 'more than', 'a total of': '',
  'make a decision': 'decide', 'made a decision': 'decided',
  'make a determination': 'decide', 'reach a conclusion': 'conclude',
  'give consideration to': 'consider', 'take into consideration': 'consider',
  'take into account': 'consider', 'conduct an investigation': 'investigate',
  'conduct a review': 'review', 'perform an analysis': 'analyze',
  'provide assistance': 'help', 'provide information': 'tell',
  'make an attempt': 'try', 'make reference to': 'refer to',
  'make a recommendation': 'recommend', 'is applicable to': 'applies to',
  'are applicable to': 'apply to', 'is dependent upon': 'depends on',
  'is dependent on': 'depends on', 'are dependent on': 'depend on',
  'in the absence of': 'without', 'as a means of': 'to',
  'it should be noted that': '', 'it is worth noting that': '',
  'it is important to note that': '', 'please be advised that': '',
  'needless to say': '', 'the fact that': 'that', 'as a matter of fact': 'in fact',
  'at all times': 'always', 'on a daily basis': 'daily',
  'on a weekly basis': 'weekly', 'on a monthly basis': 'monthly',
  'on a regular basis': 'regularly', 'on an annual basis': 'yearly',
  'on a yearly basis': 'yearly', 'until and unless': 'unless',
  'whether or not': 'whether', 'basic fundamentals': 'fundamentals',
  'end result': 'result', 'final outcome': 'outcome', 'past history': 'history',
  'future plans': 'plans', 'advance planning': 'planning', 'close proximity': 'near',
  'completely eliminate': 'eliminate', 'absolutely essential': 'essential',
  'brief summary': 'summary', 'join together': 'join', 'combine together': 'combine',
  'refer back': 'refer', 'revert back': 'revert', 'repeat again': 'repeat',
  'new innovation': 'innovation', 'free gift': 'gift', 'added bonus': 'bonus',
  'unexpected surprise': 'surprise', 'true facts': 'facts', 'personal opinion': 'opinion',
  'ask the question': 'ask', 'as to whether': 'whether', 'in a timely manner': 'promptly',
  'at a later date': 'later', 'have a tendency to': 'tend to', 'has a tendency to': 'tends to',
  'in the process of': '', 'along the lines of': 'like', 'for all intents and purposes': '',
  'in a manner similar to': 'like', 'is indicative of': 'shows',
  'at your earliest convenience': 'soon', 'at the earliest possible date': 'soon',
  'as soon as possible': 'soon', 'in the amount of': 'for', 'it is requested that': 'please',
  'feel free to': '', 'do not hesitate to': '', 'enclosed please find': 'enclosed is',
  'is required to': 'must', 'are required to': 'must', 'is requested to': 'should',
  'are requested to': 'should', 'it is recommended that': 'we recommend'
};

/** Hedging words and phrases that weaken writing. */
const QUALIFIERS = [
  'i believe', 'i consider', "i don't believe", "i don't consider", "i don't feel",
  "i don't suggest", "i don't think", 'i feel', 'i hope to', 'i might', 'i suggest',
  'i think', 'i was wondering', 'i will try', 'i wonder', 'in my opinion',
  'is kind of', 'is sort of', 'kind of', 'sort of', 'just', 'maybe', 'perhaps',
  'possibly', 'we believe', 'we consider', "we don't believe", "we don't consider",
  "we don't feel", "we don't suggest", "we don't think", 'we feel', 'we hope to',
  'we might', 'we suggest', 'we think', 'we were wondering', 'we will try',
  'we wonder', 'very', 'really', 'quite', 'somewhat', 'rather', 'fairly',
  'basically', 'actually', 'literally', 'a bit', 'a little bit', 'it seems',
  'it appears', 'seems to', 'tend to', 'in some ways', 'more or less'
];

/** Words ending in -ly that are not adverbs (or are rarely weak adverbs). */
const NOT_ADVERBS = new Set([
  'ally', 'anomaly', 'apply', 'assembly', 'belly', 'bully', 'butterfly', 'chilly',
  'comply', 'costly', 'cuddly', 'curly', 'daily', 'dolly', 'early', 'elderly',
  'family', 'fly', 'friendly', 'gully', 'hilly', 'holly', 'holy', 'homely',
  'imply', 'italy', 'jelly', 'jolly', 'july', 'lily', 'lively', 'lonely',
  'lovely', 'lowly', 'likely', 'manly', 'monopoly', 'monthly', 'multiply',
  'oily', 'only', 'orderly', 'reply', 'rely', 'sally', 'silly', 'sly', 'smelly',
  'supply', 'tally', 'timely', 'ugly', 'unlikely', 'weekly', 'wily', 'woolly',
  'yearly', 'hourly', 'quarterly', 'kelly', 'emily', 'billy', 'molly', 'polly',
  'reilly', 'beverly', 'kimberly', 'shelly', 'ely', 'dally', 'rally', 'jelly',
  'firefly', 'dragonfly', 'gadfly', 'housefly', 'deadly', 'ghastly', 'ghostly',
  'godly', 'heavenly', 'kindly', 'leisurely', 'measly', 'motherly', 'fatherly',
  'brotherly', 'sisterly', 'neighborly', 'scholarly', 'stately', 'surly',
  'unruly', 'burly', 'courtly', 'cowardly', 'worldly', 'wobbly', 'bubbly',
  'prickly', 'grizzly', 'gnarly', 'pearly', 'sickly', 'squiggly', 'wrinkly',
  'underbelly', 'potbelly', 'anomaly', 'homily', 'doily', 'filly', 'folly',
  'gully', 'melancholy', 'panoply', 'rely', 'resupply', 'misapply', 'sully',
  'tully', 'wally', 'willy', 'sully', 'nelly', 'ally', 'bodily', 'nightly',
  'biweekly', 'bimonthly', 'semiannually', 'annually', 'apply'
]);

const IRREGULAR_PARTICIPLES = [
  'arisen', 'awoken', 'beaten', 'become', 'begun', 'bent', 'bet', 'bid', 'bitten',
  'blown', 'born', 'borne', 'bought', 'bound', 'bred', 'broken', 'brought', 'built',
  'burnt', 'burst', 'cast', 'caught', 'chosen', 'clung', 'come', 'cost', 'crept',
  'cut', 'dealt', 'dug', 'done', 'drawn', 'dreamt', 'driven', 'drunk', 'dwelt',
  'eaten', 'fallen', 'fed', 'felt', 'fought', 'found', 'fled', 'flung', 'flown',
  'forbidden', 'forecast', 'forgotten', 'forgiven', 'forsaken', 'frozen', 'given',
  'gone', 'ground', 'grown', 'hung', 'heard', 'hidden', 'hit', 'held', 'hurt',
  'kept', 'knelt', 'knit', 'known', 'laid', 'led', 'leapt', 'learnt', 'left',
  'lent', 'let', 'lain', 'lit', 'lost', 'made', 'meant', 'met', 'mistaken',
  'overcome', 'overdone', 'overtaken', 'overthrown', 'paid', 'proven', 'put',
  'quit', 'read', 'rid', 'ridden', 'rung', 'risen', 'run', 'said', 'seen',
  'sought', 'sold', 'sent', 'set', 'sewn', 'shaken', 'shaven', 'shorn', 'shed',
  'shone', 'shod', 'shot', 'shown', 'shrunk', 'shut', 'sung', 'sunk', 'sat',
  'slain', 'slept', 'slid', 'slung', 'slit', 'smelt', 'sown', 'spoken', 'sped',
  'spent', 'spilt', 'spun', 'spit', 'split', 'spread', 'sprung', 'stood',
  'stolen', 'stuck', 'stung', 'stunk', 'stridden', 'struck', 'strung', 'striven',
  'sworn', 'swept', 'swollen', 'swum', 'swung', 'taken', 'taught', 'torn',
  'told', 'thought', 'thrived', 'thrown', 'thrust', 'trodden', 'understood',
  'undergone', 'undertaken', 'upset', 'woken', 'worn', 'woven', 'wed', 'wept',
  'won', 'wound', 'withdrawn', 'withheld', 'withstood', 'wrung', 'written'
];
const NOT_PARTICIPLES = new Set([
  'bed', 'red', 'shed', 'need', 'seed', 'feed', 'speed', 'breed', 'greed',
  'weed', 'deed', 'heed', 'reed', 'steed', 'creed', 'indeed', 'exceed', 'proceed',
  'succeed', 'hundred', 'sled', 'naked', 'wicked', 'sacred', 'rugged',
  'ragged', 'jagged', 'beloved', 'crooked', 'wretched', 'kindred', 'hatred',
  'embed', 'infrared', 'biped', 'moped', 'shred',
]);
const BE_VERBS = 'am|are|aren\'t|is|isn\'t|was|wasn\'t|were|weren\'t|be|been|being';
const PASSIVE_RE = new RegExp(
  "(?:\\b(?:has|have|had|will|would|shall|should|can|could|may|might|must)(?:\\s+(?:not|never|always|also|[a-z]+ly))?\\s+)?" +
  "\\b(?:" + BE_VERBS + ")\\b(?:\\s+(?:not|never|also|often|always|still|already|being|been|[a-z]+ly))*\\s+" +
  "([a-z]+ed|" + IRREGULAR_PARTICIPLES.join('|') + ")\\b", 'gi');

function phraseRegex(phrases) {
  const sorted = phrases.slice().sort((a, b) => b.length - a.length)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['\u2019]").replace(/ /g, '\\s+'));
  return new RegExp('\\b(?:' + sorted.join('|') + ')\\b', 'gi');
}

const SIMPLER_RE = phraseRegex(Object.keys(SIMPLER_WORDS));
const WORDY_RE = phraseRegex(Object.keys(WORDY_PHRASES));
const QUALIFIER_RE = phraseRegex(QUALIFIERS);

function verbForms(verb) {
  // [base, 3rd person, past/participle, gerund]
  const parts = verb.split(' ');
  const head = parts[0];
  const rest = parts.length > 1 ? ' ' + parts.slice(1).join(' ') : '';
  let s, d, ing;
  if (/[^aeiou]y$/.test(head)) {
    s = head.slice(0, -1) + 'ies'; d = head.slice(0, -1) + 'ied'; ing = head + 'ing';
  } else if (/e$/.test(head)) {
    s = head + 's'; d = head + 'd'; ing = head.slice(0, -1) + 'ing';
  } else if (/(?:s|x|z|ch|sh)$/.test(head)) {
    s = head + 'es'; d = head + 'ed'; ing = head + 'ing';
  } else if (/(?:^|[^aeiou])[aeiou][bdgmnprt]$/.test(head) && /(?:mit|cur|fer|pel|bmit|mit)$/.test(head)) {
    s = head + 's'; d = head + head.slice(-1) + 'ed'; ing = head + head.slice(-1) + 'ing';
  } else {
    s = head + 's'; d = head + 'ed'; ing = head + 'ing';
  }
  return [verb, s + rest, d + rest, ing + rest];
}

function matchCase(original, replacement) {
  if (!replacement) return replacement;
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (/^[A-Z]/.test(original)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

// ---------------------------------------------------------------------------
// Readability formulas
// ---------------------------------------------------------------------------

/** Automated Readability Index, the formula behind Hemingway's grade. */
function ariGrade(letters, words, sentences) {
  if (!words || !sentences) return 0;
  return 4.71 * (letters / words) + 0.5 * (words / sentences) - 21.43;
}

function computeScores(t) {
  const { words, sentences, syllables, letters, polysyllables, complexWords } = t;
  if (!words || !sentences) {
    return { fleschKincaid: 0, readingEase: 0, ari: 0, gunningFog: 0, smog: 0, colemanLiau: 0, consensus: 0 };
  }
  const wps = words / sentences;
  const spw = syllables / words;
  const fleschKincaid = 0.39 * wps + 11.8 * spw - 15.59;
  const readingEase = 206.835 - 1.015 * wps - 84.6 * spw;
  const ari = ariGrade(letters, words, sentences);
  const gunningFog = 0.4 * (wps + 100 * (complexWords / words));
  const smog = 1.043 * Math.sqrt(polysyllables * (30 / sentences)) + 3.1291;
  const L = (letters / words) * 100;
  const S = (sentences / words) * 100;
  const colemanLiau = 0.0588 * L - 0.296 * S - 15.8;
  const grades = [fleschKincaid, ari, gunningFog, smog, colemanLiau];
  const consensus = grades.reduce((a, b) => a + b, 0) / grades.length;
  return { fleschKincaid, readingEase, ari, gunningFog, smog, colemanLiau, consensus };
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

const ISSUE_TYPES = ['veryHard', 'hard', 'simpler', 'wordy', 'adverb', 'passive', 'qualifier', 'longParagraph', 'repeated'];

/**
 * Analyzes a list of paragraphs.
 *
 * @param {Array<{id:number, text:string, offset?:number, heading?:boolean}>} paragraphs
 *   `offset` shifts all reported positions (used when analyzing a selection).
 * @return {Object} totals, scores, and issues. Each issue has
 *   {type, p, start, end, text, suggestions?, grade?} with positions relative
 *   to the full paragraph text.
 */
function analyzeParagraphs(paragraphs) {
  const totals = {
    words: 0, sentences: 0, paragraphs: 0, characters: 0, charactersNoSpaces: 0,
    letters: 0, syllables: 0, polysyllables: 0, complexWords: 0
  };
  const counts = {};
  ISSUE_TYPES.forEach(t => { counts[t] = 0; });
  const issues = [];
  let passiveSentences = 0;

  paragraphs.forEach(para => {
    const text = para.text || '';
    const base = para.offset || 0;
    if (!/[A-Za-z0-9\u00C0-\u024F]/.test(text)) return;
    totals.paragraphs++;
    totals.characters += text.length;
    totals.charactersNoSpaces += text.replace(/\s/g, '').length;
    const issue = (type, start, end, extra) => {
      const o = Object.assign({ type, p: para.id, start: base + start, end: base + end, text: text.slice(start, end) }, extra || {});
      if (type !== 'hard' && type !== 'veryHard' && type !== 'longParagraph') {
        // Trim to whole words when the snippet is cut mid-paragraph.
        o.cutBefore = start > 30;
        o.cutAfter = end + 30 < text.length;
        o.before = o.cutBefore ? text.slice(start - 30, start).replace(/^\S*\s/, '') : text.slice(0, start);
        o.after = o.cutAfter ? text.slice(end, end + 30).replace(/\s\S*$/, '') : text.slice(end);
      }
      issues.push(o);
      counts[type]++;
      return o;
    };

    const sentences = splitSentences(text);
    // Heading styles are sometimes used for body text; only short headings are exempt.
    const isHeading = !!para.heading && sentences.length <= 1;
    let paraWords = 0;
    sentences.forEach(s => {
      const sText = text.slice(s.start, s.end);
      const words = tokenizeWords(sText);
      if (!words.length) return;
      totals.sentences++;
      let letters = 0;
      words.forEach(w => {
        const syl = countSyllables(w.word);
        letters += countLetters(w.word);
        totals.syllables += syl;
        if (syl >= 3) {
          totals.polysyllables++;
          // Gunning Fog excludes proper nouns, hyphenated words, and -es/-ed/-ing endings.
          if (!/^[A-Z]/.test(w.word) && w.word.indexOf('-') === -1 &&
              !(countSyllables(w.word.replace(/(?:es|ed|ing)$/i, '')) < 3)) {
            totals.complexWords++;
          }
        }
      });
      totals.words += words.length;
      totals.letters += letters;
      paraWords += words.length;

      // Hemingway-style hard sentences: 14+ words and a sentence-level ARI of 10+ (14+ is very hard).
      const grade = Math.round(ariGrade(letters, words.length, 1));
      if (!isHeading && words.length >= 14) {
        if (grade >= 14) issue('veryHard', s.start, s.end, { grade, words: words.length });
        else if (grade >= 10) issue('hard', s.start, s.end, { grade, words: words.length });
      }

      // Passive voice (count once per sentence for the percentage).
      let passiveHere = false;
      PASSIVE_RE.lastIndex = 0;
      let m;
      while ((m = PASSIVE_RE.exec(sText)) !== null) {
        const participle = m[1].toLowerCase();
        if (NOT_PARTICIPLES.has(participle) || (participle.length <= 4 && /eed$/.test(participle))) continue;
        passiveHere = true;
        issue('passive', s.start + m.index, s.start + m.index + m[0].length);
      }
      if (passiveHere) passiveSentences++;
    });

    // Word- and phrase-level checks run over the whole paragraph.
    const taken = [];
    const overlaps = (a, b) => taken.some(r => a < r[1] && b > r[0]);
    const scan = (re, cb) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const a = m.index, b = m.index + m[0].length;
        if (overlaps(a, b)) continue;
        if (cb(m, a, b) !== false) taken.push([a, b]);
      }
    };
    scan(WORDY_RE, (m, a, b) => {
      const key = m[0].toLowerCase().replace(/\s+/g, ' ').replace(/\u2019/g, "'");
      issue('wordy', a, b, { suggestions: [matchCase(m[0], WORDY_PHRASES[key])] });
    });
    scan(SIMPLER_RE, (m, a, b) => {
      const key = m[0].toLowerCase().replace(/\s+/g, ' ');
      const sugg = SIMPLER_WORDS[key];
      if (!sugg) return false;
      issue('simpler', a, b, { suggestions: sugg.map(x => matchCase(m[0], x)) });
    });
    scan(QUALIFIER_RE, (m, a, b) => {
      issue('qualifier', a, b, { suggestions: [''] });
    });
    scan(/\b[A-Za-z]{3,}ly\b/g, (m, a, b) => {
      const w = m[0].toLowerCase();
      if (NOT_ADVERBS.has(w) || /^[A-Z]/.test(m[0]) && a > 0 && !/[.!?]\s*$/.test(text.slice(0, a))) return false;
      issue('adverb', a, b);
    });
    scan(/\b([A-Za-z']+)(\s+)\1\b/gi, (m, a, b) => {
      if (/^(?:that|had|is|do|bye|ha|no|very|really)$/i.test(m[1])) return false;
      issue('repeated', a, b, { suggestions: [m[1]] });
    });

    if (!isHeading && (sentences.length > 5 || paraWords > 150)) {
      issue('longParagraph', 0, Math.min(text.length, sentences.length ? sentences[0].end : text.length),
        { sentences: sentences.length, words: paraWords });
    }
  });

  const scores = computeScores(totals);
  const stats = Object.assign({}, totals, {
    passiveSentences,
    avgWordsPerSentence: totals.sentences ? totals.words / totals.sentences : 0,
    avgSentencesPerParagraph: totals.paragraphs ? totals.sentences / totals.paragraphs : 0,
    avgSyllablesPerWord: totals.words ? totals.syllables / totals.words : 0,
    avgLettersPerWord: totals.words ? totals.letters / totals.words : 0,
    readingTimeMinutes: totals.words / 238,
    speakingTimeMinutes: totals.words / 150
  });

  const typeOrder = {};
  ISSUE_TYPES.forEach((t, i) => { typeOrder[t] = i; });
  issues.sort((a, b) => a.p - b.p || a.start - b.start || typeOrder[a.type] - typeOrder[b.type]);
  return { stats, scores, counts, issues };
}

if (typeof module !== 'undefined') {
  module.exports = {
    analyzeParagraphs, splitSentences, tokenizeWords, countSyllables, computeScores,
    ariGrade, SIMPLER_WORDS, WORDY_PHRASES, ISSUE_TYPES, verbForms, matchCase
  };
}
