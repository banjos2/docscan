import type { Blank, Tick } from "../questionnaire"

// A radio group's options in the order of its widgets' on-names "0", "1", "2"… The group's /Opt list repeats export
// values and has more entries than widgets, so an option is picked by its widget, not by value.
const radio = (group: string, choice: string, options: string[]): Record<string, Tick> =>
  Object.fromEntries(options.map((o, i) => [`${choice}.${o}`, { radio: group, on: String(i) }]))

const boxes = (prefix: string, numbers: Record<string, number>): Record<string, Tick> =>
  Object.fromEntries(Object.entries(numbers).map(([o, n]) => [`${prefix}.${o}`, `Check Box${n}`]))

// The customer's Polish national visa form (numbering D), field names as the form has them, matched by the labels next
// to the widgets. The fields left out are items DocScan doesn't ask for: the specialist fills them in the PDF if needed.
export const PL_D: Blank = {
  file: "blanks/pl-d.pdf",
  text: {
    Text1: "surname",
    Text2: "surnameAtBirth",
    Text3: "firstName",
    Text4: "birthDate",
    Text5: "placeOfBirth",
    Text6: "countryOfBirth",
    Text7: "nationality",
    Text8: "nationalityAtBirth",
    Text10: "nationalId",
    Text11: "docNumber",
    Text12: "issueDate",
    Text13: "expiryDate",
    Text14: "issuedBy",
    Text15: "phone",
    Text16: "address+email",
    Text20: "profession",
    Text21: "employer",
    Text23: "purposeOther",
    Text25: "basis",
    Text53: "firstEntry",
    Text54: "duration",
    "Text26.0": "prevVisa1From",
    "Text26.1": "prevVisa1To",
    "Text27.0": "prevVisa2From",
    "Text27.1": "prevVisa2To",
    "Text28.0": "prevVisa3From",
    "Text28.1": "prevVisa3To",
    "Text29.0": "prevVisa4From",
    "Text29.1": "prevVisa4To",
    "Text30.0": "prevVisa5From",
    "Text30.1": "prevVisa5To",
    Text32: "arrivalDate",
    Text34: "departureDate",
    Text33: "host",
    Text36: "hostAddress+hostEmail",
    Text35: "hostPhone",
    Text37: "org",
    Text38: "orgPhone",
    Text39: "orgContact+orgEmail",
    Text24: "sponsorWho",
    Text41: "workPermit",
    // Item 37 and the foot of the last page both ask for the place and date.
    Text47: "place+date",
    Text48: "place+date",
  },
  ticks: {
    ...radio("Group49", "sex", ["M", "F"]),
    ...radio("Group50", "maritalStatus", ["single", "married", "separated", "divorced", "widowed", "other"]),
    ...radio("Group51", "docType", ["ordinary", "diplomatic", "service", "official", "special", "other"]),
    ...radio("Group52", "residesElsewhere", ["no", "yes"]),
    ...radio("Group53", "purpose", ["tourism", "business", "family", "culture", "sport", "other", "study", "medical", "official"]),
    ...radio("Group54", "entries", ["one", "two", "multiple"]),
    ...radio("Group55", "prevVisas", ["no", "yes"]),
    ...radio("Group56", "fingerprints", ["no", "yes"]),
    ...boxes("payer", { self: 51, sponsor: 58 }),
    ...boxes("means.self", { cash: 52, cheques: 53, card: 54, accommodation: 55, transport: 56, other: 57 }),
    sponsorOther: "Check Box60",
    ...boxes("means.sponsor", { cash: 61, accommodation: 62, allCovered: 63, transport: 64, other: 65 }),
  },
}
