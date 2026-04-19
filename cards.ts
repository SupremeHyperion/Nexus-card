import { Router, type IRouter } from "express";
import { eq, desc, sql, ilike } from "drizzle-orm";
import { db, cardsTable, uploadLimitsTable, promoUsageTable } from "@workspace/db";
import {
  ListCardsQueryParams,
  CreateCardBody,
  DeleteCardParams,
  DeleteCardHeader,
  VerifyAdminBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

const DAILY_LIMIT = 5;
const ADMIN_PASSWORD = "GigaCiao14";
const PROMO_CODE = "Nexus card";

interface RarityEntry {
  rarity: string;
  weight: number;
  hpMin: number;
  hpMax: number;
  atkMin: number;
  atkMax: number;
  manaOptions: number[];
  atkRangeOptions: number[];
}

const RARITY_TABLE: RarityEntry[] = [
  { rarity: "Common",    weight: 50,  hpMin: 60,  hpMax: 90,  atkMin: 30,  atkMax: 50,  manaOptions: [1, 2], atkRangeOptions: [1, 2] },
  { rarity: "Rare",      weight: 30,  hpMin: 100, hpMax: 130, atkMin: 60,  atkMax: 80,  manaOptions: [3],    atkRangeOptions: [2, 3] },
  { rarity: "Mythic",    weight: 15,  hpMin: 140, hpMax: 170, atkMin: 90,  atkMax: 120, manaOptions: [4],    atkRangeOptions: [3, 4] },
  { rarity: "Legendary", weight: 4.5, hpMin: 180, hpMax: 220, atkMin: 140, atkMax: 170, manaOptions: [6],    atkRangeOptions: [4, 5] },
  { rarity: "SSR",       weight: 0.5, hpMin: 250, hpMax: 250, atkMin: 200, atkMax: 200, manaOptions: [8],    atkRangeOptions: [5]    },
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollRarity(): RarityEntry {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const entry of RARITY_TABLE) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry;
  }
  return RARITY_TABLE[0];
}

function buildStats(entry: RarityEntry) {
  return {
    hp: randInt(entry.hpMin, entry.hpMax),
    atk: randInt(entry.atkMin, entry.atkMax),
    mana: pick(entry.manaOptions),
    atkRange: pick(entry.atkRangeOptions),
  };
}

function getClientIp(req: any): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// ── NUOVA ROTTA: Statistiche Profilo (PER IL NUMERO CARTE) ──────────────────

router.get("/profile/stats", async (req, res): Promise<void> => {
  try {
    const ip = getClientIp(req);
    const userCards = await db.select().from(cardsTable).where(eq(cardsTable.creatorIp, ip));

    res.json({
      count: userCards.length,
      username: "HYPERION"
    });
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero statistiche" });
  }
});

// ── Promo code validation ─────────────────────────────────────────────────────

router.post("/promo/validate", async (req, res): Promise<void> => {
  const { code } = req.body || {};
  if (!code || code !== PROMO_CODE) {
    res.status(400).json({ valid: false, message: "Invalid promo code." });
    return;
  }

  const ip = getClientIp(req);
  const [used] = await db.select().from(promoUsageTable).where(eq(promoUsageTable.ip, ip));

  res.json({
    valid: true,
    customStatsAvailable: !used,
    message: used
      ? "You have already used your custom card power!"
      : "Promo code accepted! Unlimited packs unlocked and custom stats available for your next card.",
  });
});

// ── Card list ─────────────────────────────────────────────────────────────────

router.get("/", async (req, res): Promise<void> => {
  const params = ListCardsQueryParams.safeParse(req.query);
  const sort = params.success ? params.data.sort : "newest";
  const search = params.success ? params.data.search : undefined;

  let query = db.select().from(cardsTable);
  if (search) query = query.where(ilike(cardsTable.name, `%${search}%`)) as any;
  if (sort === "strongest") {
    query = query.orderBy(desc(sql`${cardsTable.hp} + ${cardsTable.atk}`)) as any;
  } else {
    query = query.orderBy(desc(cardsTable.createdAt)) as any;
  }

  const cards = await query;
  res.json(cards.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

// ── Card creation ─────────────────────────────────────────────────────────────

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const ip = getClientIp(req);
  const isAdmin = req.headers["x-admin-password"] === ADMIN_PASSWORD;
  const isPromo = req.headers["x-promo-code"] === PROMO_CODE;
  const bypassLimit = isAdmin || isPromo;

  if (!bypassLimit) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [limit] = await db.select().from(uploadLimitsTable).where(eq(uploadLimitsTable.ip, ip));

    if (limit) {
      if (limit.windowStart > windowStart) {
        if (limit.uploadCount >= DAILY_LIMIT) {
          const resetAt = new Date(limit.windowStart.getTime() + 24 * 60 * 60 * 1000);
          res.status(429).json({ error: `Daily limit reached. Resets at ${resetAt.toISOString()}` });
          return;
        }
        await db.update(uploadLimitsTable).set({ uploadCount: limit.uploadCount + 1 }).where(eq(uploadLimitsTable.id, limit.id));
      } else {
        await db.update(uploadLimitsTable).set({ uploadCount: 1, windowStart: now }).where(eq(uploadLimitsTable.id, limit.id));
      }
    } else {
      await db.insert(uploadLimitsTable).values({ ip, uploadCount: 1, windowStart: now });
    }
  }

  const { name, imageObjectPath, rarity: manualRarity, hp: manualHp, atk: manualAtk, atkRange: manualAtkRange, mana: manualMana } = parsed.data;

  const existing = await db.select().from(cardsTable).where(eq(cardsTable.name, name));
  if (existing.length > 0) {
    const card = existing[0];
    const [updated] = await db
      .update(cardsTable)
      .set({ hp: card.hp + 10, atk: card.atk + 10, level: card.level + 1, imageUrl: imageObjectPath })
      .where(eq(cardsTable.id, card.id))
      .returning();
    res.status(201).json({ ...updated, createdAt: updated.createdAt.toISOString() });
    return;
  }

  if (isAdmin && manualRarity && manualHp !== undefined && manualAtk !== undefined && manualAtkRange !== undefined && manualMana !== undefined) {
    const [card] = await db
      .insert(cardsTable)
      .values({ name, imageUrl: imageObjectPath, rarity: manualRarity, hp: manualHp, atk: manualAtk, atkRange: manualAtkRange, mana: manualMana, level: 1, creatorIp: ip })
      .returning();
    res.status(201).json({ ...card, createdAt: card.createdAt.toISOString() });
    return;
  }

  const rarityEntry = rollRarity();
  const stats = buildStats(rarityEntry);
  const [card] = await db
    .insert(cardsTable)
    .values({ name, imageUrl: imageObjectPath, rarity: rarityEntry.rarity, ...stats, level: 1, creatorIp: ip })
    .returning();
  res.status(201).json({ ...card, createdAt: card.createdAt.toISOString() });
});

// ── Altre utility ─────────────────────────────────────────────────────────────

router.get("/hall-of-fame", async (_req, res): Promise<void> => {
  const cards = await db
    .select()
    .from(cardsTable)
    .orderBy(desc(sql`${cardsTable.hp} + ${cardsTable.atk}`))
    .limit(3);
  res.json(cards.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.get("/remaining", async (req, res): Promise<void> => {
  const ip = getClientIp(req);
  const now = new Date();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [limit] = await db.select().from(uploadLimitsTable).where(eq(uploadLimitsTable.ip, ip));

  if (!limit || limit.windowStart <= windowStart) {
    res.json({ remaining: DAILY_LIMIT, total: DAILY_LIMIT, resetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() });
    return;
  }

  const remaining = Math.max(0, DAILY_LIMIT - limit.uploadCount);
  const resetAt = new Date(limit.windowStart.getTime() + 24 * 60 * 60 * 1000);
  res.json({ remaining, total: DAILY_LIMIT, resetAt: resetAt.toISOString() });
});

export default router;
