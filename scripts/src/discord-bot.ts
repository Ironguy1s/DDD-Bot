import {
  ApplicationCommandOptionType,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Message,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import {
  getSilenceTargetId,
  getTriggeredReply,
  isAuthorizedUser,
  loadBotRules,
  type BotRules,
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

const removeRoleCommand = {
  name: "remove",
  description: "Remove a role from a server member",
  options: [
    {
      name: "role",
      description: "Role to remove",
      type: ApplicationCommandOptionType.Role,
      required: true,
    },
    {
      name: "member",
      description: "Member to remove the role from",
      type: ApplicationCommandOptionType.User,
      required: true,
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

async function handleRemoveRole(
  interaction: ChatInputCommandInteraction,
  rules: BotRules,
): Promise<void> {
  if (!isAuthorizedUser(interaction.user.id, rules.ownerUserId)) {
    await interaction.reply({
      content: "Only the configured bot owner can use this command.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Use this command in a server.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  const guild = interaction.guild;
  const role = interaction.options.getRole("role", true);
  const targetUser = interaction.options.getUser("member", true);

  if (
    targetUser.bot ||
    targetUser.id === interaction.user.id ||
    targetUser.id === guild.ownerId
  ) {
    await interaction.reply({
      content: "I can't remove roles from the command user, a bot, or the server owner.",
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  let target;
  try {
    target = await guild.members.fetch(targetUser.id);
  } catch (error) {
    console.error(`Could not find the requested role-removal target: ${getErrorMessage(error)}`);
    await interaction.editReply("I couldn't find that member in this server.");
    return;
  }

  let botMember;
  try {
    botMember = guild.members.me ?? await guild.members.fetchMe();
  } catch (error) {
    console.error(`Could not verify the bot's server permissions: ${getErrorMessage(error)}`);
    await interaction.editReply("I couldn't verify my role permissions in this server.");
    return;
  }

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.editReply("I need the Manage Roles permission to remove roles.");
    return;
  }

  if (role.id === guild.id || role.managed || !role.editable) {
    await interaction.editReply("I can't manage that role. It may be managed by an integration or above my highest role.");
    return;
  }

  if (!target.manageable) {
    await interaction.editReply("I can't manage that member because of the server role hierarchy.");
    return;
  }

  if (!target.roles.cache.has(role.id)) {
    await interaction.editReply("That member doesn't have the selected role.");
    return;
  }

  try {
    await target.roles.remove(role, "Role removal requested by the authorized bot owner");
  } catch (error) {
    console.error(`Could not remove the requested role: ${getErrorMessage(error)}`);
    await interaction.editReply("I couldn't remove that role. Check my Manage Roles permission and the server role hierarchy.");
    return;
  }

  await interaction.editReply(`Removed the ${role.name} role from ${target.user.tag}.`);
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
  const cooldownMs = (rules.cooldownSeconds ?? 0) * 1000;

  client.once(Events.ClientReady, async (readyClient) => {
    console.info(`Discord bot is online as ${readyClient.user.tag}.`);
    console.info(
      `Loaded ${rules.keywordRules?.length ?? 0} keyword rule(s) and ${rules.userIdRules?.length ?? 0} user ID rule(s).`,
    );

    try {
      const existingCommands = await readyClient.application.commands.fetch();
      for (const commandDefinition of [sayCommand, removeRoleCommand]) {
        const existingCommand = existingCommands.find(
          (command) => command.name === commandDefinition.name,
        );
        if (existingCommand) {
          await readyClient.application.commands.edit(existingCommand.id, commandDefinition);
        } else {
          await readyClient.application.commands.create(commandDefinition);
        }
      }
      console.info("The /say and /remove commands are registered.");
    } catch (error) {
      console.error(`Could not register a Discord command: ${getErrorMessage(error)}`);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!message.inGuild() || message.author.bot) return;

    const trimmedContent = message.content.trim();
    const isSilenceTrigger = /^silence\b/i.test(trimmedContent);

    if (message.author.id === rules.timeoutTrigger.userId && isSilenceTrigger) {
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
          "Use `Silence @member` with exactly one real member mention.",
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
          "I can't time out the trigger sender, a bot, or the server owner.",
        );
        return;
      }

      const durationSeconds = rules.timeoutTrigger.durationSeconds;
      try {
        await target.timeout(durationSeconds * 1000, "Authorized Silence trigger");
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
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "remove") {
      await handleRemoveRole(interaction, rules);
      return;
    }

    if (interaction.commandName !== "say") return;

    if (!isAuthorizedUser(interaction.user.id, rules.ownerUserId)) {
      await interaction.reply({
        content: "Only the bot owner can use this command.",
        flags: [MessageFlags.Ephemeral],
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
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const content = interaction.options.getString("message", true).trim();
    if (!content) {
      await interaction.reply({
        content: "Please provide a message to send.",
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
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