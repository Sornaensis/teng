/** Pure, dependency-free language construction and interchange primitives. */
import {
  cloneInflectionData,
  createParadigmTemplate,
  normalizeInflectionEntry,
  validateInflectionLanguage,
} from "./inflection.js";
import {
  compilePhonotactics,
  validatePhonotacticExtras,
  weightedSoundChoice,
  parseSyllablePattern,
  compileWordPhonotactics,
  analyzePhonemeForm,
} from "./phonotactics.js";

import {
  parseIPA,
  validateSegments,
  validateOrthographyRules,
  validatePhonemeSteps,
  compileOrthography,
  renderPhonemes,
  applyPhonemeSteps,
} from "./phonology.js";

import { validateGrammarOrders } from "./grammar.js";

export const SCHEMA_VERSION = 3;
export const LIMITS = Object.freeze({
  families: 1000,
  languages: 2000,
  lexicon: 100000,
  patterns: 64,
  syllables: 12,
  generation: 5000,
});

export function uid(prefix = "id") {
  const value =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const fail = (message) => {
  throw new Error(message);
};

function text(value, label, max = 1000, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") fail(`${label} must be text.`);
  if (value.length > max)
    fail(`${label} exceeds ${max.toLocaleString("en")} characters.`);
  return value.normalize("NFC");
}
function requiredText(value, label, max = 160) {
  const result = text(value, label, max).trim();
  if (!result) fail(`${label} cannot be empty.`);
  return result;
}
function identifier(value, label) {
  const result = requiredText(value, label, 200);
  if (!/^[A-Za-z0-9_.:-]+$/u.test(result))
    fail(
      `${label} may contain only ASCII letters, digits, periods, colons, underscores and hyphens.`,
    );
  return result;
}
function list(value, label, max) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  if (value.length > max)
    fail(
      `${label} has too many entries (maximum ${max.toLocaleString("en")}).`,
    );
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(`${label} must be a whole number between ${min} and ${max}.`);
  return value;
}
function option(value, allowed, label, fallback) {
  value = value ?? fallback;
  if (!allowed.includes(value))
    fail(`${label} must be one of: ${allowed.join(", ")}.`);
  return value;
}
function uniqueIds(items, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.id))
      fail(`${label} contains the duplicate ID “${item.id}”.`);
    seen.add(item.id);
  }
  return seen;
}

/** Parent/source inheritance is a deep snapshot; subsequent edits are independent. */
export function createLanguage(
  { name = "Untitled language", familyId, parentId, source = null } = {},
  phonemes = [],
) {
  const bySymbol = new Map(phonemes.map((p) => [p.symbol, p.id]));
  if (!bySymbol.has("g") && bySymbol.has("ɡ"))
    bySymbol.set("g", bySymbol.get("ɡ"));
  const pick = (symbols) =>
    symbols
      .split(" ")
      .map((s) => bySymbol.get(s))
      .filter(Boolean);
  const phonemeIds = pick("p b t d k g m n ŋ f s z ʃ h l r j w i e a o u");
  const orthography = Object.fromEntries(
    phonemes
      .filter((p) => phonemeIds.includes(p.id))
      .map((p) => [
        p.id,
        { ɡ: "g", ŋ: "ng", ʃ: "sh", j: "y" }[p.symbol] ?? p.symbol,
      ]),
  );
  const soundClasses = Object.fromEntries(
    [
      ["N", pick("m n ŋ")],
      ["L", pick("l r")],
      ["S", pick("s z ʃ f")],
    ].filter(([, ids]) => ids.length),
  );
  const base = source
    ? clone(source)
    : {
        description: "",
        phonemeIds,
        orthography,
        orthographyRules: [],
        soundClasses,
        phonotactics: {
          patterns: [
            { pattern: "CV", weight: 5 },
            { pattern: "CVC", weight: 2 },
            { pattern: "V", weight: 1 },
          ],
          minSyllables: 2,
          maxSyllables: 3,
          stress: "penultimate",
          banned: [],
          optionalProbability: 0.5,
          phonemeWeights: {},
          constraints: [],
        },
        morphemes: [],
        morphologyRules: [],
        paradigms: [],
        grammar: {
          wordOrder: "SOV",
          adposition: "Postpositions",
          adjectiveOrder: "Before noun",
          possessorOrder: "Before noun",
          description: "",
        },
        lexicon: [],
      };
  base.phonotactics = {
    ...base.phonotactics,
    ...validatePhonotacticExtras(base.phonotactics, base, phonemes),
  };
  base.phonotactics.constraints = base.phonotactics.constraints.map(
    (constraint) => ({ ...constraint, id: uid("constraint") }),
  );
  const inflectionData = cloneInflectionData(base, uid);
  return {
    ...base,
    id: uid("language"),
    name: requiredText(name, "Language name"),
    familyId: familyId ?? source?.familyId ?? "",
    parentId: parentId !== undefined ? parentId : (source?.id ?? null),
    orthographyRules: base.orthographyRules.map((r) => ({ ...r, id: uid("spelling") })),
    morphemes: base.morphemes.map((m) => ({ ...m, id: uid("morpheme") })),
    morphologyRules: base.morphologyRules.map((r) => ({
      ...r,
      id: uid("rule"),
    })),
    ...inflectionData,
  };
}

export function createWorkspace(phonemes = []) {
  const family = {
    id: uid("family"),
    name: "Aurelian",
    description:
      "An example language family. Make it your own, or create a new family.",
  };
  const proto = createLanguage(
    { name: "Proto-Aru", familyId: family.id },
    phonemes,
  );
  proto.description = "The reconstructed ancestor of this example family.";
  const selari = createLanguage(
    { name: "Selari", familyId: family.id, source: proto },
    phonemes,
  );
  selari.description =
    "A sample language with open syllables, flowing liquids, and penultimate stress.";
  selari.phonotactics.patterns = [
    { pattern: "CV", weight: 6 },
    { pattern: "CVC", weight: 1 },
    { pattern: "V", weight: 1 },
  ];
  selari.phonotactics.maxSyllables = 4;
  // Tiny test inventories still produce a valid editable starting state.
  if (!selari.soundClasses.N?.length)
    selari.phonotactics.patterns = [{ pattern: "CV", weight: 1 }];
  const now = new Date().toISOString();
  selari.lexicon = [
    [
      "sela",
      "ˈse.la",
      "star",
      "A luminous body visible in the night sky.",
      "noun",
    ],
    [
      "nari",
      "ˈna.ri",
      "water",
      "The liquid used for drinking and necessary for life.",
      "noun",
    ],
    [
      "kora",
      "ˈko.ra",
      "tree",
      "A perennial plant with a woody trunk and branches.",
      "noun",
    ],
    [
      "tali",
      "ˈta.li",
      "stone",
      "A small piece of naturally occurring rock.",
      "noun",
    ],
    ["mira", "ˈmi.ra", "person", "An individual human being.", "noun"],
    [
      "aru",
      "ˈa.ru",
      "sun",
      "The star that provides a world with light and heat.",
      "noun",
    ],
    [
      "luma",
      "ˈlu.ma",
      "moon",
      "A natural satellite orbiting a planet.",
      "noun",
    ],
    [
      "sori",
      "ˈso.ri",
      "speak",
      "To express thoughts or meanings through spoken language.",
      "verb",
    ],
  ].map(([word, ipa, gloss, definition, pos]) => ({
    id: uid("entry"),
    word,
    ipa,
    gloss,
    definition,
    pos,
    tags: ["example"],
    conceptId: null,
    notes: "",
    createdAt: now,
  }));
  selari.morphemes = [
    {
      id: uid("morpheme"),
      form: "na",
      meaning: "plural",
      pos: "noun",
      type: "suffix",
    },
    {
      id: uid("morpheme"),
      form: "ta",
      meaning: "past",
      pos: "verb",
      type: "prefix",
    },
  ];
  selari.morphologyRules = [
    {
      id: uid("rule"),
      name: "Noun plural",
      pos: "noun",
      kind: "suffix",
      form: "na",
      secondForm: "",
      feature: "plural",
      condition: "always",
    },
    {
      id: uid("rule"),
      name: "Past tense",
      pos: "verb",
      kind: "prefix",
      form: "ta",
      secondForm: "",
      feature: "past",
      condition: "always",
    },
  ];
  selari.grammar.description =
    "Subjects precede objects, and verbs close the clause. Adjectives and possessors precede the noun. The example plural suffix is -na.";
  const nounParadigm = createParadigmTemplate("declension");
  nounParadigm.name = "Regular nouns";
  nounParadigm.description =
    "Example endings: plural -na, accusative -m, genitive -ri; case follows number.";
  const suffix = (to) => ({
    kind: "suffix",
    from: "",
    to,
    condition: "always",
    test: "",
  });
  for (const slot of nounParadigm.slots) {
    if (slot.features.number === "pl") slot.steps.push(suffix("na"));
    if (slot.features.case === "acc") slot.steps.push(suffix("m"));
    if (slot.features.case === "gen") slot.steps.push(suffix("ri"));
  }
  const verbParadigm = createParadigmTemplate("conjugation");
  verbParadigm.name = "Regular verbs";
  verbParadigm.description =
    "Example conjugation: past ta-, followed by person and number endings.";
  const personEndings = {
    "1-sg": "m",
    "2-sg": "s",
    "3-sg": "",
    "1-pl": "mi",
    "2-pl": "si",
    "3-pl": "n",
  };
  for (const slot of verbParadigm.slots) {
    if (slot.features.tense === "past")
      slot.steps.push({
        kind: "prefix",
        from: "",
        to: "ta",
        condition: "always",
        test: "",
      });
    const ending =
      personEndings[`${slot.features.person}-${slot.features.number}`];
    if (ending) slot.steps.push(suffix(ending));
  }
  selari.paradigms = [nounParadigm, verbParadigm];
  selari.lexicon = selari.lexicon.map((entry) => ({
    ...entry,
    entryType: "lexeme",
    paradigmId: entry.pos === "noun" ? nounParadigm.id : verbParadigm.id,
    stems: {},
    overrides: {},
    source: null,
  }));
  selari.lexicon = selari.lexicon.filter((entry) => {
    try { parseIPA(entry.ipa, selari, phonemes); return true; } catch { return false; }
  });
  selari.morphemes = selari.morphemes.filter((m) => {
    try { parseIPA(m.form, selari, phonemes); return true; } catch { return false; }
  });
  selari.morphologyRules = selari.morphologyRules.filter((r) => {
    try { validatePhonemeSteps([{ kind: r.kind, to: r.form }], selari, phonemes); return true; } catch { return false; }
  });
  selari.paradigms = selari.paradigms.filter((paradigm) => {
    try { for (const slot of paradigm.slots) validatePhonemeSteps(slot.steps, selari, phonemes); return true; } catch { return false; }
  });
  for (const entry of selari.lexicon)
    if (!selari.paradigms.some((p) => p.id === entry.paradigmId)) entry.paradigmId = null;
  const velan = createLanguage(
    { name: "Velan", familyId: family.id, source: proto },
    phonemes,
  );
  velan.description =
    "A sister language, ready to develop in a different direction.";
  velan.phonotactics.stress = "initial";
  return validateWorkspace({
    schemaVersion: SCHEMA_VERSION,
    id: uid("workspace"),
    name: "My language workshop",
    families: [family],
    languages: [proto, selari, velan],
  }, phonemes);
}

/** One parser shared by sampling and the full phonotactics checker. */
export const parsePattern = parseSyllablePattern;

function randomFromSeed(seed) {
  let value = 2166136261;
  for (const ch of String(seed)) {
    value ^= ch.codePointAt(0);
    value = Math.imul(value, 16777619);
  }
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateWords(
  language,
  phonemes,
  {
    count = 12,
    seed = `${Date.now()}-${Math.random()}`,
    minSyllables,
    maxSyllables,
  } = {},
) {
  integer(count, "Number of words", 1, LIMITS.generation);
  const byId = new Map(phonemes.map((p) => [p.id, p]));
  const selected = new Set(language.phonemeIds);
  for (const id of selected)
    if (!byId.has(id)) fail(`Unknown sound “${id}” in the inventory.`);
  const spell = compileOrthography(language, phonemes);
  const classes = {
    ...language.soundClasses,
    C: phonemes
      .filter((p) => selected.has(p.id) && p.type !== "vowel")
      .map((p) => p.id),
    V: phonemes
      .filter((p) => selected.has(p.id) && p.type === "vowel")
      .map((p) => p.id),
  };
  const phonotactics = language.phonotactics;
  const minimum = integer(
    minSyllables ?? phonotactics.minSyllables,
    "Minimum syllables",
    1,
    LIMITS.syllables,
  );
  const maximum = integer(
    maxSyllables ?? phonotactics.maxSyllables,
    "Maximum syllables",
    minimum,
    LIMITS.syllables,
  );
  const stress = option(
    phonotactics.stress,
    ["initial", "penultimate", "final", "none"],
    "Stress",
    "none",
  );
  const patterns = list(
    phonotactics.patterns,
    "Syllable patterns",
    LIMITS.patterns,
  ).map(({ pattern, weight = 1 }) => {
    if (!Number.isFinite(weight) || weight <= 0 || weight > 10000)
      fail(
        "Pattern weights must be greater than zero and no more than 10,000.",
      );
    const nodes = parsePattern(pattern);
    function check(items) {
      for (const item of items) {
        if (item.kind === "optional") check(item.children);
        else {
          const members = classes[item.name];
          if (!Array.isArray(members) || !members.length)
            fail(
              `Class ${item.name} has no sounds. Select its sounds or change the syllable pattern.`,
            );
          for (const id of members)
            if (!selected.has(id) || !byId.has(id))
              fail(
                `Class ${item.name} contains a sound outside this language’s inventory.`,
              );
        }
      }
    }
    check(nodes);
    return { nodes, weight };
  });
  if (!patterns.length)
    fail("Add at least one syllable pattern before generating words.");
  const bans = (phonotactics.banned ?? [])
    .map((b) => text(b, "Forbidden sound sequence", 64))
    .filter(Boolean);
  const checkPhonotactics = compilePhonotactics(language, phonemes);
  const random = randomFromSeed(seed);
  const totalWeight = patterns.reduce(
    (total, pattern) => total + pattern.weight,
    0,
  );
  function choosePattern() {
    let target = random() * totalWeight;
    for (const pattern of patterns) {
      target -= pattern.weight;
      if (target < 0) return pattern.nodes;
    }
    return patterns.at(-1).nodes;
  }
  function expand(nodes) {
    return nodes.flatMap((node) =>
      node.kind === "optional"
        ? random() < checkPhonotactics.extras.optionalProbability
          ? expand(node.children)
          : []
        : [
            weightedSoundChoice(
              classes[node.name],
              checkPhonotactics.extras.phonemeWeights,
              random,
            ),
          ],
    );
  }
  const key = (word) => word.normalize("NFC").toLowerCase();
  const used = new Set(
    (language.lexicon ?? []).map((entry) => key(entry.word)),
  );
  const words = [];
  const constraintFailures = new Map();
  const attemptsLimit = Math.min(300000, Math.max(1000, count * 120));
  let attempts = 0;
  while (words.length < count && attempts++ < attemptsLimit) {
    const syllableCount =
      minimum + Math.floor(random() * (maximum - minimum + 1));
    const syllables = Array.from({ length: syllableCount }, () =>
      expand(choosePattern()),
    );
    // An omitted all-optional syllable does not count as a syllable.
    if (syllables.some((syllable) => !syllable.length)) continue;
    const constraintResult = checkPhonotactics(syllables);
    if (!constraintResult.ok) {
      for (const reason of constraintResult.reasons)
        constraintFailures.set(
          reason,
          (constraintFailures.get(reason) ?? 0) + 1,
        );
      continue;
    }
    const segments = syllables.flat();
    const symbols = segments
      .map((id) => byId.get(id).symbol)
      .join("")
      .normalize("NFC");
    if (bans.some((ban) => symbols.includes(ban))) continue;
    const word = spell(segments);
    if (!word.trim() || used.has(key(word))) continue;
    const stressIndex =
      stress === "initial"
        ? 0
        : stress === "final"
          ? syllables.length - 1
          : stress === "penultimate"
            ? Math.max(0, syllables.length - 2)
            : -1;
    const ipa = syllables
      .map(
        (syllable, index) =>
          `${index === stressIndex ? "ˈ" : ""}${syllable.map((id) => byId.get(id).symbol).join("")}`,
      )
      .join(".");
    used.add(key(word));
    words.push({ word, ipa, segments, syllables });
  }
  const warnings =
    words.length < count
      ? [
          `Generated ${words.length} of ${count} unique words. The inventory, patterns, forbidden sequences, or existing lexicon may leave too few possibilities; broaden them or request fewer words.`,
        ]
      : [];
  if (words.length < count && constraintFailures.size) {
    for (const [reason, rejected] of [...constraintFailures]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3))
      warnings.push(`${reason} Rejected ${rejected} sampled candidates.`);
  }
  return { words, warnings };
}

/** Apply one derivational rule to explicit phonemes, then render contextual orthography. */
export function applyMorphology(base, rule, language, phonemes) {
  if (!record(rule)) fail("A morphology rule is required.");
  if (!language || !Array.isArray(phonemes)) fail("A language and sound inventory are required for morphology.");
  if (record(base) && rule.pos && rule.pos !== "any" && base.pos && base.pos !== rule.pos)
    fail(`This rule applies to ${rule.pos}; the selected lexeme is ${base.pos}.`);
  const pronunciation = typeof base === "string"
    ? parseIPA(base, language, phonemes)
    : base?.segments?.length
      ? { segments: validateSegments(base.segments, language, phonemes), syllables: base.syllables, ipa: base.ipa }
      : parseIPA(base?.ipa ?? "", language, phonemes);
  const kind = option(rule.kind, ["prefix", "suffix", "infix", "circumfix", "reduplication"], "Morphology operation");
  const condition = option(rule.condition, ["always", "vowel-final", "consonant-final"], "Rule condition", "always");
  const step = {
    kind,
    from: kind === "circumfix" ? rule.form : "",
    to: kind === "circumfix" ? rule.secondForm ?? "" : rule.form ?? "",
    condition,
    test: "",
  };
  const segments = applyPhonemeSteps(pronunciation.segments, [step], language, phonemes);
  const unchanged = segments.length === pronunciation.segments.length && segments.every((id, i) => id === pronunciation.segments[i]);
  let result = renderPhonemes(segments, language, phonemes, unchanged && pronunciation.syllables?.length ? { syllables: pronunciation.syllables } : {});
  let phonotactics;
  if (unchanged && pronunciation.ipa) {
    result.ipa = pronunciation.ipa;
    const stressIndex = parseIPA(result.ipa, language, phonemes).stressIndex;
    const check = compileWordPhonotactics(language, phonemes)(result.syllables, stressIndex < 0 ? {} : { stressIndex });
    phonotactics = {
      status: check.ok ? "unique" : "invalid", ok: check.ok,
      candidates: check.ok ? [{ syllables: result.syllables, ipa: result.ipa, stressIndex, syllablePatterns: check.syllablePatterns }] : [],
      syllables: check.ok ? result.syllables : null,
      ambiguous: false, truncated: false, reasons: check.reasons, supplied: true,
    };
  } else {
    phonotactics = analyzePhonemeForm(segments, language, phonemes);
    if (phonotactics.status === "unique")
      result = renderPhonemes(segments, language, phonemes, { syllables: phonotactics.syllables, stress: true });
  }
  return { ...result, phonotactics };
}

function validateEntry(entry, label, language, phonemes) {
  if (!record(entry)) fail(`${label} must be an object.`);
  const createdAt = text(entry.createdAt, `${label} creation date`, 50, "");
  if (createdAt && !Number.isFinite(Date.parse(createdAt)))
    fail(`${label} has an invalid creation date.`);
  let pronunciation = {};
  let ipa = text(entry.ipa, `${label} IPA`, 2000, "");
  if (language) {
    const parsed = ipa.trim() ? parseIPA(ipa, language, phonemes) : null;
    const segments = entry.segments?.length
      ? validateSegments(entry.segments, language, phonemes, `${label} phonemes`)
      : parsed?.segments ?? [];
    if (entry.segments !== undefined && !Array.isArray(entry.segments)) fail(`${label} phonemes must be an array.`);
    if (entry.syllables !== undefined && !Array.isArray(entry.syllables)) fail(`${label} syllables must be an array.`);
    if (parsed && (parsed.segments.length !== segments.length || parsed.segments.some((id, i) => id !== segments[i])))
      fail(`${label} IPA and stored phonemes disagree. Update the pronunciation together.`);
    const syllables = entry.syllables?.length ? entry.syllables.map((s) => validateSegments(s, language, phonemes, `${label} syllable`)) : parsed?.syllables ?? (segments.length ? [segments] : []);
    const flat = syllables.flat();
    if (flat.length !== segments.length || flat.some((id, i) => id !== segments[i])) fail(`${label} syllables do not match its phonemes.`);
    if (parsed && JSON.stringify(parsed.syllables) !== JSON.stringify(syllables)) fail(`${label} IPA and stored syllable boundaries disagree.`);
    // Canonical phonemes already specify a pronunciation. Fill its display form
    // without assigning stress, so a later text edit cannot erase known sounds.
    if (!ipa.trim() && segments.length)
      ipa = text(renderPhonemes(segments, language, phonemes, { syllables }).ipa, `${label} IPA`, 2000);
    pronunciation = { segments, syllables };
  }
  if (entry.spellingOverride !== undefined && typeof entry.spellingOverride !== "boolean") fail(`${label} spelling override must be true or false.`);
  return {
    id: identifier(entry.id, `${label} ID`),
    word: requiredText(entry.word, `${label} word`, 1000),
    ipa,
    ...pronunciation,
    spellingOverride: entry.spellingOverride ?? false,
    gloss: requiredText(entry.gloss, `${label} gloss`, 1000),
    definition: text(entry.definition, `${label} definition`, 20000, ""),
    pos: text(entry.pos, `${label} part of speech`, 100, "noun"),
    tags: list(entry.tags ?? [], `${label} tags`, 100).map((tag) =>
      text(tag, `${label} tag`, 100),
    ),
    conceptId:
      entry.conceptId === null || entry.conceptId === undefined
        ? null
        : identifier(entry.conceptId, `${label} concept ID`),
    notes: text(entry.notes, `${label} notes`, 20000, ""),
    createdAt,
    ...normalizeInflectionEntry(entry),
  };
}

/** Validate and construct known fields; do not mutate input or execute import text. */
export function validateWorkspace(input, phonemes = []) {
  if (!record(input)) fail("The backup must contain a workspace object.");
  if (input.schemaVersion !== SCHEMA_VERSION)
    fail(
      `Unsupported backup version ${String(input.schemaVersion)}. This app requires version ${SCHEMA_VERSION}.`,
    );
  const phonemeIds = new Set(phonemes.map((p) => p.id));
  const families = list(input.families, "Families", LIMITS.families).map(
    (family, i) => {
      if (!record(family)) fail(`Family ${i + 1} must be an object.`);
      return {
        id: identifier(family.id, "Family ID"),
        name: requiredText(family.name, "Family name"),
        description: text(family.description, "Family description", 20000, ""),
      };
    },
  );
  if (!families.length)
    fail("A workspace must contain at least one language family.");
  const familyIds = uniqueIds(families, "Families");
  let entryCount = 0;
  const languages = list(input.languages, "Languages", LIMITS.languages).map(
    (language, i) => {
      if (!record(language)) fail(`Language ${i + 1} must be an object.`);
      const name = requiredText(language.name, "Language name");
      const inventory = [
        ...new Set(
          list(language.phonemeIds, `${name} inventory`, 1000).map((id) => {
            id = identifier(id, "Phoneme ID");
            if (!phonemeIds.has(id))
              fail(`${name} refers to unknown sound “${id}”.`);
            return id;
          }),
        ),
      ];
      const selected = new Set(inventory);
      if (!record(language.orthography))
        fail(`${name} orthography must be an object.`);
      const orthography = Object.fromEntries(
        Object.entries(language.orthography).map(([id, spelling]) => {
          if (!phonemeIds.has(id))
            fail(
              `${name} has an orthography mapping for unknown sound “${id}”.`,
            );
          return [id, requiredText(spelling, `${name} spelling`, 100)];
        }),
      );
      if (!record(language.soundClasses ?? {}))
        fail(`${name} sound classes must be an object.`);
      const soundClasses = Object.fromEntries(
        Object.entries(language.soundClasses ?? {}).map(([key, value]) => {
          if (!/^[A-Z]$/u.test(key) || key === "C" || key === "V")
            fail(
              `Custom sound classes must use one uppercase letter other than C or V (received “${key}”).`,
            );
          return [
            key,
            [
              ...new Set(
                list(value, `Class ${key}`, 1000).map((id) => {
                  if (typeof id !== "string" || !selected.has(id))
                    fail(
                      `Class ${key} in ${name} contains a sound outside its inventory.`,
                    );
                  return id;
                }),
              ),
            ],
          ];
        }),
      );
      const ph = language.phonotactics;
      if (!record(ph)) fail(`${name} phonotactics must be an object.`);
      const minSyllables = integer(
        ph.minSyllables,
        "Minimum syllables",
        1,
        LIMITS.syllables,
      );
      const maxSyllables = integer(
        ph.maxSyllables,
        "Maximum syllables",
        minSyllables,
        LIMITS.syllables,
      );
      const patterns = list(
        ph.patterns,
        "Syllable patterns",
        LIMITS.patterns,
      ).map((item) => {
        if (!record(item)) fail("Each syllable pattern must be an object.");
        const pattern = requiredText(item.pattern, "Syllable pattern", 64);
        parsePattern(pattern);
        const weight = item.weight ?? 1;
        if (!Number.isFinite(weight) || weight <= 0 || weight > 10000)
          fail(
            "Pattern weights must be greater than zero and no more than 10,000.",
          );
        return { pattern, weight };
      });
      const phonotactics = {
        patterns,
        minSyllables,
        maxSyllables,
        stress: option(
          ph.stress,
          ["initial", "penultimate", "final", "none"],
          "Stress",
          "none",
        ),
        banned: list(ph.banned ?? [], "Forbidden sound sequences", 1000).map(
          (b) => text(b, "Forbidden sound sequence", 64),
        ),
        ...validatePhonotacticExtras(
          ph,
          { phonemeIds: inventory, soundClasses },
          phonemes,
        ),
      };
      const phonologicalLanguage = { phonemeIds: inventory, orthography, soundClasses, phonotactics };
      const orthographyRules = validateOrthographyRules(language.orthographyRules, phonologicalLanguage, phonemes);
      phonologicalLanguage.orthographyRules = orthographyRules;
      const morphemes = list(language.morphemes ?? [], "Morphemes", 10000).map(
        (m) => {
          if (!record(m)) fail("Each morpheme must be an object.");
          parseIPA(m.form, phonologicalLanguage, phonemes);
          return {
            id: identifier(m.id, "Morpheme ID"),
            form: requiredText(m.form, "Morpheme form", 1000),
            meaning: requiredText(m.meaning, "Morpheme meaning", 2000),
            pos: text(m.pos, "Morpheme part of speech", 100, "noun"),
            type: option(
              m.type,
              ["root", "prefix", "suffix", "infix", "circumfix"],
              "Morpheme type",
              "root",
            ),
          };
        },
      );
      uniqueIds(morphemes, `${name} morphemes`);
      const morphologyRules = list(
        language.morphologyRules ?? [],
        "Morphology rules",
        10000,
      ).map((r) => {
        if (!record(r)) fail("Each morphology rule must be an object.");
        return {
          id: identifier(r.id, "Rule ID"),
          name: requiredText(r.name, "Rule name"),
          pos: text(r.pos, "Rule part of speech", 100, "noun"),
          kind: option(
            r.kind,
            ["prefix", "suffix", "infix", "circumfix", "reduplication"],
            "Morphology operation",
          ),
          form: text(r.form, "Rule form", 1000, ""),
          secondForm: text(r.secondForm, "Second rule form", 1000, ""),
          feature: text(r.feature, "Rule feature", 1000, ""),
          condition: option(
            r.condition,
            ["always", "vowel-final", "consonant-final"],
            "Rule condition",
            "always",
          ),
        };
      });
      uniqueIds(morphologyRules, `${name} morphology rules`);
      for (const rule of morphologyRules) {
        validatePhonemeSteps([{
          kind: rule.kind,
          from: rule.kind === "circumfix" ? rule.form : "",
          to: rule.kind === "circumfix" ? rule.secondForm : rule.form,
          condition: rule.condition,
          test: "",
        }], phonologicalLanguage, phonemes);
      }
      const g = language.grammar ?? {};
      if (!record(g)) fail(`${name} grammar must be an object.`);
      const grammar = {
        ...validateGrammarOrders(g),
        description: text(g.description, "Grammar notes", 100000, ""),
      };
      const entries = list(language.lexicon ?? [], "Lexicon", LIMITS.lexicon);
      entryCount += entries.length;
      if (entryCount > LIMITS.lexicon)
        fail(
          `A workspace may contain at most ${LIMITS.lexicon.toLocaleString("en")} lexicon entries.`,
        );
      const lexicon = entries.map((entry, index) =>
        validateEntry(entry, `${name} entry ${index + 1}`, phonologicalLanguage, phonemes),
      );
      uniqueIds(lexicon, `${name} lexicon`);
      const inflectionData = validateInflectionLanguage({
        ...phonologicalLanguage,
        paradigms: language.paradigms,
        lexicon,
      }, phonemes);
      return {
        id: identifier(language.id, "Language ID"),
        name,
        familyId: identifier(language.familyId, "Language family ID"),
        parentId:
          language.parentId === null || language.parentId === undefined
            ? null
            : identifier(language.parentId, "Parent language ID"),
        description: text(
          language.description,
          "Language description",
          20000,
          "",
        ),
        phonemeIds: inventory,
        orthography,
        orthographyRules,
        soundClasses,
        phonotactics,
        morphemes,
        morphologyRules,
        grammar,
        ...inflectionData,
      };
    },
  );
  if (!languages.length)
    fail("A workspace must contain at least one language.");
  uniqueIds(languages, "Languages");
  const languagesById = new Map(
    languages.map((language) => [language.id, language]),
  );
  for (const language of languages) {
    if (!familyIds.has(language.familyId))
      fail(`${language.name} refers to a family that is not in the backup.`);
    if (language.parentId !== null) {
      const parent = languagesById.get(language.parentId);
      if (!parent)
        fail(
          `${language.name} refers to a parent language that is not in the backup.`,
        );
      if (parent.familyId !== language.familyId)
        fail(`${language.name} and its parent must belong to the same family.`);
    }
    const visited = new Set([language.id]);
    let next = language.parentId;
    while (next !== null) {
      if (visited.has(next))
        fail(`The ancestry of ${language.name} contains a cycle.`);
      visited.add(next);
      const parent = languagesById.get(next);
      if (!parent) break; // Its own validation provides the clearer dangling-parent error.
      next = parent.parentId;
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: identifier(input.id, "Workspace ID"),
    name: requiredText(input.name, "Workspace name", 300),
    families,
    languages,
  };
}

export function exportWorkspace(workspace) {
  return JSON.stringify(workspace, null, 2);
}

const CSV_HEADERS = [
  "word",
  "ipa",
  "gloss",
  "definition",
  "pos",
  "tags",
  "conceptId",
  "notes",
];
function csvCell(value) {
  let s = String(value ?? "");
  // Neutralize spreadsheet formulas without discarding text; parser reverses only this marker.
  if (/^[=+\-@\t\r']/u.test(s)) s = `'${s}`;
  return `"${s.replace(/"/gu, '""')}"`;
}
export function toCSV(entries) {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const entry of entries)
    lines.push(
      CSV_HEADERS.map((header) =>
        csvCell(
          header === "tags" ? JSON.stringify(entry.tags ?? []) : entry[header],
        ),
      ).join(","),
    );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** RFC-4180-style CSV, with escaped quotes and multiline definitions. */
export function parseLexiconCSV(input) {
  if (typeof input !== "string") fail("CSV input must be text.");
  if (input.length > 25_000_000)
    fail("CSV is too large (maximum 25 MB of text).");
  const source = input.replace(/^\uFEFF/u, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === '"') {
      if (cell || closed)
        fail("Malformed CSV: unexpected quote in an unquoted field.");
      quoted = true;
    } else if (c === "," || c === "\n" || c === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && source[i + 1] === "\n") i++;
        if (row.some((value) => value.length)) rows.push(row);
        row = [];
      }
    } else {
      if (closed) fail("Malformed CSV: unexpected text after a quoted field.");
      cell += c;
    }
  }
  if (quoted) fail("Malformed CSV: an opening quote has no closing quote.");
  if (cell || row.length || closed) {
    row.push(cell);
    if (row.some((value) => value.length)) rows.push(row);
  }
  if (!rows.length) fail("The CSV is empty.");
  const headers = rows.shift().map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length)
    fail("CSV column names must be unique.");
  if (!headers.includes("word") || !headers.includes("gloss"))
    fail(
      "CSV requires “word” and “gloss” columns. Optional: ipa, definition, pos, tags, conceptId, notes.",
    );
  if (rows.length > LIMITS.lexicon)
    fail(`CSV exceeds ${LIMITS.lexicon.toLocaleString("en")} entries.`);
  const now = new Date().toISOString();
  return rows.map((fields, index) => {
    if (fields.length !== headers.length)
      fail(
        `CSV row ${index + 2} has ${fields.length} fields; expected ${headers.length}.`,
      );
    const data = Object.fromEntries(
      headers.map((header, i) => [
        header,
        fields[i].replace(/^'(?=['=+\-@\t\r])/u, ""),
      ]),
    );
    let tags = [];
    if (data.tags?.trim()) {
      if (data.tags.trim().startsWith("[")) {
        try {
          tags = JSON.parse(data.tags);
        } catch {
          fail(`CSV row ${index + 2} has invalid tags JSON.`);
        }
      } else
        tags = data.tags
          .split(";")
          .map((tag) => tag.trim())
          .filter(Boolean);
    }
    return validateEntry(
      {
        id: uid("entry"),
        word: data.word,
        ipa: data.ipa ?? "",
        gloss: data.gloss,
        definition: data.definition ?? "",
        pos: data.pos || "noun",
        tags,
        conceptId: data.conceptid || null,
        notes: data.notes ?? "",
        createdAt: now,
        entryType: "lexeme",
        paradigmId: null,
        stems: {},
        overrides: {},
        source: null,
      },
      `CSV row ${index + 2}`,
    );
  });
}
