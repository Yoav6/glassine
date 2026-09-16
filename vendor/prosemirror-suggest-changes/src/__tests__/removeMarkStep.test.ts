/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { RemoveMarkStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { trackAddMarkStep } from "../addMarkStep.js";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";

describe("RemoveMarkStep", () => {
  it("should treat a remove mark as a standard replace", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(testBuilders.strong("<a>first<b>"), " paragraph"),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.near(doc.resolve(doc.tag["a"]!)),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.removeMark(
      doc.tag["a"]!,
      doc.tag["b"]!,
      testBuilders.schema.marks.strong.create(),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof RemoveMarkStep,
      "Could not create test RemoveMarkStep",
    );

    const trackedTransaction = editorState.tr;
    trackAddMarkStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, testBuilders.strong("first")),
        testBuilders.insertion({ id: 1 }, "first"),
        " paragraph",
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should handle overlapping deletions", () => {
    const doc = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, testBuilders.strong("<a>fi")),
        testBuilders.strong("rst<b>"),
        " paragraph",
      ),
      testBuilders.paragraph("second paragraph"),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.near(doc.resolve(doc.tag["a"]!)),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.removeMark(
      doc.tag["a"]!,
      doc.tag["b"]!,
      testBuilders.schema.marks.strong.create(),
    );
    const step = originalTransaction.steps[0];
    assert(
      step instanceof RemoveMarkStep,
      "Could not create test RemoveMarkStep",
    );

    const trackedTransaction = editorState.tr;
    trackAddMarkStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.paragraph(
        testBuilders.deletion({ id: 1 }, testBuilders.strong("first")),
        testBuilders.insertion({ id: 1 }, "rst"),
        " paragraph",
      ),
      testBuilders.paragraph("second paragraph"),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });
});
