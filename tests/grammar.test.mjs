import test from "node:test";
import assert from "node:assert/strict";
import { composeClause, entriesForRole, validateGrammarOrders } from "../dist/grammar.js";

const language = () => ({
  grammar: { wordOrder: "SOV", adjectiveOrder: "Before noun", possessorOrder: "Before noun", adposition: "Postpositions" },
  lexicon: [
    { id: "s", word: "mira", ipa: "mira", gloss: "person", pos: "noun" },
    { id: "v", word: "len", ipa: "len", gloss: "sees", pos: "verb" },
    { id: "o", word: "selam", ipa: "selam", gloss: "star (accusative)", pos: "noun", entryType: "form" },
    { id: "a", word: "suri", ipa: "suri", gloss: "bright", pos: "adjective" },
    { id: "p", word: "nari", ipa: "nari", gloss: "our", pos: "pronoun" },
    { id: "d", word: "te", ipa: "te", gloss: "near", pos: "preposition" },
  ],
});
const selection = { subject: "s", verb: "v", object: "o", adjective: "a", possessor: "p", adposition: "d" };

test("clause assembly executes ordering rules over explicit dictionary forms", () => {
  const l = language();
  const before = structuredClone(l);
  const result = composeClause(l, selection);
  assert.equal(result.variants.length, 1);
  assert.equal(result.variants[0].text, "mira nari suri selam te len");
  assert.equal(result.variants[0].ipa, "mira nari suri selam te len");
  assert.deepEqual(result.variants[0].tokens.map((item) => item.role), ["subject", "possessor", "adjective", "object", "adposition", "verb"]);
  assert.equal(result.variants[0].tokens.find((token) => token.role === "object").entryId, "o");
  assert.deepEqual(l, before);
});

test("modifier and adposition rules alter the whole object phrase", () => {
  const l = language();
  Object.assign(l.grammar, { wordOrder: "VSO", adjectiveOrder: "After noun", possessorOrder: "After noun", adposition: "Prepositions" });
  assert.equal(composeClause(l, selection).variants[0].text, "len mira te selam suri nari");
});

test("free and flexible rules enumerate every permitted order", () => {
  const l = language();
  Object.assign(l.grammar, { wordOrder: "Free", adjectiveOrder: "Flexible", possessorOrder: "Flexible", adposition: "Both" });
  const result = composeClause(l, selection);
  assert.equal(result.variants.length, 48);
  assert.equal(new Set(result.variants.map((variant) => variant.text)).size, 48);
  assert.deepEqual(new Set(result.variants.map((variant) => variant.wordOrder)), new Set(["SVO", "SOV", "VSO", "VOS", "OVS", "OSV"]));
  assert.equal(composeClause(l, { subject: "s", verb: "v", object: "o" }).variants.length, 6, "absent modifiers do not manufacture duplicate alternatives");
});

test("missing pronunciations do not invent a partial clause IPA", () => {
  const l = language();
  l.lexicon.find((item) => item.id === "v").ipa = "";
  const result = composeClause(l, selection).variants[0];
  assert.equal(result.ipa, "");
  assert.deepEqual(result.missingPronunciations, ["len"]);
});

test("invalid roles, settings and impossible adpositions are rejected", () => {
  const l = language();
  assert.throws(() => composeClause(l, { ...selection, verb: "s" }), /cannot fill the verb/u);
  assert.throws(() => composeClause(l, { ...selection, subject: "missing" }), /Choose a dictionary form/u);
  l.grammar.adposition = "None";
  assert.throws(() => composeClause(l, selection), /no adpositions/u);
  assert.doesNotThrow(() => composeClause(l, { ...selection, adposition: "" }));
  l.grammar.wordOrder = "OSVVO";
  assert.throws(() => validateGrammarOrders(l.grammar), /wordOrder/u);
  assert.throws(() => entriesForRole(l, "rogue"), /Unknown clause role/u);
});
