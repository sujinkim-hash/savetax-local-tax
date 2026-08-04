import contactData from "@/app/contacts.json";
import missingContactData from "@/app/contacts-missing.json";

export type SeedContact = { sido: string; local: string; scope: string; phone: string; checked: string; status: "확인" | "검토중" };
export const seedContacts = [...(contactData as SeedContact[]), ...(missingContactData as SeedContact[])];
