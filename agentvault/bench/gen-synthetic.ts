/**
 * Generate synthetic LongMemEval-style dataset for benchmark validation.
 * Mimics the real dataset format so the bench script works identically.
 */
import * as fs from "node:fs";

interface Session {
  session_id: string;
  session_date: string;
  messages: { role: string; content: string }[];
}

interface Question {
  question_id: string;
  question: string;
  answer: string;
  task:
    | "single-session-user"
    | "single-session-assistant"
    | "single-session-preference"
    | "multi-session"
    | "temporal-reasoning"
    | "knowledge-update"
    | "abstention";
  haystack_sessions: Session[];
  evidence_sessions: string[]; // session_ids that contain the answer
}

const TASKS = [
  { task: "single-session-user", sessions: 30, evidence: 2 },
  { task: "multi-session", sessions: 50, evidence: 5 },
  { task: "temporal-reasoning", sessions: 40, evidence: 3 },
  { task: "knowledge-update", sessions: 35, evidence: 4 },
] as const;

function randomDate(before: Date, daysBack: number): string {
  const d = new Date(before.getTime() - Math.random() * daysBack * 86400000);
  return d.toISOString().split("T")[0];
}

function makeSession(id: string, date: string, role: string, topic: string): Session {
  return {
    session_id: id,
    session_date: date,
    messages: [
      { role: "user", content: `Tell me about ${topic} area ${id.slice(-3)}` },
      { role, content: `The answer for ${topic} is: IMPORTANT-DATA-${id.slice(0, 8)}` },
    ],
  };
}

function makeNoiseSession(id: string, date: string): Session {
  const topics = ["weather", "sports", "music", "travel", "food", "movies", "books", "games", "health", "tech"];
  const t = topics[Math.floor(Math.random() * topics.length)];
  return {
    session_id: id,
    session_date: date,
    messages: [
      { role: "user", content: `What's the latest in ${t}?` },
      { role: "assistant", content: `Here is some ${t} news for you. Nothing special today.` },
    ],
  };
}

const questions: Question[] = [];
const now = new Date();

for (let qi = 0; qi < 20; qi++) {
  const config = TASKS[qi % TASKS.length];
  const q: Question = {
    question_id: `synth-${qi.toString().padStart(3, "0")}`,
    question: `What was the important data about topic-${qi}?`,
    answer: `IMPORTANT-DATA-synth-${qi.toString().padStart(3, "0")}-ev`,
    task: config.task,
    haystack_sessions: [],
    evidence_sessions: [],
  };

  // Generate evidence sessions (contain the answer)
  for (let e = 0; e < config.evidence; e++) {
    const sid = `synth-${qi}-ev-${e}`;
    const date = randomDate(now, 90);
    q.evidence_sessions.push(sid);
    q.haystack_sessions.push(makeSession(sid, date, "assistant", `topic-${qi}`));
  }

  // Generate noise sessions
  const noiseCount = config.sessions - config.evidence;
  for (let n = 0; n < noiseCount; n++) {
    const sid = `synth-${qi}-noise-${n}`;
    q.haystack_sessions.push(makeNoiseSession(sid, randomDate(now, 90)));
  }

  questions.push(q);
}

fs.writeFileSync("bench/synthetic_dataset.json", JSON.stringify(questions, null, 2));
console.log(`Generated ${questions.length} synthetic questions`);
