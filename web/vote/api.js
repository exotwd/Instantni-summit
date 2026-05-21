export async function api(path, options = {}) {
  const init = { ...options };
  init.headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);

  const res = await fetch(path, init);
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.replace(/\s+/g, " ").slice(0, 180);
      if (res.status === 404) {
        const error = new Error("Server běží se starým backendem nebo nezná tuto API routu. Znovu sestavte binárku a restartujte mun-app.");
        error.status = res.status;
        error.code = "not_found";
        throw error;
      }
      const error = new Error(`Server nevrátil JSON odpověď (${res.status}). ${preview || "Prázdná odpověď."}`);
      error.status = res.status;
      throw error;
    }
  }
  if (!res.ok) {
    const error = new Error(data?.error?.message || `Požadavek selhal (${res.status}).`);
    error.status = res.status;
    error.code = data?.error?.code || "";
    throw error;
  }
  return data;
}

export function events(onEvent, onStatus) {
  const source = new EventSource("/api/events?role=delegate");
  source.onopen = () => onStatus?.("connected");
  source.onerror = () => onStatus?.("disconnected");
  ["voting.updated", "voting.closed", "voting.reopened", "voting.cancelled", "resolution.updated", "reset.performed"].forEach((type) => {
    source.addEventListener(type, (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        onEvent({ type, revision: Date.now() });
      }
    });
  });
  return () => source.close();
}
