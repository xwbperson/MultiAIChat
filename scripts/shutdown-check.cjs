const path = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { _electron } = require('playwright-core');

async function main() {
  const cwd = path.resolve(__dirname, '..');
  const executablePath = path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe');
  const userDataDirectory = mkdtempSync(path.join(tmpdir(), 'multi-ai-chat-shutdown-'));
  const processOutput = [];
  let electronApp;

  try {
    electronApp = await _electron.launch({
      cwd,
      executablePath,
      args: ['.', `--user-data-dir=${userDataDirectory}`],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
    });
    const child = electronApp.process();
    child.stdout?.on('data', chunk => processOutput.push(chunk.toString()));
    child.stderr?.on('data', chunk => processOutput.push(chunk.toString()));

    const page = await electronApp.firstWindow();
    await page.locator('.site-item').nth(1).waitFor();
    const target = await page.evaluate(async () => {
      const site = (await window.api.getSites())[1];
      const account = site.accounts.find(candidate => candidate.isDefault) || site.accounts[0];
      return { siteId: site.id, accountId: account.id };
    });
    await page.evaluate(targetSite => (
      window.api.switchSite(targetSite.siteId, targetSite.accountId)
    ), target);

    const closed = electronApp.waitForEvent('close');
    await page.evaluate(() => {
      window.api.forceQuit();
    }).catch(() => {});
    await closed;
    electronApp = null;

    const output = processOutput.join('');
    const fatalLines = output.split(/\r?\n/).filter(line => (
      /Object has been destroyed|Uncaught Exception|JavaScript error occurred in the main process/i.test(line)
    ));
    const result = {
      shutdownWithoutMainProcessException: fatalLines.length === 0,
      fatalLines
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.shutdownWithoutMainProcessException) process.exitCode = 1;
  } finally {
    if (electronApp) await electronApp.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
