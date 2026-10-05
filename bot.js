require("dotenv").config();

const { Telegraf } = require("telegraf");
const db = require("./database");

const bot = new Telegraf(process.env.BOT_TOKEN);

const REQUIRED_MEMBERS = 25;
const warningCooldown = new Map();
const WARNING_COOLDOWN = 60 * 1000;
// ===============================
// START
// ===============================

bot.start((ctx) => {
  ctx.reply("👋 Hello! I am your Group Guard Bot.");
});

// ===============================
// TEST
// ===============================

bot.command("test", (ctx) => {
  ctx.reply("✅ Bot is working!");
});

// ===============================
// RULES
// ===============================

bot.command("rules", async (ctx) => {
  await ctx.reply(
    `📋 GROUP RULES\n\n` +
      `1️⃣ ሊንክ መላክ አይፈቀድም።\n` +
      `2️⃣ Forwarded message መላክ አይፈቀድም።\n` +
      `3️⃣ መጀመሪያ ቢያንስ 25 ሰው አድ ማድረግ አለብዎት።\n` +
      `4️⃣ Admins ከእነዚህ restrictions ነፃ ናቸው።\n\n` +
      `📞 የትኛውም ሀሳብና ጥያቄ ካሎት @abdu810 ላይ ያናግሩን።`,
  );
});

// ===============================
// HELP
// ===============================

bot.command("help", async (ctx) => {
  await ctx.reply(
    `🤖 GROUP GUARD BOT\n\n` +
      `📌 Available Commands:\n\n` +
      `/status - የእርስዎን invite status ይመልከቱ\n` +
      `/rules - የGroup rules ይመልከቱ\n` +
      `/help - የhelp menu ይመልከቱ\n\n` +
      `👥 Required members: 25`,
  );
});

// ===============================
// CHECK ADMIN
// ===============================

async function isAdmin(ctx) {
  try {
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);

    return member.status === "administrator" || member.status === "creator";
  } catch (error) {
    console.log("❌ Admin check:", error.message);
    return false;
  }
}

// ===============================
// USER DATABASE
// ===============================

function getOrCreateUser(user) {
  let existingUser = db
    .prepare("SELECT * FROM users WHERE user_id = ?")
    .get(user.id);

  if (!existingUser) {
    db.prepare(
      `
      INSERT INTO users (
        user_id,
        first_name,
        username,
        invited_count,
        warnings,
        allowed
      )
      VALUES (?, ?, ?, 0, 0, 0)
    `,
    ).run(user.id, user.first_name || "", user.username || "");

    existingUser = db
      .prepare("SELECT * FROM users WHERE user_id = ?")
      .get(user.id);
  }

  return existingUser;
}

// ===============================
// ADD INVITES
// ===============================

function addInviteCount(user, amount) {
  getOrCreateUser(user);

  db.prepare(
    `
    UPDATE users
    SET invited_count = invited_count + ?
    WHERE user_id = ?
  `,
  ).run(amount, user.id);

  const updatedUser = db
    .prepare("SELECT * FROM users WHERE user_id = ?")
    .get(user.id);

  if (updatedUser.invited_count >= REQUIRED_MEMBERS) {
    db.prepare(
      `
      UPDATE users
      SET allowed = 1
      WHERE user_id = ?
    `,
    ).run(user.id);
  }

  return db.prepare("SELECT * FROM users WHERE user_id = ?").get(user.id);
}

// ===============================
// STATUS
// ===============================

bot.command("status", async (ctx) => {
  try {
    const user = getOrCreateUser(ctx.from);

    const remaining = Math.max(0, REQUIRED_MEMBERS - user.invited_count);

    if (user.allowed === 1) {
      await ctx.reply(
        `👤 ${ctx.from.first_name}\n\n` +
          `👥 ያስገቡት ሰው: ${user.invited_count}\n` +
          `🎯 የሚያስፈልገው: ${REQUIRED_MEMBERS}\n\n` +
          `✅ አሁን መልዕክት መላክ ይችላሉ።`,
      );

      return;
    }

    await ctx.reply(
      `👤 ${ctx.from.first_name}\n\n` +
        `👥 ያስገቡት ሰው: ${user.invited_count}\n` +
        `🎯 የሚያስፈልገው: ${REQUIRED_MEMBERS}\n` +
        `⏳ የቀረው: ${remaining}\n\n` +
        `እባኮ መጀመሪያ ቢያንስ 25 ሰው አድ ያድርጉ።\n\n` +
        `የትኛውም ሀሳብና ጥያቄ ካሎት ` +
        `@abdu810 ላይ ያናግሩን።`,
    );
  } catch (error) {
    console.log("❌ Status error:", error.message);
  }
});

// ===============================
// MY ID
// ===============================

bot.command("myid", async (ctx) => {
  try {
    await ctx.reply(`🆔 Your Telegram ID:\n\n` + `${ctx.from.id}`);
  } catch (error) {
    console.log("❌ MyID error:", error.message);
  }
});
// ===============================
// USER LOOKUP
// ===============================

bot.command("user", async (ctx) => {
  try {
    const admin = await isAdmin(ctx);

    if (!admin) {
      await ctx.reply("⛔ This command is only for administrators.");
      return;
    }

    const parts = ctx.message.text.trim().split(/\s+/);

    if (parts.length < 2) {
      await ctx.reply("❌ Usage:\n\n/user USER_ID");
      return;
    }

    const userId = Number(parts[1]);

    if (!Number.isInteger(userId)) {
      await ctx.reply("❌ Invalid user ID.");
      return;
    }

    const user = db
      .prepare("SELECT * FROM users WHERE user_id = ?")
      .get(userId);

    if (!user) {
      await ctx.reply("❌ User not found in the database.");
      return;
    }

    const remaining = Math.max(0, REQUIRED_MEMBERS - user.invited_count);

    await ctx.reply(
      `👤 USER INFORMATION\n\n` +
        `Name: ${user.first_name}\n` +
        `Username: ${user.username || "None"}\n` +
        `🆔 ID: ${user.user_id}\n\n` +
        `👥 Invited: ${user.invited_count}\n` +
        `🎯 Required: ${REQUIRED_MEMBERS}\n` +
        `⏳ Remaining: ${remaining}\n` +
        `✅ Allowed: ${user.allowed === 1 ? "Yes" : "No"}`,
    );
  } catch (error) {
    console.log("❌ User lookup error:", error.message);
  }
});
// ===============================
// ADMIN STATS
// ===============================

bot.command("stats", async (ctx) => {
  try {
    const admin = await isAdmin(ctx);

    if (!admin) {
      await ctx.reply("⛔ This command is only for administrators.");

      return;
    }

    const totalUsers = db.prepare("SELECT COUNT(*) AS count FROM users").get();

    const completedUsers = db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE allowed = 1")
      .get();

    const totalInvites = db
      .prepare("SELECT COALESCE(SUM(invited_count), 0) AS count FROM users")
      .get();

    await ctx.reply(
      `📊 GROUP STATISTICS\n\n` +
        `👤 Tracked users: ${totalUsers.count}\n` +
        `✅ Completed 25 members: ${completedUsers.count}\n` +
        `👥 Total recorded invites: ${totalInvites.count}`,
    );
  } catch (error) {
    console.log("❌ Stats error:", error.message);
  }
});

// ===============================
// LINK DETECTION
// ===============================

const linkRegex =
  /(https?:\/\/[^\s]+|www\.[^\s]+|t\.me\/[^\s]+|telegram\.me\/[^\s]+)/i;

// ===============================
// NEW MEMBERS
// ===============================
// ===============================
// NEW MEMBERS
// ===============================

bot.on("new_chat_members", async (ctx) => {
  try {
    const newMembers = ctx.message.new_chat_members;
    const inviter = ctx.from;

    // Ignore bots
    const realMembers = newMembers.filter((member) => !member.is_bot);

    if (realMembers.length === 0) {
      return;
    }

    // Admins do not get invite credit
    const admin = await isAdmin(ctx);

    if (admin) {
      return;
    }

    getOrCreateUser(inviter);

    let newInviteCount = 0;

    for (const member of realMembers) {
      // Check if this member was already counted
      const alreadyInvited = db
        .prepare(
          `
          SELECT * FROM invited_members
          WHERE inviter_id = ? AND member_id = ?
        `,
        )
        .get(inviter.id, member.id);

      if (alreadyInvited) {
        continue;
      }

      // Save the invited member
      db.prepare(
        `
        INSERT INTO invited_members (
          inviter_id,
          member_id
        )
        VALUES (?, ?)
      `,
      ).run(inviter.id, member.id);

      newInviteCount++;
    }

    // Nothing new to count
    if (newInviteCount === 0) {
      return;
    }

    // Add only new invites
    const updatedUser = addInviteCount(inviter, newInviteCount);

    console.log(
      `👥 ${inviter.first_name} invited ` +
        `${newInviteCount} new member(s). ` +
        `Total: ${updatedUser.invited_count}`,
    );

    // User reached 25
    if (
      updatedUser.invited_count >= REQUIRED_MEMBERS &&
      updatedUser.allowed === 1
    ) {
      await ctx.reply(
        `🎉 Congratulations ${inviter.first_name}!\n\n` +
          `You have added ${updatedUser.invited_count} members.\n\n` +
          `✅ You can now send messages in the group.`,
      );
    }
  } catch (error) {
    console.log("❌ Invite error:", error.message);
  }
});
// ===============================
// MESSAGE MODERATION
// ===============================

bot.on("message", async (ctx) => {
  try {
    const message = ctx.message;

    // Ignore commands
    if (message.text && message.text.startsWith("/")) {
      return;
    }

    // Ignore service messages
    if (
      message.new_chat_members ||
      message.left_chat_member ||
      message.new_chat_title ||
      message.new_chat_photo
    ) {
      return;
    }

    // Admins are allowed
    const admin = await isAdmin(ctx);

    if (admin) {
      return;
    }

    // Check 25 members
    const user = getOrCreateUser(ctx.from);
    if (user.allowed !== 1) {
      await ctx.deleteMessage();

      const now = Date.now();
      const lastWarning = warningCooldown.get(user.user_id) || 0;

      // Send warning only once every 60 seconds
      if (now - lastWarning >= WARNING_COOLDOWN) {
        warningCooldown.set(user.user_id, now);

        const remaining = Math.max(0, REQUIRED_MEMBERS - user.invited_count);

        await ctx.telegram.sendMessage(
          ctx.chat.id,
          `እባኮ መጀመሪያ ቢያንስ 25 ሰው አድ ያድርጉ።\n\n` +
            `ያስገቡት: ${user.invited_count}\n` +
            `የቀረው: ${remaining}\n\n` +
            `የትኛውም ሀሳብና ጥያቄ ካሎት ` +
            `@abdu810 ላይ ያናግሩን።`,
        );
      }

      return;
    }

    // Delete forwarded messages
    if (
      message.forward_origin ||
      message.forward_from ||
      message.forward_from_chat
    ) {
      await ctx.deleteMessage();

      console.log(`🗑️ Forward deleted from ${ctx.from.first_name}`);

      return;
    }

    // Delete links
    const text = message.text || message.caption || "";

    if (linkRegex.test(text)) {
      await ctx.deleteMessage();

      console.log(`🗑️ Link deleted from ${ctx.from.first_name}`);

      return;
    }
  } catch (error) {
    console.log("❌ Moderation error:", error.message);
  }
});

// ===============================
// START BOT
// ===============================

bot.launch();

console.log("🤖 Group Guard Bot is running...");

// Stop safely
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
