import { build, context } from "esbuild";
import { globSync } from "glob";

const entryPoints = globSync("./src/**/**.{ts,tsx}");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints,
  minify: true,
  outdir: "./built/esm",
  target: "es2022",
  platform: "browser",
  format: "esm",
};

async function run() {
  if (process.env.WATCH === "true") {
    const watcher = await context(options);
    await watcher.watch();
  } else {
    await build(options);
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
