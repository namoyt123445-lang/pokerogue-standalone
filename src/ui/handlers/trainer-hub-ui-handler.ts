import { Button } from "#enums/buttons";
import { UiHandler } from "#ui/ui-handler";
import { TrainerHubArt, type HubRenderer, type HubView } from "../../fan/trainer-hub-art";
import { globalScene } from "#app/global-scene";
import { UiMode } from "#enums/ui-mode";

export class TrainerHubUiHandler extends UiHandler {
  private view: HubView | null = null;
  private art: HubRenderer | null = null;
  private clock: Phaser.Time.TimerEvent | null = null;
  constructor(private createArt: () => HubRenderer = () => new TrainerHubArt()) { super(); }
  setup(): void {}
  override show(args: [HubView]): boolean {
    super.show(args); this.view = args[0]; this.cursor = 0;
    this.clock ??= globalScene.time.addEvent({ delay: 1000, loop: true, callback: () => {
      if (this.view?.liveSubtitle && globalScene.ui.mode === UiMode.TRAINER_HUB) this.draw();
    } });
    this.art ??= this.createArt(); this.draw(); return true;
  }
  private draw(): void {
    if (this.view) this.art?.render(this.view, this.cursor, i => this.choose(i), delta => this.move(delta));
  }
  private choose(index: number): void {
    if (!this.view || this.view.busy) return;
    const card = this.view.cards[index]; if (!card) return;
    this.cursor = index;
    if (card.disabled) { this.getUi().playError(); this.draw(); return; }
    this.getUi().playSelect(); card.action();
  }
  private move(delta: number): void {
    if (!this.view || this.view.busy || !this.view.cards.length) return;
    this.cursor = (this.cursor + delta + this.view.cards.length) % this.view.cards.length;
    this.getUi().playSelect(); this.draw();
  }
  processInput(button: Button): boolean {
    if (!this.view || this.view.busy) return false;
    if (button === Button.CANCEL) this.view.onBack();
    else if (button === Button.ACTION || button === Button.SUBMIT) this.choose(this.cursor);
    else if (button === Button.UP || button === Button.DOWN) this.move(button === Button.UP ? -1 : 1);
    else if (button === Button.LEFT || button === Button.RIGHT) {
      const direction = button === Button.LEFT ? -1 : 1;
      this.view.onTab(direction);
    } else return false;
    return true;
  }
  override clear(): void {
    super.clear(); this.clock?.remove(); this.clock = null;
    this.art?.destroy(); this.art = null; this.view = null;
  }
  override destroy(): void { this.clear(); }
}
