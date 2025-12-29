import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as discordTranscripts from 'discord-html-transcripts';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  Events
} from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, 'config_js.json');

function loadDotEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = String(line).trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

function buildClosedStatusEmbed(reason) {
  let desc = '**<a:ainasf9ias:1447150710805495889> Ticketul se inchide in 5s !**';
  if (reason) desc += `\n\n**Motiv:** ${reason}`;

  return new EmbedBuilder()
    .setTitle('Closed')
    .setDescription(desc)
    .setFooter({ text: 'Multumim ca ai contactat echipa DR1P !' })
    .setColor(0xff4c4c);
}

function buildUnclaimedStatusEmbed() {
  return new EmbedBuilder()
    .setTitle('Unclaimed')
    .setDescription('<a:FakeNitroEmoji:1444777369746407434> Se asteapta un nou **staff** pe ticket!')
    .setFooter({ text: 'Daca nu te poti descurca poti sa dai tag la un staff manager!' })
    .setColor(0x9b59b6);
}

function buildClaimedStatusEmbed(claimer) {
  return new EmbedBuilder()
    .setTitle('Claimed')
    .setDescription(
      '<a:1439945103924793444:1446568482509557760> Ticket preluat de catre ' +
        claimer.toString() +
        ' , el o sa fie ajutorul tau!'
    )
    .setColor(0x00b894);
}

function buildSwitchPanelEmbed(ticketId, prettyPanel, changer) {
  return new EmbedBuilder()
    .setTitle('Switch panel')
    .setDescription(
      '<:86174edit:1395671877980131408> Ticket\n' +
        `**#${ticketId}**\n\n` +
        '<:75961retweet:1447199373992923157> Categoria Noua\n' +
        `**${prettyPanel}**\n\n` +
        '<:viewz_help:1395671963401191444> Categorie schimbata de\n' +
        changer.toString()
    )
    .setColor(0x7c3aed)
    .setTimestamp();
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('Help - Comenzi bot')
    .setDescription(
      [
        '**Ticket Panel:**',
        '`/tickets-setup` - trimite panoul de tickete (Admin)',
        '',
        '**Ticket Management (in ticket):**',
        '`/add <user>` - adauga user in ticket',
        '`/remove <user>` - scoate user din ticket',
        '`/rename <name>` - redenumeste ticketul',
        '`/claim` - faci claim la ticket',
        '`/unclaim` - renunti la claim',
        '`/close [motiv]` - inchide ticket',
        '`/transcript` - genereaza transcript',
        '`/switchpanel <categorie>` - muta ticketul in alta categorie',
        '',
        '**Info:**',
        '`/help` - afiseaza acest mesaj'
      ].join('\n')
    )
    .setColor(0x2b2d31)
    .setFooter({ text: 'DR1P Tickets System' })
    .setTimestamp();
}

loadDotEnvFile(path.join(__dirname, '.env'));

// Foldere pentru date (tickets + transcripturi)
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(configPath)) {
  console.error('Nu exista config_js.json. Copiaza config_js_example.json > config_js.json si completeaza datele.');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (typeof process.env.DISCORD_TOKEN === 'string' && process.env.DISCORD_TOKEN.trim()) {
  config.token = process.env.DISCORD_TOKEN.trim();
}

const TICKETS_DB_PATH = path.join(DATA_DIR, 'tickets_js.json');
const TICKET_COUNTERS_DB_PATH = path.join(DATA_DIR, 'ticket_counters_js.json');
function loadTickets() {
  if (!fs.existsSync(TICKETS_DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(TICKETS_DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveTickets(data) {
  fs.writeFileSync(TICKETS_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function loadTicketCounters() {
  if (!fs.existsSync(TICKET_COUNTERS_DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(TICKET_COUNTERS_DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveTicketCounters(data) {
  fs.writeFileSync(TICKET_COUNTERS_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getTicketChannelBaseName(type) {
  switch (type) {
    case 'help-info':
    case TicketType.INFO_OTHERS:
      return 'help-info';

    case 'member-report':
    case TicketType.REPORT_MEMBER:
      return 'r-membru';

    case 'staff-report':
    case TicketType.REPORT_STAFF:
      return 'r-staff';

    case 'ban-report':
    case TicketType.BAN_REPORTS:
      return 'ban-report';

    case 'owner':
    case TicketType.CONTACT_OWNER:
      return 'contact-owner';

    default:
      return 'ticket';
  }
}

function nextTicketNumber(guildId, type) {
  const base = String(getTicketChannelBaseName(type) ?? 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const counters = loadTicketCounters();
  if (!counters[guildId] || typeof counters[guildId] !== 'object') counters[guildId] = {};

  const current = Number(counters[guildId][base] ?? 0);
  const next = Number.isFinite(current) ? current + 1 : 1;
  counters[guildId][base] = next;
  saveTicketCounters(counters);

  return { base, number: next };
}

async function replyEphemeral(interaction, content) {
  try {
    if (interaction.deferred) {
      await interaction.editReply({ content });
      return;
    }
    if (interaction.replied) {
      await interaction.followUp({ content, flags: 64 });
      return;
    }
    await interaction.reply({ content, flags: 64 });
  } catch (err) {
    const code = err?.code ?? err?.rawError?.code;
    if (code === 40060) {
      await interaction.followUp({ content, flags: 64 }).catch(async () => {
        await interaction.editReply({ content }).catch(() => null);
      });
      return;
    }
  }
}

async function replyEphemeralPayload(interaction, payload) {
  const data = payload && typeof payload === 'object' ? { ...payload } : { content: String(payload ?? '') };
  if (data.flags === undefined) data.flags = 64;

  try {
    if (interaction.deferred) {
      await interaction.editReply(data);
      return;
    }
    if (interaction.replied) {
      await interaction.followUp(data);
      return;
    }
    await interaction.reply(data);
  } catch (err) {
    const code = err?.code ?? err?.rawError?.code;
    if (code === 40060) {
      await interaction.followUp(data).catch(async () => {
        await interaction.editReply(data).catch(() => null);
      });
    }
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.on('error', (err) => {
  console.error('Client error:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logat ca ${c.user.tag}`);
  c.user.setPresence({ activities: [{ name: 'DR1P on top | Support 24/7', type: 3 }], status: 'idle' });
});

const TicketType = {
  REPORT_STAFF: 'report_staff',
  REPORT_MEMBER: 'report_member',
  BAN_REPORTS: 'ban_reports',
  CONTACT_OWNER: 'contact_owner',
  INFO_OTHERS: 'info_others'
};

const CONTACT_OWNER_ROLE_IDS = [
  '1447370749299130524',
  '1447415090772054151'
];

const TicketLabels = {
  [TicketType.REPORT_STAFF]: '⚠️ REPORT STAFF',
  [TicketType.REPORT_MEMBER]: '🧑‍⚖️ REPORT MEMBER',
  [TicketType.BAN_REPORTS]: '⛔ BAN REPORTS',
  [TicketType.CONTACT_OWNER]: '👑 CONTACT OWNER',
  [TicketType.INFO_OTHERS]: '❓ INFO & OTHERS'
};

function getStaffRoleIds() {
  const ids = [];
  if (typeof config.staffRoleId === 'string' && config.staffRoleId.trim()) ids.push(config.staffRoleId.trim());
  if (Array.isArray(config.staffRoleIds)) ids.push(...config.staffRoleIds);
  if (Array.isArray(config.upperStaffRoleIds)) ids.push(...config.upperStaffRoleIds);
  if (Array.isArray(config.claimRoleIds)) ids.push(...config.claimRoleIds);
  return [...new Set(
    ids
      .map(v => (typeof v === 'string' ? v.trim() : v))
      .filter(isValidSnowflake)
  )];
}

function getTranscriptChannelId() {
  if (typeof config.transcriptChannelId === 'string' && config.transcriptChannelId.trim()) {
    return config.transcriptChannelId.trim();
  }
  return config.logChannelId;
}

const TicketTypeOrder = [
  TicketType.REPORT_STAFF,
  TicketType.REPORT_MEMBER,
  TicketType.BAN_REPORTS,
  TicketType.CONTACT_OWNER,
  TicketType.INFO_OTHERS
];

function getCategoryNameForType(type) {
  return TicketLabels[type] || type;
}

function getAclForType(type, guild) {
  const base = {
    allowRoleIds: getStaffRoleIds(),
    allowOwner: false
  };

  if (type === TicketType.CONTACT_OWNER) {
    base.allowRoleIds = CONTACT_OWNER_ROLE_IDS.filter(isValidSnowflake);
    base.allowOwner = false;
  }

  const byType = config.ticketAclByType;
  if (byType && typeof byType === 'object' && byType[type] && typeof byType[type] === 'object') {
    const entry = byType[type];
    if (Array.isArray(entry.allowRoleIds)) {
      base.allowRoleIds = entry.allowRoleIds.filter(Boolean);
    }
    if (entry.allowOwner === true) base.allowOwner = true;
  }

  if (type === TicketType.CONTACT_OWNER) {
    base.allowRoleIds = CONTACT_OWNER_ROLE_IDS.filter(isValidSnowflake);
    base.allowOwner = false;
  }

  if (base.allowOwner === true && guild?.ownerId) {
    // Owner is handled as a member overwrite.
  }

  return base;
}

function getPingTargetForType(type, guild) {
  const acl = getAclForType(type, guild);
  return Array.isArray(acl.allowRoleIds)
    ? acl.allowRoleIds
      .map(v => (typeof v === 'string' ? v.trim() : v))
      .filter(isValidSnowflake)
      .map(rid => `<@&${rid}>`)
      .join(' ')
    : '';
}

function buildCategoryOverwrites(guild, type) {
  const acl = getAclForType(type, guild);
  const map = new Map();

  map.set(guild.id, {
    id: guild.id,
    deny: new Set([PermissionsBitField.Flags.ViewChannel]),
    allow: new Set()
  });

  for (const roleId of acl.allowRoleIds) {
    if (!map.has(roleId)) {
      map.set(roleId, { id: roleId, deny: new Set(), allow: new Set() });
    }
    map.get(roleId).allow.add(PermissionsBitField.Flags.ViewChannel);
  }

  if (acl.allowOwner === true && guild.ownerId) {
    if (!map.has(guild.ownerId)) {
      map.set(guild.ownerId, { id: guild.ownerId, deny: new Set(), allow: new Set() });
    }
    map.get(guild.ownerId).allow.add(PermissionsBitField.Flags.ViewChannel);
  }

  return [...map.values()].map(ov => ({
    id: ov.id,
    allow: [...ov.allow],
    deny: [...ov.deny]
  }));
}

function buildTicketOverwrites(guild, userId, type) {
  const acl = getAclForType(type, guild);

  const map = new Map();
  const ensure = (id) => {
    if (!map.has(id)) map.set(id, { id, deny: new Set(), allow: new Set() });
    return map.get(id);
  };

  ensure(guild.id).deny.add(PermissionsBitField.Flags.ViewChannel);

  const userOv = ensure(userId);
  userOv.allow.add(PermissionsBitField.Flags.ViewChannel);
  userOv.allow.add(PermissionsBitField.Flags.SendMessages);
  userOv.allow.add(PermissionsBitField.Flags.AttachFiles);
  userOv.allow.add(PermissionsBitField.Flags.ReadMessageHistory);

 const allowedRoleIds = new Set((acl.allowRoleIds ?? []).filter(isValidSnowflake));
  if (type === TicketType.CONTACT_OWNER) {
    const denyRoleIds = new Set(getStaffRoleIds());
    for (const roleId of denyRoleIds) {
      if (!isValidSnowflake(roleId)) continue;
      if (allowedRoleIds.has(roleId)) continue;
      ensure(roleId).deny.add(PermissionsBitField.Flags.ViewChannel);
    }
  }

  for (const roleId of acl.allowRoleIds) {
    const roleOv = ensure(roleId);
    roleOv.allow.add(PermissionsBitField.Flags.ViewChannel);
    roleOv.allow.add(PermissionsBitField.Flags.SendMessages);
    roleOv.allow.add(PermissionsBitField.Flags.AttachFiles);
    roleOv.allow.add(PermissionsBitField.Flags.ManageMessages);
    roleOv.allow.add(PermissionsBitField.Flags.ReadMessageHistory);
  }

  for (const roleId of config.upperStaffRoleIds ?? []) {
    if (!roleId) continue;
    if (type === TicketType.CONTACT_OWNER && !allowedRoleIds.has(roleId)) continue;
    const roleOv = ensure(roleId);
    roleOv.allow.add(PermissionsBitField.Flags.ViewChannel);
    roleOv.allow.add(PermissionsBitField.Flags.SendMessages);
    roleOv.allow.add(PermissionsBitField.Flags.AttachFiles);
    roleOv.allow.add(PermissionsBitField.Flags.ManageChannels);
    roleOv.allow.add(PermissionsBitField.Flags.ReadMessageHistory);
  }

  if (acl.allowOwner === true && guild.ownerId) {
    const ownerOv = ensure(guild.ownerId);
    ownerOv.allow.add(PermissionsBitField.Flags.ViewChannel);
    ownerOv.allow.add(PermissionsBitField.Flags.SendMessages);
    ownerOv.allow.add(PermissionsBitField.Flags.AttachFiles);
    ownerOv.allow.add(PermissionsBitField.Flags.ReadMessageHistory);
  }

  return [...map.values()].map(ov => ({
    id: ov.id,
    allow: [...ov.allow],
    deny: [...ov.deny]
  }));
}

async function ensureTicketCategory(guild, type) {
  const map = config.ticketCategoryIdsByType;
  const categoryId = map && typeof map === 'object' ? map[type] : null;
  if (!categoryId || typeof categoryId !== 'string') return null;

  let ch = guild.channels.cache.get(categoryId) || null;
  if (!ch) {
    ch = await guild.channels.fetch(categoryId).catch(() => null);
  }
  if (!ch || ch.type !== ChannelType.GuildCategory) return null;

  return ch;
}

function createTicketPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('**Support Tickets**')
    .setDescription(
      '\n' +
        '<a:crown:1454592183582720186> ・Deschide un ticket dacă dorești să cumperi o promovare, un grad, un canal custom, să raportezi un bug sau dacă ai o problemă cu cineva din high staff.\n' +
        '\n' +
        '<:staff:1454592226255438025> ・Raportează un membru al staff-ului care încalcă regulamentul.\n' +
        '\n' +
        '<:1nsassd:1454592304483536997> ・Raportează un membru care postează conținut NSFW, gore, dox sau expose.\n' +
        '\n' +
        '<a:exclamation:1450537946976489473> ・Raportează un membru care încalcă regulamentul serverului.\n' +
        '\n' +
        '<:help:1454164071719899301> ・Deschide acest ticket dacă ai o întrebare sau o nelămurire legată de server.\n' +
        '\n' +
        '<:announce:1454592340248363143> : Ticketul in bataie de joc este **sanctionat cu timeout**\n' +
        '<:announce:1454592340248363143> : Partajarea conținutului unui **ticket pe voice = INTERZIS**\n' +
        '<:announce:1454592340248363143> : Fără dovadă video/audio clară = **Nu putem acționa**'
    )
    .setColor(0x5865f2)
    .setFooter({ text: 'Ticket System • Support' });

  const panelImageUrl = typeof config.panelImageUrl === 'string' ? config.panelImageUrl.trim() : '';
  if (panelImageUrl) embed.setImage(panelImageUrl);

  return embed;
}

function createTicketPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Alege categoria de ticket')
      .addOptions(
        {
          label: 'Owner',
          value: TicketType.CONTACT_OWNER,
          emoji: '<a:crown:1447150646816931892>',
          description: 'Contact direct cu owner-ul.'
        },
        {
          label: 'Staff Report',
          value: TicketType.REPORT_STAFF,
          emoji: '<:emoji1372956624590995518:1447150820930883615>',
          description: 'Raporteaza un membru din staff.'
        },
        {
          label: 'Ban Report',
          value: TicketType.BAN_REPORTS,
          emoji: '<:64775trash:1447150791147262043>',
          description: 'Raporteaza un ban gresit/abuziv.'
        },
        {
          label: 'Member Report',
          value: TicketType.REPORT_MEMBER,
          emoji: '<a:ainasf9ias:1447150710805495889>',
          description: 'Raporteaza un membru normal.'
        },
        {
          label: 'Help & Info',
          value: TicketType.INFO_OTHERS,
          emoji: '<:help_bot:1447151687461634069>',
          description: 'Ajutor general / informatii.'
        }
      )
  );
}

function getTicketIdByChannelId(channelId) {
  const tickets = loadTickets();
  for (const [id, t] of Object.entries(tickets)) {
    if (t && t.channelId === channelId && !t.closed) return id;
  }
  return null;
}

function getTicketByChannelId(channelId) {
  const tickets = loadTickets();
  for (const [id, t] of Object.entries(tickets)) {
    if (t && t.channelId === channelId && !t.closed) return { ticketId: id, ticket: t };
  }
  return null;
}

function createControlButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_claim_${ticketId}`)
      .setLabel('Claim')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_transcript_${ticketId}`)
      .setLabel('Transcript')
      .setEmoji('🧾')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticketId}`)
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

function normalizeBaseUrl(url) {
  return String(url).trim().replace(/\/+$/g, '');
}

function getHostedTranscriptBaseUrl() {
  if (typeof config.transcriptBaseUrl !== 'string') return null;
  const trimmed = config.transcriptBaseUrl.trim();
  return trimmed ? normalizeBaseUrl(trimmed) : null;
}

function isHostedTranscriptEnabled() {
  return Boolean(getHostedTranscriptBaseUrl());
}

function getHostedTranscriptUrl(ticketId) {
  const base = getHostedTranscriptBaseUrl();
  if (!base) return null;
  const filename = `ticket-${ticketId}-transcript.html`;
  return `${base}/${filename}`;
}

function ensureHostedTranscriptsDir() {
  const dir = path.join(__dirname, 'docs', 'transcripts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function generateTranscriptHtml(channel, ticketId) {
  const limit = config.transcriptMaxMessages ?? -1;
  const safeLimit = typeof limit === 'number' && Number.isFinite(limit) ? limit : -1;
  return discordTranscripts.createTranscript(channel, {
    limit: safeLimit,
    returnType: 'string',
    filename: `ticket-${ticketId}-transcript.html`,
    saveImages: config.transcriptSaveImages !== false,
    poweredBy: false,
    hydrate: true,
    footerText: typeof config.transcriptFooterText === 'string' && config.transcriptFooterText.trim()
      ? config.transcriptFooterText.trim()
      : 'Exported {number} message{s}'
  });
}

async function tryGenerateHostedTranscript(channel, ticketId) {
  const url = getHostedTranscriptUrl(ticketId);
  if (!url) return null;
  const html = await generateTranscriptHtml(channel, ticketId);
  const dir = ensureHostedTranscriptsDir();
  const filePath = path.join(dir, `ticket-${ticketId}-transcript.html`);
  fs.writeFileSync(filePath, String(html), 'utf8');
  return url;
}

async function generateTranscriptAttachment(channel, ticketId) {
  const limit = config.transcriptMaxMessages ?? -1;
  const safeLimit = typeof limit === 'number' && Number.isFinite(limit) ? limit : -1;
  const baseFilename = `ticket-${ticketId}-transcript.html`;
  const filename = config.transcriptSpoiler !== false ? `SPOILER_${baseFilename}` : baseFilename;
  return discordTranscripts.createTranscript(channel, {
    limit: safeLimit,
    returnType: 'attachment',
    filename,
    saveImages: config.transcriptSaveImages !== false,
    poweredBy: false,
    hydrate: true,
    footerText: typeof config.transcriptFooterText === 'string' && config.transcriptFooterText.trim()
      ? config.transcriptFooterText.trim()
      : 'Exported {number} message{s}'
  });
}

async function createTicket(interaction, type, formData = null) {
  const guild = interaction.guild;
  const member = interaction.member;

  const tickets = loadTickets();
  const existing = Object.values(tickets).find(t => t.guildId === guild.id && t.userId === member.id && !t.closed);
  if (existing) {
    let ch = guild.channels.cache.get(existing.channelId) || null;
    if (!ch) ch = await guild.channels.fetch(existing.channelId).catch(() => null);
    await replyEphemeral(interaction, ch ? `Ai deja un ticket deschis: ${ch}` : 'Ai deja un ticket deschis.');
    return;
  }

  const category = await ensureTicketCategory(guild, type).catch(() => null);
  if (!category) {
    await replyEphemeral(
      interaction,
      'Categoria pentru acest tip de ticket nu este setata sau nu exista. Verifica ticketCategoryIdsByType in config.'
    );
    return;
  }

  const ticketId = Date.now().toString();
  const { base, number } = nextTicketNumber(guild.id, type);
  const channelName = `${base}-${number}`;

  const overwrites = buildTicketOverwrites(guild, member.id, type);

   const safeOverwrites = [];
  const invalidOverwrites = [];

  if (Array.isArray(overwrites)) {
    for (const ov of overwrites) {
      const id = ov?.id;
      if (!id || (id !== guild.id && !isValidSnowflake(id))) {
        invalidOverwrites.push(ov);
        continue;
      }

      if (id === guild.id) {
        safeOverwrites.push(ov);
        continue;
      }

      if (!guild.roles.cache.has(id) && !guild.members.cache.has(id)) {
        const role = await guild.roles.fetch(id).catch(() => null);
        if (!role) {
          const m = await guild.members.fetch(id).catch(() => null);
          if (!m) {
            invalidOverwrites.push(ov);
            continue;
          }
        }
      }

      safeOverwrites.push(ov);
    }
  }

  if (invalidOverwrites.length) {
    console.error('Ticket overwrites invalide / nerezolvabile:', invalidOverwrites);
  }

  let channel;
  try {
    channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: safeOverwrites,
    topic: `Ticket pentru ${member.user.tag} (${member.id}) | Tip: ${type}`
  });
} catch (err) {
    console.error('Eroare la crearea canalului de ticket:', err);
    await replyEphemeral(
      interaction,
      'Nu am putut crea ticketul. Verifica role ID-urile din config (ticketAclByType / staffRoleIds / upperStaffRoleIds) sau dezactiveaza owner overwrite.'
    );
    return;
  }
  tickets[ticketId] = {
    id: ticketId,
    guildId: guild.id,
    channelId: channel.id,
    userId: member.id,
    type,
    createdAt: new Date().toISOString(),
    formData: formData || null,
    claimedBy: null,
    closed: false
  };
  saveTickets(tickets);

  function getTicketOpenText(ticketType) {
    switch (ticketType) {
      case 'help-info':
      case TicketType.INFO_OTHERS:
        return [
          '<a:verify:1454502667412963328> ・Îți mulțumim că ai contactat echipa **DR1P!**',
          '',
          '<a:exclamation:1450537946976489473> ・Speculeaza problema/intrebarea pe care o ai legta de server.',
          '',
          '<a:campiones:1454618097519431730> ・Pentru a participa la un concurs cum ar fi "celebrity", se da tag la un owner.',
          '',
          '<a:drip_loading:1454502882241155072> ・In cel mai scurt timp un membru din **low staff** o sa prea ticketul.'
        ].join('\n');

      case 'member-report':
      case TicketType.REPORT_MEMBER:
        return [
          '<a:verify:1454502667412963328> ・Îți mulțumim că ai contactat echipa **DR1P!**',
          '',
          '<a:exclamation:1450537946976489473> ・Te rugam sa afisezi dovada vido/ss cu membrul care incalca regulile comportamentale.',
          '',
          '<a:drip_loading:1454502882241155072> ・In cel mai scurt timp un membru din **low staff** o sa prea ticketul.'
        ].join('\n');

      case 'staff-report':
      case TicketType.REPORT_STAFF:
        return [
          '<a:verify:1454502667412963328> ・Îți mulțumim că ai contactat echipa **DR1P!**',
          '',
          '<a:exclamation:1450537946976489473>  ・Te rugam sa afisezi o dovada video/ss si id-ul persoanei staff reclamata.',
          '',
          '<a:drip_loading:1454502882241155072> ・Un **assistant manager** iti va prelua ticketul in cel mai scurt timp.'
        ].join('\n');

      case 'owner':
      case TicketType.CONTACT_OWNER:
        return [
          '<a:verify:1454502667412963328> ・Îți mulțumim că ai contactat echipa **DR1P!**',
          '',
          '<a:exclamation:1450537946976489473> ・Scrie aici cu ce te putem ajuta.',
          '',
          '<:money:1454609371261567097> ・Daca doresti sa achizitionezi ceva, scrie aici ce si cat esti dispus sa oferi.',
          '',
          '<a:drip_loading:1454502882241155072> ・Poti astepta pana la **24h** pana sa-ti raspunda un owner!'
        ].join('\n');

      case 'ban-report':
      case TicketType.BAN_REPORTS:
        return [
          '<a:verify:1454502667412963328>・Îți mulțumim că ai contactat echipa **DR1P!**',
          '',
          '<a:exclamation:1450537946976489473> ・Trimite aici video/ss cu problema',
          '',
          '<a:drip_loading:1454502882241155072> ・Un membru al **staff-ului cu ban acces** îți va răspunde în cel mai scurt timp.'
        ].join('\n');

      default:
        return (
          'Salut!\n' +
          'Te rog descrie problema ta cât mai detaliat.\n\n' +
          '> Un membru din staff îți va răspunde în curând.'
        );
    }
  }

  const pingTarget = getPingTargetForType(type, guild);

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket deschis')
    .setDescription(getTicketOpenText(type))
    .setColor(0x5865f2)
    .setTimestamp();

  if (formData && typeof formData === 'object') {
    const entries = Object.entries(formData)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim().length > 0)
      .slice(0, 10);
    for (const [k, v] of entries) {
      embed.addFields({ name: k, value: String(v).slice(0, 1000), inline: false });
    }
  }

  const controls = createControlButtons(ticketId);

  await channel.send({ content: [member.toString(), pingTarget].filter(Boolean).join(' '), embeds: [embed], components: [controls] });

  const logChannel = channel.guild.channels.cache.get(config.logChannelId);
  if (logChannel && logChannel.isTextBased()) {
    const logEmbed = new EmbedBuilder()
      .setTitle('🎫 Ticket deschis')
      .addFields(
        { name: 'Canal', value: channel.toString(), inline: false }
      )
      .setColor(0x5865f2)
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] });
  }

  await replyEphemeral(interaction, `Ti-am deschis un ticket: ${channel}`);
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  for (const roleId of getStaffRoleIds()) {
    if (member.roles.cache.has(roleId)) return true;
  }
  return false;
}

function isValidSnowflake(id) {
  return typeof id === 'string' && /^\d{17,20}$/.test(id);
}

async function handleUnclaim(interaction, ticketId) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member)) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa folosesti aceasta comanda.');
    return;
  }

  if (!ticket.claimedBy) {
    await replyEphemeral(interaction, 'Ticketul nu este preluat.');
    return;
  }

  if (ticket.claimedBy !== interaction.user.id && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await replyEphemeral(interaction, 'Doar staff-ul care a dat claim poate face unclaim (sau admin).');
    return;
  }

  ticket.claimedBy = null;
  saveTickets(tickets);

  const channel = interaction.channel;
  if (channel?.isTextBased()) {
    const overwrites = buildTicketOverwrites(channel.guild, ticket.userId, ticket.type);
    await channel.permissionOverwrites.set(overwrites).catch(() => null);
    await channel.send({ embeds: [buildUnclaimedStatusEmbed()] }).catch(() => null);
  }

  await replyEphemeral(interaction, 'Unclaim facut.');
}

async function handleRename(interaction, ticketId, newName) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa redenumesti acest ticket.');
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await replyEphemeral(interaction, 'Canal invalid.');
    return;
  }

  const safe = String(newName).toLowerCase().replace(/[^a-z0-9\-]/g, '-').replace(/-+/g, '-').slice(0, 90);
  if (!safe || safe.length < 2) {
    await replyEphemeral(interaction, 'Nume invalid.');
    return;
  }

  await channel.setName(safe).catch(() => null);
  await replyEphemeral(interaction, 'Ticket redenumit.');
}

async function handleAddRemove(interaction, ticketId, user, mode) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa modifici accesul in acest ticket.');
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased()) {
    await replyEphemeral(interaction, 'Canal invalid.');
    return;
  }

  if (!user?.id) {
    await replyEphemeral(interaction, 'User invalid.');
    return;
  }

  if (mode === 'add') {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      AttachFiles: true,
      ReadMessageHistory: true
    }).catch(() => null);
    await replyEphemeral(interaction, `Am adaugat ${user.toString()} in ticket.`);
    return;
  }

  if (mode === 'remove') {
    await channel.permissionOverwrites.delete(user.id).catch(() => null);
    await replyEphemeral(interaction, `Am scos ${user.toString()} din ticket.`);
  }
}

async function handleSwitchPanel(interaction, ticketId, newType) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member)) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa folosesti aceasta comanda.');
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await replyEphemeral(interaction, 'Canal invalid.');
    return;
  }

  if (!Object.values(TicketType).includes(newType)) {
    await replyEphemeral(interaction, 'Categorie invalida.');
    return;
  }

  const category = await ensureTicketCategory(channel.guild, newType).catch(() => null);
  if (!category) {
    await replyEphemeral(
      interaction,
      'Categoria nu este setata sau nu exista. Verifica ticketCategoryIdsByType in config.'
    );
    return;
  }

  ticket.type = newType;
  saveTickets(tickets);

  await channel.setParent(category.id).catch(() => null);
  const overwrites = buildTicketOverwrites(channel.guild, ticket.userId, newType);
  await channel.permissionOverwrites.set(overwrites).catch(() => null);

  const currentName = typeof channel.name === 'string' ? channel.name : '';
  const match = currentName.match(/-(\d+)$/);
  const existingNumber = match ? Number(match[1]) : null;
  const newBase = getTicketChannelBaseName(newType);
  const number = Number.isFinite(existingNumber) && existingNumber > 0
    ? existingNumber
    : nextTicketNumber(channel.guild.id, newType).number;
  const newName = `${newBase}-${number}`;
  if (newName && newName !== currentName) {
    await channel.setName(newName).catch(() => null);
  }

  const pingTarget = getPingTargetForType(newType, channel.guild);
  await channel.send({ content: pingTarget || undefined, embeds: [buildSwitchPanelEmbed(ticketId, TicketLabels[newType] || newType, interaction.user)] }).catch(() => null);
  await replyEphemeral(interaction, 'Ticket mutat.');
}

async function handleClaim(interaction, ticketId) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member)) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa folosesti acest buton.');
    return;
  }

  if (ticket.claimedBy) {
    await replyEphemeral(interaction, 'Ticketul este deja preluat.');
    return;
  }

  ticket.claimedBy = interaction.user.id;
  saveTickets(tickets);

  const channel = interaction.channel;
  if (channel?.isTextBased()) {
    const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);

    const safeStaffRoleIds = getStaffRoleIds().filter(isValidSnowflake);
    const safeUpperRoleIds = (config.upperStaffRoleIds ?? []).filter(isValidSnowflake);

    const overwrites = [
      {
        id: channel.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: ticket.userId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      ...safeStaffRoleIds.map(rid => ({
        id: rid,
        deny: [PermissionsBitField.Flags.ViewChannel]
      })),
      ...safeUpperRoleIds.map(rid => ({
        id: rid,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.AttachFiles,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }))
    ];

    await channel.permissionOverwrites.set(overwrites);

    if (channel.isTextBased() && typeof channel.setPosition === 'function') {
      await channel.setPosition(0, { reason: 'Ticket claimed' }).catch(() => null);
    }

    await channel.send({ embeds: [buildClaimedStatusEmbed(interaction.user)] });
  }

  await replyEphemeral(interaction, 'Ai preluat acest ticket.');
}

async function handleClose(interaction, ticketId, closeReason = undefined) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa inchizi acest ticket.');
    return;
  }

  if (ticket.closed) {
    await replyEphemeral(interaction, 'Ticketul este deja inchis.');
    return;
  }

  ticket.closedBy = interaction.user.id;
  ticket.closeReason = closeReason ? String(closeReason).slice(0, 1500) : null;
  ticket.closed = true;
  ticket.closedAt = new Date().toISOString();
  saveTickets(tickets);

  const channel = interaction.channel;
  if (!channel?.isTextBased()) {
    await replyEphemeral(interaction, 'Canal invalid.');
    return;
  }

  await channel
    .send({
      content: `Ticket inchis de ${interaction.user.toString()}${ticket.closeReason ? ` | Motiv: ${ticket.closeReason}` : ''}`,
      allowedMentions: { parse: [] }
    })
    .catch(() => null);

  let transcriptUrl = null;
  let transcriptAttachment = null;

  if (isHostedTranscriptEnabled()) {
    transcriptUrl = getHostedTranscriptUrl(ticketId);
    try {
      await tryGenerateHostedTranscript(channel, ticketId);
    } catch {
      transcriptUrl = null;
    }
  } else {
    try {
      transcriptAttachment = await generateTranscriptAttachment(channel, ticketId);
    } catch {
      transcriptAttachment = null;
    }
  }

  const transcriptChannel = channel.guild.channels.cache.get(getTranscriptChannelId());
  if (transcriptChannel && transcriptChannel.isTextBased()) {
    const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);
    const staff = ticket.claimedBy ? await channel.guild.members.fetch(ticket.claimedBy).catch(() => null) : null;

    const guildName = channel.guild?.name ? String(channel.guild.name) : 'Ticket System';
    const guildIconUrl = typeof channel.guild?.iconURL === 'function' ? channel.guild.iconURL() : null;
    const openedAt = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('ro-RO') : 'Nespecificat';
    const reasonText = ticket.closeReason ? String(ticket.closeReason).slice(0, 1000) : 'Nespecificat';
    const openedByText = user ? user.toString() : `<@${ticket.userId}>`;
    const closedByText = interaction.user ? interaction.user.toString() : `<@${ticket.closedBy}>`;
    const claimedByText = ticket.claimedBy
      ? (staff ? staff.toString() : `<@${ticket.claimedBy}>`)
      : 'Not claimed';

    const logEmbed = new EmbedBuilder()
      .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
      .setTitle('Ticket Closed')
      .addFields(
        { name: '<:application_approvment:1454163599835664577> Ticket ID', value: ticketId, inline: true },
        { name: '<:770592checkmark:1454744990793334926> Opened By', value: openedByText, inline: true },
        { name: '<:ticket:1454169618552852696> Closed By', value: closedByText, inline: true },
        { name: '<:drip_timeout1:1454762411763437589> Open Time', value: openedAt, inline: false },
        { name: '<:1447184207838445660:1454745202760880180> Claimed By', value: claimedByText, inline: false },
        { name: '<:help:1454164071719899301> Reason', value: reasonText, inline: false }
      )
      .setColor(0xed4245)
      .setTimestamp(ticket.closedAt ? new Date(ticket.closedAt) : new Date());

    const payload = transcriptAttachment
      ? { embeds: [logEmbed], files: [transcriptAttachment] }
      : { embeds: [logEmbed] };
    const sent = await transcriptChannel.send(payload).catch(() => null);

    if (sent) {
      if (!transcriptUrl && transcriptAttachment && sent.attachments?.size) {
        const attachmentUrl = sent.attachments.first()?.url;
        if (attachmentUrl) transcriptUrl = attachmentUrl;
      }

      if (transcriptUrl) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('View Transcript')
            .setEmoji('🧾')
            .setURL(transcriptUrl)
        );
        await sent.edit({ components: [row] }).catch(() => null);
      }
    }
  }

  if (config.dmTranscriptOnClose === true) {
    const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);
    if (user) {
      const guildName = channel.guild?.name ? String(channel.guild.name) : 'Ticket System';
      const guildIconUrl = typeof channel.guild?.iconURL === 'function' ? channel.guild.iconURL() : null;
      const openedAt = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('ro-RO') : 'Nespecificat';
      const reasonText = ticket.closeReason ? String(ticket.closeReason).slice(0, 1000) : 'Nespecificat';
      const openedByText = `<@${ticket.userId}>`;
      const closedByText = interaction.user ? interaction.user.toString() : `<@${ticket.closedBy}>`;

      const claimedByText = ticket.claimedBy
        ? `<@${ticket.claimedBy}>`
        : 'Not claimed';

      const dmEmbed = new EmbedBuilder()
        .setAuthor({ name: guildName, iconURL: guildIconUrl || undefined })
        .setTitle('Ticket Closed')
        .addFields(
          { name: '<:application_approvment:1454163599835664577> Ticket ID', value: ticketId, inline: true },
          { name: '<:770592checkmark:1454744990793334926> Opened By', value: openedByText, inline: true },
          { name: '<:ticket:1454169618552852696> Closed By', value: closedByText, inline: true },
          { name: '<:drip_timeout1:1454762411763437589> Open Time', value: openedAt, inline: false },
          { name: '<:1447184207838445660:1454745202760880180> Claimed By', value: claimedByText, inline: false },
          { name: '<:help:1454164071719899301> Reason', value: reasonText, inline: false }
        )
        .setColor(0xed4245)
        .setTimestamp(ticket.closedAt ? new Date(ticket.closedAt) : new Date());

      if (transcriptUrl) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('View Transcript')
            .setEmoji('🧾')
            .setURL(transcriptUrl)
        );
        await user.send({ embeds: [dmEmbed], components: [row] }).catch(() => null);
      } else {
        await user.send({ embeds: [dmEmbed] }).catch(() => null);
      }
    }
  }

  await channel.send({ embeds: [buildClosedStatusEmbed(ticket.closeReason)] }).catch(() => null);
  await channel.send({ content: 'Ticketul a fost inchis. Canalul se va sterge in 5 secunde.' }).catch(() => null);
  await replyEphemeral(interaction, 'Ticket inchis.').catch(() => null);

  setTimeout(async () => {
    await channel.delete('Ticket inchis').catch(() => null);
  }, 5000);
}

async function handleTranscript(interaction, ticketId) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa generezi transcript pentru acest ticket.');
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased()) {
    await replyEphemeral(interaction, 'Canal invalid.');
    return;
  }

  let transcriptUrl = null;
  let transcriptAttachment = null;

  if (isHostedTranscriptEnabled()) {
    transcriptUrl = getHostedTranscriptUrl(ticketId);
    try {
      await tryGenerateHostedTranscript(channel, ticketId);
    } catch {
      transcriptUrl = null;
    }
  } else {
    transcriptAttachment = await generateTranscriptAttachment(channel, ticketId);
  }

  const transcriptChannel = channel.guild.channels.cache.get(getTranscriptChannelId());
  if (transcriptChannel && transcriptChannel.isTextBased()) {
    const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);
    const staff = ticket.claimedBy ? await channel.guild.members.fetch(ticket.claimedBy).catch(() => null) : null;

    const logEmbed = new EmbedBuilder()
      .setTitle('🧾 Transcript ticket (manual)')
      .addFields(
        { name: 'ID ticket', value: ticketId, inline: true },
        { name: 'Tip', value: TicketLabels[ticket.type] || ticket.type, inline: true },
        { name: 'User', value: user ? user.toString() : `<@${ticket.userId}>`, inline: false },
        { name: 'Staff', value: staff ? staff.toString() : 'Nerandat / nepreluat', inline: false },
        { name: 'Canal', value: channel.toString(), inline: false }
      )
      .setColor(0x2b2d31)
      .setTimestamp();

    const payload = transcriptAttachment
      ? { embeds: [logEmbed], files: [transcriptAttachment] }
      : { embeds: [logEmbed] };
    const sent = await transcriptChannel.send(payload).catch(() => null);

    if (sent) {
      if (!transcriptUrl && transcriptAttachment && sent.attachments?.size) {
        transcriptUrl = sent.attachments.first()?.url || null;
      }

      if (transcriptUrl) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('View Transcript')
            .setEmoji('🧾')
            .setURL(transcriptUrl)
        );
        await sent.edit({ components: [row] }).catch(() => null);
      }
    }
  }

  await replyEphemeral(interaction, 'Transcript generat.');
}

async function handleCloseRequest(interaction, ticketId) {
  const tickets = loadTickets();
  const ticket = tickets[ticketId];
  if (!ticket) {
    await replyEphemeral(interaction, 'Nu am gasit datele pentru acest ticket.');
    return;
  }

  if (!isStaff(interaction.member) && interaction.user.id !== ticket.userId) {
    await replyEphemeral(interaction, 'Nu ai permisiunea sa inchizi acest ticket.');
    return;
  }

  if (ticket.closed) {
    await replyEphemeral(interaction, 'Ticketul este deja inchis.');
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_confirm_${ticketId}`)
      .setLabel('Confirm Close')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`ticket_close_cancel_${ticketId}`)
      .setLabel('Cancel')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  await replyEphemeralPayload(interaction, { content: 'Esti sigur ca vrei sa inchizi ticketul?', components: [row] });
}

client.on(Events.MessageCreate, async (message) => {
  if (!message || !message.content) return;
  if (message.author?.bot) return;
  if (!message.inGuild()) return;

  const content = String(message.content).trim();
  if (content.toLowerCase() !== '#panel') return;

  const requiredRoleId = typeof config.panelCommandRoleId === 'string' ? config.panelCommandRoleId.trim() : '';
  if (!requiredRoleId || !message.member?.roles?.cache?.has(requiredRoleId)) {
    await message.reply('Nu ai permisiunea sa folosesti aceasta comanda.').catch(() => null);
    return;
  }

  const embed = createTicketPanelEmbed();
  const buttons = createTicketPanelButtons();
  await message.channel.send({ embeds: [embed], components: [buttons] }).catch(() => null);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const name = interaction.commandName;
    await interaction.deferReply({ flags: 64 }).catch(() => null);

    if (name === 'tickets-setup') {
      const okAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
      const requiredRoleId = typeof config.panelCommandRoleId === 'string' ? config.panelCommandRoleId.trim() : '';
      const okRole = requiredRoleId ? interaction.member?.roles?.cache?.has(requiredRoleId) : false;

      if (!okAdmin && !okRole) {
        await replyEphemeral(interaction, 'Nu ai permisiunea sa folosesti aceasta comanda.');
        return;
      }

      const embed = createTicketPanelEmbed();
      const buttons = createTicketPanelButtons();
      await interaction.channel?.send({ embeds: [embed], components: [buttons] }).catch(() => null);
      await replyEphemeral(interaction, 'Panel trimis.');
      return;
    }

    if (name === 'help') {
      await replyEphemeralPayload(interaction, { embeds: [buildHelpEmbed()] });
      return;
    }

    const found = getTicketByChannelId(interaction.channelId);
    if (!found) {
      await replyEphemeral(interaction, 'Comanda poate fi folosita doar intr-un canal de ticket.');
      return;
    }
    const { ticketId } = found;

    if (name === 'claim') {
      await handleClaim(interaction, ticketId);
      return;
    }

    if (name === 'unclaim') {
      await handleUnclaim(interaction, ticketId);
      return;
    }

    if (name === 'close') {
      const reason = interaction.options.getString('motiv') || undefined;
      await handleClose(interaction, ticketId, reason);
      return;
    }

    if (name === 'transcript') {
      await handleTranscript(interaction, ticketId);
      return;
    }

    if (name === 'rename') {
      const newName = interaction.options.getString('name', true);
      await handleRename(interaction, ticketId, newName);
      return;
    }

    if (name === 'add') {
      const user = interaction.options.getUser('user', true);
      await handleAddRemove(interaction, ticketId, user, 'add');
      return;
    }

    if (name === 'remove') {
      const user = interaction.options.getUser('user', true);
      await handleAddRemove(interaction, ticketId, user, 'remove');
      return;
    }

    if (name === 'switchpanel') {
      const categorie = interaction.options.getString('categorie', true);
      await handleSwitchPanel(interaction, ticketId, categorie);
      return;
    }

    await replyEphemeral(interaction, 'Comanda necunoscuta.');
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_select') {
      const value = interaction.values[0];
      await interaction.deferReply({ flags: 64 }).catch(() => null);
      await createTicket(interaction, value, null);
      return;
    }
  }

  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id.startsWith('ticket_claim_')) {
      const ticketId = id.split('ticket_claim_')[1];
      await interaction.deferReply({ flags: 64 }).catch(() => null);
      return handleClaim(interaction, ticketId);
    }

    if (id.startsWith('ticket_close_confirm_')) {
      const ticketId = id.split('ticket_close_confirm_')[1];
      await interaction.deferReply({ flags: 64 }).catch(() => null);
      await handleClose(interaction, ticketId, undefined);
      return;
    }

    if (id.startsWith('ticket_close_cancel_')) {
      await replyEphemeral(interaction, 'Ok, anulata.');
      return;
    }

    if (id.startsWith('ticket_close_')) {
      const ticketId = id.split('ticket_close_')[1];
      return handleCloseRequest(interaction, ticketId);
    }

    if (id.startsWith('ticket_transcript_')) {
      const ticketId = id.split('ticket_transcript_')[1];
      await interaction.deferReply({ flags: 64 }).catch(() => null);
      return handleTranscript(interaction, ticketId);
    }
  }
});

if (typeof config.token !== 'string' || !config.token.trim()) {
  console.error('Lipseste token-ul. Seteaza DISCORD_TOKEN in ENV (recomandat pe hosting) sau completeaza token in config_js.json.');
  process.exit(1);
}

client.login(config.token);
