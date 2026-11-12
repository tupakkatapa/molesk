// An async value rebuilt at most every `ttlMs`. Once it is older, callers
// get the last value while one rebuild runs in the background; after
// `invalidate` the next caller waits for a fresh build. A build that started
// before an invalidation, or failed, is never stored.
function expiring(build, ttlMs = 5000) {
  let value = null;
  let pending = null;
  let generation = 0;

  const start = () => {
    const started = generation;
    const at = Date.now();
    const promise = Promise.resolve().then(build);
    pending = promise;
    promise
      .then(
        (result) => {
          if (started === generation) value = { at, result };
        },
        () => {},
      )
      .finally(() => {
        if (pending === promise) pending = null;
      });
    return promise;
  };

  return {
    get() {
      if (!value) return pending ?? start();
      if (!pending && Date.now() - value.at > ttlMs) start();
      return Promise.resolve(value.result);
    },
    peek: () => value?.result,
    invalidate() {
      generation++;
      value = null;
      pending = null;
    },
  };
}

module.exports = { expiring };
