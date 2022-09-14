import { ReplaceStep, Transform } from 'prosemirror-transform';
import { createPatch, applyPatch } from 'rfc6902';
import { diffWordsWithSpace, diffChars } from 'diff';

function getReplaceStep(fromDoc, toDoc) {
  let start = toDoc.content.findDiffStart(fromDoc.content);
  if (start === null) {
    return false;
  }
  let { a: endA, b: endB } = toDoc.content.findDiffEnd(fromDoc.content);
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    if (fromDoc.resolve(start - overlap).depth < toDoc.resolve(endA + overlap).depth) {
      start -= overlap;
    } else {
      endA += overlap;
      endB += overlap;
    }
  }
  return new ReplaceStep(start, endB, toDoc.slice(start, endA));
}

function simplifyTransform(tr) {
  if (!tr.steps.length) {
    return void 0;
  }
  const newTr = new Transform(tr.docs[0]);
  const oldSteps = tr.steps.slice();
  while (oldSteps.length) {
    let step = oldSteps.shift();
    while (oldSteps.length && step.merge(oldSteps[0])) {
      const addedStep = oldSteps.shift();
      if (step instanceof ReplaceStep && addedStep instanceof ReplaceStep) {
        step = getReplaceStep(
          newTr.doc,
          addedStep.apply(step.apply(newTr.doc).doc).doc
        );
      } else {
        step = step.merge(addedStep);
      }
    }
    newTr.step(step);
  }
  return newTr;
}

function removeMarks(doc) {
  const tr = new Transform(doc);
  tr.removeMark(0, doc.nodeSize - 2);
  return tr.doc;
}

function getFromPath(obj, path) {
  const pathParts = path.split("/");
  pathParts.shift();
  while (pathParts.length) {
    if (typeof obj != "object") {
      throw new Error();
    }
    const property = pathParts.shift();
    obj = obj[property];
  }
  return obj;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

class RecreateTransform {
  fromDoc;
  toDoc;
  complexSteps;
  wordDiffs;
  simplifyDiff;
  schema;
  tr;
  currentJSON;
  finalJSON;
  ops;
  constructor(fromDoc, toDoc, options = {}) {
    const o = {
      complexSteps: true,
      wordDiffs: false,
      simplifyDiff: true,
      ...options
    };
    this.fromDoc = fromDoc;
    this.toDoc = toDoc;
    this.complexSteps = o.complexSteps;
    this.wordDiffs = o.wordDiffs;
    this.simplifyDiff = o.simplifyDiff;
    this.schema = fromDoc.type.schema;
    this.tr = new Transform(fromDoc);
    this.currentJSON = {};
    this.finalJSON = {};
    this.ops = [];
  }
  init() {
    if (this.complexSteps) {
      this.currentJSON = removeMarks(this.fromDoc).toJSON();
      this.finalJSON = removeMarks(this.toDoc).toJSON();
      this.ops = createPatch(this.currentJSON, this.finalJSON);
      this.recreateChangeContentSteps();
      this.recreateChangeMarkSteps();
    } else {
      this.currentJSON = this.fromDoc.toJSON();
      this.finalJSON = this.toDoc.toJSON();
      this.ops = createPatch(this.currentJSON, this.finalJSON);
      this.recreateChangeContentSteps();
    }
    if (this.simplifyDiff) {
      this.tr = simplifyTransform(this.tr) || this.tr;
    }
    return this.tr;
  }
  recreateChangeContentSteps() {
    let ops = [];
    while (this.ops.length) {
      let op = this.ops.shift();
      ops.push(op);
      let toDoc;
      const afterStepJSON = copy(this.currentJSON);
      const pathParts = op.path.split("/");
      while (toDoc == null) {
        applyPatch(afterStepJSON, [op]);
        try {
          toDoc = this.schema.nodeFromJSON(afterStepJSON);
          toDoc.check();
        } catch (error) {
          toDoc = null;
          if (this.ops.length > 0) {
            op = this.ops.shift();
            ops.push(op);
          } else {
            throw new Error(
              `No valid diff possible applying ${op.path}`
            );
          }
        }
      }
      if (this.complexSteps && ops.length === 1 && (pathParts.includes("attrs") || pathParts.includes("type"))) {
        this.addSetNodeMarkup();
        ops = [];
      } else if (ops.length === 1 && op.op === "replace" && pathParts[pathParts.length - 1] === "text") {
        this.addReplaceTextSteps(op, afterStepJSON);
        ops = [];
      } else if (this.addReplaceStep(toDoc, afterStepJSON)) {
        ops = [];
      }
    }
  }
  addSetNodeMarkup() {
    const fromDoc = this.schema.nodeFromJSON(this.currentJSON);
    const toDoc = this.schema.nodeFromJSON(this.finalJSON);
    const start = toDoc.content.findDiffStart(fromDoc.content);
    const fromNode = fromDoc.nodeAt(start);
    const toNode = toDoc.nodeAt(start);
    if (start != null) {
      const nodeType = fromNode.type === toNode.type ? null : toNode.type;
      try {
        this.tr.setNodeMarkup(
          start,
          nodeType,
          toNode.attrs,
          toNode.marks
        );
      } catch (e) {
        if (nodeType && e.message.includes("Invalid content")) {
          this.tr.replaceWith(
            start,
            start + fromNode.nodeSize,
            toNode
          );
        } else {
          throw e;
        }
      }
      this.currentJSON = removeMarks(this.tr.doc).toJSON();
      this.ops = createPatch(this.currentJSON, this.finalJSON);
      return true;
    }
    return false;
  }
  recreateChangeMarkSteps() {
    this.toDoc.descendants((tNode, tPos) => {
      if (!tNode.isInline) {
        return true;
      }
      this.tr.doc.nodesBetween(
        tPos,
        tPos + tNode.nodeSize,
        (fNode, fPos) => {
          if (!fNode.isInline) {
            return true;
          }
          const from = Math.max(tPos, fPos);
          const to = Math.min(
            tPos + tNode.nodeSize,
            fPos + fNode.nodeSize
          );
          fNode.marks.forEach((nodeMark) => {
            if (!nodeMark.isInSet(tNode.marks)) {
              this.tr.removeMark(from, to, nodeMark);
            }
          });
          tNode.marks.forEach((nodeMark) => {
            if (!nodeMark.isInSet(fNode.marks)) {
              this.tr.addMark(from, to, nodeMark);
            }
          });
        }
      );
    });
  }
  addReplaceStep(toDoc, afterStepJSON) {
    const fromDoc = this.schema.nodeFromJSON(this.currentJSON);
    const step = getReplaceStep(fromDoc, toDoc);
    if (!step) {
      return false;
    } else if (!this.tr.maybeStep(step).failed) {
      this.currentJSON = afterStepJSON;
      return true;
    }
    throw new Error("No valid step found.");
  }
  addReplaceTextSteps(op, afterStepJSON) {
    const op1 = { ...op, value: "xx" };
    const op2 = { ...op, value: "yy" };
    const afterOP1JSON = copy(this.currentJSON);
    const afterOP2JSON = copy(this.currentJSON);
    applyPatch(afterOP1JSON, [op1]);
    applyPatch(afterOP2JSON, [op2]);
    const op1Doc = this.schema.nodeFromJSON(afterOP1JSON);
    const op2Doc = this.schema.nodeFromJSON(afterOP2JSON);
    const finalText = op.value;
    const currentText = getFromPath(this.currentJSON, op.path);
    const textDiffs = this.wordDiffs ? diffWordsWithSpace(currentText, finalText) : diffChars(currentText, finalText);
    let offset = op1Doc.content.findDiffStart(op2Doc.content);
    const marks = op1Doc.resolve(offset + 1).marks();
    while (textDiffs.length) {
      const diff = textDiffs.shift();
      if (diff.added) {
        const textNode = this.schema.nodeFromJSON({ type: "text", text: diff.value }).mark(marks);
        if (textDiffs.length && textDiffs[0].removed) {
          const nextDiff = textDiffs.shift();
          this.tr.replaceWith(
            offset,
            offset + nextDiff.value.length,
            textNode
          );
        } else {
          this.tr.insert(offset, textNode);
        }
        offset += diff.value.length;
      } else if (diff.removed) {
        if (textDiffs.length && textDiffs[0].added) {
          const nextDiff = textDiffs.shift();
          const textNode = this.schema.nodeFromJSON({ type: "text", text: nextDiff.value }).mark(marks);
          this.tr.replaceWith(
            offset,
            offset + diff.value.length,
            textNode
          );
          offset += nextDiff.value.length;
        } else {
          this.tr.delete(offset, offset + diff.value.length);
        }
      } else {
        offset += diff.value.length;
      }
    }
    this.currentJSON = afterStepJSON;
  }
}
function recreateTransform(fromDoc, toDoc, options = {}) {
  const recreator = new RecreateTransform(fromDoc, toDoc, options);
  return recreator.init();
}

export { RecreateTransform, recreateTransform };
