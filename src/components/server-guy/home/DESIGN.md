# Applications home

The selected D / Together composition comes from `codex/homepage-exploration` at
`896337dc4f8acd7eb4ff959a6f0b57d85330a14e`. It is integrated into the real
`/applications` route on `codex/single-instance-runtime`.

## Design decisions

- Use the existing application blue/slate theme and Geist typography throughout.
  The user explicitly rejected the prototype's Instrument Serif heading.
- Typography: heading 36px / 700 with -0.03em tracking, 32px on small screens;
  body 15px; app names 16px desktop and 18px mobile; secondary labels 12–14px.
  Miniature interface artwork uses 7–14px labels because it is an illustration,
  not the product's readable operational interface.
- Keep Little Server's original box silhouette. Slate, silver-blue, periwinkle, and cornflower
  palettes distinguish caretakers and their associated app illustrations.
  Navy faces, ice-blue expressions, and cool neutral hardware match the app's
  ink and blue-soft colors; neutral lighting preserves the cooler palette.
  These colors identify applications, not health or operational state.
- Keep the mascot above the complete miniature application. Three columns on
  wide screens, two on medium screens, one on phones. Real names can wrap.
- Use native buttons and links. Selecting a caretaker scopes the chat action;
  the selected application name appears beneath that action. Opening an app
  leads to its existing production workspace and chat.
- Ambient greetings are short and staggered. Backflips and cartwheels require
  a button press. Pause and reduced-motion preferences suppress animation;
  offscreen and hidden-page canvases skip rendering. WebGL failure leaves a
  static face and working application navigation.

## Data boundaries

Application names, repositories, condition, stack, attention, and protection
come from existing saved application records. Miniature previews are explicitly
labeled “Interface illustration”; their graphs and task phrases are decorative.
The protection notice derives from records and links to the existing Backups
section. It neither promises a backup nor performs one.

The source prototype remains available for design exploration. Its fake records,
chat, operations, alternate page variants, and galleries are not production data.
