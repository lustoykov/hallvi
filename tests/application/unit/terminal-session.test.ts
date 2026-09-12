import { beforeEach, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  host: {
    address: "example.test",
    user: "root",
    port: 22,
    privateKeyPath: "/tmp/key",
    knownHostsPath: "/tmp/known-hosts",
  },
  kill: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node-pty", () => ({ spawn: fake.spawn }));
vi.mock("@/server/operator-execution", () => ({
  operatorSettings: () => ({ host: fake.host }),
}));
import { TerminalSession } from "@/server/terminal-session";

beforeEach(() => {
  vi.clearAllMocks();
  fake.host = {
    address: "example.test",
    user: "root",
    port: 22,
    privateKeyPath: "/tmp/key",
    knownHostsPath: "/tmp/known-hosts",
  };
  fake.spawn.mockReturnValue({
    onData: vi.fn(),
    onExit: vi.fn(),
    kill: fake.kill,
    write: fake.write,
    resize: fake.resize,
  });
});

it("pins the saved SSH identity and closes the old shell when the target changes", () => {
  const session = new TerminalSession("session", "application", fake.host, {
    cols: 80,
    rows: 24,
  });
  const state = vi.fn();
  session.attach({ output: vi.fn(), state });
  const [command, args, options] = fake.spawn.mock.calls[0];
  expect(command).toBe("ssh");
  expect(args).toEqual(
    expect.arrayContaining([
      "-F",
      "/dev/null",
      "-tt",
      "StrictHostKeyChecking=yes",
      "IdentitiesOnly=yes",
      "BatchMode=yes",
      "root@example.test",
    ]),
  );
  expect(options.env.SSH_AUTH_SOCK).toBeUndefined();
  expect(session.checkTarget()).toBe(true);
  session.write(Buffer.from("pwd\r"));
  expect(fake.write).toHaveBeenCalledWith("pwd\r");
  session.resize({ cols: 120, rows: 40 });
  expect(fake.resize).toHaveBeenCalledWith(120, 40);
  fake.host = { ...fake.host, address: "replacement.test" };
  expect(session.checkTarget()).toBe(false);
  expect(state).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: "failed" }),
  );
  expect(fake.kill).toHaveBeenCalledTimes(1);
  session.write(Buffer.from("must not run"));
  expect(fake.write).toHaveBeenCalledTimes(1);
  session.dispose();
  expect(fake.kill).toHaveBeenCalledTimes(1);
});
