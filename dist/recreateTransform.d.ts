import { Transform } from 'prosemirror-transform';
import { Node, Schema } from 'prosemirror-model';
import { Operation } from 'rfc6902';
import { ReplaceOperation } from 'rfc6902/diff';

interface JSONObject {
    [p: string]: JSONValue;
}
declare type JSONValue = string | number | boolean | JSONObject | Array<JSONValue>;

interface Options {
    complexSteps?: boolean;
    wordDiffs?: boolean;
    simplifyDiff?: boolean;
}
declare class RecreateTransform {
    fromDoc: Node;
    toDoc: Node;
    complexSteps: boolean;
    wordDiffs: boolean;
    simplifyDiff: boolean;
    schema: Schema;
    tr: Transform;
    currentJSON: JSONObject;
    finalJSON: JSONObject;
    ops: Array<Operation>;
    constructor(fromDoc: Node, toDoc: Node, options?: Options);
    init(): Transform;
    /** convert json-diff to prosemirror steps */
    recreateChangeContentSteps(): void;
    /** update node with attrs and marks, may also change type */
    addSetNodeMarkup(): boolean;
    recreateChangeMarkSteps(): void;
    /**
     * retrieve and possibly apply replace-step based from doc changes
     * From http://prosemirror.net/examples/footnote/
     */
    addReplaceStep(toDoc: Node, afterStepJSON: JSONObject): boolean;
    /** retrieve and possibly apply text replace-steps based from doc changes */
    addReplaceTextSteps(op: ReplaceOperation, afterStepJSON: JSONObject): void;
}
declare function recreateTransform(fromDoc: Node, toDoc: Node, options?: Options): Transform;

export { Options, RecreateTransform, recreateTransform };
