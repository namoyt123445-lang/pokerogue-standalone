/** One high-definition backdrop for every native biome; IDs stay native. */
export const biomeScenery = [
  [0, "town", "Town"], [1, "plains", "Plains"], [2, "grass", "Grass"],
  [3, "tall_grass", "Tall Grass"], [4, "metropolis", "Metropolis"],
  [5, "forest", "Forest"], [6, "sea", "Sea"], [7, "swamp", "Swamp"],
  [8, "beach", "Beach"], [9, "lake", "Lake"], [10, "seabed", "Seabed"],
  [11, "mountain", "Mountain"], [12, "badlands", "Badlands"], [13, "cave", "Cave"],
  [14, "desert", "Desert"], [15, "ice_cave", "Ice Cave"], [16, "meadow", "Meadow"],
  [17, "power_plant", "Power Plant"], [18, "volcano", "Volcano"],
  [19, "graveyard", "Graveyard"], [20, "dojo", "Dojo"], [21, "factory", "Factory"],
  [22, "ruins", "Ruins"], [23, "wasteland", "Wasteland"], [24, "abyss", "Abyss"],
  [25, "space", "Space"], [26, "construction_site", "Construction Site"],
  [27, "jungle", "Jungle"], [28, "fairy_cave", "Fairy Cave"], [29, "temple", "Temple"],
  [30, "slum", "Slum"], [31, "snowy_forest", "Snowy Forest"], [40, "island", "Island"],
  [41, "laboratory", "Laboratory"], [50, "end", "The End"],
] as const;

/** Source pixels and gameplay coordinates must remain independent. */
export function arenaBackgroundLayout(width: number, height: number, enabled: boolean) {
  const hd = enabled && width >= 640 && height >= 360;
  return { scaleX: hd ? 1920 / width : 6, scaleY: hd ? 1080 / height : 6, width: 320, height: 240, hd };
}
