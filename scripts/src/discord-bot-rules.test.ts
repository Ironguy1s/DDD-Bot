import assert from "node:assert/strict";
import test from "node:test";
import {
  getTriggeredReply,
  getSilenceTargetId,
  isAuthorizedUser,
  type BotRules,
} from "./discord-bot-rules.js";

const rules: BotRules = {
  ownerUserId: "222222222222222222",
  timeoutTrigger: {
    userId: "333333333333333333",
    durationSeconds: 60,
  },
  keywordRules: [
    { keywords: ["hello", "good morning"], reply: "First match" },
    { keywords: ["help"], reply: "Help reply" },
  ],
  userIdRules: [
    {
      userId: "123456789012345678",
      replies: ["User-specific reply"],
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

test("allows only the configured owner ID for owner-only commands", () => {
  assert.equal(isAuthorizedUser("222222222222222222", rules.ownerUserId), true);
  assert.equal(isAuthorizedUser("111111111111111111", rules.ownerUserId), false);
  assert.equal(isAuthorizedUser(rules.timeoutTrigger.userId, rules.ownerUserId), false);
});

test("a user-ID reply with a 10 percent chance can trigger", () => {
  const tenPercentRule: BotRules = {
    ...rules,
    userIdRules: [
      {
        userId: "123456789012345678",
        replies: ["shh kid", "come to my party next time"],
        chancePercent: 10,
      },
    ],
  };

  const randomValues = [0.09, 0.1];
  assert.equal(
    getTriggeredReply(
      "any message",
      "123456789012345678",
      tenPercentRule,
      () => randomValues.shift() ?? 0,
    ),
    "shh kid",
  );
});

test("a user-ID reply with a 10 percent chance usually does not trigger", () => {
  const tenPercentRule: BotRules = {
    ...rules,
    userIdRules: [
      {
        userId: "123456789012345678",
        replies: ["shh kid", "come to my party next time"],
        chancePercent: 10,
      },
    ],
  };

  assert.equal(
    getTriggeredReply("any message", "123456789012345678", tenPercentRule, () => 0.1),
    undefined,
  );
});

test("randomly selects the second configured response after the chance succeeds", () => {
  const tenPercentRule: BotRules = {
    ...rules,
    userIdRules: [
      {
        userId: "123456789012345678",
        replies: ["shh kid", "come to my party next time"],
        chancePercent: 10,
      },
    ],
  };
  const randomValues = [0.01, 0.75];

  assert.equal(
    getTriggeredReply(
      "any message",
      "123456789012345678",
      tenPercentRule,
      () => randomValues.shift() ?? 0,
    ),
    "come to my party next time",
  );
});

test("parses a Silence mention only from the authorized sender", () => {
  assert.equal(
    getSilenceTargetId(
      "Silence <@!123456789012345678>",
      rules.timeoutTrigger.userId,
      rules.timeoutTrigger,
    ),
    "123456789012345678",
  );
  assert.equal(
    getSilenceTargetId(
      "Silence <@123456789012345678>",
      "444444444444444444",
      rules.timeoutTrigger,
    ),
    undefined,
  );
});

test("ignores malformed Silence triggers and extra text", () => {
  assert.equal(
    getSilenceTargetId(
      "Silence 123456789012345678",
      rules.timeoutTrigger.userId,
      rules.timeoutTrigger,
    ),
    undefined,
  );
  assert.equal(
    getSilenceTargetId(
      "Silence <@123456789012345678> please",
      rules.timeoutTrigger.userId,
      rules.timeoutTrigger,
    ),
    undefined,
  );
});
