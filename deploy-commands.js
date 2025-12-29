import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error('Lipsesc env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('tickets-setup')
    .setDescription('Trimite panoul de tickete (Admin)')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Arata comenzile botului')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Preia ticketul (Staff)')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('unclaim')
    .setDescription('Renunta la claim (Staff)')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Inchide ticketul')
    .addStringOption(o => o.setName('motiv').setDescription('Motiv inchidere').setRequired(false))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Genereaza transcript (Staff/Owner ticket)')
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Redenumeste ticketul')
    .addStringOption(o => o.setName('name').setDescription('Noul nume').setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Adauga user in ticket')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Scoate user din ticket')
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName('switchpanel')
    .setDescription('Muta ticketul in alta categorie')
    .addStringOption(o =>
      o
        .setName('categorie')
        .setDescription('Categoria noua')
        .setRequired(true)
        .addChoices(
          { name: 'Owner', value: 'contact_owner' },
          { name: 'Staff Report', value: 'report_staff' },
          { name: 'Ban Report', value: 'ban_reports' },
          { name: 'Member Report', value: 'report_member' },
          { name: 'Help & Info', value: 'info_others' }
        )
    )
    .setDMPermission(false)
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

try {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Registered ${commands.length} guild commands for ${guildId}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
