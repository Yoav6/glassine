/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { EditorState, TextSelection } from "prosemirror-state";
import { eq } from "prosemirror-test-builder";
import { AttrStep } from "prosemirror-transform";
import { assert, describe, it } from "vitest";

import { trackAttrStep } from "../attrStep.js";

import { type TaggedNode, testBuilders } from "../testing/testBuilders.js";

describe("AttrStep", () => {
  it("should add a modification mark", () => {
    const doc = testBuilders.doc(
      testBuilders.image({ src: "https://dskrpt.de/test-image" }),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atStart(doc),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.setNodeAttribute(
      0,
      "src",
      "https://dskrpt.de/test-image-2",
    );
    const step = originalTransaction.steps[0];
    assert(step instanceof AttrStep, "Could not create test AttrStep");

    const trackedTransaction = editorState.tr;
    trackAttrStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "attr",
          attrName: "src",
          previousValue: "https://dskrpt.de/test-image",
          newValue: "https://dskrpt.de/test-image-2",
        },
        testBuilders.image({ src: "https://dskrpt.de/test-image-2" }),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });

  it("should replace existing modification mark", () => {
    const doc = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "attr",
          attrName: "src",
          previousValue: "https://dskrpt.de/test-image",
          newValue: "https://dskrpt.de/test-image-2",
        },
        testBuilders.image({ src: "https://dskrpt.de/test-image-2" }),
      ),
    ) as TaggedNode;

    const editorState = EditorState.create({
      doc,
      selection: TextSelection.atStart(doc),
    });

    const originalTransaction = editorState.tr;

    originalTransaction.setNodeAttribute(
      0,
      "src",
      "https://dskrpt.de/test-image",
    );
    const step = originalTransaction.steps[0];
    assert(step instanceof AttrStep, "Could not create test AttrStep");

    const trackedTransaction = editorState.tr;
    trackAttrStep(trackedTransaction, editorState, doc, step, [], 1);

    const trackedState = editorState.apply(trackedTransaction);

    const expected = testBuilders.doc(
      testBuilders.modification(
        {
          id: 1,
          type: "attr",
          attrName: "src",
          previousValue: "https://dskrpt.de/test-image-2",
          newValue: "https://dskrpt.de/test-image",
        },
        testBuilders.image({ src: "https://dskrpt.de/test-image" }),
      ),
    );

    assert(
      eq(trackedState.doc, expected),
      `Expected ${trackedState.doc} to match ${expected}`,
    );
  });
});
