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

const TOTAL_ROWS = 90;

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

  // R8 - Employee Records
  { role: "Employee", department: "People", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Engineering", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },
  { role: "Manager", department: "Sales", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false },
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

function key(s) {
  return [s.role, s.department, s.resource, s.approvals, s.offboarding, s.incidentActive].join("|");
}

const seen = new Set(explicit.map(key));
const scenarios = explicit.slice();

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
  let sentence = `${article} ${s.role} in the ${s.department} department requests access to ${s.resource}, with ${describeApprovals(
    s.approvals
  )}.`;
  if (s.offboarding) sentence += " The requester's account is in offboarding.";
  if (s.incidentActive) sentence += " There is an active declared security incident.";
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
