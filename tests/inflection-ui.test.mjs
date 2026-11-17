import test from "node:test";
import assert from "node:assert/strict";
import { PHONEMES } from "../dist/ipa.js";
import { createWorkspace, validateWorkspace } from "../dist/engine.js";
import { createParadigmTemplate } from "../dist/inflection.js";
import { createInflectionUI } from "../dist/inflection-ui.js";

// Controller tests only: no document, browser, network, or application startup.
class FakeFormData {
  constructor(values = {}) {
    this.values = values;
  }
  get(name) {
    return Object.hasOwn(this.values, name) ? this.values[name] : null;
  }
  getAll(name) {
    const value = this.get(name);
    return value === null ? [] : Array.isArray(value) ? value : [value];
  }
  has(name) {
    return Object.hasOwn(this.values, name);
  }
}

function fixture() {
  const workspace = createWorkspace(PHONEMES);
  const language = workspace.languages.find((l) => l.name === "Selari");
  const lexeme = language.lexicon.find((e) => e.pos === "noun");
  const paradigm = language.paradigms.find((p) => p.id === lexeme.paradigmId);
  const slot = paradigm.slots[0];
  const source = {
    lexemeId: lexeme.id,
    paradigmId: paradigm.id,
    slotId: slot.id,
    slotLabel: slot.label,
    features: structuredClone(slot.features),
  };
  const edits = [];
  const unexpected = () => {
    throw Error("Unexpected rendering callback in a controller-only test.");
  };
  const ui = createInflectionUI({
    language: () => language,
    ui: { langId: language.id },
    editEntry: (...args) => edits.push(args),
    modal: unexpected,
    closeModal: unexpected,
    commit: unexpected,
    render: unexpected,
    toast: unexpected,
    confirmAction: unexpected,
  });
  return { workspace, language, lexeme, paradigm, slot, source, ui, edits };
}

test("new form metadata accepts its source without confusing absent IDs with dependencies", () => {
  const { language, source, ui } = fixture();
  assert.ok(language.lexicon.some((entry) => entry.source === null));
  const draft = { word: "selana", entryType: "form", source };
  assert.equal(draft.id, undefined);
  const result = ui.entryMetadata(
    new FakeFormData({ entryType: "form" }),
    draft,
  );
  assert.deepEqual(result, {
    entryType: "form",
    paradigmId: null,
    stems: {},
    overrides: {},
    source,
  });
  assert.equal(
    draft.id,
    undefined,
    "metadata extraction must not mutate the new draft",
  );
});

test("an existing lexeme cannot become a form while other entries depend on it", () => {
  const { language, lexeme, source, ui } = fixture();
  const saved = {
    ...structuredClone(lexeme),
    id: "dependent-form",
    word: "selana",
    entryType: "form",
    paradigmId: null,
    stems: {},
    overrides: {},
    source,
  };
  language.lexicon.push(saved);
  const formData = new FakeFormData({ entryType: "form" });
  assert.throws(
    () => ui.entryMetadata(formData, lexeme),
    /Other dictionary forms refer to this lexeme/u,
  );
  const unrelated = language.lexicon.find(
    (entry) => entry.entryType === "lexeme" && entry.id !== lexeme.id,
  );
  assert.equal(ui.entryMetadata(formData, unrelated).entryType, "form");
  saved.source = null;
  assert.equal(
    ui.entryMetadata(formData, lexeme).entryType,
    "form",
    "detaching the dependent snapshot releases the conversion guard",
  );
});

test("editing a lexeme preserves overrides for the same paradigm and clears them on reassignment", () => {
  const { workspace, language, lexeme, slot, ui } = fixture();
  const original = {
    [slot.id]: { word: "selai", ipa: "ˈse.lai", omit: false },
  };
  lexeme.overrides = structuredClone(original);
  const replacement = createParadigmTemplate("declension");
  language.paradigms.push(replacement);

  const same = ui.entryMetadata(
    new FakeFormData({
      entryType: "lexeme",
      paradigmId: lexeme.paradigmId,
      stems: "oblique = sel",
    }),
    lexeme,
  );
  assert.deepEqual(same.overrides, original);
  assert.deepEqual(same.stems, { oblique: "sel" });

  const changed = ui.entryMetadata(
    new FakeFormData({
      entryType: "lexeme",
      paradigmId: replacement.id,
      stems: "oblique = sel",
    }),
    lexeme,
  );
  assert.equal(changed.paradigmId, replacement.id);
  assert.deepEqual(changed.overrides, {});
  assert.deepEqual(
    lexeme.overrides,
    original,
    "extracting changed metadata must not erase saved overrides before commit",
  );

  const unassigned = ui.entryMetadata(
    new FakeFormData({ entryType: "lexeme", paradigmId: "", stems: "" }),
    lexeme,
  );
  assert.equal(unassigned.paradigmId, null);
  assert.deepEqual(unassigned.overrides, {});

  Object.assign(lexeme, changed);
  assert.doesNotThrow(() => validateWorkspace(workspace, PHONEMES));
});

test("saving an inflected draft preserves maximum-length lexical data and full feature values", () => {
  const { workspace, language, lexeme, slot, ui, edits } = fixture();
  lexeme.gloss = "g".repeat(1000);
  lexeme.definition = "d".repeat(20000);
  slot.features.register = "r".repeat(200);
  slot.steps = [
    { kind: "suffix", from: "", to: "na", condition: "always", test: "" },
  ];
  assert.doesNotThrow(
    () => validateWorkspace(workspace, PHONEMES),
    "the source lexeme and slot must themselves be valid",
  );

  assert.equal(
    ui.handleAction({
      dataset: { action: "save-inflected", lexeme: lexeme.id, slot: slot.id },
    }),
    true,
  );
  assert.equal(edits.length, 1);
  const [entryId, draft, afterSave] = edits[0];
  assert.equal(entryId, null);
  assert.equal(typeof afterSave, "function");
  assert.equal(draft.word, `${lexeme.word}na`);
  assert.equal(draft.gloss, lexeme.gloss);
  assert.equal(draft.definition, lexeme.definition);
  assert.equal(draft.source.features.register, slot.features.register);
  assert.ok(draft.tags.every((tag) => tag.length <= 100));
  assert.ok(!draft.tags.includes(slot.features.register));

  const metadata = ui.entryMetadata(
    new FakeFormData({ entryType: "form" }),
    draft,
  );
  language.lexicon.push({
    ...draft,
    ...metadata,
    id: "saved-long-form",
    createdAt: "2026-11-17T12:00:00.000Z",
  });
  const normalized = validateWorkspace(workspace, PHONEMES);
  const saved = normalized.languages
    .find((l) => l.id === language.id)
    .lexicon.find((e) => e.id === "saved-long-form");
  assert.equal(saved.gloss.length, 1000);
  assert.equal(saved.definition.length, 20000);
  assert.equal(saved.source.features.register.length, 200);
  assert.equal(saved.source.lexemeId, lexeme.id);
  assert.equal(saved.entryType, "form");
});


test("paradigm preview renders phoneme results without assigning or modifying a lexeme", () => {
  const workspace = createWorkspace(PHONEMES);
  const language = workspace.languages.find((item) => item.name === "Selari");
  const lexeme = language.lexicon.find((item) => item.pos === "noun");
  const original = structuredClone(language);
  const escape = (value = "") => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/"/gu, "&quot;");
  const ui = createInflectionUI({
    language: () => language,
    ui: { langId: language.id, inflectionPreviewId: lexeme.id },
    esc: escape,
    icon: () => "",
    button: (label) => `<button>${label}</button>`,
    btnIcon: () => "",
    panelHeader: (title, subtitle, right) => `<header>${title}${subtitle}${right || ""}</header>`,
  });
  const html = ui.render();
  assert.match(html, /Preview with/u);
  assert.match(html, /selana/u);
  assert.match(html, /Show steps/u);
  assert.match(html, /Phoneme operations/u);
  assert.doesNotMatch(html, /Set IPA explicitly for changed forms/u);
  assert.deepEqual(language, original);
});
