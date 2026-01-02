import express from "express";
import cors from "cors";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "chatgpt-mini-secret";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const USERS_FILE = "./data/users.json";
const CHAT_FILE = "./data/chats.json";

/* ================= INIT ================= */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ================= FILE HELPERS ================= */
function ensureFile(file, initData) {
    if (!fs.existsSync("data")) fs.mkdirSync("data");
    if (!fs.existsSync(file)) fs.writeFileSync(file, initData);
}

function readJSON(file, initData = "{}") {
    ensureFile(file, initData);
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return JSON.parse(initData);
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================= TOKEN ================= */
function getUsernameFromReq(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return null;

    try {
        return jwt.verify(auth.split(" ")[1], JWT_SECRET).username;
    } catch {
        return null;
    }
}

/* ================= REGISTER ================= */
app.post("/register", async(req, res) => {
    let { username, password } = req.body;
    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();
    const users = readJSON(USERS_FILE, "{}");

    if (users[username])
        return res.json({ error: "Tên người dùng đã tồn tại" });

    users[username] = { password: await bcrypt.hash(password, 10) };
    writeJSON(USERS_FILE, users);

    res.json({ success: true });
});

/* ================= LOGIN ================= */
app.post("/login", async(req, res) => {
    let { username, password } = req.body;
    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();
    const users = readJSON(USERS_FILE, "{}");

    if (!users[username])
        return res.json({ error: "Sai tài khoản" });

    if (!(await bcrypt.compare(password, users[username].password)))
        return res.json({ error: "Sai mật khẩu" });

    res.json({
        token: jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" }),
        username
    });
});

/* ================= CHAT (GROQ + CONTEXT) ================= */
app.post("/chat", async(req, res) => {
    try {
        if (!GROQ_API_KEY)
            return res.json({ reply: "❌ Chưa cấu hình GROQ_API_KEY" });

        const { message } = req.body;
        if (!message)
            return res.json({ reply: "❌ Không có nội dung" });

        const username = getUsernameFromReq(req);

        const messages = [{
            role: "system",
            content: "Bạn là trợ lý AI tiếng Việt. Trả lời ngắn gọn, đúng trọng tâm."
        }];

        if (username) {
            const chats = readJSON(CHAT_FILE, "{}");
            const history = chats[username] || [];
            messages.push(...history.slice(-10));
        }

        messages.push({ role: "user", content: message });

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages,
                temperature: 0.2,
                max_tokens: 500
            })
        });

        const data = await response.json();

        if (!data ||
            !data.choices ||
            !data.choices[0] ||
            !data.choices[0].message ||
            !data.choices[0].message.content
        ) {
            console.error("GROQ RAW:", data);
            return res.json({ reply: "❌ Groq không phản hồi đúng" });
        }

        const reply = data.choices[0].message.content;

        if (username) {
            const chats = readJSON(CHAT_FILE, "{}");
            if (!chats[username]) chats[username] = [];

            chats[username].push({ role: "user", content: message }, { role: "assistant", content: reply });

            writeJSON(CHAT_FILE, chats);
        }

        res.json({ reply });

    } catch (err) {
        console.error("SERVER ERROR:", err);
        res.json({ reply: "❌ Server lỗi" });
    }
});

/* ================= HISTORY ================= */
app.get("/history", (req, res) => {
    const username = getUsernameFromReq(req);
    if (!username) return res.json([]);

    res.json(readJSON(CHAT_FILE, "{}")[username] || []);
});

app.delete("/history", (req, res) => {
    const username = getUsernameFromReq(req);
    if (!username) return res.json({ error: "Chưa đăng nhập" });

    const chats = readJSON(CHAT_FILE, "{}");
    delete chats[username];
    writeJSON(CHAT_FILE, chats);

    res.json({ success: true });
});

/* ================= START ================= */
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});