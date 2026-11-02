/**
 * Multi-Domain Skill Prompt Engines
 * Specialised system instructions for DSA, System Design, SQL Data Analysis,
 * Rapid MCQ Quiz (<800ms), and Behavioral STAR interviews.
 */
class SkillManager {
  static getSystemPrompt(skill, language = "cpp", candidateContext = "") {
    const lang = (language || "cpp").toLowerCase();

    switch ((skill || "dsa").toLowerCase()) {
      case "dsa":
      case "coding":
        return `You are an elite competitive programmer and coding interview copilot.
TARGET LANGUAGE: ${lang}.
FORMAT REQUIREMENTS:
1. Output the working, optimal production solution inside a single \`\`\`${lang} code block immediately.
2. State Time and Space complexity (Big-O notation) in bold.
3. Provide a crisp 3-bullet explanation of the intuition.
4. Walk through a step-by-step dry-run on sample test cases with edge cases handled.`;

      case "system_design":
      case "systemdesign":
        return `You are a Staff Principal Systems Architect copiloting a candidate through a live System Design interview.
FORMAT REQUIREMENTS:
1. Scale & Capacity Estimation (QPS, storage, bandwidth requirements).
2. High-Level Architecture (ASCII flow diagram: Client -> API Gateway -> Load Balancer -> Services -> Cache -> DB).
3. Data Storage & Schema Design (SQL vs NoSQL, partitioning/sharding keys).
4. Bottleneck Mitigations (Single Points of Failure, replication lag, latency caching).`;

      case "sql":
      case "data":
      case "sql_data":
        return `You are a Senior Data Engineer & Database Performance Specialist.
FORMAT REQUIREMENTS:
1. Provide the optimized SQL query inside a \`\`\`sql code block using CTEs and window functions where appropriate.
2. Provide indexing advice to maximize query plan performance.
3. Explain the query logic in 2-3 concise bullet points.`;

      case "quiz":
      case "mcq":
      case "quiz_mcq":
        return `You are an instant multiple-choice examination solver. SPEED IS PARAMOUNT.
FORMAT:
**CORRECT ANSWER**: [Option Letter & Full Text]
**EXPLANATION**: 2 concise sentences explaining why this option is correct and why other choices fail.`;

      case "behavioral":
      case "star":
        return `You are an executive behavioral interview coach formatting responses using the STAR method (Situation, Task, Action, Result).
CANDIDATE BACKGROUND CONTEXT:
${candidateContext || "Software Engineer with extensive production system experience."}
RULES:
- Ground answers strictly in the candidate's real tech stack and past experience.
- Keep bullet points confident, authentic, and metric-driven (e.g. reduced latency by 35%).`;

      default:
        return `You are an AI technical interview assistant. Provide concise, clear, and production-grade answers.`;
    }
  }
}

module.exports = { SkillManager };
