const createSkill = (id, name, category, knowledgeScope, options = {}) => ({
  id, name, category, knowledgeScope,
  systemPrompt: options.systemPrompt || `You are a ${name} preparation assistant.`,
  responseStyle: options.responseStyle || ['direct', 'practical', 'accurate'],
  displayFormat: options.displayFormat || 'ANSWER\n<direct response>\n\nKEY POINTS\n- <practical points>\n\nLIKELY FOLLOW-UP\n<one question>',
  latencyPreferences: options.latencyPreferences || { target: 'fast', maxWords: 120, stream: true, contextTurns: 6 },
  languagePreferences: options.languagePreferences || { code: false, default: 'auto' },
  promptFile: options.promptFile || null,
  aliases: options.aliases || []
});

const skills = [
  createSkill('amazon-dct', 'Amazon DCT', 'Interview Skills', ['Networking', 'Linux', 'Hardware', 'AWS', 'Troubleshooting', 'Data Center', 'Security', 'Leadership Principles'], { promptFile: 'amazon-dct.md', aliases: ['amazon dct', 'dct'], responseStyle: ['concise', 'interview-ready', 'physical-to-logical troubleshooting', 'STAR when behavioral'] }),
  createSkill('sdet', 'SDET', 'Interview Skills', ['Selenium', 'Playwright', 'Cypress', 'Java', 'Python', 'TestNG', 'CI/CD', 'API Testing'], { promptFile: 'sdet.md', responseStyle: ['concise', 'testability-focused', 'interview-ready'] }),
  createSkill('qa-automation', 'QA Automation', 'Interview Skills', ['Test strategy', 'UI automation', 'API testing', 'Regression', 'CI/CD', 'Test data'], { responseStyle: ['concise', 'risk-based', 'quality-focused'] }),
  createSkill('devops', 'DevOps Engineer', 'Interview Skills', ['Linux', 'AWS', 'Docker', 'Kubernetes', 'Terraform', 'Monitoring', 'Networking'], { promptFile: 'devops.md', responseStyle: ['concise', 'safe operational sequence', 'rollback and observability'] }),
  createSkill('backend-engineer', 'Backend Engineer', 'Interview Skills', ['APIs', 'Databases', 'Distributed Systems', 'Caching', 'Queues', 'System Design'], { promptFile: 'backend-engineer.md', languagePreferences: { code: true, default: 'auto' } }),
  createSkill('frontend-engineer', 'Frontend Engineer', 'Interview Skills', ['JavaScript', 'TypeScript', 'React', 'Web performance', 'Accessibility', 'Testing'], { languagePreferences: { code: true, default: 'typescript' } }),
  createSkill('full-stack-engineer', 'Full Stack Engineer', 'Interview Skills', ['Frontend', 'APIs', 'Databases', 'Authentication', 'Deployment', 'Observability'], { languagePreferences: { code: true, default: 'typescript' } }),
  createSkill('cloud-engineer', 'Cloud Engineer', 'Interview Skills', ['AWS', 'Azure', 'GCP', 'Networking', 'IAM', 'Reliability', 'Cost'], { responseStyle: ['concise', 'architecture-aware', 'security and cost aware'] }),
  createSkill('security-engineer', 'Security Engineer', 'Interview Skills', ['AppSec', 'Network security', 'IAM', 'Threat modeling', 'Incident response', 'Vulnerabilities'], { responseStyle: ['concise', 'risk-prioritized', 'defense-in-depth'] }),
  createSkill('network-engineer', 'Network Engineer', 'Interview Skills', ['TCP/IP', 'Routing', 'Switching', 'DNS', 'DHCP', 'VLAN', 'Troubleshooting'], { responseStyle: ['concise', 'physical-to-logical troubleshooting', 'command-aware'] }),
  createSkill('system-administrator', 'System Administrator', 'Interview Skills', ['Windows', 'Linux', 'Active Directory', 'Backups', 'Patch management', 'Troubleshooting'], { responseStyle: ['concise', 'methodical', 'operations-focused'] }),
  createSkill('linux-engineer', 'Linux Engineer', 'Interview Skills', ['Processes', 'systemd', 'Filesystems', 'Networking', 'Shell', 'Security'], { responseStyle: ['concise', 'command-aware', 'methodical'] }),
  createSkill('database-engineer', 'Database Engineer', 'Interview Skills', ['SQL', 'Data modeling', 'Indexing', 'Replication', 'Performance', 'Backups'], { responseStyle: ['concise', 'trade-off aware', 'data-integrity focused'] }),
  createSkill('data-engineer', 'Data Engineer', 'Interview Skills', ['ETL/ELT', 'Warehouses', 'Spark', 'Streaming', 'Data quality', 'Orchestration'], { responseStyle: ['concise', 'scalability aware', 'data-quality focused'] }),
  createSkill('ai-engineer', 'AI Engineer', 'Interview Skills', ['LLM applications', 'RAG', 'Evaluation', 'Prompting', 'Safety', 'Deployment'], { responseStyle: ['concise', 'evaluation-driven', 'safety-aware'] }),
  createSkill('ml-engineer', 'ML Engineer', 'Interview Skills', ['ML lifecycle', 'Feature engineering', 'Training', 'MLOps', 'Evaluation', 'Monitoring'], { responseStyle: ['concise', 'metrics-driven', 'production-aware'] }),
  createSkill('site-reliability-engineer', 'Site Reliability Engineer', 'Interview Skills', ['SLOs', 'Incident response', 'Monitoring', 'Capacity', 'Automation', 'Distributed systems'], { responseStyle: ['concise', 'reliability-focused', 'blameless incident methodology'] }),
  createSkill('platform-engineer', 'Platform Engineer', 'Interview Skills', ['Internal platforms', 'Kubernetes', 'Developer experience', 'IaC', 'Observability', 'Security'], { responseStyle: ['concise', 'product-minded', 'operationally safe'] }),
  createSkill('hr-interview', 'HR Interview', 'General Skills', ['Introduction', 'Motivation', 'Strengths', 'Career goals', 'Work preferences'], { responseStyle: ['natural spoken first-person', 'honest', 'concise'] }),
  createSkill('behavioral-interview', 'Behavioral Interview', 'General Skills', ['Behavioral questions', 'Conflict', 'Ownership', 'Collaboration', 'Results'], { responseStyle: ['STAR', 'honest', 'placeholder for missing facts'] }),
  createSkill('star', 'STAR Responses', 'General Skills', ['Situation', 'Task', 'Action', 'Result'], { promptFile: 'star.md', responseStyle: ['STAR', 'honest'] }),
  createSkill('leadership-principles', 'Leadership Principles', 'General Skills', ['Ownership', 'Customer Obsession', 'Dive Deep', 'Bias for Action', 'Earn Trust'], { promptFile: 'leadership-principles.md', responseStyle: ['STAR', 'principle-led', 'honest'] }),
  createSkill('resume-review', 'Resume Review', 'General Skills', ['Resume clarity', 'Impact statements', 'Role alignment', 'ATS keywords'], { responseStyle: ['constructive', 'specific', 'do not invent achievements'] }),
  createSkill('salary-negotiation', 'Salary Negotiation', 'General Skills', ['Compensation research', 'Negotiation', 'Offer evaluation', 'Communication'], { responseStyle: ['practical', 'professional', 'non-legal/non-financial advice'] }),
  createSkill('career-coaching', 'Career Coaching', 'General Skills', ['Career planning', 'Skill gaps', 'Interview strategy', 'Professional growth'], { responseStyle: ['supportive', 'actionable', 'specific'] }),
  createSkill('dsa', 'Data Structures & Algorithms', 'Education Skills', ['Algorithms', 'Data structures', 'Complexity', 'Problem solving'], { promptFile: 'dsa.md', languagePreferences: { code: true, default: 'cpp' }, latencyPreferences: { target: 'fast', maxWords: 280, stream: true, contextTurns: 4 }, aliases: ['data-structures', 'algorithms'] }),
  createSkill('operating-systems', 'Operating Systems', 'Education Skills', ['Processes', 'Threads', 'Memory', 'Scheduling', 'Filesystems', 'Concurrency']),
  createSkill('networking', 'Networking', 'Education Skills', ['OSI', 'TCP/IP', 'DNS', 'DHCP', 'Routing', 'Switching', 'Troubleshooting']),
  createSkill('databases', 'Databases', 'Education Skills', ['SQL', 'NoSQL', 'Transactions', 'Indexes', 'Modeling', 'Replication']),
  createSkill('system-design', 'System Design', 'Education Skills', ['Scalability', 'Reliability', 'APIs', 'Databases', 'Caching', 'Queues'], { responseStyle: ['structured', 'assumption-led', 'trade-off aware'] }),
  createSkill('oop', 'Object-Oriented Programming', 'Education Skills', ['Encapsulation', 'Inheritance', 'Polymorphism', 'SOLID', 'Patterns'], { languagePreferences: { code: true, default: 'auto' } }),
  createSkill('software-architecture', 'Software Architecture', 'Education Skills', ['Architecture patterns', 'Modularity', 'Reliability', 'Security', 'Trade-offs'], { responseStyle: ['structured', 'trade-off aware', 'practical'] }),
  createSkill('explain-concepts', 'Explain Concepts', 'General AI Skills', ['General technical and non-technical concepts'], { responseStyle: ['clear', 'progressive disclosure', 'example-led'] }),
  createSkill('research-assistant', 'Research Assistant', 'General AI Skills', ['Research framing', 'Evidence evaluation', 'Synthesis', 'Open questions'], { responseStyle: ['structured', 'state uncertainty', 'cite supplied sources'] }),
  createSkill('meeting-assistant', 'Meeting Assistant', 'General AI Skills', ['Notes', 'Decisions', 'Action items', 'Risks', 'Follow-ups'], { responseStyle: ['structured', 'action-oriented', 'do not invent decisions'] }),
  createSkill('technical-documentation', 'Technical Documentation', 'General AI Skills', ['API docs', 'Guides', 'Runbooks', 'Architecture docs', 'Troubleshooting'], { responseStyle: ['clear', 'structured', 'audience-aware'] }),
  createSkill('coding-assistant', 'Coding Assistant', 'General AI Skills', ['Implementation', 'Debugging', 'Code review', 'Refactoring', 'Testing'], { languagePreferences: { code: true, default: 'auto' }, latencyPreferences: { target: 'fast', maxWords: 280, stream: true, contextTurns: 6 } })
];

const skillMap = new Map(skills.map((skill) => [skill.id, skill]));
const aliases = Object.fromEntries(skills.flatMap((skill) => [skill.id, skill.name.toLowerCase(), ...skill.aliases].map((alias) => [alias, skill.id])));
const normalizeSkillId = (id) => aliases[String(id || '').trim().toLowerCase()] || String(id || '').trim().toLowerCase();
const getSkill = (id) => skillMap.get(normalizeSkillId(id)) || null;
const getSkillIds = () => skills.map((skill) => skill.id);
const getSkillGroups = () => skills.reduce((groups, skill) => { (groups[skill.category] ||= []).push(skill); return groups; }, {});

module.exports = { skills, getSkill, getSkillIds, getSkillGroups, normalizeSkillId, aliases };
