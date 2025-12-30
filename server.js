import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ✅ CSP CHUẨN (không chặn JS, fetch)
app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy", [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' https://api.openai.com"
        ].join("; ")
    );
    next();
});

// Static files
app.use(express.static("public"));

const API_KEY = process.env.OPENAI_API_KEY;
console.log("🔑 API KEY:", API_KEY ? "OK" : "❌ MISSING");

app.post("/chat", async(req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.json({ reply: "❌ Không có nội dung" });

        const response = await fetch(
            "https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: "Luôn trả lời bằng tiếng Việt." },
                        { role: "user", content: message }
                    ],
                    temperature: 0.7
                })
            }
        );

        const data = await response.json();

        if (data.error) {
            console.error("❌ OpenAI:", data.error);
            return res.json({ reply: "❌ " + data.error.message });
        }

        res.json({
            reply: data.choices[0].message.content
        });

    } catch (err) {
        console.error("❌ Server error:", err);
        res.json({ reply: "❌ Server bị lỗi" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});