import { globalScene } from "#app/global-scene";
import { TextStyle } from "#enums/text-style";
import { addTextObject } from "#ui/text";
import { getAccountUser, syncCloud } from "../../standalone-public/cloud.js";
import { daycareServerNow, getDaycareStatus, startDaycareSync } from "../../standalone-public/daycare-client.js";
import { formatDaycareTime } from "../../standalone-public/breeding-rules.js";
import { canManageCollectionAtPhase } from "./ownership-store";

const installed = new WeakSet<object>();
export function installDaycareStatus(): void {
  if (import.meta.env.MODE !== "standalone" || installed.has(globalScene.ui)) return;
  installed.add(globalScene.ui);
  startDaycareSync();
  const { width, height } = globalScene.scaledCanvas;
  const label = addTextObject(width / 2, -height + 1, "", TextStyle.MESSAGE, { fontSize: "30px" }).setOrigin(0.5, 0);
  globalScene.ui.add(label);
  globalScene.time.addEvent({ delay: 1000, loop: true, callback: () => {
    const data = getDaycareStatus();
    label.setVisible(!!getAccountUser() && !!data);
    if (!data) return;
    const remaining = Math.max(0, data.state.legendaryNextAt - daycareServerNow());
    label.setText(`Gems: ${data.state.gems} | Legendary: ${remaining ? formatDaycareTime(remaining) : "Ready"}`);
  } });
}
export function openDaycare(): boolean {
  const phase = globalScene.phaseManager.getCurrentPhase().phaseName;
  if (!canManageCollectionAtPhase(phase)) {
    globalScene.ui.showText("Visit the Breeding Center from the title screen after saving and quitting your run.", null, () => globalScene.ui.showText(""), 1500);
    return false;
  }
  void syncCloud().then(() => { window.location.href = "/daycare.html"; }).catch(error => {
    console.error(error);
    globalScene.ui.showText("Cloud sync needs attention. Open Account before visiting the Daycare; your local progress is safe.");
  });
  return true;
}
