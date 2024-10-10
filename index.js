// env vars
require("dotenv").config();
const { BOT_TOKEN, MISTRAL_API_KEY, CHAT_ID, LOGS_CHAT_ID } = process.env;

// tg bot modules
const {
    Bot,
    MemorySessionStorage,
    GrammyError,
    HttpError,
    InlineKeyboard,
    session,
} = require("grammy");
const { chatMembers } = require("@grammyjs/chat-members");
const {
    conversations,
    createConversation,
} = require("@grammyjs/conversations");
const { hydrate } = require("@grammyjs/hydrate");

// ai module
const { Mistral } = require("@mistralai/mistralai");

// db module

// store/api settings
const client = new Mistral({ apiKey: MISTRAL_API_KEY });
const adapter = new MemorySessionStorage();

const StatisticsService = require("./service/statistics.service");
StatisticsService.initDB();

const bot = new Bot(BOT_TOKEN);
bot.use(hydrate());

bot.use(
    session({
        initial() {
            // return empty object for now
            return {};
        },
    })
);

bot.use(chatMembers(adapter));
bot.use(conversations());

var bufferMsg = null;

async function spamTrigger(conversation, ctx) {
    console.log("trigger");
    // const blowUpTimer = setTimeout(async () => {
    //     if (bufferMsg !== null) {
    //         try {
    //             const message = `этот чел отправил спам и не нажал кнопку ТРИВОГА ТРИВОГА`

    //             await bufferMsg.editText(message, {
    //                 reply_markup: null,
    //             });
    //             await ctx.api.deleteMessage(
    //                 ctx.chat.id,
    //                 ctx.update.message.message_id
    //             );
    //             return;
    //         } catch (error) {
    //             return;
    //             // Ignore errors, since the message may have already been deleted
    //         }
    //         bufferMsg = null;
    //     }
    //     return

    // }, 10000);

    // const response = await conversation.waitFrom(ctx.from.id);

    // const btnContext = response.update.callback_query;
    // if (btnContext) {
    //     try {
    //         await response.answerCallbackQuery();
    //         await ctx.api.deleteMessage(
    //             ctx.chat.id,
    //             btnContext.message.message_id
    //         );
    //         return;
    //         clearTimeout(blowUpTimer);
    //         bufferMsg = null;
    //     } catch (error) {
    //         return;
    //         // Ignore errors, since the message may have already been deleted
    //     }
    //     return;
    // }

    // if (btnContext.from.id === ctx.from.id && bufferMsg !== null) {
    // }

    return;
}

bot.use(createConversation(spamTrigger));

const instruction = `
Ты - классификатор спам-сообщений в телеграм-чате для программистов. Твоя задача - определить, является ли данное сообщение спамом или нет.

Учитывай следующее:
- Чат программистов часто наполнен шутками, мемами и развлекательным контентом, который не должен классифицироваться как спам.
- Основной вид спама в этом чате - это предложения о работе, заработке или наборе людей в различные проекты, особенно если они не содержат явных признаков юмора или иронии.
- Сообщения, выражающие серьезные намерения по трудоустройству или заработку, без элементов юмора или сарказма, следует рассматривать как спам.
- Сообщения, содержащие рекламу, мошенничество или явные призывы к участию в сомнительных схемах заработка, также следует классифицировать как спам.
- Хотя сообщения могут содержать ссылки, не стоит делать акцент на них для классификации. Вместо этого сосредоточься на содержании сообщения — его тоне, намерении и контексте.
- Элементы юмора или иронии, могут указывать на то, что сообщение не является спамом.

Используй следующий формат для ответа:

{
  "is_spam": true/false,
  "confidence": 0-100,
  "reason": "причина принятого решения"
}

Постарайся максимально точно определять спам, минимизируя ложноположительные срабатывания, и учитывай, что ссылки могут не всегда быть признаком спама.
`;

async function checkMessageByAI(message) {
    try {
        const prompt = instruction + "\n" + message;

        const chatResponse = await client.chat.complete({
            model: "mistral-large-latest",
            messages: [
                {
                    role: "user",
                    content:
                        prompt +
                        "Send response in JSON and only JSON format. WITHOUT MARKDOWN FORMATTING. Avoid backticks. Only JSON. If u give me response like that ```json response``` i will kill myself right fucking now",
                },
            ],
            response_format: { type: "json_object" },
        });

        let response = chatResponse?.choices[0]?.message.content;
        if (response.startsWith("```json") && response.endsWith("```")) {
            response = response.slice(7, -3).trim();
        }
        response = JSON.parse(response);
        return response;
    } catch (error) {
        console.error(error);
    }
}

bot.on("message", async (ctx) => {
    await StatisticsService.insertMessage(ctx.from.id, ctx.message.message_id)

    if (
        typeof ctx.message.text == "string" &&
        ctx.message.text === "Секретная фраза для получения статистики у бота"
    ) {
        const { stats, allNotBannedSpammers, allBannedSpammers } =
            await StatisticsService.getStats();
        const totalSpammers =
            allBannedSpammers.length + allNotBannedSpammers.length;
        let message = "```\n";
        message += "| Статистика                     | Значение \n";
        message += "|--------------------------------|----------\n";
        message += `| Всего проверок                 | ${stats.howMuchChecks
            .toString()
            .padStart(4)} \n`;
        message += `| Всего спама                    | ${stats.howMuchSpam
            .toString()
            .padStart(4)} \n`;
        message += `| Всего НЕ спама                 | ${stats.howMuchMiss
            .toString()
            .padStart(4)} \n`;
        message += `| Всего спамеров                 | ${totalSpammers
            .toString()
            .padStart(4)} \n`;
        message += `| Всего забаненных спамеров      | ${allBannedSpammers.length
            .toString()
            .padStart(4)} \n`;
        message += `| Всего НЕзабаненных спамеров    | ${allNotBannedSpammers.length
            .toString()
            .padStart(4)} \n`;
        message += "```";

        await ctx.reply(message, { parse_mode: "Markdown" });
        return;
    }

    if (
        typeof ctx.message.text == "string" &&
        ctx.message.text.length > 50
        // && ctx.chat.id == CHAT_ID
    ) {
        await StatisticsService.incChecks();

        const aiResponse = (await checkMessageByAI(ctx.message.text)) || false;
        console.log(aiResponse);

        if (aiResponse?.confidence >= 75 && aiResponse?.is_spam) {
            await StatisticsService.markUserAsSpammer(ctx.from.id);
            await StatisticsService.incSpam();

            const keyboard = new InlineKeyboard()
                .text("Забанить",`ban_${ctx.from.id}`)
                .text("Простить",`forgive_${ctx.from.id}`);
            // let message = "";
            // message += "message: " + ctx.message.text;
            let message = `<blockquote>>> user: <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a> \n>> message: <span class="tg-spoiler">${ctx.message.text}</span></blockquote> <blockquote expandable>>> confidence: ${aiResponse.confidence}\n>> reason: ${aiResponse.reason}</blockquote>`;

            // await ctx.conversation.enter("spamTrigger");

            await bot.api.sendMessage(LOGS_CHAT_ID, message, {parse_mode: "HTML", reply_markup: keyboard})

            // await bot.api.sendMessage(LOGS_CHAT_ID, message, {
            //     // reply_parameters: { message_id: ctx.msg.message_id },
            //     parse_mode: "Markdown",
            // });
        } else {
            await StatisticsService.incMisses();
        }

        console.log(
            `${aiResponse?.confidency}: ${ctx.from.id}:\n${ctx.message.text}`
        );
    }
});


bot.on("callback_query:data", async (ctx) => {

    const chat_member = await bot.api.getChatMember(CHAT_ID, ctx.from.id)
    if (chat_member.status !== 'administrator') return await ctx.answerCallbackQuery("пошел нахуй"); 

    const btnData = ctx.callbackQuery.data.split("_")
    
    // ahaha start
    const spamLogMsg = ctx.callbackQuery.message.text.split(">>")
    const username = spamLogMsg[1].slice(7, -2);
    const text = spamLogMsg[2].slice(10, -1)
    let message = `<blockquote expandable>>> user: <a href="tg://user?id=${btnData[1]}">${username}</a> \n>> message: <span class="tg-spoiler">${text}</span></blockquote> <blockquote expandable>>> ${spamLogMsg[3]}>>${spamLogMsg[4]}</blockquote>`;
    // ahaha end

    if (btnData[0] === 'forgive') {
        // FUCKING NOTHING 
        message += "Прощен"
    } else if (btnData[0] === 'ban') {
        await ctx.api.banChatMember(CHAT_ID, btnData[1], {until_date: 0, revoke_messages: true})
        const messages = await StatisticsService.getUserMessages(btnData[1])
        messages.forEach(async (message) => {
            await ctx.api.deleteMessage(CHAT_ID, message.message_id)
        })
        message += "Забанен"
    }
    await ctx.callbackQuery.message.editText(message, {
        reply_markup: null,
        parse_mode: "HTML"
    })
    await ctx.answerCallbackQuery(); 
  });

bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}`);

    const e = err.error;
    if (e instanceof GrammyError) {
        console.error(`Error in request: ${e.description}`);
    } else if (e instanceof HttpError) {
        console.error(`Could not connect to Telegram: ${e}`);
    } else {
        console.error(`Unknown error: ${e}`);
    }
});

bot.on("callback_query", async (ctx) => {
    await ctx.answerCallbackQuery();
});

bot.start({
    allowed_updates: ["chat_member", "message", "callback_query"],
});
