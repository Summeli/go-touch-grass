import {
  API_URL,
  DEFAULT_SETTINGS,
  buildRequest,
  extractScores,
  flaggedCategories,
  prepareText,
} from './moderation.js';

const MAX_CONCURRENT_REQUESTS = 4;

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

chrome.action.onClicked.addListener(async (tab) => {
  const { apiKey } = await getSettings();
  if (!apiKey) {
    chrome.runtime.openOptionsPage();
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content.js'],
    });
  } catch (error) {
    // Restricted pages (chrome://, Web Store) cannot be scripted.
    console.warn('go-touch-grass: cannot run on this page', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'getSelector') {
    getSettings().then(({ selector }) => sendResponse({ selector }));
    return true;
  }
  if (message?.type === 'moderate') {
    moderatePosts(message.posts)
      .then(sendResponse)
      .catch((error) => {
        console.error('go-touch-grass: moderation failed', error);
        sendResponse({ results: [] });
      });
    return true;
  }
  return false;
});

async function moderatePosts(posts) {
  const { apiKey, threshold } = await getSettings();
  const results = await mapWithConcurrency(posts, MAX_CONCURRENT_REQUESTS, async ({ id, text }) => {
    const prepared = prepareText(text);
    if (!prepared) return { id, hide: false, skipped: true };
    const request = buildRequest(prepared);
    try {
      const response = await judge(request, apiKey);
      const scores = extractScores(response);
      const flagged = flaggedCategories(scores, threshold);
      return { id, hide: flagged.length > 0, flagged, scores, request, response };
    } catch (error) {
      // Never hide a post because a call failed.
      console.error(`go-touch-grass: post ${id} not moderated`, error);
      return { id, hide: false, error: String(error.message ?? error), request };
    }
  });
  return { results };
}

async function judge(request, apiKey) {
  console.log('go-touch-grass: request', request);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.log(`go-touch-grass: response ${response.status}`, body);
    throw new Error(`TypeSafe API ${response.status}: ${body.slice(0, 200)}`);
  }
  const json = await response.json();
  console.log('go-touch-grass: response', json);
  return json;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
