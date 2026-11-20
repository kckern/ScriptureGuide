// Per-page degradation state. It only moves forward during a visit:
//   normal  - parse in the background worker, full detection
//   local   - parse on the page thread, one chunk per idle slice (worker failed 3 times)
//   lite    - local, with context-aware detection off (page-thread parsing over budget)
//   paused  - stop scanning (over budget again in lite, or too much page-thread time in total)
// resume() is the one way back: the reader asks to continue, in lite.

export const STATES = ['normal', 'local', 'lite', 'paused'];
const WINDOW_MS = 1000;
const WINDOW_BUDGET_MS = 200;
const TOTAL_BUDGET_MS = 2000;
const WORKER_FAILURES = 3;

export function createGovernor({ initial = 'normal', now = () => Date.now(), onChange = () => {} } = {}) {
  let state = STATES.includes(initial) ? initial : 'normal';
  let failures = 0;
  let costs = []; // [time, ms] of page-thread parses within the window
  let total = 0;

  const moveTo = (next, reason) => {
    if (STATES.indexOf(next) <= STATES.indexOf(state)) return;
    state = next;
    onChange(state, reason);
  };

  return {
    get state() { return state; },
    get canParse() { return state !== 'paused'; },
    get contextAware() { return state !== 'lite'; },
    workerOk() { failures = 0; },
    workerFailed() {
      if (++failures >= WORKER_FAILURES) moveTo('local', `worker failed ${failures} times in a row`);
    },
    recordLocal(ms) {
      const t = now();
      costs = costs.filter(([at]) => t - at < WINDOW_MS);
      costs.push([t, ms]);
      total += ms;
      const inWindow = costs.reduce((sum, [, c]) => sum + c, 0);
      if (state === 'lite' && total >= TOTAL_BUDGET_MS) {
        moveTo('paused', `${Math.round(total)} ms of page-thread parsing in total`);
      } else if (inWindow > WINDOW_BUDGET_MS) {
        costs = [];
        moveTo(state === 'lite' ? 'paused' : 'lite', `${Math.round(inWindow)} ms in 1 s`);
      }
    },
    resume() {
      if (state !== 'paused') return;
      state = 'lite';
      costs = [];
      total = 0;
      onChange(state, 'resumed by the reader');
    }
  };
}
