import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface KeywordRule {
  keywords: string[];
  reply: string;
}

export interface UserIdRule {
  userId: string;
  replies: string[];
  chancePercent: number;
}

export interface TimeoutTriggerRule {
  userId: string;
  durationSeconds: number;
}

export interface BotRules {
  ownerUserId: string;
  timeoutTrigger: TimeoutTriggerRule;
  keywordRules: KeywordRule[];
  userIdRules: UserIdRule[];
  cooldownSeconds: number;
}

const rulesPath = new URL("../config/discord-bot.rules.json", import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readReplyRule(value: unknown, label: string): string {
  if (!isRecord(value) || typeof value.reply !== "string" || !value.reply.trim()) {
    throw new Error(`${label} must include a non-empty "reply" string.`);
  }

  return value.reply.trim();
}

function readRepliesRule(value: unknown, label: string): string[] {
  if (!isRecord(value) || !Array.isArray(value.replies) || value.replies.length === 0) {
    throw new Error(`${label} must include a non-empty "replies" array.`);
  }

  return value.replies.map((reply) => {
    if (typeof reply !== "string" || !reply.trim()) {
      throw new Error(`${label} replies must be non-empty strings.`);
    }
    return reply.trim();
  });
}

function parseBotRules(value: unknown): BotRules {
  if (!isRecord(value)) {
    throw new Error("The bot rules file must contain a JSON object.");
  }

  if (!Array.isArray(value.keywordRules)) {
    throw new Error('"keywordRules" must be an array.');
  }

  if (!Array.isArray(value.userIdRules)) {
    throw new Error('"userIdRules" must be an array.');
  }

  if (typeof value.ownerUserId !== "string" || !/^\d{17,20}$/.test(value.ownerUserId)) {
    throw new Error('"ownerUserId" must be a Discord user ID made of 17–20 digits.');
  }

  if (!isRecord(value.timeoutTrigger)) {
    throw new Error('"timeoutTrigger" must be an object.');
  }

  if (
    typeof value.timeoutTrigger.userId !== "string" ||
    !/^\d{17,20}$/.test(value.timeoutTrigger.userId)
  ) {
    throw new Error('"timeoutTrigger.userId" must be a Discord user ID made of 17–20 digits.');
  }

  const timeoutDurationSeconds = value.timeoutTrigger.durationSeconds;
  if (
    typeof timeoutDurationSeconds !== "number" ||
    !Number.isInteger(timeoutDurationSeconds) ||
    timeoutDurationSeconds < 1 ||
    timeoutDurationSeconds > 28 * 24 * 60 * 60
  ) {
    throw new Error('"timeoutTrigger.durationSeconds" must be an integer from 1 to 28 days.');
  }

  const keywordRules = value.keywordRules.map((rule, index): KeywordRule => {
    const label = `keywordRules[${index}]`;
    if (!isRecord(rule) || !Array.isArray(rule.keywords) || rule.keywords.length === 0) {
      throw new Error(`${label} must include a non-empty "keywords" array.`);
    }

    const keywords = rule.keywords.map((keyword) => {
      if (typeof keyword !== "string" || !keyword.trim()) {
        throw new Error(`${label} keywords must be non-empty strings.`);
      }
      return keyword.trim();
    });

    return { keywords, reply: readReplyRule(rule, label) };
  });

  const userIdRules = value.userIdRules.map((rule, index): UserIdRule => {
    const label = `userIdRules[${index}]`;
    if (!isRecord(rule) || typeof rule.userId !== "string" || !/^\d{17,20}$/.test(rule.userId)) {
      throw new Error(`${label} must include a Discord user ID made of 17–20 digits.`);
    }

    const chancePercent = rule.chancePercent ?? 100;
    if (
      typeof chancePercent !== "number" ||
      !Number.isFinite(chancePercent) ||
      chancePercent < 0 ||
      chancePercent > 100
    ) {
      throw new Error(`${label} "chancePercent" must be a number from 0 to 100.`);
    }

    return {
      userId: rule.userId,
      replies: readRepliesRule(rule, label),
      chancePercent,
    };
  });

  const cooldownSeconds = value.cooldownSeconds;
  if (
    typeof cooldownSeconds !== "number" ||
    !Number.isFinite(cooldownSeconds) ||
    cooldownSeconds < 0 ||
    cooldownSeconds > 3600
  ) {
    throw new Error('"cooldownSeconds" must be a number from 0 to 3600.');
  }

  return {
    ownerUserId: value.ownerUserId,
    timeoutTrigger: {
      userId: value.timeoutTrigger.userId,
      durationSeconds: timeoutDurationSeconds,
    },
    keywordRules,
    userIdRules,
    cooldownSeconds,
  };
}

export async function loadBotRules(): Promise<BotRules> {
  let raw: string;
  try {
    raw = await readFile(fileURLToPath(rulesPath), "utf8");
  } catch (error) {
    throw new Error("Could not read scripts/config/discord-bot.rules.json.", { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("The Discord bot rules file is not valid JSON.", { cause: error });
  }

  return parseBotRules(parsed);
}

export function getTriggeredReply(
  messageContent: string,
  authorId: string,
  rules: BotRules,
  random: () => number = Math.random,
): string | undefined {
  const userRule = rules.userIdRules.find((rule) => rule.userId === authorId);
  if (userRule) {
    if (random() >= userRule.chancePercent / 100) return undefined;
    const responseIndex = Math.floor(random() * userRule.replies.length);
    return userRule.replies[responseIndex];
  }

  const normalizedContent = messageContent.toLowerCase();
  const keywordRule = rules.keywordRules.find((rule) =>
    rule.keywords.some((keyword) =>
      normalizedContent.includes(keyword.toLowerCase()),
    ),
  );

  return keywordRule?.reply;
}

export function isAuthorizedUser(userId: string, authorizedUserId: string): boolean {
  return userId === authorizedUserId;
}

export function getSilenceTargetId(
  messageContent: string,
  authorId: string,
  timeoutTrigger: TimeoutTriggerRule,
): string | undefined {
  if (authorId !== timeoutTrigger.userId) return undefined;

  const match = /^silence\s+<@!?(\d{17,20})>$/i.exec(messageContent.trim());
  return match?.[1];
}
