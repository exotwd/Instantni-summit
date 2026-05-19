import { access } from "node:fs/promises";

const apps = ["admin", "screen", "vote"];
for (const app of apps) {
  const files = ["index.html", "main.ts", "api.ts", "state.ts", "styles.css"];
  for (const file of files) {
    await access(`web/${app}/${file}`);
  }
}
for (const file of ["main.js", "api.js", "state.js"]) {
  await access(`web/screen/${file}`);
}
console.log("Frontend static files verified.");
