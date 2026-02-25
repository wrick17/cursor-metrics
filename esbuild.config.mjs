import { build } from "esbuild";

const isWatch = process.argv.includes("--watch");
const isProd = process.argv.includes("--production");

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: !isProd,
  minify: isProd,
};

if (isWatch) {
  const ctx = await (await import("esbuild")).context(config);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(config);
  console.log("Build complete.");
}
