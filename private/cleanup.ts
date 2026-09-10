/** One-off DevTools bundle for the author's selected import. Never served or precached by the app. */
import { createPrivateMigration } from '../src/ui/privateMigration';

// The paste wrapper supplies a separate same-origin realm so its Yjs copy never shares
// constructors or documents with the running application. Only this small form uses the host DOM.
const host = window.parent.document;

const checkLocked = async () => {
  if (!isSecureContext || !navigator.locks || !crypto.subtle)
    throw Error('Cleanup requires the original secure origin and browser storage.');
  if (!host.querySelector('.local-startup[data-state="unlock-required"]'))
    throw Error('Lock the Local workspace before running this helper.');
  // The author excludes old executables. The current packaged worker serves only app assets;
  // its registration is not an old plaintext writer and this helper does not retire it.
};

void (async () => {
  await checkLocked();
  if (host.getElementById('done-private-cleanup'))
    throw Error('The cleanup helper is already open.');
  const dialog = host.createElement('dialog');
  dialog.id = 'done-private-cleanup';
  dialog.innerHTML = `<form>
    <h2>Remove the retained pre-encryption source</h2>
    <p>Keep other done tabs closed and old sync disconnected. The encrypted workspace and saved files are retained.</p>
    <p><label>Recovery packet <input name="packet" type="file" required></label></p>
    <p><label>Saved binding <input name="binding" type="file" required></label></p>
    <p><label>Device-lock code <input name="code" type="password" autocomplete="off" required></label></p>
    <button type="submit">Clean up source</button>
    <button type="button" name="close">Close</button>
    <p role="status"></p>
  </form>`;
  const form = dialog.querySelector('form')!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
  const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const close = form.querySelector<HTMLButtonElement>('[name="close"]')!;
  const status = dialog.querySelector('[role="status"]')!;
  const owner = createPrivateMigration({ checkBrowser: checkLocked });
  let busy = false;
  const dispose = async () => {
    close.disabled = true;
    submit.disabled = true;
    status.textContent = 'Waiting for any pending storage operation to settle…';
    await owner.close();
    field('code').value = '';
    dialog.remove();
    window.frameElement?.remove();
  };
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void dispose();
  });
  close.addEventListener('click', () => {
    void dispose();
  });
  const assertSuccess = () => {
    const state = owner.getSnapshot();
    if (state.error) throw Error(state.error);
    return state;
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    let code = field('code').value;
    field('code').value = '';
    void (async () => {
      try {
        const packet = field('packet').files?.[0],
          binding = field('binding').files?.[0];
        if (!packet || !binding) throw Error('Select both saved files.');
        status.textContent = 'Verifying saved files and the selected workspace…';
        if (owner.getSnapshot().phase === 'host') {
          await owner.acknowledgeHost();
          assertSuccess();
        }
        await owner.load(packet, binding);
        assertSuccess();
        await owner.unlock(code);
        if (assertSuccess().inspection?.kind !== 'selected')
          throw Error('A selected import is required.');
        status.textContent =
          'Cleaning the authenticated source. Waiting tabs or storage may delay completion…';
        await owner.advance('cleanup');
        const state = assertSuccess();
        if (state.inspection?.kind !== 'selected' || state.inspection.cleanup !== 'terminal')
          throw Error('Cleanup has not reached its verified terminal state.');
        status.textContent =
          'Source cleanup complete. Close this helper, unlock, and verify your writing.';
        await owner.close();
      } catch (error) {
        status.textContent =
          error instanceof Error ? error.message : 'Cleanup refused. Keep the saved files.';
        submit.disabled = false;
      } finally {
        code = '';
        busy = false;
      }
    })();
  });
  host.body.append(dialog);
  dialog.showModal();
})().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Cleanup helper could not start.');
  window.frameElement?.remove();
});
