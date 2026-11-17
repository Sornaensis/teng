import test from "node:test";
import assert from "node:assert/strict";
import { PHONEMES } from "../dist/ipa.js";
import {
  createWorkspace,
  createLanguage,
  generateWords,
  validateWorkspace,
  exportWorkspace,
} from "../dist/engine.js";
import {
  createParadigmTemplate,
  generateInflections,
  normalizeInflectionEntry,
  validateParadigms,
  validateInflectionLanguage,
} from "../dist/inflection.js";

const step = (
  kind,
  from = "",
  to = "",
  condition = "always",
  conditionText = "",
) => ({ kind, from, to, condition, test: conditionText });
const slot = (id, steps = [], extra = {}) => ({
  id,
  label: id,
  features: { form: id },
  stem: "",
  steps,
  ...extra,
});
const metadata = (extra = {}) => ({
  entryType: "lexeme",
  paradigmId: null,
  stems: {},
  overrides: {},
  source: null,
  ...extra,
});
function fixture(slots, word = "sela") {
  return {
    ...createLanguage({ name: "Test", familyId: "family" }, PHONEMES),
    paradigms: [
      {
        id: "regular",
        name: "Regular nouns",
        kind: "declension",
        pos: "noun",
        description: "",
        slots,
      },
    ],
    lexicon: [
      {
        id: "lemma",
        word,
        ipa: word === "sela" ? "ˈse.la" : word,
        pos: "noun",
        entryType: "lexeme",
        paradigmId: "regular",
        stems: {},
        overrides: {},
        source: null,
      },
    ],
  };
}

test("current-schema imports require explicit paradigms and entry metadata", () => {
  const workspace = createWorkspace(PHONEMES);
  const requiredFields = [
    ["paradigms", /Paradigms must be an array/u],
    ["entryType", /Entry type/u],
    ["paradigmId", /Assigned paradigm ID/u],
    ["stems", /Named stems must be an object/u],
    ["overrides", /Inflection overrides must be an object/u],
    ["source", /form source must be an object/u],
  ];
  for (const [field, expectedError] of requiredFields) {
    const incomplete = structuredClone(workspace);
    const language = incomplete.languages[1];
    if (field === "paradigms") delete language[field];
    else delete language.lexicon[0][field];
    const original = structuredClone(incomplete);
    assert.throws(() => validateWorkspace(incomplete, PHONEMES), expectedError);
    assert.deepEqual(incomplete, original, `must not fill missing ${field}`);
  }
  assert.throws(() => validateParadigms(), /Paradigms must be an array/u);
  assert.throws(
    () => validateInflectionLanguage({ lexicon: [] }),
    /Paradigms must be an array/u,
  );
});

test("neutral templates create separate noun and verb grids with fresh IDs", () => {
  const noun = createParadigmTemplate("declension");
  const otherNoun = createParadigmTemplate("declension");
  const verb = createParadigmTemplate("conjugation");
  assert.equal(noun.slots.length, 6);
  assert.equal(verb.slots.length, 12);
  assert.equal(noun.pos, "noun");
  assert.equal(verb.pos, "verb");
  assert.notEqual(noun.id, otherNoun.id);
  const allIds = [noun, otherNoun, verb].flatMap((p) => [
    p.id,
    ...p.slots.map((s) => s.id),
  ]);
  assert.equal(new Set(allIds).size, allIds.length);
  assert.ok(
    [...noun.slots, ...verb.slots].every(
      (s) => s.stem === "" && s.steps.length === 0,
    ),
  );
  assert.deepEqual(validateParadigms([noun, verb]), [noun, verb]);
  assert.throws(() => createParadigmTemplate("unknown"), /template/u);
});

test("conditional steps inspect each preceding result and apply in order", () => {
  const language = fixture(
    [
      slot("sequential", [
        step("suffix", "", "n"),
        step("replace-suffix", "an", "e", "ends-with", "a n"),
        step("prefix", "", "u", "not-starts-with", "u"),
        step("replace-all", "a", "o", "contains", "a"),
        step("replace-prefix", "ut", "it", "starts-with", "u t"),
        step("suffix", "", "s", "not-ends-with", "s"),
      ]),
    ],
    "taka",
  );
  const [result] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(result.word, "itokes");
  assert.equal(result.ipa.replace(/[.ˈˌ]/gu, ""), "itokes");
  assert.equal(result.error, null);
  assert.deepEqual(result.source, {
    lexemeId: "lemma",
    paradigmId: "regular",
    slotId: "sequential",
    slotLabel: "sequential",
    features: { form: "sequential" },
  });
});

test("replacement matches whole phonemes and rejects code or regex syntax", () => {
  const language = fixture([
    slot("all", [step("replace-all", "a", "o")]),
    slot("whole", [step("replace-whole", "sela", "kori")]),
    slot("miss", [step("replace-whole", "a", "i"), step("replace-prefix", "z", "s")]),
  ]);
  const results = generateInflections(language, "lemma", PHONEMES);
  assert.equal(results[0].word, "selo");
  assert.equal(results[1].word, "kori");
  assert.equal(results[2].word, "sela");
  assert.equal(results[2].ipa, "ˈse.la");
  for (const invalid of [step("replace-all", ".", "$&"), step("suffix", "", "alert(1)")]) {
    language.paradigms[0].slots[0].steps = [invalid];
    assert.throws(() => validateInflectionLanguage(language, PHONEMES), /IPA|phoneme|selected/u);
  }
});

test("an infix follows one complete phoneme even when its IPA and spelling span characters", () => {
  const language = fixture([slot("infix", [step("infix", "", "um")])], "cha");
  const affricate = PHONEMES.find((p) => p.symbol === "t͡ʃ");
  language.phonemeIds.push(affricate.id);
  language.orthography[affricate.id] = "ch";
  language.lexicon[0].ipa = "t͡ʃa";
  const [result] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(result.word, "chuma");
  assert.equal(result.ipa.replace(/[.ˈˌ]/gu, ""), "t͡ʃuma");
  assert.equal(result.segments[0], affricate.id);
  assert.equal(result.segments.length, 4);
  language.paradigms[0].slots[0].steps = [step("replace-prefix", "t", "s")];
  assert.equal(generateInflections(language, "lemma", PHONEMES)[0].word, "cha", "a component of an affricate is not a phoneme match");
});

test("named stems are explicit and a missing stem is a per-slot error", () => {
  const language = fixture([
    slot("identity"),
    slot("past", [step("suffix", "", "na")], { stem: "past" }),
    slot("unavailable", [], { stem: "special" }),
  ]);
  language.lexicon[0].stems.past = "went";
  const results = generateInflections(language, "lemma", PHONEMES);
  assert.equal(results.length, 3);
  assert.equal(results[0].word, "sela");
  assert.equal(results[1].word, "wentna");
  assert.equal(results[1].ipa.replace(/[.ˈˌ]/gu, ""), "wentna");
  assert.match(results[2].error, /Missing named stem “special”/u);
  assert.equal(results[2].word, "");
  assert.equal(results[2].omitted, false);
});

test("IPA exceptions and omitted forms bypass regular operations and missing stems", () => {
  const language = fixture([
    slot("plural", [step("suffix", "", "s")], { stem: "missing" }),
    slot("missing-form", [], { stem: "missing" }),
  ]);
  language.lexicon[0].overrides = {
    plural: { word: "qoren", ipa: "ˈko.ren", omit: false },
    "missing-form": { word: "", ipa: "", omit: true },
  };
  const [irregular, omitted] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(irregular.word, "qoren");
  assert.equal(irregular.ipa, "ˈko.ren");
  assert.equal(irregular.overridden, true);
  assert.equal(irregular.error, null);
  assert.equal(omitted.omitted, true);
  assert.equal(omitted.word, "");
  assert.equal(omitted.error, null);
  language.lexicon[0].overrides.plural.word = "";
  assert.equal(generateInflections(language, "lemma", PHONEMES)[0].word, "koren", "pronunciation-only exceptions render through orthography");
});

test("phonology survives every form; a spelling exception does not change pronunciation", () => {
  const language = fixture([
    slot("identity"),
    slot("changed", [step("suffix", "", "na")]),
    slot("override", [step("suffix", "", "na")]),
  ]);
  language.lexicon[0].overrides.override = { word: "selannha", ipa: "", omit: false };
  const results = generateInflections(language, "lemma", PHONEMES);
  assert.equal(results[0].ipa, "ˈse.la");
  assert.equal(results[1].ipa.replace(/[.ˈˌ]/gu, ""), "selana");
  assert.equal(results[2].word, "selannha");
  assert.equal(results[2].ipa, results[1].ipa);
  assert.deepEqual(results[2].segments, results[1].segments);
  assert.equal(results[2].spellingOverride, true);
});

test("reduplication uses the current form and output growth is bounded per slot", () => {
  const language = fixture([
    slot("echo", [step("prefix", "", "a"), step("reduplication", "", "a")]),
    slot(
      "too-long",
      Array.from({ length: 12 }, () => step("reduplication")),
    ),
    slot("empty", [step("replace-whole", "sela", "")]),
  ]);
  const results = generateInflections(language, "lemma", PHONEMES);
  assert.equal(results[0].word, "aselaaasela");
  assert.match(results[1].error, /1000/u);
  assert.match(results[2].error, /empty|between 1|entire pronunciation/u);
});

test("generation returns independent snapshots without mutating definitions or lexemes", () => {
  const language = fixture([slot("plural", [step("suffix", "", "na")])]);
  const original = structuredClone(language);
  const [result] = generateInflections(language, "lemma", PHONEMES);
  result.source.features.form = "changed";
  result.features.form = "also-changed";
  assert.deepEqual(language, original);
});

test("assignments require an existing matching-POS paradigm and a lexeme", () => {
  const language = fixture([slot("one")]);
  language.lexicon[0].pos = "verb";
  assert.throws(() => validateInflectionLanguage(language), /requires noun/u);
  language.lexicon[0].pos = "noun";
  language.lexicon[0].paradigmId = "missing";
  assert.throws(() => validateInflectionLanguage(language), /does not exist/u);
  language.lexicon[0].paradigmId = "regular";
  language.lexicon[0].entryType = "form";
  assert.throws(
    () => validateInflectionLanguage(language),
    /saved form cannot/u,
  );
  language.lexicon[0].paradigmId = null;
  assert.throws(
    () => generateInflections(language, "lemma", PHONEMES),
    /Choose a lexeme/u,
  );
  language.lexicon[0].entryType = "lexeme";
  assert.deepEqual(generateInflections(language, "lemma", PHONEMES), []);
});

test("override references must belong to the assigned paradigm", () => {
  const language = fixture([slot("one")]);
  language.lexicon[0].overrides.wrong = { word: "x", ipa: "", omit: false };
  assert.throws(
    () => validateInflectionLanguage(language),
    /outside its assigned/u,
  );
  language.lexicon[0].paradigmId = null;
  assert.throws(
    () => validateInflectionLanguage(language),
    /no assigned paradigm/u,
  );
  assert.throws(
    () =>
      normalizeInflectionEntry(
        metadata({ overrides: { one: { word: "", omit: false } } }),
      ),
    /irregular override needs/u,
  );
});

test("saved form sources may outlive definitions but must still refer to a lexeme", () => {
  const language = fixture([slot("one")]);
  const form = {
    id: "snapshot",
    word: "selana",
    pos: "noun",
    entryType: "form",
    paradigmId: null,
    stems: {},
    overrides: {},
    source: {
      lexemeId: "lemma",
      paradigmId: "removed-paradigm",
      slotId: "removed-slot",
      slotLabel: "Old plural",
      features: { number: "pl" },
    },
  };
  language.lexicon.push(form);
  assert.doesNotThrow(() => validateInflectionLanguage(language));
  form.source.lexemeId = "missing";
  assert.throws(() => validateInflectionLanguage(language), /existing lexeme/u);
  form.source.lexemeId = "snapshot";
  assert.throws(() => validateInflectionLanguage(language), /existing lexeme/u);
  form.source = null;
  assert.doesNotThrow(
    () => validateInflectionLanguage(language),
    "detached editable snapshots remain valid",
  );
});

test("duplicate labels and feature bundles cannot create ambiguous slots", () => {
  let language = fixture([slot("one"), slot("two", [], { label: "one" })]);
  assert.throws(
    () => validateParadigms(language.paradigms),
    /duplicate label/u,
  );
  language = fixture([
    slot("one", [], { features: { case: "nom", number: "sg" } }),
    slot("two", [], { features: { number: "sg", case: "nom" } }),
  ]);
  assert.throws(
    () => validateParadigms(language.paradigms),
    /duplicate slot features/u,
  );
  language.paradigms[0].slots.forEach((s) => {
    s.features = {};
  });
  assert.doesNotThrow(
    () => validateParadigms(language.paradigms),
    "unspecified features are permitted for distinctly labelled custom slots",
  );
});

test("malformed conditions, replacements, IDs and map data are rejected", () => {
  for (const invalid of [
    step("eval", "", "alert(1)"),
    step("replace-all", "", "x"),
    step("suffix", "", "x", "contains", ""),
    step("suffix", "", "x", "regex", ".*"),
  ]) {
    assert.throws(() =>
      validateParadigms(fixture([slot("one", [invalid])]).paradigms),
    );
  }
  const language = fixture([slot('unsafe"')]);
  assert.throws(() => validateParadigms(language.paradigms), /ASCII letters/u);
  assert.throws(
    () => normalizeInflectionEntry(metadata({ entryType: "unknown" })),
    /Entry type/u,
  );
  assert.throws(
    () => normalizeInflectionEntry(metadata({ stems: null })),
    /must be an object/u,
  );
  assert.throws(
    () => validateInflectionLanguage({ paradigms: null, lexicon: [] }),
    /must be an array/u,
  );
  assert.throws(
    () => normalizeInflectionEntry(metadata({ stems: { past: "" } })),
    /cannot be empty/u,
  );
  assert.throws(
    () =>
      normalizeInflectionEntry(
        metadata({ stems: JSON.parse('{"__proto__":"bad"}') }),
      ),
    /not a supported name/u,
  );
  assert.throws(
    () =>
      normalizeInflectionEntry(
        metadata({ overrides: { a: { omit: "yes" } } }),
      ),
    /true or false/u,
  );
  assert.throws(
    () =>
      validateParadigms(
        fixture([slot("one", [], { features: { number: 3 } })]).paradigms,
      ),
    /must be text/u,
  );
});

test("full JSON export/import preserves inflection metadata and historical snapshots", () => {
  const workspace = createWorkspace(PHONEMES);
  const language = workspace.languages[1];
  const lexeme = language.lexicon[0];
  const paradigm = language.paradigms.find((p) => p.id === lexeme.paradigmId);
  lexeme.stems.oblique = "sel";
  lexeme.overrides[paradigm.slots[1].id] = {
    word: "selai",
    ipa: "ˈse.lai",
    omit: false,
  };
  const result = generateInflections(language, lexeme.id, PHONEMES)[1];
  language.lexicon.push({
    ...structuredClone(lexeme),
    id: "saved-form",
    word: result.word,
    ipa: result.ipa,
    segments: result.segments,
    syllables: result.syllables,
    entryType: "form",
    paradigmId: null,
    overrides: {},
    stems: {},
    source: result.source,
  });
  assert.deepEqual(
    validateWorkspace(JSON.parse(exportWorkspace(workspace)), PHONEMES),
    workspace,
  );
});

test("branching remaps paradigms, slots, entries, overrides, and live or historical sources", () => {
  const workspace = createWorkspace(PHONEMES);
  const parent = workspace.languages[1];
  const lexeme = parent.lexicon[0];
  const paradigm = parent.paradigms.find((p) => p.id === lexeme.paradigmId);
  const selectedSlot = paradigm.slots[1];
  lexeme.stems.oblique = "sel";
  lexeme.overrides[selectedSlot.id] = { word: "selai", ipa: "", omit: false };
  const liveSource = {
    lexemeId: lexeme.id,
    paradigmId: paradigm.id,
    slotId: selectedSlot.id,
    slotLabel: selectedSlot.label,
    features: structuredClone(selectedSlot.features),
  };
  const historicalSource = {
    ...liveSource,
    paradigmId: "historical-paradigm",
    slotId: "historical-slot",
  };
  for (const [index, source] of [
    liveSource,
    historicalSource,
    historicalSource,
  ].entries())
    parent.lexicon.push({
      ...structuredClone(lexeme),
      id: `form-${index}`,
      word: `form${index}`,
      entryType: "form",
      paradigmId: null,
      overrides: {},
      source,
    });
  const original = structuredClone(parent);
  const child = createLanguage(
    { name: "Child", familyId: parent.familyId, source: parent },
    PHONEMES,
  );
  const childLexeme = child.lexicon.find(
    (e) => e.gloss === lexeme.gloss && e.entryType === "lexeme",
  );
  const childParadigm = child.paradigms.find(
    (p) => p.id === childLexeme.paradigmId,
  );
  assert.notEqual(childLexeme.id, lexeme.id);
  assert.notEqual(childParadigm.id, paradigm.id);
  assert.notEqual(childParadigm.slots[1].id, selectedSlot.id);
  assert.deepEqual(childLexeme.overrides, {
    [childParadigm.slots[1].id]: lexeme.overrides[selectedSlot.id],
  });
  const forms = child.lexicon.filter((e) => e.entryType === "form");
  assert.equal(forms[0].source.lexemeId, childLexeme.id);
  assert.equal(forms[0].source.paradigmId, childParadigm.id);
  assert.equal(forms[0].source.slotId, childParadigm.slots[1].id);
  assert.notEqual(forms[1].source.paradigmId, "historical-paradigm");
  assert.notEqual(forms[1].source.slotId, "historical-slot");
  assert.equal(forms[1].source.paradigmId, forms[2].source.paradigmId);
  assert.equal(forms[1].source.slotId, forms[2].source.slotId);
  assert.doesNotThrow(() =>
    validateWorkspace(
      { ...workspace, languages: [...workspace.languages, child] },
      PHONEMES,
    ),
  );
  childLexeme.stems.oblique = "changed";
  childParadigm.slots[0].steps.push(step("prefix", "", "x"));
  assert.deepEqual(parent, original);
});

test("word generation integrates optional probabilities and bounded constraint rejection", () => {
  const language = createLanguage(
    { name: "Tiny", familyId: "family" },
    PHONEMES,
  );
  language.phonemeIds = PHONEMES.filter((p) =>
    ["p", "a"].includes(p.symbol),
  ).map((p) => p.id);
  language.soundClasses = {};
  language.phonotactics = {
    patterns: [{ pattern: "(C)V", weight: 1 }],
    minSyllables: 1,
    maxSyllables: 1,
    stress: "none",
    banned: [],
    optionalProbability: 0,
    phonemeWeights: {},
    constraints: [],
  };
  assert.equal(
    generateWords(language, PHONEMES, { count: 1, seed: "fixed" }).words[0]
      .word,
    "a",
  );
  language.phonotactics.optionalProbability = 1;
  assert.equal(
    generateWords(language, PHONEMES, { count: 1, seed: "fixed" }).words[0]
      .word,
    "pa",
  );
  language.phonotactics.constraints = [
    {
      id: "no-onset",
      name: "No consonant onset",
      scope: "word",
      position: "start",
      mode: "forbid",
      sequence: "C",
    },
  ];
  const rejected = generateWords(language, PHONEMES, {
    count: 1,
    seed: "fixed",
  });
  assert.equal(rejected.words.length, 0);
  assert.ok(rejected.warnings.some((w) => w.includes("No consonant onset")));
});


test("contextual orthography runs on the completed phonemic inflection", () => {
  const language = fixture([slot("plural", [step("suffix", "", "i")])], "tak");
  language.orthographyRules = [{ id: "soft-k", name: "Soft k", from: "k", to: "c", before: "", after: "i" }];
  const [result] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(result.word, "taci");
  assert.equal(result.ipa.replace(/[.ˈˌ]/gu, ""), "taki");
  assert.equal(result.trace[0].changed, true);
  language.orthographyRules = [];
  assert.equal(generateInflections(language, "lemma", PHONEMES)[0].word, "taki");
});

test("vowel and class conditions inspect phonemes regardless of spelling", () => {
  const language = fixture([slot("conditional", [
    step("suffix", "", "n", "vowel-final"),
    step("suffix", "", "i", "ends-with", "N"),
  ])]);
  const a = PHONEMES.find((p) => p.symbol === "a");
  language.orthography[a.id] = "x";
  const [result] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(result.word, "selxni");
  assert.equal(result.ipa.replace(/[.ˈˌ]/gu, ""), "selani");
});

test("missing pronunciation remains a per-form error and is never guessed from spelling", () => {
  const language = fixture([slot("plural", [step("suffix", "", "na")]), slot("identity")]);
  language.lexicon[0].ipa = "";
  const results = generateInflections(language, "lemma", PHONEMES);
  assert.ok(results.every((result) => /pronunciation/u.test(result.error)));
  assert.ok(results.every((result) => !result.word && !result.ipa && !result.segments.length));
});

test("named stems and overrides reject sounds outside the selected inventory", () => {
  const language = fixture([slot("plural")]);
  language.lexicon[0].stems.oblique = "χ";
  assert.throws(() => validateInflectionLanguage(language, PHONEMES), /stem oblique/u);
  language.lexicon[0].stems = {};
  language.lexicon[0].overrides.plural = { word: "", ipa: "χ", omit: false };
  assert.throws(() => validateInflectionLanguage(language, PHONEMES), /exception/u);
});


test("an identity form preserves an explicit lemma spelling exception without leaking it into changed forms", () => {
  const language = fixture([slot("identity"), slot("plural", [step("suffix", "", "na")])]);
  language.lexicon[0].word = "sella";
  language.lexicon[0].spellingOverride = true;
  const [identity, plural] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(identity.word, "sella");
  assert.equal(identity.spellingOverride, true);
  assert.equal(plural.word, "selana");
  assert.equal(plural.spellingOverride, false);
});

test("a unique legal syllabification applies the saved stress after inflection", () => {
  const language = fixture([slot("plural", [step("suffix", "", "na")])]);
  language.phonotactics.patterns = [{ pattern: "CV", weight: 1 }];
  language.phonotactics.minSyllables = 1;
  language.phonotactics.maxSyllables = 4;
  language.phonotactics.stress = "penultimate";
  const [result] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(result.error, null);
  assert.equal(result.phonotactics.status, "unique");
  assert.equal(result.ipa, "se.ˈla.na");
  assert.equal(result.syllables.length, 3);
});

test("ambiguous and illegal derived forms keep their phonemes and expose diagnostics", () => {
  const language = fixture([slot("derived", [step("suffix", "", "ta")])], "pa");
  language.phonotactics.minSyllables = 2;
  language.phonotactics.maxSyllables = 2;
  language.phonotactics.patterns = [{ pattern: "CV", weight: 1 }, { pattern: "CVC", weight: 1 }, { pattern: "V", weight: 1 }];
  const [ambiguous] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(ambiguous.error, null);
  assert.equal(ambiguous.ipa, "pata");
  assert.equal(ambiguous.phonotactics.status, "ambiguous");
  assert.ok(ambiguous.phonotactics.reasons.length);

  language.phonotactics.patterns = [{ pattern: "CV", weight: 1 }];
  language.paradigms[0].slots[0].steps = [step("suffix", "", "k")];
  const [invalid] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(invalid.error, null);
  assert.equal(invalid.word, "pak");
  assert.equal(invalid.ipa, "pak");
  assert.equal(invalid.phonotactics.status, "invalid");
  assert.ok(invalid.phonotactics.reasons.length);
});

test("explicit identity stress is preserved and inconsistencies are diagnosed", () => {
  const language = fixture([slot("identity")]);
  language.phonotactics.stress = "final";
  const [identity] = generateInflections(language, "lemma", PHONEMES);
  assert.equal(identity.error, null);
  assert.equal(identity.ipa, "ˈse.la");
  assert.equal(identity.phonotactics.ok, false);
  assert.ok(identity.phonotactics.reasons.some((reason) => /stress/u.test(reason)));
});
