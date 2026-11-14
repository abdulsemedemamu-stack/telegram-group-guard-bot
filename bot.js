require("dotenv").config();

const http = require("http");
const { Telegraf } = require("telegraf");
const { pool, initDatabase } = require("./database");

const bot = new Telegraf(process.env.BOT_TOKEN);

const REQUIRED_MEMBERS = 25;
const warningCooldown = new Map();
const WARNING_COOLDOWN = 60 * 1000;

// ===============================
// DATABASE HELPERS
// ===============================

async function getOrCreateUser(user) {
  let result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
    user.id,
  ]);

  if (result.rows.length === 0) {
    await pool.query(
      `
      INSERT INTO users (
        user_id,
        first_name,
        username,
        invited_count,
        warnings,
        allowed
      )
      VALUES ($1, $2, $3, 0, 0, 0)
      `,
      [user.id, user.first_name || "", user.username || ""],
    );

    result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      user.id,
    ]);
  }

  return result.rows[0];
}

// ===============================
// ADD INVITES
// ===============================

async function addInviteCount(user, amount) {
  await getOrCreateUser(user);

  await pool.query(
    `
    UPDATE users
    SET invited_count = invited_count + $1
    WHERE user_id = $2
    `,
    [amount, user.id],
  );

  await pool.query(
    `
    UPDATE users
    SET allowed = 1
    WHERE user_id = $1
      AND invited_count >= $2
    `,
    [user.id, REQUIRED_MEMBERS],
  );

  const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
    user.id,
  ]);

  return result.rows[0];
}

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
// START
// ===============================

bot.start(async (ctx) => {
  await ctx.reply("👋 Hello! I am your Group Guard Bot.");
});

// ===============================
// TEST
// ===============================

bot.command("test", async (ctx) => {
  await ctx.reply("✅ Bot is working!");
});

// ===============================
// MY ID
// ===============================

bot.command("myid", async (ctx) => {
  try {
    await ctx.reply(`🆔 Your Telegram ID:\n\n${ctx.from.id}`);
  } catch (error) {
    console.log("❌ MyID error:", error.message);
  }
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
      `/help - የhelp menu ይመልከቱ\n` +
      `/myid - የTelegram ID ይመልከቱ\n\n` +
      `👥 Required members: 25`,
  );
});

// ===============================
// STATUS
// ===============================

bot.command("status", async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx.from);
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
// ADMIN STATS
// ===============================

bot.command("stats", async (ctx) => {
  try {
    const admin = await isAdmin(ctx);

    if (!admin) {
      await ctx.reply("⛔ This command is only for administrators.");
      return;
    }

    const totalUsers = await pool.query("SELECT COUNT(*) AS count FROM users");

    const completedUsers = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM users
      WHERE allowed = 1
      `,
    );

    const totalInvites = await pool.query(
      `
      SELECT COALESCE(SUM(invited_count), 0) AS count
      FROM users
      `,
    );

    await ctx.reply(
      `📊 GROUP STATISTICS\n\n` +
        `👤 Tracked users: ${totalUsers.rows[0].count}\n` +
        `✅ Completed 25 members: ${completedUsers.rows[0].count}\n` +
        `👥 Total recorded invites: ${totalInvites.rows[0].count}`,
    );
  } catch (error) {
    console.log("❌ Stats error:", error.message);
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

    if (!Number.isSafeInteger(userId)) {
      await ctx.reply("❌ Invalid user ID.");
      return;
    }

    const result = await pool.query("SELECT * FROM users WHERE user_id = $1", [
      userId,
    ]);

    if (result.rows.length === 0) {
      await ctx.reply("❌ User not found in the database.");
      return;
    }

    const user = result.rows[0];
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
// LINK DETECTION
// ===============================

const linkRegex =
  /(https?:\/\/[^\s]+|www\.[^\s]+|t\.me\/[^\s]+|telegram\.me\/[^\s]+)/i;

// ===============================
// NEW MEMBERS
// ===============================

bot.on("new_chat_members", async (ctx) => {
  try {
    const newMembers = ctx.message.new_chat_members;
    const inviter = ctx.from;

    if (!inviter) return;

    const realMembers = newMembers.filter((member) => !member.is_bot);

    if (realMembers.length === 0) return;

    const admin = await isAdmin(ctx);

    if (admin) return;

    await getOrCreateUser(inviter);

    let newInviteCount = 0;

    for (const member of realMembers) {
      const existing = await pool.query(
        `
        SELECT *
        FROM invited_members
        WHERE inviter_id = $1
        AND member_id = $2
        `,
        [inviter.id, member.id],
      );

      if (existing.rows.length > 0) continue;

      await pool.query(
        `
        INSERT INTO invited_members (
          inviter_id,
          member_id
        )
        VALUES ($1, $2)
        `,
        [inviter.id, member.id],
      );

      newInviteCount++;
    }

    if (newInviteCount === 0) return;

    const updatedUser = await addInviteCount(inviter, newInviteCount);

    console.log(
      `👥 ${inviter.first_name} invited ` +
        `${newInviteCount} new member(s). ` +
        `Total: ${updatedUser.invited_count}`,
    );

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

    // Only moderate group and supergroup messages
    if (!ctx.chat || !["group", "supergroup"].includes(ctx.chat.type)) {
      return;
    }

    // Ignore messages without a normal sender
    if (!ctx.from) return;

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

    if (admin) return;

    const user = await getOrCreateUser(ctx.from);

    // Check 25 members
    if (user.allowed !== 1) {
      await ctx.deleteMessage();

      const now = Date.now();
      const lastWarning = warningCooldown.get(user.user_id) || 0;

      if (now - lastWarning >= WARNING_COOLDOWN) {
        warningCooldown.set(user.user_id, now);

        const remaining = Math.max(0, REQUIRED_MEMBERS - user.invited_count);

        await ctx.telegram.sendMessage(
          ctx.chat.id,
          `❇️ ለግሩፑ እድገት ሲባል እባኮ መጀመሪያ ቢያንስ 25 ሰው አድ ያድርጉ።\n\n` +
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
// RENDER HTTP HEALTH SERVER
// ===============================

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "text/plain",
    });

    res.end("Group Guard Bot is healthy!");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain",
  });

  res.end("Group Guard Bot is running!");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server listening on port ${PORT}`);
});

// ===============================
// START BOT
// ===============================

async function startBot() {
  try {
    await initDatabase();

    console.log("✅ PostgreSQL database connected");

    await bot.launch();

    console.log("🤖 Group Guard Bot is running...");
  } catch (error) {
    console.error("❌ Bot startup error:", error.message);

    process.exit(1);
  }
}

startBot();

// ===============================
// STOP SAFELY
// ===============================

async function shutdown(signal) {
  console.log(`🛑 Received ${signal}. Shutting down...`);

  bot.stop(signal);

  server.close();

  try {
    await pool.end();
  } catch (error) {
    console.log("Database shutdown error:", error.message);
  }

  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
