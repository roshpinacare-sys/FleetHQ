import AgentHQ from "@/components/agent-hq/AgentHQ";

// Fleet HQ — the agents' operations room.
// The root route IS the office: a live crew of real agents working real data
// books, streamed over WebSocket from the foreman service (see /foreman).
export default function Home() {
  return <AgentHQ />;
}
