import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";

import { addMoney, subtractMoney, toMoney } from "@finance/money";

// tsx doesn't load apps/api/.env on its own.
loadEnv({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const dec = (s: string) => new Prisma.Decimal(s);

/** Demo emails: seed deletes and recreates these rows only. */
const DEMO_EMAILS = ["demo@finance.local", "partner@finance.local", "test@finance.local"] as const;
// Note: only test@finance.local (index 2) is seeded — the others are kept for cleanup of legacy data.
/** Plain password for the demo accounts (email + password login). */
const DEMO_PASSWORD = "demo1234";

/**
 * Full-featured Chilean demo user (CLP primary). Has accounts + cards, a month
 * of categorized transactions (plus late-May ones so 30-day sparklines populate),
 * installment plans, debts both ways, savings goals, and investments.
 * Balances are derived from transactions so the dashboard stays internally consistent.
 */
async function seedFullUser(passwordHash: string) {
  // Resolved first so the profile fields below (countryId) can be set at creation time.
  const chile = await prisma.country.findUnique({ where: { alpha2: "CL" } });

  const javier = await prisma.user.create({
    data: {
      email: "test@finance.local",
      name: "Javier Torres",
      passwordHash,
      countryId: chile?.id ?? null,
      addressStreet: "Av. Providencia 1208, depto 504",
      addressCity: "Santiago",
      addressRegion: "Región Metropolitana",
      addressPostalCode: "7500000",
      birthDate: new Date("1990-04-22T00:00:00Z"),
      identifierType: "RUT",
      identifierValue: "12.345.678-5",
      phone: "+56 9 8765 4321",
    },
  });

  // Resolve Chilean banks (seeded in seedReferenceData) by SBIF code, to link accounts.
  const clBanks = chile
    ? await prisma.financialInstitution.findMany({
        where: { countryId: chile.id },
        select: { id: true, code: true },
      })
    : [];
  const bankId = (sbif: string) => clBanks.find((b) => b.code === sbif)?.id ?? null;
  // Non-bank issuers share the same table (`kind: NON_BANK_ISSUER`) and the same
  // per-country code space, so one lookup serves both.
  const issuerId = (code: string) => clBanks.find((b) => b.code === code)?.id ?? null;

  type AcctKey =
    | "checking"
    | "sight"
    | "credit"
    | "creditBch"
    | "creditVista"
    | "cash"
    | "prepaid"
    | "bciChecking"
    | "bciCredit";
  /** Accounts that ARE a credit line: their movements are charged to the pool and
   * move no cash (the statement payment is what leaves the paying account). */
  const CREDIT_CARD_ACCTS: AcctKey[] = ["credit", "creditBch", "creditVista", "bciCredit"];
  const initial: Record<AcctKey, number> = {
    checking: 2_800_000,
    prepaid: 120_000,
    sight: 350_000,
    credit: 0,
    creditBch: 0,
    creditVista: 0,
    cash: 85_000,
    bciChecking: 650_000,
    bciCredit: 0,
  };

  // Transactions keyed by account (ids resolved after accounts are created).
  // Extra cards ("Camila"/"Sofía"/"Rosa") model additional cards the bank issued
  // on the same account/credit line for another person to carry and use.
  type CardKey =
    | "prepaidRosa"
    | "prepaidVirtual"
    | "debit"
    | "debitCamila"
    | "debitSofia"
    | "debitRosa"
    // Add-on CREDIT card the bank issued on the checking account (its own pool).
    | "creditBch"
    // Cuenta Vista: one debit + one add-on credit card.
    | "debitVista"
    | "creditVista"
    | "credit"
    | "creditCamila"
    | "creditSofia"
    // BCI: its own checking account + its own credit line (a separate product,
    // not an add-on card — see the "credit line is its own account" amendment).
    | "debitBci"
    | "creditBci";
  type Tx = {
    acct: AcctKey;
    card?: CardKey;
    type: "INCOME" | "EXPENSE";
    amount: number;
    at: string;
    category: string;
    description: string;
    /** Both legs of a transfer share this — two ordinary rows, no new type. */
    transferGroup?: string;
    /** An issuer charge on the credit account itself: interest on the revolved
     * balance, an annual fee, insurance. No card makes these, which is exactly
     * why the movement carries no `card`. */
    financeCharge?: boolean;
  };
  const TX: Tx[] = [
    // ==================== April 2026 (complete month) ====================
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_100_000,
      at: "2026-04-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo abril",
    },
    {
      acct: "checking",
      type: "INCOME",
      amount: 210_000,
      at: "2026-04-22T10:00:00Z",
      category: "Otros",
      description: "Devolución impuestos · Operación Renta",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 61_200,
      at: "2026-04-03T19:30:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 34_800,
      at: "2026-04-05T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 20_600,
      at: "2026-04-05T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-04-06T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 42_500,
      at: "2026-04-07T08:15:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 31_200,
      at: "2026-04-04T21:00:00Z",
      category: "Restaurantes",
      description: "Cena Bellavista · Semana Santa",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 12_900,
      at: "2026-04-10T17:00:00Z",
      category: "Salud",
      description: "Farmacia Cruz Verde",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-04-10T07:00:00Z",
      category: "Entretenimiento",
      description: "Netflix",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 5_990,
      at: "2026-04-10T07:01:00Z",
      category: "Entretenimiento",
      description: "Spotify",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 80_000,
      at: "2026-04-11T16:00:00Z",
      category: "Transferencias",
      description: "Transferencia a Pedro",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 18_000,
      at: "2026-04-13T08:00:00Z",
      category: "Transporte",
      description: "Carga Bip!",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 49_800,
      at: "2026-04-15T19:00:00Z",
      category: "Supermercado",
      description: "Líder Express",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 6_500,
      at: "2026-04-16T11:00:00Z",
      category: "Restaurantes",
      description: "Café Starbucks",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 32_000,
      at: "2026-04-17T07:30:00Z",
      category: "Salud",
      description: "Gimnasio Smart Fit",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 21_500,
      at: "2026-04-08T11:00:00Z",
      category: "Salud",
      description: "Farmacia Ahumada · Camila",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 47_300,
      at: "2026-04-19T19:00:00Z",
      category: "Supermercado",
      description: "Jumbo Ñuñoa · Camila",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 34_900,
      at: "2026-04-09T15:00:00Z",
      category: "Educación",
      description: "Materiales U · Sofía",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 11_200,
      at: "2026-04-20T13:00:00Z",
      category: "Restaurantes",
      description: "Almuerzo campus · Sofía",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 23_000,
      at: "2026-04-14T09:00:00Z",
      category: "Hogar",
      description: "Insumos aseo · Rosa",
    },
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 7_200,
      at: "2026-04-12T13:00:00Z",
      category: "Transporte",
      description: "Uber",
    },
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 15_900,
      at: "2026-04-25T20:30:00Z",
      category: "Restaurantes",
      description: "PedidosYa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 95_000,
      at: "2026-04-06T18:00:00Z",
      category: "Compras",
      description: "Parka invierno · Falabella",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 42_000,
      at: "2026-04-18T21:00:00Z",
      category: "Restaurantes",
      description: "Restaurante Providencia",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 58_000,
      at: "2026-04-24T19:00:00Z",
      category: "Supermercado",
      description: "Tottus",
    },
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 39_900,
      at: "2026-04-21T17:00:00Z",
      category: "Compras",
      description: "Falabella Parque Arauco · Camila",
    },
    {
      acct: "credit",
      card: "creditSofia",
      type: "EXPENSE",
      amount: 19_900,
      at: "2026-04-13T20:00:00Z",
      category: "Entretenimiento",
      description: "Cine Falabella · Sofía",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 10_000,
      at: "2026-04-06T10:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 3_000,
      at: "2026-04-13T14:00:00Z",
      category: "Transporte",
      description: "Estacionamiento",
    },

    // --- Checking: salary + everyday spend (June 2026) ---
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_150_000,
      at: "2026-06-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo junio",
    },
    {
      acct: "checking",
      type: "INCOME",
      amount: 45_000,
      at: "2026-06-12T18:00:00Z",
      category: "Otros",
      description: "Reembolso colega",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 67_430,
      at: "2026-06-03T20:00:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 38_900,
      at: "2026-06-05T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 22_100,
      at: "2026-06-05T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-06-06T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 45_000,
      at: "2026-06-07T08:30:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 28_500,
      at: "2026-06-08T21:00:00Z",
      category: "Restaurantes",
      description: "Cena Ñuñoa",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 15_300,
      at: "2026-06-09T17:00:00Z",
      category: "Salud",
      description: "Farmacia Cruz Verde",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-06-10T07:00:00Z",
      category: "Entretenimiento",
      description: "Netflix",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 5_990,
      at: "2026-06-10T07:01:00Z",
      category: "Entretenimiento",
      description: "Spotify",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 120_000,
      at: "2026-06-11T16:00:00Z",
      category: "Transferencias",
      description: "Transferencia a María",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 20_000,
      at: "2026-06-13T08:00:00Z",
      category: "Transporte",
      description: "Carga Bip!",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 54_200,
      at: "2026-06-15T19:00:00Z",
      category: "Supermercado",
      description: "Líder Express",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 6_800,
      at: "2026-06-16T11:00:00Z",
      category: "Restaurantes",
      description: "Café Starbucks",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 32_000,
      at: "2026-06-17T07:30:00Z",
      category: "Salud",
      description: "Gimnasio Smart Fit",
    },
    // ==================== May 2026 (complete month) ====================
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_150_000,
      at: "2026-05-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo mayo",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 66_700,
      at: "2026-05-04T20:00:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 40_100,
      at: "2026-05-05T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 22_300,
      at: "2026-05-05T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-05-06T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 46_000,
      at: "2026-05-07T08:30:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 27_800,
      at: "2026-05-08T21:00:00Z",
      category: "Restaurantes",
      description: "Cena Ñuñoa",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 16_200,
      at: "2026-05-09T17:00:00Z",
      category: "Salud",
      description: "Farmacia Cruz Verde",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-05-10T07:00:00Z",
      category: "Entretenimiento",
      description: "Netflix",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 5_990,
      at: "2026-05-10T07:01:00Z",
      category: "Entretenimiento",
      description: "Spotify",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 45_000,
      at: "2026-05-10T15:00:00Z",
      category: "Compras",
      description: "Regalo Día de la Madre",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 100_000,
      at: "2026-05-11T16:00:00Z",
      category: "Transferencias",
      description: "Transferencia a María",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 20_000,
      at: "2026-05-13T08:00:00Z",
      category: "Transporte",
      description: "Carga Bip!",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 52_900,
      at: "2026-05-15T19:00:00Z",
      category: "Supermercado",
      description: "Líder Express",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 7_100,
      at: "2026-05-16T11:00:00Z",
      category: "Restaurantes",
      description: "Café Starbucks",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 32_000,
      at: "2026-05-17T07:30:00Z",
      category: "Salud",
      description: "Gimnasio Smart Fit",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 28_700,
      at: "2026-05-07T11:00:00Z",
      category: "Salud",
      description: "Farmacia Ahumada · Camila",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 51_200,
      at: "2026-05-18T19:00:00Z",
      category: "Supermercado",
      description: "Jumbo Ñuñoa · Camila",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 15_600,
      at: "2026-05-11T15:00:00Z",
      category: "Educación",
      description: "Fotocopias U · Sofía",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 11_900,
      at: "2026-05-19T13:00:00Z",
      category: "Restaurantes",
      description: "Almuerzo campus · Sofía",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 24_500,
      at: "2026-05-12T09:00:00Z",
      category: "Hogar",
      description: "Insumos aseo · Rosa",
    },
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 9_600,
      at: "2026-05-06T13:00:00Z",
      category: "Transporte",
      description: "Uber",
    },
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 16_700,
      at: "2026-05-14T20:30:00Z",
      category: "Restaurantes",
      description: "PedidosYa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 62_000,
      at: "2026-05-02T18:00:00Z",
      category: "Compras",
      description: "Zapatillas running",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 41_000,
      at: "2026-05-16T21:00:00Z",
      category: "Restaurantes",
      description: "Restaurante Las Condes",
    },
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 44_900,
      at: "2026-05-09T17:00:00Z",
      category: "Compras",
      description: "Falabella Parque Arauco · Camila",
    },
    {
      acct: "credit",
      card: "creditSofia",
      type: "EXPENSE",
      amount: 21_900,
      at: "2026-05-20T20:00:00Z",
      category: "Entretenimiento",
      description: "Cine Falabella · Sofía",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 11_000,
      at: "2026-05-06T10:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 3_500,
      at: "2026-05-13T14:00:00Z",
      category: "Transporte",
      description: "Estacionamiento",
    },

    // Late May (inside the 30-day window for sparklines)
    {
      acct: "checking",
      type: "INCOME",
      amount: 60_000,
      at: "2026-05-28T15:00:00Z",
      category: "Otros",
      description: "Venta usados",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 48_000,
      at: "2026-05-24T19:00:00Z",
      category: "Supermercado",
      description: "Unimarc",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 40_000,
      at: "2026-05-26T09:00:00Z",
      category: "Transporte",
      description: "Bencina · Shell",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 25_000,
      at: "2026-05-30T21:00:00Z",
      category: "Restaurantes",
      description: "Pizzería",
    },

    // --- Checking: spend from the 3 additional cards (Camila, Sofía, Rosa) ---
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 32_990,
      at: "2026-06-04T11:00:00Z",
      category: "Salud",
      description: "Farmacia Ahumada · Camila",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 55_400,
      at: "2026-06-11T19:30:00Z",
      category: "Supermercado",
      description: "Jumbo Ñuñoa · Camila",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 18_990,
      at: "2026-06-06T16:00:00Z",
      category: "Educación",
      description: "Fotocopias U · Sofía",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 12_500,
      at: "2026-06-14T13:20:00Z",
      category: "Restaurantes",
      description: "Almuerzo campus · Sofía",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 25_000,
      at: "2026-06-09T09:00:00Z",
      category: "Hogar",
      description: "Insumos aseo · Rosa",
    },

    // --- Vista (BancoEstado): small spends — no card linked to this account ---
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 8_900,
      at: "2026-06-14T13:00:00Z",
      category: "Transporte",
      description: "Uber",
    },
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 17_400,
      at: "2026-06-18T20:30:00Z",
      category: "Restaurantes",
      description: "PedidosYa",
    },

    // --- Credit (CMR Falabella): all purchases via creditCard ---
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 89_990,
      at: "2026-06-02T18:00:00Z",
      category: "Compras",
      description: "Ropa · Falabella",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 350_000,
      at: "2026-06-04T16:00:00Z",
      category: "Hogar",
      description: "Microondas · Sodimac",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 45_000,
      at: "2026-06-09T15:00:00Z",
      category: "Compras",
      description: "Zapatillas",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 38_000,
      at: "2026-06-12T21:00:00Z",
      category: "Restaurantes",
      description: "Restaurante Las Condes",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 72_000,
      at: "2026-06-16T19:00:00Z",
      category: "Supermercado",
      description: "Tottus",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 150_000,
      at: "2026-05-23T12:00:00Z",
      category: "Compras",
      description: "Compras varias",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 280_000,
      at: "2026-05-25T10:00:00Z",
      category: "Viajes",
      description: "Pasajes LATAM",
    },

    // --- Credit: spend from the 2 additional cards (Camila, Sofía) ---
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 68_990,
      at: "2026-06-07T17:00:00Z",
      category: "Compras",
      description: "Falabella Parque Arauco · Camila",
    },
    {
      acct: "credit",
      card: "creditSofia",
      type: "EXPENSE",
      amount: 24_990,
      at: "2026-06-13T20:00:00Z",
      category: "Entretenimiento",
      description: "Cine Falabella · Sofía",
    },

    // --- Cash ---
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 12_000,
      at: "2026-06-06T10:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 3_000,
      at: "2026-06-13T14:00:00Z",
      category: "Transporte",
      description: "Estacionamiento",
    },

    // ==================== July 2026 (month in progress, through the 18th) ====================
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_150_000,
      at: "2026-07-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo julio",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 69_300,
      at: "2026-07-03T19:45:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 41_500,
      at: "2026-07-05T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 21_900,
      at: "2026-07-05T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-07-06T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 44_700,
      at: "2026-07-07T08:20:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 29_400,
      at: "2026-07-08T21:00:00Z",
      category: "Restaurantes",
      description: "Cena Ñuñoa",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 13_800,
      at: "2026-07-09T17:00:00Z",
      category: "Salud",
      description: "Farmacia Cruz Verde",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-07-10T07:00:00Z",
      category: "Entretenimiento",
      description: "Netflix",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 5_990,
      at: "2026-07-10T07:01:00Z",
      category: "Entretenimiento",
      description: "Spotify",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 90_000,
      at: "2026-07-11T16:00:00Z",
      category: "Transferencias",
      description: "Transferencia a María",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 19_000,
      at: "2026-07-13T08:00:00Z",
      category: "Transporte",
      description: "Carga Bip!",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 53_600,
      at: "2026-07-15T19:00:00Z",
      category: "Supermercado",
      description: "Líder Express",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 6_900,
      at: "2026-07-16T11:00:00Z",
      category: "Restaurantes",
      description: "Café Starbucks",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 32_000,
      at: "2026-07-17T07:30:00Z",
      category: "Salud",
      description: "Gimnasio Smart Fit",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 19_900,
      at: "2026-07-08T11:00:00Z",
      category: "Salud",
      description: "Farmacia Ahumada · Camila",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 13_200,
      at: "2026-07-14T13:00:00Z",
      category: "Restaurantes",
      description: "Almuerzo campus · Sofía",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 25_900,
      at: "2026-07-09T09:00:00Z",
      category: "Hogar",
      description: "Insumos aseo · Rosa",
    },
    {
      acct: "sight",
      type: "EXPENSE",
      amount: 8_400,
      at: "2026-07-07T13:00:00Z",
      category: "Transporte",
      description: "Uber",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 78_000,
      at: "2026-07-06T18:00:00Z",
      category: "Compras",
      description: "Compras invierno · Falabella",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 35_000,
      at: "2026-07-12T21:00:00Z",
      category: "Restaurantes",
      description: "Restaurante Las Condes",
    },
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 29_900,
      at: "2026-07-15T17:00:00Z",
      category: "Compras",
      description: "Falabella Parque Arauco · Camila",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 9_000,
      at: "2026-07-04T10:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    // ===== Cargos del emisor sobre las cuentas de crédito (sin tarjeta) =====
    {
      acct: "credit",
      type: "EXPENSE",
      amount: 18_400,
      at: "2026-06-16T09:00:00Z",
      category: "Intereses",
      description: "Interés por saldo rotativo",
      financeCharge: true,
    },
    {
      acct: "credit",
      type: "EXPENSE",
      amount: 4_990,
      at: "2026-07-16T09:00:00Z",
      category: "Comisiones",
      description: "Comisión de administración",
      financeCharge: true,
    },
    {
      // El interés comprometido del plan del refrigerador: 6 x 65.000 = 390.000
      // sobre un precio de 360.000. Es lo que el handler crea solo cuando el plan
      // se registra desde la app, aquí escrito a mano porque el seed inserta el
      // plan directo en la base.
      acct: "creditBch",
      type: "EXPENSE",
      amount: 30_000,
      at: "2026-05-10T12:00:00Z",
      category: "Intereses",
      description: "Interés del plan · Refrigerador Mademsa",
      financeCharge: true,
    },
    // ===== Add-on credit card on the checking account (billing history) =====
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 129_990,
      at: "2026-04-11T16:20:00Z",
      category: "Compras",
      description: "Audífonos · Falabella",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 58_400,
      at: "2026-05-02T20:00:00Z",
      category: "Restaurantes",
      description: "Cena aniversario",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 213_500,
      at: "2026-05-19T11:00:00Z",
      category: "Salud",
      description: "Exámenes médicos · Clínica Alemana",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 76_800,
      at: "2026-06-08T19:30:00Z",
      category: "Compras",
      description: "Ropa · H&M",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 44_900,
      at: "2026-06-24T14:00:00Z",
      category: "Entretención",
      description: "Steam · videojuegos",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 91_200,
      at: "2026-07-02T18:00:00Z",
      category: "Transporte",
      description: "Mantención auto",
    },
    // ==================== Late July 2026 ====================
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 89_900,
      at: "2026-07-18T20:10:00Z",
      category: "Compras",
      description: "Zapatillas · Sparta",
    },
    {
      acct: "checking",
      card: "debitCamila",
      type: "EXPENSE",
      amount: 47_300,
      at: "2026-07-19T13:00:00Z",
      category: "Supermercado",
      description: "Líder Kennedy · Camila",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 34_500,
      at: "2026-07-20T21:30:00Z",
      category: "Restaurantes",
      description: "Cena · Ñuñoa",
    },
    {
      acct: "sight",
      card: "debitVista",
      type: "EXPENSE",
      amount: 12_900,
      at: "2026-07-22T09:00:00Z",
      category: "Transporte",
      description: "Carga Bip!",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 52_400,
      at: "2026-07-23T19:00:00Z",
      category: "Supermercado",
      description: "Tottus Falabella",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 620_000,
      at: "2026-07-25T09:00:00Z",
      category: "Vivienda",
      description: "Arriendo julio",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 41_990,
      at: "2026-07-27T18:40:00Z",
      category: "Salud",
      description: "Farmacia Ahumada",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 7_500,
      at: "2026-07-28T11:00:00Z",
      category: "Restaurantes",
      description: "Almuerzo",
    },
    {
      acct: "credit",
      card: "creditSofia",
      type: "EXPENSE",
      amount: 38_700,
      at: "2026-07-29T17:20:00Z",
      category: "Compras",
      description: "Falabella · Sofía",
    },
    // ==================== August 2026 ====================
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_100_000,
      at: "2026-08-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo agosto",
    },
    {
      acct: "sight",
      type: "INCOME",
      amount: 180_000,
      at: "2026-08-01T10:00:00Z",
      category: "Otros",
      description: "Transferencia desde cuenta corriente",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 58_400,
      at: "2026-08-01T19:15:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    // ============ August 2026 (continued) ============
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 33_900,
      at: "2026-08-03T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 19_800,
      at: "2026-08-03T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-08-04T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 74_500,
      at: "2026-08-05T20:00:00Z",
      category: "Compras",
      description: "Ropa de invierno · Paris",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 44_200,
      at: "2026-08-06T08:20:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 27_900,
      at: "2026-08-07T21:00:00Z",
      category: "Restaurantes",
      description: "Delivery · PedidosYa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 96_000,
      at: "2026-08-08T18:30:00Z",
      category: "Compras",
      description: "Electrodomésticos · Falabella",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 23_400,
      at: "2026-08-09T16:00:00Z",
      category: "Entretención",
      description: "Cine · Sofía",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 12_000,
      at: "2026-08-10T11:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 118_000,
      at: "2026-08-11T19:45:00Z",
      category: "Salud",
      description: "Consulta dental",
    },
    {
      acct: "sight",
      card: "debitVista",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-08-12T09:30:00Z",
      category: "Suscripciones",
      description: "Spotify Familiar",
    },
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 45_600,
      at: "2026-08-13T17:10:00Z",
      category: "Compras",
      description: "Falabella Plaza Egaña · Camila",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 66_700,
      at: "2026-08-14T19:00:00Z",
      category: "Supermercado",
      description: "Unimarc",
    },
    {
      acct: "checking",
      type: "INCOME",
      amount: 340_000,
      at: "2026-08-15T10:00:00Z",
      category: "Otros",
      description: "Proyecto freelance",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 63_200,
      at: "2026-08-16T15:00:00Z",
      category: "Compras",
      description: "Librería Antártica",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 18_600,
      at: "2026-08-17T13:40:00Z",
      category: "Transporte",
      description: "Uber · Rosa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 31_500,
      at: "2026-08-18T20:20:00Z",
      category: "Restaurantes",
      description: "Sushi Providencia",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 55_300,
      at: "2026-08-19T18:00:00Z",
      category: "Entretención",
      description: "Concierto · Puntoticket",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 6_500,
      at: "2026-08-20T12:00:00Z",
      category: "Restaurantes",
      description: "Café",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 620_000,
      at: "2026-08-21T09:00:00Z",
      category: "Vivienda",
      description: "Arriendo agosto",
    },

    // ==================== September 2026 ====================
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_100_000,
      at: "2026-09-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo septiembre",
    },
    {
      acct: "sight",
      type: "INCOME",
      amount: 180_000,
      at: "2026-09-01T10:00:00Z",
      category: "Otros",
      description: "Transferencia desde cuenta corriente",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 61_200,
      at: "2026-09-01T19:15:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 35_400,
      at: "2026-09-03T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 20_100,
      at: "2026-09-03T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-09-04T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 82_300,
      at: "2026-09-05T20:00:00Z",
      category: "Compras",
      description: "Ropa de primavera · Paris",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 42_800,
      at: "2026-09-06T08:20:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 31_200,
      at: "2026-09-07T21:00:00Z",
      category: "Restaurantes",
      description: "Delivery · PedidosYa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 102_000,
      at: "2026-09-08T18:30:00Z",
      category: "Compras",
      description: "Electrodomésticos · Falabella",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 25_600,
      at: "2026-09-09T16:00:00Z",
      category: "Entretención",
      description: "Cine · Sofía",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 13_500,
      at: "2026-09-10T11:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 95_000,
      at: "2026-09-11T19:45:00Z",
      category: "Salud",
      description: "Consulta dental",
    },
    {
      acct: "sight",
      card: "debitVista",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-09-12T09:30:00Z",
      category: "Suscripciones",
      description: "Spotify Familiar",
    },
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 51_400,
      at: "2026-09-13T17:10:00Z",
      category: "Compras",
      description: "Falabella Plaza Egaña · Camila",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 70_300,
      at: "2026-09-14T19:00:00Z",
      category: "Supermercado",
      description: "Unimarc",
    },
    {
      acct: "checking",
      type: "INCOME",
      amount: 210_000,
      at: "2026-09-15T10:00:00Z",
      category: "Otros",
      description: "Proyecto freelance",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 47_800,
      at: "2026-09-16T15:00:00Z",
      category: "Compras",
      description: "Librería Antártica",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 21_300,
      at: "2026-09-17T13:40:00Z",
      category: "Transporte",
      description: "Uber · Rosa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 34_900,
      at: "2026-09-18T20:20:00Z",
      category: "Restaurantes",
      description: "Sushi Providencia",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 62_700,
      at: "2026-09-19T18:00:00Z",
      category: "Entretención",
      description: "Concierto · Puntoticket",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 7_200,
      at: "2026-09-20T12:00:00Z",
      category: "Restaurantes",
      description: "Café",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 620_000,
      at: "2026-09-21T09:00:00Z",
      category: "Vivienda",
      description: "Arriendo septiembre",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 38_900,
      at: "2026-09-24T17:00:00Z",
      category: "Supermercado",
      description: "Santa Isabel",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 15_000,
      at: "2026-09-27T14:00:00Z",
      category: "Transporte",
      description: "Taxi",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 22_400,
      at: "2026-09-29T19:00:00Z",
      category: "Restaurantes",
      description: "Almuerzo equipo",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 45_000,
      at: "2026-09-30T20:00:00Z",
      category: "Entretención",
      description: "Streaming anual",
    },

    // ==================== October 2026 ====================
    {
      acct: "checking",
      type: "INCOME",
      amount: 2_100_000,
      at: "2026-10-01T09:00:00Z",
      category: "Sueldo",
      description: "Sueldo octubre",
    },
    {
      acct: "sight",
      type: "INCOME",
      amount: 180_000,
      at: "2026-10-01T10:00:00Z",
      category: "Otros",
      description: "Transferencia desde cuenta corriente",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 59_700,
      at: "2026-10-01T19:15:00Z",
      category: "Supermercado",
      description: "Jumbo Costanera",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 36_800,
      at: "2026-10-03T12:00:00Z",
      category: "Servicios",
      description: "Cuenta de luz · Enel",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 20_500,
      at: "2026-10-03T12:05:00Z",
      category: "Servicios",
      description: "Cuenta de agua · Aguas Andinas",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 29_990,
      at: "2026-10-04T10:00:00Z",
      category: "Servicios",
      description: "Internet · VTR",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 68_900,
      at: "2026-10-05T20:00:00Z",
      category: "Compras",
      description: "Zapatillas · Paris",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 43_600,
      at: "2026-10-06T08:20:00Z",
      category: "Transporte",
      description: "Bencina · Copec",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 29_300,
      at: "2026-10-07T21:00:00Z",
      category: "Restaurantes",
      description: "Delivery · PedidosYa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 88_500,
      at: "2026-10-08T18:30:00Z",
      category: "Compras",
      description: "Ropa de oficina · Falabella",
    },
    {
      acct: "checking",
      card: "debitSofia",
      type: "EXPENSE",
      amount: 24_100,
      at: "2026-10-09T16:00:00Z",
      category: "Entretención",
      description: "Cine · Sofía",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 12_800,
      at: "2026-10-10T11:30:00Z",
      category: "Supermercado",
      description: "Feria libre",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 74_000,
      at: "2026-10-11T19:45:00Z",
      category: "Salud",
      description: "Control médico",
    },
    {
      acct: "sight",
      card: "debitVista",
      type: "EXPENSE",
      amount: 9_990,
      at: "2026-10-12T09:30:00Z",
      category: "Suscripciones",
      description: "Spotify Familiar",
    },
    {
      acct: "credit",
      card: "creditCamila",
      type: "EXPENSE",
      amount: 48_600,
      at: "2026-10-13T17:10:00Z",
      category: "Compras",
      description: "Falabella Plaza Egaña · Camila",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 65_200,
      at: "2026-10-14T19:00:00Z",
      category: "Supermercado",
      description: "Unimarc",
    },
    {
      acct: "checking",
      type: "INCOME",
      amount: 275_000,
      at: "2026-10-15T10:00:00Z",
      category: "Otros",
      description: "Proyecto freelance",
    },
    {
      acct: "creditVista",
      card: "creditVista",
      type: "EXPENSE",
      amount: 55_300,
      at: "2026-10-16T15:00:00Z",
      category: "Compras",
      description: "Librería Antártica",
    },
    {
      acct: "checking",
      card: "debitRosa",
      type: "EXPENSE",
      amount: 19_900,
      at: "2026-10-17T13:40:00Z",
      category: "Transporte",
      description: "Uber · Rosa",
    },
    {
      acct: "credit",
      card: "credit",
      type: "EXPENSE",
      amount: 33_700,
      at: "2026-10-18T20:20:00Z",
      category: "Restaurantes",
      description: "Sushi Providencia",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 58_400,
      at: "2026-10-19T18:00:00Z",
      category: "Entretención",
      description: "Concierto · Puntoticket",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 6_900,
      at: "2026-10-20T12:00:00Z",
      category: "Restaurantes",
      description: "Café",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 620_000,
      at: "2026-10-21T09:00:00Z",
      category: "Vivienda",
      description: "Arriendo octubre",
    },
    {
      acct: "checking",
      card: "debit",
      type: "EXPENSE",
      amount: 41_300,
      at: "2026-10-24T17:00:00Z",
      category: "Supermercado",
      description: "Santa Isabel",
    },
    {
      acct: "creditBch",
      card: "creditBch",
      type: "EXPENSE",
      amount: 39_900,
      at: "2026-10-27T14:00:00Z",
      category: "Compras",
      description: "Regalo cumpleaños",
    },
    {
      acct: "cash",
      type: "EXPENSE",
      amount: 18_200,
      at: "2026-10-29T19:00:00Z",
      category: "Restaurantes",
      description: "Cena Halloween",
    },
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 27_500,
      at: "2026-10-31T20:00:00Z",
      category: "Entretención",
      description: "Streaming mensual",
    },

    // ==================== BCI: cuenta corriente + línea de crédito ====================
    // A second bank relationship: its own checking account (own flow, own debit
    // card) and its own credit-line account (spec's "credit line is its own
    // product" model) — paid FROM that same BCI checking, so the pair reads as
    // one real bank relationship instead of two unrelated accounts.
    {
      acct: "bciChecking",
      type: "INCOME",
      amount: 380_000,
      at: "2026-04-03T09:00:00Z",
      category: "Otros",
      description: "Honorarios freelance · abril",
    },
    {
      acct: "bciChecking",
      type: "EXPENSE",
      amount: 85_000,
      at: "2026-04-05T11:00:00Z",
      category: "Servicios",
      description: "Gastos comunes · depto",
    },
    {
      acct: "bciChecking",
      card: "debitBci",
      type: "EXPENSE",
      amount: 42_300,
      at: "2026-04-12T18:30:00Z",
      category: "Supermercado",
      description: "Líder Express",
    },
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 35_000,
      at: "2026-04-08T08:15:00Z",
      category: "Transporte",
      description: "Bencina Copec",
    },
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 68_000,
      at: "2026-04-25T21:00:00Z",
      category: "Restaurantes",
      description: "Cena aniversario",
    },
    {
      acct: "bciChecking",
      type: "INCOME",
      amount: 380_000,
      at: "2026-05-03T09:00:00Z",
      category: "Otros",
      description: "Honorarios freelance · mayo",
    },
    {
      acct: "bciChecking",
      type: "EXPENSE",
      amount: 85_000,
      at: "2026-05-05T11:00:00Z",
      category: "Servicios",
      description: "Gastos comunes · depto",
    },
    {
      acct: "bciChecking",
      card: "debitBci",
      type: "EXPENSE",
      amount: 18_900,
      at: "2026-05-16T20:00:00Z",
      category: "Restaurantes",
      description: "Pizzería Google",
    },
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 210_000,
      at: "2026-05-14T15:00:00Z",
      category: "Viajes",
      description: "Vuelos LATAM · Calama",
    },
    {
      acct: "bciChecking",
      type: "INCOME",
      amount: 380_000,
      at: "2026-06-03T09:00:00Z",
      category: "Otros",
      description: "Honorarios freelance · junio",
    },
    {
      acct: "bciChecking",
      type: "EXPENSE",
      amount: 87_000,
      at: "2026-06-05T11:00:00Z",
      category: "Servicios",
      description: "Gastos comunes · depto",
    },
    {
      acct: "bciChecking",
      card: "debitBci",
      type: "EXPENSE",
      amount: 39_500,
      at: "2026-06-14T19:00:00Z",
      category: "Supermercado",
      description: "Jumbo Ñuñoa",
    },
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 54_500,
      at: "2026-06-09T17:30:00Z",
      category: "Compras",
      description: "Falabella · ropa de invierno",
    },
    {
      acct: "bciChecking",
      type: "INCOME",
      amount: 380_000,
      at: "2026-07-03T09:00:00Z",
      category: "Otros",
      description: "Honorarios freelance · julio",
    },
    {
      acct: "bciChecking",
      type: "EXPENSE",
      amount: 87_000,
      at: "2026-07-05T11:00:00Z",
      category: "Servicios",
      description: "Gastos comunes · depto",
    },
    {
      acct: "bciChecking",
      card: "debitBci",
      type: "EXPENSE",
      amount: 15_200,
      at: "2026-07-20T10:00:00Z",
      category: "Salud",
      description: "Farmacia Cruz Verde",
    },
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 47_800,
      at: "2026-07-05T19:00:00Z",
      category: "Supermercado",
      description: "Santa Isabel",
    },
    // Already in the CURRENT (still open) period: the July 20 boundary already
    // closed, so these two build up what the next statement will bill.
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 18_500,
      at: "2026-07-25T14:00:00Z",
      category: "Educación",
      description: "Librería Antártica",
    },
    {
      acct: "bciCredit",
      card: "creditBci",
      type: "EXPENSE",
      amount: 22_000,
      at: "2026-07-30T06:30:00Z",
      category: "Transporte",
      description: "Uber al aeropuerto",
    },
    {
      acct: "bciChecking",
      type: "INCOME",
      amount: 380_000,
      at: "2026-08-03T09:00:00Z",
      category: "Otros",
      description: "Honorarios freelance · agosto",
    },
    {
      acct: "bciChecking",
      type: "EXPENSE",
      amount: 87_000,
      at: "2026-08-05T11:00:00Z",
      category: "Servicios",
      description: "Gastos comunes · depto",
    },
    // Consolidating idle funds into the main checking account — an ordinary
    // transfer, two rows sharing `transferGroupId`.
    {
      acct: "bciChecking",
      type: "EXPENSE",
      amount: 150_000,
      at: "2026-08-10T10:00:00Z",
      category: "Traspaso",
      description: "Traspaso a Cuenta Corriente",
      transferGroup: "tg_bci_consolidate",
    },
    {
      acct: "checking",
      type: "INCOME",
      amount: 150_000,
      at: "2026-08-10T10:00:00Z",
      category: "Traspaso",
      description: "Traspaso desde BCI",
      transferGroup: "tg_bci_consolidate",
    },

    // ==================== Prepaid account ====================
    // Topping it up is an ordinary TRANSFER: two rows sharing `transferGroupId`,
    // one leaving the checking account and one arriving here. There is no
    // "recargar la tarjeta" action — the money lives in the account.
    {
      acct: "checking",
      type: "EXPENSE",
      amount: 80_000,
      at: "2026-08-05T10:00:00Z",
      category: "Traspaso",
      description: "Carga Cuenta Prepago",
      transferGroup: "tg_prepaid_load",
    },
    {
      acct: "prepaid",
      type: "INCOME",
      amount: 80_000,
      at: "2026-08-05T10:00:00Z",
      category: "Traspaso",
      description: "Carga desde Banco de Chile",
      transferGroup: "tg_prepaid_load",
    },
    // Both cards draw on the SAME account balance.
    {
      acct: "prepaid",
      card: "prepaidRosa",
      type: "EXPENSE",
      amount: 24_900,
      at: "2026-08-07T13:30:00Z",
      category: "Restaurantes",
      description: "Almuerzo · Prepago",
    },
    {
      acct: "prepaid",
      card: "prepaidVirtual",
      type: "EXPENSE",
      amount: 12_900,
      at: "2026-08-11T21:15:00Z",
      category: "Suscripciones",
      description: "Suscripción online · tarjeta virtual",
    },
    {
      acct: "prepaid",
      type: "EXPENSE",
      amount: 3_700,
      at: "2026-08-14T08:20:00Z",
      category: "Transporte",
      description: "Recarga Bip! (sin tarjeta)",
    },
  ];

  // Net movement per account → reconciled currentBalance.
  const net: Record<AcctKey, number> = {
    checking: 0,
    sight: 0,
    credit: 0,
    creditBch: 0,
    creditVista: 0,
    cash: 0,
    prepaid: 0,
    bciChecking: 0,
    bciCredit: 0,
  };
  // A purchase on a credit line moves no cash: it raises the pool, and the money
  // leaves once, when the statement is paid (`paidFromOutflow` below).
  for (const t of TX) {
    if (CREDIT_CARD_ACCTS.includes(t.acct)) continue;
    net[t.acct] += t.type === "INCOME" ? t.amount : -t.amount;
  }

  const mkAccount = (key: AcctKey, data: Prisma.BankAccountUncheckedCreateInput) =>
    prisma.bankAccount.create({
      data: {
        ...data,
        initialBalance: dec(String(initial[key])),
        currentBalance: dec(String(initial[key] + net[key])),
      },
    });

  const checking = await mkAccount("checking", {
    userId: javier.id,
    name: "Cuenta Corriente",
    type: "CHECKING",
    currency: "CLP",
    institution: "Banco de Chile",
    institutionId: bankId("001"),
    accountNumber: "001-2345678-90",
    // The bank's "línea de crédito" on a current account is an OVERDRAFT: no card,
    // no statement of its own — it just lets the balance go this far below zero.
    // A floor on this account, never a separate product.
    overdraftLimit: dec("500000.0000"),
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  const sight = await mkAccount("sight", {
    userId: javier.id,
    name: "CuentaRUT",
    type: "SIGHT",
    currency: "CLP",
    institution: "BancoEstado",
    institutionId: bankId("012"),
    accountNumber: "22345678", // Cuenta RUT ≈ RUT sin dígito verificador
    // Una cuenta vista tiene tope de saldo por contrato; un abono que lo pase es
    // uno que el banco rechazaría, así que la app lo rechaza igual.
    balanceCeiling: dec("3000000.0000"),
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  // Standalone credit card = a CREDIT_CARD account (the pool lives here) + its plastic.
  // Account names are PRODUCT names ("Cuenta Corriente", "Visa Crédito"): every view
  // already prints the institution under the name, so repeating it there wastes the
  // one line that could say which of the user's products this is.
  const credit = await mkAccount("credit", {
    userId: javier.id,
    name: "Tarjeta CMR",
    type: "CREDIT_CARD",
    currency: "CLP",
    institution: "Falabella",
    institutionId: bankId("051"),
    creditLimit: dec("3000000.0000"),
    creditUsedInitial: dec("0"),
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  // A credit card the bank sells alongside a checking/sight account is still its
  // OWN product: its debt has a statement and a cycle of its own and never touches
  // that account's cash, so it is modelled as a credit-line account, not an add-on.
  const creditBch = await mkAccount("creditBch", {
    userId: javier.id,
    name: "Visa Crédito",
    type: "CREDIT_CARD",
    currency: "CLP",
    institution: "Banco de Chile",
    institutionId: bankId("001"),
    creditLimit: dec("1500000.0000"),
    creditUsedInitial: dec("0"),
  });
  const creditVista = await mkAccount("creditVista", {
    userId: javier.id,
    name: "Mastercard Crédito",
    type: "CREDIT_CARD",
    currency: "CLP",
    institution: "BancoEstado",
    institutionId: bankId("012"),
    creditLimit: dec("800000.0000"),
    creditUsedInitial: dec("0"),
  });
  // BCI: a second bank relationship, its own checking account...
  const bciChecking = await mkAccount("bciChecking", {
    userId: javier.id,
    name: "Cuenta Corriente BCI",
    type: "CHECKING",
    currency: "CLP",
    institution: "BCI",
    institutionId: bankId("016"),
    accountNumber: "016-9988776-01",
    overdraftLimit: dec("300000.0000"),
  });
  // ...and its own credit-line account — a real credit line (its own statement,
  // cycle and minimum payment), not an add-on card over the checking above.
  const bciCredit = await mkAccount("bciCredit", {
    userId: javier.id,
    name: "Línea de Crédito BCI",
    type: "CREDIT_CARD",
    currency: "CLP",
    institution: "BCI",
    institutionId: bankId("016"),
    creditLimit: dec("2000000.0000"),
    creditUsedInitial: dec("0"),
  });
  const cash = await mkAccount("cash", {
    userId: javier.id,
    name: "Efectivo",
    type: "CASH",
    currency: "CLP",
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  // Foreign-currency account (the USD chip on the dashboard).
  const tenpo = await prisma.bankAccount.create({
    data: {
      userId: javier.id,
      name: "Cuenta de Ahorro",
      type: "SAVINGS",
      currency: "USD",
      institution: "Tenpo",
      institutionId: bankId("063"),
      accountNumber: "TP-99887766",
      initialBalance: dec("4200.0000"),
      currentBalance: dec("4200.0000"),
    },
  });
  await prisma.bankAccount.create({
    data: {
      userId: javier.id,
      name: "Fintual Global",
      type: "INVESTMENT",
      currency: "USD",
      institution: "Fintual",
      // La AGF, no la emisora de prepago: dos entidades con la misma marca.
      institutionId: issuerId("AGF-fintual"),
      initialBalance: dec("6500.0000"),
      currentBalance: dec("6500.0000"),
    },
  });

  // A PREPAID ACCOUNT: its own product (a non-bank issuer holds the funds), not a
  // card hanging off the checking account. Its cards spend THIS balance, which can
  // never go negative; it is topped up by transferring from another account.
  const prepaid = await mkAccount("prepaid", {
    userId: javier.id,
    name: "Cuenta Prepago",
    type: "PREPAID",
    currency: "CLP",
    institution: "Tenpo",
    institutionId: issuerId("730"),
    accountNumber: "TP-4455667788",
    // Las cuentas de provisión de fondos también están topadas por contrato.
    balanceCeiling: dec("2000000.0000"),
  });

  const accId: Record<AcctKey, string> = {
    checking: checking.id,
    sight: sight.id,
    credit: credit.id,
    creditBch: creditBch.id,
    creditVista: creditVista.id,
    cash: cash.id,
    prepaid: prepaid.id,
    bciChecking: bciChecking.id,
    bciCredit: bciCredit.id,
  };

  // Cards (only last4 stored). The credit card belongs to the CREDIT_CARD account.
  // Checking and CMR each carry additional cards issued by the bank for another
  // person to hold — 4 cards on checking, 3 on the credit line.
  const debitCard = await prisma.cardAccount.create({
    data: {
      accountId: checking.id,
      userId: javier.id,
      name: "Visa Débito",
      kind: "DEBIT",
      last4: "1193",
      expiryMonth: 8,
      expiryYear: 2029,
    },
  });
  const debitCardCamila = await prisma.cardAccount.create({
    data: {
      accountId: checking.id,
      userId: javier.id,
      name: "Visa Débito · Camila",
      kind: "DEBIT",
      last4: "2284",
      expiryMonth: 8,
      expiryYear: 2029,
    },
  });
  const debitCardSofia = await prisma.cardAccount.create({
    data: {
      accountId: checking.id,
      userId: javier.id,
      name: "Visa Débito · Sofía",
      kind: "DEBIT",
      last4: "3375",
      expiryMonth: 11,
      expiryYear: 2028,
    },
  });
  const debitCardRosa = await prisma.cardAccount.create({
    data: {
      accountId: checking.id,
      userId: javier.id,
      name: "Visa Débito · Rosa",
      kind: "DEBIT",
      last4: "4466",
      expiryMonth: 3,
      expiryYear: 2027,
    },
  });

  // Two cards on the same prepaid account: both spend the SAME account balance.
  const prepaidCardRosa = await prisma.cardAccount.create({
    data: {
      accountId: prepaid.id,
      userId: javier.id,
      name: "Prepago · Rosa",
      kind: "PREPAID",
      last4: "1902",
      expiryMonth: 3,
      expiryYear: 2027,
    },
  });
  const prepaidCardVirtual = await prisma.cardAccount.create({
    data: {
      accountId: prepaid.id,
      userId: javier.id,
      name: "Prepago · Virtual",
      kind: "PREPAID",
      last4: "2043",
      expiryMonth: 9,
      expiryYear: 2029,
      // No plastic: the second card on the same prepaid balance.
      isVirtual: true,
      network: "MASTERCARD",
    },
  });
  // The card of the Banco de Chile credit line: its FIRST credit card, so primary,
  // and its limit IS that account's creditLimit (no CardLimit row).
  const creditCardBch = await prisma.cardAccount.create({
    data: {
      accountId: creditBch.id,
      userId: javier.id,
      name: "Visa Crédito",
      kind: "CREDIT",
      last4: "5521",
      expiryMonth: 8,
      expiryYear: 2029,
      isPrimary: true,
      network: "VISA",
    },
  });
  // Cuenta Vista: debit only — its credit card lives on its own credit line.
  const debitCardVista = await prisma.cardAccount.create({
    data: {
      accountId: sight.id,
      userId: javier.id,
      name: "Mastercard Débito",
      kind: "DEBIT",
      last4: "7712",
      expiryMonth: 6,
      expiryYear: 2030,
      network: "MASTERCARD",
    },
  });
  const creditCardVista = await prisma.cardAccount.create({
    data: {
      accountId: creditVista.id,
      userId: javier.id,
      name: "Mastercard Crédito",
      kind: "CREDIT",
      last4: "8890",
      expiryMonth: 6,
      expiryYear: 2030,
      isPrimary: true,
      network: "MASTERCARD",
    },
  });
  const debitCardBci = await prisma.cardAccount.create({
    data: {
      accountId: bciChecking.id,
      userId: javier.id,
      name: "Débito BCI",
      kind: "DEBIT",
      last4: "7734",
      expiryMonth: 2,
      expiryYear: 2030,
      network: "VISA",
    },
  });
  // The BCI credit line's FIRST (and only) credit card: primary, so its limit IS
  // the account's own creditLimit above (no separate CardLimit row).
  const creditCardBci = await prisma.cardAccount.create({
    data: {
      accountId: bciCredit.id,
      userId: javier.id,
      name: "Visa Crédito BCI",
      kind: "CREDIT",
      last4: "9012",
      expiryMonth: 10,
      expiryYear: 2029,
      isPrimary: true,
      network: "VISA",
    },
  });
  const creditCard = await prisma.cardAccount.create({
    data: {
      accountId: credit.id,
      userId: javier.id,
      name: "CMR Visa",
      kind: "CREDIT",
      last4: "4827",
      expiryMonth: 5,
      expiryYear: 2028,
      network: "VISA",
      // The account's first CREDIT card: its limit mirrors credit.creditLimit above.
      isPrimary: true,
    },
  });
  const creditCardCamila = await prisma.cardAccount.create({
    data: {
      accountId: credit.id,
      userId: javier.id,
      name: "CMR Visa · Camila",
      kind: "CREDIT",
      last4: "5938",
      expiryMonth: 5,
      expiryYear: 2028,
      // An additional card: the bank issued it on the same line for another
      // person, so every charge is the holder's but the app can say who spent.
      isAdditional: true,
      cardholderName: "Camila Rojas",
      network: "VISA",
    },
  });
  const creditCardSofia = await prisma.cardAccount.create({
    data: {
      accountId: credit.id,
      userId: javier.id,
      name: "CMR Visa · Sofía",
      kind: "CREDIT",
      last4: "6049",
      expiryMonth: 5,
      expiryYear: 2028,
      isAdditional: true,
      cardholderName: "Sofía Rojas",
      network: "VISA",
    },
  });

  // Curated wallet: two cards + one account (USD), to show both pin types.
  await prisma.walletItemDashboard.createMany({
    data: [
      { userId: javier.id, cardId: creditCard.id, order: 0 },
      { userId: javier.id, cardId: debitCard.id, order: 1 },
      { userId: javier.id, accountId: tenpo.id, order: 2 },
      // Pinned so the wallet shows a prepaid tile too, beside a credit card, a
      // debit card and a plain account.
      { userId: javier.id, cardId: prepaidCardRosa.id, order: 3 },
    ],
  });

  const cardIdMap: Record<CardKey, string> = {
    debit: debitCard.id,
    debitCamila: debitCardCamila.id,
    debitSofia: debitCardSofia.id,
    debitRosa: debitCardRosa.id,
    creditBch: creditCardBch.id,
    debitVista: debitCardVista.id,
    creditVista: creditCardVista.id,
    credit: creditCard.id,
    creditCamila: creditCardCamila.id,
    creditSofia: creditCardSofia.id,
    prepaidRosa: prepaidCardRosa.id,
    prepaidVirtual: prepaidCardVirtual.id,
    debitBci: debitCardBci.id,
    creditBci: creditCardBci.id,
  };

  await prisma.transaction.createMany({
    data: TX.map((t) => ({
      userId: javier.id,
      bankAccountId: accId[t.acct],
      cardId: t.card ? cardIdMap[t.card] : undefined,
      financeCharge: t.financeCharge ?? false,
      transferGroupId: t.transferGroup,
      type: t.type,
      amount: dec(String(t.amount)),
      currency: "CLP",
      occurredAt: new Date(t.at),
      category: t.category,
      description: t.description,
    })),
  });

  // ==========================================================================
  // Billing settings + credit-statement history (facturación)
  // ==========================================================================
  // "Now" for the seed. Movements exist up to 2026-08-21 (20 days ahead) so the
  // upcoming-payments / future flows can be exercised without re-seeding.
  const SEED_NOW = new Date("2026-08-01T12:00:00Z");
  /** Where periods start accumulating for the very first statement. */
  const SEED_EPOCH = new Date("2026-03-01T00:00:00Z");

  /** Every occurrence of `day` (1-28) in [from, to]. */
  const cutsBetween = (day: number, from: Date, to: Date) => {
    const out: Date[] = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), day, 23, 59, 0));
    while (d <= to) {
      if (d >= from) out.push(new Date(d));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    return out;
  };

  type CreditSpec = {
    accountId: string;
    /** null = intentionally not configured (shows the "configura la facturación" warning). */
    billingCycleDay: number | null;
    /** Días hábiles (default) or a fixed day-of-month — see billing-cycle.ts. */
    cycleType: "BUSINESS_DAY" | "CALENDAR_DAY";
    /** Business days or day-of-month (per `paymentDueCycleType`) payment is due;
     * null on the accounts left demonstrating the pre-existing (unconfigured)
     * state. */
    paymentDueDay: number | null;
    /** Independent of `cycleType` (generation) — an issuer can generate on a
     * fixed day-of-month but still owe payment N días hábiles later, or vice
     * versa; see billing-cycle.ts. */
    paymentDueCycleType: "BUSINESS_DAY" | "CALENDAR_DAY";
    /** CREDIT_CARD: every movement on the account feeds the pool (income = payments). */
    wholeAccount: boolean;
    /** Cards drawing on the shared pool (used when `wholeAccount` is false). */
    poolCardIds: string[];
    /** Account the closed statements are paid from. */
    payFromAccountId: string;
  };

  // Named so the `foldPlanScheduleIntoRealChain` calls further below (which
  // recompute the SAME period boundaries via `cutsBetween`) can never drift
  // from what this loop actually used — a mismatched day here silently forks a
  // plan's schedule onto a second, parallel chain of periods instead of folding
  // into the account's real one (see that function's own comment; this exact
  // drift, between this loop's day and the fold call's hardcoded one, is what
  // broke "Tarjeta CMR" when its cadence moved from calendar-day 15 to
  // business-day 20 — found while seeding BCI, 2026-08-24).
  const CREDIT_CYCLE_DAY = 20; // Tarjeta CMR (Falabella)
  const CREDIT_BCH_CYCLE_DAY = 5; // Visa Crédito (Banco de Chile)
  const CREDIT_BCI_CYCLE_DAY = 20; // Línea de Crédito BCI

  const creditSpecs: CreditSpec[] = [
    {
      accountId: credit.id,
      // BUSINESS_DAY is the default for new accounts — mirrors a real issuer's
      // cadence (e.g. BCI: 20 días hábiles para generar, 10 para pagar).
      billingCycleDay: CREDIT_CYCLE_DAY,
      cycleType: "BUSINESS_DAY",
      paymentDueDay: 3,
      paymentDueCycleType: "BUSINESS_DAY",
      wholeAccount: true,
      poolCardIds: [creditCard.id, creditCardCamila.id, creditCardSofia.id],
      payFromAccountId: checking.id,
    },
    {
      // CALENDAR_DAY generation (the original fixed day-of-month behavior),
      // paired with a BUSINESS_DAY payment due date — demonstrates the two
      // being configured independently of one another.
      accountId: creditBch.id,
      billingCycleDay: CREDIT_BCH_CYCLE_DAY,
      cycleType: "CALENDAR_DAY",
      paymentDueDay: 5,
      paymentDueCycleType: "BUSINESS_DAY",
      wholeAccount: true,
      poolCardIds: [creditCardBch.id],
      payFromAccountId: checking.id,
    },
    {
      // Deliberately unconfigured: no billing day → nothing is ever generated,
      // the account only carries a permanently OPEN period.
      accountId: creditVista.id,
      billingCycleDay: null,
      cycleType: "BUSINESS_DAY",
      paymentDueDay: null,
      paymentDueCycleType: "BUSINESS_DAY",
      wholeAccount: true,
      poolCardIds: [creditCardVista.id],
      payFromAccountId: sight.id,
    },
    {
      // BCI's real-world cadence: 20 días hábiles to generate, 10 to pay — paid
      // from the BCI checking account itself, same bank relationship.
      accountId: bciCredit.id,
      billingCycleDay: CREDIT_BCI_CYCLE_DAY,
      cycleType: "BUSINESS_DAY",
      paymentDueDay: 10,
      paymentDueCycleType: "BUSINESS_DAY",
      wholeAccount: true,
      poolCardIds: [creditCardBci.id],
      payFromAccountId: bciChecking.id,
    },
  ];

  /** Extra outflow the statement payments cause on the paying account. */
  const paidFromOutflow: Record<string, number> = {};

  for (const spec of creditSpecs) {
    await prisma.billingSettings.create({
      data: {
        accountId: spec.accountId,
        billingCycleDay: spec.billingCycleDay,
        cycleType: spec.cycleType,
        paymentMethod: "MANUAL",
        paymentDueDay: spec.paymentDueDay,
        paymentDueCycleType: spec.paymentDueCycleType,
      },
    });

    // Movements feeding this pool, oldest first. A plan's PURCHASE movement
    // (`installmentPlanId` set) is excluded — spec 014, FR-007: it consumes the
    // pool but is never what a period bills; only its SCHEDULE does, stamped in
    // separately below. Mirrors production's `EXCLUDE_PLAN_PURCHASES`.
    const contributions = await prisma.transaction.findMany({
      where: spec.wholeAccount
        ? { bankAccountId: spec.accountId, installmentPlanId: null }
        : {
            bankAccountId: spec.accountId,
            type: "EXPENSE",
            cardId: { in: spec.poolCardIds },
            installmentPlanId: null,
          },
      select: { id: true, type: true, amount: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
    });
    const signed = (t: (typeof contributions)[number]) =>
      (t.type === "EXPENSE" ? 1 : -1) * Number(t.amount);

    // Period boundaries: every cut-off that already happened, plus the still-open tail.
    const cuts = spec.billingCycleDay
      ? cutsBetween(spec.billingCycleDay, SEED_EPOCH, SEED_NOW)
      : [];
    const bounds = [SEED_EPOCH, ...cuts];

    let unpaidTotal = 0;
    for (let i = 0; i < bounds.length; i++) {
      const periodStart = bounds[i]!;
      const closedAt = cuts[i] ?? null; // null → the current OPEN period
      const periodEnd = closedAt ?? new Date("2100-01-01T00:00:00Z");
      const inPeriod = contributions.filter(
        (t) => t.occurredAt >= periodStart && t.occurredAt < periodEnd,
      );
      if (inPeriod.length === 0) continue;
      const total = inPeriod.reduce((s, t) => s + signed(t), 0);

      // The most recent closed period stays PENDING (awaiting payment); older ones are PAID.
      const isLastClosed = closedAt !== null && i === cuts.length - 1;
      const paid = closedAt !== null && !isLastClosed && total > 0;

      let paidTransactionId: string | null = null;
      let paidAt: Date | null = null;
      if (paid) {
        paidAt = new Date(closedAt.getTime() + 5 * 86_400_000);
        const payTx = await prisma.transaction.create({
          data: {
            userId: javier.id,
            bankAccountId: spec.payFromAccountId,
            type: "EXPENSE",
            amount: dec(total.toFixed(4)),
            currency: "CLP",
            occurredAt: paidAt,
            category: "Tarjeta de crédito",
            description: `Pago facturación · ${closedAt.toISOString().slice(0, 10)}`,
          },
        });
        paidTransactionId = payTx.id;
        paidFromOutflow[spec.payFromAccountId] =
          (paidFromOutflow[spec.payFromAccountId] ?? 0) + total;
      } else {
        unpaidTotal += total;
      }

      const statement = await prisma.creditStatement.create({
        data: {
          accountId: spec.accountId,
          periodStart,
          closedAt,
          paidAt,
          amount: paid ? dec(total.toFixed(4)) : null,
          // Seeded payments settle the period IN FULL: without this the column
          // defaults to 0 and the period derives PARTIALLY_PAID ("pagado 0 de X"),
          // which is a state no seeded history should be in.
          paidAmount: paid ? dec(total.toFixed(4)) : dec("0"),
          paidFromAccountId: paid ? spec.payFromAccountId : null,
          paidTransactionId,
        },
      });
      await prisma.transaction.updateMany({
        where: { id: { in: inPeriod.map((t) => t.id) } },
        data: { creditStatementId: statement.id },
      });
    }

    // Persisted pool usage = everything not yet settled by a payment.
    await prisma.bankAccount.update({
      where: { id: spec.accountId },
      data: { creditUsed: dec(Math.max(0, unpaidTotal).toFixed(4)) },
    });
  }

  // The statement payments are real expenses on the paying account — reconcile it.
  for (const [accountId, outflow] of Object.entries(paidFromOutflow)) {
    const acc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    await prisma.bankAccount.update({
      where: { id: accountId },
      data: { currentBalance: acc.currentBalance.minus(dec(outflow.toFixed(4))) },
    });
  }

  // --- Credit-card instalment plans (spec 014) -----------------------------------
  // A plan bought with a CREDIT card behaves like the real thing: the purchase
  // consumes the pool IN FULL on day one (a movement of its own, excluded from any
  // period's total — FR-007), and each period bills only the instalment(s) that
  // fell due in it (FR-008). Settling a period settles every instalment it billed,
  // whether the payment was full or short (FR-014) — the shortfall becomes the
  // NEXT period's `carriedOverAmount`, never a debt left sitting on the instalment.
  //
  // Its schedule bills into the ACCOUNT'S OWN real chain built by the `creditSpecs`
  // loop above — never a second, differently-cadenced chain of the plan's own. A
  // real account only ever has one continuous chain (one `billingCycleDay`); a
  // seed that invented a parallel one used to look merely cosmetic, until paying
  // or "Sincronizar pagos"-ing either period revealed the real defect: both
  // recompute by DATE WINDOW across the whole account, so settling one silently
  // stole the other's transactions and corrupted both (found 2026-08-23).

  /**
   * Folds a plan's schedule into the account's real statement chain instead of a
   * parallel one. Mirrors `closeIfDue` + `settleForStatementWithTx`: a real period
   * already closed bills whatever instalments fell due in it; if the generic loop
   * above already settled that period (from ordinary spend alone), every
   * instalment it now also bills is marked PAID too (FR-014a — any settlement,
   * full or short, settles every instalment; the shortfall is a PERIOD fact,
   * `carriedOverAmount` on the next one, never left on the row). A period nothing
   * else ever happened in is created fresh and paid in full — same convention the
   * generic loop uses for every closed period except its last — exactly like
   * `seedPeriodFromSchedule` would for an account whose only activity, so far, is
   * this plan.
   *
   * Returns what's still reserved in the pool for this plan (billed-unpaid +
   * not-yet-billed) — ADDED to, never overwriting, whatever the generic loop
   * already computed for the account's ordinary spend.
   */
  async function foldPlanScheduleIntoRealChain(input: {
    accountId: string;
    planId: string;
    billingCycleDay: number;
    payFromAccountId: string;
    schedule: { sequence: number; dueDate: Date; amount: string }[];
  }): Promise<string> {
    const cuts = cutsBetween(input.billingCycleDay, SEED_EPOCH, SEED_NOW);
    const bounds = [SEED_EPOCH, ...cuts];
    const existing = await prisma.creditStatement.findMany({
      where: { accountId: input.accountId },
    });
    const findExisting = (periodStart: Date) =>
      existing.find((s) => s.periodStart.getTime() === periodStart.getTime()) ?? null;

    let carryIn = "0.0000";
    let pendingCarrierId: string | null = null; // a settled period awaiting its successor's id
    let cursor = 0;
    let stillReserved = "0.0000";

    const linkCarrierTo = async (successorId: string) => {
      if (!pendingCarrierId) return;
      await prisma.creditStatement.update({
        where: { id: pendingCarrierId },
        data: { carriedToId: successorId },
      });
      pendingCarrierId = null;
    };

    for (let i = 0; i < cuts.length; i++) {
      const periodStart = bounds[i]!;
      const closedAt = cuts[i]!;
      const inWindow = input.schedule.slice(cursor).filter((p) => p.dueDate <= closedAt);
      cursor += inWindow.length;
      const cuotaSum = inWindow.reduce((s, p) => addMoney(s, p.amount), "0.0000");
      const statement = findExisting(periodStart);
      const isLastClosed = i === cuts.length - 1;

      if (!statement) {
        if (cuotaSum === "0.0000" && carryIn === "0.0000") continue; // nothing to say here
        const total = addMoney(cuotaSum, carryIn);
        const paidAt = isLastClosed ? null : new Date(closedAt.getTime() + 4 * 86_400_000);
        let paidTransactionId: string | null = null;
        if (paidAt) {
          const payTx = await prisma.transaction.create({
            data: {
              userId: javier.id,
              bankAccountId: input.payFromAccountId,
              type: "EXPENSE",
              amount: dec(total),
              currency: "CLP",
              occurredAt: paidAt,
              category: "Tarjeta de crédito",
              description: "Pago facturación",
            },
          });
          paidTransactionId = payTx.id;
          const payer = await prisma.bankAccount.findUniqueOrThrow({
            where: { id: input.payFromAccountId },
          });
          await prisma.bankAccount.update({
            where: { id: input.payFromAccountId },
            data: { currentBalance: payer.currentBalance.minus(dec(total)) },
          });
        } else {
          stillReserved = addMoney(stillReserved, total);
        }
        const created = await prisma.creditStatement.create({
          data: {
            accountId: input.accountId,
            periodStart,
            closedAt,
            paidAt,
            amount: paidAt ? dec(total) : null,
            paidAmount: dec(paidAt ? total : "0"),
            paidFromAccountId: paidAt ? input.payFromAccountId : null,
            paidTransactionId,
          },
        });
        existing.push(created);
        if (inWindow.length > 0) {
          await prisma.installmentPayment.updateMany({
            where: {
              installmentPlanId: input.planId,
              sequence: { in: inWindow.map((p) => p.sequence) },
            },
            data: {
              creditStatementId: created.id,
              ...(paidAt ? { paidAt, transactionId: paidTransactionId } : {}),
            },
          });
          if (paidAt) {
            for (const p of inWindow) {
              await prisma.installmentPayment.update({
                where: {
                  installmentPlanId_sequence: {
                    installmentPlanId: input.planId,
                    sequence: p.sequence,
                  },
                },
                data: { paidAmount: dec(p.amount) },
              });
            }
          }
        }
        await linkCarrierTo(created.id);
        carryIn = "0.0000";
        continue;
      }

      await linkCarrierTo(statement.id);

      if (statement.paidAt) {
        // Already settled by the generic loop, from ordinary spend alone — folding
        // more debt in here doesn't rewrite that fact, it just means it wasn't
        // enough for the bigger total this plan adds.
        const newAmount = addMoney(addMoney(statement.amount!.toString(), carryIn), cuotaSum);
        const shortfall = subtractMoney(newAmount, statement.paidAmount.toString());
        await prisma.creditStatement.update({
          where: { id: statement.id },
          data: {
            amount: dec(newAmount),
            carriedOverAmount: dec(addMoney(statement.carriedOverAmount.toString(), carryIn)),
          },
        });
        if (inWindow.length > 0) {
          await prisma.installmentPayment.updateMany({
            where: {
              installmentPlanId: input.planId,
              sequence: { in: inWindow.map((p) => p.sequence) },
            },
            data: {
              creditStatementId: statement.id,
              paidAt: statement.paidAt,
              transactionId: statement.paidTransactionId,
            },
          });
          for (const p of inWindow) {
            await prisma.installmentPayment.update({
              where: {
                installmentPlanId_sequence: {
                  installmentPlanId: input.planId,
                  sequence: p.sequence,
                },
              },
              data: { paidAmount: dec(p.amount) },
            });
          }
        }
        if (toMoney(shortfall).greaterThan(0)) {
          carryIn = shortfall;
          pendingCarrierId = statement.id;
        } else {
          carryIn = "0.0000";
        }
      } else {
        // The account's real still-unpaid period: bills whatever fell due here,
        // settles nothing (nothing has been paid on it yet).
        if (carryIn !== "0.0000") {
          await prisma.creditStatement.update({
            where: { id: statement.id },
            data: {
              carriedOverAmount: dec(addMoney(statement.carriedOverAmount.toString(), carryIn)),
            },
          });
        }
        if (inWindow.length > 0) {
          await prisma.installmentPayment.updateMany({
            where: {
              installmentPlanId: input.planId,
              sequence: { in: inWindow.map((p) => p.sequence) },
            },
            data: { creditStatementId: statement.id },
          });
        }
        stillReserved = addMoney(stillReserved, addMoney(cuotaSum, carryIn));
        carryIn = "0.0000";
      }
    }

    // Defensive: the account's last closed period is always the generic loop's
    // unpaid one, which the branch above already folds `carryIn` into — this only
    // fires if that invariant is ever broken.
    stillReserved = addMoney(stillReserved, carryIn);
    // Beyond the account's last real closed period: still due but unbilled (the
    // still-open tail hasn't closed yet) or not due at all — either way, reserved.
    stillReserved = input.schedule
      .slice(cursor)
      .reduce((s, p) => addMoney(s, p.amount), stillReserved);
    return stillReserved;
  }

  const notebook = await prisma.installmentPlan.create({
    data: {
      userId: javier.id,
      title: "Notebook ASUS",
      totalPrincipal: dec("1080000.0000"),
      installmentCount: 12,
      startDate: new Date("2026-03-05T00:00:00Z"),
      currency: "CLP",
      // Bought with the CMR card: the plan records which card, so the card's own
      // detail can say what it still owes in instalments.
      cardId: creditCard.id,
      category: "Tecnología",
      notes: "12 cuotas sin interés",
    },
  });
  const notebookDue: Date[] = [];
  for (let seq = 1; seq <= 12; seq++) {
    const due = new Date("2026-03-05T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    notebookDue.push(due);
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: notebook.id,
        sequence: seq,
        dueDate: due,
        amount: dec("90000.0000"),
      },
    });
  }
  // The purchase: consumes the CMR pool in full on day one — excluded from every
  // period's total by `installmentPlanId` (FR-007).
  await prisma.transaction.create({
    data: {
      userId: javier.id,
      bankAccountId: credit.id,
      cardId: creditCard.id,
      type: "EXPENSE",
      amount: dec("1080000.0000"),
      currency: "CLP",
      occurredAt: notebookDue[0]!,
      category: "Tecnología",
      description: notebook.title,
      installmentPlanId: notebook.id,
    },
  });
  // Its schedule folds into Tarjeta CMR's own real chain, already built above
  // from ordinary spend alone — never a parallel one of its own (see the
  // comment on `foldPlanScheduleIntoRealChain`). MUST match `creditSpecs`'
  // own entry for this account exactly, which is why both read from the same
  // `CREDIT_CYCLE_DAY` constant instead of repeating the literal.
  const notebookReserved = await foldPlanScheduleIntoRealChain({
    accountId: credit.id,
    planId: notebook.id,
    billingCycleDay: CREDIT_CYCLE_DAY,
    payFromAccountId: checking.id,
    schedule: notebookDue.map((due, i) => ({
      sequence: i + 1,
      dueDate: due,
      amount: "90000.0000",
    })),
  });
  const creditAfterFold = await prisma.bankAccount.findUniqueOrThrow({ where: { id: credit.id } });
  await prisma.bankAccount.update({
    where: { id: credit.id },
    data: { creditUsed: dec(addMoney(creditAfterFold.creditUsed.toString(), notebookReserved)) },
  });

  const fridge = await prisma.installmentPlan.create({
    data: {
      userId: javier.id,
      title: "Refrigerador Mademsa",
      totalPrincipal: dec("360000.0000"),
      installmentCount: 6,
      startDate: new Date("2026-05-10T00:00:00Z"),
      currency: "CLP",
      cardId: creditCardBch.id,
      category: "Hogar",
      // 6 x 65.000 = 390.000: la compra en cuotas CON interés compromete más que el
      // precio, y esa diferencia va al cupo como cargo financiero (ver TX), nunca
      // calculada por la app — se anota, tal como llega en la cartola real.
      notes: "6 cuotas con interés",
    },
  });
  const fridgeDue: Date[] = [];
  for (let seq = 1; seq <= 6; seq++) {
    const due = new Date("2026-05-10T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    fridgeDue.push(due);
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: fridge.id,
        sequence: seq,
        dueDate: due,
        amount: dec("65000.0000"),
      },
    });
  }
  await prisma.transaction.create({
    data: {
      userId: javier.id,
      bankAccountId: creditBch.id,
      cardId: creditCardBch.id,
      type: "EXPENSE",
      amount: dec("360000.0000"),
      currency: "CLP",
      occurredAt: fridgeDue[0]!,
      category: "Hogar",
      description: fridge.title,
      installmentPlanId: fridge.id,
    },
  });
  // The interest the schedule commits beyond the price (390.000 − 360.000) is
  // ALREADY in the seed's ordinary transaction list above (`TX`, "Interés del
  // plan · Refrigerador Mademsa") — deliberately WITHOUT an `installmentPlanId`,
  // so it keeps billing as an ordinary period charge, and created before the
  // `creditSpecs` loop runs so that loop counts it like any other real spend.

  // Its schedule folds into Visa Crédito's own real chain, already built above
  // from ordinary spend alone — never a parallel chain of its own. MUST match
  // `creditSpecs`' own entry for this account (see `CREDIT_CYCLE_DAY`'s comment).
  const fridgeReserved = await foldPlanScheduleIntoRealChain({
    accountId: creditBch.id,
    planId: fridge.id,
    billingCycleDay: CREDIT_BCH_CYCLE_DAY,
    payFromAccountId: checking.id,
    schedule: fridgeDue.map((due, i) => ({
      sequence: i + 1,
      dueDate: due,
      amount: "65000.0000",
    })),
  });
  const creditBchAfterFold = await prisma.bankAccount.findUniqueOrThrow({
    where: { id: creditBch.id },
  });
  await prisma.bankAccount.update({
    where: { id: creditBch.id },
    data: {
      creditUsed: dec(addMoney(creditBchAfterFold.creditUsed.toString(), fridgeReserved)),
    },
  });

  // A third instalment plan bought with a CREDIT card, this time on the BCI
  // credit line — same model as "Notebook ASUS"/"Refrigerador Mademsa" above:
  // the purchase consumes the pool in full on day one, and only the schedule
  // bills into the account's own real chain.
  const tv = await prisma.installmentPlan.create({
    data: {
      userId: javier.id,
      title: "Smart TV LG 55'",
      totalPrincipal: dec("480000.0000"),
      installmentCount: 6,
      startDate: new Date("2026-04-10T00:00:00Z"),
      currency: "CLP",
      cardId: creditCardBci.id,
      category: "Tecnología",
      notes: "6 cuotas sin interés",
    },
  });
  const tvDue: Date[] = [];
  for (let seq = 1; seq <= 6; seq++) {
    const due = new Date("2026-04-10T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    tvDue.push(due);
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: tv.id,
        sequence: seq,
        dueDate: due,
        amount: dec("80000.0000"),
      },
    });
  }
  await prisma.transaction.create({
    data: {
      userId: javier.id,
      bankAccountId: bciCredit.id,
      cardId: creditCardBci.id,
      type: "EXPENSE",
      amount: dec("480000.0000"),
      currency: "CLP",
      occurredAt: tvDue[0]!,
      category: "Tecnología",
      description: tv.title,
      installmentPlanId: tv.id,
    },
  });
  // Its schedule folds into Línea de Crédito BCI's own real chain, already
  // built above from ordinary spend alone — never a parallel chain of its own.
  // MUST match `creditSpecs`' own entry for this account (see
  // `CREDIT_BCI_CYCLE_DAY`'s comment).
  const tvReserved = await foldPlanScheduleIntoRealChain({
    accountId: bciCredit.id,
    planId: tv.id,
    billingCycleDay: CREDIT_BCI_CYCLE_DAY,
    payFromAccountId: bciChecking.id,
    schedule: tvDue.map((due, i) => ({
      sequence: i + 1,
      dueDate: due,
      amount: "80000.0000",
    })),
  });
  const bciCreditAfterFold = await prisma.bankAccount.findUniqueOrThrow({
    where: { id: bciCredit.id },
  });
  await prisma.bankAccount.update({
    where: { id: bciCredit.id },
    data: {
      creditUsed: dec(addMoney(bciCreditAfterFold.creditUsed.toString(), tvReserved)),
    },
  });

  // A plan bought with a DEBIT card is the OTHER half of the model, unchanged by
  // spec 014: no purchase movement, no billing period — each instalment pays with
  // real money straight out of the account, exactly as before.
  const bicycle2 = await prisma.installmentPlan.create({
    data: {
      userId: javier.id,
      title: "Aspiradora Robot",
      totalPrincipal: dec("240000.0000"),
      installmentCount: 4,
      startDate: new Date("2026-04-15T00:00:00Z"),
      currency: "CLP",
      cardId: debitCard.id,
      category: "Hogar",
      notes: "4 cuotas, pagadas con la débito de la cuenta corriente",
    },
  });
  for (let seq = 1; seq <= 4; seq++) {
    const due = new Date("2026-04-15T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: bicycle2.id,
        sequence: seq,
        dueDate: due,
        amount: dec("60000.0000"),
      },
    });
  }
  let debitPlanOutflow = 0;
  for (let seq = 1; seq <= 2; seq++) {
    const due = new Date("2026-04-15T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    const paidAt = new Date(due.getTime() + 86_400_000);
    const tx = await prisma.transaction.create({
      data: {
        userId: javier.id,
        bankAccountId: checking.id,
        cardId: debitCard.id,
        type: "EXPENSE",
        amount: dec("60000.0000"),
        currency: "CLP",
        occurredAt: paidAt,
        category: "Hogar",
        description: `${bicycle2.title} · ${seq}/4`,
        installmentPlanId: bicycle2.id,
      },
    });
    debitPlanOutflow += 60000;
    await prisma.installmentPayment.update({
      where: { installmentPlanId_sequence: { installmentPlanId: bicycle2.id, sequence: seq } },
      data: { paidAt, paidAmount: dec("60000.0000"), transactionId: tx.id },
    });
  }
  if (debitPlanOutflow > 0) {
    const acc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: checking.id } });
    await prisma.bankAccount.update({
      where: { id: checking.id },
      data: { currentBalance: acc.currentBalance.minus(dec(debitPlanOutflow.toFixed(4))) },
    });
  }

  // --- Instalment plans paid with REAL money (spec 013) -------------------------
  // The two plans above hang off credit cards, so paying an instalment there only
  // marks it: that debt is already on the card's statement. These four are the other
  // half of the model — a remembered payment account, real expenses, a carry-over,
  // a finished plan and an overdue one.
  let instalmentOutflow = 0;

  /** Creates a plan whose paid instalments each recorded a real expense on `checking`. */
  async function mkPaidPlan(spec: {
    title: string;
    category: string;
    total: string;
    count: number;
    amount: string;
    start: string;
    /** Per sequence: what was actually paid. Absent = unpaid. */
    paid: Record<number, string>;
    notes?: string;
  }) {
    const plan = await prisma.installmentPlan.create({
      data: {
        userId: javier.id,
        title: spec.title,
        totalPrincipal: dec(spec.total),
        installmentCount: spec.count,
        startDate: new Date(spec.start),
        currency: "CLP",
        category: spec.category,
        paymentAccountId: checking.id,
        notes: spec.notes ?? null,
      },
    });

    let carry = 0;
    for (let seq = 1; seq <= spec.count; seq++) {
      const due = new Date(spec.start);
      due.setUTCMonth(due.getUTCMonth() + (seq - 1));
      const paidAmount = spec.paid[seq];
      const carriedIn = carry;
      let transactionId: string | null = null;

      if (paidAmount !== undefined) {
        const paidAt = new Date(due.getTime() + 86_400_000);
        const tx = await prisma.transaction.create({
          data: {
            userId: javier.id,
            bankAccountId: checking.id,
            type: "EXPENSE",
            amount: dec(paidAmount),
            currency: "CLP",
            occurredAt: paidAt,
            category: spec.category,
            description: `${spec.title} · ${seq}/${spec.count}`,
            installmentPlanId: plan.id,
          },
        });
        transactionId = tx.id;
        instalmentOutflow += Number(paidAmount);
        // What the payment failed to cover moves to the NEXT instalment — the
        // schedule itself is never rewritten (FR-020/FR-021).
        carry = Number(spec.amount) + carriedIn - Number(paidAmount);
      } else {
        carry = 0;
      }

      await prisma.installmentPayment.create({
        data: {
          installmentPlanId: plan.id,
          sequence: seq,
          dueDate: due,
          amount: dec(spec.amount),
          carriedOverAmount: dec(carriedIn.toFixed(4)),
          paidAt: paidAmount === undefined ? null : new Date(due.getTime() + 86_400_000),
          paidAmount: paidAmount === undefined ? null : dec(paidAmount),
          transactionId,
        },
      });
    }
    return plan;
  }

  // In progress: two of four instalments paid in full, from the remembered account.
  await mkPaidPlan({
    title: "Bicicleta Trek",
    category: "Deporte",
    total: "200000.0000",
    count: 4,
    amount: "50000.0000",
    start: "2026-04-02T00:00:00Z",
    paid: { 1: "50000.0000", 2: "50000.0000" },
  });

  // Short payment: 50.000 against an instalment owing 60.000, so 10.000 rides on
  // the next one as its own figure, shown apart from the scheduled amount.
  await mkPaidPlan({
    title: "Tratamiento dental",
    category: "Salud",
    total: "180000.0000",
    count: 3,
    amount: "60000.0000",
    start: "2026-05-03T00:00:00Z",
    paid: { 1: "50000.0000" },
    notes: "Pagué de menos la primera cuota",
  });

  // Finished: every instalment paid — the case the "Pagados" filter is for.
  await mkPaidPlan({
    title: "Celular Samsung",
    category: "Tecnología",
    total: "300000.0000",
    count: 3,
    amount: "100000.0000",
    start: "2026-02-08T00:00:00Z",
    paid: { 1: "100000.0000", 2: "100000.0000", 3: "100000.0000" },
  });

  // Overdue: nothing paid and the first instalment fell due months ago, which is
  // what puts the "próxima cuota" indicator in alert.
  await mkPaidPlan({
    title: "Curso de inglés",
    category: "Educación",
    total: "240000.0000",
    count: 6,
    amount: "40000.0000",
    start: "2026-02-01T00:00:00Z",
    paid: {},
  });

  // Those expenses are real money out of the current account: the seeded balance
  // has to agree with them, exactly as it does for the statement payments above.
  if (instalmentOutflow > 0) {
    const acc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: checking.id } });
    await prisma.bankAccount.update({
      where: { id: checking.id },
      data: { currentBalance: acc.currentBalance.minus(dec(instalmentOutflow.toFixed(4))) },
    });
  }

  // --- Debts (both directions; mix of cuotas, simple, settled, multi-currency) ---
  // `paymentAccountId` is the payment panel's DEFAULT suggestion (see CLAUDE.md's
  // `debt` bullet) — most get a real account matching their own currency; one
  // (Diego) is left WITHOUT one on purpose, to prove the "Sin cuenta" state still
  // renders fine. Two of them (María, Tía Carmen) already have real instalments
  // paid — since 2026-09-05 that means a real `Transaction` + balance move, not
  // just the counter, so those are created individually (not `createMany`, which
  // returns no ids) with their own linked movements below, mirroring exactly what
  // `SettleDebtHandler`/`RegisterDebtPaymentHandler` do at runtime.
  const debtMaria = await prisma.debt.create({
    data: {
      userId: javier.id,
      direction: "OWED_TO_YOU",
      counterparty: "María González",
      principal: dec("120000.0000"),
      currency: "CLP",
      openedAt: new Date("2026-06-11T00:00:00Z"),
      dueAt: new Date("2026-08-11T00:00:00Z"),
      totalInstallments: 3,
      paidInstallments: 1,
      installmentAmount: dec("40000.0000"),
      notes: "Préstamo en 3 cuotas",
      paymentAccountId: checking.id,
    },
  });

  await prisma.debt.create({
    data: {
      userId: javier.id,
      direction: "OWED_TO_YOU",
      counterparty: "Pedro Soto",
      principal: dec("45000.0000"),
      currency: "CLP",
      openedAt: new Date("2026-05-20T00:00:00Z"),
      dueAt: new Date("2026-07-15T00:00:00Z"),
      totalInstallments: 1,
      paidInstallments: 0,
      installmentAmount: null,
      paymentAccountId: sight.id,
    },
  });

  // OWED_TO_YOU — en USD (para mostrar KPI multi-moneda), enlazada a la única
  // cuenta en USD del usuario.
  await prisma.debt.create({
    data: {
      userId: javier.id,
      direction: "OWED_TO_YOU",
      counterparty: "Roberto (viaje NY)",
      principal: dec("320.0000"),
      currency: "USD",
      openedAt: new Date("2026-06-01T00:00:00Z"),
      totalInstallments: 1,
      paidInstallments: 0,
      installmentAmount: null,
      notes: "Split vuelo NYC",
      paymentAccountId: tenpo.id,
    },
  });

  const debtCarmen = await prisma.debt.create({
    data: {
      userId: javier.id,
      direction: "YOU_OWE",
      counterparty: "Tía Carmen",
      principal: dec("200000.0000"),
      currency: "CLP",
      openedAt: new Date("2026-05-01T00:00:00Z"),
      dueAt: new Date("2026-08-31T00:00:00Z"),
      totalInstallments: 4,
      paidInstallments: 2,
      installmentAmount: dec("50000.0000"),
      notes: "Préstamo familiar",
      paymentAccountId: checking.id,
    },
  });

  await prisma.debt.create({
    data: {
      userId: javier.id,
      direction: "YOU_OWE",
      counterparty: "Carlos (TV)",
      principal: dec("150000.0000"),
      currency: "CLP",
      openedAt: new Date("2026-06-15T00:00:00Z"),
      totalInstallments: 6,
      paidInstallments: 0,
      installmentAmount: dec("25000.0000"),
      paymentAccountId: cash.id,
    },
  });

  // YOU_OWE — saldada (no debe aparecer en lista activa). Sin cuenta asociada a
  // propósito: demuestra que "Sin cuenta" es un estado válido — y, por lo tanto,
  // que `lastPaymentTransactionId` se queda en null (nada real que revertir con
  // "Reabrir") tal como una deuda saldada antes de esta funcionalidad.
  await prisma.debt.create({
    data: {
      userId: javier.id,
      direction: "YOU_OWE",
      counterparty: "Diego (arriendo)",
      principal: dec("89500.0000"),
      currency: "CLP",
      openedAt: new Date("2026-04-01T00:00:00Z"),
      dueAt: new Date("2026-05-15T00:00:00Z"),
      totalInstallments: 1,
      paidInstallments: 1,
      installmentAmount: null,
      settledAt: new Date("2026-05-14T00:00:00Z"),
    },
  });

  // The real movements behind María's and Tía Carmen's already-paid instalments —
  // same shape `RegisterDebtPaymentHandler` writes at runtime (an ordinary
  // INCOME/EXPENSE on `checking`, category "Deudas"), so `checking`'s seeded
  // balance has to account for them, exactly like the instalment-plan outflows
  // above. Only the LAST one paid becomes each debt's `lastPaymentTransactionId`/
  // `lastPaymentAccountId`/`lastPaymentAmount` — the one "Deshacer" would revert —
  // mirroring the real handler's "only the most recent payment is undoable" rule.
  let debtNetFlow = 0;

  const mariaPaidAt = new Date("2026-07-11T00:00:00Z");
  const mariaTx = await prisma.transaction.create({
    data: {
      userId: javier.id,
      bankAccountId: checking.id,
      type: "INCOME",
      amount: dec("40000.0000"),
      currency: "CLP",
      occurredAt: mariaPaidAt,
      category: "Deudas",
      description: `${debtMaria.counterparty} · ${debtMaria.notes} · 1/3`,
      debtId: debtMaria.id,
    },
  });
  debtNetFlow += 40000;
  await prisma.debt.update({
    where: { id: debtMaria.id },
    data: {
      lastPaymentTransactionId: mariaTx.id,
      lastPaymentAccountId: checking.id,
      lastPaymentAmount: dec("40000.0000"),
    },
  });

  let carmenLastTxId = "";
  for (let seq = 1; seq <= 2; seq++) {
    const paidAt = new Date("2026-06-01T00:00:00Z");
    paidAt.setUTCMonth(paidAt.getUTCMonth() + (seq - 1));
    const tx = await prisma.transaction.create({
      data: {
        userId: javier.id,
        bankAccountId: checking.id,
        type: "EXPENSE",
        amount: dec("50000.0000"),
        currency: "CLP",
        occurredAt: paidAt,
        category: "Deudas",
        description: `${debtCarmen.counterparty} · ${debtCarmen.notes} · ${seq}/4`,
        debtId: debtCarmen.id,
      },
    });
    debtNetFlow -= 50000;
    carmenLastTxId = tx.id;
  }
  await prisma.debt.update({
    where: { id: debtCarmen.id },
    data: {
      lastPaymentTransactionId: carmenLastTxId,
      lastPaymentAccountId: checking.id,
      lastPaymentAmount: dec("50000.0000"),
    },
  });

  if (debtNetFlow !== 0) {
    const acc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: checking.id } });
    await prisma.bankAccount.update({
      where: { id: checking.id },
      data: { currentBalance: acc.currentBalance.plus(dec(debtNetFlow.toFixed(4))) },
    });
  }

  // --- Savings goals + entries ---
  const japan = await prisma.savingsGoal.create({
    data: {
      userId: javier.id,
      title: "Viaje a Japón 🗾",
      targetAmount: dec("3000000.0000"),
      currency: "CLP",
      deadline: new Date("2026-12-20T00:00:00Z"),
    },
  });
  const emergency = await prisma.savingsGoal.create({
    data: {
      userId: javier.id,
      title: "Fondo de emergencia 🛟",
      targetAmount: dec("2000000.0000"),
      currency: "CLP",
      deadline: new Date("2027-06-30T00:00:00Z"),
    },
  });
  const laptopGoal = await prisma.savingsGoal.create({
    data: {
      userId: javier.id,
      title: "Notebook nuevo 💻",
      targetAmount: dec("1000000.0000"),
      currency: "CLP",
    },
  });
  await prisma.savingsEntry.createMany({
    data: [
      {
        userId: javier.id,
        savingsGoalId: japan.id,
        amount: dec("400000.0000"),
        currency: "CLP",
        contributedAt: new Date("2026-04-01T08:00:00Z"),
        note: "Aporte mensual",
      },
      {
        userId: javier.id,
        savingsGoalId: japan.id,
        amount: dec("400000.0000"),
        currency: "CLP",
        contributedAt: new Date("2026-05-01T08:00:00Z"),
        note: "Aporte mensual",
      },
      {
        userId: javier.id,
        savingsGoalId: japan.id,
        amount: dec("450000.0000"),
        currency: "CLP",
        contributedAt: new Date("2026-06-01T08:00:00Z"),
        note: "Aporte mensual",
      },
      {
        userId: javier.id,
        savingsGoalId: emergency.id,
        amount: dec("500000.0000"),
        currency: "CLP",
        contributedAt: new Date("2026-05-05T08:00:00Z"),
      },
      {
        userId: javier.id,
        savingsGoalId: emergency.id,
        amount: dec("300000.0000"),
        currency: "CLP",
        contributedAt: new Date("2026-06-05T08:00:00Z"),
      },
      {
        userId: javier.id,
        savingsGoalId: laptopGoal.id,
        amount: dec("300000.0000"),
        currency: "CLP",
        contributedAt: new Date("2026-06-10T08:00:00Z"),
      },
    ],
  });

  // --- Investments ---
  await prisma.investment.createMany({
    data: [
      {
        userId: javier.id,
        kind: "ETF",
        label: "Vanguard FTSE All-World",
        currency: "USD",
        symbol: "VWCE",
        shares: dec("48.00000000"),
        openedAt: new Date("2025-09-01T00:00:00Z"),
      },
      {
        userId: javier.id,
        kind: "REMUNERATED_ACCOUNT",
        label: "Depósito a plazo Tenpo",
        currency: "USD",
        annualRate: dec("0.050000"),
        principal: dec("4000.0000"),
        bankAccountId: tenpo.id,
        openedAt: new Date("2026-02-01T00:00:00Z"),
      },
    ],
  });

  // --- Recurring expenses (subscriptions, rent, periodic payments) ---
  await prisma.recurringExpense.createMany({
    data: [
      {
        userId: javier.id,
        label: "Arriendo",
        amount: dec("520000.0000"),
        currency: "CLP",
        category: "Vivienda",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: new Date("2026-01-05T00:00:00Z"),
        bankAccountId: checking.id,
        notes: "Departamento Ñuñoa",
      },
      {
        userId: javier.id,
        label: "Netflix",
        amount: dec("9990.0000"),
        currency: "CLP",
        category: "Suscripciones",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: new Date("2026-01-10T00:00:00Z"),
        bankAccountId: credit.id,
      },
      {
        userId: javier.id,
        label: "Spotify",
        amount: dec("5990.0000"),
        currency: "CLP",
        category: "Suscripciones",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: new Date("2026-01-10T00:00:00Z"),
        bankAccountId: credit.id,
      },
      {
        userId: javier.id,
        label: "Gimnasio Smart Fit",
        amount: dec("32000.0000"),
        currency: "CLP",
        category: "Salud",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: new Date("2026-01-17T00:00:00Z"),
        bankAccountId: checking.id,
      },
      {
        userId: javier.id,
        label: "Mesada a hijo",
        amount: dec("100000.0000"),
        currency: "CLP",
        category: "Familia",
        frequency: "MONTHLY",
        interval: 1,
        anchorDate: new Date("2026-01-25T00:00:00Z"),
        bankAccountId: checking.id,
      },
      {
        userId: javier.id,
        label: "Aseo semanal",
        amount: dec("25000.0000"),
        currency: "CLP",
        category: "Hogar",
        frequency: "WEEKLY",
        interval: 1,
        anchorDate: new Date("2026-06-02T00:00:00Z"),
      },
      {
        userId: javier.id,
        label: "Seguro automóvil",
        amount: dec("360000.0000"),
        currency: "CLP",
        category: "Seguros",
        frequency: "YEARLY",
        interval: 1,
        anchorDate: new Date("2026-03-15T00:00:00Z"),
        bankAccountId: checking.id,
      },
    ],
  });
}

/**
 * Which account products each institution offers (`institution-account-type`).
 *
 * Defaults are per bank category / per kind, with a small per-code override map —
 * this is a commercial catalogue, so it is expected to be tuned institution by
 * institution over time; the shape below is what makes that cheap. FIRST entry of
 * each list is the flagship (`isPrimary`). Deliberately NOT derived at runtime
 * from `kind`/`category`: those classify what the entity IS, not what it SELLS.
 */
async function seedInstitutionAccountTypes(countryId: string) {
  type Product = Prisma.InstitutionAccountTypeCreateManyInput["type"];

  const BY_BANK_CATEGORY: Record<string, Product[]> = {
    // Local retail/commercial bank: the full deposit + credit catalogue.
    // Local retail/commercial bank: deposits, credit, and the mutual funds it sells
    // through its own AGF subsidiary — the user opens that account at "BCI", not at
    // "BCI Asset Management AGF S.A.", so INVESTMENT hangs off the bank they know.
    ESTABLISHED: ["CHECKING", "SIGHT", "SAVINGS", "CREDIT_CARD", "INVESTMENT"],
    // Branch of a foreign bank: corporate current accounts, no retail products.
    FOREIGN_BRANCH: ["CHECKING"],
    // BancoEstado: CuentaRUT first.
    STATE: ["SIGHT", "CHECKING", "SAVINGS", "CREDIT_CARD", "INVESTMENT"],
  };
  // A cooperative takes its members' savings and lends: ahorro first, plus a sight
  // account (Coopeuch's Dale) and its own credit card.
  const COOPERATIVE_PRODUCTS: Product[] = ["SAVINGS", "SIGHT", "CREDIT_CARD"];
  // Non-bank issuers with the prepaid licence provision funds up front.
  const ISSUER_PRODUCTS: Product[] = ["PREPAID"];
  // A fund manager / broker administers money invested in funds or instruments: the
  // investment account is its ONLY product — it takes no deposits and issues no cards.
  const FUND_MANAGER_PRODUCTS: Product[] = ["INVESTMENT"];
  // Retail / caja de compensación issuers that hold BOTH licences (prepaid + credit).
  const ISSUER_WITH_CREDIT = new Set(["697", "699", "729"]);
  // Issuers holding ONLY the credit-card licence (TCEEM): a store card, no prepaid.
  const CREDIT_ONLY_PRODUCTS: Product[] = ["CREDIT_CARD"];
  const CREDIT_ONLY_CODES = new Set([
    "689", // COFISA
    "708", // Inversiones y Tarjetas
    "2527", // sbpay (Matic Kard)
    "707", // Cruz Verde (Solventa)
    "288", // Unipay (Unicard)
    "RUT-96712290", // FISO
  ]);

  const institutions = await prisma.financialInstitution.findMany({
    where: { countryId },
    select: { id: true, code: true, kind: true, category: true },
  });

  function resolveProducts(inst: (typeof institutions)[number]): Product[] {
    if (inst.kind === "BANK") {
      return BY_BANK_CATEGORY[inst.category ?? "ESTABLISHED"] ?? BY_BANK_CATEGORY.ESTABLISHED;
    }
    if (inst.kind === "COOPERATIVE") return COOPERATIVE_PRODUCTS;
    if (inst.kind === "FUND_MANAGER") return FUND_MANAGER_PRODUCTS;
    // A payment account holding e-money: it receives transfers and holds a balance
    // that can't go negative — this app's PREPAID account — with or without a card
    // ever being issued against it (Fintual issues none).
    if (inst.kind === "PAYMENT_PROVIDER") return ISSUER_PRODUCTS;
    // A credit-only issuer is keyed by RUT precisely because it has no transfer
    // code — the same fact that tells us it holds no prepaid licence.
    if (CREDIT_ONLY_CODES.has(inst.code)) return CREDIT_ONLY_PRODUCTS;
    if (ISSUER_WITH_CREDIT.has(inst.code)) return [...ISSUER_PRODUCTS, "CREDIT_CARD"];
    return ISSUER_PRODUCTS;
  }

  for (const inst of institutions) {
    const products = resolveProducts(inst);

    for (const [index, type] of products.entries()) {
      await prisma.institutionAccountType.upsert({
        where: { institutionId_type: { institutionId: inst.id, type } },
        update: { isPrimary: index === 0 },
        create: { institutionId: inst.id, type, isPrimary: index === 0 },
      });
    }
    // Re-seeding after tuning a list must also RETIRE what is no longer offered.
    await prisma.institutionAccountType.deleteMany({
      where: { institutionId: inst.id, type: { notIn: products } },
    });
  }
}

/** Reference data (countries + banks). Idempotent: upsert by natural keys. */
async function seedReferenceData() {
  /**
   * MVP: la app opera solo en Chile. Los otros cinco países estaban sembrados con
   * catálogo vacío o a medias (solo Argentina llegó a tener instituciones), y un
   * selector de país que ofrece mercados sin bancos es peor que no ofrecerlos.
   *
   * Lo que soporta más de un país NO se borró — `accountNumberFormat`/`isValidCbu`
   * en el contrato, `InstitutionKind.PAYMENT_PROVIDER`, la FK `Country` y el filtro
   * `?country=` siguen ahí: el modelo es multi-país, el catálogo es de uno.
   */
  const COUNTRIES = [
    { alpha2: "CL", alpha3: "CHL", numeric: "152", name: "Chile", callingCode: "+56" },
  ] as const;

  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { alpha2: c.alpha2 },
      update: { alpha3: c.alpha3, numeric: c.numeric, name: c.name, callingCode: c.callingCode },
      create: c,
    });
  }

  const chile = await prisma.country.findUniqueOrThrow({ where: { alpha2: "CL" } });

  /** `name` is the COMMERCIAL name (what the picker shows and the user recognises);
   * `legalName` is the entity as the CMF registers it, kept for compliance and as a
   * search term. `retailFacing: false` = corporate-only, hidden from the picker. */
  type BankSeed = {
    code: string;
    name: string;
    legalName?: string;
    category: "ESTABLISHED" | "FOREIGN_BRANCH" | "STATE";
    brands?: string[];
    retailFacing?: boolean;
    notes?: string;
  };
  const CHILE_BANKS: BankSeed[] = [
    // Bancos establecidos
    {
      code: "001",
      name: "Banco de Chile",
      category: "ESTABLISHED",
      brands: ["Banco Edwards | Citi", "Atlas", "CrediChile"],
    },
    { code: "009", name: "Banco Internacional", category: "ESTABLISHED" },
    {
      code: "014",
      name: "Scotiabank Chile",
      category: "ESTABLISHED",
      brands: ["BancoDesarrollo"],
    },
    {
      code: "016",
      name: "BCI",
      legalName: "Banco de Crédito e Inversiones",
      category: "ESTABLISHED",
      brands: ["TBanc", "Banco Nova"],
    },
    {
      code: "028",
      name: "Banco BICE",
      category: "ESTABLISHED",
      notes:
        "Res. Exenta N°10940 (20-oct-2025): fusión por incorporación de Banco Security en Banco BICE (continuador legal).",
    },
    { code: "031", name: "HSBC", legalName: "HSBC Bank (Chile)", category: "ESTABLISHED" },
    {
      code: "037",
      name: "Banco Santander-Chile",
      category: "ESTABLISHED",
      brands: ["Banefe"],
    },
    {
      code: "039",
      name: "Itaú",
      legalName: "Banco Itaú Chile",
      category: "ESTABLISHED",
      notes:
        "01-abr-2016: fusión de Banco Corpbanca en Itaú Corpbanca. Res. N°2215 (28-mar-2023): renombrado a Banco Itaú Chile.",
    },
    { code: "051", name: "Banco Falabella", category: "ESTABLISHED" },
    { code: "053", name: "Banco Ripley", category: "ESTABLISHED" },
    { code: "055", name: "Banco Consorcio", category: "ESTABLISHED" },
    {
      code: "059",
      name: "BTG Pactual",
      legalName: "Banco BTG Pactual Chile",
      category: "ESTABLISHED",
    },
    { code: "062", name: "Tanner", legalName: "Tanner Banco Digital", category: "ESTABLISHED" },
    { code: "063", name: "Tenpo Bank", legalName: "Tenpo Bank Chile", category: "ESTABLISHED" },
    // Sucursales de bancos extranjeros
    {
      code: "041",
      name: "JP Morgan Chase",
      legalName: "JP Morgan Chase Bank, N. A.",
      category: "FOREIGN_BRANCH",
      retailFacing: false,
    },
    {
      code: "060",
      name: "China Construction Bank",
      legalName: "China Construction Bank, Agencia en Chile",
      category: "FOREIGN_BRANCH",
      retailFacing: false,
    },
    {
      code: "061",
      name: "Bank of China",
      legalName: "Bank of China, Agencia en Chile",
      category: "FOREIGN_BRANCH",
      retailFacing: false,
    },
    // Bancos estatales
    {
      code: "012",
      name: "BancoEstado",
      legalName: "Banco del Estado de Chile",
      category: "STATE",
      brands: ["CuentaRUT"],
    },
  ];

  for (const b of CHILE_BANKS) {
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: b.code } },
      update: {
        kind: "BANK",
        name: b.name,
        legalName: b.legalName ?? b.name,
        category: b.category,
        brands: b.brands ?? [],
        retailFacing: b.retailFacing ?? true,
        notes: b.notes ?? null,
      },
      create: {
        countryId: chile.id,
        kind: "BANK",
        code: b.code,
        name: b.name,
        legalName: b.legalName ?? b.name,
        category: b.category,
        brands: b.brands ?? [],
        retailFacing: b.retailFacing ?? true,
        notes: b.notes ?? null,
      },
    });
  }

  // Non-bank payment card issuers (emisores de tarjetas de pago con provisión de fondos).
  /**
   * `name` = the brand on the app the user actually opens; `legalName` = the entity
   * as the CMF registers it (verified against the TPEEM list). The two diverge almost
   * everywhere here, which is why the picker searches both: nobody looks for
   * "Compañía Emisora de Medios de Pago Digitales S.A." to find Copec Pay.
   * Brand↔entity links come from each product's own terms of service, NOT from the
   * registry (which carries no brands) — treat them as the softer half of this data.
   */
  const CHILE_ISSUERS: {
    code: string;
    name: string;
    legalName: string;
    retailFacing?: boolean;
    /** Default `NON_BANK_ISSUER`. A licence is a permission, not a product: an entity
     * may hold the prepaid one and never issue a card, running a payment account
     * instead — that entity is a `PAYMENT_PROVIDER`, same as the Argentine PSPs. */
    kind?: "NON_BANK_ISSUER" | "PAYMENT_PROVIDER";
    notes?: string;
  }[] = [
    {
      code: "741",
      name: "Copec Pay",
      legalName: "Compañía Emisora de Medios de Pago Digitales S.A.",
    },
    { code: "764", name: "Fintoc", legalName: "Fintoc Pagos S.A." },
    {
      code: "746",
      name: "Fintual",
      legalName: "Fintual Prepago S.A.",
      kind: "PAYMENT_PROVIDER",
      notes:
        "Tiene la licencia de prepago (TPEEM) pero NO emite tarjetas: la usa para conectarse al sistema de pagos y que la cuenta del usuario reciba transferencias a su propio nombre. Cuenta de pago sin plástico — por eso PAYMENT_PROVIDER y no NON_BANK_ISSUER. La cuenta de inversión es otra entidad: AGF-fintual.",
    },
    { code: "738", name: "Global66", legalName: "Global Card S.A." },
    { code: "739", name: "Haulmer", legalName: "Haulmer Prepago S.A." },
    { code: "697", name: "La Polar", legalName: "Inversiones LP S.A." },
    { code: "732", name: "Tapp", legalName: "Los Andes Tarjetas de Prepago S.A." },
    { code: "875", name: "Mercado Pago", legalName: "Mercado Pago Emisora S.A." },
    { code: "747", name: "MetroPay", legalName: "Metro Emisora de Medios de Pago S.A." },
    // Banking-as-a-service infrastructure: issues for other companies, sells to none.
    { code: "882", name: "Pomelo", legalName: "Pomelo Tech Chile S.A.", retailFacing: false },
    { code: "743", name: "Prex", legalName: "Prex Chile S.A." },
    { code: "729", name: "Los Héroes", legalName: "Sociedad Emisora de Tarjetas Los Héroes S.A." },
    { code: "744", name: "SumUp Pay", legalName: "SumUp Chile Blue S.A." },
    { code: "730", name: "Tenpo", legalName: "Tenpo Payments S.A." },
    { code: "699", name: "Tricot", legalName: "Tricard S.A." },
  ];
  for (const e of CHILE_ISSUERS) {
    const fields = {
      kind: e.kind ?? ("NON_BANK_ISSUER" as const),
      name: e.name,
      legalName: e.legalName,
      category: null,
      retailFacing: e.retailFacing ?? true,
      notes: e.notes ?? null,
    };
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: e.code } },
      update: fields,
      create: { countryId: chile.id, code: e.code, ...fields },
    });
  }

  /**
   * Cooperativas de ahorro y crédito (CMF register BCCOO) and the non-bank issuers
   * that hold ONLY the credit-card licence (register TCEEM) — two whole sectors the
   * catalogue was missing while it covered just the prepaid register (TPEEM).
   *
   * `code`: these entities receive no transfers, so most have no institutional
   * (transfer) code the way a bank does — only Coopeuch does. For the rest the
   * natural key is their RUT, prefixed to say so out loud rather than inventing a
   * regulator code that doesn't exist.
   */
  const CHILE_COOPERATIVES: { code: string; name: string; legalName: string }[] = [
    { code: "672", name: "Coopeuch", legalName: "Cooperativa de Ahorro y Crédito Coopeuch" },
    {
      code: "RUT-70017860",
      name: "El Detallista",
      legalName: "Cooperativa de Ahorro y Crédito El Detallista Ltda.",
    },
    {
      code: "RUT-70286300",
      name: "Coocretal",
      legalName: "Cooperativa de Ahorro y Crédito Nacional para la Familia Limitada",
    },
    {
      code: "RUT-70010920",
      name: "Oriencoop",
      legalName: "Cooperativa de Ahorro y Crédito Oriente Ltda.",
    },
    {
      code: "RUT-70015260",
      name: "Coopertal",
      legalName: "Cooperativa de Ahorro y Crédito Talagante Ltda.",
    },
    {
      code: "RUT-84156800",
      name: "Unión Aérea",
      legalName: "Cooperativa de Ahorro y Crédito Unión Aérea Ltda.",
    },
    {
      code: "RUT-81836800",
      name: "Ahorrocoop",
      legalName:
        "Cooperativa de Ahorro, Crédito y Servicios Financieros Ahorrocoop Diego Portales Ltda.",
    },
  ];
  for (const c of CHILE_COOPERATIVES) {
    const fields = {
      kind: "COOPERATIVE" as const,
      name: c.name,
      legalName: c.legalName,
      category: null,
      retailFacing: true,
    };
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: c.code } },
      update: fields,
      create: { countryId: chile.id, code: c.code, ...fields },
    });
  }

  /**
   * Credit-only non-bank issuers (TCEEM). The three that ALSO hold the prepaid
   * licence (Tenpo 730, Inversiones LP 697, Tricard 699) are already seeded above
   * from TPEEM — one entity, two licences, one row.
   *
   * These entities receive no transfers, so they have no transfer code — but the CMF
   * does assign them an institution code, read off each entity's own registry page.
   * FISO is the one whose code couldn't be verified there, so it keeps the RUT key
   * rather than a guessed number.
   *
   * `name`: the CMF's own "nombre de fantasía" when it declares one (COFISA), the
   * card's brand when the entity's site states it (Unipay, sbpay, Cruz Verde).
   */
  const CHILE_CREDIT_ISSUERS: { code: string; name: string; legalName: string }[] = [
    { code: "689", name: "COFISA", legalName: "Créditos, Organización y Finanzas S.A." },
    { code: "708", name: "Inversiones y Tarjetas", legalName: "Inversiones y Tarjetas S.A." },
    { code: "2527", name: "sbpay", legalName: "Matic Kard S.A." },
    { code: "707", name: "Cruz Verde", legalName: "Solventa Tarjetas S.A." },
    { code: "288", name: "Unipay", legalName: "Unicard S.A." },
    // Código institucional no verificable en la ficha CMF: se mantiene la llave por RUT.
    { code: "RUT-96712290", name: "FISO", legalName: "FISO S.A." },
  ];
  // These six were first seeded keyed by RUT, before their CMF institution codes
  // were verified. Re-keying an entity means the upsert creates the new row and
  // leaves the old one behind, so the retired keys are removed explicitly —
  // `SetNull` on the account FK means no account is lost if one pointed at them.
  const RETIRED_ISSUER_KEYS = [
    "RUT-96522900",
    "RUT-85325100",
    "RUT-96623540",
    "RUT-96776000",
    "RUT-76086272",
  ];
  await prisma.financialInstitution.deleteMany({
    where: { countryId: chile.id, code: { in: RETIRED_ISSUER_KEYS } },
  });

  for (const e of CHILE_CREDIT_ISSUERS) {
    const fields = {
      kind: "NON_BANK_ISSUER" as const,
      name: e.name,
      legalName: e.legalName,
      category: null,
      retailFacing: true,
    };
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: e.code } },
      update: fields,
      create: { countryId: chile.id, code: e.code, ...fields },
    });
  }

  /**
   * Administradoras generales de fondos y corredoras (kind FUND_MANAGER). Sin ellas
   * el catálogo no tenía UNA sola institución que ofreciera `INVESTMENT`: el selector
   * de una cuenta de inversión quedaba vacío aunque Fintual ya estuviera en la tabla
   * — su fila es "Fintual Prepago S.A.", la licencia de prepago, que es otra entidad.
   *
   * Por eso Fintual aparece dos veces en la tabla y nunca dos veces en el selector:
   * son dos personas jurídicas distintas con la misma marca, y el filtro por producto
   * muestra la prepago para PREPAID y la AGF para INVESTMENT.
   *
   * `code`: como las cooperativas y los emisores solo-crédito, estas entidades no
   * reciben transferencias y no tienen código institucional. Aquí ni siquiera se usa
   * el RUT — no fue verificado ficha por ficha —, así que la llave es `AGF-<slug>`,
   * el mismo recurso honesto que los PSP argentinos (`PSP-<slug>`): decir que la
   * llave es interna en vez de inventar un identificador de regulador.
   *
   * Lista PARCIAL a propósito: las AGF de marca propia que un usuario retail
   * reconoce. Las AGF filiales de un banco (Banchile, BCI AM, Santander AM, BTG,
   * Tanner) no van aquí — su producto INVESTMENT ya cuelga del banco de la marca.
   */
  const CHILE_FUND_MANAGERS: { code: string; name: string; legalName: string }[] = [
    {
      code: "AGF-fintual",
      name: "Fintual",
      legalName: "Fintual Administradora General de Fondos S.A.",
    },
    { code: "AGF-racional", name: "Racional", legalName: "Racional Corredores de Bolsa SpA" },
    { code: "AGF-vector", name: "Vector", legalName: "Vector Capital Corredores de Bolsa S.A." },
    { code: "AGF-renta4", name: "Renta 4", legalName: "Renta 4 Corredores de Bolsa S.A." },
    {
      code: "AGF-larrainvial",
      name: "LarrainVial",
      legalName: "LarrainVial Asset Management Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-principal",
      name: "Principal",
      legalName: "Principal Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-zurich",
      name: "Zurich",
      legalName: "Zurich Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-toesca",
      name: "Toesca",
      legalName: "Toesca Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-ameris",
      name: "Ameris",
      legalName: "Ameris Capital Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-sartor",
      name: "Sartor",
      legalName: "Sartor Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-frontaltrust",
      name: "Frontal Trust",
      legalName: "Frontal Trust Administradora General de Fondos S.A.",
    },
    {
      code: "AGF-credicorp",
      name: "Credicorp Capital",
      legalName: "Credicorp Capital Asset Management Administradora General de Fondos S.A.",
    },
  ];
  for (const f of CHILE_FUND_MANAGERS) {
    const fields = {
      kind: "FUND_MANAGER" as const,
      name: f.name,
      legalName: f.legalName,
      category: null,
      retailFacing: true,
    };
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: f.code } },
      update: fields,
      create: { countryId: chile.id, code: f.code, ...fields },
    });
  }

  await seedInstitutionAccountTypes(chile.id);

  /**
   * Monedas del MVP: la app opera solo en Chile, así que el catálogo son los tres
   * códigos que un usuario chileno usa de verdad. Sembrar los 168 códigos ISO
   * llenaba el selector de monedas que nadie iba a elegir.
   *
   * `CLF` es el código ISO 4217 de la **Unidad de Fomento** — la UF es una unidad
   * de cuenta reajustable, no una moneda que se pueda gastar, y esta app no la
   * convierte a pesos (no hay proveedor de tipo de cambio): un monto en UF se
   * guarda y se muestra en UF.
   */
  const CURRENCIES: [code: string, numeric: string, name: string][] = [
    ["CLP", "152", "Peso chileno"],
    ["CLF", "990", "Unidad de Fomento"],
    ["USD", "840", "Dólar estadounidense"],
  ];

  for (const [code, numeric, name] of CURRENCIES) {
    await prisma.currency.upsert({
      where: { code },
      update: { numeric, name },
      create: { code, numeric, name },
    });
  }

  // Country ↔ currency links (only for the countries we track). isPrimary = main one.
  const LINKS: [alpha2: string, code: string, isPrimary: boolean][] = [
    ["CL", "CLP", true],
    ["CL", "CLF", false],
    // El dólar no es moneda de curso legal en Chile, pero sí se abren cuentas y se
    // ahorra en él, que es lo que este catálogo describe: qué puede elegir el usuario.
    ["CL", "USD", false],
  ];
  for (const [alpha2, code, isPrimary] of LINKS) {
    const country = await prisma.country.findUnique({ where: { alpha2 } });
    const currency = await prisma.currency.findUnique({ where: { code } });
    if (!country || !currency) continue;
    await prisma.countryCurrency.upsert({
      where: { countryId_currencyId: { countryId: country.id, currencyId: currency.id } },
      update: { isPrimary },
      create: { countryId: country.id, currencyId: currency.id, isPrimary },
    });
  }

  // Country ↔ national-identity-document-type links. isPrimary = the country's default type.
  // A country may support more than one (e.g. a national id + passport).
  const IDENTIFIER_LINKS: [
    alpha2: string,
    type: "RUT" | "DNI" | "PASSPORT" | "OTHER",
    isPrimary: boolean,
  ][] = [
    ["CL", "RUT", true],
    ["CL", "PASSPORT", false],
  ];
  for (const [alpha2, identifierType, isPrimary] of IDENTIFIER_LINKS) {
    const country = await prisma.country.findUnique({ where: { alpha2 } });
    if (!country) continue;
    await prisma.countryIdentifierType.upsert({
      where: { countryId_identifierType: { countryId: country.id, identifierType } },
      update: { isPrimary },
      create: { countryId: country.id, identifierType, isPrimary },
    });
  }

  /**
   * El MVP acotó el catálogo a Chile y a tres monedas, así que el seed no basta con
   * dejar de CREAR lo que sobra: una base sembrada antes conserva Argentina y las 168
   * monedas ISO. Se retira explícitamente lo que ya no pertenece al catálogo.
   *
   * Orden obligado por las FK: primero las instituciones de los países que se van
   * (`Country → FinancialInstitution` es Cascade, pero borrar la institución primero
   * deja claro qué se pierde), después los países (arrastran en cascada sus enlaces de
   * moneda e identificación; `User.countryId` y `BankAccount.institutionId` son
   * SetNull, así que ninguna cuenta ni usuario se borra), y al final las monedas.
   * Ver `docs/CATALOGO_REGIONAL.md` para recuperar cualquiera de estos catálogos.
   */
  const KEPT_COUNTRIES = COUNTRIES.map((c) => c.alpha2);
  const KEPT_CURRENCIES = CURRENCIES.map(([code]) => code);
  await prisma.financialInstitution.deleteMany({
    where: { country: { alpha2: { notIn: KEPT_COUNTRIES } } },
  });
  await prisma.country.deleteMany({ where: { alpha2: { notIn: KEPT_COUNTRIES } } });
  await prisma.currency.deleteMany({ where: { code: { notIn: KEPT_CURRENCIES } } });

  console.log(
    `Reference data OK: ${COUNTRIES.length} countries, CL institutions = ${CHILE_BANKS.length} banks + ${CHILE_ISSUERS.length} prepaid issuers + ${CHILE_CREDIT_ISSUERS.length} credit-only issuers + ${CHILE_COOPERATIVES.length} cooperatives + ${CHILE_FUND_MANAGERS.length} fund managers, ${CURRENCIES.length} currencies, ${LINKS.length} country-currency links, ${IDENTIFIER_LINKS.length} country-identifier-type links`,
  );
}

async function main() {
  await seedReferenceData();

  await prisma.user.deleteMany({
    where: { email: { in: [...DEMO_EMAILS] } },
  });

  const passwordHash = await hash(DEMO_PASSWORD, 12);
  await seedFullUser(passwordHash);

  console.log(`Seed OK: ${DEMO_EMAILS[2]}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
