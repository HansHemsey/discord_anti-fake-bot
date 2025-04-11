import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

class Logger {
    constructor() {
        this.logFile = path.join(process.cwd(), 'audit.log');
    }

    /**
     * Logs an action to both Discord and file system
     * @param {Object} options - Logging options
     * @param {TextChannel} options.channel - Discord channel to log to
     * @param {string} options.type - Type of action (verify, ban, suspect)
     * @param {GuildMember} options.member - Member involved
     * @param {GuildMember} options.moderator - Moderator who performed the action
     * @param {string[]} options.reasons - Reasons for the action
     */
    async log({ channel, type, member, moderator, reasons = [] }) {
        // Create Discord embed
        const embed = this.createEmbed(type, member, moderator, reasons);
        
        // Send to Discord channel
        if (channel) {
            await channel.send({ embeds: [embed] });
        }

        // Log to file
        this.logToFile(type, member, moderator, reasons);
    }

    /**
     * Creates a Discord embed for the log message
     */
    createEmbed(type, member, moderator, reasons) {
        const embeds = {
            verify: {
                color: '#00FF00',
                title: '✅ Compte vérifié',
                description: `${member.user.tag} a été vérifié par ${moderator.user.tag}`
            },
            suspect: {
                color: '#FFA500',
                title: '⚠️ Compte suspect',
                description: `${member.user.tag} a été marqué comme suspect`
            },
            ban: {
                color: '#FF0000',
                title: '❌ Membre banni',
                description: `${member.user.tag} a été banni par ${moderator.user.tag}`
            }
        };

        const embed = new EmbedBuilder()
            .setColor(embeds[type].color)
            .setTitle(embeds[type].title)
            .setDescription(embeds[type].description)
            .addFields(
                { name: 'Membre', value: `${member.user.tag} (${member.user.id})`, inline: true },
                { name: 'Modérateur', value: moderator.user.tag, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setTimestamp();

        if (reasons.length > 0) {
            embed.addFields({ name: 'Raisons', value: reasons.join('\n') });
        }

        return embed;
    }

    /**
     * Logs the action to the audit file
     */
    logToFile(type, member, moderator, reasons) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            type,
            member: {
                id: member.user.id,
                tag: member.user.tag
            },
            moderator: {
                id: moderator.user.id,
                tag: moderator.user.tag
            },
            reasons
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(this.logFile, logLine);
    }
}

export const logger = new Logger(); 