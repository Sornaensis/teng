#!/usr/bin/env python3
"""Rebuild TENG's 5,000 English concept prompts from licensed source data.

Usage: python3 scripts/vocabulary-build.py /absolute/path/to/vocab-sources
Requires msgpack only for this developer-time import; the website has no Python
or package dependency. Source downloads and licenses are documented separately.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

import msgpack

ROOT = Path(__file__).resolve().parents[1]
SOURCES = Path(sys.argv[1])
WORDNET = SOURCES / 'wordnet' / 'dict'
OUT = ROOT / 'dist' / 'data'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'licenses').mkdir(exist_ok=True)

POS = {'1': 'noun', '2': 'verb', '3': 'adjective', '4': 'adverb', '5': 'adjective'}
FILEPOS = {'n': 'noun', 'v': 'verb', 'a': 'adj', 's': 'adj', 'r': 'adv'}
SENSEPOS = {'1': 'n', '2': 'v', '3': 'a', '4': 'r', '5': 'a'}
EXCLUDED_FORMS = {'cc', 'cm', 'mm', 'km', 'mg', 'kg', 'gm', 'hr', 'mph', 'kph', 'sr', 'non'}
CATEGORIES = {
    0: 'Qualities', 1: 'Qualities', 2: 'Manner', 3: 'General', 4: 'Actions',
    5: 'Animals', 6: 'Objects & tools', 7: 'Qualities', 8: 'Body',
    9: 'Thought & knowledge', 10: 'Communication', 11: 'Events',
    12: 'Feelings', 13: 'Food & drink', 14: 'Groups & society', 15: 'Place',
    16: 'Purpose', 17: 'Nature', 18: 'People', 19: 'Nature', 20: 'Plants',
    21: 'Possession', 22: 'Processes', 23: 'Quantity', 24: 'Relationships',
    25: 'Shape', 26: 'States', 27: 'Materials', 28: 'Time', 29: 'Body',
    30: 'Change', 31: 'Thought & knowledge', 32: 'Communication',
    33: 'Competition', 34: 'Food & drink', 35: 'Actions', 36: 'Making',
    37: 'Feelings', 38: 'Movement', 39: 'Perception', 40: 'Possession',
    41: 'Groups & society', 42: 'States', 43: 'Weather', 44: 'Qualities',
}

# WordNet preserves capitalization in the data files, unlike its index. Match a
# lowercase member exactly to exclude proper names and most abbreviations.
synsets = {}
for ext in ('noun', 'verb', 'adj', 'adv'):
    for line in (WORDNET / ('data.' + ext)).read_text().splitlines():
        if not line or line.startswith(' '):
            continue
        data, gloss = line.split('|', 1)
        parts = data.split()
        count = int(parts[3], 16)
        words = {re.sub(r'\([a-z]+\)$', '', parts[4 + 2 * i]) for i in range(count)}
        # Examples are separated by semicolon + quotation mark. Keep all
        # definition clauses preceding the first example, without paraphrasing.
        definition = re.split(r';\s*"', gloss.strip(), maxsplit=1)[0].strip()
        key = ('a' if parts[2] == 's' else parts[2], parts[0])
        synsets[key] = {'words': words, 'definition': definition,
                        'category': CATEGORIES[int(parts[1])]}

senses = defaultdict(list)
for line in (WORDNET / 'index.sense').read_text().splitlines():
    key, offset, sense_number, tag_count = line.split()
    word, meta = key.split('%')
    if not re.fullmatch(r'[a-z]{2,}', word):
        continue
    pos = meta[0]
    synset = synsets[(SENSEPOS[pos], offset)]
    if word not in synset['words']:
        continue
    senses[word].append({
        'word': word, 'definition': synset['definition'], 'pos': POS[pos],
        'category': synset['category'], 'tagCount': int(tag_count),
        'senseNumber': int(sense_number), 'synset': SENSEPOS[pos] + ':' + offset,
    })

# wordfreq cB bins are in descending frequency order. Ties retain their source
# order. Only exact WordNet lemmas qualify (no guesses at unknown definitions).
frequency_bins = msgpack.unpackb(gzip.decompress((SOURCES / 'large_en.msgpack.gz').read_bytes()), raw=False)
assert frequency_bins[0] == {'format': 'cB', 'version': 1}
concepts = []
seen = set()
for bucket in frequency_bins[1:]:
    for word in bucket:
        if word in seen or word not in senses or word in EXCLUDED_FORMS:
            continue
        candidates = senses[word]
        # Corpus-attested sense first; use sense order, then POS, to resolve ties.
        chosen = min(candidates, key=lambda s: (-s['tagCount'], s['senseNumber'], s['pos']))
        # Frequent English function forms can collide with rare lexical entries
        # (are = land measure, he = Hebrew letter, may = hawthorn). Short forms
        # with no attested WordNet sense are also mostly initials/unit symbols.
        if len(word) <= 3 and chosen['tagCount'] == 0:
            continue
        concepts.append({
            'id': 'concept-' + word, 'word': word, 'definition': chosen['definition'],
            'pos': chosen['pos'], 'category': chosen['category'],
            'source': 'Princeton WordNet 3.1', 'synsetId': chosen['synset'],
        })
        seen.add(word)
        if len(concepts) == 5000:
            break
    if len(concepts) == 5000:
        break

assert len(concepts) == 5000
assert len({x['id'] for x in concepts}) == 5000
assert len({x['word'] for x in concepts}) == 5000
assert all(len(x['definition']) >= 3 and x['pos'] in POS.values() for x in concepts)
(OUT / 'concepts.json').write_text(json.dumps(concepts, ensure_ascii=False, separators=(',', ':')) + '\n')

# The WordNet license is included verbatim in each distributed database file.
header = []
for line in (WORDNET / 'data.noun').read_text().splitlines():
    if not line.startswith(' '):
        break
    header.append(re.sub(r'^\s*\d+\s?', '', line).rstrip())
(OUT / 'licenses' / 'WordNet-3.1.txt').write_text('\n'.join(header) + '\n')
for filename in ('wordfreq-NOTICE.md', 'wordfreq-LICENSE.txt', 'CC-BY-SA-4.0.txt'):
    shutil.copyfile(SOURCES / filename, OUT / 'licenses' / filename)

print(json.dumps({
    'count': len(concepts), 'bytes': (OUT / 'concepts.json').stat().st_size,
    'sha256': hashlib.sha256((OUT / 'concepts.json').read_bytes()).hexdigest(),
    'partsOfSpeech': dict(Counter(x['pos'] for x in concepts)),
    'categories': len({x['category'] for x in concepts}),
    'sample': concepts[:12],
}, indent=2))
