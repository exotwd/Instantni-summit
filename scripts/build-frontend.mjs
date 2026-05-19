import { access } from "node:fs/promises";

const apps = ["admin", "screen", "vote"];
for (const app of apps) {
  const files = ["index.html", "main.js", "api.js", "state.js", "styles.css"];
  for (const file of files) {
    await access(`web/${app}/${file}`);
  }
}
console.log("Frontend static files verified.");
