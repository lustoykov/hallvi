// Short provider operations do not have a queued Run row. Keep corrections
// from changing their base while a publication or GitHub read is in flight.
const active = new Map<string, number>();
export function hasApplicationOperation(applicationId: string) {
  return (active.get(applicationId) ?? 0) > 0;
}
export async function duringApplicationOperation<T>(
  applicationId: string,
  work: () => Promise<T>,
): Promise<T> {
  active.set(applicationId, (active.get(applicationId) ?? 0) + 1);
  try {
    return await work();
  } finally {
    const remaining = (active.get(applicationId) ?? 1) - 1;
    if (remaining) active.set(applicationId, remaining);
    else active.delete(applicationId);
  }
}
