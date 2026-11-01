const fs = require('node:fs');
const path = require('node:path');

function prepareXcodeNode(iosDirectory) {
  const localFile = path.join(iosDirectory, '.xcode.env.local');
  // process.execPath is the running executable, not a temporary npm/Yarn shim.
  const nodeBinary = fs.realpathSync(process.execPath);
  const quoted = "'" + nodeBinary.replaceAll("'", "'\\''") + "'";
  try {
    fs.writeFileSync(localFile, `# Local Mac Node path for Xcode. Do not share this file.\nexport NODE_BINARY=${quoted}\n`, { flag: 'wx', mode: 0o600 });
    return 'created';
  } catch (error) {
    if (error.code === 'EEXIST') return 'preserved';
    throw error;
  }
}
module.exports = { prepareXcodeNode };
if (require.main === module) {
  try { console.log(`Xcode local Node environment: ${prepareXcodeNode(process.argv[2] ?? 'ios')}.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
