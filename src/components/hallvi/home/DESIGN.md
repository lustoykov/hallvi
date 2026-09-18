# Applications home

This records the visual direction of the applications homepage. The [operator design](../../../../docs/operator-design.md) governs conversation ownership and shared-record presentation; the [product](../../../../PRODUCT.md) owns the rule that most first users run something small.

## In good company (16 September 2026)

Chosen by the owner after three prototype rounds on `prototype/homepage-directions`
(`docs/prototypes/homepage-directions/README.md` on that branch has the six,
then three, then one direction and the feedback on each). The composition is
the one the page had at `5426bbc`, kept where it was right and fixed where it
was not.

Kept:

- **One 3D caretaker per application**, above its card, at the same size as
  before. They wave and dance in turn and greet when clicked. Paint is one of
  eight fixed application colours (`APPLICATION_COLORS`), handed out per
  application oldest first, so a dozen still read as one family and two cards
  side by side are told apart. Until 18 September it was each upstream
  project's brand colour softened toward slate, which gave a washed mint for
  anything green. Hallvi's own periwinkle is not among them. Paint is identity;
  the face and the prop are the state.
- **A drawn screen of the application** in a tilted window that settles on
  hover, and the parts of the screen wake up once.
- **The heading**: "Your apps are in good company."

Changed:

- **The screen is the application's own layout**, drawn per kind of software
  in `interface-previews.tsx` (twelve kinds and a generic screen), never a
  generic browser window and never a screenshot. The window bar says
  "Illustration".
- **The caretaker's face and hands say the state.** Fine: a mug of coffee,
  smiling, and it dances. Working: the wrench. Not looked at lately: the
  clipboard. Something waiting: a magnifier held up and a worried face,
  never an angry one. Not deployed yet: it stands ready and waves, and the
  card says "New"; the cardboard box it first held was dropped on 18 September
  because it read as awkward. A caretaker whose application needs something
  does not dance.
- **The card has a hierarchy**: name and purpose with one word of state at the
  right ("Fine", "Working", "Needs me", "Not checked", "New"); the screen; the
  condition in one line; what runs, as chips; the address as the link; More.
- **No offer at the top of the page.** Talking to Hallvi starts inside the
  application. Search appears only past four applications.
- **The page opens with two sentences about the collection**, not an action,
  and nothing on the card mentions protection. Most first users run
  something small; a card that says "Not backed up" on day one teaches them
  to ignore it. Protection lives on the application's own pages, and a nudge
  on the card is for the day the data has grown enough to deserve one.

## Data boundaries

Name, repository, condition, stack, attention count and address come from
saved records (`listApplicationItems`). Kind and purpose are read from the
repository name (`application-kind.ts`); unknown software gets the generic
screen and its repository as the purpose. The screens are drawings; their
lines and numbers are decorative and never read from the host.
