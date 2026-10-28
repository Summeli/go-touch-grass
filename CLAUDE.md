# CLAUDE.md

This file guides Claude Code when working in this repository.

## Project overview

**go-touch-grass** is a Chrome extension that moderates forum posts with TypeSafe's **Jev** model.
When the user clicks the extension icon, the extension finds the text blocks in the page's post
`<div>`s, asks Jev whether each one is **racist**, **sexist** or **violent**, and hides the ones that are.

## Architecture (Manifest V3)

```
manifest.json         MV3 manifest: action, background service worker, permissions
src/background.js     Service worker: handles icon clicks, calls the TypeSafe API
src/content.js        Injected into the page: collects post text, hides flagged posts
src/options.html/.js  Options page: API key, post selector, threshold
src/moderation.js     Builds the Jev request and applies the hide policy (pure, testable)
```

Flow:
1. `chrome.action.onClicked` in `background.js` injects `content.js` into the active tab with
   `chrome.scripting.executeScript`. Don't add a popup (`default_popup`), because it stops `onClicked` from firing.
2. `content.js` selects the post divs (the selector is configurable), extracts `innerText`,
   gives each one an id (`data-gtg-id`) and sends `{id, text}` items to the background via
   `chrome.runtime.sendMessage`.
3. `background.js` calls the TypeSafe API, one request per post, with a capped number of requests in flight.
4. `background.js` returns `{id, hide, scores}` and `content.js` hides the flagged posts. Prefer
   collapsing the post behind a "Hidden by go-touch-grass, click to show" placeholder over
   `display:none`, so the user can check false positives.

Network calls stay in the service worker, not the content script. The content script would be
subject to the page's CSP and CORS, and the API key would be exposed to the page.

Permissions: `activeTab`, `scripting`, `storage`, plus `host_permissions` for `https://api.typesafe.ai/*`.

## TypeSafe / Jev integration

The live docs are the source of truth: https://docs.typesafe.ai/llms.txt (append `.md` to a page path for Markdown).
Check the [API](https://docs.typesafe.ai/api.md) and [Noul](https://docs.typesafe.ai/primitives/noul.md)
pages before changing the request format.

- Endpoint: `POST https://api.typesafe.ai/v1/systemone`
- Auth: `Authorization: Bearer <API_KEY>`
- Model: `jev-latest`

Use **one Noul question per category**, not a single Choice. A post can be several of these at
once, and each category needs its own threshold. All three questions go in the same request so
they run in parallel:

```json
{
  "model": "jev-latest",
  "state": { "post": "<post text>" },
  "questions": {
    "racist": {
      "type": "noul",
      "instructions": "Does `post` contain racist content: demeaning, hateful or stereotyping statements about people based on race, ethnicity or national origin?",
      "criteria": {
        "true": "The post attacks, demeans or promotes hatred against a racial or ethnic group",
        "false": "No racist content; neutral discussion or quoting of racism in order to criticise it is not racist"
      }
    },
    "sexist": {
      "type": "noul",
      "instructions": "Does `post` contain sexist content: demeaning, hateful or stereotyping statements about people based on sex or gender?",
      "criteria": {
        "true": "The post demeans, harasses or promotes hatred against people because of their sex or gender",
        "false": "No sexist content"
      }
    },
    "violent": {
      "type": "noul",
      "instructions": "Does `post` threaten, incite, or glorify violence against people?",
      "criteria": {
        "true": "Threats, calls to violence, or glorification of harming people",
        "false": "No violent content; news reporting, fiction discussion or historical discussion is not violent"
      }
    }
  }
}
```

The response contains `answers.<id>.noul`, which is the probability of "yes" (0–1).

Hide policy (lives in `moderation.js`): hide the post if **any** category's `noul` is at or above
the threshold (default `0.7`, configurable in options). Keep the raw scores so the threshold can
change without calling the API again. A value near 0.5 means the model is uncertain, not that the
content is mildly offensive. Tune the threshold on real forum samples, not by guessing.

Errors: if a request fails (network error, 4xx/5xx, rate limit), leave the post **visible** and
log the error. Never hide a post because of a failed call.

## API key handling

- Never commit an API key or hardcode it in source. The user enters it on the options page and it
  is stored in `chrome.storage.local`.
- Only the service worker reads the key. Never pass it to `content.js` or the page.
- Anyone who installs the extension can read a key that ships inside it. If the extension is
  distributed, put a small backend proxy in front of TypeSafe instead.

## Development

- No build step yet: plain ES modules (`"type": "module"` for the service worker).
- Load the extension at `chrome://extensions`, enable Developer mode, click "Load unpacked" and select the repo root.
- After you change the code, click reload on the extension card. Content script changes also need a page refresh.
- Debugging: use the service worker's "Inspect views" link for background logs and the page DevTools for content-script logs.
- Keep `moderation.js` free of `chrome.*` APIs so it can be unit tested with Node (`node --test`).

## Conventions

- Vanilla JavaScript, no frameworks, minimal dependencies.
- Use `async`/`await` and handle every `fetch` rejection.
- Process only text. Skip empty or very short blocks, and truncate very long posts to keep token use bounded.
- Don't send page content anywhere except the TypeSafe API.
