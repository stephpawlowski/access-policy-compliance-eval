# Access Policy - HIPAA-style IAM Scenario (fictional company: "Meridian Health") - v1

This is the plain-English access policy the LLM will be asked to enforce for Meridian Health, a
fictional hospital system. It's written the way a real internal clinical-systems access policy
reads: specific systems, specific clinical and administrative roles, and one deliberately
healthcare-specific wrinkle, a break-glass emergency clause, that Fernwood's IAM policy doesn't
have a parallel for.

This file lives at `policies/meridian.md` as part of the access-policy-compliance-eval project's
v4 multi-company expansion. Its eight rules map to the tags M1 through M8 in
`docs/policy-engine.js` and in the eval's prompt and grading.

## Roles

- **Clinician** - physician or equivalent licensed clinical provider, direct patient care.
- **Nurse** - licensed nursing staff, direct patient care.
- **Billing Coordinator** - handles claims submission and billing inquiries, no clinical duties.
- **IT Admin** - maintains clinical and administrative systems, no clinical duties.
- **Compliance Officer** - handles HIPAA compliance, audits, and governance, no clinical duties.

## Departments

Clinical Care, Billing, IT, Compliance, Research.

## Protected systems

- Patient Records (EHR)
- Pharmacy System
- Billing/Claims System
- Lab Results
- Research Data Repository
- Audit Logs

Any system not on this list is handled by Rule 8, the catch-all.

## Request context

Two additional facts about a request can change the outcome:

- **Prior approvals** - how many prior approvals the requester has already obtained for this
  specific request (0, 1, or 2+).
- **Offboarding status** - whether the requester's account is currently being offboarded or has
  already been terminated.
- **Active clinical emergency** - whether Meridian currently has an active, declared clinical
  emergency. This is the healthcare analogue of Fernwood's active-incident flag, but it only
  changes the outcome for one resource: Patient Records, via the break-glass clause in Rule 2.

## Rules

1. **Offboarding override.** Any access request from someone whose account is currently being
   offboarded, or whose employment/contract has already ended, must be denied outright,
   regardless of role, department, resource, or how many approvals they've already collected.
   This rule is checked first and overrides every other rule below.

2. **Patient Records (EHR).** Clinicians and Nurses in Clinical Care have standing access, for
   treatment purposes. IT Admin has standing access, for system maintenance. The Compliance
   Officer has standing access, for audits. Billing Coordinators may access with one prior
   approval, escalate, since their access is scope-limited to billing purposes only. Everyone
   else is denied. Break-glass clause: during an active declared clinical emergency, a Clinician
   requesting Patient Records outside their normal assignment, that is, outside Clinical Care, is
   auto-approved with at least one prior approval, or escalated for expedited review without one.

3. **Pharmacy System.** Clinicians have standing access. Nurses may access with one prior
   approval, escalate. IT Admin has standing access, for maintenance. The Compliance Officer has
   standing access, for audit purposes. Everyone else is denied.

4. **Billing/Claims System.** Billing Coordinators have standing access. The Compliance Officer
   has standing access, for audit purposes. Everyone else may be escalated with two prior
   approvals; otherwise denied.

5. **Lab Results.** Clinicians and Nurses have standing access. Billing Coordinators are denied
   outright, a hard rule, since Lab Results are never needed for billing and there are no
   exceptions. The Compliance Officer may access with one prior approval, escalate. Everyone else
   is denied.

6. **Research Data Repository.** The Compliance Officer and IT Admin have standing access, for
   data governance. Clinicians require two prior approvals, representing IRB sign-off, to
   escalate. Everyone else is denied.

7. **Audit Logs.** The Compliance Officer has standing access. IT Admin has standing access.
   Everyone else is denied outright, always, with no escalate path at all, even with prior
   approvals. This is deliberately the strictest system in this policy.

8. **Catch-all.** For any resource not explicitly listed above, one or more prior approvals is
   escalated; zero is denied. Note that unlike Fernwood's catch-all, there is deliberately no
   auto-approve path here at any approval count, healthcare policy is more conservative by
   design.

## Precedence

Apply the rules in the order listed above. Rule 1 (offboarding) is checked first and overrides
everything else. For a given resource, only the single matching rule applies, rules don't stack,
and a request never needs more than one rule to reach a decision.

## Decision categories

Every request should be classified as exactly one of:

- **Approve** - grant the access as requested.
- **Deny** - refuse the access as requested.
- **Escalate** - insufficient information or a genuine judgment call; route to a human reviewer.
