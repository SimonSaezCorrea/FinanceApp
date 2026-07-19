import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";

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

  type AcctKey = "checking" | "sight" | "credit" | "cash";
  const initial: Record<AcctKey, number> = {
    checking: 2_800_000,
    sight: 350_000,
    credit: 0,
    cash: 85_000,
  };

  // Transactions keyed by account (ids resolved after accounts are created).
  // Extra cards ("Camila"/"Sofía"/"Rosa") model additional cards the bank issued
  // on the same account/credit line for another person to carry and use.
  type CardKey =
    | "debit"
    | "debitCamila"
    | "debitSofia"
    | "debitRosa"
    | "credit"
    | "creditCamila"
    | "creditSofia";
  type Tx = {
    acct: AcctKey;
    card?: CardKey;
    type: "INCOME" | "EXPENSE";
    amount: number;
    at: string;
    category: string;
    description: string;
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
  ];

  // Net movement per account → reconciled currentBalance.
  const net: Record<AcctKey, number> = { checking: 0, sight: 0, credit: 0, cash: 0 };
  for (const t of TX) net[t.acct] += t.type === "INCOME" ? t.amount : -t.amount;

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
    name: "Banco de Chile",
    type: "CHECKING",
    currency: "CLP",
    institution: "Banco de Chile",
    institutionId: bankId("001"),
    accountNumber: "001-2345678-90",
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  const sight = await mkAccount("sight", {
    userId: javier.id,
    name: "Cuenta Vista",
    type: "SIGHT",
    currency: "CLP",
    institution: "BancoEstado",
    institutionId: bankId("012"),
    accountNumber: "22345678", // Cuenta RUT ≈ RUT sin dígito verificador
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  // Standalone credit card = a CREDIT_LINE account (the pool lives here) + its plastic.
  const credit = await mkAccount("credit", {
    userId: javier.id,
    name: "CMR Falabella",
    type: "CREDIT_LINE",
    currency: "CLP",
    institution: "Falabella",
    institutionId: bankId("051"),
    creditLimit: dec("3000000.0000"),
    creditUsedInitial: dec("0"),
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  const cash = await mkAccount("cash", {
    userId: javier.id,
    name: "Efectivo",
    type: "CASH",
    currency: "CLP",
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  // Foreign-currency accounts (the USD/EUR chips on the dashboard).
  const tenpo = await prisma.bankAccount.create({
    data: {
      userId: javier.id,
      name: "Tenpo Ahorro",
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
      currency: "EUR",
      institution: "Fintual",
      initialBalance: dec("6500.0000"),
      currentBalance: dec("6500.0000"),
    },
  });

  const accId: Record<AcctKey, string> = {
    checking: checking.id,
    sight: sight.id,
    credit: credit.id,
    cash: cash.id,
  };

  // Cards (only last4 stored). The credit card belongs to the CREDIT_LINE account.
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
  const creditCard = await prisma.cardAccount.create({
    data: {
      accountId: credit.id,
      userId: javier.id,
      name: "CMR Visa",
      kind: "CREDIT",
      last4: "4827",
      expiryMonth: 5,
      expiryYear: 2028,
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
    },
  });

  // Curated wallet: two cards + one account (USD), to show both pin types.
  await prisma.walletItemDashboard.createMany({
    data: [
      { userId: javier.id, cardId: creditCard.id, order: 0 },
      { userId: javier.id, cardId: debitCard.id, order: 1 },
      { userId: javier.id, accountId: tenpo.id, order: 2 },
    ],
  });

  const cardIdMap: Record<CardKey, string> = {
    debit: debitCard.id,
    debitCamila: debitCardCamila.id,
    debitSofia: debitCardSofia.id,
    debitRosa: debitCardRosa.id,
    credit: creditCard.id,
    creditCamila: creditCardCamila.id,
    creditSofia: creditCardSofia.id,
  };

  await prisma.transaction.createMany({
    data: TX.map((t) => ({
      userId: javier.id,
      bankAccountId: accId[t.acct],
      cardId: t.card ? cardIdMap[t.card] : undefined,
      type: t.type,
      amount: dec(String(t.amount)),
      currency: "CLP",
      occurredAt: new Date(t.at),
      category: t.category,
      description: t.description,
    })),
  });

  // --- Installment plans (some paid, some upcoming after "today" 2026-06-21) ---
  const notebook = await prisma.installmentPlan.create({
    data: {
      userId: javier.id,
      title: "Notebook ASUS",
      totalPrincipal: dec("1080000.0000"),
      installmentCount: 12,
      startDate: new Date("2026-03-05T00:00:00Z"),
      currency: "CLP",
      notes: "12 cuotas sin interés",
    },
  });
  for (let seq = 1; seq <= 12; seq++) {
    const due = new Date("2026-03-05T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: notebook.id,
        sequence: seq,
        dueDate: due,
        amount: dec("90000.0000"),
        paidAt: seq <= 3 ? new Date(due.getTime() + 86_400_000) : null,
      },
    });
  }
  const fridge = await prisma.installmentPlan.create({
    data: {
      userId: javier.id,
      title: "Refrigerador Mademsa",
      totalPrincipal: dec("360000.0000"),
      installmentCount: 6,
      startDate: new Date("2026-05-10T00:00:00Z"),
      currency: "CLP",
    },
  });
  for (let seq = 1; seq <= 6; seq++) {
    const due = new Date("2026-05-10T00:00:00Z");
    due.setUTCMonth(due.getUTCMonth() + (seq - 1));
    await prisma.installmentPayment.create({
      data: {
        installmentPlanId: fridge.id,
        sequence: seq,
        dueDate: due,
        amount: dec("60000.0000"),
        paidAt: seq === 1 ? new Date(due.getTime() + 86_400_000) : null,
      },
    });
  }

  // --- Debts (both directions; mix of cuotas, simple, settled, multi-currency) ---
  await prisma.debt.createMany({
    data: [
      // OWED_TO_YOU — en cuotas (3/3 aún no pagadas todas → muestra progreso 1/3)
      {
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
      },
      // OWED_TO_YOU — deuda simple (1 cuota → botón "Marcar pagada")
      {
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
      },
      // OWED_TO_YOU — en USD (para mostrar KPI multi-moneda)
      {
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
      },
      // YOU_OWE — en cuotas (2/4 pagadas → barra al 50%)
      {
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
      },
      // YOU_OWE — en cuotas largas (0/6 pagadas → barra en cero)
      {
        userId: javier.id,
        direction: "YOU_OWE",
        counterparty: "Carlos (TV)",
        principal: dec("150000.0000"),
        currency: "CLP",
        openedAt: new Date("2026-06-15T00:00:00Z"),
        totalInstallments: 6,
        paidInstallments: 0,
        installmentAmount: dec("25000.0000"),
      },
      // YOU_OWE — saldada (no debe aparecer en lista activa)
      {
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
    ],
  });

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
        currency: "EUR",
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

/** Reference data (countries + banks). Idempotent: upsert by natural keys. */
async function seedReferenceData() {
  const COUNTRIES = [
    { alpha2: "AR", alpha3: "ARG", numeric: "032", name: "Argentina", callingCode: "+54" },
    { alpha2: "CL", alpha3: "CHL", numeric: "152", name: "Chile", callingCode: "+56" },
    { alpha2: "CO", alpha3: "COL", numeric: "170", name: "Colombia", callingCode: "+57" },
    { alpha2: "PY", alpha3: "PRY", numeric: "600", name: "Paraguay", callingCode: "+595" },
    { alpha2: "PE", alpha3: "PER", numeric: "604", name: "Perú", callingCode: "+51" },
    { alpha2: "PR", alpha3: "PRI", numeric: "630", name: "Puerto Rico", callingCode: "+1" },
  ] as const;

  for (const c of COUNTRIES) {
    await prisma.country.upsert({
      where: { alpha2: c.alpha2 },
      update: { alpha3: c.alpha3, numeric: c.numeric, name: c.name, callingCode: c.callingCode },
      create: c,
    });
  }

  const chile = await prisma.country.findUniqueOrThrow({ where: { alpha2: "CL" } });

  type BankSeed = {
    code: string;
    name: string;
    category: "ESTABLISHED" | "FOREIGN_BRANCH" | "STATE";
    brands?: string[];
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
      name: "Banco de Crédito e Inversiones",
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
    { code: "031", name: "HSBC Bank (Chile)", category: "ESTABLISHED" },
    {
      code: "037",
      name: "Banco Santander-Chile",
      category: "ESTABLISHED",
      brands: ["Banefe"],
    },
    {
      code: "039",
      name: "Banco Itaú Chile",
      category: "ESTABLISHED",
      notes:
        "01-abr-2016: fusión de Banco Corpbanca en Itaú Corpbanca. Res. N°2215 (28-mar-2023): renombrado a Banco Itaú Chile.",
    },
    { code: "051", name: "Banco Falabella", category: "ESTABLISHED" },
    { code: "053", name: "Banco Ripley", category: "ESTABLISHED" },
    { code: "055", name: "Banco Consorcio", category: "ESTABLISHED" },
    { code: "059", name: "Banco BTG Pactual Chile", category: "ESTABLISHED" },
    { code: "062", name: "Tanner Banco Digital", category: "ESTABLISHED" },
    { code: "063", name: "Tenpo Bank Chile", category: "ESTABLISHED" },
    // Sucursales de bancos extranjeros
    { code: "041", name: "JP Morgan Chase Bank, N. A.", category: "FOREIGN_BRANCH" },
    {
      code: "060",
      name: "China Construction Bank, Agencia en Chile",
      category: "FOREIGN_BRANCH",
    },
    { code: "061", name: "Bank of China, Agencia en Chile", category: "FOREIGN_BRANCH" },
    // Bancos estatales
    { code: "012", name: "Banco del Estado de Chile", category: "STATE" },
  ];

  for (const b of CHILE_BANKS) {
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: b.code } },
      update: {
        kind: "BANK",
        name: b.name,
        category: b.category,
        brands: b.brands ?? [],
        notes: b.notes ?? null,
      },
      create: {
        countryId: chile.id,
        kind: "BANK",
        code: b.code,
        name: b.name,
        category: b.category,
        brands: b.brands ?? [],
        notes: b.notes ?? null,
      },
    });
  }

  // Non-bank payment card issuers (emisores de tarjetas de pago con provisión de fondos).
  const CHILE_ISSUERS: { code: string; name: string; rut: string }[] = [
    { code: "741", name: "Compañía Emisora de Medios de Pago Digitales S.A.", rut: "77509915-1" },
    { code: "764", name: "Fintoc Pagos S.A.", rut: "76639633-K" },
    { code: "746", name: "Fintual Prepago S.A.", rut: "77535416-K" },
    { code: "738", name: "Global Card S.A.", rut: "77096794-5" },
    { code: "739", name: "Haulmer Prepago S.A.", rut: "77312496-5" },
    { code: "697", name: "Inversiones LP S.A.", rut: "76265724-4" },
    { code: "732", name: "Los Andes Tarjetas de Prepago S.A.", rut: "76965744-4" },
    { code: "875", name: "Mercado Pago Emisora S.A.", rut: "77214066-5" },
    { code: "747", name: "Metro Emisora de Medios de Pago S.A.", rut: "77057498-6" },
    { code: "882", name: "Pomelo Tech Chile S.A.", rut: "76627434-K" },
    { code: "743", name: "Prex Chile S.A.", rut: "77691219-0" },
    { code: "729", name: "Sociedad Emisora de Tarjetas Los Héroes S.A.", rut: "76965737-1" },
    { code: "744", name: "SumUp Chile Blue S.A.", rut: "77528384-K" },
    { code: "730", name: "Tenpo Payments S.A.", rut: "76967692-9" },
    { code: "699", name: "Tricard S.A.", rut: "96842380-0" },
  ];
  for (const e of CHILE_ISSUERS) {
    await prisma.financialInstitution.upsert({
      where: { countryId_code: { countryId: chile.id, code: e.code } },
      update: { kind: "NON_BANK_ISSUER", name: e.name, rut: e.rut, category: null },
      create: {
        countryId: chile.id,
        kind: "NON_BANK_ISSUER",
        code: e.code,
        name: e.name,
        rut: e.rut,
        category: null,
      },
    });
  }

  // --- Currencies (ISO 4217, deduplicated by alpha code) ---
  const CURRENCIES: [code: string, numeric: string, name: string][] = [
    ["AFN", "971", "Afgani afgano"],
    ["ALL", "008", "Lek"],
    ["EUR", "978", "Euro"],
    ["DZD", "012", "Dinar argelino"],
    ["AOA", "973", "Kwanza angoleño"],
    ["XCD", "951", "Dólar del Caribe Oriental"],
    ["SAR", "682", "Riyal saudí"],
    ["ARS", "032", "Peso argentino"],
    ["AMD", "051", "Dram armenio"],
    ["AWG", "533", "Florín arubeño"],
    ["AUD", "036", "Dólar australiano"],
    ["AZN", "944", "Manat azerbaiyano"],
    ["BSD", "044", "Dólar bahameño"],
    ["BDT", "050", "Taka"],
    ["BBD", "052", "Dólar de Barbados"],
    ["BHD", "048", "Dinar bareiní"],
    ["BZD", "084", "Dólar beliceño"],
    ["XOF", "952", "Franco CFA de África Occidental"],
    ["BMD", "060", "Dólar bermudeño"],
    ["BYR", "974", "Rublo bielorruso"],
    ["MMK", "104", "Kyat birmano"],
    ["BOB", "068", "Boliviano"],
    ["BOV", "984", "Mvdol"],
    ["USD", "840", "Dólar estadounidense"],
    ["BAM", "977", "Marco bosnioherzegovino"],
    ["BWP", "072", "Pula"],
    ["BRL", "986", "Real brasileño"],
    ["BND", "096", "Dólar de Brunei"],
    ["BGN", "975", "Lev"],
    ["BIF", "108", "Franco burundés"],
    ["BTN", "064", "Ngultrum butanés"],
    ["INR", "356", "Rupia india"],
    ["CVE", "132", "Escudo caboverdiano"],
    ["KHR", "116", "Riel camboyano"],
    ["XAF", "950", "Franco CFA de África Central"],
    ["CAD", "124", "Dólar canadiense"],
    ["CLF", "990", "Unidad de Fomento"],
    ["CLP", "152", "Peso chileno"],
    ["CNY", "156", "Renminbi"],
    ["COP", "170", "Peso colombiano"],
    ["COU", "970", "Unidad de valor real"],
    ["KMF", "174", "Franco comorense"],
    ["CDF", "976", "Franco congoleño"],
    ["CRC", "188", "Colón costarricense"],
    ["HRK", "191", "Kuna"],
    ["CUC", "931", "Peso convertible"],
    ["CUP", "192", "Peso cubano"],
    ["ANG", "532", "Florín antillano neerlandés"],
    ["DKK", "208", "Corona danesa"],
    ["EGP", "818", "Libra egipcia"],
    ["SVC", "222", "Colón salvadoreño"],
    ["AED", "784", "Dírham de EAU"],
    ["ERN", "232", "Nakfa"],
    ["ETB", "230", "Birr etíope"],
    ["FJD", "242", "Dólar fiyiano"],
    ["PHP", "608", "Peso filipino"],
    ["XDR", "960", "SDR (Derecho Especial de Giro)"],
    ["GMD", "270", "Dalasi"],
    ["GEL", "981", "Lari"],
    ["GHS", "936", "Cedi"],
    ["GIP", "292", "Libra gibraltareña"],
    ["GTQ", "320", "Quetzal"],
    ["GBP", "826", "Libra esterlina"],
    ["GNF", "324", "Franco guineano"],
    ["GYD", "328", "Dólar guyanés"],
    ["HTG", "332", "Gourde"],
    ["HNL", "340", "Lempira"],
    ["HKD", "344", "Dólar de Hong Kong"],
    ["HUF", "348", "Forinto húngaro"],
    ["IDR", "360", "Rupia indonesia"],
    ["IQD", "368", "Dinar iraquí"],
    ["NOK", "578", "Corona noruega"],
    ["ISK", "352", "Corona islandesa"],
    ["KYD", "136", "Dólar de las Islas Caimán"],
    ["NZD", "554", "Dólar neozelandés"],
    ["FKP", "238", "Libra malvinense"],
    ["SBD", "090", "Dólar de las Islas Salomón"],
    ["ILS", "376", "Nuevo séquel israelí"],
    ["JMD", "388", "Dólar jamaiquino"],
    ["JPY", "392", "Yen"],
    ["JOD", "400", "Dinar jordano"],
    ["KZT", "398", "Tenge kazajo"],
    ["KES", "404", "Chelín keniano"],
    ["KGS", "417", "Som kirguís"],
    ["KWD", "414", "Dinar kuwaití"],
    ["LSL", "426", "Loti"],
    ["ZAR", "710", "Rand"],
    ["LRD", "430", "Dólar liberiano"],
    ["LYD", "434", "Dinar libio"],
    ["CHF", "756", "Franco suizo"],
    ["LBP", "422", "Libra libanesa"],
    ["MOP", "446", "Pataca"],
    ["MKD", "807", "Dinar macedonio"],
    ["MGA", "969", "Ariary malgache"],
    ["MYR", "458", "Ringgit malayo"],
    ["MWK", "454", "Kwacha malauí"],
    ["MVR", "462", "Rufiyaa de Maldivas"],
    ["MAD", "504", "Dírham marroquí"],
    ["MUR", "480", "Rupia de Mauricio"],
    ["MRO", "478", "Uguiya"],
    ["MNT", "496", "Tugrik"],
    ["MZN", "943", "Metical mozambiqueño"],
    ["MXN", "484", "Peso mexicano"],
    ["MXV", "979", "Unidad de Inversión Mexicana (UDI)"],
    ["NAD", "516", "Dólar de Namibia"],
    ["NPR", "524", "Rupia nepalí"],
    ["NIO", "558", "Córdoba oro"],
    ["NGN", "566", "Naira"],
    ["XPF", "953", "Franco CFP"],
    ["OMR", "512", "Rial omaní"],
    ["XUA", "965", "BAD Unidad de Cuenta"],
    ["PKR", "586", "Rupia pakistaní"],
    ["PAB", "590", "Balboa"],
    ["PGK", "598", "Kina"],
    ["PYG", "600", "Guaraní"],
    ["PEN", "604", "Sol"],
    ["PLN", "985", "Zloty"],
    ["QAR", "634", "Riyal catarí"],
    ["LAK", "418", "Kip laosiano"],
    ["VEF", "937", "Bolívar"],
    ["CZK", "203", "Corona checa"],
    ["KRW", "410", "Won surcoreano"],
    ["MDL", "498", "Leu moldavo"],
    ["KPW", "408", "Won norcoreano"],
    ["DOP", "214", "Peso dominicano"],
    ["IRR", "364", "Rial iraní"],
    ["TZS", "834", "Chelín tanzano"],
    ["SYP", "760", "Libra siria"],
    ["RWF", "646", "Franco ruandés"],
    ["RON", "946", "Leu rumano"],
    ["RUB", "643", "Rublo ruso"],
    ["WST", "882", "Tala"],
    ["STD", "678", "Dobra"],
    ["SHP", "654", "Libra de Santa Helena"],
    ["RSD", "941", "Dinar serbio"],
    ["SCR", "690", "Rupia de Seychelles"],
    ["SLL", "694", "Leone"],
    ["SGD", "702", "Dólar de Singapur"],
    ["XSU", "994", "Sucre"],
    ["SOS", "706", "Chelín somalí"],
    ["LKR", "144", "Rupia de Sri Lanka"],
    ["SZL", "748", "Lilangeni"],
    ["SDG", "938", "Libra sudanesa"],
    ["SSP", "728", "Libra sursudanesa"],
    ["SEK", "752", "Corona sueca"],
    ["CHE", "947", "WIR Euro"],
    ["CHW", "948", "Franco WIR"],
    ["SRD", "968", "Dólar surinamés"],
    ["THB", "764", "Baht"],
    ["TWD", "901", "Nuevo dólar taiwanés"],
    ["TJS", "972", "Somoni"],
    ["TOP", "776", "Pa'anga"],
    ["TTD", "780", "Dólar de Trinidad y Tobago"],
    ["TMT", "934", "Manat turcomano"],
    ["TRY", "949", "Lira turca"],
    ["TND", "788", "Dinar tunecino"],
    ["UGX", "800", "Chelín ugandés"],
    ["UAH", "980", "Grivna"],
    ["UYI", "940", "Peso uruguayo en unidades indexadas"],
    ["UYU", "858", "Peso uruguayo"],
    ["UZS", "860", "Som uzbeko"],
    ["VUV", "548", "Vatu"],
    ["VND", "704", "Dong"],
    ["YER", "886", "Rial yemení"],
    ["DJF", "262", "Franco yibutiano"],
    ["ZMW", "967", "Kwacha zambiano"],
    ["ZWL", "932", "Dólar zimbabuense"],
    ["USN", "997", "Dólar estadounidense (día siguiente)"],
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
    ["AR", "ARS", true],
    ["CL", "CLP", true],
    ["CL", "CLF", false],
    ["CO", "COP", true],
    ["CO", "COU", false],
    ["PY", "PYG", true],
    ["PE", "PEN", true],
    ["PR", "USD", true],
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
    ["AR", "DNI", true],
    ["AR", "PASSPORT", false],
    ["CL", "RUT", true],
    ["CL", "PASSPORT", false],
    ["CO", "DNI", true],
    ["CO", "PASSPORT", false],
    ["PY", "DNI", true],
    ["PY", "PASSPORT", false],
    ["PE", "DNI", true],
    ["PE", "PASSPORT", false],
    ["PR", "PASSPORT", true],
    ["PR", "OTHER", false],
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

  console.log(
    `Reference data OK: ${COUNTRIES.length} countries, ${CHILE_BANKS.length} banks + ${CHILE_ISSUERS.length} non-bank issuers (CL), ${CURRENCIES.length} currencies, ${LINKS.length} country-currency links, ${IDENTIFIER_LINKS.length} country-identifier-type links`,
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
