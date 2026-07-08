export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 设置 Telegram Webhook
    if (url.pathname === "/setWebhook") {
      const webhookUrl = `${url.origin}/webhook`;

      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: env.WEBHOOK_SECRET || undefined
          })
        }
      );

      return new Response(await res.text(), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Telegram 消息入口
    if (url.pathname === "/webhook" && request.method === "POST") {
      if (env.WEBHOOK_SECRET) {
        const token = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (token !== env.WEBHOOK_SECRET) {
          return new Response("Forbidden", { status: 403 });
        }
      }

      const update = await request.json();

      const chatId = update.message?.chat?.id;
      const text = update.message?.text;

      if (!chatId || !text) {
        return new Response("ok");
      }

      await sendTyping(env.BOT_TOKEN, chatId);

      const aiReply = await askAI(env, text);

      await sendTelegramMessage(env.BOT_TOKEN, chatId, aiReply);

      return new Response("ok");
    }

    return new Response("TG AI Bot is running.");
  }
};

async function askAI(env, userText) {
  const res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.AI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages: [
        {
          role: "system",
          content: "你是一个 Telegram 私人 AI 助手。回答要简洁、实用、中文优先。"
        },
        {
          role: "user",
          content: userText
        }
      ],
      temperature: 0.7
    })
  });

  const data = await res.json();

  if (!res.ok) {
    return `AI API 出错：${data.error?.message || JSON.stringify(data)}`;
  }

  return data.choices?.[0]?.message?.content || "AI 没有返回内容。";
}

async function sendTelegramMessage(botToken, chatId, text) {
  // Telegram 单条消息有限制，简单截断
  const safeText = text.slice(0, 3900);

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: safeText
    })
  });
}

async function sendTyping(botToken, chatId) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      action: "typing"
    })
  });
}
