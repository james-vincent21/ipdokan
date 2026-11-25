// Builds styles/theme-light.css from styles/globals.css.
//   node scripts/build-light-theme.mjs
// The site is designed dark. For every rule that sets a colour, this writes the same rule under
// html[data-theme="light"] with the colour converted for a light background:
//   - dark surfaces become light (raised surfaces become the whitest),
//   - light text and borders become dark,
//   - bright accent text is darkened so it stays readable, accent fills (blue buttons) keep their colour,
//   - shadows are kept dark but made softer.
// Run it again after changing colours in globals.css. Hand-written fixes go in LIGHT_EXTRAS below.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(root, "styles/globals.css");
const TARGET = resolve(root, "styles/theme-light.css");
const SCOPE = 'html[data-theme="light"]';

// ----- colour parsing -----
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/g;

function parseColor(text) {
  if (NAMED[text]) return [...NAMED[text]];
  if (text.startsWith("#")) {
    let hex = text.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  const parts = text.replace(/^rgba?\(|\)$/g, "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (p) => (p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p));
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha];
}

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const format = ([r, g, b], a) => (a >= 0.999 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+(a * 100).toFixed(1)}%)`);
const SLATE = [15, 23, 42];

// role: "surface" (backgrounds), "ink" (text, borders, icons) or "shadow".
function convert(color, role) {
  const [r, g, b, a] = color;
  const [h, s, l] = toHsl([r, g, b]);
  const accent = s > 0.3 && l > 0.12 && l < 0.92;

  if (role === "shadow") {
    if (l > 0.5) return format([255, 255, 255], 0); // light inset highlights disappear on white
    return format([r, g, b], a * 0.35);
  }
  if (role === "text-shadow") return l > 0.5 ? format([255, 255, 255], 0) : format([r, g, b], a * 0.12); // dark glows behind text become faint

  if (role === "surface") {
    if (a < 0.75) {
      if (l > 0.6 && !accent) return format(SLATE, a * 0.9); // white veils (hover, lines) → dark veils
      if (l < 0.2 && a >= 0.5) return format(SLATE, a * 0.45); // dark backdrops behind pop-ups stay dimmed
      if (l < 0.2) return format(SLATE, Math.min(0.07, a * 0.12)); // dark veils (inset panels) → faint grey
      return format([r, g, b], a); // tinted veils (blue/green/amber) read fine on white
    }
    if (accent && l >= 0.25) return format([r, g, b], a); // solid accent fills: buttons, badges
    if (l > 0.75) return format([r, g, b], a); // already-light surfaces (image frames, light chips) stay light
    if (l < 0.3) {
      // Dark surfaces: raised (lighter) surfaces become whiter. Tinted ones keep a light tint of their hue.
      const nl = clamp(0.945 + l * 0.4, 0.94, 1);
      return format(fromHsl(h, s > 0.15 ? Math.min(s, 0.45) : s * 0.5, nl), a);
    }
    return format(fromHsl(h, s, clamp(1 - l, 0.08, 0.98)), a);
  }

  // ink
  if (a >= 0.75 && l < 0.45) return format([r, g, b], a); // already-dark text (on light chips) stays as designed
  if (a < 0.75 && l > 0.6 && !accent) return format(SLATE, Math.min(1, a * 1.2)); // white lines/borders → slate lines
  if (accent) return format(fromHsl(h, Math.min(1, s * 1.05), clamp(1 - l, 0.36, 0.48)), a); // bright accent text → deeper, still vivid shade
  return format(fromHsl(h, s, clamp(1 - l, 0.1, 0.92)), a);
}

const roleOf = (prop) => prop === "text-shadow" ? "text-shadow" : /shadow/.test(prop) ? "shadow" : /^background|^--.*(bg|surface)/.test(prop) ? "surface" : "ink";
const COLOR_PROPS = /^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?)$/;

// keepWhite: the rule styles a selected/active item that sits on a blue fill, where see-through white
// (e.g. rgb(255 255 255 / 80%) for a subtitle) must stay white.
function convertValue(value, role, keepWhite = false) {
  return value.replace(COLOR_RE, (match) => {
    const color = parseColor(match);
    if (!color) return match;
    if (keepWhite && role !== "shadow" && color[3] < 1 && toHsl(color)[2] > 0.9) return match;
    return convert(color, role);
  });
}
const SELECTED_STATE = /\.is-(selected|active)\b|aria-pressed="?true/;

// Text on a solid accent background (e.g. white on a blue button) keeps its colour.
function hasAccentBackground(rule) {
  let found = false;
  rule.walkDecls(/^background(-color)?$/, (decl) => {
    if (/var\(--blue/.test(decl.value)) found = true;
    for (const match of decl.value.match(COLOR_RE) || []) {
      const color = parseColor(match);
      if (!color || color[3] < 0.75) continue;
      const [, s, l] = toHsl(color);
      if (s > 0.3 && l >= 0.25 && l <= 0.75) found = true;
    }
  });
  return found;
}

function scopeSelector(selector) {
  return selector.split(",").map((part) => {
    const s = part.trim();
    if (s === ":root" || s === "html") return SCOPE;
    if (s.startsWith("html")) return SCOPE + s.slice(4);
    return `${SCOPE} ${s}`;
  }).join(",\n");
}

// Hand-written light theme values and fixes the automatic conversion cannot know about.
const LIGHT_EXTRAS = `
${SCOPE} {
  color-scheme: light;
  --background: #f3f5fa;
  --surface: #ffffff;
  --foreground: #101828;
  --muted: #55627a;
  --blue: #2f6bff;
  --blue-hover: #1f5af0;
  --line: rgb(15 23 42 / 11%);
}
/* The logo has white lettering: show it dark, keep its blue. */
${SCOPE} .brand-logo, ${SCOPE} .footer-logo img { filter: invert(1) hue-rotate(180deg) saturate(1.3); }
/* Icon inside the selected (blue) proxy type card stays white. */
${SCOPE} .proxy-type-card.is-selected .proxy-type-icon { color: #fff; }
/* Cards are white with a soft shadow instead of the glow they have on dark. */
${SCOPE} .profile-card, ${SCOPE} .admin-card { background: #fff; box-shadow: 0 1px 2px rgb(15 23 42 / 6%), 0 8px 24px rgb(15 23 42 / 6%); }
/* The About feature cards were dark blue with white text; they are now light glass, so use dark text. */
${SCOPE} .trust-feature { color: var(--foreground); }
/* Letters on the coloured chat avatars in the phone animation stay white. */
${SCOPE} .tg-avatar { color: #fff; }
/* The Telegram avatar shows the white-lettered logo: keep its circle dark blue. */
${SCOPE} .telegram-profile-logo, ${SCOPE} .tg-avatar-bot { background: radial-gradient(circle at 30% 25%, #235da6, #071126 72%); }
/* Glass product cards in light mode: off-white at 30% with a white top edge and a soft blue-grey shadow. */
${SCOPE} .popular-product-card, ${SCOPE} .store-product-card, ${SCOPE} .proxy-plan-card, ${SCOPE} .proxy-type-card:not(.is-selected), ${SCOPE} .benefit-card, ${SCOPE} .service-card, ${SCOPE} .overview-service-card, ${SCOPE} .trust-feature { border: 1px solid rgb(255 255 255 / 90%); background: rgb(245 242 235 / 30%); box-shadow: inset 0 1px 0 #fff, 0 2px 0 rgb(140 155 190 / 35%), 0 4px 0 rgb(140 155 190 / 25%), 0 6px 0 rgb(140 155 190 / 15%), 0 16px 30px rgb(40 70 140 / 14%); }
${SCOPE} .popular-product-card:hover, ${SCOPE} .store-product-card:hover, ${SCOPE} .proxy-type-card:not(.is-selected):hover, ${SCOPE} .benefit-card:hover, ${SCOPE} .service-card:hover, ${SCOPE} .overview-service-card:hover, ${SCOPE} .trust-feature:hover { background: rgb(245 242 235 / 30%); border-color: rgb(47 107 255 / 35%); box-shadow: inset 0 1px 0 #fff, 0 2px 0 rgb(120 145 200 / 40%), 0 5px 0 rgb(120 145 200 / 28%), 0 8px 0 rgb(120 145 200 / 16%), 0 26px 40px rgb(47 107 255 / 20%); }
${SCOPE} .proxy-plan-card.is-selected { border-color: var(--blue); box-shadow: 0 0 0 1px var(--blue), inset 0 1px 0 #fff, 0 14px 34px rgb(47 107 255 / 16%); }
`;

const source = postcss.parse(readFileSync(SOURCE, "utf8"));

// Rules between /* @theme-same:start */ and /* @theme-same:end */ look the same in both themes
// (e.g. the blue nav pills): their colours are repeated unchanged so they still beat the converted base rules.
const sameInBothThemes = new Set();
{
  let inside = false;
  source.walk((node) => {
    if (node.type === "comment") {
      if (node.text.includes("@theme-same:start")) inside = true;
      if (node.text.includes("@theme-same:end")) inside = false;
    } else if (node.type === "rule" && inside) sameInBothThemes.add(node);
  });
}
const out = postcss.root();
let rules = 0, decls = 0;

const BACKGROUND_LONGHANDS = /^(-webkit-)?background-(clip|size|position|repeat|attachment|origin)$|^-webkit-text-fill-color$/;

source.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  // Gradient text (background clipped to the text) is converted like text colour.
  let textClip = false;
  rule.walkDecls(/background-clip$/, (decl) => { if (decl.value.includes("text")) textClip = true; });
  const accentBg = !textClip && hasAccentBackground(rule);
  const keepWhite = SELECTED_STATE.test(rule.selector);
  let hasColor = false;
  const changed = [];
  let shorthandBackground = false;
  rule.each((decl) => {
    if (decl.type !== "decl" || decl.prop.startsWith("--")) return;
    if (decl.prop === "color") hasColor = true;
    const literal = COLOR_RE.test(decl.value);
    COLOR_RE.lastIndex = 0;
    // In "same in both themes" rules every colour property is repeated (var(), transparent, none...).
    if (!COLOR_PROPS.test(decl.prop) || !(literal || sameInBothThemes.has(rule))) return;
    // Every colour declaration is written, changed or not, so state rules (.is-selected, :hover)
    // keep beating the base rules exactly as they do in the dark theme.
    const role = textClip && /^background/.test(decl.prop) ? "ink" : roleOf(decl.prop);
    const value = sameInBothThemes.has(rule) || (decl.prop === "color" && accentBg) ? decl.value : convertValue(decl.value, role, keepWhite);
    if (decl.prop === "background") shorthandBackground = true;
    changed.push(postcss.decl({ prop: decl.prop, value, important: decl.important }));
  });
  // The `background` shorthand resets clip/size/position: repeat the rule's own settings after it.
  if (shorthandBackground) rule.each((decl) => { if (decl.type === "decl" && BACKGROUND_LONGHANDS.test(decl.prop)) changed.push(postcss.decl({ prop: decl.prop, value: decl.value, important: decl.important })); });
  // Solid accent fills (buttons, selected items) that inherit their text colour keep white text.
  if (accentBg && !hasColor && changed.length && !sameInBothThemes.has(rule)) changed.push(postcss.decl({ prop: "color", value: "#fff" }));
  if (!changed.length || rule.selector.trim() === ":root") return;
  const scoped = postcss.rule({ selector: scopeSelector(rule.selector) });
  changed.forEach((decl) => scoped.append(decl));
  // Keep the rule inside the same @media / @supports blocks.
  let target = out;
  const chain = [];
  for (let node = rule.parent; node && node.type === "atrule"; node = node.parent) chain.unshift(node);
  for (const atrule of chain) {
    let existing = target.nodes.find((node) => node.type === "atrule" && node.name === atrule.name && node.params === atrule.params && node === target.last);
    if (!existing) { existing = postcss.atRule({ name: atrule.name, params: atrule.params }); target.append(existing); }
    target = existing;
  }
  target.append(scoped);
  rules += 1; decls += changed.length;
});

const header = `/* Generated by scripts/build-light-theme.mjs from globals.css. Do not edit by hand: change the script and run it again. */\n`;
writeFileSync(TARGET, header + out.toString() + "\n" + LIGHT_EXTRAS);
console.log(`theme-light.css: ${rules} rules, ${decls} colour declarations converted.`);
