const path = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { _electron } = require('playwright-core');

async function main() {
  const cwd = path.resolve(__dirname, '..');
  const selectedCase = process.env.UI_CASE || 'all';
  const executablePath = path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe');
  const userDataDirectory = mkdtempSync(path.join(tmpdir(), 'multi-ai-chat-ui-'));
  const consoleErrors = [];
  let electronApp;

  try {
    electronApp = await _electron.launch({
      cwd,
      executablePath,
      args: ['.', `--user-data-dir=${userDataDirectory}`],
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }
    });

    const page = await electronApp.firstWindow();
    const actualUserDataDirectory = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    if (path.resolve(actualUserDataDirectory) !== path.resolve(userDataDirectory)) {
      throw new Error(`Electron ignored isolated user data directory: ${actualUserDataDirectory}`);
    }
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(error.message));

    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setSize(760, 600);
      window.center();
      window.show();
    });

    const result = {};
    let failed = false;

    const readSiteNames = () => page.locator('.site-card-name').allTextContents();
    const dragSiteAfter = async (fromIndex, targetIndex) => {
      const handle = page.locator('.site-card-drag-handle').nth(fromIndex);
      const target = page.locator('.site-card').nth(targetIndex);
      const handleBox = await handle.boundingBox();
      const targetBox = await target.boundingBox();
      if (!handleBox || !targetBox) throw new Error('Site drag handle is not visible');

      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height * 0.75,
        { steps: 8 }
      );
      await page.mouse.up();
    };

    if (selectedCase === 'all' || selectedCase === 'settings') {
      await page.locator('#btn-settings').click();
      await page.locator('#settings-overlay:not(.hidden)').waitFor();
      const settingsLayout = await page.locator('#settings-overlay').evaluate(overlay => {
        const panel = overlay.querySelector('.settings-panel');
        const content = overlay.querySelector('.settings-content');
        const panelRect = panel.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        return {
          viewportHeight: window.innerHeight,
          panelHeight: panelRect.height,
          contentClientHeight: content.clientHeight,
          contentScrollHeight: content.scrollHeight,
          contentBottom: contentRect.bottom,
          panelBottom: panelRect.bottom,
          overflowY: getComputedStyle(content).overflowY,
          minHeight: getComputedStyle(content).minHeight
        };
      });
      const content = page.locator('#settings-overlay .settings-content');
      await content.hover();
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(100);
      settingsLayout.scrollTopAfterWheel = await content.evaluate(element => element.scrollTop);

      result.settingsScrollable = settingsLayout.contentBottom <= settingsLayout.panelBottom + 1
        && settingsLayout.contentScrollHeight > settingsLayout.contentClientHeight
        && settingsLayout.scrollTopAfterWheel > 0
        && ['auto', 'scroll'].includes(settingsLayout.overflowY);
      result.settingsUsesAvailableHeight = settingsLayout.panelHeight >= settingsLayout.viewportHeight - 40;
      result.settingsLayout = settingsLayout;
      failed ||= !result.settingsScrollable || !result.settingsUsesAvailableHeight;
      await page.locator('#settings-close').click();
    }

    if (selectedCase === 'all' || selectedCase === 'active-count') {
      await page.locator('#statusbar').getByText(/活跃: 1/).waitFor({ timeout: 3000 });
      result.statusAfterFirstView = await page.locator('#statusbar').innerText();

      const firstSiteId = await page.locator('.site-item').first().getAttribute('data-site-id');
      const secondSite = page.locator('.site-item').nth(1);
      const secondSiteId = await secondSite.getAttribute('data-site-id');
      const secondSiteName = await secondSite.locator('.site-name').innerText();
      await secondSite.locator('.site-btn').click();
      await page.waitForFunction(async siteId => (
        (await window.api.getActiveState()).siteId === siteId
      ), secondSiteId);
      await page.waitForTimeout(250);
      result.statusImmediatelyAfterSecondView = await page.locator('#statusbar').innerText();
      result.statusUpdatesOnActivation = (
        result.statusImmediatelyAfterSecondView.includes(secondSiteName)
        && /活跃: 2/.test(result.statusImmediatelyAfterSecondView)
      );
      await page.locator('#statusbar').getByText(new RegExp(secondSiteName)).waitFor({ timeout: 3000 });

      result.statusAfterSecondView = await page.locator('#statusbar').innerText();
      result.activeCountReflectsLoadedViews = /活跃: 2/.test(result.statusAfterSecondView);

      await page.evaluate(siteId => window.api.hibernateSite(siteId), firstSiteId);
      await page.locator('#statusbar').getByText(/活跃: 1 \| 休眠: 1/).waitFor({ timeout: 3000 });
      result.statusAfterHibernate = await page.locator('#statusbar').innerText();
      result.activeCountUpdatesAfterHibernate = /活跃: 1 \| 休眠: 1/.test(result.statusAfterHibernate);
      failed ||= !result.activeCountReflectsLoadedViews
        || !result.statusUpdatesOnActivation
        || !result.activeCountUpdatesAfterHibernate;
    }

    if (selectedCase === 'all' || selectedCase === 'site-order') {
      await page.locator('button[aria-label="打开站点管理"]').click();
      await page.locator('#site-manager-overlay:not(.hidden)').waitFor();
      await page.locator('.site-card').nth(2).waitFor();

      const initialOrder = await readSiteNames();
      const expectedAfterFirstDrag = [
        initialOrder[1],
        initialOrder[2],
        initialOrder[0],
        ...initialOrder.slice(3)
      ];
      await dragSiteAfter(0, 2);
      await page.waitForFunction(expected => (
        Array.from(document.querySelectorAll('.site-card-name'), node => node.textContent)
          .join('\n') === expected.join('\n')
      ), expectedAfterFirstDrag);
      result.siteOrderAfterFirstDrag = await readSiteNames();

      const expectedAfterSecondDrag = [
        initialOrder[2],
        initialOrder[1],
        initialOrder[0],
        ...initialOrder.slice(3)
      ];
      await dragSiteAfter(0, 1);
      await page.waitForFunction(previous => (
        Array.from(document.querySelectorAll('.site-card-name'), node => node.textContent)
          .join('\n') !== previous.join('\n')
      ), expectedAfterFirstDrag, { timeout: 3000 });
      result.siteOrderAfterSecondDrag = await readSiteNames();
      result.siteSequentialDragOrderCorrect = (
        result.siteOrderAfterSecondDrag.join('\n') === expectedAfterSecondDrag.join('\n')
      );

      await page.locator('#site-manager-close').click();
      await page.locator('button[aria-label="打开站点管理"]').click();
      await page.locator('#site-manager-overlay:not(.hidden)').waitFor();
      result.siteOrderAfterReopen = await readSiteNames();
      result.siteDragOrderPersisted = (
        result.siteOrderAfterReopen.join('\n') === expectedAfterSecondDrag.join('\n')
      );
      failed ||= !result.siteSequentialDragOrderCorrect || !result.siteDragOrderPersisted;
      await page.locator('#site-manager-close').click();
    }

    if (selectedCase === 'all' || selectedCase === 'site-actions') {
      await page.locator('button[aria-label="打开站点管理"]').click();
      await page.locator('#site-manager-overlay:not(.hidden)').waitFor();
      await page.locator('.site-card').first().waitFor();

      await page.locator('.site-edit-btn').first().click();
      await page.waitForTimeout(300);
      result.editDialogOpened = await page.locator('.edit-dialog-overlay').count() > 0;
      const editedSiteName = '自动化编辑站点';
      await page.locator('#edit-name').fill(editedSiteName);
      await page.locator('#edit-save').click();
      await page.locator('.site-card').filter({ hasText: editedSiteName }).waitFor();
      result.siteEdited = await page.locator('.site-card').filter({ hasText: editedSiteName }).count() === 1;

      let promptOpened = false;
      const onDialog = async dialog => {
        promptOpened = dialog.type() === 'prompt';
        await dialog.dismiss();
      };
      page.on('dialog', onDialog);
      await page.locator('.add-account-btn').first().click();
      await page.waitForTimeout(300);
      page.off('dialog', onDialog);
      result.accountDialogOpened = promptOpened
        || await page.locator('[data-dialog="account-name"]').count() > 0;
      const addedLabel = '自动化测试账号';
      await page.locator('[data-dialog="account-name"] input').fill(addedLabel);
      await page.locator('[data-dialog="account-name"] button[type="submit"]').click();
      const addedAccount = page.locator('.account-tag').filter({ hasText: addedLabel });
      await addedAccount.waitFor();
      result.accountCreated = await addedAccount.count() === 1;

      let renamePromptOpened = false;
      const onRenameDialog = async dialog => {
        renamePromptOpened = dialog.type() === 'prompt';
        await dialog.dismiss();
      };
      page.on('dialog', onRenameDialog);
      await addedAccount.hover();
      await addedAccount.locator('.rename-account-btn').click();
      await page.waitForTimeout(300);
      page.off('dialog', onRenameDialog);
      result.renameDialogOpened = renamePromptOpened
        || await page.locator('[data-dialog="rename-account"]').count() > 0;
      const renamedLabel = '已重命名测试账号';
      await page.locator('[data-dialog="rename-account"] input').fill(renamedLabel);
      await page.locator('[data-dialog="rename-account"] button[type="submit"]').click();
      await page.locator('.account-tag').filter({ hasText: renamedLabel }).waitFor();
      result.accountRenamed = await page.locator('.account-tag').filter({ hasText: renamedLabel }).count() === 1;
      await page.locator('#site-manager-close').click();
      await page.locator('.site-item').first().locator('.site-btn').click();
      const sidebarAddButton = page.locator('.site-item').first().locator('.add-account');
      await sidebarAddButton.waitFor();

      let sidebarPromptOpened = false;
      const onSidebarDialog = async dialog => {
        sidebarPromptOpened = dialog.type() === 'prompt';
        await dialog.dismiss();
      };
      page.on('dialog', onSidebarDialog);
      await sidebarAddButton.click();
      await page.waitForTimeout(300);
      page.off('dialog', onSidebarDialog);
      result.sidebarAccountDialogOpened = sidebarPromptOpened
        || await page.locator('[data-dialog="sidebar-account-name"]').count() > 0;
      const sidebarAddedLabel = '侧栏自动化账号';
      await page.locator('[data-dialog="sidebar-account-name"] input').fill(sidebarAddedLabel);
      await page.locator('[data-dialog="sidebar-account-name"] button[type="submit"]').click();
      await page.locator('.account-btn .account-label').filter({ hasText: sidebarAddedLabel }).waitFor();
      result.sidebarAccountCreated = await page.locator('.account-btn .account-label')
        .filter({ hasText: sidebarAddedLabel }).count() === 1;
      failed ||= !result.editDialogOpened
        || !result.siteEdited
        || !result.accountDialogOpened
        || !result.accountCreated
        || !result.renameDialogOpened
        || !result.accountRenamed
        || !result.sidebarAccountDialogOpened
        || !result.sidebarAccountCreated;
    }

    result.applicationErrors = consoleErrors.filter(message => (
      !message.startsWith('Failed to load resource:')
    ));
    failed ||= result.applicationErrors.length > 0;
    console.log(JSON.stringify(result, null, 2));

    if (failed) process.exitCode = 1;
  } finally {
    if (electronApp) await electronApp.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
