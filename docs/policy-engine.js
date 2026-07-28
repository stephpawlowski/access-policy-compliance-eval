/**
 * Fernwood Systems access policy engine (v2).
 *
 * This is the single source of truth for the policy logic used in this project:
 *  - the test generator (scripts/generate-scenarios.js) uses this file to compute
 *    the expected answer for every row in tests.csv
 *  - the live "try it yourself" simulator on the dashboard (docs/index.html) uses
 *    this exact same file, unmodified, to answer toggles instantly in the browser
 *
 * Keeping both on one file means the simulator and the eval's answer key can never
 * drift out of sync with each other.
 *
 * Works in both Node (via require/module.exports) and the browser (via window.PolicyEngine).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PolicyEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const ROLES = ["Employee", "Contractor", "Intern", "Manager", "Admin"];

  const DEPARTMENTS = [
    "Engineering",
    "Finance",
    "Sales",
    "Support",
    "People",
    "Security",
  ];

  const RESOURCES = [
    "Billing System",
    "Payroll System",
    "Financial Reports",
    "Customer PII",
    "Production Database",
    "Source Code Repository",
    "Employee Records",
    "Admin Console",
    "Vendor Contracts",
    "Incident Response Tools",
    "Other / Unlisted System",
  ];

  const FINANCE_SYSTEMS = ["Billing System", "Payroll System", "Financial Reports"];

  function result(decision, rule, citation) {
    return { decision, rule, citation };
  }

  /**
   * @param {Object} input
   * @param {string} input.role
   * @param {string} input.department
   * @param {string} input.resource
   * @param {number} input.approvals - number of prior manager approvals obtained (0, 1, or 2+)
   * @param {boolean} input.offboarding - true if the requester is in offboarding/terminated status
   * @param {boolean} input.incidentActive - true if there is an active declared security incident
   */
  function evaluate(input) {
    const role = input.role;
    const department = input.department;
    const resource = input.resource;
    const approvals = Number(input.approvals) || 0;
    const offboarding = !!input.offboarding;
    const incidentActive = !!input.incidentActive;

    // Rule 1: offboarding override beats everything else.
    if (offboarding) {
      return result(
        "DENY",
        "R1",
        "Rule 1: offboarded or terminated accounts lose all access immediately, regardless of role, department, resource, or prior approvals."
      );
    }

    // Rule 2: Admin Console.
    if (resource === "Admin Console") {
      if (role === "Admin") {
        return result("APPROVE", "R2", "Rule 2: Admins have standing access to the Admin Console.");
      }
      if (role === "Manager" && approvals >= 2) {
        return result(
          "ESCALATE",
          "R2",
          "Rule 2: Managers with two prior approvals may request Admin Console access, but it still requires final review before granting."
        );
      }
      return result(
        "DENY",
        "R2",
        "Rule 2: Admin Console access is restricted to the Admin role, or to Managers with two prior approvals under review."
      );
    }

    // Rule 3: Incident Response Tools.
    if (resource === "Incident Response Tools") {
      if (department === "Security") {
        return result("APPROVE", "R3", "Rule 3: Security team members have standing access to incident response tools.");
      }
      if (role === "Admin") {
        return result("APPROVE", "R3", "Rule 3: Admins have standing access to incident response tools.");
      }
      if (incidentActive && approvals >= 1) {
        return result(
          "APPROVE",
          "R3",
          "Rule 3: during an active incident, non-Security staff with at least one prior approval are auto-approved for incident response tools."
        );
      }
      if (incidentActive) {
        return result(
          "ESCALATE",
          "R3",
          "Rule 3: during an active incident, non-Security staff without a prior approval are escalated for expedited review."
        );
      }
      return result(
        "DENY",
        "R3",
        "Rule 3: outside an active incident, incident response tools are limited to the Security team and Admins."
      );
    }

    // Rule 4: Finance-restricted systems (Billing System, Payroll System, Financial Reports).
    if (FINANCE_SYSTEMS.indexOf(resource) !== -1) {
      if (department === "Finance") {
        if (role === "Intern") {
          return result(
            "ESCALATE",
            "R4",
            "Rule 4: Finance interns need sign-off before accessing financial systems, even within their own department."
          );
        }
        return result(
          "APPROVE",
          "R4",
          "Rule 4: Finance department staff have standing access to financial systems."
        );
      }
      if ((role === "Manager" || role === "Admin") && approvals >= 1) {
        return result(
          "ESCALATE",
          "R4",
          "Rule 4: Managers and Admins outside Finance may request access to financial systems with one prior approval, pending further review."
        );
      }
      return result(
        "DENY",
        "R4",
        "Rule 4: financial systems are restricted to the Finance department outside of an approved exception."
      );
    }

    // Rule 5: Customer PII.
    if (resource === "Customer PII") {
      if (department === "Support") {
        return result("APPROVE", "R5", "Rule 5: Support staff have standing access to Customer PII to resolve tickets.");
      }
      if (department === "Security") {
        return result("APPROVE", "R5", "Rule 5: Security staff have standing access to Customer PII for investigations.");
      }
      if (department === "Engineering" && approvals >= 1) {
        return result(
          "ESCALATE",
          "R5",
          "Rule 5: Engineering may request Customer PII access for debugging with one prior approval, pending further review."
        );
      }
      return result(
        "DENY",
        "R5",
        "Rule 5: Customer PII is restricted to Support and Security, or Engineering with an approval under review."
      );
    }

    // Rule 6: Production Database.
    if (resource === "Production Database") {
      if (department === "Engineering") {
        if (role === "Intern") {
          return result("DENY", "R6", "Rule 6: Interns are denied Production Database access regardless of department.");
        }
        if (role === "Contractor") {
          return result(
            "ESCALATE",
            "R6",
            "Rule 6: Contractors in Engineering may request Production Database access, but it requires review before granting."
          );
        }
        return result(
          "APPROVE",
          "R6",
          "Rule 6: Engineering employees, managers, and admins have standing access to the Production Database."
        );
      }
      if (approvals >= 2) {
        return result(
          "ESCALATE",
          "R6",
          "Rule 6: staff outside Engineering may request Production Database access with two prior approvals, pending final review."
        );
      }
      return result(
        "DENY",
        "R6",
        "Rule 6: Production Database access is restricted to Engineering outside of an approved exception."
      );
    }

    // Rule 7: Source Code Repository.
    if (resource === "Source Code Repository") {
      if (department === "Engineering") {
        return result(
          "APPROVE",
          "R7",
          "Rule 7: Engineering has standing access to the Source Code Repository regardless of role."
        );
      }
      if (role === "Contractor") {
        return result(
          "DENY",
          "R7",
          "Rule 7: Contractors outside Engineering are denied Source Code Repository access."
        );
      }
      if (approvals >= 1) {
        return result(
          "ESCALATE",
          "R7",
          "Rule 7: staff outside Engineering may request Source Code Repository access with one prior approval, pending further review."
        );
      }
      return result(
        "DENY",
        "R7",
        "Rule 7: Source Code Repository access outside Engineering requires at least one prior approval."
      );
    }

    // Rule 8: Employee Records.
    if (resource === "Employee Records") {
      if (department === "People") {
        return result("APPROVE", "R8", "Rule 8: People (HR) staff have standing access to Employee Records.");
      }
      if (role === "Manager") {
        return result(
          "APPROVE",
          "R8",
          "Rule 8: Managers have standing access to Employee Records for their own direct reports."
        );
      }
      if (role === "Admin") {
        return result("APPROVE", "R8", "Rule 8: Admins have standing access to Employee Records.");
      }
      if (approvals >= 1) {
        return result(
          "ESCALATE",
          "R8",
          "Rule 8: non-managers outside People may request Employee Records access with one prior approval, pending further review."
        );
      }
      return result(
        "DENY",
        "R8",
        "Rule 8: Employee Records are restricted to People, Managers, and Admins outside of an approved exception."
      );
    }

    // Rule 9: Vendor Contracts.
    if (resource === "Vendor Contracts") {
      if (department === "Finance") {
        return result("APPROVE", "R9", "Rule 9: Finance has standing access to Vendor Contracts.");
      }
      if (department === "Sales") {
        if (role === "Manager" || role === "Admin") {
          return result("APPROVE", "R9", "Rule 9: Sales Managers and Admins have standing access to Vendor Contracts.");
        }
        return result(
          "ESCALATE",
          "R9",
          "Rule 9: Sales staff below Manager level may request Vendor Contracts access, pending further review."
        );
      }
      return result(
        "DENY",
        "R9",
        "Rule 9: Vendor Contracts are restricted to Finance and Sales leadership outside of an approved exception."
      );
    }

    // Rule 10: catch-all for anything not explicitly listed above (including "Other / Unlisted
    // System"), falling back to the number of prior approvals obtained.
    if (approvals >= 2) {
      return result(
        "APPROVE",
        "R10",
        "Rule 10: requests for systems not explicitly covered by this policy are approved once two prior approvals have been obtained."
      );
    }
    if (approvals === 1) {
      return result(
        "ESCALATE",
        "R10",
        "Rule 10: requests for systems not explicitly covered by this policy are escalated for review with one prior approval."
      );
    }
    return result(
      "DENY",
      "R10",
      "Rule 10: requests for systems not explicitly covered by this policy are denied without at least one prior approval."
    );
  }

  return { evaluate, ROLES, DEPARTMENTS, RESOURCES, FINANCE_SYSTEMS };
});
