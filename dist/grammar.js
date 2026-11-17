/** Controlled clause assembly. It orders explicit lexical forms; it does not infer agreement. */
export const GRAMMAR_ORDERS = Object.freeze({
  wordOrder: ["SVO", "SOV", "VSO", "VOS", "OVS", "OSV", "Free"],
  adposition: ["Prepositions", "Postpositions", "Both", "None"],
  adjectiveOrder: ["Before noun", "After noun", "Flexible"],
  possessorOrder: ["Before noun", "After noun", "Flexible"],
});

export function validateGrammarOrders(grammar) {
  if (!grammar || typeof grammar !== "object" || Array.isArray(grammar))
    throw new Error("Grammar settings must be an object.");
  const result = {};
  for (const [key, choices] of Object.entries(GRAMMAR_ORDERS)) {
    if (!choices.includes(grammar[key]))
      throw new Error(`${key} must be one of: ${choices.join(", ")}.`);
    result[key] = grammar[key];
  }
  return result;
}

const ROLES = Object.freeze({
  subject: ["noun", "pronoun"],
  verb: ["verb"],
  object: ["noun", "pronoun"],
  adjective: ["adjective"],
  possessor: ["noun", "pronoun"],
  adposition: ["preposition", "postposition", "adposition", "particle"],
});

export function entriesForRole(language, role) {
  if (!Object.hasOwn(ROLES, role)) throw new Error(`Unknown clause role “${role}”.`);
  return (language.lexicon || []).filter((entry) => ROLES[role].includes(entry.pos));
}

/**
 * subject/verb/object are required lexicon IDs. adjective/possessor/adposition
 * are optional IDs. Saved inflected entries can be selected explicitly.
 * Noun-phrase nesting is possessor + (adjective + noun), with each modifier's
 * side controlled independently. An adposition encloses the whole object phrase.
 * Free/Flexible/Both enumerate permitted alternatives, never arbitrary defaults.
 */
export function composeClause(language, selection) {
  const grammar = validateGrammarOrders(language.grammar);
  const lexicon = new Map((language.lexicon || []).map((entry) => [entry.id, entry]));
  const chosen = {};
  for (const role of Object.keys(ROLES)) {
    const identifier = selection?.[role];
    if (!identifier && !["subject", "verb", "object"].includes(role)) continue;
    const entry = lexicon.get(identifier);
    if (!entry) throw new Error(`Choose a dictionary form for ${role}.`);
    if (!ROLES[role].includes(entry.pos))
      throw new Error(`“${entry.word}” cannot fill the ${role} role (${entry.pos}).`);
    if (typeof entry.word !== "string" || !entry.word.trim())
      throw new Error(`The selected ${role} has no written form.`);
    chosen[role] = { entryId: entry.id, word: entry.word, ipa: entry.ipa || "", gloss: entry.gloss || "", role };
  }
  if (chosen.adposition && grammar.adposition === "None")
    throw new Error("This grammar has no adpositions. Remove the adposition or change the rule.");
  const orders = grammar.wordOrder === "Free" ? GRAMMAR_ORDERS.wordOrder.filter((order) => order !== "Free") : [grammar.wordOrder];
  const sideOptions = (value, present) => !present ? [null] : value === "Flexible" ? ["Before noun", "After noun"] : [value];
  const adjectiveSides = sideOptions(grammar.adjectiveOrder, chosen.adjective);
  const possessorSides = sideOptions(grammar.possessorOrder, chosen.possessor);
  const adpositionSides = !chosen.adposition ? [null] : grammar.adposition === "Both" ? ["Prepositions", "Postpositions"] : [grammar.adposition];
  const variants = [];
  for (const wordOrder of orders) {
    for (const adjectiveOrder of adjectiveSides) {
      for (const possessorOrder of possessorSides) {
        for (const adposition of adpositionSides) {
          let object = [chosen.object];
          if (chosen.adjective) object = adjectiveOrder === "Before noun" ? [chosen.adjective, ...object] : [...object, chosen.adjective];
          if (chosen.possessor) object = possessorOrder === "Before noun" ? [chosen.possessor, ...object] : [...object, chosen.possessor];
          if (chosen.adposition) object = adposition === "Prepositions" ? [chosen.adposition, ...object] : [...object, chosen.adposition];
          const constituents = { S: [chosen.subject], V: [chosen.verb], O: object };
          const tokens = [...wordOrder].flatMap((role) => constituents[role]);
          variants.push({
            wordOrder,
            adjectiveOrder,
            possessorOrder,
            adposition,
            tokens,
            text: tokens.map((token) => token.word).join(" "),
            ipa: tokens.every((token) => token.ipa) ? tokens.map((token) => token.ipa).join(" ") : "",
            missingPronunciations: tokens.filter((token) => !token.ipa).map((token) => token.word),
          });
        }
      }
    }
  }
  return { variants };
}
