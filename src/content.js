// Injected on icon click. Collects post text, asks the background to moderate it,
// and highlights flagged posts in red (they stay visible).
// Runs as a classic script and may be injected more than once per page.

(async () => {
  const ATTR_ID = 'data-gtg-id';
  const ATTR_STATE = 'data-gtg-state';

  const { selector } = await chrome.runtime.sendMessage({ type: 'getSelector' });
  let matches;
  try {
    matches = [...document.querySelectorAll(selector)];
  } catch (error) {
    console.error(`go-touch-grass: invalid post selector "${selector}"`, error);
    return;
  }

  // Keep only the innermost matches so nested posts aren't judged twice.
  const posts = matches.filter(
    (el) => !matches.some((other) => other !== el && el.contains(other)) && !el.hasAttribute(ATTR_STATE),
  );
  if (posts.length === 0) {
    console.info(`go-touch-grass: no new posts match "${selector}"`);
    return;
  }

  const byId = new Map();
  const payload = posts.map((el) => {
    const id = crypto.randomUUID();
    el.setAttribute(ATTR_ID, id);
    el.setAttribute(ATTR_STATE, 'pending');
    byId.set(id, el);
    return { id, text: el.innerText };
  });

  const { results } = await chrome.runtime.sendMessage({ type: 'moderate', posts: payload });

  let flaggedCount = 0;
  for (const result of results) {
    const el = byId.get(result.id);
    if (!el) continue;
    logResult(result, el);
    if (result.error) {
      el.removeAttribute(ATTR_STATE); // allow retry on next click
      continue;
    }
    el.setAttribute(ATTR_STATE, result.hide ? 'flagged' : 'ok');
    if (result.hide) {
      highlight(el, result.flagged);
      flaggedCount++;
    }
  }
  console.info(`go-touch-grass: checked ${results.length} posts, flagged ${flaggedCount}`);

  function logResult(result, el) {
    if (result.skipped) return;
    const verdict = result.error ? 'error' : result.hide ? `MODERATE (${result.flagged.join(', ')})` : 'ok';
    console.groupCollapsed(`go-touch-grass: post ${result.id} -> ${verdict}`);
    console.log('element', el);
    console.log('request', result.request);
    if (result.error) console.log('error', result.error);
    else console.log('response', result.response);
    console.groupEnd();
  }

  function highlight(el, flagged) {
    el.style.setProperty('background-color', '#fde2e2', 'important');
    el.style.setProperty('color', '#7a1010', 'important');
    el.style.setProperty('outline', '2px solid #d33', 'important');

    const label = document.createElement('div');
    label.textContent = `Flagged by go-touch-grass: ${flagged.join(', ')}`;
    label.style.cssText =
      'margin:4px 0 0;padding:2px 6px;display:inline-block;border-radius:3px;' +
      'background:#d33;color:#fff;font:bold 12px sans-serif;';
    el.before(label);
  }
})();
