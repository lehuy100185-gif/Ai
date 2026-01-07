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

/* ===== INIT ===== */
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

/* ===== FILE HELPERS ===== */
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

/* ===== TOKEN ===== */
function getUsernameFromReq(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return null;
    try {
        return jwt.verify(auth.split(" ")[1], JWT_SECRET).username;
    } catch {
        return null;
    }
}

/* ===== REGISTER ===== */
app.post("/register", async(req, res) => {
    let { username, password } = req.body;
    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();
    const users = readJSON(USERS_FILE);

    if (users[username])
        return res.json({ error: "Tên người dùng đã tồn tại" });

    users[username] = { password: await bcrypt.hash(password, 10) };
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

/* ===== LOGIN ===== */
app.post("/login", async(req, res) => {
    let { username, password } = req.body;
    if (!username || !password)
        return res.json({ error: "Thiếu thông tin" });

    username = username.trim().toLowerCase();
    const users = readJSON(USERS_FILE);

    if (!users[username])
        return res.json({ error: "Sai tài khoản" });

    if (!(await bcrypt.compare(password, users[username].password)))
        return res.json({ error: "Sai mật khẩu" });

    res.json({
        token: jwt.sign({ username }, JWT_SECRET, { expiresIn: "7d" }),
        username
    });
});

/* ===== CHAT ===== */
app.post("/chat", async(req, res) => {
    const { message } = req.body;
    if (!message) return res.json({ reply: "❌ Không có nội dung" });

    const username = getUsernameFromReq(req);

    const messages = [{
        role: "system",
        content: "Bạn là trợ lý AI tiếng Việt. Trả lời ngắn gọn."
    }];

    if (username) {
        const chats = readJSON(CHAT_FILE);
        messages.push(...(chats[username] || []).slice(-10));
    }

    messages.push({ role: "user", content: message });

    let data;
    try {
        const r = await fetch("http://localhost:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "qwen2.5:1.5b",
                messages,
                stream: false
            })
        });
        data = await r.json();
    } catch {
        return res.json({ reply: "❌ Không kết nối Ollama" });
    }

    if (!data || !data.message || !data.message.content)
        return res.json({ reply: "❌ Ollama lỗi" });

    const reply = data.message.content;

    if (username) {
        const chats = readJSON(CHAT_FILE);
        chats[username] = chats[username] || [];
        chats[username].push({ role: "user", content: message }, { role: "assistant", content: reply });
        writeJSON(CHAT_FILE, chats);
    }

    res.json({ reply });
});

/* ===== HISTORY ===== */
app.get("/history", (req, res) => {
    const u = getUsernameFromReq(req);
    if (!u) return res.json([]);
    res.json(readJSON(CHAT_FILE)[u] || []);
});

app.delete("/history", (req, res) => {
    const u = getUsernameFromReq(req);
    if (!u) return res.json({ error: "Chưa đăng nhập" });
    const chats = readJSON(CHAT_FILE);
    delete chats[u];
    writeJSON(CHAT_FILE, chats);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Server chạy http://localhost:${PORT}`);
});