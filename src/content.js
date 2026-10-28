// Injected on icon click. Collects post text, asks the background to moderate it,
// and collapses flagged posts behind a click-to-show placeholder.
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

  let hidden = 0;
  for (const result of results) {
    const el = byId.get(result.id);
    if (!el) continue;
    if (result.error) {
      el.removeAttribute(ATTR_STATE); // allow retry on next click
      continue;
    }
    el.setAttribute(ATTR_STATE, result.hide ? 'hidden' : 'ok');
    if (result.hide) {
      collapse(el, result.flagged);
      hidden++;
    }
  }
  console.info(`go-touch-grass: checked ${results.length} posts, hid ${hidden}`);

  function collapse(el, flagged) {
    const previousDisplay = el.style.display;
    el.style.display = 'none';

    const placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.textContent = `Hidden by go-touch-grass (${flagged.join(', ')}). Click to show.`;
    placeholder.style.cssText =
      'display:block;width:100%;margin:4px 0;padding:8px;border:1px dashed #999;' +
      'background:#f4f4f4;color:#555;font:13px sans-serif;text-align:left;cursor:pointer;';
    placeholder.addEventListener('click', () => {
      el.style.display = previousDisplay;
      placeholder.remove();
    });
    el.before(placeholder);
  }
})();
