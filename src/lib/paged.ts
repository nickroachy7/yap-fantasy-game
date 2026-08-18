/**
 * PostgREST silently caps `.select()` at 1000 rows and returns no error and no
 * indication that it truncated. We have already shipped that bug once (a job
 * scored 1000 of 1584 rows and returned HTTP 200), so any query whose result
 * set can grow without bound has to page.
 *
 * The `order` you pass MUST be unique, or include a unique tiebreak. Paging
 * over a non-unique sort key can repeat or drop rows between requests, because
 * the server is free to order ties differently each time.
 */
const PAGE = 500;
const MAX_PAGES = 60; // backstop so a misbehaving response cannot spin forever

export type PagedQuery<T> = (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

export async function fetchAllPages<T>(query: PagedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    // A short page proves we reached the end without a second round trip.
    if (batch.length < PAGE) return rows;
  }
  return rows;
}
