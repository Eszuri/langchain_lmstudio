import {defineConfig} from "tsup"

export default defineConfig({
    entry: ["src/index.ts"],

    format: "esm",
    platform: "node",
    target: "node18",

    outDir: "build",
    sourcemap: false,
    minify: true,
    clean: true,

    splitting: false,
    treeshake: true,

    skipNodeModulesBundle: true
})
