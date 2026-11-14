# TimetableGenie evidence review

Research snapshot: 30 October 2026. Rolling window: 30 October 2016–30 October 2026.

This is a bounded, targeted review for implementation decisions. It is not an exhaustive survey, a source-code audit, an external solver benchmark, or a claim of new algorithmic theory. Bibliographic metadata and access depth are recorded in [sources.json](sources.json).

The registry contains 25 in-window scholarly publication records across 24 evidence families: 1 case_report, 1 competition_summary, 10 conference_paper, 1 extended_abstract, 1 invited_talk, 10 research_paper, 1 system_demonstration. Related ITC problem-definition versions P01/P02 are not independent studies. Short-paper, demonstration, competition-summary, case-report, and invited-talk records are labeled.

## Search and screening

Primary-source searches used combinations of “university course timetabling”, “student sectioning”, “curriculum-based”, “mixed integer programming”, “MaxSAT”, “large neighborhood search”, “disruption repair”, “teacher education”, “constraint language”, “conflict explanation”, and “bus driver scheduling”, including year terms2016–2026. Searches targeted publisher pages, PATAT proceedings, author-institution repositories, and official project documentation. The UGC/NCTE/Ministry of Education sites were checked for policy context.

Include: an identifiable primary research artifact or official technical/policy source relevant to modeling, solving, repair, input contracts, or verification. Exclude: unsourced marketing claims; duplicate reports counted as independent findings; unverifiable titles from the original uploaded prompt; arbitrary sports/nurse papers found in shared proceedings; publications before the window except explicitly marked foundations. The ALNS paper F01 has a2017 issue date but a4March2016 online publication and is therefore outside this rolling window.

Access limits: many Springer papers provided only official abstracts/metadata; several official author/proceedings PDFs were accessible; some ScienceDirect and NCTE direct fetches returned403. No paper results were reproduced. Exact first-online dates were retained where verified; proceedings years are not fabricated into exact dates.

## Literature-to-design matrix

| ID | Work | Evidence used for design | Access |
| --- | --- | --- | --- |
| P01 | [University course timetabling and International Timetabling Competition 2019](https://www.unitime.cz/papers/itc2019-patat2018.pdf) (2018) | Defines a richer university problem combining room/time assignment with student sectioning. | official author pdf |
| P02 | [Real-world university course timetabling at the International Timetabling Competition 2019](https://link.springer.com/article/10.1007/s10951-023-00801-w) (2025) | Describes real institutional instances, solver comparisons, and available solution validation. | open access publisher full text |
| P03 | [A mixed-integer programming approach for solving university course timetabling problems](https://link.springer.com/article/10.1007/s10951-021-00715-5) (2022) | Uses an initial-feasibility stage followed by MIP-based improvement for ITC2019. | open access publisher full text |
| P04 | [Flow formulations for curriculum-based course timetabling](https://link.springer.com/article/10.1007/s10479-018-3096-4) (2019) | Studies flow-based MIP formulations and lower bounds; useful as a formulation alternative. | publisher metadata and abstract |
| P05 | [A fix-and-optimize matheuristic for university timetabling](https://link.springer.com/article/10.1007/s10732-018-9371-3) (2018) | Fixes subsets of variables and uses MIP to improve neighborhoods; not a universal superiority result. | publisher metadata and abstract |
| P06 | [Quality recovering of university timetables](https://orbit.dtu.dk/en/publications/quality-recovering-of-university-timetables/) (2019) | Studies the trade-off between changed assignments and post-disruption timetable quality. | author institution metadata and abstract |
| P07 | [A Strategic View of University Timetabling](https://orbit.dtu.dk/en/publications/a-strategic-view-of-university-timetabling/) (2018) | Models trade-offs between available rooms, teaching periods, and timetable quality. | author institution metadata and abstract |
| P08 | [Exact and heuristic methods for a university course scheduling problem](https://www.sciencedirect.com/science/article/pii/S0957417424002483) (2024) | Combines a mathematical formulation with graph-coloring/genetic and tabu-search stages for a case study. | publisher indexed metadata and abstract; direct full page access limited |
| P09 | [Introducing UniCorT: an iterative university course timetabling tool with MaxSAT](https://link.springer.com/article/10.1007/s10951-021-00695-6) (2022) | Combines preprocessing, MaxSAT encodings, and local improvement on ITC2019 instances. | publisher metadata and abstract |
| P10 | [Daily course pattern formulation and valid inequalities for the curriculum-based course timetabling problem](https://link.springer.com/article/10.1007/s10951-018-0582-0) (2019) | Uses daily patterns, preprocessing, and valid inequalities to strengthen lower bounds. | publisher metadata and abstract |
| P11 | [Curriculum-Based Course Timetabling with Student Flow, Soft Constraints, and Smoothing Objectives: an Application to a Real Case Study](https://link.springer.com/article/10.1007/s43069-020-0013-x) (2020) | Models student movement, compulsory/noncompulsory conflict penalties, and weekday smoothing in a case study. | publisher metadata and abstract |
| P12 | [New Constraints and Features for the University Course Timetabling Problem](https://link.springer.com/chapter/10.1007/978-3-319-55702-1_14) (2017) | Extends a benchmark model to multiple term weeks and a timetable regularity measure. | publisher metadata and abstract |
| P13 | [An Online Learning Selection Hyper-heuristic for Educational Timetabling](https://www.patatconference.org/patat2020/proceedings/papers/10.%20PATAT_2020_paper_59.pdf) (2020) | Adapts sequences of low-level heuristics through learned transition probabilities. | official proceedings pdf |
| P14 | [Slack-based Robustness Estimators for the Curriculum-Based Course Timetabling Problem](https://www.patatconference.org/patat2020/proceedings/papers/11.%20PATAT_2020_paper_18.pdf) (2020) | Studies inexpensive slack-based estimates of robustness; estimates are not guarantees. | official proceedings pdf |
| P15 | [Scheduling Bus Drivers in Real-Life Multi-Objective Scenarios with Break Constraints](https://www.patatconference.org/patat2020/proceedings/papers/4.%20PATAT_2020_paper_51.pdf) (2020) | Shows why actual transit scheduling contains spatial and break constraints beyond generic resource overlap. | official proceedings pdf |
| P16 | [Simulated Annealing with Penalization for University Course Timetabling](https://www.patatconference.org/patat2020/proceedings/papers/29.PATAT_2020_v2_paper_10.pdf) (2021) | Uses adaptive penalties and simulated annealing for ITC2019 scheduling. | official proceedings pdf |
| P17 | [REDOSPLAT DSL for timetabling requirements](https://www.patatconference.org/patat2020/proceedings/papers/34.PATAT_2020_v2_paper_24.pdf) (2021) | Describes a human-oriented requirements language with resources, concurrency, and travel constraints. | official proceedings pdf |
| P18 | [Student Scheduling at Purdue University](https://www.unitime.cz/papers/patat24.pdf) (2024) | Demonstrates real student scheduling with alternatives, course structure, reservations, and travel concerns. | official author pdf |
| P19 | [Instructor Scheduling in UniTime](https://www.unitime.cz/papers/patat26-instructors.pdf) (2026) | Describes instructor allocation with availability, qualifications, maximum load, and preferences. | official author pdf |
| P20 | [A knowledge-based approach to detecting and explaining conflicts in timetabling problems](https://patatconference.org/patat2022/proceedings/PATAT_2022_paper_08.pdf) (2022) | Studies comprehensible conflict explanations for ill-defined or inconsistent timetabling instances. | official proceedings pdf |
| P21 | [A Constraint Language For University Timetabling Problems](https://patatconference.org/patat2022/proceedings/PATAT_2022_paper_16.pdf) (2022) | Models course scheduling, sectioning, resources, and multi-scale time in a declarative language. | official proceedings pdf |
| P22 | [Three-phase Curriculum-Based University Course Timetabling with Student Assignment](https://patatconference.org/patat2022/proceedings/PATAT_2022_paper_17.pdf) (2022) | Addresses teacher education with two-subject choices, parallel groups, and student assignment. | official proceedings pdf |
| P23 | [A MIP based approach for International Timetabling Competation 2019](https://patatconference.org/patat2022/proceedings/PATAT_2022_paper_28.pdf) (2022) | Describes conflict-graph reductions, initial solutions, and fix-and-optimize MIP methods. | official proceedings pdf |
| P24 | [Optimising Scheduling of Hybrid Learning using Mixed Integer Programming](https://patatconference.org/patat2022/proceedings/PATAT_2022_paper_33.pdf) (2022) | Explores online/in-person capacity trade-offs with travel-aware timesets. | official proceedings pdf |
| P25 | [The CP-SAT-LP Solver (Invited Talk)](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.CP.2023.3) (2023) | Explains integral CP with lazy-clause generation, LP support, and portfolio workers. | open access publisher full text |

## Baseline audit and implications

| Baseline | Verified capabilities | Inspection scope and limits | Project implication |
| --- | --- | --- | --- |
| [UniTime](https://github.com/UniTime/unitime) | Course, student, instructor, exam, and event scheduling; ITC2019 integrates sectioning with room/time assignment. Apache-2.0. | Official repository/docs and author papers; no commit checkout or reproduced benchmark. | Do not claim electives, student pathways, or validation are unprecedented. A schema-specific audit bundle is an integration choice. |
| [Timefold](https://github.com/TimefoldAI/timefold-solver) | Custom hard/soft constraints; the school example covers room, teacher, and student-group overlap. Real-time changes and pinning are documented. Community Apache-2.0. | Latest responding-to-change docs identify2.7.1; quickstart stable snapshot. No solver benchmark. | Disruption repair is established prior capability; measure the proposed repair objective rather than claiming absence elsewhere. |
| [FET](https://lalescu.ro/liviu/fet/features.html) | Flexible student sets; breaks, same-start, consecutive/grouped activities, room closures, and gap/building-change controls. AGPLv3. | Official features plus verified7.10.5 release context; not a complete code audit or proof of latest release. | Synchronization and contiguous blocks are established features; check license before incorporating source. |
| [OR-Tools](https://developers.google.com/optimization/cp/cp_solver/) | General integral constraint solver with feasibility/optimality statuses and scheduling primitives. | Official guide and stable protobuf source; implementation must lock/test its actual installed version. | A domain application and independent checker are still required; UNKNOWN must remain distinct from INFEASIBLE. |

Absence is not established for a proxy adapter, cryptographic report, or Indian policy profile in every baseline/version. No superiority or “first ever” claim follows from this audit. The defensible contribution is a reproducible application linking explicit enrollment-aware constraints, independently checked outputs, revision-bound audit data, and measured repair behavior.

## Policy decisions with provenance

- [UGC CCFUP](https://www.ugc.gov.in/pdfnews/7193743_FYUGP.pdf), section3.2.4, printed pp11–12, relates lecture/tutorial credits to one weekly hour and practicum credits to two in its stated semester context. Section3.2.5 allows institutional course-credit distribution decisions. The schema should therefore store contact requirements explicitly and retain a named conversion profile. Ambiguous “2P” input is insufficient by itself.
- [NCTE ITEP framework](https://ncte.gov.in/website/PDF/ITEP/ITEP_Cirriculum.pdf) and [regulations index](https://web.ncte.gov.in/page/ncte-regulations) establish a separate teacher-education context. ITEP, B.Ed., M.Ed., professional degrees, and generic undergraduate profiles must not be treated as one automatically certified policy.
- No universally applicable faculty workload hours were verified or adopted. Demonstration caps must be labeled synthetic institutional inputs. A real institution must approve its applicable regulation, workload accounting, qualifications, term calendar, and credit profile.

## Verification and proxy limits

The model/checker must audit full event intervals and authoritative enrollment selections; a start-slot-only check misses the second period of a lab. A finite feasible assignment is a witness for the encoded instance, not evidence that all real policies were modeled. An independently implemented checker reduces shared implementation risk but is not automatically a formally verified program.

[GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/) describes public timetable structures. Crew duty limits, vehicle assignments, and academically meaningful attendee conflicts require supplemental records or declared synthetic choices. Renaming trips into classes cannot establish an isomorphism of all transit and university problems. A sound reversible mapping can be argued only for a restricted shared resource-allocation representation.

[RFC8785](https://www.rfc-editor.org/rfc/rfc8785.html) concerns canonical hash/signature inputs. [RFC9106](https://www.rfc-editor.org/rfc/rfc9106.html) concerns memory-hard password hashing. Neither makes a hash a scheduling proof. A digest binds a chosen payload only relative to a trusted expected digest; authenticated issuance requires a separate signature/trust design.

## Evidence still required from this repository

- Measured solver/checker outputs, mutation tests, repair changes, differential tiny-instance checks, and benchmark budgets/hardware/seeds.
- Actual installed solver/library versions and project source commit, distinct from external documentation snapshots.
- Real transit provenance if collected data is ever imported. Synthetic fixtures cannot be described as self-collected.
- An institutional policy review before claiming compliance. The current evidence supports configurable policy representation, not a regulatory certification.

## References

See [references.bib](references.bib) for conservative BibTeX and [sources.json](sources.json) for URLs, authors, dates, access levels, source types, and uncertainties. No invented DOI or journal fields were filled in.
