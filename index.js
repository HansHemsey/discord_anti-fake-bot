import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import dotenv from 'dotenv';
import { logger } from './logger.js';

// Load environment variables
dotenv.config();

// Whitelist of authorized bots
const AUTHORIZED_BOTS = ['Webhook#0000'];

// Admin list (IDs or usernames)
const ADMINS = [process.env.ADMIN_ID]; // ID Discord de l'administrateur

// Rate limiting configuration
const VERIFICATION_LIMIT = 5; // Verifications per hour
const VERIFICATION_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds
const verificationTracker = new Map(); // Map<moderatorId, {count: number, resetTime: number}>

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages
    ]
});

/**
 * Checks if a moderator has reached their verification limit
 * @param {string} moderatorId - The ID of the moderator
 * @param {string} moderatorTag - The tag of the moderator
 * @returns {Object} { canVerify: boolean, remaining: number, resetTime: number }
 */
function checkVerificationLimit(moderatorId, moderatorTag) {
    // Check if user is an admin
    if (ADMINS.includes(moderatorId) || ADMINS.includes(moderatorTag)) {
        return { canVerify: true, remaining: '∞', resetTime: 0 };
    }

    const now = Date.now();
    const moderatorData = verificationTracker.get(moderatorId);

    if (!moderatorData || now >= moderatorData.resetTime) {
        // Reset or initialize tracker
        verificationTracker.set(moderatorId, {
            count: 1,
            resetTime: now + VERIFICATION_WINDOW
        });
        return { canVerify: true, remaining: VERIFICATION_LIMIT - 1, resetTime: now + VERIFICATION_WINDOW };
    }

    if (moderatorData.count >= VERIFICATION_LIMIT) {
        return { canVerify: false, remaining: 0, resetTime: moderatorData.resetTime };
    }

    // Increment count
    moderatorData.count++;
    return { canVerify: true, remaining: VERIFICATION_LIMIT - moderatorData.count, resetTime: moderatorData.resetTime };
}

/**
 * Checks if a Discord account is suspicious based on various criteria
 * @param {GuildMember} member - The member to check
 * @returns {Object} Object containing suspicious status and reasons
 */
function checkSuspiciousAccount(member) {
    const reasons = [];
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    // Check account age
    if (now - member.user.createdTimestamp < sevenDays) {
        reasons.push('Compte créé il y a moins de 7 jours');
    }

    // Check generic username
    if (/^[a-z]+[0-9]+$/i.test(member.user.username)) {
        reasons.push('Pseudo générique (ex: User12345)');
    }

    // Check avatar
    if (!member.user.avatar) {
        reasons.push('Pas d\'avatar personnalisé');
    }

    // Check for suspicious bot
    if (member.user.bot) {
        const botTag = `${member.user.username}#${member.user.discriminator}`;
        
        // Check if bot is in whitelist
        if (!AUTHORIZED_BOTS.includes(botTag)) {
            // Check for suspicious bot names
            const suspiciousPatterns = [
                /nitro/i,
                /generator/i,
                /free/i,
                /gift/i,
                /discord/i,
                /bot/i
            ];

            const isSuspiciousName = suspiciousPatterns.some(pattern => 
                pattern.test(member.user.username)
            );

            if (isSuspiciousName) {
                reasons.push('Bot malveillant détecté');
            }
        }
    }

    return {
        isSuspicious: reasons.length > 0,
        reasons
    };
}

/**
 * Handles automatic ban of malicious bots
 * @param {GuildMember} member - The member to check
 * @param {GuildMember} moderator - The moderator to notify
 */
async function handleMaliciousBot(member, moderator) {
    try {
        // Add 10 second timeout before ban
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        await member.ban({ reason: 'Bot malveillant' });
        
        // Find modlog channel
        const modlogChannel = member.guild.channels.cache.find(
            channel => channel.name === 'modlog'
        );

        // Log the ban action
        if (modlogChannel) {
            await logger.log({
                channel: modlogChannel,
                type: 'ban',
                member,
                moderator,
                reasons: ['Bot malveillant']
            });
        }

        // Send DM to moderator
        const dmEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⚠️ Bot malveillant banni')
            .setDescription(`Le bot ${member.user.tag} a été automatiquement banni après un délai de 10 secondes.`)
            .addFields(
                { name: 'ID', value: member.user.id, inline: true },
                { name: 'Raison', value: 'Bot malveillant', inline: true }
            )
            .setTimestamp();

        await moderator.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.error('Erreur lors du bannissement automatique:', error);
    }
}

// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log(`Bot is ready! Logged in as ${client.user.tag}`);
});

// Handle new members
client.on('guildMemberAdd', async (member) => {
    const result = checkSuspiciousAccount(member);
    
    if (result.isSuspicious) {
        // Find the modlog channel
        const modlogChannel = member.guild.channels.cache.find(
            channel => channel.name === 'modlog'
        );

        if (modlogChannel) {
            // Log the suspicious account
            await logger.log({
                channel: modlogChannel,
                type: 'suspect',
                member,
                moderator: member.guild.members.me,
                reasons: result.reasons
            });

            // If it's a malicious bot, ban it automatically
            if (member.user.bot && result.reasons.includes('Bot malveillant détecté')) {
                // Find a moderator to notify
                const moderator = member.guild.members.cache.find(m => 
                    m.permissions.has('BanMembers')
                );

                if (moderator) {
                    await handleMaliciousBot(member, moderator);
                }
            }
        }
    }
});

// Handle messages
client.on('messageCreate', async (message) => {
    // Ignore DMs and non-guild messages
    if (!message.guild) return;

    console.log('📨 Message reçu:', {
        content: message.content,
        author: message.author.tag,
        channel: message.channel.name,
        guild: message.guild.name
    });

    if (message.author.bot) {
        console.log('🤖 Message ignoré: envoyé par un bot');
        return;
    }

    if (!message.content.startsWith('!verify')) {
        console.log('❌ Message ignoré: ne commence pas par !verify');
        return;
    }

    // Check bot permissions
    const botPermissions = message.guild.members.me.permissions;
    console.log('🔍 Permissions du bot:', {
        viewChannel: botPermissions.has(PermissionsBitField.Flags.ViewChannel),
        sendMessages: botPermissions.has(PermissionsBitField.Flags.SendMessages),
        banMembers: botPermissions.has(PermissionsBitField.Flags.BanMembers),
        kickMembers: botPermissions.has(PermissionsBitField.Flags.KickMembers),
        manageMessages: botPermissions.has(PermissionsBitField.Flags.ManageMessages)
    });

    if (!botPermissions.has(PermissionsBitField.Flags.ViewChannel) ||
        !botPermissions.has(PermissionsBitField.Flags.SendMessages) ||
        !botPermissions.has(PermissionsBitField.Flags.BanMembers)) {
        console.log('🔒 Permissions manquantes pour le bot');
        return message.reply('Le bot n\'a pas les permissions nécessaires. Veuillez vérifier ses permissions dans les paramètres du serveur.');
    }

    // Check user permissions
    const userPermissions = message.member.permissions;
    console.log('🔍 Permissions de l\'utilisateur:', {
        kickMembers: userPermissions.has(PermissionsBitField.Flags.KickMembers),
        banMembers: userPermissions.has(PermissionsBitField.Flags.BanMembers)
    });

    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        console.log('🔒 Permissions manquantes pour l\'utilisateur:', message.author.tag);
        return message.reply('Vous n\'avez pas la permission d\'utiliser cette commande.');
    }

    // Check verification limit
    const limitCheck = checkVerificationLimit(message.author.id, message.author.tag);
    if (!limitCheck.canVerify && limitCheck.remaining !== '∞') {
        const timeLeft = Math.ceil((limitCheck.resetTime - Date.now()) / 1000 / 60);
        return message.reply(`Vous avez atteint la limite de vérifications (${VERIFICATION_LIMIT}/heure). Réessayez dans ${timeLeft} minutes.`);
    }

    // Check if user is mentioned
    const targetMember = message.mentions.members.first();
    if (!targetMember) {
        return message.reply('Veuillez mentionner un utilisateur à vérifier.');
    }

    const result = checkSuspiciousAccount(targetMember);

    // Create embed
    const embed = new EmbedBuilder()
        .setColor(result.isSuspicious ? '#FF0000' : '#00FF00')
        .setTitle(`Vérification de ${targetMember.user.tag}`)
        .setDescription(result.isSuspicious ? '⚠️ Compte suspect détecté' : '✅ Compte vérifié')
        .addFields(
            { name: 'Membre', value: `${targetMember.user.tag} (${targetMember.user.id})`, inline: true },
            { name: 'Compte créé le', value: `<t:${Math.floor(targetMember.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Vérifications restantes', value: limitCheck.remaining === '∞' ? '∞' : `${limitCheck.remaining}/${VERIFICATION_LIMIT}`, inline: true }
        )
        .setThumbnail(targetMember.user.displayAvatarURL())
        .setTimestamp();

    if (result.isSuspicious) {
        embed.addFields({ name: 'Raisons', value: result.reasons.join('\n') });
    }

    // Create buttons
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`ban_${targetMember.id}`)
                .setLabel('Ban')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`pardon_${targetMember.id}`)
                .setLabel('Pardon')
                .setStyle(ButtonStyle.Success)
        );

    const response = await message.reply({ 
        embeds: [embed],
        components: [row]
    });

    // Create collector for buttons
    const collector = response.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
        if (!interaction.member.permissions.has('BanMembers')) {
            return interaction.reply({ content: 'Vous n\'avez pas la permission d\'utiliser ces boutons.', ephemeral: true });
        }

        const [action, userId] = interaction.customId.split('_');

        // Find modlog channel
        const modlogChannel = interaction.guild.channels.cache.find(
            channel => channel.name === 'modlog'
        );

        if (action === 'ban') {
            try {
                await targetMember.ban({ reason: 'Compte suspect' });
                
                // Log the ban action
                if (modlogChannel) {
                    await logger.log({
                        channel: modlogChannel,
                        type: 'ban',
                        member: targetMember,
                        moderator: interaction.member,
                        reasons: result.reasons
                    });
                }

                await interaction.reply({ content: `${targetMember.user.tag} a été banni.`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: 'Erreur lors du bannissement.', ephemeral: true });
            }
        } else if (action === 'pardon') {
            // Log the verification
            if (modlogChannel) {
                await logger.log({
                    channel: modlogChannel,
                    type: 'verify',
                    member: targetMember,
                    moderator: interaction.member
                });
            }

            await interaction.reply({ content: `${targetMember.user.tag} a été pardonné.`, ephemeral: true });
        }

        // Disable buttons after use
        row.components.forEach(button => button.setDisabled(true));
        await response.edit({ components: [row] });
    });

    collector.on('end', () => {
        row.components.forEach(button => button.setDisabled(true));
        response.edit({ components: [row] }).catch(() => {});
    });
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN); 