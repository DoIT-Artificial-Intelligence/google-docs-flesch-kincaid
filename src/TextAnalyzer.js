/**
 * Logic for analyzing text and calculating Flesch-Kincaid stats.
 */

function countSyllables(word) {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

function getReadabilityStats() {
  const doc = DocumentApp.getActiveDocument();
  const text = doc.getBody().getText();

  if (!text || text.trim().length === 0) {
    return {
      gradeLevel: "0.0",
      wordCount: 0,
      sentenceCount: 0,
      syllableCount: 0
    };
  }

  const words = text.match(/\b\w+\b/g) || [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let syllableCount = 0;
  words.forEach(word => {
    syllableCount += countSyllables(word);
  });

  const wordCount = words.length;
  const sentenceCount = sentences.length;

  if (wordCount === 0 || sentenceCount === 0) {
    return {
      gradeLevel: "0.0",
      wordCount,
      sentenceCount,
      syllableCount
    };
  }

  // Flesch-Kincaid Grade Level Formula
  // 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
  const gradeLevel = (0.39 * (wordCount / sentenceCount)) + (11.8 * (syllableCount / wordCount)) - 15.59;

  return {
    gradeLevel: gradeLevel.toFixed(1),
    wordCount,
    sentenceCount,
    syllableCount
  };
}
