export const references = [
  {
    id: "portrait",
    title: "COURTSIDE ENERGY",
    image: require("../../assets/photos/portrait.jpg"),
    alt: "Tennis player seated on a red court beside a racket and tennis balls",
    credit: "Jadon Johnson / Unsplash",
    source: "https://unsplash.com/photos/ENeIBJ-3WaE",
    steps: [
      "Find a tennis court with open space.",
      "Rest your racket beside you.",
      "Ask a friend to frame you and the court.",
    ],
    tags: ["portrait", "court", "casual", "relaxed", "sitting"],
  },
  {
    id: "seated",
    title: "BETWEEN SETS",
    image: require("../../assets/photos/seated.jpg"),
    alt: "Close view of a seated player holding a racket on a blue tennis court",
    credit: "Ahmed / Unsplash",
    source: "https://unsplash.com/photos/Oip1nwclZ8A",
    steps: [
      "Sit comfortably on the court.",
      "Hold your racket loosely in front of you.",
      "Frame your hands and racket from above.",
    ],
    tags: ["sitting", "seated", "relaxed", "racket", "woman"],
  },
  {
    id: "equipment",
    title: "THE DETAILS",
    image: require("../../assets/photos/equipment.jpg"),
    alt: "Tennis racket and ball on a tennis court",
    credit: "Butterfly Doe / Unsplash",
    source: "https://unsplash.com/photos/pPJtHB1zoIE",
    steps: [
      "Place a racket and ball on the court.",
      "Look for clean lines and natural light.",
      "Shoot from above with space around the equipment.",
    ],
    tags: ["equipment", "racket", "ball", "detail", "above", "no people"],
  },
] as const;
// Local keyword ordering only. This is not an AI matching service.
export function rankReferences(prompt: string): number[] {
  const words = prompt.toLowerCase();
  return references
    .map((r, i) => ({
      i,
      score: r.tags.filter((t) => words.includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.i);
}
