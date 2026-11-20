import { createGovernor } from '../../src/content/governor.js';

function setup(initial) {
  let now = 0;
  const changes = [];
  const g = createGovernor({ initial, now: () => now, onChange: (state, reason) => changes.push([state, reason]) });
  return { g, changes, at: (t) => { now = t; } };
}

describe('governor', () => {
  test('starts in normal by default', () => {
    expect(setup().g.state).toBe('normal');
  });
  test('three worker failures in a row move to local', () => {
    const { g, changes } = setup();
    g.workerFailed(); g.workerFailed();
    expect(g.state).toBe('normal');
    g.workerFailed();
    expect(g.state).toBe('local');
    expect(changes[0][0]).toBe('local');
  });
  test('a worker success resets the failure count', () => {
    const { g } = setup();
    g.workerFailed(); g.workerFailed(); g.workerOk(); g.workerFailed(); g.workerFailed();
    expect(g.state).toBe('normal');
  });
  test('over 200 ms of page-thread parsing within 1 s moves to lite', () => {
    const { g, at } = setup('local');
    at(0); g.recordLocal(150);
    at(500); g.recordLocal(100);
    expect(g.state).toBe('lite');
  });
  test('the window slides: costs more than 1 s apart do not add up', () => {
    const { g, at } = setup('local');
    at(0); g.recordLocal(150);
    at(1200); g.recordLocal(100);
    expect(g.state).toBe('local');
  });
  test('going over budget again in lite pauses', () => {
    const { g, at } = setup('lite');
    at(0); g.recordLocal(150);
    at(300); g.recordLocal(100);
    expect(g.state).toBe('paused');
  });
  test('2 s of page-thread parsing in total pauses', () => {
    const { g, at } = setup('lite');
    for (let i = 0; i < 25; i++) { at(i * 2000); g.recordLocal(90); }
    expect(g.state).toBe('paused');
  });
  test('paused stops parsing and resume continues in lite', () => {
    const { g, at } = setup('lite');
    at(0); g.recordLocal(300);
    expect(g.state).toBe('paused');
    expect(g.canParse).toBe(false);
    g.resume();
    expect(g.state).toBe('lite');
    expect(g.canParse).toBe(true);
    at(100); g.recordLocal(150); // budget starts over after resume
    expect(g.state).toBe('lite');
  });
  test('never moves back to a lighter state on its own', () => {
    const { g } = setup('lite');
    g.workerFailed(); g.workerFailed(); g.workerFailed(); g.workerOk();
    expect(g.state).toBe('lite');
  });
  test('only lite turns off context-aware detection', () => {
    expect(setup('normal').g.contextAware).toBe(true);
    expect(setup('local').g.contextAware).toBe(true);
    expect(setup('lite').g.contextAware).toBe(false);
  });
});
