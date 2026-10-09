/** Test-only Node preload, inherited by worker threads; never copied into the runtime image. */
const original = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(String(input));
  if (url.protocol !== 'https:' || !/\.(backblazeb2|backblaze)\.com$/.test(url.hostname))
    throw Error('Unexpected external request in backup fixture');
  return original(process.env.DONE_TEST_B2_ORIGIN + url.pathname + url.search, options);
};
