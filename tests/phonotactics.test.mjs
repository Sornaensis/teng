import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePhonotacticExtras,
  compilePhonotactics,
  weightedSoundChoice,
} from "../dist/phonotactics.js";

const phonemes = [
  { id: "p", symbol: "p", type: "consonant" },
  { id: "t", symbol: "t", type: "consonant" },
  { id: "s", symbol: "s", type: "consonant" },
  { id: "ng", symbol: "ŋ", type: "consonant" },
  { id: "ts", symbol: "t͡s", type: "other" },
  { id: "a", symbol: "a", type: "vowel" },
  { id: "i", symbol: "i", type: "vowel" },
  { id: "long-a", symbol: "aː", type: "vowel" },
  { id: "k", symbol: "k", type: "consonant" },
];
const fresh = () => ({
  phonemeIds: phonemes.filter((p) => p.id !== "k").map((p) => p.id),
  soundClasses: { N: ["ng"], S: ["s", "ts"] },
  phonotactics: {
    optionalProbability: 0.5,
    phonemeWeights: {},
    constraints: [],
  },
});
const rule = (overrides = {}) => ({
  id: "constraint-1",
  name: "No initial velar nasal",
  scope: "word",
  position: "start",
  mode: "forbid",
  sequence: "ŋ",
  ...overrides,
});
function checker(rules) {
  const language = fresh();
  language.phonotactics.constraints = rules;
  return compilePhonotactics(language, phonemes);
}

test("validation copies current phonotactic fields without mutating input", () => {
  const language = fresh();
  assert.deepEqual(
    validatePhonotacticExtras(language.phonotactics, language, phonemes),
    { optionalProbability: 0.5, phonemeWeights: {}, constraints: [] },
  );
  const input = {
    optionalProbability: 0.3,
    phonemeWeights: { p: 2 },
    ignored: "discard",
    constraints: [rule({ sequence: "  C\t V \n C " })],
  };
  const before = structuredClone(input);
  const sanitized = validatePhonotacticExtras(input, language, phonemes);
  assert.deepEqual(input, before);
  assert.equal(sanitized.constraints[0].sequence, "C V C");
  assert.equal("ignored" in sanitized, false);
  sanitized.phonemeWeights.p = 7;
  sanitized.constraints[0].name = "different";
  assert.equal(input.phonemeWeights.p, 2);
  assert.equal(input.constraints[0].name, "No initial velar nasal");
});

test("current phonotactic fields are required by validation and compilation", () => {
  for (const [field, message] of [
    ["optionalProbability", /probability/u],
    ["phonemeWeights", /weights/u],
    ["constraints", /constraints/u],
  ]) {
    for (const missing of [true, false]) {
      const language = fresh();
      if (missing) delete language.phonotactics[field];
      else language.phonotactics[field] = undefined;
      assert.throws(
        () =>
          validatePhonotacticExtras(language.phonotactics, language, phonemes),
        message,
      );
      assert.throws(() => compilePhonotactics(language, phonemes), message);
    }
  }
  for (const constraints of [null, {}, "", false]) {
    const language = fresh();
    language.phonotactics.constraints = constraints;
    assert.throws(() => compilePhonotactics(language, phonemes), /constraints/u);
  }
});

test("probabilities and weights reject invalid values and stale inventory IDs", () => {
  for (const optionalProbability of [-0.1, 1.1, Infinity, NaN, null, "0.5"])
    assert.throws(
      () =>
        validatePhonotacticExtras(
          { ...fresh().phonotactics, optionalProbability },
          fresh(),
          phonemes,
        ),
      /probability/u,
    );
  for (const optionalProbability of [0, 0.1, 1])
    assert.equal(
      validatePhonotacticExtras(
        { ...fresh().phonotactics, optionalProbability },
        fresh(),
        phonemes,
      ).optionalProbability,
      optionalProbability,
    );
  for (const weight of [0, -1, 1001, Infinity, NaN, "2", null])
    assert.throws(
      () =>
        validatePhonotacticExtras(
          { ...fresh().phonotactics, phonemeWeights: { p: weight } },
          fresh(),
          phonemes,
        ),
      /Weight/u,
    );
  for (const id of ["unknown", "k"])
    assert.throws(
      () =>
        validatePhonotacticExtras(
          { ...fresh().phonotactics, phonemeWeights: { [id]: 1 } },
          fresh(),
          phonemes,
        ),
      /stale sound/u,
    );
  for (const phonemeWeights of [[], null, 1])
    assert.throws(
      () =>
        validatePhonotacticExtras(
          { ...fresh().phonotactics, phonemeWeights },
          fresh(),
          phonemes,
        ),
      /weights/u,
    );
});

test("weighted sampling honors intervals and consumes exactly one RNG draw", () => {
  const ids = ["p", "t", "s"];
  const weights = { p: 1, t: 3, s: 6 };
  for (const [draw, expected] of [
    [0, "p"],
    [0.099, "p"],
    [0.1, "t"],
    [0.399, "t"],
    [0.4, "s"],
    [0.999, "s"],
  ]) {
    let calls = 0;
    assert.equal(
      weightedSoundChoice(ids, weights, () => {
        calls++;
        return draw;
      }),
      expected,
    );
    assert.equal(calls, 1);
  }
  let singletonCalls = 0;
  assert.equal(
    weightedSoundChoice(["p"], {}, () => {
      singletonCalls++;
      return 0.7;
    }),
    "p",
  );
  assert.equal(singletonCalls, 1);
});

test("unspecified sound weights sample uniformly from a seeded RNG stream", () => {
  function seeded(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  }
  const ids = ["p", "t", "s", "ng", "ts"];
  const reference = seeded(7531),
    sampled = seeded(7531);
  for (let index = 0; index < 200; index++)
    assert.equal(
      weightedSoundChoice(ids, {}, sampled),
      ids[Math.floor(reference() * ids.length)],
    );
  assert.equal(
    reference(),
    sampled(),
    "the surrounding generator sees the same next draw",
  );
});

test("invalid sampling inputs fail without silent bias or empty results", () => {
  assert.throws(
    () => weightedSoundChoice([], {}, () => 0),
    /empty sound class/u,
  );
  assert.throws(() => weightedSoundChoice(["p"], { p: 0 }, () => 0), /Weight/u);
  for (const draw of [1, -0.1, NaN, Infinity, "0.1"])
    assert.throws(
      () => weightedSoundChoice(["p"], {}, () => draw),
      /random-number function/u,
    );
  const inheritedWeights = Object.create({ p: 1000 });
  assert.equal(
    weightedSoundChoice(["p", "t"], inheritedWeights, () => 0.6),
    "t",
  );
});

test("word rules match across syllable boundaries, while syllable rules do not", () => {
  const word = checker([rule({ sequence: "t s", position: "anywhere" })]);
  const perSyllable = checker([
    rule({ sequence: "t s", position: "anywhere", scope: "syllable" }),
  ]);
  const candidate = [
    ["a", "t"],
    ["s", "a"],
  ];
  assert.equal(word(candidate).ok, false);
  assert.equal(perSyllable(candidate).ok, true);
  assert.equal(perSyllable([["a", "t", "s", "a"]]).ok, false);
});

test("start and end anchors apply to the actual unit boundary", () => {
  const start = checker([rule()]);
  assert.equal(start([["ng", "a"]]).ok, false);
  assert.equal(
    start([
      ["p", "a"],
      ["ng", "a"],
    ]).ok,
    true,
  );
  const end = checker([rule({ position: "end", sequence: "a ŋ" })]);
  assert.equal(end([["a"], ["ng"]]).ok, false);
  assert.equal(
    end([
      ["a", "ng"],
      ["p", "a"],
    ]).ok,
    true,
  );
  assert.equal(
    end([["ng"]]).ok,
    true,
    "a longer sequence cannot match a shorter word",
  );
  const syllableStart = checker([rule({ scope: "syllable" })]);
  assert.equal(
    syllableStart([
      ["p", "a"],
      ["ng", "a"],
    ]).ok,
    false,
  );
});

test("required syllable constraints must match every syllable", () => {
  const check = checker([
    rule({
      name: "Vowel in each syllable",
      scope: "syllable",
      position: "anywhere",
      mode: "require",
      sequence: "V",
    }),
  ]);
  assert.equal(
    check([
      ["p", "a"],
      ["s", "i"],
    ]).ok,
    true,
  );
  const failed = check([
    ["p", "a"],
    ["s", "t"],
  ]);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.failedConstraintIds, ["constraint-1"]);
  assert.match(failed.reasons[0], /Vowel in each syllable.*syllable 2/u);
  const wordOnly = checker([
    rule({ position: "anywhere", mode: "require", sequence: "V" }),
  ]);
  assert.equal(
    wordOnly([
      ["p", "a"],
      ["s", "t"],
    ]).ok,
    true,
  );
});

test("class matching uses membership including custom classes and other consonants", () => {
  const check = checker([rule({ sequence: "N V", position: "anywhere" })]);
  assert.equal(check([["ng", "a"]]).ok, false);
  assert.equal(check([["s", "a"]]).ok, true);
  const consonant = checker([rule({ sequence: "C V", mode: "require" })]);
  assert.equal(consonant([["ts", "a"]]).ok, true);
  assert.equal(consonant([["a", "ts"]]).ok, false);
  const allConsonants = checker([
    rule({ sequence: "C C C", position: "anywhere" }),
  ]);
  assert.equal(
    allConsonants([
      ["p", "t"],
      ["ts", "a"],
    ]).ok,
    false,
  );
});

test("multi-character IPA symbols are atomic rather than character substrings", () => {
  const separate = checker([rule({ sequence: "t s", position: "anywhere" })]);
  assert.equal(separate([["ts", "a"]]).ok, true);
  assert.equal(separate([["t", "s", "a"]]).ok, false);
  const affricate = checker([rule({ sequence: "t͡s", position: "anywhere" })]);
  assert.equal(affricate([["t", "s", "a"]]).ok, true);
  assert.equal(affricate([["ts", "a"]]).ok, false);
  const shortVowel = checker([rule({ sequence: "a", position: "anywhere" })]);
  assert.equal(shortVowel([["p", "long-a"]]).ok, true);
  assert.equal(shortVowel([["p", "a"]]).ok, false);
});

test("empty and unknown tokens, malformed rules, and stale classes are rejected", () => {
  for (const sequence of ["", "   ", "ts", "k", "X", "C*", "[s]", "C|V", "CV"])
    assert.throws(() => checker([rule({ sequence })]));
  for (const overrides of [
    { scope: "onset" },
    { position: "middle" },
    { mode: "prefer" },
    { id: "" },
    { name: "" },
  ])
    assert.throws(() => checker([rule(overrides)]));
  assert.throws(() => checker([rule(), rule()]), /Duplicate/u);
  const language = fresh();
  language.soundClasses.N = ["k"];
  assert.throws(() => compilePhonotactics(language, phonemes), /stale sound/u);
  language.soundClasses.N = [];
  language.phonotactics.constraints = [rule({ sequence: "N" })];
  assert.throws(
    () => compilePhonotactics(language, phonemes),
    /no selected sounds/u,
  );
});

test("a compiled checker reports every failed rule without mutating input", () => {
  const check = checker([
    rule({ id: "start", name: "No initial nasal" }),
    rule({
      id: "vowel",
      name: "Must end in vowel",
      mode: "require",
      sequence: "V",
      position: "end",
    }),
  ]);
  const candidate = [["ng", "a", "p"]],
    before = structuredClone(candidate);
  const result = check(candidate);
  assert.deepEqual(result.failedConstraintIds, ["start", "vowel"]);
  assert.equal(result.reasons.length, 2);
  assert.deepEqual(candidate, before);
  assert.equal(check.extras.optionalProbability, 0.5);
  for (const invalid of [null, [], [[]], [["unknown"]], [["k"]]]) {
    const rejected = check(invalid);
    assert.equal(rejected.ok, false);
    assert.ok(rejected.reasons.length);
  }
});

test("complete word check validates syllable shapes, counts, constraints and stress", async () => {
  const { compileWordPhonotactics } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, {
    patterns: [{ pattern: "(C)V(N)", weight: 1 }],
    minSyllables: 2, maxSyllables: 3, stress: "penultimate", banned: [],
    constraints: [rule({ position: "start", sequence: "ŋ" })],
  });
  const check = compileWordPhonotactics(l, phonemes);
  const good = check([["p", "a"], ["ts", "i", "ng"]]);
  assert.equal(good.ok, true);
  assert.equal(good.ipa, "ˈpa.t͡siŋ");
  assert.deepEqual(good.syllablePatterns.map((match) => match.patterns), [["(C)V(N)"], ["(C)V(N)"]]);
  const bad = check([["ng", "a", "s"]], { stressIndex: 1 });
  assert.equal(bad.ok, false);
  assert.equal(bad.reasons.length, 4);
  assert.match(bad.reasons.join(" "), /Expected 2–3 syllables/u);
  assert.match(bad.reasons.join(" "), /does not match any saved pattern/u);
  assert.match(bad.reasons.join(" "), /No initial velar nasal/u);
  assert.match(bad.reasons.join(" "), /primary stress on syllable 1/u);
});

test("complete check matches nested optional groups atomically without expansion", async () => {
  const { compileWordPhonotactics } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, {
    patterns: [{ pattern: "(C(S))V(C)?", weight: 1 }],
    minSyllables: 1, maxSyllables: 1, stress: "none", banned: [],
  });
  const check = compileWordPhonotactics(l, phonemes);
  assert.equal(check([["p", "s", "long-a", "ts"]]).ok, true);
  assert.equal(check([["a"]]).ok, true);
  assert.equal(check([["p", "t", "a"]]).ok, false, "the nested S class is respected");
  assert.equal(check([["t", "s", "a", "t", "s"]]).ok, false, "t + s is not the affricate phoneme");
  assert.equal(check([["a"]], { stressIndex: 0 }).ok, false);
});

test("complete check combines forbidden text with structured checks and validates definitions", async () => {
  const { compileWordPhonotactics, parseSyllablePattern } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, {
    patterns: [{ pattern: "CV", weight: 1 }],
    minSyllables: 2, maxSyllables: 2, stress: "final", banned: ["ap"],
  });
  const check = compileWordPhonotactics(l, phonemes);
  const result = check([["t", "a"], ["p", "i"]]);
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /Forbidden IPA text/u);
  assert.equal(result.ipa, "ta.ˈpi");
  assert.equal(check([["k", "a"]]).ok, false);
  assert.equal(check([[]]).ok, false);
  for (const pattern of ["", "V*", "()V", "(V", "V)"])
    assert.throws(() => parseSyllablePattern(pattern));
  l.phonotactics.patterns = [{ pattern: "XV", weight: 1 }];
  assert.throws(() => compileWordPhonotactics(l, phonemes), /class X/i);
});

test("phoneme-form analysis finds only syllabifications licensed by whole-phoneme patterns", async () => {
  const { analyzePhonemeForm } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, { patterns: [{ pattern: "CV", weight: 1 }], minSyllables: 2, maxSyllables: 3, stress: "penultimate", banned: [] });
  const input = ["ts", "long-a", "p", "i"];
  const before = [...input];
  const result = analyzePhonemeForm(input, l, phonemes);
  assert.equal(result.status, "unique");
  assert.equal(result.ok, true);
  assert.equal(result.ambiguous, false);
  assert.equal(result.truncated, false);
  assert.equal(result.candidates[0].ipa, "ˈt͡saː.pi");
  assert.deepEqual(result.syllables, [["ts", "long-a"], ["p", "i"]]);
  assert.deepEqual(input, before);
  result.syllables[0].push("a");
  assert.deepEqual(input, before, "returned boundaries do not alias the input");
  assert.equal(result.candidates[0].syllables[0].length, 2, "top-level boundaries do not alias the candidate either");
});

test("ambiguous syllabification never chooses one partition implicitly", async () => {
  const { analyzePhonemeForm } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, { patterns: [{ pattern: "V", weight: 1 }, { pattern: "VV", weight: 1 }], minSyllables: 1, maxSyllables: 2, stress: "final", banned: [] });
  const result = analyzePhonemeForm(["a", "i"], l, phonemes);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.ok, true);
  assert.equal(result.ambiguous, true);
  assert.equal(result.truncated, false);
  assert.equal(result.syllables, null);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(new Set(result.candidates.map((candidate) => candidate.ipa)), new Set(["a.ˈi", "ˈai"]));
  assert.match(result.reasons[0], /explicit syllable boundaries/u);
});

test("syllable constraints can resolve ambiguity while word constraints reject all partitions", async () => {
  const { analyzePhonemeForm } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, { patterns: [{ pattern: "V", weight: 1 }, { pattern: "VV", weight: 1 }], minSyllables: 1, maxSyllables: 2, stress: "initial", banned: [], constraints: [rule({ name: "End every syllable in i", sequence: "i", scope: "syllable", mode: "require", position: "end" })] });
  const resolved = analyzePhonemeForm(["a", "i"], l, phonemes);
  assert.equal(resolved.status, "unique");
  assert.deepEqual(resolved.syllables, [["a", "i"]]);
  l.phonotactics.constraints = [rule({ name: "No adjacent vowels", sequence: "V V", position: "anywhere" })];
  const rejected = analyzePhonemeForm(["a", "i"], l, phonemes);
  assert.equal(rejected.status, "invalid");
  assert.match(rejected.reasons[0], /No adjacent vowels/u);
  assert.deepEqual(rejected.candidates, []);
});

test("invalid derived forms retain actionable diagnostics without changing their phonemes", async () => {
  const { analyzePhonemeForm } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, { patterns: [{ pattern: "CV", weight: 1 }], minSyllables: 1, maxSyllables: 2, stress: "initial", banned: [] });
  const input = ["p", "a", "s"];
  const result = analyzePhonemeForm(input, l, phonemes);
  assert.equal(result.status, "invalid");
  assert.equal(result.ok, false);
  assert.equal(result.truncated, false);
  assert.equal(result.syllables, null);
  assert.match(result.reasons[0], /saved patterns \(CV\)/u);
  assert.deepEqual(input, ["p", "a", "s"]);
  const tooLong = analyzePhonemeForm(["p", "a", "p", "a", "p", "a"], l, phonemes);
  assert.match(tooLong.reasons[0], /more than 2 syllables/u);
  l.phonotactics.banned = ["pa"];
  assert.match(analyzePhonemeForm(["p", "a"], l, phonemes).reasons[0], /Forbidden IPA text/u);
  assert.equal(analyzePhonemeForm(["k", "a"], l, phonemes).status, "invalid");
});

test("syllabification enumeration and work budgets report incomplete search explicitly", async () => {
  const { analyzePhonemeForm, PHONOTACTIC_LIMITS } = await import("../dist/phonotactics.js");
  const l = fresh();
  Object.assign(l.phonotactics, { patterns: [{ pattern: "V", weight: 1 }, { pattern: "VV", weight: 1 }], minSyllables: 1, maxSyllables: 12, stress: "initial", banned: [] });
  const many = analyzePhonemeForm(Array(8).fill("a"), l, phonemes);
  assert.equal(many.status, "ambiguous");
  assert.equal(many.candidates.length, PHONOTACTIC_LIMITS.analysisCandidates);
  assert.equal(many.truncated, true);
  assert.equal(many.syllables, null);
  l.phonotactics.patterns = Array.from({ length: 64 }, () => ({ pattern: "(V)".repeat(20), weight: 1 }));
  l.phonotactics.minSyllables = l.phonotactics.maxSyllables = 12;
  const hard = analyzePhonemeForm(Array(240).fill("a"), l, phonemes);
  assert.equal(hard.status, "incomplete");
  assert.equal(hard.truncated, true);
  assert.equal(hard.syllables, null);
  assert.match(hard.reasons.join(" "), /limit/u);
  const oversized = analyzePhonemeForm(Array(PHONOTACTIC_LIMITS.analysisSegments + 1).fill("a"), l, phonemes);
  assert.equal(oversized.status, "incomplete");
});
