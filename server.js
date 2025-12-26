import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

const API_KEY = process.env.OPENAI_API_KEY;

console.log("🔑 API KEY tồn tại không:", API_KEY ? "CÓ" : "KHÔNG");

app.post("/chat", async(req, res) => {
    try {
        const userMessage = req.body.message;

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: "Luôn trả lời bằng tiếng Việt." },
                    { role: "user", content: userMessage }
                ]
            })
        });

        const data = await response.json();

        // 👉 IN LỖI RA CHO RÕ
        if (data.error) {
            console.error("❌ OpenAI error:", data.error);
            return res.json({ reply: "Lỗi OpenAI: " + data.error.message });
        }

        res.json({ reply: data.choices[0].message.content });

    } catch (err) {
        console.error("❌ Server crash:", err);
        res.json({ reply: "Server bị lỗi." });
    }
});

app.listen(3000, () => {
    console.log("🚀 Mở web tại http://localhost:3000/index.html");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server chạy tại port", PORT);
});