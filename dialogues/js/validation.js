const SUPPORTED_SCHEMA_VERSION = 1;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-[0-9]{3})?$/;
const DIALOGUE_TYPES = new Set(["core", "common_variation", "occasional_event"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIdentifier(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function issue(code, message, path) {
  return { code, message, path, severity: "fatal" };
}

function requireObject(value, path, errors) {
  if (isObject(value)) return true;
  errors.push(issue("EXPECTED_OBJECT", "Era esperado um objeto.", path));
  return false;
}

function requireArray(value, path, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) {
    errors.push(issue("EXPECTED_ARRAY", "Era esperado um array.", path));
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    errors.push(issue("EMPTY_ARRAY", "O array não pode estar vazio.", path));
    return false;
  }
  return true;
}

function requireText(value, path, errors) {
  if (isNonEmptyText(value)) return true;
  errors.push(issue("EXPECTED_NON_EMPTY_TEXT", "Era esperado um texto não vazio.", path));
  return false;
}

function requireId(value, path, errors) {
  if (isIdentifier(value)) return true;
  errors.push(issue("INVALID_IDENTIFIER", "O identificador deve estar em kebab-case ASCII.", path));
  return false;
}

function checkSchemaVersion(value, path, errors) {
  if (value === SUPPORTED_SCHEMA_VERSION) return;
  errors.push(issue(
    "UNSUPPORTED_SCHEMA_VERSION",
    `A versão do formato deve ser ${SUPPORTED_SCHEMA_VERSION}.`,
    path,
  ));
}

function checkLanguageTag(value, path, errors) {
  if (typeof value === "string" && LANGUAGE_TAG_PATTERN.test(value)) return;
  errors.push(issue("INVALID_LANGUAGE_TAG", "Era esperada uma tag de idioma BCP 47 compatível.", path));
}

function checkUniqueIds(items, path, errors) {
  const seen = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const id = items[index]?.id;
    if (!isIdentifier(id)) continue;
    if (seen.has(id)) {
      errors.push(issue("DUPLICATE_IDENTIFIER", `O identificador “${id}” está duplicado.`, `${path}[${index}].id`));
    }
    seen.add(id);
  }
}

function validateAlternative(alternative, path, errors) {
  if (!requireObject(alternative, path, errors)) return;
  requireText(alternative.targetText, `${path}.targetText`, errors);
  requireText(alternative.translation, `${path}.translation`, errors);
  if (alternative.note !== undefined) requireText(alternative.note, `${path}.note`, errors);
}

function validateReusableStructure(structure, path, errors) {
  if (!requireObject(structure, path, errors)) return;
  requireText(structure.targetText, `${path}.targetText`, errors);
  requireText(structure.exampleTarget, `${path}.exampleTarget`, errors);
  if (structure.translation !== undefined) requireText(structure.translation, `${path}.translation`, errors);
  if (structure.exampleTranslation !== undefined) {
    requireText(structure.exampleTranslation, `${path}.exampleTranslation`, errors);
  }
}

/**
 * Valida o manifesto necessário para a aplicação em tempo de execução.
 * @param {unknown} manifest
 * @returns {{valid: boolean, errors: Array<object>, warnings: Array<object>}}
 */
export function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!requireObject(manifest, "$", errors)) return { valid: false, errors, warnings };

  checkSchemaVersion(manifest.schemaVersion, "$.schemaVersion", errors);
  checkLanguageTag(manifest.targetLanguage, "$.targetLanguage", errors);
  checkLanguageTag(manifest.supportLanguage, "$.supportLanguage", errors);

  if (requireArray(manifest.categories, "$.categories", errors)) {
    checkUniqueIds(manifest.categories, "$.categories", errors);

    manifest.categories.forEach((category, index) => {
      const path = `$.categories[${index}]`;
      if (!requireObject(category, path, errors)) return;
      requireId(category.id, `${path}.id`, errors);
      requireText(category.title, `${path}.title`, errors);
      requireId(category.practiceRole, `${path}.practiceRole`, errors);

      if (category.description !== undefined) {
        requireText(category.description, `${path}.description`, errors);
      }

      const safeDataFile = typeof category.dataFile === "string"
        && category.dataFile.endsWith(".json")
        && !category.dataFile.startsWith("/")
        && !category.dataFile.includes("..")
        && !/^[a-z][a-z0-9+.-]*:/i.test(category.dataFile);
      if (!safeDataFile) {
        errors.push(issue(
          "INVALID_DATA_FILE",
          "O arquivo da categoria deve ser um caminho JSON local e relativo.",
          `${path}.dataFile`,
        ));
      }

      if (!Number.isInteger(category.dialogueCount) || category.dialogueCount < 0) {
        errors.push(issue(
          "INVALID_DIALOGUE_COUNT",
          "A quantidade de diálogos deve ser um inteiro não negativo.",
          `${path}.dialogueCount`,
        ));
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Valida uma categoria e suas regras referenciais.
 * @param {unknown} category
 * @param {object} [context]
 * @param {object} [context.manifestEntry]
 * @param {object} [context.manifest]
 * @returns {{valid: boolean, errors: Array<object>, warnings: Array<object>}}
 */
export function validateCategory(category, { manifestEntry, manifest } = {}) {
  const errors = [];
  const warnings = [];

  if (!requireObject(category, "$", errors)) return { valid: false, errors, warnings };

  checkSchemaVersion(category.schemaVersion, "$.schemaVersion", errors);
  requireId(category.id, "$.id", errors);
  requireText(category.title, "$.title", errors);
  requireText(category.description, "$.description", errors);
  checkLanguageTag(category.targetLanguage, "$.targetLanguage", errors);
  checkLanguageTag(category.supportLanguage, "$.supportLanguage", errors);
  requireId(category.practiceRole, "$.practiceRole", errors);

  if (manifestEntry) {
    const comparisons = [
      ["id", category.id, manifestEntry.id],
      ["practiceRole", category.practiceRole, manifestEntry.practiceRole],
    ];
    for (const [field, actual, expected] of comparisons) {
      if (actual !== expected) {
        errors.push(issue("MANIFEST_MISMATCH", `O campo ${field} diverge do manifesto.`, `$.${field}`));
      }
    }
  }

  if (manifest) {
    for (const field of ["targetLanguage", "supportLanguage"]) {
      if (category[field] !== manifest[field]) {
        errors.push(issue("MANIFEST_MISMATCH", `O campo ${field} diverge do manifesto.`, `$.${field}`));
      }
    }
  }

  const participantsById = new Map();
  if (requireArray(category.participants, "$.participants", errors, { allowEmpty: false })) {
    checkUniqueIds(category.participants, "$.participants", errors);
    category.participants.forEach((participant, index) => {
      const path = `$.participants[${index}]`;
      if (!requireObject(participant, path, errors)) return;
      requireId(participant.id, `${path}.id`, errors);
      requireId(participant.role, `${path}.role`, errors);
      requireText(participant.label, `${path}.label`, errors);
      if (isIdentifier(participant.id)) participantsById.set(participant.id, participant);
    });

    if (![...participantsById.values()].some(({ role }) => role === category.practiceRole)) {
      errors.push(issue(
        "PRACTICE_ROLE_NOT_FOUND",
        "Nenhum participante possui o papel praticado pela categoria.",
        "$.practiceRole",
      ));
    }
  }

  const globalTurnIds = new Set();
  if (requireArray(category.dialogues, "$.dialogues", errors)) {
    checkUniqueIds(category.dialogues, "$.dialogues", errors);

    if (manifestEntry && Number.isInteger(manifestEntry.dialogueCount)
      && category.dialogues.length !== manifestEntry.dialogueCount) {
      errors.push(issue(
        "DIALOGUE_COUNT_MISMATCH",
        "A quantidade de diálogos diverge do manifesto.",
        "$.dialogues",
      ));
    }

    category.dialogues.forEach((dialogue, dialogueIndex) => {
      const path = `$.dialogues[${dialogueIndex}]`;
      if (!requireObject(dialogue, path, errors)) return;
      requireId(dialogue.id, `${path}.id`, errors);
      requireText(dialogue.title, `${path}.title`, errors);
      requireText(dialogue.context, `${path}.context`, errors);

      if (!DIALOGUE_TYPES.has(dialogue.type)) {
        errors.push(issue("INVALID_DIALOGUE_TYPE", "O tipo do diálogo é desconhecido.", `${path}.type`));
      }

      const dialogueParticipantIds = new Set();
      if (requireArray(dialogue.participantIds, `${path}.participantIds`, errors, { allowEmpty: false })) {
        dialogue.participantIds.forEach((participantId, index) => {
          const participantPath = `${path}.participantIds[${index}]`;
          requireId(participantId, participantPath, errors);
          if (dialogueParticipantIds.has(participantId)) {
            errors.push(issue("DUPLICATE_PARTICIPANT_REFERENCE", "O participante está repetido no diálogo.", participantPath));
          }
          if (!participantsById.has(participantId)) {
            errors.push(issue("PARTICIPANT_NOT_FOUND", "O participante não existe na categoria.", participantPath));
          }
          dialogueParticipantIds.add(participantId);
        });
      }

      if (dialogue.tags !== undefined && requireArray(dialogue.tags, `${path}.tags`, errors)) {
        const tags = new Set();
        dialogue.tags.forEach((tag, index) => {
          const tagPath = `${path}.tags[${index}]`;
          requireId(tag, tagPath, errors);
          if (tags.has(tag)) errors.push(issue("DUPLICATE_TAG", "A etiqueta está duplicada.", tagPath));
          tags.add(tag);
        });
      }

      let learnerTurnCount = 0;
      if (requireArray(dialogue.turns, `${path}.turns`, errors, { allowEmpty: false })) {
        dialogue.turns.forEach((turn, turnIndex) => {
          const turnPath = `${path}.turns[${turnIndex}]`;
          if (!requireObject(turn, turnPath, errors)) return;
          requireId(turn.id, `${turnPath}.id`, errors);
          requireId(turn.speakerId, `${turnPath}.speakerId`, errors);
          requireId(turn.speakerRole, `${turnPath}.speakerRole`, errors);
          requireText(turn.targetText, `${turnPath}.targetText`, errors);
          requireText(turn.translation, `${turnPath}.translation`, errors);
          requireText(turn.intention, `${turnPath}.intention`, errors);
          if (turn.note !== undefined) requireText(turn.note, `${turnPath}.note`, errors);

          if (typeof turn.isLearnerTurn !== "boolean") {
            errors.push(issue("INVALID_LEARNER_FLAG", "isLearnerTurn deve ser booleano.", `${turnPath}.isLearnerTurn`));
          } else if (turn.isLearnerTurn) {
            learnerTurnCount += 1;
          }

          if (globalTurnIds.has(turn.id)) {
            errors.push(issue("DUPLICATE_TURN_ID", `O turno “${turn.id}” está duplicado.`, `${turnPath}.id`));
          }
          if (isIdentifier(turn.id)) globalTurnIds.add(turn.id);

          const participant = participantsById.get(turn.speakerId);
          if (!participant) {
            errors.push(issue("TURN_PARTICIPANT_NOT_FOUND", "O participante do turno não existe.", `${turnPath}.speakerId`));
          } else {
            if (!dialogueParticipantIds.has(turn.speakerId)) {
              errors.push(issue("TURN_PARTICIPANT_NOT_IN_DIALOGUE", "O participante do turno não integra o diálogo.", `${turnPath}.speakerId`));
            }
            if (turn.speakerRole !== participant.role) {
              errors.push(issue("SPEAKER_ROLE_MISMATCH", "O papel do turno diverge do participante.", `${turnPath}.speakerRole`));
            }
            const expectedLearnerTurn = participant.role === category.practiceRole;
            if (turn.isLearnerTurn !== expectedLearnerTurn) {
              errors.push(issue("LEARNER_FLAG_MISMATCH", "isLearnerTurn diverge do papel praticado.", `${turnPath}.isLearnerTurn`));
            }
          }

          if (turn.alternatives !== undefined) {
            if (turn.isLearnerTurn !== true) {
              errors.push(issue(
                "ALTERNATIVES_ON_NON_LEARNER_TURN",
                "Alternativas só podem pertencer a um turno praticado.",
                `${turnPath}.alternatives`,
              ));
            }
            if (requireArray(turn.alternatives, `${turnPath}.alternatives`, errors, { allowEmpty: false })) {
              turn.alternatives.forEach((alternative, alternativeIndex) => {
                validateAlternative(alternative, `${turnPath}.alternatives[${alternativeIndex}]`, errors);
              });
            }
          }
        });
      }

      if (learnerTurnCount === 0) {
        errors.push(issue("NO_LEARNER_TURN", "O diálogo deve ter pelo menos um turno praticado.", `${path}.turns`));
      }

      if (requireArray(dialogue.reusableStructures, `${path}.reusableStructures`, errors)) {
        dialogue.reusableStructures.forEach((structure, structureIndex) => {
          validateReusableStructure(structure, `${path}.reusableStructures[${structureIndex}]`, errors);
        });
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export { SUPPORTED_SCHEMA_VERSION };
