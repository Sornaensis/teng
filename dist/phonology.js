/** Whole-phoneme transformations and contextual spelling. No evaluated user code. */
const fail = (message) => { throw new Error(message); };
const norm = (value, label, max = 2000) => {
  if (typeof value !== "string" || value.length > max) fail(`${label} must be text of at most ${max} characters.`);
  return value.normalize("NFC").trim();
};
const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
const at = (input, pattern, offset) => offset >= 0 && pattern.every((id, i) => input[offset + i] === id);
const MAX_SEGMENTS = 1000;

function inventory(language, phonemes) {
  if (!language || !Array.isArray(language.phonemeIds) || !Array.isArray(phonemes)) fail("A language and sound inventory are required.");
  const byId = new Map(phonemes.map((p) => [p.id, p]));
  const selected = language.phonemeIds.map((id) => {
    if (!byId.has(id)) fail(`Unknown sound “${id}” in the inventory.`);
    return byId.get(id);
  });
  const bySymbol = new Map(selected.map((p) => [p.symbol.normalize("NFC"), p.id]));
  if (!bySymbol.has("g") && bySymbol.has("ɡ")) bySymbol.set("g", bySymbol.get("ɡ"));
  const classes = {
    ...language.soundClasses,
    C: selected.filter((p) => p.type !== "vowel").map((p) => p.id),
    V: selected.filter((p) => p.type === "vowel").map((p) => p.id),
  };
  return { byId, selected, selectedIds: new Set(selected.map((p) => p.id)), bySymbol, classes };
}

export function validateSegments(segments, language, phonemes, label = "Pronunciation", allowEmpty = false) {
  const { selectedIds } = inventory(language, phonemes);
  if (!Array.isArray(segments) || segments.length > MAX_SEGMENTS || (!allowEmpty && !segments.length)) fail(`${label} needs ${allowEmpty ? "at most" : "between 1 and"} ${MAX_SEGMENTS} phonemes.`);
  for (const id of segments) if (!selectedIds.has(id)) fail(`${label} contains a sound outside this language’s inventory: “${id}”.`);
  return [...segments];
}

/** Parse explicit IPA, never infer pronunciation from spelling. Spaces disambiguate segment boundaries. */
export function parseIPA(value, language, phonemes) {
  let source = norm(value, "IPA");
  if ((source.startsWith("/") && source.endsWith("/")) || (source.startsWith("[") && source.endsWith("]"))) source = source.slice(1, -1).trim();
  if (!source) fail("Add a pronunciation in IPA before applying phoneme rules.");
  const inv = inventory(language, phonemes);
  const symbols = [...inv.bySymbol.keys()].sort((a, b) => b.length - a.length);
  const syllables = [], marks = [];
  for (const part of source.split(/[.·]/u)) {
    let raw = part.trim(), mark = "";
    if (!raw) fail("Each syllable must contain at least one phoneme.");
    if (/^[ˈˌ]/u.test(raw)) { mark = raw[0]; raw = raw.slice(1).trim(); }
    if (/[ˈˌ]/u.test(raw)) fail("Put stress before a syllable, with a dot between syllables.");
    const ids = [];
    for (const chunk of raw.split(/\s+/u)) {
      if (!chunk) continue;
      let offset = 0;
      while (offset < chunk.length) {
        const symbol = symbols.find((candidate) => chunk.startsWith(candidate, offset));
        if (!symbol) fail(`“${chunk.slice(offset)}” is not selected IPA. Add the sound to Phonology or correct the pronunciation.`);
        ids.push(inv.bySymbol.get(symbol));
        offset += symbol.length;
      }
    }
    if (!ids.length) fail("Each syllable must contain at least one phoneme.");
    syllables.push(ids); marks.push(mark);
  }
  if (marks.filter((mark) => mark === "ˈ").length > 1) fail("A word can have only one primary stress mark.");
  const segments = validateSegments(syllables.flat(), language, phonemes);
  const ipa = syllables.map((syllable, i) => marks[i] + syllable.map((id) => inv.byId.get(id).symbol).join("")).join(".");
  return { segments, syllables, ipa, stressIndex: marks.indexOf("ˈ") };
}

function literal(value, language, phonemes, label, allowEmpty = true) {
  const source = norm(value ?? "", label);
  if (!source) return allowEmpty ? [] : fail(`${label} cannot be empty.`);
  if (/[.·ˈˌ/\[\]]/u.test(source)) fail(`${label} must be a phoneme sequence without syllable or stress marks.`);
  return parseIPA(source, language, phonemes).segments;
}

/** Contexts are adjacent sequences: IPA symbols, sound classes, and an outer word boundary. */
function context(value, side, language, phonemes) {
  const source = norm(value ?? "", `${side} context`, 512);
  if (!source) return [];
  const { bySymbol, classes, selectedIds } = inventory(language, phonemes);
  const tokens = source.split(/\s+/u);
  return tokens.map((token, index) => {
    if (token === "#") {
      if ((side === "before" && index !== 0) || (side === "after" && index !== tokens.length - 1)) fail("Use # only at the outer word boundary: first in Before or last in After.");
      return { boundary: true };
    }
    if (/^[A-Z]$/u.test(token)) {
      const members = classes[token];
      if (!Array.isArray(members) || !members.length) fail(`Class ${token} has no sounds.`);
      if (members.some((id) => !selectedIds.has(id))) fail(`Class ${token} contains a sound outside this language’s inventory.`);
      return { ids: new Set(members) };
    }
    const id = bySymbol.get(token);
    if (id === undefined) fail(`“${token}” is not a selected IPA symbol or sound class. Separate context phonemes with spaces.`);
    return { ids: new Set([id]) };
  });
}
function matchesContext(segments, tokens, edge, side) {
  const boundary = tokens.some((token) => token.boundary);
  const sounds = tokens.filter((token) => !token.boundary);
  const start = side === "before" ? edge - sounds.length : edge;
  if (start < 0 || start + sounds.length > segments.length) return false;
  if (boundary && (side === "before" ? start !== 0 : start + sounds.length !== segments.length)) return false;
  return sounds.every((token, i) => token.ids.has(segments[start + i]));
}

export function validateOrthographyRules(rules, language, phonemes) {
  if (!Array.isArray(rules) || rules.length > 256) fail("Orthography rules must be an array with at most 256 rules.");
  const seen = new Set();
  return rules.map((rule, i) => {
    if (!rule || typeof rule !== "object") fail(`Spelling rule ${i + 1} must be an object.`);
    const id = norm(rule.id, "Spelling rule ID", 200);
    if (!/^[A-Za-z0-9_.:-]+$/u.test(id) || seen.has(id)) fail("Spelling rule IDs must be unique ASCII identifiers.");
    seen.add(id);
    const name = norm(rule.name, "Spelling rule name", 160);
    if (!name) fail("Spelling rule name cannot be empty.");
    const from = norm(rule.from, "Spelling rule phonemes", 1000);
    const to = norm(rule.to, "Spelling rule output", 100);
    if (!to) fail("Spelling rule output cannot be empty; silent spellings are not supported.");
    literal(from, language, phonemes, "Spelling rule phonemes", false);
    const before = norm(rule.before ?? "", "Before context", 512);
    const after = norm(rule.after ?? "", "After context", 512);
    context(before, "before", language, phonemes); context(after, "after", language, phonemes);
    return { id, name, from, to, before, after };
  });
}

function compileSpelling(language, phonemes) {
  const inv = inventory(language, phonemes);
  const defaults = new Map(inv.selected.map((p) => {
    const spelling = norm(language.orthography?.[p.id] ?? p.symbol, "Spelling mapping", 100);
    if (!spelling) fail("Spelling mapping cannot be empty.");
    return [p.id, spelling];
  }));
  const rules = validateOrthographyRules(language.orthographyRules ?? [], language, phonemes).map((rule) => ({
    ...rule,
    input: literal(rule.from, language, phonemes, "Spelling rule phonemes", false),
    left: context(rule.before, "before", language, phonemes),
    right: context(rule.after, "after", language, phonemes),
  }));
  function spell(segments) {
    let output = "";
    for (let index = 0; index < segments.length;) {
      const rule = rules.find((r) => at(segments, r.input, index) && matchesContext(segments, r.left, index, "before") && matchesContext(segments, r.right, index + r.input.length, "after"));
      if (rule) { output += rule.to; index += rule.input.length; }
      else { output += defaults.get(segments[index]); index++; }
    }
    return output.normalize("NFC");
  }
  return { spell, rules, defaults, inv };
}

/** Contexts inspect the unchanged complete phoneme sequence; replacement text is never reprocessed. */
export function compileOrthography(language, phonemes) {
  const compiled = compileSpelling(language, phonemes);
  return (segments) => { validateSegments(segments, language, phonemes); return compiled.spell(segments); };
}

export function spellPhonemes(segments, language, phonemes) {
  validateSegments(segments, language, phonemes);
  return compileSpelling(language, phonemes).spell(segments);
}

export function renderPhonemes(segments, language, phonemes, options = {}) {
  segments = validateSegments(segments, language, phonemes);
  const inv = inventory(language, phonemes);
  const syllables = options.syllables ? options.syllables.map((s) => validateSegments(s, language, phonemes, "Syllable")) : [segments];
  if (!same(syllables.flat(), segments)) fail("Syllables must contain the pronunciation's phonemes in order.");
  const stress = options.stress ? language.phonotactics?.stress : "none";
  const stressIndex = stress === "initial" ? 0 : stress === "final" ? syllables.length - 1 : stress === "penultimate" ? Math.max(0, syllables.length - 2) : -1;
  const ipa = syllables.map((s, i) => `${i === stressIndex ? "ˈ" : ""}${s.map((id) => inv.byId.get(id).symbol).join("")}`).join(".");
  return { word: spellPhonemes(segments, language, phonemes), ipa, segments, syllables };
}

/** Enumerate bounded inverse candidates, then verify every result with the contextual forward renderer. */
export function analyzeSpelling(value, language, phonemes) {
  const source = norm(value, "Spelling", 1000);
  if (!source) return { candidates: [], ambiguous: false, truncated: false };
  const compiled = compileSpelling(language, phonemes);
  const tiles = [...compiled.defaults].map(([id, to]) => ({ input: [id], to }));
  tiles.push(...compiled.rules.map((r) => ({ input: r.input, to: r.to })));
  const seenTiles = new Set(), uniqueTiles = tiles.filter((tile) => { const key = JSON.stringify(tile); if (seenTiles.has(key)) return false; seenTiles.add(key); return true; });
  const queue = [{ offset: 0, segments: [] }], candidates = [], seen = new Set();
  let visited = 0, truncated = false;
  while (queue.length) {
    if (++visited > 20000 || candidates.length >= 32) { truncated = true; break; }
    const state = queue.pop();
    if (state.offset === source.length) {
      if (compiled.spell(state.segments) !== source) continue;
      const key = JSON.stringify(state.segments);
      if (!seen.has(key)) { seen.add(key); candidates.push(renderPhonemes(state.segments, language, phonemes)); }
      continue;
    }
    for (const tile of uniqueTiles) if (source.startsWith(tile.to, state.offset)) {
      const segments = [...state.segments, ...tile.input];
      if (segments.length > MAX_SEGMENTS) { truncated = true; continue; }
      if (queue.length >= 5000) { truncated = true; continue; }
      queue.push({ offset: state.offset + tile.to.length, segments });
    }
  }
  return { candidates, ambiguous: candidates.length > 1, truncated };
}

const STEP_KINDS = ["prefix", "suffix", "infix", "circumfix", "reduplication", "replace-prefix", "replace-suffix", "replace-all", "replace-whole"];
const CONDITIONS = ["always", "vowel-final", "consonant-final", "starts-with", "ends-with", "contains", "not-starts-with", "not-ends-with"];
function compileSteps(steps, language, phonemes) {
  if (!Array.isArray(steps) || steps.length > 64) fail("A form can contain at most 64 phoneme operations.");
  return steps.map((step, index) => {
    if (!step || !STEP_KINDS.includes(step.kind)) fail(`Unknown phoneme operation “${step?.kind}”.`);
    const condition = step.condition ?? "always";
    if (!CONDITIONS.includes(condition)) fail(`Unknown phoneme condition “${condition}”.`);
    const from = literal(step.from ?? "", language, phonemes, `Operation ${index + 1} match`, !step.kind.startsWith("replace-"));
    const to = literal(step.to ?? "", language, phonemes, `Operation ${index + 1} output`);
    if (["prefix", "suffix", "infix"].includes(step.kind) && !to.length) fail(`Operation ${index + 1}: an affix needs at least one phoneme.`);
    if (step.kind === "circumfix" && (!from.length || !to.length)) fail(`Operation ${index + 1}: a circumfix needs both a prefix and a suffix.`);
    const needsTest = !["always", "vowel-final", "consonant-final"].includes(condition);
    const test = needsTest ? context(step.test ?? "", condition.includes("ends-with") ? "before" : "after", language, phonemes) : [];
    if (needsTest && !test.length) fail(`Operation ${index + 1}: this condition needs a phoneme sequence or class.`);
    if (test.some((token) => token.boundary)) fail("Use starts-with or ends-with for operation boundaries; # is for orthography contexts.");
    return { ...step, condition, from, to, test };
  });
}
export function validatePhonemeSteps(steps, language, phonemes) {
  compileSteps(steps, language, phonemes);
  return steps;
}
function testCondition(segments, step, inv) {
  const match = (start) => start >= 0 && start + step.test.length <= segments.length && step.test.every((token, i) => token.ids.has(segments[start + i]));
  switch (step.condition) {
    case "always": return true;
    case "vowel-final": return inv.byId.get(segments.at(-1))?.type === "vowel";
    case "consonant-final": return segments.length > 0 && inv.byId.get(segments.at(-1))?.type !== "vowel";
    case "starts-with": return match(0);
    case "ends-with": return match(segments.length - step.test.length);
    case "contains": return segments.some((_, i) => match(i));
    case "not-starts-with": return !match(0);
    case "not-ends-with": return !match(segments.length - step.test.length);
  }
}

export function applyPhonemeSteps(input, steps, language, phonemes) {
  let result = validateSegments(input, language, phonemes);
  const inv = inventory(language, phonemes);
  for (const step of compileSteps(steps, language, phonemes)) {
    if (!testCondition(result, step, inv)) continue;
    switch (step.kind) {
      case "prefix": result = [...step.to, ...result]; break;
      case "suffix": result = [...result, ...step.to]; break;
      case "infix": result = [result[0], ...step.to, ...result.slice(1)]; break;
      case "circumfix": result = [...step.from, ...result, ...step.to]; break;
      case "reduplication": result = [...result, ...step.to, ...result]; break;
      case "replace-prefix": if (at(result, step.from, 0)) result = [...step.to, ...result.slice(step.from.length)]; break;
      case "replace-suffix": if (at(result, step.from, result.length - step.from.length)) result = [...result.slice(0, -step.from.length), ...step.to]; break;
      case "replace-whole": if (same(result, step.from)) result = [...step.to]; break;
      case "replace-all": {
        const next = [];
        for (let i = 0; i < result.length;) {
          if (at(result, step.from, i)) { next.push(...step.to); i += step.from.length; }
          else { next.push(result[i]); i++; }
        }
        result = next; break;
      }
    }
    if (!result.length) fail("A phoneme operation removed the entire pronunciation; omit this form explicitly instead.");
    if (result.length > MAX_SEGMENTS) fail(`Inflection exceeds ${MAX_SEGMENTS} phonemes.`);
  }
  return result;
}
