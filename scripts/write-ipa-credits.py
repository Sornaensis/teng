from pathlib import Path
import json
base=Path(__file__).resolve().parent.parent
catalog=json.loads((base/'scripts/ipa-catalog.json').read_text())
metadata=json.loads((base/'scripts/ipa-metadata.json').read_text())
links={'CC BY-SA 3.0':'https://creativecommons.org/licenses/by-sa/3.0/','CC BY-SA 4.0':'https://creativecommons.org/licenses/by-sa/4.0/','CC0 1.0':'https://creativecommons.org/publicdomain/zero/1.0/','Public domain':'https://commons.wikimedia.org/wiki/File:Voiced_palato-alveolar_affricate.ogg'}
body='''# IPA audio attribution

This directory contains human recordings, not synthesized speech. Consonant recordings often include an adjacent vowel or a vowel–consonant–vowel sequence so their articulation is audible. They are reference examples of individual sounds, not recordings of generated words. Realizations vary between speakers.

114 of the 115 selectable segments have local audio, including every pulmonic consonant and vowel in this app. The alveolar lateral flap **ɺ** currently has no bundled recording; its preview is unavailable. It can still be selected and used in word construction.

The audio originated on Wikimedia Commons. All except /ʌ/ were obtained as MP3 conversions from [Joshua Stephenson's PhoneticFlashCards archive](https://github.com/joshstephenson/PhoneticFlashCards). /ʌ/ was obtained as Ogg from [OpenLyceum/WaveComposer](https://github.com/OpenLyceum/WaveComposer/blob/main/src/assets/audio/vowel-uh.ogg) and converted to MP3. Local filenames have been changed to stable Unicode-based identifiers. No acoustic editing was done by this app. Per-file original author and license have been checked against the source file pages; the source archive's blanket license is not substituted for each recording's actual license.

Keep these credits and the applicable license when redistributing the audio. CC BY-SA audio retains its listed license; those licenses apply to the corresponding audio files, not automatically to the site's code. Full license text is included under `licenses/`; official license links are also provided below.

| Segment | Local file | Author | License | Original source |
| --- | --- | --- | --- | --- |
'''
for r in catalog:
 m=metadata[r['id']]
 if not (base/'dist/assets/ipa'/(r['id']+'.mp3')).exists():continue
 body+=f"| {r['symbol']} | `{r['id']}.mp3` | {m['author']} | [{m['license']}]({links[m['license']]}) | [{m['sourceFile'].replace('_',' ')}]({m['url']}) |\n"
body+='''
## IPA chart data

The phoneme labels and groupings follow the [International Phonetic Association chart](https://www.internationalphoneticassociation.org/content/ipa-chart). The chart itself is rendered independently by this application; no IPA chart image or typeface is bundled. The catalog includes 59 pulmonic consonant symbols, 28 vowel symbols, and 28 additional segments. It is a useful starter inventory, not an exhaustive catalog of every diacritic, tone, coarticulation or possible sound.

The stable IDs represent Unicode sequences, e.g. `ipa-70` is /p/ and `ipa-74-361-283` is /t͡ʃ/. The affricates and ejectives are treated as single selectable segments. Glottal /ʔ/ is displayed in the voiceless slot for chart placement; this should not be interpreted as a full theory of glottal phonation. /ʜ/ and /ʢ/ are labeled as on the IPA chart, while the reference recordings realize them with epiglottal trilling. /ɧ/ is the Swedish sj-sound reference. Vowel labels express IPA categories and do not guarantee that every speaker realization lands exactly at a cardinal target.

`ipa.js` exposes local audio paths only. The app makes no runtime requests to Commons, GitHub, a pronunciation API, or text-to-speech service. Credits and license links are ordinary user-opened references.
'''
(base/'dist/assets/ipa/ATTRIBUTION.md').write_text(body)
(base/'THIRD_PARTY_IPA.md').write_text(body.replace('under `licenses/`','under `dist/assets/ipa/licenses/`'))
# Small machine-readable attribution manifest for downstream packaging and checks.
(base/'dist/assets/ipa/attribution.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print('Credits written for',sum((base/'dist/assets/ipa'/(r['id']+'.mp3')).exists() for r in catalog),'recordings')
