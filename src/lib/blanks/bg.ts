import type { Blank, Tick } from "../questionnaire"

// Checkboxes by their field names: tick key `${prefix}.${option}` → the box that shows it.
const boxes = (prefix: string, names: Record<string, string>): Record<string, Tick> =>
  Object.fromEntries(Object.entries(names).map(([o, name]) => [`${prefix}.${o}`, name]))

// The customer's Bulgarian Schengen form (numbering B), field names as the form has them, matched by the labels next
// to the widgets. The fields left out are items DocScan doesn't ask for: the specialist fills them in the PDF if needed.
// The sponsor's "other (please specify)" has no line of its own (Text45 and Text46 specify the means of support), so
// sponsorWho is not printed.
export const BG: Blank = {
  file: "blanks/bg.pdf",
  text: {
    Text1: "surname",
    Text2: "surnameAtBirth",
    Text3: "firstName",
    Text4: "birthDate",
    Text5: "placeOfBirth",
    Text6: "countryOfBirth",
    Text7: "nationality",
    Text8: "nationalityAtBirth",
    Text11: "nationalId",
    Text13: "docNumber",
    Text14: "issueDate",
    Text15: "expiryDate",
    Text16: "issuedBy",
    Text22: "address+email",
    Text23: "phone",
    Text26: "profession",
    Text27: "employer",
    Text28: "purposeOther",
    Text30: "destination",
    Text31: "firstEntry",
    Text32: "arrivalDate",
    Text33: "departureDate",
    Text39: "host",
    Text40: "hostAddress+hostEmail",
    Text41: "hostPhone",
    Text42: "org",
    Text43: "orgContact+orgEmail",
    Text44: "orgPhone",
    Text50: "place+date",
  },
  ticks: {
    // group_2's widgets are named by their on-names.
    "sex.M": { radio: "group_2", on: "Male" },
    "sex.F": { radio: "group_2", on: "Female" },
    "sex.X": { radio: "group_2", on: "Other" },
    ...boxes("maritalStatus", {
      single: "toggle_9", married: "toggle_10", partnership: "toggle_11", separated: "toggle_12",
      divorced: "toggle_13", widowed: "toggle_14", other: "toggle_15",
    }),
    ...boxes("docType", {
      ordinary: "Ordinary passport", diplomatic: "Diplomatic passport", service: "Service passport",
      official: "Official passport", special: "Special passport", other: "Other travel document please specify",
    }),
    ...boxes("residesElsewhere", { no: "toggle_1", yes: "toggle_2" }),
    ...boxes("purpose", {
      tourism: "tourism", business: "business", family: "visiting family or friends", culture: "culture", sport: "sport",
      official: "official visit", medical: "medical reason", study: "study", transit: "airport transit", other: "other please specify",
    }),
    ...boxes("entries", { one: "single entry entries", two: "two entries", multiple: "multiple" }),
    ...boxes("fingerprints", { no: "toggle_1_2", yes: "toggle_2_2" }),
    ...boxes("payer", { self: "by the applicant himselfherself", sponsor: "by a sponsor host company organisation please specify" }),
    ...boxes("means.self", {
      cash: "toggle_2_3", cheques: "toggle_3", card: "toggle_4", accommodation: "toggle_5", transport: "toggle_6", other: "toggle_7",
    }),
    sponsorOther: "toggle_10_2",
    ...boxes("means.sponsor", {
      cash: "toggle_11_2", accommodation: "toggle_12_2", allCovered: "toggle_13_2", transport: "toggle_14_2", other: "toggle_15_2",
    }),
  },
}
