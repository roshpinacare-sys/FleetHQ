import AgentHQ from "@/components/agent-hq/AgentHQ";

// מפקדת הצי — Fleet HQ.
// The root route IS the office: a live operations room where the fleet's real
// crew (real LLM agents) works the fleet's real books, streamed over WebSocket.
export default function Home() {
  return <AgentHQ />;
}
