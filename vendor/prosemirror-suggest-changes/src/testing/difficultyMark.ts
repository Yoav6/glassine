import { type MarkSpec } from "prosemirror-model";

export const difficulty: MarkSpec = {
  attrs: {
    level: { default: "beginner" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="difficulty"]',
      getAttrs(dom) {
        if (!(dom instanceof HTMLElement)) return {};
        return {
          level: dom.dataset["difficultyLevel"],
        };
      },
    },
  ],
  toDOM(mark) {
    const { level } = mark.attrs;
    return [
      "div",
      { "data-type": "difficulty", "data-difficulty-level": level as string },
      0,
    ];
  },
};
