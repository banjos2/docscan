export type CountryCode = "PL" | "GR" | "ES" | "HU" | "IT" | "BG"
// ru is the form's label; print is what the blank gets, in English on every blank.
export type City = { id: string; ru: string; print: string }

const BREST: City = { id: "brest", ru: "Брест", print: "BREST" }
const PINSK: City = { id: "pinsk", ru: "Пинск", print: "PINSK" }
const BARANOVICHI: City = { id: "baranovichi", ru: "Барановичи", print: "BARANOVICHI" }
const GRODNO: City = { id: "grodno", ru: "Гродно", print: "GRODNO" }
const LIDA: City = { id: "lida", ru: "Лида", print: "LIDA" }
const MINSK: City = { id: "minsk", ru: "Минск", print: "MINSK" }
const GOMEL: City = { id: "gomel", ru: "Гомель", print: "GOMEL" }
const MOGILEV: City = { id: "mogilev", ru: "Могилёв", print: "MOGILEV" }
const VITEBSK: City = { id: "vitebsk", ru: "Витебск", print: "VITEBSK" }
const MOSCOW: City = { id: "moscow", ru: "Москва", print: "MOSCOW" }

const BELARUS = [BREST, PINSK, BARANOVICHI, GRODNO, LIDA, MINSK, GOMEL, MOGILEV, VITEBSK]

// Where each country takes applications, in the order the form lists them. Countries sharing a list share the array:
// switching between them keeps the chosen city (applyQuestionnaire).
export const CITIES: Record<CountryCode, City[]> = {
  PL: BELARUS,
  HU: BELARUS,
  GR: [BREST, GRODNO, VITEBSK, MINSK],
  ES: [MINSK, MOSCOW],
  IT: [MINSK, BREST, GOMEL, GRODNO, VITEBSK],
  // Minsk only until the customer confirms the list.
  BG: [MINSK],
}
