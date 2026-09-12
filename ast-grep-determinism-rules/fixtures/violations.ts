export function nondeterministicListing(entries: Array<{ name: string }>) {
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function unboundedPageRead(page: string): Promise<string> {
  const response = await fetch(page);
  return response.text();
}
