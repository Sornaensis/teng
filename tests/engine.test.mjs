import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  createLanguage,
  generateWords,
  parsePattern,
  applyMorphology,
  validateWorkspace,
  exportWorkspace,
  parseLexiconCSV,
  toCSV,
} from "../dist/engine.js";

const sounds = "p b t d k g m n ŋ f s z ʃ h l r j w i e a o u"
  .split(" ")
  .map((symbol, index) => ({
    id: `p${index}`,
    symbol,
    type: "ieaou".includes(symbol) ? "vowel" : "consonant",
  }));
const sound = (symbol) => sounds.find((p) => p.symbol === symbol).id;
const fresh = () => createWorkspace(sounds);
const language = () => fresh().languages.find((l) => l.name === "Selari");

test("demo workspace round-trips through full schema validation", () => {
  const workspace = fresh();
  assert.deepEqual(
    validateWorkspace(JSON.parse(exportWorkspace(workspace)), sounds),
    workspace,
  );
});

test("inherited languages hold independent snapshots and fresh entry IDs", () => {
  const source = language();
  const child = createLanguage(
    { name: "Daughter", familyId: source.familyId, source },
    sounds,
  );
  assert.equal(child.parentId, source.id);
  assert.notEqual(child.lexicon[0].id, source.lexicon[0].id);
  child.phonemeIds.pop();
  child.phonotactics.patterns[0].weight = 77;
  child.lexicon[0].word = "changed";
  assert.notEqual(child.phonemeIds.length, source.phonemeIds.length);
  assert.equal(source.phonotactics.patterns[0].weight, 6);
  assert.equal(source.lexicon[0].word, "sela");
});

test("fixed seed, phonotactics and orthography generate deterministic unique words", () => {
  const l = language();
  l.phonotactics.patterns = [{ pattern: "CVN", weight: 1 }];
  l.phonotactics.minSyllables = l.phonotactics.maxSyllables = 2;
  const first = generateWords(l, sounds, { count: 100, seed: "stable" });
  const second = generateWords(l, sounds, { count: 100, seed: "stable" });
  assert.deepEqual(first, second);
  assert.equal(first.words.length, 100);
  assert.equal(new Set(first.words.map((w) => w.word)).size, 100);
  for (const w of first.words) {
    assert.equal(w.syllables.length, 2);
    assert.equal(w.segments.length, 6);
    assert.match(w.ipa, /^ˈ/u);
    assert.equal(w.word, w.segments.map((id) => l.orthography[id]).join(""));
    for (const syllable of w.syllables) {
      assert.equal(sounds.find((p) => p.id === syllable[0]).type, "consonant");
      assert.equal(sounds.find((p) => p.id === syllable[1]).type, "vowel");
      assert.ok(l.soundClasses.N.includes(syllable[2]));
    }
  }
});

test("generator maps whole phoneme IDs, not characters, including digraphs", () => {
  const l = language();
  l.phonemeIds = [sound("ŋ"), sound("a")];
  l.soundClasses = {};
  l.phonotactics = {
    patterns: [{ pattern: "CV", weight: 1 }],
    minSyllables: 1,
    maxSyllables: 1,
    stress: "none",
    banned: [],
    optionalProbability: 0.5,
    phonemeWeights: {},
    constraints: [],
  };
  assert.deepEqual(generateWords(l, sounds, { count: 1, seed: "x" }).words[0], {
    word: "nga",
    ipa: "ŋa",
    segments: [sound("ŋ"), sound("a")],
    syllables: [[sound("ŋ"), sound("a")]],
  });
});

test("optional groups produce correct syllable ranges and nonempty syllables", () => {
  const l = language();
  l.phonotactics.patterns = [{ pattern: "(C)V(C)", weight: 1 }];
  const result = generateWords(l, sounds, {
    count: 100,
    seed: "options",
    minSyllables: 1,
    maxSyllables: 3,
  });
  const lengths = new Set();
  for (const word of result.words) {
    assert.ok(word.syllables.length >= 1 && word.syllables.length <= 3);
    for (const syllable of word.syllables) {
      assert.ok(syllable.length >= 1 && syllable.length <= 3);
      assert.equal(
        syllable.filter(
          (id) => sounds.find((p) => p.id === id).type === "vowel",
        ).length,
        1,
      );
      lengths.add(syllable.length);
    }
  }
  assert.deepEqual([...lengths].sort(), [1, 2, 3]);
});

test("invalid syntax and empty or stale classes fail before generation", () => {
  for (const pattern of ["C(V", "C)V", "CV|CVC", "C2V", "()", "cv", "C**"])
    assert.throws(() => parsePattern(pattern));
  const l = language();
  l.phonotactics.patterns = [{ pattern: "XV", weight: 1 }];
  assert.throws(() => generateWords(l, sounds), /Class X has no sounds/u);
  l.soundClasses.X = ["unknown"];
  assert.throws(() => generateWords(l, sounds), /outside this language/u);
  l.phonotactics.patterns = [{ pattern: "CV", weight: 0 }];
  assert.throws(() => generateWords(l, sounds), /weights/u);
});

test("finite generation reports exhaustion instead of looping or silently duplicating", () => {
  const l = language();
  l.phonemeIds = [sound("p"), sound("a")];
  l.soundClasses = {};
  l.phonotactics = {
    patterns: [{ pattern: "CV", weight: 1 }],
    minSyllables: 1,
    maxSyllables: 1,
    stress: "none",
    banned: [],
    optionalProbability: 0.5,
    phonemeWeights: {},
    constraints: [],
  };
  const result = generateWords(l, sounds, { count: 12, seed: "limited" });
  assert.equal(result.words.length, 1);
  assert.equal(result.words[0].word, "pa");
  assert.equal(result.warnings.length, 1);
  l.lexicon.push({ word: "PA" });
  assert.equal(generateWords(l, sounds, { count: 1 }).words.length, 0);
});

test("forbidden sequences apply across syllable boundaries and not to spelling", () => {
  const l = language();
  l.phonemeIds = [sound("ŋ"), sound("a")];
  l.soundClasses = {};
  l.phonotactics = {
    patterns: [{ pattern: "CV", weight: 1 }],
    minSyllables: 2,
    maxSyllables: 2,
    stress: "final",
    banned: ["aŋ"],
    optionalProbability: 0.5,
    phonemeWeights: {},
    constraints: [],
  };
  assert.equal(generateWords(l, sounds, { count: 1 }).words.length, 0);
  l.phonotactics.banned = ["ang"];
  const [word] = generateWords(l, sounds, { count: 1 }).words;
  assert.equal(word.word, "nganga");
  assert.equal(word.ipa, "ŋa.ˈŋa");
});

test("workspace validation rejects unsupported backups and broken lineage", () => {
  const w = fresh();
  for (const schemaVersion of [2, 1, 0, 999, "3", undefined]) {
    const rejected = { ...w, schemaVersion };
    const original = structuredClone(rejected);
    assert.throws(
      () => validateWorkspace(rejected, sounds),
      /Unsupported backup.*requires version 3/u,
    );
    assert.deepEqual(rejected, original);
  }
  w.languages[0].parentId = w.languages[1].id;
  assert.throws(() => validateWorkspace(w, sounds), /cycle/u);
  w.languages[0].parentId = "missing";
  assert.throws(() => validateWorkspace(w, sounds), /parent language/u);
  w.languages[0].parentId = null;
  w.languages[1].familyId = "missing";
  assert.throws(
    () => validateWorkspace(w, sounds),
    /same family|not in the backup/u,
  );
});

test("workspace validation rejects duplicate IDs and unknown sound references", () => {
  const w = fresh();
  w.languages[1].id = w.languages[0].id;
  assert.throws(() => validateWorkspace(w, sounds), /duplicate ID/u);
  const other = fresh();
  other.languages[0].phonemeIds.push("fake-sound");
  assert.throws(() => validateWorkspace(other, sounds), /unknown sound/u);
  const third = fresh();
  third.languages[0].soundClasses.X = ["fake-sound"];
  assert.throws(
    () => validateWorkspace(third, sounds),
    /outside its inventory/u,
  );
});

test("workspace validation rejects empty workspaces before they can replace saved data", () => {
  const w = fresh();
  assert.throws(
    () => validateWorkspace({ ...w, families: [], languages: [] }, sounds),
    /at least one language family/u,
  );
  assert.throws(
    () => validateWorkspace({ ...w, languages: [] }, sounds),
    /at least one language/u,
  );
});

test("identifiers cannot contain markup or unsafe attribute characters", () => {
  const mutations = [
    (w) => {
      w.id = "<script>";
    },
    (w) => {
      w.families[0].id = 'family" autofocus="true';
    },
    (w) => {
      w.languages[0].id = "lang'";
    },
    (w) => {
      w.languages[0].familyId = "family with spaces";
    },
    (w) => {
      w.languages[0].parentId = "lang<";
    },
    (w) => {
      w.languages[1].morphemes[0].id = "morpheme>";
    },
    (w) => {
      w.languages[1].morphologyRules[0].id = "rule&";
    },
    (w) => {
      w.languages[1].lexicon[0].id = "entry=";
    },
    (w) => {
      w.languages[1].lexicon[0].conceptId = 'concept"';
    },
  ];
  for (const mutate of mutations) {
    const w = fresh();
    mutate(w);
    assert.throws(() => validateWorkspace(w, sounds), /only ASCII letters/u);
  }
});

test("blank spelling mappings are rejected by imports and direct generation", () => {
  for (const spelling of ["", "   "]) {
    const w = fresh();
    w.languages[1].orthography[sound("a")] = spelling;
    assert.throws(
      () => validateWorkspace(w, sounds),
      /spelling cannot be empty/u,
    );
    const l = w.languages[1];
    l.phonemeIds = [sound("a")];
    l.soundClasses = {};
    l.phonotactics.patterns = [{ pattern: "V", weight: 1 }];
    assert.throws(
      () => generateWords(l, sounds),
      /Spelling mapping cannot be empty/u,
    );
  }
});

test("morphology applies operations and conditions to pronunciation before spelling", () => {
  const l = language();
  const apply = (base, rule) => applyMorphology(base, rule, l, sounds);
  const rule = { kind: "suffix", form: "na", condition: "always" };
  assert.equal(apply("sela", rule).word, "selana");
  assert.equal(apply("sela", { ...rule, condition: "consonant-final" }).word, "sela");
  l.orthography[sound("a")] = "q";
  assert.equal(apply("sela", { ...rule, condition: "vowel-final" }).word, "selqnq");
  l.orthography[sound("a")] = "a";
  assert.equal(apply("sela", { kind: "prefix", form: "ta" }).ipa, "tasela");
  assert.equal(apply("sela", { kind: "infix", form: "um" }).ipa, "sumela");
  assert.equal(apply("sela", { kind: "circumfix", form: "a", secondForm: "i" }).ipa, "aselai");
  assert.equal(apply("sela", { kind: "reduplication", form: "" }).ipa, "selasela");
  assert.throws(() => apply("sela", { kind: "reduplication", form: "-" }), /not selected IPA/u);
  assert.throws(() => apply("sela", { kind: "script", form: "anything" }), /Morphology operation/u);
  assert.throws(() => apply({ word: "sela", ipa: "", segments: [] }, rule), /Add a pronunciation/u);
  assert.throws(() => apply({ ...l.lexicon[0], pos: "verb" }, { ...rule, pos: "noun" }), /applies to noun/u);
  assert.equal(apply(l.lexicon[0], { ...rule, pos: "any" }).word, "selana");
  assert.throws(() => apply(l.lexicon[0], { ...rule, pos: "other" }), /applies to other/u);
});

test("dictionary pronunciation and contextual rules survive schema validation", () => {
  const w = fresh(), l = w.languages[1];
  l.orthographyRules = [{ id: "soft-k", name: "Soft k", from: "k", to: "c", before: "", after: "V" }];
  l.lexicon[0].spellingOverride = true;
  const roundtrip = validateWorkspace(JSON.parse(exportWorkspace(w)), sounds);
  assert.deepEqual(roundtrip, w);
  assert.ok(roundtrip.languages[1].lexicon[0].segments.length);
  const bad = structuredClone(w);
  bad.languages[1].lexicon[0].segments[0] = sound("p");
  assert.throws(() => validateWorkspace(bad, sounds), /disagree/u);
  delete l.orthographyRules;
  assert.throws(() => validateWorkspace(w, sounds), /Orthography rules/u);
});

test("unknown phonemes in executable rules are rejected at import", () => {
  const cases = [
    (l) => { l.morphologyRules[0].form = "x"; },
    (l) => { l.paradigms[0].slots[0].steps = [{ kind: "suffix", to: "x" }]; },
    (l) => { l.orthographyRules = [{ id: "unknown", name: "Unknown", from: "x", to: "x", before: "", after: "" }]; },
    (l) => { l.grammar.wordOrder = "x"; },
  ];
  for (const mutate of cases) {
    const w = fresh(); mutate(w.languages[1]);
    assert.throws(() => validateWorkspace(w, sounds));
  }
});

test("CSV round-trip preserves commas, quotes, newlines, Unicode and tags", () => {
  const entry = language().lexicon[0];
  Object.assign(entry, {
    word: "śéla",
    gloss: "star, light",
    definition: 'A “star” with a "quoted"\nmultiline definition.',
    tags: ["bright;small", "sky"],
    notes: "a,b",
    conceptId: "concept-star",
  });
  const [parsed] = parseLexiconCSV(toCSV([entry]));
  for (const key of [
    "word",
    "ipa",
    "gloss",
    "definition",
    "pos",
    "tags",
    "conceptId",
    "notes",
  ])
    assert.deepEqual(parsed[key], entry[key]);
});

test("CSV import constructs complete unassigned lexemes for the current schema", () => {
  const workspace = fresh();
  const [entry] = parseLexiconCSV("word,gloss\nmela,moon");
  assert.equal(entry.entryType, "lexeme");
  assert.equal(entry.paradigmId, null);
  assert.deepEqual(entry.stems, {});
  assert.deepEqual(entry.overrides, {});
  assert.equal(entry.source, null);
  workspace.languages[1].lexicon.push(entry);
  assert.doesNotThrow(() => validateWorkspace(workspace, sounds));
});

test("CSV exports neutralize spreadsheet formulas and round-trip literal prefixes", () => {
  for (const content of [
    '=HYPERLINK("bad")',
    "+formula",
    "-formula",
    "@formula",
    "'=literal",
    "''literal",
    "'literal",
  ]) {
    const entry = { ...language().lexicon[0], definition: content };
    const csv = toCSV([entry]);
    const [parsed] = parseLexiconCSV(csv);
    assert.equal(parsed.definition, content);
    if (/^[=+\-@]/u.test(content))
      assert.ok(csv.includes(`"'${content.replaceAll('"', '""')}"`));
  }
});

test("malformed CSV is rejected atomically rather than partially imported", () => {
  for (const source of [
    "word,definition\na,b",
    "word,gloss\na",
    'word,gloss\n"a,b',
    'word,gloss\na,"b"oops',
    "word,word,gloss\na,b,c",
    "word,gloss\n,meaning",
  ])
    assert.throws(() => parseLexiconCSV(source));
  const entries = parseLexiconCSV("word,gloss,tags\na,thing,one;two\nb,other,");
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].tags, ["one", "two"]);
});

test("generation and morphology share the contextual spelling renderer", () => {
  const l = language();
  l.phonemeIds = [sound("k"), sound("i")];
  l.soundClasses = {};
  l.lexicon = [];
  l.phonotactics.patterns = [{ pattern: "CV", weight: 1 }];
  l.phonotactics.minSyllables = l.phonotactics.maxSyllables = 1;
  l.phonotactics.stress = "none";
  l.orthographyRules = [{ id: "soft-k", name: "Soft k", from: "k", to: "c", before: "", after: "i" }];
  const [generated] = generateWords(l, sounds, { count: 1, seed: "contextual" }).words;
  assert.equal(generated.word, "ci");
  assert.equal(generated.ipa, "ki");
  const derived = applyMorphology("k", { kind: "suffix", form: "i" }, l, sounds);
  assert.equal(derived.word, generated.word);
  assert.deepEqual(derived.segments, generated.segments);
});


test("importing canonical phonemes without IPA produces an unmarked display that survives an edit", () => {
  const workspace = fresh();
  const original = structuredClone(workspace.languages[1].lexicon[0]);
  workspace.languages[1].lexicon[0].ipa = "";
  const imported = validateWorkspace(JSON.parse(exportWorkspace(workspace)), sounds);
  const entry = imported.languages[1].lexicon[0];
  assert.equal(entry.ipa, "se.la");
  assert.deepEqual(entry.segments, original.segments);
  assert.deepEqual(entry.syllables, original.syllables);
  entry.gloss = "a revised meaning";
  const saved = validateWorkspace(JSON.parse(exportWorkspace(imported)), sounds).languages[1].lexicon[0];
  assert.equal(saved.ipa, "se.la");
  assert.deepEqual(saved.segments, original.segments);
  assert.deepEqual(saved.syllables, original.syllables);
});
