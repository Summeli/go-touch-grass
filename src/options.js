import { DEFAULT_SETTINGS } from './moderation.js';

const form = document.getElementById('form');
const fields = ['apiKey', 'selector', 'threshold'];
const status = document.getElementById('status');

const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
for (const name of fields) {
  document.getElementById(name).value = settings[name];
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selector = document.getElementById('selector').value.trim();
  try {
    document.querySelector(selector);
  } catch {
    status.style.color = '#c33';
    status.textContent = 'Invalid CSS selector';
    return;
  }
  await chrome.storage.local.set({
    apiKey: document.getElementById('apiKey').value.trim(),
    selector,
    threshold: Number(document.getElementById('threshold').value),
  });
  status.style.color = '';
  status.textContent = 'Saved';
  setTimeout(() => (status.textContent = ''), 1500);
});
