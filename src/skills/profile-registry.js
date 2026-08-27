// Compatibility facade for existing callers. New skills are defined in the
// declarative catalog, not hardcoded in application controllers.
const { skills, getSkill, getSkillIds, normalizeSkillId, aliases } = require('./skill-catalog');

const INTERVIEW_PROFILE_IDS = skills.filter((skill) => skill.category === 'Interview Skills').map((skill) => skill.id);
const profiles = Object.fromEntries(skills.map((skill) => [skill.id, {
  name: skill.name,
  promptFile: skill.promptFile,
  responseMode: skill.responseStyle.includes('STAR') ? 'star' : 'interview',
  knowledgeAreas: skill.knowledgeScope,
  responseStyle: skill.responseStyle,
  displayFormat: skill.displayFormat,
  latencyPreferences: skill.latencyPreferences,
  languagePreferences: skill.languagePreferences
}]));

function isInterviewProfile(id) { return getSkill(id)?.category === 'Interview Skills'; }
function getNavigableProfileIds() { return getSkillIds(); }
function normalizeProfileId(id) { return normalizeSkillId(id); }
function isSupportedSkill(id) { return !!getSkill(id); }

module.exports = { profiles, aliases, INTERVIEW_PROFILE_IDS, isInterviewProfile, getNavigableProfileIds, normalizeProfileId, isSupportedSkill };
