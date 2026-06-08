import esbuild from "esbuild";
import process from "node:process";

const production = process.env.NODE_ENV === "production";

await esbuild.build({
  banner: {
    js: "/* Git Viewer for Obsidian - generated bundle */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian"],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "node",
  sourcemap: production ? false : "inline",
  target: "es2022",
});
