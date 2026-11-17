import test from "node:test";
import assert from "node:assert/strict";
import {
  parseIPA, spellPhonemes, renderPhonemes, analyzeSpelling,
  validateOrthographyRules, applyPhonemeSteps, validatePhonemeSteps,
} from "../dist/phonology.js";

const sounds = [
  ["t", "consonant"], ["s", "consonant"], ["t͡s", "consonant"],
  ["n", "consonant"], ["ŋ", "consonant"], ["ɡ", "consonant"],
  ["k", "consonant"], ["ʃ", "consonant"], ["h", "consonant"],
  ["a", "vowel"], ["i", "vowel"], ["e", "vowel"],
].map(([symbol, type], i) => ({ id: `sound-${i}`, symbol, type }));
const id = (symbol) => sounds.find((p) => p.symbol === symbol).id;
const lang = () => ({
  phonemeIds: sounds.map((p) => p.id),
  orthography: Object.fromEntries(sounds.map((p) => [p.id, ({ "ɡ": "g", "ŋ": "ng", "ʃ": "sh", "t͡s": "ts" })[p.symbol] ?? p.symbol])),
  orthographyRules: [],
  soundClasses: { F: [id("e"), id("i")] },
  phonotactics: { stress: "penultimate" },
});
const rule = (from, to, before = "", after = "", suffix = "1") => ({ id: `rule-${suffix}`, name: `Rule ${suffix}`, from, to, before, after });
const parse = (text, l) => parseIPA(text, l, sounds);

test("IPA parsing preserves whole segments, syllables, explicit stress and normalized symbols", () => {
  const l = lang();
  const form = parse("/ˈt͡s a . g i/", l);
  assert.deepEqual(form.segments, [id("t͡s"), id("a"), id("ɡ"), id("i")]);
  assert.deepEqual(form.syllables, [[id("t͡s"), id("a")], [id("ɡ"), id("i")]]);
  assert.equal(form.ipa, "ˈt͡sa.ɡi");
  assert.equal(form.stressIndex, 0);
  assert.deepEqual(parse("t s a", l).segments, [id("t"), id("s"), id("a")]);
  assert.throws(() => parse("tsa.xa", l), /not selected IPA/u);
  assert.throws(() => parse("a..i", l), /Each syllable/u);
  assert.throws(() => parse("ˈa.ˈi", l), /one primary stress/u);
});

test("contextual spelling sees phonemes rather than spelling, including final and initial boundaries", () => {
  const l = lang();
  l.orthographyRules = [rule("k", "c", "", "F"), rule("ŋ", "n", "", "#", "2"), rule("ʃ", "sch", "#", "", "3")];
  const spell = (text) => spellPhonemes(parse(text, l).segments, l, sounds);
  assert.equal(spell("kika"), "cika");
  assert.equal(spell("ŋaŋ"), "ngan");
  assert.equal(spell("ʃaʃa"), "schasha");
  l.orthography[id("i")] = "q";
  assert.equal(spell("ki"), "cq");
});

test("spelling priority is explicit and matching is on original phonemes, never output text", () => {
  const l = lang();
  l.orthographyRules = [rule("k", "s", "", "F"), rule("s", "z", "", "", "2")];
  assert.equal(spellPhonemes(parse("kisi", l).segments, l, sounds), "sizi");
  l.orthographyRules = [rule("t s", "x"), rule("t", "d", "", "", "2")];
  assert.equal(spellPhonemes(parse("tsa", l).segments, l, sounds), "xa");
  assert.equal(spellPhonemes(parse("t͡sa", l).segments, l, sounds), "tsa");
  l.orthographyRules.reverse();
  assert.equal(spellPhonemes(parse("tsa", l).segments, l, sounds), "dsa");
});

test("orthography validates nonempty outputs, literal segments, class references and boundary placement", () => {
  const l = lang();
  for (const r of [rule("x", "x"), rule("k", ""), rule("k", "c", "Q"), rule("k", "c", "V #"), rule("k", "c", "", "# V")])
    assert.throws(() => validateOrthographyRules([r], l, sounds));
  assert.throws(() => validateOrthographyRules([rule("k", "c"), rule("k", "q")], l, sounds), /unique/u);
});

test("reverse spelling reports ambiguity, including digraph vs separate phonemes", () => {
  const l = lang();
  const result = analyzeSpelling("tsa", l, sounds);
  assert.equal(result.ambiguous, true);
  assert.equal(result.truncated, false);
  assert.deepEqual(new Set(result.candidates.map((c) => c.ipa)), new Set(["tsa", "t͡sa"]));
  assert.equal(analyzeSpelling("?", l, sounds).candidates.length, 0);
});

test("reverse spelling forward-checks context and priority instead of blindly inverting a map", () => {
  const l = lang();
  l.orthographyRules = [rule("k", "c", "", "F")];
  assert.deepEqual(analyzeSpelling("ci", l, sounds).candidates.map((c) => c.ipa), ["ki"]);
  assert.equal(analyzeSpelling("ca", l, sounds).candidates.length, 0);
  assert.equal(analyzeSpelling("ki", l, sounds).candidates.length, 0);
  l.orthography[id("s")] = "c";
  assert.equal(analyzeSpelling("ci", l, sounds).ambiguous, true);
  l.orthography[id("s")] = "s";
  const bounded = analyzeSpelling("ts".repeat(18), l, sounds);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.candidates.length <= 32);
});

test("morphology inserts and replaces whole phonemes; conditions inspect sound classes", () => {
  const l = lang(), initial = parse("t͡sa", l).segments;
  const insert = applyPhonemeSteps(initial, [{ kind: "infix", to: "i" }], l, sounds);
  assert.equal(renderPhonemes(insert, l, sounds).ipa, "t͡sia");
  assert.deepEqual(applyPhonemeSteps(initial, [{ kind: "replace-all", from: "t", to: "k" }], l, sounds), initial);
  const steps = [
    { kind: "suffix", to: "k", condition: "ends-with", test: "V" },
    { kind: "replace-suffix", from: "k", to: "ŋ", condition: "not-starts-with", test: "s" },
  ];
  assert.equal(renderPhonemes(applyPhonemeSteps(initial, steps, l, sounds), l, sounds).ipa, "t͡saŋ");
  l.orthography[id("a")] = "z";
  assert.equal(renderPhonemes(applyPhonemeSteps(initial, [{ kind: "suffix", to: "n", condition: "vowel-final" }], l, sounds), l, sounds).word, "tszn");
});

test("ordered replacements match exact phoneme sequences and allow deletion without empty forms", () => {
  const l = lang(), start = parse("kataka", l).segments;
  const result = applyPhonemeSteps(start, [
    { kind: "replace-all", from: "ka", to: "si" },
    { kind: "replace-prefix", from: "si", to: "" },
    { kind: "replace-whole", from: "tasi", to: "ŋa" },
  ], l, sounds);
  assert.equal(renderPhonemes(result, l, sounds).ipa, "ŋa");
  assert.throws(() => applyPhonemeSteps(result, [{ kind: "replace-whole", from: "ŋa", to: "" }], l, sounds), /entire pronunciation/u);
  assert.throws(() => validatePhonemeSteps([{ kind: "suffix", to: "" }], l, sounds), /at least one phoneme/u);
  assert.throws(() => validatePhonemeSteps([{ kind: "suffix", to: "V" }], l, sounds), /not selected IPA/u);
});

test("rendering does not invent syllabification or stress for a transformed word", () => {
  const l = lang(), form = parse("ˈka.ta", l);
  assert.equal(renderPhonemes(form.segments, l, sounds).ipa, "kata");
  assert.equal(renderPhonemes(form.segments, l, sounds, { syllables: form.syllables, stress: true }).ipa, "ˈka.ta");
  assert.throws(() => renderPhonemes(form.segments, l, sounds, { syllables: [[id("a")]] }), /in order/u);
});
