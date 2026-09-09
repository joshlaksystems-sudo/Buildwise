# Insurance Mutual Platform
## Delivery Approach, Scope and Indicative Proposal

**Prepared for:** iBIM  
**Date:** 9 September 2026  
**Commercial basis:** GBP, ex VAT  
**Estimate status:** indicative proposal pending discovery and confirmation of the open questions in this document

## Executive response

We propose a combined **build and delivery-lead engagement**. We would own the solution design, data model, technical delivery, workflow implementation, quality assurance and release management. iBIM would retain the client relationship and commercial ownership, with a single delivery plan, a single RAID log, and a single escalation route between the client and the delivery team.

The most important adjustment to the supplied brief is to make the foundation a formal first phase. The operational workflows depend on a reliable Master Record and validated digital proposal forms. We would therefore build the platform in this order:

1. Model the member, policy, proposal, renewal, finance and audit data.
2. Import and validate the cleaned spreadsheet data.
3. Launch secure web proposal forms for new business and renewals.
4. Add prospecting, underwriting, quotation, renewal and chasing workflows.
5. Add post-bind registers, payments, rebates, budgets and management reporting.

The recommended midrange implementation budget is **£75,000 ex VAT**, excluding third-party provider charges and a live Acturis API integration. A prudent 15% contingency gives an approval ceiling of **£86,250 ex VAT**.

## 1. Proposed engagement

### Build and delivery management

We recommend that the build partner provides both technical leadership and delivery management. This is the clearest model for a greenfield platform where data modelling, workflow design and implementation decisions are tightly connected.

| Responsibility | iBIM | Build and delivery team | Client |
|---|---|---|---|
| Commercial relationship | Account owner | Delivery input | Stakeholder |
| Product priorities | Owns commercial priorities | Converts priorities into deliverables | Confirms operational priority |
| Requirements and acceptance | Facilitates client decisions | Documents stories and acceptance criteria | Provides subject-matter decisions |
| Architecture and data model | Informed and commercially advised | Accountable | Reviews business fit |
| Build and integration | Informed | Accountable | Provides system access and specifications |
| Testing and release | Participates in sign-off | Accountable for release readiness | Provides acceptance users and test data |
| Scope and change control | Owns commercial conversation | Estimates impact and maintains plan | Approves changes |

If iBIM appoints additional specialists, the build partner will manage them through the same backlog, definition of done, code review, test plan and release process. No subcontractor would receive unscoped direct access to production data.

## 2. Scope and phasing

### Phase 0: Foundation, data model and migration

This phase is mandatory and is priced separately because it is the foundation for every workflow in the brief.

**Deliverables:**

- canonical Master Record for member, company, contact, policy, proposal and renewal data;
- explicit relationships between one member, multiple policies, proposals, renewals, payments and transactions;
- status model and audit history for every material workflow event;
- secure digital proposal forms for new business and renewal;
- mandatory field, format, date, financial and cross-record validation;
- renewal pre-population from the previous policy year;
- one-off cleaned spreadsheet migration;
- migration preview and validation report showing accepted, rejected and flagged records;
- duplicate detection and reconciliation report before import is committed;
- role, tenant and data-access model;
- initial dashboard shell and navigation.

**Exit condition:** a representative user can import or create a member, submit a validated new-business or renewal form, and see one consistent Master Record without re-keying.

### Phase 1: Prospecting and new business

- prospect list import with company name, email and renewal date;
- six-week prospect identification;
- approved email template and proposal-form link;
- send-test-email function;
- bulk campaign scheduler with idempotency protection;
- email sent time, provider reference, delivery status and stored activity;
- prospect register and pipeline metrics;
- website new-business enquiry intake;
- acknowledgement email and proposal-form request;
- merge of prospect and new-business records into the Master Record;
- proposal returned, underwriting queue and follow-up task creation.

### Phase 2: Rating, underwriting and quotation handoff

- proposal returned and review statuses;
- rating-matrix seam and preliminary premium calculation;
- underwriting review and approval workflow;
- gross premium, IPT, fees, commission, net premium and income splits;
- underwriting audit record;
- Acturis handoff data and quotation reference fields;
- quote prepared, quote sent, accepted, declined, alternative terms and no-response outcomes;
- follow-up reminders and handler assignment;
- manual or file-based Acturis reconciliation in the initial release.

### Phase 3: Renewals and overdue chasing

- daily renewal identification;
- six-week renewal invitation;
- previous-year data pre-population and client confirmation;
- reminders at six weeks, four weeks, two weeks and one week;
- renewal overdue status after the renewal date;
- day 1, 7, 14 and 21 overdue escalation;
- handler, team-leader and management escalation tasks;
- renewed, amended, lapsed, competitor, cancelled and no-response outcomes;
- retention, recovery and premium-movement reporting.

### Phase 4: Post-bind operational registers

- bound policy locks and audit event;
- automatic population of the Bordereaux register;
- separate New Business and Renewals registers;
- monthly period close with late-bound policies carried to the next open period;
- source-of-truth updates flowing to linked registers and reports;
- Excel and PDF export;
- no manual re-keying for standard register fields.

### Phase 5: Finance and accounts

- payment record created when a policy is bound;
- cash and finance payment paths;
- awaiting payment, due, paid, part-paid, overdue and cancelled states;
- finance application and document status;
- payment references, providers, notes and signed-document upload;
- payment, premium, commission and income dashboards;
- standalone rebate fund, allocations, statements and payment history;
- budget setup by year, month, income stream, product line and department where required;
- budget versus actual, variance, run rate and forecast foundation.

### Phase 6: Business insights, reporting and go-live

- weekly reporting;
- monthly reporting;
- board pack and board-report views;
- new-business and renewal performance;
- conversion and retention rates;
- member growth and prospect pipeline;
- income, commission and rebate analysis;
- monthly trends, year-to-date performance and budget versus actual;
- handler and introducer performance;
- product split and KPI dashboard;
- custom date filtering;
- Excel/PDF exports;
- production hardening, training, monitoring, runbook and handover.

## 3. Pricing (ex VAT)

| Phase | Scope | Midrange estimate |
|---|---|---:|
| Phase 0 | Foundation, data model, digital forms, validation, migration and RBAC | £18,000 |
| Phase 1 | Prospects, six-week campaign, new-business intake and email automation | £12,000 |
| Phase 2 | Rating, underwriting, premium calculations and Acturis handoff | £10,000 |
| Phase 3 | Renewals, pre-population, reminders and overdue escalation | £12,000 |
| Phase 4 | Post-bind Master Record distribution, Bordereaux and operational registers | £7,000 |
| Phase 5 | Payments, rebates, finance documents and budget foundation | £8,000 |
| Phase 6 | Business insights, board reporting, QA, training and go-live | £8,000 |
|  | **Total implementation estimate, ex VAT** | **£75,000** |

### Commercial scenarios

| Scenario | Description | Ex VAT | Including 20% VAT |
|---|---|---:|---:|
| Lean launch | Foundation, core proposal journeys, essential prospect/renewal automation and basic reporting | £58,000 | £69,600 |
| **Recommended midrange** | **All phases above, standard exports, migration validation and production acceptance** | **£75,000** | **£90,000** |
| Maximum planning ceiling | Additional spreadsheet variants, extensive report templates, deeper migration remediation and launch support | £92,000 | £110,400 |

The estimate is based on no more than approximately 100 proposals per week and one cleaned spreadsheet migration. Third-party usage is excluded. A 15% contingency on the recommended midrange is **£11,250**, giving a prudent approval ceiling of **£86,250 ex VAT**.

### Payment milestones

| Milestone | Payment share | Amount ex VAT |
|---|---:|---:|
| Mobilisation and Phase 0 start | 20% | £15,000 |
| Foundation acceptance and first usable release | 25% | £18,750 |
| Prospect, new-business and renewal workflow acceptance | 25% | £18,750 |
| Post-bind, finance and reporting acceptance | 20% | £15,000 |
| Production handover and go-live | 10% | £7,500 |

## 4. Timeline

The following dates assume a decision and access to the cleaned data by **16 September 2026**. They are planning dates and should be confirmed after mobilisation.

| Milestone | Target |
|---|---|
| Mobilisation and discovery start | 16 September 2026 |
| Data model, clickable forms and migration mapping | 30 September 2026 |
| First usable release: login, Master Record, validated forms and migration preview | 16 October 2026 |
| Prospect and new-business workflow | 30 October 2026 |
| Rating, underwriting and quotation handoff | 13 November 2026 |
| Renewals and overdue chasing | 27 November 2026 |
| Post-bind, finance and reporting | 11 December 2026 |
| Full delivery candidate release | 18 December 2026 |
| Production pilot and handover | 4 January 2027 |

The first usable release is deliberately the foundation release. It gives the client something testable early without creating workflow automation on top of an unverified data model.

## 5. Team and responsibilities

| Role | Indicative involvement | Responsibility |
|---|---:|---|
| Delivery lead / solution architect | 0.3-0.4 FTE | Architecture, data model, scope, risks, technical decisions and client governance |
| Business analyst / delivery manager | 0.4-0.5 FTE | Workshops, workflow mapping, backlog, acceptance criteria, RAID and reporting |
| Technical lead | 0.5 FTE | Code quality, integrations, security, reviews and release engineering |
| Full-stack engineers | 1.5-2.0 FTE | Frontend, backend, data model, workflow and exports |
| UX / forms specialist | 0.2-0.3 FTE | Digital proposal forms, accessibility, validation and responsive workflow screens |
| Data migration specialist | 0.2-0.3 FTE | Spreadsheet profiling, mapping, duplicate handling and migration reconciliation |
| QA engineer | 0.4-0.6 FTE | Test strategy, regression, role testing, migration checks and acceptance support |
| DevOps / security specialist | Shared | Environments, secrets, monitoring, backups, deployment and security review |

The team is intentionally proportionate to the stated volume. We do not propose a high-volume event platform, microservice estate or separate mobile build in this phase.

## 6. Assumptions and exclusions

### Client inputs required

- cleaned Master Record spreadsheet and all relevant source spreadsheets;
- final field definitions and examples for Bordereaux, New Business, Renewals, Rebates and Budget;
- policy and quotation system documentation, including the agreed Acturis handoff method;
- rating matrix, IPT rules, fees, commission splits and approval thresholds;
- approved email templates and proposal-form content;
- named subject-matter users for weekly acceptance sessions;
- decision on hosting, email provider, document storage and retention;
- GDPR, retention, access and audit requirements from the broker;
- timely feedback within two working days during acceptance windows.

### Exclusions

- live Acturis API integration unless its API, licence and technical access are confirmed and separately estimated;
- insurance underwriting advice, product design or legal interpretation;
- direct insurer/GSP filing or regulatory submissions;
- third-party email, SMS, WhatsApp, hosting, storage, AI, monitoring or spreadsheet software fees;
- native iOS/Android applications;
- indefinite spreadsheet redesign or repeated unplanned migration cleansing;
- historical data remediation beyond the agreed cleaned migration file;
- advanced actuarial pricing or a rating engine beyond the agreed rating-matrix implementation;
- 24/7 support, service desk and post-warranty change requests.

## 7. Questions to firm up the price

1. Is Acturis integration required through an API, a file exchange, or a controlled manual handoff in Phase 1?
2. Which exact fields and calculations are required in the rating matrix, including IPT, fees and commission splits?
3. Can the client provide the current Master Record, Bordereaux, New Business, Renewals, Rebates and Budget spreadsheet templates?
4. What is the expected number of historical policies and members in the one-off migration?
5. Which fields are mandatory for a new-business form versus a renewal form?
6. Can clients submit forms without an account, or must they authenticate with a secure one-time link?
7. Which email provider and sender domain will be used, and is the domain configured for SPF, DKIM and DMARC?
8. What constitutes a returned proposal form: web submission only, or email/PDF ingestion as well?
9. Who may approve underwriting, bind policies, close Bordereaux and approve rebates?
10. What are the exact escalation recipients for handler, team-leader and management overdue alerts?
11. What should the Board Pack contain, and are there existing examples to reproduce?
12. Which reports require Excel, PDF, scheduled email delivery or both?
13. What are the GDPR retention, deletion, audit and data-export requirements?
14. What is the required support period after the January 2027 pilot?

## 8. Immediate next steps

1. Confirm the commercial engagement model and nominate the client product owner.
2. Sign confidentiality documents and provide the cleaned spreadsheets and templates.
3. Run a two-day foundation workshop covering data model, proposal forms, rating inputs and permissions.
4. Confirm Phase 0 acceptance criteria and start migration profiling.
5. Return a fixed Phase 0 statement of work and a refined full-delivery quotation after the workshop.

This proposal is deliberately structured so the client can approve the foundation independently while retaining a clear path to the full operational platform.