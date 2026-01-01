import express from "express";
import cors from "cors";
import fs from "fs";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;
const JWT_SECRET = "chatgpt-mini-secret";

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
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================= REGISTER ================= */
app.post("/register", async(req, res) => {
    let { username, password } = req.body;

    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();

    const users = readJSON(USERS_FILE, "{}");

    if (users[username])
        return res.json({ error: "Tài khoản đã tồn tại" });

    const hash = await bcrypt.hash(password, 10);

    users[username] = { password: hash };
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
    const user = users[username];

    if (!user)
        return res.json({ error: "Sai tài khoản" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
        return res.json({ error: "Sai mật khẩu" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, username });
});

/* ================= CHAT ================= */
app.post("/chat", async(req, res) => {
    try {
        const { message } = req.body;
        if (!message)
            return res.json({ reply: "❌ Không có nội dung" });

        let username = null;
        const auth = req.headers.authorization;

        if (auth && auth.startsWith("Bearer ")) {
            try {
                const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET);
                username = decoded.username;
            } catch {}
        }

        /* ===== CALL OLLAMA ===== */
        const response = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "qwen2.5:1.5b",
                messages: [{
                        role: "system",
                        content: "Bạn là trợ lý AI tiếng Việt. Trả lời ngắn gọn, đúng trọng tâm."
                    },
                    { role: "user", content: message }
                ],
                options: {
                    num_predict: 200,
                    temperature: 0.2
                },
                stream: false
            })
        });

        const data = await response.json();

        if (!data.message || !data.message.content) {
            console.error("OLLAMA RAW:", data);
            return res.json({ reply: "❌ Ollama không trả lời" });
        }

        /* ===== SAVE HISTORY (CHỈ USER) ===== */
        if (username) {
            const chats = readJSON(CHAT_FILE, "{}");
            if (!chats[username]) chats[username] = [];

            chats[username].push({ role: "user", content: message }, { role: "assistant", content: data.message.content });

            writeJSON(CHAT_FILE, chats);
        }

        res.json({ reply: data.message.content });

    } catch (err) {
        console.error("SERVER ERROR:", err);
        res.json({ reply: "❌ Server lỗi" });
    }
});

/* ================= LOAD HISTORY ================= */
app.get("/history", (req, res) => {
    let username = null;
    const auth = req.headers.authorization;

    if (auth && auth.startsWith("Bearer ")) {
        try {
            const decoded = jwt.verify(auth.split(" ")[1], JWT_SECRET);
            username = decoded.username;
        } catch {}
    }

    if (!username) return res.json([]);

    const chats = readJSON(CHAT_FILE, "{}");
    res.json(chats[username] || []);
});

/* ================= START ================= */
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});