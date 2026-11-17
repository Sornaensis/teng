# TENG starter vocabulary

`dist/data/concepts.json` contains exactly **5,000 distinct English headwords**,
each with a real dictionary definition, a part of speech, a semantic category,
and a stable word-based ID. It is bundled with the application. Searching or
using these concepts makes no dictionary API requests.

## Attribution and licensing

Definitions and semantic classifications are derived from **Princeton WordNet
3.1**, Copyright 2011 Princeton University. The original WordNet license and
disclaimer are reproduced in `dist/data/licenses/WordNet-3.1.txt`.

- Project: https://wordnet.princeton.edu/
- Original database: https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz
- License: https://wordnet.princeton.edu/license-and-commercial-use
- Citation: Christiane Fellbaum, editor (1998), *WordNet: An Electronic Lexical
  Database*. Cambridge, MA: MIT Press.

The common-word selection/order is derived from **wordfreq**, Copyright 2022
**Robyn Speer**, using its English large frequency dataset. Its data is licensed
under Creative Commons Attribution-ShareAlike 4.0 International. TENG's
derived selection and the combined `concepts.json` dataset are distributed under
**CC BY-SA 4.0**, with the original WordNet notices retained. This applies to the
bundled vocabulary data; it does not assign a license to the app's code or to
users' independently authored languages.

- Project: https://github.com/rspeer/wordfreq
- Pinned source commit: `912caf64b657478d1dff1138efdc078947d54bb1`
- Source file: `wordfreq/data/large_en.msgpack.gz`
- License: https://creativecommons.org/licenses/by-sa/4.0/
- Complete data attributions: `dist/data/licenses/wordfreq-NOTICE.md`
- License text: `dist/data/licenses/CC-BY-SA-4.0.txt`

Wordfreq's source credits include Google Books Ngrams, the Leeds Internet
Corpus, Wikipedia, ParaCrawl, OpenSubtitles, and SUBTLEX by Marc Brysbaert et al.
SUBTLEX is freely available data. The upstream notice is included unchanged.
The upstream code license notice is also included for provenance, although no
wordfreq runtime code is distributed or required by this website.

## Selection and transformations

1. Read the pinned wordfreq English data in decreasing frequency-bin order.
2. Keep alphabetic, lowercase WordNet headwords with at least two letters.
   Match the original WordNet data's capitalization to exclude proper names.
3. For each headword, select its highest WordNet tagged-count sense. Break ties
   with WordNet sense order, then the part-of-speech label for determinism.
4. Exclude short forms of three letters or fewer with no attested tagged sense.
   This avoids many initials and misleading homographs, such as `he` as a Hebrew
   letter, `are` as a land measurement, and `may` as a name for hawthorn. Also
   exclude twelve unit abbreviations and prefix fragments listed in the script.
5. Retain the first 5,000 qualifying, unique headwords. Keep one selected sense
   per headword; do not invent meanings for words absent from WordNet.
6. Remove quotation-marked example sentences from glosses. Definitions themselves
   are not paraphrased. Map WordNet's lexicographer groups to 32 readable category
   names and record the originating synset in `synsetId`.

This is a **starter concept bank**, not a certified list of the 5,000 simplest
words, a Swadesh list, or a complete dictionary. Frequency describes English
corpora and does not establish universality across languages or cultures.
WordNet primarily covers nouns, verbs, adjectives, and adverbs; many pronouns,
articles, and other function words are absent. A word's selected sense may be
different from the one a language creator wants. Definitions reflect the 2011
database and can be dated or technical. Users should edit a lexicon entry's
definition to match their intended sense rather than assume a one-to-one
translation between English and their language.

## Rebuilding the bundled data

The website requires no build step for this file. The optional developer script
`scripts/vocabulary-build.py` reconstructs it from local source files. It needs
Python 3 and `msgpack` only during data generation.

Prepare a source directory containing:

- `wordnet/dict/`: the extracted WordNet 3.1 database directory;
- `large_en.msgpack.gz`: the pinned wordfreq English data file;
- `wordfreq-NOTICE.md` and `wordfreq-LICENSE.txt`: upstream `NOTICE.md` and
  `LICENSE.txt` at the pinned commit;
- `CC-BY-SA-4.0.txt`: the Creative Commons license text.

Run `python3 scripts/vocabulary-build.py /absolute/path/to/source-directory`.
The script checks the exact count, unique IDs, unique headwords, nonempty
definitions, and valid parts of speech, then prints dataset statistics.

Source SHA-256 checksums:

| Source | SHA-256 |
| --- | --- |
| `wn3.1.dict.tar.gz` | `3f7d8be8ef6ecc7167d39b10d66954ec734280b5bdcd57f7d9eafe429d11c22a` |
| `large_en.msgpack.gz` | `dffae8066b78dce0a6667cf5f58e567054f902674667090a7ac8a8a44628b05c` |

Validated distribution: 5,000 entries, 2,662 nouns, 689 verbs, 1,344 adjectives,
305 adverbs, and 32 categories. The JSON file is 1,030,805 bytes.
