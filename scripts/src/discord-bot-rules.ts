import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface KeywordRule {
  keywords: string[];
  reply: string;
}

export interface UserIdRule {
  userId: string;
  reply: string;
}

export interface BotRules {
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

    return { userId: rule.userId, reply: readReplyRule(rule, label) };
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

  return { keywordRules, userIdRules, cooldownSeconds };
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
): string | undefined {
  const userRule = rules.userIdRules.find((rule) => rule.userId === authorId);
  if (userRule) return userRule.reply;

  const normalizedContent = messageContent.toLowerCase();
  const keywordRule = rules.keywordRules.find((rule) =>
    rule.keywords.some((keyword) =>
      normalizedContent.includes(keyword.toLowerCase()),
    ),
  );

  return keywordRule?.reply;
}
