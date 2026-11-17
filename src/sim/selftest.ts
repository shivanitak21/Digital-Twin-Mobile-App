import { command, getLastTestResult, getState, listScenarios, runScenario, setLoopsEnabled } from './simulator';

setLoopsEnabled(false);

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`assertion failed: ${name}`);
}

async function main() {
  const before = getState();
  assert('starts unlocked', before.locked === false);
  command('door', { door: 'fl', open: true });
  assert('lock rejected while door open', command('lock', { locked: true }) === false);
  assert('still unlocked', getState().locked === false);
  assert('door stayed open', getState().doors.fl === true);
  command('door', { door: 'fl', open: false });
  command('lock', { locked: true });
  assert('locked', getState().locked === true);
  assert('door rejected while locked', command('door', { door: 'fl', open: true }) === false);
  command('lock', { locked: false });
  command('gear', { gear: 'D' });
  command('speed', { kmh: 40 });
  assert('door rejected while moving', command('door', { door: 'fl', open: true }) === false);
  command('speed', { kmh: 0 });
  command('gear', { gear: 'R' });
  assert('reverse speed capped', command('speed', { kmh: 50 }) === false);
  assert('reverse speed unchanged', getState().speed === 0);
  command('speed', { kmh: 0 });
  command('gear', { gear: 'P' });
  command('charge', { on: true });
  assert('charge in park', getState().ev.charging === true);
  assert('drive rejected while charging', command('gear', { gear: 'D' }) === false);
  command('charge', { on: false });
  const locked = getState().locked;
  const door = getState().doors.fl;
  command('attack', { type: 'remote' });
  assert('blocked attack leaves lock', getState().locked === locked);
  assert('blocked attack leaves door', getState().doors.fl === door);
  assert('threat counted', getState().security.blocked >= 1);
  command('reset');

  const results: { id: string; status: string | undefined }[] = [];
  for (const scenario of listScenarios()) {
    const ok = await runScenario(scenario.id, { delayScale: 0 });
    const report = getLastTestResult();
    results.push({ id: scenario.id, status: report?.status });
    if (!ok || report?.status !== 'PASS') {
      console.error(scenario.id, report?.status, report?.state && {
        gear: report.state.gear,
        speed: report.state.speed,
        locked: report.state.locked,
        doors: report.state.doors,
        tpms: report.state.tpms,
        hazards: report.state.hazards,
        adas: report.state.adas,
        security: report.state.security,
        ev: report.state.ev,
        wipers: report.state.wipers,
        road: report.state.motion.road,
        destination: report.state.infotainment.destination,
        media: report.state.infotainment.media,
        hvac: report.state.ev.hvac,
        windows: report.state.windows,
      });
    }
  }
  const failed = results.filter((item) => item.status !== 'PASS');
  console.log(results.map((item) => `${item.id}:${item.status}`).join('\n'));
  if (failed.length) {
    console.error(`${failed.length} scenario(s) failed`);
    process.exit(1);
  }
  console.log(`PASS ${results.length} scenarios`);
  process.exit(0);
}

void main();
