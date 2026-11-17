import {
  createParadigmTemplate,
  generateInflections,
  validateParadigms,
} from "./inflection.js";
import { PHONEMES } from "./ipa.js";

export function parseNameValues(source, separator = ",") {
  const entries = String(source || "")
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const at = line.indexOf("=");
      if (at < 1 || !line.slice(at + 1).trim())
        throw Error("Use name=value pairs, with a value for every name.");
      const name = line.slice(0, at).trim();
      if (
        !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) ||
        ["constructor", "prototype", "__proto__"].includes(name)
      )
        throw Error(
          "Names must start with a letter and contain only letters, digits, underscores, or hyphens.",
        );
      return [name, line.slice(at + 1).trim()];
    });
  if (new Set(entries.map(([name]) => name)).size !== entries.length)
    throw Error("Each name may appear only once.");
  return Object.fromEntries(entries);
}

export const featureSummary = (features = {}) =>
  Object.entries(features)
    .map(([name, value]) => `${name}=${value}`)
    .join(", ");

export function createInflectionUI(ctx) {
  const {
    language,
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
    uid,
    POS,
    editEntry,
    confirmAction,
  } = ctx;
  const $ = (s) => document.querySelector(s);
  const operations = {
    prefix: "Add prefix",
    suffix: "Add suffix",
    "replace-prefix": "Replace beginning",
    "replace-suffix": "Replace ending",
    "replace-all": "Replace every occurrence",
    "replace-whole": "Replace whole form",
    infix: "Infix after first phoneme",
    reduplication: "Reduplicate",
  };
  const conditions = {
    always: "Always",
    "vowel-final": "Ends in a vowel",
    "consonant-final": "Ends in a consonant",
    "starts-with": "Starts with",
    "ends-with": "Ends with",
    contains: "Contains",
    "not-starts-with": "Does not start with",
    "not-ends-with": "Does not end with",
  };
  const opts = (values, selected) =>
    Object.entries(values)
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  const badges = (features) =>
    `<span class="features">${Object.entries(features)
      .map(
        ([key, value]) =>
          `<span class="chip neutral">${esc(key)}: ${esc(value)}</span>`,
      )
      .join("")}</span>`;
  const getParadigm = (id) =>
    language().paradigms.find((p) => p.id === id);
  const selectedParadigm = () =>
    getParadigm(ui.paradigmId) ||
    language().paradigms.find(
      (p) => p.kind === (ui.inflectionKind || "declension"),
    );
  const updateLanguage = (fn) =>
    commit((w) => fn(w.languages.find((l) => l.id === ui.langId)));
  const wide = () => $("#modal").classList.add("dialog-wide");
  let slotDraft;

  function stepSummary(step) {
    const condition = step.condition === "always" ? "" :
      `${conditions[step.condition]}${step.test ? ` /${step.test}/` : ""}: `;
    const transform = step.kind.startsWith("replace-")
      ? `“${step.from}” → “${step.to}”`
      : `“${step.to}”`;
    return `${condition}${operations[step.kind]} ${transform}`;
  }

  function phonotacticMarkup(form) {
    const check = form?.phonotactics;
    if (!check || (check.ok && !check.ambiguous && !check.truncated)) return "";
    const title = check.ambiguous ? "Ambiguous syllables" : check.truncated ? "Syllable analysis incomplete" : "Outside phonotactics";
    return `<details class="form-diagnostics"><summary>${esc(title)}</summary><ul>${(check.reasons || []).map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul></details>`;
  }

  function resultMarkup(form) {
    if (!form) return '<span class="compact-note">Choose a lexeme</span>';
    if (form.error) return `<span class="form-error">${esc(form.error)}</span>`;
    if (form.omitted) return '<span class="compact-note">No form</span>';
    return `<span class="word-form">${esc(form.word)}</span><span class="word-ipa">/${esc(form.ipa)}/</span>${phonotacticMarkup(form)}`;
  }

  function traceMarkup(form) {
    if (!form?.trace?.length) return "";
    return `<details class="rule-trace"><summary>Show steps</summary><ol>${form.trace.map((step) =>
      `<li><span>${esc(step.label)}</span><code class="ipa">${step.before ? `/${esc(step.before)}/ → ` : ""}/${esc(step.after)}/</code>${step.changed ? "" : '<small>Unchanged</small>'}</li>`).join("")}</ol></details>`;
  }

  function renderPage() {
    const kind = ui.inflectionKind || "declension";
    const list = language().paradigms.filter((p) => p.kind === kind);
    let selected = selectedParadigm();
    if (selected?.kind !== kind) selected = list[0];
    if (selected) ui.paradigmId = selected.id;
    const available = selected ? language().lexicon.filter((entry) => entry.entryType === "lexeme" && entry.pos === selected.pos) : [];
    const preview = available.find((entry) => entry.id === ui.inflectionPreviewId) || available.find((entry) => entry.paradigmId === selected?.id) || available[0];
    let forms = [];
    if (preview) {
      ui.inflectionPreviewId = preview.id;
      const testing = { ...language(), lexicon: language().lexicon.map((entry) => entry.id === preview.id ? {
        ...entry, paradigmId: selected.id, overrides: entry.paradigmId === selected.id ? entry.overrides : {},
      } : entry) };
      forms = generateInflections(testing, preview.id, PHONEMES);
    }
    return `<div class="page-tabs" role="tablist" aria-label="Paradigm types">${["declension", "conjugation"].map((k) => `<button class="tab ${k === kind ? "active" : ""}" role="tab" aria-selected="${k === kind}" data-action="inflection-tab" data-kind="${k}">${k === "declension" ? "Declensions" : "Conjugations"}</button>`).join("")}</div>
      <div class="paradigm-layout"><section class="panel"><div class="paradigm-toolbar">${button(icon("plus") + " Paradigm", "new-paradigm", "tiny")}</div><div class="paradigm-list">${list.map((p) => `<button type="button" class="paradigm-choice" aria-pressed="${p.id === selected?.id}" data-action="select-paradigm" data-id="${p.id}"><strong>${esc(p.name)}</strong><small>${esc(p.pos)} · ${p.slots.length} forms</small></button>`).join("") || '<p class="compact-note" style="padding:18px">No paradigms yet.</p>'}</div></section>
      <section class="panel">${selected ? `${panelHeader(esc(selected.name), "Phoneme operations → contextual spelling", `<div class="inline-controls">${btnIcon("edit", "edit-paradigm", "Edit paradigm", `data-id="${selected.id}"`)}${button(icon("plus") + " Form", "new-slot", "primary", `data-id="${selected.id}"`)}</div>`)}
        <div class="paradigm-preview-controls"><label>Preview with <select id="inflection-preview-lexeme" aria-label="Preview lexeme">${available.length ? available.map((entry) => `<option value="${entry.id}" ${entry.id === preview?.id ? "selected" : ""}>${esc(entry.word)} · ${esc(entry.gloss)}</option>`).join("") : '<option value="">Add a matching lexeme to preview</option>'}</select></label>${preview ? button("Open lexeme", "edit-entry", "tiny", `data-id="${preview.id}"`) : ""}</div>
        <div class="table-scroll"><table class="data-table paradigm-table"><thead><tr><th>Form</th><th>Result</th><th>Phoneme operations</th><th></th></tr></thead><tbody>${selected.slots.map((slot, index) => `<tr><td><strong>${esc(slot.label)}</strong><div class="compact-note">${esc(featureSummary(slot.features))}</div>${slot.stem ? `<small>Stem: ${esc(slot.stem)}</small>` : ""}</td><td>${resultMarkup(forms[index])}</td><td class="steps-summary">${slot.steps.length ? slot.steps.map((step) => esc(stepSummary(step))).join("<br>") : '<span class="compact-note">Use stem unchanged</span>'}${traceMarkup(forms[index])}</td><td>${btnIcon("edit", "edit-slot", "Edit " + slot.label, `data-paradigm="${selected.id}" data-id="${slot.id}"`)}</td></tr>`).join("")}</tbody></table></div>${!selected.slots.length ? '<p class="compact-note" style="padding:24px">Add a form and define its phoneme operations.</p>' : ""}${selected.description ? `<details class="paradigm-notes"><summary>Notes</summary><p>${esc(selected.description)}</p></details>` : ""}<div class="panel-footer"><span>Assign a paradigm in the lexeme editor to save its forms.</span>${button("Lexicon " + icon("arrow"), "navigate", "tiny", 'data-page="lexicon"')}</div>` : `<div class="empty-state">${icon("grammar")}<h2>${kind === "declension" ? "Define a declension" : "Define a conjugation"}</h2><p>Give each grammatical form an ordered set of phoneme operations.</p>${button("Create paradigm", "new-paradigm", "primary")}</div>`}</section></div>`;
  }

  function editParadigm(id) {
    const current = getParadigm(id);
    const kind = current?.kind || ui.inflectionKind || "declension";
    modal(
      current ? "Edit paradigm" : "New paradigm",
      "",
      `<div class="form-grid"><label class="full">Name<input name="name" value="${esc(current?.name || "")}" maxlength="160" required autofocus></label><label>Type<select name="kind">${opts({ declension: "Declension", conjugation: "Conjugation" }, kind)}</select></label><label>Part of speech<select name="pos">${opts(Object.fromEntries(POS.map((p) => [p, p])), current?.pos || (kind === "conjugation" ? "verb" : "noun"))}</select></label>${current ? "" : '<label class="full">Starting structure<select name="template"><option value="grid">Case/number or tense/person grid</option><option value="empty">Empty paradigm</option></select><span class="field-help">Grid cells initially leave stems unchanged. Add operations to define their forms.</span></label>'}<label class="full">Notes<textarea name="description" rows="2">${esc(current?.description || "")}</textarea></label></div>${modalActions("Save paradigm", current ? button("Delete paradigm", "delete-paradigm", "danger", `type="button" data-id="${current.id}"`) : "")}`,
      (fd) => {
        const p = current
          ? structuredClone(current)
          : createParadigmTemplate(fd.get("kind"));
        p.name = fd.get("name").trim();
        p.kind = fd.get("kind");
        p.pos = fd.get("pos");
        p.description = fd.get("description").trim();
        if (!current && fd.get("template") === "empty") p.slots = [];
        validateParadigms([p], language(), PHONEMES);
        updateLanguage((l) => {
          const at = l.paradigms.findIndex((x) => x.id === p.id);
          if (at < 0) l.paradigms.push(p);
          else l.paradigms[at] = p;
        });
        ui.inflectionKind = p.kind;
        ui.paradigmId = p.id;
        closeModal();
        render();
      },
    );
  }

  const freshStep = () => ({
    kind: "suffix",
    from: "",
    to: "",
    condition: "always",
    test: "",
  });
  function captureSlotDraft() {
    const fd = new FormData($("#modal-form"));
    return {
      ...slotDraft,
      label: fd.get("label"),
      featureText: fd.get("features"),
      stem: fd.get("stem"),
      steps: slotDraft.steps.map((_, i) => {
        const kind = fd.get(`kind-${i}`);
        const condition = fd.get(`condition-${i}`);
        return {
          kind,
          from: kind.startsWith("replace-") ? fd.get(`from-${i}`) || "" : "",
          to: fd.get(`to-${i}`) || "",
          condition,
          test: ["always", "vowel-final", "consonant-final"].includes(condition) ? "" : fd.get(`test-${i}`) || "",
        };
      }),
    };
  }
  function editSlot(paradigmId, slotId, draft) {
    const paradigm = getParadigm(paradigmId);
    if (!paradigm) throw Error("Select a paradigm first.");
    const current = paradigm.slots.find((s) => s.id === slotId);
    slotDraft = draft || {
      ...structuredClone(
        current || {
          id: uid("slot"),
          label: "",
          features: {},
          stem: "",
          steps: [],
        },
      ),
      paradigmId,
      featureText: featureSummary(current?.features),
    };
    const fields = slotDraft.steps
      .map(
        (step, i) =>
          `<section class="rule-step"><div class="step-heading"><strong>Step ${i + 1}</strong><div class="step-actions">${button("↑", "move-step", "tiny", `type="button" data-index="${i}" data-direction="-1" aria-label="Move step ${i + 1} up" ${i ? "" : "disabled"}`)}${button("↓", "move-step", "tiny", `type="button" data-index="${i}" data-direction="1" aria-label="Move step ${i + 1} down" ${i < slotDraft.steps.length - 1 ? "" : "disabled"}`)}${btnIcon("close", "remove-step", "Remove step " + (i + 1), `type="button" data-index="${i}"`)}</div></div><div class="form-grid"><label>Operation<select name="kind-${i}" class="step-kind" data-index="${i}">${opts(operations, step.kind)}</select></label><label>Add / replacement (IPA)<input class="ipa" spellcheck="false" name="to-${i}" value="${esc(step.to)}" maxlength="1000"></label><label class="step-match" data-index="${i}" ${step.kind.startsWith("replace-") ? "" : "hidden"}>Match (IPA)<input class="ipa" spellcheck="false" name="from-${i}" value="${esc(step.from)}" maxlength="1000"></label><label>Condition<select name="condition-${i}" class="step-condition" data-index="${i}">${opts(conditions, step.condition)}</select></label><label class="step-test" data-index="${i}" ${["always", "vowel-final", "consonant-final"].includes(step.condition) ? "hidden" : ""}>Phonemes / classes<input class="ipa" spellcheck="false" name="test-${i}" value="${esc(step.test)}" maxlength="1000"></label></div></section>`,
      )
      .join("");
    modal(
      current ? "Edit " + current.label : "New paradigm form",
      "Steps transform whole phonemes in order. Contextual spelling is rendered after the final step.",
      `<div class="form-grid"><label>Form label<input name="label" value="${esc(slotDraft.label)}" maxlength="160" required autofocus></label><label>Stem name<input name="stem" value="${esc(slotDraft.stem)}" placeholder="lemma (default)"></label><label class="full">Features<input name="features" value="${esc(slotDraft.featureText)}" placeholder="case=nom, number=sg"><span class="field-help">Use name=value pairs. A named stem must be supplied by each lexeme that uses it.</span></label></div><details class="rule-notation"><summary>Phoneme notation</summary><p>Use selected IPA symbols, with spaces for clarity: <code>n a</code>. A multi-character symbol such as <code>t͡ʃ</code> is one phoneme. Conditions also accept <code>C</code>, <code>V</code>, or a custom sound class. Empty replacement deletes matched phonemes.</p></details><div class="step-editor">${fields || '<p class="compact-note">No operations: use the stem unchanged.</p>'}</div>${button(icon("plus") + " Step", "add-step", "tiny", 'type="button"')}${modalActions("Save form", current ? button("Delete form", "delete-slot", "danger", `type="button" data-paradigm="${paradigmId}" data-id="${slotId}"`) : "")}`,
      () => {
        const data = captureSlotDraft();
        const slot = {
          id: data.id,
          label: data.label.trim(),
          features: parseNameValues(data.featureText),
          stem: data.stem.trim(),
          steps: data.steps,
        };
        const copy = structuredClone(paradigm);
        const at = copy.slots.findIndex((x) => x.id === slot.id);
        if (at < 0) copy.slots.push(slot);
        else copy.slots[at] = slot;
        validateParadigms([copy], language(), PHONEMES);
        updateLanguage((l) => {
          l.paradigms[l.paradigms.findIndex((p) => p.id === copy.id)] = copy;
        });
        closeModal();
      },
    );
    wide();
  }

  function paradigmOptions(pos, selected) {
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
  function entryFields(entry) {
    const kind = entry.entryType;
    const origin =
      entry.source &&
      language().lexicon.find((e) => e.id === entry.source.lexemeId);
    return `<label>Entry type<select name="entryType" id="entry-type">${opts({ lexeme: "Lexeme", form: "Inflected form" }, kind)}</select></label><label class="entry-lexeme-fields" ${kind === "form" ? "hidden" : ""}>Paradigm<select name="paradigmId" id="entry-paradigm">${paradigmOptions(entry.pos, entry.paradigmId)}</select></label><details class="full entry-lexeme-fields rule-notation" ${kind === "form" ? "hidden" : ""} ${Object.keys(entry.stems).length ? "open" : ""}><summary>Named stems</summary><label>Pronunciations (IPA)<textarea name="stems" rows="2" placeholder="past = ...\noblique = ...">${esc(
      Object.entries(entry.stems)
        .map(([name, value]) => `${name} = ${value}`)
        .join("\n"),
    )}</textarea><span class="field-help">One name = IPA per line, e.g. past = t a l. Leave a form’s stem name empty to use the lexeme pronunciation.</span></label></details>${origin ? `<p class="full lexeme-origin">From ${esc(origin.word)} · ${esc(entry.source.slotLabel)}. Saved forms are snapshots. Choose Lexeme to make an independent dictionary headword.</p>` : ""}`;
  }
  function entryMetadata(fd, entry) {
    const entryType = fd.get("entryType");
    const paradigmId =
      entryType === "lexeme" ? fd.get("paradigmId") || null : null;
    if (
      entryType !== "lexeme" &&
      entry.id &&
      language().lexicon.some((e) => e.source?.lexemeId === entry.id)
    )
      throw Error(
        "Other dictionary forms refer to this lexeme. Detach those forms before changing its entry type.",
      );
    return {
      entryType,
      paradigmId,
      stems:
        entryType === "lexeme" ? parseNameValues(fd.get("stems"), "\n") : {},
      overrides:
        entryType === "lexeme" && paradigmId === entry.paradigmId
          ? entry.overrides
          : {},
      source: entryType === "form" ? entry.source : null,
    };
  }

  function formDraft(lexeme, form) {
    return {
      word: form.word,
      ipa: form.ipa,
      segments: [...form.segments],
      syllables: form.syllables.map((syllable) => [...syllable]),
      spellingOverride: form.spellingOverride,
      gloss: lexeme.gloss,
      definition: lexeme.definition,
      pos: lexeme.pos,
      entryType: "form",
      paradigmId: null,
      stems: {},
      overrides: {},
      source: form.source,
      tags: [
        "inflected",
        ...Object.values(form.features).filter(
          (value) => value.length <= 100,
        ),
      ],
      conceptId: null,
      notes: "",
    };
  }
  const savedForm = (lexemeId, form) =>
    language().lexicon.find(
      (entry) =>
        entry.source?.lexemeId === lexemeId &&
        entry.source?.paradigmId === form.source.paradigmId &&
        entry.source?.slotId === form.slotId,
    );
  function showForms(lexemeId) {
    const lexeme = language().lexicon.find((e) => e.id === lexemeId);
    if (!lexeme || lexeme.entryType === "form")
      throw Error("Choose a lexeme to generate its forms.");
    const paradigm = getParadigm(lexeme.paradigmId);
    if (!paradigm) {
      modal(
        "Forms of " + lexeme.word,
        "Assign a paradigm to this lexeme first.",
        `<p class="compact-note">Create a declension or conjugation in Inflection, then select it in the lexeme editor.</p><div class="form-actions">${button("Close", "close-modal", "", 'type="button"')}${button("Edit lexeme", "edit-entry", "primary", `type="button" data-id="${lexemeId}"`)}</div>`,
      );
      return;
    }
    const forms = generateInflections(language(), lexemeId, PHONEMES);
    modal(
      "Forms of " + lexeme.word,
      `${paradigm.name} · ${lexeme.gloss}`,
      `<div class="paradigm-toolbar">${button("Select available", "select-forms", "tiny", 'type="button"')}${button("Edit lexeme", "edit-entry", "tiny", `type="button" data-id="${lexemeId}"`)}</div><div class="table-scroll"><table class="data-table forms-table"><thead><tr><th></th><th>Form</th><th>Result</th><th></th></tr></thead><tbody>${forms
        .map((form) => {
          const saved = savedForm(lexemeId, form),
            unavailable = form.omitted || form.error || !form.word;
          const status = form.error
            ? "Needs attention"
            : form.omitted
              ? "No form"
              : form.overridden
                ? "Exception"
                : "";
          return `<tr><td><input type="checkbox" name="form-slot" value="${form.slotId}" aria-label="Select ${esc(form.label)}" ${unavailable || saved ? "disabled" : ""}></td><td><strong>${esc(form.label)}</strong><div class="compact-note">${esc(featureSummary(form.features))}</div>${status || saved ? `<small class="form-status">${[status, saved ? "Saved" : ""].filter(Boolean).map(esc).join(" · ")}</small>` : ""}</td><td><span class="word-form">${unavailable ? "—" : esc(form.word)}</span>${form.ipa ? `<div class="word-ipa">/${esc(form.ipa)}/</div>` : ""}${form.error ? `<span class="form-error">${esc(form.error)}</span>` : ""}${phonotacticMarkup(form)}${traceMarkup(form)}</td><td><div class="inline-controls">${button(form.overridden || form.omitted ? "Edit exception" : "Exception", "edit-form-exception", "tiny", `type="button" data-lexeme="${lexemeId}" data-slot="${form.slotId}"`)}${saved ? button("Edit saved", "edit-entry", "tiny", `type="button" data-id="${saved.id}"`) : button("Add", "save-inflected", "tiny", `type="button" data-lexeme="${lexemeId}" data-slot="${form.slotId}" ${unavailable ? "disabled" : ""}`)}</div></td></tr>`;
        })
        .join(
          "",
        )}</tbody></table></div><p class="compact-note">Phoneme rules run first; spelling follows. Saved forms are snapshots and keep their pronunciation when rules change.</p>${modalActions("Add selected forms")}`,
      (fd) => {
        const selected = new Set(fd.getAll("form-slot"));
        const chosen = generateInflections(language(), lexemeId, PHONEMES).filter(
          (form) =>
            selected.has(form.slotId) &&
            !form.error &&
            !form.omitted &&
            form.word &&
            !savedForm(lexemeId, form),
        );
        if (!chosen.length) throw Error("Select at least one available form.");
        updateLanguage((l) => {
          for (const form of chosen)
            l.lexicon.push({
              ...formDraft(lexeme, form),
              id: uid("entry"),
              createdAt: new Date().toISOString(),
            });
        });
        showForms(lexemeId);
        toast(`${chosen.length} forms added.`);
      },
    );
    wide();
  }
  function editException(lexemeId, slotId) {
    const lexeme = language().lexicon.find((e) => e.id === lexemeId);
    const form = generateInflections(language(), lexemeId, PHONEMES).find(
      (f) => f.slotId === slotId,
    );
    const override = lexeme.overrides[slotId];
    modal(
      "Exception: " + form.label,
      "Override this form for " + lexeme.word + " only.",
      `<div class="form-grid"><label class="full inline-check"><input type="checkbox" name="omit" ${override?.omit ? "checked" : ""}> This lexeme has no form for this cell</label><label class="full">Pronunciation exception (IPA)<input name="ipa" class="ipa" spellcheck="false" value="${esc(override?.ipa ?? "")}" placeholder="${esc(form.ipa || "Enter phonemes")}" maxlength="2000"><span class="field-help">Leave empty to keep the regular pronunciation. An IPA exception replaces the complete form, including any named stem.</span></label><label class="full">Spelling exception<input name="word" value="${esc(override?.word ?? "")}" placeholder="${esc(form.word || "Render from pronunciation")}" maxlength="1000"><span class="field-help">Optional. Leave empty to use the orthography rules.</span></label></div>${modalActions("Save exception", override ? button("Use regular form", "clear-form-exception", "", `type="button" data-lexeme="${lexemeId}" data-slot="${slotId}"`) : "")}`,
      (fd) => {
        const value = {
          word: fd.get("word").trim(),
          ipa: fd
            .get("ipa")
            .trim()
            .replace(/^\/|\/$/g, ""),
          omit: fd.has("omit"),
        };
        if (!value.omit && !value.word && !value.ipa)
          throw Error(
            "Enter an IPA or spelling exception, or mark the form as absent.",
          );
        updateLanguage((l) => {
          l.lexicon.find((e) => e.id === lexemeId).overrides[slotId] = value;
        });
        showForms(lexemeId);
      },
    );
  }

  function handleAction(b) {
    const action = b.dataset.action;
    switch (action) {
      case "inflection-tab":
        ui.inflectionKind = b.dataset.kind;
        ui.paradigmId = "";
        render();
        break;
      case "select-paradigm":
        ui.paradigmId = b.dataset.id;
        render();
        break;
      case "new-paradigm":
        editParadigm();
        break;
      case "edit-paradigm":
        editParadigm(b.dataset.id);
        break;
      case "new-slot":
        editSlot(b.dataset.id);
        break;
      case "edit-slot":
        editSlot(b.dataset.paradigm, b.dataset.id);
        break;
      case "add-step":
        slotDraft = captureSlotDraft();
        slotDraft.steps.push(freshStep());
        editSlot(slotDraft.paradigmId, slotDraft.id, slotDraft);
        break;
      case "remove-step":
        slotDraft = captureSlotDraft();
        slotDraft.steps.splice(Number(b.dataset.index), 1);
        editSlot(slotDraft.paradigmId, slotDraft.id, slotDraft);
        break;
      case "move-step": {
        slotDraft = captureSlotDraft();
        const index = Number(b.dataset.index),
          next = index + Number(b.dataset.direction);
        if (next >= 0 && next < slotDraft.steps.length)
          [slotDraft.steps[index], slotDraft.steps[next]] = [
            slotDraft.steps[next],
            slotDraft.steps[index],
          ];
        editSlot(slotDraft.paradigmId, slotDraft.id, slotDraft);
        break;
      }
      case "delete-paradigm": {
        const id = b.dataset.id;
        closeModal();
        confirmAction(
          "Delete this paradigm?",
          "Assignments and exceptions will be cleared. Saved dictionary forms will remain.",
          () => {
            updateLanguage((l) => {
              l.paradigms = l.paradigms.filter((p) => p.id !== id);
              for (const e of l.lexicon)
                if (e.paradigmId === id) {
                  e.paradigmId = null;
                  e.overrides = {};
                }
            });
            ui.paradigmId = "";
            render();
          },
          "Delete paradigm",
        );
        break;
      }
      case "delete-slot": {
        const id = b.dataset.id,
          pId = b.dataset.paradigm;
        closeModal();
        confirmAction(
          "Delete this form definition?",
          "Its lexeme exceptions will be cleared. Saved dictionary forms will remain.",
          () =>
            updateLanguage((l) => {
              l.paradigms.find((p) => p.id === pId).slots = l.paradigms
                .find((p) => p.id === pId)
                .slots.filter((s) => s.id !== id);
              for (const e of l.lexicon)
                if (e.paradigmId === pId) delete e.overrides[id];
            }),
          "Delete form",
        );
        break;
      }
      case "lexeme-forms":
        showForms(b.dataset.id);
        break;
      case "edit-form-exception":
        editException(b.dataset.lexeme, b.dataset.slot);
        break;
      case "clear-form-exception":
        updateLanguage(
          (l) =>
            delete l.lexicon.find((e) => e.id === b.dataset.lexeme).overrides[
              b.dataset.slot
            ],
        );
        showForms(b.dataset.lexeme);
        break;
      case "select-forms":
        document
          .querySelectorAll('input[name="form-slot"]:not(:disabled)')
          .forEach((e) => (e.checked = true));
        break;
      case "save-inflected": {
        const lexeme = language().lexicon.find(
          (e) => e.id === b.dataset.lexeme,
        );
        const form = generateInflections(language(), lexeme.id, PHONEMES).find(
          (f) => f.slotId === b.dataset.slot,
        );
        if (!form || form.error || form.omitted || !form.word)
          throw Error("This form cannot be generated yet.");
        if (savedForm(lexeme.id, form))
          throw Error("This form is already saved.");
        editEntry(null, formDraft(lexeme, form), () => showForms(lexeme.id));
        break;
      }
      default:
        return false;
    }
    return true;
  }

  function handleChange(e) {
    if (e.id === "inflection-preview-lexeme") {
      ui.inflectionPreviewId = e.value;
      render();
      return true;
    }
    if (e.classList.contains("step-kind")) {
      document.querySelector(
        `.step-match[data-index="${e.dataset.index}"]`,
      ).hidden = !e.value.startsWith("replace-");
      return true;
    }
    if (e.classList.contains("step-condition")) {
      document.querySelector(
        `.step-test[data-index="${e.dataset.index}"]`,
      ).hidden = ["always", "vowel-final", "consonant-final"].includes(e.value);
      return true;
    }
    if (
      e.name === "kind" &&
      document.querySelector('select[name="template"]')
    ) {
      document.querySelector('select[name="pos"]').value =
        e.value === "conjugation" ? "verb" : "noun";
      return true;
    }
    if (e.id === "entry-type") {
      document
        .querySelectorAll(".entry-lexeme-fields")
        .forEach((field) => (field.hidden = e.value === "form"));
      return true;
    }
    if (e.name === "pos" && e.closest("#modal-form") && $("#entry-paradigm")) {
      const select = $("#entry-paradigm");
      select.innerHTML = paradigmOptions(e.value, select.value);
      return true;
    }
    return false;
  }
  return {
    render: renderPage,
    handleAction,
    handleChange,
    entryFields,
    entryMetadata,
    showForms,
  };
}
