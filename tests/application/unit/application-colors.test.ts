import { expect, it } from "vitest";

import {
  APPLICATION_COLORS,
  applicationColors,
} from "../../../src/components/hallvi/home/application-kind";

it("gives neighbours different colours and keeps an application's colour as others arrive", () => {
  const ids = Array.from({ length: 8 }, (_, index) => `application-${index}`);
  const colors = applicationColors(ids);
  expect(new Set(colors.values()).size).toBe(APPLICATION_COLORS.length);
  const later = applicationColors([...ids.slice(0, 3), "a-newcomer"]);
  for (const id of ids.slice(0, 3)) expect(later.get(id)).toBe(colors.get(id));
});
