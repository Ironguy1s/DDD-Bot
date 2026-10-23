import {
  ApplicationCommandOptionType,
  Client,
  Events,
  GatewayIntentBits,
  type Message,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import {
  getSilenceTargetId,
  getTriggeredReply,
  isBotOwner,
  loadBotRules,
} from "./discord-bot-rules.js";

const sayCommand = {
  name: "say",
  description: "Send a message as the bot in this channel",
  options: [
    {
      name: "message",
      description: "The message the bot should send",
      type: ApplicationCommandOptionType.String,
      required: true,
      max_length: 2000,
    },
  ],
} satisfies RESTPostAPIChatInputApplicationCommandsJSONBody;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Discord API error";
}

async function replyWithoutPings(message: Message, content: string): Promise<void> {
  try {
    await message.reply({
      content,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error(`Could not send a bot reply: ${getErrorMessage(error)}`);
  }
}

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

  client.once(Events.ClientReady, async (readyClient) => {
    console.info(`Discord bot is online as ${readyClient.user.tag}.`);
    console.info(
      `Loaded ${rules.keywordRules.length} keyword rule(s) and ${rules.userIdRules.length} user ID rule(s).`,
    );

    try {
      const existingCommands = await readyClient.application.commands.fetch();
      const existingSayCommand = existingCommands.find((command) => command.name === "say");
      if (existingSayCommand) {
        await readyClient.application.commands.edit(existingSayCommand.id, sayCommand);
      } else {
        await readyClient.application.commands.create(sayCommand);
      }
      console.info("The /say command is registered.");
    } catch (error) {
      console.error(`Could not register /say: ${getErrorMessage(error)}`);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;

    const trimmedContent = message.content.trim();
    const isTimeoutRequest = /^time\s+out\b/i.test(trimmedContent);
    if (message.author.id === rules.timeoutTrigger.userId && isTimeoutRequest) {
      const targetId = getSilenceTargetId(
        trimmedContent,
        message.author.id,
        rules.timeoutTrigger,
      );

      if (
        !targetId ||
        message.mentions.users.size !== 1 ||
        !message.mentions.users.has(targetId)
      ) {
        await replyWithoutPings(
          message,
          "Use `time out @member` with exactly one real member mention.",
        );
        return;
      }

      let target;
      try {
        target = await message.guild.members.fetch(targetId);
      } catch (error) {
        console.error(`Could not find the requested timeout target: ${getErrorMessage(error)}`);
        await replyWithoutPings(message, "I couldn't find that member in this server.");
        return;
      }

      if (
        target.id === message.author.id ||
        target.id === message.guild.ownerId ||
        target.user.bot
      ) {
        await replyWithoutPings(
          message,
          "I can't time out the command sender, a bot, or the server owner.",
        );
        return;
      }

      const durationSeconds = rules.timeoutTrigger.durationSeconds;
      try {
        await target.timeout(durationSeconds * 1000, "Authorized timeout command");
      } catch (error) {
        console.error(`Could not apply the requested timeout: ${getErrorMessage(error)}`);
        await replyWithoutPings(
          message,
          "I couldn't apply the timeout. Check that I have Moderate Members permission and a role above the target.",
        );
        return;
      }

      await replyWithoutPings(
        message,
        `Timed out ${target.user.tag} for ${durationSeconds} seconds.`,
      );
      return;
    }

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

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== "say") return;

    if (!isBotOwner(interaction.user.id, rules.ownerUserId)) {
      await interaction.reply({
        content: "Only the bot owner can use this command.",
        ephemeral: true,
      });
      return;
    }

    if (
      !interaction.inGuild() ||
      !interaction.channel ||
      !("send" in interaction.channel) ||
      typeof interaction.channel.send !== "function"
    ) {
      await interaction.reply({
        content: "Use this command in a server text channel.",
        ephemeral: true,
      });
      return;
    }

    const content = interaction.options.getString("message", true).trim();
    if (!content) {
      await interaction.reply({
        content: "Please provide a message to send.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.channel.send({
        content,
        allowedMentions: { parse: [] },
      });
      await interaction.editReply("Sent.");
    } catch (error) {
      console.error(`Could not send /say message: ${getErrorMessage(error)}`);
      await interaction.editReply("I couldn't send that message. Check that I can send messages in this channel.");
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
