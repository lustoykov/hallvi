# Testing and evidence

[Roadmap](../../ROADMAP.md) owns delivery status. A dated result proves only the inspected candidate/configuration; neither a prototype nor a documentation update proves live support.

## Current acceptance

- [Compatibility cases](self-hosted-compatibility.md): source app plus representative images/stacks, persistence, updates, restore and controlled failures.
- [Core journeys](../user-journeys/README.md): what the user can achieve, including shared conversation/view state.
- [Test runners](../../tests/README.md): application suites, browser fixtures, opt-in Docker checks and real-model evaluations.
- [Fable integration](../design/2026-09-09-conversation-first-integration.md): current receipt/navigation behavior and remaining limits.

## Dated evidence

- [9 September final integration](2026-09-09-final-integration.md): combined-candidate tests, browser rerun, cross-conversation race correction and explicit legacy acceptance disposition.

- [8 September real deployment](2026-09-08-real-deployment-acceptance.md): one source application plus PostgreSQL on Hetzner, verified through the product.
- [8 September hardening](2026-09-08-deployment-hardening.md): bounded fixes, live checks, tests and stated limits.
- [8 September review](../reviews/2026-09-08-fable-merge-readiness.md): findings on its original snapshot; consult the hardening report for their follow-up.

## Legacy regression coverage

The [phase acceptance entry point](phase-one-acceptance.md) remains available to the testing dashboard and links the full archived casebook. Existing phase-oriented expectations require explicit preservation, replacement or retirement as the current UI changes. Unreviewed model answers remain unreviewed; automated schema checks do not establish semantic quality.

Before claiming the integration ready, exercise the final candidate's affected application tests, browser journeys, build and relevant failure/recovery paths. Keep synthetic-provider, real-model, local Docker and live-host evidence distinct. The final integration report records application acceptance separately from documentation link checks.
