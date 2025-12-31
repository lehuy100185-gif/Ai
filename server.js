import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || "chatgpt-mini-secret";
const USERS_FILE = "./data/users.json";

/* ================= INIT ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= CSP ================= */
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

/* ================= UTILS ================= */
function initUsersFile() {
    if (!fs.existsSync("data")) {
        fs.mkdirSync("data");
    }
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, "[]");
    }
}

function readUsers() {
    initUsersFile();
    return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/* ================= AUTH MIDDLEWARE ================= */
function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: "Chưa đăng nhập" });
    }

    const token = authHeader.split(" ")[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: "Token không hợp lệ" });
    }
}

/* ================= REGISTER ================= */
app.post("/register", async(req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ error: "Thiếu thông tin" });
    }

    const users = readUsers();
    if (users.find(u => u.username === username)) {
        return res.json({ error: "Tài khoản đã tồn tại" });
    }

    const hash = await bcrypt.hash(password, 10);
    users.push({ username, password: hash });
    saveUsers(users);

    res.json({ success: true });
});

/* ================= LOGIN ================= */
app.post("/login", async(req, res) => {
    const { username, password } = req.body;
    const users = readUsers();

    const user = users.find(u => u.username === username);
    if (!user) return res.json({ error: "Sai tài khoản" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ error: "Sai mật khẩu" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
        token,
        username
    });
});

/* ================= CHAT (LOGIN REQUIRED) ================= */
app.post("/chat", auth, async(req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.json({ reply: "❌ Không có nội dung" });
        }

        const response = await fetch(
            "https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${API_KEY}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                            role: "system",
                            content: `
Bạn là trợ lý AI.
Luôn trả lời bằng tiếng Việt.
Trả lời NGẮN GỌN – ĐÚNG TRỌNG TÂM.
Không lan man, không giải thích dài dòng.
Câu hỏi đơn giản → trả lời trực tiếp.
`
                        },
                        {
                            role: "user",
                            content: message
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 300
                })
            }
        );

        const data = await response.json();

        if (data.error) {
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

/* ================= START ================= */
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});