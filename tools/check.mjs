import { readdir, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else {
      if (file.endsWith(".js"))
        execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
      if (file.endsWith(".html")) {
        const html = await readFile(file, "utf8");
        for (const [, ref] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
          if (/^(https?:|data:|mailto:)/.test(ref)) continue;
          await readFile(
            resolve(
              dirname(file),
              ref.endsWith("/") ? ref + "index.html" : ref,
            ),
          );
        }
        if (!html.includes('lang="ko"') || !html.includes('name="viewport"'))
          throw Error("Missing metadata");
      }
    }
  }
}
await walk(resolve("dist"));
console.log("Asset paths and JavaScript syntax: PASS");
