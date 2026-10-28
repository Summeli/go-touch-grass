# go-touch-grass

A demo Chrome extension that moderates forum posts with [TypeSafe](https://typesafe.ai)'s **Jev** model.
Click the extension icon and every post on the page is checked for **racist**, **sexist** or **violent**
content. Flagged posts get a thick red border.

It was built as a quick demo and tried on [Ylilauta](https://ylilauta.org), a Finnish discussion board.
It works on any forum once you give it a CSS selector for the post text.

> This is a demo, not a production moderation tool. See [Limitations](#limitations).

## How it works

1. Clicking the icon injects a content script into the current tab.
2. The script finds every element matching the post selector (default `.message`, which is Ylilauta's
   post body) and sends the text of each post to the extension's background service worker.
3. The service worker calls the TypeSafe API once per post (up to 4 calls at a time). Each call asks
   Jev three yes/no questions, one per category: racist, sexist and violent.
4. Jev answers each question with a probability (0–1). If any category is at or above the threshold
   (default `0.7`), the post gets a **10px red border**. Posts are never hidden or changed otherwise.
5. Every request and response is logged in the page's DevTools console, grouped per post, so you can
   see why a post was or wasn't flagged.

If an API call fails, the post is left untouched and is retried the next time you click the icon.

## Setup

You need Chrome and a TypeSafe API key.

1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the repo folder.
3. Right-click the extension icon and choose **Options**. Enter:
   - **TypeSafe API key**
   - **Post selector**: `.message` for Ylilauta. For other forums, see below.
   - **Flag threshold**: `0.7` is a reasonable start. Lower it to flag more, raise it to flag less.
4. Open a forum page and click the extension icon.

After you change the code, click reload on the extension card and refresh the page.

### Finding the post selector for another forum

Right-click a post's text and choose **Inspect**. Find the element that wraps only the message text, not
the author or date, and note its class. Check it in the DevTools console:

```js
document.querySelectorAll('.your-class').length   // should equal the number of posts
```

Remember the leading dot: `.message` matches a class, while `message` matches a `<message>` tag.

## Project layout

```
manifest.json         Chrome extension manifest (MV3)
src/background.js     Service worker: icon click, TypeSafe API calls, logging
src/content.js        Runs in the page: collects posts, adds red borders, logs results
src/moderation.js     Jev questions and flag policy (no Chrome APIs, unit tested)
src/options.html/.js  Options page: API key, selector, threshold
tests/                Unit tests for moderation.js
```

Run the tests with:

```sh
npm test
```

No build step and no dependencies are needed; the tests use Node's built-in test runner (Node 20+).

## The Jev request

Each post is sent as one request with three Noul (yes/no probability) questions:

```json
{
  "model": "jev-latest",
  "state": { "post": "<post text>" },
  "questions": {
    "racist":  { "type": "noul", "instructions": "Does `post` contain racist content ...", "criteria": { "true": "...", "false": "..." } },
    "sexist":  { "type": "noul", "instructions": "Does `post` contain sexist content ...", "criteria": { "true": "...", "false": "..." } },
    "violent": { "type": "noul", "instructions": "Does `post` threaten, incite, or glorify violence ...", "criteria": { "true": "...", "false": "..." } }
  }
}
```

The response contains `answers.racist.noul` and so on, each a probability between 0 and 1. The full
question texts are in [`src/moderation.js`](src/moderation.js). The API is documented at
[docs.typesafe.ai](https://docs.typesafe.ai).

## Limitations

- **The API key lives in the browser.** It is stored in `chrome.storage.local` and only used by the
  service worker, but anyone with access to the browser profile can read it. Don't distribute the
  extension with a key in it; a real deployment would call TypeSafe through a small backend.
- **Post text is sent to TypeSafe.** Only the text of matched posts is sent, and only when you click the icon.
- **The threshold hasn't been tuned.** `0.7` is a starting point, not a value tested on Ylilauta posts.
  Expect some false positives and misses, especially with slang, irony and quoted text.
- **Posts are checked once per click.** New posts that load later (scrolling, live updates) need another click.
- **Very short posts are skipped** (under 20 characters), and long posts are truncated to 4000 characters.
- **The Ylilauta selector was checked on the board's thread list only.** Thread pages may use a
  different structure.

## License

See [LICENSE](LICENSE).
