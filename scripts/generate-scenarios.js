/**
 * Builds tests.csv for the v4 multi-company eval from docs/policy-engine.js.
 *
 * Same overall shape as the v3 generator: a seeded PRNG (mulberry32) for the random-fill
 * portion, hand-picked "explicit" scenarios per company that exercise every rule branch at
 * least twice, an "adversarial" set per company testing ambiguity/distraction/catch-all
 * robustness, a NEW cross-company adversarial set testing whether the model conflates
 * similar-sounding systems that belong to different companies, then a random fill to round
 * the total out and add realistic variety. A coverage summary prints to stderr at the end.
 *
 * Every row's expected decision and expected rule tag are computed by running the actual
 * engine, never hardcoded, so the answer key can never drift from the policy logic.
 */
const PE = require("../docs/policy-engine.js");

const TOTAL_ROWS = 150;

// ---------------------------------------------------------------------------------------
// PRNG (seeded, so the random-fill portion is reproducible run to run)
// ---------------------------------------------------------------------------------------

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260811);
function pick(rngFn, arr) {
  return arr[Math.floor(rngFn() * arr.length)];
}
function pickApprovals(rngFn) {
  return pick(rngFn, [0, 0, 1, 1, 2, 2, 3]);
}
function pickBool(rngFn, trueBias) {
  return rngFn() < (trueBias === undefined ? 0.5 : trueBias);
}

// ---------------------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------------------

function csvEscape(value) {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function yesNo(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

function key(row) {
  return [row.company, row.role, row.department, row.resource, row.approvals, row.offboarding, row.incidentActive, row.emergencyActive, row.directReport].join("|");
}

// ---------------------------------------------------------------------------------------
// Request-context block builder (per-company: irrelevant fields are simply omitted rather
// than shown as "N/A" for a whole company, since Meridian and Vertex don't have some of the
// fields Fernwood has at all)
// ---------------------------------------------------------------------------------------

function buildRequestContext(company, s) {
  const lines = [];
  if (company === "fernwood") {
    lines.push("Prior manager approvals already obtained: " + s.approvals);
    lines.push("Requester's account currently in offboarding: " + yesNo(!!s.offboarding));
    lines.push("Active declared security incident right now: " + yesNo(!!s.incidentActive));
    const directReportLine = s.resource === "Employee Records"
      ? "Records requested belong to requester's own direct report: " + yesNo(s.directReport)
      : "Records requested belong to requester's own direct report: N/A for this resource";
    lines.push(directReportLine);
  } else if (company === "meridian") {
    lines.push("Prior approvals already obtained: " + s.approvals);
    lines.push("Requester's account currently in offboarding: " + yesNo(!!s.offboarding));
    lines.push("Active declared clinical emergency right now: " + yesNo(!!s.emergencyActive));
  } else if (company === "vertex") {
    lines.push("Prior approvals already obtained: " + s.approvals);
    lines.push("Requester's account currently in offboarding: " + yesNo(!!s.offboarding));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------
// Row builder: runs the actual engine so expected/expected_rule can never drift from policy
// ---------------------------------------------------------------------------------------

const COMPANY_LABELS = PE.COMPANY_LABELS;
const RULE_PREFIX = PE.RULE_PREFIX;

function buildRow(company, s) {
  const engineInput = {
    role: s.role,
    department: s.department,
    resource: s.resource,
    approvals: s.approvals,
    offboarding: !!s.offboarding,
  };
  if (company === "fernwood") {
    engineInput.incidentActive = !!s.incidentActive;
    engineInput.directReport = s.directReport;
  } else if (company === "meridian") {
    engineInput.emergencyActive = !!s.emergencyActive;
  }

  const outcome = PE.evaluate(company, engineInput, s.config);
  const displayResource = s.resourceLabel || s.resource;

  let request = s.request;
  if (!request) {
    request = "A " + s.role + " in " + s.department + " wants access to " + displayResource + ".";
  }
  if (s.redHerring) {
    request = request + " " + s.redHerring;
  }

  return {
    company: company,
    companyLabel: COMPANY_LABELS[company],
    role: s.role,
    department: s.department,
    resource: displayResource,
    approvals: s.approvals,
    offboarding: !!s.offboarding,
    requestContext: buildRequestContext(company, s),
    request: request,
    expected: outcome.decision,
    expected_rule: outcome.rule,
    expected_company_prefix: RULE_PREFIX[company],
    reasoning: outcome.citation,
  };
}

// =========================================================================================
// FERNWOOD SYSTEMS: explicit scenarios (every F1-F10 branch covered at least once, the
// tighter/edge-case branches covered twice)
// =========================================================================================

const fernwoodExplicit = [
  // F1: offboarding override, always wins regardless of resource/role/approvals
  { role: "Manager", department: "Engineering", resource: "Production Database", approvals: 3, offboarding: true, incidentActive: false,
    request: "A Manager in Engineering whose account is currently being offboarded still wants Production Database access before their last day." },

  // F2: Admin Console
  { role: "Admin", department: "Engineering", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Admin in Engineering wants their standing Admin Console access confirmed." },
  { role: "Admin", department: "Finance", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Admin in Finance requests Admin Console access." },
  { role: "Manager", department: "Sales", resource: "Admin Console", approvals: 2, offboarding: false, incidentActive: false,
    request: "A Manager in Sales with two prior approvals wants Admin Console access." },
  { role: "Manager", department: "Support", resource: "Admin Console", approvals: 2, offboarding: false, incidentActive: false,
    request: "A Manager in Support with two prior approvals from senior leadership requests Admin Console access." },
  { role: "Employee", department: "Engineering", resource: "Admin Console", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Employee in Engineering requests Admin Console access with no approvals yet." },
  { role: "Manager", department: "Engineering", resource: "Admin Console", approvals: 1, offboarding: false, incidentActive: false,
    request: "A Manager in Engineering with only one prior approval requests Admin Console access." },

  // F3: Incident Response Tools
  { role: "Employee", department: "Security", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Employee on the Security team requests Incident Response Tools access." },
  { role: "Manager", department: "Security", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Manager on the Security team requests Incident Response Tools access." },
  { role: "Employee", department: "Engineering", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: true,
    request: "An Employee in Engineering with zero prior approvals requests Incident Response Tools access during an active incident." },
  { role: "Manager", department: "Sales", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: true,
    request: "A Manager in Sales with no prior approvals requests Incident Response Tools access during an active incident." },
  { role: "Employee", department: "Engineering", resource: "Incident Response Tools", approvals: 2, offboarding: false, incidentActive: false,
    request: "An Employee in Engineering with two prior approvals requests Incident Response Tools access, but there is no active incident." },
  { role: "Manager", department: "Finance", resource: "Incident Response Tools", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Manager in Finance requests Incident Response Tools access with no active incident and no approvals." },

  // F4: Finance-restricted systems (spread across all three named systems)
  { role: "Employee", department: "Finance", resource: "Billing System", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Finance Employee requests Billing System access." },
  { role: "Manager", department: "Finance", resource: "Payroll System", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Finance Manager requests Payroll System access." },
  { role: "Intern", department: "Finance", resource: "Financial Reports", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Finance Intern requests access to Financial Reports." },
  { role: "Intern", department: "Finance", resource: "Billing System", approvals: 2, offboarding: false, incidentActive: false,
    request: "A Finance Intern with two prior approvals requests Billing System access." },
  { role: "Employee", department: "Sales", resource: "Billing System", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Sales Employee with no approvals requests Billing System access." },
  { role: "Employee", department: "Engineering", resource: "Payroll System", approvals: 3, offboarding: false, incidentActive: false,
    request: "An Engineering Employee with three prior approvals requests Payroll System access, hoping seniority-adjacent approval count is enough." },

  // F5: Customer PII
  { role: "Employee", department: "Support", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Support Employee requests Customer PII access to resolve a ticket." },
  { role: "Employee", department: "Security", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Security Employee requests Customer PII access for an investigation." },
  { role: "Employee", department: "Engineering", resource: "Customer PII", approvals: 1, offboarding: false, incidentActive: false,
    request: "An Engineering Employee with one prior approval requests Customer PII access to debug a data issue." },
  { role: "Manager", department: "Engineering", resource: "Customer PII", approvals: 1, offboarding: false, incidentActive: false,
    request: "An Engineering Manager with one prior approval requests Customer PII access for debugging." },
  { role: "Employee", department: "Engineering", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Employee with zero prior approvals requests Customer PII access." },
  { role: "Manager", department: "Sales", resource: "Customer PII", approvals: 2, offboarding: false, incidentActive: false,
    request: "A Sales Manager with two prior approvals requests Customer PII access." },

  // F6: Production Database
  { role: "Intern", department: "Engineering", resource: "Production Database", approvals: 2, offboarding: false, incidentActive: false,
    request: "An Engineering Intern with two prior approvals requests Production Database access." },
  { role: "Intern", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Intern with zero prior approvals requests Production Database access." },
  { role: "Contractor", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Contractor requests Production Database access." },
  { role: "Contractor", department: "Engineering", resource: "Production Database", approvals: 2, offboarding: false, incidentActive: false,
    request: "An Engineering Contractor with two prior approvals requests Production Database access." },
  { role: "Employee", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Employee requests Production Database access." },
  { role: "Manager", department: "Engineering", resource: "Production Database", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Manager requests Production Database access." },

  // F7: Source Code Repository
  { role: "Contractor", department: "Engineering", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Contractor requests Source Code Repository access." },
  { role: "Intern", department: "Engineering", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Engineering Intern requests Source Code Repository access." },
  { role: "Contractor", department: "Sales", resource: "Source Code Repository", approvals: 3, offboarding: false, incidentActive: false,
    request: "A Sales Contractor with three prior approvals requests Source Code Repository access." },
  { role: "Contractor", department: "Support", resource: "Source Code Repository", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Support Contractor requests Source Code Repository access." },
  { role: "Employee", department: "Finance", resource: "Source Code Repository", approvals: 1, offboarding: false, incidentActive: false,
    request: "A Finance Employee with one prior approval requests Source Code Repository access to review a billing integration." },
  { role: "Manager", department: "Sales", resource: "Source Code Repository", approvals: 1, offboarding: false, incidentActive: false,
    request: "A Sales Manager with one prior approval requests Source Code Repository access." },

  // F8: Employee Records
  { role: "Employee", department: "People", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false,
    request: "A People (HR) Employee requests Employee Records access." },
  { role: "Manager", department: "Sales", resource: "Employee Records", approvals: 3, offboarding: false, incidentActive: false, directReport: undefined,
    request: "A Sales Manager with three prior approvals requests Employee Records access; the request doesn't say whether it's for their own direct report." },
  { role: "Manager", department: "Finance", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: undefined,
    request: "A Finance Manager requests Employee Records access without stating whose records they are." },
  { role: "Manager", department: "Support", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: false,
    request: "A Support Manager requests Employee Records access for someone confirmed not to be their own direct report." },
  { role: "Employee", department: "Sales", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Sales Employee with no approvals requests Employee Records access." },

  // F9: Vendor Contracts
  { role: "Employee", department: "Finance", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Finance Employee requests Vendor Contracts access." },
  { role: "Manager", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Sales Manager requests Vendor Contracts access." },
  { role: "Employee", department: "Sales", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Sales Employee requests Vendor Contracts access." },
  { role: "Intern", department: "Sales", resource: "Vendor Contracts", approvals: 1, offboarding: false, incidentActive: false,
    request: "A Sales Intern with one prior approval requests Vendor Contracts access." },
  { role: "Employee", department: "Engineering", resource: "Vendor Contracts", approvals: 3, offboarding: false, incidentActive: false,
    request: "An Engineering Employee with three prior approvals requests Vendor Contracts access." },

  // F10: catch-all, using both the generic "Other / Unlisted System" option and an invented name
  { role: "Employee", department: "Engineering", resource: "Other / Unlisted System", resourceLabel: "internal design-tools wiki", approvals: 2, offboarding: false, incidentActive: false,
    request: "An Engineering Employee with two prior approvals requests access to the internal design-tools wiki, a system with no dedicated rule." },
  { role: "Employee", department: "Sales", resource: "Other / Unlisted System", resourceLabel: "a newly-launched partner portal", approvals: 1, offboarding: false, incidentActive: false,
    request: "A Sales Employee with one prior approval requests access to a newly-launched partner portal that predates any specific policy for it." },
  { role: "Employee", department: "Support", resource: "Other / Unlisted System", resourceLabel: "the legacy ticketing archive", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Support Employee with zero prior approvals requests access to the legacy ticketing archive." },
];

// F: adversarial cases (ambiguity, distraction, catch-all robustness), adapted from the v3 set
const fernwoodAdversarial = [
  { role: "Manager", department: "Engineering", resource: "Employee Records", approvals: 3, offboarding: false, incidentActive: false, directReport: undefined,
    request: "An Engineering Manager with three prior approvals requests Employee Records access. The request does not say whose records these are; the manager mentions they've been with Fernwood for six years." },
  { role: "Employee", department: "Engineering", resource: "Production Database", approvals: 2, offboarding: true, incidentActive: false,
    request: "An Engineering Employee with two prior approvals requests Production Database access. Their account happens to already be in the offboarding process after a role change was finalized this morning." },
  { role: "Admin", department: "Finance", resource: "Financial Reports", approvals: 0, offboarding: false, incidentActive: false,
    request: "An Admin who happens to sit in the Finance department requests Financial Reports access, describing it as routine year-end review work." },
  { role: "Employee", department: "Engineering", resource: "Other / Unlisted System", resourceLabel: "a brand-new AI code-review tool", approvals: 1, offboarding: false, incidentActive: false,
    request: "An Engineering Employee with one prior approval requests access to a brand-new AI code-review tool the team started piloting last week; it doesn't appear anywhere in the current policy." },
  { role: "Intern", department: "Engineering", resource: "Source Code Repository", approvals: 3, offboarding: false, incidentActive: false,
    request: "An Engineering Intern with three prior approvals from senior staff requests Source Code Repository access, noting the unusually high approval count." },
  { role: "Manager", department: "Sales", resource: "Admin Console", approvals: 1, offboarding: false, incidentActive: false,
    request: "A Sales Manager requests Admin Console access, citing a single approval from the VP of Sales as sufficient given the urgency of a client demo." },
  { role: "Employee", department: "Security", resource: "Incident Response Tools", approvals: 0, offboarding: true, incidentActive: true,
    request: "A Security Employee requests Incident Response Tools access during an active incident, but their own account is mid-offboarding after resigning yesterday." },
  { role: "Contractor", department: "Engineering", resource: "Production Database", approvals: 3, offboarding: false, incidentActive: false,
    request: "An Engineering Contractor with three prior approvals, more than any Employee in the same scenario set needed, requests Production Database access." },
  { role: "Manager", department: "People", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: false,
    request: "A Manager who also happens to work in the People (HR) department requests Employee Records access for someone who is explicitly not their direct report." },
  { role: "Employee", department: "Engineering", resource: "Customer PII", approvals: 0, offboarding: false, incidentActive: true,
    request: "An Engineering Employee requests Customer PII access, and separately mentions there's an active security incident going on elsewhere at the company, though it has nothing to do with this specific request." },
];

// =========================================================================================
// MERIDIAN HEALTH: explicit scenarios (every M1-M8 branch covered)
// =========================================================================================

const meridianExplicit = [
  // M1: offboarding override
  { role: "Clinician", department: "Clinical Care", resource: "Patient Records (EHR)", approvals: 2, offboarding: true, emergencyActive: true,
    request: "A Clinician in Clinical Care whose account is currently being offboarded requests Patient Records access, even with an active clinical emergency underway." },
  { role: "Compliance Officer", department: "Compliance", resource: "Audit Logs", approvals: 0, offboarding: true, emergencyActive: false,
    request: "A Compliance Officer whose contract has already ended requests Audit Logs access." },

  // M2: Patient Records (EHR)
  { role: "Clinician", department: "Clinical Care", resource: "Patient Records (EHR)", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Clinician in Clinical Care requests Patient Records access for a patient on their own service." },
  { role: "Nurse", department: "Clinical Care", resource: "Patient Records (EHR)", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Nurse in Clinical Care requests Patient Records access." },
  { role: "Clinician", department: "Research", resource: "Patient Records (EHR)", approvals: 0, offboarding: false, emergencyActive: true,
    request: "A Clinician normally assigned to Research requests Patient Records access outside their usual assignment, during an active declared clinical emergency, with no prior approval yet." },
  { role: "Billing Coordinator", department: "Billing", resource: "Patient Records (EHR)", approvals: 1, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator with one prior approval requests Patient Records access to resolve a claims discrepancy." },
  { role: "Billing Coordinator", department: "Billing", resource: "Patient Records (EHR)", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator with no prior approval requests Patient Records access." },
  { role: "Clinician", department: "Research", resource: "Patient Records (EHR)", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Clinician assigned to Research requests Patient Records access outside a clinical emergency, despite having two prior approvals on hand." },

  // M3: Pharmacy System
  { role: "Clinician", department: "Clinical Care", resource: "Pharmacy System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Clinician requests Pharmacy System access to review a medication order." },
  { role: "Nurse", department: "Clinical Care", resource: "Pharmacy System", approvals: 1, offboarding: false, emergencyActive: false,
    request: "A Nurse with one prior approval requests Pharmacy System access." },
  { role: "Nurse", department: "Clinical Care", resource: "Pharmacy System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Nurse with no prior approval requests Pharmacy System access." },
  { role: "IT Admin", department: "IT", resource: "Pharmacy System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "An IT Admin requests Pharmacy System access to run scheduled maintenance." },
  { role: "Compliance Officer", department: "Compliance", resource: "Pharmacy System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer requests Pharmacy System access for an audit of controlled-substance dispensing." },
  { role: "Billing Coordinator", department: "Billing", resource: "Pharmacy System", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator with three prior approvals requests Pharmacy System access." },

  // M4: Billing/Claims System
  { role: "Billing Coordinator", department: "Billing", resource: "Billing/Claims System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator requests Billing/Claims System access." },
  { role: "Compliance Officer", department: "Compliance", resource: "Billing/Claims System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer requests Billing/Claims System access for a claims audit." },
  { role: "Clinician", department: "Clinical Care", resource: "Billing/Claims System", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Clinician with two prior approvals requests Billing/Claims System access." },
  { role: "Nurse", department: "Clinical Care", resource: "Billing/Claims System", approvals: 1, offboarding: false, emergencyActive: false,
    request: "A Nurse with one prior approval requests Billing/Claims System access." },
  { role: "IT Admin", department: "IT", resource: "Billing/Claims System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "An IT Admin with no prior approval requests Billing/Claims System access." },

  // M5: Lab Results
  { role: "Clinician", department: "Clinical Care", resource: "Lab Results", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Clinician requests Lab Results access for a patient under their care." },
  { role: "Nurse", department: "Clinical Care", resource: "Lab Results", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Nurse requests Lab Results access." },
  { role: "Billing Coordinator", department: "Billing", resource: "Lab Results", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator requests Lab Results access." },
  { role: "Billing Coordinator", department: "Billing", resource: "Lab Results", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator with three prior approvals requests Lab Results access, arguing the high approval count should be enough." },
  { role: "Compliance Officer", department: "Compliance", resource: "Lab Results", approvals: 1, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer with one prior approval requests Lab Results access for an audit." },

  // M6: Research Data Repository
  { role: "Compliance Officer", department: "Compliance", resource: "Research Data Repository", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer requests Research Data Repository access for governance review." },
  { role: "IT Admin", department: "IT", resource: "Research Data Repository", approvals: 0, offboarding: false, emergencyActive: false,
    request: "An IT Admin requests Research Data Repository access." },
  { role: "Clinician", department: "Research", resource: "Research Data Repository", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Clinician in Research with two prior approvals, representing IRB sign-off, requests Research Data Repository access." },
  { role: "Clinician", department: "Research", resource: "Research Data Repository", approvals: 1, offboarding: false, emergencyActive: false,
    request: "A Clinician in Research with only one prior approval requests Research Data Repository access." },
  { role: "Nurse", department: "Research", resource: "Research Data Repository", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Nurse in Research with three prior approvals requests Research Data Repository access." },

  // M7: Audit Logs
  { role: "Compliance Officer", department: "Compliance", resource: "Audit Logs", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer requests Audit Logs access." },
  { role: "IT Admin", department: "IT", resource: "Audit Logs", approvals: 0, offboarding: false, emergencyActive: false,
    request: "An IT Admin requests Audit Logs access." },
  { role: "Clinician", department: "Clinical Care", resource: "Audit Logs", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Clinician with three prior approvals requests Audit Logs access." },
  { role: "Nurse", department: "Clinical Care", resource: "Audit Logs", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Nurse with two prior approvals requests Audit Logs access." },

  // M8: catch-all
  { role: "IT Admin", department: "IT", resource: "Other / Unlisted System", resourceLabel: "a new patient-portal messaging tool", approvals: 1, offboarding: false, emergencyActive: false,
    request: "An IT Admin with one prior approval requests access to a new patient-portal messaging tool that isn't covered by an explicit rule yet." },
  { role: "Clinician", department: "Clinical Care", resource: "Other / Unlisted System", resourceLabel: "a vendor-run telehealth scheduling add-on", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Clinician with no prior approvals requests access to a vendor-run telehealth scheduling add-on with no dedicated rule." },
  { role: "Billing Coordinator", department: "Billing", resource: "Other / Unlisted System", resourceLabel: "a legacy claims-archive viewer", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator with two prior approvals requests access to a legacy claims-archive viewer, hoping a high approval count is enough to skip the human review step." },
];

const meridianAdversarial = [
  { role: "Clinician", department: "Clinical Care", resource: "Patient Records (EHR)", approvals: 0, offboarding: true, emergencyActive: true,
    request: "A Clinician in Clinical Care requests Patient Records access during an active clinical emergency, but their own account is already flagged for offboarding after handing in notice this week." },
  { role: "Nurse", department: "Clinical Care", resource: "Lab Results", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Nurse with an unusually high approval count of three requests Lab Results access, though standing access alone should already cover it." },
  { role: "Billing Coordinator", department: "Billing", resource: "Lab Results", approvals: 5, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator with five prior approvals, far more than any other scenario in this set, requests Lab Results access, arguing the sheer approval count should override the usual restriction." },
  { role: "Compliance Officer", department: "Compliance", resource: "Audit Logs", approvals: 10, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer requests Audit Logs access, which they already have standing access to; the request mentions ten prior approvals as if that were relevant." },
  { role: "Clinician", department: "Clinical Care", resource: "Other / Unlisted System", resourceLabel: "a hospital-wide staffing dashboard", approvals: 0, offboarding: false, emergencyActive: true,
    request: "A Clinician requests access to a hospital-wide staffing dashboard, a system with no dedicated rule, during an active clinical emergency; the emergency flag doesn't apply here since this isn't Patient Records." },
  { role: "IT Admin", department: "Research", resource: "Research Data Repository", approvals: 0, offboarding: false, emergencyActive: false,
    request: "An IT Admin who happens to be assigned to the Research department requests Research Data Repository access, describing it as routine infrastructure work." },
  { role: "Nurse", department: "Clinical Care", resource: "Patient Records (EHR)", approvals: 5, offboarding: false, emergencyActive: false,
    request: "A Nurse in Clinical Care with five prior approvals requests Patient Records access, mentioning the high approval count even though standing access already applies." },
  { role: "Compliance Officer", department: "Billing", resource: "Billing/Claims System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer who happens to sit in the Billing department requests Billing/Claims System access, describing it as a routine audit visit." },
];

// =========================================================================================
// VERTEX CAPITAL: explicit scenarios (every V1-V8 branch covered)
// =========================================================================================

const vertexExplicit = [
  // V1: offboarding override

  // V2: Trading System (Order Entry)
  { role: "Trader", department: "Trading Desk", resource: "Trading System (Order Entry)", approvals: 0, offboarding: false,
    request: "A Trader requests Trading System access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Trading System (Order Entry)", approvals: 0, offboarding: false,
    request: "A Portfolio Manager requests Trading System access." },
  { role: "Admin", department: "IT", resource: "Trading System (Order Entry)", approvals: 0, offboarding: false,
    request: "An Admin requests Trading System access for system administration purposes." },
  { role: "Compliance Officer", department: "Compliance", resource: "Trading System (Order Entry)", approvals: 0, offboarding: false,
    request: "A Compliance Officer requests Trading System access." },
  { role: "Compliance Officer", department: "Compliance", resource: "Trading System (Order Entry)", approvals: 5, offboarding: false,
    request: "A Compliance Officer with five prior approvals, far more than usual, still requests Trading System access." },
  { role: "Ops Analyst", department: "Operations", resource: "Trading System (Order Entry)", approvals: 2, offboarding: false,
    request: "An Ops Analyst with two prior approvals requests Trading System access." },

  // V3: Client Accounts
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Client Accounts", approvals: 0, offboarding: false,
    request: "A Portfolio Manager requests Client Accounts access." },
  { role: "Ops Analyst", department: "Operations", resource: "Client Accounts", approvals: 0, offboarding: false,
    request: "An Ops Analyst requests Client Accounts access for servicing." },
  { role: "Compliance Officer", department: "Compliance", resource: "Client Accounts", approvals: 0, offboarding: false,
    request: "A Compliance Officer requests Client Accounts access for oversight." },
  { role: "Trader", department: "Trading Desk", resource: "Client Accounts", approvals: 1, offboarding: false,
    request: "A Trader with one prior approval requests Client Accounts access to check on a client's position." },
  { role: "Trader", department: "Trading Desk", resource: "Client Accounts", approvals: 0, offboarding: false,
    request: "A Trader with no prior approval requests Client Accounts access." },
  { role: "Admin", department: "IT", resource: "Client Accounts", approvals: 2, offboarding: false,
    request: "An Admin with two prior approvals requests Client Accounts access." },

  // V4: Trade Blotter. Note: all five Vertex roles have standing access to the Trade Blotter
  // (see docs/policy-engine.js), so the rule's "everyone else, one approval, escalate; otherwise
  // deny" clause has no role left to apply to under the current role set. It's intentionally
  // written into the policy as a forward-looking catch-all in case a new role is ever added, but
  // it's unreachable today, so there are no DENY/ESCALATE rows for V4 below.
  { role: "Compliance Officer", department: "Compliance", resource: "Trade Blotter", approvals: 0, offboarding: false,
    request: "A Compliance Officer requests Trade Blotter access." },
  { role: "Ops Analyst", department: "Operations", resource: "Trade Blotter", approvals: 0, offboarding: false,
    request: "An Ops Analyst requests Trade Blotter access." },
  { role: "Trader", department: "Trading Desk", resource: "Trade Blotter", approvals: 0, offboarding: false,
    request: "A Trader requests Trade Blotter access for their own trade records." },

  // V5: Model Risk Repository
  { role: "Compliance Officer", department: "Compliance", resource: "Model Risk Repository", approvals: 0, offboarding: false,
    request: "A Compliance Officer requests Model Risk Repository access for model validation." },
  { role: "Admin", department: "IT", resource: "Model Risk Repository", approvals: 0, offboarding: false,
    request: "An Admin requests Model Risk Repository access for hosting purposes." },
  { role: "Trader", department: "Trading Desk", resource: "Model Risk Repository", approvals: 3, offboarding: false,
    request: "A Trader with three prior approvals requests Model Risk Repository access, arguing the approval count should be enough." },
  { role: "Trader", department: "Trading Desk", resource: "Model Risk Repository", approvals: 0, offboarding: false,
    request: "A Trader with no prior approval requests Model Risk Repository access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Model Risk Repository", approvals: 1, offboarding: false,
    request: "A Portfolio Manager with one prior approval requests Model Risk Repository access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Model Risk Repository", approvals: 0, offboarding: false,
    request: "A Portfolio Manager with no prior approval requests Model Risk Repository access." },

  // V6: Regulatory Filings
  { role: "Compliance Officer", department: "Compliance", resource: "Regulatory Filings", approvals: 0, offboarding: false,
    request: "A Compliance Officer requests Regulatory Filings access." },
  { role: "Admin", department: "IT", resource: "Regulatory Filings", approvals: 0, offboarding: false,
    request: "An Admin requests Regulatory Filings access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Regulatory Filings", approvals: 2, offboarding: false,
    request: "A Portfolio Manager with two prior approvals requests Regulatory Filings access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Regulatory Filings", approvals: 1, offboarding: false,
    request: "A Portfolio Manager with only one prior approval requests Regulatory Filings access." },
  { role: "Trader", department: "Trading Desk", resource: "Regulatory Filings", approvals: 3, offboarding: false,
    request: "A Trader with three prior approvals requests Regulatory Filings access." },

  // V7: Audit Trail
  { role: "Compliance Officer", department: "Compliance", resource: "Audit Trail", approvals: 0, offboarding: false,
    request: "A Compliance Officer requests Audit Trail access." },
  { role: "Admin", department: "IT", resource: "Audit Trail", approvals: 0, offboarding: false,
    request: "An Admin requests Audit Trail access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Audit Trail", approvals: 5, offboarding: false,
    request: "A Portfolio Manager with five prior approvals requests Audit Trail access." },

  // V8: catch-all
  { role: "Ops Analyst", department: "Operations", resource: "Other / Unlisted System", resourceLabel: "a new counterparty-onboarding portal", approvals: 2, offboarding: false,
    request: "An Ops Analyst with two prior approvals requests access to a new counterparty-onboarding portal with no dedicated rule." },
  { role: "Trader", department: "Trading Desk", resource: "Other / Unlisted System", resourceLabel: "a third-party market-data terminal", approvals: 1, offboarding: false,
    request: "A Trader with one prior approval requests access to a third-party market-data terminal that isn't covered by name in the policy." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Other / Unlisted System", resourceLabel: "an internal scenario-analysis tool", approvals: 0, offboarding: false,
    request: "A Portfolio Manager with no prior approval requests access to an internal scenario-analysis tool with no dedicated rule." },
];

const vertexAdversarial = [
  { role: "Compliance Officer", department: "Compliance", resource: "Trading System (Order Entry)", approvals: 10, offboarding: false,
    request: "A Compliance Officer with ten prior approvals, an unusually large number, requests Trading System access, arguing that enough sign-off should override the usual restriction." },
  { role: "Trader", department: "Trading Desk", resource: "Model Risk Repository", approvals: 5, offboarding: true,
    request: "A Trader with five prior approvals requests Model Risk Repository access; separately, their account is already in the offboarding process after a transfer to a different desk." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Trade Blotter", approvals: 0, offboarding: false,
    request: "A Portfolio Manager requests Trade Blotter access, and the request mentions in passing that the desk had a strong quarter, which has no bearing on the access decision." },
  { role: "Ops Analyst", department: "Operations", resource: "Trading System (Order Entry)", approvals: 1, offboarding: false,
    request: "An Ops Analyst with one prior approval requests Trading System access, one short of the two-approval threshold, framing it as urgent due to a settlement deadline." },
  { role: "Admin", department: "IT", resource: "Other / Unlisted System", resourceLabel: "a vendor-hosted disaster-recovery console", approvals: 0, offboarding: true,
    request: "An Admin requests access to a vendor-hosted disaster-recovery console with no dedicated rule, but their own account is currently being offboarded." },
  { role: "Trader", department: "Trading Desk", resource: "Audit Trail", approvals: 8, offboarding: false,
    request: "A Trader with eight prior approvals, the highest approval count in this scenario set, requests Audit Trail access." },
  { role: "Portfolio Manager", department: "Portfolio Management", resource: "Regulatory Filings", approvals: 5, offboarding: false,
    request: "A Portfolio Manager with five prior approvals, well above the two normally needed, requests Regulatory Filings access." },
  { role: "Compliance Officer", department: "Compliance", resource: "Model Risk Repository", approvals: 0, offboarding: true,
    request: "A Compliance Officer requests Model Risk Repository access, which they'd normally have standing access to, but their contract already ended yesterday." },
];

// =========================================================================================
// CROSS-COMPANY ADVERSARIAL: same-sounding systems across different companies, governed by
// completely different rules. Tests whether the model keeps each company's policy separate
// instead of borrowing a rule from a similarly-named system belonging to a different company.
// =========================================================================================

const crossCompanyAdversarial = [
  { company: "meridian", role: "Billing Coordinator", department: "Billing", resource: "Billing/Claims System", approvals: 0, offboarding: false, emergencyActive: false,
    request: "A Billing Coordinator requests access to Meridian's Billing/Claims System. Note this is a distinct system from a generic corporate 'Billing System', which some companies govern under entirely different rules." },
  { company: "fernwood", role: "Employee", department: "Finance", resource: "Billing System", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Finance Employee at Fernwood Systems requests access to the Billing System, not to be confused with a hospital's Billing/Claims System, which is a different resource under a different policy entirely." },
  { company: "vertex", role: "Ops Analyst", department: "Operations", resource: "Audit Trail", approvals: 3, offboarding: false,
    request: "An Ops Analyst requests access to Vertex's Audit Trail. This is a distinct system from Meridian's Audit Logs; both happen to be audit-flavored systems, but the two companies grade them under completely separate rules." },
  { company: "meridian", role: "Nurse", department: "Clinical Care", resource: "Audit Logs", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Nurse requests access to Meridian's Audit Logs, a system that sounds similar to Vertex's Audit Trail but belongs to an entirely different company's policy." },
  { company: "vertex", role: "Portfolio Manager", department: "Portfolio Management", resource: "Model Risk Repository", approvals: 1, offboarding: false,
    request: "A Portfolio Manager requests access to Vertex's Model Risk Repository. This should not be confused with Meridian's Research Data Repository; both are 'repositories' but governed by unrelated rules at unrelated companies." },
  { company: "meridian", role: "Clinician", department: "Research", resource: "Research Data Repository", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Clinician in Research requests access to Meridian's Research Data Repository, distinct from Vertex's Model Risk Repository despite the shared 'Repository' naming." },
  { company: "fernwood", role: "Manager", department: "People", resource: "Employee Records", approvals: 0, offboarding: false, incidentActive: false, directReport: true,
    request: "A People (HR) Manager at Fernwood requests Employee Records access for their own direct report. This is a corporate HR system, unrelated to a hospital's Patient Records (EHR), despite both being called 'Records'." },
  { company: "meridian", role: "IT Admin", department: "IT", resource: "Patient Records (EHR)", approvals: 0, offboarding: false, emergencyActive: false,
    request: "An IT Admin at Meridian requests Patient Records (EHR) access for system maintenance. This is a clinical records system, unrelated to a corporation's Employee Records, despite both being called 'Records'." },
];

// =========================================================================================
// Assemble explicit + adversarial rows, then dedup, then random-fill to TOTAL_ROWS
// =========================================================================================


// Gap-fill: a few additional rows added after an initial coverage-summary pass showed these
// specific rule+decision branches were under-represented (fewer than two rows). Kept as a
// separate small array rather than folded back into the explicit arrays above so it's clear
// these were added deliberately to close coverage gaps, not just more of the same.
const gapFill = [
  { company: "fernwood", role: "Employee", department: "Support", resource: "Other / Unlisted System", resourceLabel: "a new team scheduling tool", approvals: 3, offboarding: false, incidentActive: false,
    request: "A Support Employee with three prior approvals requests access to a new team scheduling tool with no dedicated rule." },
  { company: "fernwood", role: "Contractor", department: "Sales", resource: "Other / Unlisted System", resourceLabel: "an unlisted vendor portal", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Sales Contractor with zero prior approvals requests access to an unlisted vendor portal." },
  { company: "fernwood", role: "Employee", department: "Support", resource: "Vendor Contracts", approvals: 0, offboarding: false, incidentActive: false,
    request: "A Support Employee requests Vendor Contracts access, well outside Finance or Sales." },
  { company: "meridian", role: "Nurse", department: "Research", resource: "Pharmacy System", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Nurse assigned to Research with two prior approvals requests Pharmacy System access." },
  { company: "meridian", role: "Nurse", department: "Clinical Care", resource: "Billing/Claims System", approvals: 2, offboarding: false, emergencyActive: false,
    request: "A Nurse with two prior approvals requests Billing/Claims System access." },
  { company: "meridian", role: "Compliance Officer", department: "Compliance", resource: "Lab Results", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Compliance Officer with three prior approvals requests Lab Results access as part of an audit." },
  { company: "meridian", role: "Clinician", department: "Research", resource: "Research Data Repository", approvals: 3, offboarding: false, emergencyActive: false,
    request: "A Clinician in Research with three prior approvals requests Research Data Repository access." },
  { company: "vertex", role: "Ops Analyst", department: "Operations", resource: "Trading System (Order Entry)", approvals: 3, offboarding: false,
    request: "An Ops Analyst with three prior approvals requests Trading System access." },
  { company: "vertex", role: "Trader", department: "Trading Desk", resource: "Client Accounts", approvals: 2, offboarding: false,
    request: "A Trader with two prior approvals requests Client Accounts access." },
  { company: "vertex", role: "Portfolio Manager", department: "Portfolio Management", resource: "Model Risk Repository", approvals: 2, offboarding: false,
    request: "A Portfolio Manager with two prior approvals requests Model Risk Repository access." },
  { company: "vertex", role: "Compliance Officer", department: "Compliance", resource: "Other / Unlisted System", resourceLabel: "a new regulatory-news feed", approvals: 3, offboarding: false,
    request: "A Compliance Officer with three prior approvals requests access to a new regulatory-news feed with no dedicated rule." },
  { company: "vertex", role: "Admin", department: "IT", resource: "Other / Unlisted System", resourceLabel: "an unlisted internal tool", approvals: 0, offboarding: false,
    request: "An Admin with zero prior approvals requests access to an unlisted internal tool." },
  { company: "vertex", role: "Compliance Officer", department: "Compliance", resource: "Other / Unlisted System", resourceLabel: "a pilot compliance-tracking app", approvals: 1, offboarding: false,
    request: "A Compliance Officer with one prior approval requests access to a pilot compliance-tracking app with no dedicated rule." },
];

const handPicked = [];
fernwoodExplicit.forEach((s, i) => handPicked.push(["fernwood", s, "fernwoodExplicit", i]));
fernwoodAdversarial.forEach((s, i) => handPicked.push(["fernwood", s, "fernwoodAdversarial", i]));
meridianExplicit.forEach((s, i) => handPicked.push(["meridian", s, "meridianExplicit", i]));
meridianAdversarial.forEach((s, i) => handPicked.push(["meridian", s, "meridianAdversarial", i]));
vertexExplicit.forEach((s, i) => handPicked.push(["vertex", s, "vertexExplicit", i]));
vertexAdversarial.forEach((s, i) => handPicked.push(["vertex", s, "vertexAdversarial", i]));
crossCompanyAdversarial.forEach((s, i) => handPicked.push([s.company, s, "crossCompanyAdversarial", i]));
gapFill.forEach((s, i) => handPicked.push([s.company, s, "gapFill", i]));

const rows = [];
const seenKeys = new Set();

handPicked.forEach(([company, s, sourceName, sourceIndex]) => {
  const row = buildRow(company, s);
  row.source = sourceName;
  row.sourceIndex = sourceIndex;
  const k = key({ company, role: s.role, department: s.department, resource: s.resource, approvals: s.approvals, offboarding: !!s.offboarding, incidentActive: s.incidentActive, emergencyActive: s.emergencyActive, directReport: s.directReport });
  if (seenKeys.has(k)) return; // skip accidental duplicate combinations
  seenKeys.add(k);
  rows.push(row);
});

// ---------------------------------------------------------------------------------------
// Random fill: pseudo-random combinations across all three companies, deduplicated against
// everything already generated, to round the total out to TOTAL_ROWS and add variety beyond
// the hand-picked scenarios.
// ---------------------------------------------------------------------------------------

const FILL_PURPOSES = [
  "as part of a routine project", "to support an upcoming audit", "for a time-sensitive client request",
  "while covering for a teammate who is out this week", "to finish a quarter-end task",
  "as part of onboarding a new workflow", "to investigate a reported issue", "for a scheduled review",
];

function randomFillRow() {
  const company = pick(rng, PE.COMPANIES);
  const roles = PE.ROLES[company];
  const departments = PE.DEPARTMENTS[company];
  const resources = PE.RESOURCES[company];
  const role = pick(rng, roles);
  const department = pick(rng, departments);
  const resource = pick(rng, resources);
  const approvals = pickApprovals(rng);
  const offboarding = pickBool(rng, 0.12);
  const s = { role, department, resource, approvals, offboarding };
  if (company === "fernwood") {
    s.incidentActive = pickBool(rng, 0.25);
    if (resource === "Employee Records" && role === "Manager") {
      const roll = rng();
      s.directReport = roll < 0.34 ? true : roll < 0.67 ? false : undefined;
    }
  } else if (company === "meridian") {
    s.emergencyActive = pickBool(rng, 0.2);
  }
  if (resource === "Other / Unlisted System") {
    s.resourceLabel = pick(rng, ["a pilot analytics dashboard", "a new internal wiki", "a vendor-run survey tool", "a legacy reporting export"]);
  }
  s.request = "A " + role + " in " + department + " requests access to " + (s.resourceLabel || resource) + " " + pick(rng, FILL_PURPOSES) + ".";
  return { company, s };
}

let fillAttempts = 0;
while (rows.length < TOTAL_ROWS && fillAttempts < TOTAL_ROWS * 40) {
  fillAttempts += 1;
  const { company, s } = randomFillRow();
  const k = key({ company, role: s.role, department: s.department, resource: s.resource, approvals: s.approvals, offboarding: !!s.offboarding, incidentActive: s.incidentActive, emergencyActive: s.emergencyActive, directReport: s.directReport });
  if (seenKeys.has(k)) continue;
  seenKeys.add(k);
  rows.push(buildRow(company, s));
}

// ---------------------------------------------------------------------------------------
// Emit CSV
// ---------------------------------------------------------------------------------------

const HEADER = ["id", "company", "role", "department", "resource", "approvals", "offboarding", "request_context", "request", "expected", "expected_rule", "expected_company_prefix", "reasoning"];
const lines = [HEADER.join(",")];

rows.forEach((row, i) => {
  const id = i + 1;
  lines.push([
    id,
    csvEscape(row.companyLabel),
    csvEscape(row.role),
    csvEscape(row.department),
    csvEscape(row.resource),
    csvEscape(row.approvals),
    csvEscape(row.offboarding ? "true" : "false"),
    csvEscape(row.requestContext),
    csvEscape(row.request),
    csvEscape(row.expected),
    csvEscape(row.expected_rule),
    csvEscape(row.expected_company_prefix),
    csvEscape(row.reasoning),
  ].join(","));
});

// Written unconditionally: this script is meant to be run directly (node scripts/generate-scenarios.js
// > tests.csv), but exporting `rows` also makes it easy to require this file from a quick coverage
// check or analysis script without re-running the whole generation pipeline.
process.stdout.write(lines.join("\n") + "\n");
module.exports = { rows: rows };

// ---------------------------------------------------------------------------------------
// Coverage summary to stderr
// ---------------------------------------------------------------------------------------

const byCompany = {};
const byRule = {};
const byDecision = { APPROVE: 0, DENY: 0, ESCALATE: 0 };

rows.forEach((row) => {
  byCompany[row.company] = (byCompany[row.company] || 0) + 1;
  const ruleKey = row.expected_rule + " (" + row.expected + ")";
  byRule[ruleKey] = (byRule[ruleKey] || 0) + 1;
  byDecision[row.expected] = (byDecision[row.expected] || 0) + 1;
});

console.error("Total rows: " + rows.length);
console.error("By company: " + JSON.stringify(byCompany));
console.error("By decision: " + JSON.stringify(byDecision));
console.error("By rule+decision branch:");
Object.keys(byRule).sort().forEach((k) => {
  console.error("  " + k + ": " + byRule[k]);
});
