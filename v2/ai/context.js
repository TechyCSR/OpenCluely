const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Local Candidate Context & Resume Grounding
 * Ingests resume and job description to provide authentic, personalized answers.
 * Stored 100% locally on the candidate's machine (~/.opencluely/profile.json).
 */
class ContextManager {
  constructor() {
    this.dir = path.join(os.homedir(), ".opencluely");
    this.filePath = path.join(this.dir, "profile.json");
    this.ensureDir();
  }

  ensureDir() {
    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
      }
    } catch (_) {}
  }

  loadProfile() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (_) {}
    return {
      name: "",
      yearsExperience: 3,
      primaryLanguages: ["C++", "Python", "Go"],
      pastCompanies: [],
      keyProjects: [],
      resumeText: "",
      targetJobDescription: ""
    };
  }

  saveProfile(profile) {
    this.ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(profile, null, 2), "utf-8");
    return true;
  }

  buildGroundingContext() {
    const p = this.loadProfile();
    if (!p.resumeText && (!p.keyProjects || p.keyProjects.length === 0)) {
      return "";
    }

    return `CANDIDATE BACKGROUND:
- Years of Experience: ${p.yearsExperience || "N/A"}
- Core Languages: ${(p.primaryLanguages || []).join(", ")}
- Past Companies: ${(p.pastCompanies || []).join(", ")}
- Projects Summary: ${(p.keyProjects || []).join("; ")}
- Target Role: ${p.targetJobDescription || "Software Engineer"}`;
  }
}

module.exports = { ContextManager };
