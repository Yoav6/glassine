/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { RemoveNodeMarkStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { suggestRemoveNodeMarkStep } from "../removeNodeMarkStep.js";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";

describe("RemoveNodeMarkStep", () => {
  it("should add a modification mark", () => {
    const doc = testBuilders.doc(
      testBuilders.difficulty(
        { level: "beginner" },
        testBuilders.paragraph("first paragraph"),
      ),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atStart(doc),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.removeNodeMark(
      0,
      testBuilders.schema.marks.difficulty.create({
        level: "beginner",
      }),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof RemoveNodeMarkStep,
      "Could not create test RemoveNodeMark",
    );

    const trackedTransaction = editorState.tr;
    suggestRemoveNodeMarkStep(
      trackedTransaction,
      editorState,
      doc,
      step,
      [],
      1,
    );

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "mark",
          previousValue: step.mark.toJSON(),
          newValue: null,
        },
        testBuilders.paragraph("first paragraph"),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should remove already-modified marks", () => {
    const doc = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "mark",
          previousValue: null,
          newValue: testBuilders.schema.marks.difficulty
            .create({
              level: "beginner",
            })
            .toJSON(),
        },
        testBuilders.difficulty(
          { level: "beginner" },
          testBuilders.paragraph("first paragraph"),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atStart(doc),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.removeNodeMark(
      0,
      testBuilders.schema.marks.difficulty.create({
        level: "beginner",
      }),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof RemoveNodeMarkStep,
      "Could not create test RemoveNodeMark",
    );

    const trackedTransaction = editorState.tr;
    suggestRemoveNodeMarkStep(
      trackedTransaction,
      editorState,
      doc,
      step,
      [],
      1,
    );

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });
});
