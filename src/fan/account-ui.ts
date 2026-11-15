import { globalScene } from "#app/global-scene";
import { UiMode } from "#enums/ui-mode";
import type { OptionSelectItem } from "#types/ui-types";
import { api, getAccountUser, readSnapshot, hasProgress, syncCloud, writeSnapshot, uploadSnapshot } from "../../standalone-public/cloud.js";

let bootstrapError = "";
export const setAccountBootstrapError = (message: string): void => { bootstrapError = message; };
export const getAccountBootstrapError = (): string => bootstrapError;

function download(save: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Account controls stay in native game windows; no external login page. */
export function openNativeAccount(problem = ""): boolean {
  const user = getAccountUser(), ui = globalScene.ui;
  let busy = false;
  const item = (label: string, action: () => void): OptionSelectItem => ({
    label, keepOpen: true, handler: () => { if (!busy) action(); return true; },
  });
  const heading = (label: string): OptionSelectItem => ({ label, selectable: false, handler: () => false });
  const show = (options: OptionSelectItem[]): void => {
    const handler = ui.getHandler(); handler.clear(); handler.show([{ options, maxOptions: 9 }]);
  };
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    if (busy) return; busy = true;
    show([heading("Working safely..."), item("Please wait", () => {})]);
    try { await action(); }
    catch (error) { problem = error instanceof Error ? error.message : "Please try again."; }
    finally { busy = false; show(menu()); }
  };
  const confirm = (text: string, action: () => Promise<unknown>): void => show([
    heading(text), item("Confirm", () => { void run(action); }), item("Cancel", () => show(menu())),
  ]);
  const menu = (): OptionSelectItem[] => {
    const options = [heading(user ? `Trainer: ${user.username}` : "Trainer account / Guest")];
    if (problem) {
      for (const line of problem.match(/.{1,46}(?:\s|$)|.{1,46}/g) || []) options.push(heading(line.trim()));
    }
    if (!user) {
      options.push(item("Log in / Register", () => {
        sessionStorage.removeItem("fan-native-guest"); window.location.reload();
      }));
      if (bootstrapError) options.push(item("Retry connection", () => window.location.reload()));
    } else {
      options.push(item("Save now", () => { void run(async () => { await syncCloud(); problem = "Cloud save is up to date."; }); }));
      options.push(item("Download device backup", () => { void run(async () => download(await readSnapshot(), `pokerogue-${user.username}-backup.json`)); }));
      options.push(item("Download previous cloud backup", () => { void run(async () => {
        const { backups } = await api("save/backups");
        if (!backups.length) throw new Error("No earlier cloud revision yet.");
        const { save } = await api(`save/backups/${backups[0].revision}`);
        download(save, `pokerogue-${user.username}-previous-cloud.json`);
      }); }));
      options.push(item("Import guest progress...", () => confirm("Copy guest into this account? Existing cloud is backed up.", async () => {
        const guest = await readSnapshot(null), cloud = await api("save");
        if (!hasProgress(guest)) throw new Error("No guest progress to import. Your account was not changed.");
        await uploadSnapshot(guest, cloud.revision);
        // Re-read the protected server result, including hatch grants.
        const latest = await api("save");
        await writeSnapshot(latest.save, latest.revision); window.location.reload();
      })));
      if (bootstrapError.includes("Both this device")) {
        options.push(item("Resolve: keep this device", () => confirm("Replace cloud with this device? Cloud backup is retained.", async () => {
          const cloud = await api("save");
          await uploadSnapshot(await readSnapshot(), cloud.revision); window.location.reload();
        })));
        options.push(item("Resolve: restore cloud", () => confirm("Restore cloud? This device is backed up first.", async () => {
          const cloud = await api("save"); await writeSnapshot(cloud.save, cloud.revision); window.location.reload();
        })));
      }
      options.push(item("Log out", () => confirm("Save and log out of this account?", async () => {
        if (!bootstrapError) await syncCloud();
        await api("logout", "POST", {}); sessionStorage.removeItem("fan-native-guest"); window.location.reload();
      })));
    }
    options.push(item(bootstrapError ? "Retry / Reload" : "Back to game", () => {
      if (bootstrapError) window.location.reload(); else ui.revertMode();
    }));
    return options;
  };
  ui.setOverlayMode(UiMode.OPTION_SELECT, { options: menu(), maxOptions: 9 });
  return true;
}
