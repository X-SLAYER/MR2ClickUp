// ==UserScript==
// @name         Clickup Gen from Gitlab
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Generate ClickUp Tasks from git commits
// @author       X-SLAYER: (https://github.com/X-SLAYER)
// @match        https://gitlab.proxym-group.net/*merge_requests*
// @icon         https://gitlab.proxym-group.net/assets/favicon-72a2cad5025aa931d6ea56c3201d1f18e68a8cd39788c7c80d5b2b82aa5143ef.png
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    let GEMINI_API_KEY = null;
    const MODEL_ID = 'gemini-1.5-flash';
    let API_URL = '';


    const systemPrompt = `I want you to act as a ClickUp task generator that converts raw text inputs into formatted task titles and descriptions. I will provide a brief description (e.g., 'login timeout bug' or 'dark mode toggle for mobile app'), and you will respond *only* with:
1. **Title**: A concise task name starting with a relevant tag like [UAT], [BUG-FIXING], [FEATURE], or [ENHANCEMENT].
2. **Description**: A bullet-point list of 2-4 actionable steps or requirements (e.g., 'Fix session expiration logic', 'Add UI toggle in settings screen').

**Rules**:
- Use tags contextually (e.g., [BUG-FIXING] for errors, [UAT] for testing tasks).
- Prioritize clarity over technical jargon unless specified.
- Include specific modules (e.g., 'checkout API', 'user profile page') if mentioned.

**Examples**:
- Input: "Slow response on checkout page"
  Output:
  [BUG-FIXING] Optimize Checkout Page API Response Time
  • Identify bottlenecks in /checkout API database queries.
  • Implement caching for product inventory data.
  • Target: Reduce latency from 3s to <1s.

- Input: "Add Arabic language support"
  Output:
  [FEATURE] Implement Arabic Language Localisation
  • Integrate Arabic translations for all UI strings.
  • Ensure RTL (right-to-left) layout compatibility.
  • Test date/number formatting in invoices.
`;

    async function getOrPromptForAPIKey() {
        GEMINI_API_KEY = await GM_getValue("GEMINI_API_KEY");
        if (!GEMINI_API_KEY) {
            const userKey = prompt("🔐 Please enter your Gemini API Key:\nVisit: https://aistudio.google.com/app/apikey");
            if (userKey) {
                await GM_setValue("GEMINI_API_KEY", userKey.trim());
                GEMINI_API_KEY = userKey.trim();
                alert("✅ API Key saved successfully!");
            } else {
                alert("❌ Invalid API Key. Please try again.");
            }
        }
    }

    function addCheckboxes() {
        document.querySelectorAll('ul.controls').forEach((ul) => {
            const parentLi = ul.closest('li.merge-request');
            if (parentLi && !parentLi.classList.contains('checkbox-added')) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'mr-selector-checkbox';
                checkbox.style.marginRight = '10px';

                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.alignItems = 'center';
                container.appendChild(checkbox);
                parentLi.prepend(container);

                parentLi.classList.add('checkbox-added');
            }
        });
    }

    function addCopyButton() {
        if (document.getElementById('copy-selected-mrs-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'copy-selected-mrs-btn';
        btn.innerText = 'Generate Clickup Tasks ✨';
        btn.style.position = 'fixed';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = '9999';
        btn.style.padding = '12px 20px';
        btn.style.background = 'linear-gradient(135deg, #F736AA, #F78847)';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.boxShadow = '0 4px 10px rgba(0, 0, 0, 0.1)'; // Optional nice touch

        btn.addEventListener('click', async () => {

            await getOrPromptForAPIKey();
            if (!GEMINI_API_KEY) return;
            API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_API_KEY}`;

            const selected = document.querySelectorAll('.mr-selector-checkbox:checked');
            const texts = [];
            selected.forEach(checkbox => {
                const li = checkbox.closest('li.merge-request');
                const anchor = li.querySelector('.merge-request-title-text a');
                if (anchor) {
                    texts.push(anchor.innerText.trim());
                }
            });

            if (!texts.length) {
                alert('Please select at least one merge request.');
                return;
            }

            const originalText = btn.innerText;
            btn.innerText = '⏳ Generating...';
            btn.disabled = true;

            const finalText = texts.join('\n');
            GM_setClipboard(finalText);

            const inputText = texts.join('\n');
            const payload = {
                contents: [{
                    role: "user",
                    parts: [{ text: inputText }]
                }],
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                    responseMimeType: "text/plain"
                }
            };

            try {
                const resultText = await sendToGemini(payload);
                GM_setClipboard(resultText);
                alert('📋 Tasks copied to clipboard');
            } catch (err) {
                alert('❌ Failed to generate tasks: ' + err.message);
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });

        document.body.appendChild(btn);
    }

    function sendToGemini(payload) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: API_URL,
                headers: {
                    'Content-Type': 'application/json',
                },
                data: JSON.stringify(payload),
                onload: function (res) {
                    try {
                        const json = JSON.parse(res.responseText);
                        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text) throw new Error('No content returned from Gemini.');
                        resolve(text);
                    } catch (e) {
                        console.error('❌ Gemini response error:', res.responseText);
                        reject(new Error('Invalid response from Gemini. ' + e.message));
                    }
                },
                onerror: function (err) {
                    reject(new Error('Network error: ' + err.message));
                }
            });
        });
    }



    function init() {
        addCheckboxes();
        addCopyButton();
    }


    init();
    setInterval(init, 2000);
})();
