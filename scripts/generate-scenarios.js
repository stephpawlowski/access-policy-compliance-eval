/**
 * Generates tests.csv for the access-policy eval from docs/policy-engine.js, the single
 * source of truth for the policy logic (also used live by the dashboard's simulator).
 *
 * Strategy: explicitly enumerate two concrete example inputs per rule *branch* (38 branches
 * across the 10 rules) so every branch of the policy gets tested, then fill the remainder of
 * a fixed-size dataset with additional pseudo-random, deduplicated combinations for realistic
 * variety. Every row's expected answer and reasoning come directly from running the engine,
 * so the answer key can never drift out of sync with the simulator.
 *
 * Usage: node scripts/generate-scenarios.js > tests.csv
 */
const PolicyEngine = require("../docs/policy-engine.js");

const TOTAL_ROWS = 105;

const ROLES = PolicyEngine.ROLES;
const DEPARTMENTS = PolicyEngine.DEPARTMENTS;
const RESOURCES = PolicyEngine.RESOURCES;

// Seeded PRNG (mulberry32) so the "random fill" portion is reproducible.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260728);
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

// Explicit examples designed to hit every branch of every rule at least twice, with some
// deliberately "tricky" combinations (role/department combos that are easy to get wrong).
const explicit = [
  // R1 - offboarding override (should override everything else, tested against otherwise-approve setups)
  { role: "Admin", department: "Engineering", resource: "Production Database", approvals: 2, offboarding: true, incidentActive: false },
  { role: "Manager", department: "Finance", resource: "Billing System", approvals: 0, offboarding: true, incidentActive: false },
  { role: "Employee", department: "Security", resource: "Incident Response Tools", approvals: 0, offboarding: true, incidentActive: true },
  { role: "Contractor", department: "Support", resource: "Customer PII", approvals: 0, offboarding: true, incidentActive: false },

  // R2 - Admin Console
  { role: "Admin", department: "Engineering", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Finance", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Admin Console", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Admin Console", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Admin Console", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Finance", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false },

  // R3 - Incident Response Tools
  { role: "Employee", department: "Security", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Security", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Sales", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Finance", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Incident Response Tools", approvals: 1, offboarding: false, incidentActive: true },
  { role: "Manager", department: "Support", resource: "Incident Response Tools", approvals: 2, offboarding: false, incidentActive: true },
  { role: "Employee", department: "Engineering", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: true },
  { role: "Contractor", department: "Sales", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: true },
  { role: "Employee", department: "Engineering", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Incident Response Tools", approvals: 1, offboarding: false, incidentActive: false },

  // R4 - Finance-restricted systems
  { role: "Intern", department: "Finance", resource: "Payroll System", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Finance", resource: "Billing System", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Finance", resource: "Financial Reports", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Finance", resource: "Billing System", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Financial Reports", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Support", resource: "Payroll System", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Sales", resource: "Billing System", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Financial Reports", approvals: 0, offboarding: false, incidentActive: false },

  // R5 - Customer PII
  { role: "Employee", department: "Support", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Support", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Security", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Customer PII", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Engineering", resource: "Customer PII", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false },

  // R6 - Production Database
  { role: "Intern", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Production Database", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Support", resource: "Production Database", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Finance", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Finance", resource: "Production Database", approvals: 1, offboarding: false, incidentActive: false },

  // R7 - Source Code Repository
  { role: "Employee", department: "Engineering", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Engineering", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Engineering", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Sales", resource: "Source Code Repository", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Support", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Sales", resource: "Source Code Repository", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Support", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false },

  // R8 - Employee Records (directReport: true here are the unambiguous "standing access confirmed" cases;
  // the ambiguous-directReport adversarial cases live in the `adversarial` array below.)
  { role: "Employee", department: "People", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: true },
  { role: "Manager", department: "Sales", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: true },
  { role: "Admin", department: "Finance", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Employee Records", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Support", resource: "Employee Records", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Sales", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Engineering", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },

  // R9 - Vendor Contracts
  { role: "Employee", department: "Finance", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Engineering", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Support", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false },

  // R10 - catch-all (Other / Unlisted System)
  { role: "Employee", department: "Engineering", resource: "Other / Unlisted System", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Other / Unlisted System", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Employee", department: "Support", resource: "Other / Unlisted System", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Finance", resource: "Other / Unlisted System", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "People", resource: "Other / Unlisted System", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Intern", department: "Security", resource: "Other / Unlisted System", approvals: 0, offboarding: false, incidentActive: false },
];

// Adversarial / edge-case scenarios, added on top of the 90-case v2 set. These don't test new
// rules — they test whether a model handles *ambiguity and distraction* the way a careful human
// reviewer would, rather than just applying clean, fully-specified rules correctly.
const adversarial = [
  // Rule 8 direct-report ambiguity: the policy grants Managers standing access "for their own
  // direct reports," but a request that never says whose records are being requested has a
  // genuinely unknown answer. The correct move is to escalate for clarification, not guess.
  { role: "Manager", department: "Engineering", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: false },
  { role: "Manager", department: "Support", resource: "Employee Records", approvals: 1, offboarding: false, incidentActive: false, directReport: false },
  { role: "Manager", department: "Finance", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false }, // directReport omitted: genuinely ambiguous
  { role: "Manager", department: "Security", resource: "Employee Records", approvals: 2, offboarding: false, incidentActive: false }, // ambiguous even with 2 approvals — approvals shouldn't resolve this
  { role: "Manager", department: "Sales", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false }, // ambiguous
  { role: "Manager", department: "Support", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false }, // ambiguous

  // Catch-all robustness under invented/unlisted resource names: `resourceLabel` is what appears
  // in the natural-language request; `resource` (used for grading) stays "Other / Unlisted System."
  // A model that tries to force-match the *name* to one of the 10 real systems, instead of
  // recognizing it isn't one of them, will get these wrong.
  { role: "Employee", department: "Sales", resource: "Other / Unlisted System", resourceLabel: "the internal Analytics Dashboard", approvals: 2, offboarding: false, incidentActive: false },
  { role: "Contractor", department: "Support", resource: "Other / Unlisted System", resourceLabel: "the Slack Admin Panel", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Other / Unlisted System", resourceLabel: "the internal engineering Wiki", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Admin", department: "Finance", resource: "Other / Unlisted System", resourceLabel: "the A/B Testing Dashboard", approvals: 1, offboarding: false, incidentActive: false },
  { role: "Employee", department: "People", resource: "Other / Unlisted System", resourceLabel: "the Recruiting CRM", approvals: 0, offboarding: false, incidentActive: false },

  // Narrative red herrings: the structured fields (and correct answer) are unambiguous, but the
  // request sentence includes an irrelevant, distracting detail. A model reasoning correctly
  // from the actual role/department/resource should ignore it; one pattern-matching on surface
  // narrative detail may not.
  { role: "Employee", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false, redHerring: "They previously worked in Sales for two years before transferring to Engineering." },
  { role: "Contractor", department: "Support", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false, redHerring: "Their manager separately has an open request for Vendor Contracts access pending review." },
  { role: "Manager", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false, redHerring: "They mentioned they reviewed vendor contracts regularly at a previous employer." },
  { role: "Employee", department: "Finance", resource: "Financial Reports", approvals: 0, offboarding: false, incidentActive: false, redHerring: "The request happened to be submitted the same day as a company-wide security incident, though it is unrelated to it." },
];

function key(s) {
  return [s.role, s.department, s.resource, s.approvals, s.offboarding, s.incidentActive, s.directReport, s.resourceLabel, s.redHerring].join("|");
}

const seen = new Set(explicit.concat(adversarial).map(key));
const scenarios = explicit.concat(adversarial);

// Fill the remainder with deduplicated pseudo-random combinations for realistic variety.
let guard = 0;
while (scenarios.length < TOTAL_ROWS && guard < 100000) {
  guard++;
  const candidate = {
    role: pick(ROLES),
    department: pick(DEPARTMENTS),
    resource: pick(RESOURCES),
    approvals: pick([0, 1, 2]),
    offboarding: rand() < 0.08,
    incidentActive: rand() < 0.15,
  };
  const k = key(candidate);
  if (seen.has(k)) continue;
  seen.add(k);
  scenarios.push(candidate);
}

if (scenarios.length > TOTAL_ROWS) scenarios.length = TOTAL_ROWS;

function describeApprovals(n) {
  if (n === 0) return "no prior manager approvals";
  if (n === 1) return "one prior manager approval";
  return "two prior manager approvals";
}

function composeRequest(s) {
  const article = /^[AEIOU]/.test(s.role) ? "An" : "A";
  const resourceLabel = s.resourceLabel || s.resource;
  let sentence = `${article} ${s.role} in the ${s.department} department requests access to ${resourceLabel}, with ${describeApprovals(
    s.approvals
  )}.`;
  if (s.resource === "Employee Records" && s.role === "Manager" && s.directReport === true) {
    sentence += " The records requested belong to one of the requester's own direct reports.";
  }
  if (s.resource === "Employee Records" && s.role === "Manager" && s.directReport === false) {
    sentence += " The records requested belong to an employee who is not one of the requester's direct reports.";
  }
  if (s.offboarding) sentence += " The requester's account is in offboarding.";
  if (s.incidentActive) sentence += " There is an active declared security incident.";
  if (s.redHerring) sentence += " " + s.redHerring;
  return sentence;
}

const rows = scenarios.map((s, i) => {
  const verdict = PolicyEngine.evaluate(s);
  return {
    id: i + 1,
    role: s.role,
    department: s.department,
    resource: s.resource,
    approvals: s.approvals,
    offboarding: s.offboarding ? "true" : "false",
    incident_active: s.incidentActive ? "true" : "false",
    direct_report: s.directReport === undefined ? "not stated" : s.directReport ? "true" : "false",
    request: composeRequest(s),
    expected: verdict.decision,
    reasoning: verdict.citation,
  };
});

function csvEscape(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const header = [
  "id",
  "role",
  "department",
  "resource",
  "approvals",
  "offboarding",
  "incident_active",
  "direct_report",
  "request",
  "expected",
  "reasoning",
];

const lines = [header.join(",")];
for (const row of rows) {
  lines.push(header.map((h) => csvEscape(row[h])).join(","));
}

process.stdout.write(lines.join("\n") + "\n");

// Coverage summary to stderr so it doesn't pollute the CSV on stdout.
const ruleCounts = {};
const decisionCounts = {};
for (const s of scenarios) {
  const v = PolicyEngine.evaluate(s);
  ruleCounts[v.rule] = (ruleCounts[v.rule] || 0) + 1;
  decisionCounts[v.decision] = (decisionCounts[v.decision] || 0) + 1;
}
console.error("Total scenarios:", scenarios.length);
console.error("By rule:", ruleCounts);
console.error("By decision:", decisionCounts);
