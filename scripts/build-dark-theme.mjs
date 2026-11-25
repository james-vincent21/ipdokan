// Builds styles/theme-dark.css from styles/globals.css.
//   node scripts/build-dark-theme.mjs   (npm run theme:light runs it too)
// globals.css is designed on near-black navy. Dark mode should be a softer charcoal/ash instead, so this
// writes every background declaration again under html[data-theme="dark"], with solid near-black navy
// colours lifted to charcoal grey. Blue artwork, accent fills and see-through veils are left as they are.
// Every background declaration is repeated (changed or not) so :hover / .is-selected rules keep beating
// base rules exactly as they do in globals.css.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(root, "styles/globals.css");
const TARGET = resolve(root, "styles/theme-dark.css");
const SCOPE = 'html[data-theme="dark"]';

// Page background and card surface. Change these to retune dark mode.
const ASH = { background: "#1f2125", surface: "#272a30", header: "#232529" };

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g;
function parseColor(text) {
  if (text.startsWith("#")) {
    let hex = text.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  const parts = text.replace(/^rgba?\(|\)$/g, "").split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  return [+parts[0], +parts[1], +parts[2], alpha];
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

// Solid, dark, not strongly coloured → charcoal/ash with a faint cool tint. Everything else unchanged.
function toAsh(match) {
  const color = parseColor(match);
  if (!color || color[3] < 0.75) return match;
  const [h, s, l] = toHsl(color);
  if (l >= 0.22 || s >= 0.55) return match;
  const [r, g, b] = fromHsl(h, Math.min(s, 0.07), 0.09 + l * 0.75);
  return color[3] >= 0.999 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+(color[3] * 100).toFixed(1)}%)`;
}

const source = postcss.parse(readFileSync(SOURCE, "utf8"));
// Rules between /* @theme-same:start */ and /* @theme-same:end */ (nav pill, phone hardware) keep their
// colours: they are repeated unchanged so they still beat the base rules.
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
let rules = 0, changedCount = 0;
source.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  if (rule.selector.includes('data-theme="light"')) return;
  const decls = [];
  let touched = false;
  rule.each((decl) => {
    if (decl.type !== "decl" || !/^background(-color|-image)?$/.test(decl.prop)) return;
    const value = sameInBothThemes.has(rule) ? decl.value : decl.value.replace(COLOR_RE, toAsh);
    if (value !== decl.value) touched = true;
    decls.push(postcss.decl({ prop: decl.prop, value, important: decl.important }));
  });
  if (!decls.length || rule.selector.trim() === ":root") return;
  // Background longhands that the shorthand would reset (e.g. gradient text clipping).
  rule.each((decl) => { if (decl.type === "decl" && /^(-webkit-)?background-(clip|size|position|repeat)$/.test(decl.prop)) decls.push(postcss.decl({ prop: decl.prop, value: decl.value })); });
  const scoped = postcss.rule({ selector: rule.selector.split(",").map((p) => p.trim()).map((p) => (p === "html" ? SCOPE : p.startsWith("html") ? SCOPE + p.slice(4) : `${SCOPE} ${p}`)).join(",\n") });
  decls.forEach((d) => scoped.append(d));
  let target = out;
  const chain = [];
  for (let node = rule.parent; node && node.type === "atrule"; node = node.parent) chain.unshift(node);
  for (const atrule of chain) {
    let existing = target.nodes.find((node) => node.type === "atrule" && node.name === atrule.name && node.params === atrule.params && node === target.last);
    if (!existing) { existing = postcss.atRule({ name: atrule.name, params: atrule.params }); target.append(existing); }
    target = existing;
  }
  target.append(scoped);
  rules += 1; if (touched) changedCount += 1;
});

// Text on the off-white glass cards: the 30% tint turns the cards mid-grey in dark mode, so muted grey
// and blue text is lifted to near-white / light blue, with a faint shadow for contrast.
const GLASS_CARDS = [".popular-product-card", ".store-product-card", ".proxy-plan-card", ".proxy-type-card:not(.is-selected)", ".benefit-card", ".service-card", ".overview-service-card", ".trust-feature"];
const inDark = (selectors) => selectors.map((s) => `${SCOPE} ${s}`).join(", ");
const CARD_TEXT = `
${inDark(GLASS_CARDS)} { text-shadow: 0 1px 2px rgb(0 0 0 / 35%); }
${inDark([".proxy-plan-price", ".proxy-plan-card ul li::before", ".catalog-home-cta"])} { color: #d3e0ff; }
${inDark([".proxy-plan-price small", ".proxy-plan-per-ip", ".proxy-type-card small", ".store-product-category", ".store-product-rating small", ".service-card > p", ".overview-service-card p", ".overview-service-number", ".benefit-card p", ".trust-feature p", ".catalog-product-description", ".product-rating", ".product-rating i", ".store-product-rating i"])} { color: #e6e9f0; }
${inDark([".proxy-plan-card ul", ".popular-product-name", ".service-card-footer", ".store-product-info h2", ".store-product-price"])} { color: #f7f8fb; }
`;

const extras = CARD_TEXT + `
${SCOPE} {
  --background: ${ASH.background};
  --surface: ${ASH.surface};
}
`;
writeFileSync(TARGET, `/* Generated by scripts/build-dark-theme.mjs from globals.css. Do not edit by hand. */\n${out.toString()}\n${extras}`);
console.log(`theme-dark.css: ${changedCount} rules turned ash (${rules} background rules repeated).`);
