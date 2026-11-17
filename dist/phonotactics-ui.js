import {
  compileWordPhonotactics,
  validatePhonotacticExtras,
} from "./phonotactics.js";
import { parseIPA } from "./phonology.js";

/** The phonotactic editor shares persistence, modal, and rendering services with the app. */
export function createPhonotacticsUI(ctx) {
  const {
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
    render: renderApp,
    toast,
    selectedSounds,
    generateWords,
  } = ctx;
  const byId = new Map(PHONEMES.map((sound) => [sound.id, sound]));
  let testState = null;
  const options = (entries, selected) =>
    entries
      .map(
        ([value, label]) =>
          `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`,
      )
      .join("");
  const signature = (l) =>
    JSON.stringify([l.phonemeIds, l.soundClasses, l.phonotactics]);
  const getLanguage = () => {
    const l = language();
    if (!l) throw new Error("Select a language first.");
    return l;
  };
  const numberField = (data, key, label) => {
    const raw = data.get(key);
    if (typeof raw !== "string" || !raw.trim() || !Number.isFinite(Number(raw)))
      throw new Error(`${label} must be a number.`);
    return Number(raw);
  };
  const newId = () =>
    `constraint-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;

  function savePhonotactics(next, message, validateGenerator = false) {
    const l = getLanguage();
    const copy = structuredClone(l);
    copy.phonotactics = {
      ...next,
      ...validatePhonotacticExtras(next, copy, PHONEMES),
    };
    const result = validateGenerator
      ? generateWords(copy, PHONEMES, {
          count: 1,
          seed: "validate-phonotactics",
        })
      : null;
    testState = null;
    commit((workspace) => {
      const current = workspace.languages.find((item) => item.id === ui.langId);
      if (!current || current.id !== l.id)
        throw new Error("The active language changed. Reopen this editor.");
      current.phonotactics = copy.phonotactics;
    });
    toast(message);
    if (result && result.words.length === 0)
      toast(
        "The rules were saved, but the generation check found no unused candidate. Review constraints, patterns, and the existing lexicon.",
        true,
      );
  }

  function classPanel() {
    const l = getLanguage();
    return `<section class="panel">${panelHeader("Sound classes", "Shared by phonotactics, morphology and spelling rules.", button(icon("plus") + " Class", "new-class", "tiny", 'type="button"'))}
      <div class="panel-inner" style="padding-top:0">
        <div class="features"><span><b>C</b> All selected consonants</span><span><b>V</b> All selected vowels</span></div>
        <div class="rule-list" style="margin-top:18px">${
          Object.entries(l.soundClasses || {})
            .map(
              ([key, ids]) =>
                `<div class="constraint-row"><div><code>${esc(key)}</code> <span class="ipa" style="margin-left:10px">${ids.map((id) => esc(byId.get(id)?.symbol || id)).join(" ") || "No sounds"}</span></div>${btnIcon("edit", "edit-class", "Edit class " + key, `data-key="${esc(key)}" type="button"`)}</div>`,
            )
            .join("") || '<p class="compact-note">No custom classes yet.</p>'
        }</div>
      </div></section>`;
  }

  function structurePanel() {
    const p = getLanguage().phonotactics;
    return `<div class="rules-layout"><section class="panel">${panelHeader("Syllable structure", "Build syllables from your selected sounds.")}
      <form id="phonotactics-structure-form" class="panel-inner" style="padding-top:0">
        <div class="builder-fields"><label>Syllable patterns<textarea name="patterns" rows="5" spellcheck="false" required>${esc(p.patterns.map((item) => `${item.pattern} : ${item.weight}`).join("\n"))}</textarea><span class="field-help">One per line: <code>CV : 3</code>, <code>CVC : 1</code>, or <code>(C)V(C) : 2</code>.</span></label>
          <div class="features"><span><b>C</b> consonant</span><span><b>V</b> vowel</span><span><b>(C)</b> optional consonant</span></div>
          <div class="form-grid">
            <label>Minimum syllables<input name="min" type="number" min="1" max="12" step="1" value="${p.minSyllables}" required></label>
            <label>Maximum syllables<input name="max" type="number" min="1" max="12" step="1" value="${p.maxSyllables}" required></label>
            <label>Stress<select name="stress">${options(
              [
                ["initial", "Initial"],
                ["penultimate", "Penultimate"],
                ["final", "Final"],
                ["none", "Unmarked"],
              ],
              p.stress,
            )}</select></label>
            <label>Optional-group inclusion (%)<input name="optionalPercent" type="number" min="0" max="100" step="any" value="${esc(p.optionalProbability * 100)}" required><span class="field-help">Each optional group is included independently. 0 = never; 100 = always.</span></label>
            <label class="full">Forbidden IPA text<input name="banned" placeholder="e.g. ŋŋ, jj, wu" value="${esc((p.banned || []).join(", "))}"><span class="field-help">Comma-separated IPA text, matched as literal substrings across the whole word. Use Constraints for exact phoneme sequences and boundary rules.</span></label>
          </div>
        </div>
        <div class="form-actions">${button("Save phonotactics", "submit-phonotactics-structure", "primary", 'type="submit"')}</div>
      </form></section><div class="stack">${classPanel()}
        ${testPanel()}
      </div></div>`;
  }

  function testPanel() {
    const l = getLanguage();
    const sameLanguage = testState?.languageId === l.id;
    const input = sameLanguage ? testState.text : "";
    const result =
      sameLanguage && testState.signature === signature(l)
        ? testState.result
        : null;
    return `<section class="panel">${panelHeader("Test a word", "Check syllable shapes, length, constraints and stress.")}
      <form id="phonotactics-test-form" class="panel-inner" style="padding-top:0"><label>IPA sequence<input name="candidate" class="ipa" value="${esc(input)}" placeholder="se.la" maxlength="2000" spellcheck="false" required><span class="field-help">Use IPA and dots between syllables: <code>se.la</code>. Spaces may separate whole phonemes.</span></label>
        <div class="form-actions">${button("Check word", "submit-phonotactics-test", "", 'type="submit"')}</div>
        <div id="phonotactics-test-output" role="status" aria-live="polite">${
          result
            ? `<div class="notice"><strong>${result.ok ? "Valid word structure" : "Does not fit your phonotactics"}</strong>${result.ipa ? `<p class="ipa">/${esc(result.ipa)}/</p>` : ""}${result.reasons.length ? `<ul>${result.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : `<p class="compact-note">${result.syllablePatterns.map((match) => esc(match.patterns.join(" / "))).join(" · ")}</p>`}</div>`
            : ""
        }</div>
        <details class="rule-help"><summary>What is checked?</summary><p class="compact-note">Every syllable must match a saved pattern. The word must satisfy the syllable bounds, constraints and forbidden IPA text. An entered stress mark must match your stress rule; otherwise the result shows the assigned stress. Weights and optional-group probabilities control sampling frequency, not legal shapes. Existing dictionary words may pass.</p></details>
      </form></section>`;
  }

  function constraintsPanel() {
    const rules = getLanguage().phonotactics.constraints;
    const positionLabel = {
      anywhere: "Anywhere",
      start: "At start",
      end: "At end",
    };
    return `<div class="rules-layout"><div class="stack"><section class="panel">${panelHeader("Phoneme constraints", "Match whole sounds or sound classes.", button(icon("plus") + " Constraint", "pt-new-constraint", "tiny", 'type="button"'))}
      <div class="panel-inner" style="padding-top:0"><div class="rule-list">${
        rules
          .map(
            (rule) =>
              `<article class="constraint-row"><div><h3 style="margin:0 0 7px;font-size:13px">${esc(rule.name)}</h3><code class="ipa">${esc(rule.sequence)}</code><div class="features" style="margin-top:9px"><span>${rule.mode === "forbid" ? "Forbid" : "Require"}</span><span>${rule.scope === "word" ? "Whole word" : "Every syllable"}</span><span>${positionLabel[rule.position]}</span></div></div>${btnIcon("edit", "pt-edit-constraint", "Edit " + rule.name, `data-id="${esc(rule.id)}" type="button"`)}</article>`,
          )
          .join("") ||
        '<p class="compact-note">No phoneme constraints. Add a rule to restrict a sequence, an onset, or a coda.</p>'
      }</div></div>
      </section><details class="rule-help"><summary>Sequence notation</summary><p class="compact-note"><code>C C C</code> matches three consonants; <code>ŋ</code> matches that sound; <code>N V</code> matches a nasal-class member followed by a vowel. Word rules cross syllable boundaries. A required syllable rule must match every syllable; a forbidden one must match none.</p></details></div>${testPanel()}</div>`;
  }

  function weightsPanel() {
    const weights = getLanguage().phonotactics.phonemeWeights;
    const sounds = selectedSounds();
    return `<section class="panel">${panelHeader("Sound weights", "Relative frequency within each sound class; unweighted sounds default to 1.")}
      <form id="phonotactics-weights-form" class="panel-inner" style="padding-top:0"><div class="weight-grid">${
        sounds
          .map(
            (sound) =>
              `<label class="weight-field"><span class="ipa" title="${esc(sound.name)}">${esc(sound.symbol)}</span><input name="weight-${esc(sound.id)}" aria-label="Weight for ${esc(sound.symbol)}" type="number" min="0.01" max="1000" step="any" value="${esc(weights[sound.id] ?? 1)}" required></label>`,
          )
          .join("") ||
        '<p class="compact-note">Select sounds in Phonology before setting their weights.</p>'
      }</div>
        <p class="compact-note" style="margin-top:20px">A weight of 3 gives a sound three times the selection chance of a sound weighted 1 in the same class. Weights do not override constraints or alter existing words.</p>
        <div class="form-actions">${button("Save sound weights", "submit-phonotactics-weights", "primary", `type="submit" ${sounds.length ? "" : "disabled"}`)}</div>
      </form></section>`;
  }

  function render() {
    if (!language())
      return '<section class="panel"><div class="panel-inner"><p class="compact-note">Select a language to edit phonotactics.</p></div></section>';
    if (!["structure", "constraints", "weights"].includes(ui.phonotacticsTab))
      ui.phonotacticsTab = "structure";
    const tabs = [
      ["structure", "Structure"],
      ["constraints", "Constraints"],
      ["weights", "Sound weights"],
    ];
    return `<div class="page-tabs" role="tablist" aria-label="Phonotactics sections">${tabs
      .map(
        ([id, label]) =>
          `<button type="button" class="tab ${ui.phonotacticsTab === id ? "active" : ""}" role="tab" id="pt-tab-${id}" aria-selected="${ui.phonotacticsTab === id}" aria-controls="pt-tab-content" data-action="pt-tab" data-tab="${id}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div id="pt-tab-content" role="tabpanel" aria-labelledby="pt-tab-${ui.phonotacticsTab}">${{ structure: structurePanel, constraints: constraintsPanel, weights: weightsPanel }[ui.phonotacticsTab]()}</div>`;
  }

  function editConstraint(id = null) {
    const l = getLanguage();
    const existing = id
      ? l.phonotactics.constraints.find((rule) => rule.id === id)
      : null;
    if (id && !existing) throw new Error("This constraint no longer exists.");
    const rule = existing || {
      id: newId(),
      name: "",
      scope: "word",
      position: "anywhere",
      mode: "forbid",
      sequence: "",
    };
    modal(
      existing ? "Edit constraint" : "New constraint",
      "Use spaces between whole IPA symbols or class letters.",
      `<div class="form-grid"><label class="full">Name<input name="name" value="${esc(rule.name)}" placeholder="e.g. No three-consonant clusters" maxlength="160" required></label>
        <label>Scope<select name="scope">${options(
          [
            ["word", "Whole word"],
            ["syllable", "Every syllable"],
          ],
          rule.scope,
        )}</select></label>
        <label>Position<select name="position">${options(
          [
            ["anywhere", "Anywhere"],
            ["start", "At start"],
            ["end", "At end"],
          ],
          rule.position,
        )}</select></label>
        <label>Operation<select name="mode">${options(
          [
            ["forbid", "Forbid sequence"],
            ["require", "Require sequence"],
          ],
          rule.mode,
        )}</select></label>
        <label class="full">Sequence<input name="sequence" class="ipa" value="${esc(rule.sequence)}" placeholder="C C C" spellcheck="false" maxlength="512" required><span class="field-help">Examples: <code>C C C</code>, <code>ŋ</code>, <code>t s</code>, <code>N V</code>. C/V and your custom classes use uppercase letters.</span></label>
      </div><p class="compact-note">Word rules can cross syllable boundaries. Syllable rules apply separately to every syllable.</p>${modalActions("Save constraint", existing ? button("Delete constraint", "pt-delete-constraint", "danger", `data-id="${esc(rule.id)}" data-language-id="${esc(l.id)}" type="button"`) : "")}`,
      (data) => {
        const current = getLanguage();
        if (current.id !== l.id)
          throw new Error("The active language changed. Reopen this editor.");
        const updated = {
          id: rule.id,
          name: data.get("name"),
          scope: data.get("scope"),
          position: data.get("position"),
          mode: data.get("mode"),
          sequence: data.get("sequence"),
        };
        const rules = [...current.phonotactics.constraints];
        const index = rules.findIndex((item) => item.id === rule.id);
        if (existing && index < 0)
          throw new Error("This constraint no longer exists.");
        if (index < 0) rules.push(updated);
        else rules[index] = updated;
        savePhonotactics(
          { ...current.phonotactics, constraints: rules },
          "Constraint saved.",
        );
        closeModal();
      },
    );
  }

  function handleAction(element) {
    switch (element?.dataset?.action) {
      case "pt-tab":
        if (
          !["structure", "constraints", "weights"].includes(element.dataset.tab)
        )
          return false;
        ui.phonotacticsTab = element.dataset.tab;
        renderApp();
        return true;
      case "pt-new-constraint":
        editConstraint();
        return true;
      case "pt-edit-constraint":
        editConstraint(element.dataset.id);
        return true;
      case "pt-delete-constraint": {
        const l = getLanguage();
        if (element.dataset.languageId !== l.id)
          throw new Error("The active language changed. Reopen this editor.");
        const rules = l.phonotactics.constraints;
        if (!rules.some((rule) => rule.id === element.dataset.id))
          throw new Error("This constraint no longer exists.");
        savePhonotactics(
          {
            ...l.phonotactics,
            constraints: rules.filter((rule) => rule.id !== element.dataset.id),
          },
          "Constraint deleted.",
        );
        closeModal();
        return true;
      }
      default:
        return false;
    }
  }

  function handleSubmit(form, data) {
    if (form.id === "phonotactics-structure-form") {
      const patterns = String(data.get("patterns") || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(":");
          if (
            parts.length > 2 ||
            !parts[0].trim() ||
            (parts.length === 2 && !parts[1].trim())
          )
            throw new Error("Use pattern : weight, one per line.");
          return {
            pattern: parts[0].trim(),
            weight: parts.length === 2 ? Number(parts[1]) : 1,
          };
        });
      const next = {
        ...getLanguage().phonotactics,
        patterns,
        minSyllables: numberField(data, "min", "Minimum syllables"),
        maxSyllables: numberField(data, "max", "Maximum syllables"),
        stress: data.get("stress"),
        optionalProbability:
          numberField(data, "optionalPercent", "Optional-group inclusion") /
          100,
        banned: String(data.get("banned") || "")
          .split(",")
          .map((value) => value.normalize("NFC").trim())
          .filter(Boolean),
      };
      savePhonotactics(next, "Phonotactics saved.", true);
      return true;
    }
    if (form.id === "phonotactics-weights-form") {
      const phonemeWeights = Object.fromEntries(
        selectedSounds().map((sound) => {
          const weight = numberField(
            data,
            "weight-" + sound.id,
            `Weight for /${sound.symbol}/`,
          );
          if (weight < 0.01 || weight > 1000)
            throw new Error("Sound weights must be between 0.01 and 1,000.");
          return [sound.id, weight];
        }),
      );
      savePhonotactics(
        { ...getLanguage().phonotactics, phonemeWeights },
        "Sound weights saved.",
      );
      return true;
    }
    if (form.id === "phonotactics-test-form") {
      const l = getLanguage();
      const source = String(data.get("candidate") || "")
        .normalize("NFC")
        .trim();
      if (!source || source.length > 2000)
        throw new Error("Enter an IPA sequence of at most 2,000 characters.");
      const parsed = parseIPA(source, l, PHONEMES);
      const result = compileWordPhonotactics(l, PHONEMES)(parsed.syllables, {
        stressIndex: source.includes("ˈ") ? parsed.stressIndex : undefined,
      });
      testState = {
        languageId: l.id,
        signature: signature(l),
        text: source,
        result,
      };
      renderApp();
      return true;
    }
    return false;
  }

  return { render, handleAction, handleSubmit };
}
