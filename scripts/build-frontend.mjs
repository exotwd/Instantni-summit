import { access, copyFile, mkdir } from "node:fs/promises";

const apps = ["admin", "screen", "vote"];
const files = ["index.html", "main.js", "api.js", "state.js", "styles.css"];
const rootFiles = ["flag-polyfill.js"];
for (const app of apps) {
  for (const file of files) {
    await access(`web/${app}/${file}`);
  }
}
for (const file of rootFiles) {
  await access(`web/${file}`);
}
try {
  await mkdir("web-dist", { recursive: true });
  for (const file of rootFiles) {
    await copyFile(`web/${file}`, `web-dist/${file}`);
  }
  for (const app of apps) {
    await mkdir(`web-dist/${app}`, { recursive: true });
    for (const file of files) {
      await copyFile(`web/${app}/${file}`, `web-dist/${app}/${file}`);
    }
  }
  console.log("Frontend static files verified and web-dist refreshed.");
} catch (error) {
  console.warn(`Frontend static files verified. web-dist refresh skipped: ${error.code || error.message}`);
}
