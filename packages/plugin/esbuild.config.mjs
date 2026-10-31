import esbuild from "esbuild";
import builtins from "builtin-modules";
import { existsSync } from "node:fs";
import process from "node:process";

const prod = process.argv[2] === "production";
const shared = {
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  treeShaking: true,
  sourcemap: prod ? false : "inline",
  minify: prod,
};

await esbuild.build({
  ...shared,
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
});

if (existsSync("src/live-sync-cli.ts")) {
  await esbuild.build({
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    logLevel: "info",
    entryPoints: ["src/live-sync-cli.ts"],
    outfile: "dist/live-sync-cli.mjs",
  });
}
