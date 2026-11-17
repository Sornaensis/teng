/** Pure phoneme-level phonotactic constraints and sampling. No regex is evaluated from user data. */
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message) => {
  throw new Error(message);
};

export const PHONOTACTIC_LIMITS = Object.freeze({
  constraints: 128,
  tokens: 64,
  sequence: 512,
  analysisCandidates: 8,
  analysisSteps: 100000,
  analysisSegments: 1000,
});

/** Parse class-based syllable shapes without evaluating user code or regex. */
export function parseSyllablePattern(input) {
  const source = boundedText(input, "Syllable pattern", 64).replace(/\s+/gu, "");
  let index = 0;
  function sequence(depth = 0) {
    if (depth > 4) fail("Optional groups may be nested at most four levels deep.");
    const nodes = [];
    while (index < source.length && source[index] !== ")") {
      let node;
      const character = source[index++];
      if (/^[A-Z]$/u.test(character)) node = { kind: "class", name: character };
      else if (character === "(") {
        const children = sequence(depth + 1);
        if (source[index] !== ")") fail(`Unclosed optional group in “${input}”.`);
        index++;
        if (!children.length) fail("Optional groups cannot be empty.");
        node = { kind: "optional", children };
      } else {
        fail(`Unsupported “${character}” in syllable pattern. Use class letters and optional groups, e.g. (C)V(C).`);
      }
      if (source[index] === "?") {
        index++;
        if (node.kind !== "optional") node = { kind: "optional", children: [node] };
      }
      nodes.push(node);
    }
    return nodes;
  }
  const nodes = sequence();
  if (index !== source.length) fail(`Unexpected closing parenthesis in “${input}”.`);
  if (!nodes.length) fail("A syllable pattern cannot be empty.");
  return nodes;
}

function boundedText(value, label, maximum) {
  if (typeof value !== "string" || !value.trim())
    fail(`${label} cannot be empty.`);
  const result = value.normalize("NFC").trim();
  if (result.length > maximum) fail(`${label} exceeds ${maximum} characters.`);
  return result;
}

function choice(value, options, label) {
  if (!options.includes(value))
    fail(`${label} must be one of: ${options.join(", ")}.`);
  return value;
}

function inventoryContext(language, phonemes) {
  if (!record(language) || !Array.isArray(language.phonemeIds))
    fail("A language with a sound inventory is required for phonotactics.");
  if (!Array.isArray(phonemes)) fail("The phoneme catalog must be an array.");
  const byId = new Map(phonemes.map((sound) => [sound.id, sound]));
  const selected = new Set(language.phonemeIds);
  for (const id of selected) {
    if (typeof id !== "string" || !byId.has(id))
      fail(`Unknown sound “${String(id)}” in the phonotactic inventory.`);
  }
  const bySymbol = new Map();
  for (const id of selected) {
    const symbol = byId.get(id).symbol;
    if (typeof symbol !== "string" || !symbol)
      fail(`Sound “${id}” has no IPA symbol.`);
    const normalized = symbol.normalize("NFC");
    if (bySymbol.has(normalized) && bySymbol.get(normalized) !== id)
      fail(`IPA symbol “${normalized}” is ambiguous in this inventory.`);
    bySymbol.set(normalized, id);
  }
  const classes = new Map([
    ["C", new Set([...selected].filter((id) => byId.get(id).type !== "vowel"))],
    ["V", new Set([...selected].filter((id) => byId.get(id).type === "vowel"))],
  ]);
  const custom =
    language.soundClasses === undefined ? {} : language.soundClasses;
  if (!record(custom)) fail("Sound classes must be an object.");
  for (const [name, members] of Object.entries(custom)) {
    if (!/^[A-Z]$/u.test(name) || name === "C" || name === "V")
      fail(
        `Custom sound class “${name}” must use one uppercase letter other than C or V.`,
      );
    if (!Array.isArray(members))
      fail(`Class ${name} must contain an array of sound IDs.`);
    for (const id of members) {
      if (typeof id !== "string" || !selected.has(id))
        fail(
          `Class ${name} contains a stale sound or a sound outside this language’s inventory.`,
        );
    }
    classes.set(name, new Set(members));
  }
  return { selected, bySymbol, classes };
}

function matchersFor(sequence, context, label) {
  const tokens = sequence.split(/\s+/u);
  if (tokens.length > PHONOTACTIC_LIMITS.tokens)
    fail(`${label} may contain at most ${PHONOTACTIC_LIMITS.tokens} tokens.`);
  return tokens.map((token) => {
    if (/^[A-Z]$/u.test(token)) {
      const members = context.classes.get(token);
      if (!members || members.size === 0)
        fail(
          `${label}: class ${token} has no selected sounds or is not defined.`,
        );
      return members;
    }
    const id = context.bySymbol.get(token);
    if (id === undefined)
      fail(
        `${label}: “${token}” is not an exact selected IPA symbol or an uppercase sound class. Separate segments with spaces.`,
      );
    return new Set([id]);
  });
}

function sanitizeExtras(phonotactics, context) {
  if (!record(phonotactics)) fail("Phonotactics must be an object.");
  const optionalProbability = phonotactics.optionalProbability;
  if (
    !Number.isFinite(optionalProbability) ||
    optionalProbability < 0 ||
    optionalProbability > 1
  )
    fail("Optional-group probability must be a number between 0 and 1.");
  const inputWeights = phonotactics.phonemeWeights;
  if (!record(inputWeights))
    fail("Phoneme weights must be an object keyed by selected sound IDs.");
  const phonemeWeights = Object.fromEntries(
    Object.entries(inputWeights).map(([id, weight]) => {
      if (!context.selected.has(id))
        fail(
          `Phoneme weight refers to stale sound “${id}” outside this language’s inventory.`,
        );
      if (!Number.isFinite(weight) || weight <= 0 || weight > 1000)
        fail(
          `Weight for sound “${id}” must be greater than zero and no more than 1,000.`,
        );
      return [id, weight];
    }),
  );
  const inputConstraints = phonotactics.constraints;
  if (
    !Array.isArray(inputConstraints) ||
    inputConstraints.length > PHONOTACTIC_LIMITS.constraints
  )
    fail(
      `Phonotactic constraints must be an array of at most ${PHONOTACTIC_LIMITS.constraints} rules.`,
    );
  const seen = new Set();
  const constraints = inputConstraints.map((rule, index) => {
    const label = `Phonotactic constraint ${index + 1}`;
    if (!record(rule)) fail(`${label} must be an object.`);
    const id = boundedText(rule.id, `${label} ID`, 200);
    if (!/^[A-Za-z0-9_.:-]+$/u.test(id))
      fail(`${label} ID contains unsupported characters.`);
    if (seen.has(id)) fail(`Duplicate phonotactic constraint ID “${id}”.`);
    seen.add(id);
    const name = boundedText(rule.name, `${label} name`, 160);
    const scope = choice(rule.scope, ["word", "syllable"], `${label} scope`);
    const position = choice(
      rule.position,
      ["anywhere", "start", "end"],
      `${label} position`,
    );
    const mode = choice(rule.mode, ["forbid", "require"], `${label} mode`);
    const sequence = boundedText(
      rule.sequence,
      `${label} sequence`,
      PHONOTACTIC_LIMITS.sequence,
    )
      .split(/\s+/u)
      .join(" ");
    matchersFor(sequence, context, name);
    return { id, name, scope, position, mode, sequence };
  });
  return { optionalProbability, phonemeWeights, constraints };
}

/** Validate and copy the required phonotactic fields without changing the language. */
export function validatePhonotacticExtras(phonotactics, language, phonemes) {
  return sanitizeExtras(phonotactics, inventoryContext(language, phonemes));
}

function containsSequence(ids, matchers, position, visit = null) {
  if (ids.length < matchers.length) return false;
  const last = ids.length - matchers.length;
  const first = position === "end" ? last : 0;
  const end = position === "anywhere" ? last : first;
  for (let offset = first; offset <= end; offset++) {
    let matched = true;
    for (let index = 0; index < matchers.length; index++) {
      visit?.();
      if (!matchers[index].has(ids[offset + index])) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** NFA-style position sets avoid expanding combinations of optional groups. */
function patternEnds(nodes, ids, starts, classes, visit = null) {
  let positions = starts;
  for (const node of nodes) {
    const next = new Set();
    if (node.kind === "optional") {
      for (const at of positions) { visit?.(); next.add(at); }
      for (const at of patternEnds(node.children, ids, positions, classes, visit)) next.add(at);
    } else {
      const members = classes.get(node.name);
      for (const at of positions) {
        visit?.();
        if (members.has(ids[at])) next.add(at + 1);
      }
    }
    positions = next;
    if (!positions.size) break;
  }
  return positions;
}

/**
 * Compile once per generation operation. The returned check accepts phoneme-ID
 * syllables (ID[][]), returning {ok, reasons, failedConstraintIds}. Word rules
 * cross syllable boundaries. Syllable rules apply independently to every syllable.
 * Invalid schema throws before generation; invalid candidate input is rejected.
 * check.extras exposes the validated probability, weights, and rule definitions.
 */
export function compilePhonotactics(language, phonemes) {
  const context = inventoryContext(language, phonemes);
  const extras = sanitizeExtras(language.phonotactics, context);
  const compiled = extras.constraints.map((rule) => ({
    ...rule,
    matchers: matchersFor(rule.sequence, context, rule.name),
  }));
  function check(syllables) {
    const rejected = (reason) => ({
      ok: false,
      reasons: [reason],
      failedConstraintIds: [],
    });
    if (!Array.isArray(syllables) || syllables.length === 0)
      return rejected("A candidate word must have at least one syllable.");
    for (const syllable of syllables) {
      if (!Array.isArray(syllable) || syllable.length === 0)
        return rejected("Candidate syllables must contain at least one sound.");
      for (const id of syllable) {
        if (typeof id !== "string" || !context.selected.has(id))
          return rejected(
            `Candidate contains sound “${String(id)}” outside this language’s inventory.`,
          );
      }
    }
    const word = syllables.flat();
    const reasons = [],
      failedConstraintIds = [];
    for (const rule of compiled) {
      const units = rule.scope === "word" ? [word] : syllables;
      const failedUnits = [];
      for (let index = 0; index < units.length; index++) {
        const matches = containsSequence(
          units[index],
          rule.matchers,
          rule.position,
        );
        if (rule.mode === "require" ? !matches : matches)
          failedUnits.push(index + 1);
      }
      if (!failedUnits.length) continue;
      failedConstraintIds.push(rule.id);
      const unitLabel =
        rule.scope === "word"
          ? "word"
          : `${failedUnits.length === 1 ? "syllable" : "syllables"} ${failedUnits.join(", ")}`;
      const positionLabel =
        rule.position === "start"
          ? "at the start"
          : rule.position === "end"
            ? "at the end"
            : "anywhere";
      reasons.push(
        `${rule.name}: ${rule.mode === "require" ? "required sequence missing" : "forbidden sequence present"} in ${unitLabel} (${rule.sequence}; ${positionLabel}).`,
      );
    }
    return { ok: reasons.length === 0, reasons, failedConstraintIds };
  }
  Object.defineProperty(check, "extras", { value: extras, enumerable: true });
  return check;
}

/**
 * Check complete word phonotactics, including the supplied syllable boundaries.
 * Sampling weights are preferences, not validity rules. Optional groups remain
 * structurally optional at every sampling probability. If a stress index is
 * supplied, it must agree with the saved stress rule; otherwise stress is added.
 */
export function compileWordPhonotactics(language, phonemes) {
  const context = inventoryContext(language, phonemes);
  const constraints = compilePhonotactics(language, phonemes);
  const p = language.phonotactics;
  if (!Number.isInteger(p.minSyllables) || p.minSyllables < 1 || p.minSyllables > 12)
    fail("Minimum syllables must be a whole number between 1 and 12.");
  if (!Number.isInteger(p.maxSyllables) || p.maxSyllables < p.minSyllables || p.maxSyllables > 12)
    fail("Maximum syllables must be a whole number from the minimum to 12.");
  choice(p.stress, ["initial", "penultimate", "final", "none"], "Stress");
  if (!Array.isArray(p.patterns) || !p.patterns.length || p.patterns.length > 64)
    fail("Define between 1 and 64 syllable patterns.");
  const patterns = p.patterns.map((item) => {
    if (!record(item) || !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 10000)
      fail("Pattern weights must be greater than zero and no more than 10,000.");
    const nodes = parseSyllablePattern(item.pattern);
    function validate(items) {
      for (const node of items) {
        if (node.kind === "optional") validate(node.children);
        else if (!context.classes.get(node.name)?.size)
          fail(`Class ${node.name} has no selected sounds or is not defined.`);
      }
    }
    validate(nodes);
    return { source: item.pattern, nodes };
  });
  if (!Array.isArray(p.banned)) fail("Forbidden IPA text must be an array.");
  const bans = p.banned.map((value) => boundedText(value, "Forbidden IPA text", 64));
  const symbols = new Map(phonemes.map((sound) => [sound.id, sound.symbol]));

  function matches(nodes, ids) {
    return patternEnds(nodes, ids, new Set([0]), context.classes).has(ids.length);
  }

  return (syllables, options = {}) => {
    const result = constraints(syllables);
    // Do not inspect malformed IDs or structures after the constraint checker
    // has rejected them: it supplies the specific input error.
    if (!Array.isArray(syllables) || !syllables.length || syllables.some((s) => !Array.isArray(s) || !s.length || s.some((id) => !context.selected.has(id))))
      return { ...result, syllablePatterns: [], ipa: "", stressIndex: -1 };
    const reasons = [...result.reasons];
    if (syllables.length < p.minSyllables || syllables.length > p.maxSyllables)
      reasons.push(`Expected ${p.minSyllables === p.maxSyllables ? p.minSyllables : `${p.minSyllables}–${p.maxSyllables}`} syllables; received ${syllables.length}.`);
    const syllablePatterns = syllables.map((ids, index) => {
      const matched = patterns.filter((pattern) => matches(pattern.nodes, ids)).map((pattern) => pattern.source);
      if (!matched.length)
        reasons.push(`Syllable ${index + 1} /${ids.map((id) => symbols.get(id)).join("")}/ does not match any saved pattern.`);
      return { syllable: index + 1, patterns: matched };
    });
    const joined = syllables.flat().map((id) => symbols.get(id)).join("").normalize("NFC");
    for (const ban of bans) if (joined.includes(ban)) reasons.push(`Forbidden IPA text present: ${ban}.`);
    const stressIndex = p.stress === "initial" ? 0 : p.stress === "final" ? syllables.length - 1 : p.stress === "penultimate" ? Math.max(0, syllables.length - 2) : -1;
    if (options.stressIndex !== undefined && options.stressIndex !== null && options.stressIndex !== stressIndex)
      reasons.push(stressIndex < 0 ? "The saved stress rule is unmarked; remove the stress mark." : `The saved stress rule places primary stress on syllable ${stressIndex + 1}.`);
    const ipa = syllables.map((ids, index) => `${index === stressIndex ? "ˈ" : ""}${ids.map((id) => symbols.get(id)).join("")}`).join(".");
    return { ...result, ok: !reasons.length, reasons, syllablePatterns, ipa, stressIndex };
  };
}

/**
 * Find legal syllable partitions of a whole-phoneme form. A finite acyclic graph
 * of matching syllables plus memoized path counts avoids exponential search.
 * Search and output limits are explicit. Only status="unique" is safe for
 * automatic syllabification and stress; no operation changes the input sounds.
 * Invalid definitions throw; an invalid or indeterminate form returns reasons.
 */
export function analyzePhonemeForm(segments, language, phonemes) {
  // Reuse the complete checker's validation and exact structural semantics.
  compileWordPhonotactics(language, phonemes);
  const context = inventoryContext(language, phonemes);
  const p = language.phonotactics;
  const extras = sanitizeExtras(p, context);
  const empty = (reason, truncated = false) => ({
    status: truncated ? "incomplete" : "invalid", ok: false, candidates: [],
    syllables: null, ambiguous: false, truncated, reasons: [reason],
  });
  if (!Array.isArray(segments) || !segments.length)
    return empty("A form must contain at least one phoneme.");
  if (segments.length > PHONOTACTIC_LIMITS.analysisSegments)
    return empty(`Syllabification analysis is limited to ${PHONOTACTIC_LIMITS.analysisSegments} phonemes. Supply explicit syllable boundaries.`, true);
  for (const id of segments) if (typeof id !== "string" || !context.selected.has(id))
    return empty(`The form contains sound “${String(id)}” outside this language’s inventory.`);

  const patterns = p.patterns.map((item) => ({ source: item.pattern, nodes: parseSyllablePattern(item.pattern) }));
  const maximumLength = (nodes) => nodes.reduce((total, node) => total + (node.kind === "optional" ? maximumLength(node.children) : 1), 0);
  const longestSyllable = Math.max(...patterns.map((pattern) => maximumLength(pattern.nodes)));
  const countLabel = p.minSyllables === p.maxSyllables ? String(p.minSyllables) : `${p.minSyllables}–${p.maxSyllables}`;
  if (segments.length > longestSyllable * p.maxSyllables)
    return empty(`This form needs more than ${p.maxSyllables} syllables under the saved patterns (at most ${longestSyllable} phonemes per syllable).`);
  if (segments.length < p.minSyllables)
    return empty(`The form has too few phonemes for the required ${countLabel} nonempty syllables.`);

  const symbols = new Map(phonemes.map((sound) => [sound.id, sound.symbol]));
  const text = segments.map((id) => symbols.get(id)).join("").normalize("NFC");
  const compiled = extras.constraints.map((rule) => ({ ...rule, matchers: matchersFor(rule.sequence, context, rule.name) }));
  const wordRules = compiled.filter((rule) => rule.scope === "word");
  const syllableRules = compiled.filter((rule) => rule.scope === "syllable");
  const budgetEnd = Symbol("syllabification budget");
  let steps = 0;
  const visit = () => { if (++steps > PHONOTACTIC_LIMITS.analysisSteps) throw budgetEnd; };
  const candidates = [];
  const edges = new Map(), counts = new Map();
  let truncated = false, total = 0;

  function validRule(ids, rule) {
    const matched = containsSequence(ids, rule.matchers, rule.position, visit);
    return rule.mode === "require" ? matched : !matched;
  }

  function nextSyllables(start) {
    if (edges.has(start)) return edges.get(start);
    const endings = new Map();
    for (const pattern of patterns) {
      visit();
      for (const end of patternEnds(pattern.nodes, segments, new Set([start]), context.classes, visit)) {
        if (end <= start) continue;
        if (!endings.has(end)) endings.set(end, []);
        endings.get(end).push(pattern.source);
      }
    }
    const result = [...endings].sort(([a], [b]) => a - b).filter(([end]) => {
      const syllable = segments.slice(start, end);
      return syllableRules.every((rule) => validRule(syllable, rule));
    }).map(([end, sources]) => ({ end, patterns: [...new Set(sources)] }));
    edges.set(start, result);
    return result;
  }

  // Counts saturate one above the display limit, which is enough to detect
  // both ambiguity and omitted candidates without enumerating every path.
  function count(start, used) {
    visit();
    if (start === segments.length) return used >= p.minSyllables && used <= p.maxSyllables ? 1 : 0;
    if (used >= p.maxSyllables || segments.length - start > (p.maxSyllables - used) * longestSyllable || segments.length - start < p.minSyllables - used) return 0;
    const key = `${start}:${used}`;
    if (counts.has(key)) return counts.get(key);
    let result = 0;
    for (const edge of nextSyllables(start)) {
      result += count(edge.end, used + 1);
      if (result > PHONOTACTIC_LIMITS.analysisCandidates) { result = PHONOTACTIC_LIMITS.analysisCandidates + 1; break; }
    }
    counts.set(key, result);
    return result;
  }

  function collect(start, syllables, matchedPatterns) {
    visit();
    if (candidates.length >= PHONOTACTIC_LIMITS.analysisCandidates) return;
    if (start === segments.length) {
      const stressIndex = p.stress === "initial" ? 0 : p.stress === "final" ? syllables.length - 1 : p.stress === "penultimate" ? Math.max(0, syllables.length - 2) : -1;
      candidates.push({
        syllables: syllables.map((ids) => [...ids]), stressIndex,
        ipa: syllables.map((ids, index) => `${index === stressIndex ? "ˈ" : ""}${ids.map((id) => symbols.get(id)).join("")}`).join("."),
        syllablePatterns: matchedPatterns.map((sources, index) => ({ syllable: index + 1, patterns: [...sources] })),
      });
      return;
    }
    for (const edge of nextSyllables(start)) {
      if (!count(edge.end, syllables.length + 1)) continue;
      collect(edge.end, [...syllables, segments.slice(start, edge.end)], [...matchedPatterns, edge.patterns]);
      if (candidates.length >= PHONOTACTIC_LIMITS.analysisCandidates) break;
    }
  }

  try {
    const wordReasons = [];
    for (const rule of wordRules) if (!validRule(segments, rule))
      wordReasons.push(`${rule.name}: ${rule.mode === "require" ? "required sequence missing" : "forbidden sequence present"} in the word (${rule.sequence}; ${rule.position}).`);
    for (const value of p.banned) {
      const ban = boundedText(value, "Forbidden IPA text", 64);
      if (text.includes(ban)) wordReasons.push(`Forbidden IPA text present: ${ban}.`);
    }
    if (wordReasons.length) return { ...empty(wordReasons[0]), reasons: wordReasons };
    total = count(0, 0);
    if (total) collect(0, [], []);
    truncated = total > PHONOTACTIC_LIMITS.analysisCandidates;
  } catch (error) {
    if (error !== budgetEnd) throw error;
    truncated = true;
  }

  const ambiguous = candidates.length > 1;
  const unique = candidates.length === 1 && !truncated;
  const reasons = [];
  if (ambiguous) reasons.push("More than one legal syllabification fits these phonemes. Supply explicit syllable boundaries to choose stress.");
  if (truncated) reasons.push(`Syllabification search reached its limit${candidates.length ? `; showing ${candidates.length} legal candidates` : ""}. Uniqueness has not been established.`);
  if (!candidates.length && !truncated)
    reasons.push(`No syllabification satisfies the saved patterns (${[...new Set(p.patterns.map((pattern) => pattern.pattern))].join(", ")}), ${countLabel} syllables and syllable constraints.`);
  return {
    status: unique ? "unique" : ambiguous ? "ambiguous" : truncated ? "incomplete" : "invalid",
    ok: candidates.length > 0, candidates, syllables: unique ? candidates[0].syllables.map((ids) => [...ids]) : null,
    ambiguous, truncated, reasons,
  };
}

/**
 * Sample one whole sound ID; omitted weights equal 1. Exactly one RNG draw is
 * consumed for a valid call, keeping the caller's random stream predictable.
 */
export function weightedSoundChoice(ids, weights = {}, random = Math.random) {
  if (!Array.isArray(ids) || ids.length === 0)
    fail("Cannot sample an empty sound class.");
  if (!record(weights)) fail("Phoneme weights must be an object.");
  if (typeof random !== "function")
    fail("A random-number function is required.");
  let total = 0;
  const values = ids.map((id) => {
    if (typeof id !== "string" || !id)
      fail("Sound choices must be nonempty sound IDs.");
    const weight = own(weights, id) ? weights[id] : 1;
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000)
      fail(
        `Weight for sound “${id}” must be greater than zero and no more than 1,000.`,
      );
    total += weight;
    return weight;
  });
  if (!Number.isFinite(total) || total <= 0)
    fail("Sound weights have an invalid total.");
  const draw = random();
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1)
    fail(
      "The random-number function must return a number from 0 (inclusive) to 1 (exclusive).",
    );
  let remaining = draw * total;
  for (let index = 0; index < ids.length; index++) {
    remaining -= values[index];
    if (remaining < 0) return ids[index];
  }
  return ids[ids.length - 1];
}
