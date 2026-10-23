import { Client, Events, GatewayIntentBits } from "discord.js";
import { getTriggeredReply, loadBotRules } from "./discord-bot-rules.js";

async function startBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is missing. Add it in Replit Secrets to run the bot.");
  }

  const rules = await loadBotRules();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  const lastReplyAtByUser = new Map<string, number>();
  const cooldownMs = rules.cooldownSeconds * 1000;

  client.once(Events.ClientReady, (readyClient) => {
    console.info(`Discord bot is online as ${readyClient.user.tag}.`);
    console.info(
      `Loaded ${rules.keywordRules.length} keyword rule(s) and ${rules.userIdRules.length} user ID rule(s).`,
    );
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;

    const reply = getTriggeredReply(message.content, message.author.id, rules);
    if (!reply) return;

    const now = Date.now();
    const lastReplyAt = lastReplyAtByUser.get(message.author.id) ?? 0;
    if (cooldownMs > 0 && now - lastReplyAt < cooldownMs) return;

    try {
      await message.reply({
        content: reply,
        allowedMentions: { parse: [] },
      });
      lastReplyAtByUser.set(message.author.id, now);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Discord API error";
      console.error(`Could not send a reply: ${detail}`);
    }
  });

  client.on(Events.Error, (error) => {
    console.error(`Discord client error: ${error.message}`);
  });

  await client.login(token);
}

startBot().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Discord bot failed to start: ${detail}`);
  process.exitCode = 1;
});
