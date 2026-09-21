# Applications home

This records the visual direction of the applications homepage. The [operator design](../../../../docs/operator-design.md) governs conversation ownership and shared-record presentation; the [product](../../../../PRODUCT.md) owns the rule that most first users run something small.

## In good company

The owner chose the Little Server caretakers after three prototype rounds on
`prototype/homepage-directions`. The welcome is “Your apps, in good company.”
A short invitation sits beneath it, with Add application beside it on desktop
and below on mobile. A compact recorded-status summary belongs with the
collection. Search appears only past four applications.

Each application and its caretaker share one card. The colored header groups
its name, purpose and state with a bounded caretaker button. Its drawn screen,
recorded condition, stack and address follow directly below, with an explicit
Open app link. One application gets a wider card with identity and caretaker
on the left; narrow screens use the same header-above-details layout as the
collection. An empty collection goes straight to the first-application welcome.

- **One 3D caretaker per application.** The existing Little Server silhouette
  and eight fixed application colors (`APPLICATION_COLORS`) form one family.
  Colors are assigned oldest first so adding an application does not recolor
  the others. The header and preview carry the same identity tint. Red, amber
  and green status marks retain their semantic meaning.
- **The face and prop follow recorded state.** Fine: a coffee mug and a smile.
  Working: a wrench. Not checked lately: a clipboard. Needs attention: a
  magnifier and a worried face. New: ready and waving. A caretaker whose
  application needs attention does not dance.
- **A greeting is earned.** Clicking or keyboard-activating the caretaker
  triggers its existing gesture and a small conversational response. The
  response uses the same situation as its expression; it never claims that
  a fresh check happened or that work is running. Reserved space prevents the
  card from shifting. No automatic speech or extra animation loop is added.
  Pause animations, reduced-motion and offscreen suspension remain supported.
- **The screen is an illustration.** `interface-previews.tsx` draws each kind
  of software in a tilted window, explicitly marked Illustration. The window
  settles on hover and its contents wake once. It is never a live screenshot.
- **The useful action stays obvious.** The card surface, name, preview and Open
  app navigate to the application. The external address and caretaker greeting
  keep their own actions. Greeting is a separate button, never a nested control
  or a required step. Detailed conditions remain visible after the greeting.
- **Attention names the reason.** Only a current warning or failure gives the
  card an attention label and amber or red dot. The card states the recorded
  problem and its next step when one was saved. Informational recommendations
  do not turn a passing condition into a request for help.

Protection lives on the application's own pages. An undeployed app says
“No deployment recorded yet.” rather than issuing a protection warning before
there is anything to protect.

## Data boundaries

Name, repository, condition, next step, stack and address come from
saved records (`listApplicationItems`). Kind and purpose are read from the
repository name (`application-kind.ts`); unknown software gets the generic
screen and its repository as the purpose. Screen contents are decorative,
never read from the host. Neither the greeting nor a recorded check implies
continuous monitoring.
