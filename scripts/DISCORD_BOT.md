# Discord keyword bot

This bot watches server messages and replies when a configured keyword or user ID matches. It ignores messages from bots and does not respond in direct messages.

## Add rules

Edit `scripts/config/discord-bot.rules.json`. Matching is case-insensitive and checks whether a keyword appears anywhere in a message. The first matching keyword rule is used. A matching user ID rule takes priority.

```json
{
  "keywordRules": [
    {
      "keywords": ["hello", "good morning"],
      "reply": "Hi there!"
    }
  ],
  "userIdRules": [
    {
      "userId": "123456789012345678",
      "reply": "I noticed your message."
    }
  ],
  "cooldownSeconds": 3
}
```

Use empty arrays until you are ready to add rules. `cooldownSeconds` limits replies to one per user during that interval; set it to `0` to disable the cooldown. Restart the **Discord Bot** workflow after changing rules.

## Discord setup

1. In the Discord Developer Portal, create an application and add a bot.
2. Under **Bot**, enable **Message Content Intent**. The bot uses this to read message text.
3. Invite it to your server using the OAuth2 URL Generator with the `bot` scope and the `View Channels` and `Send Messages` permissions.
4. Keep the bot token in Replit Secrets as `DISCORD_BOT_TOKEN`. Never put it in the rules file or source code.
5. Start the **Discord Bot** workflow.

The bot replies in the channel where a matching server message was sent. Replies do not ping users or roles.

## Run locally / checks

- `pnpm --filter @workspace/scripts run discord-bot`
- `pnpm --filter @workspace/scripts run typecheck`
- `pnpm --filter @workspace/scripts run test:discord-bot`
