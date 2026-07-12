function element(tagName, { className, text, attributes = {} } = {}) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== null && value !== undefined) node.setAttribute(name, String(value));
  });
  return node;
}

function appendChildren(parent, ...children) {
  children.flat().filter(Boolean).forEach((child) => parent.append(child));
  return parent;
}

function button(label, onClick, className = "primary-button", attributes = {}) {
  const node = element("button", {
    className,
    text: label,
    attributes: { type: "button", ...attributes },
  });
  node.addEventListener("click", onClick);
  return node;
}

function link(label, hash) {
  return element("a", { text: label, attributes: { href: hash } });
}

function breadcrumbs(items) {
  const nav = element("nav", {
    className: "breadcrumbs",
    attributes: { "aria-label": "Navegação estrutural" },
  });
  const list = element("ol");

  items.forEach((item, index) => {
    const listItem = element("li");
    if (index === items.length - 1) {
      listItem.append(element("span", {
        text: item.label,
        attributes: { "aria-current": "page" },
      }));
    } else {
      listItem.append(link(item.label, item.hash));
    }
    list.append(listItem);
  });

  nav.append(list);
  return nav;
}

function pageHeading(eyebrowText, title, intro) {
  const fragment = document.createDocumentFragment();
  fragment.append(element("p", { className: "eyebrow", text: eyebrowText }));
  fragment.append(element("h1", { className: "page-title", text: title }));
  if (intro) fragment.append(element("p", { className: "page-intro", text: intro }));
  return fragment;
}

function renderLoading(state) {
  const card = element("section", {
    className: "state-card",
    attributes: { "aria-labelledby": "loading-title", "aria-busy": "true" },
  });
  const dots = element("span", { className: "loading-dots", attributes: { "aria-hidden": "true" } });
  dots.append(element("span"), element("span"), element("span"));
  const symbol = element("div", { className: "state-symbol" });
  symbol.append(dots);

  const message = state.manifest ? "Carregando os diálogos…" : "Carregando as categorias…";
  appendChildren(
    card,
    symbol,
    element("h1", { text: "Preparando seu estudo", attributes: { id: "loading-title" } }),
    element("p", { text: message }),
  );
  return card;
}

function renderError(state, actions) {
  const error = state.error || {};
  const card = element("section", {
    className: "state-card",
    attributes: { "data-state": "error", "aria-labelledby": "error-title" },
  });

  const actionRow = element("div", { className: "state-actions" });
  actionRow.append(button("Tentar novamente", actions.retry));
  if (state.manifest) {
    actionRow.append(button("Voltar às categorias", () => actions.navigate("#/categories"), "secondary-button"));
  }

  appendChildren(
    card,
    element("div", { className: "state-symbol", text: "!", attributes: { "aria-hidden": "true" } }),
    element("h1", { text: "Não foi possível carregar esta parte", attributes: { id: "error-title" } }),
    element("p", { text: error.message || "Ocorreu um problema inesperado." }),
    actionRow,
  );

  const technicalText = [error.code, error.status ? `HTTP ${error.status}` : null, error.url]
    .filter(Boolean)
    .join(" · ");
  if (technicalText || error.details?.length) {
    const details = element("details", { className: "error-details" });
    details.append(element("summary", { text: "Ver detalhes técnicos" }));
    const messages = error.details?.length
      ? error.details.map((item) => `${item.path}: ${item.message}`).join("\n")
      : technicalText;
    details.append(element("code", { text: [technicalText, messages].filter(Boolean).join("\n") }));
    card.append(details);
  }

  return card;
}

function renderCategories(manifest, actions) {
  const section = element("section", { attributes: { "aria-labelledby": "categories-title" } });
  const heading = pageHeading(
    "Escolha um cenário",
    "Aprenda a responder dentro de uma conversa.",
    "Explore situações completas, reconheça a intenção do interlocutor e acompanhe cada diálogo no ritmo natural.",
  );
  section.append(heading);
  section.querySelector("h1").id = "categories-title";

  if (manifest.categories.length === 0) {
    section.append(element("p", { className: "empty-state", text: "Nenhuma categoria está disponível no momento." }));
    return section;
  }

  const grid = element("ul", { className: "card-grid" });
  manifest.categories.forEach((category) => {
    const item = element("li", { className: "category-card" });
    const meta = element("div", { className: "category-meta" });
    meta.append(element("span", {
      className: "count-badge",
      text: `${category.dialogueCount} ${category.dialogueCount === 1 ? "diálogo" : "diálogos"}`,
    }));
    meta.append(button("Ver diálogos", () => actions.openCategory(category.id)));

    appendChildren(
      item,
      element("p", { className: "eyebrow", text: "Categoria" }),
      element("h2", { text: category.title }),
      element("p", { text: category.description || "Explore os diálogos desta categoria." }),
      meta,
    );
    grid.append(item);
  });
  section.append(grid);
  return section;
}

function renderCategory(category, actions) {
  const wrapper = document.createDocumentFragment();
  wrapper.append(breadcrumbs([
    { label: "Categorias", hash: "#/categories" },
    { label: category.title },
  ]));

  const layout = element("div", { className: "category-layout" });
  const header = element("header", { className: "category-header" });
  appendChildren(
    header,
    pageHeading(
      `${category.dialogues.length} ${category.dialogues.length === 1 ? "diálogo" : "diálogos"}`,
      category.title,
      category.description,
    ),
    element("p", { className: "section-copy", text: "Escolha livremente por onde começar." }),
  );

  if (category.dialogues.length === 0) {
    layout.append(header, element("p", { className: "empty-state", text: "Esta categoria ainda não possui diálogos." }));
    wrapper.append(layout);
    return wrapper;
  }

  const list = element("ol", { className: "dialogue-list" });
  category.dialogues.forEach((dialogue, index) => {
    const item = element("li", { className: "dialogue-card" });
    const openButton = element("button", {
      className: "dialogue-link",
      attributes: { type: "button", "aria-label": `Abrir diálogo ${index + 1}: ${dialogue.title}` },
    });
    openButton.addEventListener("click", () => actions.openDialogue(category.id, dialogue.id));

    const copy = element("span");
    appendChildren(
      copy,
      element("h2", { text: dialogue.title }),
      element("p", { text: dialogue.context }),
    );
    appendChildren(
      openButton,
      element("span", { className: "dialogue-number", text: String(index + 1).padStart(2, "0"), attributes: { "aria-hidden": "true" } }),
      copy,
      element("span", { className: "dialogue-arrow", text: "→", attributes: { "aria-hidden": "true" } }),
    );
    item.append(openButton);
    list.append(item);
  });

  layout.append(header, list);
  wrapper.append(layout);
  return wrapper;
}

function participantLabel(participant) {
  return participant?.label || "Participante";
}

function renderIntention(text, { id, className, hidden = false } = {}) {
  const intention = element("p", {
    className,
    attributes: { id, hidden: hidden ? "" : null },
  });
  appendChildren(
    intention,
    element("strong", { text: "Intenção: " }),
    document.createTextNode(text),
  );
  return intention;
}

function renderVisibleTurn(category, turn) {
  return [
    element("p", {
      className: "target-text",
      text: turn.targetText,
      attributes: { lang: category.targetLanguage },
    }),
    element("p", {
      className: "translation",
      text: turn.translation,
      attributes: { lang: category.supportLanguage },
    }),
  ];
}

function disclosureButton({ label, expandedLabel, expanded, panelId, turnId, control, onClick }) {
  return button(
    expanded ? expandedLabel : label,
    onClick,
    "reveal-button",
    {
      "aria-controls": panelId,
      "aria-expanded": expanded,
      "data-turn-id": turnId,
      "data-control": control,
    },
  );
}

function renderAlternatives(category, turn, reveal, actions) {
  if (!turn.alternatives?.length) return [];

  const panelId = `${turn.id}-alternatives`;
  const control = disclosureButton({
    label: "Ver outras respostas",
    expandedLabel: "Ocultar outras respostas",
    expanded: reveal.alternativesVisible,
    panelId,
    turnId: turn.id,
    control: "alternatives",
    onClick: () => actions.toggleTurnDetail(turn.id, "alternativesVisible"),
  });
  const panel = element("section", {
    className: "alternatives-panel",
    attributes: {
      id: panelId,
      hidden: reveal.alternativesVisible ? null : "",
      "aria-label": "Outras respostas naturais",
    },
  });
  panel.append(element("h3", { text: "Outras respostas naturais" }));
  const list = element("ul", { className: "alternatives-list" });
  turn.alternatives.forEach((alternative) => {
    const item = element("li", { className: "alternative-item" });
    appendChildren(
      item,
      element("p", {
        className: "alternative-target",
        text: alternative.targetText,
        attributes: { lang: category.targetLanguage },
      }),
      element("p", {
        className: "alternative-translation",
        text: alternative.translation,
        attributes: { lang: category.supportLanguage },
      }),
    );
    if (alternative.note) item.append(element("p", { className: "alternative-note", text: alternative.note }));
    list.append(item);
  });
  panel.append(list);
  return [control, panel];
}

function renderNote(turn, reveal, actions) {
  if (!turn.note) return [];

  const panelId = `${turn.id}-note`;
  return [
    disclosureButton({
      label: "Ver nota",
      expandedLabel: "Ocultar nota",
      expanded: reveal.noteVisible,
      panelId,
      turnId: turn.id,
      control: "note",
      onClick: () => actions.toggleTurnDetail(turn.id, "noteVisible"),
    }),
    element("p", {
      className: "note-panel",
      text: turn.note,
      attributes: { id: panelId, hidden: reveal.noteVisible ? null : "" },
    }),
  ];
}

function renderPracticeTurn(category, turn, reveal, actions) {
  const content = element("div", { className: "practice-content" });
  appendChildren(
    content,
    element("p", { className: "practice-prompt", text: "Sua vez" }),
    element("p", {
      className: "practice-instruction",
      text: "Pense no que você diria. Consulte uma pista ou revele a resposta quando quiser.",
    }),
  );

  const controls = element("div", { className: "reveal-controls", attributes: { "aria-label": "Pistas deste turno" } });
  const intentionId = `${turn.id}-intention`;
  const translationId = `${turn.id}-translation`;
  const answerId = `${turn.id}-answer`;

  controls.append(
    disclosureButton({
      label: "Ver intenção",
      expandedLabel: "Ocultar intenção",
      expanded: reveal.intentionVisible,
      panelId: intentionId,
      turnId: turn.id,
      control: "intention",
      onClick: () => actions.toggleTurnDetail(turn.id, "intentionVisible"),
    }),
    disclosureButton({
      label: "Ver português",
      expandedLabel: "Ocultar português",
      expanded: reveal.translationVisible,
      panelId: translationId,
      turnId: turn.id,
      control: "translation",
      onClick: () => actions.toggleTurnDetail(turn.id, "translationVisible"),
    }),
    disclosureButton({
      label: "Revelar resposta",
      expandedLabel: "Ocultar resposta",
      expanded: reveal.answerVisible,
      panelId: answerId,
      turnId: turn.id,
      control: "answer",
      onClick: () => actions.toggleTurnDetail(turn.id, "answerVisible"),
    }),
  );
  content.append(controls);

  content.append(renderIntention(turn.intention, {
    id: intentionId,
    className: "reveal-panel intention-panel",
    hidden: !reveal.intentionVisible,
  }));
  content.append(element("p", {
    className: "reveal-panel translation-panel",
    text: turn.translation,
    attributes: {
      id: translationId,
      lang: category.supportLanguage,
      hidden: reveal.translationVisible ? null : "",
    },
  }));

  const answer = element("section", {
    className: "answer-panel",
    attributes: { id: answerId, hidden: reveal.answerVisible ? null : "", "aria-label": "Resposta principal" },
  });
  appendChildren(
    answer,
    element("p", { className: "reveal-label", text: "Resposta principal" }),
    element("p", {
      className: "target-text",
      text: turn.targetText,
      attributes: { lang: category.targetLanguage },
    }),
  );

  const afterAnswerControls = element("div", { className: "after-answer-controls" });
  const alternatives = renderAlternatives(category, turn, reveal, actions);
  const note = renderNote(turn, reveal, actions);
  if (alternatives.length) afterAnswerControls.append(alternatives[0]);
  if (note.length) afterAnswerControls.append(note[0]);
  if (afterAnswerControls.childElementCount) answer.append(afterAnswerControls);
  if (alternatives.length) answer.append(alternatives[1]);
  if (note.length) answer.append(note[1]);

  content.append(answer);
  return content;
}

function renderReusableStructures(category, dialogue, expanded, actions) {
  const section = element("section", {
    className: "structures-section",
    attributes: { "aria-labelledby": "structures-heading" },
  });
  const headingRow = element("div", { className: "structures-heading-row" });
  const headingCopy = element("div");
  appendChildren(
    headingCopy,
    element("p", { className: "eyebrow", text: "Para usar em outras conversas" }),
    element("h2", { text: "Estruturas reutilizáveis", attributes: { id: "structures-heading" } }),
  );
  const panelId = "reusable-structures-panel";
  headingRow.append(
    headingCopy,
    button(expanded ? "Recolher estruturas" : "Ver estruturas", actions.toggleReusableStructures, "secondary-button structures-toggle", {
      "aria-controls": panelId,
      "aria-expanded": expanded,
      "data-control": "reusable-structures",
    }),
  );
  section.append(headingRow);

  const panel = element("div", {
    className: "structures-panel",
    attributes: { id: panelId, hidden: expanded ? null : "" },
  });
  if (!dialogue.reusableStructures?.length) {
    panel.append(element("p", { className: "empty-structures", text: "Este diálogo não possui estruturas adicionais." }));
  } else {
    const list = element("ul", { className: "structures-list" });
    dialogue.reusableStructures.forEach((structure) => {
      const item = element("li", { className: "structure-card" });
      appendChildren(
        item,
        element("p", {
          className: "structure-target",
          text: structure.targetText,
          attributes: { lang: category.targetLanguage },
        }),
        structure.translation ? element("p", {
          className: "structure-translation",
          text: structure.translation,
          attributes: { lang: category.supportLanguage },
        }) : null,
        element("p", { className: "structure-example-label", text: "Outro exemplo" }),
        element("p", {
          className: "structure-example-target",
          text: structure.exampleTarget,
          attributes: { lang: category.targetLanguage },
        }),
        structure.exampleTranslation ? element("p", {
          className: "structure-example-translation",
          text: structure.exampleTranslation,
          attributes: { lang: category.supportLanguage },
        }) : null,
      );
      list.append(item);
    });
    panel.append(list);
  }
  section.append(panel);
  return section;
}

function renderStudy(category, dialogue, state, actions) {
  const wrapper = document.createDocumentFragment();
  wrapper.append(breadcrumbs([
    { label: "Categorias", hash: "#/categories" },
    { label: category.title, hash: `#/category/${encodeURIComponent(category.id)}` },
    { label: dialogue.title },
  ]));

  const participantsById = new Map(category.participants.map((participant) => [participant.id, participant]));
  const layout = element("article", { className: "study-layout", attributes: { "aria-labelledby": "dialogue-title" } });
  const header = element("header", { className: "study-header" });
  const isPractice = state.studyMode === "practice";
  const title = pageHeading(isPractice ? "Modo de prática" : "Modo de leitura", dialogue.title);
  header.append(title);
  header.querySelector("h1").id = "dialogue-title";
  header.append(element("p", { className: "study-context", text: dialogue.context }));

  const toolbar = element("div", { className: "study-toolbar" });
  const modeSwitch = element("div", {
    className: "mode-switch",
    attributes: { role: "group", "aria-label": "Modo de estudo" },
  });
  modeSwitch.append(
    button("Prática", () => actions.setStudyMode("practice"), "mode-option", {
      "aria-pressed": isPractice,
      "data-control": "mode-practice",
    }),
    button("Leitura", () => actions.setStudyMode("reading"), "mode-option", {
      "aria-pressed": !isPractice,
      "data-control": "mode-reading",
    }),
  );
  toolbar.append(modeSwitch);
  if (isPractice) {
    toolbar.append(button("Reiniciar revelações", actions.resetDialogue, "secondary-button reset-button", {
      "data-control": "reset-dialogue",
    }));
  }
  header.append(toolbar);

  const meta = element("div", { className: "study-meta" });
  meta.append(element("span", {
    className: "mode-badge",
    text: isPractice ? "Suas falas estão ocultas" : "Todas as falas estão visíveis",
  }));
  const participantList = element("ul", { className: "participant-list", attributes: { "aria-label": "Participantes" } });
  dialogue.participantIds.forEach((participantId) => {
    const participant = participantsById.get(participantId);
    participantList.append(element("li", {
      className: "participant-chip",
      text: participantLabel(participant),
      attributes: { "data-role": participant?.role },
    }));
  });
  meta.append(participantList);
  header.append(meta);

  const turnList = element("ol", { className: "turn-list", attributes: { "aria-label": "Falas do diálogo" } });
  dialogue.turns.forEach((turn, index) => {
    const participant = participantsById.get(turn.speakerId);
    const item = element("li", {
      className: `turn-item${isPractice && turn.isLearnerTurn ? " learner-turn" : ""}`,
      attributes: {
        "data-role": turn.speakerRole,
        "data-turn-id": turn.id,
        "data-state": isPractice && turn.isLearnerTurn ? "hidden" : "visible",
      },
    });
    const speakerRow = element("div", { className: "speaker-row" });
    appendChildren(
      speakerRow,
      element("span", { className: "speaker-label", text: participantLabel(participant) }),
      element("span", { className: "turn-position", text: `${index + 1} de ${dialogue.turns.length}` }),
    );

    item.append(speakerRow);
    if (isPractice && turn.isLearnerTurn) {
      item.append(renderPracticeTurn(category, turn, state.revealsByTurn[turn.id] || {}, actions));
    } else {
      item.append(...renderVisibleTurn(category, turn));
    }
    turnList.append(item);
  });

  const footer = element("footer", { className: "study-footer-actions" });
  footer.append(renderReusableStructures(
    category,
    dialogue,
    state.reusableStructuresVisible,
    actions,
  ));
  footer.append(button("Voltar ao início", () => window.scrollTo({ top: 0, behavior: "smooth" }), "secondary-button"));

  layout.append(header, turnList, footer);
  wrapper.append(layout);
  return wrapper;
}

function renderRouteError(state, actions) {
  const card = element("section", {
    className: "state-card",
    attributes: { "data-state": "error", "aria-labelledby": "route-error-title" },
  });
  appendChildren(
    card,
    element("div", { className: "state-symbol", text: "?", attributes: { "aria-hidden": "true" } }),
    element("h1", {
      text: "Este endereço não corresponde a um diálogo",
      attributes: { id: "route-error-title" },
    }),
    element("p", { text: state.error?.message || "A página pode ter sido removida ou o endereço está incompleto." }),
    element("div", { className: "state-actions" }),
  );
  card.querySelector(".state-actions").append(button("Ver categorias", () => actions.navigate("#/categories")));
  return card;
}

export function renderApp(root, state, actions) {
  root.replaceChildren();

  if (state.status === "loading" || state.status === "idle") {
    root.append(renderLoading(state));
    return;
  }

  if (state.status === "error") {
    root.append(renderError(state, actions));
    return;
  }

  if (state.status === "route-error") {
    root.append(renderRouteError(state, actions));
    return;
  }

  if (state.route.view === "categories") {
    root.append(renderCategories(state.manifest, actions));
    return;
  }

  if (state.route.view === "category") {
    root.append(renderCategory(state.category, actions));
    return;
  }

  const dialogue = state.category.dialogues.find(({ id }) => id === state.route.dialogueId);
  root.append(renderStudy(state.category, dialogue, state, actions));
}
