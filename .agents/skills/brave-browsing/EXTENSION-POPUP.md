# Extension Popup Automation & Tab Bypass

## 1. Failure Condition
Interacting with Chrome Extension popups (`chrome-extension://<EXTENSION_ID>/popup.html`) triggers:
`⚠️ Please open <Target Page> first`

Root cause: `popup.js` calls `chrome.tabs.query({ active: true, currentWindow: true })`, resolving to `popup.html` instead of the target page tab.

---

## 2. Tab Query Override Snippet
Inject via `evaluate_script` into the `popup.html` context BEFORE clicking action buttons:

```javascript
const originalQuery = chrome.tabs.query;
chrome.tabs.query = function(queryInfo, callback) {
    return new Promise((resolve) => {
        originalQuery.call(chrome.tabs, {}, (allTabs) => {
            const targetTab = allTabs.find(t => t.url && t.url.includes('<TARGET_DOMAIN>'));
            const res = targetTab ? [targetTab] : [];
            if (callback) callback(res);
            resolve(res);
        });
    });
};
```

---

## 3. Workflow
1. Run `list_pages` to find target page URL (e.g., Facebook, Messenger).
2. Navigate or switch to extension popup: `chrome-extension://<EXTENSION_ID>/popup.html`.
3. Run `evaluate_script` with the Tab Query Override snippet.
4. Interact with popup DOM controls (e.g., `fill`, `click`).
5. Verify completion via DOM inspection.
