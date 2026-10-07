// Back up / restore screens, used from Settings and from the empty Tickets page.
import { h, overlay, actionSheet, toast, pickFiles, confirmDialog } from './ui.js';
import { exportBackup, importBackup, state } from './store.js';

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1);

function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60_000);
}

export async function backupFlow() {
  const choice = await actionSheet({
    title: 'Back up your concerts',
    actions: [
      { label: 'Everything, incl. photos & videos', value: 'full' },
      { label: 'Tickets & setlists only (small file)', value: 'light' },
    ],
  });
  if (!choice) return;
  toast('Preparing backup…');
  let blob;
  try {
    blob = await exportBackup({ includeMedia: choice === 'full' });
  } catch (e) {
    toast(`Backup failed: ${e.message || e}`);
    return;
  }
  document.querySelector('.toast')?.remove();
  const count = state.items.filter((i) => i.kind === 'concert').length;
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File([blob], `stubs-backup-${stamp}.stubs`, { type: 'application/octet-stream' });

  // Saving needs a fresh tap (iPhones block the share sheet if it opens too long after one).
  const save = async () => {
    dlg.close();
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Stubs backup' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    download(file, file.name);
  };
  const dlg = overlay(h('div.dialog',
    h('h3', 'Backup ready'),
    h('p', `${count} concert${count === 1 ? '' : 's'} · ${mb(blob.size)} MB. Tap Save, then choose "Save to Files" (or AirDrop it to another phone).`),
    h('div.dialog-buttons',
      h('button', { type: 'button', onclick: () => dlg.close() }, 'Cancel'),
      h('button.strong', { type: 'button', onclick: save }, 'Save')),
  ), { variant: 'dialog' });
}

export async function restoreFlow() {
  if (state.items.length && !await confirmDialog({
    title: 'Restore a backup?',
    message: 'Everything in the backup is added to this app. Tickets already here are kept (the backup\'s copy wins if it\'s the same ticket).',
    confirm: 'Choose file',
  })) return;
  // No file-type filter: some phones grey out backup files otherwise.
  const [file] = await pickFiles({ accept: '', multiple: false });
  if (!file) return;
  const status = h('p', 'Reading backup…');
  const dlg = overlay(h('div.dialog', h('h3', 'Restoring'), status), { variant: 'dialog', dismissable: false });
  try {
    const res = await importBackup(file, (done, total) => { status.textContent = `Copying photos & videos… ${done} of ${total}`; });
    dlg.close();
    const parts = [
      `${res.concerts} concert${res.concerts === 1 ? '' : 's'}`,
      res.wishes && `${res.wishes} wishlist artist${res.wishes === 1 ? '' : 's'}`,
      res.media && `${res.media} photos/videos`,
    ].filter(Boolean);
    toast(`Restored ${parts.join(', ')}`);
  } catch (e) {
    dlg.close();
    toast(e instanceof SyntaxError ? 'That file isn\'t a Stubs backup' : (e.message || 'Couldn\'t read that backup'));
  }
}
