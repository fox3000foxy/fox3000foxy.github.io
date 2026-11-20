import { t as __exportAll } from "./rolldown-runtime_D8jQpDG7.mjs";
import { _ as renderTemplate, u as renderComponent, v as maybeRenderHead, w as addAttribute } from "./console_B4Ch7nu3.mjs";
import { h as createComponent, t as $$BaseLayout } from "./BaseLayout_DjXKcLim.mjs";
// src/utils/config.ts
var CONFIG = {
	newsletterApiUrl: void 0,
	contactApiUrl: void 0,
	turnstileSiteKey: void 0
};
// src/pages/contact.astro
var contact_exports = /* @__PURE__ */ __exportAll({
	default: () => $$Contact,
	file: () => $$file,
	url: () => $$url
});
var $$Contact = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`${renderComponent($$result, "BaseLayout", $$BaseLayout, {
		"title": "Contact",
		"description": "Contact me",
		"wide": true
	}, { "default": async ($$result) => renderTemplate`${maybeRenderHead($$result)}<article class="contact-page"><h1>Contact</h1><form class="contact-form" id="contact-form"><label>Name<input type="text" name="name" required></label><label>Your email<input type="email" name="email" required></label><label>Message<textarea name="message"${addAttribute(6, "rows")} required></textarea></label><div class="cf-turnstile"${addAttribute(CONFIG.turnstileSiteKey ?? "", "data-sitekey")} data-theme="dark" data-size="normal"></div><button type="submit" id="contact-submit">Send</button><p class="contact-privacy" style="font-size:0.85rem;opacity:0.8">By sending this form you agree to the <a href="/privacy">privacy policy</a>.</p><p id="contact-success" class="contact-success" style="display:none">Message sent! I'll get back to you soon.</p><p id="contact-error" class="contact-error" style="display:none">Something went wrong. Try again later.</p></form><section class="contact-social"><p>You can also find me on these platforms:</p><div class="contact-links"><a href="https://github.com/fox3000foxy" target="_blank" rel="noopener noreferrer" class="contact-link">GitHub ↗</a><a href="https://x.com/fox3000foxy" target="_blank" rel="noopener noreferrer" class="contact-link">Twitter / X ↗</a><a href="https://linkedin.com/in/fox3000foxy" target="_blank" rel="noopener noreferrer" class="contact-link">LinkedIn ↗</a></div></section></article><script>
  (function() {
    var form = document.getElementById('contact-form');
    if (!form) return;

    var submitBtn = document.getElementById('contact-submit');
    var successEl = document.getElementById('contact-success');
    var errorEl = document.getElementById('contact-error');
    var apiUrl = '/api/contact';

    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      var name = form.querySelector('[name="name"]');
      var email = form.querySelector('[name="email"]');
      var message = form.querySelector('[name="message"]');
      if (!(name && email && message && name.value && email.value && message.value)) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      successEl.style.display = 'none';
      errorEl.style.display = 'none';

      var turnstileToken = '';
      var tsWidget = form.querySelector('.cf-turnstile');
      if (tsWidget && window.turnstile) {
        try { turnstileToken = window.turnstile.getResponse(tsWidget) || ''; } catch(e) {}
      }

      try {
        var res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.value,
            email: email.value,
            message: message.value,
            'cf-turnstile-response': turnstileToken || undefined,
          }),
        });

        if (res.ok) {
          successEl.style.display = '';
          name.value = ''; email.value = ''; message.value = '';
          if (window.turnstile) try { window.turnstile.reset(tsWidget); } catch(e) {}
        } else {
          errorEl.style.display = '';
        }
      } catch(e) {
        errorEl.style.display = '';
      }

      submitBtn.disabled = false;
      submitBtn.textContent = 'Send';
    });
  })();
  <\/script>` })}`;
}, "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/contact.astro", void 0);
var $$file = "/home/runner/work/fox3000foxy.github.io/fox3000foxy.github.io/src/pages/contact.astro";
var $$url = "/contact";
// \0virtual:astro:page:src/pages/contact@_@astro
var page = () => contact_exports;
export { page };
