/** Ordered phoneme transformations. No user text is evaluated as code or regex. */
import {
  applyPhonemeSteps,
  parseIPA,
  renderPhonemes,
  validatePhonemeSteps,
} from "./phonology.js";
import { analyzePhonemeForm, compileWordPhonotactics } from "./phonotactics.js";
export const INFLECTION_LIMITS = Object.freeze({
  paradigms: 256,
  slots: 256,
  steps: 64,
  features: 32,
  stems: 128,
  formLength: 1000,
});
export const INFLECTION_PARTS_OF_SPEECH = Object.freeze([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "interjection",
  "particle",
  "numeral",
  "other",
]);
export const INFLECTION_STEP_KINDS = Object.freeze([
  "prefix",
  "suffix",
  "replace-prefix",
  "replace-suffix",
  "replace-all",
  "replace-whole",
  "infix",
  "reduplication",
]);
export const INFLECTION_CONDITIONS = Object.freeze([
  "always",
  "vowel-final",
  "consonant-final",
  "starts-with",
  "ends-with",
  "contains",
  "not-starts-with",
  "not-ends-with",
]);

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message) => {
  throw new Error(message);
};
const clone = (value) =>
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
const freshId = (prefix) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`}`;

function string(value, label, maximum = 1000, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") fail(`${label} must be text.`);
  if (value.length > maximum) fail(`${label} exceeds ${maximum} characters.`);
  return value.normalize("NFC");
}
function required(value, label, maximum = 160) {
  const result = string(value, label, maximum).trim();
  if (!result) fail(`${label} cannot be empty.`);
  return result;
}
function id(value, label) {
  const result = required(value, label, 200);
  if (!/^[A-Za-z0-9_.:-]+$/u.test(result))
    fail(
      `${label} may contain only ASCII letters, digits, periods, colons, underscores and hyphens.`,
    );
  return result;
}
function array(value, label, maximum) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  if (value.length > maximum) fail(`${label} exceeds ${maximum} entries.`);
  return value;
}
function choice(value, choices, label, fallback) {
  const result = value === undefined ? fallback : value;
  if (!choices.includes(result))
    fail(`${label} must be one of: ${choices.join(", ")}.`);
  return result;
}
function key(value, label) {
  const result = required(value, label, 100);
  if (
    ["__proto__", "prototype", "constructor"].includes(result) ||
    /\p{Control}/u.test(result)
  )
    fail(`${label} is not a supported name.`);
  return result;
}
function map(value, label, maximum, normalize) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  const pairs = Object.entries(value);
  if (pairs.length > maximum) fail(`${label} exceeds ${maximum} entries.`);
  const normalized = pairs.map(([name, item]) => normalize(name, item));
  if (new Set(normalized.map(([name]) => name)).size !== normalized.length)
    fail(`${label} contains duplicate names after normalization.`);
  return Object.fromEntries(normalized);
}
function features(value, label) {
  return map(
    value === undefined ? {} : value,
    label,
    INFLECTION_LIMITS.features,
    (name, item) => [
      key(name, `${label} name`),
      required(item, `${label} value`, 200),
    ],
  );
}
function unique(items, field, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[field];
    if (seen.has(value))
      fail(`${label} contains duplicate ${field} “${value}”.`);
    seen.add(value);
  }
}
function normalizeStep(step, label) {
  if (!isRecord(step)) fail(`${label} must be an object.`);
  const kind = choice(step.kind, INFLECTION_STEP_KINDS, `${label} operation`);
  const condition = choice(
    step.condition,
    INFLECTION_CONDITIONS,
    `${label} condition`,
    "always",
  );
  const from = string(
    step.from,
    `${label} match`,
    INFLECTION_LIMITS.formLength,
    "",
  );
  const to = string(
    step.to,
    `${label} replacement`,
    INFLECTION_LIMITS.formLength,
    "",
  );
  const test = string(
    step.test,
    `${label} condition text`,
    INFLECTION_LIMITS.formLength,
    "",
  );
  if (kind.startsWith("replace-") && !from.length)
    fail(`${label}: a replacement needs a nonempty phoneme sequence to match.`);
  if (!["always", "vowel-final", "consonant-final"].includes(condition) && !test.trim())
    fail(`${label}: this condition needs a phoneme sequence or sound class.`);
  return { kind, from, to, condition, test };
}

/** Normalize definitions. Empty slot lists are permitted while constructing a paradigm. */
export function validateParadigms(input, language, phonemes) {
  const paradigms = array(input, "Paradigms", INFLECTION_LIMITS.paradigms).map(
    (paradigm, index) => {
      if (!isRecord(paradigm)) fail(`Paradigm ${index + 1} must be an object.`);
      const name = required(paradigm.name, "Paradigm name");
      const slots = array(
        paradigm.slots === undefined ? [] : paradigm.slots,
        `${name} slots`,
        INFLECTION_LIMITS.slots,
      ).map((slot, slotIndex) => {
        if (!isRecord(slot))
          fail(`${name} slot ${slotIndex + 1} must be an object.`);
        const label = required(slot.label, `${name} slot label`, 200);
        const stem = string(
          slot.stem,
          `${name} ${label} stem name`,
          100,
          "",
        ).trim();
        if (stem) key(stem, "Stem name");
        return {
          id: id(slot.id, "Slot ID"),
          label,
          features: features(slot.features, `${name} ${label} features`),
          stem,
          steps: array(
            slot.steps === undefined ? [] : slot.steps,
            `${name} ${label} steps`,
            INFLECTION_LIMITS.steps,
          ).map((step, stepIndex) =>
            normalizeStep(step, `${name} ${label} step ${stepIndex + 1}`),
          ),
        };
      });
      unique(slots, "id", `${name} slots`);
      unique(slots, "label", `${name} slots`);
      const featureSets = new Set();
      for (const slot of slots) {
        // An empty feature set means unspecified; a label alone can identify a custom slot.
        if (!Object.keys(slot.features).length) continue;
        const canonical = JSON.stringify(
          Object.entries(slot.features).sort(([a], [b]) =>
            a.localeCompare(b, "en"),
          ),
        );
        if (featureSets.has(canonical))
          fail(`${name} contains duplicate slot features for “${slot.label}”.`);
        featureSets.add(canonical);
      }
      return {
        id: id(paradigm.id, "Paradigm ID"),
        name,
        kind: choice(
          paradigm.kind,
          ["declension", "conjugation"],
          "Paradigm kind",
        ),
        pos: choice(
          paradigm.pos,
          INFLECTION_PARTS_OF_SPEECH,
          "Paradigm part of speech",
        ),
        description: string(
          paradigm.description,
          "Paradigm description",
          20000,
          "",
        ),
        slots,
      };
    },
  );
  unique(paradigms, "id", "Paradigms");
  if (language && phonemes) {
    for (const paradigm of paradigms)
      for (const slot of paradigm.slots) {
        try {
          validatePhonemeSteps(slot.steps, language, phonemes);
        } catch (error) {
          fail(`${paradigm.name} · ${slot.label}: ${error.message}`);
        }
      }
  }
  return paradigms;
}

/** Validate and return inflection metadata; lexical data is handled by engine.js. */
export function normalizeInflectionEntry(entry) {
  if (!isRecord(entry)) fail("A lexicon entry must be an object.");
  const entryType = choice(
    entry.entryType,
    ["lexeme", "form"],
    "Entry type",
  );
  const paradigmId =
    entry.paradigmId === null
      ? null
      : id(entry.paradigmId, "Assigned paradigm ID");
  const stems = map(
    entry.stems,
    "Named stems",
    INFLECTION_LIMITS.stems,
    (name, value) => [
      key(name, "Stem name"),
      required(value, `Stem ${name}`, INFLECTION_LIMITS.formLength),
    ],
  );
  const overrides = map(
    entry.overrides,
    "Inflection overrides",
    INFLECTION_LIMITS.slots,
    (slotId, override) => {
      if (!isRecord(override))
        fail("Each inflection override must be an object.");
      const omit = override.omit === undefined ? false : override.omit;
      if (typeof omit !== "boolean")
        fail("Override omit must be true or false.");
      const word = string(
        override.word,
        "Override word",
        INFLECTION_LIMITS.formLength,
        "",
      );
      const ipa = string(override.ipa, "Override IPA", 2000, "").trim();
      if (!omit && !word.trim() && !ipa)
        fail("An irregular override needs IPA, a spelling exception, or an omitted slot.");
      return [id(slotId, "Override slot ID"), { word, ipa, omit }];
    },
  );
  let source = null;
  if (entry.source !== null) {
    if (!isRecord(entry.source)) fail("A form source must be an object.");
    source = {
      lexemeId: id(entry.source.lexemeId, "Source lexeme ID"),
      paradigmId: id(entry.source.paradigmId, "Source paradigm ID"),
      slotId: id(entry.source.slotId, "Source slot ID"),
      slotLabel: required(entry.source.slotLabel, "Source slot label", 200),
      features: features(entry.source.features, "Source features"),
    };
  }
  if (
    entryType === "form" &&
    (paradigmId !== null || Object.keys(overrides).length)
  )
    fail(
      "A saved form cannot have a paradigm assignment or inflection overrides. Assign paradigms to lexemes.",
    );
  if (entryType === "lexeme" && source !== null)
    fail("Only saved forms may have an inflection source.");
  return { entryType, paradigmId, stems, overrides, source };
}

/** Validate references within one language. Historical paradigm/slot source IDs may be absent. */
export function validateInflectionLanguage(language, phonemes) {
  if (!isRecord(language)) fail("A language must be an object.");
  const paradigms = validateParadigms(language.paradigms, language, phonemes);
  const paradigmsById = new Map(
    paradigms.map((paradigm) => [paradigm.id, paradigm]),
  );
  const lexicon = array(language.lexicon ?? [], "Lexicon", 100000).map(
    (entry) => ({
      ...entry,
      ...normalizeInflectionEntry(entry),
      id: id(entry.id, "Entry ID"),
    }),
  );
  unique(lexicon, "id", "Lexicon");
  const entriesById = new Map(lexicon.map((entry) => [entry.id, entry]));
  for (const entry of lexicon) {
    if (phonemes) {
      for (const [name, stem] of Object.entries(entry.stems)) {
        try { parseIPA(stem, language, phonemes); }
        catch (error) { fail(`${entry.word} · stem ${name}: ${error.message}`); }
      }
      for (const override of Object.values(entry.overrides))
        if (!override.omit && override.ipa) {
          try { parseIPA(override.ipa, language, phonemes); }
          catch (error) { fail(`${entry.word} · exception: ${error.message}`); }
        }
    }
    if (entry.paradigmId !== null) {
      const paradigm = paradigmsById.get(entry.paradigmId);
      if (!paradigm)
        fail(
          `“${entry.word ?? entry.id}” is assigned to a paradigm that does not exist.`,
        );
      if (entry.pos !== paradigm.pos)
        fail(
          `“${entry.word ?? entry.id}” is ${entry.pos}; its paradigm requires ${paradigm.pos}.`,
        );
      const validSlots = new Set(paradigm.slots.map((slot) => slot.id));
      for (const slotId of Object.keys(entry.overrides))
        if (!validSlots.has(slotId))
          fail(
            `“${entry.word ?? entry.id}” has an override for a slot outside its assigned paradigm.`,
          );
    } else if (Object.keys(entry.overrides).length)
      fail(
        `“${entry.word ?? entry.id}” has inflection overrides but no assigned paradigm.`,
      );
    if (entry.source !== null) {
      const sourceLexeme = entriesById.get(entry.source.lexemeId);
      if (!sourceLexeme || sourceLexeme.entryType !== "lexeme")
        fail(
          `The source of “${entry.word ?? entry.id}” must refer to an existing lexeme in this language.`,
        );
    }
  }
  return { paradigms, lexicon };
}

function sameSegments(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Resolve explicit phonology only. Written words never supply guessed phonemes. */
function lemmaPhonology(lexeme, language, phonemes) {
  const stored = Array.isArray(lexeme.segments) && lexeme.segments.length ? lexeme.segments : null;
  const parsed = lexeme.ipa?.trim() ? parseIPA(lexeme.ipa, language, phonemes) : null;
  if (stored && parsed && !sameSegments(stored, parsed.segments))
    fail("The stored phonemes and IPA disagree. Edit the lexeme pronunciation.");
  if (!stored && !parsed)
    fail("Add this lexeme’s pronunciation (IPA) before generating its forms.");
  const segments = stored || parsed.segments;
  const syllables = lexeme.syllables?.length ? lexeme.syllables : parsed?.syllables;
  return {
    ...renderPhonemes(segments, language, phonemes, syllables ? { syllables } : {}),
    ...(parsed ? { ipa: parsed.ipa } : {}),
  };
}

/** Return every slot, including omitted forms and local errors; never guess a missing stem. */
export function generateInflections(language, lexemeId, phonemes) {
  const { paradigms, lexicon } = validateInflectionLanguage(language, phonemes);
  const lexeme = lexicon.find((entry) => entry.id === lexemeId);
  if (!lexeme) fail("The selected lexeme does not exist in this language.");
  if (lexeme.entryType !== "lexeme")
    fail("Choose a lexeme to generate an inflection paradigm.");
  if (lexeme.paradigmId === null) return [];
  if (!Array.isArray(phonemes)) fail("A phoneme inventory is required to generate inflections.");
  const paradigm = paradigms.find((item) => item.id === lexeme.paradigmId);
  return paradigm.slots.map((slot) => {
    const source = {
      lexemeId: lexeme.id,
      paradigmId: paradigm.id,
      slotId: slot.id,
      slotLabel: slot.label,
      features: clone(slot.features),
    };
    const override = lexeme.overrides[slot.id];
    const base = {
      slotId: slot.id,
      label: slot.label,
      features: clone(slot.features),
      word: "",
      ipa: "",
      segments: [],
      syllables: [],
      trace: [],
      phonotactics: null,
      overridden: Boolean(override),
      spellingOverride: Boolean(override?.word?.trim()),
      omitted: Boolean(override?.omit),
      error: null,
      source,
    };
    if (override?.omit) return base;
    try {
      let result;
      let inheritedSpellingOverride = false;
      let suppliedPronunciation = false;
      const trace = [];
      if (override?.ipa) {
        const exceptional = parseIPA(override.ipa, language, phonemes);
        result = {
          ...renderPhonemes(exceptional.segments, language, phonemes, { syllables: exceptional.syllables }),
          ipa: exceptional.ipa,
        };
        suppliedPronunciation = true;
        trace.push({ label: "Pronunciation exception", before: "", after: result.ipa, changed: true });
      } else {
        if (slot.stem && !own(lexeme.stems, slot.stem))
          fail(`Missing named stem “${slot.stem}” for ${slot.label}.`);
        const initial = slot.stem
          ? parseIPA(lexeme.stems[slot.stem], language, phonemes)
          : lemmaPhonology(lexeme, language, phonemes);
        let segments = [...initial.segments];
        for (const [index, step] of slot.steps.entries()) {
          const before = segments;
          segments = applyPhonemeSteps(segments, [step], language, phonemes);
          trace.push({
            label: `Step ${index + 1} · ${step.kind}`,
            before: renderPhonemes(before, language, phonemes).ipa,
            after: segments.length ? renderPhonemes(segments, language, phonemes).ipa : "∅",
            changed: !sameSegments(before, segments),
          });
        }
        if (!segments.length) fail("These inflection steps produce an empty phoneme sequence.");
        const unchanged = sameSegments(segments, initial.segments);
        result = renderPhonemes(segments, language, phonemes,
          unchanged && initial.syllables?.length ? { syllables: initial.syllables } : {});
        if (unchanged) {
          suppliedPronunciation = true;
          result.ipa = initial.ipa;
          if (!slot.stem && lexeme.spellingOverride) {
            result.word = lexeme.word;
            inheritedSpellingOverride = true;
          }
        }
      }
      let checked;
      if (suppliedPronunciation) {
        const primaryStress = result.ipa.split(".").findIndex((syllable) => syllable.startsWith("ˈ"));
        const check = compileWordPhonotactics(language, phonemes)(result.syllables,
          primaryStress < 0 ? {} : { stressIndex: primaryStress });
        checked = {
          status: check.ok ? "unique" : "invalid", ok: check.ok,
          candidates: check.ok ? [{ syllables: result.syllables, ipa: result.ipa, stressIndex: primaryStress, syllablePatterns: check.syllablePatterns }] : [],
          syllables: check.ok ? result.syllables : null,
          ambiguous: false, truncated: false, reasons: check.reasons,
          supplied: true,
        };
      } else {
        checked = analyzePhonemeForm(result.segments, language, phonemes);
        if (checked.status === "unique") {
          const candidate = checked.candidates[0];
          result = renderPhonemes(result.segments, language, phonemes, { syllables: candidate.syllables, stress: true });
        }
      }
      const word = override?.word?.trim() || result.word;
      if (!word.trim()) fail("These rules produce an empty written form.");
      return { ...base, ...result, word, trace, phonotactics: checked, spellingOverride: base.spellingOverride || inheritedSpellingOverride };
    } catch (error) {
      return { ...base, error: error.message };
    }
  });
}

/** Fresh grids have identity slots; the user defines every affix and alternation. */
export function createParadigmTemplate(kind) {
  choice(kind, ["declension", "conjugation"], "Paradigm template");
  const slots = [];
  if (kind === "declension") {
    for (const [grammaticalCase, label] of [
      ["nom", "Nominative"],
      ["acc", "Accusative"],
      ["gen", "Genitive"],
    ]) {
      for (const [number, numberLabel] of [
        ["sg", "singular"],
        ["pl", "plural"],
      ])
        slots.push({
          id: freshId("slot"),
          label: `${label} ${numberLabel}`,
          features: { case: grammaticalCase, number },
          stem: "",
          steps: [],
        });
    }
  } else {
    for (const tense of ["present", "past"])
      for (const person of ["1", "2", "3"])
        for (const [number, numberLabel] of [
          ["sg", "singular"],
          ["pl", "plural"],
        ])
          slots.push({
            id: freshId("slot"),
            label: `${tense === "present" ? "Present" : "Past"} ${person === "1" ? "first" : person === "2" ? "second" : "third"} person ${numberLabel}`,
            features: { tense, person, number },
            stem: "",
            steps: [],
          });
  }
  return {
    id: freshId("paradigm"),
    name: kind === "declension" ? "Noun declension" : "Verb conjugation",
    kind,
    pos: kind === "declension" ? "noun" : "verb",
    description: "",
    slots,
  };
}

/** Remap live and historical references together when branching a language. */
export function cloneInflectionData(language, makeId = freshId) {
  const { paradigms, lexicon } = validateInflectionLanguage(language);
  const paradigmIds = new Map(),
    slotIds = new Map(),
    entryIds = new Map();
  const mappedParadigm = (old) => {
    if (!paradigmIds.has(old)) paradigmIds.set(old, makeId("paradigm"));
    return paradigmIds.get(old);
  };
  const mappedSlot = (oldParadigm, oldSlot) => {
    const composite = `${oldParadigm}\u0000${oldSlot}`;
    if (!slotIds.has(composite)) slotIds.set(composite, makeId("slot"));
    return slotIds.get(composite);
  };
  for (const entry of lexicon) entryIds.set(entry.id, makeId("entry"));
  const copiedParadigms = paradigms.map((paradigm) => ({
    ...clone(paradigm),
    id: mappedParadigm(paradigm.id),
    slots: paradigm.slots.map((slot) => ({
      ...clone(slot),
      id: mappedSlot(paradigm.id, slot.id),
    })),
  }));
  const copiedLexicon = lexicon.map((entry) => ({
    ...clone(entry),
    id: entryIds.get(entry.id),
    paradigmId:
      entry.paradigmId === null ? null : mappedParadigm(entry.paradigmId),
    overrides: Object.fromEntries(
      Object.entries(entry.overrides).map(([slotId, override]) => [
        mappedSlot(entry.paradigmId, slotId),
        clone(override),
      ]),
    ),
    source:
      entry.source === null
        ? null
        : {
            ...clone(entry.source),
            lexemeId: entryIds.get(entry.source.lexemeId),
            paradigmId: mappedParadigm(entry.source.paradigmId),
            slotId: mappedSlot(entry.source.paradigmId, entry.source.slotId),
          },
  }));
  return { paradigms: copiedParadigms, lexicon: copiedLexicon };
}
