import { composeClause, entriesForRole, GRAMMAR_ORDERS, validateGrammarOrders } from "./grammar.js";

/** Small executable ordering editor and explicit-form clause preview. */
export function createGrammarUI(ctx) {
  const { language, ui, esc, button, panelHeader, commit, render: renderApp, toast } = ctx;
  const selections = new Map();
  let resultState = null;
  const labels = { subject: "Subject", verb: "Verb", object: "Object / complement", adjective: "Object adjective", possessor: "Object possessor", adposition: "Object adposition" };
  const opts = (values, selected) => values.map((value) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(value)}</option>`).join("");
  const signature = (l) => JSON.stringify([l.grammar, l.lexicon]);

  function selected(l) {
    const current = selections.get(l.id) || {};
    const values = {};
    for (const role of Object.keys(labels)) {
      const entries = entriesForRole(l, role);
      values[role] = entries.some((entry) => entry.id === current[role]) ? current[role] : (["subject", "verb", "object"].includes(role) ? entries[0]?.id || "" : "");
    }
    return values;
  }

  function entrySelect(l, role, chosen, optional = false) {
    const entries = entriesForRole(l, role);
    return `<label>${labels[role]}<select name="${role}" ${optional ? "" : "required"}><option value="">${optional ? "None" : `Choose ${role}`}</option>${entries.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === chosen ? "selected" : ""}>${esc(entry.word)} — ${esc(entry.gloss)}${entry.entryType === "form" ? " (saved form)" : ""}</option>`).join("")}</select>${!entries.length && !optional ? `<span class="field-help">Add a ${role === "verb" ? "verb" : "noun or pronoun"} in the lexicon.</span>` : ""}</label>`;
  }

  function output(l) {
    if (resultState?.languageId !== l.id || resultState.signature !== signature(l)) return "";
    const { variants } = resultState.result;
    const variant = (item) => `<article class="clause-variant"><div class="clause-tokens">${item.tokens.map((token) => `<span class="clause-token"><strong>${esc(token.word)}</strong><small>${esc(labels[token.role].replace("Object / complement", "Object").replace("Object ", ""))}</small></span>`).join("")}</div>${item.ipa ? `<p class="ipa">/${esc(item.ipa)}/</p>` : `<p class="compact-note">Add IPA for ${[...new Set(item.missingPronunciations)].map(esc).join(", ")} to see the full pronunciation.</p>`}<p class="compact-note">${[item.wordOrder, item.adjectiveOrder && `Adjective ${item.adjectiveOrder.toLowerCase()}`, item.possessorOrder && `Possessor ${item.possessorOrder.toLowerCase()}`, item.adposition].filter(Boolean).map(esc).join(" · ")}</p></article>`;
    return `<div class="grammar-result" role="status" aria-live="polite">${variant(variants[0])}${variants.length > 1 ? `<details class="rule-help"><summary>${variants.length - 1} other permitted ${variants.length === 2 ? "order" : "orders"}</summary>${variants.slice(1).map(variant).join("")}</details>` : ""}</div>`;
  }

  function render() {
    const l = language();
    if (!l) return "";
    const g = l.grammar;
    const values = selected(l);
    const field = (label, name) => `<label>${label}<select name="${name}">${opts(GRAMMAR_ORDERS[name], g[name])}</select></label>`;
    return `<div class="rules-layout"><div class="stack"><section class="panel">${panelHeader("Word order", "These rules arrange the forms in the clause builder.")}<form id="grammar-rules-form" class="panel-inner" style="padding-top:0"><div class="form-grid">${field("Clause order", "wordOrder")}${field("Adpositions", "adposition")}${field("Adjective position", "adjectiveOrder")}${field("Possessor position", "possessorOrder")}</div><div class="form-actions">${button("Save rules", "submit-grammar-rules", "primary", 'type="submit"')}</div></form></section><section class="panel">${panelHeader("Notes")}<form id="grammar-notes-form" class="panel-inner" style="padding-top:0"><label>Grammar reference<textarea name="description" rows="5" placeholder="Describe agreement, alignment or constructions you want to develop…">${esc(g.description)}</textarea><span class="field-help">Descriptive notes. Define word forms in Inflection and ordering above.</span></label><div class="form-actions">${button("Save notes", "submit-grammar-notes", "", 'type="submit"')}</div></form></section></div><section class="panel">${panelHeader("Build a clause", "Choose the exact dictionary forms to arrange.")}<form id="grammar-compose-form" class="panel-inner" style="padding-top:0"><div class="form-grid">${["subject", "verb", "object"].map((role) => entrySelect(l, role, values[role])).join("")}</div><details class="rule-help" ${["adjective", "possessor", "adposition"].some((key) => values[key]) ? "open" : ""}><summary>Add object modifiers</summary><div class="form-grid">${["adjective", "possessor", "adposition"].map((role) => entrySelect(l, role, values[role], true)).join("")}</div></details><div class="form-actions">${button("Build clause", "submit-grammar-compose", "primary", 'type="submit"')}</div>${output(l)}<details class="rule-help"><summary>How the rules apply</summary><p class="compact-note">The adjective attaches to the object; the possessor wraps that phrase; the adposition wraps the result. Each rule sets the corresponding side. Free and flexible settings show all permitted orders.</p><p class="compact-note">Choose inflected forms saved in the lexicon when you need case or agreement. This builder orders the forms you select; it does not infer those features.</p></details></form></section></div>`;
  }

  function handleSubmit(form, data) {
    if (!["grammar-rules-form", "grammar-notes-form", "grammar-compose-form"].includes(form.id)) return false;
    const l = language();
    if (!l) throw new Error("Select a language first.");
    if (form.id === "grammar-compose-form") {
      const selection = Object.fromEntries(Object.keys(labels).map((role) => [role, String(data.get(role) || "")]));
      const result = composeClause(l, selection);
      selections.set(l.id, selection);
      resultState = { languageId: l.id, signature: signature(l), result };
      renderApp();
      return true;
    }
    const updated = form.id === "grammar-rules-form"
      ? validateGrammarOrders(Object.fromEntries(Object.keys(GRAMMAR_ORDERS).map((name) => [name, data.get(name)])))
      : { description: String(data.get("description") || "").normalize("NFC") };
    if (updated.description?.length > 100000) throw new Error("Grammar notes exceed 100,000 characters.");
    resultState = null;
    commit((workspace) => {
      const current = workspace.languages.find((item) => item.id === l.id);
      if (!current || ui.langId !== l.id) throw new Error("The active language changed. Reopen this editor.");
      Object.assign(current.grammar, updated);
    });
    toast(form.id === "grammar-rules-form" ? "Grammar rules saved." : "Notes saved.");
    return true;
  }

  return { render, handleSubmit, handleAction: () => false };
}
