export {}
export const revisions = { voting:0, resolution:0 };
const map = {"voting.updated":"voting","voting.closed":"voting","voting.reopened":"voting","voting.cancelled":"voting","resolution.updated":"resolution","reset.performed":"voting"};
export function acceptEvent(event){ const key = map[event.type]; if(!key) return true; if(event.revision <= (revisions[key] || 0)) return false; revisions[key] = event.revision; return true; }
