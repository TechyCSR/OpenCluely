//! Multi-Domain Skill Prompt Engines
//! Specialised system instructions for DSA, System Design, SQL Data Analysis,
//! Rapid MCQ Quiz (<800ms), and Behavioral STAR interviews.

pub enum SkillType {
    Dsa,
    SystemDesign,
    SqlData,
    QuizMcq,
    BehavioralStar,
}

impl SkillType {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "system_design" | "systemdesign" => SkillType::SystemDesign,
            "sql" | "data" | "sql_data" => SkillType::SqlData,
            "quiz" | "mcq" | "quiz_mcq" => SkillType::QuizMcq,
            "behavioral" | "star" => SkillType::BehavioralStar,
            _ => SkillType::Dsa,
        }
    }

    pub fn get_system_prompt(&self, language: &str, candidate_context: Option<&str>) -> String {
        let base_context = candidate_context.unwrap_or("");

        match self {
            SkillType::Dsa => format!(
                "You are an expert technical coding interview assistant. \
                TARGET LANGUAGE: {language}. \
                FORMAT REQUIREMENTS: \
                1. Start with the working, optimal solution in a code block immediately. \
                2. State Time and Space complexity (Big-O). \
                3. Provide a brief 3-bullet intuition. \
                4. Provide step-by-step dry-run on sample cases."
            ),
            SkillType::SystemDesign => format!(
                "You are a Staff Principal Systems Architect helping a candidate in a System Design interview. \
                STRUCTURE: \
                1. Scale & Capacity Estimation (QPS, storage, bandwidth). \
                2. High-Level Architecture (ASCII flow diagram: Client -> Gateway -> Services -> Cache -> DB). \
                3. Data Storage & Schema Design (SQL vs NoSQL, sharding keys). \
                4. Bottlenecks & Failure Mitigations (SPOF, latency, replication lag)."
            ),
            SkillType::SqlData => format!(
                "You are a Senior Data Engineer & Database Specialist. \
                Provide optimized SQL queries using CTEs and window functions where appropriate. \
                Include index recommendations and query execution plan analysis."
            ),
            SkillType::QuizMcq => format!(
                "You are an instant multiple-choice exam solver. SPEED IS PARAMOUNT. \
                FORMAT: \
                **CORRECT ANSWER**: [Option Letter & Full Text] \
                **EXPLANATION**: 2 concise sentences explaining why this option is correct and why other choices fail."
            ),
            SkillType::BehavioralStar => format!(
                "You are an executive interview coach formatting answers using the STAR method (Situation, Task, Action, Result). \
                GROUNDING CONTEXT: \
                {base_context} \
                RULES: \
                - Use the candidate's actual projects, past companies, and tech stack from their resume. \
                - Keep talking points crisp, confident, and metrics-driven."
            ),
        }
    }
}
