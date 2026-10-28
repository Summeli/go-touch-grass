// Pure moderation logic: builds the Jev request and applies the hide policy.
// Must not use chrome.* APIs so it can be unit tested with `node --test`.

export const API_URL = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-latest';

export const DEFAULT_SETTINGS = {
  apiKey: '',
  selector: '.post',
  threshold: 0.7,
};

export const MIN_TEXT_LENGTH = 20;
export const MAX_TEXT_LENGTH = 4000;

export const QUESTIONS = {
  racist: {
    type: 'noul',
    instructions:
      'Does `post` contain racist content: demeaning, hateful or stereotyping statements about people based on race, ethnicity or national origin?',
    criteria: {
      true: 'The post attacks, demeans or promotes hatred against a racial or ethnic group',
      false: 'No racist content; neutral discussion or quoting of racism in order to criticise it is not racist',
    },
  },
  sexist: {
    type: 'noul',
    instructions:
      'Does `post` contain sexist content: demeaning, hateful or stereotyping statements about people based on sex or gender?',
    criteria: {
      true: 'The post demeans, harasses or promotes hatred against people because of their sex or gender',
      false: 'No sexist content',
    },
  },
  violent: {
    type: 'noul',
    instructions: 'Does `post` threaten, incite, or glorify violence against people?',
    criteria: {
      true: 'Threats, calls to violence, or glorification of harming people',
      false: 'No violent content; news reporting, fiction discussion or historical discussion is not violent',
    },
  },
};

export const CATEGORIES = Object.keys(QUESTIONS);

// Normalizes whitespace and truncates; returns null for text too short to judge.
export function prepareText(text) {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length < MIN_TEXT_LENGTH) return null;
  return normalized.slice(0, MAX_TEXT_LENGTH);
}

export function buildRequest(text) {
  return {
    model: MODEL,
    state: { post: text },
    questions: QUESTIONS,
  };
}

// Extracts { racist, sexist, violent } probabilities from an API response.
export function extractScores(response) {
  const answers = response?.answers;
  if (!answers) throw new Error('Response has no answers');
  const scores = {};
  for (const category of CATEGORIES) {
    const value = answers[category]?.noul;
    if (typeof value !== 'number') throw new Error(`Missing noul for "${category}"`);
    scores[category] = value;
  }
  return scores;
}

// Hide if any category reaches the threshold.
export function shouldHide(scores, threshold) {
  return CATEGORIES.some((category) => scores[category] >= threshold);
}

export function flaggedCategories(scores, threshold) {
  return CATEGORIES.filter((category) => scores[category] >= threshold);
}
