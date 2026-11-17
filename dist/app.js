import { createPhonotacticsUI } from "./phonotactics-ui.js";
import { createInflectionUI } from "./inflection-ui.js";
import { createOrthographyUI } from "./orthography-ui.js";
import { createGrammarUI } from "./grammar-ui.js";
import { parseIPA, spellPhonemes, analyzeSpelling } from "./phonology.js";
import { PHONEMES, CONSONANT_PLACES, CONSONANT_MANNERS } from "./ipa.js";
import {
  createWorkspace,
  createLanguage,
  generateWords,
  applyMorphology,
  validateWorkspace,
  exportWorkspace,
  toCSV,
  parseLexiconCSV,
  uid,
} from "./engine.js";
import {
  loadWorkspace,
  saveWorkspace,
  loadPreferences,
  savePreferences,
} from "./storage.js";

const $ = (s, root = document) => root.querySelector(s);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  tree: "M12 3v7M5 14v-4h14v4M3 14h4v5H3zM10 14h4v5h-4zM17 14h4v5h-4zM10 3h4v4h-4z",
  sound: "M3 9v6h4l5 4V5L7 9zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14",
  letters: "M3 19 9 4l6 15M5 14h8M17 9h4M19 9v10",
  builder: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 17h6M17 14v6",
  morphology: "M4 6h7v5H4zM13 13h7v5h-7zM7 11v5h6M11 8h6v5",
  grammar: "M4 5h16M4 12h10M4 19h16M18 10v4M16 12h4",
  book: "M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1v15",
  library: "M4 4h4v16H4zM10 4h4v16h-4zM17 4l4 15-3 1-4-15z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  plus: "M12 5v14M5 12h14",
  down: "M6 9l6 6 6-6",
  arrow: "M5 12h14M14 7l5 5-5 5",
  back: "M19 12H5M10 7l-5 5 5 5",
  download: "M12 3v12M7 10l5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4M7 9l5-5 5 5M4 17v4h16v-4",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12M18 6 6 18",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6",
  leaf: "M20 3C7 2 2 9 6 16s16 3 14-13M5 20 16 8",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  play: "m8 5 11 7-11 7z",
  refresh:
    "M20 7v5h-5M4 17v-5h5M19 10a7 7 0 0 0-12-5L4 8M5 14a7 7 0 0 0 12 5l3-3",
  info: "M12 8h.01M11 11h1v6M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
  edit: "m15 4 5 5M4 16 16 4a2 2 0 0 1 4 4L8 20H4z",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6",
  menu: "M4 6h16M4 12h16M4 18h16",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11",
  folder: "M3 6h7l2 3h9v11H3zM3 6V4h7l2 2h9v3",
  dot: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c-6 6-6 14 0 20M12 2c6 6 6 14 0 20",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.dot}"/></svg>`;
const button = (text, action, kind = "", attrs = "") =>
  `<button class="button ${kind}" data-action="${action}" ${attrs}>${text}</button>`;
const btnIcon = (name, action, label, attrs = "") =>
  `<button class="icon-button" data-action="${action}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${icon(name)}</button>`;
const options = (values, selected) =>
  values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`,
    )
    .join("");
const byId = new Map(PHONEMES.map((p) => [p.id, p]));
const preferences = loadPreferences();
let workspace,
  concepts = [],
  audio = null,
  lastMorph = null,
  saveState = "loading",
  saveError = "",
  saveTimer,
  saveSequence = 0,
  generated = [],
  generationWarnings = [],
  quickWords = [];
const ui = {
  page: preferences.page || "phonology",
  langId: preferences.langId || "",
  familyId: preferences.familyId || "",
  tab: "consonants",
  soundId: PHONEMES.find((p) => p.symbol === "s")?.id || PHONEMES[0].id,
  audio: preferences.audio ?? true,
  lexQuery: "",
  conceptQuery: "",
  conceptPos: "all",
  conceptUntranslated: false,
  conceptPage: 0,
  lexPage: 0,
  generationSeed: "",
  generationCount: 12,
  generationMode: "forms",
  generationPos: "noun",
  generationParadigm: "",
  generationMin: "",
  generationMax: "",
  generatedSelected: [],
  phonotacticsTab: "structure",
  inflectionKind: "declension",
  paradigmId: "",
  lexKind: "all",
  mobileOpen: false,
};
const pages = {
  family: ["tree", "Language families", "Language families"],
  phonology: ["sound", "Phonology", "Phonology"],
  phonotactics: ["builder", "Phonotactics", "Phonotactics"],
  orthography: ["letters", "Orthography", "Orthography"],
  builder: ["spark", "Word generator", "Word generator"],
  morphology: ["morphology", "Word formation", "Word formation"],
  inflection: ["letters", "Inflection", "Inflection"],
  grammar: ["grammar", "Sentence structure", "Sentence structure"],
  lexicon: ["book", "Lexicon", "Lexicon"],
  concepts: ["library", "Concept library", "Concept library"],
  workspace: ["settings", "Workspace", "Workspace"],
};
const POS = [
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
];
const language = () => workspace.languages.find((l) => l.id === ui.langId);
const family = () => workspace.families.find((f) => f.id === ui.familyId);
const persistPreferences = () =>
  savePreferences({
    page: ui.page,
    langId: ui.langId,
    familyId: ui.familyId,
    audio: ui.audio,
  });
function reconcileSelection() {
  const previousLanguageId = ui.langId;
  const selected = language();
  if (selected && (!family() || selected.familyId === ui.familyId)) {
    ui.familyId = selected.familyId;
    return;
  }
  if (!family()) ui.familyId = workspace.families[0].id;
  ui.langId =
    workspace.languages.find((l) => l.familyId === ui.familyId)?.id || "";
  if (ui.langId !== previousLanguageId) clearLanguagePreview();
}
function clearLanguagePreview() {
  generated = [];
  generationWarnings = [];
  quickWords = [];
  lastMorph = null;
  ui.lexPage = 0;
  ui.conceptPage = 0;
  ui.generatedSelected = [];
  ui.paradigmId = "";
  ui.generationParadigm = "";
  if (audio) audio.pause();
}
function toast(message, error = false) {
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = message;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), error ? 8500 : 4300);
}
function saveIndicator() {
  document.querySelectorAll("[data-save-status]").forEach((el) => {
    el.classList.toggle("error", saveState === "error");
    el.innerHTML = `<i class="status-dot"></i>${esc(saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : saveState === "saved" ? "Saved" : "Loading…")}`;
  });
}
async function persist() {
  clearTimeout(saveTimer);
  const sequence = saveSequence;
  const snapshot = structuredClone(workspace);
  saveState = "saving";
  saveIndicator();
  try {
    await saveWorkspace(snapshot);
    if (sequence === saveSequence) {
      saveState = "saved";
      saveError = "";
      saveIndicator();
    }
  } catch (e) {
    if (sequence !== saveSequence) return;
    saveState = "error";
    saveError = e.message;
    saveIndicator();
    toast(
      `Could not save: ${e.message}. Export a backup to keep your current changes.`,
      true,
    );
  }
}
function commit(fn, rerender = true) {
  const configuration = (l) => l && JSON.stringify([l.phonemeIds, l.soundClasses,
    l.phonotactics, l.orthography, l.orthographyRules, l.morphologyRules, l.paradigms]);
  const before = configuration(language());
  const candidate = structuredClone(workspace);
  fn(candidate);
  workspace = validateWorkspace(candidate, PHONEMES);
  if (before !== configuration(language())) invalidateGeneration();
  saveSequence++;
  quickWords = [];
  lastMorph = null;
  if (rerender) render();
  saveState = "saving";
  saveIndicator();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 120);
}
function setLanguage(id) {
  const selected = workspace.languages.find((l) => l.id === id);
  if (!selected) return;
  ui.langId = selected.id;
  ui.familyId = selected.familyId;
  clearLanguagePreview();
  persistPreferences();
  render();
}
function setFamily(id) {
  if (!workspace.families.some((f) => f.id === id)) return;
  const selected = language();
  ui.familyId = id;
  ui.langId =
    selected?.familyId === id
      ? selected.id
      : workspace.languages.find((l) => l.familyId === id)?.id || "";
  clearLanguagePreview();
  persistPreferences();
  render();
}
function invalidateGeneration() {
  generated = [];
  generationWarnings = [];
  ui.generatedSelected = [];
  quickWords = [];
}
const sharedUI = {
  language,
  PHONEMES,
  ui,
  esc,
  icon,
  button,
  btnIcon,
  panelHeader,
  modal,
  modalActions,
  closeModal,
  commit,
  render,
  toast,
  selectedSounds,
  generateWords,
  uid,
  POS,
  editEntry,
  confirmAction,
};
const phonotacticsUI = createPhonotacticsUI({
  ...sharedUI,
  commit: (fn) => {
    invalidateGeneration();
    commit(fn);
  },
});
const inflectionUI = createInflectionUI({
  ...sharedUI,
  commit: (fn) => {
    invalidateGeneration();
    commit(fn);
  },
});
const orthographyUI = createOrthographyUI({
  ...sharedUI,
  commit: (fn) => { invalidateGeneration(); commit(fn); },
});
const grammarUI = createGrammarUI(sharedUI);

function renderContext() {
  const l = language(),
    f = family();
  const available = workspace.languages.filter((x) => x.familyId === f?.id);
  return `<section class="language-context context-sidebar" aria-label="Language context">
    <div class="context-fields">
      <label>Family<select id="family-select" aria-label="Active language family">${workspace.families.map((x) => `<option value="${x.id}" ${x.id === f?.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>
      <label>Language<select id="language-select" aria-label="Active language" ${available.length ? "" : "disabled"}>${available.length ? available.map((x) => `<option value="${x.id}" ${x.id === l?.id ? "selected" : ""}>${esc(x.name)}</option>`).join("") : '<option value="">No languages in this family</option>'}</select></label>
    </div>
  </section>`;
}

function navigate(page) {
  ui.page = Object.hasOwn(pages, page) ? page : "phonology";
  ui.mobileOpen = false;
  persistPreferences();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function soundButton(p, action = "toggle-sound") {
  return `<button class="phoneme ${language().phonemeIds.includes(p.id) ? "selected" : ""} ${ui.soundId === p.id ? "inspected" : ""}" data-action="${action}" data-id="${p.id}" aria-label="${esc(p.symbol + " — " + p.name)}" ${action === "toggle-sound" ? `aria-pressed="${language().phonemeIds.includes(p.id)}"` : ""} title="${esc(p.name)}">${esc(p.symbol)}</button>`;
}
function selectedSounds(type) {
  return PHONEMES.filter(
    (p) => language().phonemeIds.includes(p.id) && (!type || p.type === type),
  );
}
function sampleWords() {
  if (!quickWords.length)
    try {
      quickWords = generateWords(language(), PHONEMES, {
        count: 4,
        seed: "preview-" + language().id,
      }).words;
    } catch {}
  return quickWords;
}
function render() {
  reconcileSelection();
  const l = language();
  if (!Object.hasOwn(pages, ui.page)) ui.page = "phonology";
  persistPreferences();
  const nav = (key) =>
    `<button class="nav-item ${ui.page === key ? "active" : ""}" data-action="navigate" data-page="${key}" ${ui.page === key ? 'aria-current="page"' : ""}>${icon(pages[key][0])}<span>${pages[key][1]}</span>${key === "lexicon" ? `<span class="nav-count">${l?.lexicon.length || 0}</span>` : key === "concepts" ? '<span class="nav-count">5k</span>' : ""}</button>`;
  $("#app").innerHTML = `<div class="app-shell">
    <aside class="sidebar ${ui.mobileOpen ? "open" : ""}" aria-label="Main navigation">
      <div class="brand"><img class="brand-mark" src="./assets/teng.svg" alt=""><div><div class="brand-word">TENG</div><div class="brand-sub">Conlang Creator</div></div></div>
      ${renderContext()}
      <div class="nav-label">Sounds</div>${["phonology", "phonotactics", "orthography"].map(nav).join("")}
      <div class="nav-label second">Words</div>${["builder", "morphology", "inflection", "lexicon"].map(nav).join("")}
      <div class="nav-label second">Language</div>${["grammar", "family", "concepts", "workspace"].map(nav).join("")}
    </aside>
    <div class="main-shell"><header class="topbar"><nav class="breadcrumbs" aria-label="Breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation">${icon("menu")}</button><span class="breadcrumb-root">TENG</span><span class="slash breadcrumb-root">/</span><span>${esc(family()?.name || "Workspace")}</span><span class="slash">/</span><strong aria-current="page">${esc(l?.name || "No language selected")}</strong></nav><div class="top-actions"><span class="save-status" data-save-status></span>${button(icon("download") + "Export", "export", "")}</div></header>
    ${saveError ? `<div class="alert-banner">${esc(saveError)} Your latest edits are still on this page. Export a backup before reloading.</div>` : ""}
    <main class="content"><div class="page-heading"><div><h1>${pages[ui.page][2]}</h1><p>${pageDescription()}</p></div></div>${renderPage()}</main></div></div>`;
  saveIndicator();
}
function pageDescription() {
  return {
    family:
      "Organize languages, parent relationships, and independent branches.",
    phonology: "Select phonemes and preview reference recordings.",
    phonotactics:
      "Define syllable structure, sound distributions, and sequence constraints.",
    orthography: "Spell phonemes in context, and inspect possible readings.",
    builder:
      "Generate candidate lexemes from your phonotactics, with optional meanings.",
    morphology: "Transform phonemes, then spell the result.",
    inflection:
      "Define declensions and conjugations, with features, stems, and ordered rules.",
    grammar: "Set word order and compose phrases from your lexicon.",
    lexicon: "Manage word forms, transcriptions, definitions, and annotations.",
    concepts: "Search 5,000 English vocabulary prompts and definitions.",
    workspace: "Manage local data, imports, and backups.",
  }[ui.page];
}
function renderPage() {
  if (!language() && !["family", "workspace"].includes(ui.page)) {
    return `<section class="panel">${empty("No language in this family", "Create a language in " + esc(family()?.name) + " or select another family to continue.", "tree")}<div class="panel-footer"><span>${esc(family()?.name)}</span>${button(icon("plus") + " Create language", "new-language", "primary")}</div></section>`;
  }
  return {
    family: renderFamily,
    phonology: renderPhonology,
    phonotactics: phonotacticsUI.render,
    orthography: orthographyUI.render,
    builder: renderBuilder,
    morphology: renderMorphology,
    inflection: inflectionUI.render,
    grammar: grammarUI.render,
    lexicon: renderLexicon,
    concepts: renderConcepts,
    workspace: renderWorkspace,
  }[ui.page]();
}
function panelHeader(title, subtitle = "", right = "") {
  return `<div class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}</div>${right}</div>`;
}
function renderPhonology() {
  const l = language(),
    cs = selectedSounds("consonant"),
    vs = selectedSounds("vowel"),
    other = selectedSounds("other"),
    p = byId.get(ui.soundId);
  return `<div class="work-grid"><div class="stack"><section class="panel">${panelHeader("IPA chart", "Click a sound to add it to your inventory.", `<label class="toggle"><input type="checkbox" id="audio-toggle" ${ui.audio ? "checked" : ""}> Preview audio</label>`)}<div class="tabs" role="tablist" aria-label="IPA sound groups">${[
    ["consonants", "Consonants", cs.length],
    ["vowels", "Vowels", vs.length],
    ["other", "Other sounds", other.length],
  ]
    .map(
      ([id, name, n]) =>
        `<button class="tab ${ui.tab === id ? "active" : ""}" role="tab" aria-selected="${ui.tab === id}" data-action="sound-tab" data-tab="${id}">${name}<small>${n}</small></button>`,
    )
    .join(
      "",
    )}</div>${ui.tab === "consonants" ? renderConsonants() : ui.tab === "vowels" ? renderVowels() : renderOther()}<div class="chart-note"><div class="legend"><span><i></i> In your inventory</span><span><i class="unselected"></i> Available sound</span></div><span>${ui.tab === "consonants" ? "Paired symbols: voiceless · voiced" : ui.tab === "vowels" ? "Paired symbols: unrounded · rounded" : "Click a selected sound to remove it"}</span></div></section><section class="panel">${panelHeader("Samples", "", button(icon("refresh") + " Try again", "quick-refresh", "tiny"))}<div class="quick-words">${
    sampleWords().length
      ? sampleWords()
          .map(
            (w) =>
              `<div class="quick-word"><div class="word-form">${esc(w.word)}</div><div class="word-ipa">/${esc(w.ipa)}/</div></div>`,
          )
          .join("")
      : '<p class="muted" style="font-size:11px;grid-column:1/-1">Select consonants and vowels, then define a syllable pattern in Phonotactics.</p>'
  }</div><div class="panel-footer"><button class="button tiny" data-action="navigate" data-page="builder">Open word generator ${icon("arrow")}</button></div></section></div><div class="stack language-rail"><section class="panel">${panelHeader("Inventory", "", `<span class="chip">${l.phonemeIds.length} sounds</span>`)}<div class="panel-inner" style="padding-top:0"><div class="section-row"><h3>Consonants</h3><small>${cs.length} sounds</small></div><div class="inventory">${cs.length ? cs.map((x) => soundButton(x, "inspect-sound")).join("") : "<small>Select a consonant from the chart.</small>"}</div><div class="section-row"><h3>Vowels</h3><small>${vs.length} sounds</small></div><div class="inventory">${vs.length ? vs.map((x) => soundButton(x, "inspect-sound")).join("") : "<small>Select a vowel from the chart.</small>"}</div>${other.length ? `<div class="section-row"><h3>Other sounds</h3></div><div class="inventory">${other.map((x) => soundButton(x, "inspect-sound")).join("")}</div>` : ""}<div class="preview-card"><div class="eyebrow">Sound reference</div><div class="sound-symbol">${esc(p?.symbol)}</div><div class="sound-name">${esc(p?.name)}</div>${button(icon("play") + " Listen", "play-sound", "", `data-id="${esc(p?.id)}" ${p?.audio ? "" : "disabled"}`)}<small>${p?.audio ? "Reference recording · may include surrounding vowels" : "No local audio sample for this sound"}</small></div></div></section></div></div>`;
}
function renderConsonants() {
  return `<div class="chart-wrap"><table class="ipa-table" aria-label="Pulmonic consonants by place and manner"><thead><tr><th scope="col">Manner / place</th>${CONSONANT_PLACES.map((p) => `<th scope="col">${esc(p).replace(/-/g, "-<wbr>")}</th>`).join("")}</tr></thead><tbody>${CONSONANT_MANNERS.map(
    (m) =>
      `<tr><th scope="row">${esc(m)}</th>${CONSONANT_PLACES.map((place) => {
        const sounds = PHONEMES.filter(
          (p) => p.type === "consonant" && p.manner === m && p.place === place,
        ).sort((a, b) => Number(a.voiced) - Number(b.voiced));
        return `<td class="${sounds.length ? "" : "empty"}">${sounds.length ? `<div class="sound-pair">${sounds.map((p) => soundButton(p)).join("")}</div>` : ""}</td>`;
      }).join("")}</tr>`,
  ).join("")}</tbody></table></div>`;
}
function renderVowels() {
  const hs = [
    "Close",
    "Near-close",
    "Close-mid",
    "Mid",
    "Open-mid",
    "Near-open",
    "Open",
  ];
  let groups = new Map();
  PHONEMES.filter((p) => p.type === "vowel").forEach((p) => {
    const key = p.height + "|" + p.backness;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return `<div class="chart-wrap"><div class="vowel-chart"><svg class="vowel-lines" viewBox="0 0 600 350" preserveAspectRatio="none"><path d="M80 40H540V310H260zM140 130H540M200 220H540M310 40 400 310"/></svg><span class="vowel-axis" style="left:12%;top:0">Front</span><span class="vowel-axis" style="left:51%;top:0">Central</span><span class="vowel-axis" style="left:88%;top:0">Back</span>${[
    ...groups,
  ]
    .map(([key, sounds]) => {
      const [height, backness] = key.split("|");
      const row = Math.max(
        0,
        hs.findIndex((h) => h.toLowerCase() === height.toLowerCase()),
      );
      const b = backness.toLowerCase();
      const x = b.includes("front")
        ? (b === "front" ? 14 : 26) + row * 4.7
        : b.includes("back")
          ? b === "back"
            ? 90
            : 79
          : 52 + row * 2.3;
      const y = 12 + row * 12.8;
      return `<div class="vowel-cell" style="left:${x}%;top:${y}%">${sounds
        .sort((a, b) => Number(a.rounded) - Number(b.rounded))
        .map((p) => soundButton(p))
        .join("")}</div>`;
    })
    .join("")}</div></div>`;
}
function renderOther() {
  return `<div class="other-grid">${PHONEMES.filter((p) => p.type === "other")
    .map(
      (p) =>
        `<div class="other-sound">${soundButton(p)}<small>${esc(p.name)}</small></div>`,
    )
    .join("")}</div>`;
}

function generatorParadigmOptions(pos, selected) {
  return (
    '<option value="">No paradigm</option>' +
    language().paradigms
      .filter((p) => p.pos === pos)
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${esc(p.name)}</option>`,
      )
      .join("")
  );
}
function renderBuilder() {
  const p = language().phonotactics;
  const saved = (word) =>
    language().lexicon.some(
      (e) =>
        e.word.normalize("NFC").toLowerCase() ===
        word.normalize("NFC").toLowerCase(),
    );
  const withMeanings = generated.some((w) => w.gloss);
  return `<section class="panel">${panelHeader("Generation")}
    <form id="generate-form" class="generator-settings"><div class="form-grid">
      <label>Words<input name="count" type="number" min="1" max="120" value="${ui.generationCount}" required></label>
      <label>Meanings<select name="mode"><option value="forms" ${ui.generationMode === "forms" ? "selected" : ""}>Forms only</option><option value="concepts" ${ui.generationMode === "concepts" ? "selected" : ""}>Unused concepts</option></select></label>
      <label>Part of speech<select name="pos" id="generator-pos">${options(POS, ui.generationPos)}</select></label>
      <label>Assign paradigm<select name="paradigmId" id="generator-paradigm">${generatorParadigmOptions(ui.generationPos, ui.generationParadigm)}</select></label>
    </div><details class="rule-help generator-advanced" ${ui.generationSeed || ui.generationMin || ui.generationMax ? "open" : ""}><summary>Seed and length</summary><div class="form-grid"><label>Seed<input name="seed" value="${esc(ui.generationSeed)}" placeholder="Random" maxlength="80"></label><label>Minimum syllables<input name="min" type="number" min="1" max="12" value="${esc(ui.generationMin)}" placeholder="${p.minSyllables}"></label><label>Maximum syllables<input name="max" type="number" min="1" max="12" value="${esc(ui.generationMax)}" placeholder="${p.maxSyllables}"></label></div><p class="field-help">Blank limits use phonotactics. Reuse a seed to repeat the same sampling.</p></details><div class="selection-bar"><span class="compact-note">${p.minSyllables}–${p.maxSyllables} syllables by default · existing spellings excluded</span><div class="inline-controls">${button("Phonotactics", "navigate", "tiny", 'type="button" data-page="phonotactics"')}${button(icon("spark") + " Generate", "submit-generate", "primary", 'type="submit"')}</div></div></form></section>
    <section class="panel" style="margin-top:20px">${panelHeader("Candidates", generated.length ? `${generated.length} generated forms` : "")}${generationWarnings.length ? `<div class="generator-summary">${generationWarnings.map((w) => `<p class="notice">${esc(w)}</p>`).join("")}</div>` : ""}
    ${generated.length ? `<div class="generated-grid">${generated.map((w, i) => `<article class="generated-card ${ui.generatedSelected.includes(i) ? "selected" : ""}">${w.gloss ? `<label class="generated-select"><input type="checkbox" data-generated="${i}" ${ui.generatedSelected.includes(i) ? "checked" : ""} ${saved(w.word) ? "disabled" : ""} aria-label="Select ${esc(w.word)}"></label>` : ""}<div class="word-form">${esc(w.word)}</div><div class="word-ipa">/${esc(w.ipa)}/</div>${w.gloss ? `<div class="generated-meaning"><strong>${esc(w.gloss)}</strong><p>${esc(w.definition)}</p></div>` : ""}${saved(w.word) ? '<span class="form-status">Saved</span>' : btnIcon("plus", "save-generated", "Define " + w.word, `data-index="${i}"`)}</article>`).join("")}</div>` : empty("No candidates", "Generate forms to review, or assign unused concepts for a batch of dictionary entries.", "spark")}
    ${withMeanings ? `<div class="selection-bar">${button("Select available", "select-generated", "tiny")}${button("Add selected lexemes", "save-generated-batch", "primary")}</div>` : ""}</section>`;
}
function generateCandidateWords(fd) {
  ui.generationCount = Number(fd.get("count"));
  ui.generationSeed = fd.get("seed").trim();
  ui.generationMode = fd.get("mode");
  ui.generationPos = fd.get("pos");
  ui.generationParadigm = fd.get("paradigmId") || "";
  ui.generationMin = fd.get("min").trim();
  ui.generationMax = fd.get("max").trim();
  let prompts = [];
  if (ui.generationMode === "concepts") {
    const used = new Set(language().lexicon.map((e) => e.conceptId));
    prompts = concepts
      .filter((c) => c.pos === ui.generationPos && !used.has(c.id))
      .slice(0, ui.generationCount);
    if (!prompts.length)
      throw Error(
        "No unused concepts for this part of speech. Choose another part of speech or generate forms only.",
      );
  }
  const result = generateWords(language(), PHONEMES, {
    count:
      ui.generationMode === "concepts" ? prompts.length : ui.generationCount,
    seed: ui.generationSeed || String(Date.now()),
    minSyllables:
      ui.generationMin === "" ? undefined : Number(ui.generationMin),
    maxSyllables:
      ui.generationMax === "" ? undefined : Number(ui.generationMax),
  });
  generated = result.words.map((word, i) => ({
    ...word,
    pos: ui.generationPos,
    entryType: "lexeme",
    paradigmId: ui.generationParadigm || null,
    stems: {},
    overrides: {},
    source: null,
    ...(prompts[i]
      ? {
          gloss: prompts[i].word,
          definition: prompts[i].definition,
          conceptId: prompts[i].id,
          notes: "Definition: Princeton WordNet.",
          tags: ["generated"],
        }
      : {}),
  }));
  generationWarnings = result.warnings;
  if (ui.generationMode === "concepts" && prompts.length < ui.generationCount)
    generationWarnings.push(
      `Only ${prompts.length} unused concepts are available for this part of speech.`,
    );
  ui.generatedSelected = [];
  render();
}
function saveGeneratedBatch() {
  const selected = generated.filter(
    (w, i) =>
      ui.generatedSelected.includes(i) &&
      w.gloss &&
      !language().lexicon.some(
        (e) =>
          e.word.normalize("NFC").toLowerCase() ===
          w.word.normalize("NFC").toLowerCase(),
      ),
  );
  if (!selected.length)
    throw Error("Select at least one candidate with a meaning.");
  commit((w) => {
    const l = w.languages.find((x) => x.id === ui.langId);
    for (const candidate of selected)
      l.lexicon.push({
        ...candidate,
        id: uid("entry"),
        createdAt: new Date().toISOString(),
      });
  });
  ui.generatedSelected = [];
  render();
  toast(`${selected.length} lexemes added.`);
}

function empty(title, description, i) {
  return `<div class="empty-state">${icon(i)}<h2>${title}</h2><p>${description}</p></div>`;
}
function renderFamily() {
  const all = workspace.languages;
  const node = (l, depth = 0) =>
    `<div class="tree-node"><div class="language-card ${l.id === ui.langId ? "current" : ""}"><div class="language-initial">${esc(l.name.charAt(0))}</div><div><h3>${esc(l.name)}</h3><small>${l.phonemeIds.length} sounds · ${l.lexicon.length} words${l.id === ui.langId ? " · Selected" : ""}</small></div><div class="actions">${btnIcon("edit", "edit-language", "Edit " + l.name, `data-id="${l.id}"`)}${button(icon("arrow"), "select-language", "tiny", `data-id="${l.id}" aria-label="Open ${esc(l.name)}"`)}</div></div>${all
      .filter((x) => x.parentId === l.id)
      .map((x) => node(x, depth + 1))
      .join("")}</div>`;
  return `<section class="panel">${panelHeader("Lineages", "", `<div class="inline-controls">${language() ? button("Branch " + esc(language().name), "branch-language", "tiny") : ""}${button(icon("plus") + " Family", "new-family", "tiny")}${button(icon("plus") + " Language", "new-language", "primary")}</div>`)}<div class="tree-container">${workspace.families
    .map(
      (f) =>
        `<div class="family-block"><div class="family-header">${icon("tree")}<h2>${esc(f.name)}</h2><span class="chip neutral">${all.filter((l) => l.familyId === f.id).length} languages</span>${btnIcon("edit", "edit-family", "Edit family", `data-id="${f.id}"`)}</div>${f.description ? `<p class="intro-text" style="font-size:12px">${esc(f.description)}</p>` : ""}${
          all
            .filter((l) => l.familyId === f.id && !l.parentId)
            .map((l) => node(l))
            .join("") ||
          '<p class="muted" style="font-size:12px">No languages in this family.</p>'
        }</div>`,
    )
    .join(
      "",
    )}</div><div class="panel-footer">Branches can copy settings and lexicon; later edits are independent.</div></section>`;
}

function renderMorphology() {
  const l = language();
  const lexemes = l.lexicon.filter((e) => e.entryType === "lexeme");
  const ruleForm = (r) => r.kind === "reduplication" ? "×2" : r.kind === "circumfix" ? `/${r.form}/ … /${r.secondForm}/` : `/${r.form}/`;
  const conditionLabel = {always:"Every matching lexeme", "vowel-final":"After a vowel", "consonant-final":"After a consonant"};
  return `<div class="rules-layout morphology-layout"><div class="stack"><section class="panel">${panelHeader("Formation rules", "", button(icon("plus") + " Rule", "new-rule", "primary"))}
    ${l.morphologyRules.map((r) => `<article class="rule-card"><div class="rule-form ipa">${esc(ruleForm(r))}</div><div class="rule-content"><h3>${esc(r.name)}</h3><p>${esc(r.kind)} · ${esc(r.pos)} · ${esc(conditionLabel[r.condition])}</p><span class="chip neutral">${esc(r.feature)}</span></div>${btnIcon("edit", "edit-rule", "Edit " + r.name, `data-id="${r.id}"`)}</article>`).join("") || empty("No formation rules", "Add an affix or reduplication rule to derive new words.", "morphology")}
    <details class="rule-help"><summary>How formation works</summary><p>Affixes and conditions use selected IPA phonemes. Infixes follow the first phoneme; reduplication repeats the phoneme sequence. The completed form is then spelled using your orthography rules.</p><p>Declensions and conjugations support multiple ordered operations, named stems, and exceptions.</p></details></section>
    <section class="panel">${panelHeader("Morpheme inventory", "Reusable roots and affixes.", button(icon("plus") + " Morpheme", "new-morpheme", "tiny"))}${l.morphemes.map((m) => `<article class="rule-card"><div class="rule-form ipa">/${esc(m.form)}/</div><div class="rule-content"><h3>${esc(m.meaning)}</h3><p>${esc(m.type)} · ${esc(m.pos)}</p></div><div class="inline-controls">${button(m.type === "root" ? "Define word" : "Create rule", "use-morpheme", "tiny", `data-id="${m.id}"`)}${btnIcon("edit", "edit-morpheme", "Edit morpheme", `data-id="${m.id}"`)}</div></article>`).join("") || '<p class="compact-note panel-inner">Save a root or affix to reuse when creating words and rules.</p>'}</section></div>
    <section class="panel form-workbench">${panelHeader("Try a rule")}
      <form id="morph-form" class="panel-inner"><label>Lexeme<select name="lexemeId"><option value="">Select a lexeme</option>${lexemes.map((e) => `<option value="${e.id}">${esc(e.word)} — ${esc(e.gloss)}</option>`).join("")}</select></label>
      <label>Rule<select name="rule">${l.morphologyRules.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join("")}</select></label>
      <details class="rule-notation"><summary>Use an IPA form instead</summary><label>Phonemes<input name="root" class="ipa" placeholder="s e l a" spellcheck="false" maxlength="2000"></label></details>
      ${button("Generate form " + icon("arrow"), "submit-morph", "primary", `type="submit" ${l.morphologyRules.length ? "" : "disabled"}`)}
      <div id="morph-output" class="form-result" aria-live="polite"><p class="compact-note">Choose a lexeme and a rule to see the result.</p></div>
      ${button(icon("plus") + " Define this form", "save-morph", "", 'id="morph-save" type="button" disabled')}
      </form></section></div>`;
}

function filteredLexicon() {
  const q = ui.lexQuery.toLowerCase();
  return language().lexicon.filter(
    (w) =>
      (ui.lexKind === "all" || w.entryType === ui.lexKind) &&
      [
        w.word,
        w.ipa,
        w.gloss,
        w.definition,
        w.pos,
        w.notes,
        ...(w.tags || []),
      ].some((s) => String(s).toLowerCase().includes(q)),
  );
}
function renderLexicon() {
  return `<section class="panel">${panelHeader("Entries", `${language().lexicon.length} words`, `<div class="inline-controls">${button(icon("download") + " CSV", "export-csv", "tiny")}${button(icon("plus") + " Add word", "new-entry", "primary")}</div>`)}<div class="toolbar"><div class="search-box">${icon("search")}<input id="lex-search" type="search" placeholder="Search words, meanings, notes…" value="${esc(ui.lexQuery)}"></div>${button(icon("upload") + " Import CSV", "import-csv", "tiny")}${button(icon("library") + " Find concepts", "navigate", "tiny", 'data-page="concepts"')}</div><div class="toolbar" style="padding-top:0"><label class="inline-check">Show<select id="lex-kind">${[
    ["all", "All entries"],
    ["lexeme", "Lexemes"],
    ["form", "Saved forms"],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${ui.lexKind === value ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div><div id="lex-results">${renderLexResults()}</div></section>`;
}
function renderLexResults() {
  const entries = filteredLexicon(),
    per = 40;
  ui.lexPage = Math.min(
    ui.lexPage,
    Math.max(0, Math.ceil(entries.length / per) - 1),
  );
  const list = entries.slice(ui.lexPage * per, (ui.lexPage + 1) * per);
  return list.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>Word</th><th>Meaning</th><th>Part of speech</th><th>Definition</th><th>Forms</th><th></th></tr></thead><tbody>${list.map((w) => `<tr><td><div class="word-form">${esc(w.word)}</div><div class="word-ipa">${w.ipa ? "/" + esc(w.ipa) + "/" : ""}</div></td><td>${esc(w.gloss)}</td><td><span class="chip neutral">${esc(w.pos)}</span></td><td class="definition">${esc(w.definition)}${w.source ? `<div class="lexeme-origin">${esc(w.source.slotLabel)} of ${esc(language().lexicon.find((e) => e.id === w.source.lexemeId)?.word || "lexeme")}</div>` : ""}</td><td>${w.entryType === "form" ? '<span class="form-status">Saved form</span>' : button("Forms", "lexeme-forms", "tiny", `data-id="${w.id}"`)}</td><td>${btnIcon("edit", "edit-entry", "Edit " + w.word, `data-id="${w.id}"`)}</td></tr>`).join("")}</tbody></table></div>${pagination("lex", ui.lexPage, entries.length, per)}`
    : empty(
        ui.lexQuery ? "No matching words" : "No dictionary entries",
        ui.lexQuery
          ? "Try a different spelling or meaning."
          : "Generate a word, add one yourself, or begin with a concept from the library.",
        "book",
      );
}
function filteredConcepts() {
  const q = ui.conceptQuery.toLowerCase();
  const translated = new Set(language().lexicon.map((w) => w.conceptId));
  return concepts.filter(
    (c) =>
      (ui.conceptPos === "all" || c.pos === ui.conceptPos) &&
      (!ui.conceptUntranslated || !translated.has(c.id)) &&
      (!q ||
        c.word.toLowerCase().includes(q) ||
        c.definition.toLowerCase().includes(q)),
  );
}
function renderConcepts() {
  return `<section class="panel">${panelHeader("English concepts", "5,000 words · one selected sense per word")}<div class="toolbar"><div class="search-box">${icon("search")}<input id="concept-search" type="search" placeholder="Find a meaning, e.g. water, remember, blue…" value="${esc(ui.conceptQuery)}"></div><select id="concept-pos" aria-label="Filter by part of speech">${options(["all", ...new Set(concepts.map((c) => c.pos))], ui.conceptPos)}</select><label class="toggle"><input type="checkbox" id="concept-untranslated" ${ui.conceptUntranslated ? "checked" : ""}> Untranslated only</label>${button(icon("spark") + " Generate a batch", "batch-concepts", "primary")}</div><div id="concept-results">${renderConceptResults()}</div><div class="source-note">Princeton WordNet definitions, selected by word frequency. One sense per word; edit it when adding to your lexicon. <a href="#" data-action="credits">Sources & licenses</a>.</div></section>`;
}
function renderConceptResults() {
  const rows = filteredConcepts(),
    per = 35,
    translated = new Set(language().lexicon.map((w) => w.conceptId));
  ui.conceptPage = Math.min(
    ui.conceptPage,
    Math.max(0, Math.ceil(rows.length / per) - 1),
  );
  const list = rows.slice(ui.conceptPage * per, (ui.conceptPage + 1) * per);
  return list.length
    ? `<div class="table-scroll"><table class="data-table"><thead><tr><th>English prompt</th><th>Part of speech</th><th>Definition</th><th>In ${esc(language().name)}</th></tr></thead><tbody>${list
        .map((c) => {
          const entry = language().lexicon.find((w) => w.conceptId === c.id);
          return `<tr><td class="concept-word">${esc(c.word)}</td><td><span class="pos-label">${esc(c.pos)}</span></td><td class="definition">${esc(c.definition)}</td><td>${translated.has(c.id) ? `<button class="button tiny soft" data-action="edit-entry" data-id="${entry.id}">${icon("check")} ${esc(entry.word)}</button>` : button(icon("plus") + " Create word", "concept-word", "tiny", `data-id="${c.id}"`)}</td></tr>`;
        })
        .join(
          "",
        )}</tbody></table></div>${pagination("concept", ui.conceptPage, rows.length, per)}`
    : empty(
        concepts.length
          ? "No matching concepts"
          : "Loading the concept library…",
        concepts.length
          ? "Try a broader search or change your filters."
          : "The word bank is bundled with this app.",
        "library",
      );
}
function pagination(kind, page, total, per) {
  return `<div class="pagination"><span>${(page * per + 1).toLocaleString()}–${Math.min((page + 1) * per, total).toLocaleString()} of ${total.toLocaleString()}</span><div class="pagination-actions">${button(icon("back"), "page", "tiny", `data-kind="${kind}" data-direction="-1" aria-label="Previous page" ${page === 0 ? "disabled" : ""}`)}<span style="padding:7px">Page ${page + 1}</span>${button(icon("arrow"), "page", "tiny", `data-kind="${kind}" data-direction="1" aria-label="Next page" ${(page + 1) * per >= total ? "disabled" : ""}`)}</div></div>`;
}
function renderWorkspace() {
  return `<div class="stack"><section class="panel">${panelHeader("Import & export", "A portable JSON backup includes every family, language, rule, and lexicon.")}<div class="settings-card">${icon("download")}<div class="settings-info"><h3>Export workspace</h3><p>Download all your language data as a versioned JSON file.</p></div>${button("Export JSON", "export", "primary")}</div><div class="settings-card">${icon("upload")}<div class="settings-info"><h3>Import workspace</h3><p>Validate a backup and preview its contents before replacing this workspace.</p></div>${button("Choose JSON file", "import-json", "")}</div><div class="settings-card">${icon("book")}<div class="settings-info"><h3>Export current dictionary</h3><p>${language() ? esc(language().name) + " · " + language().lexicon.length + " entries. CSV contains flat entries; use JSON for paradigms, stems, and exceptions." : "Select a language to export its dictionary."}</p></div>${button("Export CSV", "export-csv", "", language() ? "" : "disabled")}</div><div class="settings-card">${icon("edit")}<div class="settings-info"><h3>Workspace name</h3><p>${esc(workspace.name)}</p></div>${button("Rename", "rename-workspace", "")}</div></section><section class="panel">${panelHeader("Storage")}<div class="panel-inner" style="padding-top:0"><p class="intro-text">Data stays in this browser. Export a backup before clearing browser data or moving devices.</p><div class="form-actions">${button("Request persistent storage", "persistent-storage", "")}${button("Sources & licenses", "credits", "")}</div></div></section><section class="panel danger-zone"><div class="settings-card">${icon("trash")}<div class="settings-info"><h3>Reset example workspace</h3><p>Replace this workspace with the original editable Aurelian example. Export first to keep your work.</p></div>${button("Reset workspace", "reset", "danger")}</div></section></div>`;
}

function modal(title, description, body, onSubmit) {
  const el = $("#modal");
  el.classList.remove("dialog-wide");
  el.innerHTML = `<div class="dialog-head"><div><h2 id="dialog-title">${esc(title)}</h2>${description ? `<p>${esc(description)}</p>` : ""}</div>${btnIcon("close", "close-modal", "Close dialog", 'class="dialog-close"')}</div><form id="modal-form"><div class="dialog-body">${body}<p class="dialog-error" id="dialog-error" role="alert"></p></div></form>`;
  const form = $("#modal-form");
  if (onSubmit)
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submit = form.querySelector("button[type=submit]");
      if (submit?.disabled) return;
      if (submit) submit.disabled = true;
      try {
        await onSubmit(new FormData(form));
      } catch (error) {
        $("#dialog-error").textContent = error.message;
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  if (!el.open) el.showModal();
}
function modalActions(label = "Save", extra = "") {
  return `<div class="form-actions">${extra}<span class="spacer"></span>${button("Cancel", "close-modal", "", 'type="button"')}<button class="button primary" type="submit">${label}</button></div>`;
}
function closeModal() {
  $("#modal").close();
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function fileSlug(s) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "teng"
  );
}
function exportAll() {
  download(
    fileSlug(workspace.name) +
      "-" +
      new Date().toISOString().slice(0, 10) +
      ".json",
    exportWorkspace(workspace),
    "application/json",
  );
  toast("Workspace backup downloaded.");
}
async function playSound(id) {
  const p = byId.get(id);
  if (!p?.audio) {
    toast("No audio sample is bundled for this sound.");
    return;
  }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  audio = new Audio(p.audio);
  try {
    await audio.play();
  } catch {
    toast(
      "The audio sample could not play. Try Listen again or check browser audio permissions.",
      true,
    );
  }
}

function editFamily(id) {
  const f = workspace.families.find((x) => x.id === id);
  modal(
    f ? "Edit family" : "New language family",
    "A shared origin for the languages you create.",
    `<div class="form-grid"><label class="full">Family name<input name="name" value="${esc(f?.name)}" maxlength="80" required autofocus></label><label class="full">Description<textarea name="description">${esc(f?.description)}</textarea></label></div>${modalActions(f ? "Save family" : "Create family", f && !workspace.languages.some((l) => l.familyId === f.id) ? button("Delete", "delete-family", "danger", 'type="button" data-id="' + f.id + '"') : "")}`,
    (fd) => {
      const name = fd.get("name").trim();
      if (!name) throw Error("A family needs a name.");
      commit((w) => {
        if (f)
          Object.assign(
            w.families.find((x) => x.id === id),
            { name, description: fd.get("description").trim() },
          );
        else
          w.families.push({
            id: uid(),
            name,
            description: fd.get("description").trim(),
          });
      });
      closeModal();
    },
  );
}
function editLanguage(id, branch = false) {
  const current = workspace.languages.find((x) => x.id === id),
    l = branch ? null : current;
  const fId =
    l?.familyId ||
    current?.familyId ||
    family()?.id ||
    workspace.families[0].id;
  modal(
    l ? "Edit language" : branch ? "Branch " + current.name : "New language",
    "Choose a family and, optionally, a parent language.",
    `<div class="form-grid"><label class="full">Language name<input name="name" value="${esc(l?.name)}" required maxlength="80" autofocus></label><label>Family<select name="familyId" id="dialog-family">${workspace.families.map((f) => `<option value="${f.id}" ${f.id === fId ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></label><label>Parent language<select name="parentId" id="dialog-parent"><option value="">None — independent root</option>${workspace.languages
      .filter((x) => x.id !== l?.id)
      .map(
        (x) =>
          `<option value="${x.id}" data-family="${x.familyId}" ${(branch ? current?.id : l?.parentId) === x.id ? "selected" : ""}>${esc(x.name)}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="full">Description<textarea name="description">${esc(l?.description)}</textarea></label>${l ? "" : `<label class="full checkbox-row"><input name="inherit" type="checkbox" ${branch ? "checked" : ""}> Copy the parent's language settings and lexicon</label>`}</div>${modalActions(l ? "Save language" : "Create language", l && workspace.languages.length > 1 ? button("Delete", "delete-language", "danger", 'type="button" data-id="' + l.id + '"') : "")}`,
    (fd) => {
      const name = fd.get("name").trim(),
        familyId = fd.get("familyId"),
        parentId = fd.get("parentId") || null;
      if (!name) throw Error("A language needs a name.");
      const parent = workspace.languages.find((x) => x.id === parentId);
      if (parent && parent.familyId !== familyId)
        throw Error("Choose a parent in the same family.");
      let nextId;
      commit((w) => {
        if (l) {
          Object.assign(
            w.languages.find((x) => x.id === l.id),
            {
              name,
              familyId,
              parentId,
              description: fd.get("description").trim(),
            },
          );
        } else {
          const added = createLanguage(
            {
              name,
              familyId,
              parentId,
              source: fd.has("inherit") ? parent : undefined,
            },
            PHONEMES,
          );
          added.description = fd.get("description").trim();
          w.languages.push(added);
          nextId = added.id;
        }
      });
      closeModal();
      if (nextId) setLanguage(nextId);
      else if (l) setLanguage(l.id);
    },
  );
  const filterParents = () => {
    const f = $("#dialog-family").value,
      select = $("#dialog-parent");
    [...select.options].forEach((o) => {
      o.hidden = !!o.dataset.family && o.dataset.family !== f;
    });
    if (select.selectedOptions[0]?.hidden) select.value = "";
  };
  $("#dialog-family").addEventListener("change", filterParents);
  filterParents();
}
function editEntry(id, draft = {}, afterSave = null) {
  const entry = language().lexicon.find((w) => w.id === id),
    e = entry || {
      word: "",
      ipa: "",
      gloss: "",
      definition: "",
      pos: "noun",
      notes: "",
      tags: [],
      conceptId: null,
      entryType: "lexeme",
      paradigmId: null,
      stems: {},
      overrides: {},
      source: null,
      ...draft,
    };
  modal(
    entry ? "Edit dictionary entry" : "New dictionary entry",
    "",
    `<div class="form-grid"><label>Pronunciation (IPA)<input class="ipa" name="ipa" value="${esc(e.ipa)}" maxlength="2000" placeholder="e.g. ˈse.la" spellcheck="false" autofocus></label><label>Spelling<input name="word" value="${esc(e.word)}" required maxlength="1000"></label><div class="full entry-spelling-tools"><div class="inline-controls">${button("Spell from IPA", "entry-spell", "tiny", 'type="button"')}${button("Read spelling", "entry-read", "tiny", 'type="button"')}</div><label class="inline-check"><input type="checkbox" name="spellingOverride" ${e.spellingOverride ? "checked" : ""}>Keep a custom spelling</label><p class="field-help">IPA drives word formation. Without it, this entry is a spelling-only record.</p><div id="entry-readings" aria-live="polite"></div></div><label>Meaning / gloss<input name="gloss" value="${esc(e.gloss)}" required maxlength="1000"></label><label>Part of speech<select name="pos">${options([...new Set([...POS, e.pos])], e.pos)}</select></label>${inflectionUI.entryFields(e)}<label class="full">Definition<textarea name="definition" rows="3" maxlength="20000">${esc(e.definition)}</textarea></label><details class="full entry-details rule-notation"><summary>Tags and notes</summary><div class="form-grid"><label class="full">Tags<input name="tags" value="${esc((e.tags || []).join(", "))}" placeholder="e.g. nature, everyday"></label><label class="full">Notes<textarea name="notes" rows="2" maxlength="20000">${esc(e.notes)}</textarea></label></div></details></div>${modalActions(entry ? "Save changes" : "Add to lexicon", entry ? button("Delete", "delete-entry", "danger", `type="button" data-id="${entry.id}"`) : "")}`,
    (fd) => {
      const ipa = fd.get("ipa").trim();
      const pronunciation = ipa ? parseIPA(ipa, language(), PHONEMES) : {ipa:"", segments:[], syllables:[]};
      const spellingOverride = fd.get("spellingOverride") === "on";
      const keepsSnapshot = Boolean(entry) && ipa === e.ipa && fd.get("word").trim() === e.word
        && spellingOverride === Boolean(e.spellingOverride);
      const word = pronunciation.segments.length && !spellingOverride && !keepsSnapshot
        ? spellPhonemes(pronunciation.segments, language(), PHONEMES)
        : fd.get("word").trim();
      const gloss = fd.get("gloss").trim();
      if (!word || !gloss) throw Error("A word needs a spelling and a meaning.");
      const record = {
        id: entry?.id || uid(),
        word,
        ipa: pronunciation.ipa,
        segments: pronunciation.segments,
        syllables: pronunciation.syllables,
        spellingOverride,
        gloss,
        definition: fd.get("definition").trim(),
        pos: fd.get("pos"),
        notes: fd.get("notes").trim(),
        tags: fd
          .get("tags")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        conceptId: e.conceptId,
        ...inflectionUI.entryMetadata(fd, e),
        createdAt: entry?.createdAt || new Date().toISOString(),
      };
      commit((w) => {
        const arr = w.languages.find((x) => x.id === ui.langId).lexicon;
        if (entry) arr[arr.findIndex((x) => x.id === entry.id)] = record;
        else arr.push(record);
      });
      closeModal();
      toast(
        entry ? "Dictionary entry updated." : `${word} added to your lexicon.`,
      );
      afterSave?.();
    },
  );
}
function editClass(key) {
  const l = language(),
    existing = key ? l.soundClasses[key] : null;
  modal(
    existing ? "Edit sound class" : "Define a sound class",
    "Use one uppercase letter, except C and V. Choose sounds from your inventory.",
    `<div class="form-grid"><label class="full">Class letter<input name="key" value="${esc(key)}" pattern="[A-Z]" maxlength="1" required ${existing ? "readonly" : ""} placeholder="N"></label><div class="full check-list">${selectedSounds()
      .map(
        (p) =>
          `<label class="ipa"><input name="sounds" type="checkbox" value="${p.id}" ${existing?.includes(p.id) ? "checked" : ""}>${esc(p.symbol)}</label>`,
      )
      .join(
        "",
      )}</div></div>${modalActions("Save class", existing ? button("Delete", "delete-class", "danger", `type="button" data-key="${key}"`) : "")}`,
    (fd) => {
      const k = fd.get("key").trim().toUpperCase(),
        ids = fd.getAll("sounds");
      if (!/^[A-Z]$/.test(k) || ["C", "V"].includes(k))
        throw Error("Choose one uppercase letter other than C or V.");
      if (!ids.length) throw Error("Select at least one sound for this class.");
      if (!existing && l.soundClasses[k])
        throw Error("That class already exists; edit it instead.");
      invalidateGeneration();
      commit((w) => {
        w.languages.find((x) => x.id === ui.langId).soundClasses[k] = ids;
      });
      closeModal();
    },
  );
}
function editMorpheme(id) {
  const m = language().morphemes.find((x) => x.id === id);
  modal(
    m ? "Edit morpheme" : "A new morpheme",
    "Save phonemes to reuse in words and formation rules.",
    `<div class="form-grid"><label>Phonemes (IPA)<input class="ipa" name="form" value="${esc(m?.form)}" placeholder="n a" required maxlength="100" spellcheck="false"></label><label>Type<select name="type">${options(["root", "prefix", "suffix", "infix", "circumfix"], m?.type || "root")}</select></label><label class="full">Meaning<input name="meaning" value="${esc(m?.meaning)}" required maxlength="160"></label><label class="full">Part of speech<select name="pos">${options(POS, m?.pos || "noun")}</select></label></div>${modalActions("Save morpheme", m ? button("Delete", "delete-morpheme", "danger", `type="button" data-id="${id}"`) : "")}`,
    (fd) => {
      const r = {
        id: m?.id || uid(),
        form: fd.get("form").trim(),
        meaning: fd.get("meaning").trim(),
        type: fd.get("type"),
        pos: fd.get("pos"),
      };
      if (!r.form || !r.meaning)
        throw Error("Provide both a form and a meaning.");
      commit((w) => {
        const arr = w.languages.find((x) => x.id === ui.langId).morphemes;
        if (m) arr[arr.findIndex((x) => x.id === id)] = r;
        else arr.push(r);
      });
      closeModal();
    },
  );
}
function editRule(id, draft = {}) {
  const existing = language().morphologyRules.find((x) => x.id === id);
  const r = existing || draft;
  modal(
    existing ? "Edit formation rule" : "New formation rule",
    "Transform phonemes before applying spelling rules.",
    `<div class="form-grid"><label class="full">Rule name<input name="name" value="${esc(r?.name)}" required placeholder="e.g. Noun plural"></label><label>Operation<select name="kind">${options(["suffix", "prefix", "infix", "circumfix", "reduplication"], r?.kind || "suffix")}</select></label><label>Part of speech<select name="pos">${options([...new Set(["any", ...POS, r?.pos].filter(Boolean))], r?.pos || "noun")}</select></label><label>Phonemes to attach (IPA)<input class="ipa" name="form" value="${esc(r?.form)}" placeholder="e.g. n a" spellcheck="false"></label><label class="circumfix-field" ${(r?.kind || "suffix") === "circumfix" ? "" : "hidden"}>Final phonemes (circumfix)<input class="ipa" name="secondForm" value="${esc(r?.secondForm)}" spellcheck="false"></label><label>Feature / meaning<input name="feature" value="${esc(r?.feature)}" required placeholder="e.g. plural"></label><label>Condition<select name="condition">${options(["always", "vowel-final", "consonant-final"], r?.condition || "always")}</select></label></div>${modalActions("Save rule", existing ? button("Delete", "delete-rule", "danger", `type="button" data-id="${id}"`) : "")}`,
    (fd) => {
      const x = {
        id: existing?.id || uid(),
        name: fd.get("name").trim(),
        kind: fd.get("kind"),
        pos: fd.get("pos"),
        form: fd.get("form").trim(),
        secondForm: fd.get("kind") === "circumfix" ? fd.get("secondForm").trim() : "",
        feature: fd.get("feature").trim(),
        condition: fd.get("condition"),
      };
      if (!x.name || !x.feature) throw Error("Provide a name and a feature.");
      if (x.kind !== "reduplication" && !x.form)
        throw Error("Provide a form for this operation.");
      if (x.kind === "circumfix" && !x.secondForm)
        throw Error("A circumfix needs both forms.");
      commit((w) => {
        const arr = w.languages.find((l) => l.id === ui.langId).morphologyRules;
        if (existing) arr[arr.findIndex((v) => v.id === id)] = x;
        else arr.push(x);
      });
      closeModal();
    },
  );
}

function confirmAction(title, text, action, label = "Continue") {
  modal(
    title,
    text,
    `<p class="intro-text">${esc(text)}</p>${modalActions(label)}`,
    () => {
      action();
      closeModal();
    },
  );
}
async function importJSON(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024)
    throw Error("This backup exceeds the 25 MB import limit.");
  const data = validateWorkspace(JSON.parse(await file.text()), PHONEMES);
  modal(
    "Restore this workspace?",
    `Validated JSON · ${data.families.length} families · ${data.languages.length} languages`,
    `<p class="intro-text"><strong>${esc(data.name)}</strong> contains ${data.languages.reduce((n, l) => n + l.lexicon.length, 0).toLocaleString()} dictionary entries. Importing replaces the current workspace.</p><div class="tip">${icon("info")}<p>Download a backup of the current workspace before replacing it.</p></div>${modalActions("Replace workspace", button("Export current", "export", "", 'type="button"'))}`,
    async () => {
      clearTimeout(saveTimer);
      saveSequence++;
      saveState = "saving";
      saveIndicator();
      try {
        await saveWorkspace(data);
      } catch (error) {
        saveState = "error";
        saveError = error.message;
        saveIndicator();
        throw error;
      }
      workspace = data;
      ui.langId = data.languages.some((l) => l.id === ui.langId)
        ? ui.langId
        : data.languages[0].id;
      ui.familyId = data.languages.find((l) => l.id === ui.langId).familyId;
      generated = [];
      quickWords = [];
      saveState = "saved";
      saveError = "";
      persistPreferences();
      closeModal();
      render();
      toast("Workspace restored.");
    },
  );
}
async function importCSV(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024)
    throw Error("This CSV exceeds the 10 MB import limit.");
  const entries = parseLexiconCSV(await file.text());
  modal(
    "Import dictionary entries",
    `${entries.length} parsed rows for ${language().name}`,
    `<p class="intro-text">Entries will be appended to this language. Exact word + meaning duplicates are skipped. Existing words are preserved.</p>${modalActions("Import entries")}`,
    () => {
      let count = 0;
      commit((w) => {
        const lex = w.languages.find((x) => x.id === ui.langId).lexicon;
        const seen = new Set(lex.map((x) => x.word + "\u0000" + x.gloss));
        for (const e of entries) {
          const k = e.word + "\u0000" + e.gloss;
          if (seen.has(k)) continue;
          seen.add(k);
          lex.push({
            ...e,
            id: uid(),
            conceptId: e.conceptId || null,
            createdAt: new Date().toISOString(),
          });
          count++;
        }
      });
      closeModal();
      toast(`${count} dictionary entries imported.`);
    },
  );
}
function batchConcepts() {
  const linked = new Set(language().lexicon.map((x) => x.conceptId));
  const available = filteredConcepts().filter((c) => !linked.has(c.id));
  if (!available.length) {
    toast("No untranslated concepts match these filters.");
    return;
  }
  modal(
    "Grow your dictionary",
    `${available.length.toLocaleString()} untranslated concepts match your current filters.`,
    `<p class="intro-text">Generate unique forms and attach the bundled definition to each. Words are drafts for you to review.</p><div class="form-grid"><label>Number of entries<input type="number" name="count" min="1" max="${Math.min(500, available.length)}" value="${Math.min(20, available.length)}" required></label><label>Seed (optional)<input name="seed" placeholder="Random"></label></div>${modalActions("Generate & add")}`,
    (fd) => {
      const count = Math.min(500, available.length, Number(fd.get("count")));
      const result = generateWords(language(), PHONEMES, {
        count,
        seed: fd.get("seed").trim() || String(Date.now()),
      });
      if (!result.words.length)
        throw Error(
          result.warnings.join(" ") ||
            "No words could be generated. Expand your inventory or patterns.",
        );
      commit((w) => {
        const lex = w.languages.find((x) => x.id === ui.langId).lexicon;
        result.words.forEach((word, i) => {
          const c = available[i];
          lex.push({
            id: uid(),
            word: word.word,
            ipa: word.ipa,
            gloss: c.word,
            definition: c.definition,
            pos: c.pos,
            entryType: "lexeme",
            paradigmId: null,
            stems: {},
            overrides: {},
            source: null,
            tags: ["generated"],
            notes: "Generated draft. Definition: Princeton WordNet.",
            conceptId: c.id,
            createdAt: new Date().toISOString(),
          });
        });
      });
      closeModal();
      toast(
        `${result.words.length} draft entries added.${result.warnings.length ? " " + result.warnings.join(" ") : ""}`,
      );
    },
  );
}
function showCredits() {
  modal(
    "Sources & licenses",
    "Local assets, clear origins.",
    `<div class="credits"><h3>Starter vocabulary</h3><p>5,000 common English content words, selected by frequency, with one chosen sense per word from <a href="https://wordnet.princeton.edu/" target="_blank" rel="noreferrer">Princeton WordNet</a>. Frequency data: <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noreferrer">wordfreq</a>, by Robyn Speer. See the included selection notes and license texts.</p><h3>IPA sound references</h3><p>IPA symbols are organized by place and manner of articulation. Audio samples are bundled locally, with source and license details for each available recording.</p><p><a href="./assets/ipa/ATTRIBUTION.md" target="_blank">Audio sources & licenses</a> · <a href="./data/licenses/VOCABULARY.md" target="_blank">Vocabulary source notes</a></p><h3>About the examples</h3><p>Aurelian, Proto-Aru, Selari, and Velan are invented example languages. Generated words are candidates, not linguistic claims. The grammar profile records your choices; it does not translate sentences automatically.</p></div><div class="form-actions">${button("Close", "close-modal", "", 'type="button"')}</div>`,
  );
}

document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (b.tagName === "A") event.preventDefault();
  if (a.startsWith("submit-")) return;
  try {
    if (phonotacticsUI.handleAction(b) || inflectionUI.handleAction(b) || orthographyUI.handleAction(b) || grammarUI.handleAction(b)) return;
    switch (a) {
      case "navigate":
        navigate(b.dataset.page);
        break;
      case "menu":
        ui.mobileOpen = !ui.mobileOpen;
        $(".sidebar").classList.toggle("open", ui.mobileOpen);
        break;
      case "export":
        exportAll();
        break;
      case "export-csv":
        download(
          fileSlug(language().name) + "-lexicon.csv",
          toCSV(language().lexicon),
          "text/csv;charset=utf-8",
        );
        toast("Dictionary CSV downloaded.");
        break;
      case "import-json":
        $("#import-json").click();
        break;
      case "import-csv":
        $("#import-csv").click();
        break;
      case "sound-tab":
        ui.tab = b.dataset.tab;
        render();
        break;
      case "toggle-sound": {
        const id = b.dataset.id;
        ui.soundId = id;
        generated = [];
        commit((w) => {
          const l = w.languages.find((x) => x.id === ui.langId);
          if (l.phonemeIds.includes(id)) {
            const symbol = byId.get(id)?.symbol;
            if (
              l.phonotactics.constraints.some((r) =>
                r.sequence.split(/\s+/).includes(symbol),
              )
            )
              throw Error(
                "Remove this sound from sequence constraints before deselecting it.",
              );
            delete l.phonotactics.phonemeWeights[id];
            l.phonemeIds = l.phonemeIds.filter((x) => x !== id);
            for (const k of Object.keys(l.soundClasses))
              l.soundClasses[k] = l.soundClasses[k].filter((x) => x !== id);
          } else {
            l.phonemeIds.push(id);
            l.orthography[id] ??= byId.get(id).symbol;
          }
        });
        if (ui.audio) playSound(id);
        break;
      }
      case "inspect-sound":
        ui.soundId = b.dataset.id;
        render();
        if (ui.audio) playSound(ui.soundId);
        break;
      case "play-sound":
        playSound(b.dataset.id);
        break;
      case "quick-refresh":
        quickWords = [];
        try {
          quickWords = generateWords(language(), PHONEMES, {
            count: 4,
            seed: String(Date.now()),
          }).words;
        } catch (e) {
          toast(e.message, true);
        }
        render();
        break;
      case "ipa-spelling":
        confirmAction(
          "Use IPA spelling?",
          "Replace spelling mappings in this language with each phoneme’s IPA symbol.",
          () =>
            commit((w) => {
              const l = w.languages.find((x) => x.id === ui.langId);
              for (const id of l.phonemeIds)
                l.orthography[id] = byId.get(id).symbol;
            }),
          "Replace mappings",
        );
        break;
      case "new-family":
        editFamily();
        break;
      case "edit-family":
        editFamily(b.dataset.id);
        break;
      case "new-language":
        editLanguage();
        break;
      case "edit-language":
        editLanguage(b.dataset.id);
        break;
      case "branch-language":
        editLanguage(ui.langId, true);
        break;
      case "select-language":
        setLanguage(b.dataset.id);
        navigate("phonology");
        break;
      case "delete-family":
        commit((w) => {
          if (w.languages.some((l) => l.familyId === b.dataset.id))
            throw Error("This family still contains languages.");
          w.families = w.families.filter((f) => f.id !== b.dataset.id);
        });
        closeModal();
        break;
      case "delete-language": {
        const id = b.dataset.id;
        if (workspace.languages.some((x) => x.parentId === id))
          throw Error(
            "Reparent descendant languages before deleting their parent.",
          );
        closeModal();
        confirmAction(
          "Delete this language?",
          "Its settings and dictionary will be removed from this workspace.",
          () => {
            commit((w) => {
              w.languages = w.languages.filter((x) => x.id !== id);
            });
            render();
          },
          "Delete language",
        );
        break;
      }
      case "new-entry":
        editEntry();
        break;
      case "edit-entry":
        editEntry(b.dataset.id);
        break;
      case "select-generated":
        ui.generatedSelected = generated
          .map((w, i) =>
            w.gloss && !language().lexicon.some((e) => e.word === w.word)
              ? i
              : null,
          )
          .filter((i) => i !== null);
        render();
        break;
      case "save-generated-batch":
        saveGeneratedBatch();
        break;
      case "save-generated": {
        const w = generated[Number(b.dataset.index)];
        editEntry(null, w);
        break;
      }
      case "concept-word": {
        const c = concepts.find((c) => c.id === b.dataset.id);
        const result = generateWords(language(), PHONEMES, {
          count: 1,
          seed: String(Date.now()),
        });
        if (!result.words.length)
          throw Error(
            "No unused word can be generated. Expand your inventory or word patterns.",
          );
        editEntry(null, {
          ...result.words[0],
          gloss: c.word,
          definition: c.definition,
          pos: c.pos,
          conceptId: c.id,
          notes: "Definition: Princeton WordNet.",
        });
        break;
      }
      case "delete-entry": {
        const id = b.dataset.id;
        closeModal();
        confirmAction(
          "Delete this dictionary entry?",
          "This entry will be removed from the current language.",
          () =>
            commit((w) => {
              const l = w.languages.find((x) => x.id === ui.langId);
              l.lexicon = l.lexicon.filter((e) => e.id !== id);
              for (const e of l.lexicon)
                if (e.source?.lexemeId === id) e.source = null;
            }),
          "Delete entry",
        );
        break;
      }
      case "new-class":
        editClass();
        break;
      case "edit-class":
        editClass(b.dataset.key);
        break;
      case "delete-class": {
        const key = b.dataset.key;
        if (
          language().phonotactics.patterns.some((p) =>
            p.pattern.includes(key),
          ) ||
          language().phonotactics.constraints.some((r) =>
            r.sequence.split(/\s+/).includes(key),
          )
        )
          throw Error(
            "Remove this class from syllable patterns and sequence constraints before deleting it.",
          );
        invalidateGeneration();
        commit((w) => {
          delete w.languages.find((x) => x.id === ui.langId).soundClasses[key];
        });
        closeModal();
        break;
      }
      case "save-morph":
        if (lastMorph) editEntry(null, lastMorph);
        break;
      case "use-morpheme": {
        const m = language().morphemes.find((x) => x.id === b.dataset.id);
        if (!m) throw Error("This morpheme no longer exists.");
        if (m.type === "root") {
          const form = parseIPA(m.form, language(), PHONEMES);
          editEntry(null, {...form, word:spellPhonemes(form.segments, language(), PHONEMES), gloss:m.meaning, pos:m.pos});
        } else editRule(null, {name:m.meaning, form:m.form, feature:m.meaning, pos:m.pos, kind:m.type});
        break;
      }
      case "entry-spell": {
        const form = $("#modal-form");
        const parsed = parseIPA(form.elements.ipa.value, language(), PHONEMES);
        form.elements.word.value = spellPhonemes(parsed.segments, language(), PHONEMES);
        form.elements.spellingOverride.checked = false;
        $("#entry-readings").innerHTML = "";
        break;
      }
      case "entry-read": {
        const form = $("#modal-form");
        const result = analyzeSpelling(form.elements.word.value, language(), PHONEMES);
        $("#entry-readings").innerHTML = `<p class="field-help">${result.truncated ? "Search limit reached. Choose a reading or enter IPA directly." : result.ambiguous ? "Several pronunciations match. Choose one:" : result.candidates.length ? "Use this pronunciation:" : "No reading matches. Enter IPA directly."}</p><div class="reading-choices">${result.candidates.map((candidate) => { const ipa=candidate.segments.map((id)=>byId.get(id).symbol).join(" "); return button("/" + esc(ipa) + "/", "entry-use-reading", "tiny ipa", `type="button" data-ipa="${esc(ipa)}"`); }).join("")}</div>`;
        break;
      }
      case "entry-use-reading":
        $("#modal-form").elements.ipa.value = b.dataset.ipa;
        $("#entry-readings").innerHTML = '<p class="field-help">Pronunciation selected.</p>';
        break;
      case "new-morpheme":
        editMorpheme();
        break;
      case "edit-morpheme":
        editMorpheme(b.dataset.id);
        break;
      case "delete-morpheme":
        commit((w) => {
          const l = w.languages.find((x) => x.id === ui.langId);
          l.morphemes = l.morphemes.filter((x) => x.id !== b.dataset.id);
        });
        closeModal();
        break;
      case "new-rule":
        editRule();
        break;
      case "edit-rule":
        editRule(b.dataset.id);
        break;
      case "delete-rule":
        commit((w) => {
          const l = w.languages.find((x) => x.id === ui.langId);
          l.morphologyRules = l.morphologyRules.filter(
            (x) => x.id !== b.dataset.id,
          );
        });
        closeModal();
        break;
      case "close-modal":
        closeModal();
        break;
      case "page": {
        ui[b.dataset.kind === "lex" ? "lexPage" : "conceptPage"] += Number(
          b.dataset.direction,
        );
        $(
          "#" + (b.dataset.kind === "lex" ? "lex" : "concept") + "-results",
        ).innerHTML =
          b.dataset.kind === "lex"
            ? renderLexResults()
            : renderConceptResults();
        break;
      }
      case "batch-concepts":
        batchConcepts();
        break;
      case "credits":
        showCredits();
        break;
      case "rename-workspace":
        modal(
          "Workspace name",
          "A home for all your language projects.",
          `<label>Workspace name<input name="name" value="${esc(workspace.name)}" maxlength="80" required></label>${modalActions()}`,
          (fd) => {
            const name = fd.get("name").trim();
            if (!name) throw Error("Enter a workspace name.");
            commit((w) => (w.name = name));
            closeModal();
          },
        );
        break;
      case "persistent-storage": {
        const yes = await navigator.storage?.persist?.();
        toast(
          yes
            ? "Persistent browser storage granted. Keep exporting backups."
            : "The browser did not grant persistent storage. Your work still saves normally; keep backups.",
        );
        break;
      }
      case "reset":
        confirmAction(
          "Reset this workspace?",
          "All current languages will be replaced by the editable Aurelian example. Export a backup before continuing.",
          () => {
            commit((w) => {
              Object.assign(w, createWorkspace(PHONEMES));
            });
            ui.langId =
              workspace.languages.find((l) => l.name === "Selari")?.id ||
              workspace.languages[0].id;
            ui.familyId = workspace.languages.find(
              (l) => l.id === ui.langId,
            ).familyId;
            generated = [];
            quickWords = [];
            render();
          },
          "Reset workspace",
        );
        break;
    }
  } catch (e) {
    if ($("#modal").open && $("#dialog-error"))
      $("#dialog-error").textContent = e.message;
    else toast(e.message, true);
  }
});
document.addEventListener("change", async (event) => {
  const e = event.target;
  try {
    if (inflectionUI.handleChange(e)) return;
    if (e.closest("#modal-form") && e.name === "kind" && $(".circumfix-field")) {
      $(".circumfix-field").hidden = e.value !== "circumfix";
      return;
    }
    if (e.closest("#morph-form")) {
      lastMorph = null;
      $("#morph-save").disabled = true;
      $("#morph-output").innerHTML = '<p class="compact-note">Generate the form to apply your changes.</p>';
      return;
    }
    if (e.id === "generator-pos") {
      $("#generator-paradigm").innerHTML = generatorParadigmOptions(
        e.value,
        "",
      );
      return;
    }
    if (e.matches("[data-generated]")) {
      const index = Number(e.dataset.generated);
      ui.generatedSelected = ui.generatedSelected.filter((i) => i !== index);
      if (e.checked) ui.generatedSelected.push(index);
      e.closest(".generated-card").classList.toggle("selected", e.checked);
      return;
    }
    if (e.id === "lex-kind") {
      ui.lexKind = e.value;
      ui.lexPage = 0;
      $("#lex-results").innerHTML = renderLexResults();
      return;
    }
    if (e.id === "family-select") setFamily(e.value);
    else if (e.id === "language-select") setLanguage(e.value);
    else if (e.id === "audio-toggle") {
      ui.audio = e.checked;
      persistPreferences();
    } else if (e.classList.contains("orthography-input")) {
      const value = e.value.trim();
      if (!value) {
        e.value =
          language().orthography[e.dataset.id] || byId.get(e.dataset.id).symbol;
        throw Error("A spelling mapping cannot be empty.");
      }
      commit((w) => {
        w.languages.find((x) => x.id === ui.langId).orthography[e.dataset.id] =
          value;
      }, false);
      generated = [];
    } else if (e.id === "concept-pos") {
      ui.conceptPos = e.value;
      ui.conceptPage = 0;
      $("#concept-results").innerHTML = renderConceptResults();
    } else if (e.id === "concept-untranslated") {
      ui.conceptUntranslated = e.checked;
      ui.conceptPage = 0;
      $("#concept-results").innerHTML = renderConceptResults();
    } else if (e.id === "import-json") {
      await importJSON(e.files[0]);
      e.value = "";
    } else if (e.id === "import-csv") {
      await importCSV(e.files[0]);
      e.value = "";
    }
  } catch (error) {
    toast(error.message, true);
    if (e.type === "file") e.value = "";
  }
});
document.addEventListener("input", (event) => {
  const e = event.target;
  if (e.closest("#modal-form") && e.name === "word" && $("#modal-form").elements.spellingOverride) {
    $("#modal-form").elements.spellingOverride.checked = true;
    $("#entry-readings").innerHTML = "";
  } else if (e.closest("#modal-form") && e.name === "ipa" && $("#modal-form").elements.spellingOverride) {
    const form = $("#modal-form");
    $("#entry-readings").innerHTML = "";
    if (!form.elements.spellingOverride.checked && e.value.trim()) {
      try {const parsed=parseIPA(e.value,language(),PHONEMES); form.elements.word.value=spellPhonemes(parsed.segments,language(),PHONEMES);} catch { /* Wait for a complete IPA sequence. */ }
    }
  } else if (e.closest("#morph-form")) {
    lastMorph = null;
    $("#morph-save").disabled = true;
    $("#morph-output").innerHTML = '<p class="compact-note">Generate the form to apply your changes.</p>';
  } else if (e.id === "lex-search") {
    ui.lexQuery = e.value;
    ui.lexPage = 0;
    $("#lex-results").innerHTML = renderLexResults();
  } else if (e.id === "concept-search") {
    ui.conceptQuery = e.value;
    ui.conceptPage = 0;
    $("#concept-results").innerHTML = renderConceptResults();
  }
});
document.addEventListener("submit", (event) => {
  const f = event.target;
  if (f.id === "modal-form") return;
  event.preventDefault();
  const fd = new FormData(f);
  try {
    if (phonotacticsUI.handleSubmit(f, fd) || orthographyUI.handleSubmit(f, fd) || grammarUI.handleSubmit(f, fd)) return;
    if (f.id === "generate-form") {
      generateCandidateWords(fd);
    } else if (f.id === "morph-form") {
      lastMorph = null;
      $("#morph-save").disabled = true;
      $("#morph-output").innerHTML = "";
      const root = String(fd.get("root") || "").trim();
      const rule = language().morphologyRules.find((r) => r.id === fd.get("rule"));
      if (!rule) throw Error("Choose a formation rule.");
      const base = root ? null : language().lexicon.find((e) => e.id === fd.get("lexemeId"));
      if (!base && !root) throw Error("Choose a lexeme or enter an IPA form.");
      if (base && rule.pos !== "any" && rule.pos !== base.pos)
        throw Error(`This rule applies to ${rule.pos} forms; the selected lexeme is ${base.pos}.`);
      const result = applyMorphology(base || root, rule, language(), PHONEMES);
      const inputSegments = base?.segments?.length ? base.segments : parseIPA(root || base.ipa, language(), PHONEMES).segments;
      const unchanged = inputSegments.join(" ") === result.segments.join(" ");
      const check = result.phonotactics;
      const diagnostics = check && (!check.ok || check.ambiguous || check.truncated)
        ? `<details class="form-diagnostics" open><summary>${check.truncated ? "Syllable analysis incomplete" : check.ambiguous ? "Ambiguous syllables" : "Outside phonotactics"}</summary><ul>${check.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul><p>Review the rules or supply explicit IPA when saving an exception.</p></details>` : "";
      $("#morph-output").innerHTML = `<div class="word-form">${esc(result.word)}</div><div class="word-ipa">/${esc(result.ipa)}/</div><p class="compact-note">${unchanged ? "The condition did not match. No new form was produced." : "Phonemes transformed, then spelling applied."}</p>${diagnostics}`;
      if (unchanged) return;
      lastMorph = {
        ...result,
        spellingOverride: false,
        gloss: (base?.gloss || root) + " (" + rule.feature + ")",
        definition: rule.feature + " form of " + (base?.gloss || root) + "." + (base?.definition ? " Base meaning: " + base.definition : ""),
        pos: base?.pos || (rule.pos === "any" ? "other" : rule.pos),
        notes: "Derived from " + (base?.word || root) + " using " + rule.name + ".",
        tags: ["derived", rule.feature],
      };
      $("#morph-save").disabled = false;
    }
  } catch (e) {
    toast(e.message, true);
  }
});
window.addEventListener("beforeunload", (e) => {
  if (saveState === "saving" || saveState === "error") {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function start() {
  try {
    workspace = await loadWorkspace();
    if (workspace) {
      workspace = validateWorkspace(workspace, PHONEMES);
      saveState = "saved";
    } else {
      workspace = createWorkspace(PHONEMES);
      ui.langId =
        workspace.languages.find((l) => l.name === "Selari")?.id ||
        workspace.languages[0].id;
      await saveWorkspace(workspace);
      saveState = "saved";
    }
    if (
      !workspace.languages.some((l) => l.id === ui.langId) &&
      !workspace.families.some((f) => f.id === ui.familyId)
    )
      ui.langId =
        workspace.languages.find((l) => l.name === "Selari")?.id ||
        workspace.languages[0].id;
    persistPreferences();
    render();
    fetch("./data/concepts.json")
      .then((r) => {
        if (!r.ok) throw Error("The bundled concept library could not load.");
        return r.json();
      })
      .then((data) => {
        concepts = Array.isArray(data)
          ? data
          : data.concepts || data.entries || [];
        if (ui.page === "concepts") render();
      })
      .catch((e) => toast(e.message, true));
  } catch (e) {
    saveState = "error";
    saveError = e.message;
    $("#app").innerHTML =
      `<div class="loading"><img class="brand-mark" src="./assets/teng.svg" alt="TENG"><h2>Your workspace could not open.</h2><p style="max-width:480px">${esc(e.message)}<br>Existing data has not been overwritten or reset.</p><button class="button" id="retry-open">Try again</button></div>`;
    $("#retry-open").onclick = () => location.reload();
  }
}
start();
