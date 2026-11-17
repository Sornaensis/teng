import json,pathlib
base=pathlib.Path(__file__).resolve().parent.parent
places=['Bilabial','Labiodental','Dental','Alveolar','Postalveolar','Retroflex','Palatal','Velar','Uvular','Pharyngeal','Glottal']
manners=['Plosive','Nasal','Trill','Tap or flap','Fricative','Lateral fricative','Approximant','Lateral approximant']
rows=[]
def add(symbol,place,manner,voiced,source,type='consonant'):
 rows.append(dict(id='ipa-'+ '-'.join(format(ord(c),'x') for c in symbol),symbol=symbol,type=type,name=('Voiced ' if voiced else 'Voiceless ')+place.lower()+' '+manner.lower(),place=place,manner=manner,voiced=voiced,sourceFile=source))
cons=[
('p','Bilabial','Plosive',False,'Voiceless_bilabial_plosive.ogg'),('b','Bilabial','Plosive',True,'Voiced_bilabial_plosive.ogg'),
('t','Alveolar','Plosive',False,'Voiceless_alveolar_plosive.ogg'),('d','Alveolar','Plosive',True,'Voiced_alveolar_plosive.ogg'),
('ʈ','Retroflex','Plosive',False,'Voiceless_retroflex_stop.oga'),('ɖ','Retroflex','Plosive',True,'Voiced_retroflex_stop.oga'),
('c','Palatal','Plosive',False,'Voiceless_palatal_plosive.ogg'),('ɟ','Palatal','Plosive',True,'Voiced_palatal_plosive.ogg'),
('k','Velar','Plosive',False,'Voiceless_velar_plosive.ogg'),('ɡ','Velar','Plosive',True,'Voiced_velar_plosive.ogg'),
('q','Uvular','Plosive',False,'Voiceless_uvular_plosive.ogg'),('ɢ','Uvular','Plosive',True,'Voiced_uvular_stop.oga'),
('ʔ','Glottal','Plosive',False,'Glottal_stop.ogg'),
('m','Bilabial','Nasal',True,'Bilabial_nasal.ogg'),('ɱ','Labiodental','Nasal',True,'Labiodental_nasal.ogg'),('n','Alveolar','Nasal',True,'Alveolar_nasal.ogg'),('ɳ','Retroflex','Nasal',True,'Retroflex_nasal.ogg'),('ɲ','Palatal','Nasal',True,'Palatal_nasal.ogg'),('ŋ','Velar','Nasal',True,'Velar_nasal.ogg'),('ɴ','Uvular','Nasal',True,'Uvular_nasal.ogg'),
('ʙ','Bilabial','Trill',True,'Bilabial_trill.ogg'),('r','Alveolar','Trill',True,'Alveolar_trill.ogg'),('ʀ','Uvular','Trill',True,'Uvular_trill.ogg'),
('ⱱ','Labiodental','Tap or flap',True,'Labiodental_flap.ogg'),('ɾ','Alveolar','Tap or flap',True,'Alveolar_tap.ogg'),('ɽ','Retroflex','Tap or flap',True,'Retroflex_flap.ogg'),
('ɸ','Bilabial','Fricative',False,'Voiceless_bilabial_fricative.ogg'),('β','Bilabial','Fricative',True,'Voiced_bilabial_fricative.ogg'),('f','Labiodental','Fricative',False,'Voiceless_labio-dental_fricative.ogg'),('v','Labiodental','Fricative',True,'Voiced_labio-dental_fricative.ogg'),('θ','Dental','Fricative',False,'Voiceless_dental_fricative.ogg'),('ð','Dental','Fricative',True,'Voiced_dental_fricative.ogg'),('s','Alveolar','Fricative',False,'Voiceless_alveolar_sibilant.ogg'),('z','Alveolar','Fricative',True,'Voiced_alveolar_sibilant.ogg'),('ʃ','Postalveolar','Fricative',False,'Voiceless_palato-alveolar_sibilant.ogg'),('ʒ','Postalveolar','Fricative',True,'Voiced_palato-alveolar_sibilant.ogg'),('ʂ','Retroflex','Fricative',False,'Voiceless_retroflex_sibilant.ogg'),('ʐ','Retroflex','Fricative',True,'Voiced_retroflex_sibilant.ogg'),('ç','Palatal','Fricative',False,'Voiceless_palatal_fricative.ogg'),('ʝ','Palatal','Fricative',True,'Voiced_palatal_fricative.ogg'),('x','Velar','Fricative',False,'Voiceless_velar_fricative.ogg'),('ɣ','Velar','Fricative',True,'Voiced_velar_fricative.ogg'),('χ','Uvular','Fricative',False,'Voiceless_uvular_fricative.ogg'),('ʁ','Uvular','Fricative',True,'Voiced_uvular_fricative.ogg'),('ħ','Pharyngeal','Fricative',False,'Voiceless_pharyngeal_fricative.ogg'),('ʕ','Pharyngeal','Fricative',True,'Voiced_pharyngeal_fricative.ogg'),('h','Glottal','Fricative',False,'Voiceless_glottal_fricative.ogg'),('ɦ','Glottal','Fricative',True,'Voiced_glottal_fricative.ogg'),
('ɬ','Alveolar','Lateral fricative',False,'Voiceless_alveolar_lateral_fricative.ogg'),('ɮ','Alveolar','Lateral fricative',True,'Voiced_alveolar_lateral_fricative.ogg'),
('ʋ','Labiodental','Approximant',True,'Labiodental_approximant.ogg'),('ɹ','Alveolar','Approximant',True,'Alveolar_approximant.ogg'),('ɻ','Retroflex','Approximant',True,'Retroflex_Approximant2.oga'),('j','Palatal','Approximant',True,'Voiced_palatal_approximant.ogg'),('ɰ','Velar','Approximant',True,'Voiced_velar_approximant.ogg'),
('l','Alveolar','Lateral approximant',True,'Voiced_alveolar_lateral_approximant.ogg'),('ɭ','Retroflex','Lateral approximant',True,'Retroflex_lateral_approximant.ogg'),('ʎ','Palatal','Lateral approximant',True,'Palatal_lateral_approximant.ogg'),('ʟ','Velar','Lateral approximant',True,'Velar_lateral_approximant.ogg')]
for x in cons:add(*x)
vowels=[
('i','Close','Front',False),('y','Close','Front',True),('ɨ','Close','Central',False),('ʉ','Close','Central',True),('ɯ','Close','Back',False),('u','Close','Back',True),
('ɪ','Near-close','Near-front',False),('ʏ','Near-close','Near-front',True),('ʊ','Near-close','Near-back',True),
('e','Close-mid','Front',False),('ø','Close-mid','Front',True),('ɘ','Close-mid','Central',False),('ɵ','Close-mid','Central',True),('ɤ','Close-mid','Back',False),('o','Close-mid','Back',True),
('ə','Mid','Central',False),('ɛ','Open-mid','Front',False),('œ','Open-mid','Front',True),('ɜ','Open-mid','Central',False),('ɞ','Open-mid','Central',True),('ʌ','Open-mid','Back',False),('ɔ','Open-mid','Back',True),
('æ','Near-open','Front',False),('ɐ','Near-open','Central',False),('a','Open','Front',False),('ɶ','Open','Front',True),('ɑ','Open','Back',False),('ɒ','Open','Back',True)]
for sym,height,backness,rounded in vowels:
 name=height+' '+backness.lower()+' '+('rounded' if rounded else 'unrounded')+' vowel'
 source=name.replace(' ','_')+'.ogg'
 if sym=='ə':source='Mid-central_vowel.ogg'
 if sym=='o':source='Close_mid_back_rounded_vowel.ogg'
 rows.append(dict(id='ipa-'+format(ord(sym),'x'),symbol=sym,type='vowel',name=name,place=backness,manner='Vowel',voiced=True,height=height,backness=backness,rounded=rounded,sourceFile=source))
other=[
('w','Labial-velar','Approximant',True,'Voiced_labio-velar_approximant.ogg'),('ʍ','Labial-velar','Fricative',False,'Voiceless_labio-velar_fricative.ogg'),('ɥ','Labial-palatal','Approximant',True,'LL-Q150_(fra)-WikiLucas00-IPA_ɥ.wav'),('ɕ','Alveolo-palatal','Fricative',False,'Voiceless_alveolo-palatal_sibilant.ogg'),('ʑ','Alveolo-palatal','Fricative',True,'Voiced_alveolo-palatal_sibilant.ogg'),('ɺ','Alveolar','Lateral flap',True,'Alveolar_lateral_flap.ogg'),('ɧ','Postalveolar-velar','Fricative',False,'Voiceless_dorso-palatal_velar_fricative.ogg'),('ʜ','Epiglottal','Fricative',False,'Voiceless_epiglottal_trill.ogg'),('ʢ','Epiglottal','Fricative',True,'Voiced_epiglottal_trill_2.ogg'),('ʡ','Epiglottal','Plosive',False,'Epiglottal_stop.ogg'),
('ʘ','Bilabial','Click',False,'Clic_bilabial_sourd.ogg'),('ǀ','Dental','Click',False,'Dental_click.ogg'),('ǃ','Postalveolar','Click',False,'Postalveolar_click.ogg'),('ǂ','Palatal','Click',False,'Palatoalveolar_click.ogg'),('ǁ','Alveolar','Lateral click',False,'Alveolar_lateral_click.ogg'),
('ɓ','Bilabial','Implosive',True,'Voiced_bilabial_implosive.ogg'),('ɗ','Alveolar','Implosive',True,'Voiced_alveolar_implosive.ogg'),('ʄ','Palatal','Implosive',True,'Voiced_palatal_implosive.ogg'),('ɠ','Velar','Implosive',True,'Voiced_velar_implosive.ogg'),('ʛ','Uvular','Implosive',True,'Voiced_uvular_implosive.ogg'),
('pʼ','Bilabial','Ejective',False,'Bilabial_ejective_plosive.ogg'),('tʼ','Alveolar','Ejective',False,'Alveolar_ejective_plosive.ogg'),('kʼ','Velar','Ejective',False,'Velar_ejective_plosive.ogg'),('qʼ','Uvular','Ejective',False,'Uvular_ejective_plosive.ogg'),
('t͡s','Alveolar','Affricate',False,'Voiceless_alveolar_sibilant_affricate.oga'),('d͡z','Alveolar','Affricate',True,'Voiced_alveolar_sibilant_affricate.oga'),('t͡ʃ','Postalveolar','Affricate',False,'Voiceless_palato-alveolar_affricate.ogg'),('d͡ʒ','Postalveolar','Affricate',True,'Voiced_palato-alveolar_affricate.ogg')]
for x in other:add(*x,type='other')
(base/'scripts/ipa-catalog.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
licensefile=base/'scripts/ipa-metadata.json'
metadata=json.loads(licensefile.read_text()) if licensefile.exists() else {}
for row in rows:
 source=row.pop('sourceFile')
 meta=metadata.get(row['id'],{})
 local='./assets/ipa/'+row['id']+'.mp3'
 row.update(audio=local if (base/'dist'/local).exists() else None,audioSource=meta.get('url','https://commons.wikimedia.org/wiki/File:'+source),audioLicense=meta.get('license',''),audioAuthor=meta.get('author',''),audioKind='recording')
head='// IPA categories follow the International Phonetic Association chart.\n// Audio is locally bundled; per-file credits are in assets/ipa/ATTRIBUTION.md.\n'
exports={'CONSONANT_PLACES':places,'CONSONANT_MANNERS':manners,'VOWEL_HEIGHTS':['Close','Near-close','Close-mid','Mid','Open-mid','Near-open','Open'],'VOWEL_BACKNESSES':['Front','Near-front','Central','Near-back','Back'],'PHONEMES':rows}
(base/'dist/ipa.js').write_text(head+'\n'.join('export const '+k+' = '+json.dumps(v,ensure_ascii=False,indent=2)+';' for k,v in exports.items())+'\n')
print('Catalog',len(rows),'consonants',len(cons),'vowels',len(vowels),'other',len(other))
