/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { AddNodeMarkStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { trackAddNodeMarkStep } from "../addNodeMarkStep.js";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";

describe("AddNodeMarkStep", () => {
  it("should add a modification mark", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph("first paragraph"),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atStart(doc),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.addNodeMark(
      0,
      testBuilders.schema.marks.difficulty.create({
        level: "beginner",
      }),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof AddNodeMarkStep,
      "Could not create test AddNodeMarkStep",
    );

    const trackedTransaction = editorState.tr;
    trackAddNodeMarkStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "mark",
          previousValue: null,
          newValue: step.mark.toJSON(),
        },
        testBuilders.difficulty(
          { level: "beginner" },
          testBuilders.paragraph("first paragraph"),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should replace incompatible modification marks", () => {
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
          { level: "advanced" },
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

    originalTransaction.addNodeMark(
      0,
      testBuilders.schema.marks.difficulty.create({
        level: "advanced",
      }),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof AddNodeMarkStep,
      "Could not create test AddNodeMarkStep",
    );

    const trackedTransaction = editorState.tr;
    trackAddNodeMarkStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "mark",
          previousValue: null,
          newValue: step.mark.toJSON(),
        },
        testBuilders.difficulty(
          { level: "advanced" },
          testBuilders.paragraph("first paragraph"),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should replace incompatible marks", () => {
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

    originalTransaction.addNodeMark(
      0,
      testBuilders.schema.marks.difficulty.create({
        level: "advanced",
      }),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof AddNodeMarkStep,
      "Could not create test AddNodeMarkStep",
    );

    const trackedTransaction = editorState.tr;
    trackAddNodeMarkStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "mark",
          previousValue: testBuilders.schema.marks.difficulty
            .create({ level: "beginner" })
            .toJSON(),
          newValue: step.mark.toJSON(),
        },
        testBuilders.difficulty(
          { level: "advanced" },
          testBuilders.paragraph("first paragraph"),
        ),
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });
});
