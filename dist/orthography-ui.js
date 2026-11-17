import { parseIPA, renderPhonemes, analyzeSpelling, compileOrthography } from "./phonology.js";

export function createOrthographyUI(ctx) {
  const { language, PHONEMES, ui, esc, icon, button, btnIcon, panelHeader,
    modal, modalActions, closeModal, commit, render, toast, selectedSounds, uid } = ctx;
  let test = null;
  const signature = () => JSON.stringify([language().id, language().phonemeIds,
    language().soundClasses, language().orthography, language().orthographyRules]);
  const update = (fn) => {
    test = null;
    commit((workspace) => fn(workspace.languages.find((l) => l.id === ui.langId)));
  };
  const environment = (r) => `${r.before || "…"} _ ${r.after || "…"}`;
  function pendingSpellings() {
    const l = language(), spell = compileOrthography(l, PHONEMES);
    return l.lexicon.filter((entry) => entry.entryType === "lexeme" && !entry.spellingOverride && entry.segments.length)
      .map((entry) => ({entry, word:spell(entry.segments)})).filter(({entry,word}) => entry.word !== word);
  }

  function mappings() {
    return `<section class="panel">${panelHeader("Default spellings", "Context rules take precedence.", button("Use IPA", "ipa-spelling", "tiny", 'type="button"'))}
      <form id="orthography-mappings-form"><div class="mapping-grid">${selectedSounds().map((p) =>
        `<label class="mapping-field" title="${esc(p.name)}"><span class="ipa">/${esc(p.symbol)}/</span><input name="mapping-${esc(p.id)}" value="${esc(language().orthography[p.id] ?? p.symbol)}" aria-label="Spelling for ${esc(p.symbol)}" maxlength="100" required></label>`).join("")}</div>
        <div class="panel-footer"><span class="compact-note">One spelling for each phoneme.</span>${button("Save spellings", "submit-spellings", "primary", 'type="submit"')}</div>
      </form></section>`;
  }

  function rules() {
    const list = language().orthographyRules;
    return `<section class="panel">${panelHeader("Context rules", "First matching rule wins at each position.", button(icon("plus") + " Rule", "ortho-new-rule", "primary", 'type="button"'))}
      <div class="orthography-rule-list">${list.map((rule, index) =>
        `<article class="orthography-rule"><span class="rule-number">${index + 1}</span><div class="rule-content"><h3>${esc(rule.name)}</h3><div class="rule-expression"><span class="ipa">/${esc(rule.from)}/</span><span>→</span><strong>${esc(rule.to)}</strong></div><code class="ipa">${esc(environment(rule))}</code></div><div class="rule-row-actions"><div class="reorder-buttons">${button("↑", "ortho-move-rule", "tiny", `type="button" data-id="${esc(rule.id)}" data-direction="-1" aria-label="Move ${esc(rule.name)} up" ${index === 0 ? "disabled" : ""}`)}${button("↓", "ortho-move-rule", "tiny", `type="button" data-id="${esc(rule.id)}" data-direction="1" aria-label="Move ${esc(rule.name)} down" ${index === list.length - 1 ? "disabled" : ""}`)}</div>${btnIcon("edit", "ortho-edit-rule", "Edit " + rule.name, `data-id="${esc(rule.id)}" type="button"`)}</div></article>`).join("") || '<div class="empty-state compact-empty"><h3>No context rules</h3><p>Add a spelling that depends on surrounding phonemes or a word boundary.</p></div>'}</div>
      <details class="rule-help"><summary>How contexts work</summary><p>Use whole IPA segments, <code>C</code>, <code>V</code>, or a custom sound class. Separate context segments with spaces. <code>#</code> is a word boundary; a blank context matches anywhere.</p><p>For example, map <code>k</code> to <code>c</code> with <strong>Following</strong> set to <code>V</code>. The rule changes spelling before a vowel while pronunciation stays /k/.</p><p>Context is read from the complete phoneme sequence. Written output is never fed back into these rules.</p></details>
    </section>`;
  }

  function resultMarkup() {
    if (!test || test.signature !== signature()) return '<p class="compact-note">Try an IPA form or check which pronunciations a spelling can represent.</p>';
    if (test.error) return `<div class="test-result is-error" role="alert">${esc(test.error)}</div>`;
    if (test.direction === "write") return `<div class="test-result"><div class="word-form">${esc(test.result.word)}</div><div class="word-ipa">/${esc(test.result.ipa)}/</div><div class="segment-strip">${test.result.segments.map((id) => `<span class="ipa">${esc(PHONEMES.find((p) => p.id === id)?.symbol)}</span>`).join("")}</div></div>`;
    const result = test.result;
    return `<div class="test-result ${result.ambiguous || result.truncated ? "is-warning" : ""}"><strong>${result.truncated ? "Search limit reached" : result.ambiguous ? "Ambiguous spelling" : result.candidates.length ? "One pronunciation" : "No matching pronunciation"}</strong>${result.candidates.length ? `<ul class="pronunciation-options">${result.candidates.map((form) => `<li class="ipa">/${esc(form.ipa)}/</li>`).join("")}</ul>` : ""}<p class="compact-note">${result.truncated ? "More readings may exist. Supply explicit IPA when saving the word." : result.ambiguous ? "Choose a pronunciation explicitly when adding this word." : result.candidates.length ? "Matches the current spelling rules. Phonotactic validity is checked separately." : "Check the spelling rules or supply explicit IPA."}</p></div>`;
  }

  function tester() {
    const current = test?.languageId === language().id ? test : null;
    return `<section class="panel spelling-tester">${panelHeader("Try a form")}
      <form id="orthography-test-form" class="panel-inner"><label>Direction<select name="direction"><option value="write" ${current?.direction !== "read" ? "selected" : ""}>Phonemes → spelling</option><option value="read" ${current?.direction === "read" ? "selected" : ""}>Spelling → phonemes</option></select></label>
      <label>Form<input name="source" class="ipa" value="${esc(current?.source || "")}" placeholder="e.g. s e . l a" maxlength="2000" spellcheck="false" required></label>
      ${button("Check form " + icon("arrow"), "submit-ortho-test", "primary", 'type="submit"')}
      <div id="orthography-test-output" aria-live="polite">${resultMarkup()}</div></form>
      <details class="rule-help"><summary>Spelling and pronunciation</summary><p>Morphology transforms phonemes first. These rules then spell the completed form. Different phonemes may share a spelling, so reading a spelling can have several answers.</p><p>New forms use current rules. Review dictionary spellings to update existing lexemes. Saved forms and custom spellings are snapshots.</p></details>
    </section>`;
  }

  function renderPage() {
    const tab = ui.orthographyTab || "mappings";
    const changes = pendingSpellings();
    return `<div class="page-tabs" aria-label="Orthography sections">${[["mappings", "Default spellings"], ["rules", "Context rules"]].map(([id, title]) => `<button type="button" class="tab ${tab === id ? "active" : ""}" data-action="ortho-tab" data-tab="${id}" aria-pressed="${tab === id}">${title}${id === "rules" && language().orthographyRules.length ? `<span class="tab-count">${language().orthographyRules.length}</span>` : ""}</button>`).join("")}</div>
      ${changes.length ? `<div class="spelling-update-bar"><span>${changes.length} ${changes.length === 1 ? "lexeme has" : "lexemes have"} a different spelling under these rules.</span>${button("Review dictionary spellings", "ortho-review-lexicon", "tiny", 'type="button"')}</div>` : ""}
      <div class="rules-layout orthography-layout"><div>${tab === "rules" ? rules() : mappings()}</div>${tester()}</div>`;
  }

  function reviewSpellings() {
    const languageId=language().id, changes=pendingSpellings().slice(0,200);
    if(!changes.length) {toast("Dictionary spellings already match."); return;}
    modal("Update dictionary spellings", "Review lexemes using the current spelling rules.",
      `<div class="table-scroll"><table class="data-table spelling-review-table"><thead><tr><th></th><th>Saved</th><th>New spelling</th><th>Meaning</th></tr></thead><tbody>${changes.map(({entry,word})=>`<tr><td><input type="checkbox" name="entry" value="${esc(entry.id)}" aria-label="Update ${esc(entry.word)}" checked></td><td>${esc(entry.word)}</td><td><strong>${esc(word)}</strong></td><td>${esc(entry.gloss)}</td></tr>`).join("")}</tbody></table></div><p class="field-help">Updates selected lexemes. Saved inflected forms and custom spellings keep their snapshots.${changes.length===200 ? " Showing the first 200 changes; review again for the next batch." : ""}</p>${modalActions("Update selected spellings")}`,
      (fd)=>{if(language().id!==languageId) throw Error("The active language changed."); const selected=new Set(fd.getAll("entry")); const next=new Map(changes.filter(({entry})=>selected.has(entry.id)).map(({entry,word})=>[entry.id,word])); if(!next.size) throw Error("Select at least one lexeme."); update((l)=>{for(const entry of l.lexicon) if(next.has(entry.id)) entry.word=next.get(entry.id);}); closeModal();toast(`${next.size} spellings updated.`);});
  }

  function editRule(id) {
    const existing = language().orthographyRules.find((r) => r.id === id);
    const rule = existing || {id: uid("spelling"), name: "", from: "", to: "", before: "", after: ""};
    const languageId = language().id;
    modal(existing ? "Edit context rule" : "New context rule", "A spelling chosen from its phoneme context.",
      `<div class="form-grid"><label class="full">Name<input name="name" value="${esc(rule.name)}" maxlength="160" placeholder="e.g. c before vowels" required autofocus></label><label>Phonemes (IPA)<input name="from" class="ipa" value="${esc(rule.from)}" placeholder="k" maxlength="200" spellcheck="false" required></label><label>Write as<input name="to" value="${esc(rule.to)}" placeholder="c" maxlength="100" required></label><label>Preceding context<input name="before" class="ipa" value="${esc(rule.before)}" placeholder="Any" maxlength="200" spellcheck="false"></label><label>Following context<input name="after" class="ipa" value="${esc(rule.after)}" placeholder="V" maxlength="200" spellcheck="false"></label></div><p class="field-help">Contexts: IPA, C/V, custom classes, or # for a word boundary. Separate segments with spaces.</p>${modalActions("Save rule", existing ? button("Delete rule", "ortho-delete-rule", "danger", `type="button" data-id="${esc(rule.id)}" data-language="${esc(languageId)}"`) : "")}`,
      (fd) => {
        if (language().id !== languageId) throw Error("The active language changed. Reopen this editor.");
        const next = {id:rule.id, ...Object.fromEntries(["name", "from", "to", "before", "after"].map((key) => [key, String(fd.get(key)).trim()]))};
        update((l) => {const at=l.orthographyRules.findIndex((r)=>r.id===rule.id); if(at<0) l.orthographyRules.push(next); else l.orthographyRules[at]=next;});
        closeModal();
        toast("Spelling rule saved.");
      });
  }

  function handleAction(element) {
    const {action, id} = element.dataset;
    if (action === "ortho-tab") { ui.orthographyTab = element.dataset.tab === "rules" ? "rules" : "mappings"; render(); return true; }
    if (action === "ortho-new-rule" || action === "ortho-edit-rule") { editRule(id); return true; }
    if (action === "ortho-review-lexicon") { reviewSpellings(); return true; }
    if (action === "ortho-delete-rule") {
      if (element.dataset.language !== language().id) throw Error("The active language changed.");
      update((l) => {l.orthographyRules=l.orthographyRules.filter((r)=>r.id!==id);}); closeModal(); return true;
    }
    if (action === "ortho-move-rule") {
      update((l) => {const at=l.orthographyRules.findIndex((r)=>r.id===id), next=at+Number(element.dataset.direction); if(at<0 || next<0 || next>=l.orthographyRules.length) return; [l.orthographyRules[at],l.orthographyRules[next]]=[l.orthographyRules[next],l.orthographyRules[at]];}); return true;
    }
    return false;
  }

  function handleSubmit(form, fd) {
    if (form.id === "orthography-mappings-form") {
      const mappings = Object.fromEntries(selectedSounds().map((p)=>[p.id,String(fd.get(`mapping-${p.id}`)).trim()]));
      if(Object.values(mappings).some((value)=>!value)) throw Error("Each phoneme needs a default spelling.");
      update((l)=>{l.orthography={...l.orthography,...mappings};}); toast("Spellings saved."); return true;
    }
    if (form.id === "orthography-test-form") {
      const source=String(fd.get("source")).trim(), direction=fd.get("direction");
      test={source,direction,languageId:language().id,signature:signature()};
      try {
        if(direction==="write") {const parsed=parseIPA(source,language(),PHONEMES); test.result={...renderPhonemes(parsed.segments,language(),PHONEMES,{syllables:parsed.syllables}),ipa:parsed.ipa};}
        else test.result=analyzeSpelling(source,language(),PHONEMES);
      } catch(error) {test.error=error.message;}
      render(); return true;
    }
    return false;
  }
  return {render:renderPage,handleAction,handleSubmit};
}
