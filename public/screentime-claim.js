/**
 * <screentime-claim> — drop-in "claim screen time" widget (no dependencies, ESM).
 *
 *   <script type="module" src="/screentime-claim.js"></script>
 *   <screentime-claim endpoint="/api/claim" minutes="10"></screentime-claim>
 *
 * The widget never sees code_secret. Your site supplies the endpoint, which
 * checks the kid earned the time and mints the code server-side (see
 * screentimeCode.ts / screentime_code.py):
 *
 *   POST <endpoint>  {"kid": "<pool name>"}      (same-origin cookies sent)
 *     200 {"kid", "minutes", "code", "url"}      url = claimUrl(kid, code)
 *     4xx {"error": "<shown to the kid>"}
 *
 * The endpoint should be idempotent: once something has been claimed, it
 * returns the same code again, so a reload can't earn twice.
 *
 * The kid redeems by following the link to screentime.lan, which is a page
 * navigation and so works from any site, even HTTPS. The widget does not
 * fetch screentime.lan itself: browsers block HTTPS pages from fetching
 * plain-http LAN hosts.
 *
 * Attributes:
 *   endpoint         required: the minting URL above
 *   minutes          shown on the button (default 10); the endpoint decides
 *   kids             comma-separated pool names, shown as a dropdown with an
 *                    "Other…" option for typing; omitted = text input only
 *   default-kid      name to preselect (e.g. the kid's last claim, which the
 *                    host remembers); prefilled as "Other…" if not in kids
 *   kid, code        an earlier claim; the widget starts in the claimed state
 *   disabled         greys out the form; disabled-reason says why
 *   claim-base       default http://screentime.lan/claim (used with kid/code)
 *
 * Fires "screentime-claimed" (bubbles) with detail {kid, minutes, code, url}.
 */

const NAME = /^[a-z0-9_]{1,32}$/; // config.yaml pool names
const OTHER = "__other";

const CSS = `
:host{--ink:#1d2330;--mute:#6b7280;--card:#fff;--line:#e5e7eb;--ok:#16a34a;--bad:#dc2626;
display:block;font:15px/1.4 system-ui,sans-serif;color:var(--ink)}
@media (prefers-color-scheme:dark){:host{--ink:#e8eaee;--mute:#9aa1ad;--card:#1b1e25;--line:#2b2f38}}
.box{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--card)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
b{font-weight:600}.mute{color:var(--mute);font-size:13px}.err{color:var(--bad);font-size:13px}
input,select,button,a.btn{font:inherit;padding:8px 12px;border-radius:8px;border:1px solid var(--line);
box-sizing:border-box;background:var(--card);color:var(--ink)}
input,select{flex:1;min-width:8em}
button,a.btn{background:var(--ink);color:var(--card);border:0;cursor:pointer;text-decoration:none}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
button:disabled{opacity:.5;cursor:default}
code{font:600 16px ui-monospace,monospace;letter-spacing:.04em}
p{margin:0 0 8px}`;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

class ScreentimeClaim extends HTMLElement {
  static observedAttributes = ["kid", "code", "kids", "default-kid", "disabled", "disabled-reason", "minutes"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.busy = false;
    this.error = "";
    this.claim = null;
    this.draft = null; // typed name, kept across re-renders (null = not touched yet)
    this.choice = null; // dropdown value: a listed name or OTHER (null = not touched yet)
  }

  names() {
    return (this.getAttribute("kids") || "")
      .split(",")
      .map((n) => n.trim().toLowerCase())
      .filter((n) => NAME.test(n));
  }

  // Until the kid touches the form, both follow default-kid.
  formState(names) {
    const preset = (this.getAttribute("default-kid") || "").trim().toLowerCase();
    const choice = this.choice ?? (names.includes(preset) ? preset : preset ? OTHER : names[0] ?? OTHER);
    const draft = this.draft ?? (names.includes(preset) ? "" : preset);
    return { choice, draft };
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) this.render();
  }

  existingClaim() {
    if (this.claim) return this.claim;
    const kid = this.getAttribute("kid");
    const code = this.getAttribute("code");
    if (!kid || !code) return null;
    const base = this.getAttribute("claim-base") || "http://screentime.lan/claim";
    const minutes = Number(code.split("-")[0]) || null;
    return { kid, code, minutes, url: `${base}?${new URLSearchParams({ kid, code })}` };
  }

  async submit(kid) {
    const name = kid.trim().toLowerCase();
    if (!NAME.test(name)) {
      this.error = "Type your screen time name (letters, digits, _).";
      return this.render();
    }
    this.busy = true;
    this.error = "";
    this.render();
    try {
      const res = await fetch(this.getAttribute("endpoint"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kid: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.code) throw new Error(data.error || `Claim failed (${res.status}).`);
      this.claim = data;
      this.dispatchEvent(new CustomEvent("screentime-claimed", { detail: data, bubbles: true, composed: true }));
    } catch (e) {
      this.error = e.message || "Claim failed.";
    }
    this.busy = false;
    this.render();
  }

  render() {
    const root = this.shadowRoot;
    const claim = this.existingClaim();
    const minutes = this.getAttribute("minutes") || "10";

    if (claim) {
      root.innerHTML = `<style>${CSS}</style><div class=box>
        <p><b>${esc(claim.minutes ?? minutes)} min</b> ready for <b>${esc(claim.kid)}</b></p>
        <div class=row><code>${esc(claim.code)}</code>
          <button class=ghost id=copy>Copy</button>
          <a class=btn href="${esc(claim.url)}" target=_blank rel=noopener>Redeem on screentime.lan →</a></div>
        <p class=mute style="margin-top:8px">Opens on the home Wi-Fi. Each code works once.</p></div>`;
      root.getElementById("copy").onclick = (ev) => {
        navigator.clipboard?.writeText(claim.code).then(() => (ev.target.textContent = "Copied ✓"), () => {});
      };
      return;
    }

    const disabled = this.hasAttribute("disabled") || this.busy;
    const reason = this.hasAttribute("disabled") ? this.getAttribute("disabled-reason") : "";
    const names = this.names();
    const { choice, draft } = this.formState(names);
    const dis = disabled ? "disabled" : "";
    const select = names.length
      ? `<select name=choice ${dis}>${[...names, OTHER]
          .map((n) => `<option value="${esc(n)}"${n === choice ? " selected" : ""}>${n === OTHER ? "Other…" : esc(n)}</option>`)
          .join("")}</select>`
      : "";
    const input = !names.length || choice === OTHER
      ? `<input name=kid placeholder="Your screen time name" value="${esc(draft)}" autocomplete=off
          autocapitalize=none spellcheck=false ${dis}>`
      : "";
    root.innerHTML = `<style>${CSS}</style><div class=box>
      <p><b>Earn ${esc(minutes)} min of screen time</b></p>
      <form class=row>${select}${input}
        <button ${disabled ? "disabled" : ""}>${this.busy ? "Claiming…" : `Claim ${esc(minutes)} min`}</button></form>
      ${reason ? `<p class=mute style="margin-top:8px">${esc(reason)}</p>` : ""}
      ${this.error ? `<p class=err style="margin-top:8px">${esc(this.error)}</p>` : ""}</div>`;
    const form = root.querySelector("form");
    const keepDraft = () => {
      if (form.kid) this.draft = form.kid.value;
    };
    if (form.choice) {
      form.choice.value = choice; // belt-and-braces alongside the `selected` attribute
      form.choice.onchange = () => {
        keepDraft();
        this.choice = form.choice.value;
        this.render();
        if (this.choice === OTHER) this.shadowRoot.querySelector("input")?.focus();
      };
    }
    form.onsubmit = (ev) => {
      ev.preventDefault();
      keepDraft();
      if (form.choice) this.choice = form.choice.value;
      this.submit(form.choice && form.choice.value !== OTHER ? form.choice.value : form.kid.value);
    };
  }
}

if (!customElements.get("screentime-claim")) customElements.define("screentime-claim", ScreentimeClaim);
