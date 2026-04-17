/**
 * Logic for analyzing text and calculating Word-style Readability Statistics.
 */

function countSyllables(word) {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

/**
 * Basic passive voice detection using "to be" verbs + past participles.
 * Note: This is a heuristic and not 100% accurate.
 */
function isPassive(sentence) {
  const passiveRegex = /\b(am|is|are|was|were|be|been|being)\b\s+([a-z]+ed|born|broken|brought|built|chosen|come|done|drawn|driven|eaten|fallen|felt|found|given|gone|grown|held|kept|known|left|let|made|meant|met|paid|put|read|said|seen|sent|set|shown|sat|slept|spoken|spent|stood|taken|taught|told|thought|understood|won|written)\b/i;
  return passiveRegex.test(sentence);
}

function getReadabilityStats() {
  const doc = DocumentApp.getActiveDocument();
  const text = doc.getBody().getText();

  if (!text || text.trim().length === 0) {
    return {
      gradeLevel: "0.0",
      readingEase: "0.0",
      wordCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      charCount: 0,
      avgSentPerPara: "0.0",
      avgWordsPerSent: "0.0",
      avgCharsPerWord: "0.0",
      passivePercentage: "0%"
    };
  }

  // Counts
  const words = text.match(/\b\w+\b/g) || [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  const charCount = text.length;

  let syllableCount = 0;
  words.forEach(word => {
    syllableCount += countSyllables(word);
  });

  const wordCount = words.length;
  const sentenceCount = sentences.length;
  const paragraphCount = paragraphs.length;

  // Passive Voice detection
  let passiveCount = 0;
  sentences.forEach(s => {
    if (isPassive(s)) passiveCount++;
  });

  if (wordCount === 0 || sentenceCount === 0) {
    return {
      gradeLevel: "0.0",
      readingEase: "0.0",
      wordCount,
      sentenceCount,
      paragraphCount,
      charCount,
      avgSentPerPara: "0.0",
      avgWordsPerSent: "0.0",
      avgCharsPerWord: "0.0",
      passivePercentage: "0%"
    };
  }

  // Averages
  const avgSentPerPara = (sentenceCount / paragraphCount).toFixed(1);
  const avgWordsPerSent = (wordCount / sentenceCount).toFixed(1);
  const avgCharsPerWord = (charCount / wordCount).toFixed(1);
  const passivePercentage = ((passiveCount / sentenceCount) * 100).toFixed(0) + "%";

  // Flesch Reading Ease
  // 206.835 - 1.015 * (total words / total sentences) - 84.6 * (total syllables / total words)
  const readingEase = 206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * (syllableCount / wordCount));

  // Flesch-Kincaid Grade Level
  const gradeLevel = (0.39 * (wordCount / sentenceCount)) + (11.8 * (syllableCount / wordCount)) - 15.59;

  return {
    gradeLevel: gradeLevel.toFixed(1),
    readingEase: readingEase.toFixed(1),
    wordCount,
    sentenceCount,
    paragraphCount,
    charCount,
    avgSentPerPara,
    avgWordsPerSent,
    avgCharsPerWord,
    passivePercentage
  };
}
