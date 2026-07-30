export function createSilentLogger() {
  return {
    debug() {},
    error() {},
    fatal() {},
    info() {},
    trace() {},
    warn() {},
  };
}
