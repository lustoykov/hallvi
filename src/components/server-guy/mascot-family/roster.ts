/**
 * The Little Server family: Little Server and five cousins built from the
 * same parts. Paint is identity, never application state: every paint is
 * one of the mascot palette's cool blues or a close cool variation.
 */

export type FamilyId = "server" | "tower" | "rack" | "pip" | "vault" | "relay";

/** Little Server's dances; each cousin has a favourite for its surprise. */
export type Dance = "shuffle" | "robot" | "floss" | "backflip" | "cartwheel";

/** What a character does when the page has been left alone. */
export type IdleKind = "wave" | "look" | "nap" | "peek" | "pat" | "listen";

export type Member = {
  id: FamilyId;
  name: string;
  paint: string;
  paintName: string;
  dance: Dance;
  danceName: string;
  idle: IdleKind;
};

export const FAMILY: Member[] = [
  {
    id: "server",
    name: "Little Server",
    paint: "#8c9fb9",
    paintName: "Slate",
    dance: "backflip",
    danceName: "backflip",
    idle: "wave",
  },
  {
    id: "tower",
    name: "Lumen",
    paint: "#6f86ad",
    paintName: "Dusk",
    dance: "robot",
    danceName: "the robot",
    idle: "look",
  },
  {
    id: "rack",
    name: "Tug",
    paint: "#bac6d8",
    paintName: "Silver-blue",
    dance: "shuffle",
    danceName: "shuffle",
    idle: "nap",
  },
  {
    id: "pip",
    name: "Pip",
    paint: "#7198db",
    paintName: "Cornflower",
    dance: "cartwheel",
    danceName: "cartwheel",
    idle: "peek",
  },
  {
    id: "vault",
    name: "Trove",
    paint: "#99addb",
    paintName: "Periwinkle",
    dance: "floss",
    danceName: "floss",
    idle: "pat",
  },
  {
    id: "relay",
    name: "Ping",
    paint: "#80a9c9",
    paintName: "Harbour",
    dance: "shuffle",
    danceName: "ear shuffle",
    idle: "listen",
  },
];

export const memberById = (id: FamilyId) => FAMILY.find((m) => m.id === id)!;
