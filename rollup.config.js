import esbuild from "rollup-plugin-esbuild";
import dts from "rollup-plugin-dts";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = [
    {
        input: "src/index.ts",
        output: {
            file: "dist/recreateTransform.js",
        },
        plugins: [esbuild()],
        external: [
            "diff",
            "rfc6902",
            "prosemirror-model",
            "prosemirror-transform",
        ],
    },
    {
        input: "src/index.ts",
        output: {
            file: "dist/recreateTransform.d.ts",
            format: "es",
        },
        plugins: [dts()],
    },
];

export default config;
