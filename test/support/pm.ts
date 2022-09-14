import { Node } from "prosemirror-model";
import schema from "../support/schema";
import { JSONObject } from "../../src/types";
const testSchema = schema.create();

export function doc(...content: any[]) {
    return Node.fromJSON(testSchema, {
        type: "doc",
        content,
    });
}

export function node(type: string, attrs: JSONObject, ...content: any[]) {
    return { type, attrs, content };
}

export function p(...content: any[]) {
    return { type: "paragraph", content };
}

export function t(text: string) {
    return { type: "text", text };
}
