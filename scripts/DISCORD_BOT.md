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
      "replies": [
        "I noticed your message.",
        "Hello again!"
      ],
      "chancePercent": 10
    }
  ],
  "cooldownSeconds": 3
}
```

For a user-ID rule, `replies` is an array and the bot randomly chooses one after the rule triggers. `chancePercent` is optional and defaults to `100`; set it from `0` to `100` to control how often it replies. `cooldownSeconds` limits replies to one per user during that interval; set it to `0` to disable the cooldown. Restart the **Discord Bot** workflow after changing rules.

## Owner-only `/say`

The bot registers `/say message:<text>` when it starts. It posts the supplied text in the current server channel and gives you a private confirmation. Other users can see the command, but the bot will not send their messages and will show them a private denial. The command uses `ownerUserId` from the rules file for this check. Mentions are disabled in sent messages.

## Discord setup

1. In the Discord Developer Portal, create an application and add a bot.
2. Under **Bot**, enable **Message Content Intent**. The bot uses this to read message text.
3. Invite it to your server using the OAuth2 URL Generator with the `bot` and `applications.commands` scopes and the `View Channels` and `Send Messages` permissions.
4. Keep the bot token in Replit Secrets as `DISCORD_BOT_TOKEN`. Never put it in the rules file or source code.
5. Start the **Discord Bot** workflow.

The bot replies in the channel where a matching server message was sent. Replies do not ping users or roles. Global slash-command registration may take a short time to appear in Discord.

## Run locally / checks

- `pnpm --filter @workspace/scripts run discord-bot`
- `pnpm --filter @workspace/scripts run typecheck`
- `pnpm --filter @workspace/scripts run test:discord-bot`
