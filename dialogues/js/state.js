export const initialState = Object.freeze({
  status: "idle",
  route: { view: "categories", categoryId: null, dialogueId: null },
  manifest: null,
  category: null,
  categoryEntry: null,
  studyMode: "practice",
  revealsByTurn: {},
  reusableStructuresVisible: false,
  error: null,
});

export const EMPTY_TURN_REVEAL = Object.freeze({
  intentionVisible: false,
  translationVisible: false,
  answerVisible: false,
  alternativesVisible: false,
  noteVisible: false,
});

export function getTurnReveal(revealsByTurn, turnId) {
  return revealsByTurn[turnId] || EMPTY_TURN_REVEAL;
}

export function createStore(startingState = initialState) {
  let state = { ...startingState };
  const listeners = new Set();

  return {
    getState() {
      return state;
    },

    setState(update) {
      const nextState = typeof update === "function" ? update(state) : update;
      state = { ...state, ...nextState };
      listeners.forEach((listener) => listener(state));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
