# Access Policy - Pantheon-style IAM Scenario (fictional company: "Fernwood Systems") - v2

This is the plain-English access policy the LLM will be asked to enforce. It's written the way a
real internal IAM/governance policy reads: specific systems, specific roles, and a few genuinely
close calls on purpose, so the eval has real signal.

This is version 2 of the policy. The original version (10 rules, no named systems) is still in
this project's history; this version replaces generic "billing access" / "production system
access" language with ten specific protected systems, so a request like "a Contractor in
Engineering wants the Production Database" has one unambiguous right answer instead of requiring
interpretation.

As of v4, this file lives at `policies/fernwood.md` alongside two sibling companies, `meridian.md`
and `vertex.md`, as part of a multi-company eval. Its ten rules map to the tags F1 through F10 in
`docs/policy-engine.js` and in the eval's prompt and grading; the numbering below is unchanged
from v3, the engine just adds the `F` prefix.

## Roles

- **Employee (Full-Time, FTE)** - permanent staff.
- **Contractor** - external, time-boxed engagement, no equity, access reviewed quarterly.
- **Intern** - temporary FTE-track, always paired with an FTE sponsor/manager.
- **Manager** - an FTE with direct reports.
- **Admin** - any FTE granted elevated IAM privileges (can grant/revoke access for others).

## Departments

Engineering, Finance, Sales, Support, People (HR), Security.

## Protected systems

- Billing System
- Payroll System
- Financial Reports
- Customer PII
- Production Database
- Source Code Repository
- Employee Records
- Admin Console
- Vendor Contracts
- Incident Response Tools

Any system not on this list is handled by Rule 10, the catch-all.

## Request context

Three additional facts about a request can change the outcome:

- **Prior approvals** - how many manager approvals the requester has already obtained for this
  specific request (0, 1, or 2+).
- **Offboarding status** - whether the requester's account is currently being offboarded or has
  already been terminated.
- **Active incident** - whether Fernwood currently has an active, declared security incident.
- **Direct report status** (Employee Records requests by a Manager only) - whether the records
  being requested belong to one of the requester's own direct reports. If a request doesn't state
  this, treat it as genuinely unknown, not as "no", see Rule 8.

## Rules

1. **Offboarding override.** Any access request from someone whose account is currently being
   offboarded, or whose employment/contract has already ended, must be denied outright,
   regardless of role, department, resource, or how many approvals they've already collected.
   This rule is checked first and overrides every other rule below.

2. **Admin Console.** Admins have standing access. Managers may request access with two prior
   approvals, but it still requires final review before granting, treat as escalate, not approve.
   Everyone else is denied.

3. **Incident Response Tools.** Security team members and Admins have standing access at all
   times. During an active declared incident, non-Security staff with at least one prior approval
   are auto-approved; without a prior approval during an active incident, they're escalated for
   expedited review. Outside an active incident, non-Security, non-Admin staff are denied.

4. **Finance-restricted systems** (Billing System, Payroll System, Financial Reports). Finance
   department staff have standing access, with one exception: Finance interns need sign-off even
   within their own department, so treat their requests as escalate. Outside Finance, Managers
   and Admins may request access with one prior approval, pending further review (escalate).
   Everyone else outside Finance is denied, no exceptions for seniority alone.

5. **Customer PII.** Support and Security have standing access (they need it for tickets and
   investigations respectively). Engineering may request access for debugging with one prior
   approval, pending further review. Every other department is denied.

6. **Production Database.** Within Engineering: Employees, Managers, and Admins have standing
   access. Interns are denied outright, regardless of department, this is a hard ceiling, not a
   judgment call. Contractors in Engineering require review before granting (escalate), not an
   automatic approve or deny. Outside Engineering entirely, access may be escalated with two
   prior approvals; otherwise denied.

7. **Source Code Repository.** Engineering has standing access regardless of role, including
   Contractors and Interns on the team. Outside Engineering, Contractors are denied outright.
   Everyone else outside Engineering may be escalated with one prior approval; otherwise denied.

8. **Employee Records.** People (HR) staff have standing access. Managers also have standing
   access, but only for their own direct reports' records, if a request doesn't say whether
   that's the case, escalate for clarification rather than assuming either way; don't let a high
   approval count substitute for actually knowing. Admins have standing access. Everyone else may
   be escalated with one prior approval; otherwise denied.

9. **Vendor Contracts.** Finance has standing access. Within Sales, Managers and Admins have
   standing access; other Sales staff (Employees, Interns, Contractors) may be escalated pending
   further review, not automatically approved or denied. Every other department is denied.

10. **Catch-all.** For any resource not explicitly listed above, a genuinely novel or unlisted
    system, the decision falls back to prior approvals alone: two or more prior approvals is
    approved, exactly one is escalated, zero is denied.

## Precedence

Apply the rules in the order listed above. Rule 1 (offboarding) is checked first and overrides
everything else. For a given resource, only the single matching rule applies, rules don't stack,
and a request never needs more than one rule to reach a decision.

## Decision categories

Every request should be classified as exactly one of:

- **Approve** - grant the access as requested.
- **Deny** - refuse the access as requested.
- **Escalate** - insufficient information or a genuine judgment call; route to a human reviewer.
