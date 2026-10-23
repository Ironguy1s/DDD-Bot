import assert from "node:assert/strict";
import test from "node:test";
import {
  getTriggeredReply,
  isBotOwner,
  type BotRules,
} from "./discord-bot-rules.js";

const rules: BotRules = {
  ownerUserId: "222222222222222222",
  keywordRules: [
    { keywords: ["hello", "good morning"], reply: "First match" },
    { keywords: ["help"], reply: "Help reply" },
  ],
  userIdRules: [
    {
      userId: "123456789012345678",
      reply: "User-specific reply",
      chancePercent: 100,
    },
  ],
  cooldownSeconds: 3,
};

test("matches keywords without case sensitivity", () => {
  assert.equal(getTriggeredReply("Well, HELLO there", "111111111111111111", rules), "First match");
});

test("uses the first matching keyword rule", () => {
  assert.equal(getTriggeredReply("hello, can you help?", "111111111111111111", rules), "First match");
});

test("prioritizes a matching user ID over keywords", () => {
  assert.equal(
    getTriggeredReply("hello", "123456789012345678", rules),
    "User-specific reply",
  );
});

test("returns no reply when there is no match", () => {
  assert.equal(getTriggeredReply("unmatched message", "111111111111111111", rules), undefined);
});

test("allows only the configured owner ID", () => {
  assert.equal(isBotOwner("222222222222222222", rules.ownerUserId), true);
  assert.equal(isBotOwner("111111111111111111", rules.ownerUserId), false);
});

test("a user-ID reply with a 10 percent chance can trigger", () => {
  const tenPercentRule: BotRules = {
    ...rules,
    userIdRules: [
      {
        userId: "123456789012345678",
        reply: "shh kid",
        chancePercent: 10,
      },
    ],
  };

  assert.equal(
    getTriggeredReply("any message", "123456789012345678", tenPercentRule, () => 0.09),
    "shh kid",
  );
});

test("a user-ID reply with a 10 percent chance usually does not trigger", () => {
  const tenPercentRule: BotRules = {
    ...rules,
    userIdRules: [
      {
        userId: "123456789012345678",
        reply: "shh kid",
        chancePercent: 10,
      },
    ],
  };

  assert.equal(
    getTriggeredReply("any message", "123456789012345678", tenPercentRule, () => 0.1),
    undefined,
  );
});
