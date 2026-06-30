import { PrismaClient, Prisma } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

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
  const javier = await prisma.user.create({
    data: { email: "test@finance.local", name: "Javier Torres", passwordHash },
  });

  type AcctKey = "checking" | "vista" | "credit" | "cash";
  const initial: Record<AcctKey, number> = {
    checking: 2_800_000,
    vista: 350_000,
    credit: 0,
    cash: 85_000,
  };

  // Transactions keyed by account (ids resolved after accounts are created).
  type CardKey = "debit" | "credit";
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

    // --- Vista (BancoEstado): small spends — no card linked to this account ---
    {
      acct: "vista",
      type: "EXPENSE",
      amount: 8_900,
      at: "2026-06-14T13:00:00Z",
      category: "Transporte",
      description: "Uber",
    },
    {
      acct: "vista",
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
  ];

  // Net movement per account → reconciled currentBalance.
  const net: Record<AcctKey, number> = { checking: 0, vista: 0, credit: 0, cash: 0 };
  for (const t of TX) net[t.acct] += t.type === "INCOME" ? t.amount : -t.amount;
  const creditUsed = -net.credit; // credit account only has expenses

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
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  const vista = await mkAccount("vista", {
    userId: javier.id,
    name: "Cuenta Vista",
    type: "VISTA",
    currency: "CLP",
    institution: "BancoEstado",
    initialBalance: dec("0"),
    currentBalance: dec("0"),
  });
  const credit = await mkAccount("credit", {
    userId: javier.id,
    name: "CMR Falabella",
    type: "CREDIT_CARD",
    currency: "CLP",
    institution: "Falabella",
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
      initialBalance: dec("4200.0000"),
      currentBalance: dec("4200.0000"),
    },
  });
  await prisma.bankAccount.create({
    data: {
      userId: javier.id,
      name: "Fintual Global",
      type: "OTHER",
      currency: "EUR",
      institution: "Fintual",
      initialBalance: dec("6500.0000"),
      currentBalance: dec("6500.0000"),
    },
  });

  const accId: Record<AcctKey, string> = {
    checking: checking.id,
    vista: vista.id,
    credit: credit.id,
    cash: cash.id,
  };

  // Cards (only last4 stored).
  const debitCard = await prisma.card.create({
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
  const creditCard = await prisma.card.create({
    data: {
      accountId: credit.id,
      userId: javier.id,
      name: "CMR Visa",
      kind: "CREDIT",
      last4: "4827",
      expiryMonth: 5,
      expiryYear: 2028,
      limits: {
        create: [{ currency: "CLP", limit: dec("3000000.0000"), used: dec(String(creditUsed)) }],
      },
    },
  });

  // Curated wallet: two cards + one account (USD), to show both pin types.
  await prisma.walletItem.createMany({
    data: [
      { userId: javier.id, cardId: creditCard.id, order: 0 },
      { userId: javier.id, cardId: debitCard.id, order: 1 },
      { userId: javier.id, accountId: tenpo.id, order: 2 },
    ],
  });

  const cardIdMap: Record<CardKey, string> = { debit: debitCard.id, credit: creditCard.id };

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

async function main() {
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
