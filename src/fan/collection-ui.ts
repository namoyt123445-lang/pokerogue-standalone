import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { PokemonData } from "#system/pokemon-data";
import {
  canManageCollectionAtPhase,
  collectionTransaction,
  moveRecord,
  type CollectionSave,
  type OwnedRecord,
} from "./ownership-store";
import { collectionStyle } from "./collection-theme";

export type TeamSelection = { starter: number } | { records: OwnedRecord[] };
let preparedTeam: TeamSelection | undefined;
export async function prepareNewGameTeam(): Promise<boolean> {
  preparedTeam = undefined;
  const selection = await chooseOwnedTeam();
  if (!selection) return false;
  preparedTeam = selection;
  return true;
}
export function takePreparedTeam(): TeamSelection | undefined {
  const selection = preparedTeam;
  preparedTeam = undefined;
  return selection;
}
export function clearPreparedTeam(): void {
  preparedTeam = undefined;
}
const canManageBoxes = (): boolean =>
  canManageCollectionAtPhase(globalScene?.phaseManager?.getCurrentPhase()?.phaseName ?? "");
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text: string, handler: () => void | Promise<void>, className = ""): HTMLButtonElement {
  const node = el("button", text, className);
  node.type = "button";
  node.onclick = () => {
    Promise.resolve()
      .then(handler)
      .catch(error => window.alert((error as Error).message));
  };
  return node;
}
const name = (r: OwnedRecord): string => r.data.nickname || speciesDataRegistry.getSpecies(r.data.species).getName();
const quality = (r: OwnedRecord): number => Math.round((r.data.ivs.reduce((a, b) => a + b, 0) / 186) * 100);
function sprite(id: number, shiny = false): HTMLElement {
  const species = speciesDataRegistry.getSpecies(id),
    image = el("img");
  image.src = `/images/pokemon/icons/${species.generation}/${id}${shiny ? "s" : ""}.png`;
  image.alt = species.getName();
  image.onerror = () => {
    image.style.visibility = "hidden";
  };
  return image;
}
function select(
  label: string,
  values: [string, string][],
  value: string,
  update: (value: string) => void,
): HTMLSelectElement {
  const node = el("select");
  node.setAttribute("aria-label", label);
  for (const [id, text] of values) {
    const option = el("option", text);
    option.value = id;
    node.append(option);
  }
  node.value = value;
  node.onchange = () => update(node.value);
  return node;
}
let closeActive: (() => void) | undefined;
function overlay(): { panel: HTMLElement; close: () => void } {
  closeActive?.();
  if (!document.getElementById("fan-collection-style")) {
    const style = el("style");
    style.id = "fan-collection-style";
    style.textContent = collectionStyle;
    document.head.append(style);
  }
  const root = el("div");
  root.id = "fan-collection";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-label", "Pokémon party and PC boxes");
  const panel = el("section", undefined, "fan-panel");
  root.append(panel);
  const previous = document.activeElement as HTMLElement | null,
    wasEnabled = globalScene?.input?.enabled,
    wasActive = globalScene?.scene?.isActive();
  if (globalScene?.input) globalScene.input.enabled = false;
  if (wasActive) globalScene.scene.pause();
  const resize = (): void => {
    const rect = document.querySelector("canvas")?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0)
      Object.assign(root.style, {
        inset: "auto",
        left: `${Math.max(0, rect.left)}px`,
        top: `${Math.max(0, rect.top)}px`,
        width: `${Math.min(rect.width, innerWidth)}px`,
        height: `${Math.min(rect.height, innerHeight)}px`,
      });
  };
  const keyboard = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    if (event.key === "Escape" || (event.key === "x" && !(document.activeElement instanceof HTMLInputElement))) {
      event.preventDefault();
      root.querySelector<HTMLButtonElement>("[data-fan-close]")?.click();
    }
    const controls = Array.from(root.querySelectorAll<HTMLElement>("button:not(:disabled), input, select"));
    if (event.key === "Tab") {
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (event.key === "z" && document.activeElement instanceof HTMLButtonElement) {
      event.preventDefault();
      document.activeElement.click();
    }
    if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      && document.activeElement instanceof HTMLButtonElement
    ) {
      event.preventDefault();
      const current = controls.indexOf(document.activeElement),
        delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" ? -6 : 6;
      controls[Math.max(0, Math.min(controls.length - 1, current + delta))]?.focus();
    }
  };
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    root.remove();
    window.removeEventListener("keydown", keyboard, true);
    window.removeEventListener("resize", resize);
    if (globalScene?.input && wasEnabled !== undefined) globalScene.input.enabled = wasEnabled;
    if (wasActive) globalScene.scene.resume();
    previous?.focus();
    if (closeActive === close) closeActive = undefined;
  };
  closeActive = close;
  window.addEventListener("keydown", keyboard, true);
  window.addEventListener("resize", resize);
  document.body.append(root);
  resize();
  return { panel, close };
}
function heading(panel: HTMLElement, title: string, subtitle: string, back: HTMLButtonElement): void {
  const row = el("div", undefined, "fan-head"),
    text = el("div");
  text.append(el("div", "NEW GAME · PARTY / BOXES", "fan-eyebrow"), el("h1", title), el("p", subtitle));
  back.dataset.fanClose = "true";
  row.append(text, back);
  panel.append(row);
}
function card(record: OwnedRecord, handler: () => void | Promise<void>, picked = false): HTMLButtonElement {
  const node = button("", handler, `fan-card ${picked ? "fan-picked" : ""} ${record.data.shiny ? "fan-shiny" : ""}`);
  node.dataset.pokemonId = record.id;
  node.append(
    sprite(record.data.species, record.data.shiny),
    el("strong", `${record.favorite ? "♥ " : ""}${name(record)}`),
    el("small", `Lv.${record.data.level} · IV ${quality(record)}%${record.data.shiny ? " ✦" : ""}`),
    el("small", `${record.location.toUpperCase()} ${record.box + 1} · ${record.id.slice(0, 6)}`),
  );
  return node;
}
export async function chooseOwnedTeam(): Promise<TeamSelection | null> {
  let save = await collectionTransaction();
  return new Promise(resolve => {
    let view = overlay(),
      location = "all",
      box = -1,
      query = "";
    const selected = new Set(
      save.records
        .filter(r => r.location === "party")
        .sort((a, b) => a.slot - b.slot)
        .slice(0, 6)
        .map(r => r.id),
    );
    if (!selected.size && save.records[0]) selected.add(save.records[0].id);
    const render = (): void => {
      const focusId = (document.activeElement as HTMLElement | null)?.dataset.pokemonId;
      view.panel.replaceChildren();
      heading(
        view.panel,
        save.starterChosen ? "Choose your party" : "Choose your first Pokémon",
        "Choose your team before starting. PC boxes cannot be accessed during a run.",
        button("Cancel [X]", () => {
          view.close();
          resolve(null);
        }),
      );
      if (!save.starterChosen && !save.records.length) {
        const grid = el("div", undefined, "fan-start-grid");
        for (const id of [1, 4, 7]) {
          const pick = button(speciesDataRegistry.getSpecies(id).getName(), () => {
            view.close();
            resolve({ starter: id });
          });
          pick.prepend(sprite(id));
          grid.append(pick);
        }
        view.panel.append(
          grid,
          el(
            "div",
            "Choose one starter. Every Pokémon you catch becomes an individual companion in your permanent collection.",
            "fan-note",
          ),
        );
      } else {
        const team = el("div", undefined, "fan-team"),
          chosen = [...selected].map(id => save.records.find(r => r.id === id)!).filter(Boolean);
        for (let slot = 0; slot < 6; slot++) {
          const record = chosen[slot];
          if (record) {
            const pick = button("", () => {
              selected.delete(record.id);
              render();
            });
            pick.append(
              sprite(record.data.species, record.data.shiny),
              el("strong", name(record)),
              el("small", `Lv.${record.data.level} · Remove`),
            );
            team.append(pick);
          } else team.append(button(`— Slot ${slot + 1} —`, () => {}, "fan-empty"));
        }
        view.panel.append(team);
        const controls = el("div", undefined, "fan-tools");
        controls.append(
          select(
            "Choose storage",
            [
              ["all", "All owned Pokémon"],
              ["party", "Previous party"],
              ["pc", "PC boxes"],
              ["home", "HOME boxes"],
            ],
            location,
            value => {
              location = value;
              render();
            },
          ),
          select(
            "Choose box",
            [["-1", "All boxes"], ...save.boxes.map(b => [`${b.id}`, b.name] as [string, string])],
            `${box}`,
            value => {
              box = +value;
              render();
            },
          ),
        );
        const search = el("input");
        search.placeholder = "Search Pokémon";
        search.setAttribute("aria-label", "Search owned team");
        search.value = query;
        search.onchange = () => {
          query = search.value;
          render();
        };
        controls.append(search);
        controls.append(
          button("Organize boxes", async () => {
            view.close();
            try {
              await showCollection();
              save = await collectionTransaction();
              for (const id of selected) if (!save.records.some(r => r.id === id)) selected.delete(id);
            } finally {
              view = overlay();
              render();
            }
          }),
        );
        view.panel.append(controls);
        const roster = el("div", undefined, "fan-roster"),
          grid = el("div", undefined, "fan-grid");
        for (const record of save.records.filter(
          r =>
            (location === "all" || r.location === location)
            && (box < 0 || r.box === box)
            && name(r).toLowerCase().includes(query.toLowerCase()),
        ))
          grid.append(
            card(
              record,
              () => {
                if (selected.has(record.id)) selected.delete(record.id);
                else if (selected.size < 6) selected.add(record.id);
                render();
              },
              selected.has(record.id),
            ),
          );
        if (!grid.childElementCount) roster.append(el("p", "This box is empty."));
        else roster.append(grid);
        view.panel.append(roster);
        const footer = el("div", undefined, "fan-footer"),
          begin = button(
            "Start adventure [Z]",
            () => {
              view.close();
              resolve({ records: [...selected].map(id => save.records.find(r => r.id === id)!) });
            },
            "fan-primary",
          );
        begin.disabled = selected.size === 0;
        footer.append(
          el("span", `Party: ${selected.size}/6 · Click a Pokémon to select/remove it. Full-party captures go to PC.`),
          begin,
        );
        view.panel.append(footer);
      }
      (
        Array.from(view.panel.querySelectorAll<HTMLButtonElement>("[data-pokemon-id]")).find(
          node => node.dataset.pokemonId === focusId,
        )
        ?? view.panel.querySelector<HTMLButtonElement>(".fan-start-grid button")
        ?? view.panel.querySelector<HTMLButtonElement>(".fan-card")
        ?? view.panel.querySelector<HTMLButtonElement>("[data-fan-close]")
      )?.focus();
    };
    render();
  });
}
/** Only reachable from New Game setup, never a mid-run floating overlay. */
export async function showCollection(): Promise<void> {
  if (!canManageBoxes()) return;
  let save = await collectionTransaction(),
    location: OwnedRecord["location"] = "pc",
    box = 0,
    moving: string | null = null,
    query = "",
    sort = "date";
  return new Promise(resolve => {
    const view = overlay();
    const close = (): void => {
      view.close();
      resolve();
    };
    async function change(fn: (data: CollectionSave) => void): Promise<void> {
      if (!canManageBoxes()) throw new Error("PC boxes are only available before a run.");
      save = await collectionTransaction(fn);
      render();
    }
    const render = (): void => {
      view.panel.replaceChildren();
      heading(
        view.panel,
        location === "home" ? "HOME boxes" : "Pokémon PC",
        `${save.records.length} individual Pokémon · Changes apply to your next adventure.`,
        button("Back to party [X]", close),
      );
      const tools = el("div", undefined, "fan-tools");
      tools.append(
        select(
          "Storage location",
          [
            ["party", "Party"],
            ["pc", "PC boxes"],
            ["home", "HOME boxes"],
          ],
          location,
          v => {
            location = v as OwnedRecord["location"];
            render();
          },
        ),
        select(
          "Storage box",
          save.boxes.map(b => [`${b.id}`, b.name]),
          `${box}`,
          v => {
            box = +v;
            render();
          },
        ),
        select(
          "Sort companions",
          [
            ["date", "Slot order"],
            ["level", "Highest level"],
            ["iv", "Best IVs"],
            ["shiny", "Shiny only"],
            ["favorite", "Favorites"],
          ],
          sort,
          v => {
            sort = v;
            render();
          },
        ),
      );
      const search = el("input");
      search.setAttribute("aria-label", "Search PC");
      search.placeholder = "Search Pokémon";
      search.value = query;
      search.onchange = () => {
        query = search.value;
        render();
      };
      tools.append(
        search,
        button("Rename box", async () => {
          const title = window.prompt("Box name", save.boxes[box].name)?.trim();
          if (title && title.length <= 24)
            await change(data => {
              data.boxes[box].name = title;
            });
        }),
      );
      view.panel.append(tools);
      if (moving)
        view.panel.append(
          el("div", "Choose a destination slot, or change storage/box. Occupied slots swap Pokémon.", "fan-note"),
        );
      const grid = el("div", undefined, "fan-grid"),
        filtered = !!query || sort !== "date";
      const records = save.records.filter(
        r =>
          (!query || name(r).toLowerCase().includes(query.toLowerCase()))
          && (sort !== "shiny" || r.data.shiny)
          && (sort !== "favorite" || r.favorite),
      );
      const draw = (record: OwnedRecord): HTMLButtonElement => {
        const node = card(
          record,
          async () => {
            if (moving && moving !== record.id) {
              await change(data => moveRecord(data, moving!, record.location, record.box, record.slot));
              moving = null;
              render();
            } else summary(record);
          },
          moving === record.id,
        );
        node.draggable = true;
        node.ondragstart = e => e.dataTransfer?.setData("text/plain", record.id);
        node.ondragover = e => e.preventDefault();
        node.ondrop = e => {
          e.preventDefault();
          const id = e.dataTransfer?.getData("text/plain");
          if (id) void change(data => moveRecord(data, id, record.location, record.box, record.slot));
        };
        return node;
      };
      if (filtered) {
        records.sort((a, b) =>
          sort === "level" ? b.data.level - a.data.level : sort === "iv" ? quality(b) - quality(a) : a.slot - b.slot,
        );
        records.forEach(r => grid.append(draw(r)));
      } else
        for (let slot = 0; slot < (location === "party" ? 6 : 30); slot++) {
          const record = records.find(
            r => r.location === location && r.box === (location === "party" ? 0 : box) && r.slot === slot,
          );
          if (record) grid.append(draw(record));
          else {
            const empty = button(
              `— ${slot + 1} —`,
              async () => {
                if (moving) {
                  await change(data => moveRecord(data, moving!, location, location === "party" ? 0 : box, slot));
                  moving = null;
                  render();
                }
              },
              "fan-empty",
            );
            empty.ondragover = e => e.preventDefault();
            empty.ondrop = e => {
              e.preventDefault();
              const id = e.dataTransfer?.getData("text/plain");
              if (id) void change(data => moveRecord(data, id, location, location === "party" ? 0 : box, slot));
            };
            grid.append(empty);
          }
        }
      view.panel.append(grid);
      const footer = el("div", undefined, "fan-footer");
      footer.append(
        el("span", `Stardust ${save.stardust} · Local save · Revision ${save.revision}`),
        button("Export backup", () => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(save, null, 2)], { type: "application/json" })),
            link = el("a");
          link.href = url;
          link.download = "pokerogue-individual-collection.json";
          link.click();
          URL.revokeObjectURL(url);
        }),
      );
      view.panel.append(footer);
    };
    const summary = (record: OwnedRecord): void => {
      view.panel.replaceChildren();
      heading(
        view.panel,
        name(record),
        `Level ${record.data.level}${record.data.shiny ? " · Shiny" : ""} · ${quality(record)}% IV`,
        button("Back [X]", render),
      );
      const layout = el("div", undefined, "fan-record"),
        portrait = el("div", undefined, "fan-portrait"),
        detail = el("div");
      portrait.append(
        sprite(record.data.species, record.data.shiny),
        el("h2", name(record)),
        el("div", record.id, "fan-id"),
      );
      const stats = el("div", undefined, "fan-stats");
      ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"].forEach((title, i) => {
        const cell = el("div");
        cell.append(
          el("small", title),
          el("strong", `${record.data.stats[i] ?? "—"}`),
          el("small", `IV ${record.data.ivs[i]}`),
        );
        stats.append(cell);
      });
      detail.append(stats);
      const row = (title: string, value: string): void => {
          const node = el("div", undefined, "fan-detail");
          node.append(el("span", title), document.createTextNode(value));
          detail.append(node);
        },
        native = new PokemonData(record.data);
      row("Original trainer / Caught", `${record.originalTrainer} · ${new Date(record.capturedAt).toLocaleString()}`);
      row("Moves", native.moveset.map(m => `${m.getName()} (${m.ppUsed} PP used)`).join(" · "));
      row("Family Candy", `${save.candy[record.family] ?? 0}`);
      row("Storage", `${record.location.toUpperCase()} · Box ${record.box + 1} · Slot ${record.slot + 1}`);
      const actions = el("div", undefined, "fan-tools");
      actions.append(
        button("Move / swap", () => {
          moving = record.id;
          render();
        }),
        button(record.favorite ? "Unfavorite" : "Favorite", async () => {
          await change(data => {
            data.records.find(r => r.id === record.id)!.favorite = !record.favorite;
          });
          summary(save.records.find(r => r.id === record.id)!);
        }),
        button(record.locked ? "Unlock" : "Lock", async () => {
          await change(data => {
            data.records.find(r => r.id === record.id)!.locked = !record.locked;
          });
          summary(save.records.find(r => r.id === record.id)!);
        }),
      );
      const release = button(
        "Transfer (+1 Candy)",
        async () => {
          if (!window.confirm(`Permanently transfer ${name(record)} (${record.id.slice(0, 8)})?`)) return;
          await change(data => {
            const current = data.records.find(r => r.id === record.id);
            if (!current || current.locked || current.favorite || data.records.length <= 1)
              throw new Error("Unlock/unfavorite first. Your last Pokémon cannot be transferred.");
            data.records = data.records.filter(r => r.id !== record.id);
            data.candy[record.family] = (data.candy[record.family] ?? 0) + 1;
          });
        },
        "fan-danger",
      );
      release.disabled = record.favorite || record.locked || save.records.length <= 1;
      actions.append(release);
      detail.append(actions);
      layout.append(portrait, detail);
      view.panel.append(layout);
    };
    render();
    view.panel.querySelector<HTMLButtonElement>("[data-fan-close]")?.focus();
  });
}
export function installCollectionLauncher(): void {
  // Collection management belongs to New Game setup, not the battle HUD.
  document.getElementById("fan-launcher")?.remove();
}
