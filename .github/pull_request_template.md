## Change

<!-- Lead with the concrete problem and resulting behavior. For a redesign stage, name the roadmap checkpoint and the result the user can try. -->

## Risk and review focus

<!-- Small / normal / critical or complex — explain briefly. What could break, and who or what would be affected? Point reviewers at consequential decisions. Judge by consequences and blast radius, not lines changed. See REVIEW.md, "Verification proportional to risk". -->

## Verification

**Tested revision and environment:** …

<!-- Name real Pi/services/providers versus fixtures or stand-ins. State what was actually checked and how a reviewer can try the result. For small changes, replace the table with one check → result sentence; no separate report is needed. -->

<!-- Show meaningful use of verify-hallvi through the chosen environment, observed behavior and evidence, not a skill-use declaration. Include any narrow workflow correction this task exposed and how it was validated; leave working guidance alone. See AGENTS.md and REVIEW.md. -->

| Behavior checked | Observed result | Evidence |
| --- | --- | --- |
| … | … | Screenshot, video timestamp, test output, or execution record |

### Visual evidence

<!-- Delete when there is no relevant visual surface. Embed or link captioned screenshots or a short video from the implemented revision, using representative data. Show before/after when comparison helps; for interactions, preserve the action and its result. For critical/complex journeys, include relevant waiting, failure and recovery states, not just the successful final screen. Label simulated states and skipped/accelerated waits. Exclude credentials and sensitive data. See REVIEW.md, "Visual verification evidence". -->

### Limits

<!-- State material gaps, failed checks and stand-ins, or "None known". Planned checks are not completed checks. Diagrams explain design; visuals show observed behavior; operational claims still need execution or external verification evidence. -->

## Design / flow

<!-- Required when changing a boundary or flow; otherwise delete if unnecessary. Include a focused Mermaid diagram of the implemented change and explain consequential tradeoffs. Link the owning design document; keep durable diagrams there too, indexed in docs/architecture/README.md. -->

<!-- Identify consequential obsolete code, workflow gates or tests removed, and why their behavior is no longer required. For consequential operational changes, explain failure containment and recovery/revert, including irreversible effects. Omit irrelevant detail. -->

## Roadmap

<!-- Review ROADMAP.md; link the status, scope or sequencing update in this PR, or briefly explain why none is needed. -->

<!-- Keep unmerged work labeled in review. When merging, confirm what landed and record the PR or commit reference in ROADMAP.md. -->
