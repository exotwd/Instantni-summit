export {}
export async function api(path, options = {}) {
  const init = { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } };
  if (init.body && typeof init.body !== "string") init.body = JSON.stringify(init.body);
  const res = await fetch(path, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error?.message || "Požadavek selhal.");
  return data;
}

export function events(onEvent, onStatus) {
  const source = new EventSource("/api/events?role=delegate");
  source.onopen = () => onStatus("connected");
  source.onerror = () => onStatus("disconnected");
  ["voting.updated","voting.closed","voting.reopened","voting.cancelled","resolution.updated","reset.performed"].forEach(type => source.addEventListener(type, e => onEvent(JSON.parse(e.data))));
  return () => source.close();
}
