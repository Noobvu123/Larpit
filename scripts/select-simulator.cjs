const fs = require('node:fs');

function chooseSimulator(list, requested = '') {
  const devices = Object.entries(list.devices ?? {}).flatMap(([runtime, values]) =>
    /\.iOS-/.test(runtime) && Array.isArray(values)
      ? values.filter(device => device.isAvailable !== false && /^iPhone\b/.test(device.name)
        && /^[0-9a-f-]{36}$/i.test(device.udid)).map(device => ({ ...device, runtime }))
      : []);
  if (requested) {
    const selected = devices.find(device => device.udid.toLowerCase() === requested.toLowerCase());
    if (!selected) throw new Error('LARPIT_SIMULATOR_UDID must identify an available iPhone simulator.');
    return selected.udid;
  }
  // Respect an iPhone the user already opened, then prefer the newest installed runtime.
  devices.sort((a, b) => Number(b.state === 'Booted') - Number(a.state === 'Booted')
    || b.runtime.localeCompare(a.runtime, undefined, { numeric: true })
    || a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!devices.length) throw new Error('No available iPhone simulator. In Xcode, install an iOS runtime under Settings > Components, then create an iPhone simulator under Window > Devices and Simulators.');
  return devices[0].udid;
}

module.exports = { chooseSimulator };
if (require.main === module) {
  try { process.stdout.write(chooseSimulator(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), process.argv[3] ?? '') + '\n'); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
