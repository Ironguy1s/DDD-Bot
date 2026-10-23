import assert from "node:assert/strict";
import test from "node:test";
import { getTriggeredReply, type BotRules } from "./discord-bot-rules.js";

const rules: BotRules = {
  keywordRules: [
    { keywords: ["hello", "good morning"], reply: "First match" },
    { keywords: ["help"], reply: "Help reply" },
  ],
  userIdRules: [{ userId: "123456789012345678", reply: "User-specific reply" }],
  cooldownSeconds: 3,
};

test("matches keywords without case sensitivity", () => {
  assert.equal(getTriggeredReply("Well, HELLO there", "111111111111111111", rules), "First match");
});

test("uses the first matching keyword rule", () => {
  assert.equal(getTriggeredReply("hello, can you help?", "111111111111111111", rules), "First match");
});

test("prioritizes a matching user ID over keywords", () => {
  assert.equal(getTriggeredReply("hello", "123456789012345678", rules), "User-specific reply");
});

test("returns no reply when there is no match", () => {
  assert.equal(getTriggeredReply("unmatched message", "111111111111111111", rules), undefined);
});
