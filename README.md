# TENG Conlang Creator

A client-only foundation for constructing language families, sound inventories, orthographies, words, morphology and dictionaries. The bundled example family is fictional and editable.

## Run

No dependencies or compilation are required. With Node.js 20 or later, start the included static server:

```sh
npm start
```

Open `http://localhost:8000`. Do not open `index.html` through `file://`: browser modules, data loading and persistent storage require an HTTP origin. The `dist/` directory can be hosted by any static host; application paths are relative.

## GitHub Pages

The included [Pages workflow](.github/workflows/pages.yml) runs `npm test` on Node.js 24, then publishes the contents of `dist/`. It needs no dependency installation or build step.

To publish when ready:

1. Upload the project contents to the root of a GitHub repository on its `main` branch. Include the `.github/` folder as well as `dist/`, `tests/`, `package.json` and the other source and attribution files; keep the directory structure intact.
2. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, select **GitHub Actions**. The workflow is already included, so no generated template is needed.
3. Open **Actions → Deploy to GitHub Pages → Run workflow**, select `main`, and run it for the first publication. Subsequent pushes to `main` publish automatically after the tests pass.

The successful workflow run exposes the site URL. GitHub's default `github.io` address needs no custom-domain configuration; relative paths support repository subdirectories. See [GitHub's Pages setup instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) for repository settings.

## Data and persistence

- IndexedDB stores the complete workspace. Local storage holds interface preferences only.
- Saves are serialized. A revision check prevents one tab from silently overwriting another tab’s changes. Export the unsaved tab, then reload to resolve a conflict.
- Browser storage belongs to the current origin and browser profile. Moving the site does not transfer work automatically. Export a JSON backup before clearing browser data or moving hosts.
- JSON backups use `schemaVersion: 3`, including canonical phoneme IDs, syllables, contextual spelling rules, paradigms and saved-form provenance. This is a breaking format: older backups are rejected and there is no migration. Version 3 uses fresh `teng-workspace-v3` / `teng-preferences-v3` storage; older browser data is left untouched. Imports and startup validate IDs, sound references, bounds, ancestry and inflection references. Invalid current-version data is rejected without resetting it.
- CSV imports require `word` and `gloss` columns. Optional fields: `ipa`, `definition`, `pos`, `tags`, `conceptId`, `notes`. Tags can be a JSON array or separated with semicolons. CSV contains flat dictionary entries; imports become unassigned lexemes and cannot restore paradigms, stems, exceptions or saved-form relationships. Use JSON for a full backup. CSV exports protect spreadsheet applications from formula execution while preserving values on reimport.
- A derived language copies its parent’s configuration and entries at creation. Subsequent edits are independent; ancestry does not automatically propagate changes.

## Construction model

### Phonemes are the source

A known pronunciation stores stable phoneme IDs and syllable boundaries alongside IPA. Generation and morphology use these IDs; written characters do not determine vowel classes or affix positions. An affricate such as `t͡ʃ` remains one phoneme even if written `ch`.

The pipeline is **lexeme or named stem → ordered phoneme operations → phonotactic analysis and stress → contextual spelling**. Explicit spelling exceptions apply after rendering. There is no separate automatic allophony or historical sound-change stage; a spelling rule changes writing, not pronunciation.

Manual entries may have spelling without IPA, but cannot generate forms until pronunciation is supplied. IPA must use the selected inventory. Spaces separate phonemes, dots separate syllables, and `ˈ` / `ˌ` mark stress before a syllable. Compact IPA is also accepted; spaces make segment boundaries explicit. Changing an entry’s pronunciation updates its canonical phoneme data.

### Orthography

Default spellings map whole phonemes to text. Missing defaults fall back to the IPA symbol. Context rules contain a literal IPA sequence, output spelling, and optional preceding/following contexts. Contexts use space-separated IPA segments, `C`, `V`, custom sound classes, or `#` for a word boundary. Put `#` first in a preceding context or last in a following context. Blank context matches anywhere.

Rules run left to right over the completed phoneme sequence. **The first matching rule in the list wins at each position**, consumes its matched phonemes, and writes its output. Priority is list order, not longest match. Context always inspects the original phonemes; output text is never fed back into the rules. Empty spellings are rejected; silent output is not supported.

For example, mapping `/k/` to `c` before `/i/` makes `/tak/ + /i/` produce pronunciation `/taki/` and spelling `taci`. The vowel context becomes available after affixation.

Reading a spelling is an inverse search, not a guaranteed one-to-one conversion. It enumerates candidate phoneme sequences and verifies each against the forward contextual renderer. At most 32 candidates are returned; reaching a search limit is reported and never treated as proof of uniqueness. Phonotactic validity is checked separately. The lexeme editor lets you choose a reading explicitly or enter IPA directly. New forms use current rules. Existing entries keep saved spellings until explicitly updated: **Review dictionary spellings** previews and updates selected lexemes with known pronunciation. Saved inflected forms and custom spellings remain snapshots. Editing only a meaning or note preserves the displayed spelling.

### Phonotactics and generation

`C` means selected consonants; `V` means selected vowels. Other single uppercase letters name custom classes shared with morphology and orthography. Enter one syllable pattern per line, optionally weighted: `CV : 3`, `CVC : 1`, `(C)V(C) : 2`. Parentheses and `?` mark optional material; nesting is limited to four levels. Pattern weights, sound weights, and optional-group probability affect sampling. They are preferences, so a low probability does not make a structurally allowed sequence invalid.

Constraints require or forbid whole phonemes or classes, for example `C C C`, `ŋ`, or `N V`. Choose word/syllable scope and anywhere/start/end position. Word rules can cross syllable boundaries. Required syllable rules must match every syllable; forbidden ones must match none. The separate forbidden-IPA field checks literal substrings of joined IPA. No user expression is evaluated as code or regex.

The phonotactic tester checks supplied syllable boundaries against patterns, syllable counts, constraints, banned text and any supplied primary stress. For example, test `s e . l a`. It does not check dictionary uniqueness. Derived forms also undergo bounded syllabification analysis: a unique legal partition receives the configured stress; ambiguous, incomplete or invalid analysis keeps unmarked IPA and displays diagnostics. Analysis reports up to eight legal partitions. It does not drop or rewrite affixes to force a match. Explicit lemma and exception boundaries/stress are preserved, with inconsistencies reported. Intentional irregular forms remain saveable.

Word generation samples phonemes with a repeatable seed, applies constraints and stress, then renders orthography. Each candidate retains phonemes and syllables. Spellings are unique within a batch and against the lexicon; a finite retry budget reports exhaustion. Choose forms only, or attach unused vocabulary concepts and an optional matching paradigm. Meanings are prompts to edit, not meanings inferred from sounds.

### Word formation and inflection

Word formation supports prefixes, suffixes, circumfixes, infixes after the **first phoneme**, and full reduplication. Its separator is an IPA sequence between the copies, optionally empty. Conditions inspect the final phoneme’s inventory type; rules can also restrict the input part of speech. The morpheme inventory supplies reusable phoneme sequences: create a word from a root or copy an affix into a formation rule. These copies are independent.

Declensions and conjugations contain labeled slots, feature bundles such as `case=nom, number=sg`, and ordered operations. Operations add affixes, reduplicate, or replace a phoneme sequence at the beginning, end, throughout, or across the whole form. Conditions inspect the current phonemes before each operation, using IPA sequences, sound classes or vowel/consonant endings. Empty replacement deletes a match; an empty affix is rejected. A slot with no operations intentionally uses its stem unchanged. Labels, features and notes describe or identify forms; executable behavior comes from the operations.

A lexeme can have one paradigm matching its part of speech. Named stems use `name = IPA`, for example `oblique = s e l`; a missing required stem produces a per-form error. Exceptions can replace the complete pronunciation, override only spelling, or omit the form. IPA exceptions bypass regular steps and missing stems, then use normal spelling unless an exceptional spelling is also supplied. Spelling-only exceptions retain regular phonology. Reassigning a paradigm clears its old exceptions.

Preview forms directly in the paradigm editor or from a lexeme, inspect operation traces, then save selected results. Saved entries retain pronunciation and source-slot metadata as snapshots; later rule/stem edits do not rewrite them. Deleting definitions preserves saved entries and clears affected assignments/exceptions. Deleting a source lexeme clears its saved forms’ source links.

### Sentence structure

The clause builder executes word-order, adjective-position, possessor-position and adposition rules on explicitly selected dictionary forms. The adjective modifies the object; the possessor wraps that phrase; the adposition wraps the result. Free/flexible settings enumerate permitted alternatives rather than choosing silently. Saved inflected forms can be selected directly.

This is controlled assembly, not a parser or translator: it does not infer case, agreement, alignment or semantic roles. Grammar reference notes are explicitly descriptive.

## Suggested workflow

1. Choose sounds, define syllable patterns and classes, then test phonotactics.
2. Set default spellings and contextual rules; test both writing and reading.
3. Generate and define lexemes, preserving their IPA.
4. Build formation rules and paradigms; preview phonemes, spelling and diagnostics.
5. Add named stems or exceptions, save useful forms, and compose clauses from them.
6. Export JSON to retain the complete language system.

## Source layout

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/app.js`, styles | Interface and browser integration |
| `dist/engine.js` | Generation, word formation and import/export validation |
| `dist/phonology.js`, `dist/orthography-ui.js` | Phoneme operations, contextual spelling and inverse analysis |
| `dist/phonotactics.js`, `dist/phonotactics-ui.js` | Pattern/constraint checks, weighted sampling and bounded syllabification |
| `dist/inflection.js`, `dist/inflection-ui.js` | Paradigms, ordered transformations, lexeme assignments and form previews |
| `dist/grammar.js`, `dist/grammar-ui.js` | Explicit-form clause assembly and ordering rules |
| `dist/storage.js` | IndexedDB transactions, revision checks and local preferences |
| `dist/ipa.js`, `dist/assets/ipa/` | IPA chart metadata and audio assets |
| `dist/data/concepts.json` | Bundled vocabulary prompts and definitions |
| `tests/*.test.mjs` | Construction, phonotactics, inflection, editor metadata and interchange tests |
| `.github/workflows/pages.yml` | Tests and GitHub Pages publication from `dist/` |

## Verify

Node.js 20 or later:

```sh
npm test
```

Tests cover deterministic generation, phoneme boundaries, contextual spelling and inverse ambiguity, phonotactic validation, bounded syllabification, morphology conditions, stems, exceptions, snapshot metadata, clause ordering and JSON/CSV interchange. Browser persistence and audio require browser checks as well.

Third-party vocabulary and sound recordings retain their own licenses and attribution. See `THIRD_PARTY_VOCABULARY.md` and `THIRD_PARTY_IPA.md`.

## Included foundation

- 115 selectable IPA segments and 114 local reference recordings. The additional lateral flap /ɺ/ has no audio; all main-chart consonants and vowels do.
- 5,000 English starter prompts with definitions, search, part-of-speech filtering, translation tracking and batch word creation. This is a frequency-selected content-word bank rather than an authoritative basic-vocabulary list.
- Editable family trees, independent descendant snapshots, orthography mappings, weighted syllable patterns and sounds, custom classes, structured constraints and bounded generation with concept assignment.
- Phonemic word formation, contextual spelling, declensions and conjugations, named stems, exceptions, saved forms and executable clause ordering.
- Live form previews retain pronunciation and show rule traces and phonotactic diagnostics. Whole-word speech synthesis is not included.
- A static `dist/` folder: no application server, hosted database, authentication service, dictionary API, or external font request. Initial page/assets are served by the chosen static host; there is no offline-install service worker.

To use another static host, publish the contents of `dist/`. Relative asset paths also work beneath a subdirectory. Source edits are immediately reflected; no bundler or build step is needed.
