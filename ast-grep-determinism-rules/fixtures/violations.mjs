export async function nondeterministicListing(entries) {
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function unboundedPageRead(page) {
  const response = await fetch(page);
  const text = await response.text();
  return text;
}

export async function unboundedJsonRead(url) {
  const res = await fetch(url);
  return res.json();
}

export async function inlineUnboundedRead(url) {
  return (await fetch(url)).text();
}
